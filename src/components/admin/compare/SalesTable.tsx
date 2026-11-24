'use client'

import { formatCount } from '@/components/charts/format'
import { formatManWon } from '@/components/revenue/money'
import { StatsCard } from '@/components/stats/sections/parts'
import type { CompareRow } from '@/lib/admin/compare/rank'
import type { SalesRow } from '@/lib/admin/compare/sales'
import { ownFirst } from '@/lib/admin/compare/sort'
import { monthText } from './ComparePickers'
import { Empty, NameCell, NONE, SALES_COLUMNS, STICKY, STICKY_HEAD, TABLE, TABLE_WRAP, TD, TD_NA, TD_TONE, TFOOT_TD, TH, tableEmpty } from './RankTable'

// 의원 비교 매출·환자 수 표(spec admin-view REQ-8015 AC-8015.4·AC-8015.6, REQ-8023 AC-8023.3, design.md '화면 글자' 매출·환자 수).
// 시안 docs/mockups/admin-view ?s=compare 그대로: 칸 = 의원 + 다섯(값 모양은 순위 표와 같음), 줄 = 내 의원 먼저 + 이름 차례.
// 아래 줄 '전체 {n}곳'(숫자 없는 의원이 있으면 '· 숫자 있는 {k}곳 합') + 합 넷 + '의원 평균 {x}건'(숫자 있는 의원마다 하루 평균 내원의 평균, 소수 첫째 자리 버림)

const TITLE = '매출·환자 수'
const DESC = '저장된 숫자 · 총진료비는 수납한 날 기준'

type Key = (typeof SALES_COLUMNS)[number]['key']

// 아는 값만 더한다. 아는 의원이 없으면 null(–)
function sumOf(sales: readonly SalesRow[], key: Exclude<Key, 'dayAvg'>): number | null {
  let sum: number | null = null
  for (const row of sales) {
    const value = row[key]
    if (value !== null) sum = (sum ?? 0) + value
  }
  return sum
}

// 하루 평균 내원(소수 첫째 자리까지)의 의원 평균: 십분의 일 단위 정수로 더해 나눈 뒤 버린다(부동소수 찌꺼기 없음)
function dayAvgOf(sales: readonly SalesRow[]): string | null {
  const tenths = sales.flatMap((row) => (row.dayAvg === null ? [] : [Math.round(row.dayAvg * 10)]))
  if (tenths.length === 0) return null
  return `의원 평균 ${(Math.floor(tenths.reduce((total, value) => total + value, 0) / tenths.length) / 10).toFixed(1)}건`
}

type Props = { month: string; region: string; rows: readonly CompareRow[] }

export function SalesTable({ month, region, rows }: Props) {
  const ordered = ownFirst(rows)
  const empty = tableEmpty(rows, region, month)
  const showRegion = region === '전체'
  const sales = ordered.flatMap((row) => (row.sales === null ? [] : [row.sales]))
  const foot: (string | null)[] = [
    (() => {
      const total = sumOf(sales, 'total')
      return total === null ? null : formatManWon(total)
    })(),
    ...(['visits', 'newPatients', 'returnVisits'] as const).map((key) => {
      const value = sumOf(sales, key)
      return value === null ? null : `${formatCount(value)}${key === 'newPatients' ? '명' : '건'}`
    }),
    dayAvgOf(sales),
  ]

  return (
    <StatsCard id="cmp-sales" title={TITLE} desc={`${monthText(month)} · ${DESC}`}>
      <div>
        {empty ? (
          <Empty note={empty} />
        ) : (
          <div className={TABLE_WRAP}>
            <table aria-label={TITLE} className={`${TABLE} w-full`}>
              <thead>
                <tr>
                  <th className={`${STICKY_HEAD} border-b py-1.5 align-bottom font-semibold text-muted`}>의원</th>
                  {SALES_COLUMNS.map((column) => (
                    <th key={column.key} className={TH}>
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ordered.map((row) => (
                  <tr key={row.id} className="group">
                    <NameCell row={row} showRegion={showRegion} />
                    {SALES_COLUMNS.map((column) => {
                      const value = row.sales?.[column.key] ?? null
                      return (
                        <td key={column.key} className={`${TD} ${value === null ? TD_NA : TD_TONE}`}>
                          {value === null ? NONE : column.text(value)}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className={`${STICKY} h-10 border-t border-t-line-strong font-semibold text-ink`}>
                    {`전체 ${rows.length}곳`}
                    {sales.length < rows.length && <span className="text-caption font-normal text-muted">{` · 숫자 있는 ${sales.length}곳 합`}</span>}
                  </td>
                  {foot.map((text, index) => (
                    <td key={SALES_COLUMNS[index]!.key} className={text === null ? `${TFOOT_TD} ${TD_NA}` : `${TFOOT_TD} text-ink`}>
                      {text ?? NONE}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </StatsCard>
  )
}
