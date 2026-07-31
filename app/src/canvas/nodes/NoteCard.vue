<script setup lang="ts">
// Note (v2) : carte flottante compacte affichant son CONTENU — comportement (nom + trigger/heures)
// ou API (METHOD /path + service). Éditable inline. Reliée à `attachedTo` par un connecteur de
// proximité (rendu séparément). Pas de handle à tirer.
//
// Opacité (evolution-v2.md §2) : combine, en estompage seulement (jamais masquage) :
//   - filtre type de note (noteFilter) : notes hors-type → .25
//   - filtre facette / lot
//   - focus de sélection : si une page/bloc est sélectionné, ses notes rattachées (bloc inclus)
//     restent à 100 %, les autres notes s'estompent.
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { useProjectStore } from '@/stores/project'
import { useUiStore } from '@/stores/ui'
import { useInlineEdit } from '@/composables/useInlineEdit'
import { isBlock, isFrame } from '@/model/types'
import { matchesFacet } from '@/domain/facets'
import type { NoteNodeData } from '../useCanvasSync'

const props = defineProps<{
  id: string
  data: NoteNodeData
  selected?: boolean
  dragging?: boolean
}>()

const store = useProjectStore()
const ui = useUiStore()

const note = computed(() => props.data.node)
const isApi = computed(() => note.value.kind === 'api')

// Accès aux champs discriminés (le narrowing ne traverse pas le template).
const method = computed(() => (note.value.kind === 'api' ? note.value.attrs.method : ''))
const pathVal = computed(() => (note.value.kind === 'api' ? note.value.attrs.path : ''))
const nameVal = computed(() => (note.value.kind === 'behavior' ? note.value.attrs.name : ''))
const trigger = computed(() => (note.value.kind === 'behavior' ? note.value.attrs.trigger : ''))
const facet = computed(() => note.value.attrs.facet)

const hoursLabel = computed(() => {
  if (note.value.kind !== 'behavior') return null
  const h = note.value.attrs.hours
  return h != null ? `${h} h` : null
})

// ── Focus de sélection ────────────────────────────────────────────────────────
const frameSelectionActive = computed(() =>
  ui.selectedIds.some((sid) => {
    const n = store.nodeById(sid)
    return n != null && isFrame(n)
  }),
)
const focused = computed(() => {
  const target = note.value.attachedTo
  if (ui.isSelected(target)) return true
  const t = store.nodeById(target)
  if (t && isBlock(t) && t.parentId && ui.isSelected(t.parentId)) return true
  return false
})

const dimmed = computed(() => {
  if (ui.noteFilter && note.value.kind !== ui.noteFilter) return true
  if (!matchesFacet(note.value, ui.facetFilter)) return true
  if (ui.lotFilter != null && props.data.lot !== ui.lotFilter) return true
  if (frameSelectionActive.value && !focused.value) return true
  return false
})

// ── Édition inline du contenu ─────────────────────────────────────────────────
// Comportement : nom. API : chemin (path).
const primary = useInlineEdit({
  get: () =>
    note.value.kind === 'api' ? note.value.attrs.path : note.value.attrs.name,
  set: (value) => {
    if (note.value.kind === 'api') store.updateAttrs(props.id, { path: value })
    else store.updateAttrs(props.id, { name: value })
  },
})
const {
  editing: pEditing,
  draft: pDraft,
  inputRef,
  begin: beginPrimary,
  commit: commitPrimary,
  onKeydown: primaryKeydown,
} = primary
</script>

<template>
  <div
    class="note-card relative w-full rounded-md border-l-4 bg-amber-50 px-2.5 py-1.5 shadow-sm transition-shadow"
    :class="[
      selected ? 'border border-sky-500 shadow-md' : 'border border-amber-200 hover:shadow',
      isApi ? 'border-l-cyan-500' : 'border-l-amber-400',
    ]"
    :style="{ opacity: dimmed ? 0.25 : 1 }"
  >
    <!-- Ligne 1 : type + facette + incomplétude -->
    <div class="flex items-center gap-1.5">
      <span
        class="shrink-0 rounded px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide text-white"
        :class="isApi ? 'bg-cyan-600' : 'bg-amber-500'"
      >{{ isApi ? method || 'API' : 'CPT' }}</span>
      <span
        v-if="data.facetColor"
        class="inline-block h-2 w-2 shrink-0 rounded-full"
        :style="{ backgroundColor: data.facetColor }"
        :title="facet ?? ''"
      />
      <span
        v-if="data.incomplete"
        class="ml-auto inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-red-500"
        title="Champs obligatoires manquants"
      />
    </div>

    <!-- Ligne 2 : contenu principal éditable -->
    <input
      v-if="pEditing"
      ref="inputRef"
      v-model="pDraft"
      class="nodrag mt-0.5 w-full rounded border border-sky-300 px-1 py-0.5 text-[11px] outline-none"
      @blur="commitPrimary()"
      @keydown="primaryKeydown"
    />
    <div
      v-else
      class="mt-0.5 truncate text-[11px] font-medium text-slate-700"
      :title="isApi ? pathVal : nameVal"
      @dblclick.stop="beginPrimary()"
    >
      <template v-if="isApi">{{ pathVal || '/' }}</template>
      <template v-else>{{ nameVal || 'Comportement' }}</template>
    </div>

    <!-- Ligne 3 : résumé (service pour API ; trigger/heures pour comportement) -->
    <div v-if="isApi" class="truncate text-[9px] text-slate-500">
      {{ data.serviceName || 'service ?' }}
    </div>
    <div v-else class="flex items-center gap-2 text-[9px] text-slate-400">
      <span v-if="trigger" class="truncate" :title="trigger">⇥ {{ trigger }}</span>
      <span v-if="hoursLabel" class="shrink-0">⏱ {{ hoursLabel }}</span>
    </div>

    <!-- Ancres cachées pour le connecteur de proximité (non tirables). -->
    <Handle id="n-src" type="source" :position="Position.Bottom" :connectable="false" class="hidden-handle" />
    <Handle id="n-tgt" type="target" :position="Position.Top" :connectable="false" class="hidden-handle" />
  </div>
</template>

<style scoped>
.note-card :deep(.hidden-handle) {
  opacity: 0;
  width: 1px;
  height: 1px;
  min-width: 0;
  min-height: 0;
  border: 0;
  pointer-events: none;
}
</style>
