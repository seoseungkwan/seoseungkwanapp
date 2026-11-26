// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ViewingProvider } from '@/components/shell/viewing'
import { StatsCard } from '@/components/stats/sections/parts'
import type { StatsRxGroupsView } from '@/components/stats/useStatsRxGroups'
import { statsRange, type StatsInput } from '@/components/stats/view'
import { eachDay } from '@/lib/analytics/dates'
import type { DayPayload } from '@/types/payload'
import type { StatsRxGroup } from '@/types/rxGroups'
import type { UisPeriodRow, UisRxPayload } from '@/types/uisarang'
import { UisRxSection } from './UisRxSection'
import type { UisPeriodsView } from './useUisPeriods'

// 통계 탭 의사랑 처방 카드(specs/uisarang-upload AC-8812.4~AC-8812.7, 시안 docs/mockups/uisarang-upload ?s=stats·?s=stats-gap).
// 글자는 requirements.md '화면 글자' 통계 탭 그대로다. 처방 코드·이름·숫자·묶음 이름은 모두 이 파일에서 지어낸 값이다

const TODAY = '2026-11-27' // 금요일
const R7 = statsRange(TODAY, '7d') // 최근 7일 = 11월 20일 ~ 11월 26일
const CLOSED = '2026-11-22' // 일요일 휴진(덮었고 줄 없음)
const WORKED = eachDay(R7.current).filter((ymd) => ymd !== CLOSED) // 6일
const CARD_DESC = '처방량은 환자 수가 아니라 의사랑 총투여량의 합이에요'
const NA = '의사랑 엑셀로는 셀 수 없어요'

const day = (ymd: string): DayPayload => ({
  schemaVersion: 2,
  quality: 'valid',
  day: ymd,
  partial: false,
  totals: { patients: 10, newPatients: 2, returning: 8, unknown: 0 },
  rx: [],
  groups: [],
  revisit: { cohort: 0, within7: null, within14: null },
})
const INPUT: StatsInput = { days: WORKED.map(day), covered: [{ from: '2026-11-01', to: '2026-11-26' }], range: R7 }

const rxRow = (ymd: string): UisPeriodRow<UisRxPayload> => ({
  kind: 'rx',
  from: ymd,
  to: ymd,
  payload: {
    v: 1,
    rows: [
      { code: 'ESWT 1부위', name: '가짜 충격파 1부위', qty: 15.25, amount: 900000 },
      { code: 'HP', name: '가짜 온열', qty: 100, amount: 550000 },
      { code: 'MT30', name: '가짜 도수 30분', qty: 20, amount: 1600000 },
    ],
    total: 3050000,
  },
  updatedAt: '2026-11-26T10:05:00Z',
})
const ready = (rx: UisPeriodRow<UisRxPayload>[] = WORKED.map(rxRow)): UisPeriodsView => ({ state: 'ready', rx, age: [] })

// 넣는 처방 코드는 대소문자·빈칸이 엑셀과 달라도 맞춘다. 충격파 묶음은 빼는 처방이 있다(의사랑 엑셀로 셀 수 없음)
const GROUPS: StatsRxGroup[] = [
  { id: 'g1', name: '가짜 도수', codes: ['mt30'], sortOrder: 0 },
  { id: 'g2', name: '가짜 충격파', codes: ['ESWT 1부위', 'ZZ99'], out: ['HP'], sortOrder: 1 },
]
const groupsView = (over: Partial<StatsRxGroupsView> = {}): StatsRxGroupsView => ({
  state: 'ready',
  groups: GROUPS,
  suggested: false,
  saving: false,
  saveFailed: false,
  reread: vi.fn(),
  save: vi.fn(async () => true),
  forLoad: async () => [],
  ...over,
})

const draw = (periods: UisPeriodsView, { groups = groupsView(), input = INPUT, viewing = false }: { groups?: StatsRxGroupsView; input?: StatsInput; viewing?: boolean } = {}) =>
  render(
    <ViewingProvider viewing={viewing ? { hospitalId: '00000000-0000-4000-8000-0000000000d2', name: '가짜다라의원' } : null}>
      <StatsCard title="처방" desc={CARD_DESC}>
        <UisRxSection periods={periods} input={input} groups={groups} />
      </StatsCard>
    </ViewingProvider>,
  )
const tabNames = () => screen.getAllByRole('tab').map((tab) => tab.textContent)
function panel(name: string) {
  fireEvent.click(screen.getByRole('tab', { name }))
  return screen.getByRole('tabpanel')
}
const cellsOf = (row: HTMLElement) => [...row.querySelectorAll('th, td')].map((cell) => cell.textContent)
const rowsOf = (name: string) => within(screen.getByRole('table', { name })).getAllByRole('row').map(cellsOf)
const textsIn = (element: HTMLElement) => [...element.querySelectorAll('p')].map((p) => p.textContent)

afterEach(() => cleanup())

describe('UisRxSection 탭 (AC-8812.4)', () => {
  it('AC-8812.4: 탭은 묶음별 처방량 · 처방 코드별 · 처방별 신환·재진 · 몇 번까지 받나이고 처방 골라 보기는 없다', () => {
    draw(ready())
    expect(tabNames()).toEqual(['묶음별 처방량', '처방 코드별', '처방별 신환·재진', '몇 번까지 받나'])
    expect(screen.queryByRole('tab', { name: '처방 골라 보기' })).toBeNull()
  })

  it('AC-8812.4·AC-8812.2: 처방별 신환·재진 · 몇 번까지 받나 탭은 셀 수 없음 안내다', () => {
    draw(ready())
    expect(textsIn(panel('처방별 신환·재진'))).toContain(`${NA} · 처방을 환자마다 나눌 수 없어요.`)
    expect(textsIn(panel('몇 번까지 받나'))).toContain(`${NA} · 환자마다 다시 온 날을 알 수 없어요.`)
  })

  it('AC-8812.4: 의사랑 칸 소스에 폰 폭 클래스가 없다(PC 화면만 · 탭 줄·카드 틀·단추는 지금 부품 그대로)', () => {
    const dir = join(process.cwd(), 'src/components/stats/uisarang')
    const sources = readdirSync(dir).filter((name) => /\.tsx?$/.test(name) && !name.includes('.test.'))
    expect(sources.length).toBeGreaterThan(0)
    for (const name of sources) expect(readFileSync(join(dir, name), 'utf8')).not.toMatch(/max-(sm|md|lg):/)
  })
})

describe('묶음별 처방량 (AC-8812.5)', () => {
  it('AC-8812.5: 안내 · 덮음 줄 · 묶음 줄 · 그 밖 처방 · 합계(처방량 –) · 빼는 처방 안내가 화면 글자 그대로다', () => {
    draw(ready())
    const shown = panel('묶음별 처방량')
    expect(textsIn(shown)).toEqual(
      expect.arrayContaining([
        '만들어 둔 묶음마다 처방량과 총액',
        '최근 7일 처방 엑셀: 하루 6개',
        '빼는 처방·조건은 의사랑 엑셀로 셀 수 없어 넣는 처방만 더했어요.',
      ]),
    )
    expect(rowsOf('묶음별 처방량')).toEqual([
      ['묶음', '처방량', '총액'],
      ['가짜 도수', '120', '9,600,000원'],
      ['가짜 충격파', '91.5', '5,400,000원'],
      ['그 밖 처방', '–', '3,300,000원'],
      ['합계', '–', '18,300,000원'],
    ])
  })

  it('AC-8812.5: 덮음 줄은 한 달 · 한 주 · 하루 차례이고 0개인 것은 뺀다', () => {
    const MONTH_R = statsRange('2026-12-01', '30d') // 11월 1일 ~ 11월 30일
    const monthRow: UisPeriodRow<UisRxPayload> = { ...rxRow('2026-11-01'), to: '2026-11-30' }
    const days = eachDay(MONTH_R.current).map(day)
    draw(ready([monthRow]), { input: { days, covered: [MONTH_R.current], range: MONTH_R } })
    expect(textsIn(panel('묶음별 처방량'))).toContain('최근 30일 처방 엑셀: 한 달 1개')
  })

  it('AC-8812.5: 빼는 처방·조건이 있는 묶음이 없으면 빼는 처방 안내가 없다', () => {
    draw(ready(), { groups: groupsView({ groups: [GROUPS[0]!] }) })
    expect(textsIn(panel('묶음별 처방량')).some((text) => text?.includes('빼는 처방·조건은'))).toBe(false)
  })

  it('AC-8812.5: 기간이 처방 줄로 다 덮이지 않으면 표 대신 처방 엑셀이 모자라요 안내다(휴진 날은 빼고 센다)', () => {
    const rx = WORKED.filter((ymd) => ymd !== '2026-11-24' && ymd !== '2026-11-25').map(rxRow)
    draw(ready(rx))
    const shown = panel('묶음별 처방량')
    expect(textsIn(shown)).toContain('처방 엑셀이 모자라요 · 2일 치가 없어요: 11월 24일~25일. 그 날(또는 그 주·달) 기간별처방통계를 올려 주세요.')
    expect(within(shown).getByText('처방 엑셀이 모자라요').className).toContain('font-semibold')
    expect(within(shown).queryByRole('table')).toBeNull()
  })

  it('AC-8812.5: 묶음을 읽지 못하면 묶음 오류 카드 + [다시 읽기]다', () => {
    const reread = vi.fn()
    draw(ready(), { groups: groupsView({ state: 'read-failed', groups: [], reread }) })
    const shown = panel('묶음별 처방량')
    expect(within(shown).getByRole('alert').textContent).toContain('E-STATS-GROUP-READ-FAILED')
    fireEvent.click(within(shown).getByRole('button', { name: '다시 읽기' }))
    expect(reread).toHaveBeenCalledOnce()
  })

  it('AC-8812.5: 저장된 의사랑 숫자를 읽지 못하면 E-UIS-READ-FAILED 카드, 읽는 동안은 불러오는 중이다', () => {
    draw({ state: 'failed' })
    expect(within(panel('묶음별 처방량')).getByRole('alert').textContent).toContain('오류 번호 E-UIS-READ-FAILED')
    expect(within(panel('처방 코드별')).getByRole('alert').textContent).toContain('오류 번호 E-UIS-READ-FAILED')
    cleanup()
    draw({ state: 'reading' })
    expect(within(panel('묶음별 처방량')).getByText('불러오는 중')).toBeTruthy()
  })
})

describe('처방 코드별 (AC-8812.6)', () => {
  it('AC-8812.6: 안내 · 코드·처방명칭·처방량·총액 표가 총액 큰 차례다', () => {
    draw(ready())
    const shown = panel('처방 코드별')
    expect(textsIn(shown)).toContain('기간별처방통계의 코드마다')
    expect(rowsOf('처방 코드별')).toEqual([
      ['코드', '처방명칭', '처방량', '총액'],
      ['MT30', '가짜 도수 30분', '120', '9,600,000원'],
      ['ESWT 1부위', '가짜 충격파 1부위', '91.5', '5,400,000원'],
      ['HP', '가짜 온열', '600', '3,300,000원'],
    ])
  })

  it('AC-8812.6: 기간이 다 덮이지 않으면 처방 코드별도 같은 모자람 안내다', () => {
    draw(ready(WORKED.filter((ymd) => ymd !== '2026-11-26').map(rxRow)))
    expect(textsIn(panel('처방 코드별'))).toContain('처방 엑셀이 모자라요 · 1일 치가 없어요: 11월 26일. 그 날(또는 그 주·달) 기간별처방통계를 올려 주세요.')
  })
})

describe('[묶음 고치기] (AC-8812.7)', () => {
  it('AC-8812.7: 찾기 목록은 그 기간 의사랑 처방 코드 + 묶음에 든 코드이고 건수 글자가 없다', async () => {
    draw(ready())
    fireEvent.click(within(panel('묶음별 처방량')).getByRole('button', { name: '묶음 고치기' }))
    await waitFor(() => expect(screen.getByRole('heading', { level: 3, name: '묶음별 처방량 · 묶음 고치기' })).toBeTruthy())
    const first = screen.getAllByRole('textbox', { name: '묶음 이름' })[0]!.closest('li')!
    expect(within(first).getByRole('list', { name: '넣는 처방' }).textContent).not.toMatch(/\d건|최근 7일/)
    fireEvent.click(within(first).getByRole('button', { name: '+ 처방 넣기' }))
    const found = within(screen.getByRole('list', { name: '찾은 처방' }))
      .getAllByRole('button')
      .map((row) => row.textContent ?? '')
    // 고치기 화면이 이름 차례로 늘어놓는다(이름 없는 묶음 코드 ZZ99가 맨 앞). 이름은 의사랑 처방명칭이다
    expect(found.map((text) => text.replace('이 묶음에 있음', '').replace(/가짜 충격파에 있어요.*$/, ''))).toEqual([
      'ZZ99',
      '가짜 도수 30분MT30',
      '가짜 온열HP',
      '가짜 충격파 1부위ESWT 1부위',
    ])
    for (const text of found) expect(text).not.toMatch(/\d건/)
  })

  it('AC-8812.7: 고친 묶음은 묶음 훅 저장으로 보내고, 성공하면 보는 화면으로 돌아온다', async () => {
    const groups = groupsView()
    draw(ready(), { groups })
    fireEvent.click(within(panel('묶음별 처방량')).getByRole('button', { name: '묶음 고치기' }))
    fireEvent.click(await screen.findByRole('button', { name: '저장' }))
    await waitFor(() => expect(groups.save).toHaveBeenCalledOnce())
    await waitFor(() => expect(screen.getByRole('table', { name: '묶음별 처방량' })).toBeTruthy())
  })

  it('AC-8812.7: 다른 의원을 보는 중이면 [묶음 고치기]가 없다', () => {
    draw(ready(), { viewing: true })
    expect(within(panel('묶음별 처방량')).queryByRole('button', { name: '묶음 고치기' })).toBeNull()
  })
})
