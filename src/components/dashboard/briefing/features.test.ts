import { describe, expect, it } from 'vitest'
import { DASHBOARD_FEATURES } from './features'

// 기능 목차 자료 (tab-frame REQ-316 AC-316.3, design.md '대시보드 짜임', 메모 docs/mockups/dashboard-home/notes.md §6).
// 이름·주소는 탭 목록(menu.ts)과 같아야 한다 — 그 맞춤은 합친 뒤 통합 시험(tabFrame.test.tsx, AC-307.1)이 본다.
// 여기서는 메모 §6 표 그대로인지만 본다

// 메모 §6 = requirements AC-316.3 표 (탭 순서)
const TABLE = [
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

describe('DASHBOARD_FEATURES: 기능 목차 12개 (AC-316.3)', () => {
  it('AC-316.3: 12개가 탭 순서대로 이름·설명·주소·상태가 메모 §6 표와 같다', () => {
    expect(DASHBOARD_FEATURES).toHaveLength(12)
    expect(DASHBOARD_FEATURES.map((f) => ({ name: f.name, desc: f.desc, href: f.href, ready: f.ready }))).toEqual(TABLE)
  })

  it('AC-316.3: 칸마다 이름·설명·주소·상태 네 값만 있다', () => {
    for (const feature of DASHBOARD_FEATURES) expect(Object.keys(feature).sort(), feature.name).toEqual(['desc', 'href', 'name', 'ready'])
  })

  it('AC-316.3: 설명에 줄바꿈 문자·숫자가 없다', () => {
    for (const { name, desc } of DASHBOARD_FEATURES) {
      expect(desc, name).not.toMatch(/[\r\n]/)
      expect(desc, name).not.toMatch(/\d/)
      expect(desc.trim(), name).toBe(desc)
      expect(desc.length, name).toBeGreaterThan(0)
    }
  })

  it('AC-316.3: 사용 가능은 청구 · 설정 둘뿐이다(나머지 열은 준비 중)', () => {
    expect(DASHBOARD_FEATURES.filter((f) => f.ready).map((f) => f.name)).toEqual(['청구', '설정'])
    expect(DASHBOARD_FEATURES.filter((f) => !f.ready)).toHaveLength(10)
  })

  it('AC-316.3: 이름과 주소는 겹치지 않고, 주소는 같은 origin 고정 경로다', () => {
    expect(new Set(DASHBOARD_FEATURES.map((f) => f.name)).size).toBe(12)
    expect(new Set(DASHBOARD_FEATURES.map((f) => f.href)).size).toBe(12)
    for (const { name, href } of DASHBOARD_FEATURES) expect(href, name).toMatch(/^\/[a-z][a-z/-]*$/)
  })
})
