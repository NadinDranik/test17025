/**
 * Настройка продакшен-сервера: swap, бэкапы, мониторинг, PM2 ecosystem, смена root-пароля.
 *   set DEPLOY_PASS=...
 *   node scripts/server-ops-remote.js
 *
 * Опции:
 *   SKIP_PASSWORD_ROTATE=1  — не менять пароль root
 */
const crypto = require('crypto');
const { Client } = require('ssh2');

const HOST = process.env.DEPLOY_HOST || '185.39.206.48';
const USER = process.env.DEPLOY_USER || 'root';
const PASS = process.env.DEPLOY_PASS;
const APP_DIR = process.env.DEPLOY_DIR || '/opt/gost17025';
const DOMAIN = process.env.SITE_DOMAIN || 'akkred17025.ru';
const SKIP_PASSWORD = process.env.SKIP_PASSWORD_ROTATE === '1';

if (!PASS) {
  console.error('DEPLOY_PASS required');
  process.exit(1);
}

const newRootPassword = crypto.randomBytes(18).toString('base64url');

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

const healthScript = `#!/bin/bash
LOG=/var/log/gost17025-health.log
TS=$(date -Is)
if curl -sf --max-time 12 http://127.0.0.1:3000/api/health >/dev/null; then
  exit 0
fi
echo "$TS local health FAIL — pm2 restart" >> "$LOG"
pm2 restart gost17025 --update-env >> "$LOG" 2>&1 || true
sleep 4
if curl -sf --max-time 12 http://127.0.0.1:3000/api/health >/dev/null; then
  echo "$TS recovered after restart" >> "$LOG"
  exit 0
fi
echo "$TS still FAIL — nginx reload" >> "$LOG"
systemctl reload nginx >> "$LOG" 2>&1 || true
sleep 2
if curl -sf --max-time 15 "https://${DOMAIN}/api/health" >/dev/null; then
  echo "$TS recovered after nginx reload" >> "$LOG"
else
  echo "$TS CRITICAL: site still down" >> "$LOG"
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

  const passwordBlock = SKIP_PASSWORD
    ? 'echo "SKIP_PASSWORD_ROTATE=1"'
    : `echo "root:${newRootPassword}" | chpasswd && echo "PASSWORD_ROTATED"`;

  const setupScript = `set -e
echo "=== SWAP ==="
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "swap created"
else
  swapon /swapfile 2>/dev/null || true
  echo "swap already exists"
fi
free -h | head -3

echo ""
echo "=== BACKUP & HEALTH SCRIPTS ==="
cat > /usr/local/bin/gost17025-backup << 'BACKUPEOF'
${backupScript}
BACKUPEOF
chmod +x /usr/local/bin/gost17025-backup
/usr/local/bin/gost17025-backup
ls -lh ${APP_DIR}/backups | tail -3

cat > /usr/local/bin/gost17025-health << 'HEALTHEOF'
${healthScript}
HEALTHEOF
chmod +x /usr/local/bin/gost17025-health
touch /var/log/gost17025-health.log
/usr/local/bin/gost17025-health || true

echo ""
echo "=== CRON ==="
{ crontab -l 2>/dev/null || true; } | grep -v gost17025 | { cat; echo '0 3 * * * /usr/local/bin/gost17025-backup >> /var/log/gost17025-backup.log 2>&1'; echo '*/5 * * * * /usr/local/bin/gost17025-health'; } | crontab -
crontab -l 2>/dev/null | grep gost17025 || true

echo ""
echo "=== CERTBOT TIMER ==="
systemctl enable certbot.timer 2>/dev/null || true
systemctl start certbot.timer 2>/dev/null || true
systemctl is-active certbot.timer 2>/dev/null || certbot renew --dry-run 2>/dev/null | tail -3 || true

echo ""
echo "=== PM2 ECOSYSTEM ==="
cd ${APP_DIR}
if [ -f ecosystem.config.cjs ]; then
  pm2 delete gost17025 2>/dev/null || true
  pm2 start ecosystem.config.cjs
  pm2 save
  pm2 reset gost17025 2>/dev/null || true
else
  pm2 restart gost17025 --update-env
  pm2 save
fi
sleep 3
pm2 status

echo ""
echo "=== PASSWORD ==="
${passwordBlock}

echo ""
echo "=== FINAL CHECKS ==="
curl -sf http://127.0.0.1:3000/api/health && echo ""
curl -sI https://${DOMAIN}/api/health | sed -n '1,5p'
`;

  await exec(conn, setupScript, 'server-ops');
  conn.end();

  console.log('\n========================================');
  console.log('Сервер настроен.');
  if (!SKIP_PASSWORD) {
    console.log('\nНОВЫЙ пароль root (сохраните в надёжном месте):');
    console.log(newRootPassword);
    console.log('\nСтарые пароли из чата больше не действуют.');
  }
  console.log(`\nСайт: https://${DOMAIN}`);
  console.log('Мониторинг: cron каждые 5 мин + автоперезапуск PM2');
  console.log('Бэкапы: каждый день в 03:00, хранение 14 дней');
  console.log('========================================\n');
}

main().catch((err) => {
  console.error('\nОШИБКА:', err.message);
  process.exit(1);
});
