// 개원 준비 — 건물 요건·계약 전 위험·보러 갈 때 점검표·사진·진행 메모·진행 상태의 화면 글
// (requirements '화면 글 기본값' 개원 준비 줄이 먼저, 거기 없는 글은 승인된 시안 ?s=plan·?s=compare 그대로).
// 점검 줄 글·법 기준 없음 글은 lib/location/checklist.ts, 법 이름은 LAW_BASIS(lib/location/sources.ts)가 한 곳이다
import type { CandidateStatus } from '@/types/location'
import type { CheckValue } from '@/lib/location/checklist'

/** 칸 이름에 쓰는 지금 값 */
const OX_STATE: Record<CheckValue, string> = { yes: '됨', no: '안 됨', unknown: '모름' }

export const BUILDING_TEXT = {
  title: '건물 요건 표',
  aside: '○ 됨 · ✕ 안 됨 · ? 모름 — 칸을 누르면 바뀌어요',
  heads: ['요건', '있어야 하는 것', '이 자리', '어떻게 알았나', '법 근거'],
  /** 칸 그림(시안 OX) */
  mark: { yes: '○', no: '✕', unknown: '?' } satisfies Record<CheckValue, string>,
  oxLabel: (label: string, v: CheckValue) => `${label}: ${OX_STATE[v]} (누르면 바뀜)`,
  howLabel: (label: string) => `${label} 어떻게 알았나`,
  count: (n: Record<CheckValue, number>) => `○ ${n.yes} · ✕ ${n.no} · ? ${n.unknown}`,
} as const

// 등기부 확인 다섯 줄: [굵은 앞말, 나머지](시안 그대로, 나머지 앞 빈칸까지)
export const REGI_STEPS: readonly (readonly [string, string])[] = [
  ['인터넷등기소에서 건물 등기부를 떼요.', ' 한 통에 몇백 원이고 누구나 뗄 수 있어요.'],
  ['소유자', ' 이름이 계약하는 사람(건물주)과 같은지 봐요.'],
  ['근저당(건물을 맡기고 빌린 돈)', '이 얼마인지 봐요. 보증금보다 많이 잡혀 있으면 보증금을 못 돌려받을 수 있어요.'],
  ['압류·가압류·경매', ' 글자가 있으면 계약하지 않아요.'],
  ['', '계약하는 날 한 번 더 떼서 그사이 바뀐 것이 없는지 봐요.'],
]

export const RISK_TEXT = {
  title: '계약 전 위험',
  regiTitle: '등기부 확인 — 계약하기 전에 꼭',
  iros: '인터넷등기소 바로 가기',
  irosHelp:
    '인터넷등기소 첫 화면이 새 창으로 열려요(주소는 거기서 직접 넣어요). 이 앱은 등기부를 받아 오지 않고 링크만 걸어요. 첫 화면에서 보안 프로그램을 깔라고 할 수 있어요.',
  memoLabel: '임대 조건 메모',
  memoPlaceholder: '중개사와 말한 것, 건물주에게 물을 것',
  /** 협상표(매물) 앞 세 줄 요약: `{이름} {바라는 것 · 없으면 지금 제안 · 없으면 –}` */
  nego: (parts: readonly string[]) => `임대 조건 협상표(매물)에 적은 것: ${parts.join(' · ')} …`,
  clausesTitle: '계약서에 꼭 넣을 것',
} as const

// 협상표 앞 세 열쇠(design.md 11절 terms 열쇠 차례)와 시안 이름
export const NEGO_HEAD: readonly (readonly [string, string])[] = [
  ['freeRent', '무상 기간'],
  ['mgmt', '관리비'],
  ['raise', '월세 올리는 비율'],
]
export const EMPTY_VALUE = '–'

export const VISIT_TEXT = {
  title: '보러 갈 때 점검표',
  done: (n: number, total: number) => `${n} / ${total} 했어요`,
  photos: '사진',
  photoCount: (n: number) => `${n}장 · 이 후보에만 붙어요`,
  addPhoto: '사진 올리기',
  /** 그림이 아직 없을 때 자리 글 · 이름 없는 사진의 대신 글 */
  photoPlaceholder: '사진',
  deletePhoto: '지우기',
  deletePhotoLabel: (label: string) => `${label ? `${label} ` : ''}사진 지우기`,
} as const

export const NOTES_TEXT = {
  title: '진행 메모',
  aside: '날짜별 · 새것이 위',
  dateLabel: '메모 날짜',
  textLabel: '메모',
  placeholder: '예: 중개사와 통화 — 무상 기간 3개월 됨',
  add: '메모 더하기',
  empty: '메모를 적어 주세요.',
  delete: '지우기',
  deleteLabel: (day: string) => `${day} 메모 지우기`,
} as const

// 진행 상태(design.md 7절 status 다섯, 시안 STEPS + 내려놓음)
export const STATUS_STEPS: readonly (readonly [Exclude<CandidateStatus, 'dropped'>, string])[] = [
  ['watching', '보는 중'],
  ['contacted', '중개사 연락'],
  ['visited', '보러 감'],
  ['reviewing', '계약 검토'],
]
export const STATUS_TEXT = {
  label: '진행 상태',
  drop: '내려놓기',
  dropped: '내려놓음',
  step: (i: number, label: string) => `${i + 1}. ${label}`,
} as const

/** 시안 md(): '2026-11-21' → '11월 21일' */
export function monthDayText(ymd: string): string {
  const [, m, d] = ymd.split('-').map(Number)
  return `${m}월 ${d}일`
}

/** 글자 수(코드포인트)로 자르기 — DB char_length와 같게 */
export function cutText(text: string, max: number): string {
  const chars = Array.from(text)
  return chars.length > max ? chars.slice(0, max).join('') : text
}
