import { describe, expect, it } from 'vitest'
import {
  BALL_LIMITS,
  createBall,
  effectiveBall,
  EXAMPLE_BALL,
  SPEC_REFERENCE_WEIGHT_LB,
  specAtWeight,
  usbcWarnings,
  validateBall,
} from '@/domain/ball'
import {
  arcDistanceIn,
  ellipsoidSemiAxes,
  GRIP_HALF_SPAN_IN,
  MB_POINT,
  PIN_POINT,
  rgAxes,
  rgSpreadPercent,
  surfaceMarkers,
} from '@/domain/ballGeometry'
import {
  BALL_STORAGE_KEY,
  BALL_STORAGE_VERSION,
  loadBalls,
  sanitizePayload,
  saveBalls,
  type KeyValueStorage,
} from '@/domain/ballStorage'
import { HARRY } from '@/domain/constants'
import { getPatternById } from '@/domain/patterns/presets'
import { findHookStartFt, simulateShot } from '@/domain/physics/simulate'
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

const bowler = { papOver: HARRY.papOver, papUp: HARRY.papUp, hand: 'right' as const }

/**
 * 볼 오버라이드로 Harry 기본 라인을 굴린다. 무게 환산을 거친 실효 볼을 넘긴다.
 * @param {Partial<Ball>} override - 볼 오버라이드
 * @returns {ReturnType<typeof simulateShot>} 샷 결과
 */
function roll(override: Partial<Ball> = {}) {
  return simulateShot(effectiveBall({ ...EXAMPLE_BALL, ...override }), getPatternById('montreal'), harryRelease)
}

/**
 * 메모리 저장소를 만든다.
 * @returns {KeyValueStorage & { data: Map<string, string> }} 가짜 localStorage
 */
function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
    },
    removeItem: (key) => {
      data.delete(key)
    },
  }
}

describe('무게별 스펙 환산', () => {
  it('15 lb는 카탈로그 스펙 그대로다', () => {
    const spec = specAtWeight(EXAMPLE_BALL, SPEC_REFERENCE_WEIGHT_LB)
    expect(spec.rg).toBe(EXAMPLE_BALL.rg)
    expect(spec.diff).toBe(EXAMPLE_BALL.diff)
    expect(effectiveBall(EXAMPLE_BALL)).toBe(EXAMPLE_BALL)
  })

  it('가벼워질수록 RG는 오르고 Diff는 준다 (단조)', () => {
    let previous = specAtWeight(EXAMPLE_BALL, 16)
    for (let weight = 15; weight >= 10; weight -= 1) {
      const spec = specAtWeight(EXAMPLE_BALL, weight)
      expect(spec.rg).toBeGreaterThan(previous.rg)
      expect(spec.diff).toBeLessThan(previous.diff)
      previous = spec
    }
  })

  it('11 lb 이하는 제네릭 코어라 Diff가 0.005 아래로 뭉개진다', () => {
    expect(specAtWeight(EXAMPLE_BALL, 11).diff).toBeLessThan(0.005)
    expect(specAtWeight(EXAMPLE_BALL, 10).diff).toBeLessThan(0.005)
    expect(specAtWeight(EXAMPLE_BALL, 12).diff).toBeGreaterThan(0.02)
  })

  it('Int. Diff는 Diff와 같은 비율로 줄고 Diff를 넘지 않는다', () => {
    const asym = { ...EXAMPLE_BALL, intDiff: 0.02 }
    const at15 = specAtWeight(asym, 15)
    const at12 = specAtWeight(asym, 12)
    expect(at15.intDiff).toBe(0.02)
    expect(at12.intDiff! / at15.intDiff!).toBeCloseTo(at12.diff / at15.diff, 6)
    expect(specAtWeight(asym, 10).intDiff!).toBeLessThanOrEqual(specAtWeight(asym, 10).diff)
    expect(specAtWeight(EXAMPLE_BALL, 12).intDiff).toBeUndefined()
  })

  it('결과가 폼 범위를 벗어나지 않는다', () => {
    const edge = { rg: BALL_LIMITS.rg.max, diff: BALL_LIMITS.diff.max }
    for (let weight = 10; weight <= 16; weight += 1) {
      const spec = specAtWeight(edge, weight)
      expect(spec.rg).toBeLessThanOrEqual(BALL_LIMITS.rg.max)
      expect(spec.rg).toBeGreaterThanOrEqual(BALL_LIMITS.rg.min)
      expect(spec.diff).toBeLessThanOrEqual(BALL_LIMITS.diff.max)
      expect(spec.diff).toBeGreaterThanOrEqual(0)
    }
  })

  it('같은 볼을 12 lb로 바꾸면 진입각이 작아진다 (체크포인트)', () => {
    const heavy = roll({ weightLb: 15 })
    const light = roll({ weightLb: 12 })
    expect(light.entryAngleDeg).toBeLessThan(heavy.entryAngleDeg)
  })
})

describe('볼 검증', () => {
  it('예시 볼과 템플릿은 통과한다', () => {
    expect(validateBall(EXAMPLE_BALL)).toEqual([])
    expect(validateBall(createBall())).toEqual([])
  })

  it('범위 밖 값과 빈 이름을 잡는다', () => {
    const errors = validateBall({
      ...EXAMPLE_BALL,
      name: '   ',
      weightLb: 9,
      rg: 3,
      diff: -0.01,
      colors: ['red', '#000000'],
    })
    expect(errors.length).toBeGreaterThanOrEqual(5)
    expect(errors.some((error) => error.includes('이름'))).toBe(true)
    expect(errors.some((error) => error.includes('무게'))).toBe(true)
    expect(errors.some((error) => error.includes('RG'))).toBe(true)
    expect(errors.some((error) => error.includes('Diff'))).toBe(true)
    expect(errors.some((error) => error.includes('색'))).toBe(true)
  })

  it('Int. Diff가 Diff보다 크면 막는다', () => {
    const errors = validateBall({ ...EXAMPLE_BALL, intDiff: 0.03, diff: 0.02 })
    expect(errors.some((error) => error.includes('Int. Diff'))).toBe(true)
  })

  it('레이아웃 필드도 검사한다', () => {
    const errors = validateBall({
      ...EXAMPLE_BALL,
      layout: { drillAngle: 120, pinToPap: 4.5, valAngle: 30 },
    })
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('드릴각')
  })

  it('USBC 규정 위반은 경고로만 알리고 저장은 막지 않는다', () => {
    const illegal = { ...EXAMPLE_BALL, rg: 2.45, diff: 0.065 }
    expect(validateBall(illegal)).toEqual([])
    const warnings = usbcWarnings(illegal)
    expect(warnings).toHaveLength(2)
    expect(warnings[0]).toContain('RG')
    expect(warnings[1]).toContain('Diff')
    expect(usbcWarnings(EXAMPLE_BALL)).toEqual([])
  })
})

describe('관성 타원체', () => {
  it('RG 세 축: 핀 축이 최소, MB 축이 최대, 대칭이면 중간 = 최대', () => {
    const axes = rgAxes({ rg: 2.48, diff: 0.048 })
    expect(axes.low).toBe(2.48)
    expect(axes.high).toBeCloseTo(2.528, 9)
    expect(axes.intermediate).toBe(axes.high)
    const asym = rgAxes({ rg: 2.48, diff: 0.048, intDiff: 0.015 })
    expect(asym.intermediate).toBeCloseTo(2.513, 9)
  })

  it('RG가 작은 축(핀 축)이 가장 길다', () => {
    const [x, y, z] = ellipsoidSemiAxes(rgAxes({ rg: 2.48, diff: 0.048, intDiff: 0.015 }), 10, 1)
    expect(y).toBeGreaterThan(z)
    expect(z).toBeGreaterThan(x)
  })

  it('과장 ×1이면 반축 비가 RG 역비와 같다', () => {
    const axes = rgAxes({ rg: 2.48, diff: 0.048 })
    const [x, y] = ellipsoidSemiAxes(axes, 1, 1)
    expect(y / x).toBeCloseTo(axes.high / axes.low, 9)
  })

  it('과장을 키우면 차이가 벌어진다', () => {
    const axes = rgAxes(EXAMPLE_BALL)
    const [x1, y1] = ellipsoidSemiAxes(axes, 1, 1)
    const [x10, y10] = ellipsoidSemiAxes(axes, 10, 1)
    expect(y10 / x10).toBeGreaterThan(y1 / x1)
  })

  it('Diff 0이면 완전한 구다', () => {
    const [x, y, z] = ellipsoidSemiAxes(rgAxes({ rg: 2.6, diff: 0 }), 10, 1)
    expect(x).toBeCloseTo(y, 12)
    expect(y).toBeCloseTo(z, 12)
    expect(rgSpreadPercent(rgAxes({ rg: 2.6, diff: 0 }))).toBe(0)
  })

  it('예시 볼의 실제 RG 차이는 약 1.9%다', () => {
    expect(rgSpreadPercent(rgAxes(EXAMPLE_BALL))).toBeCloseTo(1.94, 1)
  })
})

describe('표면 마커', () => {
  it('핀은 +Y, CG는 핀에서 핀-CG 거리만큼 떨어져 있다', () => {
    const markers = surfaceMarkers(EXAMPLE_BALL, bowler)
    expect(markers.pin).toEqual(PIN_POINT)
    expect(arcDistanceIn(markers.pin, markers.cg)).toBeCloseTo(EXAMPLE_BALL.pinToCg!, 6)
    expect(Math.hypot(markers.cg.x, markers.cg.y, markers.cg.z)).toBeCloseTo(1, 9)
  })

  it('MB는 비대칭 볼에만 있고 핀에서 90°다', () => {
    expect(surfaceMarkers(EXAMPLE_BALL, bowler).mb).toBeNull()
    const asym = surfaceMarkers({ ...EXAMPLE_BALL, intDiff: 0.015 }, bowler)
    expect(asym.mb).toEqual(MB_POINT)
    expect(arcDistanceIn(PIN_POINT, asym.mb!)).toBeCloseTo((Math.PI / 2) * 4.25, 6)
  })

  it('레이아웃이 없으면 구멍이 없고, 있으면 세 개다', () => {
    expect(surfaceMarkers(EXAMPLE_BALL, bowler).holes).toEqual([])
    const withLayout: Ball = {
      ...EXAMPLE_BALL,
      layout: { drillAngle: 45, pinToPap: 4.5, valAngle: 35 },
    }
    const markers = surfaceMarkers(withLayout, bowler)
    expect(markers.holes).toHaveLength(3)
    expect(markers.pap).not.toBeNull()
    expect(markers.gripCenter).not.toBeNull()
    for (const hole of markers.holes) {
      expect(Math.hypot(hole.x, hole.y, hole.z)).toBeCloseTo(1, 9)
    }
  })

  it('PAP는 핀에서 핀-PAP 거리, 그립은 PAP에서 볼러 PAP 측정값만큼 떨어져 있다', () => {
    const layout = { drillAngle: 45, pinToPap: 4.5, valAngle: 35 }
    const markers = surfaceMarkers({ ...EXAMPLE_BALL, layout }, bowler)
    expect(arcDistanceIn(PIN_POINT, markers.pap!)).toBeCloseTo(layout.pinToPap, 6)
    const papToGrip = Math.hypot(bowler.papOver, bowler.papUp)
    expect(arcDistanceIn(markers.pap!, markers.gripCenter!)).toBeCloseTo(papToGrip, 1)
    // 엄지 구멍은 그립 중심 아래 반 스팬, 손가락 줄은 위 반 스팬
    expect(arcDistanceIn(markers.gripCenter!, markers.holes[2])).toBeCloseTo(GRIP_HALF_SPAN_IN, 6)
    expect(arcDistanceIn(markers.holes[0], markers.holes[1])).toBeGreaterThan(1)
  })

  it('드릴각 0이면 PAP가 핀-CG 선 위에 있다', () => {
    const layout = { drillAngle: 0, pinToPap: 4, valAngle: 30 }
    const markers = surfaceMarkers({ ...EXAMPLE_BALL, layout }, bowler)
    // 핀→CG 방향은 +X. PAP도 X-Y 평면에 있어야 한다.
    expect(Math.abs(markers.pap!.z)).toBeLessThan(1e-9)
    expect(markers.pap!.x).toBeGreaterThan(0)
  })

  it('왼손은 드릴각이 반대로 돌아 PAP가 대칭이다', () => {
    const layout = { drillAngle: 45, pinToPap: 4.5, valAngle: 35 }
    const right = surfaceMarkers({ ...EXAMPLE_BALL, layout }, bowler)
    const left = surfaceMarkers({ ...EXAMPLE_BALL, layout }, { ...bowler, hand: 'left' })
    expect(left.pap!.x).toBeCloseTo(right.pap!.x, 9)
    expect(left.pap!.y).toBeCloseTo(right.pap!.y, 9)
    expect(left.pap!.z).toBeCloseTo(-right.pap!.z, 9)
  })
})

describe('localStorage 저장', () => {
  it('저장소가 없으면 예시 볼 하나로 시작한다', () => {
    const loaded = loadBalls(null)
    expect(loaded.balls).toHaveLength(1)
    expect(loaded.balls[0].id).toBe(EXAMPLE_BALL.id)
    expect(loaded.activeId).toBe(EXAMPLE_BALL.id)
  })

  it('저장 후 다시 읽으면 같다', () => {
    const storage = memoryStorage()
    const second = createBall({ name: 'Two', cover: 'urethane', grit: 500, intDiff: 0.012, layout: { drillAngle: 40, pinToPap: 5, valAngle: 30 } })
    const payload = { version: BALL_STORAGE_VERSION, activeId: second.id, balls: [EXAMPLE_BALL, second] }
    expect(saveBalls(storage, payload)).toBe(true)
    expect(storage.data.has(BALL_STORAGE_KEY)).toBe(true)
    const loaded = loadBalls(storage)
    expect(loaded.activeId).toBe(second.id)
    expect(loaded.balls).toEqual(payload.balls)
  })

  it('깨진 JSON·다른 버전·빈 목록은 예시 볼로 떨어진다', () => {
    const storage = memoryStorage()
    storage.setItem(BALL_STORAGE_KEY, '{not json')
    expect(loadBalls(storage).balls[0].id).toBe(EXAMPLE_BALL.id)
    storage.setItem(BALL_STORAGE_KEY, JSON.stringify({ version: 99, activeId: 'x', balls: [EXAMPLE_BALL] }))
    expect(loadBalls(storage).balls[0].id).toBe(EXAMPLE_BALL.id)
    storage.setItem(BALL_STORAGE_KEY, JSON.stringify({ version: BALL_STORAGE_VERSION, activeId: 'x', balls: [] }))
    expect(loadBalls(storage).balls[0].id).toBe(EXAMPLE_BALL.id)
  })

  it('잘못된 볼과 중복 id는 버리고 activeId를 고친다', () => {
    const payload = sanitizePayload({
      version: BALL_STORAGE_VERSION,
      activeId: 'gone',
      balls: [
        { ...EXAMPLE_BALL, id: 'a' },
        { ...EXAMPLE_BALL, id: 'a', name: 'dup' },
        { ...EXAMPLE_BALL, id: 'b', rg: 9 },
        null,
        { ...EXAMPLE_BALL, id: 'c', name: '  Trim  ' },
      ],
    })
    expect(payload).not.toBeNull()
    expect(payload!.balls.map((ball) => ball.id)).toEqual(['a', 'c'])
    expect(payload!.balls[1].name).toBe('Trim')
    expect(payload!.activeId).toBe('a')
  })

  it('setItem이 throw 하면 false를 돌려준다', () => {
    const storage = memoryStorage()
    storage.setItem = () => {
      throw new Error('QuotaExceededError')
    }
    expect(saveBalls(storage, loadBalls(null))).toBe(false)
  })
})

describe('마이볼 체크포인트: 같은 라인에서 커버·그릿만 바꿔도 궤적이 달라진다', () => {
  it('500방은 4000방보다 브레이크포인트가 4 ft 이상 앞이고 진입 보드가 5보드 이상 왼쪽이다', () => {
    const rough = roll({ grit: 500 })
    const smooth = roll({ grit: 4000 })
    // 훅 시작(진행각 임계)은 둔한 지표라 0.4 ft밖에 안 갈린다. 눈에 보이는 차이는 이 둘이다.
    expect(smooth.breakpointFt - rough.breakpointFt).toBeGreaterThanOrEqual(4)
    expect(rough.entryBoard - smooth.entryBoard).toBeGreaterThanOrEqual(5)
    expect(findHookStartFt(rough.path, 'right')).toBeLessThanOrEqual(
      findHookStartFt(smooth.path, 'right'),
    )
  })

  it('솔리드는 폴리보다 진입각이 1° 이상 크다', () => {
    const solid = roll({ cover: 'reactive-solid' })
    const poly = roll({ cover: 'polyester' })
    expect(solid.entryAngleDeg - poly.entryAngleDeg).toBeGreaterThanOrEqual(1)
  })

  it('커버가 강해지는 순서대로 진입 보드가 왼쪽(높은 번호)으로 밀린다', () => {
    const covers: Ball['cover'][] = ['polyester', 'urethane', 'reactive-pearl', 'reactive-hybrid', 'reactive-solid', 'particle']
    const boards = covers.map((cover) => roll({ cover }).entryBoard)
    for (let i = 1; i < boards.length; i += 1) {
      expect(boards[i]).toBeGreaterThan(boards[i - 1])
    }
  })
})
