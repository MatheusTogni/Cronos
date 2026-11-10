/**
 * Prisma falso, em memória, só com o que a fase 1 usa (users + classes).
 * Permite subir o app Nest inteiro nos testes sem precisar de Postgres.
 */
import { randomUUID } from 'node:crypto';
import { CampaignStatus, Prisma, Role, User } from '@prisma/client';

type Select = Record<string, boolean> | undefined;

const pick = (obj: User, select: Select) =>
  select
    ? Object.fromEntries(
        Object.keys(select)
          .filter((k) => select[k])
          .map((k) => [k, obj[k as keyof User]]),
      )
    : { ...obj };

export class FakePrisma {
  users: User[] = [];

  user = {
    findUnique: ({
      where,
    }: {
      where: { id?: string; username?: string };
    }): Promise<User | null> =>
      Promise.resolve(
        this.users.find((u) =>
          where.id ? u.id === where.id : u.username === where.username,
        ) ?? null,
      ),

    findMany: ({ select }: { select?: Select }) =>
      Promise.resolve(this.users.map((u) => pick(u, select))),

    create: ({
      data,
      select,
    }: {
      data: Omit<User, 'id' | 'createdAt' | 'updatedAt' | 'active'>;
      select?: Select;
    }) => {
      if (this.users.some((u) => u.username === data.username)) {
        return Promise.reject(
          new Prisma.PrismaClientKnownRequestError('dup', {
            code: 'P2002',
            clientVersion: 'test',
          }),
        );
      }
      const user: User = {
        id: randomUUID(),
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      };
      this.users.push(user);
      return Promise.resolve(pick(user, select));
    },

    update: ({
      where,
      data,
      select,
    }: {
      where: { id: string };
      data: Partial<User>;
      select?: Select;
    }) => {
      const user = this.users.find((u) => u.id === where.id)!;
      if (
        data.username &&
        this.users.some((u) => u.id !== user.id && u.username === data.username)
      ) {
        return Promise.reject(
          new Prisma.PrismaClientKnownRequestError('dup', {
            code: 'P2002',
            clientVersion: 'test',
          }),
        );
      }
      for (const [k, v] of Object.entries(data)) {
        if (v !== undefined) (user as Record<string, unknown>)[k] = v;
      }
      return Promise.resolve(pick(user, select));
    },

    delete: ({ where }: { where: { id: string } }) => {
      const i = this.users.findIndex((u) => u.id === where.id);
      const [user] = this.users.splice(i, 1);
      this.characters = this.characters.filter((c) => c.userId !== where.id);
      return Promise.resolve(user);
    },
  };

  /** Só o necessário para as regras de exclusão de usuário. */
  campaigns: { id: string; masterId: string; status: CampaignStatus }[] = [];
  characters: { id: string; userId: string; campaignId: string }[] = [];

  campaign = {
    count: ({ where }: { where: { masterId: string } }) =>
      Promise.resolve(
        this.campaigns.filter((c) => c.masterId === where.masterId).length,
      ),
  };

  character = {
    count: ({
      where,
    }: {
      where: { userId: string; campaign: { status: CampaignStatus } };
    }) =>
      Promise.resolve(
        this.characters.filter(
          (ch) =>
            ch.userId === where.userId &&
            this.campaigns.find((c) => c.id === ch.campaignId)?.status ===
              where.campaign.status,
        ).length,
      ),
    deleteMany: ({ where }: { where: { userId: string } }) => {
      const before = this.characters.length;
      this.characters = this.characters.filter(
        (c) => c.userId !== where.userId,
      );
      return Promise.resolve({ count: before - this.characters.length });
    },
  };

  $transaction = <T>(run: (tx: this) => Promise<T>) => run(this);

  characterClass = {
    findMany: () => Promise.resolve([{ id: 'necromante', abilities: [] }]),
  };

  $connect = () => Promise.resolve();
  $disconnect = () => Promise.resolve();

  addUser(username: string, passwordHash: string, role: Role, active = true) {
    const user: User = {
      id: randomUUID(),
      username,
      displayName: username,
      passwordHash,
      role,
      active,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.push(user);
    return user;
  }
}
