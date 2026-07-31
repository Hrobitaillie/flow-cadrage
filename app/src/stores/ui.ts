// État d'interface (non sérialisé dans le projet) : mode, sélection, panneaux, filtres, zoom.
// Voir architecture.md §Modes applicatifs.
import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { CanvasLayer, Facet, NoteKind } from '@/model/types'

export type AppMode = 'canvas' | 'specs' | 'api' | 'catalog'

export type PanelId =
  | 'modeSwitcher'
  | 'toolDock'
  | 'properties'
  | 'filterBar'
  | 'statusChip'
  | 'zoomBar'
  | 'search'

export interface FocusRequest {
  nodeId: string
  /** jeton incrémental : permet de re-déclencher un focus sur le même nœud. */
  token: number
}

const DEFAULT_PANELS: Record<PanelId, boolean> = {
  modeSwitcher: true,
  toolDock: true,
  properties: true,
  filterBar: true,
  statusChip: true,
  zoomBar: true,
  search: false,
}

export const useUiStore = defineStore('ui', () => {
  const mode = ref<AppMode>('canvas')
  /**
   * Couche active du canvas (decisions.md §15). Orthogonale à `mode` (canvas/specs/api) :
   * en `structural` on travaille pages/blocs/notes, en `functional` modules/fonctionnalités.
   * L'autre couche est complètement masquée. Défaut `structural` (comportement historique).
   */
  const canvasLayer = ref<CanvasLayer>('structural')
  /**
   * Couche fonctionnelle : comment rendre les liens « dépend de ».
   *  - `background` : tracés lignes DERRIÈRE les cartes → les longs liens inter-modules passent
   *    derrière les fonctionnalités (opaques), visibles seulement dans les gouttières.
   *  - `portal` : les liens LONGS deviennent des pastilles « portail » (aucun long tracé) ; les
   *    liens courts restent des lignes au premier plan.
   */
  const funcEdgeMode = ref<'background' | 'portal'>('background')
  const selection = ref<Set<string>>(new Set())
  /**
   * Nœud en cours d'ÉDITION dans l'éditeur plein hauteur (fonctionnalité). Découplé de la sélection :
   * sélectionner une carte ne l'ouvre plus ; l'utilisateur clique « Éditer » sur la carte (openEditor).
   */
  const editorNodeId = ref<string | null>(null)
  const openPanels = ref<Record<PanelId, boolean>>({ ...DEFAULT_PANELS })
  const facetFilter = ref<Facet | null>(null)
  const lotFilter = ref<number | null>(null)
  /** Filtre type de note : les notes hors-type tombent en opacité réduite (evolution-v2.md §2). */
  const noteFilter = ref<NoteKind | null>(null)
  const zoom = ref(1)
  const focusRequest = ref<FocusRequest | null>(null)

  let focusToken = 0

  const selectedIds = computed<string[]>(() => [...selection.value])
  const selectedId = computed<string | null>(() => selectedIds.value[0] ?? null)
  const hasSelection = computed(() => selection.value.size > 0)

  function setMode(next: AppMode): void {
    mode.value = next
  }

  /**
   * Bascule la couche active du canvas. La sélection courante appartient à l'ancienne couche
   * (masquée après bascule) : on la vide pour éviter une sélection invisible. Repasse en vue canvas.
   */
  function setCanvasLayer(layer: CanvasLayer): void {
    if (canvasLayer.value === layer) return
    canvasLayer.value = layer
    selection.value = new Set()
    editorNodeId.value = null // l'éditeur appartient à la couche fonctionnelle : on le ferme
    mode.value = 'canvas'
  }

  /** Ouvre l'éditeur plein hauteur sur un nœud (déclenché par « Éditer » sur la carte). */
  function openEditor(id: string): void {
    editorNodeId.value = id
  }
  /** Ferme l'éditeur plein hauteur (bouton de fermeture). N'affecte pas la sélection. */
  function closeEditor(): void {
    editorNodeId.value = null
  }

  // Clic ailleurs = fermeture : dès que le nœud en cours d'édition n'est plus sélectionné
  // (canvas vide ou autre carte cliquée), on referme l'éditeur.
  watch(selection, (sel) => {
    if (editorNodeId.value && !sel.has(editorNodeId.value)) editorNodeId.value = null
  })

  function setFuncEdgeMode(m: 'background' | 'portal'): void {
    funcEdgeMode.value = m
  }

  /** Sélectionne un nœud ; `additive` pour la multi-sélection (⇧/⌘-clic). */
  function select(id: string, additive = false): void {
    if (additive) {
      const next = new Set(selection.value)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      selection.value = next
    } else {
      selection.value = new Set([id])
    }
  }

  function setSelection(ids: Iterable<string>): void {
    selection.value = new Set(ids)
  }

  function clearSelection(): void {
    selection.value = new Set()
  }

  function isSelected(id: string): boolean {
    return selection.value.has(id)
  }

  function togglePanel(panel: PanelId, open?: boolean): void {
    openPanels.value = {
      ...openPanels.value,
      [panel]: open ?? !openPanels.value[panel],
    }
  }

  function setFacetFilter(facet: Facet | null): void {
    facetFilter.value = facet
  }

  function setLotFilter(lot: number | null): void {
    lotFilter.value = lot
  }

  function setNoteFilter(kind: NoteKind | null): void {
    noteFilter.value = kind
  }

  function setZoom(z: number): void {
    zoom.value = z
  }

  /** Demande au canvas de centrer/sélectionner un nœud (consommé par FlowCanvas via watch). */
  function focusNode(nodeId: string): void {
    focusToken += 1
    focusRequest.value = { nodeId, token: focusToken }
    select(nodeId)
    mode.value = 'canvas'
  }

  return {
    mode,
    canvasLayer,
    funcEdgeMode,
    selection,
    editorNodeId,
    openPanels,
    facetFilter,
    lotFilter,
    noteFilter,
    zoom,
    focusRequest,
    selectedIds,
    selectedId,
    hasSelection,
    setMode,
    setCanvasLayer,
    openEditor,
    closeEditor,
    setFuncEdgeMode,
    select,
    setSelection,
    clearSelection,
    isSelected,
    togglePanel,
    setFacetFilter,
    setLotFilter,
    setNoteFilter,
    setZoom,
    focusNode,
  }
})
