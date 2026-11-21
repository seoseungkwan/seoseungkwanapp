// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StaffStoreError } from '@/lib/storage/staff'
import { PLANS, W, kit, makeBase, openPlan, pressed, renderWeek, resetKit, select } from './scheduleTestKit'

// 근무표 화면 — ③ 기본 근무 고치기 (staff AC-7613.3, 시안 schedule.html ③). 보기 자료·도구는 scheduleTestKit.tsx

vi.mock('@/components/staff/useStaffBase', () => ({ useStaffBase: vi.fn() }))

beforeEach(resetKit)
afterEach(cleanup)

// ── ③ 기본 근무 고치기 ───────────────────────────────────────

describe('AC-7613.3: 기본 근무', () => {
  it('AC-7613.3: "◀ 근무표로", "{이름} — 기본 근무 {직종} · {근무 형태} · 주 {n}시간", 요일마다 [일함]·[쉼]과 근무·점심 시간', async () => {
    await openPlan()
    expect(screen.getByRole('button', { name: '◀ 근무표로' })).toBeTruthy()
    expect(screen.getByText('김하늘 — 기본 근무')).toBeTruthy()
    expect(screen.getByText('간호조무사 · 정규직 · 주 40시간')).toBeTruthy()
    for (const day of ['월', '화', '수', '목', '금']) {
      expect(pressed(screen.getByRole('group', { name: `${day}요일` }))).toEqual(['일함'])
      expect(select(`${day}요일 근무 시작`).value).toBe('540')
      expect(select(`${day}요일 근무 끝`).value).toBe('1080')
      expect(select(`${day}요일 점심 시작`).value).toBe('780')
      expect(select(`${day}요일 점심 끝`).value).toBe('840')
    }
    expect(select('월요일 근무 시작').selectedOptions[0]!.textContent).toBe('09:00')
    // 토요일: 09:00~13:00 · 점심 없음
    expect(select('토요일 근무 끝').value).toBe('780')
    expect(select('토요일 점심 시작').value).toBe('')
    expect(select('토요일 점심 시작').selectedOptions[0]!.textContent).toBe('없음')
    expect(screen.queryByRole('combobox', { name: '토요일 점심 끝' })).toBeNull()
    // 일요일: 쉼
    expect(pressed(screen.getByRole('group', { name: '일요일' }))).toEqual(['쉼'])
    expect(screen.queryByRole('combobox', { name: '일요일 근무 시작' })).toBeNull()
    expect(screen.getByText('쉬는 요일')).toBeTruthy()
  })

  it('AC-7613.3: 토요일 "어느 토요일에 [매주]·[1·3주]·[2·4주]"와 그 뜻 글, 시간 안내 글', async () => {
    await openPlan()
    expect(screen.getByText('어느 토요일에')).toBeTruthy()
    const rotation = screen.getByRole('group', { name: '어느 토요일에' })
    expect(within(rotation).getAllByRole('button').map((b) => b.textContent)).toEqual(['매주', '1·3주', '2·4주'])
    expect(pressed(rotation)).toEqual(['1·3주'])
    expect(screen.getByText('그달 첫째·셋째 토요일에 일해요. 다섯째 토요일은 쉬어요.')).toBeTruthy()
    fireEvent.click(within(rotation).getByRole('button', { name: '2·4주' }))
    expect(screen.getByText('그달 둘째·넷째 토요일에 일해요. 다섯째 토요일은 쉬어요.')).toBeTruthy()
    expect(screen.getByText("시간은 10분 단위로 골라요. 점심이 없으면 '없음'을 골라요.")).toBeTruthy()
    // 토요일을 쉼으로 하면 고르기가 없다
    fireEvent.click(within(screen.getByRole('group', { name: '토요일' })).getByRole('button', { name: '쉼' }))
    expect(screen.queryByRole('group', { name: '어느 토요일에' })).toBeNull()
  })

  it('AC-7613.3: "지난 근무표는 그대로 두고 {M}월 {d}일 ({요일}) 부터 이 근무로 바꿔요." — 처음 값은 오늘 다음 월요일, 날짜를 고를 수 있다', async () => {
    await openPlan()
    const since = screen.getByText(/^지난 근무표는 그대로 두고/)
    expect(since.textContent).toBe('지난 근무표는 그대로 두고 11월 23일 (월) 부터 이 근무로 바꿔요.')
    const date = screen.getByLabelText('바꾸기 시작하는 날') as HTMLInputElement
    expect(date.value).toBe('2026-11-23')
    fireEvent.change(date, { target: { value: '2026-12-01' } })
    expect(since.textContent).toBe('지난 근무표는 그대로 두고 12월 1일 (화) 부터 이 근무로 바꿔요.')
    expect(screen.getByText('이 근무가 매주 근무표의 바탕이 돼요.')).toBeTruthy()
  })

  it('AC-7613.3: 고친 근무를 [저장]하면 그 날짜부터 새 판으로 저장하고 근무표로 돌아간다', async () => {
    await openPlan()
    // 일요일을 일함으로: 병원이 쉬는 요일이라 그 사람 다른 요일 근무(09:00~18:00 · 점심 13:00~14:00)로 채운다
    fireEvent.click(within(screen.getByRole('group', { name: '일요일' })).getByRole('button', { name: '일함' }))
    expect(select('일요일 근무 시작').value).toBe('540')
    expect(select('일요일 점심 끝').value).toBe('840')
    fireEvent.change(select('일요일 근무 끝'), { target: { value: '780' } })
    fireEvent.change(select('일요일 점심 시작'), { target: { value: '' } })
    expect(screen.queryByRole('combobox', { name: '일요일 점심 끝' })).toBeNull()
    // 월요일 10:00 시작, 토요일 점심 12:00 (끝은 근무 끝까지 한 시간 안)
    fireEvent.change(select('월요일 근무 시작'), { target: { value: '600' } })
    fireEvent.change(select('토요일 점심 시작'), { target: { value: '720' } })
    expect(select('토요일 점심 끝').value).toBe('780')
    fireEvent.click(within(screen.getByRole('group', { name: '어느 토요일에' })).getByRole('button', { name: '2·4주' }))
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(kit.store.savePlan).toHaveBeenCalledTimes(1))
    expect(kit.store.savePlan).toHaveBeenCalledWith(
      'm1',
      '2026-11-23',
      [
        { start: 600, end: 1080, lunchFrom: 780, lunchTo: 840 },
        W,
        W,
        W,
        W,
        { start: 540, end: 780, lunchFrom: 720, lunchTo: 780 },
        { start: 540, end: 780, lunchFrom: null, lunchTo: null },
      ],
      '2-4',
    )
    expect(await screen.findByRole('table', { name: '주 근무표' })).toBeTruthy()
    expect(kit.base.reload).toHaveBeenCalled()
  })

  it('AC-7613.3: 끝이 시작보다 빠르면 까닭이 보이고 [저장]이 막힌다', async () => {
    await openPlan()
    fireEvent.change(select('화요일 근무 끝'), { target: { value: '480' } })
    expect(screen.getByText('끝나는 시간이 시작 시간보다 늦어야 해요')).toBeTruthy()
    expect((screen.getByRole('button', { name: '저장' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('AC-7613.3·AC-7610.1: 저장이 실패하면 E-STAFF-SAVE-FAILED가 보이고 고친 값은 그대로다', async () => {
    kit.store.savePlan.mockRejectedValueOnce(new StaffStoreError('E-STAFF-SAVE-FAILED'))
    await openPlan()
    fireEvent.change(select('월요일 근무 시작'), { target: { value: '600' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(await screen.findByText('오류 번호 E-STAFF-SAVE-FAILED')).toBeTruthy()
    expect(select('월요일 근무 시작').value).toBe('600')
  })

  it('AC-7613.3: [◀ 근무표로]는 저장하지 않고 근무표로 돌아간다', async () => {
    await openPlan()
    fireEvent.click(screen.getByRole('button', { name: '◀ 근무표로' }))
    expect(await screen.findByRole('table', { name: '주 근무표' })).toBeTruthy()
    expect(kit.store.savePlan).not.toHaveBeenCalled()
  })

  it('AC-7613.3: 기본 근무가 없는 사람은 병원 진료시간으로 채워 연다', async () => {
    kit.base = { ...makeBase(), plans: PLANS.filter((p) => p.staffId !== 'm1') }
    await renderWeek()
    fireEvent.click(screen.getByRole('button', { name: /^김하늘 간호조무사/ }))
    expect(select('월요일 근무 시작').value).toBe('540')
    expect(select('토요일 근무 끝').value).toBe('780')
    expect(pressed(screen.getByRole('group', { name: '일요일' }))).toEqual(['쉼'])
    expect(pressed(screen.getByRole('group', { name: '어느 토요일에' }))).toEqual(['매주'])
  })
})
