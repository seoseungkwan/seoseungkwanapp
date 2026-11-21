'use client'

import Link from 'next/link'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { EMPLOYMENT_LABEL, jobLabel } from '@/components/staff/labels'
import { ds } from '@/components/ui/classes'
import { todayInKorea } from '@/lib/analytics/dates'
import { phoneText } from '@/lib/clinic/format'
import { tenure } from '@/lib/staff/roster'
import { planOn, weekSummary } from '@/lib/staff/schedule'
import { STAFF_FILE_MAX_BYTES, staffFileMime, type StaffFileStore } from '@/lib/storage/staffFiles'
import type { ClinicStaff } from '@/types/clinicProfile'
import type { ErrorCode } from '@/types/errors'
import type { Leave, StaffFile, StaffMember, StaffSettings, WeekPlan } from '@/types/staff'
import { ConfirmDialog } from './ConfirmDialog'
import { CalendarPerson } from './RosterList'
import { codeOf, daysText, isActive, sizeText, statusOf } from './rosterText'

// 직원 카드(staff AC-7612.2, 시안 list.html ②): 머리(이름·직종·근무 형태·근속·[고치기]) · 직원 정보(모든 칸, 계좌도 그대로) ·
// 연차 요약([휴가 보기]) · 기본 근무 요약([근무표 보기]) · 서류 파일(올리기·받기·지우기). 퇴사자 카드도 같은 모양이다(AC-7612.5)

const DOC_ACCEPT = '.pdf,.jpg,.jpeg,.png'
const BASIS_TEXT = { hire: '입사일 기준', jan1: '1월 1일 기준' } as const

function Panel({ title, aside, action, children }: { title: ReactNode; aside?: ReactNode; action?: ReactNode; children: ReactNode }) {
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className={`${ds.panel} flex min-w-0 flex-col gap-3 px-4 py-4`}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 id={titleId} className="text-body font-semibold text-ink">
          {title}
        </h3>
        {aside}
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </section>
  )
}

// sub = 숫자 아래 작은 줄('다음 해로 넘김'으로 넘어온 일수 '넘어옴 {n}일', AC-7612.2 — 휴가 표·한 사람 기록과 같다)
function Stat({ label, value, strong, sub }: { label: string; value: string; strong?: boolean; sub?: string | null }) {
  return (
    <div className={`rounded-control border px-3 py-2 ${strong ? 'border-accent-soft bg-accent-soft' : 'border-line'}`}>
      <small className="block text-caption text-muted">{label}</small>
      <b className={`text-lead tabular-nums ${strong ? 'text-accent' : 'text-ink'}`}>{value}</b>일
      {sub ? <small className="block text-caption tabular-nums text-muted">{sub}</small> : null}
    </div>
  )
}

// '월~금 09:00~18:00 (점심 13:00~14:00)' → 요일은 굵게, 시간 뒤 덧붙은 말(점심·격주·쉬는 날)은 옅게
function WorkLine({ line }: { line: string }) {
  const space = line.indexOf(' ')
  const days = line.slice(0, space)
  const rest = line.slice(space + 1)
  const found = /^(\d{2}:\d{2}~\d{2}:\d{2})(?: (.*))?$/.exec(rest)
  const time = found ? found[1] : ''
  const extra = found ? (found[2] ?? '') : rest
  return (
    <li>
      <b className="inline-block min-w-13 font-semibold text-ink">{days}</b> {time}
      {time && extra ? ' ' : ''}
      {extra && <span className="text-muted">{extra}</span>}
    </li>
  )
}

type Docs = StaffFile[] | 'loading' | 'failed'

export function MemberCard({
  member,
  today,
  settings,
  plans,
  leaves,
  calendarStaff,
  files,
  onBack,
  onEdit,
}: {
  member: StaffMember
  today: string
  settings: StaffSettings
  plans: readonly WeekPlan[]
  /** 휴가 줄. 아직 못 읽었으면 null(연차 숫자는 '–') */
  leaves: readonly Leave[] | null
  calendarStaff(id: string | null): ClinicStaff | null
  files: StaffFileStore
  onBack(): void
  onEdit(): void
}) {
  const [docs, setDocs] = useState<Docs>('loading')
  const [attempt, setAttempt] = useState(0)
  const [fileError, setFileError] = useState<ErrorCode | null>(null)
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState<StaffFile | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let current = true
    files.listFiles('doc').then(
      (list) => {
        if (current) setDocs(list.filter((file) => file.staffId === member.id))
      },
      () => {
        if (current) setDocs('failed')
      },
    )
    return () => {
      current = false
    }
  }, [files, member.id, attempt])

  const refresh = () => setAttempt((n) => n + 1)
  const staff = calendarStaff(member.calendarStaffId)
  const status = leaves === null ? null : statusOf(member, leaves, settings, today)
  // 기간 경계는 휴가와 상관없다 → 휴가를 읽기 전에도 머리 글은 보인다
  const period = (status ?? statusOf(member, [], settings, today))?.period ?? null
  const ownPlans = plans.filter((plan) => plan.staffId === member.id)
  const plan = planOn(ownPlans, member.hiredOn > today ? member.hiredOn : today)
  const work = plan === null ? null : weekSummary(plan)

  async function upload(chosen: FileList | null) {
    const list = chosen ? [...chosen] : []
    if (inputRef.current) inputRef.current.value = ''
    if (list.length === 0 || uploading) return
    setFileError(null)
    // 받지 않는 종류·10MB 넘는 파일은 보내지 않는다(바구니·DB도 막지만 먼저 알린다)
    const good = list.filter((file) => staffFileMime('doc', file.name) !== null && file.size > 0 && file.size <= STAFF_FILE_MAX_BYTES)
    if (good.length < list.length) setFileError('E-STAFF-FILE-FAILED')
    if (good.length === 0) return
    setUploading(true)
    try {
      for (const file of good) await files.uploadFile({ kind: 'doc', staffId: member.id, file })
    } catch (error) {
      setFileError(codeOf(error, 'E-STAFF-FILE-FAILED'))
    } finally {
      setUploading(false)
      refresh()
    }
  }

  async function download(file: StaffFile) {
    setFileError(null)
    try {
      await files.downloadFile(file)
    } catch (error) {
      setFileError(codeOf(error, 'E-STAFF-FILE-FAILED'))
    }
  }

  async function remove() {
    if (deleting === null || deleteBusy) return
    setDeleteBusy(true)
    setFileError(null)
    try {
      await files.deleteFile(deleting)
    } catch (error) {
      setFileError(codeOf(error, 'E-STAFF-FILE-FAILED'))
    } finally {
      setDeleteBusy(false)
      setDeleting(null)
      refresh()
    }
  }

  const info: [string, ReactNode][] = [
    ['이름', member.name],
    ['직종', jobLabel(member)],
    ['근무 형태', EMPLOYMENT_LABEL[member.employment]],
    ['주 근무시간', `${member.weeklyHours}시간`],
    ['입사일', member.hiredOn],
    ['퇴사일', member.leftOn],
    ['연락처', member.phone === null ? null : phoneText(member.phone)],
    ['생일', member.birthday],
    ['주소', member.address],
    ['은행', member.bank],
    ['계좌번호', member.accountNo],
    [
      '예약 시행자',
      staff === null ? null : (
        <>
          <CalendarPerson staff={staff} />
          <small className="block text-caption text-muted">휴가가 예약 달력에 &apos;휴무&apos;로 보여요</small>
        </>
      ),
    ],
    ['메모', member.memo],
  ]

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <button type="button" className={`${ds.textButton} self-start text-small`} onClick={onBack}>
        ← 명단으로
      </button>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-subtitle font-semibold text-ink">{member.name}</h2>
        <span className={ds.chip.neutral}>{jobLabel(member)}</span>
        <span className={ds.chip.neutral}>{`${EMPLOYMENT_LABEL[member.employment]} · 주 ${member.weeklyHours}시간`}</span>
        {isActive(member, today) ? (
          <span className={ds.chip.accent}>{`재직 ${tenure(member.hiredOn, today)}`}</span>
        ) : (
          <span className={ds.chip.neutral}>{`퇴사 ${member.leftOn}`}</span>
        )}
        <button type="button" className={`${ds.button.secondary} ml-auto`} onClick={onEdit}>
          고치기
        </button>
      </div>

      <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] items-start gap-3">
        <Panel title="직원 정보">
          <dl className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-body">
            {info.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-small text-muted">{label}</dt>
                <dd className="break-all text-ink">{value === null || value === '' ? <span className="text-muted">없음</span> : value}</dd>
              </div>
            ))}
          </dl>
        </Panel>

        <div className="flex min-w-0 flex-col gap-3">
          <Panel
            title="연차"
            aside={<span className="text-caption text-muted">{period === null ? BASIS_TEXT[settings.leaveBasis] : `${period.from} ~ ${period.to} · ${BASIS_TEXT[settings.leaveBasis]}`}</span>}
          >
            <div className="grid grid-cols-3 gap-2">
              <Stat
                label="생긴 연차"
                value={status === null ? '–' : `${status.granted}`}
                sub={status !== null && status.carried !== 0 ? `넘어옴 ${status.carried}일` : null}
              />
              <Stat label="쓴 연차" value={status === null ? '–' : `${status.used}`} />
              <Stat label="남은 연차" value={status === null ? '–' : `${status.left}`} strong />
            </div>
            <div>
              <Link href="/staff/leave" className={ds.button.secondarySmall}>
                휴가 보기
              </Link>
            </div>
          </Panel>

          <Panel title="기본 근무">
            {work === null ? (
              <p className="text-small text-muted">기본 근무를 아직 정하지 않았어요.</p>
            ) : (
              <ul className="flex flex-col gap-1 text-small text-ink">
                {work.map((line) => (
                  <WorkLine key={line} line={line} />
                ))}
              </ul>
            )}
            <div>
              <Link href="/staff/schedule" className={ds.button.secondarySmall}>
                근무표 보기
              </Link>
            </div>
          </Panel>
        </div>
      </div>

      <Panel
        title={
          <>
            {Array.isArray(docs) ? '서류 파일 ' : '서류 파일'}
            {Array.isArray(docs) && <span className="text-caption font-normal text-muted">{`${docs.length}개`}</span>}
          </>
        }
        action={
          <>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={DOC_ACCEPT}
              aria-label="서류 파일 고르기"
              className="hidden"
              onChange={(event) => void upload(event.target.files)}
            />
            <button type="button" aria-busy={uploading || undefined} className={ds.button.primarySmall} onClick={() => !uploading && inputRef.current?.click()}>
              파일 올리기
            </button>
          </>
        }
      >
        {fileError !== null && <ErrorCard code={fileError} />}
        {docs === 'loading' && <p className="text-small text-muted">서류 파일을 읽는 중이에요…</p>}
        {docs === 'failed' && (
          <div className="flex flex-col items-start gap-2">
            <ErrorCard code="E-STAFF-READ-FAILED" />
            <button type="button" className={ds.button.secondarySmall} onClick={refresh}>
              다시 불러오기
            </button>
          </div>
        )}
        {Array.isArray(docs) && docs.length > 0 && (
          <ul className="flex flex-col">
            {docs.map((file) => (
              <li key={file.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line py-2 last:border-b-0">
                <span aria-hidden="true">{file.mime === 'application/pdf' ? '📄' : '🖼️'}</span>
                <span className="break-all text-body font-semibold text-ink">{file.name}</span>
                <span className="text-caption text-muted">{`${todayInKorea(new Date(file.createdAt))} 올림 · ${sizeText(file.size)}`}</span>
                <span className="ml-auto flex gap-1.5">
                  <button type="button" className={ds.button.secondarySmall} onClick={() => void download(file)}>
                    받기
                  </button>
                  <button type="button" className={ds.button.ghostSmall} onClick={() => setDeleting(file)}>
                    지우기
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className={ds.help}>PDF·그림 파일(jpg·png)을 올릴 수 있어요. 한 개에 10MB까지예요.</p>
      </Panel>

      {deleting !== null && (
        <ConfirmDialog
          title="이 파일을 지울까요?"
          body={deleting.name}
          confirmLabel="지우기"
          busy={deleteBusy}
          onConfirm={() => void remove()}
          onCancel={() => !deleteBusy && setDeleting(null)}
        />
      )}
    </div>
  )
}

/** 남은 연차 글('3일'). 휴가를 아직 못 읽었으면 '–' */
export function remainingText(member: StaffMember, leaves: readonly Leave[] | null, settings: StaffSettings, today: string): string {
  const status = leaves === null ? null : statusOf(member, leaves, settings, today)
  return status === null ? '–' : daysText(status.left)
}
