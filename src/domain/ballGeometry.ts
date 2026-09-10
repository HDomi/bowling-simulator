/**
 * 볼 3D 뷰어용 기하. RG 세 축, 관성 타원체, 표면 마커(핀·CG·MB·그립홀)를
 * 볼 로컬 좌표(단위 벡터)로 계산한다. Three.js를 모른다.
 *
 * 로컬 좌표 관례:
 *   +Y = 핀 축(RG 최소 축). 핀은 (0, 1, 0)에 있다.
 *   +X = MB(PSA) 축(RG 최대 축). 비대칭 볼의 MB 마커가 (1, 0, 0)에 있다.
 *   +Z = 중간 축.
 * 대칭 볼은 X·Z가 같은 RG라 축을 어디 두든 물리적으로 같다.
 */
import { BALL_DIAMETER_IN } from '@/domain/constants'
import type { Ball, Bowler, Layout } from '@/domain/types'

export type Vec3 = { x: number; y: number; z: number }

export type RgAxes = {
  /** 핀 축(+Y). RG 최소. */
  low: number
  /** MB 축(+X). RG 최대. */
  high: number
  /** 중간 축(+Z). 대칭 볼은 high와 같다. */
  intermediate: number
}

export type SurfaceMarkers = {
  pin: Vec3
  cg: Vec3
  /** 비대칭(Int.Diff > 0)일 때만 있다. */
  mb: Vec3 | null
  /** 레이아웃 입력 시. [손가락1, 손가락2, 엄지] */
  holes: Vec3[]
  pap: Vec3 | null
  gripCenter: Vec3 | null
}

export const BALL_RADIUS_IN = BALL_DIAMETER_IN / 2

/** 코어 타원체의 기준 반지름(볼 반지름 대비). */
export const CORE_RADIUS_RATIO = 0.6

/** 타원체 과장 배율 슬라이더 범위. 1이면 실제 RG 비율이다. */
export const EXAGGERATION = { min: 1, max: 20, step: 1, default: 10 } as const

export const FINGER_HOLE_RADIUS_IN = 0.5
export const THUMB_HOLE_RADIUS_IN = 0.62
/** 그립 중심에서 손가락 구멍 쌍·엄지 구멍까지의 세로 거리(in). 평균 스팬 4.25"의 절반. */
export const GRIP_HALF_SPAN_IN = 2.125
/** 두 손가락 구멍 사이 간격(in)의 절반. */
export const FINGER_HALF_GAP_IN = 0.6

/**
 * 볼의 RG 세 축을 구한다.
 * @param {Pick<Ball, 'rg' | 'diff' | 'intDiff'>} spec - 실효 스펙
 * @returns {RgAxes} RG 축 값
 */
export function rgAxes(spec: Pick<Ball, 'rg' | 'diff' | 'intDiff'>): RgAxes {
  const low = spec.rg
  const high = spec.rg + spec.diff
  const intermediate = high - (spec.intDiff ?? 0)
  return { low, high, intermediate }
}

/**
 * 관성 타원체의 반축 길이를 구한다. 결과는 [x, y, z] 순서(볼 로컬)다.
 *
 * 질량이 축 근처에 몰릴수록 그 축의 RG가 작으므로, RG가 작은 축이 길게 나온다.
 * 반축 = 기준 반지름 × (RG 평균 / RG_축)^E. E = 1이면 실제 비율이고,
 * 실제 차이가 2% 수준이라 기본 10배로 과장한다.
 * @param {RgAxes} axes - RG 축 값
 * @param {number} exaggeration - 과장 지수 E
 * @param {number} coreRadius - 기준 반지름(뷰어 단위)
 * @returns {[number, number, number]} 반축 [x(MB), y(핀), z(중간)]
 */
export function ellipsoidSemiAxes(
  axes: RgAxes,
  exaggeration: number,
  coreRadius: number,
): [number, number, number] {
  const mean = (axes.low + axes.high + axes.intermediate) / 3
  const scale = (rg: number): number => coreRadius * (mean / rg) ** exaggeration
  return [scale(axes.high), scale(axes.low), scale(axes.intermediate)]
}

/**
 * 볼의 실제 관성 차이를 백분율로 표현한다. 과장 슬라이더 옆에 병기한다.
 * @param {RgAxes} axes - RG 축 값
 * @returns {number} (high − low) / low × 100
 */
export function rgSpreadPercent(axes: RgAxes): number {
  return ((axes.high - axes.low) / axes.low) * 100
}

function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z)
  if (len < 1e-12) {
    return { x: 0, y: 1, z: 0 }
  }
  return { x: v.x / len, y: v.y / len, z: v.z / len }
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

function scale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s }
}

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }
}

/**
 * 표면점 p에서 접선 방향 dir로 호 길이 arcIn만큼 이동한 표면점을 구한다.
 * @param {Vec3} p - 표면 단위 벡터
 * @param {Vec3} dir - p에 접하는 단위 벡터
 * @param {number} arcIn - 호 길이(in)
 * @returns {Vec3} 이동한 표면 단위 벡터
 */
export function moveOnSphere(p: Vec3, dir: Vec3, arcIn: number): Vec3 {
  const theta = arcIn / BALL_RADIUS_IN
  return normalize(add(scale(p, Math.cos(theta)), scale(dir, Math.sin(theta))))
}

/**
 * 표면점 p에서 다른 표면점 q를 향하는 접선 단위 벡터를 구한다.
 * @param {Vec3} p - 출발 표면점
 * @param {Vec3} q - 목표 표면점
 * @returns {Vec3} 접선
 */
export function tangentToward(p: Vec3, q: Vec3): Vec3 {
  const projected = add(q, scale(p, -dot(p, q)))
  return normalize(projected)
}

/**
 * 표면점 p에서 접선 t를 법선(p) 둘레로 angleDeg 회전한다.
 * 양수 각은 p 바깥에서 볼 때 시계 반대 방향이다.
 * @param {Vec3} p - 표면점(법선)
 * @param {Vec3} t - 접선
 * @param {number} angleDeg - 회전각(°)
 * @returns {Vec3} 회전한 접선
 */
export function rotateTangent(p: Vec3, t: Vec3, angleDeg: number): Vec3 {
  const rad = (angleDeg * Math.PI) / 180
  const perpendicular = cross(p, t)
  return normalize(add(scale(t, Math.cos(rad)), scale(perpendicular, Math.sin(rad))))
}

/**
 * 두 표면점 사이 호 길이(in)를 구한다.
 * @param {Vec3} a - 표면점
 * @param {Vec3} b - 표면점
 * @returns {number} 호 길이(in)
 */
export function arcDistanceIn(a: Vec3, b: Vec3): number {
  const cosine = Math.min(1, Math.max(-1, dot(a, b)))
  return Math.acos(cosine) * BALL_RADIUS_IN
}

export const PIN_POINT: Vec3 = { x: 0, y: 1, z: 0 }
export const MB_POINT: Vec3 = { x: 1, y: 0, z: 0 }

/**
 * 듀얼 앵글 레이아웃에서 PAP 표면점을 구한다.
 *
 * 드릴각은 핀에서 CG를 향하는 방향과 핀에서 PAP를 향하는 방향 사이 각이다.
 * 핀-PAP 거리는 그 방향으로 이동한 호 길이다.
 * @param {Vec3} cg - CG 표면점
 * @param {Layout} layout - 레이아웃
 * @param {Bowler['hand']} hand - 손. 왼손은 드릴각을 반대로 돈다
 * @returns {Vec3} PAP 표면점
 */
export function papFromLayout(cg: Vec3, layout: Layout, hand: Bowler['hand']): Vec3 {
  const toCg = arcDistanceIn(PIN_POINT, cg) < 1e-6 ? MB_POINT : tangentToward(PIN_POINT, cg)
  const sign = hand === 'left' ? -1 : 1
  const toPap = rotateTangent(PIN_POINT, toCg, sign * layout.drillAngle)
  return moveOnSphere(PIN_POINT, toPap, layout.pinToPap)
}

/**
 * PAP와 VAL각에서 그립 중심과 구멍 세 개를 구한다.
 *
 * VAL(수직축선)은 PAP를 지나고, PAP→핀 방향에서 VAL각만큼 돌아간 선이다.
 * 그립 중심은 VAL에서 papOver만큼 떨어진 미드라인 위, papUp만큼 아래에 있다.
 * 손가락 구멍 둘은 그립 중심 위쪽, 엄지는 아래쪽이다. 실제 지공 기하를
 * 단순화한 시각화용 근사다.
 * @param {Vec3} pap - PAP 표면점
 * @param {Layout} layout - 레이아웃
 * @param {Pick<Bowler, 'papOver' | 'papUp' | 'hand'>} bowler - 볼러 PAP 측정값
 * @returns {{ gripCenter: Vec3, holes: Vec3[] }} 그립 중심과 구멍 [손가락1, 손가락2, 엄지]
 */
export function gripFromPap(
  pap: Vec3,
  layout: Layout,
  bowler: Pick<Bowler, 'papOver' | 'papUp' | 'hand'>,
): { gripCenter: Vec3; holes: Vec3[] } {
  const sign = bowler.hand === 'left' ? -1 : 1
  const toPin = tangentToward(pap, PIN_POINT)
  // VAL: 위쪽(핀 쪽)이 +. 미드라인은 VAL에서 90° 돌린 방향이고, 그립은 PAP의 손 안쪽이다.
  const val = rotateTangent(pap, toPin, sign * layout.valAngle)
  const midline = rotateTangent(pap, val, sign * 90)
  const belowVal = moveOnSphere(pap, scale(val, -1), bowler.papUp)
  const midlineAtBelow = tangentAfterMove(pap, midline, belowVal)
  const gripCenter = moveOnSphere(belowVal, midlineAtBelow, bowler.papOver)

  const up = tangentAfterMove(pap, val, gripCenter)
  const side = rotateTangent(gripCenter, up, 90)
  const fingerRow = moveOnSphere(gripCenter, up, GRIP_HALF_SPAN_IN)
  const fingerAcross = tangentAfterMove(gripCenter, side, fingerRow)
  const holes = [
    moveOnSphere(fingerRow, fingerAcross, FINGER_HALF_GAP_IN),
    moveOnSphere(fingerRow, scale(fingerAcross, -1), FINGER_HALF_GAP_IN),
    moveOnSphere(gripCenter, scale(up, -1), GRIP_HALF_SPAN_IN),
  ]
  return { gripCenter, holes }
}

/**
 * 표면점 from에서 정의한 접선 t를 표면점 to로 평행이동(구면 위 운반)한다.
 * 짧은 거리라 t를 to의 접평면에 투영하는 것으로 충분하다.
 * @param {Vec3} from - 원래 접점
 * @param {Vec3} t - from의 접선
 * @param {Vec3} to - 옮길 접점
 * @returns {Vec3} to의 접선
 */
function tangentAfterMove(from: Vec3, t: Vec3, to: Vec3): Vec3 {
  const projected = add(t, scale(to, -dot(to, t)))
  const len = Math.hypot(projected.x, projected.y, projected.z)
  if (len < 1e-9) {
    return tangentToward(to, from)
  }
  return scale(projected, 1 / len)
}

/**
 * 볼의 표면 마커를 전부 계산한다.
 * @param {Ball} ball - 볼(실효 스펙)
 * @param {Pick<Bowler, 'papOver' | 'papUp' | 'hand'>} bowler - 볼러 PAP
 * @returns {SurfaceMarkers} 표면 마커
 */
export function surfaceMarkers(
  ball: Ball,
  bowler: Pick<Bowler, 'papOver' | 'papUp' | 'hand'>,
): SurfaceMarkers {
  const pinToCg = ball.pinToCg ?? 0
  const cg = moveOnSphere(PIN_POINT, MB_POINT, pinToCg)
  const asymmetric = (ball.intDiff ?? 0) > 0
  const mb = asymmetric ? MB_POINT : null

  if (!ball.layout) {
    return { pin: PIN_POINT, cg, mb, holes: [], pap: null, gripCenter: null }
  }
  const pap = papFromLayout(cg, ball.layout, bowler.hand)
  const grip = gripFromPap(pap, ball.layout, bowler)
  return { pin: PIN_POINT, cg, mb, holes: grip.holes, pap, gripCenter: grip.gripCenter }
}
