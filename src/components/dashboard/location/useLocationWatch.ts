'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { queryLocation } from '@/components/location/clients'
import { addDays, addMonthsToDay, compareYmd } from '@/lib/analytics/dates'
import { DEFAULT_DEPT_RULE } from '@/lib/location/depts'
import { dueCandidates, pickEvents, type LicenseFound, type WatchGroup } from '@/lib/location/watch'
import {
  addEvents,
  listUnseenEvents,
  listWatchCandidates,
  markEventsSeen,
  readDeptRule,
  setWatchChecked,
  type LocationClient,
} from '@/lib/storage/location'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { DeptRule, LicenseRow, WatchCandidate } from '@/types/location'
import { alertLines, type AlertLine } from './alertLines'

// 대시보드 새 경쟁 의원 알림 읽기 (specs/location REQ-7915 AC-7915.1~AC-7915.3, design.md 12절, 본보기 dashboard/warranty/useWarrantySoon).
// 관리자 대시보드를 열 때 한 번, 20초 한도로:
//   ⓪ 과목 고르기 설정(readDeptRule — 줄이 없거나 못 읽으면 처음 값)을 읽는다. 경쟁 과목이 0개면 확인도 알림 줄도 없다(바깥 자료를 부르지 않음).
//   ① 확인할 후보(내려놓지 않았고 마지막 확인이 30일 넘음·없음, 만든 차례 5곳 — dueCandidates)를 같은 기간끼리 묶어, 묶음마다
//      clinic-license 개업·폐업을 한 번씩 받고 후보 범위 안 경쟁 의원 줄(pickEvents, 그 설정의 경쟁 과목 = 대표 과목)을 넣은 뒤
//      (같은 줄은 DB가 한 번만 둔다) 그 후보들의 확인 날을 오늘로 고친다.
//      묶음의 답 하나라도 못 받으면(열쇠 없음·활용 신청 안 됨·실패·틀린 모양) 그 묶음은 넣지도 확인 날을 고치지도 않는다 → 다음에 같은 기간을 다시 본다.
//      줄 넣기가 실패해도 확인 날을 고치지 않는다. 기간이 받을 수 있는 가장 긴 기간(36달)을 넘으면 앞을 당긴다(오래 내려놓았다 되살린 후보가 막히지 않게).
//   ② 안 본 알림 줄을 읽어(①이 실패해도 읽는다) 후보 이름·대표 과목 짧은 이름을 붙이고 지금 설정의 경쟁 과목 줄만 남긴다(alertLines).
//      후보 이름은 ①에서 읽은 후보 목록에서 찾는다(후보 읽기가 실패하면 이름 없이).
// 관리자가 아니면(페이지가 넘긴 값이 거짓이거나 못 읽음) 아무것도 부르지 않는다. 한도·실패·클라이언트를 못 만듦·떠난 뒤 늦은 답은 모두 빈 목록이고,
// 오류를 밖으로 던지거나 글로 남기지 않는다. 다른 대시보드 숫자는 이 읽기를 기다리지 않는다(LiveDashboard가 따로 둔다).
// 다시 그려지거나 날짜가 바뀌어도 다시 읽지 않는다(다음에 대시보드를 열 때 새로 읽음).
// close(id)는 그 줄 하나만 바로 감추고 그 줄 하나만 본 것으로 적는다(같은 후보의 다른 줄은 그대로, 실패해도 조용히)

export const LOCATION_WATCH_TIMEOUT_MS = 20_000
/** clinic-license 한 번에 받는 기간 한도: 끝 ≤ 앞 + 36달(query.ts checkQuery) */
const MAX_MONTHS = 36

const NONE: readonly AlertLine[] = []

export type LocationWatch = { events: readonly AlertLine[]; close: (id: string) => void }

/** from이 있는 클라이언트일 때만 읽는다. 다른 화면 시험처럼 { auth }만 있는 흉내는 읽지 않는다 */
const canRead = (client: unknown): client is LocationClient => typeof (client as { from?: unknown } | null)?.from === 'function'

type Row = Record<string, unknown>
const isRecord = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v)
const isTextOrNull = (v: unknown): v is string | null => v === null || typeof v === 'string'

/** 점(위도·경도 숫자)·null만 받는다. 그 밖은 undefined(그 줄을 뺀다) */
function pointOf(v: unknown): LicenseRow['point'] | undefined {
  if (v === null) return null
  return isRecord(v) && Number.isFinite(v.lat) && Number.isFinite(v.lng) ? { lat: v.lat as number, lng: v.lng as number } : undefined
}

/** 답 값({ rows, capped })에서 줄만 새로 담는다. 모양이 틀린 줄은 빼고(날짜·점은 pickEvents가 다시 본다), 값 모양이 틀리면 null.
 * 업태 글(type)이 글자면 함께 옮긴다 — 치과의원·한의원은 업태로만 가른다(watch.ts deptOfText). 없거나 글자가 아니면 뺀다 */
function licenseRows(value: unknown): LicenseRow[] | null {
  if (!isRecord(value) || !Array.isArray(value.rows)) return null
  return value.rows.flatMap((r: unknown): LicenseRow[] => {
    if (!isRecord(r) || typeof r.name !== 'string' || typeof r.dept !== 'string' || !isTextOrNull(r.openedOn) || !isTextOrNull(r.closedOn)) return []
    const point = pointOf(r.point)
    if (point === undefined) return []
    const type = typeof r.type === 'string' ? { type: r.type } : {}
    return [{ name: r.name, dept: r.dept, openedOn: r.openedOn, closedOn: r.closedOn, point, ...type }]
  })
}

/** 기간 하나의 개업 또는 폐업. 못 받으면 null */
async function license(kind: 'open' | 'close', from: string, to: string): Promise<LicenseFound | null> {
  const reply = await queryLocation({ kind: 'clinic-license', event: kind, from, to })
  if (!reply.ok) return null
  const rows = licenseRows(reply.value)
  return rows === null ? null : { kind, from, to, rows }
}

/** 기간 앞이 끝에서 36달보다 앞이면 당긴다(하루 뒤로 — 그 날 + 36달이 말일 때문에 끝보다 앞이 되지 않게) */
function clampFrom(from: string, to: string): string {
  const earliest = addDays(addMonthsToDay(to, -MAX_MONTHS), 1)
  return compareYmd(from, earliest) < 0 ? earliest : from
}

async function checkGroup(client: LocationClient, group: WatchGroup, rule: DeptRule, today: string): Promise<void> {
  const from = clampFrom(group.from, group.to)
  const [opened, closed] = await Promise.all([license('open', from, group.to), license('close', from, group.to)])
  if (opened === null || closed === null) return
  const events = group.candidates.flatMap((c) => [...pickEvents(opened, c, rule), ...pickEvents(closed, c, rule)])
  if (events.length > 0) await addEvents(client, events)
  await Promise.all(group.candidates.map((c) => setWatchChecked(client, c.id, today).catch(() => undefined)))
}

/** ① 확인. 묶음마다 따로 실패한다(한 묶음이 실패해도 다른 묶음은 그대로) */
async function checkDue(client: LocationClient, candidates: readonly WatchCandidate[], rule: DeptRule, today: string): Promise<void> {
  const groups = dueCandidates(candidates, today)
  await Promise.all(groups.map((group) => checkGroup(client, group, rule, today).catch(() => undefined)))
}

/** ⓪ 설정. readDeptRule은 던지지 않지만, 무엇이든 못 읽으면 처음 값 */
const readRule = (client: LocationClient): Promise<DeptRule> => Promise.resolve().then(() => readDeptRule(client)).catch(() => DEFAULT_DEPT_RULE)

/** ⓪ 설정 → ① 확인 → ② 안 본 줄 읽기·줄 만들기 */
async function readWatch(today: string): Promise<readonly AlertLine[]> {
  const client = supabaseBrowser()
  if (!canRead(client)) return NONE
  const rule = await readRule(client)
  if (rule.rival.length === 0) return NONE
  const candidates = await listWatchCandidates(client).catch(() => null)
  if (candidates !== null) await checkDue(client, candidates, rule, today).catch(() => undefined)
  return alertLines(await listUnseenEvents(client), candidates ?? [], rule)
}

/** 한 번 읽기. 한도가 먼저 오거나 무엇이든 실패하면 빈 목록이고, 한도 뒤 늦게 온 답은 버린다 */
function readWithinLimit(today: string): Promise<readonly AlertLine[]> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(NONE), LOCATION_WATCH_TIMEOUT_MS)
    const settle = (events: readonly AlertLine[]) => {
      clearTimeout(timer)
      resolve(events)
    }
    Promise.resolve()
      .then(() => readWatch(today))
      .then(settle, () => settle(NONE))
  })
}

/** [닫기]: 그 줄 하나를 본 것으로 적는다. 실패는 조용히 넘긴다(다음에 열면 다시 뜬다) */
function markSeen(id: string): Promise<void> {
  return Promise.resolve()
    .then(() => {
      const client = supabaseBrowser()
      return canRead(client) ? markEventsSeen(client, [id]) : undefined
    })
    .catch(() => undefined)
}

/**
 * isAdmin: 관리자인지(페이지가 문지기 값에서 넘긴 참·거짓 또는 그 약속 — 못 읽으면 거짓).
 * today: 대시보드를 연 날의 한국 날짜('YYYY-MM-DD'). 둘 다 처음 받은 값으로 한 번만 읽는다
 */
export function useLocationWatch(isAdmin: boolean | PromiseLike<boolean>, today: string): LocationWatch {
  const [opened] = useState(() => ({ isAdmin, today }))
  const [events, setEvents] = useState<readonly AlertLine[]>(NONE)
  const [closedIds, setClosedIds] = useState<readonly string[]>([])

  useEffect(() => {
    let gone = false // 떠난 뒤에 온 답은 쓰지 않는다
    void Promise.resolve(opened.isAdmin)
      .then(
        (yes) => yes === true,
        () => false,
      )
      .then((yes) => (yes ? readWithinLimit(opened.today) : NONE))
      .then((found) => {
        if (!gone) setEvents(found)
      })
    return () => {
      gone = true
    }
  }, [opened])

  const close = useCallback((id: string) => {
    setClosedIds((ids) => (ids.includes(id) ? ids : [...ids, id]))
    void markSeen(id)
  }, [])

  const shown = useMemo(() => (closedIds.length === 0 ? events : events.filter((e) => !closedIds.includes(e.id))), [events, closedIds])
  return { events: shown, close }
}
