// @vitest-environment jsdom
// 주소 보내기 화면의 [주소 복사] 단추 link.js (TASK-25, AC-1411.4, design.md 8절). jsdom에 LinkPage.cs가 그리는 모양의 HTML을 넣고
// 가짜 navigator.clipboard로 본다: 누르면 그 카드 단추의 data-url을 writeText → 단추 글 "복사했어요" 2초 → "주소 복사".
// 클립보드가 없거나 거절·던지면 그 카드의 주소 글을 골라 두고(Selection) 안내 글 "주소를 골라 두었어요. Ctrl+C를 눌러 복사해 주세요".
// 주소는 가짜(사설) 주소다. 시계는 가짜다
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

interface Clipboard {
  writeText: (text: string) => Promise<void>
}

interface LinkDeps {
  doc?: Document
  nav?: { clipboard?: Clipboard }
  win?: Window
}

interface LinkJs {
  startLink: (deps?: LinkDeps) => { stop: () => void }
  link: { stop: () => void } | null
}

// 화면 파일은 빌드 없는 JS라 형 선언이 없다. 경로를 값으로 두어 형 검사가 묻지 않게 한다
const LINK_JS = '../www/link.js'

const LABEL = '주소 복사'
const COPIED = '복사했어요'
const PICKED = '주소를 골라 두었어요. Ctrl+C를 눌러 복사해 주세요'
const SCHEME = ['ht', 'tp:'].join('')
const FIRST = `${SCHEME}${'/'.repeat(2)}192.168.0.23:47200`
const SECOND = `${SCHEME}${'/'.repeat(2)}10.0.0.8:47200`

/** LinkPage.cs가 그리는 body 모양(카드 둘). 클래스 이름은 LinkPage.test.cs가 C# 쪽에서 본다 */
function card(url: string): string {
  return (
    '<section class="link-card">' +
    `<a class="link-url" href="${url}/">${url}</a>` +
    `<button type="button" class="link-copy" data-url="${url}">${LABEL}</button>` +
    '<p class="link-help" role="status" aria-live="polite" hidden></p>' +
    '</section>'
  )
}

function render(urls: string[] = [FIRST, SECOND]): void {
  document.body.innerHTML =
    '<div class="link-page"><header class="link-top"><h1 class="link-title">접수 현황 주소 보내기</h1></header>' +
    `<main class="link-main">${urls.map(card).join('')}</main></div>`
}

function cards(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.link-card')]
}

function button(i: number): HTMLButtonElement {
  return cards()[i].querySelector<HTMLButtonElement>('button.link-copy')!
}

function help(i: number): HTMLElement {
  return cards()[i].querySelector<HTMLElement>('.link-help')!
}

function selected(): string {
  return document.getSelection()?.toString() ?? ''
}

/** 약속 뒤 일(then)이 다 돌게 한다 */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve()
}

function fakeClipboard(reply: () => Promise<void> = () => Promise.resolve()) {
  const writeText = vi.fn((text: string) => {
    void text
    return reply()
  })
  return { clipboard: { writeText }, writeText }
}

let mod: LinkJs
let running: { stop: () => void } | null = null
/** 화면 파일이 불릴 때 저절로 켜진 것(첫 화면) */
let auto: { stop: () => void } | null = null
let autoClipboard: ReturnType<typeof fakeClipboard>

beforeAll(async () => {
  // 파일을 부르기 전에 화면과 이 PC 브라우저의 클립보드를 둔다(브라우저가 /link를 열 때와 같은 차례)
  render([FIRST])
  autoClipboard = fakeClipboard()
  Object.defineProperty(navigator, 'clipboard', { value: autoClipboard.clipboard, configurable: true })
  const missing: LinkJs = { startLink: () => ({ stop: () => {} }), link: null }
  mod = ((await import(/* @vite-ignore */ LINK_JS).catch(() => missing)) ?? missing) as LinkJs
  auto = mod.link
})

afterEach(() => {
  running?.stop()
  running = null
  vi.useRealTimers()
  document.getSelection()?.removeAllRanges()
  document.body.replaceChildren()
})

describe('REQ-1411 주소 보내기 화면 [주소 복사] (reception/www/link.js)', () => {
  it('AC-1411.4: 화면 파일이 불리면 저절로 단추를 잇는다(브라우저 navigator.clipboard로 그 주소를 복사)', async () => {
    expect(auto, '불릴 때 .link-page가 있으면 저절로 켠다').not.toBeNull()
    button(0).click()
    await settle()
    expect(autoClipboard.writeText).toHaveBeenCalledTimes(1)
    expect(autoClipboard.writeText).toHaveBeenCalledWith(FIRST)
    expect(button(0).textContent).toBe(COPIED)
    auto?.stop()
    auto = null
  })

  it('AC-1411.4: [주소 복사]를 누르면 그 카드 단추의 data-url을 navigator.clipboard.writeText로 복사하고 단추 글이 "복사했어요"로 2초 뒤 "주소 복사"로 돌아온다', async () => {
    vi.useFakeTimers()
    render()
    const fake = fakeClipboard()
    running = mod.startLink({ nav: fake })

    button(1).click()
    await settle()
    expect(fake.writeText).toHaveBeenCalledTimes(1)
    expect(fake.writeText).toHaveBeenCalledWith(SECOND)
    expect(button(1).textContent).toBe(COPIED)
    expect(button(0).textContent).toBe(LABEL)
    expect(help(1).hidden).toBe(true)

    vi.advanceTimersByTime(1999)
    expect(button(1).textContent).toBe(COPIED)
    vi.advanceTimersByTime(1)
    expect(button(1).textContent).toBe(LABEL)

    button(0).click()
    await settle()
    expect(fake.writeText).toHaveBeenLastCalledWith(FIRST)
    expect(button(0).textContent).toBe(COPIED)
  })

  it('AC-1411.4: 2초 안에 또 누르면 다시 복사하고 2초를 새로 센다', async () => {
    vi.useFakeTimers()
    render()
    const fake = fakeClipboard()
    running = mod.startLink({ nav: fake })

    button(0).click()
    await settle()
    vi.advanceTimersByTime(1500)
    button(0).click()
    await settle()
    expect(fake.writeText).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(1500)
    expect(button(0).textContent).toBe(COPIED)
    vi.advanceTimersByTime(500)
    expect(button(0).textContent).toBe(LABEL)
  })

  it('AC-1411.4: 클립보드가 거절하면 그 카드의 주소 글을 골라 두고 안내 글 "주소를 골라 두었어요. Ctrl+C를 눌러 복사해 주세요"를 보이며 단추 글은 그대로다', async () => {
    render()
    const fake = fakeClipboard(() => Promise.reject(new DOMException('거절', 'NotAllowedError')))
    running = mod.startLink({ nav: fake })

    button(1).click()
    await settle()
    expect(fake.writeText).toHaveBeenCalledWith(SECOND)
    expect(selected()).toBe(SECOND)
    expect(help(1).hidden).toBe(false)
    expect(help(1).textContent).toBe(PICKED)
    expect(help(0).hidden).toBe(true)
    expect(button(1).textContent).toBe(LABEL)
  })

  it('AC-1411.4: 클립보드가 없으면(navigator.clipboard 없음·writeText 없음) 주소 글을 골라 두고 안내 글을 보인다', async () => {
    for (const nav of [{}, { clipboard: {} as Clipboard }]) {
      render()
      running = mod.startLink({ nav })
      button(0).click()
      await settle()
      expect(selected()).toBe(FIRST)
      expect(help(0).hidden).toBe(false)
      expect(help(0).textContent).toBe(PICKED)
      expect(button(0).textContent).toBe(LABEL)
      running.stop()
      running = null
      document.getSelection()?.removeAllRanges()
    }
  })

  it('AC-1411.4: writeText가 바로 던져도 주소 글을 골라 두고 안내 글을 보인다(화면이 멈추지 않는다)', async () => {
    render()
    const fake = fakeClipboard(() => {
      throw new TypeError('없음')
    })
    running = mod.startLink({ nav: fake })
    button(0).click()
    await settle()
    expect(selected()).toBe(FIRST)
    expect(help(0).textContent).toBe(PICKED)
  })

  it('AC-1411.4: 골라 둔 뒤 복사가 되면 안내 글을 숨기고 "복사했어요"를 보인다', async () => {
    vi.useFakeTimers()
    render()
    let allow = false
    const fake = fakeClipboard(() => (allow ? Promise.resolve() : Promise.reject(new Error('거절'))))
    running = mod.startLink({ nav: fake })

    button(0).click()
    await settle()
    expect(help(0).hidden).toBe(false)
    allow = true
    button(0).click()
    await settle()
    expect(help(0).hidden).toBe(true)
    expect(button(0).textContent).toBe(COPIED)
  })

  it('AC-1411.4: stop() 뒤에는 눌러도 복사하지 않는다', async () => {
    render()
    const fake = fakeClipboard()
    const started = mod.startLink({ nav: fake })
    started.stop()
    button(0).click()
    await settle()
    expect(fake.writeText).not.toHaveBeenCalled()
    expect(button(0).textContent).toBe(LABEL)
  })
})
