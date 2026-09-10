<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import BallViewerCanvas from '@/components/BallViewerCanvas.vue'
import {
  BALL_LIMITS,
  coverOptionLabel,
  gritLabel,
  SPEC_REFERENCE_WEIGHT_LB,
  usbcWarnings,
} from '@/domain/ball'
import { EXAGGERATION, rgAxes, rgSpreadPercent } from '@/domain/ballGeometry'
import { MAX_BALLS } from '@/domain/ballRepository'
import { useBallsStore } from '@/stores/balls'

const ballsStore = useBallsStore()
const { balls, activeId, activeBall, simBall, compareBall, exaggeration, canAddBall } =
  storeToRefs(ballsStore)

const selectedId = computed({
  get: () => activeId.value,
  set: (id: string) => ballsStore.selectBall(id),
})

const warnings = computed(() => usbcWarnings(activeBall.value))
const spread = computed(() => rgSpreadPercent(rgAxes(simBall.value)))
const specDiffers = computed(() => activeBall.value.weightLb !== SPEC_REFERENCE_WEIGHT_LB)
const asymmetric = computed(() => (simBall.value.intDiff ?? 0) > 0)

/**
 * 무게 슬라이더 값을 반영한다.
 * @param {Event} event - input 이벤트
 */
function handleWeight(event: Event): void {
  const target = event.target
  if (target instanceof HTMLInputElement) {
    ballsStore.setActiveWeight(Number(target.value))
  }
}

/**
 * 과장 배율 슬라이더 값을 반영한다.
 * @param {Event} event - input 이벤트
 */
function handleExaggeration(event: Event): void {
  const target = event.target
  if (target instanceof HTMLInputElement) {
    ballsStore.setExaggeration(Number(target.value))
  }
}

/**
 * 활성 볼을 지운다. 확인을 한 번 받는다.
 */
function handleRemove(): void {
  if (window.confirm(`"${activeBall.value.name}" 볼을 지울까?`)) {
    ballsStore.removeBall(activeBall.value.id)
  }
}
</script>

<template>
  <section class="space-y-3">
    <div class="flex items-center justify-between">
      <h2 class="font-ui text-xs tracking-[0.2em] text-muted uppercase">마이볼</h2>
      <button
        class="rounded-sm border border-sage/40 px-2 py-0.5 font-ui text-[11px] text-sage disabled:opacity-40"
        :disabled="!canAddBall"
        :title="canAddBall ? '' : `볼은 최대 ${MAX_BALLS}개까지`"
        @click="ballsStore.openEditor('new')"
      >
        + 새 볼
      </button>
    </div>

    <select
      v-model="selectedId"
      class="w-full rounded-sm border border-ink/20 bg-paper px-2 py-1 font-ui text-sm text-ink"
    >
      <option
        v-for="item in balls"
        :key="item.id"
        :value="item.id"
      >
        {{ item.name }}
      </option>
    </select>

    <BallViewerCanvas />

    <ul class="flex flex-wrap gap-x-3 gap-y-1 font-ui text-[10px] text-muted">
      <li><span class="text-sage">●</span> 핀 · 핀 축</li>
      <li><span class="text-ochre">●</span> CG · 중간 축</li>
      <li v-if="asymmetric"><span class="text-rust">●</span> MB · PSA 축</li>
      <li v-if="activeBall.layout"><span class="text-ink">●</span> PAP</li>
    </ul>

    <div class="space-y-1 font-mono text-sm">
      <p class="flex justify-between">
        <span class="text-muted">RG</span>
        <span>
          {{ simBall.rg.toFixed(3) }}
          <span
            v-if="specDiffers"
            class="text-muted"
          >({{ activeBall.rg.toFixed(3) }})</span>
        </span>
      </p>
      <p class="flex justify-between">
        <span class="text-muted">Diff</span>
        <span>
          {{ simBall.diff.toFixed(3) }}
          <span
            v-if="specDiffers"
            class="text-muted"
          >({{ activeBall.diff.toFixed(3) }})</span>
        </span>
      </p>
      <p
        v-if="asymmetric"
        class="flex justify-between"
      >
        <span class="text-muted">Int. Diff</span>
        <span>{{ (simBall.intDiff ?? 0).toFixed(3) }}</span>
      </p>
      <p class="flex justify-between">
        <span class="text-muted">커버</span>
        <span class="font-ui">{{ coverOptionLabel(activeBall.cover) }}</span>
      </p>
      <p class="flex justify-between">
        <span class="text-muted">표면</span>
        <span class="font-ui">{{ gritLabel(activeBall.grit) }}</span>
      </p>
      <p
        v-if="activeBall.pinToCg !== undefined"
        class="flex justify-between"
      >
        <span class="text-muted">핀-CG</span>
        <span>{{ activeBall.pinToCg.toFixed(2) }} in</span>
      </p>
    </div>
    <p
      v-if="specDiffers"
      class="font-ui text-[10px] leading-relaxed text-muted"
    >
      괄호는 {{ SPEC_REFERENCE_WEIGHT_LB }} lb 기준 카탈로그 스펙. 무게를 바꾸면 코어가 줄어 RG가 오르고 Diff가 준다.
    </p>

    <label class="block space-y-1">
      <div class="flex justify-between font-ui text-sm">
        <span>무게</span>
        <span class="font-mono text-sage">{{ activeBall.weightLb }} lb</span>
      </div>
      <input
        class="w-full"
        type="range"
        :min="BALL_LIMITS.weightLb.min"
        :max="BALL_LIMITS.weightLb.max"
        :step="BALL_LIMITS.weightLb.step"
        :value="activeBall.weightLb"
        @input="handleWeight"
      >
    </label>

    <label class="block space-y-1">
      <div class="flex justify-between font-ui text-sm">
        <span>타원체 과장</span>
        <span class="font-mono text-sage">×{{ exaggeration }}</span>
      </div>
      <input
        class="w-full"
        type="range"
        :min="EXAGGERATION.min"
        :max="EXAGGERATION.max"
        :step="EXAGGERATION.step"
        :value="exaggeration"
        @input="handleExaggeration"
      >
      <p class="font-ui text-[10px] leading-relaxed text-muted">
        실제 RG 차이는 {{ spread.toFixed(1) }}%. ×1이 실제 비율.
      </p>
    </label>

    <ul
      v-if="warnings.length"
      class="space-y-1 font-ui text-[11px] leading-relaxed text-rust"
    >
      <li
        v-for="warning in warnings"
        :key="warning"
      >
        ⚠ {{ warning }}
      </li>
    </ul>

    <div
      v-if="compareBall"
      class="flex items-center justify-between rounded-sm border border-ink/15 px-2 py-1.5 font-ui text-[11px]"
    >
      <span class="text-muted">비교 중 · <span class="text-ink">{{ compareBall.name }}</span></span>
      <button
        class="text-muted hover:text-ink"
        @click="ballsStore.clearCompare()"
      >
        해제
      </button>
    </div>
    <p
      v-else
      class="font-ui text-[10px] leading-relaxed text-muted"
    >
      볼을 바꾸면 직전 볼의 궤적이 점선으로 남아 비교된다.
    </p>

    <div class="flex gap-1">
      <button
        class="flex-1 rounded-sm border border-ink/20 px-2 py-1 font-ui text-xs text-ink"
        @click="ballsStore.openEditor(activeBall.id)"
      >
        편집
      </button>
      <button
        class="flex-1 rounded-sm border border-ink/20 px-2 py-1 font-ui text-xs text-ink"
        @click="ballsStore.duplicateBall(activeBall.id)"
      >
        복제
      </button>
      <button
        class="flex-1 rounded-sm border border-ink/20 px-2 py-1 font-ui text-xs text-muted hover:text-rust"
        @click="handleRemove"
      >
        삭제
      </button>
    </div>

    <button
      class="w-full rounded-sm border border-sage/40 bg-sage/10 px-2 py-1.5 font-ui text-xs text-sage"
      @click="ballsStore.openPaint(activeBall.id)"
    >
      색상 편집 ↗
    </button>
  </section>
</template>
