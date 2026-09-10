<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { surfaceMarkers } from '@/domain/ballGeometry'
import { HARRY } from '@/domain/constants'
import { BallViewer } from '@/scene/BallViewer'
import { useBallsStore } from '@/stores/balls'
import { useSimulatorStore } from '@/stores/simulator'

const ballsStore = useBallsStore()
const simulator = useSimulatorStore()
const { simBall, exaggeration } = storeToRefs(ballsStore)
const { hand } = storeToRefs(simulator)

const canvasRef = ref<HTMLCanvasElement | null>(null)
let viewer: BallViewer | null = null
let observer: ResizeObserver | null = null

const markers = computed(() =>
  surfaceMarkers(simBall.value, { papOver: HARRY.papOver, papUp: HARRY.papUp, hand: hand.value }),
)

/** 외관에만 관여하는 필드. 이게 바뀔 때만 텍스처를 다시 굽는다. */
const lookKey = computed(
  () => `${simBall.value.colors[0]}|${simBall.value.colors[1]}|${simBall.value.cover}|${simBall.value.grit}`,
)

onMounted(() => {
  if (!canvasRef.value) {
    return
  }
  viewer = new BallViewer(canvasRef.value, simBall.value)
  viewer.update(simBall.value, markers.value, exaggeration.value)
  observer = new ResizeObserver(() => viewer?.resize())
  observer.observe(canvasRef.value)
})

onUnmounted(() => {
  observer?.disconnect()
  observer = null
  viewer?.dispose()
  viewer = null
})

watch([simBall, markers, exaggeration], () => {
  viewer?.update(simBall.value, markers.value, exaggeration.value)
})

watch(lookKey, () => {
  viewer?.setLook(simBall.value)
})
</script>

<template>
  <canvas
    ref="canvasRef"
    class="aspect-square w-full rounded-sm bg-paper-dark"
  />
</template>
