<script setup lang="ts">
// Arête manuelle typée, en rendu ORTHOGONAL automatique (segments à angles droits) via le routeur
// natif de Vue Flow `getSmoothStepPath` — plus de points d'inflexion à manipuler (décision Hugo).
// Code couleur : navigatesTo = GRIS · dependsOn = gris tireté.
import { computed } from 'vue'
import { BaseEdge, getSmoothStepPath, type Position as HandlePosition } from '@vue-flow/core'
import type { EdgeType as FlooowEdgeType } from '@/model/types'
import { NAV_COLOR } from '@/theme/tokens'
import { type TypedEdgeData } from '../useCanvasSync'

const props = defineProps<{
  id: string
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  sourcePosition: HandlePosition
  targetPosition: HandlePosition
  markerEnd?: string
  data?: TypedEdgeData
  selected?: boolean
}>()

const kind = computed<FlooowEdgeType>(() => props.data?.edgeType ?? 'dependsOn')

const STYLES: Record<FlooowEdgeType, { stroke: string; width: number; dash?: string }> = {
  navigatesTo: { stroke: NAV_COLOR, width: 2 },
  dependsOn: { stroke: '#94a3b8', width: 1, dash: '10 6' },
  // « réalisé par » (pont fonctionnel → structurel) : vert, visible surtout en vue couverture.
  realizedBy: { stroke: '#10b981', width: 1.5, dash: '2 5' },
}
const style = computed(() => {
  const s = STYLES[kind.value]
  return {
    stroke: props.selected ? '#0ea5e9' : s.stroke,
    strokeWidth: s.width,
    strokeDasharray: s.dash,
  }
})

// Tracé orthogonal (coins légèrement arrondis) entre les poignées source/cible.
const routed = computed(() =>
  getSmoothStepPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
    borderRadius: 6,
    // Éloignement du port avant de tourner : réduit en couche fonctionnelle (évite les S entre
    // cartes proches). Défaut Vue Flow (20) sinon.
    offset: props.data?.offset ?? 20,
  }),
)
const path = computed(() => routed.value[0])
</script>

<template>
  <BaseEdge :id="id" :path="path" :marker-end="markerEnd" :style="style" />
</template>
