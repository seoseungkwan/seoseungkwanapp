import Link from 'next/link'
import { RuleSettings } from './RuleSettings'

// 설정 화면 (precheck REQ-012 AC-012.6, 목업 화면 10). 제목 '설정' → 안쪽 메뉴 [청구·연락 | 비트 PC 연결] → '청구·연락'의 패널들.
// 안쪽 메뉴의 모양은 비트 PC 연결 화면(SetupScreen의 SettingsSubnav, AC-034.2)과 같다. 페이지 이동 링크라 tablist가 아니고 aria-current를 쓴다
const subBase =
  'relative inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-control px-3 text-body no-underline first:-ml-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent max-md:h-11'
const subIdle = `${subBase} font-medium text-ink-2 hover:text-ink`
const subCurrent = `${subBase} font-semibold text-ink after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:bg-accent`

export function SettingsPage() {
  return (
    <div className="flex flex-col gap-4 max-md:gap-3">
      <div className="flex flex-col gap-3">
        <h1 className="text-title font-semibold text-ink">설정</h1>
        <nav aria-label="설정 안 메뉴" className="flex border-b border-line">
          <Link href="/settings" aria-current="page" className={subCurrent}>
            청구·연락
          </Link>
          <Link href="/claim/setup" className={subIdle}>
            비트 PC 연결
          </Link>
        </nav>
      </div>
      <RuleSettings />
      {/* 뒤 TASK가 이 아래에 차례로 더한다: 병원 문구·상병 연결표(TASK-18) · 문자 문구(TASK-25) · 백업(TASK-32) */}
    </div>
  )
}
