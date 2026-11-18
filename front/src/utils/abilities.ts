import type { Crit } from '@/types/api'

/** "7", "5–6" ou "17+": a faixa do dado em que o crítico vale. */
export const critLabel = (c: Crit) => (c.min === c.max ? `${c.min}` : c.max === 20 ? `${c.min}+` : `${c.min}–${c.max}`)
