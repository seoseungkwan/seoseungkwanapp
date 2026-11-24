import type { MouseEvent, ReactNode } from 'react'
import { HowLine } from '@/components/location/common/HowLine'
import { useReadOnly } from '@/components/shell/viewing'
import { ds } from '@/components/ui/classes'
import { filledHow, type HowCtx } from '@/lib/location/method'
import type { Got, YesNo } from '@/types/location'

// 거리 사진·건물 서류·빈 칸 짐작·땅 쓰임이 같이 쓰는 모양(시안 docs/mockups/location/index.html의 .csec·.sh·.how·.field·.opts·.ob·.btn.sm·.info·.note·.tbtn 값).
// PC 모양 하나: 폭 따라 바뀌는 ds 묶음(단추·입력·글자 단추)은 쓰지 않고 같은 값을 여기 적는다. 색·글자·모서리는 토큰 클래스만

// ── 묶음 틀(시안 sec(): 머리 h3 + 곁글, 아래 선, '이렇게 봤어요', 몸) ──

export type HeadProp = {
  /** false면 머리·닻(id) 없이 '이렇게 봤어요'와 몸만 그린다(틀이 머리를 따로 그릴 때). 처음 true */
  head?: boolean
}

/** '이렇게 봤어요'(AC-7920.2) — 글은 method.ts HOW를 howCtx로 채우고, 펼침은 부르는 쪽이 쥔다 */
export type HowProp = {
  /** 채울 값: 그 후보 그날 값의 출처별 기준 날짜 · 살필 범위 · 시·군·구 · 고른 경쟁 과목(method.ts HowCtx) */
  howCtx: HowCtx
  /** [더 보기]를 펼쳤나 — 범위를 바꿔 다시 그려도 부르는 쪽이 쥔 값 그대로 */
  howOpen: boolean
  /** [더 보기]/[접기]를 누르면 */
  onHow: () => void
}

/** 이 폴더 묶음 넷(= method.ts HOW id = 닻 sec-{id}) */
export type SiteId = 'photo' | 'bld' | 'vac' | 'land'

export function Section({
  id,
  title,
  aside,
  head = true,
  howCtx,
  howOpen,
  onHow,
  children,
}: { id: SiteId; title: string; aside?: ReactNode; children: ReactNode } & HeadProp & HowProp) {
  const how = <HowLine {...filledHow(id, howCtx)} open={howOpen} onToggle={onHow} />
  const body = (
    <div className="mt-3">
      <div className="grid min-w-0 gap-4">{children}</div>
    </div>
  )
  if (!head)
    return (
      <div className="min-w-0">
        {how}
        {body}
      </div>
    )
  return (
    <section id={`sec-${id}`} aria-labelledby={`sec-${id}-title`} className="min-w-0 scroll-mt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line-strong pb-1.5">
        <h3 id={`sec-${id}-title`} className="text-subtitle font-semibold text-ink">
          {title}
        </h3>
        {aside ? <span className="text-small text-muted">{aside}</span> : null}
      </div>
      {how}
      {body}
    </section>
  )
}

// ── 고르는 칸(시안 .field + .opts .ob[aria-pressed]) ──

const PICK =
  `h-9 cursor-pointer whitespace-nowrap rounded-control border border-line-strong bg-surface px-3 text-body text-ink transition hover:bg-canvas ` +
  `aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:font-semibold aria-pressed:text-accent-strong aria-pressed:ring-1 aria-pressed:ring-inset aria-pressed:ring-accent ${ds.focusRing}`

export function Picks({
  label,
  hint,
  group,
  options,
  value,
  onPick,
  children,
}: {
  label: string
  hint: string
  /** 고르기 묶음 이름(읽기 도우미) */
  group: string
  options: readonly (readonly [YesNo, string])[]
  value: YesNo | null
  /** 다른 값을 고를 때만 부른다(고른 값을 다시 누르면 부르지 않음) */
  onPick: (v: YesNo) => void
  children?: ReactNode
}) {
  // 고르면 후보 칸을 저장한다 — 다른 의원을 보는 중(읽기만, admin-view AC-8010.2)이면 고른 값만 보이고 막힌다
  const readOnly = useReadOnly()
  return (
    <div className="grid min-w-0 content-start gap-1.5">
      <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-small font-semibold text-ink">
        <span>{label}</span>
        <span className="text-caption font-normal text-muted">{hint}</span>
      </p>
      <div role="group" aria-label={group} className="flex flex-wrap gap-1.5">
        {options.map(([v, text]) => (
          <button
            key={v}
            type="button"
            aria-pressed={value === v}
            disabled={readOnly}
            className={PICK}
            onClick={() => {
              if (value !== v) onPick(v)
            }}
          >
            {text}
          </button>
        ))}
      </div>
      {children}
    </div>
  )
}

// ── 바깥 링크 단추(시안 .btn.sm + 바깥 그림) ──

export const LINK_BUTTON =
  `inline-flex h-8 w-fit cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-control border border-line-strong bg-surface px-3 text-small font-medium text-ink no-underline transition hover:bg-canvas ` +
  `aria-disabled:cursor-not-allowed aria-disabled:opacity-40 ${ds.focusRing}`

export function ExtIcon() {
  return (
    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" className="shrink-0">
      <path d="M9 2.5h4.5V7M13.5 2.5 7 9M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3" />
    </svg>
  )
}

// ── 법 근거 글자 링크(시안 lawLink → '근거와 출처'의 #law-<id>, TASK-28 닻) ──

export const lawHref = (id: string) => `/location?tab=sources#law-${id}`
const LAW = `rounded-control text-small font-medium text-accent no-underline underline-offset-3 hover:underline ${ds.focusRing}`
const plainClick = (e: MouseEvent) => e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey

export function LawLink({ id, onOpen }: { id: string; onOpen?: (id: string) => void }) {
  const onClick = onOpen
    ? (e: MouseEvent<HTMLAnchorElement>) => {
        if (!plainClick(e)) return
        e.preventDefault()
        onOpen(id)
      }
    : undefined
  // 평범한 <a>(next/link 아님): /location 안 링크도 Next가 옮기지 않게 둔다(셸 ShellLink·틀 TabLink와 같음)
  return (
    <a href={lawHref(id)} className={LAW} onClick={onClick}>
      법 근거
    </a>
  )
}

// ── 이름·값 줄(시안 .info dl) ──

export function InfoList({ children }: { children: ReactNode }) {
  return <dl className="m-0 min-w-0">{children}</dl>
}

export function InfoRow({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[148px_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1 border-b border-line py-2">
      <dt className="text-small text-muted">
        {name}
      </dt>
      <dd className="m-0 min-w-0 text-body text-ink wrap-anywhere">{children}</dd>
    </div>
  )
}

/** 값 옆 보조 글(시안 .info dd .x) */
export const SIDE = 'text-small text-ink-2'

// ── 알림 줄(시안 .note) ──

export function Note({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <p className="grid grid-cols-[16px_minmax(0,1fr)] gap-2 rounded-control bg-canvas px-3 py-2 text-small text-ink-2">
      {icon}
      <span>{children}</span>
    </p>
  )
}

// ── 그날 값 하나에서 보일 값: 받은 값, 못 받았으면 지난 값(prev), 둘 다 없으면 null ──

export function shownOf<T>(got: Got<T>): { v: T; asOf: string } | null {
  return got.ok ? { v: got.v, asOf: got.asOf } : (got.prev ?? null)
}

/** 표·칩 모양(시안 table.t·.chip) */
export const TABLE = {
  wrap: 'min-w-0 overflow-x-auto',
  table: 'w-full border-collapse text-small',
  th: 'h-10 whitespace-nowrap border-b border-line px-3 text-left font-medium text-muted first:pl-0 last:pr-0',
  thNum: 'h-10 whitespace-nowrap border-b border-line px-3 text-right font-medium text-muted first:pl-0 last:pr-0',
  row: 'hover:bg-canvas',
  rowHere: 'bg-accent-soft',
  td: 'h-11 border-b border-line px-3 py-2 align-middle text-ink first:pl-0 last:pr-0',
  tdNum: 'h-11 whitespace-nowrap border-b border-line px-3 py-2 text-right align-middle tabular-nums text-ink first:pl-0 last:pr-0',
} as const
