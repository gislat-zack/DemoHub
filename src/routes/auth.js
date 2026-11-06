const express = require('express');
const settingsStore = require('../services/settingsStore');
const { loginPage } = require('../views/loginPage');
const { registerPage } = require('../views/registerPage');
const {
  countUsers,
  registerUser,
  authenticateUser,
  createSession,
  deleteSession
} = require('../services/authService');
const { setSessionCookie, clearSessionCookie, requireCsrf } = require('../middleware/auth');

const router = express.Router();

function redirectWithError(res, path, error) {
  res.redirect(`${path}?error=${encodeURIComponent(error.message || String(error))}`);
}

function registrationOpen() {
  return settingsStore.get('allow_register', '1') !== '0';
}

router.get('/login', (req, res) => {
  res.send(loginPage({
    query: req.query,
    hasUsers: countUsers() > 0,
    allowRegister: registrationOpen(),
    settings: settingsStore.getAll()
  }));
});

router.post('/login', async (req, res) => {
  try {
    const user = await authenticateUser(req.body.username, req.body.password);
    const session = createSession(user.id);
    setSessionCookie(res, session.token, session.expiresAt);
    res.redirect(req.body.next || '/admin');
  } catch (error) {
    redirectWithError(res, '/login', error);
  }
});

router.get('/register', (req, res) => {
  const isFirstUser = countUsers() === 0;
  if (!isFirstUser && !registrationOpen()) {
    return redirectWithError(res, '/login', new Error('当前已关闭用户注册'));
  }
  res.send(registerPage({
    query: req.query,
    isFirstUser,
    settings: settingsStore.getAll()
  }));
});

router.post('/register', async (req, res) => {
  try {
    if (countUsers() > 0 && !registrationOpen()) {
      throw new Error('当前已关闭用户注册');
    }
    if (req.body.password !== req.body.confirmPassword) {
      throw new Error('两次输入的密码不一致');
    }

    const user = await registerUser({
      username: req.body.username,
      password: req.body.password
    });

    if (user.status === 'approved') {
      const session = createSession(user.id);
      setSessionCookie(res, session.token, session.expiresAt);
      res.redirect('/admin');
      return;
    }

    res.redirect('/login?registered=1');
  } catch (error) {
    if (countUsers() > 0 && !registrationOpen()) {
      redirectWithError(res, '/login', error);
      return;
    }
    redirectWithError(res, '/register', error);
  }
});

router.post('/logout', (req, res, next) => {
  if (!req.currentUser) {
    clearSessionCookie(res);
    res.redirect('/login');
    return;
  }
  requireCsrf(req, res, next);
}, (req, res) => {
  deleteSession(req.sessionToken);
  clearSessionCookie(res);
  res.redirect('/login');
});

module.exports = router;
