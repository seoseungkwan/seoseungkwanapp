import { cleanText } from '@/lib/contacts/fields'
import { toStoredM2, type AreaUnit } from '@/lib/location/area'
import { wonText } from '@/lib/location/money'
import type { Listing } from '@/types/location'
import { BROKER_NOTE_MAX, brokerBody, brokerNote, type BrokerBody } from './broker'

// 매물 붙여 넣기 칸 읽기 (spec location AC-7910.2·AC-7910.4, design.md 7절 location_listings, 시안 ?s=listings '매물 붙여 넣기').
// 적은 글자 → 저장 몸통(lib/storage/location.ts addListing이 받는 칸 열넷과 같은 모양) + 주소록 몸통(broker.ts).
// 링크는 비우거나 https 주소만 · 넓이는 평 또는 ㎡로 적고 저장은 ㎡(area.ts toStoredM2, 소수 2자리 버림) ·
// 금액은 만 원 정수로 적고 저장은 원 정수(× 10,000, CLAUDE.md 금액 규칙) · 꼭 적는 칸은 시안 그대로 건물 이름·전용 넓이·월세

/** 매물 저장 몸통 = 매물 줄에서 DB가 정하는 칸(id·시각)을 뺀 것 */
export type ListingInput = Omit<Listing, 'id' | 'createdAt' | 'updatedAt'>

export type PasteDraft = {
  url: string
  title: string
  floor: string
  area: string
  areaUnit: AreaUnit
  deposit: string
  rent: string
  premium: string
  mgmt: string
  office: string
  person: string
  phone: string
  memo: string
  /** 중개사를 주소록(기타)에도 넣는다(시안 처음 값: 켬) */
  book: boolean
}
export type PasteField = Exclude<keyof PasteDraft, 'areaUnit' | 'book'>
export type PasteErrors = Partial<Record<PasteField, string>>
export type PasteResult = { ok: true; fields: ListingInput; broker: BrokerBody | null } | { ok: false; errors: PasteErrors }

/** 칸 차례(틀린 칸이 여럿이면 앞의 칸으로 간다) */
export const PASTE_FIELDS: readonly PasteField[] = ['url', 'title', 'floor', 'area', 'deposit', 'rent', 'premium', 'mgmt', 'office', 'person', 'phone', 'memo']

export const EMPTY_PASTE: PasteDraft = {
  url: '',
  title: '',
  floor: '',
  area: '',
  areaUnit: 'pyeong',
  deposit: '',
  rent: '',
  premium: '',
  mgmt: '',
  office: '',
  person: '',
  phone: '',
  memo: '',
  book: true,
}

/** 칸 글자 수 끝(DB 제약 · 주소록 칸 한도와 같음) */
export const PASTE_LIMITS = { url: 500, title: 40, floor: 20, area: 12, money: 9, office: 40, person: 20, phone: 30, memo: 500 } as const

/** 만 원 칸 끝: 999,999만 원 = 9,999,990,000원(DB bigint 검사 9,999,999,999 안) */
export const MAX_MAN = 999_999
const WON_PER_MAN = 10_000

export const PASTE_TEXT = {
  url: '매물 링크는 주소창에 보이는 주소를 그대로 붙여 넣어 주세요. 보안 연결 주소만 받아요.',
  urlLong: `매물 링크는 ${PASTE_LIMITS.url}자까지 받아요.`,
  title: '건물 이름을 적어 주세요.',
  area: '전용 넓이를 숫자로 적어 주세요.',
  office: '중개사 이름을 적어 주세요.',
  brokerLong: `중개사 이름·담당자·전화를 합쳐 ${BROKER_NOTE_MAX}자까지 적을 수 있어요.`,
} as const

type MoneyField = 'deposit' | 'rent' | 'premium' | 'mgmt'
// 칸 이름 · 을/를 · 은/는
const MONEY_WORDS: Record<MoneyField, readonly [string, string, string]> = {
  deposit: ['보증금', '을', '은'],
  rent: ['월세', '를', '는'],
  premium: ['권리금', '을', '은'],
  mgmt: ['관리비', '를', '는'],
}
export function moneyText(field: MoneyField, kind: 'bad' | 'big'): string {
  const [name, object, topic] = MONEY_WORDS[field]
  return kind === 'bad' ? `${name}${object} 숫자로 적어 주세요(만 원).` : `${name}${topic} ${wonText(MAX_MAN * WON_PER_MAN)}까지 적을 수 있어요.`
}

// lib/storage/location.ts와 같은 규칙: https:// 뒤에 빈칸·제어 문자가 없는 글자 하나 이상
const HTTPS = /^https:\/\/[^\s\p{Cc}]+$/u

function readUrl(text: string): string | 'bad' | 'long' {
  const t = cleanText(text)
  if (t === '') return ''
  const url = t.replace(/^https:\/\//i, 'https://')
  if (Array.from(url).length > PASTE_LIMITS.url) return 'long'
  return HTTPS.test(url) ? url : 'bad'
}

/** 만 원 글자 → 원 정수. 빈 글자는 null, 쉼표·빈칸이 섞인 0 이상 정수만, 999,999만 원을 넘으면 'big' */
export function manToWon(text: string): number | null | 'bad' | 'big' {
  const t = text.replace(/[,\s]/g, '')
  if (t === '') return null
  if (!/^\d+$/.test(t)) return 'bad'
  const man = Number(t)
  return man > MAX_MAN ? 'big' : man * WON_PER_MAN
}

/** 넓이 글자 → 저장 ㎡. 0보다 큰 숫자(소수 가능, 쉼표 됨)만, 버린 뒤 0이거나 너무 크면 null */
function readArea(text: string, unit: AreaUnit): number | null {
  const t = text.replace(/[,\s]/g, '')
  if (!/^\d+(?:\.\d+)?$/.test(t)) return null
  return toStoredM2(Number(t), unit)
}

export function readPaste(d: PasteDraft): PasteResult {
  const errors: PasteErrors = {}

  const url = readUrl(d.url)
  if (url === 'bad') errors.url = PASTE_TEXT.url
  if (url === 'long') errors.url = PASTE_TEXT.urlLong

  const title = cleanText(d.title)
  if (title === '') errors.title = PASTE_TEXT.title

  const areaM2 = readArea(d.area, d.areaUnit)
  if (areaM2 === null) errors.area = PASTE_TEXT.area

  const money = {} as Record<MoneyField, number | null>
  for (const field of ['deposit', 'rent', 'premium', 'mgmt'] as const) {
    const won = manToWon(d[field])
    if (won === 'bad' || won === 'big') errors[field] = moneyText(field, won)
    else if (won === null && field === 'rent') errors.rent = moneyText('rent', 'bad')
    else money[field] = won
  }

  const broker = { office: d.office, person: d.person, phone: d.phone }
  const note = brokerNote(broker)
  if (cleanText(d.office) === '' && note !== '') errors.office = PASTE_TEXT.office
  else if (Array.from(note).length > BROKER_NOTE_MAX) errors.office = PASTE_TEXT.brokerLong

  if (Object.keys(errors).length > 0 || areaM2 === null) return { ok: false, errors }
  return {
    ok: true,
    fields: {
      candidateId: null,
      title,
      url,
      areaM2,
      floorLabel: cleanText(d.floor),
      deposit: money.deposit ?? null,
      rent: money.rent ?? null,
      premium: money.premium ?? null,
      mgmt: money.mgmt ?? null,
      brokerId: null,
      brokerNote: note,
      memo: d.memo.normalize('NFC').trim(),
      lat: null,
      lng: null,
    },
    broker: d.book ? brokerBody(broker) : null,
  }
}
