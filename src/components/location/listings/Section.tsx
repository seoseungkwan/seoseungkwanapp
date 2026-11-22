import type { ReactNode } from 'react'
import { look } from './look'

// 묶음 하나(시안 section + .sh): 제목(h2, 수가 있으면 옆에) · 곁글. 묶음 이름이 영역 이름이다
export function Section({ title, count, aside, children }: { title: string; count?: number; aside?: string; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <div className={look.head}>
        <h2 className={look.title}>
          {title}
          {count !== undefined && <span className={look.count}>{count}</span>}
        </h2>
        {aside && <span className={look.aside}>{aside}</span>}
      </div>
      {children}
    </section>
  )
}

/** 새 창 표시(시안 ICON.ext) */
export function ExtIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M9 2.5h4.5V7M13.5 2.5 7 9M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3" />
    </svg>
  )
}
