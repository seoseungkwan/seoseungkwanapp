// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Poster } from '@/components/forms/Poster'
import type { ClosureNotice } from '@/types/forms'
import { downloadPosterPng, svgForImage } from './png'

// 서식 탭 휴진 안내 그림 파일(spec forms REQ-3506 AC-3506.2·3506.3, design.md 7절 '그림 파일').
// svgForImage는 순수 함수라 글만 본다. downloadPosterPng는 fetch·Image·canvas·URL·<a>를 흉내 내 성공(true)·실패(false)만 본다.
// 실제 그림(글꼴이 들어갔는지)은 화면 확인 TASK-15에서 연다

const ROOT = process.cwd()
const BOLD = new Uint8Array(readFileSync(join(ROOT, 'public/poster/fonts/Pretendard-Bold.subset.woff2')))
const BLACK = new Uint8Array(readFileSync(join(ROOT, 'public/poster/fonts/Pretendard-Black.subset.woff2')))
const THEME = readFileSync(join(ROOT, 'public/poster/themes/children.svg'), 'utf8')
const LOGO_PNG = new Uint8Array(readFileSync(join(ROOT, 'public/poster/logo.png'))) // specs/forms-logo
const NOTICE: ClosureNotice = { year: 2027, month: 5, cards: [{ start: '2027-05-05', end: null, name: '어린이날', status: '휴진' }], theme: null }
const FILE = '휴진안내_2027-05.png'

afterEach(cleanup)

function posterElement(): SVGSVGElement {
  const { container } = render(createElement(Poster, { notice: NOTICE, theme: 'children' }))
  const svg = container.querySelector('svg')
  if (!svg) throw new Error('svg가 없다')
  return svg
}
// 화면이 하는 그대로: 그린 <svg>를 XMLSerializer로 글로
const posterText = () => new XMLSerializer().serializeToString(posterElement())

const dataUrls = (svg: string, prefix: string) => [...svg.matchAll(new RegExp(`${prefix.replace(/[+/.]/g, '\\$&')}([A-Za-z0-9+/=]+)`, 'g'))].map((m) => m[1])
const decode = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
// 큰 바이트 배열은 toEqual(칸마다 견줌)이 느려 Buffer로 한 번에 견준다. 길이·바이트가 모두 같아야 참
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && Buffer.from(a).equals(Buffer.from(b))
const rootTag = (svg: string) => svg.match(/^<svg\b[^>]*>/)?.[0] ?? ''

describe('AC-3506.3: svgForImage — 테마 그림·글꼴 두 개를 data: 주소로 넣는다', () => {
  it('AC-3506.3·AC-3603.1: 안내문 SVG에는 처음에 /poster/ 주소 넷(테마 그림·Bold·Black·로고)이 있다(바꾸기 전 확인)', () => {
    const svg = posterText()
    expect(svg).toContain('/poster/themes/children.svg')
    expect(svg).toContain('url(/poster/fonts/Pretendard-Bold.subset.woff2)')
    expect(svg).toContain('url(/poster/fonts/Pretendard-Black.subset.woff2)')
    expect(svg).toContain('href="/poster/logo.png"')
  })

  it('AC-3603.1: 로고 주소는 data:image/png;base64가 되고, 풀면 로고 바이트 그대로다(따옴표 둘 다·xlink:href도)', () => {
    const out = svgForImage(posterText(), { theme: THEME, bold: BOLD, black: BLACK, logo: LOGO_PNG })
    const logos = dataUrls(out, 'data:image/png;base64,')
    expect(logos).toHaveLength(1)
    expect(same(decode(logos[0]), LOGO_PNG)).toBe(true)
    expect(out).toMatch(/<image\b[^>]*\shref="data:image\/png;base64,/)
    const small = { theme: '', bold: new Uint8Array([1]), black: new Uint8Array([2]), logo: new Uint8Array([7, 8, 9]) }
    const single = svgForImage("<svg><image href='/poster/logo.png'/><image xlink:href=\"/poster/logo.png\"/></svg>", small)
    expect(single).not.toContain('/poster/')
    expect(dataUrls(single, 'data:image/png;base64,').map((b64) => [...decode(b64)])).toEqual([[7, 8, 9], [7, 8, 9]])
  })

  it('AC-3506.3: 테마 그림 주소는 data:image/svg+xml;base64가 되고, 풀면 테마 SVG 글 그대로다(한글 주석도 UTF-8로)', () => {
    const out = svgForImage(posterText(), { theme: THEME, bold: BOLD, black: BLACK, logo: LOGO_PNG })
    const themes = dataUrls(out, 'data:image/svg+xml;base64,')
    expect(themes).toHaveLength(1)
    expect(new TextDecoder().decode(decode(themes[0]))).toBe(THEME)
    expect(THEME).toMatch(/[ㄱ-힣]/) // 시험이 한글이 든 그림을 쓴다
    expect(out).toMatch(/<image\b[^>]*\shref="data:image\/svg\+xml;base64,/)
  })

  it('AC-3506.3: 글꼴 두 주소는 data:font/woff2;base64가 되고, 풀면 Bold·Black 바이트 그대로다(700→Bold, 900→Black)', () => {
    const out = svgForImage(posterText(), { theme: THEME, bold: BOLD, black: BLACK, logo: LOGO_PNG })
    const faces = [...out.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1])
    expect(faces).toHaveLength(2)
    const fontOf = (weight: string) => {
      const face = faces.find((f) => new RegExp(`font-weight:\\s*${weight}\\b`).test(f)) ?? ''
      const b64 = face.match(/url\(["']?data:font\/woff2;base64,([A-Za-z0-9+/=]+)["']?\)/)?.[1]
      expect(b64, weight).toBeDefined()
      return decode(b64 ?? '')
    }
    expect(same(fontOf('700'), BOLD)).toBe(true)
    expect(same(fontOf('900'), BLACK)).toBe(true)
  })

  it('AC-3506.3: 바깥·상대 주소가 남지 않는다(/poster/·http(s)·href·url() 모두 data: 또는 # 뿐, xmlns 이름표만 예외)', () => {
    const out = svgForImage(posterText(), { theme: THEME, bold: BOLD, black: BLACK, logo: LOGO_PNG })
    expect(out).not.toContain('/poster/')
    expect(out.replace(/\sxmlns(?::\w+)?="[^"]*"/g, '')).not.toMatch(/https?:/i)
    const hrefs = [...out.matchAll(/\s(?:xlink:)?href=(["'])(.*?)\1/g)].map((m) => m[2])
    expect(hrefs.length).toBeGreaterThan(0)
    for (const href of hrefs) expect(href.startsWith('data:') || href.startsWith('#'), href.slice(0, 40)).toBe(true)
    const urls = [...out.matchAll(/url\(\s*["']?([^"')]*)/g)].map((m) => m[1])
    expect(urls.length).toBeGreaterThanOrEqual(3) // 글꼴 둘 + 그림자 필터
    for (const url of urls) expect(url.startsWith('data:') || url.startsWith('#'), url.slice(0, 40)).toBe(true)
  })

  it('AC-3506.3: 뿌리 svg는 width 1588·height 2246(시안 2배)이고 viewBox 0 0 794 1123·xmlns는 그대로다', () => {
    const tag = rootTag(svgForImage(posterText(), { theme: THEME, bold: BOLD, black: BLACK, logo: LOGO_PNG }))
    expect(tag).toMatch(/\swidth="1588"/)
    expect(tag).toMatch(/\sheight="2246"/)
    expect(tag).toMatch(/\sviewBox="0 0 794 1123"/)
    expect(tag.match(/\sxmlns="http:\/\/www\.w3\.org\/2000\/svg"/g)).toHaveLength(1) // 꼭 하나(겹치면 XML이 깨진다)
    expect(tag.match(/\swidth=/g)).toHaveLength(1)
    expect(tag.match(/\sheight=/g)).toHaveLength(1)
  })

  it('AC-3506.3: 뿌리에 이미 있는 width·height는 바꾸고, xmlns가 없으면 넣고, 겹친 xmlns는 하나로 둔다(안쪽 요소는 건드리지 않는다)', () => {
    const assets = { theme: '<svg/>', bold: new Uint8Array([1]), black: new Uint8Array([2]), logo: new Uint8Array([3]) }
    const a = svgForImage('<svg viewBox="0 0 794 1123" width="794" height=\'1123\'><rect width="10" height="20" stroke-width="2"/></svg>', assets)
    expect(rootTag(a)).toMatch(/^<svg\b/)
    expect(rootTag(a)).toMatch(/\sxmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
    expect(rootTag(a).match(/\swidth=/g)).toHaveLength(1)
    expect(rootTag(a)).toMatch(/\swidth="1588"/)
    expect(rootTag(a)).toMatch(/\sheight="2246"/)
    expect(a).toContain('<rect width="10" height="20" stroke-width="2"/>')
    const b = svgForImage('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 794 1123" xmlns="http://www.w3.org/2000/svg" aria-label="a > b"></svg>', assets)
    expect(rootTag(b).match(/xmlns=/g)).toHaveLength(1)
    expect(b).toContain('aria-label="a > b"')
    expect(b).toMatch(/\sviewBox="0 0 794 1123"/)
  })

  it('AC-3506.3: 바이트 0~255를 모두 그대로 되돌리고, 큰 글꼴(수십만 바이트)도 한 번에 넣는다', () => {
    const every = Uint8Array.from({ length: 256 }, (_, i) => i)
    const svg = "<svg><style>@font-face { font-weight: 700; src: url(/poster/fonts/Pretendard-Bold.subset.woff2) format('woff2') } @font-face { font-weight: 900; src: url(/poster/fonts/Pretendard-Black.subset.woff2) format('woff2') }</style></svg>"
    const out = svgForImage(svg, { theme: '', bold: every, black: BLACK, logo: LOGO_PNG })
    const fonts = dataUrls(out, 'data:font/woff2;base64,')
    expect(fonts).toHaveLength(2)
    expect(decode(fonts[0])).toEqual(every)
    expect(same(decode(fonts[1]), BLACK)).toBe(true)
    expect(BLACK.length).toBeGreaterThan(200_000)
  })
})

// ---------- downloadPosterPng: 브라우저 흉내 ----------

type Mode = { fetchFails?: 'throw' | 'theme' | 'bold' | 'black' | 'logo'; imageError?: boolean; noContext?: boolean; nullBlob?: boolean }
// 글꼴 바이트를 새 ArrayBuffer에 옮겨 담는다(Response.arrayBuffer()처럼)
const fontBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  return copy
}

type FakeResponse = { ok: boolean; status: number; text?: () => Promise<string>; arrayBuffer?: () => Promise<ArrayBuffer> }

function setup(mode: Mode = {}) {
  const fetchCalls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown): Promise<FakeResponse> => {
      const url = String(input)
      fetchCalls.push(url)
      if (mode.fetchFails === 'throw') throw new TypeError('Failed to fetch')
      const fail =
        (mode.fetchFails === 'theme' && url.endsWith('.svg')) ||
        (mode.fetchFails === 'bold' && url.includes('Bold')) ||
        (mode.fetchFails === 'black' && url.includes('Black')) ||
        (mode.fetchFails === 'logo' && url.endsWith('logo.png'))
      if (fail) return { ok: false, status: 404, text: async () => '', arrayBuffer: async () => new ArrayBuffer(0) }
      if (url === '/poster/themes/children.svg') return { ok: true, status: 200, text: async () => THEME }
      if (url === '/poster/fonts/Pretendard-Bold.subset.woff2') return { ok: true, status: 200, arrayBuffer: async () => fontBuffer(BOLD) }
      if (url === '/poster/fonts/Pretendard-Black.subset.woff2') return { ok: true, status: 200, arrayBuffer: async () => fontBuffer(BLACK) }
      if (url === '/poster/logo.png') return { ok: true, status: 200, arrayBuffer: async () => fontBuffer(LOGO_PNG) }
      return { ok: false, status: 404 }
    }),
  )

  const blobs: Blob[] = []
  let n = 0
  const create = vi.fn((blob: Blob) => {
    blobs.push(blob)
    n += 1
    return `blob:poster-${n}`
  })
  const revoke = vi.fn()
  Object.defineProperty(URL, 'createObjectURL', { value: create, configurable: true, writable: true })
  Object.defineProperty(URL, 'revokeObjectURL', { value: revoke, configurable: true, writable: true })

  const images: { src: string }[] = []
  class FakeImage {
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    private current = ''
    get src() {
      return this.current
    }
    set src(value: string) {
      this.current = value
      images.push(this)
      queueMicrotask(() => (mode.imageError ? this.onerror?.() : this.onload?.()))
    }
  }
  vi.stubGlobal('Image', FakeImage)

  const drawImage = vi.fn()
  const canvases: HTMLCanvasElement[] = []
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    canvases.push(this)
    return mode.noContext ? null : ({ drawImage } as unknown as CanvasRenderingContext2D)
  } as HTMLCanvasElement['getContext'])
  const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (callback: BlobCallback, type?: string) {
    queueMicrotask(() => callback(mode.nullBlob ? null : new Blob(['png'], { type: type ?? 'image/png' })))
  })

  const clicks: { download: string; href: string; connected: boolean }[] = []
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicks.push({ download: this.download, href: this.getAttribute('href') ?? '', connected: this.isConnected })
  })

  const quiet = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m))
  return { fetchCalls, blobs, create, revoke, images, drawImage, canvases, toBlob, clicks, quiet }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  Reflect.deleteProperty(URL, 'createObjectURL')
  Reflect.deleteProperty(URL, 'revokeObjectURL')
})

describe('AC-3506.2: downloadPosterPng — 1588×2246 PNG를 안내 달 파일 이름으로 내려받는다', () => {
  it('AC-3506.2·AC-3603.2: 성공하면 true — 자산 넷(테마·글꼴 둘·로고)을 읽고, 그림용 SVG → 그림 → canvas 1588×2246 → PNG → <a download>', async () => {
    const env = setup()
    const svg = posterElement()
    await expect(downloadPosterPng(svg, FILE)).resolves.toBe(true)

    expect([...env.fetchCalls].sort()).toEqual([
      '/poster/fonts/Pretendard-Black.subset.woff2',
      '/poster/fonts/Pretendard-Bold.subset.woff2',
      '/poster/logo.png',
      '/poster/themes/children.svg',
    ])

    // 첫 Blob은 그림용 SVG 글(image/svg+xml): data: 주소가 들어가고 /poster/는 남지 않았다
    expect(env.blobs[0].type).toBe('image/svg+xml')
    const text = await env.blobs[0].text()
    expect(text).not.toContain('/poster/')
    expect(dataUrls(text, 'data:image/svg+xml;base64,')).toHaveLength(1)
    expect(dataUrls(text, 'data:font/woff2;base64,')).toHaveLength(2)
    expect(dataUrls(text, 'data:image/png;base64,')).toHaveLength(1)
    expect(rootTag(text)).toMatch(/\swidth="1588"/)
    expect(env.images.map((i) => i.src)).toEqual(['blob:poster-1'])

    expect(env.canvases).toHaveLength(1)
    expect([env.canvases[0].width, env.canvases[0].height]).toEqual([1588, 2246])
    expect(env.drawImage).toHaveBeenCalledTimes(1)
    expect(env.drawImage.mock.calls[0].slice(1)).toEqual([0, 0, 1588, 2246])
    expect(env.drawImage.mock.calls[0][0]).toBe(env.images[0])
    expect(env.toBlob.mock.calls[0][1]).toBe('image/png')

    // 둘째 Blob은 PNG, 그 주소를 파일 이름과 함께 누른다
    expect(env.blobs[1].type).toBe('image/png')
    expect(env.clicks).toEqual([{ download: FILE, href: 'blob:poster-2', connected: true }])
    expect(document.querySelectorAll('a[download]')).toHaveLength(0) // 누른 뒤 치운다

    // 그림 주소는 바로, PNG 주소는 내려받기가 시작된 뒤 거둔다
    expect(env.revoke).toHaveBeenCalledWith('blob:poster-1')
    vi.runAllTimers()
    expect(env.revoke).toHaveBeenCalledWith('blob:poster-2')
    expect(env.revoke).toHaveBeenCalledTimes(2)
    for (const spy of env.quiet) expect(spy).not.toHaveBeenCalled()
  })

  it.each([
    ['fetch가 던짐(연결 끊김)', { fetchFails: 'throw' }],
    ['테마 그림 읽기 실패(!ok)', { fetchFails: 'theme' }],
    ['Bold 글꼴 읽기 실패(!ok)', { fetchFails: 'bold' }],
    ['Black 글꼴 읽기 실패(!ok)', { fetchFails: 'black' }],
    ['로고 읽기 실패(!ok)', { fetchFails: 'logo' }],
  ] as const)('AC-3506.2·AC-3603.2: 자산을 못 읽으면 false — %s, 그림·내려받기를 하지 않는다', async (_, mode) => {
    const env = setup(mode)
    await expect(downloadPosterPng(posterElement(), FILE)).resolves.toBe(false)
    expect(env.images).toHaveLength(0)
    expect(env.clicks).toHaveLength(0)
    expect(env.create).not.toHaveBeenCalled()
    for (const spy of env.quiet) expect(spy).not.toHaveBeenCalled()
  })

  it('AC-3506.2: 그림을 못 그리면(Image error) false, 만든 SVG 주소는 거둔다', async () => {
    const env = setup({ imageError: true })
    await expect(downloadPosterPng(posterElement(), FILE)).resolves.toBe(false)
    expect(env.clicks).toHaveLength(0)
    expect(env.create).toHaveBeenCalledTimes(1)
    expect(env.revoke).toHaveBeenCalledWith('blob:poster-1')
    for (const spy of env.quiet) expect(spy).not.toHaveBeenCalled()
  })

  it('AC-3506.2: toBlob이 null이면 false, 내려받기를 하지 않고 SVG 주소는 거둔다', async () => {
    const env = setup({ nullBlob: true })
    await expect(downloadPosterPng(posterElement(), FILE)).resolves.toBe(false)
    expect(env.clicks).toHaveLength(0)
    expect(env.create).toHaveBeenCalledTimes(1)
    expect(env.revoke).toHaveBeenCalledWith('blob:poster-1')
    for (const spy of env.quiet) expect(spy).not.toHaveBeenCalled()
  })

  it('AC-3506.2: canvas 2d를 못 얻으면 false', async () => {
    const env = setup({ noContext: true })
    await expect(downloadPosterPng(posterElement(), FILE)).resolves.toBe(false)
    expect(env.clicks).toHaveLength(0)
    expect(env.revoke).toHaveBeenCalledWith('blob:poster-1')
  })

  it('AC-3506.2: 테마 그림이 없는 svg면 자산을 읽지 않고 false(던지지 않는다)', async () => {
    const env = setup()
    const svg = posterElement()
    svg.querySelector('image')?.remove()
    await expect(downloadPosterPng(svg, FILE)).resolves.toBe(false)
    expect(env.fetchCalls).toEqual([])
    expect(env.clicks).toHaveLength(0)
  })

  it('AC-3506.2: 브라우저 기능이 아예 없어 던져도(createObjectURL 없음) false로 끝난다', async () => {
    const env = setup()
    Object.defineProperty(URL, 'createObjectURL', {
      value: () => {
        throw new Error('없음')
      },
      configurable: true,
      writable: true,
    })
    await expect(downloadPosterPng(posterElement(), FILE)).resolves.toBe(false)
    expect(env.clicks).toHaveLength(0)
    for (const spy of env.quiet) expect(spy).not.toHaveBeenCalled()
  })
})
