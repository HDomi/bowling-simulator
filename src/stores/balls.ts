import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { BALL_LIMITS, createBall, createBallId, EXAMPLE_BALL, effectiveBall } from '@/domain/ball'
import { EXAGGERATION } from '@/domain/ballGeometry'
import {
  deletePaint,
  loadBalls,
  loadPaint,
  MAX_BALLS,
  requestPersistence,
  saveBalls,
  savePaint,
  type BallPaint,
} from '@/domain/ballRepository'
import type { Ball } from '@/domain/types'

/**
 * 마이볼 목록. IndexedDB에 저장하고, 활성 볼과 비교용 이전 볼을 기억한다.
 *
 * IndexedDB는 비동기라 초기값이 비어 있다. `ready`가 true가 되기 전에는
 * 화면을 그리지 않아야 볼 등록 화면이 깜빡 스치지 않는다.
 */
export const useBallsStore = defineStore('balls', () => {
  const balls = ref<Ball[]>([])
  const activeId = ref('')
  /** 저장소에서 첫 로드가 끝났는지. */
  const ready = ref(false)
  /** 저장소가 영구 등급인지. 아니면 브라우저가 비울 수 있다. */
  const persisted = ref(false)
  /** 로드가 끝나기 전에는 저장하지 않는다. 빈 목록으로 덮어쓰면 안 된다. */
  let hydrated = false
  /** 직전에 쓰던 볼. 궤적 비교(고스트)에 쓴다. */
  const compareId = ref<string | null>(null)
  /** 관성 타원체 과장 지수. 저장하지 않는다. */
  const exaggeration = ref<number>(EXAGGERATION.default)
  /** 모바일에서 마이볼 시트가 열려 있는지. */
  const sheetOpen = ref(false)
  /** 편집 중인 볼 id. 'new'면 새 볼, null이면 닫힘. */
  const editingId = ref<string | 'new' | null>(null)
  /** 페인팅 에디터를 연 볼 id. null이면 닫힘. */
  const paintingId = ref<string | null>(null)

  const activeBall = computed(
    () => balls.value.find((ball) => ball.id === activeId.value) ?? balls.value[0] ?? EXAMPLE_BALL,
  )
  const hasBalls = computed(() => balls.value.length > 0)
  const compareBall = computed(() => {
    if (!compareId.value || compareId.value === activeId.value) {
      return null
    }
    return balls.value.find((ball) => ball.id === compareId.value) ?? null
  })
  /** 시뮬레이션에 넘기는 볼. 무게에 맞춰 RG·Diff가 바뀐 상태다. */
  const simBall = computed(() => effectiveBall(activeBall.value))
  const simCompareBall = computed(() =>
    compareBall.value ? effectiveBall(compareBall.value) : null,
  )
  const editingBall = computed(() =>
    editingId.value && editingId.value !== 'new'
      ? balls.value.find((ball) => ball.id === editingId.value) ?? null
      : null,
  )

  void (async () => {
    const loaded = await loadBalls()
    balls.value = loaded.balls
    activeId.value = loaded.activeId
    hydrated = true
    ready.value = true
    persisted.value = await requestPersistence()
  })()

  watch(
    [balls, activeId],
    () => {
      if (!hydrated) {
        return
      }
      void saveBalls(balls.value, activeId.value)
    },
    { deep: true },
  )

  /** 볼을 더 만들 수 있는지. */
  const canAddBall = computed(() => balls.value.length < MAX_BALLS)

  const paintingBall = computed(() =>
    paintingId.value ? (balls.value.find((ball) => ball.id === paintingId.value) ?? null) : null,
  )

  /**
   * 페인팅 에디터를 연다.
   * @param {string} id - 볼 id
   */
  function openPaint(id: string): void {
    if (balls.value.some((ball) => ball.id === id)) {
      paintingId.value = id
    }
  }

  /**
   * 페인팅 에디터를 닫는다.
   */
  function closePaint(): void {
    paintingId.value = null
  }

  /**
   * 페인팅을 저장하고 그 볼을 활성으로 만든다.
   * @param {BallPaint} paint - 페인팅
   * @returns {Promise<boolean>} 성공 여부
   */
  async function storePaint(paint: BallPaint): Promise<boolean> {
    const ok = await savePaint(paint)
    if (!ok) {
      return false
    }
    const target = balls.value.find((ball) => ball.id === paint.ballId)
    if (target && !target.hasPaint) {
      // hasPaint가 바뀌면 watch가 볼 목록을 다시 저장한다.
      updateBall({ ...target, hasPaint: true })
    }
    if (activeId.value !== paint.ballId) {
      selectBall(paint.ballId)
    }
    return true
  }

  /**
   * 페인팅을 지운다. 볼은 다시 절차적 텍스처로 돌아간다.
   * @param {string} ballId - 볼 id
   */
  async function removePaint(ballId: string): Promise<void> {
    await deletePaint(ballId)
    const target = balls.value.find((ball) => ball.id === ballId)
    if (target?.hasPaint) {
      updateBall({ ...target, hasPaint: undefined })
    }
  }

  /**
   * 활성 볼을 바꾼다. 직전 볼은 비교 대상으로 남긴다.
   * @param {string} id - 볼 id
   */
  function selectBall(id: string): void {
    if (id === activeId.value || !balls.value.some((ball) => ball.id === id)) {
      return
    }
    compareId.value = activeId.value
    activeId.value = id
  }

  /**
   * 비교용 고스트 궤적을 끈다.
   */
  function clearCompare(): void {
    compareId.value = null
  }

  /**
   * 볼을 추가하고 활성으로 만든다.
   * @param {Omit<Ball, 'id'>} draft - 볼 내용
   * @returns {Ball} 저장된 볼
   */
  function addBall(draft: Omit<Ball, 'id'>): Ball | null {
    if (balls.value.length >= MAX_BALLS) {
      return null
    }
    const ball = createBall(draft)
    balls.value = [...balls.value, ball]
    selectBall(ball.id)
    return ball
  }

  /**
   * 볼을 덮어쓴다. id는 유지된다.
   * @param {Ball} next - 바뀐 볼
   */
  function updateBall(next: Ball): void {
    balls.value = balls.value.map((ball) => (ball.id === next.id ? { ...next } : ball))
  }

  /**
   * 볼을 복제해 활성으로 만든다.
   * @param {string} id - 원본 id
   */
  function duplicateBall(id: string): void {
    const source = balls.value.find((ball) => ball.id === id)
    if (!source) {
      return
    }
    const copy: Ball = { ...source, id: createBallId(), name: `${source.name} 복사`, colors: [...source.colors] }
    balls.value = [...balls.value, copy]
    selectBall(copy.id)
  }

  /**
   * 볼을 지운다. 마지막 볼을 지우면 첫 볼 설정으로 돌아간다.
   * @param {string} id - 볼 id
   */
  function removeBall(id: string): void {
    const remaining = balls.value.filter((ball) => ball.id !== id)
    balls.value = remaining
    if (compareId.value === id) {
      compareId.value = null
    }
    if (activeId.value === id) {
      activeId.value = remaining[0]?.id ?? ''
    }
  }

  /**
   * 활성 볼의 무게만 바꾼다. 15 lb 기준 스펙은 그대로고 실효 스펙이 따라 바뀐다.
   * @param {number} weightLb - 무게(lb)
   */
  function setActiveWeight(weightLb: number): void {
    const clamped = Math.min(BALL_LIMITS.weightLb.max, Math.max(BALL_LIMITS.weightLb.min, Math.round(weightLb)))
    const current = activeBall.value
    if (current.weightLb === clamped) {
      return
    }
    updateBall({ ...current, weightLb: clamped })
  }

  /**
   * 타원체 과장 지수를 바꾼다.
   * @param {number} value - 과장 지수
   */
  function setExaggeration(value: number): void {
    exaggeration.value = Math.min(EXAGGERATION.max, Math.max(EXAGGERATION.min, value))
  }

  /**
   * 편집 다이얼로그를 연다.
   * @param {string | 'new'} id - 볼 id 또는 'new'
   */
  function openEditor(id: string | 'new'): void {
    editingId.value = id
  }

  /**
   * 편집 다이얼로그를 닫는다.
   */
  function closeEditor(): void {
    editingId.value = null
  }

  /**
   * 모바일 마이볼 시트를 토글한다.
   * @param {boolean} [open] - 지정하면 그 값으로
   */
  function toggleSheet(open?: boolean): void {
    sheetOpen.value = open ?? !sheetOpen.value
  }

  return {
    balls,
    hasBalls,
    activeId,
    compareId,
    exaggeration,
    ready,
    persisted,
    canAddBall,
    sheetOpen,
    editingId,
    paintingId,
    paintingBall,
    activeBall,
    compareBall,
    simBall,
    simCompareBall,
    editingBall,
    selectBall,
    clearCompare,
    addBall,
    updateBall,
    duplicateBall,
    removeBall,
    setActiveWeight,
    setExaggeration,
    openEditor,
    closeEditor,
    openPaint,
    closePaint,
    storePaint,
    removePaint,
    loadPaint,
    toggleSheet,
  }
})
