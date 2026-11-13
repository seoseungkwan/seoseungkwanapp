// ERP 마감일지 화면 다루기(spec erp-closing-range design.md 2절, notes/erp-screen-1113.md 1~8절). DOM만 다룬다
// - 마감 일자 읽기(readDate)·바꾸기(setDate) · 그날을 다 불러왔나(waitLoaded) · 멈출 일(blocker) · 되살린 입력 띠(draftNotice) ·
//   그날 마감일지 있음·상태(readJournal) · 저장 단추 누르고 쪽지 보기(save)
// - 누르는 것은 #closing-tab-w1·'전체 저장'·'일일 상세 저장'뿐이다(AC-3703.2). 상태 select는 읽기만 하고, ERP 서버로 요청을 보내지 않는다
// - 날짜 칸에는 focus를 주지 않는다(달력 창이 열림). 표시를 못 찾으면 아무거나 누르지 않고 'missing'·'timeout'으로 돌려준다
// - readDate·dateLabels는 main.ts에서 옮겨 왔다(main.ts가 readDate를 다시 내보냄, 동작 그대로)
import { FALLBACK_MS, LOAD_TIMEOUT_MS, SAVE_TIMEOUT_MS, STABLE_MS, type Block, type JournalState, type LoadResult, type SaveResult } from './rangeTypes.js'

/** 불러옴·쪽지를 보는 간격 */
export const POLL_MS = 100
/** 1 탭을 누른 뒤 '전체 저장' 단추가 생기길 기다리는 시간 */
const W1_WAIT_MS = 2_000

const DATE_LABEL = '마감 일자'
const YEAR_PICKER = '연도 선택'
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/
const TODAY = /(\d{4}-\d{2}-\d{2})\s*\(오늘\)/
const SAVE_W1 = '전체 저장'
const SAVE_W2 = '일일 상세 저장'
const SAVING = '저장 중...'
const LOADING_OUT = '불러오는 중입니다.'
const LOADING_W2 = '로딩 중'
const DELETE = '마감일지 삭제'
const STATUS_LABEL = '상태'
const SUCCESS = '.toast-success'
const ERROR = '.toast-error'

const tidy = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim()
const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms))

/** 있는 날짜인 'YYYY-MM-DD'면 그대로, 아니면 null */
function realDay(text: string): string | null {
  const m = DAY.exec(text)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const at = new Date(Date.UTC(y, mo - 1, d))
  return at.getUTCFullYear() === y && at.getUTCMonth() === mo - 1 && at.getUTCDate() === d ? text : null
}

export function dateLabels(doc: Document): HTMLLabelElement[] {
  return [...doc.querySelectorAll('label')].filter((label) => tidy(label.textContent) === DATE_LABEL)
}

/** '마감 일자' 줄의 날짜 칸, 없으면 원무 권한 화면의 'YYYY-MM-DD (오늘)' 글자 */
function dateSource(doc: Document): { input: HTMLInputElement } | { today: string } | null {
  for (const label of dateLabels(doc)) {
    // 같은 줄: label의 부모부터 세 겹까지(달력 도구가 칸을 감싸도 찾게)
    let row = label.parentElement
    for (let up = 0; row && up < 3; up += 1, row = row.parentElement) {
      const input = [...row.querySelectorAll<HTMLInputElement>('input.datepicker-input')].find(
        (el) => el.getAttribute('aria-label') !== YEAR_PICKER,
      )
      if (input) return { input }
      const today = TODAY.exec(row.textContent ?? '')
      if (today) return { today: today[1] }
    }
  }
  return null
}

/**
 * 마감 일자: '마감 일자' label과 같은 줄의 날짜 칸(input.datepicker-input, '연도 선택' 칸 말고) 값,
 * 없으면 원무 권한 화면의 'YYYY-MM-DD (오늘)' 글자. 고르지 않았거나 날짜가 아니면 null
 */
export function readDate(doc: Document): string | null {
  const found = dateSource(doc)
  if (!found) return null
  return realDay('input' in found ? found.input.value.trim() : found.today)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 마감일지 화면 주소(둘째 길은 이 화면에서만) */
const CLOSING_PATH = '/h/closing'

/**
 * 마감 일자를 그날로 바꾼다(조사 1절): 날짜 칸에 기본 value 설정 함수 + bubbles input 이벤트(React가 받는 길, focus는 주지 않음).
 * FALLBACK_MS 뒤에도 그날이 아니고 아직 마감일지 화면(/h/closing)이면 둘째 길: history.state.usr.selectDate를 바꾸고
 * (replaceState, 뒤로 가기 기록 안 쌓임) popstate. 화면을 떠났으면 하지 않는다. 다 불러오기는 기다리지 않는다(waitLoaded)
 */
export async function setDate(doc: Document, date: string): Promise<void> {
  const view = doc.defaultView
  const found = dateSource(doc)
  if (found && 'input' in found) {
    const setter = Object.getOwnPropertyDescriptor((view?.HTMLInputElement ?? HTMLInputElement).prototype, 'value')?.set
    setter?.call(found.input, date)
    found.input.dispatchEvent(new (view?.Event ?? Event)('input', { bubbles: true }))
  }
  await sleep(FALLBACK_MS)
  if (readDate(doc) === date || !view || view.location.pathname !== CLOSING_PATH) return
  const { history } = view
  const state = isRecord(history.state) ? history.state : {}
  const usr = isRecord(state.usr) ? state.usr : {}
  history.replaceState({ ...state, usr: { ...usr, selectDate: date } }, '', view.location.pathname)
  view.dispatchEvent(new view.PopStateEvent('popstate', { state: history.state }))
}

/** 하나만 맞을 때 그것, 아니면 null(둘 이상이면 아무거나 누르지 않는다) */
function only<T>(items: T[]): T | null {
  return items.length === 1 ? items[0] : null
}

/** 저장 단추가 있는 곳의 단추들: w1 = 업무일지 2 영역 밖 · w2 = 업무일지 2 저장 줄 안 */
function scopeButtons(doc: Document, which: 'w1' | 'w2'): HTMLButtonElement[] {
  if (which === 'w2') return [...doc.querySelectorAll<HTMLButtonElement>('.cdf-save-bar button')]
  return [...doc.querySelectorAll<HTMLButtonElement>('button')].filter((b) => !b.closest('#closing-panel-w2'))
}

/** '전체 저장'(업무일지 2 밖) / '일일 상세 저장'(.cdf-save-bar 안). 글자는 앞뒤 공백을 정리해 똑같을 때만 */
function saveButton(doc: Document, which: 'w1' | 'w2'): HTMLButtonElement | null {
  const want = which === 'w1' ? SAVE_W1 : SAVE_W2
  return only(scopeButtons(doc, which).filter((b) => tidy(b.textContent) === want))
}

const w1Tab = (doc: Document) => doc.querySelector<HTMLElement>('#closing-tab-w1')
/** 업무일지 1 탭인가(탭 단추가 없으면 1 탭으로 본다) */
function onW1(doc: Document): boolean {
  const tab = w1Tab(doc)
  return !tab || tab.getAttribute('aria-selected') === 'true'
}

/** 지금 모습: 오류(.load-state-error) · 그날이 다 그려짐 · 아직 */
function loadState(doc: Document, date: string): 'ok' | 'error' | 'wait' {
  if (doc.querySelector('.load-state-error')) return 'error'
  if (readDate(doc) !== date) return 'wait'
  if ([...doc.querySelectorAll('.closing-pdf-out')].some((el) => (el.textContent ?? '').includes(LOADING_OUT))) return 'wait'
  if (onW1(doc) && !doc.querySelector('.closing-w1-box')) return 'wait'
  if ([...doc.querySelectorAll('#closing-panel-w2 .cdf-empty')].some((el) => (el.textContent ?? '').includes(LOADING_W2))) return 'wait'
  // 불러오는 중이거나 불러온 날 ≠ 고른 날이면 막혀 있다(조사 1절)
  const all = saveButton(doc, 'w1')
  if (all?.disabled) return 'wait'
  return 'ok'
}

/**
 * 그날을 다 불러올 때까지 기다린다(조사 1절): POLL_MS마다 보고 다 그려진 모습이 STABLE_MS 동안 이어지면 'ok',
 * 불러오기 오류가 STABLE_MS 동안 보이면 'error', timeoutMs가 넘으면 'timeout'. 시작할 때 1 탭이 아니면 1 탭을 누른다(1 저장 카드는 1 탭에만)
 */
export async function waitLoaded(doc: Document, date: string, timeoutMs: number = LOAD_TIMEOUT_MS): Promise<LoadResult> {
  const tab = w1Tab(doc)
  if (tab && !onW1(doc)) tab.click()
  let okSince: number | null = null
  let errorSince: number | null = null
  for (let waited = 0; ; waited += POLL_MS) {
    const now = loadState(doc, date)
    okSince = now === 'ok' ? (okSince ?? waited) : null
    errorSince = now === 'error' ? (errorSince ?? waited) : null
    if (okSince !== null && waited - okSince >= STABLE_MS) return 'ok'
    if (errorSince !== null && waited - errorSince >= STABLE_MS) return 'error'
    if (waited >= timeoutMs) return 'timeout'
    await sleep(POLL_MS)
  }
}

/** 크기가 있게 그려졌나(display:none 등은 크기가 0) */
function hasSize(el: Element): boolean {
  const rect = el.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

/** 원무 권한 화면인가: 날짜 칸 없이 'YYYY-MM-DD (오늘)' 글자(AC-3701.3). ERP 안내 창이 떠 있어도 같다 */
export function todayOnly(doc: Document): boolean {
  const found = dateSource(doc)
  return found !== null && 'today' in found
}

/** 그 저장 단추(글자가 앞뒤 공백 정리 뒤 똑같음)가 있는 곳에 정확히 하나인가 */
function oneSaveButton(doc: Document, which: 'w1' | 'w2'): boolean {
  const want = which === 'w1' ? SAVE_W1 : SAVE_W2
  return scopeButtons(doc, which).filter((b) => tidy(b.textContent) === want).length === 1
}

/**
 * 멈출 일(AC-3705.2), 차례대로: ERP 안내 창(.dialog-overlay, 새 판 안내 등) · 원무 권한(todayOnly) ·
 * 본사 열람(칸 묶음·표를 품은 fieldset[disabled]) · 업무일지 2 저장 줄 없음 ·
 * 저장 단추가 하나씩이 아님(업무일지 2 영역 밖 '전체 저장', 저장 줄 안 '일일 상세 저장'이 정확히 1개씩이 아니면). 없으면 null.
 * 다 불러온 뒤(1 탭)에만 부른다
 */
export function blocker(doc: Document): Block | null {
  if ([...doc.querySelectorAll('.dialog-overlay')].some(hasSize)) return { kind: 'dialog' }
  if (todayOnly(doc)) return { kind: 'todayOnly' }
  if ([...doc.querySelectorAll('fieldset[disabled]')].some((f) => f.querySelector('.closing-w1-box, .cdf-table'))) return { kind: 'readOnly' }
  if (!doc.querySelector('.cdf-save-bar')) return { kind: 'noSaveBar' }
  if (!oneSaveButton(doc, 'w1') || !oneSaveButton(doc, 'w2')) return { kind: 'noSaveButton' }
  return null
}

/**
 * '저장하지 않은 입력을 되살렸습니다' 띠(.journal-draft-notice, 조사 2절)가 있나(AC-3703.4). hidden인 띠는 세지 않는다.
 * 숨은 업무일지 2 영역 안 띠도 센다(되살린 입력을 덮어 저장하지 않게)
 */
export function draftNotice(doc: Document): boolean {
  return [...doc.querySelectorAll<HTMLElement>('.journal-draft-notice')].some((el) => !el.hidden)
}

/** label '상태'와 같은 줄(부모부터 세 겹까지)의 select. 한 줄에 둘 이상이면 모른다 */
function statusSelect(doc: Document): HTMLSelectElement | null {
  for (const label of doc.querySelectorAll('label')) {
    if (tidy(label.textContent) !== STATUS_LABEL) continue
    let row = label.parentElement
    for (let up = 0; row && up < 3; up += 1, row = row.parentElement) {
      const selects = [...row.querySelectorAll('select')]
      if (selects.length > 0) return only(selects)
    }
  }
  return null
}

/**
 * 그날 마감일지(조사 5절): exists = 글자가 '마감일지 삭제'인 단추가 있음 · status = 있을 때 '상태' select 값
 * ('draft' 작성중 · 'confirmed' 확정, 그 밖이면 null). 읽기만 한다
 */
export function readJournal(doc: Document): JournalState {
  const exists = [...doc.querySelectorAll('button')].some((b) => tidy(b.textContent) === DELETE)
  if (!exists) return { exists, status: null }
  const value = statusSelect(doc)?.value
  return { exists, status: value === 'draft' || value === 'confirmed' ? value : null }
}

/** 1 탭이 아니면 1 탭을 누르고 '전체 저장'이 생기길 기다린다 */
async function toW1(doc: Document): Promise<void> {
  const tab = w1Tab(doc)
  if (!tab || onW1(doc)) return
  tab.click()
  for (let waited = 0; !saveButton(doc, 'w1') && waited < W1_WAIT_MS; waited += POLL_MS) await sleep(POLL_MS)
}

/**
 * 저장 단추를 한 번 누르고 결과를 본다(조사 3절, AC-3703.3): w1 = 업무일지 1 '전체 저장'(누르기 전에 1 탭으로) ·
 * w2 = '일일 상세 저장'(숨은 2 탭이어도 누름). 단추가 없거나 막혔으면 누르지 않고 'missing'.
 * 누르기 전부터 있던 쪽지는 세지 않고 새로 붙은 쪽지만 본다: 오류 쪽지 = 'error' · 성공 쪽지를 봤고 단추 글자가 '저장 중...'이 아님 = 'ok' ·
 * timeoutMs가 넘으면 'timeout'
 */
export async function save(doc: Document, which: 'w1' | 'w2', timeoutMs: number = SAVE_TIMEOUT_MS): Promise<SaveResult> {
  if (which === 'w1') await toW1(doc)
  const btn = saveButton(doc, which)
  if (!btn || btn.disabled || btn.closest('fieldset[disabled]')) return 'missing'
  const seen = { success: false, error: false }
  const look = (records: MutationRecord[]) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue
        const el = node as Element
        if (el.matches(SUCCESS) || el.querySelector(SUCCESS)) seen.success = true
        if (el.matches(ERROR) || el.querySelector(ERROR)) seen.error = true
      }
    }
  }
  const Observer = doc.defaultView?.MutationObserver ?? MutationObserver
  const watch = new Observer(look)
  watch.observe(doc.body, { childList: true, subtree: true })
  try {
    btn.click()
    for (let waited = 0; waited < timeoutMs; waited += POLL_MS) {
      await sleep(POLL_MS)
      look(watch.takeRecords())
      if (seen.error) return 'error'
      if (seen.success && !scopeButtons(doc, which).some((b) => tidy(b.textContent) === SAVING)) return 'ok'
    }
    return 'timeout'
  } finally {
    watch.disconnect()
  }
}
