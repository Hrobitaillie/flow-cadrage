<script setup lang="ts">
// Projection LECTURE SEULE de la vue API (derive/api via project.apiView).
// GROUPÉE PAR SERVICE (evolution-v2.md §4) : URL de base en tête de chaque service, endpoints
// référencés par des notes API, et pour chaque endpoint les pages/blocs consommateurs (remontés
// via attachedTo). Services `risk:high` en tête (mis en évidence — points de fragilité).
// Clic sur un consommateur / service → ui.focusNode() : bascule canvas centré.
import { computed } from 'vue'
import { useProjectStore } from '@/stores/project'
import { useUiStore } from '@/stores/ui'
import { exportApiMarkdown } from '@/io/export/markdown'
import { saveTextAs } from '@/io/file'

const project = useProjectStore()
const ui = useUiStore()

const api = computed(() => project.apiView)

function focus(id: string): void {
  ui.focusNode(id)
}

/** Saute vers une fonctionnalité : bascule en couche fonctionnelle + centre le canvas. */
function focusFeature(id: string): void {
  ui.setCanvasLayer('functional')
  ui.focusNode(id)
}

function slugForFile(): string {
  return (
    project.meta.name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'projet'
  )
}

async function onExportMarkdown(): Promise<void> {
  await saveTextAs(`${slugForFile()}-api.md`, exportApiMarkdown(project.doc), 'text/markdown')
}
</script>

<template>
  <div class="api-view h-full overflow-auto bg-white text-slate-700">
    <header
      class="no-print sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white/95 px-8 py-3 backdrop-blur"
    >
      <h1 class="text-lg font-semibold text-slate-800">Contrat d'API</h1>

      <button
        type="button"
        class="ml-auto rounded border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-100"
        @click="onExportMarkdown"
      >
        Markdown
      </button>
    </header>

    <article class="mx-auto max-w-4xl px-8 py-6">
      <p class="no-print mb-6 text-xs text-slate-400">
        Vue en lecture seule, groupée par service — services à risque élevé en tête.
      </p>

      <p v-if="!api.byService.length" class="text-sm italic text-slate-400">
        Aucun service au registre. Ajoutez des services et rattachez des notes API sur le canvas.
      </p>

      <section
        v-for="group in api.byService"
        :key="group.service.id"
        class="mb-8 rounded-lg border p-4"
        :class="group.service.risk === 'high' ? 'border-rose-200 bg-rose-50/40' : 'border-slate-200'"
      >
        <h2 class="flex flex-wrap items-baseline gap-2 text-sm font-semibold text-slate-800">
          <button type="button" class="hover:underline" @click="focus(group.service.id)">
            {{ group.service.name || 'Service' }}
          </button>
          <span
            class="rounded px-1.5 py-0.5 text-xs font-normal"
            :class="
              group.service.risk === 'high'
                ? 'bg-rose-200 text-rose-800'
                : 'bg-slate-100 text-slate-600'
            "
          >
            risque {{ group.service.risk }}
          </span>
          <span v-if="group.service.auth" class="text-xs font-normal text-slate-500">
            · auth {{ group.service.auth }}
          </span>
        </h2>
        <p class="mt-1 text-xs text-slate-500">
          URL de base :
          <code v-if="group.baseUrl" class="rounded bg-slate-100 px-1 py-0.5 text-slate-700">{{
            group.baseUrl
          }}</code>
          <span v-else class="italic text-slate-400">non renseignée</span>
        </p>
        <p v-if="group.service.notes" class="mt-1 whitespace-pre-line text-xs text-slate-500">
          {{ group.service.notes }}
        </p>

        <p v-if="!group.endpoints.length" class="mt-3 text-xs italic text-slate-400">
          Aucun endpoint référencé par une note API.
        </p>

        <div
          v-for="usage in group.endpoints"
          :key="usage.method + ' ' + usage.path"
          class="mt-3"
        >
          <div class="flex items-center gap-2">
            <code class="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
              {{ usage.method }} {{ usage.path }}
            </code>
            <span
              v-if="usage.consumers.length >= 3"
              class="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700"
              title="Endpoint consommé par de nombreux nœuds (point de fragilité)"
            >
              {{ usage.consumers.length }} consommateurs
            </span>
          </div>
          <ul class="mt-1 space-y-0.5 pl-4 text-sm">
            <li v-for="c in usage.consumers" :key="c.noteId" class="text-slate-600">
              <button type="button" class="text-left hover:underline" @click="focus(c.noteId)">
                {{ c.targetName }}
              </button>
              <span v-if="c.pageName" class="text-slate-400"> (page {{ c.pageName }})</span>
              <span
                v-for="f in c.features"
                :key="f.id"
                class="ml-1 inline-flex items-center gap-1"
              >
                <button
                  type="button"
                  class="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-1.5 py-0 text-[10px] text-violet-700 hover:bg-violet-100"
                  :title="`Voir « ${f.name} » sur le canvas`"
                  @click="focusFeature(f.id)"
                >
                  <span v-if="f.code" class="font-mono text-violet-400">{{ f.code }}</span>
                  {{ f.name || 'Sans titre' }}
                </button>
              </span>
            </li>
          </ul>
        </div>

        <p v-if="group.unreferencedEndpoints.length" class="mt-3 text-xs text-slate-400">
          Endpoints déclarés au registre, non référencés :
          <span v-for="(ep, i) in group.unreferencedEndpoints" :key="i">
            <code>{{ ep.method }} {{ ep.path }}</code
            ><span v-if="i < group.unreferencedEndpoints.length - 1">, </span>
          </span>
        </p>
      </section>
    </article>
  </div>
</template>

<style scoped>
@media print {
  .no-print {
    display: none !important;
  }
  .api-view {
    height: auto;
    overflow: visible;
  }
}
</style>
