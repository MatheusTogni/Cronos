import type { ConditionPolarity } from '@/types/api'

/**
 * Arte das condições do catálogo: ícone (Material Design Icons) e cor.
 * Condição sem entrada aqui usa o ícone e a cor da polaridade.
 */
const ART: Record<string, { icon: string; color?: string }> = {
  sangrando: { icon: 'mdi-water', color: '#b3202a' },
  envenenado: { icon: 'mdi-bottle-tonic-skull', color: '#5f9e2f' },
  queimando: { icon: 'mdi-fire', color: '#e0662a' },
  hesitante: { icon: 'mdi-hand-back-left' },
  amedrontado: { icon: 'mdi-ghost' },
  'em-panico': { icon: 'mdi-alert-octagram' },
  distraido: { icon: 'mdi-weather-windy' },
  desequilibrado: { icon: 'mdi-scale-unbalanced' },
  derrubado: { icon: 'mdi-human-handsdown' },
  preso: { icon: 'mdi-link-lock' },
  lento: { icon: 'mdi-snail' },
  incapacitado: { icon: 'mdi-cancel', color: '#8e1b1b' },
  'congelado-no-tempo': { icon: 'mdi-timer-sand-paused', color: '#3d8bd9' },
  cego: { icon: 'mdi-eye-off' },
  surdo: { icon: 'mdi-ear-hearing-off', color: '#3fb8a9' },
  'sem-equilibrio': { icon: 'mdi-orbit' },
  confuso: { icon: 'mdi-help-rhombus', color: '#9466d6' },
  azarado: { icon: 'mdi-dice-1', color: '#a83232' },
  acelerado: { icon: 'mdi-run-fast', color: '#3d8bd9' },
  frenesi: { icon: 'mdi-flash', color: '#d04a3a' },
  'ignora-dor': { icon: 'mdi-shield-half-full' },
  regenerando: { icon: 'mdi-heart-plus' },
  'lua-rubra': { icon: 'mdi-moon-full', color: '#c0262d' },
  'cacada-escarlate': { icon: 'mdi-paw', color: '#c73a2e' },
  'mascara-da-serenidade': { icon: 'mdi-drama-masks', color: '#7fb3d5' },
  'mascara-do-carrasco': { icon: 'mdi-drama-masks', color: '#9b2c2c' },
  'mascara-vazia': { icon: 'mdi-incognito', color: '#8a8a9a' },
  'marcado-pelo-pressagio': { icon: 'mdi-eye-circle', color: '#3fb8a9' },
  divida: { icon: 'mdi-hand-coin', color: '#c9a227' },
}

const BY_POLARITY: Record<ConditionPolarity, { icon: string; color: string }> = {
  BUFF: { icon: 'mdi-arrow-up-bold-circle', color: '#3fa66b' },
  DEBUFF: { icon: 'mdi-arrow-down-bold-circle', color: '#a8322b' },
  NEUTRAL: { icon: 'mdi-swap-vertical-circle', color: '#c9a227' },
}

export function conditionArt(id: string, polarity: ConditionPolarity) {
  const base = BY_POLARITY[polarity]
  const art = ART[id]
  return { icon: art?.icon ?? base.icon, color: art?.color ?? base.color }
}

/** 3 → "III"; até 39, o bastante para turnos. */
export function roman(n: number) {
  const parts: [number, string][] = [
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ]
  let out = ''
  for (const [v, s] of parts) {
    while (n >= v) {
      out += s
      n -= v
    }
  }
  return out
}
