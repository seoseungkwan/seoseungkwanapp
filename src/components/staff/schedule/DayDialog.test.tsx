// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StaffStoreError } from '@/lib/storage/staff'
import { OVERTIME, inRange, kit, openDialog, pressed, renderWeek, resetKit, select, shown, stepper } from './scheduleTestKit'

// 근무표 화면 — ④ 그날만 바꾸기 창 (staff AC-7613.4, 시안 schedule.html ④). 보기 자료·도구는 scheduleTestKit.tsx

vi.mock('@/components/staff/useStaffBase', () => ({ useStaffBase: vi.fn() }))

beforeEach(resetKit)
afterEach(cleanup)

// ── ④ 그날만 바꾸기 ──────────────────────────────────────────

describe('AC-7613.4: 그날만 바꾸기 창', () => {
  it('AC-7613.4: 머리·그날 근무·더 일한 시간 세 칸·메모·안내 글·[기본으로 되돌리기]·[저장]', async () => {
    await renderWeek()
    const dialog = await openDialog('이도윤', '11월 18일 (수)')
    expect(within(dialog).getByRole('heading', { name: '이도윤 · 11월 18일 (수)' })).toBeTruthy()
    expect(within(dialog).getByText('기본 근무 09:00~18:00 · 점심 13:00~14:00')).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: '닫기' }).textContent).toBe('✕')
    expect(within(dialog).getByText('그날 근무')).toBeTruthy()
    expect(pressed(within(dialog).getByRole('group', { name: '그날 근무' }))).toEqual(['일함'])
    expect(select('근무 시작').value).toBe('540')
    expect(select('근무 끝').value).toBe('1080')
    expect(select('점심 시작').value).toBe('780')
    expect(select('점심 끝').value).toBe('840')
    expect(within(dialog).getByText('근무 시간을 늘려도 더 일한 시간은 저절로 늘지 않아요. 아래 칸에 따로 적어 주세요.')).toBeTruthy()
    expect(within(dialog).getByText('더 일한 시간')).toBeTruthy()
    expect(within(dialog).getByText('30분씩 늘고 줄어요')).toBeTruthy()
    for (const [kind, help, value] of [
      ['연장', '정해진 근무보다 더 일한 시간', '2시간'],
      ['야간', '밤 10시 ~ 아침 6시', '0시간'],
      ['휴일', '공휴일·휴진일에 일한 시간', '0시간'],
    ]) {
      expect(within(dialog).getByText(help)).toBeTruthy()
      expect(shown(dialog, kind!)).toBe(value)
      expect(within(stepper(dialog, kind!)).getByRole('button', { name: `${kind} 30분 줄이기` }).textContent).toBe('−')
      expect(within(stepper(dialog, kind!)).getByRole('button', { name: `${kind} 30분 늘리기` }).textContent).toBe('+')
    }
    expect(within(dialog).getByText("공휴일·휴진일에 일하면 그 시간은 '휴일'로 들어가요.")).toBeTruthy()
    expect(within(dialog).getByRole('textbox', { name: '메모' })).toBeTruthy()
    expect(within(dialog).getByText('휴가는 이 창이 아니라 휴가 화면에서 넣어요.')).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: '기본으로 되돌리기' })).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: '저장' })).toBeTruthy()
    // 0이면 [−]가 막힌다
    expect((within(stepper(dialog, '야간')).getByRole('button', { name: '야간 30분 줄이기' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('AC-7613.4: 더 일한 시간은 30분씩 — [+] 뒤 [저장]하면 그 종류만 저장하고 창을 닫고 주를 다시 읽는다', async () => {
    await renderWeek()
    const dialog = await openDialog('이도윤', '11월 18일 (수)')
    fireEvent.click(within(stepper(dialog, '연장')).getByRole('button', { name: '연장 30분 늘리기' }))
    expect(shown(dialog, '연장')).toBe('2시간 30분')
    fireEvent.click(within(stepper(dialog, '야간')).getByRole('button', { name: '야간 30분 늘리기' }))
    fireEvent.click(within(stepper(dialog, '야간')).getByRole('button', { name: '야간 30분 줄이기' }))
    expect(shown(dialog, '야간')).toBe('0시간')
    const reads = kit.store.listChanges.mock.calls.length
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(kit.store.saveOvertime).toHaveBeenCalledTimes(1)
    expect(kit.store.saveOvertime).toHaveBeenCalledWith({ staffId: 'm2', day: '2026-11-18', kind: 'extended', minutes: 150 })
    expect(kit.store.saveChange).not.toHaveBeenCalled()
    expect(kit.store.resetDay).not.toHaveBeenCalled()
    await waitFor(() => expect(kit.store.listChanges.mock.calls.length).toBeGreaterThan(reads))
  })

  it('AC-7613.4: 근무 시간과 메모를 바꿔 [저장]하면 바뀐 날로 저장한다(더 일한 시간은 저절로 늘지 않는다)', async () => {
    await renderWeek()
    const dialog = await openDialog('이도윤', '11월 18일 (수)')
    fireEvent.change(select('근무 끝'), { target: { value: '1200' } })
    fireEvent.change(within(dialog).getByRole('textbox', { name: '메모' }), { target: { value: '저녁 환자가 많아 8시까지 일함' } })
    expect(shown(dialog, '연장')).toBe('2시간')
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }))
    await waitFor(() => expect(kit.store.saveChange).toHaveBeenCalledTimes(1))
    expect(kit.store.saveChange).toHaveBeenCalledWith({
      staffId: 'm2',
      day: '2026-11-18',
      shift: { start: 540, end: 1200, lunchFrom: 780, lunchTo: 840 },
      memo: '저녁 환자가 많아 8시까지 일함',
    })
    expect(kit.store.saveOvertime).not.toHaveBeenCalled()
  })

  it('AC-7613.4: [쉼]으로 바꿔 저장하면 그날은 쉼인 바뀐 날이다', async () => {
    await renderWeek()
    const dialog = await openDialog('김하늘', '11월 17일 (화)')
    fireEvent.click(within(within(dialog).getByRole('group', { name: '그날 근무' })).getByRole('button', { name: '쉼' }))
    expect(screen.queryByRole('combobox', { name: '근무 시작' })).toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }))
    await waitFor(() => expect(kit.store.saveChange).toHaveBeenCalledWith({ staffId: 'm1', day: '2026-11-17', shift: null, memo: null }))
  })

  it('AC-7613.4: 이미 바꾼 날은 바꾼 값과 메모로 열린다', async () => {
    await renderWeek()
    const dialog = await openDialog('한지우', '11월 20일 (금)')
    expect(select('근무 끝').value).toBe('900')
    expect((within(dialog).getByRole('textbox', { name: '메모' }) as HTMLInputElement).value).toBe('병원 일찍 나감')
    expect(within(dialog).getByText('기본 근무 09:00~18:00 · 점심 13:00~14:00')).toBeTruthy()
  })

  it('AC-7613.4·AC-7605.4: 휴진일을 [일함]으로 바꾸면 휴일 칸이 근무 길이 − 점심으로 먼저 채워지고, 고친 값으로 저장된다', async () => {
    await renderWeek()
    const dialog = await openDialog('김하늘', '11월 22일 (일)')
    expect(within(dialog).getByText('기본 근무 쉼')).toBeTruthy()
    expect(pressed(within(dialog).getByRole('group', { name: '그날 근무' }))).toEqual(['쉼'])
    fireEvent.click(within(within(dialog).getByRole('group', { name: '그날 근무' })).getByRole('button', { name: '일함' }))
    expect(select('근무 시작').value).toBe('540')
    expect(shown(dialog, '휴일')).toBe('8시간')
    // 점심을 빼면 다시 채운다(아직 손대지 않았으니)
    fireEvent.change(select('점심 시작'), { target: { value: '' } })
    expect(shown(dialog, '휴일')).toBe('9시간')
    // 손으로 고치면 그 값이 남는다
    fireEvent.click(within(stepper(dialog, '휴일')).getByRole('button', { name: '휴일 30분 줄이기' }))
    fireEvent.change(select('근무 끝'), { target: { value: '1020' } })
    expect(shown(dialog, '휴일')).toBe('8시간 30분')
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }))
    await waitFor(() => expect(kit.store.saveOvertime).toHaveBeenCalledTimes(1))
    expect(kit.store.saveChange).toHaveBeenCalledWith({ staffId: 'm1', day: '2026-11-22', shift: { start: 540, end: 1020, lunchFrom: null, lunchTo: null }, memo: null })
    expect(kit.store.saveOvertime).toHaveBeenCalledWith({ staffId: 'm1', day: '2026-11-22', kind: 'holiday', minutes: 510 })
  })

  it('AC-7613.4: [기본으로 되돌리기]는 그날 바꾼 근무·더 일한 시간·메모를 모두 지운다', async () => {
    await renderWeek()
    const dialog = await openDialog('박서연', '11월 19일 (목)')
    expect(select('근무 시작').value).toBe('600')
    fireEvent.click(within(dialog).getByRole('button', { name: '기본으로 되돌리기' }))
    await waitFor(() => expect(kit.store.resetDay).toHaveBeenCalledWith('m3', '2026-11-19'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(kit.store.saveChange).not.toHaveBeenCalled()
  })

  it('AC-7613.4·AC-7605.2: 바꾼 날을 기본과 같게 되돌려 메모 없이 저장하면 바뀐 날 줄을 지우고 더 일한 시간은 다시 넣는다', async () => {
    kit.store.listOvertime.mockImplementation(async (range) => [...inRange(OVERTIME, range), { staffId: 'm3', day: '2026-11-19', kind: 'night', minutes: 30 }])
    await renderWeek()
    const dialog = await openDialog('박서연', '11월 19일 (목)')
    expect(shown(dialog, '야간')).toBe('30분')
    fireEvent.change(select('근무 시작'), { target: { value: '540' } })
    fireEvent.change(select('근무 끝'), { target: { value: '1080' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }))
    await waitFor(() => expect(kit.store.resetDay).toHaveBeenCalledWith('m3', '2026-11-19'))
    await waitFor(() => expect(kit.store.saveOvertime).toHaveBeenCalledWith({ staffId: 'm3', day: '2026-11-19', kind: 'night', minutes: 30 }))
    expect(kit.store.saveChange).not.toHaveBeenCalled()
    expect(kit.store.resetDay.mock.invocationCallOrder[0]!).toBeLessThan(kit.store.saveOvertime.mock.invocationCallOrder[0]!)
  })

  it('AC-7613.4: 끝이 시작보다 빠르면 까닭이 보이고 [저장]이 막힌다', async () => {
    await renderWeek()
    const dialog = await openDialog('이도윤', '11월 18일 (수)')
    fireEvent.change(select('근무 끝'), { target: { value: '480' } })
    expect(within(dialog).getByText('끝나는 시간이 시작 시간보다 늦어야 해요')).toBeTruthy()
    expect((within(dialog).getByRole('button', { name: '저장' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('AC-7613.4·AC-7610.1: 저장이 실패하면 창 안에 E-STAFF-SAVE-FAILED가 보이고 값은 그대로다', async () => {
    kit.store.saveOvertime.mockRejectedValueOnce(new StaffStoreError('E-STAFF-SAVE-FAILED'))
    await renderWeek()
    const dialog = await openDialog('이도윤', '11월 18일 (수)')
    fireEvent.click(within(stepper(dialog, '연장')).getByRole('button', { name: '연장 30분 늘리기' }))
    fireEvent.click(within(dialog).getByRole('button', { name: '저장' }))
    expect(await within(dialog).findByText('오류 번호 E-STAFF-SAVE-FAILED')).toBeTruthy()
    expect(screen.getByRole('dialog')).toBe(dialog)
    expect(shown(dialog, '연장')).toBe('2시간 30분')
  })

  it('AC-7613.4: Esc를 누르면 저장하지 않고 닫힌다', async () => {
    await renderWeek()
    await openDialog('이도윤', '11월 18일 (수)')
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' })
    })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(kit.store.saveChange).not.toHaveBeenCalled()
  })
})
