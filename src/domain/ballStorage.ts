import { EXAMPLE_BALL, validateBall } from '@/domain/ball'
import type { Ball } from '@/domain/types'

export const BALL_STORAGE_KEY = 'bowling-sim.balls'
export const BALL_STORAGE_VERSION = 1

export type BallStorePayload = {
  version: number
  activeId: string
  balls: Ball[]
}

/** localStorage와 같은 최소 인터페이스. 테스트에서 가짜를 넣는다. */
export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/**
 * 브라우저 localStorage를 돌려준다. 없거나 접근이 막혀 있으면 null이다.
 * @returns {KeyValueStorage | null} 저장소
 */
export function browserStorage(): KeyValueStorage | null {
  try {
    const storage = globalThis.localStorage
    if (!storage) {
      return null
    }
    // 사파리 프라이빗 모드 등에서 접근 자체가 throw 할 수 있어 한 번 만져본다.
    const probe = `${BALL_STORAGE_KEY}.probe`
    storage.setItem(probe, '1')
    storage.removeItem(probe)
    return storage
  } catch {
    return null
  }
}

/**
 * 저장 페이로드를 검사·정리한다. 깨진 볼은 버리고, 하나도 안 남으면 null이다.
 * @param {unknown} raw - JSON.parse 결과
 * @returns {BallStorePayload | null} 정리된 페이로드
 */
export function sanitizePayload(raw: unknown): BallStorePayload | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const data = raw as Partial<BallStorePayload>
  if (data.version !== BALL_STORAGE_VERSION || !Array.isArray(data.balls)) {
    return null
  }
  const seen = new Set<string>()
  const balls: Ball[] = []
  for (const item of data.balls) {
    if (!item || typeof item !== 'object') {
      continue
    }
    const ball = item as Ball
    if (typeof ball.id !== 'string' || ball.id.length === 0 || seen.has(ball.id)) {
      continue
    }
    if (validateBall(ball).length > 0) {
      continue
    }
    seen.add(ball.id)
    balls.push({
      id: ball.id,
      name: ball.name.trim(),
      weightLb: ball.weightLb,
      rg: ball.rg,
      diff: ball.diff,
      intDiff: ball.intDiff,
      cover: ball.cover,
      grit: ball.grit,
      pinToCg: ball.pinToCg,
      layout: ball.layout
        ? {
            drillAngle: ball.layout.drillAngle,
            pinToPap: ball.layout.pinToPap,
            valAngle: ball.layout.valAngle,
          }
        : undefined,
      colors: [ball.colors[0], ball.colors[1]],
    })
  }
  if (balls.length === 0) {
    return null
  }
  const activeId =
    typeof data.activeId === 'string' && seen.has(data.activeId) ? data.activeId : balls[0].id
  return { version: BALL_STORAGE_VERSION, activeId, balls }
}

/**
 * 저장소에서 볼 목록을 읽는다. 없거나 깨졌으면 예시 볼 하나로 시작한다.
 * @param {KeyValueStorage | null} storage - 저장소
 * @returns {BallStorePayload} 페이로드
 */
export function loadBalls(storage: KeyValueStorage | null): BallStorePayload {
  const fallback: BallStorePayload = {
    version: BALL_STORAGE_VERSION,
    activeId: EXAMPLE_BALL.id,
    balls: [{ ...EXAMPLE_BALL, colors: [...EXAMPLE_BALL.colors] }],
  }
  if (!storage) {
    return fallback
  }
  try {
    const text = storage.getItem(BALL_STORAGE_KEY)
    if (!text) {
      return fallback
    }
    return sanitizePayload(JSON.parse(text)) ?? fallback
  } catch {
    return fallback
  }
}

/**
 * 볼 목록을 저장한다. 실패(용량 초과 등)는 조용히 넘기고 false를 돌려준다.
 * @param {KeyValueStorage | null} storage - 저장소
 * @param {BallStorePayload} payload - 페이로드
 * @returns {boolean} 저장 성공 여부
 */
export function saveBalls(storage: KeyValueStorage | null, payload: BallStorePayload): boolean {
  if (!storage) {
    return false
  }
  try {
    storage.setItem(
      BALL_STORAGE_KEY,
      JSON.stringify({ ...payload, version: BALL_STORAGE_VERSION }),
    )
    return true
  } catch {
    return false
  }
}
