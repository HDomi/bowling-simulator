import { PIN_ROW_SPACING, PIN_SPACING } from '@/domain/constants'

export type PinSpot = {
  id: number
  x: number
  z: number
}

/**
 * 1번 핀을 원점으로 하는 10핀 정삼각 배치를 반환한다.
 * x는 가로(오른쪽 +), z는 다운레인이다.
 * @returns {PinSpot[]} 핀 스팟
 */
export function createPinSpots(): PinSpot[] {
  const rowZ = [0, PIN_ROW_SPACING, PIN_ROW_SPACING * 2, PIN_ROW_SPACING * 3]
  const layout: [number, number, number][] = [
    [1, 0, 0],
    [2, -0.5 * PIN_SPACING, 1],
    [3, 0.5 * PIN_SPACING, 1],
    [4, -PIN_SPACING, 2],
    [5, 0, 2],
    [6, PIN_SPACING, 2],
    [7, -1.5 * PIN_SPACING, 3],
    [8, -0.5 * PIN_SPACING, 3],
    [9, 0.5 * PIN_SPACING, 3],
    [10, 1.5 * PIN_SPACING, 3],
  ]

  return layout.map(([id, x, row]) => ({
    id,
    x,
    z: rowZ[row],
  }))
}

/**
 * 넘어진 핀 번호 목록으로 스트라이크 여부를 판정한다.
 * @param {number[]} pinsDown - 넘어진 핀 번호
 * @returns {boolean} 스트라이크
 */
export function isStrike(pinsDown: number[]): boolean {
  return pinsDown.length === 10
}
