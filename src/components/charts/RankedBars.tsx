import { formatCount, formatRate, percentOf } from './format'

// 순위 막대 (b2b-redesign REQ-205 AC-205.6, design.md '차트 부품', UI_GUIDE '차트'·'순위 막대'). 그림은 승인 시안 docs/mockups/b2b-redesign/parts.mjs의 regionsChart다.
// HTML 막대다: 막대 폭만 % inline style(width)이고 글자는 HTML 글자라 칸 폭이 바뀌어도 크기가 그대로다.
// 보이는 글자(이름·값·몫)가 곧 정보이고 막대는 꾸밈(aria-hidden)이다. 상자가 아니다(테두리 없음). 서버에서 그대로 그린다(훅·움직임 없음)

export type RankedItem = { name: string; value: number; rest?: boolean } // rest = '그 밖'·'주소 없음'

type Props = { title: string; unit: string; items: RankedItem[]; showShare?: boolean }

// 줄(32px) = 이름 칸 80px · 막대 칸(남는 폭) · 값 칸(몫까지 88px 이상, 값만 56px 이상), 사이 8px. 시안처럼 막대는 이름 뒤 88px에서 시작해 오른쪽 끝 96px 앞에서 끝난다.
// 이름 칸과 값 칸 폭이 줄마다 같아야 막대 길이를 서로 견줄 수 있다

// rest 아닌 항목이 값 큰 순(같으면 받은 순서 — sort는 안정 정렬), 그 뒤 rest 항목이 받은 순서. 받은 배열은 바꾸지 않는다
const rank = (items: RankedItem[]) => [
  ...items.filter((item) => !item.rest).sort((a, b) => b.value - a.value),
  ...items.filter((item) => item.rest),
]

export function RankedBars({ title, unit, items, showShare = false }: Props) {
  // 막대 폭은 rest 아닌 최대 값 대비(최대가 0이면 percentOf가 모두 0%). 몫은 rest까지 더한 전체 합 대비
  const max = Math.max(0, ...items.filter((item) => !item.rest).map((item) => item.value))
  const total = items.reduce((sum, item) => sum + item.value, 0)

  return (
    <ol aria-label={title}>
      {rank(items).map((item, i) => (
        <li key={i} className="flex h-8 items-center gap-2">
          <span className={`w-20 shrink-0 truncate text-small ${item.rest ? 'text-muted' : 'text-ink-2'}`}>{item.name}</span>
          <div aria-hidden="true" className="min-w-0 flex-1">
            <div
              className={`h-2.5 ${item.rest ? 'bg-line-strong' : 'bg-accent'}`}
              style={{ width: `${percentOf(item.value, max)}%` }}
            />
          </div>
          <span className={`flex shrink-0 items-baseline justify-end gap-1.5 whitespace-nowrap ${showShare ? 'min-w-22' : 'min-w-14'}`}>
            <span className="text-small font-semibold text-ink tabular-nums">
              {formatCount(item.value)}
              {unit}
            </span>
            {showShare && (
              <span className="text-small text-muted tabular-nums">{formatRate(total > 0 ? item.value / total : 0)}%</span>
            )}
          </span>
        </li>
      ))}
    </ol>
  )
}
