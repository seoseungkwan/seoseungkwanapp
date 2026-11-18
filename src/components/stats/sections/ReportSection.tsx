'use client'

import { useId, useState, type ReactNode } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { Icon } from '@/components/common/Icon'
import { MonthlyReport } from '@/components/stats/report/MonthlyReport'
import { firstReportMonth, monthlyReport, reportMonths, type ReportCalendar } from '@/components/stats/report/reportData'
import { useReportReads } from '@/components/stats/report/useReportReads'
import { wideSpan, type WideDays } from '@/components/stats/useWideDays'
import { ds } from '@/components/ui/classes'
import { addDays, addMonths, monthOf, monthRange } from '@/lib/analytics/dates'
import { formatClinicReport } from '@/lib/clinicReport/reportText'
import type { ClinicReportMode, ClinicReportNumbers, ClinicReportResult } from '@/types/clinicReport'
import type { Goal } from '@/types/goals'
import type { StatsRxGroup } from '@/types/rxGroups'
import type { StatsLoaded } from '@/types/stats'
import type { StatsCalendarShown } from './CalendarSection'
import { CopyButton } from './CopyButton'
import type { GoalRead } from './GoalSection'
import { HowCounted } from './HowCounted'
import type { BitSectionsShown } from './PatientMixSection'
import { EmptyNote, longDate, monthNumber, Section, weekdayName } from './parts'

// 원장님 보고 문장 (stats REQ-513 AC-513.6·513.8, 시안 notes.md §3). 글은 formatClinicReport가 정하고(TASK-10) 여기서는 글자로만 그린다.
// report null = 비트 PC에서 불러온 자료가 없음. 벌은 차례가 아니라 기간으로 찾는다. 고르기 상태는 화면 안에만 둔다.
// pick(stats-period REQ-1707) = 고른 기간 보고. 있으면 [고른 기간 보고]가 맨 앞이고 처음 눌려 있다. 저장된 숫자로 만든 글이라 비트 없이도 보인다.
// 보고 글 아래 · 글들은 "어떻게 세나요?" 안에 접는다(stats-pc-ux AC-4004.2 ⑤, 글이 있을 때만). 날짜 줄·확정 못 함·개인정보 줄은 그대로 보인다(AC-4004.3)
// 보고 카드(first90 REQ-4415, 시안 redesign.html .s-rep): 글은 처음 네 줄만 보이고, 그 아래 [전체 보기]·[접기]와 [복사]가 있다. [복사]는 늘 글 전체다.
// 네 줄 셈은 글의 줄바꿈으로 나눈 줄 수(빈 줄도 한 줄)다. 네 줄 이하면 [전체 보기]도 줄 수 제한도 없다(AC-4415.2). 흐림 덧칠·움직임은 없다(design.md 5-2·5-3)

export type ReportData = {
  numbers: StatsLoaded['report']
  loadedAt: string // 불러온 시각 '18:42'
  closedToday: boolean // "오늘 진료 끝"을 켜고 불러옴
}

// 고른 기간 보고. label = 고른 기간 글(range.label), text = pickReportText 글(null = current 자료가 없어 만들 수 없음)
export type PickReport = { label: string; text: string | null }

type BitKey = 'today' | 'yesterday' | 'month' | 'lastMonth'
type PickKey = 'pick' | BitKey
type Pick = { key: BitKey; name: string; mode: ClinicReportMode }

const PICKS: Pick[] = [
  { key: 'today', name: '오늘 일일보고', mode: 'daily' },
  { key: 'yesterday', name: '어제 일일보고', mode: 'daily' },
  { key: 'month', name: '이번 달 월말보고', mode: 'monthly' },
  { key: 'lastMonth', name: '지난달 월말보고', mode: 'monthly' },
]

const TITLE = '원장님 보고 문장'
const DESC = '비트 PC에서 불러온 숫자로 만든 보고 글'
const BIT_ONLY = '비트 PC에서 불러오면 보여요'
const BIT_REASON = '금액은 서버에 저장하지 않아서, 비트 PC에서 불러온 화면에서만 볼 수 있어요.'
const PICK_NAME = '고른 기간 보고'

// 고르기 묶음 모양은 대시보드 기간 단추와 같다(시안 .seg). 휴대폰은 2칸 × 2줄
const GROUP = 'inline-flex flex-wrap overflow-clip rounded-control border border-line-strong bg-surface max-md:grid max-md:w-full max-md:grid-cols-2'
const BUTTON = 'h-7.5 cursor-pointer border-l border-line-strong px-3 text-small first:border-l-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent max-md:h-11'
const BUTTON_ON = 'bg-accent-soft font-semibold text-accent-strong'
const BUTTON_OFF = 'font-medium text-ink-2 transition hover:bg-canvas'
// 다섯이면 휴대폰에서 [고른 기간 보고]가 한 줄을 다 쓰고 옛 넷이 2칸 × 2줄이다
const PICK_BUTTON = 'max-md:col-span-2'

function periodOf(key: BitKey, today: string): string {
  const thisMonth = monthOf(today)
  if (key === 'today') return today
  if (key === 'yesterday') return addDays(today, -1)
  return key === 'month' ? thisMonth : addMonths(thisMonth, -1)
}

const weekdayDate = (ymd: string) => `${longDate(ymd)} ${weekdayName(ymd)}요일`

function dateLine(key: BitKey, today: string, report: ReportData, numbers: ClinicReportNumbers): string {
  const period = periodOf(key, today)
  const unconfirmed = numbers.ok && numbers.financeUnconfirmed ? ' · 금액 확인 필요' : ''
  if (key === 'today') return `${weekdayDate(today)} · ${report.loadedAt}까지 불러온 숫자예요${report.closedToday ? '' : '(오늘은 진료 중)'}${unconfirmed}`
  if (key === 'yesterday') return `${weekdayDate(period)}${unconfirmed}`
  const { from, to } = monthRange(period)
  if (key === 'month') return `${longDate(from)} – ${longDate(today)} · 오늘까지 불러온 숫자예요${unconfirmed}`
  return `${longDate(from)} – ${longDate(to)}${unconfirmed}`
}

type Shown = { lines: string[]; unconfirmed: ReadonlySet<number>; notes: string[]; text: string }

function shownOf(result: Extract<ClinicReportResult, { text: string }>): Shown {
  return { lines: result.text.split('\n'), unconfirmed: new Set(result.unconfirmedLines), notes: result.notes, text: result.text }
}

// 미리보기 줄 수. 줄 수 제한 클래스(line-clamp-4)와 같은 수다
const PREVIEW_LINES = 4
// 글 칸(시안 .s-rep: 옅은 회색 · 8px 모서리 · 14px 글자). 여백은 바깥 칸이 갖고 줄 수 제한은 안쪽 칸에 붙인다 — 잘린 다음 줄이 아래 여백에 비치지 않게.
// 안쪽 칸 -mx-2 px-2: '확인 필요' 줄 바탕(-mx-2)이 줄 수 제한의 잘림(overflow)에 깎이지 않게 그만큼 넓힌다
const TEXT_BOX = 'mt-2 rounded-st-sm bg-st-canvas px-4 py-3 text-body text-st-ink'
const TEXT_LINES = '-mx-2 whitespace-pre-wrap px-2'

// 글 아래 단추 줄(시안 .s-rep-a): [전체 보기]·[접기](네 줄이 넘을 때만) + [복사]. 글이 없으면 막힌 [복사]만
function Actions({ toggle, copyText }: { toggle?: ReactNode; copyText: string | null }) {
  return (
    <div className="mt-3 flex flex-wrap items-start justify-end gap-2">
      {toggle}
      <CopyButton text={copyText} label="복사" />
    </div>
  )
}

// 줄마다 블록이라 빈 줄도 자리를 지킨다. 빈 줄은 br 한 줄이라 줄 수 제한도 한 줄로 센다. 띄어쓰기는 그대로 둔다(whitespace-pre-wrap). '확인 필요' 줄은 색과 글자를 함께 쓴다.
// 고른 보고가 바뀌면 놓는 쪽이 key로 다시 그려 다시 접힌다
function ReportText({ shown }: { shown: Shown }) {
  const [open, setOpen] = useState(false)
  const boxId = useId()
  const long = shown.lines.length > PREVIEW_LINES
  return (
    <>
      <div id={boxId} className={TEXT_BOX}>
        <div className={long && !open ? `${TEXT_LINES} line-clamp-4` : TEXT_LINES}>
          {shown.lines.map((line, i) => (
            <span key={i} className={shown.unconfirmed.has(i) ? '-mx-2 block min-h-5.5 bg-warning-soft px-2 font-medium text-warning' : 'block min-h-5.5'}>
              {line === '' ? <br /> : line}
            </span>
          ))}
        </div>
      </div>
      <Actions
        copyText={shown.text}
        toggle={
          long && (
            <button type="button" aria-expanded={open} aria-controls={boxId} onClick={() => setOpen(!open)} className={ds.button.secondarySmall}>
              {open ? '접기' : '전체 보기'}
            </button>
          )
        }
      />
    </>
  )
}

function Unconfirmable({ place, reason }: { place: string; reason: string }) {
  return (
    <div className="mt-2 rounded-control bg-warning-soft px-4 py-3">
      <p className="text-body font-semibold text-warning">이 기간은 보고를 확정할 수 없어요</p>
      <p className="mt-0.5 text-small text-ink-2">{`비트 원본 통계에서 ${place} 숫자를 확인해 주세요. 이유: ${reason}`}</p>
    </div>
  )
}

type Bit = { key: BitKey; numbers: ClinicReportNumbers | null; result: ClinicReportResult | null; shown: Shown | null; place: string }

function bitReport(key: BitKey, report: ReportData, hospitalName: string, today: string): Bit {
  const pick = PICKS.find((item) => item.key === key)!
  const period = periodOf(key, today)
  const numbers = report.numbers[pick.mode].find((set) => set.period === period) ?? null
  const result = numbers === null ? null : formatClinicReport({ mode: pick.mode, numbers, hospitalName }, today)
  const shown = result !== null && 'text' in result ? shownOf(result) : null
  const place = pick.mode === 'daily' ? longDate(period) : `${monthNumber(`${period}-01`)}월`
  return { key, numbers, result, shown, place }
}

// 비트에서 불러온 숫자의 보고(옛 넷)
function BitBody({ bit, report, today }: { bit: Bit; report: ReportData; today: string }) {
  const { key, numbers, result, shown, place } = bit
  return (
    <>
      {numbers !== null && <p className="mt-4 text-small text-muted">{dateLine(key, today, report, numbers)}</p>}
      {shown !== null && <ReportText key={key} shown={shown} />}
      {shown !== null && shown.notes.length > 0 && (
        <HowCounted>
          <ul className="mt-2 grid gap-1">
            {shown.notes.map((note) => (
              <li key={note} className="grid grid-cols-[12px_minmax(0,1fr)] text-small text-ink-2">
                <span aria-hidden="true" className="text-muted">
                  ·
                </span>
                <span>{note}</span>
              </li>
            ))}
          </ul>
        </HowCounted>
      )}
      {result !== null && 'error' in result && result.error === 'unconfirmed' && <Unconfirmable place={place} reason={result.reason} />}
      {(numbers === null || (result !== null && 'error' in result && result.error === 'future-date')) && <EmptyNote title={BIT_ONLY}>{BIT_REASON}</EmptyNote>}
      {shown === null && <Actions copyText={null} />}
    </>
  )
}

function PickBody({ pick }: { pick: PickReport }) {
  if (pick.text === null) {
    return (
      <>
        <p className="mt-4 text-body text-ink-2">{`${pick.label}은 자료가 없어 보고 문장을 만들 수 없어요.`}</p>
        <Actions copyText={null} />
      </>
    )
  }
  return (
    <>
      <p className="mt-4 text-small text-muted">{`${pick.label} · 저장된 숫자로 만든 글이에요`}</p>
      <ReportText key="pick" shown={{ lines: pick.text.split('\n'), unconfirmed: new Set(), notes: [], text: pick.text }} />
    </>
  )
}

type Props = { report: ReportData | null; hospitalName: string; today: string; saved: boolean; pick?: PickReport | null; className?: string }

export function ReportSection({ report, hospitalName, today, saved, pick = null, className }: Props) {
  const [chosen, setKey] = useState<PickKey>(pick === null ? 'today' : 'pick')
  // 고른 기간 보고가 없어지면(빠른 단추로 돌아옴) 오늘 일일보고다. 화면은 들어오고 나갈 때 이 칸을 다시 그린다
  const key: PickKey = chosen === 'pick' && pick === null ? 'today' : chosen
  if (report === null && pick === null) {
    return (
      <Section title={TITLE} desc={saved ? DESC : undefined} className={className}>
        <EmptyNote title={BIT_ONLY}>{BIT_REASON}</EmptyNote>
      </Section>
    )
  }
  const buttons: { key: PickKey; name: string }[] = [...(pick === null ? [] : [{ key: 'pick' as const, name: PICK_NAME }]), ...PICKS]
  const bit = key === 'pick' || report === null ? null : bitReport(key, report, hospitalName, today)
  // 고르기 묶음 줄은 지금 그대로다(AC-4415.1). [복사]는 글 아래 줄로 옮겼다
  return (
    <Section title={TITLE} desc={DESC} className={className}>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <div role="group" aria-label="보고 고르기" className={GROUP}>
          {buttons.map((item) => (
            <button
              key={item.key}
              type="button"
              aria-pressed={item.key === key}
              onClick={() => setKey(item.key)}
              className={`${BUTTON} ${item.key === key ? BUTTON_ON : BUTTON_OFF}${item.key === 'pick' ? ` ${PICK_BUTTON}` : ''}`}
            >
              {item.name}
            </button>
          ))}
        </div>
      </div>
      {key === 'pick' && pick !== null && <PickBody pick={pick} />}
      {key !== 'pick' && report === null && (
        <>
          <EmptyNote title={BIT_ONLY}>{BIT_REASON}</EmptyNote>
          <Actions copyText={null} />
        </>
      )}
      {bit !== null && report !== null && <BitBody bit={bit} report={report} today={today} />}
      <p className="mt-3 flex items-start gap-1.5 text-caption text-muted">
        <Icon name="shield" size={14} className="mt-px shrink-0 text-positive" />
        <span>보고 문장은 숫자만 쓰고 환자 이름은 쓰지 않아요.</span>
      </p>
    </Section>
  )
}

// ── 월간 보고서 (stats-insights REQ-6108 AC-6108.1~AC-6108.3, 시안 docs/mockups/stats-insights ⑧) ─────────────
// 보고 카드 안 '원장님 보고 문장' 다음 h3 칸. 달 고르기(이번 달을 넣은 최근 12달 가운데 저장된 달, 처음은 지난달) + [인쇄] + 고른 달 보고서 종이.
// 내원·신환·묶음 숫자는 넓은 하루 읽기(wide), 매출·목표는 고른 달마다 useReportReads가 읽는다(이번 달 목표는 요약 칸 목표 훅 값 goal).
// 예약·빈자리는 예약 칸 값(calendar), 몇 번까지 받나·1명당 매출은 비트 칸 답(bit)이다. 셈은 reportData(순수), 그림은 MonthlyReport.
// [인쇄]는 window.print — 인쇄에는 종이만 나오고(MonthlyReport의 인쇄 규칙) 달 고르기·[인쇄]·오류 카드는 종이 밖이라 나오지 않는다.
// 넓은 읽기가 읽는 중이면 제목뿐, 실패면 오류 카드 + [다시 읽기], 저장된 달이 없으면 칸이 없다. 고른 달은 이 칸의 React 상태뿐이다

const MONTHLY_TITLE = '월간 보고서'
const PRINT = '인쇄'
const RETRY = '다시 읽기'
// 달 단추(예약 빈자리 시행자 고르기와 같은 모양). 넘치면 다음 줄, 휴대폰 44px
const MONTH_PICK = `h-8 cursor-pointer rounded-control border px-3 text-small whitespace-nowrap max-md:h-11 ${ds.focusRing}`
const MONTH_ON = 'border-st-ink bg-surface font-semibold text-st-ink'
const MONTH_OFF = 'border-line-strong bg-surface font-medium text-st-ink-2 hover:bg-canvas'

// 달 단추 글: 맨 앞 단추와 해가 바뀌는 단추는 'YYYY년 M월', 나머지는 'M월'(시안 '2026년 10월 · 9월 · 8월')
const monthNames = (months: readonly string[]) =>
  months.map((month, i) => {
    const name = `${Number(month.slice(5, 7))}월`
    return i === 0 || months[i - 1]!.slice(0, 4) !== month.slice(0, 4) ? `${Number(month.slice(0, 4))}년 ${name}` : name
  })

// 예약 칸 값 → 보고서 입력. 예약 줄을 읽는 중·실패면 null, 빈자리 줄을 읽는 중·실패면 slots null
function reportCalendar(calendar: StatsCalendarShown | undefined): ReportCalendar | null {
  if (calendar === undefined || typeof calendar.rows === 'string') return null
  const slots = typeof calendar.slots === 'object' ? calendar.slots : null
  return calendar.settings === undefined ? { rows: calendar.rows, slots } : { rows: calendar.rows, settings: calendar.settings, slots }
}

export type MonthlyReportProps = {
  today: string
  hospitalName: string
  wide: WideDays // 넓은 하루 읽기(오늘 앞 12달, useWideDays)
  groups: readonly StatsRxGroup[] // 처방별 추세 묶음
  calendar?: StatsCalendarShown // 예약 칸 값. 주지 않으면 예약·시행자별·빈자리 칸이 없다
  bit?: BitSectionsShown // 비트 칸 답. 주지 않거나 null·'waiting'이면 몇 번까지 받나·1명당 매출 칸이 없다
  goal?: GoalRead<Goal> // 이번 달 목표(useStatsGoals). 주지 않으면 이번 달도 따로 읽는다
  revision?: number // 저장·[다시 읽기]마다 는다(고른 달의 매출·목표를 다시 읽는다)
}

export function MonthlyReportSection({ today, hospitalName, wide, groups, calendar, bit, goal, revision = 0 }: MonthlyReportProps) {
  const [picked, setPicked] = useState<string | null>(null)
  const months = wide.state === 'ready' ? reportMonths(wide.days, today) : []
  const month = picked !== null && months.includes(picked) ? picked : firstReportMonth(months, today)
  const given = month === monthOf(today) && goal !== undefined ? goal : null
  const reads = useReportReads(month, { revision, withGoal: given === null })

  if (wide.state === 'reading') return <Section title={MONTHLY_TITLE}>{null}</Section>
  if (wide.state === 'failed') {
    return (
      <Section title={MONTHLY_TITLE}>
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
  if (month === null) return null

  const goalShown = given ?? reads.goal
  const data = monthlyReport({
    month,
    today,
    hospitalName,
    days: wide.days,
    daysFrom: wideSpan(today).from,
    groups,
    sales: typeof reads.sales === 'object' ? reads.sales : null,
    goal: typeof goalShown === 'object' ? goalShown : null,
    calendar: reportCalendar(calendar),
    bit: bit === undefined || bit === null || bit === 'waiting' ? null : bit,
  })
  // 이번 달 목표(요약 칸 값)의 실패는 목표 칸이 알린다. 여기서는 이 칸이 읽은 것만
  const failed = reads.sales === 'failed' || (given === null && reads.goal === 'failed')
  const names = monthNames(months)

  return (
    <Section title={MONTHLY_TITLE}>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <div role="group" aria-label="달" className="flex flex-wrap gap-1.5">
          {months.map((item, i) => (
            <button
              key={item}
              type="button"
              aria-pressed={item === month}
              onClick={() => setPicked(item)}
              className={`${MONTH_PICK} ${item === month ? MONTH_ON : MONTH_OFF}`}
            >
              {names[i]}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => window.print()} className={`${ds.button.primarySmall} max-md:w-full`}>
          {PRINT}
        </button>
      </div>
      {failed && (
        <>
          <div className="mt-3">
            <ErrorCard code="E-STATS-READ-FAILED" />
          </div>
          <div className="mt-2">
            <button type="button" onClick={reads.retry} className={`${ds.button.secondarySmall} max-md:w-full`}>
              {RETRY}
            </button>
          </div>
        </>
      )}
      <MonthlyReport data={data} />
    </Section>
  )
}
