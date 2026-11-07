// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LapsedRow } from '@/types/patients'
import { LapsedRows } from './LapsedRows'

// 장기 미방문 환자 줄(AC-2804.3~2804.6, 시안 toolLapsed). 줄은 props로만 받는다.
// 이름·전화·차트번호·처방 이름은 모두 지어낸 값이다. 차트번호는 줄 열쇠 안에만 있다(AC-2802.7)
afterEach(cleanup)

const EMPTY = '이 기간에 마지막으로 오신 분이 없어요.'

const row = (chart: string, name: string, last: string, over: Partial<LapsedRow> = {}): LapsedRow => ({
  key: `l|${chart}|${last.replace(/-/g, '')}`,
  name,
  phone: '010-0000-2001',
  last,
  daysAgo: 32,
  visits: 8,
  reserved: false,
  contacted: false,
  groups: [],
  rxNames: [],
  ...over,
})

const ROWS = [
  row('CH-55001', '김가상', '2026-10-05', { groups: ['도수치료'], contacted: true }),
  row('CH-55002', '이나래', '2026-10-01', { daysAgo: 1234, visits: 3, reserved: true, groups: ['도수치료', '체외충격파'] }),
  row('CH-55003', '박다솜', '2026-09-15', { phone: '', daysAgo: 52, visits: 2, rxNames: ['가상진통제', '가상근이완제'] }),
]

function renderRows(over: Partial<Parameters<typeof LapsedRows>[0]> = {}) {
  const onMark = vi.fn()
  const utils = render(
    <LapsedRows rows={ROWS} onMark={onMark} busyKeys={new Set()} markErrors={new Map()} marksBlocked={false} emptyText={EMPTY} expanded={false} {...over} />,
  )
  return { ...utils, onMark }
}

const table = () => within(screen.getByRole('table'))
const bodyRows = () => table().getAllByRole('row').slice(1)
const cells = (tr: HTMLElement) => [...tr.querySelectorAll('td')].map((td) => td.textContent)
const phoneList = (container: HTMLElement) => container.querySelector('ul')!

describe('LapsedRows: 표 (AC-2804.3)', () => {
  it('AC-2804.3: 표 머리는 연락함 · 이름 · 전화 · 마지막 내원 · 마지막 진료 · 내원 횟수 · 비고다', () => {
    renderRows()
    expect(table().getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['연락함', '이름', '전화', '마지막 내원', '마지막 진료', '내원 횟수', '비고'])
  })

  it('AC-2804.3: 받은 차례대로 그리고, 마지막 내원은 M월 D일 (요일) · N일 전, 내원 횟수는 N번(오른쪽 맞춤), 예약 있음은 파랑 칩이다', () => {
    renderRows()
    expect(bodyRows().map((tr) => cells(tr).slice(1))).toEqual([
      ['김가상', '010-0000-2001', '10월 5일 (월) · 32일 전', '도수치료', '8번', ''],
      ['이나래', '010-0000-2001', '10월 1일 (목) · 1,234일 전', '도수치료 · 체외충격파', '3번', '예약 있음'],
      ['박다솜', '번호 없음', '9월 15일 (화) · 52일 전', '가상진통제 · 가상근이완제', '2번', ''],
    ])
    expect(table().getByText('예약 있음').className).toContain('bg-accent-soft')
    expect(bodyRows()[0]!.querySelectorAll('td')[5]!.className).toContain('text-right')
    expect(table().getAllByRole('columnheader')[5]!.className).toContain('text-right')
  })

  it('AC-2804.6: 묶음 이름은 그대로, 묶음이 없으면 처방 이름을 흐리게 보인다', () => {
    renderRows()
    expect(table().getByText('도수치료 · 체외충격파').className).not.toContain('text-muted')
    expect(table().getByText('가상진통제 · 가상근이완제').className).toContain('text-muted')
  })

  it('AC-2804.3: 10명이 넘으면 10명만 보이고, expanded면 모두 보인다', () => {
    const many = Array.from({ length: 13 }, (_, i) => row(`CH-6${i}`, `가상${i}`, '2026-09-01'))
    const { rerender } = render(
      <LapsedRows rows={many} onMark={vi.fn()} busyKeys={new Set()} markErrors={new Map()} marksBlocked={false} emptyText={EMPTY} expanded={false} />,
    )
    expect(bodyRows()).toHaveLength(10)
    rerender(<LapsedRows rows={many} onMark={vi.fn()} busyKeys={new Set()} markErrors={new Map()} marksBlocked={false} emptyText={EMPTY} expanded />)
    expect(bodyRows()).toHaveLength(13)
  })

  it('AC-2804.4: 줄이 없으면 표와 휴대폰 줄에 빈 글 한 줄이다', () => {
    const { container } = renderRows({ rows: [] })
    expect(bodyRows().map((tr) => tr.textContent)).toEqual([EMPTY])
    expect(within(phoneList(container)).getAllByRole('listitem').map((li) => li.textContent)).toEqual([EMPTY])
  })

  it('AC-2804.3: 휴대폰 줄은 이름(+예약 있음) + 연락함 상자, 아래 마지막 내원·마지막 진료·전화 · N번 오심이다', () => {
    const { container } = renderRows()
    expect(screen.getByRole('table').closest('div')!.className).toContain('max-md:hidden')
    const list = phoneList(container)
    expect(list.className).toContain('md:hidden')
    const items = within(list).getAllByRole('listitem')
    expect([...items[1]!.querySelectorAll('p')].map((p) => p.textContent)).toEqual(['마지막 내원 10월 1일 (목) · 1,234일 전', '마지막 진료 도수치료 · 체외충격파', '010-0000-2001 · 3번 오심'])
    expect(within(items[1]!).getByText('예약 있음')).toBeTruthy()
    expect(within(items[1]!).getByRole('checkbox', { name: '이나래 연락함' })).toBeTruthy()
    expect(items[2]!.textContent).toContain('번호 없음 · 2번 오심')
  })
})

describe('LapsedRows: 연락함 체크 (AC-2804.5)', () => {
  it('AC-2804.5: F/U 연락함과 같은 모양 — 표시된 줄은 체크 + 연락함 글자. 누르면 onMark(열쇠, 반대 값)', () => {
    const { onMark } = renderRows()
    const done = table().getByRole('checkbox', { name: '김가상 연락함' }) as HTMLInputElement
    expect(done.checked).toBe(true)
    expect(cells(bodyRows()[0]!)[0]).toBe('연락함')
    expect(cells(bodyRows()[1]!)[0]).toBe('')
    fireEvent.click(table().getByRole('checkbox', { name: '이나래 연락함' }))
    expect(onMark).toHaveBeenCalledWith(ROWS[1]!.key, true)
  })

  it('AC-2804.5: 저장 중 글자·aria-busy, 실패한 줄 아래 실패 줄과 오류 번호', () => {
    renderRows({ busyKeys: new Set([ROWS[0]!.key]), markErrors: new Map([[ROWS[1]!.key, 'E-STORE-FAILED']]) })
    expect(table().getByRole('checkbox', { name: '김가상 연락함' }).getAttribute('aria-busy')).toBe('true')
    expect(cells(bodyRows()[0]!)[0]).toBe('저장 중')
    expect(bodyRows()[2]!.textContent).toContain('연락함을 저장하지 못했어요. 다시 눌러 주세요.')
    expect(bodyRows()[2]!.textContent).toContain('오류 번호 E-STORE-FAILED')
  })

  it('AC-2804.5: 표시를 못 불러왔으면 체크가 모두 막힌다', () => {
    renderRows({ marksBlocked: true })
    for (const box of screen.getAllByRole('checkbox')) expect((box as HTMLInputElement).disabled).toBe(true)
  })
})

describe('울타리 (AC-2802.7·AC-2806.2)', () => {
  it('AC-2802.7: 차트번호는 줄 열쇠 안에만 있고 화면 글자·속성으로 보이지 않는다', () => {
    const { container } = renderRows({ markErrors: new Map([[ROWS[0]!.key, 'E-STORE-FAILED']]), expanded: true })
    expect(container.innerHTML).not.toMatch(/CH-\d+/)
  })

  it('AC-2806.2: 줄 부품 파일은 네트워크·브라우저 저장소·console·supabase를 쓰지 않는다(props로만 받는다)', () => {
    const source = readFileSync(join(process.cwd(), 'src/components/patients/rows/LapsedRows.tsx'), 'utf8')
    expect(source).not.toMatch(/\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|indexedDB|console)\b|supabase|lib\/storage/)
  })
})
