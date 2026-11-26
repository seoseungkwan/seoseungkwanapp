// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBitLane } from '@/components/claim/bitLane'
import { ViewingProvider } from '@/components/shell/viewing'
import { resetRunner } from '@/lib/gsheet/runner'
import { fillStatus } from '@/lib/gsheet/status'
import type { HelloResult } from '@/types/bridge'
import { DEFAULT_GSHEET_SETTINGS, type GsheetRun, type GsheetRunInput, type GsheetSettings } from '@/types/gsheet'
import { GoogleSheetAuto } from './GoogleSheetAuto'
import { createSheetAuto, PROBE_MS, SHEET_LOCK, START_DELAY_MS, startSheetAuto, TICK_MS, type SheetAutoDeps } from './sheetAuto'

// 수납 저절로 넣기 — 앱 틀의 보이지 않는 부품(spec google-link REQ-8513 AC-8513.3·AC-8513.4, REQ-8540 AC-8540.1, REQ-8541 AC-8541.2, design.md 11절).
// 한 차례(createSheetAuto().tick)는 가짜 deps로 본다: 서버(설정·기록)·통로 차례(진짜 createBitLane)·확장 통로(가짜 hello·call)·잠금·시각.
// 도우미 답은 design.md 9-2 모양(runner.test.ts와 같은 지어낸 값)이다. 진짜 Supabase·도우미·구글에 붙지 않는다.
// 부품(GoogleSheetAuto)은 저장 함수·Supabase를 가짜로 바꾸고 보는 중·보기 쿠키·멈춤만 본다

const TAG = '0123456789abcdef'
const OTHER_TAG = 'fedcba9876543210'
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbFAKEfakeFAKEfake0123/exec'
const MAIL = 'desk@example.com'
const FILE_ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz_0123456789'
const NOW = new Date('2026-11-26T14:35:00+09:00')
const MINUTE = 60_000

const SETTINGS: GsheetSettings = {
  ...structuredClone(DEFAULT_GSHEET_SETTINGS),
  templateUrl: 'https://docs.google.com/spreadsheets/d/1TemplateTemplateTemplate00/edit',
  hospitalLabel: '샘플정형외과의원',
}
const HELLO_OK: HelloResult = { state: 'ready', helperVersion: '0.14.0', extensionVersion: '0.5.0', helperUpdateAvailable: false }

const statusReply = (secretTag: string | null = TAG) => ({ v: 1, secretTag, bitsheet: false, codeVersion: '8', url: SCRIPT_URL, shareWith: [MAIL], verified: true })
const monthsReply = () => ({ v: 1, version: '8', months: [{ ym: '2026-11', fileId: FILE_ID, gids: { '26': 987654 } }] })
const fillReply = () => ({
  v: 1,
  rows: 12,
  patients: 10,
  added: 3,
  filled: 2,
  overwritten: 0,
  skipped: 0,
  full: false,
  cancelCleared: 0,
  cancelKept: 0,
  freeFixed: 0,
  inserted: 0,
  cleaned: 0,
  shareFailed: 0,
  created: false,
  ratioFixed: 0,
  ratioSkipped: [],
  ratioSkippedCount: 0,
  ratioFailed: false,
  split: 0,
  free: 0,
  paidOnly: 0,
  notes: 0,
  notPut: { noName: 0, unlinked: 0, negative: 0, noChart: 0 },
  fileId: FILE_ID,
  sheetGid: 987654,
  version: '8',
  oldCode: false,
})
const coded = (code: string) => Object.assign(new Error(code), { code })
const run = (over: Partial<GsheetRun>): GsheetRun => ({
  at: NOW.toISOString(),
  day: '2026-11-26',
  via: 'auto',
  mode: 'fillEmpty',
  outcome: 'ok',
  code: null,
  rows: 12,
  counts: {},
  cells: [],
  ...over,
})
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * MINUTE).toISOString()

type Handler = (args: Record<string, unknown>) => unknown
type Over = {
  handlers?: Partial<Record<string, Handler>>
  hello?: HelloResult
  settings?: GsheetSettings
  secretTag?: string | null
  runs?: GsheetRun[]
  viewing?: boolean
  noExtension?: boolean
  noLocks?: boolean
}

/** 가짜 세상 하나: 서버 줄·통로·차례·잠금. sent = 도우미에 간 명령(뒤에서 붙은 통로든 빌린 화면 통로든) */
function world(over: Over = {}) {
  const sent: { cmd: string; args: Record<string, unknown> }[] = []
  const handlers: Record<string, Handler> = {
    'sheet.status': () => statusReply(),
    'sheet.months': () => monthsReply(),
    'sheet.fill': () => fillReply(),
    ...over.handlers,
  } as Record<string, Handler>
  const helper = async (cmd: string, args: Record<string, unknown>) => {
    sent.push({ cmd, args })
    const handler = handlers[cmd]
    if (!handler) throw coded('E-BRIDGE-REJECTED')
    return handler(args)
  }
  const bridge = { hello: vi.fn(async () => over.hello ?? HELLO_OK), call: vi.fn(helper), close: vi.fn() }
  const lane = createBitLane()
  const runs: GsheetRun[] = [...(over.runs ?? [])]
  const added: GsheetRunInput[] = []
  const saved = { settings: over.settings ?? SETTINGS, secretTag: over.secretTag === undefined ? TAG : over.secretTag }
  let clock = NOW
  const lock = { held: false }
  const deps: SheetAutoDeps = {
    viewing: vi.fn(() => over.viewing ?? false),
    loadSettings: vi.fn(async () => saved),
    lastRun: vi.fn(async () => runs.at(-1) ?? null),
    listRuns: vi.fn(async () => [...runs]),
    store: {
      addRun: vi.fn(async (input: GsheetRunInput) => {
        added.push(input)
        runs.push({ ...input, at: clock.toISOString() })
      }),
      upsertMonths: vi.fn(async () => {}),
    },
    borrow: vi.fn(() => lane.borrowScreenCall()),
    enterBackground: vi.fn((stop: () => void) => lane.enterBackground(stop)),
    canConnect: vi.fn(() => !over.noExtension),
    connect: vi.fn(() => bridge),
    locks: over.noLocks
      ? null
      : { request: vi.fn(async (_name: string, _options: { ifAvailable: true }, callback: (lock: unknown) => unknown) => callback(lock.held ? null : { name: SHEET_LOCK })) },
    now: () => clock,
  }
  return {
    deps,
    bridge,
    sent,
    lane,
    added,
    runs,
    saved,
    lock,
    helper,
    fills: () => sent.filter((s) => s.cmd === 'sheet.fill'),
    setNow: (at: Date) => {
      clock = at
    },
  }
}

/** 같은 쪽 화면 하나(통로 차례에 들고 ready면 빌려줌) */
function screen(w: ReturnType<typeof world>, over: { busy?: () => boolean; helperVersion?: string | null; extensionVersion?: string | null } = {}) {
  const onFree = vi.fn()
  w.lane.enterScreen(onFree)
  const call = vi.fn(w.helper)
  const revoke = w.lane.lendScreenCall({
    call,
    busy: over.busy ?? (() => false),
    helperVersion: over.helperVersion === undefined ? '0.14.0' : over.helperVersion,
    extensionVersion: over.extensionVersion === undefined ? '0.5.0' : over.extensionVersion,
  })
  return { call, revoke, onFree }
}

beforeEach(() => {
  fillStatus.reset()
  resetRunner()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  fillStatus.reset()
  resetRunner()
})

describe('GoogleSheetAuto 한 차례: 계획대로 넣기 (AC-8513.3)', () => {
  it('AC-8513.3: 넣는 PC(도우미 비밀 글자 표시 = 서버 secret_tag)면 계획대로 오늘 시트를 저절로 넣고(지문 따름) 기록 한 줄을 남긴다', async () => {
    const w = world()
    await createSheetAuto(w.deps).tick()
    expect(w.sent[0]).toEqual({ cmd: 'sheet.status', args: {} })
    expect(w.fills()).toHaveLength(1)
    expect(w.fills()[0].args).toMatchObject({ day: '2026-11-26', mode: 'fillEmpty', auto: true })
    expect(w.added).toEqual([expect.objectContaining({ day: '2026-11-26', via: 'auto', outcome: 'ok', rows: 12 })])
    expect(fillStatus.get().pc).toBe('filler')
    expect(fillStatus.get().last).toMatchObject({ via: 'auto', outcome: 'ok' })
    expect(w.deps.listRuns).toHaveBeenCalledWith(new Date(NOW.getTime() - 7 * 24 * 60 * MINUTE).toISOString())
  })

  it('AC-8513.3: 지난 날 다시 넣기와 오늘 넣기가 함께 나오면 계획 차례대로(지난 날 먼저) 둘 다 넣는다', async () => {
    // 어제 저절로 넣기가 돌았는데 저녁 마지막 넣기가 없다 → 어제 빈 칸 채우기(지문 무시) + 오늘 간격 확인
    const w = world({ runs: [run({ at: '2026-11-25T10:00:00.000Z', day: '2026-11-25', via: 'auto' })] })
    await createSheetAuto(w.deps).tick()
    expect(w.fills().map((f) => [f.args.day, f.args.auto])).toEqual([
      ['2026-11-25', false],
      ['2026-11-26', true],
    ])
    expect(w.added.map((r) => r.via)).toEqual(['past', 'auto'])
  })

  it(`AC-8513.3: 같은 브라우저의 여러 탭 가운데 한 탭만 넣는다 — navigator.locks '${SHEET_LOCK}' ifAvailable을 못 잡으면 sheet.fill을 부르지 않는다`, async () => {
    const w = world()
    w.lock.held = true
    await createSheetAuto(w.deps).tick()
    expect(w.deps.locks!.request).toHaveBeenCalledWith(SHEET_LOCK, { ifAvailable: true }, expect.any(Function))
    expect(w.fills()).toHaveLength(0)
    expect(w.added).toHaveLength(0)
    w.lock.held = false
    await createSheetAuto(w.deps).tick()
    expect(w.fills()).toHaveLength(1)
  })

  it('AC-8513.3: navigator.locks가 없는 브라우저면 잠금 없이 넣는다', async () => {
    const w = world({ noLocks: true })
    await createSheetAuto(w.deps).tick()
    expect(w.fills()).toHaveLength(1)
  })

  it('AC-8513.3: 서버 마지막 넣기가 (간격 − 1)분 안이면 기록을 더 읽지 않고 건너뛴다(간격 5분 → 4분)', async () => {
    const w = world({ runs: [run({ at: minutesAgo(3.9), via: 'auto' })] })
    const auto = createSheetAuto(w.deps)
    await auto.tick()
    expect(w.deps.listRuns).not.toHaveBeenCalled()
    expect(w.fills()).toHaveLength(0)
    // 4분이 지나면 계획을 본다(계획은 간격 5분이 차지 않아 아직 넣지 않음)
    w.setNow(new Date(NOW.getTime() + 0.2 * MINUTE))
    await auto.tick()
    expect(w.deps.listRuns).toHaveBeenCalledTimes(1)
    expect(w.fills()).toHaveLength(0)
    // 간격이 차면 넣는다
    w.setNow(new Date(NOW.getTime() + 1.2 * MINUTE))
    await auto.tick()
    expect(w.fills()).toHaveLength(1)
  })

  it('AC-8513.3: 넣기를 꺼 두었으면(autoOn 거짓) 넣지 않는다(넣는 PC인지는 정한다)', async () => {
    const w = world({ settings: { ...SETTINGS, autoOn: false } })
    await createSheetAuto(w.deps).tick()
    expect(w.fills()).toHaveLength(0)
    expect(w.deps.listRuns).not.toHaveBeenCalled()
    expect(fillStatus.get().pc).toBe('filler')
  })

  it('AC-8513.3: 도우미 비밀 글자 표시가 서버와 다르면 보기만 PC로 정하고 sheet.fill을 부르지 않는다', async () => {
    const w = world({ handlers: { 'sheet.status': () => statusReply(OTHER_TAG) } })
    await createSheetAuto(w.deps).tick()
    expect(fillStatus.get().pc).toBe('viewer')
    expect(w.fills()).toHaveLength(0)
    expect(w.added).toHaveLength(0)
  })

  it('AC-8513.3: 서버에 넣는 PC 표시(secret_tag)가 없으면 통로에 붙지 않고 보기만 PC로 정한다', async () => {
    const w = world({ secretTag: null })
    await createSheetAuto(w.deps).tick()
    expect(fillStatus.get().pc).toBe('viewer')
    expect(w.deps.connect).not.toHaveBeenCalled()
    expect(w.deps.enterBackground).not.toHaveBeenCalled()
  })

  it('AC-8513.3: 보기만 PC는 다음 차례에 통로를 건드리지 않고, 10분이 지나거나 서버 secret_tag가 바뀌면 다시 묻는다', async () => {
    const w = world({ handlers: { 'sheet.status': () => statusReply(OTHER_TAG) } })
    const auto = createSheetAuto(w.deps)
    await auto.tick()
    expect(w.bridge.hello).toHaveBeenCalledTimes(1)
    await auto.tick()
    expect(w.bridge.hello).toHaveBeenCalledTimes(1)
    w.setNow(new Date(NOW.getTime() + PROBE_MS))
    await auto.tick()
    expect(w.bridge.hello).toHaveBeenCalledTimes(2)
    // 다른 PC에서 [구글에 붙일 코드 복사] → 서버 표시가 이 PC 것으로 바뀜
    w.saved.secretTag = OTHER_TAG
    await auto.tick()
    expect(w.bridge.hello).toHaveBeenCalledTimes(3)
    expect(fillStatus.get().pc).toBe('filler')
    expect(w.fills()).toHaveLength(1)
  })

  it('AC-8513.3: 넣는 PC로 정한 뒤에는 묻기(sheet.status) 없이 넣기만 하고, 넣기가 보기만 PC라고 하면 보기만으로 바꾼다', async () => {
    let tag = TAG
    const w = world({ handlers: { 'sheet.status': () => statusReply(tag) } })
    const auto = createSheetAuto(w.deps)
    await auto.tick()
    expect(fillStatus.get().pc).toBe('filler')
    tag = OTHER_TAG
    w.setNow(new Date(NOW.getTime() + 6 * MINUTE))
    await auto.tick()
    expect(fillStatus.get().pc).toBe('viewer')
    expect(w.fills()).toHaveLength(1)
    // 첫 차례: 묻기 + 넣기 안의 sheet.status 둘, 둘째 차례: 넣기 안의 하나만
    expect(w.sent.filter((s) => s.cmd === 'sheet.status')).toHaveLength(3)
  })

  it('AC-8513.3: 서버 마지막 기록을 상태에 채운다(다른 PC의 넣기 멈춤도 탭 줄에 보이게)', async () => {
    const w = world({ secretTag: null, runs: [run({ at: minutesAgo(2), outcome: 'fail', code: 'E-GSHEET-NET', rows: 0 })] })
    await createSheetAuto(w.deps).tick()
    expect(fillStatus.get().stopped).toMatchObject({ outcome: 'fail', code: 'E-GSHEET-NET' })
  })

  it('AC-8513.3: 보는 중(관리자 보기 쿠키)이면 서버도 통로도 건드리지 않는다', async () => {
    const w = world({ viewing: true })
    await createSheetAuto(w.deps).tick()
    expect(w.deps.loadSettings).not.toHaveBeenCalled()
    expect(w.deps.lastRun).not.toHaveBeenCalled()
    expect(w.deps.borrow).not.toHaveBeenCalled()
    expect(w.deps.connect).not.toHaveBeenCalled()
    expect(fillStatus.get().pc).toBe('unknown')
  })

  it('AC-8513.3: 서버를 읽지 못하면 그 차례는 아무것도 하지 않는다', async () => {
    const w = world()
    vi.mocked(w.deps.loadSettings).mockRejectedValueOnce(new Error('offline'))
    await createSheetAuto(w.deps).tick()
    expect(w.deps.connect).not.toHaveBeenCalled()
    expect(fillStatus.get().pc).toBe('unknown')
  })
})

describe('GoogleSheetAuto 한 차례: 비트 통로 (AC-8513.4)', () => {
  it('AC-8513.4: 같은 쪽 화면이 통로를 빌려주면 그 call로 sheet.* 숫자 명령만 부르고 뒤에서 따로 붙지 않는다', async () => {
    const w = world()
    const s = screen(w)
    await createSheetAuto(w.deps).tick()
    expect(s.call.mock.calls.map(([cmd]) => cmd)).toEqual(['sheet.status', 'sheet.status', 'sheet.months', 'sheet.fill'])
    expect(w.deps.connect).not.toHaveBeenCalled()
    expect(w.bridge.hello).not.toHaveBeenCalled()
    expect(w.added).toHaveLength(1)
    expect(s.onFree).not.toHaveBeenCalled()
  })

  it('AC-8513.4: 쥔 화면이 없으면 뒤에서 붙었다가(enterBackground + 통로 열기) 끝나면 통로를 닫고 차례를 놓는다', async () => {
    const w = world()
    await createSheetAuto(w.deps).tick()
    expect(w.deps.enterBackground).toHaveBeenCalledTimes(1)
    expect(w.deps.connect).toHaveBeenCalledTimes(1)
    expect(w.bridge.hello).toHaveBeenCalledTimes(1)
    expect(w.bridge.close).toHaveBeenCalledTimes(1)
    expect(w.fills()).toHaveLength(1)
    expect(w.lane.enterScreen(vi.fn())).toBe(true)
  })

  it('AC-8513.4: 화면이 통로를 쥐었지만 보내는 중(busy)이거나 아직 빌려주지 않았으면 이번 차례는 건너뛴다(기록 없음)', async () => {
    const w = world()
    let busy = true
    const s = screen(w, { busy: () => busy })
    const auto = createSheetAuto(w.deps)
    await auto.tick()
    expect(s.call).not.toHaveBeenCalled()
    expect(w.deps.connect).not.toHaveBeenCalled()
    expect(w.added).toHaveLength(0)
    s.revoke()
    await auto.tick()
    expect(w.deps.connect).not.toHaveBeenCalled()
    busy = false
    w.lane.lendScreenCall({ call: s.call, busy: () => busy, helperVersion: '0.14.0', extensionVersion: '0.5.0' })
    await auto.tick()
    expect(w.added).toHaveLength(1)
  })

  it('AC-8513.4: 다른 탭이 통로를 쥐어 hello가 busy면 sheet.*를 부르지 않고 기록 없이 다음 차례에 다시 한다', async () => {
    const w = world({ hello: { state: 'busy', helperUpdateAvailable: false } })
    const auto = createSheetAuto(w.deps)
    await auto.tick()
    expect(w.sent).toHaveLength(0)
    expect(w.added).toHaveLength(0)
    expect(fillStatus.get().pc).toBe('unknown')
    expect(w.bridge.close).toHaveBeenCalledTimes(1)
    vi.mocked(w.bridge.hello).mockResolvedValue(HELLO_OK)
    await auto.tick()
    expect(w.fills()).toHaveLength(1)
  })

  it('AC-8513.4: 넣기가 E-BRIDGE-BUSY로 끝나면 실패로 적지 않고 다음 차례에 다시 넣는다', async () => {
    let first = true
    const w = world({
      handlers: {
        'sheet.fill': () => {
          if (!first) return fillReply()
          first = false
          throw coded('E-BRIDGE-BUSY')
        },
      },
    })
    const auto = createSheetAuto(w.deps)
    await auto.tick()
    expect(w.added).toHaveLength(0)
    expect(fillStatus.get().stopped).toBeNull()
    await auto.tick()
    expect(w.fills()).toHaveLength(2)
    expect(w.added).toEqual([expect.objectContaining({ outcome: 'ok' })])
  })

  it('AC-8513.4: 뒤에서 넣는 동안 화면이 붙으려 하면 지금 넣기만 끝내고(남은 일은 다음 차례) 놓은 뒤 화면이 붙는다', async () => {
    let finish: () => void = () => {}
    const w = world({
      runs: [run({ at: '2026-11-25T10:00:00.000Z', day: '2026-11-25', via: 'auto' })],
      handlers: {
        'sheet.fill': () =>
          new Promise((resolve) => {
            finish = () => resolve(fillReply())
          }),
      },
    })
    const ticking = createSheetAuto(w.deps).tick()
    await vi.waitFor(() => expect(w.fills()).toHaveLength(1))
    const onFree = vi.fn()
    expect(w.lane.enterScreen(onFree)).toBe(false)
    expect(onFree).not.toHaveBeenCalled()
    finish()
    await ticking
    expect(w.fills()).toHaveLength(1)
    expect(w.added).toHaveLength(1)
    expect(w.bridge.close).toHaveBeenCalledTimes(1)
    expect(onFree).toHaveBeenCalledTimes(1)
  })

  it('AC-8513.4: 이 브라우저에 확장 통로가 없으면(비트 PC 아님) 붙지 않고 보기만 PC로 정한다', async () => {
    const w = world({ noExtension: true })
    await createSheetAuto(w.deps).tick()
    expect(w.deps.enterBackground).not.toHaveBeenCalled()
    expect(w.deps.connect).not.toHaveBeenCalled()
    expect(fillStatus.get().pc).toBe('viewer')
  })

  it('AC-8513.4: 도우미가 없으면(no-helper) 보기만 PC로 정하고 통로를 닫는다', async () => {
    const w = world({ hello: { state: 'no-helper', helperUpdateAvailable: false } })
    await createSheetAuto(w.deps).tick()
    expect(w.sent).toHaveLength(0)
    expect(fillStatus.get().pc).toBe('viewer')
    expect(w.bridge.close).toHaveBeenCalledTimes(1)
  })
})

describe('GoogleSheetAuto 한 차례: 옛 도우미·옛 확장 (AC-8541.2)', () => {
  it.each([
    ['도우미 0.13.2', { helperVersion: '0.13.2', extensionVersion: '0.5.0' }, { helper: true, extension: false }],
    ['확장 0.4.0', { helperVersion: '0.14.0', extensionVersion: '0.4.0' }, { helper: false, extension: true }],
    ['둘 다 옛 판', { helperVersion: '0.13.2', extensionVersion: '0.4.9' }, { helper: true, extension: true }],
  ])('AC-8541.2: 뒤에서 붙은 통로의 hello가 %s이면 sheet.*를 한 번도 부르지 않고 상태(옛 판)만 알린다', async (_name, versions, old) => {
    const w = world({ hello: { state: 'ready', helperUpdateAvailable: false, ...versions } })
    await createSheetAuto(w.deps).tick()
    expect(w.sent).toHaveLength(0)
    expect(fillStatus.get()).toMatchObject({ pc: 'viewer', oldHelper: old.helper, oldExtension: old.extension })
    expect(w.bridge.close).toHaveBeenCalledTimes(1)
  })

  it('AC-8541.2: 빌린 화면 통로의 판 글자가 옛 판이면(또는 없으면) 화면 call을 부르지 않고 상태만 알린다', async () => {
    const w = world()
    const s = screen(w, { helperVersion: '0.13.2', extensionVersion: '0.5.0' })
    await createSheetAuto(w.deps).tick()
    expect(s.call).not.toHaveBeenCalled()
    expect(fillStatus.get()).toMatchObject({ pc: 'viewer', oldHelper: true, oldExtension: false })
    s.revoke()
    const unknown = world()
    const t = screen(unknown, { helperVersion: null, extensionVersion: null })
    await createSheetAuto(unknown.deps).tick()
    expect(t.call).not.toHaveBeenCalled()
    expect(fillStatus.get()).toMatchObject({ pc: 'viewer', oldHelper: true, oldExtension: true })
  })

  it.each([
    ['update-helper', { helper: true, extension: false }],
    ['update-extension', { helper: false, extension: true }],
  ] as const)('AC-8541.2: hello가 %s(막는 판보다 낮음)이면 sheet.*를 부르지 않고 옛 판으로 알린다', async (state, old) => {
    const w = world({ hello: { state, helperUpdateAvailable: false } })
    await createSheetAuto(w.deps).tick()
    expect(w.sent).toHaveLength(0)
    expect(fillStatus.get()).toMatchObject({ pc: 'viewer', oldHelper: old.helper, oldExtension: old.extension })
  })
})

describe('GoogleSheetAuto 깨기: 30초마다 (AC-8513.3)', () => {
  it(`AC-8513.3: 시작 뒤 ${START_DELAY_MS / 1000}초에 처음 깨고 그 뒤 ${TICK_MS / 1000}초마다 깨며, 멈추면 더 깨지 않는다`, async () => {
    vi.useFakeTimers({ now: NOW })
    const w = world({ secretTag: null })
    const stop = startSheetAuto(w.deps)
    await vi.advanceTimersByTimeAsync(START_DELAY_MS - 1)
    expect(w.deps.loadSettings).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(w.deps.loadSettings).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(TICK_MS)
    expect(w.deps.loadSettings).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(TICK_MS)
    expect(w.deps.loadSettings).toHaveBeenCalledTimes(3)
    stop()
    await vi.advanceTimersByTimeAsync(TICK_MS * 3)
    expect(w.deps.loadSettings).toHaveBeenCalledTimes(3)
  })

  it('AC-8513.3: 앞 차례가 끝나지 않았으면 다음 깨기는 건너뛴다(겹치지 않음)', async () => {
    vi.useFakeTimers({ now: NOW })
    const w = world()
    vi.mocked(w.deps.loadSettings).mockImplementationOnce(() => new Promise(() => {}))
    const stop = startSheetAuto(w.deps)
    await vi.advanceTimersByTimeAsync(START_DELAY_MS + TICK_MS * 3)
    expect(w.deps.loadSettings).toHaveBeenCalledTimes(1)
    stop()
  })

  it('AC-8513.3: 멈춘 뒤에는 하던 차례가 통로를 잡지 않고, 뒤에서 열어 둔 통로는 닫는다', async () => {
    vi.useFakeTimers({ now: NOW })
    let release: () => void = () => {}
    const w = world()
    vi.mocked(w.deps.loadSettings).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ settings: SETTINGS, secretTag: TAG })
        }),
    )
    const stop = startSheetAuto(w.deps)
    await vi.advanceTimersByTimeAsync(START_DELAY_MS)
    stop()
    release()
    await vi.advanceTimersByTimeAsync(0)
    expect(w.deps.connect).not.toHaveBeenCalled()
    expect(w.sent).toHaveLength(0)
  })
})

// ── 부품: 앱 틀이 늘 그린다(아무것도 그리지 않음) ──
const storage = vi.hoisted(() => ({
  loadGsheetSettings: vi.fn(),
  lastGsheetRun: vi.fn(),
  listGsheetRuns: vi.fn(),
  addGsheetRun: vi.fn(),
  upsertGsheetMonths: vi.fn(),
}))
vi.mock('@/lib/storage/gsheet', () => storage)
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => ({ from: () => ({}) }) }))

const VIEW_KEY = '33333333-3333-4333-8333-333333333333'
let cookie = ''

describe('GoogleSheetAuto 부품 (AC-8540.1)', () => {
  beforeEach(() => {
    cookie = ''
    Object.defineProperty(document, 'cookie', { configurable: true, get: () => cookie, set: () => {} })
    vi.stubGlobal('chrome', undefined)
    storage.loadGsheetSettings.mockResolvedValue({ settings: SETTINGS, secretTag: TAG })
    storage.lastGsheetRun.mockResolvedValue(null)
    storage.listGsheetRuns.mockResolvedValue([])
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('AC-8540.1: 아무것도 그리지 않고, 깨면 서버 설정을 읽고 확장 통로가 없는 PC는 보기만으로 정한다', async () => {
    vi.useFakeTimers({ now: NOW })
    const { container } = render(<GoogleSheetAuto />)
    expect(container.innerHTML).toBe('')
    await act(() => vi.advanceTimersByTimeAsync(START_DELAY_MS))
    expect(storage.loadGsheetSettings).toHaveBeenCalledTimes(1)
    expect(fillStatus.get().pc).toBe('viewer')
    expect(container.innerHTML).toBe('')
  })

  it('AC-8540.1: 보는 중(ViewingProvider)이면 아무 일도 하지 않는다', async () => {
    vi.useFakeTimers({ now: NOW })
    render(
      <ViewingProvider viewing={{ hospitalId: '00000000-0000-4000-8000-0000000000d2', name: '가짜다라의원' }}>
        <GoogleSheetAuto />
      </ViewingProvider>,
    )
    await act(() => vi.advanceTimersByTimeAsync(START_DELAY_MS + TICK_MS * 2))
    expect(storage.loadGsheetSettings).not.toHaveBeenCalled()
    expect(fillStatus.get().pc).toBe('unknown')
  })

  it('AC-8540.1: 보기 쿠키가 있으면(앱 틀 뿌리라 ViewingProvider 밖이어도) 아무 일도 하지 않는다', async () => {
    vi.useFakeTimers({ now: NOW })
    cookie = `ssk_view=${VIEW_KEY}`
    render(<GoogleSheetAuto />)
    await act(() => vi.advanceTimersByTimeAsync(START_DELAY_MS + TICK_MS * 2))
    expect(storage.loadGsheetSettings).not.toHaveBeenCalled()
  })

  it('AC-8540.1: 떠나면(로그아웃) 더 깨지 않고 넣기 상태·그날 달 목록 표시를 처음으로 돌린다', async () => {
    vi.useFakeTimers({ now: NOW })
    const { unmount } = render(<GoogleSheetAuto />)
    await act(() => vi.advanceTimersByTimeAsync(START_DELAY_MS))
    expect(fillStatus.get().pc).toBe('viewer')
    unmount()
    expect(fillStatus.get().pc).toBe('unknown')
    await act(() => vi.advanceTimersByTimeAsync(TICK_MS * 3))
    expect(storage.loadGsheetSettings).toHaveBeenCalledTimes(1)
  })
})
