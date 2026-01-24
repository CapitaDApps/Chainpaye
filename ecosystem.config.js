module.exports = {
  apps: [
    {
      name: "chainpaye-prod",
      script: "./dist/app.js",
      env: {
        NODE_ENV: "production",
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
      },
      restart_delay: 5000,
      max_restarts: 10,
      autorestart: true,
    },
  ],
};
