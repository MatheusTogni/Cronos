// Sobe um PostgreSQL real (embutido, sem instalar nada) para os testes e2e,
// aplica o schema.sql e carrega as classes do seed.
import { execSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

export default async function globalSetup() {
  const port = 54330 + Math.floor(Math.random() * 500);
  const dir = mkdtempSync(join(tmpdir(), 'rpg-pg-'));
  const pg = new EmbeddedPostgres({
    databaseDir: join(dir, 'data'),
    user: 'postgres',
    password: 'postgres',
    port,
    persistent: false,
    // No Windows o padrão seria WIN1252, que não aceita "−", "→" etc.
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => {},
    onError: () => {},
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('rpg_test');

  process.env.DATABASE_URL = `postgresql://postgres:postgres@localhost:${port}/rpg_test`;
  process.env.JWT_SECRET = 'segredo-de-teste';
  process.env.UPLOAD_DIR = join(dir, 'uploads');
  // Os testes fazem muitos logins do mesmo IP; o limite de login só é testado em throttle.e2e-spec.ts.
  process.env.THROTTLE_DISABLED = '1';

  const opts = { env: process.env, stdio: 'pipe' };
  execSync(
    'npx prisma db execute --file schema.sql --schema prisma/schema.prisma',
    opts,
  );
  execSync('npx prisma db seed', opts);

  globalThis.__RPG_PG__ = pg;
}
