// 설정(TASK-5 REQ-3607): 처음 값·저장 모양·도우미에 보낼 묶음·코드 찾기·고르기 규칙. chrome.storage는 가짜다
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULTS,
  DEFAULTS_VERSION,
  MAX_CODES,
  MAX_ETC_NAME,
  MAX_RESULTS,
  MAX_RULES,
  MAX_WITH,
  addCode,
  addKind,
  cleanCode,
  cleanEtcName,
  cleanExcludes,
  conflicts,
  defaults,
  load,
  newDefaultCodes,
  normalize,
  resetCodes,
  ruleCodes,
  ruleProblem,
  save,
  saveOverlap,
  search,
  toGroups,
  unusedCodes,
  without,
} from './settings'
import * as settingsModule from './settings'
import { ETC_CLASH_ROWS } from './cells'
import { ERRORS, explain } from './errors'
import { EXCLUDE_KEYS, GROUP_KEYS, SETTINGS_KEY } from './types'
import type { ClosingCodes, ExcludeRule, Settings } from './types'

/** chrome.storage.local 흉내. 넣은 값은 복사해 둔다(크롬처럼 JSON으로 오간다) */
function fakeStorage(initial: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = JSON.parse(JSON.stringify(initial))
  const local = {
    get: vi.fn(async (key: string) => (key in data ? { [key]: JSON.parse(JSON.stringify(data[key])) } : {})),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(data, JSON.parse(JSON.stringify(items)))
    }),
  }
  vi.stubGlobal('chrome', { storage: { local } })
  return { data, local }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

/** requirements 이미 정한 것 7 */
const FIRST: Settings = {
  v: 1,
  picks: {
    carm: ['CARM1'],
    sono: ['SONO1'],
    arthro: ['HA280'],
    manual: ['도수'],
    eswt: ['ESWT7', 'ESWT10', 'ESWT12', 'ESWT17'],
    pt: ['MM010', 'MM015', 'MM011', 'MM085', 'MM080', 'MM020'],
    etc1: ['CRYO', 'CRYO3'],
    ptVisit: ['AA222'],
  },
  etcNames: { etc1: '크라이오', etc2: '', etc3: '', etc4: '' },
  reservations: {},
  // AC-3707.2: 씨암·SONO 매출 규칙 처음 값은 셀 코드 없음(앞글자는 읽지 않아 늘 빈 목록, 전 판 처음 값 LA 없음)
  amounts: { carm: { prefixes: [], codes: [] }, sono: { prefixes: [], codes: [] } },
  // 처음 값 판(TASK-18, 기본값 (타)): 물리치료 MM085·MM080·MM020 · 크라이오 CRYO3을 더한 판 2
  defaultsSeen: 2,
}

/** 매출 규칙 처음 값(AC-3707.2: 셀 코드 없음) */
const FIRST_AMOUNTS = () => ({ carm: { prefixes: [] as string[], codes: [] as string[] }, sono: { prefixes: [] as string[], codes: [] as string[] } })

describe('AC-3607.3 처음 값', () => {
  it('AC-3607.3 AC-3707.2: 처음 값은 이미 정한 것 7 그대로이고 예약 6줄은 비어 있으며, 씨암·SONO 매출 규칙은 셀 코드 없음(앞글자 없음)이고 overlap은 없다', () => {
    expect(DEFAULTS).toEqual(FIRST)
    expect(defaults()).toEqual(FIRST)
    expect(defaults()).not.toHaveProperty('overlap')
  })

  it('AC-3607.3: 물리치료 처음 코드는 6개(MM085·MM080·MM020 더함), 크라이오(기타1)는 CRYO·CRYO3 차례다(2026-11-10 밤 사용자 결정)', () => {
    expect(defaults().picks.pt).toEqual(['MM010', 'MM015', 'MM011', 'MM085', 'MM080', 'MM020'])
    expect(defaults().picks.etc1).toEqual(['CRYO', 'CRYO3'])
    expect(defaults().etcNames.etc1).toBe('크라이오')
  })

  it('AC-3607.3: 이미 저장한 설정에는 새 처음 코드가 저절로 들어가지 않는다(불러온 값 그대로)', async () => {
    const saved = { ...FIRST, picks: { ...FIRST.picks, pt: ['MM010', 'MM015', 'MM011'], etc1: ['CRYO'] } }
    fakeStorage({ [SETTINGS_KEY]: saved })
    const got = await load()
    expect(got?.picks.pt).toEqual(['MM010', 'MM015', 'MM011'])
    expect(got?.picks.etc1).toEqual(['CRYO'])
  })

  it('AC-3607.3: defaults()는 새 복사본이라 고쳐도 처음 값이 바뀌지 않는다', () => {
    const a = defaults()
    a.picks.carm?.push('X1')
    a.etcNames.etc1 = '바꿈'
    a.reservations.manual = ['14']
    a.amounts.carm.prefixes.push('KK')
    a.amounts.sono.codes.push('KK090')
    expect(defaults()).toEqual(FIRST)
    expect(DEFAULTS).toEqual(FIRST)
  })
})

describe('AC-3607.3 저장·불러오기 (chrome.storage.local erpClosing 한 칸)', () => {
  it('AC-3607.3: 저장한 적이 없으면 load()는 null이다', async () => {
    const { local } = fakeStorage()
    expect(await load()).toBeNull()
    expect(local.get).toHaveBeenCalledWith(SETTINGS_KEY)
  })

  it('AC-3607.3: save()는 erpClosing 한 열쇠에 design.md 4절 모양으로 쓰고, load()가 같은 값을 돌려준다', async () => {
    const { data, local } = fakeStorage()
    const s = defaults()
    s.picks.manual = ['도수', 'MA4']
    s.picks.surgery = []
    s.etcNames.etc2 = '  핫팩  '
    s.reservations = { manual: ['14', '20', '22'], eswt: ['1'], clinic: [] }
    await save(s)
    expect(local.set).toHaveBeenCalledTimes(1)
    expect(Object.keys(local.set.mock.calls[0][0])).toEqual([SETTINGS_KEY])
    const expected: Settings = {
      v: 1,
      picks: { ...FIRST.picks, manual: ['도수', 'MA4'] },
      etcNames: { etc1: '크라이오', etc2: '핫팩', etc3: '', etc4: '' },
      reservations: { manual: ['14', '20', '22'], eswt: ['1'] },
      amounts: FIRST_AMOUNTS(),
      defaultsSeen: 2,
    }
    expect(data[SETTINGS_KEY]).toEqual(expected)
    // 칸 차례도 정해 둔 대로(묶음은 GROUP_KEYS 차례)
    expect(Object.keys((data[SETTINGS_KEY] as Settings).picks)).toEqual(
      GROUP_KEYS.filter((k) => (expected.picks[k]?.length ?? 0) > 0),
    )
    expect(await load()).toEqual(expected)
  })

  it('AC-3607.3: 저장된 값이 틀린 모양이면 load()는 null이다(판이 1이 아님·객체 아님)', async () => {
    fakeStorage({ [SETTINGS_KEY]: { ...FIRST, v: 2 } })
    expect(await load()).toBeNull()
    fakeStorage({ [SETTINGS_KEY]: 'x' })
    expect(await load()).toBeNull()
  })

  it('AC-3607.3 AC-3607.7: 불러온 값의 모르는 칸·틀린 코드·겹친 코드·20개 넘는 코드는 떼어 낸다(가운데 빈칸 하나 코드 A B는 남는다)', async () => {
    const many = Array.from({ length: 25 }, (_, i) => `C${i}`)
    fakeStorage({
      [SETTINGS_KEY]: {
        v: 1,
        picks: { carm: ['CARM1', 'CARM1', 'A B', '', 3, 'X'.repeat(21), 'A\tB'], sono: many, nope: ['X'] },
        etcNames: { etc1: 7, etc2: ' 크라이오 ' },
        reservations: { manual: ['14', '14', 5], wrong: ['1'] },
        extra: true,
      },
    })
    expect(await load()).toEqual({
      v: 1,
      picks: { carm: ['CARM1', 'A B'], sono: many.slice(0, 20) },
      etcNames: { etc1: '', etc2: '크라이오', etc3: '', etc4: '' },
      reservations: { manual: ['14'] },
      amounts: FIRST_AMOUNTS(),
      defaultsSeen: 1,
    })
  })
})

describe('AC-3607.5 도우미에 보낼 묶음 toGroups', () => {
  it('AC-3607.5 AC-3707.2: 처음 값이면 코드가 있는 8묶음을 design.md 2절 차례로 담고, 셀 코드가 없으니 씨암·SONO에도 매출 규칙 칸을 붙이지 않는다', () => {
    expect(toGroups(defaults())).toEqual([
      { key: 'carm', codes: ['CARM1'] },
      { key: 'sono', codes: ['SONO1'] },
      { key: 'arthro', codes: ['HA280'] },
      { key: 'manual', codes: ['도수'] },
      { key: 'eswt', codes: ['ESWT7', 'ESWT10', 'ESWT12', 'ESWT17'] },
      { key: 'pt', codes: ['MM010', 'MM015', 'MM011', 'MM085', 'MM080', 'MM020'] },
      { key: 'etc1', codes: ['CRYO', 'CRYO3'] },
      { key: 'ptVisit', codes: ['AA222'] },
    ])
  })

  it('AC-3607.5: 칸을 넣은 차례와 상관없이 GROUP_KEYS 차례이고, 빈 묶음은 빠진다', () => {
    const s: Settings = {
      v: 1,
      picks: { ptVisit: ['AA222'], injection: ['A15'], carm: [], eswtStd: ['ESWT7'], sono: ['SONO1'] },
      etcNames: { etc1: '', etc2: '', etc3: '', etc4: '' },
      reservations: {},
    }
    expect(toGroups(s).map((g) => g.key)).toEqual(['sono', 'eswtStd', 'injection', 'ptVisit'])
  })

  it('AC-3607.5: 돌려준 코드 목록은 복사본이라 설정을 바꾸지 않는다', () => {
    const s = defaults()
    toGroups(s)[0].codes.push('X')
    expect(s.picks.carm).toEqual(['CARM1'])
  })
})

describe('AC-3607.1 코드 찾기 search', () => {
  const CODES: ClosingCodes['codes'] = [
    { code: 'SONO1', name: '비급여초음파', visits: 6820 },
    { code: 'ESWT12', name: '체외충격파(4000타)', visits: 214 },
    { code: 'ESWT7', name: '체외충격파(2000타)', visits: 2180 },
    { code: 'eswt99', name: null, visits: 3 },
    { code: 'ESWT10', name: '체외충격파(3000타)', visits: 176 },
    { code: 'MM010', name: '표층열치료', visits: 5960 },
  ]

  it('AC-3607.1: 코드나 이름에 그 글자가 든 코드를 1년 진료 수가 많은 차례로 준다', () => {
    expect(search(CODES, '체외').map((c) => c.code)).toEqual(['ESWT7', 'ESWT12', 'ESWT10'])
  })

  it('AC-3607.1: 대소문자를 가리지 않고 앞뒤 공백은 뗀다(이름이 없는 코드도 코드로 찾는다)', () => {
    expect(search(CODES, '  Eswt ').map((c) => c.code)).toEqual(['ESWT7', 'ESWT12', 'ESWT10', 'eswt99'])
    expect(search(CODES, 'sono').map((c) => c.code)).toEqual(['SONO1'])
  })

  it('AC-3607.1: 빈 글자면 아무것도 주지 않고, 맞는 것이 없으면 빈 목록이다', () => {
    expect(search(CODES, '')).toEqual([])
    expect(search(CODES, '   ')).toEqual([])
    expect(search(CODES, '없는말')).toEqual([])
  })

  it('AC-3607.1: 30개까지만 준다', () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ code: `Z${i}`, name: null, visits: i }))
    const found = search(many, 'z')
    expect(MAX_RESULTS).toBe(30)
    expect(found).toHaveLength(30)
    expect(found[0].code).toBe('Z49')
  })

  it('AC-3607.1: 받은 목록의 차례를 바꾸지 않는다', () => {
    const before = CODES.map((c) => c.code)
    search(CODES, 'e')
    expect(CODES.map((c) => c.code)).toEqual(before)
  })
})

describe('AC-3607.1·AC-3607.2 고르기·빼기·기타 이름', () => {
  it('AC-3607.1: 코드를 더하면 끝에 붙고, 같은 코드는 두 번 들어가지 않는다', () => {
    expect(addCode(['A'], 'B')).toEqual(['A', 'B'])
    expect(addCode(['A', 'B'], 'A')).toEqual(['A', 'B'])
  })

  it('AC-3607.1: 항목마다 20개까지만 고른다', () => {
    const twenty = Array.from({ length: 20 }, (_, i) => `C${i}`)
    expect(MAX_CODES).toBe(20)
    expect(addCode(twenty, 'NEW')).toEqual(twenty)
    expect(addCode(twenty.slice(0, 19), 'NEW')).toHaveLength(20)
  })

  it('AC-3607.1: [×]는 그 코드만 뺀다', () => {
    expect(without(['A', 'B', 'C'], 'B')).toEqual(['A', 'C'])
    expect(without(['A'], 'X')).toEqual(['A'])
  })

  it('AC-3607.2: 예약 메모 번호도 겹치지 않게 더한다', () => {
    expect(addKind(['14'], '20')).toEqual(['14', '20'])
    expect(addKind(['14', '20'], '14')).toEqual(['14', '20'])
  })

  it('AC-3607.2: 기타 이름은 앞뒤 공백을 떼고 20자까지다', () => {
    expect(MAX_ETC_NAME).toBe(20)
    expect(cleanEtcName('  크라이오 ')).toBe('크라이오')
    expect(cleanEtcName('가'.repeat(25))).toBe('가'.repeat(20))
    expect(cleanEtcName('   ')).toBe('')
  })
})

describe('AC-3607.7 가운데 빈칸 코드', () => {
  it("AC-3607.7: 코드 꼴은 앞뒤 공백을 떼고 가운데 이어진 빈칸을 하나로 줄인 1~20자다('PROLO C' 그대로)", () => {
    expect(cleanCode('PROLO C')).toBe('PROLO C')
    expect(cleanCode('  PROLO   C  ')).toBe('PROLO C')
    expect(cleanCode('HYALU MINI')).toBe('HYALU MINI')
    expect(cleanCode('A B C D E F G H I J')).toBe('A B C D E F G H I J')
    expect(cleanCode('CARM1')).toBe('CARM1')
    expect(cleanCode('도수')).toBe('도수')
    // 탭·다른 빈칸 글자·빈 글자·21자(줄인 뒤)는 받지 않는다
    for (const bad of ['PROLO\tC', 'PROLO　C', 'PROLO\nC', '', '   ', 'X'.repeat(21), 'A B C D E F G H I J K']) {
      expect(cleanCode(bad), JSON.stringify(bad)).toBeNull()
    }
    // 줄여서 20자가 되면 받는다
    expect(cleanCode('A  B' + 'C'.repeat(16))).toBe('A B' + 'C'.repeat(16))
  })

  it('AC-3607.7: 찾기에서 고른 가운데 빈칸 코드는 저장(normalize) 뒤에도 남고 toGroups로 그대로 간다', async () => {
    const { data } = fakeStorage()
    const s = defaults()
    s.picks.manual = ['도수', 'PROLO C']
    s.amounts.sono.codes = ['HYALU MINI', '  PROLO   C ']
    const saved = await save(s)
    expect(saved.picks.manual).toEqual(['도수', 'PROLO C'])
    expect(saved.amounts.sono.codes).toEqual(['HYALU MINI', 'PROLO C'])
    expect((data[SETTINGS_KEY] as Settings).picks.manual).toEqual(['도수', 'PROLO C'])
    const loaded = await load()
    expect(loaded?.picks.manual).toEqual(['도수', 'PROLO C'])
    const groups = toGroups(loaded as Settings)
    expect(groups.find((g) => g.key === 'manual')?.codes).toEqual(['도수', 'PROLO C'])
    expect(groups.find((g) => g.key === 'sono')?.amountCodes).toEqual(['HYALU MINI', 'PROLO C'])
  })

  it('AC-3607.7: 예약 메모 번호도 같은 꼴로 정리한다(앞뒤 공백 뗌)', () => {
    expect(normalize({ v: 1, picks: {}, etcNames: {}, reservations: { manual: [' 14 ', '14', '2  0'] } })?.reservations).toEqual({
      manual: ['14', '2 0'],
    })
  })
})

describe('AC-3707.2 씨암·SONO 매출 규칙 amounts — 셀 코드만 읽는다', () => {
  it('AC-3707.2: 저장값에 amounts가 없으면(이미 저장한 설정) 두 묶음 모두 처음 값(셀 코드 없음)으로 채운다', async () => {
    const old = { v: 1, picks: { carm: ['CARM1'] }, etcNames: { etc1: '크라이오' }, reservations: {} }
    fakeStorage({ [SETTINGS_KEY]: old })
    expect((await load())?.amounts).toEqual(FIRST_AMOUNTS())
    // 한 묶음만 빠졌거나 모양이 틀리면 그 묶음만 처음 값. 있는 묶음의 앞글자(KK)는 버린다
    expect(normalize({ ...old, amounts: { carm: { prefixes: ['KK'], codes: ['KK090'] } } })?.amounts).toEqual({
      carm: { prefixes: [], codes: ['KK090'] },
      sono: { prefixes: [], codes: [] },
    })
    expect(normalize({ ...old, amounts: 'x' })?.amounts).toEqual(FIRST_AMOUNTS())
  })

  it('AC-3707.2: 저장값의 앞글자(전 판 처음 값 LA 등)는 읽지 않고 버리며 셀 코드만 남는다', () => {
    const amounts = { carm: { prefixes: [], codes: [] }, sono: { prefixes: ['LA'], codes: ['KK090'] } }
    expect(normalize({ v: 1, picks: {}, etcNames: {}, reservations: {}, amounts })?.amounts).toEqual({
      carm: { prefixes: [], codes: [] },
      sono: { prefixes: [], codes: ['KK090'] },
    })
    // 전 판 처음 값 그대로 저장한 설정(LA · 없음)은 셀 코드 없음이 된다
    const before = { carm: { prefixes: ['LA'], codes: [] }, sono: { prefixes: ['LA'], codes: [] } }
    expect(normalize({ v: 1, picks: {}, etcNames: {}, reservations: {}, amounts: before })?.amounts).toEqual(FIRST_AMOUNTS())
  })

  it('AC-3707.2: 앞글자는 어떤 값이 와도 늘 빈 목록이고, 셀 코드는 코드 꼴로 겹침 없이 20개까지', () => {
    const many = Array.from({ length: 25 }, (_, i) => `K${i}`)
    const got = normalize({
      v: 1,
      picks: {},
      etcNames: {},
      reservations: {},
      amounts: {
        carm: { prefixes: [' la ', 'LA', 'kk', 'L A', '', 'X'.repeat(11), 7, 'a', 'b', 'c', 'd'], codes: ['KK090', 'KK090', 'PROLO  C', 'A\tB', 3] },
        sono: { prefixes: 'LA', codes: many },
      },
    })
    expect(got?.amounts.carm).toEqual({ prefixes: [], codes: ['KK090', 'PROLO C'] })
    expect(got?.amounts.sono).toEqual({ prefixes: [], codes: many.slice(0, 20) })
  })

  it("AC-3607.6: overlap은 'carm'·'sono'·'both'만 두고, 없거나 틀리면 칸이 없다", () => {
    const base = { v: 1, picks: {}, etcNames: {}, reservations: {} }
    for (const choice of ['carm', 'sono', 'both'] as const) expect(normalize({ ...base, overlap: choice })?.overlap).toBe(choice)
    for (const bad of ['x', 1, null, undefined]) expect(normalize({ ...base, overlap: bad })).not.toHaveProperty('overlap')
  })

  it('AC-3707.1: 앞글자 더하기(addPrefix·cleanPrefix·MAX_PREFIXES)는 없어졌다', () => {
    for (const name of ['addPrefix', 'cleanPrefix', 'MAX_PREFIXES']) expect(settingsModule, name).not.toHaveProperty(name)
  })

  it('AC-3707.2: toGroups는 씨암·SONO에 셀 코드가 있을 때만 amountPrefixes: []·amountCodes를 붙인다(다른 묶음에는 붙이지 않음)', () => {
    const s = defaults()
    s.amounts = { carm: { prefixes: [], codes: [] }, sono: { prefixes: [], codes: ['KK090'] } }
    s.picks.manual = ['도수']
    const groups = toGroups(s)
    expect(groups[0]).toEqual({ key: 'carm', codes: ['CARM1'] })
    expect(groups[1]).toEqual({ key: 'sono', codes: ['SONO1'], amountPrefixes: [], amountCodes: ['KK090'] })
    for (const g of groups.slice(2)) {
      expect(g, g.key).not.toHaveProperty('amountPrefixes')
      expect(g, g.key).not.toHaveProperty('amountCodes')
    }
    // 고른 코드가 없는 묶음은 규칙이 있어도 보내지 않는다
    delete s.picks.sono
    expect(toGroups(s).map((g) => g.key)).not.toContain('sono')
    // 돌려준 목록은 복사본
    s.picks.sono = ['SONO1']
    toGroups(s)[1].amountCodes?.push('X')
    expect(s.amounts.sono.codes).toEqual(['KK090'])
  })

  it('AC-3707.2: 화면 값에 앞글자가 남아 있어도 toGroups가 도우미에 보내는 앞글자는 늘 빈 목록이고, 앞글자만 있던 규칙은 칸을 붙이지 않는다', () => {
    const s = defaults()
    s.amounts = { carm: { prefixes: ['LA'], codes: [] }, sono: { prefixes: ['LA', 'KK'], codes: ['LA358'] } }
    expect(toGroups(s).slice(0, 2)).toEqual([
      { key: 'carm', codes: ['CARM1'] },
      { key: 'sono', codes: ['SONO1'], amountPrefixes: [], amountCodes: ['LA358'] },
    ])
  })

  it('AC-3707.2: amounts가 빠진 설정을 받아도 toGroups는 처음 값(셀 코드 없음)으로 보아 규칙 칸을 붙이지 않는다(normalize와 같음)', () => {
    const raw = { v: 1, picks: { carm: ['CARM1'] }, etcNames: { etc1: '', etc2: '', etc3: '', etc4: '' }, reservations: {} } as unknown as Settings
    expect(toGroups(raw)).toEqual([{ key: 'carm', codes: ['CARM1'] }])
  })

  it('AC-3607.6: [저장](save)은 저장된 overlap을 지우지 않고 그대로 둔다(화면이 가진 값이 아니라 저장된 값)', async () => {
    const stored = { ...defaults(), overlap: 'sono' }
    const { data } = fakeStorage({ [SETTINGS_KEY]: stored })
    const screen = defaults()
    screen.picks.manual = ['도수', 'MA4']
    const saved = await save(screen)
    expect((data[SETTINGS_KEY] as Settings).overlap).toBe('sono')
    expect(saved.overlap).toBe('sono')
    expect((data[SETTINGS_KEY] as Settings).picks.manual).toEqual(['도수', 'MA4'])
    // 화면이 예전 값(carm)을 들고 있어도 저장된 값(both)이 이긴다
    data[SETTINGS_KEY] = { ...stored, overlap: 'both' }
    await save({ ...screen, overlap: 'carm' })
    expect((data[SETTINGS_KEY] as Settings).overlap).toBe('both')
  })

  it('AC-3607.6: 처음 저장이면 overlap 칸이 없다', async () => {
    const { data } = fakeStorage()
    await save({ ...defaults(), overlap: 'carm' })
    expect(data[SETTINGS_KEY]).not.toHaveProperty('overlap')
  })
})

describe('AC-3609.7 saveOverlap: ERP 화면이 고른 겹친 진료 선택만 바꿔 쓴다', () => {
  it('AC-3609.7: 저장된 설정의 overlap 칸만 바꾸고 나머지는 그대로다', async () => {
    const stored = { ...defaults(), etcNames: { etc1: '크라이오', etc2: '핫팩', etc3: '', etc4: '' }, reservations: { eswt: ['1'] } }
    const { data, local } = fakeStorage({ [SETTINGS_KEY]: stored })
    await saveOverlap('sono')
    expect(local.set).toHaveBeenCalledTimes(1)
    expect(data[SETTINGS_KEY]).toEqual({ ...stored, overlap: 'sono' })
    await saveOverlap('both')
    expect((data[SETTINGS_KEY] as Settings).overlap).toBe('both')
  })

  it('AC-3609.7: 설정을 저장한 적이 없으면 아무것도 쓰지 않는다', async () => {
    const { local } = fakeStorage()
    await saveOverlap('carm')
    expect(local.set).not.toHaveBeenCalled()
  })
})

/** 이미 저장한 설정(처음 값 판 1 때): 물리치료 3개·크라이오 CRYO 하나, defaultsSeen 칸 없음 */
const OLD_SAVED = {
  v: 1,
  picks: {
    carm: ['CARM1'],
    sono: ['SONO1'],
    arthro: ['HA280'],
    manual: ['도수', 'MA4'],
    eswt: ['ESWT7', 'ESWT10', 'ESWT12', 'ESWT17'],
    pt: ['MM010', 'MM015', 'MM011'],
    etc1: ['CRYO'],
    ptVisit: ['AA222'],
  },
  etcNames: { etc1: '크라이오', etc2: '', etc3: '', etc4: '' },
  reservations: { manual: ['14'] },
}

describe('AC-3615.6 처음 값 판 defaultsSeen·새 처음 코드', () => {
  it('AC-3615.6: DEFAULTS_VERSION은 2이고 defaults()·DEFAULTS의 defaultsSeen도 2다', () => {
    expect(DEFAULTS_VERSION).toBe(2)
    expect(defaults().defaultsSeen).toBe(2)
    expect(DEFAULTS.defaultsSeen).toBe(2)
  })

  it('AC-3615.6: normalize는 defaultsSeen을 1 이상 정수로 둔다(없거나 틀리면 1)', () => {
    const base = { v: 1, picks: {}, etcNames: {}, reservations: {} }
    expect(normalize(base)?.defaultsSeen).toBe(1)
    const cases: [unknown, number][] = [[1, 1], [2, 2], [3, 3], [0, 1], [-2, 1], [1.5, 1], ['2', 1], [Number.NaN, 1], [null, 1], [Infinity, 1]]
    for (const [raw, want] of cases) {
      expect(normalize({ ...base, defaultsSeen: raw })?.defaultsSeen, String(raw)).toBe(want)
    }
  })

  it('AC-3615.6: save()는 defaultsSeen을 DEFAULTS_VERSION(2)으로 쓴다(새 처음 코드를 더하지 않고 저장해도)', async () => {
    const { data } = fakeStorage({ [SETTINGS_KEY]: OLD_SAVED })
    const screen = normalize(OLD_SAVED) as Settings
    expect(screen.defaultsSeen).toBe(1)
    const saved = await save(screen)
    expect(saved.defaultsSeen).toBe(2)
    expect((data[SETTINGS_KEY] as Settings).defaultsSeen).toBe(2)
    expect((data[SETTINGS_KEY] as Settings).picks.pt).toEqual(['MM010', 'MM015', 'MM011'])
  })

  it('AC-3615.6: newDefaultCodes는 defaultsSeen < 2일 때 처음 값 코드 가운데 저장값 그 항목에 없는 코드를 GROUP_KEYS 차례로 준다', () => {
    const saved = normalize(OLD_SAVED) as Settings
    expect(newDefaultCodes(saved)).toEqual([
      { key: 'pt', codes: ['MM085', 'MM080', 'MM020'] },
      { key: 'etc1', codes: ['CRYO3'] },
    ])
  })

  it('AC-3615.6: defaultsSeen이 2면(이미 [저장]함) 없고, 처음 값 코드가 다 있으면 없다', () => {
    expect(newDefaultCodes(normalize({ ...OLD_SAVED, defaultsSeen: 2 }) as Settings)).toEqual([])
    expect(newDefaultCodes(normalize({ ...defaults(), defaultsSeen: 1 }) as Settings)).toEqual([])
  })
})

describe('AC-3615.5 [처음 값으로] resetCodes', () => {
  it('AC-3615.5: picks·amounts만 처음 값이고 etcNames·reservations·overlap·defaultsSeen은 그대로다', () => {
    const before: Settings = {
      v: 1,
      picks: { manual: ['MA4'], surgery: ['OP1'] },
      etcNames: { etc1: '핫팩', etc2: '견인', etc3: '', etc4: '' },
      reservations: { manual: ['14', '20'], eswt: ['1'] },
      amounts: { carm: { prefixes: ['KK'], codes: ['LA358'] }, sono: { prefixes: [], codes: [] } },
      overlap: 'sono',
      defaultsSeen: 1,
    }
    const copy = JSON.parse(JSON.stringify(before))
    const got = resetCodes(before)
    expect(got).toEqual({
      v: 1,
      picks: defaults().picks,
      etcNames: { etc1: '핫팩', etc2: '견인', etc3: '', etc4: '' },
      reservations: { manual: ['14', '20'], eswt: ['1'] },
      amounts: defaults().amounts,
      overlap: 'sono',
      defaultsSeen: 1,
    })
    // 받은 설정은 바꾸지 않고, 돌려준 값을 고쳐도 처음 값·받은 값이 바뀌지 않는다
    expect(before).toEqual(copy)
    got.picks.carm?.push('X1')
    got.amounts.carm.prefixes.push('ZZ')
    got.reservations.manual?.push('99')
    got.etcNames.etc1 = '바꿈'
    expect(DEFAULTS).toEqual(FIRST)
    expect(before).toEqual(copy)
  })
})

describe('AC-3615.4 처방 없는 코드 unusedCodes (기본값 (타))', () => {
  const LIST: ClosingCodes['codes'] = [
    { code: 'CARM1', name: '씨암 영상 유도', visits: 6410 },
    { code: 'SONO1', name: '비급여초음파', visits: 6820 },
    { code: 'HA280', name: '관절조영', visits: 84 },
    { code: '도수', name: '도수치료', visits: 326 },
    { code: 'ESWT7', name: null, visits: 2180 },
    { code: 'ESWT10', name: null, visits: 176 },
    { code: 'ESWT12', name: null, visits: 214 },
    { code: 'ESWT17', name: null, visits: 25 },
    { code: 'MM010', name: null, visits: 5960 },
    { code: 'MM015', name: null, visits: 5720 },
    { code: 'MM011', name: null, visits: 4310 },
    { code: 'CRYO', name: null, visits: 940 },
    { code: 'LA358', name: null, visits: 2 },
  ]

  it('AC-3615.4: 처음 저장이면(저장값 없음) 고른 코드 가운데 목록에 없는 것 모두를 GROUP_KEYS 차례로 센다', () => {
    expect(unusedCodes(defaults(), null, LIST)).toEqual([
      { key: 'pt', code: 'MM085' },
      { key: 'pt', code: 'MM080' },
      { key: 'pt', code: 'MM020' },
      { key: 'etc1', code: 'CRYO3' },
      { key: 'ptVisit', code: 'AA222' },
    ])
  })

  it('AC-3615.4: 저장값 그 항목에 이미 있던 코드는 목록에 없어도 세지 않는다(AA222 그대로 둠)', () => {
    const saved = normalize(OLD_SAVED) as Settings
    const screen = normalize(OLD_SAVED) as Settings
    expect(unusedCodes(screen, saved, LIST)).toEqual([])
    // 새로 고른 코드만 센다(다른 항목에 있던 코드도 이 항목에는 새 코드)
    screen.picks.pt = [...(screen.picks.pt ?? []), 'MM085']
    screen.picks.surgery = ['AA222', 'CARM1']
    expect(unusedCodes(screen, saved, LIST)).toEqual([
      { key: 'pt', code: 'MM085' },
      { key: 'surgery', code: 'AA222' },
    ])
  })

  it('AC-3615.4: 씨암·SONO 매출 규칙의 더 셀 코드도 새로 고른 것을 센다(앞글자는 코드가 아니라 세지 않음)', () => {
    const saved = normalize({
      ...OLD_SAVED,
      amounts: { carm: { prefixes: ['LA'], codes: ['OLD9'] }, sono: { prefixes: ['LA'], codes: [] } },
    }) as Settings
    const screen = JSON.parse(JSON.stringify(saved)) as Settings
    screen.amounts.carm = { prefixes: ['LA', 'ZZ'], codes: ['OLD9', 'LA358', 'NEW1'] }
    screen.amounts.sono = { prefixes: ['LA'], codes: ['NEW2'] }
    expect(unusedCodes(screen, saved, LIST)).toEqual([
      { key: 'carm', code: 'NEW1' },
      { key: 'sono', code: 'NEW2' },
    ])
  })

  it('AC-3615.4: 코드는 대문자로 견준다(목록 CRYO = 고른 cryo)', () => {
    const screen = normalize({ v: 1, picks: { etc2: ['cryo', 'Mm010'] }, etcNames: {}, reservations: {} }) as Settings
    expect(unusedCodes(screen, null, LIST)).toEqual([])
  })
})

describe('AC-3615.7 겹침 conflicts', () => {
  const withNames = (names: Partial<Settings['etcNames']>, reservations: Settings['reservations'] = {}): Settings => ({
    ...defaults(),
    etcNames: { etc1: '', etc2: '', etc3: '', etc4: '', ...names },
    reservations,
  })

  it('AC-3615.7: 고정 줄 이름은 cells.ts ETC_CLASH_ROWS(업무일지 2 치료별 건수·치료별 매출 줄 이름)다', () => {
    expect([...ETC_CLASH_ROWS]).toEqual(['씨암(주사)', 'SONO(주사)', '관절조영', '도수', '충격파', '씨암', 'SONO', '물리치료'])
  })

  it("AC-3615.7: 기타 이름이 고정 줄 이름과 같으면(앞뒤 빈칸 떼고·빈칸 하나로·영문 대소문자 무시) 막는다. '도수2'는 된다", () => {
    expect(conflicts(withNames({ etc2: '도수' }))).toEqual([{ kind: 'fixedName', etc: 'etc2', name: '도수' }])
    expect(conflicts(withNames({ etc1: 'sono' }))).toEqual([{ kind: 'fixedName', etc: 'etc1', name: 'sono' }])
    expect(conflicts(withNames({ etc3: ' 도수 ' }))).toEqual([{ kind: 'fixedName', etc: 'etc3', name: '도수' }])
    expect(conflicts(withNames({ etc4: 'Sono(주사)' }))).toEqual([{ kind: 'fixedName', etc: 'etc4', name: 'Sono(주사)' }])
    expect(conflicts(withNames({ etc2: '도수2', etc3: '크라이오 2', etc4: '물리 치료' }))).toEqual([])
    expect(conflicts(defaults())).toEqual([])
  })

  it('AC-3615.7: 두 기타 줄 이름이 같으면 막는다(빈 이름끼리는 겹침이 아님)', () => {
    expect(conflicts(withNames({ etc1: '크라이오', etc3: '크라이오' }))).toEqual([
      { kind: 'sameName', etcs: ['etc1', 'etc3'], name: '크라이오' },
    ])
    expect(conflicts(withNames({ etc1: 'Hot Pack', etc2: 'hot   pack', etc4: ' HOT PACK ' }))).toEqual([
      { kind: 'sameName', etcs: ['etc1', 'etc2', 'etc4'], name: 'Hot Pack' },
    ])
    expect(conflicts(withNames({}))).toEqual([])
  })

  it('AC-3615.7: 같은 예약 메모 번호가 두 줄 이상에 있으면 막는다(줄은 RSV_ROWS 차례)', () => {
    expect(conflicts(withNames({ etc1: '크라이오' }, { manual: ['14', '20'], eswt: ['1', '14'], etc: ['14'] }))).toEqual([
      { kind: 'sameMemo', memo: '14', rows: ['manual', 'eswt', 'etc'] },
    ])
    expect(conflicts(withNames({ etc1: '크라이오' }, { manual: ['14', '20'], eswt: ['1'] }))).toEqual([])
  })

  it('AC-3615.7: 겹친 것은 모두 준다(고정 줄 이름 → 같은 기타 이름 → 예약 메모 차례)', () => {
    const got = conflicts(
      withNames({ etc1: '충격파', etc2: '핫팩', etc3: '핫팩' }, { injection: ['2'], followup: ['3'], clinic: ['2'], etc: ['3'] }),
    )
    expect(got).toEqual([
      { kind: 'fixedName', etc: 'etc1', name: '충격파' },
      { kind: 'sameName', etcs: ['etc2', 'etc3'], name: '핫팩' },
      { kind: 'sameMemo', memo: '2', rows: ['injection', 'clinic'] },
      { kind: 'sameMemo', memo: '3', rows: ['followup', 'etc'] },
    ])
  })
})

// --- REQ-3709 읽지 않을 처방 규칙(design.md 11절, TASK-11). 코드는 시안 예시(환자 정보 없음) ---

/** 규칙 시험 바탕: 씨암 셀 코드 LA358·LA357(시안 예), 도수상담 '.', ESWT Standard ESWT7, 주사1회환자 A15 */
const RULE_BASE = () => {
  const s = defaults()
  s.amounts.carm.codes = ['LA358', 'LA357']
  s.picks.manualConsult = ['.']
  s.picks.eswtStd = ['ESWT7']
  s.picks.injection = ['A15']
  return s
}
const rule = (code: string, withs: string[], all = false): ExcludeRule => ({ code, with: withs, all })

describe('AC-3709.1 읽지 않을 처방을 두는 줄', () => {
  it('AC-3709.1: 건수를 세는 17줄(세 절 모두)이고 주사1회환자(injection)·물리치료내원(ptVisit)은 없다', () => {
    expect([...EXCLUDE_KEYS]).toEqual([
      'carm',
      'sono',
      'arthro',
      'manual',
      'eswt',
      'pt',
      'etc1',
      'etc2',
      'etc3',
      'etc4',
      'manualConsult',
      'lipus',
      'nail',
      'ct',
      'surgery',
      'eswtStd',
      'eswtRadial',
    ])
    expect(EXCLUDE_KEYS).not.toContain('injection')
    expect(EXCLUDE_KEYS).not.toContain('ptVisit')
  })

  it("AC-3709.1: '이 처방' 고를 코드는 그 줄 코드, 씨암·SONO는 이어서 셀 코드(겹친 것은 한 번)다", () => {
    const s = RULE_BASE()
    s.amounts.carm.codes = ['LA358', 'CARM1', 'LA357']
    expect(ruleCodes(s, 'carm')).toEqual(['CARM1', 'LA358', 'LA357'])
    expect(ruleCodes(s, 'sono')).toEqual(['SONO1'])
    expect(ruleCodes(s, 'arthro')).toEqual(['HA280'])
    expect(ruleCodes(s, 'lipus')).toEqual([])
  })
})

describe('AC-3709.4 저장값 excludes 다듬기(normalize · cleanExcludes)', () => {
  const base = { v: 1, picks: { carm: ['CARM1'], arthro: ['HA280'], injection: ['A15'], ptVisit: ['AA222'] }, etcNames: {}, reservations: {} }
  const withAmounts = { ...base, amounts: { carm: { prefixes: [], codes: ['LA358', 'LA357'] }, sono: { prefixes: [], codes: [] } } }

  it('AC-3709.4: 규칙이 없으면 excludes 칸이 없다(지금 저장 모양 그대로)', () => {
    expect(normalize(base)).not.toHaveProperty('excludes')
    expect(normalize({ ...base, excludes: {} })).not.toHaveProperty('excludes')
    expect(normalize({ ...base, excludes: 'x' })).not.toHaveProperty('excludes')
    expect(normalize({ ...base, excludes: { carm: [] } })).not.toHaveProperty('excludes')
    expect(defaults()).not.toHaveProperty('excludes')
  })

  it('AC-3709.4: 모르는 key·injection·ptVisit 규칙은 버리고, 규칙이 있는 줄만 둔다', () => {
    const got = normalize({
      ...withAmounts,
      excludes: {
        nope: [rule('CARM1', ['LA248'])],
        injection: [rule('A15', ['LA248'])],
        ptVisit: [rule('AA222', ['LA248'])],
        carm: [rule('LA357', ['LA248'])],
        arthro: 'x',
      },
    })
    expect(got?.excludes).toEqual({ carm: [{ code: 'LA357', with: ['LA248'], all: false }] })
  })

  it('AC-3709.4: code는 그 줄 고른 코드나(씨암·SONO) 셀 코드에 있어야 하고, 아니면 그 규칙을 버린다', () => {
    const got = normalize({
      ...withAmounts,
      excludes: {
        carm: [rule('CARM1', ['LA274']), rule('LA358', ['SONO1']), rule('ZZ9', ['LA248']), { code: 3, with: ['LA248'] }, 'LA357', null],
        // 관절조영 줄에는 셀 코드가 없다: 씨암 셀 코드(LA357)는 관절조영 '이 처방'이 아니다
        arthro: [rule('LA357', ['LA248']), rule('HA280', ['LA248'])],
      },
    })
    expect(got?.excludes).toEqual({
      carm: [rule('CARM1', ['LA274']), rule('LA358', ['SONO1'])],
      arthro: [rule('HA280', ['LA248'])],
    })
  })

  it('AC-3709.4: with는 코드 꼴만·겹침 버림·code와 같은 것 버림·5개까지이고, 비면 규칙을 버린다', () => {
    const got = normalize({
      ...withAmounts,
      excludes: {
        carm: [
          { code: 'LA357', with: ['LA248', ' LA248 ', 'A\tB', 3, '', 'LA357', 'L1', 'L2', 'PROLO  C', 'L4', 'L5'], all: false },
          { code: 'LA358', with: ['LA358', 'A\tB', 7] },
          { code: 'CARM1', with: 'LA248' },
          { code: 'CARM1' },
        ],
      },
    })
    expect(MAX_WITH).toBe(5)
    expect(got?.excludes).toEqual({ carm: [rule('LA357', ['LA248', 'L1', 'L2', 'PROLO C', 'L4'])] })
  })

  it('AC-3709.4: code·with(차례 상관없이)·all이 모두 같은 규칙은 앞 것만, 같은 code에 조건이 다른 규칙은 여럿 둔다', () => {
    const got = normalize({
      ...withAmounts,
      excludes: {
        carm: [
          rule('LA357', ['LA248', 'LA249']),
          rule('LA357', ['LA249', 'LA248']),
          rule('LA357', ['LA248', 'LA249'], true),
          rule('LA357', ['LA248']),
          rule('LA357', ['LA248', 'LA249'], true),
        ],
      },
    })
    expect(got?.excludes?.carm).toEqual([rule('LA357', ['LA248', 'LA249']), rule('LA357', ['LA248', 'LA249'], true), rule('LA357', ['LA248'])])
  })

  it('AC-3709.4: 규칙은 줄마다 20개까지다', () => {
    const many = Array.from({ length: 25 }, (_, i) => rule('CARM1', [`W${i}`]))
    const got = normalize({ ...withAmounts, excludes: { carm: many } })
    expect(MAX_RULES).toBe(20)
    expect(got?.excludes?.carm).toEqual(many.slice(0, 20))
  })

  it('AC-3709.4: 저장값의 all이 참/거짓이 아니면(없음·글자·숫자·null) false다', () => {
    for (const bad of [undefined, 'true', 1, null, {}]) {
      const got = normalize({ ...withAmounts, excludes: { carm: [{ code: 'CARM1', with: ['LA274', 'LA275'], all: bad }] } })
      expect(got?.excludes?.carm, String(bad)).toEqual([rule('CARM1', ['LA274', 'LA275'], false)])
    }
    const yes = normalize({ ...withAmounts, excludes: { carm: [{ code: 'CARM1', with: ['LA274', 'LA275'], all: true }] } })
    expect(yes?.excludes?.carm).toEqual([rule('CARM1', ['LA274', 'LA275'], true)])
  })

  it('AC-3709.4: 줄에서 코드를 빼면(셀 코드 포함) 그 코드가 이 처방인 규칙이 다듬기에서 빠진다', () => {
    const s = RULE_BASE()
    s.excludes = { carm: [rule('LA357', ['LA248']), rule('CARM1', ['LA274'])], manualConsult: [rule('.', ['MA4'])] }
    s.amounts.carm.codes = ['LA358']
    expect(cleanExcludes(s.excludes, s.picks, s.amounts)).toEqual({ carm: [rule('CARM1', ['LA274'])], manualConsult: [rule('.', ['MA4'])] })
    s.picks.carm = []
    delete s.picks.manualConsult
    expect(cleanExcludes(s.excludes, s.picks, s.amounts)).toEqual({})
  })

  it('AC-3709.4: [저장](save)하면 규칙이 저장값에 남고 load()가 같은 규칙을 돌려준다', async () => {
    const { data } = fakeStorage()
    const s = RULE_BASE()
    s.excludes = { carm: [rule('LA357', ['LA248', 'LA249']), rule('CARM1', ['LA274', 'LA275'], true)], eswtStd: [rule('ESWT7', ['ESWT10'])] }
    const saved = await save(s)
    expect(saved.excludes).toEqual(s.excludes)
    expect((data[SETTINGS_KEY] as Settings).excludes).toEqual(s.excludes)
    expect((await load())?.excludes).toEqual(s.excludes)
  })

  it('AC-3709.4: [처음 값으로](resetCodes)는 규칙도 비운다(받은 설정은 그대로)', () => {
    const s = RULE_BASE()
    s.excludes = { carm: [rule('LA357', ['LA248'])], arthro: [rule('HA280', ['LA248'])] }
    const got = resetCodes(s)
    expect(got.excludes ?? {}).toEqual({})
    expect(s.excludes.carm).toEqual([rule('LA357', ['LA248'])])
  })
})

describe('AC-3709.4 [규칙 더하기] 까닭 ruleProblem', () => {
  it("AC-3709.4: '이 처방'을 안 골랐으면 noCode, 같이 있을 처방이 없으면 noWith", () => {
    expect(ruleProblem([], { code: '', with: ['LA248'], all: false })).toBe('noCode')
    expect(ruleProblem([], { code: '', with: [], all: false })).toBe('noCode')
    expect(ruleProblem([], { code: 'LA357', with: [], all: false })).toBe('noWith')
    expect(ruleProblem([], rule('LA357', ['LA248']))).toBeNull()
  })

  it('AC-3709.4: 이 처방·같이 있을 처방(차례 상관없이)·빼는 때가 모두 같은 규칙이 있으면 same, 조건이 다르면 된다', () => {
    const rules = [rule('LA357', ['LA248', 'LA249'])]
    expect(ruleProblem(rules, rule('LA357', ['LA249', 'LA248']))).toBe('same')
    expect(ruleProblem(rules, rule('LA357', ['LA248', 'LA249'], true))).toBeNull()
    expect(ruleProblem(rules, rule('LA357', ['LA248']))).toBeNull()
    expect(ruleProblem(rules, rule('CARM1', ['LA248', 'LA249']))).toBeNull()
  })

  it('AC-3709.4: 규칙이 20개면 full', () => {
    const twenty = Array.from({ length: 20 }, (_, i) => rule('CARM1', [`W${i}`]))
    expect(ruleProblem(twenty, rule('LA357', ['LA248']))).toBe('full')
    expect(ruleProblem(twenty.slice(0, 19), rule('LA357', ['LA248']))).toBeNull()
  })
})

describe('AC-3709.3 toGroups는 규칙이 있는 묶음에만 exclude를 붙인다', () => {
  it('AC-3709.3: 규칙이 없으면 지금 모양 그대로(exclude 칸 없음)', () => {
    for (const g of toGroups(RULE_BASE())) expect(g, g.key).not.toHaveProperty('exclude')
  })

  it('AC-3709.3: 규칙이 있는 묶음(치료별·진료 · 치료현황·ESWT 포함)에만 exclude: [{ code, with, all }]이고 all은 모두 있을 때만이면 true', () => {
    const s = RULE_BASE()
    s.excludes = {
      carm: [rule('LA357', ['LA248', 'LA249']), rule('CARM1', ['LA274', 'LA275'], true)],
      manualConsult: [rule('.', ['MA4'])],
      eswtStd: [rule('ESWT7', ['ESWT10'], true)],
    }
    const groups = toGroups(s)
    const byKey = (key: string) => groups.find((g) => g.key === key)
    expect(byKey('carm')).toEqual({
      key: 'carm',
      codes: ['CARM1'],
      amountPrefixes: [],
      amountCodes: ['LA358', 'LA357'],
      exclude: [
        { code: 'LA357', with: ['LA248', 'LA249'], all: false },
        { code: 'CARM1', with: ['LA274', 'LA275'], all: true },
      ],
    })
    expect(byKey('manualConsult')).toEqual({ key: 'manualConsult', codes: ['.'], exclude: [{ code: '.', with: ['MA4'], all: false }] })
    expect(byKey('eswtStd')).toEqual({ key: 'eswtStd', codes: ['ESWT7'], exclude: [{ code: 'ESWT7', with: ['ESWT10'], all: true }] })
    for (const g of groups.filter((x) => !['carm', 'manualConsult', 'eswtStd'].includes(x.key))) expect(g, g.key).not.toHaveProperty('exclude')
  })

  it('AC-3709.3: 주사1회환자·물리치료내원 묶음과 그 줄에 없는 code 규칙은 보내지 않는다(normalize와 같음)', () => {
    const s = RULE_BASE()
    s.excludes = { injection: [rule('A15', ['LA248'])], ptVisit: [rule('AA222', ['LA248'])], arthro: [rule('ZZ9', ['LA248'])] }
    const groups = toGroups(s)
    for (const key of ['injection', 'ptVisit', 'arthro']) expect(groups.find((g) => g.key === key), key).not.toHaveProperty('exclude')
  })

  it('AC-3709.3: 돌려준 규칙은 복사본이라 설정을 바꾸지 않는다', () => {
    const s = RULE_BASE()
    s.excludes = { carm: [rule('LA357', ['LA248'])] }
    toGroups(s)[0].exclude?.[0].with.push('X')
    expect(s.excludes.carm?.[0].with).toEqual(['LA248'])
  })

  it('AC-3709.3: 옛 도우미가 exclude 칸 때문에 거절하면(E-HELPER-BAD-MESSAGE) errors.ts 옛 도우미 글이다', () => {
    const said = explain('E-HELPER-BAD-MESSAGE')
    expect(said).toEqual({ code: 'E-HELPER-BAD-MESSAGE', ...ERRORS['E-HELPER-UNKNOWN-COMMAND'] })
    expect(said.what).toBe('ERP 도우미가 예전 판이에요.')
  })
})
