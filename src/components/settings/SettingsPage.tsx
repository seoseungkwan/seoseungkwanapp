import Link from 'next/link'
import { WriteOnly } from '@/components/shell/viewing'
import { CashFloatSetting } from './CashFloatSetting'
import { ClinicProfileCard } from './ClinicProfileCard'
import { DeskAccounts } from './DeskAccounts'
import { DxLinks } from './DxLinks'
import { HospitalPhrases } from './HospitalPhrases'
import { InstallFilesCard } from './InstallFilesCard'
import { RuleSettings } from './RuleSettings'
import { TabAccessSettings } from './TabAccessSettings'

// 설정 화면 (precheck REQ-012 AC-012.6, 목업 화면 10). 제목 '설정' → 안쪽 메뉴 [설정 | 비트 PC 연결 | 구글 캘린더 + 새](옛 [청구], clinic-profile AC-6602.1,
// 구글 캘린더는 google-link AC-8528.1) →
// 맨 위 '병원 정보' 칸(clinic-profile AC-6602.1, 원장만 — 데스크에게는 칸이 스스로 그리지 않는다) → '설치 파일' 작은 칸
// (library AC-8109.1 — [자료실 열기], 옛 helper-download AC-5103.2 자리) → '청구'의 패널들(이름은 settings-tab-name AC-5201.1) → '데스크 계정'(desk-feedback AC-6304.2, 원장만)
// → 맨 아래 '관리자만 보는 탭'(multi-admin AC-7707.2, 주 관리자만 — 다른 계정에게는 칸이 스스로 그리지 않는다).
// 안쪽 메뉴의 모양은 비트 PC 연결 화면(SetupScreen의 SettingsSubnav, AC-034.2)과 같다. 페이지 이동 링크라 tablist가 아니고 aria-current를 쓴다.
// 보는 중(admin-view AC-8011.3, 관리자가 다른 의원을 읽기만)에는 [비트 PC 연결]·[구글 캘린더]로 가는 길을 그리지 않는다(WriteOnly — 비트 PC는 그 의원 PC이고,
// 보는 관리자는 구글 연결 표를 읽지 못한다).
// 칸마다 읽기만은 칸이 스스로 한다('관리자만 보는 탭' 칸은 보는 중에 그리지 않는다)
const subBase =
  'relative inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-control px-3 text-body no-underline first:-ml-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent max-md:h-11'
const subIdle = `${subBase} font-medium text-ink-2 hover:text-ink`
const subCurrent = `${subBase} font-semibold text-ink after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:bg-accent`
// 셋째 칸 [구글 캘린더] 옆 작은 꼬리표 '새'(spec google-link AC-8528.1, 시안 calendar.html .newb — 16px 알약, accent-soft 바탕 accent-strong 600)
const newBadge = 'rounded-float bg-accent-soft px-1.5 text-caption leading-4 font-semibold text-accent-strong'

export function SettingsPage() {
  return (
    <div className="flex flex-col gap-4 max-md:gap-3">
      <div className="flex flex-col gap-3">
        <h1 className="text-title font-semibold text-ink">설정</h1>
        <nav aria-label="설정 안 메뉴" className="flex border-b border-line">
          <Link href="/settings" aria-current="page" className={subCurrent}>
            설정
          </Link>
          <WriteOnly>
            <Link href="/claim/setup" className={subIdle}>
              비트 PC 연결
            </Link>
            {/* 보는 중인 관리자는 그 의원 구글 연결(gcal_*)을 한 줄도 못 읽는다(google-link AC-8502.2) → 비트 PC 연결처럼 길을 그리지 않는다 */}
            <Link href="/settings/google-calendar" className={subIdle}>
              구글 캘린더
              <span className={newBadge}>새</span>
            </Link>
          </WriteOnly>
        </nav>
      </div>
      <ClinicProfileCard />
      <InstallFilesCard />
      <RuleSettings />
      <HospitalPhrases />
      <DxLinks />
      <CashFloatSetting />
      <DeskAccounts />
      <TabAccessSettings />
      {/* 뒤 TASK가 이 아래에 차례로 더한다: 문자 문구(TASK-25) · 백업(TASK-32) */}
    </div>
  )
}
