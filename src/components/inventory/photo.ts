import { PHOTO_MAX_BYTES } from '@/types/inventory'

// 명세서 사진 줄이기(브라우저) (specs/inventory REQ-7508 AC-7508.1, design.md 6절 TASK-10).
// 고른 사진(JPEG·PNG·WebP)을 긴 변 1,600px 안으로 줄여(키우지 않음) JPEG 0.85로 다시 만든다. 3,000,000바이트를 넘으면 0.7로 한 번 더,
// 그래도 넘거나 읽지 못하면 null(화면이 E-INV-PHOTO). 사진은 서버로 가기 전 여기서만 만지고 저장하지 않는다. 던지지 않는다

export const PHOTO_SIDE = 1600
export const PHOTO_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp']
/** 파일 고르기 칸 accept */
export const PHOTO_ACCEPT = PHOTO_TYPES.join(',')

const JPEG_TYPE = 'image/jpeg'
const QUALITIES = [0.85, 0.7] as const

/** 긴 변을 max px 안으로(키우지 않음, 비율 그대로, 변마다 1px 이상) */
export function fitSize(width: number, height: number, max = PHOTO_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

const toJpeg = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, JPEG_TYPE, quality))

/** 줄인 JPEG Blob(3,000,000바이트 이하). 형식이 다르거나 못 읽거나 두 번 줄여도 크면 null */
export async function shrinkPhoto(file: Blob): Promise<Blob | null> {
  if (!(file instanceof Blob) || !PHOTO_TYPES.includes(file.type)) return null
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return null
  }
  try {
    if (!(bitmap.width > 0 && bitmap.height > 0)) return null
    const size = fitSize(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const context = canvas.getContext('2d')
    if (context === null) return null
    context.drawImage(bitmap, 0, 0, size.width, size.height)
    for (const quality of QUALITIES) {
      const jpeg = await toJpeg(canvas, quality)
      if (jpeg === null) return null
      if (jpeg.size <= PHOTO_MAX_BYTES) return jpeg
    }
    return null
  } catch {
    return null
  } finally {
    bitmap.close()
  }
}
