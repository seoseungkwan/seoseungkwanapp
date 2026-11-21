'use client'

import { useEffect, useId, useMemo, useState } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { useStaffBase } from '@/components/staff/useStaffBase'
import { ds } from '@/components/ui/classes'
import { monthOf } from '@/lib/analytics/dates'
import { StaffStoreError } from '@/lib/storage/staff'
import type { ErrorCode } from '@/types/errors'
import type { DayChange, Leave } from '@/types/staff'
import { EndNotice } from './EndNotice'
import { LeaveCalendar } from './LeaveCalendar'
import { LeaveEditor, type EditorPreset } from './LeaveEditor'
import { LeaveRecord } from './LeaveRecord'
import { LeaveRules } from './LeaveRules'
import { LeaveStatusTable, type StatusRow } from './LeaveStatusTable'
import { endNotice, isActive, linkOf, loadRange, shiftMonth, statusOf, withWeekday } from './leaveView'

// 휴가 화면 (staff REQ-7614, 시안 docs/mockups/staff/leave.html ①~⑥ — 폰 장면 ⑦은 만들지 않는다). 제목 '직원'과 작은 메뉴는 staff/layout이 그린다.
// 첫 모습: ⑥ 이번 달 끝나는 연차 안내 → ① 연차 현황 표 → ② 휴가 달력. 이름을 누르면 ④ 한 사람 기록이 그 자리에 열리고,
// [휴가 넣기]·날짜 칸·칩·[고치기]는 ③ 휴가 넣기 칸, [연차 규칙]은 ⑤ 칸(떠 있는 칸)이다.
// 직원·설정·기본 근무·병원 정보는 공용 읽기 훅(useStaffBase), 휴가와 근무표 바뀐 날은 여기서 한 번에 읽는다 —
// 가장 이른 입사일부터 오늘 + 2년까지(연차 셈은 입사일부터 모든 기간을 차례로 센다). 달력이 그 밖으로 가면 범위를 넓혀 다시 읽는다.
// 다시 읽는 동안은 앞서 읽은 값을 그대로 보인다. 저장·지우기 뒤에는 휴가만 다시 읽고, 연차 규칙 저장 뒤에는 공용 자료를 다시 읽는다

const DELETE_CONFIRM = '이 휴가를 지울까요? 남은 연차가 다시 늘어나요.'

type LeaveData = { leaves: Leave[]; changes: DayChange[] }
type Dialog = { kind: 'editor'; preset: EditorPreset } | { kind: 'rules' } | null

const codeOf = (e: unknown): ErrorCode => (e instanceof StaffStoreError ? e.code : 'E-STAFF-SAVE-FAILED')

function ReadFailed({ onRetry }: { onRetry(): void }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <ErrorCard code="E-STAFF-READ-FAILED" />
      <button type="button" onClick={onRetry} className={ds.button.secondary}>
        다시 불러오기
      </button>
    </div>
  )
}

export function LeaveScreen({ today }: { today: string }) {
  const { state, members, settings, plans, clinic, store, reload } = useStaffBase()
  const headId = useId()
  const thisMonth = monthOf(today)
  const [month, setMonth] = useState(thisMonth)
  const [recordId, setRecordId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [attempt, setAttempt] = useState(0)
  const [data, setData] = useState<LeaveData | null>(null)
  const [failedTag, setFailedTag] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [recordError, setRecordError] = useState<ErrorCode | null>(null)

  const range = state === 'ready' ? loadRange(members, today, month) : null
  const tag = range === null ? null : `${range.from}~${range.to}#${attempt}`

  useEffect(() => {
    if (tag === null) return
    const [from, to] = tag.split('#')[0].split('~')
    let current = true
    Promise.all([store.listLeaves({ from, to }), store.listChanges({ from, to })]).then(
      ([leaves, changes]) => {
        if (!current) return
        setData({ leaves, changes })
        setFailedTag(null)
      },
      () => {
        if (current) setFailedTag(tag)
      },
    )
    return () => {
      current = false
    }
  }, [tag, store])

  const leaves = useMemo(() => data?.leaves ?? [], [data])
  const active = useMemo(() => members.filter((m) => isActive(m, today)), [members, today])
  const rows = useMemo(
    (): StatusRow[] => active.map((member) => ({ member, status: statusOf(member, leaves, settings, today), link: linkOf(member, clinic.profile.staff) })),
    [active, leaves, settings, today, clinic.profile.staff],
  )

  const retryLeaves = () => setAttempt((n) => n + 1)
  if (state === 'failed') return <ReadFailed onRetry={reload} />
  if (state === 'loading' || (data === null && failedTag !== tag)) return <p className="text-small text-muted">휴가를 불러오는 중이에요</p>
  if (data === null) return <ReadFailed onRetry={retryLeaves} />

  const openEditor = (preset: Partial<EditorPreset>) => setDialog({ kind: 'editor', preset: { staffId: null, day: null, group: null, ...preset } })
  const editGroup = (groupId: string) => openEditor({ group: leaves.filter((l) => l.groupId === groupId) })

  async function remove(groupId: string) {
    if (busy || !window.confirm(DELETE_CONFIRM)) return
    setBusy(true)
    setRecordError(null)
    try {
      await store.deleteLeaveGroup(groupId)
      retryLeaves()
    } catch (e) {
      setRecordError(codeOf(e))
    } finally {
      setBusy(false)
    }
  }

  const record = recordId === null ? null : (rows.find((r) => r.member.id === recordId) ?? null)
  const editing = dialog?.kind === 'editor' ? dialog.preset : null
  const editingPerson = editing?.group?.[0]?.staffId ?? null
  const choices = editingPerson !== null && !active.some((m) => m.id === editingPerson) ? [...active, ...members.filter((m) => m.id === editingPerson)] : active

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {failedTag === tag ? <ReadFailed onRetry={retryLeaves} /> : null}

      {record !== null ? (
        <LeaveRecord
          member={record.member}
          status={record.status}
          leaves={leaves}
          link={record.link}
          leftover={settings.leftover}
          busy={busy}
          error={recordError}
          onBack={() => {
            setRecordId(null)
            setRecordError(null)
          }}
          onAdd={() => openEditor({ staffId: record.member.id })}
          onEdit={(group) => openEditor({ group })}
          onDelete={remove}
        />
      ) : (
        <>
          <EndNotice notice={endNotice(rows, settings.leftover, today)} month={thisMonth} />
          <section aria-labelledby={headId} className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div>
                <h2 id={headId} className="text-subtitle font-semibold text-ink">
                  연차 현황
                </h2>{' '}
                <p className="text-caption text-muted">
                  {`연차 기준 ${settings.leaveBasis === 'hire' ? '입사일 기준' : '1월 1일 기준'} · 못 쓴 연차는 ${settings.leftover === 'pay' ? '수당으로 정산' : '다음 해로 넘김'} · ${withWeekday(today)} 기준`}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={active.length === 0} onClick={() => openEditor({})} className={ds.button.primary}>
                  휴가 넣기
                </button>
                <button type="button" onClick={() => setDialog({ kind: 'rules' })} className={ds.button.secondary}>
                  연차 규칙
                </button>
              </div>
            </div>
            {rows.length > 0 ? (
              <LeaveStatusTable labelledBy={headId} rows={rows} leftover={settings.leftover} onName={setRecordId} />
            ) : (
              <p className={`${ds.panel} px-5 py-4 text-small text-muted`}>재직 중인 직원이 없어요. 명단에서 직원을 더하면 여기에 연차가 보여요.</p>
            )}
            <p className={ds.help}>
              {`'쓴'은 연차·반차만 셉니다. 경조사·병가·출산·육아휴직·무급(결근)은 연차에서 빼지 않습니다. ${
                settings.leftover === 'carry' ? '막대 = 남은 ÷ (생긴 + 넘어옴).' : '막대 = 남은 ÷ 생긴.'
              } 남은 비율이 25% 밑이면 막대가 주황입니다. 퇴사한 직원은 이 표에 없습니다.`}
            </p>
          </section>
          <LeaveCalendar
            month={month}
            today={today}
            leaves={leaves}
            members={members}
            profile={clinic.profile}
            onMonth={(step) => setMonth((m) => shiftMonth(m, step))}
            onThisMonth={() => setMonth(thisMonth)}
            onDay={(day) => openEditor({ day })}
            onChip={(leave) => editGroup(leave.groupId)}
          />
        </>
      )}

      {dialog?.kind === 'editor' ? (
        <LeaveEditor
          choices={choices}
          leaves={leaves}
          changes={data.changes}
          plans={plans}
          settings={settings}
          profile={clinic.profile}
          today={today}
          preset={dialog.preset}
          store={store}
          onSaved={() => {
            setDialog(null)
            retryLeaves()
          }}
          onFailed={retryLeaves}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === 'rules' ? (
        <LeaveRules
          settings={settings}
          active={active}
          store={store}
          onSaved={() => {
            setDialog(null)
            reload()
          }}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </div>
  )
}
