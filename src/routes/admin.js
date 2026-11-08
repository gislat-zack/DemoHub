const express = require('express');
const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const config = require('../config');
const {
  listSites,
  countSites,
  countUngroupedSites,
  getSite,
  moveSiteToFolder,
  deleteSite,
  updateAccessDays,
  getVisitStats
} = require('../services/siteStore');
const {
  createFolder,
  listFoldersWithCounts,
  getFolder,
  updateFolder,
  deleteFolder,
  folderExists
} = require('../services/folderStore');
const {
  listUsers,
  approveUser,
  rejectUser,
  disableUser,
  createUserByAdmin
} = require('../services/authService');
const { upload, handleUploadedFile, handleFolderUpload } = require('../services/uploadService');
const settingsStore = require('../services/settingsStore');
const { removeDir, assertInside, getDirectoryStats, getDiskStats } = require('../services/fileUtils');
const { createDownloadJob, getDownloadJob, publicJob } = require('../services/downloadJobs');
const { getDirectoryTree } = require('../services/dirTree');
const { requireAuth, requireAdmin, requireCsrf } = require('../middleware/auth');
const { adminPage } = require('../views/adminPage');
const { dashboardPage } = require('../views/dashboardPage');
const { fileManagerPage } = require('../views/fileManagerPage');
const { settingsPage } = require('../views/settingsPage');
const { usersPage } = require('../views/usersPage');
const { navPage } = require('../views/navPage');
const { portalAdminPage } = require('../views/portalAdminPage');
const portalStore = require('../services/portalStore');
const {
  createGroup: createNavGroup,
  listGroups: listNavGroups,
  updateGroup: updateNavGroup,
  deleteGroup: deleteNavGroup,
  reorderGroups: reorderNavGroups,
  createLink: createNavLink,
  listLinks: listNavLinks,
  listAllLinksWithGroups: listAllNavLinks,
  updateLink: updateNavLink,
  deleteLink: deleteNavLink,
  reorderLinks: reorderNavLinks,
  fillMissingIcons
} = require('../services/navStore');

const router = express.Router();

const logoUpload = multer({
  storage: multer.diskStorage({
    destination: config.logoDir,
    filename(_req, file, cb) {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.png';
      cb(null, `${crypto.randomUUID()}${ext}`);
    }
  }),
  limits: {
    fileSize: 2 * 1024 * 1024,
    files: 3
  },
  fileFilter(_req, file, cb) {
    const allowed = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'];
    const ext = path.extname(file.originalname || '').toLowerCase();
    cb(null, allowed.includes(ext));
  }
});

const portalLogoUpload = multer({
  storage: multer.diskStorage({
    destination: config.logoDir,
    filename(_req, file, cb) {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.png';
      cb(null, `${crypto.randomUUID()}${ext}`);
    }
  }),
  limits: {
    fileSize: 2 * 1024 * 1024,
    files: 1
  },
  fileFilter(_req, file, cb) {
    const allowed = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'];
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!allowed.includes(ext)) {
      cb(new Error('Logo 仅支持 png、jpg、gif、svg、webp'));
      return;
    }
    cb(null, true);
  }
});

const navIconUpload = multer({
  storage: multer.diskStorage({
    destination: config.navIconDir,
    filename(_req, file, cb) {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.png';
      cb(null, `${crypto.randomUUID()}${ext}`);
    }
  }),
  limits: {
    fileSize: 2 * 1024 * 1024,
    files: 1
  },
  fileFilter(_req, file, cb) {
    const allowed = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'];
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!allowed.includes(ext)) {
      cb(new Error('图标仅支持 png、jpg、gif、svg、webp'));
      return;
    }
    cb(null, true);
  }
});

function getBaseUrl(req) {
  return `${req.protocol}://${req.get('host')}`;
}

function normalizeShareBase(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  let url;
  try {
    url = new URL(raw);
  } catch (_error) {
    throw new Error('分享地址必须是以 http:// 或 https:// 开头的网址');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('分享地址必须是以 http:// 或 https:// 开头的网址');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('分享地址不能包含账号、参数或锚点');
  }
  const pathname = url.pathname.replace(/\/+$/, '');
  return `${url.origin}${pathname}`;
}

function getShareBaseUrl(req) {
  try {
    const configured = normalizeShareBase(req.appSettings && req.appSettings.public_base_url);
    return configured || getBaseUrl(req);
  } catch (_error) {
    return getBaseUrl(req);
  }
}

function currentFolderQuery(req) {
  return req.body.returnFolder || req.query.folder || '';
}

function adminRedirect(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return query ? `/admin?${query}` : '/admin';
}

function currentView(req) {
  return req.query.view || req.body.returnView || '';
}

function redirectWithError(res, error, folder = '', view = '', upload = false) {
  const params = { error: error.message || String(error) };
  if (folder) params.folder = folder;
  if (view) params.view = view;
  if (upload) params.upload = '1';
  res.redirect(adminRedirect(params));
}

function validateFolderId(folderId) {
  if (!folderId) return null;
  if (!folderExists(folderId)) {
    throw new Error('文件夹不存在');
  }
  return folderId;
}

function resolveSiteListOptions(selectedFolder) {
  if (!selectedFolder) return {};
  if (selectedFolder === 'ungrouped') return { ungrouped: true };
  const folder = getFolder(selectedFolder);
  if (!folder) {
    throw new Error('文件夹不存在');
  }
  return { folderId: selectedFolder };
}

router.get('/', (req, res) => {
  res.redirect('/admin');
});

const realPublicDir = path.join(config.projectRoot, 'src', 'public');
const snapshotPublicDir = path.join(__dirname, '..', 'public');
const adminStaticDir = fsSync.existsSync(realPublicDir) ? realPublicDir : snapshotPublicDir;
router.use('/admin-static', express.static(adminStaticDir, {
  fallthrough: false
}));

router.get('/logo/:filename', (req, res) => {
  const filename = req.params.filename || '';
  if (!filename || filename.includes('/') || filename.includes('\\')) {
    return res.status(404).send('Logo 不存在');
  }

  const fullPath = path.join(config.logoDir, filename);
  if (!fullPath.startsWith(config.logoDir)) {
    return res.status(404).send('Logo 不存在');
  }

  res.sendFile(fullPath, (error) => {
    if (error) {
      res.status(404).send('Logo 不存在');
    }
  });
});

router.get('/nav-icon/:filename', (req, res) => {
  const filename = req.params.filename || '';
  if (!/^[a-zA-Z0-9.-]+$/.test(filename)) {
    return res.status(404).send('图标不存在');
  }
  const fullPath = path.join(config.navIconDir, filename);
  res.sendFile(fullPath, (error) => {
    if (error) res.status(404).send('图标不存在');
  });
});

router.use('/admin', requireAuth);
router.use('/admin', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  if (!req.path.startsWith('/admin-static/')) {
    res.charset = 'utf-8';
  }
  next();
});
router.use('/admin', async (req, _res, next) => {
  try {
    req.appSettings = settingsStore.getAll();
  } catch (_error) {
    req.appSettings = {};
  }
  try {
    req.dataSize = (await getDirectoryStats(config.dataDir)).sizeBytes;
  } catch (_error) {
    req.dataSize = 0;
  }
  try {
    req.diskStats = await getDiskStats(config.dataDir);
  } catch (_error) {
    req.diskStats = null;
  }
  next();
});

router.post('/admin/theme', requireCsrf, (req, res) => {
  try {
    const current = settingsStore.get('theme', 'light');
    settingsStore.set('theme', current === 'dark' ? 'light' : 'dark');
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message || '切换主题失败' });
  }
});

router.get('/admin', (req, res) => {
  try {
    const view = req.query.view || '';
    const folders = listFoldersWithCounts();
    const totalCount = countSites();
    const ungroupedCount = countUngroupedSites();

    if (view === 'files') {
      const selectedFolderId = req.query.folder || '';
      let sites;
      if (!selectedFolderId) {
        sites = listSites();
      } else if (selectedFolderId === '__ungrouped__') {
        sites = listSites({ ungrouped: true });
      } else {
        sites = listSites({ folderId: selectedFolderId });
      }

      res.send(fileManagerPage({
        folders,
        selectedFolderId,
        sites,
        totalCount,
        ungroupedCount,
        currentUser: req.currentUser,
        csrfToken: req.csrfToken,
        query: req.query,
        settings: req.appSettings,
        dataSize: req.dataSize,
        diskStats: req.diskStats,
        baseUrl: getShareBaseUrl(req)
      }));
      return;
    }

    if (view === 'sites') {
      const selectedFolder = req.query.folder || '';
      const sites = listSites(resolveSiteListOptions(selectedFolder));

      res.send(adminPage({
        sites,
        folders,
        selectedFolder,
        totalCount,
        ungroupedCount,
        query: req.query,
        baseUrl: getShareBaseUrl(req),
        currentUser: req.currentUser,
        csrfToken: req.csrfToken,
        activeNav: 'sites',
        settings: req.appSettings,
        dataSize: req.dataSize,
        diskStats: req.diskStats
      }));
      return;
    }

    // Dashboard view (default)
    const allSites = listSites();
    const recentSites = allSites.slice(0, 10);
    let chartData = { uploadTrend: [], visitRank: [], typeDistribution: [], storageTop: [] };
    try { chartData = getVisitStats(); } catch (_e) {}

    res.send(dashboardPage({
      sites: allSites,
      folders,
      totalCount,
      ungroupedCount,
      recentSites,
      chartData,
      currentUser: req.currentUser,
      csrfToken: req.csrfToken,
      baseUrl: getShareBaseUrl(req),
      settings: req.appSettings,
      dataSize: req.dataSize,
      diskStats: req.diskStats
    }));
  } catch (error) {
    res.redirect(adminRedirect({ error: error.message }));
  }
});

router.get('/admin/upload', (req, res) => {
  const folder = typeof req.query.folder === 'string' ? req.query.folder : '';
  const view = req.query.view === 'files' ? 'files' : 'sites';
  const params = { view, upload: '1' };
  if (folder) params.folder = folder;
  res.redirect(adminRedirect(params));
});

router.post('/admin/upload', (req, res) => {
  upload.fields([
    { name: 'siteFile', maxCount: 1 },
    { name: 'siteFiles', maxCount: config.zipLimits.maxEntries }
  ])(req, res, async (error) => {
    const folder = currentFolderQuery(req);
    const returnView = req.body && req.body.returnView ? req.body.returnView : '';
    if (error) {
      const message = error.code === 'LIMIT_FILE_SIZE'
        ? '上传文件超过大小限制'
        : error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE'
          ? '文件数量超过限制'
          : error.message;
      redirectWithError(res, new Error(message), folder, returnView, true);
      return;
    }

    const uploaded = [];
    if (req.files) {
      Object.values(req.files).forEach((list) => {
        if (Array.isArray(list)) uploaded.push(...list);
      });
    }

    try {
      if (!req.body?._csrf || req.body._csrf !== req.csrfToken) {
        throw new Error('表单已过期，请刷新后重试');
      }
      const folderId = validateFolderId(req.body.folderId);
      const view = req.body.returnView || '';
      const accessDays = Number(req.body.accessDays) || 365;
      const entryFile = typeof req.body.entryFile === 'string' ? req.body.entryFile : '';
      const folderFiles = req.files && Array.isArray(req.files.siteFiles) ? req.files.siteFiles : [];
      if (folderFiles.length && req.body.sitePaths) {
        let paths = [];
        try {
          paths = JSON.parse(req.body.sitePaths);
        } catch (_error) {
          throw new Error('文件夹路径无效');
        }
        if (!Array.isArray(paths) || paths.length !== folderFiles.length) {
          throw new Error('文件夹路径不完整');
        }
        folderFiles.forEach((file, index) => {
          file.relativePath = paths[index];
        });
      }
      const singleFile = req.files && Array.isArray(req.files.siteFile) ? req.files.siteFile[0] : null;
      const site = folderFiles.length
        ? await handleFolderUpload(folderFiles, {
          folderId,
          accessDays,
          entryFile,
          folderName: req.body.folderName
        })
        : await handleUploadedFile(singleFile, { folderId, accessDays, entryFile });
      res.redirect(adminRedirect({ view: view || 'sites', uploaded: site.id, folder: folderId || folder }));
    } catch (uploadError) {
      await Promise.all(uploaded.map((file) => fs.rm(file.path, { force: true })));
      redirectWithError(res, uploadError, folder, view, true);
    }
  });
});

router.post('/admin/folders', requireCsrf, (req, res) => {
  try {
    const folder = createFolder({ name: req.body.name });
    const view = currentView(req);
    res.redirect(adminRedirect({ view, folder: folder.id, folderCreated: '1' }));
  } catch (error) {
    redirectWithError(res, error);
  }
});

router.post('/admin/folders/:id/delete', requireCsrf, (req, res) => {
  try {
    deleteFolder(req.params.id);
    const view = currentView(req);
    // In files view, go back to "all" since the folder was deleted
    if (view === 'files') {
      res.redirect(adminRedirect({ view: 'files', folderDeleted: '1' }));
    } else {
      res.redirect(adminRedirect({ view, folderDeleted: '1' }));
    }
  } catch (error) {
    redirectWithError(res, error);
  }
});

router.post('/admin/folders/:id/rename', requireCsrf, (req, res) => {
  try {
    const returnFolder = req.body.returnFolder || '';
    updateFolder(req.params.id, { name: req.body.name });
    res.redirect(adminRedirect({ view: 'files', folder: returnFolder, renamed: '1' }));
  } catch (error) {
    redirectWithError(res, error, req.body.returnFolder || '', 'files');
  }
});

function selectedDownloadFolders(req) {
  const rawIds = [].concat(req.body.ids || []).map((id) => String(id));
  const ids = [...new Set(rawIds)].filter((id) => /^[a-f0-9-]{36}$/.test(id));
  if (!ids.length) throw new Error('请先选择要下载的文件');
  if (ids.length > 100) throw new Error('一次最多下载 100 个站点');

  const usedNames = new Set();
  const folders = [];
  for (const id of ids) {
    const site = getSite(id);
    if (!site) continue;
    assertInside(config.sitesDir, site.rootPath);
    const baseName = String(site.originalName || 'site')
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
      .trim()
      .slice(0, 80) || 'site';
    let folderName = `${baseName}-${site.id.slice(0, 8)}`;
    while (usedNames.has(folderName.toLowerCase())) folderName = `${folderName}-2`;
    usedNames.add(folderName.toLowerCase());
    folders.push({ name: folderName, rootDir: site.rootPath });
  }
  if (!folders.length) throw new Error('所选站点不存在或已删除');
  return folders;
}

router.post('/admin/sites/download', requireCsrf, (req, res) => {
  try {
    const folders = selectedDownloadFolders(req);
    const job = createDownloadJob({ userId: req.currentUser.id, folders });
    res.json({ jobId: job.id });
  } catch (error) {
    res.status(400).json({ error: error.message || '无法开始下载' });
  }
});

router.get('/admin/sites/download/:jobId', (req, res) => {
  const job = getDownloadJob(req.params.jobId, req.currentUser.id);
  if (!job) return res.status(404).json({ error: '下载任务不存在或已过期' });
  res.json(publicJob(job));
});

router.get('/admin/sites/download/:jobId/file', (req, res) => {
  const job = getDownloadJob(req.params.jobId, req.currentUser.id);
  if (!job || job.status !== 'ready' || !job.filePath) {
    return res.status(404).send('文件未就绪');
  }
  const filename = `sites-${new Date().toISOString().slice(0, 10)}.zip`;
  res.charset = '';
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Length', String(job.bytes));
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent('站点批量下载.zip')}`);
  fsSync.createReadStream(job.filePath).pipe(res);
});

router.post('/admin/sites/:id/move', requireCsrf, (req, res) => {
  const folder = currentFolderQuery(req);
  const view = currentView(req);
  try {
    const site = getSite(req.params.id);
    if (!site) throw new Error('站点不存在或已删除');
    const folderId = validateFolderId(req.body.folderId);
    moveSiteToFolder(site.id, folderId);
    res.redirect(adminRedirect({ view, folder: folder || folderId || 'ungrouped', moved: '1' }));
  } catch (error) {
    redirectWithError(res, error, folder, view);
  }
});

router.post('/admin/sites/:id/delete', requireCsrf, async (req, res) => {
  const folder = currentFolderQuery(req);
  const view = currentView(req);
  const site = getSite(req.params.id);
  if (!site) {
    redirectWithError(res, new Error('站点不存在或已删除'), folder, view);
    return;
  }

  try {
    assertInside(config.sitesDir, site.rootPath);
    await removeDir(site.rootPath);
    deleteSite(site.id);
    res.redirect(adminRedirect({ view, folder, deleted: '1' }));
  } catch (error) {
    redirectWithError(res, error, folder, view);
  }
});

router.post('/admin/sites/:id/access-days', requireCsrf, (req, res) => {
  const folder = currentFolderQuery(req);
  const view = currentView(req);
  try {
    const site = getSite(req.params.id);
    if (!site) throw new Error('站点不存在或已删除');
    const days = Number(req.body.accessDays);
    if (isNaN(days) || days < 0 || days > 36500) throw new Error('天数无效');
    updateAccessDays(site.id, days);
    res.redirect(adminRedirect({ view, folder, updated: '1' }));
  } catch (error) {
    redirectWithError(res, error, folder, view);
  }
});

router.get('/admin/sites/:id/tree', requireAuth, requireAdmin, async (req, res) => {
  try {
    const site = getSite(req.params.id);
    if (!site) {
      return res.status(404).json({ error: '站点不存在' });
    }
    assertInside(config.sitesDir, site.rootPath);
    const tree = await getDirectoryTree(site.rootPath);
    res.json({ tree });
  } catch (error) {
    res.status(500).json({ error: error.message || '读取目录失败' });
  }
});

router.get('/admin/chart-data', requireAuth, (req, res) => {
  try {
    const chartData = getVisitStats();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json(chartData);
  } catch (error) {
    res.status(500).json({ error: error.message || '获取图表数据失败' });
  }
});

function listChildDirs(resolved) {
  const entries = fsSync.readdirSync(resolved, { withFileTypes: true });
  return entries
    .filter((entry) => {
      if (!entry.isDirectory()) return false;
      try {
        fsSync.accessSync(path.join(resolved, entry.name), fsSync.constants.R_OK);
        return true;
      } catch (_error) {
        return false;
      }
    })
    .map((entry) => ({ name: entry.name, path: path.join(resolved, entry.name) }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 300);
}

function listWindowsDrives() {
  const drives = [];
  for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    const drivePath = `${letter}:\\`;
    if (fsSync.existsSync(drivePath)) drives.push({ name: `${letter}:`, path: drivePath });
  }
  return drives;
}

router.get('/admin/browse-dir', requireAuth, requireAdmin, async (req, res) => {
  try {
    const targetPath = (req.query.path || '').trim();
    if (!targetPath) {
      if (process.platform === 'win32') {
        return res.json({ platform: 'win32', current: '', parent: '', dirs: listWindowsDrives(), atRoots: true });
      }
      return res.json({ platform: process.platform, current: '/', parent: '', dirs: listChildDirs('/'), atRoots: false });
    }

    const resolved = path.resolve(targetPath);
    if (!fsSync.existsSync(resolved) || !fsSync.statSync(resolved).isDirectory()) {
      return res.json({ error: '路径不存在或不是目录', platform: process.platform, current: resolved, parent: '', dirs: [] });
    }

    const parent = path.dirname(resolved);
    const hasParent = parent !== resolved;
    res.json({
      platform: process.platform,
      current: resolved,
      parent: hasParent ? parent : '',
      dirs: listChildDirs(resolved),
      atRoots: false
    });
  } catch (error) {
    res.json({ error: error.message || '读取目录失败', platform: process.platform, current: '', parent: '', dirs: [] });
  }
});

router.get('/admin/settings', requireAdmin, (req, res) => {
  try {
    const settings = settingsStore.getAll();
    res.send(settingsPage({
      settings,
      query: req.query,
      currentUser: req.currentUser,
      csrfToken: req.csrfToken,
      dataSize: req.dataSize,
      diskStats: req.diskStats,
      currentDataDir: config.dataDir,
      navGroups: listNavGroups()
    }));
  } catch (error) {
    res.redirect(adminRedirect({ error: error.message }));
  }
});

router.post('/admin/settings', requireAdmin, (req, res) => {
  logoUpload.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'logoSmall', maxCount: 1 },
    { name: 'loginBg', maxCount: 1 }
  ])(req, res, async (error) => {
    const uploaded = []
      .concat((req.files && req.files.logo) || [])
      .concat((req.files && req.files.logoSmall) || [])
      .concat((req.files && req.files.loginBg) || []);

    if (error) {
      await Promise.all(uploaded.map((file) => fs.unlink(file.path).catch(() => {})));
      return res.redirect('/admin/settings?error=' + encodeURIComponent(error.message));
    }

    // CSRF check must happen AFTER multer parses the multipart body
    if (!req.body?._csrf || req.body._csrf !== req.csrfToken) {
      await Promise.all(uploaded.map((file) => fs.unlink(file.path).catch(() => {})));
      return res.redirect('/admin/settings?error=' + encodeURIComponent('表单已过期，请刷新后重试'));
    }

    try {
      const section = ['basic', 'logo', 'login', 'theme', 'register', 'share'].includes(req.body.section) ? req.body.section : 'basic';
      const back = (extra = {}) => {
        const params = new URLSearchParams({ tab: section, ...extra });
        return `/admin/settings?${params.toString()}`;
      };
      const updates = {};

      if (section === 'basic') {
        const siteName = (req.body.siteName || '').trim();
        if (!siteName) {
          await Promise.all(uploaded.map((file) => fs.unlink(file.path).catch(() => {})));
          return res.redirect(back({ error: '请填写系统名称' }));
        }
        updates.site_name = siteName.slice(0, 50);
        updates.site_subtitle = (req.body.siteSubtitle || '').trim().slice(0, 40);
      } else if (section === 'logo') {
        updates.logo_display = req.body.logoDisplay === 'large' ? 'large' : 'small';
        async function applyLogo(field, settingKey) {
          const file = req.files && req.files[field] && req.files[field][0];
          if (!file) return;
          const oldLogo = settingsStore.get(settingKey, '');
          if (oldLogo && oldLogo.startsWith('/logo/')) {
            await fs.unlink(path.join(config.logoDir, path.basename(oldLogo))).catch(() => {});
          }
          updates[settingKey] = `/logo/${file.filename}`;
        }
        await applyLogo('logo', 'logo_url');
        await applyLogo('logoSmall', 'logo_small_url');
      } else if (section === 'login') {
        const file = req.files && req.files.loginBg && req.files.loginBg[0];
        const current = settingsStore.get('login_bg_url', '');
        if (req.body.removeLoginBg === '1' && !file) {
          if (current.startsWith('/logo/')) {
            await fs.unlink(path.join(config.logoDir, path.basename(current))).catch(() => {});
          }
          updates.login_bg_url = '';
        }
        if (file) {
          if (current.startsWith('/logo/')) {
            await fs.unlink(path.join(config.logoDir, path.basename(current))).catch(() => {});
          }
          updates.login_bg_url = `/logo/${file.filename}`;
        }
      } else if (section === 'register') {
        updates.allow_register = req.body.allowRegister === '1' ? '1' : '0';
      } else if (section === 'share') {
        updates.public_base_url = normalizeShareBase(req.body.publicBaseUrl);
      } else {
        updates.theme = req.body.theme === 'dark' ? 'dark' : 'light';
      }

      settingsStore.setMany(updates);
      return res.redirect(back({ updated: '1' }));
    } catch (saveError) {
      await Promise.all(uploaded.map((file) => fs.unlink(file.path).catch(() => {})));
      return res.redirect('/admin/settings?error=' + encodeURIComponent(saveError.message));
    }
  });
});

router.post('/admin/settings/data-dir', requireAdmin, requireCsrf, (req, res) => {
  try {
    const newPath = (req.body.dataDir || '').trim();
    const { writeConfig, getProjectRoot } = require('../services/configFile');

    if (newPath) {
      const resolved = path.resolve(newPath);
      const parentDir = path.dirname(resolved);
      if (!fsSync.existsSync(parentDir)) {
        throw new Error('父目录不存在: ' + parentDir);
      }
      writeConfig(getProjectRoot(), { data_dir: resolved });
    } else {
      const cfg = { ...require('../services/configFile').readConfig(getProjectRoot()) };
      delete cfg.data_dir;
      writeConfig(getProjectRoot(), cfg);
    }

    return res.redirect('/admin/settings?configSaved=1&tab=storage');
  } catch (error) {
    return res.redirect('/admin/settings?tab=storage&error=' + encodeURIComponent(error.message));
  }
});

router.post('/admin/users', requireAdmin, requireCsrf, async (req, res) => {
  try {
    if (req.body.password !== req.body.confirmPassword) {
      throw new Error('两次输入的密码不一致');
    }
    await createUserByAdmin({
      username: req.body.username,
      password: req.body.password,
      role: req.body.role,
      adminId: req.currentUser.id
    });
    res.redirect('/admin/users?created=1');
  } catch (error) {
    res.redirect(`/admin/users?error=${encodeURIComponent(error.message)}`);
  }
});

router.get('/admin/users', requireAdmin, (req, res) => {
  res.send(usersPage({
    users: listUsers(),
    query: req.query,
    currentUser: req.currentUser,
    csrfToken: req.csrfToken,
    settings: req.appSettings,
    dataSize: req.dataSize,
    diskStats: req.diskStats
  }));
});

router.post('/admin/users/:id/approve', requireAdmin, requireCsrf, (req, res) => {
  try {
    approveUser(req.params.id, req.currentUser.id);
    res.redirect('/admin/users?updated=1');
  } catch (error) {
    res.redirect(`/admin/users?error=${encodeURIComponent(error.message)}`);
  }
});

router.post('/admin/users/:id/reject', requireAdmin, requireCsrf, (req, res) => {
  try {
    rejectUser(req.params.id, req.currentUser.id);
    res.redirect('/admin/users?updated=1');
  } catch (error) {
    res.redirect(`/admin/users?error=${encodeURIComponent(error.message)}`);
  }
});

router.post('/admin/users/:id/disable', requireAdmin, requireCsrf, (req, res) => {
  try {
    disableUser(req.params.id, req.currentUser.id);
    res.redirect('/admin/users?updated=1');
  } catch (error) {
    res.redirect(`/admin/users?error=${encodeURIComponent(error.message)}`);
  }
});

/* ========== Navigation ========== */

router.get('/admin/nav', async (req, res) => {
  try {
    await fillMissingIcons();
    const links = listAllNavLinks();
    res.send(navPage({
      links,
      query: req.query,
      currentUser: req.currentUser,
      csrfToken: req.csrfToken,
      settings: req.appSettings,
      dataSize: req.dataSize,
      diskStats: req.diskStats
    }));
  } catch (error) {
    res.redirect(`/admin/nav?error=${encodeURIComponent(error.message)}`);
  }
});

router.post('/admin/nav/groups', requireAdmin, requireCsrf, (req, res) => {
  try {
    createNavGroup({ name: req.body.name });
    res.redirect('/admin/settings?navSaved=1&tab=nav');
  } catch (error) {
    res.redirect(`/admin/settings?tab=nav&error=${encodeURIComponent(error.message)}`);
  }
});

router.post('/admin/nav/groups/:id/rename', requireAdmin, requireCsrf, (req, res) => {
  try {
    updateNavGroup(req.params.id, { name: req.body.name });
    res.redirect('/admin/settings?navSaved=1&tab=nav');
  } catch (error) {
    res.redirect(`/admin/settings?tab=nav&error=${encodeURIComponent(error.message)}`);
  }
});

router.post('/admin/nav/groups/:id/delete', requireAdmin, requireCsrf, (req, res) => {
  try {
    deleteNavGroup(req.params.id);
    res.redirect('/admin/settings?navDeleted=1&tab=nav');
  } catch (error) {
    res.redirect(`/admin/settings?tab=nav&error=${encodeURIComponent(error.message)}`);
  }
});

router.post('/admin/nav/groups/reorder', requireCsrf, (req, res) => {
  try {
    const order = String(req.body.order || '').split(',').filter(Boolean);
    reorderNavGroups(order);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message || '排序失败' });
  }
});

function removeNavIcon(icon) {
  if (!icon || !icon.startsWith('/nav-icon/')) return;
  const filename = path.basename(icon);
  return fs.unlink(path.join(config.navIconDir, filename)).catch(() => {});
}

function chooseNavIcon(req) {
  const text = String(req.body.iconText || '').trim();
  if (req.file) return `/nav-icon/${req.file.filename}`;
  if (text) return text;
  if (req.body.resetIcon === '1' || req.body.keepIcon !== '1') return '';
  return undefined;
}

function saveNavLink(req, res, isUpdate) {
  navIconUpload.single('iconFile')(req, res, async (error) => {
    if (error) {
      return res.redirect(`/admin/nav?error=${encodeURIComponent(error.message)}`);
    }
    if (!req.body?._csrf || req.body._csrf !== req.csrfToken) {
      await removeNavIcon(req.file ? `/nav-icon/${req.file.filename}` : '');
      return res.redirect('/admin/nav?error=' + encodeURIComponent('表单已过期，请刷新后重试'));
    }

    try {
      const icon = chooseNavIcon(req);
      if (isUpdate) {
        const result = await updateNavLink(req.params.id, {
          name: req.body.name,
          url: req.body.url,
          icon
        });
        if (result.previousIcon !== result.icon) await removeNavIcon(result.previousIcon);
      } else {
        await createNavLink({
          name: req.body.name,
          url: req.body.url,
          icon
        });
      }
      res.redirect('/admin/nav?saved=1');
    } catch (saveError) {
      await removeNavIcon(req.file ? `/nav-icon/${req.file.filename}` : '');
      res.redirect(`/admin/nav?error=${encodeURIComponent(saveError.message)}`);
    }
  });
}

router.post('/admin/nav/links', (req, res) => {
  saveNavLink(req, res, false);
});

router.post('/admin/nav/links/:id/update', (req, res) => {
  saveNavLink(req, res, true);
});

router.post('/admin/nav/links/:id/delete', requireCsrf, async (req, res) => {
  try {
    const link = deleteNavLink(req.params.id);
    await removeNavIcon(link && link.icon);
    res.redirect('/admin/nav?deleted=1');
  } catch (error) {
    res.redirect(`/admin/nav?error=${encodeURIComponent(error.message)}`);
  }
});

router.post('/admin/nav/links/reorder', requireCsrf, (req, res) => {
  try {
    const order = String(req.body.order || '').split(',').filter(Boolean);
    reorderNavLinks(order);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message || '排序失败' });
  }
});

/* ─── 门户管理 ─── */

router.get('/admin/portals', requireAdmin, (req, res) => {
  res.send(portalAdminPage({
    portals: portalStore.listPortals(),
    sites: listSites(),
    selectedPortal: null,
    query: req.query,
    currentUser: req.currentUser,
    csrfToken: req.csrfToken,
    settings: req.appSettings,
    dataSize: req.dataSize,
    diskStats: req.diskStats
  }));
});

router.get('/admin/portals/:id', requireAdmin, (req, res) => {
  const portal = portalStore.getPortal(req.params.id);
  if (!portal) return res.redirect('/admin/portals');
  res.send(portalAdminPage({
    portals: portalStore.listPortals(),
    sites: listSites(),
    selectedPortal: portal,
    pages: portalStore.listPages(portal.id),
    query: req.query,
    currentUser: req.currentUser,
    csrfToken: req.csrfToken,
    settings: req.appSettings,
    dataSize: req.dataSize,
    diskStats: req.diskStats
  }));
});

router.post('/admin/portals', requireAdmin, requireCsrf, (req, res) => {
  try {
    const slug = portalStore.validateSlug((req.body.slug || '').trim());
    const name = (req.body.name || '').trim();
    if (!name) throw new Error('请填写门户名称');
    const created = portalStore.createPortal({
      slug,
      name: name.slice(0, 50),
      description: (req.body.description || '').trim().slice(0, 200),
      theme: normalizePortalAccent(req.body.theme),
      layout: req.body.layout === 'sidebar' ? 'sidebar' : 'topbar',
      loginRequired: req.body.loginRequired === 'on',
      loginMessage: (req.body.loginMessage || '').trim().slice(0, 200)
    });
    res.redirect(`/admin/portals/${created.id}?created=1`);
  } catch (error) {
    res.redirect(`/admin/portals?create=1&error=${encodeURIComponent(error.message)}`);
  }
});

function unlinkOwnedLogo(logoUrl) {
  if (!logoUrl || !String(logoUrl).startsWith('/logo/')) return Promise.resolve();
  const settings = settingsStore.getAll();
  if (logoUrl === settings.logo_url || logoUrl === settings.logo_small_url) return Promise.resolve();
  return fs.unlink(path.join(config.logoDir, path.basename(logoUrl))).catch(() => {});
}

router.post('/admin/portals/:id', requireAdmin, (req, res) => {
  portalLogoUpload.single('logo')(req, res, async (error) => {
    const fail = async (message) => {
      if (req.file) await fs.unlink(req.file.path).catch(() => {});
      return res.redirect(`/admin/portals/${req.params.id}?settings=1&error=${encodeURIComponent(message)}`);
    };

    if (error) {
      const message = error.code === 'LIMIT_FILE_SIZE' ? 'Logo 不能超过 2MB' : (error.message || 'Logo 上传失败');
      return fail(message);
    }
    if (!req.body?._csrf || req.body._csrf !== req.csrfToken) {
      return fail('表单已过期，请刷新后重试');
    }

    try {
      const portal = portalStore.getPortal(req.params.id);
      if (!portal) throw new Error('门户不存在');
      if (req.body.slug && req.body.slug !== portal.slug) {
        portalStore.validateSlug(req.body.slug);
      }
      let logoUrl = portal.logoUrl || '';
      if (req.body.removeLogo === 'on' || req.file) {
        await unlinkOwnedLogo(logoUrl);
        logoUrl = '';
      }
      if (req.file) logoUrl = `/logo/${req.file.filename}`;
      const loginRequired = req.body.loginRequired === 'on';
      portalStore.updatePortal(req.params.id, {
        slug: (req.body.slug || '').trim(),
        name: (req.body.name || '').trim().slice(0, 50),
        description: (req.body.description || '').trim().slice(0, 200),
        logo_url: logoUrl,
        theme: normalizePortalAccent(req.body.theme),
        layout: req.body.layout === 'sidebar' ? 'sidebar' : 'topbar',
        login_required: loginRequired ? 1 : 0,
        login_message: loginRequired ? (req.body.loginMessage || '').trim().slice(0, 200) : '',
        status: req.body.status === 'disabled' ? 'disabled' : 'active'
      });
      res.redirect(`/admin/portals/${req.params.id}?updated=1`);
    } catch (saveError) {
      return fail(saveError.message);
    }
  });
});

router.post('/admin/portals/:id/delete', requireAdmin, requireCsrf, async (req, res) => {
  try {
    const portal = portalStore.getPortal(req.params.id);
    if (portal) await unlinkOwnedLogo(portal.logoUrl);
    portalStore.deletePortal(req.params.id);
    res.redirect('/admin/portals?deleted=1');
  } catch (error) {
    res.redirect(`/admin/portals?error=${encodeURIComponent(error.message)}`);
  }
});

function normalizePortalAccent(value) {
  const accents = ['jingtai', 'lotus', 'vivid', 'newyear', 'soe', 'ink', 'fashion', 'china', 'youth'];
  const legacy = {
    blue: 'jingtai', light: 'jingtai', white: 'jingtai',
    red: 'vivid', orange: 'vivid',
    green: 'lotus',
    cyan: 'fashion', purple: 'fashion',
    dark: 'ink'
  };
  const mapped = legacy[value] || value;
  return accents.includes(mapped) ? mapped : 'jingtai';
}

function readPortalLink(body) {
  const linkType = body.linkType === 'url' ? 'url' : 'site';
  if (linkType === 'url') {
    return {
      linkType,
      siteId: null,
      externalUrl: portalStore.validateExternalUrl(body.externalUrl),
      openMode: body.openMode === 'blank' ? 'blank' : 'embed'
    };
  }
  const siteId = (body.siteId || '').trim();
  if (!siteId || !getSite(siteId)) throw new Error('请选择关联的站点');
  return { linkType, siteId, externalUrl: '', openMode: 'embed' };
}

router.post('/admin/portals/:id/pages', requireAdmin, requireCsrf, (req, res) => {
  try {
    const portal = portalStore.getPortal(req.params.id);
    if (!portal) throw new Error('门户不存在');
    const title = (req.body.title || '').trim();
    if (!title) throw new Error('请填写页面名称');
    const link = readPortalLink(req.body);
    const routePath = portalStore.resolveRoutePath(portal.id, req.body.routePath, { title });
    const isDefault = req.body.isDefault === 'on';
    const asRoot = req.body.asRoot === '1';
    const parentId = asRoot ? null : ((req.body.parentId || '').trim() || null);
    if (parentId) {
      const parent = portalStore.getPage(parentId);
      if (!parent || parent.portalId !== portal.id) throw new Error('上级导航不存在');
    }
    const page = portalStore.createPage({
      portalId: portal.id,
      parentId,
      siteId: link.siteId,
      routePath,
      title: title.slice(0, 60),
      icon: (req.body.icon || '').trim().slice(0, 30),
      isDefault,
      sortOrder: Number(req.body.sortOrder || 0),
      visible: req.body.visible === 'on',
      linkType: link.linkType,
      externalUrl: link.externalUrl,
      openMode: link.openMode
    });
    res.redirect(`/admin/portals/${req.params.id}?pageAdded=1`);
  } catch (error) {
    const back = new URLSearchParams({ add: '1', error: error.message });
    if (req.body.asRoot === '1') back.set('asRoot', '1');
    else if ((req.body.parentId || '').trim()) back.set('parent', (req.body.parentId || '').trim());
    res.redirect(`/admin/portals/${req.params.id}?${back}`);
  }
});

router.post('/admin/portals/:id/pages/:pageId', requireAdmin, requireCsrf, (req, res) => {
  try {
    const page = portalStore.getPage(req.params.pageId);
    if (!page) throw new Error('页面不存在');
    const link = readPortalLink(req.body);
    const parentId = (req.body.parentId || '').trim() || null;
    if (parentId) {
      const pages = portalStore.listPages(req.params.id);
      const byId = new Map(pages.map((item) => [item.id, item]));
      if (!byId.has(parentId)) throw new Error('上级导航不存在');
      let cursor = parentId;
      const seen = new Set();
      while (cursor) {
        if (cursor === page.id || seen.has(cursor)) throw new Error('上级导航不能选自己或子导航');
        seen.add(cursor);
        cursor = byId.get(cursor) ? byId.get(cursor).parentId : null;
      }
    }
    const updates = {
      parent_id: parentId,
      site_id: link.siteId,
      route_path: portalStore.resolveRoutePath(req.params.id, req.body.routePath, {
        title: req.body.title,
        excludePageId: page.id
      }),
      title: (req.body.title || '').trim().slice(0, 60),
      icon: (req.body.icon || '').trim().slice(0, 30),
      is_default: req.body.isDefault === 'on' ? 1 : 0,
      sort_order: Number(req.body.sortOrder || 0),
      visible: req.body.visible === 'on' ? 1 : 0,
      link_type: link.linkType,
      external_url: link.externalUrl,
      open_mode: link.openMode
    };
    portalStore.updatePage(req.params.pageId, updates);
    res.redirect(`/admin/portals/${req.params.id}?pageUpdated=1`);
  } catch (error) {
    res.redirect(`/admin/portals/${req.params.id}?page=${req.params.pageId}&error=${encodeURIComponent(error.message)}`);
  }
});

router.post('/admin/portals/:id/pages/:pageId/delete', requireAdmin, requireCsrf, (req, res) => {
  try {
    portalStore.deletePage(req.params.pageId);
    res.redirect(`/admin/portals/${req.params.id}?pageDeleted=1`);
  } catch (error) {
    res.redirect(`/admin/portals/${req.params.id}?error=${encodeURIComponent(error.message)}`);
  }
});

router.post('/admin/portals/:id/pages/reorder', requireAdmin, requireCsrf, (req, res) => {
  try {
    const order = String(req.body.order || '').split(',').filter(Boolean);
    portalStore.reorderPages(req.params.id, order);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
