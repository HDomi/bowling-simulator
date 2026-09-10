import {
  KICKBACK_HEIGHT,
  KICKBACK_X,
  LANE_LENGTH,
  PINSETTER,
  PIN_DECK_END,
  PIT_DEPTH,
  PIT_END,
} from '@/domain/constants'
import { outlined } from '@/scene/createAlley'
import { BoxGeometry, Group, Mesh, MeshToonMaterial } from 'three'

export const SWEEP_BAR_NAME = 'pinsetter-sweep'

const DECK_COLOR = '#e7e0cd'
const PIT_COLOR = '#8e9179'
const KICKBACK_COLOR = '#b6b69b'
const BAR_COLOR = '#bd8669'

/** 킥백 안쪽 폭. 핀덱과 피트 바닥이 이 폭을 채운다. */
const INNER_WIDTH = KICKBACK_X * 2

/**
 * 핀덱·피트·킥백·백스톱을 만든다.
 *
 * 레인 끝에서 바닥이 꺼져 피트가 되고, 양옆 킥백이 핀을 안쪽으로 되튕긴다.
 * 이 구조가 없으면 핀과 공이 밖으로 날아가 핀세터가 닿지 않는 자리에 남는다.
 *
 * @returns {Group} 핀덱 구조물
 */
export function createPinDeck(): Group {
  const group = new Group()

  // 핀덱 바닥 — 레인과 같은 높이로 이어진다.
  const deckLength = PIN_DECK_END - LANE_LENGTH
  const deck = outlined(
    new Mesh(
      new BoxGeometry(INNER_WIDTH, 0.06, deckLength),
      new MeshToonMaterial({ color: DECK_COLOR }),
    ),
  )
  deck.position.set(0, -0.03, LANE_LENGTH + deckLength / 2)
  group.add(deck)

  // 피트 바닥 — 핀덱보다 낮다.
  const pitLength = PIT_END - PIN_DECK_END
  const pit = outlined(
    new Mesh(
      new BoxGeometry(INNER_WIDTH, 0.06, pitLength),
      new MeshToonMaterial({ color: PIT_COLOR }),
    ),
  )
  pit.position.set(0, -PIT_DEPTH - 0.03, PIN_DECK_END + pitLength / 2)
  group.add(pit)

  // 핀덱 끝의 낙차면.
  const drop = outlined(
    new Mesh(
      new BoxGeometry(INNER_WIDTH, PIT_DEPTH, 0.05),
      new MeshToonMaterial({ color: PIT_COLOR }),
    ),
  )
  drop.position.set(0, -PIT_DEPTH / 2, PIN_DECK_END + 0.025)
  group.add(drop)

  // 킥백 — 핀덱 시작부터 피트 끝까지 양옆을 막는다.
  const wallLength = PIT_END - LANE_LENGTH
  const wallHeight = KICKBACK_HEIGHT + PIT_DEPTH
  for (const side of [-1, 1]) {
    const wall = outlined(
      new Mesh(
        new BoxGeometry(0.06, wallHeight, wallLength),
        new MeshToonMaterial({ color: KICKBACK_COLOR }),
      ),
    )
    wall.position.set(
      side * (KICKBACK_X + 0.03),
      KICKBACK_HEIGHT / 2 - PIT_DEPTH / 2,
      LANE_LENGTH + wallLength / 2,
    )
    group.add(wall)
  }

  // 백스톱 — 피트 뒤를 막아 공과 핀을 가둔다.
  const backstop = outlined(
    new Mesh(
      new BoxGeometry(INNER_WIDTH + 0.12, wallHeight, 0.08),
      new MeshToonMaterial({ color: KICKBACK_COLOR }),
    ),
  )
  backstop.position.set(0, KICKBACK_HEIGHT / 2 - PIT_DEPTH / 2, PIT_END + 0.04)
  group.add(backstop)

  group.add(createSweepBar())
  return group
}

/**
 * 핀세터 스위프바를 만든다. 위치는 물리 쪽에서 매 프레임 갱신한다.
 * @returns {Mesh} 스위프바
 */
function createSweepBar(): Mesh {
  const bar = outlined(
    new Mesh(
      new BoxGeometry(INNER_WIDTH - 0.04, PINSETTER.barHeight, PINSETTER.barThickness),
      new MeshToonMaterial({ color: BAR_COLOR }),
    ),
  )
  bar.name = SWEEP_BAR_NAME
  bar.position.set(0, PINSETTER.restY, PINSETTER.restZ)
  return bar
}
