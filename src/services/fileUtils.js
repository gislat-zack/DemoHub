const fsPromises = require('fs/promises');
const fs = require('fs');
const path = require('path');

async function ensureDir(dirPath) {
  await fsPromises.mkdir(dirPath, { recursive: true });
}

async function removeDir(dirPath) {
  await fsPromises.rm(dirPath, { recursive: true, force: true });
}

function assertInside(parentDir, targetPath) {
  const parent = path.resolve(parentDir);
  const target = path.resolve(targetPath);
  if (target !== parent && !target.startsWith(parent + path.sep)) {
    throw new Error('目标路径不在允许目录内');
  }
}

async function getDirectoryStats(rootDir) {
  let fileCount = 0;
  let sizeBytes = 0;

  async function walk(currentDir) {
    const entries = await fsPromises.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
      } else if (entry.isFile()) {
        const stat = await fsPromises.stat(entryPath);
        fileCount += 1;
        sizeBytes += stat.size;
      }
    }
  }

  await walk(rootDir);
  return { fileCount, sizeBytes };
}

function getDiskStats(dirPath) {
  return new Promise((resolve, reject) => {
    fs.statfs(dirPath, (err, stats) => {
      if (err) { reject(err); return; }
      const totalBytes = stats.blocks * stats.bsize;
      const freeBytes = stats.bfree * stats.bsize;
      const usedBytes = totalBytes - freeBytes;
      const usedPercent = totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0;
      const parsed = path.parse(path.resolve(dirPath));
      const volume = parsed.root || '/';
      resolve({ totalBytes, freeBytes, usedBytes, usedPercent, volume });
    });
  });
}

module.exports = {
  ensureDir,
  removeDir,
  assertInside,
  getDirectoryStats,
  getDiskStats
};
