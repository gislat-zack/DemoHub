const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const yauzl = require('yauzl');
const { ensureDir, assertInside } = require('./fileUtils');

const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.ps1', '.sh', '.php', '.jsp', '.asp', '.aspx'
]);

function openZip(zipPath) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true, decodeStrings: true }, (error, zipfile) => {
      if (error) reject(error);
      else resolve(zipfile);
    });
  });
}

function openReadStream(zipfile, entry) {
  return new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (error, stream) => {
      if (error) reject(error);
      else resolve(stream);
    });
  });
}

function isDirectory(entry) {
  return entry.fileName.endsWith('/');
}

function isEncrypted(entry) {
  return (entry.generalPurposeBitFlag & 0x1) !== 0;
}

function isSymlink(entry) {
  const mode = (entry.externalFileAttributes >>> 16) & 0o170000;
  return mode === 0o120000;
}

function isHtmlPath(filePath) {
  const ext = path.posix.extname(String(filePath || '')).toLowerCase();
  return ext === '.html' || ext === '.htm';
}

function normalizeEntryName(entryName, limits, label = 'ZIP') {
  if (!entryName || entryName.includes('\0')) {
    throw new Error(`${label} 中存在非法空路径`);
  }

  const slashName = entryName.replace(/\\/g, '/');
  if (slashName.length > limits.maxPathLength) {
    throw new Error(`${label} 路径过长：${entryName}`);
  }
  if (slashName.startsWith('/') || slashName.startsWith('//')) {
    throw new Error(`${label} 不允许绝对路径：${entryName}`);
  }
  if (/^[a-zA-Z]:\//.test(slashName)) {
    throw new Error(`${label} 不允许盘符路径：${entryName}`);
  }

  const normalized = path.posix.normalize(slashName).replace(/^\/+/, '');
  if (!normalized || normalized === '.' || normalized.startsWith('../') || normalized === '..') {
    throw new Error(`${label} 不允许路径穿越：${entryName}`);
  }

  const parts = normalized.split('/').filter(Boolean);
  if (parts.includes('..') || parts.includes('.')) {
    throw new Error(`${label} 不允许路径穿越：${entryName}`);
  }
  if (parts.length > limits.maxDirectoryDepth) {
    throw new Error(`${label} 目录层级过深：${entryName}`);
  }

  const ext = path.extname(parts[parts.length - 1] || '').toLowerCase();
  if (BLOCKED_EXTENSIONS.has(ext)) {
    throw new Error(`${label} 包含不允许的文件类型：${entryName}`);
  }

  return parts.join('/');
}

function chooseEntryFile(requested, htmlFiles) {
  const list = Array.isArray(htmlFiles) ? htmlFiles.filter(isHtmlPath) : [];
  if (requested) {
    const wanted = String(requested).replace(/\\/g, '/').replace(/^\/+/, '');
    const found = list.find((item) => item.toLowerCase() === wanted.toLowerCase());
    if (!found) {
      throw new Error('主文件不在上传内容中，或不是 .html / .htm 文件');
    }
    return found;
  }

  const rootHtml = list.find((item) => item.toLowerCase() === 'index.html');
  if (rootHtml) return rootHtml;
  const rootHtm = list.find((item) => item.toLowerCase() === 'index.htm');
  if (rootHtm) return rootHtm;
  if (list.length === 1) return list[0];
  if (list.length === 0) {
    throw new Error('没有可用的 HTML 主文件');
  }
  throw new Error('存在多个 HTML 文件，请指定主文件');
}

async function pipeToFile(readStream, targetPath, expectedSize) {
  await ensureDir(path.dirname(targetPath));

  await new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(targetPath, { flags: 'wx' });
    readStream.on('error', reject);
    writeStream.on('error', reject);
    writeStream.on('finish', resolve);
    readStream.pipe(writeStream);
  });

  const stat = await fsp.stat(targetPath);
  if (stat.size !== expectedSize) {
    throw new Error('ZIP 解压文件大小异常');
  }
}

async function extractZip(zipPath, destDir, limits, options = {}) {
  await ensureDir(destDir);

  const zipfile = await openZip(zipPath);
  const seenPaths = new Set();
  const htmlFiles = [];
  let entryCount = 0;
  let fileCount = 0;
  let totalSize = 0;

  return new Promise((resolve, reject) => {
    let finished = false;

    function fail(error) {
      if (finished) return;
      finished = true;
      zipfile.close();
      reject(error);
    }

    async function handleEntry(entry) {
      try {
        if (isEncrypted(entry)) {
          throw new Error(`ZIP 包含加密文件：${entry.fileName}`);
        }
        if (isSymlink(entry)) {
          throw new Error(`ZIP 包含软链接：${entry.fileName}`);
        }

        const normalized = normalizeEntryName(entry.fileName, limits);
        const targetPath = path.resolve(destDir, ...normalized.split('/'));
        assertInside(destDir, targetPath);

        entryCount += 1;
        if (entryCount > limits.maxEntries) {
          throw new Error(`ZIP 文件数量超过限制：${limits.maxEntries}`);
        }

        if (isDirectory(entry)) {
          await ensureDir(targetPath);
          zipfile.readEntry();
          return;
        }

        if (isHtmlPath(normalized)) {
          htmlFiles.push(normalized);
        }

        if (seenPaths.has(normalized.toLowerCase())) {
          throw new Error(`ZIP 包含重复路径：${entry.fileName}`);
        }
        seenPaths.add(normalized.toLowerCase());

        if (entry.uncompressedSize > limits.maxSingleFileBytes) {
          throw new Error(`ZIP 单文件超过限制：${entry.fileName}`);
        }

        totalSize += entry.uncompressedSize;
        if (totalSize > limits.maxExtractedBytes) {
          throw new Error(`ZIP 解压后总大小超过限制：${limits.maxExtractedBytes}`);
        }

        const readStream = await openReadStream(zipfile, entry);
        await pipeToFile(readStream, targetPath, entry.uncompressedSize);
        fileCount += 1;
        zipfile.readEntry();
      } catch (error) {
        fail(error);
      }
    }

    zipfile.on('entry', handleEntry);
    zipfile.on('end', () => {
      if (finished) return;
      finished = true;
      try {
        const entryFile = chooseEntryFile(options.entryFile, htmlFiles);
        resolve({ fileCount, sizeBytes: totalSize, entryFile });
      } catch (error) {
        reject(error);
      }
    });
    zipfile.on('error', fail);
    zipfile.readEntry();
  });
}

module.exports = {
  BLOCKED_EXTENSIONS,
  extractZip,
  normalizeEntryName,
  chooseEntryFile,
  isHtmlPath
};
