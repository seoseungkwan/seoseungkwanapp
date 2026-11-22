'use client'

import { useEffect, useRef } from 'react'
import { Icon } from '@/components/common/Icon'
import { METHOD } from '@/lib/location/method'
import { look } from './look'
import { MethodContent, type MethodCardProps } from './MethodCard'
import { CLOSE } from './text'

// [분석 방법] 오른쪽 판(spec location AC-7920.1, 시안 ?s=method의 .drawer.wide 760px): 머리 제목 + × · 처음 안내와 같은 몸 · 판 아래 글 + [닫기].
// [닫기]·Esc·가림막으로 닫고, [근거와 출처 모두 보기](와 예시 출처 줄)는 판을 닫은 뒤 근거와 출처로 간다.
// 열면 판 안으로 초점을 옮기고, 닫으면 연 단추로 돌려준다. 열림은 부르는 쪽이 쥔다(open)

export type MethodPanelProps = MethodCardProps & {
  open: boolean
  onClose: () => void
}

export function MethodPanel({ open, onClose, ...card }: MethodPanelProps) {
  const box = useRef<HTMLElement>(null)
  // Esc가 늘 지금 onClose를 부르게(부르는 쪽이 그릴 때마다 새 함수를 줘도 초점을 다시 옮기지 않음)
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  })

  useEffect(() => {
    if (!open) return
    const back = document.activeElement instanceof HTMLElement ? document.activeElement : null
    box.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close.current()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      back?.focus()
    }
  }, [open])

  if (!open) return null
  return (
    <>
      <div data-testid="method-scrim" aria-hidden="true" className={look.scrim} onClick={onClose} />
      <aside ref={box} role="dialog" aria-modal="true" aria-label={METHOD.button} tabIndex={-1} className={look.panel}>
        <div className={look.panelHead}>
          <h2 className={look.panelTitle}>
            {METHOD.title}
          </h2>
          <button type="button" aria-label={CLOSE} className={look.iconButton} onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className={look.panelBody}>
          <MethodContent {...card} inPanel beforeLeave={onClose} />
        </div>
        <div className={look.panelFoot}>
          <p className={look.panelNote}>{METHOD.panelNote}</p>
          <button type="button" className={look.button} onClick={onClose}>
            {CLOSE}
          </button>
        </div>
      </aside>
    </>
  )
}
