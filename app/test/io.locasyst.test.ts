// Fixture « cadrage locasyst » (couche fonctionnelle) : schéma v3, invariants, intégrité des liens.
import { describe, it, expect } from 'vitest'
import { parseProjectDoc } from '@/model/schema'
import { migrate } from '@/model/migrations'
import { checkInvariants } from '@/domain/invariants'
import locasyst from '../fixtures/locasyst-project.flooow.json'

describe('fixture — cadrage locasyst adapté', () => {
  const doc = parseProjectDoc(migrate(locasyst))

  it('passe le schéma zod v3 après migration', () => {
    expect(() => parseProjectDoc(migrate(locasyst))).not.toThrow()
  })

  it('ne viole aucun invariant référentiel', () => {
    expect(checkInvariants(doc)).toEqual([])
  })

  it('contient 9 modules et des fonctionnalités rattachées', () => {
    const modules = doc.nodes.filter((n) => n.type === 'frame' && n.kind === 'module')
    const features = doc.nodes.filter((n) => n.type === 'feature')
    expect(modules).toHaveLength(9)
    expect(features.length).toBeGreaterThan(60)
    // chaque fonctionnalité est rattachée à un module existant
    const moduleIds = new Set(modules.map((m) => m.id))
    for (const f of features) expect(moduleIds.has(f.parentId as string)).toBe(true)
  })

  it('toutes les arêtes dependsOn relient deux fonctionnalités existantes', () => {
    const featureIds = new Set(doc.nodes.filter((n) => n.type === 'feature').map((n) => n.id))
    const deps = doc.edges.filter((e) => e.type === 'dependsOn')
    expect(deps.length).toBeGreaterThan(0)
    for (const e of deps) {
      expect(featureIds.has(e.source)).toBe(true)
      expect(featureIds.has(e.target)).toBe(true)
    }
  })
})
