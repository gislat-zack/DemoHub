const fs = require('fs/promises');
const path = require('path');

const MAX_DEPTH = 10;
const MAX_ENTRIES = 500;

let entryCount = 0;

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

async function buildTree(dirPath, depth, parentPath = '') {
  if (depth > MAX_DEPTH || entryCount >= MAX_ENTRIES) return [];

  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const result = [];

  for (const entry of entries) {
    if (entryCount >= MAX_ENTRIES) break;
    entryCount += 1;

    const fullPath = path.join(dirPath, entry.name);
    const relativePath = parentPath ? `${parentPath}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      const children = await buildTree(fullPath, depth + 1, relativePath);
      result.push({
        name: entry.name,
        path: relativePath,
        type: 'dir',
        children
      });
    } else if (entry.isFile()) {
      let size = 0;
      try {
        const stat = await fs.stat(fullPath);
        size = stat.size;
      } catch (_e) {}
      result.push({
        name: entry.name,
        path: relativePath,
        type: 'file',
        size,
        sizeText: formatBytes(size)
      });
    }
  }

  // Sort: dirs first, then files, alphabetical
  result.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return result;
}

async function getDirectoryTree(rootPath) {
  entryCount = 0;
  return buildTree(rootPath, 0);
}

module.exports = { getDirectoryTree };
