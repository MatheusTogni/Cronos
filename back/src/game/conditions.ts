/**
 * Aplicação de condições.
 *
 * Quem carrega pode ser um personagem, uma invocação ou um inimigo/NPC.
 * A condição é só um status à mostra: não tem prazo nem efeito automático.
 * O mestre coloca, decide o que ela faz e tira quando quiser.
 */
import { BadRequestException } from '@nestjs/common';
import { Condition, ConditionPolarity, Prisma } from '@prisma/client';
import { DeltaBuilder } from './journal';

type Tx = Prisma.TransactionClient;

/** Quem carrega a condição. */
export type Holder =
  { characterId: string } | { summonId: string } | { npcId: string };

export interface ConditionInput {
  /** Condição do catálogo; os outros campos sobrescrevem os padrões dela. */
  defId?: string;
  name?: string;
  description?: string;
  source?: string;
  polarity?: ConditionPolarity;
}

/** "a, b e c" */
export const joinPt = (parts: string[]) =>
  parts.length <= 1
    ? (parts[0] ?? '')
    : `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`;

/** "X está com Sangrando" */
export const conditionAddedMessage = (
  holderName: string,
  condition: Condition,
) => `${holderName} está com ${condition.name}`;

/** Aplica uma condição e devolve a criada. */
export async function applyCondition(
  tx: Tx,
  holder: Holder,
  input: ConditionInput,
  delta: DeltaBuilder,
): Promise<{ condition: Condition }> {
  const def = input.defId
    ? await tx.conditionDef.findUnique({ where: { id: input.defId } })
    : null;
  if (input.defId && !def) {
    throw new BadRequestException('Condição não encontrada no catálogo');
  }

  const name = input.name || def?.name;
  if (!name) throw new BadRequestException('Dê um nome para a condição');

  const condition = await tx.condition.create({
    data: {
      ...holder,
      defId: def?.id ?? null,
      name,
      description: input.description || def?.description || null,
      source: input.source || null,
      polarity: input.polarity ?? def?.polarity ?? ConditionPolarity.NEUTRAL,
    },
  });
  delta.created('conditions', condition.id);
  return { condition };
}
