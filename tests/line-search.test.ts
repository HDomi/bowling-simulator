import { describe, expect, it } from 'vitest'
import { EXAMPLE_BALL } from '@/domain/ball'
import { BOARD_COUNT, DEFAULT_LINE, HARRY, POCKET } from '@/domain/constants'
import { LEFT_HAND_LINE } from '@/domain/hand'
import { getPatternById } from '@/domain/patterns/presets'
import { angleScore, pocketScore, searchLines } from '@/domain/physics/search'
import { simulateShot } from '@/domain/physics/simulate'
import type { ReleaseInput } from '@/domain/types'

const baseRelease: ReleaseInput = {
  speedMph: HARRY.speedMph,
  revRate: HARRY.revRate,
  ...DEFAULT_LINE,
  axisRotation: HARRY.axisRotation,
  axisTilt: HARRY.axisTilt,
  hand: 'right',
}

/**
 * 기본 조건으로 라인을 탐색한다.
 * @param {Partial<ReleaseInput>} override - 릴리즈 오버라이드
 * @param {string} patternId - 패턴 id
 * @returns {ReturnType<typeof searchLines>} 후보 목록
 */
function search(override: Partial<ReleaseInput> = {}, patternId = 'montreal') {
  return searchLines(EXAMPLE_BALL, getPatternById(patternId), { ...baseRelease, ...override })
}

describe('점수 함수', () => {
  it('포켓 정중앙이 1점이다', () => {
    expect(pocketScore(POCKET.board, 'right')).toBe(1)
  })

  it('허용 범위를 벗어나면 0점이다', () => {
    expect(pocketScore(POCKET.board + POCKET.toleranceBoards, 'right')).toBe(0)
    expect(pocketScore(1, 'right')).toBe(0)
  })

  it('왼손 포켓은 좌우 대칭이다', () => {
    expect(pocketScore(BOARD_COUNT + 1 - POCKET.board, 'left')).toBe(1)
  })

  it('진입각이 클수록 점수가 높다', () => {
    expect(angleScore(1)).toBeLessThan(angleScore(3))
    expect(angleScore(3)).toBeLessThan(angleScore(POCKET.idealAngleDeg))
  })

  it('이상 각도를 넘어도 더 주지 않는다', () => {
    expect(angleScore(POCKET.idealAngleDeg + 4)).toBe(1)
  })
})

describe('라인 탐색', () => {
  it('포켓에 드는 라인을 찾는다', () => {
    expect(search().length).toBeGreaterThan(0)
  })

  it('점수 내림차순으로 돌려준다', () => {
    const lines = search()
    for (let i = 1; i < lines.length; i += 1) {
      expect(lines[i - 1].score).toBeGreaterThanOrEqual(lines[i].score)
    }
  })

  it('찾은 라인을 실제로 굴리면 포켓에 들어간다', () => {
    for (const line of search().slice(0, 8)) {
      const shot = simulateShot(EXAMPLE_BALL, getPatternById('montreal'), {
        ...baseRelease,
        releaseBoard: line.releaseBoard,
        targetBoard: line.targetBoard,
      })
      expect(shot.gutter, `${line.releaseBoard}→${line.targetBoard}`).toBe(false)
      expect(
        Math.abs(shot.entryBoard - POCKET.board),
        `${line.releaseBoard}→${line.targetBoard} 진입 ${shot.entryBoard.toFixed(1)}`,
      ).toBeLessThan(POCKET.toleranceBoards)
    }
  })

  it('보드 범위 안의 라인만 돌려준다', () => {
    for (const line of search()) {
      expect(line.releaseBoard).toBeGreaterThanOrEqual(1)
      expect(line.releaseBoard).toBeLessThanOrEqual(BOARD_COUNT)
      expect(line.targetBoard).toBeGreaterThanOrEqual(1)
      expect(line.targetBoard).toBeLessThanOrEqual(BOARD_COUNT)
    }
  })

  it('왼손도 자기 쪽 포켓으로 찾는다', () => {
    const lines = search({ ...LEFT_HAND_LINE })
    expect(lines.length).toBeGreaterThan(0)
    const mirrored = BOARD_COUNT + 1 - POCKET.board
    for (const line of lines.slice(0, 5)) {
      expect(Math.abs(line.entryBoard - mirrored)).toBeLessThan(POCKET.toleranceBoards)
    }
  })

  it('step을 키우면 후보가 줄지만 최고 라인은 비슷하다', () => {
    const fine = search()
    const coarse = searchLines(EXAMPLE_BALL, getPatternById('montreal'), baseRelease, { step: 3 })
    expect(coarse.length).toBeLessThan(fine.length)
    expect(coarse.length).toBeGreaterThan(0)
    expect(Math.abs(coarse[0].entryBoard - fine[0].entryBoard)).toBeLessThan(2)
  })

  it('limit을 넘지 않는다', () => {
    expect(searchLines(EXAMPLE_BALL, getPatternById('montreal'), baseRelease, { limit: 5 }))
      .toHaveLength(5)
  })

  it('패턴이 바뀌면 찾은 라인도 달라진다', () => {
    const montreal = search()[0]
    const long = search({}, 'long')[0]
    expect(long).toBeDefined()
    expect(
      montreal.releaseBoard !== long.releaseBoard || montreal.targetBoard !== long.targetBoard,
    ).toBe(true)
  })
})
