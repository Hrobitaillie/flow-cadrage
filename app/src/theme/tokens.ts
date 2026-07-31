// Tokens visuels centralisés (couleurs de lots, facettes, risque).
//
// Appliqués en styles inline (`:style`) et non via des classes Tailwind : des classes dynamiques
// construites à l'exécution (`bg-[${color}]`) ne sont pas purgeables sans safelist. Un seul point
// de vérité pour que les pastilles des panneaux (FilterBar, PropertiesPanel) correspondent
// EXACTEMENT aux badges du canvas.
import type { Facet, Risk } from '@/model/types'

/** 8 couleurs de lots, cycliques (lot 1 → index 0). */
export const LOT_COLORS = [
  '#64748b', // 1 slate
  '#2563eb', // 2 blue
  '#7c3aed', // 3 violet
  '#0891b2', // 4 cyan
  '#ca8a04', // 5 amber
  '#dc2626', // 6 red
  '#059669', // 7 emerald
  '#db2777', // 8 pink
] as const

/** Couleur d'un lot (cyclique, robuste aux valeurs négatives/hors-plage). */
export function lotColor(lot: number): string {
  const n = LOT_COLORS.length
  return LOT_COLORS[(((lot - 1) % n) + n) % n] as string
}

export const FACET_COLORS: Record<Facet, string> = {
  front: '#2563eb',
  back: '#7c3aed',
  fullstack: '#0891b2',
}

export const RISK_COLORS: Record<Risk, string> = {
  low: '#059669',
  medium: '#ca8a04',
  high: '#dc2626',
}

// ── Code couleur des liens/notes (décision Hugo) ──────────────────────────────
// GRIS = Navigation (arêtes navigatesTo + portails) · ORANGE = Note comportement · BLEU = API.
export const NAV_COLOR = '#64748b'
export const NOTE_COLORS = {
  behavior: '#f59e0b',
  api: '#2563eb',
} as const
