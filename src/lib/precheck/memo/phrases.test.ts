import { describe, expect, it } from 'vitest'
import { defaultPhrases, diffPhrases, migratePhrases, ourClinicPhrases, validatePhrases, type Phrases } from './index'

// 병원 문구 검사·기본값·차이. 원본 칸이 원본과 같은지는 golden.test.ts가 본다. 원본에 없는 약 칸(procedureDrugs)을 여기서 본다(design.md 19-3)

const withDrugs = (procedureDrugs: unknown) => ({ ...defaultPhrases(), procedureDrugs })
const noDrugs = () => {
  const value: Partial<Phrases> = defaultPhrases()
  delete value.procedureDrugs
  return value
}

describe('AC-014.8 메모를 만들 수 없는 설정', () => {
  it.each([
    ['null', null],
    ['빈 {}', {}],
    ['배열', []],
    ['글자', 'x'],
    ['약 칸 없음', noDrugs()],
    ['TPL 없음', { CODEMAP: {}, CODEMAP_DEL: [], procedureDrugs: {} }],
  ])('AC-014.8: %s는 검사를 지나지 못한다', (_name, value) => {
    expect(validatePhrases(value).ok).toBe(false)
  })

  it('AC-014.8: 틀린 문구 칸은 검사를 지나지 못하고 어느 칸인지 알린다', () => {
    const value = defaultPhrases()
    value.TPL.main = '{없는말}'
    const result = validatePhrases(value)
    expect(result).toEqual({ ok: false, errors: [{ path: 'TPL.main', message: '지원하지 않는 항목 {없는말}입니다. 이 항목의 삽입 버튼을 사용해 주세요.' }] })
  })

  it('AC-014.8: 지원하지 않는 좌우 규칙 버전은 칸 이름과 함께 거절한다', () => {
    const value = defaultPhrases()
    ;(value.TPL as Record<string, unknown>).sideRuleVersion = 3
    expect(validatePhrases(value)).toEqual({ ok: false, errors: [{ path: '설정', message: '지원하지 않는 좌우 규칙 버전입니다.' }] })
  })
})

describe('AC-014.3 원본 칸 가운데 옮기지 않은 기능(골든 knownDiffs)', () => {
  it('AC-014.3: 과거 코드 검토 칸(__codeHistory)은 그 기능을 못 불렀을 때의 원본처럼 거절한다', () => {
    const value = defaultPhrases()
    value.TPL.__codeHistory = { entries: [] }
    expect(validatePhrases(value)).toEqual({ ok: false, errors: [{ path: 'TPL.__codeHistory', message: '과거 코드 검토 기능을 불러오지 못했습니다.' }] })
  })
})

describe('AC-014.3 sideRuleVersion', () => {
  it('AC-014.3: 옛 설정은 2로 바꿔 지나고, 바꾼 값을 돌려준다', () => {
    const value = defaultPhrases()
    value.TPL.sideRuleVersion = 1
    value.TPL.sideByCode = { LA346: 'omit', LA347: 'keep' }
    value.TPL.procedureTypes = { LA346: 'level' }
    const result = validatePhrases(value)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.TPL.sideRuleVersion).toBe(2)
      expect(result.value.TPL.sideByCode).toEqual({ LA346: 'omit' })
      expect(result.value.TPL.procedureTypes).toEqual({})
      expect(result.value.procedureDrugs).toEqual({})
    }
    expect(value.TPL.sideRuleVersion).toBe(1) // 받은 값은 고치지 않는다
    expect((migratePhrases(value) as { TPL: { sideRuleVersion: number } }).TPL.sideRuleVersion).toBe(2)
  })
})

describe('AC-014.9 약 칸 검사(원본에 없는 칸이라 따로 본다)', () => {
  it.each([
    ['넣기와 자리', { KK090: { 트리암: { use: 'include', place: 'afterProc' } } }],
    ['넣기 자리 셋', { KK090: { a: { use: 'include', place: 'afterProc' }, b: { use: 'include', place: 'afterEnding' }, c: { use: 'include', place: 'ownLine' } } }],
    ['표기', { KK090: { 트리암: { use: 'include', place: 'afterProc', label: 'triam' } } }],
    ['빼기', { KK090: { 트리암: { use: 'exclude' } } }],
    ['빈 시술', { KK090: {} }],
    ['빈 칸', {}],
  ])('AC-014.9: 받는 값: %s', (_name, drugs) => {
    expect(validatePhrases(withDrugs(drugs)).ok).toBe(true)
  })

  it.each([
    ['배열', [], 'procedureDrugs'],
    ['글자', 'x', 'procedureDrugs'],
    ['시술이 배열', { KK090: [] }, 'procedureDrugs.KK090'],
    ['약이 글자', { KK090: { 트리암: 'include' } }, 'procedureDrugs.KK090.트리암'],
    ['모르는 use', { KK090: { 트리암: { use: 'maybe' } } }, 'procedureDrugs.KK090.트리암.use'],
    ['넣기에 자리 없음', { KK090: { 트리암: { use: 'include' } } }, 'procedureDrugs.KK090.트리암.place'],
    ['모르는 자리', { KK090: { 트리암: { use: 'include', place: 'x' } } }, 'procedureDrugs.KK090.트리암.place'],
    ['빼기에 자리', { KK090: { 트리암: { use: 'exclude', place: 'afterProc' } } }, 'procedureDrugs.KK090.트리암.place'],
    ['표기가 글자가 아님', { KK090: { 트리암: { use: 'include', place: 'afterProc', label: 1 } } }, 'procedureDrugs.KK090.트리암.label'],
    ['표기가 너무 김', { KK090: { 트리암: { use: 'include', place: 'afterProc', label: 'x'.repeat(121) } } }, 'procedureDrugs.KK090.트리암.label'],
    ['표기에 틀 글자', { KK090: { 트리암: { use: 'include', place: 'afterProc', label: '{시술}' } } }, 'procedureDrugs.KK090.트리암.label'],
    ['모르는 칸', { KK090: { 트리암: { use: 'exclude', extra: 1 } } }, 'procedureDrugs.KK090.트리암'],
    ['틀린 시술 코드', { ' KK090': {} }, 'procedureDrugs. KK090'],
    ['소문자 시술 코드', { kk090: {} }, 'procedureDrugs.kk090'],
    ['빈 약 이름', { KK090: { ' ': { use: 'exclude' } } }, 'procedureDrugs.KK090. '],
  ])('AC-014.9: 거절하는 값: %s', (_name, drugs, path) => {
    const result = validatePhrases(withDrugs(drugs))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.map((e) => e.path)).toContain(path)
  })

  it('AC-014.9: 위험한 칸 이름을 거절한다', () => {
    const drugs = JSON.parse('{"KK090":{"__proto__":{"use":"exclude"}}}')
    expect(validatePhrases(withDrugs(drugs)).ok).toBe(false)
  })

  it('AC-014.9: 받은 값의 약 칸은 그대로 돌려준다', () => {
    const drugs = { KK090: { 트리암: { use: 'include', place: 'afterProc', label: 'triam' } } }
    const result = validatePhrases(withDrugs(drugs))
    expect(result.ok && result.value.procedureDrugs).toEqual(drugs)
  })
})

describe('AC-014.3 diffPhrases', () => {
  it('AC-014.3: 같으면 빈 목록이다', () => {
    expect(diffPhrases(ourClinicPhrases(), ourClinicPhrases())).toEqual([])
  })
  it('AC-014.3: 문구 칸 차이는 원본 이름표로 보인다', () => {
    const after = ourClinicPhrases()
    after.TPL.mark = '※'
    expect(diffPhrases(ourClinicPhrases(), after)).toEqual([{ path: 'TPL.mark', label: '줄머리 기호', before: '◈', after: '※' }])
  })
})

describe('AC-014.3 설정 크기', () => {
  it('AC-014.3: 우리 병원 값은 DB 칸 한도(262144바이트) 안이다', () => {
    expect(Buffer.byteLength(JSON.stringify(ourClinicPhrases()), 'utf-8')).toBeLessThan(262144)
  })
})
