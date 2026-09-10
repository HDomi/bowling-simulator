import { COVER_MU, GRIT_RA } from '@/domain/constants'
import type { Ball, CoverType, Grit, Layout } from '@/domain/types'

/**
 * 볼 스펙(RG·Diff·Int.Diff)은 제조사 카탈로그 관례대로 15 lb 기준값이다.
 * 다른 무게의 실효 스펙은 {@link specAtWeight}로 구한다.
 */
export const SPEC_REFERENCE_WEIGHT_LB = 15

export const EXAMPLE_BALL: Ball = {
  id: 'demo-gb4',
  name: 'Demo Ruby/Smoke',
  weightLb: 15,
  rg: 2.48,
  diff: 0.048,
  cover: 'reactive-solid',
  grit: 1000,
  pinToCg: 2.5,
  colors: ['#b0121d', '#4b4753'],
}

/** 폼 입력 범위. 기획 §4.1. */
export const BALL_LIMITS = {
  weightLb: { min: 10, max: 16, step: 1 },
  rg: { min: 2.4, max: 2.8, step: 0.001 },
  diff: { min: 0, max: 0.08, step: 0.001 },
  intDiff: { min: 0, max: 0.03, step: 0.001 },
  pinToCg: { min: 0, max: 5, step: 0.25 },
  drillAngle: { min: 0, max: 90, step: 5 },
  pinToPap: { min: 0, max: 6.75, step: 0.125 },
  valAngle: { min: 0, max: 90, step: 5 },
  nameLength: 24,
} as const

/** USBC 장비 규정. 이 밖이면 경기용으로 쓸 수 없다. */
export const USBC_SPEC = {
  rgMin: 2.46,
  rgMax: 2.8,
  diffMax: 0.06,
  intDiffMax: 0.03,
  weightMaxLb: 16,
} as const

export const PIN_TO_CG_PRESETS = [0, 1, 2, 2.5, 3, 4, 5] as const

export const COVER_OPTIONS: { id: CoverType; label: string }[] = [
  { id: 'polyester', label: '폴리에스터' },
  { id: 'urethane', label: '우레탄' },
  { id: 'reactive-pearl', label: '리액티브 펄' },
  { id: 'reactive-hybrid', label: '리액티브 하이브리드' },
  { id: 'reactive-solid', label: '리액티브 솔리드' },
  { id: 'particle', label: '파티클' },
]

export const GRIT_OPTIONS: Grit[] = [180, 360, 500, 1000, 2000, 3000, 4000, 'polish']

/** 새 볼의 기본값. 폼을 열었을 때 바로 저장해도 말이 되는 스펙이다. */
export const NEW_BALL_TEMPLATE: Omit<Ball, 'id'> = {
  name: '새 볼',
  weightLb: 15,
  rg: 2.5,
  diff: 0.045,
  cover: 'reactive-pearl',
  grit: 2000,
  pinToCg: 2.5,
  colors: ['#a74d37', '#343f39'],
}

/**
 * 그릿 표시 문자열을 만든다.
 * @param {Grit} grit - 표면 그릿
 * @returns {string} 예: "2000방", "폴리시"
 */
export function gritLabel(grit: Grit): string {
  return grit === 'polish' ? '폴리시' : `${grit}방`
}

/**
 * 커버 옵션 라벨을 반환한다.
 * @param {CoverType} cover - 커버스톡
 * @returns {string} 라벨
 */
export function coverOptionLabel(cover: CoverType): string {
  return COVER_OPTIONS.find((option) => option.id === cover)?.label ?? cover
}

/**
 * 충돌 가능성이 낮은 id를 만든다. crypto가 없으면 시간+난수로 떨어진다.
 * @returns {string} id
 */
export function createBallId(): string {
  const cryptoApi = globalThis.crypto
  if (cryptoApi && 'randomUUID' in cryptoApi) {
    return `ball-${cryptoApi.randomUUID().slice(0, 8)}`
  }
  return `ball-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
}

/**
 * 템플릿에 덧씌워 새 볼을 만든다.
 * @param {Partial<Omit<Ball, 'id'>>} override - 덧씌울 필드
 * @returns {Ball} 새 볼
 */
export function createBall(override: Partial<Omit<Ball, 'id'>> = {}): Ball {
  return {
    ...NEW_BALL_TEMPLATE,
    ...override,
    colors: [...(override.colors ?? NEW_BALL_TEMPLATE.colors)] as [string, string],
    id: createBallId(),
  }
}

/**
 * 값이 유한한 숫자이고 범위 안인지 본다.
 * @param {unknown} value - 검사 값
 * @param {{ min: number, max: number }} range - 범위
 * @returns {boolean} 범위 안이면 true
 */
function inRange(value: unknown, range: { min: number; max: number }): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= range.min && value <= range.max
}

/**
 * CSS 16진 색인지 본다.
 * @param {unknown} value - 검사 값
 * @returns {boolean} #rrggbb 형식이면 true
 */
function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)
}

/**
 * 볼 입력을 검사한다. 빈 배열이면 저장 가능하다.
 *
 * 규정 위반(RG < 2.46 등)은 여기서 막지 않는다. 규정 밖 볼도 굴려볼 수 있어야
 * 하므로 {@link usbcWarnings}로 따로 알린다.
 * @param {Partial<Ball>} ball - 검사할 볼
 * @returns {string[]} 오류 메시지 목록
 */
export function validateBall(ball: Partial<Ball>): string[] {
  const errors: string[] = []
  const name = typeof ball.name === 'string' ? ball.name.trim() : ''
  if (name.length === 0) {
    errors.push('이름을 입력해')
  } else if (name.length > BALL_LIMITS.nameLength) {
    errors.push(`이름은 ${BALL_LIMITS.nameLength}자 이내`)
  }
  if (!inRange(ball.weightLb, BALL_LIMITS.weightLb)) {
    errors.push(`무게는 ${BALL_LIMITS.weightLb.min}~${BALL_LIMITS.weightLb.max} lb`)
  }
  if (!inRange(ball.rg, BALL_LIMITS.rg)) {
    errors.push(`RG는 ${BALL_LIMITS.rg.min.toFixed(3)}~${BALL_LIMITS.rg.max.toFixed(3)}`)
  }
  if (!inRange(ball.diff, BALL_LIMITS.diff)) {
    errors.push(`Diff는 ${BALL_LIMITS.diff.min.toFixed(3)}~${BALL_LIMITS.diff.max.toFixed(3)}`)
  }
  if (ball.intDiff !== undefined && !inRange(ball.intDiff, BALL_LIMITS.intDiff)) {
    errors.push(`Int. Diff는 ${BALL_LIMITS.intDiff.min.toFixed(3)}~${BALL_LIMITS.intDiff.max.toFixed(3)}`)
  }
  if (
    ball.intDiff !== undefined &&
    typeof ball.diff === 'number' &&
    ball.intDiff > ball.diff
  ) {
    errors.push('Int. Diff는 Diff보다 클 수 없어')
  }
  if (!ball.cover || !(ball.cover in COVER_MU)) {
    errors.push('커버스톡을 골라')
  }
  if (ball.grit === undefined || !(String(ball.grit) in GRIT_RA)) {
    errors.push('표면 그릿을 골라')
  }
  if (ball.pinToCg !== undefined && !inRange(ball.pinToCg, BALL_LIMITS.pinToCg)) {
    errors.push(`핀-CG 거리는 ${BALL_LIMITS.pinToCg.min}~${BALL_LIMITS.pinToCg.max} in`)
  }
  if (ball.layout) {
    const { drillAngle, pinToPap, valAngle } = ball.layout
    if (!inRange(drillAngle, BALL_LIMITS.drillAngle)) {
      errors.push(`드릴각은 ${BALL_LIMITS.drillAngle.min}~${BALL_LIMITS.drillAngle.max}°`)
    }
    if (!inRange(pinToPap, BALL_LIMITS.pinToPap)) {
      errors.push(`핀-PAP 거리는 ${BALL_LIMITS.pinToPap.min}~${BALL_LIMITS.pinToPap.max} in`)
    }
    if (!inRange(valAngle, BALL_LIMITS.valAngle)) {
      errors.push(`VAL각은 ${BALL_LIMITS.valAngle.min}~${BALL_LIMITS.valAngle.max}°`)
    }
  }
  if (
    !Array.isArray(ball.colors) ||
    ball.colors.length !== 2 ||
    !ball.colors.every(isHexColor)
  ) {
    errors.push('색은 #rrggbb 두 개')
  }
  return errors
}

/**
 * USBC 장비 규정 위반을 알린다. 저장은 막지 않는다.
 * @param {Pick<Ball, 'rg' | 'diff' | 'intDiff' | 'weightLb'>} spec - 15 lb 기준 스펙
 * @returns {string[]} 경고 메시지 목록
 */
export function usbcWarnings(spec: Pick<Ball, 'rg' | 'diff' | 'intDiff' | 'weightLb'>): string[] {
  const warnings: string[] = []
  if (spec.rg < USBC_SPEC.rgMin) {
    warnings.push(`RG ${spec.rg.toFixed(3)} < ${USBC_SPEC.rgMin.toFixed(3)} · USBC 규정 미달`)
  }
  if (spec.rg > USBC_SPEC.rgMax) {
    warnings.push(`RG ${spec.rg.toFixed(3)} > ${USBC_SPEC.rgMax.toFixed(3)} · USBC 규정 초과`)
  }
  if (spec.diff > USBC_SPEC.diffMax) {
    warnings.push(`Diff ${spec.diff.toFixed(3)} > ${USBC_SPEC.diffMax.toFixed(3)} · USBC 규정 초과`)
  }
  if (spec.intDiff !== undefined && spec.intDiff > USBC_SPEC.intDiffMax) {
    warnings.push(`Int. Diff ${spec.intDiff.toFixed(3)} > ${USBC_SPEC.intDiffMax.toFixed(3)} · USBC 규정 초과`)
  }
  if (spec.weightLb > USBC_SPEC.weightMaxLb) {
    warnings.push(`무게 ${spec.weightLb} lb > ${USBC_SPEC.weightMaxLb} lb · USBC 규정 초과`)
  }
  return warnings
}

/**
 * 15 lb 기준 스펙에서 무게별 RG·Diff 배율 표.
 *
 * 제조사 카탈로그의 무게별 스펙 표를 일반화한 근사다. 14~16 lb는 같은 코어를
 * 밀도만 바꿔 쓰므로 거의 같고, 12~13 lb는 코어를 줄여 Diff가 빠르게 떨어지고,
 * 11 lb 이하는 제네릭 코어(팬케이크)라 Diff가 0.002~0.004로 뭉개진다.
 * 정수 무게에서 정의하고 그 사이는 선형 보간한다.
 */
const WEIGHT_PROFILE: Record<number, { rgOffset: number; diffScale: number }> = {
  16: { rgOffset: -0.006, diffScale: 1.04 },
  15: { rgOffset: 0, diffScale: 1 },
  14: { rgOffset: 0.008, diffScale: 0.94 },
  13: { rgOffset: 0.04, diffScale: 0.72 },
  12: { rgOffset: 0.085, diffScale: 0.5 },
  11: { rgOffset: 0.14, diffScale: 0.08 },
  10: { rgOffset: 0.17, diffScale: 0.04 },
}

/**
 * 무게에 따른 실효 RG·Diff·Int.Diff를 구한다.
 *
 * Int.Diff는 Diff와 같은 비율로 줄어든다. 비대칭 코어를 줄이면 비대칭도 같이
 * 옅어지기 때문이다. 결과는 폼 범위 안으로 잘라 물리 쪽에 이상값이 들어가지 않게 한다.
 * @param {Pick<Ball, 'rg' | 'diff' | 'intDiff'>} spec - 15 lb 기준 스펙
 * @param {number} weightLb - 무게(lb)
 * @returns {{ rg: number, diff: number, intDiff?: number }} 실효 스펙
 */
export function specAtWeight(
  spec: Pick<Ball, 'rg' | 'diff' | 'intDiff'>,
  weightLb: number,
): { rg: number; diff: number; intDiff?: number } {
  const clamped = Math.min(BALL_LIMITS.weightLb.max, Math.max(BALL_LIMITS.weightLb.min, weightLb))
  const lower = Math.floor(clamped)
  const upper = Math.min(BALL_LIMITS.weightLb.max, lower + 1)
  const t = clamped - lower
  const a = WEIGHT_PROFILE[lower]
  const b = WEIGHT_PROFILE[upper]
  const rgOffset = a.rgOffset * (1 - t) + b.rgOffset * t
  const diffScale = a.diffScale * (1 - t) + b.diffScale * t

  const rg = Math.min(BALL_LIMITS.rg.max, Math.max(BALL_LIMITS.rg.min, spec.rg + rgOffset))
  const diff = Math.min(BALL_LIMITS.diff.max, Math.max(0, spec.diff * diffScale))
  const intDiff =
    spec.intDiff === undefined
      ? undefined
      : Math.min(diff, Math.max(0, spec.intDiff * diffScale))
  return { rg, diff, intDiff }
}

/**
 * 시뮬레이션에 넘길 실효 볼을 만든다. rg·diff가 현재 무게의 값으로 바뀐다.
 * @param {Ball} ball - 저장된 볼(15 lb 기준 스펙)
 * @returns {Ball} 실효 볼
 */
export function effectiveBall(ball: Ball): Ball {
  if (ball.weightLb === SPEC_REFERENCE_WEIGHT_LB) {
    return ball
  }
  return { ...ball, ...specAtWeight(ball, ball.weightLb) }
}

/**
 * 레이아웃이 비어 있지 않은지 본다.
 * @param {Layout | undefined} layout - 레이아웃
 * @returns {boolean} 입력돼 있으면 true
 */
export function hasLayout(layout: Layout | undefined): layout is Layout {
  return layout !== undefined
}
