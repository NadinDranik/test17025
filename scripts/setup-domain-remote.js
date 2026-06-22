/**
 * Настройка домена akkred17025.ru на сервере:
 *   Nginx server_name, SSL (Let's Encrypt), .env
 *
 * Запуск:
 *   set DEPLOY_PASS=...
 *   node scripts/setup-domain-remote.js
 *
 * Перед запуском в Timeweb DNS добавьте A-запись:
 *   www → 185.39.206.48
 */
const { Client } = require('ssh2');

const HOST = process.env.DEPLOY_HOST || '185.39.206.48';
const USER = process.env.DEPLOY_USER || 'root';
const PASS = process.env.DEPLOY_PASS;
const DOMAIN = process.env.SITE_DOMAIN || 'akkred17025.ru';

if (!PASS) {
  console.error('Укажите пароль: set DEPLOY_PASS=...');
  process.exit(1);
}

const nginxConf = `server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    return 301 https://${DOMAIN}$request_uri;
}

server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN};

    client_max_body_size 50M;
    gzip on;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;
    gzip_min_length 256;

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
}
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
export DEBIAN_FRONTEND=noninteractive
cat > /etc/nginx/sites-available/gost17025 << 'NGINXEOF'
${nginxConf}
NGINXEOF
ln -sf /etc/nginx/sites-available/gost17025 /etc/nginx/sites-enabled/gost17025
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

cd /opt/gost17025
touch .env
grep -q '^SITE_PUBLIC_URL=' .env && sed -i 's|^SITE_PUBLIC_URL=.*|SITE_PUBLIC_URL=https://${DOMAIN}|' .env || echo 'SITE_PUBLIC_URL=https://${DOMAIN}' >> .env
grep -q '^COOKIE_SECURE=' .env && sed -i 's|^COOKIE_SECURE=.*|COOKIE_SECURE=true|' .env || echo 'COOKIE_SECURE=true' >> .env
grep -q '^NODE_ENV=' .env && sed -i 's|^NODE_ENV=.*|NODE_ENV=production|' .env || echo 'NODE_ENV=production' >> .env
grep -E 'SITE_PUBLIC_URL|COOKIE_SECURE|NODE_ENV' .env

if ! command -v certbot >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y -qq certbot python3-certbot-nginx
fi

certbot --nginx -d ${DOMAIN} -d www.${DOMAIN} --non-interactive --agree-tos --register-unsafely-without-email --redirect

nginx -t && systemctl reload nginx
pm2 restart gost17025 --update-env
sleep 2
curl -sf http://127.0.0.1:3000/api/health && echo ""
curl -sI https://${DOMAIN} | head -3
`;

  await exec(conn, setupScript, 'setup-domain');
  console.log(`\nГотово: https://${DOMAIN}`);
  conn.end();
}

main().catch((err) => {
  console.error('\nОШИБКА:', err.message);
  process.exit(1);
});
