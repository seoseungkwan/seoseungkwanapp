import Link from 'next/link'
import type { MouseEvent, ReactNode } from 'react'
import { NO_LAW_TEXT, type CheckItem, type CheckValue } from '@/lib/location/checklist'
import { lawOf } from '@/lib/location/sources'
import { look } from './look'

// 개원 준비(점검·사진·메모) 부품이 같이 쓰는 작은 조각: 묶음 머리 · 법 근거 링크 · 체크 칸 줄 · 그림 둘(시안 ICON.ext·camera)

export function SectionHead({ id, title, aside }: { id: string; title: string; aside?: ReactNode }) {
  return (
    <div className={look.head}>
      <h2 id={id} className={look.h2}>
        {title}
      </h2>
      {aside !== undefined && <span className={look.aside}>{aside}</span>}
    </div>
  )
}

const plainClick = (e: MouseEvent) => e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey

/** '근거와 출처'의 그 법 줄(TASK-28 `#law-<id>`) */
export const lawHref = (id: string) => `/location?tab=sources#law-${id}`

/**
 * 법 근거 링크(시안 lawLink): 글은 LAW_BASIS 이름, 누르면 '근거와 출처'의 그 법 줄로 간다.
 * 여는 콜백(onOpen)을 주면 그냥 누를 때 주소 이동 대신 그 콜백을 부른다(새 탭 누르기는 그대로 — SourceLine과 같음).
 * 법이 없는 줄(law null)이나 LAW_BASIS에 없는 id는 noLaw가 참이면 `법 기준 없음` 글, 아니면 아무것도 그리지 않는다
 */
export function LawLink({ law, onOpen, noLaw = false }: { law: string | null; onOpen?: (id: string) => void; noLaw?: boolean }) {
  const basis = law === null ? undefined : lawOf(law)
  if (basis === undefined) return noLaw ? <span className={look.muted}>{NO_LAW_TEXT}</span> : null
  const onClick = onOpen
    ? (e: MouseEvent<HTMLAnchorElement>) => {
        if (!plainClick(e)) return
        e.preventDefault()
        onOpen(basis.id)
      }
    : undefined
  return (
    <Link href={lawHref(basis.id)} prefetch={false} className={look.lawLink} onClick={onClick}>
      {basis.topic}
    </Link>
  )
}

/** 체크 칸 한 줄(시안 .cklist label): 켬 = yes · 끔 = unknown. 법 id가 있으면 줄 끝에 법 근거 링크(라벨 밖) */
export function CheckRow({
  item,
  value,
  onToggle,
  onOpenLaw,
}: {
  item: CheckItem
  value: CheckValue
  onToggle: (id: string, on: boolean) => void
  onOpenLaw?: (id: string) => void
}) {
  const on = value === 'yes'
  return (
    <div className={look.checkRow}>
      <label className={on ? look.checkLabelOn : look.checkLabel}>
        <span className={look.checkWrap}>
          <input type="checkbox" className={look.checkbox} checked={on} onChange={(e) => onToggle(item.id, e.currentTarget.checked)} />
          <CheckMarkIcon />
        </span>
        <span>{item.label}</span>
      </label>
      <LawLink law={item.law} onOpen={onOpenLaw} />
    </div>
  )
}

function CheckMarkIcon() {
  return (
    <svg aria-hidden="true" className={look.checkMark} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8.2 6.8 11 12 5.5" />
    </svg>
  )
}

export function ExternalIcon() {
  return (
    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" className="shrink-0">
      <path d="M9 2.5h4.5V7M13.5 2.5 7 9M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3" />
    </svg>
  )
}

export function CameraIcon() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className="shrink-0">
      <path d="M2 5.2h2.6L5.8 3.5h4.4l1.2 1.7H14v8H2z" />
      <circle cx="8" cy="9" r="2.4" />
    </svg>
  )
}
