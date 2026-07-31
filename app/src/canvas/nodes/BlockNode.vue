<script setup lang="ts">
// Bloc (v2) : pleine largeur de la page, empilé, NON redimensionnable. Affiche un mini-gabarit
// visuel selon son BlockType + nom éditable inline. Glisser verticalement = réordonner ; glisser
// vers une autre page = reparenter (géré au drop par useCanvasSync). Handles cachés (ancres pour
// le connecteur de note / arêtes dependsOn), non tirables par l'utilisateur.
import { computed, inject } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { useProjectStore } from '@/stores/project'
import { useUiStore } from '@/stores/ui'
import { useInlineEdit } from '@/composables/useInlineEdit'
import type { BlockType } from '@/model/types'
import { ORDER_BADGE_KEY, type BlockNodeData } from '../useCanvasSync'

const props = defineProps<{
  id: string
  data: BlockNodeData
  selected?: boolean
  dragging?: boolean
}>()

const store = useProjectStore()
const ui = useUiStore()
const badges = inject(ORDER_BADGE_KEY, undefined)

const order = computed(() => badges?.value.get(props.id) ?? null)
const dimmed = computed(() => ui.lotFilter != null && props.data.lot !== ui.lotFilter)

// Mini-gabarits : rectangles dans un viewBox 100×34 (gris = zones, bleu = accent).
type Rect = { x: number; y: number; w: number; h: number; accent?: boolean }
const GABARITS: Record<BlockType, Rect[]> = {
  hero: [
    { x: 6, y: 5, w: 88, h: 15, accent: true },
    { x: 6, y: 23, w: 46, h: 5 },
  ],
  cta: [{ x: 33, y: 11, w: 34, h: 12, accent: true }],
  grid: [
    { x: 6, y: 6, w: 26, h: 10 },
    { x: 37, y: 6, w: 26, h: 10 },
    { x: 68, y: 6, w: 26, h: 10 },
    { x: 6, y: 20, w: 26, h: 10 },
    { x: 37, y: 20, w: 26, h: 10 },
    { x: 68, y: 20, w: 26, h: 10 },
  ],
  damier: [
    { x: 6, y: 6, w: 42, h: 22, accent: true },
    { x: 52, y: 6, w: 42, h: 10 },
    { x: 52, y: 18, w: 42, h: 10 },
  ],
  menu: [
    { x: 6, y: 12, w: 20, h: 10, accent: true },
    { x: 40, y: 14, w: 12, h: 6 },
    { x: 58, y: 14, w: 12, h: 6 },
    { x: 76, y: 14, w: 12, h: 6 },
  ],
  footer: [
    { x: 6, y: 20, w: 88, h: 9 },
    { x: 6, y: 8, w: 24, h: 5 },
  ],
  feature: [
    { x: 6, y: 6, w: 38, h: 22, accent: true },
    { x: 50, y: 9, w: 44, h: 5 },
    { x: 50, y: 19, w: 44, h: 5 },
  ],
  free: [{ x: 6, y: 6, w: 88, h: 22 }],
}
const gabarit = computed<Rect[]>(() => GABARITS[props.data.node.attrs.blockType] ?? GABARITS.free)
const isFree = computed(() => props.data.node.attrs.blockType === 'free')

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
    class="block-node relative rounded-md border bg-white px-2 py-1.5 shadow-sm transition-shadow"
    :class="selected ? 'border-sky-500 shadow-md' : 'border-slate-200 hover:shadow'"
    :style="{ opacity: dimmed ? 0.25 : 1 }"
  >
    <div class="mb-1 flex items-center gap-1.5">
      <input
        v-if="titleEditing"
        ref="inputRef"
        v-model="titleDraft"
        class="nodrag min-w-0 flex-1 rounded border border-sky-300 px-1 py-0.5 text-[11px] font-medium text-slate-700 outline-none"
        @blur="commitTitle()"
        @keydown="titleKeydown"
      />
      <span
        v-else
        class="min-w-0 flex-1 truncate text-[11px] font-medium text-slate-700"
        title="Double-clic pour renommer"
        @dblclick.stop="beginTitle()"
      >
        {{ data.node.attrs.name || 'Bloc' }}
      </span>
      <span class="shrink-0 text-[9px] uppercase tracking-wide text-slate-400">
        {{ data.node.attrs.blockType }}
      </span>
      <span
        v-if="data.incomplete"
        class="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-red-500"
        title="Champs obligatoires manquants"
      />
    </div>

    <!-- Mini-gabarit visuel -->
    <svg viewBox="0 0 100 34" class="block-glyph h-8 w-full rounded bg-slate-50">
      <rect
        v-for="(r, i) in gabarit"
        :key="i"
        :x="r.x"
        :y="r.y"
        :width="r.w"
        :height="r.h"
        rx="1.5"
        :fill="r.accent ? '#bae6fd' : '#e2e8f0'"
        :stroke="isFree ? '#cbd5e1' : 'none'"
        :stroke-dasharray="isFree ? '3 2' : undefined"
        stroke-width="0.8"
      />
    </svg>

    <div
      v-if="order != null"
      class="pointer-events-none absolute -left-2 -top-2 rounded-full bg-sky-600 px-1.5 py-0.5 text-[10px] font-bold text-white shadow"
    >#{{ order }}</div>

    <!-- Ancres cachées (connecteur de note / arêtes dependsOn), non tirables. -->
    <Handle
      id="b"
      type="target"
      :position="Position.Left"
      :connectable="false"
      class="hidden-handle"
    />
    <Handle
      id="b-src"
      type="source"
      :position="Position.Right"
      :connectable="false"
      class="hidden-handle"
    />
  </div>
</template>

<style scoped>
.block-node :deep(.hidden-handle) {
  opacity: 0;
  width: 1px;
  height: 1px;
  min-width: 0;
  min-height: 0;
  border: 0;
  pointer-events: none;
}
</style>
