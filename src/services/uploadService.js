const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const config = require('../config');
const { createSite } = require('./siteStore');
const { ensureDir, removeDir, getDirectoryStats, assertInside } = require('./fileUtils');
const { extractZip, normalizeEntryName, chooseEntryFile, isHtmlPath } = require('./zipExtractor');
const { extractMhtml } = require('./mhtmlExtractor');
const { normalizeUploadedFilename } = require('./filenameUtils');
const { kindFromFilename, isAssetKind } = require('./fileTypes');

const upload = multer({
  dest: config.uploadsDir,
  limits: {
    fileSize: config.maxUploadBytes,
    files: config.zipLimits.maxEntries
  }
});

function getKind(filename) {
  const kind = kindFromFilename(filename);
  if (!kind) {
    throw new Error('只支持上传 HTML、ZIP、MHTML、图片、SVG 或 PDF');
  }
  return kind;
}

function createSiteId() {
  return crypto.randomUUID();
}

function cleanDisplayName(name, fallback) {
  const cleaned = normalizeUploadedFilename(name).replace(/[\u0000-\u001f]/g, '').trim();
  return (cleaned || fallback).slice(0, 180);
}

async function removeTempFiles(files) {
  await Promise.all((files || []).filter(Boolean).map((file) => fs.rm(file.path, { force: true })));
}

async function processHtmlUpload(file, siteDir) {
  await ensureDir(siteDir);
  const target = path.join(siteDir, 'index.html');
  await fs.copyFile(file.path, target);
  return { entryFile: 'index.html' };
}

async function processZipUpload(file, siteDir, entryFile) {
  return extractZip(file.path, siteDir, config.zipLimits, { entryFile });
}

async function processMhtmlUpload(file, siteDir) {
  return extractMhtml(file.path, siteDir, config.zipLimits);
}

async function processAssetUpload(file, siteDir, filename) {
  const safeName = normalizeEntryName(path.basename(String(filename || '').replace(/\\/g, '/')), config.zipLimits, '文件');
  await ensureDir(siteDir);
  await fs.copyFile(file.path, path.join(siteDir, ...safeName.split('/')));
  return { entryFile: safeName, fileCount: 1, sizeBytes: file.size };
}

function folderRelativePath(originalName) {
  const segments = String(originalName || '').replace(/\\/g, '/').split('/').filter(Boolean)
    .map((segment) => normalizeUploadedFilename(segment));
  if (segments.length === 0) {
    throw new Error('文件夹中存在空路径');
  }
  return normalizeEntryName(segments.join('/'), config.zipLimits, '文件夹');
}

async function processFolderUpload(files, siteDir, entryFile) {
  if (!files.length) {
    throw new Error('请选择要上传的文件夹');
  }
  if (files.length > config.zipLimits.maxEntries) {
    throw new Error(`文件数量超过限制：${config.zipLimits.maxEntries}`);
  }

  let totalSize = 0;
  const saved = [];
  const seen = new Set();
  for (const file of files) {
    if (file.size > config.zipLimits.maxSingleFileBytes) {
      throw new Error(`单个文件超过限制：${file.originalname}`);
    }
    totalSize += file.size;
    if (totalSize > config.maxUploadBytes) {
      throw new Error('文件夹总大小超过 50MB');
    }
    const relativePath = folderRelativePath(file.relativePath || file.originalname);
    if (seen.has(relativePath.toLowerCase())) {
      throw new Error(`文件夹包含重复路径：${relativePath}`);
    }
    seen.add(relativePath.toLowerCase());
    saved.push({ file, relativePath });
  }

  await ensureDir(siteDir);
  for (const item of saved) {
    const target = path.resolve(siteDir, ...item.relativePath.split('/'));
    assertInside(siteDir, target);
    await ensureDir(path.dirname(target));
    await fs.copyFile(item.file.path, target);
  }

  const htmlFiles = saved.map((item) => item.relativePath).filter(isHtmlPath);
  return {
    entryFile: chooseEntryFile(entryFile, htmlFiles),
    fileCount: saved.length,
    sizeBytes: totalSize
  };
}

async function saveSite(siteDir, meta, options) {
  const directoryStats = await getDirectoryStats(siteDir);
  createSite({
    id: meta.siteId,
    originalName: meta.originalName,
    kind: meta.kind,
    rootPath: siteDir,
    entryFile: meta.entryFile,
    folderId: options.folderId || null,
    accessDays: options.accessDays != null ? Number(options.accessDays) : 365,
    sizeBytes: directoryStats.sizeBytes,
    fileCount: directoryStats.fileCount
  });

  return {
    id: meta.siteId,
    kind: meta.kind,
    originalName: meta.originalName,
    sizeBytes: directoryStats.sizeBytes,
    fileCount: directoryStats.fileCount
  };
}

async function handleUploadedFile(file, options = {}) {
  if (!file) {
    throw new Error('请选择要上传的文件');
  }

  const originalName = cleanDisplayName(file.originalname, '未命名文件');
  const kind = getKind(originalName);
  const siteId = createSiteId();
  const siteDir = path.join(config.sitesDir, siteId);

  try {
    let entryFile = 'index.html';
    if (kind === 'html') {
      ({ entryFile } = await processHtmlUpload(file, siteDir));
    } else if (kind === 'zip') {
      ({ entryFile } = await processZipUpload(file, siteDir, options.entryFile));
    } else if (kind === 'mhtml') {
      ({ entryFile } = await processMhtmlUpload(file, siteDir));
    } else if (isAssetKind(kind)) {
      ({ entryFile } = await processAssetUpload(file, siteDir, originalName));
    } else {
      throw new Error('不支持的文件类型');
    }

    return await saveSite(siteDir, { siteId, originalName, kind, entryFile }, options);
  } catch (error) {
    await removeDir(siteDir);
    throw error;
  } finally {
    await removeTempFiles([file]);
  }
}

async function handleFolderUpload(files, options = {}) {
  const list = Array.isArray(files) ? files.filter(Boolean) : [];
  if (list.length === 0) {
    throw new Error('请选择要上传的文件夹');
  }

  const siteId = createSiteId();
  const siteDir = path.join(config.sitesDir, siteId);
  const originalName = cleanDisplayName(options.folderName, '文件夹');

  try {
    const result = await processFolderUpload(list, siteDir, options.entryFile);
    return await saveSite(siteDir, {
      siteId,
      originalName,
      kind: 'folder',
      entryFile: result.entryFile
    }, options);
  } catch (error) {
    await removeDir(siteDir);
    throw error;
  } finally {
    await removeTempFiles(list);
  }
}

module.exports = {
  upload,
  handleUploadedFile,
  handleFolderUpload
};
