import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Campaign, CampaignStatus, LogType, Prisma } from '@prisma/client';
import type { AuthUser } from '../auth/auth-user';
import {
  assertCampaignMaster,
  isCampaignMaster,
  loadCampaign,
} from '../campaigns/access';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { LogDto } from '../realtime/state';
import { endTurnOf, endTurnOfNpcs, joinPt } from './conditions';
import { NextTurnDto, TurnOrderDto } from './dto';
import { DeltaBuilder, TurnPos, writeLog } from './journal';

type Tx = Prisma.TransactionClient;

/**
 * Combate em turnos. O mestre liga e desliga; cada rodada abre com o turno do
 * mestre (inimigos e NPCs) e segue a ordem dos personagens.
 *
 * turnIndex 0 = mestre; turnIndex i = personagem turnOrder[i - 1].
 */
@Injectable()
export class CombatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  async start(campaignId: string, user: AuthUser) {
    const campaign = await this.masterCampaign(campaignId, user);
    if (campaign.inCombat) {
      throw new BadRequestException('O combate já está em andamento');
    }
    return this.run(campaignId, async (tx) => {
      const characters = await tx.character.findMany({
        where: { campaignId },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      await tx.campaign.update({
        where: { id: campaignId },
        data: {
          inCombat: true,
          round: 1,
          turnIndex: 0,
          turnOrder: characters.map((c) => c.id),
        },
      });
      return writeLog(tx, {
        campaignId,
        actorUserId: user.id,
        type: LogType.TURN,
        message: 'Combate! Rodada 1 — vez do Mestre.',
      });
    });
  }

  async end(campaignId: string, user: AuthUser) {
    const campaign = await this.masterCampaign(campaignId, user);
    if (!campaign.inCombat) {
      throw new BadRequestException('Não há combate em andamento');
    }
    return this.run(campaignId, async (tx) => {
      await tx.campaign.update({
        where: { id: campaignId },
        data: { inCombat: false, round: 0, turnIndex: 0, turnOrder: [] },
      });
      return writeLog(tx, {
        campaignId,
        actorUserId: user.id,
        type: LogType.TURN,
        message: `Fim do combate (${campaign.round} ${campaign.round === 1 ? 'rodada' : 'rodadas'}).`,
      });
    });
  }

  /** Reordena os personagens. O mestre continua abrindo a rodada. */
  async setOrder(campaignId: string, dto: TurnOrderDto, user: AuthUser) {
    const campaign = await this.masterCampaign(campaignId, user);
    if (!campaign.inCombat) {
      throw new BadRequestException('Não há combate em andamento');
    }
    const characters = await this.prisma.character.findMany({
      where: { campaignId },
      select: { id: true, name: true },
    });
    const ids = dto.characterIds;
    const sameSet =
      ids.length === characters.length &&
      new Set(ids).size === ids.length &&
      characters.every((c) => ids.includes(c.id));
    if (!sameSet) {
      throw new BadRequestException(
        'A ordem precisa ter cada personagem da campanha uma vez',
      );
    }

    // quem está com a vez continua com ela
    const current =
      campaign.turnIndex > 0
        ? campaign.turnOrder[campaign.turnIndex - 1]
        : null;
    const turnIndex = current ? ids.indexOf(current) + 1 : 0;
    const nameOf = (id: string) => characters.find((c) => c.id === id)!.name;

    return this.run(campaignId, async (tx) => {
      await tx.campaign.update({
        where: { id: campaignId },
        data: { turnOrder: ids, turnIndex },
      });
      return writeLog(tx, {
        campaignId,
        actorUserId: user.id,
        type: LogType.TURN,
        message: `Nova ordem dos turnos: Mestre, ${ids.map(nameOf).join(', ')}.`,
      });
    });
  }

  /**
   * Passa o turno: o mestre passa qualquer um; o jogador só o do próprio
   * personagem. Fecha o turno de quem estava (vida por turno, desconta a
   * duração das condições) e pula quem está com uma condição que tira a vez.
   */
  async next(campaignId: string, dto: NextTurnDto, user: AuthUser) {
    const campaign = await loadCampaign(this.prisma, campaignId);
    if (campaign.status !== CampaignStatus.ACTIVE || !campaign.inCombat) {
      throw new ForbiddenException('Não há combate em andamento');
    }
    if (
      (dto.round !== undefined && dto.round !== campaign.round) ||
      (dto.turnIndex !== undefined && dto.turnIndex !== campaign.turnIndex)
    ) {
      throw new ConflictException('O turno já passou');
    }

    const isMaster = isCampaignMaster(campaign, user);
    const currentId =
      campaign.turnIndex > 0
        ? campaign.turnOrder[campaign.turnIndex - 1]
        : null;
    if (!isMaster) {
      const mine = currentId
        ? await this.prisma.character.findUnique({ where: { id: currentId } })
        : null;
      if (!mine || mine.userId !== user.id) {
        throw new ForbiddenException('Só dá para encerrar o seu próprio turno');
      }
    }

    return this.run(campaignId, async (tx) => {
      const delta = new DeltaBuilder();
      const parts: string[] = [];
      const order = campaign.turnOrder;
      const load = (id: string) =>
        tx.character.findFirst({
          where: { id, campaignId },
          include: { conditions: true },
        });

      if (currentId) {
        const ch = await load(currentId);
        if (ch) {
          parts.push(`Fim do turno de ${ch.name}`);
          parts.push(...(await endTurnOf(tx, ch, delta)));
        }
      } else {
        parts.push('Fim do turno do Mestre');
        // inimigos agem no turno do mestre: as condições deles descontam aqui
        parts.push(...(await endTurnOfNpcs(tx, campaignId, delta)));
      }

      const from: TurnPos = {
        round: campaign.round,
        turnIndex: campaign.turnIndex,
      };
      let { round, turnIndex } = from;
      let nextName = 'do Mestre';
      // termina: no pior caso todos perdem a vez e a rodada volta ao mestre
      for (;;) {
        turnIndex++;
        if (turnIndex > order.length) {
          turnIndex = 0;
          round++;
          break;
        }
        const ch = await load(order[turnIndex - 1]);
        if (!ch) continue; // saiu da campanha
        const blocker = ch.conditions.find((c) => c.skipsTurn);
        if (blocker) {
          parts.push(`${ch.name} perde a vez (${blocker.name})`);
          parts.push(...(await endTurnOf(tx, ch, delta)));
          continue;
        }
        nextName = `de ${ch.name}`;
        break;
      }

      const to: TurnPos = { round, turnIndex };
      // só passa se ninguém passou antes (dois cliques, mestre e jogador juntos)
      const moved = await tx.campaign.updateMany({
        where: { id: campaignId, inCombat: true, ...from },
        data: to,
      });
      if (!moved.count) throw new ConflictException('O turno já passou');
      delta.turn(campaignId, from, to);

      const head =
        round !== from.round
          ? `Rodada ${round} — vez ${nextName}`
          : `Vez ${nextName}`;
      return writeLog(tx, {
        campaignId,
        actorUserId: user.id,
        type: LogType.TURN,
        message:
          parts.length > 1
            ? `${parts[0]}: ${joinPt(parts.slice(1))}. ${head}.`
            : `${parts[0]}. ${head}.`,
        delta,
      });
    });
  }

  // ── apoio ──

  private async masterCampaign(campaignId: string, user: AuthUser) {
    const campaign: Campaign = await loadCampaign(this.prisma, campaignId);
    assertCampaignMaster(campaign, user);
    if (campaign.status !== CampaignStatus.ACTIVE) {
      throw new ForbiddenException('A aventura não está em andamento');
    }
    return campaign;
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
