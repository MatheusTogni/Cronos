import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CampaignStatus, LogType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { copyFile, unlink } from 'node:fs/promises';
import { extname } from 'node:path';
import type { AuthUser } from '../auth/auth-user';
import { writeLog } from '../game/journal';
import { ensureUploadDir, uploadPath } from '../images/upload-dir';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import {
  Audience,
  buildCampaignState,
  forPlayers,
  logSelect,
  logView,
  MASTER_ONLY_LOG_TYPES,
  toLogDto,
} from '../realtime/state';
import {
  assertCampaignMaster,
  assertCampaignMember,
  assertStatus,
  isCampaignMaster,
  loadCampaign,
} from './access';
import {
  ChooseCharacterDto,
  CreateCampaignDto,
  UpdateCampaignDto,
  WhisperDto,
} from './dto';

const { DRAFT, LOBBY, ACTIVE, ENDED } = CampaignStatus;
const LOG_LIMIT = 150;
/** Máximo de jogadores sentados numa campanha (o mestre não conta). */
export const MAX_PLAYERS = 10;

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
        maxPlayers: MAX_PLAYERS,
        joined: !!me,
        ready: me?.ready ?? false,
      };
    });
  }

  /** Estado completo + últimas entradas do log. Usado ao abrir a tela e ao reconectar. */
  async getState(campaignId: string, user: AuthUser) {
    const campaign = await loadCampaign(this.prisma, campaignId);
    await assertCampaignMember(this.prisma, campaign, user);
    // o mestre vê tudo; o jogador não recebe o que é só do mestre
    const audience: Audience = isCampaignMaster(campaign, user)
      ? 'master'
      : 'players';

    const [full, logs] = await Promise.all([
      buildCampaignState(this.prisma, campaignId),
      this.prisma.logEntry.findMany({
        where: {
          campaignId,
          // o log sobre inimigos é só do mestre
          ...(audience === 'players'
            ? { type: { notIn: MASTER_ONLY_LOG_TYPES } }
            : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: LOG_LIMIT,
        select: logSelect,
      }),
    ]);
    const state = audience === 'master' ? full : forPlayers(full);
    return {
      ...state,
      logs: logs.reverse().map((e) => logView(toLogDto(e), audience)),
    };
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
    this.realtime.emitPrivateImage(id, null, []);
    this.realtime.emitLog(id, log);
    this.realtime.campaignsChanged();
    return this.getState(id, user);
  }

  /**
   * Recomeça uma campanha encerrada do zero: volta para "em preparação" sem
   * jogadores, personagens, inimigos, trocas nem log. As imagens enviadas ficam.
   */
  async restart(id: string, user: AuthUser) {
    const campaign = await loadCampaign(this.prisma, id);
    assertCampaignMaster(campaign, user);
    assertStatus(
      campaign,
      [ENDED],
      'Só dá para recomeçar uma campanha encerrada',
    );

    const seats = await this.prisma.campaignPlayer.findMany({
      where: { campaignId: id },
      select: { userId: true },
    });

    await this.prisma.$transaction([
      // o log e as trocas primeiro: apontam para os personagens
      this.prisma.logEntry.deleteMany({ where: { campaignId: id } }),
      this.prisma.transfer.deleteMany({ where: { campaignId: id } }),
      // personagens levam junto criaturas, condições e mochila (cascade)
      this.prisma.character.deleteMany({ where: { campaignId: id } }),
      this.prisma.npc.deleteMany({ where: { campaignId: id } }),
      this.prisma.campaignPlayer.deleteMany({ where: { campaignId: id } }),
      this.prisma.campaign.update({
        where: { id },
        data: {
          status: DRAFT,
          startedAt: null,
          endedAt: null,
          shownImageId: null,
          inCombat: false,
          round: 0,
          turnIndex: 0,
          turnOrder: [],
          shopOpen: false,
        },
      }),
    ]);

    // quem ainda estava na tela da campanha antiga sai dela
    for (const s of seats) this.realtime.kicked(s.userId, id);
    await this.realtime.broadcastState(id);
    this.realtime.campaignsChanged();
    return this.getState(id, user);
  }

  /**
   * Cria uma cópia da campanha em preparação: mesmo nome (com "(cópia)"),
   * descrição e imagens. Cada imagem ganha um arquivo próprio no disco, então
   * apagar uma das campanhas não estraga a outra. Mesa, personagens e log não vêm.
   */
  async duplicate(id: string, user: AuthUser) {
    const campaign = await loadCampaign(this.prisma, id);
    assertCampaignMaster(campaign, user);

    const images = await this.prisma.campaignImage.findMany({
      where: { campaignId: id },
      orderBy: { createdAt: 'asc' },
    });

    // copia os arquivos antes; se o banco falhar, apaga as cópias
    ensureUploadDir();
    const copies: { from: (typeof images)[number]; filename: string }[] = [];
    try {
      for (const img of images) {
        const filename = `${randomUUID()}${extname(img.filename)}`;
        await copyFile(uploadPath(img.filename), uploadPath(filename));
        copies.push({ from: img, filename });
      }
    } catch {
      await this.discardFiles(copies.map((c) => c.filename));
      throw new BadRequestException(
        'Não foi possível copiar as imagens da campanha',
      );
    }

    try {
      const name = `${campaign.name} (cópia)`.slice(0, 80);
      const created = await this.prisma.campaign.create({
        data: {
          name,
          description: campaign.description,
          masterId: user.id,
          images: {
            // a mesma data de envio mantém a ordem da galeria
            create: copies.map((c) => ({
              filename: c.filename,
              originalName: c.from.originalName,
              title: c.from.title,
              createdAt: c.from.createdAt,
            })),
          },
        },
      });
      return created;
    } catch (e) {
      await this.discardFiles(copies.map((c) => c.filename));
      throw e;
    }
  }

  private discardFiles(filenames: string[]) {
    return Promise.all(
      filenames.map((f) => unlink(uploadPath(f)).catch(() => undefined)),
    );
  }

  /**
   * Mensagem secreta do mestre para alguns jogadores. Só vai pelo tempo real,
   * direto para as conexões de cada um: não entra no log nem fica no banco.
   */
  async whisper(id: string, dto: WhisperDto, user: AuthUser) {
    const campaign = await loadCampaign(this.prisma, id);
    assertCampaignMaster(campaign, user);
    assertStatus(
      campaign,
      [LOBBY, ACTIVE],
      'A campanha não está em andamento',
    );
    const targets = [...new Set(dto.userIds)];
    const seated = await this.prisma.campaignPlayer.count({
      where: { campaignId: id, userId: { in: targets } },
    });
    if (seated !== targets.length) {
      throw new BadRequestException('Escolha só jogadores desta campanha');
    }
    const payload = {
      campaignId: id,
      id: randomUUID(),
      message: dto.message,
      sentAt: new Date().toISOString(),
    };
    for (const userId of targets) {
      this.realtime.toUser(userId, 'whisper', payload);
    }
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
    await this.prisma.$transaction(async (tx) => {
      const seat = await tx.campaignPlayer.findUnique({
        where: { campaignId_userId: { campaignId: id, userId: user.id } },
      });
      if (seat) return; // já está na mesa: entrar de novo não ocupa outra vaga
      const seated = await tx.campaignPlayer.count({
        where: { campaignId: id },
      });
      if (seated >= MAX_PLAYERS) {
        throw new BadRequestException(
          `A mesa está cheia (${MAX_PLAYERS} jogadores)`,
        );
      }
      await tx.campaignPlayer.create({
        data: { campaignId: id, userId: user.id },
      });
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
