// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { hydrateRoot } from 'react-dom/client'
import { renderToStaticMarkup, renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardHome } from '@/components/dashboard/briefing/DashboardHome'
import { BitDashboard } from '@/components/dashboard/live/BitDashboard'
import { LOOKBACK_DAYS, readBitDays, type ReadResult } from '@/components/dashboard/live/readBitDays'
import { ds } from '@/components/ui/classes'
import { addDays } from '@/lib/analytics/dates'
import { errorInfo } from '@/lib/errors'
import { readDays, StorageError } from '@/lib/storage/stats'
import type { DayPayload } from '@/types/payload'
import { DashboardAnalysis } from './DashboardAnalysis'
import { LiveDashboard, SAVED_READ_TIMEOUT_MS } from './LiveDashboard'
import type { SummarySource } from './source'

// 대시보드가 저장 숫자를 먼저 읽어 BitDashboard에 넘김 (bit-dashboard AC-601.14·AC-601.19, stats AC-516.1·AC-516.3, design.md '### 화면').
// 저장 숫자 읽기(readDays)와 비트 읽기(readBitDays)는 잡아 두고 답을 시험이 정한다. 진짜 Supabase·확장에 붙지 않는다.
// 가짜 DayPayload는 이 시험 파일 안에서만 만든다(AC-312.3)
vi.mock('@/lib/storage/stats', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/storage/stats')>()
  return { ...real, readDays: vi.fn() }
})
vi.mock('@/components/dashboard/live/readBitDays', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/components/dashboard/live/readBitDays')>()
  return { ...real, readBitDays: vi.fn() }
})
vi.mock('@/workers/statsClient', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/workers/statsClient')>()
  return { ...real, createStatsWorker: vi.fn() }
})

type SavedResult = Awaited<ReturnType<typeof readDays>>

const TODAY = '2026-11-02' // 월요일
const RANGE = { from: '2026-07-25', to: TODAY } // 오늘 − 100일(LOOKBACK_DAYS) ~ 오늘
const NONE: SummarySource = { kind: 'none' }

const day = (ymd: string, newPatients: number, returning: number, partial = false): DayPayload => ({
  schemaVersion: 2,
  quality: 'valid',
  day: ymd,
  partial,
  totals: { patients: newPatients + returning, newPatients, returning, unknown: 0 },
  rx: [],
  groups: [],
  revisit: { cohort: newPatients, within7: 0, within14: 0 },
})
// 저장 숫자(오늘 5명) · 비트 숫자(오늘 64명)
const SAVED_ROWS = [day('2026-10-26', 7, 60), day(TODAY, 2, 3, true)]
const BIT_DAYS = [day('2026-10-26', 7, 60), day(TODAY, 9, 55, true)]
const SAVED_H1 = '오늘 지금까지 환자 5명이 왔습니다.'
const BIT_H1 = '오늘 지금까지 환자 64명이 왔습니다.'
const CONNECT_H1 = '비트 PC를 연결하면 오늘 숫자가 여기에 채워져요'
const READ_H1 = '비트에서 오늘 숫자를 읽고 있어요'
const READ_FAILED = errorInfo('E-STATS-READ-FAILED')

// ── 잡아 둔 저장 숫자 읽기: 화면이 부른 차례대로 쌓이고, 시험이 답을 준다 ──
type SavedRead = { range: Parameters<typeof readDays>[0]; resolve(result: SavedResult): void; reject(error: unknown): void }
const savedReads: SavedRead[] = []
const rowsOf = (rows: readonly DayPayload[]): SavedResult => ({ rows: [...rows], dropped: 0, latest: null, fromFile: false })
const savedAnswer = (rows: readonly DayPayload[], i = savedReads.length - 1) =>
  act(async () => {
    savedReads[i]!.resolve(rowsOf(rows))
  })
const savedFail = (i = savedReads.length - 1, error: unknown = new StorageError('E-STATS-READ-FAILED')) =>
  act(async () => {
    savedReads[i]!.reject(error)
  })

// ── 잡아 둔 비트 읽기 ──
type BitRead = { deps: Parameters<typeof readBitDays>[0]; resolve(result: ReadResult): void }
const bitReads: BitRead[] = []
const bitAnswer = (result: ReadResult, i = bitReads.length - 1) =>
  act(async () => {
    bitReads[i]!.resolve(result)
  })
const bitDays = (list: readonly DayPayload[] = BIT_DAYS): ReadResult => ({ kind: 'days', days: [...list] })

const onBitPc = () => vi.stubGlobal('chrome', { runtime: { connect: vi.fn() } })
const notBitPc = () => vi.stubGlobal('chrome', undefined)
const draw = () => render(<LiveDashboard today={TODAY} />)
const wait = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })

// ── 화면 읽기 도우미 ──
const h1 = () => screen.getByRole('heading', { level: 1 })
const savedCard = () => screen.queryByText(READ_FAILED.what)?.closest('[role="alert"]') ?? null
// 카드와 그 아래 단추를 감싼 칸
const savedCardBox = () => savedCard()!.parentElement as HTMLElement
const retryButton = () => within(savedCardBox()).getByRole('button')
const expectOrder = (...els: Element[]) => {
  for (let i = 1; i < els.length; i += 1) {
    expect(els[i - 1]!.compareDocumentPosition(els[i]!) & Node.DOCUMENT_POSITION_FOLLOWING, `${i - 1}번 → ${i}번`).toBeTruthy()
  }
}
// useId 값은 그린 차례마다 달라 빼고 견준다
const withoutIds = (html: string) => html.replace(/\s(?:id|for|aria-labelledby|aria-describedby|aria-controls)="[^"]*"/g, '')
const markupOf = (node: React.ReactElement) => {
  const { container, unmount } = render(node)
  const html = withoutIds(container.innerHTML)
  unmount()
  return html
}
const BEFORE_CONNECT = <DashboardHome today={TODAY} report={null} analysis={<DashboardAnalysis today={TODAY} source={NONE} />} />

beforeEach(() => {
  savedReads.length = 0
  bitReads.length = 0
  vi.mocked(readDays).mockReset()
  vi.mocked(readDays).mockImplementation(
    (range) =>
      new Promise<SavedResult>((resolve, reject) => {
        savedReads.push({ range, resolve, reject })
      }),
  )
  vi.mocked(readBitDays).mockReset()
  vi.mocked(readBitDays).mockImplementation(
    (deps) =>
      new Promise<ReadResult>((resolve) => {
        bitReads.push({ deps, resolve })
      }),
  )
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
  vi.setSystemTime(new Date('2026-11-02T06:42:00Z')) // 한국 오후 3시 42분
  // 쓰면 안 되는 길: 불리면 시험이 잡는다
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('AC-601.14·AC-516.1: 저장 숫자를 한 번 읽어 처음 자료로 넘긴다', () => {
  it('AC-601.14·AC-516.1: 서버 그림은 지금의 연결 전 모양 그대로다 — 저장 숫자도 비트도 읽지 않는다', () => {
    onBitPc()
    const html = renderToStaticMarkup(<LiveDashboard today={TODAY} />)
    expect(html).toBe(renderToStaticMarkup(BEFORE_CONNECT))
    // BitDashboard가 저장 숫자 없이 그리는 서버 그림과도 같다(연결 전 모양 한 벌)
    expect(html).toBe(renderToStaticMarkup(<BitDashboard today={TODAY} initial={NONE} />))
    expect(readDays).not.toHaveBeenCalled()
    expect(readBitDays).not.toHaveBeenCalled()
  })

  it('AC-601.14·AC-516.1: 브라우저에 붙으면 저장 숫자(오늘 − LOOKBACK_DAYS ~ 오늘)를 readDays로 한 번 읽는다', () => {
    notBitPc()
    draw()
    expect(readDays).toHaveBeenCalledTimes(1)
    expect(readDays).toHaveBeenCalledWith({ from: addDays(TODAY, -LOOKBACK_DAYS), to: TODAY })
    expect(savedReads[0]!.range).toEqual(RANGE)
  })

  it('AC-601.14: 서버 그림 위에 붙을 때 어긋나지 않고, 붙은 뒤에 한 번 읽는다', async () => {
    onBitPc()
    const container = document.createElement('div')
    document.body.append(container)
    container.innerHTML = renderToString(<LiveDashboard today={TODAY} />)
    const recoverable = vi.fn()
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    let root!: ReturnType<typeof hydrateRoot>
    await act(async () => {
      root = hydrateRoot(container, <LiveDashboard today={TODAY} />, { onRecoverableError: recoverable })
    })
    expect(recoverable).not.toHaveBeenCalled()
    expect(logged).not.toHaveBeenCalled()
    expect(readDays).toHaveBeenCalledTimes(1)
    expect(readBitDays).not.toHaveBeenCalled()
    logged.mockRestore()
    await act(async () => root.unmount())
    container.remove()
  })

  it('AC-601.14: 저장 숫자를 읽는 동안은 연결 전 모양 그대로이고 BitDashboard를 그리지 않는다 — 비트 PC에서도 비트 읽기가 아직 없다', () => {
    onBitPc()
    const { container } = draw()
    expect(readBitDays).not.toHaveBeenCalled()
    expect(h1().textContent).toBe(CONNECT_H1)
    expect(screen.queryByText(READ_H1)).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    const html = withoutIds(container.innerHTML)
    cleanup()
    expect(html).toBe(markupOf(BEFORE_CONNECT))
  })

  it('AC-601.14·AC-516.1: 줄이 있으면 { kind: "data", days }를 처음 자료로 넘긴다 — 비트 PC가 아니면 저장 숫자만 그린다', async () => {
    notBitPc()
    const { container } = draw()
    await savedAnswer(SAVED_ROWS)
    expect(h1().textContent).toBe(SAVED_H1)
    expect(readBitDays).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBeNull()
    const html = withoutIds(container.innerHTML)
    cleanup()
    expect(html).toBe(markupOf(<BitDashboard today={TODAY} initial={{ kind: 'data', days: SAVED_ROWS }} />))
  })

  it('AC-601.14: 비트 PC면 저장 숫자 읽기가 끝난 뒤에야 비트를 읽고, 저장 숫자를 둔 채 "다시 읽는 중"이다', async () => {
    onBitPc()
    draw()
    expect(readBitDays).not.toHaveBeenCalled()
    await savedAnswer(SAVED_ROWS)
    expect(readBitDays).toHaveBeenCalledTimes(1)
    expect(bitReads[0]!.deps.today).toBe(TODAY)
    expect(h1().textContent).toBe(SAVED_H1)
    expect(screen.getByRole('button', { name: '다시 읽는 중' })).toBeTruthy()
    await bitAnswer(bitDays())
    expect(h1().textContent).toBe(BIT_H1)
    expect(readDays).toHaveBeenCalledTimes(1)
  })

  it('AC-601.14·AC-516.1: 줄이 없으면 { kind: "none" } — 연결 전 모양이고 오류 카드가 없다', async () => {
    notBitPc()
    const { container } = draw()
    await savedAnswer([])
    expect(h1().textContent).toBe(CONNECT_H1)
    expect(savedCard()).toBeNull()
    const html = withoutIds(container.innerHTML)
    cleanup()
    expect(html).toBe(markupOf(<BitDashboard today={TODAY} initial={NONE} />))
  })

  it('AC-601.14: 읽는 동안 화면을 떠나도 오류 없이 끝난다', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { unmount } = draw()
    unmount()
    await savedAnswer(SAVED_ROWS)
    await wait(SAVED_READ_TIMEOUT_MS)
    expect(logged).not.toHaveBeenCalled()
    logged.mockRestore()
  })
})

describe('AC-601.19: 저장 숫자 읽기 실패·10초 한도', () => {
  it('AC-601.19: 한도는 10초다', () => {
    expect(SAVED_READ_TIMEOUT_MS).toBe(10_000)
  })

  it('AC-601.19: 실패하면 BitDashboard를 저장 숫자 없이 그려 비트 읽기를 막지 않고, 그 위에 오류 카드(통계 탭과 같은 글)와 카드 아래 [다시 읽기]를 둔다', async () => {
    onBitPc()
    const failure = new StorageError('E-STATS-READ-FAILED')
    failure.message = '서버 답 비밀 글자'
    const { container } = draw()
    await savedFail(0, failure)
    // 비트 읽기는 그대로 시작된다(저장 숫자 없이 처음 읽는 중)
    expect(readBitDays).toHaveBeenCalledTimes(1)
    expect(h1().textContent).toBe(READ_H1)
    // 카드: 무엇이 · 어떻게 고치나 · 번호 (새 번호 없음). 원래 오류 글은 보이지 않는다
    const card = savedCard()!
    expect(card).not.toBeNull()
    expect(within(card as HTMLElement).getByText(READ_FAILED.fix)).toBeTruthy()
    expect(within(card as HTMLElement).getByText('오류 번호 E-STATS-READ-FAILED')).toBeTruthy()
    expect(container.textContent).not.toContain('서버 답 비밀 글자')
    // 카드 → [다시 읽기] → 대시보드(날짜 줄·큰 문장)
    const retry = retryButton()
    expect(retry.textContent).toBe('다시 읽기')
    expect((retry as HTMLButtonElement).disabled).toBe(false)
    expect((retry.getAttribute('class') ?? '').split(/\s+/)).toEqual(expect.arrayContaining(ds.button.secondarySmall.split(/\s+/).filter(Boolean)))
    expectOrder(card, retry, screen.getByRole('region', { name: '오늘 브리핑' }), h1())
  })

  it('AC-601.19: 비트 PC가 아니어도 실패하면 연결 전 모양 위에 같은 카드다', async () => {
    notBitPc()
    draw()
    await savedFail()
    expect(h1().textContent).toBe(CONNECT_H1)
    expect(savedCard()).not.toBeNull()
    expect(readBitDays).not.toHaveBeenCalled()
  })

  it('AC-601.19: 10초 안에 끝나지 않으면 실패로 그린다 — 그 전까지는 연결 전 모양이고 비트 읽기도 기다린다', async () => {
    onBitPc()
    draw()
    await wait(SAVED_READ_TIMEOUT_MS - 1)
    expect(h1().textContent).toBe(CONNECT_H1)
    expect(readBitDays).not.toHaveBeenCalled()
    expect(savedCard()).toBeNull()
    await wait(1)
    expect(readBitDays).toHaveBeenCalledTimes(1)
    expect(h1().textContent).toBe(READ_H1)
    expect(savedCard()).not.toBeNull()
  })

  it('AC-601.19: 한도 뒤에 늦게 온 첫 읽기의 답은 쓰지 않는다', async () => {
    notBitPc()
    draw()
    await wait(SAVED_READ_TIMEOUT_MS)
    await savedAnswer(SAVED_ROWS, 0)
    expect(h1().textContent).toBe(CONNECT_H1)
    expect(savedCard()).not.toBeNull()
  })

  it('AC-601.19: [다시 읽기]는 저장 숫자 읽기만 같은 범위로 다시 하고, 그동안 "다시 읽는 중"으로 막힌다', async () => {
    onBitPc()
    draw()
    await savedFail()
    fireEvent.click(retryButton())
    expect(readDays).toHaveBeenCalledTimes(2)
    expect(savedReads[1]!.range).toEqual(RANGE)
    expect(readBitDays).toHaveBeenCalledTimes(1) // 비트 읽기는 다시 하지 않는다
    expect(bitReads[0]!.deps.signal?.aborted).toBe(false)
    const busy = retryButton() as HTMLButtonElement
    expect(busy.textContent).toBe('다시 읽는 중')
    expect(busy.disabled).toBe(true)
    fireEvent.click(busy)
    expect(readDays).toHaveBeenCalledTimes(2)
    expect(savedCard()).not.toBeNull()
  })

  it('AC-601.19: 다시 실패하면 카드가 그대로고 [다시 읽기]가 돌아온다', async () => {
    notBitPc()
    draw()
    await savedFail()
    fireEvent.click(retryButton())
    await savedFail()
    expect(savedCard()).not.toBeNull()
    expect(retryButton().textContent).toBe('다시 읽기')
    expect((retryButton() as HTMLButtonElement).disabled).toBe(false)
    expect(h1().textContent).toBe(CONNECT_H1)
  })

  it('AC-601.19: 다시 읽기도 같은 10초 한도다 — 넘으면 카드가 그대로고, 늦게 온 답은 쓰지 않는다', async () => {
    notBitPc()
    draw()
    await savedFail()
    fireEvent.click(retryButton())
    await wait(SAVED_READ_TIMEOUT_MS - 1)
    expect(retryButton().textContent).toBe('다시 읽는 중')
    await wait(1)
    expect(retryButton().textContent).toBe('다시 읽기')
    expect(savedCard()).not.toBeNull()
    await savedAnswer(SAVED_ROWS, 1)
    expect(savedCard()).not.toBeNull()
    expect(h1().textContent).toBe(CONNECT_H1)
  })

  it('AC-601.19: 다시 읽기가 data로 성공하면 카드가 없어지고 BitDashboard가 그 숫자로 새로 그려진다(비트 읽기는 처음부터 다시)', async () => {
    onBitPc()
    draw()
    await savedFail()
    expect(h1().textContent).toBe(READ_H1)
    fireEvent.click(retryButton())
    await savedAnswer(SAVED_ROWS)
    expect(savedCard()).toBeNull()
    expect(h1().textContent).toBe(SAVED_H1)
    expect(bitReads[0]!.deps.signal?.aborted).toBe(true)
    expect(readBitDays).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('button', { name: '다시 읽는 중' })).toBeTruthy()
  })

  it('AC-601.19: 비트 PC가 아니면 다시 읽기로 받은 저장 숫자만 그린다', async () => {
    notBitPc()
    const { container } = draw()
    await savedFail()
    fireEvent.click(retryButton())
    await savedAnswer(SAVED_ROWS)
    expect(savedCard()).toBeNull()
    const html = withoutIds(container.innerHTML)
    cleanup()
    expect(html).toBe(markupOf(<BitDashboard today={TODAY} initial={{ kind: 'data', days: SAVED_ROWS }} />))
  })

  it('AC-601.19: 다시 읽기가 성공했는데 줄이 없으면 카드만 없어지고 BitDashboard를 다시 놓지 않는다', async () => {
    onBitPc()
    draw()
    await savedFail()
    fireEvent.click(retryButton())
    await savedAnswer([])
    expect(savedCard()).toBeNull()
    expect(readBitDays).toHaveBeenCalledTimes(1)
    expect(bitReads[0]!.deps.signal?.aborted).toBe(false)
    expect(h1().textContent).toBe(READ_H1)
  })

  it.each<[string, readonly DayPayload[]]>([
    ['일 숫자', BIT_DAYS],
    ['빈 배열', []],
  ])('AC-601.19: 비트 숫자가 오면(%s) 카드가 없어진다', async (_name, list) => {
    onBitPc()
    draw()
    await savedFail()
    await bitAnswer(bitDays(list))
    expect(savedCard()).toBeNull()
    expect(screen.queryByText('오류 번호 E-STATS-READ-FAILED')).toBeNull()
  })

  it('AC-601.19: 비트 읽기가 days 없이 끝나면(실패·not-ready) 카드는 그대로다', async () => {
    onBitPc()
    draw()
    await savedFail()
    await bitAnswer({ kind: 'failed', code: 'E-BIT-READ-FAILED' })
    expect(savedCard()).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '다시 확인' }))
    await bitAnswer({ kind: 'not-ready' })
    expect(savedCard()).not.toBeNull()
  })

  it('AC-601.19: 비트 숫자가 온 뒤에 끝난 저장 숫자 다시 읽기의 답은 쓰지 않는다 — 성공이어도 실패여도', async () => {
    onBitPc()
    draw()
    await savedFail()
    fireEvent.click(retryButton())
    fireEvent.click(screen.getByRole('button', { name: '다시 읽는 중' })) // 막혀 있다
    await bitAnswer(bitDays())
    expect(savedCard()).toBeNull()
    expect(h1().textContent).toBe(BIT_H1)
    await savedAnswer(SAVED_ROWS, 1)
    expect(h1().textContent).toBe(BIT_H1)
    expect(savedCard()).toBeNull()
    expect(readBitDays).toHaveBeenCalledTimes(1)
  })

  it('AC-601.19: 비트 숫자가 온 뒤에 실패한 다시 읽기도 카드를 다시 보이지 않는다', async () => {
    onBitPc()
    draw()
    await savedFail()
    fireEvent.click(retryButton())
    await bitAnswer(bitDays())
    await savedFail(1)
    expect(savedCard()).toBeNull()
    expect(h1().textContent).toBe(BIT_H1)
  })
})

describe('AC-601.14·AC-516.3: 저장 숫자를 읽는 곳은 한 곳이다', () => {
  const ROOT = process.cwd()
  const read = (file: string) => readFileSync(file, 'utf8')
  // 주석을 뺀 코드
  const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  const appFiles = (dir: string) =>
    readdirSync(join(ROOT, dir), { recursive: true, encoding: 'utf8' })
      .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
      .map((f) => join(dir, f))
  const isClient = (file: string) => /^\s*['"]use client['"]/.test(read(join(ROOT, file)))
  const LIVE = 'src/components/dashboard/summary/LiveDashboard.tsx'

  it("AC-601.14·AC-516.3: 저장 숫자를 읽는 코드는 summary/LiveDashboard.tsx('use client') 하나다 — BitDashboard·브리핑·분석·페이지는 통계 저장을 부르지 않는다", () => {
    const files = [...appFiles('src/components/dashboard'), ...appFiles('src/app/(app)/dashboard')]
    expect(files).toContain(LIVE)
    expect(files).toContain('src/components/dashboard/live/BitDashboard.tsx')
    // 값으로 불러오거나 부르는 곳만 센다(source.ts의 `import type`·`typeof readDays`는 모양만 빌린다)
    const reads = /^import\s+(?!type\b)[^;]*from\s+['"]@\/lib\/storage\/stats['"]|\breadDays\s*\(|stats_days/m
    const readers = files.filter((f) => reads.test(code(read(join(ROOT, f)))))
    expect(readers).toEqual([LIVE])
    expect(isClient(LIVE)).toBe(true)
  })

  it("AC-516.3: 브리핑 폴더의 'use client'는 지금처럼 폰 아래 단추 파일 하나뿐이다", () => {
    const clients = appFiles('src/components/dashboard/briefing').filter(isClient)
    expect(clients).toEqual(['src/components/dashboard/briefing/StickyConnect.tsx'])
  })

  it('AC-601.14: 연결 전·뒤 모양은 BitDashboard가 고른다 — LiveDashboard는 BitDashboard를 놓고 보고 문장·날짜 고르기·연결 판정을 스스로 하지 않는다', () => {
    const text = code(read(join(ROOT, LIVE)))
    expect(text).toMatch(/<BitDashboard\b[^>]*\bkey=/)
    expect(text).toMatch(/toSummarySource\(/)
    // 한도 범위(LOOKBACK_DAYS)는 readBitDays.ts의 상수를 빌리지만 비트 읽기는 부르지 않는다
    expect(text).not.toMatch(/ReportBlock|DateControl|isConnected|\breadBitDays\b(?!['"])|chrome/)
  })

  it('AC-601.14: 저장 숫자 읽기는 비트 숫자를 보내지 않는다 — LiveDashboard에 저장·서버 요청·브라우저 저장소가 없다', () => {
    const text = code(read(join(ROOT, LIVE)))
    expect(text).not.toMatch(/saveStats|\bfetch\s*\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|indexedDB|document\.cookie|lib\/supabase/)
  })
})
