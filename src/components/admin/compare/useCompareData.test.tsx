// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COMPARE_KINDS, compareRanges } from '@/lib/admin/compare/load'
import { compareMonths } from '@/lib/admin/compare/months'
import { payByJob } from '@/lib/admin/compare/pay'
import { listViewHospitals, type ViewHospital } from '@/lib/auth/adminView'
import { readCompareFirstMonth } from '@/lib/auth/adminSync'
import { readAdminRows, type AdminRow, type AdminRowKind } from '@/lib/storage/adminRows'
import { DEFAULT_PAY_ITEMS } from '@/types/staff'
import { compareStatsInput } from './statsInput'
import { useCompareData } from './useCompareData'

// 의원 비교 불러오기 훅(spec admin-view REQ-8017 AC-8017.2·AC-8017.3, REQ-8023 AC-8023.4, design.md '의원 비교 — 불러오기와 한도'·'의원 비교 달 10년').
// 브라우저 함수 셋(의원 목록·가장 이른 달·admin_rows)은 흉내 낸다 — 진짜 Supabase에 붙지 않는다. 계산(load·rank·pay·statsInput)은 진짜를 쓴다.
// 의원·주소·금액은 모두 지어낸 것이다. 오늘 = 2026-11-24(화), 지난달 = 2026년 10월

vi.mock('@/lib/auth/adminView', () => ({ listViewHospitals: vi.fn() }))
vi.mock('@/lib/auth/adminSync', () => ({ readCompareFirstMonth: vi.fn() }))
vi.mock('@/lib/storage/adminRows', () => ({ readAdminRows: vi.fn() }))
// 나란히 보기 입력을 만들었는지 세려고 진짜를 감싼다
vi.mock('./statsInput', async (original) => {
  const real = await original<typeof import('./statsInput')>()
  return { ...real, compareStatsInput: vi.fn(real.compareStatsInput) }
})

const list = vi.mocked(listViewHospitals)
const firstMonth = vi.mocked(readCompareFirstMonth)
const read = vi.mocked(readAdminRows)
const sideInput = vi.mocked(compareStatsInput)

const TODAY = '2026-11-24'
const OCT = '2026-10'
const SEP = '2026-09'

const hospital = (id: string, name: string, address: string | null, extra: Partial<ViewHospital> = {}): ViewHospital => ({
  hospitalId: id,
  name,
  address,
  regionSet: false,
  region: null,
  mine: false,
  ...extra,
})
// 내 의원 = 가나(서울). 사아는 관리자가 '지역 모름'으로 정함. 목록 차례는 일부러 이름 차례가 아니다
const GA = hospital('h-ga', '가나 정형외과의원', '서울 가짜구 가짜로 1', { mine: true })
const JA = hospital('h-ja', '자차 정형외과의원', '경기도 예시시 예시로 45')
const DA = hospital('h-da', '다라 정형외과의원', '서울시 예시구 예시로 12, 3층')
const SA = hospital('h-sa', '사아 재활의학과의원', '서울특별시 서초구 서초동 123-4', { regionSet: true, region: null })
const MA = hospital('h-ma', '마바 정형외과의원', '부산광역시 가짜구 가짜로 7')
const ALL = [GA, JA, DA, SA, MA]

// 매출 날 줄(lib/storage/revenue.ts 칸) 하나 — 의원마다 총진료비가 다르게
const salesDay = (day: string, total: number, visits = 100) => ({
  day,
  visits,
  new_patients: 10,
  return_visits: visits - 10,
  total,
  insurer: null,
  noncovered: null,
  copay: null,
  other_total: null,
  cash: 0,
  card: total,
  transfer: 0,
  receivable_in: 0,
  unconfirmed: false,
  split_unconfirmed: true,
  rough_total: null,
  day_codes: true,
})
const TOTAL: Record<string, number> = { 'h-ga': 50_000_000, 'h-ja': 40_000_000, 'h-da': 30_000_000, 'h-sa': 20_000_000, 'h-ma': 10_000_000 }

// 직원·급여(가나만): 간호사 정규직 둘, 파트타임 하나, 지운 직원의 급여 줄 하나
const STAFF = [
  { id: 's1', job: '간호사', employment: 'regular', hired_on: '2025-01-02', left_on: null },
  { id: 's2', job: '간호사', employment: 'contract', hired_on: '2026-03-01', left_on: null },
  { id: 's3', job: '물리치료사', employment: 'part', hired_on: '2026-02-01', left_on: null },
]
const PAY: { month: string; staff_id: string | null; amounts: Record<string, number>; incentives: unknown[]; adjust: number }[] = [
  { month: OCT, staff_id: 's1', amounts: { base: 2_500_000, meal: 200_000 }, incentives: [], adjust: 0 },
  { month: OCT, staff_id: 's2', amounts: { base: 2_300_000 }, incentives: [{ ruleId: null, name: '도수', method: 'per_case', unitAmount: 10_000, percent: null, count: 5, sales: null }], adjust: -50_000 },
  { month: OCT, staff_id: 's3', amounts: { base: 900_000 }, incentives: [], adjust: 0 },
  { month: OCT, staff_id: null, amounts: { base: 9_000_000 }, incentives: [], adjust: 0 },
]

/** 그 의원·종류의 가짜 줄(달은 고른 달) */
function rowsFor(kind: AdminRowKind, id: string, to: string): AdminRow[] {
  const month = to.slice(0, 7)
  const rows: Record<string, unknown>[] = []
  if (kind === 'sales_days') rows.push(salesDay(`${month}-01`, TOTAL[id]! / 2), salesDay(`${month}-02`, TOTAL[id]! / 2))
  if (id === 'h-ga' && kind === 'staff_members') rows.push(...STAFF)
  if (id === 'h-ga' && kind === 'staff_pay') rows.push(...PAY.map((line) => ({ ...line, month })))
  return rows.map((row) => ({ hospitalId: id, row }))
}

// 의원마다 문을 둔다: 문을 열기 전까지 그 의원의 읽기 열여덟은 끝나지 않는다
type Gate = { open(): void; fail(): void; promise: Promise<void> }
let gates: Map<string, Gate>
let held: boolean
function gateOf(key: string): Gate {
  let gate = gates.get(key)
  if (!gate) {
    let open!: () => void
    let fail!: () => void
    const promise = new Promise<void>((resolve, reject) => {
      open = resolve
      fail = () => reject(new Error('가짜 읽기 실패'))
    })
    promise.catch(() => {})
    gate = { open, fail, promise }
    gates.set(key, gate)
  }
  return gate
}
const gateKey = (id: string, month: string) => `${id}|${month}`

/** 읽기를 부른 (의원, 달) 차례 — 같은 (의원, 달)의 열여덟 번은 한 번으로 센다 */
const readOrder = () => {
  const seen: string[] = []
  for (const [, ids, , to] of read.mock.calls) {
    const key = gateKey(ids[0]!, (to as string).slice(0, 7))
    if (!seen.includes(key)) seen.push(key)
  }
  return seen
}
const readsOf = (id: string, month: string) => read.mock.calls.filter(([, ids, , to]) => ids[0] === id && (to as string).slice(0, 7) === month)
/** 그 (의원, 달)을 몇 번 불러왔나(종류 열여덟을 한 번으로) */
const loadsOf = (id: string, month: string) => readsOf(id, month).length / COMPARE_KINDS.length

const open = async (id: string, month = OCT) => {
  await act(async () => {
    gateOf(gateKey(id, month)).open()
    await gateOf(gateKey(id, month)).promise
  })
}
const fail = async (id: string, month = OCT) => {
  await act(async () => {
    gateOf(gateKey(id, month)).fail()
    await gateOf(gateKey(id, month)).promise.catch(() => {})
  })
}

beforeEach(() => {
  gates = new Map()
  held = false
  list.mockReset()
  list.mockResolvedValue(ALL)
  firstMonth.mockReset()
  firstMonth.mockResolvedValue('2025-03')
  read.mockReset()
  read.mockImplementation(async (kind, ids, _from, to) => {
    if (held) await gateOf(gateKey(ids[0]!, to.slice(0, 7))).promise
    return rowsFor(kind, ids[0]!, to)
  })
  sideInput.mockClear()
})

afterEach(cleanup)

const mount = async () => {
  const hook = renderHook(() => useCompareData(TODAY))
  await waitFor(() => expect(hook.result.current.status).toBe('ready'))
  return hook
}
type Hook = Awaited<ReturnType<typeof mount>>
const allDone = async (hook: Hook) => waitFor(() => expect(hook.result.current.reading).toBe(false))
const pick = async (hook: Hook, region: string, month = hook.result.current.pick.month) => {
  await act(async () => {
    hook.result.current.setPick({ region: region as never, month })
  })
}

describe('AC-8017.2 의원 목록과 의원마다 읽기', () => {
  it('AC-8017.2: listViewHospitals를 한 번 부르고, 전체면 승인된 의원 모두(내 의원 포함)를 의원마다 종류 열여덟 · compareRanges(고른 달) 기간 · [그 의원 하나]로 readAdminRows에 읽는다', async () => {
    const hook = await mount()
    await allDone(hook)
    expect(list).toHaveBeenCalledTimes(1)
    expect(hook.result.current.pick).toEqual({ region: '전체', month: OCT })
    expect(hook.result.current.count).toBe(5)
    const ranges = compareRanges(OCT)
    for (const h of ALL) {
      const calls = readsOf(h.hospitalId, OCT)
      expect(calls.map(([kind]) => kind).sort()).toEqual([...COMPARE_KINDS].sort())
      for (const [kind, ids, from, to] of calls) {
        expect(ids).toEqual([h.hospitalId])
        expect({ from, to }).toEqual(ranges[kind as keyof typeof ranges])
      }
    }
    expect(read).toHaveBeenCalledTimes(ALL.length * COMPARE_KINDS.length)
  })

  it('AC-8017.2: 표 줄은 지역 안 의원 모두 — 이름·내 의원·지역 글(정한 지역 먼저, 없으면 주소, 모르면 지역 모름)과 매출 합(salesRow)', async () => {
    const hook = await mount()
    await allDone(hook)
    const rows = hook.result.current.rows
    expect(rows.map((row) => [row.id, row.name, row.own, row.region])).toEqual(
      expect.arrayContaining([
        ['h-ga', '가나 정형외과의원', true, '서울'],
        ['h-ja', '자차 정형외과의원', false, '경기'],
        ['h-da', '다라 정형외과의원', false, '서울'],
        ['h-sa', '사아 재활의학과의원', false, '지역 모름'],
        ['h-ma', '마바 정형외과의원', false, '부산'],
      ]),
    )
    expect(rows).toHaveLength(5)
    for (const row of rows) expect(row.sales?.total).toBe(TOTAL[row.id])
    expect(hook.result.current.unknownRegion).toBe(true)
  })

  it('AC-8017.2: 월급 칸 = 그 의원 직원·급여 줄과 급여 항목(설정 줄이 없으면 기본 항목)으로 payByJob — 이름·연락처 없이 직군·고용 형태·들어온 날만 쓴다', async () => {
    const hook = await mount()
    await allDone(hook)
    const ga = hook.result.current.rows.find((row) => row.id === 'h-ga')!
    const expected = payByJob({
      lines: PAY.map((line) => ({ month: line.month, staffId: line.staff_id, amounts: line.amounts, incentives: line.incentives as never, adjust: line.adjust })),
      members: STAFF.map((member) => ({ id: member.id, job: member.job as never, employment: member.employment as never, hiredOn: member.hired_on, leftOn: member.left_on })),
      items: DEFAULT_PAY_ITEMS.map((item) => ({ ...item })),
      month: OCT,
    })
    expect(ga.pay).toEqual(expected)
    // s1 = 2,500,000 + 200,000 = 2,700,000 · s2 = 2,300,000 + 도수 5건 × 10,000 − 조정 50,000 = 2,300,000 (지운 직원 줄은 빠짐)
    expect(ga.pay?.jobs.간호사).toEqual({ count: 2, avg: 2_500_000, min: 2_300_000, max: 2_700_000 })
    expect(ga.pay?.partTime).toBe(1)
    // 직원·급여 줄이 없는 의원은 '급여 없음'
    expect(hook.result.current.rows.find((row) => row.id === 'h-da')!.pay?.none).toBe(true)
  })

  it('AC-8017.2: 한 번에 세 의원까지만 동시에 읽고(내 의원 먼저 + 이름 차례), 끝난 의원부터 칸이 채워진다', async () => {
    held = true
    const hook = await mount()
    // 처음 셋: 가나(내 의원) → 다라 → 마바
    await waitFor(() => expect(readOrder()).toEqual([gateKey('h-ga', OCT), gateKey('h-da', OCT), gateKey('h-ma', OCT)]))
    expect(hook.result.current.reading).toBe(true)
    expect(hook.result.current.rows.every((row) => row.sales === null)).toBe(true)

    // 다라가 먼저 끝나면 다라 칸만 채워지고 넷째(사아)를 읽기 시작한다
    await open('h-da')
    await waitFor(() => expect(hook.result.current.rows.find((row) => row.id === 'h-da')!.sales?.total).toBe(TOTAL['h-da']))
    expect(hook.result.current.rows.filter((row) => row.sales !== null).map((row) => row.id)).toEqual(['h-da'])
    await waitFor(() => expect(readOrder()).toHaveLength(4))
    expect(readOrder()[3]).toBe(gateKey('h-sa', OCT))

    await open('h-ga')
    await waitFor(() => expect(readOrder()).toHaveLength(5))
    expect(readOrder()[4]).toBe(gateKey('h-ja', OCT))
    for (const id of ['h-ma', 'h-sa', 'h-ja']) await open(id)
    await allDone(hook)
    expect(hook.result.current.rows.every((row) => row.sales !== null)).toBe(true)
  })

  it('AC-8017.2: 동시에 읽는 의원 수는 어느 때에도 셋을 넘지 않는다(열 곳을 차례로 끝내며 셈)', async () => {
    const many = Array.from({ length: 10 }, (_, i) => hospital(`h-${i}`, `가짜${i} 정형외과의원`, '서울 가짜구 가짜로 1'))
    list.mockResolvedValue(many)
    let running = 0
    let most = 0
    const started = new Set<string>()
    read.mockImplementation(async (kind, ids, _from, to) => {
      const key = gateKey(ids[0]!, to.slice(0, 7))
      if (!started.has(key)) {
        started.add(key)
        running += 1
        most = Math.max(most, running)
        void gateOf(key).promise.then(() => {
          running -= 1
        })
      }
      await gateOf(key).promise
      return []
    })
    const hook = await mount()
    for (const h of many) {
      await waitFor(() => expect(started.has(gateKey(h.hospitalId, OCT))).toBe(true))
      expect(running).toBeLessThanOrEqual(3)
      await open(h.hospitalId)
    }
    await allDone(hook)
    expect(most).toBe(3)
    expect(started.size).toBe(10)
  })

  it('AC-8017.2: 지역을 고르면 그 지역 의원만 보이고, 같은 (의원, 달)은 지역·달을 오가도 다시 읽지 않는다', async () => {
    const hook = await mount()
    await allDone(hook)
    await pick(hook, '서울')
    expect(hook.result.current.rows.map((row) => row.id).sort()).toEqual(['h-da', 'h-ga'])
    expect(hook.result.current.count).toBe(2)
    await pick(hook, '지역 모름')
    expect(hook.result.current.rows.map((row) => row.id)).toEqual(['h-sa'])
    await pick(hook, '제주')
    expect(hook.result.current.rows).toEqual([])
    expect(hook.result.current.count).toBe(0)
    // 지난달(9월)로 가면 그 달을 새로 읽고, 10월로 돌아오면 다시 읽지 않는다
    await pick(hook, '전체', SEP)
    await allDone(hook)
    await pick(hook, '서울', OCT)
    await pick(hook, '전체', SEP)
    await pick(hook, '전체', OCT)
    await allDone(hook)
    for (const h of ALL) {
      expect(loadsOf(h.hospitalId, OCT), h.name).toBe(1)
      expect(loadsOf(h.hospitalId, SEP), h.name).toBe(1)
    }
  })

  it('AC-8017.2: 지역을 먼저 고르면 그 지역 의원만 읽는다(다른 지역 의원은 그 지역을 볼 때까지 읽지 않음)', async () => {
    held = true
    const hook = await mount()
    await pick(hook, '부산')
    for (const id of ['h-ga', 'h-da', 'h-ma']) await open(id)
    await allDone(hook)
    // 처음 셋(전체)은 이미 시작했다. 고른 뒤에는 부산(마바)만 남고, 아직 시작하지 않은 사아·자차는 읽지 않는다
    expect(readOrder()).toEqual([gateKey('h-ga', OCT), gateKey('h-da', OCT), gateKey('h-ma', OCT)])
    expect(hook.result.current.rows.map((row) => row.id)).toEqual(['h-ma'])
  })

  it('AC-8017.2: 읽기에 실패한 의원만 failed — 다른 의원 칸은 그대로이고, retry는 그 의원만 다시 읽는다', async () => {
    held = true
    const hook = await mount()
    await fail('h-da')
    for (const id of ['h-ga', 'h-ma', 'h-sa', 'h-ja']) await open(id)
    await allDone(hook)
    expect(hook.result.current.failed).toEqual([{ id: 'h-da', name: '다라 정형외과의원' }])
    const da = hook.result.current.rows.find((row) => row.id === 'h-da')!
    expect([da.sales, da.pay, da.rep]).toEqual([null, null, null])
    expect(hook.result.current.rows.filter((row) => row.sales !== null)).toHaveLength(4)

    gates.delete(gateKey('h-da', OCT))
    held = false
    await act(async () => {
      hook.result.current.retry('h-da')
    })
    await allDone(hook)
    expect(hook.result.current.failed).toEqual([])
    expect(hook.result.current.rows.find((row) => row.id === 'h-da')!.sales?.total).toBe(TOTAL['h-da'])
    expect(loadsOf('h-da', OCT)).toBe(2)
    for (const id of ['h-ga', 'h-ma', 'h-sa', 'h-ja']) expect(loadsOf(id, OCT)).toBe(1)
  })

  it('AC-8017.2: retryFailed는 지역 안 실패 의원 모두를 한 번씩 다시 읽는다', async () => {
    held = true
    const hook = await mount()
    await fail('h-ga')
    await fail('h-da')
    for (const id of ['h-ma', 'h-sa', 'h-ja']) await open(id)
    await allDone(hook)
    expect(hook.result.current.failed.map((row) => row.id).sort()).toEqual(['h-da', 'h-ga'])
    gates.clear()
    held = false
    await act(async () => {
      hook.result.current.retryFailed()
    })
    await allDone(hook)
    expect(hook.result.current.failed).toEqual([])
    expect(loadsOf('h-ga', OCT)).toBe(2)
    expect(loadsOf('h-da', OCT)).toBe(2)
    expect(loadsOf('h-ma', OCT)).toBe(1)
  })

  it('AC-8017.2: 화면을 떠나면(unmount) 남은 의원을 더 읽지 않는다', async () => {
    held = true
    const hook = await mount()
    await waitFor(() => expect(readOrder()).toHaveLength(3))
    hook.unmount()
    for (const id of ['h-ga', 'h-da', 'h-ma']) await open(id)
    expect(readOrder()).toHaveLength(3)
  })
})

describe('AC-8017.3 나란히 보기 입력은 지역을 골랐을 때만', () => {
  it('AC-8017.3: 전체면 나란히 보기 입력(compareStatsInput)을 만들지 않고 side가 빈 목록이다', async () => {
    const hook = await mount()
    await allDone(hook)
    expect(sideInput).not.toHaveBeenCalled()
    expect(hook.result.current.side).toEqual([])
  })

  it('AC-8017.3: 전체에서 읽은 뒤 지역을 고르면 다시 읽지 않고 그 지역 의원 칸 값만 만든다(내 의원·지역 글 포함)', async () => {
    const hook = await mount()
    await allDone(hook)
    await pick(hook, '서울')
    await waitFor(() => expect(hook.result.current.side.every((clinic) => typeof clinic.cells === 'object')).toBe(true))
    const side = hook.result.current.side
    expect(side.map((clinic) => [clinic.id, clinic.name, clinic.region, clinic.own]).sort()).toEqual([
      ['h-da', '다라 정형외과의원', '서울', false],
      ['h-ga', '가나 정형외과의원', '서울', true],
    ])
    expect(sideInput).toHaveBeenCalledTimes(2)
    expect(sideInput.mock.calls.every(([, month]) => month === OCT)).toBe(true)
    for (const h of ALL) expect(loadsOf(h.hospitalId, OCT)).toBe(1)
    // 다시 전체 → 서울로 와도 또 만들지 않는다
    await pick(hook, '전체')
    await pick(hook, '서울')
    expect(sideInput).toHaveBeenCalledTimes(2)
  })

  it('AC-8017.3: 지역을 고른 채 읽으면 읽는 동안은 reading, 끝난 의원은 칸 값, 실패한 의원은 failed', async () => {
    held = true
    const hook = await mount()
    await pick(hook, '서울')
    expect(hook.result.current.side.map((clinic) => clinic.cells)).toEqual(['reading', 'reading'])
    await open('h-ga')
    await fail('h-da')
    await waitFor(() => expect(hook.result.current.side.find((clinic) => clinic.id === 'h-da')!.cells).toBe('failed'))
    expect(typeof hook.result.current.side.find((clinic) => clinic.id === 'h-ga')!.cells).toBe('object')
  })
})

describe('AC-8023.4 가장 이른 달 한 번 읽기', () => {
  it('AC-8023.4: 화면을 열 때 readCompareFirstMonth를 한 번 읽어 compareMonths(그 달, 오늘)로 달 범위를 만들고, 지역·달을 바꿔도 다시 읽지 않는다', async () => {
    const hook = await mount()
    expect(firstMonth).toHaveBeenCalledTimes(1)
    expect(hook.result.current.months).toEqual(compareMonths('2025-03', TODAY))
    await pick(hook, '서울')
    await pick(hook, '부산', '2025-03')
    await pick(hook, '전체', OCT)
    await allDone(hook)
    expect(firstMonth).toHaveBeenCalledTimes(1)
    expect(list).toHaveBeenCalledTimes(1)
  })

  it('AC-8023.4: 저장된 달이 없으면(null) 지난달 하나만 고를 수 있다', async () => {
    firstMonth.mockResolvedValue(null)
    const hook = await mount()
    expect(hook.result.current.months).toEqual(compareMonths(null, TODAY))
    expect(hook.result.current.months?.first).toBe(OCT)
  })

  it('AC-8023.4: 가장 이른 달 읽기가 실패하면 status failed(의원 숫자는 읽지 않음), reload()로 다시 읽어 ready가 된다', async () => {
    firstMonth.mockRejectedValueOnce(new Error('가짜 실패'))
    const hook = renderHook(() => useCompareData(TODAY))
    await waitFor(() => expect(hook.result.current.status).toBe('failed'))
    expect(read).not.toHaveBeenCalled()
    await act(async () => {
      hook.result.current.reload()
    })
    await waitFor(() => expect(hook.result.current.status).toBe('ready'))
    expect(firstMonth).toHaveBeenCalledTimes(2)
    await allDone(hook)
    expect(read).toHaveBeenCalled()
  })

  it('AC-8023.4: 의원 목록 읽기가 실패해도 같은 failed → reload()', async () => {
    list.mockRejectedValueOnce(new Error('가짜 실패'))
    const hook = renderHook(() => useCompareData(TODAY))
    await waitFor(() => expect(hook.result.current.status).toBe('failed'))
    await act(async () => {
      hook.result.current.reload()
    })
    await waitFor(() => expect(hook.result.current.status).toBe('ready'))
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('AC-8023.4: 아주 옛 달을 골라도 의원마다 읽는 기간은 compareRanges(그 달) 그대로다(두 달·휴일 칸 12달)', async () => {
    firstMonth.mockResolvedValue('2016-11')
    const hook = await mount()
    await allDone(hook)
    const old = '2017-01'
    await pick(hook, '전체', old)
    await allDone(hook)
    const ranges = compareRanges(old)
    const calls = readsOf('h-ga', old)
    expect(calls).toHaveLength(COMPARE_KINDS.length)
    for (const [kind, , from, to] of calls) expect({ from, to }).toEqual(ranges[kind as keyof typeof ranges])
    expect(ranges.stats_days).toEqual({ from: '2016-12-01', to: '2017-01-31' })
    expect(ranges.stats_day_totals).toEqual({ from: '2016-02-02', to: '2017-01-31' })
  })
})
