import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// 업무일지 인쇄 CSS (worklog REQ-011, design.md 13절). 파일 글자를 읽어 본다.
// 값은 승인 시안 docs/mockups/worklog(index.html·text-cells.html)의 @media print 그대로다. 실제 PDF 한 쪽은 E2E(TASK-13)가 본다
const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const sheetCss = () => read('src/components/worklog/sheet.module.css')
const globalsCss = () => read('src/app/globals.css')
const sheetTsx = () => readFileSync(join(process.cwd(), 'src/components/worklog/WorklogSheet.tsx'), 'utf8')

// 여는 중괄호 위치에서 짝이 맞는 닫는 중괄호까지 찾는다
function closingBrace(css: string, open: number): number {
  let depth = 0
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1
    if (css[i] === '}') depth -= 1
    if (depth === 0) return i
  }
  throw new Error('중괄호 짝이 맞지 않는다')
}

// @media print 블록(없으면 null). end는 블록을 닫는 중괄호 위치
function printBlock(css: string): { start: number; end: number; body: string } | null {
  const found = /@media\s+print\s*\{/.exec(css)
  if (found === null) return null
  const open = found.index + found[0].length - 1
  const end = closingBrace(css, open)
  return { start: found.index, end, body: css.slice(open + 1, end) }
}

// 블록 안 규칙을 선택자 하나마다 { 속성: 값 }으로 읽는다
function rulesOf(body: string): Map<string, Record<string, string>> {
  const rules = new Map<string, Record<string, string>>()
  for (const [, selectors, declarations] of body.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const parsed = Object.fromEntries(
      declarations
        .split(';')
        .map((line) => line.split(':'))
        .filter((parts) => parts.length === 2)
        .map(([name, value]) => [name.trim(), value.trim()]),
    )
    for (const selector of selectors.split(',')) {
      const name = selector.trim().replace(/\s+/g, ' ')
      rules.set(name, { ...rules.get(name), ...parsed })
    }
  }
  return rules
}

const printRules = () => rulesOf(printBlock(sheetCss())?.body ?? '')
const rule = (selector: string) => printRules().get(selector)
// @media print 밖(화면·폰) 규칙
function screenRules() {
  const css = sheetCss()
  const block = printBlock(css)
  const outside = block === null ? css : css.slice(0, block.start) + css.slice(block.end + 1)
  const phone = /@media\s*\(\s*max-width:\s*767px\s*\)\s*\{/.exec(outside)
  if (phone === null) return rulesOf(outside)
  const open = phone.index + phone[0].length - 1
  const end = closingBrace(outside, open)
  return rulesOf(outside.slice(0, phone.index) + outside.slice(open + 1, end) + outside.slice(end + 1))
}

const PT_VARS: Record<string, number> = {
  '--c': 13,
  '--c11': 11,
  '--c10': 10,
  '--c14': 14,
  '--t': 32,
  '--h1': 39.75,
  '--h2': 18,
  '--h3': 33.75,
  '--h28': 21,
  '--h40': 30,
  '--h20': 15,
}

// 양식 코드의 <tr> 순서를 줄 높이 변수 이름으로(클래스가 없는 줄은 기본 h40)
const ROW_VAR: Record<string, string> = { r1: '--h1', r2: '--h2', r3: '--h3', r28: '--h28', r20: '--h20' }
const sheetRowVars = () => [...sheetTsx().matchAll(/<tr(?:\s+className=\{s\.(\w+)\})?/g)].map((m) => (m[1] ? ROW_VAR[m[1]] : '--h40'))

describe('AC-011.1: 인쇄 CSS는 A4 세로·여백 12mm에 엑셀 pt 값이다', () => {
  it('AC-011.1: @page는 A4 세로·여백 12mm다(sheet.module.css, Next가 거부하면 globals.css의 한 블록)', () => {
    const page = rule('@page') ?? rulesOf(printBlock(globalsCss())?.body ?? '').get('@page')
    expect(page).toEqual({ size: 'A4 portrait', margin: '12mm' })
  })

  it('AC-011.1: 바깥 종이는 테두리·여백이 없고 밀리지 않는다', () => {
    expect(rule('.paper')).toEqual({ padding: '0', border: '0', overflow: 'visible' })
  })

  it('AC-011.1: 양식은 폭 100%다', () => {
    expect(rule('.sheet')?.width).toBe('100%')
  })

  it.each(Object.entries(PT_VARS))('AC-011.1: 크기 변수 %s는 %spt다(시안 값 그대로)', (name, pt) => {
    expect(rule('.sheet')?.[name]).toBe(`${pt}pt`)
  })

  it('AC-011.1: 제목·칸·날짜·업무사항·지출 비고 글자와 줄 높이가 그 변수를 쓴다', () => {
    const screen = screenRules()
    expect(screen.get('.sheet')?.['font-size']).toBe('var(--c)')
    expect(screen.get('.sheet .title')?.['font-size']).toBe('var(--t)')
    expect(screen.get('.sheet .date')?.['font-size']).toBe('var(--c14)')
    expect(screen.get('.sheet .memo')?.['font-size']).toBe('var(--c11)')
    expect(screen.get('.sheet .small')?.['font-size']).toBe('var(--c10)')
    expect(screen.get('.sheet tr')?.height).toBe('var(--h40)')
    for (const [row, name] of Object.entries(ROW_VAR)) expect(screen.get(`.sheet .${row}`)?.height, row).toBe(`var(${name})`)
  })

  it('AC-011.1: 색은 그대로 찍힌다(print-color-adjust: exact)', () => {
    expect(rule('.sheet')?.['print-color-adjust']).toBe('exact')
    expect(rule('.sheet')?.['-webkit-print-color-adjust']).toBe('exact')
  })

  it('AC-011.1: 흐린 안내 글은 찍히지 않고, 업무사항 칸에 밀어 보기 막대가 찍히지 않는다', () => {
    expect(rule('.sheet .memo textarea::placeholder')).toEqual({ color: 'transparent' })
    expect(rule('.sheet .memo textarea')).toEqual({ overflow: 'hidden' })
  })
})

describe('AC-011.2: 23줄이 A4 한 장에 들어간다', () => {
  const pageHeightPt = ((297 - 24) * 72) / 25.4

  it('AC-011.2: 양식의 줄 순서는 1:h1, 2:h2, 3:h3, 4~6:h28, 7~16:h40, 17~18:h20, 19~23:h40이다', () => {
    expect(sheetRowVars()).toEqual([
      '--h1',
      '--h2',
      '--h3',
      ...Array<string>(3).fill('--h28'),
      ...Array<string>(10).fill('--h40'),
      ...Array<string>(2).fill('--h20'),
      ...Array<string>(5).fill('--h40'),
    ])
  })

  it('AC-011.2: CSS의 줄 높이 pt를 더하면 634.5pt이고 A4 인쇄 높이(273mm ≈ 773.9pt) 안이다', () => {
    const printed = rule('.sheet') ?? {}
    const total = sheetRowVars().reduce((sum, name) => sum + Number.parseFloat(printed[name] ?? 'NaN'), 0)
    expect(total).toBe(634.5)
    expect(total).toBeLessThanOrEqual(pageHeightPt)
  })
})

describe('AC-011.3: 양식만, 엑셀 모양으로 찍힌다', () => {
  it('AC-011.3: "합계에서 빠졌어요"는 찍히지 않고, 그 표시 자리도 비워 글자가 칸 가운데에 찍힌다', () => {
    expect(rule('.sheet .flag')).toEqual({ display: 'none' })
    for (const selector of ['.sheet td.wide.flagged > input', '.sheet td.mid.flagged > input', '.sheet td.cnt.flagged > input']) {
      expect(rule(selector), selector).toEqual({ padding: '0 4px' })
    }
  })

  it('AC-011.3: 막힌 칸의 빨강은 찍히지 않는다', () => {
    for (const selector of ['.sheet td.blocked > input', '.sheet td.blocked > textarea']) {
      expect(rule(selector), selector).toEqual({ background: 'transparent', 'box-shadow': 'none' })
    }
  })

  it('AC-011.3: 인쇄에서 숨는 것은 "합계에서 빠졌어요"뿐이다(업무사항·고친 항목 이름은 찍힌다)', () => {
    const hidden = [...printRules()].filter(([, declarations]) => declarations.display === 'none').map(([selector]) => selector)
    expect(hidden).toEqual(['.sheet .flag'])
    expect(rule('.sheet .memo textarea')?.visibility).toBeUndefined()
  })

  // 뒤의 규칙이 이기려면 선택자 세기가 같아야 한다. .flag 하나만 적으면 화면 규칙 .sheet .flag { display: flex }에 진다
  it('AC-011.3: 인쇄 선택자는 화면 규칙과 같은 세기다', () => {
    const screen = screenRules()
    const selectors = [...printRules().keys()].filter((selector) => selector !== '@page')
    expect(selectors.filter((selector) => !screen.has(selector))).toEqual([])
  })

  // A4 세로 인쇄 폭(186mm ≈ 703px)은 767px보다 좁아 폰 규칙도 함께 걸린다. 같은 세기에서 이기려면 파일 맨 끝이어야 한다
  it('AC-011.3: 인쇄 블록은 폰 규칙보다 뒤, 파일 맨 끝에 있다', () => {
    const css = sheetCss()
    const block = printBlock(css)
    expect(block).not.toBeNull()
    expect(block!.start).toBeGreaterThan(css.search(/@media\s*\(\s*max-width:\s*767px\s*\)/))
    expect(block!.end).toBe(css.trimEnd().length - 1)
  })

  // 양식 칸 쪽 Tailwind 클래스 border border-line을 .paper { border: 0 }이 이겨야 한다. layer 밖 CSS는 layer 안 Tailwind를 늘 이긴다
  it('AC-011.3: .paper의 테두리 지우기가 Tailwind border를 이긴다(Tailwind는 layer 안, 이 파일은 layer 밖)', () => {
    expect(sheetTsx()).toContain('`${s.paper} border border-line`')
    expect(globalsCss()).toMatch(/@import\s+"tailwindcss\/utilities\.css"\s+layer\(utilities\)/)
    expect(sheetCss()).not.toMatch(/@layer\b/)
  })
})
