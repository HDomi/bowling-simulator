import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { sanitizeBall } from '@/domain/ballStorage'
import type { Ball } from '@/domain/types'

export const DB_NAME = 'bowling-sim'
export const DB_VERSION = 1

/** 마이볼 최대 개수. 목록이 길어지면 고르기 어렵고 비교 궤적도 의미를 잃는다. */
export const MAX_BALLS = 5

/**
 * 볼에 붙는 페인팅. 유체와 브러시를 따로 둬서 재편집할 수 있다.
 */
export type BallPaint = {
  ballId: string
  /** 유체 레이어. RGB WebP. */
  fluid: Blob
  /** 브러시 레이어. RGBA WebP. 대부분 투명하다. */
  brush: Blob
  /** 유체를 시작한 배경색. */
  baseColor: string
  updatedAt: number
}

interface BowlingDB extends DBSchema {
  balls: {
    key: string
    value: Ball
  }
  paints: {
    key: string
    value: BallPaint
  }
  meta: {
    key: string
    value: { key: string; value: string }
  }
}

const ACTIVE_ID_KEY = 'activeId'

let dbPromise: Promise<IDBPDatabase<BowlingDB>> | null = null

/**
 * DB를 열고(필요하면 만들고) 연결을 재사용한다.
 * @returns {Promise<IDBPDatabase<BowlingDB>>} 연결
 */
function db(): Promise<IDBPDatabase<BowlingDB>> {
  if (!dbPromise) {
    dbPromise = openDB<BowlingDB>(DB_NAME, DB_VERSION, {
      upgrade(instance) {
        if (!instance.objectStoreNames.contains('balls')) {
          instance.createObjectStore('balls', { keyPath: 'id' })
        }
        if (!instance.objectStoreNames.contains('paints')) {
          instance.createObjectStore('paints', { keyPath: 'ballId' })
        }
        if (!instance.objectStoreNames.contains('meta')) {
          instance.createObjectStore('meta', { keyPath: 'key' })
        }
      },
    })
  }
  return dbPromise
}

/**
 * 열려 있는 연결을 닫는다. 닫지 않으면 `deleteDatabase`가 막힌다.
 */
export async function closeConnection(): Promise<void> {
  if (!dbPromise) {
    return
  }
  const instance = await dbPromise.catch(() => null)
  instance?.close()
  dbPromise = null
}

export type LoadedBalls = {
  balls: Ball[]
  activeId: string
}

/**
 * 볼 목록과 활성 id를 읽는다. 깨진 레코드는 버린다.
 *
 * 페인팅 Blob은 읽지 않는다. 목록만 그릴 때 수백 KB를 들고 올 이유가 없다.
 *
 * @returns {Promise<LoadedBalls>} 볼 목록
 */
export async function loadBalls(): Promise<LoadedBalls> {
  try {
    const instance = await db()
    const raw = await instance.getAll('balls')
    const balls: Ball[] = []
    const seen = new Set<string>()
    for (const item of raw) {
      const ball = sanitizeBall(item)
      if (ball && !seen.has(ball.id)) {
        seen.add(ball.id)
        balls.push(ball)
      }
    }
    const stored = await instance.get('meta', ACTIVE_ID_KEY)
    const activeId =
      stored && seen.has(stored.value) ? stored.value : (balls[0]?.id ?? '')
    return { balls, activeId }
  } catch {
    return { balls: [], activeId: '' }
  }
}

/**
 * 볼 하나를 저장한다.
 * @param {Ball} ball - 볼
 * @returns {Promise<boolean>} 성공 여부
 */
export async function putBall(ball: Ball): Promise<boolean> {
  try {
    await (await db()).put('balls', ball)
    return true
  } catch {
    return false
  }
}

/**
 * 볼 목록 전체를 저장소와 맞춘다. 목록에 없는 볼과 그 페인팅은 지운다.
 * @param {Ball[]} balls - 볼 목록
 * @param {string} activeId - 활성 볼 id
 * @returns {Promise<boolean>} 성공 여부
 */
export async function saveBalls(balls: Ball[], activeId: string): Promise<boolean> {
  try {
    const instance = await db()
    const tx = instance.transaction(['balls', 'paints', 'meta'], 'readwrite')
    const ballStore = tx.objectStore('balls')
    const paintStore = tx.objectStore('paints')

    const keep = new Set(balls.map((ball) => ball.id))
    for (const key of await ballStore.getAllKeys()) {
      if (!keep.has(key)) {
        await ballStore.delete(key)
        // 볼과 페인팅을 한 트랜잭션에서 지운다. 따로 하면 고아가 남는다.
        await paintStore.delete(key)
      }
    }
    for (const ball of balls) {
      await ballStore.put(ball)
    }
    await tx.objectStore('meta').put({ key: ACTIVE_ID_KEY, value: activeId })
    await tx.done
    return true
  } catch {
    return false
  }
}

/**
 * 볼 하나와 그 페인팅을 지운다.
 * @param {string} id - 볼 id
 * @returns {Promise<boolean>} 성공 여부
 */
export async function deleteBall(id: string): Promise<boolean> {
  try {
    const instance = await db()
    const tx = instance.transaction(['balls', 'paints'], 'readwrite')
    await tx.objectStore('balls').delete(id)
    await tx.objectStore('paints').delete(id)
    await tx.done
    return true
  } catch {
    return false
  }
}

/**
 * 볼의 페인팅을 읽는다.
 * @param {string} ballId - 볼 id
 * @returns {Promise<BallPaint | null>} 페인팅
 */
export async function loadPaint(ballId: string): Promise<BallPaint | null> {
  try {
    return (await (await db()).get('paints', ballId)) ?? null
  } catch {
    return null
  }
}

/**
 * 볼의 페인팅을 저장한다.
 * @param {BallPaint} paint - 페인팅
 * @returns {Promise<boolean>} 성공 여부
 */
export async function savePaint(paint: BallPaint): Promise<boolean> {
  try {
    await (await db()).put('paints', paint)
    return true
  } catch {
    return false
  }
}

/**
 * 볼의 페인팅을 지운다.
 * @param {string} ballId - 볼 id
 * @returns {Promise<boolean>} 성공 여부
 */
export async function deletePaint(ballId: string): Promise<boolean> {
  try {
    await (await db()).delete('paints', ballId)
    return true
  } catch {
    return false
  }
}

/**
 * 저장소를 영구 등급으로 올려 달라고 요청한다.
 *
 * 브라우저는 공간이 부족하면 IndexedDB를 통째로 비울 수 있다. 거절돼도 동작은 하지만
 * 사용자에게 알릴 수 있도록 결과를 돌려준다.
 *
 * @returns {Promise<boolean>} 영구 등급 여부
 */
export async function requestPersistence(): Promise<boolean> {
  try {
    const storage = navigator.storage
    if (!storage?.persist) {
      return false
    }
    if (await storage.persisted()) {
      return true
    }
    return await storage.persist()
  } catch {
    return false
  }
}
