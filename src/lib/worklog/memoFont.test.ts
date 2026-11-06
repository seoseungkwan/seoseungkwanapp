import { readFileSync } from 'node:fs'
import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  emptyWorklogDay,
  MEMO_FONT_DEFAULT,
  MEMO_FONT_PTS,
  WORKLOG_CELL_KEYS,
  WORKLOG_COLUMNS,
  type MemoFontPt,
  type WorklogCash,
  type WorklogDay,
  type WorklogNumberKey,
  type WorklogSavedDay,
} from '@/types/worklog'
import { canStepMemoFont, stepMemoFont, toMemoFontPt } from './memoFont'

// 업무사항 글씨 크기 규칙 (specs/worklog-memo-font REQ-1501, design.md '규칙')
const SOURCE = 'src/lib/worklog/memoFont.ts'

describe('크기 목록과 기본값', () => {
  it('AC-1501.1: MEMO_FONT_PTS는 정확히 8·9·10·11·12·14·16이고 작은 것부터다', () => {
    expect(MEMO_FONT_PTS).toEqual([8, 9, 10, 11, 12, 14, 16])
    expect([...MEMO_FONT_PTS].sort((a, b) => a - b)).toEqual([...MEMO_FONT_PTS])
  })

  it('AC-1501.1: MEMO_FONT_DEFAULT는 11이고 목록 안에 있다', () => {
    expect(MEMO_FONT_DEFAULT).toBe(11)
    expect(MEMO_FONT_PTS).toContain(MEMO_FONT_DEFAULT)
  })

  it('AC-1501.1: MemoFontPt는 일곱 숫자의 타입이고 WorklogSavedDay에는 선택 칸 memoFontPt만 더해진다', () => {
    expectTypeOf<MemoFontPt>().toEqualTypeOf<8 | 9 | 10 | 11 | 12 | 14 | 16>()
    expectTypeOf<WorklogSavedDay>().toEqualTypeOf<{
      day: WorklogDay
      bitFields: WorklogNumberKey[]
      memoFontPt?: MemoFontPt
      cash?: WorklogCash // 현금 시재(specs/worklog-cash-float)
    }>()
    // 크기 칸이 없는 옛 모양도 그대로 WorklogSavedDay다(없으면 11로 본다)
    const old: WorklogSavedDay = { day: emptyWorklogDay(), bitFields: [] }
    const withPt: WorklogSavedDay = { day: emptyWorklogDay(), bitFields: [], memoFontPt: 14 }
    expect(old.memoFontPt).toBeUndefined()
    expect(withPt.memoFontPt).toBe(14)
  })

  it('AC-1501.1: 칸 열쇠 WORKLOG_CELL_KEYS(32칸)·WORKLOG_COLUMNS·빈 하루에는 크기 칸이 없다', () => {
    expect(WORKLOG_CELL_KEYS).toHaveLength(32)
    expect(WORKLOG_CELL_KEYS).not.toContain('memoFontPt')
    expect(Object.keys(WORKLOG_COLUMNS)).toEqual([...WORKLOG_CELL_KEYS])
    expect(Object.values(WORKLOG_COLUMNS)).not.toContain('memo_font_pt')
    expect(Object.keys(emptyWorklogDay())).toEqual([...WORKLOG_CELL_KEYS])
  })
})

describe('toMemoFontPt', () => {
  it.each([8, 9, 10, 11, 12, 14, 16])('AC-1501.2: 목록 안 숫자 %s는 그대로다', (value) => {
    expect(toMemoFontPt(value)).toBe(value)
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ["글자 '14'", '14'],
    ["글자 '11'", '11'],
    ['7', 7],
    ['13', 13],
    ['15', 15],
    ['17', 17],
    ['0', 0],
    ['-11', -11],
    ['14.5', 14.5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['배열 [14]', [14]],
    ['빈 배열', []],
    ['객체 { pt: 14 }', { pt: 14 }],
    ['빈 객체', {}],
    ['참', true],
  ])('AC-1501.2: 목록 밖 값 %s는 11이다', (_name, value) => {
    expect(toMemoFontPt(value)).toBe(11)
  })
})

describe('stepMemoFont · canStepMemoFont', () => {
  it.each([
    [11, -1, 10],
    [11, 1, 12],
    [12, 1, 14],
    [14, 1, 16],
    [9, -1, 8],
    [16, -1, 14],
    [10, 1, 11],
    [14, -1, 12],
  ] as const)('AC-1501.3: %s에서 %s칸 가면 %s다', (pt, step, next) => {
    expect(stepMemoFont(pt, step)).toBe(next)
  })

  it('AC-1501.3: 8에서 한 칸씩 커지면 목록 차례로 가고, 16에서 한 칸씩 작아지면 거꾸로 간다', () => {
    const up: MemoFontPt[] = [8]
    while (up.length < MEMO_FONT_PTS.length) up.push(stepMemoFont(up[up.length - 1], 1))
    expect(up).toEqual([...MEMO_FONT_PTS])
    const down: MemoFontPt[] = [16]
    while (down.length < MEMO_FONT_PTS.length) down.push(stepMemoFont(down[down.length - 1], -1))
    expect(down).toEqual([...MEMO_FONT_PTS].reverse())
  })

  it('AC-1501.3: 끝에서 더 가면 그대로다(8에서 -1은 8, 16에서 +1은 16)', () => {
    expect(stepMemoFont(8, -1)).toBe(8)
    expect(stepMemoFont(16, 1)).toBe(16)
  })

  it('AC-1501.3: canStepMemoFont는 8의 -1과 16의 +1에서만 거짓이다', () => {
    for (const pt of MEMO_FONT_PTS) {
      expect(canStepMemoFont(pt, -1)).toBe(pt !== 8)
      expect(canStepMemoFont(pt, 1)).toBe(pt !== 16)
    }
  })
})

describe('만드는 규칙', () => {
  const source = () => readFileSync(SOURCE, 'utf8')

  it('AC-1501.4: memoFont는 @/types/worklog만 부른다', () => {
    const imports = [...source().matchAll(/from '([^']+)'/g)].map((match) => match[1])
    expect(imports).toEqual(['@/types/worklog'])
  })

  it.each([
    ['React', /react/i],
    ['supabase', /supabase/i],
    ['@/lib/storage', /@\/lib\/storage|lib\/storage/],
    ['localStorage', /\blocalStorage\b/],
    ['sessionStorage', /\bsessionStorage\b/],
    ['indexedDB', /\bindexedDB\b/],
    ['console', /\bconsole\b/],
    ['fetch', /\bfetch\b/],
    ['XMLHttpRequest', /\bXMLHttpRequest\b/],
    ['WebSocket', /\bWebSocket\b/],
  ])('AC-1501.4: memoFont 소스에는 %s가 없다(순수 함수)', (_name, pattern) => {
    expect(source()).not.toMatch(pattern)
  })
})
