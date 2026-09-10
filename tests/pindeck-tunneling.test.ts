import { beforeAll, describe, expect, it } from 'vitest'
import { EXAMPLE_BALL } from '@/domain/ball'
import {
  BALL_RADIUS,
  BOARD_WIDTH,
  CENTER_BOARD,
  DEFAULT_LINE,
  HARRY,
  LANE_LENGTH,
  MPH,
  PIN_COLLIDER_RADIUS,
  PIN_HANDOFF_Y,
  SPEED_RANGE_MPH,
} from '@/domain/constants'
import { getPatternById } from '@/domain/patterns/presets'
import { createPinSpots } from '@/domain/pins/layout'
import { simulateShot } from '@/domain/physics/simulate'
import { physXToThree } from '@/scene/coords'
import { PinDeckPhysics } from '@/scene/PinDeckPhysics'
import type { ReleaseInput } from '@/domain/types'

/**
 * 보드 번호를 물리 x(m)로 바꾼다.
 * @param {number} board - 보드 번호
 * @returns {number} 가로 위치(m)
 */
function boardX(board: number): number {
  return (CENTER_BOARD - board) * BOARD_WIDTH
}

/**
 * 핀덱 진입 상태를 만든다.
 * @param {number} board - 진입 보드
 * @param {number} mph - 진입 속도
 * @param {number} angleDeg - 진입각(도)
 * @returns {Parameters<PinDeckPhysics['launchBall']>[0]} 진입 상태
 */
function entryAt(board: number, mph: number, angleDeg: number) {
  const speed = mph * MPH
  const rad = (angleDeg * Math.PI) / 180
  return {
    x: boardX(board),
    y: PIN_HANDOFF_Y,
    vx: -speed * Math.sin(rad),
    vy: speed * Math.cos(rad),
    wx: -40,
    wy: -20,
    wz: 6,
  }
}

let deck: PinDeckPhysics

beforeAll(async () => {
  deck = new PinDeckPhysics()
  await deck.init()
}, 30000)

/**
 * 공을 던지고 정지할 때까지 밟은 뒤 넘어진 핀을 센다.
 * @param {ReturnType<typeof entryAt>} entry - 진입 상태
 * @returns {number} 넘어진 핀 수
 */
function roll(entry: ReturnType<typeof entryAt>): number {
  deck.resetPins()
  for (let i = 0; i < 30; i += 1) {
    deck.step(1 / 60)
  }
  deck.launchBall(entry, 15)
  for (let i = 0; i < 300; i += 1) {
    deck.step(1 / 60)
  }
  return deck.pinsDown().length
}

describe('핀덱 터널링', () => {
  it('포켓으로 들어가면 핀이 넘어진다', () => {
    expect(roll(entryAt(17.5, 15, 4))).toBeGreaterThan(0)
  })

  it('빠른 진입(22 mph)에서도 공이 핀을 뚫지 않는다', () => {
    expect(roll(entryAt(17.5, 22, 4))).toBeGreaterThan(0)
  })

  it('아주 빠른 진입(30 mph)에서도 핀을 뚫지 않는다', () => {
    expect(roll(entryAt(17.5, 30, 4))).toBeGreaterThan(0)
  })

  it('1번 핀 정면(20보드) 직구도 핀을 뚫지 않는다', () => {
    expect(roll(entryAt(20, 20, 0))).toBeGreaterThan(0)
  })

  it('여러 속도·각도 조합에서 한 번도 0핀이 나오지 않는다', () => {
    const zeros: string[] = []
    for (const mph of [12, 16, 20, 24, 28]) {
      for (const angle of [0, 3, 6]) {
        for (const board of [16, 18, 20]) {
          if (roll(entryAt(board, mph, angle)) === 0) {
            zeros.push(`${board}보드 ${mph}mph ${angle}°`)
          }
        }
      }
    }
    expect(zeros).toEqual([])
  })
})

describe('핀덱 인계 지점', () => {
  it('공을 놓는 자리가 어떤 핀과도 겹치지 않는다', () => {
    const minGap = BALL_RADIUS + PIN_COLLIDER_RADIUS
    for (const board of [14, 16, 17.5, 20, 24]) {
      const ballX = physXToThree(boardX(board))
      for (const spot of createPinSpots()) {
        const d = Math.hypot(ballX - physXToThree(spot.x), PIN_HANDOFF_Y - (LANE_LENGTH + spot.z))
        expect(d, `${board}보드 ↔ ${spot.id}번 핀`).toBeGreaterThan(minGap)
      }
    }
  })

  it('인계 지점이 1번 핀보다 앞이다', () => {
    expect(PIN_HANDOFF_Y).toBeLessThan(LANE_LENGTH - BALL_RADIUS - PIN_COLLIDER_RADIUS)
  })
})

describe('실제 시뮬 경로로 굴리기', () => {
  /**
   * 시뮬 결과를 그대로 핀덱에 넘겨 넘어진 핀을 센다.
   * @param {Partial<ReleaseInput>} override - 릴리즈 오버라이드
   * @returns {number} 넘어진 핀 수
   */
  function rollSimulated(override: Partial<ReleaseInput> = {}): number {
    const result = simulateShot(EXAMPLE_BALL, getPatternById('montreal'), {
      speedMph: HARRY.speedMph,
      revRate: HARRY.revRate,
      ...DEFAULT_LINE,
      axisRotation: HARRY.axisRotation,
      axisTilt: HARRY.axisTilt,
      hand: 'right',
      ...override,
    })
    if (result.gutter) {
      return -1
    }
    deck.resetPins()
    for (let i = 0; i < 30; i += 1) {
      deck.step(1 / 60)
    }
    deck.launchBall(result.pinEntry, EXAMPLE_BALL.weightLb)
    for (let i = 0; i < 300; i += 1) {
      deck.step(1 / 60)
    }
    return deck.pinsDown().length
  }

  it('기본 라인은 핀을 쓰러뜨린다', () => {
    expect(rollSimulated()).toBeGreaterThan(0)
  })

  it('슬라이더 최대 속도에서도 핀을 뚫지 않는다', () => {
    expect(rollSimulated({ speedMph: SPEED_RANGE_MPH.max, targetBoard: 20 })).not.toBe(0)
  })

  it('속도 전 구간에서 0핀이 나오지 않는다', () => {
    const zeros: string[] = []
    for (let mph = 12; mph <= SPEED_RANGE_MPH.max; mph += 2) {
      for (const rev of [150, 275, 450]) {
        const down = rollSimulated({ speedMph: mph, revRate: rev })
        if (down === 0) {
          zeros.push(`${mph}mph ${rev}rpm`)
        }
      }
    }
    expect(zeros).toEqual([])
  })
})
