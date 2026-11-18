'use client'

import { useMemo } from 'react'
import { formatCount } from '@/components/charts/format'
import { ErrorCard } from '@/components/common/ErrorCard'
import type { WideDays } from '@/components/stats/useWideDays'
import { ds } from '@/components/ui/classes'
import { holidayEffect, type HolidayRow } from '@/lib/analytics/holidayEffect'
import { Note, Section } from './parts'

// 휴일에 따라 (stats-insights REQ-6107 AC-6107.3, 시안 docs/mockups/stats-insights ⑦ — 사용자 결정 '휴일만': 날씨 줄 없음 · 진료 운영 칸).
// 최근 12달 저장된 하루 내원 수로 평소 · 연휴 전날 · 연휴 다음 날을 같은 요일끼리 견준 표(lib/analytics/holidayEffect)를 그대로 그린다.
// 평소 줄의 평소보다는 '—', 날 수가 5보다 적은 줄은 그 자리에 '아직 적어요'(흐림). 적으면 빨강·많으면 초록이고 부호(−·+)로도 읽힌다.
// 넓은 하루를 읽는 중이거나 저장된 날이 없으면 칸을 그리지 않는다. 읽기에 실패하면 오류 카드 + [다시 읽기].
// 병원 휴진일(clinic-profile AC-6606.2)은 통계 틀이 병원 정보에서 읽어 closedDates로 넘기고, 셈(holidayEffect)이 공휴일과 함께 본다

const TITLE = '휴일에 따라'
const NOTE = '최근 12달, 같은 요일끼리 견줘요. 공휴일은 2025~2027년 것이 들어 있어요.'
const RETRY = '다시 읽기'
const FEW = '아직 적어요'
const FEW_DAYS = 5
const NONE = '—'
const MINUS = '−'
const COLUMNS = ['날', '날 수', '하루 평균 내원', '평소보다']
// 숫자 표(원장님별 표와 같은 모양): 첫 칸 왼쪽, 나머지 오른쪽, 머리는 흐린 600
const TH = 'whitespace-nowrap border-b border-st-line px-4 py-2 text-right text-small font-semibold text-st-muted first:pl-0 first:text-left'
const TD = 'whitespace-nowrap border-b border-st-line px-4 py-3 text-right tabular-nums text-st-ink-2 first:pl-0 first:text-left first:font-semibold first:text-st-ink'

function VsUsual({ row }: { row: HolidayRow }) {
  if (row.key === 'usual') return <>{NONE}</>
  if (row.days < FEW_DAYS) return <span className="text-st-muted">{FEW}</span>
  if (row.vsUsual === null) return <>{NONE}</>
  if (row.vsUsual === 0) return <span className="text-st-muted">0%</span>
  const more = row.vsUsual > 0
  return <span className={`font-semibold ${more ? 'text-positive' : 'text-negative'}`}>{`${more ? '+' : MINUS}${Math.abs(row.vsUsual)}%`}</span>
}

const NO_CLOSED: readonly string[] = []

export function HolidaySection({ today, wide, closedDates = NO_CLOSED }: { today: string; wide: WideDays; closedDates?: readonly string[] }) {
  const ready = wide.state === 'ready'
  const rows = useMemo(() => (ready ? holidayEffect({ today, days: wide.days, closedDates }) : null), [ready, today, wide.days, closedDates])

  if (wide.state === 'failed') {
    return (
      <Section title={TITLE}>
        <div className="mt-3">
          <ErrorCard code="E-STATS-READ-FAILED" />
        </div>
        <div className="mt-2">
          <button type="button" onClick={wide.retry} className={`${ds.button.secondarySmall} max-md:w-full`}>
            {RETRY}
          </button>
        </div>
      </Section>
    )
  }
  if (rows === null) return null
  return (
    <Section title={TITLE}>
      <div className="mt-1 max-w-160 overflow-x-auto">
        <table className="w-full border-collapse text-st-15 leading-6">
          <caption className="sr-only">휴일에 따라 하루 평균 내원</caption>
          <thead>
            <tr>
              {COLUMNS.map((column) => (
                <th key={column} scope="col" className={TH}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td className={TD}>{row.name}</td>
                <td className={TD}>{`${formatCount(row.days)}일`}</td>
                <td className={TD}>{row.average === null ? NONE : `${formatCount(row.average)}명`}</td>
                <td className={TD}>
                  <VsUsual row={row} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Note>{NOTE}</Note>
    </Section>
  )
}
