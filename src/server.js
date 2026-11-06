const express = require('express');
const path = require('path');
const config = require('./config');
const { initDb } = require('./db');
const { attachCurrentUser } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const siteRoutes = require('./routes/sites');
const portalRoutes = require('./routes/portal');

async function main() {
  await initDb();

  const app = express();
  app.disable('x-powered-by');
  app.use(express.urlencoded({ extended: false }));
  app.use(attachCurrentUser);
  app.use('/portal-static', express.static(path.join(__dirname, 'public'), { fallthrough: false }));

  app.use(authRoutes);
  app.use('/portal', portalRoutes);
  app.use(adminRoutes);
  app.use('/sites', siteRoutes);

  app.use((req, res) => {
    res.status(404).send('页面不存在');
  });

  app.use((error, req, res, _next) => {
    console.error(error);
    res.status(500).send('服务器错误');
  });

  app.listen(config.port, config.host, () => {
    console.log(`Static HTML Host running at http://${config.host}:${config.port}/admin`);
  });
}

main().catch((error) => {
  console.error('启动失败：', error);
  process.exit(1);
});
