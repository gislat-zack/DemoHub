const fs = require('fs/promises');
const path = require('path');
const { ensureDir, assertInside } = require('./fileUtils');
const { normalizeEntryName, isHtmlPath } = require('./zipExtractor');

const EXTENSION_BY_TYPE = {
  'text/html': '.html',
  'text/css': '.css',
  'text/javascript': '.js',
  'application/javascript': '.js',
  'application/x-javascript': '.js',
  'text/plain': '.txt',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'image/x-icon': '.ico',
  'image/vnd.microsoft.icon': '.ico',
  'font/woff': '.woff',
  'font/woff2': '.woff2',
  'application/font-woff': '.woff',
  'application/x-font-woff': '.woff',
  'application/vnd.ms-fontobject': '.eot',
  'font/ttf': '.ttf',
  'font/otf': '.otf',
  'application/json': '.json'
};

function decodeQuotedPrintable(value) {
  const cleaned = String(value || '').replace(/=\r?\n/g, '');
  const bytes = [];
  for (let i = 0; i < cleaned.length; i += 1) {
    if (cleaned[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(cleaned.slice(i + 1, i + 3))) {
      bytes.push(parseInt(cleaned.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(cleaned.charCodeAt(i) & 0xff);
    }
  }
  return Buffer.from(bytes);
}

function decodeBody(body, encoding) {
  const mode = String(encoding || 'binary').toLowerCase();
  if (mode === 'base64') {
    return Buffer.from(body.replace(/\s+/g, ''), 'base64');
  }
  if (mode === 'quoted-printable') {
    return decodeQuotedPrintable(body);
  }
  return Buffer.from(body, 'latin1');
}

function decodeText(buffer, charset) {
  const name = String(charset || 'utf-8').trim().toLowerCase() || 'utf-8';
  try {
    return new TextDecoder(name).decode(buffer);
  } catch (_error) {
    return buffer.toString('utf8');
  }
}

function parseHeaders(block) {
  const headers = {};
  let current = '';
  const commit = (line) => {
    const index = line.indexOf(':');
    if (index <= 0) return;
    const key = line.slice(0, index).trim().toLowerCase();
    const value = line.slice(index + 1).trim();
    headers[key] = headers[key] ? `${headers[key]} ${value}` : value;
  };

  String(block || '').split(/\r?\n/).forEach((line) => {
    if (/^[ \t]/.test(line)) {
      current += ` ${line.trim()}`;
      return;
    }
    if (current) commit(current);
    current = line;
  });
  if (current) commit(current);
  return headers;
}

function parseContentType(value) {
  const parts = String(value || '').split(';');
  const params = {};
  parts.slice(1).forEach((part) => {
    const match = part.trim().match(/^([^=]+)=(.*)$/);
    if (!match) return;
    let paramValue = match[2].trim();
    if (paramValue.startsWith('"') && paramValue.endsWith('"')) {
      paramValue = paramValue.slice(1, -1);
    }
    params[match[1].trim().toLowerCase()] = paramValue;
  });
  return {
    type: (parts[0] || '').trim().toLowerCase(),
    params
  };
}

function decodeRfc2047(value) {
  return String(value || '').replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_all, charset, encoding, text) => {
    try {
      const buffer = encoding.toLowerCase() === 'b'
        ? Buffer.from(text, 'base64')
        : decodeQuotedPrintable(text.replace(/_/g, ' '));
      return decodeText(buffer, charset);
    } catch (_error) {
      return text;
    }
  });
}

function safeDecodeUri(value) {
  try {
    return decodeURIComponent(value);
  } catch (_error) {
    return value;
  }
}

function extensionFor(contentType, fallback) {
  return EXTENSION_BY_TYPE[contentType] || fallback;
}

function locationToPath(location, contentType, index, limits) {
  const raw = decodeRfc2047(location).trim();
  let pathname = '';
  if (/^https?:\/\//i.test(raw) || raw.startsWith('//')) {
    try {
      pathname = new URL(raw.startsWith('//') ? `http:${raw}` : raw).pathname;
    } catch (_error) {
      pathname = '';
    }
  } else if (raw && !/^cid:/i.test(raw)) {
    pathname = raw.split('#')[0].split('?')[0];
  }

  pathname = safeDecodeUri(pathname).replace(/\\/g, '/');
  const parts = pathname.split('/').filter((part) => part && part !== '.' && part !== '..');
  let relative = parts.join('/');
  if (!relative || relative.endsWith('/')) {
    const ext = contentType.startsWith('text/html') ? '.html' : extensionFor(contentType, '.bin');
    relative = `${relative}resource-${index}${ext}`.replace(/^\//, '');
  }
  if (!path.posix.extname(relative)) {
    relative += extensionFor(contentType, contentType.startsWith('text/html') ? '.html' : '.bin');
  }
  return normalizeEntryName(relative, limits, 'MHTML');
}

function contentIdKey(value) {
  return String(value || '').trim().replace(/^<|>$/g, '').toLowerCase();
}

function splitParts(source) {
  const splitAt = source.indexOf('\r\n\r\n') >= 0 ? source.indexOf('\r\n\r\n') : source.indexOf('\n\n');
  if (splitAt < 0) {
    throw new Error('MHTML 缺少报文头');
  }
  const headerGap = source.slice(splitAt, splitAt + 4) === '\r\n\r\n' ? 4 : 2;
  const headers = parseHeaders(source.slice(0, splitAt));
  const contentType = parseContentType(headers['content-type'] || '');
  if (contentType.type !== 'multipart/related' || !contentType.params.boundary) {
    throw new Error('只支持 multipart/related 格式的 MHTML');
  }

  const boundary = contentType.params.boundary;
  const chunks = source.slice(splitAt + headerGap).split(`--${boundary}`);
  const parts = [];
  chunks.slice(1).forEach((chunk) => {
    let part = chunk;
    if (part.startsWith('--')) return;
    if (part.startsWith('\r\n')) part = part.slice(2);
    else if (part.startsWith('\n')) part = part.slice(1);
    if (part.endsWith('\r\n')) part = part.slice(0, -2);
    else if (part.endsWith('\n')) part = part.slice(0, -1);
    if (!part.trim()) return;

    const partSplit = part.indexOf('\r\n\r\n') >= 0 ? part.indexOf('\r\n\r\n') : part.indexOf('\n\n');
    if (partSplit < 0) return;
    const partGap = part.slice(partSplit, partSplit + 4) === '\r\n\r\n' ? 4 : 2;
    parts.push({
      headers: parseHeaders(part.slice(0, partSplit)),
      body: part.slice(partSplit + partGap)
    });
  });

  if (parts.length === 0) {
    throw new Error('MHTML 中没有可提取的内容');
  }
  return parts;
}

function relativeUrl(fromPath, toPath) {
  const relative = path.posix.relative(path.posix.dirname(fromPath), toPath);
  return relative || path.posix.basename(toPath);
}

function rewriteReferences(text, fromPath, locations, cidMap) {
  const replacements = [];
  locations.forEach((item) => {
    if (!item.location || item.path === fromPath) return;
    const target = relativeUrl(fromPath, item.path);
    const escaped = item.location.replace(/&/g, '&amp;');
    replacements.push({ from: item.location, to: target });
    if (escaped !== item.location) replacements.push({ from: escaped, to: target });
  });
  replacements.sort((a, b) => b.from.length - a.from.length);

  let output = text;
  replacements.forEach((item) => {
    if (item.from) output = output.split(item.from).join(item.to);
  });

  return output.replace(/cid:([^"'()\s>]+)/gi, (match, id) => {
    const target = cidMap.get(contentIdKey(id));
    if (!target) return match;
    return relativeUrl(fromPath, target);
  });
}

async function writeFileAt(destDir, relativePath, buffer) {
  const target = path.resolve(destDir, ...relativePath.split('/'));
  assertInside(destDir, target);
  await ensureDir(path.dirname(target));
  await fs.writeFile(target, buffer, { flag: 'wx' });
}

async function extractMhtml(filePath, destDir, limits) {
  await ensureDir(destDir);
  let source = (await fs.readFile(filePath)).toString('latin1');
  if (source.startsWith('\u00EF\u00BB\u00BF')) source = source.slice(3);
  const parts = splitParts(source);
  if (parts.length > limits.maxEntries) {
    throw new Error(`MHTML 文件数量超过限制：${limits.maxEntries}`);
  }

  const parsed = parts.map((part, index) => {
    const type = parseContentType(part.headers['content-type'] || 'application/octet-stream');
    const buffer = decodeBody(part.body, part.headers['content-transfer-encoding']);
    if (buffer.length > limits.maxSingleFileBytes) {
      throw new Error('MHTML 单个资源超过大小限制');
    }
    return {
      index,
      type: type.type,
      charset: type.params.charset || '',
      location: decodeRfc2047(part.headers['content-location'] || '').trim(),
      contentId: contentIdKey(part.headers['content-id'] || ''),
      buffer
    };
  });

  const htmlIndex = parsed.findIndex((part) => part.type === 'text/html' || part.type === 'application/xhtml+xml');
  if (htmlIndex < 0) {
    throw new Error('MHTML 中没有 HTML 页面');
  }

  const used = new Set();
  function reserve(relativePath) {
    let next = relativePath;
    let suffix = 2;
    while (used.has(next.toLowerCase())) {
      const ext = path.posix.extname(relativePath);
      const base = relativePath.slice(0, relativePath.length - ext.length);
      next = normalizeEntryName(`${base}-${suffix}${ext}`, limits, 'MHTML');
      suffix += 1;
    }
    used.add(next.toLowerCase());
    return next;
  }

  const htmlPart = parsed[htmlIndex];
  htmlPart.path = reserve(locationToPath(htmlPart.location, 'text/html', htmlPart.index + 1, limits));
  parsed.forEach((part) => {
    if (part === htmlPart) return;
    part.path = reserve(locationToPath(part.location, part.type, part.index + 1, limits));
  });

  const cidMap = new Map();
  const locations = [];
  parsed.forEach((part) => {
    if (part.contentId) cidMap.set(part.contentId, part.path);
    if (part.location) locations.push({ location: part.location, path: part.path });
  });

  let totalSize = 0;
  for (const part of parsed) {
    let output = part.buffer;
    if (part.type === 'text/html' || part.type === 'application/xhtml+xml' || part.type === 'text/css') {
      let text = decodeText(part.buffer, part.charset);
      text = rewriteReferences(text, part.path, locations, cidMap);
      if (part.type !== 'text/css') {
        text = text.replace(/charset\s*=\s*(['"]?)[a-zA-Z0-9._-]+\1/gi, 'charset=utf-8');
      }
      output = Buffer.from(text, 'utf8');
    }
    totalSize += output.length;
    if (totalSize > limits.maxExtractedBytes) {
      throw new Error(`MHTML 解包后总大小超过限制：${limits.maxExtractedBytes}`);
    }
    await writeFileAt(destDir, part.path, output);
  }

  if (!isHtmlPath(htmlPart.path)) {
    throw new Error('MHTML 主文件不是 HTML');
  }

  return {
    fileCount: parsed.length,
    sizeBytes: totalSize,
    entryFile: htmlPart.path
  };
}

module.exports = {
  extractMhtml
};
