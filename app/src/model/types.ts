// Types du format projet Flooow — format v2 (voir cadrage/05-implementation/evolution-v2.md §1).
// Deux structures : un arbre de contenance (parentId, pages → blocs) et un registre de services
// (doc.services) + des notes rattachées (attachedTo) + quelques arêtes manuelles (edges).
// Ne pas diverger sans migration + bump de formatVersion.

import type { RichDoc } from './richContent'

export type NodeType = 'frame' | 'note' | 'feature'
export type FrameKind = 'page' | 'block' | 'module'
export type NoteKind = 'behavior' | 'api'
export type BlockType = 'hero' | 'cta' | 'grid' | 'damier' | 'menu' | 'footer' | 'feature' | 'free'
export type Facet = 'front' | 'back' | 'fullstack'
export type EdgeType = 'navigatesTo' | 'dependsOn' | 'realizedBy'
/**
 * Périmètre de réalisation d'une fonctionnalité (couche fonctionnelle, cadrage-par-fonctionnalite.md).
 * `site` = le site consommateur ; `editor` = l'éditeur/PGS ; `internal`/`external` = équipes.
 */
export type Perimeter = 'site' | 'editor' | 'internal' | 'external'
/**
 * Couche du canvas (decisions.md §15) : le mode Arborescence travaille la couche `structural`
 * (pages/blocs/notes), le mode Fonctionnalités la couche `functional` (modules/fonctionnalités).
 * Un seul fichier sous les deux ; le mode masque complètement l'autre couche.
 */
export type CanvasLayer = 'structural' | 'functional'
/** Mode de rendu d'une arête (evolution-v2.md §8, révisé) : tracé continu ou paire de pastilles « portail ». */
export type EdgeRender = 'line' | 'portal'
export type Risk = 'low' | 'medium' | 'high'

/** Liste ordonnée des types de blocs (source pour les sélecteurs UI). */
export const BLOCK_TYPES: BlockType[] = [
  'hero',
  'cta',
  'grid',
  'damier',
  'menu',
  'footer',
  'feature',
  'free',
]

/** Liste ordonnée des périmètres (source pour les sélecteurs UI). */
export const PERIMETERS: Perimeter[] = ['site', 'editor', 'internal', 'external']

/**
 * Version courante du format sérialisé.
 * v3 : couche fonctionnelle (module + feature).
 * v4 : contenu de fonctionnalité unifié en un document riche `content` (remplace description/implies/
 *      toConfirm/notes).
 */
export const CURRENT_FORMAT_VERSION = 4 as const

export interface SiteAttrs {
  context: string
  constraints: string[]
  notes: string
}

export interface ProjectMeta {
  name: string
  formatVersion: 4
  createdAt: string // ISO date
  updatedAt: string // ISO date
  pricing: { riskCoeff: number; dailyRate: number | null }
  homePageId: string | null // racine du parcours navigation (orphelines)
}

export interface Position {
  x: number
  y: number
}

// ── Registre de services (plus des nœuds du canvas) ──────────────────────────

export interface ServiceEndpoint {
  method: string
  path: string
  notes: string
}

export interface Service {
  id: string
  name: string
  baseUrl: string // « URL de base » — regroupe les endpoints dans la vue API
  auth: string
  risk: Risk
  endpoints: ServiceEndpoint[]
  notes: string
}

// ── Nœuds ────────────────────────────────────────────────────────────────────

export interface BaseNode {
  id: string // UUID v4 opaque et stable (généré par factory.genId), unique
  type: NodeType
  parentId: string | null // blocs : la page ; pages/notes : null
  position: Position
  lot?: number | null // null/absent = hérité (voir lots.ts)
}

/** Frame `page` — écran/route. Position x/y libre, porte les ports de navigation. */
export interface PageAttrs {
  name: string
  route?: string
  roles?: string[]
  description: string
  constraints: string[]
  logic: string
  notes: string
}

export interface PageNode extends BaseNode {
  type: 'frame'
  kind: 'page'
  attrs: PageAttrs
}

/** Frame `block` — bloc pleine largeur empilé dans une page. `parentId` = la page. */
export interface BlockAttrs {
  name: string
  blockType: BlockType
  description: string
  constraints: string[]
  notes: string
}

export interface BlockNode extends BaseNode {
  type: 'frame'
  kind: 'block'
  attrs: BlockAttrs
}

/**
 * Frame `module` (couche fonctionnelle) — regroupe des fonctionnalités, l'équivalent d'un fichier
 * de catalogue (ex. « Demande de devis »). `parentId` = null (racine fonctionnelle) pour l'instant ;
 * la nidification `domaine → module` est prévue plus tard (cadrage-par-fonctionnalite.md).
 */
export interface ModuleAttrs {
  name: string
  description: string
  notes: string
  /**
   * Taille MINIMALE fixée à la main (poignée de resize, coin bas-droit). Le module ne descend jamais
   * sous cette taille mais peut grandir au-delà si son contenu l'exige. `undefined` = auto (épouse le
   * contenu). Permet notamment d'élargir un module pour y poser des fonctionnalités côte à côte.
   */
  width?: number
  height?: number
}

export interface ModuleNode extends BaseNode {
  type: 'frame'
  kind: 'module'
  attrs: ModuleAttrs
}

export type FrameNode = PageNode | BlockNode | ModuleNode

/** Note `behavior` — carte flottante rattachée à UNE cible (`attachedTo` = page ou bloc). */
export interface BehaviorNoteAttrs {
  name: string
  description: string
  facet: Facet | null
  trigger: string
  rules: string
  hours: number | null
  notes: string
}

/** Note `api` — carte flottante rattachée à une cible, référence un service + un endpoint. */
export interface ApiNoteAttrs {
  serviceId: string
  method: string
  path: string
  facet: Facet | null
  notes: string
}

export interface BaseNoteNode extends BaseNode {
  type: 'note'
  attachedTo: string // id d'une page ou d'un bloc
}

export interface BehaviorNote extends BaseNoteNode {
  kind: 'behavior'
  attrs: BehaviorNoteAttrs
}

export interface ApiNote extends BaseNoteNode {
  kind: 'api'
  attrs: ApiNoteAttrs
}

export type NoteNode = BehaviorNote | ApiNote

// ── Fonctionnalité (couche fonctionnelle) ────────────────────────────────────

/**
 * Nœud `feature` — l'atome de cadrage amont (cadrage-par-fonctionnalite.md). Indépendant de
 * l'arborescence des pages : `parentId` = un `module` (ou null). Porte l'estimation (decisions.md
 * §15 : l'estimation vit ici, pas sur la note). Se relie par `dependsOn` (dépend de) aux autres
 * fonctionnalités et par `realizedBy` (réalisé par) aux pages/blocs qui la réalisent.
 */
export interface FeatureAttrs {
  code: string // identité stable référençable (ex. « DEV-04 »)
  name: string // titre
  content: RichDoc // contenu libre (document riche Tiptap/ProseMirror) — v4, remplace description/implies/toConfirm/notes
  perimeter: Perimeter | null // qui réalise
  estimate: string // charge, texte libre normalisé (ex. « 1j », « à estimer »)
}

export interface FeatureNode extends BaseNode {
  type: 'feature'
  parentId: string | null // id d'un module, ou null (racine fonctionnelle)
  attrs: FeatureAttrs
}

export type FlooowNode = PageNode | BlockNode | ModuleNode | BehaviorNote | ApiNote | FeatureNode

// ── Arêtes manuelles (réduites en v2) ────────────────────────────────────────

export interface EdgeAttrs {
  notes?: string
  /**
   * Mode de rendu de l'arête (evolution-v2.md §8, révisé). `'line'` (défaut) = tracé continu.
   * `'portal'` = paire de pastilles « off-page » aux deux extrémités au lieu d'un trait.
   * Purement VISUEL : ne change ni le comptage, ni l'arborescence dérivée de navigatesTo.
   */
  render?: EdgeRender
  /**
   * Verrou manuel du mode de rendu (evolution-v2.md §8). `true` quand l'utilisateur a choisi
   * explicitement ligne/portail (popover / clic droit) : la ré-évaluation AUTOMATIQUE (création,
   * déplacement) ne réécrit alors plus `render`. Absent/`false` = laissé à l'auto-détection.
   */
  renderManual?: boolean
  /**
   * Positions monde des deux nœuds portail (evolution-v2.md §8, révisé) quand `render:'portal'`.
   * `source` = pastille près de l'extrémité source, `target` = pastille près de la cible.
   * Auto-placées à la création, déplaçables ensuite ; recalculées à la volée si absentes.
   * Ignorées en rendu `line`.
   */
  portalPositions?: { source: Position; target: Position }
}

export interface FlooowEdge {
  id: string
  type: EdgeType
  source: string
  target: string
  attrs: EdgeAttrs
}

// ── Document ─────────────────────────────────────────────────────────────────

export interface ProjectDoc {
  meta: ProjectMeta
  site: { attrs: SiteAttrs }
  services: Service[]
  nodes: FlooowNode[]
  edges: FlooowEdge[]
}

// ── Index maintenus par le store (contrat des fonctions domain/) ─────────────

/** Index id → nœud (accès O(1), maintenu par stores/project). */
export type NodeIndex = Map<string, FlooowNode>
/** Index parentId → ids des enfants directs (clé `null` = enfants du site). */
export type ChildrenIndex = Map<string | null, string[]>
/** Index attachedTo → ids des notes rattachées à une cible. */
export type AttachedIndex = Map<string, string[]>

// ── Helpers de discrimination ────────────────────────────────────────────────

export function isFrame(node: FlooowNode): node is FrameNode {
  return node.type === 'frame'
}
export function isNote(node: FlooowNode): node is NoteNode {
  return node.type === 'note'
}
export function isPage(node: FlooowNode): node is PageNode {
  return node.type === 'frame' && node.kind === 'page'
}
export function isBlock(node: FlooowNode): node is BlockNode {
  return node.type === 'frame' && node.kind === 'block'
}
export function isModule(node: FlooowNode): node is ModuleNode {
  return node.type === 'frame' && node.kind === 'module'
}
export function isFeature(node: FlooowNode): node is FeatureNode {
  return node.type === 'feature'
}
export function isBehaviorNote(node: FlooowNode): node is BehaviorNote {
  return node.type === 'note' && node.kind === 'behavior'
}
export function isApiNote(node: FlooowNode): node is ApiNote {
  return node.type === 'note' && node.kind === 'api'
}

/**
 * Couche d'un nœud (decisions.md §15). Modules et fonctionnalités = couche fonctionnelle ;
 * pages, blocs et notes = couche structurelle. Sert au filtrage du canvas par mode.
 */
export function layerOf(node: FlooowNode): CanvasLayer {
  return isModule(node) || isFeature(node) ? 'functional' : 'structural'
}
