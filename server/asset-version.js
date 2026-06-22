const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ASSET_MARKER = '<!-- gost-asset-version -->';
const LOCAL_ASSET = /(\s(?:href|src)=["'])(?!https?:\/\/|\/\/|data:|#)([^"']+\.(?:css|js))(\?[^"']*)?(["'])/gi;

let cachedVersion = null;

function readGitShort(root) {
  try {
    return execSync('git rev-parse --short HEAD', {
      cwd: root,
      stdio: ['ignore', 'pipe', 'ignore']
    }).toString().trim();
  } catch {
    return '';
  }
}

function getAssetVersion(rootDir) {
  if (cachedVersion) return cachedVersion;

  const fromEnv = (process.env.ASSET_VERSION || '').trim();
  if (fromEnv) {
    cachedVersion = fromEnv;
    return cachedVersion;
  }

  const versionFile = path.join(rootDir, '.asset-version');
  try {
    const fromFile = fs.readFileSync(versionFile, 'utf8').trim();
    if (fromFile) {
      cachedVersion = fromFile;
      return cachedVersion;
    }
  } catch { /* ignore */ }

  const fromGit = readGitShort(rootDir);
  if (fromGit) {
    cachedVersion = fromGit;
    return cachedVersion;
  }

  cachedVersion = 'dev';
  return cachedVersion;
}

function withAssetQuery(url, version) {
  if (!version || !url) return url;
  const base = url.split('?')[0];
  return `${base}?v=${encodeURIComponent(version)}`;
}

function injectAssetVersion(html, version) {
  if (!html || !version) return html;

  const safe = String(version).replace(/[^\w.-]/g, '').slice(0, 40) || 'dev';
  let out = html.replace(LOCAL_ASSET, (match, pre, url, query, post) => {
    if (query && /(?:^|[?&])v=/.test(query)) {
      const nextQuery = query.replace(/([?&])v=[^&]*/, `$1v=${safe}`);
      return `${pre}${url}${nextQuery}${post}`;
    }
    return `${pre}${url}?v=${safe}${post}`;
  });

  if (!out.includes(ASSET_MARKER)) {
    out = out.replace(
      '<head>',
      `<head>\n${ASSET_MARKER}\n<meta name="gost-asset-version" content="${safe}">\n<script>window.GOST_ASSET_V="${safe}";<\/script>`
    );
  }

  return out;
}

function applyStaticCacheHeaders(req, res) {
  if (!/\.(css|js|png|webp|jpe?g|gif|svg|ico|woff2?|webmanifest)$/i.test(req.path)) return;
  if (req.query.v) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return;
  }
  res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
}

module.exports = {
  ASSET_MARKER,
  getAssetVersion,
  withAssetQuery,
  injectAssetVersion,
  applyStaticCacheHeaders
};
