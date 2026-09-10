<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { BowlingScene } from '@/scene/BowlingScene'
import { useSimulatorStore } from '@/stores/simulator'

const store = useSimulatorStore()
const { ball, pattern, rollNonce, cameraPreset, result, preview, comparePreview, isRolling } =
  storeToRefs(store)
const canvasRef = ref<HTMLCanvasElement | null>(null)
let scene: BowlingScene | null = null

onMounted(async () => {
  if (!canvasRef.value) {
    return
  }
  scene = new BowlingScene(canvasRef.value, ball.value)
  await scene.ready
  scene.setPattern(pattern.value)
  scene.applyCameraPreset(cameraPreset.value)
  scene.showPreview(preview.value)
  scene.showGhost(comparePreview.value)
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

watch(comparePreview, (shot) => {
  scene?.showGhost(shot)
})

/** 외관 필드만 묶은 키. 무게 슬라이더로 RG만 바뀔 때 텍스처를 다시 굽지 않는다. */
const lookKey = computed(
  () => `${ball.value.colors[0]}|${ball.value.colors[1]}|${ball.value.cover}|${ball.value.grit}`,
)

watch(lookKey, () => {
  scene?.setBallLook(ball.value)
})

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
    ball.value.weightLb,
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
