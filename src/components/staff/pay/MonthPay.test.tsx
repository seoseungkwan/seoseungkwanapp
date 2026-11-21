// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { PayLine, PayMonth } from '@/types/staff'
import { payDb, renderPay } from './payTestKit'

// '이달 급여' 칸 (staff AC-7615.2·AC-7615.3·AC-7615.4, 시안 pay.html ①·④). 가짜 저장 층(payTestKit) · 2026년 11월

afterEach(cleanup)

const table = () => screen.findByRole('table', { name: '이달 급여 표' })
const rows = (t: HTMLElement) => within(t).getAllByRole('row')
const bodyRows = (t: HTMLElement) => [...t.querySelectorAll('tbody tr')] as HTMLElement[]
const rowOf = (t: HTMLElement, name: string) => bodyRows(t).find((tr) => tr.querySelector('th, td')?.textContent?.includes(name))!
const cells = (tr: HTMLElement) => [...tr.querySelectorAll('th, td')].map((c) => c.textContent?.trim() ?? '')
const amount = (label: string) => screen.getByRole('textbox', { name: label }) as HTMLInputElement
const blurWith = async (input: HTMLInputElement, value: string) => {
  fireEvent.focus(input)
  fireEvent.change(input, { target: { value } })
  await act(async () => {
    fireEvent.blur(input)
  })
}
const lastSaved = (callsOf: (n: string) => unknown[][]) => callsOf('savePayLine').at(-1)?.[0] as PayLine

describe('AC-7615.2: 이달 급여 표', () => {
  it('AC-7615.2: 단추 셋·안내·상태 줄(가져온 날·이달 입사·퇴사·바로 저장)이 보인다', async () => {
    renderPay()
    await table()
    for (const name of ['지난달 금액 가져오기', '항목 고치기', '엑셀 받기']) expect(screen.getByRole('button', { name })).toBeTruthy()
    expect(screen.getByText('금액은 실수령 기준으로 적어요. 세전 금액과 세금·4대보험은 세무사가 계산해요.')).toBeTruthy()
    expect(screen.getByText('10월 금액을 가져왔어요 · 11월 2일')).toBeTruthy()
    expect(screen.getByText('이달 입사 없음')).toBeTruthy()
    expect(screen.getByText('이달 퇴사 없음')).toBeTruthy()
    expect(screen.getByText('칸에서 나가면 바로 저장돼요. 언제든 다시 고칠 수 있어요.')).toBeTruthy()
  })

  it('AC-7615.2: 가져온 날이 없으면 그 줄이 없고, 이달 입사·퇴사 이름이 보인다', async () => {
    const db = payDb()
    db.months = db.months.filter((m) => m.month !== '2026-11')
    db.members = db.members.map((m) => (m.id === 'han' ? { ...m, hiredOn: '2026-11-03' } : m.id === 'jung' ? { ...m, leftOn: '2026-11-15' } : m))
    renderPay({ db })
    const t = await table()
    expect(screen.queryByText(/금액을 가져왔어요/)).toBeNull()
    expect(screen.getByText('이달 입사 한지우')).toBeTruthy()
    expect(screen.getByText('이달 퇴사 정유나')).toBeTruthy()
    expect(within(rowOf(t, '한지우')).getByText('11월 입사')).toBeTruthy()
    expect(within(rowOf(t, '정유나')).getByText('11월 퇴사')).toBeTruthy()
  })

  it('AC-7615.2: 머리는 이름 · 지급 항목(그달 보이는 항목) · 더 일한 시간(연장·야간·휴일) · 조정(±) · 합계 (원)이다', async () => {
    renderPay()
    const t = await table()
    const [group, items] = rows(t)
    expect(cells(group)).toEqual(['이름', '지급 항목 · 실수령 기준 (원)', '더 일한 시간 · 근무표에서 자동 (시간)', '조정(±)', '합계 (원)'])
    expect(cells(items)).toEqual(['기본급', '연장수당', '식대', '인센티브', '상여', '직책수당', '연장', '야간', '휴일'])
  })

  it('AC-7615.2: 줄은 그달 재직자만 명단 차례이고, 이름 아래 직종·근무 형태, 금액·인센티브·회색 시간·합계가 보인다', async () => {
    renderPay()
    const t = await table()
    expect(bodyRows(t).map((tr) => tr.querySelector('b')?.textContent)).toEqual(['최민준', '김하늘', '이도윤', '정유나', '박서연', '한지우'])
    const lee = rowOf(t, '이도윤')
    expect(within(lee).getByText('물리치료사 · 정규직')).toBeTruthy()
    expect(amount('이도윤 기본급').value).toBe('3,100,000')
    expect(amount('이도윤 연장수당').value).toBe('120,000')
    expect(amount('이도윤 상여').value).toBe('')
    expect(within(lee).getByRole('button', { name: '이도윤 인센티브 580,000원 — 이달 실적 보기' }).textContent).toBe('580,000 ›')
    expect(cells(lee).slice(-5)).toEqual(['4', '–', '–', '', '4,000,000'])
    expect(within(rowOf(t, '정유나')).getByText('원무 · 파트타임')).toBeTruthy()
    // 규칙이 없는 사람의 인센티브 칸
    expect(within(rowOf(t, '최민준')).getByRole('button', { name: '최민준 인센티브 없음 — 이달 실적 보기' }).textContent).toBe('– ›')
    expect(cells(rowOf(t, '최민준')).slice(-5)).toEqual(['–', '–', '4', '', '3,810,000'])
    expect(cells(rowOf(t, '박서연')).slice(-5)).toEqual(['2.5', '–', '–', '', '3,385,000'])
  })

  it('AC-7615.2: 맨 아래 합계 (6명) 줄은 항목·시간·조정·합계의 합이다', async () => {
    renderPay()
    const t = await table()
    const foot = t.querySelector('tfoot tr') as HTMLElement
    expect(cells(foot)).toEqual(['합계 (6명)', '16,000,000', '350,000', '1,120,000', '995,000', '0', '150,000', '6.5', '1', '4', '0', '18,615,000'])
  })

  it('AC-7615.2: 칸 뜻 안내와 합계 설명이 보인다. 지난달과 다른 칸은 바꾼 칸 표시다', async () => {
    renderPay()
    await table()
    expect(screen.getByText('10월에서 그대로 가져온 칸')).toBeTruthy()
    expect(screen.getByText('이달 바꾼 칸')).toBeTruthy()
    expect(screen.getByText('인센티브 — 실적으로 계산 (누르면 ② 이달 실적)')).toBeTruthy()
    expect(screen.getByText('근무표에서 자동 (여기서 못 고침)')).toBeTruthy()
    expect(screen.getByText(/11월은 입사·퇴사가 없어요\./)).toBeTruthy()
    expect(
      screen.getByText("합계 = 지급 항목 + 조정. 회색 '더 일한 시간'은 금액이 아니라서 합계에 안 들어가요(연장수당 금액은 원장님이 적어요). [급여 확정]·잠금 단추는 없어요."),
    ).toBeTruthy()
    expect(amount('이도윤 연장수당').dataset.changed).toBe('true')
    expect(amount('이도윤 기본급').dataset.changed).toBe('false')
    expect(screen.queryByRole('button', { name: /급여 확정/ })).toBeNull()
  })

  it('AC-7615.2: 인센티브 칸을 누르면 인센티브 칸(그달 실적)으로 간다', async () => {
    renderPay()
    await table()
    fireEvent.click(screen.getByRole('button', { name: '이도윤 인센티브 580,000원 — 이달 실적 보기' }))
    expect(screen.getByText('2026년 11월 실적')).toBeTruthy()
    expect(window.location.search).toBe('?part=incentive')
  })

  it('AC-7615.2: 금액 칸에서 나가면 그 줄 하나를 바로 저장하고 합계가 바뀐다', async () => {
    const { callsOf } = renderPay()
    const t = await table()
    await blurWith(amount('김하늘 상여'), '50,000')
    await waitFor(() => expect(callsOf('savePayLine')).toHaveLength(1))
    const saved = lastSaved(callsOf)
    expect(saved).toMatchObject({ month: '2026-11', staffId: 'kim', amounts: { base: 2_900_000, meal: 200_000, bonus: 50_000 } })
    expect(cells(rowOf(t, '김하늘')).at(-1)).toBe('3,250,000')
    expect(amount('김하늘 상여').value).toBe('50,000')
    // 값을 지우면 그 칸이 빠진다. 같은 값이면 저장하지 않는다
    await blurWith(amount('김하늘 상여'), '')
    await waitFor(() => expect(callsOf('savePayLine')).toHaveLength(2))
    expect(lastSaved(callsOf).amounts).toEqual({ base: 2_900_000, meal: 200_000 })
    await blurWith(amount('김하늘 식대'), '200,000')
    expect(callsOf('savePayLine')).toHaveLength(2)
  })

  it('AC-7615.2: 줄이 없던 사람(새 달)은 지금 규칙으로 새 줄을 만들어 저장한다', async () => {
    const { callsOf } = renderPay({ today: '2026-12-03' })
    await table()
    expect(amount('이도윤 기본급').value).toBe('')
    await blurWith(amount('이도윤 기본급'), '3100000')
    await waitFor(() => expect(callsOf('savePayLine')).toHaveLength(1))
    const saved = lastSaved(callsOf)
    expect(saved).toMatchObject({ id: null, month: '2026-12', staffId: 'lee', amounts: { base: 3_100_000 }, adjust: 0 })
    expect(saved.incentives.map((e) => [e.ruleId, e.count, e.sales])).toEqual([
      ['r-lee-1', null, null],
      ['r-lee-2', null, null],
    ])
  })

  it('AC-7615.2: 저장이 실패하면 값은 남고 E-STAFF-SAVE-FAILED가 보인다', async () => {
    const db = payDb()
    db.failing.add('savePayLine')
    renderPay({ db })
    await table()
    await blurWith(amount('한지우 상여'), '30000')
    expect(await screen.findByText('오류 번호 E-STAFF-SAVE-FAILED')).toBeTruthy()
    expect(amount('한지우 상여').value).toBe('30,000')
  })

  it('AC-7615.2: 숫자가 아닌 글은 저장하지 않고 칸이 틀림 표시다', async () => {
    const { callsOf } = renderPay()
    await table()
    await blurWith(amount('한지우 상여'), '삼만')
    expect(amount('한지우 상여').getAttribute('aria-invalid')).toBe('true')
    expect(callsOf('savePayLine')).toHaveLength(0)
  })

  it('AC-7615.2: 같은 줄을 저장하는 중에 또 고치면 끝난 뒤 한 번 더 저장한다(마지막 값)', async () => {
    const { callsOf, db } = renderPay()
    await table()
    await blurWith(amount('김하늘 상여'), '10000')
    await blurWith(amount('김하늘 직책수당'), '20000')
    await waitFor(() => expect(callsOf('savePayLine')).toHaveLength(2))
    expect(db.lines.find((l) => l.id === 'n-kim')?.amounts).toEqual({ base: 2_900_000, meal: 200_000, bonus: 10_000, pos: 20_000 })
  })

  it('AC-7615.2: [지난달 금액 가져오기]는 빈 금액 칸만 지난달 값으로 채우고 가져온 날을 적는다', async () => {
    const db = payDb()
    // 12월: 김하늘만 기본급을 미리 적어 둠
    db.lines.push({ id: 'd-kim', month: '2026-12', staffId: 'kim', amounts: { base: 3_000_000 }, incentives: [], adjust: 0, adjustReason: null, adjustMemo: null })
    const { callsOf } = renderPay({ db, today: '2026-12-03' })
    await table()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '지난달 금액 가져오기' }))
    })
    await waitFor(() => expect(callsOf('savePayMonth')).toHaveLength(1))
    expect((callsOf('savePayMonth')[0][0] as PayMonth).copiedOn).toBe('2026-12-03')
    await waitFor(() => expect(db.lines.filter((l) => l.month === '2026-12')).toHaveLength(6))
    const dec = (id: string) => db.lines.find((l) => l.month === '2026-12' && l.staffId === id)!
    expect(dec('kim').amounts).toEqual({ base: 3_000_000, meal: 200_000 })
    expect(dec('choi').amounts).toEqual({ base: 3_300_000, overtime: 160_000, meal: 200_000, pos: 150_000 })
    // 인센티브 실적·조정은 가져오지 않는다
    expect(dec('lee').incentives.map((e) => [e.count, e.sales])).toEqual([
      [null, null],
      [null, null],
    ])
    expect(await screen.findByText('11월 금액을 가져왔어요 · 12월 3일')).toBeTruthy()
    expect(amount('최민준 직책수당').value).toBe('150,000')
  })

  it('AC-7606.2: 합계가 0원보다 적어지면 저장하지 않고 까닭을 보인다', async () => {
    const { callsOf } = renderPay()
    const t = await table()
    fireEvent.click(within(rowOf(t, '정유나')).getByRole('button', { name: '정유나 조정(±)' }))
    const dialog = screen.getByRole('dialog', { name: '조정(±) · 정유나 · 11월' })
    fireEvent.click(within(dialog).getByRole('button', { name: '− 빼기' }))
    await blurWith(within(dialog).getByRole('textbox', { name: '조정 금액' }) as HTMLInputElement, '2000000')
    expect(screen.getByText('정유나 님 합계가 0원보다 적어요. 저장하지 않았어요.')).toBeTruthy()
    expect(callsOf('savePayLine')).toHaveLength(0)
  })
})

describe('AC-7615.3: 조정(±) 작은 창', () => {
  it('AC-7615.3: 조정 칸을 누르면 제목·[닫기]·더하기/빼기·금액·까닭 셋·짧은 글이 보인다', async () => {
    renderPay()
    const t = await table()
    fireEvent.click(within(rowOf(t, '한지우')).getByRole('button', { name: '한지우 조정(±)' }))
    const dialog = screen.getByRole('dialog', { name: '조정(±) · 한지우 · 11월' })
    expect(within(dialog).getByText('조정(±) · 한지우 · 11월')).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: '닫기' })).toBeTruthy()
    expect(within(dialog).getByText('더하거나 뺄 금액')).toBeTruthy()
    for (const name of ['+ 더하기', '− 빼기', '일할 계산', '공제', '기타']) expect(within(dialog).getByRole('button', { name })).toBeTruthy()
    expect(within(dialog).getByText('원')).toBeTruthy()
    expect(within(dialog).getByText('까닭')).toBeTruthy()
    expect(within(dialog).getByPlaceholderText('짧게 적어요 (예: 무급 1일 공제)')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: '닫기' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('AC-7615.3: 빼기 · 금액 · 까닭 · 글을 적으면 조정이 저장되고 합계·조정 칸이 바뀐다', async () => {
    const { callsOf } = renderPay()
    const t = await table()
    fireEvent.click(within(rowOf(t, '한지우')).getByRole('button', { name: '한지우 조정(±)' }))
    const dialog = screen.getByRole('dialog', { name: '조정(±) · 한지우 · 11월' })
    fireEvent.click(within(dialog).getByRole('button', { name: '− 빼기' }))
    expect(within(dialog).getByRole('button', { name: '− 빼기' }).getAttribute('aria-pressed')).toBe('true')
    await blurWith(within(dialog).getByRole('textbox', { name: '조정 금액' }) as HTMLInputElement, '100,000')
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: '공제' }))
    })
    await blurWith(within(dialog).getByPlaceholderText('짧게 적어요 (예: 무급 1일 공제)') as HTMLInputElement, '무급 1일 공제')
    await waitFor(() => expect(lastSaved(callsOf)).toMatchObject({ staffId: 'han', adjust: -100_000, adjustReason: 'deduct', adjustMemo: '무급 1일 공제' }))
    expect(cells(rowOf(t, '한지우')).slice(-2)).toEqual(['−100,000', '2,550,000'])
  })
})

describe('AC-7615.4: 지급 항목 고치기', () => {
  const open = async () => {
    await table()
    fireEvent.click(screen.getByRole('button', { name: '항목 고치기' }))
    return screen.getByRole('dialog', { name: '지급 항목 고치기' })
  }
  const itemRows = (dialog: HTMLElement) => within(dialog).getAllByRole('listitem')

  it('AC-7615.4: 줄마다 ▲▼·이름·기본/병원이 더함·실적으로 계산·[이름 고치기]·[빼기], 더하기 칸과 안내가 보인다', async () => {
    renderPay()
    const dialog = await open()
    expect(within(dialog).getByText('지급 항목 고치기')).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: '닫기' })).toBeTruthy()
    const items = itemRows(dialog)
    expect(items.map((li) => li.querySelector('[data-name]')?.textContent)).toEqual(['기본급', '연장수당', '식대', '인센티브', '상여', '직책수당'])
    expect(within(items[0]).getByText('기본')).toBeTruthy()
    expect(within(items[3]).getByText('실적으로 계산')).toBeTruthy()
    expect(within(items[5]).getByText('병원이 더함')).toBeTruthy()
    expect((within(items[0]).getByRole('button', { name: '기본급 위로' }) as HTMLButtonElement).disabled).toBe(true)
    expect((within(items[5]).getByRole('button', { name: '직책수당 아래로' }) as HTMLButtonElement).disabled).toBe(true)
    for (const li of items) {
      expect(within(li).getByRole('button', { name: '이름 고치기' })).toBeTruthy()
      expect(within(li).getByRole('button', { name: '빼기' })).toBeTruthy()
    }
    expect(within(dialog).getByPlaceholderText('새 항목 이름 (예: 자격수당)')).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: '+ 항목 더하기' })).toBeTruthy()
    expect(within(dialog).getByText('더 일한 시간(연장·야간·휴일)·조정(±)·합계는 늘 있는 칸이라 이 목록에 없어요.')).toBeTruthy()
  })

  it('AC-7615.4: 금액이 있었던 항목을 빼면 한 번 묻고, [빼기]면 보는 달부터 안 보인다(앞 달에는 남음)', async () => {
    const db = payDb()
    db.lines.push({ id: 's-kim', month: '2026-09', staffId: 'kim', amounts: { bonus: 300_000 }, incentives: [], adjust: 0, adjustReason: null, adjustMemo: null })
    const { callsOf } = renderPay({ db })
    const dialog = await open()
    await act(async () => {
      fireEvent.click(within(itemRows(dialog)[4]).getByRole('button', { name: '빼기' }))
    })
    const ask = await within(dialog).findByText((_, el) => el?.tagName === 'P' && (el.textContent ?? '').startsWith('상여를 뺄까요?'))
    expect(ask.textContent).toBe('상여를 뺄까요? 9월에 적은 금액이 있어요. 지난 달 기록은 그대로 남아요. 11월 표부터 이 칸이 안 보여요.')
    expect(within(dialog).getByRole('button', { name: '그만두기' })).toBeTruthy()
    await act(async () => {
      fireEvent.click(within(ask.parentElement as HTMLElement).getByRole('button', { name: '빼기' }))
    })
    await waitFor(() => expect(callsOf('saveSettings')).toHaveLength(1))
    expect(db.settings.payItems.find((i) => i.id === 'bonus')?.removedFrom).toBe('2026-11')
    const t = await table()
    await waitFor(() => expect(cells(rows(t)[1])).toEqual(['기본급', '연장수당', '식대', '인센티브', '직책수당', '연장', '야간', '휴일']))
    fireEvent.click(screen.getByRole('button', { name: '◀ 10월' }))
    await waitFor(() => expect(cells(rows(screen.getByRole('table', { name: '이달 급여 표' }))[1])).toContain('상여'))
  })

  it('AC-7615.4: 금액이 한 번도 없던 항목은 묻지 않고 바로 빠진다', async () => {
    const { db } = renderPay()
    const dialog = await open()
    await act(async () => {
      fireEvent.click(within(itemRows(dialog)[4]).getByRole('button', { name: '빼기' }))
    })
    await waitFor(() => expect(db.settings.payItems.find((i) => i.id === 'bonus')?.removedFrom).toBe('2026-11'))
    expect(within(dialog).queryByText(/뺄까요/)).toBeNull()
  })

  it('AC-7615.4: 새 항목을 더하고, 이름을 고치고, 차례를 바꾼다(10자·같은 이름 막음)', async () => {
    const { db } = renderPay()
    const dialog = await open()
    fireEvent.change(within(dialog).getByPlaceholderText('새 항목 이름 (예: 자격수당)'), { target: { value: '자격수당' } })
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: '+ 항목 더하기' }))
    })
    await waitFor(() => expect(db.settings.payItems.map((i) => i.name)).toEqual(['기본급', '연장수당', '식대', '인센티브', '상여', '직책수당', '자격수당']))
    expect(db.settings.payItems.at(-1)).toMatchObject({ kind: 'amount', base: false, removedFrom: null })
    // 같은 이름은 막는다
    fireEvent.change(within(dialog).getByPlaceholderText('새 항목 이름 (예: 자격수당)'), { target: { value: '식대' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '+ 항목 더하기' }))
    expect(await within(dialog).findByText('같은 이름의 항목이 있어요.')).toBeTruthy()
    expect((within(dialog).getByPlaceholderText('새 항목 이름 (예: 자격수당)') as HTMLInputElement).maxLength).toBe(10)
    // 이름 고치기
    const pos = await waitFor(() => itemRows(dialog).find((li) => li.querySelector('[data-name]')?.textContent === '직책수당')!)
    fireEvent.click(within(pos).getByRole('button', { name: '이름 고치기' }))
    const nameBox = within(pos).getByRole('textbox', { name: '항목 이름' })
    fireEvent.change(nameBox, { target: { value: '팀장수당' } })
    await act(async () => {
      fireEvent.click(within(pos).getByRole('button', { name: '확인' }))
    })
    await waitFor(() => expect(db.settings.payItems.find((i) => i.id === 'pos')?.name).toBe('팀장수당'))
    // 차례 바꾸기: 식대를 위로
    const meal = itemRows(dialog).find((li) => li.querySelector('[data-name]')?.textContent === '식대')!
    await act(async () => {
      fireEvent.click(within(meal).getByRole('button', { name: '식대 위로' }))
    })
    await waitFor(() => expect(db.settings.payItems.slice(0, 3).map((i) => i.name)).toEqual(['기본급', '식대', '연장수당']))
  })
})
