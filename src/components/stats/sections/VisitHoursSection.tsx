'use client'

import { useState } from 'react'
import { formatCount, percentOf } from '@/components/charts/format'
import type { StatsRange } from '@/components/stats/view'
import { ds } from '@/components/ui/classes'
import { cellAverage, heatLevel, heatText, heatTip, peakParts, unknownHoursNote } from '@/lib/analytics/visitHours'
import type { VisitHourRow, VisitHours } from '@/types/stats'
import { DetailToggle, type DetailTable } from './DetailToggle'
import { HowCounted } from './HowCounted'
import { BitNoteSection, bitState, type BitSectionsShown } from './PatientMixSection'
import { Note, Section } from './parts'

// 시간대별 접수 (stats-bit-sections AC-2706.1·AC-2706.3·AC-2704.1~2704.5, first90 REQ-4414 AC-4414.1·AC-4414.3, REQ-4417 AC-4417.2,
// 시안 docs/mockups/first90/redesign.html .s-sub-hours). 칸 = 그 요일·그 시 접수 합 ÷ 그 요일의 문 연 날 수(visitHours 셈 그대로).
// 칸 색은 하루 평균 여섯 구간(bg-st-h0~h5)이고 기간을 바꾸면 200ms 옮긴다(st-move-heat). 문 연 날이 없는 요일 줄은 한 칸 안내다.
// 칸을 누르면(PC는 올리기도) 아래 줄(role="status")에 그 칸 숫자가 나온다. 고른 칸·고른 요일·전체 표 보기는 이 칸의 React 상태뿐이다.
// 768px 미만은 요일 단추 + 시간마다 가로 막대이고, [전체 표 보기]를 누르면 같은 히트맵(요일 칸 고정)이다.
// [자세히]는 같은 모양의 합계 표(건수)를 연다(DetailToggle). 옛 긴 설명은 "어떻게 세나요?" 안이다

const TITLE = '시간대별 접수'
const DESC = '요일·시간마다 하루 평균 접수'
const WEEKDAYS = '월화수목금토일'
const FOOT = '병원 접수 시간(8시~20시) 기준이에요. 8시 전 접수는 8시 칸, 20시 넘은 접수는 20시 칸에 넣어요. 예약 대기·취소한 접수는 세지 않아요. 문을 연 날만 평균에 넣어요.'
const FOOT_NOW = '접수 시각 기준이에요. 대기 시간이나 필요한 직원 수를 뜻하지는 않아요. 0건 = 진료한 날이지만 그 시간 접수가 없었음.'
const PICK_NOTE = '칸을 누르면 그 시간의 자세한 숫자가 나와요.'
const NO_DAYS = '진료한 날 없음'
const SCROLL_NAME = '시간대별 접수 표, 옆으로 밀어 볼 수 있어요'

// 칸 색 여섯 구간(시안 .s-hm-0~5): 0은 옅은 회색 · 흐린 글자 500, 4·5는 흰 글자
const HEAT_BG = ['bg-st-h0', 'bg-st-h1', 'bg-st-h2', 'bg-st-h3', 'bg-st-h4', 'bg-st-h5'] as const
const HEAT_TONE = [
  'bg-st-h0 font-medium text-st-muted',
  'bg-st-h1 font-semibold text-st-ink',
  'bg-st-h2 font-semibold text-st-ink',
  'bg-st-h3 font-semibold text-st-ink',
  'bg-st-h4 font-semibold text-surface',
  'bg-st-h5 font-semibold text-surface',
] as const
const HEAT_LEGEND = ['0건', '0.1–4.9', '5–9.9', '10–14.9', '15–19.9', '20건 이상'] as const
// 768px 미만 시간 막대 색(시안 .s-hb-*): 한 단계 진하게, 0은 막대 없음
const DAY_BAR = ['', 'bg-st-h2', 'bg-st-h3', 'bg-st-h4', 'bg-st-h5', 'bg-st-h5'] as const

const HEAD = 'whitespace-nowrap px-0.5 py-0.5 text-center text-small font-semibold text-st-muted'
// 요일 칸은 표가 옆으로 밀려도 붙어 있다(시안 .s-hm-t tbody th)
const WEEKDAY = 'sticky left-0 z-1 whitespace-nowrap bg-surface pr-1.5 text-left text-st-15 font-semibold text-st-ink-2'
// 칸 단추(42px). 고른 칸은 진한 테두리
const CELL =
  'st-move-heat flex h-10.5 w-full cursor-pointer items-center justify-center rounded-control text-body tabular-nums focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent aria-pressed:outline-2 aria-pressed:outline-offset-1 aria-pressed:outline-ink'
const OFF_ROW = 'h-10.5 rounded-control bg-st-canvas px-3 text-body text-st-muted'
const DAY_ROW = 'grid min-h-7.5 grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-x-3 text-st-15 leading-6'
const STATUS = 'mt-3 min-h-5 text-body font-semibold tabular-nums text-st-ink'

type Pick = { weekday: number; hour: number }

const weekdayOf = (weekday: number) => WEEKDAYS[weekday - 1]!
const clock = (hour: number) => `${String(hour).padStart(2, '0')}:00`

// 합계 표: 첫 칸 '월 (4일)'(요일과 문 연 날 수), 칸은 접수 건수(AC-2704.5)
function totalsTable(view: VisitHours): DetailTable {
  return {
    caption: '시간대별 접수 합계 (건)',
    columns: ['요일 (문을 연 날)', ...view.hours.map((hour) => `${hour}시`)],
    rows: view.rows.map((row) => [`${weekdayOf(row.weekday)} (${formatCount(row.openDays)}일)`, ...row.cells.map((sum) => (sum > 0 ? formatCount(sum) : '–'))]),
  }
}

// 머리 줄: 요일·시와 평균만 굵고, 괄호 글은 흐리다(시안 .s-peak)
function Headline({ view }: { view: VisitHours }) {
  const parts = peakParts(view)
  if (parts === null) return null
  return (
    <p className="mt-2 text-st-15 leading-6 text-st-ink-2">
      {'가장 붐비는 때 '}
      <span className="font-semibold text-st-ink">{parts.when}</span>
      {' · 하루 평균 '}
      <span className="font-semibold text-st-ink">{parts.average}</span>{' '}
      <span className="text-st-muted">{parts.detail}</span>
    </p>
  )
}

function HeatRow({ row, hours, picked, onPick }: { row: VisitHourRow; hours: readonly number[]; picked: Pick | null; onPick(pick: Pick): void }) {
  const name = weekdayOf(row.weekday)
  return (
    <tr>
      <th scope="row" className={WEEKDAY}>
        {name}
      </th>
      {row.openDays === 0 ? (
        <td colSpan={hours.length} className={OFF_ROW}>{`${NO_DAYS} · 이 기간 ${name}요일에는 접수가 없었어요`}</td>
      ) : (
        row.cells.map((sum, i) => {
          const hour = hours[i]!
          const average = cellAverage(sum, row.openDays)
          const on = picked !== null && picked.weekday === row.weekday && picked.hour === hour
          const pick = () => onPick({ weekday: row.weekday, hour })
          return (
            <td key={hour} className="p-0">
              <button
                type="button"
                tabIndex={-1}
                aria-label={heatTip(row.weekday, hour, sum, row.openDays)}
                aria-pressed={on ? true : undefined}
                onClick={pick}
                onMouseEnter={pick}
                className={`${CELL} ${HEAT_TONE[heatLevel(average)]}`}
              >
                {heatText(average)}
              </button>
            </td>
          )
        })
      )}
    </tr>
  )
}

function HeatTable({ view, picked, onPick }: { view: VisitHours; picked: Pick | null; onPick(pick: Pick): void }) {
  return (
    <div role="region" tabIndex={0} aria-label={SCROLL_NAME} className="overflow-x-auto rounded-st-sm focus-visible:outline-2 focus-visible:outline-accent">
      <table className="w-full min-w-175 table-fixed border-separate border-spacing-1 max-lg:min-w-150 max-md:min-w-160">
        <caption className="sr-only">요일·시간마다 하루 평균 접수 (건)</caption>
        <colgroup>
          <col className="w-9" />
          <col span={view.hours.length} />
        </colgroup>
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
            <HeatRow key={row.weekday} row={row} hours={view.hours} picked={picked} onPick={onPick} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function HeatLegend() {
  return (
    <ul aria-label="색 구간(하루 평균 건수)" className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-small tabular-nums text-st-ink-2">
      {HEAT_LEGEND.map((label, i) => (
        <li key={label} className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className={`h-3.5 w-5 rounded-control ${HEAT_BG[i]}`} />
          {label}
        </li>
      ))}
    </ul>
  )
}

// 768px 미만 요일 보기: 요일 단추(문 연 날 없는 요일은 막힘) + 고른 요일의 시간마다 가로 막대. 막대 폭은 기간 전체에서 가장 붐비는 칸 대비
function DayBars({ view, shown, onDay }: { view: VisitHours; shown: VisitHourRow | null; onDay(weekday: number): void }) {
  const peakAverage = view.peak?.average ?? 0
  const averages = shown === null ? [] : shown.cells.map((sum) => cellAverage(sum, shown.openDays))
  const top = Math.max(0, ...averages)
  const topIndex = top > 0 ? averages.indexOf(top) : -1
  return (
    <>
      <div role="group" aria-label="요일" className={`${ds.segment.group} max-md:grid-cols-7`}>
        {view.rows.map((row) => {
          const off = row.openDays === 0
          const on = shown !== null && row.weekday === shown.weekday
          return (
            <button
              key={row.weekday}
              type="button"
              aria-pressed={on}
              aria-disabled={off ? true : undefined}
              title={off ? NO_DAYS : undefined}
              onClick={() => {
                if (!off) onDay(row.weekday)
              }}
              className={`${ds.segment.button} ${on ? ds.segment.on : ds.segment.off} aria-disabled:cursor-not-allowed aria-disabled:text-muted`}
            >
              {weekdayOf(row.weekday)}
            </button>
          )
        })}
      </div>
      {shown !== null && (
        <ul aria-label={`${weekdayOf(shown.weekday)}요일 시간마다 하루 평균 접수`} className="mt-3 grid gap-1">
          {averages.map((average, i) => {
            const hour = view.hours[i]!
            const peak = i === topIndex
            const level = heatLevel(average)
            return (
              <li key={hour} className={peak ? `${DAY_ROW} text-accent-strong` : DAY_ROW}>
                <span className={peak ? 'text-body tabular-nums' : 'text-body tabular-nums text-st-ink-2'}>{clock(hour)}</span>
                <span aria-hidden="true" className="block h-2.5 overflow-clip bg-canvas">
                  <span className={`st-move-period block h-full ${DAY_BAR[level]}`} style={{ width: `${percentOf(average, peakAverage)}%` }} />
                </span>
                <span className={peak ? 'min-w-15 text-right font-semibold tabular-nums' : 'min-w-15 text-right font-semibold tabular-nums text-st-ink'}>{`${heatText(average)}건`}</span>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

function HoursReady({ hours, desc, className }: { hours: VisitHours; desc: string; className?: string }) {
  const [picked, setPicked] = useState<Pick | null>(null)
  const [day, setDay] = useState<number | null>(null)
  const [full, setFull] = useState(false)
  const open = hours.rows.filter((row) => row.openDays > 0)
  // 고른 요일이 이 기간에 문 연 날이 없으면 문 연 첫 요일
  const shown = open.find((row) => row.weekday === day) ?? open[0] ?? null
  // 고른 칸의 요일이 이 기간에 문 연 날이 없으면 처음 글로 돌아간다
  const pickedRow = picked === null ? undefined : open.find((row) => row.weekday === picked.weekday)
  const tip = picked !== null && pickedRow !== undefined ? heatTip(picked.weekday, picked.hour, pickedRow.cells[hours.hours.indexOf(picked.hour)] ?? 0, pickedRow.openDays) : null
  const shownPick = tip === null ? null : picked
  const unknown = unknownHoursNote(hours.unknown)
  return (
    <DetailToggle table={totalsTable(hours)}>
      {({ button, panel }) => (
        <Section title={TITLE} desc={desc} action={button} className={className}>
          <Headline view={hours} />
          {/* PC 표 · 768px 미만 [전체 표 보기] 표(같은 표 하나) */}
          <div data-hm-view="full" className={full ? 'mt-3' : 'mt-3 max-md:hidden'}>
            {full && <p className="mb-1 text-right text-small text-st-muted md:hidden">옆으로 밀어 보세요 →</p>}
            <HeatTable view={hours} picked={shownPick} onPick={setPicked} />
            <HeatLegend />
          </div>
          <div data-hm-view="day" hidden={full} className="mt-3 md:hidden">
            <DayBars view={hours} shown={shown} onDay={setDay} />
          </div>
          <button type="button" aria-expanded={full} onClick={() => setFull(!full)} className={`${ds.button.secondary} mt-3 w-full md:hidden`}>
            {full ? '요일별로 보기' : '전체 표 보기'}
          </button>
          <p role="status" aria-live="polite" className={STATUS}>
            {tip ?? PICK_NOTE}
          </p>
          <p className="mt-2 text-small text-st-muted">{FOOT_NOW}</p>
          {unknown !== null && <Note>{unknown}</Note>}
          {panel}
          {/* 옛 긴 설명은 "어떻게 세나요?" 안에 접는다(stats-pc-ux AC-4004.2 ⑦). 범례·접수 시각 모름은 그대로 보인다(AC-4004.3) */}
          <HowCounted>
            <Note>{FOOT}</Note>
          </HowCounted>
        </Section>
      )}
    </DetailToggle>
  )
}

type Props = {
  view: BitSectionsShown
  range: StatsRange // 설명의 기간 이름(name)
  className?: string // 놓는 자리(진료 운영 카드 윗줄 70%). 모든 모습의 바깥 section에 붙는다
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
  return <HoursReady hours={state.hours} desc={desc} className={className} />
}
