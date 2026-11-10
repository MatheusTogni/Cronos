/**
 * Carrega as classes de `prisma/seed/classes.json` (transcritas das fichas em /Classes).
 * Idempotente: pode rodar quantas vezes quiser — atualiza o que mudou e remove
 * habilidades que saíram do JSON.
 *
 *   npx prisma db seed
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AbilityEffect,
  AbilityKind,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { databaseUrl } from '../src/prisma/database-url';

interface SeedAbility {
  kind: AbilityKind;
  name: string;
  manaCost: number;
  description: string;
  crits?: { min: number; max: number; text: string }[];
  effect?: AbilityEffect;
  effectData?: Record<string, unknown>;
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
  maxSummons: number;
  color: string;
  artFile: string;
  abilities: SeedAbility[];
}

const prisma = new PrismaClient({ datasourceUrl: databaseUrl() });

const json = (v: unknown) =>
  v === undefined ? Prisma.DbNull : (v as Prisma.InputJsonValue);

async function main() {
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
          effect: a.effect ?? null,
          effectData: json(a.effectData),
          sortOrder: i,
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
