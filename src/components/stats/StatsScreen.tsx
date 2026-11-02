'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import { addDays, compareYmd, todayInKorea } from '@/lib/analytics/dates'
import type { DateRange } from '@/types/dates'
import type { ErrorCode } from '@/types/errors'
import type { RxSplitView, StatsChecks } from '@/types/stats'
import { dayNumber, longDate, monthNumber, PERIOD_NAME, Section } from './sections/parts'
import type { ReportData } from './sections/ReportSection'
import { StatsSections } from './sections/StatsSections'
import { readFiles, SourcePicker, type FileFailure, type FileIncomplete, type StatsJob } from './SourcePicker'
import { useStatsData, type SavedLatest, type StatsData } from './useStatsData'
import { errorCodeOf, useStatsWorker } from './useStatsWorker'
import { COMPARE_NAME, DEFAULT_STATS_PERIOD, statsRange, type StatsPeriod, type StatsRange } from './view'

// 통계 화면 (stats REQ-514, 시안 docs/mockups/stats/notes.md §2·§3). 숫자·처방 이름·보고 글은 React 상태와 Worker 메모리에만 둔다(AC-514.9).
// 처방별 신환·재진과 보고 문장은 이 화면에서 비트로 불러온 뒤에만 있다(서버에 저장하지 않는다)

const PERIODS: StatsPeriod[] = ['7d', '30d', '90d', '12m']
const SOURCE_NAME = { bit: '비트 PC', file: '파일' } as const
const FILE_NOTE = '파일 자료는 처방이 없는 접수와 같은 날 다시 접수한 건이 빠져 비트 PC 숫자보다 적을 수 있어요.' // 사용자가 승인한 문장(AC-514.7). 시안에 없다
const NOT_SAVED = '일부 기록을 확인하지 못해 저장하지 않았어요'

// 기간 단추 모양은 대시보드 기간 단추와 같다(시안 .seg). 휴대폰은 넷이 같은 폭 44px
const PERIOD_GROUP = 'inline-flex shrink-0 overflow-clip rounded-control border border-line-strong bg-surface max-md:grid max-md:w-full max-md:grid-cols-4'
const PERIOD_BUTTON =
  'h-7.5 cursor-pointer border-l border-line-strong px-3 text-small first:border-l-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent max-md:h-11 max-md:px-1'
const PERIOD_ON = 'bg-accent-soft font-semibold text-accent-strong'
const PERIOD_OFF = 'font-medium text-ink-2 transition hover:bg-canvas'

// 기다리는 칸은 StatsSections와 같은 자리다
const SIDE = 'lg:border-l lg:border-line lg:pl-6'
const WAITING: { title: string; place: string }[] = [
  { title: '기간 요약', place: 'col-span-12' },
  { title: '환자 수 추이', place: 'col-span-12 lg:col-span-8' },
  { title: '신환 재방문율', place: `col-span-12 lg:col-span-4 ${SIDE}` },
  { title: '처방 추세', place: 'col-span-12 lg:col-span-7' },
  { title: '처방별 신환·재진', place: `col-span-12 lg:col-span-5 ${SIDE}` },
  { title: '원장님 보고 문장', place: 'col-span-12 lg:col-span-7' },
  { title: '요일별 환자 수', place: `col-span-12 lg:col-span-5 ${SIDE}` },
]

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
  return `${items.join(' · ')}이 있어요. 비트에서 이 기록을 고친 뒤 파일을 다시 넣어 주세요.`
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

function RangeText({ range }: { range: StatsRange }) {
  const today = range.load.to
  const note = range.grain === 'month' ? `${monthNumber(today)}월은 ${dayNumber(today)}일까지` : '어제까지'
  return (
    <div className="flex flex-wrap gap-x-3 text-small text-muted">
      <span>
        <span className="font-semibold text-ink">{range.label}</span> ({note})
      </span>
      <span>
        비교: {range.previous.label} ({COMPARE_NAME[range.period]})
      </span>
    </div>
  )
}

function coverClause(to: string | undefined, today: string): string {
  if (to === undefined) return ''
  if (to === today) return ` · 오늘(${longDate(to)})까지 끝난 날로 저장했어요`
  if (to === addDays(today, -1)) return ` · 어제(${longDate(to)})까지 끝난 날로 저장했어요`
  return ` · ${longDate(to)}까지 끝난 날로 저장했어요`
}

// 출처 줄 글: 앞은 ink-2, 뒤는 muted. latest가 null이면(시각을 못 읽는 브라우저) 출처 줄만 없다
function sourceLine(data: StatsData, today: string, notSaved: boolean): { main: string; rest: string } | null {
  const { unsaved, saved, latest, input, justSaved } = data
  if (unsaved !== null) return { main: `자료: ${SOURCE_NAME[unsaved]} · 방금 불러옴`, rest: ' · 아직 저장하지 못했어요' }
  if (!saved) return { main: '자료: ', rest: '아직 저장된 숫자가 없어요' }
  if (latest === null) return null
  const main = `자료: ${SOURCE_NAME[latest.source]} · ${stampOf(latest.at)} 저장`
  if (notSaved) return { main, rest: ' · 방금 불러온 숫자는 저장하지 않았어요' }
  return { main: justSaved ? `${main} · 방금` : main, rest: coverClause(input?.covered.at(-1)?.to, today) }
}

function SourceLine({ data, today, notSaved }: { data: StatsData; today: string; notSaved: boolean }) {
  const line = sourceLine(data, today, notSaved)
  if (line === null && !data.fromFile) return null
  return (
    <div className="mt-2 flex flex-wrap gap-x-2 text-small text-ink-2">
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

function WaitingSections() {
  return (
    <div className="grid grid-cols-12 gap-x-6">
      {WAITING.map(({ title, place }) => (
        <Section key={title} title={title} className={place}>
          <p className="mt-3 flex items-center gap-1.5 text-body text-muted">
            <Icon name="clock" size={14} className="shrink-0" />
            불러오는 중
          </p>
        </Section>
      ))}
    </div>
  )
}

export function StatsScreen({ hospitalName, today }: { hospitalName: string; today: string }) {
  const [period, setPeriod] = useState<StatsPeriod>(DEFAULT_STATS_PERIOD)
  const range = useMemo(() => statsRange(today, period), [today, period])
  const data = useStatsData(period, today)
  const { state, helloError, retry, load, split } = useStatsWorker()

  const [job, setJob] = useState<StatsJob | null>(null)
  const [actionError, setActionError] = useState<ErrorCode | null>(null)
  const [fileFailures, setFileFailures] = useState<FileFailure[]>([])
  const [incomplete, setIncomplete] = useState<Incomplete | null>(null)
  const [report, setReport] = useState<ReportData | null>(null)
  const [splitAnswer, setSplitAnswer] = useState<SplitAnswer | null>(null)
  const [loads, setLoads] = useState(0) // 비트에서 불러온 횟수. 0이면 Worker 메모리에 진료 줄이 없다
  const working = useRef(false)

  const { from: splitFrom, to: splitTo } = splitSpan(range)
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
  // 불러오기·파일은 앞 일의 안내를 지우고 시작한다. [다시 저장]은 하던 저장을 잇는 것이라 안내를 그대로 둔다
  async function runJob(kind: StatsJob, work: () => Promise<unknown>) {
    if (working.current) return
    working.current = true
    setJob(kind)
    if (kind !== 'save') {
      setActionError(null)
      setFileFailures([])
      setIncomplete(null)
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

  const loadFromBit = (closeToday: boolean) =>
    void runJob('bit', async () => {
      const view = await load({ range: range.load, today, closeToday })
      setReport({ numbers: view.report, loadedAt: clockOf(new Date()), closedToday: closeToday })
      setLoads((n) => n + 1)
      if (view.quality !== 'valid' || view.months === null || view.days === null) {
        setIncomplete({ kind: 'bit', checks: view.checks })
        return
      }
      await data.save({ months: view.months, days: view.days, covered: view.covered, source: 'bit' })
    })

  const takeFiles = (files: File[]) =>
    void runJob('file', async () => {
      const outcome = await readFiles(files, today)
      setFileFailures(outcome.failures)
      if (outcome.incomplete !== null) setIncomplete({ kind: 'file', ...outcome.incomplete })
      if (outcome.save !== null) await data.save(outcome.save)
    })

  const retrySave = () => void runJob('save', data.retrySave)

  const { reading, readFailed, input, saved, unsaved, saving } = data
  // 읽기에 실패하면 섹션을 그리지 않는다. 다만 화면이 "그대로 있어요"·"방금 불러온 숫자예요"라고 말한 숫자는 그린다(AC-514.6)
  const freshSplit = incomplete?.kind === 'bit'
  const canDraw = !readFailed || unsaved !== null || freshSplit
  const waiting = reading || (canDraw && loads > 0 && answered === null)
  const showSections = canDraw && !waiting
  const drawn = readFailed && unsaved === null && freshSplit ? { days: [], covered: [], range } : input
  // 못 읽은 기간을 "이 기간 자료가 없어요"라고 하지 않는다. 저장하지 못한 숫자에 그 기간이 없을 때는 맞는 말이다
  const drawnSaved = readFailed ? unsaved !== null : saved

  return (
    <div>
      <h1 className="text-title font-semibold text-ink">통계</h1>
      <SourcePicker state={state} helloError={helloError} today={today} job={job} onRetry={retry} onLoad={loadFromBit} onFiles={takeFiles} />
      <p className="mt-3 flex max-w-160 items-start gap-1.5 text-small text-muted">
        <Icon name="shield" size={14} className="mt-0.5 shrink-0 text-positive" />
        <span>환자 개인정보는 의원 PC 밖으로 나가지 않아요. 서버에는 숫자만 저장해요.</span>
      </p>

      {[actionError, answered?.error ?? null].map(
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
        <ErrorWithAction
          code="E-STATS-SAVE-FAILED"
          note="방금 불러온 숫자는 화면에 그대로 있어요."
          action={
            <button type="button" aria-disabled={job !== null || undefined} className={`${ds.button.secondarySmall} max-md:w-full`} onClick={retrySave}>
              {saving ? '저장하는 중' : '다시 저장'}
            </button>
          }
        />
      )}
      {readFailed && (
        <ErrorWithAction
          code="E-STATS-READ-FAILED"
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

      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line-strong pt-4 max-md:flex-col max-md:items-stretch">
        <div role="group" aria-label="기간" className={PERIOD_GROUP}>
          {PERIODS.map((item) => (
            <button key={item} type="button" aria-pressed={item === period} onClick={() => setPeriod(item)} className={`${PERIOD_BUTTON} ${item === period ? PERIOD_ON : PERIOD_OFF}`}>
              {PERIOD_NAME[item]}
            </button>
          ))}
        </div>
        <RangeText range={range} />
      </div>
      {showSections && (!readFailed || unsaved !== null) && <SourceLine data={data} today={today} notSaved={incomplete !== null} />}

      {waiting && <WaitingSections />}
      {/* 읽는 동안에도 내려놓지 않는다: 기간을 바꿔도 열어 둔 [자세히]·처방 줄이 열린 채 새 숫자로 그려진다(시안 §5) */}
      {drawn !== null && (
        <div hidden={!showSections}>
          <StatsSections input={drawn} saved={drawnSaved} split={answered?.view ?? null} report={report} hospitalName={hospitalName} />
        </div>
      )}
    </div>
  )
}
