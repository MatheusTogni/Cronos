import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/auth/password';
import { configureApp } from '../src/main';
import { PrismaService } from '../src/prisma/prisma.service';

export interface TestApp {
  app: INestApplication<App>;
  prisma: PrismaService;
  url: string;
}

/** Sobe o app inteiro contra o Postgres de teste, escutando numa porta livre. */
export async function startApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address() as { port: number };
  return {
    app: app as unknown as INestApplication<App>,
    prisma: app.get(PrismaService),
    url: `http://127.0.0.1:${address.port}`,
  };
}

/** Limpa tudo menos as classes do seed. */
export async function resetDb(prisma: PrismaService) {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "log_entries", "inventory_items", "conditions", "summons", "characters", "campaign_players", "campaign_images", "campaigns", "users" CASCADE',
  );
}

export async function createUser(
  prisma: PrismaService,
  username: string,
  role: Role,
) {
  return prisma.user.create({
    data: {
      username,
      displayName: username[0].toUpperCase() + username.slice(1),
      role,
      passwordHash: await hashPassword('1234'),
    },
  });
}

/** Cliente HTTP já autenticado. */
export async function as(t: TestApp, username: string) {
  const res = await request(t.app.getHttpServer())
    .post('/api/auth/login')
    .send({ username, password: '1234' })
    .expect(200);
  const token = (res.body as { accessToken: string }).accessToken;
  const http = () => request(t.app.getHttpServer());
  return {
    token,
    get: (url: string) =>
      http().get(`/api${url}`).auth(token, { type: 'bearer' }),
    post: (url: string, body?: object) =>
      http()
        .post(`/api${url}`)
        .auth(token, { type: 'bearer' })
        .send(body ?? {}),
    patch: (url: string, body: object) =>
      http().patch(`/api${url}`).auth(token, { type: 'bearer' }).send(body),
    put: (url: string, body: object) =>
      http().put(`/api${url}`).auth(token, { type: 'bearer' }).send(body),
    del: (url: string) =>
      http().delete(`/api${url}`).auth(token, { type: 'bearer' }),
    upload: (url: string, field: string, buf: Buffer, name: string) =>
      http()
        .post(`/api${url}`)
        .auth(token, { type: 'bearer' })
        .attach(field, buf, name),
  };
}

export type Client = Awaited<ReturnType<typeof as>>;

/** PNG 1×1 válido. */
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
