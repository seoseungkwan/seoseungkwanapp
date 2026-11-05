'use client'

import { useId, type ReactNode } from 'react'
import { formatCount } from '@/components/charts/format'
import { InlineBar } from '@/components/charts/InlineBar'
import { Icon } from '@/components/common/Icon'
import { addedRateText, rateText } from '@/components/stats/rxPickView'
import { rowKey, type TreatmentRow } from '@/components/stats/treatmentView'
import { COMPARE_NAME, type RxPickRow, type StatsInput } from '@/components/stats/view'
import { ds } from '@/components/ui/classes'
import { DeltaText, PartialChip } from './parts'

// 처방별 추세 묶음 줄 표 (treatment-trend REQ-1207·1209·1212, design.md '화면', 시안 docs/mockups/treatment-trend/index.html .cols·.row). props만 받는다.
// 머리 줄·묶음 줄(준비·다시 불러와야 함·처방 없음)·열린 칸 자리. 숫자는 treatmentRows가 낸 값이고 열린 칸 그림은 renderPanel로 받는다.
// 넓으면(1024px 이상) 한 줄 칸, 좁으면 한 묶음이 다섯 줄로 쌓인다(시안은 900px이지만 폭 접두사 규칙 때문에 max-lg:, design.md '시안과 다른 곳')

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

function Numbers({ row, max }: { row: RxPickRow; max: number }) {
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
      <span className={DELTA_CELL}>
        <DeltaText delta={row.delta} unit="건" />
      </span>
      <Pair label="신환" part={row.newCount} whole={row.count} place={NEW_PLACE} />
      <Pair label="재진" part={row.returningCount} whole={row.count} place={RETURNING_PLACE} />
    </>
  )
}

function ReadyLine({ item, max, open, onToggle, renderPanel }: { item: ReadyTreatmentRow; max: number; open: boolean; onToggle: () => void; renderPanel: (item: ReadyTreatmentRow) => ReactNode }) {
  const panelId = useId()
  return (
    <li>
      <button type="button" aria-expanded={open} aria-controls={panelId} onClick={onToggle} className={`${COLUMNS} ${LINE} cursor-pointer transition hover:bg-canvas ${ds.focusRing}`}>
        <Name name={item.group.name} codes={item.group.codes} />
        <Numbers row={item.row} max={max} />
        <Icon name="chev" size={16} className={`${CHEV_CELL} ${open ? 'rotate-180' : ''}`} />
      </button>
      <div id={panelId} hidden={!open} className={PANEL}>
        {open && renderPanel(item)}
      </div>
    </li>
  )
}

// 다시 불러와야 하는 줄·처방 없는 줄: 단추가 아니고 숫자·막대·꺾쇠가 없다(AC-1207.9)
function WaitingLine({ item }: { item: Exclude<TreatmentRow, { kind: 'ready' }> }) {
  return (
    <li>
      <div className={`${COLUMNS} ${LINE}`}>
        <Name name={item.group.name} codes={item.group.codes} />
        <span className={WAIT_CELL}>{item.kind === 'stale' ? STALE : NO_CODES}</span>
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
  return (
    <>
      <div aria-hidden="true" className={`${COLUMNS} mt-3 h-9 border-b border-line text-small font-medium text-muted max-lg:hidden`}>
        <span>묶음</span>
        <span className="text-right">건수</span>
        <span>{`${COMPARE_NAME[input.range.period]}보다`}</span>
        <span className="text-right">신환</span>
        <span className="text-right">재진</span>
        <span />
      </div>
      <ul className="list-none">
        {rows.map((item) => {
          const key = rowKey(item.group)
          return item.kind === 'ready' ? (
            <ReadyLine key={key} item={item} max={max} open={opened.has(key)} onToggle={() => onToggle(key)} renderPanel={renderPanel} />
          ) : (
            <WaitingLine key={key} item={item} />
          )
        })}
      </ul>
    </>
  )
}
