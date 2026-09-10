<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { ref } from 'vue'
import { useSimulatorStore } from '@/stores/simulator'
import type { CameraPreset } from '@/scene/BowlingScene'

const store = useSimulatorStore()
const { patternId, patternOptions, cameraPreset } = storeToRefs(store)

const copied = ref(false)

/**
 * 지금 상태를 담은 링크를 클립보드에 넣는다.
 */
async function copyShareLink(): Promise<void> {
  const url = store.shareUrl()
  try {
    await navigator.clipboard.writeText(url)
    copied.value = true
    window.setTimeout(() => {
      copied.value = false
    }, 1600)
  } catch {
    // 클립보드가 막힌 브라우저에서는 주소창으로만 바꿔 준다.
    window.history.replaceState(null, '', url)
  }
}

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
          v-for="item in patternOptions"
          :key="item.id"
          :value="item.id"
        >
          {{ item.name }}
        </option>
      </select>
    </label>
    <button
      class="rounded-sm border border-ink/20 px-3 py-1 font-ui text-xs text-ink"
      @click="copyShareLink()"
    >
      {{ copied ? '복사됨' : '링크 복사' }}
    </button>
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
