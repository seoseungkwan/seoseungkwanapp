import { STRONG } from './RevenueParts'
import type { TreatmentRow } from './view'

// 치료별 순위 막대 (TASK-9, 시안 gen.py treat(), UI_GUIDE '순위 막대'). 훅이 없는 순수 부품이다. 막대 폭만 % inline style이고 막대는 꾸밈(aria-hidden)이다. 글자가 곧 정보다.
// 금액·몫·건수를 같이 보여서 components/charts의 RankedBars(값 하나)를 쓰지 못한다.
// PC: 이름 140 · 막대(남는 폭) · 값 280 한 줄. 폰: 이름·값 한 줄 + 막대 아래 줄, 건수는 숨김
export function TreatmentBars({ rows }: { rows: TreatmentRow[] }) {
  return (
    <ol className="mt-3 border-t border-line">
      {rows.map((row) => (
        <li key={row.name} className="flex min-h-12 flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-line py-2 md:flex-nowrap">
          <span className="min-w-0 flex-1 text-body font-medium text-ink-2 md:w-35 md:flex-none">{row.name}</span>
          <span aria-hidden="true" className="order-last block h-2.5 w-full md:order-none md:w-auto md:min-w-0 md:flex-1">
            <span className={`block h-full ${row.rest ? 'bg-line-strong' : 'bg-accent'}`} style={{ width: `${row.width}%` }} />
          </span>
          <span className="flex shrink-0 items-baseline justify-end gap-2 text-small whitespace-nowrap text-muted tabular-nums md:w-70 md:gap-3">
            <strong className={STRONG}>{row.amount}</strong>
            <span>{row.share}</span>
            <span className="max-md:hidden">{row.detail}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}
