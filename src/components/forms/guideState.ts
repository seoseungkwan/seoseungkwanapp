import { BLANK_GUIDE, checkGuideColors, checkGuideValue, guideColorsOf, guideProblems, savableGuide, type GuideValue } from '@/lib/forms/guide'
import { checkDrawing } from '@/lib/forms/guideDrawing'
import type { GuideColors } from '@/lib/forms/logoColors'
import { STYLE_KEYS, checkStyle, isDefaultStyle, type FormStyle } from '@/lib/forms/style'
import { MAX_MEMO } from '@/types/forms'
import {
  DRAWING_LIMITS,
  GUIDE_LIMITS,
  PICTURE_IDS,
  type GuideContent,
  type GuideDrawing,
  type GuideField,
  type GuideLine,
  type GuideMark,
  type GuideProblems,
  type PictureId,
  type SavedGuide,
} from '@/types/formGuide'

// 서식 화면(환자 안내문)의 상태 한 곳과 순수 reducer (spec forms-guide design.md 9절, 시안 docs/mockups/forms-guide ?s=screen).
// 휴진 안내 formsState.ts와 같은 모양이다. 화면(GuideWorkspace)이 useReducer로 쓰고, 부르기·저장·그림은 화면이 하고 결과만 여기로 보낸다.
// 대충 적은 글(memo)·그릴 것(subject)은 AI로 보낼 때만 쓰고 저장하지 않는다 — 저장 값과 '바뀐 내용' 비교에 들지 않는다.
// AI로 그린 그림(content.drawing)은 다른 그림을 골라도 칸에 남겨 두고, 저장·뽑기 값(readyGuide)은 savableGuide로 고른 그림만 담는다.
// 색 칸(spec clinic-profile AC-6604.5·AC-6604.6): [직접 고르기]면 content.colors에 두 색, [자동]이면 colors 열쇠가 없다. 색도 저장 값·'바뀐 내용'에 든다
// 글씨·로고 값(spec form-style design.md 8절): 처음대로가 아니면 content.style, 처음대로면 style 열쇠가 없다. 색처럼 저장 값·'바뀐 내용'에 들고 [정리하기] 뒤에도 남는다

export type GuideAiCode = 'E-FORMS-PRIVATE' | 'E-AI-BUSY' | 'E-AI-LIMIT' | 'E-AI-FAILED'
export type GuideListState = { kind: 'loading' } | { kind: 'ok'; items: SavedGuide[] } | { kind: 'failed' }
type StoreWork = 'saving' | 'deleting'
type StoreFailure = 'save' | 'delete'

export type GuideState = {
  memo: string
  tidying: boolean
  tidyError: GuideAiCode | null
  truncated: boolean // AI 답의 줄이 4개를 넘어 앞 4개만 넣었다
  subject: string // '새로 그릴 것' 글 칸
  drawingBusy: boolean
  drawError: GuideAiCode | null
  id: string | null // 연(저장한) 안내문
  content: GuideValue // 고치는 중인 값(빈 칸·한도 넘는 칸 허용)
  baseline: string | null // 마지막으로 저장하거나 연 값(snapshotOf). 새 안내문은 null
  list: GuideListState
  store: StoreWork | null
  storeError: StoreFailure | null
  imageFailed: boolean
}

export type GuideAction =
  | { type: 'memo'; text: string }
  | { type: 'tidyStart' }
  | { type: 'tidyDone'; guide: GuideContent; truncated: boolean }
  | { type: 'tidyFailed'; code: GuideAiCode }
  | { type: 'subject'; text: string }
  | { type: 'drawStart' }
  | { type: 'drawDone'; drawing: GuideDrawing }
  | { type: 'drawFailed'; code: GuideAiCode }
  | { type: 'field'; field: GuideField; value: string }
  | { type: 'firstSmall'; value: boolean }
  | { type: 'picture'; picture: PictureId | 'custom' | null }
  | { type: 'mark'; mark: GuideMark }
  | { type: 'line'; index: number; field: keyof GuideLine; value: string }
  | { type: 'addLine' }
  | { type: 'removeLine'; index: number }
  | { type: 'colors'; colors: GuideColors | null } // null = [자동]
  | { type: 'style'; style: FormStyle } // 글씨·로고 값 전체(처음대로로 되돌리기는 DEFAULT_STYLE). 틀린 값은 무시한다
  | { type: 'new' }
  | { type: 'open'; guide: SavedGuide }
  | { type: 'listLoading' }
  | { type: 'listLoaded'; result: SavedGuide[] | 'failed' }
  | { type: 'saveStart' }
  | { type: 'saved'; guide: SavedGuide }
  | { type: 'deleteStart' }
  | { type: 'deleted'; id: string }
  | { type: 'storeFailed'; what: StoreFailure }
  | { type: 'imageFailed'; failed: boolean }

const TEXT_FIELDS: readonly GuideField[] = ['tag', 'subtitle', 'big1', 'big2', 'boxTop', 'boxBottom', 'bandTitle', 'note']
const GUIDE_KEYS: readonly string[] = ['tag', 'subtitle', 'big1', 'big2', 'firstSmall', 'boxTop', 'boxBottom', 'picture', 'drawing', 'bandTitle', 'mark', 'lines', 'note']
const LINE_KEYS: readonly string[] = ['text', 'em']
// 새 안내문이 아직 모두 빈 칸일 때 숨기는 필수 칸 까닭 열쇠
const REQUIRED_KEYS: readonly string[] = ['tag', 'subtitle', 'big1', 'big2', 'lines']
const AI_CODES: readonly unknown[] = ['E-FORMS-PRIVATE', 'E-AI-BUSY', 'E-AI-LIMIT', 'E-AI-FAILED'] satisfies GuideAiCode[]

export const blankLine = (): GuideLine => ({ text: '', em: '' })
const copyLines = (lines: readonly GuideLine[]): GuideLine[] => lines.map((line) => ({ text: line.text, em: line.em }))
// 얼린 BLANK_GUIDE를 고칠 수 있는 새 객체로
const blankGuide = (): GuideContent => ({ ...BLANK_GUIDE, lines: copyLines(BLANK_GUIDE.lines) })
// 색은 맞는 모양일 때만 새 객체로 담고, 아니면 열쇠를 두지 않는다([자동])
function withColors(c: GuideValue, colors: GuideColors | null): GuideValue {
  const next: GuideValue = { ...c }
  delete next.colors
  if (colors) next.colors = { ...colors }
  return next
}
// 글씨·로고 값은 맞는 모양이고 처음대로가 아닐 때만 새 객체로 담고, 아니면 열쇠를 두지 않는다(처음대로)
function withStyle(c: GuideValue, style: FormStyle | null): GuideValue {
  const next: GuideValue = { ...c }
  delete next.style
  const checked = style === null ? null : checkStyle(style)
  if (checked !== null && !isDefaultStyle(checked)) next.style = checked
  return next
}
const styleOf = (c: GuideValue): FormStyle | null => c.style ?? null
const copyContent = (c: GuideValue): GuideValue => withStyle(withColors({ ...c, lines: copyLines(c.lines) }, guideColorsOf(c)), styleOf(c))
const cut = (text: string, max: number) => Array.from(text).slice(0, max).join('')

export function initialGuideState(): GuideState {
  return {
    memo: '',
    tidying: false,
    tidyError: null,
    truncated: false,
    subject: '',
    drawingBusy: false,
    drawError: null,
    id: null,
    content: blankGuide(),
    baseline: null,
    list: { kind: 'loading' },
    store: null,
    storeError: null,
    imageFailed: false,
  }
}

// 저장 값 비교용 글. 저장할 때처럼 글 칸·줄은 앞뒤 공백을 떼고, 그린 그림은 고른 그림이 custom일 때만 넣는다(savableGuide와 같다).
// 직접 고른 색은 맨 뒤에([자동]이면 null). 글씨·로고 값은 처음대로가 아닐 때만 그 뒤에 여섯 값을 더한다 —
// 처음대로면 이 기능 전과 글자 그대로 같다(BLANK_SNAPSHOT도 그대로, spec form-style AC-6806.4)
function snapshotOf(c: GuideValue): string {
  const drawing = c.picture === 'custom' && c.drawing !== null
    ? [c.drawing.subject.trim(), c.drawing.shapes.map((s) => [s.kind, s.nums, s.d, s.fill, s.stroke, s.width])]
    : null
  const parts: unknown[] = [
    TEXT_FIELDS.map((key) => c[key].trim()),
    c.firstSmall,
    c.picture,
    drawing,
    c.mark,
    c.lines.map((line) => [line.text.trim(), line.em.trim()]),
    guideColorsOf(c),
  ]
  const style = styleOf(c)
  if (style !== null && !isDefaultStyle(style)) parts.push(...STYLE_KEYS.map((key) => style[key]))
  return JSON.stringify(parts)
}
const BLANK_SNAPSHOT = snapshotOf(BLANK_GUIDE)

const withContent = (state: GuideState, patch: Partial<GuideValue>): GuideState => ({ ...state, content: { ...state.content, ...patch } })

export function guideReducer(state: GuideState, action: GuideAction): GuideState {
  switch (action.type) {
    case 'memo':
      return { ...state, memo: cut(action.text, MAX_MEMO), tidyError: null }
    case 'tidyStart':
      return { ...state, tidying: true, tidyError: null, truncated: false }
    case 'tidyDone': {
      // 칸 12개를 답으로 바꾼다. 그린 그림(drawing)은 그대로 두고, 지금 그림이 custom이면 그림도 그대로(AC-4506.2).
      // 고른 색(AC-6604.5)·글씨·로고 값(form-style AC-6806.5)도 그대로
      const { guide } = action
      const keepPicture = state.content.picture === 'custom'
      const content: GuideContent = {
        ...guide,
        picture: keepPicture ? 'custom' : guide.picture,
        drawing: state.content.drawing,
        lines: copyLines(guide.lines.slice(0, GUIDE_LIMITS.lines)),
      }
      return {
        ...state,
        tidying: false,
        tidyError: null,
        truncated: action.truncated,
        content: withStyle(withColors(content, guideColorsOf(state.content)), styleOf(state.content)),
      }
    }
    case 'tidyFailed':
      return { ...state, tidying: false, tidyError: action.code }
    case 'subject':
      return { ...state, subject: cut(action.text, DRAWING_LIMITS.subject), drawError: null }
    case 'drawStart':
      return { ...state, drawingBusy: true, drawError: null }
    case 'drawDone':
      // 앞에 그린 그림은 버리고 새 그림을 고른 그림으로 삼는다
      return { ...withContent(state, { picture: 'custom', drawing: action.drawing }), drawingBusy: false, drawError: null }
    case 'drawFailed':
      return { ...state, drawingBusy: false, drawError: action.code }
    case 'field':
      return withContent(state, { [action.field]: action.value })
    case 'firstSmall':
      return withContent(state, { firstSmall: action.value })
    case 'picture':
      // 그린 그림이 없으면 custom을 고를 수 없다. 다른 그림을 골라도 drawing은 남는다(AC-4513.3)
      if (action.picture === 'custom' && state.content.drawing === null) return state
      return withContent(state, { picture: action.picture })
    case 'mark':
      return withContent(state, { mark: action.mark })
    case 'line': {
      if (!state.content.lines[action.index]) return state
      const lines = state.content.lines.map((line, i) => (i === action.index ? { ...line, [action.field]: action.value } : line))
      return withContent(state, { lines })
    }
    case 'addLine':
      return state.content.lines.length >= GUIDE_LIMITS.lines ? state : withContent(state, { lines: [...state.content.lines, blankLine()] })
    case 'removeLine':
      if (state.content.lines.length <= 1 || !state.content.lines[action.index]) return state
      return withContent(state, { lines: state.content.lines.filter((_, i) => i !== action.index) })
    case 'colors': {
      // 모양이 틀린 색은 받지 않는다(색 고르기 칸은 '#' + 소문자 6자리를 보낸다)
      const colors = action.colors === null ? null : checkGuideColors(action.colors)
      if (action.colors !== null && colors === null) return state
      return { ...state, content: withColors(state.content, colors) }
    }
    case 'style': {
      // 정확히 여섯 열쇠·범위·5의 배수·색 모양일 때만 받는다(밀대·색 칩은 맞는 값만 보낸다). 처음대로면 열쇠를 지운다
      if (checkStyle(action.style) === null) return state
      return { ...state, content: withStyle(state.content, action.style) }
    }
    case 'new':
      return { ...initialGuideState(), list: state.list }
    case 'open': {
      const { guide } = action
      return { ...initialGuideState(), list: state.list, id: guide.id, content: copyContent(guide.content), baseline: snapshotOf(guide.content) }
    }
    case 'listLoading':
      return { ...state, list: { kind: 'loading' } }
    case 'listLoaded':
      return { ...state, list: action.result === 'failed' ? { kind: 'failed' } : { kind: 'ok', items: action.result } }
    case 'saveStart':
      return { ...state, store: 'saving', storeError: null }
    case 'saved': {
      const { guide } = action
      // 목록을 못 읽었거나 읽는 중이면 그대로 둔다(방금 것 하나만 있는 목록처럼 보이지 않게).
      // 칸은 그대로 둔다(다른 그림을 골라 저장해도 그린 그림을 다시 고를 수 있게)
      const list: GuideListState =
        state.list.kind === 'ok' ? { kind: 'ok', items: [guide, ...state.list.items.filter((g) => g.id !== guide.id)] } : state.list
      return { ...state, store: null, storeError: null, id: guide.id, baseline: snapshotOf(guide.content), list }
    }
    case 'deleteStart':
      return { ...state, store: 'deleting', storeError: null }
    case 'deleted': {
      const list: GuideListState = state.list.kind === 'ok' ? { kind: 'ok', items: state.list.items.filter((g) => g.id !== action.id) } : state.list
      return { ...initialGuideState(), list }
    }
    case 'storeFailed':
      return { ...state, store: null, storeError: action.what }
    case 'imageFailed':
      return { ...state, imageFailed: action.failed }
  }
}

// ── 끌어내는 값 ─────────────────────────────────────────

// 저장·인쇄·그림 파일에 쓰는 검사를 넘은 안내문(고른 그림이 custom일 때만 drawing). 하나라도 어긋나면 null
export function readyGuide(state: GuideState): GuideValue | null {
  return checkGuideValue(savableGuide(state.content))
}

export function isDirty(state: GuideState): boolean {
  return snapshotOf(state.content) !== (state.baseline ?? BLANK_SNAPSHOT)
}

const isBlank = (c: GuideContent) =>
  TEXT_FIELDS.every((key) => c[key].trim() === '') && c.lines.every((line) => line.text.trim() === '' && line.em.trim() === '')

// 칸 아래에 보일 까닭(guideProblems). 새 안내문이 아직 모두 빈 칸이면 필수 칸 까닭은 숨긴다(저장·뽑기는 readyGuide가 막는다)
export function visibleProblems(state: GuideState): GuideProblems {
  const problems = guideProblems(state.content)
  if (state.id !== null || !isBlank(state.content)) return problems
  return Object.fromEntries(Object.entries(problems).filter(([key]) => !REQUIRED_KEYS.includes(key)))
}

// ── AI 답 읽기 ──────────────────────────────────────────

export type GuideTidyAnswer = { kind: 'ok'; guide: GuideContent; truncated: boolean } | { kind: 'error'; code: GuideAiCode }
export type GuideDrawingAnswer = { kind: 'ok'; drawing: GuideDrawing } | { kind: 'error'; code: GuideAiCode }
const AI_FAILED = { kind: 'error', code: 'E-AI-FAILED' } as const

type Fields = Record<string, unknown>
const fieldsOf = (value: unknown): Fields | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Fields) : null
// 정해진 열쇠(keys)가 빠짐없이, 그것만 있는 객체
function exactly(value: unknown, keys: readonly string[]): Fields | null {
  const o = fieldsOf(value)
  if (o === null) return null
  const own = Object.keys(o)
  return own.length === keys.length && keys.every((key) => own.includes(key)) ? o : null
}
// 오류 답의 번호: 아는 번호면 그것, 아니면 E-AI-FAILED
const errorOf = (body: unknown): { kind: 'error'; code: GuideAiCode } => {
  const code = fieldsOf(body)?.code
  return AI_CODES.includes(code) ? { kind: 'error', code: code as GuideAiCode } : AI_FAILED
}
const isLine = (value: unknown): value is GuideLine => {
  const line = exactly(value, LINE_KEYS)
  return line !== null && typeof line.text === 'string' && typeof line.em === 'string'
}

// 서버가 검사한 안내 내용을 모양만 다시 본다: 열쇠 13개, 글 칸은 문자열, 그림은 16개 중 하나나 null, drawing은 null, 줄 1~4개.
// 칸 한도는 보지 않는다(한도를 넘는 칸은 그대로 받아 칸 검사가 알린다). 받은 값을 고치지 않고 새 객체로 돌려준다
function answerGuide(value: unknown): GuideContent | null {
  const v = exactly(value, GUIDE_KEYS)
  if (v === null || !TEXT_FIELDS.every((key) => typeof v[key] === 'string')) return null
  const { firstSmall, picture, drawing, mark, lines } = v
  if (typeof firstSmall !== 'boolean' || drawing !== null || (mark !== 'check' && mark !== 'number')) return null
  if (picture !== null && !(PICTURE_IDS as readonly unknown[]).includes(picture)) return null
  if (!Array.isArray(lines) || lines.length < 1 || lines.length > GUIDE_LIMITS.lines) return null
  const items: unknown[] = Array.from(lines as unknown[])
  if (!items.every(isLine)) return null
  return { ...(v as GuideContent), lines: copyLines(items) }
}

// /api/ai/forms/guide 답(상태·JSON 몸통, JSON이 아니면 null) → 안내 내용 또는 오류 번호. 모르는 답은 모두 E-AI-FAILED
export function guideAnswerOf(status: number, body: unknown): GuideTidyAnswer {
  if (status !== 200) return errorOf(body)
  const o = fieldsOf(body)
  if (o === null || typeof o.truncated !== 'boolean') return AI_FAILED
  const guide = answerGuide(o.guide)
  return guide === null ? AI_FAILED : { kind: 'ok', guide, truncated: o.truncated }
}

// /api/ai/forms/guide/picture 답 → checkDrawing을 넘은 그림 또는 오류 번호. 못 넘거나 모르는 답은 모두 E-AI-FAILED
export function drawingAnswerOf(status: number, body: unknown): GuideDrawingAnswer {
  if (status !== 200) return errorOf(body)
  const drawing = checkDrawing(fieldsOf(body)?.drawing)
  return drawing === null ? AI_FAILED : { kind: 'ok', drawing }
}
