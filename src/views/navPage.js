const { layout, escapeHtml, iconSvg } = require('./layout');

function isImageIcon(icon) {
  const value = String(icon || '').trim();
  return /^https?:\/\//i.test(value) || value.startsWith('/nav-icon/');
}

function renderIcon(icon, fallbackName) {
  const value = String(icon || '').trim();
  const letter = escapeHtml((fallbackName || '?').slice(0, 1).toUpperCase());
  if (isImageIcon(value)) {
    return `<img src="${escapeHtml(value)}" alt="" referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"><span style="display:none">${letter}</span>`;
  }
  if (value) return `<span>${escapeHtml(value)}</span>`;
  return `<span>${letter}</span>`;
}

function renderLinkCard(link) {
  return `<a class="nav-card" href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer" draggable="true" data-id="${escapeHtml(link.id)}" data-name="${escapeHtml(link.name)}" data-url="${escapeHtml(link.url)}" title="${escapeHtml(link.name)}">
    <div class="nav-card-icon">${renderIcon(link.icon, link.name)}</div>
    <div class="nav-card-name">${escapeHtml(link.name)}</div>
    <div class="nav-card-actions">
      <button type="button" class="nav-card-edit" data-id="${escapeHtml(link.id)}" data-name="${escapeHtml(link.name)}" data-url="${escapeHtml(link.url)}" data-icon="${escapeHtml(link.icon)}" title="编辑">✎</button>
      <button type="button" class="nav-card-del" data-id="${escapeHtml(link.id)}" data-name="${escapeHtml(link.name)}" title="删除">×</button>
    </div>
  </a>`;
}

function navPage({ links, query, currentUser, csrfToken, settings, dataSize, diskStats }) {
  const cards = links.length
    ? links.map(renderLinkCard).join('')
    : '<div class="nav-empty">还没有网址，点击右上角「添加网址」。</div>';
  const toast = query.error
    ? { kind: 'error', text: String(query.error) }
    : query.deleted
      ? { kind: 'success', text: '已删除' }
      : query.saved
        ? { kind: 'success', text: '已保存' }
        : null;

  return layout({
    title: '导航',
    currentUser,
    csrfToken,
    activeNav: 'nav',
    settings,
    dataSize,
    diskStats,
    content: `
      <div class="page-head">
        <div>
          <div class="page-title">导航</div>
          <div class="page-desc">常用网址图标，支持拖拽排序与关键字直达</div>
        </div>
        <div class="head-actions">
          <div class="nav-search-wrap">
            <span class="nav-search-icon">${iconSvg('site', 15)}</span>
            <input type="text" class="nav-search" id="navSearch" placeholder="搜索，回车直达" autocomplete="off" autocorrect="off" spellcheck="false">
            <kbd class="nav-search-kbd">↵</kbd>
          </div>
          <div class="nav-toolbar-meta" id="navResultMeta"></div>
          <button type="button" class="btn btn-primary" id="navAddLinkBtn">${iconSvg('link', 15)}添加网址</button>
        </div>
      </div>

      ${toast ? `<div class="app-toast ${toast.kind === 'error' ? 'is-error' : 'is-success'}" id="pageToast">${escapeHtml(toast.text)}</div>` : ''}

      <div class="nav-main">
        <div class="nav-cards-grid" id="navGrid">${cards}</div>
      </div>

      <div class="tree-modal" id="navLinkModal" style="display:none;">
        <div class="tree-modal-overlay" data-close-nav-link></div>
        <div class="tree-modal-card" style="width:480px;">
          <div class="tree-modal-header">
            <span class="tree-modal-title" id="navLinkTitle">添加网址</span>
            <button class="tree-modal-close" type="button" data-close-nav-link>&times;</button>
          </div>
          <div class="tree-modal-body" style="padding:22px;">
            <form method="post" id="navLinkForm" enctype="multipart/form-data">
              <input type="hidden" name="_csrf" value="">
              <input type="hidden" name="keepIcon" value="">
              <div class="ad-form-group">
                <label class="ad-label">名称</label>
                <input name="name" class="ad-input" required maxlength="60" placeholder="网址名称">
              </div>
              <div class="ad-form-group">
                <label class="ad-label">网址</label>
                <input name="url" class="ad-input" required placeholder="https://example.com">
              </div>
              <div class="ad-form-group">
                <label class="ad-label">图标</label>
                <input name="iconText" class="ad-input nav-icon-text" maxlength="12" placeholder="文字或 Emoji，例如 文、😀">
                <div class="nav-icon-editor">
                  <div class="nav-icon-preview" id="navIconPreview"><span>?</span></div>
                  <div class="nav-icon-editor-fields">
                    <label class="nav-icon-file">
                      <input type="file" name="iconFile" accept=".png,.jpg,.jpeg,.gif,.webp,.svg,image/png,image/jpeg,image/gif,image/webp,image/svg+xml">
                      <span class="nav-icon-file-btn" id="navIconFileLabel">上传图片</span>
                    </label>
                    <div class="nav-icon-file-name" id="navIconFileName"></div>
                    <label class="nav-icon-reset" id="navIconResetWrap">
                      <input type="checkbox" name="resetIcon" value="1">
                      <span>重新获取网站图标</span>
                    </label>
                    <div class="nav-icon-hint" id="navIconHint">留空则自动获取网站图标。上传图片优先于文字。</div>
                  </div>
                </div>
              </div>
              <div class="ad-actions">
                <button type="button" class="ad-btn-cancel" data-close-nav-link>取消</button>
                <button type="submit" class="ad-btn-primary">保存</button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <div class="tree-modal" id="navDeleteModal" style="display:none;">
        <div class="tree-modal-overlay" data-close-nav-delete></div>
        <div class="tree-modal-card" style="width:400px;">
          <div class="tree-modal-header">
            <span class="tree-modal-title">删除网址</span>
            <button class="tree-modal-close" type="button" data-close-nav-delete>&times;</button>
          </div>
          <div class="tree-modal-body" style="padding:22px;">
            <form method="post" id="navDeleteForm">
              <input type="hidden" name="_csrf" value="">
              <p class="nav-delete-text" id="navDeleteText"></p>
              <div class="ad-actions">
                <button type="button" class="ad-btn-cancel" data-close-nav-delete>取消</button>
                <button type="submit" class="ad-btn-danger">删除</button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <script>
      (function () {
        var toast = document.getElementById('pageToast');
        if (toast) {
          setTimeout(function () { toast.classList.add('is-hide'); }, 1800);
          setTimeout(function () { toast.remove(); }, 2200);
        }
        var csrfMeta = document.querySelector('meta[name="csrf-token"]');
        var csrf = csrfMeta ? csrfMeta.content : '';
        document.querySelectorAll('#navLinkForm input[name="_csrf"], #navDeleteForm input[name="_csrf"]').forEach(function (input) {
          input.value = csrf;
        });

        var linkModal = document.getElementById('navLinkModal');
        var linkForm = document.getElementById('navLinkForm');
        var linkTitle = document.getElementById('navLinkTitle');
        var textInput = linkForm.querySelector('input[name="iconText"]');
        var fileInput = linkForm.querySelector('input[name="iconFile"]');
        var keepInput = linkForm.querySelector('input[name="keepIcon"]');
        var resetInput = linkForm.querySelector('input[name="resetIcon"]');
        var resetWrap = document.getElementById('navIconResetWrap');
        var preview = document.getElementById('navIconPreview');
        var fileLabel = document.getElementById('navIconFileLabel');
        var fileName = document.getElementById('navIconFileName');
        var iconHint = document.getElementById('navIconHint');

        function paintPreview(src, text, fallback) {
          preview.innerHTML = '';
          if (src) {
            var img = document.createElement('img');
            img.alt = '';
            img.src = src;
            preview.appendChild(img);
            return;
          }
          var span = document.createElement('span');
          span.textContent = text || String(fallback || '?').slice(0, 1).toUpperCase();
          preview.appendChild(span);
        }

        function openLinkModal(kind, data) {
          data = data || {};
          linkTitle.textContent = kind === 'edit' ? '编辑网址' : '添加网址';
          linkForm.action = kind === 'edit' ? '/admin/nav/links/' + data.id + '/update' : '/admin/nav/links';
          linkForm.querySelector('input[name="name"]').value = data.name || '';
          linkForm.querySelector('input[name="url"]').value = data.url || '';
          fileInput.value = '';
          fileLabel.textContent = '上传图片';
          fileName.textContent = '';
          resetInput.checked = false;
          var icon = data.icon || '';
          var isImage = /^https?:\/\//i.test(icon) || icon.indexOf('/nav-icon/') === 0;
          if (kind === 'edit' && isImage) {
            textInput.value = '';
            keepInput.value = '1';
            paintPreview(icon, '', data.name);
            resetWrap.style.display = 'flex';
            iconHint.textContent = '当前是图片。可改成文字、重新上传，或不修改直接保存。';
          } else if (kind === 'edit' && icon) {
            textInput.value = icon;
            keepInput.value = '0';
            paintPreview('', icon, data.name);
            resetWrap.style.display = 'flex';
            iconHint.textContent = '修改文字或上传图片。不修改则保留当前文字图标。';
          } else {
            textInput.value = '';
            keepInput.value = '';
            paintPreview('', '', data.name || '?');
            resetWrap.style.display = 'none';
            iconHint.textContent = '留空则自动获取网站图标。上传图片优先于文字。';
          }
          linkModal.style.display = 'flex';
          setTimeout(function () { linkForm.querySelector('input[name="name"]').focus(); }, 50);
        }
        function closeLinkModal() { linkModal.style.display = 'none'; }
        linkModal.querySelectorAll('[data-close-nav-link]').forEach(function (el) {
          el.addEventListener('click', closeLinkModal);
        });
        document.getElementById('navAddLinkBtn').addEventListener('click', function () { openLinkModal('create'); });
        document.querySelectorAll('.nav-card-edit').forEach(function (editBtn) {
          editBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            openLinkModal('edit', {
              id: editBtn.getAttribute('data-id'),
              name: editBtn.getAttribute('data-name'),
              url: editBtn.getAttribute('data-url'),
              icon: editBtn.getAttribute('data-icon')
            });
          });
        });
        document.querySelectorAll('.nav-card-actions').forEach(function (actions) {
          actions.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
          });
        });
        var deleteModal = document.getElementById('navDeleteModal');
        var deleteForm = document.getElementById('navDeleteForm');
        var deleteText = document.getElementById('navDeleteText');
        function closeDeleteModal() { deleteModal.style.display = 'none'; }
        deleteModal.querySelectorAll('[data-close-nav-delete]').forEach(function (el) {
          el.addEventListener('click', closeDeleteModal);
        });
        document.querySelectorAll('.nav-card-del').forEach(function (btn) {
          btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            var name = btn.getAttribute('data-name') || '';
            deleteForm.action = '/admin/nav/links/' + btn.getAttribute('data-id') + '/delete';
            deleteText.textContent = '确认删除「' + name + '」吗？删除后无法恢复。';
            deleteModal.style.display = 'flex';
          });
        });
        textInput.addEventListener('input', function () {
          keepInput.value = textInput.value.trim() ? '0' : keepInput.value;
          if (fileInput.files && fileInput.files[0]) return;
          paintPreview('', textInput.value.trim(), linkForm.querySelector('input[name="name"]').value);
        });
        fileInput.addEventListener('change', function () {
          var file = fileInput.files && fileInput.files[0];
          fileLabel.textContent = file ? '重新选择' : '上传图片';
          fileName.textContent = file ? file.name : '';
          if (!file) return;
          keepInput.value = '0';
          var reader = new FileReader();
          reader.onload = function () { paintPreview(reader.result, '', ''); };
          reader.readAsDataURL(file);
        });

        var searchInput = document.getElementById('navSearch');
        var resultMeta = document.getElementById('navResultMeta');
        var allCards = Array.prototype.slice.call(document.querySelectorAll('.nav-card'));

        function applyFilter(keyword) {
          var kw = keyword.trim().toLowerCase();
          var visible = 0;
          var firstVisible = null;
          allCards.forEach(function (card) {
            var name = (card.getAttribute('data-name') || '').toLowerCase();
            var url = (card.getAttribute('data-url') || '').toLowerCase();
            var ok = !kw || name.indexOf(kw) !== -1 || url.indexOf(kw) !== -1;
            card.style.display = ok ? '' : 'none';
            if (ok) {
              visible++;
              if (!firstVisible) firstVisible = card;
            }
          });
          var empty = document.querySelector('.nav-empty');
          if (empty) empty.style.display = kw ? 'none' : '';
          resultMeta.textContent = kw
            ? ('匹配 ' + visible + ' 项' + (firstVisible ? '，回车直达「' + (firstVisible.getAttribute('data-name') || '') + '」' : ''))
            : '';
          return firstVisible;
        }
        searchInput.addEventListener('input', function () { applyFilter(searchInput.value); });
        searchInput.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') {
            e.preventDefault();
            var first = applyFilter(searchInput.value);
            if (first) window.open(first.getAttribute('href'), '_blank', 'noopener');
          } else if (e.key === 'Escape') {
            searchInput.value = '';
            applyFilter('');
          }
        });

        var dragId = null;
        var grid = document.getElementById('navGrid');
        document.addEventListener('dragstart', function (e) {
          var card = e.target.closest('.nav-card');
          if (!card) return;
          dragId = card.getAttribute('data-id');
          card.classList.add('dragging');
          e.dataTransfer.effectAllowed = 'move';
          try { e.dataTransfer.setData('text/plain', dragId); } catch (_) {}
        });
        document.addEventListener('dragend', function () {
          document.querySelectorAll('.nav-card.dragging, .nav-card.drag-over').forEach(function (c) {
            c.classList.remove('dragging', 'drag-over');
          });
          dragId = null;
        });
        document.addEventListener('dragover', function (e) {
          var card = e.target.closest('.nav-card');
          if (!card || !dragId || card.getAttribute('data-id') === dragId) return;
          e.preventDefault();
          card.classList.add('drag-over');
        });
        document.addEventListener('dragleave', function (e) {
          var card = e.target.closest('.nav-card');
          if (card) card.classList.remove('drag-over');
        });
        document.addEventListener('drop', function (e) {
          var card = e.target.closest('.nav-card');
          if (!card || !dragId || !grid) return;
          e.preventDefault();
          card.classList.remove('drag-over');
          var cards = Array.prototype.slice.call(grid.querySelectorAll('.nav-card'));
          var moving = cards.find(function (c) { return c.getAttribute('data-id') === dragId; });
          if (!moving || moving === card) return;
          var fromIndex = cards.indexOf(moving);
          var toIndex = cards.indexOf(card);
          grid.insertBefore(moving, toIndex > fromIndex ? card.nextSibling : card);
          var order = Array.prototype.slice.call(grid.querySelectorAll('.nav-card')).map(function (c) {
            return c.getAttribute('data-id');
          });
          fetch('/admin/nav/links/reorder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: '_csrf=' + encodeURIComponent(csrf) + '&order=' + encodeURIComponent(order.join(','))
          }).catch(function () {});
        });
      })();
      </script>
    `
  });
}

module.exports = { navPage };
