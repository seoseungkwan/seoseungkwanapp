// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TOC_LINKS } from '@/components/stats/StatsToc'
import { CompareStats, NOT_DRAWN, SIDE_ROWS, type SideClinic } from './CompareStats'
import type { CompareStatsCells } from './statsInput'

// 통계 나란히 보기 판(spec admin-view REQ-8016 AC-8016.1~AC-8016.4, 시안 docs/mockups/admin-view ?s=compare-region sideSection).
// 의원·숫자는 지어낸 것이다. 판은 props만 받고 네트워크를 부르지 않는다

// 판 전체가 ReadOnlyArea 안인지 본다(감싸는 자리를 표시로 바꿈)
vi.mock('@/components/shell/viewing', async (original) => ({
  ...(await original<typeof import('@/components/shell/viewing')>()),
  ReadOnlyArea: ({ children }: { children: ReactNode }) => <div data-testid="read-only-area">{children}</div>,
}))

afterEach(cleanup)

const MONTH = '2026-10'
const SIDE_DESC = '통계 탭 카드를 의원마다 나란히 · 같은 달 · 옆으로 밀어 봐요'

const cellsOf = (visits: string, hasData = true): CompareStatsCells => ({
  hasData,
  summary: {
    patients: [
      { label: '하루 평균 내원', value: visits, unit: '건' },
      { label: '신환', value: '286', unit: '명' },
      { label: '90일초진', value: '54', unit: '건' },
      { label: '재진', value: '3,072', unit: '건' },
    ],
    revenue: [
      { label: '총매출', value: '1억 3,261만', unit: '원' },
      { label: '건당 진료비', value: '38,866', unit: '원' },
    ],
    alerts: [],
    goal: null,
  },
  patients: { daily: null, age: null, revisit: [{ label: '7일 안', value: null, unit: '%' }, { label: '14일 안', value: null, unit: '%' }, { label: '30일 안', value: null, unit: '%' }], dropoff: null },
  revenue: { trend: null, split: null },
  sunap: null,
  calendar: null,
  rx: { trend: null, split: null },
  ops: { doctors: 'single', hours: null, weekdays: null, holiday: null },
})

// 이름 차례로는 내 의원(하하)이 맨 뒤다
const CLINICS: SideClinic[] = [
  { id: 'h-2', name: '나무 정형외과', region: '서울', own: false, cells: cellsOf('120') },
  { id: 'h-own', name: '하하 정형외과', region: '서울', own: true, cells: cellsOf('136') },
  { id: 'h-1', name: '가람 정형외과', region: '서울', own: false, cells: cellsOf('98') },
]
const ORDER = ['하하 정형외과', '가람 정형외과', '나무 정형외과']
const ROW_TEXT: Array<[string, string]> = [
  ['요약', '환자 요약 · 매출 요약 · 평소와 다른 것(그 달 마지막 주를 앞 4주와 견줌) · 이번 달 목표(그 달 목표)'],
  ['환자', '일별 내원 · 환자 구성 · 신환 재방문율 · 몇 번까지 받나'],
  ['매출', '매출 추이 · 급여·비급여·기타'],
  ['예약·전환', '신환 예약률 · 90일 예약률 · Block 전환'],
  ['예약', '예약 수 · 취소율 · 변경율 · 안 옴율'],
  ['처방', '처방별 추세 · 처방별 신환·재진'],
  ['진료 운영', '원장님별 · 시간대별 접수 · 요일별 내원 · 휴일에 따라'],
]

function board(clinics: SideClinic[] = CLINICS, region = '서울', onRetry = vi.fn()) {
  const view = render(<CompareStats month={MONTH} region={region} clinics={clinics} onRetry={onRetry} />)
  return { ...view, onRetry, section: view.container.querySelector('section') as HTMLElement }
}
const gridOf = (section: HTMLElement) => section.querySelector('[style*="grid-template-columns"]') as HTMLElement

describe('CompareStats — 줄·칸 (AC-8016.1)', () => {
  it('AC-8016.1: 제목·옆 글은 {달} · {지역} {n}곳 · 통계 탭 카드를 의원마다 나란히 · 같은 달 · 옆으로 밀어 봐요', () => {
    const { section } = board()
    expect(within(section).getByRole('heading', { level: 2 }).textContent).toBe('통계 나란히 보기')
    expect(section.getAttribute('id')).toBe('cmp-side')
    expect(section.getAttribute('aria-labelledby')).toBe(within(section).getByRole('heading', { level: 2 }).id)
    expect(within(section).getByText(`2026년 10월 · 서울 3곳 · ${SIDE_DESC}`)).toBeTruthy()
  })

  it('AC-8016.1: 칸 = 의원마다 288px, 내 의원 먼저 + 이름 차례, 머리는 이름 · 지역(내 의원 칩)', () => {
    const { section } = board()
    const grid = gridOf(section)
    expect(grid.style.gridTemplateColumns).toBe('repeat(3, 288px)')
    const heads = [...grid.children].slice(0, 3)
    expect(heads.map((head) => head.querySelector('b')?.textContent)).toEqual(ORDER)
    expect(heads[0]!.textContent).toBe('하하 정형외과서울내 의원')
    expect(heads[1]!.textContent).toBe('가람 정형외과서울')
  })

  it('AC-8016.1: 줄 = 통계 큰 카드 일곱(줄 이름 옆에 작은 칸 이름들), 같은 의원 카드는 같은 차례로 줄마다 놓인다', () => {
    const { section } = board()
    const items = [...gridOf(section).children].slice(3)
    expect(items).toHaveLength(7 * 4)
    ROW_TEXT.forEach(([name, cells], i) => {
      const [head, ...cards] = items.slice(i * 4, i * 4 + 4)
      expect(within(head as HTMLElement).getByRole('heading', { level: 3 }).textContent).toBe(name)
      expect(head!.textContent).toBe(`${name}${cells}`)
      expect(cards.map((card) => card.querySelector('p')?.textContent)).toEqual(ORDER)
    })
    expect(SIDE_ROWS.map((row) => [row.name, row.cells])).toEqual(ROW_TEXT)
  })

  it('AC-8016.1: 줄 이름 칸은 왼쪽에 붙고(sticky left-0) 줄 전체 폭이며, 판은 옆으로 민다(overflow-x-auto)', () => {
    const { section } = board()
    const grid = gridOf(section)
    const rowHead = [...grid.children][3] as HTMLElement
    expect(rowHead.className).toContain('col-span-full')
    const label = rowHead.firstElementChild as HTMLElement
    expect(label.className.split(' ')).toEqual(expect.arrayContaining(['sticky', 'left-0']))
    expect((grid.parentElement as HTMLElement).className.split(' ')).toContain('overflow-x-auto')
    // 줄 높이 = 그 줄에서 가장 높은 칸(격자 기본 늘이기, 위로 붙이지 않음)
    expect(grid.className).not.toMatch(/\bitems-(start|center|end)\b/)
  })

  it('AC-8016.1: 의원이 바뀐 차례로 와도 같은 차례로 그린다', () => {
    const { section } = board([...CLINICS].reverse())
    const heads = [...gridOf(section).children].slice(0, 3)
    expect(heads.map((head) => head.querySelector('b')?.textContent)).toEqual(ORDER)
  })
})

describe('CompareStats — 읽기만 (AC-8016.2)', () => {
  it('AC-8016.2: 판 전체가 ReadOnlyArea 안이고 쓰기 단추가 없다', () => {
    const { section } = board()
    const area = screen.getByTestId('read-only-area')
    expect(area.contains(section)).toBe(true)
    expect(within(section).queryAllByRole('button')).toEqual([])
    expect(within(section).queryAllByRole('textbox')).toEqual([])
  })

  it('AC-8016.2: 그달 자료가 하나도 없는 의원은 줄마다 칸 전체가 자료 없음', () => {
    const clinics = CLINICS.map((clinic) => (clinic.id === 'h-1' ? { ...clinic, cells: cellsOf('–', false) } : clinic))
    const { section } = board(clinics)
    const items = [...gridOf(section).children].slice(3)
    for (let i = 0; i < 7; i++) expect(items[i * 4 + 2]!.textContent).toBe('가람 정형외과자료 없음')
    expect(items[1]!.textContent).toContain('하루 평균 내원136건')
  })
})

describe('CompareStats — 읽는 중·실패 의원 (AC-8016.3)', () => {
  it('AC-8016.3: 읽는 중 의원은 그 의원 칸만 불러오는 중, 다른 칸은 그대로', () => {
    const { section } = board()
    const before = [...gridOf(section).children].map((el) => el.textContent)
    cleanup()
    const reading = CLINICS.map((clinic) => (clinic.id === 'h-2' ? { ...clinic, cells: 'reading' as const } : clinic))
    const next = board(reading)
    const items = [...gridOf(next.section).children]
    for (let i = 0; i < 7; i++) {
      const at = 3 + i * 4
      expect(items[at + 3]!.textContent).toBe('나무 정형외과불러오는 중')
      expect(items[at + 1]!.textContent).toBe(before[at + 1])
      expect(items[at + 2]!.textContent).toBe(before[at + 2])
    }
  })

  it('AC-8016.3: 읽기 실패 의원은 그 의원 칸만 E-COMPARE-READ 카드 + [다시 불러오기], 누르면 그 의원으로 부른다', () => {
    const failed = CLINICS.map((clinic) => (clinic.id === 'h-1' ? { ...clinic, cells: 'failed' as const } : clinic))
    const { section, onRetry } = board(failed)
    const items = [...gridOf(section).children]
    for (let i = 0; i < 7; i++) {
      const cardEl = items[3 + i * 4 + 2] as HTMLElement
      expect(within(cardEl).getByRole('alert').textContent).toContain('이 의원 숫자를 불러오지 못했어요')
      expect(within(cardEl).getByRole('alert').textContent).toContain('오류 번호 E-COMPARE-READ')
      expect(within(cardEl).getByRole('button', { name: '다시 불러오기' })).toBeTruthy()
      expect(within(items[3 + i * 4 + 1] as HTMLElement).queryByRole('alert')).toBeNull()
      expect(within(items[3 + i * 4 + 3] as HTMLElement).queryByRole('alert')).toBeNull()
    }
    expect(within(section).getAllByRole('button')).toHaveLength(7)
    fireEvent.click(within(items[3 + 2] as HTMLElement).getByRole('button', { name: '다시 불러오기' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(onRetry).toHaveBeenCalledWith('h-1')
  })
})

describe('CompareStats — 통계 탭 카드 빠짐 검사 (AC-8016.4)', () => {
  it('AC-8016.4: TOC_LINKS 카드마다 나란히 보기 줄이 있거나 그리지 않는 까닭이 적혀 있다', () => {
    const drawn = new Set(SIDE_ROWS.map((row) => row.name))
    for (const link of TOC_LINKS) expect(drawn.has(link.name) || link.name in NOT_DRAWN, link.name).toBe(true)
    // 줄은 통계 탭 카드 차례 그대로이고 통계 탭에 없는 줄은 없다
    expect(SIDE_ROWS.map((row) => row.name)).toEqual(TOC_LINKS.map((link) => link.name).filter((name) => !(name in NOT_DRAWN)))
    expect(Object.keys(NOT_DRAWN)).toEqual(['보고'])
  })

  it("AC-8016.4: 그리지 않는 까닭('보고')은 design.md '나란히 보기 칸 표'에 적혀 있다", () => {
    const design = readFileSync(join(process.cwd(), 'specs/admin-view/design.md'), 'utf8')
    const table = design.slice(design.indexOf('## 통계 나란히 보기 칸 표'))
    expect(table).toContain("통계 탭 카드 가운데 '보고'(오늘·월간 글·고른 기간 보고·월간 보고서)는 시안 줄에 없어 그리지 않는다")
    expect(NOT_DRAWN['보고']).toBe('시안 줄에 없어 그리지 않는다(design.md 나란히 보기 칸 표)')
  })
})

describe('CompareStats — 지역 전체·빈 자료', () => {
  it('AC-8016.1: 지역이 전체면 옆 글은 달뿐이고 칸 대신 안내 글', () => {
    const { section } = board(CLINICS, '전체')
    expect(within(section).getByText('2026년 10월')).toBeTruthy()
    expect(gridOf(section)).toBeNull()
    const note = within(section).getByText('지역을 골라 주세요')
    expect(note.tagName).toBe('B')
    expect(note.parentElement?.textContent).toBe('지역을 골라 주세요 · 지역을 고르면 그 지역 의원들의 통계 카드를 나란히 보여 줘요.')
  })

  it('AC-8016.1: 지역에 의원이 없으면 의원 없음, 모든 의원에 그달 자료가 없으면 자료 없음', () => {
    const empty = board([], '제주')
    expect(within(empty.section).getByText('2026년 10월')).toBeTruthy()
    expect(within(empty.section).getByText('의원 없음').parentElement?.textContent).toBe('의원 없음 · 제주에 승인된 의원이 없어요. 지역을 바꾸거나 전체로 봐 주세요.')
    cleanup()
    const none = board(CLINICS.map((clinic) => ({ ...clinic, cells: cellsOf('–', false) })))
    expect(within(none.section).getByText('자료 없음').parentElement?.textContent).toBe(
      '자료 없음 · 2026년 10월에 저장된 숫자가 있는 의원이 없어요. 의원 PC에서 그 달 통계를 불러와 저장하면 채워져요.',
    )
    expect(gridOf(none.section)).toBeNull()
  })

  it('AC-8016.3: 아직 읽는 의원이 있으면 자료 없음으로 보지 않는다', () => {
    const clinics = CLINICS.map((clinic, i) => ({ ...clinic, cells: i === 0 ? ('reading' as const) : cellsOf('–', false) }))
    const { section } = board(clinics)
    expect(gridOf(section)).not.toBeNull()
  })
})
