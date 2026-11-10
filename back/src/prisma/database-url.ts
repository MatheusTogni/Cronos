/**
 * URL do Prisma montada a partir de DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD e DB_DATABASE
 * (o mesmo formato de .env dos outros projetos da VPS). Se DATABASE_URL existir, ela vence
 * (os testes e2e usam).
 */
export function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const {
    DB_HOST = 'localhost',
    DB_PORT = '5432',
    DB_USERNAME = 'postgres',
    DB_PASSWORD = '',
    DB_DATABASE,
  } = process.env;
  if (!DB_DATABASE) {
    throw new Error('Defina DB_DATABASE no .env');
  }

  // encode: senha com @, :, / etc. quebraria a URL.
  const user = encodeURIComponent(DB_USERNAME);
  const password = encodeURIComponent(DB_PASSWORD);
  const database = encodeURIComponent(DB_DATABASE);
  return `postgresql://${user}:${password}@${DB_HOST}:${DB_PORT}/${database}?schema=public`;
}
