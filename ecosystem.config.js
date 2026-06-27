module.exports = {
  apps: [
    // ─────────────────────────────────────────────────────────────────────
    // PRODUCTION  (branch: main  →  ~/app on the production EC2)
    // Runs the compiled JS output from `pnpm build` (tsc → dist/index.js)
    // Uses cluster mode so `pm2 reload` can hot-swap workers with zero downtime
    // ─────────────────────────────────────────────────────────────────────
    {
      name: "chainpaye-prod",
      script: "./dist/index.js",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      instances: 2,
      exec_mode: "cluster",
      restart_delay: 5000,
      max_restarts: 10,
      autorestart: true,
      error_file: "./logs/prod-error.log",
      out_file:   "./logs/prod-out.log",
      merge_logs: true,
    },

    // ─────────────────────────────────────────────────────────────────────
    // STAGING  (branch: stage  →  ~/staging on the staging EC2)
    // Runs TypeScript directly via tsx — no build step, fast iteration
    // Port 3001 keeps it separate from any other process on the same box
    // ─────────────────────────────────────────────────────────────────────
    {
      name: "chainpaye-staging",
      script: "pnpm",
      args: ["start"],        // runs "tsx index.ts" per package.json
      env: {
        NODE_ENV: "development",
        PORT: 3001,
      },
      restart_delay: 5000,
      max_restarts: 10,
      autorestart: true,
      error_file: "./logs/staging-error.log",
      out_file:   "./logs/staging-out.log",
      merge_logs: true,
    },
  ],
};
