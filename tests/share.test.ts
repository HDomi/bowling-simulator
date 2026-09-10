import { describe, expect, it } from 'vitest'
import { EXAMPLE_BALL } from '@/domain/ball'
import {
  decodeShare,
  encodeShare,
  fromBase64Url,
  packBall,
  toBase64Url,
  type SharedState,
} from '@/domain/share'

/**
 * 유효한 공유 상태를 만든다.
 * @returns {SharedState} 공유 상태
 */
function sample(): SharedState {
  return {
    b: packBall(EXAMPLE_BALL),
    p: { id: 'montreal' },
    r: { s: 17, rv: 275, ar: 55, at: 13, rb: 18, tb: 13, h: 'right' },
  }
}

describe('base64url', () => {
  it('한글이 든 문자열도 왕복한다', () => {
    const text = '나의 첫 번째 볼 · WB Montreal 41\''
    expect(fromBase64Url(toBase64Url(text))).toBe(text)
  })

  it('URL에 쓸 수 없는 문자를 만들지 않는다', () => {
    const encoded = toBase64Url('가'.repeat(50))
    expect(encoded).not.toMatch(/[+/=]/)
  })
})

describe('공유 상태 왕복', () => {
  it('인코딩하고 되읽으면 같다', () => {
    const state = sample()
    expect(decodeShare(encodeShare(state))).toEqual(state)
  })

  it('직접 조절 패턴도 왕복한다', () => {
    const state: SharedState = { ...sample(), p: { id: 'custom', d: 42, v: 1.1, r: 4 } }
    expect(decodeShare(encodeShare(state))).toEqual(state)
  })

  it('링크가 메신저에서 잘리지 않을 길이다', () => {
    expect(encodeShare(sample()).length).toBeLessThan(400)
  })
})

describe('잘못된 입력 방어', () => {
  it('아무 문자열이나 넣으면 null이다', () => {
    expect(decodeShare('!!!not-base64!!!')).toBeNull()
    expect(decodeShare('')).toBeNull()
  })

  it('JSON이 아니면 null이다', () => {
    expect(decodeShare(toBase64Url('hello'))).toBeNull()
  })

  it('필드가 빠지면 null이다', () => {
    expect(decodeShare(toBase64Url(JSON.stringify({ b: {}, p: {} })))).toBeNull()
  })

  it('무게가 범위를 벗어나면 null이다', () => {
    const bad = sample()
    bad.b.w = 99
    expect(decodeShare(encodeShare(bad))).toBeNull()
  })

  it('RG가 범위를 벗어나면 null이다', () => {
    const bad = sample()
    bad.b.rg = 9
    expect(decodeShare(encodeShare(bad))).toBeNull()
  })

  it('보드 번호가 범위를 벗어나면 null이다', () => {
    const bad = sample()
    bad.r.rb = 100
    expect(decodeShare(encodeShare(bad))).toBeNull()
  })

  it('손 값이 이상하면 null이다', () => {
    const bad = sample()
    ;(bad.r as { h: string }).h = 'both'
    expect(decodeShare(encodeShare(bad))).toBeNull()
  })

  it('직접 조절인데 슬라이더 값이 범위 밖이면 null이다', () => {
    const bad: SharedState = { ...sample(), p: { id: 'custom', d: 200, v: 1, r: 4 } }
    expect(decodeShare(encodeShare(bad))).toBeNull()
  })
})

describe('볼 압축', () => {
  it('이름을 24자로 자른다', () => {
    const packed = packBall({ ...EXAMPLE_BALL, name: 'ㄱ'.repeat(60) })
    expect(packed.n.length).toBe(24)
  })

  it('시뮬에 필요한 값을 모두 담는다', () => {
    const packed = packBall(EXAMPLE_BALL)
    expect(packed.rg).toBe(EXAMPLE_BALL.rg)
    expect(packed.df).toBe(EXAMPLE_BALL.diff)
    expect(packed.cv).toBe(EXAMPLE_BALL.cover)
    expect(packed.gr).toBe(EXAMPLE_BALL.grit)
    expect(packed.w).toBe(EXAMPLE_BALL.weightLb)
  })
})
