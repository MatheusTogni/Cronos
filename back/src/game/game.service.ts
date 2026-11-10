import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AbilityEffect,
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
import { LogDto } from '../realtime/state';
import {
  AdjustDto,
  AdjustSummonDto,
  CreateConditionDto,
  CreateItemDto,
  CreateSummonDto,
  NoteDto,
  RollDto,
  UpdateCharacterDto,
  UpdateItemDto,
  UpdateSummonDto,
  UseAbilityDto,
} from './dto';
import {
  applyStats,
  clamp,
  Delta,
  DeltaBuilder,
  revertDelta,
  writeLog,
} from './journal';

type Tx = Prisma.TransactionClient;

interface Crit {
  min: number;
  max: number;
  text: string;
}

interface EffectData {
  name?: string;
  description?: string;
  exclusiveGroup?: string;
  hp?: number;
}

interface Ctx {
  campaign: Campaign;
  character: Character;
  isMaster: boolean;
  isOwner: boolean;
}

/** "a, b e c" */
const joinPt = (parts: string[]) =>
  parts.length <= 1
    ? (parts[0] ?? '')
    : `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`;

@Injectable()
export class GameService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  // ───────────────────────── habilidades ─────────────────────────

  async useAbility(
    characterId: string,
    abilityId: string,
    dto: UseAbilityDto,
    user: AuthUser,
  ) {
    const ctx = await this.characterCtx(characterId, user, { owner: true });

    return this.run(ctx.campaign.id, async (tx) => {
      const ch = await tx.character.findUniqueOrThrow({
        where: { id: characterId },
        include: {
          class: true,
          summons: {
            orderBy: { createdAt: 'asc' },
            include: { conditions: true },
          },
        },
      });
      const ability = await tx.ability.findUnique({ where: { id: abilityId } });
      if (!ability || ability.classId !== ch.classId) {
        throw new NotFoundException(
          'Habilidade não encontrada para esta classe',
        );
      }
      if (ch.mana < ability.manaCost) {
        throw new BadRequestException(
          `Mana insuficiente: ${ability.name} custa ${ability.manaCost} e ${ch.name} tem ${ch.mana}`,
        );
      }

      const roll =
        dto.rollMode === 'auto'
          ? randomInt(1, 21)
          : dto.rollMode === 'manual'
            ? (dto.roll ?? null)
            : null;
      const crit =
        roll === null
          ? undefined
          : ((ability.crits as Crit[] | null) ?? []).find(
              (c) => roll >= c.min && roll <= c.max,
            );

      const delta = new DeltaBuilder();
      if (ability.manaCost) {
        await applyStats(tx, ch, { mana: -ability.manaCost }, delta);
      }

      // Alvo e nome da criatura: o jogador só escolhe a habilidade; quem
      // aplica efeitos em alguém (condições, etc.) é o mestre.
      const target = ctx.isMaster ? dto.target : undefined;
      const targetCharacterId = ctx.isMaster ? dto.targetCharacterId : undefined;
      const summonName = ctx.isMaster ? dto.summonName : undefined;

      let targetLabel = target || null;
      let targetChar: Character | null = null;
      if (targetCharacterId) {
        targetChar = await tx.character.findUnique({
          where: { id: targetCharacterId },
        });
        if (!targetChar || targetChar.campaignId !== ch.campaignId) {
          throw new BadRequestException('Alvo não está nesta campanha');
        }
        targetLabel = targetChar.id === ch.id ? 'si mesmo' : targetChar.name;
      }

      // Efeito automático
      const effect = (ability.effectData ?? {}) as EffectData;
      const outcome: string[] = [];
      switch (ability.effect) {
        case AbilityEffect.SUMMON: {
          const max = ch.class.maxSummons;
          if (max > 0 && ch.summons.length >= max) {
            const excess = ch.summons.slice(0, ch.summons.length - max + 1);
            for (const old of excess) {
              delta.deletedSummon(old);
              await tx.summon.delete({ where: { id: old.id } });
            }
            outcome.push(
              `${joinPt(excess.map((s) => s.name))} ${excess.length > 1 ? 'desapareceram' : 'desapareceu'}`,
            );
          }
          const hp = effect.hp ?? 10;
          const summon = await tx.summon.create({
            data: {
              characterId: ch.id,
              name: summonName || effect.name || 'Invocação',
              hp,
              hpMax: hp,
            },
          });
          delta.created('summons', summon.id);
          outcome.push(`surgiu ${summon.name}`);
          break;
        }

        case AbilityEffect.SACRIFICE_SUMMON: {
          if (!ch.summons.length) {
            throw new BadRequestException(
              `${ch.name} não tem nenhuma criatura para sacrificar`,
            );
          }
          const victim = dto.summonId
            ? ch.summons.find((s) => s.id === dto.summonId)
            : ch.summons.length === 1
              ? ch.summons[0]
              : undefined;
          if (!victim) {
            throw new BadRequestException('Escolha qual criatura sacrificar');
          }
          delta.deletedSummon(victim);
          await tx.summon.delete({ where: { id: victim.id } });
          outcome.push(`${victim.name} foi sacrificada`);
          break;
        }

        case AbilityEffect.SELF_CONDITION: {
          const replaced = await this.addCondition(
            tx,
            ch.id,
            {
              name: effect.name ?? ability.name,
              description: effect.description,
              exclusiveGroup: effect.exclusiveGroup,
              source: ch.name,
            },
            delta,
          );
          outcome.push(
            `${ch.name} está sob ${effect.name ?? ability.name}` +
              (replaced.length ? ` (substituiu ${joinPt(replaced)})` : ''),
          );
          break;
        }

        case AbilityEffect.TARGET_CONDITION: {
          if (!targetChar) break; // alvo fora da party: fica só no log
          const replaced = await this.addCondition(
            tx,
            targetChar.id,
            {
              name: effect.name ?? ability.name,
              description: effect.description,
              exclusiveGroup: effect.exclusiveGroup,
              source: ch.name,
            },
            delta,
          );
          outcome.push(
            `${effect.name ?? ability.name} aplicada em ${targetChar.name}` +
              (replaced.length ? ` (substituiu ${joinPt(replaced)})` : ''),
          );
          break;
        }
      }

      let message = `${ch.name} usou ${ability.name}`;
      if (targetLabel) message += ` em ${targetLabel}`;
      if (ability.manaCost) message += ` (−${ability.manaCost} mana)`;
      if (roll !== null) message += ` · d20: ${roll}`;
      if (crit) message += ` → ${crit.text}`;
      if (outcome.length) message += `. ${joinPt(outcome)}.`;

      return writeLog(tx, {
        campaignId: ch.campaignId,
        actorUserId: user.id,
        characterId: ch.id,
        type: LogType.ABILITY_USED,
        message,
        roll,
        delta,
      });
    });
  }

  // ───────────────────────── vida / mana / XP ─────────────────────────

  async adjust(characterId: string, dto: AdjustDto, user: AuthUser) {
    const ctx = await this.characterCtx(characterId, user, { owner: false });
    const req = {
      hp: dto.hp ?? 0,
      mana: dto.mana ?? 0,
      xp: dto.xp ?? 0,
      level: dto.level ?? 0,
    };
    if (!req.hp && !req.mana && !req.xp && !req.level) {
      throw new BadRequestException('Informe algum valor diferente de zero');
    }

    return this.run(ctx.campaign.id, async (tx) => {
      const ch = await tx.character.findUniqueOrThrow({
        where: { id: characterId },
      });
      const delta = new DeltaBuilder();
      const { character: after } = await applyStats(tx, ch, req, delta);

      const parts: string[] = [];
      if (req.hp < 0) parts.push(`recebeu ${-req.hp} de dano`);
      if (req.hp > 0) parts.push(`recuperou ${req.hp} de vida`);
      if (req.mana < 0) parts.push(`perdeu ${-req.mana} de mana`);
      if (req.mana > 0) parts.push(`recuperou ${req.mana} de mana`);
      if (req.xp > 0) parts.push(`ganhou ${req.xp} de XP`);
      if (req.xp < 0) parts.push(`perdeu ${-req.xp} de XP`);
      if (req.level > 0) parts.push(`subiu para o nível ${after.level}`);
      if (req.level < 0) parts.push(`voltou para o nível ${after.level}`);

      const status: string[] = [];
      if (req.hp) status.push(`vida ${after.hp}/${after.hpMax}`);
      if (req.mana) status.push(`mana ${after.mana}/${after.manaMax}`);

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
      await this.addCondition(
        tx,
        characterId,
        {
          name: dto.name,
          description: dto.description,
          duration: dto.duration,
          source: ctx.isMaster ? 'Mestre' : ctx.character.name,
        },
        delta,
      );
      return writeLog(tx, {
        campaignId: ctx.campaign.id,
        actorUserId: user.id,
        characterId,
        type: LogType.CONDITION_ADDED,
        message:
          `${ctx.character.name} está com ${dto.name}` +
          (dto.duration ? ` (${dto.duration})` : ''),
        delta,
      });
    });
  }

  async removeCondition(conditionId: string, user: AuthUser) {
    const condition = await this.prisma.condition.findUnique({
      where: { id: conditionId },
      include: { summon: true },
    });
    if (!condition) throw new NotFoundException('Condição não encontrada');
    const characterId = condition.characterId ?? condition.summon?.characterId;
    if (!characterId) throw new NotFoundException('Condição não encontrada');
    const ctx = await this.characterCtx(characterId, user, { owner: false });

    return this.run(ctx.campaign.id, async (tx) => {
      const delta = new DeltaBuilder();
      delta.deletedCondition(condition);
      await tx.condition.delete({ where: { id: conditionId } });
      const holder = condition.summon?.name ?? ctx.character.name;
      return writeLog(tx, {
        campaignId: ctx.campaign.id,
        actorUserId: user.id,
        characterId,
        type: LogType.CONDITION_REMOVED,
        message: `${holder} não está mais com ${condition.name}`,
        delta,
      });
    });
  }

  // ───────────────────────── inventário ─────────────────────────

  async createItem(characterId: string, dto: CreateItemDto, user: AuthUser) {
    const ctx = await this.characterCtx(characterId, user, { owner: false });
    return this.run(ctx.campaign.id, async (tx) => {
      const item = await tx.inventoryItem.create({
        data: {
          characterId,
          name: dto.name,
          qty: dto.qty ?? 1,
          description: dto.description || null,
        },
      });
      const delta = new DeltaBuilder();
      delta.created('items', item.id);
      return writeLog(tx, {
        campaignId: ctx.campaign.id,
        actorUserId: user.id,
        characterId,
        type: LogType.ITEM_ADDED,
        message: `${ctx.character.name} pegou ${item.qty > 1 ? `${item.qty}× ` : ''}${item.name}`,
        delta,
      });
    });
  }

  async updateItem(itemId: string, dto: UpdateItemDto, user: AuthUser) {
    const { ctx, item } = await this.itemCtx(itemId, user);
    return this.run(ctx.campaign.id, async (tx) => {
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
        type: LogType.NOTE,
        message: `Desfeito: ${entry.message}`,
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

  /** Aplica uma condição; se tiver grupo exclusivo, remove as do mesmo grupo. Devolve os nomes substituídos. */
  private async addCondition(
    tx: Tx,
    characterId: string,
    data: {
      name: string;
      description?: string;
      duration?: string;
      exclusiveGroup?: string;
      source?: string;
    },
    delta: DeltaBuilder,
  ) {
    const replaced: string[] = [];
    if (data.exclusiveGroup) {
      const same = await tx.condition.findMany({
        where: { characterId, exclusiveGroup: data.exclusiveGroup },
      });
      for (const c of same) {
        delta.deletedCondition(c);
        replaced.push(c.name);
      }
      if (same.length) {
        await tx.condition.deleteMany({
          where: { id: { in: same.map((c) => c.id) } },
        });
      }
    }
    const created = await tx.condition.create({
      data: {
        characterId,
        name: data.name,
        description: data.description || null,
        duration: data.duration || null,
        exclusiveGroup: data.exclusiveGroup || null,
        source: data.source || null,
      },
    });
    delta.created('conditions', created.id);
    // reaplicar a mesma condição não conta como "substituiu"
    return replaced.filter((n) => n !== data.name);
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

  private async itemCtx(itemId: string, user: AuthUser) {
    const item = await this.prisma.inventoryItem.findUnique({
      where: { id: itemId },
    });
    if (!item) throw new NotFoundException('Item não encontrado');
    const ctx = await this.characterCtx(item.characterId, user, {
      owner: false,
    });
    return { ctx, item };
  }
}
