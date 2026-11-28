import { describe, expect, it } from 'vitest'
import { allowedTokens, defaultPhrases, diffPhrases, migratePhrases, ourClinicPhrases, validatePhrases, type Phrases } from './index'

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

// ── memo-settings TASK-1: memoRules 검사·비교 이름표·칸별 {항목} ─────────────────────

const withRules = (memoRules: unknown) => ({ ...ourClinicPhrases(), memoRules }) as Phrases

describe('AC-3006.1 memoRules 검사', () => {
  it('AC-3006.1: memoRules가 없어도 지난다', () => {
    expect(validatePhrases(ourClinicPhrases()).ok).toBe(true)
  })

  it.each([
    ['빈 칸', {}],
    ['참거짓 셋', { singleOwnerDrug: false, iaSide: true, kneeSetIaWithDrug: true }],
    ['줄 순서', { order: { KK090: 1, LA358: 999, 'LA-1': 5 } }],
    ['빈 줄 순서', { order: {} }],
  ])('AC-3006.1: 받는 값: %s', (_name, rules) => {
    const result = validatePhrases(withRules(rules))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.memoRules).toEqual(rules)
  })

  it.each([
    ['배열', [], 'memoRules'],
    ['글자', 'x', 'memoRules'],
    ['null', null, 'memoRules'],
    ['모르는 칸', { extra: true }, 'memoRules'],
    ['singleOwnerDrug가 글자', { singleOwnerDrug: 'yes' }, 'memoRules.singleOwnerDrug'],
    ['iaSide가 숫자', { iaSide: 1 }, 'memoRules.iaSide'],
    ['kneeSetIaWithDrug가 null', { kneeSetIaWithDrug: null }, 'memoRules.kneeSetIaWithDrug'],
    ['줄 순서가 배열', { order: [] }, 'memoRules.order'],
    ['줄 순서 0', { order: { KK090: 0 } }, 'memoRules.order.KK090'],
    ['줄 순서 1000', { order: { KK090: 1000 } }, 'memoRules.order.KK090'],
    ['줄 순서 소수', { order: { KK090: 1.5 } }, 'memoRules.order.KK090'],
    ['줄 순서가 글자', { order: { KK090: '1' } }, 'memoRules.order.KK090'],
    ['소문자 코드', { order: { kk090: 1 } }, 'memoRules.order.kk090'],
    ['틀린 코드', { order: { ' KK090': 1 } }, 'memoRules.order. KK090'],
  ])('AC-3006.1: 거절하는 값: %s', (_name, rules, path) => {
    const result = validatePhrases(withRules(rules))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.map((e) => e.path)).toContain(path)
  })

  it('AC-3006.1: 위험한 코드 이름을 거절한다', () => {
    expect(validatePhrases(withRules(JSON.parse('{"order":{"__proto__":1}}'))).ok).toBe(false)
  })

  it('AC-3006.1: memoRules가 있어도 원본 칸 검사 결과는 그대로다', () => {
    const value = withRules({ iaSide: true, order: { KK090: 1 } })
    value.TPL.main = '{없는말}'
    expect(validatePhrases(value)).toEqual({ ok: false, errors: [{ path: 'TPL.main', message: '지원하지 않는 항목 {없는말}입니다. 이 항목의 삽입 버튼을 사용해 주세요.' }] })
  })
})

describe('AC-3006.2 diffPhrases의 memoRules 이름표', () => {
  it.each([
    ['iaSide', { iaSide: true }, 'IA·건초내주사 줄에 좌우 넣기', '끔', '켬'],
    ['kneeSetIaWithDrug', { kneeSetIaWithDrug: true }, '무릎 세트 날 약이 있으면 IA 줄 쓰기', '끔', '켬'],
    ['singleOwnerDrug', { singleOwnerDrug: false }, '시술 2개 이상인 날 넣기 시술이 하나면 약 넣기', '켬', '끔'],
  ])('AC-3006.2: %s 켜기·끄기는 쉬운 이름표와 켬·끔으로 보인다(칸이 없으면 처음 값)', (key, rules, label, before, after) => {
    expect(diffPhrases(ourClinicPhrases(), withRules(rules))).toEqual([{ path: `memoRules.${key}`, label, before, after }])
  })

  it('AC-3006.2: 줄 순서는 코드마다 "코드 · 줄 순서"로 보인다', () => {
    const before = withRules({ order: { LA358: 2 } })
    const after = withRules({ order: { KK090: 1, LA358: 3 } })
    expect(diffPhrases(before, after)).toEqual([
      { path: 'memoRules.order.KK090', label: 'KK090 · 줄 순서', before: '(없음)', after: '1' },
      { path: 'memoRules.order.LA358', label: 'LA358 · 줄 순서', before: '2', after: '3' },
    ])
    expect(diffPhrases(withRules({ order: { KK090: 1 } }), ourClinicPhrases())).toEqual([{ path: 'memoRules.order.KK090', label: 'KK090 · 줄 순서', before: '1', after: '(없음)' }])
  })
})

describe('AC-3008.1 allowedTokens: 칸마다 쓸 수 있는 {항목}은 검사와 같다', () => {
  const TEMPLATE_PATHS = ['TPL.main', 'TPL.mainCentral', 'TPL.mainPeripheral', 'TPL.cpb', 'TPL.snb', 'TPL.icnb', 'TPL.ara', 'TPL.klg', 'TPL.iaAra', 'TPL.iaEtc', 'TPL.ts', 'TPL.itv', 'TPL.ia2', 'TPL.sentence', 'TPL.byProc.SSNB', 'TPL.byRegion.knee', 'CODEMAP.KK090.memo', 'CODEMAP.KK090.cartilageMemo']
  const UNIVERSE = ['좌우', '한글방향', '영문방향', '레벨', '부위', '시술', '약제', 'KLG', '검사', '기간', '진단', '영상', '회차', 'KL1', 'KL2', '투여량', '코드', '처방명', '표기', '골절', '시술목록', 'C-arm', 'Sono', '시행함', '없는말']
  /** 칸 하나에 글을 넣은 설정 */
  function put(path: string, text: string): Phrases {
    const value = ourClinicPhrases()
    const [group, ...rest] = path.split('.')
    if (group === 'TPL' && rest.length === 2) (value.TPL as Record<string, Record<string, string>>)[rest[0]] = { [rest[1]]: text }
    else if (group === 'TPL') (value.TPL as Record<string, string>)[rest[0]] = text
    else (value.CODEMAP[rest[0]] as Record<string, unknown>)[rest[1]] = text
    return value
  }

  it.each(TEMPLATE_PATHS)('AC-3008.1: %s: 단추 항목은 모두 검사를 지나고, 단추에 없는 항목은 그 칸 오류다', (path) => {
    const allowed = allowedTokens(path, ourClinicPhrases())
    expect(allowed.length).toBeGreaterThan(10)
    expect(validatePhrases(put(path, allowed.map((t) => `{${t}}`).join(' '))).ok).toBe(true)
    for (const token of UNIVERSE.filter((t) => !allowed.includes(t))) {
      const result = validatePhrases(put(path, `{${token}}`))
      expect(result.ok, token).toBe(false)
      if (!result.ok) expect(result.errors.map((e) => e.path)).toContain(path)
    }
  })

  it('AC-3008.1: 칸마다 더 쓰는 항목이 다르다', () => {
    const our = ourClinicPhrases()
    expect(allowedTokens('TPL.ara', our)).toContain('회차')
    expect(allowedTokens('TPL.main', our)).not.toContain('회차')
    expect(allowedTokens('TPL.iaEtc', our)).toEqual(expect.arrayContaining(['투여량', '코드', '처방명']))
    expect(allowedTokens('CODEMAP.KK090.memo', our)).toEqual(expect.arrayContaining(['투여량', '코드', '표기', '골절']))
    expect(allowedTokens('TPL.sentence', our)).toContain('시술목록')
    expect(allowedTokens('TPL.rename', our)).toEqual([])
  })

  it('AC-3008.1: 병원이 만든 고정 멘트가 단추에 들어가고, 더하거나 이름을 바꾸면 바로 바뀐다', () => {
    const our = ourClinicPhrases()
    expect(allowedTokens('TPL.main', our)).toEqual(expect.arrayContaining(['C-arm', 'Sono', '시행함']))
    our.TPL.fixedPhrases = [
      { token: '초음파', text: '초음파 유도하', on: true },
      { token: '끈멘트', text: 'x', on: false },
    ]
    expect(allowedTokens('TPL.main', our)).toEqual(expect.arrayContaining(['초음파', '끈멘트']))
    expect(allowedTokens('TPL.main', our)).not.toContain('C-arm')
    our.TPL.fixedPhrases[0].token = '유도'
    expect(allowedTokens('TPL.byRegion.knee', our)).toContain('유도')
    expect(allowedTokens('TPL.byRegion.knee', our)).not.toContain('초음파')
  })
})

// ── clinic-profile TASK-5: 차트 줄임말(chartWords) 검사·비교 이름표(design.md 14절) ─────────────

const withWords = (chartWords: unknown) => ({ ...ourClinicPhrases(), chartWords }) as Phrases

describe('AC-6612.1 AC-6612.2 chartWords 검사', () => {
  it.each([
    ['줄 하나', [{ term: '무주', target: 'IA' }]],
    ['빈 표', []],
    ['100줄', Array.from({ length: 100 }, (_, i) => ({ term: `말${i}`, target: 'IA' }))],
    ['40자', [{ term: '가'.repeat(40), target: 'x'.repeat(40) }]],
    ['한 글자', [{ term: '무', target: 'A' }]],
    ['가운데 빈칸', [{ term: '무 주', target: 'IA injection' }]],
  ])('AC-6612.1: 받는 값: %s', (_name, rows) => {
    const result = validatePhrases(withWords(rows))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.chartWords).toEqual(rows)
  })

  it('AC-6612.1: 칸이 없어도 지난다(없으면 빈 표)', () => {
    const result = validatePhrases(ourClinicPhrases())
    expect(result.ok).toBe(true)
    if (result.ok) expect(Object.hasOwn(result.value, 'chartWords')).toBe(false)
  })

  it.each([
    ['배열이 아님', { term: '무주', target: 'IA' }, 'chartWords'],
    ['글자', 'x', 'chartWords'],
    ['null', null, 'chartWords'],
    ['101줄', Array.from({ length: 101 }, (_, i) => ({ term: `말${i}`, target: 'IA' })), 'chartWords'],
    ['줄이 글자', ['무주 = IA'], 'chartWords.0'],
    ['모르는 칸', [{ term: '무주', target: 'IA', extra: 1 }], 'chartWords.0'],
    ['적으면 칸 없음', [{ target: 'IA' }], 'chartWords.0.term'],
    ['읽어요 칸이 숫자', [{ term: '무주', target: 1 }], 'chartWords.0.target'],
    ['빈 적으면', [{ term: '', target: 'IA' }], 'chartWords.0.term'],
    ['빈 읽어요', [{ term: '무주', target: '' }], 'chartWords.0.target'],
    ['앞 빈칸', [{ term: ' 무주', target: 'IA' }], 'chartWords.0.term'],
    ['뒤 빈칸', [{ term: '무주', target: 'IA ' }], 'chartWords.0.target'],
    ['41자', [{ term: '가'.repeat(41), target: 'IA' }], 'chartWords.0.term'],
    ['줄바꿈', [{ term: '무\n주', target: 'IA' }], 'chartWords.0.term'],
    ['같은 적으면(대소문자만 다름)', [{ term: 'ia', target: 'IA' }, { term: 'IA', target: 'SSNB' }], 'chartWords.1.term'],
  ])('AC-6612.1: 거절하는 값: %s', (_name, rows, path) => {
    const result = validatePhrases(withWords(rows))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.map((e) => e.path)).toContain(path)
  })

  it('AC-6612.1: 위험한 칸 이름을 거절한다', () => {
    expect(validatePhrases(withWords(JSON.parse('[{"term":"무주","target":"IA","__proto__":{}}]'))).ok).toBe(false)
  })

  it('AC-6612.1: chartWords가 있어도 원본 칸 검사 결과는 그대로다', () => {
    const value = withWords([{ term: '무주', target: 'IA' }])
    value.TPL.main = '{없는말}'
    expect(validatePhrases(value)).toEqual({ ok: false, errors: [{ path: 'TPL.main', message: '지원하지 않는 항목 {없는말}입니다. 이 항목의 삽입 버튼을 사용해 주세요.' }] })
  })

  it("AC-6612.1: diffPhrases는 '차트 줄임말' 한 줄로 '적으면 = 읽어요'를 보인다(없음과 빈 표는 같다)", () => {
    expect(diffPhrases(ourClinicPhrases(), withWords([{ term: '무주', target: 'IA' }, { term: '내측', target: 'MBB' }]))).toEqual([
      { path: 'chartWords', label: '차트 줄임말', before: '(없음)', after: '무주 = IA, 내측 = MBB' },
    ])
    expect(diffPhrases(withWords([{ term: '무주', target: 'IA' }]), withWords([]))).toEqual([{ path: 'chartWords', label: '차트 줄임말', before: '무주 = IA', after: '(없음)' }])
    expect(diffPhrases(ourClinicPhrases(), withWords([]))).toEqual([])
  })
})

// ── claim-learn TASK-3: 건초내주사로 알아볼 차트 말(TPL.tsWords) 검사·비교 이름표(design.md 2·9절) ─────────────

const withTsWords = (tsWords: unknown) => {
  const value = ourClinicPhrases()
  ;(value.TPL as Record<string, unknown>).tsWords = tsWords
  return value
}

describe('AC-9308.4 TPL.tsWords 검사', () => {
  it.each([
    ['처음 말 + TSI', '건초, tendon sheath, trigger finger, 방아쇠, quervain, tenosyn, TS, STI, TSI'],
    ['빈 글', ''],
    ['500자', 'a'.repeat(500)],
  ])('AC-9308.4: 받는 값: %s', (_name, words) => {
    const result = validatePhrases(withTsWords(words))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.TPL.tsWords).toBe(words)
  })

  it('AC-9308.4: 칸이 없어도 지난다(없으면 지금 말)', () => {
    const result = validatePhrases(ourClinicPhrases())
    expect(result.ok).toBe(true)
    if (result.ok) expect(Object.hasOwn(result.value.TPL, 'tsWords')).toBe(false)
  })

  it.each([
    ['501자', 'a'.repeat(501)],
    ['숫자', 1],
    ['배열', ['TS']],
    ['제어 문자', 'TS\u0001'],
  ])('AC-9308.4: 거절하는 값: %s', (_name, words) => {
    expect(validatePhrases(withTsWords(words))).toEqual({ ok: false, errors: [{ path: 'TPL.tsWords', message: '건초내주사로 알아볼 차트 말은 쉼표로 나눠 500자까지 적어 주세요.' }] })
  })

  it('AC-9308.4: tsWords가 있어도 원본 칸 검사 결과는 그대로다', () => {
    const value = withTsWords('TS, TSI')
    value.TPL.main = '{없는말}'
    expect(validatePhrases(value)).toEqual({ ok: false, errors: [{ path: 'TPL.main', message: '지원하지 않는 항목 {없는말}입니다. 이 항목의 삽입 버튼을 사용해 주세요.' }] })
  })

  it("AC-9308.4: diffPhrases는 '건초내주사로 알아볼 차트 말' 이름표로 보인다", () => {
    expect(diffPhrases(ourClinicPhrases(), withTsWords('TS, TSI'))).toEqual([{ path: 'TPL.tsWords', label: '건초내주사로 알아볼 차트 말', before: '(없음)', after: 'TS, TSI' }])
  })
})
