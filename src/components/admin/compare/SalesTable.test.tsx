// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { REPRESENTATIVE, type CompareRow, type Representative } from '@/lib/admin/compare/rank'
import { SalesTable } from './SalesTable'

// 의원 비교 매출·환자 수 표(spec admin-view REQ-8015 AC-8015.4·AC-8015.6, REQ-8023 AC-8023.3, design.md '화면 글자' 매출·환자 수).
// 글·자리는 승인된 시안(docs/mockups/admin-view ?s=compare) 그대로. 의원·숫자는 모두 지어낸 것이다

afterEach(cleanup)

const row = (id: string, name: string, over: Partial<CompareRow> = {}): CompareRow => ({ id, name, own: false, region: '서울', sales: null, pay: null, rep: null, ...over })

const GANA = row('h-gana', '가나 정형외과의원', {
  own: true,
  sales: { total: 132_614_300, visits: 3412, newPatients: 286, returnVisits: 3002, dayAvg: 136.4, days: 25 },
})
const DARA = row('h-dara', '다라 정형외과의원', {
  sales: { total: 110_825_600, visits: 2986, newPatients: 241, returnVisits: 2745, dayAvg: 119.5, days: 25 },
})
const SAA = row('h-saa', '사아 재활의학과의원', { region: '경기' }) // 그달 숫자 없음

const table = () => screen.getByRole('table', { name: '매출·환자 수' })
const bodyRows = () => within(table()).getAllByRole('row').filter((tr) => tr.closest('tbody') !== null)
const cellTexts = (tr: Element) => [...tr.children].map((cell) => cell.textContent)
const footRow = () => table().querySelector('tfoot tr') as HTMLElement

const someRep = (): Representative =>
  Object.fromEntries(REPRESENTATIVE.map(({ key }) => [key, key === 'appts' ? { value: 3, text: '3건' } : { value: null, text: null }])) as Representative

describe('AC-8015.4 매출·환자 수 표', () => {
  it('AC-8015.4: 제목 `매출·환자 수`와 옆 글 `{달} · 저장된 숫자 · 총진료비는 수납한 날 기준`, 카드 id cmp-sales', () => {
    const { container } = render(<SalesTable month="2026-10" region="전체" rows={[GANA, DARA]} />)
    expect(screen.getByRole('heading', { level: 2, name: '매출·환자 수' })).toBeTruthy()
    expect(screen.getByText('2026년 10월 · 저장된 숫자 · 총진료비는 수납한 날 기준')).toBeTruthy()
    expect(container.querySelector('section')!.id).toBe('cmp-sales')
  })

  it('AC-8015.4: 칸 `의원` `총진료비` `내원 수` `신환` `재진` `하루 평균 내원`', () => {
    render(<SalesTable month="2026-10" region="전체" rows={[GANA]} />)
    expect(within(table()).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['의원', '총진료비', '내원 수', '신환', '재진', '하루 평균 내원'])
  })

  it('AC-8015.4: 값 모양은 순위 표와 같다(1억 3,261만 원 · 3,412건 · 286명 · 3,002건 · 136.4건)', () => {
    render(<SalesTable month="2026-10" region="서울" rows={[GANA]} />)
    expect(cellTexts(bodyRows()[0]!)).toEqual(['가나 정형외과의원내 의원', '1억 3,261만 원', '3,412건', '286명', '3,002건', '136.4건'])
  })

  it('AC-8015.4: 줄 차례는 내 의원 먼저 + 이름 차례(받은 차례·총진료비와 상관없음)', () => {
    const own = row('h-haha', '하하 의원', { own: true, sales: { total: 1_000_000, visits: 10, newPatients: 1, returnVisits: 9, dayAvg: 10, days: 1 } })
    render(<SalesTable month="2026-10" region="전체" rows={[SAA, DARA, own, { ...GANA, own: false }]} />)
    expect(bodyRows().map((tr) => tr.querySelector('[data-name]')?.textContent)).toEqual(['하하 의원', '가나 정형외과의원', '다라 정형외과의원', '사아 재활의학과의원'])
    expect(bodyRows()[0]!.children[0]!.textContent).toBe('하하 의원내 의원서울')
  })

  it('AC-8015.4: 아래 줄 `전체 {n}곳` + 합 + 마지막 칸 `의원 평균 {x}건`(하루 평균 내원의 평균, 소수 첫째 자리 버림), 모두 숫자가 있으면 덧붙임 없음', () => {
    render(<SalesTable month="2026-10" region="전체" rows={[GANA, DARA]} />)
    // (136.4 + 119.5) ÷ 2 = 127.95 → 127.9
    expect(cellTexts(footRow())).toEqual(['전체 2곳', '2억 4,343만 원', '6,398건', '527명', '5,747건', '의원 평균 127.9건'])
  })

  it('AC-8015.4: 첫 칸은 왼쪽에 붙고 표 바깥 틀이 옆으로 밀린다', () => {
    render(<SalesTable month="2026-10" region="전체" rows={[GANA]} />)
    expect(bodyRows()[0]!.children[0]!.className.split(' ')).toEqual(expect.arrayContaining(['sticky', 'left-0', 'bg-surface']))
    expect(table().parentElement!.className.split(' ')).toContain('overflow-x-auto')
  })
})

describe('AC-8023.3 숫자 없는 의원', () => {
  it('AC-8023.3: 그달 숫자 없는 의원 줄은 남고 칸은 –, 아래 줄은 `전체 {n}곳 · 숫자 있는 {k}곳 합`이고 합·평균은 숫자 있는 의원만', () => {
    render(<SalesTable month="2026-10" region="전체" rows={[SAA, GANA, DARA]} />)
    expect(cellTexts(bodyRows()[2]!)).toEqual(['사아 재활의학과의원경기', '–', '–', '–', '–', '–'])
    expect(bodyRows()[2]!.children[1]!.className.split(' ')).toContain('text-muted')
    expect(cellTexts(footRow())).toEqual(['전체 3곳 · 숫자 있는 2곳 합', '2억 4,343만 원', '6,398건', '527명', '5,747건', '의원 평균 127.9건'])
  })

  it('AC-8023.3: 매출 숫자가 한 곳도 없어도 다른 그달 숫자가 있으면 표는 그리고 합 칸은 –', () => {
    render(<SalesTable month="2026-10" region="전체" rows={[{ ...SAA, rep: someRep() }]} />)
    expect(cellTexts(footRow())).toEqual(['전체 1곳 · 숫자 있는 0곳 합', '–', '–', '–', '–', '–'])
  })
})

describe('AC-8015.6 매출·환자 수 빈 자료', () => {
  it('AC-8015.6: 지역에 승인된 의원이 0곳이면 `의원 없음 · {지역}에 …`', () => {
    render(<SalesTable month="2026-10" region="지역 모름" rows={[]} />)
    expect(screen.getByText((_, node) => node?.tagName === 'P' && node.textContent === '의원 없음 · 지역 모름에 승인된 의원이 없어요. 지역을 바꾸거나 전체로 봐 주세요.')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('AC-8015.6: 그달 저장된 숫자가 있는 의원이 없으면 `자료 없음 · {YYYY년 M월}에 …`', () => {
    render(<SalesTable month="2024-07" region="전체" rows={[SAA]} />)
    expect(
      screen.getByText(
        (_, node) => node?.tagName === 'P' && node.textContent === '자료 없음 · 2024년 7월에 저장된 숫자가 있는 의원이 없어요. 의원 PC에서 그 달 통계를 불러와 저장하면 채워져요.',
      ),
    ).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.getByText('2024년 7월 · 저장된 숫자 · 총진료비는 수납한 날 기준')).toBeTruthy()
  })
})
