// Postgres local para desenvolvimento, sem instalar nada (usa o pacote embedded-postgres).
// Os dados ficam em back/.pgdata. Deixe este terminal aberto enquanto desenvolve.
//
//   npm run dev:db
//
// .env correspondente:
//   DATABASE_URL="postgresql://postgres:postgres@localhost:5433/rpg?schema=public"
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

const port = Number(process.env.DEV_DB_PORT ?? 5433);
const dataDir = join(import.meta.dirname, '..', '.pgdata');
const firstRun = !existsSync(join(dataDir, 'PG_VERSION'));

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'postgres',
  port,
  persistent: true,
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  onLog: () => {},
});

if (firstRun) await pg.initialise();
await pg.start();
if (firstRun) await pg.createDatabase('rpg');

console.log(`Postgres de desenvolvimento rodando em localhost:${port} (banco "rpg").`);
if (firstRun) {
  console.log('Primeira vez: em outro terminal rode  npm run db:migrate && npm run db:seed');
}
console.log('Ctrl+C para parar.');

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
