import { BOARD_COUNT, LANE_LENGTH_FT } from '@/domain/constants'

export type KegelToken = `${number}L` | `${number}R`

export type KegelPass = {
  start: KegelToken
  stop: KegelToken
  distStart: number
  distEnd: number
  tOilUl: number
}

/**
 * Kegel 보드 표기(2L, 10R)를 시뮬레이터 보드 번호(1=오른쪽)로 변환한다.
 * @param {string} token - nL 또는 nR
 * @returns {number} 보드 번호 1~39
 */
export function parseKegelBoard(token: string): number {
  const n = Number.parseInt(token, 10)
  if (Number.isNaN(n)) {
    return 20
  }
  return token.endsWith('L') ? 40 - n : n
}

/**
 * 패스가 덮는 보드 번호 목록을 반환한다.
 * @param {KegelToken} start - 시작 보드
 * @param {KegelToken} stop - 끝 보드
 * @returns {number[]} 보드 번호
 */
export function boardsInPass(start: KegelToken, stop: KegelToken): number[] {
  const a = parseKegelBoard(start)
  const b = parseKegelBoard(stop)
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  const boards: number[] = []
  for (let board = lo; board <= hi; board += 1) {
    boards.push(board)
  }
  return boards
}

/**
 * Kegel 패스의 T.OIL(μL)을 보드×거리 격자에 균등 분배한다.
 * 0 로드(버프) 패스는 새 오일을 넣지 않는다.
 * @param {KegelPass[]} passes - Forward+Reverse 패스
 * @param {number} patternEndFt - 패턴 끝(ft). 이후는 0으로 남긴 뒤 끝단만 감쇠한다.
 * @returns {number[][]} 정규화 전 오일 격자
 */
export function depositKegelPasses(passes: KegelPass[], patternEndFt: number): number[][] {
  const rows = Math.ceil(LANE_LENGTH_FT) + 1
  const grid = Array.from({ length: rows }, () => Array.from({ length: BOARD_COUNT }, () => 0))

  for (const pass of passes) {
    if (pass.tOilUl <= 0) {
      continue
    }
    const boards = boardsInPass(pass.start, pass.stop)
    const minFt = Math.min(pass.distStart, pass.distEnd)
    const maxFt = Math.max(pass.distStart, pass.distEnd)
    const feet = Math.max(maxFt - minFt, 1e-6)
    const perCell = pass.tOilUl / (boards.length * feet)

    for (let ft = Math.floor(minFt); ft < Math.ceil(maxFt); ft += 1) {
      if (ft < 0 || ft >= rows) {
        continue
      }
      const overlap = Math.min(maxFt, ft + 1) - Math.max(minFt, ft)
      if (overlap <= 0) {
        continue
      }
      for (const board of boards) {
        if (board < 1 || board > BOARD_COUNT) {
          continue
        }
        grid[ft][board - 1] += perCell * overlap
      }
    }
  }

  const lastOilFt = Math.min(rows - 1, Math.floor(patternEndFt))
  const sourceFt = Math.max(0, lastOilFt - 5)
  for (let ft = sourceFt + 1; ft <= lastOilFt && ft < rows; ft += 1) {
    const taper = (patternEndFt - ft) / Math.max(patternEndFt - sourceFt, 1e-6)
    if (taper <= 0) {
      break
    }
    for (let board = 0; board < BOARD_COUNT; board += 1) {
      if (grid[ft][board] === 0 && grid[sourceFt][board] > 0) {
        grid[ft][board] = grid[sourceFt][board] * Math.max(0, taper)
      }
    }
  }

  return grid
}

/**
 * 보드 방향으로 가우시안 스무딩을 건다.
 *
 * 오일 머신은 브러시가 오일을 옆으로 끌고 나가기 때문에 패스 경계가 칼같이
 * 끊기지 않는다(시트의 buffer 항목). 균등 분배만 하면 단면이 계단이 되어
 * "몇 보드에 놓느냐"의 차이가 죽는다.
 *
 * 레인 밖으로 번진 몫은 버린다. 거터 쪽 오일이 자연히 얇아진다.
 *
 * @param {number[][]} grid - 격자
 * @param {number} sigma - 번지는 정도(보드 단위)
 * @returns {number[][]} 스무딩된 격자
 */
export function smoothBoards(grid: number[][], sigma: number): number[][] {
  if (sigma <= 0) {
    return grid
  }
  const radius = Math.max(1, Math.ceil(sigma * 3))
  const kernel: number[] = []
  let sum = 0
  for (let i = -radius; i <= radius; i += 1) {
    const weight = Math.exp(-(i * i) / (2 * sigma * sigma))
    kernel.push(weight)
    sum += weight
  }
  const norm = kernel.map((weight) => weight / sum)

  return grid.map((row) => {
    const out = new Array<number>(row.length).fill(0)
    for (let board = 0; board < row.length; board += 1) {
      let acc = 0
      for (let k = -radius; k <= radius; k += 1) {
        const index = board + k
        if (index < 0 || index >= row.length) {
          continue
        }
        acc += row[index] * norm[k + radius]
      }
      out[board] = acc
    }
    return out
  })
}

/**
 * 격자 최댓값으로 나눠 0~1 오일량으로 만든다.
 * @param {number[][]} grid - 원본 격자
 * @returns {number[][]} 정규화 격자
 */
export function normalizeOilGrid(grid: number[][]): number[][] {
  let max = 0
  for (const row of grid) {
    for (const value of row) {
      if (value > max) {
        max = value
      }
    }
  }
  if (max <= 0) {
    return grid
  }
  return grid.map((row) => row.map((value) => value / max))
}

/**
 * 보드별 총 오일량(정규화 전)을 합산한다.
 * @param {number[][]} grid - 격자
 * @param {number} board - 보드 번호 1~39
 * @returns {number} 합
 */
export function boardOilTotal(grid: number[][], board: number): number {
  const index = board - 1
  let total = 0
  for (const row of grid) {
    total += row[index] ?? 0
  }
  return total
}
