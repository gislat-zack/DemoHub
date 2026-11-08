function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const { iconFile } = require('../services/fileTypes');

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = Number(bytes) || 0;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

const ICONS = {
  dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5a8 8 0 1 1 15 0"/><path d="M12 16.5 16 10"/><circle cx="12" cy="16.5" r="1.2" fill="currentColor" stroke="none"/></svg>',
  sites: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
  files: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6"/><path d="M19 8v6M22 11h-6"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17V3M6 9l6-6 6 6"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v14M6 11l6 6 6-6"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>',
  logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/></svg>',
  globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
  moon: '<svg class="i-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/></svg>',
  sun: '<svg class="i-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  nav: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  portal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="4" rx="1"/><rect x="3" y="17" width="18" height="4" rx="1"/><path d="M5 9v8M12 9v8M19 9v8"/></svg>',
  site: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
  folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></svg>',
  file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6"/></svg>',
  storage: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/><path d="M3 12c0 1.7 4 3 9 3s9-1.3 9-3"/></svg>',
  usersStat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m4 12 5 5L20 6"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>'
};

function iconSvg(name, size = 19) {
  const svg = (ICONS[name] || '').replace('<svg ', `<svg width="${size}" height="${size}" `);
  return `<span style="display:inline-flex;width:${size}px;height:${size}px">${svg}</span>`;
}

function navItem({ href, icon, label, active = false, disabled = false }) {
  const cls = ['nav-item', active ? 'active' : '', disabled ? 'disabled' : ''].filter(Boolean).join(' ');
  const content = `<span class="nav-icon">${ICONS[icon] || ''}</span><span>${escapeHtml(label)}</span>`;
  if (disabled) {
    return `<span class="${cls}" title="暂未启用">${content}</span>`;
  }
  return `<a class="${cls}" href="${escapeHtml(href)}">${content}</a>`;
}

function renderToast(message, kind = 'success', options = {}) {
  if (!message) return '';
  const body = options.html ? String(message) : escapeHtml(message);
  const tone = kind === 'error' ? 'is-error' : 'is-success';
  const mark = kind === 'error' ? '!' : '✓';
  return `<div class="app-toast ${tone}" id="pageToast" role="status"><span class="app-toast-icon" aria-hidden="true">${mark}</span><span class="app-toast-text">${body}</span></div>`;
}

function themeToggleButton() {
  return `<button class="btn" type="button" id="themeToggle" title="切换深色 / 浅色模式">
    <span class="theme-icon">${ICONS.moon}${ICONS.sun}</span>
    <span class="theme-label">深色模式</span>
  </button>`;
}

function statCard({ icon = 'site', tone = 'blue', value = '', label = '' }) {
  return `<div class="stat-card">
    <div class="stat-icon ${escapeHtml(tone)}">${ICONS[icon] || ''}</div>
    <div class="stat-content">
      <div class="stat-value">${escapeHtml(value)}</div>
      <div class="stat-label">${escapeHtml(label)}</div>
    </div>
  </div>`;
}

function renderSidebar({ currentUser, csrfToken, activeNav, settings = {}, dataSize = 0, diskStats = null }) {
  if (!currentUser) return '';

  const isAdmin = currentUser.role === 'admin';
  const roleLabel = isAdmin ? '管理员' : '用户';
  const avatar = currentUser.username ? currentUser.username.slice(0, 1).toUpperCase() : 'U';
  const siteName = settings.site_name || 'DemoHub';
  const siteSubtitle = settings.site_subtitle == null ? '系统演示环境' : String(settings.site_subtitle);
  const logoUrl = settings.logo_url || '';
  const smallLogo = settings.logo_small_url || '';
  const useLargeLogo = settings.logo_display !== 'small' && Boolean(logoUrl);

  let percent = 0;
  let storageRight = formatBytes(dataSize);
  let storageText = `当前数据目录占用 ${formatBytes(dataSize)}`;
  let fillClass = '';

  if (diskStats && Number(diskStats.totalBytes) > 0) {
    percent = Math.min(100, Math.max(0, Number(diskStats.usedPercent) || 0));
    storageRight = `${formatBytes(diskStats.usedBytes)} / ${formatBytes(diskStats.totalBytes)}`;
    storageText = `${diskStats.volume || '磁盘'} · 数据目录 ${formatBytes(dataSize)}`;
    fillClass = percent > 95 ? 'danger' : percent > 80 ? 'warning' : '';
  } else if (dataSize > 0) {
    percent = 100;
  }

  return `<aside class="sidebar">
    <div class="brand${useLargeLogo ? ' brand-wide' : ''}">
      ${useLargeLogo
        ? `<a class="brand-wide-link" href="/admin" title="${escapeHtml(siteName)}"><img class="brand-wide-img" src="${escapeHtml(logoUrl)}" alt="${escapeHtml(siteName)}"></a>`
        : `<a class="brand-logo" href="/admin" title="${escapeHtml(siteName)}">${smallLogo ? `<img src="${escapeHtml(smallLogo)}" alt="${escapeHtml(siteName)}">` : ICONS.globe}</a>`}
      ${useLargeLogo
        ? (siteSubtitle ? `<div class="brand-sub brand-wide-sub">${escapeHtml(siteSubtitle)}</div>` : '')
        : `<div>
        <div class="brand-name">${escapeHtml(siteName)}</div>
        ${siteSubtitle ? `<div class="brand-sub">${escapeHtml(siteSubtitle)}</div>` : ''}
      </div>`}
    </div>

    <nav class="nav">
      <div class="nav-group">
        <div class="nav-label">总览</div>
        ${navItem({ href: '/admin/nav', icon: 'nav', label: '导航', active: activeNav === 'nav' })}
        ${navItem({ href: '/admin', icon: 'dashboard', label: '仪表', active: activeNav === 'dashboard' })}
      </div>

      <div class="nav-group">
        <div class="nav-label">站群管理</div>
        ${isAdmin ? navItem({ href: '/admin/portals', icon: 'portal', label: '门户管理', active: activeNav === 'portals' }) : ''}
        ${navItem({ href: '/admin?view=sites', icon: 'sites', label: '网站管理', active: activeNav === 'sites' })}
        ${navItem({ href: '/admin?view=files', icon: 'files', label: '文件管理', active: activeNav === 'files' })}
      </div>

      <div class="nav-group">
        <div class="nav-label">设置</div>
        ${isAdmin ? navItem({ href: '/admin/users', icon: 'users', label: '用户管理', active: activeNav === 'users' }) : ''}
        ${isAdmin ? navItem({ href: '/admin/settings', icon: 'settings', label: '系统设置', active: activeNav === 'settings' }) : ''}
      </div>
    </nav>

    <div class="sidebar-foot">
      <div class="storage-row"><span>存储空间</span><strong>${escapeHtml(storageRight)}</strong></div>
      <div class="storage-bar"><div class="storage-fill ${fillClass}" style="width:${percent}%;"></div></div>
      <div class="storage-text">${escapeHtml(storageText)}</div>
      <div class="user-row">
        <div class="avatar">${escapeHtml(avatar)}</div>
        <div class="user-meta">
          <div class="user-name">${escapeHtml(currentUser.username)}</div>
          <div class="user-role">${escapeHtml(roleLabel)}</div>
        </div>
        <form method="post" action="/logout" class="logout-form">
          <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken || '')}">
          <button type="submit" class="logout-btn" title="退出登录">${ICONS.logout}</button>
        </form>
      </div>
    </div>
  </aside>`;
}

function layout({ title, content, currentUser = null, csrfToken = '', activeNav = '', settings = {}, dataSize = 0, diskStats = null }) {
  const theme = settings.theme === 'dark' ? 'dark' : 'light';
  const siteName = settings.site_name || 'DemoHub';
  const siteSubtitle = settings.site_subtitle == null ? '系统演示环境' : String(settings.site_subtitle);
  const pageTitle = `${title} · ${siteName}`;
  const logoUrl = settings.logo_url || '';
  const smallLogo = settings.logo_small_url || '';
  const useLargeLogo = settings.logo_display !== 'small' && Boolean(logoUrl);
  const loginBg = title === '登录' ? (settings.login_bg_url || '') : '';
  const favicon = smallLogo || logoUrl;

  const shell = currentUser
    ? `<div class="app-layout">
        ${renderSidebar({ currentUser, csrfToken, activeNav, settings, dataSize, diskStats })}
        <main class="main-content">${content}</main>
      </div>`
    : `<main class="auth-page${loginBg ? ' has-login-bg' : ''}"${loginBg ? ` style="background-image:url('${escapeHtml(loginBg)}')"` : ''}>
        ${useLargeLogo
          ? `<div class="auth-brand auth-brand-wide">
              <img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(siteName)}">
              ${siteSubtitle ? `<div class="brand-sub">${escapeHtml(siteSubtitle)}</div>` : ''}
            </div>`
          : `<div class="auth-brand">
              <div class="brand-logo">${smallLogo ? `<img src="${escapeHtml(smallLogo)}" alt="${escapeHtml(siteName)}">` : ICONS.globe}</div>
              <div>
                <div class="brand-name">${escapeHtml(siteName)}</div>
                ${siteSubtitle ? `<div class="brand-sub">${escapeHtml(siteSubtitle)}</div>` : ''}
              </div>
            </div>`}
        ${content}
      </main>`;

  return `<!doctype html>
<html lang="zh-CN" data-theme="${escapeHtml(theme)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="csrf-token" content="${escapeHtml(csrfToken || '')}">
  <title>${escapeHtml(pageTitle)}</title>
  ${favicon ? `<link rel="icon" href="${escapeHtml(favicon)}">` : ''}
  <link rel="stylesheet" href="/admin-static/admin.css?v=20261106-switch2">
</head>
<body>
  ${shell}

  <div class="tree-modal" id="actionModal" style="display:none;">
    <div class="tree-modal-overlay" id="actionOverlay"></div>
    <div class="tree-modal-card">
      <div class="tree-modal-header">
        <span class="tree-modal-title" id="actionTitle"></span>
        <button class="tree-modal-close" id="actionClose" type="button" aria-label="关闭"></button>
      </div>
      <div class="tree-modal-body" id="actionBody"></div>
    </div>
  </div>

  <div class="tree-modal" id="previewModal" style="display:none;" role="dialog" aria-modal="true" aria-labelledby="previewTitle">
    <div class="tree-modal-overlay" id="previewOverlay"></div>
    <div class="tree-modal-card file-preview-dialog">
      <div class="tree-modal-header">
        <span class="tree-modal-title" id="previewTitle">预览</span>
        <button class="tree-modal-close" id="previewClose" type="button" aria-label="关闭"></button>
      </div>
      <div class="tree-modal-body file-preview-body" id="previewBody"></div>
    </div>
  </div>

  <script>
  (function () {
    function hideToast(toast) {
      if (!toast) return;
      setTimeout(function () { toast.classList.add('is-hide'); }, 1800);
      setTimeout(function () { if (toast.parentNode) toast.remove(); }, 2200);
    }
    hideToast(document.getElementById('pageToast'));
    window.showAppToast = function (message, kind) {
      var old = document.getElementById('pageToast');
      if (old) old.remove();
      var toast = document.createElement('div');
      toast.id = 'pageToast';
      toast.className = 'app-toast ' + (kind === 'error' ? 'is-error' : 'is-success');
      toast.setAttribute('role', 'status');
      var icon = document.createElement('span');
      icon.className = 'app-toast-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = kind === 'error' ? '!' : '✓';
      var text = document.createElement('span');
      text.className = 'app-toast-text';
      text.textContent = message || '';
      toast.appendChild(icon);
      toast.appendChild(text);
      document.body.appendChild(toast);
      hideToast(toast);
    };
    function closeConfirm() {
      var pop = document.getElementById('appConfirm');
      if (pop) pop.remove();
    }
    function openConfirm(anchor, message, onOk) {
      closeConfirm();
      var pop = document.createElement('div');
      pop.id = 'appConfirm';
      pop.className = 'app-confirm';
      pop.setAttribute('role', 'dialog');
      var title = document.createElement('div');
      title.className = 'app-confirm-title';
      title.textContent = message;
      var actions = document.createElement('div');
      actions.className = 'app-confirm-actions';
      var cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'btn app-confirm-cancel';
      cancel.textContent = '取消';
      var ok = document.createElement('button');
      ok.type = 'button';
      ok.className = 'btn app-confirm-ok';
      ok.textContent = '确定';
      actions.appendChild(cancel);
      actions.appendChild(ok);
      pop.appendChild(title);
      pop.appendChild(actions);
      document.body.appendChild(pop);
      var rect = anchor.getBoundingClientRect();
      var top = rect.bottom + 8;
      var left = Math.min(rect.left, window.innerWidth - 264);
      if (top + pop.offsetHeight > window.innerHeight - 8) top = Math.max(8, rect.top - pop.offsetHeight - 8);
      pop.style.top = top + 'px';
      pop.style.left = Math.max(8, left) + 'px';
      cancel.addEventListener('click', closeConfirm);
      ok.addEventListener('click', function () { closeConfirm(); onOk(); });
      setTimeout(function () {
        document.addEventListener('mousedown', function outside(ev) {
          if (!pop.isConnected || pop.contains(ev.target)) return;
          document.removeEventListener('mousedown', outside);
          closeConfirm();
        });
      }, 0);
    }
    document.addEventListener('submit', function (e) {
      var form = e.target;
      if (!form || !form.getAttribute) return;
      var message = form.getAttribute('data-confirm');
      if (!message || form.getAttribute('data-confirmed') === '1') return;
      e.preventDefault();
      e.stopPropagation();
      var trigger = form.querySelector('[type="submit"]') || form;
      openConfirm(trigger, message, function () {
        form.setAttribute('data-confirmed', '1');
        if (typeof form.requestSubmit === 'function') form.requestSubmit();
        else form.submit();
      });
    }, true);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeConfirm();
    });

    window.filePreviewType = function (name) {
      var ext = String(name || '').toLowerCase().split('.').pop();
      if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'svg'].indexOf(ext) >= 0) return 'image';
      if (ext === 'pdf') return 'pdf';
      return '';
    };
    window.fileTypeIcon = function (name) {
      var ext = String(name || '').toLowerCase().split('.').pop();
      var icons = {
        html: 'html.svg', htm: 'html.svg', zip: 'zip.svg',
        png: 'png.svg', jpg: 'jpg.svg', jpeg: 'jpg.svg', gif: 'gif.svg', webp: 'webp.svg',
        ico: 'ico.svg', bmp: 'bmp.svg', svg: 'svg.svg', pdf: 'pdf.svg',
        mhtml: 'mhtml.svg', mht: 'mhtml.svg', css: 'css.svg', js: 'js.svg',
        json: 'json.svg', txt: 'txt.svg'
      };
      return icons[ext] ? '/admin-static/file-icons/' + icons[ext] : '';
    };

    var previewModal = document.getElementById('previewModal');
    if (previewModal) {
      var previewOverlay = document.getElementById('previewOverlay');
      var previewClose = document.getElementById('previewClose');
      var previewTitle = document.getElementById('previewTitle');
      var previewBody = document.getElementById('previewBody');
      function closePreview() {
        previewModal.style.display = 'none';
        previewBody.innerHTML = '';
        document.body.style.overflow = '';
      }
      function previewSrc(url) {
        try {
          var parsed = new URL(url, window.location.href);
          return parsed.pathname + parsed.search + parsed.hash;
        } catch (_error) {
          return url;
        }
      }
      function showPreviewFallback() {
        previewBody.innerHTML = '';
        var tip = document.createElement('div');
        tip.className = 'file-preview-fallback';
        tip.textContent = '无法预览该文件';
        previewBody.appendChild(tip);
      }
      previewOverlay.addEventListener('click', closePreview);
      previewClose.addEventListener('click', closePreview);
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && previewModal.style.display !== 'none') closePreview();
      });
      document.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-preview-url]');
        if (!btn) return;
        e.preventDefault();
        var url = previewSrc(btn.getAttribute('data-preview-url'));
        var type = btn.getAttribute('data-preview-type');
        var name = btn.getAttribute('data-preview-name') || '预览';
        previewTitle.textContent = name;
        previewBody.innerHTML = '';
        if (type === 'pdf') {
          var frame = document.createElement('iframe');
          frame.className = 'file-preview-frame';
          frame.src = url;
          frame.title = name;
          previewBody.appendChild(frame);
        } else {
          var img = document.createElement('img');
          img.className = 'file-preview-image';
          img.alt = name;
          img.addEventListener('error', showPreviewFallback);
          img.src = url;
          previewBody.appendChild(img);
        }
        document.body.style.overflow = 'hidden';
        previewModal.style.display = 'flex';
      });
    }

    /* ── Theme toggle ── */
    var root = document.documentElement;
    var toggleBtn = document.getElementById('themeToggle');
    if (toggleBtn) {
      var label = toggleBtn.querySelector('.theme-label');
      function syncLabel() {
        if (label) label.textContent = root.getAttribute('data-theme') === 'dark' ? '浅色模式' : '深色模式';
      }
      syncLabel();
      toggleBtn.addEventListener('click', function () {
        var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        root.setAttribute('data-theme', next);
        syncLabel();
        var meta = document.querySelector('meta[name="csrf-token"]');
        fetch('/admin/theme', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: '_csrf=' + encodeURIComponent(meta ? meta.content : '')
        }).catch(function () {});
      });
    }

    /* ── Shared action modal ── */
    var modal = document.getElementById('actionModal');
    var overlay = document.getElementById('actionOverlay');
    var closeBtn = document.getElementById('actionClose');
    var titleEl = document.getElementById('actionTitle');
    var body = document.getElementById('actionBody');
    if (!modal) return;

    function open() { modal.style.display = 'flex'; }
    function close() { modal.style.display = 'none'; body.innerHTML = ''; }
    overlay.addEventListener('click', close);
    closeBtn.addEventListener('click', close);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

    document.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-action-modal]');
      if (!btn) return;
      var type = btn.getAttribute('data-action-modal');
      var title = btn.getAttribute('data-modal-title') || '';
      titleEl.textContent = title;
      var html = '';

      if (type === 'move') {
        html = '<form method="post" action="' + btn.getAttribute('data-action-url') + '">'
          + '<input type="hidden" name="_csrf" value="' + btn.getAttribute('data-csrf') + '">'
          + '<input type="hidden" name="returnFolder" value="' + btn.getAttribute('data-folder') + '">'
          + '<input type="hidden" name="returnView" value="' + btn.getAttribute('data-view') + '">'
          + '<div class="ad-form-group"><label class="ad-label">移动到文件夹</label>'
          + '<select name="folderId" class="ad-select">' + btn.getAttribute('data-options') + '</select></div>'
          + '<div class="ad-actions"><button type="button" class="ad-btn-cancel" id="actionCancelBtn">取消</button>'
          + '<button type="submit" class="ad-btn-primary">确定移动</button></div></form>';
      } else if (type === 'new-folder') {
        html = '<form method="post" action="' + btn.getAttribute('data-action-url') + '">'
          + '<input type="hidden" name="_csrf" value="' + btn.getAttribute('data-csrf') + '">'
          + '<input type="hidden" name="returnView" value="' + btn.getAttribute('data-view') + '">'
          + '<div class="ad-form-group"><label class="ad-label">文件夹名称</label>'
          + '<input name="name" class="ad-input" required maxlength="80" placeholder="请输入文件夹名称"></div>'
          + '<div class="ad-actions"><button type="button" class="ad-btn-cancel" id="actionCancelBtn">取消</button>'
          + '<button type="submit" class="ad-btn-primary">创建</button></div></form>';
      } else if (type === 'rename-folder') {
        html = '<form method="post" action="' + btn.getAttribute('data-action-url') + '">'
          + '<input type="hidden" name="_csrf" value="' + btn.getAttribute('data-csrf') + '">'
          + '<input type="hidden" name="returnFolder" value="' + btn.getAttribute('data-folder') + '">'
          + '<div class="ad-form-group"><label class="ad-label">新文件夹名称</label>'
          + '<input name="name" class="ad-input" required maxlength="80" value="' + btn.getAttribute('data-current-name') + '"></div>'
          + '<div class="ad-actions"><button type="button" class="ad-btn-cancel" id="actionCancelBtn">取消</button>'
          + '<button type="submit" class="ad-btn-primary">保存</button></div></form>';
      }

      body.innerHTML = html;
      open();
      var input = body.querySelector('input[name="name"]');
      if (input) { input.focus(); input.select(); }

      var cancelBtn = body.querySelector('#actionCancelBtn');
      if (cancelBtn) cancelBtn.addEventListener('click', close);
    });
  })();
  </script>
</body>
</html>`;
}

function fileKindIcon(kind) {
  const icon = iconFile(kind);
  if (icon) {
    return `<img class="type-icon" src="/admin-static/file-icons/${icon}" alt="">`;
  }
  if (kind === 'zip') {
    return '<svg viewBox="0 0 1024 1024" aria-hidden="true"><path d="M590.222222 73.955556L859.022222 342.254933V876.088889c0 37.700267-30.5664 68.266667-68.266666 68.266667H233.244444c-37.700267 0-68.266667-30.5664-68.266666-68.266667V142.222222c0-37.700267 30.5664-68.266667 68.266666-68.266666h356.977778z m-11.764622 28.444444H233.244444a39.822222 39.822222 0 0 0-39.799466 38.456889L193.422222 142.222222v733.866667a39.822222 39.822222 0 0 0 38.456889 39.799467L233.244444 915.911111h557.511112a39.822222 39.822222 0 0 0 39.799466-38.456889L830.577778 876.088889V354.053689L578.4576 102.4z" fill="#9254DE"></path><path d="M854.755556 370.648178h-215.1424c-45.528178 0-82.551467-36.431644-83.5072-81.737956l-0.017067-1.792V73.955556h28.444444v213.162666c0 29.895111 23.819378 54.232178 53.515378 55.062756l1.564445 0.022755h215.1424v28.444445z" fill="#9254DE"></path><path d="M56.888889 489.244444m28.444444 0l853.333334 0q28.444444 0 28.444444 28.444445l0 284.444444q0 28.444444-28.444444 28.444445l-853.333334 0q-28.444444 0-28.444444-28.444445l0-284.444444q0-28.444444 28.444444-28.444445Z" fill="#9254DE"></path><path d="M452.124444 756.622222v-38.4h-82.944l82.176-124.672v-27.648H320.796444v38.144h74.24l-82.176 124.928V756.622222h139.264z m77.056 0V565.902222h-45.824V756.622222h45.824z m89.6 0v-63.232h22.272c40.448 0 75.264-19.968 75.264-65.28 0-47.104-34.56-62.208-76.288-62.208h-67.072V756.622222h45.824z m19.968-99.328h-19.968v-55.04h18.688c22.016 0 34.304 6.656 34.304 25.856 0 18.688-10.752 29.184-33.024 29.184z" fill="#FFFFFF"></path></svg>';
  }
  if (kind === 'folder') {
    return '<svg viewBox="0 0 1024 1024" aria-hidden="true"><path d="M128 224h286l72 80h410c40 0 72 32 72 72v416c0 40-32 72-72 72H200c-40 0-72-32-72-72V296c0-40 32-72 72-72z" fill="#FAAD14"/><path d="M128 400h768v392c0 40-32 72-72 72H200c-40 0-72-32-72-72V400z" fill="#FFD666"/></svg>';
  }
  return '<svg viewBox="0 0 1024 1024" aria-hidden="true"><path d="M901.632 926.72c0 12.8-5.12 25.088-14.336 34.304-9.216 9.216-21.504 14.336-34.304 14.336H170.496c-12.8 0-25.6-5.12-34.304-14.336-9.216-9.216-14.336-21.504-14.336-34.304V48.64c0-12.8 5.12-25.6 14.336-34.304C144.896 5.12 157.696 0 170.496 0h418.816c12.8 0 25.6 5.12 34.816 14.336l263.68 263.68c9.216 9.216 14.336 21.504 14.336 34.816V926.72h-0.512z" fill="#EBECF0"></path><path d="M901.632 926.72v48.64c0 12.8-5.12 25.6-14.336 34.304-9.216 9.216-21.504 14.336-34.304 14.336H170.496c-27.136 0-48.64-22.016-48.64-48.64v-48.64c0 12.8 5.12 25.088 14.336 34.304 9.216 9.216 21.504 14.336 34.304 14.336h682.496c27.136 0 48.64-22.016 48.64-48.64z" fill="#C1C7D0"></path><path d="M24.064 536.576h975.36v243.712c0 27.136-22.016 48.64-48.64 48.64H73.216c-12.8 0-25.6-5.12-34.304-14.336-9.216-9.216-14.336-21.504-14.336-34.816v-243.2h-0.512z" fill="#E85C2A"></path><path d="M121.856 536.576v-97.792l-97.792 97.792h97.792z m779.776 0l1.024-97.792 97.28 97.792h-98.304z" fill="#B83E18"></path><path d="M901.632 312.832v6.656h-263.68c-27.136 0-48.64-22.016-48.64-48.64V0c12.8 0 25.6 5.12 34.816 14.336l264.192 263.68c8.704 9.216 13.824 21.504 13.312 34.816z" fill="#C1C7D0"></path><path d="M157.208 778V588h38.363v74.782h75.17V588h38.363v190h-38.363v-83.076h-75.17V778z m234.325 0V620.142h-56.378V588h150.989v32.142h-56.248V778z m118.847 0V588h57.415l34.474 129.604L636.355 588H693.9v190h-35.641V628.437L620.544 778h-36.938l-37.585-149.563V778z m222.66 0V589.555h38.363v156.433h95.389V778z" fill="#FFFFFF"></path></svg>';
}

module.exports = {
  layout,
  escapeHtml,
  formatBytes,
  iconSvg,
  fileKindIcon,
  themeToggleButton,
  renderToast,
  statCard
};
