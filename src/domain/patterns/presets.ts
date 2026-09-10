import { BOARD_COUNT, LANE_LENGTH_FT, OIL_BOARD_SIGMA } from '@/domain/constants'
import { depositKegelPasses, normalizeOilGrid, smoothBoards } from '@/domain/patterns/kegel'
import {
  MONTREAL_DISTANCE_FT,
  MONTREAL_FORWARD,
  MONTREAL_REVERSE,
} from '@/domain/patterns/montreal'
import type { Pattern } from '@/domain/types'

/** 하우스 패턴 슬라이더의 허용 범위. */
export const PATTERN_LIMITS = {
  distanceFt: { min: 32, max: 48, step: 1 },
  volume: { min: 0.5, max: 1.4, step: 0.02 },
  /** 중앙 대 외곽 오일 비율. 하우스샷은 높고 스포츠샷은 낮다. */
  ratio: { min: 1.5, max: 10, step: 0.1 },
} as const

export const DEFAULT_HOUSE = {
  distanceFt: 40,
  volume: 0.88,
  ratio: 6,
} as const

/**
 * 하우스샷 형태(가운데 두껍고 외곽이 마른) 오일 격자를 만든다.
 *
 * 다운레인 감쇠 지수는 USBC Ball Motion Study의 실측 분포
 * (8ft 30 units / 32ft 8 / 47ft 5)에 맞춰 잡았다.
 * 보드 방향은 가우시안으로 번지게 해서 패스 경계가 계단이 되지 않게 한다.
 *
 * @param {number} distanceFt - 패턴 거리(ft)
 * @param {number} volume - 총량 배율
 * @param {number} ratio - 중앙 대 외곽 비율
 * @returns {number[][]} [거리구간][보드] 오일량 0~1
 */
export function buildHouseGrid(
  distanceFt: number,
  volume: number,
  ratio: number = DEFAULT_HOUSE.ratio,
): number[][] {
  const rows: number[][] = []
  const totalRows = Math.ceil(LANE_LENGTH_FT) + 1
  const outside = 1 / Math.max(1, ratio)

  for (let ft = 0; ft < totalRows; ft += 1) {
    const row: number[] = []
    const t = ft / distanceFt
    const longTaper = ft >= distanceFt ? 0 : (1 - t) ** 1.3 * (1 - 0.12 * t)

    for (let board = 1; board <= BOARD_COUNT; board += 1) {
      // 중앙(20보드)에서 1, 거터로 갈수록 1/ratio까지 완만히 떨어진다.
      const fromCenter = Math.abs(board - 20) / 19
      const widthFactor = outside + (1 - outside) * (1 - fromCenter ** 2.2)
      row.push(Math.min(1, longTaper * widthFactor * volume))
    }
    rows.push(row)
  }

  // 스무딩은 이웃 값을 섞으므로 부동소수 오차로 1을 아주 살짝 넘을 수 있다.
  return smoothBoards(rows, OIL_BOARD_SIGMA).map((row) =>
    row.map((value) => Math.min(1, Math.max(0, value))),
  )
}

/**
 * 슬라이더 값으로 하우스 패턴을 만든다.
 * @param {number} distanceFt - 패턴 거리(ft)
 * @param {number} volume - 총량 배율
 * @param {number} ratio - 중앙 대 외곽 비율
 * @returns {Pattern} 패턴
 */
export function createHousePattern(
  distanceFt: number,
  volume: number,
  ratio: number,
): Pattern {
  return {
    id: 'custom',
    name: `직접 조절 ${Math.round(distanceFt)}'`,
    distanceFt,
    segmentFt: 1,
    source: 'slider',
    grid: buildHouseGrid(distanceFt, volume, ratio),
  }
}

/**
 * WB Montreal 41' 격자를 Kegel T.OIL 패스에서 재구성한다.
 * @returns {Pattern} 테스트용 실측 패턴
 */
export function createMontrealPattern(): Pattern {
  const raw = depositKegelPasses(
    [...MONTREAL_FORWARD, ...MONTREAL_REVERSE],
    MONTREAL_DISTANCE_FT,
  )
  return {
    id: 'montreal',
    name: "WB Montreal 41'",
    distanceFt: MONTREAL_DISTANCE_FT,
    segmentFt: 1,
    source: 'preset',
    grid: normalizeOilGrid(smoothBoards(raw, OIL_BOARD_SIGMA)),
  }
}

/**
 * 숏/미디엄/롱 하우스 + Montreal 테스트 프리셋을 반환한다.
 * @returns {Pattern[]} 패턴 프리셋
 */
export function createPatternPresets(): Pattern[] {
  return [
    createMontrealPattern(),
    {
      id: 'short',
      name: '숏 35',
      distanceFt: 35,
      segmentFt: 1,
      source: 'preset',
      grid: buildHouseGrid(35, 0.86),
    },
    {
      id: 'medium',
      name: '미디엄 40',
      distanceFt: 40,
      segmentFt: 1,
      source: 'preset',
      grid: buildHouseGrid(40, 0.88),
    },
    {
      id: 'long',
      name: '롱 45',
      distanceFt: 45,
      segmentFt: 1,
      source: 'preset',
      grid: buildHouseGrid(45, 0.9),
    },
  ]
}

const PRESETS = createPatternPresets()

/**
 * 프리셋 id로 패턴을 찾는다. 없으면 Montreal을 반환한다.
 * @param {string} id - 패턴 id
 * @returns {Pattern} 패턴
 */
export function getPatternById(id: string): Pattern {
  return PRESETS.find((pattern) => pattern.id === id) ?? PRESETS[0]
}

export { PRESETS as PATTERN_PRESETS }
