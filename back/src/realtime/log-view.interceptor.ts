import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { map, Observable } from 'rxjs';
import type { AuthUser } from '../auth/auth-user';
import { Audience, LogDto, logView } from './state';

/**
 * As ações de jogo respondem `{ log }` com as duas mensagens do log. Aqui a
 * resposta HTTP vira a de quem chamou: o mestre recebe o texto completo e o
 * jogador só o narrado. Sem isso o jogador leria o texto do mestre na resposta.
 */
@Injectable()
export class LogViewInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    // só o mestre da campanha chega aqui como MASTER; os demais são jogadores
    const audience: Audience =
      req.user?.role === Role.MASTER ? 'master' : 'players';
    return next.handle().pipe(map((body) => resolveLog(body, audience)));
  }
}

function resolveLog(body: unknown, audience: Audience): unknown {
  if (!body || typeof body !== 'object' || !('log' in body)) return body;
  const log = body.log;
  if (!log || typeof log !== 'object' || !('masterMessage' in log)) return body;
  return { ...body, log: logView(log as LogDto, audience) };
}
