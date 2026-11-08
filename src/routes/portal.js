const express = require('express');
const path = require('path');
const fsSync = require('fs');
const crypto = require('crypto');
const config = require('../config');
const portalStore = require('../services/portalStore');
const settingsStore = require('../services/settingsStore');
const { getDb } = require('../db');
const { authenticateUser, createSession, setSessionCookie } = require('../services/authService');

const router = express.Router();

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const PORTAL_ACCENTS = ['jingtai', 'lotus', 'vivid', 'newyear', 'soe', 'ink', 'fashion', 'china', 'youth'];
const LEGACY_ACCENTS = {
  blue: 'jingtai', light: 'jingtai', white: 'jingtai',
  red: 'vivid', orange: 'vivid',
  green: 'lotus',
  cyan: 'fashion', purple: 'fashion',
  dark: 'ink'
};

function portalThemeClass(theme) {
  const mapped = LEGACY_ACCENTS[theme] || theme;
  const accent = PORTAL_ACCENTS.includes(mapped) ? mapped : 'jingtai';
  return `portal-light portal-accent-${accent}`;
}

function resolvePortalLogo(portal) {
  if (portal.logoUrl) return portal.logoUrl;
  const settings = settingsStore.getAll();
  const large = settings.logo_url || '';
  const small = settings.logo_small_url || '';
  if (settings.logo_display !== 'small' && large) return large;
  return small || large || '';
}

function portalMark(layout) {
  const bar = layout === 'sidebar' ? '<path d="M9 4v16"/>' : '<path d="M3 9h18"/>';
  return `<svg class="portal-mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/>${bar}</svg>`;
}

function portalBrandHtml(portal, logoUrl, withFallback) {
  const logoHtml = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(portal.name)}" class="portal-brand-logo">`
    : '';
  const fallbackHtml = withFallback && !logoUrl
    ? `<span class="portal-brand-fallback">${portalMark(portal.layout)}</span>`
    : '';
  const nameHtml = logoUrl
    ? ''
    : `<span class="portal-brand-name">${escapeHtml(portal.name)}</span>`;
  return `<a href="/portal/${portal.slug}" class="portal-brand">${logoHtml}${fallbackHtml}${nameHtml}</a>`;
}

function portalUserMenu(currentUser) {
  if (!currentUser) return '';
  const name = currentUser.username || '用户';
  return `<div class="portal-user">
    <button type="button" class="portal-avatar" aria-haspopup="menu" aria-expanded="false" title="${escapeHtml(name)}" aria-label="${escapeHtml(name)}">
      <svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="12" r="5"></circle><path d="M7.2 26.2c.7-4.3 3.8-6.7 8.8-6.7s8.1 2.4 8.8 6.7c.2.7-.4 1.3-1.1 1.3H8.3c-.7 0-1.3-.6-1.1-1.3z"></path></svg>
    </button>
    <div class="portal-user-menu" role="menu">
      <div class="portal-user-name">${escapeHtml(name)}</div>
      <a href="/logout" class="portal-user-logout" role="menuitem">退出</a>
    </div>
  </div>`;
}

function getCsrfToken(req) {
  if (req.currentSession) return req.currentSession.csrfToken;
  return crypto.randomBytes(16).toString('hex');
}

function buildTree(pages) {
  const byId = new Map(pages.map((p) => [p.id, { ...p, children: [] }]));
  const roots = [];
  for (const page of pages) {
    const node = byId.get(page.id);
    if (page.parentId && byId.has(page.parentId)) {
      byId.get(page.parentId).children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

const LUCIDE_URL = 'https://cdn.jsdelivr.net/npm/lucide@0.468/dist/umd/lucide.min.js';
const LUCIDE_SVG = (name) => `<i data-lucide="${escapeHtml(name)}" class="pm-icon"></i>`;

function lucideBootstrapTag() {
  return `<script src="${LUCIDE_URL}"></script>
<script>
(function(){
  if(window.lucide&&window.lucide.createIcons){ try{ lucide.createIcons(); }catch(e){} }
  // 分组节点点击展开/折叠
  document.addEventListener('click', function(e){
    // 点击分组节点：切换 is-open
    var link = e.target.closest('.pm-group-link');
    if(link){
      var li = link.closest('.pm-item');
      if(li){ e.preventDefault(); li.classList.toggle('is-open'); }
      return;
    }
    // 点击子菜单中的链接本身不关闭其他（正常跳转）
    // 点击其他地方：关闭顶栏所有已展开的分组（侧栏保持）
    if(!e.target.closest('.pm-item')) return;
    // nothing else — 只在点击到 pm-item 内部时响应
  });
  // 顶栏布局下：鼠标离开导航区域后延迟关闭 is-open
  var topbarNav = document.querySelector('body.portal-layout-topbar .portal-topbar');
  if(topbarNav){
    topbarNav.addEventListener('mouseleave', function(){
      // 100ms 后关闭，防止鼠标从分组移到子菜单的瞬间丢失
      setTimeout(function(){
        var hovering = topbarNav.querySelector(':hover');
        if(!hovering){
          topbarNav.querySelectorAll('.pm-item.has-children').forEach(function(li){
            li.classList.remove('is-open');
          });
        }
      }, 120);
    });
  }
  // 侧栏布局：折叠 / 展开
  var sideToggle = document.querySelector('.portal-side-toggle');
  if(sideToggle){
    var sideStorageKey = 'portal-side-collapsed';
    var body = document.body;
    // 恢复状态
    try {
      if(localStorage.getItem(sideStorageKey) === '1'){
        body.classList.add('portal-side-collapsed');
        sideToggle.setAttribute('aria-label', '展开侧栏');
        sideToggle.setAttribute('title', '展开侧栏');
      }
    } catch(e){}
    sideToggle.addEventListener('click', function(){
      var collapsed = body.classList.toggle('portal-side-collapsed');
      try { localStorage.setItem(sideStorageKey, collapsed ? '1' : '0'); } catch(e){}
      if(collapsed){
        sideToggle.setAttribute('aria-label', '展开侧栏');
        sideToggle.setAttribute('title', '展开侧栏');
      } else {
        sideToggle.setAttribute('aria-label', '折叠侧栏');
        sideToggle.setAttribute('title', '折叠侧栏');
      }
      if(window.lucide&&window.lucide.createIcons){ try{ lucide.createIcons(); }catch(e){} }
    });
  }
  var slimScrollCss = '*{scrollbar-width:thin;scrollbar-color:rgba(48,49,51,.32) transparent}*::-webkit-scrollbar{width:8px;height:8px}*::-webkit-scrollbar-button{width:0;height:0;display:none}*::-webkit-scrollbar-track{background:transparent}*::-webkit-scrollbar-thumb{background-color:rgba(48,49,51,.32);border:2px solid transparent;border-radius:999px;background-clip:padding-box}*::-webkit-scrollbar-corner{background:transparent}';
  function slimFrame(frame){
    try {
      var doc = frame.contentDocument;
      if(!doc || !doc.documentElement) return;
      if(doc.getElementById('portal-slim-scroll')) return;
      var style = doc.createElement('style');
      style.id = 'portal-slim-scroll';
      style.textContent = slimScrollCss;
      (doc.head || doc.documentElement).appendChild(style);
    } catch(e) {}
  }
  document.querySelectorAll('iframe.portal-frame').forEach(function(frame){
    frame.addEventListener('load', function(){ slimFrame(frame); });
    slimFrame(frame);
  });
  document.querySelectorAll('.portal-user').forEach(function(wrap){
    var menu = wrap.querySelector('.portal-user-menu');
    var avatar = wrap.querySelector('.portal-avatar');
    var closeTimer;
    function scheduleClose(){
      clearTimeout(closeTimer);
      closeTimer = setTimeout(function(){
        if((menu && menu.matches(':hover')) || (avatar && avatar.matches(':hover'))) return;
        wrap.classList.remove('is-open');
        if(avatar) avatar.setAttribute('aria-expanded', 'false');
      }, 160);
    }
    [menu, avatar].forEach(function(el){
      if(!el) return;
      el.addEventListener('mouseenter', function(){ clearTimeout(closeTimer); });
      el.addEventListener('mouseleave', function(){
        if(wrap.classList.contains('is-open')) scheduleClose();
      });
    });
  });
  document.addEventListener('click', function(e){
    var avatar = e.target.closest('.portal-avatar');
    if(avatar){
      e.preventDefault();
      var wrap = avatar.closest('.portal-user');
      var willOpen = !wrap.classList.contains('is-open');
      document.querySelectorAll('.portal-user.is-open').forEach(function(el){ el.classList.remove('is-open'); });
      if(willOpen){
        wrap.classList.add('is-open');
        var menu = wrap.querySelector('.portal-user-menu');
        var rect = avatar.getBoundingClientRect();
        var sidebar = document.body.classList.contains('portal-layout-sidebar');
        menu.style.left = '0px';
        menu.style.top = '0px';
        var width = menu.offsetWidth;
        var height = menu.offsetHeight;
        var left = sidebar ? rect.left : rect.right - width;
        var top = sidebar ? rect.top - height - 8 : rect.bottom + 8;
        left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
        top = Math.max(8, Math.min(top, window.innerHeight - height - 8));
        menu.style.left = left + 'px';
        menu.style.top = top + 'px';
      }
      avatar.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
      return;
    }
    if(!e.target.closest('.portal-user')){
      document.querySelectorAll('.portal-user.is-open').forEach(function(el){
        el.classList.remove('is-open');
        var btn = el.querySelector('.portal-avatar');
        if(btn) btn.setAttribute('aria-expanded', 'false');
      });
    }
  });
})();
</script>`;
}

function renderMenu(nodes, activeId, slug, parentPath = '', autoOpen = true) {
  const ancestorsOfActive = new Set();
  function collectAncestors(node, path) {
    const newPath = path.concat(node.id);
    if (node.id === activeId) newPath.forEach((id) => ancestorsOfActive.add(id));
    (node.children || []).forEach((c) => collectAncestors(c, newPath));
  }
  nodes.forEach((n) => collectAncestors(n, []));

  function renderNode(node, basePath) {
    const fullPath = basePath ? `${basePath}/${node.routePath}` : node.routePath;
    const hasChildren = node.children && node.children.length > 0;
    const visibleChildren = (node.children || []).filter((c) => c.visible !== false);
    const childrenHtml = hasChildren ? `<ul>${visibleChildren.map((c) => renderNode(c, fullPath)).join('')}</ul>` : '';
    const iconHtml = node.icon ? LUCIDE_SVG(node.icon) : '';
    const isActive = node.id === activeId;
    // 自动展开仅对侧栏布局生效；顶栏子菜单由 hover/点击触发
    const isOpen = hasChildren && autoOpen && (!activeId || ancestorsOfActive.has(node.id));
    let linkHtml;
    if (hasChildren) {
      linkHtml = `<span class="pm-link pm-group-link">${iconHtml}<span>${escapeHtml(node.title)}</span><span class="pm-caret">▾</span></span>`;
    } else {
      const openBlank = node.linkType === 'url' && node.openMode === 'blank' && node.externalUrl;
      const href = openBlank ? node.externalUrl : `/portal/${slug}/${fullPath}`;
      const extra = openBlank ? ' target="_blank" rel="noopener noreferrer"' : '';
      linkHtml = `<a href="${escapeHtml(href)}" class="pm-link"${extra}>${iconHtml}<span>${escapeHtml(node.title)}</span></a>`;
    }
    return `<li class="pm-item${isActive ? ' is-active' : ''}${hasChildren ? ' has-children' : ''}${isOpen ? ' is-open' : ''}">${linkHtml}${childrenHtml}</li>`;
  }
  return `<ul class="pm-list depth-0">${nodes.filter((p) => p.visible !== false).map((n) => renderNode(n, parentPath)).join('')}</ul>`;
}

function wrapInPortalShell(portal, page, menuTreeHtml, frameSrc, currentUser, contentHtml = '') {
  const logoUrl = resolvePortalLogo(portal);
  const brand = portalBrandHtml(portal, logoUrl, !logoUrl);
  const logoutLink = portalUserMenu(currentUser);
  const frame = contentHtml || `<iframe class="portal-frame" src="${escapeHtml(frameSrc)}" title="${escapeHtml(page.title)}"></iframe>`;

  let shell;
  if (portal.layout === 'sidebar') {
    const sideLogout = portalUserMenu(currentUser);
    const footer = `<div class="portal-side-footer">
        ${sideLogout}
        <button type="button" class="portal-side-toggle" aria-label="折叠侧栏" title="折叠侧栏"><i data-lucide="chevrons-left"></i></button>
      </div>`;
    shell = `<aside class="portal-side">${brand}<nav class="portal-nav">${menuTreeHtml}</nav>${footer}</aside>
      <main class="portal-main">
        <div class="portal-iframe-wrap">${frame}</div>
      </main>`;
  } else {
    shell = `<header class="portal-topbar">${brand}<nav class="portal-nav">${menuTreeHtml}</nav><div class="portal-topbar-right">${logoutLink}</div></header>
      <main class="portal-main"><div class="portal-iframe-wrap">${frame}</div></main>`;
  }

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(page.title)} - ${escapeHtml(portal.name)}</title>
  <link rel="stylesheet" href="/portal-static/portal.css?v=20261106-mark">
</head>
<body class="${portalThemeClass(portal.theme)} portal-layout-${portal.layout}">
  ${shell}
</body>
${lucideBootstrapTag()}
</html>`;
}

function buildEmptyPortal(portal, currentUser) {
  const pages = portalStore.listPages(portal.id);
  const tree = buildTree(pages);
  const menuTreeHtml = renderMenu(tree, null, portal.slug, '', portal.layout !== 'topbar');
  const logoUrl = resolvePortalLogo(portal);
  const brand = portalBrandHtml(portal, logoUrl, !logoUrl);

  let shell;
  if (portal.layout === 'sidebar') {
    const sideLogout = portalUserMenu(currentUser);
    const footer = `<div class="portal-side-footer">
        ${sideLogout}
        <button type="button" class="portal-side-toggle" aria-label="折叠侧栏" title="折叠侧栏"><i data-lucide="chevrons-left"></i></button>
      </div>`;
    shell = `
      <aside class="portal-side">
        ${brand}
        <nav class="portal-nav">${menuTreeHtml}</nav>
        ${footer}
      </aside>
      <main class="portal-main">
        <div class="portal-content portal-empty">
          <div class="portal-empty-title">欢迎来到 ${escapeHtml(portal.name)}</div>
          <div class="portal-empty-desc">管理员还没有为这个门户配置页面。</div>
        </div>
      </main>`;
  } else {
    const topbarRight = portalUserMenu(currentUser);
    shell = `
      <header class="portal-topbar">${brand}<nav class="portal-nav">${menuTreeHtml}</nav><div class="portal-topbar-right">${topbarRight}</div></header>
      <main class="portal-main">
        <div class="portal-content portal-empty">
          <div class="portal-empty-title">欢迎来到 ${escapeHtml(portal.name)}</div>
          <div class="portal-empty-desc">管理员还没有为这个门户配置页面。</div>
        </div>
      </main>`;
  }

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(portal.name)}</title>
  <link rel="stylesheet" href="/portal-static/portal.css?v=20261106-mark">
</head>
<body class="${portalThemeClass(portal.theme)} portal-layout-${portal.layout}">${shell}</body>
${lucideBootstrapTag()}
</html>`;
}

function buildPortalLoginHtml(portal, csrfToken, error, next) {
  const loginMessage = portal.loginMessage || `请登录后访问「${portal.name}」`;
  const logoUrl = resolvePortalLogo(portal);
  const logoHtml = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(portal.name)}" class="portal-brand-logo-lg">`
    : '';
  const titleHtml = logoUrl
    ? ''
    : `<div class="portal-login-title">${escapeHtml(portal.name)}</div>`;
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>登录 - ${escapeHtml(portal.name)}</title>
  <link rel="stylesheet" href="/portal-static/portal.css?v=20261106-mark">
</head>
<body class="${portalThemeClass(portal.theme)} portal-login-body">
  <div class="portal-login-wrap">
    <div class="portal-login-card">
      <div class="portal-login-brand">
        ${logoHtml}
        ${titleHtml}
      </div>
      <div class="portal-login-message">${escapeHtml(loginMessage)}</div>
      ${error ? `<div class="portal-login-error">${escapeHtml(error)}</div>` : ''}
      <form method="post" action="/portal/${portal.slug}/login" class="portal-login-form">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
        ${next ? `<input type="hidden" name="next" value="${escapeHtml(next)}">` : ''}
        <label class="portal-login-field">
          <span>用户名</span>
          <input name="username" required autofocus>
        </label>
        <label class="portal-login-field">
          <span>密码</span>
          <input name="password" type="password" required>
        </label>
        <button type="submit" class="portal-login-btn">登录</button>
      </form>
      <div class="portal-login-foot"><a href="/login">使用 DemoHub 账号登录</a></div>
    </div>
  </div>
</body>
</html>`;
}

router.get('/:slug/login', (req, res) => {
  const portal = portalStore.getPortalBySlug(req.params.slug);
  if (!portal) return res.status(404).send('门户不存在');
  res.send(buildPortalLoginHtml(portal, getCsrfToken(req), req.query.error || '', req.query.next || ''));
});

router.post('/:slug/login', express.urlencoded({ extended: false }), (req, res) => {
  const portal = portalStore.getPortalBySlug(req.params.slug);
  if (!portal) return res.status(404).send('门户不存在');
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const nextUrl = String(req.body.next || '').trim() || `/portal/${portal.slug}`;

  if (req.currentSession && req.body._csrf !== req.currentSession.csrfToken) {
    return res.send(buildPortalLoginHtml(portal, getCsrfToken(req), '表单已过期', ''));
  }

  try {
    const user = authenticateUser(username, password);
    const session = createSession(user.id);
    setSessionCookie(res, session.token);
    res.redirect(nextUrl.startsWith('/portal') ? nextUrl : `/portal/${portal.slug}`);
  } catch (err) {
    res.send(buildPortalLoginHtml(portal, getCsrfToken(req), err.message, ''));
  }
});

function proxyPage(req, res) {
  const slug = req.params.slug;
  const portal = portalStore.getPortalBySlug(slug);
  if (!portal || portal.status === 'disabled') return res.status(404).send('门户不存在或已禁用');

  if (portal.loginRequired) {
    if (!req.currentUser || req.currentUser.status !== 'approved') {
      return res.status(401).send(buildPortalLoginHtml(portal, getCsrfToken(req), '', req.originalUrl));
    }
  }

  const rest = String(req.params[0] || '').replace(/^\/+|\/+$/g, '');
  const pages = portalStore.listPages(portal.id);
  const matched = matchPage(pages, rest);
  if (!matched) {
    if (!rest) return res.send(buildEmptyPortal(portal, req.currentUser));
    return res.status(404).send('页面不存在');
  }

  const { page, assetPath } = matched;
  const tree = buildTree(pages);
  const menuTreeHtml = renderMenu(tree, page.id, slug, '', portal.layout !== 'topbar');
  if (page.linkType === 'url') {
    if (assetPath) return res.status(404).send('文件不存在');
    const externalUrl = page.externalUrl || '';
    if (page.openMode === 'blank') {
      const card = `<div class="portal-ext-card"><div class="portal-ext-title">${escapeHtml(page.title)}</div><p>这个菜单在新窗口打开。</p><a class="portal-ext-open" href="${escapeHtml(externalUrl)}" target="_blank" rel="noopener noreferrer">打开链接</a></div>`;
      return res.send(wrapInPortalShell(portal, page, menuTreeHtml, '', req.currentUser, card));
    }
    const embed = `<div class="portal-ext-bar">若页面无法显示，<a href="${escapeHtml(externalUrl)}" target="_blank" rel="noopener noreferrer">在新窗口打开</a></div><iframe class="portal-frame" src="${escapeHtml(externalUrl)}" title="${escapeHtml(page.title)}" referrerpolicy="no-referrer"></iframe>`;
    return res.send(wrapInPortalShell(portal, page, menuTreeHtml, '', req.currentUser, embed));
  }
  const db = getDb();
  const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(page.siteId);
  if (!site) return res.status(410).send('关联站点已被删除');
  if (site.access_days > 0 && new Date(site.created_at).getTime() + site.access_days * 86400000 < Date.now()) {
    return res.status(410).send('关联站点已过期');
  }

  const relativePath = assetPath || site.entry_file;
  const rootPath = path.resolve(site.root_path);
  const filePath = path.resolve(rootPath, relativePath);
  if (filePath !== rootPath && !filePath.startsWith(rootPath + path.sep)) return res.status(403).send('禁止访问');
  if (!fsSync.existsSync(filePath) || !fsSync.statSync(filePath).isFile()) return res.status(404).send('文件不存在');

  // 计算 page 的完整路径（父/子 routePath 拼合）
  const byId = new Map(pages.map((p) => [p.id, { ...p, children: [] }]));
  for (const p of pages) if (p.parentId && byId.has(p.parentId)) byId.get(p.parentId).children.push(byId.get(p.id));
  function getFullPath(node, parentPath) {
    const fp = parentPath ? `${parentPath}/${node.routePath}` : node.routePath;
    if (node.id === page.id) return fp;
    for (const c of node.children) { const r = getFullPath(c, fp); if (r) return r; }
    return null;
  }
  const pageFullPath = pages.filter((p) => !p.parentId).map((r) => getFullPath(byId.get(r.id), '')).find(Boolean) || page.routePath;

  if (filePath.toLowerCase().endsWith('.html') || filePath.toLowerCase().endsWith('.htm')) {
    const assetDir = assetPath.includes('/') ? assetPath.slice(0, assetPath.lastIndexOf('/') + 1) : '';
    const baseHref = `/portal/${slug}/${pageFullPath}/${assetDir}`;
    if (!assetPath && req.query.content !== '1') {
      const tree = buildTree(pages);
      const menuTreeHtml = renderMenu(tree, page.id, slug, '', portal.layout !== 'topbar');
      const frameSrc = `/portal/${slug}/${pageFullPath}/?content=1`;
      return res.send(wrapInPortalShell(portal, page, menuTreeHtml, frameSrc, req.currentUser));
    }
    const rawHtml = fsSync.readFileSync(filePath, 'utf8');
    return res.type('html').send(injectBase(rawHtml, baseHref));
  }
  res.sendFile(filePath);
}

function injectBase(html, baseHref) {
  const tag = `<base href="${escapeHtml(baseHref)}">`;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (match) => `${match}${tag}`);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (match) => `${match}<head>${tag}</head>`);
  return `<!DOCTYPE html><html><head><meta charset="utf-8">${tag}</head><body>${html}</body></html>`;
}

function matchPage(pages, rest) {
  const byId = new Map(pages.map((p) => [p.id, { ...p, children: [] }]));
  for (const page of pages) {
    if (page.parentId && byId.has(page.parentId)) byId.get(page.parentId).children.push(byId.get(page.id));
  }
  // 计算每个节点的完整路径（父/子 routePath 拼合）
  const fullPathById = new Map();
  function computePath(node, parentPath) {
    const fullPath = parentPath ? `${parentPath}/${node.routePath}` : node.routePath;
    fullPathById.set(node.id, fullPath);
    for (const c of node.children) computePath(c, fullPath);
  }
  pages.filter((p) => !p.parentId).forEach((root) => computePath(byId.get(root.id), ''));

  // 判断节点是否为分组：有任意 visible 子节点即分组（不管 siteId 有没有配置）
  function isGroup(node) {
    return node.children && node.children.some((c) => c.visible !== false);
  }
  // 分组节点落到第一个可见叶子节点
  function resolveLeaf(node) {
    let cur = node;
    while (isGroup(cur)) {
      const first = cur.children.find((c) => c.visible !== false);
      if (!first) break;
      cur = first;
    }
    return cur;
  }

  if (!rest) {
    const firstPage = pages.find((item) => item.isDefault) || pages.find((item) => !item.parentId) || pages[0];
    if (!firstPage) return null;
    const target = resolveLeaf(byId.get(firstPage.id));
    return { page: pages.find((p) => p.id === target.id), assetPath: '' };
  }
  // 用完整路径匹配，先按长度降序（最深的优先）
  const ordered = pages.slice().sort((a, b) => (fullPathById.get(b.id) || '').length - (fullPathById.get(a.id) || '').length);
  for (const page of ordered) {
    const fullPath = fullPathById.get(page.id);
    if (!fullPath) continue;
    if (rest === fullPath) {
      const node = byId.get(page.id);
      const target = resolveLeaf(node);
      return { page: pages.find((p) => p.id === target.id), assetPath: '' };
    }
    const prefix = `${fullPath}/`;
    if (rest.startsWith(prefix)) return { page, assetPath: rest.slice(prefix.length) };
  }
  return null;
}

router.get('/:slug', proxyPage);
router.get('/:slug/*', proxyPage);

module.exports = router;
