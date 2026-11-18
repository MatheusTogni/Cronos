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
} from '@prisma/client';
import { randomInt } from 'node:crypto';
import type { AuthUser } from '../auth/auth-user';
import {
  assertCampaignMember,
  isCampaignMaster,
  loadCampaign,
} from '../campaigns/access';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { isMasterOnlyLog, LogDto } from '../realtime/state';
import { lockAction, skillUsedThisTurn } from './action';
import { lockBackpack, stackFor } from './backpack';
import {
  AdjustDto,
  AdjustSummonDto,
  BuyDto,
  CreateConditionDto,
  CreateItemDto,
  CreateSummonDto,
  NoteDto,
  RollDto,
  UpdateCharacterDto,
  UpdateItemDto,
  UpdateSummonDto,
} from './dto';
import { applyCondition, conditionAddedMessage, joinPt } from './conditions';
import {
  applyStats,
  clamp,
  Delta,
  DeltaBuilder,
  revertDelta,
  writeLog,
} from './journal';
import { MAX_LEVEL } from './rules';
import { shopItem } from './shop';

type Tx = Prisma.TransactionClient;

interface Ctx {
  campaign: Campaign;
  character: Character;
  isMaster: boolean;
  isOwner: boolean;
}

@Injectable()
export class GameService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  // ───────────────────────── habilidades ─────────────────────────

  /**
   * O jogador toca na skill: o app só gasta a mana e registra no log. Dano,
   * efeitos e condições são do mestre, que resolve tudo pela interface dele.
   * Em combate vale uma habilidade por turno (ver action.ts); o mestre não tem
   * esse limite.
   */
  async useAbility(characterId: string, abilityId: string, user: AuthUser) {
    const ctx = await this.characterCtx(characterId, user, { owner: true });
    this.assertTurn(ctx);

    return this.run(ctx.campaign.id, async (tx) => {
      await lockAction(tx, characterId);
      const ch = await tx.character.findUniqueOrThrow({
        where: { id: characterId },
      });
      if (ch.hp === 0) {
        throw new BadRequestException(`${ch.name} está caído e não pode agir`);
      }
      const ability = await tx.ability.findUnique({ where: { id: abilityId } });
      if (!ability || ability.classId !== ch.classId) {
        throw new NotFoundException(
          'Habilidade não encontrada para esta classe',
        );
      }
      if (ability.unlockLevel > ch.level) {
        throw new BadRequestException(
          `${ability.name} só é liberada no nível ${ability.unlockLevel} e ${ch.name} está no nível ${ch.level}`,
        );
      }
      if (
        ctx.campaign.inCombat &&
        !ctx.isMaster &&
        (await skillUsedThisTurn(tx, ch.campaignId, ch.id))
      ) {
        throw new BadRequestException(
          `${ch.name} já usou uma habilidade neste turno: só uma por turno`,
        );
      }
      if (ch.mana < ability.manaCost) {
        throw new BadRequestException(
          `Mana insuficiente: ${ability.name} custa ${ability.manaCost} e ${ch.name} tem ${ch.mana}`,
        );
      }

      const delta = new DeltaBuilder();
      await applyStats(tx, ch, { mana: -ability.manaCost }, delta);

      const cost = ability.manaCost ? ` (−${ability.manaCost} mana)` : '';
      return writeLog(tx, {
        campaignId: ch.campaignId,
        actorUserId: user.id,
        characterId: ch.id,
        type: LogType.ABILITY_USED,
        message: `${ch.name} usou ${ability.name}${cost}`,
        delta,
      });
    });
  }

  // ───────────────────────── vida / mana / XP / ouro ─────────────────────────

  async adjust(characterId: string, dto: AdjustDto, user: AuthUser) {
    const ctx = await this.characterCtx(characterId, user, { owner: false });
    const req = {
      hp: dto.hp ?? 0,
      mana: dto.mana ?? 0,
      xp: dto.xp ?? 0,
      level: dto.level ?? 0,
      gold: dto.gold ?? 0,
    };
    if (!req.hp && !req.mana && !req.xp && !req.level && !req.gold) {
      throw new BadRequestException('Informe algum valor diferente de zero');
    }

    return this.run(ctx.campaign.id, async (tx) => {
      const ch = await tx.character.findUniqueOrThrow({
        where: { id: characterId },
      });
      // pedir só para subir/descer de nível quando já está no limite não faz nada
      const onlyLevel = !req.hp && !req.mana && !req.xp && !req.gold;
      if (onlyLevel && clamp(ch.level + req.level, 1, MAX_LEVEL) === ch.level) {
        throw new BadRequestException(
          req.level > 0
            ? `${ch.name} já está no nível máximo (${MAX_LEVEL})`
            : `${ch.name} já está no nível 1`,
        );
      }
      const delta = new DeltaBuilder();
      const { character: after, applied } = await applyStats(
        tx,
        ch,
        req,
        delta,
      );

      const parts: string[] = [];
      if (req.hp < 0) parts.push(`recebeu ${-req.hp} de dano`);
      if (req.hp > 0) parts.push(`recuperou ${req.hp} de vida`);
      if (req.mana < 0) parts.push(`perdeu ${-req.mana} de mana`);
      if (req.mana > 0) parts.push(`recuperou ${req.mana} de mana`);
      if (req.xp > 0) parts.push(`ganhou ${req.xp} de XP`);
      if (req.xp < 0) parts.push(`perdeu ${-req.xp} de XP`);
      if (req.gold > 0) parts.push(`recebeu ${req.gold} de ouro`);
      if (req.gold < 0) parts.push(`perdeu ${-req.gold} de ouro`);
      if (applied.level > 0) {
        parts.push(
          `subiu para o nível ${after.level} (vida máxima +${applied.hpMax}, mana máxima +${applied.manaMax})`,
        );
        const unlocked = await tx.ability.findMany({
          where: {
            classId: ch.classId,
            unlockLevel: { gt: ch.level, lte: after.level },
          },
          orderBy: { sortOrder: 'asc' },
        });
        if (unlocked.length) {
          parts.push(
            `liberou ${unlocked.length > 1 ? 'as habilidades' : 'a habilidade'} ${joinPt(unlocked.map((a) => a.name))}`,
          );
        }
      }
      if (applied.level < 0) {
        parts.push(
          `voltou para o nível ${after.level} (vida máxima −${-applied.hpMax}, mana máxima −${-applied.manaMax})`,
        );
      }

      const status: string[] = [];
      if (req.hp) status.push(`vida ${after.hp}/${after.hpMax}`);
      if (req.mana) status.push(`mana ${after.mana}/${after.manaMax}`);
      if (req.gold) status.push(`ouro ${after.gold}`);

      let message = `${ch.name} ${joinPt(parts)}`;
      if (status.length) message += ` (${status.join(', ')})`;
      if (req.hp < 0 && after.hp === 0) message += ' — caiu!';
      if (dto.reason) message += ` — ${dto.reason}`;

      const type =
        req.hp < 0
          ? LogType.DAMAGE
          : req.hp > 0
            ? LogType.HEAL
            : req.mana
              ? LogType.MANA
              : req.xp
                ? LogType.XP
                : req.gold
                  ? req.gold > 0
                    ? LogType.ITEM_ADDED
                    : LogType.ITEM_REMOVED
                  : LogType.LEVEL;

      return writeLog(tx, {
        campaignId: ch.campaignId,
        actorUserId: user.id,
        characterId: ch.id,
        type,
        message,
        delta,
      });
    });
  }

  async updateCharacter(
    characterId: string,
    dto: UpdateCharacterDto,
    user: AuthUser,
  ) {
    const ctx = await this.characterCtx(characterId, user, {
      owner: true,
      requireActive: false,
    });
    const touchesStats =
      dto.name !== undefined ||
      dto.hpMax !== undefined ||
      dto.manaMax !== undefined;
    if (touchesStats && !ctx.isMaster) {
      throw new ForbiddenException(
        'Só o mestre muda nome, vida máxima e mana máxima',
      );
    }

    const ch = ctx.character;
    const hpMax = dto.hpMax ?? ch.hpMax;
    const manaMax = dto.manaMax ?? ch.manaMax;

    return this.run(ctx.campaign.id, async (tx) => {
      await tx.character.update({
        where: { id: ch.id },
        data: {
          name: dto.name,
          notes: dto.notes,
          hpMax,
          manaMax,
          hp: clamp(ch.hp, 0, hpMax),
          mana: clamp(ch.mana, 0, manaMax),
        },
      });

      const changes: string[] = [];
      if (dto.name && dto.name !== ch.name) {
        changes.push(`nome: ${ch.name} → ${dto.name}`);
      }
      if (hpMax !== ch.hpMax)
        changes.push(`vida máxima ${ch.hpMax} → ${hpMax}`);
      if (manaMax !== ch.manaMax) {
        changes.push(`mana máxima ${ch.manaMax} → ${manaMax}`);
      }
      if (!changes.length) return null;
      return writeLog(tx, {
        campaignId: ch.campaignId,
        actorUserId: user.id,
        characterId: ch.id,
        type: LogType.NOTE,
        message: `Ficha de ${dto.name ?? ch.name} ajustada: ${changes.join(', ')}`,
      });
    });
  }

  // ───────────────────────── invocações ─────────────────────────

  async createSummon(
    characterId: string,
    dto: CreateSummonDto,
    user: AuthUser,
  ) {
    const ctx = await this.characterCtx(characterId, user, { owner: false });
    return this.run(ctx.campaign.id, async (tx) => {
      const delta = new DeltaBuilder();
      const summon = await tx.summon.create({
        data: {
          characterId,
          name: dto.name,
          hp: dto.hpMax,
          hpMax: dto.hpMax,
        },
      });
      delta.created('summons', summon.id);
      return writeLog(tx, {
        campaignId: ctx.campaign.id,
        actorUserId: user.id,
        characterId,
        type: LogType.SUMMON_CREATED,
        message: `${summon.name} agora acompanha ${ctx.character.name} (vida ${summon.hp}/${summon.hpMax})`,
        delta,
      });
    });
  }

  async updateSummon(summonId: string, dto: UpdateSummonDto, user: AuthUser) {
    const { ctx, summon } = await this.summonCtx(summonId, user, {
      owner: false,
    });
    const hpMax = dto.hpMax ?? summon.hpMax;
    return this.run(ctx.campaign.id, async (tx) => {
      await tx.summon.update({
        where: { id: summonId },
        data: {
          name: dto.name,
          notes: dto.notes,
          hpMax,
          hp: clamp(summon.hp, 0, hpMax),
        },
      });
      return null;
    });
  }

  async adjustSummon(summonId: string, dto: AdjustSummonDto, user: AuthUser) {
    const { ctx, summon } = await this.summonCtx(summonId, user, {
      owner: false,
    });
    if (!dto.hp)
      throw new BadRequestException('Informe um valor diferente de zero');

    return this.run(ctx.campaign.id, async (tx) => {
      const hp = clamp(summon.hp + dto.hp, 0, summon.hpMax);
      const delta = new DeltaBuilder();
      delta.summonHp(summon.id, hp - summon.hp);
      await tx.summon.update({ where: { id: summon.id }, data: { hp } });

      let message =
        dto.hp < 0
          ? `${summon.name} (de ${ctx.character.name}) recebeu ${-dto.hp} de dano`
          : `${summon.name} (de ${ctx.character.name}) recuperou ${dto.hp} de vida`;
      message += ` (vida ${hp}/${summon.hpMax})`;
      if (dto.hp < 0 && hp === 0) message += ' — caiu!';
      if (dto.reason) message += ` — ${dto.reason}`;

      return writeLog(tx, {
        campaignId: ctx.campaign.id,
        actorUserId: user.id,
        characterId: ctx.character.id,
        type: LogType.SUMMON_UPDATED,
        message,
        delta,
      });
    });
  }

  async removeSummon(summonId: string, user: AuthUser) {
    const { ctx, summon } = await this.summonCtx(summonId, user, {
      owner: false,
    });
    return this.run(ctx.campaign.id, async (tx) => {
      const full = await tx.summon.findUniqueOrThrow({
        where: { id: summon.id },
        include: { conditions: true },
      });
      const delta = new DeltaBuilder();
      delta.deletedSummon(full);
      await tx.summon.delete({ where: { id: summon.id } });
      return writeLog(tx, {
        campaignId: ctx.campaign.id,
        actorUserId: user.id,
        characterId: ctx.character.id,
        type: LogType.SUMMON_REMOVED,
        message: `${summon.name} deixou de acompanhar ${ctx.character.name}`,
        delta,
      });
    });
  }

  // ───────────────────────── condições ─────────────────────────

  async createCondition(
    characterId: string,
    dto: CreateConditionDto,
    user: AuthUser,
  ) {
    const ctx = await this.characterCtx(characterId, user, { owner: false });
    return this.run(ctx.campaign.id, async (tx) => {
      const delta = new DeltaBuilder();
      const { condition } = await applyCondition(
        tx,
        { characterId },
        { ...dto, source: ctx.isMaster ? 'Mestre' : ctx.character.name },
        delta,
      );
      return writeLog(tx, {
        campaignId: ctx.campaign.id,
        actorUserId: user.id,
        characterId,
        type: LogType.CONDITION_ADDED,
        message: conditionAddedMessage(ctx.character.name, condition),
        delta,
      });
    });
  }

  /** Condição numa invocação. */
  async createSummonCondition(
    summonId: string,
    dto: CreateConditionDto,
    user: AuthUser,
  ) {
    const { ctx, summon } = await this.summonCtx(summonId, user, {
      owner: false,
    });
    return this.run(ctx.campaign.id, async (tx) => {
      const delta = new DeltaBuilder();
      const { condition } = await applyCondition(
        tx,
        { summonId },
        { ...dto, source: 'Mestre' },
        delta,
      );
      return writeLog(tx, {
        campaignId: ctx.campaign.id,
        actorUserId: user.id,
        characterId: ctx.character.id,
        type: LogType.CONDITION_ADDED,
        message: conditionAddedMessage(
          `${summon.name} (de ${ctx.character.name})`,
          condition,
        ),
        delta,
      });
    });
  }

  async removeCondition(conditionId: string, user: AuthUser) {
    const condition = await this.prisma.condition.findUnique({
      where: { id: conditionId },
      include: { summon: true, npc: true },
    });
    if (!condition) throw new NotFoundException('Condição não encontrada');

    let campaignId: string;
    let characterId: string | null = null;
    let holder: string;
    if (condition.npc) {
      // inimigo: só o mestre, com a aventura em andamento
      const campaign = await this.activeCampaign(
        condition.npc.campaignId,
        user,
      );
      if (!isCampaignMaster(campaign, user)) {
        throw new ForbiddenException('Só o mestre pode fazer isso');
      }
      campaignId = campaign.id;
      holder = condition.npc.name;
    } else {
      const ownerId = condition.characterId ?? condition.summon?.characterId;
      if (!ownerId) throw new NotFoundException('Condição não encontrada');
      const ctx = await this.characterCtx(ownerId, user, { owner: false });
      campaignId = ctx.campaign.id;
      characterId = ownerId;
      holder = condition.summon?.name ?? ctx.character.name;
    }

    return this.run(campaignId, async (tx) => {
      const delta = new DeltaBuilder();
      delta.deletedCondition(condition);
      await tx.condition.delete({ where: { id: conditionId } });
      return writeLog(tx, {
        campaignId,
        actorUserId: user.id,
        characterId,
        // condição de inimigo: NPC_UPDATED, para o log ficar só com o mestre
        type: condition.npc ? LogType.NPC_UPDATED : LogType.CONDITION_REMOVED,
        message: `${holder} não está mais com ${condition.name}`,
        delta,
      });
    });
  }

  // ───────────────────────── inventário ─────────────────────────

  async createItem(characterId: string, dto: CreateItemDto, user: AuthUser) {
    const ctx = await this.characterCtx(characterId, user, { owner: false });
    const qty = dto.qty ?? 1;
    return this.run(ctx.campaign.id, async (tx) => {
      await lockBackpack(tx, characterId);
      // o mesmo item soma na pilha que a pessoa já tem; um item novo precisa de
      // um quadradinho livre na mochila (senão, recusa)
      const stack = await stackFor(tx, ctx.character, {
        code: null,
        name: dto.name,
      });
      const delta = new DeltaBuilder();
      let name = dto.name;
      if (stack) {
        await tx.inventoryItem.update({
          where: { id: stack.id },
          data: {
            qty: { increment: qty },
            // a pilha sem descrição ganha a que o mestre escreveu agora
            ...(dto.description && !stack.description
              ? { description: dto.description }
              : {}),
          },
        });
        delta.itemQty(stack.id, qty);
        name = stack.name;
      } else {
        const item = await tx.inventoryItem.create({
          data: {
            characterId,
            name: dto.name,
            qty,
            description: dto.description || null,
          },
        });
        delta.created('items', item.id);
      }
      return writeLog(tx, {
        campaignId: ctx.campaign.id,
        actorUserId: user.id,
        characterId,
        type: LogType.ITEM_ADDED,
        message: `${ctx.character.name} pegou ${qty > 1 ? `${qty}× ` : ''}${name}`,
        delta,
      });
    });
  }

  async updateItem(itemId: string, dto: UpdateItemDto, user: AuthUser) {
    const { ctx, item } = await this.itemCtx(itemId, user);
    return this.run(ctx.campaign.id, async (tx) => {
      if (dto.qty === 0) {
        // sem unidades não sobra quadradinho: o item sai da mochila
        const removed = new DeltaBuilder();
        removed.deletedItem(item);
        await tx.inventoryItem.delete({ where: { id: itemId } });
        return writeLog(tx, {
          campaignId: ctx.campaign.id,
          actorUserId: user.id,
          characterId: ctx.character.id,
          type: LogType.ITEM_REMOVED,
          message: `${ctx.character.name} não tem mais ${item.name}`,
          delta: removed,
        });
      }
      await tx.inventoryItem.update({
        where: { id: itemId },
        data: {
          name: dto.name,
          qty: dto.qty,
          description: dto.description === '' ? null : dto.description,
        },
      });
      if (dto.qty === undefined || dto.qty === item.qty) return null;
      const delta = new DeltaBuilder();
      delta.itemQty(item.id, dto.qty - item.qty);
      return writeLog(tx, {
        campaignId: ctx.campaign.id,
        actorUserId: user.id,
        characterId: ctx.character.id,
        type: LogType.ITEM_UPDATED,
        message: `${ctx.character.name}: ${dto.name ?? item.name} ${item.qty} → ${dto.qty}`,
        delta,
      });
    });
  }

  async removeItem(itemId: string, user: AuthUser) {
    const { ctx, item } = await this.itemCtx(itemId, user);
    return this.run(ctx.campaign.id, async (tx) => {
      const delta = new DeltaBuilder();
      delta.deletedItem(item);
      await tx.inventoryItem.delete({ where: { id: itemId } });
      return writeLog(tx, {
        campaignId: ctx.campaign.id,
        actorUserId: user.id,
        characterId: ctx.character.id,
        type: LogType.ITEM_REMOVED,
        message: `${ctx.character.name} não tem mais ${item.name}`,
        delta,
      });
    });
  }

  // ───────────────────────── loja e itens ─────────────────────────

  /** O mestre abre ou fecha a loja do mercador para os jogadores. */
  async setShop(campaignId: string, open: boolean, user: AuthUser) {
    const campaign = await this.activeCampaign(campaignId, user);
    if (!isCampaignMaster(campaign, user)) {
      throw new ForbiddenException('Só o mestre abre a loja');
    }
    if (campaign.shopOpen === open) {
      throw new BadRequestException(
        open ? 'A loja já está aberta' : 'A loja já está fechada',
      );
    }
    return this.run(campaignId, async (tx) => {
      await tx.campaign.update({
        where: { id: campaignId },
        data: { shopOpen: open },
      });
      return writeLog(tx, {
        campaignId,
        actorUserId: user.id,
        type: LogType.NOTE,
        message: open
          ? 'O mercador abriu a loja.'
          : 'O mercador fechou as portas.',
      });
    });
  }

  /** O jogador compra 1 unidade de um item do catálogo com o próprio ouro. */
  async buy(characterId: string, dto: BuyDto, user: AuthUser) {
    const ctx = await this.characterCtx(characterId, user, { owner: true });
    if (!ctx.campaign.shopOpen) {
      throw new BadRequestException('A loja está fechada');
    }
    const product = shopItem(dto.item);
    if (!product) throw new BadRequestException('Esse item não está à venda');

    return this.run(ctx.campaign.id, async (tx) => {
      // cobra direto no banco: só passa se ainda houver o ouro, então dois
      // cliques seguidos não gastam a mesma moeda duas vezes
      const paid = await tx.character.updateMany({
        where: { id: characterId, gold: { gte: product.price } },
        data: { gold: { decrement: product.price } },
      });
      if (!paid.count) {
        throw new BadRequestException(
          `Ouro insuficiente: ${product.name} custa ${product.price}`,
        );
      }
      const delta = new DeltaBuilder();
      delta.stat(characterId, { gold: -product.price });

      // o mesmo item soma na pilha; um item novo precisa de um quadradinho
      // livre (se a mochila está cheia, recusa e a transação desfaz o pagamento)
      const stack = await stackFor(tx, ctx.character, product);
      if (stack) {
        await tx.inventoryItem.update({
          where: { id: stack.id },
          data: {
            qty: { increment: 1 },
            // pilha dada à mão pelo mestre vira a do catálogo (passa a poder ser usada)
            ...(stack.code ? {} : { code: product.code }),
          },
        });
        delta.itemQty(stack.id, 1);
      } else {
        const item = await tx.inventoryItem.create({
          data: {
            characterId,
            name: product.name,
            qty: 1,
            description: product.description,
            code: product.code,
          },
        });
        delta.created('items', item.id);
      }

      return writeLog(tx, {
        campaignId: ctx.campaign.id,
        actorUserId: user.id,
        characterId,
        type: LogType.ITEM_ADDED,
        message: `${ctx.character.name} comprou ${product.name} (−${product.price} de ouro)`,
        delta,
      });
    });
  }

  /**
   * O jogador usa um item do catálogo. Poções, ração e elixir curam sozinhos;
   * os demais só gastam o item e registram (o mestre decide o efeito); Corda e
   * Gazua ficam no inventário. Mesma regra das habilidades: em combate só na
   * vez, e quem está caído não age.
   */
  async useItem(itemId: string, user: AuthUser) {
    const { ctx, item } = await this.itemCtx(itemId, user, true);
    this.assertTurn(ctx);
    if (ctx.character.hp === 0) {
      throw new BadRequestException(
        `${ctx.character.name} está caído e não pode agir`,
      );
    }
    const product = shopItem(item.code);
    if (!product) {
      throw new BadRequestException('Esse item não pode ser usado');
    }

    return this.run(ctx.campaign.id, async (tx) => {
      const delta = new DeltaBuilder();

      if (!product.keep) {
        const fresh = await tx.inventoryItem.findUnique({
          where: { id: item.id },
        });
        if (!fresh || fresh.qty < 1) {
          throw new BadRequestException('Você não tem mais esse item');
        }
        // gasta 1 direto no banco (dois cliques não gastam a mesma unidade)
        const spent = await tx.inventoryItem.updateMany({
          where: { id: item.id, qty: { gte: 1 } },
          data: { qty: { decrement: 1 } },
        });
        if (!spent.count) {
          throw new BadRequestException('Você não tem mais esse item');
        }
        if (fresh.qty === 1) {
          delta.deletedItem(fresh);
          await tx.inventoryItem.deleteMany({
            where: { id: item.id, qty: { lte: 0 } },
          });
        } else {
          delta.itemQty(item.id, -1);
        }
      }

      const heals = !!(product.hp || product.mana);
      let message = `${ctx.character.name} usou ${item.name}`;
      let type: LogType = product.keep
        ? LogType.ITEM_UPDATED
        : LogType.ITEM_REMOVED;
      if (heals) {
        const ch = await tx.character.findUniqueOrThrow({
          where: { id: ctx.character.id },
        });
        const { character: after, applied } = await applyStats(
          tx,
          ch,
          { hp: product.hp ?? 0, mana: product.mana ?? 0 },
          delta,
        );
        const gains: string[] = [];
        const status: string[] = [];
        if (product.hp) {
          gains.push(`${applied.hp} de vida`);
          status.push(`vida ${after.hp}/${after.hpMax}`);
        }
        if (product.mana) {
          gains.push(`${applied.mana} de mana`);
          status.push(`mana ${after.mana}/${after.manaMax}`);
        }
        message += ` e recuperou ${joinPt(gains)} (${status.join(', ')})`;
        type = product.hp ? LogType.HEAL : LogType.MANA;
      }

      return writeLog(tx, {
        campaignId: ctx.campaign.id,
        actorUserId: user.id,
        characterId: ctx.character.id,
        type,
        message,
        delta,
      });
    });
  }

  // ───────────────────────── mesa ─────────────────────────

  async roll(campaignId: string, dto: RollDto, user: AuthUser) {
    const campaign = await this.activeCampaign(campaignId, user);
    const sides = dto.sides ?? 20;
    if (dto.value !== undefined && dto.value > sides) {
      throw new BadRequestException(`Um d${sides} vai de 1 a ${sides}`);
    }
    const value = dto.value ?? randomInt(1, sides + 1);

    const character = isCampaignMaster(campaign, user)
      ? null
      : await this.prisma.character.findUnique({
          where: { campaignId_userId: { campaignId, userId: user.id } },
        });
    const who =
      character?.name ??
      (isCampaignMaster(campaign, user) ? 'Mestre' : user.displayName);

    return this.run(campaignId, (tx) =>
      writeLog(tx, {
        campaignId,
        actorUserId: user.id,
        characterId: character?.id,
        type: LogType.DICE_ROLL,
        message:
          `${who} rolou d${sides}: ${value}` +
          (dto.value !== undefined ? ' (dado físico)' : '') +
          (dto.label ? ` — ${dto.label}` : ''),
        roll: value,
      }),
    );
  }

  async note(campaignId: string, dto: NoteDto, user: AuthUser) {
    const campaign = await this.activeCampaign(campaignId, user);
    if (!isCampaignMaster(campaign, user)) {
      throw new ForbiddenException('Só o mestre narra no log');
    }
    return this.run(campaignId, (tx) =>
      writeLog(tx, {
        campaignId,
        actorUserId: user.id,
        type: LogType.NOTE,
        message: dto.message,
      }),
    );
  }

  async revert(logId: string, user: AuthUser) {
    const entry = await this.prisma.logEntry.findUnique({
      where: { id: logId },
    });
    if (!entry) throw new NotFoundException('Registro não encontrado');
    const campaign = await loadCampaign(this.prisma, entry.campaignId);
    if (!isCampaignMaster(campaign, user)) {
      throw new ForbiddenException('Só o mestre pode desfazer');
    }
    if (campaign.status !== CampaignStatus.ACTIVE) {
      throw new ForbiddenException('A campanha não está em andamento');
    }
    if (!entry.delta) {
      throw new BadRequestException('Esse registro não tem o que desfazer');
    }
    if (entry.revertedAt) {
      throw new BadRequestException('Esse registro já foi desfeito');
    }
    const turn = (entry.delta as Delta).turn;
    if (
      turn &&
      (!campaign.inCombat ||
        campaign.round !== turn.to.round ||
        campaign.turnIndex !== turn.to.turnIndex)
    ) {
      throw new BadRequestException(
        'Só dá para desfazer a última passagem de turno do combate atual',
      );
    }

    const log = await this.run(entry.campaignId, async (tx) => {
      // Marca primeiro, condicionado a ainda não ter sido desfeito (evita desfazer 2×).
      const marked = await tx.logEntry.updateMany({
        where: { id: logId, revertedAt: null },
        data: { revertedAt: new Date() },
      });
      if (!marked.count) {
        throw new BadRequestException('Esse registro já foi desfeito');
      }
      await revertDelta(tx, entry.delta as Delta);
      return writeLog(tx, {
        campaignId: entry.campaignId,
        actorUserId: user.id,
        characterId: entry.characterId,
        // desfazer algo de inimigo continua só com o mestre
        type: isMasterOnlyLog(entry.type) ? entry.type : LogType.NOTE,
        message: `Desfeito: ${entry.message}`,
        masterMessage: entry.masterMessage
          ? `Desfeito: ${entry.masterMessage}`
          : null,
      });
    });
    this.realtime.emitLogReverted(entry.campaignId, logId);
    return log;
  }

  // ───────────────────────── apoio ─────────────────────────

  /**
   * Roda a alteração numa transação e, depois de gravar, avisa a sala:
   * estado novo da campanha + a entrada do log (se houver).
   */
  private async run(
    campaignId: string,
    fn: (tx: Tx) => Promise<LogDto | null>,
  ) {
    const log = await this.prisma.$transaction(fn);
    await this.realtime.broadcastState(campaignId);
    if (log) this.realtime.emitLog(campaignId, log);
    return { log };
  }

  /** Em combate, o jogador só age no turno do próprio personagem. */
  private assertTurn(ctx: Ctx) {
    const c = ctx.campaign;
    if (ctx.isMaster || !c.inCombat) return;
    const current = c.turnIndex > 0 ? c.turnOrder[c.turnIndex - 1] : null;
    if (current !== ctx.character.id) {
      throw new ForbiddenException('Não é o seu turno');
    }
  }

  private async activeCampaign(campaignId: string, user: AuthUser) {
    const campaign = await loadCampaign(this.prisma, campaignId);
    await assertCampaignMember(this.prisma, campaign, user);
    if (campaign.status !== CampaignStatus.ACTIVE) {
      throw new ForbiddenException('A aventura não está em andamento');
    }
    return campaign;
  }

  /**
   * Carrega personagem + campanha e confere a permissão.
   * owner=true: o dono da ficha também pode; owner=false: só o mestre.
   */
  private async characterCtx(
    characterId: string,
    user: AuthUser,
    opts: { owner: boolean; requireActive?: boolean },
  ): Promise<Ctx> {
    const character = await this.prisma.character.findUnique({
      where: { id: characterId },
    });
    if (!character) throw new NotFoundException('Personagem não encontrado');
    const campaign = await loadCampaign(this.prisma, character.campaignId);

    const isMaster = isCampaignMaster(campaign, user);
    const isOwner = character.userId === user.id;
    if (!isMaster && !(opts.owner && isOwner)) {
      throw new ForbiddenException(
        opts.owner
          ? 'Você só pode mexer na sua própria ficha'
          : 'Só o mestre pode fazer isso',
      );
    }
    if (
      (opts.requireActive ?? true) &&
      campaign.status !== CampaignStatus.ACTIVE
    ) {
      throw new ForbiddenException('A aventura não está em andamento');
    }
    return { campaign, character, isMaster, isOwner };
  }

  private async summonCtx(
    summonId: string,
    user: AuthUser,
    opts: { owner: boolean },
  ) {
    const summon = await this.prisma.summon.findUnique({
      where: { id: summonId },
    });
    if (!summon) throw new NotFoundException('Invocação não encontrada');
    const ctx = await this.characterCtx(summon.characterId, user, opts);
    return { ctx, summon };
  }

  /** `owner`: o dono da ficha também pode (usar o item); sem ele, só o mestre. */
  private async itemCtx(itemId: string, user: AuthUser, owner = false) {
    const item = await this.prisma.inventoryItem.findUnique({
      where: { id: itemId },
    });
    if (!item) throw new NotFoundException('Item não encontrado');
    const ctx = await this.characterCtx(item.characterId, user, { owner });
    return { ctx, item };
  }
}
