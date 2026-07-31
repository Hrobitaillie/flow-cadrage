// Dérivation du CATALOGUE (cadrage-par-fonctionnalite.md) — le « cadrage fusionné » façon locasyst :
// une fiche par fonctionnalité regroupant, au même endroit, quoi / implique / dépend de / débloque /
// réalisé par (pages·blocs) / endpoints API (déduits via realizedBy) / lot / périmètre / estimation.
// Groupé par module (l'équivalent d'un fichier de catalogue). Projection lecture seule : tout vient
// du canvas de la couche fonctionnelle + du pont realizedBy.
import type { FeatureNode, ModuleNode, NodeIndex, Perimeter, ProjectDoc } from '@/model/types'
import type { RichDoc } from '@/model/richContent'
import { isFeature, isModule } from '@/model/types'
import { verticalOrder } from '@/domain/ordering'
import { resolveLot } from '@/domain/lots'
import { realizersOf } from '@/domain/realization'
import { deriveApi, type ApiFeatureEndpoint } from '@/domain/derive/api'
import { coverage } from '@/domain/realization'

/** Référence légère d'une fonctionnalité liée (dépend de / débloque). */
export interface CatalogFeatureRef {
  id: string
  code: string
  name: string
}

/** Une cible de réalisation (page ou bloc) rattachée à une fonctionnalité. */
export interface CatalogRealizer {
  id: string
  name: string
  kind: 'page' | 'block'
}

/** Une fiche fonctionnalité complète (fusion de toutes ses facettes). */
export interface CatalogFeature {
  id: string
  code: string
  name: string
  content: RichDoc // contenu libre (document riche)
  perimeter: Perimeter | null
  estimate: string
  lot: number // résolu (héritage module inclus)
  dependsOn: CatalogFeatureRef[] // fonctionnalités dont celle-ci dépend
  unlocks: CatalogFeatureRef[] // fonctionnalités que celle-ci débloque (inverse)
  realizers: CatalogRealizer[] // pages/blocs qui la réalisent
  endpoints: ApiFeatureEndpoint[] // endpoints API déduits via les cibles réalisées
  orphan: boolean // aucune page/bloc ne la réalise
}

/** Un groupe du catalogue : un module (ou le groupe « sans module ») + ses fiches. */
export interface CatalogGroup {
  module: ModuleNode | null // null = fonctionnalités racines (transverses)
  moduleId: string | null
  moduleName: string
  features: CatalogFeature[]
}

export interface CatalogDocument {
  groups: CatalogGroup[]
  /** ids des fonctionnalités qu'aucune page/bloc ne réalise (miroir de la couverture). */
  orphanFeatures: string[]
}

function ref(f: FeatureNode): CatalogFeatureRef {
  return { id: f.id, code: f.attrs.code, name: f.attrs.name }
}

/** Construit le catalogue groupé par module, chaque fiche fusionnant toutes ses facettes. */
export function deriveCatalog(doc: ProjectDoc): CatalogDocument {
  const index: NodeIndex = new Map(doc.nodes.map((n) => [n.id, n]))
  const byFeatureEndpoints = deriveApi(doc).byFeature
  const orphanSet = new Set(coverage(doc).orphanFeatures)

  // Dépendances fonctionnelles (dependsOn entre fonctionnalités), dans les deux sens.
  const dependsOn = new Map<string, CatalogFeatureRef[]>()
  const unlocks = new Map<string, CatalogFeatureRef[]>()
  const push = (map: Map<string, CatalogFeatureRef[]>, key: string, value: CatalogFeatureRef) => {
    const list = map.get(key)
    if (list) list.push(value)
    else map.set(key, [value])
  }
  for (const e of doc.edges) {
    if (e.type !== 'dependsOn') continue
    const src = index.get(e.source)
    const tgt = index.get(e.target)
    if (!src || !tgt || !isFeature(src) || !isFeature(tgt)) continue
    push(dependsOn, src.id, ref(tgt)) // src dépend de tgt
    push(unlocks, tgt.id, ref(src)) // tgt débloque src
  }

  const toCard = (f: FeatureNode): CatalogFeature => {
    const realizers: CatalogRealizer[] = realizersOf(f.id, doc.edges, index).map((n) => ({
      id: n.id,
      name: n.attrs.name,
      kind: n.kind === 'page' ? 'page' : 'block',
    }))
    return {
      id: f.id,
      code: f.attrs.code,
      name: f.attrs.name,
      content: f.attrs.content,
      perimeter: f.attrs.perimeter,
      estimate: f.attrs.estimate,
      lot: resolveLot(f.id, index),
      dependsOn: dependsOn.get(f.id) ?? [],
      unlocks: unlocks.get(f.id) ?? [],
      realizers,
      endpoints: byFeatureEndpoints.get(f.id) ?? [],
      orphan: orphanSet.has(f.id),
    }
  }

  const modules = doc.nodes.filter(isModule)
  const groups: CatalogGroup[] = []

  // Un groupe par module (ordre gauche→droite du canvas), fonctionnalités empilées par position.y.
  const orderedModules = [...modules].sort(
    (a, b) => a.position.x - b.position.x || a.position.y - b.position.y,
  )
  for (const mod of orderedModules) {
    const feats = verticalOrder(
      doc.nodes.filter((n): n is FeatureNode => isFeature(n) && n.parentId === mod.id),
    )
    groups.push({
      module: mod,
      moduleId: mod.id,
      moduleName: mod.attrs.name || 'Module sans nom',
      features: feats.map(toCard),
    })
  }

  // Fonctionnalités racines (sans module) : groupe « transverse » en fin de catalogue.
  const rootFeats = verticalOrder(
    doc.nodes.filter((n): n is FeatureNode => isFeature(n) && n.parentId == null),
  )
  if (rootFeats.length) {
    groups.push({
      module: null,
      moduleId: null,
      moduleName: 'Transverse (sans module)',
      features: rootFeats.map(toCard),
    })
  }

  return { groups, orphanFeatures: [...orphanSet] }
}
