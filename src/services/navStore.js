const crypto = require('crypto');
const { getDb } = require('../db');
const { resolveFavicon } = require('./favicon');

function nowIso() {
  return new Date().toISOString();
}

function normalizeGroupName(name) {
  const normalized = String(name || '').trim();
  if (normalized.length < 1 || normalized.length > 40) {
    throw new Error('分组名称长度需为 1-40 个字符');
  }
  return normalized;
}

function normalizeLinkName(name) {
  const normalized = String(name || '').trim();
  if (normalized.length < 1 || normalized.length > 60) {
    throw new Error('名称长度需为 1-60 个字符');
  }
  return normalized;
}

function normalizeUrl(url) {
  const normalized = String(url || '').trim();
  if (!normalized) {
    throw new Error('请填写网址');
  }
  if (normalized.length > 500) {
    throw new Error('网址过长');
  }
  if (!/^https?:\/\//i.test(normalized)) {
    return `https://${normalized}`;
  }
  return normalized;
}

function normalizeIcon(icon) {
  return String(icon || '').trim().slice(0, 500);
}

function normalizeTextIcon(icon) {
  const value = String(icon || '').trim();
  if (!value) return '';
  if (value.length > 12) {
    throw new Error('文字图标最多 12 个字符');
  }
  if (/^https?:\/\//i.test(value) || /^[a-zA-Z]:[\\/]/.test(value) || value.includes('/') || value.includes('\\')) {
    throw new Error('图标请填写文字或上传图片，不要填写路径');
  }
  return value;
}

function normalizeStoredIcon(icon) {
  const value = String(icon || '').trim();
  if (/^\/nav-icon\/[a-zA-Z0-9.-]+$/.test(value)) return value;
  return normalizeTextIcon(value);
}

const DEFAULT_GROUP_NAME = '默认';

function ensureDefaultGroup() {
  const existing = listGroups();
  if (existing.length > 0) return existing[0];
  return createGroup({ name: DEFAULT_GROUP_NAME });
}

/* ========== Groups ========== */

function createGroup({ name }) {
  const timestamp = nowIso();
  const db = getDb();
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM nav_groups').get().m;
  const group = {
    id: crypto.randomUUID(),
    name: normalizeGroupName(name),
    sortOrder: maxOrder + 1,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  db.prepare(`
    INSERT INTO nav_groups (id, name, sort_order, created_at, updated_at)
    VALUES (@id, @name, @sortOrder, @createdAt, @updatedAt)
  `).run(group);

  return group;
}

function listGroups() {
  return getDb().prepare(`
    SELECT
      g.id,
      g.name,
      g.sort_order AS sortOrder,
      g.created_at AS createdAt,
      g.updated_at AS updatedAt,
      COUNT(l.id) AS linkCount
    FROM nav_groups g
    LEFT JOIN nav_links l ON l.group_id = g.id
    GROUP BY g.id
    ORDER BY g.sort_order ASC, g.created_at ASC
  `).all();
}

function getGroup(id) {
  if (!id) return null;
  return getDb().prepare(`
    SELECT id, name, sort_order AS sortOrder, created_at AS createdAt, updated_at AS updatedAt
    FROM nav_groups
    WHERE id = ?
  `).get(id);
}

function updateGroup(id, { name }) {
  const group = getGroup(id);
  if (!group) throw new Error('分组不存在');
  getDb().prepare(`
    UPDATE nav_groups SET name = ?, updated_at = ? WHERE id = ?
  `).run(normalizeGroupName(name), nowIso(), id);
}

function deleteGroup(id) {
  if (!getGroup(id)) throw new Error('分组不存在');
  const db = getDb();
  const run = db.transaction(() => {
    let target = db.prepare(`
      SELECT id FROM nav_groups
      WHERE id != ? AND name = '未分组'
      ORDER BY sort_order ASC, created_at ASC
      LIMIT 1
    `).get(id);
    if (!target) {
      target = db.prepare(`
        SELECT id FROM nav_groups
        WHERE id != ?
        ORDER BY sort_order ASC, created_at ASC
        LIMIT 1
      `).get(id);
    }
    const targetId = target ? target.id : createGroup({ name: '未分组' }).id;
    db.prepare('UPDATE nav_links SET group_id = ?, updated_at = ? WHERE group_id = ?')
      .run(targetId, nowIso(), id);
    db.prepare('DELETE FROM nav_groups WHERE id = ?').run(id);
  });
  run();
}

function reorderGroups(orderedIds) {
  const ids = Array.isArray(orderedIds) ? orderedIds.filter(Boolean) : [];
  if (ids.length === 0) return;
  const db = getDb();
  const stmt = db.prepare('UPDATE nav_groups SET sort_order = ?, updated_at = ? WHERE id = ?');
  const ts = nowIso();
  const run = db.transaction(() => {
    ids.forEach((id, index) => stmt.run(index, ts, id));
  });
  run();
}

/* ========== Links ========== */

async function createLink({ groupId, name, url, icon }) {
  const group = groupId ? getGroup(groupId) : ensureDefaultGroup();
  if (!group) throw new Error('分组不存在');
  const timestamp = nowIso();
  const db = getDb();
  const normalizedUrl = normalizeUrl(url);
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM nav_links').get().m;
  const link = {
    id: crypto.randomUUID(),
    groupId: group.id,
    name: normalizeLinkName(name),
    url: normalizedUrl,
    icon: icon ? normalizeStoredIcon(icon) : normalizeIcon(await resolveFavicon(normalizedUrl)),
    sortOrder: maxOrder + 1,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  db.prepare(`
    INSERT INTO nav_links (id, group_id, name, url, icon, sort_order, created_at, updated_at)
    VALUES (@id, @groupId, @name, @url, @icon, @sortOrder, @createdAt, @updatedAt)
  `).run(link);

  return link;
}

function listLinks(groupId) {
  if (!groupId) {
    return getDb().prepare(`
      SELECT id, group_id AS groupId, name, url, icon, sort_order AS sortOrder, created_at AS createdAt, updated_at AS updatedAt
      FROM nav_links
      ORDER BY sort_order ASC, created_at ASC
    `).all();
  }
  return getDb().prepare(`
    SELECT id, group_id AS groupId, name, url, icon, sort_order AS sortOrder, created_at AS createdAt, updated_at AS updatedAt
    FROM nav_links
    WHERE group_id = ?
    ORDER BY sort_order ASC, created_at ASC
  `).all(groupId);
}

function listAllLinksWithGroups() {
  return getDb().prepare(`
    SELECT
      l.id,
      l.group_id AS groupId,
      l.name,
      l.url,
      l.icon,
      l.sort_order AS sortOrder,
      l.created_at AS createdAt,
      l.updated_at AS updatedAt,
      g.name AS groupName
    FROM nav_links l
    LEFT JOIN nav_groups g ON g.id = l.group_id
    ORDER BY l.sort_order ASC, l.created_at ASC
  `).all();
}

function getLink(id) {
  if (!id) return null;
  return getDb().prepare(`
    SELECT id, group_id AS groupId, name, url, icon, sort_order AS sortOrder, created_at AS createdAt, updated_at AS updatedAt
    FROM nav_links
    WHERE id = ?
  `).get(id);
}

async function updateLink(id, { name, url, icon, groupId }) {
  const link = getLink(id);
  if (!link) throw new Error('网址不存在');
  let targetGroupId = link.groupId;
  if (groupId !== undefined && groupId !== null && groupId !== '') {
    if (!getGroup(groupId)) throw new Error('分组不存在');
    targetGroupId = groupId;
  }
  const normalizedUrl = normalizeUrl(url);
  let nextIcon = link.icon;
  if (icon === '') {
    nextIcon = normalizeIcon(await resolveFavicon(normalizedUrl));
  } else if (icon !== undefined && icon !== null) {
    nextIcon = normalizeStoredIcon(icon);
  }
  getDb().prepare(`
    UPDATE nav_links
    SET name = ?, url = ?, icon = ?, group_id = ?, updated_at = ?
    WHERE id = ?
  `).run(
    normalizeLinkName(name),
    normalizedUrl,
    nextIcon,
    targetGroupId,
    nowIso(),
    id
  );
  return { previousIcon: link.icon, icon: nextIcon };
}

async function fillMissingIcons() {
  const rows = getDb().prepare(`SELECT id, url FROM nav_links WHERE icon = ''`).all();
  for (const row of rows) {
    const icon = normalizeIcon(await resolveFavicon(row.url));
    if (!icon) continue;
    getDb().prepare(`UPDATE nav_links SET icon = ?, updated_at = ? WHERE id = ? AND icon = ''`)
      .run(icon, nowIso(), row.id);
  }
}

function deleteLink(id) {
  const link = getLink(id);
  if (!link) throw new Error('网址不存在');
  getDb().prepare('DELETE FROM nav_links WHERE id = ?').run(id);
  return link;
}

function reorderLinks(orderedIds) {
  const ids = Array.isArray(orderedIds) ? orderedIds.filter(Boolean) : [];
  if (ids.length === 0) return;
  const db = getDb();
  const ts = nowIso();
  const stmt = db.prepare('UPDATE nav_links SET sort_order = ?, updated_at = ? WHERE id = ?');
  const run = db.transaction(() => {
    ids.forEach((id, index) => stmt.run(index, ts, id));
  });
  run();
}

module.exports = {
  createGroup,
  listGroups,
  getGroup,
  updateGroup,
  deleteGroup,
  reorderGroups,
  createLink,
  listLinks,
  listAllLinksWithGroups,
  getLink,
  updateLink,
  deleteLink,
  reorderLinks,
  fillMissingIcons
};
