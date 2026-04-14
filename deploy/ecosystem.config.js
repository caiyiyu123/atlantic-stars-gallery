module.exports = {
  apps: [{
    name: 'atlantic-stars-api',
    script: './server/src/app.js',
    cwd: '/var/www/atlantic-stars-gallery',
    instances: 1,
    autorestart: true,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
  }],
};
