/**
 * Log da campanha + "desfazer".
 *
 * Toda ação que muda a ficha grava um LogEntry com um `delta` descrevendo o que
 * mudou. Desfazer aplica o inverso do delta — por DIFERENÇA, não restaurando o
 * valor antigo, para não apagar o que aconteceu depois (ex.: desfazer um dano de
 * 5 depois de uma cura de 3 devolve os 5, sem perder a cura).
 */
import {
  Character,
  Condition,
  InventoryItem,
  LogType,
  Npc,
  Prisma,
  Summon,
} from '@prisma/client';
import { logSelect, toLogDto } from '../realtime/state';
import { HP_PER_LEVEL, MANA_PER_LEVEL, MAX_LEVEL } from './rules';

type Db = Prisma.TransactionClient;

/**
 * Uma frase do log em duas versões: a do mestre (com números) e a pública,
 * narrada. Quando não há nada a esconder, as duas são iguais (`same`).
 */
export interface Line {
  master: string;
  public: string;
}
export const same = (text: string): Line => ({ master: text, public: text });

export interface StatDiff {
  hp?: number;
  /** Muda sozinho quando o nível muda (HP_PER_LEVEL por nível). */
  hpMax?: number;
  mana?: number;
  /** Muda sozinho quando o nível muda (MANA_PER_LEVEL por nível). */
  manaMax?: number;
  xp?: number;
  level?: number;
  gold?: number;
}

type ConditionSnap = Omit<Condition, 'createdAt'> & { createdAt: string };
type SummonSnap = Omit<Summon, 'createdAt'> & { createdAt: string };
type ItemSnap = Omit<InventoryItem, 'createdAt'> & { createdAt: string };
type NpcSnap = Omit<Npc, 'createdAt'> & { createdAt: string };

export interface TurnPos {
  round: number;
  turnIndex: number;
}

export interface Delta {
  stats?: ({ characterId: string } & StatDiff)[];
  /** Passagem de turno: de onde para onde foi. */
  turn?: { campaignId: string; from: TurnPos; to: TurnPos };
  summonHp?: { summonId: string; hp: number }[];
  npcHp?: { npcId: string; hp: number }[];
  itemQty?: { itemId: string; qty: number }[];
  created?: {
    summons?: string[];
    conditions?: string[];
    items?: string[];
    npcs?: string[];
  };
  deleted?: {
    npcs?: NpcSnap[];
    summons?: SummonSnap[];
    conditions?: ConditionSnap[];
    items?: ItemSnap[];
  };
}

const snap = <T extends { createdAt: Date }>(row: T) => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
});

export const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

/** Acumula alterações ao longo de uma ação; vira o `delta` do log. */
export class DeltaBuilder {
  readonly delta: Delta = {};

  stat(characterId: string, diff: StatDiff) {
    const clean = Object.fromEntries(
      Object.entries(diff).filter(([, v]) => v !== 0 && v !== undefined),
    );
    if (!Object.keys(clean).length) return;
    (this.delta.stats ??= []).push({ characterId, ...clean });
  }

  summonHp(summonId: string, hp: number) {
    if (hp) (this.delta.summonHp ??= []).push({ summonId, hp });
  }

  npcHp(npcId: string, hp: number) {
    if (hp) (this.delta.npcHp ??= []).push({ npcId, hp });
  }

  turn(campaignId: string, from: TurnPos, to: TurnPos) {
    this.delta.turn = { campaignId, from, to };
  }

  itemQty(itemId: string, qty: number) {
    if (qty) (this.delta.itemQty ??= []).push({ itemId, qty });
  }

  created(kind: 'summons' | 'conditions' | 'items' | 'npcs', id: string) {
    ((this.delta.created ??= {})[kind] ??= []).push(id);
  }

  deletedSummon(s: Summon & { conditions?: Condition[] }) {
    const { conditions, ...summon } = s;
    ((this.delta.deleted ??= {}).summons ??= []).push(snap(summon));
    for (const c of conditions ?? []) this.deletedCondition(c);
  }

  deletedNpc(n: Npc & { conditions?: Condition[] }) {
    const { conditions, ...npc } = n;
    ((this.delta.deleted ??= {}).npcs ??= []).push(snap(npc));
    for (const c of conditions ?? []) this.deletedCondition(c);
  }

  deletedCondition(c: Condition) {
    ((this.delta.deleted ??= {}).conditions ??= []).push(snap(c));
  }

  deletedItem(i: InventoryItem) {
    ((this.delta.deleted ??= {}).items ??= []).push(snap(i));
  }

  get isEmpty() {
    return Object.keys(this.delta).length === 0;
  }
}

/**
 * Aplica variações em vida/mana/XP/nível respeitando os limites e registra no
 * delta só o que de fato mudou (ex.: dano de 30 em quem tem 12 de vida → -12).
 * O nível fica entre 1 e MAX_LEVEL. Subir de nível aumenta a vida máxima em
 * HP_PER_LEVEL e a mana máxima em MANA_PER_LEVEL por nível (e a vida e a mana
 * atuais ganham o mesmo tanto); descer tira o mesmo tanto das máximas.
 */
export async function applyStats(
  db: Db,
  character: Character,
  diff: StatDiff,
  delta: DeltaBuilder,
): Promise<{ character: Character; applied: Required<StatDiff> }> {
  const level = clamp(character.level + (diff.level ?? 0), 1, MAX_LEVEL);
  const hpMax = Math.max(
    1,
    character.hpMax + (level - character.level) * HP_PER_LEVEL,
  );
  const manaMax = Math.max(
    0,
    character.manaMax + (level - character.level) * MANA_PER_LEVEL,
  );
  const hpGain = Math.max(0, hpMax - character.hpMax);
  const manaGain = Math.max(0, manaMax - character.manaMax);
  const next = {
    hpMax,
    manaMax,
    hp: clamp(character.hp + (diff.hp ?? 0) + hpGain, 0, hpMax),
    mana: clamp(character.mana + (diff.mana ?? 0) + manaGain, 0, manaMax),
    xp: Math.max(0, character.xp + (diff.xp ?? 0)),
    level,
    gold: Math.max(0, character.gold + (diff.gold ?? 0)),
  };
  const applied = {
    hp: next.hp - character.hp,
    hpMax: next.hpMax - character.hpMax,
    manaMax: next.manaMax - character.manaMax,
    mana: next.mana - character.mana,
    xp: next.xp - character.xp,
    level: next.level - character.level,
    gold: next.gold - character.gold,
  };
  delta.stat(character.id, applied);
  const updated = await db.character.update({
    where: { id: character.id },
    data: next,
  });
  return { character: updated, applied };
}

/** Desfaz um delta. Itens que já não existem mais são ignorados. */
export async function revertDelta(db: Db, delta: Delta) {
  for (const s of delta.stats ?? []) {
    const c = await db.character.findUnique({ where: { id: s.characterId } });
    if (!c) continue;
    const hpMax = Math.max(1, c.hpMax - (s.hpMax ?? 0));
    const manaMax = Math.max(0, c.manaMax - (s.manaMax ?? 0));
    await db.character.update({
      where: { id: c.id },
      data: {
        hpMax,
        manaMax,
        hp: clamp(c.hp - (s.hp ?? 0), 0, hpMax),
        mana: clamp(c.mana - (s.mana ?? 0), 0, manaMax),
        xp: Math.max(0, c.xp - (s.xp ?? 0)),
        level: clamp(c.level - (s.level ?? 0), 1, MAX_LEVEL),
        gold: Math.max(0, c.gold - (s.gold ?? 0)),
      },
    });
  }

  for (const s of delta.summonHp ?? []) {
    const summon = await db.summon.findUnique({ where: { id: s.summonId } });
    if (!summon) continue;
    await db.summon.update({
      where: { id: summon.id },
      data: { hp: clamp(summon.hp - s.hp, 0, summon.hpMax) },
    });
  }

  if (delta.turn) {
    await db.campaign.update({
      where: { id: delta.turn.campaignId },
      data: delta.turn.from,
    });
  }

  for (const n of delta.npcHp ?? []) {
    const npc = await db.npc.findUnique({ where: { id: n.npcId } });
    if (!npc) continue;
    await db.npc.update({
      where: { id: npc.id },
      data: { hp: clamp(npc.hp - n.hp, 0, npc.hpMax) },
    });
  }

  for (const i of delta.itemQty ?? []) {
    const item = await db.inventoryItem.findUnique({ where: { id: i.itemId } });
    if (!item) continue;
    await db.inventoryItem.update({
      where: { id: item.id },
      data: { qty: Math.max(0, item.qty - i.qty) },
    });
  }

  const created = delta.created ?? {};
  if (created.conditions?.length) {
    await db.condition.deleteMany({
      where: { id: { in: created.conditions } },
    });
  }
  if (created.summons?.length) {
    await db.summon.deleteMany({ where: { id: { in: created.summons } } });
  }
  if (created.items?.length) {
    await db.inventoryItem.deleteMany({ where: { id: { in: created.items } } });
  }
  if (created.npcs?.length) {
    await db.npc.deleteMany({ where: { id: { in: created.npcs } } });
  }

  // Recria o que foi apagado (invocações antes das condições que apontam para elas).
  const deleted = delta.deleted ?? {};
  const existingCharacters = async (ids: (string | null)[]) => {
    const valid = ids.filter((x): x is string => !!x);
    const rows = await db.character.findMany({
      where: { id: { in: valid } },
      select: { id: true },
    });
    return new Set(rows.map((r) => r.id));
  };

  if (deleted.npcs?.length) {
    const campaigns = new Set(
      (
        await db.campaign.findMany({
          where: { id: { in: deleted.npcs.map((n) => n.campaignId) } },
          select: { id: true },
        })
      ).map((c) => c.id),
    );
    await db.npc.createMany({
      data: deleted.npcs
        .filter((n) => campaigns.has(n.campaignId))
        .map((n) => ({ ...n, createdAt: new Date(n.createdAt) })),
      skipDuplicates: true,
    });
  }
  if (deleted.summons?.length) {
    const alive = await existingCharacters(
      deleted.summons.map((s) => s.characterId),
    );
    await db.summon.createMany({
      data: deleted.summons
        .filter((s) => alive.has(s.characterId))
        .map((s) => ({ ...s, createdAt: new Date(s.createdAt) })),
      skipDuplicates: true,
    });
  }
  if (deleted.conditions?.length) {
    const alive = await existingCharacters(
      deleted.conditions.map((c) => c.characterId),
    );
    const summonIds = new Set(
      (
        await db.summon.findMany({
          where: {
            id: {
              in: deleted.conditions
                .map((c) => c.summonId)
                .filter((x): x is string => !!x),
            },
          },
          select: { id: true },
        })
      ).map((s) => s.id),
    );
    const npcIds = new Set(
      (
        await db.npc.findMany({
          where: {
            id: {
              in: deleted.conditions
                .map((c) => c.npcId)
                .filter((x): x is string => !!x),
            },
          },
          select: { id: true },
        })
      ).map((n) => n.id),
    );
    await db.condition.createMany({
      data: deleted.conditions
        .filter((c) =>
          c.characterId
            ? alive.has(c.characterId)
            : c.summonId
              ? summonIds.has(c.summonId)
              : !!c.npcId && npcIds.has(c.npcId),
        )
        .map((c) => ({ ...c, createdAt: new Date(c.createdAt) })),
      skipDuplicates: true,
    });
  }
  if (deleted.items?.length) {
    const alive = await existingCharacters(
      deleted.items.map((i) => i.characterId),
    );
    await db.inventoryItem.createMany({
      data: deleted.items
        .filter((i) => alive.has(i.characterId))
        .map((i) => ({ ...i, createdAt: new Date(i.createdAt) })),
      skipDuplicates: true,
    });
  }
}

export async function writeLog(
  db: Db,
  data: {
    campaignId: string;
    actorUserId: string | null;
    characterId?: string | null;
    type: LogType;
    /** O que os jogadores leem. */
    message: string;
    /** O que o mestre lê, quando difere de `message` (ex.: com a vida dos inimigos). */
    masterMessage?: string | null;
    roll?: number | null;
    delta?: DeltaBuilder | null;
  },
) {
  const entry = await db.logEntry.create({
    data: {
      campaignId: data.campaignId,
      actorUserId: data.actorUserId,
      characterId: data.characterId ?? null,
      type: data.type,
      message: data.message,
      masterMessage:
        data.masterMessage && data.masterMessage !== data.message
          ? data.masterMessage
          : null,
      roll: data.roll ?? null,
      delta:
        data.delta && !data.delta.isEmpty
          ? (data.delta.delta as Prisma.InputJsonValue)
          : Prisma.DbNull,
    },
    select: logSelect,
  });
  return toLogDto(entry);
}
