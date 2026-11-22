'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, type ReactNode } from 'react'
import { ds } from '@/components/ui/classes'
import { DESK_HOME, deskHomeOf, isDeskPath, type MenuPath } from './menu'

// 데스크 문지기 (desk-feedback AC-6306.3, design.md '④ 데스크 화면', 시안 docs/mockups/desk-feedback ④).
// (app) 레이아웃은 지금 주소를 모르고 옆 화면으로 옮길 때 다시 그려지지 않는다 → 이 부품이 주소(usePathname)마다 바로 거른다.
// - /dashboard(로그인 뒤 첫 주소): 수납일지로 바꾼다(replace — 뒤로 가기에 대시보드를 남기지 않는다). 그동안 본문은 비운다
// - 세 탭(업무일지·수납일지·예약)과 그 아래: 본문 그대로
// - 그 밖: 본문 대신 막힌 화면. 화면 막기일 뿐이고 자료는 서버 RLS가 주지 않는다(ADR-031)
// AppShell이 desk일 때만 그린다(원장 화면에는 없다)
// 관리자만 보는 탭(multi-admin AC-7706.4, design.md 기본값 22): /dashboard는 숨기지 않은 첫 데스크 탭(deskHomeOf — 수납일지 → 업무일지 → 예약)으로 바꾼다.
// 숨긴 데스크 탭 주소는 TabGate가 /dashboard로 보내고 여기서 그 첫 탭으로 간다. 셋 다 숨기면 /dashboard에서 막힌 화면(끝없이 돌지 않는다).
// hidden이 없거나 비면 지금 그대로(수납일지)

const FIRST_PATH = '/dashboard'

// 막힌 화면: 패널 하나 가운데 정렬(앱 안 없는 주소 화면과 같은 틀, 최대 640·위 24 — 휴대폰 0) → 제목 · 글 · [수납일지로 가기](주 단추, 휴대폰 전체 폭)
function DeskBlocked() {
  return (
    <div className={`${ds.panel} mx-auto mt-6 flex max-w-160 flex-col items-center p-6 text-center max-md:mt-0 max-md:px-4`}>
      <h1 className="text-subtitle font-semibold text-ink">데스크 계정은 볼 수 없는 화면이에요</h1>
      <p className="mt-1 text-body text-ink-2">업무일지 · 수납일지 · 예약만 쓸 수 있어요.</p>
      <Link href={DESK_HOME} className={`${ds.button.primary} mt-3 no-underline max-md:w-full`}>
        수납일지로 가기
      </Link>
    </div>
  )
}

export function DeskGate({
  hidden = [],
  children,
}: {
  /** 관리자만 보는 탭(숨긴 탭, multi-admin). 없으면 빈 목록 = 지금 그대로 */
  hidden?: readonly MenuPath[]
  children: ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  // /dashboard에서 바꿀 곳. 데스크 탭을 셋 다 숨겼으면 null → 아래 막힌 화면(/dashboard는 데스크 주소가 아니다)
  const home = pathname === FIRST_PATH ? deskHomeOf(hidden) : null

  useEffect(() => {
    if (home !== null) router.replace(home)
  }, [home, router])

  if (home !== null) return null
  if (!isDeskPath(pathname)) return <DeskBlocked />
  return <>{children}</>
}
