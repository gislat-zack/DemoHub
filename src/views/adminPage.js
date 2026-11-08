const { layout, escapeHtml, formatBytes, statCard, iconSvg, fileKindIcon, renderToast } = require('./layout');
const { iconClass, previewMode, isAssetKind } = require('../services/fileTypes');
const { renderUploadModal } = require('./uploadPage');

function formatDate(value) {
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

function renderAlert(query, baseUrl) {
  if (query.error) return renderToast(query.error, 'error');
  if (query.uploaded) {
    const url = `${baseUrl}/sites/${encodeURIComponent(query.uploaded)}/`;
    return renderToast(`上传成功：<a href="${escapeHtml(url)}" target="_blank">${escapeHtml(url)}</a>`, 'success', { html: true });
  }
  if (query.deleted) return renderToast('站点已删除。');
  if (query.folderCreated) return renderToast('文件夹已创建。');
  if (query.folderDeleted) return renderToast('文件夹已删除，站点已移动到未分组。');
  if (query.moved) return renderToast('站点已移动。');
  if (query.updated) return renderToast('访问期限已更新。');
  return '';
}

function folderUrl(folderId, view) {
  const base = view ? `/admin?view=${encodeURIComponent(view)}` : '/admin';
  if (!folderId) return base;
  return `${base}&folder=${encodeURIComponent(folderId)}`;
}

function renderFolderTabs({ folders, selectedFolder, totalCount, ungroupedCount, view }) {
  const base = view ? `?view=${encodeURIComponent(view)}` : '';
  const sep = view ? '&' : '?';
  const tabs = [
    `<a class="seg-item ${!selectedFolder ? 'active' : ''}" href="/admin${base}">全部 <span class="seg-count">${escapeHtml(totalCount)}</span></a>`,
    `<a class="seg-item ${selectedFolder === 'ungrouped' ? 'active' : ''}" href="/admin${base}${sep}folder=ungrouped">未分组 <span class="seg-count">${escapeHtml(ungroupedCount)}</span></a>`
  ];

  for (const folder of folders) {
    tabs.push(`<a class="seg-item ${selectedFolder === folder.id ? 'active' : ''}" href="${escapeHtml(folderUrl(folder.id, view))}">${escapeHtml(folder.name)} <span class="seg-count">${escapeHtml(folder.siteCount)}</span></a>`);
  }

  return `<div class="seg">${tabs.join('')}</div>`;
}

function renderFolderOptions(folders, selectedValue = '') {
  return `<option value="" ${selectedValue === '' ? 'selected' : ''}>未分组</option>` + folders.map((folder) => `
    <option value="${escapeHtml(folder.id)}" ${selectedValue === folder.id ? 'selected' : ''}>${escapeHtml(folder.name)}</option>
  `).join('');
}

function siteIconClass(kind) {
  return iconClass(kind);
}

function renderSiteRows({ sites, folders, baseUrl, csrfToken, selectedFolder, view }) {
  if (sites.length === 0) {
    return '<tr><td colspan="8" class="empty-cell">当前分组还没有上传站点。</td></tr>';
  }

  return sites.map((site) => {
    const url = `${baseUrl}/sites/${site.id}/`;
    const previewUrl = `/sites/${site.id}/`;
    const dirBtn = site.kind === 'html' || isAssetKind(site.kind)
      ? ''
      : `<a class="act tree-btn" data-site-id="${escapeHtml(site.id)}" data-site-name="${escapeHtml(site.originalName)}" href="javascript:void(0)">目录</a>`;
    const preview = previewMode(site.kind);
    const previewBtn = preview
      ? `<button type="button" class="act" data-preview-url="${escapeHtml(previewUrl)}" data-preview-type="${escapeHtml(preview)}" data-preview-name="${escapeHtml(site.originalName)}">预览</button>`
      : `<a class="act" href="${escapeHtml(url)}" target="_blank" rel="noreferrer">预览</a>`;
    return `<tr class="site-row" data-name="${escapeHtml(site.originalName)}" data-url="${escapeHtml(url)}">
      <td>
        <div class="file-cell">
          <div class="file-icon ${escapeHtml(siteIconClass(site.kind))}">${fileKindIcon(site.kind)}</div>
          <div class="file-info">
            <span class="file-title"><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="file-title-link">${escapeHtml(site.originalName)}</a></span>
            <span class="file-sub">ID ${escapeHtml(site.id.slice(0, 8))} · ${escapeHtml(formatDate(site.updatedAt || site.createdAt))}</span>
          </div>
        </div>
      </td>
      <td><span class="tag ${site.folderName ? 'tag-primary' : ''}">${escapeHtml(site.folderName || '未分组')}</span></td>
      <td class="num">${escapeHtml(site.fileCount)}</td>
      <td class="num">${escapeHtml(formatBytes(site.sizeBytes))}</td>
      <td class="num">${escapeHtml(site.visitCount || 0)}</td>
      <td class="muted">
        <a class="act access-days-btn" href="javascript:void(0)" data-site-id="${escapeHtml(site.id)}" data-site-name="${escapeHtml(site.originalName)}" data-access-days="${escapeHtml(String(site.accessDays || 0))}" data-csrf="${escapeHtml(csrfToken)}" data-folder="${escapeHtml(selectedFolder || '')}" data-view="${escapeHtml(view || '')}">${site.accessDays > 0 ? escapeHtml(site.accessDays) + ' 天' : '永久'}</a>
      </td>
      <td>
        <a class="link-box" href="${escapeHtml(url)}" target="_blank" title="${escapeHtml(url)}">${escapeHtml(url.replace(/^https?:\/\//, ''))}${iconSvg('link', 13)}</a>
      </td>
      <td>
        <div class="actions">
          ${previewBtn}
          ${dirBtn}
          <a class="act" href="javascript:void(0)" data-action-modal="move" data-modal-title="移动站点 — ${escapeHtml(site.originalName)}" data-action-url="/admin/sites/${escapeHtml(site.id)}/move" data-csrf="${escapeHtml(csrfToken)}" data-folder="${escapeHtml(selectedFolder || '')}" data-view="${escapeHtml(view || '')}" data-options="${escapeHtml(renderFolderOptions(folders, site.folderId || ''))}">移动</a>
          <form method="post" action="/admin/sites/${escapeHtml(site.id)}/delete" data-confirm="确认删除这个站点吗？">
            <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
            <input type="hidden" name="returnFolder" value="${escapeHtml(selectedFolder || '')}">
            <input type="hidden" name="returnView" value="${escapeHtml(view || '')}">
            <button class="act act-danger" type="submit">删除</button>
          </form>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function renderStats({ totalCount, folders, sites }) {
  const totalFiles = sites.reduce((sum, site) => sum + Number(site.fileCount || 0), 0);
  const totalSize = sites.reduce((sum, site) => sum + Number(site.sizeBytes || 0), 0);
  return `<div class="stats">
    ${statCard({ icon: 'sites', tone: 'blue', value: totalCount, label: '托管站点' })}
    ${statCard({ icon: 'folder', tone: 'green', value: folders.length, label: '文件夹' })}
    ${statCard({ icon: 'file', tone: 'orange', value: totalFiles, label: '文件数量' })}
    ${statCard({ icon: 'storage', tone: 'red', value: formatBytes(totalSize), label: '当前列表大小' })}
  </div>`;
}

function adminPage({ sites, folders, selectedFolder, totalCount, ungroupedCount, query, baseUrl, currentUser, csrfToken, activeNav, settings, dataSize, diskStats }) {
  const nav = activeNav || 'sites';
  const pageTitle = nav === 'files' ? '文件管理' : '网站管理';
  const pageDesc = nav === 'files' ? '浏览并整理已上传的静态站点' : `管理托管站点与静态文件，共 ${totalCount} 个站点在线`;

  return layout({
    title: pageTitle,
    currentUser,
    csrfToken,
    activeNav: nav,
    settings,
    dataSize,
    diskStats,
    content: `
      <div class="page-head">
        <div>
          <div class="page-title">${escapeHtml(pageTitle)}</div>
          <div class="page-desc">${escapeHtml(pageDesc)}</div>
        </div>
        <div class="head-actions">
          <form class="nav-search-wrap" role="search" id="siteSearchForm" action="#" onsubmit="return false;">
            <label class="sr-only" for="siteSearch">搜索站点</label>
            <span class="nav-search-icon">${iconSvg('site', 15)}</span>
            <input type="search" class="nav-search" id="siteSearch" placeholder="搜索，回车直达" autocomplete="off" autocorrect="off" spellcheck="false">
            <kbd class="nav-search-kbd">↵</kbd>
          </form>
          <div class="nav-toolbar-meta" id="siteResultMeta"></div>
          <button type="button" class="btn btn-primary" data-open-upload>${iconSvg('upload', 15)}上传文件</button>
        </div>
      </div>

      ${renderAlert(query, baseUrl)}
      ${renderStats({ totalCount, folders, sites })}

      <div class="panel">
        <div class="panel-bar">
          ${renderFolderTabs({ folders, selectedFolder, totalCount, ungroupedCount, view: nav })}
          <div class="panel-meta">共 ${escapeHtml(sites.length)} 条记录</div>
        </div>
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th style="width:28%">名称</th>
                <th>分组</th>
                <th style="text-align:right">文件数</th>
                <th style="text-align:right">大小</th>
                <th style="text-align:right">访问</th>
                <th>有效期</th>
                <th>访问链接</th>
                <th style="text-align:right">操作</th>
              </tr>
            </thead>
            <tbody>${renderSiteRows({ sites, folders, baseUrl, csrfToken, selectedFolder, view: nav })}</tbody>
          </table>
        </div>
        <div class="panel-foot">
          <span>第 1 / 1 页 · 共 ${escapeHtml(sites.length)} 条记录</span>
          <div class="pager">
            <button class="page-btn" type="button">‹</button>
            <button class="page-btn current" type="button">1</button>
            <button class="page-btn" type="button">›</button>
          </div>
        </div>
      </div>

      <div class="tree-modal" id="treeModal" style="display:none;">
        <div class="tree-modal-overlay" id="treeModalOverlay"></div>
        <div class="tree-modal-card">
          <div class="tree-modal-header">
            <span class="tree-modal-title" id="treeModalTitle">目录结构</span>
            <button class="tree-modal-close" id="treeModalClose" type="button" aria-label="关闭"></button>
          </div>
          <div class="tree-modal-body" id="treeModalBody">
            <div class="tree-loading">加载中...</div>
          </div>
        </div>
      </div>

      <div class="tree-modal" id="accessDaysModal" style="display:none;">
        <div class="tree-modal-overlay" id="accessDaysOverlay"></div>
        <div class="tree-modal-card">
          <div class="tree-modal-header">
            <span class="tree-modal-title" id="accessDaysTitle">设置有效期</span>
            <button class="tree-modal-close" id="accessDaysClose" type="button" aria-label="关闭"></button>
          </div>
          <div class="tree-modal-body">
            <form method="post" action="" id="accessDaysForm">
              <input type="hidden" name="_csrf" id="adCsrf" value="">
              <input type="hidden" name="returnFolder" id="adFolder" value="">
              <input type="hidden" name="returnView" id="adView" value="">
              <div class="ad-form-group">
                <label class="ad-label">站点名称</label>
                <div class="ad-site-name" id="adSiteName"></div>
              </div>
              <div class="ad-form-group">
                <label class="ad-label">访问有效期</label>
                <div class="ad-input-row">
                  <input type="number" name="accessDays" id="adDaysInput" min="0" max="36500" class="ad-input" placeholder="请输入天数">
                  <span class="ad-unit">天</span>
                </div>
                <div class="ad-hint">设置为 0 表示永久有效，最大 36500 天（约 100 年）</div>
              </div>
              <div class="ad-presets">
                <button type="button" class="ad-preset-btn" data-days="30">30 天</button>
                <button type="button" class="ad-preset-btn" data-days="90">90 天</button>
                <button type="button" class="ad-preset-btn" data-days="180">180 天</button>
                <button type="button" class="ad-preset-btn" data-days="365">1 年</button>
                <button type="button" class="ad-preset-btn" data-days="0">永久</button>
              </div>
              <div class="ad-actions">
                <button type="button" class="ad-btn-cancel" id="accessDaysCancel">取消</button>
                <button type="submit" class="ad-btn-primary">保存</button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <script>
      (function () {
        function escapeHtml(s) {
          return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
        }

        /* ── Tree modal ── */
        var treeModal = document.getElementById('treeModal');
        var treeOverlay = document.getElementById('treeModalOverlay');
        var treeCloseBtn = document.getElementById('treeModalClose');
        var treeTitleEl = document.getElementById('treeModalTitle');
        var treeBody = document.getElementById('treeModalBody');

        function openTreeModal() { treeModal.style.display = 'flex'; }
        function closeTreeModal() { treeModal.style.display = 'none'; treeBody.innerHTML = ''; }
        treeOverlay.addEventListener('click', closeTreeModal);
        treeCloseBtn.addEventListener('click', closeTreeModal);

        var currentTreeSiteId = '';
        function treeFileUrl(rel) {
          return '/sites/' + currentTreeSiteId + '/' + String(rel || '').split('/').map(encodeURIComponent).join('/');
        }
        function renderNode(node, depth) {
          var indent = depth * 18;
          var iconUrl = node.type === 'file' && window.fileTypeIcon ? window.fileTypeIcon(node.name) : '';
          var icon = node.type === 'dir' ? '📂' : (iconUrl ? '<img class="type-icon" src="' + iconUrl + '" alt="">' : '📄');
          var preview = node.type === 'file' && window.filePreviewType ? window.filePreviewType(node.name) : '';
          var name = preview
            ? '<button type="button" class="tree-preview" data-preview-url="' + escapeHtml(treeFileUrl(node.path)) + '" data-preview-type="' + preview + '" data-preview-name="' + escapeHtml(node.name) + '">' + escapeHtml(node.name) + '</button>'
            : escapeHtml(node.name);
          var size = node.type === 'file' ? ' <span class="tree-size">' + node.sizeText + '</span>' : '';
          var html = '<div class="tree-node tree-' + node.type + '" style="padding-left:' + indent + 'px;">'
            + '<span class="tree-icon">' + icon + '</span>'
            + '<span class="tree-name">' + name + '</span>'
            + size + '</div>';
          if (node.children) {
            for (var i = 0; i < node.children.length; i++) {
              html += renderNode(node.children[i], depth + 1);
            }
          }
          return html;
        }

        document.addEventListener('click', function (e) {
          var btn = e.target.closest('.tree-btn');
          if (!btn) return;
          var siteId = btn.getAttribute('data-site-id');
          currentTreeSiteId = siteId;
          var siteName = btn.getAttribute('data-site-name');
          treeTitleEl.textContent = siteName + ' — 目录结构';
          treeBody.innerHTML = '<div class="tree-loading">加载中...</div>';
          openTreeModal();
          fetch('/admin/sites/' + siteId + '/tree')
            .then(function (r) { return r.json(); })
            .then(function (data) {
              if (data.error) { treeBody.innerHTML = '<div class="tree-error">' + escapeHtml(data.error) + '</div>'; return; }
              var html = '';
              if (!data.tree || data.tree.length === 0) { html = '<div class="tree-empty">空目录</div>'; }
              else { for (var i = 0; i < data.tree.length; i++) { html += renderNode(data.tree[i], 0); } }
              treeBody.innerHTML = html;
            })
            .catch(function () { treeBody.innerHTML = '<div class="tree-error">加载失败</div>'; });
        });

        /* ── Access-days modal ── */
        var adModal = document.getElementById('accessDaysModal');
        var adOverlay = document.getElementById('accessDaysOverlay');
        var adClose = document.getElementById('accessDaysClose');
        var adCancel = document.getElementById('accessDaysCancel');
        var adForm = document.getElementById('accessDaysForm');
        var adTitle = document.getElementById('accessDaysTitle');
        var adSiteName = document.getElementById('adSiteName');
        var adDaysInput = document.getElementById('adDaysInput');
        var adCsrf = document.getElementById('adCsrf');
        var adFolder = document.getElementById('adFolder');
        var adView = document.getElementById('adView');

        function openAdModal() { adModal.style.display = 'flex'; adDaysInput.focus(); }
        function closeAdModal() { adModal.style.display = 'none'; }
        adOverlay.addEventListener('click', closeAdModal);
        adClose.addEventListener('click', closeAdModal);
        adCancel.addEventListener('click', closeAdModal);

        document.addEventListener('click', function (e) {
          var btn = e.target.closest('.access-days-btn');
          if (!btn) return;
          var siteId = btn.getAttribute('data-site-id');
          var siteName = btn.getAttribute('data-site-name');
          var days = btn.getAttribute('data-access-days');
          var csrf = btn.getAttribute('data-csrf');
          var folder = btn.getAttribute('data-folder');
          var view = btn.getAttribute('data-view');
          adTitle.textContent = '设置有效期 — ' + siteName;
          adSiteName.textContent = siteName;
          adDaysInput.value = days || '0';
          adCsrf.value = csrf;
          adFolder.value = folder;
          adView.value = view;
          adForm.action = '/admin/sites/' + siteId + '/access-days';
          openAdModal();
        });

        document.addEventListener('click', function (e) {
          var preset = e.target.closest('.ad-preset-btn');
          if (!preset) return;
          adDaysInput.value = preset.getAttribute('data-days');
          document.querySelectorAll('.ad-preset-btn').forEach(function(b) { b.classList.remove('active'); });
          preset.classList.add('active');
        });

        adDaysInput.addEventListener('input', function() {
          document.querySelectorAll('.ad-preset-btn').forEach(function(b) { b.classList.remove('active'); });
        });
      })();
      (function () {
        var input = document.getElementById('siteSearch');
        var meta = document.getElementById('siteResultMeta');
        if (!input) return;
        var rows = Array.prototype.slice.call(document.querySelectorAll('tr.site-row'));
        function apply(keyword) {
          var kw = keyword.trim().toLowerCase();
          var visible = 0;
          var first = null;
          rows.forEach(function (row) {
            var name = (row.getAttribute('data-name') || '').toLowerCase();
            var url = (row.getAttribute('data-url') || '').toLowerCase();
            var ok = !kw || name.indexOf(kw) !== -1 || url.indexOf(kw) !== -1;
            row.style.display = ok ? '' : 'none';
            if (ok) { visible++; if (!first) first = row; }
          });
          if (meta) meta.textContent = kw ? ('匹配 ' + visible + ' 项' + (first ? '，回车直达「' + (first.getAttribute('data-name') || '') + '」' : '')) : '';
          return first;
        }
        input.addEventListener('input', function () { apply(input.value); });
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') {
            e.preventDefault();
            var first = apply(input.value);
            if (first) window.open(first.getAttribute('data-url'), '_blank', 'noopener');
          } else if (e.key === 'Escape') {
            input.value = '';
            apply('');
          }
        });
      })();
      </script>
      ${renderUploadModal({
        folders,
        selectedFolder,
        returnFolder: selectedFolder || '',
        csrfToken,
        returnView: 'sites',
        open: query.upload === '1'
      })}
    `
  });
}

module.exports = { adminPage };
