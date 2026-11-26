// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { groupKey } from '@/components/stats/treatmentView'
import type { WideDays } from '@/components/stats/useWideDays'
import { formatClinicReport } from '@/lib/clinicReport/reportText'
import { loadGoal } from '@/lib/storage/goals'
import type { CalSlotRow } from '@/types/calendar'
import type { ClinicReportMode, ClinicReportNumbers } from '@/types/clinicReport'
import type { Goal } from '@/types/goals'
import type { DayPayload } from '@/types/payload'
import type { StatsRxGroup } from '@/types/rxGroups'
import type { SavedRevenueDay } from '@/types/revenue'
import type { StatsCalendarShown } from './CalendarSection'
import type { GoalRead } from './GoalSection'
import { StatsCard } from './parts'
import { MonthlyReportSection, ReportSection, type PickReport, type ReportData } from './ReportSection'
import { StatsSections } from './StatsSections'
import type { ClinicProfileView } from '@/components/clinic/useClinicProfile'
import type { StatsRxGroupsView } from '@/components/stats/useStatsRxGroups'
import { statsRange } from '@/components/stats/view'
import { VISIT_HOURS } from '@/lib/analytics/visitHours'
import { DEFAULT_HOURS, type Honorific } from '@/types/clinicProfile'
import type { BitSectionsView, PatientMix } from '@/types/stats'

// 월간 보고서(stats-insights REQ-6108)가 읽는 서버 자리: 고른 달 목표 · 고른 달과 앞 달 하루 매출. 이 파일 안에서만 가짜다
vi.mock('@/lib/storage/goals', () => ({ loadGoal: vi.fn() }))
const revenueStore = vi.hoisted(() => ({ loadDays: vi.fn() }))
vi.mock('@/lib/storage/revenue', () => ({ createRevenueStore: vi.fn(() => revenueStore) }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: vi.fn(() => ({})) }))
// 병원 정보 훅(clinic-profile AC-6606.1~3): 통계 틀(StatsSections)이 한 번 읽어 칸마다 넘긴다. 이 파일 안에서만 가짜다
const clinic = vi.hoisted(() => ({ view: null as unknown }))
vi.mock('@/components/clinic/useClinicProfile', () => ({ useClinicProfile: () => clinic.view }))
// 통계 틀을 그릴 때 처방 골라 보기·처방별 추세 칸이 읽는 저장 코드(읽는 중에 머문다)
vi.mock('@/lib/storage/rxPicks', () => ({ readRxPicks: vi.fn(() => new Promise(() => undefined)), addRxPick: vi.fn(), removeRxPick: vi.fn(), clearRxPicks: vi.fn() }))
vi.mock('@/lib/storage/statsRxGroups', () => ({ listStatsRxGroups: vi.fn(() => new Promise(() => undefined)), saveStatsRxGroups: vi.fn(), StatsRxGroupStoreError: class extends Error {} }))

// 원장님 보고 문장 (stats REQ-513 AC-513.6·513.8, 시안 notes.md §3). 숫자·병원 이름은 시험 안에서 지은 가짜다

const TODAY = '2026-11-13' // 금요일
const HOSPITAL = '튼튼의원'

function numbers(period: string, over: Partial<Extract<ClinicReportNumbers, { ok: true }>> = {}): ClinicReportNumbers {
  return {
    ok: true,
    period,
    totalVisits: 120,
    newPatients: 20,
    returnPatients: 100,
    totalAmount: 1000000,
    insurerAmount: 700000,
    noncoveredAmount: 300000,
    cashAmount: 100000,
    cardAmount: 200000,
    transferAmount: 0,
    treatments: { manual: 10, eswt: 5, carm: 3, sono: 2, cryo: 1 },
    laCodes: [{ code: 'LA9001', count: 2 }],
    financeUnconfirmed: false,
    notes: [],
    ...over,
  }
}
const DAILY = [numbers('2026-11-13'), numbers('2026-11-12', { totalVisits: 99 })]
const MONTHLY = [numbers('2026-11', { totalVisits: 777 }), numbers('2026-10', { totalVisits: 888 })]
const data = (over: Partial<ReportData['numbers']> = {}, rest: Partial<Omit<ReportData, 'numbers'>> = {}): ReportData => ({
  numbers: { daily: DAILY, monthly: MONTHLY, ...over },
  loadedAt: '18:42',
  closedToday: false,
  ...rest,
})
const draw = (report: ReportData | null, saved = true, hospitalName = HOSPITAL) =>
  render(<ReportSection report={report} hospitalName={hospitalName} today={TODAY} saved={saved} />)
const pick = (name: string) => fireEvent.click(screen.getByRole('button', { name }))

function textOf(mode: ClinicReportMode, n: ClinicReportNumbers, hospitalName = HOSPITAL) {
  const result = formatClinicReport({ mode, numbers: n, hospitalName }, TODAY)
  if ('error' in result) throw new Error(result.error)
  return result
}
// 글 줄들을 담은 칸(줄 수 제한이 붙는 곳). 바탕·모서리·여백은 그 바깥 칸(textBox)이 맡는다(first90 AC-4415.1: 여백 안으로 다음 줄이 비치지 않게)
const reportBox = () => screen.getByText('고생하셨습니다 !!').parentElement!
const textBox = () => reportBox().parentElement!
const shownLines = () => Array.from(reportBox().children).map((line) => line.textContent)
const classesOf = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)

const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
afterEach(() => {
  cleanup()
  if (original) Object.defineProperty(navigator, 'clipboard', original)
  else Reflect.deleteProperty(navigator, 'clipboard')
})

describe('AC-513.6: 고르기', () => {
  it('AC-513.6: h2 + 옆 설명 + 고르기 묶음 넷이고 처음은 오늘 일일보고다', () => {
    draw(data())
    expect(screen.getByRole('heading', { level: 2, name: '원장님 보고 문장' })).toBeTruthy()
    expect(screen.getByText('비트 PC에서 불러온 숫자로 만든 보고 글')).toBeTruthy()
    const group = screen.getByRole('group', { name: '보고 고르기' })
    const buttons = within(group).getAllByRole('button')
    expect(buttons.map((b) => b.textContent)).toEqual(['오늘 일일보고', '어제 일일보고', '이번 달 월말보고', '지난달 월말보고'])
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'false'])
  })

  it('AC-513.6: 고른 벌의 글로 바뀌고 그 단추만 눌림이다', () => {
    draw(data())
    expect(shownLines()).toEqual(textOf('daily', DAILY[0]!).text.split('\n'))
    pick('어제 일일보고')
    expect(shownLines()).toEqual(textOf('daily', DAILY[1]!).text.split('\n'))
    expect(screen.getByRole('button', { name: '어제 일일보고' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: '오늘 일일보고' }).getAttribute('aria-pressed')).toBe('false')
    pick('이번 달 월말보고')
    expect(shownLines()).toEqual(textOf('monthly', MONTHLY[0]!).text.split('\n'))
    pick('지난달 월말보고')
    expect(shownLines()).toEqual(textOf('monthly', MONTHLY[1]!).text.split('\n'))
  })

  it('AC-513.6: 벌은 차례가 아니라 기간으로 찾는다', () => {
    draw(data({ daily: [DAILY[1]!, DAILY[0]!], monthly: [MONTHLY[1]!, MONTHLY[0]!] }))
    expect(shownLines()).toEqual(textOf('daily', DAILY[0]!).text.split('\n'))
    pick('이번 달 월말보고')
    expect(shownLines()).toEqual(textOf('monthly', MONTHLY[0]!).text.split('\n'))
  })

  it('AC-513.6: 날짜 줄은 시안 글이다', () => {
    draw(data())
    expect(screen.getByText('11월 13일 금요일 · 18:42까지 불러온 숫자예요(오늘은 진료 중)')).toBeTruthy()
    pick('어제 일일보고')
    expect(screen.getByText('11월 12일 목요일')).toBeTruthy()
    pick('이번 달 월말보고')
    expect(screen.getByText('11월 1일 – 11월 13일 · 오늘까지 불러온 숫자예요')).toBeTruthy()
    pick('지난달 월말보고')
    expect(screen.getByText('10월 1일 – 10월 31일')).toBeTruthy()
  })

  it('AC-513.6: 오늘 진료 끝을 켜고 불러왔으면 "오늘은 진료 중"을 쓰지 않는다', () => {
    draw(data({}, { closedToday: true }))
    expect(screen.getByText('11월 13일 금요일 · 18:42까지 불러온 숫자예요')).toBeTruthy()
    expect(screen.queryByText(/진료 중/)).toBeNull()
  })
})

describe('AC-513.6: 보고 글', () => {
  it('AC-513.6·AC-4415.1: 글자로만 그리고 줄바꿈·띄어쓰기를 그대로 두며 시안의 옅은 회색 작은 둥근 칸이다', () => {
    draw(data())
    expect(classesOf(textBox())).toEqual(expect.arrayContaining(['bg-st-canvas', 'rounded-st-sm', 'text-st-ink']))
    expect(reportBox().className).toContain('whitespace-pre-wrap')
    expect(shownLines()).toContain('총환                  120명')
    expect(shownLines()).toContain('')
  })

  it('AC-513.6: 병원 이름에 HTML이 들어도 글자로 보인다', () => {
    const name = '<b>가짜의원</b>'
    const { container } = draw(data(), true, name)
    expect(screen.getByText(name)).toBeTruthy()
    expect(container.querySelector('b')).toBeNull()
  })

  it('AC-513.6: 안내 목록과 안심 줄이 있다', () => {
    draw(data())
    const notes = textOf('daily', DAILY[0]!).notes
    expect(notes.length).toBeGreaterThan(0)
    for (const note of notes) expect(screen.getByText(note)).toBeTruthy()
    expect(screen.getByText('보고 문장은 숫자만 쓰고 환자 이름은 쓰지 않아요.')).toBeTruthy()
  })
})

// ── first90: 네 줄 미리보기 · [전체 보기] · [복사] (REQ-4415, design.md 5-0·5-2·5-3, 시안 redesign.html .s-rep) ─────────────────
// 네 줄 셈: jsdom은 줄을 그리지 않으므로 글의 줄바꿈으로 나눈 줄 수(빈 줄도 한 줄)로 센다. 화면에서는 줄 수 제한(line-clamp-4)이 자른다
describe('AC-4415.1·AC-4415.2: 네 줄 미리보기 · [전체 보기] · [복사]', () => {
  const more = () => screen.getByRole('button', { name: '전체 보기' })
  const drawPick = (text: string | null) =>
    render(<ReportSection report={data()} hospitalName={HOSPITAL} today={TODAY} saved pick={{ label: '2026년 10월 1일 – 31일', text }} />)
  const clipboard = () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    return writeText
  }

  it('AC-4415.1: 처음에는 글 칸에 줄 수 제한(line-clamp-4)이 붙어 네 줄만 보이고, 글 줄은 모두 그대로 있다', () => {
    draw(data())
    const { text } = textOf('daily', DAILY[0]!)
    expect(text.split('\n').length).toBeGreaterThan(4)
    expect(classesOf(reportBox())).toContain('line-clamp-4')
    expect(shownLines()).toEqual(text.split('\n'))
  })

  it('AC-4415.1: 빈 줄도 줄바꿈(br) 한 줄이라 화면의 네 줄 셈에 든다', () => {
    draw(data())
    const blanks = Array.from(reportBox().children).filter((line) => line.textContent === '')
    expect(blanks.length).toBeGreaterThan(0)
    for (const blank of blanks) expect(blank.querySelector('br')).not.toBeNull()
  })

  it('AC-4415.1: 글 바로 아래 줄에 [전체 보기] · [복사]가 차례로 있고, 보고 고르기 줄에는 [복사]가 없다', () => {
    draw(data())
    const row = textBox().nextElementSibling as HTMLElement
    expect(within(row).getAllByRole('button').map((button) => button.textContent)).toEqual(['전체 보기', '복사'])
    const group = screen.getByRole('group', { name: '보고 고르기' })
    expect(group.parentElement!.contains(screen.getByRole('button', { name: '복사' }))).toBe(false)
    expect(within(group).getAllByRole('button')).toHaveLength(4)
  })

  it('AC-4415.1: [전체 보기]를 누르면 줄 수 제한이 풀리고 [접기](aria-expanded true)가 되며, 다시 누르면 네 줄로 돌아온다', () => {
    draw(data())
    expect(more().getAttribute('aria-expanded')).toBe('false')
    expect(textBox().id).not.toBe('')
    expect(more().getAttribute('aria-controls')).toBe(textBox().id)
    fireEvent.click(more())
    const fold = screen.getByRole('button', { name: '접기' })
    expect(fold.getAttribute('aria-expanded')).toBe('true')
    expect(fold.getAttribute('aria-controls')).toBe(textBox().id)
    expect(screen.queryByRole('button', { name: '전체 보기' })).toBeNull()
    expect(classesOf(reportBox())).not.toContain('line-clamp-4')
    fireEvent.click(fold)
    expect(more().getAttribute('aria-expanded')).toBe('false')
    expect(classesOf(reportBox())).toContain('line-clamp-4')
  })

  it('AC-4415.1: 접힌 채로 [복사]를 눌러도 글 전체를 복사한다', async () => {
    const writeText = clipboard()
    draw(data())
    expect(more().getAttribute('aria-expanded')).toBe('false')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '복사' }))
    })
    expect(writeText).toHaveBeenCalledWith(textOf('daily', DAILY[0]!).text)
  })

  it('AC-4415.1: 다른 보고를 고르면 그 글은 다시 네 줄로 접혀 있다', () => {
    draw(data())
    fireEvent.click(more())
    pick('어제 일일보고')
    expect(shownLines()).toEqual(textOf('daily', DAILY[1]!).text.split('\n'))
    expect(more().getAttribute('aria-expanded')).toBe('false')
    expect(classesOf(reportBox())).toContain('line-clamp-4')
  })

  it('AC-4415.1: 흐림 덧칠(그라데이션·가림 층)과 움직임 클래스가 없다(접힘·펼침 둘 다)', () => {
    const { container } = draw(data())
    const DECORATION = /^(?:[\w-]+:)*(?:bg-(?:linear|radial|conic|gradient)|from-|via-|to-|mask-|backdrop-|blur|animate-|st-)/
    const MOTION = /^(?:[\w-]+:)*(?:transition|duration-|ease-|delay-)/
    const check = () => {
      expect(Array.from(container.querySelectorAll('*')).flatMap(classesOf).filter((token) => DECORATION.test(token))).toEqual([])
      const box = [textBox(), ...Array.from(textBox().querySelectorAll('*'))]
      expect(box.flatMap(classesOf).filter((token) => MOTION.test(token) || /^(?:after|before):/.test(token))).toEqual([])
      expect(textBox().children).toHaveLength(1) // 글 줄 칸 하나뿐: 위에 덮는 층이 없다
    }
    check()
    fireEvent.click(more())
    check()
  })

  it('AC-4415.2: 글이 네 줄이면 [전체 보기]가 없고 줄 수 제한도 없으며 [복사]는 있다', () => {
    drawPick('첫 줄\n둘째 줄\n셋째 줄\n넷째 줄')
    expect(screen.queryByRole('button', { name: '전체 보기' })).toBeNull()
    expect(classesOf(screen.getByText('넷째 줄').parentElement!)).not.toContain('line-clamp-4')
    expect(screen.getByRole('button', { name: '복사' }).getAttribute('aria-disabled')).toBeNull()
  })

  it('AC-4415.2: 한 줄 고른 기간 글도 [전체 보기]가 없다', () => {
    drawPick('2026년 10월 1일 – 31일 환자는 하루 평균 42명, 신환 120명·재진 980명입니다.')
    expect(screen.queryByRole('button', { name: '전체 보기' })).toBeNull()
    expect(screen.getByRole('button', { name: '복사' })).toBeTruthy()
  })

  it('AC-4415.1·AC-4415.2: 다섯 줄(빈 줄 포함)이면 [전체 보기]가 있다 — 네 줄 셈은 글의 줄바꿈으로 나눈 줄 수다', () => {
    drawPick('첫 줄\n\n셋째 줄\n넷째 줄\n다섯째 줄')
    expect(more().getAttribute('aria-expanded')).toBe('false')
    expect(classesOf(screen.getByText('다섯째 줄').parentElement!)).toContain('line-clamp-4')
  })

  it('AC-4415.1: 글이 없는 벌(확정할 수 없음·비트 자료 없음·고른 기간 자료 없음)은 [전체 보기]가 없고 [복사]는 막힌 채다', () => {
    draw(data({ daily: [DAILY[0]!, { ok: false, period: '2026-11-12', reason: '가짜 사유 글' }] }))
    pick('어제 일일보고')
    expect(screen.queryByRole('button', { name: '전체 보기' })).toBeNull()
    expect(screen.getByRole('button', { name: '복사' }).getAttribute('aria-disabled')).toBe('true')
    cleanup()
    draw(data({ daily: [numbers('2026-11-12')] }))
    expect(screen.queryByRole('button', { name: '전체 보기' })).toBeNull()
    expect(screen.getByRole('button', { name: '복사' }).getAttribute('aria-disabled')).toBe('true')
    cleanup()
    drawPick(null)
    expect(screen.queryByRole('button', { name: '전체 보기' })).toBeNull()
    expect(screen.getByRole('button', { name: '복사' }).getAttribute('aria-disabled')).toBe('true')
  })
})

// ── stats-pc-ux: 보고 아래 · 글 접기 (REQ-4004 AC-4004.2 ⑤·AC-4004.3, 기본값 11) ─────────────────
describe('AC-4004.2 ⑤·AC-4004.3: 보고 아래 · 글은 "어떻게 세나요?" 안이다', () => {
  const PRIVACY = '보고 문장은 숫자만 쓰고 환자 이름은 쓰지 않아요.'
  const howButton = () => screen.getByRole('button', { name: '어떻게 세나요?' })
  const howBody = () => document.getElementById(howButton().getAttribute('aria-controls')!)!

  it('AC-4004.2: · 글들은 "어떻게 세나요?" 칸 안에 차례대로 있고 처음에는 접혀(hidden) 있어 그 자리에 보이지 않는다', () => {
    draw(data())
    const notes = textOf('daily', DAILY[0]!).notes
    expect(howButton().getAttribute('aria-expanded')).toBe('false')
    expect(howBody().hidden).toBe(true)
    for (const note of notes) expect(screen.getByText(note).closest('[hidden]')).toBe(howBody())
    const items = Array.from(howBody().querySelectorAll('li')).map((li) => li.lastElementChild!.textContent)
    expect(items).toEqual(notes)
  })

  it('AC-4004.2: 누르면 · 글이 보이고 다시 누르면 접힌다', () => {
    draw(data())
    fireEvent.click(howButton())
    expect(howButton().getAttribute('aria-expanded')).toBe('true')
    expect(howBody().hidden).toBe(false)
    fireEvent.click(howButton())
    expect(howBody().hidden).toBe(true)
  })

  it('AC-4004.2·AC-4415.1: 접는 칸은 보고 글과 그 아래 [전체 보기]·[복사] 줄 바로 다음이다', () => {
    draw(data())
    const buttons = textBox().nextElementSibling!
    expect(buttons.contains(screen.getByRole('button', { name: '복사' }))).toBe(true)
    expect(buttons.nextElementSibling).toBe(howButton().parentElement)
    expect(howButton().parentElement!.contains(howBody())).toBe(true)
  })

  it('AC-4004.3: 날짜 줄과 개인정보 줄은 접지 않고 그대로 보이며 개인정보 줄은 접는 칸 다음이다', () => {
    draw(data())
    expect(screen.getByText('11월 13일 금요일 · 18:42까지 불러온 숫자예요(오늘은 진료 중)').closest('[hidden]')).toBeNull()
    const privacy = screen.getByText(PRIVACY)
    expect(privacy.closest('[hidden]')).toBeNull()
    expect(howButton().parentElement!.contains(privacy)).toBe(false)
    expect(howButton().compareDocumentPosition(privacy) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('AC-4004.2: 넣을 · 글이 없으면(고른 기간 보고 · 확정할 수 없음 · 비트 자료 없음) 접는 칸도 없다', () => {
    render(<ReportSection report={null} hospitalName={HOSPITAL} today={TODAY} saved pick={{ label: '2026년 10월', text: '가짜 보고 글' }} />)
    expect(screen.queryByRole('button', { name: '어떻게 세나요?' })).toBeNull()
    cleanup()
    draw(data({ daily: [DAILY[0]!, { ok: false, period: '2026-11-12', reason: '가짜 사유 글' }] }))
    pick('어제 일일보고')
    expect(screen.queryByRole('button', { name: '어떻게 세나요?' })).toBeNull()
    cleanup()
    draw(null)
    expect(screen.queryByRole('button', { name: '어떻게 세나요?' })).toBeNull()
  })
})

// bit-total REQ-6908 AC-6908.5: 0.13.0 전 도우미의 financeUnconfirmed 벌도 날짜 줄·글 칸은 보통 벌과 같다('· 금액 확인 필요'·노란 줄 없음)
describe('AC-6908.5: financeUnconfirmed 벌(0.13.0 전 도우미)', () => {
  const UNCONFIRMED = numbers('2026-11-12', { financeUnconfirmed: true, financeUnconfirmedReason: '가짜 사유' })
  const ALL_UNCONFIRMED = {
    daily: [numbers(TODAY, { financeUnconfirmed: true }), UNCONFIRMED],
    monthly: [numbers('2026-11', { financeUnconfirmed: true }), numbers('2026-10', { financeUnconfirmed: true })],
  }

  it("AC-6908.5: 날짜 줄에 ' · 금액 확인 필요'가 붙지 않는다(오늘·어제·이번 달·지난달)", () => {
    draw(data(ALL_UNCONFIRMED))
    expect(screen.getByText('11월 13일 금요일 · 18:42까지 불러온 숫자예요(오늘은 진료 중)')).toBeTruthy()
    pick('어제 일일보고')
    expect(screen.getByText('11월 12일 목요일')).toBeTruthy()
    pick('이번 달 월말보고')
    expect(screen.getByText('11월 1일 – 11월 13일 · 오늘까지 불러온 숫자예요')).toBeTruthy()
    pick('지난달 월말보고')
    expect(screen.getByText('10월 1일 – 10월 31일')).toBeTruthy()
    expect(screen.queryByText(/확인 필요/)).toBeNull()
  })

  it('AC-6908.5: 글 줄은 formatClinicReport 글 그대로이고 어느 줄도 노란 바탕·경고 색이 아니다(금액 줄 "–"도 보통 줄)', () => {
    draw(data({ daily: [DAILY[0]!, UNCONFIRMED] }))
    pick('어제 일일보고')
    const { text } = textOf('daily', UNCONFIRMED)
    const lines = Array.from(reportBox().children)
    expect(lines.map((line) => line.textContent)).toEqual(text.split('\n'))
    expect(lines.map((line) => line.textContent)).toContain('총진료비        –')
    for (const line of lines) expect(classesOf(line)).toEqual(['block', 'min-h-5.5'])
    expect(reportBox().textContent).not.toContain('확인 필요')
  })

  it('AC-6908.5: [복사]는 누를 수 있고 글 전체를 복사한다', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    draw(data({ daily: [DAILY[0]!, UNCONFIRMED] }))
    pick('어제 일일보고')
    expect(screen.getByRole('button', { name: '복사' }).getAttribute('aria-disabled')).toBeNull()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '복사' }))
    })
    const { text } = textOf('daily', UNCONFIRMED)
    expect(writeText).toHaveBeenCalledWith(text)
    expect(text).toContain('건당진료비      –')
    expect(text).toContain('고생하셨습니다 !!')
  })

  it("AC-6908.5: ok가 false인 벌의 '이 기간은 보고를 확정할 수 없어요'는 그대로다", () => {
    draw(data({ daily: [UNCONFIRMED, { ok: false, period: '2026-11-13', reason: '가짜 사유 글' }] }))
    expect(screen.getByText('이 기간은 보고를 확정할 수 없어요')).toBeTruthy()
    expect(screen.getByText('비트 원본 통계에서 11월 13일 숫자를 확인해 주세요. 이유: 가짜 사유 글')).toBeTruthy()
    expect(screen.getByRole('button', { name: '복사' }).getAttribute('aria-disabled')).toBe('true')
  })
})

describe('AC-513.6: ok: false 벌', () => {
  const BAD: ClinicReportNumbers = { ok: false, period: '2026-11-12', reason: '가짜 사유 글' }

  it('AC-513.6: "이 기간은 보고를 확정할 수 없어요" + 비트 원본 통계 안내이고 글·[복사]가 없다', () => {
    draw(data({ daily: [DAILY[0]!, BAD] }))
    pick('어제 일일보고')
    expect(screen.getByText('이 기간은 보고를 확정할 수 없어요')).toBeTruthy()
    expect(screen.getByText('비트 원본 통계에서 11월 12일 숫자를 확인해 주세요. 이유: 가짜 사유 글')).toBeTruthy()
    expect(screen.getByText('11월 12일 목요일')).toBeTruthy()
    expect(screen.queryByText('고생하셨습니다 !!')).toBeNull()
    expect(screen.getByRole('button', { name: '복사' }).getAttribute('aria-disabled')).toBe('true')
  })

  it('AC-513.6: 월말 벌은 달 이름으로 안내한다', () => {
    draw(data({ monthly: [MONTHLY[0]!, { ok: false, period: '2026-10', reason: '가짜 사유 글' }] }))
    pick('지난달 월말보고')
    expect(screen.getByText('비트 원본 통계에서 10월 숫자를 확인해 주세요. 이유: 가짜 사유 글')).toBeTruthy()
  })
})

describe('AC-513.6: [복사]', () => {
  const clipboard = () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    return writeText
  }

  it('AC-513.6: 고른 벌의 글을 복사하고 2초 "복사했어요"가 된다', async () => {
    const writeText = clipboard()
    draw(data())
    pick('어제 일일보고')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '복사' }))
    })
    expect(writeText).toHaveBeenCalledWith(textOf('daily', DAILY[1]!).text)
    expect(screen.getByRole('button', { name: '복사했어요' }).className).toContain('min-w-28')
  })

  it('AC-513.6: 다른 벌을 고르면 "복사했어요" 표시가 남지 않는다', async () => {
    clipboard()
    draw(data())
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '복사' }))
    })
    pick('어제 일일보고')
    expect(screen.getByRole('button', { name: '복사' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '복사했어요' })).toBeNull()
  })
})

describe('AC-513.8: 비트 PC에서 불러온 자료가 없을 때', () => {
  const REASON = '비트 PC에서 불러오면 보여요 · 금액은 서버에 저장하지 않아서, 비트 PC에서 불러온 화면에서만 볼 수 있어요.'

  it('AC-513.8: "비트 PC에서 불러오면 보여요" + 한 줄 이유이고 고르기·[복사]가 없다', () => {
    draw(null)
    expect(screen.getByText('비트 PC에서 불러오면 보여요').parentElement!.textContent).toBe(REASON)
    expect(screen.queryByRole('group')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('비트 PC에서 불러온 숫자로 만든 보고 글')).toBeTruthy()
  })

  it('AC-513.8: 저장된 숫자가 하나도 없으면 h2와 안내뿐이다(옆 설명 없음)', () => {
    draw(null, false)
    expect(screen.getByText('비트 PC에서 불러오면 보여요').parentElement!.textContent).toBe(REASON)
    expect(screen.queryByText('비트 PC에서 불러온 숫자로 만든 보고 글')).toBeNull()
  })

  it('AC-513.8: 고른 벌이 없으면(불러온 뒤 날이 바뀜) 글 자리에 같은 안내이고 [복사]가 막힌다', () => {
    draw(data({ daily: [numbers('2026-11-12')] }))
    expect(screen.getByText('비트 PC에서 불러오면 보여요').parentElement!.textContent).toBe(REASON)
    expect(screen.getByRole('button', { name: '복사' }).getAttribute('aria-disabled')).toBe('true')
    pick('어제 일일보고')
    expect(screen.getByText('고생하셨습니다 !!')).toBeTruthy()
  })
})

// ── 고른 기간 보고 (stats-period REQ-1707) ─────────────────
describe('AC-1707.1·AC-1707.3·AC-1707.4: [고른 기간 보고]', () => {
  const PICK_TEXT = '2026년 10월 1일 – 31일 환자는 하루 평균 42명, 신환 120명·재진 980명입니다. 하루 평균은 9월보다 3명(7.6%) 늘었습니다.'
  const PICK: PickReport = { label: '2026년 10월 1일 – 31일', text: PICK_TEXT }
  const drawPick = (report: ReportData | null, pickReport: PickReport | null = PICK) =>
    render(<ReportSection report={report} hospitalName={HOSPITAL} today={TODAY} saved pick={pickReport} />)
  const buttonsOf = () => within(screen.getByRole('group', { name: '보고 고르기' })).getAllByRole('button')

  it('AC-1707.1: 고르기에 들어오면 단추는 [고른 기간 보고]가 맨 앞인 다섯이고 [고른 기간 보고]가 눌려 있다', () => {
    drawPick(data())
    expect(buttonsOf().map((b) => b.textContent)).toEqual(['고른 기간 보고', '오늘 일일보고', '어제 일일보고', '이번 달 월말보고', '지난달 월말보고'])
    expect(buttonsOf().map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'false', 'false'])
    expect(screen.getByText(PICK_TEXT)).toBeTruthy()
  })

  it('AC-1707.1: 옛 넷을 누르면 지금 글이고, [고른 기간 보고]로 돌아오면 고른 기간 글이다', () => {
    drawPick(data())
    pick('어제 일일보고')
    expect(screen.queryByText(PICK_TEXT)).toBeNull()
    expect(reportBox()).toBeTruthy()
    pick('고른 기간 보고')
    expect(screen.getByText(PICK_TEXT)).toBeTruthy()
  })

  it('AC-1707.1: pick이 null이면(빠른 단추) 넷뿐이고 지금과 같다', () => {
    drawPick(data(), null)
    expect(buttonsOf().map((b) => b.textContent)).toEqual(['오늘 일일보고', '어제 일일보고', '이번 달 월말보고', '지난달 월말보고'])
  })

  it('AC-1707.3: 고른 기간 글이 있으면 [복사]를 누를 수 있다', () => {
    drawPick(data())
    expect(screen.getByRole('button', { name: /복사/ }).getAttribute('aria-disabled')).toBeNull()
  })

  it('AC-1707.3: current 자료가 없으면 "{label}은 자료가 없어 보고 문장을 만들 수 없어요."이고 [복사]는 누를 수 없다', () => {
    drawPick(data(), { label: '2026년 10월 1일 – 31일', text: null })
    expect(screen.getByText('2026년 10월 1일 – 31일은 자료가 없어 보고 문장을 만들 수 없어요.')).toBeTruthy()
    expect(screen.getByRole('button', { name: /복사/ }).getAttribute('aria-disabled')).toBe('true')
  })

  it('AC-1707.4: 비트에서 불러오지 않았어도(report null) [고른 기간 보고] 글은 저장된 숫자로 보이고 옛 넷은 "비트 PC에서 불러오면 보여요"다', () => {
    drawPick(null)
    expect(buttonsOf()).toHaveLength(5)
    expect(screen.getByText(PICK_TEXT)).toBeTruthy()
    expect(screen.queryByText('비트 PC에서 불러오면 보여요')).toBeNull()
    pick('오늘 일일보고')
    expect(screen.queryByText(PICK_TEXT)).toBeNull()
    expect(screen.getByText('비트 PC에서 불러오면 보여요')).toBeTruthy()
    expect(screen.getByRole('button', { name: /복사/ }).getAttribute('aria-disabled')).toBe('true')
  })

  it('AC-4403.4: 모든 날에 90일초진이 있는 고른 기간 글(신환·90일초진·재진)도 글 그대로 한 덩이로 보인다', () => {
    const text = '2026년 10월 1일 – 31일 환자는 하루 평균 42명, 신환 120명·90일초진 60명·재진 920명입니다. 하루 평균은 9월보다 3명(7.6%) 늘었습니다.'
    drawPick(data(), { label: '2026년 10월 1일 – 31일', text })
    expect(screen.getByText(text)).toBeTruthy()
    expect(screen.getByRole('button', { name: /복사/ }).getAttribute('aria-disabled')).toBeNull()
  })

  it('AC-1707.4: 비트 자료도 고른 기간도 없으면(report null, pick null) 지금처럼 안내 한 줄뿐이다', () => {
    drawPick(null, null)
    expect(screen.queryByRole('group', { name: '보고 고르기' })).toBeNull()
    expect(screen.getByText('비트 PC에서 불러오면 보여요')).toBeTruthy()
  })
})

// ── 월간 보고서 (stats-insights REQ-6108 AC-6108.1~AC-6108.3, 시안 docs/mockups/stats-insights ⑧) ─────────────
// 오늘 2026-11-13 → 고를 수 있는 달 = 2025-12 ~ 2026-11. 저장된 날: 11월·10월·9월·2025년 12월. 숫자·이름·차트번호는 지어낸 가짜다
describe('AC-6108.1·AC-6108.2·AC-6108.3: 월간 보고서 칸', () => {
  const G_DOSU: StatsRxGroup = { id: 'g1', name: '도수', codes: ['MM01'], sortOrder: 0 }
  const DOSU = groupKey(G_DOSU.codes, G_DOSU)
  const day = (ymd: string, patients: number, newPatients: number): DayPayload => ({
    schemaVersion: 2,
    quality: 'valid',
    day: ymd,
    partial: false,
    totals: { patients, newPatients, returning: patients - newPatients, unknown: 0 },
    rx: [],
    groups: [{ id: DOSU, patients: 10, newPatients: 0, returning: 10 }],
    revisit: { cohort: newPatients, within7: null, within14: null },
  })
  const DAYS = [day('2025-12-01', 400, 20), day('2026-09-07', 600, 50), day('2026-10-05', 700, 40), day('2026-11-02', 100, 5)]
  const wideOf = (over: Partial<WideDays> = {}): WideDays => ({ state: 'ready', days: DAYS, retry: vi.fn(), ...over })
  // roughTotal = 총액이 없는(확인 필요로 저장된) 날의 참고 금액(bit-total AC-6901.3). 둘 다 null이면 금액을 모르는 옛 날
  const salesDay = (date: string, total: number | null, roughTotal: number | null = null) => ({ date, total, roughTotal, dayCodes: false }) as unknown as SavedRevenueDay
  const CHART = '99001' // 가짜 차트번호
  const SLOT: CalSlotRow = { day: '2026-10-05', staffId: 's1', staffName: '김시행', kindId: 'dosu', kindName: '도수', status: 'came', auto: null, start: 540, len: 60, chart: CHART }
  const CALENDAR: StatsCalendarShown = {
    rows: [{ day: '2026-10-05', staffId: 's1', staffName: '김시행', kindId: 'dosu', kindName: '도수', status: 'came', auto: null, origDay: null, gMoved: false }],
    today: TODAY,
    onReread: vi.fn(),
    slots: { rows: [SLOT], offs: [] },
    settings: { kinds: [{ id: 'dosu', name: '도수', len: 30, color: null, words: ['도수'] }], staff: [{ id: 's1', name: '김선생', mark: '김', color: 'blueberry' }], openHour: 9, closeHour: 18, sunday: false },
  }
  const printSpy = vi.fn()

  const monthlyEl = (over: { wide?: WideDays; goal?: GoalRead<Goal>; revision?: number } = {}) => (
    <StatsCard title="원장님 보고 문장">
      <MonthlyReportSection
        today={TODAY}
        hospitalName={HOSPITAL}
        wide={over.wide ?? wideOf()}
        groups={[G_DOSU]}
        calendar={CALENDAR}
        bit={null}
        goal={over.goal}
        revision={over.revision ?? 0}
      />
    </StatsCard>
  )
  const drawMonthly = (over: { wide?: WideDays; goal?: GoalRead<Goal>; revision?: number } = {}) => render(monthlyEl(over))
  const settle = () => act(async () => void (await new Promise((done) => setTimeout(done))))
  const goalReadsOf = (month: string) => vi.mocked(loadGoal).mock.calls.filter(([, asked]) => asked === month).length
  const monthGroup = () => screen.getByRole('group', { name: '달' })
  const paperTitle = () => screen.getByRole('heading', { level: 4 })
  const paperEl = () => document.querySelector('[data-print-report]') as HTMLElement

  beforeEach(() => {
    vi.mocked(loadGoal).mockReset()
    vi.mocked(loadGoal).mockResolvedValue({ visits: 1000, newPatients: null, revenue: null })
    revenueStore.loadDays.mockReset()
    revenueStore.loadDays.mockResolvedValue([salesDay('2026-09-07', 50_000_000), salesDay('2026-10-05', 110_000_000)])
    printSpy.mockReset()
    window.print = printSpy
  })

  it("AC-6108.1: 제목 '월간 보고서'(카드 안 h3) 아래 달 고르기 = 최근 12달 가운데 저장된 달(새 달부터)이고 처음은 지난달이다", async () => {
    drawMonthly()
    expect(screen.getByRole('heading', { level: 3, name: '월간 보고서' })).toBeTruthy()
    expect(within(monthGroup()).getAllByRole('button').map((b) => b.textContent)).toEqual(['2026년 11월', '10월', '9월', '2025년 12월'])
    expect(within(monthGroup()).getByRole('button', { name: '10월' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(monthGroup()).getByRole('button', { name: '9월' }).getAttribute('aria-pressed')).toBe('false')
    expect(paperTitle().textContent).toContain('2026년 10월 통계 보고')
    expect(screen.getByText('튼튼의원 · 11월 13일 뽑음')).toBeTruthy()
    await waitFor(() => expect(screen.getByText('내원 700명 / 목표 1,000명 · 70%')).toBeTruthy())
  })

  it('AC-6108.1: [인쇄]를 누르면 window.print()를 부르고, 달 고르기·[인쇄]는 보고서 종이 밖이다(인쇄에 나오지 않는다)', () => {
    drawMonthly()
    fireEvent.click(screen.getByRole('button', { name: '인쇄' }))
    expect(printSpy).toHaveBeenCalledTimes(1)
    expect(paperEl().contains(monthGroup())).toBe(false)
    expect(paperEl().contains(screen.getByRole('button', { name: '인쇄' }))).toBe(false)
  })

  it('AC-6108.2: 고른 달의 목표(loadGoal)와 그 달·앞 달 하루 매출을 읽고, 다른 달을 고르면 그 달 보고서로 바뀐다', async () => {
    drawMonthly()
    await waitFor(() => expect(screen.getByText('110,000,000원')).toBeTruthy())
    expect(loadGoal).toHaveBeenCalledWith(expect.anything(), '2026-10')
    expect(revenueStore.loadDays).toHaveBeenCalledWith({ from: '2026-09-01', to: '2026-10-31' })
    fireEvent.click(within(monthGroup()).getByRole('button', { name: '9월' }))
    expect(within(monthGroup()).getByRole('button', { name: '9월' }).getAttribute('aria-pressed')).toBe('true')
    expect(paperTitle().textContent).toContain('2026년 9월 통계 보고')
    await waitFor(() => expect(loadGoal).toHaveBeenCalledWith(expect.anything(), '2026-09'))
    expect(revenueStore.loadDays).toHaveBeenCalledWith({ from: '2026-08-01', to: '2026-09-30' })
  })

  it('AC-6901.3·AC-6906.2·AC-6902.1~AC-6902.3: 확인 필요로 저장된 날도 참고 금액(roughTotal)으로 더하고 금액을 모르는 날은 빼며, 매출 글 세 곳은 원 단위다', async () => {
    vi.mocked(loadGoal).mockResolvedValue({ visits: 1000, newPatients: null, revenue: 100_000_000 })
    revenueStore.loadDays.mockResolvedValue([
      salesDay('2026-09-07', 50_000_000),
      salesDay('2026-09-08', null),
      salesDay('2026-10-05', 110_000_000),
      salesDay('2026-10-06', null, 4_980_450),
      salesDay('2026-10-07', null),
    ])
    drawMonthly()
    await waitFor(() => expect(within(paperEl()).getByText('114,980,450원')).toBeTruthy())
    expect(within(paperEl()).getByText('매출 114,980,450원 / 목표 100,000,000원 · 114%')).toBeTruthy()
    expect(within(paperEl()).getByText('매출 · 9월보다 130% 많아요 (50,000,000원 → 114,980,450원)')).toBeTruthy()
    expect(paperEl().textContent).not.toContain('만 원')
  })

  it('AC-6108.2: 이번 달은 요약 칸 목표 훅이 읽은 이번 달 목표를 쓰고 따로 읽지 않는다', async () => {
    drawMonthly({ goal: { visits: 200, newPatients: null, revenue: null } })
    fireEvent.click(within(monthGroup()).getByRole('button', { name: '2026년 11월' }))
    expect(paperTitle().textContent).toContain('2026년 11월 통계 보고')
    expect(screen.getByText('내원 100명 / 목표 200명 · 50%')).toBeTruthy()
    await waitFor(() => expect(revenueStore.loadDays).toHaveBeenCalledWith({ from: '2026-10-01', to: '2026-11-12' }))
    expect(loadGoal).not.toHaveBeenCalledWith(expect.anything(), '2026-11')
  })

  it('AC-6108.4: 이번 달 하루 매출은 어제(11월 12일)까지만 읽는다 — 넓은 하루·목표 칸과 같은 끝이다. 지난 달은 그 달 끝까지다', async () => {
    drawMonthly()
    await waitFor(() => expect(revenueStore.loadDays).toHaveBeenCalledWith({ from: '2026-09-01', to: '2026-10-31' }))
    fireEvent.click(within(monthGroup()).getByRole('button', { name: '2026년 11월' }))
    await waitFor(() => expect(revenueStore.loadDays).toHaveBeenCalledWith({ from: '2026-10-01', to: '2026-11-12' }))
    expect(revenueStore.loadDays).not.toHaveBeenCalledWith({ from: '2026-10-01', to: '2026-11-30' })
    expect(revenueStore.loadDays).not.toHaveBeenCalledWith({ from: '2026-10-01', to: TODAY })
  })

  it('AC-6108.5·AC-6102.6: revision이 늘면(비트에서 불러오기·저장·매출 읽기가 끝남) 고른 달 매출·목표를 다시 읽고, 다시 읽는 동안 앞 값(매출 칸·목표 줄)을 그대로 둔다', async () => {
    const view = drawMonthly()
    await waitFor(() => expect(screen.getByText('110,000,000원')).toBeTruthy())
    await waitFor(() => expect(screen.getByText('내원 700명 / 목표 1,000명 · 70%')).toBeTruthy())
    let finishSales!: (rows: SavedRevenueDay[]) => void
    let finishGoal!: (goal: Goal) => void
    revenueStore.loadDays.mockImplementationOnce(() => new Promise((resolve) => (finishSales = resolve)))
    vi.mocked(loadGoal).mockImplementationOnce(() => new Promise((resolve) => (finishGoal = resolve)))
    view.rerender(monthlyEl({ revision: 1 }))
    // 다시 그린 바로 그때부터 앞 값 — 매출 칸·목표 줄이 사라지지 않는다
    expect(screen.getByText('110,000,000원')).toBeTruthy()
    expect(screen.getByText('내원 700명 / 목표 1,000명 · 70%')).toBeTruthy()
    await settle()
    expect(revenueStore.loadDays).toHaveBeenCalledTimes(2)
    expect(goalReadsOf('2026-10')).toBe(2)
    expect(screen.getByText('110,000,000원')).toBeTruthy()
    expect(screen.getByText('내원 700명 / 목표 1,000명 · 70%')).toBeTruthy()
    await act(async () => finishSales([salesDay('2026-09-07', 50_000_000), salesDay('2026-10-05', 130_000_000)]))
    expect(screen.getByText('130,000,000원')).toBeTruthy()
    expect(screen.getByText('내원 700명 / 목표 1,000명 · 70%')).toBeTruthy()
    await act(async () => finishGoal({ visits: 1400, newPatients: null, revenue: null }))
    expect(screen.getByText('내원 700명 / 목표 1,400명 · 50%')).toBeTruthy()
    expect(screen.queryByText('110,000,000원')).toBeNull()
  })

  it('AC-6108.5: 다른 달을 고르면 앞 달 매출을 새 달 칸에 보이지 않는다(새 달은 읽는 중)', async () => {
    drawMonthly()
    await waitFor(() => expect(screen.getByText('110,000,000원')).toBeTruthy())
    revenueStore.loadDays.mockImplementationOnce(() => new Promise(() => undefined))
    fireEvent.click(within(monthGroup()).getByRole('button', { name: '9월' }))
    await settle()
    expect(paperTitle().textContent).toContain('2026년 9월 통계 보고')
    expect(screen.queryByText('110,000,000원')).toBeNull()
    expect(within(paperEl()).queryByText('매출')).toBeNull()
  })

  it('AC-6108.2: 매출·목표 읽기가 실패하면 종이 밖에 오류 카드 + [다시 읽기]이고 그 칸만 빼고 그린다. [다시 읽기]는 다시 읽는다', async () => {
    revenueStore.loadDays.mockRejectedValueOnce(new Error('가짜 실패'))
    drawMonthly()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('E-STATS-READ-FAILED')
    expect(paperEl().contains(alert)).toBe(false)
    expect(within(paperEl()).queryByText('매출')).toBeNull()
    expect(paperTitle().textContent).toContain('2026년 10월 통계 보고')
    fireEvent.click(screen.getByRole('button', { name: '다시 읽기' }))
    await waitFor(() => expect(screen.getByText('110,000,000원')).toBeTruthy())
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-6108.1: 넓은 하루 읽기가 읽는 중이면 제목뿐이고, 실패면 오류 카드 + [다시 읽기](넓은 읽기를 다시)다', () => {
    drawMonthly({ wide: wideOf({ state: 'reading', days: [] }) })
    expect(screen.getByRole('heading', { level: 3, name: '월간 보고서' })).toBeTruthy()
    expect(screen.queryByRole('group', { name: '달' })).toBeNull()
    expect(screen.queryByRole('button', { name: '인쇄' })).toBeNull()
    cleanup()
    const retry = vi.fn()
    drawMonthly({ wide: wideOf({ state: 'failed', days: [], retry }) })
    expect(screen.getByRole('alert').textContent).toContain('E-STATS-READ-FAILED')
    fireEvent.click(screen.getByRole('button', { name: '다시 읽기' }))
    expect(retry).toHaveBeenCalledTimes(1)
    expect(paperEl()).toBeNull()
  })

  it('AC-6108.1: 최근 12달에 저장된 달이 하나도 없으면 칸을 그리지 않는다', () => {
    drawMonthly({ wide: wideOf({ days: [day('2025-11-20', 300, 10)] }) })
    expect(screen.queryByRole('heading', { name: '월간 보고서' })).toBeNull()
    expect(screen.queryByRole('button', { name: '인쇄' })).toBeNull()
  })

  it('AC-6108.3: 비트에서 안 불러온 기기는 몇 번까지 받나·신환 1명당 매출 칸이 제목까지 없고, 차트번호는 화면 어디에도 없다', async () => {
    const { container } = drawMonthly()
    await waitFor(() => expect(screen.getByText('110,000,000원')).toBeTruthy())
    const titles = within(paperEl())
      .getAllByRole('heading', { level: 5 })
      .map((h) => h.textContent)
    expect(titles).toContain('예약 빈자리 (최근 8주)')
    expect(titles).not.toContain('몇 번까지 받나')
    expect(titles).not.toContain('신환 1명당 매출')
    expect(container.textContent).not.toContain(CHART)
  })
})

// ── clinic-profile: 보고 받는 사람 글의 호칭·통계 틀이 병원 정보를 칸마다 넘김 (REQ-6606 AC-6606.1~6606.3, design.md 8절) ──
describe('AC-6606.3: 보고 문장 칸 제목의 호칭', () => {
  it("AC-6606.3: 호칭을 주면 제목이 '{호칭} 보고 문장'이고, 주지 않으면 '원장님 보고 문장'이다", () => {
    render(<ReportSection report={data()} hospitalName={HOSPITAL} today={TODAY} saved honorific="대표원장님" />)
    expect(screen.getByRole('heading', { level: 2, name: '대표원장님 보고 문장' })).toBeTruthy()
    expect(screen.queryByText('원장님 보고 문장')).toBeNull()
    cleanup()
    draw(data())
    expect(screen.getByRole('heading', { level: 2, name: '원장님 보고 문장' })).toBeTruthy()
  })

  it('AC-6606.3: 저장된 숫자가 없을 때 제목도 호칭이다', () => {
    render(<ReportSection report={null} hospitalName={HOSPITAL} today={TODAY} saved={false} honorific="선생님" />)
    expect(screen.getByRole('heading', { level: 2, name: '선생님 보고 문장' })).toBeTruthy()
  })
})

describe('AC-6606.1·AC-6606.2·AC-6606.3: 통계 틀이 병원 정보(useClinicProfile)를 한 번 읽어 칸마다 넘긴다', () => {
  const GROUPS: StatsRxGroupsView = { state: 'ready', groups: [], suggested: false, saving: false, saveFailed: false, reread: () => undefined, save: async () => true, forLoad: async () => [] }
  const MIX: PatientMix = { total: { people: 10, visits: 12 }, compared: false, age: [], insurance: [], city: [], town: [] }
  const filled = (...values: number[]) => [...values, ...Array<number>(VISIT_HOURS.length - values.length).fill(0)]
  const BIT: BitSectionsView = {
    kind: 'ready',
    mix: { all: MIX, new: MIX },
    hours: {
      hours: [...VISIT_HOURS],
      rows: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, openDays: 1, cells: filled(2, 3) })),
      unknown: 0,
      peak: { weekday: 1, hour: 9, average: 3 },
    },
    doctors: { kind: 'single' },
  }
  const profileView = (over: { state?: ClinicProfileView['state']; saved?: boolean; honorific?: Honorific; closedDates?: string[] } = {}): ClinicProfileView => ({
    state: over.state ?? 'ready',
    profile: { displayName: null, phone: null, address: null, honorific: over.honorific ?? '원장님', hours: [...DEFAULT_HOURS], closedDates: over.closedDates ?? [], staff: [], logoPath: null, emr: 'bit' },
    saved: over.saved ?? true,
    signupName: HOSPITAL,
    signupPhone: null,
    name: HOSPITAL,
    logoDataUrl: null,
    reload: () => undefined,
  })
  // 2026-11-02(월) ~ 11-12(목) 문 연 날(일요일 빼고), 11/11(수)은 병원 휴진일이라 줄이 없다
  const holidayDay = (ymd: string, patients: number): DayPayload => ({
    schemaVersion: 2,
    quality: 'valid',
    day: ymd,
    partial: false,
    totals: { patients, newPatients: 0, returning: patients, unknown: 0 },
    rx: [],
    groups: [],
    revisit: { cohort: 0, within7: null, within14: null },
  })
  const WIDE_DAYS = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-09', '2026-11-10', '2026-11-12'].map((ymd) =>
    holidayDay(ymd, 90),
  )
  const drawStats = () =>
    render(
      <StatsSections
        input={{ days: [], covered: [], range: statsRange(TODAY, '30d') }}
        saved={false}
        split={null}
        report={null}
        hospitalName={HOSPITAL}
        groups={GROUPS}
        bit={BIT}
        wide={{ state: 'ready', days: WIDE_DAYS, retry: vi.fn() }}
      />,
    )
  const reportCard = () => document.getElementById('stats-report')!
  const holidayCells = () =>
    within(screen.getByRole('table', { name: '휴일에 따라 하루 평균 내원' }))
      .getAllByRole('row')
      .slice(1)
      .map((tr) => within(tr).getAllByRole('cell')[1]!.textContent)
  const hoursHead = () =>
    within(screen.getByRole('table', { name: '요일·시간마다 하루 평균 접수 (건)' }))
      .getAllByRole('columnheader')
      .slice(1)
      .map((th) => th.textContent)

  beforeEach(() => {
    vi.mocked(loadGoal).mockReset()
    vi.mocked(loadGoal).mockResolvedValue({ visits: null, newPatients: null, revenue: null })
    revenueStore.loadDays.mockReset()
    revenueStore.loadDays.mockResolvedValue([])
  })

  it("AC-6606.3: 보고 카드 제목(h2)이 '{호칭} 보고 문장' 하나다(같은 제목 칸 규칙 그대로)", () => {
    clinic.view = profileView({ honorific: '선생님' })
    drawStats()
    expect(within(reportCard()).getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['선생님 보고 문장'])
    expect(within(reportCard()).queryByRole('heading', { level: 3, name: '선생님 보고 문장' })).toBeNull()
  })

  it('AC-6606.1: 저장된 진료시간으로 시간대별 접수를 접고 휴진 요일 줄을 뺀다', () => {
    clinic.view = profileView()
    drawStats()
    expect(hoursHead()).toEqual(['9시', '10시', '11시', '12시', '13시', '14시', '15시', '16시', '17시'])
    expect(screen.getByText('9시~17시, 그 밖의 접수는 맨 앞·맨 뒤 칸에 더했어요')).toBeTruthy()
  })

  it('AC-6606.2: 병원 휴진일을 휴일에 따라 칸에 넘긴다', () => {
    clinic.view = profileView({ closedDates: ['2026-11-11'] })
    drawStats()
    expect(holidayCells()).toEqual(['7일', '1일', '1일'])
  })

  it.each<[string, ClinicProfileView]>([
    ['읽는 중', profileView({ state: 'loading', saved: false })],
    ['읽기 실패', profileView({ state: 'failed', saved: false })],
    ['병원 정보 줄 없음', profileView({ saved: false })],
  ])('AC-6606.1·AC-6606.3: %s이면 지금처럼 원장님 · 8시~20시 칸이다', (_name, view) => {
    clinic.view = view
    drawStats()
    expect(within(reportCard()).getByRole('heading', { level: 2, name: '원장님 보고 문장' })).toBeTruthy()
    expect(hoursHead()).toEqual(VISIT_HOURS.map((hour) => `${hour}시`))
  })
})
