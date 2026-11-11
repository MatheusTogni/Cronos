import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AbilityEffect, AbilityKind, ConditionPolarity } from '@prisma/client';

interface Crit {
  min: number;
  max: number;
  text: string;
  condition?: string;
  turns?: number;
  on?: string;
}
interface SeedAbility {
  kind: string;
  name: string;
  manaCost: number;
  crits?: Crit[];
  effect?: string;
  effectData?: { name?: string; condition?: string };
}
interface SeedClass {
  id: string;
  name: string;
  artFile: string;
  maxSummons: number;
  abilities: SeedAbility[];
}

const seedFile = (name: string) =>
  readFileSync(join(__dirname, '..', 'prisma', 'seed', name), 'utf8');
const classes = JSON.parse(seedFile('classes.json')) as SeedClass[];
const conditionDefs = JSON.parse(seedFile('conditions.json')) as {
  id: string;
  name: string;
  polarity: string;
  turns?: number;
}[];

describe('prisma/seed/conditions.json', () => {
  it('ids únicos, polaridade válida e duração positiva', () => {
    expect(new Set(conditionDefs.map((d) => d.id)).size).toBe(
      conditionDefs.length,
    );
    for (const d of conditionDefs) {
      expect(d.name).toBeTruthy();
      expect(Object.values(ConditionPolarity)).toContain(d.polarity);
      if (d.turns !== undefined) expect(d.turns).toBeGreaterThan(0);
    }
  });
});

describe('prisma/seed/classes.json', () => {
  it('tem as 9 classes das fichas, sem id repetido', () => {
    expect(classes).toHaveLength(9);
    expect(new Set(classes.map((c) => c.id)).size).toBe(9);
  });

  it.each(classes.map((c) => [c.name, c] as const))(
    '%s: 1 ataque básico + 3 skills, dados coerentes',
    (_name, c) => {
      const basics = c.abilities.filter((a) => a.kind === 'BASIC');
      const skills = c.abilities.filter((a) => a.kind === 'SKILL');
      expect(basics).toHaveLength(1);
      expect(skills).toHaveLength(3);
      expect(basics[0].manaCost).toBe(0);

      for (const a of c.abilities) {
        expect(Object.values(AbilityKind)).toContain(a.kind);
        if (a.effect) expect(Object.values(AbilityEffect)).toContain(a.effect);
        // condição: aponta para o catálogo (ou traz o nome, se for livre)
        if (a.effect?.endsWith('CONDITION')) {
          const ref = a.effectData?.condition;
          if (ref) expect(conditionDefs.map((d) => d.id)).toContain(ref);
          else expect(a.effectData?.name).toBeTruthy();
        }
        for (const crit of a.crits ?? []) {
          expect(crit.min).toBeGreaterThanOrEqual(1);
          expect(crit.max).toBeLessThanOrEqual(20);
          expect(crit.min).toBeLessThanOrEqual(crit.max);
          expect(crit.text).toBeTruthy();
          if (crit.condition) {
            expect(conditionDefs.map((d) => d.id)).toContain(crit.condition);
          }
          if (crit.turns !== undefined) expect(crit.turns).toBeGreaterThan(0);
          if (crit.on) expect(['target', 'self']).toContain(crit.on);
        }
      }

      if (c.abilities.some((a) => a.effect === 'SUMMON')) {
        expect(c.maxSummons).toBeGreaterThan(0);
      }

      // a arte é servida pelo front a partir de front/public
      expect(
        existsSync(join(__dirname, '..', '..', 'front', 'public', c.artFile)),
      ).toBe(true);
    },
  );
});
