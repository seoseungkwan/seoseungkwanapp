'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { addDays, addMonths, monthRange } from '@/lib/analytics/dates'
import { lineTotal, type RevenueDay } from '@/lib/staff/pay'
import type { RuleDraft } from '@/lib/storage/staff'
import type { StaffBase } from '@/components/staff/useStaffBase'
import type { DateRange } from '@/types/dates'
import type { IncentiveRule, Leave, Overtime, PayLine, PayMonth } from '@/types/staff'

// 급여 화면 읽기·저장 (staff REQ-7615, design.md 6절 '급여'). 보는 달 M이 바뀌면 다시 읽는다:
// 급여 줄·달 줄은 M과 앞 5달(인건비 그림 6달 · 지난달 금액·지난달보다), 인센티브 규칙 모두, 더 일한 시간은 M만,
// 휴가는 가장 이른 입사일 ~ M 끝 + 1년(남은 연차·정산 셈은 기간 처음부터, 앞날 휴가도 센다).
// 매출(sales_days)은 따로 읽어 실패해도 나머지는 그대로다('매출 자료 없음').
// 금액·실적 칸은 칸에서 나갈 때 그 줄 하나만 저장한다: 화면 값은 바로 바꾸고, 같은 줄을 저장하는 중이면 끝난 뒤 마지막 값으로 한 번 더.
// 합계가 0원 밑인 줄은 저장하지 않는다(AC-7606.2 — 화면은 까닭을 보인다). 실패하면 값은 화면에 남고 saveFailed가 켜진다.
// 실패는 줄(달·직원)·달 줄·규칙(직원)마다 기억한다: 다른 줄 저장이 성공해도 실패한 줄이 남아 있는 동안은 saveFailed 그대로이고,
// 그 줄을 다시 저장해 성공하거나 다시 읽어 화면 줄이 DB 값으로 바뀌면 지운다(AC-7615.2).
// 같은 달을 다시 읽는 동안은 앞서 읽은 값을 그대로 보인다. 자료는 React 상태에만 둔다

const SPAN = 6 // 인건비 그림 달 수
const AHEAD_DAYS = 366 // 앞날 휴가(이번 연차 기간 끝까지)
// 항목을 뺄 때 금액을 찾는 범위(모든 달)
const ALL_FROM = '2000-01'
const ALL_TO = '2999-12'

export type LoadRevenue = (range: DateRange) => Promise<readonly RevenueDay[]>

export type PayData = { lines: PayLine[]; months: PayMonth[]; rules: IncentiveRule[]; overtime: Overtime[]; leaves: Leave[] }
export type RevenueRead = { state: 'reading' | 'ready' | 'failed'; days: readonly RevenueDay[] }

type Held = { key: string; month: string; value: PayData | 'failed' }
type Queue = { running: boolean; next: PayLine | null }

const lineKey = (line: Pick<PayLine, 'month' | 'staffId'>) => `line:${line.month}|${line.staffId}`

const sameLine = (a: Pick<PayLine, 'month' | 'staffId'>, b: Pick<PayLine, 'month' | 'staffId'>) => a.month === b.month && a.staffId === b.staffId

function withoutPrefix(keys: ReadonlySet<string>, prefix: string): ReadonlySet<string> {
  const kept = [...keys].filter((key) => !key.startsWith(prefix))
  return kept.length === keys.size ? keys : new Set(kept)
}

function putLine(lines: readonly PayLine[], line: PayLine): PayLine[] {
  const at = lines.findIndex((row) => sameLine(row, line))
  return at < 0 ? [...lines, line] : lines.map((row, i) => (i === at ? line : row))
}

export function usePayData(base: StaffBase, month: string, loadRevenue: LoadRevenue) {
  const { store, members, settings, state: baseState } = base
  const [attempt, setAttempt] = useState(0)
  const [held, setHeld] = useState<Held | null>(null)
  const [revenue, setRevenue] = useState<{ month: string; read: RevenueRead } | null>(null)
  // 저장이 실패한 것들('line:{달}|{직원}' · 'month:{달}' · 'rules:{직원}')
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set())
  const queues = useRef(new Map<string, Queue>())

  const firstHire = members.reduce<string | null>((min, m) => (min === null || m.hiredOn < min ? m.hiredOn : min), null)
  const key = `${month}|${attempt}|${firstHire ?? ''}`

  useEffect(() => {
    if (baseState !== 'ready') return
    let current = true
    const range = monthRange(month)
    const from = addMonths(month, -(SPAN - 1))
    const leaveFrom = firstHire !== null && firstHire < range.from ? firstHire : range.from
    Promise.all([
      store.listPayLines(from, month),
      store.listPayMonths(from, month),
      store.listRules(),
      store.listOvertime(range),
      store.listLeaves({ from: leaveFrom, to: addDays(range.to, AHEAD_DAYS) }),
    ]).then(
      ([lines, months, rules, overtime, leaves]) => {
        if (!current) return
        setHeld({ key, month, value: { lines, months, rules, overtime, leaves } })
        // 화면 줄이 다시 읽은 DB 값이 됐다 — 실패한 줄 값은 더 남아 있지 않다
        setFailed((now) => withoutPrefix(now, 'line:'))
      },
      () => {
        if (current) setHeld({ key, month, value: 'failed' })
      },
    )
    return () => {
      current = false
    }
  }, [key, month, baseState, store, firstHire])

  useEffect(() => {
    let current = true
    const range = { from: monthRange(addMonths(month, -(SPAN - 1))).from, to: monthRange(month).to }
    Promise.resolve()
      .then(() => loadRevenue(range))
      .then(
        (days) => {
          if (current) setRevenue({ month, read: { state: 'ready', days } })
        },
        () => {
          if (current) setRevenue({ month, read: { state: 'failed', days: [] } })
        },
      )
    return () => {
      current = false
    }
  }, [month, loadRevenue])

  // 같은 달이면 다시 읽는 중에도 앞 값을 보인다. 다른 달이면 읽는 중
  const shown = held !== null && held.month === month ? held : null
  const data = shown !== null && shown.value !== 'failed' ? shown.value : null
  const state: 'loading' | 'ready' | 'failed' =
    baseState === 'failed' ? 'failed' : data !== null ? 'ready' : shown !== null && shown.key === key ? 'failed' : 'loading'

  const reload = useCallback(() => setAttempt((n) => n + 1), [])

  const mark = useCallback((key: string, ok: boolean) => {
    setFailed((now) => {
      if (now.has(key) !== ok) return now
      const next = new Set(now)
      if (ok) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const setLocal = useCallback((line: PayLine) => {
    setHeld((now) => (now === null || now.value === 'failed' ? now : { ...now, value: { ...now.value, lines: putLine(now.value.lines, line) } }))
  }, [])

  const run = useCallback(
    async (id: string, queue: Queue) => {
      queue.running = true
      while (queue.next !== null) {
        const line = queue.next
        queue.next = null
        try {
          const saved = await store.savePayLine(line)
          mark(lineKey(line), true)
          // 새 줄 번호만 붙인다(그사이 더 고친 값은 화면 값 그대로)
          setHeld((now) => {
            if (now === null || now.value === 'failed') return now
            const lines = now.value.lines.map((row) => (sameLine(row, saved) ? { ...row, id: saved.id } : row))
            return { ...now, value: { ...now.value, lines } }
          })
          // 저장하는 동안 들어온 값(위 await 뒤라 TS는 null로만 본다)
          const pending = queue.next as PayLine | null
          if (pending !== null) queue.next = { ...pending, id: saved.id }
        } catch {
          mark(lineKey(line), false)
        }
      }
      queue.running = false
      queues.current.delete(id)
    },
    [store, mark],
  )

  /** 줄 하나를 화면에 바로 보이고 저장한다. 합계가 0원 밑이면 화면에만 둔다 */
  const saveLine = useCallback(
    (line: PayLine) => {
      setLocal(line)
      if (lineTotal(line, settings.payItems, line.month).problem !== null) return
      const id = lineKey(line)
      const queue = queues.current.get(id) ?? { running: false, next: null }
      queues.current.set(id, queue)
      queue.next = line
      if (!queue.running) void run(id, queue)
    },
    [setLocal, settings.payItems, run],
  )

  /** 달 줄(병원 부담분·가져온 날) 저장. 성공하면 true */
  const saveMonth = useCallback(
    async (row: PayMonth): Promise<boolean> => {
      try {
        const saved = await store.savePayMonth(row)
        mark(`month:${row.month}`, true)
        setHeld((now) => {
          if (now === null || now.value === 'failed') return now
          return { ...now, value: { ...now.value, months: [...now.value.months.filter((m) => m.month !== saved.month), saved] } }
        })
        return true
      } catch {
        mark(`month:${row.month}`, false)
        return false
      }
    },
    [store, mark],
  )

  /** 한 사람 인센티브 규칙 저장(보는 달부터 줄에 들어감) → 규칙·줄을 다시 읽는다. 성공하면 true */
  const saveRules = useCallback(
    async (staffId: string, drafts: readonly RuleDraft[]): Promise<boolean> => {
      try {
        await store.saveRules(staffId, drafts, month)
        mark(`rules:${staffId}`, true)
        reload()
        return true
      } catch {
        mark(`rules:${staffId}`, false)
        return false
      }
    },
    [store, month, reload, mark],
  )

  /** 모든 달 급여 줄(항목을 뺄 때 금액이 있었는지 본다) */
  const allLines = useCallback(() => store.listPayLines(ALL_FROM, ALL_TO), [store])

  const revenueRead: RevenueRead = revenue !== null && revenue.month === month ? revenue.read : { state: 'reading', days: [] }

  return { state, data, revenue: revenueRead, saveFailed: failed.size > 0, reload, saveLine, saveMonth, saveRules, allLines }
}

export type PayRead = ReturnType<typeof usePayData>
