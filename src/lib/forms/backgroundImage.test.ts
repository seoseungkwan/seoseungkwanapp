import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BG_THUMB_MAX, BG_THUMB_SIZE } from '@/types/formBackground'
import { ACCENT_SAMPLE, pickAccent } from './accent'
import { base64ToBytes, jpegDataUrl, readBackground } from './backgroundImage'

// AI 배경 그림 읽기(브라우저) (specs/forms-themes REQ-4605 AC-4605.5, design.md 5-2절, TASK-11).
// createImageBitmap·canvas를 가짜로 둔다: 40×57 canvas의 getImageData는 정한 점을 돌려주고,
// toBlob은 품질마다 정한 길이의 JPEG 바이트(FF D8 FF …)를 돌려준다. 16진수 색 글자를 쓰지 않는다

const { width: SW, height: SH } = ACCENT_SAMPLE
const { width: TW, height: TH } = BG_THUMB_SIZE
const JPEG_HEAD = [0xff, 0xd8, 0xff, 0xe0]
// 길이 n의 JPEG 모양 바이트(머리 넷 뒤는 seed로 채운다)
function jpegBytes(n: number, seed = 7): Uint8Array {
  const out = new Uint8Array(n)
  for (let i = 0; i < n; i++) out[i] = i < JPEG_HEAD.length ? JPEG_HEAD[i] : (i * 31 + seed) % 256
  return out
}
// base64 길이 = 4 × ⌈n / 3⌉ → 12,000바이트가 꼭 16,000자다
const FITS = (BG_THUMB_MAX / 4) * 3
const BIG_IMAGE = jpegBytes(5_000, 3) // 큰 그림(받은 JPEG) 대신

// 분홍 장식·흰 가운데 40×57 RGBA(accent.test.ts와 같은 모양)
function samplePixels(): Uint8ClampedArray {
  const out = new Uint8ClampedArray(SW * SH * 4)
  for (let y = 0; y < SH; y++) {
    for (let x = 0; x < SW; x++) {
      const fx = (x + 0.5) / SW
      const fy = (y + 0.5) / SH
      const center = fx >= 0.1 && fx <= 0.9 && fy >= 0.1 && fy <= 0.8
      out.set(center ? [255, 255, 255, 255] : [236, 72, 153, 255], (y * SW + x) * 4)
    }
  }
  return out
}

type Options = {
  thumbLength?: (quality: number) => number // 품질마다 작은 그림 JPEG 바이트 수
  thumbBytes?: (quality: number) => Uint8Array | null // 직접 정한 바이트(null이면 toBlob이 null)
  decode?: 'ok' | 'throw'
  context?: boolean // false면 getContext가 null
  readThrows?: boolean // getImageData가 던진다
}

type FakeCanvas = {
  width: number
  height: number
  getContext: ReturnType<typeof vi.fn>
  toBlob: ReturnType<typeof vi.fn>
}

function setup(options: Options = {}) {
  const pixels = samplePixels()
  const bitmap = { width: 1584, height: 2240, close: vi.fn() }
  const decoded: Blob[] = []
  const createImageBitmap = vi.fn(async (blob: Blob) => {
    decoded.push(blob)
    if (options.decode === 'throw') throw new Error('decode failed')
    return bitmap
  })
  const canvases: FakeCanvas[] = []
  const drawImage = vi.fn()
  const getImageData = vi.fn((x: number, y: number, w: number, h: number) => {
    if (options.readThrows) throw new Error('read failed')
    if (x !== 0 || y !== 0 || w !== SW || h !== SH) return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }
    return { data: pixels, width: w, height: h }
  })
  const qualities: number[] = []
  const createElement = vi.fn((tag: string) => {
    if (tag !== 'canvas') throw new Error(`unexpected ${tag}`)
    const canvas: FakeCanvas = {
      width: 300,
      height: 150,
      getContext: vi.fn((kind: string) => (options.context === false || kind !== '2d' ? null : { drawImage, getImageData })),
      toBlob: vi.fn((callback: (blob: Blob | null) => void, type?: string, quality?: number) => {
        qualities.push(quality ?? -1)
        const q = quality ?? 0.92
        const bytes = options.thumbBytes ? options.thumbBytes(q) : jpegBytes(options.thumbLength ? options.thumbLength(q) : 9_000, Math.round(q * 10))
        queueMicrotask(() => callback(bytes === null ? null : new Blob([bytes.slice()], { type: type ?? 'image/png' })))
      }),
    }
    canvases.push(canvas)
    return canvas
  })
  vi.stubGlobal('createImageBitmap', createImageBitmap)
  vi.stubGlobal('document', { createElement })
  return { pixels, bitmap, decoded, createImageBitmap, createElement, canvases, drawImage, getImageData, qualities }
}

const quiet = { log: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }
beforeEach(() => {
  for (const key of Object.keys(quiet) as (keyof typeof quiet)[]) {
    quiet[key] = vi.fn()
    vi.spyOn(console, key).mockImplementation(quiet[key])
  }
})
afterEach(() => {
  // 어떤 경우에도 로그를 남기지 않는다(design.md 5-2절 '로그 없음')
  for (const fn of Object.values(quiet)) expect(fn).not.toHaveBeenCalled()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// 바이트 → base64(시험 쪽 기준, Node Buffer)
const nodeBase64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64')

describe('AC-4605.5: base64ToBytes·jpegDataUrl', () => {
  it('AC-4605.5: jpegDataUrl은 data:image/jpeg;base64, 뒤에 바이트의 base64를 붙인다(FF D8 FF → /9j/)', () => {
    expect(jpegDataUrl(new Uint8Array([0xff, 0xd8, 0xff]))).toBe('data:image/jpeg;base64,/9j/')
    expect(jpegDataUrl(BIG_IMAGE)).toBe(`data:image/jpeg;base64,${nodeBase64(BIG_IMAGE)}`)
  })

  it('AC-4605.5: base64ToBytes와 jpegDataUrl은 왕복한다(0~3바이트 끝 맞춤·256가지 바이트·나눠 바꾸는 크기 넘김)', () => {
    const every = Uint8Array.from({ length: 256 }, (_, i) => i)
    const long = jpegBytes(0x8000 * 2 + 5)
    for (const bytes of [new Uint8Array(0), new Uint8Array([1]), new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]), every, long]) {
      const text = jpegDataUrl(bytes).slice('data:image/jpeg;base64,'.length)
      expect(text).toBe(nodeBase64(bytes))
      const back = base64ToBytes(text)
      expect(back).toBeInstanceOf(Uint8Array)
      expect(Array.from(back)).toEqual(Array.from(bytes))
    }
  })

  it('AC-4605.5: base64ToBytes는 경로 답 그대로의 base64 글(/9j/…)을 JPEG 바이트로 푼다', () => {
    const back = base64ToBytes(nodeBase64(BIG_IMAGE))
    expect(Array.from(back.slice(0, 3))).toEqual([0xff, 0xd8, 0xff])
    expect(back.length).toBe(BIG_IMAGE.length)
  })
})

describe('AC-4605.5: readBackground — JPEG가 아니면 null', () => {
  it.each([
    ['빈 바이트', new Uint8Array(0)],
    ['두 바이트뿐', new Uint8Array([0xff, 0xd8])],
    ['PNG 머리', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    ['FF D8 00', new Uint8Array([0xff, 0xd8, 0x00, 0xe0, 1, 2, 3])],
    ['D8 FF FF', new Uint8Array([0xd8, 0xff, 0xff, 0xe0])],
  ])('AC-4605.5: %s → null이고 그림을 풀지 않는다(createImageBitmap·canvas 안 부름)', async (_, bytes) => {
    const env = setup()
    expect(await readBackground(bytes)).toBeNull()
    expect(env.createImageBitmap).not.toHaveBeenCalled()
    expect(env.createElement).not.toHaveBeenCalled()
  })
})

describe('AC-4605.5: readBackground — 정상', () => {
  it('AC-4605.5: { image: data:image/jpeg;base64,<받은 바이트>, accent: pickAccent(40×57 점), thumb: 0.7 JPEG base64 }를 돌려준다', async () => {
    const env = setup({ thumbLength: () => 9_000 })
    const result = await readBackground(BIG_IMAGE)
    expect(result).not.toBeNull()
    expect(Object.keys(result!).sort()).toEqual(['accent', 'image', 'thumb'])
    expect(result!.image).toBe(`data:image/jpeg;base64,${nodeBase64(BIG_IMAGE)}`)
    expect(result!.accent).toBe(pickAccent(env.pixels, SW, SH))
    expect(result!.accent).toMatch(/^#[0-9a-f]{6}$/)
    expect(result!.thumb).toBe(nodeBase64(jpegBytes(9_000, 7)))
    expect(result!.thumb.startsWith('/9j/')).toBe(true)
  })

  it('AC-4605.5: 받은 바이트를 image/jpeg Blob으로 한 번 푼다', async () => {
    const env = setup()
    await readBackground(BIG_IMAGE)
    expect(env.createImageBitmap).toHaveBeenCalledTimes(1)
    const blob = env.decoded[0]
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('image/jpeg')
    expect(Array.from(new Uint8Array(await blob.arrayBuffer()))).toEqual(Array.from(BIG_IMAGE))
  })

  it('AC-4605.5: 강조색은 40×57 canvas에 그린 점(getImageData 0,0,40,57)으로, 작은 그림은 120×170 canvas에서 만든다', async () => {
    const env = setup()
    await readBackground(BIG_IMAGE)
    const sizes = env.canvases.map((c) => [c.width, c.height])
    expect(sizes).toEqual(expect.arrayContaining([[SW, SH], [TW, TH]]))
    expect(env.drawImage).toHaveBeenCalledWith(env.bitmap, 0, 0, SW, SH)
    expect(env.drawImage).toHaveBeenCalledWith(env.bitmap, 0, 0, TW, TH)
    expect(env.getImageData).toHaveBeenCalledWith(0, 0, SW, SH)
    const thumbCanvas = env.canvases.find((c) => c.width === TW && c.height === TH)!
    expect(thumbCanvas.toBlob).toHaveBeenCalledTimes(1)
    expect(thumbCanvas.toBlob.mock.calls[0][1]).toBe('image/jpeg')
    expect(thumbCanvas.toBlob.mock.calls[0][2]).toBe(0.7)
  })

  it('AC-4605.5: 작은 그림 base64가 꼭 16,000자면 0.7 그대로 쓴다(한 번만 만든다)', async () => {
    const env = setup({ thumbLength: () => FITS })
    const result = await readBackground(BIG_IMAGE)
    expect(result!.thumb).toHaveLength(BG_THUMB_MAX)
    expect(env.qualities).toEqual([0.7])
  })

  it('AC-4605.5: 0.7이 16,000자를 넘으면 0.5로 한 번 더 만들어 그것을 쓴다', async () => {
    const env = setup({ thumbLength: (q) => (q === 0.7 ? FITS + 1 : 8_000) })
    const result = await readBackground(BIG_IMAGE)
    expect(env.qualities).toEqual([0.7, 0.5])
    expect(result!.thumb).toBe(nodeBase64(jpegBytes(8_000, 5)))
    expect(result!.thumb.length).toBeLessThanOrEqual(BG_THUMB_MAX)
  })

  it('AC-4605.5: 다 쓰면 그림(bitmap)을 close()한다', async () => {
    const env = setup()
    await readBackground(BIG_IMAGE)
    expect(env.bitmap.close).toHaveBeenCalledTimes(1)
  })
})

describe('AC-4605.5: readBackground — 못 읽으면 null', () => {
  it('AC-4605.5: 0.5도 16,000자를 넘으면 null(두 번만 만들고 그만둔다), close()한다', async () => {
    const env = setup({ thumbLength: () => FITS + 1 })
    expect(await readBackground(BIG_IMAGE)).toBeNull()
    expect(env.qualities).toEqual([0.7, 0.5])
    expect(env.bitmap.close).toHaveBeenCalledTimes(1)
  })

  it('AC-4605.5: 그림 풀기가 던지면 null이고 canvas를 만들지 않는다', async () => {
    const env = setup({ decode: 'throw' })
    expect(await readBackground(BIG_IMAGE)).toBeNull()
    expect(env.createElement).not.toHaveBeenCalled()
  })

  it('AC-4605.5: createImageBitmap이 없는 브라우저면 null', async () => {
    setup()
    vi.stubGlobal('createImageBitmap', undefined)
    expect(await readBackground(BIG_IMAGE)).toBeNull()
  })

  it('AC-4605.5: canvas 2d를 못 얻으면 null, close()한다', async () => {
    const env = setup({ context: false })
    expect(await readBackground(BIG_IMAGE)).toBeNull()
    expect(env.bitmap.close).toHaveBeenCalledTimes(1)
  })

  it('AC-4605.5: 점 읽기(getImageData)가 던지면 null, close()한다', async () => {
    const env = setup({ readThrows: true })
    expect(await readBackground(BIG_IMAGE)).toBeNull()
    expect(env.bitmap.close).toHaveBeenCalledTimes(1)
  })

  it('AC-4605.5: toBlob이 null이면 null, close()한다', async () => {
    const env = setup({ thumbBytes: () => null })
    expect(await readBackground(BIG_IMAGE)).toBeNull()
    expect(env.bitmap.close).toHaveBeenCalledTimes(1)
  })

  it('AC-4605.5: 작은 그림이 JPEG가 아니면(브라우저가 PNG로 만듦) null — 저장 검사(/9j/)를 못 넘는 작은 그림을 내지 않는다', async () => {
    const env = setup({ thumbBytes: () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]) })
    expect(await readBackground(BIG_IMAGE)).toBeNull()
    expect(env.bitmap.close).toHaveBeenCalledTimes(1)
  })
})
