<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { PATTERN_LIMITS } from '@/domain/patterns/presets'
import { useSimulatorStore } from '@/stores/simulator'

const store = useSimulatorStore()
const {
  pattern,
  isCustomPattern,
  houseDistanceFt,
  houseVolume,
  houseRatio,
  oilProfile,
} = storeToRefs(store)

// storeToRefs는 ref·computed만 뽑는다. 평범한 객체 상수는 여기서 직접 쓴다.
const limits = PATTERN_LIMITS

/** 단면 막대그래프용 높이(%). */
const bars = computed(() => oilProfile.value.map((value) => Math.round(value * 100)))

/** 중앙(20보드) 대 5번 보드의 실제 비율. 슬라이더는 가장자리(1보드) 기준이라 값이 다르다. */
const actualRatio = computed(() => {
  const profile = oilProfile.value
  if (profile.length < 39) {
    return 0
  }
  const outside = (profile[4] + profile[34]) / 2
  return outside > 0.001 ? profile[19] / outside : 0
})
</script>

<template>
  <section class="space-y-3 border-t border-ink/15 p-4">
    <div class="flex items-baseline justify-between">
      <h2 class="font-ui text-xs tracking-[0.2em] text-muted uppercase">오일 패턴</h2>
      <button
        v-if="isCustomPattern"
        class="font-ui text-[11px] text-muted hover:text-ink"
        @click="store.resetHousePattern()"
      >
        기본값
      </button>
      <button
        v-else
        class="font-ui text-[11px] text-muted hover:text-ink"
        @click="store.forkPatternToCustom()"
      >
        직접 조절
      </button>
    </div>

    <!-- 보드별 오일 단면. 20ft 지점을 자른 것이다. -->
    <div>
      <div class="flex h-16 items-end gap-px">
        <i
          v-for="(height, index) in bars"
          :key="index"
          class="flex-1 bg-sage/60"
          :style="{ height: `${Math.max(2, height)}%` }"
        />
      </div>
      <div class="mt-1 flex justify-between font-mono text-[10px] text-muted">
        <span>39</span>
        <span>20ft 단면 · 중앙:5번 {{ actualRatio.toFixed(1) }}:1</span>
        <span>1</span>
      </div>
    </div>

    <p
      v-if="!isCustomPattern"
      class="font-mono text-xs text-muted"
    >
      {{ pattern.name }} · {{ pattern.distanceFt.toFixed(0) }}ft
    </p>

    <div
      v-else
      class="space-y-3"
    >
      <label class="block">
        <span class="flex justify-between font-ui text-xs">
          <span class="text-muted">거리</span>
          <span class="font-mono text-ink">{{ houseDistanceFt }} ft</span>
        </span>
        <input
          v-model.number="houseDistanceFt"
          type="range"
          class="w-full"
          :min="limits.distanceFt.min"
          :max="limits.distanceFt.max"
          :step="limits.distanceFt.step"
        >
      </label>

      <label class="block">
        <span class="flex justify-between font-ui text-xs">
          <span class="text-muted">총량</span>
          <span class="font-mono text-ink">{{ houseVolume.toFixed(2) }}</span>
        </span>
        <input
          v-model.number="houseVolume"
          type="range"
          class="w-full"
          :min="limits.volume.min"
          :max="limits.volume.max"
          :step="limits.volume.step"
        >
      </label>

      <label class="block">
        <span class="flex justify-between font-ui text-xs">
          <span class="text-muted">중앙:가장자리</span>
          <span class="font-mono text-ink">{{ houseRatio.toFixed(1) }} : 1</span>
        </span>
        <input
          v-model.number="houseRatio"
          type="range"
          class="w-full"
          :min="limits.ratio.min"
          :max="limits.ratio.max"
          :step="limits.ratio.step"
        >
        <span class="font-ui text-[10px] text-muted">
          높으면 하우스샷(가운데만 두꺼움), 낮으면 스포츠샷(평평함)
        </span>
      </label>
    </div>
  </section>
</template>
