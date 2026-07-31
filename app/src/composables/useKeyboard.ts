// Raccourcis clavier globaux + état partagé du « shell » (outil actif, panneaux repliés).
// Table de référence : cadrage/05-implementation/interface.md §Raccourcis.
//
// Ce module héberge aussi le petit état d'UI transverse qui n'appartient pas au store `ui`
// (outil de création courant, série ⇧, repli du panneau de propriétés). Il est exposé via
// des singletons réactifs pour être partagé entre ToolDock, PropertiesPanel et les raccourcis.
import { reactive } from 'vue'
import { useUiStore } from '@/stores/ui'
import { useProjectStore } from '@/stores/project'
import { useHistoryStore } from '@/stores/history'
import { useFileActions } from '@/composables/useFileActions'
import { isBlock, isFrame, isNote, isPage } from '@/model/types'
import type { CanvasLayer, FlooowNode, Position } from '@/model/types'

// ── Outils de création v2 (partagé ToolDock ↔ clavier ↔ canvas) ────────────────
// Modèle v2 : pages + blocs (frames), notes comportement/API (flottantes rattachées),
// liens de navigation. Le service n'a PAS d'outil — il se crée depuis la note API.

export type ToolId =
  | 'select'
  | 'page'
  | 'block'
  | 'behavior'
  | 'api'
  | 'link'
  | 'module'
  | 'feature'

export interface ToolDef {
  id: ToolId
  label: string
  /** touche mono-caractère (minuscule). */
  key: string
  /** couche où l'outil est proposé (`'both'` = les deux). */
  layer: CanvasLayer | 'both'
}

export const TOOLS: ToolDef[] = [
  { id: 'select', label: 'Sélection', key: 'v', layer: 'both' },
  { id: 'page', label: 'Page', key: 'p', layer: 'structural' },
  { id: 'block', label: 'Bloc', key: 'b', layer: 'structural' },
  { id: 'behavior', label: 'Note comportement', key: 'n', layer: 'structural' },
  { id: 'api', label: 'Note API', key: 'a', layer: 'structural' },
  { id: 'module', label: 'Module', key: 'm', layer: 'functional' },
  { id: 'feature', label: 'Fonctionnalité', key: 'f', layer: 'functional' },
  { id: 'link', label: 'Lien', key: 'l', layer: 'both' },
]

/** Outils proposés dans une couche donnée (palette + raccourcis). */
export function toolsForLayer(layer: CanvasLayer): ToolDef[] {
  return TOOLS.filter((t) => t.layer === 'both' || t.layer === layer)
}

const toolState = reactive<{ active: ToolId; sticky: boolean }>({
  active: 'select',
  sticky: false,
})

/** État réactif partagé de l'outil courant. */
export function useTool(): typeof toolState {
  return toolState
}

const panelState = reactive<{ propertiesCollapsed: boolean }>({
  propertiesCollapsed: false,
})

/** État réactif partagé des panneaux repliables. */
export function usePanelState(): typeof panelState {
  return panelState
}

/** Cascade de position (coords ABSOLUES) pour les créations top-level depuis le dock/clavier. */
function nextPosition(count: number): Position {
  const step = 48
  return { x: 120 + (count % 8) * step, y: 120 + (count % 8) * step }
}

/**
 * Remonte jusqu'à la page qui doit accueillir un bloc, à partir d'un nœud de contexte :
 * page → elle-même ; bloc → sa page (parentId) ; note → sa cible puis la page de la cible.
 */
function pageContextFrom(project: ReturnType<typeof useProjectStore>, node: FlooowNode): string | null {
  if (isPage(node)) return node.id
  if (isBlock(node)) return node.parentId
  if (isNote(node)) {
    const target = project.nodeById(node.attachedTo)
    return target ? pageContextFrom(project, target) : null
  }
  return null
}

/**
 * Cible de rattachement (page ou bloc) pour une nouvelle note, à partir du contexte :
 * une frame se rattache elle-même ; une note partage la cible de la note sélectionnée.
 */
function frameTargetFrom(node: FlooowNode): string | null {
  if (isFrame(node)) return node.id
  if (isNote(node)) return node.attachedTo
  return null
}

/**
 * Position ABSOLUE proche d'une cible (les notes sont top-level : `parentId=null`, donc
 * positionnées en coordonnées monde). On décale à droite de la cible ; pour un bloc on
 * compose avec la position de sa page (le bloc est stocké en coords relatives à la page).
 */
function absoluteNear(project: ReturnType<typeof useProjectStore>, targetId: string, fallback: number): Position {
  const target = project.nodeById(targetId)
  if (!target) return nextPosition(fallback)
  if (isPage(target)) return { x: target.position.x + 360, y: target.position.y }
  if (isBlock(target)) {
    const page = target.parentId ? project.nodeById(target.parentId) : undefined
    const base = page ? page.position : { x: 0, y: 0 }
    return { x: base.x + target.position.x + 360, y: base.y + target.position.y }
  }
  return { x: target.position.x + 40, y: target.position.y + 40 }
}

/**
 * Active un outil. Pour les outils de création, crée immédiatement le nœud correspondant,
 * le sélectionne, puis retourne à l'outil « sélection » — sauf en mode série (⇧ / sticky),
 * exactement comme Figma. `select` et `link` ne font que changer l'outil actif.
 *
 * Rattachement à la sélection (evolution-v2.md §2) :
 *  - Bloc : rejoint la page du nœud sélectionné (le store empile en bas via `position.y`).
 *  - Note comportement / API : se rattache à la frame sélectionnée (ou à la cible de la note
 *    sélectionnée), sinon à la première page. Sans page disponible, l'outil est inopérant.
 *  - Note API : créée avec un service vide — l'utilisateur choisit/crée le service et l'endpoint
 *    dans le panneau de propriétés (autocomplétion depuis `doc.services`).
 */
export function runTool(tool: ToolId, opts: { sticky?: boolean } = {}): void {
  const sticky = opts.sticky ?? false
  const project = useProjectStore()
  const ui = useUiStore()

  // Outils passifs : on ne fait qu'activer l'outil. `select`/`link` classiques ; `module`/`feature`
  // sont des outils de PLACEMENT (on pose le nœud au clic sur le canvas, cf. useCanvasSync.onPaneClick).
  if (tool === 'select' || tool === 'link' || tool === 'module' || tool === 'feature') {
    toolState.active = tool
    toolState.sticky = tool === 'select' ? false : (opts.sticky ?? false)
    return
  }

  const sel = ui.selectedId ? project.nodeById(ui.selectedId) : undefined

  let id: string | undefined
  if (tool === 'page') {
    id = project.addPage({ position: nextPosition(project.pages.length) })
  } else if (tool === 'block') {
    const pageId = (sel && pageContextFrom(project, sel)) ?? project.pages[0]?.id ?? null
    if (pageId) id = project.addBlock(pageId, 'free')
  } else if (tool === 'behavior') {
    const targetId = (sel && frameTargetFrom(sel)) ?? project.pages[0]?.id ?? null
    if (targetId) {
      id = project.addBehaviorNote(targetId, {
        position: absoluteNear(project, targetId, project.behaviorNotes.length),
      })
    }
  } else if (tool === 'api') {
    const targetId = (sel && frameTargetFrom(sel)) ?? project.pages[0]?.id ?? null
    if (targetId) {
      id = project.addApiNote(
        targetId,
        '',
        { method: '', path: '' },
        { position: absoluteNear(project, targetId, project.apiNotes.length) },
      )
    }
  }

  if (id) ui.select(id)
  toolState.active = sticky ? tool : 'select'
  toolState.sticky = sticky
}

// ── Raccourcis globaux ────────────────────────────────────────────────────────

export interface KeyboardOptions {
  /** cible d'écoute (défaut : window). */
  target?: Window | HTMLElement
}

/** Le focus est-il dans un champ de saisie (où les raccourcis mono-touche sont désactivés) ? */
function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

/**
 * Installe les raccourcis globaux ; renvoie une fonction de nettoyage.
 * Les raccourcis mono-touche sont ignorés quand le focus est dans un champ ; les combinaisons
 * ⌘/Ctrl et Échap restent actives partout (conventions d'édition).
 */
export function useKeyboard(options: KeyboardOptions = {}): () => void {
  const target: Window | HTMLElement = options.target ?? window

  function onKeydown(event: KeyboardEvent): void {
    const ui = useUiStore()
    const project = useProjectStore()
    const history = useHistoryStore()

    const meta = event.metaKey || event.ctrlKey
    const inField = isEditableTarget(event.target)

    // ── Combinaisons ⌘/Ctrl (actives même dans les champs) ────────────────────
    if (meta) {
      const k = event.key.toLowerCase()
      if (k === 'z') {
        event.preventDefault()
        if (event.shiftKey) history.redo()
        else history.undo()
        return
      }
      if (k === 'y') {
        event.preventDefault()
        history.redo()
        return
      }
      if (k === 's') {
        event.preventDefault()
        const files = useFileActions()
        void (event.shiftKey ? files.saveAs() : files.save())
        return
      }
      if (k === 'o') {
        event.preventDefault()
        void useFileActions().open()
        return
      }
      if (k === 'k') {
        event.preventDefault()
        ui.togglePanel('search', true)
        return
      }
      return
    }

    // ── Échap (actif partout) ─────────────────────────────────────────────────
    if (event.key === 'Escape') {
      if (inField) {
        ;(event.target as HTMLElement).blur()
        return
      }
      if (ui.openPanels.search) {
        ui.togglePanel('search', false)
        return
      }
      if (toolState.active !== 'select') {
        toolState.active = 'select'
        toolState.sticky = false
        return
      }
      ui.clearSelection()
      return
    }

    // Au-delà, tout est désactivé dans les champs de saisie.
    if (inField) return

    // ── Modes & zoom (chiffres, via event.code pour ignorer les layouts) ──────
    if (event.code === 'Digit1' || event.code === 'Numpad1') {
      event.preventDefault()
      if (event.shiftKey) window.dispatchEvent(new CustomEvent('flooow:zoom-fit'))
      else ui.setMode('canvas')
      return
    }
    if (event.code === 'Digit2' || event.code === 'Numpad2') {
      ui.setMode('specs')
      return
    }
    if (event.code === 'Digit3' || event.code === 'Numpad3') {
      ui.setMode('api')
      return
    }
    if (event.code === 'Digit4' || event.code === 'Numpad4') {
      ui.setMode('catalog')
      return
    }

    // ── Suppression de la sélection ───────────────────────────────────────────
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      const ids = ui.selectedIds
      if (ids.length === 0) return
      // Confirmation si une frame supprimée emporte des enfants (cascade).
      const withChildren = ids.filter((id) => project.descendantsOf(id).length > 0)
      if (withChildren.length > 0) {
        const total = withChildren.reduce((n, id) => n + project.descendantsOf(id).length, 0)
        const ok = window.confirm(
          `Supprimer ${ids.length} élément(s) et ${total} enfant(s) en cascade ?`,
        )
        if (!ok) return
      }
      for (const id of ids) project.removeNode(id)
      ui.clearSelection()
      return
    }

    // ── Repli du panneau de propriétés (⌥.) ───────────────────────────────────
    if (event.altKey && (event.key === '.' || event.code === 'Period')) {
      event.preventDefault()
      panelState.propertiesCollapsed = !panelState.propertiesCollapsed
      return
    }

    // ── Bascule minimap (⇧M) ──────────────────────────────────────────────────
    if (event.shiftKey && event.key.toLowerCase() === 'm') {
      event.preventDefault()
      window.dispatchEvent(new CustomEvent('flooow:toggle-minimap'))
      return
    }

    // ── Outils (selon la couche active) ───────────────────────────────────────
    if (ui.mode === 'canvas' && !event.altKey) {
      const tool = toolsForLayer(ui.canvasLayer).find((t) => t.key === event.key.toLowerCase())
      if (tool) {
        event.preventDefault()
        runTool(tool.id, { sticky: event.shiftKey })
        return
      }
    }
  }

  target.addEventListener('keydown', onKeydown as EventListener)
  return () => target.removeEventListener('keydown', onKeydown as EventListener)
}
