import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AbilityKind, ConditionPolarity } from '@prisma/client';

interface Crit {
  min: number;
  max: number;
  text: string;
}
interface SeedAbility {
  kind: string;
  name: string;
  manaCost: number;
  description: string;
  crits?: Crit[];
}
interface SeedClass {
  id: string;
  name: string;
  artFile: string;
  abilities: SeedAbility[];
}

const seedFile = (name: string) =>
  readFileSync(join(__dirname, '..', 'prisma', 'seed', name), 'utf8');
const classes = JSON.parse(seedFile('classes.json')) as SeedClass[];
const conditionDefs = JSON.parse(seedFile('conditions.json')) as Record<
  string,
  unknown
>[];

describe('prisma/seed/conditions.json', () => {
  it('ids únicos e polaridade válida', () => {
    expect(new Set(conditionDefs.map((d) => d.id)).size).toBe(
      conditionDefs.length,
    );
    for (const d of conditionDefs) {
      expect(d.name).toBeTruthy();
      expect(d.description).toBeTruthy();
      expect(Object.values(ConditionPolarity)).toContain(d.polarity);
    }
  });

  it('é só status à mostra: sem prazo nem efeito automático', () => {
    for (const d of conditionDefs) {
      expect(Object.keys(d).sort()).toEqual(
        ['description', 'id', 'name', 'polarity'].sort(),
      );
    }
  });
});

describe('prisma/seed/classes.json', () => {
  it('tem as 9 classes das fichas, sem id repetido', () => {
    expect(classes).toHaveLength(9);
    expect(new Set(classes.map((c) => c.id)).size).toBe(9);
  });

  it.each(classes.map((c) => [c.name, c] as const))(
    '%s: 3 skills (sem ataque básico), só dados de referência',
    (_name, c) => {
      expect(c.abilities).toHaveLength(3);
      expect(new Set(c.abilities.map((a) => a.name)).size).toBe(3);

      for (const a of c.abilities) {
        expect(a.kind).toBe(AbilityKind.SKILL);
        expect(a.manaCost).toBeGreaterThanOrEqual(1);
        expect(a.description).toBeTruthy();
        // nada de automação: dano, efeito e condição são do mestre
        expect(Object.keys(a).filter((k) => k !== 'crits')).toEqual([
          'kind',
          'name',
          'manaCost',
          'description',
        ]);
        for (const crit of a.crits ?? []) {
          expect(Object.keys(crit).sort()).toEqual(['max', 'min', 'text']);
          expect(crit.min).toBeGreaterThanOrEqual(1);
          expect(crit.max).toBeLessThanOrEqual(20);
          expect(crit.min).toBeLessThanOrEqual(crit.max);
          expect(crit.text).toBeTruthy();
        }
      }

      // a arte é servida pelo front a partir de front/public
      expect(
        existsSync(join(__dirname, '..', '..', 'front', 'public', c.artFile)),
      ).toBe(true);
    },
  );
});
