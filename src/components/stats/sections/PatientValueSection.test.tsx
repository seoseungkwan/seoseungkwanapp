// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { groupKey } from '@/components/stats/treatmentView'
import type { StatsRxGroup } from '@/types/rxGroups'
import type { BitSectionsView, PatientMix, PatientValue, PatientValueLine, VisitHours } from '@/types/stats'
import type { BitSectionsShown } from './PatientMixSection'
import { PatientValueSection } from './PatientValueSection'

// 신환 1명당 매출 칸 (stats-insights REQ-6106 AC-6106.4·AC-6106.5, 시안 docs/mockups/stats-insights/index.html ⑥). 매출 칸 다섯째 탭이다.
// 묶음 이름·코드·숫자는 모두 시험 안에서 지은 가짜다(시안 숫자). Worker 답의 받은 치료는 묶음 열쇠(groupKey)뿐이고 이름은 화면이 붙인다

afterEach(cleanup)

const TITLE = '신환 1명당 매출'
const NOT_HERE = '비트에서 불러오면 볼 수 있어요'
const OLD_HELPER = '도우미를 0.11.0으로 올리면 볼 수 있어요'
const NOBODY = '아직 셀 환자가 없어요'
const FOOT = '진료비 = 공단 부담까지 합친 총액. 처음 온 지 90일이 다 지난 신환만 세요. 환자별 금액은 이 PC 안에서만 계산하고 서버에 저장하지 않아요.'

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

// 시안 ⑥ 숫자. Worker가 이미 평균이 작은 순으로 놓았다
const LINES = [
  line([], 212, 68_000),
  line(['물리치료'], 318, 142_000),
  line(['충격파'], 96, 388_000),
  line(['도수'], 141, 618_000),
  line(['도수', '충격파'], 58, 902_000),
]
const VALUE: PatientValue = { n: 825, average: 412_000, times: 5.1, perVisit: 80_800, lines: LINES }

const MIX: PatientMix = { total: { people: 10, visits: 12 }, compared: false, age: [], insurance: [], city: [], town: [] }
const HOURS: VisitHours = { hours: [9], rows: [], unknown: 0, peak: null }
const ready = (value?: PatientValue): BitSectionsView => ({
  kind: 'ready',
  mix: { all: MIX, new: MIX },
  hours: HOURS,
  doctors: { kind: 'single' },
  ...(value === undefined ? {} : { value }),
})

const draw = (view: BitSectionsShown, groups: readonly StatsRxGroup[] = GROUPS) => render(<PatientValueSection view={view} groups={groups} />)
const section = () => screen.getByRole('heading', { level: 2, name: TITLE }).closest('section')!
// 머리 줄(제목 '신환 1명당 매출'·설명) 아래 내용 글자. 제목에 '1'이 있어 숫자 검사는 이것으로 한다
const body = () => [...section().children].slice(1).map((el) => el.textContent).join('')
const cells = () => [...section().querySelectorAll('[data-kpi]')].map((cell) => cell.textContent)
const list = () => screen.getByRole('list', { name: '받은 치료별' })
const rows = () => within(list()).getAllByRole('listitem')
const bars = () => rows().map((row) => row.querySelector<HTMLElement>('[data-bar]')!)

describe('AC-6106.5: 불러오지 않은 기기 · 옛 도우미 · 셀 환자가 없을 때', () => {
  it.each<[string, BitSectionsShown]>([
    ['불러오지 않음(null)', null],
    ['고른 기간을 불러오지 않음(none)', { kind: 'none' }],
  ])('AC-6106.5: %s이면 `비트에서 불러오면 볼 수 있어요`만 보이고 숫자가 없다', (_name, view) => {
    draw(view)
    expect(within(section()).getByText(NOT_HERE)).toBeTruthy()
    expect(body()).toBe(NOT_HERE)
    expect(screen.queryByText(OLD_HELPER)).toBeNull()
    expect(screen.queryByText(NOBODY)).toBeNull()
  })

  it.each<[string, BitSectionsShown]>([
    ['금액 줄이 없는 답(value 열쇠 없음)', ready()],
    ['v2 답(old-helper)', { kind: 'old-helper' }],
  ])('AC-6106.5: %s이면 `도우미를 0.11.0으로 올리면 볼 수 있어요`만 보이고 금액이 없다', (_name, view) => {
    draw(view)
    expect(within(section()).getByText(OLD_HELPER)).toBeTruthy()
    expect(body()).toBe(OLD_HELPER)
    expect(screen.queryByText(NOT_HERE)).toBeNull()
    expect(section().querySelectorAll('[data-kpi]')).toHaveLength(0)
  })

  it('AC-6106.5: 답을 기다리는 동안은 안내·숫자 없이 제목·설명만이다', () => {
    draw('waiting')
    expect(screen.queryByText(NOT_HERE)).toBeNull()
    expect(screen.queryByText(OLD_HELPER)).toBeNull()
    expect(screen.queryByText(NOBODY)).toBeNull()
    expect(body()).toBe('')
  })

  it('AC-6106.5: 대상이 한 명도 없으면 `아직 셀 환자가 없어요`이고 숫자가 없다', () => {
    draw(ready({ n: 0, average: 0, times: 0, perVisit: 0, lines: [] }))
    expect(within(section()).getByText(NOBODY)).toBeTruthy()
    expect(body()).toBe(NOBODY)
    expect(screen.queryByText(NOT_HERE)).toBeNull()
  })
})

describe('AC-6106.4: 세 칸 · 받은 치료별 · 맨 아래 글', () => {
  it('AC-6106.4: 세 칸 = 신환 1명당 평균 (90일) · 신환 1명당 내원 횟수 (90일) · 한 번 올 때 평균, 금액은 만 원 아래까지 쓴다', () => {
    draw(ready(VALUE))
    expect(cells()).toEqual(['41만 2,000원신환 1명당 평균 (90일)', '5.1회신환 1명당 내원 횟수 (90일)', '8만 800원한 번 올 때 평균'])
  })

  it('AC-6106.4: 금액 글자 — 1만 원 미만은 원 단위, 만 원에 딱 맞으면 `만 원`, 억 단위·음수(환불이 더 큼)도 읽힌다', () => {
    draw(ready({ ...VALUE, average: 6_800, times: 3, perVisit: 410_000 }))
    expect(cells()).toEqual(['6,800원신환 1명당 평균 (90일)', '3.0회신환 1명당 내원 횟수 (90일)', '41만 원한 번 올 때 평균'])
    cleanup()
    draw(ready({ ...VALUE, average: 123_450_678, perVisit: -12_500 }))
    expect(cells()[0]).toBe('1억 2,345만 678원신환 1명당 평균 (90일)')
    expect(cells()[2]).toBe('−1만 2,500원한 번 올 때 평균')
  })

  it('AC-6106.4: 제목 `받은 치료별` 아래 줄마다 이름 · 막대 · `{금액} · {n}명`이고 줄 차례는 Worker가 준 그대로다', () => {
    draw(ready(VALUE))
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

  it('AC-6106.4: 받은 치료 이름 — 없으면 진료만, 하나면 `진료 + {묶음}`, 둘 이상이면 묶음 이름을 ` + `로 잇고, 그 밖은 맨 끝 한 줄이다', () => {
    draw(ready({ ...VALUE, lines: [line(['도수', '충격파', '물리치료'], 5, 1_000_000), line(null, 40, 250_000)] }))
    expect(rows().map((row) => row.textContent)).toEqual(['도수 + 충격파 + 물리치료100만 원 · 5명', '그 밖25만 원 · 40명'])
  })

  it('AC-6106.4: 막대 폭 = 평균 ÷ (그 밖이 아닌 줄 가운데 가장 큰 평균)이고, 그 밖 막대는 흐린 색, 막대는 화면 읽기에서 숨긴다', () => {
    draw(ready({ ...VALUE, lines: [...LINES, line(null, 120, 1_200_000)] }))
    // 68,000 ÷ 902,000 = 7.54% · 142,000 → 15.74% · 388,000 → 43.02% · 618,000 → 68.51% · 그 밖은 100에서 자른다
    expect(bars().map((bar) => bar.style.width)).toEqual(['7.54%', '15.74%', '43.02%', '68.51%', '100%', '100%'])
    expect(bars().slice(0, 5).every((bar) => bar.className.split(/\s+/).includes('bg-cat-2'))).toBe(true)
    expect(bars()[5]!.className.split(/\s+/)).toContain('bg-line-strong')
    for (const bar of bars()) expect(bar.closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it('AC-6106.4: 평균이 0 이하인 줄은 막대가 비고, 그 밖 한 줄뿐이면 그 줄이 기준이다', () => {
    draw(ready({ ...VALUE, lines: [line([], 6, -3_000), line(['도수'], 5, 30_000)] }))
    expect(bars().map((bar) => bar.style.width)).toEqual(['0%', '100%'])
    expect(rows()[0]!.textContent).toBe('진료만−3,000원 · 6명')
    cleanup()
    draw(ready({ ...VALUE, lines: [line(null, 9, 50_000)] }))
    expect(bars().map((bar) => bar.style.width)).toEqual(['100%'])
  })

  it('AC-6106.4: 지금 묶음에 없는 열쇠가 든 줄(불러온 뒤 묶음을 바꿈)은 그리지 않고, 같은 열쇠면 앞 차례 묶음 이름이다', () => {
    const twin: StatsRxGroup = { id: 'g9', name: '도수 둘째', codes: ['MAN2', 'MAN1'], sortOrder: 9 }
    draw(ready({ ...VALUE, lines: [line(['도수'], 5, 10_000), { groups: ['gone-key'], n: 7, average: 20_000 }] }), [twin, ...GROUPS])
    expect(rows().map((row) => row.textContent)).toEqual(['진료 + 도수1만 원 · 5명'])
  })

  it('AC-6106.4: 천 단위는 쉼표이고 맨 아래 글이 칸의 마지막이다', () => {
    draw(ready({ ...VALUE, lines: [line([], 1_234, 50_000)] }))
    expect(rows()[0]!.textContent).toBe('진료만5만 원 · 1,234명')
    expect(within(section()).getByText(FOOT)).toBeTruthy()
    expect(section().lastElementChild!.textContent).toBe(FOOT)
  })
})
