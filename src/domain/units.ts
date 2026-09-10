/** 속도 표시 단위 변환. 내부 계산은 항상 mph로 둔다(USBC 기준값이 mph). */

export type SpeedUnit = 'kmh' | 'mph'

export const MPH_TO_KMH = 1.609344

/**
 * mph를 km/h로 바꾼다.
 * @param {number} mph - 시속(마일)
 * @returns {number} 시속(킬로미터)
 */
export function mphToKmh(mph: number): number {
  return mph * MPH_TO_KMH
}

/**
 * km/h를 mph로 바꾼다.
 * @param {number} kmh - 시속(킬로미터)
 * @returns {number} 시속(마일)
 */
export function kmhToMph(kmh: number): number {
  return kmh / MPH_TO_KMH
}

/**
 * 단위 라벨을 반환한다.
 * @param {SpeedUnit} unit - 속도 단위
 * @returns {string} 라벨
 */
export function speedUnitLabel(unit: SpeedUnit): string {
  return unit === 'kmh' ? 'km/h' : 'mph'
}

/**
 * mph 값을 선택한 단위의 표시 문자열로 만든다.
 * @param {number} mph - 시속(마일)
 * @param {SpeedUnit} unit - 표시 단위
 * @returns {string} 예: "27.4 km/h"
 */
export function formatSpeed(mph: number, unit: SpeedUnit): string {
  const value = unit === 'kmh' ? mphToKmh(mph) : mph
  return `${value.toFixed(1)} ${speedUnitLabel(unit)}`
}
