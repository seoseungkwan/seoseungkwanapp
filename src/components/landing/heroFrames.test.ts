import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HERO_INTERVAL_MS, heroFrame, startHeroTicker } from './heroFrames'

describe('AC-003.1: 틱 0 값', () => {
  it('AC-003.1: 오늘 외래 128, 신환율 18.2, 도넛 18, 막대는 목업 첫 묶음', () => {
    expect(heroFrame(0)).toEqual({ visits: 128, newRate: '18.2', ringPct: 18, bars: [22, 35, 41, 52, 60, 74] })
  })
})

describe('AC-003.2: 값 순환', () => {
  it('AC-003.2: 오늘 외래는 8개 주기로 돈다', () => {
    const visits = Array.from({ length: 9 }, (_, t) => heroFrame(t).visits)
    expect(visits).toEqual([128, 129, 131, 132, 134, 135, 137, 138, 128])
  })

  it('AC-003.2: 신환율·도넛·막대는 4개 주기로 돈다', () => {
    const frames = Array.from({ length: 5 }, (_, t) => heroFrame(t))
    expect(frames.map((f) => f.newRate)).toEqual(['18.2', '18.4', '18.6', '18.4', '18.2'])
    expect(frames.map((f) => f.ringPct)).toEqual([18, 24, 31, 27, 18])
    expect(frames.map((f) => f.bars)).toEqual([
      [22, 35, 41, 52, 60, 74],
      [30, 38, 49, 58, 71, 82],
      [26, 44, 53, 63, 77, 91],
      [34, 41, 56, 66, 80, 88],
      [22, 35, 41, 52, 60, 74],
    ])
  })

  it('AC-003.2: t=5 → 135 · 18.4 · 24 · 둘째 막대 묶음, t=8 → 첫 값', () => {
    expect(heroFrame(5)).toEqual({ visits: 135, newRate: '18.4', ringPct: 24, bars: [30, 38, 49, 58, 71, 82] })
    expect(heroFrame(8)).toEqual(heroFrame(0))
  })
})

describe('AC-004: 타이머', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('AC-004.1: 2600ms마다 onTick(1), onTick(2)… 정리하면 멈춘다', () => {
    expect(HERO_INTERVAL_MS).toBe(2600)
    const onTick = vi.fn()
    const stop = startHeroTicker({ reduce: false, onTick })

    vi.advanceTimersByTime(2599)
    expect(onTick).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    vi.advanceTimersByTime(2600)
    expect(onTick.mock.calls).toEqual([[1], [2]])

    stop()
    vi.advanceTimersByTime(2600 * 5)
    expect(onTick).toHaveBeenCalledTimes(2)
  })

  it('AC-004.2: 모션 줄이기면 타이머를 만들지 않아 onTick을 부르지 않는다', () => {
    const onTick = vi.fn()
    const stop = startHeroTicker({ reduce: true, onTick })
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(2600 * 5)
    expect(onTick).not.toHaveBeenCalled()
    stop()
  })
})
