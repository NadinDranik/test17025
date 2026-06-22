const { Client } = require('ssh2');

const HOST = process.env.DEPLOY_HOST || '185.39.206.48';
const USER = process.env.DEPLOY_USER || 'root';
const PASS = process.env.DEPLOY_PASS;

if (!PASS) {
  console.error('DEPLOY_PASS required');
  process.exit(1);
}

const script = `set +e
echo "=== NGINX ==="
cat /etc/nginx/sites-enabled/gost17025 2>/dev/null
echo ""
echo "=== PM2 ==="
pm2 status
echo ""
echo "=== ENV (masked) ==="
grep -E '^(NODE_ENV|COOKIE_SECURE|SITE_PUBLIC|PORT)=' /opt/gost17025/.env
test -f /opt/gost17025/.env && grep -q '^SESSION_SECRET=' /opt/gost17025/.env && echo 'SESSION_SECRET=set' || echo 'SESSION_SECRET=MISSING'
echo ""
echo "=== UFW ==="
ufw status 2>/dev/null || echo 'ufw not active'
echo ""
echo "=== DISK ==="
df -h / /opt/gost17025
echo ""
echo "=== DATA ==="
du -sh /opt/gost17025/data 2>/dev/null
ls -la /opt/gost17025/data 2>/dev/null | head -8
echo ""
echo "=== CERT ==="
certbot certificates 2>/dev/null | sed -n '1,25p'
echo ""
echo "=== VERSIONS ==="
node -v
nginx -v 2>&1
echo ""
echo "=== BACKUPS ==="
ls -la /opt/gost17025/backups 2>/dev/null || echo 'no /opt/gost17025/backups'
ls /opt/gost17025/data/*.db 2>/dev/null
echo ""
echo "=== CRON ==="
crontab -l 2>/dev/null || echo 'no root crontab'
echo ""
echo "=== HEALTH ==="
curl -sf http://127.0.0.1:3000/api/health && echo ""
curl -sI https://akkred17025.ru/ | sed -n '1,8p'
`;

function exec(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let stderr = '';
      stream.on('close', (code) => {
        if (code !== 0) reject(new Error(stderr || `exit ${code}`));
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
    conn.connect({ host: HOST, port: 22, username: USER, password: PASS, readyTimeout: 60000 });
  });
  await exec(conn, script);
  conn.end();
}

main().catch((err) => {
  console.error('AUDIT ERROR:', err.message);
  process.exit(1);
});
