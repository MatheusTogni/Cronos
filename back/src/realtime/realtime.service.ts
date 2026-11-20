import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway, rooms } from './realtime.gateway';
import {
  Audience,
  AUDIENCES,
  buildCampaignState,
  CampaignState,
  diffState,
  forPlayers,
  isMasterOnlyLog,
  LogDto,
  logView,
  snapshotState,
  StateSnapshot,
} from './state';

/**
 * Eventos enviados ao front. Cada campanha tem uma sala para o mestre e outra
 * para os jogadores; o que é só do mestre (os inimigos e o log sobre eles)
 * nunca sai na sala dos jogadores.
 *  - campaign:state     (campanha inteira, sem o log) → nas salas da campanha
 *  - campaign:patch     (só o que mudou desde o último envio) → idem
 *  - log:new            (uma entrada do log)          → idem
 *  - log:reverted       ({ id })                      → idem
 *  - image:shown        ({ campaignId, image })       → imagem só para alguns jogadores (ver emitPrivateImage)
 *  - transfer:new / transfer:updated (oferta de doação/troca) → só os dois jogadores envolvidos
 *  - campaigns:changed  (sem payload)                 → para todos os jogadores
 *  - campaign:kicked    ({ campaignId })              → para o jogador removido
 *  - whisper            ({ campaignId, id, message, sentAt }) → mensagem secreta do mestre, só para os escolhidos (não fica guardada)
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  /**
   * Último estado enviado de cada campanha, por papel (o do mestre e o dos
   * jogadores diferem). Com ele, cada ação manda só o que mudou (ex.: o
   * personagem que levou dano), em vez da campanha inteira.
   * Fica em memória: a API roda numa instância só (ver ecosystem.config.cjs).
   */
  private readonly sent = new Map<
    string,
    Partial<Record<Audience, StateSnapshot>>
  >();

  constructor(
    private readonly gateway: RealtimeGateway,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Fila de envios de cada campanha. Dois `broadcastState` ao mesmo tempo (ex.:
   * o mestre fecha a loja enquanto um jogador compra) podiam terminar fora de
   * ordem: o que montou o estado mais velho enviava por último e desfazia o
   * dado mais novo nos clientes (a tela do mestre ficava com a loja "aberta").
   * Em fila, cada montagem só começa depois da anterior terminar, então o
   * estado lido nunca anda para trás.
   */
  private readonly queues = new Map<string, Promise<void>>();

  private get server() {
    return this.gateway.server;
  }

  broadcastState(campaignId: string): Promise<void> {
    const previous = this.queues.get(campaignId) ?? Promise.resolve();
    // sendState nunca rejeita, então a fila não trava num erro
    const run = previous.then(() => this.sendState(campaignId));
    this.queues.set(campaignId, run);
    return run.finally(() => {
      if (this.queues.get(campaignId) === run) this.queues.delete(campaignId);
    });
  }

  private async sendState(campaignId: string) {
    try {
      const full = await buildCampaignState(this.prisma, campaignId);
      const views: Record<Audience, CampaignState> = {
        master: full,
        players: forPlayers(full),
      };
      const before = this.sent.get(campaignId) ?? {};
      const after: Partial<Record<Audience, StateSnapshot>> = {};
      for (const audience of AUDIENCES) {
        const state = views[audience];
        const now = snapshotState(state);
        after[audience] = now;
        const room = this.server?.to(rooms.campaign(campaignId, audience));
        const last = before[audience];
        if (!last) {
          // primeiro envio desde que a API subiu: manda tudo
          room?.emit('campaign:state', state);
          continue;
        }
        const patch = diffState(state, now, last);
        if (patch) room?.emit('campaign:patch', patch);
      }
      this.sent.set(campaignId, after);
    } catch (e) {
      // campanha apagada: esquece o retrato dela
      this.sent.delete(campaignId);
      // Nunca derrubar a requisição por causa do aviso em tempo real.
      this.logger.warn(`Falha ao transmitir estado: ${String(e)}`);
    }
  }

  emitLog(campaignId: string, entry: LogDto) {
    for (const audience of AUDIENCES) {
      // o que é sobre inimigos fica só com o mestre
      if (audience === 'players' && isMasterOnlyLog(entry.type)) continue;
      this.server
        ?.to(rooms.campaign(campaignId, audience))
        .emit('log:new', logView(entry, audience));
    }
  }

  /**
   * Imagem mostrada só a alguns jogadores: vai só à sala pessoal de cada um
   * (nada fica guardado no banco: é um aviso do momento). Os outros jogadores
   * da sala recebem "nada", para sumir o que viam antes. Com `image` nula e
   * `userIds` vazio, limpa a de todos.
   */
  emitPrivateImage(
    campaignId: string,
    image: { id: string; url: string } | null,
    userIds: string[],
  ) {
    const server = this.server;
    if (!server) return;
    const chosen = userIds.map((userId) => rooms.user(userId));
    server
      .to(rooms.campaign(campaignId, 'players'))
      .except(chosen)
      .emit('image:shown', { campaignId, image: null });
    if (!image) return;
    for (const room of chosen) {
      server.to(room).emit('image:shown', { campaignId, image });
    }
  }

  emitLogReverted(campaignId: string, id: string) {
    for (const audience of AUDIENCES) {
      this.server
        ?.to(rooms.campaign(campaignId, audience))
        .emit('log:reverted', { id });
    }
  }

  /** Aviso pessoal: só as conexões desse usuário recebem (ex.: oferta de troca). */
  toUser(userId: string, event: string, payload: unknown) {
    this.server?.to(rooms.user(userId)).emit(event, payload);
  }

  /** A lista de campanhas abertas mudou (abriu, começou, encerrou, alguém entrou). */
  campaignsChanged() {
    this.server?.to(rooms.players).emit('campaigns:changed');
  }

  kicked(userId: string, campaignId: string) {
    this.server?.to(rooms.user(userId)).emit('campaign:kicked', { campaignId });
    // tira as conexões dele da sala da campanha
    for (const audience of AUDIENCES) {
      this.server
        ?.in(rooms.user(userId))
        .socketsLeave(rooms.campaign(campaignId, audience));
    }
  }
}
