// Migrations de format : registre { fromVersion -> (doc) => doc } appliqué en chaîne.
// La validation zod s'applique APRÈS migration (voir donnees-json.md §Migrations).
import { CURRENT_FORMAT_VERSION } from './types'
import type { Position, Service, ServiceEndpoint } from './types'
import { mergeFeatureFields } from './richContent'

export const CURRENT = CURRENT_FORMAT_VERSION as number

/** Erreur levée quand un fichier provient d'une version d'app plus récente. */
export class UnsupportedVersionError extends Error {
  constructor(public readonly version: number) {
    super(
      `Format version ${version} non supporté (max ${CURRENT}). ` +
        `Ce fichier a été créé par une version plus récente de Flooow.`,
    )
    this.name = 'UnsupportedVersionError'
  }
}

// ── v1 → v2 ──────────────────────────────────────────────────────────────────
// Transformation best-effort décrite dans evolution-v2.md §1.5.
//   section → bloc (blockType='free') ; behavior node → note (attachedTo=ex-parent) ;
//   service node → registre services[] ; consumes → note api rattachée à la source ;
//   navigatesTo/dependsOn conservées (triggers → dependsOn, type retiré) ; meta.formatVersion → 2.

interface V1Node {
  id: string
  type: string
  kind?: string
  parentId: string | null
  position: Position
  size?: unknown
  lot?: number | null
  attrs: Record<string, unknown>
}

interface V1Edge {
  id: string
  type: string
  source: string
  target: string
  attrs?: { endpointRef?: string; notes?: string }
}

interface V1Doc {
  meta: Record<string, unknown> & { formatVersion: number; homePageId?: string | null }
  site: { attrs: Record<string, unknown> }
  nodes: V1Node[]
  edges: V1Edge[]
}

/** Parse « GET /orders » → { method:'GET', path:'/orders' }. Tolérant. */
function parseEndpointRef(ref: string | undefined): { method: string; path: string } {
  if (!ref) return { method: '', path: '' }
  const trimmed = ref.trim()
  const spaceAt = trimmed.indexOf(' ')
  if (spaceAt === -1) return { method: '', path: trimmed }
  return { method: trimmed.slice(0, spaceAt), path: trimmed.slice(spaceAt + 1).trim() }
}

function migrateV1toV2(input: unknown): unknown {
  const doc = input as V1Doc
  const services: Service[] = []
  const nodes: Record<string, unknown>[] = []
  const edges: Record<string, unknown>[] = []

  // Ids des ex-services → deviennent des entrées du registre (retirés des nœuds).
  const serviceIds = new Set<string>()

  for (const node of doc.nodes) {
    if (node.type === 'service') {
      const attrs = node.attrs
      const endpoints = Array.isArray(attrs.endpoints)
        ? (attrs.endpoints as ServiceEndpoint[]).map((e) => ({
            method: String(e.method ?? ''),
            path: String(e.path ?? ''),
            notes: String(e.notes ?? ''),
          }))
        : []
      services.push({
        id: node.id,
        name: String(attrs.name ?? node.id),
        baseUrl: '',
        auth: String(attrs.auth ?? ''),
        risk: (attrs.risk as Service['risk']) ?? 'low',
        endpoints,
        notes: String(attrs.notes ?? ''),
      })
      serviceIds.add(node.id)
      continue
    }

    if (node.type === 'behavior') {
      // behavior node (parentId) → note behavior rattachée à l'ancien parent.
      nodes.push({
        id: node.id,
        type: 'note',
        kind: 'behavior',
        parentId: null,
        attachedTo: node.parentId ?? '',
        position: node.position,
        ...(node.lot != null ? { lot: node.lot } : {}),
        attrs: {
          name: String(node.attrs.name ?? ''),
          description: String(node.attrs.description ?? ''),
          facet: (node.attrs.facet as string | null) ?? null,
          trigger: String(node.attrs.trigger ?? ''),
          rules: String(node.attrs.rules ?? ''),
          hours: (node.attrs.hours as number | null) ?? null,
          notes: String(node.attrs.notes ?? ''),
        },
      })
      continue
    }

    if (node.type === 'frame' && node.kind === 'section') {
      // section → bloc pleine largeur, blockType='free'.
      nodes.push({
        id: node.id,
        type: 'frame',
        kind: 'block',
        parentId: node.parentId,
        position: node.position,
        ...(node.lot != null ? { lot: node.lot } : {}),
        attrs: {
          name: String(node.attrs.name ?? ''),
          blockType: 'free',
          description: String(node.attrs.description ?? ''),
          constraints: Array.isArray(node.attrs.constraints) ? node.attrs.constraints : [],
          notes: String(node.attrs.notes ?? ''),
        },
      })
      continue
    }

    // frame page → conservée (sans size).
    nodes.push({
      id: node.id,
      type: 'frame',
      kind: 'page',
      parentId: node.parentId,
      position: node.position,
      ...(node.lot != null ? { lot: node.lot } : {}),
      attrs: {
        name: String(node.attrs.name ?? ''),
        route: String(node.attrs.route ?? ''),
        roles: Array.isArray(node.attrs.roles) ? node.attrs.roles : [],
        description: String(node.attrs.description ?? ''),
        constraints: Array.isArray(node.attrs.constraints) ? node.attrs.constraints : [],
        logic: String(node.attrs.logic ?? ''),
        notes: String(node.attrs.notes ?? ''),
      },
    })
  }

  // Edges : consumes → note api ; navigatesTo conservée ; triggers → dependsOn ; dependsOn conservée.
  const nodeById = new Map(doc.nodes.map((n) => [n.id, n]))
  let apiSeq = 0
  for (const edge of doc.edges) {
    if (edge.type === 'consumes') {
      const { method, path } = parseEndpointRef(edge.attrs?.endpointRef)
      const source = nodeById.get(edge.source)
      const near: Position = source
        ? { x: source.position.x + 40, y: source.position.y + 40 }
        : { x: 0, y: 0 }
      nodes.push({
        id: `api-${edge.id}-${apiSeq++}`,
        type: 'note',
        kind: 'api',
        parentId: null,
        attachedTo: edge.source,
        position: near,
        attrs: {
          serviceId: edge.target,
          method,
          path,
          facet: null,
          notes: String(edge.attrs?.notes ?? ''),
        },
      })
      continue
    }
    // navigatesTo / dependsOn conservées ; l'ancien 'triggers' (type retiré) devient 'dependsOn'.
    edges.push({
      id: edge.id,
      type: edge.type === 'triggers' ? 'dependsOn' : edge.type,
      source: edge.source,
      target: edge.target,
      attrs: edge.attrs?.notes != null ? { notes: edge.attrs.notes } : {},
    })
  }

  const { formatVersion: _drop, ...restMeta } = doc.meta
  void _drop
  void serviceIds

  return {
    meta: { ...restMeta, formatVersion: 2 },
    site: doc.site,
    services,
    nodes,
    edges,
  }
}

// ── v2 → v3 ──────────────────────────────────────────────────────────────────
// Ajout de la couche fonctionnelle (nœuds `module` + `feature`, arête `realizedBy`,
// decisions.md §15). Purement additif : un document v2 n'a aucun nœud fonctionnel, donc la
// migration se limite à bumper la version. Le format reste sinon identique.
function migrateV2toV3(input: unknown): unknown {
  const doc = input as { meta: Record<string, unknown> }
  return {
    ...(doc as object),
    meta: { ...doc.meta, formatVersion: 3 },
  }
}

// ── v3 → v4 ──────────────────────────────────────────────────────────────────
// Contenu de fonctionnalité unifié : les champs texte description/implies/toConfirm/notes fusionnent
// en un document riche `content` (« Quoi » en tête, les autres en sections titrées). Les autres
// nœuds sont inchangés.
interface V3Node {
  type: string
  attrs: Record<string, unknown>
  [k: string]: unknown
}
interface V3Doc {
  meta: Record<string, unknown>
  nodes: V3Node[]
  [k: string]: unknown
}

function migrateV3toV4(input: unknown): unknown {
  const doc = input as V3Doc
  const nodes = doc.nodes.map((node) => {
    if (node.type !== 'feature') return node
    const a = node.attrs
    const content = mergeFeatureFields({
      description: typeof a.description === 'string' ? a.description : '',
      implies: typeof a.implies === 'string' ? a.implies : '',
      toConfirm: typeof a.toConfirm === 'string' ? a.toConfirm : '',
      notes: typeof a.notes === 'string' ? a.notes : '',
    })
    return {
      ...node,
      attrs: {
        code: typeof a.code === 'string' ? a.code : '',
        name: typeof a.name === 'string' ? a.name : '',
        content,
        perimeter: (a.perimeter as string | null) ?? null,
        estimate: typeof a.estimate === 'string' ? a.estimate : '',
      },
    }
  })
  return { ...doc, meta: { ...doc.meta, formatVersion: 4 }, nodes }
}

/**
 * Registre des migrations. La clé N transforme un document du format N vers N+1.
 */
export const migrations: Record<number, (doc: unknown) => unknown> = {
  1: migrateV1toV2,
  2: migrateV2toV3,
  3: migrateV3toV4,
}

interface VersionedDoc {
  meta: { formatVersion: number }
}

function hasVersion(doc: unknown): doc is VersionedDoc {
  return (
    typeof doc === 'object' &&
    doc !== null &&
    'meta' in doc &&
    typeof (doc as { meta: unknown }).meta === 'object' &&
    (doc as { meta: { formatVersion?: unknown } }).meta !== null &&
    typeof (doc as { meta: { formatVersion?: unknown } }).meta.formatVersion === 'number'
  )
}

/**
 * Applique en chaîne les migrations depuis la version du document jusqu'à CURRENT.
 * @throws UnsupportedVersionError si le document est plus récent que l'app.
 * @throws Error si une migration manque dans la chaîne.
 */
export function migrate(doc: unknown): unknown {
  if (!hasVersion(doc)) {
    throw new Error('Document illisible : meta.formatVersion manquant ou invalide.')
  }
  let v = doc.meta.formatVersion
  if (v > CURRENT) throw new UnsupportedVersionError(v)
  let current: unknown = doc
  while (v < CURRENT) {
    const step = migrations[v]
    if (!step) throw new Error(`Migration manquante pour la version ${v}.`)
    current = step(current)
    v++
  }
  return current
}
