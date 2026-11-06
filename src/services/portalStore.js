const crypto = require('crypto');
const { getDb } = require('../db');
const { getSite } = require('./siteStore');

function now() {
  return new Date().toISOString();
}

function createPortal({ slug, name, description = '', theme = 'jingtai', layout = 'topbar', loginRequired = false, loginMessage = '', logoUrl = '' }) {
  const db = getDb();
  const id = crypto.randomUUID();
  const ts = now();
  db.prepare(`
    INSERT INTO portals (id, slug, name, description, logo_url, theme, layout, login_required, login_message, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
  `).run(id, slug, name, description, logoUrl, theme, layout, loginRequired ? 1 : 0, loginMessage, ts, ts);
  return getPortal(id);
}

function getPortal(id) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM portals WHERE id = ?').get(id);
  return row ? normalizePortal(row) : null;
}

function getPortalBySlug(slug) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM portals WHERE slug = ?').get(slug);
  return row ? normalizePortal(row) : null;
}

function listPortals() {
  const db = getDb();
  return db.prepare('SELECT * FROM portals ORDER BY created_at DESC').all().map(normalizePortal);
}

function updatePortal(id, fields) {
  const db = getDb();
  const ts = now();
  const allowed = ['slug', 'name', 'description', 'logo_url', 'theme', 'layout', 'login_required', 'login_message', 'status'];
  const updates = {};
  for (const key of allowed) {
    if (fields[key] !== undefined) updates[key] = fields[key];
  }
  if (Object.keys(updates).length === 0) return getPortal(id);
  const assignments = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
  const values = [...Object.values(updates), ts, id];
  db.prepare(`UPDATE portals SET ${assignments}, updated_at = ? WHERE id = ?`).run(...values);
  return getPortal(id);
}

function deletePortal(id) {
  const db = getDb();
  db.prepare('DELETE FROM portals WHERE id = ?').run(id);
}

function normalizePortal(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description || '',
    logoUrl: row.logo_url || '',
    theme: row.theme || 'jingtai',
    layout: row.layout || 'topbar',
    loginRequired: row.login_required === 1,
    loginMessage: row.login_message || '',
    status: row.status || 'active',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function validateExternalUrl(value) {
  const raw = String(value || '').trim();
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('请填写有效的外部地址');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('外部地址只支持 http 或 https');
  }
  return url.toString();
}

function createPage({ portalId, parentId, siteId, routePath, title, icon = '', isDefault = false, sortOrder = 0, visible = true, linkType = 'site', externalUrl = '', openMode = 'embed' }) {
  const db = getDb();
  const id = crypto.randomUUID();
  const ts = now();
  const pageIcon = String(icon || '').trim() || 'file-text';
  const type = linkType === 'url' ? 'url' : 'site';
  const mode = type === 'url' && openMode === 'blank' ? 'blank' : 'embed';
  const url = type === 'url' ? validateExternalUrl(externalUrl) : '';
  const linkedSite = type === 'site' ? siteId : null;
  if (type === 'site' && !linkedSite) throw new Error('请选择关联的站点');

  if (isDefault) {
    db.prepare('UPDATE portal_pages SET is_default = 0 WHERE portal_id = ?').run(portalId);
  }

  db.prepare(`
    INSERT INTO portal_pages (
      id, portal_id, parent_id, site_id, route_path, title, icon, is_default, sort_order, visible, created_at,
      link_type, external_url, open_mode
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, portalId, parentId || null, linkedSite, routePath, title, pageIcon, isDefault ? 1 : 0, sortOrder, visible ? 1 : 0, ts, type, url, mode);
  return getPage(id);
}

function getPage(id) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM portal_pages WHERE id = ?').get(id);
  return row ? normalizePage(row) : null;
}

function getPageByRoute(portalId, routePath) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM portal_pages WHERE portal_id = ? AND route_path = ?').get(portalId, routePath);
  return row ? normalizePage(row) : null;
}

function getDefaultPage(portalId) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM portal_pages WHERE portal_id = ? AND is_default = 1').get(portalId);
  if (row) return normalizePage(row);
  const first = db.prepare('SELECT * FROM portal_pages WHERE portal_id = ? AND parent_id IS NULL ORDER BY sort_order ASC, created_at ASC LIMIT 1').get(portalId);
  return first ? normalizePage(first) : null;
}

function listPages(portalId) {
  const db = getDb();
  return db.prepare('SELECT * FROM portal_pages WHERE portal_id = ? ORDER BY parent_id, sort_order ASC, created_at ASC')
    .all(portalId).map(normalizePage);
}

function buildPageTree(portalId) {
  const all = listPages(portalId);
  const byId = new Map(all.map((p) => [p.id, { ...p, children: [] }]));
  const roots = [];
  for (const page of all) {
    const node = byId.get(page.id);
    if (page.parentId && byId.has(page.parentId)) {
      byId.get(page.parentId).children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function getSiteInfo(page) {
  const site = getSite(page.siteId);
  if (!site) return null;
  return { id: site.id, originalName: site.originalName, rootPath: site.rootPath, entryFile: site.entryFile, kind: site.kind };
}

function updatePage(id, fields) {
  const db = getDb();
  const allowed = ['parent_id', 'site_id', 'route_path', 'title', 'icon', 'is_default', 'sort_order', 'visible', 'link_type', 'external_url', 'open_mode'];
  const updates = {};
  for (const key of allowed) {
    if (fields[key] !== undefined) updates[key] = fields[key];
  }
  if (Object.keys(updates).length === 0) return getPage(id);

  if (updates.is_default === 1) {
    const row = db.prepare('SELECT portal_id FROM portal_pages WHERE id = ?').get(id);
    if (row) db.prepare('UPDATE portal_pages SET is_default = 0 WHERE portal_id = ?').run(row.portal_id);
  }

  const assignments = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
  db.prepare(`UPDATE portal_pages SET ${assignments} WHERE id = ?`).run(...Object.values(updates), id);
  return getPage(id);
}

function deletePage(id) {
  const db = getDb();
  const page = db.prepare('SELECT * FROM portal_pages WHERE id = ?').get(id);
  if (!page) return;
  db.prepare('UPDATE portal_pages SET parent_id = NULL WHERE parent_id = ?').run(id);
  db.prepare('DELETE FROM portal_pages WHERE id = ?').run(id);
}

function reorderPages(portalId, orderedIds) {
  const db = getDb();
  const stmt = db.prepare('UPDATE portal_pages SET sort_order = ? WHERE id = ? AND portal_id = ?');
  const tx = db.transaction(() => {
    orderedIds.forEach((id, idx) => stmt.run(idx, id, portalId));
  });
  tx();
}

function normalizePage(row) {
  return {
    id: row.id,
    portalId: row.portal_id,
    parentId: row.parent_id || null,
    siteId: row.site_id || null,
    routePath: row.route_path,
    title: row.title,
    icon: row.icon || '',
    isDefault: row.is_default === 1,
    sortOrder: row.sort_order,
    visible: row.visible === 1,
    linkType: row.link_type === 'url' ? 'url' : 'site',
    externalUrl: row.external_url || '',
    openMode: row.open_mode === 'blank' ? 'blank' : 'embed',
    createdAt: row.created_at
  };
}

function validateSlug(slug) {
  if (!slug) throw new Error('URL 标识不能为空');
  if (!/^[a-z0-9][a-z0-9-]{1,49}$/.test(slug)) {
    throw new Error('URL 标识只能包含小写字母、数字和连字符，且以字母/数字开头，长度 2-50');
  }
  const db = getDb();
  const exists = db.prepare('SELECT 1 FROM portals WHERE slug = ?').get(slug);
  if (exists) throw new Error('URL 标识已存在');
  return slug;
}

function validateRoutePath(path) {
  if (!path) throw new Error('页面路径不能为空');
  if (!/^[a-z0-9][a-z0-9-/]*$/.test(path)) {
    throw new Error('路径只能包含小写字母、数字、连字符和斜杠');
  }
  return path.replace(/^\/+|\/+$/g, '');
}

function slugFromTitle(title) {
  const slug = String(title || '').trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return /^[a-z0-9]/.test(slug) ? slug : '';
}

function resolveRoutePath(portalId, raw, { title = '', excludePageId = '' } = {}) {
  const trimmed = String(raw || '').trim();
  if (trimmed) {
    const path = validateRoutePath(trimmed);
    const existing = getPageByRoute(portalId, path);
    if (existing && existing.id !== excludePageId) throw new Error('路径已被使用');
    return path;
  }
  const base = slugFromTitle(title) || `p${crypto.randomBytes(3).toString('hex')}`;
  for (let i = 0; i < 20; i += 1) {
    const path = i === 0 ? base : `${base}-${i + 1}`;
    const existing = getPageByRoute(portalId, path);
    if (!existing || existing.id === excludePageId) return path;
  }
  return `p${crypto.randomBytes(6).toString('hex')}`;
}

module.exports = {
  createPortal,
  getPortal,
  getPortalBySlug,
  listPortals,
  updatePortal,
  deletePortal,
  createPage,
  getPage,
  getPageByRoute,
  getDefaultPage,
  listPages,
  buildPageTree,
  getSiteInfo,
  updatePage,
  deletePage,
  reorderPages,
  validateSlug,
  validateRoutePath,
  resolveRoutePath,
  validateExternalUrl
};
