import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { BALL_LIMITS, createBall, createBallId, EXAMPLE_BALL, effectiveBall } from '@/domain/ball'
import { EXAGGERATION } from '@/domain/ballGeometry'
import { browserStorage, loadBalls, saveBalls } from '@/domain/ballStorage'
import type { Ball } from '@/domain/types'

/**
 * 마이볼 목록. localStorage에 저장하고, 활성 볼과 비교용 이전 볼을 기억한다.
 */
export const useBallsStore = defineStore('balls', () => {
  const storage = browserStorage()
  const loaded = loadBalls(storage)

  const balls = ref<Ball[]>(loaded.balls)
  const activeId = ref(loaded.activeId)
  /** 직전에 쓰던 볼. 궤적 비교(고스트)에 쓴다. */
  const compareId = ref<string | null>(null)
  /** 관성 타원체 과장 지수. 저장하지 않는다. */
  const exaggeration = ref<number>(EXAGGERATION.default)
  /** 모바일에서 마이볼 시트가 열려 있는지. */
  const sheetOpen = ref(false)
  /** 편집 중인 볼 id. 'new'면 새 볼, null이면 닫힘. */
  const editingId = ref<string | 'new' | null>(null)

  const activeBall = computed(
    () => balls.value.find((ball) => ball.id === activeId.value) ?? balls.value[0],
  )
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

  watch(
    [balls, activeId],
    () => {
      saveBalls(storage, {
        version: loaded.version,
        activeId: activeId.value,
        balls: balls.value,
      })
    },
    { deep: true },
  )

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
  function addBall(draft: Omit<Ball, 'id'>): Ball {
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
   * 볼을 지운다. 마지막 볼을 지우면 예시 볼로 되돌린다.
   * @param {string} id - 볼 id
   */
  function removeBall(id: string): void {
    const remaining = balls.value.filter((ball) => ball.id !== id)
    if (remaining.length === 0) {
      remaining.push({ ...EXAMPLE_BALL, colors: [...EXAMPLE_BALL.colors] })
    }
    balls.value = remaining
    if (compareId.value === id) {
      compareId.value = null
    }
    if (activeId.value === id) {
      activeId.value = remaining[0].id
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
    activeId,
    compareId,
    exaggeration,
    sheetOpen,
    editingId,
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
    toggleSheet,
  }
})
