<script setup lang="ts">
// Frame page (v2) : conteneur Vue Flow des blocs. En-tête = badge lot + nom (éditable inline) +
// route + compteurs + pastille d'incomplétude + marqueur page d'accueil. Ports de navigation
// gauche/droite (navigatesTo + quick-create). Largeur fixe, hauteur = pile de blocs (pas de resize).
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { useProjectStore } from '@/stores/project'
import { useUiStore } from '@/stores/ui'
import { useInlineEdit } from '@/composables/useInlineEdit'
import { NAV_ANCHOR_Y, type PageNodeData } from '../useCanvasSync'

const props = defineProps<{
  id: string
  data: PageNodeData
  selected?: boolean
  dragging?: boolean
}>()

const store = useProjectStore()
const ui = useUiStore()

const route = computed(() => props.data.node.attrs.route?.trim() || '—')
const dimmed = computed(() => ui.lotFilter != null && props.data.lot !== ui.lotFilter)

const {
  editing: titleEditing,
  draft: titleDraft,
  inputRef,
  begin: beginTitle,
  commit: commitTitle,
  onKeydown: titleKeydown,
} = useInlineEdit({
  get: () => props.data.node.attrs.name,
  set: (name) => store.updateAttrs(props.id, { name }),
})
</script>

<template>
  <div
    class="page-frame flex h-full w-full flex-col rounded-lg border-2 bg-white/85 shadow-sm transition-shadow"
    :class="selected ? 'border-sky-500 shadow-md' : 'border-slate-300'"
    :style="{ opacity: dimmed ? 0.25 : 1 }"
  >
    <header
      class="flex items-center gap-2 rounded-t-md border-b border-slate-200 bg-slate-50/90 px-2.5 py-1.5"
    >
      <span
        class="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold text-white"
        :style="{ backgroundColor: data.lotColor }"
        :title="`Lot ${data.lot}`"
      >L{{ data.lot }}</span>
      <div class="min-w-0 flex-1">
        <input
          v-if="titleEditing"
          ref="inputRef"
          v-model="titleDraft"
          class="nodrag w-full rounded border border-sky-300 px-1 py-0.5 text-xs font-semibold text-slate-800 outline-none"
          @blur="commitTitle()"
          @keydown="titleKeydown"
        />
        <div
          v-else
          class="truncate text-xs font-semibold text-slate-800"
          title="Double-clic pour renommer"
          @dblclick.stop="beginTitle()"
        >
          {{ data.node.attrs.name || 'Page' }}
        </div>
        <div class="truncate text-[10px] text-slate-500">{{ route }}</div>
      </div>
      <div class="flex shrink-0 items-center gap-1.5 text-[10px] text-slate-500">
        <span v-if="data.isHome" title="Page d’accueil">🏠</span>
        <span v-if="data.blockCount" title="Blocs">▤ {{ data.blockCount }}</span>
        <span v-if="data.noteCount" title="Notes rattachées">✎ {{ data.noteCount }}</span>
        <span
          v-if="data.incomplete"
          class="inline-block h-2 w-2 rounded-full bg-red-500"
          title="Champs obligatoires manquants"
        />
      </div>
    </header>

    <!-- Corps : les blocs sont rendus comme nœuds enfants par Vue Flow -->
    <div class="flex-1"></div>

    <!-- Ports de navigation (navigatesTo + quick-create) : ancrés EN HAUT de la page (côté g/d). -->
    <Handle
      id="nav-target"
      type="target"
      :position="Position.Left"
      class="nav-handle"
      :style="{ top: `${NAV_ANCHOR_Y}px` }"
    />
    <Handle
      id="nav-source"
      type="source"
      :position="Position.Right"
      class="nav-handle"
      :style="{ top: `${NAV_ANCHOR_Y}px` }"
    />
  </div>
</template>

<style scoped>
.page-frame :deep(.nav-handle) {
  width: 10px;
  height: 10px;
  background: #0ea5e9;
  border: 2px solid #fff;
}
</style>
