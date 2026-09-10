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
import { createBallMesh, DEFAULT_BALL_COLORS } from '@/scene/createBallMesh'
import { createLane } from '@/scene/createLane'
import { createLights } from '@/scene/createLights'
import { createOilOverlay, updateOilOverlay } from '@/scene/oilTexture'
import { PinDeckPhysics } from '@/scene/PinDeckPhysics'
import { createTrail } from '@/scene/trail'
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
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { Line2 } from 'three/addons/lines/Line2.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'

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
  private composer: EffectComposer
  private controls: OrbitControls
  private clock = new Clock()
  private animFrame = 0
  private pathBall: Mesh
  private oilOverlay: Mesh
  private pinDeck: PinDeckPhysics
  private trail: Line2 | null = null
  private shot: ShotResult | null = null
  private ballWeightLb: number = DEFAULT_BALL_WEIGHT_LB
  private playTime = 0
  private phase: 'idle' | 'roll' | 'gutter' | 'pins' = 'idle'
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
    ballColors: [string, string] = DEFAULT_BALL_COLORS,
  ) {
    this.scene.background = new Color('#07080b')
    this.pinDeck = new PinDeckPhysics(ballColors)
    this.camera = new PerspectiveCamera(42, 1, 0.05, 80)
    this.renderer = new WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.outputColorSpace = SRGBColorSpace
    this.renderer.toneMapping = ACESFilmicToneMapping
    this.renderer.toneMappingExposure = LIGHTING.toneMappingExposure

    const pmrem = new PMREMGenerator(this.renderer)
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    this.scene.environmentIntensity = LIGHTING.environmentIntensity
    pmrem.dispose()

    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.composer.addPass(
      new UnrealBloomPass(
        new Vector2(1, 1),
        LIGHTING.bloomStrength,
        LIGHTING.bloomRadius,
        LIGHTING.bloomThreshold,
      ),
    )
    this.composer.addPass(new OutputPass())

    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enableDamping = true
    this.controls.maxPolarAngle = Math.PI * 0.48
    this.controls.minDistance = 1.2
    this.controls.maxDistance = 28

    this.scene.add(createLane())
    this.alley = createAlley()
    this.scene.add(this.alley)
    this.scene.add(createLights())
    this.scene.add(this.pinDeck.group)

    this.pathBall = createBallMesh(ballColors)
    this.pathBall.position.set(0, BALL_RADIUS, 0)
    this.scene.add(this.pathBall)

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
   * 굴리기 전에 예상 궤적만 갱신한다. 재생 중이면 건드리지 않는다.
   * @param {ShotResult} result - 예상 샷
   */
  showPreview(result: ShotResult): void {
    if (this.phase !== 'idle') {
      return
    }
    if (this.pinDeck.world) {
      this.pinDeck.resetPins()
      this.pinDeck.hideBall()
    }
    this.clearTrail()
    const trail = this.makeTrail(result)
    this.scene.add(trail)
    this.trail = trail
    this.pathBall.visible = true
    this.pathBall.quaternion.identity()
    const start = result.path[0]
    if (start) {
      this.pathBall.position.copy(sampleToBallPos(start, BALL_RADIUS))
    }
  }

  /**
   * 카메라 프리셋을 적용한다.
   * @param {CameraPreset} preset - 1 볼러 / 2 추적 / 3 핀덱 / 4 탑뷰
   */
  applyCameraPreset(preset: CameraPreset): void {
    this.cameraPreset = preset

    const ceiling = this.alley.getObjectByName(CEILING_GROUP_NAME)
    if (ceiling) {
      ceiling.visible = preset !== 4
    }
    if (preset === 2) {
      this.controls.enabled = false
      return
    }
    this.controls.enabled = true
    if (preset === 1) {
      this.camera.position.set(physXToThree(0.35), 1.45, -2.8)
      this.controls.target.set(0, 0.15, 6)
    } else if (preset === 3) {
      // 피트 벽(z = LANE_LENGTH + 1.35)보다 앞에 두어야 핀이 가리지 않는다.
      this.camera.position.set(physXToThree(0.28), 0.92, LANE_LENGTH + 1.24)
      this.controls.target.set(0, 0.26, LANE_LENGTH + 0.3)
    } else {
      this.camera.position.set(0, 13.5, LANE_LENGTH * 0.45)
      this.controls.target.set(0, 0, LANE_LENGTH * 0.48)
    }
    this.controls.update()
  }

  /**
   * 샷 궤적을 재생한 뒤 핀 충돌로 넘긴다.
   * @param {ShotResult} result - 시뮬 결과
   * @param {PinFinish} onPinFinish - 핀 판정 콜백
   * @param {number} weightLb - 볼 무게(lb). 핀덱 충돌 질량에 쓴다.
   */
  playShot(result: ShotResult, onPinFinish: PinFinish, weightLb = DEFAULT_BALL_WEIGHT_LB): void {
    if (!this.pinDeck.world) {
      void this.ready.then(() => this.playShot(result, onPinFinish, weightLb))
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
    this.pinDeck.resetPins()
    this.pinDeck.hideBall()
    this.pathBall.visible = true
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
    this.composer.setSize(width, height)
    if (this.trail?.material instanceof LineMaterial) {
      this.trail.material.resolution.set(width, height)
    }
  }

  /**
   * 렌더 루프와 Rapier를 정지한다.
   */
  dispose(): void {
    cancelAnimationFrame(this.animFrame)
    this.pinDeck.dispose()
    this.controls.dispose()
    this.renderer.dispose()
  }

  private loop = (): void => {
    this.animFrame = requestAnimationFrame(this.loop)
    const dt = Math.min(this.clock.getDelta(), 0.05)
    this.updatePlayback(dt)
    this.updateTrackCamera()
    this.controls.update()
    this.composer.render()
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

  private updateTrackCamera(): void {
    if (this.cameraPreset !== 2) {
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
   * @returns {Line2} 궤적
   */
  private makeTrail(result: ShotResult): Line2 {
    return createTrail(
      result,
      Math.max(this.canvas.clientWidth, 1),
      Math.max(this.canvas.clientHeight, 1),
    )
  }

  private clearTrail(): void {
    if (this.trail) {
      this.scene.remove(this.trail)
      this.trail.geometry.dispose()
      const mat = this.trail.material
      if (Array.isArray(mat)) {
        mat.forEach((item) => item.dispose())
      } else {
        mat.dispose()
      }
      this.trail = null
    }
  }
}
