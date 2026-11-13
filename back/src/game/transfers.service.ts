import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Campaign,
  CampaignStatus,
  Character,
  LogType,
  Prisma,
  Transfer,
  TransferKind,
  TransferStatus,
} from '@prisma/client';
import type { AuthUser } from '../auth/auth-user';
import { assertCampaignMember, loadCampaign } from '../campaigns/access';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { LogDto } from '../realtime/state';
import { OfferDto } from './dto';
import { DeltaBuilder, writeLog } from './journal';

type Tx = Prisma.TransactionClient;
type TransferFull = Transfer & { from: Character; to: Character };

/** A oferta como o app a recebe (só nomes e quantidades, nada secreto). */
export interface TransferView {
  id: string;
  campaignId: string;
  kind: TransferKind;
  status: TransferStatus;
  from: { id: string; name: string };
  to: { id: string; name: string };
  give: { name: string; qty: number } | null;
  gold: number;
  ask: { name: string; qty: number } | null;
}

const qtyLabel = (qty: number) => (qty > 1 ? `${qty}× ` : '');

/**
 * Doações e trocas entre jogadores. Quem oferece escolhe o que dar (um item ou
 * ouro) e, na troca, o que pede em troca; quem recebe aceita ou recusa num
 * popup. Nada fica trancado enquanto a oferta espera: ao aceitar, o servidor
 * confere tudo de novo e só então move.
 */
@Injectable()
export class TransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  /** Cria a oferta e avisa quem oferece e quem recebe. */
  async offer(fromCharacterId: string, dto: OfferDto, user: AuthUser) {
    const from = await this.prisma.character.findUnique({
      where: { id: fromCharacterId },
    });
    if (!from) throw new NotFoundException('Personagem não encontrado');
    const campaign = await loadCampaign(this.prisma, from.campaignId);
    this.assertActive(campaign);
    if (from.userId !== user.id) {
      throw new ForbiddenException('Só o dono da ficha faz uma oferta');
    }
    // em combate só quem está na vez oferece; fora dele, qualquer um
    if (campaign.inCombat) {
      const current =
        campaign.turnIndex > 0
          ? campaign.turnOrder[campaign.turnIndex - 1]
          : null;
      if (current !== from.id) {
        throw new ForbiddenException(
          'Em combate só dá para oferecer na sua vez',
        );
      }
    }

    if (dto.toCharacterId === from.id) {
      throw new BadRequestException('Escolha outro jogador');
    }
    const to = await this.prisma.character.findFirst({
      where: { id: dto.toCharacterId, campaignId: from.campaignId },
    });
    if (!to) {
      throw new BadRequestException('Esse jogador não está nesta campanha');
    }
    const open = await this.prisma.transfer.findFirst({
      where: { fromId: from.id, status: TransferStatus.PENDING },
      select: { id: true },
    });
    if (open) {
      throw new BadRequestException(
        'Você já tem uma oferta aguardando resposta',
      );
    }

    let give: { id: string; name: string; qty: number } | null = null;
    let ask: { id: string; name: string; qty: number } | null = null;
    let gold = 0;

    if (dto.kind === TransferKind.GIFT) {
      if (!!dto.itemId === (dto.gold !== undefined)) {
        throw new BadRequestException('Escolha um item ou um valor em ouro');
      }
      if (dto.askItemId || dto.askQty !== undefined) {
        throw new BadRequestException('Uma doação não pede nada em troca');
      }
      if (dto.gold !== undefined) {
        gold = dto.gold;
        if (from.gold < gold) {
          throw new BadRequestException(
            `Ouro insuficiente: você tem ${from.gold}`,
          );
        }
      } else {
        give = await this.stack(this.prisma, from, dto.itemId!, dto.qty ?? 1);
      }
    } else {
      if (dto.gold !== undefined) {
        throw new BadRequestException('Ouro só pode ser doado, não trocado');
      }
      if (!dto.itemId || !dto.askItemId) {
        throw new BadRequestException(
          'Escolha o seu item e o item que você quer em troca',
        );
      }
      give = await this.stack(this.prisma, from, dto.itemId, dto.qty ?? 1);
      ask = await this.stack(this.prisma, to, dto.askItemId, dto.askQty ?? 1);
    }

    const created = await this.prisma.transfer.create({
      data: {
        campaignId: from.campaignId,
        fromId: from.id,
        toId: to.id,
        kind: dto.kind,
        giveItemId: give?.id,
        giveName: give?.name,
        giveQty: give?.qty ?? 1,
        giveGold: gold,
        askItemId: ask?.id,
        askName: ask?.name,
        askQty: ask?.qty ?? 1,
      },
      include: { from: true, to: true },
    });
    const view = this.view(created);
    this.notify(created, 'transfer:new', view);
    return { transfer: view };
  }

  /** Quem recebe aceita: confere de novo e move tudo de uma vez. */
  async accept(transferId: string, user: AuthUser) {
    const t = await this.load(transferId);
    if (t.to.userId !== user.id) {
      throw new ForbiddenException('Só quem recebe a oferta responde');
    }
    const campaign = await loadCampaign(this.prisma, t.campaignId);
    this.assertActive(campaign);
    if (t.status !== TransferStatus.PENDING) {
      throw new BadRequestException('Essa oferta não está mais aberta');
    }

    const problem = await this.problem(this.prisma, t);
    if (problem) {
      await this.close(t, TransferStatus.CANCELLED);
      throw new BadRequestException(`A oferta não vale mais: ${problem}`);
    }

    const result = await this.run(t.campaignId, async (tx) => {
      // reivindica a oferta: se outro clique já aceitou, para aqui
      const claimed = await tx.transfer.updateMany({
        where: { id: t.id, status: TransferStatus.PENDING },
        data: { status: TransferStatus.ACCEPTED, resolvedAt: new Date() },
      });
      if (!claimed.count) {
        throw new BadRequestException('Essa oferta não está mais aberta');
      }

      const delta = new DeltaBuilder();
      let message: string;
      if (t.kind === TransferKind.GIFT && t.giveGold > 0) {
        await this.moveGold(tx, t.fromId, t.toId, t.giveGold, delta);
        message = `${t.from.name} deu ${t.giveGold} de ouro a ${t.to.name}`;
      } else if (t.kind === TransferKind.GIFT) {
        await this.moveItem(
          tx,
          t.giveItemId!,
          t.fromId,
          t.toId,
          t.giveQty,
          delta,
        );
        message = `${t.from.name} deu ${qtyLabel(t.giveQty)}${t.giveName} a ${t.to.name}`;
      } else {
        await this.moveItem(
          tx,
          t.giveItemId!,
          t.fromId,
          t.toId,
          t.giveQty,
          delta,
        );
        await this.moveItem(
          tx,
          t.askItemId!,
          t.toId,
          t.fromId,
          t.askQty,
          delta,
        );
        message = `${t.from.name} e ${t.to.name} trocaram ${qtyLabel(t.giveQty)}${t.giveName} por ${qtyLabel(t.askQty)}${t.askName}`;
      }

      return writeLog(tx, {
        campaignId: t.campaignId,
        actorUserId: user.id,
        characterId: t.fromId,
        type: LogType.ITEM_ADDED,
        message,
        delta,
      });
    });

    const done = await this.load(t.id);
    this.notify(done, 'transfer:updated', this.view(done));
    return result;
  }

  /** Quem recebe recusa. */
  async decline(transferId: string, user: AuthUser) {
    const t = await this.load(transferId);
    if (t.to.userId !== user.id) {
      throw new ForbiddenException('Só quem recebe a oferta responde');
    }
    return this.close(t, TransferStatus.DECLINED, true);
  }

  /** Quem ofereceu desiste. */
  async cancel(transferId: string, user: AuthUser) {
    const t = await this.load(transferId);
    if (t.from.userId !== user.id) {
      throw new ForbiddenException('Só quem fez a oferta pode cancelar');
    }
    return this.close(t, TransferStatus.CANCELLED, true);
  }

  /** As ofertas abertas em que o personagem do usuário oferece ou recebe. */
  async mine(campaignId: string, user: AuthUser) {
    const campaign = await loadCampaign(this.prisma, campaignId);
    await assertCampaignMember(this.prisma, campaign, user);
    const me = await this.prisma.character.findUnique({
      where: { campaignId_userId: { campaignId, userId: user.id } },
    });
    if (!me) return { transfers: [] as TransferView[] };
    const list = await this.prisma.transfer.findMany({
      where: {
        campaignId,
        status: TransferStatus.PENDING,
        OR: [{ fromId: me.id }, { toId: me.id }],
      },
      include: { from: true, to: true },
      orderBy: { createdAt: 'asc' },
    });
    return { transfers: list.map((t) => this.view(t)) };
  }

  // ───────────────────────── apoio ─────────────────────────

  private assertActive(campaign: Campaign) {
    if (campaign.status !== CampaignStatus.ACTIVE) {
      throw new ForbiddenException('A aventura não está em andamento');
    }
  }

  private async load(id: string): Promise<TransferFull> {
    const t = await this.prisma.transfer.findUnique({
      where: { id },
      include: { from: true, to: true },
    });
    if (!t) throw new NotFoundException('Oferta não encontrada');
    return t;
  }

  /** Item do inventário do personagem, com a quantidade pedida disponível. */
  private async stack(
    db: Tx | PrismaService,
    owner: Character,
    itemId: string,
    qty: number,
  ) {
    const item = await db.inventoryItem.findFirst({
      where: { id: itemId, characterId: owner.id },
    });
    if (!item) {
      throw new BadRequestException(
        `Esse item não está no inventário de ${owner.name}`,
      );
    }
    if (item.qty < qty) {
      throw new BadRequestException(
        `${owner.name} só tem ${item.qty}× ${item.name}`,
      );
    }
    return { id: item.id, name: item.name, qty };
  }

  /** O que impede a oferta de valer agora (null = está tudo certo). */
  private async problem(db: Tx | PrismaService, t: TransferFull) {
    if (t.giveGold > 0) {
      const from = await db.character.findUnique({ where: { id: t.fromId } });
      if (!from || from.gold < t.giveGold) {
        return `${t.from.name} não tem mais ${t.giveGold} de ouro`;
      }
    }
    if (t.giveItemId) {
      const item = await db.inventoryItem.findFirst({
        where: { id: t.giveItemId, characterId: t.fromId },
      });
      if (!item) return `${t.from.name} não tem mais ${t.giveName}`;
      if (item.qty < t.giveQty) {
        return `${t.from.name} só tem ${item.qty}× ${item.name}`;
      }
    }
    if (t.askItemId) {
      const item = await db.inventoryItem.findFirst({
        where: { id: t.askItemId, characterId: t.toId },
      });
      if (!item) return `${t.to.name} não tem mais ${t.askName}`;
      if (item.qty < t.askQty) {
        return `${t.to.name} só tem ${item.qty}× ${item.name}`;
      }
    }
    return null;
  }

  /** Tira `qty` do dono (direto no banco) e entrega ao outro, juntando na pilha igual. */
  private async moveItem(
    tx: Tx,
    itemId: string,
    fromId: string,
    toId: string,
    qty: number,
    delta: DeltaBuilder,
  ) {
    const item = await tx.inventoryItem.findFirst({
      where: { id: itemId, characterId: fromId },
    });
    if (!item || item.qty < qty) {
      throw new BadRequestException(
        `${item?.name ?? 'O item'} mudou: não dá para passar ${qty}`,
      );
    }
    const took = await tx.inventoryItem.updateMany({
      where: { id: itemId, characterId: fromId, qty: { gte: qty } },
      data: { qty: { decrement: qty } },
    });
    if (!took.count) {
      throw new BadRequestException(
        `${item.name} mudou: não dá para passar ${qty}`,
      );
    }
    if (item.qty === qty) {
      delta.deletedItem(item);
      await tx.inventoryItem.deleteMany({
        where: { id: itemId, qty: { lte: 0 } },
      });
    } else {
      delta.itemQty(itemId, -qty);
    }

    const same = await tx.inventoryItem.findFirst({
      where: {
        characterId: toId,
        code: item.code,
        name: item.name,
        description: item.description,
      },
      orderBy: { createdAt: 'asc' },
    });
    if (same) {
      await tx.inventoryItem.update({
        where: { id: same.id },
        data: { qty: { increment: qty } },
      });
      delta.itemQty(same.id, qty);
    } else {
      const copy = await tx.inventoryItem.create({
        data: {
          characterId: toId,
          name: item.name,
          qty,
          description: item.description,
          code: item.code,
        },
      });
      delta.created('items', copy.id);
    }
  }

  private async moveGold(
    tx: Tx,
    fromId: string,
    toId: string,
    gold: number,
    delta: DeltaBuilder,
  ) {
    const took = await tx.character.updateMany({
      where: { id: fromId, gold: { gte: gold } },
      data: { gold: { decrement: gold } },
    });
    if (!took.count) throw new BadRequestException('Ouro insuficiente');
    await tx.character.update({
      where: { id: toId },
      data: { gold: { increment: gold } },
    });
    delta.stat(fromId, { gold: -gold });
    delta.stat(toId, { gold });
  }

  /** Recusa ou cancelamento: só vale se ainda estiver aberta. Sem log. */
  private async close(t: TransferFull, status: TransferStatus, strict = false) {
    const closed = await this.prisma.transfer.updateMany({
      where: { id: t.id, status: TransferStatus.PENDING },
      data: { status, resolvedAt: new Date() },
    });
    if (!closed.count) {
      if (strict) {
        throw new BadRequestException('Essa oferta não está mais aberta');
      }
      return { transfer: this.view(t) };
    }
    const view = { ...this.view(t), status };
    this.notify(t, 'transfer:updated', view);
    return { transfer: view };
  }

  private view(t: TransferFull): TransferView {
    return {
      id: t.id,
      campaignId: t.campaignId,
      kind: t.kind,
      status: t.status,
      from: { id: t.from.id, name: t.from.name },
      to: { id: t.to.id, name: t.to.name },
      give: t.giveItemId ? { name: t.giveName ?? '', qty: t.giveQty } : null,
      gold: t.giveGold,
      ask: t.askItemId ? { name: t.askName ?? '', qty: t.askQty } : null,
    };
  }

  /** Só os dois donos recebem; ninguém mais na campanha vê a oferta. */
  private notify(t: TransferFull, event: string, view: TransferView) {
    this.realtime.toUser(t.from.userId, event, view);
    this.realtime.toUser(t.to.userId, event, view);
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
