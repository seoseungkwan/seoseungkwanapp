import type { ReactNode } from 'react'
import { AppShell } from '@/components/shell/AppShell'
import { IdleLogout } from '@/components/shell/IdleLogout'
import { guardPage } from '@/lib/auth/guard.server'

// 앱 화면((app)/*) 공통 틀: 그리기 전에 guard가 병원 상태를 본다(design.md '데이터 흐름').
// 병원 줄 없음 → /signup · 대기·거절 → /pending · 로그인 풀림 → /login · 읽기 실패 → 오류 화면 · 승인 → AppShell + IdleLogout.
// 레이아웃은 지금 경로를 받지 못하고, 옆 화면으로 옮겨 갈 때는 다시 그려지지 않는다 → 경로와 상관없는 앱 공통 판정만 한다
// (승인된 사람의 앱 경로 = '/dashboard'와 같은 판정). 관리자만 여는 /admin은 그 페이지가 따로 본다

// 요청의 로그인 세션으로만 그릴 수 있다 → 빌드 때 미리 그리지 않는다
export const dynamic = 'force-dynamic'

const APP_PATH = '/dashboard'

export default async function AppLayout({ children }: { children: ReactNode }) {
  const me = await guardPage(APP_PATH)
  // guard(gate)는 승인된 병원 줄이 있을 때만 앱 경로를 연다 → 여기 올 수 없다. 던지면 오류 화면(app/error.tsx)이 내용 없이 안내한다
  if (me.hospital?.status !== 'approved') throw new Error('승인된 병원 줄이 없어요')
  return (
    <>
      <IdleLogout />
      <AppShell hospitalName={me.hospital.name} email={me.email} isAdmin={me.isAdmin}>
        {children}
      </AppShell>
    </>
  )
}
