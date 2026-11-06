function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildMenuTree(pages, activeId, slug) {
  function renderNode(node, depth) {
    const href = `/portal/${slug}/${node.routePath}`;
    const isActive = node.id === activeId;
    const hasChildren = node.children && node.children.length > 0;
    const childrenHtml = hasChildren
      ? `<ul>${node.children.filter((c) => c.visible !== false).map((c) => renderNode(c, depth + 1)).join('')}</ul>`
      : '';
    const iconHtml = node.icon ? `<span class="pm-icon">${escapeHtml(node.icon)}</span>` : '';
    return `<li class="pm-item${isActive ? ' is-active' : ''}${hasChildren ? ' has-children' : ''}">
      <a href="${escapeHtml(href)}" class="pm-link">${iconHtml}<span>${escapeHtml(node.title)}</span>${hasChildren ? '<span class="pm-caret">▾</span>' : ''}</a>
      ${childrenHtml}
    </li>`;
  }
  return `<ul class="pm-list depth-0">${pages.filter((p) => p.visible !== false).map((n) => renderNode(n, 0)).join('')}</ul>`;
}

function portalLayout({ portal, menuTree, content, currentPage, baseHref, currentUser }) {
  const themeClass = portal.theme === 'dark' ? 'portal-dark' : 'portal-light';
  const layoutClass = portal.layout === 'sidebar' ? 'portal-layout-sidebar' : 'portal-layout-topbar';
  const title = currentPage ? `${currentPage.title} - ${portal.name}` : portal.name;
  const logoHtml = portal.logoUrl
    ? `<img src="${escapeHtml(portal.logoUrl)}" alt="${escapeHtml(portal.name)}" class="portal-brand-logo">`
    : `<span class="portal-brand-text">${escapeHtml(portal.name.slice(0, 2))}</span>`;

  const brand = `<a href="/portal/${portal.slug}" class="portal-brand" title="${escapeHtml(portal.name)}">
    ${logoHtml}
    <span class="portal-brand-name">${escapeHtml(portal.name)}</span>
  </a>`;

  let shell;
  if (portal.layout === 'sidebar') {
    shell = `
      <aside class="portal-side">
        ${brand}
        <nav class="portal-nav">${menuTree}</nav>
        ${currentUser ? `<div class="portal-user">${escapeHtml(currentUser.username)}</div>` : ''}
      </aside>
      <main class="portal-main">
        <header class="portal-topbar">
          <div class="portal-topbar-title">${currentPage ? escapeHtml(currentPage.title) : ''}</div>
          ${currentUser ? `<a href="/logout" class="portal-logout">退出</a>` : ''}
        </header>
        <div class="portal-content">${content}</div>
      </main>
    `;
  } else {
    shell = `
      <header class="portal-topbar">
        ${brand}
        <nav class="portal-nav">${menuTree}</nav>
        <div class="portal-topbar-right">
          ${currentUser ? `<a href="/logout" class="portal-logout">退出</a>` : ''}
        </div>
      </header>
      <main class="portal-main">
        <div class="portal-content">${content}</div>
      </main>
    `;
  }

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="/portal-static/portal.css">
</head>
<body class="${themeClass} ${layoutClass}">
  ${shell}
  ${baseHref ? `<script>
    (function(){
      var base = document.createElement('base');
      base.href = ${JSON.stringify(baseHref)};
      document.head.appendChild(base);
    })();
  </script>` : ''}
</body>
</html>`;
}

function portalLoginPage({ portal, csrfToken, error, next }) {
  const title = `登录 - ${portal.name}`;
  const loginMessage = portal.loginMessage || `请登录后访问「${portal.name}」`;
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="/portal-static/portal.css">
</head>
<body class="portal-light portal-login-body">
  <div class="portal-login-wrap">
    <div class="portal-login-card">
      <div class="portal-login-brand">
        ${portal.logoUrl ? `<img src="${escapeHtml(portal.logoUrl)}" alt="${escapeHtml(portal.name)}" class="portal-brand-logo-lg">` : `<span class="portal-brand-text-lg">${escapeHtml(portal.name.slice(0, 2))}</span>`}
        <div class="portal-login-title">${escapeHtml(portal.name)}</div>
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

module.exports = { portalLayout, portalLoginPage, buildMenuTree };
