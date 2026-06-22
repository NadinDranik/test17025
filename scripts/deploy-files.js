const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const HOST = process.env.DEPLOY_HOST || '185.39.206.48';
const USER = process.env.DEPLOY_USER || 'root';
const PASS = process.env.DEPLOY_PASS;
const APP_DIR = process.env.DEPLOY_DIR || '/opt/gost17025';
const ROOT = path.join(__dirname, '..');

const files = (process.env.DEPLOY_FILES || 'js/app.js,js/ui.js,admin.html').split(',').filter(Boolean);

if (!PASS) {
  console.error('DEPLOY_PASS required');
  process.exit(1);
}

function upload(sftp, rel) {
  return new Promise((resolve, reject) => {
    const local = path.join(ROOT, rel);
    const remote = APP_DIR + '/' + rel.replace(/\\/g, '/');
    const rs = fs.createReadStream(local);
    const ws = sftp.createWriteStream(remote);
    ws.on('close', () => { console.log('OK', rel); resolve(); });
    ws.on('error', reject);
    rs.on('error', reject);
    rs.pipe(ws);
  });
}

function exec(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      stream.on('data', d => process.stdout.write(d));
      stream.stderr.on('data', d => process.stderr.write(d));
      stream.on('close', code => (code ? reject(new Error('exit ' + code)) : resolve()));
    });
  });
}

const conn = new Client();
conn.on('ready', () => {
  conn.sftp(async (err, sftp) => {
    if (err) { console.error(err); process.exit(1); }
    try {
      for (const f of files) await upload(sftp, f);
      if (files.some(f => f.replace(/\\/g, '/') === 'package.json')) {
        await exec(conn, `cd ${APP_DIR} && npm install --production`);
      }
      await exec(conn, `cd ${APP_DIR} && V=$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M) && echo "$V" > .asset-version && (grep -q '^ASSET_VERSION=' .env 2>/dev/null && sed -i "s|^ASSET_VERSION=.*|ASSET_VERSION=$V|" .env || echo "ASSET_VERSION=$V" >> .env) && echo "ASSET_VERSION=$V"`);
      await exec(conn, 'pm2 restart gost17025 --update-env && sleep 2 && curl -sf http://127.0.0.1:3000/api/health');
      console.log('\nDeploy done');
      conn.end();
    } catch (e) {
      console.error(e.message);
      conn.end();
      process.exit(1);
    }
  });
});
conn.on('error', e => { console.error(e.message); process.exit(1); });
conn.connect({ host: HOST, port: 22, username: USER, password: PASS, readyTimeout: 60000 });
