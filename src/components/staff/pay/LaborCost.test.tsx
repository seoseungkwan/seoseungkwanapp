// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { PayMonth } from '@/types/staff'
import { payDb, renderPay } from './payTestKit'

// '인건비' 칸 (staff AC-7615.9, 시안 pay.html ⑦). 가짜 저장 층 · 2026년 11월(10월 줄·병원 부담분, 6~11월 매출 — 8월 없음)

afterEach(cleanup)

const tile = (label: string) => screen.getByRole('group', { name: label })
const cells = (tr: Element) => [...tr.querySelectorAll('th, td')].map((c) => c.textContent?.trim() ?? '')
const svgTexts = (svg: Element) => [...svg.querySelectorAll('text')].map((t) => t.textContent)
const svgTitles = (svg: Element) => [...svg.querySelectorAll('title')].map((t) => t.textContent)
const ready = () => screen.findByRole('table', { name: '사람별 지급 합계 표' })

describe('AC-7615.9: 인건비', () => {
  it('AC-7615.9: 숫자 칸 셋(지급 합계·병원 부담분·매출 대비 인건비)이 보인다', async () => {
    renderPay({ part: 'cost' })
    await ready()
    expect(within(tile('지급 합계')).getByText('18,615,000원')).toBeTruthy()
    expect(within(tile('지급 합계')).getByText('6명 · 10월보다 145,000원 많아요')).toBeTruthy()
    expect(within(tile('병원 부담분')).getByText('2,150,000원')).toBeTruthy()
    expect(within(tile('병원 부담분')).getByText('세무사가 알려준 금액')).toBeTruthy()
    await waitFor(() => expect(within(tile('매출 대비 인건비')).getByText('17.5%')).toBeTruthy())
    expect(within(tile('매출 대비 인건비')).getByText('인건비 20,765,000원 ÷ 매출 118,400,000원')).toBeTruthy()
  })

  it('AC-7615.9: 지난달보다 적거나 같으면 그 말이고, 매출이 없으면 "매출 자료 없음"이다', async () => {
    const db = payDb({ revenue: [] })
    db.lines = db.lines.map((l) => (l.id === 'n-lee' ? { ...l, amounts: { ...l.amounts, base: 2_900_000 } } : l))
    renderPay({ db, part: 'cost' })
    await ready()
    expect(within(tile('지급 합계')).getByText('6명 · 10월보다 55,000원 적어요')).toBeTruthy()
    await waitFor(() => expect(within(tile('매출 대비 인건비')).getByText('매출 자료 없음')).toBeTruthy())
    cleanup()
    const same = payDb()
    same.lines = same.lines.filter((l) => l.month !== '2026-10').flatMap((l) => [l, { ...l, id: `${l.id}-o`, month: '2026-10' }])
    renderPay({ db: same, part: 'cost' })
    await ready()
    expect(within(tile('지급 합계')).getByText('6명 · 10월과 같아요')).toBeTruthy()
  })

  it('AC-7615.9: 병원 부담분 칸 — 설명·값·원·[저장]·저장한 날, 고쳐 저장하면 숫자가 바뀐다', async () => {
    const { callsOf } = renderPay({ part: 'cost' })
    await ready()
    expect(screen.getByText('병원 부담분 (11월)')).toBeTruthy()
    expect(screen.getByText('세무사가 알려준 이달 병원 몫 세금·보험료')).toBeTruthy()
    const input = screen.getByRole('textbox', { name: '병원 부담분 (11월)' }) as HTMLInputElement
    expect(input.value).toBe('2,150,000')
    expect(screen.getByText('✓ 11월 20일 저장함')).toBeTruthy()
    fireEvent.change(input, { target: { value: '2,200,000' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '저장' }))
    })
    await waitFor(() => expect(callsOf('savePayMonth')).toHaveLength(1))
    expect(callsOf('savePayMonth')[0][0] as PayMonth).toEqual({ month: '2026-11', employerCost: 2_200_000, costSavedOn: '2026-11-21', copiedOn: '2026-11-02' })
    expect(await screen.findByText('✓ 11월 21일 저장함')).toBeTruthy()
    expect(within(tile('병원 부담분')).getByText('2,200,000원')).toBeTruthy()
  })

  it('AC-7615.9: 병원 부담분 저장이 실패하면 E-STAFF-SAVE-FAILED가 보이고 값은 남는다', async () => {
    const db = payDb()
    db.failing.add('savePayMonth')
    renderPay({ db, part: 'cost' })
    await ready()
    const input = screen.getByRole('textbox', { name: '병원 부담분 (11월)' }) as HTMLInputElement
    fireEvent.change(input, { target: { value: '2300000' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '저장' }))
    })
    expect(await screen.findByText('오류 번호 E-STAFF-SAVE-FAILED')).toBeTruthy()
    expect(input.value).toBe('2300000')
  })

  it('AC-7615.9: 위 그림은 6달 쌓은 막대 — 보는 달 숫자만 그림에 적고, 달마다 마우스를 올리면 계산이 보인다', async () => {
    renderPay({ part: 'cost' })
    await ready()
    expect(screen.getByRole('heading', { name: '인건비 · 6~11월' })).toBeTruthy()
    const bars = screen.getByRole('img', { name: '6월부터 11월까지 인건비 막대' })
    expect(bars.getAttribute('viewBox')).toBe('0 0 960 232')
    expect(svgTitles(bars)).toContain('11월 인건비 20,765,000원 (지급 합계 18,615,000원 + 병원 부담분 2,150,000원)')
    expect(svgTitles(bars)).toContain('10월 인건비 20,600,000원 (지급 합계 18,470,000원 + 병원 부담분 2,130,000원)')
    expect(svgTexts(bars)).toContain('20,765,000원')
    expect(svgTexts(bars)).not.toContain('20,600,000원')
    expect(svgTexts(bars).filter((t) => /^\d+월$/.test(t ?? ''))).toEqual(['6월', '7월', '8월', '9월', '10월', '11월'])
    expect(screen.getAllByText('지급 합계').length).toBeGreaterThan(1)
  })

  it('AC-7615.9: 아래 그림은 매출 대비 % 선 — 매출 없는 달은 "매출 자료 없음", 점마다 계산 글', async () => {
    renderPay({ part: 'cost' })
    await ready()
    expect(screen.getByRole('heading', { name: '매출 대비 인건비 %' })).toBeTruthy()
    expect(screen.getByText('점에 마우스를 올리면 계산이 보여요')).toBeTruthy()
    const line = screen.getByRole('img', { name: '6월부터 11월까지 매출 대비 인건비 비율 선' })
    await waitFor(() => expect(svgTitles(line)).toContain('11월 매출 대비 17.5% (인건비 20,765,000원 ÷ 매출 118,400,000원)'))
    expect(svgTitles(line)).toContain('10월 매출 대비 16.9% (인건비 20,600,000원 ÷ 매출 121,900,000원)')
    expect(svgTexts(line)).toContain('매출 자료 없음')
    expect(svgTexts(line)).toContain('17.5%')
    expect(svgTexts(line)).not.toContain('16.9%')
  })

  it('AC-7615.9: [달별 숫자 표로 보기] 표 — 지급 합계·병원 부담분·인건비·매출·매출 대비', async () => {
    renderPay({ part: 'cost' })
    await ready()
    expect(screen.getByText('달별 숫자 표로 보기')).toBeTruthy()
    const t = screen.getByRole('table', { name: '달별 인건비 표' })
    await waitFor(() => expect(cells(t.querySelectorAll('tbody tr')[3])).toEqual(['매출', '112,300,000', '120,500,000', '매출 자료 없음', '115,800,000', '121,900,000', '118,400,000']))
    const r = [...t.querySelectorAll('tr')].map(cells)
    expect(r[0]).toEqual(['', '6월', '7월', '8월', '9월', '10월', '11월'])
    expect(r[1]).toEqual(['지급 합계', '0', '0', '0', '0', '18,470,000', '18,615,000'])
    expect(r[2]).toEqual(['병원 부담분', '0', '0', '0', '0', '2,130,000', '2,150,000'])
    expect(r[3]).toEqual(['인건비', '0', '0', '0', '0', '20,600,000', '20,765,000'])
    expect(r[5]).toEqual(['매출 대비', '0.0%', '0.0%', '–', '0.0%', '16.9%', '17.5%'])
  })

  it('AC-7615.9: 사람별 · 11월 지급 합계 표 — 그중 인센티브·10월보다(같음·+·−)·합계', async () => {
    renderPay({ part: 'cost' })
    const t = await ready()
    expect(screen.getByRole('heading', { name: '사람별 · 11월 지급 합계' })).toBeTruthy()
    expect(cells(t.querySelector('thead tr')!)).toEqual(['이름', '직종 · 근무 형태', '11월 지급 합계 (원)', '그중 인센티브', '10월보다'])
    expect([...t.querySelectorAll('tbody tr')].map(cells)).toEqual([
      ['최민준', '방사선사 · 정규직', '3,810,000', '–', '+90,000'],
      ['김하늘', '간호조무사 · 정규직', '3,200,000', '100,000', '같음'],
      ['이도윤', '물리치료사 · 정규직', '4,000,000', '580,000', '−40,000'],
      ['정유나', '원무 · 파트타임', '1,570,000', '–', '같음'],
      ['박서연', '물리치료사 · 정규직', '3,385,000', '315,000', '+95,000'],
      ['한지우', '원무 · 계약직', '2,650,000', '–', '같음'],
    ])
    expect(cells(t.querySelector('tfoot tr')!)).toEqual(['합계 (6명)', '', '18,615,000', '995,000', '+145,000'])
  })
})
