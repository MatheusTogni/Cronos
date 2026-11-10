import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { hashPassword } from '../auth/password';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

/** Campos devolvidos para o front — nunca o hash da senha. */
const publicFields = {
  id: true,
  username: true,
  displayName: true,
  role: true,
  active: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.user.findMany({
      select: publicFields,
      orderBy: [{ role: 'asc' }, { displayName: 'asc' }],
    });
  }

  async create(dto: CreateUserDto) {
    try {
      return await this.prisma.user.create({
        data: {
          username: dto.username,
          displayName: dto.displayName,
          role: dto.role,
          passwordHash: await hashPassword(dto.password),
        },
        select: publicFields,
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException(`O login "${dto.username}" já existe`);
      }
      throw e;
    }
  }

  async update(id: string, dto: UpdateUserDto, actorId: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    // Evita o mestre se trancar para fora do sistema.
    if (id === actorId) {
      if (dto.active === false) {
        throw new BadRequestException(
          'Você não pode desativar o próprio login',
        );
      }
      if (dto.role && dto.role !== Role.MASTER) {
        throw new BadRequestException(
          'Você não pode tirar o papel de mestre de si mesmo',
        );
      }
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        displayName: dto.displayName,
        role: dto.role,
        active: dto.active,
        passwordHash: dto.password
          ? await hashPassword(dto.password)
          : undefined,
      },
      select: publicFields,
    });
  }
}
