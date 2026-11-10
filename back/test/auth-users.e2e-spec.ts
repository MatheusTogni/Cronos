import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/auth/password';
import { PrismaService } from '../src/prisma/prisma.service';
import { FakePrisma } from './fake-prisma';

process.env.JWT_SECRET = 'segredo-de-teste';

describe('Auth e usuários (e2e)', () => {
  let app: INestApplication<App>;
  let db: FakePrisma;

  const login = async (username: string, password = '1234') => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username, password })
      .expect(200);
    return (res.body as { accessToken: string }).accessToken;
  };

  beforeEach(async () => {
    db = new FakePrisma();
    const hash = await hashPassword('1234');
    db.addUser('matheus', hash, Role.MASTER);
    db.addUser('kaua', hash, Role.PLAYER);
    db.addUser('inativo', hash, Role.PLAYER, false);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(db)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(() => app.close());

  it('login devolve token e o papel do usuário', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: '  KAUA ', password: '1234' })
      .expect(200);
    const body = res.body as { accessToken: unknown; user: object };
    expect(typeof body.accessToken).toBe('string');
    expect(body.user).toMatchObject({ username: 'kaua', role: 'PLAYER' });
    expect(body.user).not.toHaveProperty('passwordHash');
  });

  it('senha errada, login inexistente e login desativado dão 401', async () => {
    const http = request(app.getHttpServer());
    for (const body of [
      { username: 'kaua', password: 'errada' },
      { username: 'ninguem', password: '1234' },
      { username: 'inativo', password: '1234' },
    ]) {
      await http.post('/api/auth/login').send(body).expect(401);
    }
  });

  it('rotas exigem token', async () => {
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
    await request(app.getHttpServer()).get('/api/classes').expect(401);
  });

  it('/auth/me devolve o usuário do token', async () => {
    const token = await login('kaua');
    const res = await request(app.getHttpServer())
      .get('/api/auth/me')
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(res.body).toMatchObject({ username: 'kaua', role: 'PLAYER' });
  });

  it('jogador recebe 403 nas rotas de usuários, mas lê as classes', async () => {
    const token = await login('kaua');
    const http = request(app.getHttpServer());
    await http.get('/api/users').auth(token, { type: 'bearer' }).expect(403);
    await http
      .post('/api/users')
      .auth(token, { type: 'bearer' })
      .send({
        username: 'hacker',
        displayName: 'x',
        password: '1234',
        role: 'MASTER',
      })
      .expect(403);
    await http.get('/api/classes').auth(token, { type: 'bearer' }).expect(200);
  });

  it('mestre cadastra jogador, que consegue logar', async () => {
    const token = await login('matheus');
    const res = await request(app.getHttpServer())
      .post('/api/users')
      .auth(token, { type: 'bearer' })
      .send({
        username: 'Joana',
        displayName: 'Joana',
        password: 'abcd',
        role: 'PLAYER',
      })
      .expect(201);
    expect(res.body).toMatchObject({ username: 'joana', role: 'PLAYER' });
    expect(res.body).not.toHaveProperty('passwordHash');

    await login('joana', 'abcd');
  });

  it('login repetido dá 409 e dados inválidos dão 400', async () => {
    const token = await login('matheus');
    const http = request(app.getHttpServer());
    await http
      .post('/api/users')
      .auth(token, { type: 'bearer' })
      .send({
        username: 'kaua',
        displayName: 'Outro',
        password: '1234',
        role: 'PLAYER',
      })
      .expect(409);
    await http
      .post('/api/users')
      .auth(token, { type: 'bearer' })
      .send({
        username: 'a b',
        displayName: '',
        password: '1',
        role: 'REI',
      })
      .expect(400);
  });

  it('desativar um login derruba o token que ele já tinha', async () => {
    const masterToken = await login('matheus');
    const playerToken = await login('kaua');
    const kaua = db.users.find((u) => u.username === 'kaua')!;

    await request(app.getHttpServer())
      .patch(`/api/users/${kaua.id}`)
      .auth(masterToken, { type: 'bearer' })
      .send({ active: false })
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .auth(playerToken, { type: 'bearer' })
      .expect(401);
  });

  it('mestre não consegue se desativar nem se rebaixar', async () => {
    const token = await login('matheus');
    const me = db.users.find((u) => u.username === 'matheus')!;
    const http = request(app.getHttpServer());
    await http
      .patch(`/api/users/${me.id}`)
      .auth(token, { type: 'bearer' })
      .send({ active: false })
      .expect(400);
    await http
      .patch(`/api/users/${me.id}`)
      .auth(token, { type: 'bearer' })
      .send({ role: 'PLAYER' })
      .expect(400);
  });

  it('troca de senha pelo mestre vale no próximo login', async () => {
    const token = await login('matheus');
    const kaua = db.users.find((u) => u.username === 'kaua')!;
    await request(app.getHttpServer())
      .patch(`/api/users/${kaua.id}`)
      .auth(token, { type: 'bearer' })
      .send({ password: 'nova-senha' })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'kaua', password: '1234' })
      .expect(401);
    await login('kaua', 'nova-senha');
  });
});
