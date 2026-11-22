import { addDays, compareYmd, diffDays, isYmd } from '@/lib/analytics/dates'

// 새 경쟁 의원 알림 판정(design.md 12절). 관리자가 대시보드를 열 때 브라우저가 부른다(Cron 아님, ADR-042).
// 오늘은 부르는 쪽이 한국 날짜(todayInKorea)로 넘긴다 — 시계를 읽지 않는다.
// 후보·인허가 줄 모양은 types/location.ts(TASK-2)가 생기기 전이라 여기서 필요한 칸만 둔다(합칠 때 맞춤)

/** 한 번에 확인하는 후보 수 */
export const WATCH_MAX_CANDIDATES = 5
/** 마지막 확인에서 이 날 수를 넘으면 다시 확인한다 */
export const WATCH_EVERY_DAYS = 30
/** 인허가 자료가 늦게 올라오는 날 수 — 기간 끝은 오늘 − 2일 */
export const WATCH_LAG_DAYS = 2
/** 과목이나 이름에 이 글자가 있으면 경쟁 의원 */
export const WATCH_DEPTS = ['정형외과', '마취통증의학과', '재활의학과'] as const

const NAME_MAX = 100 // location_events.clinic_name 1~100
const DEPT_MAX = 50 // location_events.dept ≤ 50

export type WatchStatus = 'watching' | 'contacted' | 'visited' | 'reviewing' | 'dropped'

export type WatchCandidate = {
  id: string
  status: WatchStatus
  lat: number
  lng: number
  radiusM: number
  /** 'YYYY-MM-DD' 또는 아직 확인 안 함 */
  watchCheckedOn: string | null
  /** 만든 시각(ISO 글자, 같은 모양끼리 글자 차례 = 시각 차례) */
  createdAt: string
}

/** 같은 기간을 보는 후보 묶음 — clinic-license open·close를 기간마다 한 번씩 받아 나눠 쓴다 */
export type WatchGroup<T extends WatchCandidate = WatchCandidate> = { from: string; to: string; candidates: T[] }

/** clinic-license 한 줄(WGS84 점, 못 바꾼 점은 null) */
export type LicenseRow = {
  name: string
  dept: string
  openedOn: string | null
  closedOn: string | null
  point: { lat: number; lng: number } | null
}

/** 한 기간의 clinic-license 답(open이면 개업, close면 폐업 자료) */
export type LicenseFound = { kind: 'open' | 'close'; from: string; to: string; rows: readonly LicenseRow[] }

/** location_events에 넣을 줄 */
export type WatchEvent = {
  candidateId: string
  kind: 'open' | 'close'
  clinicName: string
  dept: string
  eventOn: string
  distM: number
}

function isDue(c: WatchCandidate, today: string): boolean {
  if (c.status === 'dropped') return false
  return c.watchCheckedOn === null || diffDays(c.watchCheckedOn, today) > WATCH_EVERY_DAYS
}

// 처음이면 (오늘 − 30) + 1일부터. 확인한 적 있으면 그때 기간 끝(확인 날 − 2일) 다음 날부터 — 빠지는 날이 없게.
// 겹치는 날의 같은 줄은 DB unique(candidate_id, kind, clinic_name, event_on)가 한 번만 둔다
function periodStart(c: WatchCandidate, today: string): string {
  return c.watchCheckedOn === null ? addDays(today, -WATCH_EVERY_DAYS + 1) : addDays(c.watchCheckedOn, -WATCH_LAG_DAYS + 1)
}

const byCreated = (a: WatchCandidate, b: WatchCandidate) =>
  a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0

/** 내려놓지 않았고 확인한 적 없거나 30일 넘은 후보를 만든 차례로 5곳까지, 같은 기간끼리 묶는다(묶음 차례 = 후보 차례) */
export function dueCandidates<T extends WatchCandidate>(rows: readonly T[], today: string): WatchGroup<T>[] {
  const to = addDays(today, -WATCH_LAG_DAYS)
  const picked = rows.filter((c) => isDue(c, today)).sort(byCreated).slice(0, WATCH_MAX_CANDIDATES)
  const groups: WatchGroup<T>[] = []
  for (const c of picked) {
    const from = periodStart(c, today)
    const group = groups.find((g) => g.from === from)
    if (group) group.candidates.push(c)
    else groups.push({ from, to, candidates: [c] })
  }
  return groups
}

// 하버사인(지구 반지름 6,371,008.8m) 버림 — coords.ts(TASK-4) distM과 같은 식(합칠 때 그쪽으로 바꿈)
const EARTH_M = 6_371_008.8
const rad = (deg: number) => (deg * Math.PI) / 180
function distM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2
  return Math.floor(2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h))))
}

const clip = (s: string, max: number) => Array.from(s).slice(0, max).join('')
const isRival = (r: LicenseRow) => WATCH_DEPTS.some((dept) => r.dept.includes(dept) || r.name.includes(dept))

/** 한 기간 답에서 후보 범위 안(버린 거리 ≤ 범위) 경쟁 의원의 개업·폐업 줄. 날짜가 기간 밖·모양 틀림, 점·이름 없음은 뺀다 */
export function pickEvents(found: LicenseFound, cand: WatchCandidate): WatchEvent[] {
  const events: WatchEvent[] = []
  const seen = new Set<string>()
  for (const r of found.rows) {
    const eventOn = found.kind === 'open' ? r.openedOn : r.closedOn
    if (eventOn === null || !isYmd(eventOn)) continue
    if (compareYmd(eventOn, found.from) < 0 || compareYmd(eventOn, found.to) > 0) continue
    const clinicName = clip(r.name.trim(), NAME_MAX)
    if (clinicName === '' || r.point === null || !isRival(r)) continue
    const d = distM(cand, r.point)
    if (d > cand.radiusM) continue
    const key = `${found.kind}\n${clinicName}\n${eventOn}`
    if (seen.has(key)) continue
    seen.add(key)
    events.push({ candidateId: cand.id, kind: found.kind, clinicName, dept: clip(r.dept.trim(), DEPT_MAX), eventOn, distM: d })
  }
  return events
}
