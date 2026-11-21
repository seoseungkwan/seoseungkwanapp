import { IMAGE_SIZE, svgForImage } from '@/lib/forms/png'

// 간단 급여 명세서 그림 파일(staff AC-7615.10, design.md 4절). 서식 탭 그림 파일(lib/forms/png.ts, 고치지 않음)과 같은 길:
// 화면의 명세서 <svg>를 글로 → 글꼴 두 개(우리 사이트 /poster/fonts/)를 읽어 svgForImage로 data: 주소 → Blob → Image → canvas → PNG → <a download>.
// svgForImage가 뿌리 크기를 1588×2246(A4 794×1123의 2배)으로 두므로 명세서 SVG는 viewBox 0 0 794 1123로 그린다.
// 그림은 blob: 주소라 CSP를 바꾸지 않고, 서버로 보내지 않는다. 어떤 실패든 false다(던지지 않고 로그를 남기지 않는다) — 화면이 E-STAFF-IMAGE-FAILED를 보인다

// 명세서 SVG가 @font-face에 쓰는 주소(서식 안내문과 같은 글꼴 파일). 글꼴 이름은 서식 안내문 이름(components/forms 안에서만 씀)과 다른 것을 쓴다
const FONT_URLS = { bold: '/poster/fonts/Pretendard-Bold.subset.woff2', black: '/poster/fonts/Pretendard-Black.subset.woff2' } as const
const PNG_REVOKE_MS = 10_000 // 내려받기가 시작된 뒤 PNG 주소를 거둔다

/** 그림 파일 이름(AC-7615.10): 급여명세-{이름}-{YYYY}-{MM}.png (month는 'YYYY-MM') */
export const slipFileName = (name: string, month: string) => `급여명세-${name}-${month}.png`

async function readBytes(url: string): Promise<Uint8Array | null> {
  const res = await fetch(url)
  return res.ok ? new Uint8Array(await res.arrayBuffer()) : null
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = url
  })
}

const toPng = (canvas: HTMLCanvasElement) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))

async function drawPng(svgText: string): Promise<Blob | null> {
  const svgUrl = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }))
  try {
    const image = await loadImage(svgUrl)
    if (!image) return null
    const canvas = document.createElement('canvas')
    canvas.width = IMAGE_SIZE.width
    canvas.height = IMAGE_SIZE.height
    const context = canvas.getContext('2d')
    if (!context) return null
    context.drawImage(image, 0, 0, IMAGE_SIZE.width, IMAGE_SIZE.height)
    return await toPng(canvas)
  } finally {
    URL.revokeObjectURL(svgUrl)
  }
}

function saveFile(png: Blob, fileName: string) {
  const url = URL.createObjectURL(png)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.hidden = true
  document.body.append(link)
  try {
    link.click()
  } finally {
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), PNG_REVOKE_MS)
  }
}

/** [그림 파일](AC-7615.10): 명세서 SVG 한 장을 1588×2246 PNG로 내려받는다. 성공 true, 실패 false */
export async function downloadSlipPng(svg: SVGSVGElement, fileName: string): Promise<boolean> {
  try {
    const source = new XMLSerializer().serializeToString(svg)
    const [bold, black] = await Promise.all([readBytes(FONT_URLS.bold), readBytes(FONT_URLS.black)])
    if (!bold || !black) return false
    const text = svgForImage(source, { bold, black })
    if (text.includes('/poster/')) return false // 바깥 주소가 남으면 그림에서 빠진다
    const png = await drawPng(text)
    if (!png) return false
    saveFile(png, fileName)
    return true
  } catch {
    return false
  }
}
