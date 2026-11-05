'use client'

import { useId, useMemo, useState, type ReactNode } from 'react'
import { formatCount, percentOf } from '@/components/charts/format'
import { ErrorCard } from '@/components/common/ErrorCard'
import { Icon } from '@/components/common/Icon'
import { againAverageText, againBaseText, againRateText, againView, isFewStarts, type AgainDayKind, type AgainRow } from '@/components/stats/againView'
import type { RxLine, StatsInput } from '@/components/stats/view'
import { ds } from '@/components/ui/classes'
import { AGAIN_WINDOWS, type AgainWindow } from '@/types/payload'
import { EmptyNote, longDate, NO_RANGE_DATA, PERIOD_NAME, todayOf } from './parts'

// 같은 처방 재방문 묶음 (fu-rate REQ-1307, 시안 docs/mockups/fu-rate/index.html의 .again). props만 받는다: 고른 날 수는 부모의 React 상태,
// 넓은 날 줄 읽기는 부모의 useAgainDays가 하고(daysState) 이 파일은 저장 코드를 부르지 않는다. 숫자는 againView가 낸 값이다.
// 시안과 다른 곳은 specs/fu-rate/design.md '시안과 다른 곳'(1024px에서 쌓임, 빗금은 svg path, 8일째 글자 muted, 글 폭 max-w-160, 예시 칸 role="img")

export type AgainDaysState = 'ready' | 'reading' | 'failed'

const TITLE = '같은 처방 재방문'
const DESC = '고른 처방을 시작한 환자가 같은 처방을 다시 받으러 왔는지 봐요'
const EMPTY = '처방을 고르면 7일·14일·30일 안에 같은 처방을 다시 받은 환자가 여기 보여요.'
const READING = '같은 처방 재방문 숫자를 더 읽는 중이에요'
const BEFORE_AGAIN = '이 기간 숫자는 같은 처방 재방문을 세기 전에 저장했어요. 비트에서 다시 불러오거나 파일을 다시 넣으면 보여요.'
const FEW = '10명 미만'
const HOW = (win: AgainWindow) => `기간 안에 그 처방을 새로 시작한 환자를 모아, 다음 날부터 ${win}일 안에 같은 처방을 또 받았는지 봐요. 새로 시작한 날은 앞 30일 동안 그 처방을 받지 않은 날이에요.`

// 한 환자 예시(늘 7일). 받은 칸 = 시작·3일째·6일째·8일째, 8일째는 7일이 지난 뒤다
const EXAMPLE_DAYS = ['시작', '1일째', '2일째', '3일째', '4일째', '5일째', '6일째', '7일째', '8일째']
const EXAMPLE_GOT = new Set([0, 3, 6, 8])
const EXAMPLE_LATE = 8
const EXAMPLE_TEXT =
  'ESWT7을 시작하고 3일째와 6일째에 또 받았어요. 7일 안에 2번 더 받았으니 다시 받은 환자 1명, 더 받은 횟수 2번으로 들어가요. 8일째에 받은 것은 7일이 지난 뒤라 7일 안에는 넣지 않아요.'

// 표 아래 안내(차례대로). few는 10명 미만 줄이 하나라도 있을 때만
const NOTES = (win: AgainWindow, few: boolean): [string, string][] => [
  ['아직 셀 수 없는 날', `시작하고 ${win}일이 다 지나야 셀 수 있어요. 날이 지나고 새 자료를 넣으면 채워져요.`],
  ['파일을 따로 넣을 때', '앞 파일 끝 무렵에 시작한 환자가 뒤 파일에서 다시 받은 것은 이어서 세지 못해요. 두 파일을 한 번에 같이 넣으면 이어서 세요. 비트 PC에서 불러오면 불러온 기간 안에서 이어서 세요.'],
  ['자료 첫 30일', '그 전 기록이 없어서, 전부터 받던 환자도 새로 시작한 것처럼 잡힐 수 있어요.'],
  ...(few ? [[FEW, '시작한 환자가 적으면 한두 명에 비율이 크게 바뀌어요. 참고만 해 주세요.'] satisfies [string, string]] : []),
  ['신환 재방문율과 달라요', '위쪽 신환 재방문율은 처음 온 환자가 아무 진료로나 다시 온 비율이에요. 이 칸은 신환·재진 모두, 고른 처방을 다시 받았는지만 봐요.'],
  ['환자 번호', '의원 PC 밖으로 나가지 않아요. 자료를 넣을 때 그 PC 안에서 세고, 날마다 몇 명인지만 저장해요.'],
]

// 빗금: 45° 선을 4px 간격으로 M0 k L k 0. 띠 조각은 띠 전체 폭일 수 있어 닿는 길이 1200(RxPickTable의 BAND_HATCH와 같은 방식)
const HATCH_GAP = 4
const HATCH_REACH = 1200
const HATCH = Array.from({ length: HATCH_REACH / HATCH_GAP }, (_, i) => HATCH_GAP * (i + 1))
  .map((k) => `M0 ${k} L${k} 0`)
  .join(' ')

// 날 수 단추: 모양은 기간 단추와 같다(StatsScreen PERIOD_*). 휴대폰은 셋이 같은 폭으로 전체 폭 44px
const WIN_GROUP = 'inline-flex shrink-0 overflow-clip rounded-control border border-line-strong bg-surface max-md:grid max-md:w-full max-md:grid-cols-3'
const WIN_BUTTON =
  'h-7.5 cursor-pointer border-l border-line-strong px-3 text-small first:border-l-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent max-md:h-11 max-md:px-1'
const WIN_ON = 'bg-accent-soft font-semibold text-accent-strong'
const WIN_OFF = 'font-medium text-ink-2 transition hover:bg-canvas'

// 머리·줄이 같이 쓰는 칸. 넓으면 다섯 칸, 좁으면(1024px 미만) 두 칸에 네 줄: ① 이름 ② 비율 · 평균 ③ 막대 ④ 시작한 환자 중 · 기다림
const COLUMNS =
  'grid w-full items-center gap-x-4 lg:grid-cols-[minmax(150px,1fr)_minmax(200px,1.5fr)_136px_132px_112px] max-lg:grid-cols-[minmax(0,1fr)_auto] max-lg:gap-x-2 max-lg:gap-y-1.5'
const NAME_CELL = 'flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 wrap-anywhere max-lg:col-span-2'
// 좁으면 큰 비율과 평균이 같은 글자 줄(baseline)에 선다
const RATE_CELL = 'flex items-center gap-3 max-lg:col-start-1 max-lg:row-start-2 max-lg:items-baseline max-lg:gap-1.5 max-lg:self-baseline'
const RATE_VALUE = 'min-w-15 whitespace-nowrap text-right text-lead font-semibold tabular-nums max-lg:min-w-0 max-lg:text-left max-lg:text-heading-m'
const BAR_CELL = 'lg:hidden max-lg:col-span-2 max-lg:row-start-3'
const OF_CELL = 'whitespace-nowrap text-right text-small text-ink-2 tabular-nums max-lg:col-start-1 max-lg:row-start-4 max-lg:text-left'
const AVG_CELL = 'whitespace-nowrap text-right text-body font-semibold tabular-nums max-lg:col-start-2 max-lg:row-start-2 max-lg:self-baseline max-lg:text-lead'
const WAIT_CELL = 'whitespace-nowrap text-right text-small text-muted tabular-nums max-lg:col-start-2 max-lg:row-start-4'
const CODE = 'whitespace-nowrap text-caption text-muted'

const RUN: Record<AgainDayKind, string> = {
  ok: 'min-w-0.5 bg-accent',
  no: 'relative min-w-0.5 border border-warning bg-warning-soft text-warning',
  out: 'min-w-0.5 bg-line',
}

const Hatch = () => (
  <svg aria-hidden="true" className="absolute inset-0 size-full">
    <path d={HATCH} fill="none" stroke="currentColor" strokeWidth="1" />
  </svg>
)

// '{월}월 {일}일', 오늘과 해가 다르면 앞에 '{해}년 '(againBaseText와 같은 글자)
const dateText = (ymd: string, today: string) => (ymd.slice(0, 4) === today.slice(0, 4) ? longDate(ymd) : `${Number(ymd.slice(0, 4))}년 ${longDate(ymd)}`)

// 6px 막대: 꾸밈이다. 값은 같은 줄의 비율 글자가 준다. 폭 = 보이는 비율, 10명 미만은 파란 빗금, 다시 받은 환자가 없으면 빈 막대
function Meter({ row, className }: { row: AgainRow; className: string }) {
  const width = row.starts > 0 && row.back > 0 ? againRateText(row) : null
  return (
    <span aria-hidden="true" className={`block h-1.5 min-w-0 overflow-clip bg-line ${className}`}>
      {width !== null &&
        (isFewStarts(row) ? (
          <span className="relative block h-full border border-accent bg-accent-soft text-accent" style={{ width }}>
            <Hatch />
          </span>
        ) : (
          <span className="block h-full bg-accent" style={{ width }} />
        ))}
    </span>
  )
}

function AgainLine({ row, win }: { row: AgainRow; win: AgainWindow }) {
  const few = isFewStarts(row)
  const zero = row.starts <= 0
  const tone = few || zero ? 'text-muted' : 'text-ink'
  const codeOnly = row.name.trim() === '' || row.name === row.code
  return (
    <li className={`${COLUMNS} border-b border-line py-3 text-body text-ink`}>
      <span className={NAME_CELL}>
        {codeOnly ? (
          <span className="font-semibold">{row.code}</span>
        ) : (
          <>
            <span className="font-semibold">{row.name}</span>
            <span className={CODE}>{row.code}</span>
          </>
        )}
        {few && <span className={ds.chip.neutral}>{FEW}</span>}
      </span>
      <span className={RATE_CELL}>
        <span className="sr-only">{`${win}일 안 재방문율 `}</span>
        <span className={`${RATE_VALUE} ${tone}`}>{againRateText(row)}</span>
        <span className="text-small text-muted lg:hidden">다시 받음</span>
        <Meter row={row} className="flex-auto max-lg:hidden" />
      </span>
      <span className={BAR_CELL}>
        <Meter row={row} className="w-full" />
      </span>
      <span className={OF_CELL}>
        {zero ? (
          '시작한 환자 0명'
        ) : (
          <>
            <span className="sr-only">시작한 환자 </span>
            {`${formatCount(row.starts)}명 중 ${formatCount(row.back)}명`}
          </>
        )}
      </span>
      <span className={`${AVG_CELL} ${tone}`}>{againAverageText(row)}</span>
      <span className={WAIT_CELL}>
        <span className="lg:sr-only">아직 셀 수 없음 </span>
        {`${formatCount(row.wait)}명`}
      </span>
    </li>
  )
}

function Example({ open, onOpen }: { open: boolean; onOpen: (open: boolean) => void }) {
  return (
    <details open={open} onToggle={(event) => onOpen(event.currentTarget.open)} className="mt-2 max-w-140">
      <summary
        className={`inline-flex min-h-8 cursor-pointer list-none items-center rounded-control text-small font-medium text-accent-strong ${ds.focusRing} max-md:min-h-11 [&::-webkit-details-marker]:hidden`}
      >
        한 환자로 예를 들면 (7일 안)
      </summary>
      <ol aria-label="한 환자의 9일" className="mt-1 grid list-none grid-cols-9">
        {EXAMPLE_DAYS.map((label, i) => {
          const got = EXAMPLE_GOT.has(i)
          const late = i === EXAMPLE_LATE
          const mark = got ? (late ? 'border-dashed border-muted bg-surface' : 'border-accent bg-accent') : 'border-line-strong'
          return (
            <li key={label} className="grid justify-items-center gap-1 border-l border-line py-1.5 text-caption text-muted first:border-l-0">
              <span className={i === 0 ? 'font-semibold text-ink' : ''}>{label}</span>
              <span role="img" aria-label={got ? 'ESWT7 받음' : '안 옴'} className={`block size-3 border ${mark}`} />
            </li>
          )
        })}
      </ol>
      <div aria-hidden="true" className="grid grid-cols-9">
        <span className="col-[2/9] border-t-2 border-accent pt-0.5 text-center text-caption font-medium text-accent-strong">지켜보는 7일</span>
      </div>
      <p className="mt-2 text-small text-ink-2">{EXAMPLE_TEXT}</p>
    </details>
  )
}

function LegendMark({ kind }: { kind: AgainDayKind }) {
  if (kind === 'no') {
    return (
      <svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10" className="shrink-0 bg-warning-soft text-warning">
        <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" />
        <path d="M0 6 L6 0 M0 10 L10 0 M4 10 L10 4" fill="none" stroke="currentColor" strokeWidth="1" />
      </svg>
    )
  }
  return <span aria-hidden="true" className={`size-2.5 shrink-0 ${kind === 'ok' ? 'bg-accent' : 'bg-line'}`} />
}

const Named = ({ name, tone, children }: { name: string; tone: string; children: ReactNode }) => (
  <>
    <span className={`mr-1.5 font-semibold ${tone}`}>{name}</span>
    {children}
  </>
)

export function RxPickAgain({
  picks,
  input,
  win,
  onWin,
  daysState,
  onRetryDays,
}: {
  picks: readonly RxLine[]
  input: StatsInput
  win: AgainWindow
  onWin: (win: AgainWindow) => void
  daysState: AgainDaysState
  onRetryDays: () => void
}) {
  const titleId = useId()
  const labelId = useId()
  // 예시 열림은 이 화면에 있는 동안만 기억한다(처음 열림, 닫으면 닫힌 채)
  const [exampleOpen, setExampleOpen] = useState(true)
  const view = useMemo(() => againView(input, win, picks), [input, win, picks])
  const { range } = input
  const today = todayOf(range)

  const head = (
    <div className="flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1">
      <h3 id={titleId} className="text-subtitle font-semibold text-ink">
        {TITLE}
      </h3>
      <span className="text-small text-muted">{DESC}</span>
    </div>
  )

  if (picks.length === 0) {
    return (
      <section aria-labelledby={titleId} className="mt-8 border-t border-line-strong pt-6">
        {head}
        <p className="mt-3 border-t border-line py-3 text-small text-ink-2">{EMPTY}</p>
      </section>
    )
  }

  const body = () => {
    if (daysState === 'reading') {
      return (
        <p role="status" className="mt-4 flex items-center gap-1.5 text-body text-muted">
          <Icon name="clock" size={14} className="shrink-0" />
          {READING}
        </p>
      )
    }
    if (daysState === 'failed') {
      return (
        <div className="mt-4">
          <ErrorCard code="E-STATS-READ-FAILED" />
          <div className="mt-2">
            <button type="button" onClick={onRetryDays} className={`${ds.button.secondarySmall} max-md:w-full`}>
              다시 읽기
            </button>
          </div>
        </div>
      )
    }
    if (!view.hasRows) return <EmptyNote>{NO_RANGE_DATA}</EmptyNote>
    if (!view.hasAgain) return <EmptyNote>{BEFORE_AGAIN}</EmptyNote>

    const base = againBaseText(view, range, PERIOD_NAME[range.period])
    const { strip } = view
    const stripDays = strip.ok + strip.no + strip.out
    const legend: { kind: AgainDayKind; label: string }[] = [
      { kind: 'ok', label: `센 날 ${strip.ok}일` },
      { kind: 'no', label: `아직 셀 수 없는 날 ${strip.no}일` },
      ...(strip.out > 0 ? [{ kind: 'out' as const, label: `기간 밖 ${strip.out}일` }] : []),
    ]
    const anyFew = view.rows.some(isFewStarts)
    return (
      <>
        <p className="mt-4 max-w-160 text-small text-ink-2">
          {base.lead}
          <span className="font-semibold text-ink">{base.strong}</span>
          {base.tail}
        </p>
        <div aria-hidden="true" className="mt-2 flex h-3 gap-px">
          {strip.runs.map((run, i) => (
            <span key={i} className={RUN[run.kind]} style={{ width: `${percentOf(run.days, stripDays)}%` }}>
              {run.kind === 'no' && <Hatch />}
            </span>
          ))}
        </div>
        <div aria-hidden="true" className="mt-1 flex justify-between gap-2 text-caption text-muted">
          <span>{dateText(strip.from, today)}</span>
          <span>{dateText(strip.to, today)}</span>
        </div>
        <ul className="mt-1.5 flex list-none flex-wrap gap-x-4 gap-y-0.5 text-caption text-ink-2">
          {legend.map((item) => (
            <li key={item.kind} className="inline-flex items-center gap-1 whitespace-nowrap">
              <LegendMark kind={item.kind} />
              {item.label}
            </li>
          ))}
        </ul>
        <div aria-hidden="true" className={`${COLUMNS} mt-4 h-9 border-b border-line text-small font-medium text-muted max-lg:hidden`}>
          <span>처방</span>
          <span>{`${win}일 안 재방문율`}</span>
          <span className="text-right">시작한 환자 중</span>
          <span className="text-right">더 받은 횟수</span>
          <span className="text-right">아직 셀 수 없음</span>
        </div>
        <ul className="list-none">
          {view.rows.map((row) => (
            <AgainLine key={row.code} row={row} win={win} />
          ))}
        </ul>
        <div className="mt-3 grid max-w-160 gap-1 text-small text-muted">
          {NOTES(win, anyFew).map(([name, text]) => (
            <p key={name}>
              <Named name={name} tone="text-ink-2">
                {text}
              </Named>
            </p>
          ))}
        </div>
      </>
    )
  }

  return (
    <section aria-labelledby={titleId} className="mt-8 border-t border-line-strong pt-6">
      {head}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span id={labelId} className="text-small font-semibold text-ink">
          시작하고
        </span>
        <div role="group" aria-labelledby={labelId} className={WIN_GROUP}>
          {AGAIN_WINDOWS.map((item) => (
            <button key={item} type="button" aria-pressed={item === win} onClick={() => onWin(item)} className={`${WIN_BUTTON} ${item === win ? WIN_ON : WIN_OFF}`}>
              {`${item}일 안`}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-3 max-w-160 text-small text-ink-2">
        <Named name="어떻게 세나요" tone="text-ink">
          {HOW(win)}
        </Named>
      </p>
      <Example open={exampleOpen} onOpen={setExampleOpen} />
      {body()}
    </section>
  )
}
