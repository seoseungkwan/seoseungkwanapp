// ERP 마감일지 화면에서 칸을 찾아 값을 넣는다(REQ-3608, notes/erp-closing-fields.md 2~6절)
// - 칸에는 name·id가 없어 구역·묶음 제목 + 줄 이름 + 열 머리 / label 글자로 찾는다. 글자는 앞뒤 공백과 '자동'·'업로드 시 생략 가능'
//   표시를 떼고 똑같을 때만 맞다고 본다(둘 이상 맞으면 못 찾은 것으로 본다). 못 찾은 칸은 건너뛰고 적는다
// - ERP는 React 18 통제 칸이라 기본 value 설정 함수 + bubbles input 이벤트로 넣는다. 금액칸은 '' → 숫자 → blur(조사 6절)
// - 탭 단추(#closing-tab-w1·처음 탭) 말고는 어떤 단추도 누르지 않고, select·textarea·fieldset[disabled] 안 칸은 바꾸지 않는다
import { FIELD_CARD, type Planned, type Where } from './cells.js'

/** held = 보류 묶음(HELD_SALES) 칸 수. 넣지도 못 찾은 칸에 적지도 않는다 */
export type FillResult = { filled: number; missing: string[]; unpicked: number; unknown: number; held: number }

/** 2 탭에서 1 탭을 누른 뒤 업무일지 1 칸이 생기길 기다리는 시간 */
export const W1_WAIT_MS = 2000
const STEP_MS = 50

const MARKS = ['자동', '업로드 시 생략 가능']
const MARK_SELECTOR = '.af-badge, .cdf-fill-tag'

/** 비교용 글자: '자동'·'업로드 시 생략 가능' 표시를 떼고 빈칸을 하나로, 앞뒤 공백 없이 */
function text(el: Element): string {
  const copy = el.cloneNode(true) as Element
  copy.querySelectorAll(MARK_SELECTOR).forEach((mark) => mark.remove())
  let s = (copy.textContent ?? '').replace(/\s+/g, ' ').trim()
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

function findW1(doc: Document, box: string, row: string): HTMLInputElement | null {
  const title = only([...doc.querySelectorAll('h4.closing-panel-title')].filter((h) => text(h) === box))
  const scope = title?.closest('.closing-w1-box') ?? title?.parentElement
  if (!scope) return null
  const tr = only(
    [...scope.querySelectorAll<HTMLTableRowElement>('tbody tr')].filter((r) => r.cells.length > 1 && text(r.cells[0]) === row),
  )
  return tr ? inputIn([...tr.cells].slice(1)) : null
}

function w2Scope(doc: Document): ParentNode {
  return doc.querySelector('#closing-panel-w2') ?? doc
}

function findTable(doc: Document, card: string, row: string, col: string): HTMLInputElement | null {
  const title = only([...w2Scope(doc).querySelectorAll('h3.cdf-section-title')].filter((h) => text(h) === card))
  const table = (title?.closest('.card') ?? title?.parentElement)?.querySelector('table.cdf-table')
  if (!table) return null
  const heads = [...table.querySelectorAll('thead th')].map(text)
  const at = only(heads.flatMap((h, i) => (h === col ? [i] : [])))
  if (at === null) return null
  const tr = only(
    [...table.querySelectorAll<HTMLTableRowElement>('tbody tr')].filter((r) => {
      const label = r.cells[0]
      return label?.classList.contains('rowlabel') === true && text(label) === row
    }),
  )
  const cell = tr?.cells[at]
  return cell ? inputIn([cell]) : null
}

function findField(doc: Document, field: string): HTMLInputElement | null {
  const label = only([...w2Scope(doc).querySelectorAll('div.cdf-field > label')].filter((l) => text(l) === field))
  return label?.parentElement?.querySelector('input') ?? null
}

/** 칸 자리에 맞는 입력칸 하나. 없으면 null */
export function findInput(doc: Document, where: Where): HTMLInputElement | null {
  if (where.j === 1) return findW1(doc, where.box, where.row)
  if ('field' in where) return findField(doc, where.field)
  return findTable(doc, where.card, where.row, where.col)
}

/** 못 찾은 칸 글: '업무일지 1 › 구역 › 줄' 꼴 */
export function placeName(where: Where): string {
  if (where.j === 1) return `업무일지 1 › ${where.box} › ${where.row}`
  if ('field' in where) return `업무일지 2 › ${FIELD_CARD} › ${where.field}`
  return `업무일지 2 › ${where.card} › ${where.row} › ${where.col}`
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

/** 읽기 전용(본사 열람 등)이라 바꾸면 안 되는 칸 */
function locked(input: HTMLInputElement): boolean {
  return input.disabled || input.readOnly || input.closest('fieldset[disabled]') !== null
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

function fillCells(doc: Document, cells: Planned[], result: FillResult): void {
  for (const cell of cells) {
    const input = findInput(doc, cell.where)
    if (!input || locked(input)) {
      result.missing.push(placeName(cell.where))
      continue
    }
    putValue(input, cell.value as string)
    result.filled += 1
  }
}

/** 칸 계획대로 채운다. 업무일지 1(필요하면 탭을 바꿨다 돌아옴) → 업무일지 2(숨어 있어도) 차례. 저장은 하지 않는다 */
export async function fillAll(doc: Document, plan: Planned[]): Promise<FillResult> {
  const result: FillResult = {
    filled: 0,
    missing: [],
    unpicked: plan.filter((p) => p.why === 'unpicked').length,
    unknown: plan.filter((p) => p.why === 'unknown').length,
    held: plan.filter((p) => p.why === 'held').length,
  }
  const todo = plan.filter((p) => !p.why && p.value !== null)
  const w1 = todo.filter((p) => p.where.j === 1)
  const w2 = todo.filter((p) => p.where.j === 2)
  if (w1.length > 0) {
    const back = await openW1(doc)
    fillCells(doc, w1, result)
    back?.click()
  }
  fillCells(doc, w2, result)
  return result
}
