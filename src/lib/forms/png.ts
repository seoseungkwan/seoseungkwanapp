// 서식 탭 휴진 안내 그림 파일(PNG) 만들기 (specs/forms design.md 7절 '그림 파일', AC-3506.2·3506.3).
// SVG를 그림(Image)으로 그리면 바깥 주소(/poster/…)를 읽지 않으므로, 테마 그림과 글꼴 두 개를 data: 주소로 넣은 SVG 글을 쓴다.
// 그림은 blob: 주소라 CSP(img-src 'self' data: blob:)를 바꾸지 않는다. 실패는 false — 화면이 E-FORMS-IMAGE-FAILED를 보인다

const SVG_NS = 'http://www.w3.org/2000/svg'
export const IMAGE_SIZE = { width: 1588, height: 2246 } as const // 시안(794×1123)의 2배
// 안내문 SVG(components/forms/Poster.tsx)가 쓰는 주소
const FONT_URLS = { bold: '/poster/fonts/Pretendard-Bold.subset.woff2', black: '/poster/fonts/Pretendard-Black.subset.woff2' } as const
const THEME_PATH = /^\/poster\/themes\/([a-z0-9]+)\.svg$/
const THEME_HREF = /(\s(?:xlink:)?href=)(["'])\/poster\/themes\/[a-z0-9]+\.svg\2/g
const PNG_REVOKE_MS = 10_000 // 내려받기가 시작된 뒤 PNG 주소를 거둔다

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
const fontUrl = (path: string) => new RegExp(`url\\(\\s*(["']?)${escapeRegExp(path)}\\1\\s*\\)`, 'g')

function base64(bytes: Uint8Array): string {
  let binary = ''
  const CHUNK = 0x8000 // 인자 수 한도를 넘지 않게 나눠 바꾼다
  for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  return btoa(binary)
}

// 뿌리 <svg …> 태그: 따옴표 안의 '>'는 태그 끝이 아니다
const ROOT_TAG = /<svg\b((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/
const ATTR = /([^\s=/>]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g

// width·height를 그림 크기로 바꾸고(viewBox는 그대로), xmlns를 하나만 둔다(XMLSerializer가 겹쳐 쓸 수 있다)
function sizeRoot(svg: string): string {
  return svg.replace(ROOT_TAG, (_, attrText: string, selfClose: string) => {
    const seen = new Set<string>()
    const kept: string[] = []
    for (const [whole, name] of attrText.matchAll(ATTR)) {
      if (name === 'width' || name === 'height' || seen.has(name)) continue
      seen.add(name)
      kept.push(whole)
    }
    if (!seen.has('xmlns')) kept.unshift(`xmlns="${SVG_NS}"`)
    kept.push(`width="${IMAGE_SIZE.width}"`, `height="${IMAGE_SIZE.height}"`)
    return `<svg ${kept.join(' ')}${selfClose}>`
  })
}

// 순수: 안내문 SVG 글에서 테마 그림·글꼴 주소를 data: 주소로 바꾸고 width/height를 1588×2246으로 둔다
export function svgForImage(svg: string, assets: { theme: string; bold: Uint8Array; black: Uint8Array }): string {
  const theme = `data:image/svg+xml;base64,${base64(new TextEncoder().encode(assets.theme))}`
  const bold = `url(data:font/woff2;base64,${base64(assets.bold)})`
  const black = `url(data:font/woff2;base64,${base64(assets.black)})`
  return sizeRoot(svg)
    .replace(THEME_HREF, (_, attr: string, quote: string) => `${attr}${quote}${theme}${quote}`)
    .replace(fontUrl(FONT_URLS.bold), () => bold)
    .replace(fontUrl(FONT_URLS.black), () => black)
}

async function readText(url: string): Promise<string | null> {
  const res = await fetch(url)
  return res.ok ? res.text() : null
}
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

// 브라우저: 화면의 <svg>를 글로 → 자산을 읽어 svgForImage → Blob → Image → canvas(1588×2246) → PNG → <a download>.
// 어떤 실패든 false다(던지지 않고 로그를 남기지 않는다)
export async function downloadPosterPng(svg: SVGSVGElement, fileName: string): Promise<boolean> {
  try {
    const href = svg.querySelector('image')?.getAttribute('href') ?? ''
    const themePath = THEME_PATH.test(href) ? href : null
    if (!themePath) return false
    const [theme, bold, black] = await Promise.all([readText(themePath), readBytes(FONT_URLS.bold), readBytes(FONT_URLS.black)])
    if (theme === null || !bold || !black) return false
    const text = svgForImage(new XMLSerializer().serializeToString(svg), { theme, bold, black })
    if (text.includes('/poster/')) return false // 바깥 주소가 남으면 그림에 테마·글꼴이 빠진다
    const png = await drawPng(text)
    if (!png) return false
    saveFile(png, fileName)
    return true
  } catch {
    return false
  }
}
