module.exports = {
  apps: [
    {
      name: "auth-server",
      script: "node_modules/.bin/tsx",
      args: "server.ts",
      cwd: "./",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};