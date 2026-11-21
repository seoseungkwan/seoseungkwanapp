import { describe, expect, it } from 'vitest'
import type { RowProblem } from '@/lib/contacts/plan'
import { problemPlace, problemSubject, problemText } from './problemText'

// 넣지 않는 줄 글(specs/contacts AC-6506.3, requirements.md '화면 글자' 엑셀 미리 보기 까닭 글 아홉 + 이 명세가 정한 둘).
// '{값}'은/는·'{이름}'이/가는 받침으로 고른다(한글이 아니면 받침 있음). 업체·사람 이름은 지어낸 것이다

function problem(over: Partial<RowProblem> & Pick<RowProblem, 'reason'>): RowProblem {
  return { sheet: 'contacts', row: 9, company: '예시메디칼', item: '', field: null, value: '', limit: null, ...over }
}

const CHOOSE = '거래처·수리·관리·기관·보험·기타 가운데 하나로 골라 주세요.'

describe('AC-6506.3 넣지 않는 줄 까닭 글', () => {
  it("AC-6506.3: 연락처 시트 — 분류 '{값}'은/는 · 분류 빔 · 업체 이름 빔 · 담당자 이름 빔 · 같은 담당자 두 줄", () => {
    expect(problemText(problem({ reason: 'category', field: '분류', value: '병원' }))).toBe(`분류 '병원'은 쓸 수 없어요. ${CHOOSE}`)
    expect(problemText(problem({ reason: 'category', field: '분류', value: '거래' }))).toBe(`분류 '거래'는 쓸 수 없어요. ${CHOOSE}`)
    expect(problemText(problem({ reason: 'category', field: '분류', value: 'ABC' }))).toBe(`분류 'ABC'은 쓸 수 없어요. ${CHOOSE}`)
    expect(problemText(problem({ reason: 'no-category', field: '분류' }))).toBe(`분류가 비었어요. ${CHOOSE}`)
    expect(problemText(problem({ reason: 'no-company', company: '' }))).toBe('업체 이름이 비었어요.')
    expect(problemText(problem({ reason: 'no-person-name' }))).toBe('담당자 이름이 비었어요. 담당자 휴대폰·맡은 일만 적힌 줄이에요.')
    expect(problemText(problem({ reason: 'same-person', item: '김예시' }))).toBe("담당자 '김예시'가 같은 업체에 두 줄 있어요. 한 줄만 남겨 주세요.")
    expect(problemText(problem({ reason: 'same-person', item: '박예진' }))).toBe("담당자 '박예진'이 같은 업체에 두 줄 있어요. 한 줄만 남겨 주세요.")
  })

  it("AC-6506.3: 장비 시트 — 업체 이름 빔 · 업체 '{이름}'이/가 없음 · 장비 이름 빔 · {칸 이름} '{값}'은/는 날짜 모양 아님", () => {
    const equipment = (over: Partial<RowProblem> & Pick<RowProblem, 'reason'>) => problem({ sheet: 'equipment', row: 5, item: '예시 치료기', ...over })
    expect(problemText(equipment({ reason: 'no-company', company: '', item: '' }))).toBe('업체 이름이 비었어요.')
    expect(problemText(equipment({ reason: 'unknown-company', company: '없는상사' }))).toBe("업체 '없는상사'가 연락처 시트에도 주소록에도 없어요.")
    expect(problemText(equipment({ reason: 'unknown-company', company: '예시설비' }))).toBe("업체 '예시설비'가 연락처 시트에도 주소록에도 없어요.")
    expect(problemText(equipment({ reason: 'unknown-company', company: '예시약품' }))).toBe("업체 '예시약품'이 연락처 시트에도 주소록에도 없어요.")
    expect(problemText(equipment({ reason: 'no-equipment-name', item: '' }))).toBe('장비 이름이 비었어요.')
    expect(problemText(equipment({ reason: 'date', field: '들여온 날', value: '2026-13-01' }))).toBe(
      "들여온 날 '2026-13-01'은 날짜 모양이 아니에요. 2026-11-21처럼 적어 주세요.",
    )
    expect(problemText(equipment({ reason: 'date', field: '무상 수리 끝나는 날', value: '내년 봄' }))).toBe(
      "무상 수리 끝나는 날 '내년 봄'은 날짜 모양이 아니에요. 2026-11-21처럼 적어 주세요.",
    )
    expect(problemText(equipment({ reason: 'date', field: '들여온 날', value: '작년 여름' }))).toBe(
      "들여온 날 '작년 여름'은 날짜 모양이 아니에요. 2026-11-21처럼 적어 주세요.",
    )
    expect(problemText(equipment({ reason: 'date', field: '들여온 날', value: '어제' }))).toBe(
      "들여온 날 '어제'는 날짜 모양이 아니에요. 2026-11-21처럼 적어 주세요.",
    )
  })

  it('AC-6506.3: 이 명세가 정한 둘 — {칸 이름}은/는 {n}자까지 · 장비가 여러 대(일련번호를 적어 주세요)', () => {
    expect(problemText(problem({ reason: 'too-long', field: '업체 이름', limit: 40 }))).toBe('업체 이름은 40자까지 적을 수 있어요.')
    expect(problemText(problem({ reason: 'too-long', field: '사이트 비밀번호', limit: 100 }))).toBe('사이트 비밀번호는 100자까지 적을 수 있어요.')
    expect(problemText(problem({ reason: 'too-long', field: '업체 메모', limit: 1000 }))).toBe('업체 메모는 1,000자까지 적을 수 있어요.')
    expect(problemText(problem({ sheet: 'equipment', reason: 'too-long', field: '일련번호', limit: 60 }))).toBe('일련번호는 60자까지 적을 수 있어요.')
    expect(problemText(problem({ sheet: 'equipment', reason: 'which-equipment', item: '충격파 기계' }))).toBe(
      "장비 '충격파 기계'가 주소록에 여러 대 있어요. 일련번호를 적어 주세요.",
    )
    expect(problemText(problem({ sheet: 'equipment', reason: 'which-equipment', item: '초음파 진단기 본체' }))).toBe(
      "장비 '초음파 진단기 본체'가 주소록에 여러 대 있어요. 일련번호를 적어 주세요.",
    )
    expect(problemText(problem({ sheet: 'equipment', reason: 'which-equipment', item: '예시 온열판' }))).toBe(
      "장비 '예시 온열판'이 주소록에 여러 대 있어요. 일련번호를 적어 주세요.",
    )
  })

  it('AC-6506.3: 줄 자리는 시트와 엑셀 줄 번호(머리글이 1번째 줄)다', () => {
    expect(problemPlace(problem({ reason: 'no-company', row: 9 }))).toBe('연락처 시트 9번째 줄')
    expect(problemPlace(problem({ sheet: 'equipment', reason: 'date', row: 5 }))).toBe('장비 시트 5번째 줄')
  })

  it('AC-6506.3: 줄 이름은 업체 이름, 담당자 까닭은 업체 · 담당자, 장비 줄은 업체 · 장비, 업체 이름이 비면 없다', () => {
    expect(problemSubject(problem({ reason: 'category', company: '예시병원물품' }))).toBe('예시병원물품')
    expect(problemSubject(problem({ reason: 'same-person', company: '예시메디칼', item: '김예시' }))).toBe('예시메디칼 · 김예시')
    expect(problemSubject(problem({ reason: 'too-long', company: '예시메디칼', item: '김예시', field: '맡은 일', limit: 40 }))).toBe('예시메디칼 · 김예시')
    expect(problemSubject(problem({ reason: 'no-person-name', company: '예시메디칼' }))).toBe('예시메디칼')
    expect(problemSubject(problem({ sheet: 'equipment', reason: 'date', company: '예시설비', item: '천장형 냉난방기' }))).toBe('예시설비 · 천장형 냉난방기')
    expect(problemSubject(problem({ reason: 'no-company', company: '' }))).toBe('')
    expect(problemSubject(problem({ sheet: 'equipment', reason: 'no-company', company: '', item: '' }))).toBe('')
  })
})
