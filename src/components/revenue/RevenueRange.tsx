import { ds } from '@/components/ui/classes'
import { STRONG } from './RevenueParts'

// 매출 가져올 기간 부품 (revenue-load-range TASK-3, REQ-3501·3502, 시안 docs/mockups/revenue-load-range #picker·#doneBox·#stopped).
// 받는 값은 글·불·콜백뿐이다. 글은 range.ts가 만들고 화면(RevenueScreen)이 넘긴다

type Span = { key: string; name: string }
type PanelProps = { spans: Span[]; selected: string; onSelect(key: string): void; hint: string; disabled: boolean; onLoad(): void }

// 연한 바탕 띠(테두리 없음, 안의 묶음이 상자 안 상자가 되지 않게). 폰은 묶음·단추가 전체 폭으로 한 줄씩
const PANEL = 'mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-control bg-canvas px-5 py-4 max-md:px-4 max-md:py-3'

/** '가져올 기간' 칸: 기간 단추 묶음 · [비트에서 가져오기] · 그 아래 안내 줄. 남은 달이 없으면(disabled) 가져오기가 막힌다 */
export function LoadRangePanel({ spans, selected, onSelect, hint, disabled, onLoad }: PanelProps) {
  return (
    <div className={PANEL}>
      <span className="text-small font-semibold text-ink">가져올 기간</span>
      <div role="group" aria-label="가져올 기간" className={`${ds.segment.group} max-md:grid-cols-3`}>
        {spans.map(({ key, name }) => (
          <button
            key={key}
            type="button"
            aria-pressed={key === selected}
            className={`${ds.segment.button} ${key === selected ? ds.segment.on : ds.segment.off}`}
            onClick={() => onSelect(key)}
          >
            {name}
          </button>
        ))}
      </div>
      <button type="button" disabled={disabled} className={`${ds.button.primary} max-md:w-full`} onClick={onLoad}>
        비트에서 가져오기
      </button>
      <p className="basis-full text-small text-ink-2">{hint}</p>
    </div>
  )
}

/** 고른 기간을 다 가져온 뒤 알림: 굵은 첫 줄 + 둘째 줄 */
export function RangeDoneNotice({ lead, rest }: { lead: string; rest: string }) {
  return (
    <div role="status" className="mt-4 rounded-control bg-positive-soft px-4 py-3 text-body text-ink-2">
      <p>
        <strong className={STRONG}>{lead}</strong>
      </p>
      <p>{rest}</p>
    </div>
  )
}

/** 가져오다 멈췄을 때 오류 카드 아래 한 줄 */
export function RangeStoppedLine({ text }: { text: string }) {
  return <p className="mt-3 text-body text-ink-2">{text}</p>
}
