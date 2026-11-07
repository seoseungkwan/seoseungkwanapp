import { addDays, compareYmd, isYmd, weekdayOf } from '@/lib/analytics/dates'
import { BridgeError, isRecord } from '@/lib/bridge/protocol'
import type { MissedMark, MissedRow, MissedSummary, PatientsRange, ReservationData, ReservationEntry, ReservationPick, ReservationRow } from '@/types/patients'

// 예약 문자 명단 계산(spec patients-bit-lists REQ-2803) [환자 자료 구역]. 도우미 contact.targets {kind:'reservation'} 답을 읽고
// 고른 날 줄·지난 예약 중 안 오신 분·복사 글을 만든다. 화면 줄에는 차트번호 칸이 없다: 차트번호는 줄 열쇠 안에만 있다(AC-2802.7).
// 줄 열쇠가 곧 도우미 저장(contact.marks)의 보냄 표시 열쇠 s|차트번호|예약 시각이다(AC-2803.8). 날짜 계산은 lib/analytics/dates.ts로만 한다

const BAD_REPLY = 'E-BRIDGE-BAD-REPLY'
export const RESERVATION_BACK_DAYS = 30
export const RESERVATION_AHEAD_DAYS = 14

const YOIL = ['월', '화', '수', '목', '금', '토', '일']
const AT = /^\d{8}(\d{2})(\d{2})$/ // yyyyMMddHHmm
const COMPACT_DAY = /^(\d{4})(\d{2})(\d{2})$/ // YYYYMMDD
// 비트 예약 대기 상태. 비트 절차가 예약 목록에 쓰는 OcmComStt IN ('WR','NR')·RsvSts <> 'OC'와 같다
const WAITING = new Set(['WR', 'NR'])
const CANCELED = 'OC'

type Marks = Readonly<Record<string, string>>

// ── 두 명단 답이 같이 쓰는 것(lapsed.ts도 부른다) ─────────────────

/** 답 모양이 약속과 다르면 오류 번호만 던진다(환자 값을 싣지 않는다) */
export function badReply(): never {
  throw new BridgeError(BAD_REPLY)
}

const isDay = (x: unknown): x is string => typeof x === 'string' && isYmd(x)

/** 도우미 글 'YYYYMMDD' → 'YYYY-MM-DD'. 없는 날이면 null */
export function compactToYmd(s: string): string | null {
  const m = COMPACT_DAY.exec(s)
  if (!m) return null
  const day = `${m[1]}-${m[2]}-${m[3]}`
  return isYmd(day) ? day : null
}

/** 이름처럼 없을 수 있는 글(null)은 빈 글로, 앞뒤 빈칸은 뗀다 */
export function optionalText(x: unknown): string {
  if (x === null) return ''
  if (typeof x !== 'string') return badReply()
  return x.trim()
}

/** 답 머리 {v:1, kind, from, to, today, rows}. 물어본 기간(expect)과 다르면 쓰지 않는다 */
export function readListHead(json: unknown, kind: 'reservation' | 'lapsed', expect?: PatientsRange): { from: string; to: string; today: string; rows: unknown[] } {
  if (!isRecord(json) || json.v !== 1 || json.kind !== kind) return badReply()
  const { from, to, today, rows } = json
  if (!isDay(from) || !isDay(to) || !isDay(today) || compareYmd(from, to) > 0 || !Array.isArray(rows)) return badReply()
  if (expect && (from !== expect.from || to !== expect.to)) return badReply()
  return { from, to, today, rows: rows as unknown[] }
}

const tabbed = (rows: readonly string[][]) => rows.map((row) => row.join('\t')).join('\n')

// ── 날짜·시각 글 ────────────────────────────────────────

/** '오전 9:00' · '오후 2:30' · 12시는 '오후 12:00'(시안 hm과 같다) */
export function timeLabel(at: string): string {
  const hour = Number(at.slice(8, 10))
  return `${hour < 12 ? '오전' : '오후'} ${hour > 12 ? hour - 12 : hour}:${at.slice(10, 12)}`
}

/** '11월 5일 (목)' */
export function dayTitle(ymd: string): string {
  return `${shortDay(ymd)} (${YOIL[weekdayOf(ymd) - 1]})`
}

/** '11월 5일' */
export function shortDay(ymd: string): string {
  return `${Number(ymd.slice(5, 7))}월 ${Number(ymd.slice(8, 10))}일`
}

// ── 답 읽기 ─────────────────────────────────────────────

/** 예약은 오늘−30일 ~ 오늘+14일을 읽는다(AC-2802.2. 도우미는 오늘−31일 ~ 오늘+14일까지 받는다, AC-2801.1) */
export function reservationRange(today: string): PatientsRange {
  return { from: addDays(today, -RESERVATION_BACK_DAYS), to: addDays(today, RESERVATION_AHEAD_DAYS) }
}

// 예약 시각 → 예약 날. 시·분까지 맞는 시각이어야 한다
function dayOfAt(at: string): string {
  const m = AT.exec(at)
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return badReply()
  return compactToYmd(at.slice(0, 8)) ?? badReply()
}

// 줄: [차트번호|null, 이름|null, 전화, 예약 시각 yyyyMMddHHmm, 상태, 예약 표시|null, 그날 옴 0|1, 그 뒤 처음 온 날 YYYYMMDD|null] (AC-2801.2)
function readEntry(row: unknown, seen: Map<string, number>): ReservationEntry {
  if (!Array.isArray(row) || row.length !== 8) return badReply()
  const [chartCell, nameCell, phone, at, status, rsv, came, after] = row as unknown[]
  if (chartCell !== null && typeof chartCell !== 'string') return badReply()
  if (typeof phone !== 'string' || typeof at !== 'string' || typeof status !== 'string') return badReply()
  if ((rsv !== null && typeof rsv !== 'string') || (came !== 0 && came !== 1)) return badReply()
  if (after !== null && typeof after !== 'string') return badReply()
  const day = dayOfAt(at)
  const cameAfter = after === null ? null : (compactToYmd(after) ?? badReply())
  // 차트번호 없는 예약(이름만으로 잡은 처음 오시는 분)은 빈 글. 같은 열쇠가 또 오면 뒤에 차례를 붙여 줄 열쇠가 겹치지 않게 한다
  const chart = chartCell?.trim() || null
  const base = `s|${chart ?? ''}|${at}`
  const n = (seen.get(base) ?? 0) + 1
  seen.set(base, n)
  return { key: n === 1 ? base : `${base}|${n}`, chart, name: optionalText(nameCell), phone: phone.trim(), at, day, status, rsv, came: came === 1, cameAfter }
}

/** 도우미 contact.targets {kind:'reservation'} 답. 모양이 약속과 다르면 E-BRIDGE-BAD-REPLY(그 도구만 실패한다) */
export function readReservations(json: unknown, expect?: PatientsRange): ReservationData {
  const { from, to, today, rows } = readListHead(json, 'reservation', expect)
  const seen = new Map<string, number>()
  return { from, to, today, rows: rows.map((row) => readEntry(row, seen)) }
}

// ── 고른 날 예약(AC-2803.0·2803.1) ───────────────────────

/** 문자 보낼 예약: 지금 상태가 예약 대기(WR·NR)이고 예약 표시가 OC가 아니다 */
const waiting = (entry: ReservationEntry) => WAITING.has(entry.status) && entry.rsv !== CANCELED
const byAt = (a: ReservationEntry, b: ReservationEntry) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0)
const byAtThenName = (a: ReservationEntry, b: ReservationEntry) => byAt(a, b) || a.name.localeCompare(b.name, 'ko')

/** 고른 날 문자 보낼 예약을 예약 시각 → 이름 차례로. sent는 보냄 표시(같은 열쇠)가 있음 */
export function upcoming(data: ReservationData, day: string, marks: Marks = {}): ReservationRow[] {
  return data.rows
    .filter((entry) => entry.day === day && waiting(entry))
    .sort(byAtThenName)
    .map((entry) => ({ key: entry.key, time: timeLabel(entry.at), name: entry.name, phone: entry.phone, sent: Object.hasOwn(marks, entry.key) }))
}

/** 날짜 단추의 인원수(그 날 문자 보낼 예약 수) */
export function countOn(data: ReservationData, day: string): number {
  return data.rows.filter((entry) => entry.day === day && waiting(entry)).length
}

/** [직접] 날짜는 오늘 ~ 오늘+14일만 받는다 */
export function inPickRange(day: string, today: string): boolean {
  return isYmd(day) && compareYmd(day, today) >= 0 && compareYmd(day, addDays(today, RESERVATION_AHEAD_DAYS)) <= 0
}

/** 처음 고를 날: 내일 → 모레 차례로 예약이 있는 첫날, 둘 다 없으면 14일 안 가장 가까운 날을 [직접]으로, 그것도 없으면 내일(2026-11-07 사용자 결정) */
export function firstPick(data: ReservationData, today: string): ReservationPick {
  const days = new Set(data.rows.filter(waiting).map((entry) => entry.day))
  const tomorrow = addDays(today, 1)
  if (days.has(tomorrow)) return { preset: 'tomorrow', day: tomorrow, note: null }
  for (let ahead = 2; ahead <= RESERVATION_AHEAD_DAYS; ahead++) {
    const day = addDays(today, ahead)
    if (days.has(day)) {
      return { preset: ahead === 2 ? 'after' : 'custom', day, note: `내일은 예약이 없어 예약이 있는 가장 가까운 날(${dayTitle(day)})을 먼저 골랐어요.` }
    }
  }
  return { preset: 'tomorrow', day: tomorrow, note: null }
}

// ── 복사(AC-2803.2·2803.9) ──────────────────────────────

/** 복사할 줄: 번호 있는 분. 안 보낸 분만이면 보냄 표시가 없는 분만 */
export function copyRows(rows: readonly ReservationRow[], unsentOnly: boolean): ReservationRow[] {
  return rows.filter((row) => row.phone && !(unsentOnly && row.sent))
}

/** 번호 없는 분(표 위 주의 칸) */
export function noPhone(rows: readonly ReservationRow[]): ReservationRow[] {
  return rows.filter((row) => !row.phone)
}

/** F/U 명단 복사와 같은 네 칸 탭 글 이름·전화·이름·예약 시각(번호 없는 분은 뺀다). 날짜 제목 줄은 YYYY-MM-DD (요일) — N명(복사한 수). 줄이 없으면 빈 글 */
export function reservationPaste(rows: readonly ReservationRow[], withDate: boolean, day: string): string {
  const lines = rows.filter((row) => row.phone).map((row) => [row.name, row.phone, row.name, row.time])
  if (!lines.length) return ''
  if (withDate) lines.unshift([`${day} (${YOIL[weekdayOf(day) - 1]}) — ${lines.length}명`, '', '', ''])
  return tabbed(lines)
}

// ── 지난 예약 · 안 오신 분(AC-2803.5~2803.7) ─────────────

/** [지난 7일]·[지난 30일]은 어제까지 */
export function missedRange(today: string, days: 7 | 30): PatientsRange {
  return { from: addDays(today, -days), to: addDays(today, -1) }
}

// 비트는 미리 취소와 안 오심을 같은 CR로 바꾼다. 예약 대기(WR·NR)가 그대로이고 OC가 아닐 때만 '예약 그대로'
const markOf = (entry: ReservationEntry): MissedMark => (waiting(entry) ? '예약 그대로' : '예약 취소')

/**
 * 기간 안 예약 중 그날 옴이 0인 줄을 예약한 때가 늦은 차례(같으면 이름 차례)로. 아직 안 오신 분만이면 그 뒤 처음 온 날이 있는 줄을 뺀다.
 * summary는 거르기와 상관없이 같다: 예약 N건(모든 상태) 중 안 오신 분 M건 · P%(반올림) · 아직 안 오신 분 K명(그 뒤 처음 온 날이 없는 줄 수)
 */
export function missed(data: ReservationData, range: PatientsRange, notYetOnly: boolean): { rows: MissedRow[]; summary: MissedSummary } {
  const inRange = data.rows.filter((entry) => compareYmd(entry.day, range.from) >= 0 && compareYmd(entry.day, range.to) <= 0)
  const away = inRange
    .filter((entry) => !entry.came)
    .sort((a, b) => byAt(b, a) || a.name.localeCompare(b.name, 'ko'))
    .map((entry): MissedRow => ({ key: entry.key, day: entry.day, time: timeLabel(entry.at), name: entry.name, phone: entry.phone, mark: markOf(entry), after: entry.cameAfter }))
  const notYet = away.filter((row) => row.after === null)
  const total = inRange.length
  return {
    rows: notYetOnly ? notYet : away,
    summary: { total, missed: away.length, percent: total ? Math.round((away.length * 100) / total) : 0, notYet: notYet.length },
  }
}

export function missedSummaryText(s: MissedSummary): string {
  if (s.total === 0) return '이 기간에 예약이 없어요.'
  return `예약 ${s.total}건 중 안 오신 분 ${s.missed}건 · ${s.percent}% · 아직 안 오신 분 ${s.notYet}명`
}

/** 받은 줄 차례로 이름·전화·이름·예약한 날(M월 D일). 번호 없는 분은 뺀다. 줄이 없으면 빈 글 */
export function missedPaste(rows: readonly MissedRow[]): string {
  return tabbed(rows.filter((row) => row.phone).map((row) => [row.name, row.phone, row.name, shortDay(row.day)]))
}
