// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Poster } from '@/components/forms/Poster'
import type { BackgroundLook } from '@/types/formBackground'
import type { ClosureNotice, ThemeArt, ThemeId } from '@/types/forms'
import { base64, downloadPosterPng, svgForImage } from './png'

// 휴진 안내 그림 파일 — 그림 2와 내 배경 (specs/forms-themes TASK-10, REQ-4604 · AC-4604.1~4604.3, design.md 7절).
// 지금 그림 파일 시험(png.test.ts)은 고치지 않는다(AC-4604.3). fetch·Image·canvas·URL·<a>를 흉내 내 무엇을 읽고 무엇을 그렸는지 본다.
// 배경 그림 바이트는 지어낸 값이다

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(join(ROOT, rel))
const BOLD = new Uint8Array(read('public/poster/fonts/Pretendard-Bold.subset.woff2'))
const BLACK = new Uint8Array(read('public/poster/fonts/Pretendard-Black.subset.woff2'))
const LOGO_PNG = new Uint8Array(read('public/poster/logo.png'))
const THEME_2 = read('public/poster/themes/children-2.svg').toString('utf8')
const NOTICE: ClosureNotice = { year: 2027, month: 5, cards: [{ start: '2027-05-05', end: null, name: '어린이날', status: '휴진' }], theme: 'children-2' }
const FILE = '휴진안내_2027-05.png'
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00])
const IMAGE = `data:image/jpeg;base64,${Buffer.from(JPEG).toString('base64')}`
const BACKGROUND: BackgroundLook = { image: IMAGE, accent: '#7a1f4d' }

afterEach(cleanup)

function posterElement(props: { theme?: ThemeId; art?: ThemeArt; background?: BackgroundLook | null } = {}): SVGSVGElement {
  const { container } = render(createElement(Poster, { notice: NOTICE, theme: 'children', ...props }))
  const svg = container.querySelector('svg')
  if (!svg) throw new Error('svg가 없다')
  return svg
}
const posterText = (props?: Parameters<typeof posterElement>[0]) => new XMLSerializer().serializeToString(posterElement(props))
const dataUrls = (svg: string, prefix: string) => [...svg.matchAll(new RegExp(`${prefix.replace(/[+/.]/g, '\\$&')}([A-Za-z0-9+/=]+)`, 'g'))].map((m) => m[1])
const decode = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
const ASSETS = { bold: new Uint8Array([1]), black: new Uint8Array([2]), logo: new Uint8Array([3]) }

describe('AC-4604.1: 그림 2 테마 주소도 data: 주소로 바꾼다', () => {
  it('AC-4604.1: 그림 2 안내문 SVG에는 처음에 /poster/themes/<열쇠>-2.svg가 있고, svgForImage 뒤에는 /poster/가 남지 않는다', () => {
    const svg = posterText({ art: 2 })
    expect(svg).toContain('/poster/themes/children-2.svg')
    const out = svgForImage(svg, { theme: THEME_2, bold: BOLD, black: BLACK, logo: LOGO_PNG })
    expect(out).not.toContain('/poster/')
    const themes = dataUrls(out, 'data:image/svg+xml;base64,')
    expect(themes).toHaveLength(1)
    expect(new TextDecoder().decode(decode(themes[0]))).toBe(THEME_2)
  })

  it('AC-4604.1: 테마 주소 바꾸기는 -2만 더 받고 -3·다른 모양은 그대로 둔다(따옴표 둘 다·xlink:href도)', () => {
    const svg = [
      '<svg>',
      "<image href='/poster/themes/m05-2.svg'/>",
      '<image xlink:href="/poster/themes/m05-2.svg"/>',
      '<image href="/poster/themes/m05-3.svg"/>',
      '<image href="/poster/themes/m05-22.svg"/>',
      '</svg>',
    ].join('')
    const out = svgForImage(svg, { theme: '<svg/>', ...ASSETS })
    expect(dataUrls(out, 'data:image/svg+xml;base64,')).toHaveLength(2)
    expect(out).toContain('/poster/themes/m05-3.svg')
    expect(out).toContain('/poster/themes/m05-22.svg')
    expect(out).not.toContain('/poster/themes/m05-2.svg')
  })

  it('AC-4604.1: 첫 image가 JPEG data: 주소(내 배경)면 theme 없이 불러도 그 주소를 그대로 두고 /poster/가 남지 않는다', () => {
    const svg = posterText({ background: BACKGROUND })
    const out = svgForImage(svg, ASSETS)
    expect(out).toContain(`href="${IMAGE}"`)
    expect(out).not.toContain('/poster/')
  })
})

describe('AC-4604.1·AC-4604.2: base64', () => {
  it('AC-4604.2: base64는 내보내고, 바이트를 Buffer와 같은 base64 글로 바꾼다(큰 배열도 나눠 바꾼다)', () => {
    expect(base64(new Uint8Array(0))).toBe('')
    expect(base64(JPEG)).toBe(Buffer.from(JPEG).toString('base64'))
    const big = Uint8Array.from({ length: 0x8000 * 2 + 7 }, (_, i) => (i * 31 + 7) % 256)
    expect(base64(big)).toBe(Buffer.from(big).toString('base64'))
  })
})

// ---------- downloadPosterPng: 브라우저 흉내 ----------

type FakeResponse = { ok: boolean; status: number; text?: () => Promise<string>; arrayBuffer?: () => Promise<ArrayBuffer> }
const bufferOf = (bytes: Uint8Array): ArrayBuffer => {
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  return copy
}

function setup() {
  const fetchCalls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown): Promise<FakeResponse> => {
      const url = String(input)
      fetchCalls.push(url)
      if (url === '/poster/themes/children-2.svg') return { ok: true, status: 200, text: async () => THEME_2 }
      if (url === '/poster/themes/children-3.svg') return { ok: true, status: 200, text: async () => '<svg/>' }
      if (url === '/poster/fonts/Pretendard-Bold.subset.woff2') return { ok: true, status: 200, arrayBuffer: async () => bufferOf(BOLD) }
      if (url === '/poster/fonts/Pretendard-Black.subset.woff2') return { ok: true, status: 200, arrayBuffer: async () => bufferOf(BLACK) }
      if (url === '/poster/logo.png') return { ok: true, status: 200, arrayBuffer: async () => bufferOf(LOGO_PNG) }
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
  Object.defineProperty(URL, 'createObjectURL', { value: create, configurable: true, writable: true })
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true, writable: true })
  class FakeImage {
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    private current = ''
    get src() {
      return this.current
    }
    set src(value: string) {
      this.current = value
      queueMicrotask(() => this.onload?.())
    }
  }
  vi.stubGlobal('Image', FakeImage)
  const drawImage = vi.fn()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (): CanvasRenderingContext2D | null {
    return { drawImage } as unknown as CanvasRenderingContext2D
  } as HTMLCanvasElement['getContext'])
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (callback: BlobCallback, type?: string) {
    queueMicrotask(() => callback(new Blob(['png'], { type: type ?? 'image/png' })))
  })
  const clicks: { download: string; href: string }[] = []
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicks.push({ download: this.download, href: this.getAttribute('href') ?? '' })
  })
  const quiet = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m))
  return { fetchCalls, blobs, drawImage, clicks, quiet }
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

const FONTS_AND_LOGO = ['/poster/fonts/Pretendard-Black.subset.woff2', '/poster/fonts/Pretendard-Bold.subset.woff2', '/poster/logo.png']

describe('AC-4604.1: downloadPosterPng — 그림 2', () => {
  it('AC-4604.1: 그림 2 안내문이면 /poster/themes/<열쇠>-2.svg를 읽어 넣고 /poster/가 남지 않은 PNG를 내려받는다', async () => {
    const env = setup()
    await expect(downloadPosterPng(posterElement({ art: 2 }), FILE)).resolves.toBe(true)
    expect([...env.fetchCalls].sort()).toEqual([...FONTS_AND_LOGO, '/poster/themes/children-2.svg'].sort())
    const text = await env.blobs[0].text()
    expect(text).not.toContain('/poster/')
    const themes = dataUrls(text, 'data:image/svg+xml;base64,')
    expect(themes).toHaveLength(1)
    expect(new TextDecoder().decode(decode(themes[0]))).toBe(THEME_2)
    expect(env.clicks).toEqual([{ download: FILE, href: 'blob:poster-2' }])
    for (const spy of env.quiet) expect(spy).not.toHaveBeenCalled()
  })

  it('AC-4604.1: 첫 image가 -3 주소면(그림 3은 없다) 아무것도 읽지 않고 false', async () => {
    const env = setup()
    const svg = posterElement()
    svg.querySelector('image')?.setAttribute('href', '/poster/themes/children-3.svg')
    await expect(downloadPosterPng(svg, FILE)).resolves.toBe(false)
    expect(env.fetchCalls).toEqual([])
    expect(env.clicks).toHaveLength(0)
  })
})

describe('AC-4604.2: downloadPosterPng — 내 배경(JPEG data: 주소)', () => {
  it('AC-4604.2: 첫 image가 JPEG data: 주소면 테마 그림을 읽지 않고(글꼴 둘·로고만) 그 주소를 그대로 둔 SVG로 PNG를 내려받는다', async () => {
    const env = setup()
    await expect(downloadPosterPng(posterElement({ background: BACKGROUND, art: 2 }), FILE)).resolves.toBe(true)
    expect([...env.fetchCalls].sort()).toEqual(FONTS_AND_LOGO)
    expect(env.blobs[0].type).toBe('image/svg+xml')
    const text = await env.blobs[0].text()
    expect(text).not.toContain('/poster/')
    expect(text).toContain(`href="${IMAGE}"`)
    const jpegs = dataUrls(text, 'data:image/jpeg;base64,')
    expect(jpegs).toHaveLength(1)
    expect(decode(jpegs[0])).toEqual(JPEG)
    expect(dataUrls(text, 'data:image/svg+xml;base64,')).toEqual([])
    expect(dataUrls(text, 'data:font/woff2;base64,')).toHaveLength(2)
    expect(dataUrls(text, 'data:image/png;base64,')).toHaveLength(1)
    expect(env.drawImage).toHaveBeenCalledTimes(1)
    expect(env.clicks).toEqual([{ download: FILE, href: 'blob:poster-2' }])
    for (const spy of env.quiet) expect(spy).not.toHaveBeenCalled()
  })

  it.each([
    ['https: 주소', 'https://example.com/a.jpg'],
    ['PNG data: 주소', 'data:image/png;base64,iVBORw0KGgo='],
    ['SVG data: 주소', 'data:image/svg+xml;base64,PHN2Zz4='],
    ['다른 폴더의 svg', '/poster/other/children.svg'],
    ['빈 주소', ''],
  ])('AC-4604.2: 첫 image가 테마 주소도 JPEG data: 주소도 아니면(%s) 아무것도 읽지 않고 false', async (_, href) => {
    const env = setup()
    const svg = posterElement()
    svg.querySelector('image')?.setAttribute('href', href)
    await expect(downloadPosterPng(svg, FILE)).resolves.toBe(false)
    expect(env.fetchCalls).toEqual([])
    expect(env.clicks).toHaveLength(0)
    for (const spy of env.quiet) expect(spy).not.toHaveBeenCalled()
  })
})
