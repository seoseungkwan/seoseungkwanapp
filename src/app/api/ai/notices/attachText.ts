import 'server-only'
import { unzipSync } from 'fflate'
import { extractText, getDocumentProxy } from 'unpdf'
import type { Reading } from '@/types/notices'
import { cutText, decodeEntities } from './text'

// 붙임 파일 글자 꺼내기와 읽기 계획(specs/notices REQ-7408, design 6절). 새 패키지 unpdf·fflate는 이 파일만 쓴다.
// 받은 파일은 저장하지 않는다. 글자·base64는 요약 요청과 찾기용 attach_text에만 간다(이 파일은 console을 쓰지 않는다)

export type FileKind = 'pdf' | 'hwpx' | 'hwp' | 'other'
/** 한 묶음에서 받은 붙임 하나(name은 게시판의 붙임 이름) */
export type GotFile = { name: string; bytes: Uint8Array }

const HWPX_MAX_ENTRIES = 500
const HWPX_MAX_UNZIPPED = 30_000_000
const PICK_MAX = 3
// base64로 4/3 늘어도 요청 32MB 안(design 6절)
const FULL_MAX_BYTES = 18_000_000
const FULL_MAX_PAGES = 30
const SEND_TEXT_MAX = 60_000
const SEARCH_TEXT_MAX = 20_000
const SECTION = /^Contents\/section(\d+)\.xml$/

const startsWith = (bytes: Uint8Array, head: number[]) => head.every((b, i) => bytes[i] === b)

class ZipStop extends Error {}
type ZipEntry = { name: string; size: number }

/**
 * zip 목록만 앞에서부터 읽는다(풀지 않는다). limit개를 넘으면 거기서 멈추고 more = true
 * (가짜 항목 수로 오래 돌지 않게). zip으로 읽지 못하면 null
 */
function listZip(bytes: Uint8Array, limit: number): { entries: ZipEntry[]; more: boolean } | null {
  const entries: ZipEntry[] = []
  let more = false
  try {
    unzipSync(bytes, {
      filter: (f) => {
        if (entries.length >= limit) {
          more = true
          throw new ZipStop()
        }
        entries.push({ name: f.name, size: f.originalSize })
        return false
      },
    })
  } catch (e) {
    if (!(e instanceof ZipStop)) return null
  }
  return { entries, more }
}

/** 파일 종류를 머리 바이트로 본다. HWPX는 zip 목록에 Contents/section0.xml이 있어야 한다 */
export function sniffFile(bytes: Uint8Array): FileKind {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return 'pdf'
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0])) return 'hwp'
  if (startsWith(bytes, [0x50, 0x4b])) {
    const zip = listZip(bytes, HWPX_MAX_ENTRIES)
    if (zip?.entries.some((e) => e.name === 'Contents/section0.xml')) return 'hwpx'
  }
  return 'other'
}

// DB 글자 칸(Postgres text)은 NUL을 담지 못하고 다른 제어 문자도 쓸모가 없다 → 줄바꿈·탭 밖 제어 문자를 뺀다
function dropControls(s: string): string {
  return s.replace(/\r\n?/g, '\n').replace(/\p{Cc}/gu, (ch) => (ch === '\n' || ch === '\t' ? ch : ''))
}

// <hp:t/>(빈 글) · <hp:t …> · </hp:t> · </hp:p> · 글 안 탭·줄바꿈 · 그 밖 태그 · 글자
const HWPX_TOKEN =
  /(<hp:t\b[^>]*?\/>)|(<hp:t\b[^>]*>)|(<\/hp:t\s*>)|(<\/hp:p\s*>)|(<hp:tab\b[^>]*>)|(<hp:lineBreak\b[^>]*>)|<[^>]*>|([^<]+)/g

/** 구역 XML 하나 → 줄들. <hp:t> 안 글자만, 문단 끝(</hp:p>)마다 줄을 바꾸고 빈 줄은 뺀다 */
function sectionLines(xml: string): string[] {
  const lines: string[] = []
  let line = ''
  let inText = false
  for (const m of xml.matchAll(HWPX_TOKEN)) {
    const [, emptyT, openT, closeT, closeP, tab, lineBreak, text] = m
    if (emptyT !== undefined) continue
    if (openT !== undefined) inText = true
    else if (closeT !== undefined) inText = false
    else if (closeP !== undefined || (inText && lineBreak !== undefined)) {
      lines.push(line)
      line = ''
    } else if (inText && tab !== undefined) line += ' '
    else if (inText && text !== undefined) line += decodeEntities(text)
  }
  lines.push(line)
  return lines.map((l) => dropControls(l).replace(/\s+/g, ' ').trim()).filter((l) => l !== '')
}

/**
 * HWPX → 글자. section 번호 차례로 <hp:t> 글자를 문단마다 줄을 바꿔 잇는다.
 * 풀기 전에 목록을 보고 항목이 500개를 넘거나 풀린 크기 합이 30,000,000바이트를 넘으면 null(zip 폭탄 막기).
 * zip이 아니거나 구역이 없어도 null
 */
export function hwpxText(bytes: Uint8Array): string | null {
  const zip = listZip(bytes, HWPX_MAX_ENTRIES)
  if (!zip || zip.more) return null
  if (zip.entries.reduce((sum, e) => sum + e.size, 0) > HWPX_MAX_UNZIPPED) return null
  const sections = zip.entries
    .flatMap((e) => {
      const m = SECTION.exec(e.name)
      return m ? [{ name: e.name, n: Number(m[1]) }] : []
    })
    .sort((a, b) => a.n - b.n)
  if (sections.length === 0) return null
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes, { filter: (f) => SECTION.test(f.name) })
  } catch {
    return null
  }
  const decoder = new TextDecoder('utf-8')
  return sections.flatMap((s) => sectionLines(decoder.decode(files[s.name] ?? new Uint8Array(0)))).join('\n')
}

/** PDF → { 글자(쪽 차례), 쪽 수 }. 깨졌거나 쪽이 없으면 null. 받은 바이트는 그대로 둔다(pdf.js에는 사본을 준다) */
export async function pdfText(bytes: Uint8Array): Promise<{ text: string; pages: number } | null> {
  if (bytes.length === 0) return null
  try {
    const pdf = await getDocumentProxy(bytes.slice(), { verbosity: 0, disableFontFace: true, useSystemFonts: false })
    try {
      const { totalPages, text } = await extractText(pdf, { mergePages: true })
      if (totalPages < 1) return null
      return { text: dropControls(text).trim(), pages: totalPages }
    } finally {
      await pdf.loadingTask.destroy()
    }
  } catch {
    return null
  }
}

type Picked = { name: string; kind: 'pdf' | 'hwpx'; bytes: Uint8Array; text: string; pages: number }

/** 앞에서부터 글자 합 max자까지 담는다(넘는 글은 자르고, 빈 글은 뺀다) */
function capTexts(items: Picked[], max: number): { name: string; text: string }[] {
  const out: { name: string; text: string }[] = []
  let left = max
  for (const item of items) {
    if (left <= 0) break
    if (item.text === '') continue
    const text = cutText(item.text, left)
    if (text === '') break
    out.push({ name: item.name, text })
    left -= text.length
  }
  return out
}

const bodyOnly = (): Reading => ({ mode: 'body', pdfs: [], texts: [], attachText: '' })

/**
 * 한 묶음의 받은 붙임 → 요약에 보낼 것(design 6절).
 * PDF 먼저·그다음 HWPX를 받은 차례대로 읽어 읽힌 것 3개까지 고른다(HWP·other·깨진 파일은 건너뜀).
 * 고른 PDF가 합 18,000,000바이트·30쪽 이하이면 full(PDF는 파일째, HWPX는 글자), 넘으면 text(모두 뽑은 글자).
 * 보내는 글자는 합 60,000자까지. 보낼 것이 하나도 없으면 body.
 * attachText(찾기용)는 고른 붙임의 '[이름]\n글자'를 이은 20,000자까지
 */
export async function planReading(files: GotFile[]): Promise<Reading> {
  const picked: Picked[] = []
  for (const kind of ['pdf', 'hwpx'] as const) {
    for (const file of files) {
      if (picked.length >= PICK_MAX) break
      if (sniffFile(file.bytes) !== kind) continue
      if (kind === 'pdf') {
        const got = await pdfText(file.bytes)
        if (got) picked.push({ name: file.name, kind, bytes: file.bytes, text: got.text, pages: got.pages })
      } else {
        const text = hwpxText(file.bytes)
        if (text !== null) picked.push({ name: file.name, kind, bytes: file.bytes, text, pages: 0 })
      }
    }
  }
  const pdfs = picked.filter((p) => p.kind === 'pdf')
  const full =
    pdfs.reduce((sum, p) => sum + p.bytes.length, 0) <= FULL_MAX_BYTES &&
    pdfs.reduce((sum, p) => sum + p.pages, 0) <= FULL_MAX_PAGES
  const sendPdfs = full ? pdfs : []
  const texts = capTexts(full ? picked.filter((p) => p.kind === 'hwpx') : picked, SEND_TEXT_MAX)
  if (sendPdfs.length === 0 && texts.length === 0) return bodyOnly()
  return {
    mode: full ? 'full' : 'text',
    pdfs: sendPdfs.map((p) => ({ name: p.name, base64: Buffer.from(p.bytes).toString('base64') })),
    texts,
    attachText: cutText(
      picked
        .filter((p) => p.text !== '')
        .map((p) => `[${p.name}]\n${p.text}`)
        .join('\n\n'),
      SEARCH_TEXT_MAX,
    ),
  }
}
