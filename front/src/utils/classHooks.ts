import type { Character } from '@/types/api'

/**
 * Ganchos de classe: a mecânica única de cada classe, vista de fora. Só os que
 * dependem de números do próprio personagem são do sistema (Frenesi e a
 * instabilidade do Tecelão). O que depende da cena, como a Oportunidade da
 * Raposa e a Condenação do Carrasco, é narração do mestre.
 */

/** Igual ao back (game/rules.ts): vida máxima que o personagem ganha por nível. */
export const HP_PER_LEVEL = 2

/** Igual ao back (game/rules.ts): ao chegar nesse valor o tempo rompe em paradoxo. */
export const INSTABILITY_LIMIT = 5
export const INSTABILITY_CLASS = 'tecelao-do-tempo'

/** Frenesi do Caçador: quanto mais ferido, mais perigoso. Ativo com a vida em 40% ou menos. */
export const FRENZY_PERCENT = 40
export const frenzyActive = (c: Character) =>
  c.classId === 'cacador' && c.hp > 0 && c.hp * 100 <= c.hpMax * FRENZY_PERCENT

/** Instabilidade temporal em alerta: um passo antes do paradoxo. */
export const instabilityCritical = (c: Character) => c.instability >= INSTABILITY_LIMIT - 1
