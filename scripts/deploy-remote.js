/**
 * Скрипт удалённого развёртывания через SSH.
 * Запуск:
 *   set DEPLOY_HOST=185.39.206.48
 *   set DEPLOY_USER=root
 *   set DEPLOY_PASS=ваш-пароль
 *   npm install ssh2
 *   node scripts/deploy-remote.js
 */
const { Client } = require('ssh2');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const HOST = process.env.DEPLOY_HOST || '185.39.206.48';
const USER = process.env.DEPLOY_USER || 'root';
const PASS = process.env.DEPLOY_PASS;
const APP_DIR = '/opt/gost17025';
const REPO = 'https://github.com/NadinDranik/test17025.git';

if (!PASS) {
  console.error('Укажите пароль: set DEPLOY_PASS=...');
  process.exit(1);
}

const SESSION_SECRET = crypto.randomBytes(32).toString('hex');
const ADMIN_PASSWORD = crypto.randomBytes(16).toString('base64url');

function exec(conn, cmd, label) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let stdout = '';
      let stderr = '';
      stream.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`${label || cmd}\nexit ${code}\n${stderr || stdout}`));
          return;
        }
        resolve(stdout);
      });
      stream.on('data', (d) => { stdout += d.toString(); process.stdout.write(d); });
      stream.stderr.on('data', (d) => { stderr += d.toString(); process.stderr.write(d); });
    });
  });
}

async function main() {
  const conn = new Client();
  await new Promise((resolve, reject) => {
    conn.on('ready', resolve);
    conn.on('error', reject);
    conn.connect({ host: HOST, port: 22, username: USER, password: PASS, readyTimeout: 60000 });
  });

  console.log('\n=== SSH подключение установлено ===\n');

  const envContent = [
    'PORT=3000', 'NODE_ENV=production',
    `SESSION_SECRET=${SESSION_SECRET}`,
    'ADMIN_EMAIL=admin@gost17025.pro',
    `ADMIN_PASSWORD=${ADMIN_PASSWORD}`
  ].join('\n');

  const nginxConf = `server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    client_max_body_size 50M;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}`;

  const setupScript = `set -e
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl git nginx build-essential ufw sqlite3
if ! command -v node >/dev/null 2>&1 || [ "$(node -p "process.versions.node.split('.')[0]")" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi
npm install -g pm2
mkdir -p ${APP_DIR}
if [ -d ${APP_DIR}/.git ]; then cd ${APP_DIR} && git fetch origin && git reset --hard origin/main
else rm -rf ${APP_DIR}; git clone ${REPO} ${APP_DIR}; fi
cd ${APP_DIR} && mkdir -p data && chmod 755 data && npm install --production
cat > ${APP_DIR}/.env << 'ENVEOF'
${envContent}
ENVEOF
chmod 600 ${APP_DIR}/.env
pm2 delete gost17025 2>/dev/null || true
pm2 start server.js --name gost17025
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null | tail -1 | bash || true
cat > /etc/nginx/sites-available/gost17025 << 'NGINXEOF'
${nginxConf}
NGINXEOF
ln -sf /etc/nginx/sites-available/gost17025 /etc/nginx/sites-enabled/gost17025
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl enable nginx && systemctl restart nginx
ufw --force enable || true; ufw allow OpenSSH || true; ufw allow 'Nginx Full' || true
sleep 2
curl -sf http://127.0.0.1:3000/api/health && echo ""
pm2 status
`;

  await exec(conn, setupScript, 'deploy');

  const credPath = path.join(__dirname, '..', 'DEPLOY-CREDENTIALS.txt');
  fs.writeFileSync(credPath, [
    `Сайт: http://${HOST}`,
    `Admin: admin@gost17025.pro / ${ADMIN_PASSWORD}`,
    `SESSION_SECRET: ${SESSION_SECRET}`,
    `Дата: ${new Date().toISOString()}`
  ].join('\n'));

  console.log(`\nГотово: http://${HOST}`);
  console.log(`Admin password: ${ADMIN_PASSWORD}`);
  conn.end();
}

main().catch((err) => { console.error('\nОШИБКА:', err.message); process.exit(1); });
