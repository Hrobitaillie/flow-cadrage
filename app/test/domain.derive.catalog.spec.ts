import { describe, it, expect } from 'vitest'
import { deriveCatalog } from '@/domain/derive/catalog'
import {
  createEmptyProject,
  createPage,
  createBlock,
  createModule,
  createFeature,
  createApiNote,
  createService,
  createEdge,
} from '@/model/factory'
import { mergeFeatureFields, docToPlainText } from '@/model/richContent'
import type { FlooowEdge, FlooowNode, ProjectDoc, Service } from '@/model/types'

function doc(nodes: FlooowNode[], edges: FlooowEdge[] = [], services: Service[] = []): ProjectDoc {
  return { ...createEmptyProject(), nodes, edges, services }
}

// Module « Devis » avec deux fonctionnalités empilées ; DEV-06 dépend de DEV-04.
const mod = createModule({ id: 'm', name: 'Demande de devis' })
const dev04 = createFeature({
  id: 'dev04',
  parentId: 'm',
  code: 'DEV-04',
  name: 'Formulaire de devis',
  position: { x: 0, y: 0 },
  lot: 1,
  attrs: { code: 'DEV-04', name: 'Formulaire de devis', content: mergeFeatureFields({ description: 'saisir une demande', implies: 'POST location' }), perimeter: 'site', estimate: '3j' },
})
const dev06 = createFeature({
  id: 'dev06',
  parentId: 'm',
  code: 'DEV-06',
  name: 'Email de confirmation',
  position: { x: 0, y: 152 },
  attrs: { code: 'DEV-06', name: 'Email de confirmation', content: { type: 'doc', content: [] }, perimeter: null, estimate: '' },
})
const dependency = createEdge({ type: 'dependsOn', source: 'dev06', target: 'dev04' })

const page = createPage({ id: 'p', name: 'Panier' })
const block = createBlock({ id: 'blk', parentId: 'p', name: 'Formulaire' })
const realizes = createEdge({ type: 'realizedBy', source: 'dev04', target: 'p' })
const svc = createService({ id: 'svc', name: 'Locasuite' })
const apiNote = createApiNote({ id: 'a', attachedTo: 'p', serviceId: 'svc', method: 'POST', path: '/location' })

const full = doc([mod, dev04, dev06, page, block, apiNote], [dependency, realizes], [svc])

describe('deriveCatalog — structure par module', () => {
  it('groupe les fonctionnalités sous leur module, empilées par position.y', () => {
    const cat = deriveCatalog(full)
    expect(cat.groups.map((g) => g.moduleName)).toEqual(['Demande de devis'])
    expect(cat.groups[0]!.features.map((f) => f.code)).toEqual(['DEV-04', 'DEV-06'])
  })

  it('fusionne contenu / lot résolu / périmètre / estimation', () => {
    const card = deriveCatalog(full).groups[0]!.features[0]!
    expect(card).toMatchObject({ code: 'DEV-04', perimeter: 'site', estimate: '3j', lot: 1 })
    const text = docToPlainText(card.content)
    expect(text).toContain('saisir une demande')
    expect(text).toContain('POST location')
  })

  it('dépend de / débloque calculés dans les deux sens', () => {
    const cards = deriveCatalog(full).groups[0]!.features
    const dev04Card = cards.find((f) => f.code === 'DEV-04')!
    const dev06Card = cards.find((f) => f.code === 'DEV-06')!
    expect(dev06Card.dependsOn.map((d) => d.code)).toEqual(['DEV-04'])
    expect(dev04Card.unlocks.map((d) => d.code)).toEqual(['DEV-06'])
  })

  it('réalisé par + endpoints déduits via realizedBy', () => {
    const card = deriveCatalog(full).groups[0]!.features[0]!
    expect(card.realizers).toEqual([{ id: 'p', name: 'Panier', kind: 'page' }])
    expect(card.endpoints).toEqual([
      { serviceId: 'svc', serviceName: 'Locasuite', method: 'POST', path: '/location' },
    ])
    expect(card.orphan).toBe(false)
  })

  it('fonctionnalité sans réalisateur est marquée orpheline', () => {
    const card = deriveCatalog(full).groups[0]!.features.find((f) => f.code === 'DEV-06')!
    expect(card.orphan).toBe(true)
    expect(deriveCatalog(full).orphanFeatures).toContain('dev06')
  })
})

describe('deriveCatalog — fonctionnalités racines', () => {
  it('les fonctionnalités sans module tombent dans un groupe transverse en fin', () => {
    const root = createFeature({ id: 'r', parentId: null, code: 'SOC-01', name: 'Socle' })
    const cat = deriveCatalog(doc([mod, dev04, root], []))
    expect(cat.groups.at(-1)!.moduleId).toBeNull()
    expect(cat.groups.at(-1)!.features.map((f) => f.code)).toEqual(['SOC-01'])
  })

  it('projet sans fonctionnalité → catalogue vide', () => {
    expect(deriveCatalog(createEmptyProject()).groups).toEqual([])
  })
})
