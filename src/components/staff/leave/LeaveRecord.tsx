'use client'

import { useId } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { ds } from '@/components/ui/classes'
import type { LeaveStatus } from '@/lib/staff/leave'
import type { ClinicStaff } from '@/types/clinicProfile'
import type { ErrorCode } from '@/types/errors'
import type { Leave, Leftover, StaffMember } from '@/types/staff'
import { EMPLOYMENT_LABEL, LEAVE_CHIP, jobLabel, leaveLabel } from '../labels'
import { TableScroll } from '../TableScroll'
import { deductOf, fmtDays, nextOf, rangeText, recordRows, recordSummary, rowDays, usedBeforeIn } from './leaveView'

// 한 사람 휴가 기록 (staff AC-7614.4, 시안 leave.html ④). 연차 현황 표에서 이름을 누르면 표 자리에 열린다.
// 머리(이름·직종·근무 형태·주 시간·입사·예약 표시) → 네 칸(생긴·쓴·남은·다음 새 연차) → 이번 연차 기간 쓴 휴가 표(묶음마다 한 줄, 최근 날부터) →
// 합계 줄 → 지난 연차 기간 줄. [고치기]·[지우기]는 화면이 맡는다(지우기는 화면이 한 번 묻는다)

export const linkTag = 'inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-control border border-line-strong px-1.5 text-caption text-ink-2'

type LeaveRecordProps = {
  member: StaffMember
  status: LeaveStatus
  leaves: readonly Leave[]
  link: ClinicStaff | null
  leftover: Leftover
  busy: boolean
  error: ErrorCode | null
  onBack(): void
  onAdd(): void
  onEdit(group: Leave[]): void
  onDelete(groupId: string): void
}

export function LeaveRecord({ member, status, leaves, link, leftover, busy, error, onBack, onAdd, onEdit, onDelete }: LeaveRecordProps) {
  const headId = useId()
  const usedId = useId()
  const rows = recordRows(member.id, leaves, status.period)
  const next = nextOf(status)
  const prev = status.previous
  const tiles = [
    { key: '생긴 연차', value: fmtDays(status.granted), tone: 'text-ink', sub: status.carried !== 0 ? `넘어옴 ${fmtDays(status.carried)}` : null },
    { key: '쓴 연차', value: fmtDays(status.used), tone: 'text-ink', sub: null },
    { key: '남은 연차', value: fmtDays(status.left), tone: status.left < 0 ? 'text-negative' : 'text-accent', sub: null },
  ]
  // 지난 기간에 넘어왔던 일수(다음 해로 넘김일 때만 0이 아니다): 남은 = 생긴 + 넘어옴 − 쓴
  const prevCarried = prev === null ? 0 : prev.left - prev.granted + prev.used

  return (
    <section aria-label={`${member.name} 휴가 기록`} className="flex min-w-0 flex-col gap-3">
      <div>
        <button type="button" onClick={onBack} className={ds.textButton}>
          ‹ 연차 현황
        </button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 id={headId} className="text-title font-semibold text-ink">
            {member.name}
          </h2>{' '}
          <span className="text-small text-muted">{`${jobLabel(member)} · ${EMPLOYMENT_LABEL[member.employment]} · 주 ${member.weeklyHours}시간 · 입사 ${member.hiredOn}`}</span>
          {link !== null ? (
            <>
              {' '}
              <span className={linkTag}>{`예약 (${link.mark})`}</span>
            </>
          ) : null}
        </div>
        <button type="button" onClick={onAdd} className={ds.button.primary}>
          {`${member.name} 님 휴가 넣기`}
        </button>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {tiles.map((tile) => (
          <div key={tile.key} className={`${ds.panel} px-3 py-2`}>
            <p className="text-caption text-muted">{tile.key}</p>
            <p className={`text-title font-semibold tabular-nums ${tile.tone}`}>{tile.value}</p>
            {tile.sub !== null ? <p className="text-caption text-muted">{tile.sub}</p> : null}
          </div>
        ))}
        <div className={`${ds.panel} px-3 py-2`}>
          <p className="text-caption text-muted">다음 새 연차</p>
          <p className="pt-1 text-body font-semibold text-ink tabular-nums">{next === null ? '—' : `${next.day} ${next.tail}`}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-3">
        <h3 id={usedId} className="text-body font-semibold text-ink">
          쓴 휴가
        </h3>{' '}
        <span className="text-caption text-muted">{`이번 연차 기간 ${status.period.from} ~ ${status.period.to}`}</span>
      </div>
      {error !== null ? <ErrorCard code={error} /> : null}
      <div className={ds.panel}>
        <TableScroll label="쓴 휴가 표">
          <table aria-labelledby={usedId} className={`${ds.table.table} min-w-160`}>
            <thead>
              <tr>
                <th scope="col" className={ds.table.th}>
                  날짜
                </th>
                <th scope="col" className={ds.table.th}>
                  종류
                </th>
                <th scope="col" className={`${ds.table.th} text-right`}>
                  일수
                </th>
                <th scope="col" className={ds.table.th}>
                  메모
                </th>
                <th scope="col" className={ds.table.th}>
                  <span className="sr-only">고치기·지우기</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className={ds.table.emptyRow}>
                    이번 연차 기간에 쓴 휴가가 없어요.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.groupId} className={ds.table.row}>
                    <td className={ds.table.td}>{rangeText(row.from, row.to)}</td>
                    <td className={ds.table.td}>
                      <span className={LEAVE_CHIP[row.kind]}>{leaveLabel(row.kind, row.part)}</span>
                    </td>
                    <td className={`${ds.table.tdNum} py-2`}>
                      {fmtDays(rowDays(row))}
                      {deductOf(row.kind) === 0 ? (
                        <>
                          {' '}
                          <span className={`${ds.help} block`}>연차에서 안 뺌</span>
                        </>
                      ) : null}
                    </td>
                    <td className={ds.table.tdSub}>{row.memo ?? '—'}</td>
                    <td className={`${ds.table.td} text-right`}>
                      <span className="inline-flex gap-2">
                        <button type="button" onClick={() => onEdit(row.leaves)} className={ds.button.secondarySmall}>
                          고치기
                        </button>
                        <button type="button" disabled={busy} onClick={() => onDelete(row.groupId)} className={ds.button.secondarySmall}>
                          지우기
                        </button>
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </TableScroll>
      </div>
      <p className={ds.help}>{recordSummary(rows, usedBeforeIn(member, status.period))}</p>

      {prev !== null ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-control border border-dashed border-line-strong bg-surface px-3 py-2 text-small text-ink-2">
          <span className="font-semibold text-ink">{`지난 연차 기간 ${prev.from} ~ ${prev.to}`}</span>{' '}
          <span>
            {`${fmtDays(prev.granted)} 생김 · ${prevCarried !== 0 ? `${fmtDays(prevCarried)} 넘어옴 · ` : ''}${fmtDays(prev.used)} 씀 · 남은 ${fmtDays(prev.left)} → ${leftover === 'pay' ? '수당으로 정산' : '다음 기간에 더함'}`}
          </span>
          {leftover === 'pay' && prev.settledMonth !== null ? (
            <>
              {' '}
              <span className={ds.help}>
                {`(${prev.settledMonth.slice(0, 4)}년 ${Number(prev.settledMonth.slice(5, 7))}월 세무사 자료에 ${fmtDays(Math.max(0, prev.left))}이 들어갔어요)`}
              </span>
            </>
          ) : null}
        </p>
      ) : null}
    </section>
  )
}
