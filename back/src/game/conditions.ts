/**
 * Aplicação de condições e o "fim de turno" de quem as carrega.
 *
 * Quem carrega pode ser um personagem, uma invocação ou um inimigo/NPC.
 * Duração conta em turnos de quem carrega: só desconta quando o turno DELE
 * passa (ex.: Sangrando por 3 turnos perde 1 de vida e 1 turno no fim de cada
 * turno do personagem, e acaba no terceiro). Invocações acompanham o turno do
 * dono; inimigos, o turno do mestre.
 */
import { BadRequestException } from '@nestjs/common';
import {
  Character,
  Condition,
  ConditionPolarity,
  Prisma,
} from '@prisma/client';
import { applyStats, clamp, DeltaBuilder, Line, same } from './journal';

type Tx = Prisma.TransactionClient;

/** Quem carrega a condição. */
export type Holder =
  { characterId: string } | { summonId: string } | { npcId: string };

export interface ConditionInput {
  /** Condição do catálogo; os outros campos sobrescrevem os padrões dela. */
  defId?: string;
  name?: string;
  description?: string;
  exclusiveGroup?: string;
  source?: string;
  polarity?: ConditionPolarity;
  /** undefined = padrão do catálogo; null = sem prazo. */
  turns?: number | null;
  hpPerTurn?: number;
  skipsTurn?: boolean;
}

/** "a, b e c" */
export const joinPt = (parts: string[]) =>
  parts.length <= 1
    ? (parts[0] ?? '')
    : `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`;

/** "(2 turnos)", "(1 turno)" ou "" */
export const turnsLabel = (n: number | null | undefined) =>
  n ? ` (${n} ${n === 1 ? 'turno' : 'turnos'})` : '';

/** "X está com Sangrando (3 turnos) — −1 de vida por turno (substituiu Y)" */
export function conditionAddedMessage(
  holderName: string,
  condition: Condition,
  replaced: string[],
) {
  const extras: string[] = [];
  if (condition.hpPerTurn < 0) {
    extras.push(`−${-condition.hpPerTurn} de vida por turno`);
  }
  if (condition.hpPerTurn > 0) {
    extras.push(`+${condition.hpPerTurn} de vida por turno`);
  }
  if (condition.skipsTurn) extras.push('perde a vez');
  return (
    `${holderName} está com ${condition.name}` +
    turnsLabel(condition.turnsLeft) +
    (extras.length ? ` — ${joinPt(extras)}` : '') +
    (replaced.length ? ` (substituiu ${joinPt(replaced)})` : '')
  );
}

/**
 * Aplica uma condição. Se tiver grupo exclusivo, remove as do mesmo grupo no
 * mesmo portador. Devolve a condição criada e os nomes substituídos.
 */
export async function applyCondition(
  tx: Tx,
  holder: Holder,
  input: ConditionInput,
  delta: DeltaBuilder,
): Promise<{ condition: Condition; replaced: string[] }> {
  const def = input.defId
    ? await tx.conditionDef.findUnique({ where: { id: input.defId } })
    : null;
  if (input.defId && !def) {
    throw new BadRequestException('Condição não encontrada no catálogo');
  }

  const name = input.name || def?.name;
  if (!name) throw new BadRequestException('Dê um nome para a condição');
  const exclusiveGroup = input.exclusiveGroup ?? def?.exclusiveGroup ?? null;

  const replaced: string[] = [];
  if (exclusiveGroup) {
    const same = await tx.condition.findMany({
      where: { ...holder, exclusiveGroup },
    });
    for (const c of same) {
      delta.deletedCondition(c);
      replaced.push(c.name);
    }
    if (same.length) {
      await tx.condition.deleteMany({
        where: { id: { in: same.map((c) => c.id) } },
      });
    }
  }

  const condition = await tx.condition.create({
    data: {
      ...holder,
      defId: def?.id ?? null,
      name,
      description: input.description || def?.description || null,
      exclusiveGroup,
      source: input.source || null,
      polarity: input.polarity ?? def?.polarity ?? ConditionPolarity.NEUTRAL,
      // null explícito = sem prazo, mesmo que o catálogo tenha padrão
      turnsLeft: input.turns !== undefined ? input.turns : (def?.turns ?? null),
      hpPerTurn: input.hpPerTurn ?? def?.hpPerTurn ?? 0,
      skipsTurn: input.skipsTurn ?? def?.skipsTurn ?? false,
    },
  });
  delta.created('conditions', condition.id);
  // reaplicar a mesma condição não conta como "substituiu"
  return { condition, replaced: replaced.filter((n) => n !== name) };
}

/** Vida de quem carrega: aplica a variação e devolve o que mudou de fato. */
type ApplyHp = (
  diff: number,
) => Promise<{ applied: number; hp: number; hpMax: number }>;

/**
 * Fim de turno para um conjunto de condições do mesmo portador: vida por
 * turno e desconto de 1 turno, removendo as que acabaram.
 * `hideNumbers`: a vida de quem carrega é só do mestre (inimigos); os jogadores
 * leem que houve dano, sem o valor nem a vida que sobrou.
 */
async function tickConditions(
  tx: Tx,
  conditions: Condition[],
  holderName: string,
  applyHp: ApplyHp,
  delta: DeltaBuilder,
  hideNumbers = false,
): Promise<Line[]> {
  const parts: Line[] = [];
  for (const c of conditions) {
    if (c.hpPerTurn) {
      const { applied, hp, hpMax } = await applyHp(c.hpPerTurn);
      if (applied) {
        const fell = applied < 0 && hp === 0 ? ' — caiu!' : '';
        const full =
          (applied < 0
            ? `${holderName} sofreu ${-applied} de dano por ${c.name}`
            : `${holderName} recuperou ${applied} de vida por ${c.name}`) +
          ` (vida ${hp}/${hpMax})` +
          fell;
        parts.push({
          master: full,
          public: hideNumbers
            ? (applied < 0
                ? `${holderName} sofreu dano por ${c.name}`
                : `${holderName} recuperou vida por ${c.name}`) + fell
            : full,
        });
      }
    }

    if (c.turnsLeft === null) continue;
    if (c.turnsLeft <= 1) {
      delta.deletedCondition(c);
      await tx.condition.delete({ where: { id: c.id } });
      parts.push(same(`${c.name} acabou em ${holderName}`));
    } else {
      await tx.condition.update({
        where: { id: c.id },
        data: { turnsLeft: c.turnsLeft - 1 },
      });
      delta.conditionTurns(c.id, -1);
    }
  }
  return parts;
}

const byCreation = { orderBy: { createdAt: 'asc' } } as const;

/**
 * Fim do turno de um personagem: as condições dele e as das invocações dele.
 * Devolve as frases do log.
 */
export async function endTurnOf(
  tx: Tx,
  character: Character,
  delta: DeltaBuilder,
): Promise<Line[]> {
  let ch = character;
  const parts = await tickConditions(
    tx,
    await tx.condition.findMany({
      where: { characterId: character.id },
      ...byCreation,
    }),
    character.name,
    async (diff) => {
      const { character: after, applied } = await applyStats(
        tx,
        ch,
        { hp: diff },
        delta,
      );
      ch = after;
      return { applied: applied.hp, hp: after.hp, hpMax: after.hpMax };
    },
    delta,
  );

  const summons = await tx.summon.findMany({
    where: { characterId: character.id },
    include: { conditions: byCreation },
    ...byCreation,
  });
  for (const s of summons) {
    let hp = s.hp;
    parts.push(
      ...(await tickConditions(
        tx,
        s.conditions,
        s.name,
        async (diff) => {
          const next = clamp(hp + diff, 0, s.hpMax);
          const applied = next - hp;
          if (applied) {
            await tx.summon.update({ where: { id: s.id }, data: { hp: next } });
            delta.summonHp(s.id, applied);
          }
          hp = next;
          return { applied, hp, hpMax: s.hpMax };
        },
        delta,
      )),
    );
  }
  return parts;
}

/** Fim do turno do mestre: condições dos inimigos/NPCs da campanha. */
export async function endTurnOfNpcs(
  tx: Tx,
  campaignId: string,
  delta: DeltaBuilder,
): Promise<Line[]> {
  const parts: Line[] = [];
  const npcs = await tx.npc.findMany({
    where: { campaignId },
    include: { conditions: byCreation },
    ...byCreation,
  });
  for (const n of npcs) {
    let hp = n.hp;
    parts.push(
      ...(await tickConditions(
        tx,
        n.conditions,
        n.name,
        async (diff) => {
          const next = clamp(hp + diff, 0, n.hpMax);
          const applied = next - hp;
          if (applied) {
            await tx.npc.update({ where: { id: n.id }, data: { hp: next } });
            delta.npcHp(n.id, applied);
          }
          hp = next;
          return { applied, hp, hpMax: n.hpMax };
        },
        delta,
        true,
      )),
    );
  }
  return parts;
}
