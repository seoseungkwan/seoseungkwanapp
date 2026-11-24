import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { AppShell } from '@/components/shell/AppShell'
import { IdleLogout } from '@/components/shell/IdleLogout'
import { adminOnlyTabs } from '@/components/shell/menu'
import type { Viewing } from '@/components/shell/viewing'
import { readTabAccessRows } from '@/lib/auth/tabAccess.server'
import { currentMe, currentView } from './currentMe.server'

// 앱 화면((app)/*) 공통 틀: 그리기 전에 guard가 병원 상태를 본다(design.md '데이터 흐름').
// 병원 줄 없음 → /signup · 대기·거절 → /pending · 로그인 풀림 → /login · 읽기 실패 → 오류 화면 · 승인 → AppShell + IdleLogout.
// 데스크(내 병원 줄 없음 + 데스크 줄, desk-feedback AC-6305.3) → 그 병원 이름으로 AppShell desk(세 탭·칩·DeskGate는 앱 틀이 한다) + IdleLogout.
// 레이아웃은 지금 경로를 받지 못하고, 옆 화면으로 옮겨 갈 때는 다시 그려지지 않는다 → 경로와 상관없는 앱 공통 판정만 한다
// (승인된 사람의 앱 경로 = '/dashboard'와 같은 판정). 관리자만 여는 /admin은 그 페이지가 따로 본다
// 읽기는 currentMe() = 요청 안에서 한 번 캐시한 guardPage('/dashboard')다. 그리기와 탭 이름(generateMetadata)이 같이 쓴다 (ui-90 AC-402.3)
// 관리자만 보는 탭(multi-admin AC-7706.2, ADR-042): 관리자가 아닌 원장·데스크를 그릴 때만 탭 목록(readTabAccessRows)을 한 번 읽어 숨길 탭을 AppShell에 넘긴다.
// 관리자는 읽지 않고 숨김이 없다. 읽기 실패는 던진다 → 오류 화면(막는 쪽). generateMetadata는 읽지 않는다(탭 이름에 쓰지 않음)
// 다른 의원 보기(admin-view AC-8006.1, ADR-046): 승인된 관리자만 이 브라우저에서 보는 의원을 currentView()로 한 번 읽어(그리기와 탭 이름이 같은 요청 안 한 번)
// AppShell viewing으로 넘긴다. 탭 이름은 보는 의원 이름이고, AppShell은 머리 이름을 보는 의원으로 바꾼다(계정 메뉴의 내 의원 이름은 그대로 넘긴다).
// 관리자 아님·데스크는 읽지 않는다(viewing null). 읽기 실패는 던진다 → 오류 화면(E-PAGE-FAILED)

// 요청의 로그인 세션으로만 그릴 수 있다 → 빌드 때 미리 그리지 않는다
export const dynamic = 'force-dynamic'

type ShellMe = { name: string; email: string; isAdmin: boolean; desk: boolean; viewing: Viewing | null }

// guard(gate)는 승인된 병원 줄이 있거나(원장) 내 병원 줄 없이 데스크 줄이 있을 때(데스크)만 앱 경로를 연다 → 아니면 여기 올 수 없다.
// 던지면 오류 화면(app/error.tsx)이 내용 없이 안내한다. 원장 판정(병원 줄)이 먼저이고, 데스크는 관리자 메뉴를 쓰지 않는다(isAdmin 거짓)
async function approvedMe(): Promise<ShellMe> {
  const me = await currentMe()
  if (me.hospital?.status === 'approved') {
    const viewing = me.isAdmin ? await currentView() : null
    return { name: me.hospital.name, email: me.email, isAdmin: me.isAdmin, desk: false, viewing }
  }
  if (me.hospital === null && me.desk) return { name: me.desk.hospitalName, email: me.email, isAdmin: false, desk: true, viewing: null }
  throw new Error('승인된 병원 줄이 없어요')
}

// 브라우저 탭 이름 (ui-90 AC-402.3): 앱 화면은 "<화면 이름> · <의원 이름>", 화면 이름이 없으면 의원 이름만(데스크는 그 병원 이름, 보는 중은 보는 의원 이름)
export async function generateMetadata(): Promise<Metadata> {
  const { name, viewing } = await approvedMe()
  const shown = viewing?.name ?? name
  return { title: { template: `%s · ${shown}`, default: shown } }
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const me = await approvedMe()
  const hiddenTabs = me.isAdmin ? [] : adminOnlyTabs(await readTabAccessRows())
  return (
    <>
      <IdleLogout />
      <AppShell hospitalName={me.name} email={me.email} isAdmin={me.isAdmin} desk={me.desk} hiddenTabs={hiddenTabs} viewing={me.viewing}>
        {children}
      </AppShell>
    </>
  )
}
