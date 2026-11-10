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

export interface Delta {
  stats?: ({ characterId: string } & StatDiff)[];
  summonHp?: { summonId: string; hp: number }[];
  itemQty?: { itemId: string; qty: number }[];
  created?: { summons?: string[]; conditions?: string[]; items?: string[] };
  deleted?: {
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

  itemQty(itemId: string, qty: number) {
    if (qty) (this.delta.itemQty ??= []).push({ itemId, qty });
  }

  created(kind: 'summons' | 'conditions' | 'items', id: string) {
    ((this.delta.created ??= {})[kind] ??= []).push(id);
  }

  deletedSummon(s: Summon & { conditions?: Condition[] }) {
    const { conditions, ...summon } = s;
    ((this.delta.deleted ??= {}).summons ??= []).push(snap(summon));
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
    await db.condition.createMany({
      data: deleted.conditions
        .filter((c) =>
          c.characterId ? alive.has(c.characterId) : summonIds.has(c.summonId!),
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
      delta:
        data.delta && !data.delta.isEmpty
          ? (data.delta.delta as Prisma.InputJsonValue)
          : Prisma.DbNull,
    },
    select: logSelect,
  });
  return toLogDto(entry);
}
