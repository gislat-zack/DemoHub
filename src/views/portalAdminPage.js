const { layout, escapeHtml, renderToast } = require('./layout');

const LUCIDE_CDN = 'https://cdn.jsdelivr.net/npm/lucide@0.468/dist/umd/lucide.min.js';

// 精选适合导航菜单的 Lucide 图标，按类别分组
const PAGE_ICON_GROUPS = [
  { label: '基础', icons: ['home','layout-dashboard','layout-grid','layout-template','menu','menu-square','grid','square','circle','box','boxes'] },
  { label: '文件夹/文件', icons: ['folder','folder-tree','folder-kanban','folder-closed','file','file-text','file-code','file-spreadsheet','file-presentation','file-image','file-video','file-volume','file-json'] },
  { label: '媒体', icons: ['image','images','video','film','monitor','monitor-play','monitor-smartphone','monitor-speaker','tv','laptop','smartphone','tablet','camera','headphones','speaker','volume','volume-2','volume-off','music'] },
  { label: '网络/云', icons: ['globe','earth','cloud','cloud-directory','cloud-upload','cloud-download','server','database','hard-drive','wifi','bluetooth','zap','link','unlink','rss'] },
  { label: '地理/导航', icons: ['map','map-pin','map-pin-off','map-pinned','compass','navigation','flag','flag-off','anchor','map-pin-check','map-pin-x'] },
  { label: '书籍/学习', icons: ['book-open','book-marked','book-copy','library','library-big','graduation-cap','certificate','school'] },
  { label: '商业/财务', icons: ['shopping-cart','shopping-bag','credit-card','wallet','receipt','banknote','coins','dollar-sign','euro','tag','tags','percent','cart','store'] },
  { label: '统计/图表', icons: ['bar-chart','bar-chart-horizontal','line-chart','pie-chart','trending-up','trending-down','activity','chart-bar-big','chart-column-big'] },
  { label: '沟通', icons: ['mail','mail-check','mail-minus','mail-plus','mail-question','mail-warning','inbox','send','message-circle','message-square','messages-circle','messages-square','phone','phone-call','phone-forward','phone-incoming','phone-missed','phone-off','phone-outgoing','call'] },
  { label: '设置/工具', icons: ['settings','sliders','sliders-horizontal','wrench','cog','panel-left','panel-right','panel-top','panel-bottom','palette','paintbrush','pencil','edit','code','code-square','code-xml','terminal','bug','key','key-round','lock','unlock','shield','shield-check','shield-alert','shield-off'] },
  { label: '状态/表情', icons: ['star','star-off','heart','heart-crack','thumbs-up','thumbs-down','smile','frown','meh','zap','flame','trophy','gift','target','crosshair','award','medal'] },
  { label: '天气/自然', icons: ['sun','sunrise','sunset','moon','cloud-sun','cloud-moon','snowflake','wind','waves','droplet','thermometer','leaf','flower-2'] }
];

const PAGE_ICONS = Array.from(new Set(PAGE_ICON_GROUPS.flatMap((g) => g.icons)));

function buildSiteSelectOptions(sites, selectedId) {
  if (!sites || sites.length === 0) return '<option value="">（请先在网站管理中上传站点）</option>';
  return sites.map((s) => {
    const label = s.originalName || s.id.slice(0, 8);
    return `<option value="${escapeHtml(s.id)}" ${s.id === selectedId ? 'selected' : ''}>${escapeHtml(label)}</option>`;
  }).join('');
}

function indexPages(pages) {
  const byId = new Map((pages || []).map((p) => [p.id, { ...p, children: [] }]));
  const roots = [];
  for (const page of pages || []) {
    const node = byId.get(page.id);
    if (page.parentId && byId.has(page.parentId)) byId.get(page.parentId).children.push(node);
    else roots.push(node);
  }
  return { byId, roots };
}

function collectDescendants(byId, id) {
  const ids = new Set([id]);
  function walk(nodeId) {
    const node = byId.get(nodeId);
    if (!node) return;
    for (const child of node.children || []) { ids.add(child.id); walk(child.id); }
  }
  walk(id);
  return ids;
}

function buildPageOptionsTree(pages, currentId, selectedParentId) {
  const { byId, roots } = indexPages(pages);
  const blocked = currentId ? collectDescendants(byId, currentId) : new Set();
  function render(node, depth) {
    if (blocked.has(node.id)) return '';
    const indent = depth === 0 ? '' : '　'.repeat(depth);
    const selected = node.id === selectedParentId ? ' selected' : '';
    return `<option value="${escapeHtml(node.id)}"${selected}>${indent}${escapeHtml(node.title)}</option>`
      + (node.children || []).map((c) => render(c, depth + 1)).join('');
  }
  return '<option value="">（顶级导航）</option>' + roots.map((n) => render(n, 0)).join('');
}

function siteLabel(sites, siteId) {
  const site = (sites || []).find((item) => item.id === siteId);
  if (!site) return '—';
  return site.originalName || site.id.slice(0, 8);
}

function renderMenuTable(pages, portal, sites, activePageId) {
  const { roots } = indexPages(pages);
  if (roots.length === 0) return `<div class="ppa-tree-empty">还没有菜单，点击右上角「添加顶级菜单」</div>`;
  const rows = [];
  function walk(node, depth) {
    const hasKids = (node.children || []).length > 0;
    const active = node.id === activePageId ? ' is-active' : '';
    rows.push(`<tr class="ppa-row${active}" data-id="${escapeHtml(node.id)}" data-parent="${escapeHtml(node.parentId || '')}">
      <td class="ppa-name">
        <span class="ppa-name-inner" style="padding-left:${depth * 18}px">
          <button type="button" class="ppa-fold" data-fold="${escapeHtml(node.id)}" ${hasKids ? '' : 'disabled'} aria-label="展开或收起">${hasKids ? '▾' : ''}</button>
          <span class="ppa-tree-mark">${node.icon ? `<i data-lucide="${escapeHtml(node.icon)}"></i>` : ''}</span>
          <span class="ppa-tree-label">${escapeHtml(node.title)}</span>
        </span>
      </td>
      <td>${escapeHtml(node.routePath || '—')}</td>
      <td>${node.linkType === 'url' ? '外部 URL' : '内部站点'}</td>
      <td class="ppa-target" title="${escapeHtml(node.linkType === 'url' ? node.externalUrl : siteLabel(sites, node.siteId))}">${escapeHtml(node.linkType === 'url' ? (node.externalUrl || '—') : siteLabel(sites, node.siteId))}${node.linkType === 'url' ? `<span class="ppa-badge${node.openMode === 'blank' ? ' muted' : ''}">${node.openMode === 'blank' ? '新窗口' : '内嵌'}</span>` : ''}</td>
      <td class="ppa-status">
        <span class="ppa-badge${node.visible ? ' ok' : ' muted'}">${node.visible ? '显示' : '隐藏'}</span>
        ${node.isDefault ? '<span class="ppa-badge">默认</span>' : ''}
      </td>
      <td class="ppa-ops">
        <a href="/admin/portals/${escapeHtml(portal.id)}?page=${escapeHtml(node.id)}">编辑</a>
        <a href="/admin/portals/${escapeHtml(portal.id)}?add=1&parent=${escapeHtml(node.id)}">添加子菜单</a>
      </td>
    </tr>`);
    (node.children || []).forEach((child) => walk(child, depth + 1));
  }
  roots.forEach((node) => walk(node, 0));
  return `<table class="ppa-table">
    <thead><tr>
      <th>菜单名称</th><th>路径</th><th>类型</th><th>目标</th><th>状态</th><th>操作</th>
    </tr></thead>
    <tbody>${rows.join('')}</tbody>
  </table>`;
}

function portalListIcon(portal) {
  const icons = ['layout-dashboard', 'globe', 'library', 'store', 'compass', 'boxes', 'monitor', 'book-open', 'flag', 'layers'];
  const key = String(portal.id || portal.slug || portal.name || '');
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash + key.charCodeAt(i) * (i + 1)) % icons.length;
  return icons[hash];
}

function portalListColor(theme) {
  const mapped = LEGACY_ACCENTS[theme] || theme;
  const item = PORTAL_ACCENTS.find((entry) => entry.id === mapped);
  return item ? item.color : PORTAL_ACCENTS[0].color;
}

function renderSidebar({ portals, selectedPortal, query }) {
  const creating = !selectedPortal && query.create === '1';
  const portalNodes = (portals || []).map((portal) => {
    const active = selectedPortal && portal.id === selectedPortal.id ? ' active' : '';
    return `<a class="ppa-side-link${active}" href="/admin/portals/${escapeHtml(portal.id)}">
      <span class="ppa-side-mark" style="background:${escapeHtml(portalListColor(portal.theme))}"><i data-lucide="${escapeHtml(portalListIcon(portal))}"></i></span>
      <span class="ppa-side-name">${escapeHtml(portal.name)}</span>
    </a>`;
  }).join('');
  return `<a class="ppa-side-link ppa-side-create${creating ? ' active' : ''}" href="/admin/portals?create=1">＋ 新建门户</a>
    ${portals.length ? '<div class="ppa-menu-sep">门户</div>' : ''}${portalNodes}`;
}

const PORTAL_ACCENTS = [
  { id: 'jingtai', name: '景泰蓝', color: '#2b71ff' },
  { id: 'lotus', name: '荷叶绿', color: '#3ab465' },
  { id: 'vivid', name: '活力红', color: '#ef413e' },
  { id: 'newyear', name: '跨年红', color: '#e62f54' },
  { id: 'soe', name: '国企绿', color: '#459375' },
  { id: 'ink', name: '稳重黑', color: '#272b34' },
  { id: 'fashion', name: '时尚蓝', color: '#5266e4' },
  { id: 'china', name: '中国红', color: '#cf3b38' },
  { id: 'youth', name: '青春绿', color: '#3ea378' }
];

const LEGACY_ACCENTS = {
  blue: 'jingtai', light: 'jingtai', white: 'jingtai',
  red: 'vivid', orange: 'vivid',
  green: 'lotus',
  cyan: 'fashion', purple: 'fashion',
  dark: 'ink'
};

function accentPicker(theme) {
  const mapped = LEGACY_ACCENTS[theme] || theme;
  const current = PORTAL_ACCENTS.some((item) => item.id === mapped) ? mapped : 'jingtai';
  return `<div class="ppa-accent-picker">${PORTAL_ACCENTS.map((item) => `
    <label class="ppa-accent-option${item.id === current ? ' active' : ''}" style="--swatch:${item.color}">
      <input type="radio" name="theme" value="${item.id}" ${item.id === current ? 'checked' : ''}>
      <span>${item.name}</span>
    </label>`).join('')}</div>`;
}

function layoutPicker(name, value) {
  const top = value !== 'sidebar';
  const topbarSvg = `<svg viewBox="0 0 140 80" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="0" y="0" width="140" height="80" rx="6" fill="var(--surface-2,#eef0f3)"/>
    <rect x="0" y="0" width="140" height="20" rx="6" fill="var(--primary,#1677ff)"/>
    <rect x="0" y="14" width="140" height="6" fill="var(--primary,#1677ff)"/>
    <circle cx="12" cy="10" r="4" fill="#fff" opacity=".85"/>
    <rect x="22" y="5" width="28" height="10" rx="2" fill="#fff" opacity=".9"/>
    <rect x="58" y="6" width="18" height="8" rx="2" fill="#fff" opacity=".55"/>
    <rect x="80" y="6" width="14" height="8" rx="2" fill="#fff" opacity=".55"/>
    <rect x="98" y="6" width="22" height="8" rx="2" fill="#fff" opacity=".55"/>
    <rect x="10" y="30" width="120" height="8" rx="2" fill="var(--primary,#1677ff)" opacity=".7"/>
    <rect x="10" y="44" width="88" height="4" rx="2" fill="var(--text-2,#6b7280)" opacity=".35"/>
    <rect x="10" y="52" width="100" height="4" rx="2" fill="var(--text-2,#6b7280)" opacity=".25"/>
    <rect x="10" y="60" width="70" height="10" rx="3" fill="var(--primary-soft,#e6f0ff)"/>
  </svg>`;
  const sidebarSvg = `<svg viewBox="0 0 140 80" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="0" y="0" width="140" height="80" rx="6" fill="var(--surface-2,#eef0f3)"/>
    <rect x="0" y="0" width="36" height="80" rx="6" fill="var(--primary,#1677ff)"/>
    <rect x="0" y="20" width="36" height="60" fill="var(--primary,#1677ff)"/>
    <circle cx="18" cy="10" r="4" fill="#fff" opacity=".85"/>
    <rect x="6" y="22" width="24" height="6" rx="2" fill="#fff" opacity=".95"/>
    <rect x="6" y="32" width="24" height="6" rx="2" fill="#fff" opacity=".5"/>
    <rect x="6" y="42" width="24" height="6" rx="2" fill="#fff" opacity=".5"/>
    <rect x="6" y="52" width="24" height="6" rx="2" fill="#fff" opacity=".5"/>
    <rect x="6" y="62" width="16" height="6" rx="2" fill="#fff" opacity=".5"/>
    <rect x="46" y="12" width="70" height="8" rx="2" fill="var(--primary,#1677ff)" opacity=".7"/>
    <rect x="46" y="28" width="84" height="4" rx="2" fill="var(--text-2,#6b7280)" opacity=".35"/>
    <rect x="46" y="36" width="72" height="4" rx="2" fill="var(--text-2,#6b7280)" opacity=".25"/>
    <rect x="46" y="48" width="44" height="20" rx="4" fill="var(--primary-soft,#e6f0ff)"/>
  </svg>`;
  return `<div class="ppa-layout-picker">
    <label class="ppa-layout-option${top ? ' active' : ''}" data-layout="topbar">
      <input type="radio" name="${name}" value="topbar" ${top ? 'checked' : ''}>
      <div class="ppa-layout-visual">${topbarSvg}</div><span>顶栏布局</span>
    </label>
    <label class="ppa-layout-option${!top ? ' active' : ''}" data-layout="sidebar">
      <input type="radio" name="${name}" value="sidebar" ${!top ? 'checked' : ''}>
      <div class="ppa-layout-visual">${sidebarSvg}</div><span>侧边栏布局</span>
    </label></div>`;
}

function renderCreatePanel(csrfToken) {
  return `<div class="settings-card"><div class="settings-title">新建门户</div>
    <p class="ppa-hint">创建后进入该门户，在右侧菜单里继续添加导航。</p>
    <form class="ppa-site-form" method="post" action="/admin/portals">
      <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
      <label><span>门户名称</span><input name="name" maxlength="50" required placeholder="如：产品演示门户"></label>
      <label><span>URL 标识</span>
        <input name="slug" maxlength="50" required pattern="^[a-z0-9][a-z0-9-]{1,49}$" placeholder="如：product-demo">
        <span class="ppa-field-note">访问地址 /portal/标识，只能使用小写字母、数字和连字符</span></label>
      <label><span>描述</span><textarea name="description" maxlength="200" placeholder="可选"></textarea></label>
      <label><span>布局方式</span>${layoutPicker('layout', 'topbar')}</label>
      <div class="settings-actions"><button type="submit">创建</button></div>
    </form></div>`;
}

function renderPortalEditor(portal, csrfToken, closeHref) {
  const field = (label, control, extra = '', required = false) => `<div class="ant-form-item">
      <div class="ant-form-item-label">${required ? '<span class="ant-form-item-required"></span>' : ''}<label>${label}</label></div>
      <div class="ant-form-item-control">${control}${extra ? `<div class="ant-form-item-extra">${extra}</div>` : ''}</div>
    </div>`;
  const row = (left, right) => `<div class="ant-form-row">${left}${right}</div>`;
  return `<div class="ppa-settings">
    <div class="ant-modal-header"><div class="ant-modal-title">门户设置</div></div>
    <form id="ppa-portal-form" class="ant-form" method="post" action="/admin/portals/${escapeHtml(portal.id)}" enctype="multipart/form-data">
      <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
      <div class="ant-modal-body">
        ${row(
          field('门户名称', `<input class="ant-input" name="name" value="${escapeHtml(portal.name)}" maxlength="50" required>`, '', true),
          field('URL 标识', `<input class="ant-input" name="slug" value="${escapeHtml(portal.slug)}" maxlength="50" required pattern="^[a-z0-9][a-z0-9-]{1,49}$">`, '小写字母、数字和连字符', true)
        )}
        ${field('描述', `<input class="ant-input" name="description" maxlength="200" value="${escapeHtml(portal.description)}" placeholder="可选">`)}
        ${field('自定义 Logo', `<div class="ant-logo-row"><label class="ant-btn">上传<input type="file" name="logo" accept=".png,.jpg,.jpeg,.gif,.svg,.webp"></label>${portal.logoUrl ? '<label class="ant-checkbox"><input type="checkbox" name="removeLogo"><span>改用系统 Logo</span></label>' : ''}</div>`, '不上传则保持不变；未设置时使用系统 Logo。png / jpg / gif / svg / webp，不超过 2MB')}
        ${field('布局', layoutPicker('layout', portal.layout))}
        ${field('主题配色', accentPicker(portal.theme))}
        ${row(
          field('状态', `<select class="ant-input" name="status"><option value="active" ${portal.status === 'active' ? 'selected' : ''}>启用</option><option value="disabled" ${portal.status === 'disabled' ? 'selected' : ''}>禁用</option></select>`),
          field('访问控制', `<label class="ant-checkbox"><input type="checkbox" name="loginRequired" ${portal.loginRequired ? 'checked' : ''}>需要登录后访问</label>`)
        )}
        ${field('登录提示', `<input class="ant-input" name="loginMessage" value="${escapeHtml(portal.loginMessage)}" maxlength="200" placeholder="可选，显示在登录页">`)}
      </div>
    </form>
    <div class="ant-modal-footer">
      <form class="ant-footer-danger" method="post" action="/admin/portals/${escapeHtml(portal.id)}/delete" onsubmit="return confirm('确定删除这个门户？删除后不可恢复。')">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
        <button type="submit" class="ant-btn ant-btn-dangerous">删除门户</button>
      </form>
      <div class="ant-footer-actions">
        <a class="ant-btn" href="${escapeHtml(closeHref)}">取消</a>
        <a class="ant-btn" href="/portal/${escapeHtml(portal.slug)}" target="_blank" rel="noopener">预览</a>
        <button class="ant-btn ant-btn-primary" type="submit" form="ppa-portal-form">保存</button>
      </div>
    </div>
  </div>`;
}

function renderIconField(currentIcon) {
  const sections = PAGE_ICON_GROUPS.map((group) => `
    <div class="ppa-icon-group" data-icon-group="${escapeHtml(group.label)}">
      <div class="ppa-icon-group-title">${escapeHtml(group.label)}</div>
      <div class="ppa-icon-grid">
        ${group.icons.map((n) => `<button type="button" class="ppa-icon-cell${n === currentIcon ? ' active' : ''}" data-icon="${escapeHtml(n)}"><i data-lucide="${escapeHtml(n)}"></i><span>${escapeHtml(n)}</span></button>`).join('')}
      </div>
    </div>`).join('');
  return `<label><span>图标</span>
    <div class="ppa-icon-row">
      <input name="icon" id="ppaIconInput" maxlength="30" value="${escapeHtml(currentIcon || '')}" placeholder="点击右侧选择图标">
      <button type="button" class="ppa-icon-btn" data-open-icon-picker>选择图标</button>
      ${currentIcon ? `<button type="button" class="ppa-icon-clear" data-clear-icon>清除</button>` : ''}
    </div>
  </label>
  <div class="ppa-icon-modal" id="ppaIconModal" hidden>
    <div class="ppa-icon-mask"></div>
    <div class="ppa-icon-modal-box">
      <div class="ppa-icon-modal-head">
        <input type="text" class="ppa-icon-search" placeholder="搜索图标…" data-icon-search>
        <button type="button" class="ppa-icon-close" data-close-icon-picker>✕</button>
      </div>
      <div class="ppa-icon-body" data-icon-body>${sections}</div>
    </div>
  </div>`;
}

function nextSort(pages, parentId) {
  const siblings = (pages || []).filter((item) => (parentId ? item.parentId === parentId : !item.parentId));
  return siblings.reduce((max, item) => Math.max(max, Number(item.sortOrder) || 0), -1) + 1;
}

function renderPageForm({ portal, pages, sites, csrfToken, page = null, parentId = '', asRoot = false }) {
  const isEdit = Boolean(page);
  const action = isEdit ? `/admin/portals/${escapeHtml(portal.id)}/pages/${escapeHtml(page.id)}` : `/admin/portals/${escapeHtml(portal.id)}/pages`;
  const parent = !isEdit && parentId ? (pages || []).find((item) => item.id === parentId) : null;
  const title = isEdit ? '编辑导航' : (asRoot ? '添加顶级菜单' : '添加子菜单');
  const hint = asRoot
    ? '会新增一条顶级菜单，和已有顶级菜单并列，不会挂到现有菜单下面。'
    : (parent ? `将添加到「${escapeHtml(parent.title)}」下面。` : '');
  const parentField = isEdit
    ? `<label><span>上级导航</span><select name="parentId">${buildPageOptionsTree(pages, page.id, page.parentId)}</select></label>`
    : (asRoot
      ? '<input type="hidden" name="asRoot" value="1"><input type="hidden" name="parentId" value="">'
      : `<input type="hidden" name="parentId" value="${escapeHtml(parentId)}">`);
  return `<div class="settings-card"><div class="settings-title">${title}</div>
    ${hint ? `<p class="ppa-hint">${hint}</p>` : ''}
    <form class="ppa-site-form" method="post" action="${action}" autocomplete="off">
      <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
      ${parentField}
      <label><span>名称</span><input name="title" required maxlength="60" value="${escapeHtml(page ? page.title : '')}" placeholder="如：产品功能"></label>
      <label><span>路径</span>
        <input name="routePath" maxlength="100" pattern="^[a-z0-9][a-z0-9\\-/]*$" value="${escapeHtml(page ? page.routePath : '')}" placeholder="留空则自动生成">
        <span class="ppa-field-note">可不填。填写后用于访问地址 /portal/${escapeHtml(portal.slug)}/路径</span></label>
      <label><span>类型</span>
        <select name="linkType" id="ppaLinkType">
          <option value="site" ${!page || page.linkType !== 'url' ? 'selected' : ''}>内部站点</option>
          <option value="url" ${page && page.linkType === 'url' ? 'selected' : ''}>外部 URL</option>
        </select></label>
      <div data-link-panel="site" ${page && page.linkType === 'url' ? 'hidden' : ''}>
        <label><span>关联站点</span><select name="siteId">${buildSiteSelectOptions(sites, page ? page.siteId : '')}</select></label>
      </div>
      <div data-link-panel="url" ${!page || page.linkType !== 'url' ? 'hidden' : ''}>
        <label><span>外部地址</span><input name="externalUrl" value="${escapeHtml(page && page.externalUrl ? page.externalUrl : '')}" placeholder="https://example.com"></label>
        <label><span>打开方式</span>
          <select name="openMode">
            <option value="embed" ${!page || page.openMode !== 'blank' ? 'selected' : ''}>内嵌</option>
            <option value="blank" ${page && page.openMode === 'blank' ? 'selected' : ''}>新窗口</option>
          </select>
          <span class="ppa-field-note">内嵌时如果对方网站拒绝嵌入，页面上会提供新窗口打开。</span>
        </label>
      </div>
      ${renderIconField(page ? page.icon : 'file-text')}
      <label><span>排序</span><input name="sortOrder" type="number" value="${page ? Number(page.sortOrder) || 0 : nextSort(pages, asRoot ? '' : parentId)}"></label>
      <div class="ppa-check-row">
        <label><input type="checkbox" name="isDefault" ${page && page.isDefault ? 'checked' : ''}> 设为默认页</label>
        <label><input type="checkbox" name="visible" ${!page || page.visible ? 'checked' : ''}> 在菜单中显示</label>
      </div>
      <div class="settings-actions">
        <button type="submit">${isEdit ? '保存' : '添加'}</button>
        <a class="btn" href="/admin/portals/${escapeHtml(portal.id)}">取消</a>
        ${isEdit ? `<a class="btn" href="/portal/${escapeHtml(portal.slug)}/${escapeHtml(page.routePath)}" target="_blank">预览</a>` : ''}
      </div></form>
    ${isEdit ? `<form class="ppa-delete-form" method="post" action="/admin/portals/${escapeHtml(portal.id)}/pages/${escapeHtml(page.id)}/delete">
      <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
      <button type="button" class="ppa-arm-delete">删除导航</button>
      <button type="submit" class="ppa-confirm-delete" hidden>确认删除，子导航将上移</button>
    </form>` : ''}</div>`;
}

function renderModal(closeHref, body) {
  const close = escapeHtml(closeHref);
  return `<div class="ppa-modal is-open" role="dialog" aria-modal="true">
    <a class="ppa-modal-mask" href="${close}" aria-label="关闭"></a>
    <div class="ppa-modal-box">
      <a class="ppa-modal-close" href="${close}" aria-label="关闭">&times;</a>
      ${body}
    </div>
  </div>`;
}

function renderMenuPanel(portal, pages, sites, query) {
  const activePageId = query.add === '1' ? '' : String(query.page || '');
  return `<div class="ppa-menu">
    <div class="ppa-menu-head">
      <div class="ppa-menu-titlewrap">
        <div class="ppa-menu-title">${escapeHtml(portal.name)}</div>
        <div class="ppa-menu-sub">/portal/${escapeHtml(portal.slug)}</div>
      </div>
      <div class="ppa-menu-actions">
        <a class="btn" href="/admin/portals/${escapeHtml(portal.id)}?settings=1">门户设置</a>
        <a class="btn" href="/portal/${escapeHtml(portal.slug)}" target="_blank" rel="noopener">预览</a>
        <a class="btn btn-primary" href="/admin/portals/${escapeHtml(portal.id)}?add=1&asRoot=1">添加顶级菜单</a>
      </div>
    </div>
    <div class="ppa-tree-wrap">${renderMenuTable(pages, portal, sites, activePageId)}</div>
  </div>`;
}

function portalAdminPage({ portals, sites, selectedPortal, pages = [], query, currentUser, csrfToken, settings, dataSize, diskStats }) {
  const toast = query.created ? renderToast('门户已创建。可以在右侧添加菜单。')
    : query.updated ? renderToast('门户设置已保存。')
    : query.deleted ? renderToast('门户已删除。')
    : query.pageAdded ? renderToast('导航已添加。')
    : query.pageUpdated ? renderToast('导航已保存。')
    : query.pageDeleted ? renderToast('导航已删除。')
    : query.error ? renderToast(query.error, 'error') : '';

  const selectedPage = selectedPortal && query.add !== '1' && query.page
    ? pages.find((p) => p.id === query.page) || null
    : null;
  const closeHref = selectedPortal ? `/admin/portals/${selectedPortal.id}` : '/admin/portals';
  const main = selectedPortal
    ? renderMenuPanel(selectedPortal, pages, sites, query)
    : `<div class="settings-card"><div class="settings-title">菜单</div><div class="ppa-empty">${portals.length ? '从左侧选择一个门户，在这里维护它的菜单。' : '还没有门户。点击左侧「新建门户」开始。'}</div></div>`;

  let modal = '';
  if (!selectedPortal && query.create === '1') {
    modal = renderModal('/admin/portals', renderCreatePanel(csrfToken));
  } else if (selectedPortal && query.settings === '1') {
    modal = renderModal(closeHref, renderPortalEditor(selectedPortal, csrfToken, closeHref));
  } else if (selectedPortal && query.add === '1') {
    modal = renderModal(closeHref, renderPageForm({
      portal: selectedPortal,
      pages,
      sites,
      csrfToken,
      parentId: String(query.parent || ''),
      asRoot: query.asRoot === '1' || !query.parent
    }));
  } else if (selectedPage) {
    modal = renderModal(closeHref, renderPageForm({ portal: selectedPortal, pages, sites, csrfToken, page: selectedPage }));
  }

  return layout({
    title: '门户管理',
    currentUser, csrfToken, activeNav: 'portals', settings, dataSize, diskStats,
    content: `<div class="page-head"><div>
      <div class="page-title">门户管理</div>
      <div class="page-desc">左侧选择门户，右侧维护菜单；门户和菜单的配置在弹窗里完成</div>
    </div></div>${toast}
    <div class="settings-shell ppa-shell">
      <aside class="settings-menu ppa-side">${renderSidebar({ portals, selectedPortal, query })}</aside>
      <div class="settings-main">${main}</div>
    </div>
    ${modal}
    <style>
      .ppa-shell{grid-template-columns:220px minmax(0,1fr)}
      .ppa-side{gap:2px;max-height:calc(100vh - 140px);overflow:auto}
      .ppa-side-link{display:flex;align-items:center;gap:8px;min-width:0;padding:8px 10px;border-radius:8px;color:var(--text-1);text-decoration:none;font-size:14px}
      .ppa-side-mark{width:22px;height:22px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;color:#fff;flex:none}
      .ppa-side-mark i,.ppa-side-mark svg{width:13px;height:13px}
      .ppa-side-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .ppa-side-link:hover{background:var(--surface-2,rgba(0,0,0,.04))}
      .ppa-side-link.active{background:var(--primary-soft);color:var(--primary);font-weight:600}
      .ppa-side-create{background:var(--primary);color:#fff;font-weight:600;justify-content:center;box-shadow:0 4px 14px rgba(var(--primary-rgb,22,119,255),.35)}
      .ppa-side-create:hover{background:var(--primary-dark,rgb(20,105,225));color:#fff}
      .ppa-side-create.active{background:var(--primary);color:#fff;box-shadow:0 2px 8px rgba(var(--primary-rgb,22,119,255),.25)}
      .ppa-menu-sep{padding:10px 10px 4px;font-size:11px;color:var(--text-3)}
      .ppa-menu{min-width:0}
      .ppa-menu-head{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:14px;position:relative;z-index:2}
      .ppa-menu-titlewrap{min-width:0}
      .ppa-menu-title{font-size:16px;font-weight:650;color:var(--text-1)}
      .ppa-menu-sub{margin-top:2px;font-size:12px;color:var(--text-3)}
      .ppa-menu-actions{display:flex;align-items:center;gap:8px;flex:none;position:relative;z-index:2}
      .ppa-menu-actions .btn{height:32px;padding:0 12px;font-size:13px;text-decoration:none}
      .ppa-tree-wrap{border:1px solid var(--border);border-radius:12px;background:var(--surface);overflow:auto}
      .ppa-table{width:100%;border-collapse:collapse;font-size:13px;color:var(--text-1)}
      .ppa-table th{height:40px;padding:0 12px;text-align:left;font-weight:600;color:var(--text-2);background:var(--surface-2,rgba(0,0,0,.03));border-bottom:1px solid var(--border);white-space:nowrap}
      .ppa-table td{height:44px;padding:0 12px;border-bottom:1px solid var(--border);vertical-align:middle}
      .ppa-table tr:last-child td{border-bottom:0}
      .ppa-row.is-active td{background:var(--primary-soft)}
      .ppa-name{min-width:180px}.ppa-name-inner{display:flex;align-items:center;gap:6px;min-width:0}
      .ppa-fold{width:16px;height:16px;padding:0;border:0;background:transparent;color:var(--text-3);cursor:pointer;flex:none;font-size:12px;line-height:16px}
      .ppa-fold:disabled{cursor:default;visibility:hidden}
      .ppa-tree-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .ppa-tree-mark{width:16px;height:16px;flex:none;color:var(--text-3);display:inline-flex;align-items:center;justify-content:center}
      .ppa-tree-mark i{width:16px;height:16px}
      .ppa-status{white-space:nowrap}
      .ppa-ops{white-space:nowrap}
      .ppa-ops a{color:var(--primary);text-decoration:none;margin-right:12px}
      .ppa-ops a:hover{text-decoration:underline}
      .ppa-target{max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .ppa-modal{position:fixed;inset:0;z-index:8000;display:flex;align-items:center;justify-content:center;padding:24px}
      .ppa-modal-box:has(.ppa-settings){width:min(960px,96vw);max-height:none;overflow:visible;border-radius:8px;padding:0}
      .ppa-modal-box:has(.ppa-settings)>.ppa-modal-close{top:8px;right:12px;width:32px;height:32px;border-radius:6px;color:rgba(0,0,0,.45);font-size:20px}
      .ppa-modal-box:has(.ppa-settings)>.ppa-modal-close:hover{background:rgba(0,0,0,.06);color:rgba(0,0,0,.88)}
      .ppa-settings .ant-modal-header{display:flex;align-items:center;height:48px;padding:0 52px 0 24px;border-bottom:1px solid #f0f0f0}
      .ppa-settings .ant-modal-title{font-size:16px;font-weight:600;line-height:1.5;color:rgba(0,0,0,.88)}
      .ppa-settings .ant-modal-body{padding:14px 24px 2px}
      .ppa-settings .ant-form-row{display:grid;grid-template-columns:1fr 1fr;column-gap:24px}
      .ppa-settings .ant-form-item{display:flex;align-items:flex-start;margin-bottom:12px}
      .ppa-settings .ant-form-item-label{flex:0 0 108px;padding-top:5px;text-align:right}
      .ppa-settings .ant-form-item-label label{color:rgba(0,0,0,.88);font-size:14px;line-height:22px}
      .ppa-settings .ant-form-item-label label::after{content:':';margin-inline-start:2px;margin-inline-end:8px}
      .ppa-settings .ant-form-item-required{display:inline-block;margin-inline-end:4px;color:#ff4d4f;font-family:SimSun,sans-serif;line-height:1}
      .ppa-settings .ant-form-item-required::before{content:'*'}
      .ppa-settings .ant-form-item-control{flex:1;min-width:0}
      .ppa-settings .ant-form-item-extra{margin-top:2px;color:rgba(0,0,0,.45);font-size:12px;line-height:1.4}
      .ppa-settings .ant-input{width:100%;height:32px;padding:4px 11px;border:1px solid #d9d9d9;border-radius:6px;background:#fff;color:rgba(0,0,0,.88);font-size:14px;font-family:inherit;outline:none;transition:border-color .2s,box-shadow .2s}
      .ppa-settings select.ant-input{padding-right:28px}
      .ppa-settings .ant-input:hover{border-color:#4096ff}
      .ppa-settings .ant-input:focus{border-color:#1677ff;box-shadow:0 0 0 2px rgba(5,145,255,.1)}
      .ppa-settings .ant-logo-row{display:flex;align-items:center;gap:16px;min-height:32px}
      .ppa-settings .ant-checkbox{display:inline-flex;align-items:center;gap:8px;min-height:32px;color:rgba(0,0,0,.88);font-size:14px;cursor:pointer}
      .ppa-settings .ant-checkbox input{width:16px;height:16px;margin:0;accent-color:#1677ff}
      .ppa-settings .ant-btn{display:inline-flex;align-items:center;justify-content:center;height:32px;padding:4px 15px;border:1px solid #d9d9d9;border-radius:6px;background:#fff;color:rgba(0,0,0,.88);font-size:14px;line-height:1;text-decoration:none;cursor:pointer;box-shadow:0 2px 0 rgba(0,0,0,.02)}
      .ppa-settings .ant-btn:hover{color:#4096ff;border-color:#4096ff}
      .ppa-settings .ant-btn-primary{background:#1677ff;border-color:#1677ff;color:#fff;box-shadow:0 2px 0 rgba(5,145,255,.1)}
      .ppa-settings .ant-btn-primary:hover{background:#4096ff;border-color:#4096ff;color:#fff}
      .ppa-settings .ant-btn-dangerous{color:#ff4d4f;border-color:#ff4d4f;background:#fff;box-shadow:none}
      .ppa-settings .ant-btn-dangerous:hover{color:#ff7875;border-color:#ff7875;background:#fff}
      .ppa-settings .ant-logo-row .ant-btn input{display:none}
      .ppa-settings .ant-modal-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 16px;border-top:1px solid #f0f0f0}
      .ppa-settings .ant-footer-danger,.ppa-settings .ant-footer-actions{display:flex;align-items:center;gap:8px;margin:0}
      .ppa-settings .ppa-layout-picker{gap:8px}
      .ppa-settings .ppa-layout-option{gap:2px;padding:4px 6px;border-radius:8px;background:#fff}
      .ppa-settings .ppa-layout-visual{height:36px}
      .ppa-settings .ppa-accent-picker{gap:6px}
      .ppa-settings .ppa-accent-option{height:28px;padding:0 8px 0 6px;font-size:12px}
      .ppa-modal-mask{position:absolute;inset:0;z-index:0;background:rgba(15,23,42,.35)}
      .ppa-modal-box{position:relative;z-index:1;width:min(640px,94vw);max-height:86vh;overflow:auto;background:var(--surface);border-radius:14px;box-shadow:0 20px 50px rgba(15,23,42,.2)}
      .ppa-modal-close{position:absolute;top:12px;right:12px;z-index:2;width:32px;height:32px;display:flex;align-items:center;justify-content:center;border-radius:8px;color:var(--text-2);font-size:22px;line-height:1;text-decoration:none}
      .ppa-modal-close:hover{background:var(--surface-hover);color:var(--text-1)}
      .ppa-modal .settings-title{padding-right:28px}
      .ppa-modal .settings-card{border:0;box-shadow:none;background:transparent;margin:0}
      .ppa-tree-empty,.ppa-empty,.ppa-hint,.ppa-field-note{color:var(--text-2);font-size:13px}
      .ppa-tree-empty{padding:28px 16px;text-align:center}.ppa-empty{padding:8px 0 4px}.ppa-hint{margin:-4px 0 14px}.ppa-field-note{font-size:12px}
      .ppa-site-form{display:grid;gap:12px}
      .ppa-site-form>label,.ppa-grid-2>label,.ppa-logo-side{display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--text-2)}
      .ppa-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      .ppa-logo-block{display:flex;flex-direction:column;gap:6px}
      .ppa-logo-line{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:36px}
      .ppa-logo-line>span{font-size:14px;color:var(--text-1)}
      .ppa-upload-btn{display:inline-flex;align-items:center;justify-content:center;height:32px;padding:0 16px;border-radius:8px;background:var(--primary);color:#fff;font-size:13px;font-weight:600;cursor:pointer}
      .ppa-upload-btn:hover{filter:brightness(.96)}
      .ppa-upload-btn input{display:none}
      .ppa-login-row{display:flex;align-items:center;gap:12px}
      .ppa-login-row input[type=text],.ppa-login-row input:not([type=checkbox]){flex:1;min-width:0}
      .ppa-inline-check{display:inline-flex;align-items:center;gap:8px;margin:0;color:var(--text-1);font-size:14px;white-space:nowrap;cursor:pointer}
      .ppa-inline-check input{width:16px;height:16px;margin:0;accent-color:var(--primary);cursor:pointer;flex:none}
      .ppa-site-form input:not([type=checkbox]),.ppa-site-form select,.ppa-site-form textarea{padding:8px 10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:14px;background:var(--surface);color:var(--text-1);font-family:inherit}
      .ppa-site-form input[type=file]{padding:0;border:0;background:transparent}
      .ppa-logo-preview{width:88px;height:40px;flex:none;display:flex;align-items:center;justify-content:center;border:1px solid var(--primary);border-radius:8px;background:var(--primary-soft);color:var(--primary);overflow:hidden;font-size:12px;font-weight:600}
      .ppa-logo-preview img{max-width:100%;max-height:100%;object-fit:contain}
      .ppa-site-form textarea{resize:vertical;min-height:40px}
      .ppa-check-row{display:flex;align-items:center;gap:20px;flex-wrap:wrap}
      .ppa-check-row label{display:inline-flex;align-items:center;gap:8px;margin:0;color:var(--text-1);font-size:14px;white-space:nowrap;cursor:pointer}
      .ppa-check-row input[type=checkbox]{width:16px;height:16px;margin:0;accent-color:var(--primary);cursor:pointer;flex:none}
      .ppa-accent-picker{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
      .ppa-accent-option{position:relative;display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 10px 0 8px;border:1px solid var(--border);border-radius:8px;background:#fff;color:var(--text-1);font-size:13px;cursor:pointer}
      .ppa-accent-option::before{content:'';width:14px;height:14px;border-radius:50%;background:var(--swatch);flex:none;box-shadow:inset 0 0 0 1px rgba(0,0,0,.06)}
      .ppa-accent-option input{position:absolute;opacity:0;width:0;height:0}
      .ppa-accent-option.active,.ppa-accent-option:has(input:checked){border-color:var(--swatch);box-shadow:0 0 0 2px color-mix(in srgb, var(--swatch) 28%, #fff)}
      .ppa-layout-picker{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      .ppa-layout-option{display:flex;flex-direction:column;gap:2px;padding:8px;border:1px solid var(--border);border-radius:10px;cursor:pointer;text-align:center;font-size:12px}
      .ppa-layout-option input{display:none}
      .ppa-layout-option.active{border-color:var(--primary);box-shadow:0 0 0 2px var(--primary-soft)}
      .ppa-layout-visual{height:52px;background:transparent;border-radius:6px;display:flex;align-items:center;justify-content:center;overflow:hidden}
      .ppa-layout-visual svg{width:100%;height:100%;display:block;border-radius:6px}
      .ppa-badge{display:inline-flex;align-items:center;height:20px;padding:0 6px;border-radius:4px;background:var(--primary-soft);color:var(--primary);font-size:12px;margin-right:4px}
      .ppa-badge.ok{background:#e8f7ee;color:#1f8a4c}
      .ppa-badge.muted{background:var(--surface-2,rgba(0,0,0,.08));color:var(--text-2)}
      .ppa-delete-form{margin-top:12px;padding-top:12px;border-top:1px solid var(--border);display:flex;gap:8px}
      .ppa-arm-delete,.ppa-confirm-delete{background:transparent;color:#d14343;border:1px solid currentColor;border-radius:8px;padding:8px 12px;cursor:pointer}
      .settings-actions{display:flex;gap:10px;align-items:center;padding-top:4px}
      .settings-actions button{padding:9px 18px;border:0;border-radius:8px;background:var(--primary);color:#fff;font-size:14px;font-weight:600;cursor:pointer}
      .settings-actions button:hover{filter:brightness(.96)}
      .settings-actions .btn{display:inline-flex;align-items:center;padding:9px 18px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text-1);font-size:14px;font-weight:500;text-decoration:none;cursor:pointer}
      .settings-actions .btn:hover{background:var(--surface-2)}
      .ppa-icon-row{display:flex;gap:8px;align-items:center}
      .ppa-icon-row input{flex:1}
      .ppa-icon-btn,.ppa-icon-clear{padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface);cursor:pointer;font-size:13px;color:var(--text-1)}
      .ppa-icon-btn:hover,.ppa-icon-clear:hover{background:var(--surface-2)}
      .ppa-icon-clear{color:#d14343;border-color:currentColor}
      .ppa-icon-modal{position:fixed;inset:0;z-index:9000;display:none;align-items:center;justify-content:center}
      .ppa-icon-modal.is-open{display:flex}
      .ppa-icon-mask{position:absolute;inset:0;background:rgba(15,23,42,.35)}
      .ppa-icon-modal-box{position:relative;width:min(760px,92vw);max-height:80vh;background:var(--surface);border-radius:14px;box-shadow:0 20px 50px rgba(15,23,42,.2);display:flex;flex-direction:column;overflow:hidden}
      .ppa-icon-modal-head{padding:14px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px}
      .ppa-icon-search{flex:1;padding:9px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;background:var(--surface);color:var(--text-1)}
      .ppa-icon-close{width:32px;height:32px;border:none;background:transparent;cursor:pointer;font-size:18px;color:var(--text-2);border-radius:6px}
      .ppa-icon-close:hover{background:var(--surface-2);color:var(--text-1)}
      .ppa-icon-body{flex:1;overflow:auto;padding:6px 6px 10px}
      .ppa-icon-group{padding:6px 6px 4px}
      .ppa-icon-group.is-empty{display:none}
      .ppa-icon-group-title{font-size:11px;color:var(--text-3);padding:4px 8px 6px;letter-spacing:.5px;text-transform:uppercase;font-weight:600}
      .ppa-icon-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:4px;padding:0}
      .ppa-icon-cell{display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 6px;border:1px solid transparent;border-radius:8px;background:transparent;cursor:pointer;color:var(--text-2);font-size:11px}
      .ppa-icon-cell.is-hidden{display:none}
      .ppa-icon-cell:hover{background:var(--surface-2);color:var(--text-1)}
      .ppa-icon-cell.active{background:var(--primary-soft);color:var(--primary);border-color:var(--primary)}
      .ppa-icon-cell i{width:22px;height:22px}
      .ppa-icon-cell span{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    </style>
    <script src="${LUCIDE_CDN}"></script>
    <script>(function(){
      function initLucide(){ if(window.lucide&&window.lucide.createIcons)window.lucide.createIcons(); }
      if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initLucide);else initLucide();
      var linkType=document.getElementById('ppaLinkType');
      function syncLinkPanels(){
        if(!linkType)return;
        document.querySelectorAll('[data-link-panel]').forEach(function(panel){
          panel.hidden=panel.getAttribute('data-link-panel')!==linkType.value;
        });
      }
      if(linkType){ linkType.addEventListener('change',syncLinkPanels); syncLinkPanels(); }
      document.addEventListener('click',function(e){
        var fold=e.target.closest('[data-fold]');
        if(fold&&!fold.disabled){
          var collapsed=fold.classList.toggle('is-collapsed');
          fold.textContent=collapsed?'▸':'▾';
          function setBranch(parentId,hide){
            document.querySelectorAll('.ppa-row[data-parent="'+parentId+'"]').forEach(function(row){
              row.hidden=hide;
              var childFold=row.querySelector('[data-fold]');
              var childCollapsed=childFold&&childFold.classList.contains('is-collapsed');
              setBranch(row.getAttribute('data-id'),hide||childCollapsed);
            });
          }
          setBranch(fold.getAttribute('data-fold'),collapsed);
          return;
        }
        var openBtn=e.target.closest('[data-open-icon-picker]');
        var clearBtn=e.target.closest('[data-clear-icon]');
        if(openBtn){ var modal=document.getElementById('ppaIconModal'); if(modal){
          modal.classList.add('is-open');
          modal.querySelectorAll('.ppa-icon-cell.is-hidden').forEach(function(c){c.classList.remove('is-hidden');});
          modal.querySelectorAll('.ppa-icon-group.is-empty').forEach(function(g){g.classList.remove('is-empty');});
          modal.querySelectorAll('[data-icon-search]').forEach(function(s){s.value='';});
          var sel=modal.querySelector('[data-icon-search]'); if(sel)sel.focus(); initLucide();
        } }
        if(clearBtn){ var inp=document.getElementById('ppaIconInput'); if(inp){ inp.value=''; var el=document.querySelector('.ppa-icon-row'); if(el){ var c=el.querySelector('.ppa-icon-clear'); if(c)c.remove(); } } }
      });
      document.addEventListener('click',function(e){
        var modal=document.getElementById('ppaIconModal'); if(!modal||!modal.classList.contains('is-open'))return;
        if(e.target.closest('[data-close-icon-picker]')||e.target.classList.contains('ppa-icon-mask')){ modal.classList.remove('is-open'); return; }
        var cell=e.target.closest('[data-icon]'); if(!cell)return;
        var inp=document.getElementById('ppaIconInput'); if(!inp)return;
        inp.value=cell.dataset.icon; modal.querySelectorAll('[data-icon]').forEach(function(c){ c.classList.toggle('active',c===cell); }); modal.classList.remove('is-open');
      });
      var search=document.querySelector('[data-icon-search]');
      if(search) search.addEventListener('input',function(){
        var q=this.value.trim().toLowerCase();
        var groups=document.querySelectorAll('[data-icon-group]');
        groups.forEach(function(group){
          var cells=group.querySelectorAll('[data-icon]');
          var visible=0;
          cells.forEach(function(cell){
            var name=cell.dataset.icon.toLowerCase();
            var show=!q||name.indexOf(q)!==-1;
            cell.classList.toggle('is-hidden',!show);
            if(show)visible++;
          });
          group.classList.toggle('is-empty',visible===0);
        });
      });
      document.querySelectorAll('.ppa-layout-option').forEach(function(opt){
        opt.addEventListener('click',function(){
          var input=opt.querySelector('input'); if(input)input.checked=true;
          var picker=opt.closest('.ppa-layout-picker'); if(!picker)return;
          picker.querySelectorAll('.ppa-layout-option').forEach(function(item){item.classList.remove('active');});
          opt.classList.add('active');
        });
      });
      var nameInput=document.querySelector('form[action="/admin/portals"] input[name="name"]');
      var slugInput=document.querySelector('form[action="/admin/portals"] input[name="slug"]');
      if(nameInput&&slugInput){
        nameInput.addEventListener('input',function(){ if(slugInput.dataset.touched==='1')return; slugInput.value=nameInput.value.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,50); });
        slugInput.addEventListener('input',function(){ slugInput.dataset.touched=slugInput.value?'1':''; });
      }
      document.querySelectorAll('.ppa-arm-delete').forEach(function(btn){
        btn.addEventListener('click',function(){ var c=btn.parentNode.querySelector('.ppa-confirm-delete'); btn.hidden=true; if(c)c.hidden=false; });
      });
    })();</script>`
  });
}

module.exports = { portalAdminPage };
