import type { ReactNode } from 'react'
import { percentOf } from '@/components/charts/format'
import type { CellAlert, CellBar, CellColumns, CellNumber, CellTableRow, CompareStatsCells } from './statsInput'

// 통계 나란히 보기 작은 칸 (spec admin-view REQ-8016 AC-8016.2, 시안 docs/mockups/admin-view ?s=compare-region sideCard·.mc).
// 의원 하나 × 통계 큰 카드 줄 하나 = 흰 작은 카드 하나(288px 칸). 안에 작은 칸을 시안 차례로 쌓는다(이름은 통계 탭 이름).
// 숫자는 compareStatsInput이 통계 탭과 같은 순수 함수로 만든 글자 그대로이고, 여기서는 그리기만 한다(훅·네트워크 없음, 단추 없음 — 읽기만).
// 작은 막대·띠·열 칸은 꾸밈(aria-hidden)이고 HTML 막대다: inline style은 막대 높이·폭 %뿐이다(차트 부품과 같은 방식).
// 색은 앱 토큰으로 그린다: 90일초진 색 → cat-2, 재진 색 → chart-3, 열 칸 단계 → chart-1~5. 카드 모서리·그림자는 통계 카드와 같은 통계 토큰(rounded-st·shadow-st-card — 테두리 없음, classes.test가 이 폴더에 허용).
// 의사랑 의원(cells.uis, spec uisarang-upload REQ-8813 AC-8813.4, 시안 docs/mockups/uisarang-upload ?s=admin): 칸 차례·모양은 그대로이고
// 셀 수 없는 작은 칸(신환 재방문율·몇 번까지 받나·처방별 신환·재진·원장님별·시간대별 접수)은 작은 글 '의사랑 엑셀로는 셀 수 없어요',
// 숫자 칸(Block 전환)은 '–' 아래 같은 작은 글, 처방별 추세 자리 이름은 '묶음별 처방량'(값은 처방량 글)

export type SideRowKey = 'summary' | 'patients' | 'revenue' | 'sunap' | 'calendar' | 'rx' | 'ops'

const DASH = '–'
const NO_DATA = '자료 없음'
const CALM = '평소와 비슷해요' // 통계 탭 평소와 다른 것의 빈 글
const NO_GOAL = '목표를 적지 않았어요'
const NO_SUNAP = '수납일지를 마감한 날이 없어요'
const SUNAP_NOTE = '수납일지 마감한 날만'
const NO_CAL = '예약 탭에 적은 예약이 없어요'
const ONE_DOCTOR = '원장님이 한 분이라 나누어 볼 것이 없어요.'
const UIS_NA = '의사랑 엑셀로는 셀 수 없어요'
const UIS_RX = '묶음별 처방량'
const UIS_NA_NUMBERS: ReadonlySet<string> = new Set(['Block 전환']) // 숫자 칸 가운데 의사랑 엑셀로 셀 수 없는 것
const MARK: Record<CellAlert['kind'], string> = { up: '▲', down: '▼', warn: '!' }
const MARK_TONE: Record<CellAlert['kind'], string> = { up: 'text-positive', down: 'text-negative', warn: 'text-warning' }
const SPLIT_TONE = { covered: 'bg-cat-1', noncovered: 'bg-cat-2', other: 'bg-cat-3' } as const
const HEAT_TONE = ['bg-canvas', 'bg-chart-1', 'bg-chart-2', 'bg-chart-3', 'bg-chart-4', 'bg-chart-5'] as const

// 카드(시안 .mc): 흰 바탕 · 14px 모서리 · 옅은 그림자 · 안쪽 16px 20px. 줄 높이는 그 줄에서 가장 높은 카드(격자가 늘인다)
const CARD = 'min-w-0 rounded-st bg-surface px-5 py-4 shadow-st-card'
const WHO = 'mb-2 truncate text-caption text-muted'
const SUB_NEXT = 'mt-3 border-t border-line pt-3'
const SUB_HEAD = 'text-body font-semibold text-ink'
const NA = 'mt-1.5 text-small text-muted'
const NUMS = { 2: 'grid grid-cols-2 gap-x-3 gap-y-2', 3: 'grid grid-cols-3 gap-x-3 gap-y-2' } as const
const NUMS_GAP = 'mt-1.5' // 작은 칸 이름 아래. 이름 없는 줄(예약·전환·예약)은 위 간격 없이 카드 이름 바로 아래
const NOTE = 'mt-1.5 text-caption text-muted'
const NUM_LABEL = 'text-caption text-ink-2'
const NUM_VALUE = 'mt-0.5 block whitespace-nowrap text-lead font-semibold text-ink tabular-nums'
const NUM_UNIT = 'ml-px text-caption font-semibold text-ink-2'
const NUM_NA = 'mt-0.5 block text-caption text-muted'
const LINE = 'mt-1.5 text-small text-ink-2'
const STRONG = 'font-semibold text-ink'
const ALERTS = 'mt-1.5 grid gap-1.5'
const ALERT = 'rounded-control border border-line px-2 py-1.5 text-small text-ink-2'
const GOAL_TRACK = 'relative mt-2 h-2 overflow-clip rounded-control bg-line'
const GOAL_FILL = 'absolute inset-y-0 left-0 bg-accent'
const COLUMNS = { 64: 'mt-2 flex h-16 items-end gap-px border-b border-line-strong', 48: 'mt-2 flex h-12 items-end gap-px border-b border-line-strong' } as const
const COLUMN = 'flex h-full min-w-0 flex-1 flex-col-reverse'
const AXIS = 'mt-0.5 flex justify-between text-caption text-muted'
const AXIS_EACH = 'mt-0.5 flex text-caption text-muted'
const BARS = 'mt-1.5 grid gap-1'
const BAR_ROW = 'grid grid-cols-[76px_minmax(0,1fr)_52px] items-center gap-2 text-caption text-ink-2'
const BAR_VALUE = 'text-right font-semibold text-ink tabular-nums'
const SPLIT = 'mt-2 flex h-3.5 overflow-clip rounded-control'
const LEGEND = 'mt-2 flex flex-wrap gap-x-3 gap-y-1 text-caption text-ink-2'
const HEAT = 'mt-2 grid grid-cols-10 gap-0.5'
const TABLE = 'mt-1.5 w-full border-collapse text-caption'
const TD = 'py-1 text-right text-ink-2 tabular-nums'
const TD_NAME = 'py-1 text-left font-semibold text-ink'

const Dash = () => <p className={NA}>{DASH}</p>
const UisNa = () => <p className={NA}>{UIS_NA}</p>

function Sub({ title, first, children }: { title: string; first: boolean; children: ReactNode }) {
  return (
    <div className={first ? undefined : SUB_NEXT}>
      <h4 className={SUB_HEAD}>{title}</h4>
      {children}
    </div>
  )
}

// 이름 뒤에 작은 칸들. 첫 칸만 윗줄이 없다
function Subs({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <>
      {items.map(([title, body], i) => (
        <Sub key={title} title={title} first={i === 0}>
          {body}
        </Sub>
      ))}
    </>
  )
}

// 숫자 칸들(시안 .mk·.mk3): 이름 위 · 큰 숫자 + 작은 단위. 값이 없으면 '–'만. na에 든 이름은 값이 없을 때 '–' 아래 작은 글(의사랑 의원)
function Numbers({ cells, columns, flush = false, na }: { cells: readonly CellNumber[]; columns: 2 | 3; flush?: boolean; na?: ReadonlySet<string> }) {
  return (
    <div className={flush ? NUMS[columns] : `${NUMS_GAP} ${NUMS[columns]}`}>
      {cells.map((cell) => (
        <p key={cell.label} className={NUM_LABEL}>
          {cell.label}
          <strong className={NUM_VALUE}>
            {cell.value ?? DASH}
            {cell.value !== null && <small className={NUM_UNIT}>{cell.unit}</small>}
          </strong>
          {cell.value === null && na?.has(cell.label) === true && <span className={NUM_NA}>{UIS_NA}</span>}
        </p>
      ))}
    </div>
  )
}

function Alerts({ alerts }: { alerts: readonly CellAlert[] | null }) {
  if (alerts === null) return <Dash />
  if (alerts.length === 0) return <p className={NA}>{CALM}</p>
  return (
    <div className={ALERTS}>
      {alerts.map((alert, i) => (
        <p key={i} className={ALERT}>
          <span className={`font-semibold ${MARK_TONE[alert.kind]}`}>{alert.rate === null ? MARK[alert.kind] : `${MARK[alert.kind]} ${alert.rate}`}</span> {alert.text}
        </p>
      ))}
    </div>
  )
}

function Goal({ goal }: { goal: CompareStatsCells['summary']['goal'] }) {
  if (goal === null) return <p className={NA}>{NO_GOAL}</p>
  return (
    <>
      <p className={LINE}>
        <b className={STRONG}>{goal.rate ?? DASH}</b> · 목표 {goal.goal}
      </p>
      <div aria-hidden="true" className={GOAL_TRACK}>
        <i className={GOAL_FILL} style={{ width: `${goal.width}%` }} />
      </div>
    </>
  )
}

// 작은 세로 막대(시안 svg.mini): 칸마다 아래부터 accent(첫 값) · chart-3(둘째 값). 높이 = 칸 합 ÷ 가장 큰 칸 합
function Columns({ columns, height = 64 }: { columns: readonly (readonly number[])[]; height?: 64 | 48 }) {
  const max = Math.max(0, ...columns.map((column) => column.reduce((a, b) => a + b, 0)))
  return (
    <div aria-hidden="true" className={COLUMNS[height]}>
      {columns.map((column, i) => (
        <div key={i} className={COLUMN}>
          {column.map((value, j) => (
            <i key={j} className={`block shrink-0 ${j === 0 ? 'bg-accent' : 'bg-chart-3'}`} style={{ height: `${percentOf(value, max)}%` }} />
          ))}
        </div>
      ))}
    </div>
  )
}

function Axis({ from, to }: { from: string; to: string }) {
  return (
    <div className={AXIS}>
      <span>{from}</span>
      <span>{to}</span>
    </div>
  )
}

const ColumnsWithAxis = ({ cell }: { cell: CellColumns }) => (
  <>
    <Columns columns={cell.columns} />
    <Axis from={cell.from} to={cell.to} />
  </>
)

// 가로 막대 줄(시안 .hb): 이름 76px · 막대 · 값 52px
function Bars({ bars, tone }: { bars: readonly CellBar[] | null; tone: string }) {
  if (bars === null) return <Dash />
  return (
    <div className={BARS}>
      {bars.map((bar) => (
        <div key={bar.name} className={BAR_ROW}>
          <span className="truncate">{bar.name}</span>
          <i aria-hidden="true" className={`block h-2.5 ${tone}`} style={{ width: `${bar.width}%` }} />
          <b className={BAR_VALUE}>{bar.text}</b>
        </div>
      ))}
    </div>
  )
}

// 작은 표(시안 .mt): 첫 칸 굵은 이름, 나머지 오른쪽 맞춤, 줄 사이 1px(마지막 줄 빼고)
function Table({ rows }: { rows: readonly CellTableRow[] }) {
  return (
    <table className={TABLE}>
      <tbody>
        {rows.map((row, i) => {
          const line = i < rows.length - 1 ? ' border-b border-line' : ''
          return (
            <tr key={row.name}>
              <td className={`${TD_NAME}${line}`}>{row.name}</td>
              {row.cells.map((cell, j) => (
                <td key={j} className={`${TD}${line}`}>
                  {cell}
                </td>
              ))}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function Split({ split }: { split: CompareStatsCells['revenue']['split'] }) {
  if (split === null) return <Dash />
  return (
    <>
      <div aria-hidden="true" className={SPLIT}>
        {split.map((part) => (
          <i key={part.key} className={`block h-full ${SPLIT_TONE[part.key]}`} style={{ width: `${part.width}%` }} />
        ))}
      </div>
      <div className={LEGEND}>
        {split.map((part) => (
          <span key={part.key} className="inline-flex items-center gap-1">
            <i aria-hidden="true" className={`block size-2.5 ${SPLIT_TONE[part.key]}`} />
            {`${part.name} ${part.share}`}
          </span>
        ))}
      </div>
    </>
  )
}

function Heat({ hours }: { hours: CompareStatsCells['ops']['hours'] }) {
  if (hours === null) return <Dash />
  return (
    <>
      <div aria-hidden="true" className={HEAT}>
        {hours.levels.map((level, i) => (
          <i key={i} className={`block h-4.5 ${HEAT_TONE[level] ?? HEAT_TONE[0]}`} />
        ))}
      </div>
      <Axis from={hours.from} to={hours.to} />
    </>
  )
}

function Weekdays({ weekdays }: { weekdays: CompareStatsCells['ops']['weekdays'] }) {
  if (weekdays === null) return <Dash />
  return (
    <>
      <Columns columns={weekdays.values.map((value) => [value])} height={48} />
      <div className={AXIS_EACH}>
        {weekdays.names.map((name) => (
          <span key={name} className="flex-1 text-center">
            {name}
          </span>
        ))}
      </div>
    </>
  )
}

// 줄마다 작은 칸들(시안 sideCard 차례). 의사랑 의원은 셀 수 없는 칸이 작은 글
function rowBody(row: SideRowKey, cells: CompareStatsCells): ReactNode {
  const uis = cells.uis === true
  switch (row) {
    case 'summary':
      return (
        <Subs
          items={[
            ['환자 요약', <Numbers key="n" cells={cells.summary.patients} columns={2} />],
            ['매출 요약', <Numbers key="n" cells={cells.summary.revenue} columns={2} />],
            ['평소와 다른 것', <Alerts key="a" alerts={cells.summary.alerts} />],
            ['이번 달 목표', <Goal key="g" goal={cells.summary.goal} />],
          ]}
        />
      )
    case 'patients':
      return (
        <Subs
          items={[
            ['일별 내원', cells.patients.daily === null ? <Dash key="d" /> : <ColumnsWithAxis key="c" cell={cells.patients.daily} />],
            ['환자 구성', <Bars key="b" bars={cells.patients.age} tone="bg-accent" />],
            ['신환 재방문율', uis ? <UisNa key="u" /> : <Numbers key="n" cells={cells.patients.revisit} columns={3} />],
            ['몇 번까지 받나', uis ? <UisNa key="u" /> : <Bars key="b" bars={cells.patients.dropoff} tone="bg-cat-2" />],
          ]}
        />
      )
    case 'revenue': {
      const { trend } = cells.revenue
      return (
        <Subs
          items={[
            [
              '매출 추이',
              trend === null ? (
                <Dash key="d" />
              ) : (
                <>
                  <ColumnsWithAxis cell={trend.columns} />
                  <p className={LINE}>
                    합계 <b className={STRONG}>{trend.total}</b>
                  </p>
                </>
              ),
            ],
            ['급여·비급여·기타', <Split key="s" split={cells.revenue.split} />],
          ]}
        />
      )
    }
    case 'sunap':
      if (cells.sunap === null) return <p className={NA}>{NO_SUNAP}</p>
      return (
        <>
          <Numbers cells={cells.sunap} columns={3} flush na={uis ? UIS_NA_NUMBERS : undefined} />
          <p className={NOTE}>{SUNAP_NOTE}</p>
        </>
      )
    case 'calendar':
      if (cells.calendar === null) return <p className={NA}>{NO_CAL}</p>
      return <Numbers cells={cells.calendar} columns={2} flush />
    case 'rx':
      return (
        <Subs
          items={[
            [uis ? UIS_RX : '처방별 추세', <Bars key="b" bars={cells.rx.trend} tone="bg-chart-3" />],
            ['처방별 신환·재진', uis ? <UisNa key="u" /> : cells.rx.split === null ? <Dash key="d" /> : <Table key="t" rows={cells.rx.split} />],
          ]}
        />
      )
    case 'ops': {
      const { doctors, holiday } = cells.ops
      return (
        <Subs
          items={[
            [
              '원장님별',
              uis ? (
                <UisNa key="u" />
              ) : doctors === null ? (
                <Dash key="d" />
              ) : doctors === 'single' ? (
                <p key="p" className={NA}>
                  {ONE_DOCTOR}
                </p>
              ) : (
                <Table key="t" rows={doctors} />
              ),
            ],
            ['시간대별 접수', uis ? <UisNa key="u" /> : <Heat key="h" hours={cells.ops.hours} />],
            ['요일별 내원', <Weekdays key="w" weekdays={cells.ops.weekdays} />],
            ['휴일에 따라', holiday === null ? <Dash key="d" /> : <Table key="t" rows={holiday} />],
          ]}
        />
      )
    }
  }
}

/** 카드 틀: 맨 위 의원 이름(옅게) + 안쪽 */
export function CardFrame({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className={CARD}>
      <p className={WHO}>{name}</p>
      {children}
    </div>
  )
}

/** 의원 하나의 한 줄 카드. 그달 자료가 하나도 없으면 칸 전체 '자료 없음' */
export function CompareCard({ row, name, cells }: { row: SideRowKey; name: string; cells: CompareStatsCells }) {
  return <CardFrame name={name}>{cells.hasData ? rowBody(row, cells) : <p className={NA}>{NO_DATA}</p>}</CardFrame>
}
