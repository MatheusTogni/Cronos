import {
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Role } from '@prisma/client';
import type { Server, Socket } from 'socket.io';
import type { AuthUser } from '../auth/auth-user';
import { AuthService } from '../auth/auth.service';
import { assertCampaignMember, loadCampaign } from '../campaigns/access';
import { PrismaService } from '../prisma/prisma.service';

type AuthedSocket = Socket<any, any, any, { user?: AuthUser }>;

export const rooms = {
  campaign: (id: string) => `campaign:${id}`,
  user: (id: string) => `user:${id}`,
  players: 'players',
};

/**
 * Canal de tempo real. Só ENVIA eventos: toda alteração passa pela API REST,
 * que grava no banco e depois avisa as salas por aqui.
 *
 * Salas:
 *  - user:<id>      — avisos pessoais (ex.: removido do lobby)
 *  - players        — todos os jogadores logados (lista de campanhas abertas mudou)
 *  - campaign:<id>  — quem está com a campanha aberta (entra via "campaign:join")
 */
@WebSocketGateway({
  cors: process.env.CORS_ORIGIN
    ? { origin: process.env.CORS_ORIGIN.split(',') }
    : undefined,
})
export class RealtimeGateway implements OnGatewayInit {
  @WebSocketServer() server!: Server;

  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  /** Autentica no handshake: a conexão só é aceita com token válido. */
  afterInit(server: Server) {
    server.use((socket: AuthedSocket, next) => {
      const token = (socket.handshake.auth as { token?: unknown }).token;
      this.auth
        .authenticate(typeof token === 'string' ? token : '')
        .then(async (user) => {
          socket.data.user = user;
          await socket.join(rooms.user(user.id));
          if (user.role === Role.PLAYER) await socket.join(rooms.players);
          next();
        })
        .catch(() => next(new Error('unauthorized')));
    });
  }

  @SubscribeMessage('campaign:join')
  async joinCampaign(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: { campaignId?: unknown },
  ) {
    const user = socket.data.user;
    const campaignId = body?.campaignId;
    if (!user || typeof campaignId !== 'string') return { ok: false };

    try {
      const campaign = await loadCampaign(this.prisma, campaignId);
      await assertCampaignMember(this.prisma, campaign, user);
    } catch {
      return { ok: false };
    }

    // Uma campanha por vez por conexão.
    for (const room of socket.rooms) {
      if (room.startsWith('campaign:')) await socket.leave(room);
    }
    await socket.join(rooms.campaign(campaignId));
    return { ok: true };
  }

  @SubscribeMessage('campaign:leave')
  async leaveCampaign(@ConnectedSocket() socket: AuthedSocket) {
    for (const room of socket.rooms) {
      if (room.startsWith('campaign:')) await socket.leave(room);
    }
    return { ok: true };
  }
}
