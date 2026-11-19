// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { groupKey } from '@/components/stats/treatmentView'
import { rangeOf, type StatsRange } from '@/components/stats/view'
import type { StatsRxGroup } from '@/types/rxGroups'
import type { BitSectionsView, MonthValue, PatientMix, PatientValueLine, PeriodValue, VisitHours } from '@/types/stats'
import type { BitSectionsShown } from './PatientMixSection'
import { PatientValueSection } from './PatientValueSection'

// 신환 1명당 매출 칸 = 고른 기간 그대로 (pv-month REQ-7202, bit-total AC-6911.4를 대신함, 시안 docs/mockups/bit-total/index.html ⑤ 배치 그대로). 매출 칸 다섯째 탭이다.
// 묶음 이름·코드·숫자는 모두 시험 안에서 지은 가짜다. Worker 답의 받은 치료는 묶음 열쇠(groupKey)뿐이고 이름은 화면이 붙인다.
// 칸은 Worker가 고른 기간으로 센 period를 그리고, 이름은 통계 기간(range)에서 온다

afterEach(cleanup)

const TITLE = '신환 1명당 매출'
const DESC = '고른 기간 신환이 그 기간에 낸 진료비를 받은 치료별로 봐요'
const NOT_HERE = '비트에서 불러오면 볼 수 있어요'
const OLD_HELPER = '도우미를 0.11.0으로 올리면 볼 수 있어요'
const NOBODY = '아직 셀 환자가 없어요'
const NO_FIRST_DAY = '그 달 1일부터 불러오면 볼 수 있어요'
const FOOT =
  '진료비 = 공단 부담까지 합친 총액. 고른 기간에 비트 신환 표시가 있는 환자를 그 기간 신환으로 보고, 그 기간 안에 낸 진료비와 내원만 세요. 환자별 금액은 이 PC 안에서만 계산하고 서버에 저장하지 않아요.'

// 통계 기간: 오늘 2026-11-19(진료 안 끝남). 11월 고르기 = 11/1~11/18
const TODAY = '2026-11-19'
const monthPick = (month: string) => rangeOf(TODAY, { kind: 'month', unit: 'day', month }, false)
const NOVEMBER = monthPick('2026-11')

const GROUPS: StatsRxGroup[] = [
  { id: 'g1', name: '도수', codes: ['MAN1', 'MAN2'], sortOrder: 0 },
  { id: 'g2', name: '충격파', codes: ['ESW'], out: ['XOUT'], sortOrder: 1 },
  { id: 'g3', name: '물리치료', codes: ['PT1'], sortOrder: 2 },
]
const keyOf = (name: string) => {
  const group = GROUPS.find((g) => g.name === name)!
  return groupKey(group.codes, group)
}
const line = (names: readonly string[] | null, n: number, average: number): PatientValueLine => ({ groups: names === null ? null : names.map(keyOf), n, average })

// Worker가 이미 평균이 작은 순으로 놓았다
const LINES = [
  line([], 212, 68_000),
  line(['물리치료'], 318, 142_000),
  line(['충격파'], 96, 388_000),
  line(['도수'], 141, 618_000),
  line(['도수', '충격파'], 58, 902_000),
]
// 고른 기간 11/1~11/18을 센 숫자. 달 줄(values)은 월간 보고서용이라 칸에 나오지 않는다
const OCTOBER: MonthValue = { month: '2026-10', to: '2026-10-31', n: 42, average: 203_500, times: 2.6, perVisit: 78_269, lines: [line([], 42, 203_500)] }
const VALUE: PeriodValue = { from: '2026-11-01', to: '2026-11-18', n: 825, average: 412_000, times: 5.1, perVisit: 80_800, lines: LINES }
const NOBODY_VALUE: PeriodValue = { ...VALUE, n: 0, average: 0, times: 0, perVisit: 0, lines: [] }

const MIX: PatientMix = { total: { people: 10, visits: 12 }, compared: false, age: [], insurance: [], city: [], town: [] }
const HOURS: VisitHours = { hours: [9], rows: [], unknown: 0, peak: null }
const ready = (period?: PeriodValue, values?: MonthValue[]): BitSectionsView => ({
  kind: 'ready',
  mix: { all: MIX, new: MIX },
  hours: HOURS,
  doctors: { kind: 'single' },
  ...(values === undefined ? {} : { values }),
  ...(period === undefined ? {} : { period }),
})
const last = (value: Partial<PeriodValue>) => ready({ ...VALUE, ...value }, [OCTOBER])

const draw = (view: BitSectionsShown, groups: readonly StatsRxGroup[] = GROUPS, range: StatsRange = NOVEMBER) =>
  render(<PatientValueSection view={view} groups={groups} range={range} />)
const section = () => screen.getByRole('heading', { level: 2, name: TITLE }).closest('section')!
// 머리 줄(제목 '신환 1명당 매출'·설명) 아래 내용 글자. 제목에 '1'이 있어 숫자 검사는 이것으로 한다
const body = () => [...section().children].slice(1).map((el) => el.textContent).join('')
const cells = () => [...section().querySelectorAll('[data-kpi]')].map((cell) => cell.textContent)
const list = () => screen.getByRole('list', { name: '받은 치료별' })
const rows = () => within(list()).getAllByRole('listitem')
const bars = () => rows().map((row) => row.querySelector<HTMLElement>('[data-bar]')!)

describe('AC-7202.2: 기다림 · 불러오지 않은 기기 · 옛 도우미 · 셀 환자가 없을 때', () => {
  it.each<[string, BitSectionsShown]>([
    ['불러오지 않음(null)', null],
    ['고른 기간을 불러오지 않음(none)', { kind: 'none' }],
  ])('AC-7202.2: %s이면 `비트에서 불러오면 볼 수 있어요`만 보이고 숫자가 없다(그대로)', (_name, view) => {
    draw(view)
    expect(within(section()).getByText(NOT_HERE)).toBeTruthy()
    expect(body()).toBe(NOT_HERE)
    expect(screen.queryByText(OLD_HELPER)).toBeNull()
    expect(screen.queryByText(NOBODY)).toBeNull()
  })

  it.each<[string, BitSectionsShown]>([
    ['금액 줄이 없는 답(period 열쇠 없음)', ready()],
    ['달 줄만 있고 period가 없는 답', ready(undefined, [OCTOBER])],
    ['v2 답(old-helper)', { kind: 'old-helper' }],
  ])('AC-7202.2: %s이면 `도우미를 0.11.0으로 올리면 볼 수 있어요`만 보이고 금액이 없다(그대로)', (_name, view) => {
    draw(view)
    expect(within(section()).getByText(OLD_HELPER)).toBeTruthy()
    expect(body()).toBe(OLD_HELPER)
    expect(screen.queryByText(NOT_HERE)).toBeNull()
    expect(section().querySelectorAll('[data-kpi]')).toHaveLength(0)
  })

  it('AC-7202.2: 답을 기다리는 동안은 안내·숫자 없이 제목·설명만이다', () => {
    draw('waiting')
    expect(screen.queryByText(NOT_HERE)).toBeNull()
    expect(screen.queryByText(OLD_HELPER)).toBeNull()
    expect(screen.queryByText(NOBODY)).toBeNull()
    expect(body()).toBe('')
  })

  it('AC-7202.2: 고른 기간의 신환이 0명이면 `아직 셀 환자가 없어요`이고 숫자가 없다(달 줄에 신환이 있어도)', () => {
    draw(ready(NOBODY_VALUE, [OCTOBER]))
    expect(within(section()).getByText(NOBODY)).toBeTruthy()
    expect(body()).toBe(NOBODY)
    expect(section().querySelectorAll('[data-kpi]')).toHaveLength(0)
  })

  it('AC-7202.2: `그 달 1일부터 불러오면 볼 수 있어요`는 어느 때에도 없다(달 줄이 빈 목록이어도 고른 기간 숫자를 그린다)', () => {
    for (const view of [null, 'waiting', { kind: 'none' }, { kind: 'old-helper' }, ready(), ready(NOBODY_VALUE, []), ready(VALUE, [])] as BitSectionsShown[]) {
      draw(view)
      expect(section().textContent).not.toContain(NO_FIRST_DAY)
      cleanup()
    }
    draw(ready(VALUE, []))
    expect(cells()).toHaveLength(3)
  })
})

describe('AC-7202.1: 고른 기간 — 설명 · 칸 위 줄 · 세 칸 · 받은 치료별 · 맨 아래 글', () => {
  it('AC-7202.1: 설명은 `고른 기간 신환이 그 기간에 낸 진료비를 받은 치료별로 봐요`이고 칸 어디에도 `90일`이 없다', () => {
    draw(last({}))
    expect(within(section()).getByText(DESC)).toBeTruthy()
    expect(section().textContent).not.toContain('90일')
  })

  it('AC-7202.1: 칸 위 줄 `{기간 이름} 신환 {n}명 · {기간 글}`이 세 칸 앞에 있다', () => {
    draw(last({}))
    const top = within(section()).getByText('2026년 11월 신환 825명 · 2026년 11월 1일 – 18일')
    expect(body().startsWith('2026년 11월 신환 825명 · 2026년 11월 1일 – 18일')).toBe(true)
    const grid = section().querySelector('[data-kpi]')!
    expect(top.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('AC-7202.1: 칸 위 줄 — 끝난 달·최근 30일·해를 넘는 기간, 천 명 넘으면 쉼표', () => {
    draw(ready({ ...VALUE, from: '2026-10-01', to: '2026-10-31', n: 1_234 }), GROUPS, monthPick('2026-10'))
    expect(within(section()).getByText('2026년 10월 신환 1,234명 · 2026년 10월 1일 – 31일')).toBeTruthy()
    cleanup()
    draw(ready({ ...VALUE, from: '2026-10-20', to: '2026-11-18', n: 120 }), GROUPS, rangeOf(TODAY, '30d', false))
    expect(within(section()).getByText('최근 30일 신환 120명 · 2026년 10월 20일 – 11월 18일')).toBeTruthy()
    cleanup()
    const custom = rangeOf(TODAY, { kind: 'custom', unit: 'day', from: '2025-12-20', to: '2026-01-10' }, false)
    draw(ready({ ...VALUE, from: '2025-12-20', to: '2026-01-10', n: 3 }), GROUPS, custom)
    expect(within(section()).getByText('직접 고른 기간 신환 3명 · 2025년 12월 20일 – 2026년 1월 10일')).toBeTruthy()
  })

  it('AC-7202.1: 세 칸 = {짧은 이름} 신환 1명당 평균 · {짧은 이름} 신환 1명당 내원 횟수 · 한 번 올 때 평균, 값은 period 것이고 금액은 만 원 아래까지 쓴다', () => {
    draw(last({}))
    expect(cells()).toEqual(['41만 2,000원11월 신환 1명당 평균', '5.1회11월 신환 1명당 내원 횟수', '8만 800원한 번 올 때 평균'])
    expect(body()).not.toContain('20만 3,500원')
  })

  it.each<[string, StatsRange, string]>([
    ['올해 달', monthPick('2026-10'), '10월'],
    ['다른 해 달', monthPick('2025-10'), '2025년 10월'],
    ['최근 7일', rangeOf(TODAY, '7d', false), '최근 7일'],
    ['최근 30일', rangeOf(TODAY, '30d', false), '최근 30일'],
    ['최근 90일', rangeOf(TODAY, '90d', false), '최근 90일'],
    ['최근 12개월', rangeOf(TODAY, '12m', false), '최근 12개월'],
    ['해 고르기', rangeOf(TODAY, { kind: 'year', year: '2026' }, false), '2026년'],
    ['직접 고른 기간', rangeOf(TODAY, { kind: 'custom', unit: 'day', from: '2026-09-03', to: '2026-10-02' }, false), '직접 고른 기간'],
  ])('AC-7202.1: 칸 이름의 짧은 이름 — %s', (_name, range, short) => {
    draw(last({}), GROUPS, range)
    expect(cells()).toEqual([`41만 2,000원${short} 신환 1명당 평균`, `5.1회${short} 신환 1명당 내원 횟수`, '8만 800원한 번 올 때 평균'])
  })

  it('AC-7202.1: 금액 글자 — 1만 원 미만은 원 단위, 만 원에 딱 맞으면 `만 원`, 억 단위·음수(환불이 더 큼)도 읽힌다', () => {
    draw(last({ average: 6_800, times: 3, perVisit: 410_000 }))
    expect(cells()).toEqual(['6,800원11월 신환 1명당 평균', '3.0회11월 신환 1명당 내원 횟수', '41만 원한 번 올 때 평균'])
    cleanup()
    draw(last({ average: 123_450_678, perVisit: -12_500 }))
    expect(cells()[0]).toBe('1억 2,345만 678원11월 신환 1명당 평균')
    expect(cells()[2]).toBe('−1만 2,500원한 번 올 때 평균')
  })

  it('AC-7202.1: 제목 `받은 치료별` 아래 줄마다 이름 · 막대 · `{금액} · {n}명`이고 줄 차례는 Worker가 준 그대로다(그대로)', () => {
    draw(last({}))
    const heading = screen.getByRole('heading', { level: 3, name: '받은 치료별' })
    expect(heading.compareDocumentPosition(list()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(rows().map((row) => row.textContent)).toEqual([
      '진료만6만 8,000원 · 212명',
      '진료 + 물리치료14만 2,000원 · 318명',
      '진료 + 충격파38만 8,000원 · 96명',
      '진료 + 도수61만 8,000원 · 141명',
      '도수 + 충격파90만 2,000원 · 58명',
    ])
  })

  it('AC-7202.1: 받은 치료 이름 — 없으면 진료만, 하나면 `진료 + {묶음}`, 둘 이상이면 묶음 이름을 ` + `로 잇고, 그 밖은 맨 끝 한 줄이다', () => {
    draw(last({ lines: [line(['도수', '충격파', '물리치료'], 5, 1_000_000), line(null, 40, 250_000)] }))
    expect(rows().map((row) => row.textContent)).toEqual(['도수 + 충격파 + 물리치료100만 원 · 5명', '그 밖25만 원 · 40명'])
  })

  it('AC-7202.1: 막대 폭 = 평균 ÷ (그 밖이 아닌 줄 가운데 가장 큰 평균)이고, 그 밖 막대는 흐린 색, 막대는 화면 읽기에서 숨긴다', () => {
    draw(last({ lines: [...LINES, line(null, 120, 1_200_000)] }))
    // 68,000 ÷ 902,000 = 7.54% · 142,000 → 15.74% · 388,000 → 43.02% · 618,000 → 68.51% · 그 밖은 100에서 자른다
    expect(bars().map((bar) => bar.style.width)).toEqual(['7.54%', '15.74%', '43.02%', '68.51%', '100%', '100%'])
    expect(bars().slice(0, 5).every((bar) => bar.className.split(/\s+/).includes('bg-cat-2'))).toBe(true)
    expect(bars()[5]!.className.split(/\s+/)).toContain('bg-line-strong')
    for (const bar of bars()) expect(bar.closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it('AC-7202.1: 평균이 0 이하인 줄은 막대가 비고, 그 밖 한 줄뿐이면 그 줄이 기준이다', () => {
    draw(last({ lines: [line([], 6, -3_000), line(['도수'], 5, 30_000)] }))
    expect(bars().map((bar) => bar.style.width)).toEqual(['0%', '100%'])
    expect(rows()[0]!.textContent).toBe('진료만−3,000원 · 6명')
    cleanup()
    draw(last({ lines: [line(null, 9, 50_000)] }))
    expect(bars().map((bar) => bar.style.width)).toEqual(['100%'])
  })

  it('AC-7202.1: 지금 묶음에 없는 열쇠가 든 줄(불러온 뒤 묶음을 바꿈)은 그리지 않고, 같은 열쇠면 앞 차례 묶음 이름이다', () => {
    const twin: StatsRxGroup = { id: 'g9', name: '도수 둘째', codes: ['MAN2', 'MAN1'], sortOrder: 9 }
    draw(last({ lines: [line(['도수'], 5, 10_000), { groups: ['gone-key'], n: 7, average: 20_000 }] }), [twin, ...GROUPS])
    expect(rows().map((row) => row.textContent)).toEqual(['진료 + 도수1만 원 · 5명'])
  })

  it('AC-7202.1: 천 단위는 쉼표이고 맨 아래 글(고른 기간 신환 설명)이 칸의 마지막이다', () => {
    draw(last({ lines: [line([], 1_234, 50_000)] }))
    expect(rows()[0]!.textContent).toBe('진료만5만 원 · 1,234명')
    expect(within(section()).getByText(FOOT)).toBeTruthy()
    expect(section().lastElementChild!.textContent).toBe(FOOT)
  })
})
