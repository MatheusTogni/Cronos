import type { Transfer } from '@/types/api'

const stack = (x: { name: string; qty: number }) => `${x.qty > 1 ? `${x.qty}× ` : ''}${x.name}`

/** "2× Poção de Vida", "3 de ouro" ou "Corda por Antídoto": o que a oferta move. */
export function transferSummary(t: Transfer): string {
  if (t.gold > 0) return `${t.gold} de ouro`
  if (!t.give) return ''
  return t.ask ? `${stack(t.give)} por ${stack(t.ask)}` : stack(t.give)
}
