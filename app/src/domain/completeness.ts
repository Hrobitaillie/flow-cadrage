// Complétude : champs obligatoires par type → score (evolution-v2.md §4).
//   page → name+route+description ; bloc → name+blockType ;
//   note comportement → name+trigger ; note API → serviceId+method+path.
import type { FlooowNode } from '@/model/types'
import { isFeature } from '@/model/types'
import { isEmptyDoc } from '@/model/richContent'

export type CompletenessKey = 'page' | 'block' | 'module' | 'behavior' | 'api' | 'feature'

/**
 * Champs obligatoires par type/kind (source unique : pilote aussi les astérisques du panneau).
 */
export const REQUIRED_FIELDS: Record<CompletenessKey, string[]> = {
  page: ['name', 'route', 'description'],
  block: ['name', 'blockType'],
  module: ['name'],
  behavior: ['name', 'trigger'],
  api: ['serviceId', 'method', 'path'],
  feature: ['name', 'content'], // `content` = document riche : complétude via isEmptyDoc (voir plus bas)
}

export interface Completeness {
  missing: string[]
  complete: boolean
}

/** Clé de table pour un nœud (feature → 'feature' ; sinon le kind du frame/de la note). */
function requiredKey(node: FlooowNode): CompletenessKey {
  return node.type === 'feature' ? 'feature' : node.kind
}

/** Une valeur est « manquante » si absente, ou chaîne vide/blanche, ou tableau vide. */
function isBlank(value: unknown): boolean {
  if (value == null) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  return false
}

/**
 * Complétude d'un nœud : liste des champs obligatoires manquants + booléen.
 */
export function completeness(node: FlooowNode): Completeness {
  const fields = REQUIRED_FIELDS[requiredKey(node)]
  const attrs = node.attrs as unknown as Record<string, unknown>
  // `content` (fonctionnalité) est un document riche : « manquant » = document vide (isEmptyDoc).
  const missing = fields.filter((field) => {
    if (isFeature(node) && field === 'content') return isEmptyDoc(node.attrs.content)
    return isBlank(attrs[field])
  })
  return { missing, complete: missing.length === 0 }
}

/** Nombre d'éléments incomplets dans une liste de nœuds (pour l'en-tête des exports/vues). */
export function countIncomplete(nodes: FlooowNode[]): number {
  return nodes.reduce((count, node) => (completeness(node).complete ? count : count + 1), 0)
}
