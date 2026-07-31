<script setup lang="ts">
// Frame module (couche fonctionnelle, decisions.md §15) : CONTENEUR de fonctionnalités (comme une
// page contient ses blocs). En-tête = nom éditable + compteur ; le corps accueille les cartes
// fonctionnalité rendues par Vue Flow comme nœuds enfants. Double-clic sur le module = ajouter une
// fonctionnalité (géré par useCanvasSync).
import { useVueFlow } from '@vue-flow/core'
import { useProjectStore } from '@/stores/project'
import { useInlineEdit } from '@/composables/useInlineEdit'
import { MODULE_WIDTH, MODULE_CONTENT_TOP, type ModuleNodeData } from '../useCanvasSync'

const props = defineProps<{
  id: string
  data: ModuleNodeData
  selected?: boolean
  dragging?: boolean
}>()

const store = useProjectStore()
const { viewport, findNode } = useVueFlow()

// ── Poignée de resize (coin bas-droit) : fixe la taille MINIMALE du module ────────────────────────
// On lit la taille rendue, on suit le pointeur (delta / zoom = monde), et on écrit width/height dans
// les attrs en COALESCANT (une seule entrée d'historique pour tout le geste). Le layout garde
// max(contenu, manuel), donc réduire sous le contenu revient à « auto ».
const MIN_H = MODULE_CONTENT_TOP + 48
let start: { px: number; py: number; w: number; h: number } | null = null

function onResizeDown(e: PointerEvent): void {
  e.stopPropagation()
  e.preventDefault()
  const gn = findNode(props.id)
  const w = gn?.dimensions?.width || props.data.node.attrs.width || MODULE_WIDTH
  const h = gn?.dimensions?.height || props.data.node.attrs.height || MIN_H
  start = { px: e.clientX, py: e.clientY, w, h }
  window.addEventListener('pointermove', onResizeMove)
  window.addEventListener('pointerup', onResizeUp)
}
function onResizeMove(e: PointerEvent): void {
  if (!start) return
  const z = viewport.value.zoom || 1
  const w = Math.round(Math.max(MODULE_WIDTH, start.w + (e.clientX - start.px) / z))
  const h = Math.round(Math.max(MIN_H, start.h + (e.clientY - start.py) / z))
  store.updateAttrs(props.id, { width: w, height: h }, `resize-module-${props.id}`)
}
function onResizeUp(): void {
  window.removeEventListener('pointermove', onResizeMove)
  window.removeEventListener('pointerup', onResizeUp)
  start = null
  // Le module a pu grandir → demander l'auto-espacement des voisins (useCanvasSync écoute).
  window.dispatchEvent(new Event('flooow:reflow-modules'))
}

const {
  editing: titleEditing,
  draft: titleDraft,
  inputRef,
  begin: beginTitle,
  commit: commitTitle,
  onKeydown: titleKeydown,
} = useInlineEdit({
  get: () => props.data.node.attrs.name,
  set: (name) => store.updateAttrs(props.id, { name }),
})
</script>

<template>
  <div
    class="module-frame group relative flex h-full w-full flex-col rounded-xl border-2 bg-violet-50/40 shadow-sm transition-shadow"
    :class="selected ? 'border-violet-500 shadow-md' : 'border-violet-200'"
  >
    <header
      class="flex items-center gap-2 rounded-t-[10px] border-b border-violet-200/70 bg-violet-100/70 px-3 py-2"
    >
      <span class="shrink-0 text-[12px]" aria-hidden="true">🗂️</span>
      <input
        v-if="titleEditing"
        ref="inputRef"
        v-model="titleDraft"
        class="nodrag min-w-0 flex-1 rounded border border-violet-300 bg-white px-1 py-0.5 text-[13px] font-semibold text-violet-900 outline-none"
        @blur="commitTitle()"
        @keydown="titleKeydown"
      />
      <span
        v-else
        class="min-w-0 flex-1 truncate text-[13px] font-semibold text-violet-900"
        title="Double-clic pour renommer"
        @dblclick.stop="beginTitle()"
      >
        {{ data.node.attrs.name || 'Module' }}
      </span>
      <span
        class="shrink-0 rounded-full bg-violet-200/80 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700"
        title="Fonctionnalités"
      >
        {{ data.featureCount }}
      </span>
    </header>

    <!-- Corps : les fonctionnalités sont rendues comme nœuds enfants par Vue Flow -->
    <div class="flex-1"></div>

    <!-- Poignée de resize (coin bas-droit). nodrag → n'entraîne pas le déplacement du module. -->
    <div
      class="nodrag resize-grip absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize"
      :class="selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-60'"
      title="Redimensionner le module"
      @pointerdown="onResizeDown"
    >
      <svg viewBox="0 0 10 10" class="h-full w-full text-violet-400">
        <path d="M9 3 L3 9 M9 6 L6 9" stroke="currentColor" stroke-width="1.2" fill="none" />
      </svg>
    </div>
  </div>
</template>
