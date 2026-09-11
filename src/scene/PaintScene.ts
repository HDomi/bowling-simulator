import {
  clearCanvas,
  createPaintCanvas,
  stampDot,
  strokeLine,
} from '@/domain/paintTexture'
import { FluidSim } from '@/scene/FluidSim'
import {
  ACESFilmicToneMapping,
  AmbientLight,
  CanvasTexture,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  Raycaster,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

/** 편집 모드. */
export type PaintMode = 'orbit' | 'fill' | 'brush' | 'drop' | 'smudge'

export type PaintStroke = {
  color: string
  radius: number
}

const BALL_RADIUS = 1
/** 되돌리기 스택 크기. 브러시 레이어만 쌓는다. */
const UNDO_LIMIT = 10

/**
 * 물방울 반경 = 브러시 반경 × 이 값.
 *
 * 물방울은 찍은 자리에서 더 퍼지므로 브러시와 같은 수치를 쓰면 훨씬 크게 보인다.
 */
const DROP_RADIUS_SCALE = 0.85

/** 손가락 반경 배율. 브러시보다 굵으면 결이 뭉개진다. */
const SMUDGE_RADIUS_SCALE = 0.8

/** 끌면서 물방울을 흘릴 때의 최소 간격(반경 배수). */
const DROP_SPACING = 1.6

/**
 * 이음매를 넘는 최단 UV 거리를 잰다.
 * @param {{ u: number, v: number }} a - 시작
 * @param {{ u: number, v: number }} b - 끝
 * @returns {number} 거리
 */
function uvDistance(a: { u: number; v: number }, b: { u: number; v: number }): number {
  let du = b.u - a.u
  if (du > 0.5) {
    du -= 1
  } else if (du < -0.5) {
    du += 1
  }
  return Math.hypot(du, b.v - a.v)
}

/**
 * 볼 표면에 직접 칠하는 편집 씬.
 *
 * 레이어를 둘로 나눈다 — 아래가 유체(지금은 단색), 위가 브러시. 합성본을 볼 메시가 쓴다.
 * 유체 시뮬은 4단계에서 아래 레이어에만 붙인다.
 */
export class PaintScene {
  private renderer: WebGLRenderer
  private scene = new Scene()
  private camera: PerspectiveCamera
  private controls: OrbitControls
  private ball: Mesh<SphereGeometry, MeshPhysicalMaterial>
  private raycaster = new Raycaster()
  private pointer = new Vector2()
  private animFrame = 0

  /** 아래 레이어. GPU에서 도는 유체를 저장할 때만 이 캔버스로 읽어 낸다. */
  readonly fluid = createPaintCanvas('#b8532f')
  /** 위 레이어. 브러시 선. 대부분 투명하다. */
  readonly brush = createPaintCanvas()
  private brushTexture: CanvasTexture
  private sim: FluidSim
  private clock = 0

  private mode: PaintMode = 'orbit'
  private stroke: PaintStroke = { color: '#f2e8d5', radius: 0.024 }
  private drawing = false
  private lastUv: { u: number; v: number } | null = null
  private orbitOverride = false
  private undoStack: ImageData[] = []
  /** 브러시 레이어가 바뀔 때 알린다. 되돌리기 버튼 상태에 쓴다. */
  onChange: (() => void) | null = null

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.outputColorSpace = SRGBColorSpace
    this.renderer.toneMapping = ACESFilmicToneMapping

    this.camera = new PerspectiveCamera(38, 1, 0.1, 50)
    this.camera.position.set(0, 0.4, 3.6)

    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enableDamping = true
    this.controls.enablePan = false
    this.controls.minDistance = 2.4
    this.controls.maxDistance = 6

    this.scene.add(new AmbientLight(new Color('#fff8e9'), 1.15))
    this.scene.add(new HemisphereLight(new Color('#fffdf5'), new Color('#b0a98c'), 1.3))
    const sun = new DirectionalLight(new Color('#fff4dc'), 2.1)
    sun.position.set(-3, 4, 5)
    this.scene.add(sun)

    this.sim = new FluidSim(this.renderer)
    this.sim.reset('#b8532f')

    this.brushTexture = new CanvasTexture(this.brush)
    this.brushTexture.colorSpace = SRGBColorSpace

    // 페인팅이 그대로 보여야 하므로 껍질은 불투명하고 반사도 낮게 둔다.
    const material = new MeshPhysicalMaterial({
      map: this.sim.texture,
      roughness: 0.32,
      metalness: 0,
      clearcoat: 0.5,
      clearcoatRoughness: 0.25,
      envMapIntensity: 0.6,
    })
    // 브러시 레이어를 유체 위에 얹는다. 합성용 캔버스를 매 프레임 다시 그리는 것보다
    // 셰이더에서 한 번 섞는 편이 싸다.
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uBrush = { value: this.brushTexture }
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform sampler2D uBrush;',
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
           vec4 brushTexel = texture2D(uBrush, vMapUv);
           diffuseColor.rgb = mix(diffuseColor.rgb, brushTexel.rgb, brushTexel.a);`,
        )
    }
    this.ball = new Mesh(new SphereGeometry(BALL_RADIUS, 96, 64), material)
    this.scene.add(this.ball)

    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('pointermove', this.onPointerMove)
    window.addEventListener('pointerup', this.onPointerUp)
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)

    this.resize()
    this.loop()
  }

  /**
   * 편집 모드를 바꾼다. 회전 외의 모드에서는 볼을 고정한다.
   * @param {PaintMode} mode - 모드
   */
  setMode(mode: PaintMode): void {
    this.mode = mode
    this.syncControls()
  }

  /**
   * 브러시 색과 크기를 바꾼다.
   * @param {PaintStroke} stroke - 브러시 설정
   */
  setStroke(stroke: PaintStroke): void {
    this.stroke = { ...stroke }
  }

  /**
   * 아래 레이어를 단색으로 덮는다.
   * @param {string} color - 배경색
   */
  fillBase(color: string): void {
    this.sim.reset(color)
  }

  /**
   * 저장된 유체 레이어를 이어받는다.
   * @param {HTMLCanvasElement} source - 불러온 이미지가 그려진 캔버스
   */
  loadFluid(source: HTMLCanvasElement): void {
    const texture = new CanvasTexture(source)
    texture.colorSpace = SRGBColorSpace
    texture.needsUpdate = true
    this.sim.loadFrom(texture)
    texture.dispose()
  }

  /**
   * 지금 유체 상태를 저장용 캔버스로 읽어 낸다. 저장 직전에만 부른다.
   */
  syncFluidCanvas(): void {
    this.sim.readToCanvas(this.fluid)
  }

  /** 유체가 아직 흐르는 중인지. 저장 전에 정착을 기다릴 때 쓴다. */
  get fluidRunning(): boolean {
    return this.sim.running
  }

  /**
   * 브러시 레이어를 지운다.
   */
  clearBrush(): void {
    this.pushUndo()
    clearCanvas(this.brush)
    this.refresh()
  }

  /**
   * 브러시 획을 한 단계 되돌린다.
   * @returns {boolean} 되돌릴 게 있었는지
   */
  undo(): boolean {
    const previous = this.undoStack.pop()
    if (!previous) {
      return false
    }
    this.brush.getContext('2d')?.putImageData(previous, 0, 0)
    this.refresh()
    return true
  }

  /** 되돌릴 획이 남아 있는지. */
  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  /**
   * 두 레이어를 다시 합성해 볼에 반영한다.
   */
  refresh(): void {
    this.brushTexture.needsUpdate = true
    this.onChange?.()
  }

  /**
   * 캔버스 해상도를 컨테이너에 맞춘다.
   */
  resize(): void {
    const width = Math.max(this.canvas.clientWidth, 1)
    const height = Math.max(this.canvas.clientHeight, 1)
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  /**
   * 자원을 해제한다.
   */
  dispose(): void {
    cancelAnimationFrame(this.animFrame)
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('pointermove', this.onPointerMove)
    window.removeEventListener('pointerup', this.onPointerUp)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    this.controls.dispose()
    this.ball.geometry.dispose()
    this.ball.material.dispose()
    this.brushTexture.dispose()
    this.sim.dispose()
    this.renderer.dispose()
  }

  /** 회전 모드이거나 Ctrl을 누르고 있으면 궤도 조작을 켠다. */
  private syncControls(): void {
    this.controls.enabled = this.mode === 'orbit' || this.orbitOverride
  }

  /** 브러시 레이어 스냅샷을 쌓는다. */
  private pushUndo(): void {
    const ctx = this.brush.getContext('2d')
    if (!ctx) {
      return
    }
    this.undoStack.push(ctx.getImageData(0, 0, this.brush.width, this.brush.height))
    if (this.undoStack.length > UNDO_LIMIT) {
      this.undoStack.shift()
    }
  }

  /**
   * 포인터 위치의 볼 표면 UV를 구한다.
   * @param {PointerEvent} event - 포인터 이벤트
   * @returns {{ u: number, v: number } | null} UV. 볼을 벗어나면 null
   */
  private uvAt(event: PointerEvent): { u: number; v: number } | null {
    const rect = this.canvas.getBoundingClientRect()
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    )
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const hit = this.raycaster.intersectObject(this.ball, false)[0]
    if (!hit?.uv) {
      return null
    }
    // 캔버스 좌표계로 돌려준다 — 위가 v=0. 브러시 레이어가 그 기준이다.
    return { u: hit.uv.x, v: 1 - hit.uv.y }
  }

  /**
   * 캔버스 기준 UV를 유체 버퍼 기준으로 뒤집는다.
   *
   * 렌더 타깃은 아래에서 위로(v=0이 아래) 쌓인다. 캔버스는 반대다.
   * 이걸 안 뒤집으면 클릭한 곳의 위아래 반대편에 물방울이 떨어진다.
   *
   * @param {{ u: number, v: number }} uv - 캔버스 기준 UV
   * @returns {{ u: number, v: number }} 유체 버퍼 기준 UV
   */
  private toFluidUv(uv: { u: number; v: number }): { u: number; v: number } {
    return { u: uv.u, v: 1 - uv.v }
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (this.controls.enabled) {
      return
    }
    const uv = this.uvAt(event)
    if (!uv) {
      return
    }
    if (this.mode === 'fill') {
      this.fillBase(this.stroke.color)
      return
    }
    if (this.mode === 'drop') {
      // 누른 채 끌면 스포이트처럼 계속 떨어진다.
      this.drawing = true
      this.lastUv = uv
      this.dropAt(uv)
      return
    }
    if (this.mode === 'smudge') {
      this.drawing = true
      this.lastUv = uv
      return
    }
    if (this.mode !== 'brush') {
      return
    }
    this.pushUndo()
    this.drawing = true
    this.lastUv = uv
    stampDot(this.brush, uv.u, uv.v, this.stroke.radius, this.stroke.color)
    this.refresh()
  }

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.drawing) {
      return
    }
    if (this.mode === 'drop') {
      const next = this.uvAt(event)
      if (!next) {
        this.lastUv = null
        return
      }
      // 간격을 두지 않으면 한 자리에 수십 번 찍혀 한 덩어리가 된다.
      const gap = this.lastUv ? uvDistance(this.lastUv, next) : Infinity
      if (gap >= this.stroke.radius * DROP_SPACING) {
        this.dropAt(next)
        this.lastUv = next
      }
      return
    }
    if (this.mode === 'smudge') {
      const next = this.uvAt(event)
      if (!next) {
        this.lastUv = null
        return
      }
      if (this.lastUv) {
        this.sim.smudge(
          this.toFluidUv(this.lastUv),
          this.toFluidUv(next),
          this.stroke.radius * SMUDGE_RADIUS_SCALE,
        )
      }
      this.lastUv = next
      return
    }
    if (this.mode !== 'brush') {
      return
    }
    const uv = this.uvAt(event)
    if (!uv) {
      // 볼 밖으로 나가면 선을 끊는다. 이어 그리면 반대편에 줄이 생긴다.
      this.lastUv = null
      return
    }
    if (this.lastUv) {
      strokeLine(this.brush, this.lastUv, uv, this.stroke.radius, this.stroke.color)
    } else {
      stampDot(this.brush, uv.u, uv.v, this.stroke.radius, this.stroke.color)
    }
    this.lastUv = uv
    this.refresh()
  }

  /**
   * 한 지점에 물방울을 떨어뜨린다.
   * @param {{ u: number, v: number }} uv - 캔버스 기준 UV
   */
  private dropAt(uv: { u: number; v: number }): void {
    const fluid = this.toFluidUv(uv)
    this.sim.drop(fluid.u, fluid.v, this.stroke.color, this.stroke.radius * DROP_RADIUS_SCALE)
  }

  /**
   * 볼을 무작위로 돌려 색을 섞는다.
   */
  mixColors(): void {
    this.sim.startSpin()
  }

  private onPointerUp = (): void => {
    this.drawing = false
    this.lastUv = null
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Control' && event.key !== 'Meta') {
      return
    }
    this.orbitOverride = true
    // 그리던 중이면 획을 끊는다. 모드가 바뀐 채로 이어지면 선이 튄다.
    this.drawing = false
    this.lastUv = null
    this.syncControls()
  }

  private onKeyUp = (event: KeyboardEvent): void => {
    if (event.key !== 'Control' && event.key !== 'Meta') {
      return
    }
    this.orbitOverride = false
    this.syncControls()
  }

  private loop = (): void => {
    this.animFrame = requestAnimationFrame(this.loop)
    const now = performance.now() / 1000
    const dt = this.clock ? Math.min(now - this.clock, 0.1) : 1 / 60
    this.clock = now

    this.sim.step(dt)
    // 유체는 핑퐁이라 패스마다 텍스처 객체가 바뀐다. 재질을 지금 것에 다시 묶는다.
    // 이걸 빼면 저장해 둔 페인팅을 불러와도 화면에는 직전 버퍼가 남는다.
    if (this.ball.material.map !== this.sim.texture) {
      this.ball.material.map = this.sim.texture
    }
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }
}
