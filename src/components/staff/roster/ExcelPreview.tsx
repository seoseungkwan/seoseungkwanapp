'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { EMPLOYMENT_LABEL, jobLabel } from '@/components/staff/labels'
import { TableScroll } from '@/components/staff/TableScroll'
import { ds } from '@/components/ui/classes'
import type { RosterRead, RosterRow } from '@/lib/staff/rosterExcel'
import type { ErrorCode } from '@/types/errors'
import type { StaffMember } from '@/types/staff'
import { codeOf, withSubject } from './rosterText'

// [엑셀 올리기] 미리 보기 창(staff AC-7612.4 · AC-7608.5, 시안 list.html ④). 바로 넣지 않고 줄마다 어떻게 넣을지 먼저 보인다.
// 새 직원 줄은 넣을 값, 고침 줄은 지금 값 + 엑셀에 적힌 칸, 문제 줄은 엑셀에 보이는 글자(raw) 그대로다.
// [넣기]는 문제 줄을 빼고 넣는다. 중간에 실패하면 된 것은 남고 오류 칸에 다시 올리는 법을 보인다

// 문제 줄의 까닭 칸은 줄을 바꿔 쓴다(줄바꿈 없음 클래스를 바꿔 낀다)
const tdWrap = `${ds.table.td.replace('whitespace-nowrap', 'whitespace-normal')} min-w-56`

type Shown = { name: string; job: string; work: string; hiredOn: string; used: string }

function shownOf(row: RosterRow, members: readonly StaffMember[]): Shown {
  if (row.action === 'problem') {
    const raw = row.raw
    return {
      name: raw['이름*'],
      job: raw['직종'],
      work: [raw['근무 형태'], raw['주 근무시간']].filter((cell) => cell !== '').join(' · '),
      hiredOn: raw['입사일*'],
      used: raw['올해 이미 쓴 연차(일)'],
    }
  }
  const target = row.action === 'update' ? members.find((m) => m.id === row.member.id) : undefined
  const m = { ...target, ...row.member }
  const work = m.employment === undefined ? '' : `${EMPLOYMENT_LABEL[m.employment]} · ${m.weeklyHours ?? ''}`
  return {
    name: m.name ?? '',
    job: m.job === undefined ? '' : jobLabel({ job: m.job, jobOther: m.jobOther ?? null }),
    work,
    hiredOn: m.hiredOn ?? '',
    used: row.action === 'update' ? '—' : String(m.usedBefore ?? 0),
  }
}

function How({ row }: { row: RosterRow }) {
  if (row.action === 'new') return <span className={ds.chip.positive}>새 직원</span>
  if (row.action === 'update') {
    return (
      <>
        <span className={ds.chip.accent}>고침</span>
        {row.changed.length > 0 && (
          <>
            {' '}
            <small className="text-caption text-ink-2">{`${withSubject(row.changed.join('·'))} 바뀌어요`}</small>
          </>
        )}
      </>
    )
  }
  return (
    <>
      <span className={ds.chip.negative}>문제</span> <small className="text-caption text-negative">{row.reason}</small>
    </>
  )
}

export function ExcelPreview({
  fileName,
  read,
  members,
  onImport,
  onCancel,
}: {
  fileName: string
  read: RosterRead
  members: readonly StaffMember[]
  /** 넣을 줄(문제 줄 뺌)을 넣는다. 실패하면 던진다 */
  onImport(rows: RosterRow[]): Promise<void>
  onCancel(): void
}) {
  const titleId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<ErrorCode | null>(null)
  const rows = read.rows
  const count = (action: RosterRow['action']) => rows.filter((row) => row.action === action).length
  const putRows = rows.filter((row) => row.action !== 'problem')

  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape' || busy) return
      e.preventDefault()
      onCancel()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onCancel, busy])

  // Tab이 창 밖으로 나가지 않게: 창 안 조작 요소 사이만 돈다
  const trapTab = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>('button, [tabindex="0"]')]
    const [first, last] = [items[0], items[items.length - 1]]
    const active = document.activeElement
    if (e.shiftKey && (active === first || active === e.currentTarget)) {
      e.preventDefault()
      last?.focus()
    } else if (!e.shiftKey && (active === last || active === e.currentTarget)) {
      e.preventDefault()
      first?.focus()
    }
  }

  async function put() {
    if (busy || putRows.length === 0) return
    setBusy(true)
    setFailed(null)
    try {
      await onImport(putRows)
    } catch (error) {
      setFailed(codeOf(error, 'E-STAFF-SAVE-FAILED'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/36 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={trapTab}
        className={`${ds.layer} flex max-h-full w-full max-w-220 flex-col gap-3 overflow-y-auto p-5 outline-hidden`}
      >
        <h2 id={titleId} className="text-lead font-semibold text-ink">
          엑셀 올리기 — 미리 보기
        </h2>
        <span className="text-small text-muted">{`${fileName} · ${rows.length}줄`}</span>
        {read.problem !== null ? (
          <p className="rounded-control bg-negative-soft px-4 py-3 text-small font-semibold text-negative">{read.problem}</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <span className={ds.chip.positive}>{`새 직원 ${count('new')}`}</span>
              <span className={ds.chip.accent}>{`고침 ${count('update')}`}</span>
              <span className={ds.chip.negative}>{`문제 ${count('problem')}`}</span>
            </div>
            <div className="rounded-control border border-line">
              <TableScroll label="엑셀 미리 보기">
                <table aria-label="엑셀 미리 보기" className={ds.table.table}>
                  <thead>
                    <tr>
                      {['엑셀 줄', '이름', '직종', '근무 형태', '입사일', '올해 쓴 연차', '어떻게 넣나'].map((head) => (
                        <th key={head} className={ds.table.th}>
                          {head}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const shown = shownOf(row, members)
                      const bad = row.action === 'problem'
                      return (
                        <tr key={row.line} className={bad ? 'bg-negative-soft last:*:border-b-0' : ds.table.row}>
                          <td className={ds.table.tdNum}>{row.line}</td>
                          <td className={ds.table.td}>
                            <b className="font-semibold">{shown.name}</b>
                          </td>
                          <td className={ds.table.td}>{shown.job}</td>
                          <td className={ds.table.td}>{shown.work}</td>
                          <td className={ds.table.tdSub}>{shown.hiredOn}</td>
                          <td className={ds.table.tdNum}>{shown.used}</td>
                          <td className={bad ? tdWrap : ds.table.td}>
                            <How row={row} />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </TableScroll>
            </div>
            <ul className="flex list-disc flex-col gap-0.5 pl-5 text-small text-ink-2">
              <li>이름과 입사일이 같은 직원이 이미 있으면 &apos;고침&apos;으로 보고 엑셀 값으로 바꿔요.</li>
              <li>&apos;올해 쓴 연차&apos;는 새 직원 줄에만 넣어요.</li>
              <li>연락처·생일·주소·은행·계좌번호·메모 칸도 함께 들어가요.</li>
            </ul>
            <p className="text-small text-ink-2">
              <b className="font-semibold text-ink">문제 줄은 빼고 넣어요.</b> 엑셀을 고쳐 다시 올리면 그 줄도 들어가요.
            </p>
          </>
        )}
        {failed !== null && (
          <div className="flex flex-col gap-1.5">
            <ErrorCard code={failed} />
            <p className="text-small text-ink-2">같은 파일을 다시 올리면 들어간 사람은 고침으로 봐요.</p>
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          {read.problem === null && (
            <button
              type="button"
              aria-busy={busy || undefined}
              disabled={putRows.length === 0}
              className={ds.button.primary}
              onClick={() => void put()}
            >
              넣기
            </button>
          )}
          <button ref={cancelRef} type="button" className={ds.button.secondary} onClick={() => !busy && onCancel()}>
            취소
          </button>
        </div>
      </div>
    </div>
  )
}
