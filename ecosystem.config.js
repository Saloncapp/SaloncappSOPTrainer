module.exports = {
  apps: [
    {
      name: "saloncapp-sop-trainer",
      script: "dist/index.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: process.env.PORT || "4010",
      },
      max_memory_restart: "512M",
      error_file: "./logs/sop-trainer-error.log",
      out_file: "./logs/sop-trainer-out.log",
      time: true,
    },
  ],
};
