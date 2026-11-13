import type { Character } from '@/types/api'

/**
 * Ganchos de classe: a mecânica única de cada classe, vista de fora. Só o que
 * depende de números do próprio personagem é do sistema, e mesmo assim só como
 * sinal visual (Frenesi). O resto, como a Oportunidade da Raposa, a Condenação
 * do Carrasco e a instabilidade do Tecelão, é narração do mestre.
 */

/** Igual ao back (game/rules.ts): vida máxima que o personagem ganha por nível. */
export const HP_PER_LEVEL = 3

/** Igual ao back: mana máxima que o personagem ganha por nível. */
export const MANA_PER_LEVEL = 2

/** Igual ao back: o personagem vai do nível 1 ao 15. */
export const MAX_LEVEL = 15

/** Frenesi do Caçador: quanto mais ferido, mais perigoso. Ativo com a vida em 40% ou menos. */
export const FRENZY_PERCENT = 40
export const frenzyActive = (c: Character) =>
  c.classId === 'cacador' && c.hp > 0 && c.hp * 100 <= c.hpMax * FRENZY_PERCENT
