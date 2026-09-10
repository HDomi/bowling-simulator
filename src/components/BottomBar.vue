<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useSimulatorStore } from '@/stores/simulator'
import type { CameraPreset } from '@/scene/BowlingScene'

const store = useSimulatorStore()
const { patternId, presets, cameraPreset } = storeToRefs(store)

const cameras: { id: CameraPreset; label: string }[] = [
  { id: 1, label: '1 볼러' },
  { id: 2, label: '2 추적' },
  { id: 3, label: '3 핀덱' },
  { id: 4, label: '4 탑뷰' },
]
</script>

<template>
  <section class="flex flex-wrap items-center gap-3 border-t border-white/10 px-4 py-3">
    <label class="flex items-center gap-2 font-ui text-sm">
      <span class="text-dim">패턴</span>
      <select
        v-model="patternId"
        class="rounded-sm border border-white/15 bg-void px-2 py-1 text-cream"
      >
        <option
          v-for="item in presets"
          :key="item.id"
          :value="item.id"
        >
          {{ item.name }}
        </option>
      </select>
    </label>
    <div class="flex flex-wrap gap-1">
      <button
        v-for="cam in cameras"
        :key="cam.id"
        class="rounded-sm px-2 py-1 font-ui text-xs"
        :class="cameraPreset === cam.id ? 'bg-neon-cy/20 text-neon-cy' : 'text-dim'"
        @click="store.setCamera(cam.id)"
      >
        {{ cam.label }}
      </button>
    </div>
  </section>
</template>
