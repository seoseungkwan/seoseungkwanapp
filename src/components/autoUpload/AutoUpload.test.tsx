// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enterScreen, leaveScreen } from '@/components/claim/bitLane'
import { ViewingProvider } from '@/components/shell/viewing'
import type { DateRange } from '@/types/dates'
import type { DayPayload, MonthPayload } from '@/types/payload'
import type { StatsLoaded } from '@/types/stats'
import { AutoUpload, START_DELAY_MS } from './AutoUpload'

// 저절로 올리기 — 앱 틀 자리(spec admin-view REQ-8021 AC-8021.1·AC-8024.7, design.md '저절로 올리기 — 돌리기').
// 진짜 Supabase·도우미·Worker에 붙지 않는다: supabaseBrowser·connectScreenBridge·createStatsWorker·requestLoad를 가짜로 바꾸고
// 어느 함수·표를 불렀는지만 본다. 날짜·숫자·요양기관번호는 지어낸 값이다

vi.setConfig({ testTimeout: 60_000 })

type Role = 'owner' | 'desk' | 'none'
type Sent = { kind: 'rpc'; name: string; args: unknown } | { kind: 'from'; name: string; op: string }

const { supabaseBrowser, connectScreenBridge, createStatsWorker, requestLoad, world } = vi.hoisted(() => {
  const world = { role: 'owner' as 'owner' | 'desk' | 'none', sent: [] as Sent[], bridges: 0 }
  const PLAN = [{ months: 2, through_day: null }]
  const rpcData = (name: string): unknown => {
    if (name === 'my_auto_upload_plan') return world.role === 'owner' ? PLAN : []
    if (name === 'desk_upload_plan') return world.role === 'desk' ? PLAN : []
    if (name === 'claim_auto_upload' || name === 'desk_claim_upload') return true
    if (name.startsWith('desk_') && name.includes('marks')) return []
    if (name === 'desk_stats_coverage') return []
    return null
  }
  // 진짜 빌더처럼 사슬로 부르고 await할 때 답한다
  const chain = (reply: () => unknown) => {
    const query: Record<string, unknown> = {}
    for (const method of ['select', 'gte', 'lte', 'order', 'range', 'eq']) query[method] = () => query
    query.maybeSingle = () => Promise.resolve({ data: null, error: null, status: 200 })
    query.then = (ok: (value: unknown) => unknown, bad: (reason: unknown) => unknown) =>
      Promise.resolve({ data: reply(), error: null, status: 200 }).then(ok, bad)
    return query
  }
  const client = {
    rpc: (name: string, args?: unknown) => {
      world.sent.push({ kind: 'rpc', name, args })
      return chain(() => rpcData(name))
    },
    from: (name: string) => ({
      select: () => {
        world.sent.push({ kind: 'from', name, op: 'select' })
        return chain(() => [])
      },
      upsert: () => {
        world.sent.push({ kind: 'from', name, op: 'upsert' })
        return chain(() => null)
      },
      insert: () => {
        world.sent.push({ kind: 'from', name, op: 'insert' })
        return chain(() => null)
      },
    }),
  }
  const supabaseBrowser = vi.fn(() => client)
  const connectScreenBridge = vi.fn(() => {
    world.bridges += 1
    return {
      hello: vi.fn(async () => ({ state: 'ready', helperVersion: '0.13.2', extensionVersion: '0.1.0', helperUpdateAvailable: false })),
      call: vi.fn(async (command: string, args: { from: string; to: string }) => {
        if (command === 'bit.check') return { steps: [{ name: 'find', ok: true }], registered: true, institutionCode: '19990001' }
        const days: unknown[] = []
        for (let day = new Date(`${args.from}T00:00:00Z`); day <= new Date(`${args.to}T00:00:00Z`); day.setUTCDate(day.getUTCDate() + 1)) {
          days.push({ date: day.toISOString().slice(0, 10), unconfirmed: false })
        }
        return { days, codes: [], dayCodes: [] }
      }),
      stream: vi.fn(async () => ({ id: 's-1', count: 1 })),
      close: vi.fn(),
    }
  })
  const createStatsWorker = vi.fn(() => ({ postMessage: vi.fn(), terminate: vi.fn() }))
  const requestLoad = vi.fn()
  return { supabaseBrowser, connectScreenBridge, createStatsWorker, requestLoad, world }
})
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser }))
vi.mock('@/lib/bridge/workerSink', () => ({ connectScreenBridge }))
vi.mock('@/workers/statsClient', () => ({ createStatsWorker, requestLoad }))

const KEY = '33333333-3333-4333-8333-333333333333'
// 비트 답(가짜): 읽은 기간의 끝 날 줄과 10월 달 줄 하나. 숫자는 저장 검사를 지나는 가장 작은 값이다
const dayRow = (day: string) =>
  ({
    schemaVersion: 2,
    quality: 'valid',
    day,
    partial: false,
    totals: { patients: 1, newPatients: 1, returning: 0, unknown: 0 },
    rx: [],
    groups: [],
    revisit: { cohort: 0, within7: 0, within14: 0, within30: 0, after30: 0 },
  }) as unknown as DayPayload
const monthRow = (month: string) =>
  ({
    schemaVersion: 2,
    quality: 'valid',
    month,
    partial: false,
    totals: { patients: 1, newPatients: 1, returning: 0, unknown: 0 },
    rx: [],
    groups: [],
    revisit: { cohort: 0, within7: 0, within14: 0, within30: 0, after30: 0 },
    regions: [],
  }) as unknown as MonthPayload
const view = (_worker: unknown, req: DateRange): StatsLoaded => ({
  range: { from: req.from, to: req.to },
  covered: { from: req.from, to: req.to },
  quality: 'valid',
  checks: { noChart: 0, duplicate: 0, noFirst: 0 },
  months: [monthRow('2026-10')],
  days: [dayRow(req.to)],
  report: { daily: [], monthly: [] },
})

let cookie = ''
let visibility: DocumentVisibilityState = 'visible'
let consoleSpies: ReturnType<typeof vi.spyOn>[] = []

function as(role: Role) {
  world.role = role
}
const rpcNames = () => world.sent.filter((call) => call.kind === 'rpc').map((call) => call.name)
const tablesTouched = () => world.sent.filter((call) => call.kind === 'from').map((call) => `${call.name}.${(call as { op: string }).op}`)

async function opened(ui = <AutoUpload />) {
  const result = render(ui)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(START_DELAY_MS)
  })
  return result
}
// 저절로 올리기는 기다리는 시계가 없다(가짜 통로·Worker는 바로 답한다). 남은 약속이 다 풀리게 몇 번 돌린다
async function settled() {
  await act(async () => {
    for (let i = 0; i < 50; i++) await Promise.resolve()
    await vi.advanceTimersByTimeAsync(0)
    for (let i = 0; i < 50; i++) await Promise.resolve()
  })
}
async function untilReport(done = true) {
  await vi.waitFor(
    () => {
      const reports = world.sent.filter((call) => call.kind === 'rpc' && (call.name === 'report_auto_upload' || call.name === 'desk_report_upload'))
      expect(reports.some((call) => (call as { args: { p_done: boolean } }).args.p_done === done)).toBe(true)
    },
    { timeout: 30_000, interval: 10 },
  )
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  world.sent = []
  world.bridges = 0
  as('owner')
  cookie = ''
  visibility = 'visible'
  Object.defineProperty(document, 'cookie', { configurable: true, get: () => cookie, set: () => {} })
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
  ;(globalThis as { chrome?: unknown }).chrome = { runtime: {} }
  requestLoad.mockReset()
  requestLoad.mockImplementation(async (worker: unknown, req: DateRange) => view(worker, req))
  connectScreenBridge.mockClear()
  createStatsWorker.mockClear()
  supabaseBrowser.mockClear()
  consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((name) => vi.spyOn(console, name))
})

afterEach(() => {
  cleanup()
  // 확인 창·알림·console은 없다
  for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled()
  vi.restoreAllMocks()
  vi.useRealTimers()
  delete (globalThis as { chrome?: unknown }).chrome
})

describe('AC-8021.1 AutoUpload — 아무것도 그리지 않고, 조건이 다 참일 때만 돈다', () => {
  it('AC-8021.1 빈 자리를 그린다(글·요소 없음)', async () => {
    const { container } = await opened()
    expect(container.innerHTML).toBe('')
    await untilReport()
    expect(container.innerHTML).toBe('')
  })

  it('AC-8021.1 연 뒤 15초 전에는 아무것도 부르지 않고, 15초가 지나면 계획을 읽는다', async () => {
    render(<AutoUpload />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(START_DELAY_MS - 1)
    })
    expect(world.sent).toEqual([])
    expect(supabaseBrowser).not.toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    await vi.waitFor(() => expect(rpcNames()[0]).toBe('my_auto_upload_plan'))
    await untilReport()
  })

  it('AC-8021.1 15초 전에 앱 틀을 떠나면 아무것도 부르지 않는다', async () => {
    const { unmount } = render(<AutoUpload />)
    unmount()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(START_DELAY_MS * 2)
    })
    await settled()
    expect(world.sent).toEqual([])
  })

  it('AC-8021.1 보는 중(useReadOnly 참)이면 아무것도 부르지 않는다', async () => {
    await opened(
      <ViewingProvider viewing={{ hospitalId: '22222222-2222-4222-8222-222222222222', name: '다라 정형외과의원' }}>
        <AutoUpload />
      </ViewingProvider>,
    )
    await settled()
    expect(world.sent).toEqual([])
    expect(connectScreenBridge).not.toHaveBeenCalled()
  })

  it('AC-8021.1 보기 쿠키가 있으면 아무것도 부르지 않는다', async () => {
    cookie = `ssk_view=${KEY}`
    await opened()
    await settled()
    expect(world.sent).toEqual([])
    expect(connectScreenBridge).not.toHaveBeenCalled()
  })

  it('AC-8021.1 탭이 숨어 있으면 보일 때까지 기다린 뒤에 돈다', async () => {
    visibility = 'hidden'
    await opened()
    await settled()
    expect(world.sent).toEqual([])
    visibility = 'visible'
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await vi.waitFor(() => expect(rpcNames()[0]).toBe('my_auto_upload_plan'))
    await untilReport()
  })

  it('AC-8021.1 확장 통로(chrome.runtime)가 없는 PC면 계획도 읽지 않는다', async () => {
    delete (globalThis as { chrome?: unknown }).chrome
    await opened()
    await settled()
    expect(world.sent).toEqual([])
    expect(connectScreenBridge).not.toHaveBeenCalled()
  })

  it('AC-8021.1 원장 계획·데스크 계획이 둘 다 없으면(승인 전·다른 계정) 그 둘만 읽고 도우미에 붙지 않는다', async () => {
    as('none')
    await opened()
    await vi.waitFor(() => expect(rpcNames()).toEqual(['my_auto_upload_plan', 'desk_upload_plan']))
    await settled()
    expect(rpcNames()).toEqual(['my_auto_upload_plan', 'desk_upload_plan'])
    expect(tablesTouched()).toEqual([])
    expect(connectScreenBridge).not.toHaveBeenCalled()
  })
})

describe('AC-8021.1·AC-8024.7 원장 길 · 데스크 길', () => {
  it('AC-8021.1 원장이면 지금 읽기·저장 길로 올린다(데스크 함수는 부르지 않는다)', async () => {
    await opened()
    await untilReport()
    const names = rpcNames()
    expect(names[0]).toBe('my_auto_upload_plan')
    expect(names).toContain('claim_auto_upload')
    expect(names.filter((name) => name === 'save_revenue_range')).toHaveLength(3)
    expect(names.some((name) => name.startsWith('desk_'))).toBe(false)
    expect(tablesTouched()).toEqual(expect.arrayContaining(['sales_days.select', 'stats_coverage.select', 'stats_days.select', 'stats_months.select']))
    expect(tablesTouched()).toEqual(expect.arrayContaining(['stats_months.upsert', 'stats_days.upsert', 'stats_coverage.insert']))
    expect(connectScreenBridge).toHaveBeenCalledTimes(1)
    expect(createStatsWorker).toHaveBeenCalledTimes(1)
    expect(connectScreenBridge.mock.calls[0]).toEqual([{ runtime: {}, worker: createStatsWorker.mock.results[0].value }])
    // 받은 요양기관번호는 어디로도 보내지 않는다(표시만)
    expect(JSON.stringify(world.sent)).not.toContain('19990001')
  })

  it('AC-8024.7 데스크면 같은 차례를 데스크 함수로 하고, 매출·통계 값을 읽거나 표에 쓰는 부르기는 하나도 없다', async () => {
    as('desk')
    await opened()
    await untilReport()
    const names = rpcNames()
    expect(names.slice(0, 2)).toEqual(['my_auto_upload_plan', 'desk_upload_plan'])
    expect(names.slice(2, 6).sort()).toEqual(['desk_sales_marks', 'desk_stats_coverage', 'desk_stats_day_marks', 'desk_stats_month_marks'])
    expect(names).toContain('desk_claim_upload')
    expect(names.filter((name) => name === 'desk_save_revenue_range')).toHaveLength(3)
    expect(names).toEqual(expect.arrayContaining(['desk_upsert_stats_months', 'desk_upsert_stats_days', 'desk_add_stats_coverage', 'desk_report_upload']))
    for (const owner of ['claim_auto_upload', 'report_auto_upload', 'save_revenue_range']) expect(names).not.toContain(owner)
    // 표는 묶음 정의 둘(데스크가 지금도 읽는 표)만 읽는다
    expect([...new Set(tablesTouched())].sort()).toEqual(['stats_rx_groups.select', 'sunap_settings.select'])
  })
})

describe('AC-8021.8 비트 화면이 통로를 쥐고 있으면 그만두지 않고, 풀리면 다시 해 본다', () => {
  // 앱이 쓰는 진짜 차례 하나(bitLane 모듈)에 화면을 붙였다 뗀다. 시험마다 붙인 화면은 다 뗀다
  const screens: (() => void)[] = []
  const screenOn = () => {
    const onFree = () => {}
    expect(enterScreen(onFree)).toBe(true)
    screens.push(onFree)
    return () => {
      const at = screens.indexOf(onFree)
      if (at >= 0) screens.splice(at, 1)
      leaveScreen(onFree)
    }
  }
  afterEach(() => {
    for (const onFree of screens.splice(0)) leaveScreen(onFree)
  })
  const claims = () => rpcNames().filter((name) => name === 'claim_auto_upload').length
  const reportsDone = () =>
    world.sent.filter((call) => call.kind === 'rpc' && call.name === 'report_auto_upload' && (call as { args: { p_done: boolean } }).args.p_done).length
  const wait = async (ms: number) => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms)
    })
    await settled()
  }

  it('AC-8021.8 15초에 화면이 통로를 쓰는 중이면 붙지 않고, 그 화면이 열려 있는 동안은 다시 하지 않는다', async () => {
    screenOn()
    await opened()
    await settled()
    expect(rpcNames()[0]).toBe('my_auto_upload_plan')
    expect(connectScreenBridge).not.toHaveBeenCalled()
    const sent = world.sent.length
    await wait(START_DELAY_MS * 10)
    expect(world.sent.length).toBe(sent)
    expect(connectScreenBridge).not.toHaveBeenCalled()
  })

  it('AC-8021.8 그 화면이 떠나면 15초 뒤 그날 할 일을 다시 해 끝까지 올린다', async () => {
    const leave = screenOn()
    await opened()
    await settled()
    expect(connectScreenBridge).not.toHaveBeenCalled()
    leave()
    await wait(START_DELAY_MS - 1)
    expect(connectScreenBridge).not.toHaveBeenCalled()
    await wait(1)
    await untilReport()
    expect(connectScreenBridge).toHaveBeenCalledTimes(1)
    expect(claims()).toBe(1)
    expect(reportsDone()).toBe(1)
  })

  it('AC-8021.8 화면이 둘이면 둘 다 떠나야 다시 하고, 탭을 옮겨 한 화면이 떠나며 다른 화면이 붙으면 풀린 것이 아니다', async () => {
    const leaveA = screenOn()
    const leaveB = screenOn()
    await opened()
    await settled()
    leaveA()
    await wait(START_DELAY_MS * 2)
    expect(connectScreenBridge).not.toHaveBeenCalled()
    // 탭 옮김: B가 떠나는 같은 차례에 C가 붙는다
    leaveB()
    const leaveC = screenOn()
    await wait(START_DELAY_MS * 2)
    expect(connectScreenBridge).not.toHaveBeenCalled()
    leaveC()
    await wait(START_DELAY_MS)
    await untilReport()
    expect(connectScreenBridge).toHaveBeenCalledTimes(1)
  })

  it('AC-8021.8 풀릴 때 탭이 숨어 있으면 보일 때까지 기다린다(보이는 중 조건 그대로)', async () => {
    const leave = screenOn()
    await opened()
    await settled()
    visibility = 'hidden'
    leave()
    await wait(START_DELAY_MS * 3)
    expect(connectScreenBridge).not.toHaveBeenCalled()
    visibility = 'visible'
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await untilReport()
    expect(connectScreenBridge).toHaveBeenCalledTimes(1)
  })

  it('AC-8021.8 15초를 기다리는 동안 다른 화면이 다시 쥐면 그때도 붙지 않고, 그 화면이 떠난 뒤 다시 해 본다', async () => {
    const leave = screenOn()
    await opened()
    await settled()
    leave()
    await wait(START_DELAY_MS / 2)
    const leaveAgain = screenOn()
    await wait(START_DELAY_MS)
    expect(connectScreenBridge).not.toHaveBeenCalled()
    leaveAgain()
    await wait(START_DELAY_MS)
    await untilReport()
    expect(connectScreenBridge).toHaveBeenCalledTimes(1)
  })

  it('AC-8021.8 기다리는 동안 앱 틀을 떠나면 화면이 떠나도 다시 하지 않는다', async () => {
    const leave = screenOn()
    const { unmount } = await opened()
    await settled()
    const sent = world.sent.length
    unmount()
    leave()
    await wait(START_DELAY_MS * 3)
    expect(world.sent.length).toBe(sent)
    expect(connectScreenBridge).not.toHaveBeenCalled()
  })

  it('AC-8021.8 그날 일을 다 올린 뒤에는 화면이 붙었다 떠나도 다시 돌지 않는다(한 번에 하나, 끝난 날은 다시 안 함)', async () => {
    await opened()
    await untilReport()
    expect(connectScreenBridge).toHaveBeenCalledTimes(1)
    const sent = world.sent.length
    const leave = screenOn()
    await wait(START_DELAY_MS)
    leave()
    await wait(START_DELAY_MS * 3)
    expect(world.sent.length).toBe(sent)
    expect(connectScreenBridge).toHaveBeenCalledTimes(1)
  })
})

describe('AC-8021.1 앱 틀', () => {
  it('AC-8021.1 AppShell이 <AutoUpload />를 늘 한 번 그린다', () => {
    const source = readFileSync(join(process.cwd(), 'src/components/shell/AppShell.tsx'), 'utf8')
    expect(source.match(/<AutoUpload \/>/g)).toHaveLength(1)
    expect(source).toContain("import { AutoUpload } from '@/components/autoUpload/AutoUpload'")
  })
})
