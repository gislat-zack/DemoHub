const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { assertInside } = require('./fileUtils');

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function dosDateTime(date = new Date()) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

function writeChunk(stream, buf) {
  if (stream.write(buf)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const onDrain = () => {
      cleanup();
      resolve();
    };
    const cleanup = () => {
      stream.off('error', onError);
      stream.off('drain', onDrain);
    };
    stream.once('error', onError);
    stream.once('drain', onDrain);
  });
}

function streamDeflate(filePath, dest) {
  return new Promise((resolve, reject) => {
    let crc = 0xffffffff;
    let uncompressed = 0;
    let compressed = 0;
    let failed = false;
    const input = fs.createReadStream(filePath);
    const deflate = zlib.createDeflateRaw({ level: zlib.constants.Z_DEFAULT_COMPRESSION });

    function fail(error) {
      if (failed) return;
      failed = true;
      input.destroy();
      deflate.destroy();
      reject(error);
    }

    input.on('data', (buf) => {
      uncompressed += buf.length;
      if (uncompressed > 0xffffffff) {
        fail(new Error('单个文件超过 4GB，无法打包'));
        return;
      }
      for (let i = 0; i < buf.length; i += 1) {
        crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
      }
    });

    deflate.on('data', (buf) => {
      compressed += buf.length;
      if (compressed > 0xffffffff) {
        fail(new Error('压缩后超过 4GB，无法打包'));
        return;
      }
      if (!dest.write(buf)) {
        deflate.pause();
        dest.once('drain', () => deflate.resume());
      }
    });

    input.on('error', fail);
    deflate.on('error', fail);
    deflate.on('end', () => {
      if (!failed) {
        resolve({ crc: (crc ^ 0xffffffff) >>> 0, uncompressed, compressed });
      }
    });
    input.pipe(deflate);
  });
}

async function appendEntry(res, state, entry) {
  const name = Buffer.from(entry.name, 'utf8');
  if (name.length > 0xffff) throw new Error('文件路径过长，无法打包');
  const { time, day } = dosDateTime();
  const flags = entry.directory ? 0x0800 : 0x0808;
  const method = entry.directory ? 0 : 8;
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(flags, 6);
  local.writeUInt16LE(method, 8);
  local.writeUInt16LE(time, 10);
  local.writeUInt16LE(day, 12);
  local.writeUInt16LE(name.length, 26);
  const offset = state.offset;
  await writeChunk(res, Buffer.concat([local, name]));
  state.offset += local.length + name.length;

  let crc = 0;
  let compressed = 0;
  let uncompressed = 0;
  if (!entry.directory) {
    const result = await streamDeflate(entry.filePath, res);
    crc = result.crc;
    compressed = result.compressed;
    uncompressed = result.uncompressed;
    state.offset += compressed;
    const descriptor = Buffer.alloc(16);
    descriptor.writeUInt32LE(0x08074b50, 0);
    descriptor.writeUInt32LE(crc, 4);
    descriptor.writeUInt32LE(compressed, 8);
    descriptor.writeUInt32LE(uncompressed, 12);
    await writeChunk(res, descriptor);
    state.offset += descriptor.length;
  }

  state.centrals.push({ name, flags, method, time, day, crc, compressed, uncompressed, offset });
  if (state.centrals.length > 65535 || state.offset > 0xffffffff) {
    throw new Error('打包内容过多，请减少选择后重试');
  }
}

async function collectFiles(rootDir) {
  const files = [];
  async function walk(currentDir) {
    const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const fullPath = path.join(currentDir, entry.name);
      assertInside(rootDir, fullPath);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        const rel = path.relative(rootDir, fullPath).split(path.sep).join('/');
        if (!rel || rel.split('/').includes('..')) continue;
        files.push({ filePath: fullPath, rel });
      }
    }
  }
  await walk(rootDir);
  return files;
}

async function writeZip(dest, folders, onProgress) {
  const report = (progress) => {
    if (onProgress) onProgress(progress);
  };
  report({ done: 0, total: 0, current: '正在统计文件' });
  const planned = [];
  for (const folder of folders) {
    const files = await collectFiles(folder.rootDir);
    if (files.length === 0) {
      planned.push({ name: `${folder.name}/`, directory: true, label: folder.name });
    } else {
      for (const file of files) {
        planned.push({
          name: `${folder.name}/${file.rel}`,
          filePath: file.filePath,
          label: file.rel.split('/').pop()
        });
      }
    }
  }

  const state = { offset: 0, centrals: [] };
  const total = planned.length;
  let done = 0;
  report({ done, total, current: total ? planned[0].label : '' });
  for (const entry of planned) {
    report({ done, total, current: entry.label });
    await appendEntry(dest, state, entry);
    done += 1;
    report({ done, total, current: entry.label });
  }

  report({ done: total, total, current: '正在完成压缩包' });
  const centralOffset = state.offset;
  let centralSize = 0;
  for (const entry of state.centrals) {
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(entry.flags, 8);
    header.writeUInt16LE(entry.method, 10);
    header.writeUInt16LE(entry.time, 12);
    header.writeUInt16LE(entry.day, 14);
    header.writeUInt32LE(entry.crc, 16);
    header.writeUInt32LE(entry.compressed, 20);
    header.writeUInt32LE(entry.uncompressed, 24);
    header.writeUInt16LE(entry.name.length, 28);
    header.writeUInt32LE(entry.offset, 42);
    const record = Buffer.concat([header, entry.name]);
    await writeChunk(dest, record);
    centralSize += record.length;
  }

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(state.centrals.length, 8);
  end.writeUInt16LE(state.centrals.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  await writeChunk(dest, end);
  await new Promise((resolve, reject) => {
    dest.end((error) => (error ? reject(error) : resolve()));
  });
}

module.exports = { writeZip, collectFiles };
