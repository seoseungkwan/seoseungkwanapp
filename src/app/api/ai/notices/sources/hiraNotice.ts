import 'server-only'
import { isYmd } from '@/lib/analytics/dates'
import type { Attachment, ListItem, PostDetail } from '@/types/notices'
import { noticeNo } from '../noticeNo'
import { cutText, decodeEntities, htmlToText } from '../text'

// 심평원 공지 게시판 읽기(specs/notices REQ-7405, design 5절). 순수 함수만 둔다:
// 사이트는 fetchSite가 부르고, 여기는 받은 HTML 글자에서 목록 줄·본문·붙임만 꺼낸다.
// 사이트 모양이 바뀌어 못 읽는 줄은 버린다(목록이 0줄이면 모으기가 그 출처를 'shape'으로 멈춘다)

const ORIGIN = 'https://www.hira.or.kr'
const BOARD = `${ORIGIN}/bbsDummy.do?pgmid=HIRAA020002000100`
const DOWNLOAD = `${ORIGIN}/bbs/bbsCDownLoad.do`

// DB 한도(design 3절 notice_posts): 제목 1~300자 · 붙임 10개 · 붙임 이름 1~200자
const TITLE_MAX = 300
const ATTACH_MAX = 10
const NAME_MAX = 200

/** 목록 n쪽 주소(쪽 번호는 1 이상 정수로 맞춘다) */
export function hiraNoticeListUrl(page: number): string {
  const n = Number.isFinite(page) ? Math.max(1, Math.trunc(page)) : 1
  return `${BOARD}&pageIndex=${n}`
}

// ── HTML 조각 ────────────────────────────────────────────

// 주석·<script>·<style> 안 글은 표·칸으로 읽지 않는다(본문의 hwpjson 주석에 태그 모양 글이 있다)
const NOISE = /<!--[\s\S]*?(?:-->|$)|<(script|style)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi

function innerOf(html: string, tag: string): string[] {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}\\s*>`, 'gi')
  return [...html.matchAll(re)].map((m) => m[1])
}

function attr(attrs: string, name: string): string | null {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(attrs)
  return m === null ? null : decodeEntities(m[1] ?? m[2] ?? m[3])
}

const oneLine = (html: string) => htmlToText(html).replace(/\n/g, ' ')

// class에 그 이름이 있는 첫 <div>의 안쪽(안에 든 <div>까지 짝을 맞춘다). 닫히지 않으면 끝까지
function divInner(html: string, cls: string): string | null {
  for (const open of html.matchAll(/<div\b([^>]*)>/gi)) {
    const classes = (attr(open[1], 'class') ?? '').split(/\s+/)
    if (!classes.includes(cls)) continue
    const start = open.index + open[0].length
    const tags = /<(\/?)div\b[^>]*>/gi
    tags.lastIndex = start
    let depth = 1
    for (let t = tags.exec(html); t !== null; t = tags.exec(html)) {
      depth += t[1] === '/' ? -1 : 1
      if (depth === 0) return html.slice(start, t.index)
    }
    return html.slice(start)
  }
  return null
}

// ── 목록 ────────────────────────────────────────────────

const NEW_MARK = /<(i|span|em)\b[^>]*icon-new[^>]*>[\s\S]*?<\/\1\s*>/gi
const KEY = /[?&]brdBltNo=(\d{1,20})(?!\d)/
const DATE = /^(\d{4})([-./])(\d{2})\2(\d{2})$/

// 줄 안에서 글 번호(brdBltNo)가 든 첫 링크
function titleLink(tr: string): { key: string; html: string } | null {
  for (const a of tr.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)) {
    const key = KEY.exec(attr(a[1], 'href') ?? '')?.[1]
    if (key !== undefined) return { key, html: a[2] }
  }
  return null
}

// 글자가 날짜 하나뿐인 첫 칸(작성일 칸)
function rowDate(tr: string): string | null {
  for (const td of innerOf(tr, 'td')) {
    const m = DATE.exec(oneLine(td))
    const ymd = m === null ? '' : `${m[1]}-${m[3]}-${m[4]}`
    if (isYmd(ymd)) return ymd
  }
  return null
}

function listRow(tr: string): ListItem | null {
  const link = titleLink(tr)
  const postedOn = rowDate(tr)
  if (link === null || postedOn === null) return null
  const title = cutText(oneLine(link.html.replace(NEW_MARK, '')), TITLE_MAX)
  if (title === '') return null
  return {
    source: 'hira_notice',
    key: link.key,
    title,
    url: `${BOARD}&brdScnBltNo=4&brdBltNo=${link.key}`,
    postedOn,
    // 복지부 고시 번호가 제목에 있으면 gosi(판정은 noticeNo 한 곳, design 7절). 다른 기관 고시는 번호가 겹쳐 보지 않는다
    kind: noticeNo(title) !== null ? 'gosi' : 'notice',
    numberText: title,
    body: null,
  }
}

/** 목록 쪽 → 줄들(쪽 차례, 같은 key는 한 번). 표가 없거나 HTML이 아니면 빈 목록 */
export function parseHiraNoticeList(html: string): ListItem[] {
  const items: ListItem[] = []
  const seen = new Set<string>()
  for (const tbody of innerOf(html.replace(NOISE, ''), 'tbody')) {
    for (const tr of innerOf(tbody, 'tr')) {
      const item = listRow(tr)
      if (item === null || seen.has(item.key)) continue
      seen.add(item.key)
      items.push(item)
    }
  }
  return items
}

// ── 글 ──────────────────────────────────────────────────

// 붙임 칸 <li>의 downLoadBbs('붙임','글','게시판','묶음') — 값은 숫자만 주소에 넣는다
const DOWN_CALL = /downLoadBbs\s*\(([^)]*)\)/
const SR_ONLY = /<(span|em|i)\b[^>]*obj-sr-only[^>]*>[\s\S]*?<\/\1\s*>/gi

function downloadUrl(li: string): string | null {
  const call = DOWN_CALL.exec(decodeEntities(li))
  if (call === null) return null
  const args = call[1].split(',').map((a) => a.trim().replace(/^(['"])(.*)\1$/, '$2'))
  if (args.length !== 4 || !args.every((a) => /^\d{1,20}$/.test(a))) return null
  const [apndNo, apndBrdBltNo, apndBrdTyNo, apndBltNo] = args
  return `${DOWNLOAD}?apndNo=${apndNo}&apndBrdBltNo=${apndBrdBltNo}&apndBrdTyNo=${apndBrdTyNo}&apndBltNo=${apndBltNo}`
}

function attachmentsOf(page: string): Attachment[] {
  const list: Attachment[] = []
  for (const li of innerOf(page, 'li')) {
    const url = downloadUrl(li)
    if (url === null || list.some((a) => a.url === url)) continue
    // 이름 = 내려받기 단추·화면 읽기용 글(pdf 등)을 뺀 나머지 글
    const name = cutText(oneLine(li.replace(/<a\b[\s\S]*?<\/a\s*>/gi, '').replace(SR_ONLY, '')), NAME_MAX)
    list.push({ name: name === '' ? `첨부파일 ${list.length + 1}` : name, url })
    if (list.length === ATTACH_MAX) break
  }
  return list
}

/** 글 쪽 → 본문(.view 안 글자)과 붙임(이름·내려받기 주소, 10개까지). 칸이 없으면 빈 본문·빈 붙임 */
export function parseHiraNoticeView(html: string): PostDetail {
  const page = html.replace(NOISE, '')
  const view = divInner(page, 'view')
  return { body: view === null ? '' : htmlToText(view), attachments: attachmentsOf(page) }
}
