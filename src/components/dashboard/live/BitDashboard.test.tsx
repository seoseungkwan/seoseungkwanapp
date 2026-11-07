// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardHome } from '@/components/dashboard/briefing/DashboardHome'
import { AiBrief } from '@/components/dashboard/ai/AiBrief'
import { DailySection } from '@/components/dashboard/summary/DailySection'
import { DashboardAnalysis } from '@/components/dashboard/summary/DashboardAnalysis'
import { FlowSection } from '@/components/dashboard/summary/FlowSection'
import { ReportBlock } from '@/components/dashboard/summary/ReportBlock'
import type { OlderDays, SummarySource } from '@/components/dashboard/summary/source'
import { ds } from '@/components/ui/classes'
import { errorInfo } from '@/lib/errors'
import { nestedBoxes } from '@/testing/boxes'
import type { ChromeRuntimeLike, PortLike } from '@/types/bridge'
import type { ErrorCode } from '@/types/errors'
import type { DayPayload } from '@/types/payload'
import type { StatsLoaded, StatsLoadRequest, StatsWorkerMessage } from '@/types/stats'
import { createStatsWorker } from '@/workers/statsClient'
import { BitDashboard } from './BitDashboard'
import { DateControl } from './DateControl'
import { StatusHeader } from './ReadStatus'
import { readBitDays, type ReadResult, type StatsWorkerLike } from './readBitDays'
import type { DashboardGroups } from './rxGroups'

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

// 통계 탭 묶음 둘(가짜 이름·열쇠·코드, REQ-606). 일 줄 groups[].id가 묶음 열쇠다
const GROUPS: DashboardGroups = {
  lines: [
    { name: '운동치료', key: 'key-exercise' },
    { name: '체외충격파', key: 'key-shock' },
  ],
  defs: [
    { id: 'key-exercise', codes: ['MM301'] },
    { id: 'key-shock', codes: ['MM302', 'MM303'] },
  ],
}
const keyed = (d: DayPayload, exercise: number, shock: number): DayPayload => ({
  ...d,
  groups: [
    { id: 'key-exercise', patients: exercise, newPatients: 0, returning: exercise },
    { id: 'key-shock', patients: shock, newPatients: 0, returning: shock },
  ],
})
// 묶음 열쇠 줄을 실은 저장 숫자(오늘 5명)·비트 숫자(오늘 64명). 기간(지난 30일) 안 날은 10월 26일 하루다
const SAVED_KEYED: SummarySource = { kind: 'data', days: [keyed(day(TODAY, 2, 3, true), 1, 1), keyed(day('2026-10-26', 7, 60), 12, 5)] }
const BIT_KEYED = [keyed(day(TODAY, 9, 55, true), 2, 2), keyed(day('2026-10-26', 7, 60), 4, 20)]
const SAVED_RANK = [
  ['운동치료', '12건'],
  ['체외충격파', '5건'],
]
const BIT_RANK = [
  ['체외충격파', '20건'],
  ['운동치료', '4건'],
]
const GROUPS_UNREAD = '통계 탭 묶음을 읽지 못했어요. 화면을 새로 열면 다시 읽어요.' // AC-606.5
const GROUPS_NONE = '통계 탭 처방별 추세에서 묶음을 만들면 여기에 보여요.' // AC-606.4

const CONNECT_CHECK = '/claim/setup?next=dashboard'
const CONNECT_H1 = '비트 PC를 연결하면 오늘 숫자가 여기에 채워져요'
const READ_H1 = '비트에서 오늘 숫자를 읽고 있어요'
const READ_LEAD = '최근 100일 자료를 읽어요. 길면 3분쯤 걸려요. 다 읽을 때까지 이 화면을 열어 두세요.'
const SAVED_KEPT = '아래 숫자는 저장해 둔 그대로예요.'
const UNREADABLE = '이 PC에서 비트를 읽을 수 없어요. 연결을 확인해 주세요.'
// 숫자가 있는 화면의 머리 줄(dashboard-ux AC-2701.3): h1 "대시보드" · 상태 표시 · 시각 글 · [다시 읽기]
const HEADER_H1 = '대시보드'
const READ_AT_342 = '비트에서 읽은 시각 오늘 오후 3:42'
const READ_AT_345 = '비트에서 읽은 시각 오늘 오후 3:45'
const READ_AT = /비트에서 읽은 시각/

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
const drawWith = (initial: SummarySource, groups: DashboardGroups | null | 'pending' | undefined) =>
  render(<BitDashboard today={TODAY} initial={initial} groups={groups} />)

// ── 화면 읽기 도우미 ──
const region = (name: string) => screen.getByRole('region', { name })
// 큰 문장: 연결 전·읽는 중·실패는 h1 하나(머리 줄 없음). 숫자가 있으면 h1은 머리 줄 "대시보드" 하나뿐이고(dashboard-ux AC-2701.3·AC-2705.1),
// 큰 문장 자리는 보고 문장 한 단락(이름 줄 "{오늘|M월 D일} 보고 문장" 다음 단락)의 첫 문장 조각이다 — 보고 문장은 h1이 아니다
const REPORT_NAME = /^(오늘|\d+월 \d+일) 보고 문장$/
const bigLine = () => {
  const found = screen.getAllByRole('heading', { level: 1 })
  if (found.length === 1 && found[0]!.textContent === HEADER_H1) {
    const paragraph = screen.getByText(REPORT_NAME).parentElement!.nextElementSibling!
    expect(paragraph.tagName).toBe('P')
    return paragraph.children[0]!
  }
  expect(found.map((heading) => heading.textContent).filter((text) => text === HEADER_H1)).toEqual([])
  expect(found).toHaveLength(1)
  return found[0]!
}
const todaySection = () => region('오늘 하루 분석')
const flow = () => region('기간별 흐름')
// 숫자 칸 줄: 일별 현황 구역의 바로 아래 grid(기준일 묶음 다음, dashboard-ux AC-2703.1)
const kpiRow = (section: Element) => section.querySelector(':scope > div.grid')!
const kpiCells = () => Array.from(kpiRow(todaySection()).children)
const button = (name: string) => screen.getByRole('button', { name })
const noButton = (name: string) => expect(screen.queryByRole('button', { name })).toBeNull()
const link = (name: string) => screen.getByRole('link', { name })
const noText = (text: string | RegExp) => expect(screen.queryByText(text)).toBeNull()
// '처방 상위' 칸과 그 순위 막대 줄([이름, 값])
const rankChart = () => screen.getByRole('group', { name: '처방 상위' })
const rankRows = () =>
  Array.from(rankChart().querySelectorAll('ol[aria-label="처방 상위"] > li')).map((li) => [li.children[0]!.textContent, li.children[2]!.textContent])
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
  expect(bigLine().textContent).toBe(`오늘 지금까지 환자 ${patients}명이 왔습니다.`)
}
const expectBeforeConnect = () => {
  expect(bigLine().textContent).toBe(CONNECT_H1)
  expect(within(todaySection()).getByText('비트 PC 연결 전')).toBeTruthy()
  for (const cell of kpiCells()) expect(within(cell as HTMLElement).getByText('연결하면 보여요')).toBeTruthy()
  expect(within(flow()).getByText('연결하면 생기는 것 4가지')).toBeTruthy()
  expect(link('비트 PC 연결 시작').getAttribute('href')).toBe(CONNECT_CHECK)
}

// 대시보드 AI 요약(dashboard-ux AC-2704.1)이 여는 저장 리포트 읽기(GET)에 주는 합성 답: 리포트 없음. 진짜 서버·유료 API에 닿지 않는다
const AI_EMPTY = { report: null, stale: false, usage: { calls: 0, tokens: 0, costMicroUsd: 0 } }
const aiRead = () => vi.fn(async () => new Response(JSON.stringify(AI_EMPTY), { status: 200, headers: { 'Content-Type': 'application/json' } }))
// 비트·저장 숫자를 서버로 보내지 않는다: 부른 요청은 AI 요약의 GET /api/ai/report?month=(몸통 없음)뿐이다
const expectOnlyAiRead = () => {
  for (const [url, init] of vi.mocked(fetch).mock.calls) {
    expect(String(url)).toMatch(/^\/api\/ai\/report\?month=\d{4}-\d{2}$/)
    expect((init as RequestInit | undefined)?.method).toBe('GET')
    expect((init as RequestInit | undefined)?.body).toBeUndefined()
  }
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
  vi.stubGlobal('fetch', aiRead())
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('서버가 그린 첫 모양', () => {
  it('AC-601.6·AC-601.13·AC-2701.3·AC-2707.2: 서버 그림은 initial 그대로다 — 비트 PC에서도 읽는 중을 먼저 그리지 않는다(저장 숫자면 머리 줄 → 일별 현황(기준일·보고 문장) → AI 요약 → 기간별 흐름)', () => {
    onBitPc()
    expect(renderToStaticMarkup(<BitDashboard today={TODAY} initial={NONE} />)).toBe(
      renderToStaticMarkup(<DashboardHome today={TODAY} report={null} analysis={<DashboardAnalysis today={TODAY} source={NONE} />} />),
    )
    expect(renderToStaticMarkup(<BitDashboard today={TODAY} initial={SAVED} />)).toBe(
      renderToStaticMarkup(
        <DashboardHome
          today={TODAY}
          dateLine={null}
          report={<StatusHeader readAt={null} savedAt={null} reading={false} failed={false} onReread={() => {}} />}
          analysis={
            <>
              <DailySection
                today={TODAY}
                source={SAVED}
                dateLine={<DateControl today={TODAY} selected={TODAY} onChange={() => {}} />}
                sentence={<ReportBlock today={TODAY} days={SAVED.kind === 'data' ? SAVED.days : []} />}
              />
              <div className="mt-12 max-md:mt-8">
                <AiBrief today={TODAY} />
              </div>
              <FlowSection today={TODAY} source={SAVED} />
            </>
          }
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
    // 보고 문장 이름 줄과 칩(AC-2705.1)
    expect(screen.getByText('오늘 보고 문장')).toBeTruthy()
    expect(screen.getByText('자동 집계 요약')).toBeTruthy()
    for (const name of ['환자 수 추이', '신환 재방문율', '요일별 환자 수', '처방 상위']) {
      expect(within(flow()).getByRole('heading', { level: 3, name })).toBeTruthy()
    }
    // 연결 뒤 모양: 연결 전 부품이 없고, 지금 바로 묶음은 기간별 흐름 아래 바로 가기 자리다(dashboard-ux AC-2707.2)
    expect(screen.queryByRole('link', { name: '비트 PC 연결 시작' })).toBeNull()
    expectOrder(flow(), screen.getByRole('heading', { level: 2, name: '지금 바로 쓸 수 있어요' }))
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
    expect(bigLine().textContent).toBe(READ_H1)
    const lead = screen.getByText(READ_LEAD)
    const bar = screen.getByRole('progressbar', { name: '비트 자료 읽는 중' })
    const safe = screen.getByText('환자 개인정보는 의원 PC 밖으로 나가지 않아요. 비트 자료는 읽기만 해요.')
    expectOrder(bigLine(), lead, bar, safe)
    expect(within(region('오늘 브리핑')).getByRole('heading', { level: 1 })).toBe(bigLine())
    hasAll(bigLine(), 'text-display-m font-semibold text-ink max-md:text-heading-m')
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

  it('AC-601.3·AC-2701.3·AC-2707.2: 맨 위 머리 줄에 "비트에서 읽은 시각 오늘 오후 3:42"와 [다시 읽기]가 있고, 보고 문장은 그 아래 일별 현황 안이다', async () => {
    draw()
    await answer(days())
    const at = screen.getByText(READ_AT_342)
    expectOrder(at, button('다시 읽기'), todaySection(), bigLine())
    hasAll(button('다시 읽기'), ds.button.secondarySmall)
    expect(region('오늘 브리핑').contains(at)).toBe(true)
  })

  it('AC-601.3·AC-2701.3: 읽은 시각은 서울 시간대 PC에서 한국 시각이다', async () => {
    vi.setSystemTime(new Date('2026-11-02T00:05:00Z'))
    draw()
    await answer(days())
    expect(screen.getByText('비트에서 읽은 시각 오늘 오전 9:05')).toBeTruthy()
  })

  it('AC-601.3·AC-2701.3: 비트에서 읽은 시각·서버 저장 시각은 그 PC 시간대와 상관없이 한국 시각이다 — 뉴욕 시간대 PC에서 불러도 같다', async () => {
    // vitest.config.ts가 시험 전체를 서울 시간대로 고정한다. 시각 서식(KOREA_TIME)은 ReadStatus를 불러올 때 한 번 만들어지므로, 시간대를 바꾼 뒤 모듈을 새로 부른다
    const at = new Date('2026-11-02T00:05:00Z')
    const seoul = process.env.TZ
    process.env.TZ = 'America/New_York'
    try {
      expect(at.getHours(), '이 PC 시계가 한국과 달라야 시험이 헛돌지 않는다').not.toBe(9)
      vi.resetModules()
      const { StatusHeader: Header } = await import('./ReadStatus')
      render(<Header readAt={at.getTime()} savedAt={null} reading={false} failed={false} onReread={() => {}} />)
      expect(screen.getByText('비트에서 읽은 시각 오늘 오전 9:05')).toBeTruthy()
      cleanup()
      // 서버 저장 시각(updated_at): 뉴욕 11월 1일 오후 8:05 = 한국 11월 2일 오전 9:05
      render(<Header readAt={null} savedAt="2026-11-02T00:05:00.000+00:00" reading={false} failed={false} onReread={() => {}} />)
      expect(screen.getByText('서버에 마지막으로 저장된 시각 11월 2일 오전 9:05 · 날짜마다 저장된 때가 달라요')).toBeTruthy()
    } finally {
      process.env.TZ = seoul ?? 'Asia/Seoul'
      vi.resetModules()
    }
  })

  it('AC-601.3: 누르면 이전 숫자를 둔 채 다시 읽고, 그동안 단추는 "다시 읽는 중"으로 막힌다', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    draw()
    await answer(days())
    await user.click(button('다시 읽기'))

    expect(readBitDays).toHaveBeenCalledTimes(2)
    expect(reads[1]!.deps.signal?.aborted).toBe(false)
    expectNumbersShown(64, 9, 55)
    expect(screen.getByText(READ_AT_342)).toBeTruthy()
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
    expect(screen.getByText(READ_AT_345)).toBeTruthy()
    expect((button('다시 읽기') as HTMLButtonElement).disabled).toBe(false)
  })

  it('AC-601.3·AC-601.16: 다시 읽기 답이 not-ready면 숫자·시각을 그대로 두고 단추가 돌아온다', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    draw()
    await answer(days())
    await user.click(button('다시 읽기'))
    await answer(NOT_READY)

    expectNumbersShown(64, 9, 55)
    expect(screen.getByText(READ_AT_342)).toBeTruthy()
    expect(button('다시 읽기')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

// 숫자가 있는 화면의 머리 줄 (dashboard-ux REQ-2701 AC-2701.3·AC-2701.4, design.md §2, 시안 docs/mockups/dashboard-ux/index.html head()).
// "비트 연결됨"처럼 지금 연결돼 있다는 글은 쓰지 않는다(실시간 연결 확인이 없다). 시각 글은 비트에서 읽은 시각과 서버 저장 시각 중 하나만이다
describe('AC-2701.3·AC-2701.4: 머리 줄 — 상태 표시 · 시각 글 · [다시 읽기]', () => {
  const SAVED_AT = '2026-11-02T03:05:00.000+00:00' // 한국 낮 12시 5분(readDays latest.at)
  const SAVED_TIME = '서버에 마지막으로 저장된 시각 11월 2일 오후 12:05 · 날짜마다 저장된 때가 달라요'
  const header = () => screen.getByRole('heading', { level: 1, name: HEADER_H1 }).parentElement as HTMLElement
  const expectChip = (text: string, tone: string) => hasAll(within(header()).getByText(text), tone)
  const neverConnected = () => expect(document.body.textContent).not.toMatch(/연결됨/)

  it('AC-2701.3: 저장 숫자만 → 다시 읽는 중 → 비트에서 읽은 숫자 → 비트 읽기 실패로 상태 표시가 바뀌고, 시각 글은 비트 시각이 있으면 그것만, 없으면 서버 저장 시각(없으면 시각 글 없음)이다', async () => {
    // 비트 PC가 아님: 저장 숫자만 · 서버 저장 시각 · 단추 없음
    notBitPc()
    render(<BitDashboard today={TODAY} initial={SAVED} savedAt={SAVED_AT} />)
    expect(header().tagName).toBe('DIV')
    expectChip('서버에 저장된 숫자', ds.chip.neutral)
    expect(within(header()).getByText(SAVED_TIME)).toBeTruthy()
    expect(within(header()).queryByRole('button')).toBeNull()
    neverConnected()
    cleanup()

    // 저장 시각을 모르면(latest 없음) 시각 글을 지어내지 않는다
    render(<BitDashboard today={TODAY} initial={SAVED} savedAt={null} />)
    expectChip('서버에 저장된 숫자', ds.chip.neutral)
    expect(header().textContent).not.toMatch(/시각/)
    cleanup()

    // 비트 PC: 열면 저장 숫자를 둔 채 다시 읽는 중 — 시각은 아직 서버 저장 시각
    onBitPc()
    const user = userEvent.setup({ advanceTimers: () => {} })
    render(<BitDashboard today={TODAY} initial={SAVED} savedAt={SAVED_AT} />)
    expectChip('비트에서 다시 읽는 중', ds.chip.accent)
    expect(within(header()).getByText(SAVED_TIME)).toBeTruthy()
    expect((within(header()).getByRole('button', { name: '다시 읽는 중' }) as HTMLButtonElement).disabled).toBe(true)

    // 비트에서 읽음: 비트 시각만(서버 저장 시각과 함께 쓰지 않는다)
    await answer(days())
    expectChip('비트에서 읽은 숫자', ds.chip.positive)
    expect(within(header()).getByText(READ_AT_342)).toBeTruthy()
    expect(header().textContent).not.toContain('서버에 마지막으로 저장된 시각')
    expect(within(header()).getByRole('button', { name: '다시 읽기' })).toBeTruthy()
    neverConnected()

    // 다시 읽기 실패: 상태 표시 "비트 읽기 실패", 시각은 읽은 그대로, 단추는 오류 상자가 맡는다
    await user.click(button('다시 읽기'))
    expectChip('비트에서 다시 읽는 중', ds.chip.accent)
    await answer(failed('E-BIT-READ-FAILED'))
    expectChip('비트 읽기 실패', ds.chip.negative)
    expect(within(header()).getByText(READ_AT_342)).toBeTruthy()
    expect(within(header()).queryByRole('button')).toBeNull()
    neverConnected()
  })

  it('AC-2701.4: 다시 읽는 중·다시 읽기 실패에도 숫자 칸과 그래프의 숫자를 지우지 않고, 실패는 머리 줄 아래 오류 상자(글·번호·[다시 확인]·[연결 확인])다', async () => {
    onBitPc()
    const user = userEvent.setup({ advanceTimers: () => {} })
    drawWith(SAVED_KEYED, GROUPS)
    await answer(days(BIT_KEYED))
    expectNumbersShown(64, 9, 55)
    expect(rankRows()).toEqual(BIT_RANK)

    await user.click(button('다시 읽기'))
    expectNumbersShown(64, 9, 55)
    expect(rankRows()).toEqual(BIT_RANK)

    await answer(failed('E-BIT-READ-FAILED'))
    expectNumbersShown(64, 9, 55)
    expect(rankRows()).toEqual(BIT_RANK)
    const box = screen.getByRole('alert')
    expectOrder(header(), box, todaySection())
    expect(within(box).getByText(errorInfo('E-BIT-READ-FAILED').what)).toBeTruthy()
    expect(within(box).getByText('오류 번호 E-BIT-READ-FAILED')).toBeTruthy()
    expect(within(box).getByRole('button', { name: '다시 확인' })).toBeTruthy()
    expect(within(box).getByRole('link', { name: '연결 확인' }).getAttribute('href')).toBe(CONNECT_CHECK)
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
    const at = screen.getByText(READ_AT_342)
    const note = expectUnreadable()
    expectOrder(at, note, todaySection(), bigLine())
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
    expect(screen.getByText(READ_AT_342)).toBeTruthy()
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
    noText(READ_AT)
    noText(CONNECT_H1)
  })

  it('AC-601.16·AC-601.11: 자료 없음 화면에서도 연결 전으로 돌아가지 않고 안내가 나온다', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    draw()
    await answer(days([]))
    await user.click(button('다시 읽기'))
    await answer(NOT_READY)

    expect(bigLine().textContent).toBe('오늘 받은 진료 자료가 아직 없어요')
    expectEmptyNumbers('자료 없음', '자료 없음')
    expect(screen.getByText(READ_AT_342)).toBeTruthy()
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
    expect(screen.getByText(READ_AT_345)).toBeTruthy()
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

  // 직접 누른 표시는 그 읽기 하나에만 쓴다. 날짜가 바뀌어 저절로 다시 읽는 것은 누른 것이 아니다
  const NEXT_DAY = '2026-11-03'

  it('AC-601.16·AC-601.13: 한 번 누른 뒤 날짜만 바뀌어 저절로 다시 읽은 답이 not-ready면 안내가 없다', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    const { rerender } = draw()
    await answer(days())
    await user.click(button('다시 읽기'))
    await answer(days(NEWER_DAYS))

    rerender(<BitDashboard today={NEXT_DAY} initial={NONE} />)
    expect(readBitDays).toHaveBeenCalledTimes(3)
    await answer(NOT_READY)

    noText(UNREADABLE)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('AC-601.16·AC-601.13: 누른 읽기가 끝나기 전에 날짜가 바뀌면 그 읽기는 취소되고, 저절로 다시 읽은 답이 not-ready여도 안내가 없다', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    const { rerender } = draw()
    await answer(days())
    await user.click(button('다시 읽기'))

    rerender(<BitDashboard today={NEXT_DAY} initial={NONE} />)
    expect(reads[1]!.deps.signal?.aborted).toBe(true)
    await answer(NOT_READY)

    noText(UNREADABLE)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('AC-601.16: 날짜가 바뀌어 저절로 읽은 뒤에도 직접 누르면 안내가 나오고, 또 눌러도 다시 나온다', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    const { rerender } = draw()
    await answer(days())
    rerender(<BitDashboard today={NEXT_DAY} initial={NONE} />)
    await answer(NOT_READY)
    noText(UNREADABLE)

    await user.click(button('다시 읽기'))
    await answer(NOT_READY)
    expectUnreadable()

    await user.click(button('다시 읽기'))
    noText(UNREADABLE)
    await answer(NOT_READY)
    expectUnreadable()
  })

  it('AC-601.16: 개발 모드(효과가 두 번 도는 곳)에서도 직접 누른 답이 not-ready면 안내가 나온다', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    render(
      <StrictMode>
        <BitDashboard today={TODAY} initial={NONE} />
      </StrictMode>,
    )
    await answer(days())
    await user.click(button('다시 읽기'))
    await answer(NOT_READY)
    expectUnreadable()
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
      expect(bigLine().textContent).toBe(what)
      const number = screen.getByText(`오류 번호 ${code}`)
      expectOrder(bigLine(), screen.getByText(fix), number, button('다시 확인'), link('연결 확인'))
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
    noText(REPORT_NAME)
    noText('자동 집계 요약')
    noButton('다시 읽기')
  })

  it('AC-601.4: [다시 확인]을 누르면 다시 읽고, 읽는 중 모양으로 돌아간다', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    draw()
    await answer(failed('E-BIT-READ-FAILED'))
    await user.click(button('다시 확인'))

    expect(readBitDays).toHaveBeenCalledTimes(2)
    expect(bigLine().textContent).toBe(READ_H1)
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
    expect(bigLine().textContent).toBe('비트 자료로 신환을 확정할 수 없어요')
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
    const at = screen.getByText(READ_AT_342)
    const box = screen.getByRole('alert')
    expectOrder(at, box, todaySection(), bigLine())
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
    expect(bigLine().textContent).toBe('다른 창이 비트 자료를 쓰고 있어요')
    expect(screen.getByText('한 번에 한 창만 비트를 읽을 수 있어요. 그 창의 일이 끝나거나 창을 닫은 뒤 [다시 확인]을 눌러 주세요.')).toBeTruthy()
    expect(screen.getByText('오류 번호 E-BIT-IN-USE')).toBeTruthy()
    expect(button('다시 확인')).toBeTruthy()
    expect(screen.queryByRole('link', { name: '연결 확인' })).toBeNull()
    expectEmptyNumbers('기다리는 중', '아직 못 읽었어요')
    expectGainsOfReading()
    // 청구·매출 화면 문구(E-BRIDGE-BUSY)를 빌려 쓰지 않는다. 옛 글자만 보면 글자가 바뀐 뒤 빈 검사가 된다
    noText(/비트 연결을 다른 창에서/)
  })
})

describe('AC-601.10: 3분 제한', () => {
  it('AC-601.10: 화면은 제한 시간을 바꾸지 않고(readBitDays 기본 3분), 시간 초과 답 E-BIT-READ-FAILED를 실패로 그린다', async () => {
    onBitPc()
    draw()
    expect(reads[0]!.deps.timeoutMs).toBeUndefined()
    await answer(failed('E-BIT-READ-FAILED'))
    expect(bigLine().textContent).toBe(errorInfo('E-BIT-READ-FAILED').what)
    expect(screen.getByText('오류 번호 E-BIT-READ-FAILED')).toBeTruthy()
  })
})

describe('AC-601.11: 읽기는 성공했지만 일 숫자가 빈 배열', () => {
  beforeEach(onBitPc)

  it('AC-601.11: 연결 전 모양으로 돌아가지 않고 보고 문장 자리에 "오늘 받은 진료 자료가 아직 없어요", 숫자 칸 "자료 없음"', async () => {
    draw()
    await answer(days([]))
    expect(bigLine().textContent).toBe('오늘 받은 진료 자료가 아직 없어요')
    expectEmptyNumbers('자료 없음', '자료 없음')
    expect(screen.queryByRole('link', { name: '비트 PC 연결 시작' })).toBeNull()
    noText(CONNECT_H1)
    noText('비트 PC 연결 전')
  })

  it('AC-601.11: 읽은 시각과 [다시 읽기]가 있고, 기간별 흐름은 "연결하면·읽기가 끝나면" 글 없이 빈 그래프 틀이다', async () => {
    draw()
    await answer(days([]))
    expect(screen.getByText(READ_AT_342)).toBeTruthy()
    expect(button('다시 읽기')).toBeTruthy()
    expect(within(flow()).queryByText(/생기는 것/)).toBeNull()
    expect(within(flow()).getByRole('heading', { level: 3, name: '환자 수 추이' })).toBeTruthy()
    expect(within(todaySection()).queryByText(/읽기가 끝나면|연결하면/)).toBeNull()
  })

  it('AC-601.11·AC-601.5: 자료 없음 화면에서 다시 읽기가 실패하면 오류 상자에 "아래 숫자는 …"이 없다 — 둘 숫자가 없다', async () => {
    const user = userEvent.setup({ advanceTimers: () => {} })
    draw()
    await answer(days([]))
    await user.click(button('다시 읽기'))
    await answer(failed('E-BIT-READ-FAILED'))

    const box = screen.getByRole('alert')
    const { what, fix } = errorInfo('E-BIT-READ-FAILED')
    expect(within(box).getByText(what)).toBeTruthy()
    expect(within(box).getByText(fix)).toBeTruthy()
    expect(box.textContent).not.toContain('아래 숫자는')
    expect(within(box).getByText('오류 번호 E-BIT-READ-FAILED')).toBeTruthy()
    expect(within(box).getByRole('button', { name: '다시 확인' })).toBeTruthy()
    expect(within(box).getByRole('link', { name: '연결 확인' }).getAttribute('href')).toBe(CONNECT_CHECK)
    expect(bigLine().textContent).toBe('오늘 받은 진료 자료가 아직 없어요')
    expect(screen.getByText(READ_AT_342)).toBeTruthy()
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
    noText(READ_AT)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-601.13: 비트 PC면 그 숫자를 먼저 그리고 읽는 동안 그대로 둔 채 "다시 읽는 중"이다. 읽은 시각은 지어내지 않는다', () => {
    onBitPc()
    draw(SAVED)
    expect(readBitDays).toHaveBeenCalledTimes(1)
    expectNumbersShown(5, 2, 3)
    expect((button('다시 읽는 중') as HTMLButtonElement).disabled).toBe(true)
    noText(READ_AT)
    noText(READ_H1)
  })

  it('AC-601.13: 읽기가 끝나면 비트 숫자로 바꾼다', async () => {
    onBitPc()
    draw(SAVED)
    await answer(days())
    expectNumbersShown(64, 9, 55)
    expect(screen.getByText(READ_AT_342)).toBeTruthy()
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
    noText(READ_AT)
    noButton('다시 읽기')
  })

  it('AC-601.13: 비트 PC가 아니어서 답이 not-ready면 저장 숫자를 그대로 두고 아무것도 더하지 않는다', async () => {
    onBitPc()
    draw(SAVED)
    await answer(NOT_READY)
    expectNumbersShown(5, 2, 3)
    noButton('다시 읽기')
    noButton('다시 읽는 중')
    noText(READ_AT)
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
    expect(bigLine().textContent).toBe(READ_H1)

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
    expect(bigLine().textContent).toBe(READ_H1)
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

// LiveDashboard가 저장 숫자 오류 카드를 거두는 때(design.md '### 화면' onBitLoaded). 비트 읽기가 days로 끝날 때만 부른다
describe('AC-601.19·AC-601.14: 비트 숫자가 오면 알린다(onBitLoaded)', () => {
  beforeEach(onBitPc)
  const drawWith = (onBitLoaded: () => void, initial: SummarySource = NONE) => render(<BitDashboard today={TODAY} initial={initial} onBitLoaded={onBitLoaded} />)

  it('AC-601.19: 비트 읽기가 days로 끝나면 한 번 부른다 — 읽는 동안에는 부르지 않는다', async () => {
    const loaded = vi.fn()
    drawWith(loaded)
    expect(loaded).not.toHaveBeenCalled()
    await answer(days())
    expect(loaded).toHaveBeenCalledTimes(1)
    expectNumbersShown(64, 9, 55)
  })

  it('AC-601.19: 일 숫자가 빈 배열이어도(days: []) 부른다', async () => {
    const loaded = vi.fn()
    drawWith(loaded, SAVED)
    await answer(days([]))
    expect(loaded).toHaveBeenCalledTimes(1)
  })

  it('AC-601.19: 직접 누른 다시 읽기가 days로 끝나도 부른다', async () => {
    const loaded = vi.fn()
    drawWith(loaded)
    await answer(days())
    fireEvent.click(button('다시 읽기'))
    await answer(days(NEWER_DAYS))
    expect(loaded).toHaveBeenCalledTimes(2)
  })

  it.each<[string, ReadResult]>([
    ['실패', failed('E-BIT-READ-FAILED')],
    ['품질 incomplete', failed('E-BIT-DATA-UNSURE')],
    ['다른 창 사용 중', failed('E-BIT-IN-USE')],
    ['not-ready', NOT_READY],
  ])('AC-601.19: 비트 읽기가 %s로 끝나면 부르지 않는다', async (_name, result) => {
    const loaded = vi.fn()
    drawWith(loaded, SAVED)
    await answer(result)
    expect(loaded).not.toHaveBeenCalled()
  })

  it('AC-601.19·AC-601.15: 취소된 읽기와 떠난 뒤에 온 답으로는 부르지 않는다', async () => {
    const loaded = vi.fn()
    const { unmount } = render(
      <StrictMode>
        <BitDashboard today={TODAY} initial={NONE} onBitLoaded={loaded} />
      </StrictMode>,
    )
    await answer(days(), 0) // 개발 모드가 취소한 첫 읽기
    expect(loaded).not.toHaveBeenCalled()
    unmount()
    await answer(days(), 1)
    expect(loaded).not.toHaveBeenCalled()
  })

  it('AC-601.19: 다시 그릴 때 바뀐 onBitLoaded가 있으면 마지막 것을 부른다(읽기를 다시 시작하지 않는다)', async () => {
    const first = vi.fn()
    const last = vi.fn()
    const { rerender } = drawWith(first)
    rerender(<BitDashboard today={TODAY} initial={NONE} onBitLoaded={last} />)
    expect(readBitDays).toHaveBeenCalledTimes(1)
    await answer(days())
    expect(first).not.toHaveBeenCalled()
    expect(last).toHaveBeenCalledTimes(1)
  })
})

describe('AC-606.7·AC-606.1·AC-606.5: 통계 탭 묶음(groups)', () => {
  it('AC-606.7: 비트 읽기(readBitDays)에 받은 묶음 정의(defs)를 그대로 싣는다 — [다시 읽기]에도 같은 정의다', async () => {
    onBitPc()
    drawWith(NONE, GROUPS)
    expect(readBitDays).toHaveBeenCalledTimes(1)
    expect(reads[0]!.deps.groups).toEqual(GROUPS.defs)
    await answer(days(BIT_KEYED))
    fireEvent.click(button('다시 읽기'))
    expect(readBitDays).toHaveBeenCalledTimes(2)
    expect(reads[1]!.deps.groups).toEqual(GROUPS.defs)
  })

  it.each<[string, DashboardGroups | null | undefined]>([
    ['groups를 주지 않음', undefined],
    ['묶음을 읽지 못함(null)', null],
    ['묶음 없음', { lines: [], defs: [] }],
  ])('AC-606.7: %s이면 비트 읽기에 빈 목록(groups: [])을 싣는다', (_name, groups) => {
    onBitPc()
    drawWith(NONE, groups)
    expect(readBitDays).toHaveBeenCalledTimes(1)
    expect(reads[0]!.deps.groups).toEqual([])
  })

  it('AC-606.7: 묶음은 읽기 효과의 의존이 아니다 — 같은 묶음을 새 객체로 다시 넘겨 다시 그려도 비트를 다시 읽지 않는다', () => {
    onBitPc()
    const { rerender } = drawWith(NONE, GROUPS)
    rerender(<BitDashboard today={TODAY} initial={NONE} groups={{ lines: [...GROUPS.lines], defs: [...GROUPS.defs] }} />)
    expect(readBitDays).toHaveBeenCalledTimes(1)
    expect(reads[0]!.deps.signal?.aborted).toBe(false)
  })

  it('AC-606.1: 비트 PC가 아니면 저장 숫자로 처방 상위를 묶음 이름·기간 안 열쇠 줄 건수로 그린다', () => {
    notBitPc()
    drawWith(SAVED_KEYED, GROUPS)
    expect(rankRows()).toEqual(SAVED_RANK)
  })

  it.each<[string, SummarySource]>([
    ['저장 숫자 없이 시작', NONE],
    ['저장 숫자로 시작', SAVED_KEYED],
  ])('AC-606.1: %s해도 비트 숫자가 오면 처방 상위는 같은 묶음으로 비트 숫자의 열쇠 줄 건수다', async (_name, initial) => {
    onBitPc()
    drawWith(initial, GROUPS)
    if (initial.kind === 'data') expect(rankRows()).toEqual(SAVED_RANK)
    await answer(days(BIT_KEYED))
    expectNumbersShown(64, 9, 55)
    expect(rankRows()).toEqual(BIT_RANK)
  })

  it('AC-606.5: 묶음을 읽지 못함(null)이면 처방 상위 칸에 "통계 탭 묶음을 읽지 못했어요…" — 저장 숫자·비트 숫자 모두. 보고 문장·다른 그래프는 그대로다', async () => {
    onBitPc()
    drawWith(SAVED_KEYED, null)
    expect(within(rankChart()).getByText(GROUPS_UNREAD)).toBeTruthy()
    expect(rankChart().querySelector('ol[aria-label]')).toBeNull()
    expect(bigLine().textContent).toBe('오늘 지금까지 환자 5명이 왔습니다.')
    await answer(days(BIT_KEYED))
    expectNumbersShown(64, 9, 55)
    expect(within(rankChart()).getByText(GROUPS_UNREAD)).toBeTruthy()
    expect(rankChart().querySelector('ol[aria-label]')).toBeNull()
    for (const name of ['환자 수 추이', '신환 재방문율', '요일별 환자 수']) expect(screen.getByRole('group', { name })).toBeTruthy()
  })

  it('AC-606.7·AC-606.4: groups를 주지 않으면 묶음 없음과 같다 — 처방 상위 칸은 "묶음을 만들면 여기에 보여요"', async () => {
    onBitPc()
    draw(SAVED_KEYED)
    expect(within(rankChart()).getByText(GROUPS_NONE)).toBeTruthy()
    await answer(days(BIT_KEYED))
    expect(within(rankChart()).getByText(GROUPS_NONE)).toBeTruthy()
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
  ])('AC-601.2·AC-601.4·AC-601.17·AC-2701.3·AC-2705.1: %s — h1은 하나(숫자가 없으면 큰 문장, 숫자가 있으면 머리 줄 "대시보드"뿐 — 보고 문장은 h1이 아니다), 상자 안 상자가 없고, 정해 둔 표시 밖의 움직임 클래스가 없다', async (_, result, marks) => {
    const { container } = draw()
    if (result) await answer(result)
    const headings = screen.getAllByRole('heading', { level: 1 }).map((heading) => heading.textContent)
    expect(headings).toHaveLength(1)
    if (result?.kind === 'days') expect(headings).toEqual([HEADER_H1])
    else expect(headings).not.toContain(HEADER_H1)
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
// ── 날짜 고르기 (REQ-605, design.md '### 날짜 고르기', 시안 gen.py date_ctl·applyDay) ──
const WEEK_DAYS = [day(TODAY, 9, 55, true), day('2026-10-26', 7, 60), day('2026-10-19', 5, 50), day('2026-10-25', 1, 2)]
const PAST_H1 = '10월 26일 환자 67명이 왔습니다.'
const PAST_REST = '신환 7명, 재진 60명입니다. 지난주 월요일보다 12명 많습니다.'
const PAST_FULL = `${PAST_H1} ${PAST_REST}`
const TODAY_TEXT = '11월 2일 월요일'
const dateGroup = () => screen.getByRole('group', { name: '날짜 고르기' })
const noDateGroup = () => expect(screen.queryByRole('group', { name: '날짜 고르기' })).toBeNull()
const dateInput = () => within(dateGroup()).getByLabelText('날짜 고르기') as HTMLInputElement
const pickDay = (value: string) => fireEvent.change(dateInput(), { target: { value } })
const setClipboard = (value: { writeText: (text: string) => Promise<void> } | undefined) => Object.defineProperty(navigator, 'clipboard', { value, configurable: true })
const readDays = async (list: readonly DayPayload[] = WEEK_DAYS) => {
  onBitPc()
  const view = draw()
  await answer(days(list))
  return view
}

describe('AC-605.1·AC-605.7: 날짜 줄', () => {
  const expectDateControl = () => {
    expect(within(dateGroup()).getByRole('button', { name: '이전 날' })).toBeTruthy()
    expect(within(dateGroup()).getByRole('button', { name: '다음 날' })).toBeTruthy()
    expect(dateInput().value).toBe(TODAY)
    expect(within(dateGroup()).getByText(TODAY_TEXT)).toBeTruthy()
    noButton('오늘로')
  }

  it('AC-605.1: 숫자를 읽으면 날짜 줄이 날짜 고르기이고 처음 고른 날은 오늘이다. 큰 문장보다 앞에 있다', async () => {
    await readDays()
    expectDateControl()
    expectOrder(dateGroup(), bigLine())
    expect(screen.getAllByText(TODAY_TEXT)).toHaveLength(1)
  })

  it('AC-605.1: 다시 읽는 중에도 날짜 고르기가 있다', async () => {
    onBitPc()
    draw(SAVED)
    expect(button('다시 읽는 중')).toBeTruthy()
    expectDateControl()
  })

  it('AC-605.1: 다시 읽기 실패에도 날짜 고르기가 있다', async () => {
    onBitPc()
    draw(SAVED)
    await answer(failed('E-BIT-READ-FAILED'))
    expect(screen.getByRole('alert')).toBeTruthy()
    expectDateControl()
  })

  it('AC-605.1: 비트 PC가 아니라 저장 숫자만 그려도 날짜 고르기가 있다', () => {
    notBitPc()
    draw(SAVED)
    expectDateControl()
  })

  it('AC-605.1: 읽었는데 일 숫자가 빈 배열이어도 읽은 화면이라 날짜 고르기가 있고, 지난 날짜는 AC-605.4 문구다', async () => {
    await readDays([])
    expectDateControl()
    pickDay('2026-10-26')
    expect(bigLine().textContent).toBe('이 날은 진료 자료가 없어요')
    expect(kpiCellsOf('10월 26일 하루 분석').map((cell) => cell.textContent)).toEqual(['환자 수–자료 없음', '신환–자료 없음', '재진–자료 없음', '지난주 같은 요일보다–자료 없음'])
  })

  it.each<[string, () => Promise<unknown> | void, string]>([
    ['연결 전', () => { notBitPc(); draw() }, CONNECT_H1],
    ['저장 숫자 없이 처음 읽는 중', () => { onBitPc(); draw() }, READ_H1],
    [
      '처음 읽기 실패',
      async () => {
        onBitPc()
        draw()
        await answer(failed('E-BIT-READ-FAILED'))
      },
      errorInfo('E-BIT-READ-FAILED').what,
    ],
    [
      '다른 창 사용 중',
      async () => {
        onBitPc()
        draw()
        await answer(failed('E-BIT-IN-USE'))
      },
      errorInfo('E-BIT-IN-USE').what,
    ],
  ])('AC-605.7: %s — 날짜 줄은 오늘 글자뿐이고 날짜 고르기가 없다', async (_, arrange, heading) => {
    await arrange()
    expect(bigLine().textContent).toBe(heading)
    noDateGroup()
    noButton('이전 날')
    noButton('다음 날')
    noButton('오늘로')
    expect(document.querySelector('input[type="date"]')).toBeNull()
    expect(screen.getByText(TODAY_TEXT)).toBeTruthy()
  })
})

const kpiCellsOf = (title: string) => Array.from(kpiRow(region(title)).children)

describe('AC-605.2·AC-605.3·AC-605.4: 고른 날로 그린다', () => {
  afterEach(() => setClipboard(undefined))

  it('AC-605.2·AC-605.3: 지난 날짜를 고르면 보고 문장과 하루 줄이 그날로 바뀌고, 날짜 줄·[오늘로]도 따라온다', async () => {
    await readDays()
    pickDay('2026-10-26')

    expect(bigLine().textContent).toBe(PAST_H1)
    expect(screen.getByText(PAST_REST)).toBeTruthy()
    expect(within(dateGroup()).getByText('10월 26일 월요일')).toBeTruthy()
    expect(dateInput().value).toBe('2026-10-26')
    expect(button('오늘로')).toBeTruthy()

    const cells = kpiCellsOf('10월 26일 하루 분석')
    expect(cells.slice(0, 3).map((cell) => cell.textContent)).toEqual(['환자 수67명', '신환7명', '재진60명'])
    expect(cells[3]!.textContent).toContain('12명 (+21.8%)')
    expect(cells[3]!.textContent).toContain('지난주 월요일')
  })

  it('AC-605.3: 7일 전 자료가 없는 날은 넷째 칸이 "지난주 자료가 없어요"이고 문장에 비교가 없다', async () => {
    await readDays()
    pickDay('2026-10-25')
    expect(bigLine().textContent).toBe('10월 25일 환자 3명이 왔습니다.')
    expect(screen.getByText('신환 1명, 재진 2명입니다.')).toBeTruthy()
    expect(within(kpiCellsOf('10월 25일 하루 분석')[3] as HTMLElement).getByText('지난주 자료가 없어요')).toBeTruthy()
  })

  it('AC-605.2: [복사]는 고른 날의 문장을 복사한다', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    setClipboard({ writeText })
    await readDays()
    pickDay('2026-10-26')
    await act(async () => {
      fireEvent.click(button('복사'))
    })
    expect(writeText.mock.calls).toEqual([[PAST_FULL]])
  })

  it('AC-605.2: 복사한 뒤 날짜를 바꾸면 "복사했어요"가 다른 날 문장에 남지 않는다', async () => {
    setClipboard({ writeText: vi.fn(() => Promise.resolve()) })
    await readDays()
    pickDay('2026-10-26')
    await act(async () => {
      fireEvent.click(button('복사'))
    })
    expect(button('복사했어요')).toBeTruthy()
    pickDay('2026-10-25')
    expect(button('복사')).toBeTruthy()
    noButton('복사했어요')
  })

  it('AC-605.4: 자료가 없는 지난 날짜(휴진일 등)면 문구와 "자료 없음"이 나오고 [복사]가 막힌다', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    setClipboard({ writeText })
    await readDays()
    pickDay('2026-10-18')

    expect(bigLine().textContent).toBe('이 날은 진료 자료가 없어요')
    expect(screen.getByText('진료가 없었거나 비트에 접수 기록이 없는 날이에요.')).toBeTruthy()
    expect(kpiCellsOf('10월 18일 하루 분석').map((cell) => cell.textContent)).toEqual(['환자 수–자료 없음', '신환–자료 없음', '재진–자료 없음', '지난주 같은 요일보다–자료 없음'])
    const copy = button('복사')
    expect(copy.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(copy)
    expect(writeText).not.toHaveBeenCalled()
  })

  it('AC-605.1: [오늘로]를 누르면 오늘로 돌아오고 [오늘로]가 사라진다', async () => {
    await readDays()
    pickDay('2026-10-26')
    fireEvent.click(button('오늘로'))
    expectNumbersShown(64, 9, 55)
    expect(dateInput().value).toBe(TODAY)
    noButton('오늘로')
  })

  it('AC-605.5: [이전 날]·[다음 날]로 옮기고, 오늘에서는 [다음 날]이 막힌다', async () => {
    await readDays()
    expect((button('다음 날') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(button('이전 날'))
    expect(dateInput().value).toBe('2026-11-01')
    expect((button('다음 날') as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(button('다음 날'))
    expect(dateInput().value).toBe(TODAY)
  })

  it('AC-605.5: 범위 밖 날짜를 넣으면 고른 날이 바뀌지 않는다', async () => {
    await readDays()
    pickDay('2026-10-26')
    pickDay('2026-07-24')
    expect(dateInput().value).toBe('2026-10-26')
    expect(bigLine().textContent).toBe(PAST_H1)
    pickDay('2026-11-03')
    expect(dateInput().value).toBe('2026-10-26')
    expect(bigLine().textContent).toBe(PAST_H1)
  })
})

describe('AC-605.6: 날짜를 바꿔도 다시 읽지 않는다', () => {
  it('AC-605.6: 날짜를 바꿔도 stats.rows를 다시 부르지 않고 읽은 시각도 그대로다', async () => {
    await readDays()
    expect(reads).toHaveLength(1)
    pickDay('2026-10-26')
    fireEvent.click(button('이전 날'))
    fireEvent.click(button('오늘로'))
    expect(reads).toHaveLength(1)
    expect(readBitDays).toHaveBeenCalledTimes(1)
    expect(screen.getByText(READ_AT_342)).toBeTruthy()
  })

  it('AC-605.6: 기간별 흐름은 글자·고른 기간 모두 그대로다', async () => {
    await readDays()
    fireEvent.click(within(flow()).getByRole('button', { name: '최근 7일' }))
    const before = flow().textContent
    pickDay('2026-10-18')
    expect(flow().textContent).toBe(before)
    expect(within(flow()).getByRole('button', { name: '최근 7일' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('AC-605.6: [다시 읽기] 동안과 그 뒤에도 고른 날이 유지되고, 새 숫자로 그린다', async () => {
    await readDays()
    pickDay('2026-10-26')
    fireEvent.click(button('다시 읽기'))
    expect(reads).toHaveLength(2)
    expect(button('다시 읽는 중')).toBeTruthy()
    expect(dateInput().value).toBe('2026-10-26')
    expect(bigLine().textContent).toBe(PAST_H1)

    await answer(days([day(TODAY, 10, 60, true), day('2026-10-26', 8, 60), day('2026-10-19', 5, 50)]))
    expect(dateInput().value).toBe('2026-10-26')
    expect(bigLine().textContent).toBe('10월 26일 환자 68명이 왔습니다.')
    expect(screen.getByText(READ_AT_342)).toBeTruthy()
  })

  it('AC-605.6: 다시 읽기가 실패해도 고른 날이 유지된다', async () => {
    await readDays()
    pickDay('2026-10-26')
    fireEvent.click(button('다시 읽기'))
    await answer(failed('E-BIT-READ-FAILED'))
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(dateInput().value).toBe('2026-10-26')
    expect(bigLine().textContent).toBe(PAST_H1)
  })

  it('AC-605.6: 대시보드를 새로 열면 오늘이다(주소·저장소에 두지 않는다)', async () => {
    const first = await readDays()
    pickDay('2026-10-26')
    const search = window.location.search
    first.unmount()
    expect(window.location.search).toBe(search)
    expect(window.localStorage.length + window.sessionStorage.length).toBe(0)

    draw()
    await answer(days(WEEK_DAYS))
    expect(dateInput().value).toBe(TODAY)
    noButton('오늘로')
    expectNumbersShown(64, 9, 55)
  })

  it('AC-605.1: 고르지 않았으면 화면을 연 채 날짜가 바뀌어도 오늘을 따라가고, 고른 날은 그대로 둔다', async () => {
    const view = await readDays()
    view.rerender(<BitDashboard today="2026-11-03" initial={NONE} />)
    expect(dateInput().value).toBe('2026-11-03')
    noButton('오늘로')

    pickDay('2026-10-26')
    view.rerender(<BitDashboard today="2026-11-04" initial={NONE} />)
    expect(dateInput().value).toBe('2026-10-26')
    expect(button('오늘로')).toBeTruthy()
  })
})

describe('AC-605.5: 화면을 연 채 날이 지나 고른 날이 범위 밖이 되면', () => {
  const nextDayButton = () => button('다음 날') as HTMLButtonElement
  const openOn = (today: string) => <BitDashboard today={today} initial={NONE} />

  it('AC-605.5: 오늘로 돌아간다 — 날짜 칸·[오늘로]·[다음 날]·보고 문장·하루 줄이 모두 새 오늘이다', async () => {
    const view = await readDays()
    pickDay('2026-07-25') // 100일 전
    expect(button('오늘로')).toBeTruthy()

    view.rerender(openOn('2026-11-05')) // 사흘 지나 범위가 2026-07-28부터다

    expect(dateInput().value).toBe('2026-11-05')
    expect(within(dateGroup()).getByText('11월 5일 목요일')).toBeTruthy()
    noButton('오늘로')
    expect(nextDayButton().disabled).toBe(true)
    expect(bigLine().textContent).toBe('오늘 받은 진료 자료가 아직 없어요')
    expect(todaySection()).toBeTruthy()
  })

  it('AC-605.5: 범위 끝에 걸린 날은 그대로 두고, 하루 더 지나 밖으로 나가면 오늘로 돌아간다', async () => {
    const view = await readDays()
    pickDay('2026-07-28')

    view.rerender(openOn('2026-11-05')) // 2026-07-28은 이제 딱 100일 전이다
    expect(dateInput().value).toBe('2026-07-28')
    expect((button('이전 날') as HTMLButtonElement).disabled).toBe(true)
    expect(nextDayButton().disabled).toBe(false)

    view.rerender(openOn('2026-11-06'))
    expect(dateInput().value).toBe('2026-11-06')
    noButton('오늘로')
  })

  it('AC-605.5: 돌아간 뒤에도 단추가 움직인다 — [이전 날]은 새 오늘의 하루 앞이다', async () => {
    const view = await readDays()
    pickDay('2026-07-25')
    view.rerender(openOn('2026-11-05'))

    fireEvent.click(button('이전 날'))
    expect(dateInput().value).toBe('2026-11-04')
    fireEvent.click(button('오늘로'))
    expect(dateInput().value).toBe('2026-11-05')
  })

  it.each<[string, () => void]>([
    ['[오늘로]를 누름', () => fireEvent.click(button('오늘로'))],
    ['날짜 칸에 오늘을 넣음', () => pickDay(TODAY)],
    ['[다음 날]로 오늘에 옴', () => fireEvent.click(button('다음 날'))],
  ])('AC-605.1: 오늘을 다시 고른 뒤 날짜가 바뀌면 오늘을 따라간다 — %s', async (_, chooseToday) => {
    const view = await readDays()
    pickDay('2026-11-01')
    chooseToday()
    expect(dateInput().value).toBe(TODAY)

    view.rerender(openOn('2026-11-03'))

    expect(dateInput().value).toBe('2026-11-03')
    noButton('오늘로')
  })
})

describe('AC-605.8: 월말 덧말', () => {
  const MONTH_END = '2026-10-31'
  const MONTH_END_DAYS = [day(MONTH_END, 2, 3, true), day('2026-10-30', 1, 1)]
  const openMonthEnd = (initial: SummarySource = NONE) => render(<BitDashboard today={MONTH_END} initial={initial} />)
  const note = () => within(dateGroup()).queryByText('이번 달 마지막 날')

  it('AC-605.8: 오늘이 그 달 마지막 날이면 읽은 뒤 날짜 고르기 옆에 붙고, 다른 날을 고르면 사라졌다가 오늘로 오면 다시 붙는다', async () => {
    onBitPc()
    openMonthEnd()
    await answer(days(MONTH_END_DAYS))
    expect(note()!.textContent).toBe('· 이번 달 마지막 날')
    expect(screen.getAllByText('이번 달 마지막 날')).toHaveLength(1)

    fireEvent.click(button('이전 날'))
    expect(note()).toBeNull()
    expect(screen.queryByText('이번 달 마지막 날')).toBeNull()

    fireEvent.click(button('오늘로'))
    expect(note()).not.toBeNull()
  })

  it('AC-605.8: 다시 읽는 중·다시 읽기 실패에도 붙는다', async () => {
    onBitPc()
    openMonthEnd({ kind: 'data', days: MONTH_END_DAYS })
    expect(button('다시 읽는 중')).toBeTruthy()
    expect(note()).not.toBeNull()
    await answer(failed('E-BIT-READ-FAILED'))
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(note()).not.toBeNull()
  })

  it('AC-605.8: 월말이 아니면 없다', async () => {
    await readDays()
    expect(note()).toBeNull()
  })

  it('AC-605.7: 처음 읽는 중에는 날짜 고르기 없이 날짜 글자 줄의 덧말 그대로다', () => {
    onBitPc()
    openMonthEnd()
    noDateGroup()
    expect(screen.getByText('이번 달 마지막 날', { exact: false }).closest('p')!.textContent).toBe('10월 31일 토요일 · 이번 달 마지막 날')
  })
})

describe('끝까지 잇기 (진짜 readBitDays)', () => {
  type Command = 'hello' | 'bit.check' | 'stats.rows'
  type Answer = 'silent' | ((id: string) => unknown[])
  const result = (data: unknown): Answer => (id) => [{ v: 1, id, type: 'result', data }]
  const error = (code: string): Answer => (id) => [{ v: 1, id, type: 'error', code }]
  const HELLO_OK = { helperVersion: '0.3.0', protocol: 1, extensionVersion: '0.1.0', extensionProtocol: 1 }
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
    await screen.findByText('오늘 지금까지 환자 64명이 왔습니다.')

    expect(t.commands()).toEqual(['hello', 'bit.check', 'stats.rows'])
    expect(t.port.sent[2]!.args).toEqual({ from: '2026-07-25', to: TODAY })
    expect(t.loads[0]).toMatchObject({ from: '2026-07-25', to: TODAY, today: TODAY, closeToday: false })
    expectNumbersShown(64, 9, 55)
    expect(document.body.textContent).not.toContain(String(REPORT_MARK))
    expect(document.body.textContent).not.toContain('987,654,321')
    expectOnlyAiRead()
    expect(t.port.disconnected).toBe(true)
    expect(t.worker.terminate).toHaveBeenCalledTimes(1)
  })

  it('AC-606.7: 불러오기 요청(requestLoad)에 받은 묶음 정의를 싣는다 — 다 읽은 비트 숫자로 처방 상위가 묶음 줄이다', async () => {
    const t = await wire({}, { ...VIEW, days: BIT_KEYED } as unknown as StatsLoaded)
    drawWith(NONE, GROUPS)
    await screen.findByText('오늘 지금까지 환자 64명이 왔습니다.')
    expect(t.loads).toHaveLength(1)
    expect(t.loads[0]!.groups).toEqual(GROUPS.defs)
    expect(rankRows()).toEqual(BIT_RANK)
  })

  it('AC-606.7: 묶음이 없으면 불러오기 요청에 빈 목록을 싣는다', async () => {
    const t = await wire()
    draw()
    await screen.findByText('오늘 지금까지 환자 64명이 왔습니다.')
    expect(t.loads[0]!.groups).toEqual([])
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

  it('AC-1804.4: 기간을 골라도(옛 기간 포함) stats.rows를 다시 부르지 않는다 — 옛 기간은 older(저장 숫자)로만 받아 오고 서버 요청이 없다', async () => {
    const t = await wire()
    const read = vi.fn(async (range: { from: string; to: string }) => {
      void range
      return [] as readonly DayPayload[]
    })
    render(<BitDashboard today={TODAY} initial={NONE} older={{ from: '2026-07-25', read }} />)
    await screen.findByText('오늘 지금까지 환자 64명이 왔습니다.')
    const picker = () => within(flow()).getByRole('group', { name: '기간 골라 보기' })
    const unit = (name: string) => within(within(picker()).getAllByRole('group', { name: '보는 단위' })[0]!).getByRole('button', { name })
    fireEvent.click(unit('주별'))
    fireEvent.click(unit('일별'))
    for (let i = 0; i < 3; i++) fireEvent.click(within(picker()).getByRole('button', { name: '이전 달' }))
    fireEvent.click(within(flow()).getByRole('button', { name: '최근 90일' }))
    await act(async () => {})
    expect(t.commands()).toEqual(['hello', 'bit.check', 'stats.rows'])
    expect(t.loads).toHaveLength(1)
    expect(read).toHaveBeenCalledTimes(1)
    expect(read).toHaveBeenCalledWith({ from: '2026-07-01', to: '2026-07-31' })
    expectOnlyAiRead()
  })
})

// 대시보드 기간 고르기의 옛 기간 읽기 잇기 (dashboard-period REQ-1804·REQ-1805, design.md '데이터 흐름 (읽기)').
// BitDashboard는 받은 older를 자기가 만드는 source({ kind: 'data', days, groups, older })에 넣는다(DashboardAnalysis에 새 prop이 없다).
// 오늘 11월 2일, 손에 든 숫자의 첫날(오늘 − 100)은 7월 25일. 저장 숫자·비트 숫자 모두 오늘이 덜 끝나 끝난 날은 11월 1일이다
describe('dashboard-period: 옛 기간 읽기를 source에 실어 넘긴다', () => {
  function olderReader() {
    const answers: Array<(rows: readonly DayPayload[] | null) => void> = []
    const read = vi.fn((range: { from: string; to: string }) => {
      void range
      return new Promise<readonly DayPayload[] | null>((resolve) => answers.push(resolve))
    })
    const older: OlderDays = { from: '2026-07-25', read }
    return { older, read, answers }
  }
  const picker = () => within(flow()).getByRole('group', { name: '기간 골라 보기' })
  const unit = (name: string) => within(within(picker()).getAllByRole('group', { name: '보는 단위' })[0]!).getByRole('button', { name })
  const stepBack = () => fireEvent.click(within(picker()).getByRole('button', { name: '이전 달' }))
  // [일별] = 2026년 10월, ◀ 세 번 = 7월(7월 1일이 손에 든 숫자의 첫날 7월 25일보다 앞)
  const toJuly = () => {
    fireEvent.click(unit('일별'))
    for (let i = 0; i < 3; i++) stepBack()
  }
  const rankSub = () => rankChart().children[2] as HTMLElement

  it('AC-1804.2: 저장 숫자로 그린 화면 — 옛 기간(7월)을 고르면 받은 older로 그 기간을 한 번 읽고, 손에 든 기간(8월)은 읽지 않는다', async () => {
    notBitPc()
    const { older, read } = olderReader()
    render(<BitDashboard today={TODAY} initial={SAVED} older={older} />)
    fireEvent.click(unit('일별'))
    stepBack()
    stepBack()
    expect(read).not.toHaveBeenCalled()
    stepBack()
    expect(read).toHaveBeenCalledTimes(1)
    expect(read).toHaveBeenCalledWith({ from: '2026-07-01', to: '2026-07-31' })
    expect(within(rankChart()).getByText('읽는 중')).toBeTruthy()
  })

  it('AC-1804.2: 비트 숫자가 온 뒤에도 같은 older로 읽고, 읽은 줄에 비트 숫자를 얹는다(같은 날은 비트 숫자)', async () => {
    onBitPc()
    const { older, read, answers } = olderReader()
    render(<BitDashboard today={TODAY} initial={SAVED_KEYED} groups={GROUPS} older={older} />)
    const bitJuly = [keyed(day('2026-07-30', 1, 1), 1, 1), ...BIT_KEYED]
    await answer(days(bitJuly))
    toJuly()
    expect(read).toHaveBeenCalledTimes(1)
    await act(async () => {
      answers[0]!([keyed(day('2026-07-10', 1, 1), 3, 0), keyed(day('2026-07-30', 9, 9), 50, 50)])
    })
    expect(rankSub().textContent).toBe('7월 1일 – 31일 · 자료 있는 2일')
    expect(rankRows()).toEqual([
      ['운동치료', '4건'],
      ['체외충격파', '1건'],
    ])
  })

  it('AC-1804.4: 기간을 골라도 비트 읽기(readBitDays)는 열 때 한 번뿐이다', async () => {
    onBitPc()
    const { older } = olderReader()
    render(<BitDashboard today={TODAY} initial={SAVED} older={older} />)
    await answer(days())
    fireEvent.click(unit('월별'))
    fireEvent.click(unit('주별'))
    toJuly()
    fireEvent.click(within(flow()).getByRole('button', { name: '최근 7일' }))
    expect(readBitDays).toHaveBeenCalledTimes(1)
  })

  it('AC-1805.1: 기간을 골라도(옛 기간 읽기·실패 포함) 원장님 보고 문장·하루 날짜 고르기는 그대로다', async () => {
    onBitPc()
    const { older, answers } = olderReader()
    render(<BitDashboard today={TODAY} initial={SAVED} older={older} />)
    await answer(days())
    const report = bigLine().textContent
    const dateLine = screen.getByRole('group', { name: '날짜 고르기' }).outerHTML
    toJuly()
    await act(async () => {
      answers[0]!(null)
    })
    expect(within(flow()).getByRole('alert')).toBeTruthy()
    expect(bigLine().textContent).toBe(report)
    expect(screen.getByRole('group', { name: '날짜 고르기' }).outerHTML).toBe(dateLine)
  })

  it('AC-1804.1: older를 주지 않으면 옛 기간도 읽지 않고 손에 든 숫자만 쓴다(자료 없음)', () => {
    notBitPc()
    render(<BitDashboard today={TODAY} initial={SAVED} />)
    toJuly()
    expect(within(rankChart()).getByText('자료 없음')).toBeTruthy()
    expect(rankSub().textContent).toBe('7월 1일 – 31일')
  })
})

describe('dashboard-ux 화면 통합 (TASK-5)', () => {
  const ORDER = ['대시보드', '오늘 하루 분석', '우리 병원 AI 경영 리포트', '기간별 흐름', '지금 바로 쓸 수 있어요']

  it('AC-2707.2: 숫자가 있으면 차례가 머리 줄(h1 대시보드) → 오늘 하루 분석(기준일·숫자 칸·보고 문장) → AI 경영 리포트 → 기간별 흐름 → 바로 가기(지금 바로 쓸 수 있어요)이고 h1은 하나다', () => {
    notBitPc()
    draw(SAVED)
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual([HEADER_H1])
    const shown = screen.getAllByRole('heading').map((h) => h.textContent ?? '')
    expect(shown.filter((text) => ORDER.some((name) => text.startsWith(name)))).toEqual(ORDER.map((name) => expect.stringMatching(new RegExp(`^${name}`))))
    const daily = screen.getByRole('region', { name: '오늘 하루 분석' })
    expect(within(daily).getByRole('group', { name: '일별 현황 기준일' })).toBeTruthy()
    expect(within(daily).getByText('오늘 환자 수')).toBeTruthy()
    expect(within(daily).getByText(REPORT_NAME)).toBeTruthy()
  })

  it('AC-2703.1: 기준일 묶음 "일별 현황 기준일" 안에 날짜 고르기와 적용 글 "숫자 4개와 보고 문장에 적용"이 있다', () => {
    notBitPc()
    draw(SAVED)
    const group = screen.getByRole('group', { name: '일별 현황 기준일' })
    expect(within(group).getByRole('group', { name: '날짜 고르기' })).toBeTruthy()
    expect(within(group).getByText('숫자 4개와 보고 문장에 적용')).toBeTruthy()
  })

  it('AC-2707.1: 연결 전에는 지금 화면 그대로 — 머리 줄·AI 요약이 없고 AI 리포트를 읽지 않는다', () => {
    notBitPc()
    draw(NONE)
    expectBeforeConnect()
    expect(screen.queryByRole('heading', { name: HEADER_H1 })).toBeNull()
    expect(screen.queryByText('우리 병원 AI 경영 리포트')).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('AC-2707.3: AI 요약 구역은 토큰만으로 강조한다 — canvas 바탕·float 모서리, 그라데이션·그림자·임의 색 없음', () => {
    notBitPc()
    draw(SAVED)
    const box = screen.getByRole('region', { name: /^우리 병원 AI 경영 리포트/ })
    expect(box.className).toMatch(/\bbg-canvas\b/)
    expect(box.className).toMatch(/\brounded-float\b/)
    expect(box.outerHTML).not.toMatch(/gradient|shadow|bg-\[|from-|via-/)
  })
})
