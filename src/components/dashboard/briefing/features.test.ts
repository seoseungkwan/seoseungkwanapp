import { describe, expect, it } from 'vitest'
import { DASHBOARD_FEATURES } from './features'

// 기능 목차 자료 (tab-frame REQ-316 AC-316.3, design.md '대시보드 짜임', 메모 docs/mockups/dashboard-home/notes.md §6).
// 이름·주소는 탭 목록(menu.ts)과 같아야 한다 — 그 맞춤은 합친 뒤 통합 시험(tabFrame.test.tsx, AC-307.1)이 본다.
// 여기서는 메모 §6 표 그대로인지만 본다. 상태는 ui-90 AC-414.5(design.md '대시보드 (TASK-11)')의 셋이고 칸마다 아래 표가 못 박는다. 칸 수·상태별 수는 표에서 센다(고정 숫자 없음, 칸의 상태는 다른 탭 명세도 바꾼다).
// 설정 설명은 시안(docs/mockups/ui-90/app/gen.py FEATS) 글자 그대로 "의원 문구"다

// 메모 §6 = requirements AC-316.3 표 (탭 순서), 상태는 AC-414.5. 매출은 spec revenue AC-010.1, 서식은 spec forms AC-3501.2
const TABLE = [
  { name: '통계', desc: '환자 수 추이·신환 재방문율·처방별 추세·요일별 환자 수', href: '/stats', status: 'connect-first' }, // 설명은 treatment-trend AC-1201.7이 대신한다
  { name: '청구', desc: '삭감 예방 사전점검·청구메모·상병 확인·월말 마감', href: '/claim', status: 'connect-first' },
  { name: '고시·공지', desc: '심평원·보건복지부·건강보험공단 새 글과 세 줄 요약', href: '/notices', status: 'soon' },
  { name: '환자', desc: '다시 오실 환자 명단·정기 주사 문자 명단·문자 문구', href: '/patients', status: 'connect-first' },
  { name: '매출', desc: '매출 추이·급여와 비급여·치료별 매출·건당 진료비', href: '/revenue', status: 'connect-first' },
  { name: 'AI 리포트', desc: '지난달·작년 같은 달과 견준 월간 AI 보고', href: '/ai-report', status: 'ready' },
  { name: '서식', desc: '휴진 안내를 테마 그림으로 만들어 인쇄·그림 파일로', href: '/forms', status: 'ready' },
  { name: '직원', desc: '직원 명단·급여 계산과 명세서·연차와 휴가', href: '/staff', status: 'soon' },
  { name: '업무일지', desc: '엑셀 양식과 똑같은 업무일지', href: '/worklog', status: 'ready' },
  { name: '재고', desc: '물품 목록·남은 수량·부족 표시', href: '/inventory', status: 'soon' },
  { name: '주소록', desc: '거래처·수리와 관리 업체·뉴메디코어 연락처', href: '/contacts', status: 'soon' },
  { name: '설정', desc: '점검 규칙·의원 문구·비트 PC 연결·백업', href: '/settings', status: 'ready' },
]

describe('DASHBOARD_FEATURES: 기능 목차 (AC-316.3·AC-414.5)', () => {
  it('AC-316.3·AC-414.5·AC-010.1·AC-3501.2: 탭 순서대로 이름·설명·주소·상태가 표와 같다', () => {
    expect(DASHBOARD_FEATURES).toHaveLength(TABLE.length)
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

  it('AC-414.5·AC-010.1·AC-515.2·AC-714.4·AC-610.1·AC-012.5: 상태는 셋 — 상태마다 칸 이름이 표와 같고, 설정은 ready, 청구는 connect-first, AI 리포트는 ready다', () => {
    const namesOf = (rows: ReadonlyArray<{ name: string; status: string }>, status: string) => rows.filter((f) => f.status === status).map((f) => f.name)
    for (const status of ['ready', 'connect-first', 'soon']) expect(namesOf(DASHBOARD_FEATURES, status), status).toEqual(namesOf(TABLE, status))
    expect(namesOf(DASHBOARD_FEATURES, 'ready')).toContain('설정')
    expect(namesOf(DASHBOARD_FEATURES, 'connect-first')).toContain('청구')
    const ai = DASHBOARD_FEATURES.find((f) => f.name === 'AI 리포트')
    expect(ai?.status).toBe('ready')
    expect(ai?.desc).toBe('지난달·작년 같은 달과 견준 월간 AI 보고')
    for (const { name, status } of DASHBOARD_FEATURES) expect(['ready', 'connect-first', 'soon'], name).toContain(status)
  })

  it('AC-010.1: 매출은 청구와 같은 connect-first이고, 설명의 넷째가 건당 진료비다(한 사람당 평균 진료비 없음)', () => {
    const revenue = DASHBOARD_FEATURES.find((f) => f.name === '매출')
    expect(revenue?.status).toBe('connect-first')
    expect(revenue?.status).toBe(DASHBOARD_FEATURES.find((f) => f.name === '청구')?.status)
    expect(revenue?.desc.split('·')[3]).toBe('건당 진료비')
    expect(revenue?.desc).not.toContain('한 사람당 평균 진료비')
  })

  it('AC-515.2·AC-1201.7: 통계 칸은 connect-first("연결 먼저" → 연결 뒤 "사용 가능")이고 주소는 /stats, 설명 글자는 처방 추세 대신 처방별 추세다', () => {
    expect(DASHBOARD_FEATURES.find((f) => f.name === '통계')).toEqual({
      name: '통계',
      desc: '환자 수 추이·신환 재방문율·처방별 추세·요일별 환자 수',
      href: '/stats',
      status: 'connect-first',
    })
  })

  it('AC-610.1: 환자 칸은 준비 중이 아니라 연결 먼저이고 주소는 /patients다', () => {
    expect(DASHBOARD_FEATURES.find((f) => f.name === '환자')).toMatchObject({ href: '/patients', status: 'connect-first' })
  })

  it('AC-012.3: 업무일지 칸은 ready("사용 가능")이고 주소는 /worklog, 설명 글자는 그대로다', () => {
    expect(DASHBOARD_FEATURES.find((f) => f.name === '업무일지')).toEqual({
      name: '업무일지',
      desc: '엑셀 양식과 똑같은 업무일지',
      href: '/worklog',
      status: 'ready',
    })
  })

  it('AC-3501.2: 서식 칸은 ready("사용 가능")이고 주소는 /forms, 설명은 "휴진 안내를 테마 그림으로 만들어 인쇄·그림 파일로"다', () => {
    expect(DASHBOARD_FEATURES.find((f) => f.name === '서식')).toEqual({
      name: '서식',
      desc: '휴진 안내를 테마 그림으로 만들어 인쇄·그림 파일로',
      href: '/forms',
      status: 'ready',
    })
  })

  it('AC-316.3: 이름과 주소는 겹치지 않고, 주소는 같은 origin 고정 경로다', () => {
    expect(new Set(DASHBOARD_FEATURES.map((f) => f.name)).size).toBe(DASHBOARD_FEATURES.length)
    expect(new Set(DASHBOARD_FEATURES.map((f) => f.href)).size).toBe(DASHBOARD_FEATURES.length)
    for (const { name, href } of DASHBOARD_FEATURES) expect(href, name).toMatch(/^\/[a-z][a-z/-]*$/)
  })
})
