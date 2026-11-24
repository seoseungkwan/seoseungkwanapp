// 의사랑 설정 화면(spec erp-uisarang TASK-12, design.md 8-8·9-5·10-6·11절 1·10·18, 승인 시안 docs/mockups/erp-uisarang/ ⑮~⑱).
// - 지금 options.html 한 쪽(#optMain · 저장 줄)에 그린다. [처음 값으로]·알림 상자는 쓰지 않아 숨긴다. 시안에만 있는 모양
//   (코드 목록 상자 · 이름표 두 줄 · 엑셀 표)은 이 화면이 style 한 벌을 더한다(options.html은 비트 화면 그대로 둔다)
// - 고른 코드는 [저장] 때 chrome.storage.local erpClosingUis 한 칸, 코드 목록은 [코드 목록 읽기] ok 때 곧바로 erpClosingUisCodes 한 칸에만 쓴다.
//   비트 erpClosing은 읽지도 쓰지도 않는다(AC-4214.4). 여는 것만으로는 도우미를 부르지 않는다
// - 글은 uisText.ts UIS_OPTIONS_TEXT · 지금 options.ts 공용 글(SHARED_TEXT) · errors.ts explainFor('uisarang') 그대로다.
//   도우미가 준 코드 · 처방명칭은 글자(textContent)로만 그린다
// - options.ts와 서로 부르므로 SHARED_TEXT는 함수 안에서만 읽는다
import { E_BRIDGE_BAD_REPLY, E_HELPER_MISSING, explainFor } from './errors.js'
import { SHARED_TEXT } from './options.js'
import { cleanCode, ETC_KEYS, MAX_CODES } from './settings.js'
import { GROUP_NAMES } from './types.js'
import type { ClosingCommand, EtcKey } from './types.js'
import { UIS_FOLDER_TEXT, UIS_OPTIONS_TEXT } from './uisText.js'
import { loadUis, loadUisCodes, normalizeCodes, saveUis, saveUisCodes, searchUis, uisEmpty } from './uisSettings.js'
import { UIS_COUNT_KEYS, UIS_KINDS, UIS_PATIENT, UIS_REQUIRED, UIS_SALES_KEYS } from './uisTypes.js'
import type { UisCodeRow, UisCodes, UisCodesAnswer, UisCountKey, UisSalesKey, UisSettings } from './uisTypes.js'

/** 도우미 명령 하나를 묻는다(서비스 워커 { cmd, args }). 받은 답 그대로({ type: 'result', data } | { type: 'error', code }), 끊기면 던진다 */
export type Send = (cmd: ClosingCommand, args: Record<string, unknown>) => Promise<unknown>

/** 줄마다 따로 고르는 두 목록: 건수로 셀 코드 · 매출로 셀 코드 */
type Kind = 'counts' | 'sales'
type RowKey = UisCountKey | UisSalesKey

/**
 * 엑셀 폴더 글. closing.uisCodes 답에는 폴더 자리가 없어(design.md 3-3) 시안처럼 바탕화면 글을 쓴다
 * (바탕화면이 OneDrive 안인 PC의 실제 폴더는 설치 글 · ERP 화면 안내가 알려 준다)
 */
const FOLDER = UIS_FOLDER_TEXT.desktop

/** [코드 목록 읽기] 결과 줄(ok는 코드 목록 줄 자체라 없다) */
type Said = { state: 'missing' | 'notAll' | 'twice' | 'open'; value: string | null } | { state: 'error'; code: string }

type Page = {
  send: Send
  main: HTMLElement
  settings: UisSettings
  everSaved: boolean
  dirty: boolean
  /** 마지막 [저장]이 chrome.storage 오류로 쓰지 못했다(다음 [저장]까지 상태 줄에 실패 글) */
  saveFailed: boolean
  /** 바꿀 때마다 1씩: 저장하는 동안 또 바꿨는지 본다 */
  rev: number
  /** 기억해 둔 코드 목록. 없으면 찾기 칸이 막힌다 */
  list: UisCodes | null
  /** 코드 목록의 처방명칭(코드 꼴 정리 · 대문자로 견줌, 처음 나온 줄) */
  names: Map<string, string | null>
  /** closing.uisCodes 답을 기다리는 중 */
  reading: boolean
  said: Said | null
  /** 열린 찾기 칸 하나 */
  open: { key: RowKey; kind: Kind; text: string } | null
}

let doc: Document
let page: Page | null = null
let stop: AbortController | null = null

const STATES: readonly UisCodesAnswer['state'][] = ['ok', 'missing', 'notAll', 'twice', 'open']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
const isCountKey = (key: string): key is UisCountKey => (UIS_COUNT_KEYS as readonly string[]).includes(key)
const isSalesKey = (key: string): key is UisSalesKey => (UIS_SALES_KEYS as readonly string[]).includes(key)
const isRowKey = (key: string | undefined): key is RowKey => key !== undefined && (isCountKey(key) || isSalesKey(key))
const isKind = (kind: string | undefined): kind is Kind => kind === 'counts' || kind === 'sales'
const isEtcKey = (key: string | undefined): key is EtcKey => (ETC_KEYS as readonly string[]).includes(key ?? '')
/** 도우미와 같은 코드 견주기(앞뒤 빈칸 뗌 · 가운데 빈칸 하나로 · 대문자, design.md 4-1 UisRules.Code) */
const normCode = (code: string) => code.trim().replace(/\s+/g, ' ').toUpperCase()
const copyOf = (s: UisSettings): UisSettings => JSON.parse(JSON.stringify(s)) as UisSettings

// --- 도우미 답 ---

/** 글자 또는 null(칸이 없으면 null로 본다) */
const textOrNull = (value: unknown): value is string | null | undefined => value === undefined || value === null || typeof value === 'string'

/** closing.uisCodes 답 모양 검사(AC-4206.5, design.md 3-3). 코드 줄은 ok일 때 normalizeCodes가 고른다 */
function readAnswer(data: unknown): UisCodesAnswer | null {
  if (!isRecord(data)) return null
  const { state, from, to, value, codes } = data
  if (typeof state !== 'string' || !(STATES as readonly string[]).includes(state)) return null
  if (!textOrNull(from) || !textOrNull(to) || !textOrNull(value) || !Array.isArray(codes)) return null
  return { state: state as UisCodesAnswer['state'], from: from ?? null, to: to ?? null, value: value ?? null, codes: codes as UisCodeRow[] }
}

/** 도우미 closing.uisCodes. 끊김·답 없음은 E-HELPER-MISSING, 모양이 틀리면 E-BRIDGE-BAD-REPLY, 오류 번호는 explainFor 꼴 그대로 */
async function askCodes(send: Send): Promise<{ answer: UisCodesAnswer } | { code: string }> {
  let reply: unknown
  try {
    reply = await send('closing.uisCodes', {})
  } catch {
    return { code: E_HELPER_MISSING }
  }
  if (reply === undefined || reply === null) return { code: E_HELPER_MISSING }
  if (isRecord(reply) && reply.type === 'error') return { code: explainFor(reply.code, 'uisarang').code }
  if (isRecord(reply) && reply.type === 'result') {
    const answer = readAnswer(reply.data)
    return answer ? { answer } : { code: E_BRIDGE_BAD_REPLY }
  }
  return { code: E_BRIDGE_BAD_REPLY }
}

// --- 그리기 ---

type Child = Node | string | null | undefined | false

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | boolean | undefined> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag)
  for (const [name, value] of Object.entries(attrs)) {
    if (value === true) node.setAttribute(name, '')
    else if (typeof value === 'string') node.setAttribute(name, value)
  }
  for (const child of children) if (child) node.append(child)
  return node
}

function byId(id: string): HTMLElement {
  const found = doc.getElementById(id)
  if (!found) throw new Error(`#${id}`)
  return found
}

function setList(p: Page, list: UisCodes | null) {
  p.list = list
  p.names = new Map()
  for (const row of list?.codes ?? []) {
    const key = normCode(row.code)
    if (!p.names.has(key)) p.names.set(key, row.name)
  }
}

function picksOf(p: Page, kind: Kind, key: RowKey): string[] {
  if (kind === 'counts') return isCountKey(key) ? (p.settings.counts[key] ?? []) : []
  return isSalesKey(key) ? (p.settings.sales[key] ?? []) : []
}

function setPicks(p: Page, kind: Kind, key: RowKey, codes: string[]) {
  if (kind === 'counts' && isCountKey(key)) {
    if (codes.length > 0) p.settings.counts[key] = codes
    else delete p.settings.counts[key]
  } else if (kind === 'sales' && isSalesKey(key)) {
    if (codes.length > 0) p.settings.sales[key] = codes
    else delete p.settings.sales[key]
  }
}

const hasCode = (list: readonly string[], code: string) => list.some((c) => normCode(c) === normCode(code))

/** 코드 조각: 코드 · 처방명칭(목록에 없으면 '(처방통계에 없음)', 목록이 없으면 코드만) · [×] */
function chip(p: Page, code: string): HTMLElement {
  let name: HTMLElement | null = null
  if (p.list) {
    const key = normCode(code)
    if (!p.names.has(key)) name = h('span', { class: 'cn gone' }, UIS_OPTIONS_TEXT.notInList)
    else {
      const known = p.names.get(key)
      if (known) name = h('span', { class: 'cn' }, known)
    }
  }
  return h(
    'span',
    { class: 'chip' },
    h('b', {}, code),
    name,
    h('button', { type: 'button', 'data-del': code, 'aria-label': SHARED_TEXT.remove(code) }, '×'),
  )
}

/**
 * 찾기 목록(AC-4214.2): 코드나 처방명칭에 든 줄 30개(목록 차례 = 총액 큰 차례). 꼬리 = 건수 '총투여량 N'(소수는 주황) · 매출 '총액 N원',
 * 고른 줄은 '골랐어요'로 막힘, 코드 꼴이 아닌 줄(21자 넘음 등)은 보이되 막힘. 건수 목록에 소수가 있으면 맨 위 안내 한 줄
 */
function findItems(p: Page, kind: Kind, key: RowKey, text: string): HTMLElement[] {
  if (!p.list || !text.trim()) return []
  const found = searchUis(p.list.codes, text)
  if (found.length === 0) return [h('p', { class: 'empty' }, SHARED_TEXT.noMatch)]
  const mine = picksOf(p, kind, key)
  const fraction = kind === 'counts' && found.some((row) => !Number.isInteger(row.qty))
  return [
    ...(fraction ? [h('p', { class: 'cnt' }, UIS_OPTIONS_TEXT.fraction)] : []),
    ...found.map((row) => {
      const has = hasCode(mine, row.code)
      const odd = kind === 'counts' && !Number.isInteger(row.qty)
      const tail = has ? SHARED_TEXT.picked : kind === 'counts' ? UIS_OPTIONS_TEXT.qty(row.qty) : UIS_OPTIONS_TEXT.amount(row.amount)
      return h(
        'button',
        { type: 'button', 'data-add': row.code, disabled: has || cleanCode(row.code) === null },
        h('b', {}, row.code),
        h('span', {}, row.name ?? ''),
        h('em', { class: !has && odd ? 'frac' : undefined }, tail),
      )
    }),
  ]
}

const openText = (p: Page, kind: Kind, key: RowKey) => (p.open?.key === key && p.open.kind === kind ? p.open.text : '')

/** 이름표 한 줄: '건수로 셀 코드' 또는 '매출로 셀 코드' · 조각(또는 빈 글) · 찾기 칸 */
function kindLine(p: Page, kind: Kind, key: RowKey): HTMLElement {
  const label = UIS_OPTIONS_TEXT.label[kind]
  const mine = picksOf(p, kind, key)
  const full = mine.length >= MAX_CODES
  const text = openText(p, kind, key)
  const placeholder = !p.list ? UIS_OPTIONS_TEXT.noList : full ? SHARED_TEXT.full : SHARED_TEXT.find
  const items = findItems(p, kind, key, text)
  return h(
    'div',
    { class: 'kline', 'data-kind': kind },
    h('span', { class: 'sub' }, label),
    h(
      'div',
      { class: 'pickline' },
      ...(mine.length > 0 ? mine.map((code) => chip(p, code)) : [h('span', { class: 'none' }, SHARED_TEXT.none)]),
      h(
        'div',
        { class: 'find' },
        h('input', {
          type: 'search',
          'data-find': key,
          'data-kind': kind,
          placeholder,
          value: text,
          disabled: !p.list || full,
          'aria-label': `${GROUP_NAMES[key]} ${label} 찾기`,
          autocomplete: 'off',
        }),
        h('div', { class: 'dd', 'data-dd': `${key}-${kind}`, hidden: items.length === 0 }, ...items),
      ),
    ),
  )
}

/** 항목 줄(design.md 9-5): 이름 · 쓰는 칸 | (기타) ERP 줄 이름 · 건수 줄 · 매출 줄 · (씨암 · SONO) 시술 코드 주의 */
function codeRow(p: Page, key: RowKey, use: string): HTMLElement {
  const name = GROUP_NAMES[key]
  const etc = isEtcKey(key)
    ? h(
        'label',
        { class: 'etc' },
        h('span', {}, SHARED_TEXT.etcLabel),
        h('input', { type: 'text', maxlength: '20', 'data-etc': key, value: p.settings.etcNames[key], placeholder: SHARED_TEXT.etcHint }),
      )
    : null
  return h(
    'div',
    { class: 'orow', 'data-row': key },
    h('div', { class: 'oname' }, h('b', {}, name), h('small', {}, use)),
    h(
      'div',
      { class: 'opick' },
      etc,
      isCountKey(key) && kindLine(p, 'counts', key),
      isSalesKey(key) && kindLine(p, 'sales', key),
      (key === 'carm' || key === 'sono') && h('p', { class: 'hint' }, UIS_OPTIONS_TEXT.caution(name)),
    ),
  )
}

/** [코드 목록 읽기] 결과 줄 글(design.md 10-6) */
function saidText(said: Said): string {
  const T = UIS_OPTIONS_TEXT.codes
  if (said.state === 'error') {
    const e = explainFor(said.code, 'uisarang')
    return `${e.what} ${e.how} (${e.code})`
  }
  if (said.state === 'missing') return T.missing(FOLDER)
  if (said.state === 'notAll') return T.notAll(said.value ?? '')
  return said.state === 'twice' ? T.twice : T.open
}

/**
 * 코드 목록 줄(시안 ⑮ ⑯ + design.md 10-6): 목록이 없으면 주황 상자(처방 코드 목록이 아직 없어요 · 3단계 · [코드 목록 읽기]),
 * 있으면 읽은 기간 · 코드 수 줄과 [코드 목록 다시 읽기]. 결과 줄(missing이면 3단계도)은 그 상자 안. 읽는 동안 단추는 막힌다
 */
function codesBox(p: Page): HTMLElement {
  const T = UIS_OPTIONS_TEXT.codes
  const said = p.said ? h('p', { class: p.said.state === 'error' ? 'said err' : 'said' }, saidText(p.said)) : null
  const steps = !p.list || p.said?.state === 'missing' ? h('ol', {}, ...T.steps(FOLDER).map((line) => h('li', {}, line))) : null
  const button = (label: string, look: string) =>
    h('button', { type: 'button', class: `btn ${look}`, 'data-reread': '', disabled: p.reading }, label)
  if (!p.list) {
    return h('div', { class: 'notice nofile' }, h('b', {}, T.none), said, steps, h('p', {}, T.then), button(T.readButton, 'btn-1'))
  }
  // 기간이 없던 목록(도우미 답 from · to가 null)은 기간 괄호를 뺀다
  const read = T.read(p.list.from, p.list.to, p.list.codes.length).replace('(~)', '')
  return h('div', { class: 'notice codes' }, h('p', {}, read), h('p', {}, T.again), said, steps, button(T.rereadButton, 'btn-2'))
}

/** '매일 저장할 엑셀 6개' 표 · 표 밑 줄 · 저장법 · 환자별 표 안내(시안 + design.md 10-6 ★ '꼭' 열) */
function reportsSection(): HTMLElement {
  const R = UIS_OPTIONS_TEXT.reports
  const C = R.columns
  const head = h('tr', {}, h('th', {}), h('th', {}, C.menu), h('th', {}, C.table), h('th', {}, C.file), h('th', {}, C.fills), h('th', {}, C.need))
  const lines = UIS_KINDS.map((kind, i) => {
    const r = R.rows[kind]
    return h(
      'tr',
      {},
      h('td', {}, String(i + 1)),
      h('td', {}, `${r.menu} › `, h('b', {}, r.name)),
      h(
        'td',
        {},
        r.table ?? R.oneTable,
        r.how && h('br'),
        r.how && h('span', { class: 'hint' }, r.how),
        UIS_PATIENT.includes(kind) && h('br'),
        UIS_PATIENT.includes(kind) && h('span', { class: 'pi' }, R.person),
      ),
      h('td', { class: 'fn' }, r.file),
      h('td', {}, r.fills),
      h('td', {}, UIS_REQUIRED.includes(kind) ? R.need.required : R.need.optional),
    )
  })
  return h(
    'section',
    { class: 'osec' },
    h('h2', {}, R.title),
    h('p', {}, R.intro(FOLDER)),
    h('table', { class: 'rtable' }, h('thead', {}, head), h('tbody', {}, ...lines)),
    h('p', { class: 'hint' }, R.suffix),
    h('div', { class: 'howto' }, ...R.howTo.map((line) => h('p', {}, line))),
    h('p', { class: 'priv' }, h('b', {}, R.privacy.strong), ` ${R.privacy.rest}`),
  )
}

/** 화면 전체(design.md 9-5 차례). focus = 다시 그린 뒤 포커스를 줄 칸 */
function render(p: Page, focus?: string) {
  const T = UIS_OPTIONS_TEXT
  const parts: Child[] = [
    h('p', { class: 'notice src' }, h('b', {}, T.source.strong), ` ${T.source.rest(FOLDER)}`),
    !p.everSaved && h('p', { class: 'notice first' }, h('b', {}, T.first.strong), ` ${T.first.rest}`),
    h('p', { class: 'lead-p' }, T.lead),
    codesBox(p),
    ...T.sections.map((s) =>
      h('section', { class: 'osec' }, h('h2', {}, s.title), h('p', {}, s.about), ...s.rows.map(([key, use]) => codeRow(p, key, use))),
    ),
    h('section', { class: 'osec' }, h('h2', {}, T.rsv.title), h('p', {}, T.rsv.about)),
    reportsSection(),
    h('p', { class: 'foot' }, T.foot),
  ]
  p.main.replaceChildren(...parts.filter((part): part is Node | string => Boolean(part)))
  if (focus) p.main.querySelector<HTMLElement>(focus)?.focus()
}

function renderStatus(p: Page) {
  const status = byId('optStatus')
  if (p.saveFailed) {
    status.className = 'status dirty failed'
    status.textContent = SHARED_TEXT.saveFailed
    return
  }
  status.className = 'status' + (p.dirty ? ' dirty' : p.everSaved ? ' saved' : '')
  status.textContent = p.dirty ? SHARED_TEXT.dirty : p.everSaved ? SHARED_TEXT.saved : SHARED_TEXT.never
}

/** 열린 찾기 칸 하나만 목록을 보이고 다른 것은 닫는다. 그 자리에서 내용만 바꿔 써서 치던 칸과 글자 자리가 그대로다 */
function showFind(p: Page) {
  const open = p.open
  const dd = open ? p.main.querySelector<HTMLElement>(`[data-dd="${open.key}-${open.kind}"]`) : null
  for (const other of p.main.querySelectorAll<HTMLElement>('.dd')) if (other !== dd) other.hidden = true
  if (!open || !dd) return
  const items = findItems(p, open.kind, open.key, open.text)
  dd.hidden = items.length === 0
  dd.replaceChildren(...items)
}

function closeFind(p: Page) {
  p.open = null
  showFind(p)
}

/** 화면 값을 바꿨다: 저장 안 함 상태로 */
function changed(p: Page) {
  p.dirty = true
  p.rev += 1
  renderStatus(p)
}

// --- 누르기 ---

function onInput(p: Page, event: Event) {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  const key = target.dataset.find
  const kind = target.dataset.kind
  if (isRowKey(key) && isKind(kind)) {
    p.open = { key, kind, text: target.value }
    showFind(p)
    return
  }
  const etc = target.dataset.etc
  if (isEtcKey(etc)) {
    p.settings.etcNames[etc] = target.value
    changed(p)
  }
}

function onClick(p: Page, event: Event) {
  const target = event.target
  if (!(target instanceof Element)) return
  if (target.closest('[data-reread]')) {
    void readCodes(p)
    return
  }
  const key = target.closest<HTMLElement>('[data-row]')?.dataset.row
  const kind = target.closest<HTMLElement>('[data-kind]')?.dataset.kind
  if (!isRowKey(key) || !isKind(kind)) return
  const add = target.closest<HTMLButtonElement>('[data-add]')
  if (add) {
    // 막힌 줄(고른 것 · 코드 꼴이 아닌 것)은 고르지 않는다
    const code = cleanCode(add.dataset.add ?? '')
    const mine = picksOf(p, kind, key)
    if (add.disabled || code === null || hasCode(mine, code) || mine.length >= MAX_CODES) return
    setPicks(p, kind, key, [...mine, code])
    p.open = null
    changed(p)
    render(p, `[data-find="${key}"][data-kind="${kind}"]`)
    return
  }
  const del = target.closest<HTMLElement>('[data-del]')
  if (del) {
    setPicks(
      p,
      kind,
      key,
      picksOf(p, kind, key).filter((code) => code !== del.dataset.del),
    )
    changed(p)
    render(p)
  }
}

/**
 * [코드 목록 읽기]·[코드 목록 다시 읽기](AC-4214.3): closing.uisCodes를 한 번 묻고, ok면 목록을 erpClosingUisCodes에 곧바로 쓴다
 * (기간이 null이면 글자로, 설정 [저장]과 따로 — 저장할 바꿈이 아니다). 그 밖은 결과 줄만 보이고 목록은 그대로다
 */
async function readCodes(p: Page) {
  if (p.reading) return
  p.reading = true
  p.said = null
  p.open = null
  render(p)
  const got = await askCodes(p.send)
  if (page !== p) return
  p.reading = false
  if ('code' in got) {
    p.said = { state: 'error', code: got.code }
  } else if (got.answer.state !== 'ok') {
    p.said = { state: got.answer.state, value: got.answer.value }
  } else {
    const { from, to, codes } = got.answer
    const list = normalizeCodes({ v: 1, from: from ?? to ?? '', to: to ?? from ?? '', codes })
    if (list) {
      try {
        await saveUisCodes(list)
      } catch {
        // 못 쓰면 이 화면에서만 쓴다(다음에 열면 다시 읽어야 한다)
      }
      if (page !== p) return
      setList(p, list)
    }
  }
  render(p, '[data-reread]')
}

/** [저장](AC-4214.4): erpClosingUis 한 칸에 정리한 모양으로 쓴다. 못 쓰면 저장 실패 글이고 바꾼 것 · 저장 안 함 상태는 그대로다 */
async function onSave(p: Page) {
  p.saveFailed = false
  const rev = p.rev
  let saved: UisSettings
  try {
    saved = await saveUis(p.settings)
  } catch {
    p.saveFailed = true
    renderStatus(p)
    return
  }
  if (page !== p) return
  p.everSaved = true
  if (p.rev === rev) {
    p.settings = copyOf(saved)
    p.dirty = false
  }
  p.open = null
  render(p)
  renderStatus(p)
}

/** 저장하지 않은 바꿈이 있으면 탭을 닫거나 새로고침할 때 크롬 나가기 확인 창을 띄운다(지금 비트 설정 화면과 같다) */
function onLeave(p: Page, event: BeforeUnloadEvent) {
  if (!p.dirty) return
  event.preventDefault()
  event.returnValue = ''
}

// --- 모양(시안에만 있는 것) ---

/** 시안 docs/mockups/erp-uisarang/index.html 설정 화면 모양 가운데 options.html에 없는 것 + 결과 줄 · 막힌 단추 */
const UIS_CSS = `
:root{--warning-soft:#FDF4E3}
.notice.src{background:var(--canvas);border:1px solid var(--line)}
.notice.src b{color:var(--ink);font-weight:600}
.notice.codes{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 16px;align-items:center;padding:0;font-size:13px;color:var(--muted)}
.notice.codes>*{grid-column:1}
.notice.codes .btn{grid-column:2;grid-row:1 / span 2}
.notice.nofile{background:var(--warning-soft);display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 16px;align-items:end}
.notice.nofile>*{grid-column:1}
.notice.nofile b{color:var(--warning);font-weight:600}
.notice.nofile .btn{grid-column:2;grid-row:1 / span 4;align-self:center}
.notice ol{list-style:decimal;padding-left:20px}
.notice .said{color:var(--warning);font-weight:600}
.notice .said.err{color:var(--negative)}
.notice .btn:disabled{color:var(--muted);background:var(--canvas);border:1px solid var(--line);cursor:default}
.kline{display:grid;grid-template-columns:100px minmax(0,1fr);gap:8px;align-items:start}
.kline .sub{font-size:12px;line-height:34px;color:var(--muted);white-space:nowrap}
.kline + .kline{border-top:1px dashed var(--line);padding-top:8px}
.hint{font-size:12px;line-height:18px;color:var(--muted)}
.opick>.hint{padding-left:108px}
.dd button em.frac{color:var(--warning);font-weight:600}
.dd .cnt{padding:4px 10px 6px;color:var(--warning);font-size:12px;line-height:17px;border-bottom:1px solid var(--line);margin-bottom:4px}
.rtable{width:100%;border-collapse:collapse;font-size:13px;line-height:19px;margin-top:10px}
.rtable th{font-size:12px;font-weight:500;color:var(--muted);text-align:left;padding:0 8px 6px}
.rtable td{border-top:1px solid var(--line);padding:8px;vertical-align:top;color:var(--ink-2)}
.rtable td:first-child{color:var(--muted);width:28px;text-align:right}
.rtable td b{font-weight:600;color:var(--ink)}
.rtable .pi{display:inline-block;margin-top:2px;font-size:12px;line-height:17px;color:var(--warning);font-weight:500}
.rtable .fn{white-space:nowrap}
.rtable + .hint{margin-top:6px}
.howto{margin-top:10px;display:flex;flex-direction:column;gap:4px;font-size:13px;line-height:20px;color:var(--ink-2)}
.priv{margin-top:10px;font-size:13px;line-height:20px;color:var(--ink-2);background:var(--canvas);border-radius:var(--r-control);padding:8px 12px}
.priv b{font-weight:600;color:var(--ink)}
`

function addStyle() {
  if (doc.head.querySelector('style[data-uis]')) return
  const style = doc.createElement('style')
  style.setAttribute('data-uis', '')
  style.textContent = UIS_CSS
  doc.head.append(style)
}

// --- 열기 ---

/** 열린 의사랑 화면을 닫는다(누르기 · 나가기 확인을 뗌). 비트 화면을 다시 열 때 options.ts가 부른다 */
export function stopUisOptions(): void {
  stop?.abort()
  stop = null
  page = null
}

/**
 * 의사랑 설정 화면을 연다(design.md 8-8): 저장한 의사랑 설정(없으면 처음 값 = 고른 코드 없음)과 기억해 둔 코드 목록을 그린다.
 * 도우미는 [코드 목록 읽기]를 누를 때만 부른다
 */
export async function startUisOptions(target: Document, deps: { send: Send }): Promise<void> {
  stopUisOptions()
  const controller = new AbortController()
  stop = controller
  const signal = controller.signal
  doc = target
  addStyle()
  const main = byId('optMain')
  const reset = doc.getElementById('optReset')
  if (reset) reset.hidden = true
  const ask = doc.getElementById('optAsk')
  if (ask) {
    ask.hidden = true
    ask.replaceChildren()
  }
  const [stored, list] = await Promise.all([loadUis().catch(() => null), loadUisCodes().catch(() => null)])
  if (signal.aborted) return
  const p: Page = {
    send: deps.send,
    main,
    settings: stored ? copyOf(stored) : uisEmpty(),
    everSaved: stored !== null,
    dirty: false,
    saveFailed: false,
    rev: 0,
    list: null,
    names: new Map(),
    reading: false,
    said: null,
    open: null,
  }
  setList(p, list)
  page = p

  main.addEventListener('input', (event) => onInput(p, event), { signal })
  main.addEventListener('click', (event) => onClick(p, event), { signal })
  byId('optSave').addEventListener('click', () => void onSave(p), { signal })
  doc.defaultView?.addEventListener('beforeunload', (event) => onLeave(p, event), { signal })
  doc.addEventListener(
    'click',
    (event) => {
      if (p.open && !(event.target instanceof Element && event.target.closest('.find'))) closeFind(p)
    },
    { signal },
  )
  doc.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape' && p.open) closeFind(p)
    },
    { signal },
  )
  render(p)
  renderStatus(p)
}
