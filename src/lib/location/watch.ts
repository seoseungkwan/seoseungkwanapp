import { addDays, compareYmd, diffDays, isYmd } from '@/lib/analytics/dates'
import type { DeptRule, LicenseRow, WatchCandidate, WatchEvent, WatchStatus } from '@/types/location'
import { distM } from './coords'
import { DEFAULT_DEPT_RULE, deptOfText } from './depts'
import { placeAddr } from './snapshot'

// 새 경쟁 의원 알림 판정(design.md 12절). 관리자가 대시보드를 열 때 브라우저가 부른다(Cron 아님, ADR-042).
// 오늘은 부르는 쪽이 한국 날짜(todayInKorea)로 넘긴다 — 시계를 읽지 않는다.
// 경쟁 의원 = 인허가 줄의 대표 과목(depts.ts deptOfText)이 설정(location_settings.dept_rule)의 경쟁 과목인 의원(design.md 18절).
// 후보·인허가·알림 줄 모양은 types/location.ts 한 곳이다(예전 import 길을 위해 여기서도 내보낸다)
export type { LicenseRow, WatchCandidate, WatchEvent, WatchStatus }

/** 한 번에 확인하는 후보 수 */
export const WATCH_MAX_CANDIDATES = 5
/** 마지막 확인에서 이 날 수를 넘으면 다시 확인한다 */
export const WATCH_EVERY_DAYS = 30
/** 인허가 자료가 늦게 올라오는 날 수 — 기간 끝은 오늘 − 2일 */
export const WATCH_LAG_DAYS = 2

const NAME_MAX = 100 // location_events.clinic_name 1~100
const DEPT_MAX = 50 // location_events.dept ≤ 50

/** 같은 기간을 보는 후보 묶음 — clinic-license open·close를 기간마다 한 번씩 받아 나눠 쓴다 */
export type WatchGroup<T extends WatchCandidate = WatchCandidate> = { from: string; to: string; candidates: T[] }

/** 한 기간의 clinic-license 답(open이면 개업, close면 폐업 자료) */
export type LicenseFound = { kind: 'open' | 'close'; from: string; to: string; rows: readonly LicenseRow[] }

// 그날 값 place로 주소 앞부분('{시도} {시군구}', snapshot.ts placeAddr)을 만들 수 있어야 지역을 안다.
// 모르면 고르지 않는다 — 전국으로 부르면 한 달도 거의 늘 잘려(capped) 확인 날이 바뀌지 않고 5곳 자리를 계속 차지한다
const knowsRegion = (c: WatchCandidate): boolean => c.place != null && placeAddr(c.place) !== null

function isDue(c: WatchCandidate, today: string): boolean {
  if (c.status === 'dropped' || !knowsRegion(c)) return false
  return c.watchCheckedOn === null || diffDays(c.watchCheckedOn, today) > WATCH_EVERY_DAYS
}

// 처음이면 (오늘 − 30) + 1일부터. 확인한 적 있으면 그때 기간 끝(확인 날 − 2일) 다음 날부터 — 빠지는 날이 없게.
// 겹치는 날의 같은 줄은 DB unique(candidate_id, kind, clinic_name, event_on)가 한 번만 둔다
function periodStart(c: WatchCandidate, today: string): string {
  return c.watchCheckedOn === null ? addDays(today, -WATCH_EVERY_DAYS + 1) : addDays(c.watchCheckedOn, -WATCH_LAG_DAYS + 1)
}

const byCreated = (a: WatchCandidate, b: WatchCandidate) =>
  a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0

/** 내려놓지 않았고 지역(그날 값 place)을 알고 확인한 적 없거나 30일 넘은 후보를 만든 차례로 5곳까지, 같은 기간끼리 묶는다(묶음 차례 = 후보 차례) */
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

const clip = (s: string, max: number) => Array.from(s).slice(0, max).join('')

// 업태 글(type, 인허가 MDLCR_INST_BTP_NM)에 치과·한의가 들면 치과의원·한의원, 아니면 이름 낱말 → 과목 글(경쟁 → 둘레로 보기) 차례로 센다.
// 업태 글이 없는 줄(옛 모양)은 빈 글자로 본다
function isRival(r: LicenseRow, rule: DeptRule): boolean {
  const id = deptOfText({ name: r.name, subjects: r.dept, type: r.type ?? '' }, rule)
  return id !== null && rule.rival.includes(id)
}

// 업태만 보고 가르는지: 이름·과목 글을 비우고 아무 과목도 고르지 않은 설정이면 deptOfText는 업태로 가를 때만 과목을 낸다(depts.ts 한 곳의 셈)
const NO_PICK: DeptRule = { v: 1, rival: [], hide: [] }
const splitsByType = (type: string): boolean => type !== '' && deptOfText({ name: '', subjects: '', type }, NO_PICK) !== null

/** 저장하는 과목 글(location_events.dept, 50자까지). 업태로 가른 줄(치과의원·한의원)이면 업태 글을 앞에 붙인다
 * (`한의원,한방내과,…`, 과목 글이 비면 업태 글만 — design.md 12절). 알림 줄에는 업태 칸이 없어 그리는 쪽이 eventDeptRow로 되찾는다 */
function storedDept(r: LicenseRow): string {
  const dept = r.dept.trim()
  const type = (r.type ?? '').trim()
  if (!splitsByType(type)) return clip(dept, DEPT_MAX)
  return clip(dept === '' ? type : `${type},${dept}`, DEPT_MAX)
}

/** 저장한 알림 줄(이름·과목 글)을 대표 과목 셈(deptOfText)에 넣을 모양으로 되돌린다. 과목 글 첫 조각(쉼표 앞)이 업태로 가르는 글이면
 * 그것이 업태 글이고 나머지가 과목 글이다(storedDept가 붙인 것). 아니면 업태 없이 과목 글 그대로 — 넣을 때와 같은 과목을 얻는다 */
export function eventDeptRow(e: Pick<WatchEvent, 'clinicName' | 'dept'>): { name: string; subjects: string; type: string } {
  const cut = e.dept.indexOf(',')
  const head = (cut === -1 ? e.dept : e.dept.slice(0, cut)).trim()
  if (!splitsByType(head)) return { name: e.clinicName, subjects: e.dept, type: '' }
  return { name: e.clinicName, subjects: cut === -1 ? '' : e.dept.slice(cut + 1), type: head }
}

/** 한 기간 답에서 후보 범위 안(버린 거리 ≤ 범위) 경쟁 의원(대표 과목이 rule의 경쟁 과목)의 개업·폐업 줄.
 * 날짜가 기간 밖·모양 틀림, 점·이름 없음은 뺀다. 경쟁 과목이 0개면 빈 목록. rule을 못 받으면 처음 설정 */
export function pickEvents(found: LicenseFound, cand: WatchCandidate, rule: DeptRule = DEFAULT_DEPT_RULE): WatchEvent[] {
  if (rule.rival.length === 0) return []
  const events: WatchEvent[] = []
  const seen = new Set<string>()
  for (const r of found.rows) {
    const eventOn = found.kind === 'open' ? r.openedOn : r.closedOn
    if (eventOn === null || !isYmd(eventOn)) continue
    if (compareYmd(eventOn, found.from) < 0 || compareYmd(eventOn, found.to) > 0) continue
    const clinicName = clip(r.name.trim(), NAME_MAX)
    if (clinicName === '' || r.point === null || !isRival(r, rule)) continue
    const d = distM(cand, r.point) // coords.ts 하버사인 버림
    if (d > cand.radiusM) continue
    const key = `${found.kind}\n${clinicName}\n${eventOn}`
    if (seen.has(key)) continue
    seen.add(key)
    events.push({ candidateId: cand.id, kind: found.kind, clinicName, dept: storedDept(r), eventOn, distM: d })
  }
  return events
}
