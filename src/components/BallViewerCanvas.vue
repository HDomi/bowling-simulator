<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { surfaceMarkers } from '@/domain/ballGeometry'
import { HARRY } from '@/domain/constants'
import { mergePaintBlobs } from '@/domain/paintTexture'
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

/**
 * 활성 볼의 페인팅을 불러 껍질에 입힌다. 없으면 절차적 텍스처로 되돌린다.
 */
async function syncPaint(): Promise<void> {
  const instance = viewer
  const target = ballsStore.activeBall
  if (!instance) {
    return
  }
  if (!target.hasPaint) {
    instance.setPaintTexture(null, simBall.value)
    return
  }
  const saved = await ballsStore.loadPaint(target.id)
  if (!saved) {
    instance.setPaintTexture(null, simBall.value)
    return
  }
  const merged = await mergePaintBlobs(saved.fluid, saved.brush)
  if (viewer === instance) {
    instance.setPaintTexture(merged, simBall.value, saved.baseColor)
  }
}

onMounted(() => {
  if (!canvasRef.value) {
    return
  }
  viewer = new BallViewer(canvasRef.value, simBall.value)
  viewer.update(simBall.value, markers.value, exaggeration.value)
  void syncPaint()
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

watch(
  () => `${ballsStore.activeBall.id}|${ballsStore.activeBall.hasPaint ? '1' : '0'}`,
  () => {
    void syncPaint()
  },
)

// 페인팅 에디터를 닫는 순간 갱신된 텍스처를 다시 읽는다.
watch(
  () => ballsStore.paintingId,
  (next, previous) => {
    if (!next && previous) {
      void syncPaint()
    }
  },
)
</script>

<template>
  <canvas
    ref="canvasRef"
    class="aspect-square w-full rounded-sm bg-paper-dark"
  />
</template>
