// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardHome } from '@/components/dashboard/briefing/DashboardHome'
import { DashboardAnalysis } from '@/components/dashboard/summary/DashboardAnalysis'
import { ReportBlock } from '@/components/dashboard/summary/ReportBlock'
import type { SummarySource } from '@/components/dashboard/summary/source'
import { ds } from '@/components/ui/classes'
import { errorInfo } from '@/lib/errors'
import { nestedBoxes } from '@/testing/boxes'
import type { ChromeRuntimeLike, PortLike } from '@/types/bridge'
import type { ErrorCode } from '@/types/errors'
import type { DayPayload } from '@/types/payload'
import type { StatsLoaded, StatsLoadRequest, StatsWorkerMessage } from '@/types/stats'
import { createStatsWorker } from '@/workers/statsClient'
import { BitDashboard } from './BitDashboard'
import { readBitDays, type ReadResult, type StatsWorkerLike } from './readBitDays'

// 대시보드가 저절로 채워지는 화면 (bit-dashboard REQ-601, design.md '### 화면', 시안 docs/mockups/bit-dashboard/gen.py).
// 대부분은 readBitDays를 잡아 두고 답을 시험이 정한다(화면이 답마다 어떻게 그리는지 본다).
// '끝까지 잇기' 시험만 진짜 readBitDays에 가짜 확장(chrome.runtime)·가짜 통계 Worker를 넣는다. 자료는 모두 지어낸 값이다
vi.mock('./readBitDays', async (importOriginal) => {
  const real = await importOriginal<typeof import('./readBitDays')>()
  return { ...real, readBitDays: vi.fn() }
})
vi.mock('@/workers/statsClient', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/workers/statsClient')>()
  return { ...real, createStatsWorker: vi.fn() }
})

const TODAY = '2026-11-02' // 월요일
const AT_342 = new Date('2026-11-02T06:42:00Z') // 한국 오후 3시 42분
const AT_345 = new Date('2026-11-02T06:45:00Z')
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
const DAYS = [day(TODAY, 9, 55, true), day('2026-10-26', 7, 60)]
const NEWER_DAYS = [day(TODAY, 10, 60, true), day('2026-10-26', 7, 60)]
const SAVED: SummarySource = { kind: 'data', days: [day(TODAY, 2, 3, true)] }

const CONNECT_CHECK = '/claim/setup?next=dashboard'
const CONNECT_H1 = '비트 PC를 연결하면 오늘 숫자가 여기에 채워져요'
const READ_H1 = '비트에서 오늘 숫자를 읽고 있어요'
const READ_LEAD = '최근 100일 자료를 읽어요. 길면 3분쯤 걸려요. 다 읽을 때까지 이 화면을 열어 두세요.'
const SAVED_KEPT = '아래 숫자는 저장해 둔 그대로예요.'
const UNREADABLE = '이 PC에서 비트를 읽을 수 없어요. 연결을 확인해 주세요.'

// ── 잡아 둔 읽기: 화면이 부른 차례대로 쌓이고, 시험이 답을 준다 ──
type Read = { deps: Parameters<typeof readBitDays>[0]; resolve(result: ReadResult): void }
const reads: Read[] = []
const answer = (result: ReadResult, i = reads.length - 1) =>
  act(async () => {
    reads[i]!.resolve(result)
  })
const days = (list: readonly DayPayload[] = DAYS): ReadResult => ({ kind: 'days', days: [...list] })
const failed = (code: ErrorCode): ReadResult => ({ kind: 'failed', code })
const NOT_READY: ReadResult = { kind: 'not-ready' }

const onBitPc = () => vi.stubGlobal('chrome', { runtime: { connect: vi.fn() } })
const notBitPc = () => vi.stubGlobal('chrome', undefined)
const draw = (initial: SummarySource = NONE) => render(<BitDashboard today={TODAY} initial={initial} />)

// ── 화면 읽기 도우미 ──
const region = (name: string) => screen.getByRole('region', { name })
const h1 = () => screen.getByRole('heading', { level: 1 })
const todaySection = () => region('오늘 하루 분석')
const flow = () => region('기간별 흐름')
const kpiCells = () => Array.from(todaySection().children[1]!.children)
const button = (name: string) => screen.getByRole('button', { name })
const noButton = (name: string) => expect(screen.queryByRole('button', { name })).toBeNull()
const link = (name: string) => screen.getByRole('link', { name })
const noText = (text: string | RegExp) => expect(screen.queryByText(text)).toBeNull()
// 화면에 있는 움직이는 표시 이름(AC-601.17). 움직임 자체는 globals.css가 맡는다
const motionMarks = (container: Element) => [...container.innerHTML.matchAll(/bit-read-[\w-]+/g)].map((m) => m[0])
const tokens = (classes: string) => classes.split(/\s+/).filter(Boolean)
const hasAll = (el: Element, classes: string) => expect((el.getAttribute('class') ?? '').split(/\s+/)).toEqual(expect.arrayContaining(tokens(classes)))
const expectOrder = (...els: Element[]) => {
  for (let i = 1; i < els.length; i += 1) {
    expect(els[i - 1]!.compareDocumentPosition(els[i]!) & Node.DOCUMENT_POSITION_FOLLOWING, `${i - 1}번 → ${i}번`).toBeTruthy()
  }
}
const expectEmptyNumbers = (chip: string, text: string) => {
  // 칩은 제목 줄에 있다(숫자 칸과 글자가 같을 수 있다)
  hasAll(within(todaySection().children[0] as HTMLElement).getByText(chip), ds.chip.neutral)
  const cells = kpiCells()
  expect(cells).toHaveLength(4)
  for (const cell of cells) {
    expect(within(cell as HTMLElement).getByText('–')).toBeTruthy()
    expect(within(cell as HTMLElement).getByText(text)).toBeTruthy()
  }
  expect(cells.map((cell) => cell.textContent).join('')).not.toMatch(/\d/)
}
const expectGainsOfReading = () => {
  expect(within(flow()).getByText('읽기가 끝나면 생기는 것 4가지')).toBeTruthy()
  expect(within(flow()).getByText('읽기가 끝나면 이 자리에 그래프 4개가 그려지고, 기간 단추로 7일·30일·90일을 바꿔 볼 수 있어요.')).toBeTruthy()
  expect(within(flow()).getByText('처음 온 환자가 7·14일 안에 다시 온 비율이에요.')).toBeTruthy()
  expect(within(flow()).queryByText(/^연결/)).toBeNull()
  expect(within(flow()).queryByRole('heading', { level: 3 })).toBeNull()
}
const expectNumbersShown = (patients: number, newPatients: number, returning: number) => {
  const [first, second, third] = kpiCells()
  expect(first!.textContent).toBe(`오늘 환자 수${patients}명`)
  expect(second!.textContent).toBe(`신환${newPatients}명`)
  expect(third!.textContent).toBe(`재진${returning}명`)
  expect(h1().textContent).toBe(`오늘 지금까지 환자 ${patients}명이 왔습니다.`)
}
const expectBeforeConnect = () => {
  expect(h1().textContent).toBe(CONNECT_H1)
  expect(within(todaySection()).getByText('비트 PC 연결 전')).toBeTruthy()
  for (const cell of kpiCells()) expect(within(cell as HTMLElement).getByText('연결하면 보여요')).toBeTruthy()
  expect(within(flow()).getByText('연결하면 생기는 것 4가지')).toBeTruthy()
  expect(link('비트 PC 연결 시작').getAttribute('href')).toBe(CONNECT_CHECK)
}

beforeEach(() => {
  reads.length = 0
  vi.mocked(readBitDays).mockReset()
  vi.mocked(readBitDays).mockImplementation(
    (deps) =>
      new Promise<ReadResult>((resolve) => {
        reads.push({ deps, resolve })
      }),
  )
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AT_342)
  // 쓰면 안 되는 길: 불리면 시험이 잡는다
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('서버가 그린 첫 모양', () => {
  it('AC-601.6·AC-601.13: 서버 그림은 initial 그대로다 — 비트 PC에서도 읽는 중을 먼저 그리지 않는다', () => {
    onBitPc()
    expect(renderToStaticMarkup(<BitDashboard today={TODAY} initial={NONE} />)).toBe(
      renderToStaticMarkup(<DashboardHome today={TODAY} report={null} analysis={<DashboardAnalysis today={TODAY} source={NONE} />} />),
    )
    expect(renderToStaticMarkup(<BitDashboard today={TODAY} initial={SAVED} />)).toBe(
      renderToStaticMarkup(
        <DashboardHome
          today={TODAY}
          report={<ReportBlock today={TODAY} days={SAVED.kind === 'data' ? SAVED.days : []} />}
          analysis={<DashboardAnalysis today={TODAY} source={SAVED} />}
        />,
      ),
    )
    expect(readBitDays).not.toHaveBeenCalled()
  })

  it('AC-601.6: 저장 숫자가 빈 배열이면 연결 전과 같다', () => {
    notBitPc()
    draw({ kind: 'data', days: [] })
    expectBeforeConnect()
  })
})

describe('AC-601.6: 비트를 읽을 수 없는 곳', () => {
  it('AC-601.6: 확장이 없으면(휴대폰·다른 PC) 읽기를 부르지 않고 연결 전 모양 그대로다', () => {
    notBitPc()
    draw()
    expect(readBitDays).not.toHaveBeenCalled()
    expectBeforeConnect()
    noText(READ_H1)
  })

  it('AC-601.6: 읽기 답이 not-ready면(도우미 없음·버전 안 맞음·등록 안 됨) 연결 전 모양으로 돌아간다. 오류도 업데이트 안내도 없다', async () => {
    onBitPc()
    draw()
    await answer(NOT_READY)
    expectBeforeConnect()
    expect(screen.queryByRole('alert')).toBeNull()
    noText(/새 도우미 내려받기|도우미를 업데이트/)
    noText(/오류 번호/)
    noText(UNREADABLE)
  })

  it('AC-601.6: 이 화면은 도우미 업데이트 순서(HelperUpdateSteps)를 쓰지 않는다 — 연결 화면이 맡는다', () => {
    const dir = join(process.cwd(), 'src/components/dashboard/live')
    for (const file of ['BitDashboard.tsx', 'ReadStatus.tsx']) {
      expect(readFileSync(join(dir, file), 'utf8'), file).not.toMatch(/HelperUpdateSteps|StepGuide|components\/claim/)
    }
  })
})

describe('AC-601.1: 열면 저절로 읽는다', () => {
  it('AC-601.1: 누르지 않아도 한 번 읽는다 — 오늘·chrome.runtime·통계 Worker 만들기·취소 신호를 넘긴다', () => {
    onBitPc()
    draw()
    expect(readBitDays).toHaveBeenCalledTimes(1)
    const { deps } = reads[0]!
    expect(deps.today).toBe(TODAY)
    expect(deps.runtime).toBe((globalThis as unknown as { chrome: { runtime: ChromeRuntimeLike } }).chrome.runtime)
    expect(deps.createWorker).toBe(createStatsWorker)
    expect(deps.signal).toBeInstanceOf(AbortSignal)
    expect(deps.signal?.aborted).toBe(false)
  })

  it('AC-601.1: 끝나면 연결 뒤 모양 — 보고 문장·오늘 숫자·기간별 흐름을 받은 일 숫자로 그린다', async () => {
    onBitPc()
    draw()
    await answer(days())
    expectNumbersShown(64, 9, 55)
    expect(screen.getByText('신환 9명, 재진 55명입니다.')).toBeTruthy()
    expect(screen.getByText('원장님 보고 문장')).toBeTruthy()
    for (const name of ['환자 수 추이', '신환 재방문율', '요일별 환자 수', '처방 상위']) {
      expect(within(flow()).getByRole('heading', { level: 3, name })).toBeTruthy()
    }
    // 연결 뒤 모양: 연결 전 부품이 없고 오른쪽 칸은 지금 바로 묶음이다
    expect(screen.queryByRole('link', { name: '비트 PC 연결 시작' })).toBeNull()
    expect(within(region('오늘 브리핑')).getByRole('heading', { level: 2, name: '지금 바로 쓸 수 있어요' })).toBeTruthy()
  })

  it('AC-601.1: 다시 그려져도 다시 읽지 않는다', async () => {
    onBitPc()
    const { rerender } = draw()
    rerender(<BitDashboard today={TODAY} initial={NONE} />)
    await answer(days())
    rerender(<BitDashboard today={TODAY} initial={NONE} />)
    expect(readBitDays).toHaveBeenCalledTimes(1)
  })
})

describe('AC-601.2: 저장 숫자 없이 처음 읽는 중', () => {
  beforeEach(onBitPc)

  it('AC-601.2: 큰 문장 자리에 읽는 중 h1·안내 문장과 진행 막대가 있고, 안심 줄이 그 아래다', () => {
    draw()
    expect(h1().textContent).toBe(READ_H1)
    const lead = screen.getByText(READ_LEAD)
    const bar = screen.getByRole('progressbar', { name: '비트 자료 읽는 중' })
    const safe = screen.getByText('환자 개인정보는 의원 PC 밖으로 나가지 않아요. 비트 자료는 읽기만 해요.')
    expectOrder(h1(), lead, bar, safe)
    expect(within(region('오늘 브리핑')).getByRole('heading', { level: 1 })).toBe(h1())
    hasAll(h1(), 'text-display-m font-semibold text-ink max-md:text-heading-m')
    hasAll(lead, 'text-lead text-ink-2')
    // 값이 없으니 진행률을 지어내지 않는다(움직임은 AC-601.17)
    expect(bar.getAttribute('aria-valuenow')).toBeNull()
  })

  it('AC-601.2: 오늘 하루 분석은 칩 "읽는 중" + 숫자 칸 넷 "읽는 중"이고 지어낸 값이 없다', () => {
    draw()
    expectEmptyNumbers('읽는 중', '읽는 중')
    expect(within(todaySection()).getByText('읽기가 끝나면 이 숫자로 원장님 보고 문장을 만들어 맨 위 큰 문장 자리에 올려요.')).toBeTruthy()
    expect(within(todaySection()).queryByText(/^연결/)).toBeNull()
  })

  it('AC-601.2: 기간별 흐름 자리에 "읽기가 끝나면 생기는 것 4가지"가 있다', () => {
    draw()
    expectGainsOfReading()
  })

  it('AC-601.2: 연결 전 부품이 없고 날짜 줄은 오늘 글자다', () => {
    draw()
    expect(screen.queryByRole('link', { name: '비트 PC 연결 시작' })).toBeNull()
    expect(within(region('오늘 브리핑')).getByText('11월 2일 월요일')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /다시 읽|복사/ })).toBeNull()
  })
})

describe('AC-601.3: 읽기 끝 — 읽은 시각과 [다시 읽기]', () => {
  beforeEach(onBitPc)

  it('AC-601.3: 보고 문장 아래에 "오늘 오후 3:42에 읽었어요"와 [다시 읽기]가 있다', async () => {
    draw()
    await answer(days())
    const at = screen.getByText('오늘 오후 3:42에 읽었어요')
    expectOrder(h1(), at, button('다시 읽기'), todaySection())
    hasAll(button('다시 읽기'), ds.button.secondarySmall)
    expect(region('오늘 브리핑').contains(at)).toBe(true)
  })

  it('AC-601.3: 읽은 시각은 그 PC 시간대와 상관없이 한국 시각이다', async () => {
    vi.setSystemTime(new Date('2026-11-02T00:05:00Z'))
    draw()
    await answer(days())
    expect(screen.getByText('오늘 오전 9:05에 읽었어요')).toBeTruthy()
  })

  it('AC-601.3: 누르면 이전 숫자를 둔 채 다시 읽고, 그동안 단추는 "다시 읽는 중"으로 막힌다', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    draw()
    await answer(days())
    await user.click(button('다시 읽기'))

    expect(readBitDays).toHaveBeenCalledTimes(2)
    expect(reads[1]!.deps.signal?.aborted).toBe(false)
    expectNumbersShown(64, 9, 55)
    expect(screen.getByText('오늘 오후 3:42에 읽었어요')).toBeTruthy()
    expect((button('다시 읽는 중') as HTMLButtonElement).disabled).toBe(true)
    noButton('다시 읽기')
    noText(READ_H1)
  })

  it('AC-601.3: 다시 읽기가 끝나면 새 숫자·새 시각으로 바뀌고 단추가 돌아온다', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    draw()
    await answer(days())
    await user.click(button('다시 읽기'))
    vi.setSystemTime(AT_345)
    await answer(days(NEWER_DAYS))

    expectNumbersShown(70, 10, 60)
    expect(screen.getByText('오늘 오후 3:45에 읽었어요')).toBeTruthy()
    expect((button('다시 읽기') as HTMLButtonElement).disabled).toBe(false)
  })

  it('AC-601.3·AC-601.16: 다시 읽기 답이 not-ready면 숫자·시각을 그대로 두고 단추가 돌아온다', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    draw()
    await answer(days())
    await user.click(button('다시 읽기'))
    await answer(NOT_READY)

    expectNumbersShown(64, 9, 55)
    expect(screen.getByText('오늘 오후 3:42에 읽었어요')).toBeTruthy()
    expect(button('다시 읽기')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('AC-601.16: 숫자가 있는 화면에서 직접 눌렀는데 이 PC에서 읽을 수 없음(not-ready)', () => {
  beforeEach(onBitPc)

  const expectUnreadable = () => {
    const note = screen.getByRole('status')
    expect(within(note).getByText(UNREADABLE)).toBeTruthy()
    const go = within(note).getByRole('link', { name: '연결 확인' })
    expect(go.getAttribute('href')).toBe(CONNECT_CHECK)
    hasAll(go, ds.button.secondary)
    // 오류 번호가 없는 안내다. 오류 상자로 그리지 않는다
    expect(screen.queryByRole('alert')).toBeNull()
    noText(/오류 번호/)
    return note
  }

  it('AC-601.16: [다시 읽기] — 숫자·읽은 시각을 그대로 두고 그 아래에 안내와 [연결 확인]이 나오며, [다시 읽기]는 돌아온다', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    draw()
    await answer(days())
    await user.click(button('다시 읽기'))
    await answer(NOT_READY)

    expectNumbersShown(64, 9, 55)
    const at = screen.getByText('오늘 오후 3:42에 읽었어요')
    const note = expectUnreadable()
    expectOrder(h1(), at, note, todaySection())
    expect(region('오늘 브리핑').contains(note)).toBe(true)
    expect((button('다시 읽기') as HTMLButtonElement).disabled).toBe(false)
    noText(CONNECT_H1)
  })

  it('AC-601.16: 오류 상자의 [다시 확인] — 상자가 사라지고 숫자·읽은 시각을 둔 채 안내가 나오며, [다시 읽기]가 돌아온다', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    draw()
    await answer(days())
    await user.click(button('다시 읽기'))
    await answer(failed('E-BIT-READ-FAILED'))
    await user.click(within(screen.getByRole('alert')).getByRole('button', { name: '다시 확인' }))
    await answer(NOT_READY)

    expectNumbersShown(64, 9, 55)
    expect(screen.getByText('오늘 오후 3:42에 읽었어요')).toBeTruthy()
    expectUnreadable()
    noButton('다시 확인')
    expect(button('다시 읽기')).toBeTruthy()
  })

  it('AC-601.16·AC-601.13: 저장 숫자 — 저절로 읽기 실패 뒤 [다시 확인]이 not-ready면 저장 숫자를 둔 채 안내가 나오고, 읽은 시각을 지어내지 않는다', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    draw(SAVED)
    await answer(failed('E-BIT-READ-FAILED'))
    await user.click(within(screen.getByRole('alert')).getByRole('button', { name: '다시 확인' }))
    await answer(NOT_READY)

    expectNumbersShown(5, 2, 3)
    expectUnreadable()
    noText(/에 읽었어요/)
    noText(CONNECT_H1)
  })

  it('AC-601.16·AC-601.11: 자료 없음 화면에서도 연결 전으로 돌아가지 않고 안내가 나온다', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    draw()
    await answer(days([]))
    await user.click(button('다시 읽기'))
    await answer(NOT_READY)

    expect(h1().textContent).toBe('오늘 받은 진료 자료가 아직 없어요')
    expectEmptyNumbers('자료 없음', '자료 없음')
    expect(screen.getByText('오늘 오후 3:42에 읽었어요')).toBeTruthy()
    expectUnreadable()
    noText('비트 PC 연결 전')
  })

  it('AC-601.16: 다시 누르면 안내가 사라지고, 읽기가 끝나면 다시 나오지 않는다', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    draw()
    await answer(days())
    await user.click(button('다시 읽기'))
    await answer(NOT_READY)
    expectUnreadable()

    await user.click(button('다시 읽기'))
    noText(UNREADABLE)
    expect((button('다시 읽는 중') as HTMLButtonElement).disabled).toBe(true)

    vi.setSystemTime(AT_345)
    await answer(days(NEWER_DAYS))
    noText(UNREADABLE)
    expectNumbersShown(70, 10, 60)
    expect(screen.getByText('오늘 오후 3:45에 읽었어요')).toBeTruthy()
  })

  it('AC-601.16·AC-601.5: 안내 뒤 다시 읽기가 실패하면 안내 없이 오류 상자만 나온다', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    draw()
    await answer(days())
    await user.click(button('다시 읽기'))
    await answer(NOT_READY)
    await user.click(button('다시 읽기'))
    await answer(failed('E-BIT-READ-FAILED'))

    noText(UNREADABLE)
    expect(screen.queryByRole('status')).toBeNull()
    expect(within(screen.getByRole('alert')).getByText('오류 번호 E-BIT-READ-FAILED')).toBeTruthy()
  })

  it('AC-601.16·AC-601.13: 개발 모드처럼 효과가 두 번 돌아도, 열 때 저절로 읽은 답이 not-ready면 안내가 없다', async () => {
    render(
      <StrictMode>
        <BitDashboard today={TODAY} initial={SAVED} />
      </StrictMode>,
    )
    await answer(NOT_READY)
    expectNumbersShown(5, 2, 3)
    noText(UNREADABLE)
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByRole('link', { name: '연결 확인' })).toBeNull()
  })
})

describe('AC-601.17: 읽는 동안 움직이는 표시', () => {
  beforeEach(onBitPc)

  it('AC-601.17: 처음 읽는 중 막대는 .bit-read-bar 하나이고 진행률 값이 없다. 도는 표시는 없다', () => {
    const { container } = draw()
    const bar = screen.getByRole('progressbar', { name: '비트 자료 읽는 중' })
    hasAll(bar, 'bit-read-bar mt-5 max-w-130')
    expect(bar.getAttribute('aria-valuenow')).toBeNull()
    expect(motionMarks(container)).toEqual(['bit-read-bar'])
  })

  it('AC-601.17: [다시 읽는 중] 단추에는 글자 앞에 꾸밈 도는 표시(.bit-read-spin)가 있고, 단추 이름은 그대로다. 막대는 없다', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    const { container } = draw()
    await answer(days())
    await user.click(button('다시 읽기'))

    const reading = button('다시 읽는 중')
    const spin = reading.firstElementChild!
    hasAll(spin, 'bit-read-spin')
    expect(spin.getAttribute('aria-hidden')).toBe('true')
    expect(reading.textContent).toBe('다시 읽는 중')
    expect(motionMarks(container)).toEqual(['bit-read-spin'])
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('AC-601.17: 저장 숫자를 둔 채 읽을 때도 [다시 읽는 중]에 도는 표시가 있다', () => {
    const { container } = draw(SAVED)
    hasAll(button('다시 읽는 중').firstElementChild!, 'bit-read-spin')
    expect(motionMarks(container)).toEqual(['bit-read-spin'])
  })

  it('AC-601.17: [다시 읽기]로 돌아오면 도는 표시가 없다', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    const { container } = draw()
    await answer(days())
    await user.click(button('다시 읽기'))
    await answer(days(NEWER_DAYS))
    expect(button('다시 읽기').firstElementChild).toBeNull()
    expect(motionMarks(container)).toEqual([])
  })
})

describe('AC-601.4·AC-601.12: 저장 숫자 없이 읽기 실패', () => {
  beforeEach(onBitPc)

  it.each<ErrorCode>(['E-STATS-HISTORY', 'E-STATS-TOO-BIG', 'E-BIT-READ-FAILED', 'E-BIT-NOT-REGISTERED', 'E-BIT-HOSPITAL-MISMATCH'])(
    'AC-601.4: %s — 큰 문장 자리에 lib/errors.ts 문구·번호와 [다시 확인]·[연결 확인]',
    async (code) => {
      draw()
      await answer(failed(code))
      const { what, fix } = errorInfo(code)
      expect(h1().textContent).toBe(what)
      const number = screen.getByText(`오류 번호 ${code}`)
      expectOrder(h1(), screen.getByText(fix), number, button('다시 확인'), link('연결 확인'))
      expect(link('연결 확인').getAttribute('href')).toBe(CONNECT_CHECK)
      hasAll(button('다시 확인'), ds.button.primaryLarge)
      hasAll(link('연결 확인'), ds.button.googleLarge)
    },
  )

  it('AC-601.4: 숫자를 지어내지 않는다 — 칩 "읽지 못함", 숫자 칸 "읽지 못했어요", 기간별 흐름은 그래프 없이 목록', async () => {
    draw()
    await answer(failed('E-BIT-READ-FAILED'))
    expectEmptyNumbers('읽지 못함', '읽지 못했어요')
    expect(within(todaySection()).queryByText(/읽기가 끝나면/)).toBeNull()
    expectGainsOfReading()
    noText('원장님 보고 문장')
    noButton('다시 읽기')
  })

  it('AC-601.4: [다시 확인]을 누르면 다시 읽고, 읽는 중 모양으로 돌아간다', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    draw()
    await answer(failed('E-BIT-READ-FAILED'))
    await user.click(button('다시 확인'))

    expect(readBitDays).toHaveBeenCalledTimes(2)
    expect(h1().textContent).toBe(READ_H1)
    await answer(days())
    expectNumbersShown(64, 9, 55)
  })

  it('AC-601.4: [다시 확인] 뒤 답이 not-ready면 연결 전 모양이다', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    draw()
    await answer(failed('E-BIT-READ-FAILED'))
    await user.click(button('다시 확인'))
    await answer(NOT_READY)
    expectBeforeConnect()
    noText(UNREADABLE)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('AC-601.12: 품질 incomplete(E-BIT-DATA-UNSURE)는 AC-601.4처럼 숫자 없이 문구·번호를 그린다', async () => {
    draw()
    await answer(failed('E-BIT-DATA-UNSURE'))
    expect(h1().textContent).toBe('비트 자료로 신환을 확정할 수 없어요')
    expect(screen.getByText('오류 번호 E-BIT-DATA-UNSURE')).toBeTruthy()
    expect(link('연결 확인').getAttribute('href')).toBe(CONNECT_CHECK)
    expectEmptyNumbers('읽지 못함', '읽지 못했어요')
  })
})

describe('AC-601.5·AC-601.12: 숫자가 있는 상태에서 다시 읽기 실패', () => {
  beforeEach(onBitPc)

  const failAfterRead = async (code: ErrorCode) => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    draw()
    await answer(days())
    await user.click(button('다시 읽기'))
    vi.setSystemTime(AT_345)
    await answer(failed(code))
    return user
  }

  it('AC-601.5: 이전 숫자와 읽은 시각을 두고, 그 아래 오류 상자에 문구·번호·"아래 숫자는 …"·[다시 확인]·[연결 확인]', async () => {
    await failAfterRead('E-BIT-READ-FAILED')
    expectNumbersShown(64, 9, 55)
    const at = screen.getByText('오늘 오후 3:42에 읽었어요')
    const box = screen.getByRole('alert')
    expectOrder(h1(), at, box, todaySection())
    const { what, fix } = errorInfo('E-BIT-READ-FAILED')
    expect(within(box).getByText(what)).toBeTruthy()
    expect(within(box).getByText(`아래 숫자는 오후 3:42에 읽은 그대로예요. ${fix}`)).toBeTruthy()
    expect(within(box).getByText('오류 번호 E-BIT-READ-FAILED')).toBeTruthy()
    expect(within(box).getByRole('button', { name: '다시 확인' })).toBeTruthy()
    expect(within(box).getByRole('link', { name: '연결 확인' }).getAttribute('href')).toBe(CONNECT_CHECK)
    hasAll(box, 'rounded-control bg-negative-soft')
  })

  it('AC-601.5: 이때 [다시 읽기]는 없다', async () => {
    await failAfterRead('E-BIT-READ-FAILED')
    noButton('다시 읽기')
    noButton('다시 읽는 중')
  })

  it('AC-601.5: 상자의 [다시 확인]은 숫자를 둔 채 다시 읽고, 그동안 상자는 사라진다', async () => {
    const user = await failAfterRead('E-BIT-READ-FAILED')
    await user.click(within(screen.getByRole('alert')).getByRole('button', { name: '다시 확인' }))
    expect(readBitDays).toHaveBeenCalledTimes(3)
    expect(screen.queryByRole('alert')).toBeNull()
    expect((button('다시 읽는 중') as HTMLButtonElement).disabled).toBe(true)
    expectNumbersShown(64, 9, 55)
  })

  it('AC-601.12: 다시 읽기의 품질 incomplete도 AC-601.5처럼 이전 숫자를 두고 오류 상자를 보인다', async () => {
    await failAfterRead('E-BIT-DATA-UNSURE')
    expectNumbersShown(64, 9, 55)
    const box = screen.getByRole('alert')
    expect(within(box).getByText('비트 자료로 신환을 확정할 수 없어요')).toBeTruthy()
    expect(within(box).getByText('오류 번호 E-BIT-DATA-UNSURE')).toBeTruthy()
  })

  it('AC-601.5·AC-601.7: 다시 읽기 때 다른 창이 쓰는 중이면 같은 상자에 그 문구와 번호다', async () => {
    await failAfterRead('E-BIT-IN-USE')
    expectNumbersShown(64, 9, 55)
    const box = screen.getByRole('alert')
    expect(within(box).getByText('다른 창이 비트 자료를 쓰고 있어요')).toBeTruthy()
    expect(within(box).getByText('오류 번호 E-BIT-IN-USE')).toBeTruthy()
    expect(within(box).getByRole('button', { name: '다시 확인' })).toBeTruthy()
  })
})

describe('AC-601.7: 다른 창이 통로를 쓰는 중', () => {
  beforeEach(onBitPc)

  it('AC-601.7: E-BIT-IN-USE 문구·번호와 [다시 확인]이 나오고 [연결 확인]은 없다. 칩 "기다리는 중", 숫자 칸 "아직 못 읽었어요"', async () => {
    draw()
    await answer(failed('E-BIT-IN-USE'))
    expect(h1().textContent).toBe('다른 창이 비트 자료를 쓰고 있어요')
    expect(screen.getByText('한 번에 한 창만 비트를 읽을 수 있어요. 그 창의 일이 끝나거나 창을 닫은 뒤 [다시 확인]을 눌러 주세요.')).toBeTruthy()
    expect(screen.getByText('오류 번호 E-BIT-IN-USE')).toBeTruthy()
    expect(button('다시 확인')).toBeTruthy()
    expect(screen.queryByRole('link', { name: '연결 확인' })).toBeNull()
    expectEmptyNumbers('기다리는 중', '아직 못 읽었어요')
    expectGainsOfReading()
    // 청구 화면 문구(E-BRIDGE-BUSY)를 빌려 쓰지 않는다
    noText(/청구 화면이 다른 창/)
  })
})

describe('AC-601.10: 3분 제한', () => {
  it('AC-601.10: 화면은 제한 시간을 바꾸지 않고(readBitDays 기본 3분), 시간 초과 답 E-BIT-READ-FAILED를 실패로 그린다', async () => {
    onBitPc()
    draw()
    expect(reads[0]!.deps.timeoutMs).toBeUndefined()
    await answer(failed('E-BIT-READ-FAILED'))
    expect(h1().textContent).toBe(errorInfo('E-BIT-READ-FAILED').what)
    expect(screen.getByText('오류 번호 E-BIT-READ-FAILED')).toBeTruthy()
  })
})

describe('AC-601.11: 읽기는 성공했지만 일 숫자가 빈 배열', () => {
  beforeEach(onBitPc)

  it('AC-601.11: 연결 전 모양으로 돌아가지 않고 보고 문장 자리에 "오늘 받은 진료 자료가 아직 없어요", 숫자 칸 "자료 없음"', async () => {
    draw()
    await answer(days([]))
    expect(h1().textContent).toBe('오늘 받은 진료 자료가 아직 없어요')
    expectEmptyNumbers('자료 없음', '자료 없음')
    expect(screen.queryByRole('link', { name: '비트 PC 연결 시작' })).toBeNull()
    noText(CONNECT_H1)
    noText('비트 PC 연결 전')
  })

  it('AC-601.11: 읽은 시각과 [다시 읽기]가 있고, 기간별 흐름은 "연결하면·읽기가 끝나면" 글 없이 빈 그래프 틀이다', async () => {
    draw()
    await answer(days([]))
    expect(screen.getByText('오늘 오후 3:42에 읽었어요')).toBeTruthy()
    expect(button('다시 읽기')).toBeTruthy()
    expect(within(flow()).queryByText(/생기는 것/)).toBeNull()
    expect(within(flow()).getByRole('heading', { level: 3, name: '환자 수 추이' })).toBeTruthy()
    expect(within(todaySection()).queryByText(/읽기가 끝나면|연결하면/)).toBeNull()
  })
})

describe('AC-601.13: 처음 자료로 받은 저장 숫자', () => {
  it('AC-601.13: 비트 PC가 아니면 저장 숫자만 그린다 — 읽지 않고, 읽은 시각도 단추도 오류도 없다', () => {
    notBitPc()
    draw(SAVED)
    expect(readBitDays).not.toHaveBeenCalled()
    expectNumbersShown(5, 2, 3)
    noButton('다시 읽기')
    noButton('다시 읽는 중')
    noText(/에 읽었어요/)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-601.13: 비트 PC면 그 숫자를 먼저 그리고 읽는 동안 그대로 둔 채 "다시 읽는 중"이다. 읽은 시각은 지어내지 않는다', () => {
    onBitPc()
    draw(SAVED)
    expect(readBitDays).toHaveBeenCalledTimes(1)
    expectNumbersShown(5, 2, 3)
    expect((button('다시 읽는 중') as HTMLButtonElement).disabled).toBe(true)
    noText(/에 읽었어요/)
    noText(READ_H1)
  })

  it('AC-601.13: 읽기가 끝나면 비트 숫자로 바꾼다', async () => {
    onBitPc()
    draw(SAVED)
    await answer(days())
    expectNumbersShown(64, 9, 55)
    expect(screen.getByText('오늘 오후 3:42에 읽었어요')).toBeTruthy()
    expect(button('다시 읽기')).toBeTruthy()
  })

  it('AC-601.13: 실패하면 저장 숫자를 둔 채 AC-601.5의 오류 상자를 보인다. 읽은 적이 없으니 시각 대신 "저장해 둔 그대로"다', async () => {
    onBitPc()
    draw(SAVED)
    await answer(failed('E-BIT-READ-FAILED'))
    expectNumbersShown(5, 2, 3)
    const box = screen.getByRole('alert')
    const { what, fix } = errorInfo('E-BIT-READ-FAILED')
    expect(within(box).getByText(what)).toBeTruthy()
    expect(within(box).getByText(`${SAVED_KEPT} ${fix}`)).toBeTruthy()
    expect(within(box).getByText('오류 번호 E-BIT-READ-FAILED')).toBeTruthy()
    expect(within(box).getByRole('button', { name: '다시 확인' })).toBeTruthy()
    expect(within(box).getByRole('link', { name: '연결 확인' }).getAttribute('href')).toBe(CONNECT_CHECK)
    noText(/에 읽었어요/)
    noButton('다시 읽기')
  })

  it('AC-601.13: 비트 PC가 아니어서 답이 not-ready면 저장 숫자를 그대로 두고 아무것도 더하지 않는다', async () => {
    onBitPc()
    draw(SAVED)
    await answer(NOT_READY)
    expectNumbersShown(5, 2, 3)
    noButton('다시 읽기')
    noButton('다시 읽는 중')
    noText(/에 읽었어요/)
    expect(screen.queryByRole('alert')).toBeNull()
    noText(CONNECT_H1)
    noText(UNREADABLE)
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByRole('link', { name: '연결 확인' })).toBeNull()
  })
})

describe('AC-601.15: 화면을 떠나면 그만둔다', () => {
  beforeEach(onBitPc)

  it('AC-601.15: 화면을 떠나면 읽기를 취소한다', () => {
    const { unmount } = draw()
    const { signal } = reads[0]!.deps
    expect(signal?.aborted).toBe(false)
    unmount()
    expect(signal?.aborted).toBe(true)
  })

  it('AC-601.15: 개발 모드처럼 효과가 두 번 돌면 첫 읽기는 취소되고, 그 답은 상태에 넣지 않는다', async () => {
    render(
      <StrictMode>
        <BitDashboard today={TODAY} initial={NONE} />
      </StrictMode>,
    )
    expect(reads).toHaveLength(2)
    expect(reads[0]!.deps.signal?.aborted).toBe(true)
    expect(reads[1]!.deps.signal?.aborted).toBe(false)

    await answer(days(), 0)
    expect(h1().textContent).toBe(READ_H1)

    await answer(days(NEWER_DAYS), 1)
    expectNumbersShown(70, 10, 60)
  })

  it('AC-601.15: 취소된 읽기가 뒤늦게 not-ready로 끝나도 새 읽기의 화면을 바꾸지 않는다', async () => {
    render(
      <StrictMode>
        <BitDashboard today={TODAY} initial={NONE} />
      </StrictMode>,
    )
    await answer(NOT_READY, 0)
    expect(h1().textContent).toBe(READ_H1)
  })

  it('AC-601.15: 떠난 뒤에 온 답은 무시한다(오류 없이 끝난다)', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { unmount } = draw()
    unmount()
    await answer(days())
    expect(error).not.toHaveBeenCalled()
    error.mockRestore()
  })
})

describe('AC-601.9: 자동 읽기는 서버로 아무것도 보내지 않는다', () => {
  it('AC-601.9: 화면 파일에 서버 요청·브라우저 저장소가 없다', () => {
    const dir = join(process.cwd(), 'src/components/dashboard/live')
    for (const file of ['BitDashboard.tsx', 'ReadStatus.tsx']) {
      expect(readFileSync(join(dir, file), 'utf8'), file).not.toMatch(/\bfetch\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|indexedDB|document\.cookie|lib\/supabase/)
    }
  })
})

describe('모양 규칙', () => {
  beforeEach(onBitPc)

  // 움직이는 표시는 .bit-read-* 둘뿐이다(AC-601.17). Tailwind animate-*와 overflow-hidden·rounded-full 금지는 두 표시를 포함해 그대로다
  it.each<[string, ReadResult | null, string[]]>([
    ['읽는 중', null, ['bit-read-bar']],
    ['처음 실패', failed('E-BIT-READ-FAILED'), []],
    ['다른 창 사용 중', failed('E-BIT-IN-USE'), []],
    ['숫자 있음', days(), []],
  ])('AC-601.2·AC-601.4·AC-601.17: %s — h1은 하나, 상자 안 상자가 없고, 정해 둔 표시 밖의 움직임 클래스가 없다', async (_, result, marks) => {
    const { container } = draw()
    if (result) await answer(result)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(nestedBoxes(container)).toEqual([])
    expect(container.innerHTML).not.toMatch(/\banimate-|overflow-hidden|rounded-full/)
    expect(motionMarks(container)).toEqual(marks)
  })

  it('AC-601.17·AC-601.16: 다시 읽는 중과 안내 — 상자 안 상자가 없고, 도는 표시 밖의 움직임 클래스가 없다', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    const { container } = draw()
    await answer(days())
    await user.click(button('다시 읽기'))
    expect(nestedBoxes(container)).toEqual([])
    expect(container.innerHTML).not.toMatch(/\banimate-|overflow-hidden|rounded-full/)
    expect(motionMarks(container)).toEqual(['bit-read-spin'])

    await answer(NOT_READY)
    expect(nestedBoxes(container)).toEqual([])
    expect(container.innerHTML).not.toMatch(/\banimate-|overflow-hidden|rounded-full/)
    expect(motionMarks(container)).toEqual([])
  })
})

// ── 끝까지 잇기: 진짜 readBitDays + 가짜 확장 + 가짜 통계 Worker ──
describe('끝까지 잇기 (진짜 readBitDays)', () => {
  type Command = 'hello' | 'bit.check' | 'stats.rows'
  type Answer = 'silent' | ((id: string) => unknown[])
  const result = (data: unknown): Answer => (id) => [{ v: 1, id, type: 'result', data }]
  const error = (code: string): Answer => (id) => [{ v: 1, id, type: 'error', code }]
  const HELLO_OK = { helperVersion: '0.2.0', protocol: 1, extensionVersion: '0.1.0', extensionProtocol: 1 }
  const steps = [
    { name: 'find', ok: true },
    { name: 'db', ok: true },
    { name: 'registration', ok: true },
  ]
  const CHECK_OK = { steps, registered: true, institutionCode: '12345678' }
  const chunkEnd: Answer = (id) => [
    { v: 1, id, type: 'chunk', seq: 0, data: '{"visits":[]}' },
    { v: 1, id, type: 'end', count: 1, bytes: 13, sha256: 'a'.repeat(64) },
  ]
  const REPORT_MARK = 987654321 // 보고 금액 자리의 가짜 값: 화면에 나오면 안 된다
  const VIEW = {
    range: { from: '2026-07-25', to: TODAY },
    covered: { from: '2026-07-25', to: '2026-11-01' },
    quality: 'valid',
    checks: { noChart: 0, duplicate: 0, noFirst: 0 },
    months: [],
    days: DAYS,
    report: { daily: [{ day: TODAY, amount: REPORT_MARK }], monthly: [] },
  } as unknown as StatsLoaded

  const opened: MessagePort[] = []
  afterEach(() => {
    for (const port of opened.splice(0)) port.close()
  })

  class FakePort implements PortLike {
    sent: { id: string; cmd: Command; args: unknown }[] = []
    disconnected = false
    private fns: ((m: unknown) => void)[] = []
    onMessage = { addListener: (fn: (m: unknown) => void) => void this.fns.push(fn) }
    onDisconnect = { addListener: () => {} }
    constructor(private script: Record<Command, Answer>) {}
    postMessage(m: unknown) {
      if (this.disconnected) throw new Error('disconnected port')
      const request = m as FakePort['sent'][number]
      this.sent.push(request)
      const reply = this.script[request.cmd]
      if (reply !== 'silent') for (const r of reply(request.id)) for (const fn of this.fns) fn(r)
    }
    disconnect() {
      this.disconnected = true
    }
  }

  async function wire(script: Partial<Record<Command, Answer>> = {}, view: StatsLoaded = VIEW) {
    const real = await vi.importActual<typeof import('./readBitDays')>('./readBitDays')
    vi.mocked(readBitDays).mockImplementation(real.readBitDays)

    const port = new FakePort({ hello: result(HELLO_OK), 'bit.check': result(CHECK_OK), 'stats.rows': chunkEnd, ...script })
    vi.stubGlobal('chrome', { runtime: { connect: () => port } satisfies ChromeRuntimeLike })

    const loads: StatsLoadRequest[] = []
    let ended = false
    const worker = {
      onmessage: null as ((event: MessageEvent<StatsWorkerMessage>) => void) | null,
      onerror: null,
      onmessageerror: null,
      terminate: vi.fn(),
      postMessage(message: { type: string }, transfer?: Transferable[]) {
        if (message.type === 'bridge-port') {
          const bridgePort = transfer![0] as MessagePort
          opened.push(bridgePort)
          bridgePort.onmessage = (e: MessageEvent) => {
            if ((e.data as { type: string }).type === 'end') ended = true
            reply()
          }
        } else {
          loads.push(message as StatsLoadRequest)
          reply()
        }
      },
    }
    function reply() {
      const load = loads[0]
      if (load && ended) worker.onmessage?.({ data: { type: 'loaded', streamId: load.streamId, view } } as MessageEvent<StatsWorkerMessage>)
    }
    vi.mocked(createStatsWorker).mockReset()
    vi.mocked(createStatsWorker).mockReturnValue(worker as unknown as StatsWorkerLike as Worker)
    return { port, worker, loads, commands: () => port.sent.map((request) => request.cmd) }
  }

  it('AC-601.1·AC-601.8·AC-601.9: 열면 stats.rows(오늘 100일 전 ~ 오늘)를 Worker로 읽어 일 숫자만 그리고, 통로를 닫고 Worker를 끝내며, 서버 요청이 없다', async () => {
    const t = await wire()
    draw()
    await screen.findByRole('heading', { level: 1, name: '오늘 지금까지 환자 64명이 왔습니다.' })

    expect(t.commands()).toEqual(['hello', 'bit.check', 'stats.rows'])
    expect(t.port.sent[2]!.args).toEqual({ from: '2026-07-25', to: TODAY })
    expect(t.loads[0]).toMatchObject({ from: '2026-07-25', to: TODAY, today: TODAY, closeToday: false })
    expectNumbersShown(64, 9, 55)
    expect(document.body.textContent).not.toContain(String(REPORT_MARK))
    expect(document.body.textContent).not.toContain('987,654,321')
    expect(fetch).not.toHaveBeenCalled()
    expect(t.port.disconnected).toBe(true)
    expect(t.worker.terminate).toHaveBeenCalledTimes(1)
  })

  it.each<[string, Partial<Record<Command, Answer>>]>([
    ['도우미 없음', { hello: error('E-HELPER-MISSING') }],
    ['도우미 버전 안 맞음', { hello: result({ ...HELLO_OK, helperVersion: '0.1.1' }) }],
    ['등록 안 됨', { 'bit.check': result({ steps, registered: false }) }],
    ['bit.check 단계 실패', { 'bit.check': result({ steps: [{ name: 'find', ok: false, code: 'E-BIT-NOT-FOUND' }, ...steps.slice(1)], registered: true }) }],
  ])('AC-601.6: %s — stats.rows를 부르지 않고 연결 전 모양이다', async (_, script) => {
    const t = await wire(script)
    draw()
    await waitFor(() => expect(t.port.disconnected).toBe(true))
    await screen.findByRole('heading', { level: 1, name: CONNECT_H1 })
    expect(t.commands()).not.toContain('stats.rows')
    expectBeforeConnect()
    expect(t.worker.terminate).toHaveBeenCalledTimes(1)
  })

  it('AC-601.7·AC-601.8: 다른 창이 통로를 쓰는 중이면 E-BIT-IN-USE를 그리고 stats.rows를 부르지 않는다', async () => {
    const busy: Answer = () => [{ v: 1, id: '', type: 'error', code: 'E-BRIDGE-BUSY' }]
    const t = await wire({ hello: busy })
    draw()
    await screen.findByRole('heading', { level: 1, name: '다른 창이 비트 자료를 쓰고 있어요' })
    expect(t.commands()).not.toContain('stats.rows')
    expect(t.worker.terminate).toHaveBeenCalledTimes(1)
  })

  it('AC-601.12: Worker 답이 incomplete(days: null)면 숫자 없이 E-BIT-DATA-UNSURE를 그린다', async () => {
    await wire({}, { ...VIEW, quality: 'incomplete', months: null, days: null } as unknown as StatsLoaded)
    draw()
    await screen.findByRole('heading', { level: 1, name: '비트 자료로 신환을 확정할 수 없어요' })
    expectEmptyNumbers('읽지 못함', '읽지 못했어요')
  })

  it('AC-601.8: 실패로 끝나도 통로를 닫고 Worker를 끝낸다', async () => {
    const t = await wire({ 'stats.rows': error('E-STATS-HISTORY') })
    draw()
    await screen.findByText('오류 번호 E-STATS-HISTORY')
    expect(t.port.disconnected).toBe(true)
    expect(t.worker.terminate).toHaveBeenCalledTimes(1)
  })

  it('AC-601.15: 읽는 중에 화면을 떠나면 3분을 기다리지 않고 그 순간 통로를 닫고 Worker를 끝낸다', async () => {
    const t = await wire({ 'stats.rows': 'silent' })
    const { unmount } = draw()
    await waitFor(() => expect(t.commands()).toContain('stats.rows'))
    expect(t.port.disconnected).toBe(false)

    unmount()

    // 기다리지 않고 본다: 다음 화면의 통로가 같은 순간에 열린다
    expect(t.port.disconnected).toBe(true)
    expect(t.worker.terminate).toHaveBeenCalledTimes(1)
  })
})
