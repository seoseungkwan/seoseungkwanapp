import 'server-only'
import { isYmd } from '@/lib/analytics/dates'
import { toStoredM2 } from '@/lib/location/area'
import type { Adapter, Parsed, SiteRequest } from '@/types/location'
import { isNotRegistered } from '../fetchSource'

// 실거래 읽는 곳(specs/location REQ-7904, design.md 4절): 국토교통부 아파트 매매 실거래가 상세 자료(15126468) ·
// 상업업무용 부동산 매매 실거래가 자료(15126463). 시군구 5자리 + 계약 연월로 거래 한 건씩 받는다(좌표 없음 —
// 범위 안 법정동 이름으로 거르기·㎡당 평균은 모으기(collect)가 한다). 답은 XML이다.
// 금액은 '만 원' 글자(앞 공백·쉼표 포함) → 원 정수(× 10,000), 넓이는 ㎡ 소수 2자리 버림(area.ts), 해제된 거래는 뺀다.
// 상업용 일반 건물은 지번이 일부만(1**·빈칸) 나오므로 지번 칸은 읽지 않는다(그 줄도 받는다).
// 기준 날짜: 답에 자료 기준일 칸이 없고 신고·해제가 계속 들어오는 자료라 받은 한국 날짜(today)다.
// 칸 이름·한 쪽 줄 수는 진짜 열쇠로 다시 본다(TASK-47)

/** 아파트는 5쪽, 상업업무용은 3쪽까지(design.md 4절 '쪽'). 쪽마다 TRADE_ROWS줄 */
export const APT_TRADE_PAGES = 5
export const BIZ_TRADE_PAGES = 3
export const TRADE_ROWS = 1000

/** 아파트 거래 한 건: 법정동 이름 · 전용 ㎡ · 원 · 층(빈칸이면 null, 지하는 음수) · 계약 날 */
export type AptTrade = { bdongName: string; m2: number; won: number; floor: number | null; on: string }
/** 상업업무용 거래 한 건: 법정동 이름 · 건물 주용도 · 건물 ㎡ · 원 */
export type BizTrade = { bdongName: string; usage: string; m2: number; won: number }
/** 한 달 거래 목록. capped = 정해 둔 쪽 수까지 받은 줄이 전체 수보다 적음 */
export type TradeList<T> = { deals: T[]; capped: boolean }

const BASE = 'https://apis.data.go.kr/1613000'
const APT_URL = `${BASE}/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev`
const BIZ_URL = `${BASE}/RTMSDataSvcNrgTrade/getRTMSDataSvcNrgTrade`

const WON_PER_MAN = 10_000
const MAN_WON = /^(?:\d{1,3}(?:,\d{3})*|\d+)$/
const DECIMAL = /^\d+(?:\.\d+)?$/
const FLOOR = /^(?:-?\d+)?$/
// 결과 코드: '00'·'000' = 됨, '03' = 자료 없음(빈 목록)
const OK_CODE = /^0+$/
const NO_DATA = '03'

const FAILED = { ok: false, code: 'failed' } as const
const NOT_APPLIED = { ok: false, code: 'not-applied' } as const

function pageRequests(url: string, q: { sgg: string; ym: string }, pages: number): SiteRequest[] {
  return Array.from({ length: pages }, (_, i) => {
    const params = new URLSearchParams({
      LAWD_CD: q.sgg,
      DEAL_YMD: q.ym.replace('-', ''),
      pageNo: String(i + 1),
      numOfRows: String(TRADE_ROWS),
    })
    return { url: `${url}?${params}` }
  })
}

// ── XML 읽기(이 답의 칸에는 글자·숫자만 있어 엔티티를 풀 것이 없다) ──

const ITEM = /<item(?:\s[^>]*)?>([\s\S]*?)<\/item\s*>/g
const RESPONSE = /<response(?:\s[^>]*)?>/
const BODY = /<body(?:\s[^>]*)?>/

/** 칸 하나의 글자(앞뒤 공백 뺌). 칸이 없으면 null, `<칸/>`은 '' */
function field(xml: string, name: string): string | null {
  const m = new RegExp(`<${name}(?:\\s[^>]*?)?(?:/>|>([\\s\\S]*?)</${name}\\s*>)`).exec(xml)
  return m === null ? null : (m[1] ?? '').trim()
}

type Page = { items: string[]; total: number } | 'not-applied' | 'failed'

function readPage(text: string): Page {
  if (isNotRegistered(text)) return 'not-applied'
  if (!RESPONSE.test(text)) return 'failed'
  const code = field(text, 'resultCode')
  if (code === NO_DATA) return { items: [], total: 0 }
  if (code === null || !OK_CODE.test(code)) return 'failed'
  const total = field(text, 'totalCount')
  if (!BODY.test(text) || total === null || !/^\d+$/.test(total)) return 'failed'
  return { items: Array.from(text.matchAll(ITEM), (m) => m[1]), total: Number(total) }
}

// ── 칸 값 ──

/** '만 원' 글자(쉼표 포함) → 원 정수. 모양이 다르면 null */
function wonOf(text: string | null): number | null {
  if (text === null || !MAN_WON.test(text)) return null
  const won = Number(text.replaceAll(',', '')) * WON_PER_MAN
  return Number.isSafeInteger(won) ? won : null
}

/** ㎡ 글자 → 소수 2자리 버림. 0·숫자 아님은 null */
function m2Of(text: string | null): number | null {
  return text !== null && DECIMAL.test(text) ? toStoredM2(Number(text), 'm2') : null
}

/** 계약 년·월·일 → 'YYYY-MM-DD'. 없는 날은 null */
function dayOf(y: string | null, m: string | null, d: string | null): string | null {
  if (y === null || m === null || d === null || !/^\d{4}$/.test(y) || !/^\d{1,2}$/.test(m) || !/^\d{1,2}$/.test(d)) return null
  const ymd = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  return isYmd(ymd) ? ymd : null
}

/** 해제 여부 칸이 'O'면 해제된 거래 */
const isCancelled = (item: string) => field(item, 'cdealType')?.toUpperCase() === 'O'

function aptRow(item: string): AptTrade | null {
  const bdongName = field(item, 'umdNm')
  const m2 = m2Of(field(item, 'excluUseAr'))
  const won = wonOf(field(item, 'dealAmount'))
  const on = dayOf(field(item, 'dealYear'), field(item, 'dealMonth'), field(item, 'dealDay'))
  const floor = field(item, 'floor') ?? ''
  if (!bdongName || m2 === null || won === null || on === null || !FLOOR.test(floor)) return null
  return { bdongName, m2, won, floor: floor === '' ? null : Number(floor), on }
}

function bizRow(item: string): BizTrade | null {
  const bdongName = field(item, 'umdNm')
  const m2 = m2Of(field(item, 'buildingAr'))
  const won = wonOf(field(item, 'dealAmount'))
  if (!bdongName || m2 === null || won === null) return null
  return { bdongName, usage: field(item, 'buildingUse') ?? '', m2, won }
}

// 요청 차례로 받은 쪽들을 한 목록으로. 쪽 하나라도 활용신청 안 됨이면 not-applied, 모양이 틀리면(해제 안 된 줄 하나라도) failed
function readPages<T>(texts: readonly string[], pages: number, row: (item: string) => T | null, today: string): Parsed<TradeList<T>> {
  if (texts.length !== pages) return FAILED
  const read = texts.map(readPage)
  if (read.includes('not-applied')) return NOT_APPLIED
  const deals: T[] = []
  let total = 0
  let received = 0
  for (const page of read) {
    if (page === 'failed' || page === 'not-applied') return FAILED
    total = Math.max(total, page.total)
    for (const item of page.items) {
      received += 1
      if (isCancelled(item)) continue
      const deal = row(item)
      if (deal === null) return FAILED
      deals.push(deal)
    }
  }
  return { ok: true, value: { deals, capped: received < total }, asOf: today }
}

export const aptTrade: Adapter<'apt-trade', TradeList<AptTrade>> = {
  kind: 'apt-trade',
  src: 'apt-trade',
  key: 'data',
  requests: (q) => pageRequests(APT_URL, q, APT_TRADE_PAGES),
  parse: (texts, _q, today) => readPages(texts, APT_TRADE_PAGES, aptRow, today),
}

export const bizTrade: Adapter<'biz-trade', TradeList<BizTrade>> = {
  kind: 'biz-trade',
  src: 'biz-trade',
  key: 'data',
  requests: (q) => pageRequests(BIZ_URL, q, BIZ_TRADE_PAGES),
  parse: (texts, _q, today) => readPages(texts, BIZ_TRADE_PAGES, bizRow, today),
}
