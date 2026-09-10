<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { BALL_LIMITS, COVER_OPTIONS, GRIT_OPTIONS, gritLabel, NEW_BALL_TEMPLATE, usbcWarnings, validateBall } from '@/domain/ball'
import type { Ball } from '@/domain/types'
import { useBallsStore } from '@/stores/balls'
import GeometricSphere from './GeometricSphere.vue'
const balls = useBallsStore()
const paused = ref(false)
const title = ref<HTMLElement | null>(null)
const draft = reactive<Omit<Ball, 'id'>>({ ...NEW_BALL_TEMPLATE, name: '나의 첫 번째 볼', colors: [...NEW_BALL_TEMPLATE.colors] })
const errors = computed(() => validateBall(draft))
const warnings = computed(() => usbcWarnings(draft))
const palettes = [ ['#a74d37', '#343f39'], ['#526c63', '#e1cda4'], ['#333b50', '#aeb7b5'], ['#bf9145', '#6b4739'] ]
function save() {
  if (errors.value.length) return
  balls.addBall({ ...draft, name: draft.name.trim(), colors: [...draft.colors] })
}
onMounted(() => title.value?.focus({ preventScroll: true }))
</script>

<template>
  <main class="setup-page">
    <div class="draft-pattern" aria-hidden="true" />
    <header class="setup-header">
      <a href="#" class="wordmark" @click.prevent><span class="brand-symbol">◉</span> BOWLING<br><span class="wordmark-sub">SIMULATOR</span></a>
      <span class="eyebrow">01 / YOUR FIRST BALL</span>
    </header>
    <div class="setup-heading">
      <p class="eyebrow"><span class="status-dot" /> EVERY MOTION BEGINS WITH YOU</p>
      <h1 ref="title" tabindex="-1">A little spin.<br>A world of <em>motion.</em></h1>
      <p class="setup-description">하나의 구체에서 시작되는, 나만의 궤적.<br>첫 번째 볼을 만들고 레인 위의 움직임을 발견해 보세요.</p>
    </div>
    <div class="sphere-stage"><GeometricSphere :paused="paused" :stretch="1 + draft.diff" /></div>
    <div class="sphere-annotation"><span>FIG. 01 — THE BEGINNING</span><span>Ø 8.500 IN · {{ draft.weightLb }} LB</span></div>
    <div class="floating-config" :class="{ 'motion-paused': paused }">
      <svg class="config-connector" viewBox="0 0 340 130" preserveAspectRatio="none" aria-hidden="true">
        <circle cx="7" cy="122" r="4" fill="currentColor" /><path d="M7 122 H140 L237 20 H340" fill="none" stroke="currentColor" stroke-width="1" />
      </svg>
      <form class="setup-card" @submit.prevent="save">
        <div class="card-caption"><span>PARAMETER INPUT</span><span>01—01</span></div>
        <h2>나의 첫 번째 볼</h2>
        <p class="card-description">이름과 감각을 담아, 시작해 볼까요?</p>
        <label class="field-label">볼 이름<input v-model="draft.name" required :maxlength="BALL_LIMITS.nameLength" autocomplete="off" name="ball-name"></label>
        <div class="setup-weight"><label for="first-weight">무게</label><output for="first-weight">{{ draft.weightLb }} <small>lb</small></output></div>
        <input id="first-weight" v-model.number="draft.weightLb" type="range" min="10" max="16" step="1" class="setup-range">
        <div class="range-labels"><span>10 lb</span><span>16 lb</span></div>
        <div class="setup-field-grid">
          <label class="field-label">커버스톡<select v-model="draft.cover"><option v-for="option in COVER_OPTIONS" :key="option.id" :value="option.id">{{ option.label }}</option></select></label>
          <label class="field-label">표면<select v-model="draft.grit"><option v-for="grit in GRIT_OPTIONS" :key="grit" :value="grit">{{ gritLabel(grit) }}</option></select></label>
        </div>
        <div class="color-field"><span>볼 컬러</span><div class="palette-options"><button v-for="(pair, i) in palettes" :key="i" type="button" :aria-label="`컬러 조합 ${i + 1}`" :aria-pressed="draft.colors[0] === pair[0]" class="palette-swatch" :style="{ background: `linear-gradient(135deg, ${pair[0]} 50%, ${pair[1]} 50%)` }" @click="draft.colors = [pair[0], pair[1]]" /></div></div>
        <details class="setup-details">
          <summary>세부 스펙 설정 <span>+</span></summary>
          <p>RG·Diff는 15 lb 기준 카탈로그 값이에요. 지공과 레이아웃은 나중에 마이볼에서 편집할 수 있어요.</p>
          <div class="setup-field-grid">
            <label class="field-label">RG<input v-model.number="draft.rg" type="number" :min="BALL_LIMITS.rg.min" :max="BALL_LIMITS.rg.max" step="0.001" required></label>
            <label class="field-label">Differential<input v-model.number="draft.diff" type="number" :min="BALL_LIMITS.diff.min" :max="BALL_LIMITS.diff.max" step="0.001" required></label>
          </div>
        </details>
        <p v-for="warning in warnings" :key="warning" class="field-warning">{{ warning }}</p>
        <p v-for="error in errors" :key="error" class="field-warning" role="alert">{{ error }}</p>
        <button class="enter-lane" type="submit" :disabled="errors.length > 0">볼을 만들고 레인으로 <span aria-hidden="true">↗</span></button>
        <p class="card-footnote">설정은 나중에도 바꿀 수 있어요.</p>
      </form>
    </div>
    <footer class="setup-footer"><span>ⓒ 2026. H-Domi All rights reserved.</span><button :aria-pressed="paused" @click="paused = !paused">{{ paused ? '모션 재생' : '모션 일시정지' }} <span aria-hidden="true">{{ paused ? '▷' : 'Ⅱ' }}</span></button></footer>
  </main>
</template>
