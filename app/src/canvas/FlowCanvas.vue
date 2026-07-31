<script setup lang="ts">
// Instance Vue Flow : le canvas plein écran (format v2). Le graphe du store est **mappé** vers des
// nœuds/arêtes Vue Flow par useCanvasSync (mutation du store au drop/connect uniquement). Les menus
// contextuels (quick-create, clic droit, popover d'arête) sont rendus en overlay écran.
import { provide, ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { VueFlow, useVueFlow, SelectionMode, ConnectionMode, type GraphNode } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import { useCanvasSync, ORDER_BADGE_KEY, EDGE_MENU_KEY } from './useCanvasSync'
import PageFrame from './nodes/PageFrame.vue'
import BlockNode from './nodes/BlockNode.vue'
import NoteCard from './nodes/NoteCard.vue'
import PortalNode from './nodes/PortalNode.vue'
import ModuleFrame from './nodes/ModuleFrame.vue'
import FeatureNode from './nodes/FeatureNode.vue'
import TypedEdge from './edges/TypedEdge.vue'
import ProximityConnector from './connectors/ProximityConnector.vue'
import QuickCreateMenu from './QuickCreateMenu.vue'
import ContextMenu from './ContextMenu.vue'
import EdgeTypePopover from './EdgeTypePopover.vue'

import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'

const vf = useVueFlow()
const sync = useCanvasSync()

// Lignes de magnétisme (monde → écran via le viewport) affichées pendant le drag d'une page.
const guideLines = computed(() => {
  const { x: vx, y: vy, zoom } = vf.viewport.value
  return {
    v: sync.snapGuides.value.v.map((wx) => wx * zoom + vx),
    h: sync.snapGuides.value.h.map((wy) => wy * zoom + vy),
  }
})

// Fantôme d'emplacement (monde → écran) pendant le drag d'une fonctionnalité : rectangle pointillé
// violet animé posé sur l'emplacement magnétisé prédit.
const ghostRect = computed(() => {
  const g = sync.dragGhost.value
  if (!g) return null
  const { x: vx, y: vy, zoom } = vf.viewport.value
  return { x: g.x * zoom + vx, y: g.y * zoom + vy, w: g.w * zoom, h: g.h * zoom }
})

// Badges d'ordre « #n » live pendant le drag d'un bloc, lus par BlockNode.
provide(ORDER_BADGE_KEY, sync.orderBadges)
// Ouverture du popover d'arête depuis une pastille portail (clic droit).
provide(EDGE_MENU_KEY, sync.openEdgeMenu)

/** Double-clic sur le fond = créer une page à cet endroit. */
function onPaneDblClick(event: MouseEvent): void {
  const target = event.target as HTMLElement | null
  if (target?.closest('.vue-flow__node')) return
  const rect = vf.vueFlowRef.value?.getBoundingClientRect()
  if (!rect) return
  const pos = vf.project({ x: event.clientX - rect.left, y: event.clientY - rect.top })
  sync.createPageAt(pos)
}

/** Suppression au clavier avec confirmation en cascade (garde-fou : champ de saisie exclu). */
function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Delete' && event.key !== 'Backspace') return
  const el = event.target as HTMLElement | null
  const tag = el?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable) return
  event.preventDefault()
  sync.deleteSelection()
}

function miniMapColor(node: GraphNode): string {
  const data = node.data as { lotColor?: string } | undefined
  return data?.lotColor ?? '#94a3b8'
}

// Retour visuel : Espace maintenu = mode déplacement (grab). Vue Flow gère le pan lui-même
// (panActivationKeyCode='Space') ; on ne fait qu'ajouter la classe de curseur, sans preventDefault
// et sans réagir quand le focus est dans un champ de saisie.
const spaceHeld = ref(false)
function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
}
function onSpaceDown(e: KeyboardEvent): void {
  if (e.code === 'Space' && !isEditable(e.target)) spaceHeld.value = true
}
function onSpaceUp(e: KeyboardEvent): void {
  if (e.code === 'Space') spaceHeld.value = false
}
// Recadrage (ZoomBar « fit », ⇧1, action « Réorganiser ») : centre et ajuste le zoom sur le contenu.
function onZoomFit(): void {
  void vf.fitView({ padding: 0.2, duration: 300, maxZoom: 1.1 })
}
onMounted(() => {
  window.addEventListener('keydown', onSpaceDown)
  window.addEventListener('keyup', onSpaceUp)
  window.addEventListener('flooow:zoom-fit', onZoomFit)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onSpaceDown)
  window.removeEventListener('keyup', onSpaceUp)
  window.removeEventListener('flooow:zoom-fit', onZoomFit)
})
</script>

<template>
  <div
    class="flooow-canvas h-full w-full outline-none"
    :class="{ 'space-pan': spaceHeld }"
    tabindex="0"
    @keydown="onKeydown"
  >
    <VueFlow
      :delete-key-code="null"
      :multi-selection-key-code="'Shift'"
      :min-zoom="0.1"
      :max-zoom="4"
      :connection-radius="60"
      :connection-mode="ConnectionMode.Loose"
      :default-viewport="{ x: 40, y: 40, zoom: 1 }"
      :pan-on-drag="false"
      :selection-key-code="true"
      :selection-mode="SelectionMode.Partial"
      :pan-activation-key-code="'Space'"
      :pan-on-scroll="true"
      :zoom-on-scroll="false"
      :zoom-on-double-click="false"
      @dblclick="onPaneDblClick"
    >
      <template #node-page="props">
        <PageFrame v-bind="props" />
      </template>
      <template #node-block="props">
        <BlockNode v-bind="props" />
      </template>
      <template #node-note="props">
        <NoteCard v-bind="props" />
      </template>
      <template #node-portal="props">
        <PortalNode v-bind="props" />
      </template>
      <template #node-module="props">
        <ModuleFrame v-bind="props" />
      </template>
      <template #node-feature="props">
        <FeatureNode v-bind="props" />
      </template>
      <template #edge-typed="props">
        <TypedEdge v-bind="props" />
      </template>
      <template #edge-attach="props">
        <ProximityConnector v-bind="props" />
      </template>
      <template #edge-portalTie="props">
        <ProximityConnector v-bind="props" />
      </template>

      <Background color="#cbd5e1" :gap="24" :size="1.4" />
      <MiniMap pannable zoomable :node-color="miniMapColor" mask-color="rgba(241, 245, 249, 0.7)" />
      <Controls />

      <!-- Guides de magnétisme (alignement des pages) pendant le drag -->
      <svg class="snap-guides" aria-hidden="true">
        <line v-for="(sx, i) in guideLines.v" :key="`v${i}`" :x1="sx" y1="0" :x2="sx" y2="100%" />
        <line v-for="(sy, i) in guideLines.h" :key="`h${i}`" x1="0" :y1="sy" x2="100%" :y2="sy" />
      </svg>

      <!-- Fantôme d'emplacement (drag d'une fonctionnalité) : contour pointillé violet animé -->
      <svg v-if="ghostRect" class="drag-ghost" aria-hidden="true">
        <rect :x="ghostRect.x" :y="ghostRect.y" :width="ghostRect.w" :height="ghostRect.h" rx="8" ry="8" />
      </svg>
    </VueFlow>

    <!-- Overlays écran : menus contextuels -->
    <QuickCreateMenu
      v-if="sync.quickCreate.value"
      :x="sync.quickCreate.value.screenX"
      :y="sync.quickCreate.value.screenY"
      @select="sync.runQuickCreate"
      @close="sync.closeMenus"
    />
    <ContextMenu
      v-if="sync.contextMenu.value"
      :x="sync.contextMenu.value.screenX"
      :y="sync.contextMenu.value.screenY"
      :node-id="sync.contextMenu.value.nodeId"
      @delete="sync.contextDelete"
      @set-home="sync.contextSetHome"
      @set-block-type="sync.contextSetBlockType"
      @convert-note="sync.contextConvertNote"
      @add-behavior="sync.contextAddBehavior"
      @add-api="sync.contextAddApi"
      @close="sync.closeMenus"
    />
    <EdgeTypePopover
      v-if="sync.edgePopover.value"
      :x="sync.edgePopover.value.screenX"
      :y="sync.edgePopover.value.screenY"
      :current="sync.edgePopover.value.current"
      :choices="sync.edgePopover.value.choices"
      :render="sync.edgePopover.value.render"
      @select="sync.applyEdgeType"
      @toggle-render="sync.toggleEdgeRenderFromPopover"
      @remove="sync.deleteEdgeFromPopover"
      @close="sync.closeMenus"
    />
    <!-- Capteur de fermeture : clic hors menu ferme les overlays -->
    <div
      v-if="sync.quickCreate.value || sync.contextMenu.value || sync.edgePopover.value"
      class="fixed inset-0 z-40"
      @pointerdown="sync.closeMenus"
      @contextmenu.prevent="sync.closeMenus"
    />
  </div>
</template>

<style scoped>
.flooow-canvas :deep(.vue-flow__minimap) {
  border-radius: 0.5rem;
  border: 1px solid rgba(0, 0, 0, 0.08);
  overflow: hidden;
}
/* Espace maintenu → curseur main (le drag panne, géré par Vue Flow). */
.flooow-canvas.space-pan :deep(.vue-flow__pane) {
  cursor: grab;
}
.flooow-canvas.space-pan :deep(.vue-flow__pane:active) {
  cursor: grabbing;
}
/* Guides de magnétisme : lignes fines par-dessus le canvas, non interactives. */
.snap-guides {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 5;
  overflow: visible;
}
.snap-guides line {
  stroke: #ec4899;
  stroke-width: 1;
  stroke-dasharray: 4 3;
}
/* Fantôme d'emplacement : contour pointillé violet + « marching ants » (défilement des tirets). */
.drag-ghost {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 6;
  overflow: visible;
}
.drag-ghost rect {
  fill: rgba(139, 92, 246, 0.08);
  stroke: #8b5cf6;
  stroke-width: 2;
  stroke-dasharray: 7 5;
  animation: ghost-march 0.5s linear infinite;
}
@keyframes ghost-march {
  to {
    stroke-dashoffset: -12;
  }
}
</style>
