// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadSlipPng, slipFileName } from './slipPng'

// 간단 명세서 그림 파일(spec staff AC-7615.10, design.md 4절 slipPng.ts).
// 서식 탭 그림 파일(lib/forms/png.ts)과 같은 길: 화면의 <svg> → 글꼴 두 개를 data: 주소로(svgForImage) → 그림 → canvas 1588×2246 → PNG → <a download>.
// fetch·Image·canvas·URL·<a>를 흉내 내 성공(true)·실패(false)만 본다. 실제 그림은 화면 TASK(급여 명세서)에서 연다

const SVG_NS = 'http://www.w3.org/2000/svg'
const BOLD_URL = '/poster/fonts/Pretendard-Bold.subset.woff2'
const BLACK_URL = '/poster/fonts/Pretendard-Black.subset.woff2'
const BOLD = new Uint8Array([1, 2, 3, 250])
const BLACK = new Uint8Array([9, 8, 7])
const FILE = '급여명세-이도윤-2026-11.png'

// 명세서 SVG 모양(TASK-13 PaySlip이 그리는 것): 글꼴 @font-face 둘 + 글
function slipElement(extra = ''): SVGSVGElement {
  const holder = document.createElement('div')
  holder.innerHTML = [
    `<svg xmlns="${SVG_NS}" viewBox="0 0 794 1123" width="397" height="561">`,
    `<style>@font-face { font-family: SlipFont; font-weight: 700; src: url(${BOLD_URL}) format('woff2') }`,
    `@font-face { font-family: SlipFont; font-weight: 900; src: url(${BLACK_URL}) format('woff2') }</style>`,
    '<text x="40" y="60">○○정형외과</text><text x="40" y="100">2026년 11월 급여 명세</text>',
    extra,
    '</svg>',
  ].join('')
  document.body.append(holder)
  const svg = holder.querySelector('svg')
  if (!svg) throw new Error('svg가 없다')
  return svg
}

const dataUrls = (svg: string, prefix: string) => [...svg.matchAll(new RegExp(`${prefix.replace(/[+/.]/g, '\\$&')}([A-Za-z0-9+/=]+)`, 'g'))].map((m) => m[1])
const decode = (b64: string) => [...Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))]
const rootTag = (svg: string) => svg.match(/^<svg\b[^>]*>/)?.[0] ?? ''

type Mode = { fetchFails?: 'throw' | 'bold' | 'black'; imageError?: boolean; noContext?: boolean; nullBlob?: boolean }
type FakeResponse = { ok: boolean; status: number; arrayBuffer: () => Promise<ArrayBuffer> }
const buffer = (bytes: Uint8Array): ArrayBuffer => {
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  return copy
}

function setup(mode: Mode = {}) {
  const fetchCalls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown): Promise<FakeResponse> => {
      const url = String(input)
      fetchCalls.push(url)
      if (mode.fetchFails === 'throw') throw new TypeError('Failed to fetch')
      const fail = (mode.fetchFails === 'bold' && url === BOLD_URL) || (mode.fetchFails === 'black' && url === BLACK_URL)
      if (fail) return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) }
      if (url === BOLD_URL) return { ok: true, status: 200, arrayBuffer: async () => buffer(BOLD) }
      if (url === BLACK_URL) return { ok: true, status: 200, arrayBuffer: async () => buffer(BLACK) }
      return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) }
    }),
  )

  const blobs: Blob[] = []
  let count = 0
  const create = vi.fn((blob: Blob) => {
    blobs.push(blob)
    count += 1
    return `blob:slip-${count}`
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
  document.body.innerHTML = ''
})

describe('AC-7615.10: slipFileName — 급여명세-{이름}-{YYYY}-{MM}.png', () => {
  it('AC-7615.10: 이름과 달로 파일 이름을 만든다', () => {
    expect(slipFileName('이도윤', '2026-11')).toBe(FILE)
    expect(slipFileName('김하늘', '2027-01')).toBe('급여명세-김하늘-2027-01.png')
  })
})

describe('AC-7615.10: downloadSlipPng — 명세서 한 장을 1588×2246 PNG로 내려받는다', () => {
  it('AC-7615.10: 성공하면 true — 글꼴 둘만 읽고, 그림용 SVG(data: 글꼴) → 그림 → canvas 1588×2246 → PNG → <a download>', async () => {
    const env = setup()
    await expect(downloadSlipPng(slipElement(), FILE)).resolves.toBe(true)

    expect([...env.fetchCalls].sort()).toEqual([BLACK_URL, BOLD_URL])

    // 첫 Blob은 그림용 SVG 글: 글꼴 두 주소가 data: 주소가 되고 /poster/는 남지 않았다
    expect(env.blobs[0].type).toBe('image/svg+xml')
    const text = await env.blobs[0].text()
    expect(text).not.toContain('/poster/')
    expect(dataUrls(text, 'data:font/woff2;base64,').map(decode)).toEqual([[...BOLD], [...BLACK]])
    expect(rootTag(text)).toMatch(/\swidth="1588"/)
    expect(rootTag(text)).toMatch(/\sheight="2246"/)
    expect(rootTag(text)).toMatch(/viewBox="0 0 794 1123"/)
    expect(text).toContain('2026년 11월 급여 명세')
    expect(env.images.map((i) => i.src)).toEqual(['blob:slip-1'])

    expect(env.canvases).toHaveLength(1)
    expect([env.canvases[0].width, env.canvases[0].height]).toEqual([1588, 2246])
    expect(env.drawImage).toHaveBeenCalledTimes(1)
    expect(env.drawImage.mock.calls[0][0]).toBe(env.images[0])
    expect(env.drawImage.mock.calls[0].slice(1)).toEqual([0, 0, 1588, 2246])
    expect(env.toBlob.mock.calls[0][1]).toBe('image/png')

    // 둘째 Blob은 PNG, 그 주소를 파일 이름과 함께 누르고 치운다
    expect(env.blobs[1].type).toBe('image/png')
    expect(env.clicks).toEqual([{ download: FILE, href: 'blob:slip-2', connected: true }])
    expect(document.querySelectorAll('a[download]')).toHaveLength(0)

    // 그림 주소는 바로, PNG 주소는 내려받기가 시작된 뒤 거둔다
    expect(env.revoke).toHaveBeenCalledWith('blob:slip-1')
    expect(env.revoke).not.toHaveBeenCalledWith('blob:slip-2')
    vi.runAllTimers()
    expect(env.revoke).toHaveBeenCalledWith('blob:slip-2')
    expect(env.revoke).toHaveBeenCalledTimes(2)
    for (const spy of env.quiet) expect(spy).not.toHaveBeenCalled()
  })

  it('AC-7615.10: 화면의 명세서 SVG는 바꾸지 않는다(그림용 글만 따로 만든다)', async () => {
    setup()
    const svg = slipElement()
    const before = svg.outerHTML
    await expect(downloadSlipPng(svg, FILE)).resolves.toBe(true)
    expect(svg.outerHTML).toBe(before)
  })

  it.each([
    ['fetch가 던짐(연결 끊김)', { fetchFails: 'throw' }],
    ['Bold 글꼴 읽기 실패(!ok)', { fetchFails: 'bold' }],
    ['Black 글꼴 읽기 실패(!ok)', { fetchFails: 'black' }],
  ] as const)('AC-7615.10: 글꼴을 못 읽으면 false — %s, 그림·내려받기를 하지 않는다', async (_, mode) => {
    const env = setup(mode)
    await expect(downloadSlipPng(slipElement(), FILE)).resolves.toBe(false)
    expect(env.images).toHaveLength(0)
    expect(env.clicks).toHaveLength(0)
    expect(env.create).not.toHaveBeenCalled()
    for (const spy of env.quiet) expect(spy).not.toHaveBeenCalled()
  })

  it('AC-7615.10: 바깥 주소(/poster/…)가 남은 SVG면 그리지 않고 false', async () => {
    const env = setup()
    await expect(downloadSlipPng(slipElement('<image href="/poster/logo.png" width="10" height="10"/>'), FILE)).resolves.toBe(false)
    expect(env.images).toHaveLength(0)
    expect(env.clicks).toHaveLength(0)
  })

  it('AC-7615.10: 그림을 못 그리면(Image error) false, 만든 SVG 주소는 거둔다', async () => {
    const env = setup({ imageError: true })
    await expect(downloadSlipPng(slipElement(), FILE)).resolves.toBe(false)
    expect(env.clicks).toHaveLength(0)
    expect(env.create).toHaveBeenCalledTimes(1)
    expect(env.revoke).toHaveBeenCalledWith('blob:slip-1')
    for (const spy of env.quiet) expect(spy).not.toHaveBeenCalled()
  })

  it('AC-7615.10: toBlob이 null이면 false, 내려받기를 하지 않고 SVG 주소는 거둔다', async () => {
    const env = setup({ nullBlob: true })
    await expect(downloadSlipPng(slipElement(), FILE)).resolves.toBe(false)
    expect(env.clicks).toHaveLength(0)
    expect(env.create).toHaveBeenCalledTimes(1)
    expect(env.revoke).toHaveBeenCalledWith('blob:slip-1')
  })

  it('AC-7615.10: canvas 2d를 못 얻으면 false', async () => {
    const env = setup({ noContext: true })
    await expect(downloadSlipPng(slipElement(), FILE)).resolves.toBe(false)
    expect(env.clicks).toHaveLength(0)
    expect(env.revoke).toHaveBeenCalledWith('blob:slip-1')
  })

  it('AC-7615.10: 브라우저 기능이 아예 없어 던져도(createObjectURL 없음) false로 끝난다(던지지 않고 로그 없음)', async () => {
    const env = setup()
    Object.defineProperty(URL, 'createObjectURL', {
      value: () => {
        throw new Error('없음')
      },
      configurable: true,
      writable: true,
    })
    await expect(downloadSlipPng(slipElement(), FILE)).resolves.toBe(false)
    expect(env.clicks).toHaveLength(0)
    for (const spy of env.quiet) expect(spy).not.toHaveBeenCalled()
  })
})
