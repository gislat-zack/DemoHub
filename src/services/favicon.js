function scoreIconTag(tag) {
  const rel = (tag.match(/\brel\s*=\s*["']([^"']+)["']/i) || [])[1] || '';
  if (!/icon/i.test(rel)) return -1;
  let score = 1;
  if (/apple-touch-icon/i.test(rel)) score = 4;
  else if (/\bicon\b/i.test(rel)) score = 3;
  const sizes = (tag.match(/\bsizes\s*=\s*["']([^"']+)["']/i) || [])[1] || '';
  const size = Math.max(...sizes.split(/\s+/).map((part) => parseInt(part, 10) || 0), 0);
  if (size >= 32 && size <= 256) score += size / 256;
  if (/\.svg(\?|$)/i.test(tag)) score += 0.5;
  return score;
}

function pickIconHref(html) {
  const tags = String(html || '').match(/<link\b[^>]*>/gi) || [];
  let best = '';
  let bestScore = -1;
  for (const tag of tags) {
    const score = scoreIconTag(tag);
    if (score < 0) continue;
    const href = (tag.match(/\bhref\s*=\s*["']([^"']+)["']/i) || [])[1] || '';
    if (!href || href.startsWith('data:')) continue;
    if (score > bestScore) {
      bestScore = score;
      best = href;
    }
  }
  return best;
}

async function resolveFavicon(pageUrl) {
  let page;
  try {
    page = new URL(pageUrl);
  } catch {
    return '';
  }
  if (page.protocol !== 'http:' && page.protocol !== 'https:') return '';

  const fallback = `${page.origin}/favicon.ico`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(page.href, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'DemoHub/1.0'
      }
    });
    const type = response.headers.get('content-type') || '';
    if (!response.ok || !/html/i.test(type)) return fallback;
    const html = (await response.text()).slice(0, 250000);
    const href = pickIconHref(html);
    if (!href) return fallback;
    const resolved = new URL(href, response.url || page.href);
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return fallback;
    return resolved.href;
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  resolveFavicon
};
