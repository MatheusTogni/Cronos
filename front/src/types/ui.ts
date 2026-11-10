/** Campo do QuickFormDialog. */
export interface QuickField {
  key: string
  label: string
  type?: 'text' | 'number' | 'textarea'
  required?: boolean
  min?: number
  max?: number
  hint?: string
  maxlength?: number
}

/** Ação rápida do mestre no AdjustDialog. */
export type AdjustKind = 'damage' | 'heal' | 'mana' | 'xp'
