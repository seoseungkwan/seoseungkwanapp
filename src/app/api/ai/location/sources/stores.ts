import 'server-only'
import { monthRange } from '@/lib/analytics/dates'
import type { Adapter, Parsed, Point, QueryOf, SiteRequest } from '@/types/location'
import { isNotRegistered } from '../fetchSource'

// 상가(상권)정보 반경 안 가게(소상공인시장진흥공단 15012005, specs/location design.md 4절 'stores', TASK-21 · REQ-7904).
// 요청: 점·반경(30~2,000m)으로 100곳씩 10쪽(1,000곳까지). 답: 가게마다 이름·업종 대·중분류·층·점, 자료가 말한 전체 수, capped,
// 헬스장·필라테스 수(따로)와 약국 수. 층 칸이 비었거나 읽을 수 없으면 '층 모름'. 순수 함수만 — 부르기·로그·담아 두기 없음.
// 상가 공실률·임대료는 쓰지 않는다(사용자가 뺌, requirements 이 명세가 정한 것 9). 층 칸이 얼마나 채워졌는지는 확인할 것 4

export const STORES_URL = 'https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInRadius'
export const STORES_PAGE_ROWS = 100
export const STORES_PAGES = 10
/** 한 번에 돌려주는 가게 수 한도(= 쪽마다 100곳 × 10쪽). 넘으면 capped */
export const STORES_MAX = STORES_PAGE_ROWS * STORES_PAGES
export const FLOOR_UNKNOWN = '층 모름'

// 따로 세는 업종(중·소분류 이름에 든 낱말). 업종 코드는 2023년 개편처럼 바뀔 수 있어 이름으로 고른다 — 한 곳
const GYM_WORDS = ['헬스', '체력단련']
const PILATES_WORDS = ['필라테스']
const PHARMACY_WORDS = ['약국']

/** 가게 하나: 이름(지점 이름 붙임) · 업종 대분류 · 중분류 · 층(건물 층 이름 모양) · 점 */
export type Store = { name: string; big: string; mid: string; floor: string; at: Point }
export type StoresValue = {
  stores: Store[] // 1,000곳까지, 받은 차례
  total: number // 자료가 말한 범위 안 가게 수
  capped: boolean
  fitness: { gym: number; pilates: number } // 받은 가게 가운데 헬스장(헬스클럽·체력단련)·필라테스
  pharmacies: number // 받은 가게 가운데 약국
}

const isPlain = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const textOf = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const round6 = (v: number) => Math.round(v * 1e6) / 1e6
const has = (text: string, words: readonly string[]) => words.some((w) => text.includes(w))

/**
 * 층 칸 → 건물 층 이름 모양(지1·1·옥탑, 건축물대장 층별개요와 견주려고). 비었거나 읽을 수 없으면 '층 모름'.
 * '2층'·'12F' → 2·12 · 'B1'·'지하1'·'지하 2층' → 지1·지2 · '옥탑'·'옥상' → 옥탑 · 0·소수·범위('1~2')는 읽지 않는다
 */
export function storeFloor(raw: unknown): string {
  const text = typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw.replace(/\s+/g, '').toUpperCase() : ''
  if (/^(?:옥탑|옥상)(?:층)?$/.test(text)) return '옥탑'
  const below = /^(?:지하|지|B)(\d{1,2})(?:층|F)?$/.exec(text)
  if (below && Number(below[1]) >= 1) return `지${Number(below[1])}`
  const above = /^(\d{1,3})(?:층|F)?$/.exec(text)
  if (above && Number(above[1]) >= 1) return String(Number(above[1]))
  return FLOOR_UNKNOWN
}

// 좌표 칸(수 또는 수 글자) → 한국 범위 안이면 소수 6자리, 아니면 null(그 가게는 뺀다)
function coordOf(v: unknown, min: number, max: number): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : Number.NaN
  return Number.isFinite(n) && n >= min && n <= max ? round6(n) : null
}

const countOf = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v) : Number.NaN
  return Number.isInteger(n) && n >= 0 ? n : null
}

// 기준 연월 'YYYYMM' → 그 달 말일. 없거나 틀리면 null
function asOfMonth(v: unknown): string | null {
  const m = /^(20\d\d)(0[1-9]|1[0-2])$/.exec(textOf(v))
  return m ? monthRange(`${m[1]}-${m[2]}`).to : null
}

type Row = { id: string; store: Store; kinds: string }
type Page = { rows: Row[]; total: number; asOf: string | null }

// 쪽 하나 읽기. 결과 번호 00 = 정상, 03 = 자료 없음(빈 쪽, 실패 아님). 그 밖·모양 틀림은 null
function readPage(text: string): Page | null {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return null
  }
  if (!isPlain(json) || !isPlain(json.header)) return null
  const code = textOf(json.header.resultCode)
  const asOf = asOfMonth(json.header.stdrYm)
  if (code === '03') return { rows: [], total: 0, asOf }
  if (code !== '00' || !isPlain(json.body)) return null
  const items = json.body.items ?? []
  const total = countOf(json.body.totalCount)
  if (!Array.isArray(items) || total === null) return null

  const rows: Row[] = []
  for (const item of items) {
    if (!isPlain(item)) return null
    const lat = coordOf(item.lat, 33, 39)
    const lng = coordOf(item.lon, 124, 132)
    if (lat === null || lng === null) continue
    const name = [textOf(item.bizesNm), textOf(item.brchNm)].filter((s) => s !== '').join(' ')
    const mid = textOf(item.indsMclsNm)
    rows.push({
      id: textOf(item.bizesId),
      store: { name, big: textOf(item.indsLclsNm), mid, floor: storeFloor(item.flrNo), at: { lat, lng } },
      kinds: `${mid} ${textOf(item.indsSclsNm)}`,
    })
  }
  return { rows, total, asOf }
}

export const storesAdapter: Adapter<'stores', StoresValue> = {
  kind: 'stores',
  src: 'stores',
  key: 'data',

  requests(q: QueryOf<'stores'>): SiteRequest[] {
    return Array.from({ length: STORES_PAGES }, (_, i) => {
      const params = new URLSearchParams({
        radius: String(q.r),
        cx: String(q.at.lng),
        cy: String(q.at.lat),
        numOfRows: String(STORES_PAGE_ROWS),
        pageNo: String(i + 1),
        type: 'json',
      })
      return { url: `${STORES_URL}?${params}` }
    })
  },

  parse(texts: string[], _q: QueryOf<'stores'>, today: string): Parsed<StoresValue> {
    if (texts.length === 0) return { ok: false, code: 'failed' }
    if (texts.some(isNotRegistered)) return { ok: false, code: 'not-applied' }

    const seen: Record<string, true> = Object.create(null) as Record<string, true>
    const rows: Row[] = []
    let total = 0
    let asOf: string | null = null
    for (const text of texts) {
      const page = readPage(text)
      if (page === null) return { ok: false, code: 'failed' }
      total = Math.max(total, page.total)
      asOf ??= page.asOf
      for (const row of page.rows) {
        // 쪽 사이에 자료가 바뀌면 같은 가게가 두 쪽에 올 수 있다 — 가게 번호로 한 번만
        if (row.id !== '' && seen[row.id]) continue
        if (row.id !== '') seen[row.id] = true
        rows.push(row)
      }
    }

    const kept = rows.slice(0, STORES_MAX)
    return {
      ok: true,
      asOf: asOf ?? today,
      value: {
        stores: kept.map((r) => r.store),
        total,
        capped: total > STORES_MAX || rows.length > STORES_MAX,
        fitness: {
          gym: kept.filter((r) => has(r.kinds, GYM_WORDS)).length,
          pilates: kept.filter((r) => has(r.kinds, PILATES_WORDS)).length,
        },
        pharmacies: kept.filter((r) => has(r.kinds, PHARMACY_WORDS)).length,
      },
    }
  },
}
