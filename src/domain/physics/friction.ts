import {
  BOARD_COUNT,
  BOARD_WIDTH,
  CENTER_BOARD,
  COVER_MU,
  GRIT_EXPONENT,
  GRIT_RA,
  IN,
  LANE_WIDTH,
  LB,
  PHYSICS,
  RA_REF,
} from '@/domain/constants'
import type { Ball, CoverType, Grit, Pattern } from '@/domain/types'

/**
 * 보드 번호를 레인 중심 기준 가로 위치(m)로 변환한다.
 * +x는 볼러 시점에서 오른쪽, 1번 보드가 오른쪽 거터 옆이다.
 * @param {number} board - 1~39 보드 번호
 * @returns {number} 가로 위치(m)
 */
export function boardToX(board: number): number {
  return (CENTER_BOARD - board) * BOARD_WIDTH
}

/**
 * 가로 위치(m)를 보드 번호로 변환한다.
 * @param {number} x - 가로 위치(m)
 * @returns {number} 보드 번호
 */
export function xToBoard(x: number): number {
  return CENTER_BOARD - x / BOARD_WIDTH
}

/**
 * 레인 위를 벗어났는지 판정한다.
 * @param {number} x - 가로 위치(m)
 * @returns {boolean} 거터 여부
 */
export function isInGutter(x: number): boolean {
  return Math.abs(x) > LANE_WIDTH / 2
}

/**
 * 그릿을 Ra(μ-in)로 변환한다.
 * @param {Grit} grit - 표면 그릿
 * @returns {number} Ra
 */
export function gritToRa(grit: Grit): number {
  return GRIT_RA[String(grit)] ?? RA_REF
}

/**
 * Ra에 따른 마찰 배율을 계산한다. 선형이 아니라 지수로 압축한다.
 * @param {number} ra - 표면 거칠기(μ-in)
 * @returns {number} 마찰 배율
 */
export function gritFrictionScale(ra: number): number {
  return (ra / RA_REF) ** GRIT_EXPONENT
}

/**
 * 커버스톡·그릿·오일·Diff로 접지 마찰계수를 계산한다.
 * @param {Ball} ball - 볼 스펙
 * @param {number} oil - 정규화 오일량 0~1
 * @returns {number} 마찰계수 μ
 */
export function computeMu(ball: Ball, oil: number): number {
  const coverMu = COVER_MU[ball.cover] ?? COVER_MU['reactive-solid']
  const gritScale = gritFrictionScale(gritToRa(ball.grit))
  const diffScale = Math.max(
    PHYSICS.diffScaleMin,
    1 + PHYSICS.kDiff * (ball.diff - PHYSICS.diffRef),
  )
  const dryMu = coverMu * gritScale * diffScale * PHYSICS.dryMuScale
  const clampedOil = Math.min(1, Math.max(0, oil))
  const mix = (1 - clampedOil) ** PHYSICS.oilExponent
  const mu = PHYSICS.oilMuFloor + (dryMu - PHYSICS.oilMuFloor) * mix
  return Math.max(PHYSICS.oilMuFloor, mu)
}

/**
 * 볼 질량(kg)을 반환한다.
 * @param {number} weightLb - 무게(lb)
 * @returns {number} 질량(kg)
 */
export function ballMassKg(weightLb: number): number {
  return weightLb * LB
}

/**
 * 관성모멘트 I = m · RG². RG는 인치 입력이다.
 * @param {number} massKg - 질량(kg)
 * @param {number} rgIn - RG(in)
 * @returns {number} 관성모멘트(kg·m²)
 */
export function inertiaFromRg(massKg: number, rgIn: number): number {
  const rgM = rgIn * IN
  return massKg * rgM * rgM
}

/**
 * 패턴 격자에서 보드·다운레인 위치의 오일을 이중선형 보간한다.
 * @param {Pattern} pattern - 오일 패턴
 * @param {number} board - 보드 번호(실수)
 * @param {number} yFt - 다운레인 거리(ft)
 * @returns {number} 오일량 0~1
 */
export function sampleOil(pattern: Pattern, board: number, yFt: number): number {
  const rows = pattern.grid
  if (rows.length === 0) {
    return 0
  }

  const clampedBoard = Math.min(BOARD_COUNT, Math.max(1, board))
  const col = clampedBoard - 1
  const col0 = Math.min(BOARD_COUNT - 1, Math.max(0, Math.floor(col)))
  const col1 = Math.min(BOARD_COUNT - 1, col0 + 1)
  const colT = col - col0

  const rowPos = yFt / pattern.segmentFt
  const row0 = Math.min(rows.length - 1, Math.max(0, Math.floor(rowPos)))
  const row1 = Math.min(rows.length - 1, row0 + 1)
  const rowT = rowPos - row0

  const v00 = rows[row0][col0]
  const v01 = rows[row0][col1]
  const v10 = rows[row1][col0]
  const v11 = rows[row1][col1]
  const v0 = v00 * (1 - colT) + v01 * colT
  const v1 = v10 * (1 - colT) + v11 * colT
  return Math.min(1, Math.max(0, v0 * (1 - rowT) + v1 * rowT))
}

/**
 * 커버 타입 라벨을 반환한다.
 * @param {CoverType} cover - 커버스톡
 * @returns {string} 표시용 이름
 */
export function coverLabel(cover: CoverType): string {
  const labels: Record<CoverType, string> = {
    polyester: '폴리',
    urethane: '우레탄',
    'reactive-pearl': '펄',
    'reactive-hybrid': '하이브리드',
    'reactive-solid': '솔리드',
    particle: '파티클',
  }
  return labels[cover]
}
