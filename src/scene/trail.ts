import { BALL_RADIUS, FT } from '@/domain/constants'
import type { ShotResult } from '@/domain/types'
import { sampleToBallPos } from '@/scene/coords'
import { Color } from 'three'
import { Line2 } from 'three/addons/lines/Line2.js'
import { LineGeometry } from 'three/addons/lines/LineGeometry.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'

const SKID = new Color('#4a8a99')
const HOOK = new Color('#1fe0ff')
const BACKEND = new Color('#ff2fa8')

/**
 * 구간별 색이 들어가는 네온 궤적 라인을 만든다.
 * @param {ShotResult} result - 샷 결과
 * @param {number} width - 화면 너비
 * @param {number} height - 화면 높이
 * @returns {Line2} 궤적
 */
export function createTrail(result: ShotResult, width: number, height: number): Line2 {
  const points: number[] = []
  const colors: number[] = []
  const color = new Color()

  for (const sample of result.path) {
    const pos = sampleToBallPos(sample, BALL_RADIUS)
    points.push(pos.x, pos.y + 0.012, pos.z)
    const yFt = sample.y / FT
    if (yFt < result.phases.skidEnd) {
      color.copy(SKID)
    } else if (yFt < result.phases.hookEnd) {
      color.copy(HOOK)
    } else {
      color.copy(BACKEND)
    }
    colors.push(color.r, color.g, color.b)
  }

  const geometry = new LineGeometry()
  geometry.setPositions(points)
  geometry.setColors(colors)

  const material = new LineMaterial({
    vertexColors: true,
    linewidth: 3.2,
    transparent: true,
    opacity: 0.95,
    worldUnits: false,
  })
  material.resolution.set(Math.max(width, 1), Math.max(height, 1))

  const line = new Line2(geometry, material)
  line.computeLineDistances()
  line.renderOrder = 2
  return line
}
