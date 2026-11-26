'use client'

import { useState } from 'react'
import { formatCount } from '@/components/charts/format'
import { Icon } from '@/components/common/Icon'
import { formatManWon } from '@/components/revenue/money'
import { EmptyNote, StatsCard } from '@/components/stats/sections/parts'
import { ds } from '@/components/ui/classes'
import type { PayByJob } from '@/lib/admin/compare/pay'
import { hasMonthNumbers, REPRESENTATIVE, type CompareRow } from '@/lib/admin/compare/rank'
import type { SalesRow } from '@/lib/admin/compare/sales'
import { FIRST_SORT, nextSort, sortRows, type SortState } from '@/lib/admin/compare/sort'
import { STAFF_JOBS } from '@/types/staff'
import { monthText } from './ComparePickers'

// 의원 비교 순위 표(spec admin-view REQ-8015 AC-8015.2·AC-8015.5·AC-8015.6, REQ-8023 AC-8023.3, design.md '대표 숫자 표'·'화면 글자' 의원 순위).
// 시안 docs/mockups/admin-view ?s=compare .rank 그대로: 묶음 머리 셋 아래 칸 열아홉, 첫 칸(순위·이름·내 의원·지역)은 왼쪽에 붙고 표 칸만 옆으로 민다.
// 처음 차례는 총진료비 내림차순, 칸 이름을 누르면 오름 → 내림(sort.ts). 빈 값 –는 늘 맨 아래. 의원 이름은 글자뿐이다(눌러 보기를 시작하지 않음).
// 월급·매출 표가 같이 쓰는 칸 모양(첫 칸·빈 글·값 글)도 여기 둔다. props만 받는다(PC 화면만, 폰 전용 모양 없음).
// 의사랑 의원(row.uis, spec uisarang-upload AC-8813.1)은 첫 칸 이름·내 의원 칩 뒤에 회색 '의사랑' 칩(세 표 모두), 순위 표 아래에 한 줄을 더 둔다

// ── 같이 쓰는 모양(시안 .rank) ──
export const TABLE_WRAP = 'mt-3 overflow-x-auto'
export const TABLE = 'w-max min-w-full border-separate border-spacing-0 text-small'
export const TH = 'border-b border-line px-3 py-1.5 text-right align-bottom font-semibold whitespace-nowrap text-muted last:pr-0'
// 몸 칸 글자색은 따로 준다(TD_TONE·TD_NA): 같은 속성 클래스를 한 칸에 겹치지 않게
export const TD = 'h-10 border-b border-line px-3 text-right whitespace-nowrap group-hover:bg-canvas last:pr-0'
export const TD_TONE = 'text-ink-2'
export const TD_NA = 'text-muted'
export const TFOOT_TD = 'h-10 border-t border-line-strong px-3 text-right font-semibold whitespace-nowrap text-ink last:pr-0'
// 첫 칸: 왼쪽에 붙고(z 2, 머리 칸 z 3) 오른쪽 1px 줄로 밀리는 칸과 나뉜다
const STICKY_BASE = 'sticky left-0 border-r border-line bg-surface pr-4 pl-0 text-left'
export const STICKY = `${STICKY_BASE} z-2`
export const STICKY_HEAD = `${STICKY_BASE} z-3`
export const NOTE = 'mt-2 text-small text-muted'
const GROUP_START = 'border-l border-line'

export const NONE = '–'

/** 순위 표·월급·매출 표의 빈 자료 글(AC-8015.6). 월급 표는 달 빈 글이 다르다(PayTable) */
export function regionEmpty(region: string): [string, string] {
  return ['의원 없음', `${region}에 승인된 의원이 없어요. 지역을 바꾸거나 전체로 봐 주세요.`]
}
export function monthEmpty(month: string): [string, string] {
  return ['자료 없음', `${monthText(month)}에 저장된 숫자가 있는 의원이 없어요. 의원 PC에서 그 달 통계를 불러와 저장하면 채워져요.`]
}
/** 의원 0곳 → 의원 없음, 그달 숫자가 있는 의원이 없음 → 자료 없음, 아니면 null(표를 그림) */
export function tableEmpty(rows: readonly CompareRow[], region: string, month: string): [string, string] | null {
  if (rows.length === 0) return regionEmpty(region)
  return rows.some(hasMonthNumbers) ? null : monthEmpty(month)
}

export function Empty({ note }: { note: [string, string] }) {
  return <EmptyNote title={note[0]}>{note[1]}</EmptyNote>
}

/** 의사랑 의원 표시 칩 글 */
export const UIS_MARK = '의사랑'

/** 첫 칸: (순위 번호) + 이름 600 + 내 의원 칩 + 의사랑 칩 + (지역이 전체면) 지역 */
export function NameCell({ row, rank, showRegion }: { row: CompareRow; rank?: number; showRegion: boolean }) {
  return (
    <td className={`${STICKY} h-10 border-b text-ink group-hover:bg-canvas`}>
      <div className="flex items-center gap-2">
        {rank !== undefined && <span className="inline-block w-5 text-right font-semibold text-muted">{rank}</span>}
        <span data-name className="font-semibold text-ink">
          {row.name}
        </span>
        {row.own && <span className={ds.chip.accent}>내 의원</span>}
        {row.uis === true && <span className={ds.chip.neutral}>{UIS_MARK}</span>}
        {showRegion && <span className="text-caption text-muted">{row.region}</span>}
      </div>
    </td>
  )
}

/** 매출·환자 수 다섯 칸(순위 표 앞 칸 = 매출·환자 수 표, 값 모양 같음) */
export const SALES_COLUMNS: readonly { key: 'total' | 'visits' | 'newPatients' | 'returnVisits' | 'dayAvg'; label: string; text(value: number): string }[] = [
  { key: 'total', label: '총진료비', text: (value) => formatManWon(value) },
  { key: 'visits', label: '내원 수', text: (value) => `${formatCount(value)}건` },
  { key: 'newPatients', label: '신환', text: (value) => `${formatCount(value)}명` },
  { key: 'returnVisits', label: '재진', text: (value) => `${formatCount(value)}건` },
  { key: 'dayAvg', label: '하루 평균 내원', text: (value) => `${value.toFixed(1)}건` }, // salesRow가 이미 소수 첫째 자리까지 버렸다
]

/** 만 원 아래 버림: 2,520,000 → '252만 원' */
export const manOnly = (won: number) => `${formatCount(Math.trunc(won / 10000))}만 원`

// ── 순위 표 칸 ──
type Column = { key: string; label: string; group: 0 | 1 | 2; value(row: CompareRow): number | null; text(row: CompareRow): string | null }

const salesValue = (sales: SalesRow | null, key: (typeof SALES_COLUMNS)[number]['key']) => sales?.[key] ?? null
const payValue = (pay: PayByJob | null, job: (typeof STAFF_JOBS)[number]) => (pay === null || pay.none ? null : (pay.jobs[job]?.avg ?? null))

const COLUMNS: readonly Column[] = [
  ...SALES_COLUMNS.map(
    (column): Column => ({
      key: column.key,
      label: column.label,
      group: 0,
      value: (row) => salesValue(row.sales, column.key),
      text: (row) => {
        const value = salesValue(row.sales, column.key)
        return value === null ? null : column.text(value)
      },
    }),
  ),
  ...STAFF_JOBS.map(
    (job): Column => ({
      key: `pay:${job}`,
      label: job,
      group: 1,
      value: (row) => payValue(row.pay, job),
      text: (row) => {
        const value = payValue(row.pay, job)
        return value === null ? null : manOnly(value)
      },
    }),
  ),
  ...REPRESENTATIVE.map(
    (rep): Column => ({
      key: rep.key,
      label: rep.label,
      group: 2,
      value: (row) => row.rep?.[rep.key].value ?? null,
      text: (row) => row.rep?.[rep.key].text ?? null,
    }),
  ),
]
const GROUPS = ['매출·환자 수', '직군별 평균 월급', '통계 대표 숫자'] as const
const startsGroup = (index: number) => index === 0 || COLUMNS[index - 1]!.group !== COLUMNS[index]!.group

const TITLE = '의원 순위'
const DESC = '칸 이름을 누르면 그 숫자로 줄을 세워요. 한 번 더 누르면 거꾸로예요.'
const FOOT = '–는 그 의원에 그 달 숫자가 없는 칸이에요. 줄을 세울 때 늘 맨 아래에 둬요.'
const UIS_FOOT = '의사랑 표시 의원은 의사랑 엑셀로 올린 숫자예요. 처방 칸은 환자 수가 아니라 처방량이고, 나이대는 내원한 날마다 센 수예요.'
const UIS_NOTE = 'mt-0.5 text-small text-muted' // 시안 .foot margin-top 2px

const SORT_BUTTON = `-mr-0.5 inline-flex min-h-7 cursor-pointer items-center justify-end gap-0.5 rounded-control px-0.5 font-semibold whitespace-nowrap transition hover:bg-canvas hover:text-ink ${ds.focusRing}`

type Props = { month: string; region: string; rows: readonly CompareRow[] }

export function RankTable({ month, region, rows }: Props) {
  const [sort, setSort] = useState<SortState>(FIRST_SORT)
  const empty = tableEmpty(rows, region, month)
  const showRegion = region === '전체'

  const sorted = sortRows(
    rows.map((row) => ({ name: row.name, row, values: Object.fromEntries(COLUMNS.map((column) => [column.key, column.value(row)])) })),
    sort.key,
    sort.dir,
  )

  return (
    <StatsCard id="cmp-rank" title={TITLE} desc={empty ? monthText(month) : `${monthText(month)} · ${DESC}`}>
      <div>
        {empty ? (
          <Empty note={empty} />
        ) : (
          <>
            <div className={TABLE_WRAP}>
              <table aria-label={TITLE} className={TABLE}>
                <thead>
                  <tr>
                    <th rowSpan={2} className={`${STICKY_HEAD} border-b py-1.5 align-bottom font-semibold text-muted`}>
                      의원
                    </th>
                    {GROUPS.map((name, group) => (
                      <th
                        key={name}
                        colSpan={COLUMNS.filter((column) => column.group === group).length}
                        className={`${GROUP_START} border-b border-line px-3 pt-2 pb-1.5 text-left text-caption font-semibold whitespace-nowrap text-ink-2`}
                      >
                        {name}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {COLUMNS.map((column, index) => {
                      const on = sort.key === column.key
                      return (
                        <th
                          key={column.key}
                          aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                          className={startsGroup(index) ? `${TH} ${GROUP_START}` : TH}
                        >
                          <button type="button" onClick={() => setSort(nextSort(sort, column.key))} className={`${SORT_BUTTON} ${on ? 'text-accent-strong' : 'text-muted'}`}>
                            {column.label}
                            <span className="inline-flex w-3.5 justify-center">
                              {on && <Icon name="arrowDown" size={12} className={sort.dir === 'asc' ? 'rotate-180' : undefined} />}
                            </span>
                          </button>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(({ row }, rank) => (
                    <tr key={row.id} className="group">
                      <NameCell row={row} rank={rank + 1} showRegion={showRegion} />
                      {COLUMNS.map((column, index) => {
                        const text = column.text(row)
                        // 고른 칸 = 600 ink(빈 값은 600 muted), 빈 값 = muted
                        const on = sort.key === column.key
                        const tone = text === null ? TD_NA : on ? 'text-ink' : TD_TONE
                        const classes = [TD, tone, on ? 'font-semibold' : '', startsGroup(index) ? GROUP_START : '']
                        return (
                          <td key={column.key} className={classes.filter(Boolean).join(' ')}>
                            {text ?? NONE}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={NOTE}>{FOOT}</p>
            {rows.some((row) => row.uis === true) && <p className={UIS_NOTE}>{UIS_FOOT}</p>}
          </>
        )}
      </div>
    </StatsCard>
  )
}
