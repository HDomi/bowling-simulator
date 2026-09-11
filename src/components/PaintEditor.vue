<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { onUnmounted, ref, watch } from 'vue'
import {
  BRUSH_RADIUS,
  DEFAULT_BASE_COLOR,
  drawBlob,
  encodeCanvas,
} from '@/domain/paintTexture'
import { PaintScene, type PaintMode } from '@/scene/PaintScene'
import { useBallsStore } from '@/stores/balls'

const ballsStore = useBallsStore()
const { paintingBall } = storeToRefs(ballsStore)

const canvasRef = ref<HTMLCanvasElement | null>(null)
let scene: PaintScene | null = null
let observer: ResizeObserver | null = null

const mode = ref<PaintMode>('brush')
const brushColor = ref('#f2e8d5')
const brushRadius = ref<number>(BRUSH_RADIUS.default)
const baseColor = ref(DEFAULT_BASE_COLOR)
const saving = ref(false)
const failed = ref(false)
const canUndo = ref(false)

const PALETTE = [
  '#f2e8d5',
  '#1d1b19',
  '#b8532f',
  '#c9a227',
  '#4e6658',
  '#2f5d7c',
  '#7b4a75',
  '#a64b35',
]

/**
 * 편집 씬을 만들고 저장된 페인팅이 있으면 불러온다.
 */
async function mountScene(): Promise<void> {
  const target = paintingBall.value
  if (!canvasRef.value || !target) {
    return
  }
  const instance = new PaintScene(canvasRef.value)
  scene = instance

  const saved = await ballsStore.loadPaint(target.id)
  if (saved) {
    await drawBlob(saved.fluid, instance.fluid)
    await drawBlob(saved.brush, instance.brush)
    instance.loadFluid(instance.fluid)
    baseColor.value = saved.baseColor
  } else {
    // 처음 여는 볼은 지금 색을 배경으로 깔아 준다.
    baseColor.value = target.colors[0]
    instance.fillBase(target.colors[0])
  }
  instance.onChange = () => {
    canUndo.value = instance.canUndo
  }
  instance.refresh()
  instance.setMode(mode.value)
  instance.setStroke({ color: brushColor.value, radius: brushRadius.value })

  observer = new ResizeObserver(() => instance.resize())
  observer.observe(canvasRef.value)
  instance.resize()
}

/**
 * 씬을 정리한다.
 */
function unmountScene(): void {
  observer?.disconnect()
  observer = null
  scene?.dispose()
  scene = null
}

watch(paintingBall, async (next) => {
  unmountScene()
  if (next) {
    // 캔버스가 DOM에 붙은 뒤에 씬을 만든다.
    await new Promise((resolve) => requestAnimationFrame(resolve))
    await mountScene()
  }
})

onUnmounted(unmountScene)

watch(mode, (next) => scene?.setMode(next))
watch([brushColor, brushRadius], () => {
  scene?.setStroke({ color: brushColor.value, radius: brushRadius.value })
})

/**
 * 색을 고른다. 배경색 모드면 바로 칠한다.
 * @param {string} color - 색
 */
function pickColor(color: string): void {
  if (mode.value === 'fill') {
    baseColor.value = color
    scene?.fillBase(color)
    return
  }
  brushColor.value = color
}

/**
 * 볼을 무작위로 돌려 색을 섞는다.
 */
function mix(): void {
  scene?.mixColors()
}

/**
 * 브러시 획을 되돌린다.
 */
function undo(): void {
  scene?.undo()
  canUndo.value = scene?.canUndo ?? false
}

/**
 * 브러시 레이어를 통째로 지운다.
 */
function clearBrush(): void {
  scene?.clearBrush()
  canUndo.value = scene?.canUndo ?? false
}

/**
 * 두 레이어를 WebP로 굽고 저장한 뒤 에디터를 닫는다.
 */
async function save(): Promise<void> {
  const target = paintingBall.value
  if (!scene || !target || saving.value) {
    return
  }
  saving.value = true
  failed.value = false
  try {
    // 흐르는 중에 구우면 중간 상태가 박힌다. 멈출 때까지 기다린다.
    const deadline = Date.now() + 5000
    while (scene.fluidRunning && Date.now() < deadline) {
      await new Promise((resolve) => requestAnimationFrame(resolve))
    }
    scene.syncFluidCanvas()
    const [fluid, brush] = await Promise.all([
      encodeCanvas(scene.fluid),
      encodeCanvas(scene.brush),
    ])
    if (!fluid || !brush) {
      failed.value = true
      return
    }
    const ok = await ballsStore.storePaint({
      ballId: target.id,
      fluid,
      brush,
      baseColor: baseColor.value,
      updatedAt: Date.now(),
    })
    if (!ok) {
      failed.value = true
      return
    }
    ballsStore.closePaint()
  } finally {
    saving.value = false
  }
}

/**
 * 저장하지 않고 닫는다.
 */
function cancel(): void {
  ballsStore.closePaint()
}
</script>

<template>
  <Transition name="paint">
    <div
      v-if="paintingBall"
      class="fixed inset-0 z-50 bg-paper"
      role="dialog"
      aria-label="볼 색상 편집"
    >
      <canvas
        ref="canvasRef"
        class="absolute inset-0 h-full w-full"
      />

      <aside
        class="absolute top-0 right-0 z-10 flex h-full w-72 flex-col gap-4 overflow-y-auto border-l border-ink/15 bg-paper/92 p-4 backdrop-blur"
      >
        <div class="flex items-baseline justify-between">
          <h2 class="font-ui text-xs tracking-[0.2em] text-muted uppercase">색상 편집</h2>
          <span class="font-mono text-xs text-ink">{{ paintingBall.name }}</span>
        </div>

        <!-- 도구 -->
        <div class="grid grid-cols-3 gap-1">
          <button
            v-for="tool in [
              { id: 'orbit' as const, label: '회전' },
              { id: 'fill' as const, label: '배경색' },
              { id: 'brush' as const, label: '브러시' },
              { id: 'drop' as const, label: '물방울' },
              { id: 'smudge' as const, label: '손가락' },
            ]"
            :key="tool.id"
            class="rounded-sm border px-2 py-1.5 font-ui text-xs"
            :class="
              mode === tool.id
                ? 'border-sage/40 bg-sage/15 text-sage'
                : 'border-ink/15 text-muted'
            "
            @click="mode = tool.id"
          >
            {{ tool.label }}
          </button>
        </div>

        <p class="font-ui text-[11px] leading-relaxed text-muted">
          {{
            mode === 'orbit'
              ? '드래그로 볼을 돌린다.'
              : mode === 'drop'
                ? '클릭한 자리에 색이 유체처럼 퍼진다. Ctrl(⌘)로 회전.'
                : mode === 'smudge'
                  ? '누른 채 휘저으면 색이 섞인다. Ctrl(⌘)로 회전.'
                  : 'Ctrl(⌘)을 누르는 동안에는 볼이 돌아간다.'
          }}
        </p>

        <!-- 색 -->
        <div>
          <div class="mb-1 flex justify-between font-ui text-xs">
            <span class="text-muted">{{ mode === 'fill' ? '배경색' : mode === 'drop' ? '물방울 색' : '브러시 색' }}</span>
            <span class="font-mono text-ink">{{ mode === 'fill' ? baseColor : brushColor }}</span>
          </div>
          <div class="mb-2 grid grid-cols-8 gap-1">
            <button
              v-for="color in PALETTE"
              :key="color"
              class="aspect-square rounded-sm border border-ink/20"
              :style="{ background: color }"
              :aria-label="color"
              @click="pickColor(color)"
            />
          </div>
          <input
            :value="mode === 'fill' ? baseColor : brushColor"
            type="color"
            class="h-8 w-full"
            @input="pickColor(($event.target as HTMLInputElement).value)"
          >
        </div>

        <!-- 브러시 크기 -->
        <label
          v-if="mode === 'brush' || mode === 'drop' || mode === 'smudge'"
          class="block"
        >
          <span class="flex justify-between font-ui text-xs">
            <span class="text-muted">{{ mode === 'brush' ? '굵기' : '크기' }}</span>
            <span class="font-mono text-ink">{{ (brushRadius * 1000).toFixed(0) }}</span>
          </span>
          <input
            v-model.number="brushRadius"
            type="range"
            class="w-full"
            :min="BRUSH_RADIUS.min"
            :max="BRUSH_RADIUS.max"
            :step="BRUSH_RADIUS.step"
          >
        </label>

        <button
          class="rounded-sm border border-ink/20 px-2 py-2 font-ui text-xs text-ink"
          @click="mix()"
        >
          섞기 · 볼을 무작위로 돌린다
        </button>

        <p class="font-ui text-[10px] text-muted">
          되돌리기는 브러시 선에만 적용된다. 유체는 배경색을 다시 칠해 초기화한다.
        </p>
        <div class="flex gap-1">
          <button
            class="flex-1 rounded-sm border border-ink/20 px-2 py-1.5 font-ui text-xs text-ink disabled:opacity-40"
            :disabled="!canUndo"
            @click="undo()"
          >
            되돌리기
          </button>
          <button
            class="flex-1 rounded-sm border border-ink/20 px-2 py-1.5 font-ui text-xs text-ink"
            @click="clearBrush()"
          >
            선 지우기
          </button>
        </div>

        <p
          v-if="failed"
          class="font-ui text-xs text-rust"
        >
          저장하지 못했다. 저장 공간을 확인해 줘.
        </p>

        <div class="mt-auto flex gap-2">
          <button
            class="flex-1 rounded-sm border border-ink/20 px-3 py-2 font-ui text-sm text-muted"
            @click="cancel()"
          >
            취소
          </button>
          <button
            class="flex-1 rounded-sm border border-sage/40 bg-sage/10 px-3 py-2 font-ui text-sm font-semibold text-sage disabled:opacity-40"
            :disabled="saving"
            @click="save()"
          >
            {{ saving ? '저장 중…' : '저장하기' }}
          </button>
        </div>
      </aside>
    </div>
  </Transition>
</template>

<style scoped>
.paint-enter-active,
.paint-leave-active {
  transition: opacity 0.45s ease, transform 0.45s cubic-bezier(0.22, 0.68, 0.22, 1);
}
.paint-enter-from,
.paint-leave-to {
  opacity: 0;
  transform: scale(0.94);
}
</style>
