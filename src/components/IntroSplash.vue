<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
const emit = defineEmits<{ done: [] }>()
const visible = ref(true)
let timer: ReturnType<typeof setTimeout>
function dismiss() { visible.value = false }
onMounted(() => {
  timer = setTimeout(dismiss, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 150 : 2300)
})
onUnmounted(() => clearTimeout(timer))
</script>

<template>
  <Transition name="intro" @after-leave="emit('done')">
    <div v-if="visible" class="intro-splash" role="status" aria-label="Bowling Simulator 시작">
      <div class="intro-emblem">
        <svg viewBox="0 0 800 440" role="img" aria-label="BOWLING SIMULATOR">
          <defs><path id="title-arc" d="M 72,315 A 355,355 0 0,1 728,315" /></defs>
          <circle cx="400" cy="287" r="77" class="emblem-orbit" />
          <ellipse cx="400" cy="287" rx="35" ry="77" class="emblem-orbit" />
          <path d="M323 287H477 M400 210V364" class="emblem-orbit" />
          <text class="intro-title"><textPath href="#title-arc" startOffset="50%" text-anchor="middle">BOWLING SIMULATOR</textPath></text>
          <text x="400" y="408" text-anchor="middle" class="intro-caption">A STUDY IN MOTION</text>
        </svg>
      </div>
      <button class="intro-skip" @click="dismiss">건너뛰기 <span>↗</span></button>
    </div>
  </Transition>
</template>
