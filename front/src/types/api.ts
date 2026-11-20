// Tipos espelhados das respostas da API (back/src).

export type Role = 'MASTER' | 'PLAYER'

export interface AuthUser {
  id: string
  username: string
  displayName: string
  role: Role
}

export interface UserRow extends AuthUser {
  active: boolean
  createdAt: string
}

export interface LoginResponse {
  accessToken: string
  user: AuthUser
}

/** Faixa de crítico: só texto de referência, quem decide o que acontece é o mestre. */
export interface Crit {
  min: number
  max: number
  text: string
}

export type AbilityKind = 'BASIC' | 'SKILL'

export interface Ability {
  id: string
  classId: string
  kind: AbilityKind
  name: string
  manaCost: number
  description: string
  crits: Crit[] | null
  sortOrder: number
  /** Nível em que a habilidade é liberada (1ª: 1, 2ª: 5, 3ª: 10). */
  unlockLevel: number
}

export interface CharacterClass {
  id: string
  name: string
  tagline: string | null
  categories: string[]
  identity: string
  mechanicName: string
  mechanicText: string
  baseHp: number
  baseMana: number
  color: string
  artFile: string
  sortOrder: number
  abilities: Ability[]
}

export const ROLE_LABEL: Record<Role, string> = {
  MASTER: 'Mestre',
  PLAYER: 'Jogador',
}

// ───────────── campanha ─────────────

export type CampaignStatus = 'DRAFT' | 'LOBBY' | 'ACTIVE' | 'ENDED'

export const STATUS_LABEL: Record<CampaignStatus, string> = {
  DRAFT: 'Em preparação',
  LOBBY: 'Lobby aberto',
  ACTIVE: 'Em andamento',
  ENDED: 'Encerrada',
}

export const STATUS_COLOR: Record<CampaignStatus, string> = {
  DRAFT: 'grey',
  LOBBY: 'secondary',
  ACTIVE: 'success',
  ENDED: 'grey-darken-1',
}

export interface MasterCampaign {
  id: string
  name: string
  description: string | null
  status: CampaignStatus
  createdAt: string
  playerCount: number
}

export interface OpenCampaign {
  id: string
  name: string
  description: string | null
  status: CampaignStatus
  master: { displayName: string }
  playerCount: number
  maxPlayers: number
  joined: boolean
  ready: boolean
}

export type ConditionPolarity = 'BUFF' | 'DEBUFF' | 'NEUTRAL'

export const POLARITY_LABEL: Record<ConditionPolarity, string> = {
  BUFF: 'Positiva',
  DEBUFF: 'Negativa',
  NEUTRAL: 'Neutra',
}

export const POLARITY_COLOR: Record<ConditionPolarity, string> = {
  BUFF: 'success',
  DEBUFF: 'error',
  NEUTRAL: 'warning',
}

/** Condição do catálogo (GET /conditions). */
export interface ConditionDef {
  id: string
  name: string
  description: string
  polarity: ConditionPolarity
  sortOrder: number
}

/** Status à mostra: sem prazo nem efeito automático. O mestre coloca e tira. */
export interface Condition {
  id: string
  characterId: string | null
  summonId: string | null
  npcId: string | null
  defId: string | null
  name: string
  description: string | null
  source: string | null
  polarity: ConditionPolarity
}

export interface Summon {
  id: string
  characterId: string
  name: string
  hp: number
  hpMax: number
  notes: string
  conditions: Condition[]
}

/**
 * Inimigo/NPC controlado pelo mestre (age no turno do mestre). Só o mestre
 * recebe os inimigos; o jogador não recebe nenhum (nem o nome).
 */
export interface Npc {
  id: string
  campaignId: string
  name: string
  conditions: Condition[]
  hp: number
  hpMax: number
  notes: string
}

export interface InventoryItem {
  id: string
  name: string
  qty: number
  description: string | null
  /** Item do catálogo da loja (ver utils/shop.ts); null = dado à mão pelo mestre. */
  code: string | null
}

export interface Character {
  id: string
  campaignId: string
  userId: string
  classId: string
  name: string
  level: number
  xp: number
  hp: number
  hpMax: number
  mana: number
  manaMax: number
  /** Moedas de ouro. */
  gold: number
  notes: string
  summons: Summon[]
  conditions: Condition[]
  inventory: InventoryItem[]
}

export interface LobbyPlayer {
  userId: string
  displayName: string
  username: string
  ready: boolean
}

/** Combate em turnos; null quando não há combate. */
export interface CombatState {
  round: number
  /** 0 = mestre; i = order[i - 1]. */
  turnIndex: number
  order: string[]
  /** null = turno do mestre. */
  currentCharacterId: string | null
  /** Quem tem a vez já usou a habilidade deste turno (uma por turno). */
  skillUsed: boolean
}

export interface CampaignState {
  id: string
  name: string
  description: string | null
  status: CampaignStatus
  startedAt: string | null
  master: { id: string; displayName: string }
  players: LobbyPlayer[]
  characters: Character[]
  npcs: Npc[]
  shownImage: { id: string; title: string; url: string } | null
  /** Loja do mercador aberta para os jogadores. */
  shopOpen: boolean
  combat: CombatState | null
}

export type TransferKind = 'GIFT' | 'TRADE'
export type TransferStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'CANCELLED'

/** Oferta de doação (item ou ouro) ou troca (item por item) entre jogadores. */
export interface Transfer {
  id: string
  campaignId: string
  kind: TransferKind
  status: TransferStatus
  from: { id: string; name: string }
  to: { id: string; name: string }
  /** Item oferecido (null numa doação de ouro). */
  give: { name: string; qty: number } | null
  /** Ouro oferecido (0 quando é item). */
  gold: number
  /** Só na troca: o que o remetente pede ao outro jogador. */
  ask: { name: string; qty: number } | null
}

export type LogType =
  | 'DAMAGE'
  | 'HEAL'
  | 'MANA'
  | 'XP'
  | 'LEVEL'
  | 'ABILITY_USED'
  | 'DICE_ROLL'
  | 'CONDITION_ADDED'
  | 'CONDITION_REMOVED'
  | 'SUMMON_CREATED'
  | 'SUMMON_REMOVED'
  | 'SUMMON_UPDATED'
  | 'ITEM_ADDED'
  | 'ITEM_REMOVED'
  | 'ITEM_UPDATED'
  | 'CAMPAIGN'
  | 'NOTE'
  | 'TURN'
  | 'NPC_CREATED'
  | 'NPC_UPDATED'
  | 'NPC_REMOVED'

/** Quem pode receber condição. */
export type TargetKind = 'character' | 'summon' | 'npc'
export interface ConditionTarget {
  kind: TargetKind
  id: string
  name: string
}

export interface LogEntry {
  id: string
  type: LogType
  message: string
  roll: number | null
  characterId: string | null
  createdAt: string
  revertedAt: string | null
  revertible: boolean
  actor: { id: string; displayName: string } | null
}

export interface CampaignImage {
  id: string
  title: string
  url: string
  createdAt: string
}

/** Lista com id: o que entrou/mudou (inteiro), o que saiu e a ordem nova. */
export interface ListPatch<T> {
  upsert: T[]
  remove: string[]
  order?: string[]
}

/** Só o que mudou na campanha desde o último envio (evento campaign:patch). */
export interface CampaignPatch {
  id: string
  set?: Partial<Omit<CampaignState, 'characters' | 'npcs'>>
  characters?: ListPatch<Character>
  npcs?: ListPatch<Npc>
}

/** Resposta das ações de jogo. */
export interface ActionResult {
  log: LogEntry | null
}
