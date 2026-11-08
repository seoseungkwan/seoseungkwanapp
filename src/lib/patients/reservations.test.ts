import { describe, expect, it } from 'vitest'
import { BridgeError } from '@/lib/bridge/protocol'
import {
  copyRows,
  countOn,
  dayTitle,
  firstPick,
  inPickRange,
  missed,
  missedPaste,
  missedRange,
  missedSummaryText,
  noPhone,
  readReservations,
  reservationPaste,
  reservationRange,
  shortDay,
  timeLabel,
  upcoming,
} from './reservations'

// 예약 문자 명단 계산(spec patients-bit-lists REQ-2803). 이름·전화·차트번호·날짜는 모두 지어낸 값이다.
// 오늘은 2026-11-06 금요일이다(시안과 같다)

const TODAY = '2026-11-06'
const TOMORROW = '2026-11-07' // 토
const AFTER = '2026-11-08' // 일

const CHART = (i: number) => `5550${String(i).padStart(4, '0')}`
const PHONE = (i: number) => `010-0000-${String(i).padStart(4, '0')}`

type Raw = [string | null, string | null, string, string, string, string | null, 0 | 1, string | null]
type More = { status?: string; rsv?: string | null; came?: 0 | 1; after?: string | null }
// 도우미 줄: [차트번호, 이름, 전화, 예약 시각, 상태, 예약 표시, 그날 옴, 그 뒤 처음 온 날]
const raw = (chart: string | null, name: string | null, phone: string, at: string, more: More = {}): Raw => [
  chart,
  name,
  phone,
  at,
  more.status ?? 'WR',
  more.rsv ?? null,
  more.came ?? 0,
  more.after ?? null,
]
const person = (i: number, name: string, at: string, more: More = {}) => raw(CHART(i), name, PHONE(i), at, more)

const reply = (rows: unknown[], over: Record<string, unknown> = {}) => ({ v: 1, kind: 'reservation', from: '2026-10-07', to: '2026-11-20', today: TODAY, rows, ...over })
const data = (rows: Raw[]) => readReservations(reply(rows))
const bad = (json: unknown) => {
  try {
    readReservations(json)
  } catch (error) {
    return error instanceof BridgeError ? error.code : 'other'
  }
  return 'none'
}

describe('AC-2802.2 읽는 기간', () => {
  it('AC-2802.2: 예약은 오늘−30일 ~ 오늘+14일을 읽는다', () => {
    expect(reservationRange(TODAY)).toEqual({ from: '2026-10-07', to: '2026-11-20' })
    expect(reservationRange('2026-03-01')).toEqual({ from: '2026-01-30', to: '2026-03-15' })
  })
})

describe('AC-2801.2 readReservations: 도우미 답 모양', () => {
  it('AC-2801.2: 줄을 예약 모양으로 읽는다(날짜는 YYYY-MM-DD, 없는 이름·전화는 빈 글, 열쇠는 s|차트번호|예약 시각)', () => {
    const d = readReservations(
      reply([
        raw(CHART(1), '김가상', PHONE(1), '202611070900'),
        raw(null, null, '', '202611071430', { status: 'CR', rsv: 'OC', came: 1, after: '20261109' }),
      ]),
    )
    expect(d).toEqual({
      from: '2026-10-07',
      to: '2026-11-20',
      today: TODAY,
      rows: [
        { key: `s|${CHART(1)}|202611070900`, chart: CHART(1), name: '김가상', phone: PHONE(1), at: '202611070900', day: '2026-11-07', status: 'WR', rsv: null, came: false, cameAfter: null },
        { key: 's||202611071430', chart: null, name: '', phone: '', at: '202611071430', day: '2026-11-07', status: 'CR', rsv: 'OC', came: true, cameAfter: '2026-11-09' },
      ],
    })
  })

  it('AC-2801.2: 이름·전화의 앞뒤 빈칸을 떼고, 빈 차트번호는 없는 것으로 본다', () => {
    const [row] = data([raw('  ', ' 김가상 ', ' 010-0000-0001 ', '202611070900')]).rows
    expect(row).toMatchObject({ key: 's||202611070900', chart: null, name: '김가상', phone: '010-0000-0001' })
  })

  it('AC-2801.2: 같은 열쇠(차트번호·예약 시각)가 또 오면 뒤에 |2·|3을 붙여 줄 열쇠가 겹치지 않는다', () => {
    const d = data([
      raw(null, '이름만', '', '202611070900'),
      raw(null, '또이름만', '', '202611070900'),
      person(1, '김가상', '202611070900'),
      person(1, '김가상', '202611070900'),
      raw(null, '셋째', '', '202611070900'),
    ])
    expect(d.rows.map((row) => row.key)).toEqual([
      's||202611070900',
      's||202611070900|2',
      `s|${CHART(1)}|202611070900`,
      `s|${CHART(1)}|202611070900|2`,
      's||202611070900|3',
    ])
  })

  it('AC-2801.2: 줄이 없어도 맞는 답이다', () => {
    expect(data([]).rows).toEqual([])
  })

  it('AC-2801.2: 물어본 기간과 다른 답은 쓰지 않는다', () => {
    const json = reply([person(1, '김가상', '202611070900')])
    expect(readReservations(json, { from: '2026-10-07', to: '2026-11-20' }).rows).toHaveLength(1)
    expect(() => readReservations(json, { from: '2026-10-08', to: '2026-11-20' })).toThrow(BridgeError)
    expect(() => readReservations(json, { from: '2026-10-07', to: '2026-11-19' })).toThrow(BridgeError)
  })

  const GOOD = person(1, '김가상', '202611070900')
  const withCell = (i: number, value: unknown) => {
    const row: unknown[] = [...GOOD]
    row[i] = value
    return reply([row])
  }
  it.each<[string, unknown]>([
    ['답이 객체가 아님', [GOOD]],
    ['답이 null', null],
    ['v가 1이 아님', reply([GOOD], { v: 2 })],
    ['kind가 다름', reply([GOOD], { kind: 'lapsed' })],
    ['from이 날짜가 아님', reply([GOOD], { from: '20261007' })],
    ['to가 from보다 앞', reply([GOOD], { from: '2026-11-21' })],
    ['today가 없음', reply([GOOD], { today: undefined })],
    ['rows가 목록이 아님', reply([GOOD], { rows: {} })],
    ['줄이 목록이 아님', reply([{}])],
    ['칸이 일곱', reply([GOOD.slice(0, 7)])],
    ['칸이 아홉', reply([[...GOOD, 'x']])],
    ['차트번호가 숫자', withCell(0, 55500001)],
    ['이름이 숫자', withCell(1, 1)],
    ['전화가 null', withCell(2, null)],
    ['예약 시각이 11자리', withCell(3, '20261107090')],
    ['예약 시각이 25시', withCell(3, '202611072500')],
    ['예약 시각이 60분', withCell(3, '202611070960')],
    ['예약 시각이 없는 날', withCell(3, '202611310900')],
    ['상태가 null', withCell(4, null)],
    ['예약 표시가 숫자', withCell(5, 1)],
    ['그날 옴이 2', withCell(6, 2)],
    ['그날 옴이 true', withCell(6, true)],
    ['그 뒤 처음 온 날이 YYYY-MM-DD', withCell(7, '2026-11-09')],
    ['그 뒤 처음 온 날이 없는 날', withCell(7, '20261131')],
  ])('AC-2801.2: %s면 E-BRIDGE-BAD-REPLY', (_label, json) => {
    expect(bad(json)).toBe('E-BRIDGE-BAD-REPLY')
  })
})

describe('AC-2803.1 upcoming: 고른 날 문자 보낼 예약', () => {
  const D = data([
    person(1, '박나래', '202611071430'),
    person(2, '김가상', '202611070900', { status: 'NR' }),
    person(3, '이다솜', '202611071430', { rsv: 'OS' }),
    person(4, '최취소', '202611071000', { status: 'CR' }),
    person(5, '정오씨', '202611071100', { rsv: 'OC' }),
    person(6, '강접수', '202611071130', { status: 'WN', rsv: 'OS', came: 1 }),
    person(7, '조모레', '202611080900'),
    person(8, '윤어제', '202611050900'),
  ])

  it('AC-2803.1: 그 날 예약 중 상태가 WR·NR이고 예약 표시가 OC가 아닌 줄만, 예약 시각 → 이름 차례다', () => {
    expect(upcoming(D, TOMORROW).map((row) => [row.time, row.name])).toEqual([
      ['오전 9:00', '김가상'],
      ['오후 2:30', '박나래'],
      ['오후 2:30', '이다솜'],
    ])
    expect(upcoming(D, AFTER).map((row) => row.name)).toEqual(['조모레'])
    expect(upcoming(D, '2026-11-09')).toEqual([])
  })

  it('AC-2803.1: 줄 모양은 열쇠·시각·이름·전화·보냄뿐이다', () => {
    expect(upcoming(D, AFTER)).toEqual([{ key: `s|${CHART(7)}|202611080900`, time: '오전 9:00', name: '조모레', phone: PHONE(7), sent: false }])
  })

  it.each([
    ['202611070900', '오전 9:00'],
    ['202611071430', '오후 2:30'],
    ['202611071200', '오후 12:00'],
    ['202611071159', '오전 11:59'],
    ['202611072005', '오후 8:05'],
    ['202611070030', '오전 0:30'],
  ])('AC-2803.1: 시각 글 %s → %s', (at, label) => {
    expect(timeLabel(at)).toBe(label)
  })

  it('AC-2803.1: 이름·번호가 없으면 빈 글이다(화면이 이름 없음·번호 없음으로 그린다)', () => {
    const rows = upcoming(data([raw(null, null, '', '202611070900')]), TOMORROW)
    expect(rows).toEqual([{ key: 's||202611070900', time: '오전 9:00', name: '', phone: '', sent: false }])
  })

  it('AC-2803.1: [직접] 날짜는 오늘 ~ 오늘+14일만 받는다', () => {
    expect(inPickRange(TODAY, TODAY)).toBe(true)
    expect(inPickRange('2026-11-20', TODAY)).toBe(true)
    expect(inPickRange('2026-11-21', TODAY)).toBe(false)
    expect(inPickRange('2026-11-05', TODAY)).toBe(false)
    expect(inPickRange('2026-11-31', TODAY)).toBe(false)
    expect(inPickRange('', TODAY)).toBe(false)
  })

  it('AC-2803.8: 보냄 표시(도우미 저장의 같은 열쇠)가 있는 줄은 sent다', () => {
    const marks = { [`s|${CHART(1)}|202611071430`]: '2026-11-06' }
    expect(upcoming(D, TOMORROW, marks).map((row) => [row.name, row.sent])).toEqual([
      ['김가상', false],
      ['박나래', true],
      ['이다솜', false],
    ])
  })

  it('AC-2803.8: 원형 없는 표시 표에서도 읽고, 열쇠가 __proto__여도 그냥 값이다', () => {
    const marks = Object.create(null) as Record<string, string>
    marks[`s|${CHART(7)}|202611080900`] = '2026-11-06'
    expect(upcoming(D, AFTER, marks)[0]?.sent).toBe(true)
    expect(upcoming(D, TOMORROW, {})[0]?.sent).toBe(false)
  })
})

describe('AC-2803.0 날짜 단추 인원수와 처음 고를 날', () => {
  it('AC-2803.0: 날짜 단추 인원수는 그 날 문자 보낼 예약 수다(취소·OC·온 접수는 세지 않는다)', () => {
    const d = data([
      person(1, '김가상', '202611070900'),
      person(2, '이나래', '202611071000', { status: 'NR' }),
      person(3, '박다솜', '202611071100', { status: 'CR' }),
      person(4, '최라온', '202611071200', { rsv: 'OC' }),
      person(5, '정마루', '202611071300', { status: 'WN', came: 1 }),
      person(6, '강바다', '202611081000'),
    ])
    expect(countOn(d, TOMORROW)).toBe(2)
    expect(countOn(d, AFTER)).toBe(1)
    expect(countOn(d, '2026-11-09')).toBe(0)
  })

  it('AC-2803.0: 내일 예약이 있으면 내일이고 안내가 없다', () => {
    const d = data([person(1, '김가상', '202611070900'), person(2, '이나래', '202611080900')])
    expect(firstPick(d, TODAY)).toEqual({ preset: 'tomorrow', day: TOMORROW, note: null })
  })

  it('AC-2803.0: 내일이 없고 모레가 있으면 모레이고 안내 글이 있다', () => {
    const d = data([person(2, '이나래', '202611081400')])
    expect(firstPick(d, TODAY)).toEqual({
      preset: 'after',
      day: AFTER,
      note: '내일은 예약이 없어 예약이 있는 가장 가까운 날(11월 8일 (일))을 먼저 골랐어요.',
    })
  })

  it('AC-2803.0: 둘 다 없으면 오늘+14일 안에서 예약이 있는 가장 가까운 날을 [직접]으로 고른다', () => {
    const d = data([person(1, '김가상', '202611201000'), person(2, '이나래', '202611111000'), person(3, '박다솜', '202611091000', { status: 'CR' })])
    expect(firstPick(d, TODAY)).toEqual({
      preset: 'custom',
      day: '2026-11-11',
      note: '내일은 예약이 없어 예약이 있는 가장 가까운 날(11월 11일 (수))을 먼저 골랐어요.',
    })
  })

  it('AC-2803.0: 내일에 취소된 예약만 있으면 없는 날로 본다', () => {
    const d = data([person(1, '김가상', '202611070900', { status: 'CR' }), person(2, '이나래', '202611080900')])
    expect(firstPick(d, TODAY).preset).toBe('after')
  })

  it('AC-2803.0: 14일 안에 하나도 없으면 내일이고 안내가 없다(15일 뒤 예약은 보지 않는다)', () => {
    expect(firstPick(data([person(1, '김가상', '202611211000')]), TODAY)).toEqual({ preset: 'tomorrow', day: TOMORROW, note: null })
    expect(firstPick(data([]), TODAY)).toEqual({ preset: 'tomorrow', day: TOMORROW, note: null })
  })

  it('AC-2803.0: 오늘 예약은 처음 고를 날이 아니다', () => {
    expect(firstPick(data([person(1, '김가상', '202611061500')]), TODAY)).toEqual({ preset: 'tomorrow', day: TOMORROW, note: null })
  })
})

describe('AC-2803.2 명단 복사', () => {
  const D = data([
    person(1, '김가상', '202611070900'),
    person(2, '이나래', '202611071000'),
    raw(CHART(3), '박번호없음', '', '202611071100'),
    person(4, '최라온', '202611071400'),
  ])
  const marks = { [`s|${CHART(2)}|202611071000`]: '2026-11-06' }
  const rows = upcoming(D, TOMORROW, marks)

  it('AC-2803.2: 복사할 줄은 번호 있는 분이고, 안 보낸 분만이면 보냄 표시가 없는 분만이다', () => {
    expect(copyRows(rows, false).map((row) => row.name)).toEqual(['김가상', '이나래', '최라온'])
    expect(copyRows(rows, true).map((row) => row.name)).toEqual(['김가상', '최라온'])
  })

  it('AC-2803.2: 네 칸 탭 글 이름·전화·이름·예약 시각이고, 날짜 제목 줄을 넣으면 맨 위에 YYYY-MM-DD (요일) — N명(복사한 수)', () => {
    const copied = copyRows(rows, true)
    expect(reservationPaste(copied, true, TOMORROW)).toBe(
      ['2026-11-07 (토) — 2명\t\t\t', `김가상\t${PHONE(1)}\t김가상\t오전 9:00`, `최라온\t${PHONE(4)}\t최라온\t오후 2:00`].join('\n'),
    )
    expect(reservationPaste(copied, false, TOMORROW)).toBe([`김가상\t${PHONE(1)}\t김가상\t오전 9:00`, `최라온\t${PHONE(4)}\t최라온\t오후 2:00`].join('\n'))
  })

  it('AC-2803.2: 번호 없는 분은 붙여 넣는 글에서도 빠진다', () => {
    expect(reservationPaste(rows, false, TOMORROW)).not.toContain('박번호없음')
    expect(reservationPaste(rows, true, TOMORROW).split('\n')[0]).toBe('2026-11-07 (토) — 3명\t\t\t')
  })

  it('AC-2803.2: 모두 번호가 없거나 줄이 없으면 빈 글이다(날짜 제목 줄도 없다)', () => {
    const onlyNoPhone = upcoming(data([raw(CHART(3), '박번호없음', '', '202611071100')]), TOMORROW)
    expect(copyRows(onlyNoPhone, false)).toEqual([])
    expect(reservationPaste(onlyNoPhone, true, TOMORROW)).toBe('')
    expect(reservationPaste([], true, TOMORROW)).toBe('')
  })

  it('AC-2803.2: 모두 보냈으면 안 보낸 분만 복사할 줄이 없다(번호 있는 분은 있다)', () => {
    const all = Object.fromEntries(rows.map((row) => [row.key, '2026-11-06']))
    const sentRows = upcoming(D, TOMORROW, all)
    expect(copyRows(sentRows, true)).toEqual([])
    expect(copyRows(sentRows, false)).toHaveLength(3)
  })
})

describe('AC-2803.9 번호 없는 분', () => {
  it('AC-2803.9: 고른 날 줄 중 번호 없는 분을 표 차례로 고른다. 모두 있으면 빈 목록이다', () => {
    const rows = upcoming(
      data([person(1, '김가상', '202611070900'), raw(CHART(2), '이번호없음', '', '202611071500'), raw(null, null, '', '202611071000')]),
      TOMORROW,
    )
    expect(noPhone(rows).map((row) => [row.name, row.time])).toEqual([
      ['', '오전 10:00'],
      ['이번호없음', '오후 3:00'],
    ])
    expect(noPhone(upcoming(data([person(1, '김가상', '202611070900')]), TOMORROW))).toEqual([])
  })
})

describe('AC-2803.5 지난 예약 · 안 오신 분', () => {
  const PAST = data([
    person(11, '이나래', '202611051700', { status: 'CR' }),
    person(12, '박마루', '202611041500', { status: 'CR', after: '20261105' }),
    person(20, '김다솜', '202611041500', { status: 'CR' }),
    person(13, '최바다', '202611040930'),
    raw(CHART(14), '정사랑', '', '202611031830', { status: 'CR' }),
    person(15, '강아름', '202611021100', { status: 'WN', rsv: 'OS', came: 1 }),
    person(16, '조하늘', '202610301630', { rsv: 'OC' }),
    person(17, '윤자람', '202610291400', { status: 'CR' }),
    person(18, '장라온', '202611060900', { status: 'WN', came: 1 }),
    person(19, '임가상', '202611041500', { status: 'CR', came: 1 }),
    person(21, '한오늘', '202611061600'),
  ])

  it('AC-2803.5: 지난 7일·30일은 어제까지다', () => {
    expect(missedRange(TODAY, 7)).toEqual({ from: '2026-10-30', to: '2026-11-05' })
    expect(missedRange(TODAY, 30)).toEqual({ from: '2026-10-07', to: '2026-11-05' })
  })

  it('AC-2803.5: 그 기간 예약 중 그날 옴이 0인 줄을 예약한 때가 늦은 차례(같으면 이름)로 고른다', () => {
    const { rows } = missed(PAST, missedRange(TODAY, 7), false)
    expect(rows.map((row) => [row.day, row.time, row.name])).toEqual([
      ['2026-11-05', '오후 5:00', '이나래'],
      ['2026-11-04', '오후 3:00', '김다솜'],
      ['2026-11-04', '오후 3:00', '박마루'],
      ['2026-11-04', '오전 9:30', '최바다'],
      ['2026-11-03', '오후 6:30', '정사랑'],
      ['2026-10-30', '오후 4:30', '조하늘'],
    ])
  })

  it('AC-2803.5: 비트 표시는 CR이거나 OC면 예약 취소, WR·NR이면 예약 그대로이고, 그 뒤 처음 온 날이 있다', () => {
    const { rows } = missed(PAST, missedRange(TODAY, 7), false)
    expect(rows.map((row) => [row.name, row.mark, row.after])).toEqual([
      ['이나래', '예약 취소', null],
      ['김다솜', '예약 취소', null],
      ['박마루', '예약 취소', '2026-11-05'],
      ['최바다', '예약 그대로', null],
      ['정사랑', '예약 취소', null],
      ['조하늘', '예약 취소', null],
    ])
  })

  it('AC-2803.5: NR도 예약 그대로이고, 다른 상태는 예약 취소로 본다', () => {
    const d = data([person(1, '김가상', '202611041000', { status: 'NR' }), person(2, '이나래', '202611041100', { status: 'CN' })])
    expect(missed(d, missedRange(TODAY, 7), false).rows.map((row) => [row.name, row.mark])).toEqual([
      ['이나래', '예약 취소'],
      ['김가상', '예약 그대로'],
    ])
  })

  it('AC-2803.5: 아직 안 오신 분만이면 그 뒤 처음 온 날이 있는 줄은 빠진다', () => {
    const { rows } = missed(PAST, missedRange(TODAY, 7), true)
    expect(rows.map((row) => row.name)).toEqual(['이나래', '김다솜', '최바다', '정사랑', '조하늘'])
  })

  it('AC-2803.5: 줄 모양은 열쇠·날·시각·이름·전화·비트 표시·그 뒤뿐이다', () => {
    const [first] = missed(PAST, missedRange(TODAY, 7), false).rows
    expect(first).toEqual({ key: `s|${CHART(11)}|202611051700`, day: '2026-11-05', time: '오후 5:00', name: '이나래', phone: PHONE(11), mark: '예약 취소', after: null })
  })

  it('AC-2803.5: 날짜 글: M월 D일 (요일) · M월 D일', () => {
    expect(dayTitle('2026-11-05')).toBe('11월 5일 (목)')
    expect(dayTitle('2026-10-30')).toBe('10월 30일 (금)')
    expect(shortDay('2026-11-05')).toBe('11월 5일')
  })

  it('AC-2803.6: 예약 N건 중 안 오신 분 M건 · P% · 아직 안 오신 분 K명(아직 안 오신 분만과 상관없이 같다)', () => {
    const all = missed(PAST, missedRange(TODAY, 7), false).summary
    expect(all).toEqual({ total: 8, missed: 6, percent: 75, notYet: 5 })
    expect(missed(PAST, missedRange(TODAY, 7), true).summary).toEqual(all)
    expect(missedSummaryText(all)).toBe('예약 8건 중 안 오신 분 6건 · 75% · 아직 안 오신 분 5명')
  })

  it.each([
    [8, 1, 13],
    [3, 1, 33],
    [3, 2, 67],
    [5, 0, 0],
    [5, 5, 100],
    [200, 1, 1],
  ])('AC-2803.6: 예약 %i건 중 %i건이면 %i%(반올림)', (total, count, percent) => {
    const rows = Array.from({ length: total }, (_, i) => person(i + 1, `가상${i}`, '202611041000', { came: i < count ? 0 : 1 }))
    expect(missed(data(rows), missedRange(TODAY, 7), false).summary).toMatchObject({ total, missed: count, percent })
  })

  it('AC-2803.6: 기간에 예약이 없으면 0건이고 이 기간에 예약이 없어요.', () => {
    const empty = missed(data([person(1, '김가상', '202611101000')]), missedRange(TODAY, 7), false)
    expect(empty).toEqual({ rows: [], summary: { total: 0, missed: 0, percent: 0, notYet: 0 } })
    expect(missedSummaryText(empty.summary)).toBe('이 기간에 예약이 없어요.')
  })

  it('AC-2803.6: 예약은 있는데 안 오신 분이 없으면 줄이 없다', () => {
    const d = data([person(1, '김가상', '202611041000', { status: 'WN', came: 1 })])
    const result = missed(d, missedRange(TODAY, 7), false)
    expect(result.rows).toEqual([])
    expect(missedSummaryText(result.summary)).toBe('예약 1건 중 안 오신 분 0건 · 0% · 아직 안 오신 분 0명')
  })

  it('AC-2803.7: 명단 복사는 받은 줄 차례로 이름·전화·이름·예약한 날(M월 D일)이고 번호 없는 분은 빠진다', () => {
    const { rows } = missed(PAST, missedRange(TODAY, 7), true)
    expect(missedPaste(rows)).toBe(
      [
        `이나래\t${PHONE(11)}\t이나래\t11월 5일`,
        `김다솜\t${PHONE(20)}\t김다솜\t11월 4일`,
        `최바다\t${PHONE(13)}\t최바다\t11월 4일`,
        `조하늘\t${PHONE(16)}\t조하늘\t10월 30일`,
      ].join('\n'),
    )
    expect(missedPaste([])).toBe('')
    expect(missedPaste(rows.filter((row) => !row.phone))).toBe('')
  })
})

describe('AC-2802.7 화면 줄에 차트번호 글자가 없다', () => {
  it('AC-2802.7: 예약 줄·안 오신 분 줄의 차트번호는 열쇠 안에만 있다', () => {
    const d = data([person(1, '김가상', '202611070900'), person(2, '이나래', '202611041000', { status: 'CR', after: '20261105' })])
    const shown = [...upcoming(d, TOMORROW), ...missed(d, missedRange(TODAY, 7), false).rows]
    expect(shown).toHaveLength(2)
    for (const row of shown) {
      const { key, ...rest } = row
      expect(key).toMatch(/^s\|5550000\d\|/)
      expect(JSON.stringify(rest)).not.toMatch(/5550000\d/)
      expect(rest).not.toHaveProperty('chart')
    }
  })
})
