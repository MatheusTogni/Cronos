/**
 * Catálogo da loja do mercador. Igual ao back (game/shop.ts): preço, cura e
 * se o item fica depois do uso. Aqui também ficam o grupo da prateleira e o
 * visual de cada item.
 */

/** Moedas de ouro que cada jogador recebe ao fim de um combate (igual ao back). */
export const COMBAT_REWARD_GOLD = 3

export type ShopGroup = 'potions' | 'provisions' | 'adventure'

export interface ShopItem {
  code: string
  name: string
  price: number
  description: string
  group: ShopGroup
  /** Cor do líquido: o item é desenhado como garrafa. */
  bottle?: string
  /** Ícone mdi, para o que não é garrafa. */
  icon?: string
  /** Cura automática ao usar. */
  hp?: number
  mana?: number
  /** O uso não gasta o item (Corda, Gazua). */
  keep?: boolean
}

export const SHOP_GROUPS: { id: ShopGroup; title: string }[] = [
  { id: 'potions', title: 'Poções e elixires' },
  { id: 'provisions', title: 'Provisões' },
  { id: 'adventure', title: 'Aventura' },
]

export const SHOP_ITEMS: ShopItem[] = [
  { code: 'POTION_HEALTH', name: 'Poção de Vida', price: 5, description: 'Recupera 10 de vida.', group: 'potions', bottle: '#d2453d', hp: 10 },
  { code: 'POTION_MANA', name: 'Poção de Mana', price: 5, description: 'Recupera 10 de mana.', group: 'potions', bottle: '#3f86e0', mana: 10 },
  { code: 'ELIXIR_TRAVELER', name: 'Elixir do Viajante', price: 7, description: 'Recupera 5 de vida e 5 de mana.', group: 'potions', bottle: '#9158d6', hp: 5, mana: 5 },
  { code: 'RATION', name: 'Ração de Viagem', price: 3, description: 'Recupera 5 de vida.', group: 'provisions', icon: 'mdi-food-drumstick', hp: 5 },
  { code: 'ANTIDOTE', name: 'Antídoto', price: 4, description: 'Neutraliza um veneno ou condição negativa.', group: 'adventure', bottle: '#43b06f' },
  { code: 'SMOKE_BOMB', name: 'Bomba de Fumaça', price: 6, description: 'Cobre uma fuga ou ação furtiva do grupo.', group: 'adventure', icon: 'mdi-smoke' },
  { code: 'FIRE_FLASK', name: 'Frasco de Fogo', price: 8, description: 'Arremessado em um inimigo, explode em chamas.', group: 'adventure', bottle: '#e68a2e' },
  { code: 'PROTECTION_AMULET', name: 'Amuleto de Proteção', price: 10, description: 'Absorve o próximo golpe sofrido.', group: 'adventure', icon: 'mdi-shield-star' },
  { code: 'TORCH', name: 'Tocha', price: 1, description: 'Ilumina um lugar escuro.', group: 'adventure', icon: 'mdi-torch' },
  { code: 'ROPE', name: 'Corda', price: 2, description: 'Para descer, amarrar ou escalar.', group: 'adventure', icon: 'mdi-lasso', keep: true },
  { code: 'LOCKPICK', name: 'Gazua', price: 4, description: 'Para abrir fechaduras.', group: 'adventure', icon: 'mdi-key-variant', keep: true },
]

/** O item do catálogo com esse código (undefined = item dado à mão pelo mestre). */
export const shopItem = (code: string | null | undefined) =>
  code ? SHOP_ITEMS.find((i) => i.code === code) : undefined
