import type { CandidateStatus } from '@/types/location'

// 후보 견주기 화면 글(시안 ?s=compare 글 그대로 — requirements '화면 글 기본값'에 이 화면 글은 없다).
// 진행 상태 이름은 requirements '이미 정한 것' 11(보는 중 → 중개사 연락 → 보러 감 → 계약 검토 / 내려놓음)

/** 진행 상태 다섯 이름 */
export const STATUS_TEXT: Readonly<Record<CandidateStatus, string>> = {
  watching: '보는 중',
  contacted: '중개사 연락',
  visited: '보러 감',
  reviewing: '계약 검토',
  dropped: '내려놓음',
}

/** 단계 단추 넷(차례 그대로). 내려놓음은 [내려놓기] 단추가 따로 맡는다 */
export const STEPS: readonly CandidateStatus[] = ['watching', 'contacted', 'visited', 'reviewing']

/** 견주는 후보 수: 2곳에서 4곳까지 */
export const MIN_PICK = 2
export const MAX_PICK = 4

export const COMPARE_TEXT = {
  scoreTitle: '후보 점수표',
  weights: '무게',
  editWeights: '무게 바꾸기',
  item: '항목',
  candidate: (letter: string) => `후보 ${letter}`,
  sum: '합계',
  points: (n: number) => `${n}점`,
  outOf: (n: number) => `/ ${n}`,
  best: '가장 높음',
  rank: (n: number) => `${n}등`,
  noValue: '값 없음',
  noListing: '매물 없음',
  noScore: '점수 없음',
  numbers: '숫자로 견주기 (후보마다 살필 범위 안)',
  rowRadius: '살필 범위',
  rowPeople: '사는 사람',
  rowSeniors: '60세 이상',
  rowRivals: '정형외과·통증·재활',
  rowRivalsNote: '한의원 뺌',
  rowPerRival: '1곳당 사는 사람',
  rowStation: '가장 가까운 역',
  rowSite: '층 · 전용 평수',
  rowMoney: '보증금 / 월세',
  rowRentPy: '평당 월세',
  rowPremium: '권리금',
  rowFlags: '위험 신호',
  noData: '자료 없음',
  noRival: '경쟁 의원 없음',
  flagCount: (n: number) => `${n}개`,
  noFlag: '없음',
  dash: '–',
  savedValues: (parts: readonly string[]) => `각 후보 숫자는 그 후보를 저장한 날 값이에요(${parts.join(' · ')})`,
  noSnapshot: '받은 값 없음',
  few: '후보를 2곳 이상 저장하면 나란히 견줘 드려요',
  pick: '견줄 후보',
  pickHelp: '2곳에서 4곳까지 골라 견줘요',
  progressTitle: '진행 상태',
  progressAside: '단계를 누르면 바뀌고 진행 메모에 날짜가 남아요',
  progressGroup: (name: string) => `${name} 진행 상태`,
  saved: (day: string) => `저장 ${day}`,
  drop: '내려놓기',
  dropped: (n: number) => `내려놓은 후보 ${n}곳`,
  droppedTag: '내려놓음',
  restore: '다시 올리기',
} as const

/** 후보 글자: 받은 차례대로 A·B·C … Z, 그 뒤는 27·28 … */
export function letterOf(index: number): string {
  return index < 26 ? String.fromCharCode(65 + index) : String(index + 1)
}
