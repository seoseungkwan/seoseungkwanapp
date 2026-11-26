import { addDays, compareYmd, isYmd, todayInKorea } from '@/lib/analytics/dates'
import type { FillJob, GsheetRun, GsheetSettings } from './shapes'

// 수납 저절로 넣기 계획(spec google-link REQ-8512 AC-8512.1) — 비트시트 app/src/Core/AutoPlanner.cs(DESIGN 5절)를 옮겼다.
// 비트시트는 상태(AutoState)를 메모리에 들고 다녔다. 웹은 그 상태를 서버 넣기 기록(gsheet_runs 최근 7일)에서 읽는다:
//   LastRunAt  = 오늘 시트에 'auto'·'evening'으로 넣은 마지막 기록의 시각(손 넣기·지난 날 다시 넣기는 오늘 상태를 바꾸지 않음)
//   RetryAt    = 그 기록이 실패면 그 시각 + 간격
//   EveningDone = 오늘 'evening' 기록이 실패가 아님
//   CatchUpDay  = CatchUpFromLog(아래 catchUpDay), CatchUpTries = 그날 'past' 실패 기록 수
// 지문(LastHash)은 도우미가 그 PC에 둔다 — 계획은 sheet.fill의 auto(지문 따름)만 정한다.
// 웹 설정에는 '몇 분마다 넣기' 칸이 따로 없고 [켜기](autoOn) 하나가 저절로 넣기 전체를 켠다(비트시트 알림 영역 프로그램이 도는 것과 같음).
// 다른 넣기·화면이 통로를 쥐어 못 한 것(BUSY_CODES)은 실패가 아니다(비트시트 RunResult.Busy) — 기록이 있어도 없는 것으로 본다.

/** 지난 날 다시 넣기를 몇 번까지 해 보나 */
export const CATCH_UP_MAX_TRIES = 3
/** 며칠 전까지 다시 넣나 */
export const CATCH_UP_MAX_DAYS = 7
/** 다른 넣기가 돌고 있어 못 한 것(실패로 안 침) */
export const BUSY_CODES: readonly string[] = ['E-BRIDGE-BUSY']

export type PlanSettings = Pick<GsheetSettings, 'autoOn' | 'everyMin' | 'from' | 'to' | 'eveningOn' | 'evening'>
export type PlanRun = Pick<GsheetRun, 'at' | 'day' | 'via' | 'outcome' | 'code'>

const DAY_MIN = 1440
const MINUTE_MS = 60_000
const DEFAULT_FROM = 8 * 60
const DEFAULT_TO = 20 * 60
const DEFAULT_EVENING = 19 * 60 + 30
const DEFAULT_EVERY = 5

// h23: 자정을 '24'가 아니라 '00'으로
const KOREA_CLOCK = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Seoul',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

/** 한국 날짜와 그날 0시부터 지난 분(초·밀리초는 소수) */
export function koreaClock(at: Date): { day: string; minute: number } {
  const parts = Object.fromEntries(KOREA_CLOCK.formatToParts(at).map((p) => [p.type, p.value]))
  const seconds = Number(parts.second) + at.getUTCMilliseconds() / 1000
  return { day: todayInKorea(at), minute: Number(parts.hour) * 60 + Number(parts.minute) + seconds / 60 }
}

export const isBusyCode = (code: string | null): boolean => code !== null && BUSY_CODES.includes(code)

// 비트시트 Clock.TryParse의 int.TryParse(앞뒤 빈칸·앞 부호 받음)
const INT = /^\s*[+-]?\d+\s*$/

/** 'HH:mm' → 그날 0시부터 분(비트시트 Clock.TryParse: 0~24시, 24시는 24:00만). 못 읽으면 null */
export function parseClock(text: string): number | null {
  const parts = text.trim().split(':')
  if (parts.length !== 2 || !INT.test(parts[0]) || !INT.test(parts[1])) return null
  const h = Number(parts[0])
  const m = Number(parts[1])
  if (h < 0 || h > 24 || m < 0 || m > 59 || (h === 24 && m !== 0)) return null
  return h * 60 + m
}

/** 운영 시간 안인가(밤을 넘는 시간도). 시각을 못 읽으면 08:00 · 20:00 */
export function inHours(minute: number, s: Pick<PlanSettings, 'from' | 'to'>): boolean {
  const start = parseClock(s.from) ?? DEFAULT_FROM
  const end = parseClock(s.to) ?? DEFAULT_TO
  return start <= end ? minute >= start && minute < end : minute >= start || minute < end
}

/** 간격(ms) — 1분보다 짧으면 1분 */
function intervalMs(s: Pick<PlanSettings, 'everyMin'>): number {
  const every = Number.isFinite(s.everyMin) ? s.everyMin : DEFAULT_EVERY
  return Math.max(1, every) * MINUTE_MS
}

type Timed = PlanRun & { time: number }

/** 계획에 쓰는 기록: 시각·날짜를 읽을 수 있고, 다른 넣기 때문에 못 한 것이 아닌 것 */
function usable(runs: readonly PlanRun[]): Timed[] {
  const list: Timed[] = []
  for (const run of runs) {
    const time = Date.parse(run.at)
    if (Number.isFinite(time) && isYmd(run.day) && !isBusyCode(run.code)) list.push({ ...run, time })
  }
  return list
}

function latest(runs: readonly Timed[]): Timed | null {
  let last: Timed | null = null
  for (const run of runs) if (last === null || run.time >= last.time) last = run
  return last
}

/** 오늘 저절로 넣기 상태를 정하는 기록(비트시트에서 Finish가 LastRunAt을 적는 Check·Evening) */
const todayAuto = (runs: readonly Timed[], today: string) => runs.filter((r) => r.day === today && (r.via === 'auto' || r.via === 'evening'))

function findCatchUp(today: string, s: Pick<PlanSettings, 'eveningOn' | 'evening'>, runs: readonly Timed[]): string | null {
  if (!s.eveningOn) return null
  const oldest = addDays(today, -CATCH_UP_MAX_DAYS)
  let last: string | null = null
  for (const run of runs) {
    if (run.via === 'hand') continue
    if (compareYmd(run.day, today) >= 0 || compareYmd(run.day, oldest) < 0) continue
    if (last === null || compareYmd(run.day, last) > 0) last = run.day
  }
  if (last === null) return null
  const day = last
  const evening = parseClock(s.evening) ?? DEFAULT_EVENING
  // 저녁 시각 뒤(그날 저녁이나 그 뒤 날)에 손으로 그날을 넣었어도 된 것으로 본다
  const afterEvening = (run: Timed) => {
    const at = koreaClock(new Date(run.time))
    return compareYmd(at.day, day) > 0 || (at.day === day && at.minute >= evening)
  }
  const done = runs.some(
    (r) => r.day === day && r.outcome !== 'fail' && (r.via === 'evening' || r.via === 'past' || (r.via === 'hand' && afterEvening(r))),
  )
  return done ? null : day
}

/**
 * 비트시트 CatchUpFromLog: 오늘 전 7일 안에 저절로 넣기가 돈 마지막 날을 찾아, 그날 저녁 마지막 넣기(또는 다시 넣기,
 * 저녁 시각 뒤 손 넣기)가 된 기록이 없으면 그날. 저녁 넣기를 꺼 두었으면 없음
 */
export function catchUpDay(today: string, s: Pick<PlanSettings, 'eveningOn' | 'evening'>, runs: readonly PlanRun[]): string | null {
  return findCatchUp(today, s, usable(runs))
}

function catchUpJob(now: number, today: string, s: PlanSettings, runs: readonly Timed[]): FillJob | null {
  const day = findCatchUp(today, s, runs)
  if (day === null) return null
  const fails = runs.filter((r) => r.via === 'past' && r.day === day && r.outcome === 'fail')
  if (fails.length >= CATCH_UP_MAX_TRIES) return null
  const lastFail = latest(fails)
  if (lastFail !== null && now < lastFail.time + intervalMs(s)) return null
  return { day, mode: 'fillEmpty', via: 'past', auto: false }
}

function todayJob(now: Date, today: string, s: PlanSettings, runs: readonly Timed[]): FillJob | null {
  const mine = todayAuto(runs, today)
  const last = latest(mine)
  const gap = intervalMs(s)
  if (last !== null && last.outcome === 'fail' && now.getTime() < last.time + gap) return null
  const minute = koreaClock(now).minute
  const eveningDone = mine.some((r) => r.via === 'evening' && r.outcome !== 'fail')
  if (s.eveningOn && !eveningDone && minute >= (parseClock(s.evening) ?? DEFAULT_EVENING)) {
    return { day: today, mode: 'fillEmpty', via: 'evening', auto: false }
  }
  if (inHours(minute, s) && (last === null || now.getTime() - last.time >= gap)) {
    return { day: today, mode: 'fillEmpty', via: 'auto', auto: true }
  }
  return null
}

/**
 * 지금 넣을 일(비트시트 Decide). 차례: 지난 날 다시 넣기(빈 칸만 채우기, 지문 무시) → 오늘 저녁 마지막 넣기(지문 무시)
 * 또는 간격 확인(지문 따름). 지난 날 다시 넣기는 오늘 상태를 건드리지 않으므로 둘이 함께 나올 수 있고, 차례대로 돌린다
 */
export function planFills(now: Date, s: PlanSettings, runs: readonly PlanRun[]): FillJob[] {
  if (!s.autoOn) return []
  const list = usable(runs)
  const today = todayInKorea(now)
  const jobs: FillJob[] = []
  const past = catchUpJob(now.getTime(), today, s, list)
  if (past !== null) jobs.push(past)
  const next = todayJob(now, today, s, list)
  if (next !== null) jobs.push(next)
  return jobs
}

/** 다음 간격 확인 예정 시각(비트시트 NextCheck). 꺼져 있으면 null */
export function nextCheck(now: Date, s: PlanSettings, runs: readonly PlanRun[]): Date | null {
  if (!s.autoOn) return null
  const last = latest(todayAuto(usable(runs), todayInKorea(now)))
  const next = Math.max(last === null ? now.getTime() : last.time + intervalMs(s), now.getTime())
  const minute = koreaClock(new Date(next)).minute
  if (inHours(minute, s)) return new Date(next)
  const start = parseClock(s.from) ?? DEFAULT_FROM
  const wait = minute < start ? start - minute : DAY_MIN - minute + start
  return new Date(Math.round(next + wait * MINUTE_MS))
}
