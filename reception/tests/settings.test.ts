// @vitest-environment jsdom
// 설정 쪽 settings.js (reception-other-clinic TASK-7, REQ-5712·5713, design.md 3·5절, 승인 시안 docs/mockups/reception-other-clinic notes.md·index.html).
// 설정 쪽(renderSettings)·처음 설정 안내·칸 고치기 창(openColEditor)·칸 더하기 창(openColAdder)·로고 줄이기(shrinkLogo)를 화면 파일만으로 본다.
// 저장·읽기는 view·ctx의 가짜 함수로 받는다(보내기·띠·409는 app.js, settings-app.test.ts). 자료는 가짜다(fixtures.ts)
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import * as fx from './fixtures'
import type { FakeCode, FakeSettings } from './fixtures'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const WWW = path.join(ROOT, 'reception', 'www')
const NOTES = path.join(ROOT, 'docs', 'mockups', 'reception-other-clinic', 'notes.md')
const MOCKUP = path.join(ROOT, 'docs', 'mockups', 'reception-other-clinic', 'index.html')

// ---- 화면 글 (승인 시안 notes.md '화면에 새로 생기는 글', 요구사항 기본값) ----
const LEAD = '여기서 바꾸면 이 병원의 모든 폰·태블릿 화면이 바로 바뀌어요.'
const GUIDE_SUB = '이 병원에 맞게 세 가지를 정해요 · 다 하면 이 안내는 사라져요'
const LOGO_SUB = '접수 현황·어레인지 화면 맨 위에 보여요'
const PIC_HINT = 'PNG·JPG 그림 · 큰 그림은 알아서 줄여요 · 가로로 긴 그림이 잘 보여요'
const TEXT_HINT = '1~20글자 · 제목 글꼴로 보여요'
const NONE_HINT = "로고 없이 '접수 현황' 제목만 보여요"
const TAB_SUB = '[접수 현황] 탭은 늘 있어요'
const TAB_HINT = '치료 칸 표를 쓰는 병원만 켜요 · 끄면 [접수 현황] 탭만 보여요'
const COLS_SUB = '표에 보이는 차례예요 · [고치기]에서 이름·종류·고르기 목록·넣을 처방을 바꿔요'
const LOGO_TOAST = '로고를 바꿨어요 · 모든 폰·태블릿에 바로 보여요'
const TAB_ON = '어레인지 탭을 켰어요 · 모든 폰·태블릿에 바로 보여요'
const TAB_OFF = '어레인지 탭을 껐어요 · 모든 폰·태블릿에 바로 보여요'
const READ_FAILED = '설정을 읽지 못했어요'
const RX_SUB = "처방 칸 · 고른 처방이 나오면 저절로 '준비'가 들어와요. 빈 칸을 눌러 직접 넣을 수도 있어요"
const MN_SUB = '직접 칸 · 빈 칸을 눌러 골라 넣고, 누를 때마다 다음 단계로 넘어가요'
const NAME_HINT = '1~10글자 · 같은 이름은 안 돼요'
const STEP2 = '준비 → 완료'
const STEP3 = '준비 → 준비완료 → 완료'
const FOOT = '저장하면 모든 폰·태블릿 화면이 바로 바뀌어요. 이미 표에 넣은 칸은 그대로예요.'
const FOOT_SHEET = '저장하면 모든 폰·태블릿 화면이 바로 바뀌고, 고르기 창으로 돌아가요. 이미 표에 넣은 칸은 그대로예요.'
const LIST_TOP = '칸을 넣을 때 보이는 단추예요 · 이름을 누르면 바꿀 수 있어요 · 모든 줄에서 여러 개를 함께 고를 수 있어요'
const RX_NOTE = "체크한 처방이 나오면 이 칸에 저절로 '준비'가 들어와요. 한 처방을 여러 칸에 넣어도 돼요."
const DIRECT_T = '목록에 없으면 코드를 직접 넣어요'
const DIRECT_HINT = '영문·숫자·한글·_ 1~16자 · 지난 30일에 안 나온 처방도 넣을 수 있어요'
const DIRECT_ADDED = "넣었어요 · 목록 맨 위 '직접 넣은 코드'에 있어요"
const DIRECT_BAD = '코드는 영문·숫자·한글·_ 1~16자예요'
const DIRECT_SAME = '이미 이 칸에 넣은 코드예요'
const DIRECT_LISTED = '지난 30일 목록에 있어서 거기에 체크했어요'
const NO_MATCH = '찾는 처방이 없어요 · 아래에서 코드를 직접 넣어요'
const RULE_T = '단순 촬영 코드 전부 (G1~G8로 시작)'
const RULE_D = '나라에서 정한 촬영 코드라 어느 병원이나 같아요. 끄면 아래에서 하나씩 골라요'
const CODES_FAILED = '지금 처방 목록을 읽지 못했어요'
const CODES_EMPTY = '지난 30일 처방이 없어요'
const ADD_SUB = '표 맨 끝(비고 앞)에 새 칸이 생겨요'
const ADD_FOOT_RX = '더한 뒤 [고치기]에서 넣을 처방과 고르기 목록을 정해요 · 칸은 모두 12개까지예요'
const ADD_FOOT_MN = '더한 뒤 [고치기]에서 고르기 목록을 정해요 · 칸은 모두 12개까지예요'
const KC_MN = '빈 칸을 눌러 골라 넣어요. 다시 누르면 완료예요'
const KC_RX = "고른 처방이 나오면 저절로 '준비'가 들어와요"
/** 시안(index.html)에만 있는 글: X-RAY 칸을 직접 칸으로 바꿔 탭이 없을 때 */
const NO_TABS = '고르기 줄이 없어 빈 칸을 누르면 바로 들어가요'

type SaveResult = 'ok' | 'conflict' | 'fail'
type OnSave = (next: FakeSettings, text: string, opts: { undo: boolean }) => Promise<SaveResult> | SaveResult

interface View {
  state?: 'reading' | 'error' | 'ok'
  back?: 'arrange' | 'board'
  toast?: { text: string; undo: boolean } | null
  logoPic?: { ver: number; src: string } | null
  onSave?: OnSave
  onUndo?: () => void
  onReread?: () => void
  onLogoFile?: (file: File) => void
  getCodes?: () => Promise<FakeCode[]>
  getCodeName?: (code: string) => Promise<string | null>
}

interface Ctx {
  doc: () => FakeSettings
  tab?: 'rx' | 'list'
  back?: 'sheet' | null
  onSave: OnSave
  getCodes: () => Promise<FakeCode[]>
  getCodeName: (code: string) => Promise<string | null>
}

interface SettingsJs {
  renderSettings: (host: HTMLElement, settings: FakeSettings | null, view?: View) => HTMLElement
  openColEditor: (page: HTMLElement, key: string, ctx: Ctx) => HTMLElement
  openColAdder: (page: HTMLElement, ctx: Ctx) => HTMLElement
  shrinkLogo: (file: Blob) => Promise<{ bytes: Uint8Array; type: string; url: string }>
}

// 화면 파일은 빌드 없는 JS라 형 선언이 없다. 경로를 값으로 두어 형 검사가 묻지 않게 한다
const SETTINGS_JS = '../www/settings.js'
let ui: SettingsJs

beforeAll(async () => {
  const none = () => {
    throw new Error('settings.js 없음')
  }
  const missing: SettingsJs = { renderSettings: none, openColEditor: none, openColAdder: none, shrinkLogo: () => Promise.reject(new Error('settings.js 없음')) }
  ui = ((await import(/* @vite-ignore */ SETTINGS_JS).catch(() => missing)) ?? missing) as SettingsJs
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

// ---- 시험 도구 --------------------------------------------------------------------------------------

function appHost(): HTMLElement {
  const app = document.createElement('div')
  app.id = 'app'
  document.body.appendChild(app)
  return app
}

/** 설정 쪽을 그린다. view.onSave가 없으면 'ok'를 주는 가짜다 */
function drawPage(settings: FakeSettings | null = fx.oursSettings(), view: View = {}): { app: HTMLElement; page: HTMLElement; onSave: ReturnType<typeof vi.fn> } {
  const app = appHost()
  const onSave = vi.fn<OnSave>(() => Promise.resolve('ok'))
  const page = ui.renderSettings(app, settings, { state: settings ? 'ok' : 'reading', back: 'arrange', getCodes: () => Promise.resolve(fx.fakeCodes()), getCodeName: () => Promise.resolve(null), onSave, ...view })
  return { app, page, onSave: (view.onSave as ReturnType<typeof vi.fn>) ?? onSave }
}

function textOf(root: ParentNode | null | undefined, selector: string): string | null {
  return root?.querySelector(selector)?.textContent?.trim() ?? null
}

function textsOf(root: ParentNode | null | undefined, selector: string): string[] {
  return [...(root?.querySelectorAll(selector) ?? [])].map((n) => n.textContent?.trim() ?? '')
}

/** 바로 아래 아이들의 '태그.class' */
function shapeOf(node: Element | null | undefined): string[] {
  return [...(node?.children ?? [])].map((c) => `${c.tagName.toLowerCase()}${c.getAttribute('class') ? `.${String(c.getAttribute('class')).split(' ').join('.')}` : ''}`)
}

/** 글 마디만(그림·이름표 span은 뺌) */
function ownText(node: Element | null | undefined): string {
  return [...(node?.childNodes ?? [])].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent ?? '').join('')
}

function button(root: ParentNode, selector: string, label: string): HTMLButtonElement {
  const found = [...root.querySelectorAll<HTMLButtonElement>(selector)].find((b) => (ownText(b) || b.textContent?.trim()) === label)
  if (!found) throw new Error(`단추 ${label} 없음`)
  return found
}

function card(page: ParentNode, title: string): HTMLElement {
  const found = [...page.querySelectorAll<HTMLElement>('section.set-card')].find((s) => s.querySelector(':scope > h2, :scope > .sg-head > h2')?.textContent === title)
  if (!found) throw new Error(`묶음 ${title} 없음`)
  return found
}

function colRow(page: ParentNode, name: string): HTMLElement {
  const found = [...page.querySelectorAll<HTMLElement>('ul.col-list > li.col-row')].find((li) => textOf(li, '.col-name') === name)
  if (!found) throw new Error(`칸 줄 ${name} 없음`)
  return found
}

function sheetOf(root: ParentNode): HTMLElement | null {
  return root.querySelector<HTMLElement>('.sheet-back.list-back > .sheet.col-sheet')
}

function goButton(root: ParentNode): HTMLButtonElement {
  return sheetOf(root)!.querySelector<HTMLButtonElement>(':scope > .sheet-go > button.go')!
}

function nameInput(root: ParentNode): HTMLInputElement {
  return sheetOf(root)!.querySelector<HTMLInputElement>(':scope > .cf > input.txt')!
}

function typeIn(input: HTMLInputElement, text: string) {
  input.value = text
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

/** 창 탭 [글, 고름] */
function tabsOf(root: ParentNode): [string, boolean][] {
  return [...(sheetOf(root)?.querySelectorAll(':scope > .lt-tabs > button.lt-tab') ?? [])].map((b) => [
    b.textContent ?? '',
    b.classList.contains('on') && b.getAttribute('aria-pressed') === 'true',
  ])
}

function tabButton(root: ParentNode, label: string): HTMLButtonElement {
  return button(sheetOf(root)!, ':scope > .lt-tabs > button.lt-tab', label)
}

/** 창 안 고르기(종류·단계) [글, 눌림] */
function segOf(root: ParentNode, label: string): [string, boolean][] {
  const seg = sheetOf(root)!.querySelector(`:scope > .cf > [aria-label="${label}"]`)!
  return [...seg.querySelectorAll(':scope > button')].map((b) => [b.querySelector('.kc-t')?.textContent ?? b.textContent ?? '', b.getAttribute('aria-pressed') === 'true'])
}

function segButton(root: ParentNode, label: string, text: string): HTMLButtonElement {
  const seg = sheetOf(root)!.querySelector(`:scope > .cf > [aria-label="${label}"]`)!
  const found = [...seg.querySelectorAll<HTMLButtonElement>(':scope > button')].find((b) => (b.querySelector('.kc-t')?.textContent ?? b.textContent) === text)
  if (!found) throw new Error(`${label} ${text} 없음`)
  return found
}

/** 넣을 처방 목록의 줄: 무리 머리(gh)는 ['#', 머리, 작은 글], 줄은 [코드, 이름, 체크, 이름표들, 명 수] */
function rxItems(root: ParentNode): (string | boolean | string[])[][] {
  return [...(sheetOf(root)?.querySelectorAll('ul.rx-list > li') ?? [])].map((li) => {
    if (li.classList.contains('rx-gh')) return ['#', ownText(li).trim(), li.querySelector('.sm')?.textContent ?? '']
    if (li.classList.contains('rx-none')) return ['!', li.textContent ?? '']
    return [
      li.querySelector('code')?.textContent ?? '',
      ownText(li.querySelector('.rx-n')).trim(),
      li.getAttribute('aria-checked') === 'true',
      [...li.querySelectorAll('.rx-n > .also')].map((b) => b.textContent ?? ''),
      li.querySelector('.rx-v')?.textContent ?? '',
    ]
  })
}

function rxRow(root: ParentNode, code: string): HTMLElement {
  const found = [...sheetOf(root)!.querySelectorAll<HTMLElement>('ul.rx-list > li.rx-row')].find((li) => li.querySelector('code')?.textContent === code)
  if (!found) throw new Error(`처방 줄 ${code} 없음`)
  return found
}

function rxCodes(root: ParentNode): string[] {
  return [...sheetOf(root)!.querySelectorAll('ul.rx-list > li.rx-row > code')].map((c) => c.textContent ?? '')
}

function direct(root: ParentNode, text: string) {
  const form = sheetOf(root)!.querySelector<HTMLFormElement>('form.rx-direct')!
  typeIn(form.querySelector<HTMLInputElement>('input.txt')!, text)
  form.querySelector<HTMLButtonElement>('button[type="submit"]')!.click()
}

function directMsg(root: ParentNode): [string, boolean] {
  const msg = sheetOf(root)!.querySelector('form.rx-direct > p.rd-msg')!
  return [msg.textContent ?? '', msg.classList.contains('bad')]
}

async function flush() {
  for (let i = 0; i < 4; i += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}

/** 칸 고치기 창 ctx(가짜): 문서는 settings, 저장은 onSave */
function ctxOf(settings: FakeSettings, more: Partial<Ctx> = {}): Ctx & { onSave: ReturnType<typeof vi.fn> } {
  return {
    doc: () => settings,
    getCodes: vi.fn(() => Promise.resolve(fx.fakeCodes())),
    getCodeName: vi.fn((code: string) => Promise.resolve(code === 'EB470' ? '가상 초음파 재검사' : null)),
    ...more,
    onSave: (more.onSave as ReturnType<typeof vi.fn>) ?? vi.fn<OnSave>(() => Promise.resolve('ok')),
  } as Ctx & { onSave: ReturnType<typeof vi.fn> }
}

/** 설정 쪽 안에 칸 고치기 창을 연다 */
async function openEditor(settings: FakeSettings, key: string, more: Partial<Ctx> = {}) {
  const { app, page } = drawPage(settings)
  const ctx = ctxOf(settings, more)
  ui.openColEditor(page, key, ctx)
  await flush()
  return { app, page, ctx }
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

/** 칸 이름들 */
function colNames(page: ParentNode): string[] {
  return textsOf(page, 'ul.col-list > li.col-row .col-name')
}

/** 설정 문서의 칸 */
function colOf(doc: FakeSettings, k: string) {
  return doc.cols.find((c) => c.k === k)!
}

// ---- 설정 쪽 (AC-5712.1) ------------------------------------------------------------------------------

describe('REQ-5712 설정 쪽', () => {
  it('AC-5712.1: 머리 [‹ 어레인지]·연결됨, 제목 "설정"과 아래 글, [병원 로고]·[탭]·[어레인지 칸] 묶음을 시안 글 그대로 그린다(안내가 끝난 우리 의원 값은 처음 설정 안내가 없다)', () => {
    const { app, page } = drawPage()
    expect(page.className).toBe('page settings-page')
    expect(app.children.length).toBe(1)
    expect(shapeOf(page)).toEqual(['header.top.set-top', 'main.set-main'])
    const head = page.querySelector(':scope > header')!
    expect(shapeOf(head)).toEqual(['div.top-row', 'h1.set-title', 'p.set-lead'])
    const back = head.querySelector<HTMLAnchorElement>(':scope > .top-row > a.back')!
    expect([back.getAttribute('href'), back.textContent]).toEqual(['#/a', '어레인지'])
    expect(textOf(head, ':scope > .top-row > span.conn')).toBe('연결됨')
    expect(textOf(head, 'h1.set-title')).toBe('설정')
    expect(textOf(head, 'p.set-lead')).toBe(LEAD)
    const main = page.querySelector(':scope > main')!
    expect(shapeOf(main)).toEqual(['div.set-left', 'section.set-card.cols-card'])
    expect(shapeOf(main.querySelector('.set-left'))).toEqual(['section.set-card.logo-card', 'section.set-card.tab-card'])
    expect(textsOf(main, 'section.set-card > h2')).toEqual(['병원 로고', '탭', '어레인지 칸'])
    expect(textsOf(main, 'section.set-card > p.set-sub')).toEqual([LOGO_SUB, TAB_SUB, COLS_SUB])
    expect(page.querySelector('.set-guide')).toBeNull()

    // 접수 현황 탭에서 들어오면 [‹ 접수 현황]
    document.body.replaceChildren()
    const from = drawPage(fx.oursSettings(), { back: 'board' }).page
    expect([from.querySelector('a.back')!.getAttribute('href'), from.querySelector('a.back')!.textContent]).toEqual(['#/', '접수 현황'])
  })

  it('AC-5712.1: 읽는 중에는 머리·제목만이고, 읽지 못했으면 "설정을 읽지 못했어요" 한 줄과 [다시 읽기](view.onReread)다', () => {
    const { page } = drawPage(null, { state: 'reading' })
    expect(textOf(page, 'h1.set-title')).toBe('설정')
    expect(page.querySelector('main.set-main')!.children.length).toBe(0)
    const onReread = vi.fn()
    ui.renderSettings(page.parentElement!, null, { state: 'error', back: 'board', onReread })
    expect(page.parentElement!.querySelectorAll('.page.settings-page').length).toBe(1)
    const fail = page.parentElement!.querySelector('main.set-main > .set-fail')!
    expect(shapeOf(fail)).toEqual(['span.set-fail-t', 'button.btn-line'])
    expect(textsOf(fail, ':scope > *')).toEqual([READ_FAILED, '다시 읽기'])
    expect(page.parentElement!.querySelector('.set-card')).toBeNull()
    fail.querySelector('button')!.click()
    expect(onReread).toHaveBeenCalledTimes(1)
  })

  it('AC-5712.1 · AC-5714.1: 띠는 .toast > span.toast-text + [되돌리기](view.onUndo)이고 글은 글 마디로만 들어간다. 칸 이름에 HTML을 넣어도 글자로만 보인다', () => {
    const onUndo = vi.fn()
    const settings = fx.oursSettings()
    colOf(settings, 'pt').name = '<b>PT</b>'
    const { page } = drawPage(settings, { toast: { text: 'PT 칸을 숨겼어요', undo: true }, onUndo })
    const toast = page.querySelector(':scope > .toast')!
    expect(toast.getAttribute('role')).toBe('status')
    expect(shapeOf(toast)).toEqual(['span.toast-text', 'button.toast-undo'])
    expect(textsOf(toast, ':scope > *')).toEqual(['PT 칸을 숨겼어요', '되돌리기'])
    toast.querySelector('button')!.click()
    expect(onUndo).toHaveBeenCalledTimes(1)
    expect(colNames(page)).toContain('<b>PT</b>')
    expect(page.querySelector('b')).toBeNull()
    ui.renderSettings(page.parentElement!, settings, { state: 'ok', toast: { text: '칸 차례를 바꿨어요', undo: false } })
    expect(shapeOf(page.querySelector(':scope > .toast'))).toEqual(['span.toast-text'])
    ui.renderSettings(page.parentElement!, settings, { state: 'ok', toast: null })
    expect(page.querySelector('.toast')).toBeNull()
  })
})

// ---- 병원 로고 (AC-5712.2·5712.3) ----------------------------------------------------------------------------

describe('REQ-5712 병원 로고', () => {
  it('AC-5712.2: [로고 그림]·[병원 이름 글자]·[없이] 셋 가운데 지금 것이 눌려 있고, 그림이면 미리 보기(data: URL) + [다른 그림 고르기] + 시안 안내 글이다', () => {
    const src = fx.fakeLogoUrl('png')
    const { page } = drawPage(fx.oursSettings(), { logoPic: { ver: 1, src } })
    const logo = card(page, '병원 로고')
    const seg = logo.querySelector(':scope > .seg')!
    expect([seg.getAttribute('role'), seg.getAttribute('aria-label')]).toEqual(['group', '병원 로고'])
    expect([...seg.querySelectorAll('button')].map((b) => [b.textContent, b.getAttribute('aria-pressed'), b.getAttribute('type')])).toEqual([
      ['로고 그림', 'true', 'button'],
      ['병원 이름 글자', 'false', 'button'],
      ['없이', 'false', 'button'],
    ])
    const pane = logo.querySelector(':scope > .logo-pane')!
    expect(shapeOf(pane)).toEqual(['div.logo-preview', 'div.logo-acts'])
    expect(pane.querySelector('.logo-preview > img.lp-img')!.getAttribute('src')).toBe(src)
    expect(pane.querySelector('.logo-preview > img')!.getAttribute('alt')).toBe('병원 로고')
    expect(shapeOf(pane.querySelector('.logo-acts'))).toEqual(['button.btn-line', 'span.hint'])
    expect(textsOf(pane, '.logo-acts > *')).toEqual(['다른 그림 고르기', PIC_HINT])
    const file = logo.querySelector<HTMLInputElement>(':scope > input.logo-file')!
    expect([file.type, file.accept, file.hidden]).toEqual(['file', 'image/png,image/jpeg', true])
    // 받은 그림의 ver가 다르면 미리 보기를 그리지 않는다(앞 그림을 새 로고처럼 보이지 않게)
    ui.renderSettings(page.parentElement!, fx.oursSettings(), { state: 'ok', logoPic: { ver: 2, src } })
    expect(page.querySelector('.logo-preview img')).toBeNull()
  })

  it('AC-5712.2: 병원 이름 글자는 글 칸(20글자) + [바꾸기] + 안내 + 제목 글꼴 미리 보기, 없이는 미리 보기 "접수 현황" + 안내다', () => {
    const text = fx.oursSettings()
    text.logo = { mode: 'text', text: '가나다정형외과', ver: 1 }
    const { page } = drawPage(text)
    const pane = card(page, '병원 로고').querySelector(':scope > .logo-pane')!
    expect(shapeOf(pane)).toEqual(['form.name-row', 'div.hint.lp-hint', 'div.logo-preview'])
    const input = pane.querySelector<HTMLInputElement>('form.name-row > input.txt')!
    expect([input.type, input.maxLength, input.value, input.getAttribute('aria-label')]).toEqual(['text', 20, '가나다정형외과', '병원 이름'])
    expect(button(pane, 'form.name-row > button', '바꾸기').type).toBe('submit')
    expect(button(pane, 'form.name-row > button', '바꾸기').className).toBe('btn-ink')
    expect(textOf(pane, '.lp-hint')).toBe(TEXT_HINT)
    expect(textOf(pane, '.logo-preview > span.logo-text')).toBe('가나다정형외과')

    document.body.replaceChildren()
    const none = fx.oursSettings()
    none.logo = { mode: 'none', text: null, ver: 0 }
    const drawn = drawPage(none).page
    const nonePane = card(drawn, '병원 로고').querySelector(':scope > .logo-pane')!
    expect(shapeOf(nonePane)).toEqual(['div.logo-preview', 'div.hint.lp-hint'])
    expect(textOf(nonePane, '.logo-preview > span.lp-none')).toBe('접수 현황')
    expect(textOf(nonePane, '.lp-hint')).toBe(NONE_HINT)
  })

  it('AC-5712.2: [없이]·이름이 있는 [병원 이름 글자]·그림 파일이 있는 [로고 그림]은 바로 저장(setup.logo 참)하고 띠 글은 "로고를 바꿨어요 · …"(되돌리기 있음)다. 같은 것을 다시 누르면 보내지 않는다', () => {
    const settings = fx.oursSettings()
    settings.logo.text = '가나다정형외과'
    const { page, onSave } = drawPage(settings)
    button(page, '.logo-card > .seg > button', '없이').click()
    expect(onSave).toHaveBeenCalledTimes(1)
    const [next, text, opts] = onSave.mock.calls[0]!
    expect(next).toEqual({ ...settings, logo: { mode: 'none', text: '가나다정형외과', ver: 1 } })
    expect([text, opts]).toEqual([LOGO_TOAST, { undo: true }])
    expect(settings.logo.mode).toBe('pic')
    button(page, '.logo-card > .seg > button', '병원 이름 글자').click()
    expect(onSave.mock.calls[1]![0].logo).toEqual({ mode: 'text', text: '가나다정형외과', ver: 1 })
    button(page, '.logo-card > .seg > button', '로고 그림').click()
    expect(onSave).toHaveBeenCalledTimes(2)

    // 새 병원: setup.logo가 거짓이면 지금 것(없이)을 눌러도 저장한다(처음 설정 ①)
    document.body.replaceChildren()
    const fresh = fx.freshSettings()
    const drawn = drawPage(fresh)
    button(drawn.page, '.logo-card > .seg > button', '없이').click()
    expect(drawn.onSave).toHaveBeenCalledTimes(1)
    expect(drawn.onSave.mock.calls[0]![0]).toEqual({ ...fresh, setup: { logo: true, tab: false, done: false } })
    // 그림이 있는 병원(ver 3)의 [로고 그림]은 바로 그림
    document.body.replaceChildren()
    const had = fx.freshSettings()
    had.logo = { mode: 'none', text: null, ver: 3 }
    const again = drawPage(had)
    button(again.page, '.logo-card > .seg > button', '로고 그림').click()
    expect(again.onSave.mock.calls[0]![0].logo).toEqual({ mode: 'pic', text: null, ver: 3 })
  })

  it('AC-5712.2: 이름이 없는 [병원 이름 글자]는 저장하지 않고 글 칸을 연다. [바꾸기]는 앞뒤 빈칸을 뺀 1~20글자만 저장하고 아니면 안내 글이 빨갛다. 적던 글은 다시 그려도 남는다', () => {
    const settings = fx.freshSettings()
    const { app, page, onSave } = drawPage(settings)
    button(page, '.logo-card > .seg > button', '병원 이름 글자').click()
    expect(onSave).not.toHaveBeenCalled()
    const input = () => page.querySelector<HTMLInputElement>('.logo-card form.name-row > input.txt')!
    expect(input().value).toBe('')
    expect(document.activeElement).toBe(input())
    expect([...page.querySelectorAll('.logo-card > .seg > button')].map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false'])
    for (const bad of ['', '   ', '가'.repeat(21), '벨\u0007']) {
      typeIn(input(), bad)
      page.querySelector<HTMLButtonElement>('.logo-card form.name-row > button')!.click()
      expect(onSave, JSON.stringify(bad)).not.toHaveBeenCalled()
      expect(page.querySelector('.logo-card .lp-hint')!.classList.contains('is-bad'), JSON.stringify(bad)).toBe(true)
    }
    typeIn(input(), '  가나다정형외과 ')
    expect(textOf(page, '.logo-card .logo-preview > .logo-text')).toBe('가나다정형외과')
    // 저절로 다시 그려도 열어 둔 글 칸·적던 글·초점이 남는다
    input().focus()
    ui.renderSettings(app, settings, { state: 'ok', onSave, toast: { text: '띠', undo: false } })
    expect(input().value).toBe('  가나다정형외과 ')
    expect(document.activeElement).toBe(input())
    input().form!.requestSubmit()
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0]![0]).toEqual({ ...settings, logo: { mode: 'text', text: '가나다정형외과', ver: 0 }, setup: { logo: true, tab: false, done: false } })
    expect(onSave.mock.calls[0]!.slice(1)).toEqual([LOGO_TOAST, { undo: true }])
  })

  it('AC-5712.2 · AC-5712.3: 그림 파일이 없으면(ver 0) [로고 그림]은 저장하지 않고 그림 고르기를 열고, [다른 그림 고르기]도 그림 고르기다. 고른 파일은 view.onLogoFile로 넘긴다', () => {
    const onLogoFile = vi.fn()
    const { page, onSave } = drawPage(fx.freshSettings(), { onLogoFile })
    const file = page.querySelector<HTMLInputElement>('.logo-card > input.logo-file')!
    const pick = vi.spyOn(file, 'click').mockImplementation(() => {})
    button(page, '.logo-card > .seg > button', '로고 그림').click()
    expect(pick).toHaveBeenCalledTimes(1)
    expect(onSave).not.toHaveBeenCalled()
    const chosen = new File([fx.fakeLogoPng()], 'logo.png', { type: 'image/png' })
    Object.defineProperty(file, 'files', { configurable: true, value: [chosen] })
    file.dispatchEvent(new Event('change', { bubbles: true }))
    expect(onLogoFile).toHaveBeenCalledWith(chosen)

    document.body.replaceChildren()
    const pic = drawPage(fx.oursSettings(), { onLogoFile })
    const input = pic.page.querySelector<HTMLInputElement>('.logo-card > input.logo-file')!
    const again = vi.spyOn(input, 'click').mockImplementation(() => {})
    button(pic.page, '.logo-acts > button', '다른 그림 고르기').click()
    expect(again).toHaveBeenCalledTimes(1)
  })
})

// ---- 탭 (AC-5712.4) ----------------------------------------------------------------------------------------

describe('REQ-5712 탭', () => {
  it('AC-5712.4: [탭] 묶음은 시안 글 + 어레인지 탭 켜기 단추(켜짐·꺼짐)이고, 누르면 바로 저장(setup.tab 참) + 띠 "어레인지 탭을 껐어요/켰어요 · …"다', () => {
    const settings = fx.freshSettings()
    const { app, page, onSave } = drawPage(settings)
    const tab = card(page, '탭')
    expect(shapeOf(tab)).toEqual(['h2', 'p.set-sub', 'div.sw-row'])
    expect(shapeOf(tab.querySelector('.sw-row'))).toEqual(['div.sw-text', 'button.switch'])
    expect(textsOf(tab, '.sw-text > *')).toEqual(['어레인지 탭', TAB_HINT])
    const sw = tab.querySelector<HTMLButtonElement>('button.switch')!
    expect([ownText(sw), sw.getAttribute('aria-pressed'), shapeOf(sw)]).toEqual(['켜짐', 'true', ['span.knob']])
    sw.click()
    expect(onSave.mock.calls[0]).toEqual([{ ...settings, tab: false, setup: { logo: false, tab: true, done: false } }, TAB_OFF, { undo: true }])
    const off = { ...settings, tab: false }
    ui.renderSettings(app, off, { state: 'ok', onSave })
    const again = card(page, '탭').querySelector<HTMLButtonElement>('button.switch')!
    expect([ownText(again), again.getAttribute('aria-pressed')]).toEqual(['꺼짐', 'false'])
    again.click()
    expect(onSave.mock.calls[1]!.slice(1)).toEqual([TAB_ON, { undo: true }])
    expect(onSave.mock.calls[1]![0].tab).toBe(true)
  })
})

// ---- 어레인지 칸 (AC-5712.5) ---------------------------------------------------------------------------------

describe('REQ-5712 어레인지 칸', () => {
  it('AC-5712.5: 칸 줄마다 이름 · 이름표(처방 칸/직접 칸, 더한 칸) · 요약 글(시안 규칙) · [보이기/숨김] · [▲][▼] · [고치기]이고 맨 아래 [+ 칸 더하기]다', () => {
    const { page } = drawPage(fx.imsSettings())
    const cols = card(page, '어레인지 칸')
    expect(shapeOf(cols)).toEqual(['h2', 'p.set-sub', 'ul.col-list', 'button.col-add'])
    expect(colNames(page)).toEqual(['X-RAY', 'SONO', 'C-ARM', 'PT', '도수', '충격파', '견인', 'IMS'])
    const rows = [...page.querySelectorAll('ul.col-list > li.col-row')]
    expect(rows.map((li) => [...li.querySelectorAll('.col-line > span.kind')].map((s) => `${s.className}:${s.textContent}`))).toEqual([
      ['kind rx:처방 칸'],
      ['kind rx:처방 칸'],
      ['kind rx:처방 칸'],
      ['kind mn:직접 칸'],
      ['kind mn:직접 칸'],
      ['kind mn:직접 칸'],
      ['kind mn:직접 칸'],
      ['kind mn:직접 칸', 'kind new:더한 칸'],
    ])
    expect(textsOf(page, 'ul.col-list > li.col-row .col-sum')).toEqual([
      '단순 촬영 코드 전부',
      `처방 5개 · ${STEP3}`,
      `처방 2개 · ${STEP3}`,
      'ICE·HP',
      '30분·50분',
      '타수 4개 · 부위 수 4개',
      '목·허리',
      '목·어깨·허리·무릎',
    ])
    const row = colRow(page, 'SONO')
    expect(row.className).toBe('col-row k-sono')
    expect(shapeOf(row)).toEqual(['div.col-main', 'button.switch.sm', 'div.col-move', 'button.col-edit'])
    expect(shapeOf(row.querySelector('.col-main'))).toEqual(['div.col-line', 'div.col-sum'])
    const sw = row.querySelector<HTMLButtonElement>('button.switch')!
    expect([ownText(sw), sw.getAttribute('aria-pressed'), sw.getAttribute('aria-label')]).toEqual(['보이기', 'true', 'SONO 보이기'])
    expect([...row.querySelectorAll('.col-move > button')].map((b) => [b.textContent, b.getAttribute('aria-label'), b.className])).toEqual([
      ['▲', '위로', 'lt-btn'],
      ['▼', '아래로', 'lt-btn'],
    ])
    expect(textOf(row, 'button.col-edit')).toBe('고치기')
    expect(textOf(cols, 'button.col-add')).toBe('+ 칸 더하기')
    // 맨 위 ▲·맨 아래 ▼는 꺼져 있다
    expect(colRow(page, 'X-RAY').querySelector<HTMLButtonElement>('.col-move > button[aria-label="위로"]')!.disabled).toBe(true)
    expect(colRow(page, 'IMS').querySelector<HTMLButtonElement>('.col-move > button[aria-label="아래로"]')!.disabled).toBe(true)
    expect(colRow(page, 'X-RAY').querySelector<HTMLButtonElement>('.col-move > button[aria-label="아래로"]')!.disabled).toBe(false)
  })

  it('AC-5712.5: 요약 글은 X-RAY 규칙을 끄면 "처방 N개", 처방 칸은 직접 넣은 코드도 센 단계 글, 줄이 하나인 직접 칸은 목록을 "·"로 잇는다. 숨긴 칸은 is-off·[숨김]이다', () => {
    const settings = fx.oursSettings()
    colOf(settings, 'xray').rule = false
    colOf(settings, 'xray').codes = ['G7101']
    colOf(settings, 'sono').codes.push('SONO3')
    colOf(settings, 'pt').kind = 'rx'
    colOf(settings, 'pt').steps = 3
    colOf(settings, 'ds').show = false
    const { page } = drawPage(settings)
    expect(textOf(colRow(page, 'X-RAY'), '.col-sum')).toBe('처방 1개')
    expect(textOf(colRow(page, 'SONO'), '.col-sum')).toBe(`처방 6개 · ${STEP3}`)
    expect(textOf(colRow(page, 'PT'), '.col-sum')).toBe(`처방 0개 · ${STEP3}`)
    expect(textOf(colRow(page, 'PT'), '.kind')).toBe('처방 칸')
    const ds = colRow(page, '도수')
    expect(ds.className).toBe('col-row is-off')
    expect([ownText(ds.querySelector('.switch')), ds.querySelector('.switch')!.getAttribute('aria-pressed')]).toEqual(['숨김', 'false'])
  })

  it('AC-5712.5: [보이기/숨김]·[▲][▼]는 바로 저장 + 띠 "{칸} 칸을 숨겼어요"/"{칸} 칸을 보이게 했어요"/"칸 차례를 바꿨어요"(되돌리기 있음)이고 받은 문서는 바꾸지 않는다', () => {
    const settings = fx.oursSettings()
    const before = JSON.stringify(settings)
    const { page, onSave } = drawPage(settings)
    colRow(page, 'PT').querySelector<HTMLButtonElement>('button.switch')!.click()
    const hidden = onSave.mock.calls[0]!
    expect(hidden.slice(1)).toEqual(['PT 칸을 숨겼어요', { undo: true }])
    expect(hidden[0].cols.map((c: { k: string; show: boolean }) => [c.k, c.show])).toEqual([
      ['xray', true],
      ['sono', true],
      ['carm', true],
      ['pt', false],
      ['ds', true],
      ['eswt', true],
      ['trac', true],
    ])
    colRow(page, 'SONO').querySelector<HTMLButtonElement>('button[aria-label="위로"]')!.click()
    expect(onSave.mock.calls[1]!.slice(1)).toEqual(['칸 차례를 바꿨어요', { undo: true }])
    expect(onSave.mock.calls[1]![0].cols.map((c: { k: string }) => c.k)).toEqual(['sono', 'xray', 'carm', 'pt', 'ds', 'eswt', 'trac'])
    colRow(page, 'C-ARM').querySelector<HTMLButtonElement>('button[aria-label="아래로"]')!.click()
    expect(onSave.mock.calls[2]![0].cols.map((c: { k: string }) => c.k)).toEqual(['xray', 'sono', 'pt', 'carm', 'ds', 'eswt', 'trac'])
    expect(JSON.stringify(settings)).toBe(before)

    document.body.replaceChildren()
    const off = fx.oursSettings()
    colOf(off, 'trac').show = false
    const drawn = drawPage(off)
    colRow(drawn.page, '견인').querySelector<HTMLButtonElement>('button.switch')!.click()
    expect(drawn.onSave.mock.calls[0]!.slice(1)).toEqual(['견인 칸을 보이게 했어요', { undo: true }])
    expect(colOf(drawn.onSave.mock.calls[0]![0], 'trac').show).toBe(true)
  })

  it('AC-5712.5: 마지막 보이는 칸의 [숨김]은 꺼져 있고, 칸이 12개면 [+ 칸 더하기]가 꺼진다', () => {
    const settings = fx.oursSettings()
    for (const c of settings.cols) c.show = c.k === 'sono'
    const { page, onSave } = drawPage(settings)
    const sono = colRow(page, 'SONO').querySelector<HTMLButtonElement>('button.switch')!
    expect(sono.disabled).toBe(true)
    sono.click()
    expect(onSave).not.toHaveBeenCalled()
    expect(colRow(page, 'PT').querySelector<HTMLButtonElement>('button.switch')!.disabled).toBe(false)
    expect(page.querySelector<HTMLButtonElement>('button.col-add')!.disabled).toBe(false)

    document.body.replaceChildren()
    const full = fx.oursSettings()
    for (let i = 1; i <= 5; i += 1) {
      full.cols.push({ k: `x${i}`, name: `칸${i}`, kind: 'mn', steps: 2, show: true, added: true, codes: [] })
      full.picks.extra[`x${i}`] = []
    }
    full.nextX = 6
    const drawn = drawPage(full).page
    expect(drawn.querySelectorAll('ul.col-list > li').length).toBe(12)
    expect(drawn.querySelector<HTMLButtonElement>('button.col-add')!.disabled).toBe(true)
  })
})

// ---- 처음 설정 안내 (AC-5712.7) -------------------------------------------------------------------------------

describe('REQ-5712 처음 설정 안내', () => {
  /** 안내 세 줄 [했어요, 제목, 작은 글, 단추들] */
  function stepsOf(page: ParentNode): [boolean, string, string, string[]][] {
    return [...page.querySelectorAll('.set-guide > ol.sg-steps > li.sg-step')].map((li) => [
      li.classList.contains('done'),
      ownText(li.querySelector('.sg-t')).trim(),
      li.querySelector('.sg-d')?.textContent ?? '',
      textsOf(li, '.sg-acts > button'),
    ])
  }

  it('AC-5712.7: setup.done이 거짓이면 맨 위에 [처음 설정] 안내가 "0/3 했어요"와 시안 세 줄(① 로고 ② 어레인지 탭 ③ SONO·C-ARM 처방)로 보인다', () => {
    const { page } = drawPage(fx.freshSettings())
    const main = page.querySelector('main.set-main')!
    expect(shapeOf(main)).toEqual(['section.set-card.set-guide', 'div.set-left', 'section.set-card.cols-card'])
    const guide = main.querySelector('.set-guide')!
    expect(guide.getAttribute('aria-label')).toBe('처음 설정')
    expect(shapeOf(guide)).toEqual(['div.sg-head', 'p.set-sub', 'ol.sg-steps'])
    expect(textsOf(guide, '.sg-head > *')).toEqual(['처음 설정', '0/3 했어요'])
    expect(textOf(guide, 'p.set-sub')).toBe(GUIDE_SUB)
    expect(stepsOf(page)).toEqual([
      [false, '로고 정하기', '접수 현황·어레인지 화면 맨 위에 보일 로고예요', ['로고 고르러 가기']],
      [false, '어레인지 탭 쓸지 정하기', '치료 칸 표(어레인지)를 쓰나요?', ['써요', '안 써요']],
      [false, 'SONO·C-ARM 처방 고르기', '처방이 나오면 칸에 저절로 들어오게 해요 · 지금 SONO 0개 · C-ARM 0개', ['SONO 고르기', 'C-ARM 고르기']],
    ])
    const step = guide.querySelector('li.sg-step')!
    expect(shapeOf(step)).toEqual(['span.sg-num', 'span.sg-t', 'span.sg-d', 'div.sg-acts'])
    expect([step.querySelector('.sg-num')!.textContent, step.querySelector('.sg-num')!.getAttribute('aria-hidden')]).toEqual(['1', 'true'])
    expect([...guide.querySelectorAll('.sg-acts > button')].map((b) => b.className)).toEqual(['btn-line', 'btn-ink', 'btn-line', 'btn-ink', 'btn-ink'])
  })

  it('AC-5712.7: 한 줄은 ✓ + "했어요"이고 작은 글이 한 것을 말한다. ③은 고른 처방이 하나씩 있거나 칸을 숨기거나 탭을 끄면 했어요이고 [고르기]는 아직 0개인 칸만이다', () => {
    const settings = fx.freshSettings()
    settings.setup = { logo: true, tab: false, done: false }
    settings.logo = { mode: 'text', text: '가나다정형외과', ver: 0 }
    colOf(settings, 'carm').codes = ['CARM1', 'G0400']
    const { app, page } = drawPage(settings)
    expect(textOf(page, '.sg-count')).toBe('1/3 했어요')
    const first = page.querySelector('li.sg-step')!
    expect(first.className).toBe('sg-step done')
    expect(shapeOf(first)).toEqual(['span.sg-num', 'span.sg-t', 'span.sg-d'])
    expect(textOf(first, '.sg-num')).toBe('✓')
    expect(textOf(first, '.sg-t > span.sg-ok')).toBe('했어요')
    expect(stepsOf(page)[0]).toEqual([true, '로고 정하기', '병원 이름 글자로 정했어요', []])
    expect(stepsOf(page)[2]).toEqual([false, 'SONO·C-ARM 처방 고르기', '처방이 나오면 칸에 저절로 들어오게 해요 · 지금 SONO 0개 · C-ARM 2개', ['SONO 고르기']])

    const pic = { ...settings, logo: { mode: 'pic' as const, text: null, ver: 1 }, setup: { logo: true, tab: true, done: false } }
    ui.renderSettings(app, pic, { state: 'ok' })
    expect(stepsOf(page).map((s) => s[2]).slice(0, 2)).toEqual(['로고 그림으로 정했어요', '어레인지 탭을 써요'])
    const none = { ...pic, logo: { mode: 'none' as const, text: null, ver: 1 }, tab: false }
    ui.renderSettings(app, none, { state: 'ok' })
    expect(stepsOf(page).map((s) => [s[0], s[2]])).toEqual([
      [true, '로고 없이 쓰기로 했어요'],
      [true, '어레인지 탭을 안 써요 · [접수 현황] 탭만 보여요'],
      [true, '어레인지 탭을 안 써서 안 해도 돼요'],
    ])
    // SONO를 숨기면 C-ARM만 보면 된다
    const hidden = structuredClone(pic)
    colOf(hidden, 'sono').show = false
    ui.renderSettings(app, hidden, { state: 'ok' })
    expect(stepsOf(page)[2]).toEqual([true, 'SONO·C-ARM 처방 고르기', 'SONO 0개 · C-ARM 2개 골랐어요', []])
    // setup.done이 참이면 안내가 없다
    ui.renderSettings(app, { ...hidden, setup: { logo: true, tab: true, done: true } }, { state: 'ok' })
    expect(page.querySelector('.set-guide')).toBeNull()
  })

  it('AC-5712.7: [써요]·[안 써요]는 탭을 정하고 setup.tab 참으로 바로 저장하고, 셋 다 했어요가 되는 저장에는 setup.done 참을 함께 보낸다', () => {
    const settings = fx.freshSettings()
    const { app, page, onSave } = drawPage(settings)
    button(page, '.sg-acts > button', '써요').click()
    expect(onSave.mock.calls[0]).toEqual([{ ...settings, tab: true, setup: { logo: false, tab: true, done: false } }, TAB_ON, { undo: true }])
    const logoDone = { ...settings, setup: { logo: true, tab: false, done: false } }
    ui.renderSettings(app, logoDone, { state: 'ok', onSave })
    button(page, '.sg-acts > button', '안 써요').click()
    expect(onSave.mock.calls[1]).toEqual([{ ...settings, tab: false, setup: { logo: true, tab: true, done: true } }, TAB_OFF, { undo: true }])
    // 숨겨서 ③을 끝내는 저장도
    const almost = structuredClone(logoDone)
    almost.setup.tab = true
    colOf(almost, 'carm').codes = ['CARM1']
    ui.renderSettings(app, almost, { state: 'ok', onSave })
    colRow(page, 'SONO').querySelector<HTMLButtonElement>('button.switch')!.click()
    expect(onSave.mock.calls[2]![0].setup).toEqual({ logo: true, tab: true, done: true })
  })

  it('AC-5712.7 · AC-5712.8: [SONO 고르기]·[C-ARM 고르기]는 그 칸 고치기 창을 [넣을 처방] 탭으로 열고, [로고 고르러 가기]는 병원 로고 고르기로 초점을 옮긴다', async () => {
    const { page } = drawPage(fx.freshSettings())
    button(page, '.sg-acts > button', 'C-ARM 고르기').click()
    await flush()
    expect(textOf(sheetOf(page), '.sheet-title')).toBe('C-ARM 칸 고치기')
    expect(tabsOf(page)).toEqual([
      ['넣을 처방 · 0개', true],
      ['고르기 목록', false],
    ])
    expect(sheetOf(page)!.querySelector('ul.rx-list')).not.toBeNull()
    sheetOf(page)!.querySelector<HTMLButtonElement>('.sheet-go > button.sheet-close')!.click()
    expect(sheetOf(page)).toBeNull()
    button(page, '.sg-acts > button', '로고 고르러 가기').click()
    expect(document.activeElement).toBe(page.querySelector('.logo-card > .seg > button'))
  })
})

// ---- 칸 고치기 창 (AC-5713.1) --------------------------------------------------------------------------------

describe('REQ-5713 칸 고치기 창', () => {
  it('AC-5713.1: [고치기]는 창 "{칸} 칸 고치기"를 연다: 작은 글(처방 칸) · 이름 · 종류 · 단계 · 탭 [넣을 처방 · N개][고르기 목록] · 아래 글 · [취소][저장]', async () => {
    const { page } = drawPage(fx.oursSettings())
    colRow(page, 'SONO').querySelector<HTMLButtonElement>('button.col-edit')!.click()
    await flush()
    const back = page.querySelector(':scope > .sheet-back.list-back')!
    const sheet = sheetOf(page)!
    expect(back.children.length).toBe(1)
    expect([sheet.className, sheet.getAttribute('role'), sheet.getAttribute('aria-modal'), sheet.getAttribute('aria-label')]).toEqual([
      'sheet list-sheet col-sheet',
      'dialog',
      'true',
      'SONO 칸 고치기',
    ])
    expect(shapeOf(sheet)).toEqual(['div.sheet-h', 'div.cf', 'div.lt-tabs', 'div.col-body', 'p.lt-foot-note', 'div.sheet-go'])
    expect(textsOf(sheet, '.sheet-h > span')).toEqual(['SONO 칸 고치기', RX_SUB])
    const cf = sheet.querySelector(':scope > .cf')!
    expect(shapeOf(cf)).toEqual(['span.cf-l', 'input.txt', 'span.cf-hint.hint', 'span.cf-l', 'div.seg', 'span.cf-l', 'div.seg'])
    expect(textsOf(cf, ':scope > .cf-l')).toEqual(['이름', '종류', '단계'])
    const name = nameInput(page)
    expect([name.type, name.maxLength, name.value, name.getAttribute('aria-label')]).toEqual(['text', 10, 'SONO', '칸 이름'])
    expect(textOf(cf, '.cf-hint')).toBe(NAME_HINT)
    expect(segOf(page, '종류')).toEqual([
      ['직접 칸', false],
      ['처방 칸', true],
    ])
    expect(segOf(page, '단계')).toEqual([
      [STEP2, false],
      [STEP3, true],
    ])
    expect(tabsOf(page)).toEqual([
      ['넣을 처방 · 5개', true],
      ['고르기 목록', false],
    ])
    expect(textOf(sheet, ':scope > p.lt-foot-note')).toBe(FOOT)
    expect(shapeOf(sheet.querySelector(':scope > .sheet-go'))).toEqual(['button.sheet-close', 'button.go'])
    expect(textsOf(sheet, ':scope > .sheet-go > button')).toEqual(['취소', '저장'])
    // 다시 열어도 창은 하나다
    colRow(page, 'PT').querySelector<HTMLButtonElement>('button.col-edit')!.click()
    expect(page.querySelectorAll('.sheet-back').length).toBe(1)
  })

  it('AC-5713.1: 직접 칸은 [고르기 목록] 탭만이고 작은 글이 직접 칸 글이다. X-RAY는 [고르기 목록]이 없고 규칙이 켜져 있으면 "넣을 처방 · 전부"다. 넣기 창에서 열었으면 아래 글이 고르기 창으로 돌아가는 글이다', async () => {
    const pt = await openEditor(fx.oursSettings(), 'pt', { tab: 'list', back: 'sheet' })
    expect(textsOf(sheetOf(pt.page), '.sheet-h > span')).toEqual(['PT 칸 고치기', MN_SUB])
    expect(tabsOf(pt.page)).toEqual([['고르기 목록', true]])
    expect(textOf(sheetOf(pt.page), ':scope > p.lt-foot-note')).toBe(FOOT_SHEET)
    document.body.replaceChildren()
    const xray = await openEditor(fx.oursSettings(), 'xray')
    expect(tabsOf(xray.page)).toEqual([['넣을 처방 · 전부', true]])
    // 종류를 직접 칸으로 바꾸면 탭이 없다
    segButton(xray.page, '종류', '직접 칸').click()
    expect(tabsOf(xray.page)).toEqual([])
    expect(textOf(sheetOf(xray.page), ':scope > .col-body > p.hint')).toBe(NO_TABS)
    expect(textsOf(sheetOf(xray.page), '.sheet-h > span')[1]).toBe(MN_SUB)
  })

  it('AC-5713.1: 이름·종류·단계는 창 안 초안만 바꾸고 [저장]이 설정 문서 전체를 onSave로 넘긴다(띠 "{칸} 칸을 저장했어요", 되돌리기 없음). 참이면 창을 닫고, 아니면 창·초안을 그대로 둔다. 기다리는 동안 [저장]은 꺼져 있다', async () => {
    let answer: (r: SaveResult) => void = () => {}
    const onSave = vi.fn<OnSave>(() => new Promise<SaveResult>((resolve) => (answer = resolve)))
    const settings = fx.oursSettings()
    const before = JSON.stringify(settings)
    const { page } = await openEditor(settings, 'pt', { onSave })
    typeIn(nameInput(page), ' 물리치료 ')
    segButton(page, '종류', '처방 칸').click()
    segButton(page, '단계', STEP3).click()
    expect(tabsOf(page)).toEqual([
      ['넣을 처방 · 0개', false],
      ['고르기 목록', true],
    ])
    expect(textsOf(sheetOf(page), '.sheet-h > span')).toEqual(['PT 칸 고치기', RX_SUB])
    expect(nameInput(page).value).toBe(' 물리치료 ')
    expect(onSave).not.toHaveBeenCalled()
    expect(JSON.stringify(settings)).toBe(before)
    goButton(page).click()
    expect(onSave).toHaveBeenCalledTimes(1)
    const want = fx.oursSettings()
    Object.assign(colOf(want, 'pt'), { name: '물리치료', kind: 'rx', steps: 3 })
    expect(onSave.mock.calls[0]).toEqual([want, '물리치료 칸을 저장했어요', { undo: false }])
    expect(goButton(page).disabled).toBe(true)
    goButton(page).click()
    expect(onSave).toHaveBeenCalledTimes(1)
    answer('fail')
    await flush()
    expect(sheetOf(page)).not.toBeNull()
    expect(goButton(page).disabled).toBe(false)
    expect(nameInput(page).value).toBe(' 물리치료 ')
    answer = () => {}
    goButton(page).click()
    expect(onSave).toHaveBeenCalledTimes(2)
    answer('conflict')
    await flush()
    expect(sheetOf(page)).not.toBeNull()
    goButton(page).click()
    answer('ok')
    await flush()
    expect(sheetOf(page)).toBeNull()
    expect(document.activeElement).toBe(colRow(page, 'PT').querySelector('button.col-edit'))
  })

  it('AC-5713.1: 저장할 때는 그때의 최신 문서(ctx.doc)에 이 칸만 바꿔 넣는다(창을 연 뒤 다른 곳에서 바뀐 칸·목록은 그대로)', async () => {
    let latest = fx.oursSettings()
    const { page, ctx } = await openEditor(latest, 'ds', { doc: () => latest })
    typeIn(nameInput(page), '도수치료')
    latest = fx.oursSettings()
    latest.rev = 5
    colOf(latest, 'trac').show = false
    latest.picks.pt = ['ICE']
    goButton(page).click()
    const next = ctx.onSave.mock.calls[0]![0] as FakeSettings
    expect(next.rev).toBe(5)
    expect(colOf(next, 'trac').show).toBe(false)
    expect(next.picks.pt).toEqual(['ICE'])
    expect(colOf(next, 'ds').name).toBe('도수치료')
  })

  it('AC-5713.1: 이름이 규칙(앞뒤 빈칸을 뺀 1~10글자·"|"·제어 글자 없음·다른 칸과 겹침 없음)에 맞지 않으면 [저장]이 꺼지고 안내 글이 빨갛다', async () => {
    const { page, ctx } = await openEditor(fx.imsSettings(), 'x1')
    for (const bad of ['', '   ', '가'.repeat(11), 'I|MS', '벨\u0007', 'SONO', ' 견인 ']) {
      typeIn(nameInput(page), bad)
      expect(goButton(page).disabled, JSON.stringify(bad)).toBe(true)
      expect(sheetOf(page)!.querySelector('.cf-hint')!.classList.contains('is-bad'), JSON.stringify(bad)).toBe(true)
      goButton(page).click()
    }
    expect(ctx.onSave).not.toHaveBeenCalled()
    for (const ok of [' IMS ', '가'.repeat(10), '주사']) {
      typeIn(nameInput(page), ok)
      expect(goButton(page).disabled, ok).toBe(false)
      expect(sheetOf(page)!.querySelector('.cf-hint')!.classList.contains('is-bad'), ok).toBe(false)
    }
    // 글을 적는 동안 초점은 이름 칸에 남는다
    nameInput(page).focus()
    typeIn(nameInput(page), '주사')
    expect(document.activeElement).toBe(nameInput(page))
  })

  it('AC-5713.1 · AC-5713.10: [취소]·창 바깥 누름·Esc는 저장하지 않고 닫는다. 저절로 다시 그려도(renderSettings) 창·초안·적던 글·초점이 그대로다', async () => {
    const settings = fx.oursSettings()
    const { app, page, ctx } = await openEditor(settings, 'carm', { tab: 'list' })
    const sheet = sheetOf(page)!
    typeIn(nameInput(page), 'C암')
    segButton(page, '단계', STEP2).click()
    const input = nameInput(page)
    input.focus()
    ui.renderSettings(app, { ...settings, rev: 2 }, { state: 'ok', toast: { text: '띠', undo: false } })
    ui.renderSettings(app, { ...settings, rev: 2 }, { state: 'ok' })
    expect(sheetOf(page)).toBe(sheet)
    expect(nameInput(page)).toBe(input)
    expect(input.value).toBe('C암')
    expect(document.activeElement).toBe(input)
    expect(segOf(page, '단계')).toEqual([
      [STEP2, true],
      [STEP3, false],
    ])
    sheet.click()
    expect(sheetOf(page)).not.toBeNull()
    for (const shut of [
      () => sheetOf(page)!.querySelector<HTMLButtonElement>('.sheet-go > .sheet-close')!.click(),
      () => page.querySelector<HTMLElement>('.sheet-back.list-back')!.click(),
      () => sheetOf(page)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    ]) {
      if (!sheetOf(page)) ui.openColEditor(page, 'carm', ctx)
      expect(sheetOf(page)).not.toBeNull()
      shut()
      expect(sheetOf(page)).toBeNull()
    }
    expect(ctx.onSave).not.toHaveBeenCalled()
    // 다시 열면 문서의 새 사본이다
    ui.openColEditor(page, 'carm', ctx)
    expect(nameInput(page).value).toBe('C-ARM')
  })
})

// ---- 넣을 처방 탭 (AC-5713.2~5713.6) -------------------------------------------------------------------------

describe('REQ-5713 넣을 처방', () => {
  it('AC-5713.2 · AC-5713.3: getCodes()를 한 번 읽어 "추천"(찾은 말 초음파·SONO) → "다른 처방"(많이 쓴 순) 무리로 그린다. 줄은 체크 상자 · 코드 · 이름 · N명이고 다른 칸에도 든 코드는 "{칸}에도 넣음"이다', async () => {
    const settings = fx.oursSettings()
    colOf(settings, 'carm').codes = ['CARM1', 'G0400', 'SONO2']
    const { page, ctx } = await openEditor(settings, 'sono')
    expect(ctx.getCodes).toHaveBeenCalledTimes(1)
    const body = sheetOf(page)!.querySelector(':scope > .col-body')!
    expect(shapeOf(body)).toEqual(['div.rx-tools', 'ul.rx-list', 'form.rx-direct', 'p.hint.rx-note'])
    const tools = body.querySelector('.rx-tools')!
    const find = tools.querySelector<HTMLInputElement>('input.txt')!
    expect([find.type, find.placeholder, find.getAttribute('aria-label')]).toEqual(['search', '코드나 이름으로 찾기', '처방 찾기'])
    expect(textOf(tools, 'span.hint')).toBe('지난 30일 이 병원 처방 · 고른 것 5개')
    expect(textOf(tools, 'span.hint > b')).toBe('고른 것 5개')
    expect(rxItems(page)).toEqual([
      ['#', '추천', '찾은 말 초음파·SONO'],
      ['SONO1', '초음파 검사', true, ['추천'], '96명'],
      ['EB466', '초음파(견관절)', true, ['추천'], '31명'],
      ['SONO2', '초음파 유도 주사', false, ['추천', 'C-ARM에도 넣음'], '21명'],
      ['SONO', '(이름 없음)', true, ['추천'], '9명'],
      ['EB422', '초음파(흉부)', true, ['추천'], '4명'],
      ['#', '다른 처방', '많이 쓴 순'],
      ['MM015', '표층열치료', false, [], '412명'],
      ['MM301', '간섭파전류치료', false, [], '398명'],
      ['G7101', '가상 경추 촬영', false, ['X-RAY에도 넣음'], '164명'],
      ['MM110', '견인치료', false, [], '140명'],
      ['G7301', '가상 요추 촬영', false, ['X-RAY에도 넣음'], '131명'],
      ['MM105', '도수치료', false, [], '77명'],
      ['CARM1', 'C-arm 시술', false, ['C-ARM에도 넣음'], '58명'],
      ['G0400', 'C-Arm형 영상증폭장치이용료', false, ['C-ARM에도 넣음'], '55명'],
      ['G5201', '가상 어깨 촬영', false, ['X-RAY에도 넣음'], '47명'],
      ['KK010', '가상 관절강내 주사', false, [], '18명'],
      ['HA280', '관절조영', true, [], '12명'],
    ])
    const row = rxRow(page, 'SONO1')
    expect([row.className, row.getAttribute('role'), row.getAttribute('tabindex')]).toEqual(['rx-row on', 'checkbox', '0'])
    expect(shapeOf(row)).toEqual(['span.box', 'code', 'span.rx-n', 'span.rx-v'])
    expect([row.querySelector('.box')!.textContent, row.querySelector('.box')!.getAttribute('aria-hidden')]).toEqual(['✓', 'true'])
    expect([...rxRow(page, 'SONO2').querySelectorAll('.also')].map((b) => b.className)).toEqual(['also rec', 'also'])
    expect([...rxRow(page, 'G7101').querySelectorAll('.also')].map((b) => b.className)).toEqual(['also rule'])
    expect(textOf(body, 'p.rx-note')).toBe(RX_NOTE)
    expect(sheetOf(page)!.querySelector('li.rx-gh')!.getAttribute('role')).toBe('presentation')
    // 탭을 오가도 다시 읽지 않는다
    tabButton(page, '고르기 목록').click()
    tabButton(page, '넣을 처방 · 5개').click()
    expect(ctx.getCodes).toHaveBeenCalledTimes(1)
  })

  it('AC-5713.2: 줄을 누르면(Space·Enter도) 초안 codes에 넣고 빼며 탭·안내 글의 개수가 바뀐다. 추천 줄은 저절로 체크되지 않고 아래 무리에 다시 나오지 않는다', async () => {
    const settings = fx.freshSettings()
    const { page, ctx } = await openEditor(settings, 'sono')
    expect(rxItems(page).filter((r) => r[2] === true)).toEqual([])
    const codes = rxCodes(page)
    expect(new Set(codes).size).toBe(codes.length)
    rxRow(page, 'EB466').click()
    rxRow(page, 'SONO1').dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))
    rxRow(page, 'HA280').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(tabsOf(page)[0]).toEqual(['넣을 처방 · 3개', true])
    expect(textOf(sheetOf(page), '.rx-tools > span.hint')).toBe('지난 30일 이 병원 처방 · 고른 것 3개')
    expect(document.activeElement).toBe(rxRow(page, 'HA280'))
    rxRow(page, 'EB466').click()
    goButton(page).click()
    expect(colOf(ctx.onSave.mock.calls[0]![0], 'sono').codes).toEqual(['SONO1', 'HA280'])
    expect(settings.cols.find((c) => c.k === 'sono')!.codes).toEqual([])
  })

  it('AC-5713.2 · AC-5713.5: 직접 넣은 코드(30일 목록에 없음)는 맨 위 "직접 넣은 코드" 무리에 이름표 "직접 넣음"·명 수 없이 보이고, 이름은 getCodeName(코드마다 한 번)이다. 없으면 "(이름 없음)"', async () => {
    const settings = fx.oursSettings()
    colOf(settings, 'sono').codes = ['SONO1', 'EB470', 'ZZ9']
    const { page, ctx } = await openEditor(settings, 'sono')
    expect(ctx.getCodeName.mock.calls.map((c) => c[0])).toEqual(['EB470', 'ZZ9'])
    expect(rxItems(page).slice(0, 4)).toEqual([
      ['#', '직접 넣은 코드', '지난 30일에 없던 것'],
      ['EB470', '가상 초음파 재검사', true, ['직접 넣음'], ''],
      ['ZZ9', '(이름 없음)', true, ['직접 넣음'], ''],
      ['#', '추천', '찾은 말 초음파·SONO'],
    ])
    expect(rxRow(page, 'EB470').querySelector('.also')!.className).toBe('also typed')
    expect(tabsOf(page)[0]![0]).toBe('넣을 처방 · 3개')
    // 체크를 풀면 초안에서 빠진다
    rxRow(page, 'ZZ9').click()
    expect(rxCodes(page)).not.toContain('ZZ9')
    tabButton(page, '고르기 목록').click()
    tabButton(page, '넣을 처방 · 2개').click()
    expect(ctx.getCodeName).toHaveBeenCalledTimes(2)
    goButton(page).click()
    expect(colOf(ctx.onSave.mock.calls[0]![0], 'sono').codes).toEqual(['SONO1', 'EB470'])
  })

  it('AC-5713.4: 찾기 칸에 글을 넣으면 세 무리 모두 코드·이름에 그 글이 든 줄만 보이고(대소문자 무시) 하나도 없으면 "찾는 처방이 없어요 · …"다. 찾는 동안 초점은 찾기 칸에 남는다', async () => {
    const settings = fx.oursSettings()
    colOf(settings, 'sono').codes.push('SONO3')
    const { page } = await openEditor(settings, 'sono')
    const find = () => sheetOf(page)!.querySelector<HTMLInputElement>('.rx-tools > input')!
    find().focus()
    typeIn(find(), 'mm1')
    expect(rxItems(page)).toEqual([
      ['#', '지난 30일 처방', '많이 쓴 순'],
      ['MM110', '견인치료', false, [], '140명'],
      ['MM105', '도수치료', false, [], '77명'],
    ])
    expect(document.activeElement).toBe(find())
    expect(find().value).toBe('mm1')
    typeIn(find(), '흉부')
    expect(rxItems(page)).toEqual([
      ['#', '추천', '찾은 말 초음파·SONO'],
      ['EB422', '초음파(흉부)', true, ['추천'], '4명'],
    ])
    typeIn(find(), 'sono3')
    expect(rxItems(page).map((r) => r[0])).toEqual(['#', 'SONO3'])
    typeIn(find(), '없는처방')
    expect(rxItems(page)).toEqual([['!', NO_MATCH]])
    typeIn(find(), '')
    expect(rxCodes(page)).toHaveLength(17)
  })

  it('AC-5713.3: 찾은 말은 칸마다 다르다: X-RAY 촬영·X-RAY·XRAY·X-선, C-ARM C-ARM·CARM·C ARM·영상증폭. 이름을 바꾼 칸·더한 칸은 그 칸 이름도 찾은 말이다', async () => {
    const carm = await openEditor(fx.oursSettings(), 'carm')
    expect(rxItems(carm.page).slice(0, 3)).toEqual([
      ['#', '추천', '찾은 말 C-ARM·CARM·C ARM·영상증폭'],
      ['CARM1', 'C-arm 시술', true, ['추천'], '58명'],
      ['G0400', 'C-Arm형 영상증폭장치이용료', true, ['추천'], '55명'],
    ])
    document.body.replaceChildren()
    const settings = fx.oursSettings()
    colOf(settings, 'xray').rule = false
    const xray = await openEditor(settings, 'xray')
    expect(rxItems(xray.page).filter((r) => r[0] === '#')).toEqual([
      ['#', '추천', '찾은 말 촬영·X-RAY·XRAY·X-선'],
      ['#', '다른 처방', '많이 쓴 순'],
    ])
    expect(rxItems(xray.page).slice(1, 4).map((r) => r[0])).toEqual(['G7101', 'G7301', 'G5201'])
    // 이름을 바꾼 처방 칸
    document.body.replaceChildren()
    const renamed = fx.oursSettings()
    colOf(renamed, 'sono').name = '관절조영'
    const drawn = await openEditor(renamed, 'sono')
    expect(rxItems(drawn.page)[0]).toEqual(['#', '추천', '찾은 말 초음파·SONO·관절조영'])
    expect(rxItems(drawn.page).filter((r) => (r[3] as string[] | undefined)?.includes('추천')).map((r) => r[0])).toContain('HA280')
    // 더한 처방 칸 '주사'
    document.body.replaceChildren()
    const added = fx.imsSettings()
    Object.assign(colOf(added, 'x1'), { name: '주사', kind: 'rx' })
    const shot = await openEditor(added, 'x1')
    expect(rxItems(shot.page).slice(0, 3)).toEqual([
      ['#', '추천', '찾은 말 주사'],
      ['SONO2', '초음파 유도 주사', false, ['추천'], '21명'],
      ['KK010', '가상 관절강내 주사', false, ['추천'], '18명'],
    ])
  })

  it('AC-5713.5: 코드 직접 넣기는 대문자로 바꿔 모양이 틀리면·이미 넣었으면 빨간 글, 30일 목록에 있으면 그 줄을 체크, 아니면 초안에 더하고 "넣었어요 · …"다. 칸마다 40개를 넘으면 더하지 않는다', async () => {
    const { page, ctx } = await openEditor(fx.oursSettings(), 'sono')
    const form = sheetOf(page)!.querySelector('form.rx-direct')!
    expect(shapeOf(form)).toEqual(['label.rd-t', 'div.rd-row', 'p.rd-msg'])
    expect(textOf(form, 'label.rd-t')).toBe(DIRECT_T)
    const entry = form.querySelector<HTMLInputElement>('.rd-row > input.txt')!
    expect([entry.type, entry.maxLength, entry.placeholder, entry.getAttribute('autocomplete'), form.querySelector('label')!.getAttribute('for')]).toEqual([
      'text',
      16,
      '예: EB470',
      'off',
      entry.id,
    ])
    expect(textOf(form, '.rd-row > button.btn-ink')).toBe('넣기')
    expect(directMsg(page)).toEqual([DIRECT_HINT, false])
    expect(form.querySelector('p.rd-msg')!.getAttribute('role')).toBe('status')
    for (const bad of ['', 'A-1', 'EB 470', '가'.repeat(17)]) {
      direct(page, bad)
      expect(directMsg(page), bad).toEqual([DIRECT_BAD, true])
    }
    direct(page, 'sono1')
    expect(directMsg(page)).toEqual([DIRECT_SAME, true])
    expect(sheetOf(page)!.querySelector<HTMLInputElement>('form.rx-direct input')!.value).toBe('sono1')
    direct(page, 'kk010')
    expect(directMsg(page)).toEqual([DIRECT_LISTED, false])
    expect(rxRow(page, 'KK010').getAttribute('aria-checked')).toBe('true')
    expect(sheetOf(page)!.querySelector<HTMLInputElement>('form.rx-direct input')!.value).toBe('')
    direct(page, ' eb470 ')
    await flush()
    expect(directMsg(page)).toEqual([DIRECT_ADDED, false])
    expect(rxItems(page).slice(0, 2)).toEqual([
      ['#', '직접 넣은 코드', '지난 30일에 없던 것'],
      ['EB470', '가상 초음파 재검사', true, ['직접 넣음'], ''],
    ])
    direct(page, '한글_코드')
    await flush()
    expect(rxCodes(page).slice(0, 2)).toEqual(['EB470', '한글_코드'])
    expect(ctx.getCodeName.mock.calls.map((c) => c[0])).toEqual(['EB470', '한글_코드'])
    goButton(page).click()
    expect(colOf(ctx.onSave.mock.calls[0]![0], 'sono').codes).toEqual(['SONO1', 'SONO', 'EB422', 'EB466', 'HA280', 'KK010', 'EB470', '한글_코드'])

    // 40개 한도
    document.body.replaceChildren()
    const full = fx.oursSettings()
    colOf(full, 'sono').codes = Array.from({ length: 40 }, (_, i) => `ZZ${i}`)
    const drawn = await openEditor(full, 'sono')
    direct(drawn.page, 'EB471')
    rxRow(drawn.page, 'MM015').click()
    expect(tabsOf(drawn.page)[0]![0]).toBe('넣을 처방 · 40개')
    expect(rxRow(drawn.page, 'MM015').getAttribute('aria-checked')).toBe('false')
  })

  it('AC-5713.6: X-RAY 넣을 처방 맨 위는 규칙 상자 "단순 촬영 코드 전부 (G1~G8로 시작)"이고, 켜져 있으면 G 규칙 줄은 회색 체크 + "전부에 들어 있어요"이며 바꿀 수 없다. 끄면 하나씩 고른다', async () => {
    const { page, ctx } = await openEditor(fx.oursSettings(), 'xray')
    const body = sheetOf(page)!.querySelector(':scope > .col-body')!
    expect(shapeOf(body)).toEqual(['div.rx-rule', 'div.rx-tools', 'ul.rx-list', 'form.rx-direct', 'p.hint.rx-note'])
    const rule = body.querySelector<HTMLElement>('.rx-rule')!
    expect([rule.className, rule.getAttribute('role'), rule.getAttribute('aria-checked'), rule.getAttribute('tabindex')]).toEqual(['rx-rule', 'checkbox', 'true', '0'])
    expect(shapeOf(rule)).toEqual(['span.box', 'span.rr-t', 'span.rr-d'])
    expect(textsOf(rule, '.rr-t, .rr-d')).toEqual([RULE_T, RULE_D])
    expect(textOf(body, '.rx-tools > .hint')).toBe('지난 30일 이 병원 처방 · 단순 촬영 코드 전부 + 따로 고른 것 0개')
    const g = rxRow(page, 'G7101')
    expect([g.className, g.getAttribute('aria-checked'), g.getAttribute('aria-disabled')]).toEqual(['rx-row on ruled', 'true', 'true'])
    expect(rxItems(page)[1]).toEqual(['G7101', '가상 경추 촬영', true, ['추천', '전부에 들어 있어요'], '164명'])
    expect(rxRow(page, 'G0400').classList.contains('ruled')).toBe(false)
    g.click()
    expect(rxRow(page, 'G7101').getAttribute('aria-checked')).toBe('true')
    direct(page, 'g7301')
    expect(directMsg(page)).toEqual([DIRECT_SAME, true])
    // 다른 칸 창에서는 X-RAY 규칙 코드가 "X-RAY에도 넣음"이다(위 sono 시험)
    rule.click()
    expect(sheetOf(page)!.querySelector('.rx-rule')!.className).toBe('rx-rule off')
    expect(tabsOf(page)[0]![0]).toBe('넣을 처방 · 0개')
    expect(rxRow(page, 'G7101').getAttribute('aria-checked')).toBe('false')
    rxRow(page, 'G7101').click()
    goButton(page).click()
    expect(colOf(ctx.onSave.mock.calls[0]![0], 'xray')).toMatchObject({ rule: false, codes: ['G7101'] })
  })

  it('AC-5713.2: 처방 목록을 읽는 동안·못 읽음·30일 처방 없음 글이 있고, 못 읽었으면 탭을 다시 열 때 한 번 더 읽는다', async () => {
    let fail: (e: Error) => void = () => {}
    const getCodes = vi.fn(() => new Promise<FakeCode[]>((_, reject) => (fail = reject)))
    const { page } = await openEditor(fx.oursSettings(), 'sono', { getCodes })
    expect(rxItems(page)).toEqual([['!', '읽는 중…']])
    fail(new Error('끊김'))
    await flush()
    expect(rxItems(page)).toEqual([['!', CODES_FAILED]])
    getCodes.mockImplementation(() => Promise.resolve([]))
    tabButton(page, '고르기 목록').click()
    tabButton(page, '넣을 처방 · 5개').click()
    await flush()
    expect(getCodes).toHaveBeenCalledTimes(2)
    // 30일 처방이 없어도 넣은 코드는 직접 넣은 코드로 보인다
    expect(rxItems(page)[0]).toEqual(['#', '직접 넣은 코드', '지난 30일에 없던 것'])
    document.body.replaceChildren()
    const empty = await openEditor(fx.freshSettings(), 'sono', { getCodes: () => Promise.resolve([]) })
    expect(rxItems(empty.page)).toEqual([['!', CODES_EMPTY]])
  })
})

// ---- 고르기 목록 탭·더한 칸 (AC-5713.7·5713.8) ---------------------------------------------------------------

describe('REQ-5713 고르기 목록·이 칸 빼기', () => {
  it('AC-5713.7: [고르기 목록] 탭은 위 글 + (SONO·충격파 고정 글) + 그 칸 목록이고 줄 머리 작은 글은 "하나 이상 골라요 · N개" 또는 "안 골라도 돼요 · N개"다', async () => {
    const { page } = await openEditor(fx.oursSettings(), 'carm', { tab: 'list' })
    const body = sheetOf(page)!.querySelector(':scope > .col-body')!
    expect(shapeOf(body)).toEqual(['p.hint.lt-top', 'div.lt-groups'])
    expect(textOf(body, 'p.lt-top')).toBe(LIST_TOP)
    expect([...body.querySelectorAll('.lt-group > h3')].map((h) => [ownText(h), h.querySelector('.sm')?.textContent])).toEqual([
      ['시술', '하나 이상 골라요 · 4개'],
      ['약재', '안 골라도 돼요 · 3개'],
    ])
    tabButton(page, '넣을 처방 · 2개').click()
    expect(sheetOf(page)!.querySelector('.lt-groups')).toBeNull()
    document.body.replaceChildren()
    const eswt = await openEditor(fx.oursSettings(), 'eswt')
    expect(shapeOf(sheetOf(eswt.page)!.querySelector(':scope > .col-body'))).toEqual(['p.hint.lt-top', 'p.lt-fixed', 'div.lt-groups'])
    expect(textOf(sheetOf(eswt.page), '.lt-fixed')).toBe('칸에는 "3000타 2부위"처럼 타수와 부위 수가 함께 보여요.')
  })

  it('AC-5713.7 · AC-5713.8: 더한 칸은 "고르기" 한 줄(0~8개, 마지막 하나도 ✕ 됨)이고 왼쪽 [이 칸 빼기]는 그 칸과 picks.extra 목록을 뺀 문서를 바로 저장(띠 "{칸} 칸을 뺐어요", 되돌리기 있음)하고 창을 닫는다', async () => {
    const settings = fx.imsSettings(['목'])
    const { page, ctx } = await openEditor(settings, 'x1')
    expect(tabsOf(page)).toEqual([['고르기 목록', true]])
    const group = sheetOf(page)!.querySelector('.lt-group')!
    expect([ownText(group.querySelector('h3')), group.querySelector('h3 .sm')!.textContent]).toEqual(['고르기', '하나 이상 골라요 · 1개'])
    const input = group.querySelector<HTMLInputElement>('form.lt-add > input')!
    expect([input.placeholder, input.getAttribute('aria-label')]).toEqual(['새 항목', '새 고르기'])
    const del = group.querySelector<HTMLButtonElement>('li.lt-row > button.lt-btn.del')!
    expect(del.disabled).toBe(false)
    del.click()
    expect(sheetOf(page)!.querySelector('.lt-group .lt-empty')).not.toBeNull()
    for (let i = 1; i <= 9; i += 1) {
      const form = sheetOf(page)!.querySelector('.lt-group form.lt-add')!
      typeIn(form.querySelector('input')!, `부위${i}`)
      form.querySelector<HTMLButtonElement>('button')!.click()
    }
    expect(sheetOf(page)!.querySelector('.lt-group h3 .sm')!.textContent).toBe('하나 이상 골라요 · 8개')
    const go = sheetOf(page)!.querySelector(':scope > .sheet-go')!
    expect(shapeOf(go)).toEqual(['button.del-col', 'button.sheet-close', 'button.go.short'])
    expect(textsOf(go, 'button')).toEqual(['이 칸 빼기', '취소', '저장'])
    go.querySelector<HTMLButtonElement>('button.del-col')!.click()
    expect(ctx.onSave).toHaveBeenCalledTimes(1)
    const [next, text, opts] = ctx.onSave.mock.calls[0]!
    expect(next).toEqual({ ...fx.oursSettings(), nextX: 2 })
    expect([text, opts]).toEqual(['IMS 칸을 뺐어요', { undo: true }])
    await flush()
    expect(sheetOf(page)).toBeNull()
  })

  it('AC-5713.7: [저장]은 그 칸의 목록만 초안대로 넘기고 다른 칸 목록은 문서 그대로다', async () => {
    const { page, ctx } = await openEditor(fx.imsSettings(), 'x1')
    const form = sheetOf(page)!.querySelector('.lt-group form.lt-add')!
    typeIn(form.querySelector('input')!, '발목')
    form.querySelector<HTMLButtonElement>('button')!.click()
    goButton(page).click()
    const next = ctx.onSave.mock.calls[0]![0] as FakeSettings
    expect(next.picks).toEqual({ ...fx.defaultPicks(), extra: { x1: ['목', '어깨', '허리', '무릎', '발목'] } })
    expect(ctx.onSave.mock.calls[0]!.slice(1)).toEqual(['IMS 칸을 저장했어요', { undo: false }])
  })
})

// ---- 칸 더하기 창 (AC-5713.9) -----------------------------------------------------------------------------------

describe('REQ-5713 칸 더하기', () => {
  it('AC-5713.9: [+ 칸 더하기]는 창 "칸 더하기"를 연다: 이름(예: IMS) · 종류 카드 둘 · 단계 · 종류에 맞는 아래 글 · [취소][더하기](이름이 비면 꺼짐)', () => {
    const { page } = drawPage(fx.oursSettings())
    page.querySelector<HTMLButtonElement>('button.col-add')!.click()
    const sheet = sheetOf(page)!
    expect(sheet.getAttribute('aria-label')).toBe('칸 더하기')
    expect(shapeOf(sheet)).toEqual(['div.sheet-h', 'div.cf', 'p.lt-foot-note', 'div.sheet-go'])
    expect(textsOf(sheet, '.sheet-h > span')).toEqual(['칸 더하기', ADD_SUB])
    expect(shapeOf(sheet.querySelector('.cf'))).toEqual(['span.cf-l', 'input.txt', 'span.cf-hint.hint', 'span.cf-l', 'div.kind-cards', 'span.cf-l', 'div.seg'])
    const name = nameInput(page)
    expect([name.value, name.placeholder, name.maxLength, name.getAttribute('aria-label')]).toEqual(['', '예: IMS', 10, '칸 이름'])
    expect(textOf(sheet, '.cf-hint')).toBe(NAME_HINT)
    const cards = sheet.querySelector('.kind-cards')!
    expect([cards.getAttribute('role'), cards.getAttribute('aria-label')]).toEqual(['group', '종류'])
    expect([...cards.querySelectorAll('button')].map((b) => [textOf(b, '.kc-t'), textOf(b, '.kc-d'), b.getAttribute('aria-pressed')])).toEqual([
      ['직접 칸', KC_MN, 'false'],
      ['처방 칸', KC_RX, 'true'],
    ])
    expect(segOf(page, '단계')).toEqual([
      [STEP2, true],
      [STEP3, false],
    ])
    expect(textOf(sheet, 'p.lt-foot-note')).toBe(ADD_FOOT_RX)
    expect(textsOf(sheet, '.sheet-go > button')).toEqual(['취소', '더하기'])
    expect(goButton(page).disabled).toBe(true)
    segButton(page, '종류', '직접 칸').click()
    expect(textOf(sheetOf(page), 'p.lt-foot-note')).toBe(ADD_FOOT_MN)
    expect(document.activeElement).toBe(segButton(page, '종류', '직접 칸'))
  })

  it('AC-5713.9: [더하기]는 열쇠 x{nextX}(nextX +1)·added·show 참·codes 빈 칸을 맨 끝에, picks.extra에 빈 목록을 더해 저장하고(띠 "{칸} 칸을 더했어요") 창을 닫는다. 이름이 규칙에 맞지 않으면 꺼진다', async () => {
    const settings = fx.imsSettings()
    settings.nextX = 4
    const { page, onSave } = drawPage(settings)
    page.querySelector<HTMLButtonElement>('button.col-add')!.click()
    for (const bad of ['   ', 'IMS', 'a|b', '가'.repeat(11)]) {
      typeIn(nameInput(page), bad)
      expect(goButton(page).disabled, bad).toBe(true)
      expect(sheetOf(page)!.querySelector('.cf-hint')!.classList.contains('is-bad'), bad).toBe(true)
    }
    typeIn(nameInput(page), ' 주사 ')
    segButton(page, '단계', STEP3).click()
    expect(nameInput(page).value).toBe(' 주사 ')
    goButton(page).click()
    const want = fx.imsSettings()
    want.nextX = 5
    want.cols.push({ k: 'x4', name: '주사', kind: 'rx', steps: 3, show: true, added: true, codes: [] })
    want.picks.extra.x4 = []
    expect(onSave.mock.calls[0]).toEqual([want, '주사 칸을 더했어요', { undo: false }])
    await flush()
    expect(sheetOf(page)).toBeNull()
  })
})

// ---- 로고 줄이기 (AC-5712.3, design.md 5절) --------------------------------------------------------------------

describe('REQ-5712 로고 줄이기', () => {
  /** 가짜 그림 열기·canvas: 그린 크기와 만든 형식·품질을 적는다. size(type, quality)가 만든 파일 바이트 수 */
  function fakeCanvas(width: number, height: number, size: (type: string, quality: number | undefined) => number = () => 1000) {
    const close = vi.fn()
    const open = vi.fn(() => Promise.resolve({ width, height, close }))
    vi.stubGlobal('createImageBitmap', open)
    const drawn: number[][] = []
    const made: [string, number | undefined, number, number][] = []
    const ctx = { drawImage: vi.fn((_img: unknown, x: number, y: number, w: number, h: number) => drawn.push([x, y, w, h])), fillRect: vi.fn(), fillStyle: '' }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ctx as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, done: BlobCallback, type?: string, quality?: number) {
      made.push([type ?? '', quality, this.width, this.height])
      done(new Blob([new Uint8Array(size(type ?? '', quality))], { type }))
    })
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation((type?: string) => `data:${type};base64,AAAA`)
    return { open, close, drawn, made }
  }

  it('AC-5712.3: 가로 1200·세로 300 안으로 비율 그대로 줄이고(작으면 그대로 크기) PNG는 PNG로, 그 밖은 JPEG(품질 0.9)로 다시 만든다. 미리 보기는 data: URL이다', async () => {
    const big = fakeCanvas(3000, 500)
    const png = await ui.shrinkLogo(new File([new Uint8Array(10)], 'logo.png', { type: 'image/png' }))
    expect(big.drawn).toEqual([[0, 0, 1200, 200]])
    expect(big.made).toEqual([['image/png', undefined, 1200, 200]])
    expect([png.type, png.bytes.length, png.url]).toEqual(['image/png', 1000, 'data:image/png;base64,AAAA'])
    expect(png.bytes).toBeInstanceOf(Uint8Array)
    expect(big.close).toHaveBeenCalled()
    vi.restoreAllMocks()

    const tall = fakeCanvas(800, 1200)
    const jpeg = await ui.shrinkLogo(new File([new Uint8Array(10)], 'logo.jpg', { type: 'image/jpeg' }))
    expect(tall.drawn).toEqual([[0, 0, 200, 300]])
    expect(tall.made).toEqual([['image/jpeg', 0.9, 200, 300]])
    expect(jpeg.type).toBe('image/jpeg')
    vi.restoreAllMocks()

    const small = fakeCanvas(400, 100)
    const webp = await ui.shrinkLogo(new File([new Uint8Array(10)], 'logo.webp', { type: 'image/webp' }))
    expect(small.drawn).toEqual([[0, 0, 400, 100]])
    expect(small.made).toEqual([['image/jpeg', 0.9, 400, 100]])
    expect(webp.type).toBe('image/jpeg')
  })

  it('AC-5712.3: 다시 만든 그림이 2MB를 넘으면 JPEG 품질 0.8 → 0.7로 다시 만들고, 그래도 넘으면 올리지 못한다(open)', async () => {
    const MB2 = 2097152
    const tries = fakeCanvas(1200, 300, (type, q) => (type === 'image/jpeg' && q === 0.7 ? MB2 : MB2 + 1))
    const got = await ui.shrinkLogo(new File([new Uint8Array(10)], 'logo.png', { type: 'image/png' }))
    expect(tries.made.map((m) => [m[0], m[1]])).toEqual([
      ['image/png', undefined],
      ['image/jpeg', 0.8],
      ['image/jpeg', 0.7],
    ])
    expect([got.type, got.bytes.length]).toEqual(['image/jpeg', MB2])
    vi.restoreAllMocks()
    fakeCanvas(1200, 300, () => MB2 + 1)
    await expect(ui.shrinkLogo(new File([new Uint8Array(10)], 'logo.jpg', { type: 'image/jpeg' }))).rejects.toThrow('open')
  })

  it('AC-5712.3: 20MB보다 큰 파일은 열지 않고 big으로 끝나고, 열 수 없는 그림은 open이다', async () => {
    const canvas = fakeCanvas(100, 100)
    const huge = new File([new Uint8Array(10)], 'big.png', { type: 'image/png' })
    Object.defineProperty(huge, 'size', { value: 20 * 1024 * 1024 + 1 })
    await expect(ui.shrinkLogo(huge)).rejects.toThrow('big')
    expect(canvas.open).not.toHaveBeenCalled()
    const edge = new File([new Uint8Array(10)], 'edge.png', { type: 'image/png' })
    Object.defineProperty(edge, 'size', { value: 20 * 1024 * 1024 })
    await expect(ui.shrinkLogo(edge)).resolves.toMatchObject({ type: 'image/png' })
    canvas.open.mockImplementation(() => Promise.resolve({ width: 0, height: 0, close: vi.fn() }))
    await expect(ui.shrinkLogo(new File([new Uint8Array(10)], 'x.png', { type: 'image/png' }))).rejects.toThrow('open')
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null)
    canvas.open.mockImplementation(() => Promise.resolve({ width: 10, height: 10, close: vi.fn() }))
    await expect(ui.shrinkLogo(new File([new Uint8Array(10)], 'x.png', { type: 'image/png' }))).rejects.toThrow('open')
  })
})

// ---- 화면 파일 (AC-5714.1) -------------------------------------------------------------------------------------

describe('REQ-5714 설정 화면 파일', () => {
  it('AC-5714.1: settings.js는 화면 파일만 불러오고 HTML 넣기·브라우저 저장소·console·eval·fetch·바깥 주소를 쓰지 않는다. 로고 미리 보기는 board.js logoOf(data: URL 검사)로만 넣는다', () => {
    const source = readWww('settings.js')
    expect(source.length).toBeGreaterThan(0)
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(code).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|DOMParser|localStorage|sessionStorage|indexedDB|\bcaches\b|cookie|serviceWorker|console|\beval\b|new Function|\bfetch\b|XMLHttpRequest|WebSocket|sendBeacon|https?:/)
    expect(code).not.toMatch(/\.src\s*=[^=]|setAttribute\(\s*['"](?:src|href)/)
    for (const m of code.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) expect(m[1]).toMatch(/^\.\/[\w-]+\.js$/)
    expect(code).toMatch(/\blogoOf\b/)
  })

  it('AC-5712.1 · AC-5713.1: 설정 쪽·안내·칸 고치기·칸 더하기 글은 승인 시안 notes.md 글 그대로다', () => {
    const notes = readFileSync(NOTES, 'utf8')
    for (const text of [
      LEAD,
      GUIDE_SUB,
      LOGO_SUB,
      PIC_HINT,
      TEXT_HINT,
      NONE_HINT,
      TAB_SUB,
      TAB_HINT,
      COLS_SUB,
      LOGO_TOAST,
      RX_SUB,
      MN_SUB,
      NAME_HINT,
      FOOT,
      FOOT_SHEET,
      LIST_TOP,
      RX_NOTE,
      DIRECT_T,
      DIRECT_HINT,
      DIRECT_ADDED,
      DIRECT_BAD,
      DIRECT_SAME,
      DIRECT_LISTED,
      NO_MATCH,
      RULE_T,
      RULE_D,
      CODES_FAILED,
      CODES_EMPTY,
      ADD_SUB,
      ADD_FOOT_RX,
      ADD_FOOT_MN,
      KC_MN,
      KC_RX,
      '처방이 나오면 칸에 저절로 들어오게 해요 · 지금 SONO 0개 · C-ARM 0개',
      '어레인지 탭을 안 써요 · [접수 현황] 탭만 보여요',
      '어레인지 탭을 안 써서 안 해도 돼요',
      '그림 파일이 너무 커요 · 20MB보다 작은 그림을 골라요',
    ])
      expect(notes, text).toContain(text)
    const mockup = readFileSync(MOCKUP, 'utf8')
    for (const text of [TAB_ON, TAB_OFF, NO_TABS]) expect(mockup, text).toContain(text)
  })

  it('AC-5712.1 · AC-5713.1: 설정 쪽·안내·창이 그리는 class는 모두 style.css에 모양이 있고, 누르는 단추·글 칸은 44px 이상이다', async () => {
    const css = readWww('style.css').replace(/\/\*[\s\S]*?\*\//g, '')
    const classes = new Set<string>()
    const collect = (root: ParentNode) => {
      for (const n of root.querySelectorAll('*')) for (const c of n.classList) classes.add(c)
    }
    const fresh = fx.freshSettings()
    fresh.logo.text = '가나다'
    fresh.setup.logo = true
    const hidden = fx.imsSettings()
    colOf(hidden, 'ds').show = false
    const pages: [FakeSettings, View][] = [
      [fresh, { toast: { text: '띠', undo: true } }],
      [hidden, { logoPic: { ver: 1, src: fx.fakeLogoUrl() } }],
      [{ ...fx.oursSettings(), logo: { mode: 'text', text: '가나다', ver: 1 } }, { state: 'ok' }],
      [fx.oursSettings(), { state: 'error' }],
    ]
    for (const [settings, view] of pages) {
      const { page } = drawPage(view.state === 'error' ? null : settings, view)
      collect(page.parentElement!)
      document.body.replaceChildren()
    }
    const ims = fx.imsSettings()
    colOf(ims, 'sono').codes.push('EB470')
    for (const [key, tab] of [
      ['sono', 'rx'],
      ['xray', 'rx'],
      ['x1', 'list'],
      ['carm', 'list'],
    ] as const) {
      const { page } = await openEditor(ims, key, { tab })
      if (tab === 'rx') direct(page, 'A-1')
      collect(page)
      document.body.replaceChildren()
    }
    const adder = drawPage(ims).page
    adder.querySelector<HTMLButtonElement>('button.col-add')!.click()
    typeIn(nameInput(adder), 'IMS')
    collect(adder)
    for (const cls of ['set-top', 'set-title', 'set-lead', 'set-main', 'set-left', 'set-card', 'set-guide', 'sg-steps', 'sg-step', 'done', 'seg', 'logo-pane', 'logo-preview', 'lp-img', 'lp-none', 'logo-file', 'name-row', 'txt', 'col-row', 'is-off', 'kind', 'new', 'col-sum', 'col-move', 'col-edit', 'col-add', 'col-sheet', 'cf', 'cf-hint', 'is-bad', 'rx-rule', 'rx-row', 'ruled', 'rx-gh', 'also', 'rec', 'typed', 'rx-direct', 'rd-msg', 'bad', 'del-col', 'short', 'kind-cards', 'kc-t', 'kc-d', 'set-fail', 'toast'])
      expect(classes.has(cls), cls).toBe(true)
    for (const cls of classes) expect(css, `.${cls}`).toMatch(new RegExp(`\\.${cls}(?![\\w-])`))
    for (const selector of ['.btn-line', '.btn-ink', '.txt', '.seg > button', '.col-edit', '.col-add', '.col-row .lt-btn', '.rx-row', '.sheet-go .del-col', '.kind-cards > button', '.back']) {
      const value = cssValue(selector, 'min-height')
      expect(value, selector).toBeDefined()
      expect(Number.parseFloat(value!), selector).toBeGreaterThanOrEqual(44)
    }
    expect(cssValue('.cf-hint.is-bad', 'color')).toBe('var(--memo-red)')
    expect(cssValue('.rx-direct .rd-msg.bad', 'color')).toBe('var(--memo-red)')
    expect(cssValue('.rx-gh', 'position')).toBe('sticky')
  })
})
