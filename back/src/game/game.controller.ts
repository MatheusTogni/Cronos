import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators';
import {
  AdjustDto,
  AdjustSummonDto,
  ApplyPendingDto,
  CreateConditionDto,
  CreateItemDto,
  CreateNpcDto,
  CreateSummonDto,
  NextTurnDto,
  NoteDto,
  RollDto,
  TurnOrderDto,
  UpdateCharacterDto,
  UpdateItemDto,
  UpdateNpcDto,
  UpdateSummonDto,
  UseAbilityDto,
} from './dto';
import { CombatService } from './combat.service';
import { GameService } from './game.service';
import { NpcsService } from './npcs.service';

const Id = () => new ParseUUIDPipe({ version: '4' });

/**
 * Ações durante a aventura. As permissões finas (mestre da campanha x dono da
 * ficha) ficam no GameService, porque dependem da campanha, não só do papel.
 */
@Controller()
export class GameController {
  constructor(
    private readonly game: GameService,
    private readonly combat: CombatService,
    private readonly npcs: NpcsService,
  ) {}

  // ── personagem ──

  @Post('characters/:id/abilities/:abilityId/use')
  @HttpCode(200)
  useAbility(
    @Param('id', Id()) id: string,
    @Param('abilityId', Id()) abilityId: string,
    @Body() dto: UseAbilityDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.game.useAbility(id, abilityId, dto, user);
  }

  @Post('characters/:id/adjust')
  @HttpCode(200)
  adjust(
    @Param('id', Id()) id: string,
    @Body() dto: AdjustDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.game.adjust(id, dto, user);
  }

  @Patch('characters/:id')
  updateCharacter(
    @Param('id', Id()) id: string,
    @Body() dto: UpdateCharacterDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.game.updateCharacter(id, dto, user);
  }

  // ── invocações ──

  @Post('characters/:id/summons')
  createSummon(
    @Param('id', Id()) id: string,
    @Body() dto: CreateSummonDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.game.createSummon(id, dto, user);
  }

  @Patch('summons/:id')
  updateSummon(
    @Param('id', Id()) id: string,
    @Body() dto: UpdateSummonDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.game.updateSummon(id, dto, user);
  }

  @Post('summons/:id/adjust')
  @HttpCode(200)
  adjustSummon(
    @Param('id', Id()) id: string,
    @Body() dto: AdjustSummonDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.game.adjustSummon(id, dto, user);
  }

  @Post('summons/:id/conditions')
  createSummonCondition(
    @Param('id', Id()) id: string,
    @Body() dto: CreateConditionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.game.createSummonCondition(id, dto, user);
  }

  @Delete('summons/:id')
  removeSummon(@Param('id', Id()) id: string, @CurrentUser() user: AuthUser) {
    return this.game.removeSummon(id, user);
  }

  // ── inimigos / NPCs (só o mestre) ──

  @Post('campaigns/:id/npcs')
  createNpc(
    @Param('id', Id()) id: string,
    @Body() dto: CreateNpcDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.npcs.create(id, dto, user);
  }

  @Patch('npcs/:id')
  updateNpc(
    @Param('id', Id()) id: string,
    @Body() dto: UpdateNpcDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.npcs.update(id, dto, user);
  }

  @Post('npcs/:id/adjust')
  @HttpCode(200)
  adjustNpc(
    @Param('id', Id()) id: string,
    @Body() dto: AdjustSummonDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.npcs.adjust(id, dto, user);
  }

  @Delete('npcs/:id')
  removeNpc(@Param('id', Id()) id: string, @CurrentUser() user: AuthUser) {
    return this.npcs.remove(id, user);
  }

  @Post('npcs/:id/conditions')
  createNpcCondition(
    @Param('id', Id()) id: string,
    @Body() dto: CreateConditionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.npcs.addCondition(id, dto, user);
  }

  // ── condições ──

  @Post('characters/:id/conditions')
  createCondition(
    @Param('id', Id()) id: string,
    @Body() dto: CreateConditionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.game.createCondition(id, dto, user);
  }

  @Delete('conditions/:id')
  removeCondition(
    @Param('id', Id()) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.game.removeCondition(id, user);
  }

  // ── inventário ──

  @Post('characters/:id/items')
  createItem(
    @Param('id', Id()) id: string,
    @Body() dto: CreateItemDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.game.createItem(id, dto, user);
  }

  @Patch('items/:id')
  updateItem(
    @Param('id', Id()) id: string,
    @Body() dto: UpdateItemDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.game.updateItem(id, dto, user);
  }

  @Delete('items/:id')
  removeItem(@Param('id', Id()) id: string, @CurrentUser() user: AuthUser) {
    return this.game.removeItem(id, user);
  }

  // ── mesa ──

  @Post('campaigns/:id/roll')
  roll(
    @Param('id', Id()) id: string,
    @Body() dto: RollDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.game.roll(id, dto, user);
  }

  @Post('campaigns/:id/note')
  note(
    @Param('id', Id()) id: string,
    @Body() dto: NoteDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.game.note(id, dto, user);
  }

  // ── combate (turnos) ──

  @Post('campaigns/:id/combat/start')
  @HttpCode(200)
  startCombat(@Param('id', Id()) id: string, @CurrentUser() user: AuthUser) {
    return this.combat.start(id, user);
  }

  @Post('campaigns/:id/combat/end')
  @HttpCode(200)
  endCombat(@Param('id', Id()) id: string, @CurrentUser() user: AuthUser) {
    return this.combat.end(id, user);
  }

  @Post('campaigns/:id/combat/next')
  @HttpCode(200)
  nextTurn(
    @Param('id', Id()) id: string,
    @Body() dto: NextTurnDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.combat.next(id, dto, user);
  }

  @Put('campaigns/:id/combat/order')
  turnOrder(
    @Param('id', Id()) id: string,
    @Body() dto: TurnOrderDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.combat.setOrder(id, dto, user);
  }

  // ── efeito pendente ("Aplicar em…") ──

  @Post('logs/:id/apply')
  @HttpCode(200)
  applyPending(
    @Param('id', Id()) id: string,
    @Body() dto: ApplyPendingDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.game.applyPending(id, dto, user);
  }

  @Delete('logs/:id/pending')
  discardPending(@Param('id', Id()) id: string, @CurrentUser() user: AuthUser) {
    return this.game.discardPending(id, user);
  }

  @Post('logs/:id/revert')
  @HttpCode(200)
  revert(@Param('id', Id()) id: string, @CurrentUser() user: AuthUser) {
    return this.game.revert(id, user);
  }
}
