// Carrega o .env antes de qualquer outro import ler process.env.
import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ensureUploadDir } from './images/upload-dir';

/** Configuração compartilhada entre o servidor e os testes e2e. */
export function configureApp(app: INestApplication) {
  const express = app as NestExpressApplication;

  // A API fica atrás do nginx (127.0.0.1), então o IP do cliente vem no X-Forwarded-For.
  // Sem isto todo mundo pareceria ser 127.0.0.1 e o limite de login valeria para a mesa inteira.
  // TRUST_PROXY = quantos proxies confiar (padrão 1: o nginx). 0 se a API for exposta direto.
  const hops = Number(process.env.TRUST_PROXY ?? 1);
  express.set('trust proxy', hops > 0 ? hops : false);

  // Cabeçalhos de segurança (nosniff, sem X-Powered-By etc.). As imagens do mestre podem
  // ser carregadas por outra origem quando o front não usa o proxy, então liberamos o CORP.
  express.use(
    helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }),
  );

  // Em produção o nginx encaminha /api/* para cá, então o prefixo bate nos dois ambientes.
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  // Imagens enviadas pelo mestre. Nome é UUID, então não dá para adivinhar.
  express.useStaticAssets(ensureUploadDir(), {
    prefix: '/api/uploads/',
    index: false,
    maxAge: '7d',
    immutable: true,
  });
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);

  // Só necessário em dev se o front não usar o proxy do Vite.
  if (process.env.CORS_ORIGIN) {
    app.enableCors({ origin: process.env.CORS_ORIGIN.split(',') });
  }

  app.enableShutdownHooks();
  // 127.0.0.1 por padrão: na VPS só o nginx enxerga a API.
  await app.listen(
    Number(process.env.PORT ?? 3100),
    process.env.HOST ?? '127.0.0.1',
  );
}

if (require.main === module) void bootstrap();
