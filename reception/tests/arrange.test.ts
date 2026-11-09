// @vitest-environment jsdom
// 어레인지 표 화면 arrange.js (TASK-9, REQ-3308·REQ-3312, design.md 4·10절). 승인 시안 docs/mockups/reception-arrange/Arrange.html의
// 글·차례·모양 그대로다(목업 띠·가짜 환자는 빼고). 누르기는 view.on…을 부르는 것만 본다(보내기·낙관적 그리기 잇기는 TASK-11 app.js).
// planOf(판, 쓰기)는 쓰기 하나를 판에 미리 얹은 모양·되돌리기 띠 글·되돌리기 쓰기를 준다(app.js가 쓴다). 자료는 가짜다(fixtures.ts)
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import * as fx from './fixtures'
import type { FakeBoard } from './fixtures'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const WWW = path.join(ROOT, 'reception', 'www')
/** C# 고르기 목록 ArrangeChoices가 사는 파일 (design.md 4절, TASK-4) */
const ARRANGE_MARKS_CS = path.join(ROOT, 'helper', 'src', 'Precheck.Core', 'Reception', 'ArrangeMarks.cs')
const MOCKUP = path.join(ROOT, 'docs', 'mockups', 'reception-arrange', 'Arrange.html')
const PHONE_MOCKUPS = path.join(ROOT, 'docs', 'mockups', 'reception-phone')

type Col = 'xray' | 'sono' | 'carm' | 'pt' | 'ds' | 'eswt' | 'trac'

interface Ask {
  k: string
  op: string
  col?: string
  v?: string
}

interface Plan {
  board: FakeBoard
  toast: string | null
  undo: Ask | null
}

interface Sheet {
  k: string
  col: string
  kind: 'add' | 'done' | 'part'
}

interface ArrangeView {
  tab?: string
  reading?: boolean
  sheet?: Sheet | null
  endedOpen?: boolean
  toast?: { text: string; undo: boolean } | null
  rxNew?: string[]
  flash?: string[]
  onTab?: (tab: string) => void
  onRefresh?: () => void
  onCell?: (k: string, col: string) => void
  onAdd?: (k: string, col: string, v: string) => void
  onPart?: (k: string, col: string, v: string) => void
  onSet?: (k: string, col: string, v: string) => void
  onRemove?: (k: string, col: string) => void
  onAway?: (k: string, v: string) => void
  onPtf?: (k: string, v: string) => void
  onEnd?: (k: string) => void
  onRestore?: (k: string) => void
  onChart?: (k: string) => void
  onUndo?: () => void
  onSheet?: (sheet: Sheet | null) => void
  onEnded?: (open: boolean) => void
}

interface ArrangeJs {
  renderArrange: (host: HTMLElement, board: FakeBoard, view?: ArrangeView) => HTMLElement
  planOf: (board: FakeBoard, ask: Ask) => Plan
  CHOICES: Record<string, string[]>
  PARTS: string[]
}

// 화면 파일은 빌드 없는 JS라 형 선언이 없다(design.md 결정 '화면은 빌드 없는 JS'). 경로를 값으로 두어 형 검사가 묻지 않게 한다
const ARRANGE_JS = '../www/arrange.js'
let view: ArrangeJs

beforeAll(async () => {
  // 아직 없으면(RED) 빈 것을 그리는 대역으로 시험마다 실패를 보인다
  const missing: ArrangeJs = {
    renderArrange: (host) => host.appendChild(document.createElement('div')),
    planOf: (board) => ({ board, toast: null, undo: null }),
    CHOICES: {},
    PARTS: [],
  }
  view = ((await import(/* @vite-ignore */ ARRANGE_JS).catch(() => missing)) ?? missing) as ArrangeJs
})

afterEach(() => {
  document.body.replaceChildren()
})

// ---- 시험 도구 --------------------------------------------------------------------------------------

/** 가짜 판의 화면 열쇠: 시안의 환자 a~j (fixtures.ts arrangeMockupBoard) */
const K = fx.ARRANGE_KEYS

/** index.html의 #app 자리 */
function appHost(): HTMLElement {
  const app = document.createElement('div')
  app.id = 'app'
  document.body.appendChild(app)
  return app
}

function draw(board: FakeBoard = fx.arrangeMockupBoard(), v: ArrangeView = {}) {
  const app = appHost()
  const page = view.renderArrange(app, board, v)
  return { app, page }
}

function textOf(root: ParentNode | null | undefined, selector: string): string | null {
  return root?.querySelector(selector)?.textContent?.trim() ?? null
}

function textsOf(root: ParentNode, selector: string): string[] {
  return [...root.querySelectorAll(selector)].map((n) => n.textContent?.trim() ?? '')
}

/** 바로 아래 아이들의 '태그.class' */
function shapeOf(node: Element | null | undefined): string[] {
  return [...(node?.children ?? [])].map((c) => `${c.tagName.toLowerCase()}${c.className ? `.${String(c.className).split(' ').join('.')}` : ''}`)
}

/** 표의 줄들 */
function trs(root: ParentNode): HTMLTableRowElement[] {
  return [...root.querySelectorAll<HTMLTableRowElement>('table.arr > tbody > tr')]
}

/** 이름으로 줄 찾기 */
function trOf(root: ParentNode, name: string): HTMLTableRowElement {
  const found = trs(root).find((tr) => textOf(tr, '.arr-name') === name)
  if (!found) throw new Error(`줄 ${name} 없음`)
  return found
}

function cellOf(root: ParentNode, name: string, col: Col): HTMLElement {
  const cell = trOf(root, name).querySelector<HTMLElement>(`:scope > td.c-${col} > .cell`)
  if (!cell) throw new Error(`${name} ${col} 칸 없음`)
  return cell
}

/** 칸 안의 아이 '태그.class:글' */
function cellParts(cell: Element): string[] {
  return [...cell.children].map((c) => `${c.tagName.toLowerCase()}.${String(c.className).split(' ').join('.')}:${c.textContent ?? ''}`)
}

function sheetOf(root: ParentNode): HTMLElement | null {
  return root.querySelector<HTMLElement>('.sheet-back > .sheet')
}

function optionsOf(root: ParentNode): string[] {
  return textsOf(root, '.sheet .opts > button.opt')
}

function pick(root: ParentNode, label: string) {
  const button = [...root.querySelectorAll<HTMLButtonElement>('.sheet .opts > button.opt')].find((b) => b.textContent === label)
  if (!button) throw new Error(`고르기 ${label} 없음`)
  button.click()
}

function nameOf(k: string): string {
  return fx.arrangeMockupBoard().lists.queue.concat(...Object.values(fx.arrangeMockupBoard().lists)).find((r) => r.k === k)!.name
}

/** 판에서 열쇠의 어레인지 줄 */
function arrRow(board: FakeBoard, k: string) {
  return board.arrange!.rows.find((r) => r.k === k) ?? null
}

// ---- 작은 CSS 읽개 (주석 지우기·@media 안까지 규칙 펼치기, shell.test.ts와 같다) -------------------------

type Rule = { selector: string; media: string; decls: [string, string][] }

function parseRules(css: string, media = ''): Rule[] {
  const rules: Rule[] = []
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '')
  let i = 0
  while (i < text.length) {
    const open = text.indexOf('{', i)
    if (open < 0) break
    const head = text.slice(i, open).trim()
    let depth = 1
    let j = open + 1
    while (j < text.length && depth > 0) {
      if (text[j] === '{') depth++
      else if (text[j] === '}') depth--
      j++
    }
    const body = text.slice(open + 1, j - 1)
    if (head.startsWith('@media')) rules.push(...parseRules(body, head))
    else
      rules.push({
        selector: head,
        media,
        decls: body
          .split(';')
          .map((d) => d.trim())
          .filter(Boolean)
          .map((d) => [d.slice(0, d.indexOf(':')).trim().toLowerCase(), d.slice(d.indexOf(':') + 1).trim()] as [string, string]),
      })
    i = j
  }
  return rules
}

function readWww(rel: string): string {
  const file = path.join(WWW, rel)
  return existsSync(file) ? readFileSync(file, 'utf8') : ''
}

const TABLET = '(min-width: 1000px) and (orientation: landscape)'

/** media 안(''은 밖)에서 selector(쉼표 목록 중 하나와 같은 글)의 prop 값. 뒤의 것이 이긴다 */
function cssValue(selector: string, prop: string, media: 'phone' | 'tablet' = 'phone'): string | undefined {
  return parseRules(readWww('style.css'))
    .filter((r) => (media === 'tablet' ? r.media.includes(TABLET) : r.media === ''))
    .filter((r) => r.selector.split(',').map((s) => s.trim()).includes(selector))
    .flatMap((r) => r.decls)
    .findLast(([p]) => p === prop)?.[1]
}

const HEX = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b/gi
function hexColors(text: string): string[] {
  return (text.match(HEX) ?? []).map((hex) => {
    let h = hex.slice(1).toUpperCase()
    if (h.length === 3) h = h.replace(/./g, (c) => c + c)
    return `#${h}`
  })
}

/** C# 파일의 글자 상수(보통 "…"·@"…")를 나온 차례대로 */
function csStrings(cs: string): string[] {
  const text = cs.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const out: string[] = []
  for (const m of text.matchAll(/@"((?:[^"]|"")*)"|"((?:[^"\\\n]|\\.)*)"/g)) {
    out.push(m[1] !== undefined ? m[1].replaceAll('""', '"') : m[2]!.replace(/\\(.)/g, '$1'))
  }
  return out
}

/** list가 strings 안에 끊김 없이 그 차례로 있는가 */
function hasRun(strings: string[], list: string[]): boolean {
  for (let i = 0; i + list.length <= strings.length; i += 1) if (list.every((s, j) => strings[i + j] === s)) return true
  return false
}

// ---- 시안의 글 (Arrange.html) -------------------------------------------------------------------------

const PARTS = ['목', '등', '허리', '오른 어깨', '왼 어깨', '양 어깨', '팔꿈치', '손목', '고관절', '오른 무릎', '왼 무릎', '양 무릎', '발목', '발바닥', '기타']
const LATER = '부위는 나중에'
const CHOICES: Record<Col, string[]> = {
  xray: ['X-ray 찍기'],
  sono: [...PARTS, LATER],
  carm: [...PARTS, LATER],
  pt: ['ICE', 'HP'],
  ds: ['30분', '50분'],
  eswt: ['1부위', '2부위', '3부위', '4부위'],
  trac: ['목', '허리'],
}
const COL_NAMES: Record<Col, string> = { xray: 'X-RAY', sono: 'SONO', carm: 'C-ARM', pt: 'PT', ds: '도수', eswt: '충격파', trac: '견인' }
const COLS: Col[] = ['xray', 'sono', 'carm', 'pt', 'ds', 'eswt', 'trac']
const HOWTO = [
  '치료 칸을 누르면 다음 단계로 넘어가요 (준비 → 준비완료 → 완료, 준비완료는 SONO·C-ARM만). X-RAY·SONO·C-ARM은 처방이 나오면 저절로 들어오고, PT·도수·충격파·견인은 빈 칸을 눌러 골라 넣어요.',
  '접수 시각을 누르면 자리비움, 성함을 누르면 오늘·직전 진료기록부가 열려요. [PT 먼저]는 누를 때마다 ↑ 올라감 → ↓ 내려옴 → 지움.',
]
const FOOT = '표시(준비완료·완료·자리비움·PT 먼저·치료 종료)는 의원 PC에만 남아요 · 비트 자료는 바뀌지 않아요'
const ACTIVE_NAMES = ['가상환자21', '가상환자22', '가상환자23', '가상환자24', '가상환자25', '가상환자26', '가상환자27', '가상환자28']

// ---- 머리 · 탭 (AC-3308.1) ---------------------------------------------------------------------------

describe('REQ-3308 어레인지 탭 머리', () => {
  it('AC-3308.1: 어레인지 화면 머리는 상표 줄(로고·연결됨·새로 고침) 아래 탭 단추 둘 [접수 현황]·[어레인지 N명]이고 [어레인지]가 aria-pressed="true"다. 문서 제목은 건드리지 않는다', () => {
    const { page } = draw()
    expect(page.className).toBe('page arrange')
    const top = page.querySelector(':scope > header.top')
    expect(shapeOf(top)).toEqual(['div.top-row', 'nav.tabs'])
    expect(shapeOf(top?.querySelector('.top-row'))).toEqual(['img.logo', 'div.top-status'])
    expect(textOf(top, '.top-status > span.conn')).toBe('연결됨')
    expect(top?.querySelector('.top-status > button.refresh')).not.toBeNull()
    const tabs = [...(top?.querySelectorAll<HTMLButtonElement>('nav.tabs > button.tab') ?? [])]
    expect(tabs.map((t) => t.tagName)).toEqual(['BUTTON', 'BUTTON'])
    expect(tabs.map((t) => t.getAttribute('type'))).toEqual(['button', 'button'])
    expect(tabs.map((t) => t.textContent)).toEqual(['접수 현황', '어레인지8명'])
    expect(textOf(tabs[1], ':scope > span.tab-n')).toBe('8명')
    expect(tabs.map((t) => t.getAttribute('aria-pressed'))).toEqual(['false', 'true'])
    expect(document.title).toBe('')
  })

  it('AC-3308.1: 탭을 누르면 onTab(board|arrange)을 부르고, [새로 고침]은 onRefresh를 한 번 부른 뒤 "읽는 중…"이다', () => {
    const onTab = vi.fn()
    const onRefresh = vi.fn()
    const { page } = draw(fx.arrangeMockupBoard(), { onTab, onRefresh })
    const tabs = [...page.querySelectorAll<HTMLButtonElement>('nav.tabs > button.tab')]
    tabs[0]!.click()
    expect(onTab).toHaveBeenLastCalledWith('board')
    tabs[1]!.click()
    expect(onTab).toHaveBeenLastCalledWith('arrange')
    expect(onTab).toHaveBeenCalledTimes(2)
    const refresh = page.querySelector<HTMLButtonElement>('header.top button.refresh')!
    refresh.click()
    refresh.click()
    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(refresh.disabled).toBe(true)
    expect(refresh.textContent).toBe('읽는 중…')
  })
})

// ---- 표 화면 (AC-3308.2 · 3308.3) ---------------------------------------------------------------------

describe('REQ-3308 어레인지 표', () => {
  it('AC-3308.2: 시안 차례대로 머리·기준 시각 줄(기준 글 + 표시 뜻 여섯)·쓰는 법 두 줄·표·[오늘 치료 종료 N명]·아래 글이 있다', () => {
    const { app, page } = draw()
    expect(app.children.length).toBe(1)
    expect(app.firstElementChild).toBe(page)
    expect(shapeOf(page)).toEqual(['header.top', 'div.sub-line', 'p.howto', 'div.wrap', 'p.empty-note', 'section.ended', 'footer.foot'])
    expect(shapeOf(page.querySelector('.sub-line'))).toEqual(['span.asof', 'span.legend'])
    expect(textOf(page, '.sub-line > span.asof')).toBe('11:04:15 기준 · 5초마다 저절로 바뀌어요')
    expect(shapeOf(page.querySelector('.legend'))).toEqual(['span.lg.todo', 'span.lg.ready', 'span.lg.done', 'span.lg.manual', 'span.lg.away', 'span.lg.ptup'])
    expect(textsOf(page, '.legend > span.lg')).toEqual(['준비', '준비완료', '✓ 완료', '직접 넣음', '자리비움', '↑ PT 먼저'])
    const howto = page.querySelector('p.howto')!
    expect([...howto.childNodes].map((n) => (n instanceof Element ? n.tagName.toLowerCase() : n.textContent))).toEqual([HOWTO[0], 'br', HOWTO[1]])
    expect(shapeOf(page.querySelector('.wrap'))).toEqual(['table.arr'])
    expect(page.querySelector<HTMLElement>('p.empty-note')!.hidden).toBe(true)
    expect(textOf(page, 'p.empty-note')).toBe('지금 안내할 환자가 없어요')
    expect(textOf(page, 'footer.foot')).toBe(FOOT)
  })

  it('AC-3308.2: 표 머리는 접수(누르면 자리비움)·성함·X-RAY·SONO·C-ARM(부위·준비·순서)·PT(ICE·HP)·도수(30·50분)·충격파(부위 수)·견인(목·허리)·비고(접수 메모 · 지난번 증상)·빈 머리다', () => {
    const { page } = draw()
    const ths = [...page.querySelectorAll('table.arr > thead > tr > th')]
    expect(ths.map((th) => th.className)).toEqual(['c-t', 'c-nm', 'c-xray', 'c-sono', 'c-carm', 'c-pt', 'c-ds', 'c-eswt', 'c-trac', 'c-memo', 'c-end'])
    expect(ths.map((th) => [th.firstChild?.nodeType === Node.TEXT_NODE ? th.firstChild.textContent : '', th.querySelector(':scope > span.sm')?.textContent ?? null])).toEqual([
      ['접수', '누르면 자리비움'],
      ['성함', null],
      ['X-RAY', null],
      ['SONO', '부위·준비·순서'],
      ['C-ARM', '부위·준비·순서'],
      ['PT', 'ICE·HP'],
      ['도수', '30·50분'],
      ['충격파', '부위 수'],
      ['견인', '목·허리'],
      ['비고', '접수 메모 · 지난번 증상'],
      ['', null],
    ])
  })

  it('AC-3308.2: [오늘 치료 종료 N명]은 접힌 단추(aria-expanded)이고 누르면 그 자리에서 펼쳐 끝난 줄(종료 시각·이름·차트번호·[다시 넣기])을 보이며 onEnded(펼침)를 부른다', () => {
    const onEnded = vi.fn()
    const { page } = draw(fx.arrangeMockupBoard(), { onEnded })
    const toggle = () => page.querySelector<HTMLButtonElement>('section.ended > button.ended-h')!
    expect(toggle().getAttribute('type')).toBe('button')
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
    expect(toggle().textContent).toBe('오늘 치료 종료 2명 ▾')
    expect(shapeOf(page.querySelector('section.ended'))).toEqual(['button.ended-h'])
    toggle().click()
    expect(onEnded).toHaveBeenLastCalledWith(true)
    expect(toggle().getAttribute('aria-expanded')).toBe('true')
    expect(toggle().textContent).toBe('오늘 치료 종료 2명 ▴')
    const items = [...page.querySelectorAll('section.ended > ul.ended-list > li')]
    expect(items.map((li) => shapeOf(li))).toEqual([
      ['span.e-t', 'span.e-n', 'span.e-c', 'button.restore'],
      ['span.e-t', 'span.e-n', 'span.e-c', 'button.restore'],
    ])
    expect(items.map((li) => textsOf(li, ':scope > *'))).toEqual([
      ['10:40 종료', '가상환자30', '910030', '다시 넣기'],
      ['10:15 종료', '가상환자29', '910029', '다시 넣기'],
    ])
    toggle().click()
    expect(onEnded).toHaveBeenLastCalledWith(false)
    expect(page.querySelector('section.ended > ul')).toBeNull()

    // 펼친 채 그리기(view.endedOpen)·끝난 줄이 없으면 "아직 없어요"
    const open = draw(fx.arrangeMockupBoard(), { endedOpen: true }).page
    expect(open.querySelectorAll('section.ended li').length).toBe(2)
    const empty = draw(fx.withArrange(fx.arrangeMockupBoard(), { rows: [], ended: [] }), { endedOpen: true }).page
    expect(textOf(empty, 'section.ended > button.ended-h')).toBe('오늘 치료 종료 0명 ▴')
    expect(textOf(empty, 'section.ended > p.empty-note')).toBe('아직 없어요')
    expect(empty.querySelector<HTMLElement>(':scope > p.empty-note')!.hidden).toBe(false)
    expect(trs(empty)).toEqual([])
  })

  it('AC-3308.3: 줄은 판의 arrange.rows 차례(접수 순)이고, 목록 줄이 없는 열쇠는 그리지 않는다', () => {
    const { page } = draw()
    expect(textsOf(page, 'table.arr > tbody > tr .arr-name')).toEqual(ACTIVE_NAMES)
    expect(trs(page).map((tr) => tr.getAttribute('data-k'))).toEqual([K.a, K.b, K.c, K.d, K.e, K.f, K.g, K.h])
    expect(trs(page).every((tr) => shapeOf(tr).join() === ['td.c-t', 'td.c-nm', ...COLS.map((c) => `td.c-${c}`), 'td.c-memo', 'td.c-end'].join())).toBe(true)
    const board = fx.arrangeMockupBoard()
    board.arrange!.rows.push({ ...board.arrange!.rows[0]!, k: fx.fakeKey(99) })
    expect(textsOf(draw(board).page, 'table.arr > tbody > tr .arr-name')).toEqual(ACTIVE_NAMES)
  })

  it('AC-3308.3: 접수 칸은 접수 시각 단추이고, 자리비움이면 "자리비움"과 그 시각이 더 있고 줄이 away다', () => {
    const { page } = draw()
    const plain = trOf(page, '가상환자21').querySelector('td.c-t > button.t-btn')!
    expect(plain.getAttribute('type')).toBe('button')
    expect(shapeOf(plain)).toEqual(['span.t-time'])
    expect(textOf(plain, '.t-time')).toBe('09:12')
    expect(trOf(page, '가상환자21').classList.contains('away')).toBe(false)
    const away = trOf(page, '가상환자24')
    expect(away.classList.contains('away')).toBe(true)
    const button = away.querySelector('td.c-t > button.t-btn')!
    expect(shapeOf(button)).toEqual(['span.t-time', 'span.away-tag'])
    expect(textOf(button, '.t-time')).toBe('10:02')
    const tag = button.querySelector('.away-tag')!
    expect([...tag.childNodes].map((n) => (n instanceof Element ? n.tagName.toLowerCase() : n.textContent))).toEqual(['자리비움', 'br', '10:50'])
  })

  it('AC-3308.3: 성함 칸은 기록부 여는 단추(차트번호·상태 이름표 / 이름·"나이 · 성별"·신환 표시·›)와 그 아래 따로 [PT 먼저] 단추다', () => {
    const { page } = draw()
    const cell = trOf(page, '가상환자23').querySelector('td.c-nm')!
    expect(shapeOf(cell)).toEqual(['button.nm-btn', 'button.ptf-btn.none'])
    const nm = cell.querySelector('button.nm-btn')!
    expect(nm.getAttribute('type')).toBe('button')
    expect(shapeOf(nm)).toEqual(['span.l1', 'span.l2'])
    expect(shapeOf(nm.querySelector('.l1'))).toEqual(['span.chart', 'span.status.status-hold'])
    expect(textsOf(nm, '.l1 > span')).toEqual(['910023', '진료보류'])
    expect(shapeOf(nm.querySelector('.l2'))).toEqual(['span.arr-name', 'span.meta', 'span.new-badge', 'span.open'])
    expect(textsOf(nm, '.l2 > span')).toEqual(['가상환자23', '38 · 여', '신환', '›'])
    expect(nm.querySelector('.open')?.getAttribute('aria-hidden')).toBe('true')
    // 재진은 신환 표시가 없고, 상태 이름표는 줄의 칸 모양이다
    const again = trOf(page, '가상환자21').querySelector('button.nm-btn')!
    expect(shapeOf(again.querySelector('.l2'))).toEqual(['span.arr-name', 'span.meta', 'span.open'])
    expect(textsOf(again, '.l1 > span')).toEqual(['910021', '수납완료'])
    expect(again.querySelector('.l1 > .status')?.className).toBe('status status-done')
    expect(textOf(again, '.meta')).toBe('64 · 여')
    expect(trOf(page, '가상환자22').querySelector('.l1 > .status')?.className).toBe('status status-pay')
    expect(trOf(page, '가상환자26').querySelector('.l1 > .status')?.className).toBe('status status-wait')
  })

  it('AC-3308.3 · AC-3310.2: view.rxNew의 줄은 성함 칸 첫 줄에 "처방 나옴" 이름표가 있고, view.flash의 줄은 반짝(flash)이다', () => {
    const { page } = draw(fx.arrangeMockupBoard(), { rxNew: [K.e], flash: [K.e] })
    const tr = trOf(page, '가상환자25')
    expect(shapeOf(tr.querySelector('.nm-btn > .l1'))).toEqual(['span.chart', 'span.status.status-hold', 'span.rx-new'])
    expect(textOf(tr, '.rx-new')).toBe('처방 나옴')
    expect(tr.classList.contains('flash')).toBe(true)
    expect(page.querySelectorAll('.rx-new').length).toBe(1)
    expect(page.querySelectorAll('tr.flash').length).toBe(1)
    const plain = draw(fx.arrangeMockupBoard(), { rxNew: [K.e] }).page
    expect(plain.querySelectorAll('tr.flash').length).toBe(0)
    expect(plain.querySelectorAll('.rx-new').length).toBe(1)
  })

  it('AC-3308.3: 비고 칸은 메모 상자(있을 때)와 "지난번 …"(줄은 " / "로 이음), 지난 증상이 없으면 "첫 방문이라 지난 증상이 없어요"다. 끝 칸은 [치료 종료]이고 allDone이면 노랑(is-go)이다', () => {
    const { page } = draw()
    const memo = trOf(page, '가상환자21').querySelector('td.c-memo')!
    expect(shapeOf(memo)).toEqual(['div.arr-memo', 'div.lastsym'])
    expect(textOf(memo, '.arr-memo')).toBe('오른 무릎 주사 2차')
    expect(shapeOf(memo.querySelector('.lastsym'))).toEqual(['span.lastsym-label'])
    expect(textOf(memo, '.lastsym-label')).toBe('지난번')
    expect(textOf(memo, '.lastsym')).toBe('지난번Rt knee pain / 계단·앉았다 일어날 때 심함 / xr: OA gr.2')
    // 메모가 없으면 상자도 없다
    expect(shapeOf(trOf(page, '가상환자26').querySelector('td.c-memo'))).toEqual(['div.lastsym'])
    const first = trOf(page, '가상환자23').querySelector('td.c-memo .lastsym')!
    expect(first.textContent).toBe('첫 방문이라 지난 증상이 없어요')
    expect(first.querySelector('.lastsym-label')).toBeNull()

    const ends = trs(page).map((tr) => tr.querySelector<HTMLButtonElement>('td.c-end > button.end-btn')!)
    expect(ends.map((b) => [b.getAttribute('type'), b.textContent, b.className])).toEqual(
      ACTIVE_NAMES.map((_, i) => ['button', '치료종료', i === 0 ? 'end-btn is-go' : 'end-btn']),
    )
    expect([...ends[0]!.childNodes].map((n) => (n instanceof Element ? n.tagName.toLowerCase() : n.textContent))).toEqual(['치료', 'br', '종료'])
  })
})

// ---- 칸 (AC-3308.4) -----------------------------------------------------------------------------------

describe('REQ-3308 치료 칸 그리기', () => {
  it('AC-3308.4: 빈 칸은 "+", 준비(todo)는 "준비"와 글, 준비완료(ready)는 "준비완료 HH:MM"과 부위, 완료(done)는 "✓ HH:MM"과 작은 글이다', () => {
    const { page } = draw()
    const empty = cellOf(page, '가상환자28', 'xray')
    expect(empty.className).toBe('cell empty')
    expect(cellParts(empty)).toEqual(['span.plus:+'])

    expect(cellOf(page, '가상환자21', 'xray').className).toBe('cell done')
    expect(cellParts(cellOf(page, '가상환자21', 'xray'))).toEqual(['span.st:✓ 09:35'])
    expect(cellParts(cellOf(page, '가상환자21', 'sono'))).toEqual(['span.st:✓ 09:55', 'span.det.sm:오른 무릎'])
    expect(cellParts(cellOf(page, '가상환자21', 'pt'))).toEqual(['span.st:✓ 10:10', 'span.det.sm:HP'])

    expect(cellOf(page, '가상환자22', 'carm').className).toBe('cell ready')
    expect(cellParts(cellOf(page, '가상환자22', 'carm'))).toEqual(['span.ord:1번', 'span.st:준비완료 11:01', 'span.det:허리 L4-5'])

    expect(cellOf(page, '가상환자22', 'pt').className).toBe('cell todo')
    expect(cellParts(cellOf(page, '가상환자22', 'pt'))).toEqual(['span.st:준비', 'span.det:HP'])
    expect(cellParts(cellOf(page, '가상환자22', 'trac'))).toEqual(['span.st:준비', 'span.det:허리'])
    expect(cellParts(cellOf(page, '가상환자25', 'carm'))).toEqual(['span.ord:2번', 'span.st:준비', 'span.det:목 C5-6'])
  })

  it('AC-3308.4: SONO·C-ARM에 부위가 없으면 [부위 고르기] 단추, 순서(ord)는 왼쪽 위 "N번"이다. 다른 칸은 부위 단추가 없다', () => {
    const { page } = draw()
    const sono = cellOf(page, '가상환자23', 'sono')
    expect(sono.className).toBe('cell todo')
    expect(cellParts(sono)).toEqual(['span.ord:1번', 'span.st:준비', 'button.part-btn:부위 고르기'])
    expect(sono.querySelector('button.part-btn')?.getAttribute('type')).toBe('button')
    expect(page.querySelectorAll('button.part-btn').length).toBe(1)
    // 준비완료여도 부위가 없으면 단추
    const board = fx.arrangeMockupBoard()
    arrRow(board, K.b)!.cells.carm!.part = null
    expect(cellParts(cellOf(draw(board).page, '가상환자22', 'carm'))).toEqual(['span.ord:1번', 'span.st:준비완료 11:01', 'button.part-btn:부위 고르기'])
  })

  it('AC-3308.4: 칸 시각을 모르면(at null) "준비"·"준비완료"·"✓"만 쓰고 시각 자리에 null 글자를 쓰지 않는다', () => {
    const board = fx.arrangeMockupBoard()
    arrRow(board, K.b)!.cells.carm!.at = null
    arrRow(board, K.b)!.cells.pt!.at = null
    arrRow(board, K.a)!.cells.xray!.at = null
    const { page } = draw(board)
    expect(cellParts(cellOf(page, '가상환자22', 'carm'))).toEqual(['span.ord:1번', 'span.st:준비완료', 'span.det:허리 L4-5'])
    expect(cellParts(cellOf(page, '가상환자22', 'pt'))).toEqual(['span.st:준비', 'span.det:HP'])
    expect(cellParts(cellOf(page, '가상환자21', 'xray'))).toEqual(['span.st:✓'])
    expect(page.textContent).not.toContain('null')
  })

  it('AC-3308.4: X-RAY·SONO·C-ARM에 직접 넣은 칸은 점선(manual)과 "직접"이고, 직접 칸(PT·도수·충격파·견인)은 manual이어도 점선·"직접"이 없다', () => {
    const { page } = draw()
    const xray = cellOf(page, '가상환자24', 'xray')
    expect(xray.className).toBe('cell done manual')
    expect(cellParts(xray)).toEqual(['span.mn:직접', 'span.st:✓ 10:28'])
    const sono = cellOf(page, '가상환자27', 'sono')
    expect(sono.className).toBe('cell todo manual')
    expect(cellParts(sono)).toEqual(['span.ord:2번', 'span.mn:직접', 'span.st:준비', 'span.det:왼 어깨'])
    for (const [name, col] of [
      ['가상환자22', 'pt'],
      ['가상환자22', 'trac'],
      ['가상환자24', 'ds'],
      ['가상환자23', 'eswt'],
    ] as const) {
      const cell = cellOf(page, name, col)
      expect(cell.classList.contains('manual'), `${name} ${col}`).toBe(false)
      expect(cell.querySelector('.mn'), `${name} ${col}`).toBeNull()
    }
  })

  it('AC-3308.4: 칸은 누르는 곳(role=button, tabindex=0)이고 SONO 칸은 c-sono, C-ARM 칸은 c-carm 자리에 있다', () => {
    const { page } = draw()
    const cells = [...page.querySelectorAll<HTMLElement>('table.arr > tbody .cell')]
    expect(cells.length).toBe(ACTIVE_NAMES.length * COLS.length)
    for (const cell of cells) {
      expect(cell.getAttribute('role')).toBe('button')
      expect(cell.getAttribute('tabindex')).toBe('0')
    }
    expect(cellOf(page, '가상환자23', 'sono').parentElement?.className).toBe('c-sono')
    expect(cellOf(page, '가상환자22', 'carm').parentElement?.className).toBe('c-carm')
    expect(cellOf(page, '가상환자28', 'xray').getAttribute('aria-label')).toBe('X-RAY 넣기')
  })
})

// ---- 누르기 (AC-3308.5 ~ 3308.8 · 3308.13) ---------------------------------------------------------------

describe('REQ-3308 칸 누르기', () => {
  it('AC-3308.5: 준비·준비완료 칸을 누르면(Enter·Space 포함) onCell(열쇠, 칸)을 한 번 부르고 기록부는 열지 않는다', () => {
    const onCell = vi.fn()
    const onChart = vi.fn()
    const { page } = draw(fx.arrangeMockupBoard(), { onCell, onChart })
    cellOf(page, '가상환자22', 'carm').click()
    expect(onCell).toHaveBeenLastCalledWith(K.b, 'carm')
    cellOf(page, '가상환자23', 'pt').click()
    expect(onCell).toHaveBeenLastCalledWith(K.c, 'pt')
    cellOf(page, '가상환자23', 'eswt').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(onCell).toHaveBeenLastCalledWith(K.c, 'eswt')
    cellOf(page, '가상환자22', 'trac').dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))
    expect(onCell).toHaveBeenLastCalledWith(K.b, 'trac')
    expect(onCell).toHaveBeenCalledTimes(4)
    expect(onChart).not.toHaveBeenCalled()
    expect(sheetOf(page)).toBeNull()
  })

  it('AC-3308.5: planOf(step)은 SONO·C-ARM 준비 → 준비완료, 준비완료 → 완료, 다른 칸 준비 → 완료로 미리 그리고(시각은 판의 at), 띠 "{이름} · {칸} {준비완료로|완료로} 바꿨어요"와 앞 단계로 가는 set을 준다', () => {
    const board = fx.arrangeMockupBoard()
    const before = JSON.stringify(board)
    const sono = view.planOf(board, { k: K.c, op: 'step', col: 'sono' })
    expect(arrRow(sono.board, K.c)!.cells.sono).toMatchObject({ st: 'ready', at: '11:04' })
    expect(sono.toast).toBe('가상환자23 · SONO 준비완료로 바꿨어요')
    expect(sono.undo).toEqual({ k: K.c, op: 'set', col: 'sono', v: 'todo' })

    const carm = view.planOf(board, { k: K.b, op: 'step', col: 'carm' })
    expect(arrRow(carm.board, K.b)!.cells.carm).toMatchObject({ st: 'done', at: '11:04', ord: null })
    expect(carm.toast).toBe('가상환자22 · C-ARM 완료로 바꿨어요')
    expect(carm.undo).toEqual({ k: K.b, op: 'set', col: 'carm', v: 'ready' })

    const pt = view.planOf(board, { k: K.c, op: 'step', col: 'pt' })
    expect(arrRow(pt.board, K.c)!.cells.pt).toMatchObject({ st: 'done', at: '11:04', det: 'ICE' })
    expect(pt.toast).toBe('가상환자23 · PT 완료로 바꿨어요')
    expect(pt.undo).toEqual({ k: K.c, op: 'set', col: 'pt', v: 'todo' })

    // 모두 끝나면 allDone
    const ds = view.planOf(board, { k: K.d, op: 'step', col: 'ds' })
    expect(arrRow(ds.board, K.d)!.allDone).toBe(true)
    expect(arrRow(board, K.d)!.allDone).toBe(false)
    // 받은 판은 바꾸지 않는다
    expect(JSON.stringify(board)).toBe(before)
  })

  it('AC-3308.6: 완료 칸을 누르면 고르기 창 "{칸} · 완료"에 [준비로 되돌리기]·[준비완료로 되돌리기](SONO·C-ARM만)·[칸에서 빼기](직접 넣은 칸만)·[닫기]가 나온다', () => {
    const onSheet = vi.fn()
    const onCell = vi.fn()
    const { page } = draw(fx.arrangeMockupBoard(), { onSheet, onCell })
    cellOf(page, '가상환자21', 'sono').click()
    expect(onCell).not.toHaveBeenCalled()
    expect(onSheet).toHaveBeenLastCalledWith({ k: K.a, col: 'sono', kind: 'done' })
    const sheet = sheetOf(page)!
    expect(sheet.getAttribute('role')).toBe('dialog')
    expect(sheet.getAttribute('aria-modal')).toBe('true')
    expect(sheet.getAttribute('aria-label')).toBe('SONO · 완료')
    expect(shapeOf(sheet)).toEqual(['div.sheet-h', 'div.opts', 'button.sheet-x'])
    expect(textsOf(sheet, '.sheet-h > span')).toEqual(['SONO · 완료', '가상환자21 · 09:55에 완료로 바꿨어요'])
    expect(optionsOf(page)).toEqual(['준비로 되돌리기', '준비완료로 되돌리기'])
    expect(textOf(sheet, 'button.sheet-x')).toBe('닫기')
    expect(page.querySelectorAll('.sheet-back').length).toBe(1)

    const options = (name: string, col: Col) => {
      const p = draw().page
      cellOf(p, name, col).click()
      return optionsOf(p)
    }
    expect(options('가상환자21', 'xray')).toEqual(['준비로 되돌리기'])
    expect(options('가상환자21', 'pt')).toEqual(['준비로 되돌리기', '칸에서 빼기'])
    expect(options('가상환자24', 'xray')).toEqual(['준비로 되돌리기', '칸에서 빼기'])
  })

  it('AC-3308.6: 고르면 창을 닫고(onSheet(null)) onSet(열쇠, 칸, todo|ready)·onRemove(열쇠, 칸)를 부른다. [닫기]·바깥 누름·Esc는 닫기만 한다', () => {
    const onSheet = vi.fn()
    const onSet = vi.fn()
    const onRemove = vi.fn()
    const { page } = draw(fx.arrangeMockupBoard(), { onSheet, onSet, onRemove })
    cellOf(page, '가상환자21', 'sono').click()
    pick(page, '준비로 되돌리기')
    expect(onSet).toHaveBeenLastCalledWith(K.a, 'sono', 'todo')
    expect(onSheet).toHaveBeenLastCalledWith(null)
    expect(sheetOf(page)).toBeNull()
    cellOf(page, '가상환자21', 'sono').click()
    pick(page, '준비완료로 되돌리기')
    expect(onSet).toHaveBeenLastCalledWith(K.a, 'sono', 'ready')
    cellOf(page, '가상환자21', 'pt').click()
    pick(page, '칸에서 빼기')
    expect(onRemove).toHaveBeenLastCalledWith(K.a, 'pt')
    expect(onSet).toHaveBeenCalledTimes(2)
    expect(onRemove).toHaveBeenCalledTimes(1)

    cellOf(page, '가상환자21', 'xray').click()
    page.querySelector<HTMLButtonElement>('.sheet button.sheet-x')!.click()
    expect(sheetOf(page)).toBeNull()
    cellOf(page, '가상환자21', 'xray').click()
    page.querySelector<HTMLElement>('.sheet-back')!.click()
    expect(sheetOf(page)).toBeNull()
    cellOf(page, '가상환자21', 'xray').click()
    // 창 안을 누르면 닫히지 않는다
    sheetOf(page)!.click()
    expect(sheetOf(page)).not.toBeNull()
    sheetOf(page)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(sheetOf(page)).toBeNull()
    expect(onSheet).toHaveBeenLastCalledWith(null)
    expect(onSet).toHaveBeenCalledTimes(2)
    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it('AC-3308.6: view.sheet로 다시 그리면 창이 그대로 있고, 그 줄이 판에 없거나 칸이 맞지 않으면 창을 그리지 않는다', () => {
    const open = draw(fx.arrangeMockupBoard(), { sheet: { k: K.a, col: 'sono', kind: 'done' } }).page
    expect(textOf(open, '.sheet-h > span')).toBe('SONO · 완료')
    expect(sheetOf(draw(fx.arrangeMockupBoard(), { sheet: { k: fx.fakeKey(99), col: 'sono', kind: 'done' } }).page)).toBeNull()
    // 완료 창인데 칸이 완료가 아니다 · 넣기 창인데 칸이 이미 있다 · 부위 창인데 칸이 없다
    expect(sheetOf(draw(fx.arrangeMockupBoard(), { sheet: { k: K.c, col: 'sono', kind: 'done' } }).page)).toBeNull()
    expect(sheetOf(draw(fx.arrangeMockupBoard(), { sheet: { k: K.c, col: 'sono', kind: 'add' } }).page)).toBeNull()
    expect(sheetOf(draw(fx.arrangeMockupBoard(), { sheet: { k: K.h, col: 'sono', kind: 'part' } }).page)).toBeNull()
  })

  it('AC-3308.6: planOf(set)은 앞 단계로 미리 그리고 띠 "{이름} · {칸} {준비로|준비완료로} 되돌렸어요"와 완료로 가는 set을, planOf(remove)는 칸을 지우고 띠 "{이름} · {칸} 칸에서 뺐어요"(되돌리기 없음)를 준다', () => {
    const board = fx.arrangeMockupBoard()
    const todo = view.planOf(board, { k: K.a, op: 'set', col: 'sono', v: 'todo' })
    expect(arrRow(todo.board, K.a)!.cells.sono).toMatchObject({ st: 'todo' })
    expect(arrRow(todo.board, K.a)!.allDone).toBe(false)
    expect(todo.toast).toBe('가상환자21 · SONO 준비로 되돌렸어요')
    expect(todo.undo).toEqual({ k: K.a, op: 'set', col: 'sono', v: 'done' })
    const ready = view.planOf(board, { k: K.a, op: 'set', col: 'sono', v: 'ready' })
    expect(arrRow(ready.board, K.a)!.cells.sono).toMatchObject({ st: 'ready', at: '11:04' })
    expect(ready.toast).toBe('가상환자21 · SONO 준비완료로 되돌렸어요')
    expect(ready.undo).toEqual({ k: K.a, op: 'set', col: 'sono', v: 'done' })
    const removed = view.planOf(board, { k: K.a, op: 'remove', col: 'pt' })
    expect(arrRow(removed.board, K.a)!.cells.pt).toBeNull()
    expect(removed.toast).toBe('가상환자21 · PT 칸에서 뺐어요')
    expect(removed.undo).toBeNull()
  })

  it('AC-3308.7: 빈 칸을 누르면 고르기 창 "{칸} 직접 넣기"에 그 칸의 목록이 나오고 고르면 onAdd(열쇠, 칸, 글)를 부른다', () => {
    for (const col of COLS) {
      const onAdd = vi.fn()
      const onSheet = vi.fn()
      const { page } = draw(fx.arrangeMockupBoard(), { onAdd, onSheet })
      cellOf(page, '가상환자28', col).click()
      expect(onSheet, col).toHaveBeenLastCalledWith({ k: K.h, col, kind: 'add' })
      expect(textsOf(page, '.sheet .sheet-h > span'), col).toEqual([`${COL_NAMES[col]} 직접 넣기`, '가상환자28 · 처방에 없어도 넣을 수 있어요'])
      expect(optionsOf(page), col).toEqual(CHOICES[col])
      expect(page.querySelector('.sheet .opts')?.className, col).toBe(CHOICES[col].length > 6 ? 'opts many' : 'opts')
      const last = CHOICES[col].at(-1)!
      pick(page, last)
      expect(onAdd, col).toHaveBeenCalledTimes(1)
      expect(onAdd, col).toHaveBeenLastCalledWith(K.h, col, last)
      expect(sheetOf(page), col).toBeNull()
      expect(onSheet, col).toHaveBeenLastCalledWith(null)
    }
  })

  it('AC-3308.7: [부위 고르기]는 칸 누름 없이 부위 목록 창 "{칸} 부위 고르기"를 열고 고르면 onPart(열쇠, 칸, 부위)를 부른다', () => {
    const onPart = vi.fn()
    const onCell = vi.fn()
    const onSheet = vi.fn()
    const { page } = draw(fx.arrangeMockupBoard(), { onPart, onCell, onSheet })
    page.querySelector<HTMLButtonElement>('button.part-btn')!.click()
    expect(onCell).not.toHaveBeenCalled()
    expect(onSheet).toHaveBeenLastCalledWith({ k: K.c, col: 'sono', kind: 'part' })
    expect(textsOf(page, '.sheet .sheet-h > span')).toEqual(['SONO 부위 고르기', '가상환자23 · 비트에 부위가 없어서 골라요'])
    expect(optionsOf(page)).toEqual(PARTS)
    expect(page.querySelector('.sheet .opts')?.className).toBe('opts many')
    pick(page, '오른 어깨')
    expect(onPart).toHaveBeenCalledTimes(1)
    expect(onPart).toHaveBeenLastCalledWith(K.c, 'sono', '오른 어깨')
    expect(sheetOf(page)).toBeNull()
  })

  it('AC-3308.7: planOf(add)는 직접 넣은 준비 칸(manual, 직접 칸은 고른 글, SONO·C-ARM은 부위)을 미리 그리고 띠 "{이름} · {칸} 직접 넣었어요"와 remove를 준다', () => {
    const board = fx.arrangeMockupBoard()
    const pt = view.planOf(board, { k: K.h, op: 'add', col: 'pt', v: 'HP' })
    expect(arrRow(pt.board, K.h)!.cells.pt).toEqual({ st: 'todo', det: 'HP', part: null, at: '11:04', ord: null, manual: true })
    expect(pt.toast).toBe('가상환자28 · PT 직접 넣었어요')
    expect(pt.undo).toEqual({ k: K.h, op: 'remove', col: 'pt' })
    expect(arrRow(view.planOf(board, { k: K.h, op: 'add', col: 'sono', v: '왼 어깨' }).board, K.h)!.cells.sono).toMatchObject({ det: '', part: '왼 어깨', manual: true })
    expect(arrRow(view.planOf(board, { k: K.h, op: 'add', col: 'carm', v: LATER }).board, K.h)!.cells.carm).toMatchObject({ det: '', part: null })
    expect(arrRow(view.planOf(board, { k: K.h, op: 'add', col: 'xray', v: 'X-ray 찍기' }).board, K.h)!.cells.xray).toMatchObject({ st: 'todo', det: '', part: null })
    expect(view.planOf(board, { k: K.h, op: 'add', col: 'xray', v: 'X-ray 찍기' }).toast).toBe('가상환자28 · X-RAY 직접 넣었어요')
  })

  it('AC-3308.7: planOf(part)는 부위를 바꿔 그리고 띠 "{이름} · {칸} 부위: {부위}"를 준다. 앞 부위가 목록 글일 때만 그 부위로 가는 되돌리기가 있다', () => {
    const board = fx.arrangeMockupBoard()
    const none = view.planOf(board, { k: K.c, op: 'part', col: 'sono', v: '오른 어깨' })
    expect(arrRow(none.board, K.c)!.cells.sono!.part).toBe('오른 어깨')
    expect(none.toast).toBe('가상환자23 · SONO 부위: 오른 어깨')
    expect(none.undo).toBeNull()
    expect(view.planOf(board, { k: K.e, op: 'part', col: 'carm', v: '목' }).undo).toBeNull()
    expect(view.planOf(board, { k: K.g, op: 'part', col: 'sono', v: '오른 어깨' }).undo).toEqual({ k: K.g, op: 'part', col: 'sono', v: '왼 어깨' })
  })

  it('AC-3308.7: 고르기 목록 CHOICES·PARTS는 design.md 4절 표(시안 글) 그대로다', () => {
    expect(view.PARTS).toEqual(PARTS)
    expect(view.CHOICES).toEqual(CHOICES)
  })

  it('AC-3308.7: 화면 CHOICES는 C# ArrangeChoices(helper/src/Precheck.Core/Reception/ArrangeMarks.cs)와 같은 글이다 (TASK-4 뒤 GREEN)', () => {
    expect(existsSync(ARRANGE_MARKS_CS), 'ArrangeMarks.cs가 아직 없다(TASK-4가 만든다)').toBe(true)
    const strings = csStrings(readFileSync(ARRANGE_MARKS_CS, 'utf8'))
    for (const list of [view.PARTS, ['X-ray 찍기'], [LATER], view.CHOICES.pt, view.CHOICES.ds, view.CHOICES.eswt, view.CHOICES.trac]) {
      expect(list?.length ?? 0, JSON.stringify(list)).toBeGreaterThan(0)
      expect(hasRun(strings, list!), `C# ArrangeChoices에 ${JSON.stringify(list)}가 그 차례로 없다`).toBe(true)
    }
    expect(view.CHOICES.sono).toEqual([...view.PARTS, LATER])
    expect(view.CHOICES.carm).toEqual([...view.PARTS, LATER])
  })

  it('AC-3308.8: 접수 칸은 onAway(열쇠, on|off), [치료 종료]는 onEnd(열쇠), [다시 넣기]는 onRestore(열쇠)를 부른다', () => {
    const onAway = vi.fn()
    const onEnd = vi.fn()
    const onRestore = vi.fn()
    const { page } = draw(fx.arrangeMockupBoard(), { onAway, onEnd, onRestore, endedOpen: true })
    trOf(page, '가상환자21').querySelector<HTMLButtonElement>('button.t-btn')!.click()
    expect(onAway).toHaveBeenLastCalledWith(K.a, 'on')
    trOf(page, '가상환자24').querySelector<HTMLButtonElement>('button.t-btn')!.click()
    expect(onAway).toHaveBeenLastCalledWith(K.d, 'off')
    trOf(page, '가상환자22').querySelector<HTMLButtonElement>('button.end-btn')!.click()
    expect(onEnd).toHaveBeenLastCalledWith(K.b)
    page.querySelector<HTMLButtonElement>('section.ended li button.restore')!.click()
    expect(onRestore).toHaveBeenLastCalledWith(K.j)
    expect([onAway.mock.calls.length, onEnd.mock.calls.length, onRestore.mock.calls.length]).toEqual([2, 1, 1])
  })

  it('AC-3308.8: planOf(away·end)는 자리비움·줄 빼기·다시 넣기를 미리 그리고 띠 "{이름} · 자리비움 HH:MM"·"{이름} 님을 표에서 뺐어요"·"{이름} 님을 표에 다시 넣었어요"와 반대 쓰기를 준다', () => {
    const board = fx.arrangeMockupBoard()
    const on = view.planOf(board, { k: K.a, op: 'away', v: 'on' })
    expect(arrRow(on.board, K.a)!.away).toBe('11:04')
    expect(on.toast).toBe('가상환자21 · 자리비움 11:04')
    expect(on.undo).toEqual({ k: K.a, op: 'away', v: 'off' })
    const off = view.planOf(board, { k: K.d, op: 'away', v: 'off' })
    expect(arrRow(off.board, K.d)!.away).toBeNull()
    expect(off.toast).toBe('가상환자24 · 자리비움 풀었어요')
    expect(off.undo).toEqual({ k: K.d, op: 'away', v: 'on' })
    const end = view.planOf(board, { k: K.a, op: 'end', v: 'on' })
    expect(arrRow(end.board, K.a)).toBeNull()
    expect(end.board.arrange!.ended[0]).toEqual({ k: K.a, endedAt: '11:04' })
    expect(end.toast).toBe('가상환자21 님을 표에서 뺐어요')
    expect(end.undo).toEqual({ k: K.a, op: 'end', v: 'off' })
    const back = view.planOf(board, { k: K.j, op: 'end', v: 'off' })
    expect(back.board.arrange!.ended.map((e) => e.k)).toEqual([K.i])
    expect(back.toast).toBe('가상환자30 님을 표에 다시 넣었어요')
    expect(back.undo).toEqual({ k: K.j, op: 'end', v: 'on' })
  })

  it('AC-3308.8: 되돌리기 띠(view.toast)는 글과 [되돌리기](누르면 onUndo)이고, 되돌릴 것이 없으면 글만이다', () => {
    const onUndo = vi.fn()
    const { page } = draw(fx.arrangeMockupBoard(), { toast: { text: '가상환자21 · 자리비움 11:04', undo: true }, onUndo })
    const toast = page.querySelector('.toast')!
    expect(toast.getAttribute('role')).toBe('status')
    expect(shapeOf(toast)).toEqual(['span.toast-text', 'button.toast-undo'])
    expect(textOf(toast, '.toast-text')).toBe('가상환자21 · 자리비움 11:04')
    expect(textOf(toast, 'button.toast-undo')).toBe('되돌리기')
    toast.querySelector<HTMLButtonElement>('button.toast-undo')!.click()
    expect(onUndo).toHaveBeenCalledTimes(1)
    const plain = draw(fx.arrangeMockupBoard(), { toast: { text: '저장하지 못했어요. 다시 눌러 주세요', undo: false } }).page
    expect(shapeOf(plain.querySelector('.toast'))).toEqual(['span.toast-text'])
    expect(draw().page.querySelector('.toast')).toBeNull()
  })

  it('AC-3308.13: [PT 먼저]는 표시가 없으면 점선 "PT 먼저", up이면 보라 "↑ PT 올라감 HH:MM", down이면 초록 "↓ 내려옴 HH:MM"이고 누르면 onPtf(열쇠, up|down|off)를 부르며 기록부는 열지 않는다', () => {
    const onPtf = vi.fn()
    const onChart = vi.fn()
    const { page } = draw(fx.arrangeMockupBoard(), { onPtf, onChart })
    const ptf = (name: string) => trOf(page, name).querySelector<HTMLButtonElement>('td.c-nm > button.ptf-btn')!
    expect([ptf('가상환자21'), ptf('가상환자26'), ptf('가상환자27')].map((b) => [b.className, b.textContent, b.getAttribute('type')])).toEqual([
      ['ptf-btn none', 'PT 먼저', 'button'],
      ['ptf-btn up', '↑ PT 올라감 10:40', 'button'],
      ['ptf-btn down', '↓ 내려옴 10:58', 'button'],
    ])
    ptf('가상환자21').click()
    expect(onPtf).toHaveBeenLastCalledWith(K.a, 'up')
    ptf('가상환자26').click()
    expect(onPtf).toHaveBeenLastCalledWith(K.f, 'down')
    ptf('가상환자27').click()
    expect(onPtf).toHaveBeenLastCalledWith(K.g, 'off')
    expect(onChart).not.toHaveBeenCalled()
    trOf(page, '가상환자26').querySelector<HTMLButtonElement>('button.nm-btn')!.click()
    expect(onChart).toHaveBeenCalledTimes(1)
    expect(onChart).toHaveBeenLastCalledWith(K.f)
    expect(onPtf).toHaveBeenCalledTimes(3)
  })

  it('AC-3308.13: planOf(ptf)는 띠 "{이름} · PT 먼저 올라갔어요"·"{이름} · PT 끝나고 내려왔어요"·"{이름} · PT 먼저 표시를 지웠어요"와 앞 값으로 가는 ptf를 준다', () => {
    const board = fx.arrangeMockupBoard()
    const up = view.planOf(board, { k: K.a, op: 'ptf', v: 'up' })
    expect(arrRow(up.board, K.a)!.ptf).toEqual({ st: 'up', at: '11:04' })
    expect(up.toast).toBe('가상환자21 · PT 먼저 올라갔어요')
    expect(up.undo).toEqual({ k: K.a, op: 'ptf', v: 'off' })
    const down = view.planOf(board, { k: K.f, op: 'ptf', v: 'down' })
    expect(arrRow(down.board, K.f)!.ptf).toEqual({ st: 'down', at: '11:04' })
    expect(down.toast).toBe('가상환자26 · PT 끝나고 내려왔어요')
    expect(down.undo).toEqual({ k: K.f, op: 'ptf', v: 'up' })
    const off = view.planOf(board, { k: K.g, op: 'ptf', v: 'off' })
    expect(arrRow(off.board, K.g)!.ptf).toBeNull()
    expect(off.toast).toBe('가상환자27 · PT 먼저 표시를 지웠어요')
    expect(off.undo).toEqual({ k: K.g, op: 'ptf', v: 'down' })
  })

  it('AC-3308.5: planOf는 판에 없는 줄·칸이면 판을 그대로 두고 띠·되돌리기가 없다', () => {
    const board = fx.arrangeMockupBoard()
    for (const ask of [
      { k: fx.fakeKey(99), op: 'step', col: 'sono' },
      { k: K.h, op: 'step', col: 'sono' },
      { k: K.a, op: 'nope' },
    ]) {
      const plan = view.planOf(board, ask)
      expect(plan.toast, JSON.stringify(ask)).toBeNull()
      expect(plan.undo, JSON.stringify(ask)).toBeNull()
      expect(JSON.stringify(plan.board), JSON.stringify(ask)).toBe(JSON.stringify(board))
    }
  })
})

// ---- 모양 (AC-3308.10 · 3308.12) -------------------------------------------------------------------------

describe('REQ-3308 어레인지 모양 (style.css·theme.css)', () => {
  it('AC-3308.10: 태블릿 모양이면 표 폭은 1180px 이상이고 칸 폭은 시안 값이다. 폰은 1040px 표가 옆으로 밀리고 접수·성함 칸이 왼쪽에 붙어 있다', () => {
    const tablet: Record<string, string> = { 'c-t': '76px', 'c-nm': '156px', 'c-xray': '84px', 'c-sono': '136px', 'c-carm': '136px', 'c-pt': '76px', 'c-ds': '76px', 'c-trac': '76px', 'c-eswt': '80px', 'c-end': '72px' }
    const phone: Record<string, string> = { 'c-t': '62px', 'c-nm': '118px', 'c-xray': '74px', 'c-sono': '118px', 'c-carm': '118px', 'c-pt': '66px', 'c-ds': '66px', 'c-trac': '66px', 'c-eswt': '70px', 'c-end': '64px' }
    expect(Number.parseFloat(cssValue('.arr', 'min-width', 'tablet') ?? '0')).toBeGreaterThanOrEqual(1180)
    expect(cssValue('.arr', 'min-width')).toBe('1040px')
    for (const [cls, width] of Object.entries(tablet)) expect(cssValue(`.arr .${cls}`, 'width', 'tablet'), cls).toBe(width)
    for (const [cls, width] of Object.entries(phone)) expect(cssValue(`.arr .${cls}`, 'width'), cls).toBe(width)
    expect(cssValue('.arr', 'table-layout')).toBe('fixed')
    expect(cssValue('.wrap', 'overflow-x')).toBe('auto')
    expect(cssValue('.arr .c-t', 'position')).toBe('sticky')
    expect(cssValue('.arr .c-nm', 'position')).toBe('sticky')
    expect(cssValue('.arr .c-t', 'left')).toBe('0')
    expect(cssValue('.arr .c-nm', 'left')).toBe(phone['c-t'])
    expect(cssValue('.arr .c-nm', 'left', 'tablet')).toBe(tablet['c-t'])
  })

  it('AC-3308.10: 어레인지 화면이 그리는 class는 모두 style.css에 모양이 있고, 누르는 단추(탭·칸·종료·고르기·닫기·되돌리기)는 44px 이상이다', () => {
    const css = readWww('style.css').replace(/\/\*[\s\S]*?\*\//g, '')
    const { page } = draw(fx.arrangeMockupBoard(), { endedOpen: true, toast: { text: '띠', undo: true }, rxNew: [K.e], flash: [K.e] })
    cellOf(page, '가상환자21', 'sono').click()
    const classes = new Set([page, ...page.querySelectorAll('*')].flatMap((n) => [...n.classList]))
    for (const cls of classes) expect(css, `.${cls}`).toMatch(new RegExp(`\\.${cls}(?![\\w-])`))
    for (const cls of ['.tab', '.t-btn', '.cell', '.end-btn', '.opt', '.sheet-x', '.toast-undo', '.restore', '.ended-h']) {
      const value = cssValue(cls, 'min-height')
      expect(value, cls).toBeDefined()
      expect(Number.parseFloat(value!), cls).toBeGreaterThanOrEqual(44)
    }
  })

  it('AC-3308.12: 새 색은 theme.css :root의 --sono-head·--sono-col·--carm-head·--carm-col·--ptup-bg·--ptup-fg 여섯뿐이고 시안 값이며, SONO·C-ARM 칸과 [PT 먼저] 올라감이 그 색을 쓴다', () => {
    const want: Record<string, string> = {
      '--sono-head': '#F3DC8A',
      '--sono-col': '#FBF4D6',
      '--carm-head': '#9FDCC6',
      '--carm-col': '#E2F5EE',
      '--ptup-bg': '#F1EAFB',
      '--ptup-fg': '#6B21A8',
    }
    const root = parseRules(readWww('theme.css')).filter((r) => r.selector === ':root' && r.media === '').flatMap((r) => r.decls)
    for (const [name, value] of Object.entries(want)) expect(root.find(([p]) => p === name)?.[1].toUpperCase(), name).toBe(value)
    // 승인 시안(상표 v12·Paper.html)에 없던 색은 이 여섯뿐이고, 모두 어레인지 시안에 있다
    const old = new Set<string>()
    for (const page of ['Main.dc.html', 'Detail.dc.html', 'Offline.dc.html', 'Tablet.dc.html', 'Paper.html'])
      for (const c of hexColors(readFileSync(path.join(PHONE_MOCKUPS, page), 'utf8'))) old.add(c)
    const added = [...new Set(hexColors(root.map(([, v]) => v).join(' ')))].filter((c) => !old.has(c)).sort()
    expect(added).toEqual(Object.values(want).sort())
    const mockup = new Set(hexColors(readFileSync(MOCKUP, 'utf8')))
    for (const c of added) expect(mockup.has(c), c).toBe(true)
    expect(cssValue('.arr th.c-sono', 'background')).toBe('var(--sono-head)')
    expect(cssValue('.arr td.c-sono', 'background')).toBe('var(--sono-col)')
    expect(cssValue('.arr th.c-carm', 'background')).toBe('var(--carm-head)')
    expect(cssValue('.arr td.c-carm', 'background')).toBe('var(--carm-col)')
    expect(cssValue('.ptf-btn.up', 'background')).toBe('var(--ptup-bg)')
    expect(cssValue('.ptf-btn.up', 'color')).toBe('var(--ptup-fg)')
    expect(cssValue('.lg.ptup', 'background')).toBe('var(--ptup-bg)')
  })
})

// ---- 환자 글 (AC-3312.1) ---------------------------------------------------------------------------------

describe('REQ-3312 환자 글은 글자로만', () => {
  it('AC-3312.1: 이름·차트번호·정보·메모·지난번 증상·부위·칸 글에 HTML을 넣어도 글자로만 보인다', () => {
    const board = fx.arrangeMockupBoard()
    const list = board.lists.pay.find((r) => r.k === K.b)!
    list.name = '<b>가상환자22</b>'
    list.chart = '<i>910022</i>'
    list.memo = '<img src=x onerror=alert(1)>'
    list.info = '<u>47세</u> · 남 · 재진'
    const row = arrRow(board, K.b)!
    row.last = '<script>지난번</script>'
    row.cells.carm!.part = '<em>허리</em>'
    row.cells.pt!.det = '<s>HP</s>'
    const { page } = draw(board, { endedOpen: true })
    const tr = trOf(page, '<b>가상환자22</b>')
    expect(textOf(tr, '.chart')).toBe('<i>910022</i>')
    expect(textOf(tr, '.arr-memo')).toBe('<img src=x onerror=alert(1)>')
    expect(textOf(tr, '.lastsym')).toBe('지난번<script>지난번</script>')
    expect(textOf(tr, 'td.c-carm .det')).toBe('<em>허리</em>')
    expect(textOf(tr, 'td.c-pt .det')).toBe('<s>HP</s>')
    expect(page.querySelector('b, i, u, s, em, script, img:not(.logo)')).toBeNull()
  })

  it('AC-3312.1: arrange.js는 화면 파일만 불러오고 HTML 넣기·저장소·console·eval·fetch를 쓰지 않는다(ESLint 울타리와 같은 금지)', () => {
    const source = readWww('arrange.js')
    expect(source.length).toBeGreaterThan(0)
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(code).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|DOMParser|localStorage|sessionStorage|indexedDB|\bcaches\b|cookie|serviceWorker|console|\beval\b|new Function|\bfetch\b|XMLHttpRequest|WebSocket|sendBeacon/)
    for (const m of code.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) expect(m[1]).toMatch(/^\.\/[\w-]+\.js$/)
  })
})

// 시안 파일이 그대로 있는지(시험이 글을 옮겨 적은 곳)
describe('승인 시안', () => {
  it('AC-3308.2: 승인 시안 Arrange.html에 시험이 옮긴 글이 있다', () => {
    const html = readFileSync(MOCKUP, 'utf8')
    for (const text of [...HOWTO, FOOT, ...PARTS, '부위는 나중에', '처방에 없어도 넣을 수 있어요', '비트에 부위가 없어서 골라요', '첫 방문이라 지난 증상이 없어요']) expect(html, text).toContain(text)
    expect(nameOf(K.a)).toBe('가상환자21')
  })
})
