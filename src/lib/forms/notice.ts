import { compareYmd, diffDays, isYmd, weekdayOf } from '@/lib/analytics/dates'
import { hasPrivateShape } from '@/lib/payload/validate'
import { MAX_CARDS, MAX_NAME, MAX_RANGE_DAYS, MAX_STATUS, type ClosureNotice, type DraftCard, type NoticeCard } from '@/types/forms'
// themes.ts도 이 파일(sortCards)을 부른다. 서로 부르는 것은 함수 안에서만이라 불러오는 차례와 상관없다
import { isAccentHex, isThemePick } from './themes'

// 서식 탭 휴진 안내의 안내 내용 규칙 (specs/forms design.md 3절). 날짜 계산은 lib/analytics/dates.ts만 쓴다

type CardField = keyof DraftCard
export type CardErrors = Partial<Record<CardField, string>>

const MIN_YEAR = 2020 // form_notices 표 제약과 같다
const MAX_YEAR = 2100
const PAST_DAYS = 30 // 이보다 더 지난 날짜는 다음 해로 본다
const CONTROL = /\p{Cc}/u
const WEEKDAYS = '일월화수목금토'
const NOTICE_KEYS = ['year', 'month', 'cards', 'theme']
const NOTICE_KEYS_WITH_ACCENT = [...NOTICE_KEYS, 'accent'] // 글자 색 열쇠는 있어도 되고 없어도 된다(specs/forms-accent design.md 3절)
const CARD_KEYS = ['start', 'end', 'name', 'status']

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`
const lengthOf = (text: string) => Array.from(text).length
const isInteger = (value: unknown, min: number, max: number): value is number =>
  Number.isInteger(value) && (value as number) >= min && (value as number) <= max

// 앞뒤 공백을 뗀 글. 길이·제어 문자·개인정보 모양이 어긋나면 까닭 글
function textProblem(text: string, max: number, what: string): string | null {
  if (text === '') return `${what}을 적어 주세요`
  if (lengthOf(text) > max) return `${what}은 ${max}자까지예요`
  if (CONTROL.test(text)) return `${what}에 쓸 수 없는 글자가 있어요`
  if (hasPrivateShape(text)) return `${what}에 전화번호·주민번호·메일 주소 모양은 넣을 수 없어요`
  return null
}

export function checkCard(draft: DraftCard): { card: NoticeCard } | { errors: CardErrors } {
  const errors: CardErrors = {}
  const startOk = isYmd(draft.start)
  if (!startOk) errors.start = '있는 날짜를 골라 주세요'

  const end = draft.end === '' ? null : draft.end
  if (end !== null) {
    if (!isYmd(end)) errors.end = '있는 날짜를 골라 주세요'
    else if (startOk && compareYmd(end, draft.start) <= 0) errors.end = '끝 날짜는 시작 날짜보다 뒤여야 해요'
    else if (startOk && diffDays(draft.start, end) >= MAX_RANGE_DAYS) errors.end = `시작 날짜부터 ${MAX_RANGE_DAYS}일 안이어야 해요`
  }

  const name = draft.name.trim()
  const nameProblem = textProblem(name, MAX_NAME, '이름')
  if (nameProblem) errors.name = nameProblem
  const status = draft.status.trim()
  const statusProblem = textProblem(status, MAX_STATUS, '아래 글')
  if (statusProblem) errors.status = statusProblem

  return Object.keys(errors).length > 0 ? { errors } : { card: { start: draft.start, end, name, status } }
}

// 정해진 열쇠가 빠짐없이, 그것만 있는 객체
function exactly(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const own = Object.keys(value)
  return own.length === keys.length && keys.every((key) => own.includes(key)) ? (value as Record<string, unknown>) : null
}

// 서버에서 읽은 카드: 카드 검사를 넘고, 검사가 고쳐 쓸 것이 없어야 한다(고쳐 쓰지 않는다)
function storedCard(value: unknown): NoticeCard | null {
  const o = exactly(value, CARD_KEYS)
  if (o === null) return null
  const { start, end, name, status } = o
  if (typeof start !== 'string' || typeof name !== 'string' || typeof status !== 'string') return null
  if (end !== null && (typeof end !== 'string' || end === '')) return null
  const result = checkCard({ start, end: end ?? '', name, status })
  if (!('card' in result)) return null
  const { card } = result
  return card.name === name && card.status === status ? card : null
}

export function checkNotice(value: unknown): ClosureNotice | null {
  const withAccent = exactly(value, NOTICE_KEYS_WITH_ACCENT)
  const o = withAccent ?? exactly(value, NOTICE_KEYS)
  if (o === null) return null
  const { year, month, cards, theme } = o
  // 열쇠가 없으면 자동(null). 열쇠가 있으면 null(자동) 또는 '#' + 소문자 16진수 6자리, undefined도 틀린 값 (specs/forms-accent AC-4703.3)
  const accent = withAccent === null ? null : withAccent.accent
  if (accent !== null && !isAccentHex(accent)) return null
  if (!isInteger(year, MIN_YEAR, MAX_YEAR) || !isInteger(month, 1, 12)) return null
  // null(저절로·그림 1) 또는 고른 그림 값(테마 열쇠·<열쇠>-2·auto-2·bg-<uuid>) (specs/forms-themes AC-4602.4)
  if (theme !== null && !isThemePick(theme)) return null
  if (!Array.isArray(cards) || cards.length < 1 || cards.length > MAX_CARDS) return null
  const checked: NoticeCard[] = []
  for (const item of cards) {
    const card = storedCard(item)
    if (card === null) return null
    checked.push(card)
  }
  // 자동(null)이면 accent 열쇠를 넣지 않는다(글자 색 없는 지금 값과 똑같이 돌려준다)
  return accent === null ? { year, month, cards: checked, theme } : { year, month, cards: checked, theme, accent }
}

const monthDay = (date: string) => `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`
const weekday = (date: string) => WEEKDAYS[weekdayOf(date) % 7]

export function dateLabel(card: Pick<NoticeCard, 'start' | 'end'>): string {
  const first = `${monthDay(card.start)}(${weekday(card.start)})`
  if (card.end === null) return first
  const sameMonth = card.end.slice(0, 7) === card.start.slice(0, 7)
  const last = sameMonth ? `${Number(card.end.slice(8, 10))}일` : monthDay(card.end)
  return `${first}~${last}(${weekday(card.end)})`
}

// 글에 연도가 없는 날짜: 올해로 두되, 오늘보다 30일 넘게 지났으면 다음 해. 없는 날짜면 null
export function resolveYear(month: number, day: number, today: string): string | null {
  const thisYear = Number(today.slice(0, 4))
  const date = ymd(thisYear, month, day)
  if (!isYmd(date)) return null
  if (diffDays(date, today) <= PAST_DAYS) return date
  const next = ymd(thisYear + 1, month, day)
  return isYmd(next) ? next : null
}

// 끝 날짜: 시작의 해로 두되, 끝 달이 시작 달보다 작으면 다음 해. 없는 날짜면 null
export function resolveEnd(start: string, endMonth: number, endDay: number): string | null {
  const year = Number(start.slice(0, 4)) + (endMonth < Number(start.slice(5, 7)) ? 1 : 0)
  const date = ymd(year, endMonth, endDay)
  return isYmd(date) ? date : null
}

// 가장 이른 시작 날짜의 연·월. 날짜 있는 카드가 없으면 오늘의 달
export function noticeMonthOf(cards: readonly { start: string }[], today: string): { year: number; month: number } {
  const starts = cards.map((card) => card.start).filter(isYmd).sort(compareYmd)
  const first = starts[0] ?? today
  return { year: Number(first.slice(0, 4)), month: Number(first.slice(5, 7)) }
}

// 시작 날짜 차례(같으면 적은 차례 그대로). 새 배열
export function sortCards<T extends { start: string }>(cards: readonly T[]): T[] {
  return [...cards].sort((a, b) => compareYmd(a.start, b.start))
}

export function noticeTitle(notice: ClosureNotice): string {
  const names = sortCards(notice.cards).slice(0, 2).map((card) => card.name)
  return `${notice.year}년 ${notice.month}월 · ${names.join('·')}`
}

export function fileNameOf(notice: Pick<ClosureNotice, 'year' | 'month'>): string {
  return `휴진안내_${notice.year}-${pad(notice.month)}.png`
}
