// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DailySection } from '@/components/dashboard/summary/DailySection'
import { FlowSection } from '@/components/dashboard/summary/FlowSection'
import type { SummarySource } from '@/components/dashboard/summary/source'
import { ViewingProvider } from '@/components/shell/viewing'
import { ds } from '@/components/ui/classes'
import type { DayPayload } from '@/types/payload'
import { BitDashboard } from './BitDashboard'
import type { SavedRefresh } from './ReadStatus'
import { ReadSpin, StatusHeader } from './ReadStatus'
import { readBitDays, type ReadResult } from './readBitDays'

// 대시보드 의사랑 모양 (uisarang-upload REQ-8811, design.md §10-2, 시안 docs/mockups/uisarang-upload ?s=dash-empty·dash-missing·dash-ok·dash-data).
// 올리기 칸은 TASK-7이 LiveDashboard에서 uisUpload로 넘긴다 — 여기서는 시험 안 가짜 칸(이름 '의사랑 엑셀 올리기', 받은 모양 data-look)으로 자리만 본다.
// readBitDays는 잡아 두고(부르면 쌓임) 병원 정보 훅은 시험이 읽기 상태·EMR을 바꾼다. 숫자·날짜는 모두 지어낸 값이다. 진짜 Supabase·Claude에 붙지 않는다
vi.mock('./readBitDays', async (importOriginal) => {
  const real = await importOriginal<typeof import('./readBitDays')>()
  return { ...real, readBitDays: vi.fn() }
})
vi.mock('@/workers/statsClient', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/workers/statsClient')>()
  return { ...real, createStatsWorker: vi.fn() }
})
vi.mock('@/lib/storage/notices', () => ({
  NOTICES_CHANGED: 'notices:changed',
  ruleAlerts: vi.fn(() => new Promise<never>(() => {})),
  unreadCount: vi.fn(() => new Promise<never>(() => {})),
  listNotices: vi.fn(() => new Promise<never>(() => {})),
  sourceStates: vi.fn(() => new Promise<never>(() => {})),
}))
vi.mock('@/lib/storage/inventory', () => ({ loadInventory: vi.fn(async () => ({ categories: [], items: [] })) }))
const clinic = vi.hoisted(() => ({
  state: 'ready' as 'loading' | 'ready' | 'failed',
  emr: 'uisarang' as 'bit' | 'uisarang' | 'egis' | 'other',
}))
vi.mock('@/components/clinic/useClinicProfile', () => ({
  useClinicProfile: () => ({
    state: clinic.state,
    profile: { displayName: null, phone: null, address: null, honorific: '원장님', hours: [], closedDates: [], staff: [], logoPath: null, emr: clinic.emr },
    saved: true,
    signupName: '',
    signupPhone: null,
    name: '',
    logoDataUrl: null,
    reload: () => undefined,
  }),
}))

const TODAY = '2026-11-02' // 월요일
const AT_NOW = new Date('2026-11-02T06:42:00Z') // 한국 오후 3시 42분
const NONE: SummarySource = { kind: 'none' }

// 의사랑 날 줄(toUisDayPayload 모양: revisit cohort 0 · 처방 줄 없음 · first90 없음)
const uisDay = (ymd: string, patients: number, newPatients: number): DayPayload => ({
  schemaVersion: 2,
  quality: 'valid',
  day: ymd,
  partial: false,
  totals: { patients, newPatients, returning: patients - newPatients, unknown: 0 },
  rx: [],
  groups: [],
  revisit: { cohort: 0, within7: null, within14: null },
})
// 마지막 저장된 날 10월 30일(금) · 그 전날 · 지난주 같은 요일. 오늘(11월 2일)은 아직 올리지 않았다
const UIS_DAYS = [uisDay('2026-10-30', 132, 9), uisDay('2026-10-29', 121, 7), uisDay('2026-10-23', 124, 8)]
const SAVED_UIS: SummarySource = { kind: 'data', days: UIS_DAYS }
const SAVED_AT = '2026-10-30T10:05:00Z' // 한국 10월 30일 19:05

// 화면 글자(requirements.md '화면 글자' 대시보드 · 셀 수 없음 안내 · '시안에 없어 이 명세가 정한 글' 그대로)
const START_H1 = '의사랑 엑셀을 올리면 숫자가 여기에 채워져요'
const START_LEAD = '의사랑 통계에서 엑셀을 저장해 아래에 넣어 주세요. 그날 숫자와 보고 문장, 기간별 흐름이 채워져요. 업무일지·예약·서식은 그대로 쓸 수 있어요.'
const CHANGE = '쓰는 EMR 바꾸기'
const VIEW_H1 = '아직 올린 의사랑 엑셀이 없어요'
const VIEW_TEXT = '원장님이 의사랑 엑셀을 올리면 여기에 숫자가 채워져요.'
const CHIP = '의사랑 엑셀 숫자'
const REFRESH = '저장된 숫자 새로고침'
const NA = '의사랑 엑셀로는 셀 수 없어요'
const WHY_REVISIT = '환자마다 다시 온 날을 알 수 없어요.'
const WHY_TOP_RX = '처방을 환자 수로 셀 수 없어요. 통계 탭 처방 카드에서 처방량을 봐요.'
const UIS_NO_PAST = ['이 날은 진료 자료가 없어요', '진료가 없었거나 그날 의사랑 엑셀을 아직 올리지 않은 날이에요.']
const WAIT_TITLE = '의사랑 연결은 준비하고 있어요'
const BOX = '의사랑 엑셀 올리기'
// 비트 글(의사랑 화면에는 없어야 한다)
const CONNECT_H1 = '비트 PC를 연결하면 오늘 숫자가 여기에 채워져요'
const READ_H1 = '비트에서 오늘 숫자를 읽고 있어요'

// ── 잡아 둔 비트 읽기 ──
type Read = { deps: Parameters<typeof readBitDays>[0]; resolve(result: ReadResult): void }
const reads: Read[] = []
const onBitPc = () => vi.stubGlobal('chrome', { runtime: { connect: vi.fn() } })
const notBitPc = () => vi.stubGlobal('chrome', undefined)

// 가짜 올리기 칸: 받은 모양(open·folded)을 data-look에 적는다
const slot = vi.fn((look: 'open' | 'folded'): ReactNode => (
  <section aria-label={BOX} data-look={look}>
    가짜 올리기 칸
  </section>
))
const box = () => screen.getByRole('region', { name: BOX })
const noBox = () => expect(screen.queryByRole('region', { name: BOX })).toBeNull()
const refresh = (over: Partial<SavedRefresh> = {}): SavedRefresh => ({ refreshing: false, failed: false, onRefresh: vi.fn(), ...over })
const VIEWING = { hospitalId: '00000000-0000-4000-8000-000000000001', name: '가나 정형외과의원' }

const draw = (initial: SummarySource = NONE, extra: { savedAt?: string | null; savedRefresh?: SavedRefresh } = {}) =>
  render(<BitDashboard today={TODAY} initial={initial} uisUpload={slot} savedAt={extra.savedAt ?? null} savedRefresh={extra.savedRefresh} />)
const region = (name: string) => screen.getByRole('region', { name })
const todaySection = () => screen.getByRole('region', { name: /하루 분석$/ })
const flow = () => region('기간별 흐름')
const chart = (name: string) => screen.getByRole('group', { name })
const link = (name: string) => screen.getByRole('link', { name })
const noText = (text: string | RegExp) => expect(screen.queryByText(text)).toBeNull()
const kpiCells = () => Array.from(todaySection().querySelector(':scope > div.grid')!.children)
const cell = (label: string) => kpiCells().find((c) => c.querySelector('span')?.textContent === label) as HTMLElement
const textOf = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
const tokens = (classes: string) => classes.split(/\s+/).filter(Boolean)
const hasAll = (el: Element, classes: string) => expect((el.getAttribute('class') ?? '').split(/\s+/)).toEqual(expect.arrayContaining(tokens(classes)))
const expectOrder = (...els: Element[]) => {
  for (let i = 1; i < els.length; i += 1) {
    expect(els[i - 1]!.compareDocumentPosition(els[i]!) & Node.DOCUMENT_POSITION_FOLLOWING, `${i - 1}번 → ${i}번`).toBeTruthy()
  }
}
const onlyLooks = (look: 'open' | 'folded') => {
  expect(slot).toHaveBeenCalled()
  for (const [called] of slot.mock.calls) expect(called).toBe(look)
}
// 셀 수 없음 안내 한 줄(통계 탭 EmptyNote와 같은 모양): 굵은 제목 + ' · ' + 까닭
const expectCannot = (root: HTMLElement, why: string) => {
  const title = within(root).getByText(NA)
  hasAll(title, 'font-semibold text-ink')
  const line = title.parentElement!
  expect(line.tagName).toBe('P')
  expect(textOf(line)).toBe(`${NA} · ${why}`)
  hasAll(line, 'text-body text-ink-2')
}

const AI_EMPTY = { report: null, stale: false, usage: { calls: 0, tokens: 0, costMicroUsd: 0 } }

beforeEach(() => {
  clinic.state = 'ready'
  clinic.emr = 'uisarang'
  reads.length = 0
  slot.mockClear()
  vi.mocked(readBitDays).mockReset()
  vi.mocked(readBitDays).mockImplementation(
    (deps) =>
      new Promise<ReadResult>((resolve) => {
        reads.push({ deps, resolve })
      }),
  )
  vi.stubGlobal('IntersectionObserver', undefined)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AT_NOW)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(AI_EMPTY), { status: 200, headers: { 'Content-Type': 'application/json' } })),
  )
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('AC-8811.1: 의사랑 · 저장 숫자 없음 — 시작 칸', () => {
  it("AC-8811.1: '준비하고 있어요' 대신 날짜 줄 → h1 → 안내 → 펼친 올리기 칸(open) → [쓰는 EMR 바꾸기](/settings) 차례다", () => {
    notBitPc()
    draw()
    const h1s = screen.getAllByRole('heading', { level: 1 })
    expect(h1s.map((h) => h.textContent)).toEqual([START_H1])
    const dateLine = screen.getByText('11월 2일 월요일')
    const lead = screen.getByText(START_LEAD)
    expect(lead.tagName).toBe('P')
    expect(box().getAttribute('data-look')).toBe('open')
    expect(link(CHANGE).getAttribute('href')).toBe('/settings')
    expectOrder(dateLine, h1s[0]!, lead, box(), link(CHANGE))
    onlyLooks('open')
    noText(WAIT_TITLE)
    noText(CONNECT_H1)
    expect(readBitDays).not.toHaveBeenCalled()
  })

  it("AC-8811.1·AC-8818.3: 그 아래 비트 연결 안내 줄('연결하면 바로 쓸 수 있어요')과 빈 분석 칸('비트 PC 연결 전')이 없고, 기능 목차(h2)는 남되 머리 옆 글·'연결 먼저'가 없다", () => {
    notBitPc()
    draw()
    expect(screen.queryByRole('heading', { level: 2, name: '연결하면 바로 쓸 수 있어요' })).toBeNull()
    expect(screen.queryByRole('region', { name: /하루 분석$/ })).toBeNull()
    expect(screen.queryByRole('region', { name: '기간별 흐름' })).toBeNull()
    noText('비트 PC 연결 전')
    noText('연결하면 생기는 것 4가지')
    expect(screen.queryByRole('link', { name: '비트 PC 연결 시작' })).toBeNull()
    expect(screen.queryByRole('link', { name: '비트 PC 연결부터' })).toBeNull()
    const index = screen.getByRole('heading', { level: 2, name: '기능 목차' })
    expect(within(index.closest('section')!).queryAllByText('연결 먼저')).toHaveLength(0)
    expect(Array.from(index.parentElement!.children)).toEqual([index])
    expect(textOf(index.closest('section'))).not.toMatch(/개 가운데|연결하면 쓸 수 있어요/)
    expect(within(index.closest('section')!).getByRole('link', { name: /^통계/ }).getAttribute('href')).toBe('/stats')
    expectOrder(link(CHANGE), index)
  })

  it('AC-8811.1: uisUpload를 주지 않으면 그 자리에 아무것도 없고 나머지는 같다', () => {
    notBitPc()
    render(<BitDashboard today={TODAY} initial={NONE} />)
    noBox()
    expect(screen.getByRole('heading', { level: 1, name: START_H1 })).toBeTruthy()
    expect(link(CHANGE).getAttribute('href')).toBe('/settings')
  })
})

describe('AC-8811.2: 의사랑 · 저장된 숫자 있음 — 머리 줄', () => {
  it('AC-8811.2: 비트 PC(chrome.runtime 있음)여도 비트를 읽지 않는다', async () => {
    onBitPc()
    draw(SAVED_UIS, { savedAt: SAVED_AT, savedRefresh: refresh() })
    await act(async () => {})
    expect(readBitDays).not.toHaveBeenCalled()
    expect(reads).toHaveLength(0)
    cleanup()
    // 숫자 없음(시작 칸)도 같다
    draw()
    await act(async () => {})
    expect(readBitDays).not.toHaveBeenCalled()
  })

  it('AC-8811.2: 머리 줄은 h1 "대시보드" · 칩 "의사랑 엑셀 숫자"(회색) · 시계 + 마지막으로 올린 때 글 · [저장된 숫자 새로고침]만이다', () => {
    onBitPc()
    const onRefresh = vi.fn()
    draw(SAVED_UIS, { savedAt: SAVED_AT, savedRefresh: refresh({ onRefresh }) })
    const h1s = screen.getAllByRole('heading', { level: 1 })
    expect(h1s.map((h) => h.textContent)).toEqual(['대시보드'])
    const head = h1s[0]!.parentElement!
    const chip = within(head).getByText(CHIP)
    hasAll(chip, ds.chip.neutral)
    const when = within(head).getByText('마지막으로 올린 때 10월 30일 19:05 · 10월 30일까지 있어요')
    expect(when.parentElement!.querySelector('svg')).not.toBeNull()
    expect(within(head).getAllByRole('button').map((b) => b.textContent)).toEqual([REFRESH])
    expect(within(head).queryAllByRole('link')).toEqual([])
    for (const bit of ['비트에서 다시 읽기', '비트 PC 연결 안내', '서버에 저장된 숫자', '비트에서 읽은 숫자', /서버에 마지막으로 저장된 시각/]) noText(bit)
    fireEvent.click(within(head).getByRole('button', { name: REFRESH }))
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('AC-8811.2: 머리 줄 아래 접은 올리기 칸(folded) → 일별 현황 → 기간별 흐름 차례다', () => {
    notBitPc()
    draw(SAVED_UIS, { savedAt: SAVED_AT, savedRefresh: refresh() })
    const h1 = screen.getByRole('heading', { level: 1, name: '대시보드' })
    expect(box().getAttribute('data-look')).toBe('folded')
    expectOrder(h1, box(), todaySection(), flow())
    onlyLooks('folded')
  })

  it('AC-8811.2: 저장된 숫자 새로고침에 실패하면 머리 줄 단추 대신 지금 오류 상자([다시 읽기])다', () => {
    notBitPc()
    draw(SAVED_UIS, { savedAt: SAVED_AT, savedRefresh: refresh({ failed: true }) })
    const head = screen.getByRole('heading', { level: 1, name: '대시보드' }).parentElement!
    expect(within(head).queryAllByRole('button')).toEqual([])
    expect(within(screen.getByRole('alert')).getByRole('button', { name: '다시 읽기' })).toBeTruthy()
  })

  it('AC-8811.2: 시각은 한국 시각 24시간 두 자리 {HH}:{mm}이고, 저장 시각을 모르면 시각 글이 없다(시각을 지어내지 않는다)', () => {
    const header = (savedAt: string | null, lastDay: string | null) =>
      renderToStaticMarkup(
        <StatusHeader variant="uisarang" lastDay={lastDay} readAt={null} savedAt={savedAt} reading={false} failed={false} onReread={() => {}} bitReadable savedRefresh={null} />,
      )
    expect(header('2026-11-01T00:05:00Z', '2026-11-01')).toContain('마지막으로 올린 때 11월 1일 09:05 · 11월 1일까지 있어요')
    expect(header('2026-11-01T14:30:00Z', '2026-10-31')).toContain('마지막으로 올린 때 11월 1일 23:30 · 10월 31일까지 있어요')
    for (const [at, last] of [[null, '2026-11-01'], ['읽을 수 없음', '2026-11-01'], ['2026-11-01T00:05:00Z', null]] as const) {
      const html = header(at, last)
      expect(html).not.toContain('마지막으로 올린 때')
      expect(html).toContain(CHIP)
      expect(html).not.toContain('비트')
    }
  })
})

describe('AC-8818.2·AC-8818.3: 의사랑 · 저장된 숫자 있음 — 비트 전용 글 숨기기', () => {
  it('AC-8818.2·AC-8818.3: 비트 PC여도 지금 바로 쓸 수 있어요 묶음([사전점검 열기]·[비트 PC 연결 다시 확인])이 없고, 기능 목차는 기간별 흐름 다음에 머리 옆 글·연결 먼저 없이 있다', async () => {
    onBitPc()
    draw(SAVED_UIS, { savedAt: SAVED_AT, savedRefresh: refresh() })
    await act(async () => {})
    expect(screen.queryByRole('heading', { level: 2, name: '지금 바로 쓸 수 있어요' })).toBeNull()
    expect(screen.queryByRole('link', { name: '사전점검 열기' })).toBeNull()
    expect(screen.queryByRole('link', { name: '비트 PC 연결 다시 확인' })).toBeNull()
    noText('청구 점검은 비트 PC의 크롬에서 열려요.')
    const index = screen.getByRole('heading', { level: 2, name: '기능 목차' })
    expect(Array.from(index.parentElement!.children)).toEqual([index])
    expect(within(index.closest('section')!).queryAllByText('연결 먼저')).toHaveLength(0)
    expectOrder(flow(), index)
  })
})

describe('AC-8811.3: 처음 날 = 오늘 이하 가장 늦은 저장된 날', () => {
  const dateInput = () => screen.getByLabelText('날짜 고르기', { selector: 'input' }) as HTMLInputElement

  it('AC-8811.3: 오늘 줄이 없으면 가장 늦은 저장된 날(10월 30일)로 열리고, [오늘로]·날짜 고르기는 지금 그대로다', () => {
    notBitPc()
    draw(SAVED_UIS)
    expect(dateInput().value).toBe('2026-10-30')
    expect(screen.getByRole('heading', { level: 2, name: '10월 30일 하루 분석' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '오늘로' }))
    expect(dateInput().value).toBe(TODAY)
    fireEvent.change(dateInput(), { target: { value: '2026-10-29' } })
    expect(dateInput().value).toBe('2026-10-29')
  })

  it('AC-8811.3: 오늘 줄이 있으면 오늘, 오늘 뒤 줄은 세지 않는다', () => {
    notBitPc()
    draw({ kind: 'data', days: [uisDay(TODAY, 40, 3), ...UIS_DAYS] })
    expect(dateInput().value).toBe(TODAY)
    cleanup()
    draw({ kind: 'data', days: [uisDay('2026-11-03', 40, 3), ...UIS_DAYS] })
    expect(dateInput().value).toBe('2026-10-30')
  })

  it('AC-8811.3: 비트 의원은 지금처럼 오늘로 열린다', () => {
    notBitPc()
    clinic.emr = 'bit'
    draw(SAVED_UIS)
    expect(dateInput().value).toBe(TODAY)
  })
})

describe('AC-8811.4: 일별 현황', () => {
  it('AC-8811.4: 90일초진·물리치료 칸은 "–" + "의사랑 엑셀로는 셀 수 없어요"이고 환자 수·신환·재진·지난주 같은 요일·보고 문장은 날 숫자 그대로다', () => {
    notBitPc()
    draw(SAVED_UIS)
    for (const label of ['90일초진', '물리치료']) {
      expect(within(cell(label)).getByText('–')).toBeTruthy()
      expect(within(cell(label)).getByText(NA)).toBeTruthy()
    }
    expect(cell('환자 수').firstElementChild!.textContent).toBe('환자 수132명')
    expect(cell('신환').firstElementChild!.textContent).toBe('신환9명')
    expect(cell('재진').firstElementChild!.textContent).toBe('재진123명')
    expect(textOf(kpiCells()[5]!)).toContain('8명')
    expect(screen.getByText('10월 30일 환자 132명이 왔습니다.')).toBeTruthy()
  })

  it('AC-8811.4: 그날 줄이 없으면 보고 문장 자리는 의사랑 글이고 90일초진·물리치료는 그대로 셀 수 없음이다', () => {
    notBitPc()
    draw(SAVED_UIS)
    fireEvent.change(screen.getByLabelText('날짜 고르기', { selector: 'input' }), { target: { value: '2026-10-28' } })
    const [first, rest] = UIS_NO_PAST
    expect(screen.getByText(first!)).toBeTruthy()
    expect(screen.getByText(rest!)).toBeTruthy()
    noText('진료가 없었거나 비트에 접수 기록이 없는 날이에요.')
    for (const label of ['90일초진', '물리치료']) expect(within(cell(label)).getByText(NA)).toBeTruthy()
    expect(within(cell('환자 수')).getByText('자료 없음')).toBeTruthy()
  })

  it('AC-8811.4: DailySection은 uis를 주지 않으면 지금 그대로다(그린 글이 같다)', () => {
    const plain = renderToStaticMarkup(<DailySection today="2026-10-30" source={SAVED_UIS} ptKey={null} />)
    expect(renderToStaticMarkup(<DailySection today="2026-10-30" source={SAVED_UIS} ptKey={null} uis={false} />)).toBe(plain)
    expect(plain).toContain('새 도우미(0.7.0)면 나와요')
    expect(plain).not.toContain(NA)
    const uis = renderToStaticMarkup(<DailySection today="2026-10-30" source={SAVED_UIS} ptKey={null} uis />)
    expect(uis).not.toContain('새 도우미(0.7.0)면 나와요')
    expect(uis).not.toContain('수납일지 설정에서 묶음을 고르면 나와요')
  })
})

describe('AC-8811.5: 기간별 흐름', () => {
  it("AC-8811.5: '신환 재방문율'·'처방 상위' 자리는 셀 수 없음 안내이고 환자 수 추이·요일별 환자 수는 그대로다", () => {
    notBitPc()
    draw(SAVED_UIS)
    expectCannot(chart('신환 재방문율'), WHY_REVISIT)
    expectCannot(chart('처방 상위'), WHY_TOP_RX)
    expect(within(chart('신환 재방문율')).queryByText('7일 안에 다시 옴')).toBeNull()
    expect(within(chart('처방 상위')).queryByRole('link')).toBeNull()
    expect(within(chart('처방 상위')).queryByRole('list')).toBeNull()
    expect(within(chart('환자 수 추이')).getByText(/^신환·재진, 하루씩/)).toBeTruthy()
    expect(within(chart('요일별 환자 수')).getByText(/^하루 평균, 요일마다/)).toBeTruthy()
    expectOrder(chart('환자 수 추이'), chart('신환 재방문율'), chart('요일별 환자 수'), chart('처방 상위'))
  })

  it('AC-8811.5: FlowSection은 uis를 주지 않으면 지금 그대로다', () => {
    const plain = renderToStaticMarkup(<FlowSection today={TODAY} source={SAVED_UIS} />)
    expect(renderToStaticMarkup(<FlowSection today={TODAY} source={SAVED_UIS} uis={false} />)).toBe(plain)
    expect(plain).not.toContain(NA)
  })

  it('AC-8811.5: 안내 글은 그 파일 안 상수이고 통계 탭 parts(EmptyNote)·올리기 칸·의사랑 셈을 부르지 않는다', () => {
    const dir = join(process.cwd(), 'src/components/dashboard/summary')
    // 주석을 뺀 소스(울타리 시험 imports.test·DashboardAnalysis.test와 같은 방식)
    const code = (file: string) =>
      readFileSync(join(dir, file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1')
    const flowCode = code('FlowSection.tsx')
    const dailyCode = code('DailySection.tsx')
    const reportCode = code('ReportBlock.tsx')
    for (const text of [NA, WHY_REVISIT, WHY_TOP_RX]) expect(flowCode).toContain(text)
    expect(dailyCode).toContain(NA)
    for (const text of UIS_NO_PAST) expect(reportCode).toContain(text)
    for (const text of [flowCode, dailyCode, reportCode]) {
      expect(text).not.toMatch(/stats\/sections\/parts|components\/uisarang|lib\/analytics\/uisarang|EmptyNote/)
    }
  })
})

describe('AC-8811.6: 관리자가 의사랑 의원을 보는 중', () => {
  it('AC-8811.6: 숫자 없음이면 "아직 올린 의사랑 엑셀이 없어요" 글만 있고 올리기 칸·[쓰는 EMR 바꾸기]가 없다', () => {
    notBitPc()
    render(
      <ViewingProvider viewing={VIEWING}>
        <BitDashboard today={TODAY} initial={NONE} uisUpload={slot} />
      </ViewingProvider>,
    )
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual([VIEW_H1])
    expect(screen.getByText(VIEW_TEXT)).toBeTruthy()
    noBox()
    expect(slot).not.toHaveBeenCalled()
    expect(screen.queryByRole('link', { name: CHANGE })).toBeNull()
    noText(START_H1)
    noText(START_LEAD)
  })

  it('AC-8811.6: 숫자가 있어도 머리 줄 아래 올리기 칸이 없다', () => {
    onBitPc()
    render(
      <ViewingProvider viewing={VIEWING}>
        <BitDashboard today={TODAY} initial={SAVED_UIS} savedAt={SAVED_AT} savedRefresh={refresh()} uisUpload={slot} />
      </ViewingProvider>,
    )
    expect(screen.getByRole('heading', { level: 1, name: '대시보드' })).toBeTruthy()
    noBox()
    expect(slot).not.toHaveBeenCalled()
    expect(readBitDays).not.toHaveBeenCalled()
  })
})

describe('AC-8811.7: 비트·이지스·그 밖 의원은 지금 그대로', () => {
  it.each(['bit', 'egis', 'other'] as const)('AC-8811.7: %s — uisUpload를 줘도 그린 글이 같고 부르지도 않는다', (emr) => {
    clinic.emr = emr
    for (const pc of [notBitPc, onBitPc]) {
      pc()
      for (const initial of [NONE, SAVED_UIS]) {
        const plain = renderToStaticMarkup(<BitDashboard today={TODAY} initial={initial} />)
        expect(renderToStaticMarkup(<BitDashboard today={TODAY} initial={initial} uisUpload={slot} />)).toBe(plain)
        expect(plain).not.toContain(START_H1)
        expect(plain).not.toContain(CHIP)
      }
    }
    expect(slot).not.toHaveBeenCalled()
  })

  it.each(['loading', 'failed'] as const)('AC-8811.7: 병원 정보가 %s이면 EMR이 의사랑이어도 지금(비트) 모양이다', (state) => {
    notBitPc()
    clinic.state = state
    draw()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(CONNECT_H1)
    noBox()
    expect(slot).not.toHaveBeenCalled()
  })
})

describe('AC-8811.8: AI 요약', () => {
  it('AC-8811.8: 의사랑 · 저장된 숫자 있음이면 AI 경영 리포트 요약이 지금 자리(일별 현황 다음 · 기간별 흐름 앞)에 있다', () => {
    notBitPc()
    draw(SAVED_UIS)
    const brief = screen.getByRole('region', { name: /^우리 병원 AI 경영 리포트/ })
    expectOrder(todaySection(), brief, flow())
  })
})

describe('AC-8811.9: 병원 정보를 읽는 동안 시작한 비트 읽기 → 의사랑 판정', () => {
  const judgeUis = (rerender: (ui: ReactNode) => void, initial: SummarySource) => {
    clinic.state = 'ready'
    clinic.emr = 'uisarang'
    rerender(<BitDashboard today={TODAY} initial={initial} uisUpload={slot} savedAt={SAVED_AT} savedRefresh={refresh()} />)
  }

  it('AC-8811.9: 숫자 없이 읽는 중이던 화면은 읽기를 멈추고 시작 칸으로 돌아가 "읽는 중"이 남지 않는다', async () => {
    onBitPc()
    clinic.state = 'loading'
    const { rerender } = render(<BitDashboard today={TODAY} initial={NONE} uisUpload={slot} />)
    expect(reads).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(READ_H1)
    judgeUis(rerender, NONE)
    expect(reads[0]!.deps.signal?.aborted).toBe(true)
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual([START_H1])
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(box().getAttribute('data-look')).toBe('open')
    // 멈춘 읽기의 늦은 답은 쓰지 않고, 새 읽기를 시작하지 않는다
    await act(async () => {
      reads[0]!.resolve({ kind: 'days', days: [uisDay(TODAY, 50, 5)] })
    })
    expect(reads).toHaveLength(1)
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual([START_H1])
  })

  it('AC-8811.9: 저장 숫자를 둔 채 비트에서 다시 읽는 중이던 머리 줄은 의사랑 모양(읽는 중 표시 없음)으로 돌아간다', () => {
    onBitPc()
    clinic.state = 'loading'
    const { rerender, container } = render(<BitDashboard today={TODAY} initial={SAVED_UIS} savedAt={SAVED_AT} savedRefresh={refresh()} uisUpload={slot} />)
    expect(reads).toHaveLength(1)
    expect(screen.getByText('비트에서 다시 읽는 중')).toBeTruthy()
    judgeUis(rerender, SAVED_UIS)
    expect(reads[0]!.deps.signal?.aborted).toBe(true)
    const head = screen.getByRole('heading', { level: 1, name: '대시보드' }).parentElement!
    expect(within(head).getByText(CHIP)).toBeTruthy()
    expect(within(head).getAllByRole('button').map((b) => b.textContent)).toEqual([REFRESH])
    expect(container.innerHTML).not.toMatch(/bit-read-spin|bit-read-bar/)
    noText('비트에서 다시 읽는 중')
    expect(box().getAttribute('data-look')).toBe('folded')
  })

  it('AC-8811.9: 판정 전에 비트 읽기가 끝났어도 의사랑으로 판정되면 저장된 숫자 모양이다(비트 숫자를 그리지 않는다)', async () => {
    onBitPc()
    clinic.state = 'loading'
    const { rerender } = render(<BitDashboard today={TODAY} initial={NONE} uisUpload={slot} />)
    await act(async () => {
      reads[0]!.resolve({ kind: 'days', days: [uisDay(TODAY, 50, 5)] })
    })
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('대시보드')
    judgeUis(rerender, NONE)
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual([START_H1])
    expect(reads).toHaveLength(1)
  })
})

describe('AC-601.17: ReadStatus의 도는 표시 ReadSpin (의사랑 올리기 칸이 빌려 씀)', () => {
  it('AC-601.17: ReadSpin은 aria-hidden 도는 표시 .bit-read-spin 하나를 그린다', () => {
    expect(renderToStaticMarkup(<ReadSpin />)).toBe('<span aria-hidden="true" class="bit-read-spin shrink-0"></span>')
  })
})
