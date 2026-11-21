'use client'

import { useEffect, useId, useRef, type MouseEvent, type ReactNode } from 'react'
import { ds } from '@/components/ui/classes'
import { Segment } from '../schedule/parts'

// 휴가 화면의 떠 있는 칸 틀(시안 leave.html ③ 휴가 넣기 · ⑤ 연차 규칙 .panel): 제목 + × 닫기, 그 아래 내용.
// 가림막(ai-report RedoDialog와 같은 bg-ink/36)을 누르거나 Esc를 누르면 닫는다. 긴 칸은 가림막 안에서 위아래로 밀린다.
// 열리면 초점이 칸으로 옮겨 가 화면 읽기·키보드가 칸부터 읽는다. 폰 전용 모양은 없다(좁으면 좌우 16px만 남기고 같은 칸)

export function LeaveDialog({ title, onClose, children }: { title: string; onClose(): void; children: ReactNode }) {
  const titleId = useId()
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => box.current?.focus(), [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // 가림막 자신을 눌렀을 때만 닫는다(칸 안에서 올라온 누름은 target이 다르다)
  const closeOnBackdrop = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose()
  }

  return (
    <div onClick={closeOnBackdrop} className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-ink/36 px-4 py-12">
      <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} className={`${ds.layer} grid w-full max-w-140 gap-4 p-5 outline-hidden`}>
        <div className="flex items-center justify-between gap-2">
          <h2 id={titleId} className="text-subtitle font-semibold text-ink">
            {title}
          </h2>
          <button type="button" aria-label="닫기" onClick={onClose} className={ds.button.ghostSmall}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/**
 * 고르기 단추 묶음(종류·하루/여러 날·오전/오후·유급/무급): 눌린 것은 aria-pressed.
 * 틀은 근무표·명단과 같은 PC 틀(schedule/parts Segment) — 폰 전용 칸 나눔이 없다(AC-7611.4)
 */
export function Choice<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: readonly { value: T; text: string }[]
  value: T
  onChange(value: T): void
}) {
  return <Segment label={label} options={options.map((option) => [option.value, option.text] as const)} value={value} onChange={onChange} />
}
