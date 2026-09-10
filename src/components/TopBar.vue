<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useSimulatorStore } from '@/stores/simulator'

const store = useSimulatorStore()
const { isRolling } = storeToRefs(store)
</script>

<template>
  <header class="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
    <div class="flex items-end gap-3">
      <h1 class="font-logo text-2xl tracking-wide text-neon-cy drop-shadow-[0_0_12px_#1fe0ff]">
        BOWLING
      </h1>
      <span class="mb-1 font-ui text-xs text-dim">SIMULATOR</span>
    </div>
    <div class="flex items-center gap-2">
      <button
        class="rounded-sm border border-neon-cy/40 bg-neon-cy/10 px-4 py-2 font-ui text-sm font-semibold text-neon-cy disabled:opacity-40"
        :disabled="isRolling"
        @click="store.roll()"
      >
        굴리기 · Space
      </button>
    </div>
  </header>
</template>
