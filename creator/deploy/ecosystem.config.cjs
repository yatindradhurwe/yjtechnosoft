// PM2: pm2 start deploy/ecosystem.config.cjs && pm2 save
module.exports = {
  apps: [
    {
      name: 'creator-api',
      cwd: './server',
      script: 'dist/index.js',
      // One instance: Socket.IO needs sticky sessions plus a shared adapter to scale out
      // (see docs/DEPLOYMENT.md › Scaling). The worker runs as its own process.
      instances: 1,
      exec_mode: 'fork',
      env: { NODE_ENV: 'production', DISABLE_WORKER: '1' },
      max_memory_restart: '1G',
    },
    {
      name: 'creator-worker',
      cwd: './server',
      script: 'dist/worker.js',
      instances: 1,
      env: { NODE_ENV: 'production' },
    },
  ],
};
