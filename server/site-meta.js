const fs = require('fs');
const path = require('path');

const SITE_META_MARKER = '<!-- gost-site-icons -->';

function publicBaseUrl(req) {
  const fromEnv = (process.env.SITE_PUBLIC_URL || '').replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  return `${req.protocol}://${req.get('host')}`;
}

function escapeAttr(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function readMetaFromHtml(html) {
  const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
  const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i)
    || html.match(/<meta\s+content=["']([^"']*)["']\s+name=["']description["']/i);
  return {
    title: titleMatch ? titleMatch[1].trim() : 'Гид PRO',
    description: descMatch
      ? descMatch[1].trim()
      : 'Профессиональное сообщество специалистов аккредитованных лабораторий'
  };
}

function buildSiteHead(req, html) {
  const base = publicBaseUrl(req);
  const { title, description } = readMetaFromHtml(html);
  const pageUrl = base + (req.path === '/' ? '/' : req.path);
  const imageUrl = `${base}/images/og-image.png`;

  return `${SITE_META_MARKER}
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="icon" href="/favicon.png" type="image/png" sizes="32x32">
  <link rel="apple-touch-icon" href="/images/apple-touch-icon.png" sizes="180x180">
  <link rel="manifest" href="/site.webmanifest">
  <link rel="canonical" href="${escapeAttr(pageUrl)}">
  <meta name="theme-color" content="#1a3a5c">
  <meta name="application-name" content="Гид PRO">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Гид PRO">
  <meta property="og:title" content="${escapeAttr(title)}">
  <meta property="og:description" content="${escapeAttr(description)}">
  <meta property="og:url" content="${escapeAttr(pageUrl)}">
  <meta property="og:image" content="${escapeAttr(imageUrl)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:locale" content="ru_RU">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeAttr(title)}">
  <meta name="twitter:description" content="${escapeAttr(description)}">
  <meta name="twitter:image" content="${escapeAttr(imageUrl)}">`;
}

function injectSiteMeta(html, req) {
  if (html.includes(SITE_META_MARKER) || !html.includes('</title>')) return html;
  return html.replace('</title>', `</title>\n${buildSiteHead(req, html)}`);
}

function sendHtmlWithMeta(req, res, filePath) {
  const html = fs.readFileSync(filePath, 'utf8');
  res.type('html').send(injectSiteMeta(html, req));
}

function createSiteMetaMiddleware(rootDir) {
  return function siteMetaMiddleware(req, res, next) {
    let filePath = null;
    if (req.path === '/') {
      filePath = path.join(rootDir, 'index.html');
    } else if (req.path.endsWith('.html')) {
      filePath = path.join(rootDir, req.path.replace(/^\//, ''));
    }
    if (!filePath || !fs.existsSync(filePath)) return next();
    return sendHtmlWithMeta(req, res, filePath);
  };
}

module.exports = {
  injectSiteMeta,
  sendHtmlWithMeta,
  createSiteMetaMiddleware
};
