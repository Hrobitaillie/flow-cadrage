<script setup lang="ts">
// Bascule de COUCHE du canvas (decisions.md §15) — le « mode » à la Figma : Arborescence
// (pages/blocs/notes) ou Fonctionnalités (modules/fonctionnalités). Orthogonale au ModeSwitcher
// (Canvas/Specs/API). Chaque couche a sa palette ; l'autre couche est complètement masquée.
import { useUiStore } from '@/stores/ui'
import type { CanvasLayer } from '@/model/types'
import FloatingPanel from './FloatingPanel.vue'

const ui = useUiStore()

const layers: { id: CanvasLayer; label: string; icon: string }[] = [
  { id: 'structural', label: 'Arborescence', icon: '▤' },
  { id: 'functional', label: 'Fonctionnalités', icon: '◈' },
]
</script>

<template>
  <FloatingPanel :padded="false" role="tablist" aria-label="Couche du canvas">
    <div class="flex gap-0.5 p-1">
      <button
        v-for="l in layers"
        :key="l.id"
        type="button"
        role="tab"
        :aria-selected="ui.canvasLayer === l.id"
        :title="l.label"
        class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
        :class="
          ui.canvasLayer === l.id
            ? 'bg-violet-600 text-white shadow-sm'
            : 'text-slate-600 hover:bg-black/5 dark:text-zinc-300 dark:hover:bg-white/10'
        "
        @click="ui.setCanvasLayer(l.id)"
      >
        <span aria-hidden="true">{{ l.icon }}</span>
        {{ l.label }}
      </button>
    </div>
  </FloatingPanel>
</template>
