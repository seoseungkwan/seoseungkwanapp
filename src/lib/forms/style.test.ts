import { describe, expect, it } from 'vitest'
import type { LogoBitmap } from './logoFit'
import {
  DEFAULT_STYLE,
  LOGO_SCALE,
  STYLE_KEYS,
  TEXT_SCALE,
  TINT_CLEAR_ALPHA,
  TINT_CLEAR_SHARE,
  checkStyle,
  isDefaultStyle,
  logoTintable,
  scaled,
  type FormStyle,
} from './style'

// 서식 글씨·로고 값(style) — 검사·처음대로·크기 계산·로고 칠할 수 있는지 (spec form-style REQ-6804·REQ-6805·REQ-6806, design.md 2절, TASK-3).
// 순수 함수라 값만 넣어 본다

const style = (over: Partial<Record<keyof FormStyle, unknown>> = {}): Record<string, unknown> => ({ ...DEFAULT_STYLE, ...over })

describe('AC-6806.3: 글씨·로고 값의 범위와 처음대로', () => {
  it('AC-6806.3: 크기 범위는 제목·본문 80~130, 로고 60~150, 5씩이고 열쇠는 여섯 개다', () => {
    expect(TEXT_SCALE).toEqual({ min: 80, max: 130, step: 5 })
    expect(LOGO_SCALE).toEqual({ min: 60, max: 150, step: 5 })
    expect(STYLE_KEYS).toEqual(['titleScale', 'bodyScale', 'logoScale', 'titleColor', 'bodyColor', 'logoColor'])
  })

  it('AC-6806.3: 처음대로(DEFAULT_STYLE)는 크기 셋 100·색 셋 null이고 얼려 둔다', () => {
    expect(DEFAULT_STYLE).toEqual({ titleScale: 100, bodyScale: 100, logoScale: 100, titleColor: null, bodyColor: null, logoColor: null })
    expect(Object.isFrozen(DEFAULT_STYLE)).toBe(true)
  })

  it('AC-6806.3: isDefaultStyle은 여섯 값이 모두 처음대로일 때만 참이다', () => {
    expect(isDefaultStyle({ ...DEFAULT_STYLE })).toBe(true)
    expect(isDefaultStyle(DEFAULT_STYLE)).toBe(true)
    const changed: Partial<FormStyle>[] = [
      { titleScale: 105 },
      { bodyScale: 95 },
      { logoScale: 150 },
      { titleColor: '#dc2626' },
      { bodyColor: '#111111' },
      { logoColor: '#ffffff' },
    ]
    for (const over of changed) expect(isDefaultStyle({ ...DEFAULT_STYLE, ...over }), JSON.stringify(over)).toBe(false)
  })
})

describe('AC-6806.3: checkStyle — 정확히 여섯 열쇠·범위·5의 배수·색 모양', () => {
  it('AC-6806.3: 맞는 값은 새 객체로 그대로 돌려준다(처음대로도 받는다)', () => {
    const value = style({ titleScale: 130, bodyScale: 80, logoScale: 60, titleColor: '#dc2626', bodyColor: null, logoColor: '#ffffff' })
    const out = checkStyle(value)
    expect(out).toEqual(value)
    expect(out).not.toBe(value)
    expect(checkStyle(style())).toEqual(DEFAULT_STYLE)
    expect(checkStyle(style())).not.toBe(DEFAULT_STYLE)
  })

  it('AC-6806.3: 제목·본문 크기는 80·130 경계까지 받고 79·131·82(5의 배수 아님)는 null이다', () => {
    for (const key of ['titleScale', 'bodyScale'] as const) {
      for (const ok of [80, 85, 100, 125, 130]) expect(checkStyle(style({ [key]: ok }))?.[key], `${key} ${ok}`).toBe(ok)
      for (const bad of [79, 131, 82, 75, 135, 60, 150, 0, -100, 100.5, 92.5, NaN, Infinity, '100', null, undefined, true]) {
        expect(checkStyle(style({ [key]: bad })), `${key} ${String(bad)}`).toBeNull()
      }
    }
  })

  it('AC-6806.3: 로고 크기는 60·150 경계까지 받고 59·151·55·155·83(5의 배수 아님)은 null이다', () => {
    for (const ok of [60, 65, 100, 145, 150]) expect(checkStyle(style({ logoScale: ok }))?.logoScale, String(ok)).toBe(ok)
    for (const bad of [59, 151, 55, 155, 83, 102, 100.5, '100', null, undefined]) {
      expect(checkStyle(style({ logoScale: bad })), String(bad)).toBeNull()
    }
  })

  it("AC-6806.3: 색은 null 또는 '#' + 소문자 16진수 6자리만 — 대문자·3자리·8자리·# 없음·색 이름·빈 글·undefined는 null", () => {
    for (const key of ['titleColor', 'bodyColor', 'logoColor'] as const) {
      for (const ok of [null, '#000000', '#ffffff', '#abcdef', '#7c3aed']) expect(checkStyle(style({ [key]: ok }))?.[key], `${key} ${ok}`).toBe(ok)
      for (const bad of ['#ABCDEF', '#AbCdEf', '#abc', '#abcdef00', 'abcdef', 'red', '', ' #abcdef', undefined, 0xabcdef, {}, ['#abcdef']]) {
        expect(checkStyle(style({ [key]: bad })), `${key} ${String(bad)}`).toBeNull()
      }
    }
  })

  it('AC-6806.3: 열쇠가 하나 빠지거나 하나 더 있으면 null이다', () => {
    for (const key of STYLE_KEYS) {
      const missing = Object.fromEntries(Object.entries(style()).filter(([k]) => k !== key))
      expect(checkStyle(missing), `${key} 빠짐`).toBeNull()
    }
    expect(checkStyle({ ...style(), accent: null })).toBeNull()
    expect(checkStyle({ ...style(), size: 100 })).toBeNull()
  })

  it('AC-6806.3: 객체가 아니면 null이다(null·배열·글·숫자)', () => {
    for (const bad of [null, undefined, [], [style()], 'style', 100, true]) expect(checkStyle(bad), String(bad)).toBeNull()
  })
})

describe('AC-6804.1: scaled — 처음 크기 × % ÷ 100을 반올림', () => {
  it('AC-6804.1: 100%면 그대로, 그 밖은 Math.round(size × pct / 100)이다', () => {
    expect(scaled(120, 100)).toBe(120)
    expect(scaled(27, 100)).toBe(27)
    expect(scaled(120, 130)).toBe(156)
    expect(scaled(120, 80)).toBe(96)
    expect(scaled(27, 130)).toBe(35) // 35.1
    expect(scaled(27, 85)).toBe(23) // 22.95
    expect(scaled(35, 90)).toBe(32) // 31.5 → 32
    expect(scaled(109, 115)).toBe(125) // 125.35
  })
})

// RGBA 점 배열 그림(가로 width, 세로 1): 알파 값만 정한 점들
const bitmapOf = (list: number[], width = list.length): LogoBitmap => ({
  data: Uint8ClampedArray.from(list.flatMap((a) => [20, 40, 160, a])),
  width,
  height: list.length / width,
})
const alphas = (clear: number, total: number, clearAlpha = 0, solid = 255) =>
  Array.from({ length: total }, (_, i) => (i < clear ? clearAlpha : solid))

describe('AC-6805.3: logoTintable — 투명한 점(불투명도 16 미만)이 전체의 10% 이상인 그림만 칠할 수 있다', () => {
  it('AC-6805.3: 상수는 불투명도 16·10%다', () => {
    expect(TINT_CLEAR_ALPHA).toBe(16)
    expect(TINT_CLEAR_SHARE).toBe(0.1)
  })

  it('AC-6805.3: 100점 중 투명 10점(10%)이면 참, 9점이면 거짓이다', () => {
    expect(logoTintable(bitmapOf(alphas(10, 100)))).toBe(true)
    expect(logoTintable(bitmapOf(alphas(9, 100)))).toBe(false)
  })

  it('AC-6805.3: 불투명도 15는 투명으로 세고 16은 세지 않는다', () => {
    expect(logoTintable(bitmapOf(alphas(10, 100, 15)))).toBe(true)
    expect(logoTintable(bitmapOf(alphas(10, 100, 16)))).toBe(false)
  })

  it('AC-6805.3: 모두 불투명(배경이 남은 로고)이면 거짓, 모두 투명이면 참이다', () => {
    expect(logoTintable(bitmapOf(alphas(0, 50)))).toBe(false)
    expect(logoTintable(bitmapOf(alphas(50, 50)))).toBe(true)
  })

  it('AC-6805.3: 가로·세로가 전체 점 수를 정한다(10×10 그림, 투명 점 자리는 상관없다)', () => {
    const scattered = Array.from({ length: 100 }, (_, i) => (i % 10 === 3 ? 0 : 255))
    expect(logoTintable(bitmapOf(scattered, 10))).toBe(true)
    expect(logoTintable(bitmapOf(scattered.map((a, i) => (i === 3 ? 255 : a)), 10))).toBe(false)
  })

  it('AC-6805.3: 받은 그림을 고치지 않는다', () => {
    const px = bitmapOf(alphas(30, 100))
    const before = Uint8ClampedArray.from(px.data)
    logoTintable(px)
    expect(px.data).toEqual(before)
  })
})
