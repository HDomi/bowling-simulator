<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useBallsStore } from '@/stores/balls'
import { useSimulatorStore } from '@/stores/simulator'

const store = useSimulatorStore()
const ballsStore = useBallsStore()
const { canRelease, frameActive, frameDone, ballNumber, pinsetterRunning, isRolling } =
  storeToRefs(store)
const { activeBall, sheetOpen } = storeToRefs(ballsStore)
</script>

<template>
  <header class="flex flex-wrap items-center justify-between gap-3 border-b border-ink/15 px-4 py-3">
    <div class="flex items-end gap-3">
      <h1 tabindex="-1" class="font-logo text-xl tracking-tight text-ink">
        BOWLING
      </h1>
      <span class="mb-1 font-ui text-xs text-muted">SIMULATOR</span>
    </div>
    <div class="flex items-center gap-2">
      <button
        class="max-w-[9rem] truncate rounded-sm border border-ink/20 px-3 py-2 font-ui text-xs lg:hidden"
        :class="sheetOpen ? 'bg-sage/20 text-sage' : 'text-ink'"
        @click="ballsStore.toggleSheet()"
      >
        {{ activeBall.name }}
      </button>
      <span
        v-if="frameActive"
        class="font-mono text-xs text-muted"
      >{{ pinsetterRunning ? '핀 정리 중' : frameDone ? '프레임 종료' : `${ballNumber}구` }}</span>
      <button
        class="rounded-sm border border-ink/20 px-4 py-2 font-ui text-sm font-semibold text-ink disabled:opacity-40"
        :disabled="isRolling || pinsetterRunning"
        @click="store.startFrame()"
      >
        프레임 시작
      </button>
      <button
        class="rounded-sm border border-sage/40 bg-sage/10 px-4 py-2 font-ui text-sm font-semibold text-sage disabled:opacity-40"
        :disabled="!canRelease"
        @click="store.releaseBall()"
      >
        릴리즈 ↗
      </button>
    </div>
  </header>
</template>
