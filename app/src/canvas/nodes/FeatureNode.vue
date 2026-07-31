<script setup lang="ts">
// Carte fonctionnalité : champs STRUCTURÉS éditables inline (lot, code, estimation, périmètre, titre)
// + APERÇU du contenu riche (lecture seule, clampé) + « Réalisé par ». Le contenu détaillé se rédige
// dans l'éditeur plein hauteur (badge « Éditer » → Tiptap). Ports « dépend de » DYNAMIQUES.
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { useProjectStore } from '@/stores/project'
import { useUiStore } from '@/stores/ui'
import { useInlineEdit } from '@/composables/useInlineEdit'
import type { Perimeter } from '@/model/types'
import { isEmptyDoc, type RichDoc } from '@/model/richContent'
import { type FeatureNodeData, type CardSide } from '../useCanvasSync'
import RichContent from '@/panels/RichContent.vue'
import RichEditor from '@/panels/RichEditor.vue'

const props = defineProps<{
  id: string
  data: FeatureNodeData
  selected?: boolean
  dragging?: boolean
}>()

const store = useProjectStore()
const ui = useUiStore()

/** Ouvre l'éditeur plein hauteur (badge « Éditer » ou double-clic sur le contenu) + sélectionne. */
function openEditor(): void {
  ui.select(props.id)
  ui.openEditor(props.id)
}

// Bouton « + » de création adjacente : au survol, un seul bouton apparaît, sur le côté le plus proche
// du curseur, à l'extérieur de la carte. Clic → crée une fonctionnalité de ce côté (via useCanvasSync).
type Side = 'top' | 'right' | 'bottom' | 'left'
const hoverSide = ref<Side | null>(null)
// Le bouton est À L'EXTÉRIEUR de la carte (petit gap), donc entre carte et bouton il y a une zone
// morte : on masque avec un léger DÉLAI pour que le curseur puisse traverser le gap sans le perdre.
let hideTimer: ReturnType<typeof setTimeout> | undefined
function onHoverMove(e: MouseEvent): void {
  clearTimeout(hideTimer)
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2 || 1)
  const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2 || 1)
  hoverSide.value = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'bottom' : 'top'
}
function scheduleHide(): void {
  clearTimeout(hideTimer)
  hideTimer = setTimeout(() => (hoverSide.value = null), 180)
}
function keepHover(): void {
  clearTimeout(hideTimer)
}
function addAdjacent(side: Side): void {
  clearTimeout(hideTimer)
  hoverSide.value = null
  window.dispatchEvent(new CustomEvent('flooow:add-adjacent', { detail: { id: props.id, side } }))
}

const dimmed = computed(() => ui.lotFilter != null && props.data.lot !== ui.lotFilter)
const a = computed(() => props.data.node.attrs)
const c = computed(() => props.data.clamps)
const realizers = computed(() => store.realizersOfFeature(props.id))

/** Va à une page/un bloc réalisateur (couche structurelle centrée). */
function goRealizer(id: string): void {
  ui.setCanvasLayer('structural')
  ui.focusNode(id)
}

const LOT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8]
const PERIMETERS: { id: '' | Perimeter; label: string }[] = [
  { id: '', label: 'Périmètre' },
  { id: 'site', label: 'Site' },
  { id: 'editor', label: 'Éditeur' },
  { id: 'internal', label: 'Interne' },
  { id: 'external', label: 'Externe' },
]

function setCode(e: Event): void {
  store.updateAttrs(props.id, { code: (e.target as HTMLInputElement).value })
}
function setEstimate(e: Event): void {
  store.updateAttrs(props.id, { estimate: (e.target as HTMLInputElement).value })
}
function setLot(e: Event): void {
  const v = (e.target as HTMLSelectElement).value
  store.assignLot(props.id, v === '' ? null : Number(v))
}
function setPerimeter(e: Event): void {
  const v = (e.target as HTMLSelectElement).value
  store.updateAttrs(props.id, { perimeter: v === '' ? null : (v as Perimeter) })
}

// Titre éditable inline (double-clic).
const nameEd = useInlineEdit({
  get: () => a.value.name,
  set: (name) => store.updateAttrs(props.id, { name }),
})

// Contenu riche éditable inline (carte sélectionnée) : commit débouncé + coalescé.
let contentTimer: ReturnType<typeof setTimeout> | undefined
let pendingDoc: RichDoc | null = null
function onContent(doc: RichDoc): void {
  pendingDoc = doc
  if (contentTimer) clearTimeout(contentTimer)
  contentTimer = setTimeout(commitContent, 400)
}
function commitContent(): void {
  if (contentTimer) {
    clearTimeout(contentTimer)
    contentTimer = undefined
  }
  if (pendingDoc) {
    store.updateAttrs(props.id, { content: pendingDoc }, `feat-content:${props.id}`)
    pendingDoc = null
  }
}
// Commit immédiat à la désélection (l'éditeur inline va disparaître).
watch(
  () => props.selected,
  (sel, prev) => {
    if (prev && !sel) commitContent()
  },
)
onBeforeUnmount(() => {
  commitContent()
  clearTimeout(hideTimer)
})

const POS: Record<CardSide, Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
}
function handleStyle(side: CardSide, offset: number): Record<string, string> {
  return side === 'left' || side === 'right' ? { top: `${offset}px` } : { left: `${offset}px` }
}
function clampStyle(lines: number): Record<string, string> {
  return { '-webkit-line-clamp': String(lines) }
}
</script>

<template>
  <!-- Le nœud est en hauteur AUTO (minHeight) : la carte épouse toujours son contenu (jamais de clip). -->
  <div
    class="group relative w-full"
    :style="{ opacity: dimmed ? 0.25 : 1 }"
    @mousemove="onHoverMove"
    @mouseleave="scheduleHide"
  >
    <!-- Bouton « + » de création adjacente : un seul, sur le côté approché, à l'extérieur de la carte. -->
    <button
      v-if="hoverSide && !dimmed"
      type="button"
      class="nodrag nopan add-adjacent absolute z-30 flex h-5 w-5 items-center justify-center rounded-md border border-violet-300 bg-white text-violet-600 shadow-sm transition-colors hover:bg-violet-600 hover:text-white"
      :class="{
        'left-1/2 -translate-x-1/2 -top-[24px]': hoverSide === 'top',
        'left-1/2 -translate-x-1/2 -bottom-[24px]': hoverSide === 'bottom',
        'top-1/2 -translate-y-1/2 -left-[24px]': hoverSide === 'left',
        'top-1/2 -translate-y-1/2 -right-[24px]': hoverSide === 'right',
      }"
      title="Ajouter une fonctionnalité de ce côté"
      @click.stop="addAdjacent(hoverSide)"
      @mousedown.stop
      @mouseenter="keepHover"
    >
      <svg viewBox="0 0 14 14" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M7 3v8M3 7h8" stroke-linecap="round" />
      </svg>
    </button>

    <!-- Badge « Éditer » : ouvre l'éditeur plein hauteur (contenu riche, champs vides). -->
    <button
      v-if="!dimmed"
      type="button"
      class="nodrag edit-pill absolute -top-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-full bg-violet-600 px-2.5 py-1 text-[10px] font-semibold text-white opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100"
      :class="{ '!opacity-100': selected }"
      title="Ouvrir l'éditeur (contenu détaillé)"
      @click.stop="openEditor"
      @mousedown.stop
    >
      <svg viewBox="0 0 20 20" class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 13.5V16h2.5L14 8.5 11.5 6 4 13.5zM12.5 5l2.5 2.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
      Éditer
    </button>

    <div
      class="feature-node flex w-full flex-col rounded-lg border bg-white px-2.5 py-2 shadow-sm transition-shadow"
      :class="selected ? 'relative z-10 border-violet-500 shadow-md ring-1 ring-violet-300' : 'border-slate-200 hover:border-violet-300 hover:shadow'"
    >
      <!-- Ligne badges : lot (select), code (input), orphelin, estimation (input), incomplétude -->
      <div class="mb-1 flex items-center gap-1.5">
        <select
          class="nodrag shrink-0 cursor-pointer rounded border-0 px-1 py-0.5 text-[9px] font-semibold text-white outline-none"
          :style="{ backgroundColor: data.lotColor }"
          :value="data.node.lot != null ? String(data.node.lot) : ''"
          title="Lot"
          @change="setLot"
          @mousedown.stop
          @dblclick.stop
        >
          <option value="">L{{ data.lot }} · hérité</option>
          <option v-for="l in LOT_OPTIONS" :key="l" :value="String(l)">Lot {{ l }}</option>
        </select>
        <input
          :value="a.code"
          class="nodrag w-[64px] min-w-0 shrink rounded bg-violet-100 px-1 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wide text-violet-700 outline-none placeholder:text-violet-300 focus:ring-1 focus:ring-violet-400"
          placeholder="CODE"
          aria-label="Code"
          @change="setCode"
          @mousedown.stop
          @dblclick.stop
          @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
        />
        <span
          v-if="data.orphan"
          class="shrink-0 rounded bg-violet-50 px-1 py-0.5 text-[9px] font-semibold text-violet-500"
          title="Non réalisée : aucune page ni bloc ne réalise cette fonctionnalité"
        >⌀</span>
        <input
          :value="a.estimate"
          class="nodrag ml-auto w-[52px] shrink-0 rounded bg-emerald-50 px-1 py-0.5 text-right text-[9px] font-semibold text-emerald-700 outline-none placeholder:font-normal placeholder:text-emerald-400 focus:ring-1 focus:ring-emerald-400"
          placeholder="estimer"
          aria-label="Estimation"
          @change="setEstimate"
          @mousedown.stop
          @dblclick.stop
          @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
        />
        <span
          v-if="data.incomplete"
          class="ml-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
          title="À compléter"
        />
      </div>

      <!-- Titre (éditable inline) -->
      <textarea
        v-if="nameEd.editing.value"
        :ref="(el) => (nameEd.inputRef.value = el as HTMLTextAreaElement | null)"
        v-model="nameEd.draft.value"
        rows="2"
        class="nodrag edit-area w-full resize-none rounded border border-violet-300 px-1 text-[11.5px] font-semibold text-slate-800 outline-none"
        @blur="nameEd.commit()"
        @keydown="nameEd.onKeydown"
      />
      <div
        v-else
        class="editable clamp text-[11.5px] font-semibold leading-tight text-slate-800"
        :style="clampStyle(c.name)"
        title="Double-clic pour renommer"
        @dblclick.stop="nameEd.begin()"
      >{{ a.name || 'Fonctionnalité' }}</div>

      <!-- Contenu : éditeur riche INLINE quand la carte est sélectionnée ; sinon aperçu clampé. -->
      <div v-if="selected" class="nodrag mt-1 feature-editor-inline" @mousedown.stop @dblclick.stop>
        <RichEditor variant="card" :model-value="a.content" @update:model-value="onContent" />
      </div>
      <div
        v-else-if="!isEmptyDoc(a.content)"
        class="mt-1 cursor-text text-[10px] leading-snug text-slate-500"
        title="Sélectionner pour éditer le contenu"
      >
        <RichContent :doc="a.content" class="feature-preview" />
      </div>

      <!-- Réalisé par -->
      <div v-if="realizers.length" class="mt-1.5">
        <div class="field-label">Réalisé par</div>
        <div class="mt-0.5 flex flex-wrap gap-1">
          <button
            v-for="r in realizers"
            :key="r.id"
            type="button"
            class="nodrag inline-flex items-center gap-1 rounded border border-cyan-200 bg-cyan-50 px-1 py-0.5 text-[9px] font-medium text-cyan-700 hover:bg-cyan-100"
            :title="`Aller à « ${r.attrs.name} »`"
            @click.stop="goRealizer(r.id)"
            @mousedown.stop
          >
            <span class="text-[8px] uppercase text-cyan-400">{{ r.kind === 'page' ? 'page' : 'bloc' }}</span>
            <span class="max-w-[90px] truncate">{{ r.attrs.name || 'Sans nom' }}</span>
          </button>
        </div>
      </div>

      <!-- Périmètre (sélecteur, toujours présent) -->
      <div class="mt-1.5 flex items-center">
        <select
          class="nodrag cursor-pointer rounded bg-slate-100 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-slate-500 outline-none focus:ring-1 focus:ring-violet-400"
          :value="a.perimeter ?? ''"
          aria-label="Périmètre"
          @change="setPerimeter"
          @mousedown.stop
          @dblclick.stop
        >
          <option v-for="p in PERIMETERS" :key="p.id || 'none'" :value="p.id">{{ p.label }}</option>
        </select>
      </div>

      <!-- Ports « dépend de » -->
      <Handle
        v-for="h in data.handles"
        :id="h.id"
        :key="h.id"
        :type="h.type"
        :position="POS[h.side]"
        :connectable="h.connectable"
        :style="handleStyle(h.side, h.offset)"
        class="dep-handle"
        :class="h.free ? 'dep-free' : 'dep-dot'"
      />
      <Handle id="c" type="target" :position="Position.Left" :connectable="true" class="dep-catch" />
    </div>
  </div>
</template>

<style scoped>
.clamp {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.editable {
  border-radius: 4px;
  margin: 0 -2px;
  padding: 0 2px;
  cursor: text;
  transition: background-color 120ms ease;
}
.editable:hover {
  background: rgba(139, 92, 246, 0.07);
}
.editing-open {
  overflow: visible;
  z-index: 40;
}
.edit-area {
  position: relative;
  z-index: 10;
  background: #fff;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.12);
}
/* Aperçu du contenu riche : hérite du 10px du conteneur ; le modèle de bloc (h3, marges) vient de
   RichContent, IDENTIQUE à l'éditeur inline → pas de saut de hauteur au passage aperçu ↔ édition. */
.feature-node :deep(.feature-preview) {
  line-height: 1.5;
}
.field-label {
  margin-top: 4px;
  font-size: 8px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgb(148 163 184);
}
.feature-node :deep(.dep-handle) {
  width: 7px;
  height: 7px;
  background: #8b5cf6;
  border: 1.5px solid #fff;
}
.feature-node :deep(.dep-free) {
  opacity: 0;
  background: #c4b5fd;
  transition: opacity 120ms ease;
}
.feature-node:hover :deep(.dep-free) {
  opacity: 0.85;
}
.feature-node :deep(.dep-hidden) {
  opacity: 0 !important;
}
.feature-node :deep(.dep-catch) {
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 16px;
  height: 16px;
  min-width: 0;
  min-height: 0;
  opacity: 0;
  background: transparent;
  border: none;
  pointer-events: none;
}
</style>
