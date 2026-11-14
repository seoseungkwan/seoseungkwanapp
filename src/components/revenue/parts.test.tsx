// @vitest-environment jsdom
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, posix, relative, sep } from 'node:path'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { nestedBoxes } from '@/testing/boxes'
import { formatManWon } from './money'
import { StackBars } from './MonthBars'
import { BANNER, DeltaCell, KpiRow, NoticeLine, STRONG } from './RevenueParts'
import { SplitTable, type SplitTableRow } from './RevenueSplit'
import { TreatmentBars } from './TreatmentBars'
import type { DeltaText, Kpi, StackChart, StackColumn, TreatmentRow } from './types'

// 남는 매출 부품 (revenue TASK-9 AC-009.5 → stats-revenue TASK-8 REQ-4110 · AC-4110.4·AC-4110.5, AC-4111.2).
// 매출 탭 화면(RevenueScreen 등)·보기 모양(view.ts)·묶음 고치기 화면은 지웠다. 통계 매출 칸(components/stats/sections/RevenueSection)이 쓰는
// 숫자 칸 줄·안내 줄·증감 글·순위 막대·급여 표·세 겹 막대·금액 글만 남는다. 보기 값은 이 파일이 손으로 만든 가짜다(이름·숫자 모두 지어냄)

const ROOT = process.cwd()
const FOLDER = 'src/components/revenue'

const tokensOf = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)
const classesOf = (el: Element | null) => (el ? tokensOf(el) : [])
const heights = (root: Element) => Array.from(root.querySelectorAll<HTMLElement>('[style*="height"]'))

afterEach(cleanup)

// ── 보기 값(손으로 만든 가짜) ──

const KPIS: Kpi[] = [
  { name: '가짜 기간 매출', value: '1억 2,345만 원', sub: '진료한 날 20일', tone: 'ink', srText: '' },
  { name: '가짜 비교', value: '+1.5%', sub: '지난 기간 1억 2,000만 원', tone: 'up', srText: '늘어남' },
  { name: '가짜 건당', value: '−2.0%', sub: null, tone: 'down', srText: '줄어듦' },
  { name: '가짜 확인 필요', value: '1일', sub: '10월 7일', tone: 'warn', srText: '' },
]

const UP: DeltaText = { dir: 'up', text: '+3.0%', srText: '늘어남' }
const DOWN: DeltaText = { dir: 'down', text: '−1.0%', srText: '줄어듦' }
const NONE: DeltaText = { dir: 'none', text: '–', srText: '' }
const SPLIT_HEAD = ['나눔', '가짜 기간', '몫', '가짜 비교보다']
const SPLIT_ROWS: SplitTableRow[] = [
  { name: '급여', kind: 'main', amount: '6,000만 원', share: '60.0%', delta: UP },
  { name: '공단부담', kind: 'sub', amount: '4,000만 원', share: '40.0%', delta: DOWN },
  { name: '합계 · 매출', kind: 'sum', amount: '1억 원', share: '100%', delta: NONE },
]

const column = (month: string, label: string, segments: StackColumn['segments']): StackColumn => ({
  month,
  label,
  year: '',
  kind: 'other',
  partial: false,
  segments,
})
const STACK: StackChart = {
  title: '가짜 날마다 급여·비급여·기타',
  legend: [
    { key: 'other', label: '기타' },
    { key: 'noncovered', label: '비급여' },
    { key: 'covered', label: '급여' },
  ],
  axis: {
    unit: '(만 원)',
    ticks: [
      { label: '0', bottom: 0 },
      { label: '50', bottom: 50 },
      { label: '100', bottom: 100 },
    ],
  },
  columns: [
    column('2026-10-01', '1일', [
      { key: 'covered', height: 40 },
      { key: 'noncovered', height: 20 },
      { key: 'other', height: 10 },
    ]),
    column('2026-10-02', '2일', null), // 확인 필요한 날: 막대 없음
    column('2026-10-03', '3일', [
      { key: 'covered', height: 30 },
      { key: 'noncovered', height: 0 }, // 0인 겹은 그리지 않는다
      { key: 'other', height: 5 },
    ]),
  ],
  table: {
    caption: '가짜 날마다 급여·비급여·기타 (원)',
    head: ['날', '급여', '비급여', '기타'],
    rows: [
      ['10월 1일', '400,000원', '200,000원', '100,000원'],
      ['10월 3일', '300,000원', '0원', '50,000원'],
    ],
  },
}

const TREATMENTS: TreatmentRow[] = [
  { name: '가짜 묶음', amount: '400만 원', share: '30.7%', detail: '처방 40번', width: 100, rest: false, missing: false },
  { name: '그 밖 처방', amount: '900만 원', share: '69.3%', detail: '진찰료·약·검사 등', width: 50, rest: true, missing: false },
]

describe('AC-4110.4 남는 부품은 그대로 있다(통계 매출 칸이 쓴다)', () => {
  it('AC-4110.4 KpiRow·NoticeLine·DeltaCell·TreatmentBars·SplitTable·StackBars·formatManWon이 있다', () => {
    for (const part of [KpiRow, NoticeLine, DeltaCell, TreatmentBars, SplitTable, StackBars, formatManWon]) expect(part).toBeTypeOf('function')
    expect(BANNER).toContain('rounded-control')
    expect(STRONG).toBe('font-semibold text-ink')
    expect(formatManWon(132_610_000)).toBe('1억 3,261만 원')
  })

  it('AC-4110.4 MonthBars.tsx는 StackBars만, RevenueSplit.tsx는 SplitTable만 내보낸다(13달 막대·급여 덩어리는 지움)', async () => {
    expect(Object.keys(await import('./MonthBars'))).toEqual(['StackBars'])
    expect(Object.keys(await import('./RevenueSplit'))).toEqual(['SplitTable'])
    expect(Object.keys(await import('./TreatmentBars'))).toEqual(['TreatmentBars'])
    expect(Object.keys(await import('./RevenueParts')).sort()).toEqual(['BANNER', 'DeltaCell', 'Glyph', 'KpiRow', 'Note', 'NoticeLine', 'ReaderTable', 'STRONG'])
  })

  it('AC-4110.4 숫자 칸 줄: 폰 2칸 × 2줄 → 768px부터 4칸, 늘고 준 칸은 화살표(aria-hidden svg)와 화면 읽기 글자, 색은 토큰', () => {
    const { container } = render(<KpiRow kpis={KPIS} />)
    const grid = container.firstElementChild!
    expect(classesOf(grid)).toEqual(expect.arrayContaining(['grid', 'grid-cols-2', 'md:grid-cols-4']))
    expect(grid.children).toHaveLength(4)
    for (const [word, tone, text] of [
      ['늘어남', 'text-positive', '+1.5%'],
      ['줄어듦', 'text-negative', '−2.0%'],
    ] as const) {
      const sr = screen.getByText(word)
      expect(classesOf(sr)).toContain('sr-only')
      const line = sr.closest('p')!
      expect(classesOf(line)).toContain(tone)
      expect(line.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
      expect(line.textContent).toContain(text)
    }
    expect(classesOf(screen.getByText('1일').closest('p'))).toContain('text-warning')
    expect(screen.getByText('진료한 날 20일')).toBeTruthy()
  })

  it('AC-4110.4 안내 줄: role="note", 굵은 앞말 + 이어지는 글, 노란 바탕', () => {
    render(<NoticeLine notice={{ lead: '가짜 1일(10월 7일)', rest: '은 가짜 안내예요.' }} />)
    const note = screen.getByRole('note')
    expect(note.textContent).toBe('가짜 1일(10월 7일)은 가짜 안내예요.')
    expect(classesOf(note)).toContain('bg-warning-soft')
    expect(classesOf(within(note).getByText('가짜 1일(10월 7일)'))).toEqual(STRONG.split(' '))
  })

  it('AC-4110.4 증감 글: 값이 없으면 "–"만(muted), 있으면 화살표와 글자와 화면 읽기 글자', () => {
    const { container, rerender } = render(<DeltaCell delta={NONE} />)
    expect(container.textContent).toBe('–')
    expect(container.querySelector('svg')).toBeNull()
    expect(classesOf(container.firstElementChild)).toContain('text-muted')
    rerender(<DeltaCell delta={UP} />)
    expect(container.textContent).toBe('+3.0%늘어남')
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
    expect(classesOf(container.firstElementChild)).toContain('text-positive')
  })

  it('AC-4110.4 급여 표: 머리·줄 이름 차례, 넷째 칸(비교)부터 폰에서 숨고, 표의 증감도 화살표와 글자를 같이 쓴다', () => {
    render(<SplitTable head={SPLIT_HEAD} rows={SPLIT_ROWS} />)
    const table = screen.getByRole('table')
    expect(within(table).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(SPLIT_HEAD)
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.map((tr) => tr.children[0]!.textContent)).toEqual(['급여', '공단부담', '합계 · 매출'])
    expect(rows.map((tr) => tr.children)).toEqual(rows.map(() => expect.objectContaining({ length: 4 })))
    expect(classesOf(within(table).getAllByRole('columnheader')[3]!)).toContain('max-md:hidden')
    for (const tr of rows) expect(classesOf(tr.children[3]!)).toContain('max-md:hidden')
    const up = within(rows[0]!).getByText('늘어남')
    expect(classesOf(up)).toContain('sr-only')
    expect(up.parentElement?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('AC-4110.4 급여 표: lastYear가 있는 줄은 다섯째 칸(작년 같은 때보다)을 그리고, 그 칸도 폰에서 숨는다', () => {
    const rows: SplitTableRow[] = SPLIT_ROWS.map((row) => ({ ...row, lastYear: DOWN }))
    render(<SplitTable head={[...SPLIT_HEAD, '작년 같은 때보다']} rows={rows} />)
    const table = screen.getByRole('table')
    const body = within(table).getAllByRole('row').slice(1)
    for (const tr of body) {
      expect(tr.children).toHaveLength(5)
      expect(classesOf(tr.children[4]!)).toContain('max-md:hidden')
    }
    expect(within(body[0]!).getAllByText('줄어듦')).toHaveLength(1)
  })

  it('AC-4110.4 세 겹 막대: % height inline style, 그림은 aria-hidden(svg 없음), 아래부터 급여 chart-3 · 비급여 accent · 기타 line-strong, 0인 겹·빈 칸은 그리지 않는다', () => {
    const { container } = render(<StackBars chart={STACK} />)
    const figure = container.querySelector('[aria-hidden="true"]')!
    expect(figure.querySelector('svg')).toBeNull()
    const bars = heights(figure)
    expect(bars).toHaveLength(5) // 1일 셋 + 3일 둘(0인 비급여 뺌), 2일은 없음
    for (const bar of bars) expect(bar.style.height).toMatch(/^\d+(\.\d+)?%$/)
    const tone = (bar: Element) => classesOf(bar).find((c) => c.startsWith('bg-'))
    expect(bars.slice(0, 3).map(tone)).toEqual(['bg-line-strong', 'bg-accent', 'bg-chart-3'])
    expect(bars.slice(3).map(tone)).toEqual(['bg-line-strong', 'bg-chart-3'])
    expect(figure.textContent).toContain('(만 원)')
    expect(figure.querySelectorAll('[style*="bottom"].h-px')).toHaveLength(STACK.axis.ticks.length)
    expect(figure.querySelector('.w-px')).toBeNull()
  })

  it('AC-4110.4 세 겹 막대: 제목(h3)·범례, 숫자는 그림 밖 sr-only 표로도 있다', () => {
    const { container } = render(<StackBars chart={STACK} />)
    const title = screen.getByRole('heading', { level: 3, name: STACK.title })
    const legend = title.nextElementSibling!
    expect(Array.from(legend.children).map((item) => item.textContent)).toEqual(['기타', '비급여', '급여'])
    const table = container.querySelector('table')!
    expect(classesOf(table)).toContain('sr-only')
    expect(table.closest('[aria-hidden="true"]')).toBeNull()
    expect(table.querySelector('caption')?.textContent).toBe(STACK.table.caption)
    expect(Array.from(table.querySelectorAll('thead th')).map((th) => th.textContent)).toEqual(STACK.table.head)
    expect(table.querySelectorAll('tbody tr')).toHaveLength(2)
  })

  it('AC-4110.4 세 겹 막대: 폰은 날짜 글자를 하나 걸러 숨긴다(자리는 그대로)', () => {
    const { container } = render(<StackBars chart={STACK} />)
    const labels = Array.from(container.querySelectorAll('[aria-hidden="true"] p')).filter((p) => /^\d+일$/.test(p.textContent ?? ''))
    expect(labels.map((p) => p.textContent)).toEqual(['1일', '2일', '3일'])
    expect(labels.map((p) => classesOf(p).includes('max-md:invisible'))).toEqual([false, true, false])
  })

  it('AC-4110.4 순위 막대: 폭 % inline style, 막대는 aria-hidden, 글자는 밖, 그 밖 처방은 line-strong, 폰은 이름·값 한 줄 + 막대 아래 줄이고 건수는 숨긴다', () => {
    const { container } = render(<TreatmentBars rows={TREATMENTS} />)
    const items = screen.getAllByRole('listitem')
    expect(items.map((li) => li.textContent?.includes('가짜 묶음'))).toEqual([true, false])
    const bar = container.querySelector<HTMLElement>('[style*="width"]')!
    expect(bar.style.width).toBe('100%')
    expect(bar.closest('[aria-hidden="true"]')).not.toBeNull()
    expect(screen.getByText('400만 원').closest('[aria-hidden="true"]')).toBeNull()
    expect(classesOf(bar)).toContain('bg-accent')
    expect(container.querySelector('.bg-line-strong')?.closest('li')).toBe(items[1])
    const row = items[0]!
    expect(classesOf(row)).toEqual(expect.arrayContaining(['flex-wrap', 'md:flex-nowrap']))
    expect(classesOf(row.querySelector('[aria-hidden="true"]'))).toEqual(expect.arrayContaining(['order-last', 'w-full', 'md:order-none']))
    expect(classesOf(row.lastElementChild!.lastElementChild!)).toContain('max-md:hidden')
    expect(row.lastElementChild!.lastElementChild!.textContent).toBe('처방 40번')
  })
})

// ── 지운 매출 화면(AC-4110.4) ──

// 지운 파일(tasks.md TASK-8 '지우는 파일')
const DELETED_FILES = [
  'src/app/(app)/revenue/page.tsx',
  'src/app/(app)/revenue/page.test.tsx',
  'src/components/revenue/RevenueScreen.tsx',
  'src/components/revenue/RevenueScreen.test.tsx',
  'src/components/revenue/RevenueStates.tsx',
  'src/components/revenue/RevenueRange.tsx',
  'src/components/revenue/RevenueRange.test.tsx',
  'src/components/revenue/range.ts',
  'src/components/revenue/range.test.ts',
  'src/components/revenue/RevenueTrend.tsx',
  'src/components/revenue/RevenuePerVisit.tsx',
  'src/components/revenue/RevenueTreatments.tsx',
  'src/components/revenue/view.ts',
  'src/components/revenue/view.test.ts',
  'src/components/revenue/groups/GroupEditor.tsx',
  'src/components/revenue/groups/GroupEditor.test.tsx',
  'src/components/revenue/groups/DeleteGroupDialog.tsx',
  'src/components/revenue/groups/known.ts',
  'src/components/revenue/groups/names.ts',
  'src/lib/storage/rxGroups.ts',
  'src/lib/storage/rxGroups.test.ts',
]
// 아무 소스도 불러오면 안 되는 모듈(확장자 없는 저장소 경로). 끝이 '/'면 그 폴더 아래 모두
const FORBIDDEN = [
  'src/app/(app)/revenue/',
  'src/components/revenue/RevenueScreen',
  'src/components/revenue/RevenueStates',
  'src/components/revenue/RevenueRange',
  'src/components/revenue/range',
  'src/components/revenue/RevenueTrend',
  'src/components/revenue/RevenuePerVisit',
  'src/components/revenue/RevenueTreatments',
  'src/components/revenue/view',
  'src/components/revenue/groups/',
  'src/lib/storage/rxGroups',
]

function walk(dir: string): string[] {
  const abs = join(ROOT, dir)
  if (!existsSync(abs)) return []
  return readdirSync(abs).flatMap((name) => {
    const rel = relative(ROOT, join(abs, name)).split(sep).join('/')
    return statSync(join(ROOT, rel)).isDirectory() ? walk(rel) : [rel]
  })
}
const SOURCES = () => walk('src').filter((file) => /\.(?:ts|tsx|mts|js|mjs)$/.test(file))
// import · export from · import() · vi.mock() · vi.importActual()의 모듈 글자
const specifiersOf = (text: string) =>
  [...text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\bvi\.(?:mock|doMock|importActual)\s*\(\s*)['"]([^'"\n]+)['"]/g)].map((m) => m[1]!)
// 저장소 경로(확장자 없음)로 바꾼다. 패키지는 null
function resolveSpecifier(file: string, specifier: string): string | null {
  const bare = specifier.replace(/\.(?:tsx?|jsx?)$/, '')
  if (bare.startsWith('@/')) return `src/${bare.slice(2)}`
  if (bare.startsWith('.')) return posix.normalize(posix.join(dirname(file).split(sep).join('/'), bare))
  return null
}

describe('AC-4110.4 매출 화면·매출 가져올 기간·묶음 고치기 화면·매출 묶음 저장을 지웠다', () => {
  it.each(DELETED_FILES)('AC-4110.4 %s가 없다', (file) => {
    expect(existsSync(join(ROOT, file))).toBe(false)
  })

  it('AC-4110.4 /revenue 페이지 폴더와 매출 묶음 화면 폴더(groups/)가 없다', () => {
    expect(existsSync(join(ROOT, 'src/app/(app)/revenue'))).toBe(false)
    expect(existsSync(join(ROOT, FOLDER, 'groups'))).toBe(false)
  })

  it('AC-4110.4 components/revenue에는 남는 부품·금액 글·보기 타입·그 시험만 있다', () => {
    expect(readdirSync(join(ROOT, FOLDER)).sort()).toEqual([
      'MonthBars.tsx',
      'RevenueParts.tsx',
      'RevenueSplit.tsx',
      'TreatmentBars.tsx',
      'money.test.ts',
      'money.ts',
      'parts.test.tsx',
      'types.ts',
    ])
  })

  it('AC-4110.4 검사할 소스가 있다(빈 검사가 아니다): 불러오기 글자를 찾는 규칙이 아는 파일을 잡는다', () => {
    const files = SOURCES()
    expect(files).toEqual(expect.arrayContaining(['src/components/stats/sections/RevenueSection.tsx', 'src/components/stats/revenueView.ts', 'src/lib/revenue/sync.ts']))
    const section = readFileSync(join(ROOT, 'src/components/stats/sections/RevenueSection.tsx'), 'utf8')
    const resolved = specifiersOf(section).map((s) => resolveSpecifier('src/components/stats/sections/RevenueSection.tsx', s))
    expect(resolved).toEqual(expect.arrayContaining(['src/components/revenue/MonthBars', 'src/components/revenue/RevenueSplit', 'src/components/stats/sections/parts']))
  })

  it('AC-4110.4 src/ 어느 소스(시험 포함)도 지운 매출 화면·보기 모양·묶음 고치기 화면·lib/storage/rxGroups를 불러오지 않는다', () => {
    const bad: string[] = []
    for (const file of SOURCES()) {
      for (const specifier of specifiersOf(readFileSync(join(ROOT, file), 'utf8'))) {
        const target = resolveSpecifier(file, specifier)
        if (target === null) continue
        if (FORBIDDEN.some((gone) => (gone.endsWith('/') ? target.startsWith(gone) : target === gone))) bad.push(`${file} → ${specifier}`)
      }
    }
    expect(bad).toEqual([])
  })

  it.each(['MonthBars.tsx', 'RevenueParts.tsx', 'RevenueSplit.tsx', 'TreatmentBars.tsx'])('AC-4110.4 남는 부품 %s의 보기 타입은 ./types에서 온다(./view 없음)', (name) => {
    const text = readFileSync(join(ROOT, FOLDER, name), 'utf8')
    const specifiers = specifiersOf(text)
    expect(specifiers).not.toContain('./view')
    if (/\bimport type\b/.test(text)) expect(specifiers).toContain('./types')
  })
})

// ── 소스 규칙(폴더의 새 파일을 저절로 본다) ──

describe('AC-009.5·AC-4111.2 소스 규칙(폴더의 새 파일을 저절로 본다)', () => {
  const files = () => readdirSync(join(ROOT, FOLDER)).filter((name) => /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name))
  const source = (name: string) => readFileSync(join(ROOT, FOLDER, name), 'utf8')
  const code = (name: string) => source(name).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1')

  it('AC-009.5·AC-4111.2 검사할 파일이 있다(빈 검사가 아니다)', () => {
    expect(files().sort()).toEqual(['MonthBars.tsx', 'RevenueParts.tsx', 'RevenueSplit.tsx', 'TreatmentBars.tsx'])
  })

  it('AC-009.5·AC-4111.2 16진수·색 함수·대괄호 값·font-bold·sm:·xl:·움직임 클래스가 없다', () => {
    for (const name of files()) {
      const text = code(name)
      expect(text, name).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
      expect(text, name).not.toMatch(/\b(?:rgba?|hsla?|oklch|color-mix)\(/)
      expect(text, name).not.toMatch(/\b[\w:-]+-\[[^\]]*\]/)
      expect(text, name).not.toMatch(/\bfont-bold\b/)
      expect(text, name).not.toMatch(/\b(?:sm|xl|\dxl):/)
      expect(text, name).not.toMatch(/\banimate-|@keyframes|transition-all/)
    }
  })

  it("AC-009.5·AC-4111.2 남는 부품은 모두 훅·'use client'·타이머·움직임이 없는 순수 부품이고, 통로 client.ts·Worker·네트워크·저장소를 쓰지 않는다", () => {
    for (const name of files()) {
      const text = code(name)
      expect(text, name).not.toMatch(/['"]use client['"]/)
      expect(text, name).not.toMatch(/\buse[A-Z]\w*\s*\(/)
      expect(text, name).not.toMatch(/\b(?:setInterval|setTimeout|requestAnimationFrame)\b/)
      expect(text, name).not.toMatch(/\btransition\b/)
      expect(text, name).not.toMatch(/lib\/bridge|lib\/storage|supabase|\bfetch\s*\(|localStorage|sessionStorage/)
      expect(text, name).not.toMatch(/\bnew Worker\b/)
    }
  })

  it('AC-009.5·AC-4111.2 빈 그래프 틀이 없고 상자 안 상자도 없다', () => {
    const { container } = render(
      <>
        <KpiRow kpis={KPIS} />
        <NoticeLine notice={{ lead: '가짜', rest: ' 안내' }} />
        <SplitTable head={SPLIT_HEAD} rows={SPLIT_ROWS} />
        <StackBars chart={STACK} />
        <TreatmentBars rows={TREATMENTS} />
      </>,
    )
    expect(nestedBoxes(container)).toEqual([])
  })
})

// ── 문서(AC-4110.5) ──

describe('AC-4110.5 문서: 매출 탭은 통계 매출 칸으로 옮겼다', () => {
  const linesOf = (file: string) => readFileSync(join(ROOT, file), 'utf8').split(/\r?\n/)

  it('AC-4110.5 docs/ARCHITECTURE.md 흐름의 [매출] 줄이 통계 매출 칸 · sales_day_codes를 말한다', () => {
    const flow = linesOf('docs/ARCHITECTURE.md').filter((line) => line.startsWith('[매출]'))
    expect(flow).toHaveLength(1)
    expect(flow[0]).toContain('통계 매출 칸')
    expect(flow[0]).toContain('sales_day_codes')
    expect(flow[0]).toContain('specs/stats-revenue')
  })

  it('AC-4110.5 docs/ARCHITECTURE.md DB 표에 sales_day_codes 줄이 하나 있고 sales_codes 줄 바로 아래다', () => {
    const lines = linesOf('docs/ARCHITECTURE.md')
    const rows = lines.filter((line) => line.startsWith('| `sales_day_codes` |'))
    expect(rows).toHaveLength(1)
    expect(lines[lines.indexOf(rows[0]!) - 1]).toMatch(/^\| `sales_codes` \|/)
    expect(rows[0]).toContain('specs/stats-revenue')
  })

  it('AC-4110.5 docs/ARCHITECTURE.md 폴더 줄에 /revenue 페이지·RevenueScreen·매출 화면이 없고 components/revenue는 통계 매출 칸 부품이다', () => {
    const lines = linesOf('docs/ARCHITECTURE.md')
    expect(lines.filter((line) => line.includes('(app)/revenue/page.tsx'))).toEqual([])
    expect(lines.filter((line) => line.includes('RevenueScreen'))).toEqual([])
    const folder = lines.filter((line) => /├── revenue\/\s+#/.test(line) && line.includes('통계 매출 칸'))
    expect(folder).toHaveLength(1)
  })

  it('AC-4110.5 plan.md §2-4의 매출 줄이 통계 매출 칸 · sales_day_codes를 말한다', () => {
    const lines = linesOf('plan.md')
    const start = lines.indexOf('### 2-4. 매출')
    expect(start).toBeGreaterThan(-1)
    const end = lines.findIndex((line, i) => i > start && line.startsWith('### '))
    const section = lines.slice(start, end)
    const found = section.filter((line) => line.includes('통계 매출 칸') && line.includes('`sales_day_codes`'))
    expect(found).toHaveLength(1)
    expect(found[0]).toContain('specs/stats-revenue')
  })

  it("AC-4110.5 docs/revenue/pc-check.md 맨 위(제목 바로 다음 줄)에 '매출 탭은 통계 매출 칸으로 옮겼다' 한 줄이 있다", () => {
    const lines = linesOf('docs/revenue/pc-check.md')
    expect(lines[0]).toMatch(/^# /)
    const first = lines.slice(1).find((line) => line.trim() !== '')
    expect(first).toContain('매출 탭은 통계 매출 칸으로 옮겼다')
    expect(lines.filter((line) => line.includes('매출 탭은 통계 매출 칸으로 옮겼다'))).toHaveLength(1)
  })
})
