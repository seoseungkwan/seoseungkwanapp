// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GsheetMonth } from '@/types/gsheet'
import { MonthPicker, monthChoices } from './MonthPicker'

// 띠의 달 고르기(spec google-link AC-8514.4, 시안 notes-sunap '공통 — 위 한 줄 띠'·pastmonth).
// 기대 글은 notes 글자 그대로: 단추 '2026년 11월', 화면 읽기 이름 '달 고르기 — 지금 2026년 11월', 말풍선 '다른 달 파일 열기',
// 펼치면 이번 달 맨 위 '2026년 11월 · 이번 달' + 지난 12달, 파일이 없는 달은 흐리게 '파일 없음'

const FILE = (tag: string) => `FakeFile${tag}xxxxxxxxxxxxxxxx`
const MONTHS: GsheetMonth[] = [
  { ym: '2026-11', fileId: FILE('Nov2026'), gids: { '26': 123456 } },
  { ym: '2026-10', fileId: FILE('Oct2026'), gids: { '1': 222 } },
  { ym: '2026-08', fileId: FILE('Aug2026'), gids: {} },
  { ym: '2025-11', fileId: FILE('Nov2025'), gids: {} },
  // 13달 밖·모양이 틀린 파일 id는 목록에 들지 않는다
  { ym: '2025-10', fileId: FILE('Oct2025'), gids: {} },
  { ym: '2026-07', fileId: 'bad/id', gids: {} },
]

afterEach(cleanup)

describe('AC-8514.4: 달 목록 셈 — 이번 달 + 지난 12달', () => {
  it('AC-8514.4: 이번 달부터 지난 달 차례로 13달, 파일이 있는 달만 hasFile', () => {
    const list = monthChoices('2026-11', MONTHS)
    expect(list.map((c) => c.ym)).toEqual([
      '2026-11', '2026-10', '2026-09', '2026-08', '2026-07', '2026-06', '2026-05', '2026-04', '2026-03', '2026-02', '2026-01', '2025-12', '2025-11',
    ])
    expect(list.filter((c) => c.hasFile).map((c) => c.ym)).toEqual(['2026-11', '2026-10', '2026-08', '2025-11'])
  })

  it('AC-8514.4: 해가 바뀌는 1월도 지난해 12달로 이어진다', () => {
    expect(monthChoices('2027-01', []).map((c) => c.ym).slice(0, 3)).toEqual(['2027-01', '2026-12', '2026-11'])
  })
})

describe('AC-8514.4: 달 고르기 단추와 펼친 목록', () => {
  function renderPicker(current = '2026-11', onPick = vi.fn()) {
    render(<MonthPicker choices={monthChoices('2026-11', MONTHS)} current={current} thisMonth="2026-11" onPick={onPick} />)
    return onPick
  }
  const trigger = () => screen.getByRole('button', { name: /^달 고르기 — 지금/ })

  it('AC-8514.4: 단추 글 "2026년 11월", 화면 읽기 이름 "달 고르기 — 지금 2026년 11월", 말풍선 "다른 달 파일 열기"', () => {
    renderPicker()
    const button = trigger()
    expect(button.textContent).toBe('2026년 11월')
    expect(button.getAttribute('aria-label')).toBe('달 고르기 — 지금 2026년 11월')
    expect(button.getAttribute('title')).toBe('다른 달 파일 열기')
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('AC-8514.4: 펼치면 이번 달 맨 위 "2026년 11월 · 이번 달", 그 아래 지난 12달', () => {
    renderPicker()
    fireEvent.click(trigger())
    expect(trigger().getAttribute('aria-expanded')).toBe('true')
    const items = within(screen.getByRole('list')).getAllByRole('button')
    expect(items).toHaveLength(13)
    expect(items[0].textContent).toBe('2026년 11월 · 이번 달')
    expect(items[1].textContent).toBe('2026년 10월')
    expect(items[12].textContent).toBe('2025년 11월')
  })

  it('AC-8514.4: 파일이 없는 달은 흐리게 "파일 없음"이고 고를 수 없다', () => {
    const onPick = renderPicker()
    fireEvent.click(trigger())
    const sept = within(screen.getByRole('list')).getByRole('button', { name: '2026년 9월 파일 없음' })
    expect(sept).toHaveProperty('disabled', true)
    expect(sept.className).toContain('text-muted')
    fireEvent.click(sept)
    expect(onPick).not.toHaveBeenCalled()
  })

  it('AC-8514.4: 지난 달을 고르면 onPick(그 달)이고 목록이 닫힌다', () => {
    const onPick = renderPicker()
    fireEvent.click(trigger())
    fireEvent.click(within(screen.getByRole('list')).getByRole('button', { name: '2026년 10월' }))
    expect(onPick).toHaveBeenCalledWith('2026-10')
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('AC-8514.4: 지난 달을 보고 있으면 단추가 주황 테두리, 이번 달은 언제든 고를 수 있다', () => {
    const onPick = renderPicker('2026-10')
    const button = trigger()
    expect(button.textContent).toBe('2026년 10월')
    expect(button.getAttribute('aria-label')).toBe('달 고르기 — 지금 2026년 10월')
    expect(button.className).toContain('border-warning')
    fireEvent.click(button)
    fireEvent.click(within(screen.getByRole('list')).getByRole('button', { name: '2026년 11월 · 이번 달' }))
    expect(onPick).toHaveBeenCalledWith('2026-11')
  })

  it('AC-8514.4: 이번 달을 보고 있으면 주황 테두리가 없다', () => {
    renderPicker('2026-11')
    expect(trigger().className).not.toContain('border-warning')
  })

  it('AC-8514.4: Esc를 누르면 목록이 닫힌다', () => {
    renderPicker()
    fireEvent.click(trigger())
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('list')).toBeNull()
  })
})
