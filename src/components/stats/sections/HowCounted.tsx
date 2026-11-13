'use client'

import { useId, useState, type ReactNode } from 'react'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'

// 접는 단추 · "어떻게 세나요?" 접는 설명 (stats-pc-ux REQ-4004·AC-4005.1, design.md 'sections/HowCounted.tsx', 시안 notes.md §5·§6(c)).
// 펼침은 이 부품의 React 상태뿐이다(처음 접힘, 주소·저장소에 넣지 않는다). 펼친 글 칸은 늘 그려 두고 접히면 hidden(aria-controls 대상이 늘 있다)

const HOW_LABEL = '어떻게 세나요?'
// 작은 글자 단추(시안 .mk-how-btn): ds.textButton의 글자 크기만 small로 바꿔 끼운다(같은 속성 클래스를 겹치지 않는다, classes.ts 머리말)
const SMALL_TEXT_BUTTON = ds.textButton.replace('text-body ', 'text-small ')
// 펼친 글 칸: 첫 글의 위 여백은 칸이 정한다(시안 .mk-how-body > :first-child)
const BODY_FIRST = '[&>:first-child]:mt-0'

// 글자 단추 + 꺾쇠(펼치면 180°). min-h-8, 휴대폰은 ds.textButton이 44px. small = 작은 글자(어떻게 세나요?), className = 놓는 자리(줄 안 차례 등)
export function FoldButton({
  label,
  open,
  controls,
  onClick,
  small = false,
  className = '',
}: {
  label: string
  open: boolean
  controls: string
  onClick(): void
  small?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onClick}
      className={`${small ? SMALL_TEXT_BUTTON : ds.textButton} min-h-8 ${className}`}
    >
      <span>{label}</span>
      <Icon name="chev" size={14} className={open ? 'rotate-180 transition' : 'transition'} />
    </button>
  )
}

// "어떻게 세나요?" 접는 설명. side를 주면 [어떻게 세나요?](왼쪽) · side(오른쪽 끝, 예: [표 복사]) 한 줄이고 펼친 글은 그 줄 아래.
// 768px 미만은 side가 먼저(줄 전체 폭) 오고 단추가 그 아래다(order). side가 없으면(null·false 포함) 단추 아래 펼친 글
export function HowCounted({ children, side }: { children: ReactNode; side?: ReactNode }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const hasSide = side !== undefined && side !== null && side !== false
  const button = (className?: string) => (
    <FoldButton small label={HOW_LABEL} open={open} controls={id} onClick={() => setOpen((now) => !now)} className={className} />
  )

  if (!hasSide) {
    return (
      <div className="mt-2">
        {button()}
        <div id={id} hidden={!open} className={`mt-1 ${BODY_FIRST}`}>
          {children}
        </div>
      </div>
    )
  }
  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        {button('max-md:order-2')}
        <div className="max-md:w-full">{side}</div>
      </div>
      <div id={id} hidden={!open} className={`mt-2 ${BODY_FIRST}`}>
        {children}
      </div>
    </div>
  )
}
