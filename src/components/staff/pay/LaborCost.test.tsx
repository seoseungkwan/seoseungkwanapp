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
    // 8월은 급여 줄은 있고 매출 자료가 없다
    const db = payDb()
    db.lines.push({ id: 'a-kim', month: '2026-08', staffId: 'kim', amounts: { base: 2_900_000 }, incentives: [], adjust: 0, adjustReason: null, adjustMemo: null })
    renderPay({ db, part: 'cost' })
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
    // 6~9월은 저장된 급여 줄이 하나도 없다 → 지급 합계·인건비·매출 대비는 '–'(0원·0%로 적지 않음)
    expect(r[1]).toEqual(['지급 합계', '–', '–', '–', '–', '18,470,000', '18,615,000'])
    expect(r[2]).toEqual(['병원 부담분', '0', '0', '0', '0', '2,130,000', '2,150,000'])
    expect(r[3]).toEqual(['인건비', '–', '–', '–', '–', '20,600,000', '20,765,000'])
    expect(r[5]).toEqual(['매출 대비', '–', '–', '–', '–', '16.9%', '17.5%'])
  })

  it('AC-7615.9: 저장된 급여 줄이 없는 달은 막대·% 점을 그리지 않고 비우며, 마우스를 올리면 "{M}월 급여 자료 없음"이다(선은 끊김)', async () => {
    renderPay({ part: 'cost' })
    await ready()
    const bars = screen.getByRole('img', { name: '6월부터 11월까지 인건비 막대' })
    const line = screen.getByRole('img', { name: '6월부터 11월까지 매출 대비 인건비 비율 선' })
    await waitFor(() => expect(svgTitles(line)).toContain('11월 매출 대비 17.5% (인건비 20,765,000원 ÷ 매출 118,400,000원)'))
    for (const m of ['6월', '7월', '8월', '9월']) {
      expect(svgTitles(bars), m).toContain(`${m} 급여 자료 없음`)
      expect(svgTitles(line), m).toContain(`${m} 급여 자료 없음`)
    }
    expect(svgTitles(bars).filter((t) => / 인건비 /.test(t ?? ''))).toHaveLength(2)
    // 막대는 10·11월 두 달(지급 합계 + 병원 부담분 조각)만, % 점도 두 개, 선은 10~11월 한 조각
    expect(bars.querySelectorAll('.fill-chart-4')).toHaveLength(2)
    expect(bars.querySelectorAll('.fill-chart-3')).toHaveLength(2)
    expect(line.querySelectorAll('circle')).toHaveLength(2)
    expect(line.querySelectorAll('path')).toHaveLength(1)
    // 0%·매출 자료 없음 글자로 채우지 않는다
    expect(svgTexts(line)).not.toContain('0.0%')
    expect(svgTexts(line)).not.toContain('매출 자료 없음')
  })

  it('AC-7615.9: 보는 달에 저장된 급여 줄이 없으면 그 달 자리도 비운다(12월, 고정 수당이 있어도)', async () => {
    renderPay({ part: 'cost', today: '2026-12-03' })
    await ready()
    const bars = screen.getByRole('img', { name: '7월부터 12월까지 인건비 막대' })
    expect(svgTitles(bars)).toContain('12월 급여 자료 없음')
    expect(bars.querySelectorAll('.fill-chart-4')).toHaveLength(2)
    const t = screen.getByRole('table', { name: '달별 인건비 표' })
    expect(cells(t.querySelectorAll('tbody tr')[0]).slice(-1)).toEqual(['–'])
    expect(cells(t.querySelectorAll('tbody tr')[2]).slice(-1)).toEqual(['–'])
  })

  it('AC-7615.9: 해를 넘는 6달은 "인건비 · 9월~2월"처럼 앞 달에도 월이 붙는다', async () => {
    renderPay({ part: 'cost', today: '2027-02-10' })
    await ready()
    expect(screen.getByRole('heading', { name: '인건비 · 9월~2월' })).toBeTruthy()
  })

  it('AC-7615.11: 줄을 저장하지 않은 재직자는 새 줄(고정 수당 포함)로 세어 지급 합계 = 이달 급여 합계, "{n}명"은 그달 재직자 수다', async () => {
    // 11월 김하늘 줄을 아직 저장하지 않음 → 새 줄 = 고정 수당 100,000원만
    const db = payDb()
    db.lines = db.lines.filter((l) => l.id !== 'n-kim')
    renderPay({ db, part: 'cost' })
    const t = await ready()
    expect(within(tile('지급 합계')).getByText('15,515,000원')).toBeTruthy()
    expect(within(tile('지급 합계')).getByText('6명 · 10월보다 2,955,000원 적어요')).toBeTruthy()
    expect(cells([...t.querySelectorAll('tbody tr')][1])).toEqual(['김하늘', '간호조무사 · 정규직', '100,000', '100,000', '−3,100,000'])
    expect(cells(t.querySelector('tfoot tr')!)).toEqual(['합계 (6명)', '', '15,515,000', '995,000', '−2,955,000'])
    const bars = screen.getByRole('img', { name: '6월부터 11월까지 인건비 막대' })
    expect(svgTitles(bars)).toContain('11월 인건비 17,665,000원 (지급 합계 15,515,000원 + 병원 부담분 2,150,000원)')
    // 이달 급여 표 합계 줄도 같다
    fireEvent.click(within(screen.getByRole('group', { name: '급여 안 메뉴' })).getByRole('button', { name: '이달 급여' }))
    const pay = await screen.findByRole('table', { name: '이달 급여 표' })
    expect(cells(pay.querySelector('tfoot tr')!).at(-1)).toBe('15,515,000')
  })

  it('AC-7615.11: 그달 재직자가 아닌 사람의 저장된 줄은 보는 달 지급 합계·"{n}명"에 들지 않는다', async () => {
    const db = payDb()
    // 퇴사자 오세린(2024-05 퇴사)의 11월 줄이 남아 있어도 11월 재직자 6명만 센다
    db.lines.push({ id: 'n-oh', month: '2026-11', staffId: 'oh', amounts: { base: 1_000_000 }, incentives: [], adjust: 0, adjustReason: null, adjustMemo: null })
    renderPay({ db, part: 'cost' })
    await ready()
    expect(within(tile('지급 합계')).getByText('18,615,000원')).toBeTruthy()
    expect(within(tile('지급 합계')).getByText('6명 · 10월보다 145,000원 많아요')).toBeTruthy()
  })

  it('AC-7615.9: 표 글자 줄맞춤은 시안대로 — 사람별 표 이름·직종·근무 형태 칸(머리 포함)과 합계 (6명)은 왼쪽, 숫자 칸만 오른쪽(칸마다 줄맞춤 클래스 하나)', async () => {
    renderPay({ part: 'cost' })
    const t = await ready()
    const align = (cell: Element) => cell.className.split(/\s+/).filter((c) => /^text-(left|center|right)$/.test(c))
    // 머리·사람 줄·합계 줄 모두 앞 두 칸(이름 · 직종 · 근무 형태 — 합계 줄은 '합계 (6명)'과 빈 칸)은 왼쪽
    for (const tr of t.querySelectorAll('tr')) {
      const row = [...tr.querySelectorAll('th, td')]
      row.forEach((cell, i) => expect(align(cell), `${cell.textContent} (${i})`).toEqual([i < 2 ? 'text-left' : 'text-right']))
    }
    const months = screen.getByRole('table', { name: '달별 인건비 표' })
    for (const tr of months.querySelectorAll('tbody tr')) {
      const row = [...tr.querySelectorAll('th, td')]
      row.forEach((cell, i) => expect(align(cell), cell.textContent ?? '').toEqual([i === 0 ? 'text-left' : 'text-right']))
    }
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
