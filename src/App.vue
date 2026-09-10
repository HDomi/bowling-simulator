<script setup lang="ts">
import BallEditor from '@/components/BallEditor.vue'
import BallPanel from '@/components/BallPanel.vue'
import BottomBar from '@/components/BottomBar.vue'
import ReleasePanel from '@/components/ReleasePanel.vue'
import ResultPanel from '@/components/ResultPanel.vue'
import BallSetup from '@/components/BallSetup.vue'
import IntroSplash from '@/components/IntroSplash.vue'
import TopBar from '@/components/TopBar.vue'
import { useBallsStore } from '@/stores/balls'
import { useSimulatorStore } from '@/stores/simulator'
import { storeToRefs } from 'pinia'
import { defineAsyncComponent, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
const SceneCanvas = defineAsyncComponent(() => import('@/components/SceneCanvas.vue'))
import type { CameraPreset } from '@/scene/BowlingScene'

const introActive = ref(true)
const store = useSimulatorStore()
const ballsStore = useBallsStore()
const { sheetOpen, editingId, hasBalls } = storeToRefs(ballsStore)

/**
 * 폼 입력 중인지 본다. 이때는 단축키를 먹지 않는다.
 * @param {EventTarget | null} target - 이벤트 대상
 * @returns {boolean} 입력 요소면 true
 */
function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLButtonElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
}

/**
 * 키보드 단축키를 처리한다.
 * @param {KeyboardEvent} event - 키 이벤트
 */
function handleKey(event: KeyboardEvent): void {
  if (introActive.value || !hasBalls.value) return
  if (event.key === 'Escape') {
    if (editingId.value !== null) {
      ballsStore.closeEditor()
    } else if (sheetOpen.value) {
      ballsStore.toggleSheet(false)
    }
    return
  }
  // 편집 폼이 열려 있거나 입력 중이면 숫자키를 넘겨준다.
  if (editingId.value !== null || isTyping(event.target)) {
    return
  }
  const preset = Number(event.key) as CameraPreset
  if (preset >= 1 && preset <= 4) {
    store.setCamera(preset)
  }
}

function focusPage(): void {
  void nextTick(() => document.querySelector<HTMLElement>('main h1, header h1')?.focus({ preventScroll: true }))
}
function finishIntro(): void {
  introActive.value = false
  focusPage()
}
watch(hasBalls, () => {
  store.isRolling = false
  store.result = null
  ballsStore.toggleSheet(false)
  ballsStore.closeEditor()
})

onMounted(() => {
  window.addEventListener('keydown', handleKey)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKey)
})
</script>

<template>
  <div class="app-root">
  <IntroSplash @done="finishIntro" />
  <div class="app-content" :inert="introActive">
  <Transition name="page" mode="out-in" @after-enter="focusPage">
  <BallSetup v-if="!hasBalls" key="setup" />
  <div v-else key="lane" class="simulator-workspace flex h-full min-h-0 flex-col bg-paper text-ink">
    <TopBar />
    <div class="workspace-body flex min-h-0 flex-1 flex-col lg:flex-row">
      <aside class="ball-sidebar hidden w-64 shrink-0 overflow-y-auto border-r border-ink/15 p-4 lg:block">
        <BallPanel />
      </aside>
      <main class="lane-stage relative min-h-[50vh] min-w-0 flex-1">
        <div class="lane-caption"><span class="eyebrow">02 / THE MOTION STUDIO</span><span>LANE 01</span></div>
        <SceneCanvas />
        <div class="lane-legend"><span><i class="legend-skid" />스키드</span><span><i class="legend-hook" />훅</span><span><i class="legend-roll" />롤</span></div>
        <!-- 모바일: 마이볼 시트. 3D 위에 겹쳐 뜬다. -->
        <div
          v-if="sheetOpen"
          class="absolute inset-0 z-20 overflow-y-auto bg-paper/95 p-4 lg:hidden"
        >
          <div class="mb-3 flex justify-end">
            <button
              class="font-ui text-xs text-muted hover:text-ink"
              @click="ballsStore.toggleSheet(false)"
            >
              닫기 · Esc
            </button>
          </div>
          <BallPanel />
        </div>
        <p class="pointer-events-none absolute bottom-3 left-3 max-w-sm font-ui text-[11px] text-muted">
          USBC 실측 데이터 기반 근사 모델. 실전 예측용이 아님. 테스트 패턴: WB Montreal 41'.
        </p>
      </main>
      <aside class="release-sidebar w-full min-w-0 shrink-0 overflow-x-hidden border-t border-ink/15 lg:w-64 lg:border-t-0 lg:border-l">
        <ReleasePanel />
        <ResultPanel />
      </aside>
    </div>
    <BottomBar />
    <BallEditor />
  </div>
  </Transition>
  </div>
  </div>
</template>
