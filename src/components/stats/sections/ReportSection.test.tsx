// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatClinicReport } from '@/lib/clinicReport/reportText'
import type { ClinicReportMode, ClinicReportNumbers } from '@/types/clinicReport'
import { ReportSection, type PickReport, type ReportData } from './ReportSection'

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

describe("AC-513.6: '확인 필요' 줄", () => {
  const UNCONFIRMED = numbers('2026-11-12', { financeUnconfirmed: true, financeUnconfirmedReason: '가짜 사유' })

  it("AC-513.6: 금액 줄은 '확인 필요' 글자 + warning 색이고 다른 줄은 아니다", () => {
    draw(data({ daily: [DAILY[0]!, UNCONFIRMED] }))
    pick('어제 일일보고')
    const { text, unconfirmedLines } = textOf('daily', UNCONFIRMED)
    expect(unconfirmedLines.length).toBeGreaterThan(0)
    const lines = Array.from(reportBox().children)
    expect(lines.map((line) => line.textContent)).toEqual(text.split('\n'))
    lines.forEach((line, i) => {
      if (unconfirmedLines.includes(i)) {
        expect(line.textContent).toContain('확인 필요')
        expect(line.className).toContain('bg-warning-soft')
        expect(line.className).toContain('text-warning')
      } else {
        expect(line.className).not.toContain('bg-warning-soft')
      }
    })
  })

  it('AC-513.6: 날짜 줄에 "금액 확인 필요"가 붙고 [복사]는 그대로 된다', () => {
    draw(data({ daily: [DAILY[0]!, UNCONFIRMED] }))
    pick('어제 일일보고')
    expect(screen.getByText('11월 12일 목요일 · 금액 확인 필요')).toBeTruthy()
    expect(screen.getByRole('button', { name: '복사' }).getAttribute('aria-disabled')).toBeNull()
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
