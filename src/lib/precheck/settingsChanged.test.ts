import { describe, expect, it } from 'vitest'
import type { RuleUpdate } from '@/types/precheck'
import { settingsChanged, type SettingsBundle } from './settingsChanged'

// 점검에 쓴 설정 묶음과 다시 읽은 묶음 견주기 (precheck REQ-012 AC-012.7, design.md 6-5). 청구 화면(TASK-13)의 "설정이 바뀌었어요" 띠가 쓴다.
// 규칙과 문자 문구 줄은 집합으로 본다(순서만 다르면 같다). 상병 연결표는 순서까지 본다(추천 상병이 앞줄부터 고른다).
// 병원 문구는 칸 이름 순서만 보지 않고, 안의 배열은 순서까지 본다(줄 순서 설정 계획, docs/precheck/clinic-memo-plan.md)
// 병원 문구 자료는 원본 claim_hospital_settings.js validate를 통과하는 모양이다

const bundle = (): SettingsBundle => ({
  rules: { schema: 1, off: ['LA-01', 'LA-02'], on: ['MM-01', 'PT-02'], grade: [['LA-01', '알림'], ['PT-02', '참고']] },
  phrases: {
    TPL: {
      main: '{부위} {시술} 시행함',
      splitEach: true,
      reasonPriority: 'twoSite',
      fixedPhrases: [
        { token: '가이드말', text: 'C-arm guide 하에', on: true },
        { token: '끝맺음말', text: '시행함', on: true },
      ],
    },
    CODEMAP: { MM410: { n: '수압팽창술', k: 'proc', rg: 'shoulder' } },
    CODEMAP_DEL: ['HA280', 'MM152'],
  },
  dxLinks: [
    ['MM410', 'M751', '회전근개', 0, 's'],
    ['HA280', 'M170', '무릎관절증', 1, 't'],
  ],
  templates: [
    { kind: 'injection', name: '주사 안내', body: '안녕하세요', sort_order: 0 },
    { kind: 'followup', name: 'F/U 안내', body: '좀 어떠세요', sort_order: 1 },
  ],
})

describe('AC-012.7 settingsChanged', () => {
  it('AC-012.7: 같은 내용이면 false', () => {
    expect(settingsChanged(bundle(), bundle())).toBe(false)
  })

  it('AC-012.7: 비어 있는 묶음끼리도 false(병원 문구 null)', () => {
    const empty: SettingsBundle = { rules: { schema: 1, off: [], on: [], grade: [] }, phrases: null, dxLinks: [], templates: [] }
    expect(settingsChanged(empty, { ...empty, rules: { schema: 1, off: [], on: [], grade: [] } })).toBe(false)
  })

  it.each<[string, (b: SettingsBundle) => void]>([
    ['끈 규칙', (b) => b.rules.off.reverse()],
    ['켠 규칙', (b) => b.rules.on.reverse()],
    ['등급', (b) => b.rules.grade.reverse()],
    ['문자 문구 줄', (b) => b.templates.reverse()],
  ])('AC-012.7: 순서만 다른 것은 같다: %s', (_name, change) => {
    const b = bundle()
    change(b)
    expect(settingsChanged(bundle(), b)).toBe(false)
  })

  it('AC-012.7: 병원 문구의 칸 이름 순서만 다른 것은 같다(깊은 칸까지)', () => {
    const b = bundle()
    b.phrases = {
      CODEMAP_DEL: ['HA280', 'MM152'],
      CODEMAP: { MM410: { rg: 'shoulder', k: 'proc', n: '수압팽창술' } },
      TPL: {
        fixedPhrases: [
          { on: true, text: 'C-arm guide 하에', token: '가이드말' },
          { on: true, text: '시행함', token: '끝맺음말' },
        ],
        reasonPriority: 'twoSite',
        splitEach: true,
        main: '{부위} {시술} 시행함',
      },
    }
    expect(settingsChanged(bundle(), b)).toBe(false)
  })

  it.each<[string, (b: SettingsBundle) => void]>([
    ['규칙을 하나 더 끔', (b) => b.rules.off.push('LA-03')],
    ['규칙을 다시 켬', (b) => b.rules.off.pop()],
    ['켠 규칙이 늘어남', (b) => b.rules.on.push('LA-03')],
    ['등급을 바꿈', (b) => (b.rules.grade[0] = ['LA-01', '참고'])],
    ['등급 고른 것을 지움', (b) => b.rules.grade.pop()],
    ['병원 문구 값을 바꿈', (b) => (b.phrases = { ...(b.phrases as object), CODEMAP_DEL: ['MM410'] })],
    ['병원 문구가 없어짐', (b) => (b.phrases = null)],
    ['병원 문구 안 배열의 순서가 바뀜', (b) => (b.phrases = { ...(b.phrases as object), CODEMAP_DEL: ['MM152', 'HA280'] })],
    ['상병 연결표 순서만 바뀜(추천 상병이 앞줄부터 고른다)', (b) => b.dxLinks.reverse()],
    ['상병 연결표 줄이 늘어남', (b) => b.dxLinks.push(['MM410', 'M752', '충돌증후군', 0, 's'])],
    ['상병 연결표 값을 바꿈', (b) => (b.dxLinks[0] = ['MM410', 'M751', '회전근개', 1, 's'])],
    ['문자 문구 내용을 바꿈', (b) => (b.templates[0] = { ...b.templates[0]!, body: '다른 말' })],
    ['문자 문구 이름을 바꿈', (b) => (b.templates[0] = { ...b.templates[0]!, name: '다른 이름' })],
    ['문자 문구 종류를 바꿈', (b) => (b.templates[0] = { ...b.templates[0]!, kind: 'followup' })],
    ['문자 문구 순서 값을 바꿈', (b) => (b.templates[0] = { ...b.templates[0]!, sort_order: 5 })],
    ['문자 문구를 지움', (b) => b.templates.pop()],
  ])('AC-012.7: 하나라도 다르면 true: %s', (_name, change) => {
    const b = bundle()
    change(b)
    expect(settingsChanged(bundle(), b)).toBe(true)
    expect(settingsChanged(b, bundle())).toBe(true)
  })

  it('AC-012.7: 받은 묶음을 고치지 않는다', () => {
    const a = bundle()
    const b = bundle()
    b.rules.off.reverse()
    const copy = structuredClone({ a, b })
    settingsChanged(a, b)
    expect({ a, b }).toEqual(copy)
  })
})

// 고시로 바뀐 규칙 판(specs/rule-auto REQ-7804 AC-7804.4, design 6절). 판은 (changeId, from)으로만 견준다: 되돌리기·다시 적용·새 판이 이 모음을 바꾼다.
// 칸이 없는 묶음(옛 사본·판을 읽기 전)은 빈 목록으로 본다
describe('AC-7804.4 settingsChanged — 바뀐 규칙 판', () => {
  const update = (changeId: string, from: string, patch: Partial<RuleUpdate> = {}): RuleUpdate => ({
    changeId,
    ruleId: 'IJ-13',
    from,
    baseVersion: '2026-10-19',
    rule: { id: 'IJ-13', title: '가짜 판', effective_from: from },
    ...patch,
  })
  const withUpdates = (list?: RuleUpdate[]): SettingsBundle => (list === undefined ? bundle() : { ...bundle(), ruleUpdates: list })
  const both = (a: SettingsBundle, b: SettingsBundle) => [settingsChanged(a, b), settingsChanged(b, a)]

  it('AC-7804.4: (changeId, from) 모음이 같으면 차례만 달라도 false', () => {
    const list = [update('c1', '2026-12-01'), update('c2', '2026-11-15'), update('c3', '2027-01-01')]
    expect(both(withUpdates(list), withUpdates([...list].reverse()))).toEqual([false, false])
    expect(both(withUpdates(list), withUpdates(structuredClone(list)))).toEqual([false, false])
  })

  it('AC-7804.4: 한쪽에 칸이 없으면 빈 목록으로 본다', () => {
    expect(both(withUpdates(), withUpdates([]))).toEqual([false, false])
    expect(both(withUpdates(), withUpdates())).toEqual([false, false])
    expect(both(withUpdates(), withUpdates([update('c1', '2026-12-01')]))).toEqual([true, true])
  })

  it.each<[string, RuleUpdate[]]>([
    ['판이 하나 빠짐(되돌리기)', [update('c1', '2026-12-01')]],
    ['판이 하나 더 있음(다시 적용·새 판)', [update('c1', '2026-12-01'), update('c2', '2026-11-15'), update('c3', '2027-01-01')]],
    ['같은 changeId의 날짜가 다름', [update('c1', '2026-12-02'), update('c2', '2026-11-15')]],
    ['같은 날짜의 changeId가 다름', [update('c1', '2026-12-01'), update('c9', '2026-11-15')]],
  ])('AC-7804.4: (changeId, from) 모음이 다르면 true: %s', (_name, list) => {
    const used = withUpdates([update('c1', '2026-12-01'), update('c2', '2026-11-15')])
    expect(both(used, withUpdates(list))).toEqual([true, true])
  })

  it('AC-7804.4: changeId·from 밖의 칸(규칙 번호·규칙표 판·규칙 내용)은 견주지 않는다', () => {
    const used = withUpdates([update('c1', '2026-12-01')])
    const other = withUpdates([update('c1', '2026-12-01', { ruleId: 'LA-18', baseVersion: '2026-11-01', rule: { title: '다른 글' } })])
    expect(both(used, other)).toEqual([false, false])
  })

  it('AC-7804.4: 그 밖 비교는 그대로다(판이 같아도 다른 칸이 다르면 true)', () => {
    const list = [update('c1', '2026-12-01')]
    const a = withUpdates(list)
    const b = withUpdates(structuredClone(list))
    b.rules.off.push('LA-03')
    expect(both(a, b)).toEqual([true, true])
    const c = withUpdates([...list].reverse())
    c.rules.off.reverse()
    expect(both(a, c)).toEqual([false, false])
  })

  it('AC-7804.4: 받은 묶음의 판 목록을 고치지 않는다(정렬은 사본으로)', () => {
    const a = withUpdates([update('c2', '2026-12-01'), update('c1', '2026-11-15')])
    const b = withUpdates([update('c1', '2026-11-15'), update('c2', '2026-12-01')])
    const copy = structuredClone({ a, b })
    settingsChanged(a, b)
    expect({ a, b }).toEqual(copy)
  })
})
