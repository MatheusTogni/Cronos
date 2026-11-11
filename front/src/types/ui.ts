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

/** Quadro da FrameGallery (classes, condições). */
export interface GalleryItem {
  id: string
  name: string
  /** Linha pequena na plaquinha (categorias, tipo…). */
  subtitle: string
  /** Cor de destaque (brilho da moldura e do fundo ao abrir). */
  accent: string
}
