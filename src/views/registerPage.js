const { layout, escapeHtml, renderToast } = require('./layout');

function registerPage({ query = {}, isFirstUser, settings = null }) {
  const alert = query.error ? renderToast(query.error, 'error') : '';

  return layout({
    title: isFirstUser ? '创建管理员' : '注册账号',
    content: `
      <section class="auth-card">
        <h1>${isFirstUser ? '创建第一个管理员' : '注册账号'}</h1>
        <p class="muted">${isFirstUser ? '第一个用户会自动成为已审批管理员。' : '注册后需要管理员审批才能使用系统。'}</p>
        ${alert}
        <form class="stack-form" method="post" action="/register">
          <label>用户名<input name="username" autocomplete="username" required></label>
          <label>密码<input name="password" type="password" autocomplete="new-password" required></label>
          <label>确认密码<input name="confirmPassword" type="password" autocomplete="new-password" required></label>
          <button class="btn btn-primary" type="submit">${isFirstUser ? '创建管理员' : '注册'}</button>
        </form>
        <p class="muted"><a href="/login">返回登录</a></p>
      </section>
    `,
    settings
  });
}

module.exports = { registerPage };
