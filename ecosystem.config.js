module.exports = {
  apps: [
    {
      // PRODUCTION CONFIG
      name: "chainpaye-prod",
      script: "./dist/app.js",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      restart_delay: 5000,
      max_restarts: 10,
      autorestart: true,
      instances: 2,
      exec_mode: "cluster",
    },
    {
      name: "chainpaye-stage",
      script: "pnpm",
      args: ["start"],
      env: {
        NODE_ENV: "development",
        PORT: 3000,
      },
      restart_delay: 5000,
      max_restarts: 10,
      autorestart: true,
    },
    {
      // STAGING CONFIG
      name: "chainpaye-staging",
      script: "pnpm",
      args: "start", // This runs 'pnpm start'
      env: {
        NODE_ENV: "development",
        PORT: 3001,
      },
      restart_delay: 5000,
      max_restarts: 10,
      autorestart: true,
    },
  ],
};
