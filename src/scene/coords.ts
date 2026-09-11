import { FT } from '@/domain/constants'
import type { PathSample } from '@/domain/types'
import { Vector3 } from 'three'

/**
 * 물리 x(볼러 기준 오른쪽 +)를 Three.js x로 바꾼다.
 * 카메라가 레인(+z)을 볼 때 Three +x가 화면 왼쪽이라 부호를 뒤집는다.
 * @param {number} x - 물리 가로(m)
 * @returns {number} Three.js 가로
 */
export function physXToThree(x: number): number {
  return -x
}

/**
 * 레인 물리 좌표(x 가로, y 다운레인, z 위)를 Three.js(Y-up)로 변환한다.
 * @param {number} x - 가로(m)
 * @param {number} yDown - 다운레인(m)
 * @param {number} zUp - 높이(m)
 * @returns {Vector3} Three.js 좌표
 */
export function physToThree(x: number, yDown: number, zUp: number): Vector3 {
  return new Vector3(physXToThree(x), zUp, yDown)
}

/**
 * 물리 각속도를 Three.js 각속도로 변환한다.
 *
 * 위치 변환 `(x, y, z) → (-x, z, y)`는 행렬식이 1인 진짜 회전이라, 각속도 같은
 * 축벡터에도 **같은 변환**을 그대로 쓴다.
 *
 * 부호를 손으로 적다가 z 성분을 뒤집어 둔 적이 있다. 그 성분이 다운레인 축 둘레
 * 회전, 곧 훅을 만드는 사이드 롤이라 핀덱에 들어간 공이 휘지 않고 직진했다.
 *
 * @param {Vec3} omega - 물리 각속도 (x 가로, y 다운레인, z 위)
 * @returns {Vector3} Three.js 각속도
 */
export function physOmegaToThree(omega: { x: number; y: number; z: number }): Vector3 {
  return new Vector3(-omega.x, omega.z, omega.y)
}

/**
 * 궤적 샘플을 Three.js 볼 중심 좌표로 변환한다.
 * @param {PathSample} sample - 궤적 샘플
 * @param {number} radius - 볼 반지름
 * @returns {Vector3} 볼 중심
 */
export function sampleToBallPos(sample: PathSample, radius: number): Vector3 {
  return physToThree(sample.x, sample.y, radius)
}

/**
 * 피트를 미터로 바꾼다.
 * @param {number} feet - 피트
 * @returns {number} 미터
 */
export function ft(feet: number): number {
  return feet * FT
}
