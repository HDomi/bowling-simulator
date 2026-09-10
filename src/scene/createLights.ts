import { APPROACH_LENGTH, LANE_LENGTH, LIGHTING } from '@/domain/constants'
import { AmbientLight, Color, Group, PointLight, SpotLight } from 'three'

/**
 * 락볼링장 조명을 만든다.
 *
 * 천장 조명은 없다. 레인 머리와 핀덱에 스포트라이트를 하나씩 떨어뜨리고
 * 그 사이는 어둡게 둔다. 궤적·오일·히트맵은 자체 발광이라 어두울수록 잘 보인다.
 * 밝기는 {@link LIGHTING}에서 한 번에 조절한다.
 *
 * @returns {Group} 조명 그룹
 */
export function createLights(): Group {
  const group = new Group()

  // 완전한 검정을 피하는 최소한의 바닥 밝기
  group.add(new AmbientLight(new Color(LIGHTING.ambientColor), LIGHTING.ambient))

  // 레인 머리: 볼러가 공을 놓는 자리
  const head = new SpotLight(
    new Color(LIGHTING.spotColor),
    LIGHTING.headIntensity,
    LIGHTING.headDistance,
    Math.PI / 4.4,
    0.85,
    2,
  )
  head.position.set(0, 3.2, -APPROACH_LENGTH * 0.1)
  head.target.position.set(0, 0, 2.4)
  head.castShadow = true
  head.shadow.mapSize.set(1024, 1024)
  group.add(head, head.target)

  // 핀덱: 결과를 봐야 하는 자리라 가장 밝다
  const deck = new SpotLight(
    new Color(LIGHTING.spotColor),
    LIGHTING.deckIntensity,
    LIGHTING.deckDistance,
    Math.PI / 4.6,
    0.7,
    2,
  )
  deck.position.set(0, 3.0, LANE_LENGTH + 0.2)
  deck.target.position.set(0, 0, LANE_LENGTH + 0.35)
  deck.castShadow = true
  deck.shadow.mapSize.set(2048, 2048)
  group.add(deck, deck.target)

  // 레인 중간: 스포트 두 개 사이가 완전히 끊기지 않게 받쳐준다.
  const mid = new SpotLight(
    new Color(LIGHTING.spotColor),
    LIGHTING.midIntensity,
    LIGHTING.midDistance,
    Math.PI / 3.4,
    0.9,
    2,
  )
  mid.position.set(0, 3.6, LANE_LENGTH * 0.5)
  mid.target.position.set(0, 0, LANE_LENGTH * 0.55)
  group.add(mid, mid.target)

  // 레인 양옆 네온 사인이 흘리는 색. 어두운 중간 구간에 형태만 남긴다.
  const cyan = new PointLight(new Color(LIGHTING.neonCyan), LIGHTING.neonIntensity, 14, 2)
  cyan.position.set(-1.5, 1.1, LANE_LENGTH * 0.34)
  group.add(cyan)

  const magenta = new PointLight(new Color(LIGHTING.neonMagenta), LIGHTING.neonIntensity, 14, 2)
  magenta.position.set(1.5, 1.1, LANE_LENGTH * 0.66)
  group.add(magenta)

  return group
}
