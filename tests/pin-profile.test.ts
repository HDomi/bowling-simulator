import { describe, expect, it } from 'vitest'
import { IN, PIN_HEIGHT, PIN_MASS } from '@/domain/constants'
import { pinRadiusAt, PIN_STATIONS } from '@/domain/pins/profile'
import { createPinGeometry } from '@/scene/createPinMesh'
import { PinDeckPhysics } from '@/scene/PinDeckPhysics'

describe('공식 핀 곡면', () => {
  it('USBC 높이별 목표 지름을 통과한다', () => {
    for (const [height, diameter] of PIN_STATIONS) {
      expect(pinRadiusAt(height * IN) * 2 / IN).toBeCloseTo(diameter, 6)
    }
  })
  it('높이 15인치, 머리 원호 반경 1.273인치를 유지한다', () => {
    expect(pinRadiusAt(PIN_HEIGHT)).toBeCloseTo(0, 7)
    for (const y of [14, 14.5, 14.9]) {
      expect((pinRadiusAt(y * IN) / IN) ** 2 + (y - (15 - 1.273)) ** 2).toBeCloseTo(1.273 ** 2, 6)
    }
  })
  it('빨간 재질은 목띠 두 영역에만 배정한다', () => {
    const geometry = createPinGeometry()
    const index = geometry.getIndex()!
    const positions = geometry.getAttribute('position')
    const red = geometry.groups.find(g => g.materialIndex === 1)!
    const bands = new Set<number>()
    for (let i = red.start; i < red.start + red.count; i += 3) {
      const y = (positions.getY(index.getX(i)) + positions.getY(index.getX(i + 1)) + positions.getY(index.getX(i + 2))) / (3 * IN)
      expect((y >= 10.05 - 1e-5 && y <= 10.4 + 1e-5) || (y >= 10.65 - 1e-5 && y <= 11 + 1e-5)).toBe(true)
      bands.add(y < 10.5 ? 0 : 1)
    }
    expect(bands.size).toBe(2)
    geometry.dispose()
  })
  it('공 없이 핀 10개가 서 있고 복합 충돌체 총 질량이 유지된다', async () => {
    const deck = new PinDeckPhysics()
    await deck.init()
    try {
      for (let i = 0; i < 300; i += 1) deck.step(1 / 60)
      expect(deck.pinsDown()).toEqual([])
      let count = 0
      deck.world!.forEachRigidBody(body => {
        if (body.isDynamic()) {
          count += 1
          expect(body.mass()).toBeCloseTo(PIN_MASS, 4)
          expect(body.numColliders()).toBeGreaterThan(1)
        }
      })
      expect(count).toBe(10)
    } finally { deck.dispose() }
  })
})
