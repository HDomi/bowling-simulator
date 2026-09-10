import { BOARD_COUNT, LANE_LENGTH_FT } from '@/domain/constants'
import { depositKegelPasses, normalizeOilGrid } from '@/domain/patterns/kegel'
import {
  MONTREAL_DISTANCE_FT,
  MONTREAL_FORWARD,
  MONTREAL_REVERSE,
} from '@/domain/patterns/montreal'
import type { Pattern } from '@/domain/types'

/**
 * 하우스샷 형태(가운데 두껍고 외곽이 마른) 오일 격자를 만든다.
 *
 * 다운레인 감쇠 지수는 USBC Ball Motion Study의 실측 분포
 * (8ft 30 units / 32ft 8 / 47ft 5)에 맞춰 잡았다.
 * @param {number} distanceFt - 패턴 거리(ft)
 * @param {number} volume - 총량 배율
 * @returns {number[][]} [거리구간][보드] 오일량 0~1
 */
function buildHouseGrid(distanceFt: number, volume: number): number[][] {
  const rows: number[][] = []
  const totalRows = Math.ceil(LANE_LENGTH_FT) + 1

  for (let ft = 0; ft < totalRows; ft += 1) {
    const row: number[] = []
    const t = ft / distanceFt
    const longTaper = ft >= distanceFt ? 0 : (1 - t) ** 1.3 * (1 - 0.12 * t)

    for (let board = 1; board <= BOARD_COUNT; board += 1) {
      const fromCenter = Math.abs(board - 20)
      let widthFactor: number
      if (fromCenter <= 10) {
        widthFactor = 1
      } else if (fromCenter <= 13) {
        widthFactor = 0.48
      } else if (fromCenter <= 16) {
        widthFactor = 0.14
      } else {
        widthFactor = 0.03
      }

      const oil = Math.min(1, longTaper * widthFactor * volume)
      row.push(oil)
    }
    rows.push(row)
  }

  return rows
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
    grid: normalizeOilGrid(raw),
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
