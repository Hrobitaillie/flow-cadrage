// Fabriques de nœuds/services/documents avec valeurs par défaut. IDs = UUID v4 (crypto.randomUUID) :
// opaques et STABLES (indépendants du nom, jamais de collision) — plus fiables qu'un slug de nom.
import type {
  ApiNote,
  BehaviorNote,
  BlockNode,
  BlockType,
  EdgeType,
  FeatureNode,
  FlooowEdge,
  ModuleNode,
  PageNode,
  Position,
  ProjectDoc,
  Service,
} from './types'
import { CURRENT_FORMAT_VERSION } from './types'
import { EMPTY_DOC } from './richContent'

/** Transforme un texte libre en slug `[a-z0-9-]` (diacritiques retirés, tirets collapsés). */
export function slugify(text: string): string {
  const COMBINING_MARKS = /[̀-ͯ]/g
  const base = text
    .normalize('NFD')
    .replace(COMBINING_MARKS, '') // diacritiques
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
  return base
}

/** Identifiant unique et opaque (UUID v4) d'un nœud / arête / service. */
export function genId(): string {
  return crypto.randomUUID()
}

// Valeurs par défaut de mise en page (px monde). Ajustables par les agents canvas.
export const DEFAULT_POSITION: Position = { x: 0, y: 0 }
/** Pas vertical entre deux blocs empilés (l'ordre = position.y). */
export const BLOCK_STEP = 120
/** Pas vertical entre deux fonctionnalités empilées dans un module (l'ordre = position.y). */
export const FEATURE_STEP = 152
/** Pas horizontal entre deux modules alignés en ligne (largeur module + gouttière). */
export const MODULE_COL_STEP = 360

function nowIso(): string {
  return new Date().toISOString().slice(0, 10)
}

// ── Entrées de fabrique ──────────────────────────────────────────────────────

export interface CreatePageInput {
  id?: string
  name?: string
  position?: Position
  lot?: number | null
  attrs?: Partial<PageNode['attrs']>
}

export interface CreateBlockInput {
  id?: string
  name?: string
  parentId?: string | null
  blockType?: BlockType
  position?: Position
  lot?: number | null
  attrs?: Partial<BlockNode['attrs']>
}

export interface CreateBehaviorNoteInput {
  id?: string
  name?: string
  attachedTo: string
  position?: Position
  lot?: number | null
  attrs?: Partial<BehaviorNote['attrs']>
}

export interface CreateApiNoteInput {
  id?: string
  attachedTo: string
  serviceId: string
  method?: string
  path?: string
  position?: Position
  lot?: number | null
  attrs?: Partial<ApiNote['attrs']>
}

export interface CreateModuleInput {
  id?: string
  name?: string
  position?: Position
  lot?: number | null
  attrs?: Partial<ModuleNode['attrs']>
}

export interface CreateFeatureInput {
  id?: string
  name?: string
  code?: string
  parentId?: string | null
  position?: Position
  lot?: number | null
  attrs?: Partial<FeatureNode['attrs']>
}

export interface CreateServiceInput {
  id?: string
  name?: string
  baseUrl?: string
  auth?: string
  risk?: Service['risk']
  endpoints?: Service['endpoints']
  notes?: string
}

export interface CreateEdgeInput {
  id?: string
  type: EdgeType
  source: string
  target: string
  attrs?: FlooowEdge['attrs']
}

// ── Fabriques ────────────────────────────────────────────────────────────────

export function createPage(input: CreatePageInput = {}): PageNode {
  const name = input.name ?? input.attrs?.name ?? 'Nouvelle page'
  return {
    id: input.id ?? genId(),
    type: 'frame',
    kind: 'page',
    parentId: null,
    position: input.position ?? { ...DEFAULT_POSITION },
    lot: input.lot ?? null,
    attrs: {
      name,
      route: '',
      roles: [],
      description: '',
      constraints: [],
      logic: '',
      notes: '',
      ...input.attrs,
    },
  }
}

export function createBlock(input: CreateBlockInput = {}): BlockNode {
  const blockType = input.blockType ?? input.attrs?.blockType ?? 'free'
  const name = input.name ?? input.attrs?.name ?? 'Nouveau bloc'
  return {
    id: input.id ?? genId(),
    type: 'frame',
    kind: 'block',
    parentId: input.parentId ?? null,
    position: input.position ?? { ...DEFAULT_POSITION },
    lot: input.lot ?? null,
    attrs: {
      name,
      blockType,
      description: '',
      constraints: [],
      notes: '',
      ...input.attrs,
    },
  }
}

export function createBehaviorNote(input: CreateBehaviorNoteInput): BehaviorNote {
  const name = input.name ?? input.attrs?.name ?? 'Nouveau comportement'
  return {
    id: input.id ?? genId(),
    type: 'note',
    kind: 'behavior',
    parentId: null,
    attachedTo: input.attachedTo,
    position: input.position ?? { ...DEFAULT_POSITION },
    lot: input.lot ?? null,
    attrs: {
      name,
      description: '',
      facet: null,
      trigger: '',
      rules: '',
      hours: null,
      notes: '',
      ...input.attrs,
    },
  }
}

export function createApiNote(input: CreateApiNoteInput): ApiNote {
  const method = input.method ?? input.attrs?.method ?? ''
  const path = input.path ?? input.attrs?.path ?? ''
  return {
    id: input.id ?? genId(),
    type: 'note',
    kind: 'api',
    parentId: null,
    attachedTo: input.attachedTo,
    position: input.position ?? { ...DEFAULT_POSITION },
    lot: input.lot ?? null,
    attrs: {
      serviceId: input.serviceId,
      method,
      path,
      facet: null,
      notes: '',
      ...input.attrs,
    },
  }
}

export function createModule(input: CreateModuleInput = {}): ModuleNode {
  const name = input.name ?? input.attrs?.name ?? 'Nouveau module'
  return {
    id: input.id ?? genId(),
    type: 'frame',
    kind: 'module',
    parentId: null,
    position: input.position ?? { ...DEFAULT_POSITION },
    lot: input.lot ?? null,
    attrs: {
      name,
      description: '',
      notes: '',
      ...input.attrs,
    },
  }
}

export function createFeature(input: CreateFeatureInput = {}): FeatureNode {
  const name = input.name ?? input.attrs?.name ?? 'Nouvelle fonctionnalité'
  const code = input.code ?? input.attrs?.code ?? ''
  return {
    id: input.id ?? genId(),
    type: 'feature',
    parentId: input.parentId ?? null,
    position: input.position ?? { ...DEFAULT_POSITION },
    lot: input.lot ?? null,
    attrs: {
      code,
      name,
      content: { ...EMPTY_DOC, content: [] },
      perimeter: null,
      estimate: '',
      ...input.attrs,
    },
  }
}

export function createService(input: CreateServiceInput = {}): Service {
  const name = input.name ?? 'Nouveau service'
  return {
    id: input.id ?? genId(),
    name,
    baseUrl: input.baseUrl ?? '',
    auth: input.auth ?? '',
    risk: input.risk ?? 'low',
    endpoints: input.endpoints ?? [],
    notes: input.notes ?? '',
  }
}

export function createEdge(input: CreateEdgeInput): FlooowEdge {
  return {
    id: input.id ?? genId(),
    type: input.type,
    source: input.source,
    target: input.target,
    attrs: input.attrs ?? {},
  }
}

/** Document vierge valide (passe la validation zod). */
export function createEmptyProject(name = 'Nouveau projet'): ProjectDoc {
  const today = nowIso()
  return {
    meta: {
      name,
      formatVersion: CURRENT_FORMAT_VERSION,
      createdAt: today,
      updatedAt: today,
      pricing: { riskCoeff: 1.25, dailyRate: null },
      homePageId: null,
    },
    site: {
      attrs: { context: '', constraints: [], notes: '' },
    },
    services: [],
    nodes: [],
    edges: [],
  }
}
