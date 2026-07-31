// Synchronisation store ↔ Vue Flow (format v2 — evolution-v2.md §2/§3).
//
// Principe (performances.md §2) : on **mappe** le graphe du store vers des nœuds/arêtes Vue Flow —
// jamais de partage par référence. Pendant un drag, Vue Flow gère seul la position (état interne) ;
// le store n'est muté qu'au **drop** (`onNodeDragStop`) ou à la connexion (`onConnect`) : une seule
// mutation, un seul patch d'undo, un seul autosave.
//
// Géométrie v2 :
//   - Pages : rectangles à en-tête, largeur fixe, hauteur = pile de blocs. Position monde libre.
//   - Blocs : enfants Vue Flow de leur page (parentNode), pleine largeur, empilés (y = index×STEP).
//   - Notes : cartes flottantes libres, reliées à `attachedTo` par un connecteur de proximité
//     (arête synthétique de type `attach`, géométrie calculée par ProximityConnector).
import { ref, watch, nextTick, onScopeDispose, type InjectionKey, type Ref } from 'vue'
import {
  useVueFlow,
  MarkerType,
  type Connection,
  type Edge,
  type GraphNode,
  type Node,
  type NodeChange,
  type NodeDragEvent,
  type OnConnectStartParams,
} from '@vue-flow/core'
import { useProjectStore } from '@/stores/project'
import { useTool } from '@/composables/useKeyboard'
import { useUiStore } from '@/stores/ui'
import type {
  BlockNode,
  BlockType,
  EdgeRender,
  EdgeType,
  FeatureNode,
  FlooowEdge,
  FlooowNode,
  ModuleNode,
  NoteNode,
  PageNode,
  Position,
} from '@/model/types'
import {
  isApiNote,
  isBlock,
  isFeature,
  isFrame,
  isModule,
  isNote,
  isPage,
  layerOf,
} from '@/model/types'
import { pageOf } from '@/domain/rollup'
import { docToPlainText } from '@/model/richContent'
import { FACET_COLORS, NAV_COLOR, NOTE_COLORS, lotColor } from '@/theme/tokens'

// Ré-export pour compat (tokens centralisés).
export { LOT_COLORS, FACET_COLORS, RISK_COLORS, lotColor } from '@/theme/tokens'

// ── Géométrie du canvas (le modèle v2 ne porte plus de `size`) ────────────────
export const PAGE_WIDTH = 300
export const PAGE_HEADER_H = 46
export const PAGE_PAD_X = 12
export const PAGE_PAD_TOP = 12
export const PAGE_PAD_BOTTOM = 12
/** Décalage vertical du premier bloc sous l'en-tête. */
export const CONTENT_TOP = PAGE_HEADER_H + PAGE_PAD_TOP
/** Pas vertical entre deux blocs (miroir de factory.BLOCK_STEP). */
export const BLOCK_STEP = 120
export const BLOCK_WIDTH = PAGE_WIDTH - 2 * PAGE_PAD_X
/**
 * Y (depuis le haut de la page) de l'ANCRAGE DE NAVIGATION : les tracés de navigation sortent/entrent
 * AU NIVEAU DE L'EN-TÊTE (nom/lot/slug), et les portails s'empilent juste en dessous. Le reste des
 * côtés est libre pour les notes. Miroir dans PageFrame.vue (position des handles nav).
 */
export const NAV_ANCHOR_Y = Math.round(PAGE_HEADER_H / 2)

/** Hauteur d'une page = en-tête + pile de blocs (≥ 1 emplacement) + marges. */
export function pageHeight(blockCount: number): number {
  return CONTENT_TOP + Math.max(blockCount, 1) * BLOCK_STEP + PAGE_PAD_BOTTOM
}

// ── Types de nœuds/arêtes Vue Flow (clés des slots #node-… / #edge-…) ─────────
export const NODE_TYPE = {
  page: 'page',
  block: 'block',
  note: 'note',
  /** Couche fonctionnelle : frame regroupant des fonctionnalités. */
  module: 'module',
  /** Couche fonctionnelle : nœud fonctionnalité (atome de cadrage). */
  feature: 'feature',
  /** Pastille portail synthétique (extrémité déplaçable d'une arête `render:'portal'`). */
  portal: 'portal',
} as const
export const EDGE_TYPE = {
  /** Arête manuelle typée (navigatesTo / dependsOn). */
  typed: 'typed',
  /** Connecteur automatique note → attachedTo (non interactif). */
  attach: 'attach',
  /** Court tracé reliant une pastille portail à son élément (non interactif). */
  portalTie: 'portalTie',
} as const

/** Préfixes d'id des nœuds portail synthétiques (extrémité source / cible). */
export const PORTAL_SRC_PREFIX = 'portal-src-'
export const PORTAL_TGT_PREFIX = 'portal-tgt-'

/**
 * z-index des arêtes : au-dessus de TOUS les nœuds (y compris un nœud sélectionné, que Vue Flow
 * élève de ~1000). Sinon un lien touchant un bloc — contenu dans une page au fond opaque — voit
 * son origine et sa fin masquées par la page.
 */
export const EDGE_Z = 2000

// ── Données passées aux composants nœud (props.data) ──────────────────────────
export interface PageNodeData {
  node: PageNode
  lot: number
  lotColor: string
  blockCount: number
  noteCount: number
  incomplete: boolean
  isHome: boolean
}
export interface BlockNodeData {
  node: BlockNode
  lot: number
  lotColor: string
  noteCount: number
  incomplete: boolean
}
export interface NoteNodeData {
  node: NoteNode
  lot: number
  facetColor: string | null
  serviceName: string | null
  incomplete: boolean
}
export interface TypedEdgeData {
  edgeType: EdgeType
  /** Distance d'éloignement du port avant de tourner (getSmoothStepPath). 0 = coude au ras du port
   *  (évite les S/demi-tours entre cartes proches en couche fonctionnelle). Défaut Vue Flow = 20. */
  offset?: number
}

// ── Couche fonctionnelle (module CONTIENT ses fonctionnalités, comme page → blocs) ────
export const MODULE_WIDTH = 300
export const MODULE_HEADER_H = 42
export const MODULE_PAD_X = 12
export const MODULE_PAD_BOTTOM = 14
/** Décalage vertical de la 1re fonctionnalité sous l'en-tête du module. */
export const MODULE_CONTENT_TOP = MODULE_HEADER_H + 12
/** Pas vertical entre deux fonctionnalités empilées (miroir de factory.FEATURE_STEP). */
export const FEATURE_STEP = 152
/** Hauteur d'une carte fonctionnalité (fixe → empilement déterministe ; assez haute pour les champs). */
export const FEATURE_HEIGHT = 124
/** Largeur d'une carte fonctionnalité (inset dans le module). */
export const FEATURE_WIDTH = MODULE_WIDTH - 2 * MODULE_PAD_X

/** Hauteur d'un module = en-tête + pile de fonctionnalités (≥ 1 emplacement) + marge. */
export function moduleHeight(featureCount: number): number {
  return MODULE_CONTENT_TOP + Math.max(featureCount, 1) * FEATURE_STEP + MODULE_PAD_BOTTOM
}

export interface ModuleNodeData {
  node: ModuleNode
  lot: number
  lotColor: string
  featureCount: number
  incomplete: boolean
}
/** Côté d'une carte fonctionnalité (port de lien « dépend de »). */
export type CardSide = 'top' | 'right' | 'bottom' | 'left'
/**
 * Un port de la carte fonctionnalité. Chaque lien occupe SON port (pas de superposition) ; un port
 * `free` par côté reste disponible pour un nouveau lien (quand on le relie, le recalcul en fait un
 * port occupé et un nouveau `free` réapparaît). `offset` = position (px) le long du côté.
 */
export interface FeatureHandle {
  id: string
  type: 'source' | 'target'
  side: CardSide
  offset: number
  free: boolean
  /** Seuls les ports LIBRES sont interactifs (démarrer/recevoir) → un lien = un port occupé figé. */
  connectable: boolean
}
/** Nombre de lignes affichées (clamp ellipsis) par zone de la carte ; 0 = zone masquée. */
export interface FeatureClamps {
  name: number
  content: number // aperçu du contenu riche (texte brut clampé)
}
export interface FeatureNodeData {
  node: FeatureNode
  lot: number
  lotColor: string
  moduleName: string | null
  perimeterLabel: string | null
  incomplete: boolean
  /** aucune page/bloc ne réalise cette fonctionnalité (pont realizedBy). */
  orphan: boolean
  handles: FeatureHandle[]
  clamps: FeatureClamps
}

/** Données d'une pastille portail synthétique (extrémité déplaçable d'une arête `render:'portal'`). */
export interface PortalNodeData {
  /** Id de l'arête portail sous-jacente (store). */
  edgeId: string
  /** Extrémité représentée par cette pastille. */
  end: 'source' | 'target'
  /** Ancrage de la pastille dans son nœud à largeur fixe (gauche = côté droit page, droite = côté gauche). */
  align: 'left' | 'right'
  /** Libellé « → cible » (source) ou « ← source » (cible). */
  label: string
  /** Id de l'AUTRE extrémité (clic gauche → focus dessus). */
  other: string
  /** Pastille compacte (couche fonctionnelle) : plus petite et discrète. */
  compact?: boolean
}

/** Ouverture du popover d'arête depuis une pastille portail (fourni par FlowCanvas). */
export const EDGE_MENU_KEY: InjectionKey<
  (edgeId: string, clientX: number, clientY: number) => void
> = Symbol('flooow-edge-menu')

/** Badges d'ordre « #n » live pendant le drag d'un bloc (clé = id). Fournis par FlowCanvas. */
export const ORDER_BADGE_KEY: InjectionKey<Ref<Map<string, number>>> = Symbol('flooow-order-badge')

export type QuickCreateKind = 'page' | 'block' | 'behavior' | 'api' | 'feature'

/** Menu de quick-create au lâcher d'un lien dans le vide. */
export interface QuickCreateState {
  screenX: number
  screenY: number
  worldX: number
  worldY: number
  sourceId: string
}
/** Menu contextuel (clic droit sur un nœud). */
export interface ContextMenuState {
  screenX: number
  screenY: number
  nodeId: string
}
/** Popover de changement de type d'arête (clic sur une arête typée). */
export interface EdgePopoverState {
  screenX: number
  screenY: number
  edgeId: string
  current: EdgeType
  choices: EdgeType[]
  render: EdgeRender
}

export interface CanvasSync {
  toFlowNodes: () => Node[]
  toFlowEdges: () => Edge[]
  orderBadges: Ref<Map<string, number>>
  /** Lignes de magnétisme (coordonnées MONDE) actives pendant le drag d'une page. */
  snapGuides: Ref<{ v: number[]; h: number[] }>
  dragGhost: Ref<{ x: number; y: number; w: number; h: number } | null>
  deleteSelection: () => void
  createPageAt: (position: { x: number; y: number }) => void
  // Menus contextuels (état + actions, rendus par FlowCanvas)
  quickCreate: Ref<QuickCreateState | null>
  contextMenu: Ref<ContextMenuState | null>
  edgePopover: Ref<EdgePopoverState | null>
  closeMenus: () => void
  runQuickCreate: (kind: QuickCreateKind) => void
  contextDelete: () => void
  contextSetHome: () => void
  contextSetBlockType: (blockType: BlockType) => void
  contextConvertNote: (kind: NoteNode['kind']) => void
  contextAddBehavior: () => void
  contextAddApi: () => void
  applyEdgeType: (type: EdgeType) => void
  toggleEdgeRenderFromPopover: () => void
  deleteEdgeFromPopover: () => void
  /** Ouvre le popover d'arête à une position écran (clic droit sur une pastille portail). */
  openEdgeMenu: (edgeId: string, clientX: number, clientY: number) => void
}

export function useCanvasSync(): CanvasSync {
  const store = useProjectStore()
  const ui = useUiStore()
  const vf = useVueFlow()
  const tool = useTool()

  const orderBadges = ref<Map<string, number>>(new Map())
  const quickCreate = ref<QuickCreateState | null>(null)
  const contextMenu = ref<ContextMenuState | null>(null)
  const edgePopover = ref<EdgePopoverState | null>(null)
  /** Lignes de magnétisme actives (monde) pendant le drag d'une page : `v` = X, `h` = Y. */
  const snapGuides = ref<{ v: number[]; h: number[] }>({ v: [], h: [] })
  /**
   * Fantôme d'emplacement (monde) affiché pendant le drag d'une fonctionnalité : rectangle pointillé
   * violet animé, à la taille de la carte, posé sur l'emplacement magnétisé prédit (à gauche/droite
   * d'une sœur alignée). `null` = aucun emplacement proche (la carte se posera à sa position libre).
   */
  const dragGhost = ref<{ x: number; y: number; w: number; h: number } | null>(null)

  // Source d'une connexion en cours (pour le quick-create au lâcher dans le vide).
  let connectSource: OnConnectStartParams | null = null
  let didConnect = false
  // Note en cours de drag (seule) → preview du reflow des autres notes pendant le déplacement.
  let noteDragId: string | null = null
  /**
   * Insertion en cours entre deux cartes empilées : les cartes `belowIds` sont décalées vers le bas
   * (preview live) de `shiftBy` pour ouvrir la place ; validé au drop, réinitialisé sinon.
   */
  let featureShift: { modId: string; belowIds: string[]; shiftBy: number } | null = null
  /**
   * Module cible décidé pendant le drag d'une fonctionnalité (piloté par le FANTÔME, pas par le centre
   * de la carte) : garantit que drag et drop choisissent le même module, y compris pour un placement à
   * gauche/au-dessus où le centre de la carte sort du module. `null` = détachement.
   */
  let featureDropModId: string | null = null

  // ── Géométrie ───────────────────────────────────────────────────────────────
  function blockCountOf(pageId: string): number {
    return store.orderedBlocksOf(pageId).length
  }

  /** Rect absolu (monde) d'une page. */
  function pageRect(page: PageNode): { x: number; y: number; w: number; h: number } {
    return {
      x: page.position.x,
      y: page.position.y,
      w: PAGE_WIDTH,
      h: pageHeight(blockCountOf(page.id)),
    }
  }

  /** Page dont le rectangle contient le point monde (hors `excludeId`). */
  function pageAtPoint(px: number, py: number, excludeId?: string): PageNode | null {
    for (const page of store.pages) {
      if (page.id === excludeId) continue
      const r = pageRect(page)
      if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return page
    }
    return null
  }

  // ── Auto-détection ligne vs portail (evolution-v2.md §8) ─────────────────────
  // Critère UNIQUE : le tracé direct traverse-t-il le rectangle d'une frame quelconque ? La
  // direction (recul gauche/droite) ne compte pas en soi. Les pages ont des poignées FIXES
  // (nav-source à droite, nav-target à gauche) → un lien part toujours du bord droit de la source
  // vers le bord gauche de la cible. On teste ce segment contre TOUTES les frames, source et cible
  // INCLUSES : un lien qui « repart en arrière » retraverse le corps de ses propres pages.
  const ANCHOR_EPS = 2 // décale les extrémités juste hors du bord, pour ne pas auto-intersecter le bord

  interface Rect {
    x: number
    y: number
    w: number
    h: number
  }

  /** Rect absolu (monde) d'une frame (page ou bloc). `null` pour les notes. */
  function frameRect(node: FlooowNode): Rect | null {
    if (isPage(node)) return pageRect(node)
    if (isBlock(node)) {
      const page = node.parentId ? store.nodeById(node.parentId) : null
      if (!page || !isPage(page)) return null
      return {
        x: page.position.x + PAGE_PAD_X,
        y: page.position.y + CONTENT_TOP + node.position.y,
        w: BLOCK_WIDTH,
        h: BLOCK_STEP,
      }
    }
    return null
  }

  /** Segment [a,b] ∩ rectangle axis-aligned (endpoint dans le rect OU croisement d'un bord). */
  function segIntersectsRect(a: Position, b: Position, r: Rect): boolean {
    const inside = (p: Position): boolean =>
      p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h
    if (inside(a) || inside(b)) return true
    const segHit = (
      x1: number, y1: number, x2: number, y2: number,
      x3: number, y3: number, x4: number, y4: number,
    ): boolean => {
      const d = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3)
      if (d === 0) return false
      const t = ((x3 - x1) * (y4 - y3) - (y3 - y1) * (x4 - x3)) / d
      const u = ((x3 - x1) * (y2 - y1) - (y3 - y1) * (x2 - x1)) / d
      return t >= 0 && t <= 1 && u >= 0 && u <= 1
    }
    const { x, y, w, h } = r
    return (
      segHit(a.x, a.y, b.x, b.y, x, y, x + w, y) ||
      segHit(a.x, a.y, b.x, b.y, x + w, y, x + w, y + h) ||
      segHit(a.x, a.y, b.x, b.y, x + w, y + h, x, y + h) ||
      segHit(a.x, a.y, b.x, b.y, x, y + h, x, y)
    )
  }

  /**
   * Points d'ancrage monde d'un lien : sortie = bord DROIT de la source (poignée nav-source),
   * entrée = bord GAUCHE de la cible (poignée nav-target), décalés de ANCHOR_EPS vers l'extérieur.
   */
  function navAnchors(s: FlooowNode, t: FlooowNode): { a: Position; b: Position } | null {
    const rs = frameRect(s)
    const rt = frameRect(t)
    if (!rs || !rt) return null
    // La navigation sort/entre EN HAUT (NAV_ANCHOR_Y), plus au milieu → le test d'obstruction
    // (ligne↔portail) suit le tracé réel : segment horizontal au niveau du haut des pages.
    return {
      a: { x: rs.x + rs.w + ANCHOR_EPS, y: rs.y + NAV_ANCHOR_Y },
      b: { x: rt.x - ANCHOR_EPS, y: rt.y + NAV_ANCHOR_Y },
    }
  }

  /**
   * Choisit le rendu d'une nouvelle arête : `portal` si le tracé direct (bord droit source →
   * bord gauche cible) traverse le rectangle d'UNE frame quelconque, source et cible INCLUSES
   * (un lien rétrograde retraverse ses propres pages). Sinon `line`. Pas de ré-évaluation ensuite.
   */
  function chooseRender(sourceId: string, targetId: string): EdgeRender {
    const s = store.nodeById(sourceId)
    const t = store.nodeById(targetId)
    if (!s || !t) return 'line'
    const anc = navAnchors(s, t)
    if (!anc) return 'line'
    for (const node of store.nodes.values()) {
      if (!isFrame(node)) continue
      const r = frameRect(node)
      if (r && segIntersectsRect(anc.a, anc.b, r)) return 'portal'
    }
    return 'line'
  }

  /**
   * Ré-évalue le rendu (ligne/portail) de TOUTES les arêtes après un déplacement de frame — bouger
   * une page peut obstruer/libérer le tracé d'arêtes entre deux AUTRES pages. Applique en un commit
   * via store.autoSetRenders (qui ignore les arêtes verrouillées renderManual). Au drop uniquement.
   */
  function reevaluateRenders(): void {
    const updates: { edgeId: string; mode: EdgeRender }[] = []
    for (const e of store.edges) {
      if (e.attrs.renderManual) continue
      const mode = chooseRender(e.source, e.target)
      if (mode === (e.attrs.render ?? 'line')) continue
      updates.push({ edgeId: e.id, mode })
    }
    if (updates.length) store.autoSetRenders(updates)
  }

  /** Libellé d'affichage d'un nœud (pour les pastilles portail). */
  function nodeLabel(id: string): string {
    const n = store.nodeById(id)
    if (!n) return id
    if (isApiNote(n)) return `${n.attrs.method} ${n.attrs.path}`.trim() || 'API'
    return n.attrs.name || id
  }

  /** Décompose l'id d'un nœud portail synthétique en `{ edgeId, end }`, ou `null`. */
  function parsePortalId(id: string): { edgeId: string; end: 'source' | 'target' } | null {
    if (id.startsWith(PORTAL_SRC_PREFIX)) {
      return { edgeId: id.slice(PORTAL_SRC_PREFIX.length), end: 'source' }
    }
    if (id.startsWith(PORTAL_TGT_PREFIX)) {
      return { edgeId: id.slice(PORTAL_TGT_PREFIX.length), end: 'target' }
    }
    return null
  }

  // ── Données de nœud ──────────────────────────────────────────────────────────
  function pageData(node: PageNode): PageNodeData {
    const blocks = store.orderedBlocksOf(node.id)
    let noteCount = store.notesOf(node.id).length
    for (const b of blocks) noteCount += store.notesOf(b.id).length
    return {
      node,
      lot: store.lotOf(node.id),
      lotColor: lotColor(store.lotOf(node.id)),
      blockCount: blocks.length,
      noteCount,
      incomplete: !store.completenessOf(node.id).complete,
      isHome: store.meta.homePageId === node.id,
    }
  }

  function blockData(node: BlockNode): BlockNodeData {
    return {
      node,
      lot: store.lotOf(node.id),
      lotColor: lotColor(store.lotOf(node.id)),
      noteCount: store.notesOf(node.id).length,
      incomplete: !store.completenessOf(node.id).complete,
    }
  }

  function noteData(node: NoteNode): NoteNodeData {
    const serviceName =
      node.kind === 'api' ? (store.serviceById(node.attrs.serviceId)?.name ?? null) : null
    return {
      node,
      lot: store.lotOf(node.id),
      facetColor: node.attrs.facet ? FACET_COLORS[node.attrs.facet] : null,
      serviceName,
      incomplete: !store.completenessOf(node.id).complete,
    }
  }

  // ── Données / mapping de la couche fonctionnelle ─────────────────────────────
  function featureCountOf(moduleId: string): number {
    return (store.childrenIndex.get(moduleId) ?? []).filter((cid) => {
      const c = store.nodeById(cid)
      return c != null && isFeature(c)
    }).length
  }

  function moduleData(node: ModuleNode): ModuleNodeData {
    const featureCount = featureCountOf(node.id)
    return {
      node,
      lot: store.lotOf(node.id),
      lotColor: lotColor(store.lotOf(node.id)),
      featureCount,
      incomplete: !store.completenessOf(node.id).complete,
    }
  }

  const PERIMETER_LABELS: Record<string, string> = {
    site: 'Site',
    editor: 'Éditeur',
    internal: 'Interne',
    external: 'Externe',
  }

  // ── Hauteur variable des cartes (plancher estimé ; la carte s'auto-dimensionne au contenu réel) ────
  const CARD_CHARS_PER_LINE = 42 // approx pour ~276px à 10px
  const CARD_NAME_LH = 15
  const CARD_TEXT_LH = 13
  const CARD_LABEL_H = 13

  function clampLines(text: string | null | undefined, cap: number): number {
    const t = (text ?? '').trim()
    if (!t) return 0
    return Math.min(cap, Math.max(1, Math.ceil(t.length / CARD_CHARS_PER_LINE)))
  }

  /**
   * Hauteur estimée d'une carte + lignes affichées (déterministe, sans mesure DOM). Sert de PLANCHER :
   * la carte s'auto-dimensionne au contenu réel (Vue Flow ResizeObserver), donc pas d'ellipsis ni de
   * clip — le contenu s'affiche EN ENTIER. `expanded` (carte sélectionnée) réserve un peu plus de place
   * pour l'édition (zone minimale + respiration).
   */
  function estimateFeature(
    node: FeatureNode,
    expanded = false,
  ): { height: number; clamps: FeatureClamps } {
    const a = node.attrs
    const rawContent = clampLines(docToPlainText(a.content), 200) // contenu complet (pas d'ellipsis)
    const clamps: FeatureClamps = {
      name: Math.max(1, clampLines(a.name || 'Fonctionnalité', 2)),
      content: expanded ? Math.max(rawContent, 3) : rawContent, // min ~3 lignes en édition
    }
    let h = 8 + 18 + 4 // pad haut + ligne badges + marge titre
    h += clamps.name * CARD_NAME_LH
    if (clamps.content) h += 3 + clamps.content * CARD_TEXT_LH
    if (expanded) h += 20 // respiration d'édition (curseur/bulle)
    // « Réalisé par » : chips (≈2 par ligne) + label, si présent.
    const realizers = store.realizersOfFeature(node.id).length
    if (realizers > 0) h += CARD_LABEL_H + Math.ceil(realizers / 2) * 20
    h += 6 + 20 // sélecteur de périmètre, toujours présent (éditable inline)
    h += 8 // pad bas
    return { height: Math.max(Math.round(h), 68), clamps }
  }

  interface FuncLayout {
    rect: Map<string, Rect>
    clamps: Map<string, FeatureClamps>
    /** Taille (auto) de chaque module = boîte englobante de ses fonctionnalités + marges. */
    moduleSize: Map<string, { w: number; h: number }>
  }

  /**
   * Layout de la couche fonctionnelle : rect absolu + clamps de chaque carte, et TAILLE de chaque
   * module. Positionnement LIBRE : chaque fonctionnalité vit à sa position (relative au contenu du
   * module, ou monde si racine) ; le module s'auto-dimensionne pour englober ses fonctionnalités.
   */
  function functionalLayout(): FuncLayout {
    const rect = new Map<string, Rect>()
    const clamps = new Map<string, FeatureClamps>()
    const moduleSize = new Map<string, { w: number; h: number }>()
    // Carte sélectionnée = éditable inline → agrandie pour accueillir l'éditeur Tiptap.
    const selectedId = ui.selectedId
    for (const m of store.modules) {
      const feats = (store.childrenIndex.get(m.id) ?? [])
        .map((cid) => store.nodeById(cid))
        .filter((n): n is FeatureNode => n != null && isFeature(n))
      let maxRight = FEATURE_WIDTH
      let maxBottom = 0
      for (const f of feats) {
        const est = estimateFeature(f, f.id === selectedId)
        const fx = Math.max(0, f.position.x)
        const fy = Math.max(0, f.position.y)
        rect.set(f.id, {
          x: m.position.x + MODULE_PAD_X + fx,
          y: m.position.y + MODULE_CONTENT_TOP + fy,
          w: FEATURE_WIDTH,
          h: est.height,
        })
        clamps.set(f.id, est.clamps)
        maxRight = Math.max(maxRight, fx + FEATURE_WIDTH)
        maxBottom = Math.max(maxBottom, fy + est.height)
      }
      // Taille = max(contenu, taille minimale fixée à la main). Le resize manuel n'est qu'un plancher :
      // le contenu peut toujours pousser le module plus grand.
      const manualW = m.attrs.width ?? 0
      const manualH = m.attrs.height ?? 0
      moduleSize.set(m.id, {
        w: Math.max(MODULE_WIDTH, maxRight + 2 * MODULE_PAD_X, manualW),
        h: Math.max(MODULE_CONTENT_TOP + 48, MODULE_CONTENT_TOP + maxBottom + MODULE_PAD_BOTTOM, manualH),
      })
    }
    // Fonctionnalités racines (sans module) : rect à leur position monde.
    for (const f of store.features) {
      if (rect.has(f.id)) continue
      const est = estimateFeature(f, f.id === selectedId)
      rect.set(f.id, { x: f.position.x, y: f.position.y, w: FEATURE_WIDTH, h: est.height })
      clamps.set(f.id, est.clamps)
    }
    return { rect, clamps, moduleSize }
  }

  /** Écart minimal (monde) laissé entre deux modules lors de l'auto-espacement. */
  const MODULE_GAP = 40

  /**
   * Auto-espacement des modules : quand un module grandit (resize manuel, contenu, cartes côte à côte),
   * il ne doit jamais en chevaucher un autre. Balayage gauche→droite : chaque module qui empiète sur
   * un précédent (chevauchement en Y ET trop proche en X) est poussé vers la DROITE juste après lui
   * (+ GAP). On ne bouge QUE ceux qui empiètent réellement → les écarts voulus sont préservés, rien ne
   * bouge s'il n'y a pas de collision. Mutations groupées en une entrée d'historique (coalesce).
   */
  function separateModules(): void {
    const layout = functionalLayout()
    const mods = store.modules
      .map((m) => ({
        m,
        sz: layout.moduleSize.get(m.id) ?? { w: MODULE_WIDTH, h: moduleHeight(featureCountOf(m.id)) },
        x: m.position.x,
        y: m.position.y,
      }))
      .sort((a, b) => a.x - b.x || a.y - b.y)
    const moves: { id: string; x: number; y: number }[] = []
    for (let i = 1; i < mods.length; i++) {
      const a = mods[i]
      if (!a) continue
      let minX = a.x
      for (let j = 0; j < i; j++) {
        const b = mods[j]
        if (!b) continue
        const yOverlap = a.y < b.y + b.sz.h && b.y < a.y + a.sz.h
        if (!yOverlap) continue
        const rightEdge = b.x + b.sz.w + MODULE_GAP
        // Empiète seulement si A commence AVANT le bord droit+écart de B (sinon écart déjà respecté).
        if (a.x < rightEdge) minX = Math.max(minX, rightEdge)
      }
      if (minX > a.x + 0.5) {
        a.x = minX // les modules suivants voient la nouvelle position
        moves.push({ id: a.m.id, x: minX, y: a.y })
      }
    }
    for (const mv of moves) store.moveNode(mv.id, { x: mv.x, y: mv.y }, 'reflow-modules')
  }

  function featureData(
    node: FeatureNode,
    handles: FeatureHandle[],
    clamps: FeatureClamps,
  ): FeatureNodeData {
    const mod = node.parentId ? store.nodeById(node.parentId) : null
    const p = node.attrs.perimeter
    return {
      node,
      lot: store.lotOf(node.id),
      lotColor: lotColor(store.lotOf(node.id)),
      moduleName: mod && isModule(mod) ? mod.attrs.name : null,
      perimeterLabel: p ? (PERIMETER_LABELS[p] ?? null) : null,
      incomplete: !store.completenessOf(node.id).complete,
      orphan: store.realizersOfFeature(node.id).length === 0,
      handles,
      clamps,
    }
  }

  function moduleFlowNode(node: ModuleNode, layout: FuncLayout): Node {
    const size = layout.moduleSize.get(node.id) ?? {
      w: MODULE_WIDTH,
      h: moduleHeight(featureCountOf(node.id)),
    }
    return {
      id: node.id,
      type: NODE_TYPE.module,
      position: { x: node.position.x, y: node.position.y },
      data: moduleData(node),
      // Sous les liens (zIndex 1) et les cartes (zIndex 2) : les tracés passent DERRIÈRE les cartes
      // mais au-dessus du fond du module (visibles dans les écarts, cachés derrière les cartes).
      zIndex: 0,
      style: { width: `${size.w}px`, height: `${size.h}px` },
    }
  }

  function featureFlowNode(node: FeatureNode, handles: FeatureHandle[], layout: FuncLayout): Node {
    const parent = node.parentId ? store.nodeById(node.parentId) : null
    const inModule = parent != null && isModule(parent)
    const r = layout.rect.get(node.id)
    const clamps = layout.clamps.get(node.id) ?? estimateFeature(node).clamps
    const h = r?.h ?? FEATURE_HEIGHT
    // Position : relative au CONTENU du module (inset + en-tête), ou monde si racine. Déplaçable
    // partout (on peut glisser vers un autre module ou dehors → détachement, géré au drop).
    const pos = inModule
      ? { x: MODULE_PAD_X + Math.max(0, node.position.x), y: MODULE_CONTENT_TOP + Math.max(0, node.position.y) }
      : { x: node.position.x, y: node.position.y }
    // Hauteur AUTO (minHeight = plancher estimé) TOUJOURS : la carte épouse son contenu réel (Vue Flow
    // re-mesure via ResizeObserver) → contenu complet, jamais de clip, ni en aperçu ni en édition.
    const style = { width: `${FEATURE_WIDTH}px`, minHeight: `${h}px` }
    const base: Node = {
      id: node.id,
      type: NODE_TYPE.feature,
      data: featureData(node, handles, clamps),
      style,
      zIndex: 2, // au-dessus des tracés → les liens passent derrière la carte
      draggable: true,
      position: pos,
    }
    if (inModule && node.parentId) base.parentNode = node.parentId
    return base
  }


  /**
   * Ports (handles) d'une arête « dépend de » selon la géométrie : on sort/entre par le côté le plus
   * direct (axe dominant). Deux fonctionnalités l'une SOUS l'autre → bas→haut (tracé court vertical),
   * côte à côte → droite→gauche. Évite les serpentins des ports fixes gauche/droite.
   */
  const HANDLE_MARGIN = 10
  const HANDLE_MIN_SP = 12

  /** Répartit des positions idéales (triées) sans chevauchement, dans [min,max], proches des idéaux. */
  function spreadOffsets(ideals: number[], min: number, max: number, sp: number): number[] {
    const out: number[] = []
    let prev = min - sp
    for (const v of ideals) {
      const o = Math.max(v, prev + sp)
      out.push(o)
      prev = o
    }
    const last = out[out.length - 1]
    if (last !== undefined && last > max) {
      const over = last - max
      let p = min - sp
      for (let i = 0; i < out.length; i++) {
        out[i] = Math.max((out[i] as number) - over, p + sp)
        p = out[i] as number
      }
    }
    return out
  }

  /**
   * Ports « dépend de » : un lien = un port DISTINCT, et le port se place FACE au nœud connecté
   * (offset = coordonnée du centre de l'autre carte, projetée sur le côté), puis résolution de
   * collisions → tracés droits, pas de serpentin. Ports occupés figés (non interactifs) ; un port
   * `free` par côté (interactif) permet d'ajouter un lien. En mode portail, les liens inter-modules
   * sont des pastilles (sans port de ligne).
   */
  function computeFuncHandles(layout: FuncLayout): {
    handlesByFeature: Map<string, FeatureHandle[]>
    edgeHandles: Map<string, { sourceHandle: string; targetHandle: string }>
  } {
    const portalMode = ui.funcEdgeMode === 'portal'
    interface Rec {
      edgeId: string
      role: 'source' | 'target'
      ideal: number
    }
    const bySide = new Map<string, Rec[]>()
    const put = (fid: string, side: CardSide, rec: Rec): void => {
      const k = `${fid}|${side}`
      const a = bySide.get(k)
      if (a) a.push(rec)
      else bySide.set(k, [rec])
    }
    const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi)
    /**
     * Offsets ALIGNÉS des deux ports d'un lien pour un tracé DROIT : on prend une coordonnée commune
     * dans le recouvrement des deux cartes sur l'axe perpendiculaire (X pour un lien vertical, Y pour
     * horizontal). Les deux ports tombent au même X (ou Y) → segment orthogonal = ligne droite. Si
     * les cartes ne se recouvrent pas sur cet axe, on retombe au milieu des centres (léger coude).
     */
    const straightOffsets = (
      sSide: CardSide,
      sr: Rect,
      tr: Rect,
    ): { sIdeal: number; tIdeal: number } => {
      if (sSide === 'bottom' || sSide === 'top') {
        const lo = Math.max(sr.x, tr.x)
        const hi = Math.min(sr.x + sr.w, tr.x + tr.w)
        const cx = lo <= hi ? (lo + hi) / 2 : (sr.x + sr.w / 2 + (tr.x + tr.w / 2)) / 2
        return {
          sIdeal: clamp(cx - sr.x, HANDLE_MARGIN, sr.w - HANDLE_MARGIN),
          tIdeal: clamp(cx - tr.x, HANDLE_MARGIN, tr.w - HANDLE_MARGIN),
        }
      }
      const lo = Math.max(sr.y, tr.y)
      const hi = Math.min(sr.y + sr.h, tr.y + tr.h)
      const cy = lo <= hi ? (lo + hi) / 2 : (sr.y + sr.h / 2 + (tr.y + tr.h / 2)) / 2
      return {
        sIdeal: clamp(cy - sr.y, HANDLE_MARGIN, sr.h - HANDLE_MARGIN),
        tIdeal: clamp(cy - tr.y, HANDLE_MARGIN, tr.h - HANDLE_MARGIN),
      }
    }
    const isVert = (side: CardSide): boolean => side === 'top' || side === 'bottom'
    /** Offset d'un port face au centre de l'autre carte (pour les coudes en L, côtés mixtes). */
    const facingOffset = (side: CardSide, rect: Rect, other: Position): number =>
      isVert(side)
        ? clamp(other.x - rect.x, HANDLE_MARGIN, rect.w - HANDLE_MARGIN)
        : clamp(other.y - rect.y, HANDLE_MARGIN, rect.h - HANDLE_MARGIN)
    for (const e of store.edges) {
      if (e.type !== 'dependsOn') continue
      const s = store.nodeById(e.source)
      const t = store.nodeById(e.target)
      if (!s || !t || !isFeature(s) || !isFeature(t)) continue
      if (portalMode && !sameModuleEdge(e)) continue
      const sr = layout.rect.get(e.source)
      const tr = layout.rect.get(e.target)
      if (!sr || !tr) continue
      const { s: sSide, t: tSide } = edgeSides(sr, tr)
      let sIdeal: number
      let tIdeal: number
      if (isVert(sSide) === isVert(tSide)) {
        // Même axe → aligne les deux ports pour un tracé DROIT.
        ;({ sIdeal, tIdeal } = straightOffsets(sSide, sr, tr))
      } else {
        // Côtés MIXTES (coude en L) → chaque port face au centre de l'autre carte.
        const sc = { x: sr.x + sr.w / 2, y: sr.y + sr.h / 2 }
        const tc = { x: tr.x + tr.w / 2, y: tr.y + tr.h / 2 }
        sIdeal = facingOffset(sSide, sr, tc)
        tIdeal = facingOffset(tSide, tr, sc)
      }
      put(e.source, sSide, { edgeId: e.id, role: 'source', ideal: sIdeal })
      put(e.target, tSide, { edgeId: e.id, role: 'target', ideal: tIdeal })
    }
    const handlesByFeature = new Map<string, FeatureHandle[]>()
    const edgeHandles = new Map<string, { sourceHandle: string; targetHandle: string }>()
    const ensure = (fid: string): FeatureHandle[] => {
      let a = handlesByFeature.get(fid)
      if (!a) {
        a = []
        handlesByFeature.set(fid, a)
      }
      return a
    }
    const sideLen = (fid: string, side: CardSide): number => {
      const r = layout.rect.get(fid)
      const w = r?.w ?? FEATURE_WIDTH
      const h = r?.h ?? FEATURE_HEIGHT
      return side === 'left' || side === 'right' ? h : w
    }
    for (const [k, list] of bySide) {
      const sep = k.indexOf('|')
      const fid = k.slice(0, sep)
      const side = k.slice(sep + 1) as CardSide
      const len = sideLen(fid, side)
      list.sort((a, b) => a.ideal - b.ideal)
      const offs = spreadOffsets(
        list.map((r) => r.ideal),
        HANDLE_MARGIN,
        len - HANDLE_MARGIN,
        HANDLE_MIN_SP,
      )
      const arr = ensure(fid)
      list.forEach((rec, i) => {
        const id = `${rec.role[0]}-${side}-${i}`
        // Port occupé : visible (montre où un lien s'attache, face à sa cible) ET connectable → on
        // peut démarrer un NOUVEAU lien en l'attrapant (les arêtes sont non-réattachables, cf. edge
        // updatable:false, donc pas de « reconnexion » accidentelle du lien existant).
        arr.push({ id, type: rec.role, side, offset: offs[i] as number, free: false, connectable: true })
        const eh = edgeHandles.get(rec.edgeId) ?? { sourceHandle: '', targetHandle: '' }
        if (rec.role === 'source') eh.sourceHandle = id
        else eh.targetHandle = id
        edgeHandles.set(rec.edgeId, eh)
      })
      // Port LIBRE au CENTRE du côté (prévisible) : cible dessous, source dessus (drag démarre bien).
      const freeOff = len / 2
      arr.push({ id: `t-${side}-free`, type: 'target', side, offset: freeOff, free: true, connectable: true })
      arr.push({ id: `s-${side}-free`, type: 'source', side, offset: freeOff, free: true, connectable: true })
    }
    // Ports libres sur les 4 côtés de CHAQUE fonctionnalité (démarrer / recevoir un nouveau lien).
    const SIDES: CardSide[] = ['top', 'right', 'bottom', 'left']
    for (const f of store.features) {
      const arr = ensure(f.id)
      for (const side of SIDES) {
        if (arr.some((h) => h.side === side && h.free)) continue
        const center = sideLen(f.id, side) / 2
        arr.push({ id: `t-${side}-free`, type: 'target', side, offset: center, free: true, connectable: true })
        arr.push({ id: `s-${side}-free`, type: 'source', side, offset: center, free: true, connectable: true })
      }
    }
    return { handlesByFeature, edgeHandles }
  }

  /** Deux fonctionnalités du MÊME module (lien intra-module → toujours au premier plan). */
  function sameModuleEdge(e: FlooowEdge): boolean {
    const s = store.nodeById(e.source)
    const t = store.nodeById(e.target)
    return (
      s != null &&
      t != null &&
      isFeature(s) &&
      isFeature(t) &&
      s.parentId != null &&
      s.parentId === t.parentId
    )
  }

  /**
   * Côtés d'un lien entre DEUX cartes, d'après leurs rects : si elles ne se recouvrent pas
   * verticalement (l'une nettement au-dessus/dessous de l'autre) → bas↔haut (l'offset du port se
   * décale ensuite horizontalement vers l'autre carte, cf. idealOffset) ; sinon (côte à côte,
   * recouvrement vertical) → droite↔gauche. Évite qu'un lien « B sous A » parte sur le côté.
   */
  function edgeSides(sr: Rect, tr: Rect): { s: CardSide; t: CardSide } {
    const hOverlap = Math.min(sr.x + sr.w, tr.x + tr.w) - Math.max(sr.x, tr.x)
    const vOverlap = Math.min(sr.y + sr.h, tr.y + tr.h) - Math.max(sr.y, tr.y)
    const below = tr.y + tr.h / 2 >= sr.y + sr.h / 2
    const right = tr.x + tr.w / 2 >= sr.x + sr.w / 2
    // Empilées (recouvrement en X, pas en Y) → bas↔haut (ligne verticale droite possible).
    if (hOverlap > 8 && vOverlap <= 8) {
      return below ? { s: 'bottom', t: 'top' } : { s: 'top', t: 'bottom' }
    }
    // Côte à côte (recouvrement en Y, pas en X) → droite↔gauche (ligne horizontale droite possible).
    if (vOverlap > 8 && hOverlap <= 8) {
      return right ? { s: 'right', t: 'left' } : { s: 'left', t: 'right' }
    }
    // DIAGONALE (aucun recouvrement) → coude en L : la source sort par le côté HORIZONTAL vers la
    // cible, la cible entre par le côté VERTICAL vers la source (chemin le plus court, pas de vague).
    if (hOverlap <= 8 && vOverlap <= 8) {
      return { s: right ? 'right' : 'left', t: below ? 'top' : 'bottom' }
    }
    // Cartes qui se recouvrent sur les deux axes (proches/imbriquées) → axe du plus grand recouvrement.
    if (hOverlap >= vOverlap) {
      return below ? { s: 'bottom', t: 'top' } : { s: 'top', t: 'bottom' }
    }
    return right ? { s: 'right', t: 'left' } : { s: 'left', t: 'right' }
  }

  /** Rect absolu (monde) d'une carte fonctionnalité, depuis le layout (hauteurs variables). */
  function featureRectAbs(id: string, layout: FuncLayout): Rect | null {
    return layout.rect.get(id) ?? null
  }

  /** Libellé compact d'une extrémité de portail : le code (ex. « CAT-02 »), sinon le nom. */
  function funcPortalLabel(id: string): string {
    const n = store.nodeById(id)
    if (n && isFeature(n)) return n.attrs.code || n.attrs.name || id
    return id
  }

  // Géométrie des pastilles portail (fonctionnel) : PETITES et discrètes, juste à côté de la carte.
  const FPILL_W = 56
  const FPILL_H = 15
  const FPILL_GAP = 5
  const FPILL_STEP_V = 18
  const FPILL_STEP_H = 64

  /**
   * Pastilles « portail » des liens INTER-modules en mode portail : deux pastilles par lien (une à
   * chaque extrémité), posées juste à côté de la fonctionnalité, sur le côté visant l'autre bout.
   * Empilées par (fonctionnalité, côté) pour ne pas se chevaucher. Clic → focus l'autre extrémité.
   */
  function funcPortalNodes(layout: FuncLayout): Node[] {
    if (ui.canvasLayer !== 'functional' || ui.funcEdgeMode !== 'portal') return []
    interface Pastille {
      id: string
      edgeId: string
      end: 'source' | 'target'
      other: string
      label: string
    }
    const groups = new Map<string, Pastille[]>()
    const add = (key: string, item: Pastille): void => {
      const arr = groups.get(key)
      if (arr) arr.push(item)
      else groups.set(key, [item])
    }
    for (const e of store.edges) {
      if (e.type !== 'dependsOn' || sameModuleEdge(e)) continue
      const sr = featureRectAbs(e.source, layout)
      const tr = featureRectAbs(e.target, layout)
      if (!sr || !tr) continue
      // n'afficher un portail que si les deux bouts sont bien dans la couche fonctionnelle
      const sn = store.nodeById(e.source)
      const tn = store.nodeById(e.target)
      if (!sn || !tn || layerOf(sn) !== 'functional' || layerOf(tn) !== 'functional') continue
      const { s: sSide, t: tSide } = edgeSides(sr, tr)
      add(`${e.source}|${sSide}`, {
        id: `${PORTAL_SRC_PREFIX}${e.id}`,
        edgeId: e.id,
        end: 'source',
        other: e.target,
        label: `→ ${funcPortalLabel(e.target)}`,
      })
      add(`${e.target}|${tSide}`, {
        id: `${PORTAL_TGT_PREFIX}${e.id}`,
        edgeId: e.id,
        end: 'target',
        other: e.source,
        label: `← ${funcPortalLabel(e.source)}`,
      })
    }
    const out: Node[] = []
    for (const [key, arr] of groups) {
      const sep = key.lastIndexOf('|')
      const rect = featureRectAbs(key.slice(0, sep), layout)
      const side = key.slice(sep + 1) as CardSide
      if (!rect) continue
      arr.sort((a, b) => (a.id < b.id ? -1 : 1))
      arr.forEach((p, k) => {
        let x = rect.x
        let y = rect.y
        let align: 'left' | 'right' = 'left'
        if (side === 'right') {
          x = rect.x + rect.w + FPILL_GAP
          y = rect.y + k * FPILL_STEP_V
        } else if (side === 'left') {
          x = rect.x - FPILL_GAP - FPILL_W
          y = rect.y + k * FPILL_STEP_V
          align = 'right'
        } else if (side === 'bottom') {
          y = rect.y + rect.h + FPILL_GAP
          x = rect.x + k * FPILL_STEP_H
        } else {
          y = rect.y - FPILL_GAP - FPILL_H
          x = rect.x + k * FPILL_STEP_H
        }
        out.push({
          id: p.id,
          type: NODE_TYPE.portal,
          position: { x, y },
          zIndex: EDGE_Z + 1,
          draggable: false,
          selectable: false,
          deletable: false,
          style: { width: `${FPILL_W}px` },
          data: {
            edgeId: p.edgeId,
            end: p.end,
            align,
            label: p.label,
            other: p.other,
            compact: true,
          } satisfies PortalNodeData,
        })
      })
    }
    return out
  }

  // ── Auto-layout des notes (auto-empilement aligné — décision Hugo) ─────────
  // Les notes se rangent, ALIGNÉES et sans chevauchement, sur un CÔTÉ de leur page (gauche/droite/
  // haut/bas). Le côté est déduit de la position vers laquelle on a glissé la note (drag = choisir
  // le côté) ; l'ordre le long du côté suit aussi la position glissée. Les positions sont ensuite
  // calculées (snap aligné) — d'où un connecteur droit si la note est dans l'axe, en angle sinon.
  const SIDE_GAP = 36 // distance X page → élément, IDENTIQUE pour les notes ET les portails
  const NOTE_NAV_MARGIN = 40 // marge VERTICALE (Y) entre les éléments de NAVIGATION (portails ET
  // tracés de nav) et les notes — appliquée uniformément à tout élément de navigation
  const NOTE_W = 190 // largeur FIXE des notes (alignement déterministe des bords, côté gauche)
  const NOTE_H = 56
  const NOTE_SP_V = 66
  const NOTE_SP_H = 186
  const GROUP_GAP = 34 // espace Y SUPPLÉMENTAIRE entre notes de composants DIFFÉRENTS (les distinguer)
  const CLUSTER_GAP = 100 // au-delà de cet écart de position, 2 notes de PAGE forment 2 groupes distincts
  type NoteSide = 'left' | 'right' | 'top' | 'bottom'

  function computeNoteLayout(
    portalBands: Map<string, Band[]>,
    dragOverride?: Map<string, Position>,
  ): Map<string, Position> {
    const layout = new Map<string, Position>()
    // Une COLONNE par (page, côté), faite de GROUPES empilés et espacés de GROUP_GAP (composants
    // différents mieux distingués), contournant les bandes obstacles (portails + nav) :
    //   - note de COMPOSANT : groupée avec ses sœurs (même bloc), le groupe est centré sur le bloc
    //     (`groupIdeal` = centre du bloc) ; `along` (position glissée) ordonne les sœurs entre elles.
    //   - note de PAGE : son PROPRE groupe (singleton), ancré à SA position (`groupIdeal` = sa place)
    //     → librement positionnable dans l'espace vide, sans se coller au centre ni s'insérer dans un
    //     composant. Notes et portails partagent la MÊME distance X (SIDE_GAP).
    const groups = new Map<
      string,
      { id: string; groupKey: string; groupIdeal: number; along: number; isPageNote: boolean }[]
    >()
    for (const note of store.notes) {
      const target = store.nodeById(note.attachedTo)
      if (!target || !isFrame(target)) continue
      const page = isPage(target)
        ? target
        : target.parentId
          ? store.nodeById(target.parentId)
          : null
      if (!page || !isPage(page)) continue
      const pr = pageRect(page)
      const tr = frameRect(target)
      if (!tr) continue
      // Position glissée (live) prioritaire pendant un drag → preview du reflow ; sinon position store.
      const np = dragOverride?.get(note.id) ?? note.position
      // Côté = le bord de la PAGE dont la note est la plus À L'EXTÉRIEUR (les notes vivent hors page).
      const cand: [NoteSide, number][] = [
        ['right', np.x - (pr.x + pr.w)],
        ['left', pr.x - np.x],
        ['bottom', np.y - (pr.y + pr.h)],
        ['top', pr.y - np.y],
      ]
      const side = cand.reduce((a, b) => (b[1] > a[1] ? b : a))[0]
      const horiz = side === 'right' || side === 'left'
      const isPageNote = isPage(target)
      // Composant → ancré au centre de la cible (lui fait face), groupé. Page → ancré à sa propre
      // position (centre de la note), groupe singleton (librement plaçable dans l'espace vide).
      const targetCenter = horiz ? tr.y + tr.h / 2 : tr.x + tr.w / 2
      const selfCenter = horiz ? np.y + NOTE_H / 2 : np.x + NOTE_W / 2
      const along = horiz ? np.y : np.x
      const key = `${page.id}|${side}`
      const arr = groups.get(key) ?? []
      arr.push({
        id: note.id,
        groupKey: isPageNote ? note.id : note.attachedTo,
        groupIdeal: isPageNote ? selfCenter : targetCenter,
        along,
        isPageNote,
      })
      groups.set(key, arr)
    }
    // Construit les groupes empilables :
    //   - COMPOSANT : toutes les notes d'un même bloc → un groupe (ancré au centre du bloc).
    //   - PAGE : notes regroupées par PROXIMITÉ de position (`along`) → notes proches = un groupe ;
    //     une note glissée à l'écart (> CLUSTER_GAP) forme un nouveau groupe à cet endroit.
    // Membres ordonnés par position glissée (réordonnancement manuel), groupes ordonnés par ancrage.
    type Item = { id: string; groupKey: string; groupIdeal: number; along: number; isPageNote: boolean }
    function buildRuns(arr: Item[]): { ideal: number; items: Item[] }[] {
      const byBlock = new Map<string, Item[]>()
      const pageItems: Item[] = []
      for (const it of arr) {
        if (it.isPageNote) pageItems.push(it)
        else {
          const g = byBlock.get(it.groupKey) ?? []
          g.push(it)
          byBlock.set(it.groupKey, g)
        }
      }
      const runs: { ideal: number; items: Item[] }[] = []
      for (const items of byBlock.values()) {
        items.sort((a, b) => a.along - b.along || (a.id < b.id ? -1 : 1))
        runs.push({ ideal: items[0]?.groupIdeal ?? 0, items })
      }
      // Notes de page : clusterisées par proximité le long de l'axe.
      pageItems.sort((a, b) => a.along - b.along || (a.id < b.id ? -1 : 1))
      let cluster: Item[] = []
      const flush = (): void => {
        if (!cluster.length) return
        const ideal = cluster.reduce((s, c) => s + c.groupIdeal, 0) / cluster.length
        runs.push({ ideal, items: cluster })
        cluster = []
      }
      for (const it of pageItems) {
        const prev = cluster[cluster.length - 1]
        if (prev && it.along - prev.along > CLUSTER_GAP) flush()
        cluster.push(it)
      }
      flush()
      runs.sort((a, b) => a.ideal - b.ideal || ((a.items[0]?.id ?? '') < (b.items[0]?.id ?? '') ? -1 : 1))
      return runs
    }

    for (const [key, arr] of groups) {
      const sep = key.lastIndexOf('|')
      const page = store.nodeById(key.slice(0, sep))
      const side = key.slice(sep + 1) as NoteSide
      if (!page || !isPage(page)) continue
      const pr = pageRect(page)
      const runs = buildRuns(arr)
      let cursor = -Infinity
      if (side === 'right' || side === 'left') {
        const x = side === 'right' ? pr.x + pr.w + SIDE_GAP : pr.x - SIDE_GAP - NOTE_W
        // Obstacles Y à contourner (même colonne X), avec la MÊME marge note↔navigation partout :
        // bandes des portails + bande du tracé de navigation.
        const bands = (portalBands.get(key) ?? []).map((b) => ({
          top: b.top - NOTE_NAV_MARGIN,
          bot: b.bot + NOTE_NAV_MARGIN,
        }))
        const hasNavLine = store.edges.some(
          (e) =>
            (e.attrs.render ?? 'line') === 'line' &&
            (side === 'right' ? e.source === page.id : e.target === page.id),
        )
        // Le tracé de navigation est EN HAUT (NAV_ANCHOR_Y) → les notes commencent en dessous.
        if (hasNavLine) {
          bands.push({ top: pr.y, bot: pr.y + NAV_ANCHOR_Y + NOTE_NAV_MARGIN })
        }
        // Chaque groupe RIGIDE, centré sur son ancrage, poussé sous un obstacle qu'il croise ;
        // groupes espacés de GROUP_GAP.
        for (const run of runs) {
          const n = run.items.length
          const groupH = (n - 1) * NOTE_SP_V + NOTE_H
          let top = Math.max(run.ideal - groupH / 2, cursor)
          for (;;) {
            const hit = bands.find((b) => top < b.bot && top + groupH > b.top)
            if (!hit) break
            top = hit.bot
          }
          run.items.forEach((it, k) => layout.set(it.id, { x, y: top + k * NOTE_SP_V }))
          cursor = top + groupH + GROUP_GAP
        }
      } else {
        const y = side === 'bottom' ? pr.y + pr.h + SIDE_GAP : pr.y - SIDE_GAP - NOTE_H
        for (const run of runs) {
          const n = run.items.length
          const groupW = (n - 1) * NOTE_SP_H + NOTE_W
          const left = Math.max(run.ideal - groupW / 2, cursor)
          run.items.forEach((it, k) => layout.set(it.id, { x: left + k * NOTE_SP_H, y }))
          cursor = left + groupW + GROUP_GAP
        }
      }
    }
    return layout
  }

  // ── Auto-layout des portails (empilés VERS LE HAUT, alignés X avec les notes) ─
  // Le tie du portail part du COIN du bord haut de la page (droite pour source, gauche pour cible),
  // monte, puis part sur le côté rejoindre la pastille — alignée en X avec les NOTES (SIDE_GAP), et
  // posée AU-DESSUS de la page. Les portails suivants s'empilent VERS LE HAUT.
  const PORTAL_W = 150
  const PORTAL_H = 24
  /** Écart vertical entre le bord haut de la page et la 1re pastille portail. */
  const PORTAL_TOP_GAP = 14
  /** Écart vertical entre deux portails empilés (calé sur l'inter-note d'un groupe : NOTE_SP_V - NOTE_H). */
  const PORTAL_SP = NOTE_SP_V - NOTE_H
  interface Band {
    top: number
    bot: number
  }
  /** Positions des pastilles ; `bands` reste vide (portails au-dessus de la page, hors colonne notes). */
  function computePortalLayout(): { layout: Map<string, Position>; bands: Map<string, Band[]> } {
    const layout = new Map<string, Position>()
    const bands = new Map<string, Band[]>()
    const groups = new Map<string, { id: string; ideal: number }[]>()
    for (const e of store.edges) {
      if ((e.attrs.render ?? 'line') !== 'portal') continue
      for (const [prefix, endId, side] of [
        [PORTAL_SRC_PREFIX, e.source, 'right'],
        [PORTAL_TGT_PREFIX, e.target, 'left'],
      ] as const) {
        const node = store.nodeById(endId)
        if (!node || !isFrame(node)) continue
        const page = isPage(node) ? node : node.parentId ? store.nodeById(node.parentId) : null
        if (!page || !isPage(page)) continue
        const tr = frameRect(node)
        if (!tr) continue
        const key = `${page.id}|${side}`
        const arr = groups.get(key) ?? []
        arr.push({ id: `${prefix}${e.id}`, ideal: tr.y + tr.h / 2 })
        groups.set(key, arr)
      }
    }
    for (const [key, arr] of groups) {
      const sep = key.lastIndexOf('|')
      const page = store.nodeById(key.slice(0, sep))
      const side = key.slice(sep + 1)
      if (!page || !isPage(page)) continue
      const pr = pageRect(page)
      arr.sort((a, b) => a.ideal - b.ideal || (a.id < b.id ? -1 : 1))
      // Aligné en X avec les notes (côté g/d), au-dessus de la page, empilé VERS LE HAUT.
      const x = side === 'right' ? pr.x + pr.w + SIDE_GAP : pr.x - SIDE_GAP - PORTAL_W
      let y = pr.y - PORTAL_H - PORTAL_TOP_GAP
      for (const { id } of arr) {
        layout.set(id, { x, y })
        y -= PORTAL_H + PORTAL_SP
      }
      bands.set(key, [])
    }
    return { layout, bands }
  }

  // ── Mapping FlooowNode → Node Vue Flow ─────────────────────────────────────
  function toFlowNode(node: FlooowNode, noteLayout: Map<string, Position>): Node {
    if (isPage(node)) {
      return {
        id: node.id,
        type: NODE_TYPE.page,
        position: { x: node.position.x, y: node.position.y },
        data: pageData(node),
        style: {
          width: `${PAGE_WIDTH}px`,
          height: `${pageHeight(blockCountOf(node.id))}px`,
        },
      }
    }
    if (isBlock(node)) {
      const base: Node = {
        id: node.id,
        type: NODE_TYPE.block,
        // Position relative à la page : x fixe (inset), y empilé sous l'en-tête.
        position: { x: PAGE_PAD_X, y: CONTENT_TOP + node.position.y },
        data: blockData(node),
        style: { width: `${BLOCK_WIDTH}px` },
      }
      if (node.parentId) base.parentNode = node.parentId
      // Pas d'extent verrouillé : un bloc peut être glissé vers une autre page (reparent au drop).
      return base
    }
    // Note : position auto-calculée (empilement aligné sur un côté). Reste DÉPLAÇABLE : glisser la
    // note vers un côté choisit ce côté (au drop), puis le layout la ré-aligne (voir onNodeDragStop).
    const pos = noteLayout.get(node.id) ?? { x: node.position.x, y: node.position.y }
    return {
      id: node.id,
      type: NODE_TYPE.note,
      position: { ...pos },
      // Largeur FIXE (= NOTE_W du layout) → l'alignement du bord droit (côté gauche) est exact.
      style: { width: `${NOTE_W}px` },
      data: noteData(node as NoteNode),
    }
  }

  /** Profondeur d'arbre : les pages (0) avant leurs blocs (1) — exigence Vue Flow parent-avant-enfant. */
  function depthOf(node: FlooowNode): number {
    return isBlock(node) && node.parentId ? 1 : 0
  }

  /** Deux nœuds synthétiques pour une arête `render:'portal'` (extrémités), auto-positionnés. */
  function portalNodesOf(e: FlooowEdge, portalLayout: Map<string, Position>): Node[] {
    const srcId = `${PORTAL_SRC_PREFIX}${e.id}`
    const tgtId = `${PORTAL_TGT_PREFIX}${e.id}`
    const srcPos = portalLayout.get(srcId)
    const tgtPos = portalLayout.get(tgtId)
    if (!srcPos || !tgtPos) return []
    return [
      {
        id: srcId,
        type: NODE_TYPE.portal,
        position: { ...srcPos },
        zIndex: EDGE_Z + 1,
        draggable: false,
        selectable: false,
        deletable: false,
        // Largeur FIXE (= PORTAL_W) + pastille ancrée à GAUCHE (côté droit de la page).
        style: { width: `${PORTAL_W}px` },
        data: {
          edgeId: e.id,
          end: 'source',
          align: 'left',
          label: `→ ${nodeLabel(e.target)}`,
          other: e.target,
        } satisfies PortalNodeData,
      },
      {
        id: tgtId,
        type: NODE_TYPE.portal,
        position: { ...tgtPos },
        zIndex: EDGE_Z + 1,
        draggable: false,
        selectable: false,
        deletable: false,
        // Largeur FIXE + pastille ancrée à DROITE (côté gauche de la page → bord droit aligné).
        style: { width: `${PORTAL_W}px` },
        data: {
          edgeId: e.id,
          end: 'target',
          align: 'right',
          label: `← ${nodeLabel(e.source)}`,
          other: e.source,
        } satisfies PortalNodeData,
      },
    ]
  }

  function toFlowNodes(): Node[] {
    // Couche fonctionnelle : modules + fonctionnalités uniquement (autre couche masquée, §15).
    if (ui.canvasLayer === 'functional') {
      const layout = functionalLayout()
      const { handlesByFeature } = computeFuncHandles(layout)
      return [
        ...store.modules.map((m) => moduleFlowNode(m, layout)),
        ...store.features.map((f) => featureFlowNode(f, handlesByFeature.get(f.id) ?? [], layout)),
        ...funcPortalNodes(layout),
      ]
    }
    // Couche structurelle : pages/blocs/notes (comportement historique), fonctionnels exclus.
    const { layout: portalLayout, bands } = computePortalLayout()
    const noteLayout = computeNoteLayout(bands)
    const out = [...store.nodes.values()]
      .filter((n) => layerOf(n) === 'structural')
      .sort((a, b) => depthOf(a) - depthOf(b))
      .map((n) => toFlowNode(n, noteLayout))
    for (const e of store.edges) {
      if ((e.attrs.render ?? 'line') === 'portal') out.push(...portalNodesOf(e, portalLayout))
    }
    return out
  }

  function toFlowEdges(): Edge[] {
    const out: Edge[] = []
    // Ports distribués (un lien = un port) pour la couche fonctionnelle, calculés une seule fois.
    const funcEdgeHandles =
      ui.canvasLayer === 'functional' ? computeFuncHandles(functionalLayout()).edgeHandles : null
    // Flèche compacte pour les liens « dépend de » (sinon trop grosse dans l'écart vertical).
    const FUNC_ARROW = { type: MarkerType.ArrowClosed, width: 12, height: 12, color: '#94a3b8' }
    // Arêtes manuelles. Une arête ne s'affiche que si ses DEUX extrémités sont dans la couche
    // active (§15) : « réalisé par » (fonctionnel → structurel) reste donc masqué dans les deux
    // modes purs (il se consultera dans la future vue « couverture »).
    for (const e of store.edges) {
      const es = store.nodeById(e.source)
      const et = store.nodeById(e.target)
      if (!es || !et || layerOf(es) !== ui.canvasLayer || layerOf(et) !== ui.canvasLayer) continue
      const render = e.attrs.render ?? 'line'
      if (render === 'portal') {
        // Portail : PAS de longue arête typée. Deux courts connecteurs pastille → élément, rendus
        // comme un tracé de NAVIGATION (gris SOLIDE), non interactifs.
        for (const [prefix, endId] of [
          [PORTAL_SRC_PREFIX, e.source],
          [PORTAL_TGT_PREFIX, e.target],
        ] as const) {
          if (!store.nodeById(endId)) continue
          out.push({
            id: `tie-${prefix}${e.id}`,
            source: `${prefix}${e.id}`,
            target: endId,
            type: EDGE_TYPE.portalTie,
            zIndex: EDGE_Z,
            // Portail = navigation → gris solide. `corner` = coin du bord haut d'où part le tie
            // (source à droite, cible à gauche), qui monte puis rejoint la pastille.
            data: {
              color: NAV_COLOR,
              solid: true,
              corner: prefix === PORTAL_SRC_PREFIX ? 'right' : 'left',
            },
            selectable: false,
            focusable: false,
            deletable: false,
            updatable: false,
          })
        }
        continue
      }
      // Flèche : seulement en rendu ligne (le portail ne trace rien).
      const arrow = e.type === 'navigatesTo'
      const edge: Edge = {
        id: e.id,
        source: e.source,
        target: e.target,
        type: EDGE_TYPE.typed,
        // Élévation au-dessus des nœuds : sinon un lien touchant un bloc (contenu dans une page
        // au fond opaque) voit ses extrémités masquées par la page. Cf. EDGE_Z.
        zIndex: EDGE_Z,
        // Offset réduit (coude au ras du port) pour LES DEUX couches → tracés courts, pas de S entre
        // éléments proches (parité Arborescence ↔ Fonctionnalités).
        data: { edgeType: e.type, offset: 2 } satisfies TypedEdgeData,
      }
      if (arrow) edge.markerEnd = MarkerType.ArrowClosed
      // Couche fonctionnelle : ports choisis par géométrie (pas de serpentin), flèche de sens.
      //  - lien INTRA-module → toujours au premier plan (visible dans la colonne du module) ;
      //  - lien INTER-module (les longs) → bascule : `portal` (pastilles, tracé retiré ici) ou
      //    `background` (ligne derrière les cartes, visible seulement dans les gouttières).
      if (ui.canvasLayer === 'functional') {
        const cross = !sameModuleEdge(e)
        if (cross && ui.funcEdgeMode === 'portal') continue // rendu en pastilles (funcPortalNodes)
        const h = funcEdgeHandles?.get(e.id)
        if (h) {
          edge.sourceHandle = h.sourceHandle
          edge.targetHandle = h.targetHandle
        }
        edge.markerEnd = FUNC_ARROW
        // Non réattachable : attraper un port occupé démarre un NOUVEAU lien, ne déplace pas celui-ci.
        edge.updatable = false
        // Toujours DERRIÈRE les cartes (zIndex 1 < cartes 2) et au-dessus du fond du module (0) :
        // visibles dans les écarts entre cartes, cachés là où ils croiseraient une carte.
        edge.zIndex = 1
      }
      out.push(edge)
    }
    // Connecteurs de proximité note → attachedTo : couche structurelle uniquement (les notes et
    // leurs cibles sont masquées en mode fonctionnel).
    if (ui.canvasLayer !== 'structural') return out
    // Couleur = couleur de la note. Rang parmi les sœurs de même cible (trié par id = ordre vertical
    // du layout) → répartit les points sur le bord de la cible dans l'ordre des notes.
    const notesByTarget = new Map<string, { id: string; y: number; x: number }[]>()
    for (const note of store.notes) {
      const arr = notesByTarget.get(note.attachedTo) ?? []
      arr.push({ id: note.id, y: note.position.y, x: note.position.x })
      notesByTarget.set(note.attachedTo, arr)
    }
    // Même ordre que le layout (position glissée) → le rang du point suit l'ordre des notes.
    for (const arr of notesByTarget.values())
      arr.sort((a, b) => a.y - b.y || a.x - b.x || (a.id < b.id ? -1 : 1))
    for (const note of store.notes) {
      if (!store.nodeById(note.attachedTo)) continue
      const sibs = (notesByTarget.get(note.attachedTo) ?? []).map((s) => s.id)
      out.push({
        id: `attach-${note.id}`,
        source: note.id,
        target: note.attachedTo,
        type: EDGE_TYPE.attach,
        zIndex: EDGE_Z,
        data: { color: NOTE_COLORS[note.kind], rank: sibs.indexOf(note.id), count: sibs.length },
        selectable: false,
        focusable: false,
        deletable: false,
        updatable: false,
      })
    }
    return out
  }

  /** Réconcilie la sélection Vue Flow avec ui.selection sans reconstruire les nœuds. */
  function syncSelection(): void {
    const want = new Set(ui.selectedIds)
    const current: GraphNode[] = vf.getSelectedNodes.value
    const toRemove = current.filter((n) => !want.has(n.id))
    if (toRemove.length) vf.removeSelectedNodes(toRemove)
    const toAdd: GraphNode[] = []
    for (const id of want) {
      if (current.some((n) => n.id === id)) continue
      const gn = vf.findNode(id)
      if (gn) toAdd.push(gn)
    }
    if (toAdd.length) vf.addSelectedNodes(toAdd)
  }

  // ── Poussée du graphe dans Vue Flow (jamais pendant un drag) ────────────────
  function push(): void {
    vf.setNodes(toFlowNodes())
    vf.setEdges(toFlowEdges())
    syncSelection()
    // Les ports des fonctionnalités sont DYNAMIQUES (créés/déplacés à chaque rendu). Une arête peut
    // référencer un port TOUT JUSTE créé que Vue Flow n'a pas encore mesuré → il l'abandonne et
    // l'arête ne s'affiche pas. On re-mesure les ports (updateNodeInternals) APRÈS le rendu DOM, puis
    // on RÉ-APPLIQUE les arêtes pour qu'elles se résolvent sur les ports désormais connus.
    if (ui.canvasLayer === 'functional') {
      void nextTick(() => {
        vf.updateNodeInternals()
        vf.setEdges(toFlowEdges())
      })
    }
  }
  // graphVersion ne bouge qu'à une mutation nommée (donc au drop, jamais pendant le drag).
  watch(() => store.graphVersion, push, { immediate: true })
  // Bascule de couche (§15) : re-mappe le graphe (l'autre couche est masquée). Pas de changement
  // de graphVersion sur un simple changement de vue, d'où ce watch dédié + fitView sur la couche.
  /** Nombre de nœuds visibles dans la couche active (pour décider fitView vs zoom neutre). */
  function activeLayerNodeCount(): number {
    return ui.canvasLayer === 'functional'
      ? store.modules.length + store.features.length
      : store.pages.length
  }
  /**
   * Recadre : si la couche a des nœuds → fitView (zoom plafonné à 1.1) ; si elle est VIDE → zoom
   * neutre (1). fitView sur 0 nœud IGNORE `maxZoom` et zoome au max de l'instance (4×), ce qui
   * rendait ensuite les nœuds créés énormes et faussait tout (drag, connexions, ports).
   */
  function reframe(): void {
    void nextTick(() => {
      if (activeLayerNodeCount() > 0) void vf.fitView({ padding: 0.2, maxZoom: 1.1 })
      else void vf.setViewport({ x: 0, y: 0, zoom: 1 })
    })
  }
  watch(
    () => ui.canvasLayer,
    () => {
      push()
      reframe()
    },
  )
  // Bascule portail / arrière-plan (couche fonctionnelle) : re-mappe (pastilles ↔ lignes) sans
  // changement de graphVersion. Pas de fitView (on ne veut pas recadrer sur un simple changement
  // de rendu des liens).
  watch(() => ui.funcEdgeMode, push)
  // La sélection change la taille de la carte fonctionnelle (éditeur inline) → recalcul du layout,
  // puis réconciliation de la sélection Vue Flow au tick suivant (les nœuds viennent d'être remplacés).
  watch(
    () => ui.selectedIds,
    () => {
      if (ui.canvasLayer === 'functional') push()
      void nextTick(syncSelection)
    },
    { deep: true },
  )

  // Focus (recherche / clic panneau / lien du document Specs) → centre + zoom ajusté + sélectionne.
  // Le nœud peut ne pas être encore monté quand le focus suit une bascule de couche (Specs → canvas) :
  // on réessaie sur quelques frames le temps que la nouvelle couche se rende.
  watch(
    () => ui.focusRequest,
    (req) => {
      if (!req) return
      let tries = 0
      const attempt = (): void => {
        const gn = vf.findNode(req.nodeId)
        if (gn && gn.dimensions.width > 0) {
          // Zoom ajusté : au moins 1×, plafonné à 1.4× pour un cadrage confortable et lisible.
          const target = Math.min(Math.max(vf.viewport.value.zoom, 1), 1.4)
          void vf.setCenter(
            gn.computedPosition.x + gn.dimensions.width / 2,
            gn.computedPosition.y + gn.dimensions.height / 2,
            { zoom: target, duration: 350 },
          )
          return
        }
        if (tries++ < 12) requestAnimationFrame(attempt)
      }
      attempt()
    },
  )

  // ── Handlers Vue Flow → actions du store ────────────────────────────────────
  vf.onInit(() => {
    reframe()
  })

  /** Index cible d'un bloc d'après sa position live (relative à sa page). */
  function blockIndexFromY(relativeY: number): number {
    return Math.max(0, Math.round((relativeY - CONTENT_TOP) / BLOCK_STEP))
  }

  /**
   * Preview LIVE pendant le drag d'une note : recalcule le layout avec la position glissée de la
   * note et applique les positions résultantes aux AUTRES notes (elles se décalent en direct pour
   * simuler l'emplacement autorisé). La note glissée suit le curseur (non touchée ici).
   */
  function applyNoteDragPreview(draggedId: string, live: Position): void {
    const { bands } = computePortalLayout()
    const layout = computeNoteLayout(bands, new Map([[draggedId, { x: live.x, y: live.y }]]))
    for (const [id, pos] of layout) {
      if (id === draggedId) continue
      const gn = vf.findNode(id)
      if (gn) gn.position = { x: pos.x, y: pos.y }
    }
  }

  /**
   * Magnétisme d'alignement d'une PAGE en cours de drag : on snappe ses bords/centre (X et Y) sur
   * les bords/centres des AUTRES pages (aligner les hauts rend aussi le tracé de nav droit). Les
   * lignes retenues sont exposées via `snapGuides` pour l'affichage. Seuil en pixels écran (∴ /zoom).
   */
  const SNAP_SCREEN = 8
  /**
   * Magnétisme générique : aimante bords/centre (X et Y) du nœud glissé `gn` sur les listes de
   * cibles `xT`/`yT` (bords/centres des autres nœuds). Mute `gn.position` et expose les lignes-guides.
   */
  function applySnap(
    gn: GraphNode,
    w: number,
    h: number,
    xT: number[],
    yT: number[],
    guideOx = 0,
    guideOy = 0,
  ): void {
    const snap = SNAP_SCREEN / (vf.viewport.value.zoom || 1)
    const guidesV: number[] = []
    const guidesH: number[] = []
    // `off` convertit la ligne-guide retenue (dans le repère de `gn.position`) en coords MONDE, pour
    // qu'un nœud enfant (position relative au module) affiche ses guides au bon endroit à l'écran.
    const fit = (edges: number[], targets: number[], base: number, out: number[], off: number): number => {
      let best = base
      let bestD = snap
      let bestT: number | null = null
      for (const e of edges)
        for (const t of targets) {
          const d = Math.abs(e - t)
          if (d < bestD) {
            bestD = d
            best = base + (t - e)
            bestT = t
          }
        }
      if (bestT !== null) out.push(bestT + off)
      return best
    }
    const px = fit([gn.position.x, gn.position.x + w / 2, gn.position.x + w], xT, gn.position.x, guidesV, guideOx)
    const py = fit([gn.position.y, gn.position.y + h / 2, gn.position.y + h], yT, gn.position.y, guidesH, guideOy)
    gn.position = { x: px, y: py }
    snapGuides.value = { v: guidesV, h: guidesH }
  }

  /** Magnétisme d'alignement d'une PAGE (structurel) sur les autres pages. */
  function snapPage(gn: GraphNode): void {
    const w = gn.dimensions.width || PAGE_WIDTH
    const h = gn.dimensions.height || pageHeight(blockCountOf(gn.id))
    const xT: number[] = []
    const yT: number[] = []
    for (const n of store.nodes.values()) {
      if (!isPage(n) || n.id === gn.id) continue
      const r = pageRect(n)
      xT.push(r.x, r.x + r.w / 2, r.x + r.w)
      yT.push(r.y, r.y + r.h / 2, r.y + r.h)
    }
    applySnap(gn, w, h, xT, yT)
  }

  /**
   * Magnétisme d'alignement en couche FONCTIONNELLE : aimante le module (ou la fonctionnalité racine)
   * glissé sur les bords/centres des AUTRES modules et fonctionnalités racines (parité Arborescence).
   */
  function snapFunctional(gn: GraphNode): void {
    const w = gn.dimensions.width || MODULE_WIDTH
    const h = gn.dimensions.height || FEATURE_HEIGHT
    const layout = functionalLayout()
    const xT: number[] = []
    const yT: number[] = []
    const push = (x: number, y: number, rw: number, rh: number): void => {
      xT.push(x, x + rw / 2, x + rw)
      yT.push(y, y + rh / 2, y + rh)
    }
    for (const m of store.modules) {
      if (m.id === gn.id) continue
      {
        const sz = layout.moduleSize.get(m.id) ?? { w: MODULE_WIDTH, h: moduleHeight(featureCountOf(m.id)) }
        push(m.position.x, m.position.y, sz.w, sz.h)
      }
    }
    for (const f of store.features) {
      if (f.id === gn.id || f.parentId) continue // fonctionnalités racines seulement (les autres suivent leur module)
      const r = layout.rect.get(f.id)
      if (r) push(r.x, r.y, r.w, r.h)
    }
    applySnap(gn, w, h, xT, yT)
  }

  /** Espacement d'aimantation « à côté d'une sœur » entre deux fonctionnalités d'un même module. */
  const FEATURE_GAP = 14
  /** Distance (monde) sous laquelle un emplacement candidat s'active (fantôme affiché). */
  const GHOST_THRESHOLD = 90

  function rectsOverlap(a: Rect, b: Rect): boolean {
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  }

  /** Rect MONDE de la carte glissée (position + taille courantes). */
  function draggedCardRect(gn: GraphNode): Rect {
    return {
      x: gn.computedPosition.x,
      y: gn.computedPosition.y,
      w: gn.dimensions.width || FEATURE_WIDTH,
      h: gn.dimensions.height || FEATURE_HEIGHT,
    }
  }

  /**
   * Rect MONDE STABLE d'une fonctionnalité sœur : position d'après le STORE (indépendante d'un décalage
   * live de preview) + hauteur RÉELLEMENT MESURÉE (DOM). La position store évite que le calcul des
   * emplacements varie quand des sœurs sont décalées en preview (source du clignotement). La hauteur
   * mesurée évite le décalage vertical dû à l'estimation (contenu riche v4).
   */
  function siblingRect(id: string): Rect | null {
    const feat = store.nodeById(id)
    if (!feat || !isFeature(feat)) return null
    const gn = vf.findNode(id)
    const h = gn?.dimensions?.height || estimateFeature(feat).height
    const mod = feat.parentId ? store.nodeById(feat.parentId) : null
    if (mod && isModule(mod)) {
      return {
        x: mod.position.x + MODULE_PAD_X + Math.max(0, feat.position.x),
        y: mod.position.y + MODULE_CONTENT_TOP + Math.max(0, feat.position.y),
        w: FEATURE_WIDTH,
        h,
      }
    }
    return { x: feat.position.x, y: feat.position.y, w: FEATURE_WIDTH, h }
  }

  /**
   * Emplacements « magnétisés » candidats d'un module, autour de chaque sœur : à DROITE / GAUCHE
   * (alignés en haut) et DESSOUS / DESSUS (alignés à gauche), à la taille de la carte glissée. On
   * écarte ceux qui chevaucheraient une sœur (place déjà prise) ou déborderaient à gauche du contenu.
   * Coords MONDE.
   */
  function besideSlots(mod: ModuleNode, gn: GraphNode, excludeId: string): Rect[] {
    const w = gn.dimensions.width || FEATURE_WIDTH
    const h = gn.dimensions.height || FEATURE_HEIGHT
    const sibs: Rect[] = []
    for (const cid of store.childrenIndex.get(mod.id) ?? []) {
      if (cid === excludeId) continue
      const child = store.nodeById(cid)
      if (!child || !isFeature(child)) continue
      const r = siblingRect(cid) // position STORE + hauteur MESURÉE (stable, pile sous/à côté)
      if (r) sibs.push(r)
    }
    const slots: Rect[] = []
    for (const s of sibs) {
      slots.push({ x: s.x + s.w + FEATURE_GAP, y: s.y, w, h }) // à droite, aligné en haut
      slots.push({ x: s.x - FEATURE_GAP - w, y: s.y, w, h }) // à gauche, aligné en haut
      slots.push({ x: s.x, y: s.y + s.h + FEATURE_GAP, w, h }) // dessous, aligné à gauche
      slots.push({ x: s.x, y: s.y - FEATURE_GAP - h, w, h }) // dessus, aligné à gauche
    }
    // On garde les emplacements en ESPACE LIBRE (pas de chevauchement de sœur), y compris à GAUCHE ou
    // AU-DESSUS de l'origine : le module se normalise au drop pour grandir dans ces directions.
    return slots.filter((sl) => !sibs.some((s) => rectsOverlap(sl, s)))
  }

  /** Marge (monde) autour d'un emplacement pour le test « le curseur est dessus » (souplesse). */
  const GHOST_HIT_MARGIN = 24

  /**
   * Emplacement candidat retenu d'après la position du CURSEUR (plus intuitif que le centre de la
   * carte) : d'abord celui SUR lequel se trouve le curseur (rect + petite marge), sinon le plus proche
   * du curseur dans le seuil. `null` si rien d'assez proche. Départage par distance au centre.
   */
  function nearestBesideSlot(mod: ModuleNode, gn: GraphNode, excludeId: string, cursor: Position): Rect | null {
    const slots = besideSlots(mod, gn, excludeId)
    const dist = (sl: Rect): number => Math.hypot(sl.x + sl.w / 2 - cursor.x, sl.y + sl.h / 2 - cursor.y)
    const m = GHOST_HIT_MARGIN
    const under = slots
      .filter(
        (sl) =>
          cursor.x >= sl.x - m && cursor.x <= sl.x + sl.w + m && cursor.y >= sl.y - m && cursor.y <= sl.y + sl.h + m,
      )
      .sort((a, b) => dist(a) - dist(b))
    if (under.length) return under[0] ?? null
    let best: Rect | null = null
    let bestD = GHOST_THRESHOLD
    for (const sl of slots) {
      const d = dist(sl)
      if (d < bestD) {
        bestD = d
        best = sl
      }
    }
    return best
  }

  type Insertion = { slot: Rect; belowIds: string[]; shiftBy: number }

  /**
   * Insertion ENTRE deux cartes empilées : dans la colonne survolée (sœurs dont l'intervalle X couvre
   * le curseur), on cherche la frontière entre deux cartes consécutives la plus proche du curseur (en
   * Y). Rend l'emplacement ouvert (à la taille de la carte glissée) et la liste des cartes du dessous
   * à décaler pour faire de la place. `null` si le curseur n'est pas sur une frontière interne.
   */
  function insertionAt(mod: ModuleNode, gn: GraphNode, excludeId: string, cursor: Position): Insertion | null {
    const w = gn.dimensions.width || FEATURE_WIDTH
    const h = gn.dimensions.height || FEATURE_HEIGHT
    const col: { id: string; r: Rect }[] = []
    for (const cid of store.childrenIndex.get(mod.id) ?? []) {
      if (cid === excludeId) continue
      const child = store.nodeById(cid)
      if (!child || !isFeature(child)) continue
      const r = siblingRect(cid) // position STORE + hauteur MESURÉE → frontière stable, alignée au rendu
      if (!r) continue
      if (cursor.x >= r.x - GHOST_HIT_MARGIN && cursor.x <= r.x + r.w + GHOST_HIT_MARGIN) col.push({ id: cid, r })
    }
    if (col.length < 2) return null // besoin d'au moins deux cartes pour une frontière INTERNE
    col.sort((a, b) => a.r.y - b.r.y)
    let bestI = -1
    let bestD = 48 // seuil (monde) autour de la frontière
    for (let i = 0; i < col.length - 1; i++) {
      const boundary = (col[i]!.r.y + col[i]!.r.h + col[i + 1]!.r.y) / 2
      const d = Math.abs(cursor.y - boundary)
      if (d < bestD) {
        bestD = d
        bestI = i
      }
    }
    if (bestI < 0) return null
    const above = col[bestI]!
    const slot: Rect = { x: above.r.x, y: above.r.y + above.r.h + FEATURE_GAP, w, h }
    const belowIds = col.slice(bestI + 1).map((c) => c.id)
    return { slot, belowIds, shiftBy: h + FEATURE_GAP }
  }

  /** Réinitialise le décalage live des cartes du dessous (preview d'insertion) à leur position store. */
  function resetFeatureShift(): void {
    if (!featureShift) return
    const mod = store.nodeById(featureShift.modId)
    if (mod && isModule(mod)) {
      const layout = functionalLayout()
      for (const id of featureShift.belowIds) {
        const r = layout.rect.get(id)
        const gm = vf.findNode(id)
        if (r && gm) gm.position = { x: r.x - mod.position.x, y: r.y - mod.position.y }
      }
    }
    featureShift = null
  }

  /** Applique le décalage live vers le bas des cartes du dessous (ouvre la place pour l'insertion). */
  function applyFeatureShift(mod: ModuleNode, ins: Insertion): void {
    const layout = functionalLayout()
    for (const id of ins.belowIds) {
      const r = layout.rect.get(id)
      const gm = vf.findNode(id)
      if (r && gm) gm.position = { x: r.x - mod.position.x, y: r.y - mod.position.y + ins.shiftBy }
    }
    featureShift = { modId: mod.id, belowIds: ins.belowIds, shiftBy: ins.shiftBy }
  }

  /**
   * Agrandit un module pour englober un rect monde, GROW-ONLY : `max` avec la taille courante, donc il
   * ne rétrécit JAMAIS pendant le drag (le rétrécissement n'a lieu qu'au drop, via `push`). Répond au
   * besoin « le module peut s'agrandir pendant le déplacement mais ne se réduit qu'après ».
   */
  function growModuleToFit(mod: ModuleNode, rect: Rect): void {
    const gm = vf.findNode(mod.id)
    if (!gm) return
    const curW = gm.dimensions?.width || MODULE_WIDTH
    const curH = gm.dimensions?.height || moduleHeight(featureCountOf(mod.id))
    const needW = rect.x + rect.w - mod.position.x + MODULE_PAD_X
    const needH = rect.y + rect.h - mod.position.y + MODULE_PAD_BOTTOM
    const w = Math.max(curW, needW, MODULE_WIDTH)
    const hh = Math.max(curH, needH, MODULE_CONTENT_TOP + 48)
    const wpx = `${w}px`
    const hpx = `${hh}px`
    const st = gm.style as { width?: string; height?: string } | undefined
    // N'écrit QUE si la taille change réellement → pas de churn de style à chaque frame (clignotement).
    if (st?.width === wpx && st?.height === hpx) return
    gm.style = { ...(gm.style ?? {}), width: wpx, height: hpx }
  }

  /**
   * Marge d'accroche (monde) : une fonctionnalité reste rattachée à SON module tant que son centre est
   * dans les bornes du module ÉLARGIES de cette marge. Sans elle, le module s'ajustant au plus juste,
   * réarranger la carte du bas la ferait aussitôt « sortir » (le module n'a aucun mou pour bouger).
   */
  const FEATURE_STICKY_MARGIN = 120

  /**
   * Position d'une carte glissée, relative au CONTENU d'un module (inset + en-tête retirés). Peut être
   * NÉGATIVE (carte posée à gauche/au-dessus de l'origine) : la normalisation du module au drop ramène
   * ensuite tout à `>= 0` en décalant l'origine (croissance gauche/haut).
   */
  function relInModule(gn: GraphNode, mod: ModuleNode): { x: number; y: number } {
    return {
      x: gn.computedPosition.x - mod.position.x - MODULE_PAD_X,
      y: gn.computedPosition.y - mod.position.y - MODULE_CONTENT_TOP,
    }
  }

  /** Le module de `sn` si le curseur en est proche (bornes + marge d'accroche). Sinon `null`. */
  function ownModuleIfNear(sn: FeatureNode, cursor: Position): ModuleNode | null {
    if (!sn.parentId) return null
    const mod = store.nodeById(sn.parentId)
    if (!mod || !isModule(mod)) return null
    const layout = functionalLayout()
    const sz = layout.moduleSize.get(mod.id) ?? { w: MODULE_WIDTH, h: moduleHeight(featureCountOf(mod.id)) }
    const m = FEATURE_STICKY_MARGIN
    const near =
      cursor.x >= mod.position.x - m &&
      cursor.x <= mod.position.x + sz.w + m &&
      cursor.y >= mod.position.y - m &&
      cursor.y <= mod.position.y + sz.h + m
    return near ? mod : null
  }

  /**
   * Drag d'une fonctionnalité ENFANT d'un module, piloté par le CURSEUR et le FANTÔME (pas le centre de
   * la carte). On cherche le meilleur emplacement (insertion entre deux cartes, ou libre autour d'une
   * carte) parmi les modules candidats — le module d'origine ET celui sous le curseur — puis le fantôme
   * décide du module de dépôt (`featureDropModId`). Ainsi un placement à GAUCHE/AU-DESSUS, où le centre
   * de la carte sort du module, reste rattaché au bon module. Sans emplacement : placement libre si le
   * curseur est dans/près d'un module, sinon détachement.
   */
  /** Met à jour le fantôme UNIQUEMENT s'il change (évite la réactivité inutile → moins de repaints). */
  function setGhost(r: Rect | null): void {
    const c = dragGhost.value
    if (!r) {
      if (c) dragGhost.value = null
      return
    }
    if (c && c.x === r.x && c.y === r.y && c.w === r.w && c.h === r.h) return
    dragGhost.value = { ...r }
  }

  /** L'insertion active est-elle DÉJÀ celle demandée ? (mêmes cartes du dessous, même décalage). */
  function sameShift(modId: string, ins: Insertion): boolean {
    return (
      !!featureShift &&
      featureShift.modId === modId &&
      featureShift.shiftBy === ins.shiftBy &&
      featureShift.belowIds.length === ins.belowIds.length &&
      featureShift.belowIds.every((id, i) => id === ins.belowIds[i])
    )
  }

  function dragFeatureChild(gn: GraphNode, sn: FeatureNode, cursor: Position): boolean {
    // Les emplacements se calculent sur les positions STORE (siblingRect), stables même si des sœurs
    // sont décalées en preview → plus besoin de tout réinitialiser à chaque frame (source du clignotement).
    const candidateIds = new Set<string>()
    if (sn.parentId) candidateIds.add(sn.parentId)
    const over = moduleAtPoint(cursor.x, cursor.y)
    if (over) candidateIds.add(over.id)
    // Fonctionnalité RACINE hors de tout module → non gérée ici (l'aimantation racine s'en charge).
    if (candidateIds.size === 0) {
      resetFeatureShift()
      setGhost(null)
      featureDropModId = null
      return false
    }
    const centerDist = (r: Rect) => Math.hypot(r.x + r.w / 2 - cursor.x, r.y + r.h / 2 - cursor.y)
    let chosen: { mod: ModuleNode; slot: Rect; ins: Insertion | null; d: number } | null = null
    for (const mid of candidateIds) {
      const mod = store.nodeById(mid)
      if (!mod || !isModule(mod)) continue
      const ins = insertionAt(mod, gn, sn.id, cursor)
      if (ins) {
        const d = centerDist(ins.slot)
        if (!chosen || d < chosen.d) chosen = { mod, slot: ins.slot, ins, d }
      }
      const slot = nearestBesideSlot(mod, gn, sn.id, cursor)
      if (slot) {
        const d = centerDist(slot)
        if (!chosen || d < chosen.d) chosen = { mod, slot, ins: null, d }
      }
    }
    if (chosen) {
      if (chosen.ins) {
        // Ne (ré)applique le décalage QUE si l'insertion a changé → sinon les sœurs ne bougent pas.
        if (!sameShift(chosen.mod.id, chosen.ins)) {
          resetFeatureShift()
          applyFeatureShift(chosen.mod, chosen.ins)
        }
      } else {
        resetFeatureShift()
      }
      setGhost(chosen.slot)
      growModuleToFit(chosen.mod, chosen.slot)
      featureDropModId = chosen.mod.id
      return true
    }
    // Aucun emplacement magnétisé : placement libre si le curseur est dans/près d'un module, sinon détach.
    resetFeatureShift()
    setGhost(null)
    const free = over ?? ownModuleIfNear(sn, cursor)
    if (free) {
      growModuleToFit(free, draggedCardRect(gn))
      featureDropModId = free.id
      return true
    }
    featureDropModId = null
    // Enfant largué hors de tout module → géré ici (détachement). Racine hors module → non géré
    // (retourne false → aimantation racine / déplacement monde libre).
    return sn.parentId != null
  }

  /**
   * Re-tasse les COLONNES d'un module après un drop : les cartes qui se chevauchent en X forment une
   * colonne ; dans chaque colonne (triée par Y), on ré-empile au plus juste (hauteur MESURÉE + écart)
   * depuis le haut de la colonne. Comble le trou laissé par une carte partie ET résout l'insertion
   * (la carte déposée, prioritaire à Y égal, prend sa place dans l'ordre). Les placements côte à côte
   * (colonnes distinctes) sont préservés. Mutations coalescées → une seule entrée d'historique.
   */
  function restackColumns(modId: string, draggedId: string | null, coalesce: string): void {
    const mod = store.nodeById(modId)
    if (!mod || !isModule(mod)) return
    const kids = (store.childrenIndex.get(modId) ?? [])
      .map((id) => store.nodeById(id))
      .filter((n): n is FeatureNode => n != null && isFeature(n))
    if (kids.length < 2) return
    type It = { id: string; x: number; y: number; w: number; h: number }
    const items: It[] = kids.map((k) => {
      const gm = vf.findNode(k.id)
      const h = gm?.dimensions?.height || estimateFeature(k).height
      return { id: k.id, x: k.position.x, y: k.position.y, w: FEATURE_WIDTH, h }
    })
    const xOverlap = (a: It, b: It): boolean => a.x < b.x + b.w && b.x < a.x + a.w
    const cols: It[][] = []
    for (const it of [...items].sort((a, b) => a.x - b.x)) {
      const col = cols.find((c) => c.some((o) => xOverlap(o, it)))
      if (col) col.push(it)
      else cols.push([it])
    }
    for (const col of cols) {
      if (col.length < 2) continue
      // À Y égal, la carte déposée passe devant (insertion nette entre deux cartes serrées).
      col.sort((a, b) => a.y - b.y || (a.id === draggedId ? -1 : b.id === draggedId ? 1 : 0))
      let y = Math.min(...col.map((c) => c.y)) // le haut de la colonne ne bouge pas
      for (const it of col) {
        if (Math.abs(it.y - y) > 0.5) store.moveNode(it.id, { x: it.x, y }, coalesce)
        y += it.h + FEATURE_GAP
      }
    }
  }

  type FeatureSide = 'top' | 'right' | 'bottom' | 'left'

  /**
   * Crée une fonctionnalité ADJACENTE à une autre, du côté demandé (bouton « + » au survol). Dans un
   * module : position relative au contenu (à côté/au-dessus/en-dessous de la carte source), puis
   * normalisation + re-tassage + auto-espacement. En racine : simple décalage monde. Sélectionne la
   * nouvelle carte pour l'éditer aussitôt.
   */
  function addAdjacentFeature(featureId: string, side: FeatureSide): void {
    const feat = store.nodeById(featureId)
    if (!feat || !isFeature(feat)) return
    const gm = vf.findNode(featureId)
    const h = gm?.dimensions?.height || estimateFeature(feat).height
    const w = gm?.dimensions?.width || FEATURE_WIDTH
    const G = FEATURE_GAP
    const NEW_H = 90 // hauteur approx d'une carte vide (placement « dessus »)
    const off = (base: { x: number; y: number }) => {
      if (side === 'right') return { x: base.x + w + G, y: base.y }
      if (side === 'left') return { x: base.x - FEATURE_WIDTH - G, y: base.y }
      if (side === 'bottom') return { x: base.x, y: base.y + h + G }
      return { x: base.x, y: base.y - NEW_H - G } // top
    }
    if (feat.parentId) {
      const mod = store.nodeById(feat.parentId)
      if (!mod || !isModule(mod)) return
      const pos = off({ x: Math.max(0, feat.position.x), y: Math.max(0, feat.position.y) })
      const coalesce = `add-adjacent-${featureId}`
      const id = store.addFeature(mod.id, { position: pos })
      store.normalizeModule(mod.id, coalesce)
      restackColumns(mod.id, id, coalesce)
      separateModules()
      ui.select(id)
    } else {
      const id = store.addFeature(null, { position: off(feat.position) })
      ui.select(id)
    }
  }

  // Badge d'ordre live pendant le drag d'un bloc ; preview de reflow pendant le drag d'une note.
  vf.onNodeDragStart((e: NodeDragEvent) => {
    closeMenus()
    noteDragId = null
    dragGhost.value = null
    featureShift = null
    featureDropModId = null
    const map = new Map<string, number>()
    for (const gn of e.nodes) {
      const sn = store.nodeById(gn.id)
      if (sn && isBlock(sn)) map.set(gn.id, blockIndexFromY(gn.position.y) + 1)
      else if (sn && isNote(sn) && e.nodes.length === 1) noteDragId = sn.id
      // Défaut sans geste de drag effectif : la carte reste dans son module (pas de détachement).
      else if (sn && isFeature(sn) && sn.parentId && e.nodes.length === 1) featureDropModId = sn.parentId
    }
    orderBadges.value = map
  })

  vf.onNodeDrag((e: NodeDragEvent) => {
    if (noteDragId) {
      const gn = e.nodes.find((n) => n.id === noteDragId)
      if (gn) applyNoteDragPreview(noteDragId, gn.position)
      return
    }
    // Magnétisme d'alignement pour un élément glissé seul.
    if (e.nodes.length === 1) {
      const gn = e.nodes[0]
      const sn = gn && store.nodeById(gn.id)
      if (gn && sn && isPage(sn)) {
        snapPage(gn)
        return
      }
      // Fonctionnalité (ENFANT d'un module OU RACINE) : fantôme d'emplacement suivant le CURSEUR
      // (fallback = centre de la carte) + module qui s'adapte. Une racine survolant un module y est
      // rattachée ; sinon `dragFeatureChild` rend `false` et l'aimantation racine ci-dessous s'applique.
      if (gn && sn && isFeature(sn)) {
        const card = draggedCardRect(gn)
        const cursor = worldFromEvent(e.event) ?? { x: card.x + card.w / 2, y: card.y + card.h / 2 }
        if (dragFeatureChild(gn, sn, cursor)) return
      }
      // Couche fonctionnelle : module ou fonctionnalité racine libre. Parité avec l'aimantation des pages.
      if (gn && sn && (isModule(sn) || (isFeature(sn) && !sn.parentId))) {
        snapFunctional(gn)
        return
      }
    }
    if (orderBadges.value.size === 0) return
    const map = new Map<string, number>()
    for (const gn of e.nodes) {
      const sn = store.nodeById(gn.id)
      if (sn && isBlock(sn)) map.set(gn.id, blockIndexFromY(gn.position.y) + 1)
    }
    orderBadges.value = map
  })

  vf.onNodeDragStop((e: NodeDragEvent) => {
    orderBadges.value = new Map()
    snapGuides.value = { v: [], h: [] }
    const dropGhost = dragGhost.value // capturé pour le placement, puis effacé
    const dropModId = featureDropModId // module de dépôt décidé par le fantôme pendant le drag
    // L'insertion live (featureShift) n'est qu'une PREVIEW : le re-tassage des colonnes au drop produit
    // les positions finales serrées, donc on n'a plus besoin de valider le décalage manuellement.
    dragGhost.value = null
    featureShift = null
    featureDropModId = null
    noteDragId = null
    let frameMoved = false
    for (const gn of e.nodes) {
      // Les pastilles portail sont auto-positionnées (non déplaçables) → ignorées ici.
      const sn = store.nodeById(gn.id)
      if (!sn) continue
      if (isBlock(sn)) {
        frameMoved = true
        // Centre absolu du bloc → page cible.
        const cx = gn.computedPosition.x + gn.dimensions.width / 2
        const cy = gn.computedPosition.y + gn.dimensions.height / 2
        const targetPage = pageAtPoint(cx, cy, sn.id)
        if (targetPage && targetPage.id !== sn.parentId) {
          store.reparentBlock(sn.id, targetPage.id)
        } else if (targetPage && targetPage.id === sn.parentId) {
          store.reorderBlock(sn.id, blockIndexFromY(gn.position.y))
        } else {
          // Largué hors de toute page → retour à sa place (re-sync sans historique).
          push()
        }
      } else if (isPage(sn)) {
        frameMoved = true
        store.moveNode(sn.id, { x: gn.position.x, y: gn.position.y })
      } else if (isFeature(sn)) {
        frameMoved = true
        // Le module de dépôt a été décidé par le FANTÔME pendant le drag (featureDropModId), donc drag
        // et drop concordent toujours (y compris placement à gauche/au-dessus). `null` = détachement.
        const ghost = dropGhost
        const modId = dropModId
        const coalesce = `place-feat-${sn.id}`
        const relFromGhost = (mod: ModuleNode) => ({
          x: (ghost as { x: number; y: number }).x - mod.position.x - MODULE_PAD_X,
          y: (ghost as { x: number; y: number }).y - mod.position.y - MODULE_CONTENT_TOP,
        })
        const oldParent = sn.parentId // pour combler le trou dans le module d'origine si reparent
        const mod = modId ? store.nodeById(modId) : null
        if (mod && isModule(mod)) {
          // Position depuis le fantôme (peut être NÉGATIVE si à gauche/au-dessus), sinon position libre.
          // La normalisation ramène l'origine (croissance gauche/haut), puis le re-tassage des colonnes
          // resserre (comble le trou de départ, applique l'ordre d'insertion). Tout coalescé.
          const rel = ghost ? relFromGhost(mod) : relInModule(gn, mod)
          if (mod.id === sn.parentId) store.moveNode(sn.id, rel, coalesce)
          else store.reparentFeature(sn.id, mod.id, rel)
          store.normalizeModule(mod.id, coalesce)
          restackColumns(mod.id, sn.id, coalesce)
          if (oldParent && oldParent !== mod.id) restackColumns(oldParent, null, coalesce)
        } else if (sn.parentId) {
          // Sortie du module → DÉTACHEMENT en racine, à sa position monde (le module ne grossit pas).
          // Le module d'origine se re-tasse pour combler le trou laissé.
          const src = sn.parentId
          store.reparentFeature(sn.id, null, { x: gn.computedPosition.x, y: gn.computedPosition.y })
          restackColumns(src, null, coalesce)
        } else {
          // Déjà racine, hors module → déplacement monde libre.
          store.moveNode(sn.id, { x: gn.position.x, y: gn.position.y })
        }
      } else {
        // Note : déplacement libre (attachedTo inchangé, le connecteur suit).
        store.moveNode(sn.id, { x: gn.position.x, y: gn.position.y })
      }
    }
    // Une frame a bougé → le tracé de certaines arêtes peut désormais obstruer/dégager : on
    // ré-évalue ligne↔portail (au drop uniquement, verrou manuel respecté).
    if (frameMoved) {
      separateModules() // un module a pu grandir (carte ajoutée) ou se déplacer → dé-chevaucher
      reevaluateRenders()
    }
  })

  vf.onNodesChange((changes: NodeChange[]) => {
    for (const c of changes) {
      if (c.type === 'remove') store.removeNode(c.id)
      // « Cliquer ailleurs ferme l'éditeur » : en mode sélection (selectionKeyCode + panOnDrag off),
      // le clic sur le vide ne passe pas par onPaneClick mais émet une désélection ici. Dès que la
      // carte éditée est désélectionnée sur le canvas, on referme l'éditeur.
      if (c.type === 'select' && !c.selected && c.id === ui.editorNodeId) ui.closeEditor()
    }
  })

  // ── Connexion : validation + typage inféré ──────────────────────────────────
  /** Types d'arête valides pour une paire d'extrémités (le 1er = type par défaut). */
  function validEdgeTypes(source: string, target: string): EdgeType[] {
    const s = store.nodeById(source)
    const t = store.nodeById(target)
    if (!s || !t) return []
    if (isPage(s) && isPage(t)) return ['navigatesTo', 'dependsOn']
    if (isNote(s) && isNote(t)) return ['dependsOn']
    return ['dependsOn']
  }

  /** attrs d'une nouvelle arête selon le rendu auto-détecté (portail → pastilles pré-placées). */
  function newEdgeAttrs(source: string, target: string): FlooowEdge['attrs'] {
    // Positions des pastilles calculées à l'affichage (computePortalLayout) — rien à stocker.
    return chooseRender(source, target) === 'portal' ? { render: 'portal' } : {}
  }

  vf.onConnect((c: Connection) => {
    if (!c.source || !c.target || c.source === c.target) return
    didConnect = true
    const type = validEdgeTypes(c.source, c.target)[0]
    if (!type) return
    const dup = store.edges.some(
      (e) => e.source === c.source && e.target === c.target && e.type === type,
    )
    if (dup) return
    store.addEdge({
      type,
      source: c.source,
      target: c.target,
      attrs: newEdgeAttrs(c.source, c.target),
    })
  })

  vf.onConnectStart((params) => {
    connectSource = params
    didConnect = false
  })

  vf.onConnectEnd((event) => {
    const src = connectSource
    connectSource = null
    if (didConnect || !src?.nodeId || !event) return
    const me = event instanceof MouseEvent ? event : null
    if (!me) return
    // Couche fonctionnelle : lâcher un lien sur N'IMPORTE QUELLE partie d'une carte fonctionnalité le
    // relie (fiabilité : Vue Flow ne rattache un handle que dans un petit rayon ; ici on prend le
    // nœud réellement sous le curseur). Le port est ensuite recalculé pour faire face à la source.
    if (ui.canvasLayer === 'functional') {
      const el = document.elementFromPoint(me.clientX, me.clientY) as HTMLElement | null
      const nodeEl = el?.closest('.vue-flow__node-feature') as HTMLElement | null
      const targetId = nodeEl?.getAttribute('data-id') ?? null
      if (targetId && targetId !== src.nodeId) {
        const s = store.nodeById(src.nodeId)
        const t = store.nodeById(targetId)
        if (s && t && isFeature(s) && isFeature(t)) {
          const dup = store.edges.some(
            (e) => e.source === src.nodeId && e.target === targetId && e.type === 'dependsOn',
          )
          if (!dup) store.addEdge({ type: 'dependsOn', source: src.nodeId, target: targetId, attrs: {} })
        }
        return
      }
    }
    // Lâché dans le vide → menu de quick-create au curseur.
    const rect = vf.vueFlowRef.value?.getBoundingClientRect()
    if (!rect) return
    const world = vf.project({ x: me.clientX - rect.left, y: me.clientY - rect.top })
    quickCreate.value = {
      screenX: me.clientX,
      screenY: me.clientY,
      worldX: world.x,
      worldY: world.y,
      sourceId: src.nodeId,
    }
  })

  // Double-clic : sur une page → ajoute un bloc ; sur un module → ajoute une fonctionnalité.
  vf.onNodeDoubleClick(({ node }) => {
    const sn = store.nodeById(node.id)
    if (sn && isPage(sn)) store.addBlock(sn.id, 'free')
    else if (sn && isModule(sn)) ui.select(store.addFeature(sn.id))
  })

  vf.onNodeClick(({ event, node }) => {
    // Nœud portail : la navigation (focus de l'autre bout) est gérée par PortalNode lui-même.
    if (parsePortalId(node.id)) return
    // Cliquer un NŒUD alors qu'un outil de placement est actif → repasse en SÉLECTION et sélectionne
    // le nœud (l'outil de placement ne pose que sur le canvas vide).
    if (tool.active === 'module' || tool.active === 'feature') {
      tool.active = 'select'
      tool.sticky = false
    }
    closeMenus()
    const additive =
      event instanceof MouseEvent && (event.shiftKey || event.metaKey || event.ctrlKey)
    ui.select(node.id, additive)
  })

  vf.onNodeContextMenu(({ event, node }) => {
    // Nœud portail : le clic droit ouvre le popover d'ARÊTE (géré par PortalNode via EDGE_MENU_KEY).
    if (parsePortalId(node.id)) return
    event.preventDefault()
    const me = event instanceof MouseEvent ? event : null
    if (!me) return
    ui.select(node.id)
    quickCreate.value = null
    edgePopover.value = null
    contextMenu.value = { screenX: me.clientX, screenY: me.clientY, nodeId: node.id }
  })

  /** Ouvre le popover d'arête (type, portail, suppression) à une position écran. */
  function openEdgePopover(stored: FlooowEdge, clientX: number, clientY: number): void {
    closeMenus()
    edgePopover.value = {
      screenX: clientX,
      screenY: clientY,
      edgeId: stored.id,
      current: stored.type,
      choices: validEdgeTypes(stored.source, stored.target),
      render: stored.attrs.render ?? 'line',
    }
  }

  /** Exposé (via provide) aux pastilles portail : clic droit → ouvre le popover. */
  function openEdgeMenu(edgeId: string, clientX: number, clientY: number): void {
    const stored = store.edges.find((e) => e.id === edgeId)
    if (stored) openEdgePopover(stored, clientX, clientY)
  }

  vf.onEdgeClick(({ edge }) => {
    // Clic GAUCHE = SÉLECTION de l'arête (révèle les poignées de waypoints, déplaçables au drag).
    // Le menu (changer le type / convertir en portail / supprimer) est au clic DROIT.
    const stored = store.edges.find((e) => e.id === edge.id)
    if (!stored) return
    closeMenus()
    ui.clearSelection()
    vf.removeSelectedEdges(vf.getSelectedEdges.value)
    const ge = vf.findEdge(edge.id)
    if (ge) vf.addSelectedEdges([ge])
  })

  vf.onEdgeContextMenu(({ event, edge }) => {
    // Clic DROIT = menu d'arête.
    const stored = store.edges.find((e) => e.id === edge.id)
    if (!stored) return
    event.preventDefault()
    const me = event instanceof MouseEvent ? event : null
    if (!me) return
    openEdgePopover(stored, me.clientX, me.clientY)
  })

  /** Module dont le rect (monde) contient le point (pour poser une fonctionnalité dedans). */
  function moduleAtPoint(px: number, py: number): ModuleNode | null {
    const layout = functionalLayout()
    for (const m of store.modules) {
      const sz = layout.moduleSize.get(m.id) ?? { w: MODULE_WIDTH, h: moduleHeight(featureCountOf(m.id)) }
      if (px >= m.position.x && px <= m.position.x + sz.w && py >= m.position.y && py <= m.position.y + sz.h) {
        return m
      }
    }
    return null
  }

  /** Coordonnées MONDE d'un événement souris (ou null). */
  function worldFromEvent(event: unknown): Position | null {
    const me = event instanceof MouseEvent ? event : null
    const rect = vf.vueFlowRef.value?.getBoundingClientRect()
    if (!me || !rect) return null
    return vf.project({ x: me.clientX - rect.left, y: me.clientY - rect.top })
  }

  /**
   * Pose le nœud de l'outil de PLACEMENT actif (module/fonctionnalité) au point monde. Une
   * fonctionnalité posée sur un module y est rattachée ; sinon elle est racine à cet endroit.
   * L'outil RESTE actif (placement en série) et le nœud N'EST PAS sélectionné (pas d'éditeur qui
   * s'ouvre) — on repasse en sélection uniquement au clic sur un nœud. Retourne `true` si posé.
   */
  function placeToolAt(world: Position, overModule?: ModuleNode | null): boolean {
    if (tool.active === 'module') {
      store.addModule({ position: world })
    } else if (tool.active === 'feature') {
      const mod = overModule ?? moduleAtPoint(world.x, world.y)
      if (mod) store.addFeature(mod.id)
      else store.addFeature(null, { position: world })
    } else {
      return false
    }
    ui.clearSelection() // pas de sélection du nouveau nœud → l'outil reste actif pour enchaîner
    return true
  }

  vf.onPaneClick((event) => {
    const world = worldFromEvent(event)
    if (world && placeToolAt(world)) return
    ui.clearSelection()
    closeMenus()
  })

  // ── Menus : actions ──────────────────────────────────────────────────────────
  function closeMenus(): void {
    quickCreate.value = null
    contextMenu.value = null
    edgePopover.value = null
  }

  /** Page de rattachement d'un nœud (pour rattacher un bloc au bon parent). */
  function targetPageId(sourceId: string): string | null {
    const n = store.nodeById(sourceId)
    if (!n) return null
    if (isPage(n)) return n.id
    return pageOf(sourceId, store.nodes)?.id ?? null
  }

  function runQuickCreate(kind: QuickCreateKind): void {
    const qc = quickCreate.value
    if (!qc) return
    const source = store.nodeById(qc.sourceId)
    if (!source) return closeMenus()
    const pos = { x: qc.worldX, y: qc.worldY }

    if (kind === 'page') {
      const id = store.addPage({ position: pos })
      if (isPage(source)) {
        const render = chooseRender(source.id, id)
        store.addEdge({
          type: 'navigatesTo',
          source: source.id,
          target: id,
          attrs: render === 'portal' ? { render } : {},
        })
      }
      ui.select(id)
    } else if (kind === 'block') {
      const pageId = targetPageId(qc.sourceId)
      if (pageId) ui.select(store.addBlock(pageId, 'free'))
    } else if (kind === 'behavior') {
      // Rattache à la source si c'est une frame (page/bloc), sinon à sa page.
      const attachTo = isFrame(source) ? source.id : (targetPageId(qc.sourceId) ?? source.id)
      ui.select(store.addBehaviorNote(attachTo, { position: pos }))
    } else if (kind === 'feature') {
      // Couche fonctionnelle : nouvelle fonctionnalité, dans le module de la source (ou la source
      // si c'est un module). Reliée par « dépend de » : la nouvelle dépend de la source.
      const parentId = isFeature(source) ? source.parentId : isModule(source) ? source.id : null
      const id = store.addFeature(parentId, { position: pos })
      if (isFeature(source)) {
        store.addEdge({ type: 'dependsOn', source: id, target: source.id, attrs: {} })
      }
      ui.select(id)
    } else {
      const attachTo = isFrame(source) ? source.id : (targetPageId(qc.sourceId) ?? source.id)
      const serviceId = store.services[0]?.id ?? store.addService()
      ui.select(store.addApiNote(attachTo, serviceId, { method: 'GET', path: '/' }, { position: pos }))
    }
    closeMenus()
  }

  function contextDelete(): void {
    const cm = contextMenu.value
    if (!cm) return
    const id = cm.nodeId
    closeMenus()
    const n = store.nodeById(id)
    if (!n) return
    const cascade = isFrame(n) ? store.descendantsOf(id).length : 0
    const attached = store.notesOf(id).length
    if (cascade + attached > 0) {
      const ok = window.confirm(
        `Supprimer cet élément et ${cascade + attached} élément(s) rattaché(s) ? Réversible (Ctrl+Z).`,
      )
      if (!ok) return
    }
    store.removeNode(id)
    ui.clearSelection()
  }

  function contextSetHome(): void {
    const cm = contextMenu.value
    if (!cm) return
    const n = store.nodeById(cm.nodeId)
    if (n && isPage(n)) store.setHomePage(n.id)
    closeMenus()
  }

  function contextSetBlockType(blockType: BlockType): void {
    const cm = contextMenu.value
    if (!cm) return
    store.setBlockType(cm.nodeId, blockType)
    closeMenus()
  }

  /**
   * Convertit une note behavior ↔ api (best-effort : le modèle n'a pas d'action de conversion,
   * on recrée la note dans l'autre genre en conservant `attachedTo`/position/lot).
   */
  function contextConvertNote(kind: NoteNode['kind']): void {
    const cm = contextMenu.value
    if (!cm) return
    const n = store.nodeById(cm.nodeId)
    closeMenus()
    if (!n || !isNote(n) || n.kind === kind) return
    const { attachedTo, position, lot } = n
    store.removeNode(n.id)
    if (kind === 'behavior') {
      ui.select(store.addBehaviorNote(attachedTo, { position, lot }))
    } else {
      const serviceId = store.services[0]?.id ?? store.addService()
      ui.select(store.addApiNote(attachedTo, serviceId, { method: 'GET', path: '/' }, { position, lot }))
    }
  }

  /** Crée une note (comportement/api) rattachée à la frame du menu contextuel, posée à sa droite. */
  function contextAddNote(kind: NoteNode['kind']): void {
    const cm = contextMenu.value
    if (!cm) return
    const node = store.nodeById(cm.nodeId)
    closeMenus()
    if (!node || !isFrame(node)) return
    const r = frameRect(node)
    const pos = r
      ? { x: r.x + r.w + 40, y: r.y }
      : { x: node.position.x + PAGE_WIDTH + 40, y: node.position.y }
    if (kind === 'behavior') {
      ui.select(store.addBehaviorNote(node.id, { position: pos }))
    } else {
      const serviceId = store.services[0]?.id ?? store.addService()
      ui.select(store.addApiNote(node.id, serviceId, { method: 'GET', path: '/' }, { position: pos }))
    }
  }
  function contextAddBehavior(): void {
    contextAddNote('behavior')
  }
  function contextAddApi(): void {
    contextAddNote('api')
  }

  function applyEdgeType(type: EdgeType): void {
    const ep = edgePopover.value
    if (!ep) return
    store.setEdgeType(ep.edgeId, type)
    closeMenus()
  }

  function toggleEdgeRenderFromPopover(): void {
    const ep = edgePopover.value
    if (!ep) return
    // Positions des pastilles calculées à l'affichage (computePortalLayout) — rien à semer.
    store.toggleEdgeRender(ep.edgeId)
    closeMenus()
  }

  function deleteEdgeFromPopover(): void {
    const ep = edgePopover.value
    if (!ep) return
    store.removeEdge(ep.edgeId)
    closeMenus()
  }

  // ── Création / suppression exposées à FlowCanvas ────────────────────────────
  function createPageAt(position: { x: number; y: number }): void {
    ui.select(store.addPage({ position }))
  }

  /** Supprime les arêtes sélectionnées (Vue Flow). Les arêtes ne sont pas dans `ui.selection`. */
  function deleteSelectedEdges(): boolean {
    const sel = vf.getSelectedEdges.value.filter((e) => store.edges.some((x) => x.id === e.id))
    for (const e of sel) store.removeEdge(e.id)
    return sel.length > 0
  }

  // Suppression d'un lien sélectionné au clavier (Suppr/Retour arrière), quel que soit le focus.
  function onWindowDelete(e: KeyboardEvent): void {
    if (e.key !== 'Delete' && e.key !== 'Backspace') return
    const el = e.target as HTMLElement | null
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
    if (deleteSelectedEdges()) e.preventDefault()
  }
  window.addEventListener('keydown', onWindowDelete)
  onScopeDispose(() => window.removeEventListener('keydown', onWindowDelete))

  // Resize manuel d'un module (poignée dans ModuleFrame) → dé-chevaucher les modules voisins.
  function onReflowModules(): void {
    separateModules()
  }
  window.addEventListener('flooow:reflow-modules', onReflowModules)
  onScopeDispose(() => window.removeEventListener('flooow:reflow-modules', onReflowModules))

  // Bouton « + » au survol d'une carte (FeatureNode) → créer une fonctionnalité adjacente.
  function onAddAdjacent(e: Event): void {
    const d = (e as CustomEvent<{ id: string; side: FeatureSide }>).detail
    if (d?.id && d.side) addAdjacentFeature(d.id, d.side)
  }
  window.addEventListener('flooow:add-adjacent', onAddAdjacent)
  onScopeDispose(() => window.removeEventListener('flooow:add-adjacent', onAddAdjacent))

  function deleteSelection(): void {
    if (deleteSelectedEdges()) return
    const ids = [...ui.selectedIds]
    if (!ids.length) return
    let cascade = 0
    for (const id of ids) {
      const n = store.nodeById(id)
      if (n && isFrame(n)) cascade += store.descendantsOf(id).length
      if (n) cascade += store.notesOf(id).length
    }
    if (cascade > 0) {
      const ok = window.confirm(
        `Supprimer ${ids.length} élément(s) et ${cascade} rattaché(s) ? Réversible (Ctrl+Z).`,
      )
      if (!ok) return
    }
    for (const id of ids) store.removeNode(id)
    ui.clearSelection()
  }

  return {
    toFlowNodes,
    toFlowEdges,
    orderBadges,
    snapGuides,
    dragGhost,
    deleteSelection,
    createPageAt,
    quickCreate,
    contextMenu,
    edgePopover,
    closeMenus,
    runQuickCreate,
    contextDelete,
    contextSetHome,
    contextSetBlockType,
    contextConvertNote,
    contextAddBehavior,
    contextAddApi,
    applyEdgeType,
    toggleEdgeRenderFromPopover,
    deleteEdgeFromPopover,
    openEdgeMenu,
  }
}
