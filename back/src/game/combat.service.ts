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
import { joinPt } from './conditions';
import { NextTurnDto, TurnOrderDto } from './dto';
import { DeltaBuilder, Line, same, TurnPos, writeLog } from './journal';
import { COMBAT_REWARD_GOLD } from './rules';

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
        message: 'O combate começa. Rodada 1 — o mundo reage.',
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
      // todo jogador ganha ouro ao fim do combate (sem delta: o fim do combate
      // não se desfaz; se for engano, o mestre ajusta o ouro à mão)
      await tx.character.updateMany({
        where: { campaignId },
        data: { gold: { increment: COMBAT_REWARD_GOLD } },
      });
      return writeLog(tx, {
        campaignId,
        actorUserId: user.id,
        type: LogType.TURN,
        message: `O combate termina (${campaign.round} ${campaign.round === 1 ? 'rodada' : 'rodadas'}). Cada jogador recebe ${COMBAT_REWARD_GOLD} moedas de ouro.`,
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
        message: `Nova ordem da cena: o mundo, ${ids.map(nameOf).join(', ')}.`,
      });
    });
  }

  /**
   * Passa o turno: o mestre passa qualquer um; o jogador só o do próprio
   * personagem. Pula quem está caído. As condições não mudam: quem as
   * gerencia é o mestre.
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
      const parts: Line[] = [];
      const order = campaign.turnOrder;
      const load = (id: string) =>
        tx.character.findFirst({ where: { id, campaignId } });

      if (currentId) {
        const ch = await load(currentId);
        if (ch) parts.push(same(`${ch.name} passa a vez`));
      } else {
        parts.push(same('O mundo termina de reagir'));
      }

      const from: TurnPos = {
        round: campaign.round,
        turnIndex: campaign.turnIndex,
      };
      let { round, turnIndex } = from;
      let nextName: string | null = null; // null = o mundo reage
      // termina: no pior caso todos estão caídos e a rodada volta ao mestre
      for (;;) {
        turnIndex++;
        if (turnIndex > order.length) {
          turnIndex = 0;
          round++;
          break;
        }
        const ch = await load(order[turnIndex - 1]);
        if (!ch) continue; // saiu da campanha
        if (ch.hp === 0) {
          parts.push(same(`${ch.name} está caído e perde a vez`));
          continue;
        }
        nextName = ch.name;
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
        nextName === null
          ? `Rodada ${round} — o mundo reage`
          : `O foco passa a ${nextName}`;
      // jogadores leem a versão sem a vida dos inimigos; o mestre, a completa
      const compose = (pick: (l: Line) => string) => {
        const texts = parts.map(pick);
        return texts.length > 1
          ? `${texts[0]}: ${joinPt(texts.slice(1))}. ${head}.`
          : `${texts[0]}. ${head}.`;
      };
      return writeLog(tx, {
        campaignId,
        actorUserId: user.id,
        type: LogType.TURN,
        message: compose((l) => l.public),
        masterMessage: compose((l) => l.master),
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
