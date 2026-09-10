import type { KegelPass } from '@/domain/patterns/kegel'

/**
 * WB Montreal (41') — 공개 Kegel Multi 프로그램의 T.OIL(μL).
 * 첨부한 Flex 시트와 동일한 패턴(41ft, 26.89mL, 3.1:1)이다.
 * Flex 표에는 μL이 없어, 같은 패턴의 계량값으로 격자를 재구성한다.
 */
export const MONTREAL_FORWARD: KegelPass[] = [
  { start: '2L', stop: '2R', distStart: 0, distEnd: 10, tOilUl: 9805 },
  { start: '5L', stop: '5R', distStart: 10, distEnd: 13, tOilUl: 1550 },
  { start: '6L', stop: '6R', distStart: 13, distEnd: 15, tOilUl: 1450 },
  { start: '7L', stop: '7R', distStart: 15, distEnd: 20, tOilUl: 2700 },
  { start: '8L', stop: '8R', distStart: 20, distEnd: 23, tOilUl: 1250 },
  { start: '10L', stop: '10R', distStart: 23, distEnd: 25, tOilUl: 1050 },
  { start: '11L', stop: '11R', distStart: 25, distEnd: 28, tOilUl: 950 },
  { start: '12L', stop: '12R', distStart: 28, distEnd: 30, tOilUl: 850 },
  { start: '13L', stop: '13R', distStart: 30, distEnd: 33, tOilUl: 750 },
  { start: '14L', stop: '14R', distStart: 33, distEnd: 36, tOilUl: 650 },
]

export const MONTREAL_REVERSE: KegelPass[] = [
  { start: '12L', stop: '10R', distStart: 17, distEnd: 20, tOilUl: 1045 },
  { start: '11L', stop: '9R', distStart: 12, distEnd: 17, tOilUl: 2310 },
  { start: '10L', stop: '8R', distStart: 7, distEnd: 12, tOilUl: 2530 },
]

export const MONTREAL_DISTANCE_FT = 41
export const MONTREAL_TOTAL_ML = 26.89
export const MONTREAL_RATIO = 3.1
