<script setup lang="ts">
// Shell applicatif : région centrale plein écran (selon le mode) + calque de panneaux en overlay.
// Une seule source de vérité = store project ; le mode est piloté par ui.mode (architecture.md).
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useUiStore } from '@/stores/ui'
import { useProjectStore } from '@/stores/project'
import { startAutosave, findRecoverableSnapshot, type Snapshot } from '@/io/autosave'
import { currentProjectKey } from '@/io/file'
import FlowCanvas from '@/canvas/FlowCanvas.vue'
import PanelLayer from '@/panels/PanelLayer.vue'
import FeatureEditor from '@/panels/FeatureEditor.vue'
import SpecsView from '@/views/SpecsView.vue'
import ApiView from '@/views/ApiView.vue'
import CatalogView from '@/views/CatalogView.vue'
import { useFeatureEditor } from '@/composables/useFeatureEditor'

const ui = useUiStore()
const project = useProjectStore()

// Éditeur de fonctionnalité en split pleine hauteur (droite) : le canvas rétrécit, l'espace libéré
// accueille la zone de contenu. Largeur bornée (responsive).
const featureEditor = useFeatureEditor()
const EDITOR_WIDTH = 'clamp(360px, 40vw, 600px)'

// Autosave local-first (IndexedDB, best-effort) + garde anti-perte à la fermeture.
let stopAutosave: (() => void) | undefined
function onBeforeUnload(e: BeforeUnloadEvent): void {
  if (project.dirty) {
    e.preventDefault()
    e.returnValue = ''
  }
}

// Récupération au boot : proposition NON destructive si un snapshot autosave existe pour le
// projet courant (donnees-json.md §Autosave). L'utilisateur choisit ; jamais d'application auto.
const recoverable = ref<Snapshot | null>(null)
function recover(): void {
  if (recoverable.value) project.load(recoverable.value.doc)
  recoverable.value = null
}
function dismissRecovery(): void {
  recoverable.value = null
}

onMounted(async () => {
  stopAutosave = startAutosave()
  window.addEventListener('beforeunload', onBeforeUnload)
  try {
    recoverable.value = await findRecoverableSnapshot(currentProjectKey())
  } catch {
    recoverable.value = null
  }
})
onBeforeUnmount(() => {
  stopAutosave?.()
  window.removeEventListener('beforeunload', onBeforeUnload)
})

function snapTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('fr-FR')
}

const centralComponent = computed(() => {
  switch (ui.mode) {
    case 'specs':
      return SpecsView
    case 'api':
      return ApiView
    case 'catalog':
      return CatalogView
    default:
      return FlowCanvas
  }
})
</script>

<template>
  <div class="app-shell relative h-full w-full overflow-hidden bg-slate-100">
    <main
      class="absolute inset-y-0 left-0 transition-[right] duration-300 ease-out"
      :style="{ right: featureEditor.open.value ? EDITOR_WIDTH : '0px' }"
    >
      <component :is="centralComponent" />
    </main>
    <PanelLayer />

    <!-- Split éditeur de fonctionnalité : colonne droite pleine hauteur, glisse depuis la droite -->
    <div
      class="absolute inset-y-0 right-0 z-[45] transition-transform duration-300 ease-out"
      :style="{ width: EDITOR_WIDTH }"
      :class="featureEditor.open.value ? 'translate-x-0 shadow-xl' : 'translate-x-full'"
    >
      <FeatureEditor />
    </div>

    <!-- Bannière de récupération (bas-centre), au-dessus des panneaux -->
    <div
      v-if="recoverable"
      class="pointer-events-auto fixed bottom-3 left-1/2 z-[55] flex -translate-x-1/2 items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/95 px-4 py-2.5 text-sm text-amber-900 shadow-lg backdrop-blur-md"
      role="alertdialog"
      aria-label="Récupération de version"
    >
      <span>
        Une version non sauvegardée existe<span v-if="snapTime(recoverable.savedAt)"> ({{ snapTime(recoverable.savedAt) }})</span>.
      </span>
      <button
        type="button"
        class="rounded-lg bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
        @click="recover"
      >
        Récupérer
      </button>
      <button
        type="button"
        class="rounded-lg px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
        @click="dismissRecovery"
      >
        Ignorer
      </button>
    </div>
  </div>
</template>
