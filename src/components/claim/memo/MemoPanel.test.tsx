// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BridgeError } from '@/lib/bridge/protocol'
import type { ErrorCode } from '@/types/errors'
import type { ClaimView, ClaimVisitView, InputResultView, MemoScreenView, MemoTableRow, PrecheckFromScreen, PrecheckToScreen, StuckView, TargetRow } from '@/types/precheck'
import { claimChannel } from '../claimLoad'
import { ClaimScreen } from '../ClaimScreen'

// 메모 칸(REQ-018). 가짜 통로·가짜 Worker로 청구 화면을 처음부터 지나 메모 확인까지 간다. 이름·번호는 지어낸 것이다. 실제 Worker·확장·도우미·브라우저는 없다

const db = vi.hoisted(() => ({ hospital: null as unknown, failSettings: false, reads: 0, gate: null as Promise<void> | null }))
/** 메모 보기를 번호로 거절한다(Worker의 ok:false) */
const memoAnswer = { fail: null as ErrorCode | null }

vi.mock('@/lib/supabase/browser', () => ({
  supabaseBrowser: () => ({
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: 'user-1' } } }, error: null }) },
    from(table: string) {
      if (table === 'claim_hospital_settings') db.reads += 1
      const answer = () => {
        if (table === 'claim_day_counts') return { data: [], error: null, status: 200 }
        if (db.failSettings) return { data: null, error: { message: 'x' } }
        return table === 'claim_rule_settings' ? { data: [], error: null } : { data: db.hospital, error: null }
      }
      const read = () => (db.gate && table !== 'claim_day_counts' ? db.gate.then(answer) : Promise.resolve(answer()))
      const query = { gte: () => query, lte: () => query, maybeSingle: read, then: (ok: (value: unknown) => unknown, no: (reason: unknown) => unknown) => read().then(ok, no) }
      return { select: () => query }
    },
  }),
}))

const PERIOD = { from: '2026-10-28', to: '2026-10-29' }
const row = (key: string, over: Partial<TargetRow> = {}): TargetRow => ({ key, date: '2026-10-28', text: `우리 메모 ${key}`, hasMemo: true, unfinished: false, compare: '비트에 없음', chart: `9${key}`, name: `가상환자${key}`, rx: ['LA358'], rxNames: ['가상시술 가'], warned: false, chartLines: [{ kind: 'subj', text: `가상 증상 ${key}` }], rxRows: [{ kind: 'proc', code: 'LA358', name: '가상시술 가', short: '', qty: 1, benefit: true }], sameDay: 1, foundByPc: false, chip: '새 메모', ...over })
const tableRow = (key: string, over: Partial<MemoTableRow> = {}): MemoTableRow => ({ key, date: '2026-10-28', text: `우리 메모 ${key}`, hasMemo: true, unfinished: false, compare: '비트에 없음', chart: `9${key}`, name: `가상환자${key}`, rxNames: ['가상시술 가'], edited: false, missing: [], done: false, unsaved: false, afterEntry: false, ...over })
const memoView = (over: Partial<MemoScreenView> = {}): MemoScreenView => ({
  period: PERIOD,
  memoBlocked: null,
  noAsk: false,
  targets: { problem: null, range: PERIOD, code: 'LA358', batch: [row('a'), row('b')], left: [], chips: [{ code: 'LA358', name: '가상시술 가', count: 2 }], typedOverChip: false, replacing: 0 },
  table: [tableRow('a'), tableRow('b')],
  stuck: null,
  bit: { has: true, count: 2, period: PERIOD },
  ...over,
})
const finding = () => []
const visit = (key: string): ClaimVisitView => ({ key, chart: `9${key}`, date: '2026-10-28', name: `가상환자${key}`, findings: finding(), skippedNoHistory: 0, skippedNoDx: 0, checked: 1, memo: null, rx: ['가상시술 가'], dxNow: [], dx: { visitKey: key, missingDx: false, needsCheck: false, issues: [], recommendations: [] } })
const VIEW: ClaimView = { period: PERIOD, hasDx: true, enabledRules: 1, memoBlocked: null, totals: { checked: 2, hi: 0, mid: 0, lo: 0, patients: 0, historySkips: 0 }, groups: [], visits: [visit('a'), visit('b')] }
const REGISTERED = { steps: [{ name: 'find', ok: true }, { name: 'db', ok: true }, { name: 'registration', ok: true }], registered: true, institutionCode: '12345678' }
const inputResult = (over: Partial<InputResultView> = {}): InputResultView => ({ status: 'finished', code: null, reason: null, fields: [], done: [], check: [], skipped: [], uncounted: 0, retry: 0, entered: 0, left: 0, firstNoAsk: null, ...over })

type Listener = (event: Event) => void
function fakeWorker(screenView: () => MemoScreenView, claim: ClaimView = VIEW) {
  const listeners = new Set<Listener>()
  const posted: PrecheckFromScreen[] = []
  const emit = (data: PrecheckToScreen) => {
    for (const fn of listeners) fn({ data } as unknown as Event)
  }
  const reply = (m: PrecheckFromScreen): PrecheckToScreen | null => {
    switch (m.type) {
      case 'month':
        return { type: 'month', id: m.id, load: m.load, ok: true, visits: 2, months: ['2026-10'] }
      case 'loadPart':
        return { type: 'loadPart', part: m.part, id: m.id, load: m.load, ok: true, ...('run' in m ? { run: m.run } : {}) } as PrecheckToScreen
      case 'check':
        return { type: 'check', check: m.check, load: m.load, ok: true, view: claim, usedCopy: null }
      case 'memoView':
        return memoAnswer.fail ? { type: 'memoView', ask: m.ask, ok: false, code: memoAnswer.fail } : { type: 'memoView', ask: m.ask, ok: true, view: screenView() }
      case 'buildInputBatch':
        return { type: 'inputStart', run: m.run, ok: true, count: 2, askPc: !screenView().noAsk || m.what === 'byHand' }
      default:
        return null
    }
  }
  return {
    posted,
    emit,
    of: <T extends PrecheckFromScreen['type']>(type: T) => posted.filter((m) => m.type === type) as Extract<PrecheckFromScreen, { type: T }>[],
    postMessage(message: unknown) {
      const m = message as PrecheckFromScreen
      posted.push(m)
      const answer = reply(m)
      if (answer) queueMicrotask(() => emit(answer))
    },
    addEventListener(type: string, fn: Listener) {
      if (type === 'message') listeners.add(fn)
    },
  }
}

const progress = { fn: null as null | ((p: { id: string; done: number; total: number }) => void) }

function bridge(over: { memos?: () => Promise<{ id: string; count: number }>; store?: (args: Record<string, unknown>) => Promise<{ id: string; count: number }> } = {}) {
  let next = 0
  const stream = vi.fn((cmd: string, args: unknown) => {
    if (cmd === 'claim.memos' && over.memos) return over.memos()
    if (cmd === 'store.load' && over.store) return over.store(args as Record<string, unknown>)
    return Promise.resolve({ id: `${cmd}-${++next}`, count: 1 })
  })
  const call = vi.fn((cmd: string) => Promise.resolve(cmd === 'bit.check' ? REGISTERED : { days: [{ date: '2026-10-28', visits: 2, memoInBit: 0 }] }))
  const onProgress = vi.fn((fn: (p: { id: string; done: number; total: number }) => void) => {
    progress.fn = fn
    return () => {
      progress.fn = null
    }
  })
  return { stream, call, onProgress }
}

async function toMemo(view: (() => MemoScreenView) | MemoScreenView = memoView(), link = bridge(), claim: ClaimView = VIEW) {
  const worker = fakeWorker(typeof view === 'function' ? view : () => view, claim)
  const channel = claimChannel(worker)
  const made = render(<ClaimScreen channel={channel} call={link.call as never} stream={link.stream as never} onProgress={link.onProgress as never} />)
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: '자료 불러오기' }))
  await user.click(await screen.findByRole('button', { name: '다음: 메모 확인' }))
  await screen.findByRole('region', { name: '입력 방식' })
  return { worker, channel, link, user, ...made }
}
const inputButton = (n = 2) => screen.getByRole('button', { name: `비트에 입력 (${n}명)` }) as HTMLButtonElement
const lastRun = (worker: ReturnType<typeof fakeWorker>) => worker.of('buildInputBatch').at(-1)!.run
const done = async (worker: ReturnType<typeof fakeWorker>, result: InputResultView) => {
  await waitFor(() => expect(worker.of('buildInputBatch').length).toBeGreaterThan(0))
  await act(async () => worker.emit({ type: 'inputDone', run: lastRun(worker), ok: true, result }))
}
const STUCK: StuckView = { people: [{ key: 's1', state: 'known', date: '2026-10-28', month: '2026-10', name: '가상환자쓰다', chart: '9001', rxNames: ['가상시술 가'], reason: null, text: '글', sameDay: 1 }], canContinue: true, canByHand: true, big: true, loadRange: null, note: null }

beforeEach(() => {
  db.hospital = null
  db.failSettings = false
  db.reads = 0
  db.gate = null
  memoAnswer.fail = null
  progress.fn = null
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('AC-018.1 메모 칸', () => {
  it('AC-018.1: 입력 방식 칸과 목록 아래에 메모 표가 있고 비교가 보이며 체크가 없다', async () => {
    await toMemo(memoView({ table: [tableRow('a', { compare: '다름', inBit: '비트 글' }), tableRow('b')] }))
    const table = screen.getByRole('table', { name: '메모' })
    expect(within(table).getByRole('textbox', { name: '가상환자a 메모' })).toBeTruthy()
    expect(within(table).getByText('다름')).toBeTruthy()
    expect(within(table).getByText('비트에 없음')).toBeTruthy()
    expect(within(table).queryByRole('checkbox')).toBeNull()
  })

  it('AC-018.1: 아직 입력 안 된 것만 거를 수 있다', async () => {
    const { user } = await toMemo(memoView({ table: [tableRow('a', { done: true, compare: '같음' }), tableRow('b')] }))
    const table = screen.getByRole('table', { name: '메모' })
    expect(within(table).getByText('가상환자a')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '아직 입력 안 된 것만' }))
    expect(within(table).queryByText('가상환자a')).toBeNull()
    expect(within(table).getByText('가상환자b')).toBeTruthy()
  })

  it('AC-018.2: 고치면 1초 뒤 Worker에 보내고, 저장 실패면 오류와 [다시 저장]을 보이며 값을 그대로 둔다', async () => {
    const { user, worker } = await toMemo()
    const box = within(screen.getByRole('table', { name: '메모' })).getByRole('textbox', { name: '가상환자a 메모' }) as HTMLTextAreaElement
    await user.type(box, '더')
    await waitFor(() => expect(worker.of('editMemo')).toEqual([{ type: 'editMemo', visitKey: 'a', text: '우리 메모 a더' }]), { timeout: 2000 })
    await act(async () => worker.emit({ type: 'memoSave', ok: false, code: 'E-STORE-FAILED', blocked: false }))
    expect(screen.getByRole('alert').textContent).toContain('오류 번호 E-STORE-FAILED')
    expect(box.value).toBe('우리 메모 a더')
    await user.click(screen.getByRole('button', { name: '다시 저장' }))
    expect(worker.of('memoSaveRetry')).toHaveLength(1)
    await act(async () => worker.emit({ type: 'memoSave', ok: true }))
    expect(screen.queryByRole('button', { name: '다시 저장' })).toBeNull()
  })
})

describe('AC-018.2 메모 표의 칸과 Worker의 글', () => {
  it('AC-014.11: 고쳤다 되돌린 칸은 [다시 점검]으로 자동 메모가 달라지면 새 글을 보인다(보내지 않을 글을 표에 남기지 않는다)', async () => {
    db.hospital = { phrases: {}, dx_links: [] }
    let current = memoView()
    const { user, worker } = await toMemo(() => current)
    const box = () => within(screen.getByRole('table', { name: '메모' })).getByRole('textbox', { name: '가상환자a 메모' }) as HTMLTextAreaElement
    await user.type(box(), '더')
    await user.type(box(), '{Backspace}')
    await user.tab()
    expect(box().value).toBe('우리 메모 a')
    db.hospital = { phrases: { changed: true }, dx_links: [] }
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })
    const recheck = await screen.findByRole('button', { name: '다시 점검' })
    current = memoView({ table: [tableRow('a', { text: '새 자동 메모 a' }), tableRow('b')] })
    await user.click(recheck)
    await waitFor(() => expect(worker.of('check')).toHaveLength(2))
    await waitFor(() => expect(box().value).toBe('새 자동 메모 a'))
  })

  it('AC-018.21: 메모 보기를 받지 못하면 준비 중에 멈추지 않고 오류와 [다시 불러오기]다', async () => {
    memoAnswer.fail = 'E-CLAIM-PARTIAL'
    const worker = fakeWorker(() => memoView())
    const link = bridge()
    render(<ClaimScreen channel={claimChannel(worker)} call={link.call as never} stream={link.stream as never} onProgress={link.onProgress as never} />)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '자료 불러오기' }))
    await user.click(await screen.findByRole('button', { name: '다음: 메모 확인' }))
    expect((await screen.findByRole('alert')).textContent).toContain('오류 번호 E-CLAIM-PARTIAL')
    expect(screen.queryByText('메모를 준비하는 중이에요…')).toBeNull()
    memoAnswer.fail = null
    const before = worker.of('loadStart').length
    await user.click(screen.getByRole('button', { name: '다시 불러오기' }))
    await waitFor(() => expect(worker.of('loadStart')).toHaveLength(before + 1))
  })

  it('AC-018.21: 보던 목록이 있을 때 다시 묻기가 실패하면 목록 위에 오류와 [다시 불러오기]를 보이고, 성공하면 사라진다', async () => {
    let current = memoView()
    const { user } = await toMemo(() => current)
    memoAnswer.fail = 'E-CLAIM-PARTIAL'
    await user.click(screen.getByRole('radio', { name: /날짜별/ }))
    expect((await screen.findByRole('alert')).textContent).toContain('오류 번호 E-CLAIM-PARTIAL')
    expect(screen.getByRole('button', { name: '다시 불러오기' })).toBeTruthy()
    expect(screen.getByRole('table', { name: '메모' })).toBeTruthy()
    memoAnswer.fail = null
    current = memoView()
    await user.click(screen.getByRole('radio', { name: /처방코드별/ }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })
})

describe('AC-018.3 [비트에 입력]', () => {
  it('AC-018.3: 단추 옆 글: 꺼짐', async () => {
    await toMemo()
    expect(inputButton().disabled).toBe(false)
    expect(screen.getByText('누르면 PC 화면에 확인 창이 떠요. 거기서 [확인]을 눌러야 들어가요.')).toBeTruthy()
  })

  it('AC-018.3: 단추 옆 글: 꺼져 있어도 바뀌는 사람이 있으면 잇는다', async () => {
    const view = memoView()
    view.targets.replacing = 2
    await toMemo(view)
    expect(screen.getByText('누르면 PC 화면에 확인 창이 떠요. 거기서 [확인]을 눌러야 들어가요. 다른 메모 2명은 우리 메모로 바뀌고, 원래 메모는 기록에 남아요.')).toBeTruthy()
  })

  it('AC-018.3: 단추 옆 글: 켜져 있고 바뀌는 사람이 없으면 잇지 않는다', async () => {
    await toMemo(memoView({ noAsk: true }))
    expect(screen.getByText('누르면 PC 확인 창 없이 바로 시작해요.')).toBeTruthy()
  })

  it('AC-018.3: 단추 옆 글: 켜짐이고 바뀌는 사람이 있으면 잇는다', async () => {
    const view = memoView({ noAsk: true })
    view.targets.replacing = 1
    await toMemo(view)
    expect(screen.getByText('누르면 PC 확인 창 없이 바로 시작해요. 다른 메모 1명은 우리 메모로 바뀌고, 원래 메모는 기록에 남아요.')).toBeTruthy()
  })

  it('AC-018.3: 누른 뒤 확인 기다리는 중 안내와 묶음의 수가 보이고, 진행이 오면 숫자가 되며 화면에 이름이 없다', async () => {
    const { user, worker } = await toMemo()
    await user.click(inputButton())
    const wait = await screen.findByRole('status', { name: '입력 진행' })
    expect(wait.textContent).toContain('확인 기다리는 중')
    expect(wait.textContent).toContain('PC 화면의 확인 창에서 [확인]을 눌러 주세요')
    expect(wait.textContent).toContain('[취소]를 누르거나 창을 닫거나 5분이 지나면 아무것도 넣지 않아요.')
    expect(wait.textContent).toContain('0 / 2명')
    expect(wait.textContent).toContain('다른 탭으로 옮겨도 입력은 PC에서 계속돼요. 결과는 끝난 뒤 [자료 불러오기]를 누르면 메모 표에 보여요.')
    expect(worker.of('buildInputBatch').at(-1)).toMatchObject({ what: 'selection' })
    await act(async () => progress.fn?.({ id: 'x', done: 1, total: 3 }))
    const run = screen.getByRole('status', { name: '입력 진행' })
    expect(run.textContent).toContain('입력 중')
    expect(run.textContent).toContain('1 / 3명')
    expect(run.textContent).toContain('다른 탭으로 옮겨도 입력은 PC에서 계속돼요. 결과는 끝난 뒤 [자료 불러오기]를 누르면 메모 표에 보여요.')
    expect(run.textContent).not.toContain('가상환자')
    expect(run.textContent).not.toContain('지금:')
  })

  it('AC-018.3: 묻지 않기가 켜져 있으면 바로 입력 중이다', async () => {
    const { user } = await toMemo(memoView({ noAsk: true }))
    await user.click(inputButton())
    const run = await screen.findByRole('status', { name: '입력 진행' })
    expect(run.textContent).toContain('입력 중')
    expect(run.textContent).toContain('0 / 2명')
  })

  it('AC-018.8: 입력 중에는 방식을 바꿀 수 없다', async () => {
    const { user } = await toMemo()
    await user.click(inputButton())
    expect(await screen.findByText('입력이 끝난 뒤 입력 방식을 바꿔 주세요')).toBeTruthy()
  })

  it('AC-018.26: 고르면 누르기 전에 다시 물어 목록이 바뀐다', async () => {
    let current = memoView()
    const { user, worker } = await toMemo(() => current)
    current = memoView({ targets: { ...memoView().targets, batch: [row('z')] } })
    await user.click(screen.getByRole('radio', { name: /날짜별/ }))
    await screen.findByRole('button', { name: '비트에 입력 (1명)' })
    expect(worker.of('memoView').at(-1)?.selection).toMatchObject({ mode: 'date' })
    expect(screen.getByRole('button', { name: /가상환자z/ })).toBeTruthy()
  })

  it('AC-018.23: 0명이면 흐리고 눌러도 부르지 않고 안내를 다시 보인다', async () => {
    const view = memoView()
    view.targets = { ...view.targets, batch: [], problem: '지금 입력할 수 있는 사람이 없어요. 아래 빠지는 이유를 확인해 주세요.', left: [{ reason: 'unread', rows: [row('a', { chip: null })] }] }
    const { user, worker } = await toMemo(view)
    const button = inputButton(0)
    expect(button.getAttribute('aria-disabled')).toBe('true')
    await user.click(button)
    expect(worker.of('buildInputBatch')).toEqual([])
    expect(screen.getAllByText('지금 입력할 수 있는 사람이 없어요. 아래 빠지는 이유를 확인해 주세요.').length).toBeGreaterThan(0)
  })

  it.each([
    ['설정 변경 띠', { stale: true, stuck: false, blocked: false }, '[다시 점검]을 누른 뒤에 눌러 주세요.'],
    ['쓰다 멈춘 사람', { stale: false, stuck: true, blocked: false }, '쓰다 멈춘 사람을 먼저 확인해 주세요.'],
    ['기관기호 안내', { stale: false, stuck: false, blocked: true }, '저장이 막혀 있는 동안에는 입력할 수 없어요.'],
    ['셋이 겹치면 기관기호 안내', { stale: true, stuck: true, blocked: true }, '저장이 막혀 있는 동안에는 입력할 수 없어요.'],
    ['둘이 겹치면 쓰다 멈춘 사람', { stale: true, stuck: true, blocked: false }, '쓰다 멈춘 사람을 먼저 확인해 주세요.'],
  ])('AC-018.3: 막힌 까닭의 옆 글: %s', async (_, { stale, stuck, blocked }, text) => {
    db.hospital = { phrases: {}, dx_links: [] }
    const link = bridge(blocked ? { store: (args) => (args.months ? Promise.reject(new BridgeError('E-BIT-HOSPITAL-MISMATCH')) : Promise.resolve({ id: 'copy', count: 1 })) } : {})
    const { user } = await toMemo(memoView({ stuck: stuck ? STUCK : null }), link)
    if (stale) {
      db.hospital = { phrases: { changed: true }, dx_links: [] }
      await act(async () => {
        window.dispatchEvent(new Event('focus'))
      })
      await screen.findByRole('button', { name: '다시 점검' })
    }
    expect(screen.getByText(text)).toBeTruthy()
    expect(inputButton().disabled).toBe(true)
    void user
  })

  it('design 6-5: [비트에 입력] 직전에 설정을 다시 읽어 바뀌었으면 보내지 않고 띠를 띄운다. [다시 점검] 뒤 다시 눌린다', async () => {
    db.hospital = { phrases: {}, dx_links: [] }
    const { user, worker } = await toMemo()
    db.hospital = { phrases: { changed: true }, dx_links: [] }
    await user.click(inputButton())
    const recheck = await screen.findByRole('button', { name: '다시 점검' })
    expect(worker.of('buildInputBatch')).toEqual([])
    expect(inputButton().disabled).toBe(true)
    await user.click(recheck)
    await waitFor(() => expect(worker.of('check')).toHaveLength(2))
    await waitFor(() => expect(screen.queryByRole('button', { name: '다시 점검' })).toBeNull())
    expect(screen.getByRole('region', { name: '입력 방식' })).toBeTruthy()
    await waitFor(() => expect(inputButton().disabled).toBe(false))
  })

  it('design 6-5: 설정 변경 띠는 화면 맨 위에 있고 메모 칸과 점검 결과 둘 다에 있다', async () => {
    db.hospital = { phrases: {}, dx_links: [] }
    const { user, container } = await toMemo()
    db.hospital = { phrases: { changed: true }, dx_links: [] }
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })
    const band = (await screen.findByRole('button', { name: '다시 점검' })).closest('[role=status]')!
    const panel = screen.getByRole('region', { name: '입력 방식' })
    expect(band.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /점검 결과/ }))
    expect(screen.getByRole('button', { name: '다시 점검' })).toBeTruthy()
    void container
  })
})

describe('AC-018.3 두 번 누르기', () => {
  it('AC-018.3: 설정을 다시 읽는 사이 또 눌러도 묶음은 한 번만 시킨다', async () => {
    const { user, worker } = await toMemo()
    let release = () => {}
    db.gate = new Promise((resolve) => {
      release = resolve
    })
    const button = inputButton()
    await user.click(button)
    await user.click(button)
    db.gate = null
    await act(async () => release())
    await screen.findByRole('status', { name: '입력 진행' })
    expect(worker.of('buildInputBatch')).toHaveLength(1)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('AC-018.2 저장하지 못한 글', () => {
  it('AC-018.2: 저장 실패 뒤 [자료 불러오기]를 해도 고친 글을 지키라고 Worker에 알린다', async () => {
    const { user, worker } = await toMemo()
    await act(async () => worker.emit({ type: 'memoSave', ok: false, code: 'E-STORE-FAILED', blocked: false }))
    await user.click(screen.getByRole('button', { name: /날짜 고르기/ }))
    await user.click(await screen.findByRole('button', { name: '자료 불러오기' }))
    await screen.findByRole('button', { name: '다음: 메모 확인' })
    expect(worker.of('loadStart').at(-1)).toMatchObject({ keepEdits: true })
  })

  it('AC-018.2: [멈추기]를 눌러도 고친 글을 지키라고 Worker에 알린다', async () => {
    const hold = new Promise<{ id: string; count: number }>(() => {})
    const { user, worker } = await toMemo(memoView(), (() => {
      const link = bridge()
      const original = link.stream.getMockImplementation()!
      let calls = 0
      link.stream.mockImplementation((cmd: string, args: unknown) => {
        if (cmd === 'claim.month' && ++calls === 2) return hold
        return original(cmd, args)
      })
      return link
    })())
    await user.click(screen.getByRole('button', { name: /날짜 고르기/ }))
    await user.click(await screen.findByRole('button', { name: '자료 불러오기' }))
    await user.click(await screen.findByRole('button', { name: '멈추기' }))
    expect(worker.of('loadStart').at(-1)).toMatchObject({ keepEdits: true })
  })
})

describe('AC-018.4 취소', () => {
  it('AC-018.4: 취소면 입력 방식으로 돌아가 위 띠에 안내한다', async () => {
    const { user, worker } = await toMemo()
    await user.click(inputButton())
    await screen.findByRole('status', { name: '입력 진행' })
    await done(worker, inputResult({ status: 'cancelled' }))
    expect(await screen.findByText('입력하지 않았어요')).toBeTruthy()
    expect(screen.getByText('비트에는 아무것도 들어가지 않았어요.')).toBeTruthy()
    expect(screen.getByRole('region', { name: '입력 방식' })).toBeTruthy()
    expect(screen.queryByText(/묻지 않기는 켜지지 않았어요/)).toBeNull()
  })

  it('AC-018.21: 결과가 다 오지 않으면 E-CLAIM-PARTIAL과 [다시 불러오기]다', async () => {
    const { user, worker } = await toMemo()
    await user.click(inputButton())
    await screen.findByRole('status', { name: '입력 진행' })
    await act(async () => worker.emit({ type: 'inputDone', run: lastRun(worker), ok: false, code: 'E-CLAIM-PARTIAL' }))
    expect((await screen.findByRole('alert')).textContent).toContain('오류 번호 E-CLAIM-PARTIAL')
    expect(screen.getByRole('button', { name: '다시 불러오기' })).toBeTruthy()
  })

  it('AC-018.4: 끝나면 입력 방식 칸과 목록이 접히고 [입력 방식으로 돌아가기]가 있다', async () => {
    const { user, worker } = await toMemo()
    await user.click(inputButton())
    await screen.findByRole('status', { name: '입력 진행' })
    await done(worker, inputResult({ done: [{ key: 'a', date: '2026-10-28', month: '2026-10', name: '가상환자a', chart: '9a', result: '완료', reason: '입력', memo: '글', retry: false }] }))
    await screen.findByRole('button', { name: '입력 방식으로 돌아가기' })
    expect(screen.queryByRole('region', { name: '입력 방식' })).toBeNull()
    await user.click(screen.getByRole('button', { name: '입력 방식으로 돌아가기' }))
    expect(screen.getByRole('region', { name: '입력 방식' })).toBeTruthy()
  })
})

describe('AC-018.12 확인 표시 알림', () => {
  const marked = (batch: TargetRow[]) => {
    const view = memoView()
    view.targets = { ...view.targets, batch, left: [{ reason: 'mark', rows: [row('m1', { unfinished: true, chip: null }), row('m2', { unfinished: true, chip: null })] }] }
    return view
  }

  it('AC-018.12: 누르면 몇 명·누구인지 알리고 [빼고 N명 입력]·[먼저 고치기]·[닫기]가 있다', async () => {
    const { user, worker } = await toMemo(marked([row('a')]))
    await user.click(inputButton(1))
    const dialog = screen.getByRole('dialog', { name: '메모에 확인 표시가 남은 사람이 2명 있어요' })
    expect(dialog.textContent).toContain('가상환자m1, 가상환자m2')
    expect(dialog.textContent).toContain('메모에 확인 표시가 남아 있으면 비트에 넣지 않아요. 고치면 다시 들어가요.')
    expect(worker.of('buildInputBatch')).toEqual([])
    await user.click(within(dialog).getByRole('button', { name: '빼고 1명 입력' }))
    expect(worker.of('buildInputBatch')).toHaveLength(1)
  })

  it('AC-018.12: [먼저 고치기]는 첫 환자의 칸을 열고 입력하지 않는다', async () => {
    const { user, worker } = await toMemo(marked([row('a')]))
    await user.click(inputButton(1))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '먼저 고치기' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('textbox', { name: '가상환자m1 메모 고치기' })).toBeTruthy()
    expect(worker.of('buildInputBatch')).toEqual([])
  })

  it('AC-018.12·AC-018.23: 남는 사람이 없으면 [빼고 N명 입력]이 없다. 8명을 넘으면 나머지는 수로 적는다', async () => {
    const view = memoView()
    view.targets = { ...view.targets, batch: [], left: [{ reason: 'mark', rows: Array.from({ length: 10 }, (_, i) => row(`m${i}`, { unfinished: true, chip: null })) }] }
    const { user } = await toMemo(view)
    await user.click(inputButton(0))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).queryByRole('button', { name: /빼고/ })).toBeNull()
    expect(dialog.textContent).toContain('외 2명')
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: '먼저 고치기' }))
  })

  it('AC-018.12: 남는 사람이 있으면 [빼고 N명 입력]에 초점이 간다', async () => {
    const { user } = await toMemo(marked([row('a')]))
    await user.click(inputButton(1))
    expect(document.activeElement).toBe(within(screen.getByRole('dialog')).getByRole('button', { name: '빼고 1명 입력' }))
  })
})

describe('AC-018.16 쓰다 멈춘 사람', () => {
  const stuck = (over: Partial<StuckView> = {}) => memoView({ stuck: { ...STUCK, ...over } })

  it('AC-018.16: 띠에 제목·수·안내와 두 단추가 있고 [비트에 입력]이 막힌다', async () => {
    await toMemo(stuck())
    const band = screen.getByRole('region', { name: '쓰다 멈춘 사람' })
    expect(band.textContent).toContain('1명')
    expect(band.textContent).toContain('비트에서 이 환자의 메모 칸을 직접 확인해 주세요')
    expect(band.textContent).toContain('가상환자쓰다')
    expect((within(band).getByRole('button', { name: '이어서 입력' }) as HTMLButtonElement).disabled).toBe(false)
    expect(inputButton().disabled).toBe(true)
  })

  it('AC-018.16: 두 단추의 묶음을 시킨다', async () => {
    const { user, worker } = await toMemo(stuck())
    await user.click(within(screen.getByRole('region', { name: '쓰다 멈춘 사람' })).getByRole('button', { name: '직접 확인했어요' }))
    await waitFor(() => expect(worker.of('buildInputBatch').at(-1)).toMatchObject({ what: 'byHand' }))
    await done(worker, inputResult({ status: 'cancelled' }))
    await user.click(within(await screen.findByRole('region', { name: '쓰다 멈춘 사람' })).getByRole('button', { name: '이어서 입력' }))
    await waitFor(() => expect(worker.of('buildInputBatch').at(-1)).toMatchObject({ what: 'continueStuck' }))
  })

  it('AC-018.16: [이어서 입력]이 stopped로 끝나도 두 단추가 남는다', async () => {
    const { user, worker } = await toMemo(stuck())
    await user.click(within(screen.getByRole('region', { name: '쓰다 멈춘 사람' })).getByRole('button', { name: '이어서 입력' }))
    await done(worker, inputResult({ status: 'stopped', code: 'E-INPUT-STOPPED', reason: '멈춘 까닭' }))
    const band = await screen.findByRole('region', { name: '쓰다 멈춘 사람' })
    expect(within(band).getByRole('button', { name: '이어서 입력' })).toBeTruthy()
    expect(within(band).getByRole('button', { name: '직접 확인했어요' })).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('멈춘 까닭')
  })

  it('AC-018.16: 메모가 없는 사람이면 [이어서 입력]이 흐리고 [직접 확인했어요]가 파랗고 글이 있다', async () => {
    await toMemo(stuck({ canContinue: false, note: '넣을 메모가 없어 [이어서 입력]은 누를 수 없어요.', people: [{ ...STUCK.people[0], reason: 'nomemo' }] }))
    const band = screen.getByRole('region', { name: '쓰다 멈춘 사람' })
    expect((within(band).getByRole('button', { name: '이어서 입력' }) as HTMLButtonElement).disabled).toBe(true)
    expect(within(band).getByRole('button', { name: '직접 확인했어요' }).getAttribute('class')).toContain('bg-accent')
    expect(band.textContent).toContain('넣을 메모가 없어 [이어서 입력]은 누를 수 없어요.')
    expect(band.textContent).toContain('이 진료에는 넣을 메모가 없어요.')
  })

  it('AC-018.16: 확인 표시·화면이 아는 같은 날이면 흐리고 도우미 글이다', async () => {
    const note = '이 환자는 입력에서 빠지는 사람이라 이어서 입력할 수 없습니다. 비트에서 메모 칸을 확인한 뒤 [직접 확인했어요]를 눌러 주세요.'
    await toMemo(stuck({ canContinue: false, note, people: [{ ...STUCK.people[0], reason: 'manual', sameDay: 2 }, { ...STUCK.people[0], key: 's2', reason: 'mark', text: '글 [부위 확인]' }] }))
    const band = screen.getByRole('region', { name: '쓰다 멈춘 사람' })
    expect(band.textContent).toContain(note)
    expect(band.textContent).toContain('직접 입력')
    expect(band.textContent).toContain('같은 날 진료 2건')
    expect(band.textContent).toContain('확인 필요')
    expect(band.textContent).toContain('[부위 확인]')
  })

  it('AC-018.16: 자료에 없는 진료는 날짜(모르면 달)와 비트에 열려 있는 환자의 안내이고 큰 글이 없다', async () => {
    await toMemo(stuck({ canContinue: false, big: false, note: '넣을 메모가 없어 [이어서 입력]은 누를 수 없어요.', people: [{ key: 'g1', state: 'noData', date: '2026-10-28', month: '2026-10', name: null, chart: null, rxNames: [], reason: null, text: '', sameDay: 1 }, { key: 'g2', state: 'noData', date: null, month: '2026-09', name: null, chart: null, rxNames: [], reason: null, text: '', sameDay: 1 }] }))
    const band = screen.getByRole('region', { name: '쓰다 멈춘 사람' })
    expect(band.textContent).not.toContain('비트에서 이 환자의 메모 칸을 직접 확인해 주세요')
    expect(band.textContent).toContain('10/28')
    expect(band.textContent).toContain('9월')
    expect(band.textContent).toContain('비트에 열려 있는 환자의 메모 칸을 확인해 주세요')
    expect(band.textContent).not.toContain('000000')
  })

  it('AC-018.16: 기간 밖이면 두 단추가 흐리고 [자료 불러오기]가 파랗고 그 기간을 불러온다', async () => {
    const away = { from: '2026-10-05', to: '2026-10-20' }
    const { user, worker } = await toMemo(stuck({ canContinue: false, canByHand: false, big: false, loadRange: away, people: [{ key: 'g1', state: 'outside', date: '2026-10-20', month: '2026-10', name: null, chart: null, rxNames: [], reason: null, text: '', sameDay: 1 }, { key: 'g2', state: 'outside', date: null, month: '2026-09', name: null, chart: null, rxNames: [], reason: null, text: '', sameDay: 1 }] }))
    const band = screen.getByRole('region', { name: '쓰다 멈춘 사람' })
    expect(band.textContent).toContain('이 날을 불러와 주세요')
    expect(band.textContent).toContain('이 달을 불러와 주세요')
    expect((within(band).getByRole('button', { name: '이어서 입력' }) as HTMLButtonElement).disabled).toBe(true)
    expect((within(band).getByRole('button', { name: '직접 확인했어요' }) as HTMLButtonElement).disabled).toBe(true)
    const load = within(band).getByRole('button', { name: '자료 불러오기' })
    expect(load.getAttribute('class')).toContain('bg-accent')
    await user.click(load)
    await waitFor(() => expect(worker.of('check').at(-1)).toMatchObject({ visible: away }))
  })

  it('AC-018.16: 풀린 뒤 [비트에 입력]이 다시 눌린다', async () => {
    let current = stuck()
    const { user, worker } = await toMemo(() => current)
    expect(inputButton().disabled).toBe(true)
    await user.click(within(screen.getByRole('region', { name: '쓰다 멈춘 사람' })).getByRole('button', { name: '직접 확인했어요' }))
    current = memoView()
    await done(worker, inputResult({ status: 'finished' }))
    await user.click(await screen.findByRole('button', { name: '입력 방식으로 돌아가기' }))
    await waitFor(() => expect(inputButton().disabled).toBe(false))
    expect(screen.queryByRole('region', { name: '쓰다 멈춘 사람' })).toBeNull()
  })
})

describe('AC-018.17 기관기호 안내', () => {
  const refused = () => bridge({ store: (args) => (args.months ? Promise.reject(new BridgeError('E-BIT-HOSPITAL-MISMATCH')) : Promise.resolve({ id: 'copy', count: 1 })) })
  const LINES = ['등록한 기관기호가 바뀌어 이전 병원의 저장 파일이 남아 있어요', '지금은 이 PC에 저장되지 않아요. 고친 메모는 이 화면에 그대로 있어요.', '이 달은 저장이 막혀 있어요. 이어서 하려면 개발자에게 도움을 요청해 주세요. 등록한 기관기호는 [설정 → 비트 PC 연결]에서 확인할 수 있어요.', '오류 번호 E-BIT-HOSPITAL-MISMATCH']

  it('AC-018.17: store.load에서 받아도 멈추지 않고 표와 세 줄의 글을 보이고, [다시 등록] 글과 지우는 단추가 없다', async () => {
    const { worker } = await toMemo(memoView(), refused())
    const card = screen.getByRole('alert')
    for (const text of LINES) expect(card.textContent).toContain(text)
    expect(card.textContent).not.toContain('[다시 등록]')
    expect(screen.queryByRole('button', { name: /지우|처음부터/ })).toBeNull()
    expect(screen.getByRole('table', { name: '메모' })).toBeTruthy()
    expect(worker.of('storeBlock')).toEqual([{ type: 'storeBlock' }])
  })

  it('AC-018.17: 고친 줄 상태에 저장 안 됨을 보인다', async () => {
    await toMemo(memoView({ table: [tableRow('a', { edited: true, unsaved: true }), tableRow('b')] }), refused())
    expect(within(screen.getByRole('table', { name: '메모' })).getByText('저장 안 됨')).toBeTruthy()
  })

  it('AC-018.17: 안내가 떠 있는 동안 입력 방식 칸의 단추 넷([비트에 입력]·[이어서 입력]·[직접 확인했어요]·지난번 [다시 하기])이 막힌다', async () => {
    const view = memoView({ stuck: STUCK })
    view.targets = { ...view.targets, left: [{ reason: 'held', rows: [row('h')] }] }
    await toMemo(view, refused())
    const band = screen.getByRole('region', { name: '쓰다 멈춘 사람' })
    expect((within(band).getByRole('button', { name: '이어서 입력' }) as HTMLButtonElement).disabled).toBe(true)
    expect((within(band).getByRole('button', { name: '직접 확인했어요' }) as HTMLButtonElement).disabled).toBe(true)
    expect(inputButton().disabled).toBe(true)
    expect((screen.getByRole('button', { name: '다시 하기 (1명)' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('AC-018.16·AC-018.17: 저장이 막혀 있어도 띠의 [자료 불러오기]는 눌린다(불러와야 풀린다)', async () => {
    const view = memoView({ stuck: { ...STUCK, canContinue: false, canByHand: false, big: false, loadRange: { from: '2026-10-05', to: '2026-10-20' }, people: [{ key: 'g1', state: 'outside', date: '2026-10-20', month: '2026-10', name: null, chart: null, rxNames: [], reason: null, text: '', sameDay: 1 }] } })
    await toMemo(view, refused())
    const band = screen.getByRole('region', { name: '쓰다 멈춘 사람' })
    expect((within(band).getByRole('button', { name: '자료 불러오기' }) as HTMLButtonElement).disabled).toBe(false)
    expect((within(band).getByRole('button', { name: '이어서 입력' }) as HTMLButtonElement).disabled).toBe(true)
    expect((within(band).getByRole('button', { name: '직접 확인했어요' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('AC-018.17: 안내가 떠 있는 동안 결과 화면의 [이어서 하기]·[다시 하기]도 막힌다', async () => {
    const { user, worker } = await toMemo()
    await user.click(inputButton())
    await screen.findByRole('status', { name: '입력 진행' })
    await done(worker, inputResult({ status: 'stopped', code: 'E-INPUT-STOPPED', left: 1, retry: 1, skipped: [{ key: 'a', date: '2026-10-28', month: '2026-10', name: '가상환자a', chart: '9a', result: '건너뜀', reason: '내원일 없음', retry: true }] }))
    const resume = (await screen.findByRole('button', { name: '이어서 하기' })) as HTMLButtonElement
    expect(resume.disabled).toBe(false)
    await act(async () => worker.emit({ type: 'memoSave', ok: false, code: 'E-BIT-HOSPITAL-MISMATCH', blocked: true }))
    expect(resume.disabled).toBe(true)
    expect((screen.getByRole('button', { name: '다시 하기 (1명)' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('AC-018.17: 안내가 떠 있는 동안 [비트에 입력]을 눌러도 확인 표시 알림([빼고 N명 입력])이 뜨지 않는다', async () => {
    const view = memoView()
    view.targets = { ...view.targets, left: [{ reason: 'mark', rows: [row('m1', { unfinished: true, chip: null })] }] }
    const { user, worker } = await toMemo(view, refused())
    await user.click(inputButton())
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(worker.of('buildInputBatch')).toEqual([])
  })

  it('AC-018.17: [자료 불러오기]가 또 거절되면 안내가 남고 고친 메모를 지키라고 Worker에 알린다', async () => {
    const { user, worker } = await toMemo(memoView(), refused())
    await user.click(screen.getByRole('button', { name: /날짜 고르기/ }))
    await user.click(await screen.findByRole('button', { name: '자료 불러오기' }))
    await screen.findByRole('button', { name: '다음: 메모 확인' })
    expect(screen.getByRole('alert').textContent).toContain('이전 병원')
    expect(worker.of('loadStart').at(-1)).toMatchObject({ keepEdits: true })
  })

  it('AC-018.17: 달 칸의 store.load가 성공하면 안내가 사라지고 단추가 돌아온다', async () => {
    let block = true
    const link = bridge({ store: (args) => (args.months && block ? Promise.reject(new BridgeError('E-BIT-HOSPITAL-MISMATCH')) : Promise.resolve({ id: `s${Math.random()}`, count: 1 })) })
    const { user } = await toMemo(memoView(), link)
    expect(inputButton().disabled).toBe(true)
    block = false
    await user.click(screen.getByRole('button', { name: /날짜 고르기/ }))
    await user.click(await screen.findByRole('button', { name: '자료 불러오기' }))
    await user.click(await screen.findByRole('button', { name: '다음: 메모 확인' }))
    await waitFor(() => expect(inputButton().disabled).toBe(false))
    expect(screen.queryByText(/이전 병원/)).toBeNull()
  })

  it('AC-018.17: store.save가 거절되면 그때부터 같은 안내다', async () => {
    const { worker } = await toMemo()
    await act(async () => worker.emit({ type: 'memoSave', ok: false, code: 'E-BIT-HOSPITAL-MISMATCH', blocked: true }))
    expect(screen.getByRole('alert').textContent).toContain('이전 병원')
    expect(inputButton().disabled).toBe(true)
    expect(screen.queryByRole('button', { name: '다시 저장' })).toBeNull()
  })

  it('AC-018.17: settings.dat의 같은 번호면 안내가 없고 [비트에 입력]이 눌린다', async () => {
    const link = bridge({ store: (args) => (args.settings ? Promise.reject(new BridgeError('E-BIT-HOSPITAL-MISMATCH')) : Promise.resolve({ id: 'store', count: 1 })) })
    await toMemo(memoView(), link)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(inputButton().disabled).toBe(false)
  })
})

describe('AC-018.18 처음 질문', () => {
  it('AC-018.18: 메모·[비트에 입력]이 없고 파란 안내에 번호가 없다. 점검 결과는 그대로다', async () => {
    const view = memoView({ memoBlocked: 'E-MEMO-NO-SETTINGS', table: [] })
    view.targets = { ...view.targets, batch: [] }
    const { worker, channel, link, user } = await (async () => {
      const worker = fakeWorker(() => view, { ...VIEW, memoBlocked: 'E-MEMO-NO-SETTINGS' })
      const channel = claimChannel(worker)
      const link = bridge()
      render(<ClaimScreen channel={channel} call={link.call as never} stream={link.stream as never} onProgress={link.onProgress as never} />)
      const user = userEvent.setup()
      await user.click(await screen.findByRole('button', { name: '자료 불러오기' }))
      await user.click(await screen.findByRole('button', { name: '다음: 메모 확인' }))
      return { worker, channel, link, user }
    })()
    const info = await screen.findByRole('status', { name: '처음 질문' })
    expect(info.textContent).toContain('처음 질문을 먼저 해 주세요')
    expect(info.textContent).toContain('처음 질문 화면은 아직 준비 중이에요')
    expect(info.textContent).not.toContain('오류 번호')
    expect(info.getAttribute('class')).toContain('bg-accent-soft')
    expect(screen.queryByRole('button', { name: /비트에 입력 \(/ })).toBeNull()
    expect(screen.queryByRole('table', { name: '메모' })).toBeNull()
    await user.click(screen.getByRole('button', { name: /점검 결과/ }))
    expect(screen.getByRole('heading', { level: 2, name: '환자' })).toBeTruthy()
    void worker
    void channel
    void link
  })
})

describe('AC-018.1 점검 결과에서 메모로', () => {
  it('AC-018.1: 환자 자세히의 메모 초안에서 [메모 확인에서 고치기]를 누르면 그 사람의 칸이다', async () => {
    const claim: ClaimView = { ...VIEW, visits: [{ ...visit('a'), memo: { visitKey: 'a', text: '우리 메모 a', edited: false, missing: [], hasMemo: true, unfinished: false } }, visit('b')] }
    const worker = fakeWorker(() => memoView(), claim)
    const link = bridge()
    render(<ClaimScreen channel={claimChannel(worker)} call={link.call as never} stream={link.stream as never} onProgress={link.onProgress as never} />)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '자료 불러오기' }))
    await user.click(await screen.findByRole('button', { name: '경고 없음 2' }))
    expect(screen.getByText('메모 초안')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '메모 확인에서 고치기' }))
    const box = await within(await screen.findByRole('table', { name: '메모' })).findByRole('textbox', { name: '가상환자a 메모' })
    expect(document.activeElement).toBe(box)
  })

  it('AC-018.3: 다섯 단계가 보이고 입력 중에는 앞 단계로 갈 수 없다', async () => {
    const { user } = await toMemo()
    for (const name of [/날짜 고르기/, /점검 결과/, /메모 확인/, /비트에 입력$/, /입력 결과/]) expect(screen.getAllByRole('button', { name }).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /메모 확인$/ }).getAttribute('aria-current')).toBe('step')
    await user.click(inputButton())
    await screen.findByRole('status', { name: '입력 진행' })
    expect((screen.getByRole('button', { name: /점검 결과/ }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('button', { name: /비트에 입력$/ }).getAttribute('aria-current')).toBe('step')
  })
})

describe('AC-018.22 묻지 않기 띠', () => {
  it('AC-018.22: 켜져 있으면 위 띠로 알리고 끄는 단추가 없다', async () => {
    await toMemo(memoView({ noAsk: true }))
    expect(screen.getByText('묻지 않기 켜짐: PC 확인 창 없이 바로 시작해요')).toBeTruthy()
    expect(screen.getByText('[비트에 입력]을 누르면 아래 목록 그대로 들어가요. [바꾸지 않기]를 누른 사람과 확인 표시가 남은 메모는 넣지 않아요. 끄려면 청구 창을 닫았다가 다시 여세요.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /청구 창|끄기/ })).toBeNull()
  })

  it('AC-018.22: 켜져 있어도 [바꾸지 않기]가 눌린다', async () => {
    const view = memoView({ noAsk: true })
    view.targets = { ...view.targets, batch: [row('d', { compare: '다름', inBit: '비트 글', replaces: '비트 글', chip: '메모 바꿈' })], replacing: 1 }
    const { user, worker } = await toMemo(view)
    await user.click(screen.getByRole('button', { name: '바꾸지 않기' }))
    expect(worker.of('memoApprove').at(-1)).toMatchObject({ visitKey: 'd', approved: false })
  })
})

describe('AC-2602.5 [메모 고치기]가 줄도 연다', () => {
  it('AC-2602.5·AC-018.27: 닫힌 줄에서 [메모 고치기]를 누르면 고치는 칸과 함께 그 줄이 열려 증상·처방내역이 보이고, 줄을 처음 열 때처럼 비트 메모를 한 번 읽는다', async () => {
    const link = bridge()
    const { user } = await toMemo(memoView(), link)
    const memoCalls = () => link.stream.mock.calls.filter(([cmd]) => cmd === 'claim.memos').length
    const before = memoCalls()
    const head = screen.getByRole('button', { name: /가상환자a/ })
    expect(head.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('region', { name: '증상 · 차트 원문' })).toBeNull()
    await user.click(screen.getAllByRole('button', { name: '메모 고치기' })[0])
    expect(screen.getByRole('textbox', { name: '가상환자a 메모 고치기' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /가상환자a/ }).getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('region', { name: '증상 · 차트 원문' }).textContent).toContain('가상 증상 a')
    expect(screen.getByRole('region', { name: '처방내역' }).textContent).toContain('가상시술 가')
    expect(screen.getByRole('button', { name: /가상환자b/ }).getAttribute('aria-expanded')).toBe('false')
    await waitFor(() => expect(memoCalls()).toBe(before + 1))
  })

  it('AC-2602.5: 이미 열린 줄에서 [메모 고치기]를 눌러도 열린 채다', async () => {
    const { user } = await toMemo(memoView())
    await user.click(screen.getByRole('button', { name: /가상환자a/ }))
    expect(screen.getByRole('button', { name: /가상환자a/ }).getAttribute('aria-expanded')).toBe('true')
    await user.click(screen.getAllByRole('button', { name: '메모 고치기' })[0])
    expect(screen.getByRole('textbox', { name: '가상환자a 메모 고치기' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /가상환자a/ }).getAttribute('aria-expanded')).toBe('true')
  })
})

describe('AC-018.24·AC-018.27 비트 메모 읽기', () => {
  const pending = () => {
    const calls: { resolve(id: string): void; reject(code: string): void }[] = []
    return { calls, memos: () => new Promise<{ id: string; count: number }>((resolve, reject) => calls.push({ resolve: (id) => resolve({ id, count: 1 }), reject: (code) => reject(new BridgeError(code)) })) }
  }

  it('AC-018.24: 읽는 동안 입력 방식 칸의 단추 넷이 막힌다', async () => {
    const view = memoView({ stuck: STUCK })
    view.targets = { ...view.targets, left: [{ reason: 'held', rows: [row('h')] }] }
    let first = true
    const gate = pending()
    const memos = () => {
      if (first) {
        first = false
        return Promise.resolve({ id: 'first', count: 1 })
      }
      return gate.memos()
    }
    const { user } = await toMemo(view, bridge({ memos }))
    await user.click(screen.getByRole('button', { name: '비트 메모 전체 불러오기' }))
    const band = screen.getByRole('region', { name: '쓰다 멈춘 사람' })
    expect((within(band).getByRole('button', { name: '이어서 입력' }) as HTMLButtonElement).disabled).toBe(true)
    expect((within(band).getByRole('button', { name: '직접 확인했어요' }) as HTMLButtonElement).disabled).toBe(true)
    expect(inputButton().disabled).toBe(true)
    expect((screen.getByRole('button', { name: '다시 하기 (1명)' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('AC-018.24: 읽는 동안 띠의 [자료 불러오기]도 막힌다', async () => {
    const view = memoView({ stuck: { ...STUCK, canContinue: false, canByHand: false, big: false, loadRange: { from: '2026-10-05', to: '2026-10-20' }, people: [{ key: 'g1', state: 'outside', date: '2026-10-20', month: '2026-10', name: null, chart: null, rxNames: [], reason: null, text: '', sameDay: 1 }] } })
    let first = true
    const gate = pending()
    const memos = () => {
      if (first) {
        first = false
        return Promise.resolve({ id: 'first', count: 1 })
      }
      return gate.memos()
    }
    const { user } = await toMemo(view, bridge({ memos }))
    await user.click(screen.getByRole('button', { name: '비트 메모 전체 불러오기' }))
    const band = screen.getByRole('region', { name: '쓰다 멈춘 사람' })
    expect((within(band).getByRole('button', { name: '자료 불러오기' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('AC-018.24: 읽는 동안 [비트에 입력]을 눌러도 확인 표시 알림이 뜨지 않는다', async () => {
    const view = memoView()
    view.targets = { ...view.targets, left: [{ reason: 'mark', rows: [row('m1', { unfinished: true, chip: null })] }] }
    let first = true
    const gate = pending()
    const memos = () => {
      if (first) {
        first = false
        return Promise.resolve({ id: 'first', count: 1 })
      }
      return gate.memos()
    }
    const { user } = await toMemo(view, bridge({ memos }))
    await user.click(screen.getByRole('button', { name: '비트 메모 전체 불러오기' }))
    await user.click(inputButton())
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('AC-018.27: 처음 열 때 claim.memos가 한 번 불리고, 두 번째 줄은 부르지 않고, 실패해도 저절로 다시 읽지 않는다', async () => {
    const link = bridge()
    const { user } = await toMemo(memoView(), link)
    const memoCalls = () => link.stream.mock.calls.filter(([cmd]) => cmd === 'claim.memos').length
    const before = memoCalls()
    await user.click(screen.getByRole('button', { name: /가상환자a/ }))
    await waitFor(() => expect(memoCalls()).toBe(before + 1))
    await user.click(screen.getByRole('button', { name: /가상환자b/ }))
    expect(memoCalls()).toBe(before + 1)
    expect(link.stream.mock.calls.filter(([cmd]) => cmd === 'claim.month')).toHaveLength(1)
    expect(screen.getAllByRole('group', { name: '비트에 저장된 청구메모' })).toHaveLength(2)
  })

  it('AC-018.27: 입력 중에는 처음 열어도 부르지 않는다', async () => {
    const link = bridge()
    const { user } = await toMemo(memoView(), link)
    const before = link.stream.mock.calls.filter(([cmd]) => cmd === 'claim.memos').length
    await user.click(inputButton())
    await screen.findByRole('status', { name: '입력 진행' })
    await user.click(screen.getByRole('button', { name: /가상환자a/ }))
    expect(link.stream.mock.calls.filter(([cmd]) => cmd === 'claim.memos')).toHaveLength(before)
    expect(screen.getByRole('group', { name: '비트에 저장된 청구메모' }).textContent).toContain('입력이 끝난 뒤')
  })

  it('AC-018.27: 새 [자료 불러오기] 뒤 처음 열면 다시 한 번 읽는다', async () => {
    const link = bridge()
    const { user } = await toMemo(memoView(), link)
    const memoCalls = () => link.stream.mock.calls.filter(([cmd]) => cmd === 'claim.memos').length
    await user.click(screen.getByRole('button', { name: /가상환자a/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: '비트 메모 전체 다시 불러오기' })).toBeTruthy())
    await user.click(screen.getByRole('button', { name: /날짜 고르기/ }))
    await user.click(await screen.findByRole('button', { name: '자료 불러오기' }))
    await user.click(await screen.findByRole('button', { name: '다음: 메모 확인' }))
    await screen.findByRole('button', { name: '비트 메모 전체 불러오기' })
    const before = memoCalls()
    await user.click(await screen.findByRole('button', { name: /가상환자a/ }))
    await waitFor(() => expect(memoCalls()).toBe(before + 1))
  })
})

describe('AC-013.6 다른 탭에 다녀올 때', () => {
  it('AC-013.6: 메모 칸에서 떠났다 돌아오면 메모 칸이고 Worker의 달을 버리지 않는다', async () => {
    const { worker, channel, link, unmount } = await toMemo()
    const before = worker.of('loadStart').length
    unmount()
    expect(worker.of('loadStart')).toHaveLength(before)
    render(<ClaimScreen channel={channel} call={link.call as never} stream={link.stream as never} onProgress={link.onProgress as never} />)
    expect(await screen.findByRole('region', { name: '입력 방식' })).toBeTruthy()
    expect(worker.of('loadStart')).toHaveLength(before)
  })

  it.each([
    ['확인 기다리는 중', false],
    ['입력 중', true],
  ])('AC-013.6: %s에 떠나면 사람과 기관기호를 알아도 맡긴 결과가 없고 keepEdits 없는 loadStart만 가며 돌아와도 결과를 그리지 않는다', async (stage, progressed) => {
    const { worker, channel, link, unmount, user } = await toMemo()
    await user.click(inputButton())
    await screen.findByRole('status', { name: '입력 진행' })
    if (progressed) await act(async () => progress.fn?.({ id: 'x', done: 1, total: 2 }))
    expect(screen.getByRole('status', { name: '입력 진행' }).textContent).toContain(stage)
    expect(channel.kept()).not.toBeNull() // 사람과 기관기호를 알아 맡겨 둔 결과가 있었다
    const before = worker.of('loadStart').length
    const reads = link.stream.mock.calls.length
    unmount()
    expect(worker.of('loadStart')).toHaveLength(before + 1)
    expect(worker.of('loadStart').at(-1)).not.toHaveProperty('keepEdits')
    expect(link.stream.mock.calls).toHaveLength(reads) // stream 없이 loadStart만 간다
    expect(channel.kept()).toBeNull()
    expect(channel.keptMemo()).toBeNull()
    render(<ClaimScreen channel={channel} call={link.call as never} stream={link.stream as never} onProgress={link.onProgress as never} />)
    expect(await screen.findByRole('button', { name: '자료 불러오기' })).toBeTruthy()
    expect(screen.queryByRole('status', { name: '입력 진행' })).toBeNull()
    expect(screen.queryByRole('region', { name: '입력 방식' })).toBeNull()
    expect(screen.queryByRole('table', { name: '메모' })).toBeNull()
    expect(screen.queryByText(/가상환자/)).toBeNull()
    expect(link.stream.mock.calls).toHaveLength(reads)
  })

  it('AC-013.6: 다녀와서 고칠 글이 저장되지 않았으면 다시 저장을 시킨다', async () => {
    const view = memoView({ table: [tableRow('a', { unsaved: true, edited: true }), tableRow('b')] })
    const { worker, channel, link, unmount } = await toMemo(view)
    unmount()
    const before = worker.of('memoSaveRetry').length
    render(<ClaimScreen channel={channel} call={link.call as never} stream={link.stream as never} onProgress={link.onProgress as never} />)
    await screen.findByRole('region', { name: '입력 방식' })
    await waitFor(() => expect(worker.of('memoSaveRetry').length).toBeGreaterThan(before))
  })
})
