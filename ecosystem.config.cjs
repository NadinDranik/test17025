module.exports = {
  apps: [{
    name: 'gost17025',
    script: 'server.js',
    cwd: '/opt/gost17025',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    max_memory_restart: '280M',
    exp_backoff_restart_delay: 200,
    max_restarts: 20,
    min_uptime: 10000,
    kill_timeout: 8000,
    env: {
      NODE_ENV: 'production'
    }
  }]
};
