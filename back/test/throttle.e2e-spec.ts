import { INestApplication } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { LOGIN_LIMITS } from '../src/auth/login-throttle';
import { hashPassword } from '../src/auth/password';
import { configureApp } from '../src/main';
import { PrismaService } from '../src/prisma/prisma.service';
import { FakePrisma } from './fake-prisma';

process.env.JWT_SECRET = 'segredo-de-teste';

describe('Limite de login e cabeçalhos de segurança (e2e)', () => {
  let app: INestApplication<App>;
  const savedFlag = process.env.THROTTLE_DISABLED;

  // Cada "cliente" chega pelo nginx, que põe o IP real no X-Forwarded-For.
  const tryLogin = (ip: string, password: string) =>
    request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-For', ip)
      .send({ username: 'kaua', password });

  beforeAll(() => {
    // O global-setup desliga o limite para os outros testes; aqui ele é o assunto.
    delete process.env.THROTTLE_DISABLED;
  });

  afterAll(() => {
    if (savedFlag !== undefined) process.env.THROTTLE_DISABLED = savedFlag;
  });

  beforeEach(async () => {
    const db = new FakePrisma();
    db.addUser('kaua', await hashPassword('1234'), Role.PLAYER);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(db)
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
  });

  afterEach(() => app.close());

  it('bloqueia o IP depois de muitas tentativas, com mensagem em português', async () => {
    for (let i = 0; i < LOGIN_LIMITS.short.limit; i++) {
      await tryLogin('9.9.9.1', 'errada').expect(401);
    }
    const res = await tryLogin('9.9.9.1', 'errada').expect(429);
    expect((res.body as { message: string }).message).toMatch(
      /Muitas tentativas/,
    );
    // bloqueado também com a senha certa: o limite vem antes da conferência
    await tryLogin('9.9.9.1', '1234').expect(429);
  });

  it('o limite é por IP: outro cliente continua entrando', async () => {
    for (let i = 0; i <= LOGIN_LIMITS.short.limit; i++) {
      await tryLogin('9.9.9.1', 'errada');
    }
    await tryLogin('9.9.9.2', '1234').expect(200);
  });

  it('só o login é limitado: quem já tem token segue usando a API', async () => {
    const ok = await tryLogin('9.9.9.2', '1234').expect(200);
    const token = (ok.body as { accessToken: string }).accessToken;

    for (let i = 0; i <= LOGIN_LIMITS.short.limit; i++) {
      await tryLogin('9.9.9.1', 'errada');
    }
    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('X-Forwarded-For', '9.9.9.1')
        .auth(token, { type: 'bearer' })
        .expect(200);
    }
  });

  it('manda os cabeçalhos do helmet e não entrega o X-Powered-By', async () => {
    const res = await request(app.getHttpServer()).get('/api/auth/me');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
