import type { TreatmentRow } from './types'

// 치료별 순위 막대 (TASK-9, 시안 gen.py treat(), UI_GUIDE '순위 막대'). 훅이 없는 순수 부품이다. 막대 폭만 % inline style이고 막대는 꾸밈(aria-hidden)이다. 글자가 곧 정보다.
// 금액·몫·건수를 같이 보여서 components/charts의 RankedBars(값 하나)를 쓰지 못한다.
// first90 AC-4408.5(시안 docs/mockups/first90/redesign.html .s-rank): 처방 카드와 같은 가로 막대 순위 줄이다. 줄 높이 56px 이상, 이름 600 · 금액은 크게(18px 600),
// 몫·건수는 ink-2. 막대 폭은 기간을 바꾸면 300ms 움직인다(AC-4417.2, globals.css st-move-period). 내용(이름·금액·몫·처방 n번)은 지금 그대로다.
// PC: 이름 200 · 막대(남는 폭) · 값 280 한 줄. 폰: 이름·값 한 줄 + 막대 아래 줄, 건수는 숨김
export function TreatmentBars({ rows }: { rows: TreatmentRow[] }) {
  return (
    <ol className="mt-3 border-t border-line">
      {rows.map((row) => (
        <li key={row.name} className="flex min-h-14 flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-line py-2 md:flex-nowrap">
          <span className="min-w-0 flex-1 text-body font-semibold text-st-ink md:w-50 md:flex-none">{row.name}</span>
          <span aria-hidden="true" className="order-last block h-2.5 w-full md:order-none md:w-auto md:min-w-0 md:flex-1">
            <span className={`st-move-period block h-full ${row.rest ? 'bg-line-strong' : 'bg-accent'}`} style={{ width: `${row.width}%` }} />
          </span>
          <span className="flex shrink-0 items-baseline justify-end gap-2 text-small whitespace-nowrap text-st-ink-2 tabular-nums md:w-70 md:gap-3">
            <strong className="text-st-18 leading-7 font-semibold text-st-ink tabular-nums">{row.amount}</strong>
            <span>{row.share}</span>
            <span className="max-md:hidden">{row.detail}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}
