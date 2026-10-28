'use client'

import { Fragment, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { todayInKorea } from '@/lib/analytics/dates'
import type { Hospital } from '@/lib/auth/hospital.server'
import { SignOutButton } from './SignOutButton'
import styles from './PendingCard.module.css'

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

// 보낸 신청 내용 카드. 값은 글자로만 그린다
function Summary({ id, rows }: { id: string; rows: Row[] }) {
  return (
    <section aria-labelledby={id} className={styles.card}>
      <h2 id={id} className={styles.cardTitle}>
        보낸 신청 내용
      </h2>
      <dl className={styles.rows}>
        {rows.map((row) => (
          <Fragment key={row.label}>
            <dt className={styles.label}>{row.label}</dt>
            <dd className={row.className}>{row.value}</dd>
          </Fragment>
        ))}
      </dl>
    </section>
  )
}

function Check() {
  return (
    <svg
      aria-hidden="true"
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

// 둥근 네모 안 그림(목업: 대기 = 파랑 시계, 거절 = 주황 X)
function StateIcon({ className, children }: { className: string; children: ReactNode }) {
  return (
    <div aria-hidden="true" className={`${styles.icon} ${className}`}>
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="9" />
        {children}
      </svg>
    </div>
  )
}

// 승인 대기(목업 Pending): 단계 칩 · 제목 · 보낸 신청 내용(5줄) · [상태 다시 확인] · [로그아웃]
function Pending({ hospital }: { hospital: PendingHospital }) {
  const router = useRouter()
  return (
    <div className={styles.page}>
      <ol aria-label="가입 단계" className={styles.steps}>
        <li className={`${styles.step} ${styles.stepDone}`}>
          <Check />
          구글 로그인
        </li>
        <li className={`${styles.step} ${styles.stepDone}`}>
          <Check />
          가입 신청
        </li>
        <li aria-current="step" className={`${styles.step} ${styles.stepCurrent}`}>
          <span className={styles.stepNum}>03</span>관리자 승인
        </li>
      </ol>

      <div className={styles.head}>
        <StateIcon className={styles.iconPending}>
          <path d="M12 7v5l3 2" />
        </StateIcon>
        <div className={styles.headText}>
          <h1 className={styles.title}>신청을 확인하고 있습니다</h1>
          <p className={styles.lead}>
            관리자가 승인하면 대시보드를 쓸 수 있습니다. 승인된 뒤에는 이 화면을 새로 고치거나 다시 로그인해 주세요.
          </p>
        </div>
      </div>

      <Summary
        id="pd-summary"
        rows={[
          { label: '신청일', value: appliedOn(hospital.createdAt), className: styles.date },
          { label: '병원 이름', value: hospital.name, className: styles.strong },
          { label: '신청자', value: hospital.applicantName, className: styles.value },
          { label: '구글 계정', value: hospital.email, className: styles.email },
          { label: '연락처', value: phoneText(hospital.phone), className: styles.value },
        ]}
      />

      <div className={styles.actions}>
        {/* 서버가 다시 그린다 → guard가 승인됐으면 /dashboard로 보낸다(AC-005.2) */}
        <button type="button" className={styles.secondary} onClick={() => router.refresh()}>
          상태 다시 확인
        </button>
        <SignOutButton className={styles.textButton} />
      </div>
    </div>
  )
}

// 거절됨(목업 Rejected): 제목 · 문의 안내 · 보낸 신청 내용(목업의 3줄) · [다른 계정으로 로그인] · [로그아웃]. 다시 확인 단추는 없다
function Rejected({ hospital }: { hospital: PendingHospital }) {
  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <StateIcon className={styles.iconRejected}>
          <path d="M8.5 8.5l7 7" />
          <path d="M15.5 8.5l-7 7" />
        </StateIcon>
        <div className={styles.headText}>
          <h1 className={styles.title}>가입이 승인되지 않았습니다</h1>
          {/* 문의 이메일은 정할 때까지 목업 빈칸 그대로(design.md) */}
          <p className={styles.lead}>
            궁금한 점은 <span className={styles.contact}>[이메일 주소]</span>로 문의해 주세요. 관리자가 다시 검토해
            승인하면 이 계정으로 이어서 쓸 수 있습니다.
          </p>
        </div>
      </div>

      <Summary
        id="rj-summary"
        rows={[
          { label: '신청일', value: appliedOn(hospital.createdAt), className: styles.date },
          { label: '병원 이름', value: hospital.name, className: styles.strong },
          { label: '구글 계정', value: hospital.email, className: styles.email },
        ]}
      />

      <div className={styles.actions}>
        <SignOutButton className={styles.secondary}>다른 계정으로 로그인</SignOutButton>
        <SignOutButton className={styles.textButton} />
      </div>
    </div>
  )
}

// /pending 본문. 상태에 따라 대기·거절 카드 하나를 그린다
export function PendingCard({ hospital }: { hospital: PendingHospital }) {
  return hospital.status === 'rejected' ? <Rejected hospital={hospital} /> : <Pending hospital={hospital} />
}

// 위쪽 띠 오른쪽 끝 [로그아웃](AuthFrame headerEnd). 대기·거절 화면 둘 다 쓴다
export function HeaderSignOut() {
  return <SignOutButton className={styles.headerSignOut} />
}
