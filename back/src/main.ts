// Carrega o .env antes de qualquer outro import ler process.env.
import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ensureUploadDir } from './images/upload-dir';

/** Configuração compartilhada entre o servidor e os testes e2e. */
export function configureApp(app: INestApplication) {
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
  (app as NestExpressApplication).useStaticAssets(ensureUploadDir(), {
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
