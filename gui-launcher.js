const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

// When running as a GUI subsystem app (no console), silence log calls
// to avoid EBADF or ENOTTY errors on stdout/stderr.
const noop = () => {};
try { process.stdout.write(''); } catch (_e) { console.log = noop; console.warn = noop; console.error = noop; }
try { process.stderr.write(''); } catch (_e) { console.warn = noop; console.error = noop; }

// Prevent silent crashes in GUI mode
process.on('uncaughtException', (err) => { try { console.error(err); } catch (_e) {} });
process.on('unhandledRejection', (err) => { try { console.error(err); } catch (_e) {} });

const projectRoot = path.resolve(path.dirname(process.execPath));
const runtimeRoot = path.dirname(process.execPath);
const settingsPath = path.join(runtimeRoot, 'launcher-settings.json');
const serverCommand = path.join(runtimeRoot, 'static-html-host-server.exe');
const serverEntry = path.join(runtimeRoot, 'server-entry.js');

let serverProcess = null;
let latestSettings = loadSettings();

function getDataDir() {
  let dataDir = path.join(projectRoot, 'data');
  try {
    const cfgPath = path.join(projectRoot, 'config.json');
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
      if (cfg.data_dir) dataDir = path.resolve(cfg.data_dir);
    }
  } catch (_e) {}
  return dataDir;
}
let serverRunning = false;
let latestMessage = '';

function loadSettings() {
  const defaults = {
    host: '127.0.0.1',
    port: 3000,
    autoStart: true
  };

  try {
    if (fs.existsSync(settingsPath)) {
      const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      return {
        host: typeof saved.host === 'string' && saved.host ? saved.host : defaults.host,
        port: Number.isFinite(Number(saved.port)) ? Number(saved.port) : defaults.port,
        autoStart: saved.autoStart !== false
      };
    }
  } catch (error) {
    console.warn('读取设置失败，将使用默认设置：', error.message);
  }

  return defaults;
}

function saveSettings(settings) {
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
}

function buildAdminUrl(settings) {
  return `http://${settings.host}:${settings.port}/admin`;
}

function stopServer() {
  if (serverProcess) {
    try {
      serverProcess.kill();
    } catch (_ignored) {
      // 进程可能已退出
    }
    serverProcess = null;
  }
  serverRunning = false;
}

function startServer(settings) {
  stopServer();

  let dataDir = path.join(projectRoot, 'data');
  try {
    const cfgPath = path.join(projectRoot, 'config.json');
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
      if (cfg.data_dir) dataDir = path.resolve(cfg.data_dir);
    }
  } catch (_e) {}

  const env = {
    ...process.env,
    HOST: settings.host,
    PORT: String(settings.port),
    STATIC_HTML_HOST_PROJECT_ROOT: projectRoot,
    STATIC_HTML_HOST_DATA_DIR: dataDir
  };

  serverProcess = spawn(serverCommand, [], {
    cwd: runtimeRoot,
    env,
    stdio: 'ignore'
  });

  serverRunning = true;

  serverProcess.on('exit', () => {
    serverProcess = null;
    serverRunning = false;
  });
}

function waitForHttp(url, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const check = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve(true);
      });
      req.on('error', () => {
        if (Date.now() - startedAt >= timeoutMs) {
          resolve(false);
        } else {
          setTimeout(check, 200);
        }
      });
      req.setTimeout(800, () => {
        req.destroy();
        if (Date.now() - startedAt >= timeoutMs) {
          resolve(false);
        } else {
          setTimeout(check, 200);
        }
      });
    };
    check();
  });
}

function openBrowser(url) {
  const command = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  spawn(command, [url], { shell: true, stdio: 'ignore', detached: true }).unref();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildPage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>静态网页托管系统</title>
  <style>
    body { font-family: "Microsoft YaHei UI", "PingFang SC", "Segoe UI", sans-serif; background: #f5f7fa; color: #262626; margin: 0; padding: 24px; }
    .card { max-width: 720px; margin: 0 auto; background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); padding: 24px; }
    h1 { margin: 0 0 8px; font-size: 22px; }
    p { margin: 0 0 16px; color: #595959; }
    .row { display: flex; gap: 12px; margin-bottom: 12px; }
    .row label { width: 90px; line-height: 36px; color: #595959; }
    input { flex: 1; height: 36px; padding: 0 10px; border: 1px solid #d9d9d9; border-radius: 6px; font-size: 14px; }
    input:focus { outline: none; border-color: #1890ff; box-shadow: 0 0 0 2px rgba(24,144,255,0.15); }
    .actions { display: flex; gap: 12px; margin-top: 8px; }
    button { height: 36px; padding: 0 16px; border: 1px solid #1890ff; background: #1890ff; color: #fff; border-radius: 6px; cursor: pointer; font-size: 14px; }
    button.secondary { background: #fff; color: #1890ff; }
    button:hover { background: #40a9ff; border-color: #40a9ff; }
    button.secondary:hover { background: #e6f7ff; }
    .status { margin-top: 16px; padding: 16px; background: #fafafa; border-radius: 8px; border: 1px solid #f0f0f0; }
    .status div { margin-bottom: 8px; }
    .status div:last-child { margin-bottom: 0; }
    a { color: #1890ff; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .message { margin-top: 12px; color: #52c41a; min-height: 20px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>静态网页托管系统</h1>
    <p>通过本页面启动本地服务、打开管理后台，并修改监听端口。</p>

    <form method="post" action="/save">
      <div class="row">
        <label for="host">监听地址</label>
        <input id="host" name="host" value="${escapeHtml(latestSettings.host)}">
      </div>
      <div class="row">
        <label for="port">监听端口</label>
        <input id="port" name="port" type="number" min="1" max="65535" value="${escapeHtml(latestSettings.port)}">
      </div>
      <div class="actions">
        <button type="submit" name="action" value="save">保存设置</button>
        <button type="submit" name="action" value="start">保存并启动服务</button>
        <button type="submit" name="action" value="stop" class="secondary">停止服务</button>
        <a href="/open" style="line-height:36px;">打开管理页面</a>
      </div>
    </form>

    <div class="status">
      <div><strong>服务状态：</strong>${serverRunning ? '运行中' : '未运行'}</div>
      <div><strong>管理页面：</strong>${serverRunning ? `<a href="${escapeHtml(buildAdminUrl(latestSettings))}" target="_blank">${escapeHtml(buildAdminUrl(latestSettings))}</a>` : '-'}</div>
      <div><strong>数据目录：</strong>${escapeHtml(getDataDir())}</div>
      <div><strong>当前主机：</strong>${escapeHtml(os.hostname())}</div>
    </div>

    <div class="message">${escapeHtml(latestMessage)}</div>
  </div>
</body>
</html>`;
}

function readPostBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

async function handleRequest(req, res) {
  try {
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(buildPage());
      return;
    }

    if (req.method === 'GET' && req.url === '/open') {
      if (serverRunning) {
        openBrowser(buildAdminUrl(latestSettings));
        latestMessage = '已打开管理页面。';
      } else {
        latestMessage = '服务尚未启动，请先启动服务。';
      }
      res.writeHead(302, { Location: '/' });
      res.end();
      return;
    }

    if (req.method === 'POST' && req.url === '/save') {
      const body = await readPostBody(req);
      const params = new URLSearchParams(body);
      const host = (params.get('host') || '').trim();
      const port = Number(params.get('port'));
      const action = params.get('action');

      if (!host) {
        latestMessage = '请输入有效的监听地址。';
        res.writeHead(302, { Location: '/' });
        res.end();
        return;
      }

      if (!Number.isFinite(port) || port < 1 || port > 65535) {
        latestMessage = '端口必须是 1 到 65535 之间的整数。';
        res.writeHead(302, { Location: '/' });
        res.end();
        return;
      }

      latestSettings.host = host;
      latestSettings.port = port;
      saveSettings(latestSettings);

      if (action === 'stop') {
        stopServer();
        latestMessage = '已停止服务。';
      } else if (action === 'start') {
        startServer(latestSettings);
        const ready = await waitForHttp(`http://${latestSettings.host}:${latestSettings.port}/login`);
        if (ready) {
          const adminUrl = buildAdminUrl(latestSettings);
          openBrowser(adminUrl);
          latestMessage = `服务已启动：${adminUrl}`;
        } else {
          latestMessage = '服务启动超时，请检查端口是否被占用。';
        }
      } else {
        latestMessage = '设置已保存。';
      }

      res.writeHead(302, { Location: '/' });
      res.end();
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('页面不存在');
  } catch (error) {
    console.error('启动器界面请求失败：', error);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('启动器界面请求失败');
  }
}

function startControlPanel() {
  const controlServer = http.createServer((req, res) => {
    handleRequest(req, res).catch((error) => {
      console.error('处理请求失败：', error);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      }
      res.end('服务器错误');
    });
  });

  controlServer.listen(0, '127.0.0.1', () => {
    const address = controlServer.address();
    const controlUrl = `http://127.0.0.1:${address.port}`;
    console.log(`启动器控制面板：${controlUrl}`);
    openBrowser(controlUrl);
  });
}

function main() {
  saveSettings(latestSettings);
  console.log('静态网页托管系统启动器（浏览器控制面板模式）');
  console.log(`数据目录：${getDataDir()}`);

  if (latestSettings.autoStart) {
    startServer(latestSettings);
    waitForHttp(`http://${latestSettings.host}:${latestSettings.port}/login`).then((ready) => {
      if (ready) {
        const adminUrl = buildAdminUrl(latestSettings);
        latestMessage = `服务已自动启动：${adminUrl}`;
        console.log(latestMessage);
        openBrowser(adminUrl);
      } else {
        latestMessage = '自动启动服务超时，请通过控制面板重试。';
        console.warn(latestMessage);
      }
      startControlPanel();
    });
  } else {
    latestMessage = '已关闭自动启动，请通过控制面板启动服务。';
    console.log(latestMessage);
    startControlPanel();
  }
}

main();
