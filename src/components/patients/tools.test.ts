import { describe, expect, it } from 'vitest'
import { PATIENTS_TOOLS, toolFrom, toolHref } from './tools'

// 환자 탭 도구와 주소(AC-610.2·AC-610.5, 비트 명단 두 도구 AC-2802.1). 주소에는 도구 이름만 들어간다

const IDS = ['followup', 'reservations', 'recall', 'lapsed', 'messages'] as const

describe('PATIENTS_TOOLS (AC-610.2·AC-2802.1)', () => {
  it('AC-2802.1·AC-2806.3: 도구 다섯이 차례대로 F/U 명단 · 예약 문자 명단 · 정기 주사 문자 명단 · 장기 미방문 명단 · 문자 문구다', () => {
    expect(PATIENTS_TOOLS.map(({ id, label }) => [id, label])).toEqual([
      ['followup', 'F/U 명단'],
      ['reservations', '예약 문자 명단'],
      ['recall', '정기 주사 문자 명단'],
      ['lapsed', '장기 미방문 명단'],
      ['messages', '문자 문구'],
    ])
  })

  it('AC-2802.1: 지금 세 도구의 아이콘은 그대로이고 새 둘도 아이콘이 있다', () => {
    const icon = Object.fromEntries(PATIENTS_TOOLS.map(({ id, icon }) => [id, icon]))
    expect(icon).toMatchObject({ followup: 'cal', recall: 'clock', messages: 'doc' })
    expect(icon.reservations).toBeTruthy()
    expect(icon.lapsed).toBeTruthy()
  })
})

describe('toolFrom (AC-610.2·AC-2802.1)', () => {
  it.each(IDS)('AC-610.2·AC-2802.1: ?tool=%s는 그 도구다', (id) => {
    expect(toolFrom(id)).toBe(id)
  })

  it.each([
    ['없음', undefined],
    ['빈 글자', ''],
    ['모르는 값', 'stats'],
    ['대문자', 'RECALL'],
    ['단수형', 'reservation'],
    ['객체 기본 열쇠', 'constructor'],
    ['__proto__', '__proto__'],
    ['여러 값', ['recall', 'messages']],
    ['값 하나짜리 배열', ['recall']],
    ['빈 배열', []],
  ])('AC-610.2: %s이면 F/U 명단이다', (_name, param) => {
    expect(toolFrom(param)).toBe('followup')
  })
})

describe('toolHref (AC-610.5·AC-2802.1)', () => {
  it.each(IDS)('AC-610.5·AC-2802.1: %s의 주소에는 도구 이름만 있다', (id) => {
    expect(toolHref(id)).toBe(`/patients?tool=${id}`)
  })
})
