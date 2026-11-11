import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway, rooms } from './realtime.gateway';
import {
  buildCampaignState,
  diffState,
  LogDto,
  logSelect,
  snapshotState,
  StateSnapshot,
  toLogDto,
} from './state';

/**
 * Eventos enviados ao front:
 *  - campaign:state     (campanha inteira, sem o log) → na sala da campanha
 *  - campaign:patch     (só o que mudou desde o último envio) → na sala
 *  - log:new            (uma entrada do log)          → na sala da campanha
 *  - log:reverted       ({ id })                      → na sala da campanha
 *  - log:updated        (uma entrada do log, alterada) → na sala da campanha
 *  - campaigns:changed  (sem payload)                 → para todos os jogadores
 *  - campaign:kicked    ({ campaignId })              → para o jogador removido
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  /**
   * Último estado enviado de cada campanha. Com ele, cada ação manda só o que
   * mudou (ex.: o personagem que levou dano), em vez da campanha inteira.
   * Fica em memória: a API roda numa instância só (ver ecosystem.config.cjs).
   */
  private readonly sent = new Map<string, StateSnapshot>();

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
      const now = snapshotState(state);
      const before = this.sent.get(campaignId);
      this.sent.set(campaignId, now);
      const room = this.server?.to(rooms.campaign(campaignId));
      if (!before) {
        // primeiro envio desde que a API subiu: manda tudo
        room?.emit('campaign:state', state);
        return;
      }
      const patch = diffState(state, now, before);
      if (patch) room?.emit('campaign:patch', patch);
    } catch (e) {
      // campanha apagada: esquece o retrato dela
      this.sent.delete(campaignId);
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
