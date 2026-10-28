import { describe, expect, it } from 'vitest'
import type { Grid } from '@/types/parse'
import { BIT_HEADER, buildFakeBitTable } from '../../../../fixtures/make-fake-fixtures'
import { findHeaderRow, readPeriod } from './header'

const HEADER = [...BIT_HEADER]
const BODY = ['AA154', '초진 진찰료', '진찰료', '9000001']

// 머리줄 위 줄들 + 머리줄 + 본문 한 줄
const tableWith = (above: Grid): Grid => [...above, HEADER, BODY]

describe('AC-004.1 findHeaderRow', () => {
  it('가짜 파일: 제목·기간 줄 뒤(빈 줄은 readGrid가 뺀다)', () => {
    const grid = buildFakeBitTable().filter((row) => row.length > 0)
    expect(findHeaderRow(grid)).toBe(2)
  })

  it('맨 첫 줄이 머리줄', () => {
    expect(findHeaderRow([HEADER, BODY])).toBe(0)
  })

  it('제목·기간·빈 칸 줄 뒤', () => {
    expect(findHeaderRow(tableWith([['환자별 소모 통계'], ['기간: 2026-09-01 ~ 2026-10-24'], [null, null]]))).toBe(3)
  })

  it('칸 이름 변형(차트 번호·처방 코드)과 등록번호도 머리줄', () => {
    expect(findHeaderRow([['제목'], ['주소', '차트 번호', '처방 코드']])).toBe(1)
    expect(findHeaderRow([['제목'], ['등록번호', '처방코드', '처방일자']])).toBe(1)
  })

  it('차트·등록번호와 처방코드가 함께 있어야 한다', () => {
    expect(findHeaderRow([['처방코드', '처방명칭'], ['차트번호', '주소']])).toBe(-1)
  })

  it('둘은 서로 다른 칸이어야 한다(제목 한 칸에 둘 다 있어도 머리줄 아님)', () => {
    expect(findHeaderRow([['차트번호별 처방코드 통계'], HEADER, BODY])).toBe(1)
  })

  it('위 20줄 안(20번째 줄까지)만 본다', () => {
    const filler = (n: number): Grid => Array.from({ length: n }, (_, i) => [`안내 ${i + 1}`])
    expect(findHeaderRow(tableWith(filler(19)))).toBe(19)
    expect(findHeaderRow(tableWith(filler(20)))).toBe(-1)
  })

  it('빈 표·숫자 칸만 있는 표 → -1', () => {
    expect(findHeaderRow([])).toBe(-1)
    expect(findHeaderRow([[1, 2, 3]])).toBe(-1)
  })
})

describe('AC-004.1 readPeriod — 머리줄 위의 기간 줄', () => {
  const periodOf = (above: Grid) => readPeriod(tableWith(above), above.length)

  it('가짜 파일의 기간 줄', () => {
    const grid = buildFakeBitTable().filter((row) => row.length > 0)
    expect(readPeriod(grid, findHeaderRow(grid))).toEqual({ from: '2026-09-01', to: '2026-10-24' })
  })

  it('기간 줄이 없으면 null', () => {
    const grid = buildFakeBitTable({ withPeriodLine: false }).filter((row) => row.length > 0)
    expect(readPeriod(grid, findHeaderRow(grid))).toBeNull()
    expect(periodOf([])).toBeNull()
  })

  it.each([
    ['기간: 2026-09-01 ~ 2026-10-24'],
    ['기간 : 2026.09.01 ~ 2026.10.24'],
    ['조회기간:2026/09/01~2026/10/24'],
    ['기간: 20260901 ~ 20261024'],
    ['기간: 2026-09-01 00:00 ~ 2026-10-24 23:59'],
  ])('여러 모양: %j', (line) => {
    expect(periodOf([['환자별 소모 통계'], [line]])).toEqual({ from: '2026-09-01', to: '2026-10-24' })
  })

  it('날짜가 다음 칸에 있어도 읽는다(엑셀 숫자 날짜 포함)', () => {
    expect(periodOf([['기간', '2026-09-01 ~ 2026-10-24']])).toEqual({ from: '2026-09-01', to: '2026-10-24' })
    expect(periodOf([['기간:', 46266, '~', 46319]])).toEqual({ from: '2026-09-01', to: '2026-10-24' })
  })

  it('하루짜리 기간', () => {
    expect(periodOf([['기간: 2026-10-24 ~ 2026-10-24']])).toEqual({ from: '2026-10-24', to: '2026-10-24' })
  })

  it.each([
    ['기간: 2026-10-24 ~ 2026-09-01'], // 시작 > 끝
    ['기간: 2026-09-01'], // 하나뿐
    ['기간: 2026-02-30 ~ 2026-03-01'], // 없는 날
    ['기간: 어제 ~ 오늘'],
  ])('못 읽으면 null: %j', (line) => {
    expect(periodOf([[line]])).toBeNull()
  })

  it('머리줄 아래 줄은 보지 않는다', () => {
    const grid: Grid = [HEADER, ['기간: 2026-09-01 ~ 2026-10-24'], BODY]
    expect(readPeriod(grid, 0)).toBeNull()
  })
})
