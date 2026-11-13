/**
 * Carrega o catálogo de condições (`prisma/seed/conditions.json`) e as classes
 * de `prisma/seed/classes.json` (transcritas das fichas em /Classes).
 * Idempotente: pode rodar quantas vezes quiser — atualiza o que mudou e remove
 * habilidades que saíram do JSON.
 *
 *   npx prisma db seed
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AbilityKind,
  ConditionPolarity,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { MAX_LEVEL, SKILL_UNLOCK_LEVELS } from '../src/game/rules';
import { databaseUrl } from '../src/prisma/database-url';

interface SeedAbility {
  kind: AbilityKind;
  name: string;
  manaCost: number;
  description: string;
  /** Só texto de referência; o mestre decide o que a faixa faz. */
  crits?: { min: number; max: number; text: string }[];
}

interface SeedClass {
  id: string;
  name: string;
  tagline: string | null;
  categories: string[];
  identity: string;
  mechanicName: string;
  mechanicText: string;
  baseHp: number;
  baseMana: number;
  color: string;
  artFile: string;
  abilities: SeedAbility[];
}

interface SeedCondition {
  id: string;
  name: string;
  description: string;
  polarity: ConditionPolarity;
}

const prisma = new PrismaClient({ datasourceUrl: databaseUrl() });

const json = (v: unknown) =>
  v === undefined ? Prisma.DbNull : (v as Prisma.InputJsonValue);

async function seedConditions() {
  const file = join(__dirname, 'seed', 'conditions.json');
  const defs = JSON.parse(readFileSync(file, 'utf8')) as SeedCondition[];
  await prisma.$transaction(async (tx) => {
    for (const [i, d] of defs.entries()) {
      const data = {
        name: d.name,
        description: d.description,
        polarity: d.polarity,
        sortOrder: i,
      };
      await tx.conditionDef.upsert({
        where: { id: d.id },
        create: { id: d.id, ...data },
        update: data,
      });
    }
    await tx.conditionDef.deleteMany({
      where: { id: { notIn: defs.map((d) => d.id) } },
    });
  });
  console.log(`✔ ${defs.length} condições no catálogo`);
}

async function main() {
  await seedConditions();

  const file = join(__dirname, 'seed', 'classes.json');
  const classes = JSON.parse(readFileSync(file, 'utf8')) as SeedClass[];

  for (const [classIndex, c] of classes.entries()) {
    const { abilities, ...data } = c;
    const classData = { ...data, sortOrder: classIndex };

    await prisma.$transaction(async (tx) => {
      await tx.characterClass.upsert({
        where: { id: c.id },
        create: classData,
        update: classData,
      });

      for (const [i, a] of abilities.entries()) {
        const abilityData = {
          kind: a.kind,
          manaCost: a.manaCost,
          description: a.description,
          crits: json(a.crits),
          sortOrder: i,
          unlockLevel: SKILL_UNLOCK_LEVELS[i] ?? MAX_LEVEL,
        };
        await tx.ability.upsert({
          where: { classId_name: { classId: c.id, name: a.name } },
          create: { classId: c.id, name: a.name, ...abilityData },
          update: abilityData,
        });
      }

      await tx.ability.deleteMany({
        where: {
          classId: c.id,
          name: { notIn: abilities.map((a) => a.name) },
        },
      });
    });

    console.log(`✔ ${c.name} (${abilities.length} habilidades)`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
