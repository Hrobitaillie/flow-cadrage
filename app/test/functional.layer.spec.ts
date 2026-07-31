// Couche fonctionnelle (module + fonctionnalité, decisions.md §15) : modèle, migration v2→v3,
// invariants, store CRUD, filtrage de couche.
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useProjectStore } from '@/stores/project'
import { parseProjectDoc, safeParseProjectDoc } from '@/model/schema'
import { migrate } from '@/model/migrations'
import { checkInvariants } from '@/domain/invariants'
import type { ViolationCode } from '@/domain/invariants'
import {
  createEmptyProject,
  createModule,
  createFeature,
  createPage,
  createEdge,
} from '@/model/factory'
import {
  isModule,
  isFeature,
  layerOf,
  CURRENT_FORMAT_VERSION,
  type FlooowEdge,
  type FlooowNode,
  type ProjectDoc,
} from '@/model/types'

function doc(nodes: FlooowNode[], edges: FlooowEdge[] = []): ProjectDoc {
  return { ...createEmptyProject(), nodes, edges }
}
function codes(d: ProjectDoc): ViolationCode[] {
  return checkInvariants(d).map((v) => v.code)
}

describe('fabriques — module & fonctionnalité', () => {
  it('createModule : frame kind=module, racine, attrs par défaut', () => {
    const m = createModule({ name: 'Devis' })
    expect(m.type).toBe('frame')
    expect(isModule(m)).toBe(true)
    expect(m.parentId).toBeNull()
    expect(m.attrs).toEqual({ name: 'Devis', description: '', notes: '' })
  })

  it('createFeature : type=feature, attrs par défaut complets', () => {
    const f = createFeature({ name: 'Formulaire devis', code: 'DEV-04', parentId: 'mod-1' })
    expect(f.type).toBe('feature')
    expect(isFeature(f)).toBe(true)
    expect(f.parentId).toBe('mod-1')
    expect(f.attrs).toMatchObject({
      code: 'DEV-04',
      name: 'Formulaire devis',
      perimeter: null,
      estimate: '',
      content: { type: 'doc' },
    })
  })

  it('layerOf : modules/fonctionnalités = functional, pages = structural', () => {
    expect(layerOf(createModule())).toBe('functional')
    expect(layerOf(createFeature())).toBe('functional')
    expect(layerOf(createPage())).toBe('structural')
  })
})

describe('schéma zod v3 — module & fonctionnalité', () => {
  it('valide un document avec module + fonctionnalité', () => {
    const m = createModule({ id: 'mod-1', name: 'Devis' })
    const f = createFeature({ id: 'feat-1', parentId: 'mod-1', name: 'F', code: 'DEV-01' })
    expect(() => parseProjectDoc(doc([m, f]))).not.toThrow()
  })

  it('rejette une clé inconnue dans les attrs de fonctionnalité (strict)', () => {
    const bad = doc([createFeature({ id: 'f' })]) as unknown as {
      nodes: { attrs: Record<string, unknown> }[]
    }
    bad.nodes[0]!.attrs.rogue = true
    expect(safeParseProjectDoc(bad).success).toBe(false)
  })

  it('valide une arête realizedBy', () => {
    const d = doc(
      [createFeature({ id: 'f' }), createPage({ id: 'p' })],
      [createEdge({ id: 'e', type: 'realizedBy', source: 'f', target: 'p' })],
    )
    expect(safeParseProjectDoc(d).success).toBe(true)
  })
})

describe('migration v2 → v3', () => {
  it('bumpe la version sans toucher au reste', () => {
    const v2 = {
      meta: {
        name: 'Legacy v2',
        formatVersion: 2,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        pricing: { riskCoeff: 1.25, dailyRate: null },
        homePageId: null,
      },
      site: { attrs: { context: '', constraints: [], notes: '' } },
      services: [],
      nodes: [],
      edges: [],
    }
    const migrated = migrate(v2) as ProjectDoc
    expect(migrated.meta.formatVersion).toBe(CURRENT_FORMAT_VERSION)
    expect(() => parseProjectDoc(migrated)).not.toThrow()
  })
})

describe('invariants — couche fonctionnelle', () => {
  it('module avec parent → MODULE_PARENT', () => {
    const m = createModule({ id: 'm' })
    m.parentId = 'x'
    expect(codes(doc([m]))).toContain('MODULE_PARENT')
  })

  it('fonctionnalité rattachée à autre chose qu un module → FEATURE_PARENT', () => {
    const p = createPage({ id: 'p' })
    const f = createFeature({ id: 'f', parentId: 'p' })
    expect(codes(doc([p, f]))).toContain('FEATURE_PARENT')
  })

  it('fonctionnalité dans un module → aucune violation', () => {
    const m = createModule({ id: 'm' })
    const f = createFeature({ id: 'f', parentId: 'm' })
    expect(checkInvariants(doc([m, f]))).toEqual([])
  })

  it('realizedBy dont la cible n est pas page/bloc → REALIZES_TARGET', () => {
    const f1 = createFeature({ id: 'f1' })
    const f2 = createFeature({ id: 'f2' })
    const d = doc([f1, f2], [createEdge({ id: 'e', type: 'realizedBy', source: 'f1', target: 'f2' })])
    expect(codes(d)).toContain('REALIZES_TARGET')
  })

  it('realizedBy fonctionnalité → page : valide', () => {
    const f = createFeature({ id: 'f' })
    const p = createPage({ id: 'p' })
    const d = doc([f, p], [createEdge({ id: 'e', type: 'realizedBy', source: 'f', target: 'p' })])
    expect(checkInvariants(d)).toEqual([])
  })
})

describe('store — CRUD couche fonctionnelle', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('addModule / addFeature + getters', () => {
    const p = useProjectStore()
    const m = p.addModule({ name: 'Devis' })
    const f = p.addFeature(m, { name: 'F', code: 'DEV-01' })
    expect(p.modules).toHaveLength(1)
    expect(p.features).toHaveLength(1)
    expect(p.nodeById(f)?.parentId).toBe(m)
    expect(() => parseProjectDoc(p.serialize())).not.toThrow()
  })

  it('supprimer un module supprime ses fonctionnalités (cascade)', () => {
    const p = useProjectStore()
    const m = p.addModule()
    p.addFeature(m)
    p.addFeature(m)
    expect(p.features).toHaveLength(2)
    p.removeNode(m)
    expect(p.modules).toHaveLength(0)
    expect(p.features).toHaveLength(0)
  })

  it('relie deux fonctionnalités par dependsOn sans violer les invariants', () => {
    const p = useProjectStore()
    const m = p.addModule()
    const a = p.addFeature(m)
    const b = p.addFeature(m)
    p.addEdge({ type: 'dependsOn', source: a, target: b })
    expect(p.violations).toEqual([])
  })
})
