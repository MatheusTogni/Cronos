import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CampaignStatus, Prisma, Role } from '@prisma/client';
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
    const passwordHash = await hashPassword(dto.password);
    return this.catchDuplicate(dto.username, () =>
      this.prisma.user.create({
        data: {
          username: dto.username,
          displayName: dto.displayName,
          role: dto.role,
          passwordHash,
        },
        select: publicFields,
      }),
    );
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

    const passwordHash = dto.password
      ? await hashPassword(dto.password)
      : undefined;

    // O token guarda só o id, então trocar o login não derruba a sessão.
    return this.catchDuplicate(dto.username ?? user.username, () =>
      this.prisma.user.update({
        where: { id },
        data: {
          username: dto.username,
          displayName: dto.displayName,
          role: dto.role,
          active: dto.active,
          passwordHash,
        },
        select: publicFields,
      }),
    );
  }

  /**
   * Exclui o login de vez. Os lugares nas campanhas saem em cascata e o
   * diário mantém as entradas (sem autor). Os personagens dele são apagados.
   */
  async remove(id: string, actorId: string) {
    if (id === actorId) {
      throw new BadRequestException('Você não pode excluir o próprio login');
    }

    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id } });
      if (!user) throw new NotFoundException('Usuário não encontrado');

      const mastered = await tx.campaign.count({ where: { masterId: id } });
      if (mastered > 0) {
        throw new ConflictException(
          `"${user.displayName}" é mestre de ${mastered} campanha(s). Exclua as campanhas ou desative o login.`,
        );
      }

      const playing = await tx.character.count({
        where: { userId: id, campaign: { status: CampaignStatus.ACTIVE } },
      });
      if (playing > 0) {
        throw new ConflictException(
          `"${user.displayName}" está numa aventura em andamento. Encerre a aventura ou desative o login.`,
        );
      }

      await tx.character.deleteMany({ where: { userId: id } });
      await tx.user.delete({ where: { id } });
    });
  }

  private async catchDuplicate<T>(username: string, run: () => Promise<T>) {
    try {
      return await run();
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException(`O login "${username}" já existe`);
      }
      throw e;
    }
  }
}
