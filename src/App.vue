<script setup lang="ts">
import BottomBar from '@/components/BottomBar.vue'
import ReleasePanel from '@/components/ReleasePanel.vue'
import ResultPanel from '@/components/ResultPanel.vue'
import SceneCanvas from '@/components/SceneCanvas.vue'
import TopBar from '@/components/TopBar.vue'
import { coverLabel } from '@/domain/physics/friction'
import { useSimulatorStore } from '@/stores/simulator'
import { storeToRefs } from 'pinia'
import { onMounted, onUnmounted } from 'vue'
import type { CameraPreset } from '@/scene/BowlingScene'

const store = useSimulatorStore()
const { ball } = storeToRefs(store)

/**
 * 키보드 단축키를 처리한다.
 * @param {KeyboardEvent} event - 키 이벤트
 */
function handleKey(event: KeyboardEvent): void {
  if (event.code === 'Space') {
    event.preventDefault()
    store.roll()
    return
  }
  const preset = Number(event.key) as CameraPreset
  if (preset >= 1 && preset <= 4) {
    store.setCamera(preset)
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKey)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKey)
})
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-void text-cream">
    <TopBar />
    <div class="flex min-h-0 flex-1 flex-col lg:flex-row">
      <aside class="hidden w-56 shrink-0 border-r border-white/10 p-4 lg:block">
        <h2 class="font-ui text-xs tracking-[0.2em] text-dim uppercase">
          마이볼
        </h2>
        <p class="mt-3 font-ui text-lg">
          {{ ball.name }}
        </p>
        <p class="mt-2 font-mono text-sm text-dim">
          RG {{ ball.rg.toFixed(3) }}
        </p>
        <p class="font-mono text-sm text-dim">
          Dif {{ ball.diff.toFixed(3) }}
        </p>
        <p class="font-mono text-sm text-dim">
          {{ coverLabel(ball.cover) }} · {{ ball.grit }}방
        </p>
      </aside>
      <main class="relative min-h-[50vh] min-w-0 flex-1">
        <SceneCanvas />
        <p class="pointer-events-none absolute bottom-3 left-3 max-w-sm font-ui text-[11px] text-dim">
          USBC 실측 데이터 기반 근사 모델. 실전 예측용이 아님. 테스트 패턴: WB Montreal 41'.
        </p>
      </main>
      <aside class="w-full shrink-0 border-t border-white/10 lg:w-64 lg:border-t-0 lg:border-l">
        <ReleasePanel />
        <ResultPanel />
      </aside>
    </div>
    <BottomBar />
  </div>
</template>
