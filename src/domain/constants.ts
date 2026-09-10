/** 길이·속도 변환과 레인/핀/볼 실측 규격. */

export const FT = 0.3048
export const IN = 0.0254
export const MPH = 0.44704
export const LB = 0.45359237
export const G = 9.80665

export const LANE_LENGTH_FT = 60
export const LANE_LENGTH = LANE_LENGTH_FT * FT
export const LANE_WIDTH_IN = 41.5
export const LANE_WIDTH = LANE_WIDTH_IN * IN
export const BOARD_COUNT = 39
export const BOARD_WIDTH = LANE_WIDTH / BOARD_COUNT
export const GUTTER_WIDTH = 9.25 * IN
/** 레인 면에서 거터 홈 바닥까지의 깊이(m). */
export const GUTTER_DEPTH = 0.07
export const APPROACH_LENGTH = 15 * FT
export const ARROW_DISTANCE_FT = 15
export const ARROW_BOARDS = [5, 10, 15, 20, 25, 30, 35] as const
export const CENTER_BOARD = 20

export const BALL_DIAMETER_IN = 8.5
export const BALL_RADIUS = (BALL_DIAMETER_IN / 2) * IN

export const PIN_HEIGHT_IN = 15
export const PIN_BELLY_DIAMETER_IN = 4.766
export const PIN_BASE_DIAMETER_IN = 2.031
export const PIN_NECK_DIAMETER_IN = 1.797
export const PIN_HEAD_DIAMETER_IN = 2.547
export const PIN_HEIGHT = PIN_HEIGHT_IN * IN
export const PIN_MAX_RADIUS = (PIN_BELLY_DIAMETER_IN / 2) * IN
export const PIN_BASE_RADIUS = (PIN_BASE_DIAMETER_IN / 2) * IN
export const PIN_NECK_RADIUS = (PIN_NECK_DIAMETER_IN / 2) * IN
export const PIN_HEAD_RADIUS = (PIN_HEAD_DIAMETER_IN / 2) * IN
/** USBC 03/2026 목표 3 lb 8 oz. 허용 범위 3 lb 6 oz–3 lb 10 oz. */
export const PIN_MASS = 3.5 * LB
/** 곡면 충돌체의 최대 반지름. 인계 시 겹침 방지에 사용한다. */
export const PIN_COLLIDER_RADIUS = PIN_MAX_RADIUS
export const PIN_SPACING = 12 * IN

/* ── 핀덱 주변 구조물 ──────────────────────────────────────────
 * 실제 볼링장은 핀덱 끝에서 바닥이 꺼져 피트(구덩이)가 되고, 양옆의 킥백 벽이
 * 핀을 안쪽으로 되튕긴다. 이 구조가 없으면 핀과 공이 레인 밖으로 날아가
 * 핀세터가 치울 수 없는 자리에 남는다.
 */

/** 핀덱이 끝나고 피트가 시작되는 다운레인 위치. 1번 핀에서 34.2인치 뒤다. */
export const PIN_DECK_END = LANE_LENGTH + 34.2 * IN
/** 피트 뒤끝(백스톱 안쪽면). */
export const PIT_END = PIN_DECK_END + 1.05
/** 핀덱 바닥에서 피트 바닥까지 깊이. */
export const PIT_DEPTH = 0.45
/** 킥백 벽 안쪽면의 좌우 위치. 거터 바깥 가장자리에 선다. */
export const KICKBACK_X = LANE_WIDTH / 2 + GUTTER_WIDTH
/** 킥백·백스톱 높이. */
export const KICKBACK_HEIGHT = 0.62
export const PIN_ROW_SPACING = PIN_SPACING * Math.cos(Math.PI / 6)

export const DEFAULT_BALL_WEIGHT_LB = 15
export const DEFAULT_RG_IN = 2.48
export const DEFAULT_DIFF = 0.048

/**
 * 오른손 기본 라인. UI 초기값이자 USBC 검증 기준선이다.
 *
 * 보고서에 Harry의 릴리즈·타겟 보드가 적혀 있지 않다. Figure 1의 스키드 구간
 * 기울기(-0.096 ~ -0.156 in/ft, 약 0.5~0.7°)가 거의 직선인 것으로 보아 완만한
 * 라인이었다고 보고, 그 조건에서 Figure 7 지표가 모두 범위에 드는 라인을 쓴다.
 *
 * 릴리즈와 타겟 차이는 5보드로, 15ft 화살표까지 약 1.7°다. 275rpm 기준으로
 * 되돌릴 수 있는 각도이며, 이보다 벌리면 훅이 모자라 거터로 나간다.
 */
export const DEFAULT_LINE = {
  releaseBoard: 18,
  targetBoard: 13,
} as const

/** USBC 로봇 투구기 "Harry"의 릴리즈 조건. 시뮬 기본값이자 검증 기준이다. */
export const HARRY = {
  speedMph: 17,
  revRate: 275,
  axisRotation: 55,
  axisTilt: 13,
  papOver: 5,
  papUp: 0.375,
  releaseBoard: DEFAULT_LINE.releaseBoard,
  targetBoard: DEFAULT_LINE.targetBoard,
  hand: 'right' as const,
} as const

/**
 * UI 기본 릴리즈. 구속은 국내 볼링장 전광판 기준(km/h)으로 잡는다.
 *
 * 21 km/h(13 mph)는 느린 편이라 회전을 Harry의 275rpm으로 두면 공이 다 타버려
 * 기본 라인이 34보드까지 넘어간다. 이 구속에서 기본 라인이 포켓(약 17.5보드)에
 * 들어오는 회전수가 150rpm이다.
 */
export const DEFAULT_RELEASE = {
  speedKmh: 21,
  revRate: 150,
} as const

export const SPEED_RANGE_MPH = { min: 10, max: 35, step: 0.1 } as const
export const REV_RANGE_RPM = { min: 50, max: 700, step: 5 } as const

/**
 * USBC Ball Motion Study Phase II(Figure 7) 실측 Y변수 범위.
 * 시뮬 결과가 이 밖으로 나가면 물리 파라미터를 다시 맞춰야 한다.
 */
export const USBC_RANGE = {
  breakpointFt: { min: 28.8, max: 39.83 },
  speedLoss49Mph: { min: 1.31, max: 2.53 },
  angleChange49Deg: { min: 2.06, max: 4.89 },
} as const

export const COVER_MU: Record<string, number> = {
  polyester: 0.1,
  urethane: 0.16,
  'reactive-pearl': 0.2,
  'reactive-hybrid': 0.23,
  'reactive-solid': 0.26,
  particle: 0.28,
}

export const GRIT_RA: Record<string, number> = {
  '180': 70,
  '360': 35,
  '500': 26,
  '1000': 18,
  '2000': 13,
  '3000': 10,
  '4000': 7,
  polish: 6,
}

export const RA_REF = 18
export const GRIT_EXPONENT = 0.35

/**
 * 궤적 적분 파라미터.
 *
 * USBC Ball Motion Study Figure 7의 실측 범위(브레이크포인트·49ft 속도 감소·
 * 49ft 각도 변화)에 들어오도록 그리드 탐색으로 맞춘 값이다. 절대값은 근사이고
 * 튜닝 대상이지만, 단조성(그릿·오일·RG·Diff 방향)은 항상 지켜야 한다.
 */
export const PHYSICS = {
  dt: 1 / 600,
  /** 오일 위에서 마찰이 떨어지는 가파르기. 크면 오일 구간을 더 길게 미끄러진다. */
  oilExponent: 6,
  /**
   * Diff가 마찰에 기여하는 기울기. DIFF_REF를 기준으로 위아래로 갈린다.
   * Diff는 트랙 플레어를 만들어 오일에 덜 젖은 표면이 계속 레인에 닿게 하므로,
   * 마른 구간의 마찰이 얼마나 살아남는지를 좌우한다.
   */
  kDiff: 8,
  /** kDiff의 기준점. 이 값에서 배율이 정확히 1이 된다. */
  diffRef: DEFAULT_DIFF,
  /** Diff 배율 하한. Diff 0인 공도 완전히 죽지는 않게 한다. */
  diffScaleMin: 0.55,
  /** 미끄럼이 끝나 구름으로 넘어가는 접촉점 속도(m/s). */
  slipEpsilon: 0.03,
  rollingMu: 0.008,
  /** 오일이 가장 두꺼운 지점의 최소 마찰. */
  oilMuFloor: 0.006,
  /** 마른 레인 마찰 전체 배율. */
  dryMuScale: 0.43,
  arrowFt: ARROW_DISTANCE_FT,
  maxTime: 4,
}

/** 아이보리 스튜디오와 볼 뷰어의 공통 색상·노출. */
export const LIGHTING = {
  ambientColor: '#fff8e9',
  neonCyan: '#526c63',
  neonMagenta: '#a64b35',
  environmentIntensity: 0.6,
  toneMappingExposure: 0.95,
} as const

/** 구간 검출. USBC와 같은 R² 0.99 선형 분할을 쓴다. */
export const PHASE_DETECT = {
  startFt: 11,
  stepFt: 2,
  minPoints: 3,
  r2Threshold: 0.99,
} as const

/**
 * 궤적 적분을 끝내고 핀덱 물리로 넘기는 다운레인 위치(m).
 *
 * 1번 핀 중심이 LANE_LENGTH이므로, 그 자리에 공을 생성하면 반지름 합보다
 * 가까운 0.072 m 거리에 놓여 **핀에 파고든 상태로 물리가 시작된다.** CCD는 이미
 * 겹친 채 생성된 물체를 구제하지 못하므로, 닿기 전에 넘겨야 한다.
 */
export const PIN_HANDOFF_Y =
  LANE_LENGTH - (BALL_RADIUS + PIN_COLLIDER_RADIUS + 0.04)

/**
 * 핀덱 물리 스텝.
 *
 * 프레임 시간을 그대로 쓰면 공이 한 스텝에 핀 지름보다 멀리 움직여 뚫고 지나간다.
 * (진입 속도 약 6 m/s × 1/45s = 0.13 m > 핀 최대 지름 0.121 m)
 * 고정 스텝으로 잘게 밟고, 프레임이 밀리면 최대 횟수에서 끊는다.
 */
export const PIN_PHYSICS = {
  fixedStepS: 1 / 240,
  maxSubSteps: 12,
  /** 한 프레임에 몰아서 처리할 최대 시간. 탭 복귀 직후 폭주를 막는다. */
  maxFrameS: 0.1,
} as const

/**
 * 핀세터(스위프) 동작 타임라인. 값은 초이며 누적 시점이다.
 *
 * 실제 볼링장 순서를 따른다 — 남은 핀을 들어올리고, 스위프바가 쓰러진 핀을
 * 피트로 밀어낸 뒤, 남은 핀을 제자리에 다시 내려놓는다.
 */
export const PINSETTER = {
  /** 남은 핀을 들어올리는 데 걸리는 시간과 높이. */
  liftEnd: 0.5,
  liftHeight: 0.42,
  /** 스위프바가 내려오는 구간. */
  dropStart: 0.35,
  dropEnd: 0.75,
  /** 쓸어내는 구간. */
  sweepStart: 0.75,
  sweepEnd: 1.6,
  /** 스위프바가 올라가는 구간. */
  raiseStart: 1.6,
  raiseEnd: 2.0,
  /** 남은 핀을 내려놓는 구간. */
  placeStart: 2.0,
  placeEnd: 2.45,
  /** 스위프바가 대기 위치로 돌아오는 구간. */
  returnStart: 2.45,
  returnEnd: 2.95,
  /** 대기 높이와 내려온 높이. */
  restY: 0.78,
  downY: 0.035,
  /** 대기 z(핀덱 앞)와 쓸어낸 끝 z. */
  restZ: LANE_LENGTH - 0.28,
  sweptZ: PIN_DECK_END + 0.12,
  /** 스위프바 크기. */
  barHeight: 0.2,
  barThickness: 0.05,
} as const

/**
 * 오일이 보드 방향으로 번지는 정도(보드 단위 표준편차).
 *
 * Kegel 시트의 buffer에 대응한다. 0이면 패스 경계가 계단처럼 끊긴다.
 */
export const OIL_BOARD_SIGMA = 2.2

/**
 * 포켓 판정 기준.
 *
 * 오른손 포켓(1-3번 사이)은 약 17.5 보드로 알려져 있다. 진입각은 USBC Figure 7의
 * 실측 각도 변화 범위(2.06~4.89°) 안에서 잡았다. 그보다 큰 각은 이 모델의
 * 근사 범위 밖이라 더 높게 쳐주지 않는다.
 */
export const POCKET = {
  board: 17.5,
  /** 이만큼 벗어나면 포켓이 아니라고 본다. */
  toleranceBoards: 2.6,
  minAngleDeg: 2.0,
  idealAngleDeg: 4.5,
} as const

export const PIN_DOWN_TILT_DEG = 30
export const PIN_SETTLE_SPEED = 0.08
export const PIN_SETTLE_MAX_S = 4
