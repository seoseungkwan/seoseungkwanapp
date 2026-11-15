import { compareYmd, diffDays, isMonth, isYmd, todayInKorea } from '@/lib/analytics/dates'
import { checkCard, checkNotice, dateLabel, noticeMonthOf, type CardErrors } from '@/lib/forms/notice'
import { isAccentHex } from '@/lib/forms/themes'
import {
  DEFAULT_STATUS,
  MAX_CARDS,
  MAX_MEMO,
  MAX_NAME,
  MAX_RANGE_DAYS,
  MAX_STATUS,
  type ClosureNotice,
  type DraftCard,
  type NoticeCard,
  type SavedNotice,
  type ThemePick,
} from '@/types/forms'

// 서식 화면(휴진 안내)의 상태 한 곳과 순수 reducer (spec forms design.md 10절, 시안 docs/mockups/forms/screen.html).
// 화면(FormsScreen)이 useReducer로 쓰고, 부르기·저장·그림은 화면이 하고 결과만 여기로 보낸다.
// 대충 적은 글(memo)은 정리할 때만 쓰고 저장하지 않는다 — 저장 값과 '바뀐 내용' 비교에 들지 않는다

export type TidyCode = 'E-FORMS-PRIVATE' | 'E-FORMS-NO-DATE' | 'E-AI-BUSY' | 'E-AI-LIMIT' | 'E-AI-FAILED'
export type ListState = { kind: 'loading' } | { kind: 'ok'; items: SavedNotice[] } | { kind: 'failed' }
type StoreWork = 'saving' | 'deleting'
type StoreFailure = 'save' | 'delete'

export type FormsState = {
  today: string // 한국 날짜 YYYY-MM-DD
  memo: string
  tidying: boolean
  tidyError: TidyCode | null
  truncated: boolean // AI 답의 카드가 4장을 넘어 앞 4장만 넣었다
  id: string | null // 연(저장한) 안내문
  year: number
  month: number
  monthTouched: boolean // 안내 달을 직접 골랐다(카드를 따라가지 않는다)
  cards: DraftCard[]
  theme: ThemePick | null // null = 저절로·그림 1 (고른 그림 값, specs/forms-themes design.md 2절)
  accent: string | null // 글자 색('#' + 소문자 16진수 6자리). null = 자동 (specs/forms-accent design.md 5절)
  baseline: string | null // 마지막으로 저장하거나 연 값(snapshotOf). 새 안내문은 null
  list: ListState
  store: StoreWork | null
  storeError: StoreFailure | null
  imageFailed: boolean
}

type CardField = keyof DraftCard

export type FormsAction =
  | { type: 'memo'; text: string }
  | { type: 'tidyStart' }
  | { type: 'tidyDone'; cards: readonly NoticeCard[]; truncated: boolean }
  | { type: 'tidyFailed'; code: TidyCode }
  | { type: 'card'; index: number; field: CardField; value: string }
  | { type: 'addCard' }
  | { type: 'removeCard'; index: number }
  | { type: 'month'; value: string } // <input type="month">의 'YYYY-MM'
  | { type: 'theme'; theme: ThemePick | null }
  | { type: 'accent'; accent: string | null } // 색 고르기 칸의 값(소문자로 바꿔 넣는다) 또는 null(자동)
  | { type: 'new' }
  | { type: 'open'; notice: SavedNotice }
  | { type: 'listLoading' }
  | { type: 'listLoaded'; result: SavedNotice[] | 'failed' }
  | { type: 'saveStart' }
  | { type: 'saved'; notice: SavedNotice }
  | { type: 'deleteStart' }
  | { type: 'deleted'; id: string }
  | { type: 'storeFailed'; what: StoreFailure }
  | { type: 'imageFailed'; failed: boolean }

export const LEAVE_CONFIRM = '저장하지 않은 내용이 있어요. 버릴까요?'
const MIN_YEAR = 2020 // form_notices 표 제약과 같다
const MAX_YEAR = 2100

const CARD_KEYS: readonly string[] = ['start', 'end', 'name', 'status']
const TIDY_CODES: readonly unknown[] = ['E-FORMS-PRIVATE', 'E-FORMS-NO-DATE', 'E-AI-BUSY', 'E-AI-LIMIT', 'E-AI-FAILED'] satisfies TidyCode[]

export const blankCard = (): DraftCard => ({ start: '', end: '', name: '', status: DEFAULT_STATUS })
const draftOf = (card: NoticeCard): DraftCard => ({ start: card.start, end: card.end ?? '', name: card.name, status: card.status })
const cut = (text: string, max: number) => Array.from(text).slice(0, max).join('')

export function initialState(today: string): FormsState {
  const { year, month } = noticeMonthOf([], today)
  return {
    today,
    memo: '',
    tidying: false,
    tidyError: null,
    truncated: false,
    id: null,
    year,
    month,
    monthTouched: false,
    cards: [blankCard()],
    theme: null,
    accent: null,
    baseline: null,
    list: { kind: 'loading' },
    store: null,
    storeError: null,
    imageFailed: false,
  }
}

// 저장 값 비교용 글. 이름·아래 글은 저장할 때처럼 앞뒤 공백을 뗀다(공백만 다르면 같은 값). 글자 색이 없으면 자동(null)
function snapshotOf(n: {
  year: number
  month: number
  theme: ThemePick | null
  accent?: string | null
  cards: readonly { start: string; end: string | null; name: string; status: string }[]
}): string {
  return JSON.stringify([n.year, n.month, n.theme, n.accent ?? null, n.cards.map((c) => [c.start, c.end ?? '', c.name.trim(), c.status.trim()])])
}

// 안내 달을 직접 고르지 않았으면 가장 이른 시작 날짜의 달(날짜가 없으면 오늘의 달)
function followCards(state: FormsState): FormsState {
  if (state.monthTouched) return state
  const { year, month } = noticeMonthOf(state.cards, state.today)
  return { ...state, year, month }
}

export function formsReducer(state: FormsState, action: FormsAction): FormsState {
  switch (action.type) {
    case 'memo':
      return { ...state, memo: cut(action.text, MAX_MEMO), tidyError: null }
    case 'tidyStart':
      return { ...state, tidying: true, tidyError: null, truncated: false }
    case 'tidyDone':
      return followCards({
        ...state,
        tidying: false,
        tidyError: null,
        truncated: action.truncated,
        cards: action.cards.slice(0, MAX_CARDS).map(draftOf),
        monthTouched: false,
      })
    case 'tidyFailed':
      return { ...state, tidying: false, tidyError: action.code }
    case 'card': {
      if (!state.cards[action.index]) return state
      const cards = state.cards.map((card, i) => (i === action.index ? { ...card, [action.field]: action.value } : card))
      return followCards({ ...state, cards })
    }
    case 'addCard':
      return state.cards.length >= MAX_CARDS ? state : { ...state, cards: [...state.cards, blankCard()] }
    case 'removeCard':
      if (state.cards.length <= 1 || !state.cards[action.index]) return state
      return followCards({ ...state, cards: state.cards.filter((_, i) => i !== action.index) })
    case 'month': {
      if (!isMonth(action.value)) return state
      return { ...state, year: Number(action.value.slice(0, 4)), month: Number(action.value.slice(5, 7)), monthTouched: true }
    }
    case 'theme':
      return { ...state, theme: action.theme }
    case 'accent': {
      if (action.accent === null) return { ...state, accent: null }
      const accent = action.accent.toLowerCase()
      return isAccentHex(accent) ? { ...state, accent } : state
    }
    case 'new':
      return { ...initialState(state.today), list: state.list }
    case 'open': {
      const { notice } = action
      return {
        ...initialState(state.today),
        list: state.list,
        id: notice.id,
        year: notice.year,
        month: notice.month,
        monthTouched: true,
        cards: notice.cards.map(draftOf),
        theme: notice.theme,
        accent: notice.accent ?? null,
        baseline: snapshotOf(notice),
      }
    }
    case 'listLoading':
      return { ...state, list: { kind: 'loading' } }
    case 'listLoaded':
      return { ...state, list: action.result === 'failed' ? { kind: 'failed' } : { kind: 'ok', items: action.result } }
    case 'saveStart':
      return { ...state, store: 'saving', storeError: null }
    case 'saved': {
      const { notice } = action
      // 목록을 못 읽었거나 읽는 중이면 그대로 둔다(방금 것 하나만 있는 목록처럼 보이지 않게)
      const list: ListState =
        state.list.kind === 'ok' ? { kind: 'ok', items: [notice, ...state.list.items.filter((n) => n.id !== notice.id)] } : state.list
      return { ...state, store: null, storeError: null, id: notice.id, baseline: snapshotOf(notice), list }
    }
    case 'deleteStart':
      return { ...state, store: 'deleting', storeError: null }
    case 'deleted': {
      const list: ListState = state.list.kind === 'ok' ? { kind: 'ok', items: state.list.items.filter((n) => n.id !== action.id) } : state.list
      return { ...initialState(state.today), list }
    }
    case 'storeFailed':
      return { ...state, store: null, storeError: action.what }
    case 'imageFailed':
      return { ...state, imageFailed: action.failed }
  }
}

// ── 끌어내는 값 ─────────────────────────────────────────

const touched = (card: DraftCard) => card.start !== '' || card.end !== '' || card.name.trim() !== ''

// 카드마다 칸 까닭(맞으면 null). 아직 아무것도 적지 않은 카드는 까닭을 보이지 않는다(뽑기·저장은 readyNotice가 막는다)
export function cardProblems(state: FormsState): (CardErrors | null)[] {
  return state.cards.map((card) => {
    const result = checkCard(card)
    return 'errors' in result && (touched(card) || card.status.trim() === '') ? result.errors : null
  })
}

export function monthProblem(state: FormsState): string | null {
  return state.year >= MIN_YEAR && state.year <= MAX_YEAR ? null : `${MIN_YEAR}년부터 ${MAX_YEAR}년 사이로 골라 주세요`
}

// 저장·인쇄·그림 파일에 쓰는 검사를 넘은 안내문. 하나라도 어긋나면 null
export function readyNotice(state: FormsState): ClosureNotice | null {
  const cards: NoticeCard[] = []
  for (const draft of state.cards) {
    const result = checkCard(draft)
    if (!('card' in result)) return null
    cards.push(result.card)
  }
  // 자동(null)이면 checkNotice가 accent 열쇠 없이 돌려준다
  return checkNotice({ year: state.year, month: state.month, cards, theme: state.theme, accent: state.accent })
}

// 시작 날짜가 있는 카드의 끝 날짜: 시작보다 뒤이고 31일 안일 때만, 아니면 null(하루짜리로 그린다)
const endOf = (card: DraftCard): string | null =>
  isYmd(card.end) && compareYmd(card.end, card.start) > 0 && diffDays(card.start, card.end) < MAX_RANGE_DAYS ? card.end : null

// 카드 칸 아래 날짜 글(요일 포함). 시작 날짜가 없으면 null
export function draftDateLabel(card: DraftCard): string | null {
  return isYmd(card.start) ? dateLabel({ start: card.start, end: endOf(card) }) : null
}

// 미리보기: 시작 날짜가 있는 카드만, 어긋난 끝 날짜는 빼고 그린다(검사 전 값이라 저장·뽑기에는 쓰지 않는다)
export function previewNotice(state: FormsState): ClosureNotice {
  const cards = state.cards
    .filter((card) => isYmd(card.start))
    .map((card) => ({ start: card.start, end: endOf(card), name: cut(card.name.trim(), MAX_NAME), status: cut(card.status.trim(), MAX_STATUS) }))
  const notice: ClosureNotice = { year: state.year, month: state.month, theme: state.theme, cards }
  // 글자 색이 있을 때만 열쇠를 더한다(자동이면 글자 색 없는 지금 값과 똑같다)
  return state.accent === null ? notice : { ...notice, accent: state.accent }
}

export function isDirty(state: FormsState): boolean {
  if (state.baseline === null) return state.cards.some(touched)
  return snapshotOf(state) !== state.baseline
}

// 목록의 고친 날짜: 한국 날짜 'M월 D일'. 읽을 수 없는 시각이면 빈 글
export function listDate(updatedAt: string): string {
  const time = Date.parse(updatedAt)
  if (Number.isNaN(time)) return ''
  const day = todayInKorea(new Date(time))
  return `${Number(day.slice(5, 7))}월 ${Number(day.slice(8, 10))}일`
}

// ── AI 정리 답 읽기 ─────────────────────────────────────

export type TidyAnswer = { kind: 'ok'; cards: NoticeCard[]; truncated: boolean } | { kind: 'error'; code: TidyCode }
const AI_FAILED: TidyAnswer = { kind: 'error', code: 'E-AI-FAILED' }

const fieldsOf = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null

// 서버가 검사한 카드라도 다시 본다: 열쇠 넷뿐, 카드 검사를 그대로 넘어야 한다(고쳐 쓰지 않는다)
function answerCard(value: unknown): NoticeCard | null {
  const o = fieldsOf(value)
  if (o === null || Object.keys(o).length !== CARD_KEYS.length || !CARD_KEYS.every((key) => key in o)) return null
  const { start, end, name, status } = o
  if (typeof start !== 'string' || typeof name !== 'string' || typeof status !== 'string') return null
  if (end !== null && (typeof end !== 'string' || end === '')) return null
  const result = checkCard({ start, end: end ?? '', name, status })
  return 'card' in result && result.card.name === name && result.card.status === status ? result.card : null
}

// /api/ai/forms 답(상태·JSON 몸통, JSON이 아니면 null) → 카드 또는 오류 번호. 모르는 답은 모두 E-AI-FAILED
export function tidyAnswerOf(status: number, body: unknown): TidyAnswer {
  const o = fieldsOf(body)
  if (status !== 200) return o !== null && TIDY_CODES.includes(o.code) ? { kind: 'error', code: o.code as TidyCode } : AI_FAILED
  if (o === null || typeof o.truncated !== 'boolean' || !Array.isArray(o.cards)) return AI_FAILED
  if (o.cards.length < 1 || o.cards.length > MAX_CARDS) return AI_FAILED
  const cards: NoticeCard[] = []
  for (const item of o.cards) {
    const card = answerCard(item)
    if (card === null) return AI_FAILED
    cards.push(card)
  }
  return { kind: 'ok', cards, truncated: o.truncated }
}
