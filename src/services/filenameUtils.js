function hasMojibakeMarkers(value) {
  return /[ÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ�]/.test(value);
}

function scoreFilename(value) {
  let score = 0;
  const replacementCount = (value.match(/�/g) || []).length;
  const c1ControlCount = (value.match(/[-]/g) || []).length;
  const cjkCount = (value.match(/[一-鿿]/g) || []).length;

  score -= replacementCount * 20;
  score -= c1ControlCount * 8;
  score += cjkCount * 4;

  if (hasMojibakeMarkers(value)) score -= 3;
  return score;
}

function stripPathSegments(filename) {
  return filename.replace(/\\/g, '/').split('/').filter(Boolean).pop() || filename;
}

function normalizeUploadedFilename(filename) {
  const original = stripPathSegments(String(filename || '未命名文件').trim());
  if (!hasMojibakeMarkers(original)) {
    return original;
  }

  const repaired = Buffer.from(original, 'latin1').toString('utf8');
  return scoreFilename(repaired) > scoreFilename(original) ? repaired : original;
}

module.exports = {
  normalizeUploadedFilename
};
