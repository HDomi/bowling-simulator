<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useSimulatorStore } from '@/stores/simulator'
import type { LineCandidate } from '@/domain/physics/search'

const store = useSimulatorStore()
const { searchResults, isSearching, releaseBoard, targetBoard } = storeToRefs(store)

/**
 * 지금 슬라이더에 들어간 라인인지 본다.
 * @param {LineCandidate} line - 라인 후보
 * @returns {boolean} 적용된 라인이면 true
 */
function isCurrent(line: LineCandidate): boolean {
  return line.releaseBoard === releaseBoard.value && line.targetBoard === targetBoard.value
}
</script>

<template>
  <section class="space-y-3 border-t border-ink/15 p-4">
    <div class="flex items-baseline justify-between">
      <h2 class="font-ui text-xs tracking-[0.2em] text-muted uppercase">라인 탐색</h2>
      <button
        v-if="searchResults.length"
        class="font-ui text-[11px] text-muted hover:text-ink"
        @click="store.clearSearch()"
      >
        지우기
      </button>
    </div>

    <button
      class="w-full rounded-sm border border-ink/20 px-3 py-2 font-ui text-sm text-ink disabled:opacity-40"
      :disabled="isSearching"
      @click="store.runSearch()"
    >
      {{ isSearching ? '계산 중…' : '포켓 라인 찾기' }}
    </button>

    <p class="font-ui text-[11px] leading-relaxed text-muted">
      릴리즈 × 타겟 1,521 조합을 모두 굴려 포켓에 드는 라인만 추린다. 추측이 아니라 계산 결과다.
    </p>

    <p
      v-if="!isSearching && searchResults.length === 0"
      class="font-mono text-xs text-muted"
    >
      아직 찾은 라인이 없다.
    </p>

    <ol
      v-else-if="searchResults.length"
      class="max-h-64 space-y-1 overflow-y-auto"
    >
      <li
        v-for="line in searchResults"
        :key="`${line.releaseBoard}-${line.targetBoard}`"
      >
        <button
          class="flex w-full items-baseline justify-between gap-2 rounded-sm px-2 py-1.5 text-left font-mono text-xs"
          :class="isCurrent(line) ? 'bg-sage/20 text-sage' : 'text-ink hover:bg-ink/5'"
          @click="store.applyLine(line)"
        >
          <span>{{ line.releaseBoard }} → {{ line.targetBoard }}</span>
          <span class="text-muted">
            {{ line.entryBoard.toFixed(1) }}보드 · {{ line.entryAngleDeg.toFixed(1) }}°
          </span>
          <span
            class="w-8 shrink-0 text-right"
            :class="line.score > 0.8 ? 'text-ochre' : 'text-muted'"
          >{{ (line.score * 100).toFixed(0) }}</span>
        </button>
      </li>
    </ol>
  </section>
</template>
