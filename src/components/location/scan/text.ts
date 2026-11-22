// 동네 훑기 화면 글(requirements '화면 글 기본값' › 동네 훑기 동 자세히, 없는 글은 시안 ?s=scan 그대로)
import { todayInKorea } from '@/lib/analytics/dates'
import { commaText } from '@/lib/location/money'

export const SCAN_TEXT = {
  sido: '시·도',
  sgg: '시·군·구',
  sidoPick: '시·도 고르기',
  sggPick: '시·군·구 고르기',
  pickFirst: '시·도와 시·군·구를 고르면 행정동마다 점수 색을 칠해요.',
  when: (count: number, time: string) => (time ? `행정동 ${count}곳 · ${time}에 받은 자료로 매겼어요` : `행정동 ${count}곳`),
  sourcesLink: '점수 매기는 법과 출처 보기',
  loading: '동마다 자료를 받는 중이에요',
  progress: (done: number, total: number) => `자료 ${done}/${total}`,
  outside: '이 지역은 자료 없음',
  missing: '받지 못한 자료',
  mapLabel: (sggName: string) => `${sggName} 행정동 점수 지도`,
  legend: '점수',
  legendCandidate: '파란 표시 = 저장한 후보',
  picked: '고른 동',
  unit: '점',
  noScore: '점수 없음',
  noValue: '값 없음',
  people: (total: number) => `사는 사람 ${commaText(total)}명`,
  used: (count: number) => `${count}개 항목으로 매겼어요`,
  add: (name: string) => `${name}에서 후보 더하기`,
  naver: (name: string) => `네이버 부동산에서 ${name} 매물 보기`,
  help: '동 점수는 동 전체 값으로 세 항목(사는 사람·수요, 경쟁, 교통·흐름)만 매겨요. 자리·비용은 동 단위 자료가 없어 후보를 정한 뒤에 매겨요. 후보를 저장하면 그 자리 둘레(살필 범위)로 다시 매겨요.',
  rankTitle: '추천 동 순위',
  rankAside: '점수 높은 차례',
  allDongs: (count: number) => `모든 동 ${count}곳 보기`,
  sixOnly: '여섯 곳만 보기',
  candidate: (label: string) => `후보 ${label}`,
  // 점수 풀이(requirements '화면 글 기본값' › 점수 풀이 끝 줄 — 동네 훑기 순위)
  up: '올린 것',
  down: '내린 것',
  rankHelp: '올린 것·내린 것은 이 시·군·구 행정동 평균보다 점수를 가장 많이·가장 덜 받은 세부 항목이에요.',
  // 경쟁 의원 과목을 하나도 안 골랐을 때(requirements '고른 과목을 따르는 글' › 하나도 안 고름, AC-7921.7)
  noDepts: '과목 없음',
  noDeptsNote: '경쟁 의원 과목을 하나 이상 골라 주세요. 지금은 경쟁 점수를 셀 수 없어요',
  pickDepts: '과목 고르기',
} as const

// h23: 자정을 '24:00'이 아니라 '00:00'으로
const KOREA_TIME = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

/** 받은 시각(ISO) → '2026년 11월 22일 10:40'(한국 시각). 날짜는 dates.ts, 읽지 못하면 빈 글 */
export function atText(iso: string): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ''
  const [year, month, day] = todayInKorea(at).split('-').map(Number)
  const parts = Object.fromEntries(KOREA_TIME.formatToParts(at).map((p) => [p.type, p.value]))
  return `${year}년 ${month}월 ${day}일 ${parts.hour}:${parts.minute}`
}
