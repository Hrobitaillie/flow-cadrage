<script setup lang="ts">
// Barre de zoom (bas-gauche) : −, %, +, zoom-to-fit (⇧1), bascule minimap (⇧M).
// Le pourcentage reflète ui.zoom (source partagée avec le canvas). Le fit et la minimap sont
// des opérations canvas : émis via CustomEvent que FlowCanvas peut écouter (interface.md).
import { ref } from 'vue'
import { useUiStore } from '@/stores/ui'
import FloatingPanel from './FloatingPanel.vue'

const ui = useUiStore()
const minimap = ref(true)

const ZOOM_MIN = 0.1
const ZOOM_MAX = 4

function clamp(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z))
}
function zoomOut(): void {
  ui.setZoom(clamp(ui.zoom / 1.2))
}
function zoomIn(): void {
  ui.setZoom(clamp(ui.zoom * 1.2))
}
function zoomFit(): void {
  window.dispatchEvent(new CustomEvent('flooow:zoom-fit'))
}
function toggleMinimap(): void {
  minimap.value = !minimap.value
  window.dispatchEvent(new CustomEvent('flooow:toggle-minimap'))
}
</script>

<template>
  <FloatingPanel :padded="false" aria-label="Zoom">
    <div class="flex items-center gap-0.5 p-1 text-slate-600 dark:text-zinc-300">
      <button type="button" class="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 dark:hover:bg-white/10" aria-label="Dézoomer" @click="zoomOut">
        <svg viewBox="0 0 20 20" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 10h10" /></svg>
      </button>
      <span class="w-12 select-none text-center text-xs font-medium tabular-nums" aria-live="polite">{{ Math.round(ui.zoom * 100) }}%</span>
      <button type="button" class="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 dark:hover:bg-white/10" aria-label="Zoomer" @click="zoomIn">
        <svg viewBox="0 0 20 20" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 5v10M5 10h10" /></svg>
      </button>
      <div class="mx-0.5 h-5 w-px bg-black/10 dark:bg-white/10" />
      <button type="button" class="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 dark:hover:bg-white/10" aria-label="Ajuster à la vue (⇧1)" title="Ajuster à la vue (⇧1)" @click="zoomFit">
        <svg viewBox="0 0 20 20" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 7V4h3M16 7V4h-3M4 13v3h3M16 13v3h-3" /></svg>
      </button>
      <button
        type="button"
        class="flex h-7 w-7 items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
        :class="minimap ? 'bg-cyan-600 text-white' : 'hover:bg-black/5 dark:hover:bg-white/10'"
        :aria-pressed="minimap"
        aria-label="Basculer la minimap (⇧M)"
        title="Minimap (⇧M)"
        @click="toggleMinimap"
      >
        <svg viewBox="0 0 20 20" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="4" width="12" height="12" rx="1" /><rect x="10" y="10" width="4" height="4" rx="0.5" /></svg>
      </button>
    </div>
  </FloatingPanel>
</template>
