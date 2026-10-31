import { describe, expect, it } from 'vitest'
import { NOT_READY_FEATURES, notReadyFeature, type NotReadyPath } from './notReadyFeatures'

// 준비 중 기능 자료 (tab-frame REQ-305 AC-305.4, design.md '준비 중 화면' 문구 표).
// 표는 이 시험이 정한다(구현에서 읽지 않는다). 주소록만 시안 docs/mockups/dashboard-home/index.html 화면 5 그대로이고, 나머지는 같은 말투다

const SOON = '만들어지면 이 탭에서 바로 쓸 수 있어요.'

// 탭 순서(대시보드·청구·설정 빼고)
const TABLE: Array<{ path: NotReadyPath; name: string; intro: string; items: string[] }> = [
  {
    path: '/stats',
    name: '통계',
    intro: `환자 흐름과 처방 추세를 그래프로 볼 자리예요. ${SOON}`,
    items: ['환자 수 추이(신환·재진)', '신환 재방문율', '처방 추세', '요일별 환자 수', '원장님 보고 문장'],
  },
  {
    path: '/notices',
    name: '고시·공지',
    intro: `심사·고시 새 글을 한곳에서 볼 자리예요. ${SOON}`,
    items: ['심평원 공지·심사기준 변경', '보건복지부 고시·공지', '건강보험공단 공지', '글마다 AI 세 줄 요약'],
  },
  {
    path: '/patients',
    name: '환자',
    intro: `다시 오실 환자와 문자 보낼 환자를 챙길 자리예요. ${SOON}`,
    items: ['다시 오실 환자 명단', '정기 주사 문자 명단', '문자 문구 복사'],
  },
  {
    path: '/revenue',
    name: '매출',
    intro: `매출 흐름을 나눠 볼 자리예요. ${SOON}`,
    items: ['매출 추이', '급여와 비급여', '치료별 매출', '한 사람당 평균 진료비'],
  },
  {
    path: '/ai-report',
    name: 'AI 리포트',
    intro: `보고 자료를 정해 둔 양식으로 채울 자리예요. ${SOON}`,
    items: ['월간보고 발표 자료', '주간 요약', '분기와 연간 보고'],
  },
  {
    path: '/forms',
    name: '서식',
    intro: `대충 적은 글을 양식에 맞게 정리할 자리예요. ${SOON}`,
    items: ['진료일정·휴진 안내', '환자 안내문', '직원 공지·회의록', '근무표·보고서'],
  },
  {
    path: '/staff',
    name: '직원',
    intro: `직원과 급여·휴가를 한곳에서 볼 자리예요. ${SOON}`,
    items: ['직원 명단', '급여 계산과 명세서', '연차와 휴가'],
  },
  {
    path: '/worklog',
    name: '업무일지',
    intro: `엑셀 업무일지를 그대로 옮겨 쓸 자리예요. ${SOON}`,
    items: ['엑셀 양식과 똑같은 칸', '날짜별로 적고 다시 보기'],
  },
  {
    path: '/inventory',
    name: '재고',
    intro: `물품이 얼마나 남았는지 챙길 자리예요. ${SOON}`,
    items: ['물품 목록·남은 수량', '부족 표시', '들어온 것과 쓴 것'],
  },
  {
    path: '/contacts',
    name: '주소록',
    intro: `거래처와 업체 연락처를 한곳에 모아 둘 자리예요. ${SOON}`,
    items: ['거래처', '수리·관리 업체', '뉴메디코어 연락처'],
  },
]

describe('AC-305.4: NOT_READY_FEATURES — 준비 중 기능 10개(탭 순서)', () => {
  it('AC-305.4: 10개가 탭 순서대로 주소·이름이 표와 같다', () => {
    expect(NOT_READY_FEATURES.map(({ path, name }) => [path, name])).toEqual(TABLE.map(({ path, name }) => [path, name]))
  })

  it('AC-305.4: 주소가 겹치지 않는다', () => {
    expect(new Set(NOT_READY_FEATURES.map((f) => f.path)).size).toBe(NOT_READY_FEATURES.length)
  })

  it.each(TABLE)('AC-305.4: $path $name — 소개 문장이 비어 있지 않고, 만들 것이 하나 이상이며 빈 글자가 없다', ({ path }) => {
    const feature = notReadyFeature(path)
    expect(feature.intro.trim()).not.toBe('')
    expect(feature.items.length).toBeGreaterThan(0)
    for (const item of feature.items) expect(item.trim(), item).not.toBe('')
  })

  it.each(TABLE)('AC-305.4: $path $name — 소개 문장과 만들 것은 design.md 문구 표 그대로다', ({ path, intro, items }) => {
    const feature = notReadyFeature(path)
    expect(feature.intro).toBe(intro)
    expect(feature.items).toEqual(items)
  })

  it('AC-305.4: 주소록은 시안 문구 그대로다 — 소개 한 줄과 만들 것 셋', () => {
    const contacts = notReadyFeature('/contacts')
    expect(contacts.name).toBe('주소록')
    expect(contacts.intro).toBe('거래처와 업체 연락처를 한곳에 모아 둘 자리예요. 만들어지면 이 탭에서 바로 쓸 수 있어요.')
    expect(contacts.items).toEqual(['거래처', '수리·관리 업체', '뉴메디코어 연락처'])
  })

  it('AC-305.4: 문구에 숫자(0–9)가 없다 — 지어낸 숫자를 쓰지 않는다', () => {
    for (const { name, intro, items } of NOT_READY_FEATURES) {
      expect([name, intro, ...items].join(' '), name).not.toMatch(/[0-9]/)
    }
  })

  it.each(TABLE)('AC-305.4: notReadyFeature($path)는 그 주소의 항목을 돌려준다', ({ path, name }) => {
    const feature = notReadyFeature(path)
    expect(feature.path).toBe(path)
    expect(feature.name).toBe(name)
    expect(NOT_READY_FEATURES).toContain(feature)
  })
})
