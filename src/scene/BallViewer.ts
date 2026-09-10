import {
  CORE_RADIUS_RATIO,
  ellipsoidSemiAxes,
  FINGER_HOLE_RADIUS_IN,
  BALL_RADIUS_IN,
  rgAxes,
  THUMB_HOLE_RADIUS_IN,
  type SurfaceMarkers,
  type Vec3,
} from '@/domain/ballGeometry'
import { LIGHTING } from '@/domain/constants'
import type { Ball } from '@/domain/types'
import { createBallMaterial, disposeBallMaterial, type BallLook } from '@/scene/createBallMesh'
import {
  ACESFilmicToneMapping,
  AmbientLight,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PMREMGenerator,
  PerspectiveCamera,
  PointLight,
  Quaternion,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

/** 뷰어는 볼 반지름을 1로 둔다. 표면 마커(단위 벡터)를 그대로 쓸 수 있다. */
const SHELL_RADIUS = 1
const AXIS_HALF_LENGTH = 1.28
const MARKER_RADIUS = 0.045
const HOLE_DEPTH = 0.22

const COLOR_PIN = new Color(LIGHTING.neonCyan)
const COLOR_MB = new Color(LIGHTING.neonMagenta)
const COLOR_INTERMEDIATE = new Color('#9b7438')
const COLOR_CG = new Color('#9b7438')
const COLOR_PAP = new Color('#30352d')

const UP = new Vector3(0, 1, 0)

/**
 * 마이볼 3D 뷰어. 반투명 볼 안에 관성 타원체와 RG 축, 표면에 핀·CG·MB·그립홀을 그린다.
 *
 * 볼 로컬 좌표 관례는 {@link rgAxes} 문서를 따른다(+Y 핀 축, +X MB 축).
 */
export class BallViewer {
  private renderer: WebGLRenderer
  private scene = new Scene()
  private camera = new PerspectiveCamera(34, 1, 0.05, 20)
  private controls: OrbitControls
  private animFrame = 0
  private ballGroup = new Group()
  private shell: Mesh<SphereGeometry, MeshPhysicalMaterial>
  private core: Mesh<SphereGeometry, MeshStandardMaterial>
  private coreWire: Mesh<SphereGeometry, MeshStandardMaterial>
  private axes: LineSegments
  private markerGroup = new Group()
  private holeGroup = new Group()
  private markerGeometry = new SphereGeometry(MARKER_RADIUS, 16, 12)
  private fingerHoleGeometry = new CylinderGeometry(
    FINGER_HOLE_RADIUS_IN / BALL_RADIUS_IN,
    FINGER_HOLE_RADIUS_IN / BALL_RADIUS_IN,
    HOLE_DEPTH,
    24,
  )
  private thumbHoleGeometry = new CylinderGeometry(
    THUMB_HOLE_RADIUS_IN / BALL_RADIUS_IN,
    THUMB_HOLE_RADIUS_IN / BALL_RADIUS_IN,
    HOLE_DEPTH,
    24,
  )
  private holeMaterial = new MeshStandardMaterial({ color: '#0a0709', roughness: 0.9 })
  private markerMaterials = new Map<string, MeshStandardMaterial>()

  constructor(private canvas: HTMLCanvasElement, ball: Ball) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.outputColorSpace = SRGBColorSpace
    this.renderer.toneMapping = ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05

    const pmrem = new PMREMGenerator(this.renderer)
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    this.scene.environmentIntensity = 0.35
    pmrem.dispose()

    this.scene.add(new AmbientLight(new Color(LIGHTING.ambientColor), 0.55))
    // 따뜻한 강한 키 라이트는 반투명 껍질을 뚫고 코어를 하얗게 씻는다. 중립색으로 약하게 둔다.
    const key = new PointLight(new Color('#dfe6ee'), 12, 12, 2)
    key.position.set(2.4, 3.2, 2.6)
    this.scene.add(key)
    const rim = new PointLight(new Color(LIGHTING.neonCyan), 9, 10, 2)
    rim.position.set(-2.8, -1.2, -2.2)
    this.scene.add(rim)

    this.camera.position.set(2.2, 1.35, 2.9)
    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enablePan = false
    this.controls.enableDamping = true
    this.controls.autoRotate = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    this.controls.autoRotateSpeed = 1.1
    this.controls.minDistance = 2.2
    this.controls.maxDistance = 6

    // 안쪽부터 그린다: 코어 → 축 → 마커 → 반투명 껍질
    this.core = new Mesh(
      new SphereGeometry(1, 48, 32),
      new MeshStandardMaterial({
        color: new Color(LIGHTING.neonCyan).multiplyScalar(0.35),
        emissive: new Color(LIGHTING.neonCyan),
        emissiveIntensity: 0.08,
        roughness: 0.6,
        metalness: 0,
        // 환경광을 죽여야 회백색으로 뜨지 않고 시안이 남는다.
        envMapIntensity: 0.15,
        transparent: true,
        opacity: 0.9,
      }),
    )
    this.core.renderOrder = 0
    this.coreWire = new Mesh(
      new SphereGeometry(1, 20, 14),
      new MeshStandardMaterial({
        color: new Color(LIGHTING.neonCyan),
        emissive: new Color(LIGHTING.neonCyan),
        emissiveIntensity: 0.05,
        wireframe: true,
        transparent: true,
        opacity: 0.5,
      }),
    )
    this.coreWire.renderOrder = 1
    this.axes = this.createAxes()
    this.axes.renderOrder = 2
    this.markerGroup.renderOrder = 3
    this.holeGroup.renderOrder = 3

    this.shell = new Mesh(new SphereGeometry(SHELL_RADIUS, 64, 48), this.makeShellMaterial(ball))
    this.shell.renderOrder = 4

    this.ballGroup.add(this.core, this.coreWire, this.axes, this.markerGroup, this.holeGroup, this.shell)
    this.scene.add(this.ballGroup)

    this.resize()
    this.loop()
  }

  /**
   * 볼 스펙·마커·과장 배율을 반영한다.
   * @param {Ball} ball - 실효 스펙 볼
   * @param {SurfaceMarkers} markers - 표면 마커
   * @param {number} exaggeration - 타원체 과장 지수
   */
  update(ball: Ball, markers: SurfaceMarkers, exaggeration: number): void {
    const axes = rgAxes(ball)
    const [sx, sy, sz] = ellipsoidSemiAxes(axes, exaggeration, CORE_RADIUS_RATIO * SHELL_RADIUS)
    this.core.scale.set(sx, sy, sz)
    this.coreWire.scale.set(sx * 1.004, sy * 1.004, sz * 1.004)

    this.rebuildMarkers(markers)
    this.rebuildHoles(markers.holes)
  }

  /**
   * 볼 색·커버·그릿만 바꾼다. 텍스처를 다시 굽는다.
   * @param {Ball} ball - 볼
   */
  setLook(ball: BallLook): void {
    const previous = this.shell.material
    this.shell.material = this.makeShellMaterial(ball)
    disposeBallMaterial(previous)
  }

  /**
   * 반투명 껍질 머티리얼. 지공은 텍스처에 안 그리고 레이아웃이 있을 때 3D 구멍으로 그린다.
   * @param {BallLook} look - 볼 외관
   * @returns {MeshPhysicalMaterial} 껍질 머티리얼
   */
  private makeShellMaterial(look: BallLook): MeshPhysicalMaterial {
    const material = createBallMaterial(look, { holes: false })
    material.transparent = true
    material.opacity = 0.42
    material.depthWrite = false
    // 클리어코트·환경 반사가 반투명 껍질에서 회백색 막으로 떠서 코어를 가린다. 뷰어에선 뺀다.
    material.clearcoat = 0
    material.iridescence = 0
    material.envMapIntensity = 0.3
    material.roughness = Math.max(material.roughness, 0.4)
    return material
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
  }

  /**
   * 렌더 루프를 멈추고 자원을 해제한다.
   */
  dispose(): void {
    cancelAnimationFrame(this.animFrame)
    this.controls.dispose()
    this.core.geometry.dispose()
    this.core.material.dispose()
    this.coreWire.geometry.dispose()
    this.coreWire.material.dispose()
    this.axes.geometry.dispose()
    if (!Array.isArray(this.axes.material)) {
      this.axes.material.dispose()
    }
    this.shell.geometry.dispose()
    disposeBallMaterial(this.shell.material)
    this.markerGeometry.dispose()
    this.fingerHoleGeometry.dispose()
    this.thumbHoleGeometry.dispose()
    this.holeMaterial.dispose()
    for (const material of this.markerMaterials.values()) {
      material.dispose()
    }
    this.renderer.dispose()
  }

  private loop = (): void => {
    this.animFrame = requestAnimationFrame(this.loop)
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

  /**
   * RG 세 축 선분을 만든다. 핀 축(Y) 시안, MB 축(X) 마젠타, 중간 축(Z) 앰버.
   * @returns {LineSegments} 축 선분
   */
  private createAxes(): LineSegments {
    const positions: number[] = []
    const colors: number[] = []
    const push = (axis: Vector3, color: Color): void => {
      positions.push(
        -axis.x * AXIS_HALF_LENGTH, -axis.y * AXIS_HALF_LENGTH, -axis.z * AXIS_HALF_LENGTH,
        axis.x * AXIS_HALF_LENGTH, axis.y * AXIS_HALF_LENGTH, axis.z * AXIS_HALF_LENGTH,
      )
      colors.push(color.r, color.g, color.b, color.r, color.g, color.b)
    }
    push(new Vector3(1, 0, 0), COLOR_MB)
    push(new Vector3(0, 1, 0), COLOR_PIN)
    push(new Vector3(0, 0, 1), COLOR_INTERMEDIATE)

    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
    return new LineSegments(
      geometry,
      new LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85 }),
    )
  }

  private markerMaterial(key: string, color: Color): MeshStandardMaterial {
    let material = this.markerMaterials.get(key)
    if (!material) {
      material = new MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.9,
        roughness: 0.3,
      })
      this.markerMaterials.set(key, material)
    }
    return material
  }

  private rebuildMarkers(markers: SurfaceMarkers): void {
    this.markerGroup.clear()
    const place = (point: Vec3, key: string, color: Color, scale = 1): void => {
      const mesh = new Mesh(this.markerGeometry, this.markerMaterial(key, color))
      mesh.position.set(point.x, point.y, point.z).multiplyScalar(SHELL_RADIUS * 1.01)
      mesh.scale.setScalar(scale)
      this.markerGroup.add(mesh)
    }
    place(markers.pin, 'pin', COLOR_PIN, 1.15)
    place(markers.cg, 'cg', COLOR_CG, 0.9)
    if (markers.mb) {
      place(markers.mb, 'mb', COLOR_MB, 1)
    }
    if (markers.pap) {
      place(markers.pap, 'pap', COLOR_PAP, 0.7)
    }
  }

  private rebuildHoles(holes: Vec3[]): void {
    this.holeGroup.clear()
    const quaternion = new Quaternion()
    const normal = new Vector3()
    holes.forEach((hole, index) => {
      const geometry = index === 2 ? this.thumbHoleGeometry : this.fingerHoleGeometry
      const mesh = new Mesh(geometry, this.holeMaterial)
      normal.set(hole.x, hole.y, hole.z).normalize()
      quaternion.setFromUnitVectors(UP, normal)
      mesh.quaternion.copy(quaternion)
      // 구멍 원기둥의 윗면이 표면에서 살짝 나오게 두어 껍질과 z-fight 하지 않게 한다.
      mesh.position.copy(normal).multiplyScalar(SHELL_RADIUS - HOLE_DEPTH / 2 + 0.01)
      this.holeGroup.add(mesh)
    })
  }
}
