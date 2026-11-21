import type { ReactNode } from 'react'
import { ds } from '@/components/ui/classes'
import { dateText, dateTimeText } from '@/lib/notices/view'
import { StopIcon } from './icons'

// 글 화면 칸들이 같이 쓰는 모양(specs/notices TASK-18, 승인 시안 docs/mockups/notices .sh·.area·.note·.help).
// 색·글자·모서리는 globals.css 토큰 클래스만 쓴다. 글은 모두 글자 노드로 그린다(HTML 해석 없음)

// 칸 제목(시안 .sh h2): subtitle 600 ink, 아이콘과 사이 6px
export const sectionTitle = `inline-flex items-center gap-1.5 ${ds.panelTitle}`

// 여러 줄 칸(시안 .area): 좌우 12px·위아래 10px·line-strong 테두리 → 초점 accent, 막힘(aria-invalid) negative, 막힘(disabled) canvas.
// 높이(min-h)는 놓는 자리가 하나만 더한다(묻기 88px · 메모 104px)
export const textareaClass =
  'block w-full min-w-0 resize-y rounded-control border border-line-strong bg-surface px-3 py-2.5 text-body text-ink placeholder:text-muted focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent focus-visible:outline-hidden aria-invalid:border-negative disabled:cursor-not-allowed disabled:bg-canvas disabled:text-muted'

// 도움 글(시안 .help): caption muted
export const helpText = ds.help

// 환자 정보 모양 막힘(시안 .note.ng): 제목 한 줄 + 고칠 방법. 묻기·메모가 같은 모양을 쓴다
export function BlockedNote({ title, body }: { title: string; body: string }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-control bg-negative-soft px-4 py-3 text-small">
      <StopIcon className="mt-0.5 text-negative" />
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-body font-semibold text-ink">{title}</p>
        <p className="text-ink-2">{body}</p>
      </div>
    </div>
  )
}

// 알림 한 줄(시안 .note.info·.note.ng): 아이콘 + 글
export function PlainNote({ tone, icon, role, children }: { tone: 'info' | 'negative'; icon: ReactNode; role: 'status' | 'alert'; children: ReactNode }) {
  const bg = tone === 'info' ? 'bg-accent-soft' : 'bg-negative-soft'
  return (
    <div role={role} className={`flex items-start gap-3 rounded-control px-4 py-3 text-small ${bg}`}>
      {icon}
      <p className="min-w-0 flex-1 text-ink-2">{children}</p>
    </div>
  )
}

// 날짜·시각 글자. 저장소가 모양을 다 보지 않은 칸이라 틀린 값이면 받은 글자를 그대로 둔다(화면이 깨지지 않게)
export function safeDateText(ymd: string): string {
  try {
    return dateText(ymd)
  } catch {
    return ymd
  }
}

export function safeDateTimeText(at: string): string {
  try {
    return dateTimeText(at)
  } catch {
    return at
  }
}
