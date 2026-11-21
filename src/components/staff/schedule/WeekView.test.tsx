// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StaffStoreError } from '@/lib/storage/staff'
import { ScheduleScreen } from './ScheduleScreen'
import { TODAY, cell, kit, makeBase, openDialog, renderWeek, resetKit, table } from './scheduleTestKit'

// 근무표 화면 — 페이지와 ① 주 보기 (staff AC-7613.1, 시안 docs/mockups/staff/schedule.html ①). 보기 자료·도구는 scheduleTestKit.tsx

vi.mock('@/components/staff/useStaffBase', () => ({ useStaffBase: vi.fn() }))

beforeEach(resetKit)
afterEach(cleanup)

// ── 페이지 ──────────────────────────────────────────────────

describe('AC-7613.1: /staff/schedule 페이지', () => {
  it('AC-7613.1·AC-7611.2: 탭 이름 "직원"·요청 때 그리기이고, 요청 때의 한국 날짜를 오늘로 넘겨 근무표 화면을 그린다', async () => {
    const page = await import('@/app/(app)/staff/schedule/page')
    const { todayInKorea } = await import('@/lib/analytics/dates')
    expect(page.metadata).toEqual({ title: '직원' })
    expect(page.dynamic).toBe('force-dynamic')
    const element = page.default()
    expect(element.type).toBe(ScheduleScreen)
    expect(element.props).toEqual({ today: todayInKorea() })
  })
})


// ── ① 주 보기 ────────────────────────────────────────────────

describe('AC-7613.1: 주 보기', () => {
  it('AC-7613.1: 도구 줄 — [◀ 지난주]·[이번 주]·[다음 주 ▶], 기간 "11월 16일 (월) ~ 22일 (일)", [주]·[달]에서 주가 눌려 있다', async () => {
    await renderWeek()
    for (const name of ['◀ 지난주', '이번 주', '다음 주 ▶']) expect(screen.getByRole('button', { name })).toBeTruthy()
    expect(screen.getByText('11월 16일 (월) ~ 22일 (일)')).toBeTruthy()
    const views = within(screen.getByRole('group', { name: '보기' })).getAllByRole('button')
    expect(views.map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([
      ['주', 'true'],
      ['달', 'false'],
    ])
    // 이 주의 바뀐 날·더 일한 시간·휴가를 읽는다
    expect(kit.store.listChanges).toHaveBeenCalledWith({ from: '2026-11-16', to: '2026-11-22' })
    expect(kit.store.listOvertime).toHaveBeenCalledWith({ from: '2026-11-16', to: '2026-11-22' })
    expect(kit.store.listLeaves).toHaveBeenCalledWith({ from: '2026-11-16', to: '2026-11-22' })
  })

  it('AC-7613.1: 머리는 "{d} {요일}"이고 오늘은 "· 오늘", 휴진은 "· 휴진"이다', async () => {
    await renderWeek()
    const heads = within(table()).getAllByRole('columnheader').map((th) => th.textContent)
    expect(heads).toEqual(['이름', '16 월', '17 화', '18 수', '19 목', '20 금', '21 토 · 오늘', '22 일 · 휴진'])
  })

  it('AC-7613.1: 줄은 재직자만 명단 차례이고 이름 아래 "{직종} · 토 1·3주"·"토 2·4주"·"월·수·금"·"월~금", 맨 아래 "일한 사람" 줄이다', async () => {
    await renderWeek()
    expect(within(table()).getAllByRole('rowheader').map((th) => th.textContent)).toEqual([
      '최민준 방사선사 · 토 1·3주',
      '김하늘 간호조무사 · 토 1·3주',
      '이도윤 물리치료사 · 토 2·4주',
      '정유나 원무 · 월·수·금',
      '박서연 물리치료사 · 토 2·4주',
      '한지우 원무 · 월~금',
      '일한 사람',
    ])
    expect(screen.queryByText(/문태호/)).toBeNull()
  })

  it('AC-7613.1: 칸은 "09–18"·"09–13"·"쉼"·휴가 칩·"+연장 {시간}"이고, 바꾼 날은 주황 점, 휴진일 칸은 회색이다', async () => {
    await renderWeek()
    expect(cell('김하늘', '11월 16일 (월)').textContent).toBe('09–18')
    expect(cell('김하늘', '11월 21일 (토)').textContent).toBe('09–13')
    expect(cell('이도윤', '11월 21일 (토)').textContent).toBe('쉼')
    expect(cell('정유나', '11월 17일 (화)').textContent).toBe('쉼')
    // 하루 휴가는 칩만
    expect(cell('정유나', '11월 18일 (수)').textContent).toBe('병가')
    // 더 일한 시간
    const doyun = cell('이도윤', '11월 18일 (수)')
    expect(within(doyun).getByText('09–18')).toBeTruthy()
    expect(within(doyun).getByText('+연장 2시간')).toBeTruthy()
    expect(within(cell('박서연', '11월 20일 (금)')).getByText('+연장 1시간 30분')).toBeTruthy()
    // 바꾼 날: 주황 점 + 바꾼 시간
    const seoyeon = cell('박서연', '11월 19일 (목)')
    expect(within(seoyeon).getByText('10–19')).toBeTruthy()
    expect(within(seoyeon).getByRole('img', { name: '기본과 다르게 바꾼 날' })).toBeTruthy()
    expect(within(cell('한지우', '11월 20일 (금)')).getByText('09–15')).toBeTruthy()
    expect(within(cell('한지우', '11월 20일 (금)')).getByRole('img', { name: '기본과 다르게 바꾼 날' })).toBeTruthy()
    expect(within(cell('김하늘', '11월 16일 (월)')).queryByRole('img')).toBeNull()
    // 휴진일(일요일)은 회색 빈 칸
    const sunday = cell('김하늘', '11월 22일 (일)')
    expect(sunday.textContent).toBe('')
    expect(sunday.closest('td')?.getAttribute('data-rest')).toBe('true')
    expect(cell('김하늘', '11월 16일 (월)').closest('td')?.getAttribute('data-rest')).toBeNull()
  })

  it('AC-7613.1·AC-7605.7: "일한 사람" 줄은 날마다 "{n}명"(하루 휴가 빼고 반차는 넣음)이다', async () => {
    await renderWeek()
    const foot = within(table()).getByRole('rowheader', { name: '일한 사람' }).closest('tr')!
    expect(within(foot).getAllByRole('cell').map((td) => td.textContent)).toEqual(['6명', '5명', '5명', '5명', '6명', '2명', '0명'])
  })

  it('AC-7613.1: 지난주 — 반차는 일한 시간 "09–13" + 칩, 휴진일에 일한 사람은 회색 칸에 시간·점·"+휴일 4시간", 일한 사람 15일 1명', async () => {
    await renderWeek()
    fireEvent.click(screen.getByRole('button', { name: '◀ 지난주' }))
    expect(await screen.findByText('11월 9일 (월) ~ 15일 (일)')).toBeTruthy()
    await waitFor(() => expect(kit.store.listChanges).toHaveBeenLastCalledWith({ from: '2026-11-09', to: '2026-11-15' }))
    await waitFor(() => expect(within(cell('박서연', '11월 13일 (금)')).getByText('오후 반차')).toBeTruthy())
    const half = cell('박서연', '11월 13일 (금)')
    expect(within(half).getByText('09–13')).toBeTruthy()
    const minjun = cell('최민준', '11월 15일 (일)')
    expect(within(minjun).getByText('09–13')).toBeTruthy()
    expect(within(minjun).getByText('+휴일 4시간')).toBeTruthy()
    expect(within(minjun).getByRole('img', { name: '기본과 다르게 바꾼 날' })).toBeTruthy()
    expect(minjun.closest('td')?.getAttribute('data-rest')).toBe('true')
    expect(within(cell('김하늘', '11월 10일 (화)')).getByText('+야간 1시간')).toBeTruthy()
    const foot = within(table()).getByRole('rowheader', { name: '일한 사람' }).closest('tr')!
    expect(within(foot).getAllByRole('cell').map((td) => td.textContent)).toEqual(['6명', '5명', '6명', '5명', '6명', '2명', '1명'])
  })

  it('AC-7613.1: [다음 주 ▶]는 다음 주를 읽어 그리고(28일 이도윤 연차 칩), [이번 주]는 오늘이 든 주로 돌아온다', async () => {
    await renderWeek()
    fireEvent.click(screen.getByRole('button', { name: '다음 주 ▶' }))
    expect(await screen.findByText('11월 23일 (월) ~ 29일 (일)')).toBeTruthy()
    await waitFor(() => expect(cell('이도윤', '11월 28일 (토)').textContent).toBe('연차'))
    expect(kit.store.listLeaves).toHaveBeenLastCalledWith({ from: '2026-11-23', to: '2026-11-29' })
    fireEvent.click(screen.getByRole('button', { name: '이번 주' }))
    expect(await screen.findByText('11월 16일 (월) ~ 22일 (일)')).toBeTruthy()
  })

  it('AC-7613.1: 공휴일은 머리 "· 공휴일"·회색 칸이고 일한 사람 0명이다(2026-12-25 성탄절)', async () => {
    await renderWeek('2026-12-24')
    expect(screen.getByText('12월 21일 (월) ~ 27일 (일)')).toBeTruthy()
    const heads = within(table()).getAllByRole('columnheader').map((th) => th.textContent)
    expect(heads).toContain('25 금 · 공휴일')
    expect(heads).toContain('24 목 · 오늘')
    const xmas = cell('김하늘', '12월 25일 (금)')
    expect(xmas.textContent).toBe('')
    expect(xmas.closest('td')?.getAttribute('data-rest')).toBe('true')
    const foot = within(table()).getByRole('rowheader', { name: '일한 사람' }).closest('tr')!
    expect(within(foot).getAllByRole('cell').map((td) => td.textContent)[4]).toBe('0명')
  })

  it('AC-7613.1·AC-7605.3: 공휴일 목록이 없는 해(2028)의 주에는 "{YYYY}년 공휴일 목록이 아직 없어요. …" 안내가 보인다', async () => {
    await renderWeek('2028-01-05')
    expect(screen.getByText('2028년 공휴일 목록이 아직 없어요. 쉬는 날은 설정 → 병원 정보 휴진일로 넣어 주세요.')).toBeTruthy()
    cleanup()
    await renderWeek()
    expect(screen.queryByText(/공휴일 목록이 아직 없어요/)).toBeNull()
  })

  it('AC-7613.1: 칸 뜻 안내 줄 — 근무 시간·쉬는 날·휴가·바꾼 날·더 일한 시간·공휴일·휴진일', async () => {
    await renderWeek()
    const items = within(screen.getByRole('list', { name: '칸 뜻' })).getAllByRole('listitem').map((li) => li.textContent)
    expect(items).toEqual([
      '09–18 근무 시간',
      '쉼 쉬는 날',
      '연차 오후 반차 병가 휴가(휴가 화면에서 넣은 것)',
      '기본과 다르게 바꾼 날',
      '+연장 2시간 더 일한 시간',
      '공휴일·휴진일',
    ])
  })

  it('AC-7613.1: 칸을 누르면 그날만 바꾸기 창, 이름을 누르면 기본 근무가 열린다', async () => {
    await renderWeek()
    const dialog = await openDialog('이도윤', '11월 18일 (수)')
    expect(within(dialog).getByRole('heading', { name: '이도윤 · 11월 18일 (수)' })).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: '닫기' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '김하늘 간호조무사 · 토 1·3주' }))
    expect(screen.getByText('김하늘 — 기본 근무')).toBeTruthy()
    expect(screen.queryByRole('table', { name: '주 근무표' })).toBeNull()
  })

  it('AC-7613.1·AC-7610.1: 이 주 자료를 못 읽으면 E-STAFF-READ-FAILED와 [다시 불러오기]가 보이고, 누르면 다시 읽는다', async () => {
    kit.store.listChanges.mockRejectedValueOnce(new StaffStoreError('E-STAFF-READ-FAILED'))
    render(<ScheduleScreen today={TODAY} />)
    expect(await screen.findByText('오류 번호 E-STAFF-READ-FAILED')).toBeTruthy()
    expect(screen.queryByRole('table', { name: '주 근무표' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }))
    expect(await screen.findByRole('table', { name: '주 근무표' })).toBeTruthy()
    expect(kit.base.reload).toHaveBeenCalled()
    expect(kit.store.listChanges).toHaveBeenCalledTimes(2)
  })

  it('AC-7613.1·AC-7610.1: 직원 자료를 읽는 중이면 "근무표를 불러오는 중이에요", 못 읽으면 E-STAFF-READ-FAILED다', async () => {
    kit.base = makeBase('loading')
    render(<ScheduleScreen today={TODAY} />)
    expect(screen.getByText('근무표를 불러오는 중이에요')).toBeTruthy()
    cleanup()
    kit.base = makeBase('failed')
    render(<ScheduleScreen today={TODAY} />)
    expect(await screen.findByText('오류 번호 E-STAFF-READ-FAILED')).toBeTruthy()
  })
})
