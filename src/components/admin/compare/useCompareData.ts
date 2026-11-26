'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadHospital, type CompareRaw } from '@/lib/admin/compare/load'
import { compareMonths, type CompareMonths } from '@/lib/admin/compare/months'
import { payByJob, type PayByJob, type PayLineIn, type PayMember } from '@/lib/admin/compare/pay'
import { compareSales, isUisClinic, representative, type CompareRow, type Representative } from '@/lib/admin/compare/rank'
import type { SalesRow } from '@/lib/admin/compare/sales'
import { ownFirst } from '@/lib/admin/compare/sort'
import { REGION_UNKNOWN, regionOf } from '@/lib/admin/region'
import { addMonths, isMonth, isYmd, monthOf } from '@/lib/analytics/dates'
import { listViewHospitals, type ViewHospital } from '@/lib/auth/adminView'
import { readCompareFirstMonth } from '@/lib/auth/adminSync'
import { readAdminRows } from '@/lib/storage/adminRows'
import { DEFAULT_PAY_ITEMS, EMPLOYMENTS, INCENTIVE_METHODS, STAFF_JOBS, type IncentiveEntry, type PayItem } from '@/types/staff'
import type { ComparePick } from './ComparePickers'
import type { SideClinic } from './CompareStats'
import { compareStatsInput, type CompareStatsCells } from './statsInput'

// 의원 비교 불러오기(spec admin-view REQ-8017 AC-8017.2·AC-8017.3, REQ-8023 AC-8023.4, design.md '의원 비교 — 불러오기와 한도'·'의원 비교 달 10년').
// 화면을 열 때 승인된 의원 목록(listViewHospitals)과 가장 이른 달(readCompareFirstMonth)을 한 번씩 읽는다(지역·달을 바꿔도 다시 안 읽음).
// 고른 지역 안 의원마다(전체 = 모두, 한도 없음) loadHospital(readAdminRows, 의원, 달)로 admin_rows 열여덟 종류를 읽는다 — 한 번에 세 의원까지,
// 내 의원 먼저 + 이름 차례로, 끝난 의원부터 칸을 채운다. 같은 (의원, 달)은 화면을 떠나기 전까지 다시 읽지 않고, 읽지 못한 의원만 failed
// ([다시 불러오기]로만 다시 읽는다). 표 셋의 값(매출·월급·대표 숫자)은 읽자마자 만든다. 나란히 보기 값(compareStatsInput)은 지역을 골랐을 때만
// 만들고, 만든 뒤에는 읽은 줄을 버린다(전체에서 읽은 의원은 나중에 지역을 고를 때 다시 읽지 않으려고 그때까지만 줄을 든다).
// 읽기만 한다: 쓰기 요청·Web Worker·비트 연결이 없다. 줄 검사는 계산 함수(rank·statsInput)가 지금 줄 검사로 하고, 직원·급여 줄은 여기서 가볍게 고른다.
// 의사랑 의원(spec uisarang-upload REQ-8813): 같은 읽기에 admin_uis_rows 두 종류가 들고(함수가 아직 없으면 loadHospital이 빈 목록으로 받음 — AC-8813.7),
// 읽은 뒤 clinic_emr이 uisarang이면 표 줄·나란히 보기 칸에 uis를 단다(이름 옆 '의사랑' 칩 · AC-8813.1). 매출·환자 수는 compareSales(AC-8813.2)

const LIMIT = 3
const ALL = '전체'

type Done = {
  state: 'done'
  uis: boolean
  sales: SalesRow | null
  pay: PayByJob
  rep: Representative
  side: CompareStatsCells | null
  raw: CompareRaw | null
}
type Entry = { state: 'reading' } | { state: 'failed' } | Done

/** 고르기·표·나란히 보기가 함께 쓰는 값 */
export type CompareData = {
  /** loading = 의원 목록·가장 이른 달을 읽는 중, failed = 그 둘 가운데 하나를 읽지 못함(E-PAGE-FAILED) */
  status: 'loading' | 'failed' | 'ready'
  /** 고를 수 있는 달(ready일 때만) */
  months: CompareMonths | null
  pick: ComparePick
  setPick(next: ComparePick): void
  /** 고른 지역 안 의원 수 */
  count: number
  /** 지역 모름인 승인된 의원이 있나 */
  unknownRegion: boolean
  /** 표 셋(순위·월급·매출)의 줄 — 지역 안 의원 모두. 읽는 중·실패 의원은 값이 null */
  rows: CompareRow[]
  /** 나란히 보기 의원 칸 — 지역을 골랐을 때만, 전체면 빈 목록 */
  side: SideClinic[]
  /** 지역 안에 아직 읽는 의원이 있나 */
  reading: boolean
  /** 지역 안 읽지 못한 의원(내 의원 먼저 + 이름 차례) */
  failed: { id: string; name: string }[]
  /** 그 의원을 고른 달로 다시 읽는다(실패한 의원만) */
  retry(id: string): void
  /** 지역 안 실패 의원 모두를 다시 읽는다 */
  retryFailed(): void
  /** 의원 목록·가장 이른 달을 다시 읽는다(status failed일 때) */
  reload(): void
}

type Clinic = { id: string; name: string; own: boolean; region: string; sido: string | null }

const keyOf = (id: string, month: string) => `${id}|${month}`
const splitKey = (key: string): [string, string] => {
  const at = key.lastIndexOf('|')
  return [key.slice(0, at), key.slice(at + 1)]
}

// ── 직원·급여 줄 고르기(admin_rows 칸: 이름·연락처·계좌 없음). 모양이 틀린 줄은 뺀다(lib/storage/staff.ts 읽기와 같은 뜻의 가벼운 검사) ──

type Row = Record<string, unknown>
const isRecord = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value)
const isFilled = (value: unknown): value is string => typeof value === 'string' && value !== ''
const isDay = (value: unknown): value is string => typeof value === 'string' && isYmd(value)
const isMonthText = (value: unknown): value is string => typeof value === 'string' && isMonth(value)
const isWhole = (value: unknown): value is number => Number.isSafeInteger(value)
const isMoney = (value: unknown): value is number => isWhole(value) && value >= 0
const isMoneyOrNull = (value: unknown): value is number | null => value === null || isMoney(value)
const isOneOf = <T>(list: readonly T[], value: unknown): value is T => (list as readonly unknown[]).includes(value)

function memberOf(row: Row): PayMember | null {
  const { id, job, employment, hired_on: hiredOn, left_on: leftOn } = row
  if (!isFilled(id) || !isOneOf(STAFF_JOBS, job) || !isOneOf(EMPLOYMENTS, employment) || !isDay(hiredOn)) return null
  if (!(leftOn === null || isDay(leftOn))) return null
  return { id, job, employment, hiredOn, leftOn }
}

function entryOf(value: unknown): IncentiveEntry | null {
  if (!isRecord(value)) return null
  const { ruleId, name, method, unitAmount, percent, count, sales } = value
  if (!(ruleId === null || isFilled(ruleId)) || typeof name !== 'string' || !isOneOf(INCENTIVE_METHODS, method)) return null
  if (!isMoneyOrNull(unitAmount) || !(percent === null || (typeof percent === 'number' && percent >= 0 && percent <= 100))) return null
  if (!isMoneyOrNull(count) || !isMoneyOrNull(sales)) return null
  return { ruleId, name, method, unitAmount, percent, count, sales }
}

function lineOf(row: Row): PayLineIn | null {
  const { month, staff_id: staffId, amounts, incentives, adjust } = row
  if (!isMonthText(month) || !(staffId === null || isFilled(staffId)) || !isRecord(amounts) || !Array.isArray(incentives) || !isWhole(adjust)) return null
  if (!Object.values(amounts).every(isMoney)) return null
  const entries = incentives.map(entryOf)
  if (!entries.every((entry) => entry !== null)) return null
  return { month, staffId, amounts: amounts as Record<string, number>, incentives: entries as IncentiveEntry[], adjust }
}

// 급여 항목: 설정 줄이 없거나 틀리면 직원 탭과 같은 기본 항목
function itemsOf(raw: CompareRaw): PayItem[] {
  const value = raw.staff_settings[0]?.pay_items
  const fallback = () => DEFAULT_PAY_ITEMS.map((item) => ({ ...item }))
  if (!Array.isArray(value)) return fallback()
  const items: PayItem[] = []
  for (const item of value as unknown[]) {
    if (!isRecord(item)) return fallback()
    const { id, name, kind, base, removedFrom } = item
    if (!isFilled(id) || typeof name !== 'string' || !(kind === 'amount' || kind === 'incentive') || typeof base !== 'boolean') return fallback()
    if (!(removedFrom === null || isMonthText(removedFrom))) return fallback()
    items.push({ id, name, kind, base, removedFrom })
  }
  return items
}

function payOf(raw: CompareRaw, month: string): PayByJob {
  return payByJob({
    lines: raw.staff_pay.flatMap((row) => lineOf(row) ?? []),
    members: raw.staff_members.flatMap((row) => memberOf(row) ?? []),
    items: itemsOf(raw),
    month,
  })
}

/** 읽은 줄 → 표 셋의 값(+ 지역을 골랐으면 나란히 보기 값을 만들고 줄은 버림) */
function doneOf(raw: CompareRaw, month: string, withSide: boolean): Done {
  const side = withSide ? compareStatsInput(raw, month) : null
  return {
    state: 'done',
    uis: isUisClinic(raw),
    sales: compareSales(raw, month),
    pay: payOf(raw, month),
    rep: representative(raw, month),
    side,
    raw: side === null ? raw : null,
  }
}

const inRegion = (clinic: Clinic, region: string) => region === ALL || (region === REGION_UNKNOWN ? clinic.sido === null : clinic.sido === region)

export function useCompareData(today: string): CompareData {
  const [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState<CompareData['status']>('loading')
  const [hospitals, setHospitals] = useState<readonly ViewHospital[]>([])
  const [first, setFirst] = useState<string | null>(null)
  const [pick, setPickState] = useState<ComparePick>(() => ({ region: ALL, month: addMonths(monthOf(today), -1) }))
  const [entries, setEntries] = useState<ReadonlyMap<string, Entry>>(() => new Map())

  // 읽기 차례(화면 상태가 아님): 기다리는 (의원, 달), 읽는 중, 시작했거나 끝난 것(다시 읽지 않으려고), 지금 고른 지역, 화면이 떠 있나
  const queue = useRef<string[]>([])
  const active = useRef(new Set<string>())
  const known = useRef(new Set<string>())
  const regionNow = useRef<string>(ALL)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  // 의원 목록 · 가장 이른 달: 화면을 열 때 한 번(reload 때만 다시)
  useEffect(() => {
    let live = true
    Promise.all([listViewHospitals(), readCompareFirstMonth()]).then(
      ([list, month]) => {
        if (!live) return
        setHospitals(list)
        setFirst(month)
        setStatus('ready')
      },
      () => {
        if (live) setStatus('failed')
      },
    )
    return () => {
      live = false
    }
  }, [attempt])

  const put = useCallback((key: string, entry: Entry) => {
    setEntries((now) => new Map(now).set(key, entry))
  }, [])

  // 한 번에 LIMIT 곳까지. 끝나면(성공·실패) 다음 의원을 시작한다. 화면을 떠났으면 결과를 버리고 더 시작하지 않는다
  const pump = useCallback(() => {
    while (alive.current && active.current.size < LIMIT && queue.current.length > 0) {
      const key = queue.current.shift()!
      if (known.current.has(key)) continue
      known.current.add(key)
      active.current.add(key)
      put(key, { state: 'reading' })
      const [id, month] = splitKey(key)
      void (async () => {
        let entry: Entry
        try {
          entry = doneOf(await loadHospital(readAdminRows, id, month), month, regionNow.current !== ALL)
        } catch {
          entry = { state: 'failed' }
        }
        active.current.delete(key)
        if (!alive.current) return
        put(key, entry)
        pump()
      })()
    }
  }, [put])

  const clinics = useMemo<Clinic[]>(
    () =>
      ownFirst(
        hospitals.map((h) => {
          const sido = regionOf(h.address, h.regionSet ? h.region : undefined)
          return { id: h.hospitalId, name: h.name, own: h.mine, region: sido ?? REGION_UNKNOWN, sido }
        }),
      ),
    [hospitals],
  )
  const shown = useMemo(() => clinics.filter((clinic) => inRegion(clinic, pick.region)), [clinics, pick.region])

  // 지역·달을 고르면 그 안에서 아직 시작하지 않은 의원만 줄을 세운다(앞서 고른 곳의 기다리던 의원은 뺀다 — 읽는 중인 것은 끝까지 읽는다)
  useEffect(() => {
    if (status !== 'ready') return
    queue.current = shown.map((clinic) => keyOf(clinic.id, pick.month)).filter((key) => !known.current.has(key))
    pump()
  }, [status, shown, pick.month, pump])

  // 지역을 고르면 전체에서 읽어 둔 의원의 나란히 보기 값을 그때 만들고 줄을 버린다(다시 읽지 않음)
  useEffect(() => {
    if (pick.region === ALL) return
    const made = new Map<string, CompareStatsCells>()
    for (const clinic of shown) {
      const key = keyOf(clinic.id, pick.month)
      const entry = entries.get(key)
      if (entry?.state === 'done' && entry.side === null && entry.raw !== null) made.set(key, compareStatsInput(entry.raw, pick.month))
    }
    if (made.size === 0) return
    setEntries((now) => {
      const next = new Map(now)
      for (const [key, side] of made) {
        const entry = next.get(key)
        if (entry?.state === 'done' && entry.side === null) next.set(key, { ...entry, side, raw: null })
      }
      return next
    })
  }, [pick.region, pick.month, shown, entries])

  const setPick = useCallback((next: ComparePick) => {
    regionNow.current = next.region
    setPickState(next)
  }, [])

  const again = useCallback(
    (keys: readonly string[]) => {
      const failed = keys.filter((key) => entries.get(key)?.state === 'failed' && !active.current.has(key))
      if (failed.length === 0) return
      for (const key of failed) known.current.delete(key)
      queue.current = [...failed, ...queue.current.filter((key) => !failed.includes(key))]
      pump()
    },
    [entries, pump],
  )

  const reload = useCallback(() => {
    setStatus('loading')
    setAttempt((n) => n + 1)
  }, [])

  const entryAt = (id: string) => entries.get(keyOf(id, pick.month))
  const rows: CompareRow[] = shown.map((clinic) => {
    const entry = entryAt(clinic.id)
    const done = entry?.state === 'done' ? entry : null
    return {
      id: clinic.id,
      name: clinic.name,
      own: clinic.own,
      region: clinic.region,
      sales: done?.sales ?? null,
      pay: done?.pay ?? null,
      rep: done?.rep ?? null,
      uis: done?.uis ?? false,
    }
  })
  const side: SideClinic[] =
    pick.region === ALL
      ? []
      : shown.map((clinic) => {
          const entry = entryAt(clinic.id)
          const cells = entry?.state === 'failed' ? 'failed' : entry?.state === 'done' && entry.side !== null ? entry.side : 'reading'
          return { id: clinic.id, name: clinic.name, region: clinic.region, own: clinic.own, uis: entry?.state === 'done' && entry.uis, cells }
        })
  const failed = shown.filter((clinic) => entryAt(clinic.id)?.state === 'failed').map((clinic) => ({ id: clinic.id, name: clinic.name }))
  const reading = shown.some((clinic) => {
    const entry = entryAt(clinic.id)
    return entry === undefined || entry.state === 'reading'
  })

  return {
    status,
    months: status === 'ready' ? compareMonths(first, today) : null,
    pick,
    setPick,
    count: shown.length,
    unknownRegion: clinics.some((clinic) => clinic.sido === null),
    rows,
    side,
    reading,
    failed,
    retry: (id) => again([keyOf(id, pick.month)]),
    retryFailed: () => again(failed.map((clinic) => keyOf(clinic.id, pick.month))),
    reload,
  }
}
