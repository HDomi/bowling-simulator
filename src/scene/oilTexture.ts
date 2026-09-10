import { LANE_LENGTH, LANE_WIDTH } from '@/domain/constants'
import type { Pattern } from '@/domain/types'
import {
  CanvasTexture,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
} from 'three'

/**
 * 오일 격자를 캔버스에 그린다. 보드 1이 화면 오른쪽(Three -x)에 오도록 그린다.
 * @param {ImageData} image - 픽셀 버퍼
 * @param {Pattern} pattern - 패턴
 */
function paintOil(image: ImageData, pattern: Pattern): void {
  const cols = image.width
  const rows = image.height
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const oil = pattern.grid[y]?.[x] ?? 0
      const i = (y * cols + x) * 4
      image.data[i] = 90
      image.data[i + 1] = 116
      image.data[i + 2] = 97
      image.data[i + 3] = Math.round(oil * 70)
    }
  }
}

/**
 * 오일 패턴을 레인 위 반투명 세이지색 텍스처로 만든다.
 * @param {Pattern} pattern - 오일 패턴
 * @returns {Mesh} 오일 오버레이
 */
export function createOilOverlay(pattern: Pattern): Mesh {
  const rows = pattern.grid.length
  const cols = pattern.grid[0]?.length ?? 39
  const canvas = document.createElement('canvas')
  canvas.width = cols
  canvas.height = rows
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('2d context unavailable')
  }

  const image = ctx.createImageData(cols, rows)
  paintOil(image, pattern)
  ctx.putImageData(image, 0, 0)

  const texture = new CanvasTexture(canvas)

  const mesh = new Mesh(
    new PlaneGeometry(LANE_WIDTH, LANE_LENGTH),
    new MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    }),
  )
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(0, 0.003, LANE_LENGTH / 2)
  mesh.renderOrder = 1
  return mesh
}

/**
 * 오일 오버레이 텍스처를 새 패턴으로 갱신한다.
 * @param {Mesh} overlay - 오일 메시
 * @param {Pattern} pattern - 패턴
 */
export function updateOilOverlay(overlay: Mesh, pattern: Pattern): void {
  const material = overlay.material
  if (!(material instanceof MeshBasicMaterial) || !material.map) {
    return
  }
  const texture = material.map
  if (!(texture instanceof CanvasTexture)) {
    return
  }
  const canvas = texture.image as HTMLCanvasElement
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return
  }
  const rows = pattern.grid.length
  const cols = pattern.grid[0]?.length ?? 39
  if (canvas.width !== cols || canvas.height !== rows) {
    canvas.width = cols
    canvas.height = rows
  }
  const image = ctx.createImageData(cols, rows)
  paintOil(image, pattern)
  ctx.putImageData(image, 0, 0)
  texture.needsUpdate = true
}
