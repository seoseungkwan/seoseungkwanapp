import { describe, expect, it } from 'vitest'
import { DASHBOARD_FEATURES } from './features'

// 기능 목차 자료 (tab-frame REQ-316 AC-316.3, design.md '대시보드 짜임', 메모 docs/mockups/dashboard-home/notes.md §6).
// 이름·주소는 탭 목록(menu.ts)과 같아야 한다 — 그 맞춤은 합친 뒤 통합 시험(tabFrame.test.tsx, AC-307.1)이 본다.
// 여기서는 메모 §6 표 그대로인지만 본다. 상태는 ui-90 AC-414.5(design.md '대시보드 (TASK-11)')의 셋: 청구 connect-first · 화면이 있는 칸(설정·업무일지) ready · 나머지 soon.
// 설정 설명은 시안(docs/mockups/ui-90/app/gen.py FEATS) 글자 그대로 "의원 문구"다

// 메모 §6 = requirements AC-316.3 표 (탭 순서), 상태는 AC-414.5
const TABLE = [
  { name: '통계', desc: '환자 수 추이·신환 재방문율·처방 추세·요일별 환자 수', href: '/stats', status: 'soon' },
  { name: '청구', desc: '삭감 예방 사전점검·청구메모·상병 확인·월말 마감', href: '/claim', status: 'connect-first' },
  { name: '고시·공지', desc: '심평원·보건복지부·건강보험공단 새 글과 세 줄 요약', href: '/notices', status: 'soon' },
  { name: '환자', desc: '다시 오실 환자 명단·정기 주사 문자 명단·문자 문구', href: '/patients', status: 'soon' },
  { name: '매출', desc: '매출 추이·급여와 비급여·치료별 매출·한 사람당 평균 진료비', href: '/revenue', status: 'soon' },
  { name: 'AI 리포트', desc: '지난달·작년 같은 달과 견준 월간 AI 보고', href: '/ai-report', status: 'ready' },
  { name: '서식', desc: '진료일정·휴진 안내·환자 안내문·근무표·보고서 양식', href: '/forms', status: 'soon' },
  { name: '직원', desc: '직원 명단·급여 계산과 명세서·연차와 휴가', href: '/staff', status: 'soon' },
  { name: '업무일지', desc: '엑셀 양식과 똑같은 업무일지', href: '/worklog', status: 'ready' },
  { name: '재고', desc: '물품 목록·남은 수량·부족 표시', href: '/inventory', status: 'soon' },
  { name: '주소록', desc: '거래처·수리와 관리 업체·뉴메디코어 연락처', href: '/contacts', status: 'soon' },
  { name: '설정', desc: '점검 규칙·의원 문구·비트 PC 연결·백업', href: '/claim/setup', status: 'ready' },
]

describe('DASHBOARD_FEATURES: 기능 목차 12개 (AC-316.3·AC-414.5)', () => {
  it('AC-316.3·AC-414.5: 12개가 탭 순서대로 이름·설명·주소·상태가 표와 같다', () => {
    expect(DASHBOARD_FEATURES).toHaveLength(12)
    expect(DASHBOARD_FEATURES.map((f) => ({ name: f.name, desc: f.desc, href: f.href, status: f.status }))).toEqual(TABLE)
  })

  it('AC-316.3·AC-414.5: 칸마다 이름·설명·주소·상태 네 값만 있다(옛 ready 값 없음)', () => {
    for (const feature of DASHBOARD_FEATURES) expect(Object.keys(feature).sort(), feature.name).toEqual(['desc', 'href', 'name', 'status'])
  })

  it('AC-316.3: 설명에 줄바꿈 문자·숫자가 없다', () => {
    for (const { name, desc } of DASHBOARD_FEATURES) {
      expect(desc, name).not.toMatch(/[\r\n]/)
      expect(desc, name).not.toMatch(/\d/)
      expect(desc.trim(), name).toBe(desc)
      expect(desc.length, name).toBeGreaterThan(0)
    }
  })

  it('AC-414.5·AC-714.4·AC-012.5: 상태는 셋 — 연결 먼저(connect-first)는 청구 하나, 지금 쓸 수 있음(ready)과 준비 중(soon)은 표에서 센다. AI 리포트는 ready', () => {
    const namesOf = (status: string) => TABLE.filter((row) => row.status === status).map((row) => row.name)
    expect(DASHBOARD_FEATURES.filter((f) => f.status === 'ready').map((f) => f.name)).toEqual(namesOf('ready'))
    expect(DASHBOARD_FEATURES.filter((f) => f.status === 'connect-first').map((f) => f.name)).toEqual(['청구'])
    expect(DASHBOARD_FEATURES.filter((f) => f.status === 'soon').map((f) => f.name)).toEqual(namesOf('soon'))
    const ai = DASHBOARD_FEATURES.find((f) => f.name === 'AI 리포트')
    expect(ai?.status).toBe('ready')
    expect(ai?.desc).toBe('지난달·작년 같은 달과 견준 월간 AI 보고')
    for (const { name, status } of DASHBOARD_FEATURES) expect(['ready', 'connect-first', 'soon'], name).toContain(status)
  })

  it('AC-012.3: 업무일지 칸은 ready("사용 가능")이고 주소는 /worklog, 설명 글자는 그대로다', () => {
    expect(DASHBOARD_FEATURES.find((f) => f.name === '업무일지')).toEqual({
      name: '업무일지',
      desc: '엑셀 양식과 똑같은 업무일지',
      href: '/worklog',
      status: 'ready',
    })
  })

  it('AC-316.3: 이름과 주소는 겹치지 않고, 주소는 같은 origin 고정 경로다', () => {
    expect(new Set(DASHBOARD_FEATURES.map((f) => f.name)).size).toBe(12)
    expect(new Set(DASHBOARD_FEATURES.map((f) => f.href)).size).toBe(12)
    for (const { name, href } of DASHBOARD_FEATURES) expect(href, name).toMatch(/^\/[a-z][a-z/-]*$/)
  })
})
