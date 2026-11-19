import { LOGO_MAX_SIDE } from '@/types/clinicProfile'
import { LOGO } from './layout'
import type { LogoBitmap } from './logoFit'

// 서식 탭 안내문 그림 파일(PNG) 만들기 — 휴진 안내(specs/forms design.md 7절 '그림 파일', AC-3506.2·3506.3; 로고는 specs/forms-logo 5절)와
// 환자 안내문(specs/forms-guide design.md 6절, AC-4509.2·4509.3).
// SVG를 그림(Image)으로 그리면 바깥 주소(/poster/…)를 읽지 않으므로, 테마 그림(휴진 안내만)·글꼴 두 개를 data: 주소로 넣은 SVG 글을 쓴다.
// 병원 로고는 병원 정보 로고나 서식 화면이 준비한 로고(둘 다 PNG data: 주소)라 그대로 둔다(spec clinic-profile AC-6604.3,
// spec logo-fit AC-6701.4). 로고 준비용 큰 그림 읽기·PNG 만들기도 여기 있다(readLogoBitmap·bitmapToPngUrl). 옛 로고 주소(/poster/logo.png)는 로고를 넘기지 않은
// 옛 부르기의 SVG에 남아 있을 때만 읽어 넣는다 — 서식 화면은 늘 병원 정보 로고를 넘기므로 읽지 않는다.
// 그림은 blob: 주소라 CSP(img-src 'self' data: blob:)를 바꾸지 않는다. 실패는 false — 화면이 E-FORMS-IMAGE-FAILED를 보인다

const SVG_NS = 'http://www.w3.org/2000/svg'
export const IMAGE_SIZE = { width: 1588, height: 2246 } as const // 시안(794×1123)의 2배
// 안내문 SVG(components/forms/Poster.tsx·GuidePoster.tsx)가 쓰는 주소
const FONT_URLS = { bold: '/poster/fonts/Pretendard-Bold.subset.woff2', black: '/poster/fonts/Pretendard-Black.subset.woff2' } as const
// 테마 그림 1(<열쇠>.svg)과 그림 2(<열쇠>-2.svg)만 (specs/forms-themes AC-4604.1)
const THEME_PATH = /^\/poster\/themes\/([a-z0-9]+(?:-2)?)\.svg$/
const THEME_HREF = /(\s(?:xlink:)?href=)(["'])\/poster\/themes\/[a-z0-9]+(?:-2)?\.svg\2/g
// 내 배경(AI 배경)은 첫 image가 이미 data: 주소라 읽지 않고 그대로 둔다(AC-4604.2)
const BACKGROUND_DATA = 'data:image/jpeg;base64,'
const PNG_REVOKE_MS = 10_000 // 내려받기가 시작된 뒤 PNG 주소를 거둔다

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
const LOGO_HREF = new RegExp(`(\\s(?:xlink:)?href=)(["'])${escapeRegExp(LOGO.href)}\\2`, 'g')
const fontUrl = (path: string) => new RegExp(`url\\(\\s*(["']?)${escapeRegExp(path)}\\1\\s*\\)`, 'g')

// 바이트 → base64 글. 내 배경 그림 data: 주소(lib/forms/backgroundImage)도 이것을 쓴다
export function base64(bytes: Uint8Array): string {
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

// 순수: 안내문 SVG 글에서 글꼴 주소(와 theme를 주면 테마 그림 주소, logo를 주면 옛 로고 주소)를 data: 주소로 바꾸고 width/height를 1588×2246으로 둔다.
// 환자 안내문은 테마 그림이 없어 theme를 주지 않는다 — 그때는 테마 주소를 건드리지 않는다(남으면 내려받기가 false로 막는다).
// 이미 data: 주소인 그림(병원 정보 로고·내 배경)은 그대로 둔다
export function svgForImage(svg: string, assets: { theme?: string; bold: Uint8Array; black: Uint8Array; logo?: Uint8Array }): string {
  const bold = `url(data:font/woff2;base64,${base64(assets.bold)})`
  const black = `url(data:font/woff2;base64,${base64(assets.black)})`
  let out = sizeRoot(svg)
  if (assets.theme !== undefined) {
    const theme = `data:image/svg+xml;base64,${base64(new TextEncoder().encode(assets.theme))}`
    out = out.replace(THEME_HREF, (_, attr: string, quote: string) => `${attr}${quote}${theme}${quote}`)
  }
  if (assets.logo !== undefined) {
    const logo = `data:image/png;base64,${base64(assets.logo)}`
    out = out.replace(LOGO_HREF, (_, attr: string, quote: string) => `${attr}${quote}${logo}${quote}`)
  }
  return out.replace(fontUrl(FONT_URLS.bold), () => bold).replace(fontUrl(FONT_URLS.black), () => black)
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

// ---------- 로고 그림의 점 읽기 (spec clinic-profile AC-6604.4, design.md 6절 · spec logo-fit design.md 3절) ----------

export const LOGO_SAMPLE_MAX = 64 // 색 뽑기 표본: 긴 변을 이 안으로 줄여 읽는다(키우지 않는다)
export const LOGO_READ_MAX = LOGO_MAX_SIDE // 로고 준비(흰 배경 지우기·자르기)용 큰 그림: 병원 정보 로고 한도(긴 변 1200)와 같다
const LOGO_DATA = 'data:image/png;base64,'
export type LogoPixels = { data: Uint8ClampedArray; width: number; height: number }

// 병원 정보 로고(PNG data: 주소)를 그림으로 읽어 긴 변 max 안으로 줄인(키우지 않는) canvas에서 점(RGBA)을 뽑는다.
// data: 주소라 fetch·바깥 읽기가 없다. PNG data: 주소가 아니거나 그림을 못 읽으면 null(던지지 않고 로그를 남기지 않는다)
async function readLogoAt(href: string, max: number): Promise<LogoPixels | null> {
  if (typeof href !== 'string' || !href.startsWith(LOGO_DATA)) return null
  try {
    const image = await loadImage(href)
    if (!image || image.naturalWidth <= 0 || image.naturalHeight <= 0) return null
    const scale = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight))
    const width = Math.max(1, Math.round(image.naturalWidth * scale))
    const height = Math.max(1, Math.round(image.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return null
    context.drawImage(image, 0, 0, width, height)
    return { data: context.getImageData(0, 0, width, height).data, width, height }
  } catch {
    return null
  }
}

// 색 뽑기 표본(긴 변 64 안, spec clinic-profile AC-6604.4)
export function readLogoPixels(href: string): Promise<LogoPixels | null> {
  return readLogoAt(href, LOGO_SAMPLE_MAX)
}

// 로고 준비용 큰 그림(긴 변 1200 안, spec logo-fit design.md 3절). 실패는 null → 서식이 원래 로고를 쓴다(AC-6702.2)
export function readLogoBitmap(href: string): Promise<LogoBitmap | null> {
  return readLogoAt(href, LOGO_READ_MAX)
}

// 준비한 로고 점(spec logo-fit AC-6701.4)을 같은 크기 canvas에 그대로 넣어 PNG data: 주소로 만든다. 저장·전송하지 않는다.
// 크기가 맞지 않거나 PNG 주소가 나오지 않으면 null(던지지 않고 로그를 남기지 않는다) → 서식이 원래 로고를 쓴다(AC-6702.2)
export function bitmapToPngUrl(px: LogoBitmap): string | null {
  try {
    const { data, width, height } = px
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || data.length !== width * height * 4) return null
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return null
    const image = context.createImageData(width, height)
    image.data.set(data)
    context.putImageData(image, 0, 0)
    const url = canvas.toDataURL('image/png')
    return typeof url === 'string' && url.startsWith(LOGO_DATA) ? url : null
  } catch {
    return null
  }
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

// 두 안내문이 같이 쓰는 안쪽 흐름: 화면의 <svg>를 글로 → 자산을 읽어 svgForImage → /poster/가 남았나 → Blob → Image →
// canvas(1588×2246) → PNG → <a download>. withTheme이면(휴진 안내) 첫 <image>의 테마 그림도 읽어 넣는다 —
// 첫 <image>가 내 배경(JPEG data: 주소)이면 테마를 읽지 않고 그대로 두고, 둘 다 아니면 false다.
// 어떤 실패든 false다(던지지 않고 로그를 남기지 않는다)
async function downloadPng(svg: SVGSVGElement, fileName: string, withTheme: boolean): Promise<boolean> {
  try {
    let themePath: string | null = null
    if (withTheme) {
      const href = svg.querySelector('image')?.getAttribute('href') ?? ''
      if (THEME_PATH.test(href)) themePath = href
      else if (!href.startsWith(BACKGROUND_DATA)) return false
    }
    const source = new XMLSerializer().serializeToString(svg)
    // 옛 로고 주소가 남은 SVG(로고를 넘기지 않은 옛 부르기)만 그 파일을 읽는다
    const oldLogo = new RegExp(LOGO_HREF.source).test(source)
    const [theme, bold, black, logo] = await Promise.all([
      themePath === null ? undefined : readText(themePath),
      readBytes(FONT_URLS.bold),
      readBytes(FONT_URLS.black),
      oldLogo ? readBytes(LOGO.href) : undefined,
    ])
    if (theme === null || !bold || !black || logo === null) return false
    const text = svgForImage(source, { theme, bold, black, logo })
    if (text.includes('/poster/')) return false // 바깥 주소가 남으면 그림에 테마·글꼴·로고가 빠진다
    const png = await drawPng(text)
    if (!png) return false
    saveFile(png, fileName)
    return true
  } catch {
    return false
  }
}

// 휴진 안내 그림 파일: 테마 그림·글꼴 둘을 읽는다(병원 정보 로고는 이미 SVG 안에 있다)
export function downloadPosterPng(svg: SVGSVGElement, fileName: string): Promise<boolean> {
  return downloadPng(svg, fileName, true)
}

// 환자 안내문 그림 파일(AC-4509.2): 글꼴 둘만 읽는다(테마 그림이 없다). 파일 이름은 guideFileName(환자안내문_<머리표>.png)
export function downloadGuidePng(svg: SVGSVGElement, fileName: string): Promise<boolean> {
  return downloadPng(svg, fileName, false)
}
