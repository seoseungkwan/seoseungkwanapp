import { addDays, addMonthsToDay, compareYmd, diffDays } from '@/lib/analytics/dates'
import type { LapsedBucket, LapsedData, LapsedEntry, LapsedFilters, LapsedGroup, LapsedRow, LapsedRx, LapsedView, PatientsRange } from '@/types/patients'
import { badReply, compactToYmd, optionalText, readListHead, shortDay } from './reservations'

// 장기 미방문 명단 계산(spec patients-bit-lists REQ-2804) [환자 자료 구역]. 도우미 contact.targets {kind:'lapsed'} 답을 읽고
// 마지막 내원 묶음·마지막 진료(처방 추세 묶음 이름)·복사 글을 만든다. 화면 줄에는 차트번호 칸이 없다: 차트번호는 줄 열쇠 안에만 있다(AC-2802.7).
// 줄 열쇠가 곧 도우미 저장(contact.marks)의 연락함 표시 열쇠 l|차트번호|마지막 내원일이다(AC-2804.5). 날짜 계산은 lib/analytics/dates.ts로만 한다

// 마지막 진료 처방은 도우미가 20개까지 보낸다(AC-2801.3)
const RX_MAX = 20

// 원래 도구(뉴메디코어 LapsedPatients)의 3·6·12달 경계에 1~3달(사용자 '한 달 넘게')을 더하고 2년 넘은 분은 뺀다. 이 차례가 화면 단추 차례이고 처음은 1~3달이다
export const LAPSED_BUCKETS: readonly { id: LapsedBucket; label: string; short: number; long: number }[] = [
  { id: '1-3', label: '1~3달', short: 1, long: 3 },
  { id: '3-6', label: '3~6달', short: 3, long: 6 },
  { id: '6-12', label: '6~12달', short: 6, long: 12 },
  { id: '12-24', label: '1~2년', short: 12, long: 24 },
]
const LONGEST = 24

// ── 달 전 날짜·묶음(AC-2804.1) ───────────────────────────

/** 오늘에서 k달 전 같은 날짜. 그 달에 없는 날이면 그 달 마지막 날(3월 31일의 1달 전 → 2월 28일) */
export function monthsBack(today: string, k: number): string {
  return addMonthsToDay(today, -k)
}

/** 장기 미방문은 오늘에서 24달 전 다음 날 ~ 1달 전을 읽는다(AC-2802.2) */
export function lapsedRange(today: string): PatientsRange {
  return { from: addDays(monthsBack(today, LONGEST), 1), to: monthsBack(today, 1) }
}

/** T−긴 달 < 마지막 내원 ≤ T−짧은 달. 경계 날은 긴 쪽이다. 1달이 안 됐거나 2년이 넘으면 null */
export function bucketOf(last: string, today: string): LapsedBucket | null {
  for (const b of LAPSED_BUCKETS) {
    if (compareYmd(last, monthsBack(today, b.long)) > 0 && compareYmd(last, monthsBack(today, b.short)) <= 0) return b.id
  }
  return null
}

/** 묶음 기간: T−긴 달 다음 날 ~ T−짧은 달 */
export function bucketRange(bucket: LapsedBucket, today: string): PatientsRange {
  const b = LAPSED_BUCKETS.find(({ id }) => id === bucket) ?? LAPSED_BUCKETS[0]
  return { from: addDays(monthsBack(today, b.long), 1), to: monthsBack(today, b.short) }
}

/** 'M월 D일 ~ M월 D일에 마지막으로 오신 분'. 해가 오늘과 다른 끝은 'YYYY년 M월 D일'(AC-2804.2) */
export function rangeText(range: PatientsRange, today: string): string {
  const withYear = (ymd: string) => (ymd.slice(0, 4) === today.slice(0, 4) ? shortDay(ymd) : `${Number(ymd.slice(0, 4))}년 ${shortDay(ymd)}`)
  return `${withYear(range.from)} ~ ${withYear(range.to)}에 마지막으로 오신 분`
}

/** '1~3달 N명 · 3~6달 N명 · 6~12달 N명 · 1~2년 N명' */
export function countsText(counts: Record<LapsedBucket, number>): string {
  return LAPSED_BUCKETS.map((b) => `${b.label} ${counts[b.id]}명`).join(' · ')
}

// ── 답 읽기(AC-2801.3) ──────────────────────────────────

// 처방 하나 [코드, 이름|null]. 빈 이름은 없는 것으로 본다
function readRx(cell: unknown): LapsedRx {
  if (!Array.isArray(cell) || cell.length !== 2) return badReply()
  const [code, name] = cell as unknown[]
  if (typeof code !== 'string' || !code.trim()) return badReply()
  return { code: code.trim(), name: optionalText(name) || null }
}

// 줄: [차트번호, 이름|null, 전화, 마지막 내원일 YYYYMMDD, 진료 받은 날 수(2 이상), 예약 있음 0|1, 마지막 진료 처방 [[코드, 이름|null], …]]
function readEntry(row: unknown, charts: Set<string>): LapsedEntry {
  if (!Array.isArray(row) || row.length !== 7) return badReply()
  const [chartCell, name, phone, lastCell, visits, reserved, rx] = row as unknown[]
  if (typeof chartCell !== 'string' || !chartCell.trim() || typeof phone !== 'string' || typeof lastCell !== 'string') return badReply()
  if (typeof visits !== 'number' || !Number.isInteger(visits) || visits < 2 || (reserved !== 0 && reserved !== 1)) return badReply()
  if (!Array.isArray(rx) || rx.length > RX_MAX) return badReply()
  // 환자마다 한 줄이다. 같은 차트번호가 또 오면 줄 열쇠가 겹치므로 답을 쓰지 않는다
  const chart = chartCell.trim()
  if (charts.has(chart)) return badReply()
  charts.add(chart)
  const last = compactToYmd(lastCell) ?? badReply()
  return { key: `l|${chart}|${lastCell}`, chart, name: optionalText(name), phone: phone.trim(), last, visits, reserved: reserved === 1, rx: rx.map(readRx) }
}

/** 도우미 contact.targets {kind:'lapsed'} 답. to는 오늘 전이어야 한다. 모양이 약속과 다르면 E-BRIDGE-BAD-REPLY(그 도구만 실패한다) */
export function readLapsed(json: unknown, expect?: PatientsRange): LapsedData {
  const { from, to, today, rows } = readListHead(json, 'lapsed', expect)
  if (compareYmd(to, today) >= 0) return badReply()
  const charts = new Set<string>()
  return { from, to, today, rows: rows.map((row) => readEntry(row, charts)) }
}

// ── 마지막 진료(AC-2804.6) ──────────────────────────────

/**
 * 처방 코드가 하나라도 겹치는 처방 추세 묶음 이름을 묶음 차례로(같은 이름은 한 번, 코드는 통계처럼 대소문자를 가리지 않는다).
 * 겹치는 묶음이 없으면 처방 이름(없으면 코드)을 두 개까지. 묶음을 못 읽었으면(null) 처방 이름으로만
 */
export function lastRxOf(rx: readonly LapsedRx[], groups: readonly LapsedGroup[] | null): { groups: string[]; names: string[] } {
  const codes = new Set(rx.map(({ code }) => code.toUpperCase()))
  const matched: string[] = []
  for (const group of groups ?? []) {
    if (!matched.includes(group.name) && group.codes.some((code) => codes.has(code.toUpperCase()))) matched.push(group.name)
  }
  if (matched.length) return { groups: matched, names: [] }
  const names: string[] = []
  for (const { code, name } of rx) {
    const label = name ?? code
    if (!names.includes(label)) names.push(label)
    if (names.length === 2) break
  }
  return { groups: [], names }
}

// ── 보기 모양(AC-2804.2·2804.3·2804.7) ──────────────────

type Placed = { entry: LapsedEntry; bucket: LapsedBucket | null; groups: string[]; names: string[] }

/**
 * 고른 묶음·마지막 진료의 표 줄(마지막 내원이 늦은 차례, 같으면 이름 차례)과 묶음마다 건수(고른 마지막 진료 기준), 고른 묶음 기간,
 * 고르기 목록에 둘 묶음 이름(고른 기간 줄에 나온 것, 묶음 차례). contacted는 연락함 표시(같은 열쇠)가 있음
 */
export function lapsedView(data: LapsedData, filters: LapsedFilters, groups: readonly LapsedGroup[] | null, marks: Readonly<Record<string, string>>, today: string): LapsedView {
  const pick = filters.rx
  const passes = (x: Placed) => (pick.kind === 'all' ? true : pick.kind === 'none' ? x.groups.length === 0 : x.groups.includes(pick.name))
  const placed = data.rows.map((entry): Placed => ({ entry, bucket: bucketOf(entry.last, today), ...lastRxOf(entry.rx, groups) }))

  const counts: Record<LapsedBucket, number> = { '1-3': 0, '3-6': 0, '6-12': 0, '12-24': 0 }
  for (const x of placed) if (x.bucket && passes(x)) counts[x.bucket] += 1

  const inBucket = placed.filter((x) => x.bucket === filters.bucket)
  const groupNames: string[] = []
  for (const { name } of groups ?? []) {
    if (!groupNames.includes(name) && inBucket.some((x) => x.groups.includes(name))) groupNames.push(name)
  }

  const rows = inBucket
    .filter(passes)
    .sort((a, b) => compareYmd(b.entry.last, a.entry.last) || a.entry.name.localeCompare(b.entry.name, 'ko'))
    .map(({ entry, groups: matched, names }): LapsedRow => ({
      key: entry.key,
      name: entry.name,
      phone: entry.phone,
      last: entry.last,
      daysAgo: diffDays(entry.last, today),
      visits: entry.visits,
      reserved: entry.reserved,
      contacted: Object.hasOwn(marks, entry.key),
      groups: matched,
      rxNames: names,
    }))
  return { rows, counts, range: bucketRange(filters.bucket, today), groupNames }
}

/** 표 차례로 이름·전화·이름·마지막 내원(M월 D일). 번호 없는 분은 뺀다. 줄이 없으면 빈 글(AC-2804.4) */
export function lapsedPaste(rows: readonly LapsedRow[]): string {
  return rows
    .filter((row) => row.phone)
    .map((row) => [row.name, row.phone, row.name, shortDay(row.last)].join('\t'))
    .join('\n')
}
