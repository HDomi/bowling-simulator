<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { BowlingScene } from '@/scene/BowlingScene'
import { mergePaintBlobs } from '@/domain/paintTexture'
import { useBallsStore } from '@/stores/balls'
import { useSimulatorStore } from '@/stores/simulator'

const store = useSimulatorStore()
const ballsStore = useBallsStore()
const {
  ball, pattern, rollNonce, resetNonce, sweepNonce, sweepKeepIds, ballNumber,
  cameraPreset, result, preview, comparePreview, isRolling, candidateShots,
} = storeToRefs(store)
const canvasRef = ref<HTMLCanvasElement | null>(null)
let scene: BowlingScene | null = null

const loading = ref(true)
const failure = ref(false)
let observer: ResizeObserver | null = null
let disposed = false

onMounted(async () => {
  if (!canvasRef.value) return
  try {
    const instance = new BowlingScene(canvasRef.value, ball.value)
    scene = instance
    await instance.ready
    if (disposed) { instance.dispose(); return }
    instance.setPattern(pattern.value)
    instance.applyCameraPreset(cameraPreset.value)
    instance.showPreview(preview.value)
    instance.showGhost(comparePreview.value)
    instance.showCandidates(candidateShots.value)
    await syncPaint()
    observer = new ResizeObserver(handleResize)
    observer.observe(canvasRef.value)
    loading.value = false
  } catch {
    if (!disposed) { failure.value = true; loading.value = false; store.isRolling = false }
  }
})

onUnmounted(() => {
  disposed = true
  observer?.disconnect()
  scene?.dispose()
  scene = null
})

function reload(): void { window.location.reload() }

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

watch(candidateShots, (shots) => {
  scene?.showCandidates(shots)
}, { deep: false })

/**
 * 활성 볼의 페인팅을 불러 씬에 입힌다. 없으면 절차적 텍스처로 되돌린다.
 */
async function syncPaint(): Promise<void> {
  const instance = scene
  const target = ballsStore.activeBall
  if (!instance) {
    return
  }
  if (!target.hasPaint) {
    instance.setPaintTexture(null)
    return
  }
  const saved = await ballsStore.loadPaint(target.id)
  if (!saved) {
    instance.setPaintTexture(null)
    return
  }
  const merged = await mergePaintBlobs(saved.fluid, saved.brush)
  if (scene === instance) {
    instance.setPaintTexture(merged)
  }
}

/** 외관 필드만 묶은 키. 무게 슬라이더로 RG만 바뀔 때 텍스처를 다시 굽지 않는다. */
const lookKey = computed(
  () => `${ball.value.colors[0]}|${ball.value.colors[1]}|${ball.value.cover}|${ball.value.grit}`,
)

watch(lookKey, () => {
  scene?.setBallLook(ball.value)
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

watch(cameraPreset, (next) => {
  scene?.applyCameraPreset(next)
})

watch(rollNonce, async () => {
  if (!scene || !result.value) {
    return
  }
  const instance = scene
  const shot = result.value
  await instance.ready
  if (disposed) return
  instance.playShot(
    shot,
    ({ pinsDown, isStrike }) => {
      store.finishPins(pinsDown, isStrike)
    },
    ball.value.weightLb,
    // 2구는 남아 있는 핀을 그대로 두고 굴린다.
    ballNumber.value === 1,
  )
})

watch(resetNonce, async () => {
  if (!scene) return
  const instance = scene
  await instance.ready
  if (disposed) return
  instance.resetDeck()
})

watch(sweepNonce, async () => {
  if (!scene) return
  const instance = scene
  await instance.ready
  if (disposed) return
  instance.runPinsetter([...sweepKeepIds.value], () => {
    store.finishPinsetter()
  })
})

/**
 * 캔버스 해상도를 창 크기에 맞춘다.
 */
function handleResize(): void {
  scene?.resize()
}
</script>

<template>
  <div class="relative h-full w-full">
  <canvas
    ref="canvasRef"
    class="h-full w-full bg-paper"
  />
  <div v-if="loading" class="scene-loading" role="status">PREPARING YOUR LANE…</div>
  <div v-if="failure" class="scene-error" role="alert"><p>3D 레인을 불러오지 못했어요.</p><p>WebGL을 지원하는 브라우저에서 다시 시도해 주세요.</p><button @click="reload">다시 불러오기</button></div>
  </div>
</template>
