import { BOARD_COUNT, POCKET } from '@/domain/constants'
import { simulateShot } from '@/domain/physics/simulate'
import type { Ball, Pattern, ReleaseInput } from '@/domain/types'

export type LineCandidate = {
  releaseBoard: number
  targetBoard: number
  /** 핀덱에 들어온 보드. 오른손 포켓은 17.5 근처다. */
  entryBoard: number
  entryAngleDeg: number
  breakpointFt: number
  /** 0~1. 진입 위치와 각도를 합친 점수다. */
  score: number
}

export type SearchOptions = {
  /** 보드를 몇 칸씩 건너뛸지. 1이면 전수, 2면 4분의 1만 본다. */
  step?: number
  /** 결과로 남길 최대 개수. */
  limit?: number
}

/**
 * 진입 보드가 포켓에 얼마나 가까운지 0~1로 매긴다.
 * @param {number} entryBoard - 진입 보드
 * @param {'right' | 'left'} hand - 손
 * @returns {number} 0~1
 */
export function pocketScore(entryBoard: number, hand: 'right' | 'left'): number {
  const center = hand === 'left' ? BOARD_COUNT + 1 - POCKET.board : POCKET.board
  const miss = Math.abs(entryBoard - center)
  if (miss >= POCKET.toleranceBoards) {
    return 0
  }
  return 1 - miss / POCKET.toleranceBoards
}

/**
 * 진입각이 캐리에 좋은 범위에 얼마나 드는지 0~1로 매긴다.
 *
 * USBC 연구에서 진입각이 클수록 핀 캐리가 좋아지지만, 실측 범위를 넘는 각도는
 * 이 모델의 근사 밖이라 더 쳐주지 않는다.
 * @param {number} angleDeg - 진입각
 * @returns {number} 0~1
 */
export function angleScore(angleDeg: number): number {
  if (angleDeg <= POCKET.minAngleDeg) {
    return Math.max(0, angleDeg / POCKET.minAngleDeg) * 0.6
  }
  if (angleDeg >= POCKET.idealAngleDeg) {
    return 1
  }
  const k = (angleDeg - POCKET.minAngleDeg) / (POCKET.idealAngleDeg - POCKET.minAngleDeg)
  return 0.6 + 0.4 * k
}

/**
 * 릴리즈 보드 × 타겟 보드를 모두 굴려보고 포켓에 드는 라인을 찾는다.
 *
 * 궤적에서 스펙을 역산하는 것은 미결정 문제라 풀 수 없다. 대신 순방향 시뮬을
 * 전부 돌려서 되는 라인을 고른다. 추천이 추측이 아니라 계산 결과가 된다.
 *
 * @param {Ball} ball - 볼 스펙
 * @param {Pattern} pattern - 오일 패턴
 * @param {ReleaseInput} release - 기준 릴리즈. 보드 두 값만 바꿔가며 쓴다.
 * @param {SearchOptions} options - 탐색 옵션
 * @returns {LineCandidate[]} 점수 내림차순 후보
 */
export function searchLines(
  ball: Ball,
  pattern: Pattern,
  release: ReleaseInput,
  options: SearchOptions = {},
): LineCandidate[] {
  const step = Math.max(1, Math.round(options.step ?? 1))
  const limit = options.limit ?? 40
  const found: LineCandidate[] = []

  for (let releaseBoard = 1; releaseBoard <= BOARD_COUNT; releaseBoard += step) {
    for (let targetBoard = 1; targetBoard <= BOARD_COUNT; targetBoard += step) {
      const shot = simulateShot(ball, pattern, { ...release, releaseBoard, targetBoard })
      if (shot.gutter) {
        continue
      }
      const pocket = pocketScore(shot.entryBoard, release.hand)
      if (pocket <= 0) {
        continue
      }
      found.push({
        releaseBoard,
        targetBoard,
        entryBoard: shot.entryBoard,
        entryAngleDeg: shot.entryAngleDeg,
        breakpointFt: shot.breakpointFt,
        score: pocket * angleScore(shot.entryAngleDeg),
      })
    }
  }

  found.sort((a, b) => b.score - a.score)
  return found.slice(0, limit)
}
