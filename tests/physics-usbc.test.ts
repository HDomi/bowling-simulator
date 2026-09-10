import { describe, expect, it } from 'vitest'
import { EXAMPLE_BALL } from '@/domain/ball'
import { FT, HARRY, USBC_RANGE } from '@/domain/constants'
import { boardOilTotal, depositKegelPasses } from '@/domain/patterns/kegel'
import {
  MONTREAL_DISTANCE_FT,
  MONTREAL_FORWARD,
  MONTREAL_REVERSE,
} from '@/domain/patterns/montreal'
import { getPatternById } from '@/domain/patterns/presets'
import { defaultLineForHand, LEFT_HAND_LINE, RIGHT_HAND_LINE, boardToSlider, sliderToBoard } from '@/domain/hand'
import { computeMu, gritToRa, xToBoard, boardToX } from '@/domain/physics/friction'
import {
  CUSTOM_STYLE_ID,
  getReleaseStyleById,
  matchReleaseStyleId,
  RELEASE_STYLES,
} from '@/domain/styles'
import { REV_RANGE_RPM, SPEED_RANGE_MPH } from '@/domain/constants'
import { linearR2 } from '@/domain/physics/phases'
import { simulateShot, findHookStartFt, sampleAtY } from '@/domain/physics/simulate'
import { physXToThree } from '@/scene/coords'
import type { Ball, ReleaseInput } from '@/domain/types'

const harryRelease: ReleaseInput = {
  speedMph: HARRY.speedMph,
  revRate: HARRY.revRate,
  releaseBoard: HARRY.releaseBoard,
  targetBoard: HARRY.targetBoard,
  axisRotation: HARRY.axisRotation,
  axisTilt: HARRY.axisTilt,
  hand: 'right',
}

/**
 * Harry 기본 릴리즈로 샷을 시뮬한다.
 * @param {Partial<Ball>} ballOverride - 볼 오버라이드
 * @param {string} patternId - 패턴 id
 * @param {Partial<ReleaseInput>} releaseOverride - 릴리즈 오버라이드
 * @returns {ReturnType<typeof simulateShot>} 샷 결과
 */
function roll(
  ballOverride: Partial<Ball> = {},
  patternId = 'montreal',
  releaseOverride: Partial<ReleaseInput> = {},
) {
  return simulateShot(
    { ...EXAMPLE_BALL, ...ballOverride },
    getPatternById(patternId),
    { ...harryRelease, ...releaseOverride },
  )
}

describe('WB Montreal 41 재구성', () => {
  it('외곽 3-7 대비 18번 보드 오일 비율이 약 3.1:1이다', () => {
    const raw = depositKegelPasses(
      [...MONTREAL_FORWARD, ...MONTREAL_REVERSE],
      MONTREAL_DISTANCE_FT,
    )
    const middle = boardOilTotal(raw, 18)
    const outside =
      [3, 4, 5, 6, 7].reduce((sum, board) => sum + boardOilTotal(raw, board), 0) / 5
    expect(middle / outside).toBeCloseTo(3.1, 1)
  })

  it('41ft 이후 오일이 없다', () => {
    const pattern = getPatternById('montreal')
    const row = pattern.grid[45]
    expect(row.every((value) => value === 0)).toBe(true)
  })
})

describe('USBC Harry 기본값 + Montreal 41', () => {
  it('브레이크포인트가 USBC 실측 범위(28.8~39.83 ft)에 든다', () => {
    const result = roll()
    expect(result.breakpointFt).toBeGreaterThanOrEqual(USBC_RANGE.breakpointFt.min)
    expect(result.breakpointFt).toBeLessThanOrEqual(USBC_RANGE.breakpointFt.max)
  })

  it('49ft 속도 감소가 USBC 실측 범위(1.31~2.53 mph)에 든다', () => {
    const result = roll()
    expect(result.speedLoss49Mph).toBeGreaterThanOrEqual(USBC_RANGE.speedLoss49Mph.min)
    expect(result.speedLoss49Mph).toBeLessThanOrEqual(USBC_RANGE.speedLoss49Mph.max)
  })

  it('49ft 각도 변화가 USBC 실측 범위(2.06~4.89°)에 든다', () => {
    const result = roll()
    expect(result.angleChange49Deg).toBeGreaterThanOrEqual(USBC_RANGE.angleChange49Deg.min)
    expect(result.angleChange49Deg).toBeLessThanOrEqual(USBC_RANGE.angleChange49Deg.max)
  })

  it('거터로 빠지지 않고 핀덱에 도달한다', () => {
    const result = roll()
    expect(result.gutter).toBe(false)
    expect(result.pinEntry.y).toBeGreaterThan(18)
  })

  it('기본 라인이 포켓(17.5 보드) 근처로 들어간다', () => {
    const result = roll()
    expect(result.entryBoard).toBeGreaterThan(15.5)
    expect(result.entryBoard).toBeLessThan(19.5)
  })
})

describe('3구간 회귀 (USBC Figure 1 모델)', () => {
  /**
   * 궤적을 2ft 간격으로 리샘플한다.
   * @param {ReturnType<typeof roll>} result - 샷 결과
   * @param {number} fromFt - 시작 거리
   * @param {number} toFt - 끝 거리
   * @returns {{ x: number, y: number }[]} 표본
   */
  function segment(result: ReturnType<typeof roll>, fromFt: number, toFt: number) {
    const points: { x: number; y: number }[] = []
    for (let ft = fromFt; ft <= toFt; ft += 2) {
      const sample = sampleAtY(result.path, ft * FT)
      if (sample) {
        points.push({ x: sample.y / FT, y: sample.x })
      }
    }
    return points
  }

  it('스키드 구간이 직선이다 (R² ≥ 0.99)', () => {
    const result = roll()
    expect(linearR2(segment(result, 11, result.phases.skidEnd))).toBeGreaterThanOrEqual(0.99)
  })

  it('백엔드 구간이 직선이다 (R² ≥ 0.99)', () => {
    const result = roll()
    expect(linearR2(segment(result, result.phases.hookEnd, 60))).toBeGreaterThanOrEqual(0.99)
  })

  it('세 구간이 순서대로 나뉜다', () => {
    const result = roll()
    expect(result.phases.skidEnd).toBeGreaterThan(11)
    expect(result.phases.hookEnd).toBeGreaterThan(result.phases.skidEnd)
    expect(result.phases.hookEnd).toBeLessThanOrEqual(60)
  })
})

describe('단조성', () => {
  it('그릿을 거칠게 하면 훅이 앞당겨진다', () => {
    const smooth = roll({ grit: 4000 })
    const rough = roll({ grit: 500 })
    expect(findHookStartFt(rough.path, 'right')).toBeLessThan(
      findHookStartFt(smooth.path, 'right'),
    )
  })

  it('오일을 길게 하면 훅이 뒤로 밀린다', () => {
    const short = roll({}, 'short')
    const long = roll({}, 'long')
    expect(findHookStartFt(long.path, 'right')).toBeGreaterThan(
      findHookStartFt(short.path, 'right'),
    )
  })

  it('RG를 높이면 같은 지점에서 미끄럼이 더 남는다', () => {
    const low = roll({ rg: 2.48 })
    const high = roll({ rg: 2.72 })
    const lowSlip = sampleAtY(low.path, 28 * FT)?.slip ?? 0
    const highSlip = sampleAtY(high.path, 28 * FT)?.slip ?? 0
    expect(highSlip).toBeGreaterThan(lowSlip)
  })

  it('Diff를 높이면 진입각이 커진다', () => {
    const low = roll({ diff: 0.02 })
    const high = roll({ diff: 0.056 })
    expect(high.entryAngleDeg).toBeGreaterThan(low.entryAngleDeg)
  })

  it('커버가 강할수록 진입각이 커진다', () => {
    const weak = roll({ cover: 'polyester' })
    const strong = roll({ cover: 'reactive-solid' })
    expect(strong.entryAngleDeg).toBeGreaterThan(weak.entryAngleDeg)
  })
})

describe('마찰 모델', () => {
  it('오일 위 μ가 마른 레인보다 작다', () => {
    const dry = computeMu(EXAMPLE_BALL, 0)
    const wet = computeMu(EXAMPLE_BALL, 1)
    expect(wet).toBeLessThan(dry)
  })

  it('500방 Ra가 26이다', () => {
    expect(gritToRa(500)).toBe(26)
  })
})

describe('릴리즈 스타일 프리셋', () => {
  it('모든 프리셋이 슬라이더 범위 안에 있다', () => {
    for (const style of RELEASE_STYLES) {
      expect(style.speedMph).toBeGreaterThanOrEqual(SPEED_RANGE_MPH.min)
      expect(style.speedMph).toBeLessThanOrEqual(SPEED_RANGE_MPH.max)
      expect(style.revRate).toBeGreaterThanOrEqual(REV_RANGE_RPM.min)
      expect(style.revRate).toBeLessThanOrEqual(REV_RANGE_RPM.max)
    }
  })

  it('회전수가 큰 스타일일수록 훅이 더 크다', () => {
    const stroker = getReleaseStyleById('stroker')
    const twoHanded = getReleaseStyleById('two-handed')
    if (!stroker || !twoHanded) {
      throw new Error('스타일 프리셋 누락')
    }
    const strokerShot = roll({}, 'montreal', { ...RIGHT_HAND_LINE, ...stroker })
    const twoHandedShot = roll({}, 'montreal', { ...RIGHT_HAND_LINE, ...twoHanded })
    expect(twoHandedShot.entryAngleDeg).toBeGreaterThan(strokerShot.entryAngleDeg)
  })

  it('프리셋 값과 다르면 직접 설정으로 본다', () => {
    const cranker = getReleaseStyleById('cranker')
    if (!cranker) {
      throw new Error('크랭커 프리셋 누락')
    }
    expect(matchReleaseStyleId(cranker)).toBe('cranker')
    expect(matchReleaseStyleId({ ...cranker, revRate: cranker.revRate + 5 })).toBe(
      CUSTOM_STYLE_ID,
    )
  })

  it('속도 상한 35 mph에서도 궤적이 유효하다', () => {
    const result = roll({}, 'montreal', {
      releaseBoard: 20,
      targetBoard: 20,
      speedMph: SPEED_RANGE_MPH.max,
      revRate: REV_RANGE_RPM.max,
    })
    expect(Number.isFinite(result.entryBoard)).toBe(true)
    expect(Number.isFinite(result.speedAtPinsMph)).toBe(true)
    expect(result.gutter).toBe(false)
    expect(result.pinEntry.y).toBeGreaterThan(18)
  })
})

describe('손(좌/우)', () => {
  it('오른손 기본 라인은 20번에서 나와 14번을 본다', () => {
    expect(RIGHT_HAND_LINE.releaseBoard).toBe(20)
    expect(RIGHT_HAND_LINE.targetBoard).toBe(14)
    expect(defaultLineForHand('right')).toEqual({
      releaseBoard: 20,
      targetBoard: 14,
    })
  })

  it('왼손 기본 라인은 오른손의 좌우 대칭이다', () => {
    expect(LEFT_HAND_LINE.releaseBoard).toBe(20)
    expect(LEFT_HAND_LINE.targetBoard).toBe(26)
  })

  it('슬라이더 왼쪽은 레인 왼쪽(보드 39)이다', () => {
    expect(sliderToBoard(1)).toBe(39)
    expect(sliderToBoard(39)).toBe(1)
    expect(boardToSlider(22)).toBe(18)
    expect(sliderToBoard(boardToSlider(10))).toBe(10)
  })

  it('화면에서 보드 1은 오른쪽, 39는 왼쪽이다', () => {
    expect(boardToX(1)).toBeGreaterThan(0)
    expect(physXToThree(boardToX(1))).toBeLessThan(0)
    expect(physXToThree(boardToX(39))).toBeGreaterThan(0)
  })

  it('오른손 타겟이 릴리즈보다 왼쪽이면 밖으로 나가지 않고 왼쪽 거터로 빠진다', () => {
    const result = roll({}, 'montreal', {
      releaseBoard: 22,
      targetBoard: 24,
      revRate: 500,
    })
    const farthestRight = Math.min(...result.path.map((sample) => xToBoard(sample.x)))
    expect(result.gutter).toBe(true)
    expect(farthestRight).toBeGreaterThan(20)
  })

  it('오른손은 오른쪽으로 나갔다가 다시 왼쪽으로 훅한다', () => {
    const result = roll({}, 'montreal', {
      ...RIGHT_HAND_LINE,
    })
    const boards = result.path.map((sample) => xToBoard(sample.x))
    const startBoard = boards[0]
    const farthestRight = Math.min(...boards)
    const lastBoard = boards[boards.length - 1]
    expect(result.gutter).toBe(false)
    expect(startBoard).toBeCloseTo(RIGHT_HAND_LINE.releaseBoard, 0)
    expect(farthestRight).toBeLessThan(startBoard)
    expect(lastBoard).toBeGreaterThan(farthestRight)
    expect(result.breakpointFt).toBeGreaterThan(20)
  })

  it('왼손은 왼쪽으로 나갔다가 다시 오른쪽으로 훅한다', () => {
    const result = roll({}, 'montreal', {
      ...LEFT_HAND_LINE,
    })
    const boards = result.path.map((sample) => xToBoard(sample.x))
    const startBoard = boards[0]
    const farthestLeft = Math.max(...boards)
    const lastBoard = boards[boards.length - 1]
    expect(result.gutter).toBe(false)
    expect(startBoard).toBeCloseTo(LEFT_HAND_LINE.releaseBoard, 0)
    expect(farthestLeft).toBeGreaterThan(startBoard)
    expect(lastBoard).toBeLessThan(farthestLeft)
  })
})
