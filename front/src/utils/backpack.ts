import type { InventoryItem } from '@/types/api'
import { SHOP_ITEMS, shopItem } from '@/utils/shop'

/**
 * Mochila do personagem: quadradinhos de 3×3. Cada item diferente ocupa um
 * quadradinho e a quantidade soma na mesma pilha. Igual ao back
 * (game/backpack.ts), que é quem confere de verdade.
 */
export const BACKPACK_SLOTS = 9
export const BACKPACK_COLUMNS = 3

/** O nome sem diferença de maiúsculas, acentos e espaços a mais. */
const nameKey = (name: string) =>
  name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

interface Identity {
  code: string | null
  name: string
}

/** Mesmo item: o mesmo código do catálogo ou, sem código em um dos lados, o mesmo nome. */
export const sameItem = (a: Identity, b: Identity) =>
  a.code && b.code ? a.code === b.code : nameKey(a.name) === nameKey(b.name)

/** Cabe mais este item? Se já existe a pilha dele, sempre; senão, só com quadradinho livre. */
export const hasRoomFor = (inventory: InventoryItem[], item: Identity) =>
  inventory.length < BACKPACK_SLOTS || inventory.some((i) => sameItem(i, item))

/**
 * Os quadradinhos da mochila, na ordem: os itens e depois os vazios, até
 * completar a grade. Se houver mais de 9 itens (mochila antiga), a grade cresce
 * para não esconder nenhum.
 */
export function backpackSlots(inventory: InventoryItem[]): (InventoryItem | null)[] {
  const total = Math.ceil(Math.max(BACKPACK_SLOTS, inventory.length) / BACKPACK_COLUMNS) * BACKPACK_COLUMNS
  return Array.from({ length: total }, (_, i) => inventory[i] ?? null)
}

/** Como o item é desenhado: garrafa colorida ou ícone mdi. */
export interface ItemVisual {
  bottle?: string
  icon?: string
}

/** Palavras do nome que escolhem o ícone de um item dado à mão pelo mestre (sem acento). */
const KEYWORDS: [RegExp, ItemVisual][] = [
  [/\b(poc[ao]|elixir|frasco|antido|tonic)/, { bottle: '#9158d6' }],
  [/\b(chave|gazua)/, { icon: 'mdi-key-variant' }],
  [/\b(espad|lamin|adaga|punhal|faca|machad)/, { icon: 'mdi-sword' }],
  [/\b(arco|flecha|besta)/, { icon: 'mdi-bow-arrow' }],
  [/\bescudo/, { icon: 'mdi-shield' }],
  [/\bmapa/, { icon: 'mdi-map' }],
  [/\b(pergaminho|carta|bilhete|diario|livro|grimorio|tomo)/, { icon: 'mdi-script-text' }],
  [/\b(anel|alianca)/, { icon: 'mdi-ring' }],
  [/\b(gema|joia|cristal|diamante|rubi|esmeralda|safira)/, { icon: 'mdi-diamond-stone' }],
  [/\b(osso|caveira|cranio)/, { icon: 'mdi-skull' }],
  [/\b(pao|carne|fruta|maca|queijo|comida)/, { icon: 'mdi-food-apple' }],
  [/\b(cajado|varinha|bastao)/, { icon: 'mdi-auto-fix' }],
]

const GENERIC: ItemVisual = { icon: 'mdi-treasure-chest' }

/**
 * O desenho do item: o do catálogo da loja (pelo código ou, se o mestre deu à
 * mão um item de mesmo nome, pelo nome); senão, um ícone pela palavra do nome;
 * senão, um baú genérico.
 */
export function itemVisual(item: Identity): ItemVisual {
  const key = nameKey(item.name)
  const product = shopItem(item.code) ?? SHOP_ITEMS.find((p) => nameKey(p.name) === key)
  if (product) return { bottle: product.bottle, icon: product.icon }
  return KEYWORDS.find(([re]) => re.test(key))?.[1] ?? GENERIC
}
