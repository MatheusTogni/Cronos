/**
 * Ação do turno. Em combate, o jogador tem uma ação por turno: atacar (é
 * narrativo, o app não registra) ou usar UMA habilidade. Trocas e doações não
 * gastam a ação.
 *
 * Não há coluna para isso: o turno do personagem começou na última passagem de
 * turno do log (a entrada TURN com `delta.turn` que não foi desfeita), e a ação
 * já foi gasta se há uma habilidade dele no log depois disso. Desfazer o uso da
 * habilidade, ou a passagem de turno, ajusta tudo sozinho.
 */
import { LogType, Prisma } from '@prisma/client';

type Db = Pick<Prisma.TransactionClient, 'logEntry'>;

/** Passagens de turno olhadas para trás; sobra de longe (há poucos TURN sem delta entre elas). */
const PASSES_LOOKBACK = 50;

/** O personagem já usou uma habilidade neste turno? */
export async function skillUsedThisTurn(
  db: Db,
  campaignId: string,
  characterId: string,
): Promise<boolean> {
  // início do turno em andamento: a última passagem de turno não desfeita
  // (começar, reordenar e encerrar o combate também são TURN, mas sem delta.turn)
  const entries = await db.logEntry.findMany({
    where: { campaignId, type: LogType.TURN, revertedAt: null },
    orderBy: { createdAt: 'desc' },
    take: PASSES_LOOKBACK,
    select: { createdAt: true, delta: true },
  });
  const turnStart = entries.find(
    (e) =>
      !!e.delta &&
      typeof e.delta === 'object' &&
      !Array.isArray(e.delta) &&
      'turn' in e.delta,
  );
  if (!turnStart) return false;

  const used = await db.logEntry.findFirst({
    where: {
      campaignId,
      characterId,
      type: LogType.ABILITY_USED,
      revertedAt: null,
      createdAt: { gt: turnStart.createdAt },
    },
    select: { id: true },
  });
  return !!used;
}

/**
 * Segura a ficha até o fim da transação: dois usos de habilidade juntos (dois
 * cliques, dois aparelhos) passam um de cada vez, e o segundo já enxerga o
 * primeiro no log.
 */
export async function lockAction(
  tx: Prisma.TransactionClient,
  characterId: string,
) {
  await tx.character.update({
    where: { id: characterId },
    data: { updatedAt: new Date() },
  });
}
