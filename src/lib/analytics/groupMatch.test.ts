import { describe, expect, it } from 'vitest'
import type { RxGroupDef } from '@/types/analysis'
import type { ConsumptionRow } from '@/types/consumption'
import { aggregate } from './aggregate'
import { groupMatches } from './groupMatch'

// aggregate.test.ts 'group-exclude' 시험과 같은 묶음·같은 예. 한 환자·한 날에 받은 코드 목록마다
// groupMatches와 aggregate(그날 그 묶음 줄이 있는지)가 같은 답인지 견준다 — aggregate.ts는 고치지 않는다
const BASIC_PT: RxGroupDef = { id: 'g-basic', codes: ['MM010', 'MM015'], out: ['ESWT7'] }
const PT_COND: RxGroupDef = { id: 'g-cond', codes: ['MM010', 'MM080'], cond: [{ code: 'MM080', unless: ['MM020', 'MM030', 'TENS'] }] }
const BOTH: RxGroupDef = { id: 'g-both', codes: ['MM010', 'MM080'], out: ['ESWT7'], cond: [{ code: 'MM080', unless: ['MM020'] }] }

const DAY = '2026-11-16'
const rowOf = (rxCode: string): ConsumptionRow => ({
  rxCode,
  rxName: rxCode,
  rxType: '',
  date: DAY,
  firstVisit: false,
  outpatient: true,
  patient: 1,
  region: null,
})

// aggregate의 셈 규칙으로 본 답: 그날 일 칸에 그 묶음 줄이 있으면 참
function viaAggregate(def: RxGroupDef, codes: readonly string[]): boolean {
  const [day] = aggregate(codes.map(rowOf), [def]).day
  return day?.groups.some((group) => group.id === def.id) ?? false
}

const CASES: [string, RxGroupDef, string[], boolean][] = [
  // 넣는 처방만(AC-1205)
  ['넣는 처방 하나', { id: 'g-plain', codes: ['ESWT1'] }, ['ESWT1'], true],
  ['넣는 처방이 없음', { id: 'g-plain', codes: ['ESWT1'] }, ['D1001'], false],
  ['코드 없음', { id: 'g-plain', codes: ['ESWT1'] }, [], false],
  ['대소문자 — 묶음 eswt1 · 줄 ESWT1', { id: 'g-plain', codes: ['eswt1'] }, ['ESWT1'], true],
  ['대소문자 — 묶음 ESWT1 · 줄 eswt1', { id: 'g-plain', codes: ['ESWT1'] }, ['eswt1'], true],
  ['한 묶음에 대소문자만 다른 코드 둘', { id: 'g-plain', codes: ['ESWT1', 'eswt1'] }, ['Eswt1'], true],
  // 빼는 처방(AC-3703.1)
  ['MM010만', BASIC_PT, ['MM010'], true],
  ['MM010 + ESWT7', BASIC_PT, ['MM010', 'ESWT7'], false],
  ['ESWT7 + MM010(차례 바뀜)', BASIC_PT, ['ESWT7', 'MM010'], false],
  ['MM010 + MM015 + ESWT7', BASIC_PT, ['MM010', 'MM015', 'ESWT7'], false],
  ['MM010 + MM015(AC-3703.2)', BASIC_PT, ['MM010', 'MM015'], true],
  ['ESWT7만', BASIC_PT, ['ESWT7'], false],
  // 조건 처방(AC-3703.3)
  ['(가) MM080 + MM020', PT_COND, ['MM080', 'MM020'], false],
  ['(가) MM030 + MM080', PT_COND, ['MM030', 'MM080'], false],
  ['(가) MM080 + TENS', PT_COND, ['MM080', 'TENS'], false],
  ['(나) MM080 + MM020 + MM010', PT_COND, ['MM080', 'MM020', 'MM010'], true],
  ['(다) MM080 + MS1', PT_COND, ['MM080', 'MS1'], true],
  ['(라) MM080만', PT_COND, ['MM080'], true],
  ['MM010 + MM020(조건은 MM080에만)', PT_COND, ['MM010', 'MM020'], true],
  // 조건 + 빼는 처방(AC-3703.4)
  ['MM080 + ESWT7', BOTH, ['MM080', 'ESWT7'], false],
  ['MM010 + ESWT7', BOTH, ['MM010', 'ESWT7'], false],
  ['MM010 + MM080 + MM020 + ESWT7', BOTH, ['MM010', 'MM080', 'MM020', 'ESWT7'], false],
  ['MM080만(대조)', BOTH, ['MM080'], true],
  ['MM080 + MM020(대조)', BOTH, ['MM080', 'MM020'], false],
  // 빼는 처방·조건 대소문자(AC-3703.5)
  ['빼는 eswt7 · 줄 ESWT7', { id: 'g-case', codes: ['MM010'], out: ['eswt7'] }, ['MM010', 'ESWT7'], false],
  ['빼는 ESWT7 · 줄 Eswt7', { id: 'g-case', codes: ['MM010'], out: ['ESWT7'] }, ['MM010', 'Eswt7'], false],
  ['조건 mm080 ← mm020 · 줄 MM080·MM020', { id: 'g-case', codes: ['MM080'], cond: [{ code: 'mm080', unless: ['mm020'] }] }, ['MM080', 'MM020'], false],
  ['조건 MM080 ← MM020 · 넣는 mm080 · 줄 mm080·Mm020', { id: 'g-case', codes: ['mm080'], cond: [{ code: 'MM080', unless: ['MM020'] }] }, ['mm080', 'Mm020'], false],
  ['조건 대소문자 대조 — 넣는 처방만', { id: 'g-case', codes: ['mm080'], cond: [{ code: 'MM080', unless: ['MM020'] }] }, ['mm080'], true],
  // 버려지는 조건(AC-3703.7): 넣는 처방에 없는 code · 빈 unless · code 자신
  ['넣는 처방에 없는 조건 code는 버린다', { id: 'g-drop', codes: ['MM010'], cond: [{ code: 'MM999', unless: ['MM010'] }] }, ['MM010', 'MM999'], true],
  ['빈 unless는 버린다', { id: 'g-drop', codes: ['MM010'], cond: [{ code: 'MM010', unless: [] }] }, ['MM010'], true],
  ['unless의 code 자신은 버린다', { id: 'g-drop', codes: ['MM010'], cond: [{ code: 'MM010', unless: ['mm010'] }] }, ['MM010'], true],
  ['같은 code 조건 둘은 합친다', { id: 'g-drop', codes: ['MM080'], cond: [{ code: 'MM080', unless: ['MM020'] }, { code: 'mm080', unless: ['MM030'] }] }, ['MM080', 'MM030'], false],
  // 빼는 처방이 넣는 처방과 같으면 뺀다
  ['빼는 처방 = 넣는 처방', { id: 'g-self', codes: ['MM010'], out: ['MM010'] }, ['MM010'], false],
  // 빈 out·cond는 없는 것과 같다
  ['빈 out·cond', { id: 'g-empty', codes: ['MM010'], out: [], cond: [] }, ['MM010'], true],
]

describe('AC-4901.2 groupMatches — 통계 aggregate의 묶음 셈 규칙과 같은 답', () => {
  it.each(CASES)('AC-4901.2: %s → %s', (_, def, codes, expected) => {
    expect(groupMatches(def, codes)).toBe(expected)
  })

  it.each(CASES)('AC-4901.2: aggregate와 같다 — %s', (_, def, codes) => {
    expect(groupMatches(def, codes)).toBe(viaAggregate(def, codes))
  })

  it('AC-4901.2: def가 null이면 늘 거짓이다', () => {
    expect(groupMatches(null, [])).toBe(false)
    expect(groupMatches(null, ['MM010', 'MM110'])).toBe(false)
  })

  it('AC-4901.2: 같은 코드가 여러 번 있어도 답이 같다', () => {
    expect(groupMatches(BASIC_PT, ['MM010', 'MM010'])).toBe(true)
    expect(groupMatches(BASIC_PT, ['MM010', 'mm010', 'ESWT7'])).toBe(false)
  })

  it('AC-4901.2: 받은 목록·정의를 바꾸지 않는다', () => {
    const codes = Object.freeze(['MM080', 'MM020'])
    const def: RxGroupDef = Object.freeze({ ...PT_COND })
    expect(groupMatches(def, codes)).toBe(false)
    expect(codes).toEqual(['MM080', 'MM020'])
    expect(def).toEqual(PT_COND)
  })
})
