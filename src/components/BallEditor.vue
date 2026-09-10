<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, reactive, watch } from 'vue'
import {
  BALL_LIMITS,
  COVER_OPTIONS,
  GRIT_OPTIONS,
  gritLabel,
  NEW_BALL_TEMPLATE,
  PIN_TO_CG_PRESETS,
  SPEC_REFERENCE_WEIGHT_LB,
  usbcWarnings,
  validateBall,
} from '@/domain/ball'
import type { Ball, CoverType, Grit } from '@/domain/types'
import { useBallsStore } from '@/stores/balls'

const ballsStore = useBallsStore()
const { editingId, editingBall } = storeToRefs(ballsStore)

type Draft = {
  name: string
  weightLb: number
  rg: number
  diff: number
  asymmetric: boolean
  intDiff: number
  cover: CoverType
  grit: Grit
  pinToCg: number
  hasLayout: boolean
  drillAngle: number
  pinToPap: number
  valAngle: number
  colorA: string
  colorB: string
}

const draft = reactive<Draft>(fromBall(null))

/**
 * 볼(또는 템플릿)로 폼 초안을 만든다.
 * @param {Ball | null} ball - 편집할 볼. null이면 새 볼
 * @returns {Draft} 폼 초안
 */
function fromBall(ball: Ball | null): Draft {
  const source = ball ?? { ...NEW_BALL_TEMPLATE, id: '' }
  return {
    name: source.name,
    weightLb: source.weightLb,
    rg: source.rg,
    diff: source.diff,
    asymmetric: source.intDiff !== undefined && source.intDiff > 0,
    intDiff: source.intDiff ?? 0.015,
    cover: source.cover,
    grit: source.grit,
    pinToCg: source.pinToCg ?? 2.5,
    hasLayout: source.layout !== undefined,
    drillAngle: source.layout?.drillAngle ?? 45,
    pinToPap: source.layout?.pinToPap ?? 4.5,
    valAngle: source.layout?.valAngle ?? 35,
    colorA: source.colors[0],
    colorB: source.colors[1],
  }
}

/**
 * 폼 초안을 저장용 볼(id 제외)로 만든다.
 * @returns {Omit<Ball, 'id'>} 볼 내용
 */
function toBall(): Omit<Ball, 'id'> {
  return {
    name: draft.name.trim(),
    weightLb: draft.weightLb,
    rg: draft.rg,
    diff: draft.diff,
    intDiff: draft.asymmetric ? draft.intDiff : undefined,
    cover: draft.cover,
    grit: draft.grit,
    pinToCg: draft.pinToCg,
    layout: draft.hasLayout
      ? { drillAngle: draft.drillAngle, pinToPap: draft.pinToPap, valAngle: draft.valAngle }
      : undefined,
    colors: [draft.colorA, draft.colorB],
  }
}

watch(editingId, (id) => {
  if (id === null) {
    return
  }
  Object.assign(draft, fromBall(editingBall.value))
})

const isOpen = computed(() => editingId.value !== null)
const isNew = computed(() => editingId.value === 'new')
const errors = computed(() => validateBall(toBall()))
const warnings = computed(() =>
  usbcWarnings({
    rg: draft.rg,
    diff: draft.diff,
    intDiff: draft.asymmetric ? draft.intDiff : undefined,
    weightLb: draft.weightLb,
  }),
)

/**
 * 폼을 저장한다. 오류가 있으면 아무것도 하지 않는다.
 */
function save(): void {
  if (errors.value.length > 0) {
    return
  }
  const content = toBall()
  if (isNew.value) {
    if (!ballsStore.addBall(content)) {
      return
    }
  } else if (editingBall.value) {
    ballsStore.updateBall({ ...content, id: editingBall.value.id })
  }
  ballsStore.closeEditor()
}

/**
 * 배경 클릭으로 닫는다. 폼 안 클릭은 무시한다.
 * @param {MouseEvent} event - 클릭 이벤트
 */
function handleBackdrop(event: MouseEvent): void {
  if (event.target === event.currentTarget) {
    ballsStore.closeEditor()
  }
}
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4"
    @click="handleBackdrop"
    @keydown.esc="ballsStore.closeEditor()"
  >
    <form
      class="max-h-full w-full max-w-lg space-y-4 overflow-y-auto rounded-sm border border-ink/20 bg-paper p-5 text-ink shadow-xl"
      @submit.prevent="save"
    >
      <div class="flex items-center justify-between">
        <h2 class="font-ui text-xs tracking-[0.2em] text-muted uppercase">
          {{ isNew ? '새 볼' : '볼 편집' }}
        </h2>
        <button
          type="button"
          class="font-ui text-xs text-muted hover:text-ink"
          @click="ballsStore.closeEditor()"
        >
          닫기 · Esc
        </button>
      </div>

      <label class="block space-y-1">
        <span class="font-ui text-sm">이름</span>
        <input
          v-model="draft.name"
          class="w-full rounded-sm border border-ink/20 bg-paper-dark px-2 py-1 font-ui text-sm"
          type="text"
          :maxlength="BALL_LIMITS.nameLength"
          autofocus
        >
      </label>

      <div class="grid grid-cols-2 gap-3">
        <label class="block space-y-1">
          <span class="font-ui text-sm">무게 <span class="text-muted">lb</span></span>
          <input
            v-model.number="draft.weightLb"
            class="w-full rounded-sm border border-ink/20 bg-paper-dark px-2 py-1 font-mono text-sm"
            type="number"
            :min="BALL_LIMITS.weightLb.min"
            :max="BALL_LIMITS.weightLb.max"
            :step="BALL_LIMITS.weightLb.step"
          >
        </label>
        <label class="block space-y-1">
          <span class="font-ui text-sm">핀-CG <span class="text-muted">in</span></span>
          <input
            v-model.number="draft.pinToCg"
            class="w-full rounded-sm border border-ink/20 bg-paper-dark px-2 py-1 font-mono text-sm"
            type="number"
            :min="BALL_LIMITS.pinToCg.min"
            :max="BALL_LIMITS.pinToCg.max"
            :step="BALL_LIMITS.pinToCg.step"
          >
        </label>
      </div>
      <div class="flex flex-wrap gap-1">
        <button
          v-for="preset in PIN_TO_CG_PRESETS"
          :key="preset"
          type="button"
          class="rounded-sm px-2 py-0.5 font-mono text-[11px]"
          :class="draft.pinToCg === preset ? 'bg-sage/20 text-sage' : 'text-muted'"
          @click="draft.pinToCg = preset"
        >
          {{ preset }}"
        </button>
      </div>

      <p class="font-ui text-[11px] leading-relaxed text-muted">
        RG·Diff는 카탈로그의 {{ SPEC_REFERENCE_WEIGHT_LB }} lb 기준값을 넣어. 다른 무게는 무게 슬라이더가 환산한다.
      </p>
      <div class="grid grid-cols-2 gap-3">
        <label class="block space-y-1">
          <span class="font-ui text-sm">RG</span>
          <input
            v-model.number="draft.rg"
            class="w-full rounded-sm border border-ink/20 bg-paper-dark px-2 py-1 font-mono text-sm"
            type="number"
            :min="BALL_LIMITS.rg.min"
            :max="BALL_LIMITS.rg.max"
            :step="BALL_LIMITS.rg.step"
          >
        </label>
        <label class="block space-y-1">
          <span class="font-ui text-sm">Differential</span>
          <input
            v-model.number="draft.diff"
            class="w-full rounded-sm border border-ink/20 bg-paper-dark px-2 py-1 font-mono text-sm"
            type="number"
            :min="BALL_LIMITS.diff.min"
            :max="BALL_LIMITS.diff.max"
            :step="BALL_LIMITS.diff.step"
          >
        </label>
      </div>
      <label class="flex items-center gap-2 font-ui text-sm">
        <input
          v-model="draft.asymmetric"
          type="checkbox"
        >
        비대칭 코어
      </label>
      <label
        v-if="draft.asymmetric"
        class="block space-y-1"
      >
        <span class="font-ui text-sm">Int. Differential</span>
        <input
          v-model.number="draft.intDiff"
          class="w-full rounded-sm border border-ink/20 bg-paper-dark px-2 py-1 font-mono text-sm"
          type="number"
          :min="BALL_LIMITS.intDiff.min"
          :max="BALL_LIMITS.intDiff.max"
          :step="BALL_LIMITS.intDiff.step"
        >
      </label>

      <div class="grid grid-cols-2 gap-3">
        <label class="block space-y-1">
          <span class="font-ui text-sm">커버스톡</span>
          <select
            v-model="draft.cover"
            class="w-full rounded-sm border border-ink/20 bg-paper-dark px-2 py-1 font-ui text-sm"
          >
            <option
              v-for="option in COVER_OPTIONS"
              :key="option.id"
              :value="option.id"
            >
              {{ option.label }}
            </option>
          </select>
        </label>
        <label class="block space-y-1">
          <span class="font-ui text-sm">표면</span>
          <select
            v-model="draft.grit"
            class="w-full rounded-sm border border-ink/20 bg-paper-dark px-2 py-1 font-ui text-sm"
          >
            <option
              v-for="grit in GRIT_OPTIONS"
              :key="grit"
              :value="grit"
            >
              {{ gritLabel(grit) }}
            </option>
          </select>
        </label>
      </div>

      <label class="flex items-center gap-2 font-ui text-sm">
        <input
          v-model="draft.hasLayout"
          type="checkbox"
        >
        레이아웃 입력 (듀얼 앵글) · 그립 홀 표시
      </label>
      <div
        v-if="draft.hasLayout"
        class="grid grid-cols-3 gap-3"
      >
        <label class="block space-y-1">
          <span class="font-ui text-xs">드릴각 °</span>
          <input
            v-model.number="draft.drillAngle"
            class="w-full rounded-sm border border-ink/20 bg-paper-dark px-2 py-1 font-mono text-sm"
            type="number"
            :min="BALL_LIMITS.drillAngle.min"
            :max="BALL_LIMITS.drillAngle.max"
            :step="BALL_LIMITS.drillAngle.step"
          >
        </label>
        <label class="block space-y-1">
          <span class="font-ui text-xs">핀-PAP in</span>
          <input
            v-model.number="draft.pinToPap"
            class="w-full rounded-sm border border-ink/20 bg-paper-dark px-2 py-1 font-mono text-sm"
            type="number"
            :min="BALL_LIMITS.pinToPap.min"
            :max="BALL_LIMITS.pinToPap.max"
            :step="BALL_LIMITS.pinToPap.step"
          >
        </label>
        <label class="block space-y-1">
          <span class="font-ui text-xs">VAL각 °</span>
          <input
            v-model.number="draft.valAngle"
            class="w-full rounded-sm border border-ink/20 bg-paper-dark px-2 py-1 font-mono text-sm"
            type="number"
            :min="BALL_LIMITS.valAngle.min"
            :max="BALL_LIMITS.valAngle.max"
            :step="BALL_LIMITS.valAngle.step"
          >
        </label>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <label class="flex items-center justify-between font-ui text-sm">
          <span>주 색</span>
          <input
            v-model="draft.colorA"
            type="color"
            class="h-7 w-14 cursor-pointer rounded-sm border border-ink/20 bg-transparent"
          >
        </label>
        <label class="flex items-center justify-between font-ui text-sm">
          <span>보조 색</span>
          <input
            v-model="draft.colorB"
            type="color"
            class="h-7 w-14 cursor-pointer rounded-sm border border-ink/20 bg-transparent"
          >
        </label>
      </div>

      <ul
        v-if="warnings.length"
        class="space-y-1 font-ui text-[11px] leading-relaxed text-rust"
      >
        <li
          v-for="warning in warnings"
          :key="warning"
        >
          ⚠ {{ warning }} · 굴려볼 수는 있어
        </li>
      </ul>
      <ul
        v-if="errors.length"
        class="space-y-1 font-ui text-[11px] leading-relaxed text-ochre"
      >
        <li
          v-for="error in errors"
          :key="error"
        >
          {{ error }}
        </li>
      </ul>

      <div class="flex justify-end gap-2 pt-1">
        <button
          type="button"
          class="rounded-sm border border-ink/20 px-3 py-1.5 font-ui text-sm text-muted hover:text-ink"
          @click="ballsStore.closeEditor()"
        >
          취소
        </button>
        <button
          type="submit"
          class="rounded-sm border border-sage/40 bg-sage/10 px-4 py-1.5 font-ui text-sm font-semibold text-sage disabled:opacity-40"
          :disabled="errors.length > 0"
        >
          {{ isNew ? '추가' : '저장' }}
        </button>
      </div>
    </form>
  </div>
</template>
