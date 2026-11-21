'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { useStaffBase } from '@/components/staff/useStaffBase'
import { ds } from '@/components/ui/classes'
import { addDays } from '@/lib/analytics/dates'
import { splitActive } from '@/lib/staff/roster'
import type { RosterRead, RosterRow } from '@/lib/staff/rosterExcel'
import type { StaffStore } from '@/lib/storage/staff'
import type { ErrorCode } from '@/types/errors'
import type { Leave, StaffMember } from '@/types/staff'
import { ConfirmDialog } from './ConfirmDialog'
import { ExcelPreview } from './ExcelPreview'
import { MemberCard, remainingText } from './MemberCard'
import { MemberForm } from './MemberForm'
import { RosterEmpty } from './RosterEmpty'
import { RosterList, type RosterTab } from './RosterList'
import { codeOf, periodStartOf } from './rosterText'

// 직원 탭 명단 화면(staff REQ-7612, 시안 docs/mockups/staff/list.html ①~⑥ — 폰 장면 ⑦은 만들지 않는다).
// 한 화면 안에서 명단(재직·퇴사) → 직원 카드 → 더하기·고치기 칸을 바꿔 보인다. 엑셀 미리 보기와 지우기 확인은 위에 뜨는 창이다.
// 자료는 공용 읽기 훅(useStaffBase: 직원·설정·기본 근무·병원 정보)과 남은 연차를 셀 휴가 줄(가장 이른 입사일 ~ 앞날)이다.
// 저장한 뒤에는 reload로 다시 읽는다. 오류는 번호(E-STAFF-*)만 보인다

/** 휴가를 읽는 끝: 오늘 + 400일(지금 연차 기간은 길어야 1년 — 기간 안 앞날 휴가도 쓴 연차로 센다, AC-7604.6) */
const LEAVE_AHEAD_DAYS = 400

type View =
  | { kind: 'list' }
  /** saved: 방금 저장한 값(다시 읽은 직원 목록이 오기 전까지 보인다). seen: 저장할 때의 직원 목록 */
  | { kind: 'card'; id: string; saved: StaffMember | null; seen: readonly StaffMember[] }
  | { kind: 'form'; id: string | null; back: 'list' | 'card' }

type HeldLeaves = { key: string; value: Leave[] | 'failed' }

/** 남은 연차를 셀 휴가 줄. 직원이 없으면 읽지 않는다. 실패는 다시 시도할 수 있다 */
function useLeaves(store: StaffStore, members: readonly StaffMember[], today: string, ready: boolean) {
  const [attempt, setAttempt] = useState(0)
  const [held, setHeld] = useState<HeldLeaves | null>(null)
  const from = members.reduce((min, m) => (m.hiredOn < min ? m.hiredOn : min), today)
  const to = addDays(today, LEAVE_AHEAD_DAYS)
  const wanted = ready && members.length > 0
  const key = `${attempt}|${from}|${to}`

  useEffect(() => {
    if (!wanted) return
    let current = true
    store.listLeaves({ from, to }).then(
      (value) => {
        if (current) setHeld({ key, value })
      },
      () => {
        if (current) setHeld({ key, value: 'failed' })
      },
    )
    return () => {
      current = false
    }
  }, [store, wanted, from, to, key])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  const value = held?.value ?? null
  return { leaves: Array.isArray(value) ? value : null, failed: value === 'failed', retry }
}

export function RosterScreen({ today }: { today: string }) {
  const { state, members, settings, plans, clinic, store, files, reload } = useStaffBase()
  const [view, setView] = useState<View>({ kind: 'list' })
  const [tab, setTab] = useState<RosterTab>('active')
  const [preview, setPreview] = useState<{ fileName: string; read: RosterRead } | null>(null)
  const [excelError, setExcelError] = useState(false)
  const [purging, setPurging] = useState<StaffMember | null>(null)
  const [purgeBusy, setPurgeBusy] = useState(false)
  const [purgeError, setPurgeError] = useState<ErrorCode | null>(null)
  const excelInput = useRef<HTMLInputElement>(null)
  const { leaves, failed: leavesFailed, retry: retryLeaves } = useLeaves(store, members, today, state === 'ready')

  const staffList = clinic.profile.staff
  const calendarStaff = (id: string | null) => (id === null ? null : (staffList.find((person) => person.id === id) ?? null))
  // 재직은 입사일 빠른 차례, 퇴사는 퇴사일 늦은 차례(lib/staff/roster.ts)
  const { active, left } = splitActive(members, today)

  const openCard = (member: StaffMember) => setView({ kind: 'card', id: member.id, saved: null, seen: members })
  const pickExcel = () => excelInput.current?.click()

  async function readExcel(file: File | undefined) {
    if (excelInput.current) excelInput.current.value = ''
    if (file === undefined) return
    setExcelError(false)
    try {
      const buffer = await file.arrayBuffer()
      // 엑셀 읽기(xlsx)는 올릴 때만 불러온다(명단 화면을 여는 데는 필요 없다)
      const { readRoster } = await import('@/lib/staff/rosterExcel')
      const read = readRoster(buffer, members, {
        today,
        hours: clinic.profile.hours,
        plans,
        periodStart: (person) => periodStartOf(person, settings, today),
      })
      setPreview({ fileName: file.name, read })
    } catch {
      setExcelError(true)
    }
  }

  async function importRows(rows: RosterRow[]) {
    try {
      await store.importRoster(rows, today)
      setPreview(null)
    } finally {
      // 중간에 실패해도 들어간 사람이 있다 → 늘 다시 읽는다
      reload()
    }
  }

  async function purge() {
    if (purging === null || purgeBusy) return
    setPurgeBusy(true)
    setPurgeError(null)
    try {
      await store.purgeMember(purging, today)
      reload()
    } catch (error) {
      setPurgeError(codeOf(error, 'E-STAFF-SAVE-FAILED'))
    } finally {
      setPurgeBusy(false)
      setPurging(null)
    }
  }

  const excelPicker = (
    <input
      ref={excelInput}
      type="file"
      accept=".xlsx,.xls"
      aria-label="엑셀 파일 고르기"
      className="hidden"
      onChange={(event) => void readExcel(event.target.files?.[0])}
    />
  )

  if (state === 'loading') return <p className="text-small text-muted">직원 명단을 읽는 중이에요…</p>
  if (state === 'failed') {
    return (
      <div className="flex flex-col items-start gap-2">
        <ErrorCard code="E-STAFF-READ-FAILED" />
        <button type="button" className={ds.button.secondarySmall} onClick={reload}>
          다시 불러오기
        </button>
      </div>
    )
  }

  if (view.kind === 'form') {
    const editing = view.id === null ? null : (members.find((m) => m.id === view.id) ?? null)
    return (
      <MemberForm
        key={view.id ?? 'new'}
        member={editing}
        members={members}
        calendarStaff={staffList}
        settings={settings}
        today={today}
        store={store}
        onBack={() => setView({ kind: 'list' })}
        onCancel={() => setView(editing !== null && view.back === 'card' ? { kind: 'card', id: editing.id, saved: null, seen: members } : { kind: 'list' })}
        onSaved={(saved) => {
          reload()
          setView({ kind: 'card', id: saved.id, saved, seen: members })
        }}
      />
    )
  }

  if (view.kind === 'card') {
    // 방금 저장했고 직원 목록을 아직 다시 읽지 않았으면 저장한 값, 아니면 목록의 값
    const listed = members.find((m) => m.id === view.id) ?? null
    const member = view.saved !== null && members === view.seen ? view.saved : (listed ?? view.saved)
    if (member !== null) {
      return (
        <MemberCard
          key={member.id}
          member={member}
          today={today}
          settings={settings}
          plans={plans}
          leaves={leaves}
          calendarStaff={calendarStaff}
          files={files}
          onBack={() => setView({ kind: 'list' })}
          onEdit={() => setView({ kind: 'form', id: member.id, back: 'card' })}
        />
      )
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {excelPicker}
      {excelError && <ErrorCard code="E-STAFF-EXCEL-FAILED" />}
      {purgeError !== null && <ErrorCard code={purgeError} />}
      {leavesFailed && (
        <div className="flex flex-col items-start gap-2">
          <ErrorCard code="E-STAFF-READ-FAILED" />
          <button type="button" className={ds.button.secondarySmall} onClick={retryLeaves}>
            다시 불러오기
          </button>
        </div>
      )}
      {members.length === 0 ? (
        <RosterEmpty onAdd={() => setView({ kind: 'form', id: null, back: 'list' })} onPickExcel={pickExcel} />
      ) : (
        <RosterList
          members={members}
          active={active}
          left={left}
          today={today}
          tab={tab}
          remaining={(member) => remainingText(member, leaves, settings, today)}
          calendarStaff={calendarStaff}
          onTab={setTab}
          onOpen={openCard}
          onAdd={() => setView({ kind: 'form', id: null, back: 'list' })}
          onPickExcel={pickExcel}
          onPurge={(member) => {
            setPurgeError(null)
            setPurging(member)
          }}
        />
      )}
      {preview !== null && (
        <ExcelPreview fileName={preview.fileName} read={preview.read} members={members} onImport={importRows} onCancel={() => setPreview(null)} />
      )}
      {purging !== null && (
        <ConfirmDialog
          title={`${purging.name} 님을 지울까요?`}
          body={`${purging.name} 님 정보와 서류 파일을 모두 지워요. 되돌릴 수 없어요.`}
          confirmLabel="지우기"
          busy={purgeBusy}
          onConfirm={() => void purge()}
          onCancel={() => !purgeBusy && setPurging(null)}
        />
      )}
    </div>
  )
}
