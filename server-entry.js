const path = require('path');

// When packaged with pkg, __dirname is a read-only snapshot path.
// Use the directory containing the actual executable as the real root.
const exeDir = path.dirname(process.execPath);

process.env.STATIC_HTML_HOST_PROJECT_ROOT = process.env.STATIC_HTML_HOST_PROJECT_ROOT || exeDir;
process.env.STATIC_HTML_HOST_DATA_DIR = process.env.STATIC_HTML_HOST_DATA_DIR || path.join(exeDir, 'data');
process.env.HOST = process.env.HOST || '127.0.0.1';
process.env.PORT = process.env.PORT || '3000';

require('./src/server.js');
