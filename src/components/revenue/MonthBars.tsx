import type { ReactNode } from 'react'
import { ReaderTable } from './RevenueParts'
import type { Axis, LegendItem, StackChart, StackColumn, StackSegment } from './types'

// 세 겹 쌓은 막대 (revenue TASK-9, 시안 gen.py bars(), UI_GUIDE '차트'). 통계 매출 칸의 급여·비급여·기타 그림이 쓴다(stats-revenue).
// 훅이 없는 순수 부품이고 움직이지 않는다. 옛 매출 탭의 13달 막대(MonthBars)는 지웠다(stats-revenue AC-4110.4).
// HTML 막대: 높이·눈금 위치만 % inline style이고 글자는 HTML 글자다. 그림 전체는 aria-hidden, 숫자는 화면 읽기 표가 준다. 가로 눈금선만 있다

const SIZE = 'h-45 max-md:h-35'

const STACK_TONE: Record<StackSegment['key'], string> = { covered: 'bg-chart-3', noncovered: 'bg-accent', other: 'bg-line-strong' }
// 눈금 글자 칸 폭과 날짜 글자 줄의 띄움은 같은 값이다(폰 32 · PC 48)
const AXIS_WIDTH = 'w-8 md:w-12'
const LABELS_OFFSET = 'pl-8 md:pl-12'

function ChartHead({ title, legend, tones }: { title: string; legend: LegendItem[]; tones: Readonly<Record<string, string>> }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <h3 className="text-subtitle font-semibold text-ink">{title}</h3>
      {legend.length > 0 && (
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-small text-ink-2">
          {legend.map((item) => (
            <span key={item.key} className="inline-flex items-center gap-1.5">
              <span className={`size-2.5 shrink-0 ${tones[item.key]}`} />
              {item.label}
            </span>
          ))}
        </p>
      )}
    </div>
  )
}

type PlotProps = { axis: Axis; columns: StackColumn[]; children: ReactNode }

// 폰은 날짜 글자를 하나 걸러 보인다(자리는 그대로). 고른 칸은 늘 보이고, 바로 앞뒤 칸은 겹치지 않게 숨긴다
function hiddenOnPhone(columns: PlotProps['columns'], index: number) {
  if (columns[index].kind === 'selected') return false
  return index % 2 === 1 || columns[index - 1]?.kind === 'selected' || columns[index + 1]?.kind === 'selected'
}

function Plot({ axis, columns, children }: PlotProps) {
  return (
    <div aria-hidden="true" className="mt-3 tabular-nums">
      <p className="text-caption text-muted">{axis.unit}</p>
      <div className="mt-2 flex">
        <div className={`relative shrink-0 ${AXIS_WIDTH}`}>
          {axis.ticks.map((tick) => (
            <span key={tick.bottom} className="absolute right-2 translate-y-1/2 whitespace-nowrap text-caption text-muted" style={{ bottom: `${tick.bottom}%` }}>
              {tick.label}
            </span>
          ))}
        </div>
        <div className={`relative min-w-0 flex-1 ${SIZE}`}>
          {axis.ticks.map((tick) => (
            <div key={tick.bottom} className={`absolute inset-x-0 h-px ${tick.bottom === 0 ? 'bg-line-strong' : 'bg-line'}`} style={{ bottom: `${tick.bottom}%` }} />
          ))}
          <div className="absolute inset-0 flex">{children}</div>
        </div>
      </div>
      <div className={`flex ${LABELS_OFFSET}`}>
        {columns.map((column, index) => (
          <div key={column.month} className="min-w-0 flex-1 text-center text-caption whitespace-nowrap text-muted">
            <p className={`mt-1.5 ${column.kind === 'selected' ? 'font-semibold text-ink' : ''} ${hiddenOnPhone(columns, index) ? 'max-md:invisible' : ''}`}>{column.label}</p>
            {column.year && <p>{column.year}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}

const COLUMN = 'flex h-full min-w-0 flex-1 items-end justify-center'

/** 세 겹 쌓은 막대. 아래부터 급여·비급여·기타, 겹 높이는 그림 칸 대비 %. 0인 겹은 그리지 않는다(빈 틈이 생기지 않게) */
export function StackBars({ chart }: { chart: StackChart }) {
  return (
    <div>
      <ChartHead title={chart.title} legend={chart.legend} tones={STACK_TONE} />
      <Plot axis={chart.axis} columns={chart.columns}>
        {chart.columns.map((column) => (
          <div key={column.month} className={COLUMN}>
            {column.segments && (
              <div className="flex h-full w-1/2 max-w-10 flex-col justify-end gap-0.5">
                {[...column.segments].reverse().map((segment) =>
                  segment.height > 0 ? <div key={segment.key} className={`w-full ${STACK_TONE[segment.key]}`} style={{ height: `${segment.height}%` }} /> : null,
                )}
              </div>
            )}
          </div>
        ))}
      </Plot>
      <ReaderTable table={chart.table} />
    </div>
  )
}
