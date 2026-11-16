// @vitest-environment jsdom
// 목록 고치기 picks.js (reception-pick-lists TASK-6, REQ-3505, design.md 3절, 승인 시안 docs/mockups/reception-pick-lists/Mock.html listSheet).
// 어레인지 화면(arrange.js renderArrange) 머리의 [목록 고치기]로 연다. 창은 판 picks의 사본(초안)을 고치고 [저장]이 view.onLists(초안)를 부른다
// (보내기·띠는 app.js, arrange-app.test.ts). 자료는 가짜다(fixtures.ts)
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import * as fx from './fixtures'
import type { FakeBoard, FakePicks } from './fixtures'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const WWW = path.join(ROOT, 'reception', 'www')
/** 목록 여섯 탭·이름 바꾸기 승인 시안 (reception-arrange-tune) */
const TUNE_MOCKUP = path.join(ROOT, 'docs', 'mockups', 'reception-arrange-tune', 'Mock.html')

/** 창 위 안내 글 (reception-arrange-tune AC-3604.1, 시안 listSheet) */
const SUB = '칸을 넣을 때 보이는 단추를 정해요. 이름을 누르면 바꿀 수 있어요'
/** 탭 여섯 (AC-3604.1) */
const TAB_NAMES = ['C-ARM', 'SONO', 'PT', '도수', '충격파', '견인']
/** 충격파 탭 위 안내 (AC-3604.1, 시안 LISTS.eswt.fixed) */
const ESWT_FIXED = '칸에는 "3000타 2부위"처럼 타수와 부위 수가 함께 보여요.'
/** 이름 바꾸기 줄 안내 (AC-3604.2) */
const RENAME_HINT = '1~10글자 · 같은 이름은 안 돼요'

interface ArrangeView {
  toast?: { text: string; undo: boolean } | null
  onLists?: (picks: FakePicks) => Promise<boolean> | boolean
}

interface ArrangeJs {
  renderArrange: (host: HTMLElement, board: FakeBoard, view?: ArrangeView) => HTMLElement
}

// 화면 파일은 빌드 없는 JS라 형 선언이 없다. 경로를 값으로 두어 형 검사가 묻지 않게 한다
const ARRANGE_JS = '../www/arrange.js'
let view: ArrangeJs

beforeAll(async () => {
  const missing: ArrangeJs = { renderArrange: (host) => host.appendChild(document.createElement('div')) }
  view = ((await import(/* @vite-ignore */ ARRANGE_JS).catch(() => missing)) ?? missing) as ArrangeJs
})

afterEach(() => {
  document.body.replaceChildren()
})

// ---- 시험 도구 --------------------------------------------------------------------------------------

function appHost(): HTMLElement {
  const app = document.createElement('div')
  app.id = 'app'
  document.body.appendChild(app)
  return app
}

function draw(board: FakeBoard = fx.arrangeMockupBoard(), v: ArrangeView = {}): HTMLElement {
  const app = appHost()
  view.renderArrange(app, board, v)
  return app
}

function textOf(root: ParentNode | null | undefined, selector: string): string | null {
  return root?.querySelector(selector)?.textContent?.trim() ?? null
}

function textsOf(root: ParentNode, selector: string): string[] {
  return [...root.querySelectorAll(selector)].map((n) => n.textContent?.trim() ?? '')
}

/** 바로 아래 아이들의 '태그.class' */
function shapeOf(node: Element | null | undefined): string[] {
  return [...(node?.children ?? [])].map((c) => `${c.tagName.toLowerCase()}${c.getAttribute('class') ? `.${String(c.getAttribute('class')).split(' ').join('.')}` : ''}`)
}

function listButton(root: ParentNode): HTMLButtonElement | null {
  return root.querySelector<HTMLButtonElement>('header.top .top-status > button.list-open')
}

function listSheet(root: ParentNode): HTMLElement | null {
  return root.querySelector<HTMLElement>('.sheet-back.list-back > .sheet.list-sheet')
}

function openList(root: ParentNode): HTMLElement {
  listButton(root)!.click()
  const sheet = listSheet(root)
  if (!sheet) throw new Error('목록 고치기 창 없음')
  return sheet
}

/** 탭 [글, 고름] */
function tabs(root: ParentNode): [string, boolean][] {
  return [...root.querySelectorAll('.list-sheet > .lt-tabs > button.lt-tab')].map((b) => [
    b.textContent ?? '',
    b.classList.contains('on') && b.getAttribute('aria-pressed') === 'true',
  ])
}

function tab(root: ParentNode, name: string) {
  const button = [...root.querySelectorAll<HTMLButtonElement>('.list-sheet > .lt-tabs > button.lt-tab')].find((b) => b.textContent === name)
  if (!button) throw new Error(`탭 ${name} 없음`)
  button.click()
}

function groups(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('.list-sheet > .lt-groups > section.lt-group')]
}

/** 무리 머리 [이름, 작은 글] */
function headOf(group: Element): [string, string] {
  const h3 = group.querySelector(':scope > h3')!
  return [h3.firstChild?.textContent ?? '', h3.querySelector(':scope > span.sm')?.textContent ?? '']
}

function groupOf(root: ParentNode, label: string): HTMLElement {
  const found = groups(root).find((g) => headOf(g)[0] === label)
  if (!found) throw new Error(`무리 ${label} 없음`)
  return found
}

function names(root: ParentNode, label: string): string[] {
  return [...groupOf(root, label).querySelectorAll(':scope > ul.lt-list > li.lt-row > .lt-name')].map((n) => n.textContent ?? '')
}

/** 탭 [글, 고름] 중 고른 것만 true인 여섯 */
function sixTabs(on: string): [string, boolean][] {
  return TAB_NAMES.map((name) => [name, name === on])
}

/** 이름 단추(누르면 바꾸기 줄) */
function nameButton(root: ParentNode, label: string, name: string): HTMLButtonElement {
  return rowOf(root, label, name).querySelector<HTMLButtonElement>(':scope > button.lt-name')!
}

/** 열린 바꾸기 줄들(창 전체) */
function renameRows(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('.list-sheet li.lt-row.is-rename')]
}

function renameInput(root: ParentNode): HTMLInputElement {
  const input = root.querySelector<HTMLInputElement>('.list-sheet li.lt-row.is-rename > input.lt-rename')
  if (!input) throw new Error('바꾸기 글 칸 없음')
  return input
}

/** 바꾸기 글 칸에 적는다 */
function typeRename(root: ParentNode, text: string) {
  const input = renameInput(root)
  input.value = text
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function renameButton(root: ParentNode, cls: 'lt-ok' | 'lt-no'): HTMLButtonElement {
  return root.querySelector<HTMLButtonElement>(`.list-sheet li.lt-row.is-rename > button.${cls}`)!
}

function renameKey(root: ParentNode, key: string) {
  renameInput(root).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
}

function rowOf(root: ParentNode, label: string, name: string): HTMLElement {
  const row = [...groupOf(root, label).querySelectorAll<HTMLElement>(':scope > ul.lt-list > li.lt-row')].find((li) => textOf(li, '.lt-name') === name)
  if (!row) throw new Error(`${label} ${name} 줄 없음`)
  return row
}

const OPS = { up: '위로', down: '아래로', del: '빼기' } as const

function btn(root: ParentNode, label: string, name: string, op: keyof typeof OPS): HTMLButtonElement {
  return rowOf(root, label, name).querySelector<HTMLButtonElement>(`:scope > button.lt-btn[aria-label="${OPS[op]}"]`)!
}

function flag(root: ParentNode, name: string) {
  rowOf(root, '시술', name).querySelector<HTMLButtonElement>(':scope > button.lt-flag')!.click()
}

/** 켠 [약재 없음]의 시술 */
function flags(root: ParentNode): string[] {
  return [...groupOf(root, '시술').querySelectorAll('li.lt-row')]
    .filter((li) => {
      const b = li.querySelector('button.lt-flag')
      return b?.classList.contains('on') === true && b.getAttribute('aria-pressed') === 'true'
    })
    .map((li) => textOf(li, '.lt-name') ?? '')
}

/** 무리의 글 칸에 적고 [더하기] */
function add(root: ParentNode, label: string, text: string) {
  const form = groupOf(root, label).querySelector('form.lt-add')!
  const input = form.querySelector('input')!
  input.value = text
  input.dispatchEvent(new Event('input', { bubbles: true }))
  form.querySelector<HTMLButtonElement>('button[type="submit"]')!.click()
}

function saveButton(root: ParentNode): HTMLButtonElement {
  return listSheet(root)!.querySelector<HTMLButtonElement>(':scope > .sheet-go > button.go')!
}

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

function readWww(rel: string): string {
  const file = path.join(WWW, rel)
  return existsSync(file) ? readFileSync(file, 'utf8') : ''
}

/** 작은 CSS 읽개: 주석을 지우고 @media 밖 규칙에서 selector(쉼표 목록 중 하나와 같은 글)의 prop 값. 뒤의 것이 이긴다 */
function cssValue(selector: string, prop: string): string | undefined {
  const css = readWww('style.css').replace(/\/\*[\s\S]*?\*\//g, '')
  let found: string | undefined
  let depth = 0
  let head = ''
  let start = 0
  for (let i = 0; i < css.length; i += 1) {
    if (css[i] === '{') {
      if (depth === 0) head = css.slice(start, i).trim()
      depth += 1
      start = i + 1
    } else if (css[i] === '}') {
      depth -= 1
      if (depth === 0 && !head.startsWith('@')) {
        if (head.split(',').map((s) => s.trim()).includes(selector))
          for (const decl of css.slice(start, i).split(';')) {
            const at = decl.indexOf(':')
            if (at > 0 && decl.slice(0, at).trim() === prop) found = decl.slice(at + 1).trim()
          }
      }
      start = i + 1
    }
  }
  return found
}

// ---- 창 (AC-3505.1) ---------------------------------------------------------------------------------

describe('REQ-3505 목록 고치기 창', () => {
  it('AC-3505.1 · AC-3604.1: 어레인지 머리의 [목록 고치기]를 누르면 창 "고르기 목록 고치기"가 열린다: 위 안내 글(이름을 누르면 바꿀 수 있어요), 탭 C-ARM(시술·약재)·SONO·PT·도수·충격파·견인, 줄마다 이름 단추 ▲ ▼ ✕(시술은 [약재 없음]도), 무리마다 글 칸 + [더하기], 아래 안내 글, [취소]·[저장]', () => {
    const app = draw()
    const button = listButton(app)!
    expect(button.getAttribute('type')).toBe('button')
    expect(button.disabled).toBe(false)
    expect(button.textContent).toBe('목록 고치기')
    const sheet = openList(app)
    expect(sheet.getAttribute('role')).toBe('dialog')
    expect(sheet.getAttribute('aria-modal')).toBe('true')
    expect(sheet.getAttribute('aria-label')).toBe('고르기 목록 고치기')
    expect(app.querySelectorAll('.sheet-back').length).toBe(1)
    expect(shapeOf(sheet)).toEqual(['div.sheet-h', 'div.lt-tabs', 'div.lt-groups', 'p.lt-foot-note', 'div.sheet-go'])
    expect(textsOf(sheet, '.sheet-h > span')).toEqual(['고르기 목록 고치기', SUB])
    expect(tabs(app)).toEqual(sixTabs('C-ARM'))
    expect(groups(app).map(headOf)).toEqual([
      ['시술', '하나 골라요 · 4개'],
      ['약재', '하나 골라요 · 3개'],
    ])
    expect(names(app, '시술')).toEqual(['목', '등', '허리', '리덕션'])
    expect(names(app, '약재')).toEqual(['TP', '하프', '기본'])
    const row = rowOf(app, '시술', '목')
    expect(shapeOf(row)).toEqual(['button.lt-name', 'button.lt-flag', 'button.lt-btn', 'button.lt-btn', 'button.lt-btn.del'])
    expect([...row.querySelectorAll('button')].map((b) => [b.textContent, b.getAttribute('aria-label'), b.getAttribute('type')])).toEqual([
      ['목', null, 'button'],
      ['약재 없음', null, 'button'],
      ['▲', '위로', 'button'],
      ['▼', '아래로', 'button'],
      ['✕', '빼기', 'button'],
    ])
    expect(flags(app)).toEqual(['리덕션'])
    expect(shapeOf(rowOf(app, '약재', 'TP'))).toEqual(['button.lt-name', 'button.lt-btn', 'button.lt-btn', 'button.lt-btn.del'])
    // 맨 위 ▲·맨 아래 ▼는 꺼져 있다
    expect(btn(app, '시술', '목', 'up').disabled).toBe(true)
    expect(btn(app, '시술', '목', 'down').disabled).toBe(false)
    expect(btn(app, '시술', '리덕션', 'down').disabled).toBe(true)
    const form = groupOf(app, '시술').querySelector('form.lt-add')!
    expect(shapeOf(form)).toEqual(['input', 'button'])
    const input = form.querySelector('input')!
    expect([input.type, input.maxLength, input.placeholder, input.getAttribute('aria-label')]).toEqual(['text', 10, '새 시술', '새 시술'])
    expect([form.querySelector('button')!.type, form.querySelector('button')!.textContent]).toEqual(['submit', '더하기'])
    expect(textOf(sheet, ':scope > p.lt-foot-note')).toBe('저장하면 모든 폰·태블릿의 고르기 창이 바로 바뀌어요. 이미 표에 넣은 칸은 그대로예요.')
    expect(shapeOf(sheet.querySelector(':scope > .sheet-go'))).toEqual(['button.sheet-close', 'button.go'])
    expect(textsOf(sheet, ':scope > .sheet-go > button')).toEqual(['취소', '저장'])

    tab(app, 'SONO')
    expect(tabs(app)).toEqual(sixTabs('SONO'))
    expect(shapeOf(listSheet(app))).toEqual(['div.sheet-h', 'div.lt-tabs', 'p.lt-fixed', 'div.lt-groups', 'p.lt-foot-note', 'div.sheet-go'])
    expect(textOf(listSheet(app), ':scope > p.lt-fixed')).toBe('쪽(오른쪽·왼쪽·양쪽)은 늘 있어요. 부위 앞에 붙어 "오른 어깨"처럼 보여요.')
    expect(groups(app).map(headOf)).toEqual([
      ['부위', '여러 개 골라요 · 20개'],
      ['부위 없이', '쪽·부위 없이 그대로 담겨요 · 3개'],
      ['같이 하는 것', '체크하면 이름표로 떠요 · 2개'],
    ])
    expect(names(app, '부위')).toEqual(fx.defaultPicks().sono.parts)
    expect(names(app, '부위 없이')).toEqual(['소독', 'S/O', '봉합'])
    expect(names(app, '같이 하는 것')).toEqual(['DNA', '채혈'])
    expect(listSheet(app)!.querySelector('.lt-flag')).toBeNull()
    expect(groupOf(app, '부위 없이').querySelector('input')!.placeholder).toBe('새 부위 없이')

    // 빈 무리
    document.body.replaceChildren()
    const board = fx.arrangeMockupBoard()
    board.picks!.carm.drugs = []
    const empty = draw(board)
    openList(empty)
    expect(shapeOf(groupOf(empty, '약재'))).toEqual(['h3', 'div.lt-empty', 'form.lt-add'])
    expect(textOf(groupOf(empty, '약재'), '.lt-empty')).toBe('아직 없어요. 아래에 적고 [더하기]를 눌러요')
    expect(headOf(groupOf(empty, '약재'))).toEqual(['약재', '하나 골라요 · 0개'])
  })

  it('AC-3604.1: PT(종류)·도수(시간)·충격파(타수 · 부위 수 + 위 안내)·견인(부위) 탭은 시안 글 그대로이고 줄마다 이름 단추 ▲ ▼ ✕(약재 없음 없음)와 글 칸 + [더하기]가 있다', () => {
    const app = draw()
    openList(app)
    const plain = ['div.sheet-h', 'div.lt-tabs', 'div.lt-groups', 'p.lt-foot-note', 'div.sheet-go']
    for (const [name, shape, heads, lists, holders] of [
      ['PT', plain, [['종류', '하나 골라요 · 2개']], [['ICE', 'HP']], ['새 종류']],
      ['도수', plain, [['시간', '하나 골라요 · 2개']], [['30분', '50분']], ['새 시간']],
      [
        '충격파',
        ['div.sheet-h', 'div.lt-tabs', 'p.lt-fixed', 'div.lt-groups', 'p.lt-foot-note', 'div.sheet-go'],
        [
          ['타수', '안 골라도 돼요 · 4개'],
          ['부위 수', '하나 골라요 · 4개'],
        ],
        [
          ['2000타', '3000타', '4000타', '6000타'],
          ['1부위', '2부위', '3부위', '4부위'],
        ],
        ['새 타수', '새 부위 수'],
      ],
      ['견인', plain, [['부위', '하나 골라요 · 2개']], [['목', '허리']], ['새 부위']],
    ] as const) {
      tab(app, name)
      expect(tabs(app), name).toEqual(sixTabs(name))
      const sheet = listSheet(app)!
      expect(shapeOf(sheet), name).toEqual(shape)
      expect(textsOf(sheet, '.sheet-h > span'), name).toEqual(['고르기 목록 고치기', SUB])
      expect(groups(app).map(headOf), name).toEqual(heads)
      expect(groups(app).map((g) => names(app, headOf(g)[0])), name).toEqual(lists)
      expect(groups(app).map((g) => g.querySelector('form.lt-add > input')!.getAttribute('placeholder')), name).toEqual(holders)
      expect(sheet.querySelector('.lt-flag'), name).toBeNull()
      const first = groups(app)[0]!.querySelector(':scope > ul.lt-list > li.lt-row')!
      expect(shapeOf(first), name).toEqual(['button.lt-name', 'button.lt-btn', 'button.lt-btn', 'button.lt-btn.del'])
      expect(textOf(sheet, ':scope > p.lt-foot-note'), name).toBe('저장하면 모든 폰·태블릿의 고르기 창이 바로 바뀌어요. 이미 표에 넣은 칸은 그대로예요.')
    }
    tab(app, '충격파')
    expect(textOf(listSheet(app), ':scope > p.lt-fixed')).toBe(ESWT_FIXED)
    // 시안 글 그대로
    const html = readFileSync(TUNE_MOCKUP, 'utf8')
    for (const text of [
      SUB,
      ESWT_FIXED,
      RENAME_HINT,
      "pt: { name: 'PT', groups: [{ key: 'pt', label: '종류', sub: '하나 골라요', min: 1,",
      "ds: { name: '도수', groups: [{ key: 'ds', label: '시간', sub: '하나 골라요', min: 1,",
      "{ key: 'hits', label: '타수', sub: '안 골라도 돼요', min: 0,",
      "{ key: 'counts', label: '부위 수', sub: '하나 골라요', min: 1,",
      "trac: { name: '견인', groups: [{ key: 'trac', label: '부위', sub: '하나 골라요', min: 1,",
      "name: '충격파',",
    ])
      expect(html, text).toContain(text)
  })

  it('AC-3604.1: 새 탭의 [더하기]·▲·▼·✕는 초안만 바꾸고(이름 규칙·개수 한도 8 그대로) [저장]이 새 무리까지 넘긴다', () => {
    const onLists = vi.fn(() => true)
    const board = fx.arrangeMockupBoard()
    const before = JSON.stringify(board)
    const app = draw(board, { onLists })
    openList(app)
    tab(app, 'PT')
    add(app, '종류', ' TENS ')
    add(app, '종류', 'ICE')
    add(app, '종류', '가'.repeat(11))
    add(app, '종류', 'IR|HP')
    expect(names(app, '종류')).toEqual(['ICE', 'HP', 'TENS'])
    expect(groupOf(app, '종류').querySelector('input')!.value).toBe('IR|HP')
    btn(app, '종류', 'TENS', 'up').click()
    expect(names(app, '종류')).toEqual(['ICE', 'TENS', 'HP'])
    tab(app, '도수')
    btn(app, '시간', '50분', 'up').click()
    expect(names(app, '시간')).toEqual(['50분', '30분'])
    tab(app, '충격파')
    btn(app, '타수', '6000타', 'del').click()
    add(app, '부위 수', '5부위')
    add(app, '타수', '1부위')
    expect(names(app, '타수')).toEqual(['2000타', '3000타', '4000타', '1부위'])
    tab(app, '견인')
    add(app, '부위', '골반')
    btn(app, '부위', '목', 'down').click()
    expect(names(app, '부위')).toEqual(['허리', '목', '골반'])
    expect(onLists).not.toHaveBeenCalled()
    expect(JSON.stringify(board)).toBe(before)
    saveButton(app).click()
    const want = fx.defaultPicks()
    want.pt = ['ICE', 'TENS', 'HP']
    want.ds = ['50분', '30분']
    want.eswt = { hits: ['2000타', '3000타', '4000타', '1부위'], counts: ['1부위', '2부위', '3부위', '4부위', '5부위'] }
    want.trac = ['허리', '목', '골반']
    expect(onLists).toHaveBeenLastCalledWith(want)

    // 개수 한도 8
    document.body.replaceChildren()
    const full = fx.arrangeMockupBoard()
    const eight = (head: string) => Array.from({ length: 8 }, (_, i) => `${head}${i + 1}`)
    full.picks = { ...fx.defaultPicks(), pt: eight('피'), ds: eight('도'), eswt: { hits: eight('타'), counts: eight('수') }, trac: eight('견') }
    const big = draw(full)
    openList(big)
    for (const [name, labels] of [
      ['PT', ['종류']],
      ['도수', ['시간']],
      ['충격파', ['타수', '부위 수']],
      ['견인', ['부위']],
    ] as const) {
      tab(big, name)
      for (const label of labels) {
        add(big, label, '더')
        expect(headOf(groupOf(big, label))[1], label).toMatch(/ · 8개$/)
        expect(groupOf(big, label).querySelector('input')!.value, label).toBe('더')
      }
    }
  })

  it('AC-3604.3: PT 종류·도수 시간·충격파 부위 수·견인 부위의 마지막 하나는 ✕가 꺼지고, 충격파 타수는 다 뺄 수 있다(C-ARM·SONO 규칙은 그대로)', () => {
    const board = fx.arrangeMockupBoard()
    board.picks = { ...fx.defaultPicks(), pt: ['ICE'], ds: ['30분'], eswt: { hits: ['2000타'], counts: ['1부위'] }, trac: ['목'] }
    const app = draw(board)
    openList(app)
    tab(app, 'PT')
    expect(btn(app, '종류', 'ICE', 'del').disabled).toBe(true)
    btn(app, '종류', 'ICE', 'del').click()
    expect(names(app, '종류')).toEqual(['ICE'])
    add(app, '종류', 'HP')
    expect(btn(app, '종류', 'ICE', 'del').disabled).toBe(false)
    btn(app, '종류', 'ICE', 'del').click()
    expect(names(app, '종류')).toEqual(['HP'])
    expect(btn(app, '종류', 'HP', 'del').disabled).toBe(true)
    tab(app, '도수')
    expect(btn(app, '시간', '30분', 'del').disabled).toBe(true)
    tab(app, '충격파')
    expect(btn(app, '부위 수', '1부위', 'del').disabled).toBe(true)
    expect(btn(app, '타수', '2000타', 'del').disabled).toBe(false)
    btn(app, '타수', '2000타', 'del').click()
    expect(names(app, '타수')).toEqual([])
    expect(textOf(groupOf(app, '타수'), '.lt-empty')).toBe('아직 없어요. 아래에 적고 [더하기]를 눌러요')
    tab(app, '견인')
    expect(btn(app, '부위', '목', 'del').disabled).toBe(true)
    // C-ARM 마지막 시술·약재는 그대로
    tab(app, 'C-ARM')
    expect(btn(app, '약재', 'TP', 'del').disabled).toBe(false)
  })

  it('AC-3505.1 · AC-3505.4: [목록 고치기]는 어레인지 머리 .top-status 맨 앞이고, 다시 눌러도 창은 하나다. 판에 picks가 없으면 꺼져 있어 창이 열리지 않는다', () => {
    const app = draw()
    expect(shapeOf(app.querySelector('header.top .top-status'))).toEqual(['button.list-open', 'span.conn', 'button.refresh'])
    openList(app)
    listButton(app)!.click()
    expect(app.querySelectorAll('.sheet-back.list-back').length).toBe(1)

    document.body.replaceChildren()
    const none = fx.arrangeMockupBoard()
    delete none.picks
    const bare = draw(none)
    expect(listButton(bare)!.disabled).toBe(true)
    listButton(bare)!.click()
    expect(listSheet(bare)).toBeNull()
  })
})

// ---- 초안 고치기 (AC-3505.2) ----------------------------------------------------------------------------

describe('REQ-3505 초안 고치기', () => {
  it('AC-3505.2: [더하기]·▲·▼·✕·[약재 없음]은 창 안 초안만 바꾸고 판·onLists는 그대로다. [더하기]는 앞뒤 빈칸을 빼고 끝에 더하고 글 칸을 비운 뒤 그 칸에 초점을 둔다', () => {
    const onLists = vi.fn(() => Promise.resolve(true))
    const board = fx.arrangeMockupBoard()
    const before = JSON.stringify(board)
    const app = draw(board, { onLists })
    openList(app)
    add(app, '시술', '  꼬리뼈 ')
    expect(names(app, '시술')).toEqual(['목', '등', '허리', '리덕션', '꼬리뼈'])
    expect(headOf(groupOf(app, '시술'))).toEqual(['시술', '하나 골라요 · 5개'])
    const input = groupOf(app, '시술').querySelector('input')!
    expect(input.value).toBe('')
    expect(document.activeElement).toBe(input)
    btn(app, '시술', '리덕션', 'up').click()
    expect(names(app, '시술')).toEqual(['목', '등', '리덕션', '허리', '꼬리뼈'])
    btn(app, '시술', '목', 'down').click()
    expect(names(app, '시술')).toEqual(['등', '목', '리덕션', '허리', '꼬리뼈'])
    btn(app, '시술', '등', 'del').click()
    expect(names(app, '시술')).toEqual(['목', '리덕션', '허리', '꼬리뼈'])
    flag(app, '목')
    flag(app, '리덕션')
    expect(flags(app)).toEqual(['목'])
    btn(app, '약재', '기본', 'del').click()
    add(app, '약재', '반')
    expect(names(app, '약재')).toEqual(['TP', '하프', '반'])
    tab(app, 'SONO')
    add(app, '부위', '꼬리')
    btn(app, '부위 없이', '봉합', 'up').click()
    btn(app, '같이 하는 것', 'DNA', 'del').click()
    expect(names(app, '부위').at(-1)).toBe('꼬리')
    expect(names(app, '부위 없이')).toEqual(['소독', '봉합', 'S/O'])
    expect(names(app, '같이 하는 것')).toEqual(['채혈'])
    // 탭을 돌아가도 초안은 그대로
    tab(app, 'C-ARM')
    expect(names(app, '시술')).toEqual(['목', '리덕션', '허리', '꼬리뼈'])
    expect(flags(app)).toEqual(['목'])
    expect(onLists).not.toHaveBeenCalled()
    expect(JSON.stringify(board)).toBe(before)
  })

  it('AC-3505.2: 도우미 목록 규칙에 어긋나는 이름(빈 글·10글자 넘음·"|"·제어 글자·무리 안 겹침·SONO 부위와 부위 없이 겹침·개수 한도)은 더하지 않고 적던 글을 그대로 둔다', () => {
    const app = draw()
    openList(app)
    for (const bad of ['', '   ', '가'.repeat(11), '허리|목', '벨\u0007', '탭\t글', '목', ' 목 ']) {
      add(app, '시술', bad)
      expect(names(app, '시술'), JSON.stringify(bad)).toEqual(['목', '등', '허리', '리덕션'])
    }
    expect(groupOf(app, '시술').querySelector('input')!.value).toBe(' 목 ')
    add(app, '시술', '가'.repeat(10))
    expect(names(app, '시술').at(-1)).toBe('가'.repeat(10))
    tab(app, 'SONO')
    add(app, '부위', '소독')
    add(app, '부위 없이', '어깨')
    add(app, '같이 하는 것', 'DNA')
    expect(names(app, '부위')).toEqual(fx.defaultPicks().sono.parts)
    expect(names(app, '부위 없이')).toEqual(['소독', 'S/O', '봉합'])
    expect(names(app, '같이 하는 것')).toEqual(['DNA', '채혈'])

    // 개수 한도: 시술·약재·부위 없이·같이 하는 것 12, 부위 40
    document.body.replaceChildren()
    const board = fx.arrangeMockupBoard()
    const many = (head: string, n: number) => Array.from({ length: n }, (_, i) => `${head}${i + 1}`)
    board.picks = {
      ...fx.defaultPicks(),
      carm: { procs: many('시', 12).map((n) => ({ n, noDrug: false })), drugs: many('약', 12) },
      sono: { parts: many('부', 40), plains: many('없', 12), withs: many('같', 12) },
    }
    const full = draw(board)
    openList(full)
    add(full, '시술', '더')
    add(full, '약재', '더')
    expect(groups(full).map((g) => headOf(g)[1])).toEqual(['하나 골라요 · 12개', '하나 골라요 · 12개'])
    tab(full, 'SONO')
    add(full, '부위', '더')
    add(full, '부위 없이', '더')
    add(full, '같이 하는 것', '더')
    expect(groups(full).map((g) => headOf(g)[1])).toEqual(['여러 개 골라요 · 40개', '쪽·부위 없이 그대로 담겨요 · 12개', '체크하면 이름표로 떠요 · 12개'])
  })

  it('AC-3505.2: 마지막 시술과 SONO 마지막 부위(부위 + 부위 없이)의 ✕는 꺼진다. 약재·같이 하는 것은 다 뺄 수 있다', () => {
    const board = fx.arrangeMockupBoard()
    board.picks = { ...fx.defaultPicks(), carm: { procs: [{ n: '허리', noDrug: false }], drugs: ['TP'] }, sono: { parts: ['어깨'], plains: ['소독'], withs: ['DNA'] } }
    const app = draw(board)
    openList(app)
    expect(btn(app, '시술', '허리', 'del').disabled).toBe(true)
    expect([btn(app, '시술', '허리', 'up').disabled, btn(app, '시술', '허리', 'down').disabled]).toEqual([true, true])
    expect(btn(app, '약재', 'TP', 'del').disabled).toBe(false)
    btn(app, '약재', 'TP', 'del').click()
    expect(names(app, '약재')).toEqual([])
    add(app, '시술', '목')
    expect(btn(app, '시술', '허리', 'del').disabled).toBe(false)
    tab(app, 'SONO')
    expect(btn(app, '부위', '어깨', 'del').disabled).toBe(false)
    expect(btn(app, '부위 없이', '소독', 'del').disabled).toBe(false)
    btn(app, '부위', '어깨', 'del').click()
    expect(names(app, '부위')).toEqual([])
    expect(btn(app, '부위 없이', '소독', 'del').disabled).toBe(true)
    btn(app, '같이 하는 것', 'DNA', 'del').click()
    expect(names(app, '같이 하는 것')).toEqual([])
  })

  it('AC-3505.2: 저절로 다시 그리기(renderArrange)에도 창·고른 탭·초안·적던 글·초점이 그대로다', () => {
    const app = draw()
    const sheet = openList(app)
    tab(app, 'SONO')
    add(app, '부위', '꼬리')
    const input = groupOf(app, '부위 없이').querySelector('input')!
    input.focus()
    input.value = '적던'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    // 목록이 바뀐 판·띠가 있는 판으로 다시 그려도
    const next = fx.arrangeMockupBoard('11:04:20')
    next.picks!.sono.parts = ['어깨']
    view.renderArrange(app, next, { toast: { text: '띠', undo: false } })
    view.renderArrange(app, next, {})
    expect(listSheet(app)).toBe(sheet)
    expect(tabs(app)).toEqual(sixTabs('SONO'))
    expect(names(app, '부위')).toHaveLength(21)
    expect(names(app, '부위').at(-1)).toBe('꼬리')
    expect(input.isConnected).toBe(true)
    expect(input.value).toBe('적던')
    expect(document.activeElement).toBe(input)
    // 창 안에서 다른 것을 눌러 다시 그려도 적던 글은 남는다
    btn(app, '부위', '목', 'down').click()
    expect(groupOf(app, '부위 없이').querySelector('input')!.value).toBe('적던')
  })
})

// ---- 이름 바꾸기 (reception-arrange-tune AC-3604.2) -----------------------------------------------------------

describe('REQ-3604 이름 바꾸기', () => {
  it('AC-3604.2: 이름을 누르면 그 줄이 글 칸(그 이름) + [바꾸기]·[취소] + "1~10글자 · 같은 이름은 안 돼요"가 되고 글 칸에 초점이 간다. [바꾸기]는 초안의 그 이름만 바꾸고(차례·약재 없음 그대로) [저장]이 넘긴다', () => {
    const onLists = vi.fn(() => true)
    const app = draw(fx.arrangeMockupBoard(), { onLists })
    openList(app)
    nameButton(app, '시술', '목').click()
    expect(renameRows(app)).toHaveLength(1)
    const row = renameRows(app)[0]!
    expect(shapeOf(row)).toEqual(['input.lt-rename', 'button.lt-ok', 'button.lt-no', 'p.lt-hint'])
    const input = renameInput(app)
    expect([input.type, input.maxLength, input.value, input.getAttribute('aria-label')]).toEqual(['text', 10, '목', '목 이름 바꾸기'])
    expect(document.activeElement).toBe(input)
    expect([...row.querySelectorAll('button')].map((b) => [b.textContent, b.getAttribute('type')])).toEqual([
      ['바꾸기', 'button'],
      ['취소', 'button'],
    ])
    expect(textOf(row, 'p.lt-hint')).toBe(RENAME_HINT)
    expect(row.querySelector('p.lt-hint')!.classList.contains('is-bad')).toBe(false)
    // 다른 줄은 그대로
    expect(names(app, '시술')).toEqual(['등', '허리', '리덕션'])
    typeRename(app, '  목뼈 ')
    renameButton(app, 'lt-ok').click()
    expect(renameRows(app)).toHaveLength(0)
    expect(names(app, '시술')).toEqual(['목뼈', '등', '허리', '리덕션'])
    expect(document.activeElement).toBe(nameButton(app, '시술', '목뼈'))
    // 약재 없음 시술의 이름을 바꿔도 약재 없음은 남는다
    nameButton(app, '시술', '리덕션').click()
    typeRename(app, '정복')
    renameButton(app, 'lt-ok').click()
    expect(flags(app)).toEqual(['정복'])
    // 다른 탭도 같다
    tab(app, '충격파')
    nameButton(app, '타수', '6000타').click()
    expect(renameInput(app).getAttribute('aria-label')).toBe('6000타 이름 바꾸기')
    typeRename(app, '5000타')
    renameButton(app, 'lt-ok').click()
    expect(names(app, '타수')).toEqual(['2000타', '3000타', '4000타', '5000타'])
    saveButton(app).click()
    const want = fx.defaultPicks()
    want.carm.procs[0]!.n = '목뼈'
    want.carm.procs[3]!.n = '정복'
    want.eswt.hits[3] = '5000타'
    expect(onLists).toHaveBeenLastCalledWith(want)
  })

  it('AC-3604.2: 이름 규칙(빈 글·10글자 넘음·"|"·제어 글자·무리 안 겹침·SONO 부위와 부위 없이 겹침)에 맞지 않으면 줄을 연 채 안내 글이 빨개지고(is-bad) 적던 글·초점이 남는다. 자기 이름 그대로는 맞고, 개수 한도는 보지 않는다', () => {
    const app = draw()
    openList(app)
    nameButton(app, '시술', '등').click()
    for (const bad of ['', '   ', '가'.repeat(11), '허리|목', '벨\u0007', '목', ' 리덕션 ']) {
      typeRename(app, bad)
      renameButton(app, 'lt-ok').click()
      expect(renameRows(app), JSON.stringify(bad)).toHaveLength(1)
      expect(renameRows(app)[0]!.querySelector('p.lt-hint')!.classList.contains('is-bad'), JSON.stringify(bad)).toBe(true)
      expect(renameInput(app).value, JSON.stringify(bad)).toBe(bad)
      expect(document.activeElement, JSON.stringify(bad)).toBe(renameInput(app))
    }
    expect(textOf(renameRows(app)[0], 'p.lt-hint')).toBe(RENAME_HINT)
    typeRename(app, ' 등 ')
    renameButton(app, 'lt-ok').click()
    expect(renameRows(app)).toHaveLength(0)
    expect(names(app, '시술')).toEqual(['목', '등', '허리', '리덕션'])
    // SONO 부위 ↔ 부위 없이
    tab(app, 'SONO')
    nameButton(app, '부위', '어깨').click()
    typeRename(app, '소독')
    renameButton(app, 'lt-ok').click()
    expect(renameRows(app)).toHaveLength(1)
    typeRename(app, '견갑')
    renameButton(app, 'lt-ok').click()
    expect(names(app, '부위')).toContain('견갑')
    expect(names(app, '부위')).not.toContain('어깨')

    // 한도까지 찬 무리도 이름은 바꿀 수 있다
    document.body.replaceChildren()
    const board = fx.arrangeMockupBoard()
    board.picks = { ...fx.defaultPicks(), pt: Array.from({ length: 8 }, (_, i) => `피${i + 1}`) }
    const full = draw(board)
    openList(full)
    tab(full, 'PT')
    nameButton(full, '종류', '피1').click()
    typeRename(full, 'TENS')
    renameButton(full, 'lt-ok').click()
    expect(names(full, '종류')[0]).toBe('TENS')
    expect(names(full, '종류')).toHaveLength(8)
  })

  it('AC-3604.2: 글 칸의 Enter는 [바꾸기], Esc는 바꾸기 줄만 닫고 창은 둔다. [취소]도 바꾸지 않고 닫는다', () => {
    const app = draw()
    openList(app)
    nameButton(app, '약재', 'TP').click()
    typeRename(app, 'TP2')
    renameKey(app, 'Enter')
    expect(renameRows(app)).toHaveLength(0)
    expect(names(app, '약재')).toEqual(['TP2', '하프', '기본'])
    nameButton(app, '약재', '하프').click()
    typeRename(app, '반')
    renameKey(app, 'Escape')
    expect(listSheet(app)).not.toBeNull()
    expect(renameRows(app)).toHaveLength(0)
    expect(names(app, '약재')).toEqual(['TP2', '하프', '기본'])
    expect(document.activeElement).toBe(nameButton(app, '약재', '하프'))
    nameButton(app, '약재', '기본').click()
    typeRename(app, '반')
    renameButton(app, 'lt-no').click()
    expect(renameRows(app)).toHaveLength(0)
    expect(names(app, '약재')).toEqual(['TP2', '하프', '기본'])
    // 바꾸기 줄이 없을 때 Esc는 창을 닫는다(지금 그대로)
    listSheet(app)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(listSheet(app)).toBeNull()
  })

  it('AC-3604.2: 한 번에 한 줄이다: 다른 이름을 누르면 그 줄로 옮기고, 다른 탭·▲·▼·✕를 누르면 바꾸던 줄이 닫힌다. [더하기]는 닫지 않는다', () => {
    const app = draw()
    openList(app)
    nameButton(app, '시술', '목').click()
    typeRename(app, '적던')
    nameButton(app, '약재', 'TP').click()
    expect(renameRows(app)).toHaveLength(1)
    expect(renameInput(app).value).toBe('TP')
    expect(names(app, '시술')).toEqual(['목', '등', '허리', '리덕션'])
    renameButton(app, 'lt-no').click()
    for (const shut of [
      () => btn(app, '시술', '목', 'down').click(),
      () => btn(app, '시술', '목', 'up').click(),
      () => btn(app, '시술', '허리', 'del').click(),
      () => {
        tab(app, 'SONO')
        tab(app, 'C-ARM')
      },
    ]) {
      nameButton(app, '약재', 'TP').click()
      expect(renameRows(app)).toHaveLength(1)
      shut()
      expect(renameRows(app)).toHaveLength(0)
    }
    expect(names(app, '시술')).toEqual(['목', '등', '리덕션'])
    expect(names(app, '약재')).toEqual(['TP', '하프', '기본'])
    nameButton(app, '약재', '기본').click()
    typeRename(app, '반')
    add(app, '시술', '꼬리뼈')
    expect(renameRows(app)).toHaveLength(1)
    expect(renameInput(app).value).toBe('반')
    expect(names(app, '시술').at(-1)).toBe('꼬리뼈')
  })

  it('AC-3604.2: 저절로 다시 그리기(renderArrange)에도 바꾸던 줄·글·초점이 남는다', () => {
    const app = draw()
    openList(app)
    tab(app, '견인')
    nameButton(app, '부위', '허리').click()
    typeRename(app, '허리뼈')
    const input = renameInput(app)
    view.renderArrange(app, fx.arrangeMockupBoard('11:04:20'), { toast: { text: '띠', undo: false } })
    view.renderArrange(app, fx.arrangeMockupBoard('11:04:25'), {})
    expect(renameInput(app)).toBe(input)
    expect(input.value).toBe('허리뼈')
    expect(document.activeElement).toBe(input)
    renameButton(app, 'lt-ok').click()
    expect(names(app, '부위')).toEqual(['목', '허리뼈'])
  })

  it('AC-3604.1 · AC-3604.2: 새 탭·바꾸기 줄이 그리는 class는 모두 style.css에 모양이 있고, 탭 줄은 넘치면 옆으로 밀린다. 빨간 안내는 theme 빨강이다. 이름은 글자로만 들어간다', () => {
    const css = readWww('style.css').replace(/\/\*[\s\S]*?\*\//g, '')
    const app = draw()
    openList(app)
    const classes = new Set<string>()
    const collect = () => {
      for (const n of [app, ...app.querySelectorAll('*')]) for (const c of n.classList) classes.add(c)
    }
    for (const name of TAB_NAMES) {
      tab(app, name)
      collect()
    }
    nameButton(app, '부위', '목').click()
    typeRename(app, '')
    renameButton(app, 'lt-ok').click()
    collect()
    for (const cls of ['lt-name', 'is-rename', 'lt-rename', 'lt-ok', 'lt-no', 'lt-hint', 'is-bad']) expect(classes.has(cls), cls).toBe(true)
    for (const cls of classes) expect(css, `.${cls}`).toMatch(new RegExp(`\\.${cls}(?![\\w-])`))
    expect(cssValue('.lt-tabs', 'overflow-x')).toBe('auto')
    expect(cssValue('.lt-tab', 'white-space')).toBe('nowrap')
    expect(cssValue('.lt-tab', 'flex-shrink')).toBe('0')
    expect(cssValue('button.lt-name', 'cursor')).toBe('pointer')
    expect(cssValue('.lt-hint.is-bad', 'color')).toBe('var(--memo-red)')
    expect(cssValue('.lt-row.is-rename', 'flex-wrap')).toBe('wrap')
    expect(cssValue('.lt-hint', 'flex-basis')).toBe('100%')
    // 이름에 HTML을 넣어도 글자로만
    document.body.replaceChildren()
    const odd = fx.arrangeMockupBoard()
    odd.picks!.pt = ['<b>ICE</b>']
    const drawn = draw(odd)
    openList(drawn)
    tab(drawn, 'PT')
    expect(names(drawn, '종류')).toEqual(['<b>ICE</b>'])
    nameButton(drawn, '종류', '<b>ICE</b>').click()
    expect(renameInput(drawn).value).toBe('<b>ICE</b>')
    expect(renameInput(drawn).getAttribute('aria-label')).toBe('<b>ICE</b> 이름 바꾸기')
    expect(drawn.querySelector('.list-sheet b')).toBeNull()
  })
})

// ---- 저장 · 닫기 (AC-3505.3) -------------------------------------------------------------------------------

describe('REQ-3505 저장·닫기', () => {
  it('AC-3505.3: [저장]은 초안 전체(판 picks 모양)를 onLists로 넘기고, 참이면 창을 닫고 거짓이면 창·초안을 그대로 둔다. 기다리는 동안 [저장]은 꺼져 있다', async () => {
    let answer: (ok: boolean) => void = () => {}
    const onLists = vi.fn(() => new Promise<boolean>((resolve) => (answer = resolve)))
    const app = draw(fx.arrangeMockupBoard(), { onLists })
    openList(app)
    flag(app, '목')
    btn(app, '약재', '기본', 'del').click()
    tab(app, 'SONO')
    add(app, '같이 하는 것', '주사')
    saveButton(app).click()
    const want = fx.defaultPicks()
    want.carm.procs[0]!.noDrug = true
    want.carm.drugs = ['TP', '하프']
    want.sono.withs = ['DNA', '채혈', '주사']
    expect(onLists).toHaveBeenCalledTimes(1)
    expect(onLists).toHaveBeenLastCalledWith(want)
    expect(saveButton(app).disabled).toBe(true)
    saveButton(app).click()
    expect(onLists).toHaveBeenCalledTimes(1)
    answer(false)
    await flush()
    expect(listSheet(app)).not.toBeNull()
    expect(saveButton(app).disabled).toBe(false)
    expect(names(app, '같이 하는 것')).toEqual(['DNA', '채혈', '주사'])
    saveButton(app).click()
    expect(onLists).toHaveBeenCalledTimes(2)
    answer(true)
    await flush()
    expect(listSheet(app)).toBeNull()
    // 다시 열면 판 picks의 새 사본이다
    openList(app)
    expect(names(app, '약재')).toEqual(['TP', '하프', '기본'])
  })

  it('AC-3604.5: [저장]은 판 picks의 PT·도수·충격파(타수·부위 수)·견인 무리도 초안 그대로 넘긴다(받은 판은 바꾸지 않는다)', () => {
    const onLists = vi.fn(() => true)
    const board = fx.arrangeMockupBoard()
    board.picks!.pt = ['TENS', 'ICE']
    board.picks!.ds = ['20분']
    board.picks!.eswt = { hits: [], counts: ['한 부위'] }
    board.picks!.trac = ['골반']
    const before = JSON.stringify(board)
    const app = draw(board, { onLists })
    openList(app)
    add(app, '약재', '반')
    saveButton(app).click()
    const want = JSON.parse(before).picks as FakePicks
    want.carm.drugs.push('반')
    expect(onLists).toHaveBeenLastCalledWith(want)
    expect(Object.keys(onLists.mock.calls[0]![0] as object)).toEqual(['carm', 'sono', 'pt', 'ds', 'eswt', 'trac'])
    expect(JSON.stringify(board)).toBe(before)
  })

  it('AC-3505.3: [취소]·창 바깥 누름·Esc는 저장하지 않고 닫는다. 창 안을 누르면 닫히지 않는다', () => {
    const onLists = vi.fn(() => true)
    const app = draw(fx.arrangeMockupBoard(), { onLists })
    for (const shut of [
      (root: HTMLElement) => listSheet(root)!.querySelector<HTMLButtonElement>(':scope > .sheet-go > button.sheet-close')!.click(),
      (root: HTMLElement) => root.querySelector<HTMLElement>('.sheet-back.list-back')!.click(),
      (root: HTMLElement) => listSheet(root)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    ]) {
      openList(app)
      add(app, '시술', '꼬리뼈')
      listSheet(app)!.click()
      expect(listSheet(app)).not.toBeNull()
      shut(app)
      expect(listSheet(app)).toBeNull()
    }
    openList(app)
    expect(names(app, '시술')).toEqual(['목', '등', '허리', '리덕션'])
    expect(onLists).not.toHaveBeenCalled()
  })

  it('AC-3505.1: 목록 고치기 창·단추가 그리는 class는 모두 style.css에 모양이 있고 단추·탭·글 칸은 44px 이상이다. 목록 글은 글자로만 들어간다', () => {
    const css = readWww('style.css').replace(/\/\*[\s\S]*?\*\//g, '')
    const app = draw()
    openList(app)
    const classes = new Set<string>()
    const collect = () => {
      for (const n of [app, ...app.querySelectorAll('*')]) for (const c of n.classList) classes.add(c)
    }
    collect()
    tab(app, 'SONO')
    collect()
    for (const cls of ['list-open', 'list-icon', 'list-back', 'list-sheet', 'lt-tabs', 'lt-tab', 'lt-fixed', 'lt-groups', 'lt-group', 'lt-list', 'lt-row', 'lt-name', 'lt-flag', 'lt-btn', 'del', 'lt-add', 'lt-foot-note'])
      expect(classes.has(cls), cls).toBe(true)
    for (const cls of classes) expect(css, `.${cls}`).toMatch(new RegExp(`\\.${cls}(?![\\w-])`))
    for (const selector of ['.list-open', '.lt-tab', '.lt-add input', '.lt-add button', '.sheet-close', '.sheet-go > .go', '.lt-row']) {
      const value = cssValue(selector, 'min-height')
      expect(value, selector).toBeDefined()
      expect(Number.parseFloat(value!), selector).toBeGreaterThanOrEqual(44)
    }
    expect(cssValue('.lt-btn.del', 'color')).toBe('var(--memo-red)')
    // 목록 글에 HTML을 넣어도 글자로만
    document.body.replaceChildren()
    const odd = fx.arrangeMockupBoard()
    odd.picks!.carm.procs = [{ n: '<b>허리</b>', noDrug: false }]
    const drawn = draw(odd)
    openList(drawn)
    add(drawn, '약재', '<i>반</i>')
    expect(names(drawn, '시술')).toEqual(['<b>허리</b>'])
    expect(names(drawn, '약재').at(-1)).toBe('<i>반</i>')
    expect(drawn.querySelector('.list-sheet b, .list-sheet i')).toBeNull()
  })
})

// ---- 화면 파일 (AC-3505.4) -----------------------------------------------------------------------------

describe('REQ-3505 화면 파일은 목록 글을 갖지 않는다', () => {
  it('AC-3505.4 · AC-3604.4: reception/www의 화면 파일은 기본 목록 이름(C-ARM·SONO·PT·도수·충격파 타수와 부위 수·견인)을 글자 상수로 갖고 있지 않다. 목록은 판 picks뿐이다', () => {
    const d = fx.defaultPicks()
    const listNames = [
      ...new Set([...d.carm.procs.map((p) => p.n), ...d.carm.drugs, ...d.sono.parts, ...d.sono.plains, ...d.sono.withs, ...d.pt, ...d.ds, ...d.eswt.hits, ...d.eswt.counts, ...d.trac]),
    ]
    expect(listNames.length).toBeGreaterThan(40)
    const files = readdirSync(WWW).filter((f) => /\.(?:js|html|css)$/.test(f))
    expect(files).toContain('picks.js')
    const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
    for (const file of files) {
      const code = readFileSync(path.join(WWW, file), 'utf8')
      for (const name of listNames) expect(code, `${file}: ${name}`).not.toMatch(new RegExp(`['"\`]${escape(name)}['"\`]`))
    }
  })

  it('AC-3505.4: picks.js는 화면 파일만 불러오고 HTML 넣기·브라우저 저장소·console·eval·fetch를 쓰지 않는다(목록을 브라우저 저장소에 두지 않는다)', () => {
    const source = readWww('picks.js')
    expect(source.length).toBeGreaterThan(0)
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(code).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|DOMParser|localStorage|sessionStorage|indexedDB|\bcaches\b|cookie|serviceWorker|console|\beval\b|new Function|\bfetch\b|XMLHttpRequest|WebSocket|sendBeacon/)
    for (const m of code.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) expect(m[1]).toMatch(/^\.\/[\w-]+\.js$/)
  })
})
