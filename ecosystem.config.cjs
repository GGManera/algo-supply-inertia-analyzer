module.exports = {
  apps: [
    {
      name: 'algo-analyzer',
      script: 'npm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
      },
      // Restart internal on crash
      exp_backoff_restart_delay: 100,
      // Log management
      combine_logs: true,
      merge_logs: true,
      error_file: './logs/error.log',
      out_file: './logs/out.log',
    },
  ],
};
