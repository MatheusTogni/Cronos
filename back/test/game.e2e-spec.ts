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
  instability: number;
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
  pendingAction: {
    abilityName: string;
    manaCost: number;
    needsRoll: boolean;
    dealsDamage: boolean;
    target: { kind: string; name: string } | null;
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
    /** O jogador declara a habilidade (e o alvo); o d20 é do mestre. */
    const declare = (
      c: Client,
      characterId: string,
      abilityId: string,
      body: object = {},
    ) => c.post(`/characters/${characterId}/abilities/${abilityId}/use`, body);
    const logOf = (res: { body: unknown }) => (res.body as { log: Log }).log;
    const resolve = (logId: string, body: object = {}) =>
      master.post(`/logs/${logId}/resolve`, body);

    it('Reanimar: declarar cobra a mana e espera o mestre; resolver aplica o crítico e cria a criatura', async () => {
      const { id, morgana } = await activeCampaign();
      const reanimar = await ability(t, 'necromante', 'Reanimar');

      const declared = logOf(
        await declare(kaua, morgana.id, reanimar).expect(200),
      );
      expect(declared.message).toBe('Morgana usa Reanimar (−1 mana).');
      expect(declared.pendingAction).toMatchObject({
        abilityName: 'Reanimar',
        manaCost: 1,
        needsRoll: true,
        dealsDamage: false,
      });
      // a mana sai na declaração e a criatura ainda não existe
      const waiting = await charOf(id, morgana.id);
      expect(waiting.mana).toBe(9);
      expect(waiting.summons).toEqual([]);

      // só o mestre resolve, e precisa do d20
      await kaua.post(`/logs/${declared.id}/resolve`, { roll: 19 }).expect(403);
      await resolve(declared.id).expect(400);
      await resolve(declared.id, { roll: 21 }).expect(400);

      const res = logOf(
        await resolve(declared.id, {
          roll: 19,
          summonName: 'Esqueleto do guarda',
        }).expect(200),
      );
      expect(res.roll).toBe(19);
      expect(res.message).toContain('Morgana usou Reanimar');
      expect(res.message).toContain('d20: 19');
      expect(res.message).toContain('revive parcialmente consciente');
      expect(res.message).toContain('surgiu Esqueleto do guarda');

      const after = await charOf(id, morgana.id);
      expect(after.mana).toBe(9);
      expect(after.summons.map((s) => s.name)).toEqual(['Esqueleto do guarda']);

      // o jogador lê a versão narrada, sem o d20
      const asPlayer = (await state(kaua, id)).logs.find(
        (l) => l.id === res.id,
      )!;
      expect(asPlayer.roll).toBeNull();
      expect(asPlayer.message).not.toContain('d20');
      expect(asPlayer.message).toContain('revive parcialmente consciente');

      // já resolvida: não resolve nem nega de novo
      await resolve(declared.id, { roll: 5 }).expect(400);
      await master.post(`/logs/${declared.id}/deny`).expect(400);
    });

    it('Necromante só mantém 1 criatura: a nova substitui a antiga', async () => {
      const { id, morgana } = await activeCampaign();
      const reanimar = await ability(t, 'necromante', 'Reanimar');
      const summon = async (summonName: string) => {
        const declared = logOf(
          await declare(kaua, morgana.id, reanimar).expect(200),
        );
        return logOf(
          await resolve(declared.id, { roll: 5, summonName }).expect(200),
        );
      };

      await summon('Rato');
      const second = await summon('Lobo');
      expect(second.message).toContain('Rato desapareceu');

      const after = await charOf(id, morgana.id);
      expect(after.summons.map((s) => s.name)).toEqual(['Lobo']);
      expect(after.mana).toBe(8);
    });

    it('uma ação por vez; negar devolve a mana e nada acontece', async () => {
      const { id, morgana } = await activeCampaign();
      const reanimar = await ability(t, 'necromante', 'Reanimar');
      const declared = logOf(
        await declare(kaua, morgana.id, reanimar).expect(200),
      );

      // enquanto espera o mestre, não declara outra
      const again = await declare(kaua, morgana.id, reanimar).expect(400);
      expect((again.body as { message: string }).message).toContain(
        'já tem uma ação aguardando o mestre',
      );

      await joana.post(`/logs/${declared.id}/deny`).expect(403);
      const denied = logOf(
        await master.post(`/logs/${declared.id}/deny`).expect(200),
      );
      expect(denied.message).toBe(
        'Morgana não consegue usar Reanimar (a mana volta)',
      );
      const after = await charOf(id, morgana.id);
      expect(after.mana).toBe(10);
      expect(after.summons).toEqual([]);

      const entry = (await state(master, id)).logs.find(
        (l) => l.id === declared.id,
      )!;
      expect(entry.pendingAction).toBeNull();
      expect(entry.revertible).toBe(false);
      await resolve(declared.id, { roll: 5 }).expect(400);

      // livre para declarar de novo
      await declare(kaua, morgana.id, reanimar).expect(200);
    });

    it('desfazer a declaração ainda pendente também devolve a mana e fecha a ação', async () => {
      const { id, morgana } = await activeCampaign();
      const reanimar = await ability(t, 'necromante', 'Reanimar');
      const declared = logOf(
        await declare(kaua, morgana.id, reanimar).expect(200),
      );
      await master.post(`/logs/${declared.id}/revert`).expect(200);
      expect((await charOf(id, morgana.id)).mana).toBe(10);
      await resolve(declared.id, { roll: 5 }).expect(400);
    });

    it('mana insuficiente e d20 inválido são recusados', async () => {
      const { morgana } = await activeCampaign();
      const sacrificio = await ability(t, 'necromante', 'Sacrifício Macabro');
      await t.prisma.character.update({
        where: { id: morgana.id },
        data: { mana: 4 },
      });
      const res = await declare(kaua, morgana.id, sacrificio).expect(400);
      expect((res.body as { message: string }).message).toContain(
        'Mana insuficiente',
      );

      const reanimar = await ability(t, 'necromante', 'Reanimar');
      const declared = logOf(
        await declare(kaua, morgana.id, reanimar).expect(200),
      );
      await resolve(declared.id, { roll: 0 }).expect(400);
      await resolve(declared.id, { roll: 21 }).expect(400);
    });

    it('Sacrifício Macabro exige e consome a criatura (sem dado, resolve na hora)', async () => {
      const { id, morgana } = await activeCampaign();
      const sacrificio = await ability(t, 'necromante', 'Sacrifício Macabro');
      const reanimar = await ability(t, 'necromante', 'Reanimar');

      await declare(kaua, morgana.id, sacrificio).expect(400);

      const declared = logOf(
        await declare(kaua, morgana.id, reanimar).expect(200),
      );
      await resolve(declared.id, { roll: 5 }).expect(200);

      const used = logOf(
        await declare(kaua, morgana.id, sacrificio).expect(200),
      );
      expect(used.pendingAction).toBeNull();
      expect(used.message).toContain('foi sacrificada');

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

      await declare(kaua, morgana.id, serenidade).expect(404);
      await declare(joana, morgana.id, reanimar).expect(403);
      await kaua.post(`/characters/${veu.id}/adjust`, { hp: -5 }).expect(403);
      await kaua
        .post(`/characters/${morgana.id}/adjust`, { hp: 5 })
        .expect(403);
    });

    it('máscaras: o jogador escolhe o alvo, o mestre dá o d20; o alvo só carrega uma e desfazer volta ao pendente', async () => {
      const { id, morgana, veu } = await activeCampaign();
      const serenidade = await ability(
        t,
        'mascareiro',
        'Máscara da Serenidade',
      );
      const carrasco = await ability(t, 'mascareiro', 'Máscara do Carrasco');
      const onMorgana = { target: { kind: 'character', id: morgana.id } };

      const first = logOf(
        await declare(joana, veu.id, serenidade, onMorgana).expect(200),
      );
      await resolve(first.id, { roll: 5 }).expect(200);
      const second = logOf(
        await declare(joana, veu.id, carrasco, onMorgana).expect(200),
      );
      const res = logOf(await resolve(second.id, { roll: 20 }).expect(200));
      expect(res.message).toContain('Véu usou Máscara do Carrasco em Morgana');
      expect(res.message).toContain('perde o autocontrole');
      expect(res.message).toContain('substituiu Máscara da Serenidade');

      let target = await charOf(id, morgana.id);
      expect(target.conditions.map((c) => c.name)).toEqual([
        'Máscara do Carrasco',
      ]);

      // desfazer a resolução devolve a primeira máscara e a ação volta a esperar o mestre
      await master.post(`/logs/${res.id}/revert`).expect(200);
      target = await charOf(id, morgana.id);
      expect(target.conditions.map((c) => c.name)).toEqual([
        'Máscara da Serenidade',
      ]);
      const reopened = (await state(master, id)).logs.find(
        (l) => l.id === second.id,
      )!;
      expect(reopened.pendingAction).not.toBeNull();
      expect((await charOf(id, veu.id)).mana).toBe(10 - 1 - 2);

      // a declaração resolvida não se desfaz sozinha (só a resolução)
      await master.post(`/logs/${first.id}/revert`).expect(400);

      // negar a ação reaberta devolve a mana dela
      await master.post(`/logs/${second.id}/deny`).expect(200);
      expect((await charOf(id, veu.id)).mana).toBe(10 - 1);
    });

    it('o alvo precisa existir na campanha e habilidade de alvo exige um', async () => {
      const { veu } = await activeCampaign();
      const vazia = await ability(t, 'mascareiro', 'Máscara Vazia');
      const sem = await declare(joana, veu.id, vazia).expect(400);
      expect((sem.body as { message: string }).message).toBe('Escolha o alvo');
      await declare(joana, veu.id, vazia, {
        target: { kind: 'npc', id: '00000000-0000-4000-8000-000000000000' },
      }).expect(400);
      await declare(joana, veu.id, vazia, {
        target: { kind: 'character' },
      }).expect(400);
    });

    it('efeito em aliado ou em si resolve na hora; em inimigo espera a confirmação do mestre', async () => {
      const { id, morgana, veu } = await activeCampaign();
      const vazia = await ability(t, 'mascareiro', 'Máscara Vazia'); // sem faixa de crítico
      await t.prisma.character.update({
        where: { id: veu.id },
        data: { mana: 10 },
      });

      const ally = logOf(
        await declare(joana, veu.id, vazia, {
          target: { kind: 'character', id: morgana.id },
        }).expect(200),
      );
      expect(ally.pendingAction).toBeNull();
      expect(ally.message).toContain('Máscara Vazia aplicada em Morgana');
      expect((await charOf(id, morgana.id)).conditions).toHaveLength(1);

      await master
        .post(`/campaigns/${id}/npcs`, { name: 'Ogro', hpMax: 20 })
        .expect(201);
      const ogro = (await state(master, id)).npcs[0];
      const enemy = logOf(
        await declare(joana, veu.id, vazia, {
          target: { kind: 'npc', id: ogro.id },
        }).expect(200),
      );
      expect(enemy.pendingAction).toMatchObject({
        needsRoll: false,
        target: { kind: 'npc', name: 'Ogro' },
      });
      expect((await state(master, id)).npcs[0].conditions).toEqual([]);

      // sem dado: o mestre só confirma
      await resolve(enemy.id).expect(200);
      expect((await state(master, id)).npcs[0].conditions).toMatchObject([
        { name: 'Máscara Vazia', source: 'Véu' },
      ]);
    });

    it('ataque: o d20 do mestre vira o dano no inimigo, e o jogador só vê a faixa de saúde', async () => {
      const { id, morgana, veu } = await activeCampaign();
      const toque = await ability(t, 'necromante', 'Toque Fúnebre');
      await master
        .post(`/campaigns/${id}/npcs`, { name: 'Goblin', hpMax: 20 })
        .expect(201);
      const goblin = (await state(master, id)).npcs[0];
      const hitGoblin = { target: { kind: 'npc', id: goblin.id } };

      // ataque pede um inimigo como alvo
      await declare(kaua, morgana.id, toque).expect(400);
      await declare(kaua, morgana.id, toque, {
        target: { kind: 'character', id: veu.id },
      }).expect(400);

      const declared = logOf(
        await declare(kaua, morgana.id, toque, hitGoblin).expect(200),
      );
      expect(declared.message).toBe('Morgana usa Toque Fúnebre em Goblin.');
      expect(declared.pendingAction).toMatchObject({
        needsRoll: true,
        dealsDamage: true,
        target: { kind: 'npc', name: 'Goblin' },
      });
      await resolve(declared.id).expect(400); // sem d20 não resolve

      const res = logOf(await resolve(declared.id, { roll: 7 }).expect(200));
      expect(res.message).toBe(
        'Morgana usou Toque Fúnebre em Goblin · d20: 7 → 7 de dano em Goblin (vida 13/20)',
      );
      expect((await state(master, id)).npcs[0]).toMatchObject({
        hp: 13,
        band: 'WOUNDED',
      });
      const asPlayer = await state(kaua, id);
      expect(asPlayer.npcs[0]).toMatchObject({ band: 'WOUNDED' });
      expect(asPlayer.npcs[0]).not.toHaveProperty('hp');
      expect(asPlayer.logs.find((l) => l.id === res.id)).toMatchObject({
        message:
          'Morgana usou Toque Fúnebre em Goblin — Goblin foi atingido — ferido',
        roll: null,
      });

      // desfazer devolve a vida do inimigo e reabre a ação
      await master.post(`/logs/${res.id}/revert`).expect(200);
      expect((await state(master, id)).npcs[0].hp).toBe(20);
      const reopened = (await state(master, id)).logs.find(
        (l) => l.id === declared.id,
      )!;
      expect(reopened.pendingAction).not.toBeNull();

      // um 20 derruba o goblin de 20 de vida
      const killed = logOf(
        await resolve(declared.id, { roll: 20 }).expect(200),
      );
      expect(killed.message).toContain('(vida 0/20) — caiu!');
      expect((await state(kaua, id)).npcs[0].band).toBe('DOWN');
    });

    it('quem está caído (0 de vida) não usa habilidade', async () => {
      const { morgana } = await activeCampaign();
      const reanimar = await ability(t, 'necromante', 'Reanimar');
      await master
        .post(`/characters/${morgana.id}/adjust`, { hp: -50 })
        .expect(200);
      const res = await declare(kaua, morgana.id, reanimar).expect(400);
      expect((res.body as { message: string }).message).toContain(
        'está caído e não pode agir',
      );
      // curado, volta a agir
      await master
        .post(`/characters/${morgana.id}/adjust`, { hp: 5 })
        .expect(200);
      await declare(kaua, morgana.id, reanimar).expect(200);
    });

    it('Tudo ou Nada pergunta o que se aposta; a resposta vai no log', async () => {
      const { id, veu } = await activeCampaign();
      await t.prisma.character.update({
        where: { campaignId_userId: { campaignId: id, userId: joanaId } },
        data: { classId: 'apostador' },
      });
      const tudo = await ability(t, 'apostador', 'Tudo ou Nada');
      const sem = await declare(joana, veu.id, tudo).expect(400);
      expect((sem.body as { message: string }).message).toBe(
        'O que você aposta?',
      );
      const used = logOf(
        await declare(joana, veu.id, tudo, { note: 'a própria sorte' }).expect(
          200,
        ),
      );
      expect(used.pendingAction).toBeNull();
      expect(used.message).toBe(
        'Véu usou Tudo ou Nada (−2 mana) — "a própria sorte"',
      );
    });

    it('Tecelão: cada uso soma instabilidade e, no limite, vem o paradoxo e zera', async () => {
      const { id } = await activeCampaign();
      const tecelao = await t.prisma.character.update({
        where: { campaignId_userId: { campaignId: id, userId: joanaId } },
        data: { classId: 'tecelao-do-tempo' },
      });
      const dilatacao = await ability(t, 'tecelao-do-tempo', 'Dilatação');

      const first = logOf(
        await declare(joana, tecelao.id, dilatacao).expect(200),
      );
      expect((await charOf(id, tecelao.id)).instability).toBe(1);
      await resolve(first.id, { roll: 5 }).expect(200);

      await t.prisma.character.update({
        where: { id: tecelao.id },
        data: { instability: 4 },
      });
      const last = logOf(
        await declare(joana, tecelao.id, dilatacao).expect(200),
      );
      expect(last.message).toContain(
        'Paradoxo! O tempo se rasga ao redor de Véu.',
      );
      expect((await charOf(id, tecelao.id)).instability).toBe(0);

      // negar a declaração devolve a instabilidade que ela tinha antes
      await master.post(`/logs/${last.id}/deny`).expect(200);
      expect((await charOf(id, tecelao.id)).instability).toBe(4);
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
      await declare(kaua, s.characters[0].id, reanimar).expect(403);
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
        mana: 6,
        xp: 50,
        level: 2,
        hpMax: 32,
        hp: 32,
      });
      await master.post(`/characters/${morgana.id}/adjust`, {}).expect(400);
    });

    it('subir de nível dá +2 de vida máxima e atual; descer tira; desfazer devolve', async () => {
      const { id, morgana } = await activeCampaign();
      await master
        .post(`/characters/${morgana.id}/adjust`, { hp: -10 })
        .expect(200);
      const up = (
        await master
          .post(`/characters/${morgana.id}/adjust`, { level: 2 })
          .expect(200)
      ).body as { log: Log };
      expect(up.log.message).toBe(
        'Morgana subiu para o nível 3 (vida máxima +4)',
      );
      expect(await charOf(id, morgana.id)).toMatchObject({
        level: 3,
        hpMax: 34,
        hp: 24, // 20 + 4
      });

      await master.post(`/logs/${up.log.id}/revert`).expect(200);
      expect(await charOf(id, morgana.id)).toMatchObject({
        level: 1,
        hpMax: 30,
        hp: 20,
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
      expect(down.log.message).toContain('(vida máxima −6)');
      expect(await charOf(id, morgana.id)).toMatchObject({
        level: 1,
        hpMax: 30,
      });
    });

    it('desfazer o Reanimar que substituiu a criatura traz a antiga de volta', async () => {
      const { id, morgana } = await activeCampaign();
      const reanimar = await ability(t, 'necromante', 'Reanimar');
      const summon = async (summonName: string) => {
        const declared = (
          await kaua
            .post(`/characters/${morgana.id}/abilities/${reanimar}/use`)
            .expect(200)
        ).body as { log: Log };
        return (
          (
            await master
              .post(`/logs/${declared.log.id}/resolve`, { roll: 5, summonName })
              .expect(200)
          ).body as { log: Log }
        ).log;
      };
      await summon('Rato');
      const second = await summon('Lobo');

      await master.post(`/logs/${second.id}/revert`).expect(200);
      const after = await charOf(id, morgana.id);
      expect(after.summons.map((s) => s.name)).toEqual(['Rato']);
      expect(after.mana).toBe(8); // as duas declarações cobraram; desfazer a resolução não devolve
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
    const reanimar = () => ability(t, 'necromante', 'Reanimar');
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
        .post(`/characters/${morgana.id}/abilities/${await toque()}/use`)
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
        .post(`/characters/${veu.id}/abilities/${await rosto()}/use`)
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
        .post(`/characters/${veu.id}/abilities/${await rosto()}/use`)
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
      expect((await charOf(id, morgana.id)).hp).toBe(30);
      expect((await cond())!.turnsLeft).toBe(3);

      await next(kaua, id).expect(200); // fim da Morgana
      expect((await charOf(id, morgana.id)).hp).toBe(29);
      expect((await cond())!.turnsLeft).toBe(2);
      expect((await lastLog(id)).message).toBe(
        'Morgana passa a vez: Morgana sofreu 1 de dano por Sangrando (vida 29/30). O foco passa a Véu.',
      );

      // mais 2 turnos da Morgana (3 passes por rodada): acabou
      for (let i = 0; i < 6; i++) await next(master, id).expect(200);
      expect((await charOf(id, morgana.id)).hp).toBe(27);
      expect(await cond()).toBeUndefined();
      const ended = (await state(master, id)).logs.find((l) =>
        l.message.includes('Sangrando acabou em Morgana'),
      )!;
      expect(ended).toBeDefined();

      // desfazer o último passe traz o sangramento e a vida de volta
      await master.post(`/logs/${ended.id}/revert`).expect(200);
      expect((await charOf(id, morgana.id)).hp).toBe(28);
      expect((await cond())!.turnsLeft).toBe(1);
      expect((await state(master, id)).combat!.currentCharacterId).toBe(
        morgana.id,
      );

      // passes antigos não podem ser desfeitos
      const old = (await state(master, id)).logs.find(
        (l) =>
          l.message === 'O mundo termina de reagir. O foco passa a Morgana.',
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
        'O mundo termina de reagir: Morgana perde a vez (Incapacitado) e Incapacitado acabou em Morgana. O foco passa a Véu.',
      );
      expect((await charOf(id, morgana.id)).conditions).toEqual([]);
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
        'O mundo termina de reagir: Goblin sofreu 2 de dano por Queimando (vida 3/8). O foco passa a Morgana.',
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

    it('o fim do turno do mestre não revela a vida do inimigo aos jogadores', async () => {
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

      expect((await state(master, id)).logs.at(-1)!.message).toBe(
        'O mundo termina de reagir: Goblin sofreu 2 de dano por Queimando (vida 3/8). O foco passa a Morgana.',
      );
      expect((await state(kaua, id)).logs.at(-1)!.message).toBe(
        'O mundo termina de reagir: Goblin sofreu dano por Queimando. O foco passa a Morgana.',
      );
    });

    /** Joana vira Tecelão; Dilatação com 20 e sem alvo deixa "Congelado no tempo" pendente. */
    async function pendingFreeze() {
      const camp = await activeCampaign();
      const tecelao = await t.prisma.character.update({
        where: {
          campaignId_userId: { campaignId: camp.id, userId: joanaId },
        },
        data: { classId: 'tecelao-do-tempo' },
      });
      const dilatacao = await ability(t, 'tecelao-do-tempo', 'Dilatação');
      const declared = (
        await joana
          .post(`/characters/${tecelao.id}/abilities/${dilatacao}/use`)
          .expect(200)
      ).body as { log: Log };
      const used = (
        await master
          .post(`/logs/${declared.log.id}/resolve`, { roll: 20 })
          .expect(200)
      ).body as { log: Log };
      return { ...camp, tecelao, dilatacao, used: used.log };
    }

    it('crítico sem alvo deixa a condição pendente até o mestre aplicar', async () => {
      const { id, morgana, used } = await pendingFreeze();
      expect(used.message).toContain('tempo congela brevemente');
      expect(used.message).toContain(
        'aguardando o mestre aplicar Congelado no tempo',
      );
      expect(used.pendingEffect).toEqual({
        source: 'Véu',
        conditions: [{ defId: 'congelado-no-tempo' }],
      });

      await master
        .post(`/campaigns/${id}/npcs`, { name: 'Ogro', hpMax: 20 })
        .expect(201);
      const ogro = (await npcOf(id, 'Ogro'))!;

      // jogador não aplica; alvo de outra campanha/inexistente é recusado
      await joana
        .post(`/logs/${used.id}/apply`, { kind: 'npc', id: ogro.id })
        .expect(403);
      await master
        .post(`/logs/${used.id}/apply`, { kind: 'npc', id: morgana.id })
        .expect(400);

      const applied = (
        await master
          .post(`/logs/${used.id}/apply`, { kind: 'npc', id: ogro.id })
          .expect(200)
      ).body as { log: Log };
      expect(applied.log.message).toContain('aplicada em Ogro');
      expect((await npcOf(id, 'Ogro'))!.conditions).toMatchObject([
        { name: 'Congelado no tempo', source: 'Véu' },
      ]);
      expect((await logById(id, used.id)).pendingEffect).toBeNull();
      // segundo clique: já foi aplicado
      await master
        .post(`/logs/${used.id}/apply`, { kind: 'npc', id: ogro.id })
        .expect(400);

      // desfazer a aplicação tira a condição e devolve o pendente
      await master.post(`/logs/${applied.log.id}/revert`).expect(200);
      expect((await npcOf(id, 'Ogro'))!.conditions).toEqual([]);
      expect((await logById(id, used.id)).pendingEffect).not.toBeNull();

      // agora em alguém da party
      await master
        .post(`/logs/${used.id}/apply`, { kind: 'character', id: morgana.id })
        .expect(200);
      expect(
        (await charOf(id, morgana.id)).conditions.map((c) => c.name),
      ).toEqual(['Congelado no tempo']);
    });

    it('mestre pode descartar o efeito pendente', async () => {
      const { id, used } = await pendingFreeze();
      await joana.del(`/logs/${used.id}/pending`).expect(403);
      await master.del(`/logs/${used.id}/pending`).expect(200);
      expect((await logById(id, used.id)).pendingEffect).toBeNull();
      await master.del(`/logs/${used.id}/pending`).expect(400);
    });

    it('crítico com condição, aplicado, tira a vez do alvo; sem crítico nada fica pendente', async () => {
      const { id, morgana, tecelao, dilatacao, used } = await pendingFreeze();
      await master
        .post(`/logs/${used.id}/apply`, { kind: 'character', id: morgana.id })
        .expect(200);
      await master.post(`/campaigns/${id}/combat/start`).expect(200);
      await next(master, id).expect(200);
      const s = await state(master, id);
      expect(s.combat!.currentCharacterId).toBe(tecelao.id);
      expect(s.logs.at(-1)!.message).toContain(
        'Morgana perde a vez (Congelado no tempo)',
      );

      // sem crítico na faixa: nada pendente
      const declared = (
        await joana
          .post(`/characters/${tecelao.id}/abilities/${dilatacao}/use`)
          .expect(200)
      ).body as { log: Log };
      const plain = (
        await master
          .post(`/logs/${declared.log.id}/resolve`, { roll: 5 })
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
