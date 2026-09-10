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
/** 비교용 고스트 궤적. 구간 색 없이 흐린 크림색 점선이다. */
const GHOST = new Color('#b9b3a6')

export type TrailOptions = {
  /** true면 직전 볼의 비교 궤적으로 그린다. */
  ghost?: boolean
}

/**
 * 구간별 색이 들어가는 네온 궤적 라인을 만든다.
 * @param {ShotResult} result - 샷 결과
 * @param {number} width - 화면 너비
 * @param {number} height - 화면 높이
 * @param {TrailOptions} options - 고스트 여부
 * @returns {Line2} 궤적
 */
export function createTrail(
  result: ShotResult,
  width: number,
  height: number,
  options: TrailOptions = {},
): Line2 {
  const points: number[] = []
  const colors: number[] = []
  const color = new Color()
  const ghost = options.ghost === true

  for (const sample of result.path) {
    const pos = sampleToBallPos(sample, BALL_RADIUS)
    // 고스트는 본 궤적보다 살짝 낮게 깔아 겹칠 때 본 궤적이 위로 보인다.
    points.push(pos.x, pos.y + (ghost ? 0.008 : 0.012), pos.z)
    const yFt = sample.y / FT
    if (ghost) {
      color.copy(GHOST)
    } else if (yFt < result.phases.skidEnd) {
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
    linewidth: ghost ? 2.2 : 3.2,
    transparent: true,
    opacity: ghost ? 0.55 : 0.95,
    worldUnits: false,
    dashed: ghost,
    dashSize: 0.28,
    gapSize: 0.16,
  })
  material.resolution.set(Math.max(width, 1), Math.max(height, 1))

  const line = new Line2(geometry, material)
  line.computeLineDistances()
  line.renderOrder = ghost ? 1 : 2
  return line
}

/**
 * 궤적 라인의 지오메트리·머티리얼을 해제한다.
 * @param {Line2} line - 궤적
 */
export function disposeTrail(line: Line2): void {
  line.geometry.dispose()
  const mat = line.material
  if (Array.isArray(mat)) {
    mat.forEach((item) => item.dispose())
  } else {
    mat.dispose()
  }
}
