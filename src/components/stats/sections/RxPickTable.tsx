'use client'

import { useId, useState, type ReactNode } from 'react'
import { ChartLegend, type LegendItem } from '@/components/charts/ChartLegend'
import { formatCount, percentOf } from '@/components/charts/format'
import { Icon } from '@/components/common/Icon'
import { addedRateText, COLUMN_NAME, GRAIN_NAME, pickComparedNote, rateText, rxPickCopyText } from '@/components/stats/rxPickView'
import { codeKey, type RxPickRow, type StatsInput } from '@/components/stats/view'
import { ds } from '@/components/ui/classes'
import { DeltaText, PERIOD_NAME } from './parts'

// 처방 골라 보기 표 (rx-picker REQ-805·808·809, AC-804.5·804.8, 시안 docs/mockups/rx-picker/index.html). props만 받는다.
// 뜻 줄·칸 머리·줄·얇은 띠·합계·[표 복사]·안내. 숫자는 rxPickRows·rxPickTotal이 낸 값이고 줄을 눌러 여는 그래프는 renderPanel로 받는다.
// 넓으면(1024px 이상) 칸, 좁으면 줄 하나가 여러 줄로 쌓인다. 합계 줄은 단추가 아니라서 줄 안 칸을 Cells 하나로 같이 쓴다

const MEANING = '신환율 = 신환 ÷ 건수 · 재진율 = 재진 ÷ 건수'
const GAP_NOTE = '구분 없음은 파일에 신환·재진이 아닌 다른 값(30 초진, 진찰료산정안함 같은 값)이 적힌 건이에요. 어느 쪽에도 넣지 않아서 두 비율을 더해도 100%가 안 돼요.'
const COUNT_NOTE = '건 = 날마다 그 처방을 받은 환자 수를 더한 값이에요. 같은 환자가 3일 오면 3건이에요.'
const NEW_NOTE = '신환은 의원에 처음 온 환자예요. 그 처방을 처음 받은 환자라는 뜻은 아니에요.'
const TOTAL_NOTE = '합계는 고른 처방의 건수를 더한 값이에요. 한 환자가 같은 날 두 처방을 받으면 2건이에요.'
const COPIED = '복사했어요. 엑셀이나 메모에 붙여 넣을 수 있어요.'
const BLOCKED = '이 화면에서는 복사가 막혔어요. 아래 글을 직접 복사해 주세요.'

// 얇은 띠의 구분 없음 빗금: 45° 선을 4px 간격으로 M0 k L k 0. 막대 조각의 빗금(닿는 길이 440)으로는 1024px 미만 전체 폭 띠(최대 약 975px)가 끊겨 따로 둔다(design.md '차트 부품')
const BAND_HATCH_GAP = 4
const BAND_HATCH_REACH = 1200
const BAND_HATCH = Array.from({ length: BAND_HATCH_REACH / BAND_HATCH_GAP }, (_, i) => BAND_HATCH_GAP * (i + 1))
  .map((k) => `M0 ${k} L${k} 0`)
  .join(' ')

// 머리·줄·합계가 같이 쓰는 칸. 줄 올림과 위아래 선은 놓는 쪽이 준다
const COLUMNS = 'grid w-full items-center gap-x-3 lg:grid-cols-[minmax(200px,1fr)_72px_104px_176px_64px_64px_64px_64px_16px] max-lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_16px] max-lg:gap-x-2 max-lg:gap-y-0.5'
const NAME_CELL = 'row-start-1 min-w-0 wrap-anywhere lg:col-start-1 max-lg:col-[1/3]'
const BAND_CELL = 'mt-1.5 flex h-1.5 gap-px overflow-clip bg-line lg:col-start-1 lg:row-start-2 max-lg:col-[1/4] max-lg:row-start-4 max-lg:mt-2'
const GAP_CELL = 'mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-caption text-ink-2 lg:col-start-1 lg:row-start-3 max-lg:col-[1/4] max-lg:row-start-6'
const COUNT_CELL = 'text-right font-semibold tabular-nums lg:col-start-2 lg:row-[1/span_3] max-lg:col-start-1 max-lg:row-[2/span_2] max-lg:text-left max-lg:text-title'
const PREVIOUS_CELL = 'text-right text-small text-ink-2 tabular-nums lg:col-start-3 lg:row-[1/span_3] max-lg:col-[2/4] max-lg:row-start-2'
const DELTA_CELL = 'text-small font-semibold lg:col-start-4 lg:row-[1/span_3] max-lg:col-[2/4] max-lg:row-start-3 max-lg:text-right'
const PAIR = 'lg:contents max-lg:row-start-5 max-lg:mt-1 max-lg:flex max-lg:flex-wrap max-lg:gap-x-1.5'
const PAIR_VALUE = 'text-right text-small tabular-nums lg:row-[1/span_3]'
const NEW_PLACE = { pair: 'max-lg:col-start-1', count: 'lg:col-start-5', rate: 'lg:col-start-6' }
const RETURNING_PLACE = { pair: 'max-lg:col-[2/4] max-lg:justify-end', count: 'lg:col-start-7', rate: 'lg:col-start-8' }
const CHEV_CELL = 'text-muted transition lg:col-start-9 lg:row-[1/span_3] max-lg:col-start-3 max-lg:row-start-1'
const CODE = 'ml-1.5 whitespace-nowrap text-caption text-muted'

type Place = typeof NEW_PLACE

// 얇은 띠: 꾸밈이다. 값은 같은 줄의 숫자가 글자로 준다. 건수 0이면 조각 없는 빈 띠다
function MixBand({ row }: { row: RxPickRow }) {
  const widthOf = (part: number) => ({ width: `${percentOf(part, row.count)}%` })
  return (
    <span aria-hidden="true" className={BAND_CELL}>
      {row.newCount > 0 && <span className="bg-accent" style={widthOf(row.newCount)} />}
      {row.returningCount > 0 && <span className="bg-chart-3" style={widthOf(row.returningCount)} />}
      {row.gapCount > 0 && (
        <span className="relative bg-warning-soft text-warning" style={widthOf(row.gapCount)}>
          <svg aria-hidden="true" className="absolute inset-0 size-full">
            <path d={BAND_HATCH} fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
        </span>
      )}
    </span>
  )
}

// 신환·재진 한 쌍. 넓으면 두 칸으로 풀리고(contents) 칸 이름은 화면 읽기에만 남는다
function Pair({ label, part, whole, place }: { label: string; part: number; whole: number; place: Place }) {
  return (
    <span className={`${PAIR} ${place.pair}`}>
      <span className="text-small text-muted lg:sr-only">{label}</span>
      <span className={`${PAIR_VALUE} text-ink-2 ${place.count}`}>{`${formatCount(part)}건`}</span>
      <span className={`${PAIR_VALUE} font-semibold text-ink ${place.rate}`}>{rateText(part, whole)}</span>
    </span>
  )
}

function Cells({ row, head, columnName }: { row: RxPickRow; head: ReactNode; columnName: string }) {
  return (
    <>
      <span className={NAME_CELL}>{head}</span>
      <MixBand row={row} />
      {row.gapCount > 0 && (
        <span className={GAP_CELL}>
          <span className={ds.chip.warning}>{`구분 없음 ${formatCount(row.gapCount)}건`}</span>
          <span>{`신환율과 재진율을 더하면 ${addedRateText(row)}예요`}</span>
        </span>
      )}
      <span className={COUNT_CELL}>{`${formatCount(row.count)}건`}</span>
      <span className={PREVIOUS_CELL}>
        <span className="lg:sr-only">{`${columnName} `}</span>
        {row.comparable === null ? '–' : `${formatCount(row.comparable.previous)}건`}
      </span>
      <span className={DELTA_CELL}>
        <DeltaText delta={row.delta} unit="건" />
      </span>
      <Pair label="신환" part={row.newCount} whole={row.count} place={NEW_PLACE} />
      <Pair label="재진" part={row.returningCount} whole={row.count} place={RETURNING_PLACE} />
    </>
  )
}

function PickRow({ row, columnName, open, onToggle, renderPanel }: { row: RxPickRow; columnName: string; open: boolean; onToggle: () => void; renderPanel: (row: RxPickRow) => ReactNode }) {
  const panelId = useId()
  const codeOnly = row.name === '' || row.name === row.code
  const head = codeOnly ? (
    <span className="font-semibold">{row.code}</span>
  ) : (
    <>
      <span className="font-semibold">{row.name}</span>
      <span className={CODE}>{row.code}</span>
    </>
  )
  return (
    <li>
      <button type="button" aria-expanded={open} aria-controls={panelId} onClick={onToggle} className={`${COLUMNS} cursor-pointer border-b border-line py-3 text-left text-body text-ink transition hover:bg-canvas ${ds.focusRing}`}>
        <Cells row={row} head={head} columnName={columnName} />
        <Icon name="chev" size={16} className={`${CHEV_CELL} ${open ? 'rotate-180' : ''}`} />
      </button>
      <div id={panelId} hidden={!open} className="border-b border-line bg-canvas p-4 max-md:-mx-4 [&_th]:bg-canvas">
        {open && renderPanel(row)}
      </div>
    </li>
  )
}

// CopyButton을 쓰지 않는 까닭은 design.md '[표 복사]는 CopyButton을 쓰지 않는다'. 복사한 뒤 표가 바뀌면 "복사했어요"를 지우고, 막힌 칸의 글은 지금 표를 따른다
function CopyTable({ text }: { text: string }) {
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setResult({ ok: true, text })
    } catch {
      setResult({ ok: false, text })
    }
  }
  const blocked = result !== null && !result.ok
  const copied = result !== null && result.ok && result.text === text
  return (
    <>
      <div className="mt-3 flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
        <span role="status" className="text-small text-ink-2">
          {blocked ? BLOCKED : copied ? COPIED : ''}
        </span>
        <button type="button" onClick={() => void copy()} className={`${ds.button.secondarySmall} max-md:w-full`}>
          <Icon name="copy" size={14} className="text-ink-2" />
          <span>표 복사</span>
        </button>
      </div>
      {blocked && <textarea readOnly aria-label="복사할 표" value={text} className={`mt-2 block h-30 w-full rounded-control border border-line-strong bg-surface p-2 text-caption whitespace-pre text-ink max-md:text-lead ${ds.focusRing}`} />}
    </>
  )
}

export function RxPickTable({
  input,
  rows,
  total,
  hospitalName,
  opened,
  onToggle,
  renderPanel,
}: {
  input: StatsInput
  rows: readonly RxPickRow[]
  total: RxPickRow | null
  hospitalName: string
  opened: ReadonlySet<string> // 대문자 코드(codeKey)
  onToggle: (code: string) => void
  renderPanel: (row: RxPickRow) => ReactNode
}) {
  const { range } = input
  const { period } = range
  const columnName = COLUMN_NAME[period]
  const anyGap = rows.some((row) => row.gapCount > 0)
  const compared = pickComparedNote(input)
  const legend: LegendItem[] = [
    { label: '신환', mark: 'accent' },
    { label: '재진', mark: 'chart-3' },
    ...(anyGap ? [{ label: '구분 없음', mark: 'hatch-warning' } satisfies LegendItem] : []),
  ]
  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="text-small font-semibold text-ink">{MEANING}</p>
        <ChartLegend items={legend} />
      </div>
      <div aria-hidden="true" className={`${COLUMNS} mt-2 h-9 border-b border-line text-small font-medium text-muted max-lg:hidden`}>
        <span>처방</span>
        <span className="text-right">건수</span>
        <span className="text-right">{columnName}</span>
        <span>증감</span>
        <span className="text-right">신환</span>
        <span className="text-right">신환율</span>
        <span className="text-right">재진</span>
        <span className="text-right">재진율</span>
        <span />
      </div>
      <ul className="list-none">
        {rows.map((row) => (
          <PickRow key={row.code} row={row} columnName={columnName} open={opened.has(codeKey(row.code))} onToggle={() => onToggle(row.code)} renderPanel={renderPanel} />
        ))}
        {total !== null && (
          <li>
            <div className={`${COLUMNS} -mt-px border-t border-line-strong py-3 text-body text-ink`}>
              <Cells
                row={total}
                columnName={columnName}
                head={
                  <>
                    <span className="font-semibold">합계</span>
                    <span className={CODE}>{`${formatCount(rows.length)}가지`}</span>
                  </>
                }
              />
            </div>
          </li>
        )}
      </ul>
      <CopyTable text={rxPickCopyText({ hospitalName, periodName: PERIOD_NAME[period], range, rows, total })} />
      <div className="mt-3 grid max-w-160 gap-1 text-small text-muted">
        {anyGap && <p className="text-ink-2">{GAP_NOTE}</p>}
        {compared !== null && <p>{compared}</p>}
        <p>{`줄을 누르면 그 처방의 ${GRAIN_NAME[period]}별 건수가 열려요.`}</p>
        <p>{COUNT_NOTE}</p>
        <p>{NEW_NOTE}</p>
        {total !== null && <p>{TOTAL_NOTE}</p>}
      </div>
    </>
  )
}
