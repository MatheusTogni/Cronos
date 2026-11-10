import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Campaign, CampaignStatus, Prisma, Role } from '@prisma/client';
import type { AuthUser } from '../auth/auth-user';

type Db = Prisma.TransactionClient;

export async function loadCampaign(db: Db, id: string): Promise<Campaign> {
  const campaign = await db.campaign.findUnique({ where: { id } });
  if (!campaign) throw new NotFoundException('Campanha não encontrada');
  return campaign;
}

export const isCampaignMaster = (campaign: Campaign, user: AuthUser) =>
  user.role === Role.MASTER && campaign.masterId === user.id;

export function assertCampaignMaster(campaign: Campaign, user: AuthUser) {
  if (!isCampaignMaster(campaign, user)) {
    throw new ForbiddenException(
      'Apenas o mestre desta campanha pode fazer isso',
    );
  }
}

/** Mestre da campanha ou jogador que entrou nela. */
export async function assertCampaignMember(
  db: Db,
  campaign: Campaign,
  user: AuthUser,
) {
  if (isCampaignMaster(campaign, user)) return;
  const seat = await db.campaignPlayer.findUnique({
    where: {
      campaignId_userId: { campaignId: campaign.id, userId: user.id },
    },
  });
  if (!seat) throw new ForbiddenException('Você não está nesta campanha');
}

export function assertStatus(
  campaign: Campaign,
  allowed: CampaignStatus[],
  message: string,
) {
  if (!allowed.includes(campaign.status)) {
    throw new ForbiddenException(message);
  }
}
