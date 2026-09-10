import {
  BALL_RADIUS,
  FT,
  G,
  LANE_LENGTH,
  MPH,
  PHYSICS,
  PIN_HANDOFF_Y,
} from '@/domain/constants'
import {
  ballMassKg,
  boardToX,
  computeMu,
  inertiaFromRg,
  isInGutter,
  sampleOil,
  xToBoard,
} from '@/domain/physics/friction'
import { detectPhases } from '@/domain/physics/phases'
import type { Ball, PathSample, Pattern, ReleaseInput, ShotResult } from '@/domain/types'

type Vec3 = { x: number; y: number; z: number }

/**
 * 두 벡터의 외적을 계산한다.
 * @param {Vec3} a - 왼쪽 벡터
 * @param {Vec3} b - 오른쪽 벡터
 * @returns {Vec3} a × b
 */
function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

/**
 * rpm을 rad/s로 변환한다.
 * @param {number} rpm - 분당 회전수
 * @returns {number} rad/s
 */
function rpmToRad(rpm: number): number {
  return (rpm * Math.PI * 2) / 60
}

/**
 * 진행 방향 기준 각속도를 월드 좌표로 변환한다.
 * 오른손잡이는 훅이 왼쪽(포켓, 1-3)으로, 왼손잡이는 오른쪽(1-2)으로 나도록 부호를 정한다.
 * @param {ReleaseInput} release - 릴리즈 조건
 * @param {number} headingRad - 초기 진행각(다운레인 기준)
 * @returns {Vec3} 각속도 (x 가로, y 다운레인, z 위)
 */
export function initialOmega(release: ReleaseInput, headingRad: number): Vec3 {
  const omegaMag = rpmToRad(release.revRate)
  const theta = (release.axisRotation * Math.PI) / 180
  const phi = (release.axisTilt * Math.PI) / 180
  const hand = release.hand === 'left' ? -1 : 1

  const local: Vec3 = {
    x: -omegaMag * Math.cos(theta) * Math.cos(phi),
    y: -hand * omegaMag * Math.sin(theta) * Math.cos(phi),
    z: hand * omegaMag * Math.sin(phi),
  }

  const cos = Math.cos(headingRad)
  const sin = Math.sin(headingRad)
  return {
    x: local.x * cos - local.y * sin,
    y: local.x * sin + local.y * cos,
    z: local.z,
  }
}

/**
 * 경로에서 브레이크포인트(오른손: 가장 오른쪽 x)의 다운레인 거리(ft)를 구한다.
 * @param {PathSample[]} path - 궤적 샘플
 * @param {'right' | 'left'} hand - 손
 * @returns {number} 브레이크포인트(ft)
 */
export function findBreakpointFt(path: PathSample[], hand: 'right' | 'left'): number {
  if (path.length === 0) {
    return 0
  }

  const windowed = path.filter((sample) => sample.y >= 8 * FT && sample.y <= 58 * FT)
  const pool = windowed.length > 0 ? windowed : path
  let extreme = pool[0]
  for (const sample of pool) {
    if (hand === 'right' ? sample.x > extreme.x : sample.x < extreme.x) {
      extreme = sample
    }
  }
  return extreme.y / FT
}

/**
 * 훅이 시작되는 다운레인 거리(ft)를 찾는다. 진행각이 초기 조준보다 안쪽으로 돌아선 시점이다.
 * @param {PathSample[]} path - 궤적
 * @param {'right' | 'left'} hand - 손
 * @returns {number} 훅 시작(ft)
 */
export function findHookStartFt(path: PathSample[], hand: 'right' | 'left'): number {
  if (path.length === 0) {
    return 0
  }
  const startHeading = path[0].headingDeg
  for (const sample of path) {
    if (sample.y < 12 * FT) {
      continue
    }
    const turned =
      hand === 'right'
        ? sample.headingDeg < startHeading - 0.35
        : sample.headingDeg > startHeading + 0.35
    if (turned) {
      return sample.y / FT
    }
  }
  return path[path.length - 1].y / FT
}

/**
 * 지정 다운레인 거리 근처 샘플을 찾는다.
 * @param {PathSample[]} path - 궤적
 * @param {number} yMeters - 목표 y(m)
 * @returns {PathSample | null} 샘플
 */
export function sampleAtY(path: PathSample[], yMeters: number): PathSample | null {
  let best: PathSample | null = null
  let bestDist = Infinity
  for (const sample of path) {
    const dist = Math.abs(sample.y - yMeters)
    if (dist < bestDist) {
      bestDist = dist
      best = sample
    }
  }
  return best
}

/**
 * 오일 패턴과 볼·릴리즈로 파울라인부터 핀덱까지 궤적을 적분한다.
 * @param {Ball} ball - 볼 스펙
 * @param {Pattern} pattern - 오일 패턴
 * @param {ReleaseInput} release - 릴리즈 조건
 * @returns {ShotResult} 궤적과 지표
 */
export function simulateShot(ball: Ball, pattern: Pattern, release: ReleaseInput): ShotResult {
  const mass = ballMassKg(ball.weightLb)
  const inertia = inertiaFromRg(mass, ball.rg)
  const speed = release.speedMph * MPH

  const startX = boardToX(release.releaseBoard)
  const targetX = boardToX(release.targetBoard)
  const targetY = PHYSICS.arrowFt * FT
  const dx = targetX - startX
  const heading = Math.atan2(dx, targetY)

  let x = startX
  let y = 0
  let vx = speed * Math.sin(heading)
  let vy = speed * Math.cos(heading)
  let omega = initialOmega(release, heading)
  let t = 0

  const path: PathSample[] = []
  const rContact: Vec3 = { x: 0, y: 0, z: -BALL_RADIUS }
  let gutter = false

  while (y < LANE_LENGTH && t < PHYSICS.maxTime) {
    const board = xToBoard(x)
    const oil = sampleOil(pattern, board, y / FT)
    const mu = computeMu(ball, oil)

    const vel: Vec3 = { x: vx, y: vy, z: 0 }
    const slip = {
      x: vel.x + (cross(omega, rContact).x),
      y: vel.y + (cross(omega, rContact).y),
      z: 0,
    }
    const slipSpeed = Math.hypot(slip.x, slip.y)

    let fx = 0
    let fy = 0
    if (slipSpeed > PHYSICS.slipEpsilon) {
      // 마찰은 접촉점 미끄럼의 반대 방향으로만 작용한다.
      const mag = mu * mass * G
      fx = (-mag * slip.x) / slipSpeed
      fy = (-mag * slip.y) / slipSpeed
    } else {
      const vSpeed = Math.hypot(vx, vy)
      if (vSpeed > 1e-6) {
        const mag = PHYSICS.rollingMu * mass * G
        fx = (-mag * vx) / vSpeed
        fy = (-mag * vy) / vSpeed
      }
    }

    const force: Vec3 = { x: fx, y: fy, z: 0 }
    const alpha = cross(rContact, force)
    const ax = fx / mass
    const ay = fy / mass
    const alphax = alpha.x / inertia
    const alphay = alpha.y / inertia
    const alphaz = alpha.z / inertia

    vx += ax * PHYSICS.dt
    vy += ay * PHYSICS.dt
    omega = {
      x: omega.x + alphax * PHYSICS.dt,
      y: omega.y + alphay * PHYSICS.dt,
      z: omega.z + alphaz * PHYSICS.dt,
    }
    x += vx * PHYSICS.dt
    y += vy * PHYSICS.dt
    t += PHYSICS.dt

    if (path.length === 0 || t - path[path.length - 1].t >= 1 / 60) {
      path.push({
        x,
        y,
        t,
        vx,
        vy,
        wx: omega.x,
        wy: omega.y,
        wz: omega.z,
        slip: slipSpeed,
        oil,
        headingDeg: (Math.atan2(vx, vy) * 180) / Math.PI,
      })
    }

    if (isInGutter(x)) {
      gutter = true
      path.push({
        x,
        y,
        t,
        vx,
        vy,
        wx: omega.x,
        wy: omega.y,
        wz: omega.z,
        slip: slipSpeed,
        oil,
        headingDeg: (Math.atan2(vx, vy) * 180) / Math.PI,
      })
      break
    }
  }

  if (path.length === 0) {
    path.push({
      x,
      y,
      t,
      vx,
      vy,
      wx: omega.x,
      wy: omega.y,
      wz: omega.z,
      slip: 0,
      oil: 0,
      headingDeg: (Math.atan2(vx, vy) * 180) / Math.PI,
    })
  }

  const start = path[0]
  const at49 = sampleAtY(path, 49 * FT) ?? path[path.length - 1]
  const atPins = sampleAtY(path, LANE_LENGTH) ?? path[path.length - 1]
  // 핀덱 물리에 넘길 상태는 핀에 닿기 전 지점에서 뽑는다.
  const atHandoff = sampleAtY(path, PIN_HANDOFF_Y) ?? atPins
  const startSpeed = Math.hypot(start.vx, start.vy) / MPH
  const speed49 = Math.hypot(at49.vx, at49.vy) / MPH
  const angleChange49 = Math.abs(at49.headingDeg - start.headingDeg)

  return {
    path,
    breakpointFt: findBreakpointFt(path, release.hand),
    entryAngleDeg: Math.abs(atPins.headingDeg),
    entryBoard: xToBoard(atPins.x),
    speedAtPinsMph: Math.hypot(atPins.vx, atPins.vy) / MPH,
    phases: detectPhases(path),
    pinsDown: [],
    isStrike: false,
    gutter,
    pinEntry: {
      x: atHandoff.x,
      y: Math.min(atHandoff.y, PIN_HANDOFF_Y),
      vx: atHandoff.vx,
      vy: atHandoff.vy,
      wx: atHandoff.wx,
      wy: atHandoff.wy,
      wz: atHandoff.wz,
    },
    speedLoss49Mph: startSpeed - speed49,
    angleChange49Deg: angleChange49,
  }
}
