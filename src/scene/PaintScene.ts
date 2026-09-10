import {
  clearCanvas,
  composite,
  createPaintCanvas,
  fillCanvas,
  stampDot,
  strokeLine,
} from '@/domain/paintTexture'
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
export type PaintMode = 'orbit' | 'fill' | 'brush'

export type PaintStroke = {
  color: string
  radius: number
}

const BALL_RADIUS = 1
/** 되돌리기 스택 크기. 브러시 레이어만 쌓는다. */
const UNDO_LIMIT = 10

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

  /** 아래 레이어. 배경색과 (v2에서) 유체. */
  readonly fluid = createPaintCanvas('#b8532f')
  /** 위 레이어. 브러시 선. 대부분 투명하다. */
  readonly brush = createPaintCanvas()
  private merged = createPaintCanvas()
  private texture: CanvasTexture

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

    composite(this.fluid, this.brush, this.merged)
    this.texture = new CanvasTexture(this.merged)
    this.texture.colorSpace = SRGBColorSpace

    // 페인팅이 그대로 보여야 하므로 껍질은 불투명하고 반사도 낮게 둔다.
    this.ball = new Mesh(
      new SphereGeometry(BALL_RADIUS, 96, 64),
      new MeshPhysicalMaterial({
        map: this.texture,
        roughness: 0.32,
        metalness: 0,
        clearcoat: 0.5,
        clearcoatRoughness: 0.25,
        envMapIntensity: 0.6,
      }),
    )
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
    fillCanvas(this.fluid, color)
    this.refresh()
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
    composite(this.fluid, this.brush, this.merged)
    this.texture.needsUpdate = true
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
    this.texture.dispose()
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
    return { u: hit.uv.x, v: 1 - hit.uv.y }
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
    if (!this.drawing || this.mode !== 'brush') {
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
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }
}
