import { Role } from '@prisma/client';

/** Usuário autenticado anexado em `request.user` (e, na fase 2, no socket). */
export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  role: Role;
}

export interface JwtPayload {
  sub: string;
  role: Role;
}
