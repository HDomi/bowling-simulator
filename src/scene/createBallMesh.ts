import { BALL_RADIUS, IN } from '@/domain/constants'
import {
  CanvasTexture,
  Color,
  Mesh,
  MeshPhysicalMaterial,
  SphereGeometry,
  SRGBColorSpace,
} from 'three'

/** 볼 색이 주어지지 않았을 때 쓰는 루비/스모크 조합. */
export const DEFAULT_BALL_COLORS: [string, string] = ['#c2101f', '#6b6577']

const TEXTURE_WIDTH = 1024
const TEXTURE_HEIGHT = 512

/** 볼 둘레를 텍스처 가로폭에 대응시킨 픽셀/인치 배율. */
const PX_PER_IN = TEXTURE_WIDTH / (Math.PI * (BALL_RADIUS * 2) / IN)

const FINGER_HOLE_RADIUS_IN = 0.5
const THUMB_HOLE_RADIUS_IN = 0.62
const HOLE_SPAN_IN = 4.25

/**
 * 씨앗 하나로 같은 무늬가 재현되는 난수를 만든다.
 * @param {number} seed - 씨앗
 * @returns {() => number} 0~1 난수 생성기
 */
function createRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 가로로 이어지는 부드러운 색 덩어리를 찍는다. 좌우 끝에서 무늬가 끊기지 않게 세 번 그린다.
 * @param {CanvasRenderingContext2D} ctx - 캔버스 컨텍스트
 * @param {number} x - 중심 x(px)
 * @param {number} y - 중심 y(px)
 * @param {number} radius - 반지름(px)
 * @param {Color} color - 색
 */
function paintBlob(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: Color,
): void {
  for (const offset of [-TEXTURE_WIDTH, 0, TEXTURE_WIDTH]) {
    const cx = x + offset
    const gradient = ctx.createRadialGradient(cx, y, 0, cx, y, radius)
    gradient.addColorStop(0, color.getStyle())
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(cx, y, radius, 0, Math.PI * 2)
    ctx.fill()
  }
}

/**
 * 물결치는 띠 하나를 그린다. 파장을 정수로 두어야 좌우 끝이 맞물린다.
 * @param {CanvasRenderingContext2D} ctx - 캔버스 컨텍스트
 * @param {number} y - 기준 y(px)
 * @param {number} amplitude - 진폭(px)
 * @param {number} waves - 텍스처 한 바퀴당 파동 수(정수)
 * @param {number} phase - 위상(rad)
 */
function strokeWave(
  ctx: CanvasRenderingContext2D,
  y: number,
  amplitude: number,
  waves: number,
  phase: number,
): void {
  ctx.beginPath()
  for (let x = 0; x <= TEXTURE_WIDTH; x += 16) {
    const angle = (x / TEXTURE_WIDTH) * Math.PI * 2 * waves + phase
    const py = y + Math.sin(angle) * amplitude + Math.sin(angle * 2.7) * amplitude * 0.22
    if (x === 0) {
      ctx.moveTo(x, py)
    } else {
      ctx.lineTo(x, py)
    }
  }
  ctx.stroke()
}

/**
 * 두 색이 섞인 대리석 소용돌이를 그린다.
 * @param {CanvasRenderingContext2D} ctx - 캔버스 컨텍스트
 * @param {string} ruby - 주 색
 * @param {string} smoke - 보조 색
 * @param {() => number} random - 난수 생성기
 */
function paintSwirls(
  ctx: CanvasRenderingContext2D,
  ruby: string,
  smoke: string,
  random: () => number,
): void {
  const smokeColor = new Color(smoke)
  const rubyColor = new Color(ruby)

  const base = ctx.createLinearGradient(0, 0, 0, TEXTURE_HEIGHT)
  base.addColorStop(0, smokeColor.clone().multiplyScalar(0.5).getStyle())
  base.addColorStop(0.5, smokeColor.getStyle())
  base.addColorStop(1, smokeColor.clone().multiplyScalar(0.5).getStyle())
  ctx.fillStyle = base
  ctx.fillRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT)

  // 넓은 색 덩어리로 루비/스모크 영역을 크게 나눈다.
  for (let i = 0; i < 14; i += 1) {
    const toRuby = random() > 0.4
    const color = (toRuby ? rubyColor : smokeColor).clone()
    color.multiplyScalar(0.45 + random() * 1.1)
    paintBlob(
      ctx,
      random() * TEXTURE_WIDTH,
      random() * TEXTURE_HEIGHT,
      140 + random() * 260,
      color,
    )
  }

  // 그 위에 흐르는 결을 얹어 대리석처럼 만든다.
  ctx.lineCap = 'round'
  for (let band = 0; band < 34; band += 1) {
    const roll = random()
    const color =
      roll > 0.62
        ? rubyColor.clone().multiplyScalar(0.8 + random() * 0.8)
        : roll > 0.28
          ? smokeColor.clone().multiplyScalar(0.5 + random() * 1.1)
          : new Color('#100c12')

    ctx.strokeStyle = color.getStyle()
    ctx.globalAlpha = 0.18 + random() * 0.4
    ctx.lineWidth = 8 + random() * 54
    strokeWave(
      ctx,
      random() * TEXTURE_HEIGHT,
      30 + random() * 120,
      1 + Math.floor(random() * 3),
      random() * Math.PI * 2,
    )
  }
  ctx.globalAlpha = 1
}

/**
 * 펄 반짝임(미세 입자)을 흩뿌린다.
 * @param {CanvasRenderingContext2D} ctx - 캔버스 컨텍스트
 * @param {() => number} random - 난수 생성기
 */
function paintPearlFlecks(ctx: CanvasRenderingContext2D, random: () => number): void {
  for (let i = 0; i < 4200; i += 1) {
    const x = random() * TEXTURE_WIDTH
    const y = random() * TEXTURE_HEIGHT
    const radius = 0.4 + random() * 1.4
    ctx.globalAlpha = 0.08 + random() * 0.32
    ctx.fillStyle = random() > 0.35 ? '#fff4e8' : '#bcd8ff'
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

/**
 * 지공 구멍 하나를 파인 것처럼 그린다.
 * @param {CanvasRenderingContext2D} ctx - 캔버스 컨텍스트
 * @param {number} x - 중심 x(px)
 * @param {number} y - 중심 y(px)
 * @param {number} radiusIn - 구멍 반지름(inch)
 */
function paintHole(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radiusIn: number,
): void {
  const radius = radiusIn * PX_PER_IN
  const gradient = ctx.createRadialGradient(x, y, radius * 0.2, x, y, radius)
  gradient.addColorStop(0, '#000000')
  gradient.addColorStop(0.72, '#0a0709')
  gradient.addColorStop(1, 'rgba(20, 14, 18, 0)')
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fill()
}

/**
 * 펄 리액티브 볼 표면 텍스처를 만든다. 무늬와 지공이 있어 회전이 눈에 보인다.
 *
 * 캔버스가 없는 헤드리스 환경(노드 테스트)에서는 null을 돌려주고 단색으로 떨어진다.
 * @param {[string, string]} colors - [주 색, 보조 색]
 * @returns {CanvasTexture | null} 볼 텍스처
 */
export function createBallTexture(colors: [string, string]): CanvasTexture | null {
  if (typeof document === 'undefined') {
    return null
  }

  const canvas = document.createElement('canvas')
  canvas.width = TEXTURE_WIDTH
  canvas.height = TEXTURE_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return null
  }

  const random = createRandom(0x9e3779b9)
  paintSwirls(ctx, colors[0], colors[1], random)
  paintPearlFlecks(ctx, random)

  const centerX = TEXTURE_WIDTH * 0.5
  const centerY = TEXTURE_HEIGHT * 0.5
  const span = HOLE_SPAN_IN * PX_PER_IN
  paintHole(ctx, centerX - span * 0.28, centerY - span * 0.34, FINGER_HOLE_RADIUS_IN)
  paintHole(ctx, centerX + span * 0.28, centerY - span * 0.34, FINGER_HOLE_RADIUS_IN)
  paintHole(ctx, centerX, centerY + span * 0.42, THUMB_HOLE_RADIUS_IN)

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

/**
 * 펄 광택이 도는 볼 메시를 만든다.
 * @param {[string, string]} colors - [주 색, 보조 색]
 * @returns {Mesh} 볼 메시
 */
export function createBallMesh(colors: [string, string]): Mesh {
  const map = createBallTexture(colors)
  const material = new MeshPhysicalMaterial({
    map,
    color: new Color(map ? '#ffffff' : colors[1]),
    roughness: 0.16,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    iridescence: 0.55,
    iridescenceIOR: 1.35,
    iridescenceThicknessRange: [120, 520],
    emissive: new Color(colors[0]),
    emissiveIntensity: 0.16,
    envMapIntensity: 1.4,
  })

  const mesh = new Mesh(new SphereGeometry(BALL_RADIUS, 48, 36), material)
  mesh.castShadow = true
  return mesh
}
