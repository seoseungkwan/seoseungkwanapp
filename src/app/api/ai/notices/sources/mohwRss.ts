import 'server-only'
import { todayInKorea } from '@/lib/analytics/dates'
import type { ListItem } from '@/types/notices'
import { cutText, decodeEntities, htmlToText } from '../text'

// 보건복지부 훈령/고시 RSS 읽기(specs/notices REQ-7407, design 5절). 순수 함수만 둔다.
// robots.txt가 board.es 쪽(글·붙임)을 막아 RSS 글만 쓴다. 글 주소(link)는 사람이 누르는 원문 링크로만 담고
// 서버는 부르지 않는다(fetchSite도 그 길을 'blocked-url'로 막는다). 그래서 body는 늘 글자다(null 아님) —
// 모으기가 글 쪽을 읽으러 가지 않는다. 담당자 이름(author)은 담지 않는다

/** 모으기가 부르는 RSS 주소(fetchSite의 정해 둔 길 `rss/board.es` 그대로) */
export const MOHW_RSS_URL = 'https://www.mohw.go.kr/rss/board.es?mid=a10409020000&bid=0026'

const TITLE_MAX = 300 // notice_posts.title 1~300자
const NUMBER_BODY = 200 // 고시 번호를 찾는 글 = 제목 + 설명 앞 200자(design 5절)
const URL_MAX = 500 // notice_posts.url ≤ 500자
// notice_posts.url 제약(https://www.mohw.go.kr/로 시작)에 맞고 빈칸·따옴표·꺾쇠가 없는 주소만
const LINK = /^https:\/\/www\.mohw\.go\.kr\/[^\s"'<>\\]*$/
const KEY = /^\d{1,20}$/

// CDATA와 주석은 문서 차례대로 하나씩 본다: CDATA는 자리표로 바꿔 두고(안의 </item> 같은 글이 줄을 나누지 않게) 주석은 지운다.
// 자리표는 사용자 영역 글자 둘(U+E000·U+E001)이고, 원래 글에 있던 그 글자는 먼저 뺀다
const CDATA_OR_COMMENT = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?(?:-->|$)/g
const HOLE = /(\d+)/g
const MARKS = /[]/g
const ITEM = /<item(?:\s[^>]*)?>([\s\S]*?)<\/item\s*>/g

type Doc = { xml: string; cdata: string[] }

function protect(text: string): Doc {
  const cdata: string[] = []
  const xml = text.replace(MARKS, '').replace(CDATA_OR_COMMENT, (_whole: string, inner: string | undefined) => {
    if (inner === undefined) return ''
    cdata.push(inner)
    return `${cdata.length - 1}`
  })
  return { xml, cdata }
}

// 칸 글자: CDATA 안은 그대로, 밖은 XML 실체를 한 번 푼다
function xmlText(raw: string, cdata: string[]): string {
  let out = ''
  let last = 0
  for (const m of raw.matchAll(HOLE)) {
    out += decodeEntities(raw.slice(last, m.index)) + (cdata[Number(m[1])] ?? '')
    last = m.index + m[0].length
  }
  return out + decodeEntities(raw.slice(last))
}

// 자식 칸 하나(처음 것). 없으면 null, <x/>는 빈 글자
function field(item: string, name: string, cdata: string[]): string | null {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?(?:/>|>([\\s\\S]*?)</${name}\\s*>)`).exec(item)
  if (!m) return null
  return xmlText(m[1] ?? '', cdata)
}

// pubDate(RFC 822, 예: 'Fri, 20 Nov 2026 11:05:00 GMT') → 한국 날짜. 모양이 다르거나 없는 날·시각이면 null
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const RFC822 = /^(?:[A-Za-z]{3},\s*)?(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(GMT|UTC?|Z|KST|[+-]\d{4})$/i

function zoneMinutes(zone: string): number {
  const z = zone.toUpperCase()
  if (z === 'KST') return 9 * 60
  if (!/^[+-]/.test(z)) return 0
  const minutes = Number(z.slice(1, 3)) * 60 + Number(z.slice(3, 5))
  return z.startsWith('-') ? -minutes : minutes
}

function koreaDateOf(pubDate: string): string | null {
  const m = RFC822.exec(pubDate.trim())
  if (!m) return null
  const [day, month, year] = [Number(m[1]), MONTHS.indexOf(m[2].toLowerCase()), Number(m[3])]
  const [hour, minute, second] = [Number(m[4]), Number(m[5]), Number(m[6] ?? '0')]
  if (month < 0 || hour > 23 || minute > 59 || second > 59) return null
  const date = new Date(Date.UTC(year, month, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) return null
  return todayInKorea(new Date(Date.UTC(year, month, day, hour, minute, second) - zoneMinutes(m[7]) * 60_000))
}

// 고시 번호가 있는지(종류 gosi). TASK-8 `noticeNo`와 같은 규칙(design 7절)이다 — 같은 Phase라 그 파일을 쓰지 못해 여기 둔다.
// '고시' 앞 15자에 다른 기관 이름이 있으면 그 맞춤은 버리고 다음 것을 본다
const GOSI_NO = /(?:^|[^가-힣])(?:보건복지부\s*)?고시\s*제?\s*(\d{4})\s*-\s*(\d{1,4})\s*호/g
const OTHER_AGENCY = /질병관리청|식품의약품안전처|식약처|국토교통부|고용노동부|행정안전부|교육부/

function hasGosiNo(text: string): boolean {
  for (const m of text.matchAll(GOSI_NO)) {
    const at = m.index + m[0].indexOf('고시')
    if (!OTHER_AGENCY.test(text.slice(Math.max(0, at - 15), at))) return true
  }
  return false
}

// link → key(list_no). 복지부 https 주소이고 list_no가 숫자 하나일 때만
function keyOf(link: string): string | null {
  if (link.length > URL_MAX || !LINK.test(link)) return null
  let url: URL
  try {
    url = new URL(link)
  } catch {
    return null
  }
  if (url.hostname !== 'www.mohw.go.kr') return null
  const keys = url.searchParams.getAll('list_no')
  return keys.length === 1 && KEY.test(keys[0]) ? keys[0] : null
}

/**
 * RSS 글 → 목록 줄(design 5절). item마다 key = link의 list_no, 제목은 CDATA 안 글, 날짜는 pubDate의 한국 날짜,
 * 본문은 description 글자(실체 풂), 주소는 link 그대로, 종류는 고시 번호가 있으면 gosi 아니면 notice.
 * RSS가 아니거나 item이 없으면 빈 목록. key·제목·날짜·주소가 틀린 item과 같은 key의 두 번째 item은 버린다
 */
export function parseMohwRss(text: string): ListItem[] {
  const { xml, cdata } = protect(text)
  if (!/<rss[\s>]/.test(xml) || !/<channel[\s>]/.test(xml)) return []
  const rows: ListItem[] = []
  const seen = new Set<string>()
  for (const [, item] of xml.matchAll(ITEM)) {
    const link = (field(item, 'link', cdata) ?? '').trim()
    const key = keyOf(link)
    const title = cutText(htmlToText(field(item, 'title', cdata) ?? ''), TITLE_MAX)
    const postedOn = koreaDateOf(field(item, 'pubDate', cdata) ?? '')
    if (key === null || title === '' || postedOn === null || seen.has(key)) continue
    seen.add(key)
    const body = htmlToText(field(item, 'description', cdata) ?? '')
    const numberText = body === '' ? title : `${title}\n${cutText(body, NUMBER_BODY)}`
    rows.push({
      source: 'mohw_rss',
      key,
      title,
      url: link,
      postedOn,
      kind: hasGosiNo(numberText) ? 'gosi' : 'notice',
      numberText,
      body,
    })
  }
  return rows
}
