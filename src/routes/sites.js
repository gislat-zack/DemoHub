const express = require('express');
const path = require('path');
const { getSite, incrementVisitCount, logVisit } = require('../services/siteStore');
const { assertInside } = require('../services/fileUtils');
const config = require('../config');

const router = express.Router();
const siteIdPattern = /^[a-f0-9-]{36}$/;

function isExpired(site) {
  const days = Number(site.accessDays);
  if (!days || days <= 0) return false; // 0 = unlimited
  const created = new Date(site.createdAt).getTime();
  const expiresAt = created + days * 24 * 60 * 60 * 1000;
  return Date.now() > expiresAt;
}

function expiredPage(site) {
  const days = Number(site.accessDays);
  const created = new Date(site.createdAt).toLocaleDateString('zh-CN');
  const expires = new Date(new Date(site.createdAt).getTime() + days * 24 * 60 * 60 * 1000).toLocaleDateString('zh-CN');
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>访问已过期</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;background:#f5f7fa;color:#595959;}
  .card{background:#fff;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,0.08);padding:48px 40px;text-align:center;max-width:440px;}
  .icon{font-size:56px;margin-bottom:16px;}
  h1{font-size:20px;color:#262626;margin:0 0 12px;}
  p{font-size:14px;line-height:1.7;color:#8c8c8c;margin:4px 0;}
  .detail{background:#f5f7fa;border-radius:6px;padding:12px 16px;margin-top:20px;font-size:13px;color:#595959;}
</style>
</head>
<body>
<div class="card">
  <div class="icon">⏰</div>
  <h1>访问已过期</h1>
  <p>该站点的访问期限已结束。</p>
  <div class="detail">
    站点名称：${String(site.originalName).replace(/</g,'&lt;')}<br>
    创建时间：${created}<br>
    有效天数：${days} 天<br>
    到期时间：${expires}
  </div>
</div>
</body>
</html>`;
}

router.use('/:siteId', (req, res, next) => {
  const { siteId } = req.params;
  if (!siteIdPattern.test(siteId)) {
    return res.status(404).send('站点不存在');
  }

  const site = getSite(siteId);
  if (!site) {
    return res.status(404).send('站点不存在');
  }

  try {
    assertInside(config.sitesDir, site.rootPath);
  } catch (_error) {
    return res.status(500).send('站点路径异常');
  }

  // Check access expiry
  if (isExpired(site)) {
    return res.status(410).send(expiredPage(site));
  }

  // Fire-and-forget: record visit asynchronously
  try { incrementVisitCount(siteId); logVisit(siteId); } catch (_e) {}

  const entry = String(site.entryFile || 'index.html').replace(/\\/g, '/');
  const safeEntry = entry && !entry.startsWith('/') && !entry.split('/').includes('..');
  const atRoot = req.path === '/' || req.path === '';
  if (safeEntry && atRoot && entry.includes('/')) {
    const encoded = entry.split('/').map((segment) => encodeURIComponent(segment)).join('/');
    return res.redirect(302, `/sites/${siteId}/${encoded}`);
  }

  express.static(site.rootPath, {
    index: safeEntry && !entry.includes('/') ? path.basename(entry) : 'index.html',
    fallthrough: false,
    setHeaders: (response, filePath) => {
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.setHeader('Referrer-Policy', 'no-referrer-when-downgrade');
      response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
      if (path.extname(filePath).toLowerCase() === '.svg') {
        response.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline' data:; img-src data: blob: 'self'; font-src data:");
      }
    }
  })(req, res, next);
});

module.exports = router;
