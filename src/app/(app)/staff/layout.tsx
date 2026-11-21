import type { ReactNode } from 'react'
import { StaffNav } from '@/components/staff/StaffNav'
import { currentMe } from '../currentMe.server'

// 직원 탭 틀 (staff REQ-7611, design.md 6절): /staff(명단)·/staff/schedule·/staff/leave·/staff/pay가 함께 쓴다.
// 제목 '직원' → 작은 메뉴(StaffNav) → 그 주소의 페이지. 문지기와 앱 틀은 (app)/layout이 준다. 직원 자료는 페이지 안 화면이 브라우저에서 읽는다.
// 원장 계정만 본다(AC-7611.3): 데스크는 탭이 없고(menu.ts DESK_PATHS 밖), 주소로 와도 앱 틀의 DeskGate가 막힌 화면을 그린다 →
// 여기서는 아무것도 그리지 않아 페이지(자료 읽기)도 그려지지 않는다. 던지면 막힌 화면 대신 오류 화면이 뜬다

export default async function StaffLayout({ children }: { children: ReactNode }) {
  // 문지기가 이미 읽은 나(요청 안에서 한 번만 읽는다)
  const { hospital, desk } = await currentMe()
  if (hospital === null) {
    if (desk) return null
    // 문지기는 승인된 병원 줄(원장)이나 데스크 줄이 있을 때만 앱 경로를 연다 → 아니면 여기 올 수 없다. 오류 화면이 내용 없이 안내한다
    throw new Error('승인된 병원 줄이 없어요')
  }
  return (
    // min-w-0: 안의 넓은 표가 페이지 폭을 늘리지 않게(표는 TableScroll 칸만 옆으로 밀린다, AC-7611.4)
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-3">
        <h1 className="text-title font-semibold text-ink">직원</h1>
        <StaffNav />
      </div>
      {children}
    </div>
  )
}
