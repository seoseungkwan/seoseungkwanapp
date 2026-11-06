'use client'

import { useState } from 'react'
import { Icon } from '@/components/common/Icon'
import { addDays, addMonths, monthOf, monthRange } from '@/lib/analytics/dates'
import { formatClinicReport } from '@/lib/clinicReport/reportText'
import type { ClinicReportMode, ClinicReportNumbers, ClinicReportResult } from '@/types/clinicReport'
import type { StatsLoaded } from '@/types/stats'
import { CopyButton } from './CopyButton'
import { EmptyNote, longDate, monthNumber, Section, weekdayName } from './parts'

// 원장님 보고 문장 (stats REQ-513 AC-513.6·513.8, 시안 notes.md §3). 글은 formatClinicReport가 정하고(TASK-10) 여기서는 글자로만 그린다.
// report null = 비트 PC에서 불러온 자료가 없음. 벌은 차례가 아니라 기간으로 찾는다. 고르기 상태는 화면 안에만 둔다.
// pick(stats-period REQ-1707) = 고른 기간 보고. 있으면 [고른 기간 보고]가 맨 앞이고 처음 눌려 있다. 저장된 숫자로 만든 글이라 비트 없이도 보인다

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

// 줄마다 블록이라 빈 줄도 자리를 지킨다. 띄어쓰기는 그대로 둔다(whitespace-pre-wrap). '확인 필요' 줄은 색과 글자를 함께 쓴다
function ReportText({ shown }: { shown: Shown }) {
  return (
    <div className="mt-2 whitespace-pre-wrap rounded-control bg-canvas px-5 py-4 text-body text-ink">
      {shown.lines.map((line, i) => (
        <span key={i} className={shown.unconfirmed.has(i) ? '-mx-2 block min-h-5.5 bg-warning-soft px-2 font-medium text-warning' : 'block min-h-5.5'}>
          {line}
        </span>
      ))}
    </div>
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
      {shown !== null && <ReportText shown={shown} />}
      {shown !== null && shown.notes.length > 0 && (
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
      )}
      {result !== null && 'error' in result && result.error === 'unconfirmed' && <Unconfirmable place={place} reason={result.reason} />}
      {(numbers === null || (result !== null && 'error' in result && result.error === 'future-date')) && <EmptyNote title={BIT_ONLY}>{BIT_REASON}</EmptyNote>}
    </>
  )
}

function PickBody({ pick }: { pick: PickReport }) {
  if (pick.text === null) return <p className="mt-4 text-body text-ink-2">{`${pick.label}은 자료가 없어 보고 문장을 만들 수 없어요.`}</p>
  return (
    <>
      <p className="mt-4 text-small text-muted">{`${pick.label} · 저장된 숫자로 만든 글이에요`}</p>
      <ReportText shown={{ lines: pick.text.split('\n'), unconfirmed: new Set(), notes: [], text: pick.text }} />
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
  const copyText = key === 'pick' ? (pick?.text ?? null) : (bit?.shown?.text ?? null)
  return (
    <Section title={TITLE} desc={DESC} className={className}>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
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
        <CopyButton key={key} text={copyText} label="복사" fullOnPhone />
      </div>
      {key === 'pick' && pick !== null && <PickBody pick={pick} />}
      {key !== 'pick' && report === null && <EmptyNote title={BIT_ONLY}>{BIT_REASON}</EmptyNote>}
      {bit !== null && report !== null && <BitBody bit={bit} report={report} today={today} />}
      <p className="mt-3 flex items-start gap-1.5 text-caption text-muted">
        <Icon name="shield" size={14} className="mt-px shrink-0 text-positive" />
        <span>보고 문장은 숫자만 쓰고 환자 이름은 쓰지 않아요.</span>
      </p>
    </Section>
  )
}
