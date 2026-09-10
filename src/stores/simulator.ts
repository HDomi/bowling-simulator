import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { DEFAULT_RELEASE, HARRY } from '@/domain/constants'
import { defaultLineForHand, mirrorBoard, type Hand } from '@/domain/hand'
import { getPatternById, PATTERN_PRESETS } from '@/domain/patterns/presets'
import { simulateShot } from '@/domain/physics/simulate'
import { getReleaseStyleById, matchReleaseStyleId } from '@/domain/styles'
import { kmhToMph, type SpeedUnit } from '@/domain/units'
import { useBallsStore } from '@/stores/balls'
import type { CameraPreset } from '@/scene/BowlingScene'
import type { ReleaseInput, ShotResult } from '@/domain/types'

/** 핀 번호 전체. */
const ALL_PINS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

export const useSimulatorStore = defineStore('simulator', () => {
  const ballsStore = useBallsStore()
  /** 활성 볼의 실효 스펙. 무게 슬라이더를 돌리면 RG·Diff가 따라 바뀐 상태다. */
  const ball = computed(() => ballsStore.simBall)
  /** 직전 볼(비교용). 없으면 null. */
  const compareBall = computed(() => ballsStore.simCompareBall)
  const patternId = ref('montreal')
  const pattern = computed(() => getPatternById(patternId.value))
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
    canRelease,
    frameLabel,
    presets,
    styleId,
    release,
    preview,
    comparePreview,
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
