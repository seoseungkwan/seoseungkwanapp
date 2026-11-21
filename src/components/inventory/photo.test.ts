import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PHOTO_MAX_BYTES } from '@/types/inventory'
import { PHOTO_ACCEPT, PHOTO_SIDE, fitSize, shrinkPhoto } from './photo'

// 명세서 사진 줄이기 (spec inventory AC-7508.1, design.md 6절 TASK-10). 캔버스는 가짜다: fitSize와 크기 넘침 갈래만 본다.
// 사진은 지어낸 바이트다(환자 정보 없음)

describe('fitSize (AC-7508.1)', () => {
  it('AC-7508.1: 긴 변을 1,600px로 줄이고 비율을 지킨다', () => {
    expect(PHOTO_SIDE).toBe(1600)
    expect(fitSize(4000, 3000)).toEqual({ width: 1600, height: 1200 })
    expect(fitSize(3000, 4000)).toEqual({ width: 1200, height: 1600 })
    expect(fitSize(3200, 1600, 1600)).toEqual({ width: 1600, height: 800 })
  })

  it('AC-7508.1: 이미 작은 사진은 키우지 않는다', () => {
    expect(fitSize(1200, 900)).toEqual({ width: 1200, height: 900 })
    expect(fitSize(1600, 1600)).toEqual({ width: 1600, height: 1600 })
  })

  it('AC-7508.1: 아주 긴 사진도 짧은 변은 1px 아래로 가지 않는다', () => {
    expect(fitSize(16000, 3)).toEqual({ width: 1600, height: 1 })
  })

  it('AC-7508.1: 고를 수 있는 사진은 JPEG·PNG·WebP다', () => {
    expect(PHOTO_ACCEPT).toBe('image/jpeg,image/png,image/webp')
  })
})

type FakeCanvas = {
  width: number
  height: number
  drawn: unknown[][]
  asked: [string | undefined, number | undefined][]
  getContext(kind: string): unknown
  toBlob(done: (blob: Blob | null) => void, type?: string, quality?: number): void
}

describe('shrinkPhoto (AC-7508.1)', () => {
  let canvas: FakeCanvas
  let answers: (Blob | null)[]
  const bitmap = { width: 4000, height: 3000, close: vi.fn() }
  const decode = vi.fn<(file: Blob) => Promise<{ width: number; height: number; close: () => void }>>(async () => bitmap)

  const jpegOf = (size: number) => new Blob([new Uint8Array(size)], { type: 'image/jpeg' })
  const photoFile = (type = 'image/png') => new Blob([new Uint8Array([1, 2, 3])], { type })

  beforeEach(() => {
    answers = [jpegOf(1_200_000)]
    bitmap.close.mockReset()
    decode.mockReset().mockImplementation(async () => bitmap)
    canvas = {
      width: 0,
      height: 0,
      drawn: [],
      asked: [],
      getContext(kind) {
        return kind === '2d' ? { drawImage: (...args: unknown[]) => canvas.drawn.push(args) } : null
      },
      toBlob(done, type, quality) {
        canvas.asked.push([type, quality])
        done(answers.shift() ?? null)
      },
    }
    vi.stubGlobal('createImageBitmap', decode)
    vi.stubGlobal('document', { createElement: (tag: string) => (tag === 'canvas' ? canvas : null) })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('AC-7508.1: 긴 변 1,600px 캔버스에 그려 JPEG 0.85로 만든다', async () => {
    const out = await shrinkPhoto(photoFile())
    expect(out).toBeInstanceOf(Blob)
    expect(out?.size).toBe(1_200_000)
    expect([canvas.width, canvas.height]).toEqual([1600, 1200])
    expect(canvas.drawn).toEqual([[bitmap, 0, 0, 1600, 1200]])
    expect(canvas.asked).toEqual([['image/jpeg', 0.85]])
    expect(bitmap.close).toHaveBeenCalled()
  })

  it('AC-7508.1: 3,000,000바이트를 넘으면 0.7로 한 번 더 줄인다', async () => {
    answers = [jpegOf(PHOTO_MAX_BYTES + 1), jpegOf(2_400_000)]
    const out = await shrinkPhoto(photoFile('image/jpeg'))
    expect(canvas.asked).toEqual([
      ['image/jpeg', 0.85],
      ['image/jpeg', 0.7],
    ])
    expect(out?.size).toBe(2_400_000)
  })

  it('AC-7508.1: 딱 3,000,000바이트는 그대로 쓴다', async () => {
    answers = [jpegOf(PHOTO_MAX_BYTES)]
    const out = await shrinkPhoto(photoFile('image/webp'))
    expect(out?.size).toBe(PHOTO_MAX_BYTES)
    expect(canvas.asked).toHaveLength(1)
  })

  it('AC-7508.1: 두 번 줄여도 넘으면 null(E-INV-PHOTO)', async () => {
    answers = [jpegOf(PHOTO_MAX_BYTES + 1), jpegOf(PHOTO_MAX_BYTES + 1)]
    expect(await shrinkPhoto(photoFile())).toBeNull()
    expect(bitmap.close).toHaveBeenCalled()
  })

  it('AC-7508.1: JPEG·PNG·WebP가 아니면 열어 보지도 않고 null', async () => {
    for (const type of ['image/gif', 'application/pdf', '']) {
      expect(await shrinkPhoto(photoFile(type))).toBeNull()
    }
    expect(decode).not.toHaveBeenCalled()
  })

  it('AC-7508.1: 사진을 못 읽거나 캔버스가 실패하면 null', async () => {
    decode.mockRejectedValueOnce(new Error('가짜 못 읽음'))
    expect(await shrinkPhoto(photoFile())).toBeNull()

    answers = [null]
    expect(await shrinkPhoto(photoFile())).toBeNull()

    canvas.getContext = () => null
    expect(await shrinkPhoto(photoFile())).toBeNull()
  })

  it('AC-7508.1: 크기가 0인 그림은 null', async () => {
    decode.mockResolvedValueOnce({ width: 0, height: 0, close: vi.fn() })
    expect(await shrinkPhoto(photoFile())).toBeNull()
  })
})
