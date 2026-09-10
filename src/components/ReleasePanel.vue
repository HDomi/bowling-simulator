<script setup lang="ts">
import { REV_RANGE_RPM, SPEED_RANGE_MPH } from '@/domain/constants'
import { boardToSlider, handLabel, sliderToBoard } from '@/domain/hand'
import { CUSTOM_STYLE_ID, getReleaseStyleById, RELEASE_STYLES } from '@/domain/styles'
import { formatSpeed, type SpeedUnit } from '@/domain/units'
import { useSimulatorStore } from '@/stores/simulator'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

const store = useSimulatorStore()
const {
  speedMph,
  revRate,
  axisRotation,
  axisTilt,
  speedUnit,
  releaseBoard,
  targetBoard,
  hand,
  styleId,
} = storeToRefs(store)

const styles = RELEASE_STYLES

const units: { id: SpeedUnit; label: string }[] = [
  { id: 'kmh', label: 'km/h' },
  { id: 'mph', label: 'mph' },
]

const styleNote = computed(() => getReleaseStyleById(styleId.value)?.note ?? '')

const selectedStyleId = computed({
  get: () => styleId.value,
  set: (id: string) => store.applyReleaseStyle(id),
})

/**
 * 릴리즈 보드 슬라이더 값을 USBC 보드 번호로 반영한다.
 * @param {Event} event - input 이벤트
 */
function handleReleaseSlider(event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) {
    return
  }
  releaseBoard.value = sliderToBoard(Number(target.value))
}

/**
 * 타겟 보드 슬라이더 값을 USBC 보드 번호로 반영한다.
 * @param {Event} event - input 이벤트
 */
function handleTargetSlider(event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) {
    return
  }
  targetBoard.value = sliderToBoard(Number(target.value))
}
</script>

<template>
  <section class="space-y-4 border-white/10 bg-black/30 p-4">
    <h2 class="font-ui text-xs tracking-[0.2em] text-dim uppercase">릴리즈</h2>
    <div class="flex gap-1">
      <button
        class="flex-1 rounded-sm px-2 py-1.5 font-ui text-xs"
        :class="hand === 'right' ? 'bg-neon-cy/20 text-neon-cy' : 'text-dim'"
        @click="store.setHand('right')"
      >
        오른손
      </button>
      <button
        class="flex-1 rounded-sm px-2 py-1.5 font-ui text-xs"
        :class="hand === 'left' ? 'bg-neon-cy/20 text-neon-cy' : 'text-dim'"
        @click="store.setHand('left')"
      >
        왼손
      </button>
    </div>
    <p class="font-ui text-[11px] leading-relaxed text-dim">
      {{ handLabel(hand) }}:
      {{
        hand === 'right'
          ? '레인 왼쪽에서 나와 오른쪽으로 보낸 뒤, 훅은 왼쪽으로(1-3 포켓)'
          : '레인 오른쪽에서 나와 왼쪽으로 보낸 뒤, 훅은 오른쪽으로(1-2 포켓)'
      }}
    </p>
    <label class="block space-y-1">
      <span class="font-ui text-sm">구질</span>
      <select
        v-model="selectedStyleId"
        class="w-full rounded-sm border border-white/15 bg-void px-2 py-1 font-ui text-sm text-cream"
      >
        <option
          v-if="styleId === CUSTOM_STYLE_ID"
          :value="CUSTOM_STYLE_ID"
        >
          직접 설정
        </option>
        <option
          v-for="style in styles"
          :key="style.id"
          :value="style.id"
        >
          {{ style.name }}
        </option>
      </select>
    </label>
    <p
      v-if="styleNote"
      class="font-ui text-[11px] leading-relaxed text-dim"
    >
      {{ styleNote }}
    </p>
    <p class="font-mono text-[11px] text-dim">
      축 회전 {{ axisRotation }}° · 축 기울기 {{ axisTilt }}°
    </p>
    <div class="flex items-center justify-between">
      <span class="font-ui text-sm">속도 단위</span>
      <div class="flex gap-1">
        <button
          v-for="unit in units"
          :key="unit.id"
          class="rounded-sm px-2 py-0.5 font-ui text-xs"
          :class="speedUnit === unit.id ? 'bg-neon-cy/20 text-neon-cy' : 'text-dim'"
          @click="store.setSpeedUnit(unit.id)"
        >
          {{ unit.label }}
        </button>
      </div>
    </div>
    <label class="block space-y-1">
      <div class="flex justify-between font-ui text-sm">
        <span>속도</span>
        <span class="font-mono text-neon-cy">{{ formatSpeed(speedMph, speedUnit) }}</span>
      </div>
      <input
        v-model.number="speedMph"
        class="w-full"
        type="range"
        :min="SPEED_RANGE_MPH.min"
        :max="SPEED_RANGE_MPH.max"
        :step="SPEED_RANGE_MPH.step"
      >
    </label>
    <label class="block space-y-1">
      <div class="flex justify-between font-ui text-sm">
        <span>훅</span>
        <span class="font-mono text-neon-cy">{{ revRate }} rpm</span>
      </div>
      <input
        v-model.number="revRate"
        class="w-full"
        type="range"
        :min="REV_RANGE_RPM.min"
        :max="REV_RANGE_RPM.max"
        :step="REV_RANGE_RPM.step"
      >
    </label>
    <label class="block space-y-1">
      <div class="flex justify-between font-ui text-sm">
        <span>릴리즈 보드</span>
        <span class="font-mono text-neon-cy">{{ releaseBoard }}</span>
      </div>
      <input
        class="w-full"
        type="range"
        min="1"
        max="39"
        step="1"
        :value="boardToSlider(releaseBoard)"
        @input="handleReleaseSlider"
      >
    </label>
    <label class="block space-y-1">
      <div class="flex justify-between font-ui text-sm">
        <span>타겟 보드</span>
        <span class="font-mono text-neon-cy">{{ targetBoard }}</span>
      </div>
      <input
        class="w-full"
        type="range"
        min="1"
        max="39"
        step="1"
        :value="boardToSlider(targetBoard)"
        @input="handleTargetSlider"
      >
    </label>
    <p class="font-ui text-[11px] leading-relaxed text-dim">
      슬라이더 왼쪽 = 레인 왼쪽(보드 39) · 오른쪽 = 레인 오른쪽(보드 1)
    </p>
    <p
      v-if="hand === 'right' && targetBoard >= releaseBoard"
      class="font-ui text-[11px] leading-relaxed text-amber"
    >
      타겟이 릴리즈보다 왼쪽입니다. 오른손은 더 오른쪽(낮은 보드)을 봐야 밖으로 나갔다가 훅합니다.
    </p>
    <p
      v-else-if="hand === 'left' && targetBoard <= releaseBoard"
      class="font-ui text-[11px] leading-relaxed text-amber"
    >
      타겟이 릴리즈보다 오른쪽입니다. 왼손은 더 왼쪽(높은 보드)을 봐야 밖으로 나갔다가 훅합니다.
    </p>
  </section>
</template>
