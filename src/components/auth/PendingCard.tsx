'use client'

import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { todayInKorea } from '@/lib/analytics/dates'
import { ui } from '@/components/ui/classes'
import type { Hospital } from '@/lib/auth/hospital.server'
import { SignOutButton } from './SignOutButton'

// /pending에 오는 병원 줄: 승인 대기 또는 거절(guard가 그 밖의 상태는 다른 곳으로 보낸다)
export type PendingHospital = Hospital & { status: 'pending' | 'rejected' }

type Row = { label: string; value: string; className: string }

// 신청일: DB 시각(UTC) → 한국 날짜 'YYYY-MM-DD'
const appliedOn = (createdAt: string) => todayInKorea(new Date(createdAt))

// 연락처: DB에는 숫자 9~11자리만 있다 → 목업처럼 끊어 보인다(02는 서울 번호). 비웠으면 '—'(목업 Admin의 빈 연락처)
function phoneText(phone: string | null): string {
  if (!phone) return '—'
  if (!/^[0-9]{9,11}$/.test(phone)) return phone
  const head = phone.startsWith('02') ? 2 : 3
  return `${phone.slice(0, head)}-${phone.slice(head, -4)}-${phone.slice(-4)}`
}

// 단계 하나: 앞 단계와 1px 선(before)으로 잇는다. 첫 단계는 선 없음. 끝난 단계 ink-2(+ ok 체크) · 지금 단계 ink 600
const STEP = 'flex items-center gap-1.5 before:h-px before:w-6 before:bg-line first:before:hidden'
const STEP_DONE = `${STEP} text-ink-2`
const STEP_CURRENT = `${STEP} font-semibold text-ink`

// 신청 내용 값의 모양: 병원 이름은 굵게, 긴 이메일은 아무 데서나 줄을 바꾼다
const STRONG = 'font-medium'
const EMAIL = 'wrap-anywhere'

// 보낸 신청 내용 카드: 기록 목록(왼쪽 칸 이름 96px muted · 오른쪽 값 ink, 줄마다 1px 선). 값은 글자로만 그린다
function Summary({ id, rows }: { id: string; rows: Row[] }) {
  return (
    <section aria-labelledby={id} className={`${ui.card} flex flex-col gap-3`}>
      <h2 id={id} className="text-panel font-semibold text-ink">
        보낸 신청 내용
      </h2>
      <dl className="flex flex-col text-table">
        {rows.map((row) => (
          <div key={row.label} className="flex gap-4 border-t border-line py-2">
            <dt className="w-24 shrink-0 text-muted">{row.label}</dt>
            <dd className={`min-w-0 flex-1 text-ink ${row.className}`}>{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function Check() {
  return (
    <svg
      aria-hidden="true"
      className="shrink-0 text-ok"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}

// 제목 옆 20px 선 아이콘(대기 = 시계 ink-2, 거절 = X danger). 색 원 바탕은 없다. 제목 첫 줄 가운데에 맞춘다
function StateIcon({ className, children }: { className: string; children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      className={`mt-1.5 shrink-0 max-md:mt-1 ${className}`}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      {children}
    </svg>
  )
}

const PAGE = 'flex w-full max-w-140 flex-col gap-6'
const HEAD = 'flex items-start gap-3'
const HEAD_TEXT = 'flex min-w-0 flex-col gap-1.5'
const TITLE = 'text-title font-semibold text-ink max-md:text-title-sm'
const LEAD = 'text-body text-ink-2'
const ACTIONS = 'flex flex-wrap items-center gap-3'

// 승인 대기(목업 Pending): 단계 칩 · 제목 · 보낸 신청 내용(5줄) · [상태 다시 확인] · [로그아웃]
function Pending({ hospital }: { hospital: PendingHospital }) {
  const router = useRouter()
  return (
    <div className={PAGE}>
      <ol aria-label="가입 단계" className="flex list-none flex-wrap items-center gap-2 text-table">
        <li className={STEP_DONE}>
          <Check />
          구글 로그인
        </li>
        <li className={STEP_DONE}>
          <Check />
          가입 신청
        </li>
        <li aria-current="step" className={STEP_CURRENT}>
          <span>03</span>관리자 승인
        </li>
      </ol>

      <div className={HEAD}>
        <StateIcon className="text-ink-2">
          <path d="M12 7v5l3 2" />
        </StateIcon>
        <div className={HEAD_TEXT}>
          <h1 className={TITLE}>신청을 확인하고 있습니다</h1>
          <p className={LEAD}>
            관리자가 승인하면 대시보드를 쓸 수 있습니다. 승인된 뒤에는 이 화면을 새로 고치거나 다시 로그인해 주세요.
          </p>
        </div>
      </div>

      <Summary
        id="pd-summary"
        rows={[
          { label: '신청일', value: appliedOn(hospital.createdAt), className: '' },
          { label: '병원 이름', value: hospital.name, className: STRONG },
          { label: '신청자', value: hospital.applicantName, className: '' },
          { label: '구글 계정', value: hospital.email, className: EMAIL },
          { label: '연락처', value: phoneText(hospital.phone), className: '' },
        ]}
      />

      <div className={ACTIONS}>
        {/* 서버가 다시 그린다 → guard가 승인됐으면 /dashboard로 보낸다(AC-005.2) */}
        <button type="button" className={ui.button.primary} onClick={() => router.refresh()}>
          상태 다시 확인
        </button>
        <SignOutButton className={ui.textButton} />
      </div>
    </div>
  )
}

// 거절됨(목업 Rejected): 제목 · 문의 안내 · 보낸 신청 내용(목업의 3줄) · [다른 계정으로 로그인] · [로그아웃]. 다시 확인 단추는 없다
function Rejected({ hospital }: { hospital: PendingHospital }) {
  return (
    <div className={PAGE}>
      <div className={HEAD}>
        <StateIcon className="text-danger">
          <path d="M8.5 8.5l7 7" />
          <path d="M15.5 8.5l-7 7" />
        </StateIcon>
        <div className={HEAD_TEXT}>
          <h1 className={TITLE}>가입이 승인되지 않았습니다</h1>
          {/* 문의 이메일은 정할 때까지 목업 빈칸 그대로(design.md) */}
          <p className={LEAD}>
            궁금한 점은 <span className="font-semibold text-ink">[이메일 주소]</span>로 문의해 주세요. 관리자가 다시 검토해
            승인하면 이 계정으로 이어서 쓸 수 있습니다.
          </p>
        </div>
      </div>

      <Summary
        id="rj-summary"
        rows={[
          { label: '신청일', value: appliedOn(hospital.createdAt), className: '' },
          { label: '병원 이름', value: hospital.name, className: STRONG },
          { label: '구글 계정', value: hospital.email, className: EMAIL },
        ]}
      />

      <div className={ACTIONS}>
        <SignOutButton className={ui.button.secondary}>다른 계정으로 로그인</SignOutButton>
        <SignOutButton className={ui.textButton} />
      </div>
    </div>
  )
}

// /pending 본문. 상태에 따라 대기·거절 카드 하나를 그린다
export function PendingCard({ hospital }: { hospital: PendingHospital }) {
  return hospital.status === 'rejected' ? <Rejected hospital={hospital} /> : <Pending hospital={hospital} />
}

// 위쪽 띠 오른쪽 끝 [로그아웃](AuthFrame headerEnd, 글자 단추). 대기·거절 화면 둘 다 쓴다
export function HeaderSignOut() {
  return <SignOutButton className={ui.textButton} />
}
