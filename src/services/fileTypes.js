const path = require('path');

const ASSET_TYPES = {
  png: { label: 'PNG', preview: 'image', icon: 'png.svg' },
  jpg: { label: 'JPG', preview: 'image', icon: 'jpg.svg' },
  gif: { label: 'GIF', preview: 'image', icon: 'gif.svg' },
  webp: { label: 'WEBP', preview: 'image', icon: 'webp.svg' },
  ico: { label: 'ICO', preview: 'image', icon: 'ico.svg' },
  bmp: { label: 'BMP', preview: 'image', icon: 'bmp.svg' },
  svg: { label: 'SVG', preview: 'image', icon: 'svg.svg' },
  pdf: { label: 'PDF', preview: 'pdf', icon: 'pdf.svg' }
};

const EXTRA_ICONS = {
  html: 'html.svg',
  zip: 'zip.svg',
  mhtml: 'mhtml.svg',
  css: 'css.svg',
  js: 'js.svg',
  json: 'json.svg',
  txt: 'txt.svg'
};

const EXT_KIND = {
  '.html': 'html',
  '.htm': 'html',
  '.zip': 'zip',
  '.mhtml': 'mhtml',
  '.mht': 'mhtml',
  '.png': 'png',
  '.jpg': 'jpg',
  '.jpeg': 'jpg',
  '.gif': 'gif',
  '.webp': 'webp',
  '.ico': 'ico',
  '.bmp': 'bmp',
  '.svg': 'svg',
  '.pdf': 'pdf'
};

const SITE_KINDS = ['html', 'zip', 'mhtml', 'folder', ...Object.keys(ASSET_TYPES)];

function kindFromFilename(filename) {
  const ext = path.extname(filename || '').toLowerCase();
  return EXT_KIND[ext] || '';
}

function isAssetKind(kind) {
  return Object.prototype.hasOwnProperty.call(ASSET_TYPES, kind);
}

function previewMode(kind) {
  return ASSET_TYPES[kind] ? ASSET_TYPES[kind].preview : '';
}

function typeLabel(kind) {
  if (kind === 'zip') return 'ZIP';
  if (kind === 'mhtml') return 'MHTML';
  if (kind === 'folder') return '文件夹';
  if (ASSET_TYPES[kind]) return ASSET_TYPES[kind].label;
  return 'HTML';
}

function typeLabelLong(kind) {
  if (kind === 'zip') return 'ZIP 压缩包';
  if (kind === 'mhtml') return 'MHTML 网页';
  if (kind === 'folder') return '文件夹';
  if (ASSET_TYPES[kind]) return `${ASSET_TYPES[kind].label} 文件`;
  return 'HTML 页面';
}

function iconFile(kind) {
  if (ASSET_TYPES[kind]) return ASSET_TYPES[kind].icon;
  return EXTRA_ICONS[kind] || '';
}

function iconClass(kind) {
  if (kind === 'zip') return 'zip';
  if (kind === 'folder') return 'folder';
  if (iconFile(kind)) return 'asset';
  return 'html';
}

function siteKindCheck() {
  return SITE_KINDS.map((kind) => `'${kind}'`).join(', ');
}

module.exports = {
  ASSET_TYPES,
  SITE_KINDS,
  kindFromFilename,
  isAssetKind,
  previewMode,
  typeLabel,
  typeLabelLong,
  iconFile,
  iconClass,
  siteKindCheck
};
