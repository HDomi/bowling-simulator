import { IN } from '@/domain/constants'
import { pinProfile, PIN_STRIPES } from '@/domain/pins/profile'
import { LatheGeometry, Mesh, MeshStandardMaterial, Vector2 } from 'three'

/** 공식 측정점을 통과하는 매끈한 회전체. 바닥은 닫고 머리는 원호로 마감한다. */
export function createPinGeometry(): LatheGeometry {
  const profile = [{ radius: 0, y: 0 }, ...pinProfile()]
  const geometry = new LatheGeometry(profile.map(p => new Vector2(p.radius, p.y)), 64)
  // 인덱스를 흰 표면/빨간 표면으로 묶어 핀당 드로 콜 두 번만 사용한다.
  const segments = profile.length - 1
  const source = geometry.getIndex()!
  const indices: number[][] = [[], []]
  for (let ring = 0; ring < 64; ring += 1) {
    for (let i = 0; i < segments; i += 1) {
      const height = (profile[i].y + profile[i + 1].y) / (2 * IN)
      const red = PIN_STRIPES.some(([lo, hi]) => height > lo && height < hi)
      const start = (ring * segments + i) * 6
      for (let j = 0; j < 6; j += 1) indices[red ? 1 : 0].push(source.getX(start + j))
    }
  }
  geometry.setIndex([...indices[0], ...indices[1]])
  geometry.clearGroups()
  geometry.addGroup(0, indices[0].length, 0)
  geometry.addGroup(indices[0].length, indices[1].length, 1)
  return geometry
}

const pinGeometry = createPinGeometry()
const materials = [
  new MeshStandardMaterial({ color: '#fffaf2', roughness: 0.28, metalness: 0 }),
  new MeshStandardMaterial({ color: '#c91825', roughness: 0.3, metalness: 0 }),
]

/** 흰 코팅과 빨간 목띠 두 줄을 가진 핀. */
export function createPinMesh(): Mesh {
  const mesh = new Mesh(pinGeometry, materials)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}
