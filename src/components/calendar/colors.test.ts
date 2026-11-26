import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CAL_COLOR_ID, CAL_COLORS, type CalKind, type CalStaff } from '@/types/calendar'
import { apptColor, CAL_COLOR_LABEL, CAL_DEFAULT_LABEL, CAL_FALLBACK, CAL_FOLLOW_LABEL, CAL_TONES, staffColor } from './colors'

// 예약 색 고르기(spec clinic-calendar design.md '화면' colors.ts · google-link design.md 10-1, ADR-055).
// 종류 고정 색 → (종류가 '시행자 색 따름'이면) 시행자 색 → 목록에 없는 종류·시행자(지운 것)는 캘린더 기본 색(옛 회색 대신, AC-8503.5)

const STAFF: CalStaff[] = [
  { id: 'ga', name: '한○○', mark: '가', color: 'blueberry' },
  { id: 'na', name: '윤○○', mark: '나', color: 'basil' },
  { id: 'won', name: '원장님', mark: '원', color: 'graphite' },
]
// 옛 기본 종류(주사 분홍 → 플라밍고 · 진료 연두 → 세이지, design.md 7-4 옮기기 표)
const KINDS: CalKind[] = [
  { id: 'dosu', name: '도수', len: 30, color: null, words: ['도수'] },
  { id: 'jabo', name: '자보도수', len: 30, color: null, words: ['자보도수', '자보'] },
  { id: 'shock', name: '충격파', len: 15, color: null, words: ['충격파', '타'] },
  { id: 'inj', name: '주사', len: 10, color: 'flamingo', words: ['주사'] },
  { id: 'visit', name: '진료', len: 10, color: 'sage', words: ['진료'] },
  { id: 'memo', name: '상담', len: 10, color: 'default', words: ['상담'] },
]
const SETTINGS = { kinds: KINDS, staff: STAFF }
const PAINTS = [...CAL_COLORS, 'default'] as const

describe('AC-5905.1: 예약 칸 색은 종류 색 또는 시행자 색이다', () => {
  it('AC-5905.1: 고정 색 종류(주사 플라밍고·진료 세이지)는 시행자와 상관없이 종류 색이다', () => {
    expect(apptColor({ kindId: 'inj', staffId: 'won' }, SETTINGS)).toBe('flamingo')
    expect(apptColor({ kindId: 'visit', staffId: 'ga' }, SETTINGS)).toBe('sage')
  })

  it("AC-5905.1: '시행자 색 따름' 종류(도수·자보도수·충격파)는 시행자 색이다", () => {
    expect(apptColor({ kindId: 'dosu', staffId: 'ga' }, SETTINGS)).toBe('blueberry')
    expect(apptColor({ kindId: 'jabo', staffId: 'na' }, SETTINGS)).toBe('basil')
    expect(apptColor({ kindId: 'shock', staffId: 'won' }, SETTINGS)).toBe('graphite')
  })

  it("AC-8503.5: 종류 색이 '캘린더 기본 색'(default)이면 시행자와 상관없이 캘린더 기본 색이다", () => {
    expect(apptColor({ kindId: 'memo', staffId: 'ga' }, SETTINGS)).toBe('default')
  })
})

describe('AC-8503.5: 목록에서 지운 시행자·종류의 예약은 캘린더 기본 색이다(옛 회색 대신)', () => {
  it('AC-8503.5: 지운 종류·지운 시행자의 예약은 default다(저장된 이름은 그대로 그린다)', () => {
    expect(apptColor({ kindId: 'gone', staffId: 'ga' }, SETTINGS)).toBe('default')
    expect(apptColor({ kindId: 'dosu', staffId: 'gone' }, SETTINGS)).toBe('default')
    expect(apptColor({ kindId: 'inj', staffId: 'gone' }, SETTINGS)).toBe('default')
    expect(apptColor({ kindId: 'dosu', staffId: 'ga' }, { kinds: SETTINGS.kinds, staff: [] })).toBe('default')
    expect(CAL_FALLBACK).toBe('default')
  })

  it('AC-8503.5: 휴무 칩 색은 시행자 색, 목록에 없는 시행자는 캘린더 기본 색이다', () => {
    expect(staffColor('na', STAFF)).toBe('basil')
    expect(staffColor('gone', STAFF)).toBe('default')
    expect(staffColor(null, STAFF)).toBe('default')
  })

  it('AC-8503.3: 시행자 없는 예약(세 칸 null)은 고정 색 종류면 그 색, 시행자 색 따름이면 캘린더 기본 색이다', () => {
    expect(apptColor({ kindId: 'inj', staffId: null }, SETTINGS)).toBe('flamingo')
    expect(apptColor({ kindId: 'dosu', staffId: null }, SETTINGS)).toBe('default')
  })
})

describe('AC-8503.1·AC-8503.2: 11색 모양 묶음은 globals.css --cal-* 토큰 클래스만 쓰고 칸을 꽉 채운다', () => {
  const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')
  const source = readFileSync(join(process.cwd(), 'src/components/calendar/colors.ts'), 'utf8')

  it('AC-8503.1: CAL_COLORS는 구글 일정 colorId 1~11 차례의 11색이고, CAL_COLOR_ID는 lavender 1 … tomato 11이다', () => {
    expect([...CAL_COLORS]).toEqual(['lavender', 'sage', 'grape', 'flamingo', 'banana', 'tangerine', 'peacock', 'graphite', 'blueberry', 'basil', 'tomato'])
    expect(CAL_COLOR_ID).toEqual({
      lavender: '1',
      sage: '2',
      grape: '3',
      flamingo: '4',
      banana: '5',
      tangerine: '6',
      peacock: '7',
      graphite: '8',
      blueberry: '9',
      basil: '10',
      tomato: '11',
    })
  })

  it('AC-8503.2: 색 이름 글은 시안 이름(라벤더·세이지·포도·플라밍고·바나나·귤·공작·흑연·블루베리·바질·토마토)이고 캘린더 기본 색·시행자 색 따름 글이 있다', () => {
    expect(Object.keys(CAL_COLOR_LABEL)).toEqual([...CAL_COLORS])
    expect(Object.values(CAL_COLOR_LABEL)).toEqual(['라벤더', '세이지', '포도', '플라밍고', '바나나', '귤', '공작', '흑연', '블루베리', '바질', '토마토'])
    expect(CAL_DEFAULT_LABEL).toBe('캘린더 기본 색')
    expect(CAL_FOLLOW_LABEL).toBe('시행자 색 따름')
  })

  it.each(PAINTS)('AC-8503.1: %s 묶음은 꽉 채운 바탕(bg-cal-*)과 글자색(text-cal-*-on) 클래스를 통째로 적고, 그 토큰이 @theme inline에 있다', (color) => {
    expect(CAL_TONES[color]).toEqual({ fill: `bg-cal-${color}`, on: `text-cal-${color}-on` })
    expect(source).toContain(`'bg-cal-${color}'`)
    expect(source).toContain(`'text-cal-${color}-on'`)
    expect(css).toContain(`--color-cal-${color}: var(--cal-${color});`)
    expect(css).toContain(`--color-cal-${color}-on: var(--cal-${color}-on);`)
  })

  it('AC-8503.1: CAL_TONES는 11색 + 캘린더 기본 색을 같은 차례로 덮고, 옛 옅은 바탕·띠·테두리 클래스는 없다', () => {
    expect(Object.keys(CAL_TONES)).toEqual([...PAINTS])
    expect(source).not.toMatch(/-soft\b|border-cal-|ring-cal-/)
  })

  it('AC-5905.1: colors.ts에는 16진수·rgb(·color-mix( 색 글자가 없다(값은 :root 한 곳)', () => {
    expect(source).not.toMatch(/#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|color-mix)\(/i)
  })
})
