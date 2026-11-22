import { useId } from 'react'
import { ds } from '@/components/ui/classes'

// 묶음마다 '이렇게 봤어요'(시안 ?s=candidate .how, AC-7920.2): 묶음 제목 바로 아래 한 줄
// `이렇게 봤어요 {무엇을 봤나} · {어떻게 셌나} · {왜 중요한가}` + 근거 칩 + [더 보기]/[접기], 펼치면 네 줄(무엇을 봤나·어떻게 셌나·왜 중요한가·근거).
// 글은 만들지 않는다 — 부르는 묶음이 method.ts `HOW` 글을 `fillHow`로 채워 넘긴 글만 그린다.
// 펼침도 제 상태로 두지 않는다(props) — 범위를 바꿔 다시 그려도 부르는 쪽이 쥔 값 그대로다

/** 근거 칩(design.md 19절): 연구 근거 · 법 근거 · 법 근거 + 흔히 보는 기준(칩 둘) · 흔히 보는 기준 */
export type HowChip = 'research' | 'law' | 'law-common' | 'common'

type Tone = 'accent' | 'neutral'

// 연구·법 = 파란 칩, 흔히 보는 기준 = 회색 칩
const CHIPS: Readonly<Record<HowChip, readonly (readonly [Tone, string])[]>> = {
  research: [['accent', '연구 근거']],
  law: [['accent', '법 근거']],
  'law-common': [
    ['accent', '법 근거'],
    ['neutral', '흔히 보는 기준'],
  ],
  common: [['neutral', '흔히 보는 기준']],
}

const HEAD = '이렇게 봤어요'
const MORE = '더 보기'
const LESS = '접기'
const ROWS = [
  ['what', '무엇을 봤나'],
  ['how', '어떻게 셌나'],
  ['why', '왜 중요한가'],
  ['basis', '근거'],
] as const

// 시안 .how(13px/20px · ink-2 · 위 8px · 폭 980px까지) · .how-l .tbtn(20px · 좌우 2px · 왼쪽 4px) · .how-more(위 선 · 줄마다 104px 이름 | 글, 아래 선)
const WRAP = 'mt-2 max-w-[980px] text-small text-ink-2'
const TOGGLE = `ml-1 inline-flex h-5 cursor-pointer items-center rounded-control px-0.5 text-small font-medium text-accent underline-offset-3 transition hover:underline ${ds.focusRing}`
const LIST = 'm-0 mt-2 border-t border-line'
const ROW = 'grid grid-cols-[104px_minmax(0,1fr)] gap-x-3 gap-y-0.5 border-b border-line py-1.5'

export type HowLineProps = {
  chip: HowChip
  /** 한 줄 세 조각(채운 글) */
  line: { what: string; how: string; why: string }
  /** [더 보기] 네 줄(채운 글) */
  more: { what: string; how: string; why: string; basis: string }
  /** 펼쳤나 — 부르는 쪽이 쥔다 */
  open: boolean
  /** [더 보기]/[접기]를 누르면 */
  onToggle: () => void
}

export function HowLine({ chip, line, more, open, onToggle }: HowLineProps) {
  const listId = useId()
  return (
    <div className={WRAP}>
      <p>
        <b className="mr-1 font-semibold text-ink">{HEAD}</b> {line.what}
        <Sep />
        {line.how}
        <Sep />
        {line.why}
        {CHIPS[chip].map(([tone, label]) => (
          <span key={label} data-chip={tone} className={`ml-1.5 ${ds.chip[tone]}`}>
            {label}
          </span>
        ))}
        <button type="button" className={TOGGLE} aria-expanded={open} aria-controls={listId} onClick={onToggle}>
          {open ? LESS : MORE}
        </button>
      </p>
      <dl id={listId} className={LIST} hidden={!open}>
        {ROWS.map(([key, name]) => (
          <div key={key} className={ROW}>
            <dt className="text-muted">{name}</dt>
            <dd className="m-0 min-w-0 text-ink">{more[key]}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

// 조각 사이 ` · `(시안 .sep — 좌우 2px, 흐린 글)
function Sep() {
  return <span className="mx-0.5 text-muted"> · </span>
}
