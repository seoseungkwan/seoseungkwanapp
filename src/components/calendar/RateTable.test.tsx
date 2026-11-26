// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { rateSummary } from '@/lib/calendar/counts'
import type { CalCountRow, CalSettings } from '@/types/calendar'
import { RateBreakdown, RateTable, type RateTableRow } from './RateTable'

// 취소·변경·안 옴 표 (spec clinic-calendar AC-5907.2·AC-5907.3, 시안 ?s=summary·?s=stats의 .bt 표).
// 머리 = 이름 · 예약 · 취소 · 취소율 · 변경 · 변경율 · 안 옴 · 안 옴율, 맨 아래 합계. 비율은 lib/calendar ratePct(예약 0이면 '–')

afterEach(cleanup)

const HEAD = ['예약', '취소', '취소율', '변경', '변경율', '안 옴', '안 옴율']

// 표 줄의 보이는 값(폰에서 수 아래 접는 비율 글은 빼고 칸마다 하나)
const values = (row: HTMLElement) => [...row.querySelectorAll('th, td')].map((cell) => (cell.querySelector('[data-n]') ?? cell).textContent?.trim())

const row = (over: Partial<CalCountRow>): CalCountRow => ({
  day: '2026-11-17',
  staffId: 'ga',
  staffName: '한○○',
  kindId: 'dosu',
  kindName: '도수',
  status: 'auto',
  auto: null,
  origDay: null,
  gMoved: false,
  ...over,
})

describe('AC-5907.2: RateTable — 줄마다 네 수와 세 비율, 합계', () => {
  const ROWS: RateTableRow[] = [
    { id: 'ga', label: '(가) 한○○', total: 1205, cancel: 14, moved: 7, noshow: 1 },
    { id: 'na', label: '(나) 윤○○', total: 0, cancel: 0, moved: 0, noshow: 0 },
  ]

  it('AC-5907.2: 머리 칸이 시안 그대로이고 숫자는 세 자리 쉼표, 비율은 소수 첫째 자리, 예약 0이면 –', () => {
    render(<RateTable head="시행자" rows={ROWS} total={{ total: 1205, cancel: 14, moved: 7, noshow: 1 }} />)
    const table = screen.getByRole('table')
    const [head, first, second, foot] = within(table).getAllByRole('row')
    expect(values(head!)).toEqual(['시행자', ...HEAD])
    expect(values(first!)).toEqual(['(가) 한○○', '1,205', '14', '1.2%', '7', '0.6%', '1', '0.1%'])
    expect(values(second!)).toEqual(['(나) 윤○○', '0', '0', '–', '0', '–', '0', '–'])
    expect(values(foot!)).toEqual(['합계', '1,205', '14', '1.2%', '7', '0.6%', '1', '0.1%'])
  })

  it('AC-5907.3: 합계 이름을 바꿀 수 있고(12개월), 줄을 누르면 그 줄 id로 부른다. 고른 줄은 aria-current', () => {
    const onPick = vi.fn()
    render(<RateTable head="달" rows={ROWS} total={{ total: 1205, cancel: 14, moved: 7, noshow: 1 }} totalLabel="12개월" selected="na" onPick={onPick} />)
    expect(screen.getByText('12개월')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '(가) 한○○' }))
    expect(onPick).toHaveBeenCalledWith('ga')
    expect(screen.getByRole('button', { name: '(나) 윤○○' }).getAttribute('aria-current')).toBe('true')
    expect(screen.getByRole('button', { name: '(가) 한○○' }).getAttribute('aria-current')).toBeNull()
  })
})

describe('AC-5907.2: RateBreakdown — 시행자별·종류별 두 표', () => {
  // 10줄: 취소 2, 처음 자리 1, 안 옴 1(design.md '예')
  const ROWS10 = [
    row({ status: 'cancel' }),
    row({ status: 'cancel', staffId: 'na', staffName: '윤○○', kindId: 'jabo', kindName: '자보도수' }),
    row({ origDay: '2026-11-16' }),
    row({ auto: 'noshow' }),
    row({ staffId: 'na', staffName: '윤○○' }),
    row({}),
    row({}),
    row({ kindId: 'inj', kindName: '주사', staffId: 'old', staffName: '퇴사○○' }),
    row({}),
    row({}),
  ]

  it('AC-5907.2: 설정이 없으면 rateSummary 차례(예약 많은 차례)와 저장된 이름으로 그린다', () => {
    render(<RateBreakdown summary={rateSummary(ROWS10)} />)
    expect(screen.getByRole('heading', { name: '시행자별' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '종류별' })).toBeTruthy()
    const [staff, kinds] = screen.getAllByRole('table')
    const staffRows = within(staff!).getAllByRole('row').map(values)
    expect(staffRows[0]).toEqual(['시행자', ...HEAD])
    expect(staffRows.slice(1)).toEqual([
      ['한○○', '7', '1', '14.3%', '1', '14.3%', '1', '14.3%'],
      ['윤○○', '2', '1', '50.0%', '0', '0.0%', '0', '0.0%'],
      ['퇴사○○', '1', '0', '0.0%', '0', '0.0%', '0', '0.0%'],
      ['합계', '10', '2', '20.0%', '1', '10.0%', '1', '10.0%'],
    ])
    expect(within(kinds!).getAllByRole('row').map((r) => values(r)[0])).toEqual(['종류', '도수', '자보도수', '주사', '합계'])
  })

  it('AC-5907.2: 설정이 있으면 설정 차례(예약 0도 보임)·(표시) 이름, 지운 시행자·종류는 아래에 저장된 이름으로', () => {
    const settings: CalSettings = {
      kinds: [
        { id: 'jabo', name: '자보도수', len: 30, color: null, words: ['자보도수'] },
        { id: 'dosu', name: '도수', len: 30, color: null, words: ['도수'] },
        { id: 'visit', name: '진료', len: 10, color: 'sage', words: ['진료'] },
      ],
      staff: [
        { id: 'na', name: '윤○○', mark: '나', color: 'basil' },
        { id: 'ga', name: '한○○', mark: '가', color: 'blueberry' },
        { id: 'ra', name: '강○○', mark: '라', color: 'tangerine' },
      ],
      openHour: 8,
      closeHour: 20,
      sunday: false,
    }
    render(<RateBreakdown summary={rateSummary(ROWS10)} settings={settings} />)
    const [staff, kinds] = screen.getAllByRole('table')
    expect(within(staff!).getAllByRole('row').map((r) => values(r).slice(0, 2))).toEqual([
      ['시행자', '예약'],
      ['(나) 윤○○', '2'],
      ['(가) 한○○', '7'],
      ['(라) 강○○', '0'],
      ['퇴사○○', '1'],
      ['합계', '10'],
    ])
    expect(within(kinds!).getAllByRole('row').map((r) => values(r).slice(0, 2))).toEqual([
      ['종류', '예약'],
      ['자보도수', '1'],
      ['도수', '8'],
      ['진료', '0'],
      ['주사', '1'],
      ['합계', '10'],
    ])
  })
})
