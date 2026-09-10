import { describe, expect, it } from 'vitest'
import { BRUSH_RADIUS, latitudeScale, PAINT_HEIGHT, PAINT_WIDTH } from '@/domain/paintTexture'

describe('위도 보정', () => {
  it('적도에서는 보정이 없다', () => {
    expect(latitudeScale(0.5)).toBeCloseTo(1, 5)
  })

  it('극으로 갈수록 가로로 늘린다', () => {
    expect(latitudeScale(0.25)).toBeGreaterThan(1)
    expect(latitudeScale(0.05)).toBeGreaterThan(latitudeScale(0.25))
  })

  it('극에서 무한대로 튀지 않는다', () => {
    expect(latitudeScale(0)).toBe(4)
    expect(latitudeScale(1)).toBe(4)
  })

  it('위아래가 대칭이다', () => {
    expect(latitudeScale(0.2)).toBeCloseTo(latitudeScale(0.8), 6)
  })
})

describe('상수', () => {
  it('텍스처가 2:1이다 — equirectangular 매핑', () => {
    expect(PAINT_WIDTH).toBe(PAINT_HEIGHT * 2)
  })

  it('브러시 기본값이 범위 안이다', () => {
    expect(BRUSH_RADIUS.default).toBeGreaterThanOrEqual(BRUSH_RADIUS.min)
    expect(BRUSH_RADIUS.default).toBeLessThanOrEqual(BRUSH_RADIUS.max)
  })
})
