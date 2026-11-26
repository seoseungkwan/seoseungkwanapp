// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStaffBase } from '@/components/staff/useStaffBase'
import { StaffStoreError } from '@/lib/storage/staff'
import { LEAVES, TODAY, clinicProfile, fakeGcal, leave, makeBase } from './testData'
import { LeaveScreen } from './LeaveScreen'
import { useGcalOff } from './useGcalOff'

// 휴가 넣기·고치기 칸 (staff AC-7614.3, 시안 leave.html ③). 화면(LeaveScreen)을 그려 [휴가 넣기]·달력 칩으로 연다.
// 공용 읽기 훅만 흉내 낸다 — 남은 연차는 진짜 연차 셈(leaveStatus), 여러 날은 진짜 근무표 셈(expandLeave)으로 센다.
// 보기 기본 근무: 이도윤 월~금 + 토 2·4주, 김하늘 월~금 + 토 매주, 일요일 휴진(병원 정보 기본 진료시간)

vi.mock('@/components/staff/useStaffBase', () => ({ useStaffBase: vi.fn() }))
// 구글 캘린더 연결 읽기(google-link REQ-8537). 따로 정하지 않으면 잇지 않은 병원(null) — 위 시험들은 지금 글·동작 그대로다(AC-8537.3)
vi.mock('./useGcalOff', () => ({ useGcalOff: vi.fn(() => null) }))

afterEach(cleanup)
beforeEach(() => {
  vi.mocked(useStaffBase).mockReset()
  vi.mocked(useGcalOff).mockReset().mockReturnValue(null)
})

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

  it('AC-7614.3: 고치기(지우고 다시 넣기)가 중간에 실패하면 휴가를 다시 읽어 화면이 DB와 같아지고, 칸은 열린 채 E-STAFF-SAVE-FAILED', async () => {
    const next = makeBase()
    const target = LEAVES.find((l) => l.staffId === 'm-park' && l.day === '2026-11-13')!
    // 지우기는 됐고 다시 넣기가 실패한 DB: 그 묶음이 없다
    next.store.listLeaves.mockResolvedValueOnce(LEAVES).mockResolvedValue(LEAVES.filter((l) => l.groupId !== target.groupId))
    next.store.replaceLeaveGroup.mockRejectedValueOnce(new StaffStoreError('E-STAFF-SAVE-FAILED'))
    vi.mocked(useStaffBase).mockReturnValue(next as never)
    render(<LeaveScreen today={TODAY} />)
    const cal = await screen.findByRole('region', { name: '휴가 달력' })
    fireEvent.click(within(cal).getByRole('button', { name: '박서연 오후 반차' }))
    const dialog = screen.getByRole('dialog', { name: '휴가 고치기' })
    fireEvent.click(within(dialog).getByRole('button', { name: '오전' }))
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }))
    expect(flat(await within(dialog).findByRole('alert'))).toContain('E-STAFF-SAVE-FAILED')
    await waitFor(() => expect(next.store.listLeaves).toHaveBeenCalledTimes(2))
    // 뒤 달력은 DB대로 그 휴가가 없다
    await waitFor(() => expect(within(cal).queryByRole('button', { name: '박서연 오후 반차' })).toBeNull())
    expect(screen.getByRole('dialog', { name: '휴가 고치기' })).toBe(dialog)
    expect(within(dialog).getByRole('button', { name: '오전' }).getAttribute('aria-pressed')).toBe('true')
    // 다시 [저장]하면 같은 묶음 id로 다시 넣는다
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }))
    await waitFor(() => expect(next.store.replaceLeaveGroup).toHaveBeenCalledTimes(2))
    expect(next.store.replaceLeaveGroup).toHaveBeenLastCalledWith(target.groupId, [
      { staffId: 'm-park', day: '2026-11-13', kind: 'half', part: 'am', paid: true, memo: null },
    ])
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

// ── google-link REQ-8537: 이은 병원의 휴가 넣기 → 구글 캘린더 그날 하루 종일 off 줄 (notes-calendar 'staff') ──

type Gcal = ReturnType<typeof fakeGcal>
async function openLinked(gcal: Gcal = fakeGcal(), next: Base = makeBase()) {
  vi.mocked(useGcalOff).mockReturnValue(gcal as never)
  return { ...(await openEditor(next)), gcal }
}
const offBox = (q: ReturnType<typeof within>, head: string) => q.getByText(head).closest('[data-off-box]') as HTMLElement
const pairOf = async (box: HTMLElement) => flat((await within(box).findByText('지금')).closest('dl'))
const LINKED_HEAD = "예약 달력에 '휴무'로 보이고, 구글 캘린더 그날 off 줄에 이름이 더해져요."
const STAFF_HEAD = '구글 캘린더 그날 off 줄에 이름이 더해져요.'
const HALF_HEAD = '예약 달력에 오전·오후 휴무로 보여요. 반차는 구글 off 줄에 넣지 않아요.'
const NOTES = [
  '하루 종일 쉬는 휴가만 off 줄에 넣어요. 반차는 넣지 않고 예약 달력에만 오전·오후 휴무로 보여요(예: 11/27 이수현 오후 반차).',
  '여러 날 휴가는 날마다 그날 off 줄에 하나씩 더해요. 휴가를 지우면 그 줄에서 이름을 빼고, 아무도 안 남으면 줄을 지워요.',
  '예약 시행자가 아닌 직원(예: 데스크 김예시)도 off 줄에 들어가요. 예약 경고는 없어요.',
  '구글에서 off 줄을 고치면 예약 탭 휴무는 바뀌지만, 직원 탭 휴가 기록은 바꾸지 않아요.',
]
const cellTexts = (table: HTMLElement) => within(table).getAllByRole('cell').map((c) => [...c.children].map((chip) => flat(chip)))

describe('AC-8537.1: 이은 병원 — 휴가 넣기 파란 상자', () => {
  it('AC-8537.1: 예약 시행자와 이어진 사람의 하루 종일 휴가 — 글 · 지금 [정유나 off] → 저장하면 [이도윤, 정유나 off] · 하루 종일 줄', async () => {
    const { q, pick, day } = await openLinked()
    pick('m-lee')
    day('2026-11-27')
    const box = offBox(q, LINKED_HEAD)
    expect(within(box).getByText('(예약 시행자 (이) 이도윤과 이어져 있어요)')).toBeTruthy()
    expect(await pairOf(box)).toBe('지금 정유나 off 저장하면 이도윤, 정유나 off')
    expect(within(box).getByText('구글 캘린더 2026 가나 정형외과 · 11/27 (금) 하루 종일 줄')).toBeTruthy()
    expect(q.queryByText("예약 달력에 '휴무'로 보여요.")).toBeNull()
  })

  it('AC-8537.1: 조사는 이름 끝 받침으로 — (예약 시행자 (시) 이시아와 이어져 있어요)', async () => {
    const next = makeBase()
    next.clinic.profile = clinicProfile({
      staff: [
        { id: 'cal-lee', name: '이시아', role: 'staff', mark: '시', color: 'blueberry', calendar: true },
        { id: 'cal-park', name: '박서연', role: 'staff', mark: '박', color: 'basil', calendar: true },
      ],
    })
    const { q, pick, day } = await openLinked(fakeGcal(), next)
    pick('m-lee')
    day('2026-11-27')
    expect(within(offBox(q, LINKED_HEAD)).getByText('(예약 시행자 (시) 이시아와 이어져 있어요)')).toBeTruthy()
  })

  it('AC-8537.1: 예약 시행자가 아닌 직원(김하늘) — 구글 글만, 예약 달력 휴무 글·예약 경고 없음', async () => {
    const { q, pick, day, base } = await openLinked()
    pick('m-kim')
    day('2026-11-27')
    const box = offBox(q, STAFF_HEAD)
    expect(within(box).queryByText(/예약 달력에|예약 시행자/)).toBeNull()
    expect(await pairOf(box)).toBe('지금 정유나 off 저장하면 김하늘, 정유나 off')
    expect(within(box).getByText('구글 캘린더 2026 가나 정형외과 · 11/27 (금) 하루 종일 줄')).toBeTruthy()
    expect(base.store.countAppts).not.toHaveBeenCalled()
  })

  it('AC-8537.1: 그날 구글 off 줄이 아직 없으면 저장하면 줄만 — [이도윤 off]', async () => {
    const { q, pick, day } = await openLinked()
    pick('m-lee')
    day('2026-11-26')
    const box = offBox(q, LINKED_HEAD)
    await waitFor(() => expect(flat(within(box).getByText('저장하면').closest('dl'))).toBe('저장하면 이도윤 off'))
    expect(within(box).queryByText('지금')).toBeNull()
  })

  it('AC-8537.1: 반차 — 예약 달력에 오전·오후 휴무로 보여요. 반차는 구글 off 줄에 넣지 않아요. (지금 → 저장하면 없음)', async () => {
    const { q, pick, day, kind } = await openLinked()
    pick('m-lee')
    day('2026-11-27')
    kind('반차')
    const box = offBox(q, HALF_HEAD)
    expect(within(box).getByText('(예약 시행자 (이) 이도윤과 이어져 있어요)')).toBeTruthy()
    expect(q.queryByText('지금')).toBeNull()
    expect(q.queryByText('저장하면')).toBeNull()
    expect(q.queryByText("예약 달력에 그날 오전만 '휴무'로 보여요.")).toBeNull()
  })

  it("AC-8537.1: '예약 시행자가 아닌 직원도'가 꺼져 있으면 그 직원은 구글 줄에 넣지 않아 지금 글 그대로(파란 상자 없음)", async () => {
    const { q, pick, day } = await openLinked(fakeGcal({ offAllStaff: false }))
    pick('m-kim')
    day('2026-11-27')
    expect(q.queryByText(STAFF_HEAD)).toBeNull()
    expect(q.queryByText('지금')).toBeNull()
  })
})

describe("AC-8537.1: 이은 병원 — 오른쪽 '저장하면 이렇게 바뀌어요'", () => {
  it('AC-8537.1: 예약 탭 종일 줄 · 구글 캘린더 하루 종일 줄(그 앞 이틀 ~ 다음 날) · 안내 넷', async () => {
    const { q, pick, day } = await openLinked()
    pick('m-lee')
    day('2026-11-27')
    const res = await q.findByRole('region', { name: '저장하면 이렇게 바뀌어요' })
    expect(within(res).getByText('11/25 – 28')).toBeTruthy()
    const app = within(res).getByRole('table', { name: '예약 탭 종일 줄' })
    expect(within(app).getAllByRole('columnheader').map(flat)).toEqual(['', '11/25 (수)', '11/26 (목)', '11/27 (금)', '11/28 (토)'])
    expect(within(app).getByRole('rowheader').textContent).toBe('종일')
    await waitFor(() => expect(cellTexts(app)).toEqual([['원장님 학회'], [], ['이도윤, 정유나 off'], []]))
    const google = within(res).getByRole('table', { name: '구글 캘린더 2026 가나 정형외과 · 하루 종일 줄' })
    expect(cellTexts(google)).toEqual([['원장님 학회'], [], ['이도윤, 정유나 off'], []])
    expect(within(res).getAllByRole('listitem').map(flat)).toEqual(NOTES)
    expect(within(res).queryByText(/구글 캘린더에도 적었어요/)).toBeNull()
  })

  it('AC-8537.1: 반차는 예약 탭에만 흰 칩((이) 이도윤 오전 반차), 구글 줄은 지금 그대로', async () => {
    const { q, pick, day, kind } = await openLinked()
    pick('m-lee')
    day('2026-11-27')
    kind('반차')
    const res = await q.findByRole('region', { name: '저장하면 이렇게 바뀌어요' })
    const app = within(res).getByRole('table', { name: '예약 탭 종일 줄' })
    await waitFor(() => expect(cellTexts(app)[2]).toEqual(['정유나 off', '(이) 이도윤 오전 반차']))
    const google = within(res).getByRole('table', { name: '구글 캘린더 2026 가나 정형외과 · 하루 종일 줄' })
    expect(cellTexts(google)[2]).toEqual(['정유나 off'])
  })
})

describe('AC-8537.2: 이은 병원 — [저장]', () => {
  afterEach(() => vi.useRealTimers())

  function savedData(gcal: Gcal) {
    const memo = { id: 'ad-1', day: '2026-11-25', type: 'memo' as const, memo: '원장님 학회', staffId: null, staffName: null, gEventId: `ssk${'1'.repeat(32)}` }
    const jung = { id: 'ad-2', day: '2026-11-27', type: 'off' as const, memo: null, staffId: 'm-mjung', staffName: '정유나', part: null }
    const lee = { id: 'ad-3', day: '2026-11-27', type: 'off' as const, memo: null, staffId: 'cal-lee', staffName: '이도윤', part: null }
    // 보내기 전에는 지금 모습, 보낸 뒤 다시 읽으면 이도윤이 든 모습(DB 트리거 + 구글에 적음)
    let sent = false
    gcal.store.sendOffDay.mockImplementation(async () => {
      sent = true
      return true
    })
    gcal.store.listAllDay.mockImplementation(async () => (sent ? [memo, lee, jung] : [memo, jung]))
    gcal.store.listOffDays.mockImplementation(async () => [
      { day: '2026-11-27', gEventId: 'sskoff1', gTitle: sent ? '이도윤, 정유나 off' : '정유나 off', gUpdated: null, wait: false, waitAt: null },
    ])
  }
  /** 저장 뒤 다시 읽기(맨 끝 일)까지 끝나기를 기다린다 */
  async function rereadAfter(gcal: Gcal, calls: number) {
    await waitFor(() => expect(gcal.store.listAllDay.mock.calls.length).toBeGreaterThan(calls))
    await new Promise((done) => setTimeout(done, 20))
  }

  it('AC-8537.2: 하루 연차를 저장하면 그날 off 날을 바로 보내고, 칸은 연 채 저장한 뒤 · 구글 캘린더에도 적었어요 · {HH:mm} · 알림', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-21T05:38:00Z'))
    const gcal = fakeGcal()
    savedData(gcal)
    const next = makeBase()
    next.store.listLeaves.mockResolvedValueOnce(LEAVES).mockResolvedValue([...LEAVES, leave('m-lee', '2026-11-27', 'annual', { groupId: 'g-new' })])
    const { q, pick, day, save } = await openLinked(gcal, next)
    pick('m-lee')
    day('2026-11-27')
    expect(await pairOf(offBox(q, LINKED_HEAD))).toBe('지금 정유나 off 저장하면 이도윤, 정유나 off')
    fireEvent.click(save())
    await waitFor(() => expect(gcal.store.sendOffDay).toHaveBeenCalledWith('2026-11-27'))
    expect(gcal.store.sendOffDay).toHaveBeenCalledTimes(1)
    const res = await q.findByRole('region', { name: '저장한 뒤' })
    expect(await within(res).findByText('구글 캘린더에도 적었어요 · 14:38')).toBeTruthy()
    expect(flat(await screen.findByRole('status'))).toBe('휴가를 넣었어요. 예약 달력과 구글 캘린더 11/27 (금) off 줄에도 더했어요.')
    expect(screen.getByRole('dialog', { name: '휴가 넣기' })).toBeTruthy()
    expect((q.getByRole('button', { name: '저장했어요 ✓' }) as HTMLButtonElement).disabled).toBe(true)
    // 저장한 뒤는 다시 읽은 모습(구글에도 적힘)
    const google = within(res).getByRole('table', { name: '구글 캘린더 2026 가나 정형외과 · 하루 종일 줄' })
    expect(cellTexts(google)[2]).toEqual(['이도윤, 정유나 off'])
    // 뒤 표는 다시 읽고, 칸은 넣기 전 모습 그대로(이미 휴가 · 남은 연차를 두 번 빼지 않음)
    await waitFor(() => expect(next.store.listLeaves).toHaveBeenCalledTimes(2))
    expect(q.queryByText(/이미 휴가가 있어요/)).toBeNull()
    expect(flat(q.getByRole('region', { name: '미리 보기' }))).toBe('이도윤 님 남은 연차 10일 → 9일')
    expect(await pairOf(offBox(q, LINKED_HEAD))).toBe('지금 정유나 off 저장하면 이도윤, 정유나 off')
  })

  it('AC-8537.2: 못 보내면 조용히 — 저장한 뒤만 보이고 적었어요 줄·알림이 없다(다음 맞춤이 보낸다)', async () => {
    const gcal = fakeGcal()
    gcal.store.sendOffDay.mockResolvedValue(false)
    const { q, pick, day, save } = await openLinked(gcal)
    pick('m-lee')
    day('2026-11-27')
    await pairOf(offBox(q, LINKED_HEAD))
    const calls = gcal.store.listAllDay.mock.calls.length
    fireEvent.click(save())
    const res = await q.findByRole('region', { name: '저장한 뒤' })
    await rereadAfter(gcal, calls)
    expect(gcal.store.sendOffDay).toHaveBeenCalledWith('2026-11-27')
    expect(within(res).queryByText(/구글 캘린더에도 적었어요/)).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
    expect(q.queryByRole('alert')).toBeNull()
  })

  it('AC-8537.2: 여러 날은 날마다 차례로 보낸다(11/23 월 ~ 11/24 화)', async () => {
    const gcal = fakeGcal()
    const { q, pick, range, save } = await openLinked(gcal)
    pick('m-lee')
    range('2026-11-23', '2026-11-24')
    fireEvent.click(save())
    await q.findByRole('region', { name: '저장한 뒤' })
    await waitFor(() => expect(gcal.store.sendOffDay.mock.calls.map((c) => c[0])).toEqual(['2026-11-23', '2026-11-24']))
    expect(flat(await screen.findByRole('status'))).toBe('휴가를 넣었어요. 예약 달력과 구글 캘린더 11/23 (월) off 줄에도 더했어요.')
  })

  it('AC-8537.2: 반차는 구글에 보내지 않는다 — 저장한 뒤만, 적었어요 줄·알림 없음', async () => {
    const gcal = fakeGcal()
    const { q, pick, day, kind, save, base } = await openLinked(gcal)
    pick('m-lee')
    day('2026-11-27')
    kind('반차')
    await waitFor(() => expect(gcal.store.listAllDay).toHaveBeenCalled())
    const calls = gcal.store.listAllDay.mock.calls.length
    fireEvent.click(save())
    await q.findByRole('region', { name: '저장한 뒤' })
    expect(base.store.addLeaveGroup).toHaveBeenCalled()
    await rereadAfter(gcal, calls)
    expect(gcal.store.sendOffDay).not.toHaveBeenCalled()
    expect(q.queryByText(/구글 캘린더에도 적었어요/)).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('AC-8537.2: 칩에서 연 고치기는 옛 날과 새 날을 함께 보낸다(김하늘 11/07 → 11/09) — 적었어요 줄만, 넣기 알림 없음', async () => {
    const gcal = fakeGcal({ linkedOn: '2026-11-01' })
    vi.mocked(useGcalOff).mockReturnValue(gcal as never)
    const next = makeBase()
    vi.mocked(useStaffBase).mockReturnValue(next as never)
    render(<LeaveScreen today={TODAY} />)
    const cal = await screen.findByRole('region', { name: '휴가 달력' })
    fireEvent.click(within(cal).getByRole('button', { name: '김하늘 연차' }))
    const dialog = within(screen.getByRole('dialog', { name: '휴가 고치기' }))
    fireEvent.change(dialog.getByLabelText('날짜'), { target: { value: '2026-11-09' } })
    fireEvent.click(dialog.getByRole('button', { name: '저장' }))
    await dialog.findByRole('region', { name: '저장한 뒤' })
    await waitFor(() => expect(gcal.store.sendOffDay.mock.calls.map((c) => c[0])).toEqual(['2026-11-07', '2026-11-09']))
    expect(await dialog.findByText(/^구글 캘린더에도 적었어요 · \d\d:\d\d$/)).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
    expect(next.store.replaceLeaveGroup).toHaveBeenCalled()
  })
})

describe('AC-8537.3: 잇지 않은 병원 — 지금 글·동작 그대로', () => {
  it('AC-8537.3: 파란 상자는 지금 글, 오른쪽 미리 보기 없음, [저장]하면 닫힌다', async () => {
    const next = makeBase()
    const { q, pick, day, save } = await openEditor(next)
    pick('m-lee')
    day('2026-11-27')
    expect(q.getByText("예약 달력에 '휴무'로 보여요.")).toBeTruthy()
    expect(q.getByText('(예약 시행자 (이) 이도윤과 이어져 있어요)')).toBeTruthy()
    expect(q.queryByText(LINKED_HEAD)).toBeNull()
    expect(q.queryByRole('region', { name: '저장하면 이렇게 바뀌어요' })).toBeNull()
    fireEvent.click(save())
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.queryByRole('status')).toBeNull()
  })
})
