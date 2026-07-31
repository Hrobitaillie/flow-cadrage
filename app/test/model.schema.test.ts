import { describe, it, expect } from 'vitest'
import { parseProjectDoc, safeParseProjectDoc } from '@/model/schema'
import { migrate, UnsupportedVersionError } from '@/model/migrations'
import { createEmptyProject } from '@/model/factory'
import sample from '../fixtures/sample-project.flooow.json'

describe('schema', () => {
  it('valide un document vierge', () => {
    expect(() => parseProjectDoc(createEmptyProject())).not.toThrow()
  })

  it('valide le fixture écrit à la main', () => {
    expect(() => parseProjectDoc(sample)).not.toThrow()
  })

  it('rejette une clé inconnue (.strict)', () => {
    const bad = { ...createEmptyProject(), rogue: true }
    expect(safeParseProjectDoc(bad).success).toBe(false)
  })

  it('rejette un type de nœud inconnu', () => {
    const doc = createEmptyProject() as unknown as { nodes: unknown[] }
    doc.nodes = [{ id: 'x', type: 'widget', parentId: null, position: { x: 0, y: 0 }, attrs: {} }]
    expect(safeParseProjectDoc(doc).success).toBe(false)
  })

  it('rejette un nœud de type portal (portail = nœud supprimé du modèle)', () => {
    const doc = createEmptyProject() as unknown as { nodes: unknown[] }
    doc.nodes = [
      {
        id: 'portal-x-out',
        type: 'portal',
        parentId: null,
        attachedTo: 'pg',
        position: { x: 10, y: 10 },
        attrs: { pairId: 'x', role: 'out' },
      },
    ]
    expect(safeParseProjectDoc(doc).success).toBe(false)
  })

  it('valide le mode de rendu portal sur une arête', () => {
    const doc = createEmptyProject() as unknown as { edges: unknown[] }
    doc.edges = [
      {
        id: 'e',
        type: 'navigatesTo',
        source: 'a',
        target: 'b',
        attrs: { render: 'portal' },
      },
    ]
    expect(safeParseProjectDoc(doc).success).toBe(true)
  })

  it('rejette un mode de rendu inconnu (strict)', () => {
    const doc = createEmptyProject() as unknown as { edges: unknown[] }
    doc.edges = [
      {
        id: 'e',
        type: 'navigatesTo',
        source: 'a',
        target: 'b',
        attrs: { render: 'blob' },
      },
    ]
    expect(safeParseProjectDoc(doc).success).toBe(false)
  })

  it('rejette un attachedTo sur une frame (strict)', () => {
    const doc = createEmptyProject() as unknown as { nodes: unknown[] }
    doc.nodes = [
      {
        id: 'p',
        type: 'frame',
        kind: 'page',
        parentId: null,
        attachedTo: 'x',
        position: { x: 0, y: 0 },
        attrs: { name: '', route: '', roles: [], description: '', constraints: [], logic: '', notes: '' },
      },
    ]
    expect(safeParseProjectDoc(doc).success).toBe(false)
  })
})

describe('migrations', () => {
  it('laisse passer un document au format courant', () => {
    const doc = createEmptyProject()
    expect(migrate(doc)).toBeTruthy()
  })

  it('rejette un format futur', () => {
    const future = { meta: { formatVersion: 99 } }
    expect(() => migrate(future)).toThrow(UnsupportedVersionError)
  })

  it('rejette un document sans formatVersion', () => {
    expect(() => migrate({})).toThrow()
  })
})

describe('migrations — v1 → v2', () => {
  const v1 = {
    meta: {
      name: 'Legacy',
      formatVersion: 1,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
      pricing: { riskCoeff: 1.25, dailyRate: null },
      homePageId: 'page-home',
    },
    site: { attrs: { context: 'ctx', constraints: [], notes: '' } },
    nodes: [
      {
        id: 'page-home',
        type: 'frame',
        kind: 'page',
        parentId: null,
        position: { x: 0, y: 0 },
        size: { w: 420, h: 300 },
        attrs: { name: 'Home', description: 'd', route: '/', roles: ['user'], constraints: [], logic: '', notes: '' },
      },
      {
        id: 'section-list',
        type: 'frame',
        kind: 'section',
        parentId: 'page-home',
        position: { x: 20, y: 80 },
        size: { w: 220, h: 140 },
        attrs: { name: 'Listing', description: 'liste', constraints: ['pag'], logic: '', notes: '' },
      },
      {
        id: 'behavior-search',
        type: 'behavior',
        parentId: 'section-list',
        position: { x: 12, y: 40 },
        lot: 2,
        attrs: { name: 'Recherche', description: 'x', facet: 'front', trigger: 'saisie', rules: '', hours: 5, notes: '' },
      },
      {
        id: 'service-erp',
        type: 'service',
        parentId: null,
        position: { x: -300, y: 120 },
        attrs: {
          name: 'ERP',
          kind: 'REST',
          auth: 'OAuth2',
          risk: 'medium',
          endpoints: [{ method: 'GET', path: '/orders', notes: '' }],
          constraints: [],
          notes: 'n',
        },
      },
    ],
    edges: [
      { id: 'e-nav', type: 'navigatesTo', source: 'page-home', target: 'page-home', attrs: {} },
      {
        id: 'e-consume',
        type: 'consumes',
        source: 'behavior-search',
        target: 'service-erp',
        attrs: { endpointRef: 'GET /orders' },
      },
    ],
  }

  it('produit un document v2 valide', () => {
    const migrated = migrate(v1)
    expect(() => parseProjectDoc(migrated)).not.toThrow()
  })

  it('section → bloc free, behavior → note, service → registre, consumes → note api', () => {
    const migrated = parseProjectDoc(migrate(v1))
    // migrate() applique toute la chaîne jusqu'à CURRENT (v1 → v2 → v3 → v4).
    expect(migrated.meta.formatVersion).toBe(4)

    const block = migrated.nodes.find((n) => n.id === 'section-list')!
    expect(block.type).toBe('frame')
    expect((block as { kind: string }).kind).toBe('block')
    expect((block as { attrs: { blockType: string } }).attrs.blockType).toBe('free')

    const note = migrated.nodes.find((n) => n.id === 'behavior-search')!
    expect(note.type).toBe('note')
    expect((note as { kind: string }).kind).toBe('behavior')
    expect((note as { attachedTo: string }).attachedTo).toBe('section-list')
    expect(note.parentId).toBeNull()

    expect(migrated.services.map((s) => s.id)).toEqual(['service-erp'])
    expect(migrated.nodes.some((n) => n.id === 'service-erp')).toBe(false)

    const apiNote = migrated.nodes.find((n) => n.type === 'note' && n.kind === 'api')!
    expect((apiNote as { attachedTo: string }).attachedTo).toBe('behavior-search')
    const apiAttrs = (apiNote as { attrs: { serviceId: string; method: string; path: string } }).attrs
    expect(apiAttrs).toMatchObject({ serviceId: 'service-erp', method: 'GET', path: '/orders' })

    // navigatesTo conservée, consumes retirée des edges.
    expect(migrated.edges.map((e) => e.type)).toEqual(['navigatesTo'])
  })
})
