import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBitLane } from '@/components/claim/bitLane'
import { partSave } from '@/components/stats/loadPlan'
import { groupDefs } from '@/components/stats/treatmentView'
import { compareYmd, eachDay } from '@/lib/analytics/dates'
import { uploadPlan } from '@/lib/autoUpload/plan'
import { BridgeError } from '@/lib/bridge/protocol'
import { AutoUploadError, type MyUploadPlan, type SavedSalesMark, type StatsMarks } from '@/lib/storage/autoUpload'
import { RevenueStoreError } from '@/lib/storage/revenue'
import { StorageError } from '@/lib/storage/stats'
import type { RxGroupDef } from '@/types/analysis'
import type { HelloResult, ResultOf, StreamResult } from '@/types/bridge'
import type { DateRange } from '@/types/dates'
import type { DayPayload, MonthPayload } from '@/types/payload'
import type { RevenueDayRow, RevenueDaysResult } from '@/types/revenue'
import type { StatsRxGroup } from '@/types/rxGroups'
import type { StatsLoaded, StatsSunapGroups } from '@/types/stats'
import { AnalyzeError } from '@/workers/runAnalysis'
import { requestLoad } from '@/workers/statsClient'
import { pickAccess, runUpload, uploadGroupsOf, type RunDeps, type UploadAccess, type UploadGroups } from './runUpload'

// 저절로 올리기 — 돌리기(spec admin-view REQ-8021 AC-8021.3~8021.7·AC-8021.11, design.md '저절로 올리기 — 돌리기').
// 통로·Worker·저장소·시계·통로 차례·잠금·화면 숨김을 모두 가짜로 넣는다(진짜 Supabase·도우미에 붙지 않는다). 통로 차례는 진짜 createBitLane이다.
// requestLoad만 가짜로 바꿔 무엇을 실었는지 본다. 날짜·숫자·요양기관번호는 모두 지어낸 값이다. 오늘 2026-11-24, 채울 기간 2달 = 9월 1일 ~ 11월 23일

vi.mock('@/workers/statsClient', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/workers/statsClient')>()
  return { ...real, requestLoad: vi.fn() }
})
// AC-8021.3 둘째 줄(빈 목록인데 through_day < 어제)은 지금 셈으로는 나오지 않아(그날 처음이면 어제 매출을 늘 다시 읽음) 그 시험에서만 빈 목록을 준다
vi.mock('@/lib/autoUpload/plan', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/autoUpload/plan')>()
  return { ...real, uploadPlan: vi.fn(real.uploadPlan) }
})

const load = vi.mocked(requestLoad)

const TODAY = '2026-11-24'
const Y = '2026-11-23'
const FILL = { from: '2026-09-01', to: Y }
const TAB = '30000000-0000-4000-8000-000000000001'
const CODE = '19990001' // 지어낸 요양기관번호
const MARK = createHash('sha256').update(CODE, 'utf8').digest('hex')
const PLAN: MyUploadPlan = { months: 2, throughDay: null }
const G1: RxGroupDef = { id: 't0123456789abcdef', codes: ['AA154'] }
const SUNAP_DEFS: StatsSunapGroups = { block: { id: 't1111111111111111', codes: ['BB100'] }, pt: { id: 't2222222222222222', codes: ['PT100'] } }
const GROUPS: UploadGroups = { rx: [G1], sunap: null }
const NO_MARKS: StatsMarks = { days: [], months: [] }
const HELLO_OK: HelloResult = { state: 'ready', helperVersion: '0.13.2', extensionVersion: '0.1.0', helperUpdateAvailable: false }
const CHECK_OK: ResultOf<'bit.check'> = {
  steps: [
    { name: 'find', ok: true },
    { name: 'db', ok: true },
    { name: 'registration', ok: true },
  ],
  registered: true,
  institutionCode: CODE,
}
const MINUTE = 60_000

// 처음 2달: 어제 매출 덩어리 → 통계 새 조각 → 옛 매출 덩어리 둘(lib/autoUpload/plan.test.ts와 같은 셈)
const R1 = { from: '2026-10-24', to: Y }
const R2 = { from: '2026-09-23', to: '2026-10-23' }
const R3 = { from: '2026-09-01', to: '2026-09-22' }
const PART = { save: { from: '2026-09-01', to: Y }, read: { from: '2026-08-01', to: Y } }

type Entry = [string, ...unknown[]]
type LoadReq = Parameters<typeof requestLoad>[1]

const revenueOk = (range: DateRange): RevenueDaysResult => ({
  days: eachDay(range).map((date) => ({ date, unconfirmed: false }) as RevenueDayRow),
  codes: [],
  dayCodes: [],
})
const earlier = (a: string, b: string) => (compareYmd(a, b) <= 0 ? a : b)
// Worker 답: 읽기 첫날(저장 밖)·저장 첫날의 날 줄과 그 두 달 줄. partSave가 저장 밖 줄을 거른다
function viewOk(req: LoadReq): StatsLoaded {
  const day = (ymd: string) => ({ day: ymd, partial: false, revisit: { after30: 1 }, rx: [] }) as unknown as DayPayload
  const month = (ymd: string) => ({ month: ymd.slice(0, 7), partial: false, revisit: { after30: 1 } }) as unknown as MonthPayload
  return {
    range: { from: req.from, to: req.to },
    covered: { from: req.from, to: earlier(req.to, Y) },
    quality: 'valid',
    checks: { noChart: 0, duplicate: 0, noFirst: 0 },
    months: [month(req.from), month(Y)],
    days: [day(req.from), day(Y)],
    report: { daily: [], monthly: [] },
  }
}

type Options = {
  plan?: MyUploadPlan
  sales?: SavedSalesMark[]
  coverage?: DateRange[]
  marks?: StatsMarks
  groups?: UploadGroups | Error | Promise<UploadGroups>
  hello?: HelloResult
  check?: ResultOf<'bit.check'> | Error
  claim?: boolean | Error
  revenue?: (range: DateRange) => Promise<RevenueDaysResult>
  stream?: (range: DateRange) => Promise<StreamResult>
  view?: (req: LoadReq) => StatsLoaded | Promise<StatsLoaded>
  saveRevenue?: (range: DateRange) => Promise<void>
  saveStats?: () => Promise<void>
  locks?: 'free' | 'held' | 'none'
  readFail?: boolean
}

function fakePage() {
  const listeners = new Set<() => void>()
  const page = {
    visibilityState: 'visible' as DocumentVisibilityState,
    addEventListener: (type: string, fn: () => void) => {
      if (type === 'visibilitychange') listeners.add(fn)
    },
    removeEventListener: (type: string, fn: () => void) => {
      if (type === 'visibilitychange') listeners.delete(fn)
    },
    hide() {
      page.visibilityState = 'hidden'
      for (const fn of [...listeners]) fn()
    },
    listeners,
  }
  return page
}

function setup(o: Options = {}) {
  const log: Entry[] = []
  const clock = { now: 0 }
  const lane = createBitLane()
  const page = fakePage()
  const controller = new AbortController()
  const pending = new Set<(reason: unknown) => void>()
  // 통로 요청: 닫으면(close) 기다리던 요청이 진짜 통로처럼 E-BRIDGE-DISCONNECTED로 끝난다
  const tracked = <T>(work: () => Promise<T>) =>
    new Promise<T>((resolve, reject) => {
      pending.add(reject)
      work()
        .then(resolve, reject)
        .finally(() => pending.delete(reject))
    })

  const bridge = {
    hello: vi.fn(() =>
      tracked(async () => {
        log.push(['hello'])
        return o.hello ?? HELLO_OK
      }),
    ),
    call: vi.fn((cmd: string, args: unknown) =>
      tracked(async () => {
        log.push([cmd, args])
        if (cmd === 'bit.check') {
          if (o.check instanceof Error) throw o.check
          return o.check ?? CHECK_OK
        }
        return (o.revenue ?? (async (range: DateRange) => revenueOk(range)))(args as DateRange)
      }),
    ),
    stream: vi.fn((cmd: string, args: DateRange) =>
      tracked(async () => {
        log.push([cmd, args])
        return (o.stream ?? (async (range: DateRange) => ({ id: `s-${range.from}`, count: 1 })))(args)
      }),
    ),
    close: vi.fn(() => {
      log.push(['close'])
      for (const reject of [...pending]) reject(new BridgeError('E-BRIDGE-DISCONNECTED'))
      pending.clear()
    }),
  }
  const worker = { postMessage: vi.fn(), terminate: vi.fn(() => log.push(['terminate'])), onmessage: null, onerror: null, onmessageerror: null }

  load.mockImplementation(async (_worker, req) => {
    log.push(['load', req])
    return (o.view ?? viewOk)(req)
  })

  const access: UploadAccess = {
    readPlan: vi.fn(async () => o.plan ?? PLAN),
    claim: vi.fn(async (tab: string, mark: string | null) => {
      log.push(['claim', tab, mark])
      if (o.claim instanceof Error) throw o.claim
      return o.claim ?? true
    }),
    report: vi.fn(async (tab, report) => {
      log.push(['report', tab, report])
    }),
    readSalesMarks: vi.fn(async (from: string, to: string) => {
      log.push(['readSalesMarks', from, to])
      if (o.readFail) throw new AutoUploadError()
      return o.sales ?? []
    }),
    readCoverage: vi.fn(async (range: DateRange) => {
      log.push(['readCoverage', range])
      return o.coverage ?? []
    }),
    readStatsMarks: vi.fn(async (from: string, to: string) => {
      log.push(['readStatsMarks', from, to])
      return o.marks ?? NO_MARKS
    }),
    saveRevenue: vi.fn(async (range: DateRange) => {
      log.push(['saveRevenue', range])
      await o.saveRevenue?.(range)
    }),
    saveStats: vi.fn(async (input) => {
      log.push(['saveStats', input])
      await o.saveStats?.()
      return { saved: 0 }
    }),
  }

  const readGroups = vi.fn(async () => {
    log.push(['readGroups'])
    const groups = await (o.groups ?? GROUPS)
    if (groups instanceof Error) throw groups
    return groups
  })
  const open = vi.fn(() => {
    log.push(['open'])
    return { bridge, worker }
  })
  const locks =
    o.locks === 'none'
      ? undefined
      : {
          request: vi.fn(async (name: string, options: unknown, callback: (lock: unknown) => Promise<unknown>) => {
            log.push(['lock', name, options])
            return callback(o.locks === 'held' ? null : { name, mode: 'exclusive' })
          }),
        }

  const deps = {
    access,
    plan: o.plan ?? PLAN,
    readGroups,
    open,
    lane,
    locks,
    subtle: globalThis.crypto.subtle,
    now: () => clock.now,
    today: TODAY,
    tab: TAB,
    page,
    signal: controller.signal,
  } as unknown as RunDeps

  return { deps, log, bridge, worker, lane, page, clock, controller, access, run: () => runUpload(deps) }
}

const names = (log: Entry[]) => log.map((entry) => entry[0])
const READS = ['readCoverage', 'readGroups', 'readSalesMarks', 'readStatsMarks']
const afterReads = (log: Entry[]) => {
  expect(names(log.slice(0, 4)).sort()).toEqual(READS)
  return log.slice(4)
}
const reports = (log: Entry[]) => log.filter((entry) => entry[0] === 'report').map((entry) => entry[2])
const report = (through: string | null, filledFrom: string | null, error: string | null, done: boolean) => ({ through, filledFrom, error, done })
const LOCK: Entry = ['lock', 'ssk-auto-upload', { ifAvailable: true }]
const loadReq = (read: DateRange, groups: readonly RxGroupDef[] = [G1], sunap: StatsSunapGroups | null = null) => ({
  streamId: `s-${read.from}`,
  from: read.from,
  to: read.to,
  today: TODAY,
  closeToday: false,
  keep: true,
  groups,
  sunap,
})
const savedRows = (range: DateRange): SavedSalesMark[] => eachDay(range).map((date) => ({ date, dayCodes: true, unconfirmed: false, roughTotal: null }))
const doneMarks = (): StatsMarks => ({
  days: eachDay(FILL).map((day) => ({ day, partial: false, hasSunap: true })),
  months: [
    { month: '2026-09', partial: false, dropoffAsOf: Y },
    { month: '2026-10', partial: false, dropoffAsOf: Y },
    { month: '2026-11', partial: true, dropoffAsOf: null },
  ],
})

let consoleSpies: ReturnType<typeof vi.spyOn>[] = []
beforeEach(() => {
  load.mockReset()
  consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((name) => vi.spyOn(console, name))
})
afterEach(() => {
  // 확인 창·알림·console은 없다(design.md '저절로 올리기 — 돌리기')
  for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled()
  vi.restoreAllMocks()
})

describe('AC-8021.5 일을 하나씩 차례로 통계 탭과 같은 함수로 하고, 일마다 진행을 알린다', () => {
  it('AC-8021.5·AC-8021.9 처음 2달: 읽기 넷 → 잠금 → 통로(hello·bit.check) → 잡기 → 매출·통계·매출·매출을 하나씩, 일마다 report(done 거짓) → report(done 참) → 닫기', async () => {
    const { log, run, worker } = setup()
    await run()
    expect(afterReads(log)).toEqual([
      LOCK,
      ['open'],
      ['hello'],
      ['bit.check', {}],
      ['claim', TAB, MARK],
      ['revenue.days', R1],
      ['saveRevenue', R1],
      ['report', TAB, report(null, null, null, false)],
      ['stats.rows', PART.read],
      ['load', loadReq(PART.read)],
      ['saveStats', partSave(viewOk(loadReq(PART.read)), PART)],
      ['report', TAB, report(Y, '2026-11-01', null, false)],
      ['revenue.days', R2],
      ['saveRevenue', R2],
      ['report', TAB, report(Y, '2026-10-01', null, false)],
      ['revenue.days', R3],
      ['saveRevenue', R3],
      ['report', TAB, report(Y, '2026-09-01', null, false)],
      ['report', TAB, report(Y, '2026-09-01', null, true)],
      ['close'],
      ['terminate'],
    ])
    expect(load.mock.calls[0][0]).toBe(worker)
    expect(log.slice(0, 4)).toEqual(
      expect.arrayContaining([
        ['readSalesMarks', FILL.from, FILL.to],
        ['readCoverage', FILL],
        ['readStatsMarks', FILL.from, FILL.to],
      ]),
    )
  })

  it('AC-8021.5 partSave로 저장 밖 줄을 거른 값을 saveStats에 넘긴다(통계 탭 저장 길 그대로)', async () => {
    const { log, run } = setup()
    await run()
    const saved = log.find((entry) => entry[0] === 'saveStats')![1] as ReturnType<typeof partSave>
    expect(saved.days.map((row) => row.day)).toEqual([Y])
    expect(saved.months.map((row) => row.month)).toEqual(['2026-11'])
    expect(saved.covered).toEqual(PART.save)
    expect(saved.source).toBe('bit')
  })

  it('AC-8021.5 일은 동시에 둘이 없다: 앞 일의 저장이 끝나기 전에는 다음 도우미 요청을 보내지 않는다', async () => {
    let release = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    const { log, run } = setup({ saveRevenue: (range) => (range.to === Y ? gate : Promise.resolve()) })
    const done = run()
    await vi.waitFor(() => expect(names(log)).toContain('saveRevenue'))
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(names(log).filter((name) => name === 'stats.rows' || name === 'revenue.days')).toEqual(['revenue.days'])
    release()
    await done
    expect(names(log).filter((name) => name === 'stats.rows')).toHaveLength(1)
  })

  it('AC-8021.5 잠금 기능이 없는 브라우저면 잠금 없이 돈다(다른 PC와는 DB 잡음이 막는다)', async () => {
    const { log, run } = setup({ locks: 'none' })
    await run()
    expect(names(afterReads(log)).slice(0, 2)).toEqual(['open', 'hello'])
    expect(reports(log).at(-1)).toEqual(report(Y, '2026-09-01', null, true))
  })
})

describe('AC-8021.3 할 일이 없으면 도우미에 붙지 않는다', () => {
  it('AC-8021.3 빈 목록이고 through_day ≥ 어제면 읽기 넷 뒤에 아무것도 하지 않는다(잠금·통로·잡기·알림 없음)', async () => {
    const { log, run, deps } = setup({ plan: { months: 2, throughDay: Y }, sales: savedRows(FILL), coverage: [FILL], marks: doneMarks() })
    await run()
    expect(afterReads(log)).toEqual([])
    expect(deps.open).not.toHaveBeenCalled()
  })

  it('AC-8021.3 빈 목록인데 through_day < 어제면 잠금 → 잡기(표시 없음) → 상태만 알리고 통로에는 붙지 않는다', async () => {
    vi.mocked(uploadPlan).mockReturnValueOnce([])
    const { log, run, deps } = setup({ plan: { months: 2, throughDay: '2026-11-20' }, sales: savedRows(FILL), coverage: [FILL], marks: doneMarks() })
    await run()
    expect(afterReads(log)).toEqual([LOCK, ['claim', TAB, null], ['report', TAB, report(Y, '2026-09-01', null, true)]])
    expect(deps.open).not.toHaveBeenCalled()
  })

  it('AC-8021.3 저장 표시 읽기가 실패하면 알리지 않고 멈춘다(잡지 않았으니 상태를 쓸 수 없다)', async () => {
    const { log, run, deps } = setup({ readFail: true })
    await run()
    expect(names(log).filter((name) => !READS.includes(name))).toEqual([])
    expect(deps.open).not.toHaveBeenCalled()
  })
})

describe('AC-8021.4 한 곳만 돈다 · 통로는 스스로 붙는다 · 비트 표시', () => {
  it('AC-8021.4 같은 브라우저 다른 탭이 잠금을 쥐고 있으면(ifAvailable → null) 아무것도 하지 않는다', async () => {
    const { log, run, deps } = setup({ locks: 'held' })
    await run()
    expect(afterReads(log)).toEqual([LOCK])
    expect(deps.open).not.toHaveBeenCalled()
  })

  it('AC-8021.4 비트 화면이 통로를 쓰는 중이면(bitLane) 붙지 않는다', async () => {
    const { log, run, lane } = setup()
    lane.enterScreen(() => {})
    await run()
    expect(afterReads(log)).toEqual([LOCK])
  })

  it('AC-8021.4 탭이 숨어 있으면 붙지 않고, 통로 차례를 놓는다', async () => {
    const { log, run, lane, page } = setup()
    page.visibilityState = 'hidden'
    await run()
    expect(afterReads(log)).toEqual([LOCK])
    const free = lane.enterBackground(() => {})
    expect(free).not.toBeNull()
    free!()
  })

  it.each<HelloResult['state']>(['no-extension', 'no-helper', 'busy', 'disconnected', 'update-extension'])(
    'AC-8021.4 hello가 %s이면(비트 PC가 아님) 알리지 않고 멈춘다 — 잡지 않고 통로·Worker를 닫고 차례를 놓는다',
    async (state) => {
      const { log, run, lane } = setup({ hello: { state, helperUpdateAvailable: false } })
      await run()
      expect(afterReads(log)).toEqual([LOCK, ['open'], ['hello'], ['close'], ['terminate']])
      const free = lane.enterBackground(() => {})
      expect(free).not.toBeNull()
      free!()
    },
  )

  it.each<[string, ResultOf<'bit.check'> | Error]>([
    ['등록 안 됨', { ...CHECK_OK, registered: false }],
    ['단계 실패', { ...CHECK_OK, steps: [{ name: 'find', ok: false, code: 'E-BIT-NOT-FOUND' }] }],
    ['bit.check 실패', new BridgeError('E-BIT-DB-FAILED')],
  ])('AC-8021.4 bit.check가 %s이면 알리지 않고 멈춘다', async (_name, check) => {
    const { log, run } = setup({ check })
    await run()
    expect(afterReads(log)).toEqual([LOCK, ['open'], ['hello'], ['bit.check', {}], ['close'], ['terminate']])
  })

  it('AC-8021.4 hello가 판 오류(E-HELPER-OLD)면 bit.check 없이 표시 없이 잡고 그 번호만 알리고 끝낸다', async () => {
    const { log, run } = setup({ hello: { state: 'update-helper', helperVersion: '0.2.0', extensionVersion: '0.1.0', helperUpdateAvailable: false } })
    await run()
    expect(afterReads(log)).toEqual([
      LOCK,
      ['open'],
      ['hello'],
      ['claim', TAB, null],
      ['report', TAB, report(null, null, 'E-HELPER-OLD', true)],
      ['close'],
      ['terminate'],
    ])
  })

  it('AC-8021.4 비트 표시 = 요양기관번호의 SHA-256 16진 64자, 번호를 못 찾은 PC는 표시 null로 잡고 그대로 올린다', async () => {
    const withCode = setup()
    await withCode.run()
    expect(withCode.log.find((entry) => entry[0] === 'claim')).toEqual(['claim', TAB, MARK])
    expect(MARK).toMatch(/^[0-9a-f]{64}$/)

    const noCode = setup({ check: { steps: CHECK_OK.steps, registered: true } })
    await noCode.run()
    expect(noCode.log.find((entry) => entry[0] === 'claim')).toEqual(['claim', TAB, null])
    expect(names(noCode.log).filter((name) => name === 'revenue.days')).toHaveLength(3)
    expect(reports(noCode.log).at(-1)).toEqual(report(Y, '2026-09-01', null, true))
    // 번호 글자는 어디로도 보내지 않는다(표시만)
    expect(JSON.stringify(withCode.log)).not.toContain(CODE)
  })

  it('AC-8021.4 잡지 못하면(다른 PC가 돌거나 다른 의원 비트) 아무 일도 알리지도 않고 닫는다', async () => {
    const { log, run } = setup({ claim: false })
    await run()
    expect(afterReads(log)).toEqual([LOCK, ['open'], ['hello'], ['bit.check', {}], ['claim', TAB, MARK], ['close'], ['terminate']])
  })

  it('AC-8021.4 잡기 부르기가 실패해도 알리지 않고 닫는다', async () => {
    const { log, run } = setup({ claim: new AutoUploadError() })
    await run()
    expect(names(afterReads(log))).toEqual(['lock', 'open', 'hello', 'bit.check', 'claim', 'close', 'terminate'])
  })

  it('AC-8021.4 번호를 못 찾은 PC(표시 null)가 이미 표시가 묶인 의원이라 잡지 못하면(false) 다른 잡기 실패처럼 아무것도 알리지 않고 닫는다', async () => {
    const { log, run } = setup({ check: { steps: CHECK_OK.steps, registered: true }, claim: false })
    expect(await run()).toBe('ended')
    expect(afterReads(log)).toEqual([LOCK, ['open'], ['hello'], ['bit.check', {}], ['claim', TAB, null], ['close'], ['terminate']])
  })

  it('AC-8021.4 판 오류(E-HELPER-OLD)로 표시 없이 잡다가 false면(묶인 의원) 그 번호도 알리지 않는다', async () => {
    const { log, run } = setup({ hello: { state: 'update-helper', helperVersion: '0.2.0', extensionVersion: '0.1.0', helperUpdateAvailable: false }, claim: false })
    expect(await run()).toBe('ended')
    expect(afterReads(log)).toEqual([LOCK, ['open'], ['hello'], ['claim', TAB, null], ['close'], ['terminate']])
  })

  it('AC-8021.4 할 일 없는 그날 처음 열기에 표시 없이 잡다가 false면(묶인 의원) 상태를 알리지 않는다', async () => {
    vi.mocked(uploadPlan).mockReturnValueOnce([])
    const { log, run, deps } = setup({ plan: { months: 2, throughDay: '2026-11-20' }, sales: savedRows(FILL), coverage: [FILL], marks: doneMarks(), claim: false })
    expect(await run()).toBe('ended')
    expect(afterReads(log)).toEqual([LOCK, ['claim', TAB, null]])
    expect(deps.open).not.toHaveBeenCalled()
  })
})

describe('AC-8021.8 통로를 못 잡았거나 화면에게 비켰으면 lane-busy를 돌려준다(통로가 풀리면 다시 해 볼 일)', () => {
  it("AC-8021.8 비트 화면이 통로를 쓰는 중이면 붙지 않고 'lane-busy'다", async () => {
    const { log, run, lane } = setup()
    lane.enterScreen(() => {})
    expect(await run()).toBe('lane-busy')
    expect(afterReads(log)).toEqual([LOCK])
  })

  it("AC-8021.8 도는 중 비트 화면이 붙으려 해 끊었으면 'lane-busy'다", async () => {
    const env = setup({ stream: () => new Promise<StreamResult>(() => {}) })
    const done = env.run()
    await vi.waitFor(() => expect(names(env.log)).toContain('stats.rows'))
    env.lane.enterScreen(() => {})
    expect(await done).toBe('lane-busy')
  })

  it.each<[string, Options, ((env: ReturnType<typeof setup>) => void) | null]>([
    ['다 돌았으면', {}, null],
    ['할 일이 없으면', { plan: { months: 2, throughDay: Y }, sales: savedRows(FILL), coverage: [FILL], marks: doneMarks() }, null],
    ['다른 탭이 잠금을 쥐고 있으면', { locks: 'held' }, null],
    ['비트 PC가 아니면', { hello: { state: 'no-helper', helperUpdateAvailable: false } }, null],
    ['잡지 못하면', { claim: false }, null],
    ['저장 표시 읽기가 실패하면', { readFail: true }, null],
    ['도는 중 탭이 숨으면', { stream: () => new Promise<StreamResult>(() => {}) }, (env) => env.page.hide()],
    ['도는 중 앱 틀을 떠나면', { stream: () => new Promise<StreamResult>(() => {}) }, (env) => env.controller.abort()],
  ])("AC-8021.8 %s 'ended'다(통로 때문에 멈춘 것이 아님)", async (_name, options, interrupt) => {
    const env = setup(options)
    const done = env.run()
    if (interrupt !== null) {
      await vi.waitFor(() => expect(names(env.log)).toContain('stats.rows'))
      interrupt(env)
    }
    expect(await done).toBe('ended')
  })

  it("AC-8021.8 탭이 숨어 있어 붙지 않았으면 'ended'다(보이면 다시 하는 것은 앱 틀 몫)", async () => {
    const { run, page } = setup()
    page.visibilityState = 'hidden'
    expect(await run()).toBe('ended')
  })
})

describe('AC-8021.6 5분 · 숨김 · 비트 화면 · 떠남', () => {
  it('AC-8021.6 첫 도우미 일에서 5분이 지나면 새 일을 시작하지 않는다(하던 일은 끝낸다) → report(done 참)', async () => {
    const clock = { now: 0 }
    const env = setup({
      revenue: async (range) => ((clock.now += 3 * MINUTE), revenueOk(range)),
      stream: async (range) => ((clock.now += 3 * MINUTE), { id: `s-${range.from}`, count: 1 }),
    })
    env.deps.now = () => clock.now
    await env.run()
    expect(names(env.log).filter((name) => name === 'revenue.days' || name === 'stats.rows')).toEqual(['revenue.days', 'stats.rows'])
    expect(names(env.log)).toContain('saveStats')
    expect(reports(env.log).at(-1)).toEqual(report(Y, '2026-11-01', null, true))
  })

  it.each<[string, (env: ReturnType<typeof setup>) => void]>([
    ['탭이 숨으면(visibilitychange)', (env) => env.page.hide()],
    ['비트 화면이 붙으려 하면(bitLane)', (env) => void env.lane.enterScreen(() => {})],
    ['앱 틀을 떠나면(abort)', (env) => env.controller.abort()],
  ])('AC-8021.6 %s 하던 요청을 그 자리에서 끊고(통로·Worker 닫음, 그 일은 저장 안 함) 오류 없이 마친다', async (_name, interrupt) => {
    const env = setup({ stream: () => new Promise<StreamResult>(() => {}) })
    const done = env.run()
    await vi.waitFor(() => expect(names(env.log)).toContain('stats.rows'))
    interrupt(env)
    await done
    expect(names(env.log)).not.toContain('saveStats')
    expect(names(env.log).filter((name) => name === 'revenue.days')).toHaveLength(1)
    expect(names(env.log).slice(-3)).toEqual(['close', 'terminate', 'report'])
    expect(reports(env.log).at(-1)).toEqual(report(null, null, null, true))
    expect(env.page.listeners.size).toBe(0)
  })

  it('AC-8021.6·AC-8021.8 비트 화면이 붙으려 하면 끊은 뒤 차례를 놓아 그 화면이 붙는다', async () => {
    const env = setup({ stream: () => new Promise<StreamResult>(() => {}) })
    const done = env.run()
    await vi.waitFor(() => expect(names(env.log)).toContain('stats.rows'))
    const onFree = vi.fn()
    expect(env.lane.enterScreen(onFree)).toBe(false)
    await done
    expect(onFree).toHaveBeenCalledTimes(1)
  })
})

describe('AC-8021.7 실패 번호', () => {
  it.each<[string, Options]>([
    ['E-BIT-READ-FAILED', { revenue: async (range) => (range.to === Y ? Promise.reject(new BridgeError('E-BIT-READ-FAILED')) : revenueOk(range)) }],
    ['E-BRIDGE-BAD-REPLY', { revenue: async (range) => (range.to === Y ? Promise.reject(new BridgeError('E-BRIDGE-BAD-REPLY')) : revenueOk(range)) }],
    ['E-REVENUE-SAVE-FAILED', { saveRevenue: async (range) => (range.to === Y ? Promise.reject(new RevenueStoreError('E-REVENUE-SAVE-FAILED')) : undefined) }],
  ])('AC-8021.7 매출 덩어리만 실패로 치는 번호(%s)면 다음 일을 계속하고 마지막에 그 번호를 알린다', async (code, options) => {
    const { log, run } = setup(options)
    await run()
    expect(names(log).filter((name) => name === 'revenue.days' || name === 'stats.rows')).toEqual(['revenue.days', 'stats.rows', 'revenue.days', 'revenue.days'])
    // 어제 덩어리(10-24 ~ 11-23)가 빠져 through는 10-23, 끊김 없는 날이 9-23부터면 10월 1일, 9-01부터면 9월 1일
    expect(reports(log)).toEqual([
      report(null, null, code, false),
      report(null, null, code, false),
      report('2026-10-23', '2026-10-01', code, false),
      report('2026-10-23', '2026-09-01', code, false),
      report('2026-10-23', '2026-09-01', code, true),
    ])
  })

  it.each<[string, Options]>([
    ['E-BRIDGE-BAD-REPLY', { stream: () => Promise.reject(new BridgeError('E-BRIDGE-BAD-REPLY')) }],
    ['E-STATS-SAVE-FAILED', { saveStats: () => Promise.reject(new StorageError('E-STATS-SAVE-FAILED')) }],
  ])('AC-8021.7 통계 덩어리만 실패로 치는 번호(%s)면 매출 일을 계속하고 마지막에 그 번호를 알린다', async (code, options) => {
    const { log, run } = setup(options)
    await run()
    expect(names(log).filter((name) => name === 'revenue.days')).toHaveLength(3)
    expect(reports(log).at(-1)).toEqual(report(null, null, code, true))
  })

  it.each<[string, Options, string]>([
    ['그 밖 번호', { stream: () => Promise.reject(new BridgeError('E-HELPER-UNKNOWN-COMMAND')) }, 'E-HELPER-UNKNOWN-COMMAND'],
    ['Worker 계산 시간 넘김', { view: () => Promise.reject(new AnalyzeError('E-ANALYZE-TIMEOUT')) }, 'E-ANALYZE-TIMEOUT'],
    ['확인 필요(불완전한 답)', { view: (req) => ({ ...viewOk(req), quality: 'incomplete', months: null, days: null }) }, 'E-BIT-DATA-UNSURE'],
    ['번호 없는 오류(글은 보내지 않음)', { view: () => Promise.reject(new Error('가짜환자 홍길동 차트 12345')) }, 'E-AUTO-UPLOAD'],
  ])('AC-8021.7 %s면 거기서 멈추고 그 번호를 알린다', async (_name, options, code) => {
    const { log, run } = setup(options)
    await run()
    expect(names(log).filter((name) => name === 'revenue.days')).toHaveLength(1)
    expect(names(log)).not.toContain('saveStats')
    expect(reports(log)).toEqual([report(null, null, null, false), report(null, null, code, true)])
    expect(JSON.stringify(log)).not.toContain('홍길동')
  })

  it('AC-8021.7 다 되면 오류 칸을 비운다(마지막 report의 error null)', async () => {
    const { log, run } = setup()
    await run()
    expect(reports(log).every((entry) => (entry as { error: unknown }).error === null)).toBe(true)
  })
})

describe('AC-8021.11 묶음 정의를 다 읽은 뒤 모든 통계 요청에 싣는다', () => {
  it('AC-8021.11 묶음 정의를 다 읽기 전에는 잠금·통로·도우미 요청을 시작하지 않는다', async () => {
    let resolve: (groups: UploadGroups) => void = () => {}
    const groups = new Promise<UploadGroups>((done) => (resolve = done))
    const { log, run } = setup({ groups })
    const done = run()
    await vi.waitFor(() => expect(names(log)).toContain('readGroups'))
    await new Promise((wait) => setTimeout(wait, 10))
    expect(names(log).filter((name) => !READS.includes(name))).toEqual([])
    resolve(GROUPS)
    await done
    expect(names(log)).toContain('stats.rows')
  })

  it('AC-8021.11 처방 묶음과 Block·물리치료 묶음 정의를 모든 통계 요청(옛 조각 포함)에 같이 싣는다', async () => {
    const { run } = setup({ plan: { months: 36, throughDay: null }, groups: { rx: [G1], sunap: SUNAP_DEFS } })
    await run()
    expect(load.mock.calls.length).toBeGreaterThan(1)
    for (const [, req] of load.mock.calls) {
      expect(req.groups).toEqual([G1])
      expect(req.sunap).toEqual(SUNAP_DEFS)
      expect(req.closeToday).toBe(false)
      expect(req.today).toBe(TODAY)
    }
  })

  it('AC-8021.11 묶음 정의 읽기가 실패하면 통계 일은 하지 않고(매출 일은 한다) 그 번호를 알린다', async () => {
    const { log, run } = setup({ groups: new Error('묶음 읽기 실패') })
    await run()
    expect(load).not.toHaveBeenCalled()
    expect(names(log)).not.toContain('stats.rows')
    expect(names(log).filter((name) => name === 'revenue.days')).toHaveLength(3)
    expect(reports(log).at(-1)).toEqual(report(null, null, 'E-STATS-GROUP-READ-FAILED', true))
  })

  it('AC-8021.11 uploadGroupsOf: 처방 묶음은 groupDefs 그대로, 수납일지 Block·물리치료 둘 다 고른 묶음이 있을 때만 sunap', () => {
    const rows: StatsRxGroup[] = [
      { id: 'g-b', name: '가짜 블록', codes: ['BB100'], sortOrder: 1 },
      { id: 'g-a', name: '가짜 처치', codes: ['AA154'], sortOrder: 0 },
      { id: 'g-p', name: '가짜 물리', codes: ['PT100'], sortOrder: 2, out: ['PT900'] },
    ]
    const defs = groupDefs(rows)
    expect(uploadGroupsOf(rows, { blockGroup: 'g-b', ptGroup: 'g-p' })).toEqual({ rx: defs, sunap: { block: defs[1], pt: defs[2] } })
    expect(uploadGroupsOf(rows, { blockGroup: 'g-b', ptGroup: null })).toEqual({ rx: defs, sunap: null })
    expect(uploadGroupsOf(rows, { blockGroup: 'g-b', ptGroup: 'gone' })).toEqual({ rx: defs, sunap: null })
    expect(uploadGroupsOf([], { blockGroup: null, ptGroup: null })).toEqual({ rx: [], sunap: null })
  })
})

describe('AC-8021.1·AC-8024.7 원장 길 · 데스크 길 고르기', () => {
  const accessWith = (plan: MyUploadPlan | null | Error) =>
    ({ readPlan: vi.fn(async () => (plan instanceof Error ? Promise.reject(plan) : plan)) }) as unknown as UploadAccess

  it('AC-8021.1 원장 계획이 줄을 주면 원장 길이고 데스크 계획은 읽지 않는다', async () => {
    const owner = accessWith(PLAN)
    const desk = accessWith(PLAN)
    expect(await pickAccess([owner, desk])).toEqual({ access: owner, plan: PLAN })
    expect(desk.readPlan).not.toHaveBeenCalled()
  })

  it('AC-8024.7 원장 계획이 없고 데스크 계획이 줄을 주면 데스크 길이다', async () => {
    const owner = accessWith(null)
    const desk = accessWith({ months: 12, throughDay: '2026-11-20' })
    expect(await pickAccess([owner, desk])).toEqual({ access: desk, plan: { months: 12, throughDay: '2026-11-20' } })
  })

  it('AC-8021.1 둘 다 없으면 null(승인 전·다른 계정·보는 중), 읽기가 실패하면 거절한다', async () => {
    expect(await pickAccess([accessWith(null), accessWith(null)])).toBeNull()
    await expect(pickAccess([accessWith(new AutoUploadError()), accessWith(PLAN)])).rejects.toBeInstanceOf(AutoUploadError)
  })
})
