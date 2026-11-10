import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser, JwtPayload } from './auth-user';
import { verifyPassword } from './password';

export const toAuthUser = (u: User): AuthUser => ({
  id: u.id,
  username: u.username,
  displayName: u.displayName,
  role: u.role,
});

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(username: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { username: username.trim().toLowerCase() },
    });
    // Mesma mensagem para usuário inexistente, desativado ou senha errada.
    if (
      !user ||
      !user.active ||
      !(await verifyPassword(password, user.passwordHash))
    ) {
      throw new UnauthorizedException('Usuário ou senha inválidos');
    }

    const payload: JwtPayload = { sub: user.id, role: user.role };
    return {
      accessToken: await this.jwt.signAsync(payload),
      user: toAuthUser(user),
    };
  }

  /**
   * Valida o token e recarrega o usuário do banco a cada chamada, para que
   * desativar um login ou trocar o papel valha na hora (sem esperar o token expirar).
   * Usado pelo guard HTTP e, depois, pelo gateway do Socket.IO.
   */
  async authenticate(token: string): Promise<AuthUser> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Sessão expirada, entre novamente');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user || !user.active) {
      throw new UnauthorizedException('Sessão expirada, entre novamente');
    }
    return toAuthUser(user);
  }
}
