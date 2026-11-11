import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CampaignStatus, LogType } from '@prisma/client';
import { unlink } from 'node:fs/promises';
import type { AuthUser } from '../auth/auth-user';
import { writeLog } from '../game/journal';
import { uploadPath } from '../images/upload-dir';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { buildCampaignState, logSelect, toLogDto } from '../realtime/state';
import {
  assertCampaignMaster,
  assertCampaignMember,
  assertStatus,
  loadCampaign,
} from './access';
import {
  ChooseCharacterDto,
  CreateCampaignDto,
  UpdateCampaignDto,
} from './dto';

const { DRAFT, LOBBY, ACTIVE, ENDED } = CampaignStatus;
const LOG_LIMIT = 150;

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  // ───────────────────────── leitura ─────────────────────────

  /** Campanhas do mestre logado. */
  async listForMaster(user: AuthUser) {
    const rows = await this.prisma.campaign.findMany({
      where: { masterId: user.id },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { players: true } } },
    });
    return rows.map(({ _count, ...c }) => ({
      ...c,
      playerCount: _count.players,
    }));
  }

  /** Para o jogador: lobbies abertos + campanhas em que ele já está. */
  async listForPlayer(user: AuthUser) {
    const rows = await this.prisma.campaign.findMany({
      where: {
        OR: [
          { status: LOBBY },
          {
            status: { in: [ACTIVE, LOBBY] },
            players: { some: { userId: user.id } },
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        master: { select: { displayName: true } },
        players: { select: { userId: true, ready: true } },
      },
    });
    return rows.map((c) => {
      const me = c.players.find((p) => p.userId === user.id);
      return {
        id: c.id,
        name: c.name,
        description: c.description,
        status: c.status,
        master: c.master,
        playerCount: c.players.length,
        joined: !!me,
        ready: me?.ready ?? false,
      };
    });
  }

  /** Estado completo + últimas entradas do log. Usado ao abrir a tela e ao reconectar. */
  async getState(campaignId: string, user: AuthUser) {
    const campaign = await loadCampaign(this.prisma, campaignId);
    await assertCampaignMember(this.prisma, campaign, user);

    const [state, logs] = await Promise.all([
      buildCampaignState(this.prisma, campaignId),
      this.prisma.logEntry.findMany({
        where: { campaignId },
        orderBy: { createdAt: 'desc' },
        take: LOG_LIMIT,
        select: logSelect,
      }),
    ]);
    return { ...state, logs: logs.reverse().map(toLogDto) };
  }

  // ───────────────────────── mestre ─────────────────────────

  create(dto: CreateCampaignDto, user: AuthUser) {
    return this.prisma.campaign.create({
      data: {
        name: dto.name,
        description: dto.description || null,
        masterId: user.id,
      },
    });
  }

  async update(id: string, dto: UpdateCampaignDto, user: AuthUser) {
    const campaign = await loadCampaign(this.prisma, id);
    assertCampaignMaster(campaign, user);
    const updated = await this.prisma.campaign.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description === '' ? null : dto.description,
      },
    });
    await this.realtime.broadcastState(id);
    if (campaign.status === LOBBY) this.realtime.campaignsChanged();
    return updated;
  }

  async remove(id: string, user: AuthUser) {
    const campaign = await loadCampaign(this.prisma, id);
    assertCampaignMaster(campaign, user);
    assertStatus(
      campaign,
      [DRAFT, ENDED],
      'Só dá para excluir campanhas em preparação ou encerradas',
    );
    const images = await this.prisma.campaignImage.findMany({
      where: { campaignId: id },
      select: { filename: true },
    });
    await this.prisma.campaign.delete({ where: { id } });
    await Promise.all(
      images.map((i) => unlink(uploadPath(i.filename)).catch(() => undefined)),
    );
  }

  async open(id: string, user: AuthUser) {
    const campaign = await loadCampaign(this.prisma, id);
    assertCampaignMaster(campaign, user);
    assertStatus(campaign, [DRAFT], 'O lobby desta campanha já foi aberto');
    await this.prisma.campaign.update({
      where: { id },
      data: { status: LOBBY },
    });
    await this.realtime.broadcastState(id);
    this.realtime.campaignsChanged();
    return this.getState(id, user);
  }

  /** O "ready final" do mestre. */
  async start(id: string, user: AuthUser) {
    const campaign = await loadCampaign(this.prisma, id);
    assertCampaignMaster(campaign, user);
    assertStatus(campaign, [LOBBY], 'A campanha precisa estar no lobby');

    const players = await this.prisma.campaignPlayer.findMany({
      where: { campaignId: id },
      include: { user: { select: { displayName: true } } },
    });
    if (!players.length) {
      throw new BadRequestException('Nenhum jogador entrou no lobby ainda');
    }
    const notReady = players.filter((p) => !p.ready);
    if (notReady.length) {
      throw new BadRequestException(
        `Ainda não estão prontos: ${notReady.map((p) => p.user.displayName).join(', ')}`,
      );
    }

    const log = await this.prisma.$transaction(async (tx) => {
      await tx.campaign.update({
        where: { id },
        data: { status: ACTIVE, startedAt: new Date() },
      });
      return writeLog(tx, {
        campaignId: id,
        actorUserId: user.id,
        type: LogType.CAMPAIGN,
        message: 'A aventura começou!',
      });
    });

    await this.realtime.broadcastState(id);
    this.realtime.emitLog(id, log);
    this.realtime.campaignsChanged();
    return this.getState(id, user);
  }

  async end(id: string, user: AuthUser) {
    const campaign = await loadCampaign(this.prisma, id);
    assertCampaignMaster(campaign, user);
    assertStatus(campaign, [LOBBY, ACTIVE], 'A campanha já está encerrada');

    const log = await this.prisma.$transaction(async (tx) => {
      await tx.campaign.update({
        where: { id },
        data: {
          status: ENDED,
          endedAt: new Date(),
          shownImageId: null,
          inCombat: false,
        },
      });
      return writeLog(tx, {
        campaignId: id,
        actorUserId: user.id,
        type: LogType.CAMPAIGN,
        message: 'A campanha foi encerrada.',
      });
    });

    await this.realtime.broadcastState(id);
    this.realtime.emitLog(id, log);
    this.realtime.campaignsChanged();
    return this.getState(id, user);
  }

  async kick(id: string, userId: string, user: AuthUser) {
    const campaign = await loadCampaign(this.prisma, id);
    assertCampaignMaster(campaign, user);
    assertStatus(
      campaign,
      [LOBBY],
      'Só dá para remover jogadores enquanto a campanha está no lobby',
    );
    await this.removeSeat(id, userId);
    this.realtime.kicked(userId, id);
    await this.realtime.broadcastState(id);
    this.realtime.campaignsChanged();
  }

  // ───────────────────────── jogador ─────────────────────────

  async join(id: string, user: AuthUser) {
    const campaign = await loadCampaign(this.prisma, id);
    this.assertPlayer(user);
    assertStatus(
      campaign,
      [LOBBY],
      campaign.status === ACTIVE
        ? 'Essa aventura já começou'
        : 'Essa campanha não está aberta',
    );
    await this.prisma.campaignPlayer.upsert({
      where: { campaignId_userId: { campaignId: id, userId: user.id } },
      create: { campaignId: id, userId: user.id },
      update: {},
    });
    await this.realtime.broadcastState(id);
    this.realtime.campaignsChanged();
    return this.getState(id, user);
  }

  async leave(id: string, user: AuthUser) {
    const campaign = await loadCampaign(this.prisma, id);
    assertStatus(
      campaign,
      [LOBBY],
      'Não dá para sair depois que a aventura começou',
    );
    await this.removeSeat(id, user.id);
    await this.realtime.broadcastState(id);
    this.realtime.campaignsChanged();
  }

  /** Cria ou troca o personagem no lobby. Trocar de classe cancela o "pronto". */
  async chooseCharacter(id: string, dto: ChooseCharacterDto, user: AuthUser) {
    const campaign = await loadCampaign(this.prisma, id);
    assertStatus(
      campaign,
      [LOBBY],
      'O personagem só pode ser escolhido no lobby',
    );
    await this.requireSeat(id, user);

    const cls = await this.prisma.characterClass.findUnique({
      where: { id: dto.classId },
    });
    if (!cls) throw new NotFoundException('Classe não encontrada');

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.character.findUnique({
        where: { campaignId_userId: { campaignId: id, userId: user.id } },
      });
      if (!existing) {
        await tx.character.create({
          data: {
            campaignId: id,
            userId: user.id,
            classId: cls.id,
            name: dto.name,
            hp: cls.baseHp,
            hpMax: cls.baseHp,
            mana: cls.baseMana,
            manaMax: cls.baseMana,
          },
        });
      } else if (existing.classId !== cls.id) {
        await tx.character.update({
          where: { id: existing.id },
          data: {
            classId: cls.id,
            name: dto.name,
            hp: cls.baseHp,
            hpMax: cls.baseHp,
            mana: cls.baseMana,
            manaMax: cls.baseMana,
          },
        });
        await tx.campaignPlayer.update({
          where: { campaignId_userId: { campaignId: id, userId: user.id } },
          data: { ready: false },
        });
      } else {
        await tx.character.update({
          where: { id: existing.id },
          data: { name: dto.name },
        });
      }
    });

    await this.realtime.broadcastState(id);
    return this.getState(id, user);
  }

  async setReady(id: string, ready: boolean, user: AuthUser) {
    const campaign = await loadCampaign(this.prisma, id);
    assertStatus(campaign, [LOBBY], 'A campanha não está no lobby');
    await this.requireSeat(id, user);

    if (ready) {
      const character = await this.prisma.character.findUnique({
        where: { campaignId_userId: { campaignId: id, userId: user.id } },
      });
      if (!character) {
        throw new BadRequestException(
          'Escolha sua classe antes de ficar pronto',
        );
      }
    }

    await this.prisma.campaignPlayer.update({
      where: { campaignId_userId: { campaignId: id, userId: user.id } },
      data: { ready },
    });
    await this.realtime.broadcastState(id);
    return this.getState(id, user);
  }

  // ───────────────────────── apoio ─────────────────────────

  private assertPlayer(user: AuthUser) {
    if (user.role !== 'PLAYER') {
      throw new ForbiddenException('Só jogadores entram em campanhas');
    }
  }

  private async requireSeat(campaignId: string, user: AuthUser) {
    const seat = await this.prisma.campaignPlayer.findUnique({
      where: { campaignId_userId: { campaignId, userId: user.id } },
    });
    if (!seat) throw new ForbiddenException('Entre na campanha primeiro');
    return seat;
  }

  private async removeSeat(campaignId: string, userId: string) {
    await this.prisma.$transaction([
      this.prisma.character.deleteMany({ where: { campaignId, userId } }),
      this.prisma.campaignPlayer.deleteMany({ where: { campaignId, userId } }),
    ]);
  }
}
