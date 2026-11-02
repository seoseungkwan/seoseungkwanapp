import { describe, expect, it } from 'vitest'
import { addDays } from '@/lib/analytics/dates'
import type { ClaimDayCount } from '@/lib/storage/claimCounts'
import type { DayCount } from '@/types/bridge'
import { buildDateList, checkPeriod, dayLabel, defaultPeriod, listRange, monthsIn, periodSummary, readRange, statusOf, toggleDay, unfinishedPeriod, weekPeriod } from './dateList'

// 날짜 목록(REQ-013, design.md 6-4)과 기간 계산. 숫자와 날짜뿐이다(환자 글자 없음)

const day = (date: string, visits: number, memoInBit = 0): DayCount => ({ date, visits, memoInBit })
/** 서버 건수 줄. visits는 그 줄을 올릴 때의 claim.dates 진료 수다: 끝난 날은 claim.dates와 같아야 한다(AC-013.1) */
const count = (visit_date: string, need_memo: number, entered: number, visits = 0, updated_at = `${visit_date}T02:00:00+00:00`): ClaimDayCount => ({
  visit_date,
  visits,
  need_memo,
  entered,
  needs_check: 0,
  skipped: 0,
  updated_at,
})

describe('AC-013.1 buildDateList', () => {
  it('AC-013.1: 진료 0건인 날을 뺀다', () => {
    expect(buildDateList([day('2026-11-01', 0), day('2026-11-02', 5)], []).map((r) => r.date)).toEqual(['2026-11-02'])
  })

  it('AC-013.1: 덜 끝난 날을 오래된 날부터, 다 끝난 날을 최근 날부터 놓는다', () => {
    const rows = buildDateList(
      [day('2026-10-24', 20), day('2026-10-26', 55), day('2026-10-27', 50), day('2026-10-28', 51), day('2026-10-29', 49), day('2026-11-03', 47)],
      [count('2026-10-24', 2, 2, 20), count('2026-10-26', 9, 9, 55), count('2026-10-27', 8, 8, 50), count('2026-10-28', 7, 2, 51), count('2026-11-03', 4, 0, 47)],
    )
    expect(rows.map((r) => [r.date, r.done])).toEqual([
      ['2026-10-28', false],
      ['2026-10-29', false], // 아직 불러오지 않은 날
      ['2026-11-03', false],
      ['2026-10-27', true],
      ['2026-10-26', true],
      ['2026-10-24', true],
    ])
  })

  it('AC-013.1: 날마다 진료 수·남은 수·마지막으로 바뀐 시각이 있다', () => {
    const [row] = buildDateList([day('2026-10-28', 51, 3)], [count('2026-10-28', 7, 2, 51, '2026-10-28T07:41:00+00:00')])
    expect(row).toEqual({ date: '2026-10-28', visits: 51, memoInBit: 3, needMemo: 7, entered: 2, left: 5, done: false, updatedAt: '2026-10-28T07:41:00+00:00' })
  })

  it('AC-013.1: 아직 불러오지 않은 날은 건수·시각이 비어 있고 덜 끝난 날이다', () => {
    const [row] = buildDateList([day('2026-10-29', 49, 1)], [])
    expect(row).toEqual({ date: '2026-10-29', visits: 49, memoInBit: 1, needMemo: null, entered: null, left: null, done: false, updatedAt: null })
  })

  it('AC-013.1: 메모 필요가 0인 날은 다 끝난 날이다', () => {
    const [row] = buildDateList([day('2026-10-29', 3)], [count('2026-10-29', 0, 0, 3)])
    expect(row).toMatchObject({ done: true, left: 0 })
  })

  it('AC-013.1: 도우미가 진료를 모르는 날의 서버 건수는 줄이 되지 않는다', () => {
    expect(buildDateList([], [count('2026-10-29', 3, 1)])).toEqual([])
  })
})

describe('AC-013.1 listRange: 최근 60일 + 남은 일이 있는 더 옛날(design.md 15절)', () => {
  it('AC-013.1: 기본은 오늘까지 60일이다', () => {
    expect(listRange('2026-11-04', [])).toEqual({ from: '2026-09-06', to: '2026-11-04' })
  })

  it('AC-013.1: 남은 일이 있는 더 옛날까지 넓힌다. 다 끝난 옛날은 넓히지 않는다', () => {
    expect(listRange('2026-11-04', [count('2026-07-01', 3, 3), count('2026-08-01', 3, 1)])).toEqual({ from: '2026-08-01', to: '2026-11-04' })
  })

  it('AC-013.1: claim.dates 한도 400일을 넘지 않는다', () => {
    expect(listRange('2026-11-04', [count('2024-01-01', 3, 1)])).toEqual({ from: '2025-10-01', to: '2026-11-04' })
  })
})

describe('AC-013.2 checkPeriod: 달을 넘겨도 되고 35일 이하만', () => {
  it('AC-013.2: 달을 넘긴 기간은 된다', () => {
    expect(checkPeriod({ from: '2026-10-30', to: '2026-11-02' })).toBeNull()
  })

  it('AC-013.2: 시작·끝을 함께 세어 35일까지 된다(36일은 안 된다)', () => {
    expect(checkPeriod({ from: '2026-10-01', to: '2026-11-04' })).toBeNull()
    expect(checkPeriod({ from: '2026-10-01', to: '2026-11-05' })).toBe('한 번에 35일까지 고를 수 있어요.')
  })

  it('AC-013.2: 하루도 된다', () => {
    expect(checkPeriod({ from: '2026-10-28', to: '2026-10-28' })).toBeNull()
  })

  it('AC-013.2: 비었거나 시작이 늦으면 안내한다', () => {
    expect(checkPeriod({ from: '', to: '2026-10-28' })).toBe('날짜를 골라 주세요')
    expect(checkPeriod({ from: '2026-10-28', to: '' })).toBe('날짜를 골라 주세요')
    expect(checkPeriod({ from: '2026-10-29', to: '2026-10-28' })).toBe('기간의 시작일이 종료일보다 늦습니다.')
  })
})

describe('AC-013.13 readRange: 시작과 끝의 한 달 전 같은 날 가운데 빠른 날부터 끝까지 읽는다', () => {
  it('AC-013.13: 하루만 골라도 한 달 전부터 읽는다', () => {
    expect(readRange({ from: '2026-10-28', to: '2026-10-28' })).toEqual({ from: '2026-09-28', to: '2026-10-28' })
  })

  it('AC-013.13: 시작이 더 빠르면 시작부터다', () => {
    expect(readRange({ from: '2026-09-20', to: '2026-10-20' })).toEqual({ from: '2026-09-20', to: '2026-10-20' })
  })

  it('AC-013.13: 그달에 그 날이 없으면 말일', () => {
    expect(readRange({ from: '2026-03-31', to: '2026-03-31' })).toEqual({ from: '2026-02-28', to: '2026-03-31' })
  })

  it('AC-013.13: 고를 수 있는 기간이면 읽는 기간도 늘 35일 안이다', () => {
    for (const { from, to } of [
      { from: '2026-10-01', to: '2026-11-04' },
      { from: '2026-03-31', to: '2026-03-31' },
      { from: '2026-07-31', to: '2026-08-31' },
    ]) {
      expect(checkPeriod({ from, to })).toBeNull()
      expect(checkPeriod(readRange({ from, to }))).toBeNull()
    }
  })
})

describe('AC-013.2 입력 칸에 연도를 치는 중간 값', () => {
  // 크롬의 날짜 칸은 연도를 칠 때마다 값을 바꾼다. isYmd는 100년 앞과 다섯 자리 연도를 거짓으로 본다(dates.test.ts AC-002.1)
  const BAD = ['0002-10-28', '0020-10-28', '202610-10-29']

  it.each(BAD)('AC-013.2: %s는 던지지 않고 날짜를 고르라고 한다(시작·끝 어느 쪽이든)', (bad) => {
    expect(checkPeriod({ from: bad, to: '2026-10-29' })).toBe('날짜를 골라 주세요')
    expect(checkPeriod({ from: '2026-10-28', to: bad })).toBe('날짜를 골라 주세요')
  })

  it('AC-013.2: 100년 이후의 먼 연도(0202)는 날짜가 맞아 던지지 않고 35일 안내다', () => {
    expect(checkPeriod({ from: '0202-10-28', to: '2026-10-29' })).toBe('한 번에 35일까지 고를 수 있어요.')
  })

  it.each(BAD)('목업: 기간이 %s일 때 표를 체크하면 그 날 하루다(던지지 않는다)', (bad) => {
    expect(toggleDay({ from: bad, to: '2026-10-29' }, '2026-10-28')).toEqual({ from: '2026-10-28', to: '2026-10-28' })
    expect(toggleDay({ from: '2026-10-27', to: bad }, '2026-10-28')).toEqual({ from: '2026-10-28', to: '2026-10-28' })
  })
})

describe('AC-013.13 monthsIn: store.load는 고른 기간의 달만 묻는다', () => {
  it('AC-013.13: 고른 기간의 달들, 이른 달부터', () => {
    expect(monthsIn({ from: '2026-10-30', to: '2026-11-02' })).toEqual(['2026-10', '2026-11'])
    expect(monthsIn({ from: '2026-10-28', to: '2026-10-28' })).toEqual(['2026-10'])
  })
})

describe('기간 고르기 단추(목업 화면 2)', () => {
  const rows = buildDateList(
    [day('2026-10-27', 50), day('2026-10-28', 51), day('2026-10-29', 49), day('2026-11-03', 47)],
    [count('2026-10-27', 8, 8, 50), count('2026-10-28', 7, 2, 51)],
  )

  it('[입력 안 된 날짜 모두]: 덜 끝난 첫 날부터 끝 날까지', () => {
    expect(unfinishedPeriod(rows)).toEqual({ from: '2026-10-28', to: '2026-11-03' })
    expect(unfinishedPeriod([])).toBeNull()
  })

  it('AC-013.2: 건수 표가 없어 60일이 모두 덜 끝난 날이면 [입력 안 된 날짜 모두]도 처음 기간과 같이 앞에서 35일이다', () => {
    const sixty = buildDateList(
      Array.from({ length: 60 }, (_, i) => day(addDays('2026-09-01', i), 1)),
      [],
    )
    const period = unfinishedPeriod(sixty)
    expect(period).toEqual({ from: '2026-09-01', to: '2026-10-05' })
    expect(checkPeriod(period!)).toBeNull()
    expect(defaultPeriod(sixty, '2026-10-31')).toEqual(period)
  })

  it('처음 기간은 덜 끝난 날 전체다. 35일을 넘으면 앞에서 35일이다', () => {
    expect(defaultPeriod(rows, '2026-11-04')).toEqual({ from: '2026-10-28', to: '2026-11-03' })
    const far = buildDateList([day('2026-08-01', 1), day('2026-11-03', 1)], [])
    expect(defaultPeriod(far, '2026-11-04')).toEqual({ from: '2026-08-01', to: '2026-09-04' })
  })

  it('처음 기간: 덜 끝난 날이 없으면 오늘 하루다', () => {
    expect(defaultPeriod([], '2026-11-04')).toEqual({ from: '2026-11-04', to: '2026-11-04' })
  })

  it('[이번 주]·[지난주]: 월~일', () => {
    expect(weekPeriod('2026-11-04', 0)).toEqual({ from: '2026-11-02', to: '2026-11-08' })
    expect(weekPeriod('2026-11-04', -1)).toEqual({ from: '2026-10-26', to: '2026-11-01' })
  })

  it('표의 체크: 기간 밖 날을 고르면 그 날까지 넓힌다', () => {
    expect(toggleDay({ from: '2026-10-28', to: '2026-10-29' }, '2026-11-03')).toEqual({ from: '2026-10-28', to: '2026-11-03' })
    expect(toggleDay({ from: '2026-10-28', to: '2026-10-29' }, '2026-10-27')).toEqual({ from: '2026-10-27', to: '2026-10-29' })
  })

  it('표의 체크: 기간 안 날을 풀면 가까운 쪽 끝을 그 날 다음으로 당긴다', () => {
    expect(toggleDay({ from: '2026-10-28', to: '2026-11-03' }, '2026-10-28')).toEqual({ from: '2026-10-29', to: '2026-11-03' })
    expect(toggleDay({ from: '2026-10-28', to: '2026-11-03' }, '2026-11-03')).toEqual({ from: '2026-10-28', to: '2026-11-02' })
    expect(toggleDay({ from: '2026-10-28', to: '2026-11-03' }, '2026-10-29')).toEqual({ from: '2026-10-30', to: '2026-11-03' })
  })

  it('표의 체크: 하루만 남은 기간은 그대로다', () => {
    expect(toggleDay({ from: '2026-10-28', to: '2026-10-28' }, '2026-10-28')).toEqual({ from: '2026-10-28', to: '2026-10-28' })
  })

  it('표의 체크: 기간이 비었으면 그 날 하루다', () => {
    expect(toggleDay({ from: '', to: '' }, '2026-10-28')).toEqual({ from: '2026-10-28', to: '2026-10-28' })
  })
})

describe('기간 요약·글자(목업 화면 2)', () => {
  const rows = buildDateList(
    [day('2026-10-28', 51), day('2026-10-29', 49), day('2026-11-03', 47), day('2026-11-20', 9)],
    [count('2026-10-28', 7, 2), count('2026-11-03', 4, 0)],
  )

  it('고른 기간의 진료한 날·환자·메모 필요를 더하고 달마다 날 수를 센다', () => {
    expect(periodSummary(rows, { from: '2026-10-28', to: '2026-11-03' })).toEqual({
      days: 3,
      visits: 147,
      needMemo: 11,
      months: [
        { month: 10, days: 2 },
        { month: 11, days: 1 },
      ],
    })
  })

  it('불러온 날이 하나도 없으면 메모 필요는 null이다(0으로 보이지 않게)', () => {
    expect(periodSummary(rows, { from: '2026-10-29', to: '2026-10-29' }).needMemo).toBeNull()
  })

  it('날짜 글자는 10/28 (수) 모양이다', () => {
    expect(dayLabel('2026-10-28')).toBe('10/28 (수)')
    expect(dayLabel('2026-11-03')).toBe('11/3 (화)')
  })

  it('상태 글자는 입력 전·진행중 n/m·완료다', () => {
    const [partial, notLoaded, zero] = buildDateList([day('2026-10-28', 5), day('2026-10-29', 5), day('2026-10-30', 5)], [count('2026-10-28', 7, 2), count('2026-10-30', 6, 0)])
    expect(statusOf(partial)).toEqual({ label: '진행중 2/7', tone: 'accent' })
    expect(statusOf(notLoaded)).toEqual({ label: '입력 전', tone: 'neutral' })
    expect(statusOf(zero)).toEqual({ label: '입력 전', tone: 'neutral' })
    expect(statusOf(buildDateList([day('2026-10-30', 5)], [count('2026-10-30', 6, 6, 5)])[0])).toEqual({ label: '완료', tone: 'positive' })
  })
})

describe('AC-013.1 끝난 날은 진료 수까지 claim.dates와 같아야 한다', () => {
  it('AC-013.1: 3/3이고 올린 진료 수 3과 claim.dates 3이 같으면 끝난 날이다', () => {
    expect(buildDateList([day('2026-10-28', 3)], [count('2026-10-28', 3, 3, 3)])[0]).toMatchObject({ done: true, left: 0 })
  })

  it('AC-013.1: 3/3이어도 claim.dates가 23이면(오후에 온 환자) 덜 끝난 날이고 [입력 안 된 날짜 모두]에 든다', () => {
    const rows = buildDateList([day('2026-10-27', 5), day('2026-10-28', 23)], [count('2026-10-27', 2, 2, 5), count('2026-10-28', 3, 3, 3)])
    expect(rows.map((row) => [row.date, row.done])).toEqual([
      ['2026-10-28', false],
      ['2026-10-27', true],
    ])
    expect(rows[0].left).toBe(0)
    expect(unfinishedPeriod(rows)).toEqual({ from: '2026-10-28', to: '2026-10-28' })
    expect(statusOf(rows[0]).label).not.toBe('완료')
  })

  it('AC-013.1: 0/0·진료 5인데 claim.dates가 6이면 덜 끝난 날이다', () => {
    expect(buildDateList([day('2026-10-28', 6)], [count('2026-10-28', 0, 0, 5)])[0].done).toBe(false)
  })

  it('AC-013.1: 올릴 때 진료 수를 묻지 못했으면(0) 덜 끝난 날이다', () => {
    expect(buildDateList([day('2026-10-28', 6)], [count('2026-10-28', 3, 3, 0)])[0].done).toBe(false)
  })

  it('AC-013.1: 진료 수가 줄어도 다르면 덜 끝난 날이다(취소). 수가 그대로인 변화는 잡지 못한다(알려진 한계)', () => {
    expect(buildDateList([day('2026-10-28', 4)], [count('2026-10-28', 3, 3, 5)])[0].done).toBe(false)
    expect(buildDateList([day('2026-10-28', 5)], [count('2026-10-28', 3, 3, 5)])[0].done).toBe(true)
  })
})

describe('AC-013.2 [입력 안 된 날짜 모두]가 진짜 건수를 따른다', () => {
  const DATES = ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24']
  const list = (counts: ClaimDayCount[]) =>
    buildDateList(
      DATES.map((date) => day(date, 10)),
      counts,
    )

  it('AC-013.2: 앞쪽 끝난 날을 건너뛰어 덜 끝난 첫 날부터다. 건수가 없으면(비교) 맨 앞날부터다', () => {
    expect(unfinishedPeriod(list([]))).toEqual({ from: '2026-10-20', to: '2026-10-24' })
    expect(unfinishedPeriod(list([count('2026-10-20', 3, 3, 10), count('2026-10-21', 0, 0, 10), count('2026-10-22', 5, 2, 10), count('2026-10-23', 4, 4, 10)]))).toEqual({ from: '2026-10-22', to: '2026-10-24' })
  })

  it('AC-013.2: 끝쪽 끝난 날은 기간 끝에서도 빠진다', () => {
    expect(unfinishedPeriod(list([count('2026-10-20', 3, 1, 10), count('2026-10-21', 1, 1, 10), count('2026-10-22', 1, 0, 10), count('2026-10-23', 4, 4, 10), count('2026-10-24', 4, 4, 10)]))).toEqual({ from: '2026-10-20', to: '2026-10-22' })
  })

  it('AC-013.2: 모두 끝나면 null이고 처음 기간은 오늘 하루다', () => {
    const rows = list(DATES.map((date) => count(date, 2, 2, 10)))
    expect(unfinishedPeriod(rows)).toBeNull()
    expect(defaultPeriod(rows, '2026-11-02')).toEqual({ from: '2026-11-02', to: '2026-11-02' })
  })

  it('AC-013.2: 35일로 자를 때도 끝난 날 뒤의 덜 끝난 첫 날부터 센다', () => {
    const dates = Array.from({ length: 60 }, (_, i) => addDays('2026-09-01', i))
    const rows = buildDateList(
      dates.map((date) => day(date, 1)),
      dates.slice(0, 10).map((date) => count(date, 1, 1, 1)),
    )
    expect(unfinishedPeriod(rows)).toEqual({ from: '2026-09-11', to: '2026-10-15' })
  })
})
