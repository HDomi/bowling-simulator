/** 릴리즈 스타일별 평균 회전수·속도·축 각도 프리셋. */

export type ReleaseStyle = {
  id: string
  name: string
  note: string
  revRate: number
  speedMph: number
  axisRotation: number
  axisTilt: number
}

export const CUSTOM_STYLE_ID = 'custom'

/**
 * 공개 자료(bowling.com 볼러 타입, bowlingball.com BowlVersity, Spectre 볼러 프로필)의
 * 스타일별 rpm·속도·축 각도 구간에서 중앙값을 뽑은 값이다.
 */
export const RELEASE_STYLES: ReleaseStyle[] = [
  {
    id: 'usbc-harry',
    name: 'USBC 로봇 (Harry)',
    note: 'USBC 실측 검증에 쓰는 기준값',
    revRate: 275,
    speedMph: 17,
    axisRotation: 55,
    axisTilt: 13,
  },
  {
    id: 'straight',
    name: '스트레이트 (입문)',
    note: '회전이 거의 없어 직구로 굴러간다',
    revRate: 150,
    speedMph: 13,
    axisRotation: 10,
    axisTilt: 5,
  },
  {
    id: 'stroker',
    name: '스트로커',
    note: '속도 위주, 완만한 아크를 그린다',
    revRate: 240,
    speedMph: 17,
    axisRotation: 45,
    axisTilt: 15,
  },
  {
    id: 'tweener',
    name: '트위너',
    note: '스트로커와 크랭커의 중간, 가장 흔한 구질',
    revRate: 330,
    speedMph: 16.5,
    axisRotation: 60,
    axisTilt: 20,
  },
  {
    id: 'power-stroker',
    name: '파워 스트로커',
    note: '스트로커 폼에 회전을 더 얹은 형태',
    revRate: 360,
    speedMph: 16,
    axisRotation: 65,
    axisTilt: 22,
  },
  {
    id: 'cranker',
    name: '크랭커',
    note: '회전 위주, 백엔드에서 강하게 꺾인다',
    revRate: 440,
    speedMph: 15.5,
    axisRotation: 75,
    axisTilt: 25,
  },
  {
    id: 'thumbless',
    name: '덤리스 (원핸드 노섬)',
    note: '엄지를 빼고 손가락만으로 회전을 키운다',
    revRate: 480,
    speedMph: 16.5,
    axisRotation: 75,
    axisTilt: 12,
  },
  {
    id: 'two-handed',
    name: '투핸드',
    note: '고회전과 고속을 함께 내는 현대식 구질',
    revRate: 550,
    speedMph: 18.5,
    axisRotation: 80,
    axisTilt: 10,
  },
  {
    id: 'spinner',
    name: '스피너 (헬리콥터)',
    note: '축이 서 있어 훅이 늦게, 약하게 걸린다',
    revRate: 280,
    speedMph: 15.5,
    axisRotation: 85,
    axisTilt: 70,
  },
]

/**
 * id로 릴리즈 스타일 프리셋을 찾는다.
 * @param {string} id - 스타일 id
 * @returns {ReleaseStyle | undefined} 스타일
 */
export function getReleaseStyleById(id: string): ReleaseStyle | undefined {
  return RELEASE_STYLES.find((style) => style.id === id)
}

/**
 * 현재 릴리즈 값과 일치하는 프리셋 id를 찾는다. 없으면 직접 설정으로 본다.
 * @param {Omit<ReleaseStyle, 'id' | 'name' | 'note'>} release - 현재 릴리즈 값
 * @returns {string} 스타일 id 또는 CUSTOM_STYLE_ID
 */
export function matchReleaseStyleId(
  release: Omit<ReleaseStyle, 'id' | 'name' | 'note'>,
): string {
  const found = RELEASE_STYLES.find(
    (style) =>
      style.revRate === release.revRate &&
      style.speedMph === release.speedMph &&
      style.axisRotation === release.axisRotation &&
      style.axisTilt === release.axisTilt,
  )
  return found?.id ?? CUSTOM_STYLE_ID
}
