import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser, Roles } from '../auth/decorators';
import { CampaignsService } from './campaigns.service';
import {
  ChooseCharacterDto,
  CreateCampaignDto,
  ReadyDto,
  UpdateCampaignDto,
  WhisperDto,
} from './dto';

const Id = () => new ParseUUIDPipe({ version: '4' });

@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  // ── mestre ──

  @Get()
  @Roles(Role.MASTER)
  list(@CurrentUser() user: AuthUser) {
    return this.campaigns.listForMaster(user);
  }

  @Post()
  @Roles(Role.MASTER)
  create(@Body() dto: CreateCampaignDto, @CurrentUser() user: AuthUser) {
    return this.campaigns.create(dto, user);
  }

  @Patch(':id')
  @Roles(Role.MASTER)
  update(
    @Param('id', Id()) id: string,
    @Body() dto: UpdateCampaignDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.campaigns.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(Role.MASTER)
  @HttpCode(204)
  remove(@Param('id', Id()) id: string, @CurrentUser() user: AuthUser) {
    return this.campaigns.remove(id, user);
  }

  @Post(':id/open')
  @Roles(Role.MASTER)
  open(@Param('id', Id()) id: string, @CurrentUser() user: AuthUser) {
    return this.campaigns.open(id, user);
  }

  @Post(':id/start')
  @Roles(Role.MASTER)
  start(@Param('id', Id()) id: string, @CurrentUser() user: AuthUser) {
    return this.campaigns.start(id, user);
  }

  @Post(':id/end')
  @Roles(Role.MASTER)
  end(@Param('id', Id()) id: string, @CurrentUser() user: AuthUser) {
    return this.campaigns.end(id, user);
  }

  @Post(':id/restart')
  @Roles(Role.MASTER)
  restart(@Param('id', Id()) id: string, @CurrentUser() user: AuthUser) {
    return this.campaigns.restart(id, user);
  }

  @Post(':id/duplicate')
  @Roles(Role.MASTER)
  duplicate(@Param('id', Id()) id: string, @CurrentUser() user: AuthUser) {
    return this.campaigns.duplicate(id, user);
  }

  @Post(':id/whisper')
  @Roles(Role.MASTER)
  @HttpCode(204)
  whisper(
    @Param('id', Id()) id: string,
    @Body() dto: WhisperDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.campaigns.whisper(id, dto, user);
  }

  @Delete(':id/players/:userId')
  @Roles(Role.MASTER)
  @HttpCode(204)
  kick(
    @Param('id', Id()) id: string,
    @Param('userId', Id()) userId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.campaigns.kick(id, userId, user);
  }

  // ── jogador ──

  @Get('open')
  @Roles(Role.PLAYER)
  listOpen(@CurrentUser() user: AuthUser) {
    return this.campaigns.listForPlayer(user);
  }

  @Post(':id/join')
  @Roles(Role.PLAYER)
  join(@Param('id', Id()) id: string, @CurrentUser() user: AuthUser) {
    return this.campaigns.join(id, user);
  }

  @Post(':id/leave')
  @Roles(Role.PLAYER)
  @HttpCode(204)
  leave(@Param('id', Id()) id: string, @CurrentUser() user: AuthUser) {
    return this.campaigns.leave(id, user);
  }

  @Post(':id/character')
  @Roles(Role.PLAYER)
  chooseCharacter(
    @Param('id', Id()) id: string,
    @Body() dto: ChooseCharacterDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.campaigns.chooseCharacter(id, dto, user);
  }

  @Post(':id/ready')
  @Roles(Role.PLAYER)
  ready(
    @Param('id', Id()) id: string,
    @Body() dto: ReadyDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.campaigns.setReady(id, dto.ready, user);
  }

  // ── ambos ──

  @Get(':id/state')
  state(@Param('id', Id()) id: string, @CurrentUser() user: AuthUser) {
    return this.campaigns.getState(id, user);
  }
}
