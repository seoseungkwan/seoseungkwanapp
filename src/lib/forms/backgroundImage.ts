import { BG_THUMB_MAX, BG_THUMB_SIZE } from '@/types/formBackground'
import { ACCENT_SAMPLE, pickAccent } from './accent'
import { isJpegBase64 } from './background'
import { base64 } from './png'

// AI 배경 그림 읽기(브라우저) (specs/forms-themes REQ-4605 AC-4605.5, design.md 5-2절).
// 받은 JPEG 바이트 → 안내문에 얹을 data: 주소·강조색·목록용 작은 그림. 그림은 Blob으로 풀어 canvas가 더럽혀지지 않는다.
// 어떤 실패든 null이다(던지지 않고 로그를 남기지 않는다). 16진수 색 글자를 두지 않는다

const JPEG_TYPE = 'image/jpeg'
const DATA_PREFIX = `data:${JPEG_TYPE};base64,`
const THUMB_QUALITIES = [0.7, 0.5] as const // 0.7이 16,000자를 넘으면 0.5로 한 번 더

type Size = { readonly width: number; readonly height: number }

export type ReadBackground = { image: string; accent: string; thumb: string } // thumb = 작은 그림 JPEG base64 글

const isJpegBytes = (bytes: Uint8Array) => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff

/** base64 글 → 바이트(경로 답의 그림 글을 푼다) */
export function base64ToBytes(text: string): Uint8Array {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** 'data:image/jpeg;base64,' + 바이트의 base64 */
export function jpegDataUrl(bytes: Uint8Array): string {
  return `${DATA_PREFIX}${base64(bytes)}`
}

// 그 크기 canvas에 그림을 늘려 그린다. 2d를 못 얻으면 null
function drawn(bitmap: ImageBitmap, size: Size): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } | null {
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const context = canvas.getContext('2d')
  if (!context) return null
  context.drawImage(bitmap, 0, 0, size.width, size.height)
  return { canvas, context }
}

const toJpeg = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, JPEG_TYPE, quality))

// 120×170 JPEG base64. 품질 0.7 → 0.5 차례로 16,000자 안이면 그것, 아니면 null. JPEG가 아니면 null(저장 검사를 못 넘는다)
async function thumbOf(bitmap: ImageBitmap): Promise<string | null> {
  const target = drawn(bitmap, BG_THUMB_SIZE)
  if (!target) return null
  for (const quality of THUMB_QUALITIES) {
    const blob = await toJpeg(target.canvas, quality)
    if (!blob) return null
    const thumb = base64(new Uint8Array(await blob.arrayBuffer()))
    if (thumb.length <= BG_THUMB_MAX) return isJpegBase64(thumb, BG_THUMB_MAX) ? thumb : null
  }
  return null
}

/** JPEG 바이트 → { image: data: 주소, accent: 강조색, thumb: 작은 그림 base64 }. FF D8 FF가 아니거나 못 읽으면 null */
export async function readBackground(bytes: Uint8Array): Promise<ReadBackground | null> {
  if (!isJpegBytes(bytes)) return null
  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await createImageBitmap(new Blob([bytes.slice()], { type: JPEG_TYPE }))
    const sample = drawn(bitmap, ACCENT_SAMPLE)
    if (!sample) return null
    const pixels = sample.context.getImageData(0, 0, ACCENT_SAMPLE.width, ACCENT_SAMPLE.height).data
    const accent = pickAccent(pixels, ACCENT_SAMPLE.width, ACCENT_SAMPLE.height)
    const thumb = await thumbOf(bitmap)
    if (thumb === null) return null
    return { image: jpegDataUrl(bytes), accent, thumb }
  } catch {
    return null
  } finally {
    bitmap?.close()
  }
}
