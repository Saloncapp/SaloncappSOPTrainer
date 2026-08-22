const path = require("path");
const os = require("os");

// Always run from the `current` symlink, NOT the dereferenced release path.
// PM2 stores cwd as-is (it does not realpath it), so each (re)spawn follows the
// symlink to the latest release. This prevents the "atomic deploy + pm2 reload"
// bug where a reloaded process keeps running out of an old (later deleted)
// release dir.
const APP_CWD =
  process.env.PM2_APP_CWD ||
  path.join(process.env.HOME || os.homedir(), "SaloncappSOPTrainer", "current");

module.exports = {
  apps: [
    {
      name: "saloncapp-sop-trainer",
      cwd: APP_CWD,
      script: "dist/index.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: process.env.PORT || "4010",
      },
      max_memory_restart: "512M",
      kill_timeout: 8000,
      error_file: "./logs/sop-trainer-error.log",
      out_file: "./logs/sop-trainer-out.log",
      time: true,
    },
  ],
};
