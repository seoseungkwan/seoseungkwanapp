import 'server-only'
import { distM } from '@/lib/location/coords'
import type { Adapter, Point, Rival } from '@/types/location'
import { isNotRegistered } from '../fetchSource'

// 바깥 자료 — 진료 시간(specs/location TASK-17, REQ-7904, design.md 4절 `hosp-hours`). 순수 함수만 둔다(부르기는 fetchSource).
// 국립중앙의료원 전국 병·의원 찾기 서비스(data.go.kr 15000736)의 목록 조회: 시도·시군구 이름 + 종별 → 그 시군구 병·의원.
// 의원마다 이름·점·요일 7칸 + 공휴일 [열·닫](0시부터 센 분). 답은 XML이다.
// TASK-47(2026-11-22 진짜 열쇠): 위치 조회(점 하나) 답에는 요일 칸(dutyTime1s~8c)이 없고 오늘 하루 startTime·endTime만 와서
// 요일 칸이 오는 목록 조회로 바꿨다(한 쪽 1,000줄까지, 종로구 의원 203곳). 시도 이름은 새 이름(전남광주통합특별시)으로 찾는다.
// 몸통은 시도·시군구 이름 둘뿐이다(동 경계 목록 이름, 모으기가 범위가 닿는 시군구마다 부름) — 점 하나로 부르던 위치 조회 길은 지웠다.
// TASK-55(2026-11-22 진짜 열쇠, 확인할 것 11): 치과의원 기관 구분 QZ=N이 된다(강남구 522곳) → 치과의원도 한 쪽 부른다.
// 진료과목 거르기 QD(D008 정형외과 · D009 신경외과 · D016 재활 · D017 마취통증)도 되지만 몸통에 과목 칸이 없어 쓰지 않는다
// (강남구 의원 C 2,128곳 — 3쪽 3,000줄 안)

/** 목록 조회 주소(공공데이터포털, 열쇠는 fetchSource가 serviceKey로 붙인다) */
export const HOURS_URL = 'https://apis.data.go.kr/B552657/HsptlAsembySearchService/getHsptlMdcncListInfoInqire'
/** 의원(C) 쪽 수와 쪽마다 줄 수(사이트 한도). 한의원(G)·치과의원(N)은 한 쪽 */
export const HOURS_PAGES = 3
export const HOURS_ROWS = 1000
const HOURS_PLAN = [
  { kind: 'C', pages: HOURS_PAGES },
  { kind: 'G', pages: 1 },
  { kind: 'N', pages: 1 },
] as const
/** 심평원 의원 목록과 같은 의원으로 보는 거리(m, 이 값까지) */
export const MATCH_M = 50

/** 월~일 + 공휴일 8칸, 칸마다 [여는 분, 닫는 분] 또는 null(그날 닫음·시각을 못 읽음) */
export type Week = NonNullable<NonNullable<Rival['detail']>['week']>
/** 의원 하나의 진료 시간. week가 null이면 진료 시간 자료가 없다(요일 칸이 모두 빔) */
export type ClinicHours = { name: string; at: Point; week: Week | null }

// ── XML 읽기(이 답은 칸이 한 겹이라 작은 읽개로 충분하다) ──────────

const COMMENT = /<!--[\s\S]*?-->/g
const CDATA = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/
const ENTITY = /&(?:#(\d{1,7})|#x([0-9a-fA-F]{1,6})|(amp|lt|gt|quot|apos));/g
const NAMED: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const ITEM = /<item(?:\s[^>]*)?>([\s\S]*?)<\/item\s*>/g
const BODY = /<body(?:\s[^>]*?)?(?:\/>|>([\s\S]*)<\/body\s*>)/
const ROOT = /<response[\s>]/

function decode(raw: string): string {
  return raw.replace(ENTITY, (whole: string, dec?: string, hex?: string, name?: string) => {
    if (name !== undefined) return NAMED[name]
    const code = dec !== undefined ? Number(dec) : Number.parseInt(hex ?? '', 16)
    return code <= 0x10ffff ? String.fromCodePoint(code) : whole
  })
}

// 칸 하나를 찾는 식(처음 것). <x/>는 빈 글자
const tag = (name: string) => new RegExp(`<${name}(?:\\s[^>]*?)?(?:/>|>([\\s\\S]*?)</${name}\\s*>)`)

/** 칸 글자(앞뒤 공백 뺌). CDATA 안은 그대로, 밖은 XML 실체를 푼다. 칸이 없으면 null */
function field(xml: string, re: RegExp): string | null {
  const m = re.exec(xml)
  if (!m) return null
  const inner = m[1] ?? ''
  const cdata = CDATA.exec(inner)
  return (cdata ? cdata[1] : decode(inner)).trim()
}

const RESULT_CODE = tag('resultCode')
const NAME = tag('dutyName')
const LAT = [tag('latitude'), tag('wgs84Lat')]
const LNG = [tag('longitude'), tag('wgs84Lon')]
// dutyTime{1~8}{s 여는·c 닫는}: 1 = 월 … 7 = 일, 8 = 공휴일
const DAYS = Array.from({ length: 8 }, (_, i) => [tag(`dutyTime${i + 1}s`), tag(`dutyTime${i + 1}c`)] as const)

// ── 시각 · 요일 · 줄 ─────────────────────────────────────

/** 'HHMM' 네 자리 글자 → 0시부터 센 분(00:00~24:00). 모양이 다르거나 없는 시각이면 null */
export function minutesOf(text: string): number | null {
  const t = text.trim()
  if (!/^\d{4}$/.test(t)) return null
  const h = Number(t.slice(0, 2))
  const m = Number(t.slice(2))
  if (m > 59 || h > 24 || (h === 24 && m > 0)) return null
  return h * 60 + m
}

// 요일 8칸. 칸이 하나도 없으면 null(진료 시간 자료 없음). 빈 요일·못 읽는 시각·닫는 시각이 여는 시각보다 이르면 그 칸만 null
function weekOf(item: string): Week | null {
  const raw = DAYS.map(([open, close]) => [field(item, open) ?? '', field(item, close) ?? ''] as const)
  if (raw.every(([s, c]) => s === '' && c === '')) return null
  return raw.map(([s, c]) => {
    const open = minutesOf(s)
    const close = minutesOf(c)
    return open === null || close === null || close <= open ? null : ([open, close] as [number, number])
  })
}

const round6 = (v: number) => Math.round(v * 1e6) / 1e6

function coordOf(item: string, res: readonly RegExp[]): number | null {
  for (const re of res) {
    const text = field(item, re)
    if (text !== null && text !== '') return Number(text)
  }
  return null
}

// 줄 하나. 이름이 비었거나 좌표가 없거나 한국 범위 밖이면 뺀다
function rowOf(item: string): ClinicHours | null {
  const name = field(item, NAME) ?? ''
  const lat = coordOf(item, LAT)
  const lng = coordOf(item, LNG)
  if (name === '' || lat === null || lng === null) return null
  if (!(lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132)) return null
  return { name, at: { lat: round6(lat), lng: round6(lng) }, week: weekOf(item) }
}

// 쪽 하나: 미등록 열쇠 → not-applied, 정상 번호(00)·몸통이 없으면 failed, 빈 쪽은 빈 목록
function readPage(text: string): ClinicHours[] | 'not-applied' | 'failed' {
  if (isNotRegistered(text)) return 'not-applied'
  const xml = text.replace(COMMENT, '')
  if (!ROOT.test(xml) || field(xml, RESULT_CODE) !== '00') return 'failed'
  const body = BODY.exec(xml)
  if (!body) return 'failed'
  const rows: ClinicHours[] = []
  for (const m of (body[1] ?? '').matchAll(ITEM)) {
    const row = rowOf(m[1])
    if (row) rows.push(row)
  }
  return rows
}

// ── 의원 맞추기 ──────────────────────────────────────────

// 같은 의원인지 보는 이름: 공백과 '의원'을 뺀다
const nameKey = (name: string) => name.replace(/\s+/g, '').replaceAll('의원', '')

/**
 * 심평원 의원 목록(hosp-list)의 의원 하나에 진료 시간을 맞춘다(design.md 4절): 이름(공백·'의원' 빼고 같음) + 50m 안,
 * 여럿이면 가장 가까운 곳. 못 맞추거나 맞춘 곳에 진료 시간 자료가 없으면 null(진료 시간 없음)
 */
export function hoursFor(clinic: { name: string; at: Point }, rows: readonly ClinicHours[]): Week | null {
  const key = nameKey(clinic.name)
  if (key === '') return null
  let best: ClinicHours | null = null
  let bestM = Infinity
  for (const row of rows) {
    if (nameKey(row.name) !== key) continue
    const m = distM(clinic.at, row.at)
    if (m <= MATCH_M && m < bestM) {
      best = row
      bestM = m
    }
  }
  return best?.week ?? null
}

// ── 읽는 곳 ──────────────────────────────────────────────

export const clinicHours: Adapter<'hosp-hours', ClinicHours[]> = {
  kind: 'hosp-hours',
  src: 'hosp-hours',
  key: 'data',
  // 몸통 이름 둘(checkQuery가 본 한글·숫자 1~20자)로 의원 C 3쪽 + 한의원 G 1쪽 + 치과의원 N 1쪽
  requests(q) {
    return HOURS_PLAN.flatMap(({ kind, pages }) =>
      Array.from({ length: pages }, (_, i) => {
        const params = new URLSearchParams({
          Q0: q.sidoName,
          // 시 아래 구는 빈칸이 있으면 0곳이라 붙여서 묻는다(성남시 수정구 → 성남시수정구, 진짜 답 2026-11-23, TASK-92)
          Q1: q.sggName.replace(/\s+/g, ''),
          QZ: kind,
          pageNo: String(i + 1),
          numOfRows: String(HOURS_ROWS),
        })
        return { url: `${HOURS_URL}?${params}` }
      }),
    )
  },
  // 자료 안에 날짜가 없어 기준 날짜는 받은 한국 날짜(today)다
  parse(texts, _q, today) {
    if (texts.length === 0) return { ok: false, code: 'failed' }
    const value: ClinicHours[] = []
    for (const text of texts) {
      const page = readPage(text)
      if (!Array.isArray(page)) return { ok: false, code: page }
      value.push(...page)
    }
    return { ok: true, value, asOf: today }
  },
}
