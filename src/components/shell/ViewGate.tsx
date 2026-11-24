'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, type ReactNode } from 'react'
import { isAdminScreen, isViewBlockedPath } from './viewPaths'
import { ViewingProvider, type Viewing } from './viewing'

// 다른 의원 보는 중 본문 문지기 (admin-view REQ-8006 AC-8006.2·AC-8006.3, design.md '앱 틀'·기본값 5·8). TabGate와 같은 틀:
// (app) 레이아웃은 지금 주소를 모르고 옆 화면으로 옮길 때 다시 그려지지 않는다 → 이 부품이 주소(usePathname)마다 거른다.
// - 예약·환자·청구와 그 아래(비트 PC 연결 /claim/setup 포함, viewPaths isViewBlockedPath): 말 없이 /dashboard로 바꾼다(replace).
//   그동안 본문을 비워 그 화면의 자료 읽기가 돌지 않는다. 글·알림은 없다(대시보드 안 링크를 눌러도 여기로 돌아온다)
// - 그 밖: 본문을 ViewingProvider 안에 그린다(useReadOnly 참 → 쓰기 단추 숨김). 관리자 화면(/admin과 그 아래)은 의원과 상관없어 viewing={null}
// AppShell이 보는 중(viewing 있음)일 때만 그린다. 보이기만 막는다 — 자료는 RLS가 보는 의원 줄만 주고 쓰기를 막는다(ADR-046)

export function ViewGate({ viewing, children }: { viewing: Viewing; children: ReactNode }) {
  const pathname = usePathname() ?? ''
  const router = useRouter()
  const blocked = isViewBlockedPath(pathname)

  useEffect(() => {
    if (blocked) router.replace('/dashboard')
  }, [blocked, router])

  if (blocked) return null
  return <ViewingProvider viewing={isAdminScreen(pathname) ? null : viewing}>{children}</ViewingProvider>
}
