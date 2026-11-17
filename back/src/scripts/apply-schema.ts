/**
 * Aplica o schema.sql no banco apontado pelo .env (DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_DATABASE).
 * Serve para montar o banco de desenvolvimento pela primeira vez (o `npm run dev:db` cria o banco
 * `rpg` vazio). O schema não é idempotente: rodar de novo num banco que já tem as tabelas dá erro,
 * o que protege os dados. Para mudanças depois disso, aplique o ALTER à mão (veja docs/DEPLOY.md).
 *
 *   npm run db:schema
 */
import 'dotenv/config';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { databaseUrl } from '../prisma/database-url';

const backDir = join(__dirname, '..', '..');

try {
  // A URL vai por variável de ambiente (não por argumento) para a senha não aparecer na lista de processos.
  execSync(
    'npx prisma db execute --file schema.sql --schema prisma/schema.prisma',
    {
      cwd: backDir,
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: databaseUrl() },
    },
  );
  console.log('✔ schema.sql aplicado. Agora rode: npm run db:seed');
} catch {
  console.error(
    '✖ Não foi possível aplicar o schema.sql (o banco está de pé e as tabelas ainda não existem?).',
  );
  process.exit(1);
}
