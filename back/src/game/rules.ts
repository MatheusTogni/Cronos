/** Números das regras do jogo, num só lugar para ajustar sem caçar pelo código. */

/** Vida máxima (e atual) que o personagem ganha a cada nível subido. */
export const HP_PER_LEVEL = 3;

/** Mana máxima (e atual) que o personagem ganha a cada nível subido. */
export const MANA_PER_LEVEL = 2;

/** O personagem nasce no nível 1 e não passa deste. */
export const MAX_LEVEL = 15;

/**
 * Nível em que cada habilidade da classe é liberada, na ordem em que aparecem
 * no seed (1ª, 2ª, 3ª). Quem começa tem só a primeira.
 */
export const SKILL_UNLOCK_LEVELS = [1, 5, 10];

/** Moedas de ouro que cada jogador recebe quando um combate termina. */
export const COMBAT_REWARD_GOLD = 3;
