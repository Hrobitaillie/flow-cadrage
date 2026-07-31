<script setup lang="ts">
// Éditeur de contenu riche « Notion-like » (Tiptap). Saisie markdown native (## titre, - liste,
// **gras**…) + BARRE DE MISE EN FORME flottante à la sélection, PORTÉE DANS <body> (hors du canvas
// Vue Flow transformé) → taille CONSTANTE quel que soit le zoom. Poignées de bloc (drag handle) en
// variante sidebar. Émet le JSON ProseMirror (v-model), resync externe sans casser la saisie.
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import DragHandle from '@tiptap/extension-drag-handle-vue-3'
import { richEditExtensions } from '@/composables/richText'
import { EMPTY_DOC, type RichDoc } from '@/model/richContent'

const props = withDefaults(
  defineProps<{ modelValue: RichDoc | null; placeholder?: string; variant?: 'sidebar' | 'card' }>(),
  {
    placeholder: "Écrivez quelque chose… (## titre, - liste, **gras**)",
    variant: 'sidebar',
  },
)
const emit = defineEmits<{ (e: 'update:modelValue', doc: RichDoc): void }>()

// ── Barre flottante (position écran, portée dans body) ──────────────────────────
const bubble = ref<{ show: boolean; x: number; y: number }>({ show: false, x: 0, y: 0 })
function updateBubble(): void {
  const ed = editor.value
  if (!ed || !ed.isEditable) {
    bubble.value = { show: false, x: 0, y: 0 }
    return
  }
  const { empty, from, to } = ed.state.selection
  if (empty || !ed.isFocused) {
    bubble.value = { ...bubble.value, show: false }
    return
  }
  try {
    const s = ed.view.coordsAtPos(from)
    const e = ed.view.coordsAtPos(to)
    bubble.value = { show: true, x: (s.left + e.left) / 2, y: Math.min(s.top, e.top) }
  } catch {
    bubble.value = { ...bubble.value, show: false }
  }
}
function onReposition(): void {
  if (bubble.value.show) updateBubble()
}

const editor = useEditor({
  content: (props.modelValue ?? EMPTY_DOC) as never,
  extensions: richEditExtensions(props.placeholder),
  editorProps: { attributes: { class: 'rich-editor-body' } },
  onUpdate: ({ editor }) => {
    emit('update:modelValue', editor.getJSON() as RichDoc)
    updateBubble()
  },
  onSelectionUpdate: updateBubble,
  onFocus: updateBubble,
  onBlur: () => {
    bubble.value = { ...bubble.value, show: false }
  },
})

// Resynchronisation externe (changement de fonctionnalité, undo/redo) — sans casser le focus/saisie.
watch(
  () => props.modelValue,
  (doc) => {
    const ed = editor.value
    if (!ed || ed.isFocused) return
    const next = doc ?? EMPTY_DOC
    if (JSON.stringify(ed.getJSON()) !== JSON.stringify(next)) {
      ed.commands.setContent(next as never, { emitUpdate: false })
    }
  },
)

onMounted(() => {
  window.addEventListener('scroll', onReposition, true)
  window.addEventListener('wheel', onReposition, { passive: true })
  window.addEventListener('resize', onReposition)
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onReposition, true)
  window.removeEventListener('wheel', onReposition)
  window.removeEventListener('resize', onReposition)
  editor.value?.destroy()
})

interface MenuBtn {
  label: string
  title: string
  active: string | [string, Record<string, unknown>]
  run: () => void
}
const bubbleButtons: MenuBtn[] = [
  { label: 'B', title: 'Gras', active: 'bold', run: () => editor.value?.chain().focus().toggleBold().run() },
  { label: 'I', title: 'Italique', active: 'italic', run: () => editor.value?.chain().focus().toggleItalic().run() },
  { label: '</>', title: 'Code', active: 'code', run: () => editor.value?.chain().focus().toggleCode().run() },
  { label: 'H2', title: 'Titre', active: ['heading', { level: 2 }], run: () => editor.value?.chain().focus().toggleHeading({ level: 2 }).run() },
  { label: 'H3', title: 'Sous-titre', active: ['heading', { level: 3 }], run: () => editor.value?.chain().focus().toggleHeading({ level: 3 }).run() },
  { label: '•', title: 'Liste', active: 'bulletList', run: () => editor.value?.chain().focus().toggleBulletList().run() },
  { label: '1.', title: 'Liste numérotée', active: 'orderedList', run: () => editor.value?.chain().focus().toggleOrderedList().run() },
  { label: '"', title: 'Citation', active: 'blockquote', run: () => editor.value?.chain().focus().toggleBlockquote().run() },
]
function isActive(a: MenuBtn['active']): boolean {
  const ed = editor.value
  if (!ed) return false
  return Array.isArray(a) ? ed.isActive(a[0], a[1]) : ed.isActive(a)
}
</script>

<template>
  <div class="rich-editor" :class="`rich-editor--${variant}`">
    <!-- Barre flottante portée dans body : taille constante (hors transformation du canvas). -->
    <Teleport to="body">
      <div
        v-if="bubble.show"
        class="bubble-menu"
        :style="{ left: bubble.x + 'px', top: bubble.y - 8 + 'px' }"
      >
        <button
          v-for="b in bubbleButtons"
          :key="b.label"
          type="button"
          class="bubble-btn"
          :class="{ 'bubble-btn--active': isActive(b.active) }"
          :title="b.title"
          @mousedown.prevent="b.run()"
        >{{ b.label }}</button>
      </div>
    </Teleport>

    <!-- Poignée de bloc au survol (drag + réordonner), variante pleine largeur uniquement. -->
    <DragHandle v-if="editor && variant === 'sidebar'" :editor="editor">
      <div class="drag-handle" title="Glisser pour réordonner">
        <svg viewBox="0 0 10 10" width="10" height="10" fill="currentColor"><circle cx="3" cy="2" r="1" /><circle cx="7" cy="2" r="1" /><circle cx="3" cy="5" r="1" /><circle cx="7" cy="5" r="1" /><circle cx="3" cy="8" r="1" /><circle cx="7" cy="8" r="1" /></svg>
      </div>
    </DragHandle>

    <EditorContent :editor="editor" />
  </div>
</template>

<style scoped>
/* ── Corps de l'éditeur (aspect Notion) ── */
.rich-editor :deep(.rich-editor-body) {
  outline: none;
  color: rgb(30 41 59);
}
.rich-editor--sidebar :deep(.rich-editor-body) {
  min-height: 180px;
  font-size: 15px;
  line-height: 1.65;
}
.rich-editor--card :deep(.rich-editor-body) {
  min-height: 20px;
  font-size: 10px;
  line-height: 1.5;
}
/* Modèle de bloc PARTAGÉ avec l'aperçu RichContent (mêmes marges/tailles → pas de saut à la sélection). */
.rich-editor :deep(.rich-editor-body > * + *) {
  margin-top: 0.4em;
}
.rich-editor :deep(h1),
.rich-editor :deep(h2) {
  font-weight: 700;
  letter-spacing: -0.01em;
  color: rgb(15 23 42);
  margin-top: 0.8em;
}
.rich-editor--sidebar :deep(h1) { font-size: 1.5em; }
.rich-editor--sidebar :deep(h2) { font-size: 1.25em; }
.rich-editor--card :deep(h1),
.rich-editor--card :deep(h2) { font-size: 1.1em; }
.rich-editor :deep(h3) {
  font-size: 0.8em;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgb(100 116 139);
  margin-top: 0.7em;
}
.rich-editor :deep(ul),
.rich-editor :deep(ol) { padding-left: 1.3em; }
.rich-editor :deep(ul) { list-style: disc; }
.rich-editor :deep(ol) { list-style: decimal; }
.rich-editor :deep(li) { margin: 0.1em 0; }
.rich-editor :deep(blockquote) {
  border-left: 3px solid rgb(203 213 225);
  padding-left: 0.8em;
  color: rgb(71 85 105);
}
.rich-editor :deep(code) {
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
  font-size: 0.88em;
  background: rgb(241 245 249);
  padding: 0.08em 0.35em;
  border-radius: 4px;
}
.rich-editor :deep(pre) {
  background: rgb(30 41 59);
  color: rgb(226 232 240);
  padding: 0.7em 0.9em;
  border-radius: 8px;
  overflow-x: auto;
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
  font-size: 0.85em;
}
.rich-editor :deep(pre code) {
  background: none;
  color: inherit;
  padding: 0;
}
/* Placeholder par bloc vide (extension Placeholder). */
.rich-editor :deep(.is-empty::before) {
  content: attr(data-placeholder);
  color: rgb(148 163 184);
  float: left;
  height: 0;
  pointer-events: none;
}

/* ── Poignée de bloc (drag handle) ── */
.drag-handle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 20px;
  margin-right: 2px;
  border-radius: 5px;
  color: rgb(148 163 184);
  cursor: grab;
  transition: background-color 120ms ease;
}
.drag-handle:hover {
  background: rgb(241 245 249);
  color: rgb(71 85 105);
}
</style>

<!-- Barre flottante : NON scopée (portée dans body, hors du composant). -->
<style>
.bubble-menu {
  position: fixed;
  z-index: 60;
  display: flex;
  gap: 1px;
  padding: 3px;
  border-radius: 10px;
  background: rgb(15 23 42);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.28);
  transform: translate(-50%, -100%);
}
.bubble-menu .bubble-btn {
  min-width: 26px;
  padding: 3px 6px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  color: rgb(203 213 225);
  transition: background-color 120ms ease, color 120ms ease;
}
.bubble-menu .bubble-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}
.bubble-menu .bubble-btn--active {
  background: rgb(139 92 246);
  color: #fff;
}
</style>
