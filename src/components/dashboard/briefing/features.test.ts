import { describe, expect, it } from 'vitest'
import { DASHBOARD_FEATURES } from './features'

// 기능 목차 자료 (tab-frame REQ-316 AC-316.3, design.md '대시보드 짜임', 메모 docs/mockups/dashboard-home/notes.md §6).
// 이름·주소는 탭 목록(menu.ts)과 같아야 한다 — 그 맞춤은 합친 뒤 통합 시험(tabFrame.test.tsx, AC-307.1)이 본다.
// 여기서는 메모 §6 표 그대로인지만 본다. 상태는 ui-90 AC-414.5(design.md '대시보드 (TASK-11)')의 셋이고 칸마다 아래 표가 못 박는다. 칸 수·상태별 수는 표에서 센다(고정 숫자 없음, 칸의 상태는 다른 탭 명세도 바꾼다).
// 설정 설명은 시안(docs/mockups/ui-90/app/gen.py FEATS) 글자 그대로 "의원 문구"다

// 메모 §6 = requirements AC-316.3 표 (탭 순서), 상태는 AC-414.5. 서식은 spec forms AC-3501.2, 직원은 spec staff AC-7611.1.
// 매출 줄은 없다 — 매출은 통계 매출 칸으로 옮겼고 통계 설명에 든다(stats-revenue AC-4110.3)
const TABLE = [
  { name: '통계', desc: '환자 수 추이·신환 재방문율·매출·처방별 추세·요일별 환자 수', href: '/stats', status: 'connect-first' }, // 설명은 stats-revenue AC-4110.3이 대신한다
  { name: '청구', desc: '삭감 예방 사전점검·청구메모·상병 확인·월말 마감', href: '/claim', status: 'connect-first' },
  { name: '고시·공지', desc: '심평원·보건복지부·건강보험공단 새 글과 세 줄 요약', href: '/notices', status: 'soon' },
  { name: '환자', desc: '다시 오실 환자 명단·정기 주사 문자 명단·문자 문구', href: '/patients', status: 'connect-first' },
  { name: '업무일지', desc: '엑셀 양식과 똑같은 업무일지', href: '/worklog', status: 'ready' }, // 수납일지 바로 앞(nav-worklog AC-5801.4)
  { name: '수납일지', desc: '비트에서 채우는 하루 수납 장부·예약률·Block 전환·마감', href: '/sunap', status: 'connect-first' }, // sunap-ilji AC-4907.1
  { name: '예약', desc: '구글 캘린더 대신 쓰는 예약표·비트 도착 표시·취소와 변경 통계', href: '/calendar', status: 'ready' }, // clinic-calendar AC-5905.10
  { name: 'AI 리포트', desc: '지난달·작년 같은 달과 견준 월간 AI 보고', href: '/ai-report', status: 'ready' },
  { name: '서식', desc: '휴진 안내를 테마 그림으로 만들어 인쇄·그림 파일로', href: '/forms', status: 'ready' },
  { name: '직원', desc: '직원 명단·급여 계산과 명세서·연차와 휴가', href: '/staff', status: 'ready' }, // 원장만 쓰는 화면이 생겼다(staff AC-7611.1)
  { name: '재고', desc: '물품 목록·남은 수량·부족 표시', href: '/inventory', status: 'soon' },
  { name: '주소록', desc: '거래처·수리와 관리 업체·뉴메디코어 연락처', href: '/contacts', status: 'soon' },
  { name: '설정', desc: '점검 규칙·의원 문구·비트 PC 연결·백업', href: '/settings', status: 'ready' },
]

describe('DASHBOARD_FEATURES: 기능 목차 (AC-316.3·AC-414.5)', () => {
  it('AC-316.3·AC-414.5·AC-4110.3·AC-3501.2·AC-5801.4·AC-7611.1: 탭 순서대로 이름·설명·주소·상태가 표와 같다', () => {
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

  it('AC-414.5·AC-4110.3·AC-515.2·AC-714.4·AC-610.1·AC-012.5·AC-5801.4: 상태는 셋 — 상태마다 칸 이름이 표와 같고, 설정은 ready, 청구는 connect-first, AI 리포트는 ready다', () => {
    const namesOf = (rows: ReadonlyArray<{ name: string; status: string }>, status: string) => rows.filter((f) => f.status === status).map((f) => f.name)
    for (const status of ['ready', 'connect-first', 'soon']) expect(namesOf(DASHBOARD_FEATURES, status), status).toEqual(namesOf(TABLE, status))
    expect(namesOf(DASHBOARD_FEATURES, 'ready')).toContain('설정')
    expect(namesOf(DASHBOARD_FEATURES, 'connect-first')).toContain('청구')
    const ai = DASHBOARD_FEATURES.find((f) => f.name === 'AI 리포트')
    expect(ai?.status).toBe('ready')
    expect(ai?.desc).toBe('지난달·작년 같은 달과 견준 월간 AI 보고')
    for (const { name, status } of DASHBOARD_FEATURES) expect(['ready', 'connect-first', 'soon'], name).toContain(status)
  })

  it('AC-4110.3: 매출 줄이 없다(이름·주소 /revenue 모두). 칸 수는 표에서 센다', () => {
    expect(DASHBOARD_FEATURES.map((f) => f.name)).not.toContain('매출')
    expect(DASHBOARD_FEATURES.map((f) => f.href)).not.toContain('/revenue')
    expect(DASHBOARD_FEATURES).toHaveLength(TABLE.length)
  })

  it('AC-515.2·AC-1201.7·AC-4110.3: 통계 칸은 connect-first("연결 먼저" → 연결 뒤 "사용 가능")이고 주소는 /stats, 설명은 칸 차례대로 매출이 든 "환자 수 추이·신환 재방문율·매출·처방별 추세·요일별 환자 수"다', () => {
    expect(DASHBOARD_FEATURES.find((f) => f.name === '통계')).toEqual({
      name: '통계',
      desc: '환자 수 추이·신환 재방문율·매출·처방별 추세·요일별 환자 수',
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

  it('AC-7611.1: 직원 칸은 준비 중이 아니라 ready("사용 가능")이고 주소는 /staff, 설명 글자는 그대로다', () => {
    expect(DASHBOARD_FEATURES.find((f) => f.name === '직원')).toEqual({
      name: '직원',
      desc: '직원 명단·급여 계산과 명세서·연차와 휴가',
      href: '/staff',
      status: 'ready',
    })
    expect(DASHBOARD_FEATURES.filter((f) => f.status === 'soon').map((f) => f.name)).not.toContain('직원')
  })

  it('AC-316.3: 이름과 주소는 겹치지 않고, 주소는 같은 origin 고정 경로다', () => {
    expect(new Set(DASHBOARD_FEATURES.map((f) => f.name)).size).toBe(DASHBOARD_FEATURES.length)
    expect(new Set(DASHBOARD_FEATURES.map((f) => f.href)).size).toBe(DASHBOARD_FEATURES.length)
    for (const { name, href } of DASHBOARD_FEATURES) expect(href, name).toMatch(/^\/[a-z][a-z/-]*$/)
  })
})
