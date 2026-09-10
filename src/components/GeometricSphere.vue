<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
const props = withDefaults(defineProps<{ paused?: boolean; stretch?: number }>(), { paused: false, stretch: 1 })
const canvas = ref<HTMLCanvasElement | null>(null)
let frame = 0
let observer: ResizeObserver
let width = 0, height = 0, angle = 0, previous = 0
const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
const circles: number[][][] = []
// 경선·위선과 기울어진 큰 원을 3D 좌표로 만든다.
for (let meridian = 0; meridian < 18; meridian++) {
  const a = meridian * Math.PI / 18
  circles.push(Array.from({ length: 161 }, (_, i) => {
    const t = i / 160 * Math.PI * 2
    return [Math.cos(t) * Math.cos(a), Math.sin(t), Math.cos(t) * Math.sin(a)]
  }))
}
for (let latitude = -4; latitude <= 4; latitude++) {
  const y = latitude / 5, r = Math.sqrt(1 - y * y)
  circles.push(Array.from({ length: 161 }, (_, i) => {
    const t = i / 160 * Math.PI * 2
    return [r * Math.cos(t), y, r * Math.sin(t)]
  }))
}
for (let ring = 0; ring < 5; ring++) {
  const a = ring * 0.45 + 0.3
  circles.push(Array.from({ length: 161 }, (_, i) => {
    const t = i / 160 * Math.PI * 2, r = 0.82 + ring * 0.034
    return [r * Math.cos(t), r * Math.sin(t) * Math.cos(a), r * Math.sin(t) * Math.sin(a)]
  }))
}
function draw(now: number) {
  const ctx = canvas.value?.getContext('2d')
  if (!ctx) return
  if (!motion.matches && !props.paused) angle += Math.min((now - previous) / 1000 || 0, 0.05) * 0.095
  previous = now
  ctx.clearRect(0, 0, width, height)
  const radius = Math.min(width, height) * 0.465
  const cos = Math.cos(angle + 0.35), sin = Math.sin(angle + 0.35)
  for (const circle of circles) {
    ctx.beginPath()
    circle.forEach(([x, y, z], i) => {
      const rx = x * cos + z * sin
      const rz = -x * sin + z * cos
      const ry = y * Math.cos(0.28) - rz * Math.sin(0.28)
      const px = width / 2 + rx * radius
      const py = height / 2 + ry * radius * Math.max(0.9, Math.min(1.08, props.stretch))
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    })
    ctx.strokeStyle = 'rgba(40, 43, 36, .56)'
    ctx.lineWidth = 0.85
    ctx.stroke()
  }
  // 두 개의 독립 궤도와 중심축으로 도면의 구조를 남긴다.
  ctx.strokeStyle = 'rgba(40, 43, 36, .2)'
  ctx.lineWidth = 0.65
  ctx.beginPath()
  ctx.ellipse(width / 2, height / 2, radius * 1.025, radius * 0.28, -0.25, 0, Math.PI * 2)
  ctx.moveTo(width / 2 - radius * 1.14, height / 2)
  ctx.lineTo(width / 2 + radius * 1.14, height / 2)
  ctx.stroke()
  frame = requestAnimationFrame(draw)
}
onMounted(() => {
  observer = new ResizeObserver(() => {
    const element = canvas.value!
    width = element.clientWidth; height = element.clientHeight
    const dpr = Math.min(window.devicePixelRatio, 2)
    element.width = width * dpr; element.height = height * dpr
    element.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0)
  })
  observer.observe(canvas.value!)
  frame = requestAnimationFrame(draw)
})
onUnmounted(() => { cancelAnimationFrame(frame); observer?.disconnect() })
</script>

<template><canvas ref="canvas" class="geometric-sphere" aria-hidden="true" /></template>
