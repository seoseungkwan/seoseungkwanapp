'use client'

import { useId, useState } from 'react'
import { Swatch } from '@/components/calendar/CalendarToolbar'
import { RateTable, type RateTableRow } from '@/components/calendar/RateTable'
import { formatCount } from '@/components/charts/format'
import { niceScale } from '@/components/charts/scale'
import { StackedBarChart, type BarBucket, type BarSeries } from '@/components/charts/StackedBarChart'
import { ErrorCard } from '@/components/common/ErrorCard'
import { useReadOnly } from '@/components/shell/viewing'
import { ds } from '@/components/ui/classes'
import { addMonths, monthOf } from '@/lib/analytics/dates'
import { monthTrend, ratePct, rateSummary } from '@/lib/calendar/counts'
import { rebookRates } from '@/lib/calendar/rebook'
import type { MonthRate, RateCounts, RateRow } from '@/lib/calendar/shapes'
import type { CalAllDay, CalColor, CalCountRow, CalSettings, CalSlotRow } from '@/types/calendar'
import { OccupancySection } from './OccupancySection'
import { CHART_NO_SIDE_SCROLL, Note, SECTION_HEAD, Section, dayNumber } from './parts'

// 통계 탭 '예약' 칸 (spec clinic-calendar AC-5907.3, 시안 docs/mockups/clinic-calendar ?s=stats).
// 이번 달을 넣은 최근 12달(위 기간 고르기와 상관없음): 달마다 예약 수 막대 + 취소율·변경율·안 옴율 세 선 + 월별 표, 고른 달의 시행자별·종류별 표, 세는 법.
// 숫자는 받은 줄(listCalendarCounts — 이름·차트번호·메모 없음)을 lib/calendar monthTrend·rateSummary로 센다. 저장소는 부르지 않는다(읽기·다시 읽기는 화면이 한다)
// stats-insights(시안 docs/mockups/stats-insights ④⑤): 나눠 보기 시행자 표 기존 칸 뒤에 '다시 예약'(slots를 lib/calendar rebookRates로, 최근 12달)·
// '12달 예약 수'(시행자마다 달마다 예약 수 작은 막대) 두 칸을 더하고(AC-6104.3), 나눠 보기 뒤에 '예약 빈자리'(OccupancySection, AC-6105.3)를 그린다.
// 시행자 표는 예약 탭과 같이 쓰는 RateTable을 바꾸지 않으려고 같은 모양으로 여기서 그린다(종류별 표는 RateTable 그대로)
// 다른 의원을 보는 중(admin-view AC-8008.2, useReadOnly)이면 '다시 예약' 칸·그 설명을 그리지 않는다(예약 빈자리는 slots가 없어 원래 없다). 새 글 없음

export const CALENDAR_DESC = '최근 12개월 · 예약 탭에 넣은 예약으로 세요(비트에서 불러오지 않아도 돼요) · 위 기간과 상관없이 늘 12개월 · 예약은 1년만 남아요'
const TITLE = '예약'
const RETRY = '다시 읽기'
const EMPTY = '예약 탭에 적은 예약이 없어요'
const BAR_SERIES: BarSeries[] = [{ name: '예약', tone: 'ret' }]
// 카드 안 작은 칸 제목(parts.tsx SUB_HEADING과 같은 값 — 제목 안에 '진행 중' 꼬리표를 넣으려고 칸 머리를 직접 그린다)
const SUB_HEADING = 'text-st-15 leading-6 font-semibold text-st-ink'
const TAG = 'ml-1.5 inline-flex h-5 items-center rounded-full bg-st-canvas px-2 align-middle text-caption font-medium text-st-muted'
const HOW: readonly [string, string][] = [
  ['예약 수', ': 그 달에 잡혀 있는 예약. 취소한 예약은 넣고, 지운 예약과 비트 예약 칸은 빼요.'],
  ['취소', ': [예약 취소]를 누른 예약. 취소율 = 취소 ÷ 예약 수.'],
  ['변경', ': [고치기]로 날짜나 시작 시간을 옮긴 예약. 옮긴 뒤 날짜의 달에 세고, 여러 번 옮겨도 한 번이에요. 길이·담당·종류·메모만 바꾼 건 빼요.'],
  ['안 옴', ": 예약 시간이 끝났는데 비트 접수가 없거나 손으로 '안 옴'을 고른 예약. 취소한 예약은 빼요."],
]
const HOW_LAST = '비율은 소수 첫째 자리까지(반올림). 시행자·종류는 예약에 적힌 담당·종류로 나눠요.'
const REBOOK_NOTE = '다시 예약 = 와서 치료받은 환자 가운데 14일 안에 같은 시행자 예약이 또 잡힌 비율(최근 12달)'
const NO_REBOOK = '—'

/** 'reading' = 읽는 중(비움), 'failed' = 읽기 실패 */
export type CalendarRows = readonly CalCountRow[] | 'reading' | 'failed'
/** 다시 예약·빈자리 줄(listCalendarSlots 12달, 이름·메모 없음)과 빈자리 기간 휴무(listAllDay). 'reading'·'failed'는 위와 같다 */
export type CalendarSlots = { rows: readonly CalSlotRow[]; offs: readonly CalAllDay[] } | 'reading' | 'failed'
export type StatsCalendarShown = {
  rows: CalendarRows // 이번 달을 넣은 최근 12달 줄(그 밖 줄은 세지 않는다)
  today: string // 한국 날짜
  onReread(): void
  settings?: CalSettings // 주면 나눠 보기가 설정 차례·(표시) 이름
  slots?: CalendarSlots // 주지 않으면 다시 예약은 '—'이고 예약 빈자리 칸이 없다
}

const monthLabel = (month: string) => `${Number(month.slice(0, 4))}년 ${Number(month.slice(5, 7))}월`
const shortMonth = (month: string) => `${Number(month.slice(5, 7))}월`

// ── 세 비율 선 그림(시안 lineChart) ───────────────────────────
type RateKey = 'cancel' | 'moved' | 'noshow'
const LINES: readonly { key: RateKey; name: string; short: string; tone: string; mark: string }[] = [
  { key: 'cancel', name: '취소율', short: '취소', tone: 'text-st-f90', mark: 'rounded-full' }, // 동그라미
  { key: 'moved', name: '변경율', short: '변경', tone: 'text-accent', mark: 'rounded-none' }, // 네모
  { key: 'noshow', name: '안 옴율', short: '안 옴', tone: 'text-negative', mark: 'rounded-none rotate-45' }, // 마름모
]
const PLOT_HEIGHT = 200 // h-50
const LABEL_GAP = 16

const pctOf = (m: MonthRate, key: RateKey) => (m.total > 0 ? (m[key] / m.total) * 100 : null)
const tipOf = (m: MonthRate, current: string) =>
  `${monthLabel(m.month)}${m.month === current ? ' (진행 중)' : ''}, 예약 ${m.total.toLocaleString('ko-KR')}, 취소 ${m.cancel} (${ratePct(m.cancel, m.total)}), 변경 ${m.moved} (${ratePct(m.moved, m.total)}), 안 옴 ${m.noshow} (${ratePct(m.noshow, m.total)})`

/** 범례 표시: 선 + 점(hollow = 이번 달) */
function LineMark({ tone, mark, hollow = false }: { tone: string; mark: string; hollow?: boolean }) {
  return (
    <span aria-hidden="true" className={`relative inline-flex h-2 w-4 shrink-0 items-center justify-center ${tone}`}>
      {!hollow && <span className="absolute inset-x-0 h-0.5 bg-current" />}
      <span className={`relative size-2 ${mark} ${hollow ? 'border-2 border-current bg-surface' : 'bg-current'}`} />
    </span>
  )
}

function RateLines({ trend, current, selected, onPick }: { trend: readonly MonthRate[]; current: string; selected: string; onPick(month: string): void }) {
  const cells = trend.length
  const values = trend.flatMap((m) => LINES.map((line) => pctOf(m, line.key) ?? 0))
  const scale = niceScale(Math.max(10, ...values))
  const x = (i: number) => ((i + 0.5) / cells) * 100
  const y = (v: number) => (1 - v / scale.max) * 100
  const last = trend.length - 1
  const lastFull = trend.findLastIndex((m, i) => i < last && m.total > 0)
  const endIndex = trend[last]!.total > 0 ? last : lastFull

  // 끝 이름표: 위에서부터 16px씩 띄운다(시안)
  const ends =
    endIndex < 0
      ? []
      : LINES.map((line) => ({ line, top: (y(pctOf(trend[endIndex]!, line.key) ?? 0) / 100) * PLOT_HEIGHT })).sort((a, b) => a.top - b.top)
  for (let i = 1; i < ends.length; i++) ends[i]!.top = Math.max(ends[i]!.top, ends[i - 1]!.top + LABEL_GAP)

  return (
    <div aria-hidden="true" className="mt-3 tabular-nums">
      <div className="flex">
        <div className="relative w-10 shrink-0">
          {scale.ticks.map((t) => (
            <span key={t} className="absolute right-2 translate-y-1/2 text-caption whitespace-nowrap text-st-muted" style={{ bottom: `${(t / scale.max) * 100}%` }}>
              {`${t}%`}
            </span>
          ))}
        </div>
        <div className="relative h-50 min-w-0 flex-1">
          {scale.ticks.map((t) => (
            <div key={t} className={`absolute inset-x-0 h-px ${t === 0 ? 'bg-line-strong' : 'bg-line'}`} style={{ bottom: `${(t / scale.max) * 100}%` }} />
          ))}
          <div className="absolute inset-0 flex">
            {trend.map((m) => (
              <button
                key={m.month}
                type="button"
                tabIndex={-1}
                title={tipOf(m, current)}
                className={`h-full min-w-0 flex-1 cursor-pointer ${m.month === selected ? 'bg-accent-soft' : 'hover:bg-accent-soft/60'}`}
                onClick={() => onPick(m.month)}
              />
            ))}
          </div>
          <svg viewBox="0 0 1200 1000" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full">
            {LINES.map((line) => {
              const at = (i: number) => {
                const v = pctOf(trend[i]!, line.key)
                return v === null ? null : `${((x(i) / 100) * 1200).toFixed(1)},${((y(v) / 100) * 1000).toFixed(1)}`
              }
              const solid = trend.slice(0, last).flatMap((_, i) => at(i) ?? [])
              const tail = lastFull >= 0 && trend[last]!.total > 0 ? [at(lastFull)!, at(last)!] : []
              return (
                <g key={line.key} className={line.tone} fill="none" stroke="currentColor" strokeWidth="2">
                  {solid.length > 1 && <polyline points={solid.join(' ')} vectorEffect="non-scaling-stroke" />}
                  {tail.length === 2 && <polyline points={tail.join(' ')} strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />}
                </g>
              )
            })}
          </svg>
          {LINES.map((line) =>
            trend.map((m, i) => {
              const v = pctOf(m, line.key)
              if (v === null) return null
              return (
                <span
                  key={`${line.key}-${m.month}`}
                  className={`pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 ${line.tone} ${line.mark} ${
                    i === last ? 'border-2 border-current bg-surface' : 'bg-current'
                  }`}
                  style={{ left: `${x(i)}%`, top: `${y(v)}%` }}
                />
              )
            }),
          )}
        </div>
        <div className="relative w-20 shrink-0">
          {ends.map(({ line, top }) => (
            <span key={line.key} className="absolute left-2 inline-flex -translate-y-1/2 items-center gap-1 text-caption whitespace-nowrap text-st-ink-2" style={{ top }}>
              <LineMark tone={line.tone} mark={line.mark} />
              {line.short} <b className="font-semibold text-st-ink">{ratePct(trend[endIndex]![line.key], trend[endIndex]!.total)}</b>
            </span>
          ))}
        </div>
      </div>
      {/* 달 글: 왼쪽 눈금 칸(w-10)·오른쪽 이름표 칸(w-20)만큼 비우고 그림 칸에 맞춘다 */}
      <div className="flex">
        <div className="w-10 shrink-0" />
        {trend.map((m) => (
          <div key={m.month} className="min-w-0 flex-1 text-center text-caption text-st-muted">
            <p className={`mt-2 ${m.month === selected ? 'font-semibold text-st-ink' : ''}`}>{shortMonth(m.month)}</p>
            {m.month === current ? <p className="max-md:hidden">진행 중</p> : /-(01|12)$/.test(m.month) ? <p className="max-md:hidden">{m.month.slice(0, 4)}</p> : null}
          </div>
        ))}
        <div className="w-20 shrink-0" />
      </div>
    </div>
  )
}

// ── 나눠 보기 표(RateTable·RateBreakdown과 같은 모양, stats-insights AC-6104.3) ─────
const CELL = 'h-8.5 border-b border-line px-2 text-right whitespace-nowrap text-ink tabular-nums first:pl-0 first:text-left last:pr-0'
const HEAD = 'h-7.5 border-b border-line px-2 text-right text-caption font-semibold whitespace-nowrap text-muted first:pl-0 first:text-left last:pr-0'
const RATE = 'max-md:hidden'
const FOOT = 'h-8.5 border-t border-line-strong px-2 text-right font-semibold whitespace-nowrap text-ink tabular-nums first:pl-0 first:text-left last:pr-0'
const STAFF_HEAD = ['예약', '취소', '취소율', '변경', '변경율', '안 옴', '안 옴율', '다시 예약', '12달 예약 수'] as const
const RATE_HEAD = new Set<string>(['취소율', '변경율', '안 옴율'])
const REBOOK_HEAD = '다시 예약'

type Line = RateTableRow & { name: string } // name = 표시 없는 이름(막대 접근성 이름)
type StaffLine = Line & { rebook: number | null; months: number[] }
type Listed = { id: string; name: string; mark?: string; color: CalColor | null }

// 설정 차례로 줄을 세운다(예약 0도 보임). 설정에 없는(지운) 줄은 아래에 저장된 이름으로. 설정이 없으면 rateSummary 차례(RateBreakdown과 같다)
function ordered(found: readonly RateRow[], listed: readonly Listed[] | undefined): Line[] {
  const plain = (row: RateRow): Line => ({ ...row, name: row.label })
  if (!listed) return found.map(plain)
  const byId = new Map(found.map((row) => [row.id, row]))
  const ids = new Set(listed.map((item) => item.id))
  const known = listed.map((item): Line => {
    const counts = byId.get(item.id) ?? { total: 0, cancel: 0, moved: 0, noshow: 0 }
    return {
      id: item.id,
      name: item.name,
      label: (
        <>
          <Swatch color={item.color} />
          {item.mark === undefined ? item.name : `(${item.mark}) ${item.name}`}
        </>
      ),
      total: counts.total,
      cancel: counts.cancel,
      moved: counts.moved,
      noshow: counts.noshow,
    }
  })
  return [...known, ...found.filter((row) => !ids.has(row.id)).map(plain)]
}

// 수 칸(폰은 아래에 비율) + 비율 칸(폰은 숨김)
function CountCells({ n, of, cell }: { n: number; of: number; cell: string }) {
  const rate = ratePct(n, of)
  return (
    <>
      <td className={cell}>
        <span data-n>{formatCount(n)}</span>
        <span aria-hidden="true" className="block text-caption font-normal text-muted md:hidden">
          {rate}
        </span>
      </td>
      <td className={`${cell} ${RATE} text-ink-2`}>{rate}</td>
    </>
  )
}

function Counts({ counts, cell }: { counts: RateCounts; cell: string }) {
  return (
    <>
      <td className={cell}>
        <span data-n>{formatCount(counts.total)}</span>
      </td>
      <CountCells n={counts.cancel} of={counts.total} cell={cell} />
      <CountCells n={counts.moved} of={counts.total} cell={cell} />
      <CountCells n={counts.noshow} of={counts.total} cell={cell} />
    </>
  )
}

// 달마다 예약 수 작은 막대 12개. 높이는 표 안 가장 많은 달 대비
function Spark({ name, months, labels, top }: { name: string; months: readonly number[]; labels: readonly string[]; top: number }) {
  return (
    <span
      role="img"
      aria-label={`${name} 12달 예약 수`}
      title={months.map((n, i) => `${labels[i]} ${formatCount(n)}`).join(' · ')}
      className="inline-flex h-4.5 items-end gap-px align-middle"
    >
      {months.map((n, i) => (
        <span key={labels[i]} className={`w-1 bg-st-line-2 ${n > 0 ? 'min-h-px' : ''}`} style={{ height: `${top > 0 ? Math.round((n / top) * 100) : 0}%` }} />
      ))}
    </span>
  )
}

function StaffTable({ lines, total, labels, rebook }: { lines: readonly StaffLine[]; total: RateCounts; labels: readonly string[]; rebook: boolean }) {
  const top = Math.max(0, ...lines.flatMap((line) => line.months))
  const heads = rebook ? STAFF_HEAD : STAFF_HEAD.filter((head) => head !== REBOOK_HEAD)
  return (
    <div className={ds.table.wrap}>
      <table className="w-full border-collapse text-small">
        <thead>
          <tr>
            <th scope="col" className={HEAD}>
              시행자
            </th>
            {heads.map((head) => (
              <th key={head} scope="col" className={RATE_HEAD.has(head) ? `${HEAD} ${RATE}` : HEAD}>
                {head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id}>
              <th scope="row" className={`${CELL} font-normal`}>
                <span className="inline-flex items-center gap-1.5">{line.label}</span>
              </th>
              <Counts counts={line} cell={CELL} />
              {rebook && <td className={CELL}>{line.rebook === null ? NO_REBOOK : `${line.rebook}%`}</td>}
              <td className={CELL}>
                <Spark name={line.name} months={line.months} labels={labels} top={top} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" className={FOOT}>
              합계
            </th>
            <Counts counts={total} cell={FOOT} />
            {rebook && <td className={FOOT} />}
            <td className={FOOT} />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

/** 통계 탭 '예약' 칸 */
export function CalendarSection({ rows, today, onReread, settings, slots }: StatsCalendarShown) {
  const current = monthOf(today)
  const months = Array.from({ length: 12 }, (_, i) => addMonths(current, i - 11))
  const [picked, setPicked] = useState(() => addMonths(current, -1))
  const headId = useId()
  const rebookShown = !useReadOnly()

  if (rows === 'reading') {
    return (
      <Section title={TITLE} desc={CALENDAR_DESC}>
        {null}
      </Section>
    )
  }
  if (rows === 'failed') {
    return (
      <Section title={TITLE} desc={CALENDAR_DESC}>
        <ErrorCard code="E-STATS-READ-FAILED" />
        <div className="mt-2">
          <button type="button" onClick={onReread} className={`${ds.button.secondarySmall} max-md:w-full`}>
            {RETRY}
          </button>
        </div>
      </Section>
    )
  }

  const trend = monthTrend(rows, months)
  if (trend.every((m) => m.total === 0)) {
    return (
      <Section title={TITLE} desc={CALENDAR_DESC}>
        <p className="text-body text-st-ink-2">{EMPTY}</p>
      </Section>
    )
  }

  const selected = months.includes(picked) ? picked : months[10]!
  const index = months.indexOf(selected)
  const total = trend.reduce<RateCounts>(
    (sum, m) => ({ total: sum.total + m.total, cancel: sum.cancel + m.cancel, moved: sum.moved + m.moved, noshow: sum.noshow + m.noshow }),
    { total: 0, cancel: 0, moved: 0, noshow: 0 },
  )
  const tag = (month: string) => (month === current ? <span className={TAG}>진행 중</span> : null)
  const buckets: BarBucket[] = trend.map((m) => {
    const note = m.month === current ? '진행 중' : /-(01|12)$/.test(m.month) ? m.month.slice(0, 4) : null
    return {
      key: m.month,
      label: shortMonth(m.month),
      rangeLabel: monthLabel(m.month),
      state: m.month === current ? 'in-progress' : 'complete',
      values: [m.total],
      ...(note ? { note } : {}),
    }
  })
  const tableRows: RateTableRow[] = trend.map((m) => ({
    id: m.month,
    label: (
      <>
        {monthLabel(m.month)}
        {tag(m.month)}
      </>
    ),
    total: m.total,
    cancel: m.cancel,
    moved: m.moved,
    noshow: m.noshow,
  }))
  const foot = `막대나 달 칸에 마우스를 올리면 숫자가 나오고, 누르면 아래 표가 그 달로 바뀌어요. ${shortMonth(current)}은 아직 진행 중이라(${dayNumber(today)}일부터는 앞으로 올 예약) 안 옴율이 낮게 나와요.`

  // 나눠 보기: 고른 달 네 수 + 시행자마다 다시 예약(최근 12달)·12달 예약 수
  const summary = rateSummary(rows.filter((row) => row.day.startsWith(`${selected}-`)))
  const rebook = new Map(typeof slots === 'object' ? rebookRates(slots.rows, today).map((rate) => [rate.staffId, rate.pct]) : [])
  const staffLines: StaffLine[] = ordered(summary.byStaff, settings?.staff).map((line) => ({
    ...line,
    rebook: rebook.get(line.id) ?? null,
    months: monthTrend(
      rows.filter((row) => row.staffId === line.id),
      months,
    ).map((m) => m.total),
  }))
  const kindLines = ordered(summary.byKind, settings?.kinds)

  return (
    <>
      <Section title={TITLE} desc={CALENDAR_DESC}>
        <div className="grid gap-x-8 gap-y-6 min-[1100px]:grid-cols-2">
          <Section title="월별 예약 수" desc="취소 포함 · 지운 예약 빼고">
            <div className={`mt-3 ${CHART_NO_SIDE_SCROLL}`}>
              <StackedBarChart title="월별 예약 수" unit="건" series={BAR_SERIES} buckets={buckets} selected={selected} onPick={setPicked} />
            </div>
          </Section>
          <Section title="취소율 · 변경율 · 안 옴율" desc="그 달 예약 수로 나눠요">
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-caption text-st-muted">
              {LINES.map((line) => (
                <span key={line.key} className="inline-flex items-center gap-1.5">
                  <LineMark tone={line.tone} mark={line.mark} />
                  {line.name}
                </span>
              ))}
              <span className="inline-flex items-center gap-1.5">
                <LineMark tone="text-st-muted" mark="rounded-full" hollow />
                이번 달(진행 중)
              </span>
            </div>
            <RateLines trend={trend} current={current} selected={selected} onPick={setPicked} />
          </Section>
        </div>
        <Note>{foot}</Note>
      </Section>

      <Section title="월별 숫자" desc="줄을 누르면 아래 표가 그 달로 바뀌어요">
        <div className="mt-3">
          <RateTable head="달" rows={tableRows} total={total} totalLabel="12개월" selected={selected} onPick={setPicked} />
        </div>
      </Section>

      <section aria-labelledby={headId} className="min-w-0">
        <div className={SECTION_HEAD}>
          <h3 id={headId} className={SUB_HEADING}>
            {`${monthLabel(selected)} 나눠 보기`}
            {tag(selected)}
          </h3>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              aria-label="이전 달"
              disabled={index <= 0}
              className={`${ds.button.secondarySmall} w-9 px-0`}
              onClick={() => setPicked(months[index - 1]!)}
            >
              ‹
            </button>
            <span className="text-small text-st-ink-2 tabular-nums">{monthLabel(selected)}</span>
            <button
              type="button"
              aria-label="다음 달"
              disabled={index >= months.length - 1}
              className={`${ds.button.secondarySmall} w-9 px-0`}
              onClick={() => setPicked(months[index + 1]!)}
            >
              ›
            </button>
          </div>
        </div>
        <div className="mt-3 grid gap-y-4">
          <div className="min-w-0">
            <h4 className="mb-0.5 text-small font-semibold text-ink-2">시행자별</h4>
            <StaffTable lines={staffLines} total={summary} labels={months.map(shortMonth)} rebook={rebookShown} />
            {rebookShown && <Note>{REBOOK_NOTE}</Note>}
          </div>
          <div className="min-w-0">
            <h4 className="mb-0.5 text-small font-semibold text-ink-2">종류별</h4>
            <RateTable head="종류" rows={kindLines} total={summary} />
          </div>
        </div>
      </section>

      {slots !== undefined && <OccupancySection slots={slots} today={today} onReread={onReread} {...(settings ? { settings } : {})} />}

      <details open className="text-small text-st-ink-2">
        <summary className="cursor-pointer font-semibold text-st-ink">세는 법</summary>
        <ul className="mt-2 grid list-disc gap-1 pl-5">
          {HOW.map(([name, rest]) => (
            <li key={name}>
              <b className="font-semibold text-st-ink">{name}</b>
              {rest}
            </li>
          ))}
          <li>{HOW_LAST}</li>
        </ul>
      </details>
    </>
  )
}
