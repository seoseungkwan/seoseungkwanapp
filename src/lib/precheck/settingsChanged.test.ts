import { describe, expect, it } from 'vitest'
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
