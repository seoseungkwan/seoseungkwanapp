// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { errorInfo } from '@/lib/errors'
import { readLapsed } from '@/lib/patients/lapsed'
import { listStatsRxGroups } from '@/lib/storage/statsRxGroups'
import type { LapsedData, LapsedListFilters } from '@/types/patients'
import type { RxGroup } from '@/types/rxGroups'
import { lapsedListView } from '@/workers/patients/jobs'
import { LapsedTool } from './LapsedTool'
import type { LapsedRead } from './useBitList'
import type { ToolReply, ToolRequest } from './usePatientsWorker'

// 장기 미방문 명단 도구(AC-2804.2~2804.7·2802.4, 시안 toolLapsed). 가짜 Worker: filter는 진짜 lapsedListView로 답한다(화면은 거르지 않는다).
// 처방 추세 묶음은 statsRxGroups로 읽기만 한다(가짜). 오늘은 2026-11-06(금). 이름·전화·차트번호·처방은 모두 지어낸 값이다
vi.mock('@/lib/storage/statsRxGroups', () => ({ listStatsRxGroups: vi.fn() }))
const groupsRead = vi.mocked(listStatsRxGroups)

const TODAY = '2026-11-06'
const READ_AT = Date.UTC(2026, 10, 6, 9, 20)
const EMPTY = '이 기간에 마지막으로 오신 분이 없어요.'
const NO_PHONES = '복사할 명단이 없어요. 모두 번호 없는 분이에요.'
const RX_HELP = '마지막 진료는 통계 탭 ‘처방 추세’에서 만든 묶음 이름이에요. 묶음에 없는 처방은 이름을 두 개까지 흐리게 보여요.'
const COPY_HELP = '명단 넷째 칸은 마지막 내원 날짜예요. 번호 없는 분은 복사에서 빠져요.'
const VISITS_NOTE = '내원 횟수는 진료 받은 날 수예요(같은 날 두 번 접수해도 한 번). 예약 대기·취소한 접수는 세지 않아요.'

// 도우미 줄 [차트번호, 이름, 전화, 마지막 내원일, 진료 받은 날 수, 예약 있음, 마지막 진료 처방]
const L = (chart: string, name: string, phone: string, last: string, visits: number, reserved: 0 | 1, rx: [string, string | null][]) => [chart, name, phone, last, visits, reserved, rx]
const ROWS = [
  L('L-1001', '김가상', '010-0000-2001', '20261005', 8, 0, [['MT01', '도수 30분']]),
  L('L-1002', '이나래', '010-0000-2002', '20261001', 3, 1, [
    ['ESW1', '체외충격파'],
    ['MT01', '도수 30분'],
  ]),
  L('L-1003', '박다솜', '', '20260915', 2, 0, [
    ['X01', '가상진통제'],
    ['X02', '가상근이완제'],
    ['X03', '가상파스'],
  ]),
  L('L-1004', '최라온', '010-0000-2004', '20260601', 5, 0, [['INJ1', '주사약']]),
  L('L-1005', '정마루', '010-0000-2005', '20250101', 2, 0, []),
]
const data = (rows: unknown[][]): LapsedData => readLapsed({ v: 1, kind: 'lapsed', from: '2024-11-07', to: '2026-10-06', today: TODAY, rows })
const DATA = data(ROWS)
const GROUPS: RxGroup[] = [
  { id: 'g1', name: '도수치료', codes: ['MT01'], sortOrder: 0 },
  { id: 'g2', name: '체외충격파', codes: ['ESW1'], sortOrder: 1 },
  { id: 'g3', name: '주사', codes: ['INJ1'], sortOrder: 2 },
]
const SENT_GROUPS = GROUPS.map(({ name, codes }) => ({ name, codes }))
const MARKS = { 'l|L-1001|20261005': '2026-11-01' }
const KEY_LEE = 'l|L-1002|20261001'

const readOf = (readAt = READ_AT): LapsedRead => ({ today: TODAY, readAt, total: DATA.rows.length })

type SetupOptions = { data?: LapsedData; marks?: Record<string, string> | null; storeCode?: string | null }

function setup(options: SetupOptions = {}) {
  const d = options.data ?? DATA
  const marks = options.marks === undefined ? { ...MARKS } : options.marks
  let read = readOf()
  const listeners = new Set<(message: ToolReply) => void>()
  const posted: ToolRequest[] = []
  const reply = (message: ToolReply) => {
    for (const listener of [...listeners]) listener(message)
  }
  const post = (message: ToolRequest) => {
    posted.push(message)
    if (message.type === 'filter' && message.tool === 'lapsed') reply({ type: 'filtered', tool: 'lapsed', ...lapsedListView(d, TODAY, message.filters, marks) })
  }
  const listen = (listener: (message: ToolReply) => void) => {
    listeners.add(listener)
    return () => void listeners.delete(listener)
  }
  const reload = vi.fn()
  const reloadStore = vi.fn()
  const element = (active: boolean) => (
    <LapsedTool
      read={read}
      storeCode={options.storeCode ?? undefined}
      active={active}
      post={post}
      listen={listen}
      reload={reload}
      reloadStore={reloadStore}
      head={(summary) => <div data-testid="head">{summary}</div>}
    />
  )
  const utils = render(element(true))
  const filters = () => posted.flatMap((m) => (m.type === 'filter' && m.tool === 'lapsed' ? [m.filters as LapsedListFilters] : []))
  return {
    ...utils,
    posted,
    reload,
    reloadStore,
    filters,
    lastFilter: () => filters().at(-1)!,
    send: (message: ToolReply) => act(() => reply(message)),
    setRead(next: LapsedRead) {
      read = next
      utils.rerender(element(true))
    },
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
const table = () => within(screen.getByRole('table'))
const shownNames = () =>
  table()
    .getAllByRole('row')
    .slice(1)
    .map((tr) => tr.querySelectorAll('td')[1]?.textContent)
const status = () => screen.getByRole('status').textContent
const head = () => screen.getByTestId('head').textContent
const bucketGroup = () => screen.getByRole('group', { name: '마지막 내원' })
const countsLine = () => screen.getByText(/^1~3달 \d+명 · 3~6달/).textContent
const select = () => screen.getByLabelText('마지막 진료') as HTMLSelectElement

beforeEach(() => {
  groupsRead.mockReset()
  groupsRead.mockResolvedValue(GROUPS)
})
afterEach(cleanup)

describe('AC-2804.2 마지막 내원 묶음', () => {
  it('AC-2804.2: 단추는 1~3달(처음) · 3~6달 · 6~12달 · 1~2년이고 옆에 기간 글, 아래에 묶음마다 건수 줄이다', async () => {
    const t = setup()
    await flush()
    expect(within(bucketGroup()).getAllByRole('button').map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([
      ['1~3달', 'true'],
      ['3~6달', 'false'],
      ['6~12달', 'false'],
      ['1~2년', 'false'],
    ])
    expect(bucketGroup().nextElementSibling!.textContent).toBe('8월 7일 ~ 10월 6일에 마지막으로 오신 분')
    expect(countsLine()).toBe('1~3달 3명 · 3~6달 1명 · 6~12달 0명 · 1~2년 1명')
    expect(t.filters()).toEqual([{ bucket: '1-3', rx: { kind: 'all' }, groups: SENT_GROUPS }])
  })

  it('AC-2804.2: 해가 오늘과 다른 끝은 YYYY년 M월 D일이고, 고른 묶음을 Worker에 보낸다', async () => {
    const { user } = setupUser()
    const t = setup()
    await flush()
    await user.click(button('1~2년'))
    expect(t.lastFilter().bucket).toBe('12-24')
    expect(bucketGroup().nextElementSibling!.textContent).toBe('2024년 11월 7일 ~ 2025년 11월 6일에 마지막으로 오신 분')
    expect(shownNames()).toEqual(['정마루'])
  })

  it('AC-2804.2·AC-2804.5: 머리 요약은 고른 묶음의 N명 · 아직 연락 안 한 분 M명 · …에 읽음이고 [다시 불러오기]는 이 도구만 다시 읽는다', async () => {
    const { user } = setupUser()
    const t = setup()
    await flush()
    expect(head()).toBe('3명 · 아직 연락 안 한 분 2명 · 11월 6일 오후 6:20에 읽음다시 불러오기')
    await user.click(within(screen.getByTestId('head')).getByRole('button', { name: '다시 불러오기' }))
    expect(t.reload).toHaveBeenCalledTimes(1)
  })
})

describe('AC-2804.6·2804.7 마지막 진료', () => {
  it('AC-2804.6: 처방 추세 묶음을 다 읽은 뒤에 이름·코드를 filter에 실어 묻는다(읽기 전에는 묻지 않는다)', async () => {
    let resolve!: (groups: RxGroup[]) => void
    groupsRead.mockReturnValue(new Promise((r) => (resolve = r)))
    const t = setup()
    await flush()
    expect(t.filters()).toEqual([])
    await act(async () => resolve(GROUPS))
    expect(t.filters()).toEqual([{ bucket: '1-3', rx: { kind: 'all' }, groups: SENT_GROUPS }])
    expect(table().getByText('도수치료 · 체외충격파')).toBeTruthy()
  })

  it('AC-2804.6: 묶음을 못 읽으면 groups null로 묻고 처방 이름으로만 보인다', async () => {
    groupsRead.mockRejectedValue(new Error('E-STATS-GROUP-READ-FAILED'))
    const t = setup()
    await flush()
    expect(t.lastFilter().groups).toBeNull()
    expect(table().getByText('체외충격파 · 도수 30분').className).toContain('text-muted')
    expect(select().options.length).toBe(2)
  })

  it('AC-2804.7: 고르기는 전체(처음) · 고른 기간 줄에 나온 묶음 이름 · 묶음 없음이고, 아래 안내 글이 있다', async () => {
    setup()
    await flush()
    expect([...select().options].map((o) => o.textContent)).toEqual(['전체', '도수치료', '체외충격파', '묶음 없음'])
    expect(select().selectedOptions[0]!.textContent).toBe('전체')
    expect(screen.getByText(RX_HELP)).toBeTruthy()
  })

  it('AC-2804.7: 묶음을 고르면 rx를 보내고 표·머리 요약·건수 줄·[명단 복사]가 그 묶음이 든 줄만이다', async () => {
    const { user, writeText } = setupUser()
    const t = setup()
    await flush()
    await user.selectOptions(select(), '체외충격파')
    expect(t.lastFilter().rx).toEqual({ kind: 'group', name: '체외충격파' })
    expect(shownNames()).toEqual(['이나래'])
    expect(head()).toContain('1명 · ')
    expect(countsLine()).toBe('1~3달 1명 · 3~6달 0명 · 6~12달 0명 · 1~2년 0명')
    await user.click(button('명단 복사'))
    expect(writeText).toHaveBeenCalledWith('이나래\t010-0000-2002\t이나래\t10월 1일')

    await user.selectOptions(select(), '묶음 없음')
    expect(t.lastFilter().rx).toEqual({ kind: 'none' })
    expect(shownNames()).toEqual(['박다솜'])
    expect(countsLine()).toBe('1~3달 1명 · 3~6달 0명 · 6~12달 0명 · 1~2년 1명')
  })

  it('AC-2804.7: 고른 묶음이 다른 기간 줄에 없어도 고르기에 남는다', async () => {
    const { user } = setupUser()
    setup()
    await flush()
    await user.selectOptions(select(), '도수치료')
    await user.click(button('3~6달'))
    expect(select().selectedOptions[0]!.textContent).toBe('도수치료')
    expect(table().getByText(EMPTY)).toBeTruthy()
  })
})

describe('AC-2804.3 표', () => {
  it('AC-2804.3: 표는 Worker 차례(마지막 내원이 늦은 차례)이고 표 아래 내원 횟수 안내가 있다', async () => {
    setup()
    await flush()
    expect(shownNames()).toEqual(['김가상', '이나래', '박다솜'])
    expect(table().getByText('예약 있음')).toBeTruthy()
    expect(screen.getByText(VISITS_NOTE)).toBeTruthy()
  })

  it('AC-2804.3: 10명이 넘으면 10명만 보이고 모두 보기 (N명) / 10명만 보기다. 묶음을 바꾸면 다시 10명이다', async () => {
    const { user } = setupUser()
    const many = Array.from({ length: 13 }, (_, i) => L(`L-2${String(i).padStart(3, '0')}`, `가상${i}`, '010-0000-2100', `202609${String(i + 1).padStart(2, '0')}`, 2, 0, []))
    setup({ data: data([...ROWS, ...many]) })
    await flush()
    expect(shownNames()).toHaveLength(10)
    await user.click(button('모두 보기 (16명)'))
    expect(shownNames()).toHaveLength(16)
    expect(button('10명만 보기').getAttribute('aria-expanded')).toBe('true')
    await user.click(button('3~6달'))
    await user.click(button('1~3달'))
    expect(shownNames()).toHaveLength(10)
  })
})

describe('AC-2804.4 명단 복사', () => {
  it('AC-2804.4: 표 차례 복사 글 그대로(번호 없는 분 뺌), 알림 복사했어요 · N명, 단추 아래 안내 글', async () => {
    const { user, writeText } = setupUser()
    setup()
    await flush()
    expect(screen.getByText(COPY_HELP)).toBeTruthy()
    await user.click(button('명단 복사'))
    expect(writeText).toHaveBeenCalledWith('김가상\t010-0000-2001\t김가상\t10월 5일\n이나래\t010-0000-2002\t이나래\t10월 1일')
    expect(status()).toBe('복사했어요 · 2명')
  })

  it('AC-2804.4: 묶음에 아무도 없으면 표에 빈 글이고 [명단 복사]는 눌리지 않는다', async () => {
    const { user, writeText } = setupUser()
    setup()
    await flush()
    await user.click(button('6~12달'))
    expect(table().getByText(EMPTY)).toBeTruthy()
    expect(button('명단 복사').getAttribute('aria-disabled')).toBe('true')
    await user.click(button('명단 복사'))
    expect(writeText).not.toHaveBeenCalled()
    expect(head()).toContain('0명 · ')
  })

  it('AC-2804.4: 모두 번호 없는 분이면 복사할 명단이 없어요 안내이고 클립보드를 덮어쓰지 않는다', async () => {
    const { user, writeText } = setupUser()
    setup({ data: data([ROWS[2]!]) })
    await flush()
    await user.click(button('명단 복사'))
    expect(writeText).not.toHaveBeenCalled()
    expect(status()).toBe(NO_PHONES)
  })
})

describe('AC-2804.5 연락함', () => {
  it('AC-2804.5: 연락함 체크는 mark(열쇠 l|…, 읽은 날)를 보내고 저장 중이었다가 답이 오면 바뀐다', async () => {
    const { user } = setupUser()
    const t = setup()
    await flush()
    await user.click(table().getByRole('checkbox', { name: '이나래 연락함' }))
    expect(t.posted.filter((m) => m.type === 'mark')).toEqual([{ type: 'mark', key: KEY_LEE, on: true, today: TODAY }])
    expect(table().getAllByText('저장 중')).toHaveLength(1)
    t.send({ type: 'marked', key: KEY_LEE, ok: true, counts: null })
    expect((table().getByRole('checkbox', { name: '이나래 연락함' }) as HTMLInputElement).checked).toBe(true)
    expect(head()).toContain('아직 연락 안 한 분 1명')
  })

  it('AC-2804.5: 저장이 실패하면 그 줄 아래 실패 줄과 오류 번호', async () => {
    const { user } = setupUser()
    const t = setup()
    await flush()
    await user.click(table().getByRole('checkbox', { name: '이나래 연락함' }))
    t.send({ type: 'marked', key: KEY_LEE, ok: false, code: 'E-STORE-FAILED', counts: null })
    expect(table().getByText('연락함을 저장하지 못했어요. 다시 눌러 주세요.')).toBeTruthy()
  })

  it('AC-2804.5: 저장을 못 불러왔으면 연락함이 막히고 F/U와 같은 안내 줄이며 머리 요약에 연락 안 한 분 수가 없다', async () => {
    const { user } = setupUser()
    const t = setup({ marks: null, storeCode: 'E-STORE-FAILED' })
    await flush()
    for (const box of table().getAllByRole('checkbox')) expect((box as HTMLInputElement).disabled).toBe(true)
    const info = errorInfo('E-STORE-FAILED')
    expect(screen.getByText(`연락 표시를 불러오지 못해 [연락함]을 쓸 수 없어요. ${info.what}. ${info.fix}`)).toBeTruthy()
    expect(head()).toBe('3명 · 11월 6일 오후 6:20에 읽음다시 불러오기')
    const line = screen.getByText('오류 번호 E-STORE-FAILED').parentElement!
    await user.click(within(line).getByRole('button', { name: '다시 불러오기' }))
    expect(t.reloadStore).toHaveBeenCalledTimes(1)
  })
})

describe('AC-2802.4 다시 읽어도 고른 것은 그대로', () => {
  it('AC-2802.4: 새로 읽은 뒤 묶음을 다시 읽고, 고른 마지막 내원·마지막 진료 그대로 다시 묻는다', async () => {
    const { user } = setupUser()
    const t = setup()
    await flush()
    await user.click(button('3~6달'))
    await user.selectOptions(select(), '묶음 없음')
    const asked = t.filters().length
    t.setRead(readOf(READ_AT + 60_000))
    await flush()
    expect(groupsRead).toHaveBeenCalledTimes(2)
    expect(t.filters().length).toBeGreaterThan(asked)
    expect(t.lastFilter()).toEqual({ bucket: '3-6', rx: { kind: 'none' }, groups: SENT_GROUPS })
    expect(button('3~6달').getAttribute('aria-pressed')).toBe('true')
    expect(head()).toContain('11월 6일 오후 6:21에 읽음')
  })
})

describe('AC-2802.7 차트번호', () => {
  it('AC-2802.7: 화면 어디에도 차트번호 글자가 없다', async () => {
    const { user } = setupUser()
    const { container } = setup()
    await flush()
    await user.click(button('명단 복사'))
    expect(container.innerHTML).not.toMatch(/L-\d{4}/)
  })
})
