'use client'

import { formatCount } from '@/components/charts/format'
import type { StatsRange } from '@/components/stats/view'
import { averageText, cellAverage, cellLevel, hourName, unknownHoursNote } from '@/lib/analytics/visitHours'
import type { VisitHours } from '@/types/stats'
import { DetailToggle, type DetailTable } from './DetailToggle'
import { BitNoteSection, bitState, type BitSectionsShown } from './PatientMixSection'
import { Note, Section } from './parts'

// 시간대별 접수 (stats-bit-sections AC-2706.1·AC-2706.3·AC-2704.1~2704.5, 시안 docs/mockups/stats-bit-sections).
// 칸 = 그 요일·그 시 접수 합 ÷ 그 요일의 문 연 날 수. 평균·글자·색 단계·머리글은 visitHours.ts 함수가 만든다.
// [자세히]는 같은 모양의 합계 표(건수)를 연다(DetailToggle)

const TITLE = '시간대별 접수'
const DESC = '요일·시간마다 하루 평균 접수'
const WEEKDAYS = '월화수목금토일'
const FOOT = '병원 접수 시간(8시~20시) 기준이에요. 8시 전 접수는 8시 칸, 20시 넘은 접수는 20시 칸에 넣어요. 예약 대기·취소한 접수는 세지 않아요. 문을 연 날만 평균에 넣어요.'

// 칸 색 단계 0~5(시안 .heat td.l0~l5). 0은 바탕 없이 1px 선, 4·5는 흰 글자
const LEVEL_TONE = [
  'bg-surface text-muted ring-1 ring-inset ring-line',
  'bg-chart-1 text-ink',
  'bg-chart-2 text-ink',
  'bg-chart-3 text-ink',
  'bg-chart-4 text-surface',
  'bg-chart-5 font-semibold text-surface',
] as const
const LEGEND = ['bg-chart-1', 'bg-chart-2', 'bg-chart-3', 'bg-chart-4', 'bg-chart-5'] as const
const HEAD = 'whitespace-nowrap px-0.5 py-1.5 text-center text-caption font-medium text-muted'
// 요일 칸은 표가 옆으로 밀려도 붙어 있다(시안 .heat tbody th)
const WEEKDAY = 'sticky left-0 z-1 whitespace-nowrap bg-surface py-1.5 pr-2 text-left text-small font-medium text-ink-2'
const CELL = 'h-9 min-w-11.5 whitespace-nowrap rounded-control text-center text-small tabular-nums'

const weekdayOf = (weekday: number) => WEEKDAYS[weekday - 1]!

// 합계 표: 첫 칸 '월 (4일)'(요일과 문 연 날 수), 칸은 접수 건수(AC-2704.5)
function totalsTable(view: VisitHours): DetailTable {
  return {
    caption: '시간대별 접수 합계 (건)',
    columns: ['요일 (문을 연 날)', ...view.hours.map((hour) => `${hour}시`)],
    rows: view.rows.map((row) => [`${weekdayOf(row.weekday)} (${formatCount(row.openDays)}일)`, ...row.cells.map((sum) => (sum > 0 ? formatCount(sum) : '–'))]),
  }
}

// 머리글(visitHoursHeadline과 같은 글). 요일·시와 평균만 굵다(시안 .headline b)
function Headline({ view }: { view: VisitHours }) {
  const { peak } = view
  if (peak === null) return null
  return (
    <p className="mt-2 text-body text-ink-2">
      {'가장 붐비는 때는 '}
      <span className="font-semibold text-ink">{`${weekdayOf(peak.weekday)}요일 ${hourName(peak.hour)}`}</span>
      {'예요 · 하루 평균 '}
      <span className="font-semibold text-ink">{`${averageText(peak.average)}건`}</span>
    </p>
  )
}

function HeatTable({ view }: { view: VisitHours }) {
  const peakAverage = view.peak?.average ?? 0
  return (
    <div className="mt-3 overflow-x-auto border-y border-line">
      <table className="w-full min-w-155 border-separate border-spacing-0.75">
        <caption className="sr-only">요일·시간마다 하루 평균 접수 (건)</caption>
        <thead>
          <tr>
            <th scope="col" className={HEAD}>
              <span className="sr-only">요일</span>
            </th>
            {view.hours.map((hour) => (
              <th key={hour} scope="col" className={HEAD}>
                {hour}시
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {view.rows.map((row) => (
            <tr key={row.weekday}>
              <th scope="row" className={WEEKDAY}>
                {weekdayOf(row.weekday)}
              </th>
              {row.cells.map((sum, i) => {
                const average = cellAverage(sum, row.openDays)
                return (
                  <td key={view.hours[i]} className={`${CELL} ${LEVEL_TONE[cellLevel(average, peakAverage)]}`}>
                    {averageText(average)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

type Props = {
  view: BitSectionsShown
  range: StatsRange // 설명의 기간 이름(name)
  className?: string
}

export function VisitHoursSection({ view, range, className }: Props) {
  const state = bitState(view)
  if (state.kind === 'note') return <BitNoteSection title={TITLE} note={state.note} className={className} />
  const desc = `${DESC} · ${range.name}`
  if (state.kind === 'waiting') {
    return (
      <Section title={TITLE} desc={desc} className={className}>
        {null}
      </Section>
    )
  }
  const { hours } = state
  const unknown = unknownHoursNote(hours.unknown)
  return (
    <DetailToggle table={totalsTable(hours)}>
      {({ button, panel }) => (
        <Section title={TITLE} desc={desc} action={button} className={className}>
          <Headline view={hours} />
          <HeatTable view={hours} />
          <div className="mt-2 flex items-center gap-1.5 text-caption text-muted">
            <span>적음</span>
            {LEGEND.map((tone) => (
              <span key={tone} aria-hidden="true" className={`inline-block h-3 w-4.5 ${tone}`} />
            ))}
            <span>많음</span>
          </div>
          {unknown !== null && <Note>{unknown}</Note>}
          {panel}
          <Note>{FOOT}</Note>
        </Section>
      )}
    </DetailToggle>
  )
}
