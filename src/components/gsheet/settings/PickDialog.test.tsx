// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CodePicker } from './CodePicker'
import { CodePickDialog, HospitalPickDialog } from './PickDialog'

// 수납 설정 '비트 맞춤'의 고르기 창·처방 목록(spec google-link REQ-8516 AC-8516.3, notes-sunap `settings` '비트 맞춤').
// 글은 notes-sunap 그대로, notes에 없는 목록 자리 글·창 단추는 비트시트 그대로(Catalog.cs CodeListState.Message·HospitalPickForm·CodePickerForm).
// 목록은 도우미 sheet.catalog가 준 코드·이름·분류·건수뿐이다(환자 값 없음)

afterEach(cleanup)

const HOSPITALS = [
  { code: '7', name: '셋째의원', recent: 0 },
  { code: '2', name: '둘째의원', recent: 3 },
  { code: '1', name: '샘플정형외과의원', recent: 1204 },
  { code: '9', name: '', recent: 0 },
]
const RX = [
  { code: 'MM070', name: '표층열 치료', cls: '물리치료', n90: 1830 },
  { code: 'KK030', name: '정맥 주사', cls: '주사', n90: 41 },
  { code: 'KK010', name: '관절강내 주사', cls: '주사', n90: 412 },
  { code: 'LA222', name: '신경차단술 — 요추 경막외', cls: '주사', n90: 348 },
]

const rowCodes = () =>
  within(screen.getByRole('table'))
    .getAllByRole('row')
    .slice(1)
    .map((row) => row.querySelectorAll('td')[1]!.textContent)

describe('AC-8516.3 우리 병원 고르기 창', () => {
  it('AC-8516.3: 제목·글이 시안 그대로이고, 병원은 최근 환자 많은 차례 · 이름 · 최근 30일 환자 n명 (코드 n)', () => {
    render(<HospitalPickDialog hospitals={HOSPITALS} current="" onPick={vi.fn()} onClose={vi.fn()} />)
    const dialog = within(screen.getByRole('dialog', { name: '우리 병원 고르기' }))
    expect(dialog.getByText('이 PC의 비트에 병원이 여럿 있어요. 우리 병원을 골라 주세요.')).toBeTruthy()
    expect(dialog.getByText('보통 최근 환자가 있는 병원이 우리 병원이에요. 한 번 고르면 다시 묻지 않아요(설정 › 비트 맞춤에서 바꿀 수 있어요).')).toBeTruthy()
    const names = dialog.getAllByRole('radio').map((r) => r.closest('label')!.textContent)
    expect(names).toEqual([
      '샘플정형외과의원 · 최근 30일 환자 1,204명 (코드 1)',
      '둘째의원 · 최근 30일 환자 3명 (코드 2)',
      '셋째의원 · 최근 30일 환자 0명 (코드 7)',
      '이름 없는 병원 · 최근 30일 환자 0명 (코드 9)',
    ])
    // 지금 고른 병원이 없으면 맨 위가 골라져 있다
    expect((dialog.getAllByRole('radio')[0] as HTMLInputElement).checked).toBe(true)
  })

  it('AC-8516.3: 하나를 골라 [고르기]면 그 병원, [취소]·Esc는 고르지 않고 닫는다', async () => {
    const user = userEvent.setup()
    const onPick = vi.fn()
    const onClose = vi.fn()
    render(<HospitalPickDialog hospitals={HOSPITALS} current="7" onPick={onPick} onClose={onClose} />)
    expect((screen.getByRole('radio', { name: '셋째의원 · 최근 30일 환자 0명 (코드 7)' }) as HTMLInputElement).checked).toBe(true)
    await user.click(screen.getByRole('radio', { name: '둘째의원 · 최근 30일 환자 3명 (코드 2)' }))
    await user.click(screen.getByRole('button', { name: '고르기' }))
    expect(onPick).toHaveBeenCalledWith({ code: '2', name: '둘째의원', recent: 3 })
    await user.click(screen.getByRole('button', { name: '취소' }))
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(2)
    expect(onPick).toHaveBeenCalledTimes(1)
  })
})

describe('AC-8516.3 처방 목록(Block·물리치료 같은 목록)', () => {
  it('AC-8516.3: 찾기 칸·풀이 글, 표는 그 분류 처방이 위 · 많이 쓴 차례이고 코드·이름·분류·90일 건수', () => {
    render(<CodePicker kind="block" state={{ phase: 'ready', rx: RX }} selected={[]} onChange={vi.fn()} onRetry={vi.fn()} />)
    expect(screen.getByRole('searchbox', { name: '찾기: 코드나 이름' })).toBeTruthy()
    expect(screen.getByText('최근 90일에 쓴 처방만 보여요 · 그 분류 처방이 위에 있어요')).toBeTruthy()
    const head = within(screen.getByRole('table')).getAllByRole('columnheader').map((th) => th.textContent)
    expect(head).toEqual(['', '코드', '이름', '분류', '90일 건수'])
    expect(rowCodes()).toEqual(['KK010', 'LA222', 'KK030', 'MM070'])
    expect(screen.getByRole('row', { name: /MM070/ }).textContent).toBe('MM070표층열 치료물리치료1,830')
  })

  it('AC-8516.3: 찾기는 코드·이름·분류로 거르고, 고르면 고른 코드 목록을 알린다', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { rerender } = render(<CodePicker kind="therapy" state={{ phase: 'ready', rx: RX }} selected={['KK010']} onChange={onChange} onRetry={vi.fn()} />)
    expect(rowCodes()).toEqual(['MM070', 'KK010', 'LA222', 'KK030'])
    await user.type(screen.getByRole('searchbox'), 'kk')
    expect(rowCodes()).toEqual(['KK010', 'KK030'])
    await user.clear(screen.getByRole('searchbox'))
    await user.type(screen.getByRole('searchbox'), '요추')
    expect(rowCodes()).toEqual(['LA222'])
    await user.click(screen.getByRole('checkbox', { name: 'LA222' }))
    expect(onChange).toHaveBeenLastCalledWith(['KK010', 'LA222'])
    rerender(<CodePicker kind="therapy" state={{ phase: 'ready', rx: RX }} selected={['KK010', 'LA222']} onChange={onChange} onRetry={vi.fn()} />)
    await user.click(screen.getByRole('checkbox', { name: 'LA222' }))
    expect(onChange).toHaveBeenLastCalledWith(['KK010'])
  })

  it('AC-8516.3: 고른 코드가 최근 90일 목록에 없어도 맨 위에 보인다(지우지 않게)', () => {
    render(<CodePicker kind="block" state={{ phase: 'ready', rx: RX }} selected={['ZZ999']} onChange={vi.fn()} onRetry={vi.fn()} />)
    expect(rowCodes()[0]).toBe('ZZ999')
    expect(screen.getByText('(최근 90일에 안 씀)')).toBeTruthy()
    expect((screen.getByRole('checkbox', { name: 'ZZ999' }) as HTMLInputElement).checked).toBe(true)
  })

  it('AC-8516.3: 목록 자리 글 — 불러오는 중·불러오지 못함 [다시 불러오기]·처방 없음(비트시트 그대로)', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    const { rerender } = render(<CodePicker kind="block" state={{ phase: 'loading' }} selected={[]} onChange={vi.fn()} onRetry={onRetry} />)
    expect(screen.getByText('비트에서 최근 90일 처방 목록을 불러오는 중이에요…')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
    rerender(<CodePicker kind="block" state={{ phase: 'failed' }} selected={[]} onChange={vi.fn()} onRetry={onRetry} />)
    expect(screen.getByText('처방 목록을 불러오지 못했어요. 비트를 읽지 못했어요. [다시 불러오기]를 눌러 주세요.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '다시 불러오기' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    rerender(<CodePicker kind="block" state={{ phase: 'ready', rx: [] }} selected={[]} onChange={vi.fn()} onRetry={onRetry} />)
    expect(screen.getByText('최근 90일에 쓴 처방이 비트에 없어요. 고른 처방이 없으면 비트 분류로 셉니다.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '다시 불러오기' })).toBeNull()
  })
})

describe('AC-8516.3 물리치료 [고르기…] 창', () => {
  it('AC-8516.3: 같은 목록 + 물리치료 풀이 글, [확인]이면 고른 것, [취소]면 그대로', async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    const onClose = vi.fn()
    render(<CodePickDialog kind="therapy" state={{ phase: 'ready', rx: RX }} selected={[]} onDone={onDone} onClose={onClose} onRetry={vi.fn()} />)
    const dialog = within(screen.getByRole('dialog', { name: '물리치료로 셀 처방 — 최근 90일에 쓴 처방' }))
    expect(dialog.getByText('고른 처방 없음 → 물리치료 처방 전부 셈')).toBeTruthy()
    expect(dialog.getByText("고른 처방이 없으면 비트 처방 분류가 '이학요법료'인 처방(물리치료·도수·체외충격파 등)이 있는 환자를 셉니다.")).toBeTruthy()
    await user.click(dialog.getByRole('checkbox', { name: 'MM070' }))
    expect(dialog.getByText('고른 처방 1개만 셈')).toBeTruthy()
    await user.click(dialog.getByRole('button', { name: '취소' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onDone).not.toHaveBeenCalled()
    await user.click(dialog.getByRole('button', { name: '확인' }))
    expect(onDone).toHaveBeenCalledWith(['MM070'])
  })
})
