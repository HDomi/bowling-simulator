import { AmbientLight, DirectionalLight, Group, HemisphereLight } from 'three'
import { LANE_LENGTH } from '@/domain/constants'

/** 부드러운 종이색 환경광과 한 방향의 그림자. */
export function createLights(): Group {
  const group = new Group()
  group.add(new AmbientLight('#fff8e9', 1.3))
  group.add(new HemisphereLight('#fffdf5', '#b0a98c', 1.7))
  const sun = new DirectionalLight('#fff4dc', 2.5)
  sun.position.set(-7, 15, 3)
  sun.target.position.set(0, 0, LANE_LENGTH / 2)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 18, bottom: -18, near: 0.1, far: 50 })
  sun.shadow.bias = -0.0002
  sun.shadow.normalBias = 0.02
  group.add(sun, sun.target)
  return group
}
