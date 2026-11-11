import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CampaignStatus, LogType, Prisma } from '@prisma/client';
import type { AuthUser } from '../auth/auth-user';
import { assertCampaignMaster, loadCampaign } from '../campaigns/access';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { LogDto } from '../realtime/state';
import { applyCondition, conditionAddedMessage } from './conditions';
import {
  AdjustSummonDto,
  CreateConditionDto,
  CreateNpcDto,
  UpdateNpcDto,
} from './dto';
import { clamp, DeltaBuilder, writeLog } from './journal';

type Tx = Prisma.TransactionClient;

/**
 * Inimigos/NPCs: fichas simples (vida + condições) que só o mestre controla.
 * Agem no turno do mestre, então as condições deles descontam no fim dele.
 */
@Injectable()
export class NpcsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  async create(campaignId: string, dto: CreateNpcDto, user: AuthUser) {
    await this.masterCampaign(campaignId, user);
    return this.run(campaignId, async (tx) => {
      const npc = await tx.npc.create({
        data: { campaignId, name: dto.name, hp: dto.hpMax, hpMax: dto.hpMax },
      });
      const delta = new DeltaBuilder();
      delta.created('npcs', npc.id);
      return writeLog(tx, {
        campaignId,
        actorUserId: user.id,
        type: LogType.NPC_CREATED,
        message: `${npc.name} entrou em cena (vida ${npc.hp}/${npc.hpMax})`,
        delta,
      });
    });
  }

  async update(npcId: string, dto: UpdateNpcDto, user: AuthUser) {
    const npc = await this.npcCtx(npcId, user);
    const hpMax = dto.hpMax ?? npc.hpMax;
    return this.run(npc.campaignId, async (tx) => {
      await tx.npc.update({
        where: { id: npcId },
        data: {
          name: dto.name,
          notes: dto.notes,
          hpMax,
          hp: clamp(npc.hp, 0, hpMax),
        },
      });
      return null;
    });
  }

  async adjust(npcId: string, dto: AdjustSummonDto, user: AuthUser) {
    const npc = await this.npcCtx(npcId, user);
    if (!dto.hp) {
      throw new BadRequestException('Informe um valor diferente de zero');
    }
    return this.run(npc.campaignId, async (tx) => {
      const hp = clamp(npc.hp + dto.hp, 0, npc.hpMax);
      const delta = new DeltaBuilder();
      delta.npcHp(npc.id, hp - npc.hp);
      await tx.npc.update({ where: { id: npc.id }, data: { hp } });

      let message =
        dto.hp < 0
          ? `${npc.name} recebeu ${-dto.hp} de dano`
          : `${npc.name} recuperou ${dto.hp} de vida`;
      message += ` (vida ${hp}/${npc.hpMax})`;
      if (dto.hp < 0 && hp === 0) message += ' — caiu!';
      if (dto.reason) message += ` — ${dto.reason}`;

      return writeLog(tx, {
        campaignId: npc.campaignId,
        actorUserId: user.id,
        type: LogType.NPC_UPDATED,
        message,
        delta,
      });
    });
  }

  async remove(npcId: string, user: AuthUser) {
    const npc = await this.npcCtx(npcId, user);
    return this.run(npc.campaignId, async (tx) => {
      const full = await tx.npc.findUniqueOrThrow({
        where: { id: npcId },
        include: { conditions: true },
      });
      const delta = new DeltaBuilder();
      delta.deletedNpc(full);
      await tx.npc.delete({ where: { id: npcId } });
      return writeLog(tx, {
        campaignId: npc.campaignId,
        actorUserId: user.id,
        type: LogType.NPC_REMOVED,
        message: `${npc.name} saiu de cena`,
        delta,
      });
    });
  }

  async addCondition(npcId: string, dto: CreateConditionDto, user: AuthUser) {
    const npc = await this.npcCtx(npcId, user);
    return this.run(npc.campaignId, async (tx) => {
      const delta = new DeltaBuilder();
      const { condition, replaced } = await applyCondition(
        tx,
        { npcId },
        { ...dto, source: 'Mestre' },
        delta,
      );
      return writeLog(tx, {
        campaignId: npc.campaignId,
        actorUserId: user.id,
        type: LogType.CONDITION_ADDED,
        message: conditionAddedMessage(npc.name, condition, replaced),
        delta,
      });
    });
  }

  // ── apoio ──

  private async masterCampaign(campaignId: string, user: AuthUser) {
    const campaign = await loadCampaign(this.prisma, campaignId);
    assertCampaignMaster(campaign, user);
    if (campaign.status !== CampaignStatus.ACTIVE) {
      throw new ForbiddenException('A aventura não está em andamento');
    }
    return campaign;
  }

  private async npcCtx(npcId: string, user: AuthUser) {
    const npc = await this.prisma.npc.findUnique({ where: { id: npcId } });
    if (!npc) throw new NotFoundException('Inimigo não encontrado');
    await this.masterCampaign(npc.campaignId, user);
    return npc;
  }

  private async run(
    campaignId: string,
    fn: (tx: Tx) => Promise<LogDto | null>,
  ) {
    const log = await this.prisma.$transaction(fn);
    await this.realtime.broadcastState(campaignId);
    if (log) this.realtime.emitLog(campaignId, log);
    return { log };
  }
}
