import { Role } from '@prisma/client';
import { io, Socket } from 'socket.io-client';
import {
  as,
  Client,
  createUser,
  resetDb,
  startApp,
  TestApp,
  TINY_PNG,
} from './helpers';

interface Summon {
  id: string;
  name: string;
  hp: number;
}
interface Condition {
  id: string;
  name: string;
  exclusiveGroup: string | null;
}
interface Character {
  id: string;
  userId: string;
  classId: string;
  name: string;
  hp: number;
  hpMax: number;
  mana: number;
  manaMax: number;
  xp: number;
  level: number;
  summons: Summon[];
  conditions: Condition[];
  inventory: { id: string; name: string; qty: number }[];
}
interface Log {
  id: string;
  message: string;
  roll: number | null;
  revertible: boolean;
}
interface State {
  id: string;
  status: string;
  players: { userId: string; ready: boolean }[];
  characters: Character[];
  shownImage: { url: string } | null;
  logs: Log[];
}

const ability = async (t: TestApp, classId: string, name: string) =>
  (
    await t.prisma.ability.findUniqueOrThrow({
      where: { classId_name: { classId, name } },
    })
  ).id;

describe('Campanha, lobby e jogo (Postgres real)', () => {
  let t: TestApp;
  let master: Client;
  let kaua: Client;
  let joana: Client;
  let kauaId: string;
  let joanaId: string;

  beforeAll(async () => {
    t = await startApp();
  });
  afterAll(() => t.app.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    await createUser(t.prisma, 'matheus', Role.MASTER);
    kauaId = (await createUser(t.prisma, 'kaua', Role.PLAYER)).id;
    joanaId = (await createUser(t.prisma, 'joana', Role.PLAYER)).id;
    master = await as(t, 'matheus');
    kaua = await as(t, 'kaua');
    joana = await as(t, 'joana');
  });

  const state = async (c: Client, id: string) =>
    (await c.get(`/campaigns/${id}/state`).expect(200)).body as State;

  /** Campanha já em andamento: Kauã de Necromante, Joana de Mascareiro. */
  async function activeCampaign() {
    const { id } = (
      await master.post('/campaigns', { name: 'A Cripta' }).expect(201)
    ).body as { id: string };
    await master.post(`/campaigns/${id}/open`).expect(201);
    for (const [c, classId, name] of [
      [kaua, 'necromante', 'Morgana'],
      [joana, 'mascareiro', 'Véu'],
    ] as const) {
      await c.post(`/campaigns/${id}/join`).expect(201);
      await c.post(`/campaigns/${id}/character`, { classId, name }).expect(201);
      await c.post(`/campaigns/${id}/ready`, { ready: true }).expect(201);
    }
    await master.post(`/campaigns/${id}/start`).expect(201);
    const s = await state(master, id);
    const morgana = s.characters.find((c) => c.userId === kauaId)!;
    const veu = s.characters.find((c) => c.userId === joanaId)!;
    return { id, morgana, veu };
  }

  const charOf = async (campaignId: string, characterId: string) =>
    (await state(master, campaignId)).characters.find(
      (c) => c.id === characterId,
    )!;

  // ───────────── lobby ─────────────

  describe('lobby', () => {
    it('fluxo completo: abrir, entrar, escolher classe, pronto e começar', async () => {
      const { id } = (
        await master.post('/campaigns', { name: 'A Cripta' }).expect(201)
      ).body as { id: string };

      // em preparação: jogador não vê nem entra
      expect((await kaua.get('/campaigns/open').expect(200)).body).toEqual([]);
      await kaua.post(`/campaigns/${id}/join`).expect(403);

      await master.post(`/campaigns/${id}/open`).expect(201);
      const open = (await kaua.get('/campaigns/open').expect(200)).body as {
        id: string;
        joined: boolean;
      }[];
      expect(open).toMatchObject([{ id, joined: false }]);

      await kaua.post(`/campaigns/${id}/join`).expect(201);

      // pronto sem personagem → erro
      await kaua.post(`/campaigns/${id}/ready`, { ready: true }).expect(400);

      await kaua
        .post(`/campaigns/${id}/character`, {
          classId: 'necromante',
          name: 'Morgana',
        })
        .expect(201);
      await kaua.post(`/campaigns/${id}/ready`, { ready: true }).expect(201);

      // Joana entra mas não fica pronta → mestre não consegue começar
      await joana.post(`/campaigns/${id}/join`).expect(201);
      const blocked = await master.post(`/campaigns/${id}/start`).expect(400);
      expect((blocked.body as { message: string }).message).toContain('Joana');

      await joana
        .post(`/campaigns/${id}/character`, {
          classId: 'cacador',
          name: 'Lobo',
        })
        .expect(201);
      await joana.post(`/campaigns/${id}/ready`, { ready: true }).expect(201);

      const started = (await master.post(`/campaigns/${id}/start`).expect(201))
        .body as State;
      expect(started.status).toBe('ACTIVE');
      expect(started.characters).toHaveLength(2);
      expect(started.logs.at(-1)?.message).toBe('A aventura começou!');

      // personagem nasce com vida/mana da classe
      const morgana = started.characters.find((c) => c.name === 'Morgana')!;
      expect(morgana).toMatchObject({
        hp: 20,
        hpMax: 20,
        mana: 10,
        manaMax: 10,
      });

      // depois de começar ninguém novo entra nem sai
      await createUser(t.prisma, 'atrasado', Role.PLAYER);
      const atrasado = await as(t, 'atrasado');
      await atrasado.post(`/campaigns/${id}/join`).expect(403);
      await kaua.post(`/campaigns/${id}/leave`).expect(403);

      // a campanha ativa continua na lista do Kauã ("voltar para a aventura")
      expect(
        (await kaua.get('/campaigns/open').expect(200)).body,
      ).toMatchObject([{ id, status: 'ACTIVE', joined: true }]);
    });

    it('trocar de classe cancela o pronto; manter a classe não', async () => {
      const { id } = (
        await master.post('/campaigns', { name: 'X' }).expect(201)
      ).body as { id: string };
      await master.post(`/campaigns/${id}/open`).expect(201);
      await kaua.post(`/campaigns/${id}/join`).expect(201);
      await kaua
        .post(`/campaigns/${id}/character`, { classId: 'carrasco', name: 'A' })
        .expect(201);
      await kaua.post(`/campaigns/${id}/ready`, { ready: true }).expect(201);

      let s = (
        await kaua
          .post(`/campaigns/${id}/character`, {
            classId: 'carrasco',
            name: 'B',
          })
          .expect(201)
      ).body as State;
      expect(s.players[0].ready).toBe(true);
      expect(s.characters[0].name).toBe('B');

      s = (
        await kaua
          .post(`/campaigns/${id}/character`, {
            classId: 'mercador',
            name: 'B',
          })
          .expect(201)
      ).body as State;
      expect(s.players[0].ready).toBe(false);
      expect(s.characters[0].classId).toBe('mercador');
    });

    it('mestre remove jogador do lobby e outro mestre não mexe na campanha', async () => {
      const { id } = (
        await master.post('/campaigns', { name: 'X' }).expect(201)
      ).body as { id: string };
      await master.post(`/campaigns/${id}/open`).expect(201);
      await kaua.post(`/campaigns/${id}/join`).expect(201);

      await createUser(t.prisma, 'outro', Role.MASTER);
      const outro = await as(t, 'outro');
      await outro.del(`/campaigns/${id}/players/${kauaId}`).expect(403);
      await outro.get(`/campaigns/${id}/state`).expect(403);

      await master.del(`/campaigns/${id}/players/${kauaId}`).expect(204);
      await kaua.get(`/campaigns/${id}/state`).expect(403);
    });

    it('jogador não acessa rotas de mestre de campanha', async () => {
      await kaua.post('/campaigns', { name: 'Minha' }).expect(403);
      await kaua.get('/campaigns').expect(403);
      await master.get('/campaigns/open').expect(403);
    });
  });

  // ───────────── habilidades ─────────────

  describe('habilidades', () => {
    it('Reanimar: desconta mana, resolve o crítico e cria a criatura', async () => {
      const { morgana } = await activeCampaign();
      const reanimar = await ability(t, 'necromante', 'Reanimar');

      const res = await kaua
        .post(`/characters/${morgana.id}/abilities/${reanimar}/use`, {
          rollMode: 'manual',
          roll: 19,
          summonName: 'Esqueleto do guarda',
        })
        .expect(200);
      const log = (res.body as { log: Log }).log;
      expect(log.roll).toBe(19);
      expect(log.message).toContain('Morgana usou Reanimar (−1 mana)');
      expect(log.message).toContain('revive parcialmente consciente');
      expect(log.message).toContain('surgiu Esqueleto do guarda');

      const after = (
        await state(
          kaua,
          (
            await t.prisma.character.findUniqueOrThrow({
              where: { id: morgana.id },
            })
          ).campaignId,
        )
      ).characters.find((c) => c.id === morgana.id)!;
      expect(after.mana).toBe(9);
      expect(after.summons.map((s) => s.name)).toEqual(['Esqueleto do guarda']);
    });

    it('Necromante só mantém 1 criatura: a nova substitui a antiga', async () => {
      const { id, morgana } = await activeCampaign();
      const reanimar = await ability(t, 'necromante', 'Reanimar');
      const use = (summonName: string) =>
        kaua
          .post(`/characters/${morgana.id}/abilities/${reanimar}/use`, {
            rollMode: 'none',
            summonName,
          })
          .expect(200);

      await use('Rato');
      const second = (await use('Lobo')).body as { log: Log };
      expect(second.log.message).toContain('Rato desapareceu');

      const after = await charOf(id, morgana.id);
      expect(after.summons.map((s) => s.name)).toEqual(['Lobo']);
      expect(after.mana).toBe(8);
    });

    it('rolagem automática fica entre 1 e 20', async () => {
      const { morgana } = await activeCampaign();
      const toque = await ability(t, 'necromante', 'Toque Fúnebre');
      const res = await kaua
        .post(`/characters/${morgana.id}/abilities/${toque}/use`, {
          rollMode: 'auto',
        })
        .expect(200);
      const roll = (res.body as { log: Log }).log.roll!;
      expect(roll).toBeGreaterThanOrEqual(1);
      expect(roll).toBeLessThanOrEqual(20);
    });

    it('mana insuficiente e d20 manual inválido são recusados', async () => {
      const { morgana } = await activeCampaign();
      const sacrificio = await ability(t, 'necromante', 'Sacrifício Macabro');
      await t.prisma.character.update({
        where: { id: morgana.id },
        data: { mana: 4 },
      });
      const res = await kaua
        .post(`/characters/${morgana.id}/abilities/${sacrificio}/use`, {
          rollMode: 'none',
        })
        .expect(400);
      expect((res.body as { message: string }).message).toContain(
        'Mana insuficiente',
      );

      const reanimar = await ability(t, 'necromante', 'Reanimar');
      await kaua
        .post(`/characters/${morgana.id}/abilities/${reanimar}/use`, {
          rollMode: 'manual',
          roll: 21,
        })
        .expect(400);
    });

    it('Sacrifício Macabro exige e consome a criatura', async () => {
      const { id, morgana } = await activeCampaign();
      const sacrificio = await ability(t, 'necromante', 'Sacrifício Macabro');
      const reanimar = await ability(t, 'necromante', 'Reanimar');
      const url = `/characters/${morgana.id}/abilities/${sacrificio}/use`;

      await kaua.post(url, { rollMode: 'none' }).expect(400);

      await kaua
        .post(`/characters/${morgana.id}/abilities/${reanimar}/use`, {
          rollMode: 'none',
        })
        .expect(200);
      await kaua.post(url, { rollMode: 'none' }).expect(200);

      const after = await charOf(id, morgana.id);
      expect(after.summons).toEqual([]);
      expect(after.mana).toBe(10 - 1 - 5);
    });

    it('não dá para usar habilidade de outra classe nem na ficha de outro', async () => {
      const { morgana, veu } = await activeCampaign();
      const reanimar = await ability(t, 'necromante', 'Reanimar');
      const serenidade = await ability(
        t,
        'mascareiro',
        'Máscara da Serenidade',
      );

      await kaua
        .post(`/characters/${morgana.id}/abilities/${serenidade}/use`, {
          rollMode: 'none',
        })
        .expect(404);
      await joana
        .post(`/characters/${morgana.id}/abilities/${reanimar}/use`, {
          rollMode: 'none',
        })
        .expect(403);
      await kaua.post(`/characters/${veu.id}/adjust`, { hp: -5 }).expect(403);
      await kaua
        .post(`/characters/${morgana.id}/adjust`, { hp: 5 })
        .expect(403);
    });

    it('máscaras: o alvo só carrega uma, e a nova substitui a anterior', async () => {
      const { id, morgana, veu } = await activeCampaign();
      const serenidade = await ability(
        t,
        'mascareiro',
        'Máscara da Serenidade',
      );
      const carrasco = await ability(t, 'mascareiro', 'Máscara do Carrasco');

      await joana
        .post(`/characters/${veu.id}/abilities/${serenidade}/use`, {
          rollMode: 'none',
          targetCharacterId: morgana.id,
        })
        .expect(200);
      const res = await joana
        .post(`/characters/${veu.id}/abilities/${carrasco}/use`, {
          rollMode: 'manual',
          roll: 20,
          targetCharacterId: morgana.id,
        })
        .expect(200);
      const log = (res.body as { log: Log }).log;
      expect(log.message).toContain('Véu usou Máscara do Carrasco em Morgana');
      expect(log.message).toContain('perde o autocontrole');
      expect(log.message).toContain('substituiu Máscara da Serenidade');

      let target = await charOf(id, morgana.id);
      expect(target.conditions.map((c) => c.name)).toEqual([
        'Máscara do Carrasco',
      ]);

      // desfazer a segunda máscara devolve a primeira
      await master.post(`/logs/${log.id}/revert`).expect(200);
      target = await charOf(id, morgana.id);
      expect(target.conditions.map((c) => c.name)).toEqual([
        'Máscara da Serenidade',
      ]);
      expect((await charOf(id, veu.id)).mana).toBe(10 - 1);
    });

    it('alvo fora da party fica só no texto do log', async () => {
      const { id, veu } = await activeCampaign();
      const vazia = await ability(t, 'mascareiro', 'Máscara Vazia');
      const res = await joana
        .post(`/characters/${veu.id}/abilities/${vazia}/use`, {
          rollMode: 'none',
          target: 'o guarda da ponte',
        })
        .expect(200);
      expect((res.body as { log: Log }).log.message).toContain(
        'em o guarda da ponte',
      );
      const s = await state(master, id);
      expect(s.characters.every((c) => c.conditions.length === 0)).toBe(true);
    });

    it('habilidade só funciona com a aventura em andamento', async () => {
      const { id } = (
        await master.post('/campaigns', { name: 'X' }).expect(201)
      ).body as { id: string };
      await master.post(`/campaigns/${id}/open`).expect(201);
      await kaua.post(`/campaigns/${id}/join`).expect(201);
      const s = (
        await kaua
          .post(`/campaigns/${id}/character`, {
            classId: 'necromante',
            name: 'M',
          })
          .expect(201)
      ).body as State;
      const reanimar = await ability(t, 'necromante', 'Reanimar');
      await kaua
        .post(`/characters/${s.characters[0].id}/abilities/${reanimar}/use`, {
          rollMode: 'none',
        })
        .expect(403);
    });
  });

  // ───────────── mestre: ajustes e desfazer ─────────────

  describe('ajustes do mestre e desfazer', () => {
    it('dano respeita o limite e desfazer devolve só o que foi tirado', async () => {
      const { id, morgana } = await activeCampaign();

      const dmg = (
        await master
          .post(`/characters/${morgana.id}/adjust`, {
            hp: -30,
            reason: 'mordida do lobo',
          })
          .expect(200)
      ).body as { log: Log };
      expect(dmg.log.message).toBe(
        'Morgana recebeu 30 de dano (vida 0/20) — caiu! — mordida do lobo',
      );
      expect((await charOf(id, morgana.id)).hp).toBe(0);

      // cura no meio do caminho
      await master
        .post(`/characters/${morgana.id}/adjust`, { hp: 3 })
        .expect(200);

      await master.post(`/logs/${dmg.log.id}/revert`).expect(200);
      expect((await charOf(id, morgana.id)).hp).toBe(20); // 3 + 20 = 23, limitado a 20

      // não desfaz duas vezes
      await master.post(`/logs/${dmg.log.id}/revert`).expect(400);
      // jogador não desfaz
      await kaua.post(`/logs/${dmg.log.id}/revert`).expect(403);

      const logs = (await state(kaua, id)).logs;
      expect(logs.find((l) => l.id === dmg.log.id)?.revertible).toBe(false);
      expect(logs.at(-1)?.message).toContain('Desfeito: Morgana recebeu 30');
    });

    it('mana, XP e nível', async () => {
      const { id, morgana } = await activeCampaign();
      await master
        .post(`/characters/${morgana.id}/adjust`, {
          mana: -4,
          xp: 50,
          level: 1,
        })
        .expect(200);
      expect(await charOf(id, morgana.id)).toMatchObject({
        mana: 6,
        xp: 50,
        level: 2,
      });
      await master.post(`/characters/${morgana.id}/adjust`, {}).expect(400);
    });

    it('desfazer o Reanimar que substituiu a criatura traz a antiga de volta', async () => {
      const { id, morgana } = await activeCampaign();
      const reanimar = await ability(t, 'necromante', 'Reanimar');
      const url = `/characters/${morgana.id}/abilities/${reanimar}/use`;
      await kaua
        .post(url, { rollMode: 'none', summonName: 'Rato' })
        .expect(200);
      const second = (
        await kaua
          .post(url, { rollMode: 'none', summonName: 'Lobo' })
          .expect(200)
      ).body as { log: Log };

      await master.post(`/logs/${second.log.id}/revert`).expect(200);
      const after = await charOf(id, morgana.id);
      expect(after.summons.map((s) => s.name)).toEqual(['Rato']);
      expect(after.mana).toBe(9);
    });

    it('ficha: mestre muda vida máxima, jogador só as anotações', async () => {
      const { id, morgana } = await activeCampaign();
      await kaua.patch(`/characters/${morgana.id}`, { hpMax: 99 }).expect(403);
      await kaua
        .patch(`/characters/${morgana.id}`, { notes: 'Odeia ratos' })
        .expect(200);
      await master
        .patch(`/characters/${morgana.id}`, { hpMax: 12 })
        .expect(200);
      expect(await charOf(id, morgana.id)).toMatchObject({
        hpMax: 12,
        hp: 12,
        notes: 'Odeia ratos',
      });
    });
  });

  // ───────────── invocações, condições, inventário ─────────────

  describe('extras da ficha', () => {
    it('invocação: dano pelo mestre e remoção pelo dono, com desfazer', async () => {
      const { id, morgana } = await activeCampaign();
      await kaua
        .post(`/characters/${morgana.id}/summons`, { name: 'Corvo', hpMax: 5 })
        .expect(201);
      let ch = await charOf(id, morgana.id);
      const corvo = ch.summons[0];

      await kaua.post(`/summons/${corvo.id}/adjust`, { hp: -2 }).expect(403);
      await master.post(`/summons/${corvo.id}/adjust`, { hp: -2 }).expect(200);
      expect((await charOf(id, morgana.id)).summons[0].hp).toBe(3);

      const removed = (await kaua.del(`/summons/${corvo.id}`).expect(200))
        .body as { log: Log };
      expect((await charOf(id, morgana.id)).summons).toEqual([]);

      await master.post(`/logs/${removed.log.id}/revert`).expect(200);
      ch = await charOf(id, morgana.id);
      expect(ch.summons).toMatchObject([
        { id: corvo.id, name: 'Corvo', hp: 3 },
      ]);
    });

    it('condições e inventário', async () => {
      const { id, morgana, veu } = await activeCampaign();
      await master
        .post(`/characters/${veu.id}/conditions`, {
          name: 'Envenenado',
          duration: '3 turnos',
        })
        .expect(201);
      // jogador não põe condição na ficha de outro
      await kaua
        .post(`/characters/${veu.id}/conditions`, { name: 'X' })
        .expect(403);

      const cond = (await charOf(id, veu.id)).conditions[0];
      await joana.del(`/conditions/${cond.id}`).expect(200);
      expect((await charOf(id, veu.id)).conditions).toEqual([]);

      await kaua
        .post(`/characters/${morgana.id}/items`, { name: 'Tocha', qty: 3 })
        .expect(201);
      const item = (await charOf(id, morgana.id)).inventory[0];
      await kaua.patch(`/items/${item.id}`, { qty: 1 }).expect(200);
      expect((await charOf(id, morgana.id)).inventory[0].qty).toBe(1);
      await joana.del(`/items/${item.id}`).expect(403);
      await kaua.del(`/items/${item.id}`).expect(200);
      expect((await charOf(id, morgana.id)).inventory).toEqual([]);
    });

    it('dados e narração', async () => {
      const { id } = await activeCampaign();
      const roll = (
        await kaua
          .post(`/campaigns/${id}/roll`, {
            sides: 20,
            value: 17,
            label: 'Percepção',
          })
          .expect(201)
      ).body as { log: Log };
      expect(roll.log.message).toBe(
        'Morgana rolou d20: 17 (dado físico) — Percepção',
      );
      await kaua
        .post(`/campaigns/${id}/roll`, { sides: 6, value: 7 })
        .expect(400);
      await kaua.post(`/campaigns/${id}/note`, { message: 'oi' }).expect(403);
      await master
        .post(`/campaigns/${id}/note`, { message: 'Uma porta range ao longe.' })
        .expect(201);
      expect((await state(kaua, id)).logs.at(-1)?.message).toBe(
        'Uma porta range ao longe.',
      );
    });
  });

  // ───────────── imagens ─────────────

  describe('imagens', () => {
    it('mestre envia, mostra e oculta; jogador vê pelo estado', async () => {
      const { id } = await activeCampaign();
      await kaua
        .upload(`/campaigns/${id}/images`, 'file', TINY_PNG, 'mapa.png')
        .expect(403);
      await master
        .upload(`/campaigns/${id}/images`, 'file', Buffer.from('oi'), 'x.txt')
        .expect(400);

      const img = (
        await master
          .upload(
            `/campaigns/${id}/images`,
            'file',
            TINY_PNG,
            'mapa da cripta.png',
          )
          .expect(201)
      ).body as { id: string; title: string; url: string };
      expect(img.title).toBe('mapa da cripta');

      await master
        .post(`/campaigns/${id}/show-image`, { imageId: img.id })
        .expect(204);
      const s = await state(kaua, id);
      expect(s.shownImage?.url).toBe(img.url);

      // o arquivo é servido
      const file = await kaua.get(img.url.replace('/api', '')).expect(200);
      expect(file.headers['content-type']).toContain('image/png');

      await master.post(`/campaigns/${id}/hide-image`).expect(204);
      expect((await state(kaua, id)).shownImage).toBeNull();

      await master
        .post(`/campaigns/${id}/show-image`, { imageId: img.id })
        .expect(204);
      await master.del(`/images/${img.id}`).expect(204);
      expect((await state(kaua, id)).shownImage).toBeNull();
    });
  });

  // ───────────── tempo real ─────────────

  describe('websocket', () => {
    const sockets: Socket[] = [];
    afterEach(() => sockets.splice(0).forEach((s) => s.disconnect()));

    const connect = (token: string) =>
      new Promise<Socket>((resolve, reject) => {
        const s = io(t.url, {
          auth: { token },
          transports: ['websocket'],
          reconnection: false,
        });
        sockets.push(s);
        s.on('connect', () => resolve(s));
        s.on('connect_error', reject);
      });

    const join = (s: Socket, campaignId: string) =>
      s.emitWithAck('campaign:join', { campaignId }) as Promise<{
        ok: boolean;
      }>;

    it('token inválido não conecta', async () => {
      await expect(connect('lixo')).rejects.toThrow('unauthorized');
    });

    it('membros recebem estado e log; quem é de fora não entra na sala', async () => {
      const { id, morgana } = await activeCampaign();
      const joanaSocket = await connect(joana.token);
      expect(await join(joanaSocket, id)).toEqual({ ok: true });

      await createUser(t.prisma, 'curioso', Role.PLAYER);
      const curioso = await as(t, 'curioso');
      const outsider = await connect(curioso.token);
      expect(await join(outsider, id)).toEqual({ ok: false });
      const leaked: string[] = [];
      outsider.onAny((event: string) => leaked.push(event));

      const gotState = new Promise<State>((r) =>
        joanaSocket.once('campaign:state', r),
      );
      const gotLog = new Promise<Log>((r) => joanaSocket.once('log:new', r));

      await master
        .post(`/characters/${morgana.id}/adjust`, { hp: -5 })
        .expect(200);

      const s = await gotState;
      expect(s.characters.find((c) => c.id === morgana.id)?.hp).toBe(15);
      expect((await gotLog).message).toContain('Morgana recebeu 5 de dano');
      expect(leaked).toEqual([]);
    });

    it('jogadores são avisados quando um lobby abre', async () => {
      const kauaSocket = await connect(kaua.token);
      const changed = new Promise<void>((r) =>
        kauaSocket.once('campaigns:changed', () => r()),
      );
      const { id } = (
        await master.post('/campaigns', { name: 'Nova' }).expect(201)
      ).body as { id: string };
      await master.post(`/campaigns/${id}/open`).expect(201);
      await changed;
    });
  });
});
