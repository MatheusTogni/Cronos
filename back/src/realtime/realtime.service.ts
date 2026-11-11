import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway, rooms } from './realtime.gateway';
import { buildCampaignState, LogDto, logSelect, toLogDto } from './state';

/**
 * Eventos enviados ao front:
 *  - campaign:state     (campanha inteira, sem o log) → na sala da campanha
 *  - log:new            (uma entrada do log)          → na sala da campanha
 *  - log:reverted       ({ id })                      → na sala da campanha
 *  - log:updated        (uma entrada do log, alterada) → na sala da campanha
 *  - campaigns:changed  (sem payload)                 → para todos os jogadores
 *  - campaign:kicked    ({ campaignId })              → para o jogador removido
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);

  constructor(
    private readonly gateway: RealtimeGateway,
    private readonly prisma: PrismaService,
  ) {}

  private get server() {
    return this.gateway.server;
  }

  async broadcastState(campaignId: string) {
    try {
      const state = await buildCampaignState(this.prisma, campaignId);
      this.server?.to(rooms.campaign(campaignId)).emit('campaign:state', state);
    } catch (e) {
      // Nunca derrubar a requisição por causa do aviso em tempo real.
      this.logger.warn(`Falha ao transmitir estado: ${String(e)}`);
    }
  }

  emitLog(campaignId: string, entry: LogDto) {
    this.server?.to(rooms.campaign(campaignId)).emit('log:new', entry);
  }

  /** Uma entrada mudou (ex.: efeito pendente aplicado ou descartado). */
  async logUpdated(campaignId: string, id: string) {
    try {
      const entry = await this.prisma.logEntry.findUnique({
        where: { id },
        select: logSelect,
      });
      if (entry) {
        this.server
          ?.to(rooms.campaign(campaignId))
          .emit('log:updated', toLogDto(entry));
      }
    } catch (e) {
      this.logger.warn(`Falha ao transmitir log: ${String(e)}`);
    }
  }

  emitLogReverted(campaignId: string, id: string) {
    this.server?.to(rooms.campaign(campaignId)).emit('log:reverted', { id });
  }

  /** A lista de campanhas abertas mudou (abriu, começou, encerrou, alguém entrou). */
  campaignsChanged() {
    this.server?.to(rooms.players).emit('campaigns:changed');
  }

  kicked(userId: string, campaignId: string) {
    this.server?.to(rooms.user(userId)).emit('campaign:kicked', { campaignId });
    // tira as conexões dele da sala da campanha
    this.server
      ?.in(rooms.user(userId))
      .socketsLeave(rooms.campaign(campaignId));
  }
}
