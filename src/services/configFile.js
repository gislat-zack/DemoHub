const fs = require('fs');
const path = require('path');

let cached = null;

function getProjectRoot() {
  return process.env.STATIC_HTML_HOST_PROJECT_ROOT
    ? path.resolve(process.env.STATIC_HTML_HOST_PROJECT_ROOT)
    : path.resolve(__dirname, '..', '..');
}

function getConfigPath(projectRoot) {
  return path.join(projectRoot, 'config.json');
}

function readConfig(projectRoot) {
  const filePath = getConfigPath(projectRoot);
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      cached = JSON.parse(raw);
      return cached;
    }
  } catch (err) {
    console.warn('读取 config.json 失败，将使用默认配置：', err.message);
  }
  cached = {};
  return cached;
}

function writeConfig(projectRoot, updates) {
  const filePath = getConfigPath(projectRoot);
  const current = cached || readConfig(projectRoot);
  const merged = { ...current, ...updates };
  fs.writeFileSync(filePath, JSON.stringify(merged, null, 2), 'utf-8');
  cached = merged;
  return merged;
}

module.exports = { readConfig, writeConfig, getProjectRoot };
