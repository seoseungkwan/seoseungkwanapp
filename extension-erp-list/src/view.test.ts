// @vitest-environment jsdom
// spec erp-copy-list TASK-5: 목록 화면 그리기(view.ts)와 list.html 고정 글·모양(design.md 6절·7절)
// - AC-3901.7·AC-3903.1 list.html 고정 글은 상수와 글자 그대로, id·막힌 [엑셀로 받기]·시안 띠 없음·script 하나, 모양은 시안 <style> 그대로
// - AC-3904.2~3904.7 표·까닭·진료 0건·경고 상자·씨암·SONO 줄·요약 줄·밀기 줄, AC-3905.1·3905.2·3905.4 복사 꼬리·표시·누르는 칸
// - AC-3903.4·3903.6 세는 중·오류 안내, AC-3903.7 글은 모두 글자로(HTML로 읽지 않음)
// 목록 모양은 손으로 만든 것과 rows.ts buildList(지금 시험 도우미 sampleDay를 날짜·값만 바꾼 사흘)를 쓴다. 숫자는 지어낸 것이고 환자 정보는 없다
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sampleDay } from '../../extension-erp/src/__tests__/erpPage'
import { explain } from '../../extension-erp/src/errors'
import { FLOW_TEXT, TEXT } from '../../extension-erp/src/panel'
import { RANGE_TEXT } from '../../extension-erp/src/rangeView'
import { defaults } from '../../extension-erp/src/settings'
import type { ClosingDay } from '../../extension-erp/src/types'
import { dayHead, LIST_TEXT, TOAST_MS, WHY_ORDER, WHY_TEXT, type ListCell, type ListLine, type ListModel, type Why } from './listTypes'
import { buildList } from './rows'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const LIST_HTML = path.join(ROOT, 'extension-erp-list', 'list.html')
const MOCK = path.join(ROOT, 'docs', 'mockups', 'erp-copy-list', 'index.html')
const PANEL = path.join(ROOT, 'extension-erp', 'src', 'panel.ts')

// view.ts가 없을 때 파일 전체가 아니라 그 시험만 실패하게 시험 안에서 불러온다
const load = () => import('./view')

type Row = Extract<ListLine, { kind: 'row' }>

/** 빈칸을 한 칸으로 줄이고 앞뒤를 뗀다 */
const flat = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim()
const text = (el: Element | null | undefined) => flat(el?.textContent)

function must<T extends Element>(root: ParentNode, selector: string): T {
  const found = root.querySelector<T>(selector)
  if (!found) throw new Error(`${selector}를 찾지 못했다`)
  return found
}

/** list.html 원문 */
const listSource = () => readFileSync(LIST_HTML, 'utf8')
/** list.html을 문서로(스크립트는 돌지 않음) */
const listDoc = () => new DOMParser().parseFromString(listSource(), 'text/html')
/** <style> 안 글 */
const styleOf = (html: string) => /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? ''

// --- 손으로 만든 목록 모양(시안처럼 사흘, 첫날 11/1(일) 진료 0건) ---
const v = (value: string): ListCell => ({ value })
const w = (why: Why): ListCell => ({ why })
const all = (why: Why): ListCell[] => [w(why), w(why), w(why)]
const row = (key: string, section: string, name: string, col: string | null, cells: ListCell[], rowWhy: Why | null = null): Row => ({
  kind: 'row',
  key,
  section,
  name,
  col,
  cells,
  rowWhy,
})

/** 기타 줄 이름에 HTML 글자가 든 줄(AC-3903.7) */
const HTML_NAME = '<b>x</b>'
const WARNING = '11/3: 환불 33,000원이 있어요. 금액을 확인해 주세요.'
const OVERLAP = '함께 있는 진료 2건은 씨암·SONO 둘 다에 넣었어요.'

function handModel(over: Partial<ListModel> = {}): ListModel {
  const lines: ListLine[] = [
    { kind: 'journal', text: LIST_TEXT.journal1 },
    { kind: 'section', text: '진료 · 치료현황' },
    row('k0', '치료현황', '도수상담', null, [v('0'), v('4'), v('6')]),
    row('k1', '치료현황', '수술', null, all('unpicked'), 'unpicked'),
    { kind: 'section', text: '외래 수입' },
    row('k2', '외래 수입', '미수입금(+)', null, [v('0'), w('unknown'), v('12000')]),
    row('k3', '외래 수입', '외래 총매출', null, [v('0'), v('350000'), v('1234567')]),
    { kind: 'journal', text: LIST_TEXT.journal2 },
    { kind: 'section', text: '예약' },
    row('k4', '예약', '주사', '총갯수', [v('0'), v('11'), v('12')]),
    row('k5', '예약', '주사', '내원', [v('0'), v('9'), v('10')]),
    row('k6', '예약', '경과', '총갯수', [v('0'), v('21'), v('22')]),
    row('k7', '예약', '실예약환자수', null, [v('0'), v('77'), v('80')]),
    { kind: 'section', text: '치료별 신환/90일초진/재진 건수' },
    row('k8', '치료별 건수', '씨암(주사)', '신환', [v('0'), v('4'), v('2')]),
    row('k9', '치료별 건수', '기타2', '신환', all('noName'), 'noName'),
    { kind: 'section', text: LIST_TEXT.ops },
    row('k10', '운영 지표', '주사1회환자', null, all('unknown'), 'unknown'),
    { kind: 'section', text: '치료별 매출', sub: LIST_TEXT.salesSub },
    row('k11', '치료별 매출', '관절조영', null, all('held'), 'held'),
    row('k12', '치료별 매출', HTML_NAME, null, [v('0'), v('5000'), v('350000')]),
  ]
  return {
    from: '2026-11-01',
    to: '2026-11-03',
    days: [
      { date: '2026-11-01', zero: true },
      { date: '2026-11-02', zero: false },
      { date: '2026-11-03', zero: false },
    ],
    lines,
    rowCount: lines.filter((l) => l.kind === 'row').length,
    reasons: ['unpicked', 'unknown', 'held', 'noName'],
    warnings: [WARNING],
    overlap: OVERLAP,
    ...over,
  }
}

const rowsOf = (model: ListModel): Row[] => model.lines.filter((l): l is Row => l.kind === 'row')

/** 숫자 칸 모두 바꾼 복사본(글자·참거짓·null은 그대로) */
function mapNumbers<T>(value: T, f: (n: number) => number): T {
  if (typeof value === 'number') return f(value) as T
  if (Array.isArray(value)) return value.map((x) => mapNumbers(x, f)) as T
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, x]) => [k, mapNumbers(x, f)])) as T
  return value
}

/** sampleDay를 그 날짜로 옮긴 답(bump null = 진료 0건인 날). 경고·함께 있는 진료 없음 */
function dayOf(date: string, bump: number | null): ClosingDay {
  const day = mapNumbers(sampleDay(), (n) => (bump === null ? 0 : n + bump))
  day.date = date
  day.money.refund = 0
  day.inpatientVisits = 0
  day.overlap = null
  day.warnings = { moneyUnconfirmed: false, splitUnconfirmed: false, unpaidVisits: 0, unknownAge: 0, noHistory: false }
  return day
}

/** 처음 값 설정으로 만든 사흘 목록(131칸) */
const realModel = () => buildList([dayOf('2026-11-01', null), dayOf('2026-11-02', 1), dayOf('2026-11-03', 2)], defaults())

const MADE = '2026-11-24 09:07'

async function drawList(model: ListModel = handModel()) {
  const { renderList } = await load()
  const root = renderList(document, model, MADE)
  document.body.append(root)
  return root
}

/** 그 줄 순번·날짜의 숫자 칸 단추 */
const cellButton = (root: ParentNode, index: number, date: string) => root.querySelector<HTMLButtonElement>(`button.v[data-k="${index}|${date}"]`)

afterEach(() => {
  document.body.innerHTML = ''
  vi.useRealTimers()
})

describe('AC-3901.7·AC-3903.1 list.html 고정 글·틀', () => {
  it('AC-3901.7: 탭 제목·머리 h1 = LIST_TEXT.title, [설정 열기] = TEXT.openSettings, 날짜 이름 = RANGE_TEXT.pick.from·to, 단추 = LIST_TEXT.make·xlsx, 도움 줄 = RANGE_TEXT.pick.future, 맨 아래 = LIST_TEXT.foot', () => {
    const doc = listDoc()
    expect(doc.title).toBe(LIST_TEXT.title)
    expect(text(must(doc, '.top h1'))).toBe(LIST_TEXT.title)
    expect(text(must(doc, '#openSettings'))).toBe(TEXT.openSettings)
    expect(text(must<HTMLInputElement>(doc, '#from').closest('label'))).toBe(RANGE_TEXT.pick.from)
    expect(text(must<HTMLInputElement>(doc, '#to').closest('label'))).toBe(RANGE_TEXT.pick.to)
    expect(text(must(doc, '.ctrl .tilde'))).toBe('~')
    expect(text(must(doc, '#make'))).toBe(LIST_TEXT.make)
    expect(text(must(doc, '#xlsx'))).toBe(LIST_TEXT.xlsx)
    expect(text(must(doc, '#help'))).toBe(RANGE_TEXT.pick.future)
    expect(text(must(doc, '.foot'))).toBe(LIST_TEXT.foot)
  })

  it('AC-3903.1: id(openSettings·from·to·make·xlsx·help·stage·toast, main#listMain)가 있고 날짜 칸은 type=date, [엑셀로 받기]는 처음부터 막혀 있고 쪽지는 숨어 있다', () => {
    const doc = listDoc()
    for (const id of ['openSettings', 'from', 'to', 'make', 'xlsx', 'help', 'stage', 'toast', 'listMain']) {
      expect(doc.querySelectorAll(`#${id}`), id).toHaveLength(1)
    }
    expect(must(doc, '#listMain').tagName).toBe('MAIN')
    expect(must<HTMLInputElement>(doc, '#from').type).toBe('date')
    expect(must<HTMLInputElement>(doc, '#to').type).toBe('date')
    expect(must<HTMLButtonElement>(doc, '#xlsx').disabled).toBe(true)
    expect(must<HTMLButtonElement>(doc, '#make').disabled).toBe(false)
    expect(must(doc, '#toast').hasAttribute('hidden')).toBe(true)
    expect(must(doc, '#help').className).toBe('help')
    // 처음 안내는 스크립트가 그린다(#stage는 비어 있다)
    expect(text(must(doc, '#stage'))).toBe('')
  })

  it('AC-3901.7: 시안 띠(mock-bar)가 없고 script는 extension-erp-list/src/list.js 모듈 하나뿐이다(안에 쓴 스크립트 없음)', () => {
    const html = listSource()
    expect(html).not.toContain('mock-bar')
    expect(html).not.toContain('mockBar')
    const scripts = [...listDoc().querySelectorAll('script')]
    expect(scripts).toHaveLength(1)
    expect(scripts[0].getAttribute('type')).toBe('module')
    expect(scripts[0].getAttribute('src')).toBe('extension-erp-list/src/list.js')
    expect(text(scripts[0])).toBe('')
    expect(html).not.toMatch(/\son[a-z]+=/i) // 칸에 붙인 스크립트 없음
  })

  it('AC-3901.7: 모양은 시안 <style>에서 시안 띠 줄만 뺀 그대로이고, 경고 상자는 지금 panel.ts .warns 세 줄 + 상자 안 밀림(max-height 200px)이다', () => {
    const mine = styleOf(listSource())
    const mockLines = styleOf(readFileSync(MOCK, 'utf8'))
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l !== '' && !l.includes('mock-bar') && !l.includes('시안 상태 단추 줄'))
    expect(mockLines.length).toBeGreaterThan(80)
    for (const line of mockLines) expect(mine, line).toContain(line)
    const warns = readFileSync(PANEL, 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.startsWith('.warns'))
    expect(warns).toHaveLength(3)
    for (const line of warns) expect(mine, line).toContain(line)
    expect(mine).toMatch(/\.warns\{[^}]*max-height:200px[^}]*overflow:auto[^}]*\}/)
  })
})

describe('AC-3903.1·AC-3903.3·AC-3903.4·AC-3903.6 안내 상자', () => {
  it('AC-3903.1: renderHint는 파란 안내 세 줄(굵은 첫 줄 + 두 줄)이다', async () => {
    const { renderHint } = await load()
    const el = renderHint(document)
    expect(el.classList.contains('hint')).toBe(true)
    expect([...el.querySelectorAll('p')].map(text)).toEqual([LIST_TEXT.hint.lead, LIST_TEXT.hint.body, LIST_TEXT.hint.copy])
    expect(el.querySelector('p')?.className).toBe('lead')
  })

  it("AC-3903.3: renderFirst는 같은 안내 모양에 '처음 한 번…'·'설정 화면을 새 탭으로 열었어요.' 두 줄이다", async () => {
    const { renderFirst } = await load()
    const el = renderFirst(document)
    expect(el.classList.contains('hint')).toBe(true)
    expect([...el.querySelectorAll('p')].map(text)).toEqual([TEXT.first, LIST_TEXT.settingsOpened])
  })

  it("AC-3903.4: renderLoading은 '비트에서 읽는 중…' · '{N}일 중 {k}일' · 진행 막대 · [그만두기](누르면 알림)다", async () => {
    const { renderLoading } = await load()
    const onCancel = vi.fn()
    const el = renderLoading(document, 3, 1, onCancel)
    document.body.append(el)
    expect(text(must(el, '.lead'))).toBe(TEXT.reading)
    expect(text(must(el, 'b.nw'))).toBe(RANGE_TEXT.scanning.count(3, 1))
    expect(text(must(el, 'b.nw'))).toBe('3일 중 1일')
    expect(must<HTMLElement>(el, '.prog i').style.width).toBe('33%')
    const stop = must<HTMLButtonElement>(el, '.acts button')
    expect(text(stop)).toBe(RANGE_TEXT.scanning.cancel)
    expect(stop.type).toBe('button')
    stop.click()
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(must<HTMLElement>(renderLoading(document, 400, 0, onCancel), '.prog i').style.width).toBe('0%')
  })

  it("AC-3903.6: renderError는 굵은 빨강 '무엇이' · '어떻게'(explain) · '목록을 만들지 못했어요. (번호 …)'이고 번호 모양이 아니면 E-BRIDGE-BAD-REPLY다", async () => {
    const { renderError } = await load()
    const el = renderError(document, 'E-HELPER-MISSING')
    const e = explain('E-HELPER-MISSING')
    expect(el.classList.contains('err')).toBe(true)
    expect(el.getAttribute('role')).toBe('alert')
    expect([...el.querySelectorAll('p')].map(text)).toEqual([e.what, e.how, LIST_TEXT.failed('E-HELPER-MISSING')])
    expect(must(el, 'p').className).toBe('lead err')
    expect(text(must(el, '.small'))).toBe('목록을 만들지 못했어요. (번호 E-HELPER-MISSING)')
    const odd = renderError(document, '<b>x</b>')
    expect(text(must(odd, '.small'))).toBe(LIST_TEXT.failed('E-BRIDGE-BAD-REPLY'))
    expect(odd.querySelector('b')).toBeNull()
  })
})

describe('AC-3904.7·AC-3904.2·AC-3904.4 목록 위·표 머리·숫자 칸', () => {
  it("AC-3904.7: 요약 줄은 굵은 '{시작일} ~ {끝일}' + ' · {N}일 · 날마다 {R}칸', 작은 도움 줄, 오른쪽 '목록을 만든 때 …'(처음 값 설정 = 131칸)", async () => {
    const root = await drawList(realModel())
    const first = must(root, '.sum .l p')
    expect(text(must(first, 'b'))).toBe(LIST_TEXT.period('2026-11-01', '2026-11-03'))
    expect(text(first)).toBe('2026-11-01 ~ 2026-11-03 · 3일 · 날마다 131칸')
    expect(text(must(root, '.sum .l .small'))).toBe(LIST_TEXT.sumHelp)
    expect(text(must(root, '.sum .made'))).toBe(LIST_TEXT.madeAt(MADE))
    expect(root.querySelectorAll('tbody tr.r')).toHaveLength(131)
  })

  it('AC-3904.7: 상자 차례는 요약 → 경고 → 밀기 줄(처음엔 숨김) → 표 상자 → 빈 칸 까닭이다', async () => {
    const root = await drawList()
    expect([...root.children].map((c) => c.className)).toEqual(['sum', 'warns', 'slide', 'tbox', 'legend'])
    expect(text(must(root, '.slide'))).toBe(LIST_TEXT.slide)
    expect(must<HTMLElement>(root, '.slide').hidden).toBe(true)
    expect(must(root, '.tbox > table').className).toBe('tbl')
  })

  it("AC-3904.2·AC-3904.4: 머리는 '항목' 다음 날짜마다 '{M/D} ({요일})', 일요일은 .sun, 진료 0건인 날은 '진료 0건' 작은 줄과 title", async () => {
    const root = await drawList()
    const heads = [...root.querySelectorAll('thead th')]
    expect(heads.map(text)).toEqual([LIST_TEXT.head, `${dayHead('2026-11-01')}${LIST_TEXT.zero}`, dayHead('2026-11-02'), dayHead('2026-11-03')])
    expect(heads.map(text)).toEqual(['항목', '11/1 (일)진료 0건', '11/2 (월)', '11/3 (화)'])
    expect(heads[0].classList.contains('lab')).toBe(true)
    expect(heads[1].classList.contains('sun')).toBe(true)
    expect(heads[2].classList.contains('sun')).toBe(false)
    expect(text(must(heads[1], '.wd'))).toBe('(일)')
    expect(text(must(heads[1], '.zt'))).toBe(LIST_TEXT.zero)
    expect(heads[1].getAttribute('title')).toBe(FLOW_TEXT.zero('2026-11-01'))
    expect(heads[2].hasAttribute('title')).toBe(false)
    expect(heads[2].querySelector('.zt')).toBeNull()
  })

  it("AC-3904.2·AC-3904.4: 숫자 칸은 값 글자 그대로(쉼표 없음)인 단추(title '누르면 복사돼요', data-k = '{줄 순번}|{날짜}'), 진료 0건인 날 칸은 .z", async () => {
    const root = await drawList()
    const b = cellButton(root, 3, '2026-11-03')
    expect(text(b)).toBe('1234567')
    expect(b?.type).toBe('button')
    expect(b?.title).toBe(LIST_TEXT.copyTitle)
    expect(b?.classList.contains('v')).toBe(true)
    expect(b?.closest('td')?.classList.contains('z')).toBe(false)
    const zero = cellButton(root, 0, '2026-11-01')
    expect(text(zero)).toBe('0')
    expect(zero?.closest('td')?.classList.contains('z')).toBe(true)
    // 값 있는 칸마다 단추 하나
    const values = rowsOf(handModel()).reduce((n, r) => n + r.cells.filter((c) => 'value' in c).length, 0)
    expect(root.querySelectorAll('button.v')).toHaveLength(values)
  })

  it("AC-3904.1: 업무일지 줄 .s1, 머리 줄 .s2(치료별 매출 '금액(원)'은 .sub), 열 이름은 흐린 .cl, 열 여럿 표에서 줄 이름이 바뀌는 곳 .g", async () => {
    const root = await drawList()
    expect([...root.querySelectorAll('tr.s1 th')].map(text)).toEqual([LIST_TEXT.journal1, LIST_TEXT.journal2])
    expect([...root.querySelectorAll('tr.s2 th')].map(text)).toEqual([
      '진료 · 치료현황',
      '외래 수입',
      '예약',
      '치료별 신환/90일초진/재진 건수',
      LIST_TEXT.ops,
      `치료별 매출${LIST_TEXT.salesSub}`,
    ])
    expect(text(must(root, 'tr.s2 .sub'))).toBe(LIST_TEXT.salesSub)
    for (const tr of root.querySelectorAll('tr.s1, tr.s2')) expect(tr.querySelector('td')?.getAttribute('colspan')).toBe('3')
    const rows = [...root.querySelectorAll('tbody tr.r')]
    expect(rows.map((tr) => text(tr.querySelector('.nm')))).toEqual(rowsOf(handModel()).map((r) => (r.col ? `${r.name} ${r.col}` : r.name)))
    expect(text(rows[4].querySelector('.nm .cl'))).toBe('총갯수')
    expect(rows[7].querySelector('.cl')).toBeNull() // 실예약환자수
    expect(rows.map((tr) => tr.classList.contains('g'))).toEqual(rowsOf(handModel()).map((_, i) => i === 6 || i === 9))
  })
})

describe('AC-3904.3 빈 칸 까닭', () => {
  it('AC-3904.3: 모든 날 같은 까닭인 줄은 .off + 줄 이름 오른쪽 꼬리표(title 긴 글), 칸은 회색 빈 칸(.na, 안에 글 없음)', async () => {
    const root = await drawList()
    const rows = [...root.querySelectorAll('tbody tr.r')]
    for (const [i, why] of [
      [1, 'unpicked'],
      [9, 'noName'],
      [10, 'unknown'],
      [11, 'held'],
    ] as const) {
      const tr = rows[i]
      expect(tr.classList.contains('off'), why).toBe(true)
      const tag = must(tr, 'th.lab .lw .tag')
      expect(tag.className).toBe(`tag ${why}`)
      expect(text(tag)).toBe(WHY_TEXT[why].tag)
      expect(tag.getAttribute('title')).toBe(WHY_TEXT[why].help)
      const tds = [...tr.querySelectorAll('td')]
      expect(tds).toHaveLength(3)
      for (const td of tds) {
        expect(td.classList.contains('na')).toBe(true)
        expect(td.childNodes).toHaveLength(0)
      }
      expect(tr.querySelector('button')).toBeNull()
    }
    expect(rows[1].querySelectorAll('td')[0].classList.contains('z')).toBe(true)
  })

  it("AC-3904.3: 어떤 날만 빈 칸은 그 칸 안 작은 글(.nt '셀 수 없음', title 긴 글)이고 줄은 .off·꼬리표가 없다", async () => {
    const root = await drawList()
    const tr = [...root.querySelectorAll('tbody tr.r')][2]
    expect(tr.classList.contains('off')).toBe(false)
    expect(tr.querySelector('.tag')).toBeNull()
    const td = tr.querySelectorAll('td')[1]
    expect(td.classList.contains('na')).toBe(true)
    const note = must(td, 'span.nt')
    expect(text(note)).toBe(WHY_TEXT.unknown.cell)
    expect(note.getAttribute('title')).toBe(WHY_TEXT.unknown.help)
    expect(td.querySelector('button')).toBeNull()
    expect(text(cellButton(root, 2, '2026-11-03'))).toBe('12000')
  })

  it("AC-3904.3: '빈 칸 까닭' 상자는 나온 까닭만 unpicked → unknown → held → noName 차례로 꼬리표 + 긴 글", async () => {
    const root = await drawList()
    const legend = must(root, 'section.legend')
    expect(text(must(legend, 'h2'))).toBe(LIST_TEXT.legend)
    const items = [...legend.querySelectorAll('li')]
    expect(items.map((li) => text(li.querySelector('.tag')))).toEqual(WHY_ORDER.map((why) => WHY_TEXT[why].tag))
    expect(items.map((li) => li.querySelector('.tag')?.className)).toEqual(WHY_ORDER.map((why) => `tag ${why}`))
    // 글자는 그대로 넣는다(보류 글은 지금 보류 묶음이 비어 앞에 빈칸이 있다)
    expect(items.map((li) => li.querySelector('.tag + span')?.textContent)).toEqual(WHY_ORDER.map((why) => WHY_TEXT[why].help))
    // 나온 것만, 모양에 적힌 차례가 틀려도 WHY_ORDER 차례
    const some = await drawList(handModel({ reasons: ['noName', 'unpicked'], overlap: null }))
    expect([...some.querySelectorAll('.legend li .tag')].map(text)).toEqual([WHY_TEXT.unpicked.tag, WHY_TEXT.noName.tag])
  })
})

describe('AC-3904.5·AC-3904.6 경고 상자·씨암·SONO 줄', () => {
  it("AC-3904.5: 경고가 있으면 요약과 표 사이 경고 상자에 '{M/D}: {경고 글}'이 한 줄씩, 없으면 상자가 없다", async () => {
    const two = [WARNING, '11/3: 생년월일이 없는 환자 1명은 연령별 표에 넣지 않았어요.']
    const root = await drawList(handModel({ warnings: two }))
    expect([...root.querySelectorAll('ul.warns > li')].map(text)).toEqual(two)
    const none = await drawList(handModel({ warnings: [] }))
    expect(none.querySelector('.warns')).toBeNull()
  })

  it('AC-3904.6: 씨암·SONO 줄은 빈 칸 까닭 상자 끝(.ovl), 없으면 그 줄이 없다', async () => {
    const root = await drawList()
    const legend = must(root, '.legend')
    expect(text(must(legend, '.ovl'))).toBe(OVERLAP)
    expect(legend.lastElementChild?.className).toBe('ovl')
    const none = await drawList(handModel({ overlap: null }))
    expect(none.querySelector('.ovl')).toBeNull()
  })

  it('AC-3904.6: 빈 칸 까닭이 없고 씨암·SONO 줄만 있으면 상자에 제목·목록 없이 그 줄만, 둘 다 없으면 상자가 없다', async () => {
    const only = await drawList(handModel({ reasons: [] }))
    const legend = must(only, '.legend')
    expect(legend.querySelector('h2')).toBeNull()
    expect(legend.querySelector('ul')).toBeNull()
    expect([...legend.children].map((c) => c.className)).toEqual(['ovl'])
    const nothing = await drawList(handModel({ reasons: [], overlap: null }))
    expect(nothing.querySelector('.legend')).toBeNull()
  })
})

describe('AC-3904.7 밀기 줄', () => {
  it('AC-3904.7: syncSlide는 표 상자가 넓을 때만(scrollWidth > clientWidth + 1) 밀기 줄을 보인다', async () => {
    const { syncSlide } = await load()
    const root = await drawList()
    const box = must<HTMLElement>(root, '.tbox')
    const slide = must<HTMLElement>(root, '.slide')
    const size = (scroll: number, client: number) => {
      Object.defineProperty(box, 'scrollWidth', { configurable: true, value: scroll })
      Object.defineProperty(box, 'clientWidth', { configurable: true, value: client })
      syncSlide(root)
      return slide.hidden
    }
    expect(size(1000, 1000)).toBe(true)
    expect(size(1001, 1000)).toBe(true)
    expect(size(1002, 1000)).toBe(false)
    expect(size(900, 1000)).toBe(true)
  })
})

describe('AC-3905.4·AC-3905.1·AC-3905.2 누르는 칸·복사 꼬리·표시', () => {
  it('AC-3905.4: 빈 칸·줄 이름·머리·업무일지·상자 머리 줄에는 단추가 없다', async () => {
    const root = await drawList()
    expect(root.querySelectorAll('th button')).toHaveLength(0)
    expect(root.querySelectorAll('thead button')).toHaveLength(0)
    expect(root.querySelectorAll('tr.s1 button, tr.s2 button')).toHaveLength(0)
    expect(root.querySelectorAll('td.na button')).toHaveLength(0)
    expect(root.querySelectorAll('.sum button, .legend button, .warns button')).toHaveLength(0)
    for (const b of root.querySelectorAll('button')) expect(b.classList.contains('v')).toBe(true)
  })

  it("AC-3905.1: copyTail은 '{M/D} · {묶음} {줄}[ {열}] · {값}' — 시안 쪽지 '11/2 · 치료현황 도수상담 · 4'와 칸 '11/2 · 치료별 건수 씨암(주사) 신환 · 4'", async () => {
    const { copyTail } = await load()
    const model = handModel()
    const rows = rowsOf(model)
    expect(copyTail(model, rows[0], 1, '4')).toBe('11/2 · 치료현황 도수상담 · 4')
    expect(copyTail(model, rows[8], 1, '4')).toBe('11/2 · 치료별 건수 씨암(주사) 신환 · 4')
    expect(copyTail(model, rows[7], 1, '77')).toBe('11/2 · 예약 실예약환자수 · 77')
    expect(copyTail(model, rows[4], 2, '12')).toBe(LIST_TEXT.copyTail('11/3', '예약', '주사', '총갯수', '12'))
    expect(copyTail(model, rows[0], 0, '0')).toBe('11/1 · 치료현황 도수상담 · 0')
  })

  it('AC-3905.2: markCopied — 누른 칸은 .now, 그 전에 .now였던 칸은 .done(✓), 같은 칸을 다시 눌러도 .now 그대로', async () => {
    const { markCopied } = await load()
    const root = await drawList()
    const a = cellButton(root, 0, '2026-11-02') as HTMLButtonElement
    const b = cellButton(root, 3, '2026-11-03') as HTMLButtonElement
    markCopied(root, '0|2026-11-02')
    expect([...a.classList]).toEqual(['v', 'now'])
    markCopied(root, '3|2026-11-03')
    expect([...a.classList]).toEqual(['v', 'done'])
    expect([...b.classList]).toEqual(['v', 'now'])
    markCopied(root, '3|2026-11-03')
    expect([...b.classList]).toEqual(['v', 'now'])
    expect(root.querySelectorAll('.now')).toHaveLength(1)
    // 복사했던 칸을 다시 누르면 .done이 .now로
    markCopied(root, '0|2026-11-02')
    expect([...a.classList]).toEqual(['v', 'now'])
    expect([...b.classList]).toEqual(['v', 'done'])
  })

  it('AC-3905.1: showToast — 머리 b + 꼬리 span, TOAST_MS(1.8초) 뒤 숨김, 실패는 .bad, 새 쪽지는 시간을 다시 센다', async () => {
    vi.useFakeTimers()
    const { showToast } = await load()
    const toast = document.createElement('div')
    toast.id = 'toast'
    toast.className = 'toast'
    toast.hidden = true
    document.body.append(toast)
    expect(TOAST_MS).toBe(1800)
    showToast(toast, LIST_TEXT.copied, '11/2 · 치료현황 도수상담 · 4')
    expect(toast.hidden).toBe(false)
    expect(toast.className).toBe('toast')
    expect(text(must(toast, 'b'))).toBe(LIST_TEXT.copied)
    expect(text(must(toast, 'span'))).toBe('11/2 · 치료현황 도수상담 · 4')
    vi.advanceTimersByTime(TOAST_MS - 1)
    expect(toast.hidden).toBe(false)
    showToast(toast, LIST_TEXT.copyFailed, '', true)
    expect(toast.className).toBe('toast bad')
    expect(toast.querySelector('span')).toBeNull()
    expect(text(must(toast, 'b'))).toBe(LIST_TEXT.copyFailed)
    vi.advanceTimersByTime(TOAST_MS - 1)
    expect(toast.hidden).toBe(false)
    vi.advanceTimersByTime(1)
    expect(toast.hidden).toBe(true)
  })
})

describe('AC-3903.7 글은 모두 글자로', () => {
  it('AC-3903.7: 기타 줄 이름 <b>x</b>는 글자로 보이고(표 안에 b 요소 없음) 쪽지 꼬리도 글자다', async () => {
    const root = await drawList()
    const tr = [...root.querySelectorAll('tbody tr.r')][12]
    expect(text(tr.querySelector('.nm'))).toBe(HTML_NAME)
    expect(must(root, 'table').querySelector('b')).toBeNull()
    const { copyTail, showToast } = await load()
    const toast = document.createElement('div')
    document.body.append(toast)
    showToast(toast, LIST_TEXT.copied, copyTail(handModel(), rowsOf(handModel())[12], 1, '5000'))
    expect(toast.querySelectorAll('b')).toHaveLength(1)
    expect(text(must(toast, 'span'))).toBe(`11/2 · 치료별 매출 ${HTML_NAME} · 5000`)
  })
})
