import { beforeAll, describe, expect, it } from 'vitest'
import { EXAMPLE_BALL } from '@/domain/ball'
import { BALL_RADIUS, HARRY } from '@/domain/constants'
import { defaultLineForHand } from '@/domain/hand'
import { getPatternById } from '@/domain/patterns/presets'
import { simulateShot } from '@/domain/physics/simulate'
import { physOmegaToThree, physXToThree } from '@/scene/coords'
import { PinDeckPhysics } from '@/scene/PinDeckPhysics'

describe('물리 각속도를 Three로 옮기기', () => {
  it('축이 위치 변환과 같은 규칙을 따른다', () => {
    // 위치는 (x, y, z) → (-x, z, y). 행렬식이 1인 회전이라 축벡터도 같은 규칙이다.
    const omega = physOmegaToThree({ x: 1, y: 2, z: 3 })
    expect([omega.x, omega.y, omega.z]).toEqual([-1, 3, 2])
  })

  it('다운레인 축 회전은 부호가 살아 있다', () => {
    // 이 성분이 훅을 만드는 사이드 롤이다. 뒤집히면 핀덱에서 공이 반대로 밀린다.
    expect(physOmegaToThree({ x: 0, y: -4.5, z: 0 }).z).toBeCloseTo(-4.5, 6)
  })
})

describe('핀덱 인계', () => {
  let deck: PinDeckPhysics

  beforeAll(async () => {
    deck = new PinDeckPhysics()
    await deck.init()
  })

  /**
   * 기본 라인을 굴려 핀덱 진입 상태를 만든다.
   * @returns {ReturnType<typeof simulateShot>} 샷 결과
   */
  function defaultShot() {
    const line = defaultLineForHand('right')
    return simulateShot(EXAMPLE_BALL, getPatternById('montreal'), {
      speedMph: HARRY.speedMph,
      revRate: HARRY.revRate,
      releaseBoard: line.releaseBoard,
      targetBoard: line.targetBoard,
      axisRotation: HARRY.axisRotation,
      axisTilt: HARRY.axisTilt,
      hand: 'right',
    })
  }

  it('접촉점 미끄럼이 인계 시점에 거의 0이다', () => {
    const { pinEntry } = defaultShot()
    // omega × r (r = 아래로 반지름)의 가로 성분은 -wy·R이다.
    const slipX = pinEntry.vx - pinEntry.wy * BALL_RADIUS
    const slipY = pinEntry.vy + pinEntry.wx * BALL_RADIUS
    expect(Math.hypot(slipX, slipY)).toBeLessThan(0.2)
  })

  it('핀덱에 들어간 공이 훅 방향을 유지한다', () => {
    deck.resetPins()
    const shot = defaultShot()
    deck.launchBall(shot.pinEntry, EXAMPLE_BALL.weightLb)

    const before = deck.ballPosition()
    expect(before).not.toBeNull()
    for (let i = 0; i < 30; i += 1) {
      deck.step(1 / 60)
    }
    const after = deck.ballPosition()
    expect(after).not.toBeNull()

    // 오른손 훅은 레인 왼쪽으로 간다. Three x는 물리 x의 부호를 뒤집으므로 늘어난다.
    // 각속도 축 부호가 틀리면 마찰이 반대로 작용해 이 값이 줄어든다.
    const expectedDir = Math.sign(physXToThree(shot.pinEntry.vx))
    const moved = (after!.x - before!.x) * expectedDir
    expect(moved).toBeGreaterThan(0)
  })

  it('바닥에서 튀어 오르지 않는다', () => {
    deck.resetPins()
    const shot = defaultShot()
    deck.launchBall(shot.pinEntry, EXAMPLE_BALL.weightLb)

    let maxY = 0
    for (let i = 0; i < 30; i += 1) {
      deck.step(1 / 60)
      const pos = deck.ballPosition()
      if (pos) {
        maxY = Math.max(maxY, pos.y)
      }
    }
    // 반발이 크면 공이 바닥을 때리고 떠오른다. 굴러가는 공은 반지름 높이를 지킨다.
    expect(maxY).toBeLessThan(BALL_RADIUS * 1.15)
  })
})
