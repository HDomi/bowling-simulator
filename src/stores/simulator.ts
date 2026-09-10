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
  const presets = PATTERN_PRESETS

  const styleId = computed(() =>
    matchReleaseStyleId({
      revRate: revRate.value,
      speedMph: speedMph.value,
      axisRotation: axisRotation.value,
      axisTilt: axisTilt.value,
    }),
  )

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
   * 현재 슬라이더 값으로 궤적을 계산하고 재생을 시작한다.
   */
  function roll(): void {
    if (isRolling.value) {
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
    presets,
    styleId,
    release,
    preview,
    comparePreview,
    roll,
    finishPins,
    setCamera,
    setHand,
    setSpeedUnit,
    applyReleaseStyle,
  }
})
