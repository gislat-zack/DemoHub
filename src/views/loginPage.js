const { layout, escapeHtml, renderToast } = require('./layout');

function loginPage({ query = {}, hasUsers, allowRegister = true, settings = null }) {
  const next = query.next || '/admin';
  const alert = query.error
    ? renderToast(query.error, 'error')
    : query.registered
      ? renderToast('注册成功，请等待管理员审批。')
      : '';

  return layout({
    title: '登录',
    content: `
      <section class="auth-card">
        <h1>登录</h1>
        <p class="muted">${hasUsers ? '请输入账号密码进入控制台。' : '系统还没有管理员，请先注册第一个管理员账户。'}</p>
        ${alert}
        <form class="stack-form" method="post" action="/login">
          <input type="hidden" name="next" value="${escapeHtml(next)}">
          <label>用户名<input name="username" autocomplete="username" required></label>
          <label>密码<input name="password" type="password" autocomplete="current-password" required></label>
          <button type="submit">登录</button>
        </form>
        ${!hasUsers || allowRegister ? `<p class="muted"><a href="/register">${hasUsers ? '注册新账号' : '创建第一个管理员'}</a></p>` : ''}
      </section>
    `,
    settings
  });
}

module.exports = { loginPage };
