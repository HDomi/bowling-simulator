import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { createBall } from '@/domain/ball'
import {
  DB_NAME,
  deleteBall,
  loadBalls,
  loadPaint,
  MAX_BALLS,
  closeConnection,
  saveBalls,
  savePaint,
  type BallPaint,
} from '@/domain/ballRepository'
import type { Ball } from '@/domain/types'

/**
 * 이름만 다른 볼을 만든다.
 * @param {string} name - 볼 이름
 * @returns {Ball} 볼
 */
function ball(name: string): Ball {
  return createBall({ name })
}

/**
 * 테스트용 페인팅을 만든다.
 * @param {string} ballId - 볼 id
 * @returns {BallPaint} 페인팅
 */
function paint(ballId: string): BallPaint {
  return {
    ballId,
    fluid: new Blob(['fluid-bytes'], { type: 'image/webp' }),
    brush: new Blob(['brush-bytes'], { type: 'image/webp' }),
    baseColor: '#884422',
    updatedAt: 1,
  }
}

beforeEach(async () => {
  await closeConnection()
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => resolve()
    request.onblocked = () => resolve()
  })
})

describe('볼 저장·로드', () => {
  it('저장한 볼을 그대로 읽는다', async () => {
    const a = ball('첫 볼')
    const b = ball('둘째 볼')
    await saveBalls([a, b], b.id)

    const loaded = await loadBalls()
    expect(loaded.balls.map((item) => item.name).sort()).toEqual(['둘째 볼', '첫 볼'])
    expect(loaded.activeId).toBe(b.id)
  })

  it('비어 있으면 빈 목록을 준다', async () => {
    expect(await loadBalls()).toEqual({ balls: [], activeId: '' })
  })

  it('활성 id가 목록에 없으면 첫 볼로 떨어진다', async () => {
    const a = ball('하나')
    await saveBalls([a], 'ball-없는id')
    expect((await loadBalls()).activeId).toBe(a.id)
  })

  it('목록에서 빠진 볼은 저장소에서도 지운다', async () => {
    const a = ball('남을 볼')
    const b = ball('지울 볼')
    await saveBalls([a, b], a.id)
    await saveBalls([a], a.id)

    const loaded = await loadBalls()
    expect(loaded.balls).toHaveLength(1)
    expect(loaded.balls[0].id).toBe(a.id)
  })
})

describe('페인팅', () => {
  it('Blob을 그대로 저장하고 읽는다', async () => {
    const a = ball('칠한 볼')
    await saveBalls([a], a.id)
    await savePaint(paint(a.id))

    const loaded = await loadPaint(a.id)
    expect(loaded).not.toBeNull()
    expect(await loaded?.fluid.text()).toBe('fluid-bytes')
    expect(await loaded?.brush.text()).toBe('brush-bytes')
    expect(loaded?.baseColor).toBe('#884422')
  })

  it('없는 볼의 페인팅은 null이다', async () => {
    expect(await loadPaint('ball-없음')).toBeNull()
  })

  it('볼을 지우면 페인팅도 같이 지워진다', async () => {
    const a = ball('지울 볼')
    await saveBalls([a], a.id)
    await savePaint(paint(a.id))
    await deleteBall(a.id)

    expect(await loadPaint(a.id)).toBeNull()
    expect((await loadBalls()).balls).toHaveLength(0)
  })

  it('목록에서 빠진 볼의 페인팅도 고아로 남지 않는다', async () => {
    const a = ball('남을 볼')
    const b = ball('빠질 볼')
    await saveBalls([a, b], a.id)
    await savePaint(paint(b.id))

    await saveBalls([a], a.id)
    expect(await loadPaint(b.id)).toBeNull()
  })
})

describe('깨진 데이터 방어', () => {
  it('규격을 벗어난 레코드는 읽을 때 버린다', async () => {
    const good = ball('멀쩡한 볼')
    await saveBalls([good], good.id)

    // 저장소에 직접 이상한 레코드를 넣는다.
    const { openDB } = await import('idb')
    const db = await openDB(DB_NAME, 1)
    await db.put('balls', { id: 'ball-broken', name: '', rg: 99 } as never)
    db.close()
    await closeConnection()

    const loaded = await loadBalls()
    expect(loaded.balls.map((item) => item.id)).toEqual([good.id])
  })
})

describe('리액티브 객체 저장', () => {
  it('Proxy로 감싼 볼도 저장된다', async () => {
    // Vue reactive와 같은 형태의 Proxy. structured clone이 안 되는 값이다.
    const raw = ball('프록시 볼')
    const proxied = new Proxy(raw, {
      get: (target, key) => Reflect.get(target, key),
    })
    const ok = await saveBalls([proxied], proxied.id)
    expect(ok).toBe(true)

    const loaded = await loadBalls()
    expect(loaded.balls).toHaveLength(1)
    expect(loaded.balls[0].name).toBe('프록시 볼')
  })

  it('중첩된 layout·colors도 순수 객체로 저장된다', async () => {
    const raw = createBall({
      name: '레이아웃 볼',
      layout: { drillAngle: 45, pinToPap: 4.5, valAngle: 30 },
    })
    await saveBalls([raw], raw.id)
    const loaded = await loadBalls()
    expect(loaded.balls[0].layout).toEqual({
      drillAngle: 45,
      pinToPap: 4.5,
      valAngle: 30,
    })
  })
})

describe('개수 제한', () => {
  it('상수가 5다', () => {
    expect(MAX_BALLS).toBe(5)
  })
})
