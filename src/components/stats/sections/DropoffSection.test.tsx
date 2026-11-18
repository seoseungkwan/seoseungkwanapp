// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { groupKey } from '@/components/stats/treatmentView'
import type { StatsRxGroup } from '@/types/rxGroups'
import type { BitSectionsView, DropoffLine, PatientMix, VisitHours } from '@/types/stats'
import { DropoffSection } from './DropoffSection'
import type { BitSectionsShown } from './PatientMixSection'

// 몇 번까지 받나 칸 (stats-insights REQ-6103 AC-6103.2~AC-6103.5, 시안 docs/mockups/stats-insights/index.html ③).
// 묶음 이름·코드·숫자는 모두 시험 안에서 지은 가짜다(도수는 시안 숫자). Worker 답의 묶음은 열쇠(groupKey)뿐이고 이름은 화면이 붙인다

afterEach(cleanup)

const TITLE = '몇 번까지 받나'
const NOT_HERE = '비트에서 불러오면 볼 수 있어요'
const NOBODY = '아직 셀 환자가 없어요'
const FOOT = '마지막으로 받은 뒤 30일 넘게 안 오면 끝난 것으로 봐요. 아직 다니는 중인 환자는 뺐어요.'

const GROUPS: StatsRxGroup[] = [
  { id: 'g1', name: '도수', codes: ['MAN1', 'MAN2'], sortOrder: 0 },
  { id: 'g2', name: '충격파', codes: ['ESW'], out: ['XOUT'], sortOrder: 1 },
  { id: 'g3', name: '주사', codes: ['INJ'], sortOrder: 2 },
  { id: 'g4', name: '물리치료', codes: ['PT1'], sortOrder: 3 },
]
const keyOf = (name: string) => {
  const group = GROUPS.find((g) => g.name === name)!
  return groupKey(group.codes, group)
}
const line = (name: string, n: number, atLeast: DropoffLine['atLeast'], ten: number, average: number, drop: number): DropoffLine => ({
  group: keyOf(name),
  n,
  atLeast,
  ten,
  once: atLeast[0] - atLeast[1],
  average,
  drop,
})
const MANUAL = line('도수', 214, [214, 152, 133, 109, 94, 79], 39, 4.6, 1)
const SHOCK = line('충격파', 168, [168, 111, 81, 60, 45, 35], 12, 3.2, 1)
const INJECTION = line('주사', 121, [121, 100, 28, 15, 10, 7], 2, 1.9, 2)
const PT = line('물리치료', 402, [402, 237, 157, 120, 95, 72], 30, 3, 1)

const MIX: PatientMix = { total: { people: 10, visits: 12 }, compared: false, age: [], insurance: [], city: [], town: [] }
const HOURS: VisitHours = { hours: [9], rows: [], unknown: 0, peak: null }
const ready = (dropoff?: DropoffLine[]): BitSectionsView => ({
  kind: 'ready',
  mix: { all: MIX, new: MIX },
  hours: HOURS,
  doctors: { kind: 'single' },
  ...(dropoff === undefined ? {} : { dropoff }),
})
// 일부러 대상 수 차례가 아니다(화면이 대상이 많은 순으로 놓는다)
const ALL = [SHOCK, MANUAL, PT, INJECTION]

const draw = (view: BitSectionsShown, groups: readonly StatsRxGroup[] = GROUPS) => render(<DropoffSection view={view} groups={groups} />)
const section = () => screen.getByRole('heading', { level: 2, name: TITLE }).closest('section')!
const picker = () => screen.getByRole('group', { name: '치료 묶음' })
const chips = () => within(picker()).getAllByRole('button')
const chip = (name: string) => within(picker()).getByRole('button', { name })
const funnel = () => screen.getByRole('list', { name: '받은 횟수' })
const funnelRows = () => within(funnel()).getAllByRole('listitem')
const cells = () => [...section().querySelectorAll('[data-kpi]')].map((cell) => cell.textContent)

describe('AC-6103.5: 비트에서 불러오지 않은 기기 · 셀 환자가 없을 때', () => {
  it.each<[string, BitSectionsShown]>([
    ['불러오지 않음(null)', null],
    ['고른 기간을 불러오지 않음(none)', { kind: 'none' }],
    ['옛 도우미(old-helper)', { kind: 'old-helper' }],
  ])('AC-6103.5: %s이면 `비트에서 불러오면 볼 수 있어요`만 보이고 숫자가 없다', (_name, view) => {
    draw(view)
    expect(within(section()).getByText(NOT_HERE)).toBeTruthy()
    expect(section().textContent).not.toMatch(/\d/)
    expect(screen.queryByRole('group', { name: '치료 묶음' })).toBeNull()
    expect(screen.queryByText(NOBODY)).toBeNull()
  })

  it('AC-6103.5: 답을 기다리는 동안은 안내·숫자 없이 제목·설명만이다', () => {
    draw('waiting')
    expect(screen.queryByText(NOT_HERE)).toBeNull()
    expect(screen.queryByText(NOBODY)).toBeNull()
    expect(section().textContent).not.toMatch(/\d/)
  })

  it.each<[string, DropoffLine[] | undefined, readonly StatsRxGroup[]]>([
    ['dropoff가 비었음', [], GROUPS],
    ['dropoff 열쇠가 없음(묶음 없이 불러옴)', undefined, GROUPS],
    ['답의 묶음이 지금 묶음에 없음(불러온 뒤 묶음을 바꿈)', [MANUAL], [{ ...GROUPS[0]!, codes: ['NEW1'] }]],
  ])('AC-6103.5: 대상이 한 명도 없으면(%s) `아직 셀 환자가 없어요`이고 숫자가 없다', (_name, dropoff, groups) => {
    draw(ready(dropoff), groups)
    expect(within(section()).getByText(NOBODY)).toBeTruthy()
    expect(section().textContent).not.toMatch(/\d/)
    expect(screen.queryByText(NOT_HERE)).toBeNull()
  })
})

describe('AC-6103.2: 묶음 고르기와 세 칸', () => {
  it('AC-6103.2: 묶음 고르기는 대상이 많은 순이고 처음은 맨 앞이 골라져 있다', () => {
    draw(ready(ALL))
    expect(chips().map((b) => b.textContent)).toEqual(['물리치료', '도수', '충격파', '주사'])
    expect(chips().map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'false'])
    expect(chips().every((b) => b.getAttribute('type') === 'button')).toBe(true)
  })

  it('AC-6103.2: 세 칸 = `{p}%` 1회만 받고 끝난 환자 ({n}명 중 {k}명) · `{평균}회` 한 사람이 받은 횟수 평균 · `{k}회 → {k+1}회` 가장 많이 빠지는 곳', () => {
    draw(ready(ALL))
    // 물리치료: 165 ÷ 402 = 41.04% → 41%, 평균 3 → 3.0회
    expect(cells()).toEqual(['41%1회만 받고 끝난 환자 (402명 중 165명)', '3.0회한 사람이 받은 횟수 평균', '1회 → 2회가장 많이 빠지는 곳'])
    fireEvent.click(chip('도수'))
    expect(chips().map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false', 'false'])
    // 시안 숫자: 62 ÷ 214 = 28.97% → 29%
    expect(cells()).toEqual(['29%1회만 받고 끝난 환자 (214명 중 62명)', '4.6회한 사람이 받은 횟수 평균', '1회 → 2회가장 많이 빠지는 곳'])
    fireEvent.click(chip('주사'))
    expect(cells()).toEqual(['17%1회만 받고 끝난 환자 (121명 중 21명)', '1.9회한 사람이 받은 횟수 평균', '2회 → 3회가장 많이 빠지는 곳'])
  })

  it('AC-6103.2: 묶음 이름은 지금 묶음의 열쇠(넣는·빼는 처방)로 찾고, 같은 열쇠면 앞 차례 묶음 이름이다. 천 단위는 쉼표다', () => {
    const twin: StatsRxGroup = { id: 'g9', name: '도수 둘째', codes: ['MAN2', 'MAN1'], sortOrder: 9 }
    const big = { ...MANUAL, n: 1214, atLeast: [1214, 152, 133, 109, 94, 79] as DropoffLine['atLeast'], once: 1062 }
    draw(ready([big]), [twin, ...GROUPS])
    expect(chips().map((b) => b.textContent)).toEqual(['도수'])
    expect(cells()[0]).toBe('87%1회만 받고 끝난 환자 (1,214명 중 1,062명)')
  })
})

describe('AC-6103.3: 고른 묶음의 횟수 줄', () => {
  it('AC-6103.3: 제목 `{묶음} 처음 받은 신환 {n}명` 아래 1~6회 이상·10회 이상 줄이 `{인원}명`이고 2~6회 줄에만 `−{d}%`가 붙는다', () => {
    draw(ready(ALL))
    fireEvent.click(chip('도수'))
    const heading = screen.getByRole('heading', { level: 3, name: '도수 처음 받은 신환 214명' })
    expect(heading.compareDocumentPosition(funnel()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // d = (앞 줄 − 이 줄) ÷ n 반올림: 62/214 → 29 · 19/214 → 9 · 24/214 → 11 · 15/214 → 7 · 15/214 → 7
    expect(funnelRows().map((row) => row.textContent)).toEqual([
      '1회 이상214명',
      '2회 이상152명−29%',
      '3회 이상133명−9%',
      '4회 이상109명−11%',
      '5회 이상94명−7%',
      '6회 이상79명−7%',
      '10회 이상39명',
    ])
  })

  it('AC-6103.3: 막대 폭 = 인원 ÷ n이고 막대는 화면 읽기에서 숨긴다', () => {
    draw(ready([MANUAL]))
    const bars = funnelRows().map((row) => row.querySelector<HTMLElement>('[data-bar]')!)
    expect(bars.map((bar) => bar.style.width)).toEqual(['100%', '71.03%', '62.15%', '50.93%', '43.93%', '36.92%', '18.22%'])
    for (const bar of bars) expect(bar.closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it('AC-6103.3: 다른 묶음을 고르면 제목·줄이 그 묶음 숫자로 바뀐다', () => {
    draw(ready(ALL))
    expect(screen.getByRole('heading', { level: 3, name: '물리치료 처음 받은 신환 402명' })).toBeTruthy()
    fireEvent.click(chip('충격파'))
    expect(screen.queryByRole('heading', { level: 3, name: '물리치료 처음 받은 신환 402명' })).toBeNull()
    expect(screen.getByRole('heading', { level: 3, name: '충격파 처음 받은 신환 168명' })).toBeTruthy()
    expect(funnelRows()[1]!.textContent).toBe('2회 이상111명−34%')
    expect(funnelRows()[6]!.textContent).toBe('10회 이상12명')
  })
})

describe('AC-6103.4: 치료별로 견주기 · 맨 아래 글', () => {
  const table = () => screen.getByRole('table', { name: '치료별로 견주기' })
  const rowsOf = () => within(table()).getAllByRole('row').map((row) => [...row.querySelectorAll('th, td')].map((cell) => cell.textContent))

  it('AC-6103.4: 묶음이 둘 이상이면 표 칸이 치료·처음 받은 신환·1회만·3회 이상·6회 이상·평균이고 묶음마다 한 줄(대상이 많은 순)이다', () => {
    draw(ready(ALL))
    expect(screen.getByRole('heading', { level: 3, name: '치료별로 견주기' })).toBeTruthy()
    expect(rowsOf()).toEqual([
      ['치료', '처음 받은 신환', '1회만', '3회 이상', '6회 이상', '평균'],
      ['물리치료', '402명', '41%', '39%', '18%', '3.0회'],
      ['도수', '214명', '29%', '62%', '37%', '4.6회'],
      ['충격파', '168명', '34%', '48%', '21%', '3.2회'],
      ['주사', '121명', '17%', '23%', '6%', '1.9회'],
    ])
  })

  it('AC-6103.4: 묶음이 하나면 표가 없고, 맨 아래 글은 숫자가 있을 때 늘 보인다', () => {
    draw(ready([MANUAL]))
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByRole('heading', { name: '치료별로 견주기' })).toBeNull()
    expect(within(section()).getByText(FOOT)).toBeTruthy()
    cleanup()

    draw(ready(ALL))
    expect(within(section()).getByText(FOOT)).toBeTruthy()
    // 맨 아래 글이 칸의 마지막이다
    expect(section().lastElementChild!.textContent).toBe(FOOT)
  })

  it('AC-6103.4: 표는 폰 폭에서 그 안에서만 옆으로 밀린다', () => {
    draw(ready(ALL))
    expect(table().parentElement!.className.split(/\s+/)).toContain('overflow-x-auto')
  })
})
