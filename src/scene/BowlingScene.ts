import {
  BALL_RADIUS,
  DEFAULT_BALL_WEIGHT_LB,
  GUTTER_DEPTH,
  GUTTER_WIDTH,
  LANE_LENGTH,
  LANE_WIDTH,
  LIGHTING,
} from '@/domain/constants'
import type { PathSample, Pattern, ShotResult } from '@/domain/types'
import { physXToThree, sampleToBallPos } from '@/scene/coords'
import { CEILING_GROUP_NAME, createAlley } from '@/scene/createAlley'
import { createPinDeck, SWEEP_BAR_NAME } from '@/scene/createPinDeck'
import { applyBallLook, createBallMesh, DEFAULT_BALL_LOOK, type BallLook } from '@/scene/createBallMesh'
import { createLane } from '@/scene/createLane'
import { createLights } from '@/scene/createLights'
import { createOilOverlay, updateOilOverlay } from '@/scene/oilTexture'
import { PinDeckPhysics } from '@/scene/PinDeckPhysics'
import { createTrail, disposeTrail } from '@/scene/trail'
import {
  ACESFilmicToneMapping,
  Clock,
  Color,
  Group,
  Mesh,
  PMREMGenerator,
  PerspectiveCamera,
  Quaternion,
  SRGBColorSpace,
  Scene,
  Vector3,
  WebGLRenderer,
  PCFSoftShadowMap,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { Line2 } from 'three/addons/lines/Line2.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'

export type CameraPreset = 1 | 2 | 3 | 4

type PinFinish = (result: { pinsDown: number[]; isStrike: boolean }) => void

/** 홈에 빠진 공이 자리를 잡는 빠르기. 클수록 홈 안쪽으로 빨리 내려앉는다. */
const GUTTER_SETTLE_RATE = 6
/** 홈 연출 최대 시간(s). 어떤 경우에도 재생이 멈춰 있지 않게 한다. */
const GUTTER_RUN_MAX_S = 6

/**
 * Three.js 레인 씬과 샷 재생을 관리한다.
 */
export class BowlingScene {
  private renderer: WebGLRenderer
  private scene = new Scene()
  private camera: PerspectiveCamera
  private controls: OrbitControls
  private clock = new Clock()
  private animFrame = 0
  private pathBall: Mesh
  private oilOverlay: Mesh
  private pinDeck: PinDeckPhysics
  private trail: Line2 | null = null
  /** 직전 볼의 비교 궤적. 재생 중에도 그대로 둔다. */
  private ghost: Line2 | null = null
  private shot: ShotResult | null = null
  private ballWeightLb: number = DEFAULT_BALL_WEIGHT_LB
  private playTime = 0
  private phase: 'idle' | 'roll' | 'gutter' | 'pins' | 'sweep' = 'idle'
  private onSweepDone: (() => void) | null = null
  /** 대기 상태를 되돌릴 때 쓰는 마지막 예상 궤적. */
  private lastPreview: ShotResult | null = null
  /** 볼 시점이 아닐 때 공을 보여줄지. */
  private pathBallShouldShow = true
  private pinTime = 0
  private gutterTime = 0
  private gutterSpeed = 0
  private gutterTargetX = 0
  private gutterSpin: PathSample | null = null
  private cameraPreset: CameraPreset = 1
  private alley: Group
  private onPinFinish: PinFinish | null = null
  private pathIndex = 0
  private spinAxis = new Vector3()
  private spinDelta = new Quaternion()
  ready: Promise<void>

  constructor(
    private canvas: HTMLCanvasElement,
    ballLook: BallLook = DEFAULT_BALL_LOOK,
  ) {
    this.scene.background = new Color('#f5f1e7')
    this.pinDeck = new PinDeckPhysics(ballLook)
    this.camera = new PerspectiveCamera(42, 1, 0.05, 80)
    this.renderer = new WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = PCFSoftShadowMap
    this.renderer.outputColorSpace = SRGBColorSpace
    this.renderer.toneMapping = ACESFilmicToneMapping
    this.renderer.toneMappingExposure = LIGHTING.toneMappingExposure

    const pmrem = new PMREMGenerator(this.renderer)
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    this.scene.environmentIntensity = LIGHTING.environmentIntensity
    pmrem.dispose()

    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enableDamping = true
    this.controls.maxPolarAngle = Math.PI * 0.48
    this.controls.minDistance = 1.2
    this.controls.maxDistance = 28

    this.scene.add(createLane())
    this.alley = createAlley()
    this.scene.add(this.alley)
    const pinDeckRig = createPinDeck()
    this.scene.add(pinDeckRig)
    const sweepMesh = pinDeckRig.getObjectByName(SWEEP_BAR_NAME)
    if (sweepMesh instanceof Mesh) {
      this.pinDeck.attachSweepMesh(sweepMesh)
    }
    this.scene.add(createLights())
    this.scene.add(this.pinDeck.group)

    this.pathBall = createBallMesh(ballLook)
    this.pathBall.position.set(0, BALL_RADIUS, 0)
    this.scene.add(this.pathBall)

    this.camera.position.set(0, 1.35, -3.2)
    this.controls.target.set(0, 0.2, 1.2)

    this.oilOverlay = createOilOverlay({
      id: 'empty',
      name: 'empty',
      distanceFt: 41,
      segmentFt: 1,
      source: 'preset',
      grid: [Array.from({ length: 39 }, () => 0)],
    })
    this.scene.add(this.oilOverlay)

    this.applyCameraPreset(1)
    this.resize()
    this.ready = this.pinDeck.init()
    this.loop()
  }

  /**
   * 오일 오버레이를 교체한다.
   * @param {Pattern} pattern - 패턴
   */
  setPattern(pattern: Pattern): void {
    updateOilOverlay(this.oilOverlay, pattern)
  }

  /**
   * 레인 위 볼과 핀덱 볼의 외관을 바꾼다. 볼을 전환했을 때 부른다.
   * @param {BallLook} look - 볼 외관
   */
  setBallLook(look: BallLook): void {
    applyBallLook(this.pathBall, look)
    this.pinDeck.setBallLook(look)
  }

  /**
   * 직전 볼의 비교 궤적을 겹쳐 보인다. null이면 지운다.
   * @param {ShotResult | null} result - 비교 샷
   */
  showGhost(result: ShotResult | null): void {
    if (this.ghost) {
      this.scene.remove(this.ghost)
      disposeTrail(this.ghost)
      this.ghost = null
    }
    if (!result) {
      return
    }
    const ghost = this.makeTrail(result, true)
    this.scene.add(ghost)
    this.ghost = ghost
  }

  /**
   * 굴리기 전에 예상 궤적만 갱신한다. 재생 중이면 건드리지 않는다.
   * @param {ShotResult} result - 예상 샷
   */
  showPreview(result: ShotResult): void {
    if (this.phase !== 'idle') {
      return
    }
    this.lastPreview = result
    // 핀덱은 건드리지 않는다. 2구 대기 중에 슬라이더를 만지면 남은 핀이 되살아난다.
    this.pinDeck.hideBall()
    this.showReady(result)
  }

  /**
   * 굴리기 전 대기 화면을 만든다. 궤적을 그리고 공을 릴리즈 지점에 놓는다.
   *
   * 프레임 시작·핀세터 종료처럼 공을 치웠던 뒤에도 이걸로 되돌린다.
   * @param {ShotResult} result - 예상 샷
   */
  private showReady(result: ShotResult): void {
    this.clearTrail()
    const trail = this.makeTrail(result)
    this.scene.add(trail)
    this.trail = trail
    this.pathBallShouldShow = true
    this.pathBall.visible = this.cameraPreset !== 2
    this.pathBall.quaternion.identity()
    const start = result.path[0]
    if (start) {
      this.pathBall.position.copy(sampleToBallPos(start, BALL_RADIUS))
    }
  }

  /**
   * 공을 릴리즈 지점에 되돌리고, 추적 시점이면 카메라도 그 자리로 끌어온다.
   */
  private restoreReadyState(): void {
    if (!this.lastPreview) {
      return
    }
    this.showReady(this.lastPreview)
    if (this.cameraPreset === 1) {
      this.snapTrackCamera()
    }
  }

  /** 추적 카메라를 공 위치로 즉시 맞춘다. 보간 없이 한 번에 붙인다. */
  private snapTrackCamera(): void {
    const ballPos = this.pathBall.position
    this.camera.position.set(ballPos.x * 0.4, 1.35, ballPos.z - 3.2)
    this.controls.target.set(ballPos.x, 0.2, ballPos.z + 1.2)
    this.controls.update()
  }

  /**
   * 카메라 프리셋을 적용한다.
   * @param {CameraPreset} preset - 1 추적 / 2 볼 시점 / 3 핀덱 / 4 볼러
   */
  applyCameraPreset(preset: CameraPreset): void {
    this.cameraPreset = preset

    const ceiling = this.alley.getObjectByName(CEILING_GROUP_NAME)
    if (ceiling) {
      ceiling.visible = true
    }
    // 추적과 볼 시점은 매 프레임 카메라를 직접 몰기 때문에 궤도 조작을 끈다.
    if (preset === 1 || preset === 2) {
      this.controls.enabled = false
      if (preset === 2) {
        this.updateBallCamera()
      }
      return
    }
    this.controls.enabled = true
    if (preset === 3) {
      // 피트 벽보다 앞에 두어야 핀이 가리지 않는다.
      this.camera.position.set(physXToThree(0.28), 0.92, LANE_LENGTH + 1.24)
      this.controls.target.set(0, 0.26, LANE_LENGTH + 0.3)
    } else {
      this.camera.position.set(-5.6, 13, -7)
      this.controls.target.set(0, 0, 8.5)
    }
    this.controls.update()
  }

  /**
   * 샷 궤적을 재생한 뒤 핀 충돌로 넘긴다.
   * @param {ShotResult} result - 시뮬 결과
   * @param {PinFinish} onPinFinish - 핀 판정 콜백
   * @param {number} weightLb - 볼 무게(lb). 핀덱 충돌 질량에 쓴다.
   */
  playShot(
    result: ShotResult,
    onPinFinish: PinFinish,
    weightLb = DEFAULT_BALL_WEIGHT_LB,
    resetDeck = true,
  ): void {
    if (!this.pinDeck.world) {
      void this.ready.then(() => this.playShot(result, onPinFinish, weightLb, resetDeck))
      return
    }
    this.ballWeightLb = weightLb
    this.clearTrail()
    this.shot = result
    this.playTime = 0
    this.pathIndex = 0
    this.phase = 'roll'
    this.pinTime = 0
    this.onPinFinish = onPinFinish
    // 2구째는 남아 있는 핀을 그대로 두고 굴린다.
    if (resetDeck) {
      this.pinDeck.resetPins()
    }
    this.pinDeck.hideBall()
    this.pathBallShouldShow = true
    this.pathBall.visible = this.cameraPreset !== 2
    this.pathBall.quaternion.identity()
    const trail = this.makeTrail(result)
    this.scene.add(trail)
    this.trail = trail
    const start = result.path[0]
    if (start) {
      this.pathBall.position.copy(sampleToBallPos(start, BALL_RADIUS))
    }
  }

  /**
   * 캔버스 크기를 맞춘다.
   */
  resize(): void {
    const width = this.canvas.clientWidth
    const height = this.canvas.clientHeight
    if (width === 0 || height === 0) {
      return
    }
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)
    for (const line of [this.trail, this.ghost]) {
      if (line?.material instanceof LineMaterial) {
        line.material.resolution.set(width, height)
      }
    }
  }

  /**
   * 렌더 루프와 Rapier를 정지한다.
   */
  dispose(): void {
    cancelAnimationFrame(this.animFrame)
    this.clearTrail()
    this.showGhost(null)
    this.pinDeck.dispose()
    this.controls.dispose()
    this.renderer.dispose()
  }

  private loop = (): void => {
    this.animFrame = requestAnimationFrame(this.loop)
    const dt = Math.min(this.clock.getDelta(), 0.05)
    this.updatePlayback(dt)
    this.updateTrackCamera()
    this.updateBallCamera()
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

  private updatePlayback(dt: number): void {
    if (this.phase === 'roll' && this.shot) {
      this.playTime += dt
      const path = this.shot.path
      while (
        this.pathIndex < path.length - 1 &&
        path[this.pathIndex + 1].t <= this.playTime
      ) {
        this.pathIndex += 1
      }
      const sample = path[this.pathIndex]
      this.pathBall.position.copy(sampleToBallPos(sample, BALL_RADIUS))
      this.spinBall(sample, dt)

      // 공이 핀에 닿기 전에 물리로 넘긴다. 끝까지 재생하면 핀을 통과해 보인다.
      // 거터로 빠진 샷은 궤적이 홈에 닿는 지점에서 끝나므로 그 끝까지 재생한다.
      const ended =
        sample.y >= this.shot.pinEntry.y || this.pathIndex >= path.length - 1
      if (ended) {
        if (this.shot.gutter) {
          this.startGutterRun(sample)
          return
        }
        this.phase = 'pins'
        this.pinTime = 0
        this.pathBallShouldShow = false
        this.pathBall.visible = false
        this.pinDeck.launchBall(this.shot.pinEntry, this.ballWeightLb)
      }
    }

    if (this.phase === 'gutter') {
      this.updateGutterRun(dt)
    }

    if (this.phase === 'pins') {
      this.pinDeck.step(dt)
      this.pinTime += dt
      if (this.pinTime > 0.6 && (this.pinDeck.isSettled() || this.pinTime > this.pinDeck.maxSettleTime())) {
        this.phase = 'idle'
        this.onPinFinish?.(this.pinDeck.pinResult())
      }
    }

    if (this.phase === 'sweep') {
      // 쓰러진 핀이 스위프바에 밀리도록 물리도 같이 돌린다.
      this.pinDeck.step(dt)
      if (this.pinDeck.updateSweep(dt)) {
        this.phase = 'idle'
        // 다음 투구를 위해 공과 카메라를 릴리즈 지점으로 되돌린다.
        this.restoreReadyState()
        const done = this.onSweepDone
        this.onSweepDone = null
        done?.()
      }
    }
  }

  /**
   * 핀세터를 돌린다. 남은 핀을 들어올리고 쓰러진 핀을 피트로 쓸어낸 뒤 다시 세운다.
   * @param {number[]} keepIds - 남길 핀 번호
   * @param {() => void} onDone - 동작이 끝나면 호출
   */
  runPinsetter(keepIds: number[], onDone: () => void): void {
    if (!this.pinDeck.world) {
      void this.ready.then(() => this.runPinsetter(keepIds, onDone))
      return
    }
    this.clearTrail()
    this.pathBallShouldShow = false
    this.pathBall.visible = false
    this.onSweepDone = onDone
    this.phase = 'sweep'
    this.pinDeck.startSweep(keepIds)
  }

  /**
   * 핀덱을 10핀 상태로 되돌린다.
   */
  resetDeck(): void {
    if (!this.pinDeck.world) {
      void this.ready.then(() => this.resetDeck())
      return
    }
    this.phase = 'idle'
    this.onSweepDone = null
    this.pinDeck.resetPins()
    // 프레임을 시작해도 공은 릴리즈 지점에 놓여 있어야 한다.
    this.restoreReadyState()
  }

  /**
   * 홈으로 빠지는 연출을 시작한다.
   *
   * 물리 궤적은 공 중심이 레인을 벗어나는 순간 끊긴다. 그 뒤로 홈을 타고 핀덱까지
   * 굴러가는 구간은 판정에 쓰이지 않으므로 여기서 연출로만 만든다.
   * @param {PathSample} sample - 궤적 마지막 샘플
   */
  private startGutterRun(sample: PathSample): void {
    this.phase = 'gutter'
    this.gutterTime = 0
    this.gutterSpin = sample
    this.gutterSpeed = Math.max(Math.abs(sample.vy), 1.5)
    const side = Math.sign(sample.x) || 1
    this.gutterTargetX = physXToThree(side * (LANE_WIDTH / 2 + GUTTER_WIDTH / 2))
  }

  /**
   * 홈에 빠진 공을 핀덱 너머까지 굴려 보낸 뒤 0핀으로 마무리한다.
   * @param {number} dt - 프레임 시간(s)
   */
  private updateGutterRun(dt: number): void {
    const ball = this.pathBall
    const settle = Math.min(1, dt * GUTTER_SETTLE_RATE)
    ball.position.z += this.gutterSpeed * dt
    ball.position.x += (this.gutterTargetX - ball.position.x) * settle
    ball.position.y += (BALL_RADIUS - GUTTER_DEPTH - ball.position.y) * settle
    if (this.gutterSpin) {
      this.spinBall(this.gutterSpin, dt)
    }

    this.gutterTime += dt
    // 핀덱을 지나면 시야 밖이다. 아주 느리게 빠진 공을 대비해 시간으로도 끊는다.
    if (ball.position.z > LANE_LENGTH + 1 || this.gutterTime > GUTTER_RUN_MAX_S) {
      this.phase = 'idle'
      this.gutterSpin = null
      ball.visible = false
      this.onPinFinish?.({ pinsDown: [], isStrike: false })
    }
  }

  /**
   * 각속도만큼 볼을 돌린다. 물리축(x 좌우, y 진행, z 위)을 씬 축으로 옮겨 쓴다.
   * @param {PathSample} sample - 현재 궤적 샘플
   * @param {number} dt - 프레임 시간(s)
   */
  private spinBall(sample: PathSample, dt: number): void {
    this.spinAxis.set(-sample.wx, sample.wz, sample.wy)
    const rate = this.spinAxis.length()
    if (rate < 1e-6) {
      return
    }
    this.spinDelta.setFromAxisAngle(this.spinAxis.divideScalar(rate), rate * dt)
    this.pathBall.quaternion.premultiply(this.spinDelta)
  }

  /**
   * 볼 1인칭 시점. 공 중심에서 진행 방향을 본다.
   *
   * 카메라가 공 안에 있으므로 이 시점에서는 공 메시를 감춘다.
   */
  private updateBallCamera(): void {
    if (this.cameraPreset !== 2) {
      this.pathBall.visible = this.pathBallShouldShow
      this.pinDeck.setBallVisible(true)
      return
    }

    let px = this.pathBall.position.x
    let py = this.pathBall.position.y
    let pz = this.pathBall.position.z
    let dx = 0
    let dz = 1

    if (this.phase === 'pins') {
      // 핀덱에서는 물리 볼을 따라간다.
      const pos = this.pinDeck.ballPosition()
      const vel = this.pinDeck.ballVelocity()
      if (pos) {
        px = pos.x
        py = pos.y
        pz = pos.z
      }
      if (vel && Math.hypot(vel.x, vel.z) > 0.05) {
        dx = vel.x
        dz = vel.z
      }
    } else if (this.shot) {
      const sample = this.shot.path[this.pathIndex]
      if (sample) {
        dx = physXToThree(sample.vx)
        dz = sample.vy
      }
    } else if (this.lastPreview) {
      const start = this.lastPreview.path[0]
      if (start) {
        dx = physXToThree(start.vx)
        dz = start.vy
      }
    }

    const len = Math.hypot(dx, dz) || 1
    this.camera.position.set(px, py + 0.03, pz)
    this.controls.target.set(px + (dx / len) * 2, py + 0.03, pz + (dz / len) * 2)
    // 공 안에서 보므로 껍질이 시야를 가리지 않게 감춘다.
    this.pathBall.visible = false
    this.pinDeck.setBallVisible(false)
  }

  private updateTrackCamera(): void {
    if (this.cameraPreset !== 1) {
      return
    }
    const ballPos = this.pathBall.position
    this.camera.position.lerp(
      new Vector3(ballPos.x * 0.4, 1.35, ballPos.z - 3.2),
      0.08,
    )
    this.controls.target.lerp(new Vector3(ballPos.x, 0.2, ballPos.z + 1.2), 0.12)
  }

  /**
   * 현재 캔버스 해상도로 궤적 메시를 만든다.
   * @param {ShotResult} result - 샷 결과
   * @param {boolean} ghost - 비교용 고스트 여부
   * @returns {Line2} 궤적
   */
  private makeTrail(result: ShotResult, ghost = false): Line2 {
    return createTrail(
      result,
      Math.max(this.canvas.clientWidth, 1),
      Math.max(this.canvas.clientHeight, 1),
      { ghost },
    )
  }

  private clearTrail(): void {
    if (this.trail) {
      this.scene.remove(this.trail)
      disposeTrail(this.trail)
      this.trail = null
    }
  }
}
