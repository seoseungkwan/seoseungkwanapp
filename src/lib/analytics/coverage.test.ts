import { describe, expect, it } from 'vitest'
import type { DateRange } from '@/types/dates'
import { bucketState, isCovered, mergeRanges } from './coverage'

const r = (from: string, to: string): DateRange => ({ from, to })
const OCTOBER = r('2026-10-01', '2026-10-31')

// ── 합치기 ────────────────────────────────────────────────

describe('AC-007.1 mergeRanges — 겹치거나 붙은 구간을 합치고 정렬', () => {
  it('빈 목록 → 빈 목록', () => {
    expect(mergeRanges([])).toEqual([])
  })

  it('겹침 → 하나', () => {
    expect(mergeRanges([r('2026-10-01', '2026-10-15'), r('2026-10-10', '2026-10-24')])).toEqual([r('2026-10-01', '2026-10-24')])
  })

  it('붙음(10일 끝 · 11일 시작) → 하나, 달을 넘어 붙어도(9/30 · 10/1) 하나', () => {
    expect(mergeRanges([r('2026-10-01', '2026-10-10'), r('2026-10-11', '2026-10-20')])).toEqual([r('2026-10-01', '2026-10-20')])
    expect(mergeRanges([r('2026-09-01', '2026-09-30'), r('2026-10-01', '2026-10-24')])).toEqual([r('2026-09-01', '2026-10-24')])
  })

  it('떨어짐(하루라도 비면) → 따로', () => {
    expect(mergeRanges([r('2026-10-01', '2026-10-10'), r('2026-10-12', '2026-10-20')])).toEqual([
      r('2026-10-01', '2026-10-10'),
      r('2026-10-12', '2026-10-20'),
    ])
  })

  it('안에 든 구간·같은 구간은 바깥 하나로', () => {
    expect(mergeRanges([r('2026-10-01', '2026-10-31'), r('2026-10-05', '2026-10-06'), r('2026-10-01', '2026-10-31')])).toEqual([OCTOBER])
  })

  it('순서가 뒤섞여 있어도 시작 순으로', () => {
    expect(
      mergeRanges([r('2026-10-20', '2026-10-24'), r('2026-09-01', '2026-09-10'), r('2026-10-12', '2026-10-21'), r('2026-09-05', '2026-09-08')]),
    ).toEqual([r('2026-09-01', '2026-09-10'), r('2026-10-12', '2026-10-24')])
  })

  it('하루짜리 구간도 붙인다', () => {
    expect(mergeRanges([r('2026-10-02', '2026-10-02'), r('2026-10-01', '2026-10-01'), r('2026-10-03', '2026-10-05')])).toEqual([
      r('2026-10-01', '2026-10-05'),
    ])
  })

  it('끝이 시작보다 앞인 구간은 덮은 날이 없어 버린다', () => {
    expect(mergeRanges([r('2026-10-20', '2026-10-01'), r('2026-10-05', '2026-10-06')])).toEqual([r('2026-10-05', '2026-10-06')])
  })

  it('받은 목록을 바꾸지 않는다', () => {
    const input = [r('2026-10-11', '2026-10-20'), r('2026-10-01', '2026-10-10')]
    const copy = structuredClone(input)
    mergeRanges(input)
    expect(input).toEqual(copy)
  })
})

// ── 덮였나 ────────────────────────────────────────────────

describe('AC-007.1 isCovered — 한 구간 안에 통째로 들어가나', () => {
  const merged = mergeRanges([r('2026-09-01', '2026-09-30'), r('2026-10-01', '2026-10-10'), r('2026-10-15', '2026-10-24')])

  it('안에 들어감·양 끝이 딱 맞음 → 덮임', () => {
    expect(isCovered(r('2026-09-28', '2026-10-04'), merged)).toBe(true) // 붙은 두 파일이 합쳐진 구간
    expect(isCovered(r('2026-09-01', '2026-10-10'), merged)).toBe(true)
    expect(isCovered(r('2026-10-24', '2026-10-24'), merged)).toBe(true)
  })

  it('공백을 건너면 안 덮임(공백을 채운 것으로 보지 않는다)', () => {
    expect(isCovered(r('2026-10-10', '2026-10-15'), merged)).toBe(false)
    expect(isCovered(r('2026-10-12', '2026-10-12'), merged)).toBe(false)
    expect(isCovered(OCTOBER, merged)).toBe(false)
  })

  it('한쪽이 밖으로 나가면 안 덮임', () => {
    expect(isCovered(r('2026-08-31', '2026-09-06'), merged)).toBe(false)
    expect(isCovered(r('2026-10-19', '2026-10-25'), merged)).toBe(false)
  })

  it('덮은 구간이 없으면 안 덮임', () => {
    expect(isCovered(r('2026-10-01', '2026-10-01'), [])).toBe(false)
  })
})

// ── 칸 상태 ───────────────────────────────────────────────

describe('AC-007.1 bucketState — 진행 중 · 완전 · 부분', () => {
  const file = mergeRanges([r('2026-09-01', '2026-10-24')])

  it('통째로 덮였고 끝 날이 오늘보다 앞 → complete', () => {
    expect(bucketState(r('2026-09-01', '2026-09-30'), file, '2026-10-25')).toBe('complete')
    expect(bucketState(r('2026-10-12', '2026-10-18'), file, '2026-10-25')).toBe('complete')
    expect(bucketState(r('2026-10-24', '2026-10-24'), file, '2026-10-25')).toBe('complete')
  })

  it('끝 날이 오늘 이상 → in-progress(덮였어도, 안 덮였어도)', () => {
    expect(bucketState(r('2026-10-19', '2026-10-25'), file, '2026-10-25')).toBe('in-progress') // 끝 = 오늘
    expect(bucketState(OCTOBER, file, '2026-10-25')).toBe('in-progress') // 끝 > 오늘
    expect(bucketState(r('2026-10-24', '2026-10-24'), file, '2026-10-24')).toBe('in-progress') // 파일 마지막 날 = 오늘
    expect(bucketState(r('2026-11-02', '2026-11-08'), file, '2026-10-25')).toBe('in-progress')
  })

  it('파일이 칸 중간에 시작하거나 끝남 → partial', () => {
    const late = mergeRanges([r('2026-09-15', '2026-10-24')])
    expect(bucketState(r('2026-09-01', '2026-09-30'), late, '2026-10-25')).toBe('partial')
    expect(bucketState(OCTOBER, file, '2026-11-05')).toBe('partial') // 10/24까지만 덮음
    expect(bucketState(r('2026-08-31', '2026-09-06'), file, '2026-10-25')).toBe('partial') // 주가 파일 시작 전 월요일부터
  })

  it('전혀 안 덮인 지난 칸 → partial', () => {
    expect(bucketState(r('2026-08-01', '2026-08-31'), file, '2026-10-25')).toBe('partial')
  })

  it('두 파일 사이 공백이 있는 달은 partial, 공백을 메우는 파일이 오면 complete', () => {
    const gap = [r('2026-10-01', '2026-10-10'), r('2026-10-15', '2026-10-31')]
    expect(bucketState(OCTOBER, mergeRanges(gap), '2026-11-05')).toBe('partial')
    expect(bucketState(OCTOBER, mergeRanges([...gap, r('2026-10-11', '2026-10-14')]), '2026-11-05')).toBe('complete')
  })
})
