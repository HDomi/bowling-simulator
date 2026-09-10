import { APPROACH_LENGTH, LANE_WIDTH, GUTTER_WIDTH, FT, PIT_END } from '@/domain/constants'
import {
  BoxGeometry, BufferGeometry, CanvasTexture, Color, ConeGeometry, EdgesGeometry,
  GridHelper, Group, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial,
  MeshToonMaterial, PlaneGeometry, SphereGeometry, Vector3,
} from 'three'

export const CEILING_GROUP_NAME = 'overhead-ceiling'
const INK = '#53594a'

/** 실체와 얇은 외곽선을 겹쳐 종이 모형 같은 입체를 만든다. */
export function outlined(mesh: Mesh): Mesh {
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.add(new LineSegments(new EdgesGeometry(mesh.geometry, 24), new LineBasicMaterial({ color: INK, transparent: true, opacity: 0.55 })))
  return mesh
}

function label(text: string, x: number, y: number, z: number, width: number, height: number): Mesh {
  const canvas = document.createElement('canvas')
  canvas.width = 512; canvas.height = 128
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = INK
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '500 44px monospace'
  ctx.fillText(text, 256, 64)
  const mesh = new Mesh(new PlaneGeometry(width, height), new MeshBasicMaterial({ map: new CanvasTexture(canvas), transparent: true, depthWrite: false }))
  mesh.position.set(x, y, z)
  return mesh
}

/** 아이보리 스튜디오. 재질이 있는 레인 받침과 기하학 도면을 조합한다. */
export function createAlley(): Group {
  const group = new Group()
  // 받침은 어프로치 앞부터 피트 뒤까지 이어진다.
  const length = PIT_END + APPROACH_LENGTH + 0.6
  const center = (PIT_END - APPROACH_LENGTH + 0.6) / 2
  const width = LANE_WIDTH + GUTTER_WIDTH * 2 + 0.25
  const base = outlined(new Mesh(new BoxGeometry(width, 0.18, length), new MeshToonMaterial({ color: '#d4c6aa' })))
  base.position.set(0, -0.185, center)
  group.add(base)
  for (const side of [-1, 1]) {
    const rail = outlined(new Mesh(new BoxGeometry(0.055, 0.075, length), new MeshToonMaterial({ color: '#b6b69b' })))
    rail.position.set(side * (width / 2 - 0.035), -0.048, center)
    group.add(rail)
  }

  const floor = new Mesh(new PlaneGeometry(160, 160), new MeshToonMaterial({ color: '#f5f1e7' }))
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.28; floor.receiveShadow = true
  group.add(floor)
  const grid = new GridHelper(100, 100, '#c5c4b5', '#d9d6c7')
  grid.position.set(0, -0.277, 10)
  grid.material.transparent = true; grid.material.opacity = 0.3
  group.add(grid)

  // 보조 눈금은 레인 밖에 둬 궤적·오일 패턴과 겹치지 않는다.
  const ruler: Vector3[] = []
  for (let ft = 0; ft <= 60; ft += 5) {
    const z = ft * FT
    ruler.push(new Vector3(-width / 2 - 0.13, -0.268, z), new Vector3(-width / 2 - (ft % 15 === 0 ? 0.42 : 0.26), -0.268, z))
    if (ft % 15 === 0) {
      const text = label(`${ft} FT`, -width / 2 - 0.7, -0.265, z, 0.48, 0.13)
      text.rotation.x = -Math.PI / 2
      group.add(text)
    }
  }
  group.add(new LineSegments(new BufferGeometry().setFromPoints(ruler), new LineBasicMaterial({ color: '#90947f' })))

  // 핀덱 구조물(킥백·백스톱)보다 뒤에 세운다. 앞에 두면 핀덱을 가린다.
  const back = outlined(new Mesh(new BoxGeometry(width + 0.3, 0.7, 0.12), new MeshToonMaterial({ color: '#b1b69a' })))
  back.position.set(0, 0.24, PIT_END + 0.45)
  group.add(back)
  const sign = label('01 / MOTION', 0, 0.33, PIT_END + 0.38, width * 0.8, 0.2)
  sign.rotation.y = Math.PI
  group.add(sign)

  // 여백에 놓인 입체 도형. 플레이 영역 밖의 장식이다.
  const orb = new LineSegments(new EdgesGeometry(new SphereGeometry(0.8, 12, 8), 1), new LineBasicMaterial({ color: new Color('#929a83'), transparent: true, opacity: 0.34 }))
  orb.position.set(-4.2, 0.62, 16.5); orb.rotation.z = 0.4
  group.add(orb)
  const pyramid = outlined(new Mesh(new ConeGeometry(0.7, 1.15, 4), new MeshToonMaterial({ color: '#bd8669' })))
  pyramid.position.set(4.0, 0.295, 18); pyramid.rotation.y = Math.PI / 4
  group.add(pyramid)
  const cube = new LineSegments(new EdgesGeometry(new BoxGeometry(0.9, 0.9, 0.9)), new LineBasicMaterial({ color: '#7b806e', transparent: true, opacity: 0.4 }))
  cube.position.set(2.7, 0.2, 2); cube.rotation.y = 0.4
  group.add(cube)
  return group
}
