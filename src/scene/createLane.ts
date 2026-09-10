import {
  APPROACH_LENGTH,
  ARROW_BOARDS,
  ARROW_DISTANCE_FT,
  BOARD_COUNT,
  BOARD_WIDTH,
  FT,
  GUTTER_DEPTH,
  GUTTER_WIDTH,
  IN,
  LANE_LENGTH,
  LANE_WIDTH,
} from '@/domain/constants'
import { boardToX } from '@/domain/physics/friction'
import { physXToThree } from '@/scene/coords'
import {
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  Shape,
  ShapeGeometry,
} from 'three'

const LANE_HI = 0xd9c59e
const GUTTER_COLOR = 0xb4b59d
const CREAM = 0x555e4c

/**
 * 39보드 우드 스트라이프 텍스처를 만든다.
 * @returns {CanvasTexture} 레인 텍스처
 */
function createBoardTexture(): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 39 * 8
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('2d context unavailable')
  }

  for (let board = 0; board < BOARD_COUNT; board += 1) {
    const shade = board % 2 === 0 ? '#dfcda7' : '#e9d9b8'
    ctx.fillStyle = shade
    ctx.fillRect(board * 8, 0, 8, 512)
    ctx.fillStyle = 'rgba(78, 79, 56, 0.18)'
    ctx.fillRect(board * 8 + 7, 0, 1, 512)
  }

  // 가는 보드선 위에 도면 해칭과 낮은 대비의 기하학 무늬를 찍는다.
  ctx.strokeStyle = 'rgba(94, 88, 65, 0.12)'
  ctx.lineWidth = 0.6
  for (let y = 0; y < 512; y += 64) {
    for (let x = 0; x < 312; x += 48) {
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 24, y + 32); ctx.lineTo(x + 48, y); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(x, y + 40); ctx.lineTo(x + 48, y + 40); ctx.stroke()
    }
  }
  const texture = new CanvasTexture(canvas)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.anisotropy = 8
  return texture
}

/**
 * 화살표(쉐브론) 메시를 만든다.
 * @param {number} x - 가로 위치
 * @param {number} z - 다운레인 위치
 * @returns {Mesh} 화살표
 */
function createArrow(x: number, z: number): Mesh {
  const shape = new Shape()
  const w = BOARD_WIDTH * 1.1
  const h = 4 * IN
  shape.moveTo(0, h)
  shape.lineTo(w / 2, 0)
  shape.lineTo(0, h * 0.35)
  shape.lineTo(-w / 2, 0)
  shape.closePath()

  const mesh = new Mesh(
    new ShapeGeometry(shape),
    new MeshStandardMaterial({
      color: CREAM,
      emissive: new Color(CREAM),
      emissiveIntensity: 0.15,
      roughness: 0.6,
    }),
  )
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(x, 0.002, z)
  return mesh
}

/**
 * 파울라인 옆 L/R 라벨을 만든다.
 * @param {string} text - 글자
 * @param {number} x - 가로 위치
 * @returns {Mesh} 라벨
 */
function createSideLabel(text: string, x: number): Mesh {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('2d context unavailable')
  }
  ctx.fillStyle = '#53594a'
  ctx.font = '700 44px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 32, 36)
  const mesh = new Mesh(
    new PlaneGeometry(0.14, 0.14),
    new MeshBasicMaterial({ map: new CanvasTexture(canvas), transparent: true }),
  )
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(x, 0.004, -0.22)
  return mesh
}

/**
 * 레인·거터·어프로치·핀덱 메시 그룹을 만든다.
 * @returns {Group} 레인 그룹
 */
export function createLane(): Group {
  const group = new Group()
  const boardMap = createBoardTexture()
  const laneMat = new MeshStandardMaterial({
    map: boardMap,
    color: 0xffffff,
    roughness: 0.8,
    metalness: 0.04,
  })

  const lane = new Mesh(new PlaneGeometry(LANE_WIDTH, LANE_LENGTH), laneMat)
  lane.rotation.x = -Math.PI / 2
  lane.position.set(0, 0, LANE_LENGTH / 2)
  lane.receiveShadow = true
  group.add(lane)

  const approach = new Mesh(
    new PlaneGeometry(LANE_WIDTH, APPROACH_LENGTH),
    new MeshStandardMaterial({ color: 0xddceb0, roughness: 0.65 }),
  )
  approach.rotation.x = -Math.PI / 2
  approach.position.set(0, 0, -APPROACH_LENGTH / 2)
  approach.receiveShadow = true
  group.add(approach)

  const foul = new Mesh(
    new PlaneGeometry(LANE_WIDTH, 2 * IN),
    new MeshStandardMaterial({
      color: CREAM,
      emissive: CREAM,
      emissiveIntensity: 0.2,
    }),
  )
  foul.rotation.x = -Math.PI / 2
  foul.position.set(0, 0.0015, 0)
  group.add(foul)
  group.add(createSideLabel('L', physXToThree(-LANE_WIDTH / 2 + 0.08)))
  group.add(createSideLabel('R', physXToThree(LANE_WIDTH / 2 - 0.08)))

  const gutterMat = new MeshStandardMaterial({
    color: GUTTER_COLOR,
    roughness: 0.9,
    side: DoubleSide,
  })
  const gutterZ = (LANE_LENGTH + APPROACH_LENGTH) / 2 - APPROACH_LENGTH / 2
  const gutterLen = LANE_LENGTH + APPROACH_LENGTH
  for (const side of [-1, 1]) {
    const gutter = new Mesh(new PlaneGeometry(GUTTER_WIDTH, gutterLen), gutterMat)
    gutter.rotation.x = -Math.PI / 2
    gutter.position.set(
      physXToThree(side * (LANE_WIDTH / 2 + GUTTER_WIDTH / 2)),
      -GUTTER_DEPTH,
      gutterZ,
    )
    gutter.receiveShadow = true
    group.add(gutter)
  }

  const pinDeck = new Mesh(
    new PlaneGeometry(LANE_WIDTH + GUTTER_WIDTH * 2, 4 * FT),
    new MeshStandardMaterial({ color: LANE_HI, roughness: 0.5 }),
  )
  pinDeck.rotation.x = -Math.PI / 2
  pinDeck.position.set(0, -0.001, LANE_LENGTH + 2 * FT)
  pinDeck.receiveShadow = true
  group.add(pinDeck)

  const arrowZ = ARROW_DISTANCE_FT * FT
  for (const board of ARROW_BOARDS) {
    group.add(createArrow(physXToThree(boardToX(board)), arrowZ))
  }

  const dotsZ = [3, 5, 8].map((v) => v * FT)
  const dotMat = new MeshStandardMaterial({ color: CREAM, roughness: 0.4 })
  for (const z of dotsZ) {
    for (const board of [10, 15, 20, 25, 30]) {
      const dot = new Mesh(new PlaneGeometry(0.012, 0.018), dotMat)
      dot.rotation.x = -Math.PI / 2
      dot.position.set(physXToThree(boardToX(board)), 0.002, z)
      group.add(dot)
    }
  }

  return group
}
