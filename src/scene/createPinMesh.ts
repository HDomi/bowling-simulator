import {
  PIN_BASE_RADIUS,
  PIN_HEAD_RADIUS,
  PIN_HEIGHT,
  PIN_MAX_RADIUS,
  PIN_NECK_RADIUS,
} from '@/domain/constants'
import {
  Color,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  Vector2,
} from 'three'

/**
 * USBC 핀 실루엣을 선반 기하로 만든다.
 * @returns {LatheGeometry} 핀 지오메트리
 */
function createPinGeometry(): LatheGeometry {
  const h = PIN_HEIGHT
  const pts = [
    new Vector2(0, 0),
    new Vector2(PIN_BASE_RADIUS, 0),
    new Vector2(PIN_BASE_RADIUS * 1.08, h * 0.04),
    new Vector2(PIN_MAX_RADIUS * 0.72, h * 0.16),
    new Vector2(PIN_MAX_RADIUS * 0.94, h * 0.25),
    new Vector2(PIN_MAX_RADIUS, h * 0.31),
    new Vector2(PIN_MAX_RADIUS * 0.9, h * 0.42),
    new Vector2(PIN_MAX_RADIUS * 0.58, h * 0.54),
    new Vector2(PIN_NECK_RADIUS * 1.15, h * 0.62),
    new Vector2(PIN_NECK_RADIUS, h * 0.68),
    new Vector2(PIN_NECK_RADIUS * 1.08, h * 0.78),
    new Vector2(PIN_HEAD_RADIUS, h * 0.9),
    new Vector2(PIN_HEAD_RADIUS * 0.62, h * 0.97),
    new Vector2(0, h),
  ]
  return new LatheGeometry(pts, 24)
}

const pinGeometry = createPinGeometry()

/**
 * 크림색 핀 메시를 만든다.
 * @returns {Mesh} 핀
 */
export function createPinMesh(): Mesh {
  const material = new MeshStandardMaterial({
    color: new Color('#e8e4dc'),
    emissive: new Color('#2f6ea8'),
    emissiveIntensity: 0.18,
    roughness: 0.42,
    metalness: 0.04,
  })
  const mesh = new Mesh(pinGeometry, material)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}
