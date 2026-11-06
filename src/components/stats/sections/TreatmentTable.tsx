'use client'

import { useId, type ReactNode } from 'react'
import { formatCount } from '@/components/charts/format'
import { InlineBar } from '@/components/charts/InlineBar'
import { Icon } from '@/components/common/Icon'
import { addedRateText, rateText } from '@/components/stats/rxPickView'
import { rowKey, type TreatmentRow } from '@/components/stats/treatmentView'
import type { RxPickRow, StatsInput, StatsRange } from '@/components/stats/view'
import { ds } from '@/components/ui/classes'
import type { Delta } from '@/types/analysis'
import { DeltaText, PartialChip } from './parts'

// 처방별 추세 묶음 줄 표 (treatment-trend REQ-1207·1209·1212, design.md '화면', 시안 docs/mockups/treatment-trend/index.html .cols·.row). props만 받는다.
// 머리 줄·묶음 줄(준비·다시 불러와야 함·처방 없음)·열린 칸 자리. 숫자는 treatmentRows가 낸 값이고 열린 칸 그림은 renderPanel로 받는다.
// 넓으면(1024px 이상) 한 줄 칸, 좁으면 한 묶음이 다섯 줄로 쌓인다(시안은 900px이지만 폭 접두사 규칙 때문에 max-lg:, design.md '시안과 다른 곳').
// 고른 기간(stats-period AC-1705.2)은 비교마다 '{name}보다' 칸이고(작년 비교가 있으면 칸이 하나 는다) 견줄 수 없는 칸은 '–'다. 빠른 단추는 지금 칸 그대로다

export type ReadyTreatmentRow = Extract<TreatmentRow, { kind: 'ready' }>

const STALE = '다시 불러오면 보여요'
const NO_CODES = '넣은 처방이 없어요. [묶음 고치기]에서 넣어 주세요.'

// 머리·줄이 같이 쓰는 칸. 줄 올림과 위아래 선은 놓는 쪽이 준다
const COLUMNS =
  'grid w-full items-center gap-x-3 lg:grid-cols-[minmax(200px,1fr)_84px_184px_128px_128px_16px] max-lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_16px] max-lg:gap-x-2 max-lg:gap-y-0.5'
const LINE = 'border-b border-line py-3 text-left text-body text-ink'
// 넓으면 숫자 칸은 이름·막대 두 줄의 가운데(시안 grid-row: 1 / span 2), 구분 없음은 셋째 줄
const NAME_CELL = 'min-w-0 wrap-anywhere lg:col-start-1 lg:row-start-1 max-lg:col-[1/3] max-lg:row-start-1'
const BAR_CELL = 'mt-1.5 block [&>span]:w-full lg:col-start-1 lg:row-start-2 max-lg:col-[1/4] max-lg:row-start-3'
const GAP_CELL = 'mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-caption text-ink-2 lg:col-start-1 lg:row-start-3 max-lg:col-[1/4] max-lg:row-start-5'
const COUNT_CELL =
  'flex flex-wrap items-center justify-end gap-x-1.5 gap-y-0.5 text-right font-semibold whitespace-nowrap tabular-nums lg:col-start-2 lg:row-[1/span_2] max-lg:col-start-1 max-lg:row-start-2 max-lg:justify-start max-lg:text-left max-lg:text-title'
const DELTA_CELL = 'text-small font-semibold lg:col-start-3 lg:row-[1/span_2] max-lg:col-[2/4] max-lg:row-start-2 max-lg:text-right'
const PAIR_CELL = 'text-right text-small text-ink-2 tabular-nums lg:row-[1/span_2] max-lg:row-start-4 max-lg:mt-1.5'
const NEW_PLACE = 'lg:col-start-4 max-lg:col-start-1 max-lg:text-left'
const RETURNING_PLACE = 'lg:col-start-5 max-lg:col-[2/4]'
const CHEV_CELL = 'text-muted transition lg:col-start-6 lg:row-[1/span_2] max-lg:col-start-3 max-lg:row-start-1'
const WAIT_CELL = 'text-small text-muted lg:col-[2/6] lg:row-start-1 max-lg:col-[1/4] max-lg:row-start-2'
const PANEL = 'border-b border-line bg-canvas p-4 max-md:-mx-4 [&_th]:bg-canvas'
// 고른 기간 비교 칸(넓으면 셋째·넷째 칸, 좁으면 둘째 줄 오른쪽에 위아래로). 좁을 때만 이름표가 보인다
const PICK_COMPARES = 'lg:contents max-lg:col-[2/4] max-lg:row-start-2 max-lg:flex max-lg:flex-col max-lg:items-end max-lg:gap-0.5'
const PICK_COMPARE = ['text-small font-semibold lg:col-start-3 lg:row-[1/span_2]', 'text-small font-semibold lg:col-start-4 lg:row-[1/span_2]'] as const
const COMPARE_LABEL = 'mr-1 font-normal text-muted lg:sr-only'
const NO_VALUE = '–'
const UNAVAILABLE: Delta = { kind: 'unavailable' }

// 칸 자리. 비교 칸이 둘(고른 기간 + 작년)이면 칸이 하나 늘어 뒤 칸이 한 칸씩 밀린다
type Layout = { columns: string; newPlace: string; returningPlace: string; chev: string; wait: string }
const ONE: Layout = { columns: COLUMNS, newPlace: NEW_PLACE, returningPlace: RETURNING_PLACE, chev: CHEV_CELL, wait: WAIT_CELL }
const TWO: Layout = {
  columns:
    'grid w-full items-center gap-x-3 lg:grid-cols-[minmax(200px,1fr)_84px_184px_184px_128px_128px_16px] max-lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_16px] max-lg:gap-x-2 max-lg:gap-y-0.5',
  newPlace: 'lg:col-start-5 max-lg:col-start-1 max-lg:text-left',
  returningPlace: 'lg:col-start-6 max-lg:col-[2/4]',
  chev: 'text-muted transition lg:col-start-7 lg:row-[1/span_2] max-lg:col-start-3 max-lg:row-start-1',
  wait: 'text-small text-muted lg:col-[2/7] lg:row-start-1 max-lg:col-[1/4] max-lg:row-start-2',
}

// 고른 기간의 비교 하나(바로 전 = comparable·delta, 작년 = lastYear). previous null = 견줄 수 없음('–')
type Compare = { name: string; previous: number | null; delta: Delta }

function comparesOf(row: RxPickRow, range: StatsRange): Compare[] {
  return [
    { name: range.previous.name, previous: row.comparable?.previous ?? null, delta: row.delta },
    ...(range.lastYear === null ? [] : [{ name: range.lastYear.name, previous: row.lastYear?.previous ?? null, delta: row.lastYear?.delta ?? UNAVAILABLE }]),
  ]
}

const pickedRange = (range: StatsRange): StatsRange | null => (range.period === null ? range : null)

// 이름(굵게) + 그 옆 코드 줄(` · `로 이음). 처방 없는 묶음은 코드 줄이 없다
function Name({ name, codes }: { name: string; codes: readonly string[] }) {
  return (
    <span className={NAME_CELL}>
      <span className="font-semibold">{name}</span>
      {codes.length > 0 && <span className="ml-2 text-caption text-muted">{codes.join(' · ')}</span>}
    </span>
  )
}

// 신환·재진 한 칸: 이름표(넓으면 화면 읽기에만) + n건 + 비율(600)
function Pair({ label, part, whole, place }: { label: string; part: number; whole: number; place: string }) {
  return (
    <span className={`${PAIR_CELL} ${place}`}>
      <span className="mr-1 text-muted lg:sr-only">{label}</span>
      {`${formatCount(part)}건`}
      <span className="ml-1 font-semibold text-ink">{rateText(part, whole)}</span>
    </span>
  )
}

// 고른 기간의 비교 칸들
function PickCompares({ row, range }: { row: RxPickRow; range: StatsRange }) {
  return (
    <span className={PICK_COMPARES}>
      {comparesOf(row, range).map((compare, i) => (
        <span key={compare.name} className={PICK_COMPARE[i]}>
          <span className={COMPARE_LABEL}>{`${compare.name}보다`}</span>
          {compare.previous === null ? NO_VALUE : <DeltaText delta={compare.delta} unit="건" />}
        </span>
      ))}
    </span>
  )
}

// picked = 고른 기간(null = 빠른 단추, 지금 칸 그대로)
function Numbers({ row, max, picked, layout }: { row: RxPickRow; max: number; picked: StatsRange | null; layout: Layout }) {
  return (
    <>
      <span className={BAR_CELL}>
        <InlineBar current={row.comparable?.current ?? row.count} previous={row.comparable?.previous ?? null} max={max} />
      </span>
      {row.gapCount > 0 && (
        <span className={GAP_CELL}>
          <span className={ds.chip.warning}>{`구분 없음 ${formatCount(row.gapCount)}건`}</span>
          <span>{`신환율과 재진율을 더하면 ${addedRateText(row)}예요`}</span>
        </span>
      )}
      <span className={COUNT_CELL}>
        {`${formatCount(row.count)}건`}
        {row.partial && <PartialChip className="" />}
      </span>
      {picked === null ? (
        <span className={DELTA_CELL}>
          <DeltaText delta={row.delta} unit="건" />
        </span>
      ) : (
        <PickCompares row={row} range={picked} />
      )}
      <Pair label="신환" part={row.newCount} whole={row.count} place={layout.newPlace} />
      <Pair label="재진" part={row.returningCount} whole={row.count} place={layout.returningPlace} />
    </>
  )
}

type LineProps = { item: ReadyTreatmentRow; max: number; picked: StatsRange | null; layout: Layout; open: boolean; onToggle: () => void; renderPanel: (item: ReadyTreatmentRow) => ReactNode }

function ReadyLine({ item, max, picked, layout, open, onToggle, renderPanel }: LineProps) {
  const panelId = useId()
  return (
    <li>
      <button type="button" aria-expanded={open} aria-controls={panelId} onClick={onToggle} className={`${layout.columns} ${LINE} cursor-pointer transition hover:bg-canvas ${ds.focusRing}`}>
        <Name name={item.group.name} codes={item.group.codes} />
        <Numbers row={item.row} max={max} picked={picked} layout={layout} />
        <Icon name="chev" size={16} className={`${layout.chev} ${open ? 'rotate-180' : ''}`} />
      </button>
      <div id={panelId} hidden={!open} className={PANEL}>
        {open && renderPanel(item)}
      </div>
    </li>
  )
}

// 다시 불러와야 하는 줄·처방 없는 줄: 단추가 아니고 숫자·막대·꺾쇠가 없다(AC-1207.9)
function WaitingLine({ item, layout }: { item: Exclude<TreatmentRow, { kind: 'ready' }>; layout: Layout }) {
  return (
    <li>
      <div className={`${layout.columns} ${LINE}`}>
        <Name name={item.group.name} codes={item.group.codes} />
        <span className={layout.wait}>{item.kind === 'stale' ? STALE : NO_CODES}</span>
      </div>
    </li>
  )
}

// 준비된 줄이 그리는 값(막대·눈금) 가운데 가장 큰 값
function barMax(rows: readonly TreatmentRow[]): number {
  const drawn = rows.flatMap((item) => {
    if (item.kind !== 'ready') return []
    const { row } = item
    return row.comparable === null ? [row.count] : [row.comparable.current, row.comparable.previous]
  })
  return Math.max(0, ...drawn)
}

// 고른 기간에서 견줄 수 없는 칸('–')이 있는 비교의 이름(차례대로)
function missingCompares(rows: readonly TreatmentRow[], range: StatsRange): string[] {
  const ready = rows.flatMap((item) => (item.kind === 'ready' ? [comparesOf(item.row, range)] : []))
  const names = [range.previous.name, ...(range.lastYear === null ? [] : [range.lastYear.name])]
  return names.filter((_, i) => ready.some((compares) => compares[i]?.previous === null))
}

export function TreatmentTable({
  input,
  rows,
  opened,
  onToggle,
  renderPanel,
}: {
  input: StatsInput
  rows: readonly TreatmentRow[] // treatmentRows 차례 그대로(sortOrder)
  opened: ReadonlySet<string> // 열린 줄 열쇠(rowKey)
  onToggle: (key: string) => void
  renderPanel: (item: ReadyTreatmentRow) => ReactNode
}) {
  const max = barMax(rows)
  const picked = pickedRange(input.range)
  const layout = picked !== null && picked.lastYear !== null ? TWO : ONE
  const heads = picked === null ? [input.range.previous.name] : [picked.previous.name, ...(picked.lastYear === null ? [] : [picked.lastYear.name])]
  return (
    <>
      <div aria-hidden="true" className={`${layout.columns} mt-3 h-9 border-b border-line text-small font-medium text-muted max-lg:hidden`}>
        <span>묶음</span>
        <span className="text-right">건수</span>
        {heads.map((name) => (
          <span key={name}>{`${name}보다`}</span>
        ))}
        <span className="text-right">신환</span>
        <span className="text-right">재진</span>
        <span />
      </div>
      <ul className="list-none">
        {rows.map((item) => {
          const key = rowKey(item.group)
          return item.kind === 'ready' ? (
            <ReadyLine key={key} item={item} max={max} picked={picked} layout={layout} open={opened.has(key)} onToggle={() => onToggle(key)} renderPanel={renderPanel} />
          ) : (
            <WaitingLine key={key} item={item} layout={layout} />
          )
        })}
      </ul>
      {picked !== null &&
        missingCompares(rows, picked).map((name) => (
          <p key={name} className="mt-2 text-small text-muted">{`${name}: 자료가 없어요. 비트 PC에서 그 기간을 불러오면 보여요.`}</p>
        ))}
    </>
  )
}
