'use client'

import { useId } from 'react'
import { createPortal } from 'react-dom'
import { formatCount } from '@/components/charts/format'
import type { RevenueMode } from '@/components/stats/revenueView'
import { ds } from '@/components/ui/classes'
import { useStatsCard } from './parts'

// 참고 금액 포함 스위치 (first90 REQ-4408 AC-4408.1, REQ-4417 AC-4417.3, design.md 5-7, 시안 docs/mockups/first90/redesign.html .s-sw).
// 상태(mode)는 StatsSections 한 곳이 갖고(저장하지 않음, 처음 꺼짐) 매출 요약·매출 카드 두 곳에 같은 값을 내린다. 여기는 그리기와 onChange 부르기만 한다.
// 큰 카드(StatsCard) 안이면 카드 제목 줄 오른쪽 자리(slot)에 portal로 그린다. order-last라 같은 자리의 다른 글·단추 뒤 맨 끝에 선다.
// 확인 필요한 날이 없으면 그리지 않고, 참고 금액이 있는 날이 없으면 aria-disabled(눌러도 바뀌지 않음)다.
// 아래 글(2026-11-15 검토 보완): 켜짐인데 참고 금액이 없는 날도 섞이면 그 날 수를 함께 말하고, 눌리지 않는 글은 연결된 도우미 판이 아니라 저장된 날 자료 기준이다

const NAME = '참고 금액 포함'
const NO_ROUGH = '이 기간 확인 필요한 날은 참고 금액 없이 저장됐어요. 도우미 0.7.0으로 다시 불러오면 보여요'
const WRAP = 'order-last ml-auto flex max-w-85 flex-col items-end gap-0.5 max-md:ml-0 max-md:w-full max-md:max-w-none max-md:items-start'
const BUTTON = [
  'inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-st-line-2 bg-surface pr-3 pl-2 text-body font-semibold text-st-ink',
  'aria-checked:border-st-ref aria-checked:bg-warning-soft',
  'aria-disabled:cursor-not-allowed aria-disabled:bg-st-canvas aria-disabled:text-st-muted',
  ds.focusRing,
].join(' ')
const TRACK = 'relative h-5.5 w-9.5 shrink-0 rounded-full'
const KNOB = 'st-move-toggle absolute top-0.75 left-0.75 size-4 rounded-full bg-surface'

type Props = {
  mode: RevenueMode
  onChange(mode: RevenueMode): void
  days: number // 보는 기간의 확인 필요한 날 수
  roughDays: number // 그 가운데 참고 금액이 있는 날 수
}

// 켜짐 글: 확인 필요한 날 모두에 참고 금액이 있으면 '확인 필요한 날 {m}일의 참고 금액을 더했어요', 없는 날도 있으면 '참고 금액 {m}일 포함 · {k}일 금액 미확인'
function onText(days: number, roughDays: number): string {
  const unknown = days - roughDays
  return unknown > 0 ? `참고 금액 ${formatCount(roughDays)}일 포함 · ${formatCount(unknown)}일 금액 미확인` : `확인 필요한 날 ${formatCount(roughDays)}일의 참고 금액을 더했어요`
}

export function RoughSwitch({ mode, onChange, days, roughDays }: Props) {
  const describedBy = useId()
  const card = useStatsCard()
  if (days === 0) return null
  const disabled = roughDays === 0
  const on = !disabled && mode === 'in'
  const text = disabled ? NO_ROUGH : on ? onText(days, roughDays) : `확인 필요한 날 ${formatCount(days)}일은 빼고 셌어요`
  const body = (
    <div className={WRAP}>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-disabled={disabled ? true : undefined}
        aria-describedby={describedBy}
        onClick={() => {
          if (!disabled) onChange(on ? 'out' : 'in')
        }}
        className={BUTTON}
      >
        <span aria-hidden="true" className={`${TRACK} ${on ? 'bg-st-ref' : 'bg-st-line-2'}`}>
          <span className={on ? `${KNOB} translate-x-4` : KNOB} />
        </span>
        {NAME}
      </button>
      <span id={describedBy} className="text-right text-caption text-st-muted max-md:text-left">
        {text}
      </span>
    </div>
  )
  if (card === null) return body
  return card.slot === null ? null : createPortal(body, card.slot)
}
