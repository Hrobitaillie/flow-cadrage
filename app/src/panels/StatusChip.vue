<script setup lang="ts">
// Puce d'état de sauvegarde + menu fichier (haut-gauche). Reflète project.dirty ; clic sur l'état =
// sauvegarder. Le menu (caret) expose Nouveau projet / Ouvrir / Enregistrer / Enregistrer sous / démo.
// « ● Sauvegardé HH:MM » / « ● Modifications non sauvées » / « ⟳ Sauvegarde… ».
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { useProjectStore } from '@/stores/project'
import { useUiStore } from '@/stores/ui'
import { useFileActions } from '@/composables/useFileActions'
import { loadDemoProject, loadLocasystProject } from '@/io/demo'
import FloatingPanel from './FloatingPanel.vue'

const project = useProjectStore()
const ui = useUiStore()
const files = useFileActions()

const saving = ref(false)
const lastSavedAt = ref<Date | null>(null)
const menuOpen = ref(false)

// Mémorise l'heure au passage à « propre » (sauvegarde effective ou markSaved externe).
watch(
  () => project.dirty,
  (dirty) => {
    if (!dirty) lastSavedAt.value = new Date()
  },
)

const timeLabel = computed(() => {
  const d = lastSavedAt.value
  if (!d) return ''
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
})

const state = computed<'saving' | 'dirty' | 'clean'>(() =>
  saving.value ? 'saving' : project.dirty ? 'dirty' : 'clean',
)
const label = computed(() => {
  if (state.value === 'saving') return 'Sauvegarde…'
  if (state.value === 'dirty') return 'Modifications non sauvées'
  return timeLabel.value ? `Sauvegardé · ${timeLabel.value}` : 'Sauvegardé'
})
const dotClass = computed(() => {
  if (state.value === 'saving') return 'bg-cyan-500 animate-pulse'
  if (state.value === 'dirty') return 'bg-amber-500'
  return 'bg-emerald-500'
})

async function runSaving(fn: () => Promise<unknown>): Promise<void> {
  if (saving.value) return
  saving.value = true
  try {
    await fn()
  } finally {
    saving.value = false
  }
}

function save(): void {
  void runSaving(files.save)
}
function saveFromMenu(): void {
  menuOpen.value = false
  save()
}
function saveAs(): void {
  menuOpen.value = false
  void runSaving(files.saveAs)
}
function newProject(): void {
  menuOpen.value = false
  files.newProject()
}
function open(): void {
  menuOpen.value = false
  void files.open()
}
async function loadDemo(): Promise<void> {
  menuOpen.value = false
  if (
    project.dirty &&
    !window.confirm('Des modifications ne sont pas sauvegardées. Charger le projet de démo ?')
  ) {
    return
  }
  await runSaving(async () => {
    try {
      await loadDemoProject()
    } catch {
      window.alert('Projet de démo indisponible.')
    }
  })
}
async function loadLocasyst(): Promise<void> {
  menuOpen.value = false
  if (
    project.dirty &&
    !window.confirm('Des modifications ne sont pas sauvegardées. Charger le cadrage locasyst ?')
  ) {
    return
  }
  await runSaving(async () => {
    try {
      await loadLocasystProject()
      ui.setCanvasLayer('functional') // projet fonctionnel → ouvrir directement la bonne couche
    } catch {
      window.alert('Cadrage locasyst indisponible.')
    }
  })
}

// Ferme le menu au clic hors du panneau.
function onDocClick(e: MouseEvent): void {
  if (!(e.target as HTMLElement).closest('.status-chip')) menuOpen.value = false
}
watch(menuOpen, (v) => {
  if (v) document.addEventListener('click', onDocClick)
  else document.removeEventListener('click', onDocClick)
})
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <FloatingPanel :padded="false">
    <div class="status-chip relative flex items-center">
      <button
        type="button"
        class="flex items-center gap-2 rounded-l-xl px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 dark:text-zinc-200 dark:hover:bg-white/10"
        :title="state === 'dirty' ? 'Cliquer pour sauvegarder (⌘S)' : 'Sauvegarder (⌘S)'"
        @click="save"
      >
        <span class="h-2 w-2 rounded-full" :class="dotClass" aria-hidden="true" />
        {{ label }}
      </button>

      <button
        type="button"
        class="rounded-r-xl border-l border-black/10 px-1.5 py-1.5 text-slate-500 transition-colors hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 dark:border-white/10 dark:text-zinc-400 dark:hover:bg-white/10"
        :aria-expanded="menuOpen"
        aria-haspopup="menu"
        aria-label="Menu fichier"
        @click="menuOpen = !menuOpen"
      >
        <svg viewBox="0 0 20 20" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M6 12l4-4 4 4" />
        </svg>
      </button>

      <div
        v-if="menuOpen"
        class="absolute left-0 top-full z-50 mt-1 w-52 rounded-lg border border-black/[0.08] bg-white/95 p-1 text-xs shadow-lg backdrop-blur-md dark:border-white/10 dark:bg-zinc-900/95"
        role="menu"
      >
        <button type="button" role="menuitem" class="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-slate-700 hover:bg-black/5 dark:text-zinc-200 dark:hover:bg-white/10" @click="newProject">
          Nouveau projet
        </button>
        <button type="button" role="menuitem" class="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-slate-700 hover:bg-black/5 dark:text-zinc-200 dark:hover:bg-white/10" @click="open">
          Ouvrir un projet…<span class="text-slate-400">⌘O</span>
        </button>
        <button type="button" role="menuitem" class="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-slate-700 hover:bg-black/5 dark:text-zinc-200 dark:hover:bg-white/10" @click="saveFromMenu">
          Enregistrer<span class="text-slate-400">⌘S</span>
        </button>
        <button type="button" role="menuitem" class="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-slate-700 hover:bg-black/5 dark:text-zinc-200 dark:hover:bg-white/10" @click="saveAs">
          Enregistrer sous…<span class="text-slate-400">⌘⇧S</span>
        </button>
        <div class="my-1 h-px bg-black/[0.06] dark:bg-white/10" />
        <button type="button" role="menuitem" class="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-slate-700 hover:bg-black/5 dark:text-zinc-200 dark:hover:bg-white/10" @click="loadDemo">
          Charger la démo
        </button>
        <button type="button" role="menuitem" class="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-slate-700 hover:bg-black/5 dark:text-zinc-200 dark:hover:bg-white/10" @click="loadLocasyst">
          Charger le cadrage locasyst
        </button>
      </div>
    </div>
  </FloatingPanel>
</template>
