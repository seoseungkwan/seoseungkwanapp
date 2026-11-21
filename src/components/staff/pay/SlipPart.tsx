'use client'

import { useRef, useState } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { ds } from '@/components/ui/classes'
import { lineTotal } from '@/lib/staff/pay'
import type { PersonOvertime } from '@/lib/staff/schedule'
import { downloadSlipPng, slipFileName } from '@/lib/staff/slipPng'
import type { Leave, PayItem, PayLine, StaffMember } from '@/types/staff'
import { won } from './format'
import { MonthNav, ToolRow } from './parts'
import { PaySlip } from './PaySlip'

// '명세서' 칸 (staff AC-7615.10, 시안 pay.html ⑧). 왼쪽 사람 고르기(그달 재직자 · 명단 차례 · 합계), 오른쪽 명세서 한 장.
// [인쇄·PDF] = window.print — 인쇄 면에는 명세서 한 장만(서식 탭과 같은 길: 숨은 인쇄 복사본 + @media print).
// 직원 탭 틀(제목·작은 메뉴)은 이 파일 밖이라, 인쇄 때는 복사본이 든 줄기 밖의 것을 모두 숨긴다(:has).
// [그림 파일] = lib/staff/slipPng.ts(실패하면 E-STAFF-IMAGE-FAILED)

const PRINT_CSS = [
  '@media print { @page { size: A4 portrait; margin: 0 } }',
  '@media print { body:has([data-print-copy]) *:not(:has([data-print-copy])):not([data-print-copy]):not([data-print-copy] *) { display: none !important } }',
].join('\n')

export type SlipPartProps = {
  month: string
  hospital: string
  members: readonly StaffMember[]
  items: readonly PayItem[]
  lineOf: (staffId: string) => PayLine
  overtimeOf: (staffId: string) => PersonOvertime | undefined
  leavesOf: (staffId: string) => Leave[]
  remainingOf: (staffId: string) => number | null
  onMonth: (month: string) => void
}

export function SlipPart(props: SlipPartProps) {
  const { month, members, items, lineOf } = props
  const [chosen, setChosen] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const shown = useRef<SVGSVGElement>(null)
  const person = members.find((member) => member.id === chosen) ?? members[0] ?? null

  const slipOf = (member: StaffMember, className: string, ref?: typeof shown) => (
    <PaySlip
      ref={ref}
      hospital={props.hospital}
      month={month}
      member={member}
      line={lineOf(member.id)}
      items={items}
      overtime={props.overtimeOf(member.id)}
      leaves={props.leavesOf(member.id)}
      remaining={props.remainingOf(member.id)}
      className={className}
    />
  )

  const savePicture = async () => {
    if (person === null || shown.current === null || busy) return
    setBusy(true)
    const ok = await downloadSlipPng(shown.current, slipFileName(person.name, month))
    setBusy(false)
    setFailed(!ok)
  }

  return (
    <>
      <div className="flex min-w-0 flex-col gap-3 print:hidden">
        <ToolRow
          left={<MonthNav month={month} onMonth={props.onMonth} />}
          right={
            <>
              <button type="button" disabled={person === null} className={ds.button.secondary} onClick={() => window.print()}>
                인쇄·PDF
              </button>
              <button type="button" disabled={person === null || busy} className={ds.button.secondary} onClick={() => void savePicture()}>
                그림 파일
              </button>
            </>
          }
        />
        {failed && <ErrorCard code="E-STAFF-IMAGE-FAILED" />}
        {person === null ? (
          <p className="text-small text-muted">이달 재직자가 없어요.</p>
        ) : (
          <div className="grid min-w-0 items-start gap-3 md:grid-cols-[200px_minmax(0,1fr)]">
            <div role="group" aria-label="사람 고르기" className="flex min-w-0 flex-col gap-1">
              <span className="px-0.5 pb-1 text-caption text-muted">사람 고르기</span>
              {members.map((member) => {
                const on = member.id === person.id
                return (
                  <button
                    key={member.id}
                    type="button"
                    aria-pressed={on}
                    className={`flex cursor-pointer items-center justify-between gap-2 rounded-control border px-3 py-2 text-left text-small ${
                      on ? 'border-accent bg-accent-soft font-semibold text-accent-strong' : 'border-line bg-surface text-ink hover:bg-canvas'
                    }`}
                    onClick={() => {
                      setChosen(member.id)
                      setFailed(false)
                    }}
                  >
                    {member.name}
                    <small className="text-caption text-muted tabular-nums">{won(lineTotal(lineOf(member.id), items, month).total)}</small>
                  </button>
                )
              })}
            </div>
            <div className="min-w-0 max-w-170 rounded-control border border-line bg-canvas p-3">{slipOf(person, 'block h-auto w-full', shown)}</div>
          </div>
        )}
      </div>
      <style>{PRINT_CSS}</style>
      {person !== null && (
        <div data-print-copy="" aria-hidden="true" className="hidden print:block">
          {slipOf(person, 'block h-auto w-full')}
        </div>
      )}
    </>
  )
}
