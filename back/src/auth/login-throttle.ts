import type { ThrottlerModuleOptions } from '@nestjs/throttler';

/**
 * Limite de tentativas no POST /auth/login, por IP (só o login: o resto da API,
 * que a mesa usa o tempo todo, não é limitado).
 *
 * Duas janelas: a curta segura quem chuta senha em rajada; a longa segura quem
 * espalha as tentativas. Folgado de propósito: a mesa inteira pode entrar do mesmo
 * wifi (mesmo IP), cada um errando a senha uma ou duas vezes.
 */
export const LOGIN_LIMITS = {
  short: { ttl: 60_000, limit: 10 },
  long: { ttl: 15 * 60_000, limit: 30 },
} as const;

export const loginThrottlerOptions = (): ThrottlerModuleOptions => ({
  throttlers: [
    { name: 'short', ...LOGIN_LIMITS.short },
    { name: 'long', ...LOGIN_LIMITS.long },
  ],
  // A tela de login mostra o `message` da resposta.
  errorMessage:
    'Muitas tentativas de login. Aguarde alguns minutos e tente de novo.',
  // Lido a cada requisição. Os testes e2e fazem dezenas de logins do mesmo IP,
  // então o global-setup liga isto; o teste do próprio limite desliga.
  skipIf: () => process.env.THROTTLE_DISABLED === '1',
});
