// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MissedRow, ReservationRow } from '@/types/patients'
import { MissedRows, NoPhoneBox, ReservationRows } from './ReservationRows'

// 예약 문자 명단 환자 줄(AC-2803.1·2803.4·2803.5·2803.8·2803.9, 시안 toolReservations·pastSection). 줄은 props로만 받는다.
// 이름·전화·차트번호는 모두 지어낸 값이다. 차트번호는 줄 열쇠 안에만 있다(AC-2802.7)
afterEach(cleanup)

const EMPTY = '이 날 예약하신 분이 없어요. 비트에 예약 대기를 채운 뒤 [다시 불러오기]를 눌러 주세요.'
const MISSED_EMPTY = '이 기간에 안 오신 분이 없어요.'

const row = (chart: string, time: string, name: string, phone: string, over: Partial<ReservationRow> = {}): ReservationRow => ({
  key: `s|${chart}|20261107${time.replace(':', '')}`,
  time: `${Number(time.slice(0, 2)) < 12 ? '오전' : '오후'} ${Number(time.slice(0, 2)) > 12 ? Number(time.slice(0, 2)) - 12 : Number(time.slice(0, 2))}:${time.slice(3)}`,
  name,
  phone,
  sent: false,
  ...over,
})

const ROWS = [
  row('CH-77001', '09:00', '김가상', '010-0000-1200', { sent: true }),
  row('CH-77002', '12:30', '이나래', '010-0000-1201'),
  row('CH-77003', '14:00', '박다솜', ''),
  row('CH-77004', '15:00', '', '010-0000-1203'),
]

const missedRow = (chart: string, day: string, time: string, name: string, over: Partial<MissedRow> = {}): MissedRow => ({
  key: `s|${chart}|${day.replace(/-/g, '')}1700`,
  day,
  time,
  name,
  phone: '010-0000-1301',
  mark: '예약 취소',
  after: null,
  ...over,
})

function renderRows(over: Partial<Parameters<typeof ReservationRows>[0]> = {}) {
  const onMark = vi.fn()
  const utils = render(
    <ReservationRows rows={ROWS} onMark={onMark} busyKeys={new Set()} markErrors={new Map()} marksBlocked={false} emptyText={EMPTY} {...over} />,
  )
  return { ...utils, onMark }
}

const table = () => within(screen.getByRole('table'))
const bodyRows = () => table().getAllByRole('row').slice(1)
const cells = (tr: HTMLElement) => [...tr.querySelectorAll('td')].map((td) => td.textContent)
const phoneList = (container: HTMLElement) => container.querySelector('ul')!

describe('ReservationRows: 표 (AC-2803.1)', () => {
  it('AC-2803.1: 표 머리는 보냄 · 예약 시각 · 이름 · 전화이고 받은 차례대로 시각·이름·전화를 그린다', () => {
    renderRows()
    expect(table().getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['보냄', '예약 시각', '이름', '전화'])
    expect(bodyRows().map((tr) => cells(tr).slice(1))).toEqual([
      ['오전 9:00', '김가상', '010-0000-1200'],
      ['오후 12:30', '이나래', '010-0000-1201'],
      ['오후 2:00', '박다솜', '번호 없음'],
      ['오후 3:00', '이름 없음', '010-0000-1203'],
    ])
  })

  it('AC-2803.1: 번호 없음·이름 없음은 흐린 글자다', () => {
    renderRows()
    expect(table().getByText('번호 없음').className).toContain('text-muted')
    expect(table().getByText('이름 없음').className).toContain('text-muted')
  })

  it('AC-2803.1: 휴대폰 줄은 이름 + 보냄 상자, 아래 줄에 시각 · 전화다(폭으로 하나만 보인다)', () => {
    const { container } = renderRows()
    expect(screen.getByRole('table').closest('div')!.className).toContain('max-md:hidden')
    const list = phoneList(container)
    expect(list.className).toContain('md:hidden')
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(4)
    expect(items[0]!.textContent).toContain('김가상')
    expect(items[0]!.textContent).toContain('오전 9:00 · 010-0000-1200')
    expect(items[2]!.textContent).toContain('오후 2:00 · 번호 없음')
    expect(within(items[0]!).getByRole('checkbox', { name: '김가상 보냄' })).toBeTruthy()
  })

  it('AC-2803.4: 줄이 없으면 표와 휴대폰 줄에 빈 글 한 줄이다', () => {
    const { container } = renderRows({ rows: [] })
    expect(bodyRows().map((tr) => tr.textContent)).toEqual([EMPTY])
    expect(within(phoneList(container)).getAllByRole('listitem').map((li) => li.textContent)).toEqual([EMPTY])
  })
})

describe('ReservationRows: 보냄 체크 (AC-2803.8)', () => {
  it('AC-2803.8: F/U 연락함과 같은 모양 — 표시된 줄은 체크 + 보냄 글자, 아닌 줄은 글자 없음. 누르면 onMark(열쇠, 반대 값)', () => {
    const { onMark } = renderRows()
    const sent = table().getByRole('checkbox', { name: '김가상 보냄' }) as HTMLInputElement
    const unsent = table().getByRole('checkbox', { name: '이나래 보냄' }) as HTMLInputElement
    expect(sent.checked).toBe(true)
    expect(unsent.checked).toBe(false)
    expect(cells(bodyRows()[0]!)[0]).toBe('보냄')
    expect(cells(bodyRows()[1]!)[0]).toBe('')
    fireEvent.click(unsent)
    fireEvent.click(sent)
    expect(onMark.mock.calls).toEqual([
      [ROWS[1]!.key, true],
      [ROWS[0]!.key, false],
    ])
    // 이름 없는 분도 상자 이름이 있다
    expect(table().getByRole('checkbox', { name: '이름 없음 보냄' })).toBeTruthy()
  })

  it('AC-2803.8: 저장 중인 줄은 저장 중 글자·aria-busy이고, 실패한 줄 아래에 실패 줄과 오류 번호가 있다', () => {
    renderRows({ busyKeys: new Set([ROWS[1]!.key]), markErrors: new Map([[ROWS[2]!.key, 'E-STORE-FAILED']]) })
    const busy = table().getByRole('checkbox', { name: '이나래 보냄' })
    expect(busy.getAttribute('aria-busy')).toBe('true')
    expect(cells(bodyRows()[1]!)[0]).toBe('저장 중')
    const failed = bodyRows()[3]!
    expect(failed.textContent).toContain('보냄 표시를 저장하지 못했어요. 다시 눌러 주세요.')
    expect(failed.textContent).toContain('오류 번호 E-STORE-FAILED')
  })

  it('AC-2803.8: 표시를 못 불러왔으면 체크가 모두 막힌다', () => {
    renderRows({ marksBlocked: true })
    for (const box of screen.getAllByRole('checkbox')) expect((box as HTMLInputElement).disabled).toBe(true)
  })
})

describe('NoPhoneBox (AC-2803.9)', () => {
  it('AC-2803.9: 번호 없는 분이 있으면 표 위 주의 칸에 수와 한 분마다 이름 · 예약 시각 줄이 있다', () => {
    render(<NoPhoneBox rows={[...ROWS, row('CH-77005', '17:30', '최라온', '')]} />)
    const box = screen.getByRole('note')
    expect([...box.querySelectorAll('p')].map((p) => p.textContent)).toEqual([
      '번호 없는 2분은 문자가 안 가요. 전화로 알려 주세요.',
      '박다솜 · 오후 2:00',
      '최라온 · 오후 5:30',
    ])
    expect(box.className).toContain('bg-warning-soft')
  })

  it('AC-2803.9: 모두 번호가 있으면 주의 칸이 없다', () => {
    const { container } = render(<NoPhoneBox rows={[ROWS[0]!, ROWS[1]!]} />)
    expect(container.innerHTML).toBe('')
  })
})

describe('MissedRows: 지난 예약 · 안 오신 분 (AC-2803.5·2803.6)', () => {
  const MISSED = [
    missedRow('CH-88001', '2026-11-05', '오후 5:00', '이나래'),
    missedRow('CH-88002', '2026-11-04', '오후 3:00', '박다솜', { after: '2026-11-05' }),
    missedRow('CH-88003', '2026-11-04', '오전 9:30', '최라온', { mark: '예약 그대로', phone: '' }),
  ]

  it('AC-2803.5: 표 머리는 예약한 때 · 이름 · 전화 · 비트 표시 · 그 뒤이고, 예약한 때는 M월 D일 (요일) 오전 h:mm이다', () => {
    render(<MissedRows rows={MISSED} expanded={false} emptyText={MISSED_EMPTY} />)
    expect(table().getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['예약한 때', '이름', '전화', '비트 표시', '그 뒤'])
    expect(bodyRows().map(cells)).toEqual([
      ['11월 5일 (목) 오후 5:00', '이나래', '010-0000-1301', '예약 취소', '아직 안 오심'],
      ['11월 4일 (수) 오후 3:00', '박다솜', '010-0000-1301', '예약 취소', '11월 5일에 오심'],
      ['11월 4일 (수) 오전 9:30', '최라온', '번호 없음', '예약 그대로', '아직 안 오심'],
    ])
  })

  it('AC-2803.5: 비트 표시는 예약 취소 회색 칩·예약 그대로 주황 칩, 그 뒤는 오신 날 초록·아직 안 오심 흐림', () => {
    render(<MissedRows rows={MISSED} expanded={false} emptyText={MISSED_EMPTY} />)
    expect(table().getAllByText('예약 취소')[0]!.className).toContain('bg-canvas')
    expect(table().getByText('예약 그대로').className).toContain('bg-warning-soft')
    expect(table().getByText('11월 5일에 오심').className).toContain('text-positive')
    expect(table().getAllByText('아직 안 오심')[0]!.className).toContain('text-muted')
  })

  it('AC-2803.5: 휴대폰 줄은 이름 + 비트 표시, 아래 예약한 때 · 전화와 그 뒤다', () => {
    const { container } = render(<MissedRows rows={MISSED} expanded={false} emptyText={MISSED_EMPTY} />)
    const items = within(phoneList(container)).getAllByRole('listitem')
    expect(items[1]!.textContent).toBe('박다솜예약 취소11월 4일 (수) 오후 3:00 · 010-0000-130111월 5일에 오심')
  })

  it('AC-2803.5: 10건이 넘으면 10건만 보이고, expanded면 모두 보인다', () => {
    const many = Array.from({ length: 12 }, (_, i) => missedRow(`CH-9${i}`, '2026-11-03', '오전 10:00', `가상${i}`))
    const { rerender } = render(<MissedRows rows={many} expanded={false} emptyText={MISSED_EMPTY} />)
    expect(bodyRows()).toHaveLength(10)
    rerender(<MissedRows rows={many} expanded emptyText={MISSED_EMPTY} />)
    expect(bodyRows()).toHaveLength(12)
  })

  it('AC-2803.6: 줄이 없으면 이 기간에 안 오신 분이 없어요.', () => {
    const { container } = render(<MissedRows rows={[]} expanded={false} emptyText={MISSED_EMPTY} />)
    expect(bodyRows().map((tr) => tr.textContent)).toEqual([MISSED_EMPTY])
    expect(within(phoneList(container)).getAllByRole('listitem').map((li) => li.textContent)).toEqual([MISSED_EMPTY])
  })
})

describe('울타리 (AC-2802.7·AC-2806.2)', () => {
  it('AC-2802.7: 차트번호는 줄 열쇠 안에만 있고 화면 글자·속성으로 보이지 않는다', () => {
    const { container } = render(
      <>
        <ReservationRows rows={ROWS} onMark={vi.fn()} busyKeys={new Set()} markErrors={new Map([[ROWS[0]!.key, 'E-STORE-FAILED']])} marksBlocked={false} emptyText={EMPTY} />
        <NoPhoneBox rows={ROWS} />
        <MissedRows rows={[missedRow('CH-88001', '2026-11-05', '오후 5:00', '이나래')]} expanded emptyText={MISSED_EMPTY} />
      </>,
    )
    expect(container.innerHTML).not.toMatch(/CH-\d+/)
  })

  it('AC-2806.2: 줄 부품 파일은 네트워크·브라우저 저장소·console·supabase를 쓰지 않는다(props로만 받는다)', () => {
    const source = readFileSync(join(process.cwd(), 'src/components/patients/rows/ReservationRows.tsx'), 'utf8')
    expect(source).not.toMatch(/\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|indexedDB|console)\b|supabase|lib\/storage/)
  })
})
