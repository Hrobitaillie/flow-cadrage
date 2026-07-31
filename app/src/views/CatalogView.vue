<script setup lang="ts">
// Projection LECTURE SEULE du CATALOGUE (derive/catalog via project.catalog) — le « cadrage fusionné »
// façon locasyst : par module, une table récap puis une fiche détaillée par fonctionnalité qui réunit
// au même endroit Quoi / Implique / Dépend de / Débloque / Réalisé par / Endpoints / Lot / Estimation.
// Rien ne s'édite ici : tout vient de la couche fonctionnelle du canvas + du pont realizedBy. Clic sur
// une fonctionnalité → couche fonctionnelle centrée ; clic sur un réalisateur → couche structurelle.
// Tout texte utilisateur est rendu par interpolation Vue (échappement auto) : aucun v-html.
import { computed } from 'vue'
import { useProjectStore } from '@/stores/project'
import { useUiStore } from '@/stores/ui'
import { lotColor } from '@/theme/tokens'
import { HOURS_PER_DAY, type EstimateTotal } from '@/domain/derive/estimate'
import { exportCatalogMarkdown } from '@/io/export/markdown'
import { saveTextAs } from '@/io/file'
import FeatureCard from '@/panels/FeatureCard.vue'

const project = useProjectStore()
const ui = useUiStore()

const catalog = computed(() => project.catalog)
const chiffrage = computed(() => project.estimate.features)

/** Formate une fourchette d'heures en jours-homme lisibles (ex. « 3–3,8 j »). */
function days(h: number): string {
  return (h / HOURS_PER_DAY).toLocaleString('fr-FR', { maximumFractionDigits: 1 })
}
function range(t: EstimateTotal): string {
  return t.low === t.high ? `${days(t.low)} j` : `${days(t.low)}–${days(t.high)} j`
}

const PERIMETER_LABELS: Record<string, string> = {
  site: 'Site',
  editor: 'Éditeur',
  internal: 'Interne',
  external: 'Externe',
}
function perimeterLabel(p: string | null): string {
  return p ? PERIMETER_LABELS[p] ?? p : '—'
}

/** Saute vers une fonctionnalité (couche fonctionnelle centrée). */
function focusFeature(id: string): void {
  ui.setCanvasLayer('functional')
  ui.focusNode(id)
}
/** Saute vers une page/un bloc réalisateur (couche structurelle centrée). */
function focusRealizer(id: string): void {
  ui.setCanvasLayer('structural')
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
  await saveTextAs(
    `${slugForFile()}-catalogue.md`,
    exportCatalogMarkdown(project.doc),
    'text/markdown',
  )
}
</script>

<template>
  <div class="catalog-view h-full overflow-auto bg-white text-slate-700">
    <header
      class="no-print sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white/95 px-8 py-3 backdrop-blur"
    >
      <h1 class="text-lg font-semibold text-slate-800">Catalogue des fonctionnalités</h1>
      <div class="ml-auto flex items-center gap-3">
        <span
          v-if="catalog.orphanFeatures.length"
          class="rounded-full bg-violet-100 px-2 py-1 text-xs text-violet-700"
          :title="catalog.orphanFeatures.length + ' fonctionnalité(s) non réalisée(s)'"
        >
          {{ catalog.orphanFeatures.length }} orpheline(s)
        </span>
        <button
          type="button"
          class="rounded border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-100"
          @click="onExportMarkdown"
        >
          Markdown
        </button>
      </div>
    </header>

    <article class="mx-auto max-w-4xl px-8 py-6">
      <p class="no-print mb-6 text-xs text-slate-400">
        Vue en lecture seule — chaque fiche fusionne cadrage, réalisation, API et estimation.
      </p>

      <p v-if="!catalog.groups.length" class="text-sm italic text-slate-400">
        Aucune fonctionnalité. Passez en couche Fonctionnalités sur le canvas pour en créer.
      </p>

      <!-- Synthèse de chiffrage (fonctionnalités → jours-homme) -->
      <section
        v-if="catalog.groups.length"
        class="mb-10 rounded-lg border border-slate-200 bg-slate-50/60 p-4"
      >
        <div class="flex flex-wrap items-baseline gap-3">
          <h2 class="text-base font-semibold text-slate-800">Chiffrage</h2>
          <span class="text-sm text-slate-600">
            Total : <strong>{{ range(chiffrage.total) }}</strong>
            <span class="text-xs text-slate-400"> (fourchette basse–haute)</span>
          </span>
          <span
            v-if="chiffrage.unestimated.length"
            class="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700"
          >
            {{ chiffrage.unestimated.length }} à estimer
          </span>
        </div>

        <div class="mt-3 grid gap-4 sm:grid-cols-2">
          <div v-if="chiffrage.byLot.length">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-slate-400">Par lot</h3>
            <ul class="mt-1 space-y-0.5 text-sm">
              <li v-for="l in chiffrage.byLot" :key="l.key" class="flex items-center gap-2">
                <span
                  class="rounded px-1.5 py-0.5 text-[11px] font-semibold text-white"
                  :style="{ backgroundColor: lotColor(Number(l.key)) }"
                >{{ l.label }}</span>
                <span class="text-slate-600">{{ range(l.total) }}</span>
              </li>
            </ul>
          </div>
          <div v-if="chiffrage.byModule.length">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-slate-400">Par module</h3>
            <ul class="mt-1 space-y-0.5 text-sm">
              <li v-for="m in chiffrage.byModule" :key="m.key" class="flex items-center justify-between gap-2">
                <span class="text-slate-600">{{ m.label }}</span>
                <span class="text-slate-500">{{ range(m.total) }}</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <!-- Un groupe par module -->
      <section v-for="group in catalog.groups" :key="group.moduleId ?? 'root'" class="mb-12">
        <h2 class="text-base font-semibold text-slate-800">{{ group.moduleName }}</h2>
        <p
          v-if="group.module?.attrs.description"
          class="mt-1 whitespace-pre-line text-sm text-slate-500"
        >
          {{ group.module.attrs.description }}
        </p>

        <!-- Table récapitulative -->
        <div class="mt-3 overflow-x-auto">
          <table class="w-full border-collapse text-sm">
            <thead>
              <tr class="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                <th class="py-1.5 pr-3 font-medium">ID</th>
                <th class="py-1.5 pr-3 font-medium">Fonctionnalité</th>
                <th class="py-1.5 pr-3 font-medium">Lot</th>
                <th class="py-1.5 pr-3 font-medium">Périmètre</th>
                <th class="py-1.5 pr-3 font-medium">Dépend de</th>
                <th class="py-1.5 font-medium">Est.</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="f in group.features"
                :key="f.id"
                class="border-b border-slate-100 align-top"
              >
                <td class="py-1.5 pr-3 font-mono text-xs text-slate-500">{{ f.code || '—' }}</td>
                <td class="py-1.5 pr-3">
                  <button type="button" class="text-left hover:underline" @click="focusFeature(f.id)">
                    {{ f.name || 'Sans titre' }}
                  </button>
                  <span
                    v-if="f.orphan"
                    class="ml-1 rounded bg-violet-100 px-1 text-[10px] text-violet-700"
                    title="Aucune page/bloc ne réalise cette fonctionnalité"
                  >
                    orpheline
                  </span>
                </td>
                <td class="py-1.5 pr-3">
                  <span
                    class="rounded px-1.5 py-0.5 text-[11px] font-semibold text-white"
                    :style="{ backgroundColor: lotColor(f.lot) }"
                  >
                    L{{ f.lot }}
                  </span>
                </td>
                <td class="py-1.5 pr-3 text-slate-600">{{ perimeterLabel(f.perimeter) }}</td>
                <td class="py-1.5 pr-3 text-xs text-slate-500">
                  <template v-if="f.dependsOn.length">
                    <span v-for="(d, i) in f.dependsOn" :key="d.id">
                      <button type="button" class="hover:underline" @click="focusFeature(d.id)">{{ d.code || d.name }}</button><span v-if="i < f.dependsOn.length - 1">, </span>
                    </span>
                  </template>
                  <span v-else>—</span>
                </td>
                <td class="py-1.5 text-slate-600">{{ f.estimate || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Fiches détaillées (composant partagé avec le document Specs) -->
        <FeatureCard
          v-for="f in group.features"
          :key="f.id + '-card'"
          :feature="f"
          class="mt-6 border-t border-slate-100 pt-5"
          @navigate-feature="focusFeature"
          @navigate-realizer="focusRealizer"
        />
      </section>
    </article>
  </div>
</template>

<style scoped>
@media print {
  .no-print {
    display: none !important;
  }
  .catalog-view {
    height: auto;
    overflow: visible;
  }
  .feature-card {
    break-inside: avoid;
    page-break-inside: avoid;
  }
}
</style>
