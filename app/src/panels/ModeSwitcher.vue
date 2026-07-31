<script setup lang="ts">
// Sélecteur de mode Canvas / Specs / API — pilule à 3 segments, ancrée haut-centre.
// Raccourcis 1 / 2 / 3 gérés par useKeyboard. Toujours visible (interface.md).
import { useUiStore } from '@/stores/ui'
import type { AppMode } from '@/stores/ui'
import FloatingPanel from './FloatingPanel.vue'

const ui = useUiStore()

const modes: { id: AppMode; label: string; hint: string }[] = [
  { id: 'canvas', label: 'Canvas', hint: '1' },
  { id: 'specs', label: 'Specs', hint: '2' },
  { id: 'api', label: 'API', hint: '3' },
  { id: 'catalog', label: 'Catalogue', hint: '4' },
]
</script>

<template>
  <FloatingPanel :padded="false" role="tablist" aria-label="Mode d'affichage">
    <div class="flex gap-0.5 p-1">
      <button
        v-for="m in modes"
        :key="m.id"
        type="button"
        role="tab"
        :aria-selected="ui.mode === m.id"
        :title="`${m.label} (${m.hint})`"
        class="rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
        :class="
          ui.mode === m.id
            ? 'bg-cyan-600 text-white shadow-sm'
            : 'text-slate-600 hover:bg-black/5 dark:text-zinc-300 dark:hover:bg-white/10'
        "
        @click="ui.setMode(m.id)"
      >
        {{ m.label }}
      </button>
    </div>
  </FloatingPanel>
</template>
