// ERP 마감일지 화면에서 칸을 찾아 값을 넣는다(REQ-3608, notes/erp-closing-fields.md 2~6절)
// - 칸에는 name·id가 없어 구역·묶음 제목 + 줄 이름 + 열 머리 / label 글자로 찾는다. 글자는 앞뒤 공백과 '자동'·'업로드 시 생략 가능'·
//   '치료사별 입력' 표시를 떼고 똑같을 때만 맞다고 본다(둘 이상 맞으면 못 찾은 것으로 본다). 넣지 못한 칸은 건너뛰고 까닭과 함께 적는다
// - ERP는 React 18 통제 칸이라 기본 value 설정 함수 + bubbles input 이벤트로 넣는다. 금액칸은 '' → 숫자 → blur(조사 6절)
// - 탭 단추(#closing-tab-w1·처음 탭) 말고는 어떤 단추도 누르지 않고, select·textarea·잠긴 칸(fieldset[disabled] 등)은 바꾸지 않는다
// - 채우기 전에 이미 적힌 칸을 세고(survey, 기본값 (차)), [빈 칸만]이면 그 칸을 그대로 둔다. 넣은 칸과 넣기 전 글자는
//   이 화면 기억(FillResult.undo)에만 두고 [되돌리기](undoAll)에 쓴다. 어디에도 저장하지 않는다(TASK-17)
import type { Planned, Where } from './cells.js'

/** 넣지 못한 까닭: 화면에 없음(둘 이상 맞음 포함) · 치료사별 입력 줄 · 잠긴 칸(읽기 전용) */
export type Skip = 'notFound' | 'therapist' | 'locked'

/** 넣은 칸 하나의 되돌릴 기억(그 화면 안에서만) */
export type UndoEntry = { input: HTMLInputElement; before: string; where: Where }

/**
 * filled = 넣은 칸 수 · kept = [빈 칸만]이라 그대로 둔 적힌 칸 수 · skipped = 넣지 못한 칸과 까닭 · unpicked = 고르지 않은 칸 ·
 * noName = 코드를 골랐는데 ERP 줄 이름이 빈 기타 칸 · unknown = 비트에서 셀 수 없는 칸 수 · held = 보류 묶음(HELD_SALES) 칸 수 ·
 * undo = 넣은 칸과 넣기 전 글자(넣은 차례)
 */
export type FillResult = {
  filled: number
  kept: number
  skipped: { where: Where; skip: Skip }[]
  unpicked: Where[]
  noName: Where[]
  unknown: number
  held: number
  undo: UndoEntry[]
}

/** 'all' = 적힌 칸도 바꿈([바꾸기]) · 'empty' = 빈 칸(0 포함)·같은 값 칸만([빈 칸만]) */
export type FillMode = 'all' | 'empty'

/** 2 탭에서 1 탭을 누른 뒤 업무일지 1 칸이 생기길 기다리는 시간 */
export const W1_WAIT_MS = 2000
const STEP_MS = 50

const THERAPIST = '치료사별 입력'
const MARKS = ['자동', '업로드 시 생략 가능', THERAPIST]
const MARK_SELECTOR = '.af-badge, .cdf-fill-tag'

const squash = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()

/** 비교용 글자: '자동'·'업로드 시 생략 가능'·'치료사별 입력' 표시를 떼고 빈칸을 하나로, 앞뒤 공백 없이 */
function text(el: Element): string {
  const copy = el.cloneNode(true) as Element
  copy.querySelectorAll(MARK_SELECTOR).forEach((mark) => mark.remove())
  let s = squash(copy.textContent)
  for (let again = true; again; ) {
    again = false
    for (const mark of MARKS) {
      if (s.length > mark.length && s.endsWith(mark)) {
        s = s.slice(0, -mark.length).trim()
        again = true
      }
    }
  }
  return s
}

/** 하나만 맞을 때 그것, 아니면 null(없거나 둘 이상이면 엉뚱한 칸에 넣지 않는다) */
function only<T>(items: T[]): T | null {
  return items.length === 1 ? items[0] : null
}

function inputIn(cells: Element[]): HTMLInputElement | null {
  for (const cell of cells) {
    const input = cell.querySelector('input')
    if (input) return input
  }
  return null
}

/** 찾은 줄의 입력칸. 줄은 있는데 입력칸이 없으면 input null과 그 줄 */
type Found = { input: HTMLInputElement | null; row: HTMLTableRowElement | null }
const NONE: Found = { input: null, row: null }

function findW1(doc: Document, box: string, row: string): Found {
  const title = only([...doc.querySelectorAll('h4.closing-panel-title')].filter((h) => text(h) === box))
  const scope = title?.closest('.closing-w1-box') ?? title?.parentElement
  if (!scope) return NONE
  const tr = only(
    [...scope.querySelectorAll<HTMLTableRowElement>('tbody tr')].filter((r) => r.cells.length > 1 && text(r.cells[0]) === row),
  )
  return tr ? { input: inputIn([...tr.cells].slice(1)), row: tr } : NONE
}

function w2Scope(doc: Document): ParentNode {
  return doc.querySelector('#closing-panel-w2') ?? doc
}

function findTable(doc: Document, card: string, row: string, col: string): Found {
  const title = only([...w2Scope(doc).querySelectorAll('h3.cdf-section-title')].filter((h) => text(h) === card))
  const table = (title?.closest('.card') ?? title?.parentElement)?.querySelector('table.cdf-table')
  if (!table) return NONE
  const heads = [...table.querySelectorAll('thead th')].map(text)
  const at = only(heads.flatMap((h, i) => (h === col ? [i] : [])))
  if (at === null) return NONE
  const tr = only(
    [...table.querySelectorAll<HTMLTableRowElement>('tbody tr')].filter((r) => {
      const label = r.cells[0]
      return label?.classList.contains('rowlabel') === true && text(label) === row
    }),
  )
  if (!tr) return NONE
  const cell = tr.cells[at]
  return { input: cell ? inputIn([cell]) : null, row: tr }
}

function findField(doc: Document, field: string): Found {
  const label = only([...w2Scope(doc).querySelectorAll('div.cdf-field > label')].filter((l) => text(l) === field))
  return { input: label?.parentElement?.querySelector('input') ?? null, row: null }
}

function find(doc: Document, where: Where): Found {
  if (where.j === 1) return findW1(doc, where.box, where.row)
  if ('field' in where) return findField(doc, where.field)
  return findTable(doc, where.card, where.row, where.col)
}

/** 칸 자리에 맞는 입력칸 하나(잠긴 칸이어도). 없으면 null */
export function findInput(doc: Document, where: Where): HTMLInputElement | null {
  return find(doc, where).input
}

/** 읽기 전용(본사 열람 등)이라 바꾸면 안 되는 칸 */
function locked(input: HTMLInputElement): boolean {
  return input.disabled || input.readOnly || input.closest('fieldset[disabled]') !== null
}

/** 칸 자리 → 넣을 입력칸, 또는 넣지 못한 까닭 */
export function locate(doc: Document, where: Where): { input: HTMLInputElement } | { skip: Skip } {
  const found = find(doc, where)
  if (found.input) return locked(found.input) ? { skip: 'locked' } : { input: found.input }
  // 줄은 찾았는데 입력칸 없이 값만 보이고 줄 이름 밑에 '치료사별 입력'이 있는 줄(조사 3절 도수치료·충격파(체충))
  const label = found.row?.cells[0]
  if (label && squash(label.textContent).includes(THERAPIST)) return { skip: 'therapist' }
  return { skip: 'notFound' }
}

/** 업무일지 2 표 묶음 제목 → 짧은 이름(design.md 5-1) */
const SHORT_CARDS: Record<string, string> = {
  '치료별 신환/90일초진/재진 건수': '치료별 건수',
  '연령별 신환/90일초진/재진': '연령별',
}

/** 짧은 줄 이름(design.md 5-1): '{묶음} {줄}'. 열 이름은 쓰지 않고, 운영 지표 낱칸은 칸 이름만 */
export function shortPlace(where: Where): string {
  if (where.j === 1) return `${where.box === '진료 · 치료현황' ? '치료현황' : where.box} ${where.row}`
  if ('field' in where) return where.field
  return `${SHORT_CARDS[where.card] ?? where.card} ${where.row}`
}

/** 기본 value 설정 함수로 넣고 bubbles input 이벤트를 쏜다. 금액칸은 '' → 숫자 → blur(떠날 때 표시 정리) */
export function putValue(input: HTMLInputElement, value: string): void {
  const view = input.ownerDocument.defaultView
  const setter = Object.getOwnPropertyDescriptor((view?.HTMLInputElement ?? HTMLInputElement).prototype, 'value')?.set
  if (!setter) return
  const EventOf = view?.Event ?? Event
  const set = (v: string) => {
    setter.call(input, v)
    input.dispatchEvent(new EventOf('input', { bubbles: true }))
  }
  if (!input.classList.contains('money-input')) {
    set(value)
    return
  }
  input.focus({ preventScroll: true })
  set('')
  set(value)
  input.blur()
}

const NUMBER = /^-?\d+(?:\.\d+)?$/

/**
 * 이미 적힌 칸인가(기본값 (차)): 쉼표·빈칸을 뺀 지금 글자에 숫자가 있고, 빈 칸(''·'-'·숫자 값 0)이 아니며, 넣을 값과 다른 칸.
 * '1,234'와 '1234'는 같은 값이다
 */
function isWritten(current: string, value: string): boolean {
  const now = current.replace(/[\s,]/g, '')
  if (now === '' || now === '-' || !/\d/.test(now)) return false
  if (NUMBER.test(now) && Number(now) === 0) return false
  return !(now === value || (NUMBER.test(now) && Number(now) === Number(value)))
}

const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms))
const w1Ready = (doc: Document) => doc.querySelector('.closing-w1-box') !== null

/** 업무일지 1 칸이 없으면 1 탭을 눌러 2초까지 기다린다. 누른 경우 돌아갈 처음 탭을 돌려준다 */
async function openW1(doc: Document): Promise<HTMLElement | null> {
  if (w1Ready(doc)) return null
  const tab = doc.querySelector<HTMLElement>('#closing-tab-w1')
  if (!tab) return null
  let back: HTMLElement | null = null
  if (tab.getAttribute('aria-selected') !== 'true') {
    back = tab.closest('[role="tablist"]')?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]') ?? null
    tab.click()
  }
  for (let waited = 0; !w1Ready(doc) && waited < W1_WAIT_MS; waited += STEP_MS) await sleep(STEP_MS)
  return back
}

/** 넣을 칸(까닭 없음·값 있음)만, 업무일지 1 → 2 차례로 본다. 업무일지 1은 필요하면 탭을 바꿨다 돌아온다 */
async function eachTodo(doc: Document, plan: Planned[], visit: (cell: Planned & { value: string }) => void): Promise<void> {
  const todo = plan.filter((p): p is Planned & { value: string } => !p.why && p.value !== null)
  const w1 = todo.filter((p) => p.where.j === 1)
  const w2 = todo.filter((p) => p.where.j === 2)
  if (w1.length > 0) {
    const back = await openW1(doc)
    w1.forEach(visit)
    back?.click()
  }
  w2.forEach(visit)
}

/**
 * 채우기 전 세기(AC-3612.3·3612.5): written = 넣을 값과 다른 숫자가 이미 적힌 칸, fillable = 넣을 수 있는 칸 수,
 * locked = 잠겨서 넣을 수 없는 칸 수. 칸은 바꾸지 않는다
 */
export async function survey(doc: Document, plan: Planned[]): Promise<{ written: Where[]; fillable: number; locked: number }> {
  const seen = { written: [] as Where[], fillable: 0, locked: 0 }
  await eachTodo(doc, plan, (cell) => {
    const at = locate(doc, cell.where)
    if ('skip' in at) {
      if (at.skip === 'locked') seen.locked += 1
      return
    }
    seen.fillable += 1
    if (isWritten(at.input.value, cell.value)) seen.written.push(cell.where)
  })
  return seen
}

/** 칸 계획대로 채운다. 업무일지 1(필요하면 탭을 바꿨다 돌아옴) → 업무일지 2(숨어 있어도) 차례. 저장은 하지 않는다 */
export async function fillAll(doc: Document, plan: Planned[], mode: FillMode = 'all'): Promise<FillResult> {
  const result: FillResult = {
    filled: 0,
    kept: 0,
    skipped: [],
    unpicked: plan.filter((p) => p.why === 'unpicked').map((p) => p.where),
    noName: plan.filter((p) => p.why === 'noName').map((p) => p.where),
    unknown: plan.filter((p) => p.why === 'unknown').length,
    held: plan.filter((p) => p.why === 'held').length,
    undo: [],
  }
  await eachTodo(doc, plan, (cell) => {
    const at = locate(doc, cell.where)
    if ('skip' in at) {
      result.skipped.push({ where: cell.where, skip: at.skip })
      return
    }
    const before = at.input.value
    if (mode === 'empty' && isWritten(before, cell.value)) {
      result.kept += 1
      return
    }
    putValue(at.input, cell.value)
    result.undo.push({ input: at.input, before, where: cell.where })
    result.filled += 1
  })
  return result
}

/**
 * [되돌리기](AC-3612.4): 넣은 칸을 넣기 전 글자로 같은 넣는 법(putValue)으로 돌린다. 넣은 차례의 거꾸로 돌려서
 * 한 값을 두 칸이 보이는 도수·충격파 총금액도 처음 값으로 돌아간다.
 * 기억한 칸이 화면에서 떨어졌으면(업무일지 1은 탭을 바꾸면 ERP가 칸을 새로 그린다, 조사 2절) 같은 자리를 다시 찾아 돌리고
 * (업무일지 1이 안 보이면 탭을 잠깐 바꿨다 돌아옴), 다시 찾지 못한 칸만 gone에 센다. 날짜 확인은 부르는 쪽(main.ts)이 한다
 */
export async function undoAll(doc: Document, undo: UndoEntry[]): Promise<{ restored: number; gone: number }> {
  const done = { restored: 0, gone: 0 }
  if (undo.length === 0) return done
  const needW1 = undo.some((u) => !u.input.isConnected && u.where.j === 1)
  const back = needW1 ? await openW1(doc) : null
  for (const entry of [...undo].reverse()) {
    let input: HTMLInputElement | null = entry.input.isConnected ? entry.input : null
    if (!input) {
      const at = locate(doc, entry.where)
      input = 'input' in at ? at.input : null
    }
    if (!input) {
      done.gone += 1
      continue
    }
    putValue(input, entry.before)
    done.restored += 1
  }
  back?.click()
  return done
}
