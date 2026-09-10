import { FT, PHASE_DETECT } from '@/domain/constants'
import type { PathSample } from '@/domain/types'

type Point = { x: number; y: number }

/**
 * 점들에 1차 회귀를 맞추고 R²를 구한다.
 * @param {Point[]} points - 표본 (x: 다운레인 ft, y: 가로 위치)
 * @returns {number} 결정계수. 표본이 부족하거나 y가 상수면 1을 준다.
 */
export function linearR2(points: Point[]): number {
  const n = points.length
  if (n < 3) {
    return 1
  }

  let sumX = 0
  let sumY = 0
  for (const point of points) {
    sumX += point.x
    sumY += point.y
  }
  const meanX = sumX / n
  const meanY = sumY / n

  let sxx = 0
  let sxy = 0
  for (const point of points) {
    const dx = point.x - meanX
    sxx += dx * dx
    sxy += dx * (point.y - meanY)
  }
  if (sxx === 0) {
    return 1
  }

  const slope = sxy / sxx
  const intercept = meanY - slope * meanX

  let ssr = 0
  let sst = 0
  for (const point of points) {
    const predicted = slope * point.x + intercept
    ssr += (point.y - predicted) ** 2
    sst += (point.y - meanY) ** 2
  }
  if (sst === 0) {
    return 1
  }
  return 1 - ssr / sst
}

/**
 * 궤적을 일정 간격으로 리샘플한다. USBC CATS 센서(약 2ft 간격)와 조건을 맞춘다.
 * @param {PathSample[]} path - 궤적 샘플
 * @returns {Point[]} 리샘플된 점들
 */
function resample(path: PathSample[]): Point[] {
  const points: Point[] = []
  const start = PHASE_DETECT.startFt
  const step = PHASE_DETECT.stepFt
  const lastFt = path[path.length - 1].y / FT

  for (let ft = start; ft <= lastFt; ft += step) {
    const target = ft * FT
    let best = path[0]
    let bestDist = Infinity
    for (const sample of path) {
      const dist = Math.abs(sample.y - target)
      if (dist < bestDist) {
        bestDist = dist
        best = sample
      }
    }
    points.push({ x: best.y / FT, y: best.x })
  }

  return points
}

/**
 * 궤적에서 스키드·훅·백엔드 경계를 찾는다.
 *
 * USBC Ball Motion Study와 같은 방식이다. 앞에서부터 1차 회귀 R²가 0.99를
 * 유지하는 최대 구간이 스키드, 뒤에서부터 같은 조건을 만족하는 최대 구간이
 * 백엔드, 그 사이가 훅이다.
 *
 * @param {PathSample[]} path - 궤적 샘플
 * @returns {{ skidEnd: number, hookEnd: number }} 경계 다운레인 거리(ft)
 */
export function detectPhases(path: PathSample[]): { skidEnd: number; hookEnd: number } {
  if (path.length < 3) {
    return { skidEnd: 20, hookEnd: 45 }
  }

  const points = resample(path)
  const n = points.length
  const minPoints = PHASE_DETECT.minPoints
  if (n < minPoints * 2) {
    const lastFt = points[n - 1]?.x ?? path[path.length - 1].y / FT
    return { skidEnd: lastFt * 0.35, hookEnd: lastFt * 0.8 }
  }

  const threshold = PHASE_DETECT.r2Threshold

  let skidCount: number = minPoints
  for (let count = minPoints; count <= n; count += 1) {
    if (linearR2(points.slice(0, count)) < threshold) {
      break
    }
    skidCount = count
  }

  let backCount: number = minPoints
  for (let count = minPoints; count <= n; count += 1) {
    if (linearR2(points.slice(n - count)) < threshold) {
      break
    }
    backCount = count
  }

  // 두 구간이 겹치면 훅 구간이 남도록 비율대로 물러난다.
  if (skidCount + backCount > n - 1) {
    const overlap = skidCount + backCount - (n - 1)
    const total = skidCount + backCount
    skidCount = Math.max(minPoints, skidCount - Math.round((overlap * skidCount) / total))
    backCount = Math.max(minPoints, Math.min(backCount, n - 1 - skidCount))
  }

  const skidEnd = points[Math.min(n - 1, skidCount - 1)].x
  const hookEnd = points[Math.max(0, n - backCount)].x

  if (hookEnd <= skidEnd) {
    return { skidEnd, hookEnd: Math.min(points[n - 1].x, skidEnd + PHASE_DETECT.stepFt) }
  }

  return { skidEnd, hookEnd }
}
