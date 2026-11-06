const { layout, escapeHtml, formatBytes, iconSvg, fileKindIcon, renderToast } = require('./layout');
const { typeLabel, iconClass, previewMode } = require('../services/fileTypes');

function formatDate(value) {
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

function siteKindLabel(kind) {
  return typeLabel(kind);
}

function siteIconClass(kind) {
  return iconClass(kind);
}

function renderFolderOptions(folders, selectedValue = '') {
  return `<option value="" ${selectedValue === '' ? 'selected' : ''}>未分组</option>` + folders.map((folder) => `
    <option value="${escapeHtml(folder.id)}" ${selectedValue === folder.id ? 'selected' : ''}>${escapeHtml(folder.name)}</option>
  `).join('');
}

function renderFolderTree({ folders, selectedFolderId, totalCount, ungroupedCount, csrfToken }) {
  const allActive = !selectedFolderId;
  const ungroupedActive = selectedFolderId === '__ungrouped__';

  const allItem = `<a class="fm-folder-item ${allActive ? 'active' : ''}" href="/admin?view=files">
    <span class="fm-folder-icon">${iconSvg('file', 15)}</span>
    <span class="fm-folder-name">全部文件</span>
    <span class="fm-folder-count">${escapeHtml(totalCount)}</span>
  </a>`;

  const ungroupedItem = `<a class="fm-folder-item ${ungroupedActive ? 'active' : ''}" href="/admin?view=files&folder=__ungrouped__">
    <span class="fm-folder-icon">${iconSvg('file', 15)}</span>
    <span class="fm-folder-name">未分组</span>
    <span class="fm-folder-count">${escapeHtml(ungroupedCount)}</span>
  </a>`;

  const folderItems = folders.map((folder) => {
    const active = selectedFolderId === folder.id;
    return `<div class="fm-folder-item-wrap">
      <a class="fm-folder-item ${active ? 'active' : ''}" href="/admin?view=files&folder=${escapeHtml(folder.id)}">
        <span class="fm-folder-icon">${iconSvg('folder', 15)}</span>
        <span class="fm-folder-name">${escapeHtml(folder.name)}</span>
        <span class="fm-folder-count">${escapeHtml(folder.siteCount)}</span>
      </a>
      <div class="fm-folder-actions">
        <a class="fm-action-btn" href="javascript:void(0)" data-action-modal="rename-folder" data-modal-title="重命名文件夹" data-action-url="/admin/folders/${escapeHtml(folder.id)}/rename" data-csrf="${escapeHtml(csrfToken)}" data-folder="${escapeHtml(folder.id)}" data-current-name="${escapeHtml(folder.name)}" title="重命名">✎</a>
        <form method="post" action="/admin/folders/${escapeHtml(folder.id)}/delete" onsubmit="return confirm('确认删除文件夹「${escapeHtml(folder.name)}」吗？其中的站点将移入未分组。');">
          <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
          <button class="fm-action-btn danger" type="submit" title="删除">×</button>
        </form>
      </div>
    </div>`;
  }).join('');

  return `<div class="fm-tree">
    <div class="fm-tree-header">文件夹</div>
    ${allItem}
    ${folderItems}
    ${ungroupedItem}
    <div class="fm-tree-footer">
      <a class="btn" href="javascript:void(0)" data-action-modal="new-folder" data-modal-title="新建文件夹" data-action-url="/admin/folders" data-csrf="${escapeHtml(csrfToken)}" data-view="files">+ 新建文件夹</a>
    </div>
  </div>`;
}

function renderSiteTable({ sites, folders, csrfToken, selectedFolderId, baseUrl }) {
  if (sites.length === 0) {
    return `<div class="fm-empty">
      <div class="fm-empty-icon">📂</div>
      <div class="fm-empty-text">当前文件夹暂无站点</div>
      <a class="btn btn-primary" href="/admin/upload${selectedFolderId && selectedFolderId !== '__ungrouped__' ? '?folder=' + encodeURIComponent(selectedFolderId) : ''}">上传文件</a>
    </div>`;
  }

  const rows = sites.map((site) => {
    const url = `${baseUrl}/sites/${site.id}/`;
  const preview = previewMode(site.kind);
  const previewBtn = preview
    ? `<button type="button" class="act" data-preview-url="${escapeHtml(url)}" data-preview-type="${escapeHtml(preview)}" data-preview-name="${escapeHtml(site.originalName)}">预览</button>`
    : '';
    return `<tr class="site-row" data-name="${escapeHtml(site.originalName)}" data-url="${escapeHtml(url)}">
      <td class="fm-check-cell"><input class="fm-check fm-check-site" type="checkbox" name="ids" value="${escapeHtml(site.id)}" form="fm-batch-download"></td>
      <td>
        <div class="file-cell">
          <div class="file-icon ${escapeHtml(siteIconClass(site.kind))}">${fileKindIcon(site.kind)}</div>
          <div class="file-info">
            <span class="file-title"><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="file-title-link">${escapeHtml(site.originalName)}</a></span>
            <span class="file-sub">ID ${escapeHtml(site.id.slice(0, 8))}</span>
          </div>
        </div>
      </td>
      <td><span class="tag">${escapeHtml(siteKindLabel(site.kind))}</span></td>
      <td class="num">${escapeHtml(site.fileCount)}</td>
      <td class="num">${escapeHtml(formatBytes(site.sizeBytes))}</td>
      <td class="muted">${escapeHtml(formatDate(site.createdAt))}</td>
      <td>
        <div class="actions">
          ${previewBtn}
          <a class="act" href="javascript:void(0)" data-action-modal="move" data-modal-title="移动站点 — ${escapeHtml(site.originalName)}" data-action-url="/admin/sites/${escapeHtml(site.id)}/move" data-csrf="${escapeHtml(csrfToken)}" data-folder="${escapeHtml(selectedFolderId || '')}" data-view="files" data-options="${escapeHtml(renderFolderOptions(folders, site.folderId || ''))}">移动</a>
          <form method="post" action="/admin/sites/${escapeHtml(site.id)}/delete" onsubmit="return confirm('确认删除这个站点吗？');">
            <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
            <input type="hidden" name="returnFolder" value="${escapeHtml(selectedFolderId || '')}">
            <input type="hidden" name="returnView" value="files">
            <button class="act act-danger" type="submit">删除</button>
          </form>
        </div>
      </td>
    </tr>`;
  }).join('');

  return `<table>
    <thead>
      <tr>
        <th style="width:36px"><input class="fm-check" id="fm-check-all" type="checkbox" title="全选"></th>
        <th style="width:30%">名称</th>
        <th>类型</th>
        <th style="text-align:right">文件数</th>
        <th style="text-align:right">大小</th>
        <th>创建时间</th>
        <th style="text-align:right">操作</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function getFolderLabel(selectedFolderId, folders) {
  if (!selectedFolderId) return '全部文件';
  if (selectedFolderId === '__ungrouped__') return '未分组';
  const folder = folders.find((f) => f.id === selectedFolderId);
  return folder ? folder.name : '全部文件';
}

function fileManagerPage({ folders, selectedFolderId, sites, totalCount, ungroupedCount, currentUser, csrfToken, query, settings, dataSize, diskStats, baseUrl }) {
  const folderLabel = getFolderLabel(selectedFolderId, folders);
  const uploadFolder = selectedFolderId && selectedFolderId !== '__ungrouped__' ? selectedFolderId : '';

  return layout({
    title: '文件管理',
    currentUser,
    csrfToken,
    activeNav: 'files',
    settings,
    dataSize,
    diskStats,
    content: `
      <div class="page-head">
        <div>
          <div class="page-title">文件管理</div>
          <div class="page-desc">按文件夹浏览并整理已上传的静态站点</div>
        </div>
        <div class="head-actions">
          <div class="nav-search-wrap">
            <span class="nav-search-icon">${iconSvg('site', 15)}</span>
            <input type="text" class="nav-search" id="fileSearch" placeholder="搜索，回车直达" autocomplete="off" autocorrect="off" spellcheck="false">
            <kbd class="nav-search-kbd">↵</kbd>
          </div>
          <div class="nav-toolbar-meta" id="fileResultMeta"></div>
          <a class="btn btn-primary" href="/admin/upload${uploadFolder ? '?folder=' + encodeURIComponent(uploadFolder) : ''}">${iconSvg('upload', 15)}上传文件</a>
        </div>
      </div>

      ${query.error ? renderToast(query.error, 'error') : ''}
      ${query.folderCreated ? renderToast('文件夹已创建。') : ''}
      ${query.folderDeleted ? renderToast('文件夹已删除，站点已移入未分组。') : ''}
      ${query.moved ? renderToast('站点已移动。') : ''}
      ${query.renamed ? renderToast('文件夹已重命名。') : ''}
      ${query.deleted ? renderToast('站点已删除。') : ''}

      <div class="fm-layout">
        <div class="fm-sidebar">
          ${renderFolderTree({ folders, selectedFolderId, totalCount, ungroupedCount, csrfToken })}
        </div>
        <div class="fm-main">
          <div class="fm-toolbar">
            <div class="fm-toolbar-title">
              <span>${escapeHtml(folderLabel)}</span>
              <span class="fm-toolbar-count">${escapeHtml(sites.length)} 个站点</span>
            </div>
            ${sites.length ? `<div class="fm-toolbar-actions">
              <span class="fm-selected-count" id="fm-selected-count"></span>
              <form id="fm-batch-download" method="post" action="/admin/sites/download">
                <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
                <button class="btn" id="fm-download-btn" type="button" disabled>${iconSvg('download', 15)}批量下载</button>
              </form>
            </div>` : ''}
          </div>
          <div class="fm-content">
            ${renderSiteTable({ sites, folders, csrfToken, selectedFolderId, baseUrl })}
          </div>
        </div>
      </div>
      <div class="fm-progress" id="fm-progress" hidden>
        <div class="fm-progress-card">
          <div class="fm-progress-title" id="fm-progress-title">正在准备下载</div>
          <div class="fm-progress-track"><div class="fm-progress-fill" id="fm-progress-fill"></div></div>
          <div class="fm-progress-meta" id="fm-progress-meta">正在统计文件</div>
        </div>
      </div>
      <script>
        (function () {
          var all = document.getElementById('fm-check-all');
          var boxes = Array.prototype.slice.call(document.querySelectorAll('.fm-check-site'));
          var button = document.getElementById('fm-download-btn');
          var count = document.getElementById('fm-selected-count');
          function sync() {
            var selected = boxes.filter(function (box) { return box.checked; }).length;
            if (button) button.disabled = selected === 0;
            if (count) count.textContent = selected ? '已选 ' + selected + ' 个' : '';
            if (all) {
              all.checked = boxes.length > 0 && selected === boxes.length;
              all.indeterminate = selected > 0 && selected < boxes.length;
            }
          }
          if (all) all.addEventListener('change', function () {
            boxes.forEach(function (box) { box.checked = all.checked; });
            sync();
          });
          boxes.forEach(function (box) { box.addEventListener('change', sync); });
          sync();

          var form = document.getElementById('fm-batch-download');
          var panel = document.getElementById('fm-progress');
          var title = document.getElementById('fm-progress-title');
          var fill = document.getElementById('fm-progress-fill');
          var meta = document.getElementById('fm-progress-meta');
          function showProgress(text, detail, percent) {
            panel.hidden = false;
            title.textContent = text;
            meta.textContent = detail || '';
            if (percent == null) {
              fill.style.width = '35%';
              fill.classList.add('is-busy');
            } else {
              fill.classList.remove('is-busy');
              fill.style.width = Math.max(0, Math.min(100, percent)) + '%';
            }
          }
          function hideProgress() {
            panel.hidden = true;
            fill.classList.remove('is-busy');
          }
          if (button && form) button.addEventListener('click', function () {
            var selected = boxes.filter(function (box) { return box.checked; });
            if (!selected.length) return;
            button.disabled = true;
            showProgress('正在准备下载', '正在统计文件', null);
            var body = new URLSearchParams(new FormData(form));
            selected.forEach(function (box) { body.append('ids', box.value); });
            fetch(form.action, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: body
            }).then(function (response) {
              return response.json().then(function (data) {
                if (!response.ok) throw new Error(data.error || '无法开始下载');
                return data.jobId;
              });
            }).then(function (jobId) {
              var timer = setInterval(function () {
                fetch('/admin/sites/download/' + jobId).then(function (response) {
                  return response.json().then(function (data) {
                    if (!response.ok) throw new Error(data.error || '无法获取下载进度');
                    return data;
                  });
                }).then(function (data) {
                  if (data.status === 'error') throw new Error(data.error || '打包失败');
                  if (data.status === 'ready') {
                    clearInterval(timer);
                    showProgress('打包完成', '正在开始下载', 100);
                    var link = document.createElement('a');
                    link.href = '/admin/sites/download/' + jobId + '/file';
                    link.download = '';
                    document.body.appendChild(link);
                    link.click();
                    link.remove();
                    setTimeout(function () {
                      hideProgress();
                      sync();
                    }, 1200);
                    return;
                  }
                  var total = Number(data.total) || 0;
                  var done = Number(data.done) || 0;
                  var percent = total ? Math.round(done / total * 100) : null;
                  var detail = data.current || (total ? done + ' / ' + total : '正在统计文件');
                  if (total) detail = done + ' / ' + total + (data.current ? ' · ' + data.current : '');
                  showProgress(data.status === 'preparing' ? '正在准备下载' : '正在打包', detail, percent);
                }).catch(function (error) {
                  clearInterval(timer);
                  showProgress('下载失败', error.message || '打包失败', 0);
                  setTimeout(function () { hideProgress(); sync(); }, 2200);
                });
              }, 400);
            }).catch(function (error) {
              showProgress('下载失败', error.message || '无法开始下载', 0);
              setTimeout(function () { hideProgress(); sync(); }, 2200);
            });
          });
        })();
        (function () {
          var input = document.getElementById('fileSearch');
          var meta = document.getElementById('fileResultMeta');
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
    `
  });
}

module.exports = { fileManagerPage };
