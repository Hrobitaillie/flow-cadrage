<script setup lang="ts">
// Connecteur automatique note → attachedTo (et pastille portail → élément) — evolution-v2.md §2.
// Tracé ORTHOGONAL (segments H/V, angles droits), avec le MINIMUM de virages :
//   - le point sur la CIBLE est réparti par RANG (rank/count) le long de son bord → l'ordre des
//     points suit l'ordre vertical des notes (pas de croisement, cohérent quand on ajoute une note).
//   - le point sur la NOTE glisse vers ce point (tracé droit si possible, sinon Z à angles droits).
// Géométrie « floating » recalculée en direct depuis les rectangles live → suit le drag. Non interactif.
import { computed } from 'vue'
import { BaseEdge, useVueFlow } from '@vue-flow/core'

const props = defineProps<{
  id: string
  source: string
  target: string
  data?: { color?: string; solid?: boolean; rank?: number; count?: number; corner?: 'left' | 'right' }
}>()

const vf = useVueFlow()

interface Rect {
  l: number
  r: number
  t: number
  b: number
  cx: number
  cy: number
  w: number
  h: number
}

function rectOf(nodeId: string): Rect | null {
  const gn = vf.findNode(nodeId)
  if (!gn) return null
  const w = gn.dimensions.width || 160
  const h = gn.dimensions.height || 60
  const x = gn.computedPosition.x
  const y = gn.computedPosition.y
  return { l: x, r: x + w, t: y, b: y + h, cx: x + w / 2, cy: y + h / 2, w, h }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

/** Écart minimal entre deux points de connexion sur un même bord avant de devoir les répartir. */
const MIN_POINT_GAP = 18

/**
 * Position du point de connexion sur le bord de la cible (le long de l'axe [lo,hi]), pour la note de
 * rang `rank` sur `count`. `src` = centre de la note le long de cet axe.
 *   - assez de place pour toutes les notes (count ≤ capacité du bord) : le point SUIT la note (glisse
 *     sur `src`) → tracé droit et court, où que la note se trouve (cas des notes de page).
 *   - cible SURCHARGÉE (petit bord, trop de notes) : réparti UNIFORMÉMENT sur le bord (anti-chevauch.).
 */
function targetPoint(lo0: number, hi0: number, rank: number, count: number, src: number): number {
  const pad = Math.min(14, Math.max(0, (hi0 - lo0) / 2 - 2))
  const lo = lo0 + pad
  const hi = hi0 - pad
  if (count <= 1) return clamp(src, lo, hi)
  const capacity = Math.floor((hi - lo) / MIN_POINT_GAP) + 1
  if (count <= capacity) return clamp(src, lo, hi)
  return lo + ((rank + 0.5) / count) * (hi - lo)
}

const path = computed<string>(() => {
  const S = rectOf(props.source) // note / pastille (petite)
  const T = rectOf(props.target) // page / bloc (grande)
  if (!S || !T) return ''
  const rank = props.data?.rank ?? 0
  const count = Math.max(1, props.data?.count ?? 1)

  // Tie de PORTAIL : part du bord haut de la page (près du coin droite/gauche, avec une petite MARGE
  // pour ne pas coller à l'angle), MONTE, puis part sur le côté rejoindre la pastille (empilée
  // au-dessus, alignée X avec les notes).
  if (props.data?.corner) {
    const CORNER_MARGIN = 14
    const cornerX = props.data.corner === 'right' ? T.r - CORNER_MARGIN : T.l + CORNER_MARGIN
    const portalEdgeX = props.data.corner === 'right' ? S.l : S.r
    return `M ${cornerX},${T.t} L ${cornerX},${S.cy} L ${portalEdgeX},${S.cy}`
  }

  // Séparation source↔cible : horizontale si la note est nettement à gauche/droite, verticale si
  // au-dessus/en dessous ; en cas de chevauchement, on tranche par l'écart de centres dominant.
  const hSep = S.l >= T.r || S.r <= T.l
  const vSep = S.t >= T.b || S.b <= T.t
  const horizontal =
    hSep && !vSep ? true : vSep && !hSep ? false : Math.abs(S.cx - T.cx) >= Math.abs(S.cy - T.cy)

  if (horizontal) {
    const noteRight = S.cx > T.cx
    const xN = noteRight ? S.l : S.r // bord de la note face à la cible
    const xT = noteRight ? T.r : T.l // bord de la cible face à la note
    const yT = targetPoint(T.t, T.b, rank, count, S.cy)
    const yN = clamp(yT, S.t, S.b) // point sur la note : glisse vers yT (tracé droit si possible)
    if (Math.abs(yN - yT) < 0.5) return `M ${xN},${yN} L ${xT},${yT}` // droit
    const midX = (xN + xT) / 2
    return `M ${xN},${yN} L ${midX},${yN} L ${midX},${yT} L ${xT},${yT}` // Z (2 virages)
  }

  // Routage vertical (note au-dessus/dessous de la cible).
  const noteBelow = S.cy > T.cy
  const yN = noteBelow ? S.t : S.b
  const yT = noteBelow ? T.b : T.t
  const xT = targetPoint(T.l, T.r, rank, count, S.cx)
  const xN = clamp(xT, S.l, S.r)
  if (Math.abs(xN - xT) < 0.5) return `M ${xN},${yN} L ${xT},${yT}`
  const midY = (yN + yT) / 2
  return `M ${xN},${yN} L ${xN},${midY} L ${xT},${midY} L ${xT},${yT}`
})
</script>

<template>
  <BaseEdge
    v-if="path"
    :id="id"
    :path="path"
    :interaction-width="0"
    :style="{
      stroke: data?.color ?? '#f59e0b',
      strokeWidth: data?.solid ? 1.75 : 1.25,
      strokeDasharray: data?.solid ? undefined : '4 3',
      pointerEvents: 'none',
      opacity: data?.solid ? 0.9 : 0.7,
    }"
  />
</template>
