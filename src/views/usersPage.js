const { layout, escapeHtml, statCard, iconSvg, renderToast } = require('./layout');

function statusLabel(status) {
  const map = {
    pending: '待审批',
    approved: '已审批',
    rejected: '已拒绝',
    disabled: '已禁用'
  };
  return map[status] || status;
}

function statusTagClass(status) {
  if (status === 'approved') return 'tag-success';
  if (status === 'pending') return 'tag-warning';
  return 'tag-danger';
}

function roleLabel(role) {
  return role === 'admin' ? '管理员' : '用户';
}

function renderAlert(query) {
  if (query.error) return renderToast(query.error, 'error');
  if (query.created) return renderToast('用户已创建，可直接登录。');
  if (query.updated) return renderToast('用户状态已更新。');
  return '';
}

function userInitial(username) {
  return String(username || 'U').slice(0, 1).toUpperCase();
}

function usersPage({ users, query, currentUser, csrfToken, settings, dataSize, diskStats }) {
  const pendingCount = users.filter((user) => user.status === 'pending').length;
  const approvedCount = users.filter((user) => user.status === 'approved').length;
  const adminCount = users.filter((user) => user.role === 'admin').length;

  const rows = users.map((user) => `
    <tr class="user-list-row" data-name="${escapeHtml(user.username).toLowerCase()}">
      <td>
        <div class="file-cell">
          <div class="avatar">${escapeHtml(userInitial(user.username))}</div>
          <div class="file-info">
            <span class="file-title">${escapeHtml(user.username)}</span>
            <span class="file-sub">ID ${escapeHtml(user.id.slice(0, 8))}</span>
          </div>
        </div>
      </td>
      <td><span class="tag ${user.role === 'admin' ? 'tag-primary' : ''}">${escapeHtml(roleLabel(user.role))}</span></td>
      <td><span class="tag ${escapeHtml(statusTagClass(user.status))}">${escapeHtml(statusLabel(user.status))}</span></td>
      <td class="muted">${escapeHtml(new Date(user.createdAt).toLocaleString('zh-CN', { hour12: false }))}</td>
      <td>
        <div class="actions">
          <form method="post" action="/admin/users/${escapeHtml(user.id)}/approve">
            <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
            <button class="act" type="submit">审批通过</button>
          </form>
          <form method="post" action="/admin/users/${escapeHtml(user.id)}/reject" data-confirm="确认拒绝这个用户吗？">
            <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
            <button class="act act-danger" type="submit">拒绝</button>
          </form>
          <form method="post" action="/admin/users/${escapeHtml(user.id)}/disable" data-confirm="确认禁用这个用户吗？">
            <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
            <button class="act act-danger" type="submit">禁用</button>
          </form>
        </div>
      </td>
    </tr>
  `).join('');

  return layout({
    title: '用户管理',
    currentUser,
    csrfToken,
    activeNav: 'users',
    settings,
    dataSize,
    diskStats,
    content: `
      <div class="page-head">
        <div>
          <div class="page-title">用户管理</div>
          <div class="page-desc">团队成员与审批状态，共 ${escapeHtml(users.length)} 个账号</div>
        </div>
        <div class="head-actions">
          <button class="btn btn-primary" type="button" id="openCreateUser">+ 新增用户</button>
        </div>
      </div>
      ${renderAlert(query)}
      <div class="stats">
        ${statCard({ icon: 'usersStat', tone: 'blue', value: users.length, label: '注册用户' })}
        ${statCard({ icon: 'clock', tone: 'orange', value: pendingCount, label: '待审批' })}
        ${statCard({ icon: 'check', tone: 'green', value: approvedCount, label: '已审批' })}
        ${statCard({ icon: 'star', tone: 'red', value: adminCount, label: '管理员' })}
      </div>
      <div class="panel">
        <div class="panel-bar">
          <div class="panel-title">团队成员</div>
          <form class="nav-search-wrap" role="search" id="userSearchForm" action="#" onsubmit="return false;">
            <label class="sr-only" for="userSearch">搜索用户</label>
            <span class="nav-search-icon">${iconSvg('site', 15)}</span>
            <input type="search" class="nav-search" id="userSearch" placeholder="搜索用户" autocomplete="off">
          </form>
        </div>
        <div class="table-scroll">
          <table>
            <thead><tr><th style="width:26%">用户</th><th>角色</th><th>状态</th><th>注册时间</th><th style="text-align:right">操作</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="5" class="empty-cell">暂无用户。</td></tr>'}</tbody>
          </table>
        </div>
      </div>
      <div class="tree-modal" id="createUserModal" style="display:none;">
        <div class="tree-modal-overlay" id="createUserOverlay"></div>
        <div class="tree-modal-card">
          <div class="tree-modal-header">
            <span class="tree-modal-title">新增用户</span>
            <button class="tree-modal-close" id="createUserClose" type="button" aria-label="关闭"></button>
          </div>
          <div class="tree-modal-body">
            <form class="stack-form" method="post" action="/admin/users" style="margin:0;">
              <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
              <label>用户名<input name="username" autocomplete="off" required minlength="3" maxlength="32"></label>
              <label>密码<input name="password" type="password" autocomplete="new-password" required minlength="6"></label>
              <label>确认密码<input name="confirmPassword" type="password" autocomplete="new-password" required minlength="6"></label>
              <label>角色
                <select name="role">
                  <option value="user" selected>用户</option>
                  <option value="admin">管理员</option>
                </select>
              </label>
              <button class="btn btn-primary" type="submit">创建</button>
            </form>
          </div>
        </div>
      </div>
      <script>
      (function () {
        var modal = document.getElementById('createUserModal');
        var openBtn = document.getElementById('openCreateUser');
        if (!modal || !openBtn) return;
        function open() { modal.style.display = 'flex'; }
        function close() { modal.style.display = 'none'; }
        openBtn.addEventListener('click', open);
        document.getElementById('createUserClose').addEventListener('click', close);
        document.getElementById('createUserOverlay').addEventListener('click', close);
        var search = document.getElementById('userSearch');
        if (search) {
          search.addEventListener('input', function () {
            var q = search.value.trim().toLowerCase();
            document.querySelectorAll('.user-list-row').forEach(function (row) {
              row.hidden = q && (row.getAttribute('data-name') || '').indexOf(q) === -1;
            });
          });
        }
      })();
      </script>
    `
  });
}

module.exports = { usersPage };
