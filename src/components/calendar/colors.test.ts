import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CAL_COLORS, DEFAULT_CAL_SETTINGS, type CalStaff } from '@/types/calendar'
import { apptColor, CAL_COLOR_LABEL, CAL_TONES, staffColor } from './colors'

// 예약 색 고르기(spec clinic-calendar design.md '화면' colors.ts, 시안 colorOf·PALETTE).
// 종류 색 → (종류가 '시행자 색 따름'이면) 시행자 색 → 목록에 없는 종류·시행자(지운 것)는 회색

const STAFF: CalStaff[] = [
  { id: 'ga', name: '한○○', mark: '가', color: 'blue' },
  { id: 'na', name: '윤○○', mark: '나', color: 'teal' },
  { id: 'won', name: '원장님', mark: '원', color: 'gray' },
]
const SETTINGS = { kinds: DEFAULT_CAL_SETTINGS.kinds, staff: STAFF }

describe('AC-5905.1: 예약 칸 색은 종류 색 또는 시행자 색이다', () => {
  it('AC-5905.1: 고정 색 종류(주사 분홍·진료 연두)는 시행자와 상관없이 종류 색이다', () => {
    expect(apptColor({ kindId: 'inj', staffId: 'won' }, SETTINGS)).toBe('pink')
    expect(apptColor({ kindId: 'visit', staffId: 'ga' }, SETTINGS)).toBe('lime')
  })

  it("AC-5905.1: '시행자 색 따름' 종류(도수·자보도수·충격파)는 시행자 색이다", () => {
    expect(apptColor({ kindId: 'dosu', staffId: 'ga' }, SETTINGS)).toBe('blue')
    expect(apptColor({ kindId: 'jabo', staffId: 'na' }, SETTINGS)).toBe('teal')
    expect(apptColor({ kindId: 'shock', staffId: 'won' }, SETTINGS)).toBe('gray')
  })

  it('AC-5905.1: 목록에서 지운 종류·시행자의 예약은 회색이다(저장된 이름은 그대로 그린다)', () => {
    expect(apptColor({ kindId: 'gone', staffId: 'ga' }, SETTINGS)).toBe('gray')
    expect(apptColor({ kindId: 'dosu', staffId: 'gone' }, SETTINGS)).toBe('gray')
    expect(apptColor({ kindId: 'inj', staffId: 'gone' }, SETTINGS)).toBe('gray')
    expect(apptColor({ kindId: 'dosu', staffId: 'ga' }, { kinds: SETTINGS.kinds, staff: [] })).toBe('gray')
  })

  it('AC-5905.1: 휴무 칩 색은 시행자 색, 목록에 없는 시행자는 회색이다', () => {
    expect(staffColor('na', STAFF)).toBe('teal')
    expect(staffColor('gone', STAFF)).toBe('gray')
    expect(staffColor(null, STAFF)).toBe('gray')
  })
})

describe('AC-5905.1: 10색 모양 묶음은 globals.css --cal-* 토큰 클래스만 쓴다', () => {
  const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')

  it('AC-5905.1: CAL_TONES·CAL_COLOR_LABEL은 CAL_COLORS 10색을 같은 차례로 덮고, 이름은 시안 색판 글이다', () => {
    expect(Object.keys(CAL_TONES)).toEqual([...CAL_COLORS])
    expect(Object.keys(CAL_COLOR_LABEL)).toEqual([...CAL_COLORS])
    expect(Object.values(CAL_COLOR_LABEL)).toEqual(['파랑', '청록', '보라', '주황', '분홍', '연두', '남색', '하늘', '갈색', '회색'])
  })

  it.each(CAL_COLORS)('AC-5905.1: %s 묶음은 진한 바탕·옅은 바탕·띠·테두리 클래스를 통째로 적고, 그 토큰이 @theme inline에 있다', (color) => {
    const tone = CAL_TONES[color]
    expect(tone).toEqual({
      solid: `bg-cal-${color}`,
      soft: `bg-cal-${color}-soft`,
      edge: `border-cal-${color}`,
      ring: `ring-cal-${color}/25`,
    })
    expect(css).toContain(`--color-cal-${color}: var(--cal-${color});`)
    expect(css).toContain(`--color-cal-${color}-soft: var(--cal-${color}-soft);`)
  })

  it('AC-5905.1: colors.ts에는 16진수·rgb(·color-mix( 색 글자가 없다(값은 :root 한 곳)', () => {
    const source = readFileSync(join(process.cwd(), 'src/components/calendar/colors.ts'), 'utf8')
    expect(source).not.toMatch(/#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|color-mix)\(/i)
  })
})
