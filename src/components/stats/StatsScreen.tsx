'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { Icon } from '@/components/common/Icon'
import { useViewing, WriteOnly } from '@/components/shell/viewing'
import { ds } from '@/components/ui/classes'
import { addDays, compareYmd, monthRange, todayInKorea } from '@/lib/analytics/dates'
import type { DateRange } from '@/types/dates'
import type { ErrorCode } from '@/types/errors'
import type { DayPayload } from '@/types/payload'
import type { BitSectionsView, RxSplitView, StatsChecks, StatsLoaded } from '@/types/stats'
import { doneText, partSave, planLoad, progressText, revenueProgressText, stoppedText, type LoadPlan, type LoadSpan } from './loadPlan'
import { lastDayOf, type StatsChoice } from './periodPick'
import { PERIOD_BUTTON, PERIOD_GROUP, PERIOD_OFF, PERIOD_ON, PeriodPicker } from './PeriodPicker'
import { dayNumber, longDate, monthNumber, PERIOD_NAME } from './sections/parts'
import type { ReportData } from './sections/ReportSection'
import { StatsSections, StatsWaiting } from './sections/StatsSections'
import { readFiles, SourcePicker, type FileFailure, type FileIncomplete, type StatsJob } from './SourcePicker'
import { useStatsCalendar } from './useStatsCalendar'
import { useStatsData, type SavedLatest, type StatsData } from './useStatsData'
import { useStatsGoals } from './useStatsGoals'
import { StatsToc } from './StatsToc'
import { useStatsRevenue, type RevenueFailure } from './useStatsRevenue'
import { useStatsRxGroups } from './useStatsRxGroups'
import { useStatsSunap } from './useStatsSunap'
import { errorCodeOf, useStatsWorker } from './useStatsWorker'
import { useWideDays } from './useWideDays'
import { DEFAULT_STATS_PERIOD, rangeOf, type CompareRange, type StatsPeriod, type StatsRange } from './view'

// 통계 화면 (stats REQ-514, 시안 docs/mockups/stats/notes.md §2·§3). 숫자·처방 이름·보고 글은 React 상태와 Worker 메모리에만 둔다(AC-514.9).
// 처방별 신환·재진과 보고 문장은 이 화면에서 비트로 불러온 뒤에만 있다(서버에 저장하지 않는다).
// 기간은 빠른 단추 넷 또는 기간 골라 보기(stats-period REQ-1703)다. 고른 것은 상태에만 두고(처음은 최근 30일) range = rangeOf(today, choice, todayDone)
// 처방별 추세 묶음 훅은 여기서 한 번 부른다: 불러오기(묶음으로 셈)와 칸(보기·고치기)이 같은 묶음을 쓴다(treatment-trend design.md '잇기')
// 예약·전환(sunap-ilji REQ-4906): 마감한 날·수납일지 Block·물리치료 묶음은 useStatsSunap이 읽고, 묶음 정의는 세 칸 묻기에 실어 Block 전환 수를 함께 받는다
// 예약(clinic-calendar AC-5907.3): 예약 탭 예약은 useStatsCalendar가 오늘 기준 최근 12달을 읽는다(통계 기간·불러오기와 상관없음)
// 알림·휴일·목표(stats-insights design.md '자료 흐름'): useWideDays가 오늘 앞 12달 저장된 하루 숫자를 기간 고르기와 따로 읽고(저장에 성공하거나 [다시 읽기]를 누르면
// data.revision이 늘어 다시 읽는다), useStatsGoals가 이번 달 목표와 오늘 앞 56일 하루 매출을 읽는다. 하나가 실패해도 그 칸만 오류 카드다.
// 목표 칸·월간 보고서는 data.revision과 비트 매출 읽기(sync)가 끝난 횟수가 늘 때마다 다시 읽는다: 매출은 통계 저장 뒤에 저장되므로 그 뒤 읽어야 새 총액이다(AC-6102.6·AC-6108.5)
// 매출(stats-revenue REQ-4108, design.md '화면 잇기'): 저장된 매출은 열 때 읽어 기간 요약 둘째 줄·매출 칸에 그린다(useStatsRevenue). 비트 매출은 [비트에서 불러오기]가
// 통계 조각을 모두 저장한 뒤에만 같은 일 안에서 통계가 쥔 같은 비트 연결(useStatsWorker.revenueDays)로 읽는다. 열기만 해서는 비트에서 읽지 않는다

const PERIODS: StatsPeriod[] = ['7d', '30d', '90d', '12m']
const SOURCE_NAME = { bit: '비트 PC', file: '파일' } as const
const FILE_NOTE = '파일 자료는 처방이 없는 접수와 같은 날 다시 접수한 건이 빠져 비트 PC 숫자보다 적을 수 있어요.' // 사용자가 승인한 문장(AC-514.7). 시안에 없다
const NOT_SAVED = '일부 기록을 확인하지 못해 저장하지 않았어요'

// 빠른 단추 묶음 위의 이름(시안 BEpX6zDbmmBmvBhZqCKmno '빠르게 보기'). 단추 모양은 PeriodPicker.tsx의 것을 쓴다
const QUICK_CAPTION = '빠르게 보기'
const UNIT_NAME = { day: '일별', week: '주별', month: '월별' } as const

const NO_DAYS: readonly DayPayload[] = []

const CLOCK = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const clockOf = (date: Date) => CLOCK.format(date)
// updated_at → "11월 13일 18:42"(한국 시간)
function stampOf(at: string): string {
  const date = new Date(at)
  return `${longDate(todayInKorea(date))} ${clockOf(date)}`
}

// 처방별 표는 불러온 끝(오늘)을 넘겨 묻지 않는다. '12m'의 끝은 달 말일이라 자르지 않으면 그 달 마지막 날 말고는 { kind: 'none' }이다(AC-509.4)
function splitSpan(range: StatsRange): DateRange {
  const { from, to } = range.current
  return { from, to: compareYmd(to, range.load.to) > 0 ? range.load.to : to }
}

// 처방별 답. 어느 불러오기의 어느 기간 답인지 함께 둔다: 앞 기간·앞 불러오기의 숫자를 지금 숫자처럼 쓰지 않으려고.
// 실패도 답이다(view null + 번호). 답이 오기 전까지 화면은 "불러오는 중"이다
type SplitAnswer = DateRange & { loads: number; view: RxSplitView | null; error: ErrorCode | null }
// 비트 전용 세 칸 답(stats-bit-sections). 처방별 답처럼 어느 불러오기·어느 기간·어느 견줄 기간의 답인지 함께 둔다
type BitAnswer = DateRange & { loads: number; prevFrom: string; prevTo: string; view: BitSectionsView | null; error: ErrorCode | null }

// 저장하지 않은 불러오기의 안내. 비트는 확인 건수와 "처방별·보고는 방금 불러온 숫자", 파일은 건수만이다
type Incomplete = { kind: 'bit'; checks: StatsChecks } | ({ kind: 'file' } & FileIncomplete)

function incompleteLine(note: Incomplete): string {
  if (note.kind === 'bit') {
    const { noChart, duplicate, noFirst } = note.checks
    const items = [
      noChart > 0 && `차트번호 없는 내원 ${noChart}건`,
      duplicate > 0 && `중복 내원 ${duplicate}건`,
      noFirst > 0 && `첫 내원을 못 찾은 환자 ${noFirst}명`,
    ].filter(Boolean)
    return `${items.join(' · ')}이 있어요. 비트에서 이 기록을 고친 뒤 다시 불러와 주세요.`
  }
  const items = [note.failedFiles > 0 && `읽지 못한 파일 ${note.failedFiles}건`, note.skippedRows > 0 && `확인하지 못한 줄 ${note.skippedRows}건`].filter(Boolean)
  return `${items.join(' · ')}이 있어요. 파일을 확인한 뒤 다시 넣어 주세요.`
}

function IncompleteCard({ note, latest }: { note: Incomplete; latest: SavedLatest }) {
  const parts = [latest && `아래 그래프는 전에 저장한 숫자(${stampOf(latest.at)} 저장)예요.`, note.kind === 'bit' && '처방별 신환·재진과 보고 문장은 방금 불러온 숫자예요.'].filter(Boolean)
  return (
    <div role="status" className="mt-4 flex items-start gap-2 rounded-control bg-warning-soft px-4 py-3">
      <Icon name="stop" className="mt-0.5 shrink-0 text-warning" />
      <div className="min-w-0">
        <p className="text-body font-semibold text-warning">{NOT_SAVED}</p>
        <p className="mt-0.5 text-body text-ink-2">{incompleteLine(note)}</p>
        {parts.length > 0 && <p className="mt-1 text-body text-ink-2">{parts.join(' ')}</p>}
      </div>
    </div>
  )
}

// 끝난·멈춘 나눠 읽기(stats-load-range AC-3303.5·AC-3303.6). done = 저장한 조각 수, savedTo = 처음 누를 때의 저장한 끝날,
// closeToday = 처음 누를 때의 '오늘 진료 끝'([이어서 불러오기] 뒤 매출을 이 값으로 읽는다, stats-revenue design.md '화면 잇기'),
// stop = 멈춘 까닭 글('(오류 번호 …)' 또는 확인 건수 글), null이면 다 끝남. 화면 상태에만 두고 기억하지 않는다
type LoadRun = { plan: LoadPlan; done: number; savedTo: string; closeToday: boolean; stop: string | null }

// 띠 아래 상자(시안 docs/mockups/stats-load-range #result). 조각이 둘 이상일 때만 그린다. 멈춤은 [이어서 불러오기]가 남은 조각을 읽는다
function LoadRunBox({ run, busy, onResume }: { run: LoadRun; busy: boolean; onResume(): void }) {
  const [title, line] = run.stop === null ? doneText(run.plan, run.savedTo) : stoppedText(run.plan, run.done, run.stop)
  return (
    <div role="status" className="mt-3 text-body">
      <p className="font-semibold text-ink">{title}</p>
      <p className="mt-0.5 text-small text-ink-2">{line}</p>
      {run.stop !== null && (
        <button type="button" aria-disabled={busy || undefined} className={`mt-2 ${ds.button.secondary}`} onClick={busy ? undefined : onResume}>
          이어서 불러오기
        </button>
      )}
    </div>
  )
}

// 매출만 실패 상자(stats-revenue AC-4108.5·기본값 13, 시안 docs/mockups/stats-revenue ?s=rev-failed): 통계 조각은 모두 저장했는데 매출 덩어리가 실패·멈춤일 때
// 띠 바로 아래(나눠 읽기 상자 다음). 오류 번호는 처음 난 것, savedTo = 전에 저장한 매출의 끝날(없으면 null).
// [매출만 다시 읽기]는 같은 불러올 기간·같은 '오늘 진료 끝'으로 매출만 다시 읽는다. 화면 상태에만 두고 기억하지 않는다
const REVENUE_FAILED = '매출은 읽지 못했어요'
const REVENUE_RETRY = '매출만 다시 읽기'

function revenueFailLine({ code, savedTo }: RevenueFailure): string {
  const before = savedTo === null ? '매출은 아직 저장된 숫자가 없어요.' : `매출 칸은 전에 저장한 숫자(${longDate(savedTo)}까지)예요.`
  return `환자·처방은 방금 저장했어요. ${before} (오류 번호 ${code})`
}

function RevenueFailBox({ failure, busy, onRetry }: { failure: RevenueFailure; busy: boolean; onRetry(): void }) {
  return (
    <div role="status" className="mt-4 flex items-start gap-2 rounded-control bg-warning-soft px-4 py-3">
      <Icon name="stop" className="mt-0.5 shrink-0 text-warning" />
      <div className="min-w-0">
        <p className="text-body font-semibold text-warning">{REVENUE_FAILED}</p>
        <p className="mt-0.5 text-body text-ink-2">{revenueFailLine(failure)}</p>
        <button type="button" aria-disabled={busy || undefined} className={`mt-2 ${ds.button.secondary}`} onClick={busy ? undefined : onRetry}>
          {REVENUE_RETRY}
        </button>
      </div>
    </div>
  )
}

// 오류 카드 + 카드 밖 단추(ErrorCard 규칙). 저장 실패·읽기 실패가 같이 쓴다
function ErrorWithAction({ code, action, note }: { code: ErrorCode; action: ReactNode; note?: string }) {
  return (
    <div className="mt-4">
      <ErrorCard code={code} />
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        {action}
        {note && <span className="text-small text-ink-2">{note}</span>}
      </div>
    </div>
  )
}

// 기간 글 뒤. 빠른 단추는 지금 글(' (어제까지)'·' (11월은 13일까지)'), 고른 기간은 ' · 일별'이고 끝나지 않은 달·해는 ' (어제까지)'(오늘 끝이면 ' (오늘까지)') (AC-1703.4)
function rangeSuffix(range: StatsRange, choice: StatsChoice, todayDone: boolean): string {
  const today = range.load.to
  if (typeof choice === 'string') return range.grain === 'month' ? ` (${monthNumber(today)}월은 ${dayNumber(today)}일까지)` : ' (어제까지)'
  const unit = UNIT_NAME[choice.kind === 'year' ? 'month' : choice.unit]
  const end = choice.kind === 'month' ? monthRange(choice.month).to : choice.kind === 'year' ? `${choice.year}-12-31` : range.current.to
  return range.current.to === end ? ` · ${unit}` : ` · ${unit} (${todayDone ? '오늘까지' : '어제까지'})`
}

// 비교 글. 빠른 단추·해는 하나, 달·직접 날짜는 바로 전 · 작년 같은 기간 둘이다
const compareText = (range: StatsRange) =>
  [range.previous, ...(range.lastYear === null ? [] : [range.lastYear])].map((span: CompareRange) => `${span.label} (${span.why})`).join(' · ')

function RangeText({ range, choice, todayDone }: { range: StatsRange; choice: StatsChoice; todayDone: boolean }) {
  return (
    <div className="mt-3 text-small text-muted">
      <p>
        <span className="font-semibold text-ink">{range.label}</span>
        {rangeSuffix(range, choice, todayDone)}
      </p>
      <p>비교: {compareText(range)}</p>
    </div>
  )
}

// 덮은 기간 끝 글. 불러오기 띠 한 줄에 들게 '… 끝난 날로 저장했어요'를 '…까지'로 줄였다(stats-pc-ux AC-4001.6, 시안 notes.md '새 글')
function coverClause(to: string | undefined, today: string): string {
  if (to === undefined) return ''
  if (to === today) return ` · 오늘(${longDate(to)})까지`
  if (to === addDays(today, -1)) return ` · 어제(${longDate(to)})까지`
  return ` · ${longDate(to)}까지`
}

// 출처 줄 글: 앞은 ink-2, 뒤는 muted. latest가 null이면(시각을 못 읽는 브라우저) 출처 줄만 없다
function sourceLine(data: StatsData, today: string, notSaved: boolean): { main: string; rest: string } | null {
  const { unsaved, saved, latest, coveredTo, justSaved } = data
  if (unsaved !== null) return { main: `자료: ${SOURCE_NAME[unsaved]} · 방금 불러옴`, rest: ' · 아직 저장하지 못했어요' }
  if (!saved) return { main: '자료: ', rest: '아직 저장된 숫자가 없어요' }
  if (latest === null) return null
  const main = `자료: ${SOURCE_NAME[latest.source]} · ${stampOf(latest.at)} 저장`
  if (notSaved) return { main, rest: ' · 방금 불러온 숫자는 저장하지 않았어요' }
  // 고른 기간은 읽은 덮은 기간을 잘라 쓰므로 자르기 전 끝(coveredTo)으로 적는다(AC-1706.5)
  return { main: justSaved ? `${main} · 방금` : main, rest: coverClause(coveredTo ?? undefined, today) }
}

// 불러오기 띠 왼쪽 자료 글(stats-pc-ux AC-4001.6). 기간 글 아래 따로 있던 자료 줄을 옮겼다. 파일 자료 안내는 그 아래 줄
function SourceSummary({ data, today, notSaved }: { data: StatsData; today: string; notSaved: boolean }) {
  const line = sourceLine(data, today, notSaved)
  if (line === null && !data.fromFile) return null
  return (
    <div className="text-small text-ink-2">
      {line !== null && (
        <p>
          {line.main}
          <span className="text-muted">{line.rest}</span>
        </p>
      )}
      {data.fromFile && <p>{FILE_NOTE}</p>}
    </div>
  )
}

export function StatsScreen({ hospitalName: myName, today }: { hospitalName: string; today: string }) {
  // 다른 의원을 보는 중(admin-view AC-8008.1)이면 칸 복사 글·보고 문장의 이름은 보는 의원 이름이다
  const hospitalName = useViewing()?.name ?? myName
  const [choice, setChoice] = useState<StatsChoice>(DEFAULT_STATS_PERIOD)
  const data = useStatsData(choice, today)
  const { todayDone } = data
  const range = useMemo(() => rangeOf(today, choice, todayDone), [today, choice, todayDone])
  const lastDay = lastDayOf(today, todayDone)
  const { state, helloError, retry, load, split, sections, revenueDays, helperVersion } = useStatsWorker()
  const groups = useStatsRxGroups(data.input?.days ?? NO_DAYS)
  const sunap = useStatsSunap(range, groups)
  const sunapDefs = sunap.defs
  const calendar = useStatsCalendar(today)
  const wide = useWideDays(today, data.revision)
  const [revenueSyncs, setRevenueSyncs] = useState(0) // 비트 매출 읽기(sync)가 끝난 횟수(AC-6102.6)
  const salesRevision = data.revision + revenueSyncs // 목표 칸·월간 보고서가 하루 매출을 다시 읽는 때(AC-6102.6·AC-6108.5)
  const goals = useStatsGoals(today, salesRevision)
  // 비트 PC가 아니면(확장 없음·휴대폰·연결 전) call이 없어 저장된 매출만 읽는다(AC-4108.7)
  const revenue = useStatsRevenue({ range, today, lastDay, call: state === 'ready' ? revenueDays : null, helperVersion })

  const [job, setJob] = useState<StatsJob | null>(null)
  const [actionError, setActionError] = useState<ErrorCode | null>(null)
  const [fileFailures, setFileFailures] = useState<FileFailure[]>([])
  const [incomplete, setIncomplete] = useState<Incomplete | null>(null)
  const [report, setReport] = useState<ReportData | null>(null)
  const [splitAnswer, setSplitAnswer] = useState<SplitAnswer | null>(null)
  const [bitAnswer, setBitAnswer] = useState<BitAnswer | null>(null)
  const [loads, setLoads] = useState(0) // 비트에서 불러온 횟수. 0이면 Worker 메모리에 진료 줄이 없다
  const [savedUnread, setSavedUnread] = useState(false) // 방금 저장에 성공했고 그 뒤 아직 읽기에 성공하지 못했다(AC-514.11)
  const [partAt, setPartAt] = useState<{ plan: LoadPlan; at: number } | null>(null) // 나눠 읽는 중인 조각(읽는 중 줄, AC-3303.4)
  const [run, setRun] = useState<LoadRun | null>(null) // 끝난·멈춘 나눠 읽기(상자·이어서, AC-3303.5 ~ AC-3303.9)
  // 마지막 매출 읽기의 불러올 기간·'오늘 진료 끝'([매출만 다시 읽기]가 같은 값으로 읽는다)과 지운 매출만 실패 상자(새 불러오기를 시작하면 그때의 실패를 감춘다, 기본값 13)
  const [revenueRun, setRevenueRun] = useState<{ whole: DateRange; closeToday: boolean } | null>(null)
  const [revenueHidden, setRevenueHidden] = useState<RevenueFailure | null>(null)
  const working = useRef(false)

  const { from: splitFrom, to: splitTo } = splitSpan(range)
  const { from: prevFrom, to: prevTo } = range.previous
  // 세 칸(환자 구성·시간대별 접수·원장님별)도 처방별과 같은 때(불러오기 횟수·기간·견줄 기간이 바뀔 때) 묻는다. 끝은 처방별처럼 불러온 끝에서 자른다.
  // 견줄 기간은 range.previous 그대로다(Worker가 범위 안일 때만 센다). 처방별 묻기보다 먼저 둔다: 같은 때 묻는 처방별이 마지막 요청으로 남는다.
  // 수납일지 묶음 정의가 있으면 함께 실어 같은 기간 Block 전환 수(sunap)를 받는다. 설정·묶음이 나중에 오거나 바뀌면 다시 묻는다(sunap-ilji AC-4906.3)
  useEffect(() => {
    if (loads === 0) return
    let current = true
    const asked = { loads, from: splitFrom, to: splitTo, prevFrom, prevTo }
    sections({ from: splitFrom, to: splitTo, previous: { from: prevFrom, to: prevTo }, sunap: sunapDefs }).then(
      (view) => {
        if (current) setBitAnswer({ ...asked, view, error: null })
      },
      (error: unknown) => {
        if (current) setBitAnswer({ ...asked, view: null, error: errorCodeOf(error) })
      },
    )
    return () => {
      current = false
    }
  }, [loads, sections, splitFrom, splitTo, prevFrom, prevTo, sunapDefs])
  const bitAnswered =
    bitAnswer !== null && bitAnswer.loads === loads && bitAnswer.from === splitFrom && bitAnswer.to === splitTo && bitAnswer.prevFrom === prevFrom && bitAnswer.prevTo === prevTo
      ? bitAnswer
      : null
  // 이 기기에서 불러오지 않았으면 null, 이 기간 답을 기다리는 동안은 'waiting'(세 칸만 제목·설명. 다른 칸은 기다리지 않는다)
  const bit = loads === 0 ? null : bitAnswered === null ? 'waiting' : bitAnswered.view

  useEffect(() => {
    if (loads === 0) return
    let current = true
    const asked = { loads, from: splitFrom, to: splitTo }
    split({ from: splitFrom, to: splitTo }).then(
      (view) => {
        if (current) setSplitAnswer({ ...asked, view, error: null })
      },
      (error: unknown) => {
        if (current) setSplitAnswer({ ...asked, view: null, error: errorCodeOf(error) })
      },
    )
    return () => {
      current = false
    }
  }, [loads, split, splitFrom, splitTo])
  const answered = splitAnswer !== null && splitAnswer.loads === loads && splitAnswer.from === splitFrom && splitAnswer.to === splitTo ? splitAnswer : null

  // 일은 한 번에 하나다: 불러오기·파일·[다시 저장]이 겹치면 늦게 끝난 저장이 더 새 숫자를 덮을 수 있다.
  // 불러오기·파일은 앞 일의 안내를 지우고 시작한다. [다시 저장]은 하던 저장을 잇는 것이라 안내를 그대로 둔다.
  // [매출만 다시 읽기](keep)는 비트 일이지만 다른 안내를 지우지 않는다(stats-revenue design.md '화면 잇기')
  async function runJob(kind: StatsJob, work: () => Promise<unknown>, { keep = false }: { keep?: boolean } = {}) {
    if (working.current) return
    working.current = true
    setJob(kind)
    if (kind !== 'save' && !keep) {
      setActionError(null)
      setFileFailures([])
      setIncomplete(null)
      setSavedUnread(false)
      setRun(null)
      setRevenueHidden(revenue.failure)
    }
    try {
      await work()
    } catch (error) {
      setActionError(errorCodeOf(error))
    } finally {
      working.current = false
      setJob(null)
    }
  }

  // 비트 불러오기는 불러올 기간의 계획(planLoad) 조각을 새것부터 하나씩 읽고 저장한다(stats-load-range REQ-3303). 조각이 하나면 지금 그대로다.
  // 처음 누를 때(start 0)와 [이어서 불러오기](멈춘 조각부터)가 같이 쓴다. closeToday는 처음 누를 때의 값이고 첫 조각(i 0)에만 가므로
  // [이어서 불러오기](start 1 이상)의 비트 요청은 늘 closeToday false다. 일은 처음부터 끝까지 'bit' 하나다.
  // 묶음은 누를 때 한 번 서버에서 다시 읽어 모든 조각이 같이 쓴다(AC-1205.7). 비트 요청은 그것을 기다리지 않는다.
  // forLoad는 거절하지 않고 5초 안에 늘 풀린다(실패·한도 넘김이면 화면의 묶음).
  // 첫 조각의 읽기 실패(runJob의 오류 카드)·확인 필요·저장 실패는 지금과 같고, 둘째부터는 다음 조각을 읽지 않고 멈춤 상자다.
  // 모든 조각을 저장했을 때만 참이다(그때만 매출을 읽는다, stats-revenue AC-4108.4)
  async function readParts(plan: LoadPlan, start: number, closeToday: boolean, savedTo: string): Promise<boolean> {
    const groupDefs = groups.forLoad()
    // 수납일지 Block·물리치료 묶음 정의(누를 때 값, 없으면 null)도 실어 Worker가 날 저장 줄마다 그날 Block 전환을 센다(admin-view REQ-8018). 화면 글은 그대로다
    const sunapAtLoad = sunapDefs
    const stop = (done: number, reason: string) => {
      setRun({ plan, done, savedTo, closeToday, stop: reason })
      return false
    }
    try {
      for (let i = start; i < plan.parts.length; i++) {
        const part = plan.parts[i]!
        if (plan.parts.length > 1) setPartAt({ plan, at: i })
        let view: StatsLoaded
        try {
          // keep은 keepAt 조각만 참이라 메시지에 칸이 없다: 그 조각의 진료 줄이 Worker 메모리에 남아 처방별·세 칸이 그것으로 답한다
          view = await load({ range: part.read, today, closeToday: i === 0 && closeToday, keep: i === plan.keepAt, groups: groupDefs, sunap: sunapAtLoad })
        } catch (error) {
          if (i === 0) throw error
          return stop(i, `(오류 번호 ${errorCodeOf(error)})`)
        }
        // 보고 문장은 오늘에 끝나는 첫 조각의 숫자다. 처방별·세 칸은 keepAt 조각을 읽은 뒤 한 번 묻는다
        if (i === 0) setReport({ numbers: view.report, loadedAt: clockOf(new Date()), closedToday: closeToday })
        if (i === plan.keepAt) setLoads((n) => n + 1)
        if (view.quality !== 'valid' || view.months === null || view.days === null) {
          if (i > 0) return stop(i, incompleteLine({ kind: 'bit', checks: view.checks }))
          setIncomplete({ kind: 'bit', checks: view.checks })
          return false
        }
        // 이 조각이 저장할 달·날·세 칸 합계·덮은 기간만(partSave). 조각이 하나면 Worker 값 그대로다(세 칸 합계 검사·크기는 saveStats, AC-2902.2)
        const saved = await data.save(partSave(view, part))
        setSavedUnread(saved)
        if (!saved) return i === 0 ? false : stop(i, '(오류 번호 E-STATS-SAVE-FAILED)')
      }
      setRun({ plan, done: plan.parts.length, savedTo, closeToday, stop: null })
      return true
    } finally {
      setPartAt(null)
    }
  }

  // 통계 조각을 모두 저장한 뒤 같은 일 안에서 불러올 기간 전체의 매출 빈 날을 읽고 저장한다(stats-revenue AC-4108.2). sync는 거절하지 않고 끝나면 다시 읽는다.
  // 이 불러올 기간·'오늘 진료 끝'은 [매출만 다시 읽기]가 같은 값으로 쓴다
  async function syncRevenue(whole: DateRange, closeToday: boolean) {
    setRevenueRun({ whole, closeToday })
    await syncAndCount({ whole, closeToday })
  }

  // 매출 읽기가 끝나면 이번 달 목표 칸·월간 보고서가 하루 매출을 다시 읽는다(AC-6102.6·AC-6108.5)
  async function syncAndCount(args: { whole: DateRange; closeToday: boolean }) {
    await revenue.sync(args)
    setRevenueSyncs((n) => n + 1)
  }

  const loadFromBit = (closeToday: boolean, span: LoadSpan) => {
    const plan = planLoad(today, range, span)
    void runJob('bit', async () => {
      if (await readParts(plan, 0, closeToday, lastDayOf(today, closeToday))) await syncRevenue(plan.whole, closeToday)
    })
  }

  const resumeLoad = () => {
    if (run === null || run.stop === null) return
    const { plan, done, savedTo, closeToday } = run
    void runJob('bit', async () => {
      if (await readParts(plan, done, closeToday, savedTo)) await syncRevenue(plan.whole, closeToday)
    })
  }

  // [매출만 다시 읽기](AC-4108.5): 통계 조각은 다시 읽지 않고 다른 안내도 지우지 않는다. 그동안 일은 'bit'라 다른 불러오기 단추가 막힌다
  const rereadRevenue = () => {
    if (revenueRun === null) return
    void runJob('bit', () => syncAndCount(revenueRun), { keep: true })
  }

  const takeFiles = (files: File[]) =>
    void runJob('file', async () => {
      const outcome = await readFiles(files, today, await groups.forLoad())
      setFileFailures(outcome.failures)
      if (outcome.incomplete !== null) setIncomplete({ kind: 'file', ...outcome.incomplete })
      if (outcome.save !== null) setSavedUnread(await data.save(outcome.save))
    })

  const retrySave = () =>
    void runJob('save', async () => {
      setSavedUnread(await data.retrySave())
    })

  const { reading, readFailed, input, saved, unsaved, saving } = data
  // 읽기에 성공하면(어느 기간이든) "저장했어요"는 할 일을 다했다. 뒤의 읽기 실패에 돌아오지 않는다(AC-514.11)
  if (savedUnread && !reading && !readFailed) setSavedUnread(false)
  // 읽기에 실패하면 섹션을 그리지 않는다. 다만 화면이 "그대로 있어요"·"방금 불러온 숫자예요"라고 말한 숫자는 그린다(AC-514.6)
  const freshSplit = incomplete?.kind === 'bit'
  const canDraw = !readFailed || unsaved !== null || freshSplit
  const waiting = reading || (canDraw && loads > 0 && answered === null)
  const showSections = canDraw && !waiting
  const drawn = readFailed && unsaved === null && freshSplit ? { days: [], covered: [], range } : input
  // 못 읽은 기간을 "이 기간 자료가 없어요"라고 하지 않는다. 저장하지 못한 숫자에 그 기간이 없을 때는 맞는 말이다
  const drawnSaved = readFailed ? unsaved !== null : saved
  // 불러오기 상자는 저장된 숫자를 한 번 읽어 하나도 없을 때만 펼친 채 시작한다('아직 저장된 통계가 없어요', stats-pc-ux AC-4001.4).
  // 읽는 중을 showSections로 보지 않고 input으로 본다: 처음 읽기 전(input null)은 접힘, 그 뒤 기간을 바꿔 다시 읽는 동안은 앞 답 그대로라 접혔다 펼쳐지지 않는다
  const canFold = readFailed || saved || input === null
  // 읽는 중 줄: 매출을 읽는 동안은 매출 글(AC-4108.3·기본값 12), 나눠 읽는 동안은 조각 글, 아니면 SourcePicker의 지금 글
  const revenueLine = revenue.progress === null ? null : revenueProgressText(revenue.progress.done, revenue.progress.total)
  const partLine = partAt === null ? null : progressText(partAt.plan, partAt.at)
  const revenueFailure = revenue.failure !== null && revenue.failure !== revenueHidden ? revenue.failure : null

  // 통계 바탕(first90 AC-4411.1, design.md 5-5 '화면 바탕'): 맨 바깥 표시 하나만 둔다. 회색은 globals.css의 #main:has(이 표시)가
  // 앱 본문 전체(넓은 화면 양옆까지)에 칠하고 인쇄는 흰 바탕이다. 음수 여백으로 덮지 않고 앱 틀(AppShell)은 고치지 않는다
  return (
    <div data-st-canvas="">
      <h1 className="text-title font-semibold text-ink">통계</h1>
      {/* 다른 의원을 보는 중(admin-view AC-8008.1)이면 불러오기 상자 전체·[이어서 불러오기]·[매출만 다시 읽기]·[다시 저장]이 없다(읽기만) */}
      {/* 끊김 카드는 끊겨 있는 동안만 참이라 [다시 확인]을 누를 때 지운다(AC-514.12) */}
      <WriteOnly>
        <SourcePicker
          state={state}
          helloError={helloError}
          today={today}
          range={range}
          job={job}
          progress={job === 'bit' ? (revenueLine ?? partLine) : null}
          onRetry={() => {
            setActionError((c) => (c === 'E-BRIDGE-DISCONNECTED' ? null : c))
            retry()
          }}
          onLoad={loadFromBit}
          onFiles={takeFiles}
          canFold={canFold}
          summary={showSections && (!readFailed || unsaved !== null) ? <SourceSummary data={data} today={today} notSaved={incomplete !== null} /> : null}
        />
        {/* [이어서 불러오기]는 일이 없고 비트 PC 연결이 'ready'일 때만 누를 수 있다(AC-3303.9·AC-3303.10). 개인정보 줄은 불러오기 상자 펼칠 칸 안이다(AC-4001.1) */}
        {run !== null && run.plan.parts.length > 1 && <LoadRunBox run={run} busy={job !== null || state !== 'ready'} onResume={resumeLoad} />}
        {/* 매출만 실패 상자(stats-revenue AC-4108.5): 나눠 읽기 상자 다음. [매출만 다시 읽기]도 일이 없고 비트 PC 연결이 'ready'일 때만 누를 수 있다 */}
        {revenueFailure !== null && revenueRun !== null && <RevenueFailBox failure={revenueFailure} busy={job !== null || state !== 'ready'} onRetry={rereadRevenue} />}
      </WriteOnly>

      {/* 세 칸 답의 오류는 처방별 답과 번호가 다를 때만 더한다(같은 번호 카드가 둘이지 않게) */}
      {[actionError, answered?.error ?? null, bitAnswered?.error != null && bitAnswered.error !== answered?.error ? bitAnswered.error : null].map(
        (code, i) =>
          code !== null && (
            <div key={i} className="mt-4">
              <ErrorCard code={code} />
            </div>
          ),
      )}
      {fileFailures.map((failure, i) => (
        <div key={i} className="mt-4">
          <p className="mb-1 break-all text-small font-medium text-ink">{failure.name}</p>
          <ErrorCard code={failure.code} />
        </div>
      ))}
      {unsaved !== null && (
        <WriteOnly>
          <ErrorWithAction
            code="E-STATS-SAVE-FAILED"
            note="방금 불러온 숫자는 화면에 그대로 있어요."
            action={
              <button type="button" aria-disabled={job !== null || undefined} className={`${ds.button.secondarySmall} max-md:w-full`} onClick={retrySave}>
                {saving ? '저장하는 중' : '다시 저장'}
              </button>
            }
          />
        </WriteOnly>
      )}
      {readFailed && (
        <ErrorWithAction
          code="E-STATS-READ-FAILED"
          note={savedUnread ? '방금 불러온 숫자는 저장했어요.' : undefined}
          action={
            <button type="button" className={`${ds.button.secondarySmall} max-md:w-full`} onClick={data.reread}>
              다시 읽기
            </button>
          }
        />
      )}
      {/* 저장하지 못한 숫자를 얹어 그리는 동안 아래 그래프는 "전에 저장한 숫자"가 아니다 */}
      {incomplete !== null && <IncompleteCard note={incomplete} latest={unsaved === null ? data.latest : null} />}
      {showSections && !readFailed && !saved && (
        <div className="mt-6">
          <p className="text-title font-semibold text-ink">아직 저장된 통계가 없어요</p>
          <p className="mt-1 max-w-160 text-body text-ink-2">비트 PC에서 [비트에서 불러오기]를 누르거나, 비트에서 내보낸 파일을 넣으면 숫자가 채워져요. 한 번 저장하면 휴대폰에서도 볼 수 있어요.</p>
        </div>
      )}

      <div className="mt-6 border-t border-line-strong pt-4">
        <div className="flex flex-wrap items-end gap-x-8 gap-y-4 max-md:flex-col max-md:items-stretch">
          {/* 이름은 단추 위 한 줄(넓은 화면은 줄을 다 쓰고 단추가 다음 줄), 휴대폰은 둘이 세로로 쌓여 전체 폭이다 */}
          <div className="flex flex-wrap max-md:flex-col max-md:items-stretch">
            <p className="mb-1.5 w-full text-caption text-muted">
              {QUICK_CAPTION}
            </p>
            <div role="group" aria-label="기간" className={PERIOD_GROUP}>
              {PERIODS.map((item) => (
                <button key={item} type="button" aria-pressed={item === choice} onClick={() => setChoice(item)} className={`${PERIOD_BUTTON} ${item === choice ? PERIOD_ON : PERIOD_OFF}`}>
                  {PERIOD_NAME[item]}
                </button>
              ))}
            </div>
          </div>
          <PeriodPicker choice={choice} lastDay={lastDay} todayDone={todayDone} onChoose={setChoice} />
        </div>
        <RangeText range={range} choice={choice} todayDone={todayDone} />
      </div>

      {/* 바로가기 띠(first90 AC-4411.2·stats-pc-ux AC-4002.1): 칸을 그릴 때만, 기간 줄 바로 다음. 이 바깥 div의 바로 아래 자식이어야 끝까지 붙는다(작은 div 안이면 그 div가 끝날 때 떨어진다) */}
      {showSections && <StatsToc />}
      {waiting && <StatsWaiting range={range} lastDay={lastDay} />}
      {/* 읽는 동안에도 내려놓지 않는다: 기간을 바꿔도 열어 둔 [자세히]·처방 줄이 열린 채 새 숫자로 그려진다(시안 §5) */}
      {drawn !== null && (
        <div hidden={!showSections}>
          <StatsSections
            input={drawn}
            saved={drawnSaved}
            split={answered?.view ?? null}
            report={report}
            hospitalName={hospitalName}
            groups={groups}
            revision={data.revision}
            bit={bit}
            revenue={{
              state: revenue.state,
              days: revenue.days,
              codes: revenue.codes,
              monthCodes: revenue.monthCodes,
              noDayCodes: revenue.noDayCodes,
              lastDay,
              onReread: revenue.reread,
            }}
            sunap={{ closed: sunap.closed, groups: sunap.groups, onReread: sunap.reread }}
            calendar={calendar}
            wide={wide}
            goals={goals}
            salesRevision={salesRevision}
          />
        </div>
      )}
    </div>
  )
}
