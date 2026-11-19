// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GuidePoster } from '@/components/forms/GuidePoster'
import { Poster } from '@/components/forms/Poster'
import type { GuideContent } from '@/types/formGuide'
import type { ClosureNotice } from '@/types/forms'
import { guideFileName } from './guide'
import type { PosterLogo } from './layout'
import { LOGO_MAX_SIDE } from '@/types/clinicProfile'
import type { LogoBitmap } from './logoFit'
import {
  LOGO_READ_MAX,
  LOGO_SAMPLE_MAX,
  bitmapToPngUrl,
  downloadGuidePng,
  downloadPosterPng,
  readLogoBitmap,
  readLogoPixels,
  svgForImage,
} from './png'

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

// ---------- 환자 안내문 그림 파일 (specs/forms-guide REQ-4509 AC-4509.2·4509.3, design.md 6절 '그림 파일') ----------
// 환자 안내문에는 테마 그림이 없다: svgForImage는 theme 없이 부르고, downloadGuidePng는 글꼴 둘·로고만 읽는다

// 예시 1(보험 서류 안내)과, 그 그림을 AI 그림(clip-path url(#…))으로 바꾼 것
const GUIDE: GuideContent = {
  tag: '보험 서류 안내', subtitle: '보험사에 낼 서류는', big1: '수납할 때', big2: '말씀해 주세요', firstSmall: false,
  boxTop: '이렇게 말씀해 주세요', boxBottom: '"보험 서류 필요해요"', picture: 'document', drawing: null, bandTitle: '이런 서류가 필요하실 때', mark: 'check',
  lines: [{ text: '진단서', em: '' }, { text: '진료비 영수증', em: '영수증' }], note: '필요한 서류는 보험사마다 다르니 미리 확인해 주세요',
}
const GUIDE_DRAWN: GuideContent = {
  ...GUIDE,
  picture: 'custom',
  drawing: { subject: '휠체어', shapes: [{ kind: 'circle', nums: [78, 108, 34], d: '', fill: 'yellow', stroke: 'dark', width: 9 }] },
}
const GUIDE_FILE = guideFileName(GUIDE)

function guideElement(content: GuideContent = GUIDE): SVGSVGElement {
  const { container } = render(createElement(GuidePoster, { content }))
  const svg = container.querySelector('svg')
  if (!svg) throw new Error('svg가 없다')
  return svg
}
const guideText = (content: GuideContent = GUIDE) => new XMLSerializer().serializeToString(guideElement(content))
const GUIDE_ASSETS = { bold: BOLD, black: BLACK, logo: LOGO_PNG }

describe('AC-4509.3: svgForImage — 테마 그림 없이(theme 생략) 부르면 글꼴·로고만 바꾼다', () => {
  it('AC-4509.3: 환자 안내문 SVG에는 처음에 /poster/ 주소 셋(Bold·Black·로고)만 있고 테마 그림 주소는 없다(바꾸기 전 확인)', () => {
    const svg = guideText()
    expect(svg).toContain('url(/poster/fonts/Pretendard-Bold.subset.woff2)')
    expect(svg).toContain('url(/poster/fonts/Pretendard-Black.subset.woff2)')
    expect(svg).toContain('href="/poster/logo.png"')
    expect(svg).not.toContain('/poster/themes/')
    expect(svg.match(/\/poster\//g)).toHaveLength(3)
  })

  it('AC-4509.3: theme 없이 부르면 글꼴 둘·로고가 data:가 되고(풀면 바이트 그대로) /poster/가 남지 않으며 테마 data:(svg+xml)는 생기지 않는다', () => {
    const out = svgForImage(guideText(), GUIDE_ASSETS)
    expect(out).not.toContain('/poster/')
    expect(dataUrls(out, 'data:image/svg+xml;base64,')).toHaveLength(0)
    const logos = dataUrls(out, 'data:image/png;base64,')
    expect(logos).toHaveLength(1)
    expect(same(decode(logos[0]), LOGO_PNG)).toBe(true)
    const fonts = dataUrls(out, 'data:font/woff2;base64,')
    expect(fonts).toHaveLength(2)
    expect(same(decode(fonts[0]), BOLD)).toBe(true)
    expect(same(decode(fonts[1]), BLACK)).toBe(true)
  })

  it('AC-4509.3: 바깥·상대 주소가 남지 않는다(href·url()은 data: 또는 #뿐 — AI 그림의 clip-path 포함, xmlns 이름표만 예외)', () => {
    const out = svgForImage(guideText(GUIDE_DRAWN), GUIDE_ASSETS)
    expect(out).not.toContain('/poster/')
    expect(out.replace(/\sxmlns(?::\w+)?="[^"]*"/g, '')).not.toMatch(/https?:/i)
    const hrefs = [...out.matchAll(/\s(?:xlink:)?href=(["'])(.*?)\1/g)].map((m) => m[2])
    expect(hrefs).toHaveLength(1)
    for (const href of hrefs) expect(href.startsWith('data:'), href.slice(0, 40)).toBe(true)
    const urls = [...out.matchAll(/url\(\s*["']?([^"')]*)/g)].map((m) => m[1])
    expect(urls).toHaveLength(3) // 글꼴 둘 + AI 그림 clip-path
    for (const url of urls) expect(url.startsWith('data:') || url.startsWith('#'), url.slice(0, 40)).toBe(true)
    expect(rootTag(out)).toMatch(/\swidth="1588"/)
    expect(rootTag(out)).toMatch(/\sheight="2246"/)
    expect(rootTag(out)).toMatch(/\sviewBox="0 0 794 1123"/)
  })

  it('AC-4509.3: theme를 주지 않으면 테마 그림 주소는 건드리지 않는다(그대로 남고 data:가 되지 않는다)', () => {
    const svg = '<svg><image href="/poster/themes/m05.svg"/><image href="/poster/logo.png"/></svg>'
    const out = svgForImage(svg, { bold: new Uint8Array([1]), black: new Uint8Array([2]), logo: new Uint8Array([7, 8, 9]) })
    expect(out.match(/\/poster\/themes\/m05\.svg/g)).toHaveLength(1)
    expect(out).toContain('href="/poster/themes/m05.svg"')
    expect(dataUrls(out, 'data:image/svg+xml;base64,')).toHaveLength(0)
    expect(dataUrls(out, 'data:image/png;base64,').map((b64) => [...decode(b64)])).toEqual([[7, 8, 9]])
  })
})

describe('AC-4509.2: downloadGuidePng — 글꼴 둘·로고만 읽어 1588×2246 PNG를 환자안내문_<머리표>.png로 내려받는다', () => {
  it('AC-4509.2: 파일 이름은 환자안내문_<머리표>.png다', () => {
    expect(GUIDE_FILE).toBe('환자안내문_보험 서류 안내.png')
  })

  it('AC-4509.2: 성공하면 true — 자산 셋(글꼴 둘·로고)만 읽고, 그림용 SVG → 그림 → canvas 1588×2246 → PNG → <a download>', async () => {
    const env = setup()
    await expect(downloadGuidePng(guideElement(GUIDE_DRAWN), GUIDE_FILE)).resolves.toBe(true)

    expect([...env.fetchCalls].sort()).toEqual(['/poster/fonts/Pretendard-Black.subset.woff2', '/poster/fonts/Pretendard-Bold.subset.woff2', '/poster/logo.png'])

    expect(env.blobs[0].type).toBe('image/svg+xml')
    const text = await env.blobs[0].text()
    expect(text).not.toContain('/poster/')
    expect(dataUrls(text, 'data:image/svg+xml;base64,')).toHaveLength(0)
    expect(dataUrls(text, 'data:font/woff2;base64,')).toHaveLength(2)
    expect(dataUrls(text, 'data:image/png;base64,')).toHaveLength(1)
    expect(text).toContain('보험 서류 안내')
    expect(text).toContain('<clipPath')
    expect(rootTag(text)).toMatch(/\swidth="1588"/)
    expect(env.images.map((i) => i.src)).toEqual(['blob:poster-1'])

    expect(env.canvases).toHaveLength(1)
    expect([env.canvases[0].width, env.canvases[0].height]).toEqual([1588, 2246])
    expect(env.drawImage).toHaveBeenCalledTimes(1)
    expect(env.drawImage.mock.calls[0].slice(1)).toEqual([0, 0, 1588, 2246])
    expect(env.toBlob.mock.calls[0][1]).toBe('image/png')

    expect(env.blobs[1].type).toBe('image/png')
    expect(env.clicks).toEqual([{ download: '환자안내문_보험 서류 안내.png', href: 'blob:poster-2', connected: true }])
    expect(document.querySelectorAll('a[download]')).toHaveLength(0)

    expect(env.revoke).toHaveBeenCalledWith('blob:poster-1')
    vi.runAllTimers()
    expect(env.revoke).toHaveBeenCalledWith('blob:poster-2')
    expect(env.revoke).toHaveBeenCalledTimes(2)
    for (const spy of env.quiet) expect(spy).not.toHaveBeenCalled()
  })

  it.each([
    ['fetch가 던짐(연결 끊김)', { fetchFails: 'throw' }],
    ['Bold 글꼴 읽기 실패(!ok)', { fetchFails: 'bold' }],
    ['Black 글꼴 읽기 실패(!ok)', { fetchFails: 'black' }],
    ['로고 읽기 실패(!ok)', { fetchFails: 'logo' }],
  ] as const)('AC-4509.2: 자산을 못 읽으면 false — %s, 그림·내려받기를 하지 않는다', async (_, mode) => {
    const env = setup(mode)
    await expect(downloadGuidePng(guideElement(), GUIDE_FILE)).resolves.toBe(false)
    expect(env.images).toHaveLength(0)
    expect(env.clicks).toHaveLength(0)
    expect(env.create).not.toHaveBeenCalled()
    for (const spy of env.quiet) expect(spy).not.toHaveBeenCalled()
  })

  it('AC-4509.2: 그림을 못 그리면(Image error) false, 만든 SVG 주소는 거둔다', async () => {
    const env = setup({ imageError: true })
    await expect(downloadGuidePng(guideElement(), GUIDE_FILE)).resolves.toBe(false)
    expect(env.clicks).toHaveLength(0)
    expect(env.create).toHaveBeenCalledTimes(1)
    expect(env.revoke).toHaveBeenCalledWith('blob:poster-1')
    for (const spy of env.quiet) expect(spy).not.toHaveBeenCalled()
  })

  it.each([
    ['toBlob이 null', { nullBlob: true }],
    ['canvas 2d를 못 얻음', { noContext: true }],
  ] as const)('AC-4509.2: %s이면 false, 내려받기를 하지 않고 SVG 주소는 거둔다', async (_, mode) => {
    const env = setup(mode)
    await expect(downloadGuidePng(guideElement(), GUIDE_FILE)).resolves.toBe(false)
    expect(env.clicks).toHaveLength(0)
    expect(env.revoke).toHaveBeenCalledWith('blob:poster-1')
  })

  it('AC-4509.2: 테마 그림은 읽지 않는다 — 바깥 주소(/poster/themes/…)가 남은 SVG면 그리지 않고 false', async () => {
    const env = setup()
    const svg = guideElement()
    const extra = document.createElementNS('http://www.w3.org/2000/svg', 'image')
    extra.setAttribute('href', '/poster/themes/children.svg')
    svg.prepend(extra)
    await expect(downloadGuidePng(svg, GUIDE_FILE)).resolves.toBe(false)
    expect(env.fetchCalls).not.toContain('/poster/themes/children.svg')
    expect(env.create).not.toHaveBeenCalled()
    expect(env.clicks).toHaveLength(0)
  })

  it('AC-4509.2: 브라우저 기능이 아예 없어 던져도(createObjectURL 없음) false로 끝난다', async () => {
    const env = setup()
    Object.defineProperty(URL, 'createObjectURL', {
      value: () => {
        throw new Error('없음')
      },
      configurable: true,
      writable: true,
    })
    await expect(downloadGuidePng(guideElement(), GUIDE_FILE)).resolves.toBe(false)
    expect(env.clicks).toHaveLength(0)
    for (const spy of env.quiet) expect(spy).not.toHaveBeenCalled()
  })
})

// ---------- 병원 정보 로고 (spec clinic-profile REQ-6604 AC-6604.1·AC-6604.3, design.md 6절) ----------

const LOGO_B64 = Buffer.from(LOGO_PNG).toString('base64')
const LOGO_DATA = `data:image/png;base64,${LOGO_B64}`
function posterWith(logo: PosterLogo | null): SVGSVGElement {
  const { container } = render(createElement(Poster, { notice: NOTICE, theme: 'children', logo }))
  const svg = container.querySelector('svg')
  if (!svg) throw new Error('svg가 없다')
  return svg
}
function guideWith(logo: PosterLogo | null, content: GuideContent = GUIDE): SVGSVGElement {
  const { container } = render(createElement(GuidePoster, { content, logo }))
  const svg = container.querySelector('svg')
  if (!svg) throw new Error('svg가 없다')
  return svg
}
const serialize = (svg: SVGSVGElement) => new XMLSerializer().serializeToString(svg)
const FONT_PATHS = ['/poster/fonts/Pretendard-Black.subset.woff2', '/poster/fonts/Pretendard-Bold.subset.woff2']
const IMAGE_LOGO: PosterLogo = { kind: 'image', href: LOGO_DATA }
const TEXT_LOGO: PosterLogo = { kind: 'text', text: '서승관정형외과의원' }

describe('AC-6604.3: svgForImage — 병원 정보 로고(data: 주소)는 그대로 둔다', () => {
  it('AC-6604.3: 휴진 안내 SVG의 로고가 data: 그림이면 로고 자산 없이 불러도 그 주소가 그대로 남고 /poster/가 남지 않는다', () => {
    const svg = serialize(posterWith(IMAGE_LOGO))
    expect(svg).not.toContain('/poster/logo.png')
    const out = svgForImage(svg, { theme: THEME, bold: BOLD, black: BLACK })
    expect(out).not.toContain('/poster/')
    expect(dataUrls(out, 'data:image/png;base64,')).toEqual([LOGO_B64])
  })

  it('AC-6604.3: 환자 안내문 SVG도 같다(글꼴 둘만 바꾸고 data: 로고는 그대로)', () => {
    const out = svgForImage(serialize(guideWith(IMAGE_LOGO)), { bold: BOLD, black: BLACK })
    expect(out).not.toContain('/poster/')
    expect(dataUrls(out, 'data:image/png;base64,')).toEqual([LOGO_B64])
    expect(dataUrls(out, 'data:font/woff2;base64,')).toHaveLength(2)
  })

  it('AC-6604.1·AC-6604.3: 이름 글자 로고면 그림 파일 SVG에 image 로고가 없고 이름 글자가 들어 있다', () => {
    const out = svgForImage(serialize(guideWith(TEXT_LOGO)), { bold: BOLD, black: BLACK })
    expect(out).not.toContain('/poster/')
    expect(out).not.toMatch(/<image\b/)
    expect(out).toContain('>서승관정형외과의원</text>')
  })
})

describe('AC-6604.3: 그림 파일 내려받기 — 병원 정보 로고', () => {
  it('AC-6604.3: 휴진 안내 — /poster/logo.png를 읽지 않고(테마·글꼴 둘만) PNG를 만들며, 그린 SVG 안에 그 로고 그림이 있다', async () => {
    const env = setup()
    await expect(downloadPosterPng(posterWith(IMAGE_LOGO), FILE)).resolves.toBe(true)
    expect([...env.fetchCalls].sort()).toEqual([...FONT_PATHS, '/poster/themes/children.svg'])
    const text = await env.blobs[0].text()
    expect(text).not.toContain('/poster/')
    expect(dataUrls(text, 'data:image/png;base64,')).toEqual([LOGO_B64])
    expect(env.clicks).toEqual([{ download: FILE, href: 'blob:poster-2', connected: true }])
    for (const spy of env.quiet) expect(spy).not.toHaveBeenCalled()
  })

  it('AC-6604.3: 환자 안내문 — 글꼴 둘만 읽고, 그린 SVG 안에 그 로고 그림이 있다', async () => {
    const env = setup()
    await expect(downloadGuidePng(guideWith(IMAGE_LOGO), GUIDE_FILE)).resolves.toBe(true)
    expect([...env.fetchCalls].sort()).toEqual(FONT_PATHS)
    const text = await env.blobs[0].text()
    expect(text).not.toContain('/poster/')
    expect(dataUrls(text, 'data:image/png;base64,')).toEqual([LOGO_B64])
  })

  it.each([
    ['로고 그림', IMAGE_LOGO],
    ['이름 글자', TEXT_LOGO],
  ] as const)('AC-6604.3: 옛 로고 파일(/poster/logo.png)을 못 읽는 곳이어도 병원 정보 %s 그림 파일은 만들어진다', async (_, logo) => {
    const env = setup({ fetchFails: 'logo' })
    await expect(downloadGuidePng(guideWith(logo), GUIDE_FILE)).resolves.toBe(true)
    await expect(downloadPosterPng(posterWith(logo), FILE)).resolves.toBe(true)
    expect(env.fetchCalls).not.toContain('/poster/logo.png')
  })

  it('AC-6604.1·AC-6604.3: 이름 글자 로고면 그림 파일에 image가 없고 이름 글자가 들어 있다', async () => {
    const env = setup()
    await expect(downloadGuidePng(guideWith(TEXT_LOGO), GUIDE_FILE)).resolves.toBe(true)
    expect([...env.fetchCalls].sort()).toEqual(FONT_PATHS)
    const text = await env.blobs[0].text()
    expect(text).not.toMatch(/<image\b/)
    expect(text).toContain('서승관정형외과의원')
  })
})

describe('AC-6604.4: readLogoPixels — 로고 그림을 긴 변 64px 안으로 줄여 점(RGBA)을 읽는다', () => {
  function pixelsSetup({ width = 1033, height = 175, fail = false, noContext = false } = {}) {
    const loaded: string[] = []
    class FakeImage {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      naturalWidth = width
      naturalHeight = height
      private current = ''
      get src() {
        return this.current
      }
      set src(value: string) {
        this.current = value
        loaded.push(value)
        queueMicrotask(() => (fail ? this.onerror?.() : this.onload?.()))
      }
    }
    vi.stubGlobal('Image', FakeImage)
    const drawImage = vi.fn()
    const getImageData = vi.fn((_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4).fill(200), width: w, height: h }))
    const canvases: HTMLCanvasElement[] = []
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
      canvases.push(this)
      return noContext ? null : ({ drawImage, getImageData } as unknown as CanvasRenderingContext2D)
    } as HTMLCanvasElement['getContext'])
    const quiet = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m))
    return { loaded, drawImage, getImageData, canvases, quiet }
  }

  it('AC-6604.4: 가로형 로고(1033×175)는 64×11로 줄여 그 점을 준다(비율 유지, 한 번만 읽는다)', async () => {
    const env = pixelsSetup()
    const result = await readLogoPixels(LOGO_DATA)
    expect(LOGO_SAMPLE_MAX).toBe(64)
    expect(env.loaded).toEqual([LOGO_DATA])
    expect(env.canvases).toHaveLength(1)
    expect([env.canvases[0].width, env.canvases[0].height]).toEqual([64, 11])
    expect(env.drawImage.mock.calls[0].slice(1)).toEqual([0, 0, 64, 11])
    expect(env.getImageData).toHaveBeenCalledWith(0, 0, 64, 11)
    expect([result?.width, result?.height]).toEqual([64, 11])
    expect(result?.data).toHaveLength(64 * 11 * 4)
    for (const spy of env.quiet) expect(spy).not.toHaveBeenCalled()
  })

  it('AC-6604.4: 64px보다 작은 그림은 키우지 않는다(40×20 그대로)', async () => {
    const env = pixelsSetup({ width: 40, height: 20 })
    const result = await readLogoPixels(LOGO_DATA)
    expect([env.canvases[0].width, env.canvases[0].height]).toEqual([40, 20])
    expect([result?.width, result?.height]).toEqual([40, 20])
  })

  it.each([
    ['옛 로고 주소', '/poster/logo.png'],
    ['바깥 주소', 'https://example.com/logo.png'],
    ['SVG data: 주소', 'data:image/svg+xml;base64,PHN2Zz4='],
    ['빈 글', ''],
  ])('AC-6604.4: PNG data: 주소가 아니면(%s) 읽지 않고 null', async (_, href) => {
    const env = pixelsSetup()
    await expect(readLogoPixels(href)).resolves.toBeNull()
    expect(env.loaded).toEqual([])
  })

  it.each([
    ['그림을 못 읽음(Image error)', { fail: true }],
    ['그림 크기가 0', { width: 0, height: 0 }],
    ['canvas 2d를 못 얻음', { noContext: true }],
  ] as const)('AC-6604.4: %s이면 null이고 던지지·로그를 남기지 않는다', async (_, options) => {
    const env = pixelsSetup(options)
    await expect(readLogoPixels(LOGO_DATA)).resolves.toBeNull()
    for (const spy of env.quiet) expect(spy).not.toHaveBeenCalled()
  })
})

// ---------- 로고 준비용 큰 그림 읽기·PNG 만들기 (spec logo-fit REQ-6701·REQ-6702, design.md 3절) ----------

describe('AC-6701.4·AC-6702.2: readLogoBitmap — 로고 그림을 원래 크기(긴 변 1200 안)로 점(RGBA)을 읽는다', () => {
  function bitmapSetup({ width = 1080, height = 501, fail = false, noContext = false, readThrows = false } = {}) {
    const loaded: string[] = []
    class FakeImage {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      naturalWidth = width
      naturalHeight = height
      private current = ''
      get src() {
        return this.current
      }
      set src(value: string) {
        this.current = value
        loaded.push(value)
        queueMicrotask(() => (fail ? this.onerror?.() : this.onload?.()))
      }
    }
    vi.stubGlobal('Image', FakeImage)
    const drawImage = vi.fn()
    const getImageData = vi.fn((_x: number, _y: number, w: number, h: number) => {
      if (readThrows) throw new DOMException('tainted', 'SecurityError')
      return { data: new Uint8ClampedArray(w * h * 4).fill(240), width: w, height: h }
    })
    const canvases: HTMLCanvasElement[] = []
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
      canvases.push(this)
      return noContext ? null : ({ drawImage, getImageData } as unknown as CanvasRenderingContext2D)
    } as HTMLCanvasElement['getContext'])
    const quiet = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m))
    return { loaded, drawImage, getImageData, canvases, quiet }
  }

  it('AC-6701.4: 긴 변 1200 안의 로고(세로형 1080×501)는 줄이지 않고 원래 크기 그대로 한 번 읽는다', async () => {
    const env = bitmapSetup()
    const result = await readLogoBitmap(LOGO_DATA)
    expect(LOGO_READ_MAX).toBe(1200)
    expect(LOGO_READ_MAX).toBe(LOGO_MAX_SIDE) // 병원 정보 로고 한도와 같은 값
    expect(env.loaded).toEqual([LOGO_DATA])
    expect(env.canvases).toHaveLength(1)
    expect([env.canvases[0].width, env.canvases[0].height]).toEqual([1080, 501])
    expect(env.drawImage.mock.calls[0].slice(1)).toEqual([0, 0, 1080, 501])
    expect(env.getImageData).toHaveBeenCalledWith(0, 0, 1080, 501)
    expect([result?.width, result?.height]).toEqual([1080, 501])
    expect(result?.data).toHaveLength(1080 * 501 * 4)
    for (const spy of env.quiet) expect(spy).not.toHaveBeenCalled()
  })

  it('AC-6701.4: 긴 변이 1200을 넘으면 비율을 지켜 1200 안으로 줄인다(2400×600 → 1200×300)', async () => {
    const env = bitmapSetup({ width: 2400, height: 600 })
    const result = await readLogoBitmap(LOGO_DATA)
    expect([env.canvases[0].width, env.canvases[0].height]).toEqual([1200, 300])
    expect([result?.width, result?.height]).toEqual([1200, 300])
  })

  it.each([
    ['옛 로고 주소', '/poster/logo.png'],
    ['바깥 주소', 'https://example.com/logo.png'],
    ['SVG data: 주소', 'data:image/svg+xml;base64,PHN2Zz4='],
    ['빈 글', ''],
  ])('AC-6702.2: PNG data: 주소가 아니면(%s) 읽지 않고 null', async (_, href) => {
    const env = bitmapSetup()
    await expect(readLogoBitmap(href)).resolves.toBeNull()
    expect(env.loaded).toEqual([])
  })

  it.each([
    ['그림을 못 읽음(Image error)', { fail: true }],
    ['그림 크기가 0', { width: 0, height: 0 }],
    ['canvas 2d를 못 얻음', { noContext: true }],
    ['점 읽기가 던짐', { readThrows: true }],
  ] as const)('AC-6702.2: %s이면 null이고 던지지·로그를 남기지 않는다', async (_, options) => {
    const env = bitmapSetup(options)
    await expect(readLogoBitmap(LOGO_DATA)).resolves.toBeNull()
    for (const spy of env.quiet) expect(spy).not.toHaveBeenCalled()
  })
})

describe('AC-6701.4·AC-6702.2: bitmapToPngUrl — 준비한 로고 점을 PNG data: 주소로 만든다', () => {
  const PREPARED_URL = 'data:image/png;base64,UHJlcGFyZWQ='
  // 3×2 점: 칸마다 다른 값(불투명도 칸 포함)이라 그대로 옮겨졌는지 보인다
  const bitmap = (): LogoBitmap => ({ data: Uint8ClampedArray.from({ length: 3 * 2 * 4 }, (_, i) => (i * 11) % 256), width: 3, height: 2 })

  function urlSetup({ noContext = false, dataUrl = PREPARED_URL, urlThrows = false } = {}) {
    const canvases: HTMLCanvasElement[] = []
    const createImageData = vi.fn((w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }))
    const putImageData = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
      canvases.push(this)
      return noContext ? null : ({ createImageData, putImageData } as unknown as CanvasRenderingContext2D)
    } as HTMLCanvasElement['getContext'])
    const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(function () {
      if (urlThrows) throw new DOMException('tainted', 'SecurityError')
      return dataUrl
    })
    const quiet = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m))
    return { canvases, createImageData, putImageData, toDataURL, quiet }
  }

  it('AC-6701.4: 같은 크기 canvas(3×2)에 점을 그대로 넣어(0,0) PNG로 만든 data: 주소를 준다. 넣은 배열은 바뀌지 않는다', () => {
    const env = urlSetup()
    const px = bitmap()
    const before = Array.from(px.data)
    expect(bitmapToPngUrl(px)).toBe(PREPARED_URL)
    expect(env.canvases).toHaveLength(1)
    expect([env.canvases[0].width, env.canvases[0].height]).toEqual([3, 2])
    expect(env.createImageData).toHaveBeenCalledWith(3, 2)
    expect(env.putImageData).toHaveBeenCalledTimes(1)
    const [image, x, y] = env.putImageData.mock.calls[0]
    expect([x, y]).toEqual([0, 0])
    expect(Array.from((image as ImageData).data)).toEqual(before)
    expect(env.toDataURL).toHaveBeenCalledWith('image/png')
    expect(Array.from(px.data)).toEqual(before)
    for (const spy of env.quiet) expect(spy).not.toHaveBeenCalled()
  })

  it.each([
    ['canvas 2d를 못 얻음', { noContext: true }],
    ['PNG 주소가 나오지 않음("data:,")', { dataUrl: 'data:,' }],
    ['PNG가 아닌 주소가 나옴', { dataUrl: 'data:image/jpeg;base64,QUJD' }],
    ['PNG 만들기가 던짐', { urlThrows: true }],
  ] as const)('AC-6702.2: %s이면 null이고 던지지·로그를 남기지 않는다', (_, options) => {
    const env = urlSetup(options)
    expect(bitmapToPngUrl(bitmap())).toBeNull()
    for (const spy of env.quiet) expect(spy).not.toHaveBeenCalled()
  })

  it.each([
    ['크기가 0', { data: new Uint8ClampedArray(0), width: 0, height: 0 }],
    ['점 수와 배열 길이가 다름', { data: new Uint8ClampedArray(4), width: 3, height: 2 }],
    ['크기가 정수가 아님', { data: new Uint8ClampedArray(24), width: 1.5, height: 4 }],
  ])('AC-6702.2: %s이면 canvas를 만들지 않고 null', (_, px) => {
    const env = urlSetup()
    expect(bitmapToPngUrl(px)).toBeNull()
    expect(env.canvases).toHaveLength(0)
  })
})
