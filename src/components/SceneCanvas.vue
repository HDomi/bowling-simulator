<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { BowlingScene } from '@/scene/BowlingScene'
import { useSimulatorStore } from '@/stores/simulator'

const store = useSimulatorStore()
const { pattern, rollNonce, cameraPreset, result, preview, isRolling } = storeToRefs(store)
const canvasRef = ref<HTMLCanvasElement | null>(null)
let scene: BowlingScene | null = null

onMounted(async () => {
  if (!canvasRef.value) {
    return
  }
  scene = new BowlingScene(canvasRef.value, store.ball.colors)
  await scene.ready
  scene.setPattern(pattern.value)
  scene.applyCameraPreset(cameraPreset.value)
  scene.showPreview(preview.value)
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  scene?.dispose()
  scene = null
})

watch(pattern, (next) => {
  scene?.setPattern(next)
})

watch(
  preview,
  (shot) => {
    if (!scene || isRolling.value) {
      return
    }
    scene.showPreview(shot)
  },
)

watch(cameraPreset, (next) => {
  scene?.applyCameraPreset(next)
})

watch(rollNonce, async () => {
  if (!scene || !result.value) {
    return
  }
  await scene.ready
  scene.playShot(
    result.value,
    ({ pinsDown, isStrike }) => {
      store.finishPins(pinsDown, isStrike)
    },
    store.ball.weightLb,
  )
})

/**
 * 캔버스 해상도를 창 크기에 맞춘다.
 */
function handleResize(): void {
  scene?.resize()
}
</script>

<template>
  <canvas
    ref="canvasRef"
    class="h-full w-full bg-void"
  />
</template>
