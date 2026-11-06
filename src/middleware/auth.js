const { SESSION_COOKIE, getSessionByToken } = require('../services/authService');

function parseCookies(cookieHeader) {
  const cookies = {};
  for (const pair of String(cookieHeader || '').split(';')) {
    const index = pair.indexOf('=');
    if (index === -1) continue;
    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

function setSessionCookie(res, token, expiresAt) {
  const maxAge = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(token)}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`);
}

function getSessionToken(req) {
  return parseCookies(req.headers.cookie)[SESSION_COOKIE];
}

function attachCurrentUser(req, _res, next) {
  const token = getSessionToken(req);
  const session = getSessionByToken(token);
  req.sessionToken = token;
  req.currentSession = session;
  req.currentUser = session?.user || null;
  req.csrfToken = session?.csrfToken || null;
  next();
}

function requireAuth(req, res, next) {
  if (req.currentUser) {
    next();
    return;
  }
  res.redirect(`/login?next=${encodeURIComponent(req.originalUrl || '/admin')}`);
}

function requireAdmin(req, res, next) {
  if (req.currentUser?.role === 'admin') {
    next();
    return;
  }
  res.status(403).send('需要管理员权限');
}

function requireCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next();
    return;
  }
  if (req.body?._csrf && req.body._csrf === req.csrfToken) {
    next();
    return;
  }
  res.status(403).send('表单已过期，请刷新后重试');
}

module.exports = {
  parseCookies,
  setSessionCookie,
  clearSessionCookie,
  getSessionToken,
  attachCurrentUser,
  requireAuth,
  requireAdmin,
  requireCsrf
};
