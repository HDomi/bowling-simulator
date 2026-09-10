import { BALL_RADIUS, IN } from '@/domain/constants'
import { gritFrictionScale, gritToRa } from '@/domain/physics/friction'
import type { Ball, CoverType } from '@/domain/types'
import {
  CanvasTexture,
  Color,
  Mesh,
  MeshPhysicalMaterial,
  SRGBColorSpace,
  SphereGeometry,
} from 'three'

/** 볼 색이 주어지지 않았을 때 쓰는 루비/스모크 조합. */
export const DEFAULT_BALL_COLORS: [string, string] = ['#c2101f', '#6b6577']

/** 볼 외관에 필요한 필드만. 스펙(RG·Diff)은 외관에 관여하지 않는다. */
export type BallLook = Pick<Ball, 'colors' | 'cover' | 'grit'>

export const DEFAULT_BALL_LOOK: BallLook = {
  colors: DEFAULT_BALL_COLORS,
  cover: 'reactive-pearl',
  grit: 2000,
}

const TEXTURE_WIDTH = 1024
const TEXTURE_HEIGHT = 512

/** 볼 둘레를 텍스처 가로폭에 대응시킨 픽셀/인치 배율. */
const PX_PER_IN = TEXTURE_WIDTH / (Math.PI * (BALL_RADIUS * 2) / IN)

const FINGER_HOLE_RADIUS_IN = 0.5
const THUMB_HOLE_RADIUS_IN = 0.62
const HOLE_SPAN_IN = 4.25

type CoverLook = {
  roughness: number
  clearcoat: number
  clearcoatRoughness: number
  iridescence: number
  /** 펄 입자를 흩뿌리는 밀도 배율. 0이면 없다. */
  flecks: number
  /** 두 색을 섞는 소용돌이 대비. 낮으면 단색에 가깝다. */
  swirl: number
  emissiveIntensity: number
}

/**
 * 커버스톡별 표면 질감.
 *
 * 폴리는 유리처럼 매끈하고, 우레탄은 무광에 가깝다. 펄은 마이카 입자가 반짝이고
 * 솔리드는 입자 없이 살짝 거칠다. 파티클은 가장 거칠다. 그릿은 이 위에
 * 거칠기를 더한다.
 */
const COVER_LOOK: Record<CoverType, CoverLook> = {
  polyester: {
    roughness: 0.06,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    iridescence: 0,
    flecks: 0,
    swirl: 0.6,
    emissiveIntensity: 0.1,
  },
  urethane: {
    roughness: 0.5,
    clearcoat: 0.15,
    clearcoatRoughness: 0.4,
    iridescence: 0,
    flecks: 0,
    swirl: 0.35,
    emissiveIntensity: 0.06,
  },
  'reactive-pearl': {
    roughness: 0.14,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    iridescence: 0.6,
    flecks: 1,
    swirl: 1,
    emissiveIntensity: 0.16,
  },
  'reactive-hybrid': {
    roughness: 0.22,
    clearcoat: 0.8,
    clearcoatRoughness: 0.12,
    iridescence: 0.3,
    flecks: 0.5,
    swirl: 1,
    emissiveIntensity: 0.14,
  },
  'reactive-solid': {
    roughness: 0.34,
    clearcoat: 0.5,
    clearcoatRoughness: 0.2,
    iridescence: 0,
    flecks: 0,
    swirl: 1,
    emissiveIntensity: 0.12,
  },
  particle: {
    roughness: 0.62,
    clearcoat: 0.2,
    clearcoatRoughness: 0.5,
    iridescence: 0,
    flecks: 0.25,
    swirl: 0.8,
    emissiveIntensity: 0.08,
  },
}

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
 * @param {string} primary - 주 색
 * @param {string} secondary - 보조 색
 * @param {number} swirl - 대비 0~1. 낮으면 보조색 단색에 가깝다
 * @param {() => number} random - 난수 생성기
 */
function paintSwirls(
  ctx: CanvasRenderingContext2D,
  primary: string,
  secondary: string,
  swirl: number,
  random: () => number,
): void {
  const secondaryColor = new Color(secondary)
  const primaryColor = new Color(primary)

  const base = ctx.createLinearGradient(0, 0, 0, TEXTURE_HEIGHT)
  base.addColorStop(0, secondaryColor.clone().multiplyScalar(0.5).getStyle())
  base.addColorStop(0.5, secondaryColor.getStyle())
  base.addColorStop(1, secondaryColor.clone().multiplyScalar(0.5).getStyle())
  ctx.fillStyle = base
  ctx.fillRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT)

  // 넓은 색 덩어리로 주/보조 영역을 크게 나눈다.
  const blobCount = Math.round(14 * swirl)
  for (let i = 0; i < blobCount; i += 1) {
    const toPrimary = random() > 0.4
    const color = (toPrimary ? primaryColor : secondaryColor).clone()
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
  const bandCount = Math.round(34 * swirl)
  for (let band = 0; band < bandCount; band += 1) {
    const roll = random()
    const color =
      roll > 0.62
        ? primaryColor.clone().multiplyScalar(0.8 + random() * 0.8)
        : roll > 0.28
          ? secondaryColor.clone().multiplyScalar(0.5 + random() * 1.1)
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
 * @param {number} density - 밀도 배율. 1이면 4200개
 * @param {() => number} random - 난수 생성기
 */
function paintPearlFlecks(
  ctx: CanvasRenderingContext2D,
  density: number,
  random: () => number,
): void {
  const count = Math.round(4200 * density)
  for (let i = 0; i < count; i += 1) {
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
 * 볼 표면 텍스처를 만든다. 무늬와 지공이 있어 회전이 눈에 보인다.
 *
 * 캔버스가 없는 헤드리스 환경(노드 테스트)에서는 null을 돌려주고 단색으로 떨어진다.
 * @param {BallLook} look - 볼 외관
 * @param {{ holes?: boolean }} options - holes=false면 지공을 그리지 않는다(뷰어가 3D로 그릴 때)
 * @returns {CanvasTexture | null} 볼 텍스처
 */
export function createBallTexture(
  look: BallLook,
  options: { holes?: boolean } = {},
): CanvasTexture | null {
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

  const coverLook = COVER_LOOK[look.cover] ?? COVER_LOOK['reactive-pearl']
  const random = createRandom(0x9e3779b9)
  paintSwirls(ctx, look.colors[0], look.colors[1], coverLook.swirl, random)
  if (coverLook.flecks > 0) {
    paintPearlFlecks(ctx, coverLook.flecks, random)
  }

  if (options.holes !== false) {
    const centerX = TEXTURE_WIDTH * 0.5
    const centerY = TEXTURE_HEIGHT * 0.5
    const span = HOLE_SPAN_IN * PX_PER_IN
    paintHole(ctx, centerX - span * 0.28, centerY - span * 0.34, FINGER_HOLE_RADIUS_IN)
    paintHole(ctx, centerX + span * 0.28, centerY - span * 0.34, FINGER_HOLE_RADIUS_IN)
    paintHole(ctx, centerX, centerY + span * 0.42, THUMB_HOLE_RADIUS_IN)
  }

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

/**
 * 그릿이 거칠수록 표면 거칠기를 더한다. 폴리시(Ra 6)는 0, 180방(Ra 70)은 약 +0.32다.
 * @param {BallLook['grit']} grit - 표면 그릿
 * @returns {number} 거칠기 가산
 */
function gritRoughness(grit: BallLook['grit']): number {
  const ra = gritToRa(grit)
  return Math.max(0, (gritFrictionScale(ra) - gritFrictionScale(6)) * 0.42)
}

/**
 * 커버·그릿·색에 맞는 볼 머티리얼을 만든다.
 * @param {BallLook} look - 볼 외관
 * @param {{ holes?: boolean }} options - 텍스처 옵션
 * @returns {MeshPhysicalMaterial} 머티리얼
 */
export function createBallMaterial(
  look: BallLook,
  options: { holes?: boolean } = {},
): MeshPhysicalMaterial {
  const coverLook = COVER_LOOK[look.cover] ?? COVER_LOOK['reactive-pearl']
  const map = createBallTexture(look, options)
  return new MeshPhysicalMaterial({
    map,
    color: new Color(map ? '#ffffff' : look.colors[1]),
    roughness: Math.min(0.95, coverLook.roughness + gritRoughness(look.grit)),
    metalness: 0,
    clearcoat: coverLook.clearcoat,
    clearcoatRoughness: Math.min(0.9, coverLook.clearcoatRoughness + gritRoughness(look.grit) * 0.6),
    iridescence: coverLook.iridescence,
    iridescenceIOR: 1.35,
    iridescenceThicknessRange: [120, 520],
    emissive: new Color(look.colors[0]),
    emissiveIntensity: coverLook.emissiveIntensity,
    envMapIntensity: 1.4,
  })
}

/**
 * 볼 머티리얼과 텍스처를 해제한다.
 * @param {MeshPhysicalMaterial} material - 머티리얼
 */
export function disposeBallMaterial(material: MeshPhysicalMaterial): void {
  material.map?.dispose()
  material.dispose()
}

/**
 * 볼 메시를 만든다.
 * @param {BallLook} look - 볼 외관
 * @returns {Mesh} 볼 메시
 */
export function createBallMesh(look: BallLook = DEFAULT_BALL_LOOK): Mesh {
  const mesh = new Mesh(new SphereGeometry(BALL_RADIUS, 48, 36), createBallMaterial(look))
  mesh.castShadow = true
  return mesh
}

/**
 * 기존 볼 메시의 외관을 바꾼다. 이전 머티리얼은 해제한다.
 * @param {Mesh} mesh - 볼 메시
 * @param {BallLook} look - 새 외관
 */
export function applyBallLook(mesh: Mesh, look: BallLook): void {
  const previous = mesh.material
  mesh.material = createBallMaterial(look)
  if (previous instanceof MeshPhysicalMaterial) {
    disposeBallMaterial(previous)
  }
}

/**
 * 페인팅 텍스처를 볼 메시에 입힌다. null이면 절차적 텍스처로 되돌린다.
 *
 * 페인팅은 표면 색을 그대로 보여줘야 하므로 emissive 틴트를 끈다.
 *
 * @param {Mesh} mesh - 볼 메시
 * @param {HTMLCanvasElement | null} paint - 합성된 페인팅 캔버스
 * @param {BallLook} look - 페인팅이 없을 때 쓸 외관
 */
export function applyPaintTexture(
  mesh: Mesh,
  paint: HTMLCanvasElement | null,
  look: BallLook,
): void {
  if (!paint) {
    applyBallLook(mesh, look)
    return
  }
  const material = mesh.material as MeshPhysicalMaterial
  material.map?.dispose()
  const texture = new CanvasTexture(paint)
  texture.colorSpace = SRGBColorSpace
  material.map = texture
  material.color.set('#ffffff')
  material.emissiveIntensity = 0
  material.needsUpdate = true
}
