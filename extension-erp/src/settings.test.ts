// 설정(TASK-5 REQ-3607): 처음 값·저장 모양·도우미에 보낼 묶음·코드 찾기·고르기 규칙. chrome.storage는 가짜다
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULTS,
  MAX_CODES,
  MAX_ETC_NAME,
  MAX_RESULTS,
  addCode,
  addKind,
  cleanEtcName,
  defaults,
  load,
  save,
  search,
  toGroups,
  without,
} from './settings'
import { GROUP_KEYS, SETTINGS_KEY } from './types'
import type { ClosingCodes, Settings } from './types'

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
}

describe('AC-3607.3 처음 값', () => {
  it('AC-3607.3: 처음 값은 이미 정한 것 7 그대로이고 예약 6줄은 비어 있다', () => {
    expect(DEFAULTS).toEqual(FIRST)
    expect(defaults()).toEqual(FIRST)
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

  it('AC-3607.3: 불러온 값의 모르는 칸·틀린 코드·겹친 코드·20개 넘는 코드는 떼어 낸다', async () => {
    const many = Array.from({ length: 25 }, (_, i) => `C${i}`)
    fakeStorage({
      [SETTINGS_KEY]: {
        v: 1,
        picks: { carm: ['CARM1', 'CARM1', 'A B', '', 3, 'X'.repeat(21)], sono: many, nope: ['X'] },
        etcNames: { etc1: 7, etc2: ' 크라이오 ' },
        reservations: { manual: ['14', '14', 5], wrong: ['1'] },
        extra: true,
      },
    })
    expect(await load()).toEqual({
      v: 1,
      picks: { carm: ['CARM1'], sono: many.slice(0, 20) },
      etcNames: { etc1: '', etc2: '크라이오', etc3: '', etc4: '' },
      reservations: { manual: ['14'] },
    })
  })
})

describe('AC-3607.5 도우미에 보낼 묶음 toGroups', () => {
  it('AC-3607.5: 처음 값이면 코드가 있는 8묶음을 design.md 2절 차례로 담는다', () => {
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
