// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStaffBase } from '@/components/staff/useStaffBase'
import { StaffStoreError } from '@/lib/storage/staff'
import { LEAVES, TODAY, leave, makeBase } from './testData'
import { LeaveScreen } from './LeaveScreen'

// 휴가 넣기·고치기 칸 (staff AC-7614.3, 시안 leave.html ③). 화면(LeaveScreen)을 그려 [휴가 넣기]·달력 칩으로 연다.
// 공용 읽기 훅만 흉내 낸다 — 남은 연차는 진짜 연차 셈(leaveStatus), 여러 날은 진짜 근무표 셈(expandLeave)으로 센다.
// 보기 기본 근무: 이도윤 월~금 + 토 2·4주, 김하늘 월~금 + 토 매주, 일요일 휴진(병원 정보 기본 진료시간)

vi.mock('@/components/staff/useStaffBase', () => ({ useStaffBase: vi.fn() }))

afterEach(cleanup)
beforeEach(() => vi.mocked(useStaffBase).mockReset())

type Base = ReturnType<typeof makeBase>
const flat = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()

async function openEditor(next: Base = makeBase()) {
  vi.mocked(useStaffBase).mockReturnValue(next as never)
  render(<LeaveScreen today={TODAY} />)
  await screen.findByRole('table', { name: '연차 현황' })
  fireEvent.click(screen.getByRole('button', { name: '휴가 넣기' }))
  const dialog = screen.getByRole('dialog', { name: '휴가 넣기' })
  const q = within(dialog)
  return {
    base: next,
    dialog,
    q,
    pick: (id: string) => fireEvent.change(q.getByRole('combobox', { name: '사람' }), { target: { value: id } }),
    kind: (name: string) => fireEvent.click(q.getByRole('button', { name })),
    day: (value: string) => fireEvent.change(q.getByLabelText('날짜'), { target: { value } }),
    range: (from: string, to: string) => {
      fireEvent.click(q.getByRole('button', { name: '여러 날 (시작~끝)' }))
      fireEvent.change(q.getByLabelText('시작 날짜'), { target: { value: from } })
      fireEvent.change(q.getByLabelText('끝 날짜'), { target: { value: to } })
    },
    preview: () => flat(q.getByRole('region', { name: '미리 보기' })),
    save: () => q.getByRole('button', { name: '저장' }) as HTMLButtonElement,
  }
}

describe('AC-7614.3: 휴가 넣기 칸 모양', () => {
  it('AC-7614.3: 휴가 넣기 ×, 사람(재직자만)·종류 여섯·날짜 하루/여러 날·메모·[저장]·[취소]', async () => {
    const { q } = await openEditor()
    expect(q.getByRole('button', { name: '닫기' }).textContent).toBe('×')
    const people = q.getByRole('combobox', { name: '사람' }) as HTMLSelectElement
    expect([...people.options].map((o) => o.textContent)).toEqual([
      '사람을 고르세요',
      '최민준 · 방사선사',
      '김하늘 · 간호조무사',
      '이도윤 · 물리치료사',
      '정유나 · 원무',
      '박서연 · 물리치료사',
      '한지우 · 원무',
    ])
    const kinds = q.getByRole('group', { name: '종류' })
    expect(within(kinds).getAllByRole('button').map(flat)).toEqual(['연차', '반차', '경조사', '병가', '출산·육아휴직', '무급(결근)'])
    expect(q.getByRole('button', { name: '연차' }).getAttribute('aria-pressed')).toBe('true')
    const when = q.getByRole('group', { name: '하루·여러 날' })
    expect(within(when).getAllByRole('button').map(flat)).toEqual(['하루', '여러 날 (시작~끝)'])
    expect(q.getByRole('button', { name: '하루' }).getAttribute('aria-pressed')).toBe('true')
    expect((q.getByLabelText('날짜') as HTMLInputElement).value).toBe(TODAY)
    expect(q.getByLabelText('메모')).toBeTruthy()
    expect(q.getByRole('button', { name: '저장' })).toBeTruthy()
    expect(q.getByRole('button', { name: '취소' })).toBeTruthy()
  })

  it('AC-7614.3: 사람을 고르기 전에는 [저장]이 막힌다', async () => {
    const { save } = await openEditor()
    expect(save().disabled).toBe(true)
  })

  it('AC-7614.3: [취소]·×·Esc는 저장하지 않고 닫는다', async () => {
    const { q, base } = await openEditor()
    fireEvent.click(q.getByRole('button', { name: '취소' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '휴가 넣기' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '닫기' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '휴가 넣기' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(base.store.addLeaveGroup).not.toHaveBeenCalled()
  })
})

describe('AC-7614.3: 미리 보기 줄', () => {
  it('AC-7614.3: 연차 — 이도윤 님 남은 연차 10일 → 9일, 이어진 사람 안내와 그날 예약 경고(AC-7610.5)', async () => {
    const next = makeBase()
    next.store.countAppts.mockResolvedValue([{ day: '2026-11-28', count: 3 }])
    const { q, pick, day, preview } = await openEditor(next)
    pick('m-lee')
    day('2026-11-28')
    expect(preview()).toBe('이도윤 님 남은 연차 10일 → 9일')
    expect(q.getByText("예약 달력에 '휴무'로 보여요.")).toBeTruthy()
    expect(q.getByText('(예약 시행자 (이) 이도윤과 이어져 있어요)')).toBeTruthy()
    expect(await q.findByText('11-28에 이도윤 님 예약이 3건 있어요. 예약은 그대로 두고 휴무만 표시해요.')).toBeTruthy()
    expect(next.store.countAppts).toHaveBeenLastCalledWith('cal-lee', ['2026-11-28'])
  })

  it('AC-7614.3: 반차 — [오전]·[오후], → 9.5일, 예약 달력에 그날 오후만 휴무', async () => {
    const { q, pick, kind, day, preview } = await openEditor()
    pick('m-lee')
    day('2026-11-27')
    kind('반차')
    const part = q.getByRole('group', { name: '오전·오후' })
    expect(within(part).getAllByRole('button').map(flat)).toEqual(['오전', '오후'])
    expect(q.getByRole('button', { name: '오전' }).getAttribute('aria-pressed')).toBe('true')
    expect(q.getByText("예약 달력에 그날 오전만 '휴무'로 보여요.")).toBeTruthy()
    fireEvent.click(q.getByRole('button', { name: '오후' }))
    expect(preview()).toBe('이도윤 님 남은 연차 10일 → 9.5일')
    expect(q.getByText("예약 달력에 그날 오후만 '휴무'로 보여요.")).toBeTruthy()
    expect(q.queryByText("예약 달력에 '휴무'로 보여요.")).toBeNull()
  })

  it('AC-7614.3: 병가 — [유급]·[무급](처음 유급), 연차에서 빼지 않아요 … 그대로 10일', async () => {
    const { q, pick, kind, day } = await openEditor()
    pick('m-lee')
    day('2026-11-27')
    kind('병가')
    expect(q.getByRole('button', { name: '유급' }).getAttribute('aria-pressed')).toBe('true')
    expect(q.getByRole('button', { name: '무급' }).getAttribute('aria-pressed')).toBe('false')
    expect(q.getByText('연차에서 빼지 않아요. 남은 연차는 그대로 10일이에요. 무급을 고르면 이달 세무사 자료에 무급 일수로 들어가요.')).toBeTruthy()
    expect(q.queryByRole('region', { name: '미리 보기' })).toBeNull()
  })

  it.each([
    ['경조사', '연차에서 빼지 않아요.'],
    ['출산·육아휴직', '연차에서 빼지 않아요.'],
    ['무급(결근)', '연차에서 빼지 않아요. 이달 세무사 자료에 무급 일수로 들어가요.'],
  ])('AC-7614.3: %s — %s', async (name, text) => {
    const { q, pick, kind, day } = await openEditor()
    pick('m-kim')
    day('2026-11-27')
    kind(name)
    expect(q.getByText(text)).toBeTruthy()
    expect(q.queryByRole('region', { name: '미리 보기' })).toBeNull()
  })

  it('AC-7614.3: 여러 날 — 쉬는 날 빼고 3일 · 남은 연차 10일 → 7일 (12-21 월 ~ 12-23 수)', async () => {
    const { q, pick, range, preview } = await openEditor()
    pick('m-lee')
    range('2026-12-21', '2026-12-23')
    expect(preview()).toBe('쉬는 날 빼고 3일 · 남은 연차 10일 → 7일')
    expect(q.getByText('그 사람 근무표에서 쉬는 요일·공휴일·휴진일은 세지 않아요.')).toBeTruthy()
  })

  it('AC-7605.6·AC-7614.3: 여러 날은 그 사람 근무표의 쉬는 토요일·휴진 일요일·공휴일을 뺀다', async () => {
    const { pick, range, preview } = await openEditor()
    pick('m-lee')
    range('2026-12-19', '2026-12-23') // 12-19 셋째 토(2·4주라 쉼) · 12-20 일 휴진
    expect(preview()).toBe('쉬는 날 빼고 3일 · 남은 연차 10일 → 7일')
    range('2026-12-24', '2026-12-26') // 12-25 성탄절 · 12-26 넷째 토(일함)
    expect(preview()).toBe('쉬는 날 빼고 2일 · 남은 연차 10일 → 8일')
  })

  it('AC-7614.3: 이어지지 않은 사람(김하늘)은 예약 안내·경고가 없고 예약 수를 세지 않는다', async () => {
    const { q, pick, day, preview, base } = await openEditor()
    pick('m-kim')
    day('2026-11-27')
    expect(preview()).toBe('김하늘 님 남은 연차 7.5일 → 6.5일')
    expect(q.queryByText(/예약 달력에/)).toBeNull()
    expect(base.store.countAppts).not.toHaveBeenCalled()
  })
})

describe('AC-7614.3: 저장을 막는 경우', () => {
  it("AC-7614.3: 펼친 날이 0이면 '휴가로 셀 날이 없어요.'(일요일 휴진)", async () => {
    const { q, pick, day, save } = await openEditor()
    pick('m-lee')
    day('2026-11-29')
    expect(q.getByText('휴가로 셀 날이 없어요.')).toBeTruthy()
    expect(save().disabled).toBe(true)
  })

  it("AC-7614.3: 이미 휴가인 날이 있으면 '{MM-DD}에 이미 휴가가 있어요.'", async () => {
    const { q, pick, day, range, save } = await openEditor()
    pick('m-kim')
    day('2026-11-07')
    expect(q.getByText('11-07에 이미 휴가가 있어요.')).toBeTruthy()
    expect(save().disabled).toBe(true)
    range('2026-11-02', '2026-11-09')
    expect(q.getByText('11-07에 이미 휴가가 있어요.')).toBeTruthy()
  })
})

describe('AC-7610.2·AC-7614.3: 저장', () => {
  it('AC-7614.3: 하루 연차를 저장하면 한 묶음으로 넣고 닫은 뒤 다시 읽어 표 숫자가 바뀐다(이도윤 쓴 7 · 남은 9)', async () => {
    const next = makeBase()
    const added = leave('m-lee', '2026-11-28', 'annual', { memo: '가족 행사' })
    next.store.listLeaves.mockResolvedValueOnce(LEAVES).mockResolvedValue([...LEAVES, added])
    const { q, pick, day, save } = await openEditor(next)
    pick('m-lee')
    day('2026-11-28')
    fireEvent.change(q.getByLabelText('메모'), { target: { value: '가족 행사' } })
    fireEvent.click(save())
    await waitFor(() =>
      expect(next.store.addLeaveGroup).toHaveBeenCalledWith([{ staffId: 'm-lee', day: '2026-11-28', kind: 'annual', part: null, paid: true, memo: '가족 행사' }]),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(next.store.listLeaves).toHaveBeenCalledTimes(2))
    const table = screen.getByRole('table', { name: '연차 현황' })
    const row = within(table)
      .getAllByRole('row')
      .find((r) => within(r).queryByRole('button', { name: '이도윤' }))!
    await waitFor(() => expect(within(row).getAllByRole('cell').slice(2, 5).map(flat)).toEqual(['16일', '7일', '9일']))
  })

  it('AC-7610.2: 여러 날은 펼친 날마다 한 줄씩 한 번에, 반차는 part, 병가 무급은 paid 거짓', async () => {
    const next = makeBase()
    const { q, pick, kind, range, save } = await openEditor(next)
    pick('m-lee')
    kind('반차')
    fireEvent.click(q.getByRole('button', { name: '오후' }))
    range('2026-12-21', '2026-12-22')
    fireEvent.click(save())
    await waitFor(() =>
      expect(next.store.addLeaveGroup).toHaveBeenCalledWith([
        { staffId: 'm-lee', day: '2026-12-21', kind: 'half', part: 'pm', paid: true, memo: null },
        { staffId: 'm-lee', day: '2026-12-22', kind: 'half', part: 'pm', paid: true, memo: null },
      ]),
    )
  })

  it('AC-7614.3: 병가 무급은 paid 거짓, 무급(결근)은 늘 paid 거짓', async () => {
    const next = makeBase()
    const { q, pick, kind, day, save } = await openEditor(next)
    pick('m-kim')
    day('2026-11-27')
    kind('병가')
    fireEvent.click(q.getByRole('button', { name: '무급' }))
    fireEvent.click(save())
    await waitFor(() =>
      expect(next.store.addLeaveGroup).toHaveBeenCalledWith([{ staffId: 'm-kim', day: '2026-11-27', kind: 'sick', part: null, paid: false, memo: null }]),
    )
  })

  it('AC-7614.3: 저장이 실패하면 칸은 열린 채 값이 남고 E-STAFF-SAVE-FAILED가 보인다', async () => {
    const next = makeBase()
    next.store.addLeaveGroup.mockRejectedValueOnce(new StaffStoreError('E-STAFF-SAVE-FAILED'))
    const { q, pick, day, save } = await openEditor(next)
    pick('m-lee')
    day('2026-11-27')
    fireEvent.click(save())
    expect(flat(await q.findByRole('alert'))).toContain('E-STAFF-SAVE-FAILED')
    expect((q.getByRole('combobox', { name: '사람' }) as HTMLSelectElement).value).toBe('m-lee')
    expect(next.store.listLeaves).toHaveBeenCalledTimes(1)
  })

  it('AC-7610.2: 칩에서 연 고치기를 저장하면 그 묶음을 바꾼다(지우고 다시 넣기)', async () => {
    const next = makeBase()
    vi.mocked(useStaffBase).mockReturnValue(next as never)
    render(<LeaveScreen today={TODAY} />)
    const cal = await screen.findByRole('region', { name: '휴가 달력' })
    fireEvent.click(within(cal).getByRole('button', { name: '박서연 오후 반차' }))
    const dialog = within(screen.getByRole('dialog', { name: '휴가 고치기' }))
    // 고치는 휴가가 든 날은 '이미 휴가'로 막지 않는다
    expect(dialog.queryByText(/이미 휴가가 있어요/)).toBeNull()
    expect(flat(dialog.getByRole('region', { name: '미리 보기' }))).toBe('박서연 님 남은 연차 12일 → 12일')
    fireEvent.click(dialog.getByRole('button', { name: '오전' }))
    fireEvent.click(dialog.getByRole('button', { name: '저장' }))
    const group = LEAVES.find((l) => l.staffId === 'm-park' && l.day === '2026-11-13')!.groupId
    await waitFor(() =>
      expect(next.store.replaceLeaveGroup).toHaveBeenCalledWith(group, [
        { staffId: 'm-park', day: '2026-11-13', kind: 'half', part: 'am', paid: true, memo: null },
      ]),
    )
    expect(next.store.addLeaveGroup).not.toHaveBeenCalled()
  })
})
