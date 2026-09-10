import {
  APPROACH_LENGTH,
  GUTTER_WIDTH,
  LANE_LENGTH,
  LANE_WIDTH,
  PIN_HEIGHT,
} from '@/domain/constants'
import {
  BoxGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
} from 'three'

/** 탑뷰에서 숨길 천장 그룹 이름. */
export const CEILING_GROUP_NAME = 'overhead-ceiling'

const METAL = new Color('#14181f')
const DARK_WOOD = new Color('#1c140e')
const KICKBACK = new Color('#3a2416')
const NEON_CY = new Color('#1fe0ff')
const NEON_MG = new Color('#ff2fa8')
const AMBER = new Color('#ffb020')
const CREAM = new Color('#e8e4dc')

/**
 * 메시를 만들어 그룹에 넣는다.
 * @param {Group} group - 부모
 * @param {BoxGeometry | PlaneGeometry} geometry - 기하
 * @param {MeshStandardMaterial} material - 재질
 * @param {number} x - x
 * @param {number} y - y
 * @param {number} z - z
 * @returns {Mesh} 메시
 */
function addBox(
  group: Group,
  geometry: BoxGeometry | PlaneGeometry,
  material: MeshStandardMaterial,
  x: number,
  y: number,
  z: number,
): Mesh {
  const mesh = new Mesh(geometry, material)
  mesh.position.set(x, y, z)
  mesh.castShadow = true
  mesh.receiveShadow = true
  group.add(mesh)
  return mesh
}

/**
 * 핀덱 킥백·핏 벽을 만든다.
 * @param {Group} group - 부모
 */
function addKickbacks(group: Group): void {
  const deckZ = LANE_LENGTH + 0.55
  const height = 0.62
  const length = 1.7
  const mat = new MeshStandardMaterial({ color: KICKBACK, roughness: 0.55 })
  const x = LANE_WIDTH / 2 + GUTTER_WIDTH + 0.04

  for (const side of [-1, 1]) {
    addBox(group, new BoxGeometry(0.05, height, length), mat, side * x, height / 2, deckZ)
  }

  const pit = new MeshStandardMaterial({ color: METAL, roughness: 0.7 })
  addBox(group, new BoxGeometry(LANE_WIDTH + GUTTER_WIDTH * 2 + 0.2, 0.9, 0.12), pit, 0, 0.2, LANE_LENGTH + 1.35)
}

/**
 * 마스킹 유닛과 레인 번호 패널을 만든다.
 * @param {Group} group - 부모
 */
function addMaskingUnit(group: Group): void {
  const z = LANE_LENGTH - 0.18
  const width = LANE_WIDTH + GUTTER_WIDTH * 2 + 0.25
  const housing = new MeshStandardMaterial({ color: METAL, roughness: 0.4, metalness: 0.35 })
  addBox(group, new BoxGeometry(width, 0.18, 0.35), housing, 0, 1.55, z)

  const curtain = new MeshStandardMaterial({
    color: '#120818',
    emissive: NEON_MG,
    emissiveIntensity: 0.18,
    roughness: 0.6,
  })
  addBox(group, new BoxGeometry(width * 0.96, 0.55, 0.06), curtain, 0, 1.18, z)

  const neonBar = new MeshStandardMaterial({
    color: NEON_CY,
    emissive: NEON_CY,
    emissiveIntensity: 0.55,
    roughness: 0.2,
  })
  addBox(group, new BoxGeometry(width * 0.9, 0.03, 0.04), neonBar, 0, 1.47, z - 0.12)

  const laneNum = new MeshStandardMaterial({
    color: AMBER,
    emissive: AMBER,
    emissiveIntensity: 0.35,
  })
  addBox(group, new BoxGeometry(0.28, 0.38, 0.05), laneNum, 0, 1.18, z - 0.04)
}

/**
 * 핀 위쪽 핀셋터 하우징을 만든다.
 * @param {Group} group - 부모
 */
function addPinsetter(group: Group): void {
  const z = LANE_LENGTH + 0.95
  const metal = new MeshStandardMaterial({ color: METAL, roughness: 0.38, metalness: 0.45 })
  addBox(group, new BoxGeometry(1.7, 1.15, 1.4), metal, 0, 2.05, z)

  const rail = new MeshStandardMaterial({
    color: NEON_CY,
    emissive: NEON_CY,
    emissiveIntensity: 0.28,
  })
  addBox(group, new BoxGeometry(1.5, 0.04, 0.04), rail, 0, 2.58, z - 0.5)
  addBox(group, new BoxGeometry(1.5, 0.04, 0.04), rail, 0, 1.52, z - 0.5)

  const sweep = new MeshStandardMaterial({ color: '#2a3038', roughness: 0.5, metalness: 0.3 })
  addBox(group, new BoxGeometry(LANE_WIDTH + 0.2, 0.08, 0.12), sweep, 0, PIN_HEIGHT + 0.12, LANE_LENGTH + 0.28)

  const screen = new MeshStandardMaterial({
    color: '#081018',
    emissive: NEON_CY,
    emissiveIntensity: 0.35,
  })
  const monitor = addBox(group, new BoxGeometry(0.9, 0.38, 0.06), screen, 0, 2.85, LANE_LENGTH + 0.15)
  monitor.rotation.x = -0.18
}

/**
 * 천장 LED와 옆 레인 캡을 만든다.
 * @param {Group} group - 부모
 */
function addCeilingAndWalls(group: Group): void {
  const ceilingMat = new MeshStandardMaterial({ color: '#08090c', roughness: 1, side: DoubleSide })
  // 탑뷰 카메라는 천장 위에 있어서 이 그룹을 통째로 숨긴다.
  const overhead = new Group()
  overhead.name = CEILING_GROUP_NAME
  group.add(overhead)

  const ceiling = new Mesh(
    new PlaneGeometry(8.5, LANE_LENGTH + APPROACH_LENGTH + 4),
    ceilingMat,
  )
  ceiling.rotation.x = Math.PI / 2
  ceiling.position.set(0, 3.35, LANE_LENGTH / 2)
  overhead.add(ceiling)

  const led = new MeshStandardMaterial({
    color: CREAM,
    emissive: CREAM,
    emissiveIntensity: 0.32,
  })
  const span = LANE_LENGTH + APPROACH_LENGTH
  for (const x of [-1.55, 1.55]) {
    const strip = new Mesh(new BoxGeometry(0.06, 0.04, span), led)
    strip.position.set(x, 3.28, LANE_LENGTH / 2 - APPROACH_LENGTH / 4)
    overhead.add(strip)
  }

  const wallMat = new MeshStandardMaterial({ color: '#0c0d12', roughness: 0.9, side: DoubleSide })
  for (const side of [-1, 1]) {
    const wall = new Mesh(new PlaneGeometry(span + 2, 3.4), wallMat)
    wall.rotation.y = (Math.PI / 2) * side
    wall.position.set(side * 2.35, 1.7, LANE_LENGTH / 2)
    group.add(wall)
  }

  const neighbor = new MeshStandardMaterial({ color: DARK_WOOD, roughness: 0.55 })
  for (const side of [-1, 1]) {
    const extra = new Mesh(new PlaneGeometry(LANE_WIDTH, LANE_LENGTH), neighbor)
    extra.rotation.x = -Math.PI / 2
    extra.position.set(side * (LANE_WIDTH + GUTTER_WIDTH * 2 + 0.12), -0.02, LANE_LENGTH / 2)
    extra.receiveShadow = true
    group.add(extra)
  }

  const cap = new MeshStandardMaterial({ color: '#101318', roughness: 0.7 })
  for (const side of [-1, 1]) {
    addBox(
      group,
      new BoxGeometry(0.18, 0.12, LANE_LENGTH + APPROACH_LENGTH),
      cap,
      side * (LANE_WIDTH / 2 + GUTTER_WIDTH + 0.12),
      0.05,
      LANE_LENGTH / 2 - APPROACH_LENGTH / 4,
    )
  }

  const back = new Mesh(
    new PlaneGeometry(8.5, 3.4),
    new MeshStandardMaterial({ color: '#08090c', roughness: 1 }),
  )
  // 핀덱 카메라(LANE_LENGTH + 3.6)보다 뒤에 둔다. 앞에 두면 카메라가 벽 안에 갇힌다.
  back.position.set(0, 1.7, LANE_LENGTH + 4.8)
  group.add(back)
}

/**
 * 핀 위·주변 볼링장 구조물을 만든다.
 * @returns {Group} 앨리 그룹
 */
export function createAlley(): Group {
  const group = new Group()
  addKickbacks(group)
  addMaskingUnit(group)
  addPinsetter(group)
  addCeilingAndWalls(group)
  return group
}
