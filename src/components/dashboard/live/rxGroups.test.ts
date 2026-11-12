import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { groupDefs, groupKey } from '@/components/stats/treatmentView'
import { listStatsRxGroups, saveStatsRxGroups, StatsRxGroupStoreError } from '@/lib/storage/statsRxGroups'
import type { RxGroup, StatsRxGroup } from '@/types/rxGroups'
import { readDashboardGroups, toDashboardGroups } from './rxGroups'

// 대시보드 '처방 상위'의 묶음 읽기 (spec bit-dashboard REQ-606, design.md '처방 상위 = 통계 탭 묶음').
// 통계 탭 묶음 읽기(listStatsRxGroups)만 가짜로 바꾸고, 열쇠·정의는 통계 탭의 진짜 groupKey·groupDefs와 견준다. 묶음·코드는 모두 지어낸 값이다

vi.mock('@/lib/storage/statsRxGroups', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/statsRxGroups')>()),
  listStatsRxGroups: vi.fn(),
  saveStatsRxGroups: vi.fn(),
}))

const list = vi.mocked(listStatsRxGroups)
const save = vi.mocked(saveStatsRxGroups)

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

// 제외할 처방이 있는 묶음(rx-group-exclude AC-2705.5). 표층열만 = 넣은 처방 MM010, 제외할 처방 ESWT7(spec 고정 값의 코드). 나머지 코드는 지어낸 값이다
const EXCLUDE_ROWS: readonly StatsRxGroup[] = [
  { id: 'fake-5', name: '가짜 표층열만 묶음', codes: ['MM010'], exclude: ['ESWT7'], sortOrder: 1 },
  { id: 'fake-1', name: '가짜 주사 묶음', codes: ['ZX100'], sortOrder: 0 },
  { id: 'fake-6', name: '가짜 빈 제외 묶음', codes: ['ZX600'], exclude: [], sortOrder: 2 },
  { id: 'fake-7', name: '가짜 제외만 묶음', codes: [], exclude: ['ZX601'], sortOrder: 3 },
]
const MM_NO_ESWT7_KEY = 't7bdb9b20a17a64d3' // groupKey(['MM010'], ['ESWT7']) 고정 값(AC-2705.2)

describe('toDashboardGroups — 제외할 처방 (AC-2705.5)', () => {
  it('AC-2705.5 줄 열쇠는 groupKey(codes, exclude)이고, 제외할 처방이 없는 묶음(열쇠 없음·빈 배열)은 지금 열쇠 그대로다', () => {
    const { lines } = toDashboardGroups(EXCLUDE_ROWS)
    expect(lines).toEqual([
      { name: '가짜 주사 묶음', key: groupKey(['ZX100']) },
      { name: '가짜 표층열만 묶음', key: MM_NO_ESWT7_KEY },
      { name: '가짜 빈 제외 묶음', key: groupKey(['ZX600']) },
    ])
    expect(lines[1].key).toBe(groupKey(['MM010'], ['ESWT7']))
    expect(lines[1].key).not.toBe(groupKey(['MM010']))
  })

  it('AC-2705.5 정의는 groupDefs(rows)와 같고 제외할 처방이 있는 정의에만 exclude가 있으며, 줄 열쇠와 정의 id가 같은 차례로 맞는다', () => {
    const { lines, defs } = toDashboardGroups(EXCLUDE_ROWS)
    expect(defs).toEqual(groupDefs(EXCLUDE_ROWS))
    expect(defs).toEqual([
      { id: groupKey(['ZX100']), codes: ['ZX100'] },
      { id: MM_NO_ESWT7_KEY, codes: ['MM010'], exclude: ['ESWT7'] },
      { id: groupKey(['ZX600']), codes: ['ZX600'] },
    ])
    expect(defs.map((def) => Object.hasOwn(def, 'exclude'))).toEqual([false, true, false])
    expect(lines.map((line) => line.key)).toEqual(defs.map((def) => def.id))
  })

  it('AC-2705.5 넣은 처방이 없는 묶음은 제외할 처방이 있어도 줄·정의에 없고, 받은 목록은 바꾸지 않는다', () => {
    const rows = EXCLUDE_ROWS.map((row) => ({ ...row, codes: [...row.codes], ...(row.exclude === undefined ? {} : { exclude: [...row.exclude] }) }))
    const before = structuredClone(rows)
    const { lines, defs } = toDashboardGroups(rows)
    expect(lines.map((line) => line.name)).not.toContain('가짜 제외만 묶음')
    expect(JSON.stringify(defs)).not.toContain('ZX601')
    expect(rows).toEqual(before)
  })

  it('AC-2705.5 readDashboardGroups는 읽은 묶음의 제외할 처방을 열쇠·정의에 그대로 쓴다', async () => {
    list.mockResolvedValueOnce(EXCLUDE_ROWS.map((row) => ({ ...row, codes: [...row.codes] })))
    const read = await readDashboardGroups()
    expect(read).toEqual(toDashboardGroups(EXCLUDE_ROWS))
    expect(read?.lines[1]).toEqual({ name: '가짜 표층열만 묶음', key: MM_NO_ESWT7_KEY })
    expect(read?.defs[1]).toEqual({ id: MM_NO_ESWT7_KEY, codes: ['MM010'], exclude: ['ESWT7'] })
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

describe('AC-606.8 소스', () => {
  const source = readFileSync(join(process.cwd(), 'src/components/dashboard/live/rxGroups.ts'), 'utf8')

  it('AC-606.8: 네트워크·브라우저 저장소·console·묶음 저장을 쓰지 않는다', () => {
    for (const banned of ['fetch(', 'XMLHttpRequest', 'localStorage', 'sessionStorage', 'indexedDB', 'console.', 'saveStatsRxGroups']) {
      expect(source, banned).not.toContain(banned)
    }
  })

  it('AC-606.8: 통계 탭 열쇠·정의(treatmentView)와 묶음 읽기(statsRxGroups)와 타입만 불러온다', () => {
    const modules = [...source.matchAll(/^import\s+(type\s+)?[^'"]*from\s+'([^']+)'/gm)].map((m) => ({ type: Boolean(m[1]), from: m[2] }))
    const values = modules.filter((m) => !m.type).map((m) => m.from)
    expect(values.sort()).toEqual(['@/components/stats/treatmentView', '@/lib/storage/statsRxGroups'])
    expect(source).not.toMatch(/import\s*\(/)
  })
})
