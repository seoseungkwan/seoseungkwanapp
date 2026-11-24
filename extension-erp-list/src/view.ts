// 'ERP 마감일지 입력 목록' 화면 그리기(spec erp-copy-list design.md 6절·7절). 모양·글은 승인된 시안 docs/mockups/erp-copy-list/ ①~⑤ 그대로다
// - DOM만 다룬다(도우미·chrome을 모른다). 글은 모두 textContent·title 속성으로 넣는다(기타 줄 이름에 HTML 글자가 들어도 글자로 보인다)
// - 표 모양은 시안 tableHtml 그대로: thead(항목 · 날짜 머리) · 업무일지 줄(tr.s1) · 상자 머리 줄(tr.s2) · 숫자 줄(tr.r)
// - 숫자 칸 단추에는 줄 순번|날짜(data-k)만 두고 값은 단추 글자로만 보인다. 눌린 칸의 값은 list.ts가 목록 모양에서 찾는다
// - 새 글은 listTypes.ts LIST_TEXT·WHY_TEXT, 지금 글은 panel.js TEXT·FLOW_TEXT, rangeView.js RANGE_TEXT, errors.js explain 그대로다
import { explain } from '../../extension-erp/src/errors.js'
import { FLOW_TEXT, TEXT } from '../../extension-erp/src/panel.js'
import { RANGE_TEXT } from '../../extension-erp/src/rangeView.js'
import { dayHead, isSunday, LIST_TEXT, shortDay, TOAST_MS, WHY_ORDER, WHY_TEXT, type ListLine, type ListModel } from './listTypes.js'

type Row = ListLine & { kind: 'row' }
type Child = Node | string | null | undefined | false

/** 요소 하나(속성은 setAttribute, 자식 글은 글자 마디로) */
function h<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  attrs: Record<string, string> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = doc.createElement(tag)
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value)
  for (const child of children) if (child !== null && child !== undefined && child !== false) el.append(child)
  return el
}

/** 시안 ① 처음 안내 */
export function renderHint(doc: Document): HTMLElement {
  return h(
    doc,
    'div',
    { class: 'hint' },
    h(doc, 'p', { class: 'lead' }, LIST_TEXT.hint.lead),
    h(doc, 'p', {}, LIST_TEXT.hint.body),
    h(doc, 'p', {}, LIST_TEXT.hint.copy),
  )
}

/** 처음 한 번(설정을 저장한 적 없음): 같은 안내 모양에 두 줄 */
export function renderFirst(doc: Document): HTMLElement {
  return h(doc, 'div', { class: 'hint' }, h(doc, 'p', { class: 'lead' }, TEXT.first), h(doc, 'p', {}, LIST_TEXT.settingsOpened))
}

/** 시안 ② 세는 중: '비트에서 읽는 중…' · '{N}일 중 {k}일' · 진행 막대 · [그만두기] */
export function renderLoading(doc: Document, total: number, done: number, onCancel: () => void): HTMLElement {
  const bar = h(doc, 'i')
  bar.style.width = `${total > 0 ? Math.round((done / total) * 100) : 0}%`
  const stop = h(doc, 'button', { type: 'button', class: 'btn btn-2' }, RANGE_TEXT.scanning.cancel)
  stop.addEventListener('click', () => onCancel())
  return h(
    doc,
    'div',
    { class: 'box', 'aria-live': 'polite' },
    h(doc, 'p', { class: 'lead' }, TEXT.reading),
    h(doc, 'p', {}, h(doc, 'b', { class: 'nw' }, RANGE_TEXT.scanning.count(total, done))),
    h(doc, 'div', { class: 'prog' }, bar),
    h(doc, 'div', { class: 'acts' }, stop),
  )
}

/** 시안 ⑤ 오류: 굵은 빨강 '무엇이' · '어떻게' · '목록을 만들지 못했어요. (번호 …)'. 번호 모양이 아니면 E-BRIDGE-BAD-REPLY(explain) */
export function renderError(doc: Document, code: string): HTMLElement {
  const e = explain(code)
  return h(
    doc,
    'div',
    { class: 'box err', role: 'alert' },
    h(doc, 'p', { class: 'lead err' }, e.what),
    h(doc, 'p', {}, e.how),
    h(doc, 'p', { class: 'small' }, LIST_TEXT.failed(e.code)),
  )
}

/** 날짜 머리: '{M/D} ' + 흐린 '({요일})', 일요일은 .sun, 진료 0건이면 작은 줄 '진료 0건' + 마우스 글 */
function dayHeadCell(doc: Document, date: string, zero: boolean): HTMLElement {
  const md = shortDay(date)
  const th = h(doc, 'th', { scope: 'col' }, `${md} `, h(doc, 'span', { class: 'wd' }, dayHead(date).slice(md.length).trim()))
  if (isSunday(date)) th.className = 'sun'
  if (zero) {
    th.setAttribute('title', FLOW_TEXT.zero(date))
    th.append(h(doc, 'span', { class: 'zt' }, LIST_TEXT.zero))
  }
  return th
}

/** 숫자 줄 하나(시안 tr.r): 줄 이름(+ 열 이름) · 모든 날 같은 까닭이면 꼬리표, 날마다 숫자 단추 또는 빈 칸 */
function rowLine(doc: Document, model: ListModel, row: Row, index: number, group: boolean): HTMLElement {
  const name = h(doc, 'span', { class: 'nm' }, row.name)
  if (row.col !== null) name.append(' ', h(doc, 'span', { class: 'cl' }, row.col))
  const label = h(doc, 'div', { class: 'lw' }, name)
  if (row.rowWhy) label.append(h(doc, 'span', { class: `tag ${row.rowWhy}`, title: WHY_TEXT[row.rowWhy].help }, WHY_TEXT[row.rowWhy].tag))
  const classes = ['r', group ? 'g' : '', row.rowWhy ? 'off' : ''].filter(Boolean).join(' ')
  const tr = h(doc, 'tr', { class: classes }, h(doc, 'th', { class: 'lab', scope: 'row' }, label))
  row.cells.forEach((cell, i) => {
    const day = model.days[i]
    const zero = day.zero ? ' z' : ''
    if ('value' in cell) {
      const button = h(doc, 'button', { type: 'button', class: 'v', 'data-k': `${index}|${day.date}`, title: LIST_TEXT.copyTitle }, cell.value)
      tr.append(h(doc, 'td', zero ? { class: zero.trim() } : {}, button))
    } else if (row.rowWhy) {
      tr.append(h(doc, 'td', { class: `na${zero}` }))
    } else {
      const text = WHY_TEXT[cell.why]
      tr.append(h(doc, 'td', { class: `na${zero}` }, h(doc, 'span', { class: 'nt', title: text.help }, text.cell)))
    }
  })
  return tr
}

/** 표(시안 tableHtml 모양) */
function table(doc: Document, model: ListModel): HTMLElement {
  const span = String(model.days.length)
  const head = h(doc, 'tr', {}, h(doc, 'th', { class: 'lab', scope: 'col' }, LIST_TEXT.head))
  for (const day of model.days) head.append(dayHeadCell(doc, day.date, day.zero))
  const body = h(doc, 'tbody')
  /** 열 여럿 표에서 줄 이름이 바뀌는 곳(.g)을 보려고: 앞 줄 이름 · 머리 바로 뒤인가 */
  let prev: string | null = null
  let first = true
  let index = 0
  for (const line of model.lines) {
    if (line.kind === 'journal') {
      body.append(h(doc, 'tr', { class: 's1' }, h(doc, 'th', { class: 'lab', scope: 'colgroup' }, line.text), h(doc, 'td', { colspan: span })))
      prev = null
      continue
    }
    if (line.kind === 'section') {
      const th = h(doc, 'th', { class: 'lab', scope: 'colgroup' }, line.text, line.sub ? h(doc, 'span', { class: 'sub' }, line.sub) : null)
      body.append(h(doc, 'tr', { class: 's2' }, th, h(doc, 'td', { colspan: span })))
      prev = null
      first = true
      continue
    }
    const group = line.col !== null && line.name !== prev && !first
    prev = line.name
    first = false
    body.append(rowLine(doc, model, line, index, group))
    index += 1
  }
  return h(doc, 'table', { class: 'tbl' }, h(doc, 'thead', {}, head), body)
}

/** '빈 칸 까닭' 상자: 나온 까닭(WHY_ORDER 차례) + 끝에 씨암·SONO 줄. 둘 다 없으면 null */
function legend(doc: Document, model: ListModel): HTMLElement | null {
  const reasons = WHY_ORDER.filter((why) => model.reasons.includes(why))
  if (reasons.length === 0 && model.overlap === null) return null
  const box = h(doc, 'section', { class: 'legend' })
  if (reasons.length > 0) {
    box.append(
      h(doc, 'h2', {}, LIST_TEXT.legend),
      h(
        doc,
        'ul',
        {},
        ...reasons.map((why) =>
          h(doc, 'li', {}, h(doc, 'span', { class: `tag ${why}` }, WHY_TEXT[why].tag), h(doc, 'span', {}, WHY_TEXT[why].help)),
        ),
      ),
    )
  }
  if (model.overlap !== null) box.append(h(doc, 'p', { class: 'ovl' }, model.overlap))
  return box
}

/** 시안 ③: .sum · .warns(있을 때) · .slide · .tbox(table.tbl) · .legend(있을 때). madeAt = 'YYYY-MM-DD HH:MM' */
export function renderList(doc: Document, model: ListModel, madeAt: string): HTMLElement {
  const sum = h(
    doc,
    'div',
    { class: 'sum' },
    h(
      doc,
      'div',
      { class: 'l' },
      h(doc, 'p', {}, h(doc, 'b', {}, LIST_TEXT.period(model.from, model.to)), LIST_TEXT.size(model.days.length, model.rowCount)),
      h(doc, 'p', { class: 'small' }, LIST_TEXT.sumHelp),
    ),
    h(doc, 'p', { class: 'made' }, LIST_TEXT.madeAt(madeAt)),
  )
  const warns = model.warnings.length > 0 ? h(doc, 'ul', { class: 'warns' }, ...model.warnings.map((line) => h(doc, 'li', {}, line))) : null
  const slide = h(doc, 'p', { class: 'slide' }, LIST_TEXT.slide)
  slide.hidden = true
  return h(doc, 'div', { class: 'list' }, sum, warns, slide, h(doc, 'div', { class: 'tbox' }, table(doc, model)), legend(doc, model))
}

/** 표 상자가 넓을 때만 밀기 줄을 보인다(scrollWidth > clientWidth + 1). 그린 뒤·창 크기가 바뀔 때 부른다 */
export function syncSlide(root: HTMLElement): void {
  const box = root.querySelector<HTMLElement>('.tbox')
  const slide = root.querySelector<HTMLElement>('.slide')
  if (!box || !slide) return
  slide.hidden = !(box.scrollWidth > box.clientWidth + 1)
}

/** 쪽지 꼬리 '{M/D} · {묶음} {줄}[ {열}] · {값}' */
export function copyTail(model: ListModel, row: Row, dayIndex: number, value: string): string {
  return LIST_TEXT.copyTail(shortDay(model.days[dayIndex].date), row.section, row.name, row.col, value)
}

/** 복사 표시: 누른 칸(key = data-k)은 .now, 그 전에 .now였던 칸은 .done(✓) */
export function markCopied(root: HTMLElement, key: string): void {
  const next = [...root.querySelectorAll<HTMLButtonElement>('button.v')].find((b) => b.dataset.k === key)
  if (!next) return
  for (const prev of root.querySelectorAll<HTMLButtonElement>('button.v.now')) {
    if (prev === next) continue
    prev.classList.remove('now')
    prev.classList.add('done')
  }
  next.classList.remove('done')
  next.classList.add('now')
}

/** 쪽지마다 숨김 타이머(새 쪽지는 시간을 다시 센다) */
const toastTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>()

/** 쪽지(#toast) 하나: 머리 b + 꼬리 span(있을 때), bad면 .bad(! 표시), TOAST_MS 뒤 숨김 */
export function showToast(toast: HTMLElement, head: string, tail?: string, bad?: boolean): void {
  const doc = toast.ownerDocument
  clearTimeout(toastTimers.get(toast))
  toast.className = bad ? 'toast bad' : 'toast'
  toast.replaceChildren(h(doc, 'b', {}, head), tail ? h(doc, 'span', {}, tail) : '')
  toast.hidden = false
  toastTimers.set(
    toast,
    setTimeout(() => {
      toast.hidden = true
    }, TOAST_MS),
  )
}
