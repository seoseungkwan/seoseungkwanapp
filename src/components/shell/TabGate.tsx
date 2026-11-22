'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, type ReactNode } from 'react'
import { isHiddenPath, type MenuPath } from './menu'

// 관리자만 보는 탭 문지기 (multi-admin REQ-7706 AC-7706.4, design.md '앱 틀'·기본값 18·22, ADR-042).
// (app) 레이아웃은 지금 주소를 모르고 옆 화면으로 옮길 때 다시 그려지지 않는다 → DeskGate처럼 이 부품이 주소(usePathname)마다 거른다.
// - 숨긴 탭 자리(그 아래 포함, menu.ts isHiddenPath): 말 없이 /dashboard로 바꾼다(replace — 뒤로 가기에 숨긴 화면을 남기지 않는다).
//   그동안 본문을 비워 숨긴 화면의 자료 읽기가 돌지 않는다. 글·알림은 없다
// - 그 밖: 본문 그대로
// 보이기만 막는다(자료 권한 RLS는 그대로). AppShell이 숨긴 탭이 있을 때만 그린다(관리자·숨김 없음에는 없다).
// 데스크는 /dashboard에서 DeskGate가 숨기지 않은 첫 데스크 탭으로 다시 바꾼다(끝없이 돌지 않는다)

export function TabGate({ hidden, children }: { hidden: readonly MenuPath[]; children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const blocked = isHiddenPath(pathname, hidden)

  useEffect(() => {
    if (blocked) router.replace('/dashboard')
  }, [blocked, router])

  if (blocked) return null
  return <>{children}</>
}
