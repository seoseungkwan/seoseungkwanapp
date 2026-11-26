import type { CalAppt } from '@/types/calendar'
import type { GcalRules } from '@/types/gcal'
import type { GcalErrorCode } from './client'
import type { GcalDeps } from './deps'

// 예약 탭 띠·안내 줄이 듣는 맞춤 상태(spec google-link AC-8525.4, design.md 10-5). 탭마다 하나, useSyncExternalStore로 듣는다
// (subscribeGcalStatus·getGcalStatus — 바뀌지 않으면 같은 객체). 시각은 DB가 준 글자 그대로다

export type GcalStatus = {
  /** 캘린더를 고르고 이은 날이 있다 */
  linked: boolean
  calendarName: string | null
  pullMin: GcalRules['pullMin']
  lastOkAt: string | null
  failSince: string | null
  failCode: string | null
  /** 구글로 보낼 것 수: 이은 날 뒤 g_wait 예약 + 지움 줄 + 기다리는 off 날 + 기다리는 종일 메모 */
  waiting: number
  /** 아직 못 보낸 예약(닿지 못함 띠의 목록, 이은 날 뒤, 넣은 차례) */
  waitingAppts: readonly CalAppt[]
  waitingIds: ReadonlySet<string>
  /** 고쳐야 할 구글 예약(열린 것) 수 */
  fixes: number
  /** 실패 중이면 다음에 다시 해 볼 때(ISO) */
  nextTryAt: string | null
  /** 지금 맞추는 중 */
  running: boolean
}

const EMPTY: GcalStatus = Object.freeze({
  linked: false,
  calendarName: null,
  pullMin: 2,
  lastOkAt: null,
  failSince: null,
  failCode: null,
  waiting: 0,
  waitingAppts: Object.freeze([]) as readonly CalAppt[],
  waitingIds: new Set<string>(),
  fixes: 0,
  nextTryAt: null,
  running: false,
}) as GcalStatus

let current: GcalStatus = EMPTY
const listeners = new Set<() => void>()

export function getGcalStatus(): GcalStatus {
  return current
}

export function subscribeGcalStatus(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const sameIds = (a: readonly CalAppt[], b: readonly CalAppt[]) =>
  a.length === b.length && a.every((x, i) => x.id === b[i].id && x.gWait === b[i].gWait && x.gWaitAt === b[i].gWaitAt && x.day === b[i].day && x.start === b[i].start)

/** 칸을 바꾼다. 같은 값이면 객체도 그대로·듣는 쪽도 안 부른다 */
export function setGcalStatus(patch: Partial<GcalStatus>): GcalStatus {
  const keys = Object.keys(patch) as (keyof GcalStatus)[]
  const changed = keys.some((k) => {
    if (k === 'waitingAppts') return !sameIds(current.waitingAppts, patch.waitingAppts ?? [])
    if (k === 'waitingIds') return false
    return current[k] !== patch[k]
  })
  if (!changed) return current
  const next = { ...current, ...patch }
  if (patch.waitingAppts) next.waitingIds = new Set(patch.waitingAppts.map((a) => a.id))
  current = next
  for (const fn of [...listeners]) fn()
  return current
}

/** 처음 모양으로(잇기 끊음·로그아웃·시험) */
export function resetGcalStatus(): void {
  if (current === EMPTY) return
  current = EMPTY
  for (const fn of [...listeners]) fn()
}

/** DB에서 다시 읽어 상태를 채운다(구글은 부르지 않는다) */
export async function refreshGcalStatus(deps: GcalDeps): Promise<GcalStatus> {
  const { store } = deps
  const link = await store.loadLink()
  if (!link || !link.calendarId || !link.linkedOn) {
    return setGcalStatus({ linked: false, calendarName: link?.calendarName ?? null, pullMin: link?.rules.pullMin ?? 2, waiting: 0, waitingAppts: [], fixes: 0 })
  }
  const from = link.linkedOn
  const [state, appts, deletes, offs, memos, fixes] = await Promise.all([
    store.loadState(),
    store.listWaitingAppts(from),
    store.listDeletes(),
    store.listWaitingOffDays(),
    store.listWaitingMemos(from),
    store.listFixes('open'),
  ])
  const waiting = appts.length + deletes.filter((d) => d.day >= from).length + offs.filter((o) => o.day >= from).length + memos.length
  return setGcalStatus({
    linked: true,
    calendarName: link.calendarName,
    pullMin: link.rules.pullMin,
    lastOkAt: state.lastOkAt,
    failSince: state.failSince,
    failCode: state.failCode,
    waiting,
    waitingAppts: appts,
    fixes: fixes.length,
  })
}

const KOREA_OFFSET_MS = 9 * 60 * 60 * 1000
const pad = (n: number) => String(n).padStart(2, '0')
function koreaHm(iso: string): string {
  const d = new Date(Date.parse(iso) + KOREA_OFFSET_MS)
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

export type SyncNowResult = { ok: true; changed: number; sent: number; at: string } | { ok: false; code: GcalErrorCode | null }

/** [지금 맞추기]·[다시 시도] 뒤 알림 글(notes-calendar week·err) */
export function syncNowText(r: SyncNowResult): string {
  if (!r.ok) return '다시 해 봤지만 아직 닿지 않아요. 1분 뒤 다시 해 볼게요.'
  const n = r.changed + r.sent
  return `구글과 맞췄어요 · ${n ? `바뀐 것 ${n}개` : '바뀐 것 없음'} (${koreaHm(r.at)})`
}
