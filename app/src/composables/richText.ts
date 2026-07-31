// Configuration Tiptap partagée par l'éditeur (RichEditor) et le rendu lecture seule (RichContent).
// StarterKit fournit l'essentiel « Notion-like » avec ses règles de saisie : `## ` → titre, `- ` →
// liste, `1. ` → liste numérotée, `> ` → citation, `**gras**`, `*italique*`, `` `code` ``, etc.
// SCHÉMA CONTRÔLÉ (pas de nœud HTML brut, pas de lien href) → le HTML généré est sûr par construction.
// Les blocs métier CUSTOM (endpoint API, callout…) s'ajouteront ici comme extensions Node dédiées.
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import type { Extensions } from '@tiptap/core'

/** Extensions de rendu (lecture seule) — schéma seul, sans historique ni placeholder. */
export const richExtensions: Extensions = [StarterKit]

/** Extensions d'édition — StarterKit + placeholder d'invite. */
export function richEditExtensions(placeholder: string): Extensions {
  return [StarterKit, Placeholder.configure({ placeholder })]
}
