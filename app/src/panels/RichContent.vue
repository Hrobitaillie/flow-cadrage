<script setup lang="ts">
// Rendu LECTURE SEULE d'un contenu riche (document Tiptap/ProseMirror JSON) → HTML, via generateHTML
// sur le schéma CONTRÔLÉ (richExtensions). Sûr par construction : le schéma n'autorise ni HTML brut
// ni attribut href/script, donc le HTML produit ne contient que des balises de mise en forme connues
// (p, h1-3, ul/ol/li, strong/em/code, pre, blockquote, br, hr). Utilisé sur la carte, Specs, Catalogue.
import { computed } from 'vue'
import { generateHTML } from '@tiptap/core'
import { richExtensions } from '@/composables/richText'
import { isEmptyDoc, type RichDoc } from '@/model/richContent'

const props = defineProps<{ doc: RichDoc | null | undefined }>()

const html = computed<string>(() => {
  if (isEmptyDoc(props.doc)) return ''
  try {
    return generateHTML(props.doc as never, richExtensions)
  } catch {
    return ''
  }
})
</script>

<template>
  <!-- v-html sûr : sortie de generateHTML sur un schéma CONTRÔLÉ (StarterKit, pas de HTML brut ni
       href/script) → aucune injection possible. Voir l'en-tête du composant. -->
  <!-- eslint-disable-next-line vue/no-v-html -->
  <div v-if="html" class="rich-content" v-html="html" />
</template>

<style scoped>
/* Modèle de bloc IDENTIQUE à RichEditor (mêmes marges/tailles) → l'aperçu et l'édition ont la même
   hauteur, aucun saut au passage préview ↔ éditeur. */
.rich-content :deep(> * + *) {
  margin-top: 0.4em;
}
.rich-content :deep(h1),
.rich-content :deep(h2) {
  font-weight: 700;
  letter-spacing: -0.01em;
  line-height: 1.25;
  color: rgb(15 23 42);
  margin-top: 0.8em;
}
.rich-content :deep(h1) {
  font-size: 1.1em;
}
.rich-content :deep(h2) {
  font-size: 1.1em;
}
.rich-content :deep(h3) {
  font-size: 0.8em;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgb(100 116 139);
  margin-top: 0.7em;
}
.rich-content :deep(ul),
.rich-content :deep(ol) {
  padding-left: 1.3em;
}
.rich-content :deep(li) {
  margin: 0.1em 0;
}
.rich-content :deep(ul) {
  list-style: disc;
}
.rich-content :deep(ol) {
  list-style: decimal;
}
.rich-content :deep(li) {
  margin: 0.1em 0;
}
.rich-content :deep(blockquote) {
  border-left: 2px solid rgb(203 213 225);
  padding-left: 0.7em;
  color: rgb(100 116 139);
  margin: 0.4em 0;
}
.rich-content :deep(code) {
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
  font-size: 0.9em;
  background: rgb(241 245 249);
  padding: 0.05em 0.3em;
  border-radius: 4px;
}
.rich-content :deep(pre) {
  background: rgb(241 245 249);
  padding: 0.6em 0.8em;
  border-radius: 8px;
  overflow-x: auto;
  margin: 0.4em 0;
}
.rich-content :deep(pre code) {
  background: none;
  padding: 0;
}
</style>
