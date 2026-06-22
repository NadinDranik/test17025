/**
 * Улучшение продакшен-сервера: Nginx, бэкапы, .env
 *   set DEPLOY_PASS=...
 *   node scripts/server-hardening-remote.js
 */
const { Client } = require('ssh2');

const HOST = process.env.DEPLOY_HOST || '185.39.206.48';
const USER = process.env.DEPLOY_USER || 'root';
const PASS = process.env.DEPLOY_PASS;
const DOMAIN = process.env.SITE_DOMAIN || 'akkred17025.ru';
const APP_DIR = process.env.DEPLOY_DIR || '/opt/gost17025';

if (!PASS) {
  console.error('DEPLOY_PASS required');
  process.exit(1);
}

const nginxConf = `# Гид PRO — ${DOMAIN}
# Редирект по IP и неизвестным хостам на канонический домен
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    return 301 https://${DOMAIN}$request_uri;
}

server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN};
    return 301 https://${DOMAIN}$request_uri;
}

# www → без www
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name www.${DOMAIN};

    ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    return 301 https://${DOMAIN}$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name ${DOMAIN};

    ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    client_max_body_size 50M;

    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 5;
    gzip_min_length 256;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml text/xml application/xml;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
`;

const backupScript = `#!/bin/bash
set -euo pipefail
APP_DIR="${APP_DIR}"
BACKUP_DIR="$APP_DIR/backups"
DB="$APP_DIR/data/gost17025.db"
mkdir -p "$BACKUP_DIR"
if [ -f "$DB" ]; then
  sqlite3 "$DB" ".backup '$BACKUP_DIR/backup-$(date +%F-%H%M).db'"
  find "$BACKUP_DIR" -name 'backup-*.db' -mtime +14 -delete
fi
`;

function exec(conn, cmd, label) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let stderr = '';
      stream.on('close', (code) => {
        if (code !== 0) reject(new Error(`${label || 'cmd'}\nexit ${code}\n${stderr}`));
        else resolve();
      });
      stream.on('data', (d) => process.stdout.write(d));
      stream.stderr.on('data', (d) => { stderr += d; process.stderr.write(d); });
    });
  });
}

async function main() {
  const conn = new Client();
  await new Promise((resolve, reject) => {
    conn.on('ready', resolve);
    conn.on('error', reject);
    conn.connect({ host: HOST, port: 22, username: USER, password: PASS, readyTimeout: 120000 });
  });

  console.log('SSH OK\n');

  const setupScript = `set -e
cat > /etc/nginx/sites-available/gost17025 << 'NGINXEOF'
${nginxConf}
NGINXEOF
ln -sf /etc/nginx/sites-available/gost17025 /etc/nginx/sites-enabled/gost17025
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

cd ${APP_DIR}
touch .env
grep -q '^SITE_PUBLIC_URL=' .env && sed -i 's|^SITE_PUBLIC_URL=.*|SITE_PUBLIC_URL=https://${DOMAIN}|' .env || echo 'SITE_PUBLIC_URL=https://${DOMAIN}' >> .env

cat > /usr/local/bin/gost17025-backup << 'BACKUPEOF'
${backupScript}
BACKUPEOF
chmod +x /usr/local/bin/gost17025-backup

CRON_LINE='0 3 * * * /usr/local/bin/gost17025-backup >> /var/log/gost17025-backup.log 2>&1'
(crontab -l 2>/dev/null | grep -v gost17025-backup; echo "$CRON_LINE") | crontab -

/usr/local/bin/gost17025-backup
ls -lh ${APP_DIR}/backups | tail -3

systemctl is-active certbot.timer 2>/dev/null || systemctl list-timers | grep certbot || true

pm2 restart gost17025 --update-env
sleep 2
curl -sf http://127.0.0.1:3000/api/health && echo ""
curl -sI http://${HOST}/ | sed -n '1,4p'
curl -sI https://${DOMAIN}/ | sed -n '1,10p'
`;

  await exec(conn, setupScript, 'hardening');
  console.log(`\nГотово: https://${DOMAIN}`);
  conn.end();
}

main().catch((err) => {
  console.error('\nОШИБКА:', err.message);
  process.exit(1);
});
