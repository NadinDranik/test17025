module.exports = {
  apps: [{
    name: 'gost17025',
    script: 'server.js',
    cwd: '/opt/gost17025',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    max_memory_restart: '400M',
    exp_backoff_restart_delay: 200,
    max_restarts: 0,
    min_uptime: 5000,
    kill_timeout: 8000,
    env: {
      NODE_ENV: 'production'
    }
  }]
};
