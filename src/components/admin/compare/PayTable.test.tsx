// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { PayByJob } from '@/lib/admin/compare/pay'
import type { CompareRow } from '@/lib/admin/compare/rank'
import { STAFF_JOBS } from '@/types/staff'
import { PayTable } from './PayTable'

// 의원 비교 직군별 월급 표(spec admin-view REQ-8015 AC-8015.3·AC-8015.6, REQ-8023 AC-8023.3, design.md '화면 글자' 직군별 월급).
// 글·자리는 승인된 시안(docs/mockups/admin-view ?s=compare) 그대로. 의원·금액은 모두 지어낸 것이다

afterEach(cleanup)

const NO_JOBS = Object.fromEntries(STAFF_JOBS.map((job) => [job, null])) as PayByJob['jobs']
const pay = (jobs: Partial<PayByJob['jobs']>, partTime = 0): PayByJob => ({ none: false, jobs: { ...NO_JOBS, ...jobs }, partTime })

const row = (id: string, name: string, over: Partial<CompareRow> = {}): CompareRow => ({ id, name, own: false, region: '서울', sales: null, pay: null, rep: null, ...over })

const GANA = row('h-gana', '가나 정형외과의원', {
  own: true,
  pay: pay(
    {
      간호사: { count: 4, avg: 2_520_000, min: 2_380_000, max: 2_710_000 },
      물리치료사: { count: 1, avg: 3_650_000, min: 3_650_000, max: 3_650_000 },
    },
    2,
  ),
})
const DARA = row('h-dara', '다라 정형외과의원', { pay: pay({ 간호사: { count: 2, avg: 2_400_000, min: 2_300_000, max: 2_509_999 } }) })
const MABA = row('h-maba', '마바 정형외과의원', { region: '지역 모름', pay: { none: true, jobs: NO_JOBS, partTime: 0 } })
const SAA = row('h-saa', '사아 재활의학과의원', { region: '경기' }) // 급여 자료 없음(pay null)

const table = () => screen.getByRole('table', { name: '직군별 월급' })
const bodyRows = () => within(table()).getAllByRole('row').filter((tr) => tr.closest('tbody') !== null)
const cellTexts = (tr: HTMLElement) => [...tr.children].map((cell) => cell.textContent)
const footRow = () => table().querySelector('tfoot tr') as HTMLElement

describe('AC-8015.3 직군별 월급 표', () => {
  it('AC-8015.3: 제목 `직군별 월급`과 옆 글 `{달} 급여 · 정규직·계약직 · 실수령 기준 · 평균과 가장 적은~많은`, 카드 id cmp-pay', () => {
    const { container } = render(<PayTable month="2026-10" region="전체" rows={[GANA, DARA]} />)
    expect(screen.getByRole('heading', { level: 2, name: '직군별 월급' })).toBeTruthy()
    expect(screen.getByText('2026년 10월 급여 · 정규직·계약직 · 실수령 기준 · 평균과 가장 적은~많은')).toBeTruthy()
    expect(container.querySelector('section')!.id).toBe('cmp-pay')
  })

  it('AC-8015.3: 칸 = `의원` + 직군 여섯 + `파트타임`', () => {
    render(<PayTable month="2026-10" region="전체" rows={[GANA]} />)
    expect(within(table()).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['의원', ...STAFF_JOBS, '파트타임'])
  })

  it('AC-8015.3: 직군 칸 `평균 252만 원` / `4명 · 238만~271만 원`, 한 명이면 `365만 원` / `1명`, 없으면 `–`, 파트타임 `2명`', () => {
    render(<PayTable month="2026-10" region="서울" rows={[GANA]} />)
    const [nurse, aide, pt] = [...bodyRows()[0]!.children].slice(1) as HTMLElement[]
    expect([...nurse!.children].map((part) => part.textContent)).toEqual(['평균 252만 원', '4명 · 238만~271만 원'])
    expect(aide!.textContent).toBe('–')
    expect(aide!.className.split(' ')).toContain('text-muted')
    expect([...pt!.children].map((part) => part.textContent)).toEqual(['365만 원', '1명'])
    expect(cellTexts(bodyRows()[0]!).slice(4)).toEqual(['–', '–', '–', '2명'])
  })

  it('AC-8015.3: 만 원 아래는 버린다(250만 9,999원 → 250만)', () => {
    render(<PayTable month="2026-10" region="서울" rows={[DARA]} />)
    const nurse = bodyRows()[0]!.children[1]!
    expect([...nurse.children].map((part) => part.textContent)).toEqual(['평균 240만 원', '2명 · 230만~250만 원'])
  })

  it('AC-8015.3: 파트타임이 0명이면 –', () => {
    render(<PayTable month="2026-10" region="서울" rows={[DARA]} />)
    expect(cellTexts(bodyRows()[0]!).at(-1)).toBe('–')
  })

  it('AC-8015.3·AC-8023.3: 급여 없는 의원(none)·급여 자료 없는 의원은 그 줄에 `급여 없음 · {M}월 급여를 적지 않았어요` 하나', () => {
    render(<PayTable month="2026-10" region="전체" rows={[GANA, MABA, SAA]} />)
    for (const tr of bodyRows().slice(1)) {
      const cells = [...tr.children]
      expect(cells).toHaveLength(2)
      expect(cells[1]!.textContent).toBe('급여 없음 · 10월 급여를 적지 않았어요')
      expect(cells[1]!.getAttribute('colspan')).toBe(String(STAFF_JOBS.length + 1))
    }
  })

  it('AC-8015.3: 줄 차례는 내 의원 먼저 + 이름 차례(받은 차례와 상관없음), 첫 칸에 순위 번호 없음', () => {
    const own = row('h-haha', '하하 의원', { own: true, pay: pay({}, 1) })
    render(<PayTable month="2026-10" region="전체" rows={[SAA, DARA, own, MABA]} />)
    expect(bodyRows().map((tr) => tr.querySelector('[data-name]')?.textContent)).toEqual(['하하 의원', '다라 정형외과의원', '마바 정형외과의원', '사아 재활의학과의원'])
    expect(bodyRows()[0]!.children[0]!.textContent).toBe('하하 의원내 의원서울')
    expect(bodyRows()[2]!.children[0]!.textContent).toBe('마바 정형외과의원지역 모름')
  })

  it('AC-8015.3: 지역을 고르면 첫 칸에 지역이 없고, 첫 칸은 왼쪽에 붙는다', () => {
    render(<PayTable month="2026-10" region="서울" rows={[GANA]} />)
    const first = bodyRows()[0]!.children[0]!
    expect(first.textContent).toBe('가나 정형외과의원내 의원')
    expect(first.className.split(' ')).toEqual(expect.arrayContaining(['sticky', 'left-0', 'bg-surface']))
    expect(table().parentElement!.className.split(' ')).toContain('overflow-x-auto')
  })

  it('AC-8015.3: 아래 줄 `전체 {n}곳` + 직군마다 모든 사람 평균·가장 적은~많은 + 파트타임 합', () => {
    render(<PayTable month="2026-10" region="전체" rows={[GANA, DARA, MABA, SAA]} />)
    const cells = [...footRow().children] as HTMLElement[]
    expect(cells[0]!.textContent).toBe('전체 4곳')
    // 간호사: (252만 × 4 + 240만 × 2) ÷ 6 = 248만, 230만~271만
    expect([...cells[1]!.children].map((part) => part.textContent)).toEqual(['평균 248만 원', '6명 · 230만~271만 원'])
    expect(cells[2]!.textContent).toBe('–')
    expect([...cells[3]!.children].map((part) => part.textContent)).toEqual(['평균 365만 원', '1명 · 365만~365만 원'])
    expect(cells.at(-1)!.textContent).toBe('2명')
  })

  it('AC-8015.3: 아래 글 `파트타임은 일하는 시간이 달라 평균에 넣지 않고 사람 수만 적어요.`', () => {
    render(<PayTable month="2026-10" region="전체" rows={[GANA]} />)
    expect(screen.getByText('파트타임은 일하는 시간이 달라 평균에 넣지 않고 사람 수만 적어요.')).toBeTruthy()
  })
})

describe('AC-8015.6 직군별 월급 빈 자료', () => {
  it('AC-8015.6: 지역에 승인된 의원이 0곳이면 `의원 없음 · {지역}에 …`', () => {
    render(<PayTable month="2026-10" region="울산" rows={[]} />)
    expect(screen.getByText((_, node) => node?.tagName === 'P' && node.textContent === '의원 없음 · 울산에 승인된 의원이 없어요. 지역을 바꾸거나 전체로 봐 주세요.')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.getByText('2026년 10월 급여 · 정규직·계약직 · 실수령 기준 · 평균과 가장 적은~많은')).toBeTruthy()
  })

  it('AC-8015.6: 그달 급여를 적은 의원이 없으면 `급여 없음 · {YYYY년 M월} 급여를 적은 의원이 없어요.`', () => {
    render(<PayTable month="2025-02" region="전체" rows={[MABA, SAA]} />)
    expect(screen.getByText((_, node) => node?.tagName === 'P' && node.textContent === '급여 없음 · 2025년 2월 급여를 적은 의원이 없어요.')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByText('파트타임은 일하는 시간이 달라 평균에 넣지 않고 사람 수만 적어요.')).toBeNull()
  })
})
