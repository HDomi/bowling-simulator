import RAPIER from '@dimforge/rapier3d-compat'
import {
  BALL_RADIUS,
  DEFAULT_BALL_WEIGHT_LB,
  LANE_LENGTH,
  PIN_DOWN_TILT_DEG,
  PIN_HEIGHT,
  PIN_MASS,
  PIN_COLLIDER_RADIUS,
  PIN_PHYSICS,
  PIN_SETTLE_MAX_S,
  PIN_SETTLE_SPEED,
} from '@/domain/constants'
import { createPinSpots, isStrike } from '@/domain/pins/layout'
import { ballMassKg } from '@/domain/physics/friction'
import type { ShotResult } from '@/domain/types'
import { createBallMesh, DEFAULT_BALL_COLORS } from '@/scene/createBallMesh'
import { createPinMesh } from '@/scene/createPinMesh'
import { physXToThree } from '@/scene/coords'
import { Group, Mesh, Quaternion, Vector3 } from 'three'

type PinBody = {
  id: number
  mesh: Mesh
  body: RAPIER.RigidBody
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

  constructor(ballColors: [string, string] = DEFAULT_BALL_COLORS) {
    this.ballMesh = createBallMesh(ballColors)
    this.ballMesh.visible = false
    this.group.add(this.ballMesh)
  }

  /**
   * WASM을 초기화하고 핀 10개를 배치한다.
   */
  async init(): Promise<void> {
    await RAPIER.init()
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
    this.eventQueue = new RAPIER.EventQueue(true)

    const floor = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(4, 0.05, 6)
        .setTranslation(0, -0.05, this.restSpotZ + 0.4)
        .setFriction(0.45)
        .setRestitution(0.12),
      floor,
    )

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
      this.world.createCollider(
        RAPIER.ColliderDesc.cylinder(PIN_HEIGHT / 2, PIN_COLLIDER_RADIUS)
          .setMass(PIN_MASS)
          .setFriction(0.35)
          .setRestitution(0.48),
        body,
      )
      this.pins.push({ id: spot.id, mesh, body })
    }
  }

  /**
   * 핀을 스팟에 다시 세운다.
   */
  resetPins(): void {
    if (!this.world) {
      return
    }
    const spots = createPinSpots()
    for (const pin of this.pins) {
      const spot = spots.find((item) => item.id === pin.id)
      if (!spot) {
        continue
      }
      const z = this.restSpotZ + spot.z
      const x = physXToThree(spot.x)
      pin.body.setTranslation({ x, y: PIN_HEIGHT / 2 + 0.002, z }, true)
      pin.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true)
      pin.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
      pin.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
      pin.body.wakeUp()
      pin.mesh.position.set(x, 0, z)
      pin.mesh.quaternion.set(0, 0, 0, 1)
    }
    this.stepAccumulator = 0
    this.removeBall()
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
      const t = pin.body.translation()
      if (pinUpY(pin.body.rotation()) < threshold || t.y < PIN_HEIGHT * 0.28) {
        down.push(pin.id)
      }
    }
    return down.sort((a, b) => a - b)
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
