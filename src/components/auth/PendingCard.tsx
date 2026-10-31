'use client'

import { useRouter } from 'next/navigation'
import { Icon } from '@/components/common/Icon'
import { todayInKorea } from '@/lib/analytics/dates'
import { ds } from '@/components/ui/classes'
import type { Hospital } from '@/lib/auth/hospital.server'
import { SignOutButton } from './SignOutButton'
import { Stepper } from './Stepper'

// 승인 대기·거절 본문 (b2b-redesign REQ-216 AC-216.1·AC-216.2). 짜임은 승인 시안 docs/mockups/b2b-redesign/screens.mjs의 pendingBody·rejectedBody다.
// 카드 상자 없이 AuthFrame 480 칸에 바로 놓는다: (단계) → 상태 줄 → h1 → 안내 → 보낸 신청 내용 → 단추 하나.
// 본문 [로그아웃]은 없다(사용자 결정). 페이지의 [로그아웃]은 위 줄 HeaderSignOut 하나뿐이다

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

// 신청 내용 값의 모양: 날짜·번호는 같은 폭 숫자, 병원 이름은 600, 긴 이메일은 아무 데서나 줄을 바꾼다
const NUM = 'tabular-nums'
const STRONG = 'font-semibold'
const EMAIL = 'wrap-anywhere'

// 상태 줄(위 24px): 상태 칩(아이콘 12) + "<신청일> 신청"(small muted). 대기 = warning·시계, 거절 = negative·X
function StatusLine({ hospital }: { hospital: PendingHospital }) {
  const rejected = hospital.status === 'rejected'
  return (
    <p className="mt-6 flex items-center gap-2">
      <span className={rejected ? ds.chip.negative : ds.chip.warning}>
        <Icon name={rejected ? 'x' : 'clock'} size={12} />
        {rejected ? '승인되지 않음' : '승인 대기'}
      </span>
      <span className={`text-small text-muted ${NUM}`}>{appliedOn(hospital.createdAt)} 신청</span>
    </p>
  )
}

// 보낸 신청 내용: 테두리·바탕 없는 section. h2(small 600 muted, 위 32px) → 기록 목록(위 8px·위 1px line).
// 줄마다 96px 이름(small muted) + 값(body ink), 줄 아래 1px line, 위아래 12px·44px 이상. 값은 글자로만 그린다
function Summary({ id, rows }: { id: string; rows: Row[] }) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="mt-8 text-small font-semibold text-muted">
        보낸 신청 내용
      </h2>
      <dl className="mt-2 border-t border-line">
        {rows.map((row) => (
          <div key={row.label} className="flex min-h-11 items-baseline border-b border-line py-3">
            <dt className="w-24 shrink-0 text-small text-muted">{row.label}</dt>
            <dd className={`min-w-0 flex-1 text-body text-ink ${row.className}`}>{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

const PAGE = 'flex min-w-0 flex-col'
const TITLE = 'mt-2 text-heading-m font-semibold text-ink md:text-heading'
const LEAD = 'mt-2 text-body text-ink-2'
// 큰 주 단추 하나(위 24px): 768px 이상은 글자 폭, 미만은 전체 폭
const ACTION = `${ds.button.primaryLarge} mt-6 self-start max-md:w-full`

// 승인 대기(목업 Pending): 단계 · 상태 줄 · 제목 · 안내 · 보낸 신청 내용(5줄) · [상태 다시 확인]
function Pending({ hospital }: { hospital: PendingHospital }) {
  const router = useRouter()
  return (
    <div className={PAGE}>
      <Stepper current={3} />
      <StatusLine hospital={hospital} />
      <h1 className={TITLE}>신청을 확인하고 있습니다</h1>
      <p className={LEAD}>
        관리자가 승인하면 대시보드를 쓸 수 있습니다. 승인된 뒤에는 이 화면을 새로 고치거나 다시 로그인해 주세요.
      </p>
      <Summary
        id="pd-summary"
        rows={[
          { label: '신청일', value: appliedOn(hospital.createdAt), className: NUM },
          { label: '병원 이름', value: hospital.name, className: STRONG },
          { label: '신청자', value: hospital.applicantName, className: '' },
          { label: '구글 계정', value: hospital.email, className: EMAIL },
          { label: '연락처', value: phoneText(hospital.phone), className: NUM },
        ]}
      />
      {/* 서버가 다시 그린다 → guard가 승인됐으면 /dashboard로 보낸다(AC-005.2) */}
      <button type="button" className={ACTION} onClick={() => router.refresh()}>
        상태 다시 확인
      </button>
    </div>
  )
}

// 거절됨(목업 Rejected): 상태 줄 · 제목 · 문의 안내 · 보낸 신청 내용(목업의 3줄) · [다른 계정으로 로그인]. 단계·다시 확인 단추는 없다
function Rejected({ hospital }: { hospital: PendingHospital }) {
  return (
    <div className={PAGE}>
      <StatusLine hospital={hospital} />
      <h1 className={TITLE}>가입이 승인되지 않았습니다</h1>
      <p className={LEAD}>
        궁금한 점은 신청을 검토한 관리자에게 문의해 주세요. 관리자가 다시 검토해 승인하면 이 계정으로 이어서 쓸 수 있습니다.
      </p>
      <Summary
        id="rj-summary"
        rows={[
          { label: '신청일', value: appliedOn(hospital.createdAt), className: NUM },
          { label: '병원 이름', value: hospital.name, className: STRONG },
          { label: '구글 계정', value: hospital.email, className: EMAIL },
        ]}
      />
      <SignOutButton className={ACTION}>다른 계정으로 로그인</SignOutButton>
    </div>
  )
}

// /pending 본문. 상태에 따라 대기·거절 하나를 그린다
export function PendingCard({ hospital }: { hospital: PendingHospital }) {
  return hospital.status === 'rejected' ? <Rejected hospital={hospital} /> : <Pending hospital={hospital} />
}

// 위쪽 줄 오른쪽 끝 [로그아웃](AuthFrame headerEnd, 글자만 있는 ghost 작은 단추). 대기·거절 화면 둘 다 쓴다
export function HeaderSignOut() {
  return <SignOutButton className={ds.button.ghostSmall} />
}
