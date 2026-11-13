/**
 * Faixa de saúde de um inimigo: o que o jogador vê no lugar do número.
 * Quem vê a vida de verdade (HP/HPMax) é só o mestre.
 */
export type HealthBand =
  'INTACT' | 'WOUNDED' | 'BADLY_WOUNDED' | 'NEAR_DEATH' | 'DOWN';

export function healthBand(hp: number, hpMax: number): HealthBand {
  if (hp <= 0) return 'DOWN';
  if (hp >= hpMax) return 'INTACT';
  const ratio = hp / hpMax;
  if (ratio > 0.5) return 'WOUNDED';
  if (ratio > 0.25) return 'BADLY_WOUNDED';
  return 'NEAR_DEATH';
}

/** Como o log narra cada faixa (lido depois de um travessão: "Goblin foi atingido — ferido"). */
export const BAND_NARRATION: Record<HealthBand, string> = {
  INTACT: 'intacto',
  WOUNDED: 'ferido',
  BADLY_WOUNDED: 'muito ferido',
  NEAR_DEATH: 'por um fio',
  DOWN: 'caiu!',
};
