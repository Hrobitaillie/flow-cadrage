<script setup lang="ts">
// Bascule du rendu des liens INTER-modules en couche fonctionnelle (les liens intra-module restent
// toujours au premier plan). « Portails » : pastilles aux extrémités (pas de long tracé). « Arrière-
// plan » : lignes derrière les cartes (visibles dans les gouttières). Voir useCanvasSync.
import { useUiStore } from '@/stores/ui'
import { useProjectStore } from '@/stores/project'
import FloatingPanel from './FloatingPanel.vue'

const ui = useUiStore()
const project = useProjectStore()

const modes: { id: 'portal' | 'background'; label: string; icon: string }[] = [
  { id: 'background', label: 'Arrière-plan', icon: '↴' },
  { id: 'portal', label: 'Portails', icon: '⇋' },
]

function rearrange(): void {
  project.arrangeFunctional()
  window.dispatchEvent(new CustomEvent('flooow:zoom-fit'))
}
</script>

<template>
  <FloatingPanel :padded="false" role="group" aria-label="Rendu des liens inter-modules">
    <div class="flex items-center gap-0.5 p-1">
      <span class="px-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
        Liens longs
      </span>
      <button
        v-for="m in modes"
        :key="m.id"
        type="button"
        :aria-pressed="ui.funcEdgeMode === m.id"
        :title="`Liens inter-modules : ${m.label}`"
        class="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
        :class="
          ui.funcEdgeMode === m.id
            ? 'bg-violet-600 text-white shadow-sm'
            : 'text-slate-600 hover:bg-black/5 dark:text-zinc-300 dark:hover:bg-white/10'
        "
        @click="ui.setFuncEdgeMode(m.id)"
      >
        <span aria-hidden="true">{{ m.icon }}</span>
        {{ m.label }}
      </button>
      <div class="mx-1 h-5 w-px bg-black/10" />
      <button
        type="button"
        title="Réaligner les modules en ligne propre"
        class="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors duration-150 hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:text-zinc-300 dark:hover:bg-white/10"
        @click="rearrange"
      >
        <span aria-hidden="true">⛭</span>
        Réorganiser
      </button>
    </div>
  </FloatingPanel>
</template>
