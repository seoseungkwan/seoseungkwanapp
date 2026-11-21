// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { esc, kit, openMonth, resetKit } from './scheduleTestKit'

// 근무표 화면 — ② 달 보기 · ⑤ 이달 더 일한 시간 (staff AC-7613.2, 시안 schedule.html ②·⑤). 보기 자료·도구는 scheduleTestKit.tsx

vi.mock('@/components/staff/useStaffBase', () => ({ useStaffBase: vi.fn() }))

beforeEach(resetKit)
afterEach(cleanup)

// ── ② 달 보기 · ⑤ 이달 더 일한 시간 ───────────────────────────

describe('AC-7613.2: 달 보기', () => {
  it('AC-7613.2: 도구 줄 — [◀ 지난달]·[이번 달]·[다음 달 ▶], "2026년 11월", [달]이 눌리고 칸 숫자 안내 글이 보인다', async () => {
    await openMonth()
    for (const name of ['◀ 지난달', '이번 달', '다음 달 ▶']) expect(screen.getByRole('button', { name })).toBeTruthy()
    expect(screen.getByText('2026년 11월')).toBeTruthy()
    expect(within(screen.getByRole('group', { name: '보기' })).getByRole('button', { name: '달' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('칸의 숫자는 그날 일한 사람 수예요. 하루 휴가는 빼고, 반차는 넣어서 세요.')).toBeTruthy()
    // 달력이 덮는 주 전부(10-26 ~ 12-06)를 읽는다
    expect(kit.store.listChanges).toHaveBeenLastCalledWith({ from: '2026-10-26', to: '2026-12-06' })
  })

  it('AC-7613.2·AC-7605.7: 칸마다 "{n}명"·휴진일 "휴진"(일한 사람이 있으면 "휴진 {n}명")·휴가 칩 "{종류} {이름}"이다', async () => {
    await openMonth()
    const day = (label: string) => screen.getByRole('button', { name: new RegExp(`^${esc(label)}( |$)`) })
    expect(day('11월 2일 (월)').textContent).toBe('26명')
    expect(day('11월 3일 (화)').textContent).toBe('35명')
    expect(day('11월 7일 (토)').textContent).toBe('71명연차 김하늘')
    expect(day('11월 13일 (금)').textContent).toBe('136명오후 반차 박서연')
    expect(day('11월 14일 (토)').textContent).toBe('142명')
    expect(day('11월 15일 (일)').textContent).toBe('15휴진 1명')
    expect(day('11월 18일 (수)').textContent).toBe('185명병가 정유나')
    expect(day('11월 21일 (토)').textContent).toBe('21 오늘2명')
    expect(day('11월 22일 (일)').textContent).toBe('22휴진')
    expect(day('11월 28일 (토)').textContent).toBe('281명연차 이도윤')
    expect(day('11월 30일 (월)').textContent).toBe('306명')
    expect(day('11월 15일 (일)').getAttribute('data-rest')).toBe('true')
    expect(day('11월 21일 (토)').getAttribute('aria-current')).toBe('date')
    // 달 밖 날은 숫자만(누를 수 없다)
    expect(screen.queryByRole('button', { name: /^10월 26일/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^12월 1일/ })).toBeNull()
  })

  it('AC-7613.2: 달력 아래 휴가 목록 "{d}일 ({요일}) {종류} {이름}"', async () => {
    await openMonth()
    const items = within(screen.getByRole('list', { name: '이달 휴가' })).getAllByRole('listitem').map((li) => li.textContent)
    expect(items).toEqual(['7일 (토) 연차 김하늘', '13일 (금) 오후 반차 박서연', '18일 (수) 병가 정유나', '28일 (토) 연차 이도윤'])
  })

  it('AC-7613.2·AC-7605.5: "{M}월 더 일한 시간" 표 — 이름 아래 내역, 0은 "–", "모두" 줄, 💡 안내', async () => {
    await openMonth()
    const sum = screen.getByRole('table', { name: '11월 더 일한 시간' })
    expect(within(sum).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['이름', '연장', '야간', '휴일', '합계'])
    const rows = within(sum)
      .getAllByRole('row')
      .slice(1)
      .map((tr) => Array.from(tr.children).map((td) => td.textContent))
    expect(rows).toEqual([
      ['최민준 15일 (일, 휴진일) 휴일 4시간', '–', '–', '4시간', '4시간'],
      ['김하늘 10일 (화) 야간 1시간', '–', '1시간', '–', '1시간'],
      ['이도윤 11일 (수) 연장 2시간 · 18일 (수) 연장 2시간', '4시간', '–', '–', '4시간'],
      ['정유나', '–', '–', '–', '–'],
      ['박서연 12일 (목) 연장 1시간 · 20일 (금) 연장 1시간 30분', '2시간 30분', '–', '–', '2시간 30분'],
      ['한지우', '–', '–', '–', '–'],
      ['모두', '6시간 30분', '1시간', '4시간', '11시간 30분'],
    ])
    expect(screen.getByText('💡 이 시간은 급여 화면과 세무사 자료에 자동으로 들어가요.')).toBeTruthy()
  })

  it('AC-7613.2: 날짜를 누르면 그 주 주 보기다', async () => {
    await openMonth()
    fireEvent.click(screen.getByRole('button', { name: /^11월 25일 \(수\)/ }))
    expect(await screen.findByText('11월 23일 (월) ~ 29일 (일)')).toBeTruthy()
    expect(within(screen.getByRole('group', { name: '보기' })).getByRole('button', { name: '주' }).getAttribute('aria-pressed')).toBe('true')
    expect(await screen.findByRole('table', { name: '주 근무표' })).toBeTruthy()
  })

  it('AC-7613.2: [다음 달 ▶]·[◀ 지난달]·[이번 달]로 달을 옮긴다', async () => {
    await openMonth()
    fireEvent.click(screen.getByRole('button', { name: '다음 달 ▶' }))
    expect(await screen.findByText('2026년 12월')).toBeTruthy()
    expect(await screen.findByRole('heading', { name: '12월 더 일한 시간' })).toBeTruthy()
    expect(screen.queryByRole('list', { name: '이달 휴가' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '이번 달' }))
    expect(await screen.findByText('2026년 11월')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '◀ 지난달' }))
    expect(await screen.findByText('2026년 10월')).toBeTruthy()
  })
})
