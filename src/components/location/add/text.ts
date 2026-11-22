import { MAX_M2, m2ToPyeong } from '@/lib/location/area'
import { commaText, wonText } from '@/lib/location/money'
import type { Listing } from '@/types/location'

// 후보 더하기 판 화면 글(시안 docs/mockups/location/index.html ?s=add 글 그대로 + 시안에 없던 안내 몇 줄).
// requirements '화면 글 기본값'에는 이 판 글이 없어 시안이 기준이다. 영어 낱말 없음(m·km 단위는 됨, AC-7917.1)

export const ADD_TEXT = {
  title: '후보 더하기',
  close: '닫기',
  ways: '더하는 길',
  way: { address: '주소로 찾기', map: '지도에서 찍기', listing: '붙여 넣은 매물에서' },
  // 주소로 찾기(카카오 주소 찾기 k-address)
  address: '주소',
  required: '필수',
  addressHelp: '도로명·지번·건물 이름으로 찾아요(카카오 주소 찾기).',
  find: '찾기',
  finding: '찾고 있어요…',
  queryBad: '주소를 2~100자로 적어 주세요.',
  hits: '찾은 주소',
  noHits: '찾은 주소가 없어요. 도로명이나 지번을 다르게 적어 보세요.',
  noText: '주소가 없는 자리예요.',
  // 층 · 이름
  floor: '층',
  floorHolder: '예: 5층',
  name: '부르는 이름',
  nameHolder: '예: 예시빌딩 3층',
  nameBad: '부르는 이름을 1~40자로 적어 주세요.',
  // 지도에서 찍기
  mapLabel: '후보 자리 찍기',
  mapHelp: '지도에서 자리를 누르면 주소가 채워져요.',
  picked: '고른 자리',
  notPicked: '아직 찍지 않았어요.',
  spotFinding: '주소를 찾고 있어요…',
  // 붙여 넣은 매물에서
  listingLead: '매물 탭에 붙여 넣은 매물 가운데 아직 후보가 아닌 것이에요.',
  listings: '붙여 넣은 매물',
  noListings: '후보가 아닌 매물이 없어요.',
  listingNoPoint: '이 매물은 자리가 정해지지 않았어요. 주소로 찾아 자리를 골라 주세요.',
  // 살필 범위 · 메모
  range: '살필 범위',
  ticks: ['300m', '1km', '3km'],
  rangeHelp: '저장한 뒤에도 후보 자세히에서 바꿀 수 있어요.',
  memo: '메모',
  memoHolder: '예: 네이버 부동산에서 봄, 중개사 김예시',
  // 발
  cancel: '그만두기',
  save: '후보로 저장',
  need: {
    address: '찾은 주소에서 하나를 골라 주세요.',
    map: '지도에서 자리를 찍어 주세요.',
    listing: '매물을 하나 골라 주세요.',
    listingPoint: '매물 자리를 주소로 찾아 골라 주세요.',
  },
} as const

/** 저장 안내(시안 .need): 오늘 날짜를 `{달}월 {날}일`로 */
export function readyText(today: string): string {
  const [, month, day] = today.split('-').map(Number)
  return `저장하면 오늘(${month}월 ${day}일) 받은 자료로 굳혀 두고 기준 날짜를 함께 남겨요.`
}

/** 모으는 동안 진행(design.md 14절 `자료 {n}/{m}`) */
export function progressText(done: number, total: number): string {
  return `자료 ${done}/${total}`
}

/** 매물 한 줄 아래 글(시안): `전용 {평}평 · 보증금 {금액} / 월세 {금액} · {중개사}` — 없는 조각은 뺀다 */
export function listingLine(l: Pick<Listing, 'areaM2' | 'deposit' | 'rent' | 'brokerNote'>): string {
  const money = (won: number | null) => (won !== null && Number.isSafeInteger(won) ? wonText(won) : '–')
  const parts: string[] = []
  if (l.areaM2 !== null && Number.isFinite(l.areaM2) && l.areaM2 > 0 && l.areaM2 <= MAX_M2) parts.push(`전용 ${commaText(m2ToPyeong(l.areaM2))}평`)
  if (l.deposit !== null || l.rent !== null) parts.push(`보증금 ${money(l.deposit)} / 월세 ${money(l.rent)}`)
  if (l.brokerNote.trim()) parts.push(l.brokerNote.trim())
  return parts.join(' · ')
}
