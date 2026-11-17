// @vitest-environment jsdom
// 고르기 목록 picks.js (reception-pick-lists REQ-3505 · reception-arrange-tune REQ-3604 → reception-other-clinic TASK-7 AC-5713.7).
// 옛 목록 고치기 창(어레인지 머리 [☰ 목록 고치기] · POST /api/lists)은 칸 고치기 창(settings.js openColEditor)의 [고르기 목록] 탭이 되었다.
// 칸 하나의 목록만 보이고, 초안은 설정 문서 picks의 사본이며 [저장]이 설정 문서 전체를 ctx.onSave로 넘긴다(보내기·띠는 app.js,
// settings-app.test.ts·arrange-app.test.ts). 옛 시험이 지키던 것(창 모양·줄 고치기·이름 규칙·개수 한도·이름 바꾸기·다시 그리기·저장·닫기·
// 글자로만 넣기·화면 파일 울타리)을 칸마다 그대로 본다. 자료는 가짜다(fixtures.ts)
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import * as fx from './fixtures'
import type { FakeBoard, FakeCode, FakeSettings } from './fixtures'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const WWW = path.join(ROOT, 'reception', 'www')
/** 다른 병원용 승인 시안 (칸 고치기 창의 고르기 목록 탭) */
const MOCKUP = path.join(ROOT, 'docs', 'mockups', 'reception-other-clinic', 'index.html')
const NOTES = path.join(ROOT, 'docs', 'mockups', 'reception-other-clinic', 'notes.md')

/** [고르기 목록] 탭 위 글 (AC-5713.7) */
const LIST_TOP = '칸을 넣을 때 보이는 단추예요 · 이름을 누르면 바꿀 수 있어요 · 모든 줄에서 여러 개를 함께 고를 수 있어요'
/** SONO·충격파 고정 글 (AC-3604.1, 시안 그대로) */
const SONO_FIXED = '쪽(오른쪽·왼쪽·양쪽)은 늘 있어요. 부위 앞에 붙어 "오른 어깨"처럼 보여요.'
const ESWT_FIXED = '칸에는 "3000타 2부위"처럼 타수와 부위 수가 함께 보여요.'
/** 이름 바꾸기 줄 안내 (AC-3604.2) */
const RENAME_HINT = '1~10글자 · 같은 이름은 안 돼요'
const EMPTY = '아직 없어요. 아래에 적고 [더하기]를 눌러요'
const FOOT = '저장하면 모든 폰·태블릿 화면이 바로 바뀌어요. 이미 표에 넣은 칸은 그대로예요.'
const NEED = '하나 이상 골라요'
const FREE = '안 골라도 돼요'

type SaveResult = 'ok' | 'conflict' | 'fail'
type OnSave = (next: FakeSettings, text: string, opts: { undo: boolean }) => Promise<SaveResult> | SaveResult

interface Ctx {
  doc: () => FakeSettings
  tab?: 'rx' | 'list'
  back?: 'sheet' | null
  onSave: OnSave
  getCodes: () => Promise<FakeCode[]>
  getCodeName: (code: string) => Promise<string | null>
}

interface SettingsJs {
  renderSettings: (host: HTMLElement, settings: FakeSettings | null, view?: Record<string, unknown>) => HTMLElement
  openColEditor: (page: HTMLElement, key: string, ctx: Ctx) => HTMLElement
}

interface ArrangeJs {
  renderArrange: (host: HTMLElement, board: FakeBoard, view?: Record<string, unknown>) => HTMLElement
}

// 화면 파일은 빌드 없는 JS라 형 선언이 없다. 경로를 값으로 두어 형 검사가 묻지 않게 한다
const SETTINGS_JS = '../www/settings.js'
const ARRANGE_JS = '../www/arrange.js'
let ui: SettingsJs
let arrange: ArrangeJs

beforeAll(async () => {
  const none = () => {
    throw new Error('settings.js 없음')
  }
  const missing: SettingsJs = { renderSettings: none, openColEditor: none }
  ui = ((await import(/* @vite-ignore */ SETTINGS_JS).catch(() => missing)) ?? missing) as SettingsJs
  arrange = (await import(/* @vite-ignore */ ARRANGE_JS)) as ArrangeJs
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

/** 설정 쪽을 그리고 칸 key의 칸 고치기 창을 [고르기 목록] 탭으로 연다 */
function open(key: string, settings: FakeSettings = fx.oursSettings(), more: Partial<Ctx> = {}) {
  const app = appHost()
  const page = ui.renderSettings(app, settings, { state: 'ok' })
  const ctx = {
    doc: () => settings,
    tab: 'list' as const,
    getCodes: () => Promise.resolve(fx.fakeCodes()),
    getCodeName: () => Promise.resolve(null),
    ...more,
    onSave: (more.onSave as ReturnType<typeof vi.fn>) ?? vi.fn<OnSave>(() => Promise.resolve('ok')),
  } as Ctx & { onSave: ReturnType<typeof vi.fn> }
  ui.openColEditor(page, key, ctx)
  return { app, page, ctx, settings }
}

/** 마지막 [저장]이 넘긴 문서의 picks */
function savedPicks(ctx: { onSave: ReturnType<typeof vi.fn> }) {
  return (ctx.onSave.mock.calls.at(-1)![0] as FakeSettings).picks
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

function listSheet(root: ParentNode): HTMLElement | null {
  return root.querySelector<HTMLElement>('.sheet-back.list-back > .sheet.list-sheet')
}

/** 창 탭 아래 몸(고르기 목록 탭이면 위 글 · 고정 글 · 무리들) */
function bodyOf(root: ParentNode): HTMLElement {
  return listSheet(root)!.querySelector<HTMLElement>(':scope > .col-body')!
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
  return [...root.querySelectorAll<HTMLElement>('.list-sheet > .col-body > .lt-groups > section.lt-group')]
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
  for (let i = 0; i < 3; i += 1) await new Promise((resolve) => setTimeout(resolve, 0))
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

/** 넷째부터 쓰는 처음 일곱 칸 가운데 목록이 있는 여섯 [열쇠, 이름] */
const LIST_COLS = [
  ['carm', 'C-ARM'],
  ['sono', 'SONO'],
  ['pt', 'PT'],
  ['ds', '도수'],
  ['eswt', '충격파'],
  ['trac', '견인'],
] as const

// ---- 창 (AC-3505.1 · AC-3604.1 · AC-5713.7) ---------------------------------------------------------------

describe('REQ-3505 · REQ-5713 고르기 목록 탭', () => {
  it('AC-3505.1 · AC-3604.1 · AC-5713.7: C-ARM 칸 고치기 창의 [고르기 목록]은 위 글 + 시술·약재 무리이고 줄마다 이름 단추 ▲ ▼ ✕(시술은 [약재 없음]도), 무리마다 글 칸 + [더하기], 아래 글, [취소]·[저장]이다. SONO는 고정 글 + 부위·부위 없이·같이 하는 것, 빈 무리는 빈 글이다', () => {
    const { app } = open('carm')
    const sheet = listSheet(app)!
    expect([sheet.getAttribute('role'), sheet.getAttribute('aria-modal'), sheet.getAttribute('aria-label')]).toEqual(['dialog', 'true', 'C-ARM 칸 고치기'])
    expect(app.querySelectorAll('.sheet-back').length).toBe(1)
    expect(tabs(app)).toEqual([
      ['넣을 처방 · 2개', false],
      ['고르기 목록', true],
    ])
    expect(shapeOf(bodyOf(app))).toEqual(['p.hint.lt-top', 'div.lt-groups'])
    expect(textOf(bodyOf(app), ':scope > p.lt-top')).toBe(LIST_TOP)
    expect(groups(app).map(headOf)).toEqual([
      ['시술', `${NEED} · 4개`],
      ['약재', `${FREE} · 3개`],
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
    expect(textOf(sheet, ':scope > p.lt-foot-note')).toBe(FOOT)
    expect(shapeOf(sheet.querySelector(':scope > .sheet-go'))).toEqual(['button.sheet-close', 'button.go'])
    expect(textsOf(sheet, ':scope > .sheet-go > button')).toEqual(['취소', '저장'])

    document.body.replaceChildren()
    const sono = open('sono').app
    expect(shapeOf(bodyOf(sono))).toEqual(['p.hint.lt-top', 'p.lt-fixed', 'div.lt-groups'])
    expect(textOf(bodyOf(sono), ':scope > p.lt-fixed')).toBe(SONO_FIXED)
    expect(groups(sono).map(headOf)).toEqual([
      ['부위', `${FREE} · 20개`],
      ['부위 없이', `${FREE} · 3개`],
      ['같이 하는 것', `${FREE} · 2개`],
    ])
    expect(names(sono, '부위')).toEqual(fx.defaultPicks().sono.parts)
    expect(names(sono, '부위 없이')).toEqual(['소독', 'S/O', '봉합'])
    expect(names(sono, '같이 하는 것')).toEqual(['DNA', '채혈'])
    expect(listSheet(sono)!.querySelector('.lt-flag')).toBeNull()
    expect(groupOf(sono, '부위 없이').querySelector('input')!.placeholder).toBe('새 부위 없이')

    // 빈 무리
    document.body.replaceChildren()
    const settings = fx.oursSettings()
    settings.picks.carm.drugs = []
    const empty = open('carm', settings).app
    expect(shapeOf(groupOf(empty, '약재'))).toEqual(['h3', 'div.lt-empty', 'form.lt-add'])
    expect(textOf(groupOf(empty, '약재'), '.lt-empty')).toBe(EMPTY)
    expect(headOf(groupOf(empty, '약재'))).toEqual(['약재', `${FREE} · 0개`])
  })

  it('AC-3604.1 · AC-5713.7: PT(종류)·도수(시간)·충격파(타수 · 부위 수 + 고정 글)·견인(부위) 칸 고치기 창은 [고르기 목록] 탭 하나이고 시안 글 그대로, 줄마다 이름 단추 ▲ ▼ ✕(약재 없음 없음)와 글 칸 + [더하기]가 있다', () => {
    const plain = ['p.hint.lt-top', 'div.lt-groups']
    for (const [key, name, shape, heads, lists, holders] of [
      ['pt', 'PT', plain, [['종류', `${NEED} · 2개`]], [['ICE', 'HP']], ['새 종류']],
      ['ds', '도수', plain, [['시간', `${NEED} · 2개`]], [['30분', '50분']], ['새 시간']],
      [
        'eswt',
        '충격파',
        ['p.hint.lt-top', 'p.lt-fixed', 'div.lt-groups'],
        [
          ['타수', `${FREE} · 4개`],
          ['부위 수', `${NEED} · 4개`],
        ],
        [
          ['2000타', '3000타', '4000타', '6000타'],
          ['1부위', '2부위', '3부위', '4부위'],
        ],
        ['새 타수', '새 부위 수'],
      ],
      ['trac', '견인', plain, [['부위', `${NEED} · 2개`]], [['목', '허리']], ['새 부위']],
    ] as const) {
      const { app } = open(key)
      const sheet = listSheet(app)!
      expect(sheet.getAttribute('aria-label'), name).toBe(`${name} 칸 고치기`)
      expect(textOf(sheet, '.sheet-title'), name).toBe(`${name} 칸 고치기`)
      expect(tabs(app), name).toEqual([['고르기 목록', true]])
      expect(shapeOf(bodyOf(app)), name).toEqual(shape)
      expect(groups(app).map(headOf), name).toEqual(heads)
      expect(groups(app).map((g) => names(app, headOf(g)[0])), name).toEqual(lists)
      expect(groups(app).map((g) => g.querySelector('form.lt-add > input')!.getAttribute('placeholder')), name).toEqual(holders)
      expect(sheet.querySelector('.lt-flag'), name).toBeNull()
      const first = groups(app)[0]!.querySelector(':scope > ul.lt-list > li.lt-row')!
      expect(shapeOf(first), name).toEqual(['button.lt-name', 'button.lt-btn', 'button.lt-btn', 'button.lt-btn.del'])
      expect(textOf(sheet, ':scope > p.lt-foot-note'), name).toBe(FOOT)
      if (key === 'eswt') expect(textOf(bodyOf(app), ':scope > p.lt-fixed')).toBe(ESWT_FIXED)
      document.body.replaceChildren()
    }
    // 시안 글 그대로
    const html = readFileSync(MOCKUP, 'utf8')
    for (const text of [
      SONO_FIXED,
      ESWT_FIXED,
      LIST_TOP,
      "lists: [{ label: '종류', min: 1, items: ['ICE', 'HP'] }]",
      "lists: [{ label: '시간', min: 1, items: ['30분', '50분'] }]",
      "{ label: '타수', min: 0, items:",
      "{ label: '부위 수', min: 1, items:",
      "lists: [{ label: '부위', min: 1, items: ['목', '허리'] }]",
      "{ label: '시술', min: 1, flag: true,",
      "{ label: '약재', min: 0, items:",
      "`${g.min ? '하나 이상 골라요' : '안 골라도 돼요'} · ${g.items.length}개`",
    ])
      expect(html, text).toContain(text)
    expect(readFileSync(NOTES, 'utf8')).toContain(RENAME_HINT)
  })

  it('AC-3604.1 · AC-5713.7: 칸마다 [더하기]·▲·▼·✕는 초안만 바꾸고(이름 규칙·개수 한도 8 그대로) [저장]이 그 칸 목록을 넣은 설정 문서를 넘긴다. 받은 문서는 바꾸지 않는다', () => {
    const settings = fx.oursSettings()
    const before = JSON.stringify(settings)
    const pt = open('pt', settings)
    add(pt.app, '종류', ' TENS ')
    add(pt.app, '종류', 'ICE')
    add(pt.app, '종류', '가'.repeat(11))
    add(pt.app, '종류', 'IR|HP')
    expect(names(pt.app, '종류')).toEqual(['ICE', 'HP', 'TENS'])
    expect(groupOf(pt.app, '종류').querySelector('input')!.value).toBe('IR|HP')
    btn(pt.app, '종류', 'TENS', 'up').click()
    expect(names(pt.app, '종류')).toEqual(['ICE', 'TENS', 'HP'])
    expect(pt.ctx.onSave).not.toHaveBeenCalled()
    saveButton(pt.app).click()
    expect(savedPicks(pt.ctx)).toEqual({ ...fx.defaultPicks(), pt: ['ICE', 'TENS', 'HP'], extra: {} })
    document.body.replaceChildren()

    const ds = open('ds', settings)
    btn(ds.app, '시간', '50분', 'up').click()
    expect(names(ds.app, '시간')).toEqual(['50분', '30분'])
    saveButton(ds.app).click()
    expect(savedPicks(ds.ctx)).toEqual({ ...fx.defaultPicks(), ds: ['50분', '30분'], extra: {} })
    document.body.replaceChildren()

    const eswt = open('eswt', settings)
    btn(eswt.app, '타수', '6000타', 'del').click()
    add(eswt.app, '부위 수', '5부위')
    add(eswt.app, '타수', '1부위')
    expect(names(eswt.app, '타수')).toEqual(['2000타', '3000타', '4000타', '1부위'])
    saveButton(eswt.app).click()
    expect(savedPicks(eswt.ctx)).toEqual({
      ...fx.defaultPicks(),
      eswt: { hits: ['2000타', '3000타', '4000타', '1부위'], counts: ['1부위', '2부위', '3부위', '4부위', '5부위'] },
      extra: {},
    })
    document.body.replaceChildren()

    const trac = open('trac', settings)
    add(trac.app, '부위', '골반')
    btn(trac.app, '부위', '목', 'down').click()
    expect(names(trac.app, '부위')).toEqual(['허리', '목', '골반'])
    saveButton(trac.app).click()
    expect(savedPicks(trac.ctx)).toEqual({ ...fx.defaultPicks(), trac: ['허리', '목', '골반'], extra: {} })
    expect(JSON.stringify(settings)).toBe(before)
    document.body.replaceChildren()

    // 개수 한도 8
    const full = fx.oursSettings()
    const eight = (head: string) => Array.from({ length: 8 }, (_, i) => `${head}${i + 1}`)
    full.picks = { ...full.picks, pt: eight('피'), ds: eight('도'), eswt: { hits: eight('타'), counts: eight('수') }, trac: eight('견') }
    for (const [key, labels] of [
      ['pt', ['종류']],
      ['ds', ['시간']],
      ['eswt', ['타수', '부위 수']],
      ['trac', ['부위']],
    ] as const) {
      const big = open(key, full).app
      for (const label of labels) {
        add(big, label, '더')
        expect(headOf(groupOf(big, label))[1], label).toMatch(/ · 8개$/)
        expect(groupOf(big, label).querySelector('input')!.value, label).toBe('더')
      }
      document.body.replaceChildren()
    }
  })

  it('AC-3604.3: PT 종류·도수 시간·충격파 부위 수·견인 부위의 마지막 하나는 ✕가 꺼지고, 충격파 타수는 다 뺄 수 있다(C-ARM 약재는 그대로)', () => {
    const settings = fx.oursSettings()
    settings.picks = { ...settings.picks, pt: ['ICE'], ds: ['30분'], eswt: { hits: ['2000타'], counts: ['1부위'] }, trac: ['목'] }
    const pt = open('pt', settings).app
    expect(btn(pt, '종류', 'ICE', 'del').disabled).toBe(true)
    btn(pt, '종류', 'ICE', 'del').click()
    expect(names(pt, '종류')).toEqual(['ICE'])
    add(pt, '종류', 'HP')
    expect(btn(pt, '종류', 'ICE', 'del').disabled).toBe(false)
    btn(pt, '종류', 'ICE', 'del').click()
    expect(names(pt, '종류')).toEqual(['HP'])
    expect(btn(pt, '종류', 'HP', 'del').disabled).toBe(true)
    document.body.replaceChildren()
    expect(btn(open('ds', settings).app, '시간', '30분', 'del').disabled).toBe(true)
    document.body.replaceChildren()
    const eswt = open('eswt', settings).app
    expect(btn(eswt, '부위 수', '1부위', 'del').disabled).toBe(true)
    expect(btn(eswt, '타수', '2000타', 'del').disabled).toBe(false)
    btn(eswt, '타수', '2000타', 'del').click()
    expect(names(eswt, '타수')).toEqual([])
    expect(textOf(groupOf(eswt, '타수'), '.lt-empty')).toBe(EMPTY)
    document.body.replaceChildren()
    expect(btn(open('trac', settings).app, '부위', '목', 'del').disabled).toBe(true)
    document.body.replaceChildren()
    expect(btn(open('carm', settings).app, '약재', 'TP', 'del').disabled).toBe(false)
  })

  it('AC-3505.1 · AC-5711.4: 칸 고치기 창은 다시 열어도 하나다. 어레인지 화면(.page.arrange) 안에서도 열리고 renderArrange가 다시 그려도 지우지 않는다', () => {
    const { page, ctx, app } = open('pt')
    ui.openColEditor(page, 'pt', ctx)
    ui.openColEditor(page, 'ds', ctx)
    expect(app.querySelectorAll('.sheet-back.list-back').length).toBe(1)
    document.body.replaceChildren()

    const host = appHost()
    const board = fx.arrangeMockupBoard()
    const table = arrange.renderArrange(host, board, {})
    ui.openColEditor(table, 'trac', ctx)
    const sheet = listSheet(host)
    expect(sheet).not.toBeNull()
    expect(host.querySelector('.page.arrange > .sheet-back.list-back')).not.toBeNull()
    arrange.renderArrange(host, board, { toast: { text: '띠', undo: false } })
    expect(listSheet(host)).toBe(sheet)
    expect(names(host, '부위')).toEqual(['목', '허리'])
  })
})

// ---- 초안 고치기 (AC-3505.2) ----------------------------------------------------------------------------

describe('REQ-3505 초안 고치기', () => {
  it('AC-3505.2: [더하기]·▲·▼·✕·[약재 없음]은 창 안 초안만 바꾸고 문서·onSave는 그대로다. [더하기]는 앞뒤 빈칸을 빼고 끝에 더하고 글 칸을 비운 뒤 그 칸에 초점을 둔다. 탭을 오가도 초안은 그대로다', () => {
    const settings = fx.oursSettings()
    const before = JSON.stringify(settings)
    const carm = open('carm', settings)
    const app = carm.app
    add(app, '시술', '  꼬리뼈 ')
    expect(names(app, '시술')).toEqual(['목', '등', '허리', '리덕션', '꼬리뼈'])
    expect(headOf(groupOf(app, '시술'))).toEqual(['시술', `${NEED} · 5개`])
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
    // 탭을 돌아가도 초안은 그대로
    tab(app, '넣을 처방 · 2개')
    expect(groups(app)).toEqual([])
    tab(app, '고르기 목록')
    expect(names(app, '시술')).toEqual(['목', '리덕션', '허리', '꼬리뼈'])
    expect(flags(app)).toEqual(['목'])
    expect(carm.ctx.onSave).not.toHaveBeenCalled()
    document.body.replaceChildren()

    const sono = open('sono', settings)
    add(sono.app, '부위', '꼬리')
    btn(sono.app, '부위 없이', '봉합', 'up').click()
    btn(sono.app, '같이 하는 것', 'DNA', 'del').click()
    expect(names(sono.app, '부위').at(-1)).toBe('꼬리')
    expect(names(sono.app, '부위 없이')).toEqual(['소독', '봉합', 'S/O'])
    expect(names(sono.app, '같이 하는 것')).toEqual(['채혈'])
    expect(sono.ctx.onSave).not.toHaveBeenCalled()
    expect(JSON.stringify(settings)).toBe(before)
  })

  it('AC-3505.2: 도우미 목록 규칙에 어긋나는 이름(빈 글·10글자 넘음·"|"·제어 글자·무리 안 겹침·SONO 부위와 부위 없이 겹침·개수 한도)은 더하지 않고 적던 글을 그대로 둔다', () => {
    const app = open('carm').app
    for (const bad of ['', '   ', '가'.repeat(11), '허리|목', '벨\u0007', '탭\t글', '목', ' 목 ']) {
      add(app, '시술', bad)
      expect(names(app, '시술'), JSON.stringify(bad)).toEqual(['목', '등', '허리', '리덕션'])
    }
    expect(groupOf(app, '시술').querySelector('input')!.value).toBe(' 목 ')
    add(app, '시술', '가'.repeat(10))
    expect(names(app, '시술').at(-1)).toBe('가'.repeat(10))
    document.body.replaceChildren()
    const sono = open('sono').app
    add(sono, '부위', '소독')
    add(sono, '부위 없이', '어깨')
    add(sono, '같이 하는 것', 'DNA')
    expect(names(sono, '부위')).toEqual(fx.defaultPicks().sono.parts)
    expect(names(sono, '부위 없이')).toEqual(['소독', 'S/O', '봉합'])
    expect(names(sono, '같이 하는 것')).toEqual(['DNA', '채혈'])
    document.body.replaceChildren()

    // 개수 한도: 시술·약재·부위 없이·같이 하는 것 12, 부위 40
    const settings = fx.oursSettings()
    const many = (head: string, n: number) => Array.from({ length: n }, (_, i) => `${head}${i + 1}`)
    settings.picks = {
      ...settings.picks,
      carm: { procs: many('시', 12).map((n) => ({ n, noDrug: false })), drugs: many('약', 12) },
      sono: { parts: many('부', 40), plains: many('없', 12), withs: many('같', 12) },
    }
    const full = open('carm', settings).app
    add(full, '시술', '더')
    add(full, '약재', '더')
    expect(groups(full).map((g) => headOf(g)[1])).toEqual([`${NEED} · 12개`, `${FREE} · 12개`])
    document.body.replaceChildren()
    const fullSono = open('sono', settings).app
    add(fullSono, '부위', '더')
    add(fullSono, '부위 없이', '더')
    add(fullSono, '같이 하는 것', '더')
    expect(groups(fullSono).map((g) => headOf(g)[1])).toEqual([`${FREE} · 40개`, `${FREE} · 12개`, `${FREE} · 12개`])
  })

  it('AC-3505.2: 마지막 시술과 SONO 마지막 부위(부위 + 부위 없이)의 ✕는 꺼진다. 약재·같이 하는 것은 다 뺄 수 있다', () => {
    const settings = fx.oursSettings()
    settings.picks = { ...settings.picks, carm: { procs: [{ n: '허리', noDrug: false }], drugs: ['TP'] }, sono: { parts: ['어깨'], plains: ['소독'], withs: ['DNA'] } }
    const app = open('carm', settings).app
    expect(btn(app, '시술', '허리', 'del').disabled).toBe(true)
    expect([btn(app, '시술', '허리', 'up').disabled, btn(app, '시술', '허리', 'down').disabled]).toEqual([true, true])
    expect(btn(app, '약재', 'TP', 'del').disabled).toBe(false)
    btn(app, '약재', 'TP', 'del').click()
    expect(names(app, '약재')).toEqual([])
    add(app, '시술', '목')
    expect(btn(app, '시술', '허리', 'del').disabled).toBe(false)
    document.body.replaceChildren()
    const sono = open('sono', settings).app
    expect(btn(sono, '부위', '어깨', 'del').disabled).toBe(false)
    expect(btn(sono, '부위 없이', '소독', 'del').disabled).toBe(false)
    btn(sono, '부위', '어깨', 'del').click()
    expect(names(sono, '부위')).toEqual([])
    expect(btn(sono, '부위 없이', '소독', 'del').disabled).toBe(true)
    btn(sono, '같이 하는 것', 'DNA', 'del').click()
    expect(names(sono, '같이 하는 것')).toEqual([])
  })

  it('AC-3505.2 · AC-5713.10: 저절로 다시 그리기(renderSettings·renderArrange)에도 창·고른 탭·초안·적던 글·초점이 그대로다', () => {
    const { app } = open('sono')
    const sheet = listSheet(app)
    add(app, '부위', '꼬리')
    const input = groupOf(app, '부위 없이').querySelector('input')!
    input.focus()
    input.value = '적던'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    // 목록이 바뀐 문서·띠가 있는 쪽으로 다시 그려도
    const next = fx.oursSettings()
    next.rev = 2
    next.picks.sono.parts = ['어깨']
    ui.renderSettings(app, next, { state: 'ok', toast: { text: '띠', undo: false } })
    ui.renderSettings(app, next, { state: 'ok' })
    expect(listSheet(app)).toBe(sheet)
    expect(tabs(app)).toEqual([
      ['넣을 처방 · 5개', false],
      ['고르기 목록', true],
    ])
    expect(names(app, '부위')).toHaveLength(21)
    expect(names(app, '부위').at(-1)).toBe('꼬리')
    expect(input.isConnected).toBe(true)
    expect(input.value).toBe('적던')
    expect(document.activeElement).toBe(input)
    // 창 안에서 다른 것을 눌러 다시 그려도 적던 글은 남는다
    btn(app, '부위', '목', 'down').click()
    expect(groupOf(app, '부위 없이').querySelector('input')!.value).toBe('적던')
    document.body.replaceChildren()

    // 어레인지 표 위에 뜬 창도 같다
    const host = appHost()
    const table = arrange.renderArrange(host, fx.arrangeMockupBoard(), {})
    const settings = fx.oursSettings()
    ui.openColEditor(table, 'pt', { doc: () => settings, tab: 'list', back: 'sheet', onSave: () => 'ok', getCodes: () => Promise.resolve([]), getCodeName: () => Promise.resolve(null) })
    add(host, '종류', 'TENS')
    const typed = groupOf(host, '종류').querySelector('input')!
    typed.focus()
    typed.value = '적던'
    typed.dispatchEvent(new Event('input', { bubbles: true }))
    arrange.renderArrange(host, fx.arrangeMockupBoard('11:04:20'), { toast: { text: '띠', undo: false } })
    expect(names(host, '종류')).toEqual(['ICE', 'HP', 'TENS'])
    expect(typed.isConnected).toBe(true)
    expect(typed.value).toBe('적던')
    expect(document.activeElement).toBe(typed)
  })
})

// ---- 이름 바꾸기 (reception-arrange-tune AC-3604.2) -----------------------------------------------------------

describe('REQ-3604 이름 바꾸기', () => {
  it('AC-3604.2: 이름을 누르면 그 줄이 글 칸(그 이름) + [바꾸기]·[취소] + "1~10글자 · 같은 이름은 안 돼요"가 되고 글 칸에 초점이 간다. [바꾸기]는 초안의 그 이름만 바꾸고(차례·약재 없음 그대로) [저장]이 넘긴다', () => {
    const carm = open('carm')
    const app = carm.app
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
    saveButton(app).click()
    const want = fx.defaultPicks()
    want.carm.procs[0]!.n = '목뼈'
    want.carm.procs[3]!.n = '정복'
    expect(savedPicks(carm.ctx)).toEqual({ ...want, extra: {} })
    document.body.replaceChildren()
    // 다른 칸도 같다
    const eswt = open('eswt')
    nameButton(eswt.app, '타수', '6000타').click()
    expect(renameInput(eswt.app).getAttribute('aria-label')).toBe('6000타 이름 바꾸기')
    typeRename(eswt.app, '5000타')
    renameButton(eswt.app, 'lt-ok').click()
    expect(names(eswt.app, '타수')).toEqual(['2000타', '3000타', '4000타', '5000타'])
    saveButton(eswt.app).click()
    const hits = fx.defaultPicks()
    hits.eswt.hits[3] = '5000타'
    expect(savedPicks(eswt.ctx)).toEqual({ ...hits, extra: {} })
  })

  it('AC-3604.2: 이름 규칙(빈 글·10글자 넘음·"|"·제어 글자·무리 안 겹침·SONO 부위와 부위 없이 겹침)에 맞지 않으면 줄을 연 채 안내 글이 빨개지고(is-bad) 적던 글·초점이 남는다. 자기 이름 그대로는 맞고, 개수 한도는 보지 않는다', () => {
    const app = open('carm').app
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
    document.body.replaceChildren()
    // SONO 부위 ↔ 부위 없이
    const sono = open('sono').app
    nameButton(sono, '부위', '어깨').click()
    typeRename(sono, '소독')
    renameButton(sono, 'lt-ok').click()
    expect(renameRows(sono)).toHaveLength(1)
    typeRename(sono, '견갑')
    renameButton(sono, 'lt-ok').click()
    expect(names(sono, '부위')).toContain('견갑')
    expect(names(sono, '부위')).not.toContain('어깨')
    document.body.replaceChildren()

    // 한도까지 찬 무리도 이름은 바꿀 수 있다
    const settings = fx.oursSettings()
    settings.picks.pt = Array.from({ length: 8 }, (_, i) => `피${i + 1}`)
    const full = open('pt', settings).app
    nameButton(full, '종류', '피1').click()
    typeRename(full, 'TENS')
    renameButton(full, 'lt-ok').click()
    expect(names(full, '종류')[0]).toBe('TENS')
    expect(names(full, '종류')).toHaveLength(8)
  })

  it('AC-3604.2: 글 칸의 Enter는 [바꾸기], Esc는 바꾸기 줄만 닫고 창은 둔다. [취소]도 바꾸지 않고 닫는다', () => {
    const app = open('carm').app
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
    const app = open('carm').app
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
        tab(app, '넣을 처방 · 2개')
        tab(app, '고르기 목록')
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

  it('AC-3604.2 · AC-5713.10: 저절로 다시 그리기(renderSettings)에도 바꾸던 줄·글·초점이 남는다', () => {
    const { app } = open('trac')
    nameButton(app, '부위', '허리').click()
    typeRename(app, '허리뼈')
    const input = renameInput(app)
    ui.renderSettings(app, { ...fx.oursSettings(), rev: 2 }, { state: 'ok', toast: { text: '띠', undo: false } })
    ui.renderSettings(app, { ...fx.oursSettings(), rev: 3 }, { state: 'ok' })
    expect(renameInput(app)).toBe(input)
    expect(input.value).toBe('허리뼈')
    expect(document.activeElement).toBe(input)
    renameButton(app, 'lt-ok').click()
    expect(names(app, '부위')).toEqual(['목', '허리뼈'])
  })

  it('AC-3604.1 · AC-3604.2: 목록 탭·바꾸기 줄이 그리는 class는 모두 style.css에 모양이 있고, 탭 줄은 넘치면 옆으로 밀린다. 빨간 안내는 theme 빨강이다. 이름은 글자로만 들어간다', () => {
    const css = readWww('style.css').replace(/\/\*[\s\S]*?\*\//g, '')
    const classes = new Set<string>()
    const collect = (app: HTMLElement) => {
      for (const n of [app, ...app.querySelectorAll('*')]) for (const c of n.classList) classes.add(c)
    }
    for (const [key] of LIST_COLS) {
      const { app } = open(key)
      collect(app)
      document.body.replaceChildren()
    }
    const sono = open('sono').app
    nameButton(sono, '부위', '목').click()
    typeRename(sono, '')
    renameButton(sono, 'lt-ok').click()
    collect(sono)
    for (const cls of ['lt-name', 'is-rename', 'lt-rename', 'lt-ok', 'lt-no', 'lt-hint', 'is-bad', 'lt-top']) expect(classes.has(cls), cls).toBe(true)
    for (const cls of classes) expect(css, `.${cls}`).toMatch(new RegExp(`\\.${cls}(?![\\w-])`))
    expect(cssValue('.lt-tabs', 'overflow-x')).toBe('auto')
    expect(cssValue('.lt-tab', 'white-space')).toBe('nowrap')
    expect(cssValue('.lt-tab', 'flex-shrink')).toBe('0')
    expect(cssValue('button.lt-name', 'cursor')).toBe('pointer')
    expect(cssValue('.lt-hint.is-bad', 'color')).toBe('var(--memo-red)')
    expect(cssValue('.lt-row.is-rename', 'flex-wrap')).toBe('wrap')
    expect(cssValue('.lt-hint', 'flex-basis')).toBe('100%')
    document.body.replaceChildren()
    // 이름에 HTML을 넣어도 글자로만
    const odd = fx.oursSettings()
    odd.picks.pt = ['<b>ICE</b>']
    const drawn = open('pt', odd).app
    expect(names(drawn, '종류')).toEqual(['<b>ICE</b>'])
    nameButton(drawn, '종류', '<b>ICE</b>').click()
    expect(renameInput(drawn).value).toBe('<b>ICE</b>')
    expect(renameInput(drawn).getAttribute('aria-label')).toBe('<b>ICE</b> 이름 바꾸기')
    expect(drawn.querySelector('.list-sheet b')).toBeNull()
  })
})

// ---- 저장 · 닫기 (AC-3505.3 · AC-5713.1) -------------------------------------------------------------------------------

describe('REQ-3505 · REQ-5713 저장·닫기', () => {
  it('AC-3505.3 · AC-5713.1: [저장]은 초안 목록을 넣은 설정 문서 전체를 onSave로 넘기고, ok면 창을 닫고 아니면 창·초안을 그대로 둔다. 기다리는 동안 [저장]은 꺼져 있다. 다시 열면 문서의 새 사본이다', async () => {
    let answer: (r: SaveResult) => void = () => {}
    const onSave = vi.fn<OnSave>(() => new Promise<SaveResult>((resolve) => (answer = resolve)))
    const settings = fx.oursSettings()
    const { app, page, ctx } = open('carm', settings, { onSave })
    flag(app, '목')
    btn(app, '약재', '기본', 'del').click()
    add(app, '약재', '반')
    saveButton(app).click()
    const want = fx.oursSettings()
    want.picks.carm.procs[0]!.noDrug = true
    want.picks.carm.drugs = ['TP', '하프', '반']
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0]).toEqual([want, 'C-ARM 칸을 저장했어요', { undo: false }])
    expect(saveButton(app).disabled).toBe(true)
    saveButton(app).click()
    expect(onSave).toHaveBeenCalledTimes(1)
    answer('fail')
    await flush()
    expect(listSheet(app)).not.toBeNull()
    expect(saveButton(app).disabled).toBe(false)
    expect(names(app, '약재')).toEqual(['TP', '하프', '반'])
    saveButton(app).click()
    expect(onSave).toHaveBeenCalledTimes(2)
    answer('ok')
    await flush()
    expect(listSheet(app)).toBeNull()
    // 다시 열면 문서 picks의 새 사본이다
    ui.openColEditor(page, 'carm', ctx)
    expect(names(app, '약재')).toEqual(['TP', '하프', '기본'])
    expect(flags(app)).toEqual(['리덕션'])
  })

  it('AC-3604.5 · AC-5713.7: [저장]은 그 칸 목록만 초안대로 바꾸고 문서의 PT·도수·충격파(타수·부위 수)·견인·더한 칸 목록은 그대로 넘긴다(받은 문서는 바꾸지 않는다)', () => {
    const settings = fx.imsSettings(['목', '어깨'])
    settings.picks.pt = ['TENS', 'ICE']
    settings.picks.ds = ['20분']
    settings.picks.eswt = { hits: [], counts: ['한 부위'] }
    settings.picks.trac = ['골반']
    const before = JSON.stringify(settings)
    const { app, ctx } = open('carm', settings)
    add(app, '약재', '반')
    saveButton(app).click()
    const want = (JSON.parse(before) as FakeSettings).picks
    want.carm.drugs.push('반')
    expect(savedPicks(ctx)).toEqual(want)
    expect(Object.keys(savedPicks(ctx))).toEqual(['carm', 'sono', 'pt', 'ds', 'eswt', 'trac', 'extra'])
    expect(JSON.stringify(settings)).toBe(before)
  })

  it('AC-3505.3 · AC-5713.1: [취소]·창 바깥 누름·Esc는 저장하지 않고 닫는다. 창 안을 누르면 닫히지 않는다', () => {
    const { app, page, ctx } = open('carm')
    for (const shut of [
      (root: HTMLElement) => listSheet(root)!.querySelector<HTMLButtonElement>(':scope > .sheet-go > button.sheet-close')!.click(),
      (root: HTMLElement) => root.querySelector<HTMLElement>('.sheet-back.list-back')!.click(),
      (root: HTMLElement) => listSheet(root)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    ]) {
      if (!listSheet(app)) ui.openColEditor(page, 'carm', ctx)
      add(app, '시술', '꼬리뼈')
      listSheet(app)!.click()
      expect(listSheet(app)).not.toBeNull()
      shut(app)
      expect(listSheet(app)).toBeNull()
    }
    ui.openColEditor(page, 'carm', ctx)
    expect(names(app, '시술')).toEqual(['목', '등', '허리', '리덕션'])
    expect(ctx.onSave).not.toHaveBeenCalled()
  })

  it('AC-3505.1 · AC-5711.4: 칸 고치기 창과 여는 단추([고치기]·넣기 창 [☰ 목록 고치기])가 그리는 class는 모두 style.css에 모양이 있고 단추·탭·글 칸은 44px 이상이다. 목록 글은 글자로만 들어간다', () => {
    const css = readWww('style.css').replace(/\/\*[\s\S]*?\*\//g, '')
    const classes = new Set<string>()
    const collect = (app: HTMLElement) => {
      for (const n of [app, ...app.querySelectorAll('*')]) for (const c of n.classList) classes.add(c)
    }
    collect(open('carm').app)
    document.body.replaceChildren()
    collect(open('sono').app)
    for (const cls of ['col-edit', 'list-back', 'list-sheet', 'col-sheet', 'lt-tabs', 'lt-tab', 'lt-fixed', 'lt-groups', 'lt-group', 'lt-list', 'lt-row', 'lt-name', 'lt-flag', 'lt-btn', 'del', 'lt-add', 'lt-foot-note', 'lt-top'])
      expect(classes.has(cls), cls).toBe(true)
    for (const cls of classes) expect(css, `.${cls}`).toMatch(new RegExp(`\\.${cls}(?![\\w-])`))
    for (const selector of ['.col-edit', '.pick-edit', '.lt-tab', '.lt-add input', '.lt-add button', '.sheet-close', '.sheet-go > .go', '.lt-row']) {
      const value = cssValue(selector, 'min-height')
      expect(value, selector).toBeDefined()
      expect(Number.parseFloat(value!), selector).toBeGreaterThanOrEqual(44)
    }
    expect(cssValue('.lt-btn.del', 'color')).toBe('var(--memo-red)')
    document.body.replaceChildren()
    // 목록 글에 HTML을 넣어도 글자로만
    const odd = fx.oursSettings()
    odd.picks.carm.procs = [{ n: '<b>허리</b>', noDrug: false }]
    const drawn = open('carm', odd).app
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
    expect(files).toContain('settings.js')
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
