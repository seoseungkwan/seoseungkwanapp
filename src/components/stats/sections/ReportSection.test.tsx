// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatClinicReport } from '@/lib/clinicReport/reportText'
import type { ClinicReportMode, ClinicReportNumbers } from '@/types/clinicReport'
import { ReportSection, type ReportData } from './ReportSection'

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
const reportBox = () => screen.getByText('고생하셨습니다 !!').parentElement!
const shownLines = () => Array.from(reportBox().children).map((line) => line.textContent)

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
  it('AC-513.6: 글자로만 그리고 줄바꿈·띄어쓰기를 그대로 두며 canvas 칸이다', () => {
    draw(data())
    expect(reportBox().className).toContain('bg-canvas')
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
