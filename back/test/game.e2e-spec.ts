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
import { SHOP_ITEMS } from '../src/game/shop';

interface Summon {
  id: string;
  name: string;
  hp: number;
  conditions: Condition[];
}
interface Npc {
  id: string;
  name: string;
  band: string;
  /** Só o mestre recebe vida e anotações. */
  hp?: number;
  hpMax?: number;
  notes?: string;
  conditions: Condition[];
}
interface Condition {
  id: string;
  name: string;
  polarity: string;
  source: string | null;
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
  gold: number;
  xp: number;
  level: number;
  summons: Summon[];
  conditions: Condition[];
  inventory: { id: string; name: string; qty: number; code: string | null }[];
}
/** Oferta de doação ou troca, como o app a recebe. */
interface Offer {
  id: string;
  kind: string;
  status: string;
  from: { id: string; name: string };
  to: { id: string; name: string };
  give: { name: string; qty: number } | null;
  gold: number;
  ask: { name: string; qty: number } | null;
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
  npcs: Npc[];
  shownImage: { url: string } | null;
  shopOpen: boolean;
  combat: {
    round: number;
    turnIndex: number;
    order: string[];
    currentCharacterId: string | null;
  } | null;
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
        level: 1,
        hp: 30,
        hpMax: 30,
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
    /** O jogador diz na mesa o que faz e toca na skill: o app só gasta a mana e registra. */
    const use = (c: Client, characterId: string, abilityId: string) =>
      c.post(`/characters/${characterId}/abilities/${abilityId}/use`);
    const logOf = (res: { body: unknown }) => (res.body as { log: Log }).log;

    it('usar a skill só gasta a mana e registra no log, igual para o mestre e para o jogador', async () => {
      const { id, morgana } = await activeCampaign();
      const reanimar = await ability(t, 'necromante', 'Reanimar');

      const log = logOf(await use(kaua, morgana.id, reanimar).expect(200));
      expect(log.message).toBe('Morgana usou Reanimar (−1 mana)');
      expect(log.roll).toBeNull();
      expect(log.revertible).toBe(true);
      expect(log).not.toHaveProperty('pendingAction');
      expect(log).not.toHaveProperty('pendingEffect');

      const after = await charOf(id, morgana.id);
      expect(after.mana).toBe(9);
      expect(after.hp).toBe(30);
      expect(after.summons).toEqual([]);
      expect(after.conditions).toEqual([]);

      for (const c of [master, kaua, joana]) {
        const entry = (await state(c, id)).logs.find((l) => l.id === log.id)!;
        expect(entry.message).toBe('Morgana usou Reanimar (−1 mana)');
      }
    });

    it('nenhuma skill resolve nada sozinha: sem dano, condição ou criatura', async () => {
      const { id, morgana, veu } = await activeCampaign();
      await master
        .post(`/campaigns/${id}/npcs`, { name: 'Goblin', hpMax: 20 })
        .expect(201);
      const goblin = (await state(master, id)).npcs[0];

      // a 2ª e a 3ª skill só abrem com o nível; aqui os dois já passaram do 5
      for (const c of [morgana, veu]) {
        await t.prisma.character.update({
          where: { id: c.id },
          data: { level: 5 },
        });
      }

      // as que antes causavam dano, aplicavam condição ou criavam criatura
      const voz = await ability(t, 'necromante', 'Voz dos Mortos');
      const reanimar = await ability(t, 'necromante', 'Reanimar');
      const carrasco = await ability(t, 'mascareiro', 'Máscara do Carrasco');
      await use(kaua, morgana.id, reanimar).expect(200);
      await use(kaua, morgana.id, voz).expect(200);
      await use(joana, veu.id, carrasco).expect(200);

      const s = await state(master, id);
      expect(s.npcs[0]).toMatchObject({
        id: goblin.id,
        hp: 20,
        conditions: [],
      });
      const m = s.characters.find((c) => c.id === morgana.id)!;
      const v = s.characters.find((c) => c.id === veu.id)!;
      expect(m).toMatchObject({ mana: 10 - 1 - 3, hp: 30, summons: [] });
      expect(v).toMatchObject({ mana: 10 - 2, hp: 30 });
      expect([...m.conditions, ...v.conditions]).toEqual([]);
    });

    it('não existe ataque básico: toda classe tem só as 3 skills', async () => {
      expect(await t.prisma.ability.count({ where: { kind: 'BASIC' } })).toBe(
        0,
      );
      const classes = (await kaua.get('/classes').expect(200)).body as {
        id: string;
        abilities: { name: string; kind: string; unlockLevel: number }[];
      }[];
      expect(classes).toHaveLength(9);
      for (const c of classes) {
        expect(c.abilities).toHaveLength(3);
        expect(c.abilities.every((a) => a.kind === 'SKILL')).toBe(true);
        // 1ª skill desde o início, 2ª no nível 5, 3ª no nível 10
        expect(c.abilities.map((a) => a.unlockLevel)).toEqual([1, 5, 10]);
      }
    });

    it('mana insuficiente é recusada e nada é cobrado', async () => {
      const { id, morgana } = await activeCampaign();
      const sacrificio = await ability(t, 'necromante', 'Sacrifício Macabro');
      const reanimar = await ability(t, 'necromante', 'Reanimar');
      await t.prisma.character.update({
        where: { id: morgana.id },
        data: { mana: 4, level: 10 }, // a 3ª skill abre no nível 10
      });
      const res = await use(kaua, morgana.id, sacrificio).expect(400);
      expect((res.body as { message: string }).message).toContain(
        'Mana insuficiente',
      );
      expect((await charOf(id, morgana.id)).mana).toBe(4);

      // uma que cabe passa; gasta até zerar
      await use(kaua, morgana.id, reanimar).expect(200);
      expect((await charOf(id, morgana.id)).mana).toBe(3);
    });

    it('o mestre desfaz o uso e a mana volta, uma vez só', async () => {
      const { id, morgana } = await activeCampaign();
      const reanimar = await ability(t, 'necromante', 'Reanimar');
      const log = logOf(await use(kaua, morgana.id, reanimar).expect(200));
      expect((await charOf(id, morgana.id)).mana).toBe(9);

      await kaua.post(`/logs/${log.id}/revert`).expect(403);
      await master.post(`/logs/${log.id}/revert`).expect(200);
      expect((await charOf(id, morgana.id)).mana).toBe(10);
      await master.post(`/logs/${log.id}/revert`).expect(400);
    });

    it('não dá para usar habilidade de outra classe nem na ficha de outro', async () => {
      const { morgana, veu } = await activeCampaign();
      const reanimar = await ability(t, 'necromante', 'Reanimar');
      const serenidade = await ability(
        t,
        'mascareiro',
        'Máscara da Serenidade',
      );

      await use(kaua, morgana.id, serenidade).expect(404);
      await use(joana, morgana.id, reanimar).expect(403);
      await kaua.post(`/characters/${veu.id}/adjust`, { hp: -5 }).expect(403);
      await kaua
        .post(`/characters/${morgana.id}/adjust`, { hp: 5 })
        .expect(403);
    });

    it('quem está caído (0 de vida) não usa habilidade', async () => {
      const { morgana } = await activeCampaign();
      const reanimar = await ability(t, 'necromante', 'Reanimar');
      await master
        .post(`/characters/${morgana.id}/adjust`, { hp: -50 })
        .expect(200);
      const res = await use(kaua, morgana.id, reanimar).expect(400);
      expect((res.body as { message: string }).message).toContain(
        'está caído e não pode agir',
      );
      // curado, volta a agir
      await master
        .post(`/characters/${morgana.id}/adjust`, { hp: 5 })
        .expect(200);
      await use(kaua, morgana.id, reanimar).expect(200);
    });

    it('só a 1ª skill vem liberada: a 2ª abre no nível 5 e a 3ª no nível 10', async () => {
      const { id, morgana } = await activeCampaign();
      const reanimar = await ability(t, 'necromante', 'Reanimar');
      const voz = await ability(t, 'necromante', 'Voz dos Mortos');
      const sacrificio = await ability(t, 'necromante', 'Sacrifício Macabro');
      const levelUp = async (by: number) =>
        logOf(
          await master
            .post(`/characters/${morgana.id}/adjust`, { level: by })
            .expect(200),
        );

      await use(kaua, morgana.id, reanimar).expect(200);
      const locked2 = await use(kaua, morgana.id, voz).expect(400);
      expect((locked2.body as { message: string }).message).toBe(
        'Voz dos Mortos só é liberada no nível 5 e Morgana está no nível 1',
      );
      const locked3 = await use(kaua, morgana.id, sacrificio).expect(400);
      expect((locked3.body as { message: string }).message).toContain(
        'só é liberada no nível 10',
      );
      // a recusa não cobra mana
      expect((await charOf(id, morgana.id)).mana).toBe(9);

      // no nível 4 ainda está trancada; o 5 abre a 2ª e o log avisa
      await levelUp(3);
      await use(kaua, morgana.id, voz).expect(400);
      const to5 = await levelUp(1);
      expect(to5.message).toBe(
        'Morgana subiu para o nível 5 (vida máxima +3, mana máxima +2) e liberou a habilidade Voz dos Mortos',
      );
      await use(kaua, morgana.id, voz).expect(200);
      await use(kaua, morgana.id, sacrificio).expect(400);

      // o nível 10 abre a 3ª; desfazer a subida tranca de novo
      const to10 = await levelUp(5);
      expect(to10.message).toContain('liberou a habilidade Sacrifício Macabro');
      await use(kaua, morgana.id, sacrificio).expect(200);
      await master.post(`/logs/${to10.id}/revert`).expect(200);
      await use(kaua, morgana.id, sacrificio).expect(400);
      await use(kaua, morgana.id, voz).expect(200);
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
      await use(kaua, s.characters[0].id, reanimar).expect(403);
    });
  });

  // ───────────── mestre: ajustes e desfazer ─────────────

  describe('ajustes do mestre e desfazer', () => {
    it('dano respeita o limite e desfazer devolve só o que foi tirado', async () => {
      const { id, morgana } = await activeCampaign();

      const dmg = (
        await master
          .post(`/characters/${morgana.id}/adjust`, {
            hp: -50,
            reason: 'mordida do lobo',
          })
          .expect(200)
      ).body as { log: Log };
      expect(dmg.log.message).toBe(
        'Morgana recebeu 50 de dano (vida 0/30) — caiu! — mordida do lobo',
      );
      expect((await charOf(id, morgana.id)).hp).toBe(0);

      // cura no meio do caminho
      await master
        .post(`/characters/${morgana.id}/adjust`, { hp: 3 })
        .expect(200);

      await master.post(`/logs/${dmg.log.id}/revert`).expect(200);
      expect((await charOf(id, morgana.id)).hp).toBe(30); // 3 + 30 = 33, limitado a 30

      // não desfaz duas vezes
      await master.post(`/logs/${dmg.log.id}/revert`).expect(400);
      // jogador não desfaz
      await kaua.post(`/logs/${dmg.log.id}/revert`).expect(403);

      const logs = (await state(kaua, id)).logs;
      expect(logs.find((l) => l.id === dmg.log.id)?.revertible).toBe(false);
      expect(logs.at(-1)?.message).toContain('Desfeito: Morgana recebeu 50');
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
        mana: 8, // 10 − 4 + 2 do nível
        manaMax: 12,
        xp: 50,
        level: 2,
        hpMax: 33,
        hp: 33,
      });
      await master.post(`/characters/${morgana.id}/adjust`, {}).expect(400);
    });

    it('subir de nível dá +3 de vida e +2 de mana, máximas e atuais; descer tira; desfazer devolve', async () => {
      const { id, morgana } = await activeCampaign();
      await master
        .post(`/characters/${morgana.id}/adjust`, { hp: -10, mana: -4 })
        .expect(200);
      const up = (
        await master
          .post(`/characters/${morgana.id}/adjust`, { level: 2 })
          .expect(200)
      ).body as { log: Log };
      expect(up.log.message).toBe(
        'Morgana subiu para o nível 3 (vida máxima +6, mana máxima +4)',
      );
      expect(await charOf(id, morgana.id)).toMatchObject({
        level: 3,
        hpMax: 36,
        hp: 26, // 20 + 6
        manaMax: 14,
        mana: 10, // 6 + 4
      });

      await master.post(`/logs/${up.log.id}/revert`).expect(200);
      expect(await charOf(id, morgana.id)).toMatchObject({
        level: 1,
        hpMax: 30,
        hp: 20,
        manaMax: 10,
        mana: 6,
      });

      // descer de nível tira a vida máxima e a atual não passa dela
      await master
        .post(`/characters/${morgana.id}/adjust`, { hp: 10 })
        .expect(200);
      await master
        .post(`/characters/${morgana.id}/adjust`, { level: 3 })
        .expect(200);
      const down = (
        await master
          .post(`/characters/${morgana.id}/adjust`, { level: -3 })
          .expect(200)
      ).body as { log: Log };
      expect(down.log.message).toContain('(vida máxima −9, mana máxima −6)');
      expect(await charOf(id, morgana.id)).toMatchObject({
        level: 1,
        hpMax: 30,
        manaMax: 10,
      });
    });

    it('o nível vai de 1 a 15: não passa do limite nem desce do 1', async () => {
      const { id, morgana } = await activeCampaign();

      // pedir mais do que cabe sobe só até o 15, e o log mostra o que de fato mudou
      const up = (
        await master
          .post(`/characters/${morgana.id}/adjust`, { level: 20 })
          .expect(200)
      ).body as { log: Log };
      expect(up.log.message).toBe(
        'Morgana subiu para o nível 15 (vida máxima +42, mana máxima +28) e liberou as habilidades Voz dos Mortos e Sacrifício Macabro',
      );
      expect(await charOf(id, morgana.id)).toMatchObject({
        level: 15,
        hpMax: 72, // 30 + 14 × 3
        hp: 72,
        manaMax: 38, // 10 + 14 × 2
        mana: 38,
      });

      // no 15 só subir de nível é recusado; XP junto com o nível passa e o nível fica
      const max = await master
        .post(`/characters/${morgana.id}/adjust`, { level: 1 })
        .expect(400);
      expect((max.body as { message: string }).message).toBe(
        'Morgana já está no nível máximo (15)',
      );
      const xp = (
        await master
          .post(`/characters/${morgana.id}/adjust`, { xp: 20, level: 1 })
          .expect(200)
      ).body as { log: Log };
      expect(xp.log.message).toBe('Morgana ganhou 20 de XP');
      expect(await charOf(id, morgana.id)).toMatchObject({
        level: 15,
        xp: 20,
      });

      // desfazer a subida devolve o nível 1 e as máximas de antes
      await master.post(`/logs/${up.log.id}/revert`).expect(200);
      expect(await charOf(id, morgana.id)).toMatchObject({
        level: 1,
        hpMax: 30,
        manaMax: 10,
      });
      const min = await master
        .post(`/characters/${morgana.id}/adjust`, { level: -1 })
        .expect(400);
      expect((min.body as { message: string }).message).toBe(
        'Morgana já está no nível 1',
      );
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
    it('invocação: só o mestre cria, fere e remove, com desfazer', async () => {
      const { id, morgana } = await activeCampaign();
      await kaua
        .post(`/characters/${morgana.id}/summons`, { name: 'Corvo', hpMax: 5 })
        .expect(403);
      await master
        .post(`/characters/${morgana.id}/summons`, { name: 'Corvo', hpMax: 5 })
        .expect(201);
      let ch = await charOf(id, morgana.id);
      const corvo = ch.summons[0];

      await kaua.post(`/summons/${corvo.id}/adjust`, { hp: -2 }).expect(403);
      await master.post(`/summons/${corvo.id}/adjust`, { hp: -2 }).expect(200);
      expect((await charOf(id, morgana.id)).summons[0].hp).toBe(3);

      await kaua.patch(`/summons/${corvo.id}`, { name: 'X' }).expect(403);
      await kaua.del(`/summons/${corvo.id}`).expect(403);
      const removed = (await master.del(`/summons/${corvo.id}`).expect(200))
        .body as { log: Log };
      expect((await charOf(id, morgana.id)).summons).toEqual([]);

      await master.post(`/logs/${removed.log.id}/revert`).expect(200);
      ch = await charOf(id, morgana.id);
      expect(ch.summons).toMatchObject([
        { id: corvo.id, name: 'Corvo', hp: 3 },
      ]);
    });

    it('condições e inventário: só o mestre mexe, o jogador só vê', async () => {
      const { id, morgana, veu } = await activeCampaign();
      await master
        .post(`/characters/${veu.id}/conditions`, { name: 'Envenenado' })
        .expect(201);
      // jogador não põe condição em ninguém, nem em si mesmo
      await kaua
        .post(`/characters/${veu.id}/conditions`, { name: 'X' })
        .expect(403);
      await joana
        .post(`/characters/${veu.id}/conditions`, { name: 'X' })
        .expect(403);

      const cond = (await charOf(id, veu.id)).conditions[0];
      await joana.del(`/conditions/${cond.id}`).expect(403);
      await master.del(`/conditions/${cond.id}`).expect(200);
      expect((await charOf(id, veu.id)).conditions).toEqual([]);

      await kaua
        .post(`/characters/${morgana.id}/items`, { name: 'Tocha', qty: 3 })
        .expect(403);
      await master
        .post(`/characters/${morgana.id}/items`, { name: 'Tocha', qty: 3 })
        .expect(201);
      // o dono vê o item na ficha
      const item = (await state(kaua, id)).characters.find(
        (c) => c.id === morgana.id,
      )!.inventory[0];
      expect(item).toMatchObject({ name: 'Tocha', qty: 3 });

      await kaua.patch(`/items/${item.id}`, { qty: 1 }).expect(403);
      await master.patch(`/items/${item.id}`, { qty: 1 }).expect(200);
      expect((await charOf(id, morgana.id)).inventory[0].qty).toBe(1);
      await kaua.del(`/items/${item.id}`).expect(403);
      await master.del(`/items/${item.id}`).expect(200);
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

  describe('combate e condições', () => {
    const voz = () => ability(t, 'necromante', 'Voz dos Mortos');
    const reanimar = () => ability(t, 'necromante', 'Reanimar');
    const serenidade = () => ability(t, 'mascareiro', 'Máscara da Serenidade');
    const next = (c: Client, id: string, body: object = {}) =>
      c.post(`/campaigns/${id}/combat/next`, body);
    const lastLog = async (id: string) =>
      (await state(master, id)).logs.at(-1)!;

    it('catálogo de condições: só nome, descrição e polaridade', async () => {
      const list = (await kaua.get('/conditions').expect(200)).body as Record<
        string,
        unknown
      >[];
      expect(list.find((d) => d.id === 'sangrando')).toMatchObject({
        name: 'Sangrando',
        polarity: 'DEBUFF',
      });
      // prazo e efeito por turno não existem: quem decide é o mestre
      for (const d of list) {
        for (const key of [
          'turns',
          'hpPerTurn',
          'skipsTurn',
          'exclusiveGroup',
        ]) {
          expect(d).not.toHaveProperty(key);
        }
      }
    });

    it('o combate abre no mestre e cada jogador só age e passa no próprio turno', async () => {
      const { id, morgana, veu } = await activeCampaign();
      await kaua.post(`/campaigns/${id}/combat/start`).expect(403);
      await master.post(`/campaigns/${id}/combat/start`).expect(200);
      await master.post(`/campaigns/${id}/combat/start`).expect(400);

      let s = await state(kaua, id);
      expect(s.combat).toEqual({
        round: 1,
        turnIndex: 0,
        order: [morgana.id, veu.id],
        currentCharacterId: null,
      });

      // turno do mestre: ninguém usa habilidade nem passa a vez dele
      await kaua
        .post(`/characters/${morgana.id}/abilities/${await voz()}/use`)
        .expect(403);
      await next(kaua, id).expect(403);

      await next(master, id, { round: 1, turnIndex: 0 }).expect(200);
      // segundo clique com o turno antigo é recusado
      await next(master, id, { round: 1, turnIndex: 0 }).expect(409);
      s = await state(master, id);
      expect(s.combat!.currentCharacterId).toBe(morgana.id);
      expect(s.logs.at(-1)!.message).toBe(
        'O mundo termina de reagir. O foco passa a Morgana.',
      );

      // vez da Morgana: Joana espera
      await joana
        .post(`/characters/${veu.id}/abilities/${await serenidade()}/use`)
        .expect(403);
      await next(joana, id).expect(403);
      await kaua
        .post(`/characters/${morgana.id}/abilities/${await reanimar()}/use`)
        .expect(200);

      await next(kaua, id).expect(200);
      expect((await state(master, id)).combat!.currentCharacterId).toBe(veu.id);
      await next(joana, id).expect(200);
      s = await state(master, id);
      expect(s.combat).toMatchObject({ round: 2, currentCharacterId: null });
      expect(s.logs.at(-1)!.message).toBe(
        'Véu passa a vez. Rodada 2 — o mundo reage.',
      );

      // fora de combate todo mundo age livre
      await master.post(`/campaigns/${id}/combat/end`).expect(200);
      expect((await state(master, id)).combat).toBeNull();
      await joana
        .post(`/characters/${veu.id}/abilities/${await serenidade()}/use`)
        .expect(200);
      await next(master, id).expect(403);
    });

    it('mestre reordena e quem está com a vez continua com ela', async () => {
      const { id, morgana, veu } = await activeCampaign();
      await master.post(`/campaigns/${id}/combat/start`).expect(200);
      await next(master, id).expect(200); // vez da Morgana
      await master
        .put(`/campaigns/${id}/combat/order`, { characterIds: [morgana.id] })
        .expect(400);
      await kaua
        .put(`/campaigns/${id}/combat/order`, {
          characterIds: [veu.id, morgana.id],
        })
        .expect(403);
      await master
        .put(`/campaigns/${id}/combat/order`, {
          characterIds: [veu.id, morgana.id],
        })
        .expect(200);
      const s = await state(master, id);
      expect(s.combat).toMatchObject({
        order: [veu.id, morgana.id],
        turnIndex: 2,
        currentCharacterId: morgana.id,
      });
    });

    it('condição é só status: passar o turno não mexe em vida, duração nem na vez', async () => {
      const { id, morgana, veu } = await activeCampaign();
      await master.post(`/campaigns/${id}/combat/start`).expect(200);
      const add = await master
        .post(`/characters/${morgana.id}/conditions`, { defId: 'sangrando' })
        .expect(201);
      expect((add.body as { log: Log }).log.message).toBe(
        'Morgana está com Sangrando',
      );
      // "perde a vez" também não pula mais ninguém
      await master
        .post(`/characters/${veu.id}/conditions`, { defId: 'incapacitado' })
        .expect(201);

      await next(master, id).expect(200); // o mundo
      expect((await lastLog(id)).message).toBe(
        'O mundo termina de reagir. O foco passa a Morgana.',
      );
      await next(kaua, id).expect(200); // Morgana
      expect((await charOf(id, morgana.id)).hp).toBe(30);
      expect((await state(master, id)).combat!.currentCharacterId).toBe(veu.id);
      expect((await lastLog(id)).message).toBe(
        'Morgana passa a vez. O foco passa a Véu.',
      );

      // mais uma rodada e meia: as condições seguem onde estão
      for (let i = 0; i < 4; i++) await next(master, id).expect(200);
      expect((await charOf(id, morgana.id)).hp).toBe(30);
      expect(
        (await charOf(id, morgana.id)).conditions.map((c) => c.name),
      ).toEqual(['Sangrando']);
      expect((await charOf(id, veu.id)).conditions.map((c) => c.name)).toEqual([
        'Incapacitado',
      ]);

      // só o mestre tira
      const cond = (await charOf(id, morgana.id)).conditions[0];
      await kaua.del(`/conditions/${cond.id}`).expect(403);
      const removed = await master.del(`/conditions/${cond.id}`).expect(200);
      expect((removed.body as { log: Log }).log.message).toBe(
        'Morgana não está mais com Sangrando',
      );
      expect((await charOf(id, morgana.id)).conditions).toEqual([]);

      // desfazer a passagem mais recente do turno vale; as antigas não
      const old = (await state(master, id)).logs.find(
        (l) =>
          l.message === 'O mundo termina de reagir. O foco passa a Morgana.',
      )!;
      await master.post(`/logs/${old.id}/revert`).expect(400);
    });

    it('quem está caído (0 de vida) perde a vez e volta quando é curado', async () => {
      const { id, morgana, veu } = await activeCampaign();
      await master
        .post(`/characters/${morgana.id}/adjust`, { hp: -50 })
        .expect(200);
      await master.post(`/campaigns/${id}/combat/start`).expect(200);
      await next(master, id).expect(200);
      expect((await state(master, id)).combat!.currentCharacterId).toBe(veu.id);
      expect((await lastLog(id)).message).toBe(
        'O mundo termina de reagir: Morgana está caído e perde a vez. O foco passa a Véu.',
      );

      // curada, Morgana volta a ter a vez na rodada seguinte
      await next(joana, id).expect(200);
      await master
        .post(`/characters/${morgana.id}/adjust`, { hp: 5 })
        .expect(200);
      await next(master, id).expect(200);
      expect((await state(master, id)).combat!.currentCharacterId).toBe(
        morgana.id,
      );
    });

    it('condição livre com nome, descrição e polaridade; prazo e efeito não existem', async () => {
      const { id, veu } = await activeCampaign();
      await master
        .post(`/characters/${veu.id}/conditions`, {
          name: 'Bênção',
          polarity: 'BUFF',
          description: 'Abençoada pela lua',
        })
        .expect(201);
      await master
        .post(`/characters/${veu.id}/conditions`, { defId: 'sangrando' })
        .expect(201);
      await master.post(`/characters/${veu.id}/conditions`, {}).expect(400);
      await master
        .post(`/characters/${veu.id}/conditions`, { defId: 'nao-existe' })
        .expect(400);
      // turnos, vida por turno e "perde a vez" saíram: o mestre é quem manda
      for (const extra of [
        { turns: 2 },
        { hpPerTurn: -1 },
        { skipsTurn: true },
      ]) {
        await master
          .post(`/characters/${veu.id}/conditions`, { name: 'X', ...extra })
          .expect(400);
      }
      expect((await charOf(id, veu.id)).conditions).toMatchObject([
        { name: 'Bênção', polarity: 'BUFF' },
        { name: 'Sangrando', polarity: 'DEBUFF' },
      ]);
    });
  });

  describe('inimigos e invocações', () => {
    const next = (c: Client, id: string) =>
      c.post(`/campaigns/${id}/combat/next`);
    const npcOf = async (campaignId: string, name: string) =>
      (await state(master, campaignId)).npcs.find((n) => n.name === name);

    it('condição em invocação: só o mestre põe e ela fica até ser tirada', async () => {
      const { id, morgana } = await activeCampaign();
      await master
        .post(`/characters/${morgana.id}/summons`, { name: 'Corvo', hpMax: 5 })
        .expect(201);
      const corvo = (await charOf(id, morgana.id)).summons[0];
      await kaua
        .post(`/summons/${corvo.id}/conditions`, { defId: 'sangrando' })
        .expect(403);
      await master
        .post(`/summons/${corvo.id}/conditions`, { defId: 'sangrando' })
        .expect(201);

      // uma rodada inteira: a vida e a condição do corvo não mudam sozinhas
      await master.post(`/campaigns/${id}/combat/start`).expect(200);
      await next(master, id).expect(200); // o mundo
      await next(kaua, id).expect(200); // Morgana
      await next(joana, id).expect(200); // Véu
      const s = (await charOf(id, morgana.id)).summons[0];
      expect(s.hp).toBe(5);
      expect(s.conditions).toHaveLength(1);

      await joana.del(`/conditions/${s.conditions[0].id}`).expect(403);
      await master.del(`/conditions/${s.conditions[0].id}`).expect(200);
      expect((await charOf(id, morgana.id)).summons[0].conditions).toEqual([]);
    });

    it('mestre controla inimigos; as condições deles ficam até o mestre tirar', async () => {
      const { id } = await activeCampaign();
      await kaua
        .post(`/campaigns/${id}/npcs`, { name: 'Goblin', hpMax: 8 })
        .expect(403);
      const created = await master
        .post(`/campaigns/${id}/npcs`, { name: 'Goblin', hpMax: 8 })
        .expect(201);
      const goblin = (await npcOf(id, 'Goblin'))!;
      expect(goblin).toMatchObject({ hp: 8, hpMax: 8, conditions: [] });

      await kaua.post(`/npcs/${goblin.id}/adjust`, { hp: -3 }).expect(403);
      await master.post(`/npcs/${goblin.id}/adjust`, { hp: -3 }).expect(200);
      expect((await npcOf(id, 'Goblin'))!.hp).toBe(5);

      await master
        .post(`/npcs/${goblin.id}/conditions`, { defId: 'queimando' })
        .expect(201);
      await master.post(`/campaigns/${id}/combat/start`).expect(200);
      await next(master, id).expect(200);
      let g = (await npcOf(id, 'Goblin'))!;
      expect(g.hp).toBe(5); // o fim do turno do mundo não queima ninguém
      expect(g.conditions).toHaveLength(1);
      expect((await state(master, id)).logs.at(-1)!.message).toBe(
        'O mundo termina de reagir. O foco passa a Morgana.',
      );

      // condição de inimigo: jogador não remove, mestre remove
      await joana.del(`/conditions/${g.conditions[0].id}`).expect(403);
      await master.del(`/conditions/${g.conditions[0].id}`).expect(200);

      // remover e desfazer traz o inimigo de volta, com a vida
      const removed = await master.del(`/npcs/${goblin.id}`).expect(200);
      expect(await npcOf(id, 'Goblin')).toBeUndefined();
      await master
        .post(`/logs/${(removed.body as { log: Log }).log.id}/revert`)
        .expect(200);
      g = (await npcOf(id, 'Goblin'))!;
      expect(g).toMatchObject({ id: goblin.id, hp: 5 });

      // desfazer a criação tira de cena
      await master
        .post(`/logs/${(created.body as { log: Log }).log.id}/revert`)
        .expect(200);
      expect(await npcOf(id, 'Goblin')).toBeUndefined();
    });

    it('o jogador vê só a faixa de saúde do inimigo; vida e anotações são do mestre', async () => {
      const { id } = await activeCampaign();
      await master
        .post(`/campaigns/${id}/npcs`, { name: 'Goblin', hpMax: 8 })
        .expect(201);
      const goblin = (await npcOf(id, 'Goblin'))!;
      await master
        .patch(`/npcs/${goblin.id}`, { notes: 'foge com 2 de vida' })
        .expect(200);

      // o mestre recebe os números e as anotações
      expect(await npcOf(id, 'Goblin')).toMatchObject({
        hp: 8,
        hpMax: 8,
        band: 'INTACT',
        notes: 'foge com 2 de vida',
      });

      // o jogador recebe só a faixa e as condições
      const seenBy = async (c: Client) =>
        (await state(c, id)).npcs.find((n) => n.name === 'Goblin')!;
      const seen = await seenBy(kaua);
      expect(seen).toMatchObject({ name: 'Goblin', band: 'INTACT' });
      for (const secret of ['hp', 'hpMax', 'notes']) {
        expect(seen).not.toHaveProperty(secret);
      }

      // a faixa acompanha a vida: >50%, >25%, >0 e 0
      for (const [damage, band] of [
        [-3, 'WOUNDED'], //   5/8
        [-2, 'BADLY_WOUNDED'], // 3/8
        [-2, 'NEAR_DEATH'], //    1/8
        [-1, 'DOWN'], //          0/8
      ] as const) {
        await master.post(`/npcs/${goblin.id}/adjust`, { hp: damage });
        expect((await seenBy(kaua)).band).toBe(band);
      }
    });

    it('o log do inimigo tem duas versões: o mestre lê os números, o jogador a narração', async () => {
      const { id } = await activeCampaign();
      const created = await master
        .post(`/campaigns/${id}/npcs`, { name: 'Goblin', hpMax: 8 })
        .expect(201);
      const goblin = (await npcOf(id, 'Goblin'))!;
      const hit = await master
        .post(`/npcs/${goblin.id}/adjust`, { hp: -3, reason: 'flechada' })
        .expect(200);

      // a resposta HTTP já vem na versão de quem chamou
      expect((created.body as { log: Log }).log.message).toBe(
        'Goblin entrou em cena (vida 8/8)',
      );
      expect((hit.body as { log: Log }).log.message).toBe(
        'Goblin recebeu 3 de dano (vida 5/8) — flechada',
      );

      const messages = async (c: Client) =>
        (await state(c, id)).logs.map((l) => l.message);
      expect(await messages(master)).toEqual(
        expect.arrayContaining([
          'Goblin entrou em cena (vida 8/8)',
          'Goblin recebeu 3 de dano (vida 5/8) — flechada',
        ]),
      );
      const asPlayer = await messages(kaua);
      expect(asPlayer).toEqual(
        expect.arrayContaining([
          'Goblin entrou em cena',
          'Goblin foi atingido — ferido — flechada',
        ]),
      );
      // nada de número da vida do inimigo na versão dos jogadores
      expect(asPlayer.filter((m) => m.includes('Goblin'))).not.toContainEqual(
        expect.stringMatching(/\d/),
      );
      // e o texto do mestre não vaza nem como campo à parte
      const logs = (await state(kaua, id)).logs;
      expect(JSON.stringify(logs)).not.toContain('masterMessage');
      expect(JSON.stringify(logs)).not.toContain('vida 5/8');
    });

    it('passar o turno do mundo não mexe na vida do inimigo e o log é igual para todos', async () => {
      const { id } = await activeCampaign();
      await master
        .post(`/campaigns/${id}/npcs`, { name: 'Goblin', hpMax: 8 })
        .expect(201);
      const goblin = (await npcOf(id, 'Goblin'))!;
      await master.post(`/npcs/${goblin.id}/adjust`, { hp: -3 }).expect(200);
      await master
        .post(`/npcs/${goblin.id}/conditions`, { defId: 'queimando' })
        .expect(201);
      await master.post(`/campaigns/${id}/combat/start`).expect(200);
      await next(master, id).expect(200);

      expect((await npcOf(id, 'Goblin'))!.hp).toBe(5);
      const expected = 'O mundo termina de reagir. O foco passa a Morgana.';
      expect((await state(master, id)).logs.at(-1)!.message).toBe(expected);
      expect((await state(kaua, id)).logs.at(-1)!.message).toBe(expected);
    });
  });

  describe('ouro, loja e poções', () => {
    const adjustGold = (characterId: string, amount: number) =>
      master.post(`/characters/${characterId}/adjust`, { gold: amount });
    const buy = (c: Client, characterId: string, item: string) =>
      c.post(`/characters/${characterId}/shop/buy`, { item });
    const useItem = (c: Client, itemId: string) =>
      c.post(`/items/${itemId}/use`);
    const logOf = (res: { body: unknown }) => (res.body as { log: Log }).log;
    const next = (c: Client, id: string) =>
      c.post(`/campaigns/${id}/combat/next`);
    const stackOf = async (id: string, characterId: string, code: string) =>
      (await charOf(id, characterId)).inventory.find((i) => i.code === code);
    const openShop = (id: string) =>
      master.post(`/campaigns/${id}/shop/open`).expect(200);

    it('o catálogo tem os 11 itens, com os preços combinados', () => {
      expect(SHOP_ITEMS.map((i) => [i.code, i.price])).toEqual([
        ['POTION_HEALTH', 5],
        ['POTION_MANA', 5],
        ['RATION', 3],
        ['ELIXIR_TRAVELER', 7],
        ['ANTIDOTE', 4],
        ['SMOKE_BOMB', 6],
        ['FIRE_FLASK', 8],
        ['PROTECTION_AMULET', 10],
        ['TORCH', 1],
        ['ROPE', 2],
        ['LOCKPICK', 4],
      ]);
      expect(SHOP_ITEMS.filter((i) => i.keep).map((i) => i.code)).toEqual([
        'ROPE',
        'LOCKPICK',
      ]);
    });

    it('encerrar o combate dá 3 de ouro a cada jogador, inclusive caído', async () => {
      const { id, morgana, veu } = await activeCampaign();
      await master.post(`/campaigns/${id}/combat/end`).expect(400); // sem combate
      await master
        .post(`/characters/${morgana.id}/adjust`, { hp: -50 })
        .expect(200);

      await master.post(`/campaigns/${id}/combat/start`).expect(200);
      await kaua.post(`/campaigns/${id}/combat/end`).expect(403);
      const ended = logOf(
        await master.post(`/campaigns/${id}/combat/end`).expect(200),
      );
      expect(ended.message).toBe(
        'O combate termina (1 rodada). Cada jogador recebe 3 moedas de ouro.',
      );
      expect((await charOf(id, morgana.id)).gold).toBe(3);
      expect((await charOf(id, veu.id)).gold).toBe(3);

      // outro combate soma de novo
      await master.post(`/campaigns/${id}/combat/start`).expect(200);
      await master.post(`/campaigns/${id}/combat/end`).expect(200);
      expect((await charOf(id, morgana.id)).gold).toBe(6);
    });

    it('ajuste de ouro: só o mestre, nunca abaixo de zero, com desfazer', async () => {
      const { id, morgana } = await activeCampaign();
      await kaua
        .post(`/characters/${morgana.id}/adjust`, { gold: 5 })
        .expect(403);

      const gain = logOf(await adjustGold(morgana.id, 5).expect(200));
      expect(gain.message).toBe('Morgana recebeu 5 de ouro (ouro 5)');
      expect((await charOf(id, morgana.id)).gold).toBe(5);

      const loss = logOf(await adjustGold(morgana.id, -50).expect(200));
      expect(loss.message).toBe('Morgana perdeu 50 de ouro (ouro 0)');
      expect((await charOf(id, morgana.id)).gold).toBe(0);

      await master.post(`/logs/${gain.id}/revert`).expect(200);
      expect((await charOf(id, morgana.id)).gold).toBe(0);
    });

    it('loja: só o mestre abre e fecha; fechada ou sem ouro não vende', async () => {
      const { id, morgana } = await activeCampaign();
      expect((await state(kaua, id)).shopOpen).toBe(false);
      await kaua.post(`/campaigns/${id}/shop/open`).expect(403);

      await adjustGold(morgana.id, 4).expect(200);
      const closed = await buy(kaua, morgana.id, 'POTION_HEALTH').expect(400);
      expect((closed.body as { message: string }).message).toBe(
        'A loja está fechada',
      );

      const opened = logOf(await openShop(id));
      expect(opened.message).toBe('O mercador abriu a loja.');
      await master.post(`/campaigns/${id}/shop/open`).expect(400);
      expect((await state(kaua, id)).shopOpen).toBe(true);

      const poor = await buy(kaua, morgana.id, 'POTION_HEALTH').expect(400);
      expect((poor.body as { message: string }).message).toContain(
        'Ouro insuficiente',
      );
      expect((await charOf(id, morgana.id)).gold).toBe(4);
      await buy(kaua, morgana.id, 'ITEM_QUE_NAO_EXISTE').expect(400);

      await kaua.post(`/campaigns/${id}/shop/close`).expect(403);
      await master.post(`/campaigns/${id}/shop/close`).expect(200);
      expect((await state(kaua, id)).shopOpen).toBe(false);
    });

    it('compra: cobra, cria o item com o código, soma na pilha e desfaz', async () => {
      const { id, morgana } = await activeCampaign();
      await openShop(id);
      await adjustGold(morgana.id, 10).expect(200);

      const first = logOf(
        await buy(kaua, morgana.id, 'POTION_HEALTH').expect(200),
      );
      expect(first.message).toBe('Morgana comprou Poção de Vida (−5 de ouro)');
      let ch = await charOf(id, morgana.id);
      expect(ch.gold).toBe(5);
      expect(ch.inventory).toMatchObject([
        { name: 'Poção de Vida', qty: 1, code: 'POTION_HEALTH' },
      ]);

      const second = logOf(
        await buy(kaua, morgana.id, 'POTION_HEALTH').expect(200),
      );
      ch = await charOf(id, morgana.id);
      expect(ch.gold).toBe(0);
      expect(ch.inventory).toHaveLength(1);
      expect(ch.inventory[0].qty).toBe(2);

      await master.post(`/logs/${second.id}/revert`).expect(200);
      ch = await charOf(id, morgana.id);
      expect(ch.gold).toBe(5);
      expect(ch.inventory[0].qty).toBe(1);

      await master.post(`/logs/${first.id}/revert`).expect(200);
      ch = await charOf(id, morgana.id);
      expect(ch.gold).toBe(10);
      expect(ch.inventory).toEqual([]);
    });

    it('duas compras ao mesmo tempo com ouro para uma só: só uma passa', async () => {
      const { id, morgana } = await activeCampaign();
      await openShop(id);
      await adjustGold(morgana.id, 5).expect(200);

      const res = await Promise.all([
        buy(kaua, morgana.id, 'POTION_MANA'),
        buy(kaua, morgana.id, 'POTION_MANA'),
      ]);
      expect(res.map((r) => r.status).sort()).toEqual([200, 400]);
      const ch = await charOf(id, morgana.id);
      expect(ch.gold).toBe(0);
      expect(ch.inventory).toMatchObject([{ code: 'POTION_MANA', qty: 1 }]);
    });

    it('comprar e usar item é só do dono da ficha', async () => {
      const { id, morgana, veu } = await activeCampaign();
      await openShop(id);
      await adjustGold(morgana.id, 10).expect(200);
      await adjustGold(veu.id, 10).expect(200);

      // Joana não compra na ficha da Morgana
      await buy(joana, morgana.id, 'POTION_HEALTH').expect(403);
      await buy(kaua, morgana.id, 'POTION_HEALTH').expect(200);
      const potion = (await stackOf(id, morgana.id, 'POTION_HEALTH'))!;
      await useItem(joana, potion.id).expect(403);
      expect((await stackOf(id, morgana.id, 'POTION_HEALTH'))!.qty).toBe(1);
    });

    it('poções, ração e elixir curam sozinhos, sem passar do máximo, e o mestre desfaz', async () => {
      const { id, morgana } = await activeCampaign();
      await openShop(id);
      await adjustGold(morgana.id, 40).expect(200);
      for (const code of [
        'POTION_HEALTH',
        'POTION_MANA',
        'RATION',
        'ELIXIR_TRAVELER',
      ]) {
        await buy(kaua, morgana.id, code).expect(200);
      }
      const setStats = (data: { hp?: number; mana?: number }) =>
        t.prisma.character.update({ where: { id: morgana.id }, data });
      const use = async (code: string) =>
        logOf(
          await useItem(kaua, (await stackOf(id, morgana.id, code))!.id).expect(
            200,
          ),
        );

      await setStats({ hp: 15 });
      const heal = await use('POTION_HEALTH');
      expect(heal.message).toBe(
        'Morgana usou Poção de Vida e recuperou 10 de vida (vida 25/30)',
      );
      expect((await charOf(id, morgana.id)).hp).toBe(25);
      expect(await stackOf(id, morgana.id, 'POTION_HEALTH')).toBeUndefined();

      await master.post(`/logs/${heal.id}/revert`).expect(200);
      expect((await charOf(id, morgana.id)).hp).toBe(15);
      expect(await stackOf(id, morgana.id, 'POTION_HEALTH')).toMatchObject({
        qty: 1,
      });

      await setStats({ mana: 2 });
      const mana = await use('POTION_MANA');
      expect(mana.message).toBe(
        'Morgana usou Poção de Mana e recuperou 8 de mana (mana 10/10)',
      );

      await setStats({ hp: 10 });
      await use('RATION');
      expect((await charOf(id, morgana.id)).hp).toBe(15);

      await setStats({ hp: 10, mana: 3 });
      const elixir = await use('ELIXIR_TRAVELER');
      expect(elixir.message).toBe(
        'Morgana usou Elixir do Viajante e recuperou 5 de vida e 5 de mana (vida 15/30, mana 8/10)',
      );
      const ch = await charOf(id, morgana.id);
      expect([ch.hp, ch.mana]).toEqual([15, 8]);
    });

    it('usar item segue a regra das skills: em combate só na vez, e caído não usa', async () => {
      const { id, morgana } = await activeCampaign();
      await openShop(id);
      await adjustGold(morgana.id, 10).expect(200);
      await buy(kaua, morgana.id, 'POTION_HEALTH').expect(200);
      await buy(kaua, morgana.id, 'POTION_HEALTH').expect(200);
      const potion = (await stackOf(id, morgana.id, 'POTION_HEALTH'))!;

      // turno do mundo: ninguém usa item
      await master.post(`/campaigns/${id}/combat/start`).expect(200);
      await useItem(kaua, potion.id).expect(403);
      await next(master, id).expect(200); // vez da Morgana
      // com a vida cheia o servidor deixa usar (a confirmação é do app)
      const full = logOf(await useItem(kaua, potion.id).expect(200));
      expect(full.message).toBe(
        'Morgana usou Poção de Vida e recuperou 0 de vida (vida 30/30)',
      );
      expect((await stackOf(id, morgana.id, 'POTION_HEALTH'))!.qty).toBe(1);
      await master.post(`/campaigns/${id}/combat/end`).expect(200);

      // caído não usa
      await t.prisma.character.update({
        where: { id: morgana.id },
        data: { hp: 0 },
      });
      const down = await useItem(kaua, potion.id).expect(400);
      expect((down.body as { message: string }).message).toContain(
        'está caído e não pode agir',
      );
    });

    it('itens que só registram: o mestre decide; Corda e Gazua ficam no inventário', async () => {
      const { id, morgana } = await activeCampaign();
      await openShop(id);
      await adjustGold(morgana.id, 20).expect(200);
      for (const code of ['ANTIDOTE', 'TORCH', 'ROPE', 'LOCKPICK']) {
        await buy(kaua, morgana.id, code).expect(200);
      }
      const before = await charOf(id, morgana.id);
      expect(before.gold).toBe(20 - 4 - 1 - 2 - 4);

      const antidote = logOf(
        await useItem(
          kaua,
          (await stackOf(id, morgana.id, 'ANTIDOTE'))!.id,
        ).expect(200),
      );
      expect(antidote.message).toBe('Morgana usou Antídoto');
      await useItem(kaua, (await stackOf(id, morgana.id, 'TORCH'))!.id).expect(
        200,
      );
      expect(await stackOf(id, morgana.id, 'ANTIDOTE')).toBeUndefined();
      expect(await stackOf(id, morgana.id, 'TORCH')).toBeUndefined();

      // nada além do item muda: vida, mana, ouro e condições ficam iguais
      const after = await charOf(id, morgana.id);
      expect([after.hp, after.mana, after.gold]).toEqual([
        before.hp,
        before.mana,
        before.gold,
      ]);
      expect(after.conditions).toEqual([]);

      // Corda e Gazua: o uso vai para o log, o item fica
      const rope = (await stackOf(id, morgana.id, 'ROPE'))!;
      const used = logOf(await useItem(kaua, rope.id).expect(200));
      expect(used.message).toBe('Morgana usou Corda');
      await useItem(kaua, rope.id).expect(200);
      expect((await stackOf(id, morgana.id, 'ROPE'))!.qty).toBe(1);
      expect(await stackOf(id, morgana.id, 'LOCKPICK')).toBeDefined();
    });

    it('item que o mestre deu à mão (sem código) não pode ser usado', async () => {
      const { id, morgana } = await activeCampaign();
      await master
        .post(`/characters/${morgana.id}/items`, { name: 'Chave velha' })
        .expect(201);
      const key = (await charOf(id, morgana.id)).inventory[0];
      expect(key.code).toBeNull();
      await useItem(kaua, key.id).expect(400);
    });
  });

  describe('doações e trocas', () => {
    const offer = (c: Client, fromId: string, body: object) =>
      c.post(`/characters/${fromId}/transfers`, body);
    const accept = (c: Client, transferId: string) =>
      c.post(`/transfers/${transferId}/accept`);
    const decline = (c: Client, transferId: string) =>
      c.post(`/transfers/${transferId}/decline`);
    const cancel = (c: Client, transferId: string) =>
      c.post(`/transfers/${transferId}/cancel`);
    const offerOf = (res: { body: unknown }) =>
      (res.body as { transfer: Offer }).transfer;
    const logOf = (res: { body: unknown }) => (res.body as { log: Log }).log;
    const pending = async (c: Client, campaignId: string) =>
      (
        (await c.get(`/campaigns/${campaignId}/transfers`).expect(200))
          .body as { transfers: Offer[] }
      ).transfers;
    const next = (c: Client, id: string) =>
      c.post(`/campaigns/${id}/combat/next`);
    /** Item direto no banco; com código, a descrição é igual para juntar na pilha. */
    const seed = (
      characterId: string,
      name: string,
      qty: number,
      code: string | null = null,
    ) =>
      t.prisma.inventoryItem.create({
        data: { characterId, name, qty, code, description: code ? name : null },
      });
    const qtyOf = async (id: string, characterId: string, name: string) =>
      (await charOf(id, characterId)).inventory.find((i) => i.name === name)
        ?.qty;

    it('doação de item: aceitar move a quantidade, soma na pilha e o mestre desfaz', async () => {
      const { id, morgana, veu } = await activeCampaign();
      const potion = await seed(
        morgana.id,
        'Poção de Vida',
        3,
        'POTION_HEALTH',
      );
      await seed(veu.id, 'Poção de Vida', 1, 'POTION_HEALTH');

      const sent = offerOf(
        await offer(kaua, morgana.id, {
          toCharacterId: veu.id,
          kind: 'GIFT',
          itemId: potion.id,
          qty: 2,
        }).expect(201),
      );
      expect(sent).toMatchObject({
        kind: 'GIFT',
        status: 'PENDING',
        from: { name: 'Morgana' },
        to: { name: 'Véu' },
        give: { name: 'Poção de Vida', qty: 2 },
        gold: 0,
        ask: null,
      });
      // os dois veem a oferta aberta; o mestre (sem personagem) não
      expect(await pending(kaua, id)).toHaveLength(1);
      expect(await pending(joana, id)).toHaveLength(1);
      expect(await pending(master, id)).toEqual([]);
      // nada se move antes do aceite
      expect(await qtyOf(id, morgana.id, 'Poção de Vida')).toBe(3);

      // só quem recebe aceita
      await accept(kaua, sent.id).expect(403);
      await accept(master, sent.id).expect(403);
      const done = logOf(await accept(joana, sent.id).expect(200));
      expect(done.message).toBe('Morgana deu 2× Poção de Vida a Véu');
      expect(await qtyOf(id, morgana.id, 'Poção de Vida')).toBe(1);
      const veuItems = (await charOf(id, veu.id)).inventory;
      expect(veuItems).toHaveLength(1); // somou na pilha que ela já tinha
      expect(veuItems[0].qty).toBe(3);
      expect(await pending(kaua, id)).toEqual([]);

      // o log é público e o mestre desfaz
      expect(
        (await state(kaua, id)).logs.find((l) => l.id === done.id)!.message,
      ).toBe('Morgana deu 2× Poção de Vida a Véu');
      await master.post(`/logs/${done.id}/revert`).expect(200);
      expect(await qtyOf(id, morgana.id, 'Poção de Vida')).toBe(3);
      expect(await qtyOf(id, veu.id, 'Poção de Vida')).toBe(1);
    });

    it('doação de ouro: confere o saldo, move ao aceitar e não move ao recusar', async () => {
      const { id, morgana, veu } = await activeCampaign();
      await master
        .post(`/characters/${morgana.id}/adjust`, { gold: 10 })
        .expect(200);

      const body = { toCharacterId: veu.id, kind: 'GIFT' };
      const rich = await offer(kaua, morgana.id, { ...body, gold: 99 }).expect(
        400,
      );
      expect((rich.body as { message: string }).message).toContain(
        'Ouro insuficiente',
      );
      await offer(kaua, morgana.id, { ...body, gold: 0 }).expect(400);

      const sent = offerOf(
        await offer(kaua, morgana.id, { ...body, gold: 4 }).expect(201),
      );
      expect(sent).toMatchObject({ gold: 4, give: null, ask: null });
      const done = logOf(await accept(joana, sent.id).expect(200));
      expect(done.message).toBe('Morgana deu 4 de ouro a Véu');
      expect((await charOf(id, morgana.id)).gold).toBe(6);
      expect((await charOf(id, veu.id)).gold).toBe(4);

      const refused = offerOf(
        await offer(kaua, morgana.id, { ...body, gold: 3 }).expect(201),
      );
      expect(offerOf(await decline(joana, refused.id).expect(200)).status).toBe(
        'DECLINED',
      );
      expect((await charOf(id, morgana.id)).gold).toBe(6);
      expect((await charOf(id, veu.id)).gold).toBe(4);

      await master.post(`/logs/${done.id}/revert`).expect(200);
      expect((await charOf(id, morgana.id)).gold).toBe(10);
      expect((await charOf(id, veu.id)).gold).toBe(0);
    });

    it('troca: item por item, os dois inventários mudam juntos e o mestre desfaz', async () => {
      const { id, morgana, veu } = await activeCampaign();
      const rope = await seed(morgana.id, 'Corda', 2, 'ROPE');
      const antidote = await seed(veu.id, 'Antídoto', 3, 'ANTIDOTE');

      const sent = offerOf(
        await offer(kaua, morgana.id, {
          toCharacterId: veu.id,
          kind: 'TRADE',
          itemId: rope.id,
          qty: 2,
          askItemId: antidote.id,
          askQty: 1,
        }).expect(201),
      );
      expect(sent).toMatchObject({
        kind: 'TRADE',
        give: { name: 'Corda', qty: 2 },
        ask: { name: 'Antídoto', qty: 1 },
      });

      const done = logOf(await accept(joana, sent.id).expect(200));
      expect(done.message).toBe('Morgana e Véu trocaram 2× Corda por Antídoto');
      const m = (await charOf(id, morgana.id)).inventory;
      const v = (await charOf(id, veu.id)).inventory;
      expect(m).toMatchObject([{ name: 'Antídoto', qty: 1, code: 'ANTIDOTE' }]);
      expect(v.map((i) => [i.name, i.qty]).sort()).toEqual([
        ['Antídoto', 2],
        ['Corda', 2],
      ]);

      await master.post(`/logs/${done.id}/revert`).expect(200);
      expect(await qtyOf(id, morgana.id, 'Corda')).toBe(2);
      expect(await qtyOf(id, morgana.id, 'Antídoto')).toBeUndefined();
      expect(await qtyOf(id, veu.id, 'Antídoto')).toBe(3);
      expect(await qtyOf(id, veu.id, 'Corda')).toBeUndefined();
    });

    it('recusar e cancelar: nada se move, a oferta sai da lista e só as partes certas respondem', async () => {
      const { id, morgana, veu } = await activeCampaign();
      const torch = await seed(morgana.id, 'Tocha', 2);
      const body = {
        toCharacterId: veu.id,
        kind: 'GIFT',
        itemId: torch.id,
        qty: 1,
      };

      const first = offerOf(await offer(kaua, morgana.id, body).expect(201));
      await decline(kaua, first.id).expect(403); // quem ofereceu não recusa
      await cancel(joana, first.id).expect(403); // quem recebe não cancela
      expect(offerOf(await cancel(kaua, first.id).expect(200)).status).toBe(
        'CANCELLED',
      );
      expect(await pending(joana, id)).toEqual([]);
      await accept(joana, first.id).expect(400); // já não está aberta

      const second = offerOf(await offer(kaua, morgana.id, body).expect(201));
      expect(offerOf(await decline(joana, second.id).expect(200)).status).toBe(
        'DECLINED',
      );
      await decline(joana, second.id).expect(400);
      await accept(joana, second.id).expect(400);

      expect(await qtyOf(id, morgana.id, 'Tocha')).toBe(2);
      expect(await qtyOf(id, veu.id, 'Tocha')).toBeUndefined();
    });

    it('validações: dono, destinatário, quantidades, itens de outro e uma oferta por vez', async () => {
      const { morgana, veu } = await activeCampaign();
      const torch = await seed(morgana.id, 'Tocha', 2);
      const veuRope = await seed(veu.id, 'Corda', 1, 'ROPE');
      const gift = { toCharacterId: veu.id, kind: 'GIFT', itemId: torch.id };

      // só o dono da ficha oferece (o mestre também leva 403)
      await offer(master, morgana.id, gift).expect(403);
      await offer(joana, morgana.id, gift).expect(403);

      await offer(kaua, morgana.id, {
        ...gift,
        toCharacterId: morgana.id,
      }).expect(400); // para si mesmo
      await offer(kaua, morgana.id, {
        ...gift,
        toCharacterId: '00000000-0000-4000-8000-000000000000',
      }).expect(400); // personagem que não existe
      await offer(kaua, morgana.id, { ...gift, qty: 3 }).expect(400); // só tem 2
      await offer(kaua, morgana.id, { ...gift, qty: 0 }).expect(400);
      await offer(kaua, morgana.id, { ...gift, itemId: veuRope.id }).expect(
        400,
      ); // item de outro jogador
      await offer(kaua, morgana.id, { ...gift, gold: 1 }).expect(400); // item e ouro
      await offer(kaua, morgana.id, {
        toCharacterId: veu.id,
        kind: 'GIFT',
      }).expect(400); // nem item nem ouro
      await offer(kaua, morgana.id, { ...gift, askItemId: veuRope.id }).expect(
        400,
      ); // doação não pede nada

      // troca: precisa dos dois itens, o pedido tem de existir e ouro não entra
      const trade = {
        toCharacterId: veu.id,
        kind: 'TRADE',
        itemId: torch.id,
        askItemId: veuRope.id,
      };
      await offer(kaua, morgana.id, { ...trade, askItemId: undefined }).expect(
        400,
      );
      await offer(kaua, morgana.id, { ...trade, askQty: 2 }).expect(400);
      await offer(kaua, morgana.id, { ...trade, askItemId: torch.id }).expect(
        400,
      ); // o pedido não é dela
      await offer(kaua, morgana.id, { ...trade, gold: 2 }).expect(400);

      // só uma oferta aberta por vez
      await offer(kaua, morgana.id, gift).expect(201);
      const again = await offer(kaua, morgana.id, gift).expect(400);
      expect((again.body as { message: string }).message).toContain(
        'já tem uma oferta aguardando resposta',
      );
    });

    it('em combate só quem está na vez oferece; quem recebe responde a qualquer hora', async () => {
      const { id, morgana, veu } = await activeCampaign();
      const torch = await seed(morgana.id, 'Tocha', 2);
      const gift = {
        toCharacterId: veu.id,
        kind: 'GIFT',
        itemId: torch.id,
        qty: 1,
      };

      await master.post(`/campaigns/${id}/combat/start`).expect(200);
      const world = await offer(kaua, morgana.id, gift).expect(403);
      expect((world.body as { message: string }).message).toBe(
        'Em combate só dá para oferecer na sua vez',
      );
      await next(master, id).expect(200); // vez da Morgana
      const sent = offerOf(await offer(kaua, morgana.id, gift).expect(201));
      // Véu não está na vez dela e aceita mesmo assim
      await accept(joana, sent.id).expect(200);
      expect(await qtyOf(id, veu.id, 'Tocha')).toBe(1);

      // Véu, fora da vez, não oferece
      const veuTorch = (await charOf(id, veu.id)).inventory[0];
      await offer(joana, veu.id, {
        toCharacterId: morgana.id,
        kind: 'GIFT',
        itemId: veuTorch.id,
        qty: 1,
      }).expect(403);

      // fora de combate qualquer um oferece, até caído
      await master.post(`/campaigns/${id}/combat/end`).expect(200);
      await t.prisma.character.update({
        where: { id: veu.id },
        data: { hp: 0 },
      });
      await offer(joana, veu.id, {
        toCharacterId: morgana.id,
        kind: 'GIFT',
        itemId: veuTorch.id,
        qty: 1,
      }).expect(201);
    });

    it('se algo mudou antes do aceite, a oferta cai e nada se move; dois aceites movem uma vez só', async () => {
      const { id, morgana, veu } = await activeCampaign();
      const potion = await seed(
        morgana.id,
        'Poção de Vida',
        3,
        'POTION_HEALTH',
      );
      const gift = {
        toCharacterId: veu.id,
        kind: 'GIFT',
        itemId: potion.id,
        qty: 2,
      };

      // sem reserva: Morgana fica com 1 antes de a Véu aceitar
      const stale = offerOf(await offer(kaua, morgana.id, gift).expect(201));
      await t.prisma.inventoryItem.update({
        where: { id: potion.id },
        data: { qty: 1 },
      });
      const res = await accept(joana, stale.id).expect(400);
      expect((res.body as { message: string }).message).toContain(
        'A oferta não vale mais',
      );
      expect(await pending(kaua, id)).toEqual([]);
      expect(await qtyOf(id, morgana.id, 'Poção de Vida')).toBe(1);
      expect(await qtyOf(id, veu.id, 'Poção de Vida')).toBeUndefined();

      // dois aceites ao mesmo tempo: só um passa
      await t.prisma.inventoryItem.update({
        where: { id: potion.id },
        data: { qty: 3 },
      });
      const live = offerOf(await offer(kaua, morgana.id, gift).expect(201));
      const both = await Promise.all([
        accept(joana, live.id),
        accept(joana, live.id),
      ]);
      expect(both.map((r) => r.status).sort()).toEqual([200, 400]);
      expect(await qtyOf(id, morgana.id, 'Poção de Vida')).toBe(1);
      expect(await qtyOf(id, veu.id, 'Poção de Vida')).toBe(2);
    });
  });

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

      // a campanha já foi enviada inteira antes (abrir, entrar, começar):
      // agora vai só o que mudou
      const gotPatch = new Promise<{
        id: string;
        set?: object;
        characters?: { upsert: Character[]; remove: string[] };
        npcs?: object;
      }>((r) => joanaSocket.once('campaign:patch', r));
      const gotLog = new Promise<Log>((r) => joanaSocket.once('log:new', r));

      await master
        .post(`/characters/${morgana.id}/adjust`, { hp: -5 })
        .expect(200);

      const patch = await gotPatch;
      expect(patch.id).toBe(id);
      expect(patch.set).toBeUndefined();
      expect(patch.npcs).toBeUndefined();
      expect(patch.characters!.remove).toEqual([]);
      expect(patch.characters!.upsert).toHaveLength(1);
      expect(patch.characters!.upsert[0]).toMatchObject({
        id: morgana.id,
        hp: 25,
      });
      expect((await gotLog).message).toContain('Morgana recebeu 5 de dano');
      expect(leaked).toEqual([]);
    });

    it('a sala dos jogadores não recebe a vida do inimigo nem o texto do mestre', async () => {
      const { id } = await activeCampaign();
      await master
        .post(`/campaigns/${id}/npcs`, { name: 'Goblin', hpMax: 8 })
        .expect(201);
      const goblin = (await state(master, id)).npcs[0];

      const masterSocket = await connect(master.token);
      const joanaSocket = await connect(joana.token);
      expect(await join(masterSocket, id)).toEqual({ ok: true });
      expect(await join(joanaSocket, id)).toEqual({ ok: true });

      type NpcPatch = { npcs?: { upsert: Record<string, unknown>[] } };
      const patchFor = (s: Socket) =>
        new Promise<NpcPatch>((r) => s.once('campaign:patch', r));
      const logFor = (s: Socket) =>
        new Promise<Log>((r) => s.once('log:new', r));
      const [masterPatch, joanaPatch] = [
        patchFor(masterSocket),
        patchFor(joanaSocket),
      ];
      const [masterLog, joanaLog] = [logFor(masterSocket), logFor(joanaSocket)];

      await master.post(`/npcs/${goblin.id}/adjust`, { hp: -3 }).expect(200);

      expect((await masterPatch).npcs!.upsert[0]).toMatchObject({
        id: goblin.id,
        hp: 5,
        hpMax: 8,
        band: 'WOUNDED',
      });
      const seen = (await joanaPatch).npcs!.upsert[0];
      expect(seen).toMatchObject({ id: goblin.id, band: 'WOUNDED' });
      for (const secret of ['hp', 'hpMax', 'notes']) {
        expect(seen).not.toHaveProperty(secret);
      }
      expect((await masterLog).message).toBe(
        'Goblin recebeu 3 de dano (vida 5/8)',
      );
      expect((await joanaLog).message).toBe('Goblin foi atingido — ferido');
    });

    it('a oferta de troca chega só aos dois jogadores envolvidos', async () => {
      const { id, morgana, veu } = await activeCampaign();
      const torch = await t.prisma.inventoryItem.create({
        data: { characterId: morgana.id, name: 'Tocha', qty: 1 },
      });
      const kauaSocket = await connect(kaua.token);
      const joanaSocket = await connect(joana.token);
      const masterSocket = await connect(master.token);
      for (const s of [kauaSocket, joanaSocket, masterSocket]) {
        expect(await join(s, id)).toEqual({ ok: true });
      }
      const got = (s: Socket, event: string) =>
        new Promise<Offer>((r) => s.once(event, r));
      // o mestre está na campanha, mas a oferta não é dele
      const leaked: string[] = [];
      masterSocket.onAny((event: string) => {
        if (event.startsWith('transfer:')) leaked.push(event);
      });

      const toVeu = got(joanaSocket, 'transfer:new');
      const toMorgana = got(kauaSocket, 'transfer:new');
      const sent = (
        await kaua
          .post(`/characters/${morgana.id}/transfers`, {
            toCharacterId: veu.id,
            kind: 'GIFT',
            itemId: torch.id,
            qty: 1,
          })
          .expect(201)
      ).body as { transfer: Offer };
      expect((await toVeu).give).toMatchObject({ name: 'Tocha', qty: 1 });
      expect((await toMorgana).id).toBe(sent.transfer.id);

      const updVeu = got(joanaSocket, 'transfer:updated');
      const updMorgana = got(kauaSocket, 'transfer:updated');
      await joana.post(`/transfers/${sent.transfer.id}/accept`).expect(200);
      expect((await updVeu).status).toBe('ACCEPTED');
      expect((await updMorgana).status).toBe('ACCEPTED');
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

  // ───────────── exclusão de usuário ─────────────

  describe('exclusão de usuário', () => {
    it('barra jogador em aventura ativa; depois de encerrada, apaga personagem e mantém o diário', async () => {
      const { id, morgana } = await activeCampaign();
      await kaua
        .post(`/campaigns/${id}/roll`, { sides: 20, value: 12 })
        .expect(201);
      await master.del(`/users/${kauaId}`).expect(409);

      await master.post(`/campaigns/${id}/end`).expect(201);
      const logsBefore = await t.prisma.logEntry.count({
        where: { campaignId: id },
      });
      await master.del(`/users/${kauaId}`).expect(204);

      expect(await t.prisma.user.findUnique({ where: { id: kauaId } })).toBe(
        null,
      );
      expect(
        await t.prisma.character.findUnique({ where: { id: morgana.id } }),
      ).toBe(null);
      expect(
        await t.prisma.campaignPlayer.count({ where: { userId: kauaId } }),
      ).toBe(0);
      expect(await t.prisma.logEntry.count({ where: { campaignId: id } })).toBe(
        logsBefore,
      );
    });

    it('barra quem é mestre de campanha', async () => {
      await master.post('/campaigns', { name: 'A Cripta' }).expect(201);
      const other = await createUser(t.prisma, 'outro', Role.MASTER);
      const outro = await as(t, 'outro');
      const matheus = await t.prisma.user.findUniqueOrThrow({
        where: { username: 'matheus' },
      });
      await outro.del(`/users/${matheus.id}`).expect(409);
      await outro.del(`/users/${joanaId}`).expect(204);
      await master.del(`/users/${other.id}`).expect(204);
    });
  });
});
