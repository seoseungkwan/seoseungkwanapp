// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { RuleDraft } from '@/lib/storage/staff'
import type { PayLine } from '@/types/staff'
import { payDb, renderPay } from './payTestKit'

// '인센티브' 칸 — 이달 실적·인센티브 규칙 (staff AC-7615.5·AC-7615.6, 시안 pay.html ②·③). 가짜 저장 층 · 2026년 11월

afterEach(cleanup)

const perfTable = () => screen.findByRole('table', { name: '인센티브 실적 표' })
const cells = (tr: Element) => [...tr.querySelectorAll('th, td')].map((c) => c.textContent?.trim() ?? '')
const box = (label: string) => screen.getByRole('textbox', { name: label }) as HTMLInputElement
const blurWith = async (input: HTMLInputElement, value: string) => {
  fireEvent.focus(input)
  fireEvent.change(input, { target: { value } })
  await act(async () => {
    fireEvent.blur(input)
  })
}

describe('AC-7615.5: 이달 실적 입력', () => {
  it('AC-7615.5: 제목·[인센티브 규칙 고치기]·안내·표 머리가 보인다', async () => {
    renderPay({ part: 'incentive' })
    const t = await perfTable()
    expect(screen.getByText('2026년 11월 실적')).toBeTruthy()
    expect(screen.getByRole('button', { name: '인센티브 규칙 고치기' })).toBeTruthy()
    expect(screen.getByText('건수·매출은 이달 숫자를 그대로 적어요(0 이상). 원 미만은 항목마다 버려요. 빼야 할 돈은 ① 표의 조정 칸에 적어요.')).toBeTruthy()
    expect(cells(t.querySelector('thead tr')!)).toEqual(['항목', '방식', '이달 실적 (적는 칸)', '계산', '인센티브 (원)'])
  })

  it('AC-7615.5: 사람마다 묶음 머리에 합계, 줄마다 방식·실적·계산·금액이 보인다(명단 차례)', async () => {
    renderPay({ part: 'incentive' })
    const t = await perfTable()
    const body = [...t.querySelectorAll('tbody tr')].map(cells)
    expect(body).toEqual([
      ['김하늘간호조무사', '100,000'],
      ['고정 수당', '고정 수당매달 100,000원', '적을 것 없음', '매달 같은 금액', '100,000'],
      ['이도윤물리치료사', '580,000'],
      ['도수치료 급여', '건당 정액1건에 5,000원', '건', '32건 × 5,000원', '160,000'],
      ['도수치료 비급여', '매출의 %매출의 10%', '원', '4,200,000원 × 10%', '420,000'],
      ['박서연물리치료사', '315,000'],
      ['도수치료 비급여', '매출의 %매출의 10%', '원', '3,150,000원 × 10%', '315,000'],
    ])
    expect(box('이도윤 도수치료 급여 건수').value).toBe('32')
    expect(box('이도윤 도수치료 비급여 매출').value).toBe('4,200,000')
    expect(box('이도윤 도수치료 급여 건수').dataset.filled).toBe('true')
    expect(cells(t.querySelector('tfoot tr')!)).toEqual(['합계 (3명)', '995,000'])
  })

  it('AC-7615.5: 표 칸마다 줄맞춤 클래스는 하나다 — 금액 칸(인센티브 (원))만 오른쪽, 나머지는 왼쪽', async () => {
    renderPay({ part: 'incentive' })
    const t = await perfTable()
    const align = (cell: Element) => cell.className.split(/\s+/).filter((c) => /^text-(left|center|right)$/.test(c))
    for (const tr of t.querySelectorAll('tr')) {
      const row = [...tr.querySelectorAll('th, td')]
      row.forEach((cell, i) => expect(align(cell), cell.textContent ?? '').toEqual([i === row.length - 1 ? 'text-right' : 'text-left']))
    }
  })

  it('AC-7615.5: 규칙이 없는 사람 줄과 [규칙 더하기], 노란 칸 안내가 보인다', async () => {
    renderPay({ part: 'incentive' })
    await perfTable()
    expect(screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === '인센티브 규칙이 없는 사람: 최민준 · 정유나 · 한지우')).toBeTruthy()
    expect(screen.getByRole('button', { name: '규칙 더하기' })).toBeTruthy()
    expect(screen.getByText('노란 칸 = 이달 적은 실적. 실적 칸은 지난달 숫자를 가져오지 않고 매달 새로 적어요(고정 수당은 적을 것 없음).')).toBeTruthy()
  })

  it('AC-7615.5: 실적 칸에서 나가면 저장되고 금액·합계가 바로 바뀐다. 0 이상 정수만 받는다', async () => {
    const { callsOf } = renderPay({ part: 'incentive' })
    const t = await perfTable()
    await blurWith(box('이도윤 도수치료 급여 건수'), '40')
    await waitFor(() => expect(callsOf('savePayLine')).toHaveLength(1))
    const saved = callsOf('savePayLine')[0][0] as PayLine
    expect(saved.staffId).toBe('lee')
    expect(saved.incentives.map((e) => [e.ruleId, e.count, e.sales])).toEqual([
      ['r-lee-1', 40, null],
      ['r-lee-2', null, 4_200_000],
    ])
    expect(screen.getByText('40건 × 5,000원')).toBeTruthy()
    expect(cells(t.querySelector('tfoot tr')!)).toEqual(['합계 (3명)', '1,035,000'])
    await blurWith(box('박서연 도수치료 비급여 매출'), '-5')
    expect(box('박서연 도수치료 비급여 매출').getAttribute('aria-invalid')).toBe('true')
    await blurWith(box('박서연 도수치료 비급여 매출'), '1.5')
    expect(callsOf('savePayLine')).toHaveLength(1)
  })

  it('AC-7615.5: 이달 급여 표의 인센티브 칸도 새 실적 합계다', async () => {
    renderPay({ part: 'incentive' })
    await perfTable()
    await blurWith(box('박서연 도수치료 비급여 매출'), '3,000,000')
    fireEvent.click(within(screen.getByRole('group', { name: '급여 안 메뉴' })).getByRole('button', { name: '이달 급여' }))
    expect((await screen.findByRole('button', { name: '박서연 인센티브 300,000원 — 이달 실적 보기' })).textContent).toBe('300,000 ›')
  })
})

describe('AC-7615.6: 인센티브 규칙 고치기', () => {
  const openRules = async (db = payDb()) => {
    const view = renderPay({ db, part: 'incentive' })
    await perfTable()
    fireEvent.click(screen.getByRole('button', { name: '인센티브 규칙 고치기' }))
    return view
  }
  const card = (name: string) => screen.getByRole('group', { name: `${name} 인센티브 규칙` })

  it('AC-7615.6: ‹ 이달 실적으로 · 제목 · 셈 안내 · 사람 카드(항목 수·줄)·규칙 없음 이름 단추·안내가 보인다', async () => {
    await openRules()
    expect(screen.getByRole('button', { name: '‹ 이달 실적으로' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '인센티브 규칙' })).toBeTruthy()
    expect(screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === '건당 정액 = 건수 × 금액 · 매출의 % = 매출 × % · 고정 수당 = 매달 같은 금액')).toBeTruthy()
    expect(within(card('이도윤')).getByText('항목 2개')).toBeTruthy()
    expect(within(card('이도윤')).getByText('물리치료사')).toBeTruthy()
    expect((within(card('이도윤')).getByRole('textbox', { name: '이도윤 1번째 항목 이름' }) as HTMLInputElement).value).toBe('도수치료 급여')
    expect((within(card('이도윤')).getByRole('combobox', { name: '이도윤 1번째 항목 방식' }) as HTMLSelectElement).value).toBe('per_case')
    expect((within(card('이도윤')).getByRole('textbox', { name: '이도윤 1번째 항목 값' }) as HTMLInputElement).value).toBe('5,000')
    expect((within(card('이도윤')).getByRole('textbox', { name: '이도윤 2번째 항목 값' }) as HTMLInputElement).value).toBe('10')
    expect(within(card('이도윤')).getAllByText('%')).toHaveLength(1)
    expect(within(card('이도윤')).getAllByRole('button', { name: '빼기' })).toHaveLength(2)
    expect(within(card('김하늘')).getByText('항목 1개')).toBeTruthy()
    const none = screen.getByRole('group', { name: '규칙 없음' })
    expect(within(none).getAllByRole('button').map((b) => b.textContent)).toEqual(['+ 최민준', '+ 정유나', '+ 한지우'])
    expect(within(none).getByText('이름을 누르면 그 사람 카드가 생기고 항목을 더할 수 있어요.')).toBeTruthy()
    expect(screen.getByText('금액·%를 고치면 지금 보는 달부터 새 값으로 계산하고, 지난 달 인센티브는 그때 금액 그대로 둬요.')).toBeTruthy()
  })

  it('AC-7615.6: 금액을 고치면 보는 달부터 저장한다(saveRules 그 사람·보는 달)', async () => {
    const { callsOf, db } = await openRules()
    await blurWith(within(card('이도윤')).getByRole('textbox', { name: '이도윤 1번째 항목 값' }) as HTMLInputElement, '6,000')
    await waitFor(() => expect(callsOf('saveRules')).toHaveLength(1))
    const [staffId, drafts, fromMonth] = callsOf('saveRules')[0] as [string, RuleDraft[], string]
    expect([staffId, fromMonth]).toEqual(['lee', '2026-11'])
    expect(drafts.map((d) => [d.id, d.name, d.method, d.unitAmount, d.percent])).toEqual([
      ['r-lee-1', '도수치료 급여', 'per_case', 6_000, null],
      ['r-lee-2', '도수치료 비급여', 'percent', null, 10],
    ])
    // 10월 줄은 그대로, 11월 줄은 새 금액(실적 32건은 그대로)
    expect(db.lines.find((l) => l.id === 'o-lee')?.incentives[0].unitAmount).toBe(5_000)
    expect(db.lines.find((l) => l.id === 'n-lee')?.incentives[0]).toMatchObject({ unitAmount: 6_000, count: 32 })
  })

  it('AC-7615.6: [+ 항목 더하기] → [넣기]로 새 규칙, [빼기]로 규칙을 뺀다. [그만두기]는 저장하지 않는다', async () => {
    const { callsOf } = await openRules()
    const park = card('박서연')
    fireEvent.click(within(park).getByRole('button', { name: '+ 항목 더하기' }))
    fireEvent.click(within(park).getByRole('button', { name: '그만두기' }))
    expect(callsOf('saveRules')).toHaveLength(0)
    fireEvent.click(within(park).getByRole('button', { name: '+ 항목 더하기' }))
    fireEvent.change(within(park).getByRole('textbox', { name: '박서연 새 항목 이름' }), { target: { value: '신장분사1' } })
    fireEvent.change(within(park).getByRole('combobox', { name: '박서연 새 항목 방식' }), { target: { value: 'per_case' } })
    fireEvent.change(within(park).getByRole('textbox', { name: '박서연 새 항목 값' }), { target: { value: '3000' } })
    await act(async () => {
      fireEvent.click(within(park).getByRole('button', { name: '넣기' }))
    })
    await waitFor(() => expect(callsOf('saveRules')).toHaveLength(1))
    const drafts = callsOf('saveRules')[0][1] as RuleDraft[]
    expect(drafts.map((d) => [d.name, d.method, d.unitAmount, d.percent])).toEqual([
      ['도수치료 비급여', 'percent', null, 10],
      ['신장분사1', 'per_case', 3_000, null],
    ])
    await waitFor(() => expect(within(card('박서연')).getByText('항목 2개')).toBeTruthy())
    await act(async () => {
      fireEvent.click(within(card('김하늘')).getByRole('button', { name: '빼기' }))
    })
    await waitFor(() => expect(callsOf('saveRules')).toHaveLength(2))
    expect(callsOf('saveRules')[1].slice(0, 2)).toEqual(['kim', []])
  })

  it('AC-7615.6: 규칙 없는 사람 이름을 누르면 카드가 생기고, 틀린 값(이름 없음·% 100 넘음)은 넣지 않는다', async () => {
    const { callsOf } = await openRules()
    fireEvent.click(screen.getByRole('button', { name: '+ 최민준' }))
    const choi = card('최민준')
    expect(within(choi).getByText('항목 0개')).toBeTruthy()
    fireEvent.click(within(choi).getByRole('button', { name: '+ 항목 더하기' }))
    fireEvent.click(within(choi).getByRole('button', { name: '넣기' }))
    expect(within(choi).getByText('항목 이름은 1~20자로 적어 주세요.')).toBeTruthy()
    fireEvent.change(within(choi).getByRole('textbox', { name: '최민준 새 항목 이름' }), { target: { value: '촬영' } })
    fireEvent.change(within(choi).getByRole('combobox', { name: '최민준 새 항목 방식' }), { target: { value: 'percent' } })
    fireEvent.change(within(choi).getByRole('textbox', { name: '최민준 새 항목 값' }), { target: { value: '120' } })
    fireEvent.click(within(choi).getByRole('button', { name: '넣기' }))
    expect(within(choi).getByText('%는 0~100, 소수 둘째 자리까지 적어 주세요.')).toBeTruthy()
    expect(callsOf('saveRules')).toHaveLength(0)
  })

  it('AC-7615.6: ‹ 이달 실적으로를 누르면 실적 표로 돌아가고 새 규칙이 실적 표에 보인다', async () => {
    await openRules()
    await blurWith(within(card('김하늘')).getByRole('textbox', { name: '김하늘 1번째 항목 값' }) as HTMLInputElement, '120000')
    fireEvent.click(screen.getByRole('button', { name: '‹ 이달 실적으로' }))
    const t = await perfTable()
    await waitFor(() => expect(within(t).getAllByText('120,000').length).toBeGreaterThan(0))
  })

  it('AC-7615.4: 규칙을 저장하는 동안은 이 창의 단추·칸이 막혀 [넣기]를 두 번 눌러도 규칙이 하나만 생긴다', async () => {
    const { callsOf, db } = await openRules()
    const park = card('박서연')
    fireEvent.click(within(park).getByRole('button', { name: '+ 항목 더하기' }))
    fireEvent.change(within(park).getByRole('textbox', { name: '박서연 새 항목 이름' }), { target: { value: '신장분사1' } })
    fireEvent.change(within(park).getByRole('textbox', { name: '박서연 새 항목 값' }), { target: { value: '3000' } })
    const put = within(park).getByRole('button', { name: '넣기' }) as HTMLButtonElement
    fireEvent.click(put)
    // 저장 중: 규칙 화면의 단추는 모두 막히고 글 칸은 읽기만, 방식 고르기는 막힌다
    const buttons = screen.getAllByRole('button') as HTMLButtonElement[]
    const editor = buttons.filter((b) => !b.closest('[aria-label="급여 안 메뉴"]'))
    expect(editor.filter((b) => !b.disabled).map((b) => b.textContent)).toEqual([])
    const lee = card('이도윤')
    expect((within(lee).getByRole('textbox', { name: '이도윤 1번째 항목 값' }) as HTMLInputElement).readOnly).toBe(true)
    expect((within(lee).getByRole('combobox', { name: '이도윤 1번째 항목 방식' }) as HTMLSelectElement).disabled).toBe(true)
    fireEvent.click(put)
    expect(callsOf('saveRules')).toHaveLength(1)
    await waitFor(() => expect(within(card('박서연')).getByText('항목 2개')).toBeTruthy())
    await waitFor(() => expect((within(card('이도윤')).getByRole('textbox', { name: '이도윤 1번째 항목 값' }) as HTMLInputElement).readOnly).toBe(false))
    expect(callsOf('saveRules')).toHaveLength(1)
    expect(db.rules.filter((rule) => rule.staffId === 'park').map((rule) => rule.name)).toEqual(['도수치료 비급여', '신장분사1'])
    expect(within(card('박서연')).getAllByRole('button', { name: '빼기' }).every((b) => !(b as HTMLButtonElement).disabled)).toBe(true)
  })

  it('AC-7615.4: 한 줄을 저장하는 동안 같은 사람의 다른 줄을 고쳐도 앞 저장을 덮어쓰지 않는다', async () => {
    const { callsOf, db } = await openRules()
    await blurWith(within(card('이도윤')).getByRole('textbox', { name: '이도윤 1번째 항목 값' }) as HTMLInputElement, '6,000')
    await waitFor(() => expect(callsOf('saveRules')).toHaveLength(1))
    await waitFor(() => expect((within(card('이도윤')).getByRole('textbox', { name: '이도윤 2번째 항목 값' }) as HTMLInputElement).readOnly).toBe(false))
    await blurWith(within(card('이도윤')).getByRole('textbox', { name: '이도윤 2번째 항목 값' }) as HTMLInputElement, '12')
    await waitFor(() => expect(callsOf('saveRules')).toHaveLength(2))
    const drafts = callsOf('saveRules')[1][1] as RuleDraft[]
    expect(drafts.map((d) => [d.id, d.unitAmount, d.percent])).toEqual([
      ['r-lee-1', 6_000, null],
      ['r-lee-2', null, 12],
    ])
    await waitFor(() => expect(db.rules.filter((rule) => rule.staffId === 'lee').map((rule) => rule.unitAmount ?? rule.percent)).toEqual([6_000, 12]))
  })

  it('AC-7615.6: 규칙 저장이 실패하면 E-STAFF-SAVE-FAILED가 보인다', async () => {
    const db = payDb()
    db.failing.add('saveRules')
    await openRules(db)
    await blurWith(within(card('이도윤')).getByRole('textbox', { name: '이도윤 2번째 항목 값' }) as HTMLInputElement, '12')
    expect(await screen.findByText('오류 번호 E-STAFF-SAVE-FAILED')).toBeTruthy()
  })
})
