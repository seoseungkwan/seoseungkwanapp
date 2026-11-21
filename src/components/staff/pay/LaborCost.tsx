'use client'

import { useState, type ReactNode } from 'react'
import { TableScroll } from '@/components/staff/TableScroll'
import { EMPLOYMENT_LABEL, jobLabel } from '@/components/staff/labels'
import { ds } from '@/components/ui/classes'
import { addMonths } from '@/lib/analytics/dates'
import { laborCost, lineTotal, monthRevenue, revenueRatio } from '@/lib/staff/pay'
import type { PayItem, PayLine, PayMonth, StaffMember } from '@/types/staff'
import { monthDay, monthNumber, parseWon, ratioText, recentMonths, signedWon, won } from './format'
import { LaborBars, RatioLine, type LaborMonth } from './LaborCharts'
import { MonthNav, ToolRow } from './parts'
import type { RevenueRead } from './usePayData'

// '인건비' 칸 (staff AC-7615.9, 시안 pay.html ⑦). 인건비 = 지급 합계(이달 급여 표 합계) + 병원 부담분(세무사가 알려준 금액, 원장이 한 줄 적음).
// 숫자 칸 셋 → 병원 부담분 칸([저장]으로만 저장 — 금액 칸 가운데 하나뿐) → 6달 그림 둘과 달별 숫자 표 → 사람별 지급 합계 표.
// 매출은 웹앱 매출 자료(sales_days)가 있는 달만 쓴다(없거나 못 읽으면 '매출 자료 없음').
// 보는 달은 이달 급여와 같은 줄(monthLines — 저장 안 한 재직자는 새 줄)로 세고 '{n}명'은 그달 재직자 수, 다른 달은 그 달 저장된 줄로 센다(AC-7615.11).
// 저장된 급여 줄이 하나도 없는 달은 그림의 막대·% 점과 달별 표의 지급 합계·인건비·매출 대비를 비운다(AC-7615.9)

const SPAN = 6

export type LaborCostProps = {
  month: string
  today: string
  members: readonly StaffMember[]
  items: readonly PayItem[]
  /** 저장된 급여 줄(보는 달과 앞 다섯 달) */
  saved: readonly PayLine[]
  /** 보는 달 줄: 그달 재직자마다 저장된 줄 ?? 새 줄(명단 차례) */
  monthLines: readonly PayLine[]
  months: readonly PayMonth[]
  revenue: RevenueRead
  onMonth: (month: string) => void
  onSaveMonth: (row: PayMonth) => Promise<boolean>
}

// 줄맞춤은 칸마다 하나만 붙인다(둘이면 CSS 차례로 엉뚱한 쪽이 이긴다): 글 칸은 왼쪽, 숫자 칸은 오른쪽(시안)
const th = 'whitespace-nowrap border-b border-line bg-canvas px-3 py-2 text-caption font-semibold text-muted'
const td = 'whitespace-nowrap border-b border-line px-3 py-2 text-small text-ink'
const rowHead = 'whitespace-nowrap border-b border-line px-3 py-2 text-left text-small font-normal text-ink-2'
const foot = 'whitespace-nowrap bg-canvas px-3 py-2 text-small font-semibold text-ink'
const swatch = 'mr-1.5 inline-block size-2.5 rounded-control align-middle'

function Tile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <section role="group" aria-label={label} className={`${ds.panel} flex flex-col gap-0.5 px-4 py-3`}>
      <small className="text-caption text-muted">{label}</small>
      <b className="text-title font-semibold text-ink tabular-nums">{value}</b>
      <span className="text-caption text-ink-2">{detail}</span>
    </section>
  )
}

function ChartHead({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
      <h2 className="text-subtitle font-semibold text-ink">{title}</h2>
      <span className="flex flex-wrap gap-x-3 text-caption text-ink-2">{children}</span>
    </div>
  )
}

const spanTitle = (first: string, last: string) =>
  first.slice(0, 4) === last.slice(0, 4) ? `${monthNumber(first)}~${monthNumber(last)}월` : `${monthNumber(first)}월~${monthNumber(last)}월`

/** 병원 부담분 한 줄: 쓴 글은 저장이 끝날 때까지 그대로(실패해도 남음) */
function BurdenRow({ month, today, row, onSave }: { month: string; today: string; row: PayMonth | null; onSave: (row: PayMonth) => Promise<boolean> }) {
  const [draft, setDraft] = useState<string | null>(null)
  const [bad, setBad] = useState(false)
  const [busy, setBusy] = useState(false)
  const label = `병원 부담분 (${monthNumber(month)}월)`
  const saved = row?.employerCost ?? null
  const save = async () => {
    const value = parseWon(draft ?? (saved === null ? '' : won(saved)))
    if (value === 'bad') {
      setBad(true)
      return
    }
    setBad(false)
    setBusy(true)
    const ok = await onSave({ month, employerCost: value, costSavedOn: today, copiedOn: row?.copiedOn ?? null })
    setBusy(false)
    if (ok) setDraft(null)
  }
  return (
    <div className={`${ds.panel} flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3`}>
      <span className="flex flex-col">
        <span className="text-small font-semibold text-ink">{label}</span>
        <small className="text-caption text-muted">세무사가 알려준 이달 병원 몫 세금·보험료</small>
      </span>
      <span className="ml-auto inline-flex flex-wrap items-center gap-2 text-small text-ink">
        <input
          type="text"
          inputMode="numeric"
          aria-label={label}
          aria-invalid={bad || undefined}
          className="h-8 w-36 rounded-control border border-line-strong bg-surface px-2 text-right text-small text-ink tabular-nums focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent focus-visible:outline-hidden aria-invalid:border-negative"
          value={draft ?? (saved === null ? '' : won(saved))}
          onChange={(event) => setDraft(event.target.value)}
        />
        원
        <button type="button" disabled={busy} className={ds.button.primarySmall} onClick={() => void save()}>
          저장
        </button>
        {row?.costSavedOn != null && <span className="text-caption text-positive">{`✓ ${monthDay(row.costSavedOn)} 저장함`}</span>}
      </span>
    </div>
  )
}

export function LaborCost(props: LaborCostProps) {
  const { month, members, items, saved, monthLines, months, revenue } = props
  const prev = addMonths(month, -1)
  const span = recentMonths(month, SPAN)
  const rowOf = (m: string) => months.find((row) => row.month === m) ?? null
  // 보는 달은 monthLines, 다른 달은 그 달 저장된 줄
  const linesOf = (m: string) => (m === month ? monthLines : saved.filter((line) => line.month === m))
  const series: LaborMonth[] = span.map((m) => {
    const employer = rowOf(m)?.employerCost ?? 0
    const { pay, cost } = laborCost(linesOf(m), items, m, employer)
    const sales = revenue.state === 'ready' ? monthRevenue(revenue.days, m) : null
    const empty = !saved.some((line) => line.month === m)
    return { month: m, empty, pay, employer, cost, revenue: sales, ratio: empty ? null : revenueRatio(cost, sales) }
  })
  // 숫자 칸 셋은 이달 급여와 같은 줄로 센다(그림에서 비는 달이어도)
  const now = series[series.length - 1]
  const nowRatio = revenueRatio(now.cost, now.revenue)
  const count = members.length
  const prevPay = laborCost(linesOf(prev), items, prev, null).pay
  const diff = now.pay - prevPay
  const payDetail =
    diff === 0
      ? `${count}명 · ${monthNumber(prev)}월과 같아요`
      : `${count}명 · ${monthNumber(prev)}월보다 ${won(Math.abs(diff))}원 ${diff > 0 ? '많아요' : '적어요'}`
  const employerNow = rowOf(month)?.employerCost ?? null
  const ratioDetail =
    revenue.state === 'reading' ? '매출을 읽고 있어요' : nowRatio === null ? '매출 자료 없음' : `인건비 ${won(now.cost)}원 ÷ 매출 ${won(now.revenue ?? 0)}원`

  // 사람별(그달 재직자, 명단 차례) — 보는 달 줄, 앞 달은 저장된 줄
  const find = (m: string, staffId: string) => linesOf(m).find((line) => line.staffId === staffId) ?? null
  const people = members.map((member) => {
    const line = find(month, member.id)
    const before = find(prev, member.id)
    const sum = line === null ? { total: 0, incentive: 0 } : lineTotal(line, items, month)
    const prevTotal = before === null ? null : lineTotal(before, items, prev).total
    return { member, line, sum, change: prevTotal === null ? null : sum.total - prevTotal }
  })
  const peopleTotal = people.reduce((sum, p) => sum + p.sum.total, 0)
  const peopleIncentive = people.reduce((sum, p) => sum + p.sum.incentive, 0)
  const peoplePrev = members.reduce((sum, member) => {
    const before = find(prev, member.id)
    return sum + (before === null ? 0 : lineTotal(before, items, prev).total)
  }, 0)

  const rows: { label: string; cells: string[] }[] = [
    { label: '지급 합계', cells: series.map((m) => (m.empty ? '–' : won(m.pay))) },
    { label: '병원 부담분', cells: series.map((m) => won(m.employer)) },
    { label: '인건비', cells: series.map((m) => (m.empty ? '–' : won(m.cost))) },
    { label: '매출', cells: series.map((m) => (m.revenue === null ? (revenue.state === 'reading' ? '…' : '매출 자료 없음') : won(m.revenue))) },
    { label: '매출 대비', cells: series.map((m) => (m.ratio === null ? '–' : ratioText(m.ratio))) },
  ]

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <ToolRow left={<MonthNav month={month} onMonth={props.onMonth} />} />
      <div className="grid min-w-0 grid-cols-3 gap-3">
        <Tile label="지급 합계" value={`${won(now.pay)}원`} detail={payDetail} />
        <Tile label="병원 부담분" value={employerNow === null ? '–' : `${won(employerNow)}원`} detail="세무사가 알려준 금액" />
        <Tile label="매출 대비 인건비" value={nowRatio === null ? '–' : ratioText(nowRatio)} detail={ratioDetail} />
      </div>
      <BurdenRow key={month} month={month} today={props.today} row={rowOf(month)} onSave={props.onSaveMonth} />
      <section className={`${ds.panel} flex min-w-0 flex-col gap-2 px-4 py-3`}>
        <ChartHead title={`인건비 · ${spanTitle(span[0], month)}`}>
          <span>
            <i className={`${swatch} bg-chart-4`} />
            지급 합계
          </span>
          <span>
            <i className={`${swatch} bg-chart-3`} />
            병원 부담분
          </span>
        </ChartHead>
        <LaborBars months={series} current={month} />
        <ChartHead title="매출 대비 인건비 %">
          <span>점에 마우스를 올리면 계산이 보여요</span>
        </ChartHead>
        <RatioLine months={series} current={month} />
        <details>
          <summary className="cursor-pointer text-small font-medium text-accent">달별 숫자 표로 보기</summary>
          <TableScroll label="달별 인건비 표 (옆으로 밀어 보기)">
            <table aria-label="달별 인건비 표" className="mt-2 w-full border-collapse text-small tabular-nums">
              <thead>
                <tr>
                  <th scope="col" className={`${th} text-left`} />
                  {span.map((m) => (
                    <th key={m} scope="col" className={`${th} text-right`}>{`${monthNumber(m)}월`}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.label}>
                    <th scope="row" className={rowHead}>
                      {row.label}
                    </th>
                    {row.cells.map((cell, i) => (
                      <td key={span[i]} className={`${td} text-right`}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </details>
      </section>
      <section className={`${ds.panel} flex min-w-0 flex-col gap-2 px-4 py-3`}>
        <h2 className="text-subtitle font-semibold text-ink">{`사람별 · ${monthNumber(month)}월 지급 합계`}</h2>
        <TableScroll label="사람별 지급 합계 표 (옆으로 밀어 보기)">
          <table aria-label="사람별 지급 합계 표" className="w-full border-collapse text-small tabular-nums">
            <thead>
              <tr>
                <th scope="col" className={`${th} text-left`}>
                  이름
                </th>
                <th scope="col" className={`${th} text-left`}>
                  직종 · 근무 형태
                </th>
                <th scope="col" className={`${th} text-right`}>{`${monthNumber(month)}월 지급 합계 (원)`}</th>
                <th scope="col" className={`${th} text-right`}>
                  그중 인센티브
                </th>
                <th scope="col" className={`${th} text-right`}>{`${monthNumber(prev)}월보다`}</th>
              </tr>
            </thead>
            <tbody>
              {people.map(({ member, line, sum, change }) => (
                <tr key={member.id}>
                  <th scope="row" className={`${rowHead} font-semibold text-ink`}>
                    {member.name}
                  </th>
                  <td className={`${td} text-left text-ink-2`}>{`${jobLabel(member)} · ${EMPLOYMENT_LABEL[member.employment]}`}</td>
                  <td className={`${td} text-right font-semibold`}>{won(sum.total)}</td>
                  <td className={`${td} text-right`}>{line === null || line.incentives.length === 0 ? '–' : won(sum.incentive)}</td>
                  <td className={`${td} text-right ${change === 0 ? 'text-muted' : ''}`}>{change === null ? '–' : change === 0 ? '같음' : signedWon(change)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className={`${foot} text-left`}>{`합계 (${people.length}명)`}</td>
                <td className={`${foot} text-left`} />
                <td className={`${foot} text-right`}>{won(peopleTotal)}</td>
                <td className={`${foot} text-right`}>{won(peopleIncentive)}</td>
                <td className={`${foot} text-right`}>{signedWon(peopleTotal - peoplePrev)}</td>
              </tr>
            </tfoot>
          </table>
        </TableScroll>
      </section>
    </div>
  )
}
