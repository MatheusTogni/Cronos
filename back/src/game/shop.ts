/**
 * Loja do mercador: catálogo e regras de uso dos itens.
 *
 * Itens de cura (poções, ração, elixir) têm efeito automático ao usar. Os
 * demais só são registrados no log e tirados do inventário: o mestre decide o
 * que acontece. Os que têm `keep` ficam no inventário depois do uso.
 */
export interface ShopItem {
  /** Guardado em `InventoryItem.code` para reconhecer o item sem depender do nome. */
  code: string;
  name: string;
  /** Moedas de ouro. */
  price: number;
  description: string;
  /** Cura automática ao usar. */
  hp?: number;
  mana?: number;
  /** O uso não gasta o item (Corda, Gazua). */
  keep?: boolean;
}

export const SHOP_ITEMS: readonly ShopItem[] = [
  {
    code: 'POTION_HEALTH',
    name: 'Poção de Vida',
    price: 5,
    description: 'Recupera 10 de vida.',
    hp: 10,
  },
  {
    code: 'POTION_MANA',
    name: 'Poção de Mana',
    price: 5,
    description: 'Recupera 10 de mana.',
    mana: 10,
  },
  {
    code: 'RATION',
    name: 'Ração de Viagem',
    price: 3,
    description: 'Recupera 5 de vida.',
    hp: 5,
  },
  {
    code: 'ELIXIR_TRAVELER',
    name: 'Elixir do Viajante',
    price: 7,
    description: 'Recupera 5 de vida e 5 de mana.',
    hp: 5,
    mana: 5,
  },
  {
    code: 'ANTIDOTE',
    name: 'Antídoto',
    price: 4,
    description: 'Neutraliza um veneno ou condição negativa.',
  },
  {
    code: 'SMOKE_BOMB',
    name: 'Bomba de Fumaça',
    price: 6,
    description: 'Cobre uma fuga ou ação furtiva do grupo.',
  },
  {
    code: 'FIRE_FLASK',
    name: 'Frasco de Fogo',
    price: 8,
    description: 'Arremessado em um inimigo, explode em chamas.',
  },
  {
    code: 'PROTECTION_AMULET',
    name: 'Amuleto de Proteção',
    price: 10,
    description: 'Absorve o próximo golpe sofrido.',
  },
  {
    code: 'TORCH',
    name: 'Tocha',
    price: 1,
    description: 'Ilumina um lugar escuro.',
  },
  {
    code: 'ROPE',
    name: 'Corda',
    price: 2,
    description: 'Para descer, amarrar ou escalar.',
    keep: true,
  },
  {
    code: 'LOCKPICK',
    name: 'Gazua',
    price: 4,
    description: 'Para abrir fechaduras.',
    keep: true,
  },
];

export const SHOP_CODES: string[] = SHOP_ITEMS.map((i) => i.code);

/** O item do catálogo com esse código, ou undefined (item dado à mão pelo mestre). */
export const shopItem = (code: string | null | undefined) =>
  code ? SHOP_ITEMS.find((i) => i.code === code) : undefined;
