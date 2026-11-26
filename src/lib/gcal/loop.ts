import type { CalAppt } from '@/types/calendar'
import type { GcalDeps } from './deps'
import { pullOnce } from './pull'
import { pushAppt, pushOffDay, pushWaiting, type PushOutcome } from './push'
import { getGcalStatus, refreshGcalStatus, setGcalStatus, type SyncNowResult } from './status'

// 맞춤 돌기(spec google-link REQ-8525·REQ-8526, design.md 10-5): 한 PC에서는 잠금('ssk-gcal', ifAvailable)을 쥔 탭 하나만 돈다.
// 켜자마자 받고, 1분마다 깨어 받아 오는 간격(pullMin)이 지났거나 실패 중이면 받기 + 보내기, 아니면 못 보낸 것만 보낸다.
// 창이 다시 보이면 바로 받는다. 예약 탭에 들어오면 requestPull(이끄는 탭이 아니어도 한 번). 한 탭 안에서는 한 번에 하나씩 차례로

export const TICK_MS = 60_000
export const GCAL_LOCK = 'ssk-gcal'

export type LockLike = { request(name: string, options: { ifAvailable: true }, callback: (lock: unknown) => unknown): Promise<unknown> }
export type VisibleDoc = {
  visibilityState: string
  addEventListener(type: 'visibilitychange', listener: () => void): void
  removeEventListener(type: 'visibilitychange', listener: () => void): void
}
export type LoopEnv = { locks?: LockLike | null; doc?: VisibleDoc | null }

type Loop = { deps: GcalDeps; run(kind: 'pull' | 'push'): Promise<SyncNowResult> }

let active: Loop | null = null
const pending = new Set<Promise<unknown>>()

function track<T>(p: Promise<T>): Promise<T> {
  pending.add(p)
  const done = () => {
    pending.delete(p)
  }
  p.then(done, done)
  return p
}

/** 지금 하는 맞춤(받기·보내기·잠금 잡기)이 다 끝날 때까지 기다린다(시험·화면이 결과를 본 뒤 그리게) */
export async function gcalIdle(): Promise<void> {
  while (pending.size) await Promise.allSettled([...pending])
}

function defaultEnv(): LoopEnv {
  const nav = typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { locks?: unknown })
  return {
    locks: nav?.locks ? (nav.locks as unknown as LockLike) : null,
    doc: typeof document === 'undefined' ? null : document,
  }
}

/** 이은 병원에서 맞춤을 돌린다(GcalSync가 부름). 돌려준 함수로 멈춘다 — 잠금을 놓고 타이머·듣기를 거둔다 */
export function startGcalLoop(deps: GcalDeps, env: LoopEnv = defaultEnv()): () => void {
  const locks = env.locks ?? null
  const doc = env.doc ?? null
  let stopped = false
  let leader = false
  let acquiring = false
  let release: (() => void) | null = null
  let lastPull = Number.NEGATIVE_INFINITY
  let queue: Promise<unknown> = Promise.resolve()

  const once = async (kind: 'pull' | 'push'): Promise<SyncNowResult> => {
    setGcalStatus({ running: true })
    let result: SyncNowResult
    try {
      if (kind === 'pull') {
        const pulled = await pullOnce(deps)
        lastPull = Date.now()
        if (!pulled.ok) result = { ok: false, code: pulled.code }
        else {
          const pushed = await pushWaiting(deps)
          result = pushed.ok ? { ok: true, changed: pulled.changed, sent: pushed.sent, at: pulled.at } : { ok: false, code: pushed.code }
        }
      } else {
        const pushed = await pushWaiting(deps)
        result = pushed.ok ? { ok: true, changed: 0, sent: pushed.sent, at: deps.now().toISOString() } : { ok: false, code: pushed.code }
      }
    } catch {
      result = { ok: false, code: null }
    }
    const status = await refreshGcalStatus(deps).catch(() => getGcalStatus())
    const failing = status.linked && (status.failCode !== null || (!result.ok && result.code !== null))
    setGcalStatus({ running: false, nextTryAt: failing ? new Date(Date.now() + TICK_MS).toISOString() : null })
    return result
  }

  const run = (kind: 'pull' | 'push'): Promise<SyncNowResult> => {
    const next = queue.then(() => once(kind))
    queue = next.catch(() => undefined)
    return track(next)
  }

  const lead = () => {
    if (stopped || leader || acquiring) return
    if (!locks) {
      leader = true
      void run('pull')
      return
    }
    acquiring = true
    const got = new Promise<boolean>((resolve) => {
      locks
        .request(GCAL_LOCK, { ifAvailable: true }, (lock) => {
          if (!lock || stopped) {
            resolve(false)
            return undefined
          }
          resolve(true)
          return new Promise<void>((done) => {
            release = done // 멈출 때까지 쥔다
          })
        })
        .catch(() => resolve(false))
    })
    void track(
      got.then((ok) => {
        acquiring = false
        if (!ok || stopped) return
        leader = true
        return run('pull')
      }),
    )
  }

  const tick = () => {
    if (stopped) return
    if (!leader) return lead()
    const status = getGcalStatus()
    const due = Date.now() - lastPull >= status.pullMin * 60_000 || status.failCode !== null
    void run(due ? 'pull' : 'push')
  }

  const onVisible = () => {
    if (!stopped && leader && doc?.visibilityState === 'visible') void run('pull')
  }

  const loop: Loop = { deps, run }
  active = loop
  const timer = setInterval(tick, TICK_MS)
  doc?.addEventListener('visibilitychange', onVisible)
  void track(refreshGcalStatus(deps).catch(() => getGcalStatus()))
  lead()

  return () => {
    if (stopped) return
    stopped = true
    clearInterval(timer)
    doc?.removeEventListener('visibilitychange', onVisible)
    release?.()
    release = null
    if (active === loop) active = null
  }
}

/** 돌고 있는 맞춤의 deps(없으면 null) */
export function activeGcalDeps(): GcalDeps | null {
  return active?.deps ?? null
}

/** 예약 탭에 들어옴: 바로 한 번 받는다(이끄는 탭이 아니어도) */
export function requestPull(): void {
  if (active) void active.run('pull')
}

/** [지금 맞추기]·[다시 시도]: 바로 받고 보내 바뀐 수·시각(또는 번호). 돌고 있지 않으면 { ok: false, code: null } */
export async function syncNow(): Promise<SyncNowResult> {
  return active ? active.run('pull') : { ok: false, code: null }
}

/** 저장한 예약 하나를 바로 보낸다(pushAppt + 상태 다시 읽기). 맞춤이 돌고 있지 않으면 보내지 않는다 */
export async function sendAppt(appt: CalAppt): Promise<PushOutcome> {
  const loop = active
  if (!loop) return { ok: false, code: null }
  const out = await track(pushAppt(loop.deps, appt))
  await track(refreshGcalStatus(loop.deps).catch(() => getGcalStatus()))
  return out
}

/** 그날 off 줄을 바로 보낸다(직원 탭 휴가 저장 뒤 날마다, 못 보내면 조용히 다음 맞춤) */
export async function sendOffDay(day: string): Promise<PushOutcome> {
  const loop = active
  if (!loop) return { ok: false, code: null }
  const out = await track(pushOffDay(loop.deps, day))
  await track(refreshGcalStatus(loop.deps).catch(() => getGcalStatus()))
  return out
}
