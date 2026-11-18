import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { groupDefs, groupKey } from '@/components/stats/treatmentView'
import { listStatsRxGroups, saveStatsRxGroups, StatsRxGroupStoreError } from '@/lib/storage/statsRxGroups'
import { loadSunapSettings, saveSunapSettings, SunapStorageError } from '@/lib/storage/sunap'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { RxCond, RxGroup, StatsRxGroup } from '@/types/rxGroups'
import { DEFAULT_RSV_KINDS, type SunapSettings } from '@/types/sunap'
import { readDashboardGroups, toDashboardGroups } from './rxGroups'

// 대시보드 '처방 상위'의 묶음 읽기 (spec bit-dashboard REQ-606, design.md '처방 상위 = 통계 탭 묶음').
// 통계 탭 묶음 읽기(listStatsRxGroups)만 가짜로 바꾸고, 열쇠·정의는 통계 탭의 진짜 groupKey·groupDefs와 견준다. 묶음·코드는 모두 지어낸 값이다

vi.mock('@/lib/storage/statsRxGroups', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/statsRxGroups')>()),
  listStatsRxGroups: vi.fn(),
  saveStatsRxGroups: vi.fn(),
}))
// 수납일지 설정 읽기(물리치료 묶음 id, spec desk-feedback AC-6302.1)와 브라우저 Supabase 클라이언트도 가짜다. 진짜 Supabase에 붙지 않는다
vi.mock('@/lib/storage/sunap', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/sunap')>()),
  loadSunapSettings: vi.fn(),
  saveSunapSettings: vi.fn(),
}))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: vi.fn() }))

const list = vi.mocked(listStatsRxGroups)
const save = vi.mocked(saveStatsRxGroups)
const settings = vi.mocked(loadSunapSettings)
const saveSettings = vi.mocked(saveSunapSettings)
const browser = vi.mocked(supabaseBrowser)
const FAKE_CLIENT = { fake: 'supabase' } as unknown as ReturnType<typeof supabaseBrowser>
const sunapSettings = (ptGroup: string | null): SunapSettings => ({ blockGroup: 'fake-1', ptGroup, kinds: DEFAULT_RSV_KINDS.map((kind) => ({ ...kind })) })

// 기본은 수납일지 설정 읽기 실패(pt 없음) — 묶음만 보는 지금 시험은 그대로다. AC-6302.1 시험이 답을 바꾼다
beforeEach(() => {
  browser.mockReturnValue(FAKE_CLIENT)
  settings.mockRejectedValue(new SunapStorageError('failed'))
})

// sortOrder가 뒤섞인 차례. 빈 묶음은 처방이 없고, '같은 처방 묶음'은 '주사 묶음'과 코드 모음이 같다(대소문자만 다름)
const ROWS: readonly RxGroup[] = [
  { id: 'fake-3', name: '가짜 도수 묶음', codes: ['ZX300', 'ZX301'], sortOrder: 3 },
  { id: 'fake-1', name: '가짜 주사 묶음', codes: ['ZX100'], sortOrder: 1 },
  { id: 'fake-2', name: '가짜 빈 묶음', codes: [], sortOrder: 2 },
  { id: 'fake-4', name: '가짜 같은 처방 묶음', codes: ['zx100'], sortOrder: 4 },
  { id: 'fake-0', name: '가짜 물리 묶음', codes: ['ZX050', 'ZX051', 'ZX052'], sortOrder: 0 },
]

afterEach(() => {
  vi.clearAllMocks()
})

describe('toDashboardGroups', () => {
  it('AC-606.1·AC-606.4: sortOrder 차례로 처방 든 묶음마다 이름과 groupKey 열쇠 한 줄이고, 처방 없는 묶음은 빠진다', () => {
    const { lines } = toDashboardGroups(ROWS)
    expect(lines).toEqual([
      { name: '가짜 물리 묶음', key: groupKey(['ZX050', 'ZX051', 'ZX052']) },
      { name: '가짜 주사 묶음', key: groupKey(['ZX100']) },
      { name: '가짜 도수 묶음', key: groupKey(['ZX300', 'ZX301']) },
      { name: '가짜 같은 처방 묶음', key: groupKey(['zx100']) },
    ])
    expect(lines.map((line) => line.name)).not.toContain('가짜 빈 묶음')
  })

  it('AC-606.1: 열쇠는 통계 탭 groupKey 그대로다(코드 차례·대소문자가 달라도 같은 열쇠)', () => {
    const rows: RxGroup[] = [{ id: 'fake-9', name: '가짜 차례 바뀐 묶음', codes: ['zx301', 'ZX300'], sortOrder: 0 }]
    expect(toDashboardGroups(rows).lines).toEqual([{ name: '가짜 차례 바뀐 묶음', key: groupKey(['ZX300', 'ZX301']) }])
  })

  it('AC-606.4: 모든 묶음에 처방이 없으면 줄과 정의가 모두 빈 목록이다', () => {
    const rows: RxGroup[] = [
      { id: 'fake-1', name: '가짜 빈 묶음 하나', codes: [], sortOrder: 1 },
      { id: 'fake-2', name: '가짜 빈 묶음 둘', codes: [], sortOrder: 0 },
    ]
    expect(toDashboardGroups(rows)).toEqual({ lines: [], defs: [] })
  })

  it('AC-606.4: 저장된 묶음이 없으면 { lines: [], defs: [] }다', () => {
    expect(toDashboardGroups([])).toEqual({ lines: [], defs: [] })
  })

  it('AC-606.7: defs는 통계 탭과 같은 groupDefs(rows)다(처방 든 묶음, sortOrder 차례, 같은 열쇠는 한 번)', () => {
    const { defs } = toDashboardGroups(ROWS)
    expect(defs).toEqual(groupDefs(ROWS))
    expect(defs).toEqual([
      { id: groupKey(['ZX050', 'ZX051', 'ZX052']), codes: ['ZX050', 'ZX051', 'ZX052'] },
      { id: groupKey(['ZX100']), codes: ['ZX100'] },
      { id: groupKey(['ZX300', 'ZX301']), codes: ['ZX300', 'ZX301'] },
    ])
  })

  it('AC-606.1: 받은 목록의 차례와 내용을 바꾸지 않는다', () => {
    const rows = ROWS.map((row) => ({ ...row, codes: [...row.codes] }))
    const before = structuredClone(rows)
    toDashboardGroups(rows)
    expect(rows).toEqual(before)
  })
})

describe('AC-3705.5 빼는 처방·조건 든 묶음 (spec group-exclude)', () => {
  // 지어낸 묶음. '빼기' 묶음은 '도수' 묶음과 넣는 처방이 같고 빼는 처방만 더 있다. '조건' 묶음은 넣는 처방 ZX310에 조건이 있다.
  // '빈 칸' 묶음은 빼는 처방·조건이 빈 배열(읽기 코드가 null을 채운 모양)이라 지금 열쇠 그대로여야 한다
  const OUT = ['ZX900']
  const COND: RxCond[] = [{ code: 'ZX310', unless: ['ZX320'] }]
  const EXCLUDE_ROWS: readonly StatsRxGroup[] = [
    { id: 'fake-2', name: '가짜 빼기 묶음', codes: ['ZX300', 'ZX301'], out: OUT, cond: [], sortOrder: 2 },
    { id: 'fake-0', name: '가짜 도수 묶음', codes: ['ZX300', 'ZX301'], out: [], cond: [], sortOrder: 0 },
    { id: 'fake-1', name: '가짜 조건 묶음', codes: ['ZX310', 'ZX311'], out: OUT, cond: COND, sortOrder: 1 },
    { id: 'fake-3', name: '가짜 빈 칸 묶음', codes: ['ZX330'], out: [], cond: [], sortOrder: 3 },
  ]

  it('AC-3705.5: 빼는 처방·조건 든 묶음의 줄 열쇠는 groupKey(codes, { out, cond })이고 넣는 처방만의 열쇠와 다르다', () => {
    const { lines } = toDashboardGroups(EXCLUDE_ROWS)
    expect(lines).toEqual([
      { name: '가짜 도수 묶음', key: groupKey(['ZX300', 'ZX301']) },
      { name: '가짜 조건 묶음', key: groupKey(['ZX310', 'ZX311'], { out: OUT, cond: COND }) },
      { name: '가짜 빼기 묶음', key: groupKey(['ZX300', 'ZX301'], { out: OUT }) },
      { name: '가짜 빈 칸 묶음', key: groupKey(['ZX330']) },
    ])
    expect(lines[1].key).not.toBe(groupKey(['ZX310', 'ZX311']))
    expect(lines[2].key).not.toBe(lines[0].key)
  })

  it('AC-3705.5: 줄마다 열쇠가 defs의 같은 묶음 항목 id와 같다(그래서 그날 줄 숫자를 그 열쇠로 찾는다)', () => {
    const { lines, defs } = toDashboardGroups(EXCLUDE_ROWS)
    expect(defs).toEqual(groupDefs(EXCLUDE_ROWS))
    expect(defs.map((def) => def.id)).toEqual(lines.map((line) => line.key))
    expect(defs[1]).toEqual({ id: lines[1].key, codes: ['ZX310', 'ZX311'], out: OUT, cond: COND })
    expect(defs[2]).toEqual({ id: lines[2].key, codes: ['ZX300', 'ZX301'], out: OUT })
  })

  it('AC-3705.5: 빼는 처방·조건이 빈 묶음은 지금 열쇠·정의 { id, codes } 그대로다', () => {
    const rows: StatsRxGroup[] = [{ id: 'fake-1', name: '가짜 빈 칸 묶음', codes: ['ZX300', 'ZX301'], out: [], cond: [], sortOrder: 0 }]
    const plain = toDashboardGroups([{ id: 'fake-1', name: '가짜 빈 칸 묶음', codes: ['ZX300', 'ZX301'], sortOrder: 0 }])
    expect(toDashboardGroups(rows)).toEqual(plain)
    expect(toDashboardGroups(rows).defs).toStrictEqual([{ id: groupKey(['ZX300', 'ZX301']), codes: ['ZX300', 'ZX301'] }])
  })

  it('AC-3705.5: 넣는 처방에 없는 조건만 있으면 지금 열쇠 그대로다(groupKey 규칙)', () => {
    const rows: StatsRxGroup[] = [
      { id: 'fake-1', name: '가짜 남는 조건 묶음', codes: ['ZX300'], cond: [{ code: 'ZX999', unless: ['ZX320'] }], sortOrder: 0 },
    ]
    expect(toDashboardGroups(rows).lines).toEqual([{ name: '가짜 남는 조건 묶음', key: groupKey(['ZX300']) }])
  })

  it('AC-3705.5: 받은 묶음의 빼는 처방·조건을 바꾸지 않는다', () => {
    const rows = EXCLUDE_ROWS.map((row) => structuredClone(row))
    const before = structuredClone(rows)
    toDashboardGroups(rows)
    expect(rows).toEqual(before)
  })

  it('AC-3705.5: 읽은 통계 묶음(빼는 처방·조건 칸이 채워짐)에서 줄 열쇠와 defs id가 같다', async () => {
    list.mockResolvedValueOnce(EXCLUDE_ROWS.map((row) => structuredClone(row)))
    const groups = await readDashboardGroups()
    expect(groups).toEqual(toDashboardGroups(EXCLUDE_ROWS))
    expect(groups?.lines.map((line) => line.key)).toEqual(groups?.defs.map((def) => def.id))
    expect(groups?.lines[2]).toEqual({ name: '가짜 빼기 묶음', key: groupKey(['ZX300', 'ZX301'], { out: OUT }) })
  })
})

describe('readDashboardGroups', () => {
  it('AC-606.1·AC-606.7·AC-606.8: 통계 탭 묶음을 한 번 읽어 toDashboardGroups로 바꾼다', async () => {
    list.mockResolvedValueOnce(ROWS.map((row) => ({ ...row, codes: [...row.codes] })))
    await expect(readDashboardGroups()).resolves.toEqual(toDashboardGroups(ROWS))
    expect(list).toHaveBeenCalledTimes(1)
    expect(list).toHaveBeenCalledWith()
  })

  it('AC-606.4: 저장된 묶음이 없으면 { lines: [], defs: [] }이고 제안 묶음을 만들거나 저장하지 않는다', async () => {
    list.mockResolvedValueOnce([])
    await expect(readDashboardGroups()).resolves.toEqual({ lines: [], defs: [] })
    expect(save).not.toHaveBeenCalled()
  })

  it('AC-606.5: 묶음 읽기가 실패하면(거절) null이다', async () => {
    list.mockRejectedValueOnce(new StatsRxGroupStoreError('E-STATS-GROUP-READ-FAILED'))
    await expect(readDashboardGroups()).resolves.toBeNull()
  })

  it('AC-606.5: 묶음 읽기가 바로 던져도 null이다', async () => {
    list.mockImplementationOnce(() => {
      throw new Error('가짜 실패')
    })
    await expect(readDashboardGroups()).resolves.toBeNull()
  })

  it('AC-606.8: 받아 오기만 한다(묶음 저장은 성공·실패 모두 부르지 않는다)', async () => {
    list.mockResolvedValueOnce(ROWS.map((row) => ({ ...row, codes: [...row.codes] })))
    await readDashboardGroups()
    list.mockRejectedValueOnce(new StatsRxGroupStoreError('E-STATS-GROUP-READ-FAILED'))
    await readDashboardGroups()
    expect(list).toHaveBeenCalledTimes(2)
    expect(save).not.toHaveBeenCalled()
  })
})

// 대시보드 물리치료 칸의 열쇠 (spec desk-feedback REQ-6302, design.md '② 대시보드 물리치료 칸').
// pt = 수납일지 설정 ptGroup(통계 처방 묶음 id)의 묶음 열쇠 — 수납일지와 같은 식 groupDefs([묶음])[0].id. 묶음·코드·id는 모두 지어낸 값이다
describe('AC-6302.1 물리치료 묶음 열쇠 (toDashboardGroups 둘째 인자)', () => {
  it('AC-6302.1: ptGroup이 목록의 처방 든 묶음 id면 pt = groupDefs([그 묶음])[0].id이고, 그 묶음 줄 열쇠와 같다', () => {
    const groups = toDashboardGroups(ROWS, 'fake-3')
    expect(groups.pt).toBe(groupDefs([ROWS[0]!])[0]!.id)
    expect(groups.pt).toBe(groupKey(['ZX300', 'ZX301']))
    expect(groups.lines.find((line) => line.name === '가짜 도수 묶음')?.key).toBe(groups.pt)
  })

  it('AC-6302.1: 빼는 처방·조건 든 묶음이면 pt는 그것까지 담은 열쇠다(defs의 같은 묶음 id와 같다)', () => {
    const OUT = ['ZX900']
    const COND: RxCond[] = [{ code: 'ZX310', unless: ['ZX320'] }]
    const rows: StatsRxGroup[] = [
      { id: 'fake-0', name: '가짜 도수 묶음', codes: ['ZX310', 'ZX311'], out: [], cond: [], sortOrder: 0 },
      { id: 'fake-1', name: '가짜 물리 조건 묶음', codes: ['ZX310', 'ZX311'], out: OUT, cond: COND, sortOrder: 1 },
    ]
    const groups = toDashboardGroups(rows, 'fake-1')
    expect(groups.pt).toBe(groupKey(['ZX310', 'ZX311'], { out: OUT, cond: COND }))
    expect(groups.pt).not.toBe(groupKey(['ZX310', 'ZX311']))
    expect(groups.defs.map((def) => def.id)).toContain(groups.pt)
  })

  it('AC-6302.1: ptGroup이 null이면(안 고름) pt = null이다', () => {
    expect(toDashboardGroups(ROWS, null).pt).toBeNull()
  })

  it('AC-6302.1: ptGroup이 목록에 없으면(지워진 묶음) pt = null이다', () => {
    expect(toDashboardGroups(ROWS, 'fake-gone').pt).toBeNull()
    expect(toDashboardGroups([], 'fake-3').pt).toBeNull()
  })

  it('AC-6302.1: ptGroup이 코드 없는 묶음이면 pt = null이다', () => {
    expect(toDashboardGroups(ROWS, 'fake-2').pt).toBeNull()
  })

  it('AC-6302.1: 둘째 인자를 주지 않으면 pt 칸이 없다(지금 호출 그대로)', () => {
    const groups = toDashboardGroups(ROWS)
    expect('pt' in groups).toBe(false)
    expect(groups).toStrictEqual({ lines: groups.lines, defs: groupDefs(ROWS) })
  })

  it('AC-6302.1: 둘째 인자는 lines·defs를 바꾸지 않는다', () => {
    const plain = toDashboardGroups(ROWS)
    for (const ptGroup of ['fake-3', 'fake-2', 'fake-gone', null]) {
      const { lines, defs } = toDashboardGroups(ROWS, ptGroup)
      expect({ lines, defs }, String(ptGroup)).toStrictEqual(plain)
    }
  })

  it('AC-6302.1: 받은 목록의 차례와 내용을 바꾸지 않는다', () => {
    const rows = ROWS.map((row) => ({ ...row, codes: [...row.codes] }))
    const before = structuredClone(rows)
    toDashboardGroups(rows, 'fake-3')
    expect(rows).toEqual(before)
  })
})

describe('AC-6302.1 readDashboardGroups — 묶음과 수납일지 설정을 함께 읽는다', () => {
  const rows = () => ROWS.map((row) => ({ ...row, codes: [...row.codes] }))

  it('AC-6302.1: 묶음과 수납일지 설정(브라우저 클라이언트)을 한 번씩 읽어 toDashboardGroups(묶음, ptGroup)로 바꾼다', async () => {
    list.mockResolvedValueOnce(rows())
    settings.mockResolvedValueOnce(sunapSettings('fake-3'))
    const groups = await readDashboardGroups()
    expect(groups).toStrictEqual(toDashboardGroups(ROWS, 'fake-3'))
    expect(groups?.pt).toBe(groupKey(['ZX300', 'ZX301']))
    expect(list).toHaveBeenCalledTimes(1)
    expect(settings).toHaveBeenCalledTimes(1)
    expect(settings).toHaveBeenCalledWith(FAKE_CLIENT)
  })

  it('AC-6302.1: 수납일지 설정에서 물리치료 묶음을 안 골랐으면 pt = null이고 묶음은 그대로다', async () => {
    list.mockResolvedValueOnce(rows())
    settings.mockResolvedValueOnce(sunapSettings(null))
    await expect(readDashboardGroups()).resolves.toStrictEqual({ ...toDashboardGroups(ROWS), pt: null })
  })

  it('AC-6302.1: 고른 물리치료 묶음이 목록에 없으면 pt = null이다', async () => {
    list.mockResolvedValueOnce(rows())
    settings.mockResolvedValueOnce(sunapSettings('fake-gone'))
    await expect(readDashboardGroups()).resolves.toStrictEqual({ ...toDashboardGroups(ROWS), pt: null })
  })

  it('AC-6302.1: 수납일지 설정 읽기만 실패하면(거절) pt가 없고 묶음은 그대로다', async () => {
    list.mockResolvedValueOnce(rows())
    settings.mockRejectedValueOnce(new SunapStorageError('offline'))
    const groups = await readDashboardGroups()
    expect(groups).toStrictEqual(toDashboardGroups(ROWS))
    expect(groups !== null && 'pt' in groups).toBe(false)
  })

  it('AC-6302.1: 수납일지 설정 읽기가 바로 던져도 pt만 없고 묶음은 그대로다', async () => {
    list.mockResolvedValueOnce(rows())
    settings.mockImplementationOnce(() => {
      throw new Error('가짜 실패')
    })
    await expect(readDashboardGroups()).resolves.toStrictEqual(toDashboardGroups(ROWS))
  })

  it('AC-6302.1: 브라우저 클라이언트를 만들다 던져도(설정 없는 환경) pt만 없고 묶음은 그대로다', async () => {
    list.mockResolvedValueOnce(rows())
    browser.mockImplementationOnce(() => {
      throw new Error('가짜 환경 없음')
    })
    // 설정 읽기는 불리지 않는다(Once로 쌓으면 다음 시험으로 넘어가므로 기본 답만 바꾼다. beforeEach가 되돌린다)
    settings.mockResolvedValue(sunapSettings('fake-3'))
    await expect(readDashboardGroups()).resolves.toStrictEqual(toDashboardGroups(ROWS))
    expect(settings).not.toHaveBeenCalled()
  })

  it('AC-6302.1: 수납일지 설정 답이 설정 모양이 아니어도 pt만 없고 묶음은 그대로다', async () => {
    list.mockResolvedValueOnce(rows())
    settings.mockResolvedValueOnce(undefined as unknown as SunapSettings)
    await expect(readDashboardGroups()).resolves.toStrictEqual(toDashboardGroups(ROWS))
  })

  it('AC-6302.1: 묶음 읽기가 실패하면(거절·던짐) 설정을 읽어도 지금처럼 null이다', async () => {
    list.mockRejectedValueOnce(new StatsRxGroupStoreError('E-STATS-GROUP-READ-FAILED'))
    settings.mockResolvedValueOnce(sunapSettings('fake-3'))
    await expect(readDashboardGroups()).resolves.toBeNull()
    list.mockImplementationOnce(() => {
      throw new Error('가짜 실패')
    })
    await expect(readDashboardGroups()).resolves.toBeNull()
  })

  it('AC-6302.1: 읽기만 한다(묶음 저장·수납일지 설정 저장을 부르지 않는다)', async () => {
    list.mockResolvedValueOnce(rows())
    settings.mockResolvedValueOnce(sunapSettings('fake-3'))
    await readDashboardGroups()
    expect(save).not.toHaveBeenCalled()
    expect(saveSettings).not.toHaveBeenCalled()
  })
})

describe('AC-606.8 소스', () => {
  const source = readFileSync(join(process.cwd(), 'src/components/dashboard/live/rxGroups.ts'), 'utf8')

  it('AC-606.8·AC-6302.1: 네트워크·브라우저 저장소·console·묶음 저장·수납일지 설정 저장을 쓰지 않는다', () => {
    for (const banned of ['fetch(', 'XMLHttpRequest', 'localStorage', 'sessionStorage', 'indexedDB', 'console.', 'saveStatsRxGroups', 'saveSunapSettings']) {
      expect(source, banned).not.toContain(banned)
    }
  })

  it('AC-606.8·AC-6302.1: 통계 탭 열쇠·정의(treatmentView)와 묶음 읽기(statsRxGroups)·수납일지 설정 읽기(sunap·브라우저 클라이언트)와 타입만 불러온다', () => {
    const modules = [...source.matchAll(/^import\s+(type\s+)?[^'"]*from\s+'([^']+)'/gm)].map((m) => ({ type: Boolean(m[1]), from: m[2] }))
    const values = modules.filter((m) => !m.type).map((m) => m.from)
    expect(values.sort()).toEqual(['@/components/stats/treatmentView', '@/lib/storage/statsRxGroups', '@/lib/storage/sunap', '@/lib/supabase/browser'])
    expect(source).not.toMatch(/import\s*\(/)
  })
})
