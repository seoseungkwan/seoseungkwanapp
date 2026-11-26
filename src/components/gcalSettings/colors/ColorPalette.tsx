'use client'

import type { CSSProperties } from 'react'
import { CAL_COLOR_LABEL, CAL_DEFAULT_LABEL, CAL_FOLLOW_LABEL, kindColorLabel, type CalPaint } from '@/components/calendar/colors'
import { ds } from '@/components/ui/classes'
import type { CalColor, KindColor } from '@/types/calendar'
import { ARIA } from './labels'

// 시행자·종류 화면의 색 부품 (spec google-link AC-8529.1, 시안 calendar.html ?s=colors .gpal·.cbtn·i.gsw·.gev).
// 색판: 종류는 '시행자 색 따름' + 구글 11색 + '캘린더 기본 색', 시행자·휴무 줄·취소·변경 색은 11색만. 색마다 이름 글을 동그라미 아래에 쓴다.
// 11색 차례는 시안 그대로 구글 캘린더 화면 차례(토마토 → 흑연, colorId 차례가 아님 — 구글에서 보던 자리 그대로 찾게).
// 색 값은 globals.css :root의 --cal-* 토큰만 var()로 쓴다(16진수·rgb 없음). 캘린더 기본 색은 화면 뿌리가 그 병원 값으로 --cal-default를 덮는다

/** 구글 캘린더 일정 색 고르기 화면 차례 */
export const PALETTE_ORDER: readonly CalColor[] = ['tomato', 'flamingo', 'tangerine', 'banana', 'sage', 'basil', 'peacock', 'blueberry', 'lavender', 'grape', 'graphite']

const colorVar = (color: CalPaint) => `var(--cal-${color})`

/** 색 점 바탕: 11색은 그 색, 캘린더 기본 색은 기본 색 위 흰 빗금, 시행자 색 따름은 세 색 나눔(시안 i.gsw.none·follow) */
function dotStyle(color: KindColor): CSSProperties {
  if (color === null) {
    return { backgroundImage: 'conic-gradient(var(--cal-lavender) 0 33%, var(--cal-banana) 0 66%, var(--cal-flamingo) 0)' }
  }
  if (color === 'default') {
    return { backgroundColor: colorVar('default'), backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 3px, var(--surface) 3px 5px)' }
  }
  return { backgroundColor: colorVar(color) }
}

/** 색 동그라미. size 12(단추·줄) 또는 26(색판) */
export function ColorDot({ color, size = 12 }: { color: KindColor; size?: 12 | 26 }) {
  const box = size === 26 ? 'size-6.5 shadow-[0_0_0_2px_var(--surface),0_0_0_3px_var(--line-strong)]' : 'size-3'
  return <span aria-hidden="true" data-dot="" className={`inline-block shrink-0 rounded-full ${box}`} style={dotStyle(color)} />
}

const PICK = `grid cursor-pointer justify-items-center gap-1 rounded-control border px-0.5 pt-1.5 pb-1 text-caption ${ds.focusRing}`
const pickClass = (on: boolean, wide: boolean) =>
  `${PICK} ${wide ? 'col-span-2' : ''} ${on ? 'border-ink bg-surface font-semibold text-ink' : 'border-transparent text-ink-2 hover:border-line hover:bg-surface'}`

type PaletteProps = { value: KindColor; forKind?: boolean; onPick(color: KindColor): void }

/** 색판(시안 .gpal). 고른 색은 aria-pressed */
export function ColorPalette({ value, forKind = false, onPick }: PaletteProps) {
  const choice = (color: KindColor, label: string, wide = false) => (
    <button key={color ?? 'follow'} type="button" aria-pressed={value === color} className={pickClass(value === color, wide)} onClick={() => onPick(color)}>
      <ColorDot color={color} size={26} />
      {label}
    </button>
  )
  return (
    <div role="group" aria-label={ARIA.palette} className="grid grid-cols-[repeat(auto-fill,minmax(70px,1fr))] gap-1.5 rounded-control bg-canvas p-2.5">
      {forKind && choice(null, CAL_FOLLOW_LABEL, true)}
      {PALETTE_ORDER.map((color) => choice(color, CAL_COLOR_LABEL[color]))}
      {forKind && choice('default', CAL_DEFAULT_LABEL, true)}
    </div>
  )
}

type ButtonProps = { value: KindColor; label: string; open: boolean; disabled?: boolean; onToggle(): void }

/** 색판을 여는 단추(시안 .cbtn): 색 점 + 색 이름 + ▼ */
export function ColorButton({ value, label, open, disabled = false, onToggle }: ButtonProps) {
  const name = kindColorLabel(value)
  return (
    <button
      type="button"
      aria-label={`${label} ${name}`}
      aria-expanded={open}
      disabled={disabled}
      className={`inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-control border bg-surface px-2.5 text-small whitespace-nowrap text-ink disabled:cursor-not-allowed disabled:opacity-40 ${ds.focusRing} ${
        open ? 'border-accent ring-1 ring-accent ring-inset' : 'border-line-strong'
      }`}
      onClick={onToggle}
    >
      <ColorDot color={value} />
      <span className="min-w-16 text-left">{name}</span>
      <span aria-hidden="true" className="text-caption text-muted">
        ▼
      </span>
    </button>
  )
}

/** 구글 캘린더 일정 모양 칩(시안 .gev): 그 색으로 꽉 채우고 구글 화면처럼 흰 글자, 바나나만 검정 */
export function GoogleChip({ color, text, bold = false }: { color: CalPaint; text: string; bold?: boolean }) {
  return (
    <span
      data-chip=""
      title={text}
      className={`block truncate rounded-control px-2 py-0.5 text-caption ${bold ? 'font-semibold' : 'font-medium'} ${color === 'banana' ? 'text-ink' : 'text-surface'}`}
      style={{ backgroundColor: colorVar(color) }}
    >
      {text}
    </span>
  )
}
