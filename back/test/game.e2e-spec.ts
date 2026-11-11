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
  conditions: Condition[];
}
interface Npc {
  id: string;
  name: string;
  hp: number;
  hpMax: number;
  conditions: Condition[];
}
interface Condition {
  id: string;
  name: string;
  exclusiveGroup: string | null;
  polarity: string;
  turnsLeft: number | null;
  hpPerTurn: number;
  skipsTurn: boolean;
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
  pendingEffect: {
    source: string;
    conditions: { defId?: string; name?: string }[];
  } | null;
}
interface State {
  id: string;
  status: string;
  players: { userId: string; ready: boolean }[];
  characters: Character[];
  npcs: Npc[];
  shownImage: { url: string } | null;
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

      const res = await master
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
        master
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

      await master
        .post(`/characters/${veu.id}/abilities/${serenidade}/use`, {
          rollMode: 'none',
          targetCharacterId: morgana.id,
        })
        .expect(200);
      const res = await master
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
      const res = await master
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

    it('jogador só escolhe a habilidade: alvo e nome da criatura são ignorados', async () => {
      const { id, morgana, veu } = await activeCampaign();
      const carrasco = await ability(t, 'mascareiro', 'Máscara do Carrasco');
      const res = await joana
        .post(`/characters/${veu.id}/abilities/${carrasco}/use`, {
          rollMode: 'none',
          targetCharacterId: morgana.id,
          target: 'o guarda',
        })
        .expect(200);
      const msg = (res.body as { log: Log }).log.message;
      expect(msg).not.toContain('em Morgana');
      expect(msg).not.toContain('em o guarda');
      expect((await charOf(id, morgana.id)).conditions).toEqual([]);

      const reanimar = await ability(t, 'necromante', 'Reanimar');
      await kaua
        .post(`/characters/${morgana.id}/abilities/${reanimar}/use`, {
          rollMode: 'none',
          summonName: 'Dragão',
        })
        .expect(200);
      const summons = (await charOf(id, morgana.id)).summons;
      expect(summons).toHaveLength(1);
      expect(summons[0].name).not.toBe('Dragão');
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
      await master
        .post(url, { rollMode: 'none', summonName: 'Rato' })
        .expect(200);
      const second = (
        await master
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
        .post(`/characters/${veu.id}/conditions`, {
          name: 'Envenenado',
          turns: 3,
        })
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
    const toque = () => ability(t, 'necromante', 'Toque Fúnebre');
    const rosto = () => ability(t, 'mascareiro', 'Rosto Vazio');
    const next = (c: Client, id: string, body: object = {}) =>
      c.post(`/campaigns/${id}/combat/next`, body);
    const lastLog = async (id: string) =>
      (await state(master, id)).logs.at(-1)!;

    it('catálogo de condições', async () => {
      const list = (await kaua.get('/conditions').expect(200)).body as {
        id: string;
        turns: number | null;
        hpPerTurn: number;
        skipsTurn: boolean;
      }[];
      expect(list.find((d) => d.id === 'sangrando')).toMatchObject({
        turns: 3,
        hpPerTurn: -1,
      });
      expect(list.find((d) => d.id === 'incapacitado')).toMatchObject({
        skipsTurn: true,
      });
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
        .post(`/characters/${morgana.id}/abilities/${await toque()}/use`, {
          rollMode: 'none',
        })
        .expect(403);
      await next(kaua, id).expect(403);

      await next(master, id, { round: 1, turnIndex: 0 }).expect(200);
      // segundo clique com o turno antigo é recusado
      await next(master, id, { round: 1, turnIndex: 0 }).expect(409);
      s = await state(master, id);
      expect(s.combat!.currentCharacterId).toBe(morgana.id);
      expect(s.logs.at(-1)!.message).toBe(
        'Fim do turno do Mestre. Vez de Morgana.',
      );

      // vez da Morgana: Joana espera
      await joana
        .post(`/characters/${veu.id}/abilities/${await rosto()}/use`, {
          rollMode: 'none',
        })
        .expect(403);
      await next(joana, id).expect(403);
      await kaua
        .post(`/characters/${morgana.id}/abilities/${await toque()}/use`, {
          rollMode: 'none',
        })
        .expect(200);

      await next(kaua, id).expect(200);
      expect((await state(master, id)).combat!.currentCharacterId).toBe(veu.id);
      await next(joana, id).expect(200);
      s = await state(master, id);
      expect(s.combat).toMatchObject({ round: 2, currentCharacterId: null });
      expect(s.logs.at(-1)!.message).toBe(
        'Fim do turno de Véu. Rodada 2 — vez do Mestre.',
      );

      // fora de combate todo mundo age livre
      await master.post(`/campaigns/${id}/combat/end`).expect(200);
      expect((await state(master, id)).combat).toBeNull();
      await joana
        .post(`/characters/${veu.id}/abilities/${await rosto()}/use`, {
          rollMode: 'none',
        })
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

    it('sangramento: dano e duração só descontam no fim do turno de quem sangra', async () => {
      const { id, morgana } = await activeCampaign();
      await master.post(`/campaigns/${id}/combat/start`).expect(200);
      const add = await master
        .post(`/characters/${morgana.id}/conditions`, { defId: 'sangrando' })
        .expect(201);
      expect((add.body as { log: Log }).log.message).toBe(
        'Morgana está com Sangrando (3 turnos) — −1 de vida por turno',
      );
      const cond = () =>
        charOf(id, morgana.id).then((c) =>
          c.conditions.find((x) => x.name === 'Sangrando'),
        );
      expect(await cond()).toMatchObject({
        polarity: 'DEBUFF',
        turnsLeft: 3,
        hpPerTurn: -1,
      });

      await next(master, id).expect(200); // fim do mestre: nada acontece
      expect((await charOf(id, morgana.id)).hp).toBe(20);
      expect((await cond())!.turnsLeft).toBe(3);

      await next(kaua, id).expect(200); // fim da Morgana
      expect((await charOf(id, morgana.id)).hp).toBe(19);
      expect((await cond())!.turnsLeft).toBe(2);
      expect((await lastLog(id)).message).toBe(
        'Fim do turno de Morgana: Morgana sofreu 1 de dano por Sangrando (vida 19/20). Vez de Véu.',
      );

      // mais 2 turnos da Morgana (3 passes por rodada): acabou
      for (let i = 0; i < 6; i++) await next(master, id).expect(200);
      expect((await charOf(id, morgana.id)).hp).toBe(17);
      expect(await cond()).toBeUndefined();
      const ended = (await state(master, id)).logs.find((l) =>
        l.message.includes('Sangrando acabou em Morgana'),
      )!;
      expect(ended).toBeDefined();

      // desfazer o último passe traz o sangramento e a vida de volta
      await master.post(`/logs/${ended.id}/revert`).expect(200);
      expect((await charOf(id, morgana.id)).hp).toBe(18);
      expect((await cond())!.turnsLeft).toBe(1);
      expect((await state(master, id)).combat!.currentCharacterId).toBe(
        morgana.id,
      );

      // passes antigos não podem ser desfeitos
      const old = (await state(master, id)).logs.find(
        (l) => l.message === 'Fim do turno do Mestre. Vez de Morgana.',
      )!;
      await master.post(`/logs/${old.id}/revert`).expect(400);
    });

    it('incapacitado perde a vez e a condição acaba nesse turno', async () => {
      const { id, morgana, veu } = await activeCampaign();
      await master.post(`/campaigns/${id}/combat/start`).expect(200);
      await master
        .post(`/characters/${morgana.id}/conditions`, {
          defId: 'incapacitado',
        })
        .expect(201);
      await next(master, id).expect(200);
      expect((await state(master, id)).combat!.currentCharacterId).toBe(veu.id);
      expect((await lastLog(id)).message).toBe(
        'Fim do turno do Mestre: Morgana perde a vez (Incapacitado) e Incapacitado acabou em Morgana. Vez de Véu.',
      );
      expect((await charOf(id, morgana.id)).conditions).toEqual([]);
    });

    it('condição livre com valores próprios e polaridade', async () => {
      const { id, veu } = await activeCampaign();
      await master
        .post(`/characters/${veu.id}/conditions`, {
          name: 'Bênção',
          polarity: 'BUFF',
          turns: 2,
          hpPerTurn: 2,
        })
        .expect(201);
      // do catálogo, mas sem prazo (turns: null sobrescreve o padrão)
      await master
        .post(`/characters/${veu.id}/conditions`, {
          defId: 'sangrando',
          turns: null,
        })
        .expect(201);
      await master.post(`/characters/${veu.id}/conditions`, {}).expect(400);
      await master
        .post(`/characters/${veu.id}/conditions`, { defId: 'nao-existe' })
        .expect(400);
      expect((await charOf(id, veu.id)).conditions).toMatchObject([
        { name: 'Bênção', polarity: 'BUFF', turnsLeft: 2, hpPerTurn: 2 },
        { name: 'Sangrando', turnsLeft: null, hpPerTurn: -1 },
      ]);
    });
  });

  describe('inimigos, invocações e efeitos pendentes', () => {
    const next = (c: Client, id: string) =>
      c.post(`/campaigns/${id}/combat/next`);
    const npcOf = async (campaignId: string, name: string) =>
      (await state(master, campaignId)).npcs.find((n) => n.name === name);
    const logById = async (campaignId: string, logId: string) =>
      (await state(master, campaignId)).logs.find((l) => l.id === logId)!;

    it('condição em invocação desconta no fim do turno do dono', async () => {
      const { id, morgana } = await activeCampaign();
      await master
        .post(`/characters/${morgana.id}/summons`, { name: 'Corvo', hpMax: 5 })
        .expect(201);
      const corvo = (await charOf(id, morgana.id)).summons[0];
      await kaua
        .post(`/summons/${corvo.id}/conditions`, { defId: 'sangrando' })
        .expect(403);
      await master
        .post(`/summons/${corvo.id}/conditions`, {
          defId: 'sangrando',
          turns: 2,
        })
        .expect(201);

      await master.post(`/campaigns/${id}/combat/start`).expect(200);
      await next(master, id).expect(200); // fim do mestre: nada
      expect((await charOf(id, morgana.id)).summons[0].hp).toBe(5);
      await next(kaua, id).expect(200); // fim da Morgana
      let s = (await charOf(id, morgana.id)).summons[0];
      expect(s.hp).toBe(4);
      expect(s.conditions[0].turnsLeft).toBe(1);
      expect((await state(master, id)).logs.at(-1)!.message).toContain(
        'Corvo sofreu 1 de dano por Sangrando (vida 4/5)',
      );
      for (let i = 0; i < 3; i++) await next(master, id).expect(200);
      s = (await charOf(id, morgana.id)).summons[0];
      expect(s.hp).toBe(3);
      expect(s.conditions).toEqual([]);
    });

    it('mestre controla inimigos; as condições deles descontam no turno do mestre', async () => {
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
      expect(g.hp).toBe(3);
      expect(g.conditions[0].turnsLeft).toBe(1);
      expect((await state(master, id)).logs.at(-1)!.message).toBe(
        'Fim do turno do Mestre: Goblin sofreu 2 de dano por Queimando (vida 3/8). Vez de Morgana.',
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
      expect(g).toMatchObject({ id: goblin.id, hp: 3 });

      // desfazer a criação tira de cena
      await master
        .post(`/logs/${(created.body as { log: Log }).log.id}/revert`)
        .expect(200);
      expect(await npcOf(id, 'Goblin')).toBeUndefined();
    });

    it('efeito no alvo usado pelo jogador fica pendente até o mestre aplicar', async () => {
      const { id, morgana, veu } = await activeCampaign();
      const serenidade = await ability(
        t,
        'mascareiro',
        'Máscara da Serenidade',
      );
      const used = (
        await joana
          .post(`/characters/${veu.id}/abilities/${serenidade}/use`, {
            rollMode: 'none',
          })
          .expect(200)
      ).body as { log: Log };
      expect(used.log.message).toContain(
        'aguardando o mestre aplicar Máscara da Serenidade',
      );
      expect(used.log.pendingEffect).toEqual({
        source: 'Véu',
        conditions: [{ defId: 'mascara-da-serenidade' }],
      });

      await master
        .post(`/campaigns/${id}/npcs`, { name: 'Ogro', hpMax: 20 })
        .expect(201);
      const ogro = (await npcOf(id, 'Ogro'))!;

      // jogador não aplica; alvo de outra campanha/inexistente é recusado
      await joana
        .post(`/logs/${used.log.id}/apply`, { kind: 'npc', id: ogro.id })
        .expect(403);
      await master
        .post(`/logs/${used.log.id}/apply`, {
          kind: 'npc',
          id: morgana.id,
        })
        .expect(400);

      const applied = (
        await master
          .post(`/logs/${used.log.id}/apply`, { kind: 'npc', id: ogro.id })
          .expect(200)
      ).body as { log: Log };
      expect(applied.log.message).toBe(
        'Máscara da Serenidade, de Véu, aplicada em Ogro',
      );
      expect((await npcOf(id, 'Ogro'))!.conditions).toMatchObject([
        { name: 'Máscara da Serenidade', source: 'Véu' },
      ]);
      expect((await logById(id, used.log.id)).pendingEffect).toBeNull();
      // segundo clique: já foi aplicado
      await master
        .post(`/logs/${used.log.id}/apply`, { kind: 'npc', id: ogro.id })
        .expect(400);

      // desfazer a aplicação tira a máscara e devolve o pendente
      await master.post(`/logs/${applied.log.id}/revert`).expect(200);
      expect((await npcOf(id, 'Ogro'))!.conditions).toEqual([]);
      expect((await logById(id, used.log.id)).pendingEffect).not.toBeNull();

      // agora em alguém da party
      await master
        .post(`/logs/${used.log.id}/apply`, {
          kind: 'character',
          id: morgana.id,
        })
        .expect(200);
      expect(
        (await charOf(id, morgana.id)).conditions.map((c) => c.name),
      ).toEqual(['Máscara da Serenidade']);
    });

    it('mestre pode descartar o efeito pendente', async () => {
      const { id, veu } = await activeCampaign();
      const vazia = await ability(t, 'mascareiro', 'Máscara Vazia');
      const used = (
        await joana
          .post(`/characters/${veu.id}/abilities/${vazia}/use`, {
            rollMode: 'none',
          })
          .expect(200)
      ).body as { log: Log };
      await joana.del(`/logs/${used.log.id}/pending`).expect(403);
      await master.del(`/logs/${used.log.id}/pending`).expect(200);
      expect((await logById(id, used.log.id)).pendingEffect).toBeNull();
      await master.del(`/logs/${used.log.id}/pending`).expect(400);
    });

    it('crítico com condição vira pendente e, aplicado, tira a vez do alvo', async () => {
      const { id, morgana } = await activeCampaign();
      // Dilatação 20 → congelado no tempo (o jogador do Tecelão é a Joana)
      const tecelao = await t.prisma.character.update({
        where: { campaignId_userId: { campaignId: id, userId: joanaId } },
        data: { classId: 'tecelao-do-tempo' },
      });
      const dilatacao = await ability(t, 'tecelao-do-tempo', 'Dilatação');
      const used = (
        await joana
          .post(`/characters/${tecelao.id}/abilities/${dilatacao}/use`, {
            rollMode: 'manual',
            roll: 20,
          })
          .expect(200)
      ).body as { log: Log };
      expect(used.log.message).toContain('tempo congela brevemente');
      expect(used.log.message).toContain(
        'aguardando o mestre aplicar Congelado no tempo',
      );

      await master
        .post(`/logs/${used.log.id}/apply`, {
          kind: 'character',
          id: morgana.id,
        })
        .expect(200);
      await master.post(`/campaigns/${id}/combat/start`).expect(200);
      await next(master, id).expect(200);
      const s = await state(master, id);
      expect(s.combat!.currentCharacterId).toBe(tecelao.id);
      expect(s.logs.at(-1)!.message).toContain(
        'Morgana perde a vez (Congelado no tempo)',
      );

      // sem crítico na faixa: nada pendente
      const plain = (
        await joana
          .post(`/characters/${tecelao.id}/abilities/${dilatacao}/use`, {
            rollMode: 'manual',
            roll: 5,
          })
          .expect(200)
      ).body as { log: Log };
      expect(plain.log.pendingEffect).toBeNull();
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
