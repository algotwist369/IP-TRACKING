module.exports = {
  apps: [
    {
      name: 'ip-tracker-server',
      script: './server-enhanced.js',
      instances: 'max', // Use all CPU cores
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'development',
        PORT: 5000,
        MONGO_URI: process.env.MONGO_URI || "mongodb+srv://infoalgotwist:b78TEY60PiRWYoS9@cluster0.kidgbtf.mongodb.net/traffic-monitor-single-page",
        REDIS_HOST: process.env.REDIS_HOST || 'localhost',
        REDIS_PORT: process.env.REDIS_PORT || 6379,
        REDIS_PASSWORD: process.env.REDIS_PASSWORD || undefined,
        LOG_LEVEL: 'info',
        MAX_WORKERS: 4
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000,
        MONGO_URI: process.env.MONGO_URI,
        REDIS_HOST: process.env.REDIS_HOST,
        REDIS_PORT: process.env.REDIS_PORT,
        REDIS_PASSWORD: process.env.REDIS_PASSWORD,
        LOG_LEVEL: 'warn',
        MAX_WORKERS: 8
      },
      // Performance optimizations
      max_memory_restart: '1G',
      node_args: '--max-old-space-size=1024',
      
      // Logging
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // Auto restart
      watch: false,
      ignore_watch: ['node_modules', 'logs'],
      watch_options: {
        followSymlinks: false
      },
      
      // Health monitoring
      min_uptime: '10s',
      max_restarts: 10,
      
      // Advanced features
      kill_timeout: 5000,
      listen_timeout: 3000,
      shutdown_with_message: true,
      
      // Environment variables
      env_file: '.env'
    }
  ],

  deploy: {
    production: {
      user: 'deploy',
      host: ['your-server.com'],
      ref: 'origin/main',
      repo: 'git@github.com:your-username/ip-tracker.git',
      path: '/var/www/ip-tracker',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
};
