<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { handLabel } from '@/domain/hand'
import { formatSpeed } from '@/domain/units'
import { useSimulatorStore } from '@/stores/simulator'

const store = useSimulatorStore()
const { result, preview, ball, pattern, hand, speedUnit } = storeToRefs(store)
</script>

<template>
  <section class="space-y-3 p-4">
    <h2 class="font-ui text-xs tracking-[0.2em] text-muted uppercase">결과</h2>
    <p class="font-ui text-sm text-ink">
      {{ ball.name }} · {{ pattern.name }} · {{ handLabel(hand) }}
    </p>
    <div
      v-if="preview"
      class="space-y-2 font-mono text-sm"
    >
      <p>
        BP
        <span class="text-sage">{{
          preview.breakpointFt < 8 ? '—' : `${preview.breakpointFt.toFixed(1)} ft`
        }}</span>
      </p>
      <p>진입각 <span class="text-sage">{{ preview.entryAngleDeg.toFixed(1) }}°</span></p>
      <p>진입 보드 <span class="text-sage">{{ preview.entryBoard.toFixed(1) }}</span></p>
      <p>
        핀속도
        <span class="text-sage">{{ formatSpeed(preview.speedAtPinsMph, speedUnit) }}</span>
      </p>
      <p class="text-muted">
        스키드 {{ preview.phases.skidEnd.toFixed(0) }}ft
        → 훅 {{ preview.phases.hookEnd.toFixed(0) }}ft
      </p>
      <p
        v-if="preview.gutter"
        class="text-rust"
      >
        GUTTER
      </p>
      <p
        v-else-if="result?.isStrike"
        class="text-ochre"
      >
        ★ STRIKE
      </p>
      <p v-else-if="result?.pinsDown.length">
        핀 {{ result.pinsDown.join(', ') }}
      </p>
      <p
        v-else
        class="text-muted"
      >
        예상 라인 · Space로 굴리기
      </p>
    </div>
  </section>
</template>
