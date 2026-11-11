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

type Db = Prisma.TransactionClient;

export interface StatDiff {
  hp?: number;
  mana?: number;
  xp?: number;
  level?: number;
}

type ConditionSnap = Omit<Condition, 'createdAt'> & { createdAt: string };
type SummonSnap = Omit<Summon, 'createdAt'> & { createdAt: string };
type ItemSnap = Omit<InventoryItem, 'createdAt'> & { createdAt: string };
type NpcSnap = Omit<Npc, 'createdAt'> & { createdAt: string };

/** Condição a aplicar quando o mestre escolher o alvo. */
export interface PendingCondition {
  defId?: string;
  name?: string;
  description?: string;
  exclusiveGroup?: string;
  turns?: number | null;
}

/** Efeito de habilidade aguardando o mestre ("Aplicar em…"). */
export interface PendingEffect {
  /** Quem usou a habilidade. */
  source: string;
  conditions: PendingCondition[];
}

export interface TurnPos {
  round: number;
  turnIndex: number;
}

export interface Delta {
  stats?: ({ characterId: string } & StatDiff)[];
  /** Passagem de turno: de onde para onde foi. */
  turn?: { campaignId: string; from: TurnPos; to: TurnPos };
  /** Turnos descontados das condições (desfazer devolve). */
  conditionTurns?: { conditionId: string; turns: number }[];
  summonHp?: { summonId: string; hp: number }[];
  npcHp?: { npcId: string; hp: number }[];
  itemQty?: { itemId: string; qty: number }[];
  /** Efeito pendente que esta ação consumiu (desfazer devolve). */
  clearedPending?: { logId: string; effect: PendingEffect };
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

  clearedPending(logId: string, effect: PendingEffect) {
    this.delta.clearedPending = { logId, effect };
  }

  turn(campaignId: string, from: TurnPos, to: TurnPos) {
    this.delta.turn = { campaignId, from, to };
  }

  conditionTurns(conditionId: string, turns: number) {
    if (turns) (this.delta.conditionTurns ??= []).push({ conditionId, turns });
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
 */
export async function applyStats(
  db: Db,
  character: Character,
  diff: StatDiff,
  delta: DeltaBuilder,
): Promise<{ character: Character; applied: Required<StatDiff> }> {
  const next = {
    hp: clamp(character.hp + (diff.hp ?? 0), 0, character.hpMax),
    mana: clamp(character.mana + (diff.mana ?? 0), 0, character.manaMax),
    xp: Math.max(0, character.xp + (diff.xp ?? 0)),
    level: Math.max(1, character.level + (diff.level ?? 0)),
  };
  const applied = {
    hp: next.hp - character.hp,
    mana: next.mana - character.mana,
    xp: next.xp - character.xp,
    level: next.level - character.level,
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
    await db.character.update({
      where: { id: c.id },
      data: {
        hp: clamp(c.hp - (s.hp ?? 0), 0, c.hpMax),
        mana: clamp(c.mana - (s.mana ?? 0), 0, c.manaMax),
        xp: Math.max(0, c.xp - (s.xp ?? 0)),
        level: Math.max(1, c.level - (s.level ?? 0)),
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

  if (delta.clearedPending) {
    await db.logEntry.updateMany({
      where: { id: delta.clearedPending.logId },
      data: {
        pendingEffect: delta.clearedPending
          .effect as unknown as Prisma.InputJsonValue,
      },
    });
  }

  for (const t of delta.conditionTurns ?? []) {
    const c = await db.condition.findUnique({ where: { id: t.conditionId } });
    if (!c || c.turnsLeft === null) continue;
    await db.condition.update({
      where: { id: c.id },
      data: { turnsLeft: c.turnsLeft - t.turns },
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
    message: string;
    roll?: number | null;
    delta?: DeltaBuilder | null;
    pendingEffect?: PendingEffect | null;
  },
) {
  const entry = await db.logEntry.create({
    data: {
      campaignId: data.campaignId,
      actorUserId: data.actorUserId,
      characterId: data.characterId ?? null,
      type: data.type,
      message: data.message,
      roll: data.roll ?? null,
      pendingEffect: data.pendingEffect?.conditions.length
        ? (data.pendingEffect as unknown as Prisma.InputJsonValue)
        : Prisma.DbNull,
      delta:
        data.delta && !data.delta.isEmpty
          ? (data.delta.delta as Prisma.InputJsonValue)
          : Prisma.DbNull,
    },
    select: logSelect,
  });
  return toLogDto(entry);
}
