'use client'

import { useEffect, useId, useRef, type ChangeEvent, type MouseEvent, type ReactNode } from 'react'
import { ds } from '@/components/ui/classes'

// 설정 화면 작은 부품(시안 sunap.html .sec·.frow·.field·.hint·.chip·.box·.dlg). 색·글자·모서리는 globals.css 토큰만 쓴다.
// PC 화면만(폰 전용 모양 없음 — 사용자 규칙). 넓은 표는 표 칸 안에서만 옆으로 밀린다

/** 시안 .field(36px) — 넓이는 놓는 자리가 준다 */
export const FIELD =
  'h-9 min-w-0 rounded-control border border-line-strong bg-surface px-2.5 text-body text-ink placeholder:text-muted not-disabled:hover:border-muted focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent focus-visible:outline-hidden disabled:cursor-not-allowed disabled:bg-canvas disabled:text-muted'
export const FIELD_WIDE = `${FIELD} w-full`
/** 시안 .field.s(64px) · .field.m(96px) — 가운데 정렬 */
export const FIELD_S = `${FIELD} w-16 text-center`
export const FIELD_M = `${FIELD} w-24 text-center`
/** 시안 .field.w — 줄 안에서 남은 폭(가장 좁아도 240px) */
export const FIELD_GROW = `${FIELD} min-w-60 flex-1`
/** 시안 .hint */
export const HINT = 'text-caption text-muted'
/** 시안 .line */
export const LINE = 'flex flex-wrap items-center gap-x-2 gap-y-1.5 text-small'
/** 시안 .sel */
export const SELECT =
  'h-8 min-w-20 rounded-control border border-line-strong bg-surface px-2.5 text-small text-ink focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent focus-visible:outline-hidden'
/** 시안 .rule */
export const RULE = 'inline-flex h-6 items-center rounded-control border border-line bg-canvas px-2 text-caption font-medium text-ink-2'

/** 칸 묶음 하나(시안 .sec) — 머리(제목 + 작은 글)·몸. 목차가 가리키는 id */
export function Section({ id, title, small, children }: { id: string; title: string; small: string; children: ReactNode }) {
  return (
    <section id={id} aria-label={title} className="scroll-mt-3 rounded-control border border-line bg-surface">
      <h3 className="flex items-center gap-2 border-b border-line px-5 py-3 text-subtitle font-semibold text-ink">
        {title} <small className="text-caption font-medium text-muted">{small}</small>
      </h3>
      <div className="px-5 pt-1.5 pb-3">{children}</div>
    </section>
  )
}

/**
 * 한 줄(시안 .frow): 왼쪽 이름 168px · 오른쪽 값. 줄 전체가 이름을 가진 묶음(group)이고,
 * htmlFor를 주면 이름이 그 칸의 label이 된다
 */
export function Row({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  const labelId = useId()
  const name = htmlFor ? (
    <label id={labelId} htmlFor={htmlFor} className="pt-2 text-body font-medium text-ink-2">
      {label}
    </label>
  ) : (
    <div id={labelId} className="pt-2 text-body font-medium text-ink-2">
      {label}
    </div>
  )
  return (
    <div role="group" aria-labelledby={labelId} className="grid grid-cols-[168px_minmax(0,1fr)] items-start gap-x-4 gap-y-1.5 border-b border-canvas py-2.5 last:border-b-0">
      {name}
      <div className="grid min-w-0 gap-1.5">{children}</div>
    </div>
  )
}

/** 체크 상자 + 이름(+ 풀이). 이름만 접근 이름이고 풀이는 설명으로 잇는다 */
export function Check({
  name,
  detail,
  checked,
  onChange,
  disabled,
  label = true,
}: {
  name: string
  detail?: string
  checked: boolean
  onChange: (on: boolean) => void
  disabled?: boolean
  /** 거짓이면 이름을 그리지 않고 aria-label로만 둔다(시안 '저녁 마지막 넣기' 상자) */
  label?: boolean
}) {
  const nameId = useId()
  const detailId = useId()
  const box = (
    <span className={ds.checkboxWrap}>
      <input
        type="checkbox"
        className={ds.checkbox}
        checked={checked}
        disabled={disabled}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.checked)}
        {...(label ? { 'aria-labelledby': nameId } : { 'aria-label': name })}
        aria-describedby={detail ? detailId : undefined}
      />
      <svg aria-hidden="true" viewBox="0 0 16 16" className={ds.checkboxMark} fill="none" stroke="currentColor" strokeWidth="2">
        <path d="m4 8.5 2.5 2.5L12 5.5" />
      </svg>
    </span>
  )
  if (!label) return box
  return (
    <label className="flex cursor-pointer items-start gap-2 text-body text-ink">
      <span className="pt-0.5">{box}</span>
      <span>
        <span id={nameId}>{name}</span>
        {detail ? (
          <small id={detailId} className="block text-caption text-muted">
            {detail}
          </small>
        ) : null}
      </span>
    </label>
  )
}

/** 동그라미 고르기 하나(시안 .opt .rd). 이름만 접근 이름, 풀이는 설명 */
export function Radio({ group, name, detail, checked, onChange }: { group: string; name: string; detail: string; checked: boolean; onChange: () => void }) {
  const nameId = useId()
  const detailId = useId()
  return (
    <label className="flex cursor-pointer items-start gap-2 text-body text-ink">
      <input
        type="radio"
        name={group}
        checked={checked}
        onChange={onChange}
        aria-labelledby={nameId}
        aria-describedby={detail ? detailId : undefined}
        className={`mt-0.5 size-4 shrink-0 cursor-pointer accent-accent ${ds.focusRing}`}
      />
      <span>
        <span id={nameId}>{name}</span>
        {detail ? (
          <small id={detailId} className="block text-caption text-muted">
            {detail}
          </small>
        ) : null}
      </span>
    </label>
  )
}

/** 시안 .dlg — 가운데 떠 있는 창. Esc·가림막 누름은 닫기. 열리면 창에 초점 */
export function Dialog({
  label,
  labelledBy,
  width = 'w-125',
  onClose,
  children,
}: {
  label?: string
  labelledBy?: string
  width?: string
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  const closeOnBackdrop = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose()
  }
  return (
    <div className="fixed inset-0 z-20 grid place-items-start justify-center bg-ink/20 pt-24" onMouseDown={closeOnBackdrop}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={`${ds.layer} grid max-h-[80vh] ${width} gap-3.5 overflow-auto p-5 outline-hidden`}
      >
        {children}
      </div>
    </div>
  )
}
