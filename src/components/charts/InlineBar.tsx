import { percentOf } from './format'

// 표 줄 안 작은 막대 (b2b-redesign REQ-205 AC-205.7, design.md '차트 부품', UI_GUIDE '차트'). 그림은 승인 시안 docs/mockups/b2b-redesign/parts.mjs의 rxBar다.
// 꾸밈(aria-hidden)이다 — 값은 같은 줄의 숫자 칸이 글자로 준다. HTML 막대이고 inline style은 막대 width %·눈금 left %뿐이다.
// 감싸개 140×12 안에 이번 막대(accent, 높이 8px, 위 2px)와 지난 기간 눈금(faint, 2×12, 가운데 맞춤). 서버에서 그대로 그린다(훅·움직임 없음)

type Props = { current: number; previous: number | null; max: number }

// 값은 0~max로 자른다(percentOf). max가 0 이하이면 막대·눈금 없이 빈 감싸개만 자리를 지킨다(표 칸 폭이 흔들리지 않게)
export function InlineBar({ current, previous, max }: Props) {
  return (
    <span aria-hidden="true" className="relative block h-3 w-35 shrink-0">
      {max > 0 && (
        <>
          <span className="absolute top-0.5 left-0 h-2 bg-accent" style={{ width: `${percentOf(current, max)}%` }} />
          {previous !== null && (
            <span className="absolute top-0 h-3 w-0.5 -translate-x-1/2 bg-faint" style={{ left: `${percentOf(previous, max)}%` }} />
          )}
        </>
      )}
    </span>
  )
}
