import type { Metadata } from 'next'
import { cache } from 'react'
import { AuthFrame } from '@/components/auth/AuthFrame'
import { HeaderSignOut, PendingCard, type PendingHospital } from '@/components/auth/PendingCard'
import { guardPage } from '@/lib/auth/guard.server'
import type { Hospital } from '@/lib/auth/hospital.server'

// 승인 대기·거절(목업 Pending·Rejected). 그리기 전에 guard가 병원 상태를 본다: 대기·거절일 때만 열리고, 아니면 맞는 곳으로 보낸다.
// [상태 다시 확인]은 이 페이지를 서버에서 다시 그린다 → 승인됐으면 guard가 /dashboard로 보낸다

// 요청의 로그인 세션으로만 그릴 수 있다 → 빌드 때 미리 그리지 않는다
export const dynamic = 'force-dynamic'

const isWaiting = (hospital: Hospital | null): hospital is PendingHospital =>
  hospital !== null && (hospital.status === 'pending' || hospital.status === 'rejected')

// 페이지와 탭 이름(generateMetadata)이 같은 요청 안에서 한 번만 읽는다(React cache). 맞지 않는 상태면 guard가 보낸다
const pendingMe = cache(() => guardPage('/pending'))

// guard(gate)는 대기·거절일 때만 /pending을 연다 → 아니면 여기 올 수 없다. 던지면 오류 화면(app/error.tsx)이 내용 없이 안내한다
async function waitingHospital(): Promise<PendingHospital> {
  const { hospital } = await pendingMe()
  if (!isWaiting(hospital)) throw new Error('승인 대기·거절 상태가 아니에요')
  return hospital
}

// 브라우저 탭 이름 (ui-90 AC-402.2): 승인 대기 / 가입 승인 안 됨
export async function generateMetadata(): Promise<Metadata> {
  const hospital = await waitingHospital()
  return { title: hospital.status === 'rejected' ? '가입 승인 안 됨' : '승인 대기' }
}

export default async function PendingPage() {
  const hospital = await waitingHospital()
  return (
    <AuthFrame headerEnd={<HeaderSignOut />}>
      <PendingCard hospital={hospital} />
    </AuthFrame>
  )
}
