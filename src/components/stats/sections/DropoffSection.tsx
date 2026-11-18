'use client'

import { useId, useMemo, useState } from 'react'
import { formatCount, percentOf } from '@/components/charts/format'
import { groupKey } from '@/components/stats/treatmentView'
import type { StatsRxGroup } from '@/types/rxGroups'
import type { DropoffLine } from '@/types/stats'
import type { BitSectionsShown } from './PatientMixSection'
import { Section } from './parts'
import { useTabDesc } from './RxSection'

// 몇 번까지 받나 (stats-insights REQ-6103 AC-6103.2~AC-6103.5, 시안 docs/mockups/stats-insights/index.html ③). 처방 칸 넷째 탭이다.
// 숫자는 Worker가 불러온 범위 전체로 센 묶음 열쇠별 줄(BitSectionsView.dropoff)이고, 이름은 지금 묶음의 열쇠(groupKey)로 찾아 붙인다.
// 지금 묶음에 없는 열쇠(불러온 뒤 묶음을 바꿈)는 그리지 않는다. 묶음 고르기는 대상이 많은 순(같으면 Worker 차례 = 묶음 차례), 고른 것은 React 상태뿐이다.
// 비율은 모두 반올림 정수 %(명세 AC-6103.2·AC-6103.3), 평균은 소수 1자리

const TITLE = '몇 번까지 받나'
const DESC = '신환이 그 치료를 몇 번까지 받고 그만 오는지 봐요'
const NOT_HERE = '비트에서 불러오면 볼 수 있어요'
const NOBODY = '아직 셀 환자가 없어요'
const COMPARE = '치료별로 견주기'
const FOOT = '마지막으로 받은 뒤 30일 넘게 안 오면 끝난 것으로 봐요. 아직 다니는 중인 환자는 뺐어요.'
const COLUMNS = ['치료', '처음 받은 신환', '1회만', '3회 이상', '6회 이상', '평균']
const MINUS = '−'

const LINE = 'mt-3 text-body text-ink-2'
// 묶음 단추(RxPickOnce 처방 단추와 같은 모양). 넘치면 다음 줄, 휴대폰 44px
const PICK_BUTTON = 'inline-flex h-8 cursor-pointer items-center rounded-control border px-3 text-small focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent max-md:h-11'
const PICK_ON = 'border-accent bg-accent-soft font-semibold text-accent-strong'
const PICK_OFF = 'border-line-strong bg-surface font-medium text-ink-2 transition hover:bg-canvas'
// 세 칸(SunapSection과 같은 나눔): 넓으면 세 열 사이 얇은 세로선, 휴대폰은 한 열 사이 가로선
const GRID = 'mt-4 grid grid-cols-3 max-md:grid-cols-1'
const CELL_FIRST = 'pr-5 max-md:pr-0 max-md:pb-3'
const CELL_NEXT = 'border-l border-st-line px-5 max-md:border-t max-md:border-l-0 max-md:px-0 max-md:py-3'
const CELL_LAST = 'border-l border-st-line pl-5 max-md:border-t max-md:border-l-0 max-md:pt-3 max-md:pl-0'
const BIG = 'text-st-22 leading-8 font-semibold text-st-ink tabular-nums'
const CELL_NAME = 'mt-0.5 text-small text-st-muted'
const SUB_HEADING = 'mt-6 text-st-15 leading-6 font-semibold text-st-ink'
// 횟수 줄(시안 .fun): 이름 | 막대 | 인원 · 빠진 비율
const FUNNEL = 'mt-2'
const ROW = 'grid grid-cols-[72px_minmax(0,1fr)_96px] items-center gap-x-2 py-1 text-small text-st-ink-2'
const BAR = 'st-move-period block h-4.5 rounded-control bg-accent'
const COUNT = 'text-right whitespace-nowrap text-st-ink tabular-nums'
const DROP = 'ml-1.5 text-caption text-negative'
// 견주기 표(DoctorsSection 표와 같은 모양): 폰 폭에서는 그 안에서만 옆으로 밀린다
const TH = 'whitespace-nowrap border-b border-st-line px-4 py-2 text-right text-small font-semibold text-st-muted first:pl-0 first:text-left'
const TD = 'whitespace-nowrap border-b border-st-line px-4 py-3 text-right tabular-nums text-st-ink-2 first:pl-0 first:text-left first:font-semibold first:text-st-ink'
const FOOT_LINE = 'mt-3 text-small text-st-muted'

type Shown = DropoffLine & { name: string }

const pct = (part: number, n: number) => Math.round((part * 100) / n)
const people = (count: number) => `${formatCount(count)}명`
const times = (average: number) => `${average.toFixed(1)}회`

// 지금 묶음의 열쇠 → 이름(sortOrder 차례, 같은 열쇠는 앞 묶음). 처방 없는 묶음은 불러오기에 실리지 않는다(groupDefs)
function namesOf(groups: readonly StatsRxGroup[]): Map<string, string> {
  const names = new Map<string, string>()
  for (const group of [...groups].sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (group.codes.length === 0) continue
    const key = groupKey(group.codes, group)
    if (!names.has(key)) names.set(key, group.name)
  }
  return names
}

function shownLines(view: BitSectionsShown, groups: readonly StatsRxGroup[]): Shown[] {
  if (view === null || view === 'waiting' || view.kind !== 'ready') return []
  const names = namesOf(groups)
  return (view.dropoff ?? [])
    .flatMap((line) => {
      const name = names.get(line.group)
      return name === undefined ? [] : [{ ...line, name }]
    })
    .sort((a, b) => b.n - a.n)
}

function Cells({ line }: { line: Shown }) {
  const cells: [string, string, string][] = [
    [`${pct(line.once, line.n)}%`, `1회만 받고 끝난 환자 (${people(line.n)} 중 ${people(line.once)})`, CELL_FIRST],
    [times(line.average), '한 사람이 받은 횟수 평균', CELL_NEXT],
    [`${line.drop}회 → ${line.drop + 1}회`, '가장 많이 빠지는 곳', CELL_LAST],
  ]
  return (
    <div className={GRID}>
      {cells.map(([value, name, place]) => (
        <div key={name} data-kpi className={place}>
          <p className={BIG}>{value}</p>
          <p className={CELL_NAME}>{name}</p>
        </div>
      ))}
    </div>
  )
}

// 1~6회 이상 · 10회 이상. 2~6회 줄에는 앞 줄에서 빠진 비율
function Funnel({ line }: { line: Shown }) {
  const rows = [...line.atLeast.map((count, i) => ({ label: `${i + 1}회 이상`, count, drop: i === 0 ? null : pct(line.atLeast[i - 1]! - count, line.n) })), { label: '10회 이상', count: line.ten, drop: null }]
  return (
    <ul aria-label="받은 횟수" className={FUNNEL}>
      {rows.map((row) => (
        <li key={row.label} className={ROW}>
          <span>{row.label}</span>
          <span aria-hidden="true" className="block">
            <span data-bar className={BAR} style={{ width: `${percentOf(row.count, line.n)}%` }} />
          </span>
          <span className={COUNT}>
            {people(row.count)}
            {row.drop !== null && <span className={DROP}>{`${MINUS}${row.drop}%`}</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}

function CompareTable({ lines }: { lines: readonly Shown[] }) {
  const headingId = useId()
  return (
    <>
      <h3 id={headingId} className={SUB_HEADING}>
        {COMPARE}
      </h3>
      <div className="mt-1 overflow-x-auto">
        <table aria-labelledby={headingId} className="w-full border-collapse text-st-15 leading-6">
          <thead>
            <tr>
              {COLUMNS.map((column) => (
                <th key={column} scope="col" className={TH}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.group}>
                {[line.name, people(line.n), `${pct(line.once, line.n)}%`, `${pct(line.atLeast[2], line.n)}%`, `${pct(line.atLeast[5], line.n)}%`, times(line.average)].map((cell, i) => (
                  <td key={i} className={TD}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

export function DropoffSection({ view, groups }: { view: BitSectionsShown; groups: readonly StatsRxGroup[] }) {
  // 처방 카드(옆 글 있음) 안이면 설명은 패널 맨 위 한 줄(lead)이다(first90 AC-4413.1)
  const { head, lead } = useTabDesc(DESC)
  const [chosen, setChosen] = useState<string | null>(null)
  const lines = useMemo(() => shownLines(view, groups), [view, groups])

  if (view === 'waiting') {
    return (
      <Section title={TITLE} desc={head}>
        {lead}
      </Section>
    )
  }
  if (view === null || view.kind !== 'ready') {
    return (
      <Section title={TITLE} desc={head}>
        {lead}
        <p className={LINE}>{NOT_HERE}</p>
      </Section>
    )
  }
  // 고른 묶음이 없어졌으면(또는 처음) 맨 앞
  const current = lines.find((line) => line.group === chosen) ?? lines[0]
  if (current === undefined) {
    return (
      <Section title={TITLE} desc={head}>
        {lead}
        <p className={LINE}>{NOBODY}</p>
      </Section>
    )
  }
  return (
    <Section title={TITLE} desc={head}>
      {lead}
      <div role="group" aria-label="치료 묶음" className="mt-3 flex flex-wrap gap-2">
        {lines.map((line) => {
          const on = line === current
          return (
            <button key={line.group} type="button" aria-pressed={on} onClick={() => setChosen(line.group)} className={`${PICK_BUTTON} ${on ? PICK_ON : PICK_OFF}`}>
              {line.name}
            </button>
          )
        })}
      </div>
      <Cells line={current} />
      <h3 className={SUB_HEADING}>{`${current.name} 처음 받은 신환 ${people(current.n)}`}</h3>
      <Funnel line={current} />
      {lines.length >= 2 && <CompareTable lines={lines} />}
      <p className={FOOT_LINE}>{FOOT}</p>
    </Section>
  )
}
