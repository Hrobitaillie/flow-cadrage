<script setup lang="ts">
// Calque overlay au-dessus du canvas (interface.md §Calque de panneaux).
// - fixed/absolute inset-0, pointer-events:none ; chaque panneau réactive pointer-events:auto,
//   le canvas reste pannable/zoomable entre les panneaux.
// - Visibilité pilotée par ui.mode (canvas = tous ; specs/api = ModeSwitcher + FilterBar +
//   StatusChip) et par ui.openPanels.
// - Installe les raccourcis clavier globaux (useKeyboard), montés tant que l'app vit.
import { computed, onMounted, onBeforeUnmount } from 'vue'
import { useUiStore } from '@/stores/ui'
import { useProjectStore } from '@/stores/project'
import { isFeature } from '@/model/types'
import { useKeyboard } from '@/composables/useKeyboard'
import { useFeatureEditor } from '@/composables/useFeatureEditor'
import ModeSwitcher from './ModeSwitcher.vue'
import LayerSwitcher from './LayerSwitcher.vue'
import FunctionalEdgeToggle from './FunctionalEdgeToggle.vue'
import ToolDock from './ToolDock.vue'
import PropertiesPanel from './PropertiesPanel.vue'
import FilterBar from './FilterBar.vue'
import StatusChip from './StatusChip.vue'
import ZoomBar from './ZoomBar.vue'
import SearchPopover from './SearchPopover.vue'

const ui = useUiStore()
const project = useProjectStore()
const isCanvas = computed(() => ui.mode === 'canvas')
// Split éditeur de fonctionnalité ouvert → on masque le panneau flottant et la barre de filtres
// (elles vivraient sous/derrière le split, à droite).
const featureEditor = useFeatureEditor()
// Sélection d'UNE seule fonctionnalité : on n'ouvre PAS le panneau flottant (l'édition passe par
// le badge « Éditer » de la carte → éditeur plein hauteur). Les autres types gardent le panneau.
const singleFeatureSelected = computed(() => {
  if (ui.selectedIds.length !== 1) return false
  const n = ui.selectedId ? project.nodeById(ui.selectedId) : undefined
  return !!n && isFeature(n)
})

let teardownKeyboard: (() => void) | undefined
onMounted(() => {
  teardownKeyboard = useKeyboard()
})
onBeforeUnmount(() => {
  teardownKeyboard?.()
})
</script>

<template>
  <div class="panel-layer pointer-events-none fixed inset-0 z-40">
    <!-- ModeSwitcher — haut centre, toujours visible -->
    <div v-if="ui.openPanels.modeSwitcher" class="pointer-events-auto absolute left-1/2 top-3 -translate-x-1/2">
      <ModeSwitcher />
    </div>

    <!-- LayerSwitcher (Arborescence / Fonctionnalités) — sous le ModeSwitcher, mode canvas -->
    <div v-if="isCanvas" class="pointer-events-auto absolute left-1/2 top-16 -translate-x-1/2">
      <LayerSwitcher />
    </div>

    <!-- Bascule rendu des liens longs (couche fonctionnelle) — bas centre, si split fermé -->
    <div
      v-if="isCanvas && ui.canvasLayer === 'functional' && !featureEditor.open.value"
      class="pointer-events-auto absolute bottom-3 left-1/2 -translate-x-1/2"
    >
      <FunctionalEdgeToggle />
    </div>

    <!-- FilterBar (menu déroulant) — bas droite, tous les modes (masquée si split ouvert) -->
    <div v-if="ui.openPanels.filterBar && !featureEditor.open.value" class="pointer-events-auto absolute bottom-3 right-3">
      <FilterBar />
    </div>

    <!-- ToolDock — gauche centre, mode canvas seulement -->
    <Transition name="dock">
      <div
        v-if="isCanvas && ui.openPanels.toolDock"
        class="pointer-events-auto absolute left-3 top-1/2 -translate-y-1/2"
      >
        <ToolDock />
      </div>
    </Transition>

    <!-- PropertiesPanel — droite ; à la sélection, mode canvas. Cède la place au split fonctionnalité. -->
    <Transition name="props">
      <div
        v-if="isCanvas && ui.openPanels.properties && ui.hasSelection && !featureEditor.open.value && !singleFeatureSelected"
        class="pointer-events-auto absolute right-3 top-16"
      >
        <PropertiesPanel />
      </div>
    </Transition>

    <!-- ZoomBar — bas gauche, mode canvas seulement -->
    <div
      v-if="isCanvas && ui.openPanels.zoomBar"
      class="pointer-events-auto absolute bottom-3 left-3"
    >
      <ZoomBar />
    </div>

    <!-- StatusChip (menu fichier) — haut gauche, tous les modes -->
    <div v-if="ui.openPanels.statusChip" class="pointer-events-auto absolute left-3 top-3">
      <StatusChip />
    </div>

    <!-- SearchPopover — overlay ⌘K (gère sa propre visibilité) -->
    <SearchPopover />
  </div>
</template>

<style scoped>
/* Transitions courtes 150 ms ease-out (interface.md §Micro-interactions). */
.props-enter-active,
.props-leave-active,
.dock-enter-active,
.dock-leave-active {
  transition:
    opacity 150ms ease-out,
    transform 150ms ease-out;
}
.props-enter-from,
.props-leave-to {
  opacity: 0;
  transform: translateX(12px);
}
.dock-enter-from,
.dock-leave-to {
  opacity: 0;
  transform: translate(-8px, -50%);
}
.dock-enter-to,
.dock-leave-from {
  transform: translate(0, -50%);
}
</style>
