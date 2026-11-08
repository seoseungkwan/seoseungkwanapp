// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { errorInfo } from '@/lib/errors'
import { DEFAULT_TEMPLATES } from '@/lib/patientMessages/defaults'
import { fillTemplate } from '@/lib/patientMessages/fill'
import { readReservations } from '@/lib/patients/reservations'
import type { ReservationData, ReservationFilters } from '@/types/patients'
import { reservationsHead, reservationsListView } from '@/workers/patients/jobs'
import { ReservationTool } from './ReservationTool'
import type { ReservationsRead } from './useBitList'
import type { ToolReply, ToolRequest } from './usePatientsWorker'

// 예약 문자 명단 도구(AC-2803.0~2803.9·2802.4, 시안 toolReservations). 가짜 Worker: filter는 진짜 reservationsListView로 답하고(화면은 거르지 않는다),
// mark 답은 시험이 정한다. 오늘은 2026-11-06(금), 읽은 때는 한국 오후 6:20. 이름·전화·차트번호는 모두 지어낸 값이다

const sb = vi.hoisted(() => ({ result: { data: [] as unknown[] | null, error: null as unknown }, reads: 0 }))
vi.mock('@/lib/supabase/browser', () => ({
  supabaseBrowser: () => ({
    from: () => ({
      select: () => ({
        order: () => ({
          order: async () => {
            sb.reads += 1
            return sb.result
          },
        }),
      }),
    }),
  }),
}))

const TODAY = '2026-11-06'
const READ_AT = Date.UTC(2026, 10, 6, 9, 20)
const TOMORROW = '2026-11-07'
const AFTER = '2026-11-08'
const EMPTY = '이 날 예약하신 분이 없어요. 비트에 예약 대기를 채운 뒤 [다시 불러오기]를 눌러 주세요.'
const NO_PHONES = '복사할 명단이 없어요. 모두 번호 없는 분이에요.'
const ALL_SENT = '모두 보냈어요. 새 예약이 들어오면 [다시 불러오기]를 눌러 주세요.'
const GUIDE = '명단 넷째 칸은 예약 시각이에요(문구의 [*2*] 자리). 번호 없는 분은 복사에서 빠져요. 문자를 보낸 뒤 [보냄으로 표시]를 눌러 두면 나중에 예약이 더 들어와도 안 보낸 분만 복사돼요.'
const MISSED_NOTE = '예약한 날 진료 접수가 없는 분이에요. 비트는 미리 취소한 예약과 안 오신 예약을 똑같이 ‘예약 취소’로 바꿔서 함께 세요.'
const TPL_INJECTION = { id: 'a', kind: 'injection', name: '주사 알림', body: '주사 글\n<<DATE>>', sort_order: 0 }
const TPL_RESERVATION_1 = { id: 'b', kind: 'reservation', name: '예약 알림 1', body: '예약 글 하나\n<<DATE>>\n[*2*]', sort_order: 1 }
const TPL_RESERVATION_2 = { id: 'c', kind: 'reservation', name: '예약 알림 2', body: '예약 글 둘\n<<DATE>>', sort_order: 2 }

// 도우미 줄 [차트번호, 이름, 전화, 예약 시각, 상태, 예약 표시, 그날 옴, 그 뒤 처음 온 날]
const R = (chart: string, name: string, phone: string, at: string, status = 'WR', rsv: string | null = null, came = 0, after: string | null = null) => [chart, name, phone, at, status, rsv, came, after]
const UPCOMING = [
  R('C-1001', '김가상', '010-0000-1200', '202611070900'),
  R('C-1002', '이나래', '010-0000-1201', '202611070930'),
  R('C-1003', '박다솜', '', '202611071400'),
  R('C-1004', '최라온', '010-0000-1203', '202611071430', 'NR'),
  R('C-1005', '정마루', '010-0000-1204', '202611071000', 'CR'), // 취소한 예약은 표에 없다
  R('C-1006', '강바다', '010-0000-1205', '202611091030'),
]
const PAST = [
  R('C-2001', '조사랑', '010-0000-1301', '202611051700', 'CR'),
  R('C-2002', '윤아름', '010-0000-1302', '202611041500', 'CR', null, 0, '20261105'),
  R('C-2003', '장자람', '010-0000-1303', '202611040930'),
  R('C-2004', '임하늘', '010-0000-1304', '202611031100', 'WN', 'OS', 1),
  R('C-2005', '한가상', '', '202610201000', 'CR'),
]
const data = (rows: unknown[][], today = TODAY): ReservationData => readReservations({ v: 1, kind: 'reservation', from: '2026-10-07', to: '2026-11-21', today, rows })
const DATA = data([...UPCOMING, ...PAST])
const MARKS = { 's|C-1001|202611070900': '2026-11-05' }
const KEY_LEE = 's|C-1002|202611070930'
const KEY_CHOI = 's|C-1004|202611071430'

const readOf = (d: ReservationData, today: string, readAt = READ_AT): ReservationsRead => ({ today, readAt, total: d.rows.length, ...reservationsHead(d, today) })

type SetupOptions = { today?: string; data?: ReservationData; marks?: Record<string, string> | null; storeCode?: string | null; active?: boolean }

function setup(options: SetupOptions = {}) {
  const today = options.today ?? TODAY
  const d = options.data ?? DATA
  let marks = options.marks === undefined ? { ...MARKS } : options.marks
  let read = readOf(d, today)
  // 켜면 Worker가 고르기에 바로 답하지 않는다(답이 늦게 오는 사이를 본다)
  let held = false
  const listeners = new Set<(message: ToolReply) => void>()
  const posted: ToolRequest[] = []
  const reply = (message: ToolReply) => {
    for (const listener of [...listeners]) listener(message)
  }
  const answer = (filters: ReservationFilters) => ({ type: 'filtered' as const, tool: 'reservations' as const, ...reservationsListView(d, today, filters, marks) })
  const post = (message: ToolRequest) => {
    posted.push(message)
    if (!held && message.type === 'filter' && message.tool === 'reservations') reply(answer(message.filters))
  }
  const listen = (listener: (message: ToolReply) => void) => {
    listeners.add(listener)
    return () => void listeners.delete(listener)
  }
  const markMany = vi.fn()
  const reload = vi.fn()
  const reloadStore = vi.fn()
  const element = (active: boolean) => (
    <ReservationTool
      read={read}
      storeCode={options.storeCode ?? undefined}
      active={active}
      post={post}
      listen={listen}
      markMany={markMany}
      reload={reload}
      reloadStore={reloadStore}
      head={(summary) => <div data-testid="head">{summary}</div>}
    />
  )
  const utils = render(element(options.active ?? true))
  const filters = () => posted.flatMap((m) => (m.type === 'filter' && m.tool === 'reservations' ? [m.filters as ReservationFilters] : []))
  return {
    ...utils,
    posted,
    markMany,
    reload,
    reloadStore,
    filters,
    lastFilter: () => filters().at(-1)!,
    send: (message: ToolReply) => act(() => reply(message)),
    /** 저장 뒤 Worker가 마지막 고르기로 다시 보내는 filtered */
    resend: () => act(() => reply(answer(filters().at(-1)!))),
    hold: (on: boolean) => void (held = on),
    /** 그 고르기에 대한 Worker 답(늦게 온 답) */
    answerFor: (f: ReservationFilters) => act(() => reply(answer(f))),
    setMarks: (next: Record<string, string> | null) => void (marks = next),
    /** [다시 불러오기] 뒤 새 list-view */
    setRead(next: ReservationsRead) {
      read = next
      utils.rerender(element(true))
    },
    setActive: (active: boolean) => utils.rerender(element(active)),
  }
}

function setupUser(writeText = vi.fn<(text: string) => Promise<void>>(async () => {})) {
  const user = userEvent.setup()
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  return { user, writeText }
}

const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

const button = (name: string) => screen.getByRole('button', { name })
const pressed = (name: string) => button(name).getAttribute('aria-pressed')
const mainTable = () => within(screen.getAllByRole('table')[0]!)
const shownNames = () =>
  mainTable()
    .getAllByRole('row')
    .slice(1)
    .map((tr) => tr.querySelectorAll('td')[2]?.textContent)
const listCopy = () => screen.getAllByRole('button', { name: '명단 복사' })[0]!
const mainStatus = () => screen.getAllByRole('status')[0]!
const past = () => within(screen.getByRole('region', { name: '지난 예약 · 안 오신 분' }))
const pastTable = () => within(past().getByRole('table'))
const pastNames = () => Array.from(past().getByRole('table').querySelectorAll('tbody tr'), (tr) => tr.querySelectorAll('td')[1]?.textContent)
const head = () => screen.getByTestId('head').textContent
/** 그 글이 그대로 든 가장 안쪽 요소 */
const exactText = (text: string, scope: HTMLElement = document.body) =>
  within(scope).getByText((_, el) => el?.textContent === text && [...(el?.children ?? [])].every((child) => child.textContent !== text))

beforeEach(() => {
  sb.result = { data: [TPL_INJECTION, TPL_RESERVATION_1, TPL_RESERVATION_2], error: null }
  sb.reads = 0
})
afterEach(cleanup)

describe('AC-2803.0 날짜 단추와 처음 고를 날', () => {
  it('AC-2803.0: 날짜 단추는 내일 · N명 · 모레 · N명 · 직접이고, 내일 예약이 있으면 내일을 골라 처음 고르기를 Worker에 보낸다', () => {
    const t = setup()
    expect(
      within(screen.getByRole('group', { name: '날짜' }))
        .getAllByRole('button')
        .map((b) => [b.textContent, b.getAttribute('aria-pressed')]),
    ).toEqual([
      ['내일 · 4명', 'true'],
      ['모레 · 0명', 'false'],
      ['직접', 'false'],
    ])
    expect(t.filters()).toEqual([{ day: TOMORROW, withDate: true, unsentOnly: true, missedDays: 7, notYetOnly: true }])
    expect(screen.getByRole('group', { name: '날짜' }).nextElementSibling!.textContent).toBe('11월 7일 (토)')
    expect(screen.queryByText(/먼저 골랐어요/)).toBeNull()
  })

  it('AC-2803.0: 내일 예약이 없으면 모레(예약이 있는 가장 가까운 날)를 먼저 고르고 안내 줄이 있다. 날짜를 바꾸면 안내가 사라진다', async () => {
    const { user } = setupUser()
    const t = setup({ today: '2026-11-07' })
    expect(pressed('모레 · 1명')).toBe('true')
    expect(pressed('내일 · 0명')).toBe('false')
    expect(t.lastFilter().day).toBe('2026-11-09')
    expect(screen.getByText('내일은 예약이 없어 예약이 있는 가장 가까운 날(11월 9일 (월))을 먼저 골랐어요.')).toBeTruthy()
    await user.click(button('내일 · 0명'))
    expect(t.lastFilter().day).toBe(AFTER)
    expect(screen.queryByText(/먼저 골랐어요/)).toBeNull()
  })

  it('AC-2803.0: 가장 가까운 날이 모레 뒤면 [직접]에 그 날짜를 넣어 고른다', () => {
    const t = setup({ data: data([R('C-1006', '강바다', '010-0000-1205', '202611121030')]) })
    expect(pressed('직접')).toBe('true')
    expect((screen.getByLabelText('예약 날짜') as HTMLInputElement).value).toBe('2026-11-12')
    expect(t.lastFilter().day).toBe('2026-11-12')
    expect(screen.getByText('내일은 예약이 없어 예약이 있는 가장 가까운 날(11월 12일 (목))을 먼저 골랐어요.')).toBeTruthy()
  })
})

describe('AC-2803.1 고른 날 표', () => {
  it('AC-2803.1: 표는 Worker가 준 줄(예약 시각 → 이름 차례)이고 칸은 보냄 · 예약 시각 · 이름 · 전화다. 취소한 예약은 없다', () => {
    setup()
    expect(mainTable().getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['보냄', '예약 시각', '이름', '전화'])
    expect(shownNames()).toEqual(['김가상', '이나래', '박다솜', '최라온'])
    expect(mainTable().getByText('오후 2:30')).toBeTruthy()
  })

  it('AC-2803.1: [모레]·[직접]을 고르면 그 날을 보낸다. [직접] 날짜 칸은 예약 날짜이고 오늘 ~ 오늘+14일만 받는다', async () => {
    const { user } = setupUser()
    const t = setup()
    expect(screen.queryByLabelText('예약 날짜')).toBeNull()
    await user.click(button('모레 · 0명'))
    expect(t.lastFilter().day).toBe(AFTER)
    await user.click(button('직접'))
    const field = screen.getByLabelText('예약 날짜') as HTMLInputElement
    expect([field.type, field.min, field.max]).toEqual(['date', TODAY, '2026-11-20'])
    fireEvent.change(field, { target: { value: '2026-11-09' } })
    expect(t.lastFilter().day).toBe('2026-11-09')
    expect(shownNames()).toEqual(['강바다'])
    expect(screen.getByRole('group', { name: '날짜' }).nextElementSibling!.textContent).toBe('11월 9일 (월)')
    const asked = t.filters().length
    fireEvent.change(field, { target: { value: '2026-11-21' } })
    fireEvent.change(field, { target: { value: '2026-11-05' } })
    expect(t.filters()).toHaveLength(asked)
    // 칸을 떠나면 쓰는 날짜로 돌아간다
    fireEvent.blur(field)
    expect(field.value).toBe('2026-11-09')
  })
})

describe('AC-2803.2 명단 복사', () => {
  it('AC-2803.2: Worker 복사 글 그대로 복사하고 알림은 복사했어요 · N명 · 안 보낸 분만 · 날짜 제목 줄 포함이다', async () => {
    const { user, writeText } = setupUser()
    const t = setup()
    const expected = reservationsListView(DATA, TODAY, t.lastFilter(), MARKS).copy.list
    expect(expected.split('\n')).toHaveLength(3)
    await user.click(listCopy())
    expect(writeText).toHaveBeenCalledWith(expected)
    expect(mainStatus().textContent).toContain('복사했어요 · 2명 · 안 보낸 분만 · 날짜 제목 줄 포함')
  })

  it('AC-2803.2: 안 보낸 분만·날짜 제목 줄 넣기(처음 켜짐)를 끄면 Worker에 보내고 알림 글이 바뀐다', async () => {
    const { user } = setupUser()
    const t = setup()
    const unsent = screen.getByRole('checkbox', { name: '안 보낸 분만' }) as HTMLInputElement
    const withDate = screen.getByRole('checkbox', { name: '날짜 제목 줄 넣기' }) as HTMLInputElement
    expect([unsent.checked, withDate.checked]).toEqual([true, true])
    await user.click(unsent)
    await user.click(withDate)
    expect(t.lastFilter()).toMatchObject({ unsentOnly: false, withDate: false })
    await user.click(listCopy())
    expect(mainStatus().textContent).toContain('복사했어요 · 3명')
    expect(mainStatus().textContent).not.toContain('안 보낸 분만')
    // 이미 보낸 분(김가상)은 [보냄으로 표시]에 세지 않는다(시안 toMark)
    expect(button('보냄으로 표시 (2명)')).toBeTruthy()
  })

  it('AC-2803.2: 고르기를 바꾸면 지난 알림 줄이 지워진다', async () => {
    const { user } = setupUser()
    setup()
    await user.click(listCopy())
    expect(mainStatus().textContent).toContain('복사했어요')
    await user.click(screen.getByRole('checkbox', { name: '날짜 제목 줄 넣기' }))
    expect(mainStatus().textContent).toBe('')
  })

  it('AC-2803.2: 모두 번호 없는 분이면 복사할 명단이 없어요 안내이고 클립보드를 덮어쓰지 않는다', async () => {
    const { user, writeText } = setupUser()
    setup({ data: data([R('C-1003', '박다솜', '', '202611071400')]) })
    await user.click(listCopy())
    expect(writeText).not.toHaveBeenCalled()
    expect(mainStatus().textContent).toBe(NO_PHONES)
  })

  it('AC-2803.2: 날짜를 바꾼 뒤 그 날의 명단이 오기 전에는 [명단 복사]가 눌리지 않는다. 앞 날 명단이 늦게 와도 복사하지 않는다', async () => {
    const { user, writeText } = setupUser()
    const d = data([R('C-1001', '김가상', '010-0000-1201', '202611070900'), R('C-1006', '강바다', '010-0000-1205', '202611081030')])
    const t = setup({ data: d, marks: {} })
    const tomorrow = t.lastFilter()
    expect(tomorrow.day).toBe(TOMORROW)
    expect(listCopy().getAttribute('aria-disabled')).toBeNull()
    t.hold(true)
    await user.click(button('모레 · 1명'))
    expect(t.lastFilter().day).toBe(AFTER)
    // 저장 뒤 Worker가 다시 보낸 앞 날(내일) 명단이 모레 답보다 먼저 온다
    t.answerFor(tomorrow)
    expect(listCopy().getAttribute('aria-disabled')).toBe('true')
    await user.click(listCopy())
    expect(writeText).not.toHaveBeenCalled()
    // 모레 명단이 오면 다시 눌리고 모레 명단을 복사한다
    t.answerFor(t.lastFilter())
    expect(listCopy().getAttribute('aria-disabled')).toBeNull()
    await user.click(listCopy())
    expect(writeText).toHaveBeenCalledWith(reservationsListView(d, TODAY, t.lastFilter(), {}).copy.list)
  })

  it('AC-2803.2: 안 보낸 분만인데 모두 보냈으면 단추가 눌리지 않고 모두 보냈어요 안내가 있다', async () => {
    const { user, writeText } = setupUser()
    setup({ marks: { ...MARKS, [KEY_LEE]: '2026-11-06', [KEY_CHOI]: '2026-11-06' } })
    expect(listCopy().getAttribute('aria-disabled')).toBe('true')
    expect(mainStatus().textContent).toBe(ALL_SENT)
    await user.click(listCopy())
    expect(writeText).not.toHaveBeenCalled()
  })
})

describe('AC-2803.8 보냄 표시', () => {
  it('AC-2803.8: 머리 요약은 N명 · 아직 안 보낸 분 M명 · …에 읽음이고 [다시 불러오기]는 이 도구만 다시 읽는다', async () => {
    const { user } = setupUser()
    const t = setup()
    expect(head()).toBe('4명 · 아직 안 보낸 분 3명 · 11월 6일 오후 6:20에 읽음다시 불러오기')
    await user.click(within(screen.getByTestId('head')).getByRole('button', { name: '다시 불러오기' }))
    expect(t.reload).toHaveBeenCalledTimes(1)
  })

  it('AC-2803.8: 줄마다 보냄 체크로 켜고 끈다 — mark(열쇠 s|…, 읽은 날)를 보내고 저장 중이었다가 답이 오면 바뀐다', async () => {
    const { user } = setupUser()
    const t = setup()
    await user.click(mainTable().getByRole('checkbox', { name: '이나래 보냄' }))
    expect(t.posted.filter((m) => m.type === 'mark')).toEqual([{ type: 'mark', key: KEY_LEE, on: true, today: TODAY }])
    expect(mainTable().getAllByText('저장 중')).toHaveLength(1)
    t.send({ type: 'marked', key: KEY_LEE, ok: true, counts: null })
    expect((mainTable().getByRole('checkbox', { name: '이나래 보냄' }) as HTMLInputElement).checked).toBe(true)
    expect(head()).toContain('아직 안 보낸 분 2명')
  })

  it('AC-2803.8: 저장이 실패하면 그 줄 아래 실패 줄과 오류 번호가 있다', async () => {
    const { user } = setupUser()
    const t = setup()
    await user.click(mainTable().getByRole('checkbox', { name: '이나래 보냄' }))
    t.send({ type: 'marked', key: KEY_LEE, ok: false, code: 'E-STORE-FAILED', counts: null })
    expect(mainTable().getByText('보냄 표시를 저장하지 못했어요. 다시 눌러 주세요.')).toBeTruthy()
    expect(mainTable().getByText('오류 번호 E-STORE-FAILED')).toBeTruthy()
  })

  it('AC-2803.8: 복사하면 [보냄으로 표시 (N명)]이 생기고, 누르면 방금 복사한 분을 한 번에 표시한 뒤 N명을 보냄으로 표시했어요다', async () => {
    const { user } = setupUser()
    const t = setup()
    await user.click(listCopy())
    await user.click(button('보냄으로 표시 (2명)'))
    expect(t.markMany).toHaveBeenCalledWith([KEY_LEE, KEY_CHOI], TODAY)
    expect(screen.queryByRole('button', { name: /보냄으로 표시/ })).toBeNull()
    expect(mainTable().getAllByText('저장 중')).toHaveLength(2)

    t.send({ type: 'marked', key: KEY_LEE, ok: true, counts: null })
    expect(mainStatus().textContent).not.toContain('보냄으로 표시했어요')
    t.send({ type: 'marked', key: KEY_CHOI, ok: true, counts: null })
    t.setMarks({ ...MARKS, [KEY_LEE]: TODAY, [KEY_CHOI]: TODAY })
    t.resend()
    expect(mainStatus().textContent).toContain('2명을 보냄으로 표시했어요')
    // 이제 모두 보냈다
    expect(mainStatus().textContent).toContain(ALL_SENT)
    expect(listCopy().getAttribute('aria-disabled')).toBe('true')
  })

  it('AC-2803.8: 한 분이라도 저장을 못 하면 표시했어요 알림은 없고 그 줄 아래 실패 줄이다', async () => {
    const { user } = setupUser()
    const t = setup()
    await user.click(listCopy())
    await user.click(button('보냄으로 표시 (2명)'))
    t.send({ type: 'marked', key: KEY_LEE, ok: true, counts: null })
    t.send({ type: 'marked', key: KEY_CHOI, ok: false, code: 'E-STORE-FAILED', counts: null })
    expect(mainStatus().textContent).not.toContain('보냄으로 표시했어요')
    expect(mainTable().getByText('보냄 표시를 저장하지 못했어요. 다시 눌러 주세요.')).toBeTruthy()
  })

  it('AC-2803.8: 복사한 뒤 줄에서 보냄을 켜면 [보냄으로 표시]의 수가 줄고, 모두 켜면 단추가 없어진다', async () => {
    const { user } = setupUser()
    const t = setup()
    await user.click(listCopy())
    await user.click(mainTable().getByRole('checkbox', { name: '이나래 보냄' }))
    t.send({ type: 'marked', key: KEY_LEE, ok: true, counts: null })
    expect(button('보냄으로 표시 (1명)')).toBeTruthy()
    await user.click(mainTable().getByRole('checkbox', { name: '최라온 보냄' }))
    t.send({ type: 'marked', key: KEY_CHOI, ok: true, counts: null })
    expect(screen.queryByRole('button', { name: /보냄으로 표시/ })).toBeNull()
  })

  it('AC-2803.8: 저장을 못 불러왔으면 체크·[보냄으로 표시]가 막히고 F/U와 같은 안내 줄(errors.ts 글·번호·[다시 불러오기])이 있다', async () => {
    const { user } = setupUser()
    const t = setup({ marks: null, storeCode: 'E-STORE-BROKEN' })
    for (const box of mainTable().getAllByRole('checkbox')) expect((box as HTMLInputElement).disabled).toBe(true)
    const info = errorInfo('E-STORE-BROKEN')
    expect(screen.getByText(`보냄 표시를 불러오지 못해 [보냄]을 쓸 수 없어요. ${info.what}. ${info.fix}`)).toBeTruthy()
    expect(screen.getByText('오류 번호 E-STORE-BROKEN')).toBeTruthy()
    // 표시를 모르면 안 보낸 분 수를 말하지 않는다
    expect(head()).toBe('4명 · 11월 6일 오후 6:20에 읽음다시 불러오기')
    await user.click(listCopy())
    expect(screen.queryByRole('button', { name: /보냄으로 표시/ })).toBeNull()
    const line = screen.getByText('오류 번호 E-STORE-BROKEN').parentElement!
    await user.click(within(line).getByRole('button', { name: '다시 불러오기' }))
    expect(t.reloadStore).toHaveBeenCalledTimes(1)
    expect(t.reload).not.toHaveBeenCalled()
  })

  it('AC-2803.8: 저장을 불러오는 중이면(번호 모름) 체크만 막히고 안내 줄은 없다', () => {
    setup({ marks: null, storeCode: null })
    for (const box of mainTable().getAllByRole('checkbox')) expect((box as HTMLInputElement).disabled).toBe(true)
    expect(screen.queryByText(/보냄 표시를 불러오지 못해/)).toBeNull()
  })
})

describe('AC-2803.9 번호 없는 분', () => {
  it('AC-2803.9: 고른 날 번호 없는 분이 있으면 표 위에 주의 칸이 있다', () => {
    setup()
    const note = screen.getByRole('note')
    expect(note.textContent).toBe('번호 없는 1분은 문자가 안 가요. 전화로 알려 주세요.박다솜 · 오후 2:00')
  })

  it('AC-2803.9: 모두 번호가 있으면 주의 칸이 없다', async () => {
    const { user } = setupUser()
    setup()
    await user.click(button('직접'))
    fireEvent.change(screen.getByLabelText('예약 날짜'), { target: { value: '2026-11-09' } })
    expect(screen.queryByRole('note')).toBeNull()
  })
})

describe('AC-2803.3 문구 복사', () => {
  it('AC-2803.3: 예약 안내 첫 문구를 고른 날로 채워 복사하고, 알림은 복사했어요 · 문구 이름 · M월 D일 (요일), 옆에 문구 날짜, 아래 안내 글', async () => {
    const { user, writeText } = setupUser()
    setup()
    await flush()
    expect(screen.getByText('문구 날짜 11월 7일 (토)')).toBeTruthy()
    expect(screen.getByText(GUIDE)).toBeTruthy()
    await user.click(button('문구 복사'))
    expect(writeText).toHaveBeenCalledWith(fillTemplate(TPL_RESERVATION_1.body, TOMORROW))
    expect(mainStatus().textContent).toBe('복사했어요 · 예약 알림 1 · 11월 7일 (토)')
  })

  it.each([
    ['예약 안내가 없는 저장 문구', [TPL_INJECTION]],
    ['저장 문구 없음', []],
  ])('AC-2803.3: %s이면 기본 예약 안내 문구다', async (_name, rows) => {
    sb.result = { data: rows, error: null }
    const { user, writeText } = setupUser()
    setup()
    await flush()
    await user.click(button('문구 복사'))
    const fallback = DEFAULT_TEMPLATES.find((tpl) => tpl.kind === 'reservation')!
    expect(writeText).toHaveBeenCalledWith(fillTemplate(fallback.body, TOMORROW))
    expect(mainStatus().textContent).toBe(`복사했어요 · ${fallback.name} · 11월 7일 (토)`)
  })

  it('AC-2803.3: 고른 날을 바꾸면 문구 날짜도 그 날이다', async () => {
    const { user, writeText } = setupUser()
    setup()
    await flush()
    await user.click(button('직접'))
    fireEvent.change(screen.getByLabelText('예약 날짜'), { target: { value: '2026-11-09' } })
    expect(screen.getByText('문구 날짜 11월 9일 (월)')).toBeTruthy()
    await user.click(button('문구 복사'))
    expect(writeText).toHaveBeenCalledWith(fillTemplate(TPL_RESERVATION_1.body, '2026-11-09'))
  })

  it('AC-2803.3: [문구 복사]를 누르면 [보냄으로 표시]는 없어진다(방금 복사한 것이 명단이 아니다)', async () => {
    const { user } = setupUser()
    setup()
    await flush()
    await user.click(listCopy())
    expect(button('보냄으로 표시 (2명)')).toBeTruthy()
    await user.click(button('문구 복사'))
    expect(screen.queryByRole('button', { name: /보냄으로 표시/ })).toBeNull()
  })

  it('AC-2803.3: 문구를 못 읽으면 F/U처럼 오류 줄과 [다시 불러오기](문구만 다시 읽음)', async () => {
    sb.result = { data: null, error: { message: 'secret' } }
    const { user } = setupUser()
    const t = setup()
    await flush()
    expect(screen.getByText('문자 문구를 불러오지 못해 [문구 복사]를 쓸 수 없어요.')).toBeTruthy()
    sb.result = { data: [TPL_RESERVATION_1], error: null }
    const line = screen.getByText('오류 번호 E-PATIENTS-TEMPLATES-READ').parentElement!
    await user.click(within(line).getByRole('button', { name: '다시 불러오기' }))
    await flush()
    expect(button('문구 복사')).toBeTruthy()
    expect(t.reload).not.toHaveBeenCalled()
  })

  it('AC-2803.3: 문구는 도구가 보일 때 읽는다', async () => {
    const t = setup({ active: false })
    await flush()
    expect(sb.reads).toBe(0)
    t.setActive(true)
    await flush()
    expect(sb.reads).toBe(1)
  })
})

describe('AC-2803.4 고른 날 예약 없음', () => {
  it('AC-2803.4: 표에 빈 글, [명단 복사]·[문구 복사]가 눌리지 않고 머리 요약은 0명이다', async () => {
    const { user, writeText } = setupUser()
    setup()
    await flush()
    await user.click(button('모레 · 0명'))
    expect(mainTable().getByText(EMPTY)).toBeTruthy()
    expect(listCopy().getAttribute('aria-disabled')).toBe('true')
    expect(button('문구 복사').getAttribute('aria-disabled')).toBe('true')
    await user.click(button('문구 복사'))
    expect(writeText).not.toHaveBeenCalled()
    expect(head()).toBe('0명 · 11월 6일 오후 6:20에 읽음다시 불러오기')
  })
})

describe('AC-2802.4 다시 읽어도 고른 것은 그대로', () => {
  it('AC-2802.4: 새로 읽은 뒤에도 고른 날짜·켜고 끈 것을 그대로 다시 묻고, 머리에 새 읽은 때가 보인다', async () => {
    const { user } = setupUser()
    const t = setup()
    await user.click(button('모레 · 0명'))
    await user.click(screen.getByRole('checkbox', { name: '안 보낸 분만' }))
    const asked = t.filters().length
    t.setRead(readOf(DATA, TODAY, READ_AT + 60_000))
    expect(t.filters()).toHaveLength(asked + 1)
    expect(t.lastFilter()).toMatchObject({ day: AFTER, unsentOnly: false })
    expect(pressed('모레 · 0명')).toBe('true')
    expect(head()).toContain('11월 6일 오후 6:21에 읽음')
  })
})

describe('AC-2803.5~2803.7 지난 예약 · 안 오신 분', () => {
  it('AC-2803.5: 지난 7일(처음)·어제까지 기간 글·아직 안 오신 분만(처음 켜짐)이고 표는 예약한 때가 늦은 차례다', () => {
    setup()
    expect(screen.getByRole('heading', { level: 3, name: '지난 예약 · 안 오신 분' })).toBeTruthy()
    const period = past().getByRole('group', { name: '지난 기간' })
    expect(within(period).getAllByRole('button').map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([
      ['지난 7일', 'true'],
      ['지난 30일', 'false'],
    ])
    expect(period.nextElementSibling!.textContent).toBe('10월 30일 ~ 11월 5일')
    expect((past().getByRole('checkbox', { name: '아직 안 오신 분만' }) as HTMLInputElement).checked).toBe(true)
    expect(pastNames()).toEqual(['조사랑', '장자람'])
    expect(pastTable().getByText('예약 그대로')).toBeTruthy()
  })

  it('AC-2803.5: 아직 안 오신 분만을 끄면 그 뒤 오신 분도 보이고, [지난 30일]은 missedDays 30이다', async () => {
    const { user } = setupUser()
    const t = setup()
    await user.click(past().getByRole('checkbox', { name: '아직 안 오신 분만' }))
    expect(t.lastFilter().notYetOnly).toBe(false)
    expect(pastNames()).toEqual(['조사랑', '윤아름', '장자람'])
    expect(pastTable().getByText('11월 5일에 오심')).toBeTruthy()
    await user.click(past().getByRole('button', { name: '지난 30일' }))
    expect(t.lastFilter()).toMatchObject({ missedDays: 30, notYetOnly: false })
    expect(past().getByRole('group', { name: '지난 기간' }).nextElementSibling!.textContent).toBe('10월 7일 ~ 11월 5일')
    expect(pastNames()).toEqual(['조사랑', '윤아름', '장자람', '한가상'])
  })

  it('AC-2803.6: 요약은 예약 N건 중 안 오신 분 M건 · P% · 아직 안 오신 분 K명이고 아래 안내 글이 있다(거르기와 상관없는 숫자)', async () => {
    const { user } = setupUser()
    setup()
    const region = screen.getByRole('region', { name: '지난 예약 · 안 오신 분' })
    expect(exactText('예약 4건 중 안 오신 분 3건 · 75% · 아직 안 오신 분 2명', region)).toBeTruthy()
    expect(past().getByText(MISSED_NOTE)).toBeTruthy()
    await user.click(past().getByRole('checkbox', { name: '아직 안 오신 분만' }))
    expect(exactText('예약 4건 중 안 오신 분 3건 · 75% · 아직 안 오신 분 2명', region)).toBeTruthy()
    await user.click(past().getByRole('button', { name: '지난 30일' }))
    expect(exactText('예약 5건 중 안 오신 분 4건 · 80% · 아직 안 오신 분 3명', region)).toBeTruthy()
  })

  it('AC-2803.6: 그 기간에 예약이 없으면 이 기간에 예약이 없어요 · 표에 안 오신 분이 없어요, [명단 복사]는 눌리지 않는다', () => {
    setup({ data: data(UPCOMING) })
    expect(past().getByText('이 기간에 예약이 없어요.')).toBeTruthy()
    expect(past().getAllByText('이 기간에 안 오신 분이 없어요.').length).toBeGreaterThan(0)
    expect(past().getByRole('button', { name: '명단 복사' }).getAttribute('aria-disabled')).toBe('true')
  })

  it('AC-2803.7: 그 칸의 [명단 복사]는 보이는 줄의 복사 글이고 알림은 그 칸에 복사했어요 · N명이다', async () => {
    const { user, writeText } = setupUser()
    const t = setup()
    await user.click(past().getByRole('button', { name: '명단 복사' }))
    expect(writeText).toHaveBeenCalledWith(reservationsListView(DATA, TODAY, t.lastFilter(), MARKS).missed.copy.list)
    expect(past().getByRole('status').textContent).toBe('복사했어요 · 2명')
    expect(mainStatus().textContent).toBe('')
  })

  it('AC-2803.5: 10건이 넘으면 10건만 보이고 모두 보기 (N건) / 10건만 보기로 바꾼다. 기간을 바꾸면 다시 10건이다', async () => {
    const { user } = setupUser()
    const many = Array.from({ length: 12 }, (_, i) => R(`C-3${String(i).padStart(3, '0')}`, `가상${i}`, '010-0000-1400', `2026110${(i % 5) + 1}1${i % 10}00`, 'CR'))
    setup({ data: data([...UPCOMING, ...many]) })
    expect(pastNames()).toHaveLength(10)
    await user.click(past().getByRole('button', { name: '모두 보기 (12건)' }))
    expect(pastNames()).toHaveLength(12)
    expect(past().getByRole('button', { name: '10건만 보기' }).getAttribute('aria-expanded')).toBe('true')
    await user.click(past().getByRole('button', { name: '지난 30일' }))
    expect(pastNames()).toHaveLength(10)
  })
})

describe('AC-2802.7 차트번호', () => {
  it('AC-2802.7: 화면 어디에도 차트번호 글자가 없다(복사·표시 뒤에도)', async () => {
    const { user } = setupUser()
    const { container } = setup()
    await user.click(listCopy())
    await user.click(past().getByRole('checkbox', { name: '아직 안 오신 분만' }))
    expect(container.innerHTML).not.toMatch(/C-\d{4}/)
  })
})
