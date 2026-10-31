// 대시보드 기능 목차 자료 한 곳 (tab-frame REQ-316 AC-316.3, design.md '대시보드 짜임', 메모 docs/mockups/dashboard-home/notes.md §6).
// 이름·주소는 탭 목록(components/shell/menu.ts)과 같은 글자다. 병렬 작업 동안 독립하려고 menu.ts·summary·notReadyFeatures를 불러오지 않고 여기 따로 적는다.
// 맞춤(이름·순서 = 대시보드를 뺀 탭, 주소 = 같은 이름 탭의 path)은 합친 뒤 통합 시험 src/app/(app)/tabFrame.test.tsx(AC-307.1)가 본다.
// 기능에 진짜 화면이 생기면 ready·href를 menu.ts·notReadyFeatures.ts와 같은 TASK에서 함께 바꾼다(design.md '다음 명세가 탭을 채울 때')
export type DashboardFeature = {
  /** 탭 이름과 같다 */
  name: string
  /** 메모 §6 설명 그대로. 줄바꿈 문자·숫자 없음 */
  desc: string
  /** 탭 주소와 같다 */
  href: string
  /** true = 그 주소에 이미 쓰는 화면이 있다 → "사용 가능" */
  ready: boolean
}

// 탭 순서(대시보드 뺌). 설정은 이미 있는 비트 PC 연결 화면(/claim/setup)으로 간다(design.md '설정 탭은 /claim/setup으로 간다')
export const DASHBOARD_FEATURES: readonly DashboardFeature[] = [
  { name: '통계', desc: '환자 수 추이·신환 재방문율·처방 추세·요일별 환자 수', href: '/stats', ready: false },
  { name: '청구', desc: '삭감 예방 사전점검·청구메모·상병 확인·월말 마감', href: '/claim', ready: true },
  { name: '고시·공지', desc: '심평원·보건복지부·건강보험공단 새 글과 세 줄 요약', href: '/notices', ready: false },
  { name: '환자', desc: '다시 오실 환자 명단·정기 주사 문자 명단·문자 문구', href: '/patients', ready: false },
  { name: '매출', desc: '매출 추이·급여와 비급여·치료별 매출·한 사람당 평균 진료비', href: '/revenue', ready: false },
  { name: 'AI 리포트', desc: '월간보고 발표 자료·주간 요약·분기와 연간 보고', href: '/ai-report', ready: false },
  { name: '서식', desc: '진료일정·휴진 안내·환자 안내문·근무표·보고서 양식', href: '/forms', ready: false },
  { name: '직원', desc: '직원 명단·급여 계산과 명세서·연차와 휴가', href: '/staff', ready: false },
  { name: '업무일지', desc: '엑셀 양식과 똑같은 업무일지', href: '/worklog', ready: false },
  { name: '재고', desc: '물품 목록·남은 수량·부족 표시', href: '/inventory', ready: false },
  { name: '주소록', desc: '거래처·수리와 관리 업체·뉴메디코어 연락처', href: '/contacts', ready: false },
  { name: '설정', desc: '점검 규칙·병원 문구·비트 PC 연결·백업', href: '/claim/setup', ready: true },
]
