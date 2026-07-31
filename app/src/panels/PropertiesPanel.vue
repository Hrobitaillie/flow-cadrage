<script setup lang="ts">
// Panneau de propriétés (droite) — édition du nœud v2 sélectionné (page, bloc, note comportement,
// note API). Voir evolution-v2.md §2/§3.
//
// ÉDITION PAR BUFFER LOCAL (exigence critique / perfs) :
// Les champs texte sont liés à un buffer réactif LOCAL (`buf`), jamais directement au store. Taper
// ne mute donc pas le graphe → `graphVersion` ne bouge pas → le canvas NE se re-rend PAS.
// La propagation vers le store se fait :
//   - en débounce 300 ms après la dernière frappe (scheduleCommit),
//   - et immédiatement au blur d'un champ (flush).
// Les contrôles discrets (lot, facette, type de bloc, choix de service/endpoint) commitent aussi
// immédiatement. Au changement de sélection on flush l'ancien nœud puis on recharge le buffer.
// Un watch sur `graphVersion` recharge le buffer après undo/redo ou mutation externe, SAUF si
// le focus est dans le panneau (pour ne pas écraser une saisie en cours).
import { reactive, ref, computed, watch, onBeforeUnmount } from 'vue'
import { useUiStore } from '@/stores/ui'
import { useProjectStore, type AttrsPatch, SITE_SELECTION_ID } from '@/stores/project'
import { usePanelState } from '@/composables/useKeyboard'
import {
  BLOCK_TYPES,
  isApiNote,
  isBehaviorNote,
  isBlock,
  isFeature,
  isModule,
  isNote,
  isPage,
} from '@/model/types'
import type { BlockType, Facet, FlooowNode, Perimeter, Risk } from '@/model/types'
import { lotColor } from '@/theme/tokens'
import FloatingPanel from './FloatingPanel.vue'
import RealizationSection from './RealizationSection.vue'

const ui = useUiStore()
const project = useProjectStore()
const panelState = usePanelState()

const FACETS: { id: '' | Facet; label: string }[] = [
  { id: '', label: 'Aucune' },
  { id: 'front', label: 'Front' },
  { id: 'back', label: 'Back' },
  { id: 'fullstack', label: 'Fullstack' },
]
const RISKS: Risk[] = ['low', 'medium', 'high']
const PERIMETER_OPTIONS: { id: '' | Perimeter; label: string }[] = [
  { id: '', label: 'Aucun' },
  { id: 'site', label: 'Site' },
  { id: 'editor', label: 'Éditeur' },
  { id: 'internal', label: 'Interne' },
  { id: 'external', label: 'Externe' },
]
const LOT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8]
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
const BLOCK_TYPE_OPTIONS: BlockType[] = BLOCK_TYPES

/** Libellé lisible d'un nœud (les notes API n'ont pas de champ `name`). */
function nodeName(n: FlooowNode): string {
  if (isApiNote(n)) return `${n.attrs.method} ${n.attrs.path}`.trim() || 'Note API'
  return n.attrs.name
}

// ── Sélection ─────────────────────────────────────────────────────────────────
const selectedIds = computed(() => ui.selectedIds)
const isMulti = computed(() => selectedIds.value.length > 1)
/** Le « Site » (contexte transversal) est sélectionné via une sentinelle, pas un vrai nœud. */
const isSite = computed(() => ui.selectedId === SITE_SELECTION_ID)
const node = computed<FlooowNode | undefined>(() =>
  ui.selectedId && !isSite.value ? project.nodeById(ui.selectedId) : undefined,
)
const nodeKindLabel = computed(() => {
  if (isSite.value) return 'Projet · contexte'
  const n = node.value
  if (!n) return ''
  if (isPage(n)) return 'Page'
  if (isBlock(n)) return 'Bloc'
  if (isModule(n)) return 'Module'
  if (isFeature(n)) return 'Fonctionnalité'
  if (isBehaviorNote(n)) return 'Note comportement'
  return 'Note API'
})
const completeness = computed(() =>
  ui.selectedId ? project.completenessOf(ui.selectedId) : { missing: [], complete: true },
)
const lotProvenance = computed(() =>
  ui.selectedId ? project.lotProvenanceOf(ui.selectedId) : null,
)
const lotSourceName = computed(() => {
  const p = lotProvenance.value
  if (!p || !p.sourceId) return null
  const src = project.nodeById(p.sourceId)
  return src ? nodeName(src) : p.sourceId
})

// ── Buffer local (champs texte) ─────────────────────────────────────────────────
const buf = reactive({
  name: '',
  description: '',
  route: '',
  roles: '', // séparé par virgules
  constraints: '', // une contrainte par ligne
  logic: '',
  notes: '',
  facet: '' as '' | Facet,
  trigger: '',
  rules: '',
  hours: '',
  // note API
  serviceId: '',
  method: '',
  path: '',
  // fonctionnalité (couche fonctionnelle)
  code: '',
  implies: '',
  perimeter: '' as '' | Perimeter,
  estimate: '',
  toConfirm: '',
})

// Buffer d'édition du service référencé par une note API (registre partagé `doc.services`).
const svcBuf = reactive({
  name: '',
  baseUrl: '',
  auth: '',
  risk: 'low' as Risk,
})

// Buffer d'édition du contexte transversal (site) — description projet, contraintes globales, notes.
const siteBuf = reactive({ context: '', constraints: '', notes: '' })

const panelRef = ref<HTMLElement | null>(null)
let timer: ReturnType<typeof setTimeout> | undefined
// Id du nœud actuellement représenté par `buf`. Garde-fou anti-course lors des créations
// (le nœud est créé PUIS sélectionné dans le même tick).
let bufferedId: string | null = null

function panelHasFocus(): boolean {
  const el = panelRef.value
  return !!el && el.contains(document.activeElement)
}
function toLines(s: string): string[] {
  return s.split('\n').map((l) => l.trim()).filter(Boolean)
}
function toList(s: string): string[] {
  return s.split(',').map((l) => l.trim()).filter(Boolean)
}

function loadBuffer(id: string | null): void {
  if (!id) return
  if (id === SITE_SELECTION_ID) {
    bufferedId = id
    siteBuf.context = project.site.attrs.context
    siteBuf.constraints = project.site.attrs.constraints.join('\n')
    siteBuf.notes = project.site.attrs.notes
    return
  }
  const n = project.nodeById(id)
  if (!n) return
  bufferedId = id
  buf.notes = isFeature(n) ? '' : n.attrs.notes // la fonctionnalité n'a plus de champ `notes` (v4)
  if (isPage(n)) {
    buf.name = n.attrs.name
    buf.description = n.attrs.description
    buf.route = n.attrs.route ?? ''
    buf.roles = (n.attrs.roles ?? []).join(', ')
    buf.constraints = n.attrs.constraints.join('\n')
    buf.logic = n.attrs.logic
  } else if (isBlock(n)) {
    buf.name = n.attrs.name
    buf.description = n.attrs.description
    buf.constraints = n.attrs.constraints.join('\n')
  } else if (isModule(n)) {
    buf.name = n.attrs.name
    buf.description = n.attrs.description
  } else if (isFeature(n)) {
    // Fonctionnalité : champs structurés seulement (le contenu riche s'édite dans l'éditeur split).
    buf.name = n.attrs.name
    buf.code = n.attrs.code
    buf.perimeter = n.attrs.perimeter ?? ''
    buf.estimate = n.attrs.estimate
  } else if (isBehaviorNote(n)) {
    buf.name = n.attrs.name
    buf.description = n.attrs.description
    buf.facet = n.attrs.facet ?? ''
    buf.trigger = n.attrs.trigger
    buf.rules = n.attrs.rules
    buf.hours = n.attrs.hours == null ? '' : String(n.attrs.hours)
  } else if (isApiNote(n)) {
    buf.serviceId = n.attrs.serviceId
    buf.method = n.attrs.method
    buf.path = n.attrs.path
    buf.facet = n.attrs.facet ?? ''
    serviceQuery.value = project.serviceById(n.attrs.serviceId)?.name ?? ''
    loadSvcBuffer()
  }
}

function buildPatch(id: string): AttrsPatch | null {
  const n = project.nodeById(id)
  if (!n) return null
  if (isPage(n)) {
    return {
      name: buf.name,
      route: buf.route,
      roles: toList(buf.roles),
      description: buf.description,
      constraints: toLines(buf.constraints),
      logic: buf.logic,
      notes: buf.notes,
    }
  }
  if (isBlock(n)) {
    return {
      name: buf.name,
      description: buf.description,
      constraints: toLines(buf.constraints),
      notes: buf.notes,
    }
  }
  if (isModule(n)) {
    return { name: buf.name, description: buf.description, notes: buf.notes }
  }
  if (isFeature(n)) {
    return {
      code: buf.code,
      name: buf.name,
      perimeter: buf.perimeter === '' ? null : buf.perimeter,
      estimate: buf.estimate,
    }
  }
  if (isBehaviorNote(n)) {
    const hours = buf.hours.trim() === '' ? null : Number(buf.hours)
    return {
      name: buf.name,
      description: buf.description,
      facet: buf.facet === '' ? null : buf.facet,
      trigger: buf.trigger,
      rules: buf.rules,
      hours: hours != null && Number.isFinite(hours) ? hours : null,
      notes: buf.notes,
    }
  }
  // note API
  return {
    serviceId: buf.serviceId,
    method: buf.method,
    path: buf.path,
    facet: buf.facet === '' ? null : buf.facet,
    notes: buf.notes,
  }
}

function commitNow(id: string | null): void {
  if (timer) {
    clearTimeout(timer)
    timer = undefined
  }
  if (!id) return
  if (id !== bufferedId) return
  if (id === SITE_SELECTION_ID) {
    project.updateSite({
      context: siteBuf.context,
      constraints: toLines(siteBuf.constraints),
      notes: siteBuf.notes,
    })
    return
  }
  const patch = buildPatch(id)
  if (patch) project.updateAttrs(id, patch)
}
function scheduleCommit(): void {
  const id = ui.selectedId
  if (!id) return
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => commitNow(id), 300)
}
function flush(): void {
  commitNow(ui.selectedId)
}

// ── Lot & facette (contrôles à commit immédiat) ───────────────────────────────
function setLot(value: string): void {
  const lot = value === '' ? null : Number(value)
  for (const id of selectedIds.value) project.assignLot(id, lot)
}
function setFacet(value: string): void {
  const facet = value === '' ? null : (value as Facet)
  buf.facet = value === '' ? '' : (value as Facet)
  for (const id of selectedIds.value) {
    const n = project.nodeById(id)
    if (n && isNote(n)) project.updateAttrs(id, { facet })
  }
}

// ── Type de bloc (commit immédiat) ─────────────────────────────────────────────
function setBlockType(value: string): void {
  const id = ui.selectedId
  if (!id) return
  project.setBlockType(id, value as BlockType)
}

// ── Note API : service + endpoint (autocomplétion) ─────────────────────────────
const serviceQuery = ref('')
const serviceMenuOpen = ref(false)

const serviceMatches = computed(() => {
  const q = serviceQuery.value.trim().toLowerCase()
  const list = project.services
  return q ? list.filter((s) => s.name.toLowerCase().includes(q)) : list
})
const currentService = computed(() =>
  buf.serviceId ? project.serviceById(buf.serviceId) : undefined,
)
const endpointSuggestions = computed(() => currentService.value?.endpoints ?? [])
/** Vrai si aucun service existant ne correspond exactement au texte saisi → proposer d'en créer un. */
const canCreateService = computed(() => {
  const q = serviceQuery.value.trim()
  if (!q) return false
  return !project.services.some((s) => s.name.toLowerCase() === q.toLowerCase())
})

function loadSvcBuffer(): void {
  const s = currentService.value
  if (!s) return
  svcBuf.name = s.name
  svcBuf.baseUrl = s.baseUrl
  svcBuf.auth = s.auth
  svcBuf.risk = s.risk
}

/** Rattache la note API à un service existant (commit immédiat). */
function selectService(id: string): void {
  buf.serviceId = id
  serviceQuery.value = project.serviceById(id)?.name ?? ''
  serviceMenuOpen.value = false
  if (ui.selectedId) project.updateAttrs(ui.selectedId, { serviceId: id })
  loadSvcBuffer()
}

/** Crée un service depuis le texte saisi puis y rattache la note API. */
function createService(): void {
  const name = serviceQuery.value.trim() || 'Nouveau service'
  const id = project.addService({ name })
  selectService(id)
}

/** Édition inline du service (registre partagé) — commit au blur. */
function commitSvc(): void {
  if (!buf.serviceId) return
  project.updateService(buf.serviceId, {
    name: svcBuf.name,
    baseUrl: svcBuf.baseUrl,
    auth: svcBuf.auth,
    risk: svcBuf.risk,
  })
  serviceQuery.value = svcBuf.name
}

/** Choisit un endpoint existant du service (remplit méthode + chemin). */
function pickEndpoint(method: string, path: string): void {
  buf.method = method
  buf.path = path
  flush()
}

/** Ajoute l'endpoint courant (méthode + chemin) au registre du service, s'il est nouveau. */
function addEndpointToService(): void {
  const s = currentService.value
  if (!s || !buf.path.trim()) return
  const exists = s.endpoints.some((e) => e.method === buf.method && e.path === buf.path)
  if (exists) return
  project.updateService(s.id, {
    endpoints: [...s.endpoints, { method: buf.method || 'GET', path: buf.path, notes: '' }],
  })
}

// ── Watchers ──────────────────────────────────────────────────────────────────
watch(
  () => ui.selectedId,
  (id, prev) => {
    if (prev && prev !== id) commitNow(prev)
    serviceMenuOpen.value = false
    if (id) loadBuffer(id)
  },
  { immediate: true },
)
watch(
  () => project.graphVersion,
  () => {
    if (!panelHasFocus()) loadBuffer(ui.selectedId)
  },
)

onBeforeUnmount(() => flush())

const collapsed = computed({
  get: () => panelState.propertiesCollapsed,
  set: (v: boolean) => (panelState.propertiesCollapsed = v),
})

const inputClass =
  'w-full rounded-md border border-black/10 bg-white/70 px-2 py-1.5 text-sm text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 dark:border-white/15 dark:bg-zinc-800/70 dark:text-zinc-100'
const labelClass = 'mb-1 block text-[11px] font-medium text-slate-500 dark:text-zinc-400'
</script>

<template>
  <FloatingPanel :padded="false" role="complementary" aria-label="Propriétés">
    <div ref="panelRef" class="flex max-h-[80vh] w-80 flex-col">
      <!-- En-tête : type + complétude + repli -->
      <header class="flex items-center gap-2 border-b border-black/[0.06] px-3 py-2 dark:border-white/10">
        <span class="text-sm font-semibold">{{ isMulti ? `${selectedIds.length} éléments` : nodeKindLabel }}</span>
        <span
          v-if="!isMulti && !completeness.complete"
          class="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
          :title="`Champs manquants : ${completeness.missing.join(', ')}`"
        >
          <span class="h-1.5 w-1.5 rounded-full bg-amber-500" />
          {{ completeness.missing.length }} manquant(s)
        </span>
        <button
          type="button"
          class="ml-auto rounded-md p-1 text-slate-400 hover:bg-black/5 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 dark:hover:bg-white/10"
          :aria-label="collapsed ? 'Déplier le panneau (⌥.)' : 'Replier le panneau (⌥.)'"
          :title="collapsed ? 'Déplier (⌥.)' : 'Replier (⌥.)'"
          @click="collapsed = !collapsed"
        >
          <svg viewBox="0 0 20 20" class="h-4 w-4 transition-transform" :class="collapsed ? '' : 'rotate-180'" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 8l4 4 4-4" /></svg>
        </button>
      </header>

      <div v-show="!collapsed" class="flex-1 space-y-3 overflow-y-auto p-3">
        <!-- Site (contexte transversal) : description projet + contraintes globales -->
        <template v-if="isSite">
          <p class="text-xs text-slate-500 dark:text-zinc-400">
            Contexte transversal du projet — repris en tête du document de spécifications.
          </p>
          <div>
            <label :class="labelClass" for="pp-site-context">Description du projet</label>
            <textarea id="pp-site-context" v-model="siteBuf.context" :class="inputClass" rows="4" placeholder="Contexte, objectifs, cadre général…" @input="scheduleCommit" @blur="flush" />
          </div>
          <div>
            <label :class="labelClass" for="pp-site-constraints">Contraintes globales (une par ligne)</label>
            <textarea id="pp-site-constraints" v-model="siteBuf.constraints" :class="inputClass" rows="4" placeholder="SSO obligatoire&#10;RGPD&#10;Accessibilité RGAA AA" @input="scheduleCommit" @blur="flush" />
          </div>
          <div>
            <label :class="labelClass" for="pp-site-notes">Notes</label>
            <textarea id="pp-site-notes" v-model="siteBuf.notes" :class="inputClass" rows="2" @input="scheduleCommit" @blur="flush" />
          </div>
        </template>

        <!-- Sélection multiple : champs communs uniquement -->
        <template v-else-if="isMulti">
          <p class="text-xs text-slate-500 dark:text-zinc-400">Champs communs à la sélection.</p>
        </template>

        <!-- Nœud unique : formulaire par type -->
        <template v-else-if="node">
          <!-- Nom (pages, blocs, notes comportement — les notes API n'en ont pas) -->
          <div v-if="!isApiNote(node)">
            <label :class="labelClass" for="pp-name">Nom</label>
            <input id="pp-name" v-model="buf.name" :class="inputClass" type="text" @input="scheduleCommit" @blur="flush" />
          </div>

          <!-- ── Page ── -->
          <template v-if="isPage(node)">
            <div>
              <label :class="labelClass" for="pp-route">Route</label>
              <input id="pp-route" v-model="buf.route" :class="inputClass" type="text" placeholder="/tableau-de-bord" @input="scheduleCommit" @blur="flush" />
            </div>
            <div>
              <label :class="labelClass" for="pp-roles">Rôles (séparés par des virgules)</label>
              <input id="pp-roles" v-model="buf.roles" :class="inputClass" type="text" placeholder="admin, client" @input="scheduleCommit" @blur="flush" />
            </div>
            <div>
              <label :class="labelClass" for="pp-desc">Description</label>
              <textarea id="pp-desc" v-model="buf.description" :class="inputClass" rows="2" @input="scheduleCommit" @blur="flush" />
            </div>
            <div>
              <label :class="labelClass" for="pp-logic">Logique</label>
              <textarea id="pp-logic" v-model="buf.logic" :class="inputClass" rows="2" @input="scheduleCommit" @blur="flush" />
            </div>
            <div>
              <label :class="labelClass" for="pp-constraints">Contraintes (une par ligne)</label>
              <textarea id="pp-constraints" v-model="buf.constraints" :class="inputClass" rows="2" @input="scheduleCommit" @blur="flush" />
            </div>
          </template>

          <!-- ── Bloc ── -->
          <template v-else-if="isBlock(node)">
            <div>
              <label :class="labelClass" for="pp-blocktype">Type de bloc</label>
              <select id="pp-blocktype" :class="inputClass" :value="node.attrs.blockType" @change="setBlockType(($event.target as HTMLSelectElement).value)">
                <option v-for="bt in BLOCK_TYPE_OPTIONS" :key="bt" :value="bt">{{ bt }}</option>
              </select>
            </div>
            <div>
              <label :class="labelClass" for="pp-desc-bl">Description</label>
              <textarea id="pp-desc-bl" v-model="buf.description" :class="inputClass" rows="2" @input="scheduleCommit" @blur="flush" />
            </div>
            <div>
              <label :class="labelClass" for="pp-constraints-bl">Contraintes (une par ligne)</label>
              <textarea id="pp-constraints-bl" v-model="buf.constraints" :class="inputClass" rows="2" @input="scheduleCommit" @blur="flush" />
            </div>
          </template>

          <!-- ── Module (couche fonctionnelle) ── -->
          <template v-else-if="isModule(node)">
            <div>
              <label :class="labelClass" for="pp-desc-mod">Description</label>
              <textarea id="pp-desc-mod" v-model="buf.description" :class="inputClass" rows="2" placeholder="Ce que ce module regroupe…" @input="scheduleCommit" @blur="flush" />
            </div>
          </template>

          <!-- ── Fonctionnalité : champs structurés (le contenu détaillé s'édite via « Éditer ») ── -->
          <template v-else-if="isFeature(node)">
            <div>
              <label :class="labelClass" for="pp-code">Code</label>
              <input id="pp-code" v-model="buf.code" :class="inputClass" type="text" placeholder="DEV-04" @input="scheduleCommit" @blur="flush" />
            </div>
            <div>
              <label :class="labelClass" for="pp-perimeter">Périmètre</label>
              <select id="pp-perimeter" v-model="buf.perimeter" :class="inputClass" @change="flush">
                <option v-for="p in PERIMETER_OPTIONS" :key="p.id" :value="p.id">{{ p.label }}</option>
              </select>
            </div>
            <div>
              <label :class="labelClass" for="pp-estimate">Estimation</label>
              <input id="pp-estimate" v-model="buf.estimate" :class="inputClass" type="text" placeholder="1j · 4h · à estimer" @input="scheduleCommit" @blur="flush" />
            </div>
          </template>

          <!-- ── Note comportement ── -->
          <template v-else-if="isBehaviorNote(node)">
            <div>
              <label :class="labelClass" for="pp-desc-b">Description</label>
              <textarea id="pp-desc-b" v-model="buf.description" :class="inputClass" rows="2" @input="scheduleCommit" @blur="flush" />
            </div>
            <div>
              <label :class="labelClass" for="pp-trigger">Déclencheur</label>
              <input id="pp-trigger" v-model="buf.trigger" :class="inputClass" type="text" @input="scheduleCommit" @blur="flush" />
            </div>
            <div>
              <label :class="labelClass" for="pp-rules">Règles</label>
              <textarea id="pp-rules" v-model="buf.rules" :class="inputClass" rows="2" @input="scheduleCommit" @blur="flush" />
            </div>
            <div>
              <label :class="labelClass" for="pp-hours">Estimation (heures)</label>
              <input id="pp-hours" v-model="buf.hours" :class="inputClass" type="number" min="0" step="0.5" @input="scheduleCommit" @blur="flush" />
            </div>
          </template>

          <!-- ── Note API : service (registre) + endpoint ── -->
          <template v-else-if="isApiNote(node)">
            <!-- Choix / création du service -->
            <div class="relative">
              <label :class="labelClass" for="pp-service">Service</label>
              <input
                id="pp-service"
                v-model="serviceQuery"
                :class="inputClass"
                type="text"
                autocomplete="off"
                placeholder="Choisir ou créer un service…"
                @focus="serviceMenuOpen = true"
                @input="serviceMenuOpen = true"
              />
              <div
                v-if="serviceMenuOpen && (serviceMatches.length || canCreateService)"
                class="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-lg border border-black/[0.08] bg-white/95 p-1 shadow-lg backdrop-blur-md dark:border-white/10 dark:bg-zinc-900/95"
                role="listbox"
              >
                <button
                  v-for="s in serviceMatches"
                  :key="s.id"
                  type="button"
                  role="option"
                  :aria-selected="s.id === buf.serviceId"
                  class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-black/5 dark:hover:bg-white/10"
                  :class="s.id === buf.serviceId ? 'font-semibold text-cyan-700 dark:text-cyan-300' : 'text-slate-700 dark:text-zinc-200'"
                  @mousedown.prevent="selectService(s.id)"
                >
                  <span class="truncate">{{ s.name }}</span>
                  <span class="ml-auto truncate text-[10px] text-slate-400">{{ s.baseUrl }}</span>
                </button>
                <button
                  v-if="canCreateService"
                  type="button"
                  class="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs text-cyan-700 hover:bg-cyan-50 dark:text-cyan-300 dark:hover:bg-cyan-500/10"
                  @mousedown.prevent="createService"
                >
                  + Créer le service « {{ serviceQuery.trim() }} »
                </button>
              </div>
            </div>

            <!-- Détails du service référencé (registre partagé) -->
            <div v-if="currentService" class="space-y-2 rounded-md border border-black/[0.06] p-2 dark:border-white/10">
              <div>
                <label :class="labelClass" for="pp-svc-url">URL de base</label>
                <input id="pp-svc-url" v-model="svcBuf.baseUrl" :class="inputClass" type="text" placeholder="https://api.exemple.com" @blur="commitSvc" />
              </div>
              <div>
                <label :class="labelClass" for="pp-svc-auth">Authentification</label>
                <input id="pp-svc-auth" v-model="svcBuf.auth" :class="inputClass" type="text" placeholder="Bearer · OAuth2 · aucune…" @blur="commitSvc" />
              </div>
              <div>
                <label :class="labelClass" for="pp-svc-risk">Risque</label>
                <select id="pp-svc-risk" v-model="svcBuf.risk" :class="inputClass" @change="commitSvc">
                  <option v-for="r in RISKS" :key="r" :value="r">{{ r }}</option>
                </select>
              </div>
            </div>
            <p v-else class="text-xs text-slate-400">Aucun service rattaché.</p>

            <!-- Endpoint : méthode + chemin, autocomplétion depuis service.endpoints -->
            <div>
              <label :class="labelClass">Endpoint</label>
              <div class="flex items-center gap-1">
                <select v-model="buf.method" :class="inputClass" class="!w-24" aria-label="Méthode" @change="flush">
                  <option value="">—</option>
                  <option v-for="m in HTTP_METHODS" :key="m" :value="m">{{ m }}</option>
                </select>
                <input
                  v-model="buf.path"
                  :class="inputClass"
                  type="text"
                  list="pp-endpoint-paths"
                  placeholder="/ressource/:id"
                  aria-label="Chemin"
                  @input="scheduleCommit"
                  @blur="flush"
                />
                <datalist id="pp-endpoint-paths">
                  <option v-for="(ep, i) in endpointSuggestions" :key="i" :value="ep.path">{{ ep.method }} {{ ep.path }}</option>
                </datalist>
              </div>
              <div v-if="endpointSuggestions.length" class="mt-1.5 flex flex-wrap gap-1">
                <button
                  v-for="(ep, i) in endpointSuggestions"
                  :key="i"
                  type="button"
                  class="rounded border border-black/10 px-1.5 py-0.5 text-[10px] text-slate-600 hover:border-cyan-500 hover:text-cyan-700 dark:border-white/15 dark:text-zinc-300 dark:hover:text-cyan-300"
                  @click="pickEndpoint(ep.method, ep.path)"
                >
                  {{ ep.method }} {{ ep.path }}
                </button>
              </div>
              <button
                v-if="currentService && buf.path.trim()"
                type="button"
                class="mt-1.5 rounded px-1.5 py-0.5 text-[11px] text-cyan-700 hover:bg-cyan-50 dark:text-cyan-300 dark:hover:bg-cyan-500/10"
                @click="addEndpointToService"
              >
                + Ajouter cet endpoint au service
              </button>
            </div>
          </template>

          <!-- Notes (tous types) -->
          <div>
            <label :class="labelClass" for="pp-notes">Notes</label>
            <textarea id="pp-notes" v-model="buf.notes" :class="inputClass" rows="2" @input="scheduleCommit" @blur="flush" />
          </div>

          <!-- Pont inter-couches : fonctionnalités réalisées par cette page/ce bloc -->
          <div v-if="isPage(node) || isBlock(node)" class="border-t border-black/[0.06] pt-3 dark:border-white/10">
            <RealizationSection :node-id="node.id" direction="target" />
          </div>
        </template>

        <!-- ── Champs communs : lot (+ provenance) & facette (notes) ── -->
        <div v-if="!isSite" class="space-y-3 border-t border-black/[0.06] pt-3 dark:border-white/10">
          <div>
            <label :class="labelClass" for="pp-lot">Lot</label>
            <div class="flex items-center gap-2">
              <span class="h-3 w-3 shrink-0 rounded-full" :style="{ backgroundColor: lotColor(lotProvenance?.lot ?? 1) }" aria-hidden="true" />
              <select
                id="pp-lot"
                :class="inputClass"
                :value="node && node.lot != null ? String(node.lot) : ''"
                @change="setLot(($event.target as HTMLSelectElement).value)"
              >
                <option value="">Hérité</option>
                <option v-for="l in LOT_OPTIONS" :key="l" :value="String(l)">Lot {{ l }}</option>
              </select>
            </div>
            <p v-if="!isMulti && lotProvenance" class="mt-1 text-[11px] text-slate-500 dark:text-zinc-400">
              <template v-if="lotProvenance.inherited">
                Hérité · lot {{ lotProvenance.lot }}<template v-if="lotSourceName"> (de « {{ lotSourceName }} »)</template>
              </template>
              <template v-else>Défini ici · lot {{ lotProvenance.lot }}</template>
            </p>
          </div>

          <div v-if="isMulti || (node && isNote(node))">
            <label :class="labelClass" for="pp-facet">Facette</label>
            <select
              id="pp-facet"
              :class="inputClass"
              :value="!isMulti && node && isNote(node) ? (node.attrs.facet ?? '') : ''"
              @change="setFacet(($event.target as HTMLSelectElement).value)"
            >
              <option v-for="f in FACETS" :key="f.id" :value="f.id">{{ f.label }}</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  </FloatingPanel>
</template>
