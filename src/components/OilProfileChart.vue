<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { FT, LANE_LENGTH_FT } from '@/domain/constants'
import { useSimulatorStore } from '@/stores/simulator'

const store = useSimulatorStore()
const { preview, pattern } = storeToRefs(store)

const WIDTH = 220
const HEIGHT = 56

/**
 * 궤적이 지나며 겪은 오일량을 거리축 폴리라인으로 만든다.
 * 패턴 단면(보드축)과 달리 이건 "내 라인이 실제로 밟은 오일"이다.
 */
const linePath = computed(() => {
  const path = preview.value?.path
  if (!path || path.length < 2) {
    return ''
  }
  return path
    .map((sample) => {
      const x = Math.min(1, sample.y / FT / LANE_LENGTH_FT) * WIDTH
      const y = HEIGHT - Math.min(1, sample.oil) * HEIGHT
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
})

/** 스키드·훅·백엔드 경계의 x 위치. */
const marks = computed(() => {
  const phases = preview.value?.phases
  if (!phases) {
    return []
  }
  return [
    { label: '스키드', ft: phases.skidEnd },
    { label: '훅', ft: phases.hookEnd },
  ].map((mark) => ({
    ...mark,
    x: Math.min(1, mark.ft / LANE_LENGTH_FT) * WIDTH,
  }))
})

/** 패턴이 끝나는 지점. 여기부터 마른 구간이다. */
const patternEndX = computed(
  () => Math.min(1, pattern.value.distanceFt / LANE_LENGTH_FT) * WIDTH,
)

/** 궤적이 겪은 평균 오일. */
const averageOil = computed(() => {
  const path = preview.value?.path
  if (!path || path.length === 0) {
    return 0
  }
  return path.reduce((sum, sample) => sum + sample.oil, 0) / path.length
})
</script>

<template>
  <section class="space-y-2 border-t border-ink/15 p-4">
    <h2 class="font-ui text-xs tracking-[0.2em] text-muted uppercase">내 라인의 오일</h2>

    <svg
      :viewBox="`0 0 ${WIDTH} ${HEIGHT}`"
      class="w-full"
      role="img"
      aria-label="궤적이 지나는 구간의 오일량"
    >
      <!-- 패턴이 깔린 구간 -->
      <rect
        x="0"
        y="0"
        :width="patternEndX"
        :height="HEIGHT"
        class="fill-sage/10"
      />
      <!-- 구간 경계 -->
      <line
        v-for="mark in marks"
        :key="mark.label"
        :x1="mark.x"
        :x2="mark.x"
        y1="0"
        :y2="HEIGHT"
        class="stroke-ink/25"
        stroke-width="1"
        stroke-dasharray="2 2"
      />
      <!-- 내 라인이 밟은 오일 -->
      <polyline
        v-if="linePath"
        :points="linePath"
        fill="none"
        class="stroke-ochre"
        stroke-width="1.8"
        stroke-linejoin="round"
      />
    </svg>

    <div class="flex justify-between font-mono text-[10px] text-muted">
      <span>0</span>
      <span
        v-for="mark in marks"
        :key="mark.label"
      >{{ mark.label }} {{ mark.ft.toFixed(0) }}ft</span>
      <span>60ft</span>
    </div>

    <p class="font-mono text-xs text-muted">
      평균 <span class="text-ink">{{ (averageOil * 100).toFixed(0) }}</span>
      · 패턴 끝 <span class="text-ink">{{ pattern.distanceFt.toFixed(0) }}ft</span>
    </p>
  </section>
</template>
