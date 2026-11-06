const { getDb } = require('../db');
const { normalizeUploadedFilename } = require('./filenameUtils');

function nowIso() {
  return new Date().toISOString();
}

function createSite(site) {
  const now = nowIso();
  getDb().prepare(`
    INSERT INTO sites (
      id, original_name, kind, root_path, entry_file,
      size_bytes, file_count, folder_id, access_days, created_at, updated_at
    ) VALUES (
      @id, @originalName, @kind, @rootPath, @entryFile,
      @sizeBytes, @fileCount, @folderId, @accessDays, @createdAt, @updatedAt
    )
  `).run({
    id: site.id,
    originalName: site.originalName,
    kind: site.kind,
    rootPath: site.rootPath,
    entryFile: site.entryFile || 'index.html',
    sizeBytes: site.sizeBytes || 0,
    fileCount: site.fileCount || 1,
    folderId: site.folderId || null,
    accessDays: site.accessDays != null ? site.accessDays : 365,
    createdAt: now,
    updatedAt: now
  });
}

function normalizeSite(site) {
  if (!site) return site;
  return {
    ...site,
    originalName: normalizeUploadedFilename(site.originalName)
  };
}

function buildSiteQuery(options = {}) {
  let where = '';
  const params = [];

  if (options.folderId) {
    where = 'WHERE sites.folder_id = ?';
    params.push(options.folderId);
  } else if (options.ungrouped) {
    where = 'WHERE sites.folder_id IS NULL';
  }

  return {
    sql: `
      SELECT
        sites.id,
        sites.original_name AS originalName,
        sites.kind,
        sites.root_path AS rootPath,
        sites.entry_file AS entryFile,
        sites.size_bytes AS sizeBytes,
        sites.file_count AS fileCount,
        sites.folder_id AS folderId,
        folders.name AS folderName,
        sites.visit_count AS visitCount,
        sites.last_visited_at AS lastVisitedAt,
        sites.access_days AS accessDays,
        sites.created_at AS createdAt,
        sites.updated_at AS updatedAt
      FROM sites
      LEFT JOIN folders ON folders.id = sites.folder_id
      ${where}
      ORDER BY sites.created_at DESC
    `,
    params
  };
}

function listSites(options = {}) {
  const query = buildSiteQuery(options);
  return getDb().prepare(query.sql).all(...query.params).map(normalizeSite);
}

function countSites() {
  return getDb().prepare('SELECT COUNT(*) AS count FROM sites').get().count;
}

function countUngroupedSites() {
  return getDb().prepare('SELECT COUNT(*) AS count FROM sites WHERE folder_id IS NULL').get().count;
}

function getSite(id) {
  const site = getDb().prepare(`
    SELECT
      sites.id,
      sites.original_name AS originalName,
      sites.kind,
      sites.root_path AS rootPath,
      sites.entry_file AS entryFile,
      sites.size_bytes AS sizeBytes,
      sites.file_count AS fileCount,
      sites.folder_id AS folderId,
      folders.name AS folderName,
      sites.visit_count AS visitCount,
      sites.last_visited_at AS lastVisitedAt,
      sites.access_days AS accessDays,
      sites.created_at AS createdAt,
      sites.updated_at AS updatedAt
    FROM sites
    LEFT JOIN folders ON folders.id = sites.folder_id
    WHERE sites.id = ?
  `).get(id);

  return normalizeSite(site);
}

function moveSiteToFolder(siteId, folderId) {
  getDb().prepare('UPDATE sites SET folder_id = ?, updated_at = ? WHERE id = ?')
    .run(folderId || null, nowIso(), siteId);
}

function deleteSite(id) {
  return getDb().prepare('DELETE FROM sites WHERE id = ?').run(id);
}

function incrementVisitCount(siteId) {
  const now = nowIso();
  getDb().prepare('UPDATE sites SET visit_count = visit_count + 1, last_visited_at = ? WHERE id = ?')
    .run(now, siteId);
}

function updateAccessDays(siteId, accessDays) {
  getDb().prepare('UPDATE sites SET access_days = ?, updated_at = ? WHERE id = ?')
    .run(accessDays, nowIso(), siteId);
}

function logVisit(siteId) {
  const crypto = require('crypto');
  const id = crypto.randomUUID();
  getDb().prepare('INSERT INTO visits (id, site_id, visited_at) VALUES (?, ?, ?)')
    .run(id, siteId, nowIso());
}

function getVisitStats() {
  const db = getDb();

  // 近30天每日上传数
  const dailyUploads = db.prepare(`
    SELECT date(created_at) AS day, COUNT(*) AS count
    FROM sites
    WHERE created_at >= date('now', '-30 days')
    GROUP BY date(created_at)
    ORDER BY day ASC
  `).all();

  // 填充缺失日期为0
  const uploadMap = {};
  dailyUploads.forEach(r => { uploadMap[r.day] = r.count; });
  const uploadTrend = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    uploadTrend.push({ day: key, count: uploadMap[key] || 0 });
  }

  // 站点访问排行 TOP10
  const visitRank = db.prepare(`
    SELECT original_name AS name, visit_count AS visitCount
    FROM sites
    WHERE visit_count > 0
    ORDER BY visit_count DESC
    LIMIT 10
  `).all().map((row) => ({
    ...row,
    name: normalizeUploadedFilename(row.name)
  }));

  // 文件类型分布
  const typeDistribution = db.prepare(`
    SELECT kind, COUNT(*) AS count
    FROM sites
    GROUP BY kind
  `).all();

  // 存储占用 TOP10
  const storageTop = db.prepare(`
    SELECT original_name AS name, size_bytes AS sizeBytes
    FROM sites
    WHERE size_bytes > 0
    ORDER BY size_bytes DESC
    LIMIT 10
  `).all().map((row) => ({
    ...row,
    name: normalizeUploadedFilename(row.name)
  }));

  return { uploadTrend, visitRank, typeDistribution, storageTop };
}

module.exports = {
  createSite,
  listSites,
  countSites,
  countUngroupedSites,
  getSite,
  moveSiteToFolder,
  deleteSite,
  incrementVisitCount,
  updateAccessDays,
  logVisit,
  getVisitStats
};
