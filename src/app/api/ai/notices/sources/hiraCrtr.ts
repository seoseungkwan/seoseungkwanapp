import 'server-only'
import { isYmd } from '@/lib/analytics/dates'
import type { CrtrTab, ListItem, NoticeKind, PostDetail, SiteRequest } from '@/types/notices'
import { cutText, decodeEntities, htmlToText } from '../text'

// 심평원 보험인정기준(고시·행정해석·심사지침·공개사례 탭) 읽기(specs/notices REQ-7406, design 5절). 순수 함수만 둔다:
// 사이트는 fetchSite가 부르고, 여기는 부를 모양(목록 POST 몸통)을 만들고 받은 HTML 글자에서 목록 줄·팝업 본문만 꺼낸다.
// 목록은 POST로만 탭을 고른다(GET은 tabGbn을 무시하고 고시 탭을 준다, 2026-11-21 실측. 2026-11-22 점검 뒤로는 POST도 decIteTpCd가 있어야 탭을 바꾼다). 한 고시가 여러 줄로 오므로
// numberText에 관련근거를 앞세워 고시 번호로 묶게 한다(묶기는 noticeNo.ts). 못 읽는 줄은 버린다(0줄이면 모으기가 'shape')

const ORIGIN = 'https://www.hira.or.kr'
const BASE = `${ORIGIN}/rc/insu/insuadtcrtr`
/** 목록 주소(fetchSite가 POST + 몸통 tabGbn·pageIndex만 받는다) */
export const CRTR_LIST_URL = `${BASE}/InsuAdtCrtrList.do?pgmid=HIRAA030069000410`
const POPUP = `${BASE}/InsuAdtCrtrPopup.do`

/** 읽는 탭: 고시 · 행정해석 · 심사지침 · 공개사례 */
export const CRTR_TABS: readonly CrtrTab[] = ['01', '02', '09', '10']
const KIND: Readonly<Record<CrtrTab, NoticeKind>> = { '01': 'gosi', '02': 'interp', '09': 'guide', '10': 'case' }

// DB 한도(design 3절 notice_posts): 제목 1~300자. 관련근거는 묶음 열쇠·찾는 글에만 쓰여 같은 길이로 자른다
const TITLE_MAX = 300
const REF_MAX = 300

/** 목록 n쪽 POST 몸통(두 탭 칸에 같은 탭, 쪽 번호는 1 이상 정수로 맞춘다) */
export function crtrListBody(tab: CrtrTab, page: number): string {
  const n = Number.isFinite(page) ? Math.max(1, Math.trunc(page)) : 1
  return `tabGbn=${tab}&decIteTpCd=${tab}&pageIndex=${n}`
}

/** 목록 n쪽 부르기(fetchSite에 그대로 넘긴다) */
export function crtrListRequest(tab: CrtrTab, page: number): SiteRequest {
  return { url: CRTR_LIST_URL, method: 'POST', form: crtrListBody(tab, page), kind: 'page' }
}

// ── HTML 조각 ────────────────────────────────────────────

// 주석·<script>·<style> 안 글은 표·칸으로 읽지 않는다
const NOISE = /<!--[\s\S]*?(?:-->|$)|<(script|style)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi

function innerOf(html: string, tag: string): string[] {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}\\s*>`, 'gi')
  return [...html.matchAll(re)].map((m) => m[1])
}

function attr(attrs: string, name: string): string | null {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(attrs)
  return m === null ? null : decodeEntities(m[1] ?? m[2] ?? m[3])
}

const hasClass = (attrs: string, cls: string) => (attr(attrs, 'class') ?? '').split(/\s+/).includes(cls)
const oneLine = (html: string) => htmlToText(html).replace(/\n/g, ' ')

// class에 그 이름이 있는 첫 <div>의 안쪽(안에 든 <div>까지 짝을 맞춘다). 닫히지 않으면 끝까지
function divInner(html: string, cls: string): string | null {
  for (const open of html.matchAll(/<div\b([^>]*)>/gi)) {
    if (!hasClass(open[1], cls)) continue
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

// 그 class의 첫 <td> 안쪽
function cellOf(tr: string, cls: string): string | null {
  for (const m of tr.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td\s*>/gi)) {
    if (hasClass(m[1], cls)) return m[2]
  }
  return null
}

// ── 목록 ────────────────────────────────────────────────

// 제목 링크의 viewInsuAdtCrtr(no, 'mtgHmeDd', 'sno', 'mtgMtrRegSno', RN). 값은 fetchSite 팝업 길과 같은 숫자 모양만
const VIEW_CALL = /\bviewInsuAdtCrtr\s*\(([^)]*)\)/
const NUM = /^\d{1,20}$/
const DATE = /^(\d{4})([-./])(\d{2})\2(\d{2})$/

type PopupKey = { mtgHmeDd: string; sno: string; mtgMtrRegSno: string }

function popupKey(onclick: string): PopupKey | null {
  const call = VIEW_CALL.exec(onclick)
  if (call === null) return null
  const args = call[1].split(',').map((a) => a.trim().replace(/^(['"])(.*)\1$/, '$2'))
  if (args.length < 4) return null
  const [, mtgHmeDd, sno, mtgMtrRegSno] = args
  return [mtgHmeDd, sno, mtgMtrRegSno].every((a) => NUM.test(a)) ? { mtgHmeDd, sno, mtgMtrRegSno } : null
}

// 줄 안에서 팝업 부르기가 든 첫 링크
function titleLink(tr: string): { key: PopupKey; html: string } | null {
  for (const a of tr.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)) {
    const key = popupKey(attr(a[1], 'onclick') ?? '')
    if (key !== null) return { key, html: a[2] }
  }
  return null
}

function rowDate(tr: string): string | null {
  const m = DATE.exec(oneLine(cellOf(tr, 'col-date') ?? ''))
  const ymd = m === null ? '' : `${m[1]}-${m[3]}-${m[4]}`
  return isYmd(ymd) ? ymd : null
}

function listRow(tr: string, tab: CrtrTab): ListItem | null {
  const link = titleLink(tr)
  const postedOn = rowDate(tr)
  if (link === null || postedOn === null) return null
  const title = cutText(oneLine(link.html), TITLE_MAX)
  if (title === '') return null
  const ref = cutText(oneLine(cellOf(tr, 'col-num2') ?? ''), REF_MAX)
  const { mtgHmeDd, sno, mtgMtrRegSno } = link.key
  return {
    source: 'hira_crtr',
    key: `${mtgHmeDd}-${sno}-${mtgMtrRegSno}`,
    title,
    url: `${POPUP}?mtgHmeDd=${mtgHmeDd}&sno=${sno}&mtgMtrRegSno=${mtgMtrRegSno}`,
    postedOn,
    kind: KIND[tab],
    numberText: ref === '' ? title : `${ref} ${title}`,
    tab,
    ref,
    body: null,
  }
}

// 쪽이 스스로 말하는 탭(listForm의 decIteTpCd). 탭이 무시된 답은 이 값이 부른 탭과 다르다. 없으면 null
function declaredTab(page: string): string | null {
  for (const input of page.matchAll(/<input\b([^>]*)>/gi)) {
    if (attr(input[1], 'name') === 'decIteTpCd') return attr(input[1], 'value')
  }
  return null
}

/** 목록 쪽 → 줄들(쪽 차례, 같은 key는 한 번). 표가 없거나 HTML이 아니거나 다른 탭의 쪽이면 빈 목록 */
export function parseHiraCrtrList(html: string, tab: CrtrTab): ListItem[] {
  const page = html.replace(NOISE, '')
  const declared = declaredTab(page)
  if (declared !== null && declared !== tab) return []
  const items: ListItem[] = []
  const seen = new Set<string>()
  for (const tbody of innerOf(page, 'tbody')) {
    for (const tr of innerOf(tbody, 'tr')) {
      const item = listRow(tr, tab)
      if (item === null || seen.has(item.key)) continue
      seen.add(item.key)
      items.push(item)
    }
  }
  return items
}

// ── 팝업 ────────────────────────────────────────────────

/**
 * 팝업 쪽 → 본문(.viewCont 안 .view 글자: 고시 신설/개정 전체내용 ~ 변경 전 고시). 붙임은 받지 않는다
 * (본문에 전체 글이 있고, 팝업의 내려받기 길은 정해 둔 길이 아니다). 칸이 없으면 빈 본문
 */
export function parseHiraCrtrPopup(html: string): PostDetail {
  const cont = divInner(html.replace(NOISE, ''), 'viewCont')
  const view = cont === null ? null : divInner(cont, 'view')
  return { body: view === null ? '' : htmlToText(view), attachments: [] }
}
