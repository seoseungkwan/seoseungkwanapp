// TASK-5 (spec erp-uisarang) design.md 8-3·9-2: 의사랑 설정 모양·저장·불러오기·코드 목록·도우미에 보낼 args·코드 찾기·저장 여부.
// chrome.storage는 가짜다(지금 main·options 시험의 가짜처럼 get은 열쇠 하나씩 받는다). 코드·숫자는 지은 값(환자 정보 없음)
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MAX_CODES, MAX_ETC_NAME, MAX_RESULTS } from './settings'
import { SETTINGS_KEY } from './types'
import {
  MAX_UIS_CODES,
  loadUis,
  loadUisCodes,
  normalizeCodes,
  normalizeUis,
  saveUis,
  saveUisCodes,
  savedSources,
  searchUis,
  toUisArgs,
  uisEmpty,
} from './uisSettings'
import { UIS_CODES_KEY, UIS_COUNT_KEYS, UIS_SALES_KEYS, UIS_SETTINGS_KEY } from './uisTypes'
import type { UisCodeRow, UisCodes, UisSettings } from './uisTypes'

/** chrome.storage.local 흉내(열쇠 하나씩 get). 넣은 값은 복사해 둔다(크롬처럼 JSON으로 오간다) */
function fakeStorage(initial: Record<string, unknown> = {}, opts: { failSet?: boolean } = {}) {
  const data: Record<string, unknown> = JSON.parse(JSON.stringify(initial))
  const local = {
    get: vi.fn(async (key: string) => (key in data ? { [key]: JSON.parse(JSON.stringify(data[key])) } : {})),
    set: vi.fn(async (items: Record<string, unknown>) => {
      if (opts.failSet) throw new Error('QUOTA_BYTES quota exceeded')
      Object.assign(data, JSON.parse(JSON.stringify(items)))
    }),
  }
  vi.stubGlobal('chrome', { storage: { local } })
  return { data, local }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

/** 시안 ⑱처럼 고른 설정(지은 코드) */
function picked(): UisSettings {
  return {
    v: 1,
    counts: { carm: ['CARM1'], sono: ['SONO1', 'SONO2'], manual: ['MT1'], eswtStd: ['ES1'], ptVisit: ['AA222'] },
    sales: { carm: ['CARM1', 'LA358'], manual: ['MT1'], pt: ['MM010', 'MM015'], etc1: ['CRYO'] },
    etcNames: { etc1: '크라이오', etc2: '', etc3: '', etc4: '' },
  }
}

const BIT_SETTINGS = { v: 1, picks: { carm: ['CARM1'] }, etcNames: { etc1: '', etc2: '', etc3: '', etc4: '' }, reservations: {} }

describe('AC-4214.4 uisEmpty: 처음 값(design.md 9-2)', () => {
  it('AC-4214.4: 모든 묶음이 빈 목록이고 기타 이름은 빈 글자다(의원마다 코드가 달라 처음 값이 없다)', () => {
    expect(uisEmpty()).toEqual({ v: 1, counts: {}, sales: {}, etcNames: { etc1: '', etc2: '', etc3: '', etc4: '' } })
  })

  it('AC-4214.4: 부를 때마다 새 값이다(하나를 고쳐도 다음 처음 값은 그대로)', () => {
    const one = uisEmpty()
    one.counts.carm = ['X']
    one.etcNames.etc1 = '바뀜'
    expect(uisEmpty()).toEqual({ v: 1, counts: {}, sales: {}, etcNames: { etc1: '', etc2: '', etc3: '', etc4: '' } })
  })

  it('AC-4214.4: 처음 값은 normalizeUis를 거쳐도 같다', () => {
    expect(normalizeUis(uisEmpty())).toEqual(uisEmpty())
  })
})

describe('AC-4214.4 normalizeUis: 저장 모양으로 맞추기(design.md 8-3·9-2)', () => {
  it.each([
    ['null', null],
    ['글자', 'erpClosingUis'],
    ['배열', [1]],
    ['판 없음', { counts: {}, sales: {} }],
    ['판 2', { v: 2, counts: {}, sales: {}, etcNames: {} }],
    ['판이 글자', { v: '1', counts: {}, sales: {}, etcNames: {} }],
  ])('AC-4214.4: 모양이 틀리면(%s) null이다', (_name, raw) => {
    expect(normalizeUis(raw)).toBeNull()
  })

  it('AC-4214.4: 고른 설정은 그대로다', () => {
    expect(normalizeUis(picked())).toEqual(picked())
  })

  it('AC-4214.4: 코드는 settings.ts cleanCode 꼴(앞뒤 빈칸 뗌·가운데 빈칸 하나로), 틀린 꼴·글자가 아닌 것은 뺀다', () => {
    const got = normalizeUis({
      v: 1,
      counts: { carm: ['  CARM1  ', 'PROLO   C', 'TAB\tX', '', '   ', 7, null, 'A'.repeat(21), 'B'.repeat(20)] },
      sales: {},
      etcNames: {},
    })
    expect(got?.counts.carm).toEqual(['CARM1', 'PROLO C', 'B'.repeat(20)])
  })

  it('AC-4214.4: 겹친 코드는 앞 것만 둔다(대소문자만 다른 것도 같은 코드 — 도우미는 대문자로 견준다)', () => {
    const got = normalizeUis({ v: 1, counts: { sono: ['SONO1', 'sono1', ' SONO1', 'SONO2', 'Sono2'] }, sales: { pt: ['mm010', 'MM010'] }, etcNames: {} })
    expect(got?.counts.sono).toEqual(['SONO1', 'SONO2'])
    expect(got?.sales.pt).toEqual(['mm010'])
  })

  it(`AC-4214.4: 묶음마다 ${MAX_CODES}개까지(넘으면 앞 ${MAX_CODES}개)`, () => {
    const many = Array.from({ length: 25 }, (_, i) => `C${i + 1}`)
    const got = normalizeUis({ v: 1, counts: { manual: many }, sales: { manual: many }, etcNames: {} })
    expect(got?.counts.manual).toEqual(many.slice(0, MAX_CODES))
    expect(got?.sales.manual).toEqual(many.slice(0, MAX_CODES))
  })

  it('AC-4214.4: 묶음 key는 건수 13개·매출 10개만 받고(모르는 key·바꿔 든 key는 뺌), 빈 목록인 묶음은 칸을 두지 않는다', () => {
    const got = normalizeUis({
      v: 1,
      // pt·etc1은 매출만, ptVisit·eswtStd는 건수만인 줄이다. injection은 의사랑에 없다
      counts: { pt: ['MM010'], etc1: ['CRYO'], injection: ['INJ'], ptVisit: ['AA222'], carm: [], nope: ['X'] },
      sales: { ptVisit: ['AA222'], eswtStd: ['ES1'], injection: ['INJ'], etc4: ['T1'], sono: 'SONO1' },
      etcNames: {},
    })
    expect(got?.counts).toEqual({ ptVisit: ['AA222'] })
    expect(got?.sales).toEqual({ etc4: ['T1'] })
  })

  it('AC-4214.4: counts·sales·etcNames가 객체가 아니면 비어 있는 것으로 본다', () => {
    expect(normalizeUis({ v: 1, counts: ['CARM1'], sales: 'x', etcNames: null })).toEqual(uisEmpty())
    expect(normalizeUis({ v: 1 })).toEqual(uisEmpty())
  })

  it(`AC-4214.4: 기타 이름은 앞뒤 빈칸을 떼고 ${MAX_ETC_NAME}자까지, 글자가 아니면 빈 글자다`, () => {
    const got = normalizeUis({
      v: 1,
      counts: {},
      sales: {},
      etcNames: { etc1: '  크라이오  ', etc2: '가'.repeat(25), etc3: 3, etc5: '없는 줄' },
    })
    expect(got?.etcNames).toEqual({ etc1: '크라이오', etc2: '가'.repeat(MAX_ETC_NAME), etc3: '', etc4: '' })
  })

  it('AC-4214.4: 비트 설정 칸(picks·reservations·amounts 등)은 버린다', () => {
    const got = normalizeUis({ ...picked(), picks: { carm: ['X'] }, reservations: { clinic: ['1'] }, amounts: {}, overlap: 'carm' })
    expect(got).toEqual(picked())
  })

  it('AC-4214.4: 받은 값을 고치지 않는다(새 값을 돌려준다)', () => {
    const raw = picked()
    const got = normalizeUis(raw)
    got?.counts.carm?.push('NEW')
    expect(raw).toEqual(picked())
  })
})

describe('AC-4214.4 saveUis·loadUis: erpClosingUis 한 열쇠(design.md 9-2)', () => {
  it('AC-4214.4: [저장]은 erpClosingUis 한 열쇠에 정리한 모양으로 한 번 쓰고, 쓴 값을 돌려준다', async () => {
    const { data, local } = fakeStorage()
    const dirty = { ...picked(), counts: { ...picked().counts, sono: [' SONO1 ', 'sono1', 'SONO2'] } }
    const saved = await saveUis(dirty)
    expect(saved).toEqual(picked())
    expect(local.set).toHaveBeenCalledTimes(1)
    expect(Object.keys(local.set.mock.calls[0][0])).toEqual([UIS_SETTINGS_KEY])
    expect(data[UIS_SETTINGS_KEY]).toEqual(picked())
  })

  it('AC-4214.4: 비트 설정 erpClosing은 읽지도 쓰지도 않는다', async () => {
    const { data, local } = fakeStorage({ [SETTINGS_KEY]: BIT_SETTINGS })
    await saveUis(picked())
    await loadUis()
    expect(local.get.mock.calls.map(([key]) => key)).not.toContain(SETTINGS_KEY)
    for (const [items] of local.set.mock.calls) expect(Object.keys(items)).not.toContain(SETTINGS_KEY)
    expect(data[SETTINGS_KEY]).toEqual(BIT_SETTINGS)
  })

  it('AC-4214.4: 모양이 틀린 값은 쓰지 않고 던진다', async () => {
    const { local } = fakeStorage()
    await expect(saveUis({ v: 2 } as unknown as UisSettings)).rejects.toThrow()
    expect(local.set).not.toHaveBeenCalled()
  })

  it('AC-4214.4: chrome.storage가 쓰지 못하면 그 오류를 그대로 던진다', async () => {
    fakeStorage({}, { failSet: true })
    await expect(saveUis(picked())).rejects.toThrow('QUOTA_BYTES')
  })

  it('AC-4214.4: 불러오기는 erpClosingUis만 읽어 정리한 값, 저장한 적 없거나 모양이 틀리면 null이다', async () => {
    const { local } = fakeStorage({ [UIS_SETTINGS_KEY]: { ...picked(), counts: { carm: [' CARM1 ', 'carm1'] } } })
    expect(await loadUis()).toEqual({ ...picked(), counts: { carm: ['CARM1'] } })
    expect(local.get.mock.calls.map(([key]) => key)).toEqual([UIS_SETTINGS_KEY])
    fakeStorage()
    expect(await loadUis()).toBeNull()
    fakeStorage({ [UIS_SETTINGS_KEY]: { v: 9 } })
    expect(await loadUis()).toBeNull()
  })
})

const row = (code: string, name: string | null, qty: number, amount: number): UisCodeRow => ({ code, name, qty, amount })
const CODES: UisCodes = {
  v: 1,
  from: '2026-08-24',
  to: '2026-11-23',
  codes: [
    row('MT1', '도수치료 30분', 120, 9_600_000),
    row('CARM1', '씨암 유도 주사', 64, 3_200_000),
    row('SONO1', '초음파 유도', 58, 2_900_000),
    row('SOLU', '수액 솔루션', 31.5, 1_260_000),
    row('AA222', '물리치료 기본', 2_100, 840_000),
    row('so-long', null, 3, 3_000),
    row('X'.repeat(21), '긴 코드', 1, 100),
  ],
}

describe('AC-4214.3 normalizeCodes·saveUisCodes·loadUisCodes: erpClosingUisCodes(design.md 9-2·3-3)', () => {
  it('AC-4214.3: 맞는 목록은 그대로(차례 그대로, 21자 넘는 코드도 목록에는 둔다)', () => {
    expect(normalizeCodes(CODES)).toEqual(CODES)
  })

  it.each([
    ['null', null],
    ['판 없음', { from: 'a', to: 'b', codes: [] }],
    ['판 2', { ...CODES, v: 2 }],
    ['기간이 글자 아님', { ...CODES, from: null }],
    ['목록이 배열 아님', { ...CODES, codes: {} }],
  ])('AC-4214.3: 모양이 틀리면(%s) null이다', (_name, raw) => {
    expect(normalizeCodes(raw)).toBeNull()
  })

  it('AC-4214.3: 틀린 줄(코드 없음·빈 코드·이름이 글자도 null도 아님·숫자 아님·소수 금액·끝없는 수)은 뺀다', () => {
    const got = normalizeCodes({
      ...CODES,
      codes: [
        row('MT1', '도수치료 30분', 120, 9_600_000),
        { name: '코드 없음', qty: 1, amount: 1 },
        row('  ', '빈 코드', 1, 1),
        { code: 'N1', name: 3, qty: 1, amount: 1 },
        { code: 'Q1', name: null, qty: '1', amount: 1 },
        row('A1', null, 1, 1.5),
        row('I1', null, Infinity, 1),
        'MT2',
        row('SOLU', '수액 솔루션', 31.5, 1_260_000),
      ],
    })
    expect(got?.codes).toEqual([row('MT1', '도수치료 30분', 120, 9_600_000), row('SOLU', '수액 솔루션', 31.5, 1_260_000)])
  })

  it(`AC-4214.3: 목록은 ${MAX_UIS_CODES}개까지(도우미가 내는 수와 같다)`, () => {
    const many = Array.from({ length: MAX_UIS_CODES + 5 }, (_, i) => row(`C${i}`, null, 1, MAX_UIS_CODES + 5 - i))
    expect(MAX_UIS_CODES).toBe(2000)
    expect(normalizeCodes({ ...CODES, codes: many })?.codes).toEqual(many.slice(0, MAX_UIS_CODES))
  })

  it('AC-4214.3: [코드 목록 읽기] 목록은 erpClosingUisCodes 한 열쇠에 곧바로 쓰고(설정 칸은 건드리지 않음) 다시 읽으면 같다', async () => {
    const { data, local } = fakeStorage({ [UIS_SETTINGS_KEY]: picked(), [SETTINGS_KEY]: BIT_SETTINGS })
    await saveUisCodes(CODES)
    expect(local.set).toHaveBeenCalledTimes(1)
    expect(Object.keys(local.set.mock.calls[0][0])).toEqual([UIS_CODES_KEY])
    expect(data[UIS_SETTINGS_KEY]).toEqual(picked())
    expect(data[SETTINGS_KEY]).toEqual(BIT_SETTINGS)
    expect(await loadUisCodes()).toEqual(CODES)
  })

  it('AC-4214.3: 모양이 틀린 목록은 쓰지 않고 던진다 · 저장한 적 없거나 틀리면 불러오기는 null', async () => {
    const { local } = fakeStorage()
    await expect(saveUisCodes({ v: 1 } as unknown as UisCodes)).rejects.toThrow()
    expect(local.set).not.toHaveBeenCalled()
    expect(await loadUisCodes()).toBeNull()
    fakeStorage({ [UIS_CODES_KEY]: { v: 1, codes: [] } })
    expect(await loadUisCodes()).toBeNull()
  })
})

describe('AC-4211.2 toUisArgs: 의사랑 closing.day args(design.md 3-1·8-3)', () => {
  it('AC-4211.2: 코드를 고른 묶음만, groups는 UIS_COUNT_KEYS 차례 · sales는 UIS_SALES_KEYS 차례다', () => {
    const s: UisSettings = {
      v: 1,
      // 일부러 차례를 섞어 넣는다
      counts: { ptVisit: ['AA222'], eswtStd: ['ES1'], carm: ['CARM1'], sono: [], manual: ['MT1'] },
      sales: { etc1: ['CRYO'], pt: ['MM010', 'MM015'], carm: ['CARM1', 'LA358'], eswt: [] },
      etcNames: { etc1: '크라이오', etc2: '', etc3: '', etc4: '' },
    }
    expect(toUisArgs('2026-11-23', s)).toEqual({
      date: '2026-11-23',
      groups: [
        { key: 'carm', codes: ['CARM1'] },
        { key: 'manual', codes: ['MT1'] },
        { key: 'eswtStd', codes: ['ES1'] },
        { key: 'ptVisit', codes: ['AA222'] },
      ],
      sales: [
        { key: 'carm', codes: ['CARM1', 'LA358'] },
        { key: 'pt', codes: ['MM010', 'MM015'] },
        { key: 'etc1', codes: ['CRYO'] },
      ],
    })
  })

  it('AC-4211.2: 모든 묶음을 고르면 groups 13개·sales 10개가 그 차례 그대로다', () => {
    const counts = Object.fromEntries(UIS_COUNT_KEYS.map((key) => [key, [`${key.toUpperCase()}1`]]))
    const sales = Object.fromEntries(UIS_SALES_KEYS.map((key) => [key, [`${key.toUpperCase()}9`]]))
    const args = toUisArgs('2026-11-23', { v: 1, counts, sales, etcNames: { etc1: '', etc2: '', etc3: '', etc4: '' } })
    expect(args.groups.map((g) => g.key)).toEqual([...UIS_COUNT_KEYS])
    expect(args.sales.map((g) => g.key)).toEqual([...UIS_SALES_KEYS])
  })

  it('AC-4211.2: 아무것도 고르지 않았으면 groups·sales 모두 빈 목록이다(기타 이름은 보내지 않는다)', () => {
    expect(toUisArgs('2026-11-23', { ...uisEmpty(), etcNames: { etc1: '크라이오', etc2: '', etc3: '', etc4: '' } })).toEqual({
      date: '2026-11-23',
      groups: [],
      sales: [],
    })
  })

  it('AC-4211.2: 정리하지 않은 값도 코드 꼴로 맞춰 보낸다(도우미 명령 표에 맞지 않는 코드를 보내지 않는다)', () => {
    const args = toUisArgs('2026-11-23', {
      v: 1,
      counts: { carm: [' CARM1 ', 'carm1', 'TAB\tX'], sono: ['   '] },
      sales: { manual: ['MT   1', 'Z'.repeat(21)] },
      etcNames: { etc1: '', etc2: '', etc3: '', etc4: '' },
    })
    expect(args.groups).toEqual([{ key: 'carm', codes: ['CARM1'] }])
    expect(args.sales).toEqual([{ key: 'manual', codes: ['MT 1'] }])
  })

  it('AC-4211.2: 돌려준 목록을 고쳐도 설정은 그대로다', () => {
    const s = picked()
    toUisArgs('2026-11-23', s).groups[0].codes.push('NEW')
    expect(s).toEqual(picked())
  })
})

describe('AC-4214.2 searchUis: 코드 목록에서 찾기(design.md 8-3)', () => {
  it('AC-4214.2: 코드나 처방명칭에 그 글자가 든 것(대소문자 무시), 목록 차례 그대로다', () => {
    expect(searchUis(CODES.codes, 'so').map((c) => c.code)).toEqual(['SONO1', 'SOLU', 'so-long'])
    expect(searchUis(CODES.codes, 'SO').map((c) => c.code)).toEqual(['SONO1', 'SOLU', 'so-long'])
    expect(searchUis(CODES.codes, '도수').map((c) => c.code)).toEqual(['MT1'])
    expect(searchUis(CODES.codes, '  주사 ').map((c) => c.code)).toEqual(['CARM1'])
  })

  it('AC-4214.2: 21자 넘는 코드도 찾기 결과에 보인다(고를 수 없게 하는 것은 설정 화면)', () => {
    expect(searchUis(CODES.codes, 'XXXX').map((c) => c.code)).toEqual(['X'.repeat(21)])
  })

  it('AC-4214.2: 빈 글자·빈칸만이면 없음', () => {
    expect(searchUis(CODES.codes, '')).toEqual([])
    expect(searchUis(CODES.codes, '   ')).toEqual([])
  })

  it(`AC-4214.2: ${MAX_RESULTS}개까지`, () => {
    const many = Array.from({ length: 45 }, (_, i) => row(`AB${i}`, null, 1, 1))
    expect(searchUis(many, 'ab')).toEqual(many.slice(0, MAX_RESULTS))
    expect(MAX_RESULTS).toBe(30)
  })

  it('AC-4214.2: 받은 목록을 바꾸지 않는다', () => {
    const list = JSON.parse(JSON.stringify(CODES.codes)) as UisCodeRow[]
    searchUis(list, 'so')
    expect(list).toEqual(CODES.codes)
  })
})

describe('AC-4211.1 savedSources: 비트·의사랑 설정 저장 여부(design.md 8-3, 값은 읽지 않음)', () => {
  it.each([
    ['둘 다 없음', {}, { bit: false, uis: false }],
    ['비트만', { [SETTINGS_KEY]: BIT_SETTINGS }, { bit: true, uis: false }],
    ['의사랑만', { [UIS_SETTINGS_KEY]: picked() }, { bit: false, uis: true }],
    ['둘 다', { [SETTINGS_KEY]: BIT_SETTINGS, [UIS_SETTINGS_KEY]: picked() }, { bit: true, uis: true }],
  ])('AC-4211.1: %s', async (_name, stored, expected) => {
    fakeStorage(stored)
    expect(await savedSources()).toEqual(expected)
  })

  it('AC-4211.1: 값 모양은 보지 않는다(틀린 값이라도 저장돼 있으면 있음)', async () => {
    fakeStorage({ [SETTINGS_KEY]: 'garbage', [UIS_SETTINGS_KEY]: { v: 9 } })
    expect(await savedSources()).toEqual({ bit: true, uis: true })
  })

  it('AC-4211.1: 두 열쇠를 하나씩 읽기만 하고 쓰지 않는다', async () => {
    const { local } = fakeStorage({ [SETTINGS_KEY]: BIT_SETTINGS })
    await savedSources()
    expect(local.get.mock.calls.map(([key]) => key).sort()).toEqual([SETTINGS_KEY, UIS_SETTINGS_KEY].sort())
    expect(local.set).not.toHaveBeenCalled()
  })
})
