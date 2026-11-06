const { layout, escapeHtml, iconSvg, renderToast } = require('./layout');

function settingsPage({ settings, query, currentUser, csrfToken, dataSize, diskStats, currentDataDir, navGroups = [] }) {
  const siteName = settings.site_name || 'DemoHub';
  const siteSubtitle = settings.site_subtitle == null ? '系统演示环境' : String(settings.site_subtitle);
  const logoUrl = settings.logo_url || '';
  const logoSmallUrl = settings.logo_small_url || '';
  const logoDisplay = settings.logo_display === 'small' ? 'small' : 'large';
  const theme = settings.theme === 'dark' ? 'dark' : 'light';
  const tabs = [
    { id: 'basic', label: '基本信息' },
    { id: 'logo', label: 'Logo' },
    { id: 'theme', label: '主题' },
    { id: 'register', label: '用户注册' },
    { id: 'share', label: '分享地址' },
    { id: 'storage', label: '存储位置' },
    { id: 'nav', label: '导航分组' }
  ];
  const activeTab = tabs.some((item) => item.id === query.tab) ? query.tab : 'basic';

  return layout({
    title: '系统设置',
    currentUser,
    csrfToken,
    activeNav: 'settings',
    settings,
    dataSize,
    diskStats,
    content: `
      <div class="page-head">
        <div>
          <div class="page-title">系统设置</div>
          <div class="page-desc">在左侧选择配置项，在右侧修改并保存</div>
        </div>
        <div class="head-actions">
        </div>
      </div>

      ${query.updated ? renderToast('设置已保存。') : ''}
      ${query.configSaved ? renderToast('存储路径已保存，重启服务后生效。') : ''}
      ${query.navSaved ? renderToast('导航分组已保存。') : ''}
      ${query.navDeleted ? renderToast('导航分组已删除。') : ''}
      ${query.error ? renderToast(query.error, 'error') : ''}

      <div class="settings-shell">
        <aside class="settings-menu">
          ${tabs.map((item) => `<button type="button" class="settings-menu-item${item.id === activeTab ? ' active' : ''}" data-settings-tab="${item.id}">${item.label}</button>`).join('')}
        </aside>
        <div class="settings-main">
          <section class="settings-panel${activeTab === 'basic' ? ' active' : ''}" data-settings-panel="basic">
            <div class="settings-card">
              <div class="settings-title">基本信息</div>
              <form class="settings-form" method="post" action="/admin/settings" enctype="multipart/form-data">
                <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
                <input type="hidden" name="section" value="basic">
                <label class="settings-label">
                  <span>系统名称</span>
                  <input name="siteName" value="${escapeHtml(siteName)}" maxlength="50" required>
                </label>
                <label class="settings-label">
                  <span>副标题</span>
                  <input name="siteSubtitle" value="${escapeHtml(siteSubtitle)}" maxlength="40" placeholder="系统演示环境">
                </label>
                <div class="settings-actions">
                  <button type="submit">保存</button>
                </div>
              </form>
            </div>
          </section>

          <section class="settings-panel${activeTab === 'logo' ? ' active' : ''}" data-settings-panel="logo">
            <div class="settings-card">
              <div class="settings-title">Logo</div>
              <form class="settings-form" method="post" action="/admin/settings" enctype="multipart/form-data">
                <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
                <input type="hidden" name="section" value="logo">
                <div class="logo-config">
                  <div class="logo-slot">
                    <span class="settings-label-text">大 Logo</span>
                    <p class="logo-slot-hint">横向图片。选「大 Logo」时按左侧导航栏宽度显示。</p>
                    <div class="logo-preview logo-preview-wide">
                      ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="大 Logo">` : '<span>未设置</span>'}
                    </div>
                    <input type="file" name="logo" accept=".png,.jpg,.jpeg,.gif,.svg,.webp">
                  </div>
                  <div class="logo-slot">
                    <span class="settings-label-text">小 Logo</span>
                    <p class="logo-slot-hint">方形图片。选「小 Logo」时作为导航角标，并用作浏览器图标。</p>
                    <div class="logo-preview logo-preview-small">
                      ${logoSmallUrl ? `<img src="${escapeHtml(logoSmallUrl)}" alt="小 Logo">` : '<span>未设置</span>'}
                    </div>
                    <input type="file" name="logoSmall" accept=".png,.jpg,.jpeg,.gif,.svg,.webp">
                  </div>
                </div>
                <div class="settings-label">
                  <span>导航栏显示</span>
                  <div class="settings-theme-group">
                    <label class="theme-option ${logoDisplay === 'large' ? 'active' : ''}">
                      <input type="radio" name="logoDisplay" value="large" ${logoDisplay === 'large' ? 'checked' : ''}>
                      <span class="theme-swatch">大 Logo</span>
                    </label>
                    <label class="theme-option ${logoDisplay === 'small' ? 'active' : ''}">
                      <input type="radio" name="logoDisplay" value="small" ${logoDisplay === 'small' ? 'checked' : ''}>
                      <span class="theme-swatch">小 Logo</span>
                    </label>
                  </div>
                </div>
                <div class="settings-actions">
                  <button type="submit">保存</button>
                </div>
              </form>
            </div>
          </section>

          <section class="settings-panel${activeTab === 'theme' ? ' active' : ''}" data-settings-panel="theme">
            <div class="settings-card">
              <div class="settings-title">主题</div>
              <form class="settings-form" method="post" action="/admin/settings" enctype="multipart/form-data">
                <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
                <input type="hidden" name="section" value="theme">
                <div class="settings-label">
                  <span>默认主题</span>
                  <div class="settings-theme-group">
                    <label class="theme-option ${theme === 'light' ? 'active' : ''}">
                      <input type="radio" name="theme" value="light" ${theme === 'light' ? 'checked' : ''}>
                      <span class="theme-swatch light">浅色</span>
                    </label>
                    <label class="theme-option ${theme === 'dark' ? 'active' : ''}">
                      <input type="radio" name="theme" value="dark" ${theme === 'dark' ? 'checked' : ''}>
                      <span class="theme-swatch dark">深色</span>
                    </label>
                  </div>
                </div>
                <div class="settings-actions">
                  <button type="submit">保存</button>
                </div>
              </form>
            </div>
          </section>

          <section class="settings-panel${activeTab === 'register' ? ' active' : ''}" data-settings-panel="register">
            <div class="settings-card">
              <div class="settings-title">用户注册</div>
              <form class="settings-form" method="post" action="/admin/settings" enctype="multipart/form-data">
                <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
                <input type="hidden" name="section" value="register">
                <div class="settings-label">
                  <span>允许用户注册</span>
                  <div class="settings-theme-group">
                    <label class="theme-option ${settings.allow_register === '0' ? '' : 'active'}">
                      <input type="radio" name="allowRegister" value="1" ${settings.allow_register === '0' ? '' : 'checked'}>
                      <span class="theme-swatch">开启</span>
                    </label>
                    <label class="theme-option ${settings.allow_register === '0' ? 'active' : ''}">
                      <input type="radio" name="allowRegister" value="0" ${settings.allow_register === '0' ? 'checked' : ''}>
                      <span class="theme-swatch">关闭</span>
                    </label>
                  </div>
                  <div class="storage-hint">关闭后，登录页不再提供注册入口，已有用户不受影响。系统尚无用户时，仍可创建第一个管理员。</div>
                </div>
                <div class="settings-actions">
                  <button type="submit">保存</button>
                </div>
              </form>
            </div>
          </section>

          <section class="settings-panel${activeTab === 'share' ? ' active' : ''}" data-settings-panel="share">
            <div class="settings-card">
              <div class="settings-title">分享地址</div>
              <form class="settings-form" method="post" action="/admin/settings" enctype="multipart/form-data">
                <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
                <input type="hidden" name="section" value="share">
                <label class="settings-label">
                  <span>对外分享地址</span>
                  <input name="publicBaseUrl" value="${escapeHtml(settings.public_base_url || '')}" maxlength="200" placeholder="留空则跟随当前访问地址，例如 http://192.168.1.11:3000">
                  <div class="storage-hint">留空时，网站管理、文件管理和仪表盘里的访问地址跟随你打开后台所用的地址。填写后，这些链接固定使用该地址，方便在本机管理、把局域网或域名链接分享出去。以后换成域名，只改这一项即可。管理页预览、目录树和门户内嵌仍使用当前访问地址。</div>
                </label>
                <div class="settings-actions">
                  <button type="submit">保存</button>
                </div>
              </form>
            </div>
          </section>

          <section class="settings-panel${activeTab === 'storage' ? ' active' : ''}" data-settings-panel="storage">
            <div class="settings-card">
              <div class="settings-title">存储位置</div>
              <div class="storage-info">
                <div class="storage-current">
                  <span class="storage-label">当前数据目录</span>
                  <code class="storage-path">${escapeHtml(currentDataDir || '')}</code>
                </div>
                <form class="settings-form" method="post" action="/admin/settings/data-dir" id="dataDirForm">
                  <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
                  <label class="settings-label">
                    <span>自定义数据目录（留空使用默认值）</span>
                    <div class="dir-picker-input-row">
                      <input name="dataDir" id="dataDirInput" value="" placeholder="例如: D:\\my-data" class="storage-input">
                      <button type="button" class="dir-picker-browse-btn" id="dirPickerOpen">浏览</button>
                    </div>
                    <div class="storage-hint">修改后将在下次重启时生效，当前目录不会自动迁移数据。浏览在页面内列出服务器目录，Windows 从磁盘列表开始，Linux 从根目录开始。</div>
                  </label>
                  <div class="settings-actions">
                    <button type="submit">保存</button>
                  </div>
                </form>
              </div>
            </div>
          </section>

          <section class="settings-panel${activeTab === 'nav' ? ' active' : ''}" data-settings-panel="nav">
            <div class="settings-card">
              <div class="settings-title">导航分组</div>
              <p class="storage-hint">分组只在这里管理。导航页只展示网址图标，新添加的网址会归入第一个分组。</p>
              <form class="nav-group-create" method="post" action="/admin/nav/groups">
                <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
                <input name="name" maxlength="40" required placeholder="新分组名称">
                <button type="submit">保存</button>
              </form>
              <div class="nav-group-manage">
                ${navGroups.length === 0 ? '<div class="nav-empty">还没有分组。</div>' : navGroups.map((group) => `
                  <div class="nav-group-manage-row">
                    <form method="post" action="/admin/nav/groups/${escapeHtml(group.id)}/rename" class="nav-group-rename-form">
                      <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
                      <input name="name" value="${escapeHtml(group.name)}" maxlength="40" required>
                      <button type="submit">保存</button>
                    </form>
                    <span class="nav-group-count-badge">${Number(group.linkCount) || 0}</span>
                    <form method="post" action="/admin/nav/groups/${escapeHtml(group.id)}/delete" onsubmit="return confirm('确认删除分组「${escapeHtml(group.name)}」吗？其中的网址将一并删除。');">
                      <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
                      <button type="submit" class="btn btn-danger">删除</button>
                    </form>
                  </div>
                `).join('')}
              </div>
            </div>
          </section>
        </div>
      </div>

      <div class="tree-modal" id="dirPickerModal" hidden>
        <div class="tree-modal-card dir-picker-card">
          <div class="tree-modal-head">
            <strong>选择数据目录</strong>
            <button type="button" class="tree-modal-close" id="dirPickerClose" aria-label="关闭">×</button>
          </div>
          <div class="dir-picker-path-row">
            <input id="dirPickerPath" placeholder="输入服务器上的目录路径">
            <button type="button" class="btn" id="dirPickerGo">打开</button>
          </div>
          <div class="dir-picker-error" id="dirPickerError"></div>
          <div class="dir-picker-list" id="dirPickerList"></div>
          <div class="tree-modal-actions">
            <button type="button" class="btn" id="dirPickerUp">上级</button>
            <button type="button" class="btn" id="dirPickerRoots">磁盘/根目录</button>
            <button type="button" class="btn" id="dirPickerCancel">取消</button>
            <button type="button" class="btn btn-primary" id="dirPickerChoose">选择此目录</button>
          </div>
        </div>
      </div>
      <script>
      (function () {
        document.querySelectorAll('[data-settings-tab]').forEach(function (button) {
          button.addEventListener('click', function () {
            var id = button.getAttribute('data-settings-tab');
            document.querySelectorAll('[data-settings-tab]').forEach(function (item) {
              item.classList.toggle('active', item === button);
            });
            document.querySelectorAll('[data-settings-panel]').forEach(function (panel) {
              panel.classList.toggle('active', panel.getAttribute('data-settings-panel') === id);
            });
          });
        });

        document.querySelectorAll('.settings-theme-group').forEach(function (group) {
          group.addEventListener('change', function (event) {
            var input = event.target;
            if (!input || input.type !== 'radio') return;
            group.querySelectorAll('.theme-option').forEach(function (option) {
              option.classList.toggle('active', option.contains(input) && input.checked);
            });
          });
        });

        var currentPath = ${JSON.stringify(currentDataDir || '')};
        var dataDirInput = document.getElementById('dataDirInput');
        var openBtn = document.getElementById('dirPickerOpen');
        var modal = document.getElementById('dirPickerModal');
        var pathInput = document.getElementById('dirPickerPath');
        var listEl = document.getElementById('dirPickerList');
        var errorEl = document.getElementById('dirPickerError');
        var chooseBtn = document.getElementById('dirPickerChoose');
        var upBtn = document.getElementById('dirPickerUp');
        var state = { current: '', parent: '', atRoots: false };

        function closePicker() {
          if (modal) modal.hidden = true;
        }

        function renderDirs(data) {
          state = data || {};
          if (pathInput) pathInput.value = state.current || '';
          if (chooseBtn) chooseBtn.disabled = !state.current;
          if (upBtn) upBtn.disabled = !state.parent;
          if (errorEl) errorEl.textContent = state.error || '';
          if (!listEl) return;
          var dirs = state.dirs || [];
          if (!dirs.length) {
            listEl.innerHTML = '<div class="dir-picker-empty">' + (state.atRoots ? '没有可用磁盘' : '没有可进入的子目录') + '</div>';
            return;
          }
          listEl.innerHTML = dirs.map(function (dir) {
            return '<button type="button" class="dir-picker-item" data-path="' + String(dir.path).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;') + '"><span>' + String(dir.name).replace(/&/g,'&amp;').replace(/</g,'&lt;') + '</span></button>';
          }).join('');
        }

        function loadDir(target) {
          if (errorEl) errorEl.textContent = '';
          if (listEl) listEl.innerHTML = '<div class="dir-picker-empty">读取中...</div>';
          fetch('/admin/browse-dir?path=' + encodeURIComponent(target || ''))
            .then(function (response) { return response.json(); })
            .then(renderDirs)
            .catch(function () {
              if (errorEl) errorEl.textContent = '读取目录失败';
            });
        }

        if (openBtn && modal) {
          openBtn.addEventListener('click', function () {
            modal.hidden = false;
            loadDir(dataDirInput && dataDirInput.value.trim() ? dataDirInput.value.trim() : currentPath);
          });
        }
        if (listEl) {
          listEl.addEventListener('click', function (event) {
            var item = event.target.closest('[data-path]');
            if (item) loadDir(item.getAttribute('data-path'));
          });
        }
        var goBtn = document.getElementById('dirPickerGo');
        if (goBtn && pathInput) goBtn.addEventListener('click', function () { loadDir(pathInput.value.trim()); });
        if (pathInput) pathInput.addEventListener('keydown', function (event) {
          if (event.key === 'Enter') { event.preventDefault(); loadDir(pathInput.value.trim()); }
        });
        if (upBtn) upBtn.addEventListener('click', function () { if (state.parent) loadDir(state.parent); });
        var rootsBtn = document.getElementById('dirPickerRoots');
        if (rootsBtn) rootsBtn.addEventListener('click', function () { loadDir(''); });
        if (chooseBtn && dataDirInput) chooseBtn.addEventListener('click', function () {
          if (!state.current) return;
          dataDirInput.value = state.current;
          closePicker();
        });
        ['dirPickerClose', 'dirPickerCancel'].forEach(function (id) {
          var button = document.getElementById(id);
          if (button) button.addEventListener('click', closePicker);
        });
        if (modal) modal.addEventListener('click', function (event) { if (event.target === modal) closePicker(); });
      })();
      </script>
    `
  });
}

module.exports = { settingsPage };
