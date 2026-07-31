<script setup lang="ts">
// Filtres (bas-droite) v2, sous forme de MENU DÉROULANT : un bouton « Filtres » ouvre un panneau
// (vers le haut) avec la bascule TYPE DE NOTE (Comportement/API/Toutes), les facettes
// (front/back/fullstack/tous) et les lots. Les filtres ESTOMPENT les nœuds hors-cible (opacity .25
// côté canvas) plutôt que de les masquer (evolution-v2.md §2, interface.md §FilterBar). Ce panneau
// ne fait que piloter `ui.noteFilter` / `ui.facetFilter` / `ui.lotFilter`.
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { useUiStore } from '@/stores/ui'
import type { Facet, NoteKind } from '@/model/types'
import { lotColor } from '@/theme/tokens'
import FloatingPanel from './FloatingPanel.vue'

const ui = useUiStore()

const noteKinds: { id: NoteKind | null; label: string }[] = [
  { id: null, label: 'Toutes' },
  { id: 'behavior', label: 'Comportement' },
  { id: 'api', label: 'API' },
]

const facets: { id: Facet | null; label: string }[] = [
  { id: null, label: 'Tous' },
  { id: 'front', label: 'Front' },
  { id: 'back', label: 'Back' },
  { id: 'fullstack', label: 'Fullstack' },
]

const LOT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8]

const open = ref(false)
const hasActive = computed(
  () => ui.noteFilter !== null || ui.facetFilter !== null || ui.lotFilter !== null,
)

function reset(): void {
  ui.setNoteFilter(null)
  ui.setFacetFilter(null)
  ui.setLotFilter(null)
}

// Ferme le menu au clic hors du panneau.
function onDocClick(e: MouseEvent): void {
  if (!(e.target as HTMLElement).closest('.filter-menu')) open.value = false
}
watch(open, (v) => {
  if (v) document.addEventListener('click', onDocClick)
  else document.removeEventListener('click', onDocClick)
})
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <FloatingPanel :padded="false" aria-label="Filtres">
    <div class="filter-menu relative">
      <button
        type="button"
        class="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 dark:text-zinc-200 dark:hover:bg-white/10"
        :aria-expanded="open"
        aria-haspopup="menu"
        @click="open = !open"
      >
        <svg viewBox="0 0 20 20" class="h-3.5 w-3.5 opacity-70" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M3 5h14M6 10h8M9 15h2" />
        </svg>
        Filtres
        <span v-if="hasActive" class="h-1.5 w-1.5 rounded-full bg-cyan-500" aria-hidden="true" />
        <svg viewBox="0 0 20 20" class="h-3 w-3 opacity-60" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 8l4 4 4-4" /></svg>
      </button>

      <div
        v-if="open"
        class="absolute bottom-full right-0 z-50 mb-1 w-60 rounded-lg border border-black/[0.08] bg-white/95 p-2 shadow-lg backdrop-blur-md dark:border-white/10 dark:bg-zinc-900/95"
        role="menu"
      >
        <!-- Type de note -->
        <div class="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Type de note</div>
        <div class="flex flex-wrap gap-1" role="group" aria-label="Filtrer par type de note">
          <button
            v-for="k in noteKinds"
            :key="k.label"
            type="button"
            :aria-pressed="ui.noteFilter === k.id"
            class="rounded-lg px-2.5 py-1 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
            :class="
              ui.noteFilter === k.id
                ? 'bg-cyan-600 text-white'
                : 'text-slate-600 hover:bg-black/5 dark:text-zinc-300 dark:hover:bg-white/10'
            "
            @click="ui.setNoteFilter(k.id)"
          >
            {{ k.label }}
          </button>
        </div>

        <!-- Facette -->
        <div class="mb-1 mt-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Facette</div>
        <div class="flex flex-wrap gap-1" role="group" aria-label="Filtrer par facette">
          <button
            v-for="f in facets"
            :key="f.label"
            type="button"
            :aria-pressed="ui.facetFilter === f.id"
            class="rounded-lg px-2.5 py-1 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
            :class="
              ui.facetFilter === f.id
                ? 'bg-cyan-600 text-white'
                : 'text-slate-600 hover:bg-black/5 dark:text-zinc-300 dark:hover:bg-white/10'
            "
            @click="ui.setFacetFilter(f.id)"
          >
            {{ f.label }}
          </button>
        </div>

        <!-- Lot -->
        <div class="mb-1 mt-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Lot</div>
        <div class="flex flex-wrap items-center gap-1" role="group" aria-label="Filtrer par lot">
          <button
            type="button"
            :aria-pressed="ui.lotFilter === null"
            class="rounded-lg px-2.5 py-1 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
            :class="
              ui.lotFilter === null
                ? 'bg-cyan-600 text-white'
                : 'text-slate-600 hover:bg-black/5 dark:text-zinc-300 dark:hover:bg-white/10'
            "
            @click="ui.setLotFilter(null)"
          >
            Tous
          </button>
          <button
            v-for="l in LOT_OPTIONS"
            :key="l"
            type="button"
            :aria-pressed="ui.lotFilter === l"
            :title="`Lot ${l}`"
            class="flex h-6 w-6 items-center justify-center rounded-lg text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
            :class="
              ui.lotFilter === l
                ? 'text-white'
                : 'text-slate-600 hover:bg-black/5 dark:text-zinc-300 dark:hover:bg-white/10'
            "
            :style="ui.lotFilter === l ? { backgroundColor: lotColor(l) } : {}"
            @click="ui.setLotFilter(l)"
          >
            <span v-if="ui.lotFilter !== l" class="h-2.5 w-2.5 rounded-full" :style="{ backgroundColor: lotColor(l) }" aria-hidden="true" />
            <template v-else>{{ l }}</template>
          </button>
        </div>

        <div v-if="hasActive" class="mt-3 border-t border-black/[0.06] pt-2 dark:border-white/10">
          <button
            type="button"
            class="w-full rounded-md px-2 py-1 text-left text-xs font-medium text-slate-500 hover:bg-black/5 dark:text-zinc-400 dark:hover:bg-white/10"
            @click="reset"
          >
            Réinitialiser les filtres
          </button>
        </div>
      </div>
    </div>
  </FloatingPanel>
</template>
