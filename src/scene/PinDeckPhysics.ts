import RAPIER from '@dimforge/rapier3d-compat'
import {
  BALL_RADIUS,
  IN,
  DEFAULT_BALL_WEIGHT_LB,
  KICKBACK_HEIGHT,
  KICKBACK_X,
  LANE_LENGTH,
  PINSETTER,
  PIN_DECK_END,
  PIN_DOWN_TILT_DEG,
  PIN_HEIGHT,
  PIN_BASE_RADIUS,
  PIN_MASS,
  PIN_PHYSICS,
  PIN_SETTLE_MAX_S,
  PIN_SETTLE_SPEED,
  PIT_DEPTH,
  PIT_END,
} from '@/domain/constants'
import { pinProfile } from '@/domain/pins/profile'
import { createPinSpots, isStrike } from '@/domain/pins/layout'
import { ballMassKg } from '@/domain/physics/friction'
import type { ShotResult } from '@/domain/types'
import {
  applyBallLook,
  applyPaintTexture,
  createBallMesh,
  DEFAULT_BALL_LOOK,
  type BallLook,
} from '@/scene/createBallMesh'
import { createPinMesh } from '@/scene/createPinMesh'
import { physXToThree } from '@/scene/coords'
import { Group, Mesh, Quaternion, Vector3 } from 'three'

type PinBody = {
  id: number
  mesh: Mesh
  body: RAPIER.RigidBody
  /** 핀덱에 서 있는 상태인지. 치워진 핀은 false다. */
  inPlay: boolean
}

/** 치워진 핀을 물리 월드 밖으로 보내는 자리. */
const OFFSTAGE_Y = -40

/**
 * 구간 [from, to]에서 0→1로 부드럽게 오르는 값을 만든다.
 * @param {number} t - 현재 시간
 * @param {number} from - 시작
 * @param {number} to - 끝
 * @returns {number} 0~1
 */
function ramp(t: number, from: number, to: number): number {
  if (t <= from) return 0
  if (t >= to) return 1
  const k = (t - from) / (to - from)
  return k * k * (3 - 2 * k)
}

/**
 * 쿼터니언이 적용된 핀의 위쪽 축 y성분을 반환한다.
 * @param {RAPIER.Rotation} rotation - Rapier 회전
 * @returns {number} 월드 up의 y
 */
function pinUpY(rotation: RAPIER.Rotation): number {
  const q = new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w)
  const upY = 1 - 2 * (q.x * q.x + q.z * q.z)
  return upY
}

/**
 * 핀덱 Rapier 월드와 메시를 관리한다.
 */
export class PinDeckPhysics {
  world: RAPIER.World | null = null
  group = new Group()
  private pins: PinBody[] = []
  private ballBody: RAPIER.RigidBody | null = null
  private ballMesh: Mesh
  private eventQueue: RAPIER.EventQueue | null = null
  private restSpotZ = LANE_LENGTH
  private stepAccumulator = 0
  private sweepBody: RAPIER.RigidBody | null = null
  private sweepMesh: Mesh | null = null
  private sweepTime = 0
  private sweeping = false
  private keepIds: number[] = []

  constructor(ballLook: BallLook = DEFAULT_BALL_LOOK) {
    this.ballMesh = createBallMesh(ballLook)
    this.ballMesh.visible = false
    this.group.add(this.ballMesh)
  }

  /**
   * 핀덱에서 굴러가는 볼의 외관을 바꾼다.
   * @param {BallLook} look - 볼 외관
   */
  setBallLook(look: BallLook): void {
    applyBallLook(this.ballMesh, look)
  }

  /**
   * 페인팅 텍스처를 볼에 입힌다.
   * @param {HTMLCanvasElement | null} paint - 합성된 페인팅 캔버스
   * @param {BallLook} look - 페인팅이 없을 때 쓸 외관
   */
  setPaintTexture(paint: HTMLCanvasElement | null, look: BallLook): void {
    applyPaintTexture(this.ballMesh, paint, look)
  }

  /**
   * WASM을 초기화하고 핀 10개를 배치한다.
   */
  async init(): Promise<void> {
    await RAPIER.init()
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
    // 작은 바닥 접촉면이 기본 허용 오차에 묻혀 흔들리지 않게 한다.
    this.world.integrationParameters.normalizedAllowedLinearError = 0.00005
    this.world.numSolverIterations = 8
    this.eventQueue = new RAPIER.EventQueue(true)

    this.createDeckColliders()
    this.createSweepBody()

    const spots = createPinSpots()
    for (const spot of spots) {
      const mesh = createPinMesh()
      const x = physXToThree(spot.x)
      const z = this.restSpotZ + spot.z
      mesh.position.set(x, 0, z)
      this.group.add(mesh)

      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(x, PIN_HEIGHT / 2 + 0.002, z)
          .setCanSleep(true)
          .setCcdEnabled(true)
          .setLinearDamping(0.15)
          .setAngularDamping(0.2),
      )
      // 인접 단면 사이를 볼록 절두체로 나눠 목의 오목한 곡면을 보존한다.
      // 전체를 단일 convex hull로 감싸면 목이 채워져 잘못 충돌한다.
      // 바닥 평면은 해석적 원기둥으로 접촉시킨다. 다면체 바닥의 단일점 접촉 흔들림을 피한다.
      this.world.createCollider(
        RAPIER.ColliderDesc.cylinder(0.0005, PIN_BASE_RADIUS)
          .setTranslation(0, -PIN_HEIGHT / 2 + 0.0005, 0)
          .setMass(0).setFriction(0.35).setRestitution(0.12), body,
      )
      const profile = pinProfile().filter(p => p.y > 0)
      const cuts = [0, 7.25, 8.625, 9.375, 10, 10.875, 11.75, 12.625, 15]
      const sections = cuts.slice(1).map((end, i) =>
        profile.filter(p => p.y >= cuts[i] * IN - 1e-8 && p.y <= end * IN + 1e-8),
      )
      const volumes = sections.map(points => points.slice(1).reduce((sum, p, i) => {
        const a = points[i]
        return sum + (p.y - a.y) * (a.radius ** 2 + a.radius * p.radius + p.radius ** 2)
      }, 0))
      const total = volumes.reduce((a, b) => a + b, 0)
      for (let i = 0; i < sections.length; i += 1) {
        const vertices: number[] = []
        for (const point of sections[i]) {
          for (let side = 0; side < 24; side += 1) {
            const angle = side * Math.PI * 2 / 24
            vertices.push(point.radius * Math.cos(angle), point.y - PIN_HEIGHT / 2, point.radius * Math.sin(angle))
          }
        }
        const collider = RAPIER.ColliderDesc.convexHull(new Float32Array(vertices))
        if (!collider) throw new Error('핀 곡면 충돌체 생성 실패')
        this.world.createCollider(
          collider.setMass(PIN_MASS * volumes[i] / total).setFriction(0.35).setRestitution(0.48),
          body,
        )
      }
      this.pins.push({ id: spot.id, mesh, body, inPlay: true })
    }
  }

  /**
   * 핀을 스팟에 세운다.
   * @param {number[] | null} keepIds - 세울 핀 번호. null이면 10개 전부 세운다.
   */
  resetPins(keepIds: number[] | null = null): void {
    if (!this.world) {
      return
    }
    const spots = createPinSpots()
    for (const pin of this.pins) {
      const spot = spots.find((item) => item.id === pin.id)
      if (!spot) {
        continue
      }
      if (keepIds && !keepIds.includes(pin.id)) {
        this.sendOffstage(pin)
        continue
      }
      this.standPin(pin, spot.x, spot.z)
    }
    this.sweeping = false
    this.sweepTime = 0
    this.moveSweep(PINSETTER.restY, PINSETTER.restZ)
    this.stepAccumulator = 0
    this.removeBall()
  }

  /**
   * 지금 핀덱에 서 있는 핀 번호를 반환한다.
   * @returns {number[]} 서 있는 핀
   */
  standingPins(): number[] {
    const down = this.pinsDown()
    return this.pins
      .filter((pin) => pin.inPlay && !down.includes(pin.id))
      .map((pin) => pin.id)
      .sort((a, b) => a - b)
  }

  /**
   * 핀세터 동작을 시작한다. 남은 핀을 들어올리고 쓰러진 핀을 피트로 쓸어낸다.
   * @param {number[]} keepIds - 남길 핀 번호
   */
  startSweep(keepIds: number[]): void {
    this.keepIds = [...keepIds]
    this.sweepTime = 0
    this.sweeping = true
    this.removeBall()
  }

  /**
   * 핀세터 동작을 진행한다.
   * @param {number} dt - 프레임 시간
   * @returns {boolean} 동작이 끝났으면 true
   */
  updateSweep(dt: number): boolean {
    if (!this.sweeping) {
      return true
    }
    this.sweepTime += dt
    const t = this.sweepTime
    const P = PINSETTER

    // 남은 핀을 들어올린다. 물리에서 빼고 메시만 띄운다.
    const liftK = ramp(t, 0, P.liftEnd)
    const placeK = ramp(t, P.placeStart, P.placeEnd)
    const height = P.liftHeight * (1 - placeK) * (placeK > 0 ? 1 : liftK)
    for (const pin of this.pins) {
      if (!this.keepIds.includes(pin.id)) {
        continue
      }
      if (t < P.placeEnd) {
        this.parkPin(pin, height)
      }
    }

    // 스위프바: 내려오고 → 밀고 → 올라가고 → 돌아온다.
    const drop = ramp(t, P.dropStart, P.dropEnd)
    const push = ramp(t, P.sweepStart, P.sweepEnd)
    const raise = ramp(t, P.raiseStart, P.raiseEnd)
    const back = ramp(t, P.returnStart, P.returnEnd)
    const y = P.restY + (P.downY - P.restY) * drop + (P.restY - P.downY) * raise
    const z = P.restZ + (P.sweptZ - P.restZ) * push + (P.restZ - P.sweptZ) * back
    this.moveSweep(y, z)

    // 쓸어낸 핀을 무대 밖으로 보낸다.
    if (t >= P.raiseStart) {
      for (const pin of this.pins) {
        if (pin.inPlay && !this.keepIds.includes(pin.id)) {
          this.sendOffstage(pin)
        }
      }
    }

    // 남은 핀을 제자리에 다시 세운다.
    if (t >= P.placeEnd) {
      const spots = createPinSpots()
      for (const pin of this.pins) {
        if (!this.keepIds.includes(pin.id)) {
          continue
        }
        const spot = spots.find((item) => item.id === pin.id)
        if (spot) {
          this.standPin(pin, spot.x, spot.z)
        }
      }
    }

    if (t >= P.returnEnd) {
      this.sweeping = false
      this.moveSweep(P.restY, P.restZ)
      return true
    }
    return false
  }

  /**
   * 스위프바 메시를 연결한다. 씬에서 만든 것을 물리 위치에 맞춘다.
   * @param {Mesh} mesh - 스위프바 메시
   */
  attachSweepMesh(mesh: Mesh): void {
    this.sweepMesh = mesh
    mesh.position.set(0, PINSETTER.restY, PINSETTER.restZ)
  }

  /**
   * 궤적 끝 상태로 볼을 핀덱에 투입한다.
   * @param {ShotResult['pinEntry']} entry - 핀덱 진입 상태
   */
  launchBall(entry: ShotResult['pinEntry'], weightLb = DEFAULT_BALL_WEIGHT_LB): void {
    if (!this.world) {
      return
    }
    const x = physXToThree(entry.x)
    this.removeBall()
    const z = entry.y
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, BALL_RADIUS, z)
        .setLinvel(physXToThree(entry.vx), 0, entry.vy)
        .setAngvel({ x: -entry.wx, y: entry.wz, z: -entry.wy })
        .setCcdEnabled(true)
        .setLinearDamping(0.02)
        .setAngularDamping(0.04),
    )
    this.world.createCollider(
      RAPIER.ColliderDesc.ball(BALL_RADIUS)
        .setMass(ballMassKg(weightLb))
        .setFriction(0.25)
        .setRestitution(0.55),
      body,
    )
    this.ballBody = body
    this.ballMesh.visible = true
    this.ballMesh.position.set(x, BALL_RADIUS, z)
  }

  /**
   * 물리 스텝을 진행하고 메시를 맞춘다.
   * @param {number} dt - 프레임 시간
   */
  step(dt: number): void {
    if (!this.world) {
      return
    }

    const fixed = PIN_PHYSICS.fixedStepS
    this.world.timestep = fixed
    this.stepAccumulator += Math.min(dt, PIN_PHYSICS.maxFrameS)

    let steps = 0
    while (this.stepAccumulator >= fixed && steps < PIN_PHYSICS.maxSubSteps) {
      this.world.step(this.eventQueue ?? undefined)
      this.stepAccumulator -= fixed
      steps += 1
    }

    // 한 프레임에 다 못 밟았으면 남은 시간은 버린다. 쌓아두면 다음 프레임이 더 밀린다.
    if (steps >= PIN_PHYSICS.maxSubSteps) {
      this.stepAccumulator = 0
    }

    this.syncMeshes()
  }

  /**
   * 핀이 거의 멈췄는지 판정한다.
   * @returns {boolean} 정지 여부
   */
  isSettled(): boolean {
    for (const pin of this.pins) {
      const lv = pin.body.linvel()
      const av = pin.body.angvel()
      if (Math.hypot(lv.x, lv.y, lv.z) > PIN_SETTLE_SPEED) {
        return false
      }
      if (Math.hypot(av.x, av.y, av.z) > 1.2) {
        return false
      }
    }
    if (this.ballBody) {
      const lv = this.ballBody.linvel()
      if (Math.hypot(lv.x, lv.y, lv.z) > 0.6) {
        return false
      }
    }
    return true
  }

  /**
   * 넘어진 핀 번호를 반환한다.
   * @returns {number[]} 핀 번호
   */
  pinsDown(): number[] {
    const threshold = Math.cos((PIN_DOWN_TILT_DEG * Math.PI) / 180)
    const down: number[] = []
    for (const pin of this.pins) {
      // 이미 치워진 핀은 이번 투구의 결과가 아니다.
      if (!pin.inPlay) {
        continue
      }
      const t = pin.body.translation()
      if (pinUpY(pin.body.rotation()) < threshold || t.y < PIN_HEIGHT * 0.28) {
        down.push(pin.id)
      }
    }
    return down.sort((a, b) => a - b)
  }

  /**
   * 핀 하나의 현재 위치를 반환한다. 치워진 핀은 null이다.
   * @param {number} id - 핀 번호
   * @returns {{ x: number, y: number, z: number } | null} 위치
   */
  pinPosition(id: number): { x: number; y: number; z: number } | null {
    const pin = this.pins.find((item) => item.id === id)
    if (!pin || !pin.inPlay) {
      return null
    }
    const t = pin.body.translation()
    return { x: t.x, y: t.y, z: t.z }
  }

  /**
   * 볼의 현재 위치를 반환한다. 없으면 null이다.
   * @returns {{ x: number, y: number, z: number } | null} 위치
   */
  ballPosition(): { x: number; y: number; z: number } | null {
    if (!this.ballBody) {
      return null
    }
    const t = this.ballBody.translation()
    return { x: t.x, y: t.y, z: t.z }
  }

  /**
   * 볼의 현재 속도를 반환한다. 없으면 null이다.
   * @returns {{ x: number, y: number, z: number } | null} 속도
   */
  ballVelocity(): { x: number; y: number; z: number } | null {
    if (!this.ballBody) {
      return null
    }
    const v = this.ballBody.linvel()
    return { x: v.x, y: v.y, z: v.z }
  }

  /**
   * 스트라이크 여부와 넘어진 핀을 묶어서 반환한다.
   * @returns {{ pinsDown: number[], isStrike: boolean }} 판정
   */
  pinResult(): { pinsDown: number[]; isStrike: boolean } {
    const down = this.pinsDown()
    return { pinsDown: down, isStrike: isStrike(down) }
  }

  /**
   * 볼 메시 표시 여부를 바꾼다. 볼 1인칭 시점에서 껍질을 감출 때 쓴다.
   * @param {boolean} visible - 표시 여부
   */
  setBallVisible(visible: boolean): void {
    if (this.ballBody) {
      this.ballMesh.visible = visible
    }
  }

  /**
   * Rapier 볼 메시를 숨기고 바디를 제거한다.
   */
  hideBall(): void {
    this.ballMesh.visible = false
  }

  /**
   * 자원을 해제한다.
   */
  dispose(): void {
    this.world?.free()
    this.world = null
  }

  /**
   * 최대 안정화 시간을 반환한다.
   * @returns {number} 초
   */
  maxSettleTime(): number {
    return PIN_SETTLE_MAX_S
  }

  /** 핀 하나를 스팟에 똑바로 세운다. */
  private standPin(pin: PinBody, spotX: number, spotZ: number): void {
    const x = physXToThree(spotX)
    const z = this.restSpotZ + spotZ
    pin.body.setTranslation({ x, y: PIN_HEIGHT / 2 + 0.002, z }, true)
    pin.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true)
    pin.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    pin.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    pin.body.wakeUp()
    pin.mesh.visible = true
    pin.mesh.position.set(x, 0, z)
    pin.mesh.quaternion.set(0, 0, 0, 1)
    pin.inPlay = true
  }

  /** 핀을 물리 월드 밖으로 보내고 감춘다. */
  private sendOffstage(pin: PinBody): void {
    pin.body.setTranslation({ x: 0, y: OFFSTAGE_Y, z: 0 }, true)
    pin.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    pin.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    pin.body.sleep()
    pin.mesh.visible = false
    pin.inPlay = false
  }

  /** 핀세터가 집어든 핀. 물리에서 빼고 메시만 스팟 위에 띄운다. */
  private parkPin(pin: PinBody, height: number): void {
    const spot = createPinSpots().find((item) => item.id === pin.id)
    if (!spot) {
      return
    }
    const x = physXToThree(spot.x)
    const z = this.restSpotZ + spot.z
    pin.body.setTranslation({ x, y: OFFSTAGE_Y, z }, true)
    pin.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    pin.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    pin.body.sleep()
    pin.mesh.visible = true
    pin.mesh.position.set(x, height, z)
    pin.mesh.quaternion.set(0, 0, 0, 1)
  }

  /** 스위프바 물리·메시를 같은 자리로 옮긴다. */
  private moveSweep(y: number, z: number): void {
    this.sweepBody?.setNextKinematicTranslation({ x: 0, y, z })
    this.sweepMesh?.position.set(0, y, z)
  }

  /** 핀덱·피트·킥백·백스톱 충돌체를 만든다. */
  private createDeckColliders(): void {
    if (!this.world) {
      return
    }
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
    const add = (
      hx: number, hy: number, hz: number,
      x: number, y: number, z: number,
      friction: number, restitution: number,
    ): void => {
      this.world?.createCollider(
        RAPIER.ColliderDesc.cuboid(hx, hy, hz)
          .setTranslation(x, y, z)
          .setFriction(friction)
          .setRestitution(restitution),
        body,
      )
    }

    // 핀덱 바닥. 공이 인계되는 지점보다 조금 앞에서 시작한다.
    const deckStart = LANE_LENGTH - 0.6
    const deckLength = PIN_DECK_END - deckStart
    add(KICKBACK_X, 0.03, deckLength / 2, 0, -0.03, deckStart + deckLength / 2, 0.45, 0.12)

    // 피트 바닥. 여기 떨어진 핀과 공은 다시 올라오지 않는다.
    const pitLength = PIT_END - PIN_DECK_END
    add(KICKBACK_X, 0.03, pitLength / 2, 0, -PIT_DEPTH - 0.03, PIN_DECK_END + pitLength / 2, 0.7, 0.02)

    // 핀덱 끝 낙차면.
    add(KICKBACK_X, PIT_DEPTH / 2, 0.025, 0, -PIT_DEPTH / 2, PIN_DECK_END + 0.025, 0.4, 0.1)

    // 킥백 — 핀을 안쪽으로 되튕긴다. 실제 볼링장처럼 잘 튀게 반발을 높인다.
    // 충돌체는 보이는 벽보다 두껍게 잡는다. 얇으면 빠른 핀이 뚫고 나간다.
    const wallLength = PIT_END - deckStart
    const wallHalfHeight = (KICKBACK_HEIGHT + PIT_DEPTH) / 2
    const wallY = KICKBACK_HEIGHT / 2 - PIT_DEPTH / 2
    const wallHalfThickness = 0.2
    for (const side of [-1, 1]) {
      add(
        wallHalfThickness, wallHalfHeight, wallLength / 2,
        side * (KICKBACK_X + wallHalfThickness), wallY, deckStart + wallLength / 2,
        0.25, 0.55,
      )
    }

    // 백스톱.
    const backHalfThickness = 0.3
    add(
      KICKBACK_X + wallHalfThickness * 2, wallHalfHeight + 0.6, backHalfThickness,
      0, wallY + 0.3, PIT_END + backHalfThickness,
      0.5, 0.1,
    )

    // 피트 위쪽 덮개. 튀어오른 핀이 백스톱을 넘어가지 못하게 막는다.
    add(
      KICKBACK_X, 0.05, (PIT_END - PIN_DECK_END) / 2,
      0, KICKBACK_HEIGHT + 0.35, PIN_DECK_END + (PIT_END - PIN_DECK_END) / 2,
      0.4, 0.05,
    )
  }

  /** 핀세터 스위프바를 키네마틱 바디로 만든다. */
  private createSweepBody(): void {
    if (!this.world) {
      return
    }
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        0,
        PINSETTER.restY,
        PINSETTER.restZ,
      ),
    )
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(
        KICKBACK_X - 0.02,
        PINSETTER.barHeight / 2,
        PINSETTER.barThickness / 2,
      )
        .setFriction(0.3)
        .setRestitution(0.1),
      body,
    )
    this.sweepBody = body
  }

  private removeBall(): void {
    if (this.world && this.ballBody) {
      this.world.removeRigidBody(this.ballBody)
      this.ballBody = null
    }
    this.ballMesh.visible = false
  }

  private syncMeshes(): void {
    const offset = new Vector3()
    for (const pin of this.pins) {
      // 핀세터가 집어든 핀은 메시를 직접 움직이므로 물리 위치로 덮지 않는다.
      if (this.sweeping && this.keepIds.includes(pin.id)) {
        continue
      }
      if (!pin.inPlay) {
        continue
      }
      const t = pin.body.translation()
      const r = pin.body.rotation()
      pin.mesh.quaternion.set(r.x, r.y, r.z, r.w)
      offset.set(0, -PIN_HEIGHT / 2, 0).applyQuaternion(pin.mesh.quaternion)
      pin.mesh.position.set(t.x + offset.x, t.y + offset.y, t.z + offset.z)
    }
    if (this.ballBody) {
      const t = this.ballBody.translation()
      const r = this.ballBody.rotation()
      this.ballMesh.position.set(t.x, t.y, t.z)
      this.ballMesh.quaternion.set(r.x, r.y, r.z, r.w)
    }
  }
}
