import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_GSHEET_SETTINGS, type GsheetSettings } from '@/types/gsheet'
import { FILL_LIMIT_MS, countsOf, recentMonths, resetRunner, runFill, type RunnerDeps, type RunnerStore } from './runner'
import { fillStatus } from './status'
import type { FillJob } from './shapes'

// 수납 넣기 돌리기(spec google-link REQ-8513, design.md 10-4·11절 1~6). runFill은 받은 call로만 도우미를 부른다(가짜 call이 받은 args를 본다).
// 도우미 쪽(TASK-9·10)은 아직 없으므로 design.md 9-2 명령·답 모양대로 가짜 다리를 둔다.
// 환자 자료 울타리(CLAUDE.md): 넣기 답·기록·달 목록에는 숫자·칸 주소·파일 id·gid만, 코드 주소·메일은 sheet.fill·서버로 가지 않는다.

const TAG = '0123456789abcdef'
const OTHER_TAG = 'fedcba9876543210'
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbFAKEfakeFAKEfake0123/exec'
const MAIL = 'desk@example.com'
const FILE_ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz_0123456789'
const NEW_FILE_ID = '1ZyXwVuTsRqPoNmLkJiHgFeDcBa_9876543210'
const NOW = new Date('2026-11-26T14:35:00+09:00')

const SETTINGS: GsheetSettings = { ...structuredClone(DEFAULT_GSHEET_SETTINGS), templateUrl: 'https://docs.google.com/spreadsheets/d/1TemplateTemplateTemplate00/edit', hospitalLabel: '샘플정형외과의원' }

const AUTO: FillJob = { day: '2026-11-26', mode: 'fillEmpty', via: 'auto', auto: true }
const EVENING: FillJob = { day: '2026-11-26', mode: 'fillEmpty', via: 'evening', auto: false }
const HAND: FillJob = { day: '2026-11-26', mode: 'fillEmpty', via: 'hand', auto: false }
const OVERWRITE: FillJob = { day: '2026-11-20', mode: 'overwrite', via: 'hand', auto: false }

const statusReply = (over: Record<string, unknown> = {}) => ({
  v: 1,
  secretTag: TAG,
  bitsheet: false,
  codeVersion: '8',
  url: SCRIPT_URL,
  shareWith: [MAIL],
  verified: true,
  ...over,
})

const fillReply = (over: Record<string, unknown> = {}) => ({
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
  ratioSkipped: ['23!J9'],
  ratioSkippedCount: 1,
  ratioFailed: false,
  split: 1,
  free: 0,
  paidOnly: 0,
  notes: 2,
  notPut: { noName: 0, unlinked: 0, negative: 0, noChart: 1 },
  fileId: FILE_ID,
  sheetGid: 987654,
  version: '8',
  oldCode: false,
  ...over,
})

const monthsReply = (fileId: string = FILE_ID, ym = '2026-11') => ({
  v: 1,
  version: '8',
  months: [
    { ym, fileId, gids: { '1': 0, '26': 987654 } },
    { ym: '2026-10', fileId: null, gids: {} },
  ],
})

const coded = (code: string) => Object.assign(new Error(code), { code })

type Handler = (args: Record<string, unknown>) => unknown
type Sent = { cmd: string; args: Record<string, unknown> }

function setup(handlers: Partial<Record<string, Handler>> = {}, over: Partial<RunnerDeps> = {}) {
  const sent: Sent[] = []
  const all: Record<string, Handler> = {
    'sheet.status': () => statusReply(),
    'sheet.months': () => monthsReply(),
    'sheet.fill': () => fillReply(),
    ...handlers,
  }
  const call = vi.fn(async (cmd: string, args: Record<string, unknown>) => {
    sent.push({ cmd, args })
    const handler = all[cmd]
    if (!handler) throw coded('E-BRIDGE-REJECTED')
    return handler(args)
  })
  const store = {
    addRun: vi.fn<RunnerStore['addRun']>(async () => undefined),
    upsertMonths: vi.fn<RunnerStore['upsertMonths']>(async () => undefined),
  }
  let now = NOW
  const deps: RunnerDeps = { call, store, now: () => now, settings: SETTINGS, secretTag: TAG, ...over }
  return {
    deps,
    call,
    store,
    sent,
    cmds: () => sent.map((s) => s.cmd),
    argsOf: (cmd: string) => sent.filter((s) => s.cmd === cmd).map((s) => s.args),
    setNow: (next: Date) => {
      now = next
    },
  }
}

/** 어디든(안쪽까지) 그 열쇠가 있나 */
function hasKey(value: unknown, names: readonly string[]): boolean {
  if (typeof value !== 'object' || value === null) return false
  if (Array.isArray(value)) return value.some((item) => hasKey(item, names))
  return Object.entries(value).some(([key, inner]) => names.includes(key) || hasKey(inner, names))
}

beforeEach(() => {
  fillStatus.reset()
  resetRunner()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('AC-8513.1: 받은 call로 sheet.fill — 주소·메일을 넘기지 않음', () => {
  it('AC-8513.1: 받은 call로만 부르고 차례는 sheet.status → (그날 첫 넣기) sheet.months → sheet.fill', async () => {
    const t = setup()
    const out = await runFill(t.deps, AUTO)
    expect(out.kind).toBe('ran')
    expect(t.cmds()).toEqual(['sheet.status', 'sheet.months', 'sheet.fill'])
    expect(t.argsOf('sheet.status')).toEqual([{}])
  })

  it('AC-8513.1: sheet.fill args는 {day, mode, auto, settings}뿐이고 settings는 서버 설정 그대로', async () => {
    const t = setup()
    await runFill(t.deps, AUTO)
    const [args] = t.argsOf('sheet.fill')
    expect(Object.keys(args).sort()).toEqual(['auto', 'day', 'mode', 'settings'])
    expect(args).toEqual({ day: '2026-11-26', mode: 'fillEmpty', auto: true, settings: SETTINGS })
  })

  it('AC-8513.1: sheet.status가 준 코드 주소·메일은 어느 명령 args에도 없다', async () => {
    const t = setup()
    await runFill(t.deps, AUTO)
    const text = JSON.stringify(t.sent)
    expect(text).not.toContain(SCRIPT_URL)
    expect(text).not.toContain(MAIL)
    for (const { args } of t.sent) expect(hasKey(args, ['scriptUrl', 'url', 'shareWith'])).toBe(false)
  })

  it('AC-8513.1: 설정에 주소·메일 열쇠가 섞여 와도(안쪽까지) 빼고 보낸다', async () => {
    const dirty = {
      ...SETTINGS,
      scriptUrl: SCRIPT_URL,
      url: SCRIPT_URL,
      shareWith: [MAIL],
      token: 'secret-secret',
      cols: { ...SETTINGS.cols, url: SCRIPT_URL },
    } as unknown as GsheetSettings
    const t = setup({}, { settings: dirty })
    await runFill(t.deps, AUTO)
    for (const cmd of ['sheet.fill', 'sheet.months']) {
      const [args] = t.argsOf(cmd)
      expect(hasKey(args, ['scriptUrl', 'url', 'shareWith', 'token'])).toBe(false)
      expect(args.settings).toEqual(SETTINGS)
    }
    expect(JSON.stringify(t.sent)).not.toContain(SCRIPT_URL)
  })

  it('AC-8513.1: 저절로(간격 확인)는 지문을 따른다(auto 참), 저녁·지난 날은 받은 그대로(거짓)', async () => {
    const t = setup()
    await runFill(t.deps, AUTO)
    await runFill(t.deps, EVENING)
    await runFill(t.deps, { day: '2026-11-25', mode: 'fillEmpty', via: 'past', auto: false })
    expect(t.argsOf('sheet.fill').map((a) => [a.day, a.auto])).toEqual([
      ['2026-11-26', true],
      ['2026-11-26', false],
      ['2026-11-25', false],
    ])
  })

  it('AC-8513.1: 손 넣기는 지문을 무시한다(force — auto가 참으로 와도 거짓으로 보냄), 덮어쓰기도 그대로', async () => {
    const t = setup()
    await runFill(t.deps, { ...HAND, auto: true })
    await runFill(t.deps, OVERWRITE)
    expect(t.argsOf('sheet.fill').map((a) => [a.day, a.mode, a.auto])).toEqual([
      ['2026-11-26', 'fillEmpty', false],
      ['2026-11-20', 'overwrite', false],
    ])
  })
})

describe('AC-8513.1: 기록은 숫자만(gsheet_runs)', () => {
  it('AC-8513.1: 됨 → 한 줄: 날·길·방식·ok·번호 없음·줄 수·숫자 칸·칸 주소', async () => {
    const t = setup()
    const out = await runFill(t.deps, AUTO)
    expect(t.store.addRun).toHaveBeenCalledTimes(1)
    const [run] = t.store.addRun.mock.calls[0] as [Record<string, unknown>]
    expect(Object.keys(run).sort()).toEqual(['cells', 'code', 'counts', 'day', 'mode', 'outcome', 'rows', 'via'])
    expect(run).toMatchObject({ day: '2026-11-26', via: 'auto', mode: 'fillEmpty', outcome: 'ok', code: null, rows: 12, cells: ['23!J9'] })
    const counts = run.counts as Record<string, unknown>
    for (const value of Object.values(counts)) expect(['number', 'boolean']).toContain(typeof value)
    expect(counts).toMatchObject({ rows: 12, patients: 10, added: 3, filled: 2, split: 1, notes: 2, notPutNoChart: 1, full: false })
    expect(out).toMatchObject({ kind: 'ran', saved: true })
  })

  it('AC-8513.1: 기록·달 목록에는 코드 주소·메일·파일 판 글자가 없다', async () => {
    const t = setup()
    await runFill(t.deps, AUTO)
    const run = t.store.addRun.mock.calls[0][0] as Record<string, unknown>
    expect(JSON.stringify(run)).not.toContain(FILE_ID)
    const stored = JSON.stringify([t.store.addRun.mock.calls, t.store.upsertMonths.mock.calls])
    expect(stored).not.toContain(SCRIPT_URL)
    expect(stored).not.toContain(MAIL)
  })

  it('AC-8513.1: countsOf — 답의 숫자·참거짓 칸(넣지 않음은 notPut…로 펼침), 글자 칸(파일 id·판·칸 주소)은 없음', () => {
    const reply: Record<string, unknown> = fillReply({ created: true, cleaned: 9, ratioFixed: 128, shareFailed: 1 })
    delete reply.v
    const counts = countsOf(reply as never)
    expect(counts).toEqual({
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
      cleaned: 9,
      shareFailed: 1,
      created: true,
      ratioFixed: 128,
      ratioSkippedCount: 1,
      ratioFailed: false,
      split: 1,
      free: 0,
      paidOnly: 0,
      notes: 2,
      notPutNoName: 0,
      notPutUnlinked: 0,
      notPutNegative: 0,
      notPutNoChart: 1,
      oldCode: false,
    })
  })

  it('AC-8513.1: 확인할 것이 있으면(fillWarnings) warn', async () => {
    const t = setup({ 'sheet.fill': () => fillReply({ cancelKept: 1 }) })
    await runFill(t.deps, AUTO)
    expect(t.store.addRun.mock.calls[0][0]).toMatchObject({ outcome: 'warn', code: null })
  })

  it('AC-8513.1: 지문이 같아 보내지 않음 → same · 줄 수만', async () => {
    const t = setup({ 'sheet.fill': () => ({ v: 1, unchanged: true, rows: 12 }) })
    const out = await runFill(t.deps, AUTO)
    expect(t.store.addRun.mock.calls[0][0]).toEqual({
      day: '2026-11-26',
      via: 'auto',
      mode: 'fillEmpty',
      outcome: 'same',
      code: null,
      rows: 12,
      counts: {},
      cells: [],
    })
    expect(out).toMatchObject({ kind: 'ran', done: { outcome: 'same', rows: 12, reply: null } })
  })

  it('AC-8513.1: 도우미 오류 번호 → fail · 그 번호 · 숫자 없음', async () => {
    const t = setup({
      'sheet.fill': () => {
        throw coded('E-GSHEET-NET')
      },
    })
    const out = await runFill(t.deps, HAND)
    expect(t.store.addRun.mock.calls[0][0]).toEqual({
      day: '2026-11-26',
      via: 'hand',
      mode: 'fillEmpty',
      outcome: 'fail',
      code: 'E-GSHEET-NET',
      rows: 0,
      counts: {},
      cells: [],
    })
    expect(out).toMatchObject({ kind: 'ran', done: { outcome: 'fail', code: 'E-GSHEET-NET' } })
  })

  it('AC-8513.1: 번호 없는 오류는 E-GSHEET-FAILED', async () => {
    const t = setup({
      'sheet.fill': () => {
        throw new Error('홍길동 000123')
      },
    })
    await runFill(t.deps, AUTO)
    const run = t.store.addRun.mock.calls[0][0] as Record<string, unknown>
    expect(run.code).toBe('E-GSHEET-FAILED')
    expect(JSON.stringify(run)).not.toContain('홍길동')
  })

  it('AC-8513.1: 모양이 틀린 답(이름이 섞임) → fail E-BRIDGE-BAD-REPLY, 그 글자는 기록·상태에 없다', async () => {
    const t = setup({ 'sheet.fill': () => fillReply({ name: '홍길동', chart: '000123' }) })
    const out = await runFill(t.deps, AUTO)
    const run = t.store.addRun.mock.calls[0][0]
    expect(run).toMatchObject({ outcome: 'fail', code: 'E-BRIDGE-BAD-REPLY', rows: 0 })
    const text = JSON.stringify([run, out, fillStatus.get()])
    expect(text).not.toContain('홍길동')
    expect(text).not.toContain('000123')
  })

  it('AC-8513.1: 다른 탭이 통로를 쥠(E-BRIDGE-BUSY) → 기록 없이 busy, 넣기 멈춤 아님', async () => {
    const t = setup({
      'sheet.fill': () => {
        throw coded('E-BRIDGE-BUSY')
      },
    })
    const out = await runFill(t.deps, AUTO)
    expect(out).toEqual({ kind: 'busy' })
    expect(t.store.addRun).not.toHaveBeenCalled()
    expect(fillStatus.get()).toMatchObject({ filling: null, stopped: null, last: null })
  })

  it('AC-8513.1: 기록을 적지 못해도(오프라인·invalid) 넣기 결과는 상태로 알린다', async () => {
    const t = setup()
    t.store.addRun.mockRejectedValueOnce(Object.assign(new Error('gsheet storage offline'), { kind: 'offline' }))
    const first = await runFill(t.deps, AUTO)
    expect(first).toMatchObject({ kind: 'ran', saved: false, done: { outcome: 'ok' } })
    t.store.addRun.mockResolvedValueOnce('invalid')
    const second = await runFill(t.deps, HAND)
    expect(second).toMatchObject({ kind: 'ran', saved: false })
    expect(fillStatus.get().last).toMatchObject({ via: 'hand', outcome: 'ok' })
  })
})

describe('AC-8513.1: 넣기 상태(fillStatus) 알리기', () => {
  it('AC-8513.1: 넣는 동안 filling = 그 일, 끝나면 last·lastOk·결과 답', async () => {
    let during: unknown = 'not-called'
    const t = setup({
      'sheet.fill': () => {
        during = fillStatus.get().filling
        return fillReply()
      },
    })
    const out = await runFill(t.deps, HAND)
    expect(during).toEqual(HAND)
    const state = fillStatus.get()
    expect(state.filling).toBeNull()
    expect(state.last).toMatchObject({ at: NOW.toISOString(), day: '2026-11-26', via: 'hand', mode: 'fillEmpty', outcome: 'ok', code: null, rows: 12 })
    expect(state.last?.reply).toMatchObject({ patients: 10, added: 3, fileId: FILE_ID })
    expect(state.lastOk).toBe(state.last)
    expect(state.result).toBe(state.last)
    expect(out.kind === 'ran' && out.done).toBe(state.last)
  })

  it('AC-8513.1: 실패하면 넣기 멈춤(stopped)', async () => {
    const t = setup({
      'sheet.fill': () => {
        throw coded('E-GSHEET-KEY')
      },
    })
    await runFill(t.deps, AUTO)
    expect(fillStatus.get().stopped).toMatchObject({ outcome: 'fail', code: 'E-GSHEET-KEY' })
  })

  it('AC-8513.1: 이 쪽에서 다른 넣기가 돌고 있으면 도우미를 부르지 않고 busy', async () => {
    fillStatus.start(EVENING)
    const t = setup()
    const out = await runFill(t.deps, HAND)
    expect(out).toEqual({ kind: 'busy' })
    expect(t.call).not.toHaveBeenCalled()
    expect(fillStatus.get().filling).toEqual(EVENING)
  })

  it('AC-8513.1: 둘을 함께 돌리면 sheet.fill은 하나만 간다', async () => {
    const t = setup()
    const [a, b] = await Promise.all([runFill(t.deps, AUTO), runFill(t.deps, HAND)])
    expect([a.kind, b.kind].sort()).toEqual(['busy', 'ran'])
    expect(t.argsOf('sheet.fill')).toHaveLength(1)
  })
})

describe('AC-8513.1: 120초가 넘으면 실패로 적음', () => {
  it('AC-8513.1: sheet.fill 답이 120초 안에 오지 않으면 fail E-GSHEET-TIMEOUT', async () => {
    vi.useFakeTimers()
    const t = setup({ 'sheet.fill': () => new Promise(() => {}) })
    let out: unknown = null
    void runFill(t.deps, AUTO).then((o) => {
      out = o
    })
    await vi.advanceTimersByTimeAsync(FILL_LIMIT_MS - 1)
    expect(out).toBeNull()
    expect(fillStatus.get().filling).toEqual(AUTO)
    expect(t.store.addRun).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(FILL_LIMIT_MS).toBe(120_000)
    expect(t.store.addRun.mock.calls[0][0]).toMatchObject({ outcome: 'fail', code: 'E-GSHEET-TIMEOUT', rows: 0 })
    expect(out).toMatchObject({ kind: 'ran', done: { outcome: 'fail', code: 'E-GSHEET-TIMEOUT' } })
    expect(fillStatus.get().filling).toBeNull()
  })

  it('AC-8513.1: 도우미 상태 묻기가 멈춰도 120초 뒤 끝난다(넣기는 부르지 않음, 기록 없음)', async () => {
    vi.useFakeTimers()
    const t = setup({ 'sheet.status': () => new Promise(() => {}) })
    let out: unknown = null
    void runFill(t.deps, AUTO).then((o) => {
      out = o
    })
    await vi.advanceTimersByTimeAsync(FILL_LIMIT_MS)
    expect(out).toEqual({ kind: 'unreachable', code: 'E-GSHEET-TIMEOUT' })
    expect(t.cmds()).toEqual(['sheet.status'])
    expect(t.store.addRun).not.toHaveBeenCalled()
  })

  it('AC-8513.1: 120초 안에 오면 됨(타이머는 남지 않음)', async () => {
    vi.useFakeTimers()
    const t = setup({ 'sheet.fill': () => new Promise((resolve) => setTimeout(() => resolve(fillReply()), FILL_LIMIT_MS - 1000)) })
    const run = runFill(t.deps, AUTO)
    await vi.advanceTimersByTimeAsync(FILL_LIMIT_MS - 1000)
    await expect(run).resolves.toMatchObject({ kind: 'ran', done: { outcome: 'ok' } })
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('AC-8513.2: 넣는 PC가 아니면 sheet.fill을 한 번도 부르지 않음', () => {
  it.each([
    ['도우미 비밀 글자 표시가 서버와 다름', statusReply({ secretTag: OTHER_TAG }), TAG],
    ['도우미에 비밀 글자가 없음', statusReply({ secretTag: null }), TAG],
    ['서버에 넣는 PC 표시가 없음', statusReply(), null],
  ])('AC-8513.2: %s → viewer', async (_why, reply, serverTag) => {
    const t = setup({ 'sheet.status': () => reply }, { secretTag: serverTag })
    const out = await runFill(t.deps, AUTO)
    expect(out).toEqual({ kind: 'viewer' })
    expect(t.cmds()).toEqual(['sheet.status'])
    expect(t.store.addRun).not.toHaveBeenCalled()
    expect(t.store.upsertMonths).not.toHaveBeenCalled()
    expect(fillStatus.get()).toMatchObject({ filling: null, last: null, stopped: null })
  })

  it.each([
    ['도우미 없음', 'E-HELPER-MISSING'],
    ['옛 도우미(명령 모름)', 'E-HELPER-UNKNOWN-COMMAND'],
    ['옛 확장(명령표 밖)', 'E-BRIDGE-REJECTED'],
    ['끊김', 'E-BRIDGE-DISCONNECTED'],
  ])('AC-8513.2: %s → unreachable, 넣기·기록 없음', async (_why, code) => {
    const t = setup({
      'sheet.status': () => {
        throw coded(code)
      },
    })
    const out = await runFill(t.deps, HAND)
    expect(out).toEqual({ kind: 'unreachable', code })
    expect(t.cmds()).toEqual(['sheet.status'])
    expect(t.store.addRun).not.toHaveBeenCalled()
  })

  it('AC-8513.2: 상태 답 모양이 틀림 → unreachable E-BRIDGE-BAD-REPLY, 넣기 없음', async () => {
    const t = setup({ 'sheet.status': () => statusReply({ token: 'x' }) })
    expect(await runFill(t.deps, AUTO)).toEqual({ kind: 'unreachable', code: 'E-BRIDGE-BAD-REPLY' })
    expect(t.cmds()).toEqual(['sheet.status'])
  })

  it('AC-8513.2: 상태를 물을 때 통로가 바쁨 → busy', async () => {
    const t = setup({
      'sheet.status': () => {
        throw coded('E-BRIDGE-BUSY')
      },
    })
    expect(await runFill(t.deps, AUTO)).toEqual({ kind: 'busy' })
    expect(t.cmds()).toEqual(['sheet.status'])
  })
})

describe('AC-8513.5: 달 파일 목록 · 새 달 파일 기록', () => {
  it('AC-8513.5: recentMonths — 이번 달부터 지난 12달(13달)', () => {
    expect(recentMonths('2026-11-26')).toEqual([
      '2026-11',
      '2026-10',
      '2026-09',
      '2026-08',
      '2026-07',
      '2026-06',
      '2026-05',
      '2026-04',
      '2026-03',
      '2026-02',
      '2026-01',
      '2025-12',
      '2025-11',
    ])
  })

  it('AC-8513.5: 그날 첫 넣기 전에 13달을 묻고 파일이 있는 달만 gsheet_months에', async () => {
    const t = setup()
    await runFill(t.deps, AUTO)
    expect(t.argsOf('sheet.months')).toEqual([{ settings: SETTINGS, months: recentMonths('2026-11-26') }])
    expect(t.store.upsertMonths).toHaveBeenCalledWith([{ ym: '2026-11', fileId: FILE_ID, gids: { '1': 0, '26': 987654 } }])
  })

  it('AC-8513.5: 같은 날 두 번째 넣기는 달을 다시 묻지 않고, 다음 날 첫 넣기는 다시 묻는다', async () => {
    const t = setup()
    await runFill(t.deps, AUTO)
    await runFill(t.deps, AUTO)
    expect(t.cmds()).toEqual(['sheet.status', 'sheet.months', 'sheet.fill', 'sheet.status', 'sheet.fill'])
    t.setNow(new Date('2026-11-27T08:05:00+09:00'))
    await runFill(t.deps, { ...AUTO, day: '2026-11-27' })
    expect(t.cmds().slice(5)).toEqual(['sheet.status', 'sheet.months', 'sheet.fill'])
  })

  it('AC-8513.5: 달 묻기가 실패해도 넣기는 하고, 다음 넣기 때 다시 묻는다', async () => {
    const t = setup({
      'sheet.months': () => {
        throw coded('E-GSHEET-NET')
      },
    })
    const out = await runFill(t.deps, AUTO)
    expect(out).toMatchObject({ kind: 'ran', done: { outcome: 'ok' } })
    await runFill(t.deps, AUTO)
    expect(t.cmds()).toEqual(['sheet.status', 'sheet.months', 'sheet.fill', 'sheet.status', 'sheet.months', 'sheet.fill'])
    expect(t.store.upsertMonths).not.toHaveBeenCalled()
  })

  it('AC-8513.5: 옛 7판 코드(달 묻기를 모름 E-GSHEET-OLD) → 그날도 넣기 전마다 다시 묻고, 넣기 답 파일 id만 gid 없이 적는다', async () => {
    const t = setup({
      'sheet.months': () => {
        throw coded('E-GSHEET-OLD')
      },
      'sheet.fill': () => fillReply({ oldCode: true, sheetGid: null }),
    })
    const out = await runFill(t.deps, AUTO)
    await runFill(t.deps, AUTO)
    expect(t.cmds()).toEqual(['sheet.status', 'sheet.months', 'sheet.fill', 'sheet.status', 'sheet.months', 'sheet.fill']) // google-link AC-8546.2
    expect(t.store.upsertMonths).toHaveBeenCalledWith([{ ym: '2026-11', fileId: FILE_ID, gids: {} }])
    expect(out).toMatchObject({ kind: 'ran', done: { outcome: 'warn' } })
  })

  it('AC-8513.5: 새 달 파일을 만든 넣기 → 만든 여부·지운 칸·고친 비율 식·공유 못 한 메일 수를 기록에, 달 목록을 다시 받는다', async () => {
    let monthsAsked = 0
    let filled = 0
    const t = setup({
      'sheet.months': () => (++monthsAsked === 1 ? monthsReply(FILE_ID) : monthsReply(NEW_FILE_ID, '2026-12')), // google-link AC-8546.1
      // 새 파일은 첫 넣기에서만 만든다
      'sheet.fill': () => fillReply({ created: ++filled === 1, cleaned: 9, ratioFixed: 128, shareFailed: 1, fileId: NEW_FILE_ID }),
    })
    t.setNow(new Date('2026-12-01T09:05:00+09:00'))
    await runFill(t.deps, { ...AUTO, day: '2026-12-01' })
    expect(t.cmds()).toEqual(['sheet.status', 'sheet.months', 'sheet.fill', 'sheet.months'])
    expect(t.argsOf('sheet.months')[1]).toEqual({ settings: SETTINGS, months: recentMonths('2026-12-01') })
    const run = t.store.addRun.mock.calls[0][0] as { counts: Record<string, unknown> }
    expect(run.counts).toMatchObject({ created: true, cleaned: 9, ratioFixed: 128, shareFailed: 1 })
    expect(t.store.upsertMonths).toHaveBeenLastCalledWith([{ ym: '2026-12', fileId: NEW_FILE_ID, gids: { '1': 0, '26': 987654 } }]) // google-link AC-8546.1
    // 다시 받은 뒤 같은 날 다음 넣기는 묻지 않는다
    await runFill(t.deps, { ...AUTO, day: '2026-12-01' })
    expect(t.cmds().slice(4)).toEqual(['sheet.status', 'sheet.fill'])
  })

  it('AC-8513.5: 새 달 뒤 달 목록 다시 받기가 실패하면 다음 넣기 때 다시 묻는다(넣기 결과는 그대로 ok)', async () => {
    let monthsAsked = 0
    const t = setup({
      'sheet.months': () => {
        monthsAsked += 1
        if (monthsAsked === 2) throw coded('E-GSHEET-NET')
        return monthsReply()
      },
      'sheet.fill': () => fillReply({ created: true }),
    })
    const out = await runFill(t.deps, AUTO)
    expect(out).toMatchObject({ kind: 'ran', done: { outcome: 'ok' } })
    await runFill(t.deps, AUTO)
    expect(t.cmds().slice(4)).toEqual(['sheet.status', 'sheet.months', 'sheet.fill', 'sheet.months'])
  })

  it('AC-8513.5: 달 답 모양이 틀리면 gsheet_months에 적지 않는다', async () => {
    const t = setup({ 'sheet.months': () => ({ ...monthsReply(), name: '홍길동' }) })
    const out = await runFill(t.deps, AUTO)
    expect(out).toMatchObject({ kind: 'ran' })
    expect(t.store.upsertMonths).not.toHaveBeenCalled()
  })

  it('AC-8513.5: 달 목록을 적지 못해도(저장 실패) 넣기는 한다', async () => {
    const t = setup()
    t.store.upsertMonths.mockRejectedValueOnce(new Error('gsheet storage failed'))
    const out = await runFill(t.deps, AUTO)
    expect(out).toMatchObject({ kind: 'ran', saved: true, done: { outcome: 'ok' } })
  })
})

describe('AC-8546: 달 목록은 이번 달 파일 id가 든 답을 받은 날만 잠근다', () => {
  // 운영에서 옛 구글 코드일 때 저절로 넣기가 돌아 그날 달 목록이 잠기고, 새 코드로 바꾼 뒤에도 F5 전까지 '파일 없음'이던 일
  const twice = async (t: ReturnType<typeof setup>) => {
    await runFill(t.deps, AUTO)
    await runFill(t.deps, AUTO)
  }
  const ASKED_TWICE = ['sheet.status', 'sheet.months', 'sheet.fill', 'sheet.status', 'sheet.months', 'sheet.fill']

  it('AC-8546.1: 첫 달 목록 답에 이번 달 파일이 없음(지난달만) → 다음 넣기 전에 다시 묻고, 받은 달은 적는다', async () => {
    const t = setup({ 'sheet.months': () => monthsReply(FILE_ID, '2026-10') })
    await twice(t)
    expect(t.cmds()).toEqual(ASKED_TWICE)
    expect(t.store.upsertMonths).toHaveBeenCalledWith([{ ym: '2026-10', fileId: FILE_ID, gids: { '1': 0, '26': 987654 } }])
  })

  it('AC-8546.1: 이번 달 칸은 있지만 파일 id가 없음 → 다음 넣기 전에 다시 묻는다', async () => {
    const t = setup({ 'sheet.months': () => ({ v: 1, version: '8', months: [{ ym: '2026-11', fileId: null, gids: {} }] }) })
    await twice(t)
    expect(t.cmds()).toEqual(ASKED_TWICE)
    expect(t.store.upsertMonths).not.toHaveBeenCalled()
  })

  it('AC-8546.1: 이번 달이 없던 답 뒤 새 코드가 이번 달 파일 id를 주면 그때부터 그날은 다시 묻지 않는다', async () => {
    let asked = 0
    const t = setup({ 'sheet.months': () => (++asked === 1 ? monthsReply(FILE_ID, '2026-10') : monthsReply(NEW_FILE_ID)) })
    await twice(t)
    await runFill(t.deps, AUTO)
    expect(t.cmds()).toEqual([...ASKED_TWICE, 'sheet.status', 'sheet.fill'])
    expect(t.store.upsertMonths).toHaveBeenLastCalledWith([{ ym: '2026-11', fileId: NEW_FILE_ID, gids: { '1': 0, '26': 987654 } }])
  })

  it('AC-8546.1: 이번 달 파일 id가 든 답 → 그날은 다시 묻지 않는다', async () => {
    const t = setup()
    await twice(t)
    expect(t.cmds()).toEqual(['sheet.status', 'sheet.months', 'sheet.fill', 'sheet.status', 'sheet.fill'])
  })

  it('AC-8546.2: 옛 코드(E-GSHEET-OLD) → 넣기마다 다시 묻고, 넣기는 그대로 되며 넣기 답 파일 id만 gid 없이 적는다', async () => {
    const t = setup({
      'sheet.months': () => {
        throw coded('E-GSHEET-OLD')
      },
      'sheet.fill': () => fillReply({ oldCode: true, sheetGid: null }),
    })
    const outs = [await runFill(t.deps, AUTO), await runFill(t.deps, AUTO), await runFill(t.deps, HAND)]
    expect(t.argsOf('sheet.months')).toHaveLength(3)
    expect(t.argsOf('sheet.fill')).toHaveLength(3)
    for (const out of outs) expect(out).toMatchObject({ kind: 'ran', done: { outcome: 'warn' } })
    expect(t.store.upsertMonths.mock.calls).toEqual([
      [[{ ym: '2026-11', fileId: FILE_ID, gids: {} }]],
      [[{ ym: '2026-11', fileId: FILE_ID, gids: {} }]],
      [[{ ym: '2026-11', fileId: FILE_ID, gids: {} }]],
    ])
  })

  it('AC-8546.2: 옛 코드였다가 새 코드로 바꾸면 F5 없이 다음 넣기에서 이번 달 파일 id를 받아 적는다', async () => {
    let newCode = false
    const t = setup({
      'sheet.months': () => {
        if (!newCode) throw coded('E-GSHEET-OLD')
        return monthsReply(NEW_FILE_ID)
      },
      'sheet.fill': () => fillReply({ oldCode: !newCode, sheetGid: newCode ? 987654 : null }),
    })
    await runFill(t.deps, AUTO)
    newCode = true
    await runFill(t.deps, HAND)
    expect(t.cmds()).toEqual(ASKED_TWICE)
    expect(t.store.upsertMonths).toHaveBeenLastCalledWith([{ ym: '2026-11', fileId: NEW_FILE_ID, gids: { '1': 0, '26': 987654 } }])
  })

  it.each([
    ['읽지 못한 답', () => ({ ...monthsReply(), name: '홍길동' })],
    [
      '다른 오류',
      () => {
        throw coded('E-GSHEET-KEY')
      },
    ],
    [
      '번호 없는 오류',
      () => {
        throw new Error('boom')
      },
    ],
  ])('AC-8546.2: %s → 잠그지 않아 다음 넣기 전에 다시 묻는다', async (_why, months) => {
    const t = setup({ 'sheet.months': months })
    await twice(t)
    expect(t.cmds()).toEqual(ASKED_TWICE)
  })

  it("AC-8546.2: 넣기 답이 '바뀐 것 없음'이어도 따로 묻지 않고 다음 넣기 때 다시 묻는다", async () => {
    const t = setup({
      'sheet.months': () => monthsReply(FILE_ID, '2026-10'),
      'sheet.fill': () => ({ v: 1, unchanged: true, rows: 12 }),
    })
    await twice(t)
    expect(t.cmds()).toEqual(ASKED_TWICE)
  })

  it('AC-8546.3: resetRunner()가 그날 잠금을 푼다', async () => {
    const t = setup()
    await runFill(t.deps, AUTO)
    await runFill(t.deps, AUTO)
    resetRunner()
    await runFill(t.deps, AUTO)
    expect(t.cmds()).toEqual(['sheet.status', 'sheet.months', 'sheet.fill', 'sheet.status', 'sheet.fill', 'sheet.status', 'sheet.months', 'sheet.fill'])
  })
})
