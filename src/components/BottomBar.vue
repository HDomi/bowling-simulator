<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useSimulatorStore } from '@/stores/simulator'
import type { CameraPreset } from '@/scene/BowlingScene'

const store = useSimulatorStore()
const { patternId, presets, cameraPreset } = storeToRefs(store)

const cameras: { id: CameraPreset; label: string }[] = [
  { id: 1, label: '1 추적' },
  { id: 2, label: '2 볼 시점' },
  { id: 3, label: '3 핀덱' },
  { id: 4, label: '4 볼러' },
]
</script>

<template>
  <section class="flex flex-wrap items-center gap-3 border-t border-ink/15 px-4 py-3">
    <label class="flex items-center gap-2 font-ui text-sm">
      <span class="text-muted">패턴</span>
      <select
        v-model="patternId"
        class="rounded-sm border border-ink/20 bg-paper px-2 py-1 text-ink"
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
        :class="cameraPreset === cam.id ? 'bg-sage/20 text-sage' : 'text-muted'"
        @click="store.setCamera(cam.id)"
      >
        {{ cam.label }}
      </button>
    </div>
  </section>
</template>
