import { useId, useRef } from 'react'
import { ds } from '@/components/ui/classes'
import { isLightAccent } from '@/lib/forms/themes'

// 휴진 안내 만들기 '배경' 칸 맨 아래 '글자 색' 칸 (specs/forms-accent REQ-4701, design.md 7-1절, 승인 시안 docs/mockups/forms-accent/screen.html).
// 묶음 [자동]·[직접 고르기] + 색 고르기 칸(<input type="color">)과 지금 색 글, 도움말, 옅은 색 경고(막지 않는다).
// 글자 색 값(accent, null = 자동)은 부르는 쪽 상태에 있고, 바꾸면 새 값을 onAccent로 보낸다.
// 앱 화면 색은 토큰과 ds만 쓴다. 사용자가 고른 색 값은 색 칸 value로만 쓴다

const WARN = '옅은 색이라 흰 글자·흰 카드 위 글이 잘 안 보일 수 있어요'
// 색 칸: 44×32px·안쪽 2px·1px line-strong(시안 .swatch input)
const COLOR_INPUT = `h-8 w-11 shrink-0 cursor-pointer rounded-control border border-line-strong bg-surface p-0.5 ${ds.focusRing}`

type Props = {
  month: number // 안내 달 — 도움말 'N월'
  accent: string | null // 직접 고른 글자 색('#' + 소문자 16진수 6자리). null = 자동
  autoAccent: string // 자동일 때 쓰이는 색(미리보기의 배경 강조색 또는 테마 강조색)
  onAccent: (accent: string | null) => void
}

export function AccentPicker({ month, accent, autoAccent, onAccent }: Props) {
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const own = accent !== null
  const pick = (value: string) => onAccent(value.toLowerCase())

  // 자동일 때만: 지금 자동 색에서 시작하고 색 고르기 창을 연다(열 수 없는 브라우저는 색만 바꾼다 — 색 칸을 눌러 고른다)
  function chooseOwn() {
    if (own) return
    onAccent(autoAccent)
    try {
      inputRef.current?.showPicker?.()
    } catch {
      // showPicker가 없거나 막힌 브라우저(jsdom 포함)
    }
  }

  const items: readonly [boolean, string, () => void][] = [
    [false, '자동', () => onAccent(null)],
    [true, '직접 고르기', chooseOwn],
  ]

  return (
    <div className={`${ds.field} mt-4`}>
      <span id={`${id}-title`} className={ds.label}>
        글자 색
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-labelledby={`${id}-title`} className={`${ds.segment.group} max-md:grid-cols-2`}>
          {items.map(([on, name, onClick]) => (
            <button
              key={name}
              type="button"
              aria-pressed={own === on}
              className={`${ds.segment.button} ${own === on ? ds.segment.on : ds.segment.off}`}
              onClick={onClick}
            >
              {name}
            </button>
          ))}
        </div>
        <label className={`inline-flex cursor-pointer items-center gap-2 ${own ? '' : 'opacity-50'}`}>
          <input
            ref={inputRef}
            type="color"
            aria-label="글자 색 고르기"
            className={COLOR_INPUT}
            value={accent ?? autoAccent}
            onChange={(e) => pick(e.target.value)}
            onInput={(e) => pick(e.currentTarget.value)}
          />
          <span className="text-caption text-ink tabular-nums">{own ? accent : `자동 ${autoAccent}`}</span>
        </label>
      </div>
      <p className={ds.help}>{`'${month}월'·날짜 띠·카드 아래 글이 이 색이에요. 자동은 테마·배경에 맞춰 골라요`}</p>
      {own && isLightAccent(accent) && <p className="text-small text-warning">{WARN}</p>}
    </div>
  )
}
