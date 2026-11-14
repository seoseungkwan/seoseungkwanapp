'use client'

import { useId, useMemo, useState } from 'react'
import { formatCount, percentOf } from '@/components/charts/format'
import { onceView, type OnceRow, type OnceTotal } from '@/components/stats/onceView'
import { codeKey, type RxLine, type StatsInput } from '@/components/stats/view'
import { EmptyNote, hasRows, NO_RANGE_DATA, todayOf } from './parts'

// 신환이 그 처방을 받은 횟수 묶음 (first90 REQ-4410, design.md 5-8, 시안 docs/mockups/first90 .s-once). 처방 골라 보기의 '같은 처방 재방문' 아래에 놓는다.
// 고른 처방 하나를 단추 묶음(aria-pressed)에서 고르고(React 상태, 처음 첫째), 보는 기간의 달마다 100% 가로 막대 두 갈래(현재까지 1회 · 2회 이상)를 그린다.
// 숫자는 onceView가 낸 값이다. 막대 갈래 폭(flex-basis)은 기간을 바꾸면 움직인다(st-move-period, AC-4417.2). 집계 중 달은 꼬리표 + 옅은 바탕·진한 숫자 막대다

const TITLE = '신환이 그 처방을 받은 횟수'
const DESC = '첫 내원일에 이 처방을 받은 신환이, 그 날을 비트에서 불러온 때까지 이 처방을 몇 날 받았는지 달마다 봐요'
const FOOT = '집계 중 = 이번 달과 지난달. 1회는 각 날을 불러온 때까지 받은 처방으로 세요. 그 뒤에 다시 받으러 온 신환은 그 날을 다시 불러와야 2회 이상으로 옮겨져서, 오래된 달도 다시 불러오면 바뀔 수 있어요. 막대 안 숫자는 실제 인원이에요.'
const MISSING = "이 기간 일부 날은 1회 신환을 끝까지 세지 못해 비웠어요. 1회를 세기 전에 저장했거나, 2년보다 긴 기간을 나눠 불러온 옛 날이에요. 최근 2년 안의 날은 [비트에서 불러오기]에서 '최근 2년'으로 다시 불러오면 보여요."
const NO_VALUE = '–'
// 두 갈래 색(design.md 5-8): 현재까지 1회 = accent, 2회 이상 = st-ink(짙은 남색). 둘 다 막대 안 흰 숫자와 대비 4.5:1 이상(AC-4410.2)
// 집계 중 달은 옅은 바탕 + 진한 남색 숫자(AC-4410.3): 1회 st-h2, 2회 이상 st-line-2. 막대 전체를 투명하게 하지 않아 숫자가 흐려지지 않는다
const ONCE_TONE = 'bg-accent'
const MORE_TONE = 'bg-st-ink'
const ONCE_PART = `${ONCE_TONE} text-surface`
const MORE_PART = `${MORE_TONE} text-surface`
const ONCE_SOFT = 'bg-st-h2 text-st-ink'
const MORE_SOFT = 'bg-st-line-2 text-st-ink'

// 카드 안 작은 칸(위 얇은 선, 제목 15px)
const BLOCK = 'mt-6 border-t border-st-line pt-5'
const HEADING = 'text-st-15 leading-6 font-semibold text-st-ink'
// 처방 단추: 고른 처방 수만큼이라 줄을 넘기면 다음 줄로 간다. 휴대폰 44px
const PICK_BUTTON = 'inline-flex h-8 cursor-pointer items-center rounded-control border px-3 text-small focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent max-md:h-11'
const PICK_ON = 'border-accent bg-accent-soft font-semibold text-accent-strong'
const PICK_OFF = 'border-line-strong bg-surface font-medium text-ink-2 transition hover:bg-canvas'
// 달 줄: 넓으면 달 이름 · 막대 · 끝 글 한 줄, 휴대폰은 달 이름 + 끝 글 / 막대
const ROW = 'grid grid-cols-[150px_minmax(0,1fr)_150px] items-center gap-x-4 py-2 max-md:grid-cols-[minmax(0,1fr)_auto] max-md:gap-x-2 max-md:gap-y-1'
const MONTH = 'text-small text-st-ink-2 max-md:col-start-1 max-md:row-start-1'
const TAG = 'ml-1.5 rounded-full bg-st-line px-1.5 py-px text-caption font-semibold text-st-ink-2'
const BAR = 'flex h-6 overflow-clip rounded-st-sm max-md:col-[1/3] max-md:row-start-2'
const PART = 'st-move-period flex min-w-0 items-center justify-center text-caption font-semibold whitespace-nowrap'
const END = 'text-right text-small text-st-ink-2 tabular-nums max-md:col-start-2 max-md:row-start-1'
const NOTE = 'mt-2 text-small text-st-muted'

const rateText = (rate: number | null) => (rate === null ? NO_VALUE : `${rate.toFixed(1)}%`)

// 줄 끝 글: 신환 0이면 '신환 0명', 1회를 모르면 '1회 –'
function endText(row: OnceTotal): string {
  if (row.newPatients === 0) return '신환 0명'
  return `신환 ${formatCount(row.newPatients)}명 · 1회 ${row.once === null ? NO_VALUE : rateText(row.rate)}`
}

function totalText(total: OnceTotal): string {
  if (total.newPatients === 0) return '합계 · 신환 0명'
  if (total.once === null || total.more === null) return `합계 · 신환 ${formatCount(total.newPatients)}명 · 1회 ${NO_VALUE}`
  return `합계 · 신환 ${formatCount(total.newPatients)}명 중 1회 ${formatCount(total.once)}명(${rateText(total.rate)}) · 2회 이상 ${formatCount(total.more)}명`
}

// 100% 가로 막대. 신환이 0이거나 1회를 모르면 막대가 없다. 0명인 갈래는 그리지 않는다
function OnceBar({ row }: { row: OnceRow }) {
  if (row.newPatients === 0 || row.once === null || row.more === null) return null
  const parts = [
    { key: 'once', value: row.once, tone: row.counting ? ONCE_SOFT : ONCE_PART },
    { key: 'more', value: row.more, tone: row.counting ? MORE_SOFT : MORE_PART },
  ].filter((part) => part.value > 0)
  return (
    <span role="img" aria-label={`신환 ${formatCount(row.newPatients)}명 중 1회 ${formatCount(row.once)}명, 2회 이상 ${formatCount(row.more)}명`} className={BAR}>
      {parts.map((part) => (
        <span key={part.key} className={`${PART} ${part.tone}`} style={{ flexBasis: `${percentOf(part.value, row.newPatients)}%` }}>
          {formatCount(part.value)}
        </span>
      ))}
    </span>
  )
}

function Legend() {
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-small text-st-ink-2">
      {[
        ['현재까지 1회', ONCE_TONE],
        ['2회 이상', MORE_TONE],
      ].map(([name, tone]) => (
        <li key={name} className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className={`size-2.5 rounded-st-sm ${tone}`} />
          {name}
        </li>
      ))}
    </ul>
  )
}

export function RxPickOnce({ picks, input }: { picks: readonly RxLine[]; input: StatsInput }) {
  const headingId = useId()
  const [chosen, setChosen] = useState<string | null>(null)
  // 고른 처방에서 빠졌으면(또는 처음) 첫째
  const current = picks.find((pick) => codeKey(pick.code) === chosen) ?? picks[0]
  const anyRows = useMemo(() => hasRows(input), [input])
  const view = useMemo(
    () => (current === undefined || !anyRows ? null : onceView(input.days, current.code, input.range.current, todayOf(input.range))),
    [current, anyRows, input],
  )
  if (current === undefined) return null

  return (
    <section aria-labelledby={headingId} className={BLOCK}>
      <h3 id={headingId} className={HEADING}>
        {TITLE}
      </h3>
      <p className="mt-1 text-small text-st-muted">{DESC}</p>
      {view === null ? (
        <EmptyNote>{NO_RANGE_DATA}</EmptyNote>
      ) : (
        <>
          <div role="group" aria-label="처방" className="mt-3 flex flex-wrap gap-2">
            {picks.map((pick) => {
              const on = pick === current
              return (
                <button key={pick.code} type="button" aria-pressed={on} onClick={() => setChosen(codeKey(pick.code))} className={`${PICK_BUTTON} ${on ? PICK_ON : PICK_OFF}`}>
                  {pick.name.trim() || pick.code}
                </button>
              )
            })}
          </div>
          <Legend />
          <ul className="mt-2">
            {view.rows.map((row) => (
              <li key={row.month} className={ROW}>
                <span className={MONTH}>
                  {row.sub === null ? row.label : `${row.label} ${row.sub}`}
                  {row.counting && <span className={TAG}>집계 중</span>}
                </span>
                <OnceBar row={row} />
                <span className={END}>{endText(row)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-small font-semibold text-st-ink">{totalText(view.total)}</p>
          <p className={NOTE}>{FOOT}</p>
          {view.missing && <p className={NOTE}>{MISSING}</p>}
        </>
      )}
    </section>
  )
}
