const crypto = require('crypto');
const { getDb } = require('../db');

function nowIso() {
  return new Date().toISOString();
}

function normalizeFolderName(name) {
  const normalized = String(name || '').trim();
  if (normalized.length < 1 || normalized.length > 80) {
    throw new Error('文件夹名称长度需为 1-80 个字符');
  }
  return normalized;
}

function createFolder({ name, description = '' }) {
  const timestamp = nowIso();
  const folder = {
    id: crypto.randomUUID(),
    name: normalizeFolderName(name),
    description: String(description || '').trim(),
    createdAt: timestamp,
    updatedAt: timestamp
  };

  try {
    getDb().prepare(`
      INSERT INTO folders (id, name, description, created_at, updated_at)
      VALUES (@id, @name, @description, @createdAt, @updatedAt)
    `).run(folder);
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new Error('文件夹名称已存在');
    }
    throw error;
  }

  return folder;
}

function listFolders() {
  return getDb().prepare(`
    SELECT id, name, description, created_at AS createdAt, updated_at AS updatedAt
    FROM folders
    ORDER BY name COLLATE NOCASE ASC
  `).all();
}

function listFoldersWithCounts() {
  return getDb().prepare(`
    SELECT
      folders.id,
      folders.name,
      folders.description,
      folders.created_at AS createdAt,
      folders.updated_at AS updatedAt,
      COUNT(sites.id) AS siteCount
    FROM folders
    LEFT JOIN sites ON sites.folder_id = folders.id
    GROUP BY folders.id
    ORDER BY folders.name COLLATE NOCASE ASC
  `).all();
}

function getFolder(id) {
  if (!id) return null;
  return getDb().prepare(`
    SELECT id, name, description, created_at AS createdAt, updated_at AS updatedAt
    FROM folders
    WHERE id = ?
  `).get(id);
}

function updateFolder(id, { name, description = '' }) {
  const folder = getFolder(id);
  if (!folder) {
    throw new Error('文件夹不存在');
  }

  try {
    getDb().prepare(`
      UPDATE folders
      SET name = ?, description = ?, updated_at = ?
      WHERE id = ?
    `).run(normalizeFolderName(name), String(description || '').trim(), nowIso(), id);
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new Error('文件夹名称已存在');
    }
    throw error;
  }
}

function deleteFolder(id) {
  const folder = getFolder(id);
  if (!folder) {
    throw new Error('文件夹不存在');
  }

  const run = getDb().transaction(() => {
    getDb().prepare('UPDATE sites SET folder_id = NULL, updated_at = ? WHERE folder_id = ?')
      .run(nowIso(), id);
    getDb().prepare('DELETE FROM folders WHERE id = ?').run(id);
  });

  run();
}

function folderExists(id) {
  return Boolean(getFolder(id));
}

module.exports = {
  createFolder,
  listFolders,
  listFoldersWithCounts,
  getFolder,
  updateFolder,
  deleteFolder,
  folderExists
};
