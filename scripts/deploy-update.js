/**
 * Обновление на сервере: git pull + pm2 restart (без смены .env).
 *   set DEPLOY_PASS=...
 *   node scripts/deploy-update.js
 */
const { Client } = require('ssh2');

const HOST = process.env.DEPLOY_HOST || '185.39.206.48';
const USER = process.env.DEPLOY_USER || 'root';
const PASS = process.env.DEPLOY_PASS;
const APP_DIR = process.env.DEPLOY_DIR || '/opt/gost17025';

if (!PASS) {
  console.error('DEPLOY_PASS required');
  process.exit(1);
}

function exec(conn, cmd, label) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let stderr = '';
      stream.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`${label || cmd}\nexit ${code}\n${stderr}`));
          return;
        }
        resolve();
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

  console.log('SSH OK\n');
  await exec(conn, `cd ${APP_DIR} && git fetch origin && git reset --hard origin/main`, 'git pull');
  await exec(conn, `cd ${APP_DIR} && npm install --production`, 'npm install');
  await exec(conn, 'pm2 restart gost17025', 'pm2 restart');
  await exec(conn, 'sleep 2 && curl -sf http://127.0.0.1:3000/api/health && echo ""', 'health');
  await exec(conn, 'pm2 status', 'status');

  console.log(`\nГотово: https://akkred17025.ru`);
  conn.end();
}

main().catch((err) => {
  console.error('\nОШИБКА:', err.message);
  process.exit(1);
});
