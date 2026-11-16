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
  return [...groupOf(root, label).querySelectorAll(':scope > ul.lt-list > li.lt-row > span.lt-name')].map((n) => n.textContent ?? '')
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
  it('AC-3505.1: 어레인지 머리의 [목록 고치기]를 누르면 창 "고르기 목록 고치기"가 열린다: 탭 C-ARM(시술·약재)·SONO, 줄마다 ▲ ▼ ✕(시술은 [약재 없음]도), 무리마다 글 칸 + [더하기], 아래 안내 글, [취소]·[저장]', () => {
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
    expect(textsOf(sheet, '.sheet-h > span')).toEqual(['고르기 목록 고치기', '칸을 넣을 때 보이는 단추를 정해요'])
    expect(tabs(app)).toEqual([
      ['C-ARM', true],
      ['SONO', false],
    ])
    expect(groups(app).map(headOf)).toEqual([
      ['시술', '하나 골라요 · 4개'],
      ['약재', '하나 골라요 · 3개'],
    ])
    expect(names(app, '시술')).toEqual(['목', '등', '허리', '리덕션'])
    expect(names(app, '약재')).toEqual(['TP', '하프', '기본'])
    const row = rowOf(app, '시술', '목')
    expect(shapeOf(row)).toEqual(['span.lt-name', 'button.lt-flag', 'button.lt-btn', 'button.lt-btn', 'button.lt-btn.del'])
    expect([...row.querySelectorAll('button')].map((b) => [b.textContent, b.getAttribute('aria-label'), b.getAttribute('type')])).toEqual([
      ['약재 없음', null, 'button'],
      ['▲', '위로', 'button'],
      ['▼', '아래로', 'button'],
      ['✕', '빼기', 'button'],
    ])
    expect(flags(app)).toEqual(['리덕션'])
    expect(shapeOf(rowOf(app, '약재', 'TP'))).toEqual(['span.lt-name', 'button.lt-btn', 'button.lt-btn', 'button.lt-btn.del'])
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
    expect(tabs(app)).toEqual([
      ['C-ARM', false],
      ['SONO', true],
    ])
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
    board.picks = { carm: { procs: [{ n: '허리', noDrug: false }], drugs: ['TP'] }, sono: { parts: ['어깨'], plains: ['소독'], withs: ['DNA'] } }
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
    expect(tabs(app)).toEqual([
      ['C-ARM', false],
      ['SONO', true],
    ])
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
