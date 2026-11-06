const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function run(command, args) {
  execFileSync(command, args, { cwd: root, stdio: 'inherit', shell: true });
}

function stopRelatedNodeProcesses() {
  try {
    const stdout = execFileSync('wmic', [
      'process',
      'where',
      "name='node.exe'",
      'get',
      'processid,commandline',
      '/format:csv'
    ], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'], shell: true, timeout: 5000 });

    const lines = String(stdout || '').split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      if (line.includes('static-html-host')) {
        const parts = line.split(',');
        const pid = parts[parts.length - 1].trim();
        if (/^\d+$/.test(pid)) {
          try {
            execFileSync('taskkill', ['/PID', pid, '/F', '/T'], { cwd: root, stdio: 'ignore', shell: true, timeout: 5000 });
          } catch (_ignored) {
            // 进程可能已退出
          }
        }
      }
    }
  } catch (_ignored) {
    // 无法枚举进程时忽略，继续尝试后续打包流程
  }
}

function ensurePkgBinary(entryScript, outputPath) {
  if (fs.existsSync(outputPath)) {
    return outputPath;
  }

  console.log('正在构建可执行程序：', path.basename(outputPath));
  run('npx', ['pkg', entryScript, '--target', 'node18-win-x64', '--output', `"${outputPath}"`]);
  return outputPath;
}

console.log('正在停止可能占用文件的旧进程...');
stopRelatedNodeProcesses();

const nativeBuildDir = path.join(root, 'node_modules', 'better-sqlite3', 'build', 'Release');
try {
  if (fs.existsSync(nativeBuildDir)) {
    // Only clean .node files to avoid stale builds; keep the directory
    for (const file of fs.readdirSync(nativeBuildDir)) {
      if (file.endsWith('.node')) {
        fs.rmSync(path.join(nativeBuildDir, file), { force: true });
      }
    }
  }
} catch (_ignored) {
  // 无法清理旧产物时继续尝试后续流程
}

console.log('正在安装打包依赖（首次构建会自动安装）...');
run('npm', ['install']);

console.log('正在为 Node 18 重新编译原生模块（pkg 目标版本）...');
try {
  run('npx', ['node-gyp', 'rebuild', '--target=18.5.0', '--arch=x64',
    '--dist-url=https://nodejs.org/dist',
    '--directory=node_modules/better-sqlite3']);
} catch (_ignored) {
  console.warn('原生模块编译失败，将尝试使用当前版本的绑定');
}

const distDir = path.join(root, 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

const serverBinary = ensurePkgBinary('server-entry.js', path.join(distDir, 'static-html-host-server.exe'));
console.log('后端服务程序：', serverBinary);

const launcherBinary = ensurePkgBinary('gui-launcher.js', path.join(distDir, 'Static HTML Host.exe'));
console.log('图形化启动程序：', launcherBinary);

console.log('正在转换为 Windows GUI 子系统（隐藏控制台窗口）...');
run('node', [path.join(__dirname, 'set-gui-subsystem.js'), `"${launcherBinary}"`]);

const outputPath = path.join(root, 'dist', 'Static HTML Host.exe');
console.log('打包完成，可执行文件：');
console.log(outputPath);
