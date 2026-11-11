// @vitest-environment jsdom
// 어레인지 메모 memo.js (reception-memo-papers TASK-6, REQ-3403·REQ-3405, design.md 3절). 승인 시안 Mock.html(setupMemo)의 글·차례 그대로.
// 메모는 이 기기 localStorage 열쇠 reception-memo 하나에 { v: 1, text, ink }만 둔다. 큰 창·띠는 document.body에 붙는다.
// jsdom에는 그림 판(canvas)이 없어 가짜 getContext·toDataURL을 끼운다. 자료는 가짜다
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

interface MemoJs {
  memoBox: () => HTMLElement
  openMemo: () => void
  closeMemo: () => void
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const WWW = path.join(ROOT, 'reception', 'www')
const MEMO_JS = '../www/memo.js'
const KEY = 'reception-memo'
/** 가짜 손글씨 그림(작은 PNG 모양 data URL) */
const INK = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const DRAWN = 'data:image/png;base64,ZHJhd24='
const SAVE_FAILED = '메모를 이 기기에 저장하지 못했어요'

let memo: MemoJs

beforeAll(async () => {
  const missing: MemoJs = {
    memoBox: () => document.createElement('div'),
    openMemo: () => {},
    closeMemo: () => {},
  }
  memo = ((await import(/* @vite-ignore */ MEMO_JS).catch(() => missing)) ?? missing) as MemoJs
})

// ---- 가짜 그림 판 --------------------------------------------------------------------------------------

interface Stroke {
  op: string
  width: number
  style: string
  mode: string
}

let strokes: Stroke[]
let cleared: number
let dataUrl: string

function fakeContext() {
  const ctx = {
    lineWidth: 1,
    strokeStyle: '',
    globalCompositeOperation: 'source-over',
    lineCap: 'butt',
    lineJoin: 'miter',
    scale: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    drawImage: () => {},
    save: () => {},
    restore: () => {},
    stroke: () => strokes.push({ op: 'stroke', width: ctx.lineWidth, style: ctx.strokeStyle, mode: ctx.globalCompositeOperation }),
    clearRect: () => {
      cleared += 1
    },
  }
  return ctx
}

beforeEach(() => {
  strokes = []
  cleared = 0
  dataUrl = DRAWN
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(fakeContext as never)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(() => dataUrl)
  // 펜 색은 theme.css 토큰을 읽는다(시험에서는 theme.css를 넣지 않으므로 계산된 값만 바꿔 끼운다)
  const real = window.getComputedStyle.bind(window)
  vi.spyOn(window, 'getComputedStyle').mockImplementation((node: Element, pseudo?: string | null) => {
    const style = real(node, pseudo)
    if (node !== document.documentElement) return style
    return new Proxy(style, {
      get(target, prop) {
        if (prop === 'getPropertyValue')
          return (name: string) => ({ '--memo-ink': ' #222222', '--memo-red': '#E03131 ' })[name] ?? target.getPropertyValue(name)
        const value = Reflect.get(target, prop)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
  })
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('메모는 묻지 않는다'))),
  )
  localStorage.clear()
})

afterEach(() => {
  memo.closeMemo()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.replaceChildren()
  localStorage.clear()
})

// ---- 시험 도구 ----------------------------------------------------------------------------------------

/** #app 머리 줄 자리에 메모 칸을 하나 그린다(board.js topOf 대역) */
function drawBox(): HTMLElement {
  const app = document.createElement('div')
  app.id = 'app'
  const row = document.createElement('div')
  row.className = 'top-row with-memo'
  row.append(memo.memoBox())
  app.append(row)
  document.body.append(app)
  return app
}

function box(): HTMLElement {
  const found = document.querySelector<HTMLElement>('#app .memo-box')
  if (!found) throw new Error('메모 칸 없음')
  return found
}

function shapeOf(node: Element | null | undefined): string[] {
  return [...(node?.children ?? [])].map((c) => `${c.tagName.toLowerCase()}${c.getAttribute('class') ? `.${String(c.getAttribute('class')).split(' ').join('.')}` : ''}`)
}

function sheet(): HTMLElement | null {
  return document.querySelector<HTMLElement>('body > .sheet-back.memo-back > .sheet.memo-sheet')
}

function back(): HTMLElement {
  return document.querySelector<HTMLElement>('body > .sheet-back.memo-back')!
}

function area(): HTMLTextAreaElement {
  return sheet()!.querySelector<HTMLTextAreaElement>('textarea.memo-text')!
}

function pad(): HTMLCanvasElement {
  return sheet()!.querySelector<HTMLCanvasElement>('canvas.memo-pad')!
}

function button(root: ParentNode, label: string): HTMLButtonElement {
  const found = [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === label)
  if (!found) throw new Error(`단추 ${label} 없음`)
  return found
}

function type(text: string) {
  area().value = text
  area().dispatchEvent(new Event('input', { bubbles: true }))
}

/** 판 위에 한 획: pointerType·pressure를 준다 */
function draw(kind: 'pen' | 'touch' | 'mouse' = 'touch', pressure = 0) {
  const fire = (name: string, x: number, y: number) => {
    const event = new MouseEvent(name, { bubbles: true, cancelable: true, clientX: x, clientY: y })
    Object.defineProperties(event, { pointerType: { value: kind }, pressure: { value: pressure }, pointerId: { value: 7 } })
    pad().dispatchEvent(event)
  }
  fire('pointerdown', 10, 10)
  fire('pointermove', 20, 14)
  fire('pointermove', 30, 18)
  fire('pointerup', 30, 18)
}

function stored(): unknown {
  const raw = localStorage.getItem(KEY)
  return raw === null ? null : JSON.parse(raw)
}

function store(value: unknown) {
  localStorage.setItem(KEY, JSON.stringify(value))
}

function toast(): HTMLElement | null {
  return document.querySelector<HTMLElement>('body > .toast.memo-toast')
}

// ---- 메모 칸 (AC-3403.1) --------------------------------------------------------------------------------

describe('REQ-3403 어레인지 메모 칸', () => {
  it('AC-3403.1: 메모가 없으면 점선 칸 "메모 쓰기 · 펜이나 글자로"(펜 그림 + 글)이고 누르는 곳(role=button, tabindex=0)이다', () => {
    drawBox()
    const b = box()
    expect(b.tagName).toBe('DIV')
    expect(b.className).toBe('memo-box')
    expect(b.getAttribute('role')).toBe('button')
    expect(b.getAttribute('tabindex')).toBe('0')
    expect(shapeOf(b)).toEqual(['svg.memo-ic', 'span.memo-empty'])
    expect(b.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
    expect(b.textContent).toBe('메모 쓰기 · 펜이나 글자로')
  })

  it('AC-3403.1: 메모가 있으면 빨간 칸(has)에 [메모] 이름표·글 첫 줄·손글씨 작은 그림·[✕]가 있다', () => {
    store({ v: 1, text: '  오후 3시 원장님 외출 → 4시 복귀\nICE팩 부족, 7층에서 가져오기', ink: INK })
    drawBox()
    const b = box()
    expect(b.className).toBe('memo-box has')
    expect(shapeOf(b)).toEqual(['span.memo-tag', 'span.memo-prev', 'img.memo-thumb', 'button.memo-x'])
    expect(b.querySelector('.memo-tag')?.textContent).toBe('메모')
    expect(b.querySelector('.memo-prev')?.textContent).toBe('오후 3시 원장님 외출 → 4시 복귀')
    const thumb = b.querySelector<HTMLImageElement>('img.memo-thumb')!
    expect(thumb.getAttribute('src')).toBe(INK)
    expect(thumb.getAttribute('alt')).toBe('손글씨 메모')
    const x = b.querySelector<HTMLButtonElement>('button.memo-x')!
    expect(x.getAttribute('type')).toBe('button')
    expect(x.getAttribute('aria-label')).toBe('메모 지우기')
    expect(x.textContent).toBe('✕')
  })

  it('AC-3403.1: 글이 없으면 첫 줄 자리는 "손글씨 메모"이고, 그림이 없으면 작은 그림이 없다', () => {
    store({ v: 1, text: '', ink: INK })
    drawBox()
    expect(box().querySelector('.memo-prev')?.textContent).toBe('손글씨 메모')
    document.body.replaceChildren()
    store({ v: 1, text: '\n\n택배 4시', ink: null })
    drawBox()
    expect(shapeOf(box())).toEqual(['span.memo-tag', 'span.memo-prev', 'button.memo-x'])
    expect(box().querySelector('.memo-prev')?.textContent).toBe('택배 4시')
  })

  it('AC-3403.1: 저장된 메모가 그대로면 다시 그릴 때 같은 칸을 쓰고(작은 그림이 깜빡이지 않게), 메모가 바뀌면 새 칸이다', () => {
    store({ v: 1, text: '택배', ink: INK })
    const first = memo.memoBox()
    expect(memo.memoBox()).toBe(first)
    store({ v: 1, text: '택배 4시', ink: INK })
    const second = memo.memoBox()
    expect(second).not.toBe(first)
    expect(second.querySelector('.memo-prev')?.textContent).toBe('택배 4시')
  })

  it('AC-3403.1: 메모 글은 HTML이어도 글자로만 보인다', () => {
    store({ v: 1, text: '<b>가상환자21</b> 3시', ink: null })
    drawBox()
    expect(box().querySelector('.memo-prev')?.textContent).toBe('<b>가상환자21</b> 3시')
    expect(box().querySelector('b')).toBeNull()
  })
})

// ---- 큰 창 (AC-3403.2) --------------------------------------------------------------------------------

describe('REQ-3403 메모 큰 창', () => {
  it('AC-3403.2: 칸을 누르면(Enter·Space 포함) document.body에 큰 창이 열린다: "이 기기에만 저장돼요" 안내·글자 칸·펜 도구·그리기 판·[메모 지우기]·[닫기]', () => {
    drawBox()
    box().click()
    const s = sheet()
    expect(s).not.toBeNull()
    expect(document.querySelector('#app .sheet-back')).toBeNull()
    expect(s!.getAttribute('role')).toBe('dialog')
    expect(s!.getAttribute('aria-modal')).toBe('true')
    expect(s!.getAttribute('aria-label')).toBe('메모')
    expect(shapeOf(s)).toEqual(['div.sheet-h', 'div.memo-h', 'textarea.memo-text', 'div.memo-h', 'div.pen-tools', 'canvas.memo-pad', 'div.memo-foot'])
    expect(s!.querySelector('.sheet-title')?.textContent).toBe('메모')
    expect(s!.querySelector('.sheet-sub')?.textContent).toBe('이 기기에만 저장돼요 · 다른 기기에서는 보이지 않아요')
    expect(s!.querySelector('.sheet-sub > b')?.textContent).toBe('이 기기에만')
    expect([...s!.querySelectorAll(':scope > .memo-h')].map((n) => n.textContent)).toEqual(['글자로 쓰기', '펜으로 쓰기 · 애플펜슬이나 손가락'])
    expect(area().getAttribute('placeholder')).toBe('여기를 눌러 키보드로 써요')
    expect(area().value).toBe('')
    const tools = [...s!.querySelectorAll<HTMLButtonElement>('.pen-tools > button')]
    expect(tools.map((b) => b.textContent)).toEqual(['검정', '빨강', '지우개', '펜 글씨 모두 지우기'])
    expect(tools.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', null])
    expect(shapeOf(tools[0])).toEqual(['span.pen-dot.ink'])
    expect(shapeOf(tools[1])).toEqual(['span.pen-dot.red'])
    expect(shapeOf(s!.querySelector('.memo-foot'))).toEqual(['button.memo-del', 'span.memo-note', 'button.sheet-x'])
    expect([...s!.querySelectorAll('.memo-foot > *')].map((n) => n.textContent)).toEqual(['메모 지우기', '닫으면 저절로 저장돼요', '닫기'])
    for (const b of s!.querySelectorAll('button')) expect(b.getAttribute('type')).toBe('button')
    memo.closeMemo()
    expect(sheet()).toBeNull()
    for (const key of ['Enter', ' ']) {
      box().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
      expect(sheet(), key).not.toBeNull()
      memo.closeMemo()
    }
    // 이미 열려 있으면 하나만
    box().click()
    box().click()
    expect(document.querySelectorAll('.memo-back').length).toBe(1)
  })

  it('AC-3403.2: [닫기]·창 바깥 누름·Esc는 저장하고 닫는다. 창 안을 누르면 닫히지 않는다', () => {
    drawBox()
    box().click()
    type('택배 4시')
    sheet()!.click()
    expect(sheet()).not.toBeNull()
    button(sheet()!, '닫기').click()
    expect(sheet()).toBeNull()
    expect(stored()).toEqual({ v: 1, text: '택배 4시', ink: null })

    box().click()
    expect(area().value).toBe('택배 4시')
    type('택배 5시')
    back().click()
    expect(sheet()).toBeNull()
    expect(stored()).toEqual({ v: 1, text: '택배 5시', ink: null })

    box().click()
    type('택배 6시')
    sheet()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(sheet()).toBeNull()
    expect(stored()).toEqual({ v: 1, text: '택배 6시', ink: null })
  })

  it('AC-3403.2 · AC-3403.6: 펜으로 그리면 굵기는 펜 압력을 따르고(손가락·마우스는 중간), 색은 theme.css --memo-ink·--memo-red를 읽어 쓰며, 지우개는 지운다', () => {
    drawBox()
    box().click()
    draw('pen', 1)
    expect(strokes.length).toBe(2)
    expect(strokes.every((s) => s.style === '#222222' && s.mode === 'source-over')).toBe(true)
    expect(strokes[0]!.width).toBeCloseTo(4.6)
    strokes = []
    draw('pen', 0.25)
    expect(strokes[0]!.width).toBeCloseTo(2.2)
    strokes = []
    draw('touch')
    expect(strokes[0]!.width).toBeCloseTo(3)
    strokes = []
    button(sheet()!, '빨강').click()
    expect([...sheet()!.querySelectorAll('.pen-tools > button')].map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false', null])
    draw('mouse')
    expect(strokes[0]!.style).toBe('#E03131')
    strokes = []
    button(sheet()!, '지우개').click()
    draw('pen', 1)
    expect(strokes[0]!.mode).toBe('destination-out')
    expect(strokes[0]!.width).toBeGreaterThan(10)
    // 누르지 않고 움직이면 그리지 않는다
    strokes = []
    pad().dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 5, clientY: 5 }))
    expect(strokes).toEqual([])
  })
})

// ---- 저장 (AC-3403.3) -------------------------------------------------------------------------------

describe('REQ-3403 메모 저장', () => {
  it('AC-3403.3: 닫으면 이 기기 localStorage 열쇠 reception-memo 하나에 { v: 1, text, ink: PNG data URL }만 담고, 칸을 그 메모로 다시 그린다', () => {
    drawBox()
    box().click()
    type('오후 3시 원장님 외출')
    draw('pen', 0.5)
    button(sheet()!, '닫기').click()
    expect(localStorage.length).toBe(1)
    expect(localStorage.key(0)).toBe(KEY)
    expect(stored()).toEqual({ v: 1, text: '오후 3시 원장님 외출', ink: DRAWN })
    expect(Object.keys(stored() as object).sort()).toEqual(['ink', 'text', 'v'])
    expect(box().className).toBe('memo-box has')
    expect(box().querySelector('.memo-prev')?.textContent).toBe('오후 3시 원장님 외출')
    expect(box().querySelector<HTMLImageElement>('img.memo-thumb')?.getAttribute('src')).toBe(DRAWN)
    // 새로 그린 칸(다시 그리기·새로 고침)도 저장한 메모다
    document.body.replaceChildren()
    drawBox()
    expect(box().querySelector('.memo-prev')?.textContent).toBe('오후 3시 원장님 외출')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('AC-3403.3: 그림을 고치지 않고 닫으면 앞 그림을 그대로 두고, [펜 글씨 모두 지우기] 뒤에는 그림이 없다(ink null)', () => {
    store({ v: 1, text: '택배', ink: INK })
    drawBox()
    box().click()
    button(sheet()!, '닫기').click()
    expect(stored()).toEqual({ v: 1, text: '택배', ink: INK })
    box().click()
    button(sheet()!, '펜 글씨 모두 지우기').click()
    expect(cleared).toBe(1)
    button(sheet()!, '닫기').click()
    expect(stored()).toEqual({ v: 1, text: '택배', ink: null })
  })

  it('AC-3403.3: 글도 그림도 없으면(빈칸·줄바꿈만) 열쇠를 지우고 칸은 빈 칸이다', () => {
    store({ v: 1, text: '택배', ink: null })
    drawBox()
    box().click()
    type('  \n ')
    button(sheet()!, '닫기').click()
    expect(localStorage.getItem(KEY)).toBeNull()
    expect(localStorage.length).toBe(0)
    expect(box().className).toBe('memo-box')
  })
})

// ---- 지우기 · 되돌리기 (AC-3403.4) ---------------------------------------------------------------------

describe('REQ-3403 메모 지우기', () => {
  it('AC-3403.4: [✕]는 창을 열지 않고 바로 지우고, document.body의 띠 "메모를 지웠어요" [되돌리기]가 5초 보인다. [되돌리기]는 앞 메모를 다시 저장한다', () => {
    vi.useFakeTimers()
    store({ v: 1, text: '택배 4시', ink: INK })
    drawBox()
    box().querySelector<HTMLButtonElement>('button.memo-x')!.click()
    expect(sheet()).toBeNull()
    expect(localStorage.getItem(KEY)).toBeNull()
    expect(box().className).toBe('memo-box')
    const t = toast()!
    expect(t.getAttribute('role')).toBe('status')
    expect(shapeOf(t)).toEqual(['span.toast-text', 'button.toast-undo'])
    expect(t.querySelector('.toast-text')?.textContent).toBe('메모를 지웠어요')
    // 판을 다시 그려도(#app을 비움) 띠는 남는다
    document.getElementById('app')!.replaceChildren()
    document.getElementById('app')!.append(memo.memoBox())
    vi.advanceTimersByTime(4900)
    expect(toast()).not.toBeNull()
    button(toast()!, '되돌리기').click()
    expect(toast()).toBeNull()
    expect(stored()).toEqual({ v: 1, text: '택배 4시', ink: INK })
    expect(box().className).toBe('memo-box has')
    // 띠는 5초 뒤 저절로 사라진다
    box().querySelector<HTMLButtonElement>('button.memo-x')!.click()
    vi.advanceTimersByTime(5000)
    expect(toast()).toBeNull()
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('AC-3403.4: [✕]를 Enter로 눌러도 창은 열리지 않는다', () => {
    store({ v: 1, text: '택배', ink: null })
    drawBox()
    box().querySelector('button.memo-x')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(sheet()).toBeNull()
  })

  it('AC-3403.4: 창의 [메모 지우기]는 창을 닫고 바로 지운다. [되돌리기]는 창에 있던 메모를 다시 저장한다', () => {
    store({ v: 1, text: '택배 4시', ink: null })
    drawBox()
    box().click()
    type('택배 4시 · 7층')
    button(sheet()!, '메모 지우기').click()
    expect(sheet()).toBeNull()
    expect(localStorage.getItem(KEY)).toBeNull()
    expect(toast()?.querySelector('.toast-text')?.textContent).toBe('메모를 지웠어요')
    button(toast()!, '되돌리기').click()
    expect(stored()).toEqual({ v: 1, text: '택배 4시 · 7층', ink: null })
    expect(box().querySelector('.memo-prev')?.textContent).toBe('택배 4시 · 7층')
  })
})

// ---- 저장소를 못 씀 (AC-3403.5) ------------------------------------------------------------------------

describe('REQ-3403 저장소를 못 쓸 때', () => {
  it.each([
    ['JSON 아님', '{not json'],
    ['판이 다름', JSON.stringify({ v: 2, text: '택배', ink: null })],
    ['글이 글자가 아님', JSON.stringify({ v: 1, text: 5, ink: null })],
    ['그림이 PNG data URL 아님', JSON.stringify({ v: 1, text: '택배', ink: 'javascript:alert(1)' })],
    ['그림이 바깥 주소', JSON.stringify({ v: 1, text: '택배', ink: 'https://evil.example/x.png' })],
    ['다른 칸이 더 있음', JSON.stringify({ v: 1, text: '택배', ink: null, who: '가상환자21' })],
    ['배열', JSON.stringify([1, '택배', null])],
    ['null', 'null'],
  ])('AC-3403.5: 읽은 값 모양이 틀리면(%s) 빈 메모로 보이고 화면은 멈추지 않는다', (_, raw) => {
    localStorage.setItem(KEY, raw)
    expect(() => drawBox()).not.toThrow()
    expect(box().className).toBe('memo-box')
    box().click()
    expect(area().value).toBe('')
  })

  it('AC-3403.5: 저장소가 막혀 있으면(읽기·쓰기 모두 오류) 빈 메모로 보이고, 닫을 때 띠 "메모를 이 기기에 저장하지 못했어요"가 보인다', () => {
    const blocked = () => {
      throw new DOMException('막힘', 'SecurityError')
    }
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked)
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(blocked)
    expect(() => drawBox()).not.toThrow()
    expect(box().className).toBe('memo-box')
    box().click()
    type('택배')
    expect(() => button(sheet()!, '닫기').click()).not.toThrow()
    expect(sheet()).toBeNull()
    expect(toast()?.querySelector('.toast-text')?.textContent).toBe(SAVE_FAILED)
    expect(toast()?.querySelector('.toast-undo')).toBeNull()
    expect(box().className).toBe('memo-box')
  })

  it('AC-3403.5: 저장소에 닿을 수 없으면(window.localStorage가 오류) 빈 메모로 보이고 멈추지 않는다', () => {
    const real = Object.getOwnPropertyDescriptor(window, 'localStorage')!
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('막힘', 'SecurityError')
      },
    })
    try {
      expect(() => drawBox()).not.toThrow()
      expect(box().className).toBe('memo-box')
      box().click()
      type('택배')
      expect(() => button(sheet()!, '닫기').click()).not.toThrow()
      expect(toast()?.querySelector('.toast-text')?.textContent).toBe(SAVE_FAILED)
    } finally {
      Object.defineProperty(window, 'localStorage', real)
    }
  })

  it('AC-3403.5: 꽉 차서 쓰지 못하면 띠가 보이고, [✕]로 지우지 못해도 띠가 보인다', () => {
    store({ v: 1, text: '택배', ink: null })
    drawBox()
    const full = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('꽉 참', 'QuotaExceededError')
    })
    box().click()
    type('택배 4시')
    draw('pen', 1)
    button(sheet()!, '닫기').click()
    expect(toast()?.querySelector('.toast-text')?.textContent).toBe(SAVE_FAILED)
    full.mockRestore()
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('막힘', 'SecurityError')
    })
    box().querySelector<HTMLButtonElement>('button.memo-x')!.click()
    expect(toast()?.querySelector('.toast-text')?.textContent).toBe(SAVE_FAILED)
    expect(toast()?.querySelector('.toast-undo')).toBeNull()
  })
})

// ---- 숨김·끊김 (closeMemo) ----------------------------------------------------------------------------

describe('REQ-3403 숨김·끊김', () => {
  it('AC-3403.3: closeMemo()는 열린 창을 저장하고 닫고 메모 띠도 내린다(app.js가 화면을 지울 때 부른다)', () => {
    store({ v: 1, text: '택배', ink: null })
    drawBox()
    box().querySelector<HTMLButtonElement>('button.memo-x')!.click()
    expect(toast()).not.toBeNull()
    button(toast()!, '되돌리기').click()
    box().click()
    type('택배 5시')
    memo.closeMemo()
    expect(sheet()).toBeNull()
    expect(stored()).toEqual({ v: 1, text: '택배 5시', ink: null })
    box().querySelector<HTMLButtonElement>('button.memo-x')!.click()
    memo.closeMemo()
    expect(toast()).toBeNull()
    expect(document.querySelector('.sheet-back, .toast')).toBeNull()
    // 열린 것이 없으면 아무것도 하지 않는다
    expect(() => memo.closeMemo()).not.toThrow()
  })
})

// ---- 색 · 울타리 (AC-3403.6 · AC-3405.2) --------------------------------------------------------------------

function readWww(rel: string): string {
  const file = path.join(WWW, rel)
  return existsSync(file) ? readFileSync(file, 'utf8') : ''
}

/** theme.css :root의 토큰 값 */
function rootValue(name: string): string | undefined {
  const css = readWww('theme.css').replace(/\/\*[\s\S]*?\*\//g, '')
  const root = /:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
  return new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(root)?.[1]?.trim()
}

describe('REQ-3403 · REQ-3405 메모 색과 울타리', () => {
  it('AC-3403.6: 새 색 --memo-red #E03131 · --memo-red-soft #FFF1F1 · --memo-ink #222222는 theme.css :root에만 있고, 메모 칸·펜 점·[메모 지우기]가 그 토큰을 쓴다', () => {
    expect(rootValue('--memo-red')?.toUpperCase()).toBe('#E03131')
    expect(rootValue('--memo-red-soft')?.toUpperCase()).toBe('#FFF1F1')
    expect(rootValue('--memo-ink')?.toUpperCase()).toBe('#222222')
    const style = readWww('style.css').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(style).toMatch(/\.memo-box\.has\s*\{[^}]*border:[^;}]*var\(--memo-red\)/)
    expect(style).toMatch(/\.memo-box\.has\s*\{[^}]*background:\s*var\(--memo-red-soft\)/)
    expect(style).toMatch(/\.pen-dot\.ink\s*\{[^}]*background:\s*var\(--memo-ink\)/)
    expect(style).toMatch(/\.pen-dot\.red\s*\{[^}]*background:\s*var\(--memo-red\)/)
    expect(readWww('memo.js')).toContain("'--memo-ink'")
    expect(readWww('memo.js')).toContain("'--memo-red'")
  })

  it('AC-3405.2: memo.js는 dom.js만 불러오고 fetch·api.js·판 자료·HTML 넣기·다른 저장소·console을 쓰지 않으며, 저장소 열쇠는 reception-memo 하나다', () => {
    const source = readWww('memo.js')
    expect(source.length).toBeGreaterThan(0)
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect([...code.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map((m) => m[1])).toEqual(['./dom.js'])
    expect(code).not.toMatch(/\bimport\s*\(/)
    expect(code).not.toMatch(/\bfetch\b|XMLHttpRequest|WebSocket|EventSource|sendBeacon|\/api\/|api\.js|board|arrange|innerHTML|outerHTML|insertAdjacentHTML|document\.write|DOMParser|sessionStorage|indexedDB|\bcaches\b|cookie|serviceWorker|console|\beval\b|new Function/)
    expect([...code.matchAll(/['"]reception-[\w-]+['"]/g)].map((m) => m[0])).toEqual(["'reception-memo'"])
  })
})
