// pm2 start ecosystem.config.cjs && pm2 save
//
// Uma instância só: as salas do Socket.IO ficam na memória do processo.
// (Para rodar em cluster seria preciso um adapter, ex.: Redis — não é o caso de uma mesa de RPG.)
module.exports = {
  apps: [
    {
      name: 'grimorio-api',
      cwd: __dirname,
      script: 'dist/main.js',
      exec_mode: 'fork',
      instances: 1,
      max_memory_restart: '300M',
      env: { NODE_ENV: 'production' },
    },
  ],
};
