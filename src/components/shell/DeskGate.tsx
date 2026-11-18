'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, type ReactNode } from 'react'
import { ds } from '@/components/ui/classes'
import { DESK_HOME, isDeskPath } from './menu'

// 데스크 문지기 (desk-feedback AC-6306.3, design.md '④ 데스크 화면', 시안 docs/mockups/desk-feedback ④).
// (app) 레이아웃은 지금 주소를 모르고 옆 화면으로 옮길 때 다시 그려지지 않는다 → 이 부품이 주소(usePathname)마다 바로 거른다.
// - /dashboard(로그인 뒤 첫 주소): 수납일지로 바꾼다(replace — 뒤로 가기에 대시보드를 남기지 않는다). 그동안 본문은 비운다
// - 세 탭(업무일지·수납일지·예약)과 그 아래: 본문 그대로
// - 그 밖: 본문 대신 막힌 화면. 화면 막기일 뿐이고 자료는 서버 RLS가 주지 않는다(ADR-031)
// AppShell이 desk일 때만 그린다(원장 화면에는 없다)

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

export function DeskGate({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const first = pathname === FIRST_PATH

  useEffect(() => {
    if (first) router.replace(DESK_HOME)
  }, [first, router])

  if (first) return null
  if (!isDeskPath(pathname)) return <DeskBlocked />
  return <>{children}</>
}
