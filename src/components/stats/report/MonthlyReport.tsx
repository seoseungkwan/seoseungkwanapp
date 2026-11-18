import { formatCount, percentOf } from '@/components/charts/format'
import { SAME_AS_BEFORE, type MonthlyReportData, type ReportBar, type ReportBlock, type ReportCell, type ReportChange } from './reportData'

// 월간 보고서 종이 (stats-insights REQ-6108 AC-6108.1·AC-6108.2, 시안 docs/mockups/stats-insights ⑧ — 작은 미리보기 대신 화면에 실제 크기로).
// reportData가 만든 칸 목록을 글자로만 그린다. 인쇄([인쇄] → window.print)는 이 종이만 A4 세로로 나온다:
// 아래 인쇄 규칙(서식 화면의 @page처럼 이 부품이 붙어 있을 때만)이 종이·그 안·종이를 품은 바깥 틀 밖을 모두 가리고(다른 칸·단추·앱 틀)
// 바깥 틀의 여백·테두리·바탕을 없앤다. 규칙 글자에는 HTML로 바뀌는 글자(<·>·&)를 쓰지 않는다.
// 인쇄 쪽 폭(A4 − 여백 ≈ 700px)은 휴대폰 경계(768px)보다 좁아 max-md:가 인쇄에도 걸리므로 종이 안은 화면 폭 접두사를 쓰지 않는다

const PRINT_CSS = [
  '@media print {',
  '@page { size: A4 portrait; margin: 12mm; }',
  'body:has([data-print-report]) *:not([data-print-report], [data-print-report] *, :has([data-print-report])) { display: none !important; }',
  'body:has([data-print-report]) :has([data-print-report]) { margin: 0; padding: 0; border: 0; box-shadow: none; background: none; gap: 0; max-width: none; min-height: 0; }',
  '[data-print-report] { margin: 0; padding: 0; border: 0; max-width: none; -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
  '}',
].join(' ')

// 종이(시안 .paper): 흰 바탕 + 1px 선. 안에는 테두리 상자가 없다(UI_GUIDE 상자 안 상자 금지)
const PAPER = 'mt-4 max-w-200 border border-line-strong bg-surface p-6 text-body text-st-ink'
const TITLE = 'text-st-22 leading-8 font-semibold text-st-ink'
const SUB = 'mt-1 text-small text-st-muted'
const BLOCK = 'mt-6 break-inside-avoid'
const BLOCK_TITLE = 'border-b border-st-line pb-1 text-st-15 leading-6 font-semibold text-st-ink'
const CELLS = 'mt-3 flex flex-wrap gap-x-12 gap-y-3'
const CELL_VALUE = 'text-st-22 leading-8 font-semibold text-st-ink tabular-nums'
const CELL_NAME = 'text-small text-st-muted'
const ITEMS = 'mt-2 flex list-none flex-wrap gap-x-6 gap-y-1 text-st-ink-2 tabular-nums'
const CHANGES = 'mt-2 grid list-none gap-1 text-st-ink-2 tabular-nums'
const MARK = { up: 'text-positive', down: 'text-negative' } as const
const MARK_TEXT = { up: '▲', down: '▼' } as const
// 내원 흐름 막대(시안 .bars): 달마다 숫자 · 막대 · 달. 고른 달만 accent
const BARS_SCROLL = 'mt-3 overflow-x-auto'
const BARS = 'grid min-w-105 list-none grid-cols-12 items-end gap-1'
const BAR_TRACK = 'mt-1 flex h-20 w-full items-end'

function Cells({ cells }: { cells: readonly ReportCell[] }) {
  return (
    <dl className={CELLS}>
      {cells.map((cell) => (
        <div key={cell.name} className="flex flex-col-reverse">
          <dt className={CELL_NAME}>{cell.name}</dt>
          <dd className={CELL_VALUE}>{cell.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function Items({ items }: { items: readonly string[] }) {
  return (
    <ul className={ITEMS}>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}

function Changes({ changes }: { changes: readonly ReportChange[] }) {
  if (changes.length === 0) return <p className="mt-2 text-st-ink-2">{SAME_AS_BEFORE}</p>
  return (
    <ul className={CHANGES}>
      {changes.map((change) => (
        <li key={change.text} className="flex items-baseline gap-1.5">
          <span aria-hidden="true" className={`font-semibold ${MARK[change.dir]}`}>
            {MARK_TEXT[change.dir]}
          </span>
          <span>{change.text}</span>
        </li>
      ))}
    </ul>
  )
}

function Bars({ bars }: { bars: readonly ReportBar[] }) {
  const max = Math.max(0, ...bars.map((bar) => bar.value ?? 0))
  return (
    <div className={BARS_SCROLL}>
      <ol className={BARS}>
        {bars.map((bar) => (
          <li key={bar.month} className="flex min-w-0 flex-col items-center">
            <span className="text-caption text-st-muted tabular-nums">{bar.value === null ? '–' : formatCount(bar.value)}</span>
            <span aria-hidden="true" className={BAR_TRACK}>
              <span data-bar className={`block w-full ${bar.picked ? 'bg-accent' : 'bg-st-line-2'}`} style={{ height: `${percentOf(bar.value ?? 0, max)}%` }} />
            </span>
            <span className={`mt-1 text-caption ${bar.picked ? 'font-semibold text-st-ink' : 'text-st-muted'}`}>{bar.label}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function Body({ block }: { block: ReportBlock }) {
  switch (block.key) {
    case 'summary':
    case 'value':
      return <Cells cells={block.cells} />
    case 'changes':
      return <Changes changes={block.changes} />
    case 'trend':
      return <Bars bars={block.bars} />
    default:
      return <Items items={block.items} />
  }
}

export function MonthlyReport({ data }: { data: MonthlyReportData }) {
  return (
    <>
      <style>{PRINT_CSS}</style>
      <article data-print-report="" aria-label={data.title} className={PAPER}>
        <h4 className={TITLE}>{data.title}</h4>
        <p className={SUB}>{data.sub}</p>
        {data.blocks.map((block) => (
          <section key={block.key} className={BLOCK}>
            <h5 className={BLOCK_TITLE}>{block.title}</h5>
            <Body block={block} />
          </section>
        ))}
      </article>
    </>
  )
}
