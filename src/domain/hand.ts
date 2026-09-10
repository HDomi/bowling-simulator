import { DEFAULT_LINE } from '@/domain/constants'
import type { Bowler } from '@/domain/types'

export type Hand = Bowler['hand']

export const RIGHT_HAND_LINE = {
  hand: 'right' as const,
  releaseBoard: DEFAULT_LINE.releaseBoard,
  targetBoard: DEFAULT_LINE.targetBoard,
}

export const LEFT_HAND_LINE = {
  hand: 'left' as const,
  releaseBoard: mirrorBoard(DEFAULT_LINE.releaseBoard),
  targetBoard: mirrorBoard(DEFAULT_LINE.targetBoard),
}

/**
 * 보드 번호를 좌우 대칭한다. 1↔39, 20은 그대로다.
 * @param {number} board - 보드 번호
 * @returns {number} 대칭 보드
 */
export function mirrorBoard(board: number): number {
  return 40 - board
}

/**
 * 슬라이더 위치(왼쪽=1)를 USBC 보드 번호로 바꾼다.
 * 슬라이더 왼쪽이 레인 왼쪽(보드 39)이 되게 한다.
 * @param {number} slider - 슬라이더 값 1~39
 * @returns {number} 보드 번호
 */
export function sliderToBoard(slider: number): number {
  return 40 - slider
}

/**
 * USBC 보드 번호를 슬라이더 위치(왼쪽=1)로 바꾼다.
 * @param {number} board - 보드 번호
 * @returns {number} 슬라이더 값
 */
export function boardToSlider(board: number): number {
  return 40 - board
}

/**
 * 손(좌/우)에 맞는 기본 릴리즈·타겟 보드를 반환한다.
 * 오른손: 20에서 나와 14를 지나 왼쪽으로 훅. 왼손은 그 좌우 대칭이다.
 * @param {Hand} hand - 손
 * @returns {{ releaseBoard: number, targetBoard: number }} 기본 라인
 */
export function defaultLineForHand(hand: Hand): { releaseBoard: number; targetBoard: number } {
  if (hand === 'left') {
    return { releaseBoard: LEFT_HAND_LINE.releaseBoard, targetBoard: LEFT_HAND_LINE.targetBoard }
  }
  return { releaseBoard: RIGHT_HAND_LINE.releaseBoard, targetBoard: RIGHT_HAND_LINE.targetBoard }
}

/**
 * 손 표시 라벨을 반환한다.
 * @param {Hand} hand - 손
 * @returns {string} 라벨
 */
export function handLabel(hand: Hand): string {
  return hand === 'left' ? '왼손' : '오른손'
}
