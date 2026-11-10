import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AbilityEffect, AbilityKind } from '@prisma/client';

interface Crit {
  min: number;
  max: number;
  text: string;
}
interface SeedAbility {
  kind: string;
  name: string;
  manaCost: number;
  crits?: Crit[];
  effect?: string;
  effectData?: { name?: string };
}
interface SeedClass {
  id: string;
  name: string;
  artFile: string;
  maxSummons: number;
  abilities: SeedAbility[];
}

const classes = JSON.parse(
  readFileSync(join(__dirname, '..', 'prisma', 'seed', 'classes.json'), 'utf8'),
) as SeedClass[];

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
        if (a.effect?.endsWith('CONDITION'))
          expect(a.effectData?.name).toBeTruthy();
        for (const crit of a.crits ?? []) {
          expect(crit.min).toBeGreaterThanOrEqual(1);
          expect(crit.max).toBeLessThanOrEqual(20);
          expect(crit.min).toBeLessThanOrEqual(crit.max);
          expect(crit.text).toBeTruthy();
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
