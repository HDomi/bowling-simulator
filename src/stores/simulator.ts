import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { DEFAULT_RELEASE, HARRY } from '@/domain/constants'
import { defaultLineForHand, mirrorBoard, type Hand } from '@/domain/hand'
import {
  createHousePattern,
  DEFAULT_HOUSE,
  getPatternById,
  PATTERN_PRESETS,
} from '@/domain/patterns/presets'
import { simulateShot } from '@/domain/physics/simulate'
import { searchLines, type LineCandidate } from '@/domain/physics/search'
import { getReleaseStyleById, matchReleaseStyleId } from '@/domain/styles'
import { kmhToMph, type SpeedUnit } from '@/domain/units'
import { decodeShare, encodeShare, packBall, SHARE_PARAM, type SharedState } from '@/domain/share'
import { useBallsStore } from '@/stores/balls'
import type { CameraPreset } from '@/scene/BowlingScene'
import type { ReleaseInput, ShotResult } from '@/domain/types'

/** 핀 번호 전체. */
const ALL_PINS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

/** 3D에 겹쳐 보여줄 후보 궤적 수. 너무 많으면 다발이 뭉개진다. */
const CANDIDATE_PREVIEW_COUNT = 8

/** 직접 조절 패턴의 id. */
export const CUSTOM_PATTERN_ID = 'custom'

export const useSimulatorStore = defineStore('simulator', () => {
  const ballsStore = useBallsStore()
  /** 활성 볼의 실효 스펙. 무게 슬라이더를 돌리면 RG·Diff가 따라 바뀐 상태다. */
  const ball = computed(() => ballsStore.simBall)
  /** 직전 볼(비교용). 없으면 null. */
  const compareBall = computed(() => ballsStore.simCompareBall)
  const patternId = ref('montreal')

  /* ── 직접 조절 패턴 ── */
  const houseDistanceFt = ref<number>(DEFAULT_HOUSE.distanceFt)
  const houseVolume = ref<number>(DEFAULT_HOUSE.volume)
  const houseRatio = ref<number>(DEFAULT_HOUSE.ratio)
  const customPattern = computed(() =>
    createHousePattern(houseDistanceFt.value, houseVolume.value, houseRatio.value),
  )
  const isCustomPattern = computed(() => patternId.value === CUSTOM_PATTERN_ID)
  const pattern = computed(() =>
    isCustomPattern.value ? customPattern.value : getPatternById(patternId.value),
  )

  /** 패턴 고르기 목록. 프리셋 뒤에 직접 조절을 붙인다. */
  const patternOptions = computed(() => [
    ...PATTERN_PRESETS.map((item) => ({ id: item.id, name: item.name })),
    { id: CUSTOM_PATTERN_ID, name: '직접 조절' },
  ])

  /** 지금 패턴의 보드별 오일 단면. 20ft 지점을 본다. */
  const oilProfile = computed(() => {
    const grid = pattern.value.grid
    const rowIndex = Math.min(grid.length - 1, Math.round(20 / pattern.value.segmentFt))
    return grid[rowIndex] ?? []
  })
  const speedMph = ref<number>(kmhToMph(DEFAULT_RELEASE.speedKmh))
  const revRate = ref<number>(DEFAULT_RELEASE.revRate)
  const axisRotation = ref<number>(HARRY.axisRotation)
  const axisTilt = ref<number>(HARRY.axisTilt)
  const speedUnit = ref<SpeedUnit>('kmh')
  const hand = ref<Hand>('right')
  const releaseBoard = ref(defaultLineForHand('right').releaseBoard)
  const targetBoard = ref(defaultLineForHand('right').targetBoard)
  const result = ref<ShotResult | null>(null)
  const isRolling = ref(false)
  const cameraPreset = ref<CameraPreset>(1)
  const rollNonce = ref(0)
  /** 핀덱을 10핀으로 되돌리라는 신호. */
  const resetNonce = ref(0)
  /** 핀세터를 돌리라는 신호. */
  const sweepNonce = ref(0)
  /** 핀세터가 남길 핀 번호. */
  const sweepKeepIds = ref<number[]>([])

  /* ── 프레임 ── */
  /** 프레임이 시작됐는지. 시작 전에는 릴리즈할 수 없다. */
  const frameActive = ref(false)
  /** 이번 프레임의 몇 번째 투구인지. */
  const ballNumber = ref<1 | 2>(1)
  /** 1구에 쓰러뜨린 핀 수. */
  const firstCount = ref(0)
  /** 2구에 쓰러뜨린 핀 수. */
  const secondCount = ref(0)
  /** 프레임이 끝났는지. */
  const frameDone = ref(false)
  /** 핀세터가 동작 중인지. 이 동안에는 릴리즈를 막는다. */
  const pinsetterRunning = ref(false)
  /** 2구에 남아 있는 핀 번호. */
  const standingPins = ref<number[]>([])
  /** 핀세터가 끝나면 프레임을 끝낼지. 스트라이크 뒤에 쓴다. */
  const pendingFrameEnd = ref(false)

  /* ── 라인 탐색 ── */
  /** 포켓에 드는 라인 후보. 점수 내림차순이다. */
  const searchResults = ref<LineCandidate[]>([])
  /** 탐색이 도는 중인지. */
  const isSearching = ref(false)
  /** 3D에 겹쳐 그릴 후보 궤적. 상위 몇 개만 쓴다. */
  const candidateShots = computed(() =>
    searchResults.value
      .slice(0, CANDIDATE_PREVIEW_COUNT)
      .map((line) =>
        simulateShot(ball.value, pattern.value, {
          ...release.value,
          releaseBoard: line.releaseBoard,
          targetBoard: line.targetBoard,
        }),
      ),
  )

  const presets = PATTERN_PRESETS

  const styleId = computed(() =>
    matchReleaseStyleId({
      revRate: revRate.value,
      speedMph: speedMph.value,
      axisRotation: axisRotation.value,
      axisTilt: axisTilt.value,
    }),
  )

  /** 릴리즈 버튼을 누를 수 있는지. */
  const canRelease = computed(
    () =>
      frameActive.value &&
      !frameDone.value &&
      !isRolling.value &&
      !pinsetterRunning.value &&
      ballsStore.hasBalls,
  )

  /** 프레임 결과 표기. 스트라이크 X, 스페어 /, 그 외 숫자. */
  const frameLabel = computed(() => {
    if (!frameDone.value) {
      return ''
    }
    if (firstCount.value === 10) {
      return 'X'
    }
    if (firstCount.value + secondCount.value === 10) {
      return `${firstCount.value} / `
    }
    return `${firstCount.value} ${secondCount.value}`
  })

  const release = computed<ReleaseInput>(() => ({
    speedMph: speedMph.value,
    revRate: revRate.value,
    releaseBoard: releaseBoard.value,
    targetBoard: targetBoard.value,
    axisRotation: axisRotation.value,
    axisTilt: axisTilt.value,
    hand: hand.value,
  }))

  const preview = computed(() => simulateShot(ball.value, pattern.value, release.value))

  /** 직전 볼을 같은 라인으로 굴린 궤적. 볼을 바꿨을 때 차이를 겹쳐 보인다. */
  const comparePreview = computed(() =>
    compareBall.value ? simulateShot(compareBall.value, pattern.value, release.value) : null,
  )

  /**
   * 지금 상태를 담은 공유 링크를 만든다.
   * @returns {string} 절대 URL
   */
  function shareUrl(): string {
    const state: SharedState = {
      b: packBall(ballsStore.activeBall),
      p: isCustomPattern.value
        ? {
            id: CUSTOM_PATTERN_ID,
            d: houseDistanceFt.value,
            v: houseVolume.value,
            r: houseRatio.value,
          }
        : { id: patternId.value },
      r: {
        s: speedMph.value,
        rv: revRate.value,
        ar: axisRotation.value,
        at: axisTilt.value,
        rb: releaseBoard.value,
        tb: targetBoard.value,
        h: hand.value,
      },
    }
    const url = new URL(window.location.href)
    url.hash = ''
    url.searchParams.set(SHARE_PARAM, encodeShare(state))
    return url.toString()
  }

  /**
   * 공유 링크의 상태를 적용한다. 볼은 새로 추가하고 활성으로 만든다.
   * @param {string} encoded - URL 파라미터 값
   * @returns {boolean} 적용했으면 true
   */
  function applyShared(encoded: string): boolean {
    const state = decodeShare(encoded)
    if (!state) {
      return false
    }
    ballsStore.addBall({
      name: state.b.n,
      weightLb: state.b.w,
      rg: state.b.rg,
      diff: state.b.df,
      cover: state.b.cv,
      grit: state.b.gr,
      colors: [state.b.c0, state.b.c1],
      pinToCg: state.b.pc,
    })
    if (state.p.id === CUSTOM_PATTERN_ID) {
      houseDistanceFt.value = state.p.d ?? DEFAULT_HOUSE.distanceFt
      houseVolume.value = state.p.v ?? DEFAULT_HOUSE.volume
      houseRatio.value = state.p.r ?? DEFAULT_HOUSE.ratio
    }
    patternId.value = state.p.id
    speedMph.value = state.r.s
    revRate.value = state.r.rv
    axisRotation.value = state.r.ar
    axisTilt.value = state.r.at
    hand.value = state.r.h
    releaseBoard.value = state.r.rb
    targetBoard.value = state.r.tb
    return true
  }

  /**
   * 직접 조절 패턴 슬라이더를 기본값으로 되돌린다.
   */
  function resetHousePattern(): void {
    houseDistanceFt.value = DEFAULT_HOUSE.distanceFt
    houseVolume.value = DEFAULT_HOUSE.volume
    houseRatio.value = DEFAULT_HOUSE.ratio
  }

  /**
   * 지금 고른 프리셋을 직접 조절 패턴의 출발점으로 삼는다.
   */
  function forkPatternToCustom(): void {
    houseDistanceFt.value = Math.round(pattern.value.distanceFt)
    patternId.value = CUSTOM_PATTERN_ID
  }

  /**
   * 릴리즈 스타일 프리셋을 적용한다.
   * @param {string} id - 스타일 id
   */
  function applyReleaseStyle(id: string): void {
    const style = getReleaseStyleById(id)
    if (!style) {
      return
    }
    speedMph.value = style.speedMph
    revRate.value = style.revRate
    axisRotation.value = style.axisRotation
    axisTilt.value = style.axisTilt
  }

  /**
   * 릴리즈 보드 × 타겟 보드를 모두 굴려보고 포켓에 드는 라인을 찾는다.
   *
   * 1,521 조합이 300ms 안쪽이라 메인 스레드에서 돌린다.
   */
  function runSearch(): void {
    if (isSearching.value || !ballsStore.hasBalls) {
      return
    }
    isSearching.value = true
    try {
      searchResults.value = searchLines(ball.value, pattern.value, release.value)
    } finally {
      isSearching.value = false
    }
  }

  /**
   * 찾은 라인을 릴리즈 슬라이더에 적용한다.
   * @param {LineCandidate} line - 라인 후보
   */
  function applyLine(line: LineCandidate): void {
    releaseBoard.value = line.releaseBoard
    targetBoard.value = line.targetBoard
  }

  /**
   * 탐색 결과를 지운다.
   */
  function clearSearch(): void {
    searchResults.value = []
  }

  /**
   * 프레임을 시작한다. 핀 10개를 세우고 1구부터 다시 센다.
   */
  function startFrame(): void {
    if (pinsetterRunning.value || isRolling.value) {
      return
    }
    frameActive.value = true
    frameDone.value = false
    pendingFrameEnd.value = false
    ballNumber.value = 1
    firstCount.value = 0
    secondCount.value = 0
    standingPins.value = []
    result.value = null
    resetNonce.value += 1
  }

  /**
   * 현재 슬라이더 값으로 궤적을 계산하고 재생을 시작한다.
   */
  function releaseBall(): void {
    if (!canRelease.value) {
      return
    }
    isRolling.value = true
    const shot = preview.value
    result.value = shot
    rollNonce.value += 1
  }

  /**
   * 핀 판정을 결과에 반영하고 롤링 상태를 해제한다.
   * @param {number[]} pinsDown - 넘어진 핀
   * @param {boolean} isStrike - 스트라이크
   */
  function finishPins(pinsDown: number[], isStrike: boolean): void {
    if (result.value) {
      result.value = { ...result.value, pinsDown, isStrike }
    }
    isRolling.value = false

    if (!frameActive.value) {
      return
    }

    if (ballNumber.value === 1) {
      firstCount.value = pinsDown.length
      if (isStrike) {
        endFrame()
        return
      }
      // 남은 핀만 두고 쓰러진 핀을 치운다.
      const standing = ALL_PINS.filter((id) => !pinsDown.includes(id))
      standingPins.value = standing
      sweepKeepIds.value = standing
      pendingFrameEnd.value = false
      pinsetterRunning.value = true
      sweepNonce.value += 1
      return
    }

    secondCount.value = pinsDown.length
    endFrame()
  }

  /**
   * 프레임을 끝낸다. 핀세터가 핀을 모두 치우고, 끝나면 10핀과 시점이 되돌아온다.
   *
   * 스트라이크든 2구까지 던졌든 같은 경로를 탄다.
   */
  function endFrame(): void {
    standingPins.value = []
    sweepKeepIds.value = []
    pendingFrameEnd.value = true
    pinsetterRunning.value = true
    sweepNonce.value += 1
  }

  /**
   * 핀세터 동작이 끝났을 때 호출한다. 2구를 던질 수 있게 한다.
   */
  function finishPinsetter(): void {
    pinsetterRunning.value = false
    if (pendingFrameEnd.value) {
      pendingFrameEnd.value = false
      frameDone.value = true
      // 프레임이 끝나면 10핀을 다시 세우고 공·시점을 릴리즈 지점으로 되돌린다.
      resetNonce.value += 1
      return
    }
    ballNumber.value = 2
  }

  /**
   * 속도 표시 단위를 바꾼다.
   * @param {SpeedUnit} unit - 속도 단위
   */
  function setSpeedUnit(unit: SpeedUnit): void {
    speedUnit.value = unit
  }

  /**
   * 카메라 프리셋을 바꾼다.
   * @param {CameraPreset} preset - 프리셋
   */
  function setCamera(preset: CameraPreset): void {
    cameraPreset.value = preset
  }

  /**
   * 손을 바꾸고 릴리즈·타겟 보드를 좌우 대칭한다.
   * @param {Hand} next - 손
   */
  function setHand(next: Hand): void {
    if (hand.value === next) {
      return
    }
    hand.value = next
    releaseBoard.value = mirrorBoard(releaseBoard.value)
    targetBoard.value = mirrorBoard(targetBoard.value)
  }

  return {
    ball,
    compareBall,
    patternId,
    pattern,
    patternOptions,
    isCustomPattern,
    houseDistanceFt,
    houseVolume,
    houseRatio,
    oilProfile,
    speedMph,
    revRate,
    axisRotation,
    axisTilt,
    speedUnit,
    hand,
    releaseBoard,
    targetBoard,
    result,
    isRolling,
    cameraPreset,
    rollNonce,
    resetNonce,
    sweepNonce,
    sweepKeepIds,
    frameActive,
    ballNumber,
    firstCount,
    secondCount,
    frameDone,
    pinsetterRunning,
    standingPins,
    pendingFrameEnd,
    searchResults,
    isSearching,
    candidateShots,
    canRelease,
    frameLabel,
    presets,
    styleId,
    release,
    preview,
    comparePreview,
    shareUrl,
    applyShared,
    resetHousePattern,
    forkPatternToCustom,
    runSearch,
    applyLine,
    clearSearch,
    startFrame,
    releaseBall,
    finishPins,
    finishPinsetter,
    setCamera,
    setHand,
    setSpeedUnit,
    applyReleaseStyle,
  }
})
