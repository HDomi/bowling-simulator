import { IN } from '@/domain/constants'

/** USBC Equipment Specifications, 03/2026, pp. 20–22.
 * https://images.bowl.com/bowl/media/assets/usbc/equipment%20specs/26_231-26-march-es-manual.pdf
 * [바닥 높이, 지름], inch. 측정점 사이는 단조 3차 곡선으로 보간한다.
 */
export const PIN_STATIONS = [
  [0, 2.031], [0.75, 2.828], [2.25, 3.906], [3.375, 4.510],
  [4.5, 4.766], [5.875, 4.563], [7.25, 3.703], [8.625, 2.472],
  [9.375, 1.965], [10, 1.797], [10.875, 1.870], [11.75, 2.094],
  [12.625, 2.406], [13.5, 2.547],
] as const

const baseArc = 5 / 32
const headArc = 1.273
const headCenter = 15 - headArc
const nodes: number[][] = [
  [baseArc, 2.031 / 2 + baseArc],
  ...PIN_STATIONS.slice(1).map(([y, diameter]) => [y, diameter / 2]),
  [headCenter, headArc],
]
const slopes = nodes.slice(1).map((p, i) => (p[1] - nodes[i][1]) / (p[0] - nodes[i][0]))
const tangents = nodes.map((_, i) => {
  if (i === 0 || i === nodes.length - 1) return 0
  const a = slopes[i - 1], b = slopes[i]
  if (a * b <= 0) return 0
  const before = nodes[i][0] - nodes[i - 1][0]
  const after = nodes[i + 1][0] - nodes[i][0]
  const w1 = 2 * after + before, w2 = after + 2 * before
  return (w1 + w2) / (w1 / a + w2 / b)
})

/** 바닥 기준 높이(m)의 곡면 반지름(m). */
export function pinRadiusAt(height: number): number {
  const y = Math.max(0, Math.min(15, height / IN))
  if (y <= baseArc) return (2.031 / 2 + Math.sqrt(Math.max(0, baseArc ** 2 - (y - baseArc) ** 2))) * IN
  if (y >= headCenter) return Math.sqrt(Math.max(0, headArc ** 2 - (y - headCenter) ** 2)) * IN
  const i = nodes.findIndex((_, index) => index < nodes.length - 1 && y <= nodes[index + 1][0])
  const [a, ra] = nodes[i], [b, rb] = nodes[i + 1]
  const h = b - a, t = (y - a) / h
  return ((2*t**3 - 3*t**2 + 1)*ra + (t**3 - 2*t**2 + t)*h*tangents[i]
    + (-2*t**3 + 3*t**2)*rb + (t**3 - t**2)*h*tangents[i + 1]) * IN
}

/** 빨간 목띠의 높이 범위(inch). USBC 치수가 아닌 외관 설정이다. */
export const PIN_STRIPES = [[10.05, 10.4], [10.65, 11]] as const

/** 메시와 충돌체가 공유하는 회전 단면. */
export function pinProfile(stepIn = 0.125): { radius: number; y: number }[] {
  const heights = new Set<number>([0, 15, baseArc, headCenter, ...PIN_STATIONS.map(p => p[0]), ...PIN_STRIPES.flat()])
  for (let y = stepIn; y < 15; y += stepIn) heights.add(y)
  return [...heights].sort((a, b) => a - b).map(y => ({ y: y * IN, radius: pinRadiusAt(y * IN) }))
}
