// Invariants du modèle v2 (evolution-v2.md §4 + décisions).
// Exécuté après chaque action (dev : throw), à l'ouverture (bloquant), avant écriture (garde-fou).
import type { FlooowNode, ProjectDoc } from '@/model/types'
import { isApiNote, isBlock, isFeature, isModule, isNote, isPage } from '@/model/types'

/** Code stable de chaque type de violation (utilisé par les tests et les messages UI). */
export type ViolationCode =
  | 'DANGLING_EDGE' // arête vers un id inexistant
  | 'PARENT_CYCLE' // cycle dans parentId
  | 'PAGE_PARENT' // une page a un parent (doit être rattachée au site)
  | 'BLOCK_PARENT' // un bloc n'a pas une page pour parent
  | 'NOTE_ATTACH' // note dont attachedTo ne pointe pas vers une page/bloc existant
  | 'BAD_SERVICE_REF' // note API dont serviceId n'existe pas dans le registre
  | 'NAVIGATES_NON_PAGE' // navigatesTo entre non-pages
  | 'DUPLICATE_ID' // id de nœud/service/arête non unique
  | 'BAD_HOME_PAGE' // homePageId ne pointe pas vers une page existante
  | 'NEGATIVE_HOURS' // hours < 0
  | 'BAD_LOT' // lot < 1
  | 'MODULE_PARENT' // un module a un parent (doit être racine de la couche fonctionnelle)
  | 'FEATURE_PARENT' // une fonctionnalité dont parentId ne pointe pas vers un module existant
  | 'REALIZES_TARGET' // realizedBy dont source n'est pas une fonctionnalité ou cible pas page/bloc

export interface Violation {
  code: ViolationCode
  message: string
  nodeId?: string
  edgeId?: string
  serviceId?: string
}

/** Identifiant canonique d'un endpoint (rapprochement méthode+chemin). */
export function endpointId(method: string, path: string): string {
  return `${method} ${path}`.trim()
}

/**
 * Vérifie tous les invariants référentiels et renvoie la liste des violations (vide = document sain).
 */
export function checkInvariants(doc: ProjectDoc): Violation[] {
  const violations: Violation[] = []

  // Index par id. En cas de doublon, la Map garde la dernière occurrence.
  const index = new Map<string, FlooowNode>()
  const seenNodeIds = new Set<string>()
  for (const node of doc.nodes) {
    if (seenNodeIds.has(node.id)) {
      violations.push({
        code: 'DUPLICATE_ID',
        message: `id de nœud dupliqué : ${node.id}`,
        nodeId: node.id,
      })
    }
    seenNodeIds.add(node.id)
    index.set(node.id, node)
  }
  // Doublons d'id de service.
  const serviceIds = new Set<string>()
  for (const svc of doc.services) {
    if (serviceIds.has(svc.id)) {
      violations.push({
        code: 'DUPLICATE_ID',
        message: `id de service dupliqué : ${svc.id}`,
        serviceId: svc.id,
      })
    }
    serviceIds.add(svc.id)
  }
  // Doublons d'id d'arête.
  const seenEdgeIds = new Set<string>()
  for (const edge of doc.edges) {
    if (seenEdgeIds.has(edge.id)) {
      violations.push({
        code: 'DUPLICATE_ID',
        message: `id d'arête dupliqué : ${edge.id}`,
        edgeId: edge.id,
      })
    }
    seenEdgeIds.add(edge.id)
  }

  // Structure des nœuds : rattachements, lot, heures.
  for (const node of doc.nodes) {
    // PAGE_PARENT : une page se rattache toujours au site (parentId null).
    if (isPage(node) && node.parentId != null) {
      violations.push({
        code: 'PAGE_PARENT',
        message: `la page ${node.id} ne doit pas avoir de parent (rattachée au site)`,
        nodeId: node.id,
      })
    }
    // BLOCK_PARENT : un bloc a toujours une page pour parent.
    if (isBlock(node)) {
      const parent = node.parentId != null ? index.get(node.parentId) : undefined
      if (!parent || !isPage(parent)) {
        violations.push({
          code: 'BLOCK_PARENT',
          message: `le bloc ${node.id} doit avoir une page pour parent`,
          nodeId: node.id,
        })
      }
    }
    // MODULE_PARENT : un module est racine de la couche fonctionnelle (pas de parent pour l'instant).
    if (isModule(node) && node.parentId != null) {
      violations.push({
        code: 'MODULE_PARENT',
        message: `le module ${node.id} ne doit pas avoir de parent`,
        nodeId: node.id,
      })
    }
    // FEATURE_PARENT : une fonctionnalité se rattache à un module existant (ou reste racine, null).
    if (isFeature(node) && node.parentId != null) {
      const parent = index.get(node.parentId)
      if (!parent || !isModule(parent)) {
        violations.push({
          code: 'FEATURE_PARENT',
          message: `la fonctionnalité ${node.id} doit avoir un module pour parent`,
          nodeId: node.id,
        })
      }
    }
    // NOTE_ATTACH : une note se rattache à une page ou un bloc existant.
    if (isNote(node)) {
      const target = index.get(node.attachedTo)
      if (!target || !(isPage(target) || isBlock(target))) {
        violations.push({
          code: 'NOTE_ATTACH',
          message: `la note ${node.id} doit être rattachée à une page ou un bloc existant`,
          nodeId: node.id,
        })
      }
    }
    // BAD_SERVICE_REF : note API pointant un service absent du registre.
    if (isApiNote(node) && !serviceIds.has(node.attrs.serviceId)) {
      violations.push({
        code: 'BAD_SERVICE_REF',
        message: `la note API ${node.id} référence un service inconnu : ${node.attrs.serviceId}`,
        nodeId: node.id,
      })
    }
    // BAD_LOT : lot explicite < 1.
    if (node.lot != null && node.lot < 1) {
      violations.push({
        code: 'BAD_LOT',
        message: `lot invalide (< 1) sur ${node.id} : ${node.lot}`,
        nodeId: node.id,
      })
    }
    // NEGATIVE_HOURS : note comportement avec heures négatives.
    if (node.type === 'note' && node.kind === 'behavior' && node.attrs.hours != null && node.attrs.hours < 0) {
      violations.push({
        code: 'NEGATIVE_HOURS',
        message: `heures négatives sur ${node.id} : ${node.attrs.hours}`,
        nodeId: node.id,
      })
    }
  }

  // PARENT_CYCLE : remontée de parentId qui reboucle (frames).
  for (const node of doc.nodes) {
    const chain = new Set<string>([node.id])
    let parentId = node.parentId
    while (parentId != null) {
      if (chain.has(parentId)) {
        violations.push({
          code: 'PARENT_CYCLE',
          message: `cycle de parentId impliquant ${node.id}`,
          nodeId: node.id,
        })
        break
      }
      chain.add(parentId)
      const parent = index.get(parentId)
      if (!parent) break // parent inexistant : pas un cycle
      parentId = parent.parentId
    }
  }

  // Arêtes : liens fantômes, navigatesTo page↔page.
  for (const edge of doc.edges) {
    const source = index.get(edge.source)
    const target = index.get(edge.target)
    if (!source || !target) {
      violations.push({
        code: 'DANGLING_EDGE',
        message: `arête ${edge.id} référence un id inexistant (${edge.source} → ${edge.target})`,
        edgeId: edge.id,
      })
      continue // les vérifs suivantes exigent des extrémités existantes
    }
    if (edge.type === 'navigatesTo' && (!isPage(source) || !isPage(target))) {
      violations.push({
        code: 'NAVIGATES_NON_PAGE',
        message: `navigatesTo (${edge.id}) ne relie pas deux pages`,
        edgeId: edge.id,
      })
    }
    // REALIZES_TARGET : « réalisé par » relie une fonctionnalité (source) à une page/bloc (cible).
    if (edge.type === 'realizedBy' && (!isFeature(source) || !(isPage(target) || isBlock(target)))) {
      violations.push({
        code: 'REALIZES_TARGET',
        message: `realizedBy (${edge.id}) doit relier une fonctionnalité à une page ou un bloc`,
        edgeId: edge.id,
      })
    }
  }

  // BAD_HOME_PAGE : homePageId doit pointer vers une page existante (ou être null).
  const home = doc.meta.homePageId
  if (home != null) {
    const node = index.get(home)
    if (!node || !isPage(node)) {
      violations.push({
        code: 'BAD_HOME_PAGE',
        message: `homePageId « ${home} » ne pointe pas vers une page existante`,
      })
    }
  }

  return violations
}

/** Lance une erreur agrégée si des invariants sont violés (utilisé en dev après action / à l'ouverture). */
export function assertInvariants(doc: ProjectDoc): void {
  const violations = checkInvariants(doc)
  if (violations.length > 0) {
    throw new Error(
      `Invariants violés (${violations.length}) : ` +
        violations.map((v) => `${v.code} ${v.message}`).join(' | '),
    )
  }
}
