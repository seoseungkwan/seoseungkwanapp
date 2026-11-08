// @vitest-environment jsdom
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BridgeError } from '@/lib/bridge/protocol'
import type { ErrorCode } from '@/types/errors'
import type { ClaimView, ClaimVisitView, InputResultView, MemoScreenView, MemoTableRow, PrecheckFromScreen, PrecheckToScreen, StuckView, TargetRow } from '@/types/precheck'
import { claimChannel } from '../claimLoad'
import { ClaimScreen } from '../ClaimScreen'

// 메모 칸(REQ-018, memo-split 두 칸 보기). 가짜 통로·가짜 Worker·가짜 클립보드로 청구 화면을 처음부터 지나 메모 확인까지 간다. 이름·번호·글은 지어낸 것이다. 실제 Worker·확장·도우미·브라우저는 없다

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
const row = (key: string, over: Partial<TargetRow> = {}): TargetRow => ({ key, date: '2026-10-28', text: `우리 메모 ${key}`, hasMemo: true, unfinished: false, compare: '비트에 없음', chart: `9${key}`, name: `가상환자${key}`, rx: ['LA358'], rxNames: ['가상시술 가'], warned: false, chartLines: [{ kind: 'subj', text: `가상 증상 ${key}` }], rxRows: [{ kind: 'proc', code: 'LA358', name: '가상시술 가', short: '', qty: 1, benefit: true }], sameDay: 1, foundByPc: false, chip: '새 메모', done: false, ...over })
const tableRow = (key: string, over: Partial<MemoTableRow> = {}): MemoTableRow => ({ key, date: '2026-10-28', text: `우리 메모 ${key}`, hasMemo: true, unfinished: false, compare: '비트에 없음', chart: `9${key}`, name: `가상환자${key}`, rxNames: ['가상시술 가'], edited: false, missing: [], done: false, unsaved: false, afterEntry: false, ...over })
const memoView = (over: Partial<MemoScreenView> = {}): MemoScreenView => ({
  period: PERIOD,
  memoBlocked: null,
  noAsk: false,
  targets: { problem: null, range: PERIOD, code: null, batch: [row('a'), row('b')], left: [], chips: [{ code: 'LA358', name: '가상시술 가', count: 2 }], typedOverChip: false, replacing: 0 },
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

type ScreenView = (posted: readonly PrecheckFromScreen[]) => MemoScreenView
type Listener = (event: Event) => void
function fakeWorker(screenView: ScreenView, claim: ClaimView = VIEW) {
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
        return memoAnswer.fail ? { type: 'memoView', ask: m.ask, ok: false, code: memoAnswer.fail } : { type: 'memoView', ask: m.ask, ok: true, view: screenView(posted) }
      case 'buildInputBatch':
        return { type: 'inputStart', run: m.run, ok: true, count: 2, askPc: !screenView(posted).noAsk || m.what === 'byHand' }
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

/**
 * 가짜 Worker의 완료·고친 글: 보낸 memoCopied·memoUndone·editMemo를 차례대로 얹는다(AC-3104.1·AC-3104.2·AC-2202.1 흉내).
 * memoCopied는 글이 지금 우리 메모와 같을 때만 완료로 둔다. 묶음·차례는 그대로다(복사로 완료한 사람은 자리를 지킨다, AC-3104.4)
 */
function live(view: MemoScreenView): ScreenView {
  return (posted) => {
    const all = [...view.targets.batch, ...view.targets.left.flatMap((group) => group.rows)]
    const done = new Map(all.map((item) => [item.key, item.done]))
    const text = new Map(all.map((item) => [item.key, item.text]))
    for (const m of posted) {
      if (m.type === 'memoCopied' && text.get(m.visitKey) === m.text) done.set(m.visitKey, true)
      if (m.type === 'memoUndone') done.set(m.visitKey, false)
      if (m.type === 'editMemo' && text.get(m.visitKey) !== m.text) {
        text.set(m.visitKey, m.text)
        done.set(m.visitKey, false)
      }
    }
    const fix = (item: TargetRow): TargetRow => ({ ...item, done: done.get(item.key) ?? false, text: text.get(item.key) ?? item.text })
    return { ...view, targets: { ...view.targets, batch: view.targets.batch.map(fix), left: view.targets.left.map((group) => ({ ...group, rows: group.rows.map(fix) })) } }
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
/** 달 칸 store.load가 기관기호가 달라 거절된다(저장이 막힘, AC-018.17) */
const refusedStore = () => bridge({ store: (args) => (args.months ? Promise.reject(new BridgeError('E-BIT-HOSPITAL-MISMATCH')) : Promise.resolve({ id: 'copy', count: 1 })) })
const memoCalls = (link: ReturnType<typeof bridge>) => link.stream.mock.calls.filter(([cmd]) => cmd === 'claim.memos').length

async function toMemo(view: ScreenView | MemoScreenView = memoView(), link = bridge(), claim: ClaimView = VIEW) {
  const worker = fakeWorker(typeof view === 'function' ? view : () => view, claim)
  const channel = claimChannel(worker)
  const made = render(<ClaimScreen channel={channel} call={link.call as never} stream={link.stream as never} onProgress={link.onProgress as never} />)
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: '자료 불러오기' }))
  await user.click(await screen.findByRole('button', { name: '다음: 메모 확인' }))
  await screen.findByRole('region', { name: '입력 방식' })
  return { worker, channel, link, user, ...made }
}
/** 점검 결과에서 가상환자b의 [메모 확인에서 고치기]를 눌러 메모 칸으로 온다(AC-3105.6). 메모 칸은 그때마다 새로 그려진다 */
async function fromCheck() {
  const claim: ClaimView = { ...VIEW, visits: [visit('a'), { ...visit('b'), memo: { visitKey: 'b', text: '우리 메모 b', edited: false, missing: [], hasMemo: true, unfinished: false } }] }
  const worker = fakeWorker(() => memoView(), claim)
  const link = bridge()
  render(<ClaimScreen channel={claimChannel(worker)} call={link.call as never} stream={link.stream as never} onProgress={link.onProgress as never} />)
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: '자료 불러오기' }))
  await user.click(await screen.findByRole('button', { name: '경고 없음 2' }))
  await user.click(screen.getByRole('button', { name: '가상환자b' }))
  expect(screen.getByText('메모 초안')).toBeTruthy()
  await user.click(screen.getByRole('button', { name: '메모 확인에서 고치기' }))
  const box = await screen.findByRole('textbox', { name: '가상환자b 우리 메모 고치기' })
  return { worker, link, user, box }
}
const inputButton = (n = 2) => screen.getByRole('button', { name: `비트에 입력 (${n}명)` }) as HTMLButtonElement
const lastRun = (worker: ReturnType<typeof fakeWorker>) => worker.of('buildInputBatch').at(-1)!.run
const done = async (worker: ReturnType<typeof fakeWorker>, result: InputResultView) => {
  await waitFor(() => expect(worker.of('buildInputBatch').length).toBeGreaterThan(0))
  await act(async () => worker.emit({ type: 'inputDone', run: lastRun(worker), ok: true, result }))
}
const STUCK: StuckView = { people: [{ key: 's1', state: 'known', date: '2026-10-28', month: '2026-10', name: '가상환자쓰다', chart: '9001', rxNames: ['가상시술 가'], reason: null, text: '글', sameDay: 1 }], canContinue: true, canByHand: true, big: true, loadRange: null, note: null }

// 두 칸 보기 찾기
const toolbar = () => screen.getByRole('region', { name: '입력 도구' })
const list = () => screen.getByRole('region', { name: '환자 목록' })
const detail = () => screen.getByRole('region', { name: '고른 환자 메모' })
/** 목록의 사람 줄(이름은 한 글자 끝이라 앞부분이 겹치지 않는다) */
const rowOf = (name: string) => within(list()).getByRole('button', { name: new RegExp(name) })
const personRows = () => within(list()).queryAllByRole('button').filter((button) => button.hasAttribute('aria-current'))
const rowNames = () => personRows().map((button) => button.textContent!.match(/가상환자[a-z]/)![0])
/** 오른쪽 상세 머리의 이름 */
const shown = () => within(detail()).getByRole('heading', { level: 3 }).textContent
const copyButton = () => within(detail()).getByRole('button', { name: /^(C 복사\(완료\)|C 다시 복사|복사 중…)$/ }) as HTMLButtonElement
/** 단추 줄 맨 아래 상태 줄 */
const statusLine = () => copyButton().parentElement!.lastElementChild as HTMLElement
const ourMemo = () => within(detail()).getByRole('group', { name: '우리 메모' }).querySelector('p')?.textContent
const pressKey = (init: { key: string; code?: string; repeat?: boolean }) => fireEvent.keyDown(document.body, init)
const settle = () => act(async () => {})

/** 가짜 클립보드: 받은 글을 적어 두고 거절하거나(fail) 답을 미룬다(hold). 예비 방법(execCommand)은 늘 안 된다 */
let clipboardSet = false
function fakeClipboard() {
  const clip = { writes: [] as string[], fail: false, hold: false, held: null as null | { ok(): void; no(): void } }
  const writeText = (text: string) => {
    clip.writes.push(text)
    if (clip.hold) {
      return new Promise<void>((resolve, reject) => {
        clip.held = { ok: () => resolve(), no: () => reject(new Error('막힘')) }
      })
    }
    return clip.fail ? Promise.reject(new Error('막힘')) : Promise.resolve()
  }
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  Object.defineProperty(document, 'execCommand', { value: () => false, configurable: true })
  clipboardSet = true
  return clip
}

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
  if (clipboardSet) {
    Reflect.deleteProperty(navigator, 'clipboard')
    Reflect.deleteProperty(document, 'execCommand')
    clipboardSet = false
  }
})

describe('REQ-3101 두 칸 보기', () => {
  it('AC-3101.1: 메모 칸은 위 도구 줄과 그 아래 두 칸(왼쪽 환자 목록 | 오른쪽 고른 환자 메모)이다. 1024px 이상 나란히(왼쪽 360px)·좁으면 위아래이고, 두 칸은 각자 스크롤되며 위 끝을 잴 수 없으면 예전 높이(화면 높이 - 8.5rem)다', async () => {
    await toMemo()
    const bar = toolbar()
    const left = list()
    const right = detail()
    expect(bar.compareDocumentPosition(left) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const split = right.parentElement!
    expect(split.contains(left)).toBe(true)
    const classes = (element: Element) => element.getAttribute('class')!.split(/\s+/)
    expect(classes(split)).toEqual(expect.arrayContaining(['grid', 'lg:grid-cols-[360px_minmax(0,1fr)]', 'lg:grid-rows-[minmax(0,1fr)]', 'lg:h-[max(30rem,calc(100dvh-8.5rem))]']))
    expect(classes(split).filter((name) => /^grid-cols-/.test(name))).toEqual([]) // 1024px 아래는 한 줄에 하나(위아래)
    expect(classes(right)).toEqual(expect.arrayContaining(['min-h-0', 'overflow-y-auto', 'overscroll-contain']))
    expect(classes(left.parentElement!)).toEqual(expect.arrayContaining(['min-h-0', 'max-lg:max-h-[40dvh]']))
    expect(left.querySelector('.overflow-y-auto')).not.toBeNull()
    expect(rowOf('가상환자a').getAttribute('aria-current')).toBe('true')
    expect(shown()).toBe('가상환자a')
    expect(split.style.height).toBe('') // jsdom은 위 끝을 재지 못한다(모두 0): 예전 높이 class가 맡는다
  })

  describe('AC-3101.1·AC-3101.4 한 화면 높이', () => {
    const own = (name: 'innerWidth' | 'innerHeight') => Object.getOwnPropertyDescriptor(window, name)
    const saved = { innerWidth: own('innerWidth'), innerHeight: own('innerHeight') }
    const setWindow = (width: number, height: number) => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width })
      Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: height })
    }
    /** 모든 상자의 위 끝을 top으로 잰다(jsdom은 배치를 하지 않는다) */
    const at = { top: 0 }
    beforeEach(() => {
      at.top = 0
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ x: 0, y: at.top, top: at.top, left: 0, right: 1200, bottom: at.top + 400, width: 1200, height: 400, toJSON: () => ({}) }))
      // jsdom에는 matchMedia가 없다: CSS lg(64rem, 브라우저 기본 글자 16px)를 창 너비로 판정한다
      Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: (query: string) => ({ media: query, matches: query === '(min-width: 64rem)' && window.innerWidth >= 64 * 16 }) })
    })
    afterEach(() => {
      vi.restoreAllMocks()
      Reflect.deleteProperty(window, 'matchMedia')
      delete (Element.prototype as Partial<Element>).scrollIntoView
      for (const name of ['innerWidth', 'innerHeight'] as const) {
        const descriptor = saved[name]
        if (descriptor) Object.defineProperty(window, name, descriptor)
        else Reflect.deleteProperty(window, name)
      }
    })

    it('AC-3101.4·AC-3105.6: 점검 결과의 [메모 확인에서 고치기]로 오면 두 칸 높이를 맞춘 뒤에 고른 줄이 보이게 목록을 움직인다(맞추기 전 높이로만 움직이면 아래쪽 줄이 목록 밖으로 숨는다)', async () => {
      setWindow(1440, 900)
      at.top = 262
      /** scrollIntoView를 부른 줄과 그때 두 칸 높이(style.height) */
      const calls: [Element, string][] = []
      Element.prototype.scrollIntoView = function (this: Element) {
        const split = this.closest('section[aria-label="환자 목록"]')!.parentElement!.parentElement!
        calls.push([this, split.style.height])
      }
      await fromCheck()
      await settle()
      expect(detail().parentElement!.style.height).toBe('622px')
      expect(calls.length).toBeGreaterThan(0)
      expect(calls.at(-1)).toEqual([rowOf('가상환자b'), '622px'])
    })

    it('AC-3101.1: 1440×900 창에서 처음 열면 두 칸 높이는 창 높이 - 두 칸 위 끝 - 16px라 두 칸 아래 끝이 창 안에 들어온다', async () => {
      setWindow(1440, 900)
      at.top = 262
      await toMemo()
      const split = detail().parentElement!
      expect(split.style.height).toBe('622px')
      expect(at.top + parseFloat(split.style.height)).toBeLessThanOrEqual(900 - 16)
    })

    it('AC-3101.1: 창 크기가 바뀌면 다시 맞춘다', async () => {
      setWindow(1440, 900)
      at.top = 262
      await toMemo()
      const split = detail().parentElement!
      setWindow(1440, 1000)
      await act(async () => {
        window.dispatchEvent(new Event('resize'))
      })
      expect(split.style.height).toBe('722px')
    })

    it('AC-3101.1: 1024px보다 좁으면 높이를 정하지 않는다(위아래로 쌓인다)', async () => {
      setWindow(800, 900)
      at.top = 262
      await toMemo()
      expect(detail().parentElement!.style.height).toBe('')
    })
  })

  it('AC-3101.5: 처음에는 [전체]가 눌려 있고, [미완료]·[완료]를 누르면 그 줄만 남는다. 고른 사람이 거기 없으면 맨 위 사람이 골라진다. 수는 고른 조건 안의 사람 수다', async () => {
    const view = memoView()
    view.targets = { ...view.targets, batch: [row('a'), row('b', { done: true })], left: [{ reason: 'done', rows: [row('c', { done: true, compare: '같음', chip: null })] }, { reason: 'nomemo', rows: [row('d', { hasMemo: false, text: '', chip: null })] }] }
    const { user } = await toMemo(view)
    const shows = within(list()).getByRole('group', { name: '완료로 골라 보기' })
    const pressed = () => within(shows).getAllByRole('button').filter((button) => button.getAttribute('aria-pressed') === 'true').map((button) => button.textContent)
    expect(pressed()).toEqual(['전체 4'])
    expect(rowNames()).toEqual(['가상환자a', '가상환자b', '가상환자c', '가상환자d'])
    await user.click(within(shows).getByRole('button', { name: '완료 2' }))
    expect(pressed()).toEqual(['완료 2'])
    expect(rowNames()).toEqual(['가상환자b', '가상환자c'])
    await waitFor(() => expect(shown()).toBe('가상환자b'))
    await user.click(within(shows).getByRole('button', { name: '미완료 2' }))
    expect(rowNames()).toEqual(['가상환자a', '가상환자d'])
    await waitFor(() => expect(shown()).toBe('가상환자a'))
  })

  it('AC-3101.5·AC-3101.8: [미완료]·[완료]를 눌러도 고른 사람이 남은 줄에 있으면 맨 위로 가지 않고 그 사람 그대로다', async () => {
    const view = memoView()
    view.targets = { ...view.targets, batch: [row('a'), row('b', { done: true }), row('c')], left: [{ reason: 'done', rows: [row('d', { done: true, compare: '같음', chip: null })] }] }
    const { user } = await toMemo(view)
    const shows = within(list()).getByRole('group', { name: '완료로 골라 보기' })
    await user.click(rowOf('가상환자d'))
    expect(shown()).toBe('가상환자d')
    await user.click(within(shows).getByRole('button', { name: '완료 2' }))
    expect(rowNames()).toEqual(['가상환자b', '가상환자d'])
    await settle()
    expect(shown()).toBe('가상환자d')
    expect(rowOf('가상환자d').getAttribute('aria-current')).toBe('true')
    expect(rowOf('가상환자b').getAttribute('aria-current')).toBe('false')
    await user.click(within(shows).getByRole('button', { name: '전체 4' }))
    await user.click(rowOf('가상환자c'))
    await user.click(within(shows).getByRole('button', { name: '미완료 2' }))
    expect(rowNames()).toEqual(['가상환자a', '가상환자c'])
    await settle()
    expect(shown()).toBe('가상환자c')
    expect(rowOf('가상환자c').getAttribute('aria-current')).toBe('true')
  })

  it('AC-3101.3·AC-3105.1: [미완료]·[완료]로 걸러도 입력할 사람 줄 번호는 거르기 전 차례 그대로이고 오른쪽 머리의 {i}와 같다', async () => {
    const view = memoView()
    view.targets = { ...view.targets, batch: [row('a'), row('b', { done: true }), row('c')], left: [{ reason: 'done', rows: [row('d', { done: true, compare: '같음', chip: null })] }] }
    const { user } = await toMemo(view)
    const shows = within(list()).getByRole('group', { name: '완료로 골라 보기' })
    const numberOf = (name: string) => rowOf(name).firstElementChild!.textContent
    const head = () => within(detail()).getByText(/^입력할 사람 \d+ \/ \d+$/).textContent
    expect(['가상환자a', '가상환자b', '가상환자c', '가상환자d'].map(numberOf)).toEqual(['1', '2', '3', ''])
    await user.click(within(shows).getByRole('button', { name: '완료 2' }))
    expect(rowNames()).toEqual(['가상환자b', '가상환자d'])
    expect(numberOf('가상환자b')).toBe('2')
    expect(numberOf('가상환자d')).toBe('')
    await waitFor(() => expect(shown()).toBe('가상환자b'))
    expect(head()).toBe('입력할 사람 2 / 3')
    await user.click(within(shows).getByRole('button', { name: '미완료 2' }))
    expect(rowNames()).toEqual(['가상환자a', '가상환자c'])
    expect(['가상환자a', '가상환자c'].map(numberOf)).toEqual(['1', '3'])
    await user.click(rowOf('가상환자c'))
    expect(head()).toBe('입력할 사람 3 / 3')
  })

  it('AC-3101.6: [미완료] 보기에서 고른 사람을 복사(완료)해도 다른 사람으로 옮길 때까지 목록에 남고, 옮긴 뒤에는 빠진다', async () => {
    const { user } = await toMemo(live(memoView()))
    fakeClipboard()
    await user.click(within(list()).getByRole('button', { name: '미완료 2' }))
    await user.click(copyButton())
    await waitFor(() => expect(rowOf('가상환자a').textContent).toContain('완료'))
    expect(rowNames()).toEqual(['가상환자a', '가상환자b'])
    expect(within(list()).getByRole('button', { name: '미완료 1' })).toBeTruthy()
    expect(shown()).toBe('가상환자a')
    pressKey({ key: 'ArrowDown' })
    await waitFor(() => expect(shown()).toBe('가상환자b'))
    expect(rowNames()).toEqual(['가상환자b'])
  })

  it('AC-3101.8: 입력 방식을 고르면 누르기 전에 다시 물어 목록과 [비트에 입력 (N명)]이 바뀐다(처방코드별을 먼저 고른다)', async () => {
    let current = memoView()
    const { user, worker } = await toMemo(() => current)
    current = memoView({ targets: { ...memoView().targets, batch: [row('z')] } })
    await user.click(screen.getByRole('radio', { name: '처방코드별' }))
    await screen.findByRole('button', { name: '비트에 입력 (1명)' })
    expect(worker.of('memoView').at(-1)?.selection).toMatchObject({ mode: 'code' })
    expect(rowNames()).toEqual(['가상환자z'])
    await waitFor(() => expect(shown()).toBe('가상환자z'))
  })

  it('AC-3101.8: 고른 조건이 바뀌어 새 목록이 와도 고른 사람이 있으면 그대로이고, 없으면 맨 위 사람이다', async () => {
    let current = memoView()
    const { user } = await toMemo(() => current)
    await user.click(rowOf('가상환자b'))
    current = memoView({ targets: { ...memoView().targets, batch: [row('z'), row('b')] } })
    await user.click(screen.getByRole('radio', { name: '처방코드별' }))
    await waitFor(() => expect(rowNames()).toEqual(['가상환자z', '가상환자b']))
    expect(shown()).toBe('가상환자b')
    expect(rowOf('가상환자b').getAttribute('aria-current')).toBe('true')
    current = memoView({ targets: { ...memoView().targets, batch: [row('y'), row('z')] } })
    await user.click(screen.getByRole('radio', { name: '날짜별' }))
    await waitFor(() => expect(rowNames()).toEqual(['가상환자y', '가상환자z']))
    await waitFor(() => expect(shown()).toBe('가상환자y'))
  })

  it('AC-3101.8: 메모 보기를 다시 받아도(저장 뒤) 고른 사람과 목록 스크롤이 그대로다', async () => {
    const { user, worker } = await toMemo()
    await user.click(rowOf('가상환자b'))
    const scroller = list().querySelector('.overflow-y-auto') as HTMLElement
    scroller.scrollTop = 40
    const asked = worker.of('memoView').length
    await act(async () => worker.emit({ type: 'memoSave', ok: true }))
    await waitFor(() => expect(worker.of('memoView').length).toBeGreaterThan(asked))
    await settle()
    expect(shown()).toBe('가상환자b')
    expect(rowOf('가상환자b').getAttribute('aria-current')).toBe('true')
    expect((list().querySelector('.overflow-y-auto') as HTMLElement).scrollTop).toBe(40)
  })
})

describe('REQ-3102 사람 옮기기', () => {
  it('AC-3102.1: 목록의 줄을 누르면 그 사람이 골라지고(aria-current) 오른쪽 상세가 그 사람으로 바뀌며 맨 위로 간다', async () => {
    const { user } = await toMemo()
    detail().scrollTop = 120
    await user.click(rowOf('가상환자b'))
    expect(rowOf('가상환자b').getAttribute('aria-current')).toBe('true')
    expect(rowOf('가상환자a').getAttribute('aria-current')).toBe('false')
    expect(shown()).toBe('가상환자b')
    expect(within(detail()).getByRole('region', { name: '증상 · 차트 원문' }).textContent).toContain('가상 증상 b')
    expect(ourMemo()).toBe('우리 메모 b')
    expect(detail().scrollTop).toBe(0)
  })

  it('AC-3102.3: ↑·↓ 키는 보이는 목록 차례대로 앞·뒤 사람으로 옮기고 페이지는 스크롤되지 않는다(preventDefault)', async () => {
    const view = memoView()
    view.targets = { ...view.targets, left: [{ reason: 'unread', rows: [row('c', { chip: null })] }] }
    await toMemo(view)
    expect(pressKey({ key: 'ArrowDown' })).toBe(false)
    expect(shown()).toBe('가상환자b')
    pressKey({ key: 'ArrowDown' })
    expect(shown()).toBe('가상환자c')
    expect(pressKey({ key: 'ArrowDown' })).toBe(false)
    expect(shown()).toBe('가상환자c')
    pressKey({ key: 'ArrowUp' })
    expect(shown()).toBe('가상환자b')
    expect(rowOf('가상환자b').getAttribute('aria-current')).toBe('true')
  })

  it('AC-3102.3: 확인 표시 알림 창이 떠 있으면 ↑·↓로 옮기지 않는다', async () => {
    const view = memoView()
    view.targets = { ...view.targets, left: [{ reason: 'mark', rows: [row('m', { unfinished: true, chip: null })] }] }
    const { user } = await toMemo(view)
    await user.click(inputButton())
    expect(screen.getByRole('dialog')).toBeTruthy()
    pressKey({ key: 'ArrowDown' })
    expect(shown()).toBe('가상환자a')
  })
})

describe('AC-3102.5 처음 고를 때 비트 메모 한 번 읽기', () => {
  const pending = () => {
    const calls: { resolve(id: string): void; reject(code: string): void }[] = []
    return { calls, memos: () => new Promise<{ id: string; count: number }>((resolve, reject) => calls.push({ resolve: (id) => resolve({ id, count: 1 }), reject: (code) => reject(new BridgeError(code)) })) }
  }

  it('AC-3102.5: 화면을 열 때 맨 위 사람이 저절로 골라지는 것으로는 읽지 않고, 사람이 처음 줄을 누르면 claim.memos를 한 번 읽으며 두 번째부터는 읽지 않는다', async () => {
    const link = bridge()
    const { user } = await toMemo(memoView(), link)
    await settle()
    expect(shown()).toBe('가상환자a')
    expect(memoCalls(link)).toBe(1) // [자료 불러오기]의 claim.memos 하나뿐이다
    await user.click(rowOf('가상환자b'))
    await waitFor(() => expect(memoCalls(link)).toBe(2))
    await user.click(rowOf('가상환자a'))
    pressKey({ key: 'ArrowDown' })
    await settle()
    expect(memoCalls(link)).toBe(2)
    expect(link.stream.mock.calls.filter(([cmd]) => cmd === 'claim.month')).toHaveLength(1)
    expect(within(detail()).getAllByRole('group', { name: '비트에 저장된 청구메모' })).toHaveLength(1)
  })

  it('AC-3102.5: 처음 고르는 것이 ↓ 키여도 한 번 읽는다', async () => {
    const link = bridge()
    await toMemo(memoView(), link)
    await settle()
    expect(memoCalls(link)).toBe(1)
    pressKey({ key: 'ArrowDown' })
    await waitFor(() => expect(memoCalls(link)).toBe(2))
    expect(shown()).toBe('가상환자b')
  })

  it('AC-3102.5: 입력 중에는 처음 골라도 읽지 않는다', async () => {
    const link = bridge()
    const { user } = await toMemo(memoView(), link)
    await user.click(inputButton())
    await screen.findByRole('status', { name: '입력 진행' })
    await user.click(rowOf('가상환자b'))
    await settle()
    expect(memoCalls(link)).toBe(1)
    expect(shown()).toBe('가상환자b')
    expect(within(detail()).getByRole('group', { name: '비트에 저장된 청구메모' }).textContent).toContain('입력이 끝난 뒤')
  })

  it('AC-3102.5: 저절로 읽기가 실패해도 다시 저절로 읽지 않는다', async () => {
    const gate = pending()
    let first = true
    const memos = () => {
      if (first) {
        first = false
        return Promise.resolve({ id: 'first', count: 1 })
      }
      return gate.memos()
    }
    const link = bridge({ memos })
    const { user } = await toMemo(memoView(), link)
    await user.click(rowOf('가상환자b'))
    await waitFor(() => expect(gate.calls).toHaveLength(1))
    await act(async () => gate.calls[0].reject('E-HELPER-TIMEOUT'))
    await screen.findByRole('button', { name: '비트 메모 전체 불러오기' })
    await user.click(rowOf('가상환자a'))
    pressKey({ key: 'ArrowDown' })
    await settle()
    expect(memoCalls(link)).toBe(2)
  })

  it('AC-3102.5: 새 [자료 불러오기] 뒤 처음 고르면 다시 한 번 읽는다', async () => {
    const link = bridge()
    const { user } = await toMemo(memoView(), link)
    await user.click(rowOf('가상환자b'))
    await waitFor(() => expect(screen.getByRole('button', { name: '비트 메모 전체 다시 불러오기' })).toBeTruthy())
    await user.click(screen.getByRole('button', { name: /날짜 고르기/ }))
    await user.click(await screen.findByRole('button', { name: '자료 불러오기' }))
    await user.click(await screen.findByRole('button', { name: '다음: 메모 확인' }))
    await screen.findByRole('button', { name: '비트 메모 전체 불러오기' })
    await settle()
    const before = memoCalls(link)
    await user.click(await within(list()).findByRole('button', { name: /가상환자b/ }))
    await waitFor(() => expect(memoCalls(link)).toBe(before + 1))
  })
})

describe('REQ-3103 복사(완료)', () => {
  it('AC-3103.1: 초록 [C 복사(완료)]를 누르면 확인 창 없이 고른 사람의 우리 메모가 클립보드에 들어간다', async () => {
    const { user } = await toMemo()
    const clip = fakeClipboard()
    await user.click(rowOf('가상환자b'))
    expect(copyButton().getAttribute('aria-label')).toBe('C 복사(완료)')
    await user.click(copyButton())
    await waitFor(() => expect(clip.writes).toEqual(['우리 메모 b']))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('AC-3103.1: C 키도 같다: 한글 자판이어도 같은 자리 키(code KeyC)이고 눌러 둔 채 반복은 무시한다', async () => {
    const { worker } = await toMemo()
    const clip = fakeClipboard()
    expect(pressKey({ key: 'ㅊ', code: 'KeyC' })).toBe(false)
    await waitFor(() => expect(clip.writes).toEqual(['우리 메모 a']))
    await waitFor(() => expect(worker.of('memoCopied')).toHaveLength(1))
    pressKey({ key: 'ㅊ', code: 'KeyC', repeat: true })
    await settle()
    expect(clip.writes).toHaveLength(1)
    expect(worker.of('memoCopied')).toHaveLength(1)
  })

  it('AC-3103.1: 고친 글이 있으면 그 글을 복사하고 같은 글을 memoCopied로 보낸다', async () => {
    const { user, worker } = await toMemo()
    const clip = fakeClipboard()
    await user.click(within(detail()).getByRole('button', { name: '메모 고치기' }))
    await user.type(screen.getByRole('textbox', { name: '가상환자a 우리 메모 고치기' }), ' 더')
    await user.tab()
    await waitFor(() => expect(worker.of('editMemo')).toEqual([{ type: 'editMemo', visitKey: 'a', text: '우리 메모 a 더' }]))
    await user.click(copyButton())
    await waitFor(() => expect(clip.writes).toEqual(['우리 메모 a 더']))
    expect(worker.of('memoCopied')).toEqual([{ type: 'memoCopied', visitKey: 'a', text: '우리 메모 a 더' }])
  })

  it('AC-3103.2: 복사가 되면 Worker에 memoCopied(내원번호·글)를 보내고 메모 보기를 다시 받는다. 그 사람은 완료이고 단추는 [C 다시 복사]와 옆 [완료 풀기]이며 상태 줄은 복사했고 완료했어요다', async () => {
    const { user, worker } = await toMemo(live(memoView()))
    fakeClipboard()
    expect(within(detail()).queryByRole('button', { name: '완료 풀기' })).toBeNull()
    await user.click(copyButton())
    await waitFor(() => expect(copyButton().getAttribute('aria-label')).toBe('C 다시 복사'))
    expect(worker.of('memoCopied')).toEqual([{ type: 'memoCopied', visitKey: 'a', text: '우리 메모 a' }])
    const types = worker.posted.map((m) => m.type)
    expect(types.lastIndexOf('memoView')).toBeGreaterThan(types.indexOf('memoCopied'))
    expect(rowOf('가상환자a').textContent).toContain('완료')
    expect(within(detail()).getByRole('button', { name: '완료 풀기' })).toBeTruthy()
    expect(statusLine().getAttribute('role')).toBe('status')
    expect(statusLine().textContent).toBe('복사했고 완료했어요. 비트 메모 칸에 붙여 넣으세요.')
  })

  it('AC-3103.2: [완료 풀기]를 누르면 Worker에 memoUndone을 보내고 메모 보기를 다시 받아 완료가 풀린다(AC-3104.2)', async () => {
    const { user, worker } = await toMemo(live(memoView()))
    fakeClipboard()
    await user.click(copyButton())
    const undo = await within(detail()).findByRole('button', { name: '완료 풀기' })
    await user.click(undo)
    expect(worker.of('memoUndone')).toEqual([{ type: 'memoUndone', visitKey: 'a' }])
    await waitFor(() => expect(copyButton().getAttribute('aria-label')).toBe('C 복사(완료)'))
    expect(rowOf('가상환자a').textContent).not.toContain('완료')
    expect(within(detail()).queryByRole('button', { name: '완료 풀기' })).toBeNull()
    expect(statusLine().textContent).toBe('누르면 우리 메모가 복사되고 완료로 바뀌어요. 그다음 비트 메모 칸에 붙여 넣으세요.')
  })

  it('AC-3103.3: 복사가 안 되면 Worker에 보내지 않고 완료로 바뀌지 않으며, 줄에 복사 못 함이 남고 상태 줄은 오류 알림이다. 다시 눌러 되면 복사 못 함이 지워진다', async () => {
    const { user, worker } = await toMemo(live(memoView()))
    const clip = fakeClipboard()
    clip.fail = true
    await user.click(copyButton())
    const alert = await within(detail()).findByRole('alert')
    expect(alert.textContent).toBe('복사하지 못했어요. 완료로 바뀌지 않았어요. 다시 눌러 주세요.')
    expect(alert.getAttribute('class')).toContain('text-negative')
    expect(worker.of('memoCopied')).toEqual([])
    expect(rowOf('가상환자a').textContent).toContain('복사 못 함')
    expect(rowOf('가상환자a').textContent).not.toContain('완료')
    expect(copyButton().getAttribute('aria-label')).toBe('C 복사(완료)')
    clip.fail = false
    await user.click(copyButton())
    await waitFor(() => expect(worker.of('memoCopied')).toHaveLength(1))
    await waitFor(() => expect(rowOf('가상환자a').textContent).not.toContain('복사 못 함'))
    expect(within(detail()).queryByRole('alert')).toBeNull()
  })

  it('AC-3103.3: 이미 완료였던 사람은 다시 복사하지 못해도 완료는 그대로라는 오류 글이고 아무것도 보내지 않는다', async () => {
    const view = memoView()
    view.targets = { ...view.targets, batch: [], left: [{ reason: 'done', rows: [row('c', { done: true, compare: '같음', chip: null })] }] }
    const { user, worker } = await toMemo(view)
    const clip = fakeClipboard()
    clip.fail = true
    expect(copyButton().getAttribute('aria-label')).toBe('C 다시 복사')
    await user.click(copyButton())
    expect((await within(detail()).findByRole('alert')).textContent).toBe('다시 복사하지 못했어요. 완료는 그대로예요. 다시 눌러 주세요.')
    expect(worker.of('memoCopied')).toEqual([])
    expect(rowOf('가상환자c').textContent).toContain('완료')
    expect(rowOf('가상환자c').textContent).toContain('복사 못 함')
  })

  it('AC-3103.4: 복사가 오래 걸리면 단추는 복사 중…으로 막히고 C도 무시된다. 그사이 다른 사람으로 옮겨도 완료는 누른 사람에게 붙는다', async () => {
    const { user, worker } = await toMemo(live(memoView()))
    const clip = fakeClipboard()
    clip.hold = true
    await user.click(copyButton())
    expect(copyButton().getAttribute('aria-label')).toBe('복사 중…')
    expect(copyButton().disabled).toBe(true)
    pressKey({ key: 'c', code: 'KeyC' })
    expect(clip.writes).toEqual(['우리 메모 a'])
    await user.click(rowOf('가상환자b'))
    expect(shown()).toBe('가상환자b')
    expect(copyButton().disabled).toBe(true)
    pressKey({ key: 'c', code: 'KeyC' })
    expect(clip.writes).toEqual(['우리 메모 a'])
    await act(async () => clip.held!.ok())
    await waitFor(() => expect(worker.of('memoCopied')).toEqual([{ type: 'memoCopied', visitKey: 'a', text: '우리 메모 a' }]))
    await waitFor(() => expect(rowOf('가상환자a').textContent).toContain('완료'))
    expect(shown()).toBe('가상환자b')
    expect(rowOf('가상환자b').textContent).not.toContain('완료')
    expect(copyButton().disabled).toBe(false)
    expect(statusLine().textContent).toBe('누르면 우리 메모가 복사되고 완료로 바뀌어요. 그다음 비트 메모 칸에 붙여 넣으세요.')
  })

  it('AC-3103.4: 오래 걸린 복사가 실패하면 옮긴 뒤에도 누른 사람 줄에 복사 못 함이 남고 지금 사람의 상태 줄은 그대로다', async () => {
    const { user, worker } = await toMemo(live(memoView()))
    const clip = fakeClipboard()
    clip.hold = true
    await user.click(copyButton())
    await user.click(rowOf('가상환자b'))
    await act(async () => clip.held!.no())
    await waitFor(() => expect(rowOf('가상환자a').textContent).toContain('복사 못 함'))
    expect(rowOf('가상환자b').textContent).not.toContain('복사 못 함')
    expect(within(detail()).queryByRole('alert')).toBeNull()
    expect(worker.of('memoCopied')).toEqual([])
  })

  it('AC-3103.6: 저장이 막혀 있으면 초록 단추·[완료 풀기]가 막히고 C도 무시되며 상태 줄은 저장이 막혀 있는 동안이다', async () => {
    const view = memoView()
    view.targets = { ...view.targets, batch: [row('a', { done: true }), row('b')] }
    const { worker } = await toMemo(view, refusedStore())
    const clip = fakeClipboard()
    expect(copyButton().disabled).toBe(true)
    expect((within(detail()).getByRole('button', { name: '완료 풀기' }) as HTMLButtonElement).disabled).toBe(true)
    expect(statusLine().textContent).toBe('저장이 막혀 있는 동안에는 복사할 수 없어요.')
    pressKey({ key: 'c', code: 'KeyC' })
    await settle()
    expect(clip.writes).toEqual([])
    expect(worker.of('memoCopied')).toEqual([])
  })

  it('AC-3103.6: 입력 중·확인 기다리는 중에는 초록 단추·[완료 풀기]가 막히고 C도 무시되며 상태 줄은 입력 중이다', async () => {
    const view = memoView()
    view.targets = { ...view.targets, batch: [row('a', { done: true }), row('b')] }
    const { user, worker } = await toMemo(view)
    const clip = fakeClipboard()
    await user.click(inputButton(1))
    await screen.findByRole('status', { name: '입력 진행' })
    expect(copyButton().disabled).toBe(true)
    expect((within(detail()).getByRole('button', { name: '완료 풀기' }) as HTMLButtonElement).disabled).toBe(true)
    expect(statusLine().textContent).toBe('입력 중에는 복사할 수 없어요.')
    pressKey({ key: 'c', code: 'KeyC' })
    await settle()
    expect(clip.writes).toEqual([])
    expect(worker.of('memoCopied')).toEqual([])
  })

  it('AC-3103.7: 다른 사람으로 옮기면 앞 사람의 잠깐 글(복사했고 완료했어요)은 지우고 새 사람의 상태를 보이며, 돌아오면 완료한 환자예요다', async () => {
    const { user } = await toMemo(live(memoView()))
    fakeClipboard()
    await user.click(copyButton())
    await waitFor(() => expect(statusLine().textContent).toBe('복사했고 완료했어요. 비트 메모 칸에 붙여 넣으세요.'))
    await user.click(within(detail()).getByRole('button', { name: '↓ 다음 사람' }))
    expect(shown()).toBe('가상환자b')
    expect(statusLine().textContent).toBe('누르면 우리 메모가 복사되고 완료로 바뀌어요. 그다음 비트 메모 칸에 붙여 넣으세요.')
    await user.click(within(detail()).getByRole('button', { name: '↑ 앞 사람' }))
    expect(shown()).toBe('가상환자a')
    expect(statusLine().textContent).toBe('완료한 환자예요. 다시 복사해도 완료는 그대로예요.')
  })

  it('AC-3103.7: 복사 실패는 다른 사람으로 옮겼다 돌아와도 그 사람에게 남는다', async () => {
    const { user } = await toMemo(live(memoView()))
    const clip = fakeClipboard()
    clip.fail = true
    await user.click(copyButton())
    await within(detail()).findByRole('alert')
    await user.click(rowOf('가상환자b'))
    expect(within(detail()).queryByRole('alert')).toBeNull()
    await user.click(rowOf('가상환자a'))
    expect(within(detail()).getByRole('alert').textContent).toBe('복사하지 못했어요. 완료로 바뀌지 않았어요. 다시 눌러 주세요.')
  })
})

describe('REQ-3104 완료와 [비트에 입력]', () => {
  it('AC-3104.5: [비트에 입력 (N명)]의 N과 위 요약의 그중 완료 수는 입력할 사람 묶음의 완료를 빼고·세며, 복사로 완료하면 바로 바뀐다', async () => {
    const view = memoView()
    view.targets = { ...view.targets, batch: [row('a'), row('b', { done: true }), row('c')], left: [{ reason: 'nomemo', rows: [row('n', { hasMemo: false, text: '', chip: null })] }] }
    const { user } = await toMemo(live(view))
    fakeClipboard()
    expect(toolbar().textContent).toContain('3명 입력해요 · 그중 완료 1명 · 빠지는 사람 1명')
    expect(inputButton(2)).toBeTruthy()
    await user.click(copyButton())
    await screen.findByRole('button', { name: '비트에 입력 (1명)' })
    expect(toolbar().textContent).toContain('3명 입력해요 · 그중 완료 2명 · 빠지는 사람 1명')
  })

  it('AC-3104.5: 확인 표시 알림의 [빼고 N명 입력]도 완료를 뺀 수다', async () => {
    const view = memoView()
    view.targets = { ...view.targets, batch: [row('a'), row('b', { done: true })], left: [{ reason: 'mark', rows: [row('m', { unfinished: true, chip: null })] }] }
    const { user, worker } = await toMemo(view)
    await user.click(inputButton(1))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '빼고 1명 입력' }))
    expect(worker.of('buildInputBatch')).toHaveLength(1)
  })

  it('AC-3104.6: 완료한 사람의 메모를 고쳐 칸 밖을 누르면 완료가 풀리고, 상태 줄은 주황으로 메모를 고쳐서 완료가 풀렸어요이며 복사했어요 글은 지운다', async () => {
    const { user, worker } = await toMemo(live(memoView()))
    fakeClipboard()
    await user.click(copyButton())
    await waitFor(() => expect(statusLine().textContent).toBe('복사했고 완료했어요. 비트 메모 칸에 붙여 넣으세요.'))
    await user.click(within(detail()).getByRole('button', { name: '메모 고치기' }))
    expect(statusLine().textContent).toBe('우리 메모를 고치는 중이에요. 칸 밖을 누르면 반영돼요.')
    expect(copyButton().disabled).toBe(true)
    await user.type(screen.getByRole('textbox', { name: '가상환자a 우리 메모 고치기' }), ' 더')
    await user.tab()
    await waitFor(() => expect(worker.of('editMemo')).toEqual([{ type: 'editMemo', visitKey: 'a', text: '우리 메모 a 더' }]))
    await waitFor(() => expect(rowOf('가상환자a').textContent).not.toContain('완료'))
    expect(statusLine().textContent).toBe('!메모를 고쳐서 완료가 풀렸어요. 고친 메모를 다시 복사(완료)해 주세요.')
    expect(statusLine().getAttribute('class')).toContain('text-warning')
    expect(screen.queryByText('복사했고 완료했어요.')).toBeNull()
    expect(ourMemo()).toBe('우리 메모 a 더')
  })

  it('AC-3104.6: 글을 그대로 두고 칸 밖을 누르면 보내지 않고 완료도 상태 줄도 풀리지 않는다', async () => {
    const { user, worker } = await toMemo(live(memoView()))
    fakeClipboard()
    await user.click(copyButton())
    await within(detail()).findByRole('button', { name: '완료 풀기' })
    await user.click(within(detail()).getByRole('button', { name: '메모 고치기' }))
    await user.tab()
    await settle()
    expect(worker.of('editMemo')).toEqual([])
    expect(rowOf('가상환자a').textContent).toContain('완료')
    expect(statusLine().textContent).toBe('완료한 환자예요. 다시 복사해도 완료는 그대로예요.')
  })
})

describe('REQ-3105 오른쪽 상세', () => {
  it('AC-3105.4: [메모 고치기]를 누르면 고른 사람의 우리 메모 칸이 그 자리에서 고치는 칸(초점)이 되고 아래 증상·처방 표가 보인다. 칸 밖으로 다른 사람 줄을 누르면 반영되고 그 클릭도 먹힌다', async () => {
    const { user, worker } = await toMemo()
    await user.click(within(detail()).getByRole('button', { name: '메모 고치기' }))
    const box = screen.getByRole('textbox', { name: '가상환자a 우리 메모 고치기' })
    expect(document.activeElement).toBe(box)
    expect(within(detail()).getByRole('group', { name: '우리 메모' }).contains(box)).toBe(true)
    expect(within(detail()).getByRole('region', { name: '증상 · 차트 원문' }).textContent).toContain('가상 증상 a')
    expect(within(detail()).getByRole('region', { name: '처방내역' }).textContent).toContain('가상시술 가')
    await user.type(box, '더')
    await user.click(rowOf('가상환자b'))
    await waitFor(() => expect(worker.of('editMemo')).toEqual([{ type: 'editMemo', visitKey: 'a', text: '우리 메모 a더' }]))
    expect(shown()).toBe('가상환자b')
    expect(screen.queryByRole('textbox', { name: /우리 메모 고치기/ })).toBeNull()
  })

  it("AC-3105.2·AC-3105.4: 글을 다 지워 '메모 없음'으로 간 사람(우리 메모는 있고 글이 빔)도 [메모 고치기]로 고치는 칸이 열리고, 글을 쓰고 칸 밖을 누르면 editMemo가 간다. 복사는 막힌 채다", async () => {
    const view = memoView()
    view.targets = { ...view.targets, left: [{ reason: 'nomemo', rows: [row('e', { hasMemo: true, text: '', chip: null })] }] }
    const { user, worker } = await toMemo(live(view))
    await user.click(rowOf('가상환자e'))
    expect(shown()).toBe('가상환자e')
    expect(copyButton().disabled).toBe(true)
    expect(statusLine().textContent).toBe('우리 메모가 없어 복사할 게 없어요.')
    await user.click(within(detail()).getByRole('button', { name: '메모 고치기' }))
    const box = screen.getByRole('textbox', { name: '가상환자e 우리 메모 고치기' }) as HTMLTextAreaElement
    expect(document.activeElement).toBe(box)
    expect(box.value).toBe('')
    expect(copyButton().disabled).toBe(true)
    await user.type(box, '다시 쓴 메모 e')
    await user.tab()
    await waitFor(() => expect(worker.of('editMemo')).toEqual([{ type: 'editMemo', visitKey: 'e', text: '다시 쓴 메모 e' }]))
    expect(screen.queryByRole('textbox', { name: /우리 메모 고치기/ })).toBeNull()
    await waitFor(() => expect(ourMemo()).toBe('다시 쓴 메모 e'))
  })

  it('AC-3105.2: 지운 글을 고치는 칸에서 빈 채로 나가면 보내지 않고 복사도 막힌 채다', async () => {
    const view = memoView()
    view.targets = { ...view.targets, left: [{ reason: 'nomemo', rows: [row('e', { hasMemo: true, text: '', chip: null })] }] }
    const { user, worker } = await toMemo(live(view))
    await user.click(rowOf('가상환자e'))
    await user.click(within(detail()).getByRole('button', { name: '메모 고치기' }))
    await user.tab()
    await settle()
    expect(worker.of('editMemo')).toEqual([])
    expect(copyButton().disabled).toBe(true)
    expect(within(detail()).getByRole('button', { name: '메모 고치기' })).toBeTruthy()
  })

  it('AC-3105.6: 점검 결과의 [메모 확인에서 고치기]로 오면 그 사람이 골라지고 고치는 칸이 열려 초점이 있다', async () => {
    const { link, box } = await fromCheck()
    expect(document.activeElement).toBe(box)
    expect(shown()).toBe('가상환자b')
    expect(rowOf('가상환자b').getAttribute('aria-current')).toBe('true')
    expect(memoCalls(link)).toBe(1)
  })
})

describe('REQ-3106 위 도구 줄', () => {
  it('AC-3106.1: 두 칸 위 도구 줄 첫 줄에 요약·[비트 메모 전체 불러오기]·흰 [비트에 입력 (N명)]과 옆 글이 있고, 그 아래가 입력 방식 한 줄이다', async () => {
    await toMemo()
    const bar = toolbar()
    expect(bar.textContent).toContain('2명 입력해요 · 그중 완료 0명 · 빠지는 사람 0명')
    expect(within(bar).getByText('완료 0명').querySelector('svg')).not.toBeNull() // 기호는 공용 Icon(check)
    const read = within(bar).getByRole('button', { name: '비트 메모 전체 불러오기' })
    const input = within(bar).getByRole('button', { name: '비트에 입력 (2명)' })
    expect(input.getAttribute('class')!.split(/\s+/)).toContain('bg-surface')
    expect(input.getAttribute('class')!.split(/\s+/)).not.toContain('bg-accent')
    expect(bar.textContent).toContain('누르면 PC 화면에 확인 창이 떠요. 거기서 [확인]을 눌러야 들어가요.')
    const mode = within(bar).getByRole('region', { name: '입력 방식' })
    expect(read.compareDocumentPosition(mode) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(input.compareDocumentPosition(mode) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('AC-3106.4: 아래 메모 표(진료일·차트번호·환자·처방·메모·비교·상태)와 [아직 입력 안 된 것만]·[다음 8명]이 없다', async () => {
    await toMemo(memoView({ table: Array.from({ length: 10 }, (_, i) => tableRow(i === 0 ? 'a' : i === 1 ? 'b' : `t${i}`)) }))
    expect(screen.queryByRole('table', { name: '메모' })).toBeNull()
    expect(screen.queryByRole('region', { name: '메모 표' })).toBeNull()
    expect(screen.queryByRole('button', { name: '아직 입력 안 된 것만' })).toBeNull()
    expect(screen.queryByRole('button', { name: /다음 8명/ })).toBeNull()
    expect(screen.queryByRole('textbox', { name: '가상환자a 메모' })).toBeNull()
  })
})

describe('REQ-3107 지금 것은 그대로', () => {
  const ROOT = process.cwd()
  const walk = (dir: string): string[] =>
    readdirSync(join(ROOT, dir)).flatMap((name) => {
      const path = `${dir}/${name}`
      return statSync(join(ROOT, path)).isDirectory() ? walk(path) : [path]
    })

  it('AC-3107.2: 메모 표와 옛 목록(MemoTable·MemoRows) 파일과 그 시험이 없고 메모 칸은 불러오지 않는다', () => {
    for (const file of ['MemoRows.tsx', 'MemoRows.test.tsx', 'MemoTable.tsx', 'MemoTable.test.tsx']) expect(existsSync(join(ROOT, 'src/components/claim/rows', file)), file).toBe(false)
    const panel = readFileSync(join(ROOT, 'src/components/claim/memo/MemoPanel.tsx'), 'utf8')
    expect(panel).not.toMatch(/rows\/Memo(Rows|Table)/)
    expect(panel).toContain("from '../rows/MemoList'")
    expect(panel).toContain("from '../rows/MemoDetail'")
  })

  it('AC-3107.3: 클립보드는 components/claim/memo에서만 쓴다(청구 소스에서 clipboard·execCommand는 copyMemo.ts뿐이다)', () => {
    const sources = walk('src/components/claim').filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
    expect(sources.filter((file) => /\b(clipboard|execCommand)\b/.test(readFileSync(join(ROOT, file), 'utf8')))).toEqual(['src/components/claim/memo/copyMemo.ts'])
    expect(readFileSync(join(ROOT, 'src/components/claim/memo/MemoPanel.tsx'), 'utf8')).toContain("import { copyText } from './copyMemo'")
  })
})

describe('AC-018.2 메모 고치기와 저장', () => {
  it('AC-018.2: 고치고 칸 밖을 누르면 Worker에 보내고, 저장 실패면 오류와 [다시 저장]을 보이며 고친 글을 그대로 둔다', async () => {
    const { user, worker } = await toMemo()
    await user.click(within(detail()).getByRole('button', { name: '메모 고치기' }))
    await user.type(screen.getByRole('textbox', { name: '가상환자a 우리 메모 고치기' }), '더')
    await user.tab()
    await waitFor(() => expect(worker.of('editMemo')).toEqual([{ type: 'editMemo', visitKey: 'a', text: '우리 메모 a더' }]))
    await act(async () => worker.emit({ type: 'memoSave', ok: false, code: 'E-STORE-FAILED', blocked: false }))
    expect(screen.getByRole('alert').textContent).toContain('오류 번호 E-STORE-FAILED')
    expect(ourMemo()).toBe('우리 메모 a더')
    await user.click(screen.getByRole('button', { name: '다시 저장' }))
    expect(worker.of('memoSaveRetry')).toHaveLength(1)
    await act(async () => worker.emit({ type: 'memoSave', ok: true }))
    expect(screen.queryByRole('button', { name: '다시 저장' })).toBeNull()
  })

  it('AC-014.11: 고쳤다 되돌린 글은 보내지 않고, [다시 점검]으로 자동 메모가 달라지면 새 글을 보인다', async () => {
    db.hospital = { phrases: {}, dx_links: [] }
    let current = memoView()
    const { user, worker } = await toMemo(() => current)
    await user.click(within(detail()).getByRole('button', { name: '메모 고치기' }))
    const box = screen.getByRole('textbox', { name: '가상환자a 우리 메모 고치기' })
    await user.type(box, '더')
    await user.type(box, '{Backspace}')
    await user.tab()
    expect(worker.of('editMemo')).toEqual([])
    expect(ourMemo()).toBe('우리 메모 a')
    db.hospital = { phrases: { changed: true }, dx_links: [] }
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })
    const recheck = await screen.findByRole('button', { name: '다시 점검' })
    current = memoView({ targets: { ...memoView().targets, batch: [row('a', { text: '새 자동 메모 a' }), row('b')] } })
    await user.click(recheck)
    await waitFor(() => expect(worker.of('check')).toHaveLength(2))
    await waitFor(() => expect(ourMemo()).toBe('새 자동 메모 a'))
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
    await user.click(screen.getByRole('radio', { name: '처방코드별' }))
    expect((await screen.findByRole('alert')).textContent).toContain('오류 번호 E-CLAIM-PARTIAL')
    expect(screen.getByRole('button', { name: '다시 불러오기' })).toBeTruthy()
    expect(list()).toBeTruthy()
    memoAnswer.fail = null
    current = memoView()
    await user.click(screen.getByRole('radio', { name: '날짜별' }))
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

  it('AC-018.3·AC-3107.1: 누른 뒤 확인 기다리는 중 안내와 묶음의 수가 보이고, 진행이 오면 숫자가 되며 화면에 이름이 없다. 안내 글 끝은 "…환자 목록에 보여요."다', async () => {
    const { user, worker } = await toMemo()
    await user.click(inputButton())
    const wait = await screen.findByRole('status', { name: '입력 진행' })
    expect(wait.textContent).toContain('확인 기다리는 중')
    expect(wait.textContent).toContain('PC 화면의 확인 창에서 [확인]을 눌러 주세요')
    expect(wait.textContent).toContain('[취소]를 누르거나 창을 닫거나 5분이 지나면 아무것도 넣지 않아요.')
    expect(wait.textContent).toContain('0 / 2명')
    expect(wait.textContent).toContain('다른 탭으로 옮겨도 입력은 PC에서 계속돼요. 결과는 끝난 뒤 [자료 불러오기]를 누르면 환자 목록에 보여요.')
    expect(wait.textContent).not.toContain('메모 표')
    expect(worker.of('buildInputBatch').at(-1)).toMatchObject({ what: 'selection' })
    await act(async () => progress.fn?.({ id: 'x', done: 1, total: 3 }))
    const run = screen.getByRole('status', { name: '입력 진행' })
    expect(run.textContent).toContain('입력 중')
    expect(run.textContent).toContain('1 / 3명')
    expect(run.textContent).toContain('다른 탭으로 옮겨도 입력은 PC에서 계속돼요. 결과는 끝난 뒤 [자료 불러오기]를 누르면 환자 목록에 보여요.')
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
    const link = blocked ? refusedStore() : bridge()
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
    const { user } = await toMemo()
    db.hospital = { phrases: { changed: true }, dx_links: [] }
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })
    const band = (await screen.findByRole('button', { name: '다시 점검' })).closest('[role=status]')!
    const panel = screen.getByRole('region', { name: '입력 방식' })
    expect(band.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /점검 결과/ }))
    expect(screen.getByRole('button', { name: '다시 점검' })).toBeTruthy()
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
    expect(screen.queryByRole('region', { name: '환자 목록' })).toBeNull()
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

  it('AC-3107.1: [먼저 고치기]는 첫 사람을 골라 그 사람의 고치는 칸을 열고 입력하지 않는다', async () => {
    const { user, worker } = await toMemo(marked([row('a')]))
    await user.click(inputButton(1))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '먼저 고치기' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(shown()).toBe('가상환자m1')
    expect(rowOf('가상환자m1').getAttribute('aria-current')).toBe('true')
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: '가상환자m1 우리 메모 고치기' }))
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
  const LINES = ['등록한 기관기호가 바뀌어 이전 병원의 저장 파일이 남아 있어요', '지금은 이 PC에 저장되지 않아요. 고친 메모는 이 화면에 그대로 있어요.', '이 달은 저장이 막혀 있어요. 이어서 하려면 개발자에게 도움을 요청해 주세요. 등록한 기관기호는 [설정 → 비트 PC 연결]에서 확인할 수 있어요.', '오류 번호 E-BIT-HOSPITAL-MISMATCH']

  it('AC-018.17: store.load에서 받아도 멈추지 않고 목록과 세 줄의 글을 보이고, [다시 등록] 글과 지우는 단추가 없다', async () => {
    const { worker } = await toMemo(memoView(), refusedStore())
    const card = screen.getByRole('alert')
    for (const text of LINES) expect(card.textContent).toContain(text)
    expect(card.textContent).not.toContain('[다시 등록]')
    expect(screen.queryByRole('button', { name: /지우|처음부터/ })).toBeNull()
    expect(list()).toBeTruthy()
    expect(worker.of('storeBlock')).toEqual([{ type: 'storeBlock' }])
  })

  it('AC-018.17: 고른 사람의 고친 글이 저장되지 않았으면 우리 메모 칸 아래에 저장 안 됨을 보인다', async () => {
    await toMemo(memoView({ table: [tableRow('a', { edited: true, unsaved: true }), tableRow('b')] }), refusedStore())
    expect(within(detail()).getByText('저장 안 됨')).toBeTruthy()
  })

  it('AC-018.17: 안내가 떠 있는 동안 단추 넷([비트에 입력]·[이어서 입력]·[직접 확인했어요]·지난번 [다시 하기])이 막힌다', async () => {
    const view = memoView({ stuck: STUCK })
    view.targets = { ...view.targets, left: [{ reason: 'held', rows: [row('h')] }] }
    const { user } = await toMemo(view, refusedStore())
    await user.click(rowOf('가상환자h'))
    const band = screen.getByRole('region', { name: '쓰다 멈춘 사람' })
    expect((within(band).getByRole('button', { name: '이어서 입력' }) as HTMLButtonElement).disabled).toBe(true)
    expect((within(band).getByRole('button', { name: '직접 확인했어요' }) as HTMLButtonElement).disabled).toBe(true)
    expect(inputButton().disabled).toBe(true)
    expect((within(detail()).getByRole('button', { name: '다시 하기 (1명)' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('AC-018.16·AC-018.17: 저장이 막혀 있어도 띠의 [자료 불러오기]는 눌린다(불러와야 풀린다)', async () => {
    const view = memoView({ stuck: { ...STUCK, canContinue: false, canByHand: false, big: false, loadRange: { from: '2026-10-05', to: '2026-10-20' }, people: [{ key: 'g1', state: 'outside', date: '2026-10-20', month: '2026-10', name: null, chart: null, rxNames: [], reason: null, text: '', sameDay: 1 }] } })
    await toMemo(view, refusedStore())
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
    const { user, worker } = await toMemo(view, refusedStore())
    await user.click(inputButton())
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(worker.of('buildInputBatch')).toEqual([])
  })

  it('AC-018.17: [자료 불러오기]가 또 거절되면 안내가 남고 고친 메모를 지키라고 Worker에 알린다', async () => {
    const { user, worker } = await toMemo(memoView(), refusedStore())
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
    const worker = fakeWorker(() => view, { ...VIEW, memoBlocked: 'E-MEMO-NO-SETTINGS' })
    const link = bridge()
    render(<ClaimScreen channel={claimChannel(worker)} call={link.call as never} stream={link.stream as never} onProgress={link.onProgress as never} />)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '자료 불러오기' }))
    await user.click(await screen.findByRole('button', { name: '다음: 메모 확인' }))
    const info = await screen.findByRole('status', { name: '처음 질문' })
    expect(info.textContent).toContain('처음 질문을 먼저 해 주세요')
    expect(info.textContent).toContain('처음 질문 화면은 아직 준비 중이에요')
    expect(info.textContent).not.toContain('오류 번호')
    expect(info.getAttribute('class')).toContain('bg-accent-soft')
    expect(screen.queryByRole('button', { name: /비트에 입력 \(/ })).toBeNull()
    expect(screen.queryByRole('table', { name: '메모' })).toBeNull()
    expect(screen.queryByRole('region', { name: '환자 목록' })).toBeNull()
    await user.click(screen.getByRole('button', { name: /점검 결과/ }))
    expect(screen.getByRole('heading', { level: 2, name: '환자' })).toBeTruthy()
  })
})

describe('AC-018.3 다섯 단계', () => {
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

describe('AC-018.24 비트 메모 읽기', () => {
  const pending = () => {
    const calls: { resolve(id: string): void; reject(code: string): void }[] = []
    return { calls, memos: () => new Promise<{ id: string; count: number }>((resolve, reject) => calls.push({ resolve: (id) => resolve({ id, count: 1 }), reject: (code) => reject(new BridgeError(code)) })) }
  }
  const slowAfterFirst = () => {
    let first = true
    const gate = pending()
    return () => {
      if (first) {
        first = false
        return Promise.resolve({ id: 'first', count: 1 })
      }
      return gate.memos()
    }
  }

  it('AC-018.24: 읽는 동안 단추 넷([비트에 입력]·[이어서 입력]·[직접 확인했어요]·지난번 [다시 하기])이 막힌다', async () => {
    const view = memoView({ stuck: STUCK })
    view.targets = { ...view.targets, left: [{ reason: 'held', rows: [row('h')] }] }
    const { user } = await toMemo(view, bridge({ memos: slowAfterFirst() }))
    await user.click(rowOf('가상환자h')) // 처음 고르면 저절로 읽는다(AC-3102.5)
    expect(screen.getByRole('button', { name: '비트 메모 불러오는 중…' })).toBeTruthy()
    const band = screen.getByRole('region', { name: '쓰다 멈춘 사람' })
    expect((within(band).getByRole('button', { name: '이어서 입력' }) as HTMLButtonElement).disabled).toBe(true)
    expect((within(band).getByRole('button', { name: '직접 확인했어요' }) as HTMLButtonElement).disabled).toBe(true)
    expect(inputButton().disabled).toBe(true)
    expect((within(detail()).getByRole('button', { name: '다시 하기 (1명)' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('AC-018.24: 읽는 동안 띠의 [자료 불러오기]도 막힌다', async () => {
    const view = memoView({ stuck: { ...STUCK, canContinue: false, canByHand: false, big: false, loadRange: { from: '2026-10-05', to: '2026-10-20' }, people: [{ key: 'g1', state: 'outside', date: '2026-10-20', month: '2026-10', name: null, chart: null, rxNames: [], reason: null, text: '', sameDay: 1 }] } })
    const { user } = await toMemo(view, bridge({ memos: slowAfterFirst() }))
    await user.click(screen.getByRole('button', { name: '비트 메모 전체 불러오기' }))
    const band = screen.getByRole('region', { name: '쓰다 멈춘 사람' })
    expect((within(band).getByRole('button', { name: '자료 불러오기' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('AC-018.24: 읽는 동안 [비트에 입력]을 눌러도 확인 표시 알림이 뜨지 않는다', async () => {
    const view = memoView()
    view.targets = { ...view.targets, left: [{ reason: 'mark', rows: [row('m1', { unfinished: true, chip: null })] }] }
    const { user } = await toMemo(view, bridge({ memos: slowAfterFirst() }))
    await user.click(screen.getByRole('button', { name: '비트 메모 전체 불러오기' }))
    await user.click(inputButton())
    expect(screen.queryByRole('dialog')).toBeNull()
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
    expect(screen.queryByRole('region', { name: '환자 목록' })).toBeNull()
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
