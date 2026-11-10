import { Prisma } from '@prisma/client';
import { uploadUrl } from '../images/upload-dir';

/** Tudo o que a ficha mostra de um personagem. */
export const characterInclude = {
  summons: {
    orderBy: { createdAt: 'asc' },
    include: { conditions: { orderBy: { createdAt: 'asc' } } },
  },
  conditions: { orderBy: { createdAt: 'asc' } },
  inventory: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.CharacterInclude;

export const logSelect = {
  id: true,
  type: true,
  message: true,
  roll: true,
  characterId: true,
  createdAt: true,
  revertedAt: true,
  delta: true,
  actor: { select: { id: true, displayName: true } },
} satisfies Prisma.LogEntrySelect;

export type LogDto = Omit<
  Prisma.LogEntryGetPayload<{ select: typeof logSelect }>,
  'delta'
> & { revertible: boolean };

export const toLogDto = (
  entry: Prisma.LogEntryGetPayload<{ select: typeof logSelect }>,
): LogDto => {
  const { delta, ...rest } = entry;
  return { ...rest, revertible: !!delta && !entry.revertedAt };
};

/** Monta o estado público da campanha (igual para mestre e jogadores). */
export async function buildCampaignState(
  db: Prisma.TransactionClient,
  campaignId: string,
) {
  const c = await db.campaign.findUniqueOrThrow({
    where: { id: campaignId },
    include: {
      master: { select: { id: true, displayName: true } },
      shownImage: true,
      players: {
        orderBy: { joinedAt: 'asc' },
        include: {
          user: { select: { id: true, displayName: true, username: true } },
        },
      },
      characters: {
        orderBy: { createdAt: 'asc' },
        include: characterInclude,
      },
    },
  });

  return {
    id: c.id,
    name: c.name,
    description: c.description,
    status: c.status,
    createdAt: c.createdAt,
    startedAt: c.startedAt,
    endedAt: c.endedAt,
    master: c.master,
    players: c.players.map((p) => ({
      userId: p.userId,
      displayName: p.user.displayName,
      username: p.user.username,
      ready: p.ready,
      joinedAt: p.joinedAt,
    })),
    characters: c.characters,
    shownImage: c.shownImage
      ? {
          id: c.shownImage.id,
          title: c.shownImage.title,
          url: uploadUrl(c.shownImage.filename),
        }
      : null,
  };
}

export type CampaignState = Awaited<ReturnType<typeof buildCampaignState>>;
