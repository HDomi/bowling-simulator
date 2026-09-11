import { beforeAll, describe, expect, it } from 'vitest'
import {
  BOARD_WIDTH,
  CENTER_BOARD,
  KICKBACK_X,
  MPH,
  PINSETTER,
  PIN_HANDOFF_Y,
  PIT_END,
} from '@/domain/constants'
import { PinDeckPhysics } from '@/scene/PinDeckPhysics'

let deck: PinDeckPhysics

beforeAll(async () => {
  deck = new PinDeckPhysics()
  await deck.init()
})

/**
 * 핀덱 진입 상태를 만든다.
 * @param {number} board - 진입 보드
 * @param {number} mph - 진입 속도
 * @returns {Parameters<PinDeckPhysics['launchBall']>[0]} 진입 상태
 */
function entryAt(board: number, mph: number) {
  const speed = mph * MPH
  return {
    x: (CENTER_BOARD - board) * BOARD_WIDTH,
    y: PIN_HANDOFF_Y,
    vx: -speed * Math.sin(0.07),
    vy: speed * Math.cos(0.07),
    wx: -40,
    wy: -20,
    wz: 6,
  }
}

/**
 * 한 구를 굴리고 핀이 멈출 때까지 돌린다.
 * @param {number} board - 진입 보드
 * @param {number} mph - 속도
 */
function roll(board: number, mph: number): void {
  deck.launchBall(entryAt(board, mph), 15)
  for (let i = 0; i < 300; i += 1) {
    deck.step(1 / 60)
  }
}

/**
 * 핀세터를 끝까지 돌린다.
 * @param {number[]} keepIds - 남길 핀
 * @returns {number} 걸린 프레임 수
 */
function runSweep(keepIds: number[]): number {
  deck.startSweep(keepIds)
  let frames = 0
  while (frames < 600) {
    frames += 1
    deck.step(1 / 60)
    if (deck.updateSweep(1 / 60)) {
      break
    }
  }
  return frames
}

describe('핀세터', () => {
  it('쓰러진 핀을 치우고 남은 핀만 세운다', () => {
    deck.resetPins()
    roll(9, 17)
    const standing = deck.standingPins()
    runSweep(standing)
    expect(deck.standingPins().sort()).toEqual([...standing].sort())
  })

  it('세워진 핀은 넘어진 것으로 세지 않는다', () => {
    deck.resetPins()
    roll(9, 17)
    const standing = deck.standingPins()
    runSweep(standing)
    // 핀세터 직후에는 남은 핀이 모두 서 있으므로 넘어진 핀이 없다.
    expect(deck.pinsDown()).toEqual([])
  })

  it('타임라인 안에 끝난다', () => {
    deck.resetPins()
    roll(17.5, 17)
    const frames = runSweep(deck.standingPins())
    expect(frames / 60).toBeLessThan(PINSETTER.returnEnd + 0.5)
  })

  it('전부 쓰러진 뒤 핀세터를 돌리면 핀덱이 빈다', () => {
    deck.resetPins()
    runSweep([])
    expect(deck.standingPins()).toEqual([])
  })

  it('스트라이크 뒤 프레임을 다시 시작하면 10핀이 선다', () => {
    deck.resetPins()
    runSweep([])
    deck.resetPins()
    expect(deck.standingPins()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })
})

describe('핀덱 가둠', () => {
  it('세게 굴려도 핀이 킥백과 백스톱 밖으로 나가지 않는다', () => {
    for (const [board, mph] of [[17.5, 30], [10, 26], [24, 26], [20, 34]] as const) {
      deck.resetPins()
      roll(board, mph)
      for (const id of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
        const pos = deck.pinPosition(id)
        if (!pos) {
          continue
        }
        expect(Math.abs(pos.x), `${board}보드 ${mph}mph · ${id}번 핀 x`).toBeLessThan(KICKBACK_X + 0.1)
        expect(pos.z, `${board}보드 ${mph}mph · ${id}번 핀 z`).toBeLessThan(PIT_END + 0.2)
      }
    }
  })

  it('공도 핀덱 밖으로 나가지 않는다', () => {
    deck.resetPins()
    roll(17.5, 32)
    const pos = deck.ballPosition()
    expect(pos).not.toBeNull()
    if (pos) {
      expect(Math.abs(pos.x)).toBeLessThan(KICKBACK_X + 0.1)
      expect(pos.z).toBeLessThan(PIT_END + 0.2)
    }
  })
})
