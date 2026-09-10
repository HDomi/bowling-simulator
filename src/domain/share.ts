import { BALL_LIMITS } from '@/domain/ball'
import { PATTERN_LIMITS } from '@/domain/patterns/presets'
import type { Ball, CoverType, Grit } from '@/domain/types'

/** URL 파라미터 이름. */
export const SHARE_PARAM = 's'

/**
 * 공유 링크에 담는 상태.
 *
 * 키를 한 글자로 줄인다. URL이 길면 메신저에서 잘린다.
 */
export type SharedState = {
  /** 볼 */
  b: {
    n: string
    w: number
    rg: number
    df: number
    cv: CoverType
    gr: Grit
    c0: string
    c1: string
    pc?: number
  }
  /** 패턴. id가 custom이면 d·v·r을 쓴다. */
  p: {
    id: string
    d?: number
    v?: number
    r?: number
  }
  /** 릴리즈 */
  r: {
    s: number
    rv: number
    ar: number
    at: number
    rb: number
    tb: number
    h: 'right' | 'left'
  }
}

/**
 * UTF-8 문자열을 URL에 넣을 수 있는 base64로 바꾼다.
 * @param {string} text - 원문
 * @returns {string} base64url
 */
export function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * base64url을 원래 문자열로 되돌린다.
 * @param {string} encoded - base64url
 * @returns {string} 원문
 */
export function fromBase64Url(encoded: string): string {
  const padded = encoded.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='))
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/**
 * 공유 상태를 URL 파라미터 값으로 만든다.
 * @param {SharedState} state - 공유 상태
 * @returns {string} 인코딩 문자열
 */
export function encodeShare(state: SharedState): string {
  return toBase64Url(JSON.stringify(state))
}

/**
 * 수가 범위 안에 드는지 본다.
 * @param {unknown} value - 값
 * @param {number} min - 하한
 * @param {number} max - 상한
 * @returns {boolean} 유효 여부
 */
function inRange(value: unknown, min: number, max: number): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}

/**
 * URL 파라미터를 공유 상태로 되돌린다.
 *
 * 남이 만든 링크를 그대로 믿지 않는다. 값이 범위를 벗어나면 통째로 버린다.
 *
 * @param {string} encoded - 인코딩 문자열
 * @returns {SharedState | null} 공유 상태. 못 읽으면 null
 */
export function decodeShare(encoded: string): SharedState | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(fromBase64Url(encoded))
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return null
  }

  const { b, p, r } = parsed as Partial<SharedState>
  if (!b || !p || !r) {
    return null
  }
  if (
    !inRange(b.w, BALL_LIMITS.weightLb.min, BALL_LIMITS.weightLb.max) ||
    !inRange(b.rg, BALL_LIMITS.rg.min, BALL_LIMITS.rg.max) ||
    !inRange(b.df, BALL_LIMITS.diff.min, BALL_LIMITS.diff.max)
  ) {
    return null
  }
  if (!inRange(r.rb, 1, 39) || !inRange(r.tb, 1, 39)) {
    return null
  }
  if (r.h !== 'right' && r.h !== 'left') {
    return null
  }
  if (typeof p.id !== 'string') {
    return null
  }
  if (
    p.id === 'custom' &&
    (!inRange(p.d, PATTERN_LIMITS.distanceFt.min, PATTERN_LIMITS.distanceFt.max) ||
      !inRange(p.v, PATTERN_LIMITS.volume.min, PATTERN_LIMITS.volume.max) ||
      !inRange(p.r, PATTERN_LIMITS.ratio.min, PATTERN_LIMITS.ratio.max))
  ) {
    return null
  }

  return parsed as SharedState
}

/**
 * 볼을 공유 상태의 볼 부분으로 줄인다.
 * @param {Ball} ball - 볼
 * @returns {SharedState['b']} 공유용 볼
 */
export function packBall(ball: Ball): SharedState['b'] {
  return {
    n: ball.name.slice(0, 24),
    w: ball.weightLb,
    rg: ball.rg,
    df: ball.diff,
    cv: ball.cover,
    gr: ball.grit,
    c0: ball.colors[0],
    c1: ball.colors[1],
    pc: ball.pinToCg,
  }
}
