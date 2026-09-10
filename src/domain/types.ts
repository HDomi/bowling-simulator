export type CoverType =
  | 'polyester'
  | 'urethane'
  | 'reactive-pearl'
  | 'reactive-hybrid'
  | 'reactive-solid'
  | 'particle'

export type Grit = 180 | 360 | 500 | 1000 | 2000 | 3000 | 4000 | 'polish'

export type Layout = {
  drillAngle: number
  pinToPap: number
  valAngle: number
}

export type Ball = {
  id: string
  name: string
  weightLb: number
  rg: number
  diff: number
  intDiff?: number
  cover: CoverType
  grit: Grit
  pinToCg?: number
  layout?: Layout
  colors: [string, string]
  /** 페인팅 텍스처가 있는지. 실제 Blob은 IndexedDB paints store에 있다. */
  hasPaint?: boolean
}

export type Bowler = {
  papOver: number
  papUp: number
  speedMph: number
  revRate: number
  axisRotation: number
  axisTilt: number
  hand: 'right' | 'left'
}

export type Pattern = {
  id: string
  name: string
  distanceFt: number
  grid: number[][]
  segmentFt: number
  source: 'preset' | 'slider' | 'manual' | 'image'
}

export type PathSample = {
  x: number
  y: number
  t: number
  vx: number
  vy: number
  wx: number
  wy: number
  wz: number
  slip: number
  oil: number
  headingDeg: number
}

export type ShotResult = {
  path: PathSample[]
  breakpointFt: number
  entryAngleDeg: number
  entryBoard: number
  speedAtPinsMph: number
  phases: { skidEnd: number; hookEnd: number }
  pinsDown: number[]
  isStrike: boolean
  gutter: boolean
  pinEntry: {
    x: number
    y: number
    vx: number
    vy: number
    wx: number
    wy: number
    wz: number
  }
  speedLoss49Mph: number
  angleChange49Deg: number
}

export type ReleaseInput = {
  speedMph: number
  revRate: number
  releaseBoard: number
  targetBoard: number
  axisRotation: number
  axisTilt: number
  hand: 'right' | 'left'
}
