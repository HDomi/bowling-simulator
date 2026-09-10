import { describe, expect, it } from 'vitest'
import { BOARD_COUNT, OIL_BOARD_SIGMA } from '@/domain/constants'
import { smoothBoards } from '@/domain/patterns/kegel'
import {
  buildHouseGrid,
  createHousePattern,
  DEFAULT_HOUSE,
  getPatternById,
  PATTERN_LIMITS,
} from '@/domain/patterns/presets'
import { sampleOil } from '@/domain/physics/friction'
import type { Pattern } from '@/domain/types'

/**
 * 20ft 지점의 보드별 오일 단면을 뽑는다.
 * @param {Pattern} pattern - 패턴
 * @returns {number[]} 보드 1~39의 오일량
 */
function crossSection(pattern: Pattern): number[] {
  const out: number[] = []
  for (let board = 1; board <= BOARD_COUNT; board += 1) {
    out.push(sampleOil(pattern, board, 20))
  }
  return out
}

describe('보드 방향 스무딩', () => {
  it('총량을 크게 바꾸지 않는다', () => {
    const row: number[] = Array.from({ length: BOARD_COUNT }, (_, i) => (i >= 8 && i <= 30 ? 1 : 0))
    const before = row.reduce((a, b) => a + b, 0)
    const after = smoothBoards([row], 2)[0].reduce((a, b) => a + b, 0)
    // 레인 밖으로 번진 몫만 빠진다.
    expect(after).toBeGreaterThan(before * 0.9)
    expect(after).toBeLessThanOrEqual(before + 1e-9)
  })

  it('계단 경계를 완만하게 만든다', () => {
    const row: number[] = Array.from({ length: BOARD_COUNT }, (_, i) => (i >= 8 && i <= 30 ? 1 : 0))
    const smoothed = smoothBoards([row], 2)[0]
    // 원본은 8→9에서 0→1로 튄다. 스무딩 뒤에는 중간값이 생긴다.
    expect(smoothed[7]).toBeGreaterThan(0.05)
    expect(smoothed[7]).toBeLessThan(0.95)
  })

  it('sigma가 0이면 그대로 둔다', () => {
    const row: number[] = [0, 1, 0]
    expect(smoothBoards([row], 0)[0]).toEqual(row)
  })
})

describe('Montreal 단면', () => {
  it('중앙이 외곽보다 두껍다', () => {
    const section = crossSection(getPatternById('montreal'))
    expect(section[19]).toBeGreaterThan(section[4])
    expect(section[19]).toBeGreaterThan(section[34])
  })

  it('경계가 계단이 아니라 완만하다', () => {
    const section = crossSection(getPatternById('montreal'))
    // 마른 외곽(3보드)과 두꺼운 중앙(11보드) 사이에 중간값이 있어야 한다.
    const mid = section.slice(4, 10)
    const between = mid.filter((v) => v > 0.03 && v < section[19] - 0.03)
    expect(between.length).toBeGreaterThan(1)
  })

  it('좌우가 대칭에 가깝다', () => {
    const section = crossSection(getPatternById('montreal'))
    for (let i = 0; i < 19; i += 1) {
      expect(Math.abs(section[i] - section[BOARD_COUNT - 1 - i])).toBeLessThan(0.02)
    }
  })
})

describe('직접 조절 패턴', () => {
  it('비율을 높이면 중앙과 외곽 차이가 커진다', () => {
    const flat = crossSection(createHousePattern(40, 0.9, 2))
    const peaked = crossSection(createHousePattern(40, 0.9, 9))
    expect(peaked[19] / peaked[4]).toBeGreaterThan(flat[19] / flat[4])
  })

  it('총량을 올리면 전 구간이 두꺼워진다', () => {
    const thin = crossSection(createHousePattern(40, 0.6, 6))
    const thick = crossSection(createHousePattern(40, 1.2, 6))
    for (let i = 0; i < BOARD_COUNT; i += 1) {
      expect(thick[i]).toBeGreaterThanOrEqual(thin[i])
    }
  })

  it('거리를 넘어가면 오일이 없다', () => {
    const pattern = createHousePattern(38, 0.9, 6)
    expect(sampleOil(pattern, 20, 42)).toBe(0)
    expect(sampleOil(pattern, 20, 30)).toBeGreaterThan(0)
  })

  it('슬라이더 전 범위에서 값이 0~1을 벗어나지 않는다', () => {
    const { distanceFt, volume, ratio } = PATTERN_LIMITS
    for (const d of [distanceFt.min, distanceFt.max]) {
      for (const v of [volume.min, volume.max]) {
        for (const r of [ratio.min, ratio.max]) {
          for (const value of buildHouseGrid(d, v, r).flat()) {
            expect(value).toBeGreaterThanOrEqual(0)
            expect(value).toBeLessThanOrEqual(1)
          }
        }
      }
    }
  })

  it('기본값이 슬라이더 범위 안에 있다', () => {
    expect(DEFAULT_HOUSE.distanceFt).toBeGreaterThanOrEqual(PATTERN_LIMITS.distanceFt.min)
    expect(DEFAULT_HOUSE.distanceFt).toBeLessThanOrEqual(PATTERN_LIMITS.distanceFt.max)
    expect(DEFAULT_HOUSE.volume).toBeGreaterThanOrEqual(PATTERN_LIMITS.volume.min)
    expect(DEFAULT_HOUSE.ratio).toBeLessThanOrEqual(PATTERN_LIMITS.ratio.max)
  })

  it('스무딩 세기가 양수다', () => {
    expect(OIL_BOARD_SIGMA).toBeGreaterThan(0)
  })
})
