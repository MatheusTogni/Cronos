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

export interface Crit {
  min: number
  max: number
  text: string
  /** Condição do catálogo aplicada nessa faixa. */
  condition?: string
  turns?: number
  /** Em quem cai: no alvo (padrão) ou em quem usou. */
  on?: 'target' | 'self'
}

export type AbilityKind = 'BASIC' | 'SKILL'
export type AbilityEffect = 'SUMMON' | 'SACRIFICE_SUMMON' | 'SELF_CONDITION' | 'TARGET_CONDITION'

export interface Ability {
  id: string
  classId: string
  kind: AbilityKind
  name: string
  manaCost: number
  description: string
  crits: Crit[] | null
  effect: AbilityEffect | null
  effectData: Record<string, unknown> | null
  sortOrder: number
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
  maxSummons: number
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
  turns: number | null
  hpPerTurn: number
  skipsTurn: boolean
  exclusiveGroup: string | null
  sortOrder: number
}

export interface Condition {
  id: string
  characterId: string | null
  summonId: string | null
  npcId: string | null
  defId: string | null
  name: string
  description: string | null
  source: string | null
  exclusiveGroup: string | null
  /** Legado: texto livre de antes dos turnos. */
  duration: string | null
  polarity: ConditionPolarity
  /** Turnos restantes de quem carrega; null = sem prazo. */
  turnsLeft: number | null
  hpPerTurn: number
  skipsTurn: boolean
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

/** Inimigo/NPC controlado pelo mestre (age no turno do mestre). */
export interface Npc {
  id: string
  campaignId: string
  name: string
  hp: number
  hpMax: number
  notes: string
  conditions: Condition[]
}

export interface InventoryItem {
  id: string
  name: string
  qty: number
  description: string | null
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
  combat: CombatState | null
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

/** Efeito de habilidade aguardando o mestre escolher o alvo. */
export interface PendingEffect {
  source: string
  conditions: { defId?: string; name?: string; turns?: number | null }[]
}

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
  pendingEffect: PendingEffect | null
  actor: { id: string; displayName: string } | null
}

export interface CampaignImage {
  id: string
  title: string
  url: string
  createdAt: string
}

/** Resposta das ações de jogo. */
export interface ActionResult {
  log: LogEntry | null
}
