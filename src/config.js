const path = require('path');
const fs = require('fs');

const projectRoot = process.env.STATIC_HTML_HOST_PROJECT_ROOT
  ? path.resolve(process.env.STATIC_HTML_HOST_PROJECT_ROOT)
  : path.resolve(__dirname, '..');

// Check config.json for data_dir override
let dataDir;
try {
  const configPath = path.join(projectRoot, 'config.json');
  if (fs.existsSync(configPath)) {
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (cfg.data_dir) {
      dataDir = path.resolve(cfg.data_dir);
    }
  }
} catch (_err) {
  // Ignore config read errors
}

// Priority: env var > config.json > default
if (!dataDir) {
  dataDir = process.env.STATIC_HTML_HOST_DATA_DIR
    ? path.resolve(process.env.STATIC_HTML_HOST_DATA_DIR)
    : path.join(projectRoot, 'data');
}

module.exports = {
  projectRoot,
  host: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT || 3000),
  dataDir,
  dbPath: path.join(dataDir, 'app.db'),
  uploadsDir: path.join(dataDir, 'uploads'),
  sitesDir: path.join(dataDir, 'sites'),
  logoDir: path.join(dataDir, 'logo'),
  navIconDir: path.join(dataDir, 'nav-icons'),
  maxUploadBytes: 50 * 1024 * 1024,
  zipLimits: {
    maxEntries: 1000,
    maxExtractedBytes: 200 * 1024 * 1024,
    maxSingleFileBytes: 25 * 1024 * 1024,
    maxPathLength: 240,
    maxDirectoryDepth: 20
  }
};
