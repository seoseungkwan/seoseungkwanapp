// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { ds } from '@/components/ui/classes'
import type { PayByJob } from '@/lib/admin/compare/pay'
import { REPRESENTATIVE, type CompareRow, type RepKey, type Representative } from '@/lib/admin/compare/rank'
import { STAFF_JOBS } from '@/types/staff'
import { RankTable } from './RankTable'

// 의원 비교 순위 표(spec admin-view REQ-8015 AC-8015.2·AC-8015.5·AC-8015.6, REQ-8023 AC-8023.3, design.md '대표 숫자 표'·'화면 글자' 의원 순위).
// 글·자리는 승인된 시안(docs/mockups/admin-view ?s=compare·empty·empty&e=month) 그대로. 의원·숫자는 모두 지어낸 것이다

afterEach(cleanup)

const ROOT = process.cwd()
const FOOT = '–는 그 의원에 그 달 숫자가 없는 칸이에요. 줄을 세울 때 늘 맨 아래에 둬요.'

const NO_JOBS = Object.fromEntries(STAFF_JOBS.map((job) => [job, null])) as PayByJob['jobs']
const pay = (jobs: Partial<PayByJob['jobs']>, partTime = 0): PayByJob => ({ none: false, jobs: { ...NO_JOBS, ...jobs }, partTime })

function rep(values: Partial<Record<RepKey, [number, string]>>): Representative {
  return Object.fromEntries(
    REPRESENTATIVE.map(({ key }) => {
      const value = values[key]
      return [key, value ? { value: value[0], text: value[1] } : { value: null, text: null }]
    }),
  ) as Representative
}

const GANA: CompareRow = {
  id: 'h-gana',
  name: '가나 정형외과의원',
  own: true,
  region: '서울',
  sales: { total: 132_614_300, visits: 3412, newPatients: 286, returnVisits: 3002, dayAvg: 136.4, days: 25 },
  pay: pay({ 간호사: { count: 4, avg: 2_520_000, min: 2_380_000, max: 2_710_000 } }, 2),
  rep: rep({
    nonpay: [31.4, '31.4%'],
    revisit30: [46.2, '46.2%'],
    rsvFirst: [38.5, '38.5%'],
    block: [22.1, '22.1%'],
    appts: [412, '412건'],
    age: [24.1, '50대 · 24.1%'],
    goal: [102, '102.0%'],
    three: [41.3, '41.3%'],
  }),
}
const DARA: CompareRow = {
  id: 'h-dara',
  name: '다라 정형외과의원',
  own: false,
  region: '서울',
  sales: { total: 110_825_600, visits: 2986, newPatients: 241, returnVisits: 2745, dayAvg: 119.4, days: 25 },
  pay: pay({ 간호사: { count: 1, avg: 3_650_000, min: 3_650_000, max: 3_650_000 } }),
  rep: rep({ nonpay: [27.9, '27.9%'], appts: [356, '356건'] }),
}
const MABA: CompareRow = {
  id: 'h-maba',
  name: '마바 정형외과의원',
  own: false,
  region: '지역 모름',
  sales: { total: 84_120_900, visits: 2140, newPatients: 198, returnVisits: 1942, dayAvg: 85.6, days: 25 },
  pay: { none: true, jobs: NO_JOBS, partTime: 0 },
  rep: rep({ nonpay: [35.2, '35.2%'] }),
}
// 그달 숫자가 없는 의원(옛 달): 줄은 남고 칸은 모두 –
const SAA: CompareRow = { id: 'h-saa', name: '사아 재활의학과의원', own: false, region: '경기', sales: null, pay: null, rep: null }

const ROWS = [SAA, MABA, DARA, GANA]

const table = () => screen.getByRole('table', { name: '의원 순위' })
const bodyRows = () => within(table()).getAllByRole('row').filter((row) => row.closest('tbody') !== null)
const names = () => bodyRows().map((row) => row.querySelector('[data-name]')?.textContent)
const header = (label: string) => within(table()).getByRole('button', { name: label }).closest('th')!

const COLUMNS = [
  '총진료비',
  '내원 수',
  '신환',
  '재진',
  '하루 평균 내원',
  ...STAFF_JOBS,
  '비급여 비율',
  '신환 재방문율 (30일)',
  '신환 예약률',
  'Block 전환율',
  '예약 수',
  '가장 많은 나이대',
  '목표 달성률',
  '3번 이상 받은 비율',
]

describe('AC-8015.2 순위 표 — 칸·차례·값 모양', () => {
  it('AC-8015.2: 제목 `의원 순위`와 옆 글 `{달} · 칸 이름을 누르면 …`', () => {
    render(<RankTable month="2026-10" region="전체" rows={ROWS} />)
    expect(screen.getByRole('heading', { level: 2, name: '의원 순위' })).toBeTruthy()
    expect(screen.getByText('2026년 10월 · 칸 이름을 누르면 그 숫자로 줄을 세워요. 한 번 더 누르면 거꾸로예요.')).toBeTruthy()
  })

  it('AC-8015.2: 묶음 머리 셋(매출·환자 수 5 · 직군별 평균 월급 6 · 통계 대표 숫자 8)과 첫 칸 `의원`', () => {
    render(<RankTable month="2026-10" region="전체" rows={ROWS} />)
    const [first, second] = within(table()).getAllByRole('row')
    const groups = within(first!).getAllByRole('columnheader')
    expect(groups.map((cell) => cell.textContent)).toEqual(['의원', '매출·환자 수', '직군별 평균 월급', '통계 대표 숫자'])
    expect(groups.map((cell) => cell.getAttribute('colspan'))).toEqual([null, '5', '6', '8'])
    expect(groups[0]!.getAttribute('rowspan')).toBe('2')
    expect(within(second!).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(COLUMNS)
  })

  it('AC-8015.2: 칸 이름은 단추, 처음 차례는 총진료비 내림차순(aria-sort descending), 다른 칸은 none', () => {
    render(<RankTable month="2026-10" region="전체" rows={ROWS} />)
    expect(header('총진료비').getAttribute('aria-sort')).toBe('descending')
    for (const label of COLUMNS.slice(1)) expect(header(label).getAttribute('aria-sort'), label).toBe('none')
    expect(names()).toEqual(['가나 정형외과의원', '다라 정형외과의원', '마바 정형외과의원', '사아 재활의학과의원'])
  })

  it('AC-8015.2: 칸 이름을 누르면 오름차순, 한 번 더 누르면 내림차순 — ↑·↓, aria-sort가 바뀐다', async () => {
    render(<RankTable month="2026-10" region="전체" rows={ROWS} />)
    await userEvent.click(within(table()).getByRole('button', { name: '신환' }))
    expect(names()).toEqual(['마바 정형외과의원', '다라 정형외과의원', '가나 정형외과의원', '사아 재활의학과의원'])
    expect(header('신환').getAttribute('aria-sort')).toBe('ascending')
    expect(header('총진료비').getAttribute('aria-sort')).toBe('none')
    expect(header('신환').querySelector('svg')?.getAttribute('class')).toContain('rotate-180') // ↑
    await userEvent.click(within(table()).getByRole('button', { name: '신환' }))
    expect(names()).toEqual(['가나 정형외과의원', '다라 정형외과의원', '마바 정형외과의원', '사아 재활의학과의원'])
    expect(header('신환').getAttribute('aria-sort')).toBe('descending')
    expect(header('신환').querySelector('svg')?.getAttribute('class') ?? '').not.toContain('rotate-180') // ↓
    expect(header('총진료비').querySelector('svg')).toBeNull()
  })

  it('AC-8015.2: 고른 칸은 강조 글자, 그 칸 값은 굵게', async () => {
    render(<RankTable month="2026-10" region="전체" rows={ROWS} />)
    await userEvent.click(within(table()).getByRole('button', { name: '비급여 비율' }))
    const button = within(table()).getByRole('button', { name: '비급여 비율' })
    expect(button.className.split(' ')).toContain('text-accent-strong')
    const index = COLUMNS.indexOf('비급여 비율') + 1
    const cells = bodyRows().map((row) => row.children[index]!)
    expect(cells.slice(0, 3).every((cell) => cell.className.split(' ').includes('font-semibold'))).toBe(true)
    const other = bodyRows()[0]!.children[1]!
    expect(other.className.split(' ')).not.toContain('font-semibold')
  })

  it('AC-8015.2·AC-8023.3: 빈 값 –는 오름·내림과 상관없이 늘 맨 아래', async () => {
    render(<RankTable month="2026-10" region="전체" rows={ROWS} />)
    await userEvent.click(within(table()).getByRole('button', { name: '예약 수' }))
    expect(names()).toEqual(['다라 정형외과의원', '가나 정형외과의원', '마바 정형외과의원', '사아 재활의학과의원'])
    await userEvent.click(within(table()).getByRole('button', { name: '예약 수' }))
    expect(names()).toEqual(['가나 정형외과의원', '다라 정형외과의원', '마바 정형외과의원', '사아 재활의학과의원'])
  })

  it('AC-8015.2: 값 모양 — 1억 3,261만 원 · 3,412건 · 286명 · 136.4건 · 252만 원 · 31.4% · 50대 · 24.1% · 없음 –', () => {
    render(<RankTable month="2026-10" region="전체" rows={ROWS} />)
    const cells = [...bodyRows()[0]!.children].slice(1).map((cell) => cell.textContent)
    expect(cells).toEqual([
      '1억 3,261만 원',
      '3,412건',
      '286명',
      '3,002건',
      '136.4건',
      '252만 원',
      '–',
      '–',
      '–',
      '–',
      '–',
      '31.4%',
      '46.2%',
      '38.5%',
      '22.1%',
      '412건',
      '50대 · 24.1%',
      '102.0%',
      '41.3%',
    ])
  })

  it('AC-8015.2: 하루 평균 내원은 소수 첫째 자리 그대로, 월급 칸은 그 직군 평균(만 원 아래 버림)', () => {
    render(<RankTable month="2026-10" region="전체" rows={[DARA]} />)
    const cells = [...bodyRows()[0]!.children].map((cell) => cell.textContent)
    expect(cells[5]).toBe('119.4건')
    expect(cells[6]).toBe('365만 원')
  })

  it('AC-8015.2: 급여 없음(none)·급여 줄 없음은 월급 칸이 –, 없는 칸은 옅은 글자', () => {
    render(<RankTable month="2026-10" region="전체" rows={[MABA]} />)
    const cells = [...bodyRows()[0]!.children]
    expect(cells.slice(6, 12).map((cell) => cell.textContent)).toEqual(['–', '–', '–', '–', '–', '–'])
    expect(cells[6]!.className.split(' ')).toContain('text-muted')
  })

  it('AC-8015.2: 첫 칸 = 순위 번호 + 이름 + 내 의원 칩 + (전체일 때) 지역, 왼쪽에 붙음', () => {
    render(<RankTable month="2026-10" region="전체" rows={ROWS} />)
    const first = bodyRows()[0]!.children[0]!
    expect(first.textContent).toBe('1가나 정형외과의원내 의원서울')
    expect(within(first as HTMLElement).getByText('내 의원').className).toContain('bg-accent-soft')
    expect(bodyRows()[2]!.children[0]!.textContent).toBe('3마바 정형외과의원지역 모름')
    expect(first.className.split(' ')).toEqual(expect.arrayContaining(['sticky', 'left-0', 'bg-surface']))
    const corner = within(table()).getAllByRole('columnheader')[0]!
    expect(corner.className.split(' ')).toEqual(expect.arrayContaining(['sticky', 'left-0']))
  })

  it('AC-8015.2: 지역을 고르면 첫 칸에 지역이 없다', () => {
    render(<RankTable month="2026-10" region="서울" rows={[GANA, DARA]} />)
    expect(bodyRows()[0]!.children[0]!.textContent).toBe('1가나 정형외과의원내 의원')
  })

  it('AC-8015.2: 의원 이름은 단추·링크가 아니다(눌러도 보기를 시작하지 않음)', () => {
    render(<RankTable month="2026-10" region="전체" rows={ROWS} />)
    for (const row of bodyRows()) {
      expect(within(row.children[0] as HTMLElement).queryByRole('button')).toBeNull()
      expect(within(row.children[0] as HTMLElement).queryByRole('link')).toBeNull()
    }
  })

  it('AC-8015.2: 아래 글', () => {
    render(<RankTable month="2026-10" region="전체" rows={ROWS} />)
    expect(screen.getByText(FOOT)).toBeTruthy()
  })
})

// ── 의사랑 의원(spec uisarang-upload REQ-8813 AC-8813.1·AC-8813.5, 시안 docs/mockups/uisarang-upload ?s=admin) ──
const UIS_FOOT = '의사랑 표시 의원은 의사랑 엑셀로 올린 숫자예요. 처방 칸은 환자 수가 아니라 처방량이고, 나이대는 내원한 날마다 센 수예요.'

describe('AC-8813.1·AC-8813.5 순위 표 — 의사랑 칩 · 표 아래 의사랑 줄', () => {
  it('AC-8813.1: 의사랑 의원 첫 칸 = 순위 · 이름 · (내 의원 칩) · 의사랑 칩(회색) · 지역 — 내 의원 칩 다음, 지역 앞', () => {
    render(<RankTable month="2026-10" region="전체" rows={[{ ...GANA, uis: true }, { ...DARA, uis: true }, MABA]} />)
    const [first, second, third] = bodyRows().map((row) => row.children[0] as HTMLElement)
    expect(first!.textContent).toBe('1가나 정형외과의원내 의원의사랑서울')
    expect(second!.textContent).toBe('2다라 정형외과의원의사랑서울')
    expect(third!.textContent).toBe('3마바 정형외과의원지역 모름')
    const mark = within(second!).getByText('의사랑')
    expect(mark.className).toBe(ds.chip.neutral)
    const parts = [...first!.querySelector('div')!.children].map((child) => child.textContent)
    expect(parts).toEqual(['1', '가나 정형외과의원', '내 의원', '의사랑', '서울'])
  })

  it('AC-8813.1: 지역을 골라 지역 글이 없어도 의사랑 칩은 있다', () => {
    render(<RankTable month="2026-10" region="서울" rows={[{ ...DARA, uis: true }]} />)
    expect(bodyRows()[0]!.children[0]!.textContent).toBe('1다라 정형외과의원의사랑')
  })

  it('AC-8813.5: 목록에 의사랑 의원이 하나라도 있으면 지금 아래 줄 다음에 의사랑 줄이 하나 더 있다', () => {
    const { container } = render(<RankTable month="2026-10" region="전체" rows={[GANA, { ...DARA, uis: true }, MABA]} />)
    const foot = screen.getByText(FOOT)
    const uis = screen.getByText(UIS_FOOT)
    expect(foot.nextElementSibling).toBe(uis)
    expect(uis.tagName).toBe('P')
    expect(uis.className.split(' ')).toEqual(expect.arrayContaining(['text-small', 'text-muted']))
    expect(container.textContent?.match(/의사랑 표시 의원은/g)).toHaveLength(1)
  })

  it('AC-8813.5: 의사랑 의원이 없으면(uis 거짓·없음) 의사랑 줄·칩이 없다', () => {
    render(<RankTable month="2026-10" region="전체" rows={[{ ...GANA, uis: false }, DARA, MABA, SAA]} />)
    expect(screen.getByText(FOOT)).toBeTruthy()
    expect(screen.queryByText(UIS_FOOT)).toBeNull()
    expect(screen.queryByText('의사랑')).toBeNull()
  })

  it('AC-8813.5: 표 대신 빈 자료 글이면 의사랑 줄도 없다', () => {
    render(<RankTable month="2026-03" region="부산" rows={[{ ...SAA, uis: true }]} />)
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByText(UIS_FOOT)).toBeNull()
  })

  it('AC-8813.5: 의사랑 의원의 매출·환자 수 칸 값 모양은 비트 의원과 같다(날 숫자로 센 SalesRow)', () => {
    const uisSales = { total: 28_630_000, visits: 4105, newPatients: 287, returnVisits: 3818, dayAvg: 164.2, days: 25 }
    render(<RankTable month="2026-10" region="전체" rows={[{ ...SAA, uis: true, sales: uisSales }]} />)
    expect([...bodyRows()[0]!.children].slice(1, 6).map((cell) => cell.textContent)).toEqual(['2,863만 원', '4,105건', '287명', '3,818건', '164.2건'])
  })
})

describe('AC-8015.5 넓은 표 — 표 칸만 옆으로, 폰 전용 모양 없음, StatsCard 모양', () => {
  it('AC-8015.5: 표 바깥 틀이 옆으로 밀리고(overflow-x-auto) 카드는 흰 큰 카드(StatsCard)이며 id는 cmp-rank', () => {
    const { container } = render(<RankTable month="2026-10" region="전체" rows={ROWS} />)
    expect(table().parentElement!.className.split(' ')).toContain('overflow-x-auto')
    const card = container.querySelector('section')!
    expect(card.id).toBe('cmp-rank')
    expect(card.className.split(' ')).toEqual(expect.arrayContaining(['bg-surface', 'rounded-st', 'shadow-st-card']))
  })

  it.each([
    'src/lib/admin/compare/rank.ts',
    'src/lib/admin/compare/months.ts',
    'src/components/admin/compare/ComparePickers.tsx',
    'src/components/admin/compare/RankTable.tsx',
    'src/components/admin/compare/PayTable.tsx',
    'src/components/admin/compare/SalesTable.tsx',
  ])('AC-8015.5: %s에 폰 전용 모양(max-md:)이 없다', (file) => {
    expect(readFileSync(join(ROOT, file), 'utf8')).not.toMatch(/max-md:/)
  })
})

describe('AC-8015.6 빈 자료', () => {
  it('AC-8015.6: 지역에 승인된 의원이 0곳이면 `의원 없음 · {지역}에 …`, 표 없음', () => {
    render(<RankTable month="2026-10" region="제주" rows={[]} />)
    expect(screen.getByText((_, node) => node?.tagName === 'P' && node.textContent === '의원 없음 · 제주에 승인된 의원이 없어요. 지역을 바꾸거나 전체로 봐 주세요.')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByText(FOOT)).toBeNull()
    expect(screen.getByText('2026년 10월')).toBeTruthy()
  })

  it('AC-8015.6: 그달 저장된 숫자가 있는 의원이 없으면 `자료 없음 · {YYYY년 M월}에 …`', () => {
    render(<RankTable month="2026-03" region="부산" rows={[SAA, { ...MABA, sales: null, rep: rep({}) }]} />)
    expect(
      screen.getByText(
        (_, node) => node?.tagName === 'P' && node.textContent === '자료 없음 · 2026년 3월에 저장된 숫자가 있는 의원이 없어요. 의원 PC에서 그 달 통계를 불러와 저장하면 채워져요.',
      ),
    ).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('AC-8023.3: 한 곳이라도 숫자가 있으면 표를 그리고 숫자 없는 의원 줄도 남는다(칸 –)', () => {
    render(<RankTable month="2025-09" region="전체" rows={[SAA, GANA]} />)
    expect(names()).toEqual(['가나 정형외과의원', '사아 재활의학과의원'])
    const cells = [...bodyRows()[1]!.children].slice(1).map((cell) => cell.textContent)
    expect(cells).toEqual(COLUMNS.map(() => '–'))
  })
})
