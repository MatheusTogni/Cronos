import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Db = Prisma.TransactionClient | PrismaService;

/**
 * Mochila do personagem: quadradinhos de 3×3. Cada item diferente ocupa um
 * quadradinho e a quantidade soma na mesma pilha, então cabem 9 itens
 * diferentes (e quantas unidades de cada).
 *
 * O front espelha estas regras em `front/src/utils/backpack.ts`.
 */
export const BACKPACK_SLOTS = 9;

/** O nome sem diferença de maiúsculas, acentos e espaços a mais. */
const nameKey = (name: string) =>
  name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

export interface ItemIdentity {
  code: string | null;
  name: string;
}

/**
 * Mesmo item: o mesmo código do catálogo ou, quando um dos dois não tem código
 * (item dado à mão pelo mestre), o mesmo nome. É o que decide se o item entra
 * na pilha de um quadradinho ou ocupa um novo.
 */
export const sameItem = (a: ItemIdentity, b: ItemIdentity) =>
  a.code && b.code ? a.code === b.code : nameKey(a.name) === nameKey(b.name);

/**
 * A pilha onde `item` entra (a mais antiga) ou null se ele ocupar um
 * quadradinho novo. Nesse caso confere que há um livre e, se a mochila está
 * cheia, recusa.
 */
export async function stackFor(
  db: Db,
  owner: { id: string; name: string },
  item: ItemIdentity,
) {
  const items = await db.inventoryItem.findMany({
    where: { characterId: owner.id },
    orderBy: { createdAt: 'asc' },
  });
  const stack = items.find((i) => sameItem(i, item)) ?? null;
  if (!stack && items.length >= BACKPACK_SLOTS) {
    throw new BadRequestException(
      `A mochila de ${owner.name} está cheia (${BACKPACK_SLOTS} itens diferentes)`,
    );
  }
  return stack;
}

/**
 * Depois de receber `gets` e entregar `loses`, a mochila ainda cabe? Devolve o
 * motivo de não caber, ou null. Serve para recusar uma oferta antes de ela
 * existir (e de valer ao aceitar); quem decide de verdade é o `stackFor`
 * dentro da transação.
 */
export async function backpackProblem(
  db: Db,
  owner: { id: string; name: string },
  gets: ItemIdentity,
  loses: { id: string; qty: number } | null,
): Promise<string | null> {
  const items = await db.inventoryItem.findMany({
    where: { characterId: owner.id },
  });
  // a pilha que sai inteira libera o quadradinho
  const left = items.filter(
    (i) => !(loses && i.id === loses.id && i.qty <= loses.qty),
  );
  if (left.some((i) => sameItem(i, gets))) return null;
  return left.length >= BACKPACK_SLOTS
    ? `${owner.name} está com a mochila cheia`
    : null;
}

/**
 * Segura a ficha até o fim da transação: duas mudanças na mochila do mesmo
 * personagem (compra, item do mestre, troca) passam uma de cada vez e não
 * estouram o limite juntas.
 */
export async function lockBackpack(
  tx: Prisma.TransactionClient,
  characterId: string,
) {
  await tx.character.update({
    where: { id: characterId },
    data: { updatedAt: new Date() },
  });
}
