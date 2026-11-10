/**
 * Cria (ou redefine a senha de) um login de MESTRE direto no banco.
 * Serve para o primeiro acesso — depois disso o mestre cadastra os outros pela tela.
 *
 *   npm run create-master -- <login> <senha> ["Nome de exibição"]
 */
import 'dotenv/config';
import { PrismaClient, Role } from '@prisma/client';
import { hashPassword } from '../auth/password';

async function main() {
  const [rawUsername, password, displayName] = process.argv.slice(2);
  const username = rawUsername?.trim().toLowerCase();

  if (!username || !password) {
    console.error(
      'Uso: npm run create-master -- <login> <senha> ["Nome de exibição"]',
    );
    process.exit(1);
  }
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
    console.error(
      'Login inválido: use de 3 a 30 caracteres (letras minúsculas, números, ponto, hífen ou _).',
    );
    process.exit(1);
  }
  if (password.length < 4) {
    console.error('A senha deve ter pelo menos 4 caracteres.');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const passwordHash = await hashPassword(password);
    const existing = await prisma.user.findUnique({ where: { username } });

    await prisma.user.upsert({
      where: { username },
      create: {
        username,
        passwordHash,
        displayName: displayName ?? username,
        role: Role.MASTER,
      },
      update: {
        passwordHash,
        role: Role.MASTER,
        active: true,
        ...(displayName ? { displayName } : {}),
      },
    });

    console.log(
      existing
        ? `✔ Login "${username}" atualizado: agora é mestre, está ativo e com a senha nova.`
        : `✔ Mestre "${username}" criado.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main();
