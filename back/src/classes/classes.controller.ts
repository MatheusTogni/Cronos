import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Catálogo das classes com as habilidades — qualquer usuário logado pode ler. */
@Controller('classes')
export class ClassesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.characterClass.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { abilities: { orderBy: { sortOrder: 'asc' } } },
    });
  }
}

/** Catálogo de condições (efeitos de status) — qualquer usuário logado pode ler. */
@Controller('conditions')
export class ConditionsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.conditionDef.findMany({ orderBy: { sortOrder: 'asc' } });
  }
}
