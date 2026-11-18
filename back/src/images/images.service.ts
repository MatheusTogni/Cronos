import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CampaignStatus } from '@prisma/client';
import { unlink } from 'node:fs/promises';
import { parse } from 'node:path';
import type { AuthUser } from '../auth/auth-user';
import {
  assertCampaignMaster,
  assertStatus,
  loadCampaign,
} from '../campaigns/access';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { uploadPath, uploadUrl } from './upload-dir';

const toDto = (i: {
  id: string;
  title: string;
  filename: string;
  createdAt: Date;
}) => ({
  id: i.id,
  title: i.title,
  url: uploadUrl(i.filename),
  createdAt: i.createdAt,
});

@Injectable()
export class ImagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  async list(campaignId: string, user: AuthUser) {
    const campaign = await loadCampaign(this.prisma, campaignId);
    assertCampaignMaster(campaign, user);
    const rows = await this.prisma.campaignImage.findMany({
      where: { campaignId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toDto);
  }

  async upload(
    campaignId: string,
    file: Express.Multer.File,
    title: string | undefined,
    user: AuthUser,
  ) {
    try {
      const campaign = await loadCampaign(this.prisma, campaignId);
      assertCampaignMaster(campaign, user);
      const image = await this.prisma.campaignImage.create({
        data: {
          campaignId,
          filename: file.filename,
          originalName: file.originalname,
          title: title?.trim() || parse(file.originalname).name || 'Imagem',
        },
      });
      return toDto(image);
    } catch (e) {
      // o multer já gravou o arquivo antes da checagem — não deixar lixo
      await unlink(file.path).catch(() => undefined);
      throw e;
    }
  }

  async rename(imageId: string, title: string, user: AuthUser) {
    const image = await this.load(imageId, user);
    const updated = await this.prisma.campaignImage.update({
      where: { id: image.id },
      data: { title },
    });
    await this.realtime.broadcastState(image.campaignId);
    return toDto(updated);
  }

  async remove(imageId: string, user: AuthUser) {
    const image = await this.load(imageId, user);
    await this.prisma.campaignImage.delete({ where: { id: image.id } });
    await unlink(uploadPath(image.filename)).catch(() => undefined);
    // se estava em exibição, o onDelete: SetNull já tirou da tela
    await this.realtime.broadcastState(image.campaignId);
  }

  /**
   * Mostra a imagem. `userIds` vazio ou ausente = todos os jogadores (fica no
   * estado da campanha, como sempre). Com ids, só esses jogadores a recebem,
   * na hora: não fica guardada em lugar nenhum (é só apoio à narração).
   */
  async show(
    campaignId: string,
    imageId: string,
    userIds: string[] | undefined,
    user: AuthUser,
  ) {
    const campaign = await loadCampaign(this.prisma, campaignId);
    assertCampaignMaster(campaign, user);
    assertStatus(
      campaign,
      [CampaignStatus.LOBBY, CampaignStatus.ACTIVE],
      'A campanha não está em andamento',
    );
    const image = await this.prisma.campaignImage.findUnique({
      where: { id: imageId },
    });
    if (!image || image.campaignId !== campaignId) {
      throw new NotFoundException('Imagem não encontrada');
    }
    const targets = [...new Set(userIds ?? [])];
    if (targets.length) {
      const seated = await this.prisma.campaignPlayer.count({
        where: { campaignId, userId: { in: targets } },
      });
      if (seated !== targets.length) {
        throw new BadRequestException('Escolha só jogadores desta campanha');
      }
    }
    if (targets.length) {
      // só para alguns: a que estava para todos sai da tela e a nova vai só aos escolhidos
      await this.prisma.campaign.update({
        where: { id: campaignId },
        data: { shownImageId: null },
      });
      await this.realtime.broadcastState(campaignId);
      this.realtime.emitPrivateImage(
        campaignId,
        { id: image.id, url: uploadUrl(image.filename) },
        targets,
      );
      return;
    }
    await this.prisma.campaign.update({
      where: { id: campaignId },
      data: { shownImageId: imageId },
    });
    await this.realtime.broadcastState(campaignId);
    // limpa as que tinham ido só a alguns
    this.realtime.emitPrivateImage(campaignId, null, []);
  }

  async hide(campaignId: string, user: AuthUser) {
    const campaign = await loadCampaign(this.prisma, campaignId);
    assertCampaignMaster(campaign, user);
    await this.prisma.campaign.update({
      where: { id: campaignId },
      data: { shownImageId: null },
    });
    await this.realtime.broadcastState(campaignId);
    this.realtime.emitPrivateImage(campaignId, null, []);
  }

  private async load(imageId: string, user: AuthUser) {
    const image = await this.prisma.campaignImage.findUnique({
      where: { id: imageId },
    });
    if (!image) throw new NotFoundException('Imagem não encontrada');
    const campaign = await loadCampaign(this.prisma, image.campaignId);
    assertCampaignMaster(campaign, user);
    return image;
  }
}
