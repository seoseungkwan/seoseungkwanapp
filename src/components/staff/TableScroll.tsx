import type { ReactNode } from 'react'
import { ds } from '@/components/ui/classes'

// 넓은 표·달력을 감싸는 칸 (staff AC-7611.4, design.md 6절 '공용'). 폰 전용 모양은 만들지 않는다 —
// 화면이 좁으면 이 칸만 옆으로 밀리고 페이지는 밀리지 않는다(min-w-0·max-w-full).
// 키보드로도 밀 수 있게 초점을 받는 이름 있는 영역이다
export function TableScroll({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="region" aria-label={label} tabIndex={0} className={`min-w-0 max-w-full overflow-x-auto rounded-control ${ds.focusRing}`}>
      {children}
    </div>
  )
}
