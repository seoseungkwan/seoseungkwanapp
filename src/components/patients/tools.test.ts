import { describe, expect, it } from 'vitest'
import { PATIENTS_TOOLS, toolFrom, toolHref } from './tools'

// 환자 탭 도구와 주소(AC-610.2·AC-610.5). 주소에는 도구 이름만 들어간다

describe('PATIENTS_TOOLS (AC-610.2)', () => {
  it('AC-610.2: 도구 셋이 차례대로 F/U 명단 · 정기 주사 문자 명단 · 문자 문구다', () => {
    expect(PATIENTS_TOOLS.map(({ id, label }) => [id, label])).toEqual([
      ['followup', 'F/U 명단'],
      ['recall', '정기 주사 문자 명단'],
      ['messages', '문자 문구'],
    ])
  })
})

describe('toolFrom (AC-610.2)', () => {
  it.each(['followup', 'recall', 'messages'] as const)('AC-610.2: ?tool=%s는 그 도구다', (id) => {
    expect(toolFrom(id)).toBe(id)
  })

  it.each([
    ['없음', undefined],
    ['빈 글자', ''],
    ['모르는 값', 'stats'],
    ['대문자', 'RECALL'],
    ['객체 기본 열쇠', 'constructor'],
    ['__proto__', '__proto__'],
    ['여러 값', ['recall', 'messages']],
    ['값 하나짜리 배열', ['recall']],
    ['빈 배열', []],
  ])('AC-610.2: %s이면 F/U 명단이다', (_name, param) => {
    expect(toolFrom(param)).toBe('followup')
  })
})

describe('toolHref (AC-610.5)', () => {
  it.each(['followup', 'recall', 'messages'] as const)('AC-610.5: %s의 주소에는 도구 이름만 있다', (id) => {
    expect(toolHref(id)).toBe(`/patients?tool=${id}`)
  })
})
