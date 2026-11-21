import { describe, expect, it } from 'vitest'
import type { CompanyChange, ImportPlan, RowProblem } from '@/lib/contacts/plan'
import { changeLabels, newCompanyLine, planCounts } from './changeLabels'

// 미리 보기 이름표·새 업체 줄·숫자(specs/contacts AC-6506.3, requirements.md '화면 글자' 엑셀 미리 보기, 시안 기본값 21).
// 바뀌기 전·뒤 값은 없고 칸 이름만 있다. 업체·사람 이름은 지어낸 것이다

function change(over: Partial<CompanyChange>): CompanyChange {
  return {
    name: '예시메디칼',
    status: 'changed',
    category: 'supplier',
    work: '',
    fields: [],
    peopleAdded: 0,
    equipmentAdded: 0,
    peopleChanged: [],
    equipmentChanged: [],
    ...over,
  }
}

describe('AC-6506.3 바뀌는 업체 이름표', () => {
  it("AC-6506.3: 칸 이름 그대로 → 담당자 {n}명 더함 → 장비 {n}대 더함 → 담당자 '{이름}' {칸} → 장비 '{이름}' {칸}", () => {
    expect(
      changeLabels(
        change({
          fields: ['대표 전화', '업체 메모'],
          peopleAdded: 2,
          equipmentAdded: 1,
          peopleChanged: [{ name: '이예시', fields: ['휴대폰', '맡은 일'] }],
          equipmentChanged: [{ name: '충격파 기계', fields: ['무상 수리 끝나는 날'] }],
        }),
      ),
    ).toEqual(['대표 전화', '업체 메모', '담당자 2명 더함', '장비 1대 더함', "담당자 '이예시' 휴대폰", "담당자 '이예시' 맡은 일", "장비 '충격파 기계' 무상 수리 끝나는 날"])
  })

  it('AC-6506.3: 0인 수·빈 목록은 이름표가 없다', () => {
    expect(changeLabels(change({ fields: ['주소'] }))).toEqual(['주소'])
    expect(changeLabels(change({ equipmentAdded: 3 }))).toEqual(['장비 3대 더함'])
    expect(changeLabels(change({ status: 'same' }))).toEqual([])
  })
})

describe('AC-6506.3 새로 더할 업체 줄', () => {
  it('AC-6506.3: {하는 일·품목} · 담당자 {n}명 · 장비 {n}대 — 빈 것·0은 뺀다', () => {
    expect(newCompanyLine(change({ status: 'new', work: '엑스레이 장비 점검·수리', peopleAdded: 1, equipmentAdded: 1 }))).toBe(
      '엑스레이 장비 점검·수리 · 담당자 1명 · 장비 1대',
    )
    expect(newCompanyLine(change({ status: 'new', work: '재활 운동기구 판매', peopleAdded: 2 }))).toBe('재활 운동기구 판매 · 담당자 2명')
    expect(newCompanyLine(change({ status: 'new', equipmentAdded: 2 }))).toBe('장비 2대')
    expect(newCompanyLine(change({ status: 'new', work: '의료폐기물 수거' }))).toBe('의료폐기물 수거')
    expect(newCompanyLine(change({ status: 'new' }))).toBe('')
  })
})

describe('AC-6506.3 미리 보기 숫자', () => {
  it('AC-6506.3: 새로·바뀜·그대로 업체 수와 넣지 않는 줄 수', () => {
    const bad: RowProblem = { sheet: 'contacts', row: 4, reason: 'no-company', company: '', item: '', field: null, value: '', limit: null }
    const plan: ImportPlan = {
      counts: { contacts: 9, equipment: 2 },
      changes: [change({ status: 'new' }), change({ status: 'new' }), change({ status: 'changed' }), change({ status: 'same' }), change({ status: 'same' }), change({ status: 'same' })],
      untouched: ['예시꽃집'],
      problems: [bad, { ...bad, row: 7 }],
      payload: { companies: [], people: [], equipment: [] },
    }
    expect(planCounts(plan)).toEqual({ added: 2, changed: 1, same: 3, skipped: 2 })
  })
})
