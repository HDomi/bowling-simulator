/**
 * 페인팅 텍스처 해상도.
 *
 * 볼이 화면을 가득 채우면 정면에 보이는 건 경도 90° 남짓, 즉 가로의 1/4뿐이다.
 * 512폭이면 그 자리에 128텍셀만 깔려 확대되면서 계단이 보인다. 1024로 올렸다.
 * 실측 저장 용량이 볼당 1.5 KB였으므로 네 배가 돼도 부담이 없다.
 */
export const PAINT_WIDTH = 1024
export const PAINT_HEIGHT = 512

/** WebP 인코딩 품질. 해상도를 올린 만큼 압축 자국도 커져 조금 높였다. */
export const PAINT_QUALITY = 0.92

/** 브러시 반경(UV 비율)의 허용 범위. */
export const BRUSH_RADIUS = { min: 0.006, max: 0.09, step: 0.002, default: 0.024 } as const

/** 유체를 시작하는 기본 배경색. */
export const DEFAULT_BASE_COLOR = '#b8532f'

/**
 * 페인팅용 오프스크린 캔버스를 만든다.
 * @param {string | null} fill - 채울 색. null이면 투명하게 둔다.
 * @returns {HTMLCanvasElement} 캔버스
 */
export function createPaintCanvas(fill: string | null = null): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = PAINT_WIDTH
  canvas.height = PAINT_HEIGHT
  if (fill) {
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.fillStyle = fill
      ctx.fillRect(0, 0, PAINT_WIDTH, PAINT_HEIGHT)
    }
  }
  return canvas
}

/**
 * 캔버스를 단색으로 덮는다.
 * @param {HTMLCanvasElement} canvas - 캔버스
 * @param {string} color - 색
 */
export function fillCanvas(canvas: HTMLCanvasElement, color: string): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return
  }
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = color
  ctx.fillRect(0, 0, canvas.width, canvas.height)
}

/**
 * 캔버스를 완전히 비운다.
 * @param {HTMLCanvasElement} canvas - 캔버스
 */
export function clearCanvas(canvas: HTMLCanvasElement): void {
  canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
}

/**
 * 위도에 따른 반경 보정 배율을 구한다.
 *
 * 구를 평면으로 펴면 극 근처가 가로로 늘어난다. 보정하지 않으면 적도에서 동그란
 * 브러시가 극에서 납작하게 퍼져 보인다. 극에서 무한대가 되지 않게 하한을 둔다.
 *
 * @param {number} v - UV의 v (0 위쪽 극 ~ 1 아래쪽 극)
 * @returns {number} 가로 반경 배율
 */
export function latitudeScale(v: number): number {
  const latitude = (v - 0.5) * Math.PI
  return 1 / Math.max(0.25, Math.cos(latitude))
}

/**
 * UV 위치에 원을 찍는다. 가로 반경은 위도로 보정한다.
 *
 * u가 0이나 1 근처면 반대쪽 가장자리에도 한 번 더 찍는다. 텍스처가 수평으로
 * 이어져 있어 이렇게 하지 않으면 이음매에서 브러시가 잘린다.
 *
 * @param {HTMLCanvasElement} canvas - 대상 캔버스
 * @param {number} u - UV u
 * @param {number} v - UV v
 * @param {number} radius - UV 기준 반경
 * @param {string} color - 색
 */
export function stampDot(
  canvas: HTMLCanvasElement,
  u: number,
  v: number,
  radius: number,
  color: string,
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return
  }
  const rx = radius * latitudeScale(v) * canvas.width
  const ry = radius * canvas.height
  const y = v * canvas.height

  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = color
  for (const offset of [-1, 0, 1]) {
    const x = (u + offset) * canvas.width
    if (x + rx < 0 || x - rx > canvas.width) {
      continue
    }
    ctx.beginPath()
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
    ctx.fill()
  }
}

/**
 * 두 UV 지점 사이를 원으로 이어 그린다.
 *
 * 점만 찍으면 포인터가 빠르게 움직일 때 선이 끊긴다.
 *
 * @param {HTMLCanvasElement} canvas - 대상 캔버스
 * @param {{ u: number, v: number }} from - 시작
 * @param {{ u: number, v: number }} to - 끝
 * @param {number} radius - UV 기준 반경
 * @param {string} color - 색
 */
export function strokeLine(
  canvas: HTMLCanvasElement,
  from: { u: number; v: number },
  to: { u: number; v: number },
  radius: number,
  color: string,
): void {
  // 이음매를 가로지르는 이동은 짧은 쪽으로 돈다.
  let du = to.u - from.u
  if (du > 0.5) {
    du -= 1
  } else if (du < -0.5) {
    du += 1
  }
  const dv = to.v - from.v
  const distance = Math.hypot(du, dv)
  const steps = Math.max(1, Math.ceil(distance / (radius * 0.4)))

  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps
    const u = (from.u + du * t + 1) % 1
    stampDot(canvas, u, from.v + dv * t, radius, color)
  }
}

/**
 * 유체 위에 브러시를 얹어 한 장으로 합친다. 볼 메시가 쓰는 텍스처다.
 * @param {HTMLCanvasElement} fluid - 유체 레이어
 * @param {HTMLCanvasElement} brush - 브러시 레이어
 * @param {HTMLCanvasElement} target - 결과를 담을 캔버스
 */
export function composite(
  fluid: HTMLCanvasElement,
  brush: HTMLCanvasElement,
  target: HTMLCanvasElement,
): void {
  const ctx = target.getContext('2d')
  if (!ctx) {
    return
  }
  ctx.globalCompositeOperation = 'source-over'
  ctx.clearRect(0, 0, target.width, target.height)
  ctx.drawImage(fluid, 0, 0, target.width, target.height)
  ctx.drawImage(brush, 0, 0, target.width, target.height)
}

/**
 * 캔버스를 WebP Blob으로 만든다. WebP를 못 만드는 브라우저에서는 PNG로 떨어진다.
 * @param {HTMLCanvasElement} canvas - 캔버스
 * @returns {Promise<Blob | null>} Blob
 */
export function encodeCanvas(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (blob && blob.type === 'image/webp') {
          resolve(blob)
          return
        }
        canvas.toBlob((png) => resolve(png ?? blob), 'image/png')
      },
      'image/webp',
      PAINT_QUALITY,
    )
  })
}

/**
 * Blob을 캔버스에 그려 넣는다.
 * @param {Blob} blob - 이미지
 * @param {HTMLCanvasElement} canvas - 대상
 * @returns {Promise<boolean>} 성공 여부
 */
export async function drawBlob(blob: Blob, canvas: HTMLCanvasElement): Promise<boolean> {
  try {
    const bitmap = await createImageBitmap(blob)
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return false
    }
    ctx.globalCompositeOperation = 'source-over'
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    return true
  } catch {
    return false
  }
}

/**
 * 저장된 두 레이어를 합쳐 하나의 캔버스로 만든다.
 *
 * 볼 메시는 텍스처 한 장만 쓴다. 두 장을 따로 두는 것은 재편집을 위해서다.
 *
 * @param {Blob} fluid - 유체 레이어
 * @param {Blob} brush - 브러시 레이어
 * @returns {Promise<HTMLCanvasElement | null>} 합성 캔버스
 */
export async function mergePaintBlobs(
  fluid: Blob,
  brush: Blob,
): Promise<HTMLCanvasElement | null> {
  const fluidCanvas = createPaintCanvas()
  const brushCanvas = createPaintCanvas()
  const ok = (await drawBlob(fluid, fluidCanvas)) && (await drawBlob(brush, brushCanvas))
  if (!ok) {
    return null
  }
  const merged = createPaintCanvas()
  composite(fluidCanvas, brushCanvas, merged)
  return merged
}
