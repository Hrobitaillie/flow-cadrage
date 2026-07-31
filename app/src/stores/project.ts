// LE graphe : source unique de vérité (architecture.md §Principe directeur), format v2.
// nodes en Map<id,node>, edges, services (registre), meta, site + index (enfants, notes) + graphVersion.
// TOUTES les mutations passent par une action nommée → undo/redo + invariants possibles.
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  AttachedIndex,
  BlockNode,
  BlockType,
  ChildrenIndex,
  EdgeRender,
  EdgeType,
  FeatureNode,
  FlooowEdge,
  FlooowNode,
  ModuleNode,
  NodeIndex,
  NoteNode,
  PageNode,
  Position,
  ProjectDoc,
  ProjectMeta,
  Service,
  SiteAttrs,
  ApiNote,
  BehaviorNote,
} from '@/model/types'
import {
  isApiNote,
  isBehaviorNote,
  isBlock,
  isFeature,
  isModule,
  isNote,
  isPage,
  CURRENT_FORMAT_VERSION,
} from '@/model/types'
import {
  createApiNote,
  createBehaviorNote,
  createBlock,
  createEdge,
  createEmptyProject,
  createFeature,
  createModule,
  createPage,
  createService,
  BLOCK_STEP,
  FEATURE_STEP,
  MODULE_COL_STEP,
  type CreateApiNoteInput,
  type CreateBehaviorNoteInput,
  type CreateBlockInput,
  type CreateEdgeInput,
  type CreateFeatureInput,
  type CreateModuleInput,
  type CreatePageInput,
  type CreateServiceInput,
} from '@/model/factory'
import { spatialOrder, verticalOrder } from '@/domain/ordering'
import { resolveLot, resolveLotProvenance } from '@/domain/lots'
import { descendants, attachedNotes } from '@/domain/rollup'
import {
  coverage,
  featuresRealizedBy,
  realizationEdge,
  realizersOf,
  type RealizationTarget,
} from '@/domain/realization'
import { orphanPages } from '@/domain/reachability'
import { completeness } from '@/domain/completeness'
import { checkInvariants } from '@/domain/invariants'
import { deriveSpecs, type SpecsFilter } from '@/domain/derive/specs'
import { deriveApi } from '@/domain/derive/api'
import { deriveEstimate } from '@/domain/derive/estimate'
import { deriveCatalog } from '@/domain/derive/catalog'
import { useHistoryStore } from './history'

/** Patch d'attributs : toutes les clés d'attrs (frames + notes + fonctionnel), toutes optionnelles. */
export type AttrsPatch = Partial<
  PageNode['attrs'] &
    BlockNode['attrs'] &
    ModuleNode['attrs'] &
    BehaviorNote['attrs'] &
    ApiNote['attrs'] &
    FeatureNode['attrs']
>

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Clone profond d'un document. Le format ProjectDoc est JSON par contrat, donc un aller-retour
 * JSON est sûr — et évite les DataCloneError de `structuredClone` sur les proxies réactifs Vue.
 */
function cloneDoc<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export const useProjectStore = defineStore('project', () => {
  // ── État sérialisable ────────────────────────────────────────────────────
  const meta = ref<ProjectMeta>(createEmptyProject().meta)
  const site = ref<{ attrs: SiteAttrs }>({ attrs: { context: '', constraints: [], notes: '' } })
  const services = ref<Service[]>([])
  const nodes = ref<NodeIndex>(new Map())
  const edges = ref<FlooowEdge[]>([])

  // ── État dérivé / technique ──────────────────────────────────────────────
  const childrenIndex = ref<ChildrenIndex>(new Map())
  const attachedIndex = ref<AttachedIndex>(new Map())
  const graphVersion = ref(0)
  const dirty = ref(false)

  // ── Index ──────────────────────────────────────────────────────────────
  function rebuildIndexes(): void {
    const kids: ChildrenIndex = new Map()
    const attached: AttachedIndex = new Map()
    for (const node of nodes.value.values()) {
      const key = node.parentId
      const list = kids.get(key)
      if (list) list.push(node.id)
      else kids.set(key, [node.id])
      if (isNote(node)) {
        const alist = attached.get(node.attachedTo)
        if (alist) alist.push(node.id)
        else attached.set(node.attachedTo, [node.id])
      }
    }
    childrenIndex.value = kids
    attachedIndex.value = attached
  }

  /**
   * ids condamnés par la suppression de `rootId` :
   *   - descendants via parentId (blocs d'une page),
   *   - notes rattachées (attachedTo) à un élément condamné.
   * Parcours itératif (worklist) pour propager les cascades.
   */
  function cascadeIds(rootId: string): Set<string> {
    const doomed = new Set<string>()
    const work: string[] = [rootId]
    while (work.length) {
      const current = work.shift() as string
      if (doomed.has(current)) continue
      doomed.add(current)
      // Descendants via parentId (blocs d'une page).
      for (const k of childrenIndex.value.get(current) ?? []) work.push(k)
      // Notes rattachées à l'élément condamné.
      for (const node of nodes.value.values()) {
        if (isNote(node) && node.attachedTo === current) work.push(node.id)
      }
    }
    return doomed
  }

  // ── Sérialisation ────────────────────────────────────────────────────────
  function serialize(): ProjectDoc {
    return cloneDoc({
      meta: meta.value,
      site: { attrs: site.value.attrs },
      services: [...services.value],
      nodes: [...nodes.value.values()],
      edges: [...edges.value],
    }) as ProjectDoc
  }

  // ── Cœur transactionnel : mute + horodate + enregistre l'historique ───────
  function commit(mutate: () => void, coalesce?: string, label?: string): void {
    const before = serialize()
    mutate()
    meta.value.updatedAt = todayIso()
    graphVersion.value++
    dirty.value = true
    const after = serialize()
    useHistoryStore().record(before, after, coalesce, label)
  }

  /** Remplace l'état par un snapshot (undo/redo). Ne touche PAS l'historique. */
  function applySnapshot(doc: ProjectDoc): void {
    const clone = cloneDoc(doc)
    meta.value = clone.meta
    site.value = { attrs: clone.site.attrs }
    services.value = clone.services
    nodes.value = new Map(clone.nodes.map((n) => [n.id, n]))
    edges.value = clone.edges
    rebuildIndexes()
    graphVersion.value++
    dirty.value = true
  }

  // ── Chargement / cycle de vie ─────────────────────────────────────────────
  /** Charge un document validé (ouverture fichier / nouveau projet). Réinitialise l'historique. */
  function load(doc: ProjectDoc): void {
    const clone = cloneDoc(doc)
    meta.value = clone.meta
    site.value = { attrs: clone.site.attrs }
    services.value = clone.services
    nodes.value = new Map(clone.nodes.map((n) => [n.id, n]))
    edges.value = clone.edges
    rebuildIndexes()
    graphVersion.value++
    dirty.value = false
    useHistoryStore().reset()
  }

  /** Repart d'un projet vierge. */
  function reset(name?: string): void {
    load(createEmptyProject(name))
  }

  /** Marque l'état comme sauvegardé (appelé par io/file après écriture). */
  function markSaved(): void {
    dirty.value = false
  }

  // ── Actions : nœuds ────────────────────────────────────────────────────────
  function addPage(input: CreatePageInput = {}): string {
    const node = createPage(input)
    commit(() => {
      nodes.value.set(node.id, node)
      rebuildIndexes()
    }, undefined, 'Ajouter page')
    return node.id
  }

  /** Ajoute un bloc à une page. Position par défaut : en bas de la pile (y = n × pas). */
  function addBlock(
    pageId: string,
    blockType: BlockType = 'free',
    input: Omit<CreateBlockInput, 'parentId' | 'blockType'> = {},
  ): string {
    const count = orderedBlocksOf(pageId).length
    const node = createBlock({
      ...input,
      parentId: pageId,
      blockType,
      position: input.position ?? { x: 0, y: count * BLOCK_STEP },
    })
    commit(() => {
      nodes.value.set(node.id, node)
      rebuildIndexes()
    }, undefined, 'Ajouter bloc')
    return node.id
  }

  function addBehaviorNote(
    attachedTo: string,
    input: Omit<CreateBehaviorNoteInput, 'attachedTo'> = {},
  ): string {
    const node = createBehaviorNote({ ...input, attachedTo })
    commit(() => {
      nodes.value.set(node.id, node)
      rebuildIndexes()
    }, undefined, 'Ajouter note comportement')
    return node.id
  }

  function addApiNote(
    attachedTo: string,
    serviceId: string,
    endpoint: { method: string; path: string } = { method: '', path: '' },
    input: Omit<CreateApiNoteInput, 'attachedTo' | 'serviceId' | 'method' | 'path'> = {},
  ): string {
    const node = createApiNote({
      ...input,
      attachedTo,
      serviceId,
      method: endpoint.method,
      path: endpoint.path,
    })
    commit(() => {
      nodes.value.set(node.id, node)
      rebuildIndexes()
    }, undefined, 'Ajouter note API')
    return node.id
  }

  // ── Actions : couche fonctionnelle (module / fonctionnalité) ─────────────────
  /** Ajoute un module (frame racine de la couche fonctionnelle). */
  function addModule(input: CreateModuleInput = {}): string {
    const node = createModule(input)
    commit(() => {
      nodes.value.set(node.id, node)
      rebuildIndexes()
    }, undefined, 'Ajouter module')
    return node.id
  }

  /**
   * Ajoute une fonctionnalité. `parentId` = un module (ou null pour une fonctionnalité racine,
   * ex. socle/transverse). Position par défaut : décalée sous les fonctionnalités déjà présentes.
   */
  function addFeature(
    parentId: string | null = null,
    input: Omit<CreateFeatureInput, 'parentId'> = {},
  ): string {
    const siblings = (childrenIndex.value.get(parentId) ?? []).filter((cid) => {
      const c = nodes.value.get(cid)
      return c != null && c.type === 'feature'
    }).length
    // Empilement vertical dans le module : `position.y` = ordre (× pas), comme les blocs dans une
    // page. Coord relative au module quand il y en a un ; sinon monde (fonctionnalité racine).
    const node = createFeature({
      ...input,
      parentId,
      position: input.position ?? { x: 0, y: siblings * FEATURE_STEP },
    })
    commit(() => {
      nodes.value.set(node.id, node)
      rebuildIndexes()
    }, undefined, 'Ajouter fonctionnalité')
    return node.id
  }

  /**
   * Déplace une fonctionnalité vers un autre module (ou en racine, `newParentId = null`) à la
   * `position` donnée (relative au contenu du module cible, ou monde si racine). Met à jour les index.
   */
  function reparentFeature(id: string, newParentId: string | null, position: Position): void {
    const feat = nodes.value.get(id)
    if (!feat || !isFeature(feat)) return
    commit(() => {
      nodes.value.set(id, { ...feat, parentId: newParentId, position: { ...position } })
      rebuildIndexes()
    }, undefined, 'Déplacer fonctionnalité')
  }

  /**
   * Normalise un module après placement d'une fonctionnalité : si une carte a une position CONTENU
   * négative (posée à gauche/au-dessus de l'origine), on décale l'origine du module de ce minimum et
   * on retranche ce minimum à toutes les cartes → positions ramenées à `>= 0`, cartes INCHANGÉES à
   * l'écran, module « agrandi vers la gauche/le haut ». No-op si tout est déjà `>= 0`.
   */
  function normalizeModule(id: string, coalesce?: string): void {
    const mod = nodes.value.get(id)
    if (!mod || !isModule(mod)) return
    const kids = (childrenIndex.value.get(id) ?? [])
      .map((cid) => nodes.value.get(cid))
      .filter((n): n is FlooowNode => n != null && isFeature(n))
    if (!kids.length) return
    const minX = Math.min(...kids.map((k) => k.position.x))
    const minY = Math.min(...kids.map((k) => k.position.y))
    const dx = Math.min(0, minX)
    const dy = Math.min(0, minY)
    if (dx === 0 && dy === 0) return
    commit(
      () => {
        nodes.value.set(id, { ...mod, position: { x: mod.position.x + dx, y: mod.position.y + dy } })
        for (const k of kids) {
          nodes.value.set(k.id, { ...k, position: { x: k.position.x - dx, y: k.position.y - dy } })
        }
        rebuildIndexes()
      },
      coalesce,
      'Normaliser module',
    )
  }

  /**
   * Réorganise la couche fonctionnelle : réaligne les modules en une ligne propre (ordre gauche→
   * droite préservé), y = 0, espacés régulièrement. Résout les chevauchements après édition manuelle.
   */
  function arrangeFunctional(): void {
    const mods = [...nodes.value.values()]
      .filter(isModule)
      .sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y || (a.id < b.id ? -1 : 1))
    if (!mods.length) return
    commit(() => {
      mods.forEach((m, i) => {
        nodes.value.set(m.id, { ...m, position: { x: i * MODULE_COL_STEP, y: 0 } })
      })
    }, undefined, 'Réorganiser')
  }

  function updateAttrs(id: string, patch: AttrsPatch, coalesce?: string): void {
    const node = nodes.value.get(id)
    if (!node) return
    const nextAttrs = { ...node.attrs, ...patch }
    // No-op guard : ne pas créer d'entrée d'historique fantôme (attrs = JSON par contrat).
    if (JSON.stringify(node.attrs) === JSON.stringify(nextAttrs)) return
    commit(() => {
      const next = { ...node, attrs: nextAttrs } as FlooowNode
      nodes.value.set(id, next)
    }, coalesce)
  }

  function moveNode(id: string, position: Position, coalesce?: string): void {
    const node = nodes.value.get(id)
    if (!node) return
    commit(() => nodes.value.set(id, { ...node, position: { ...position } }), coalesce, 'Déplacer')
  }

  /** Réordonne un bloc dans sa page à l'index cible (reflow des y de la pile). */
  function reorderBlock(blockId: string, toIndex: number): void {
    const block = nodes.value.get(blockId)
    if (!block || !isBlock(block)) return
    const pageId = block.parentId
    const ordered = orderedBlocksOf(pageId)
    const from = ordered.findIndex((b) => b.id === blockId)
    if (from === -1) return
    const clamped = Math.max(0, Math.min(toIndex, ordered.length - 1))
    if (from === clamped) return
    const next = [...ordered]
    next.splice(clamped, 0, next.splice(from, 1)[0] as BlockNode)
    commit(() => {
      next.forEach((b, i) => {
        nodes.value.set(b.id, { ...b, position: { ...b.position, y: i * BLOCK_STEP } })
      })
    }, undefined, 'Réordonner bloc')
  }

  /** Déplace un bloc dans une autre page (reparent restreint aux pages). */
  function reparentBlock(blockId: string, pageId: string): void {
    const block = nodes.value.get(blockId)
    const page = nodes.value.get(pageId)
    if (!block || !isBlock(block) || !page || !isPage(page)) return
    commit(() => {
      const count = (childrenIndex.value.get(pageId) ?? []).filter((cid) => {
        const c = nodes.value.get(cid)
        return c != null && isBlock(c)
      }).length
      nodes.value.set(blockId, {
        ...block,
        parentId: pageId,
        position: { x: 0, y: count * BLOCK_STEP },
      })
      rebuildIndexes()
    }, undefined, 'Déplacer bloc')
  }

  /** Rattache une note à une autre cible (page ou bloc). */
  function attachNote(noteId: string, targetId: string): void {
    const note = nodes.value.get(noteId)
    if (!note || !isNote(note)) return
    commit(() => {
      nodes.value.set(noteId, { ...note, attachedTo: targetId } as NoteNode)
      rebuildIndexes()
    }, undefined, 'Rattacher note')
  }

  /** Change le type d'un bloc. */
  function setBlockType(blockId: string, blockType: BlockType): void {
    const block = nodes.value.get(blockId)
    if (!block || !isBlock(block)) return
    commit(() => {
      nodes.value.set(blockId, { ...block, attrs: { ...block.attrs, blockType } })
    }, undefined, 'Changer type de bloc')
  }

  /** Assigne un lot (null = ré-hériter). */
  function assignLot(id: string, lot: number | null): void {
    const node = nodes.value.get(id)
    if (!node) return
    commit(() => nodes.value.set(id, { ...node, lot }), undefined, 'Assigner lot')
  }

  /** Supprime un nœud + ses descendants (blocs) + notes rattachées + arêtes incidentes (cascade). */
  function removeNode(id: string): void {
    if (!nodes.value.has(id)) return
    commit(() => {
      const doomed = cascadeIds(id)
      for (const rid of doomed) nodes.value.delete(rid)
      edges.value = edges.value.filter((e) => !doomed.has(e.source) && !doomed.has(e.target))
      if (meta.value.homePageId && doomed.has(meta.value.homePageId)) meta.value.homePageId = null
      rebuildIndexes()
    }, undefined, 'Supprimer')
  }

  // ── Actions : arêtes ────────────────────────────────────────────────────────
  function addEdge(input: CreateEdgeInput): string {
    const edge = createEdge(input)
    commit(() => {
      edges.value = [...edges.value, edge]
    }, undefined, 'Relier')
    return edge.id
  }

  function removeEdge(id: string): void {
    if (!edges.value.some((e) => e.id === id)) return
    commit(() => {
      edges.value = edges.value.filter((e) => e.id !== id)
    }, undefined, 'Supprimer lien')
  }

  // ── Actions : pont « réalisé par » (cadrage-par-fonctionnalite.md §2) ────────
  /**
   * Relie une fonctionnalité (source) à une page/bloc (cible) qui la réalise. Refuse les extrémités
   * invalides (invariant REALIZES_TARGET) et les doublons. Renvoie l'id de l'arête, ou null.
   */
  function addRealizedBy(featureId: string, targetId: string): string | null {
    const feature = nodes.value.get(featureId)
    const target = nodes.value.get(targetId)
    if (!feature || !isFeature(feature)) return null
    if (!target || !(isPage(target) || isBlock(target))) return null
    if (realizationEdge(featureId, targetId, edges.value)) return null
    const edge = createEdge({ type: 'realizedBy', source: featureId, target: targetId })
    commit(() => {
      edges.value = [...edges.value, edge]
    }, undefined, 'Réalisé par')
    return edge.id
  }

  /** Retire le lien « réalisé par » entre une fonctionnalité et une cible. */
  function removeRealizedBy(featureId: string, targetId: string): void {
    const edge = realizationEdge(featureId, targetId, edges.value)
    if (!edge) return
    commit(() => {
      edges.value = edges.value.filter((e) => e.id !== edge.id)
    }, undefined, 'Retirer réalisé par')
  }

  function setEdgeType(id: string, type: EdgeType): void {
    const edge = edges.value.find((e) => e.id === id)
    if (!edge || edge.type === type) return
    commit(() => {
      edges.value = edges.value.map((e) => (e.id === id ? { ...e, type } : e))
    }, undefined, 'Changer type de lien')
  }

  // ── Actions : mode de rendu d'arête (evolution-v2.md §8, révisé) ──────────────
  /**
   * Fixe le mode de rendu d'une arête ('line' = trait continu, 'portal' = pastilles off-page).
   * Purement visuel : n'affecte ni le comptage ni l'arborescence dérivée. 'line' retire la clé.
   */
  /** Applique un mode de rendu à une arête (attrs.render). `manual` pose le verrou renderManual. */
  function applyRender(
    e: FlooowEdge,
    mode: EdgeRender,
    initPositions?: { source: Position; target: Position },
    manual = false,
  ): FlooowEdge {
    const attrs = { ...e.attrs }
    if (mode === 'line') delete attrs.render
    else {
      attrs.render = mode
      // Auto-placement des pastilles à la conversion, si le géomètre (canvas) en fournit.
      if (!attrs.portalPositions && initPositions) {
        attrs.portalPositions = {
          source: { ...initPositions.source },
          target: { ...initPositions.target },
        }
      }
    }
    if (manual) attrs.renderManual = true
    return { ...e, attrs }
  }

  function setEdgeRender(
    edgeId: string,
    mode: EdgeRender,
    initPositions?: { source: Position; target: Position },
    manual = false,
  ): void {
    const edge = edges.value.find((e) => e.id === edgeId)
    if (!edge) return
    const current = edge.attrs.render ?? 'line'
    if (current === mode && (!manual || edge.attrs.renderManual)) return
    commit(() => {
      edges.value = edges.value.map((e) =>
        e.id === edgeId ? applyRender(e, mode, initPositions, manual) : e,
      )
    }, undefined, 'Mode de rendu')
  }

  /** Bascule MANUELLE ligne↔portail : pose le verrou renderManual (l'auto ne réécrira plus). */
  function toggleEdgeRender(
    edgeId: string,
    initPositions?: { source: Position; target: Position },
  ): void {
    const edge = edges.value.find((e) => e.id === edgeId)
    if (!edge) return
    setEdgeRender(
      edgeId,
      (edge.attrs.render ?? 'line') === 'portal' ? 'line' : 'portal',
      initPositions,
      true,
    )
  }

  /**
   * Ré-évaluation AUTOMATIQUE (création / déplacement) : applique en UN commit les modes calculés
   * par le canvas, en IGNORANT les arêtes verrouillées (renderManual) et celles déjà au bon mode.
   */
  function autoSetRenders(
    updates: {
      edgeId: string
      mode: EdgeRender
      initPositions?: { source: Position; target: Position }
    }[],
  ): void {
    const byId = new Map(updates.map((u) => [u.edgeId, u]))
    let changed = false
    const next = edges.value.map((e) => {
      const u = byId.get(e.id)
      if (!u || e.attrs.renderManual) return e
      if ((e.attrs.render ?? 'line') === u.mode) return e
      changed = true
      return applyRender(e, u.mode, u.initPositions, false)
    })
    if (!changed) return
    commit(() => {
      edges.value = next
    }, undefined, 'Portails auto')
  }

  /**
   * Place l'un des deux nœuds portail d'une arête (au drop d'un drag). `fallback` sème l'autre
   * extrémité si `portalPositions` était absent (fichier sans positions) — le canvas fournit le
   * défaut géométrique ; à défaut, l'autre bout part de `pos`.
   */
  function setPortalPosition(
    edgeId: string,
    end: 'source' | 'target',
    pos: Position,
    fallback?: { source: Position; target: Position },
  ): void {
    const edge = edges.value.find((e) => e.id === edgeId)
    if (!edge) return
    const seed = edge.attrs.portalPositions ??
      fallback ?? { source: { ...pos }, target: { ...pos } }
    const next = {
      source: { ...seed.source },
      target: { ...seed.target },
    }
    next[end] = { x: pos.x, y: pos.y }
    commit(() => {
      edges.value = edges.value.map((e) =>
        e.id === edgeId ? { ...e, attrs: { ...e.attrs, portalPositions: next } } : e,
      )
    }, undefined, 'Placer portail')
  }


  // ── Actions : services (registre) ────────────────────────────────────────────
  function addService(input: CreateServiceInput = {}): string {
    const svc = createService(input)
    commit(() => {
      services.value = [...services.value, svc]
    }, undefined, 'Ajouter service')
    return svc.id
  }

  function updateService(id: string, patch: Partial<Omit<Service, 'id'>>): void {
    const svc = services.value.find((s) => s.id === id)
    if (!svc) return
    const next = { ...svc, ...patch }
    if (JSON.stringify(svc) === JSON.stringify(next)) return
    commit(() => {
      services.value = services.value.map((s) => (s.id === id ? next : s))
    }, undefined, 'Modifier service')
  }

  function removeService(id: string): void {
    if (!services.value.some((s) => s.id === id)) return
    commit(() => {
      services.value = services.value.filter((s) => s.id !== id)
    }, undefined, 'Supprimer service')
  }

  // ── Actions : méta ────────────────────────────────────────────────────────
  function setHomePage(id: string | null): void {
    commit(() => {
      meta.value.homePageId = id
    }, undefined, 'Page d’accueil')
  }

  function updateMeta(patch: Partial<Omit<ProjectMeta, 'formatVersion'>>): void {
    commit(() => {
      meta.value = { ...meta.value, ...patch, formatVersion: CURRENT_FORMAT_VERSION }
    }, 'meta', 'Métadonnées')
  }

  /** Édite le contexte transversal du site (description, contraintes globales, notes). */
  function updateSite(patch: Partial<SiteAttrs>): void {
    const next = { ...site.value.attrs, ...patch }
    if (JSON.stringify(site.value.attrs) === JSON.stringify(next)) return
    commit(() => {
      site.value = { attrs: next }
    }, 'site', 'Contexte projet')
  }

  // ── Getters de base ────────────────────────────────────────────────────────
  const allNodes = computed<FlooowNode[]>(() => [...nodes.value.values()])
  const pages = computed<PageNode[]>(() => allNodes.value.filter(isPage))
  const blocks = computed<BlockNode[]>(() => allNodes.value.filter(isBlock))
  const modules = computed<ModuleNode[]>(() => allNodes.value.filter(isModule))
  const features = computed<FeatureNode[]>(() => allNodes.value.filter(isFeature))
  const behaviorNotes = computed<BehaviorNote[]>(() => allNodes.value.filter(isBehaviorNote))
  const apiNotes = computed<ApiNote[]>(() => allNodes.value.filter(isApiNote))
  const notes = computed<NoteNode[]>(() => allNodes.value.filter(isNote))
  const doc = computed<ProjectDoc>(() => serialize())

  function nodeById(id: string): FlooowNode | undefined {
    return nodes.value.get(id)
  }

  function serviceById(id: string): Service | undefined {
    return services.value.find((s) => s.id === id)
  }

  function childrenOf(parentId: string | null): FlooowNode[] {
    const ids = childrenIndex.value.get(parentId) ?? []
    return ids.map((cid) => nodes.value.get(cid)).filter((n): n is FlooowNode => n != null)
  }

  // ── Getters délégués au domaine ───────────────────────────────────────────
  const orderedPages = computed<PageNode[]>(() => spatialOrder(pages.value))
  const orphans = computed<Set<string>>(() => orphanPages(doc.value))
  const apiView = computed(() => deriveApi(doc.value))
  const catalog = computed(() => deriveCatalog(doc.value))
  const estimate = computed(() => deriveEstimate(doc.value))
  const violations = computed(() => checkInvariants(doc.value))

  /** Blocs d'une page, ordonnés en pile (position.y). */
  function orderedBlocksOf(pageId: string | null): BlockNode[] {
    const kids = childrenOf(pageId).filter(isBlock)
    return verticalOrder(kids)
  }

  /** Notes rattachées à une cible, ordonnées verticalement. */
  function notesOf(targetId: string): NoteNode[] {
    return verticalOrder(attachedNotes(targetId, nodes.value))
  }

  /** Pages/blocs qui réalisent une fonctionnalité (pont realizedBy). */
  function realizersOfFeature(featureId: string): RealizationTarget[] {
    return realizersOf(featureId, edges.value, nodes.value)
  }

  /** Fonctionnalités réalisées par une page ou un bloc (pont realizedBy). */
  function featuresOfTarget(targetId: string): FeatureNode[] {
    return featuresRealizedBy(targetId, edges.value, nodes.value)
  }

  /** Couverture (réconciliation continue) : fonctionnalités orphelines + pages sans fonctionnalité. */
  const realizationCoverage = computed(() => coverage(doc.value))

  function lotOf(id: string): number {
    return resolveLot(id, nodes.value)
  }

  function lotProvenanceOf(id: string): ReturnType<typeof resolveLotProvenance> {
    return resolveLotProvenance(id, nodes.value)
  }

  function descendantsOf(frameId: string): FlooowNode[] {
    return descendants(frameId, childrenIndex.value, nodes.value)
  }

  function completenessOf(id: string): ReturnType<typeof completeness> {
    const node = nodes.value.get(id)
    if (!node) return { missing: [], complete: true }
    return completeness(node)
  }

  function specs(filter?: SpecsFilter): ReturnType<typeof deriveSpecs> {
    return deriveSpecs(doc.value, filter)
  }

  // Initialise sur un projet vierge.
  reset()

  return {
    // état
    meta,
    site,
    services,
    nodes,
    edges,
    childrenIndex,
    attachedIndex,
    graphVersion,
    dirty,
    // getters de base
    allNodes,
    pages,
    blocks,
    modules,
    features,
    behaviorNotes,
    apiNotes,
    notes,
    doc,
    nodeById,
    serviceById,
    childrenOf,
    // getters domaine
    orderedPages,
    orphans,
    apiView,
    catalog,
    estimate,
    violations,
    orderedBlocksOf,
    notesOf,
    realizersOfFeature,
    featuresOfTarget,
    realizationCoverage,
    lotOf,
    lotProvenanceOf,
    descendantsOf,
    completenessOf,
    specs,
    // cycle de vie
    serialize,
    load,
    applySnapshot,
    reset,
    markSaved,
    // mutations : nœuds
    addPage,
    addBlock,
    addModule,
    addFeature,
    reparentFeature,
    normalizeModule,
    arrangeFunctional,
    addBehaviorNote,
    addApiNote,
    updateAttrs,
    moveNode,
    reorderBlock,
    reparentBlock,
    attachNote,
    setBlockType,
    assignLot,
    removeNode,
    // mutations : arêtes
    addEdge,
    removeEdge,
    addRealizedBy,
    removeRealizedBy,
    setEdgeType,
    setEdgeRender,
    toggleEdgeRender,
    autoSetRenders,
    setPortalPosition,
    // mutations : services
    addService,
    updateService,
    removeService,
    // mutations : méta
    setHomePage,
    updateMeta,
    updateSite,
  }
})

/**
 * Id de sélection réservé pour le « Site » (contexte transversal). Le site n'est pas un nœud du
 * graphe : cette sentinelle permet de le sélectionner (ui.select) pour l'éditer dans le panneau de
 * propriétés, exactement comme une page ou un bloc.
 */
export const SITE_SELECTION_ID = '__site__'
