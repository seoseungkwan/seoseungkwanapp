import { describe, expect, it } from 'vitest'
import { BridgeError } from '@/lib/bridge/protocol'
import type { LapsedBucket, LapsedGroup, LapsedRxPick } from '@/types/patients'
import { LAPSED_BUCKETS, bucketOf, bucketRange, countsText, lapsedPaste, lapsedRange, lapsedView, lastRxOf, monthsBack, rangeText, readLapsed } from './lapsed'

// 장기 미방문 명단 계산(spec patients-bit-lists REQ-2804). 이름·전화·차트번호·처방은 모두 지어낸 값이다.
// 오늘은 2026-11-06 금요일이다(시안과 같다)

const TODAY = '2026-11-06'
const CHART = (i: number) => `5550${String(i).padStart(4, '0')}`
const PHONE = (i: number) => `010-0000-${String(i).padStart(4, '0')}`

type RxCell = [string, string | null]
type More = { name?: string | null; phone?: string; visits?: number; reserved?: 0 | 1; rx?: RxCell[] }
// 도우미 줄: [차트번호, 이름, 전화, 마지막 내원일, 진료 받은 날 수, 예약 있음, 마지막 진료 처방]
const raw = (i: number, name: string, last: string, more: More = {}) => [
  CHART(i),
  more.name === undefined ? name : more.name,
  more.phone ?? PHONE(i),
  last,
  more.visits ?? 3,
  more.reserved ?? 0,
  more.rx ?? [],
]
const reply = (rows: unknown[], over: Record<string, unknown> = {}) => ({ v: 1, kind: 'lapsed', from: '2024-11-07', to: '2026-10-06', today: TODAY, rows, ...over })
const data = (rows: unknown[]) => readLapsed(reply(rows))
const bad = (json: unknown) => {
  try {
    readLapsed(json)
  } catch (error) {
    return error instanceof BridgeError ? error.code : 'other'
  }
  return 'none'
}

const GROUPS: LapsedGroup[] = [
  { name: '도수치료', codes: ['MM042', 'mm043'] },
  { name: '체외충격파', codes: ['ESWT1'] },
  { name: '주사', codes: ['INJ1', 'INJ2'] },
]
const ALL: LapsedRxPick = { kind: 'all' }

describe('AC-2804.1 달 전 날짜와 묶음', () => {
  it.each([
    ['2026-11-06', 1, '2026-10-06'],
    ['2026-11-06', 3, '2026-08-06'],
    ['2026-11-06', 12, '2025-11-06'],
    ['2026-11-06', 24, '2024-11-06'],
    ['2026-03-31', 1, '2026-02-28'],
    ['2028-03-31', 1, '2028-02-29'],
    ['2026-05-31', 3, '2026-02-28'],
    ['2026-10-31', 1, '2026-09-30'],
    ['2026-01-15', 1, '2025-12-15'],
  ])('AC-2804.1: %s에서 %i달 전은 %s(그 달에 없는 날은 그 달 마지막 날)', (today, k, expected) => {
    expect(monthsBack(today, k)).toBe(expected)
  })

  it.each<[string, LapsedBucket | null]>([
    ['2026-10-07', null],
    ['2026-10-06', '1-3'],
    ['2026-08-07', '1-3'],
    ['2026-08-06', '3-6'],
    ['2026-05-07', '3-6'],
    ['2026-05-06', '6-12'],
    ['2025-11-07', '6-12'],
    ['2025-11-06', '12-24'],
    ['2024-11-07', '12-24'],
    ['2024-11-06', null],
  ])('AC-2804.1: 오늘 2026-11-06, 마지막 내원 %s → %s(경계 날은 긴 쪽)', (last, bucket) => {
    expect(bucketOf(last, TODAY)).toBe(bucket)
  })

  it('AC-2804.1: 달 끝 오늘도 같은 규칙이다(5월 31일의 3달 전은 2월 28일)', () => {
    expect(bucketOf('2026-04-30', '2026-05-31')).toBe('1-3')
    expect(bucketOf('2026-05-01', '2026-05-31')).toBeNull()
    expect(bucketOf('2026-03-01', '2026-05-31')).toBe('1-3')
    expect(bucketOf('2026-02-28', '2026-05-31')).toBe('3-6')
  })

  it('AC-2804.1: 묶음 기간은 T−긴 달 다음 날 ~ T−짧은 달이다', () => {
    expect(bucketRange('1-3', TODAY)).toEqual({ from: '2026-08-07', to: '2026-10-06' })
    expect(bucketRange('3-6', TODAY)).toEqual({ from: '2026-05-07', to: '2026-08-06' })
    expect(bucketRange('6-12', TODAY)).toEqual({ from: '2025-11-07', to: '2026-05-06' })
    expect(bucketRange('12-24', TODAY)).toEqual({ from: '2024-11-07', to: '2025-11-06' })
  })

  it('AC-2804.1: 묶음은 1~3달 · 3~6달 · 6~12달 · 1~2년 차례이고 처음은 1~3달이다', () => {
    expect(LAPSED_BUCKETS.map(({ id, label }) => [id, label])).toEqual([
      ['1-3', '1~3달'],
      ['3-6', '3~6달'],
      ['6-12', '6~12달'],
      ['12-24', '1~2년'],
    ])
  })

  it('AC-2802.2: 장기 미방문은 오늘에서 24달 전 다음 날 ~ 1달 전을 읽는다', () => {
    expect(lapsedRange(TODAY)).toEqual({ from: '2024-11-07', to: '2026-10-06' })
    expect(lapsedRange('2026-03-31')).toEqual({ from: '2024-04-01', to: '2026-02-28' })
  })
})

describe('AC-2801.3 readLapsed: 도우미 답 모양', () => {
  it('AC-2801.3: 줄을 장기 미방문 모양으로 읽는다(날짜는 YYYY-MM-DD, 열쇠는 l|차트번호|마지막 내원일)', () => {
    const d = readLapsed(
      reply([
        raw(1, '김가상', '20261005', { visits: 8, reserved: 1, rx: [['MM042', '가상도수'], ['X1', null]] }),
        raw(2, '', '20250101', { name: null, phone: '' }),
      ]),
    )
    expect(d).toEqual({
      from: '2024-11-07',
      to: '2026-10-06',
      today: TODAY,
      rows: [
        {
          key: `l|${CHART(1)}|20261005`,
          chart: CHART(1),
          name: '김가상',
          phone: PHONE(1),
          last: '2026-10-05',
          visits: 8,
          reserved: true,
          rx: [
            { code: 'MM042', name: '가상도수' },
            { code: 'X1', name: null },
          ],
        },
        { key: `l|${CHART(2)}|20250101`, chart: CHART(2), name: '', phone: '', last: '2025-01-01', visits: 3, reserved: false, rx: [] },
      ],
    })
  })

  it('AC-2801.3: 물어본 기간과 다른 답은 쓰지 않는다', () => {
    const json = reply([raw(1, '김가상', '20261005')])
    expect(readLapsed(json, { from: '2024-11-07', to: '2026-10-06' }).rows).toHaveLength(1)
    expect(() => readLapsed(json, { from: '2024-11-08', to: '2026-10-06' })).toThrow(BridgeError)
  })

  const GOOD = raw(1, '김가상', '20261005', { rx: [['MM042', '가상도수']] })
  const withCell = (i: number, value: unknown) => {
    const row: unknown[] = [...GOOD]
    row[i] = value
    return reply([row])
  }
  it.each<[string, unknown]>([
    ['답이 객체가 아님', [GOOD]],
    ['v가 1이 아님', reply([GOOD], { v: 2 })],
    ['kind가 다름', reply([GOOD], { kind: 'reservation' })],
    ['to가 오늘', reply([GOOD], { to: TODAY })],
    ['to가 from보다 앞', reply([GOOD], { from: '2026-10-07' })],
    ['today가 날짜가 아님', reply([GOOD], { today: '20261106' })],
    ['rows가 목록이 아님', reply([GOOD], { rows: null })],
    ['칸이 여섯', reply([GOOD.slice(0, 6)])],
    ['차트번호가 null', withCell(0, null)],
    ['차트번호가 빈 글', withCell(0, ' ')],
    ['이름이 숫자', withCell(1, 7)],
    ['전화가 null', withCell(2, null)],
    ['마지막 내원일이 없는 날', withCell(3, '20260230')],
    ['마지막 내원일이 YYYY-MM-DD', withCell(3, '2026-10-05')],
    ['진료 받은 날 수가 1', withCell(4, 1)],
    ['진료 받은 날 수가 소수', withCell(4, 2.5)],
    ['진료 받은 날 수가 글', withCell(4, '3')],
    ['예약 있음이 2', withCell(5, 2)],
    ['처방이 목록이 아님', withCell(6, 'MM042')],
    ['처방 칸이 하나', withCell(6, [['MM042']])],
    ['처방 코드가 빈 글', withCell(6, [['', '가상도수']])],
    ['처방 이름이 숫자', withCell(6, [['MM042', 1]])],
    ['처방이 21개', withCell(6, Array.from({ length: 21 }, (_, i) => [`P${i}`, null]))],
    ['같은 차트번호가 두 줄', reply([GOOD, raw(1, '김가상', '20250505')])],
  ])('AC-2801.3: %s면 E-BRIDGE-BAD-REPLY', (_label, json) => {
    expect(bad(json)).toBe('E-BRIDGE-BAD-REPLY')
  })

  it('AC-2801.3: 처방 20개는 받는다', () => {
    const rx = Array.from({ length: 20 }, (_, i): RxCell => [`P${i}`, null])
    expect(data([raw(1, '김가상', '20261005', { rx })]).rows[0]?.rx).toHaveLength(20)
  })
})

describe('AC-2804.6 마지막 진료: 처방 추세 묶음 이름 맞추기', () => {
  const rx = (...cells: RxCell[]) => cells.map(([code, name]) => ({ code, name }))

  it('AC-2804.6: 코드가 하나라도 겹치는 묶음 이름을 묶음 차례로(대소문자는 가리지 않는다)', () => {
    expect(lastRxOf(rx(['ESWT1', '가상충격파'], ['MM043', '가상도수2']), GROUPS)).toEqual({ groups: ['도수치료', '체외충격파'], names: [] })
    expect(lastRxOf(rx(['inj2', null]), GROUPS)).toEqual({ groups: ['주사'], names: [] })
  })

  it('AC-2804.6: 같은 이름 묶음이 둘이어도 한 번만 보인다', () => {
    const twice: LapsedGroup[] = [
      { name: '주사', codes: ['INJ1'] },
      { name: '주사', codes: ['INJ2'] },
    ]
    expect(lastRxOf(rx(['INJ1', null], ['INJ2', null]), twice).groups).toEqual(['주사'])
  })

  it('AC-2804.6: 겹치는 묶음이 없으면 처방 이름을 두 개까지(이름 없으면 코드, 같은 이름은 한 번)', () => {
    expect(lastRxOf(rx(['P1', '가상물리치료'], ['P2', null], ['P3', '가상파스']), GROUPS)).toEqual({ groups: [], names: ['가상물리치료', 'P2'] })
    expect(lastRxOf(rx(['P1', '가상물리치료'], ['P4', '가상물리치료'], ['P3', '가상파스']), GROUPS)).toEqual({ groups: [], names: ['가상물리치료', '가상파스'] })
    expect(lastRxOf(rx(['P1', '가상물리치료']), GROUPS)).toEqual({ groups: [], names: ['가상물리치료'] })
    expect(lastRxOf([], GROUPS)).toEqual({ groups: [], names: [] })
  })

  it('AC-2804.6: 묶음을 못 읽었으면(null) 처방 이름으로만 보인다', () => {
    expect(lastRxOf(rx(['MM042', '가상도수'], ['ESWT1', '가상충격파'], ['P3', '가상파스']), null)).toEqual({ groups: [], names: ['가상도수', '가상충격파'] })
  })
})

describe('AC-2804.3 고른 묶음의 표', () => {
  const D = data([
    raw(1, '박나래', '20261006', { visits: 8, reserved: 1, rx: [['MM042', '가상도수']] }),
    raw(2, '최라온', '20260807', { phone: '', rx: [['P1', '가상물리치료'], ['P2', '가상온열치료']] }),
    raw(3, '김가상', '20261006', { visits: 2, rx: [['ESWT1', '가상충격파'], ['MM042', '가상도수']] }),
    raw(4, '이다솜', '20260806', { rx: [['ESWT1', '가상충격파']] }),
    raw(5, '정마루', '20260101', { rx: [['INJ1', '가상주사']] }),
    raw(6, '강바다', '20250101'),
    raw(7, '조하늘', '20241107', { rx: [['MM042', null]] }),
  ])

  it('AC-2804.3: 마지막 내원이 늦은 차례, 같으면 이름 차례이고 줄 모양은 정해 둔 칸뿐이다', () => {
    const { rows } = lapsedView(D, { bucket: '1-3', rx: ALL }, GROUPS, {}, TODAY)
    expect(rows.map((row) => row.name)).toEqual(['김가상', '박나래', '최라온'])
    expect(rows[1]).toEqual({
      key: `l|${CHART(1)}|20261006`,
      name: '박나래',
      phone: PHONE(1),
      last: '2026-10-06',
      daysAgo: 31,
      visits: 8,
      reserved: true,
      contacted: false,
      groups: ['도수치료'],
      rxNames: [],
    })
    expect(rows[2]).toMatchObject({ name: '최라온', phone: '', daysAgo: 91, reserved: false, groups: [], rxNames: ['가상물리치료', '가상온열치료'] })
  })

  it('AC-2804.2: 묶음마다 건수, 고른 묶음의 기간', () => {
    const view = lapsedView(D, { bucket: '12-24', rx: ALL }, GROUPS, {}, TODAY)
    expect(view.counts).toEqual({ '1-3': 3, '3-6': 1, '6-12': 1, '12-24': 2 })
    expect(view.range).toEqual({ from: '2024-11-07', to: '2025-11-06' })
    expect(view.rows.map((row) => row.name)).toEqual(['강바다', '조하늘'])
  })

  it('AC-2804.2: 건수 줄 글과 기간 글(해가 오늘과 다르면 YYYY년)', () => {
    expect(countsText({ '1-3': 128, '3-6': 96, '6-12': 141, '12-24': 0 })).toBe('1~3달 128명 · 3~6달 96명 · 6~12달 141명 · 1~2년 0명')
    expect(rangeText(bucketRange('1-3', TODAY), TODAY)).toBe('8월 7일 ~ 10월 6일에 마지막으로 오신 분')
    expect(rangeText(bucketRange('6-12', TODAY), TODAY)).toBe('2025년 11월 7일 ~ 5월 6일에 마지막으로 오신 분')
    expect(rangeText(bucketRange('12-24', TODAY), TODAY)).toBe('2024년 11월 7일 ~ 2025년 11월 6일에 마지막으로 오신 분')
  })

  it('AC-2804.7: 마지막 진료 고르기 목록은 고른 기간 줄에 나온 묶음 이름들(묶음 차례)이다', () => {
    expect(lapsedView(D, { bucket: '1-3', rx: ALL }, GROUPS, {}, TODAY).groupNames).toEqual(['도수치료', '체외충격파'])
    expect(lapsedView(D, { bucket: '6-12', rx: ALL }, GROUPS, {}, TODAY).groupNames).toEqual(['주사'])
    expect(lapsedView(D, { bucket: '12-24', rx: ALL }, GROUPS, {}, TODAY).groupNames).toEqual(['도수치료'])
  })

  it('AC-2804.7: 묶음을 고르면 표·건수가 그 묶음이 든 줄만이다. 고르기 목록은 그대로다', () => {
    const view = lapsedView(D, { bucket: '1-3', rx: { kind: 'group', name: '도수치료' } }, GROUPS, {}, TODAY)
    expect(view.rows.map((row) => row.name)).toEqual(['김가상', '박나래'])
    expect(view.counts).toEqual({ '1-3': 2, '3-6': 0, '6-12': 0, '12-24': 1 })
    expect(view.groupNames).toEqual(['도수치료', '체외충격파'])
  })

  it('AC-2804.7: 묶음 없음은 겹치는 묶음이 없는 줄만이다', () => {
    const view = lapsedView(D, { bucket: '1-3', rx: { kind: 'none' } }, GROUPS, {}, TODAY)
    expect(view.rows.map((row) => row.name)).toEqual(['최라온'])
    expect(view.counts).toEqual({ '1-3': 1, '3-6': 0, '6-12': 0, '12-24': 1 })
  })

  it('AC-2804.7: 없는 묶음 이름을 고르면 줄이 없다', () => {
    const view = lapsedView(D, { bucket: '1-3', rx: { kind: 'group', name: '없는묶음' } }, GROUPS, {}, TODAY)
    expect(view.rows).toEqual([])
    expect(view.counts).toEqual({ '1-3': 0, '3-6': 0, '6-12': 0, '12-24': 0 })
  })

  it('AC-2804.6: 묶음을 못 읽었으면 모든 줄이 묶음 없음이고 고르기 목록이 비어 있다', () => {
    const view = lapsedView(D, { bucket: '1-3', rx: { kind: 'none' } }, null, {}, TODAY)
    expect(view.rows.map((row) => [row.name, row.groups, row.rxNames])).toEqual([
      ['김가상', [], ['가상충격파', '가상도수']],
      ['박나래', [], ['가상도수']],
      ['최라온', [], ['가상물리치료', '가상온열치료']],
    ])
    expect(view.groupNames).toEqual([])
  })

  it('AC-2804.4: 묶음에 아무도 없으면 줄이 없고 복사 글도 빈 글이다', () => {
    const view = lapsedView(data([raw(1, '김가상', '20261006')]), { bucket: '3-6', rx: ALL }, GROUPS, {}, TODAY)
    expect(view.rows).toEqual([])
    expect(lapsedPaste(view.rows)).toBe('')
  })

  it('AC-2804.4: 명단 복사는 표 차례로 이름·전화·이름·마지막 내원(M월 D일)이고 번호 없는 분은 빠진다', () => {
    const { rows } = lapsedView(D, { bucket: '1-3', rx: ALL }, GROUPS, {}, TODAY)
    expect(lapsedPaste(rows)).toBe([`김가상\t${PHONE(3)}\t김가상\t10월 6일`, `박나래\t${PHONE(1)}\t박나래\t10월 6일`].join('\n'))
  })

  it('AC-2804.5: 연락함 표시(같은 열쇠)가 있는 줄은 contacted다', () => {
    const marks = Object.create(null) as Record<string, string>
    marks[`l|${CHART(3)}|20261006`] = '2026-11-06'
    marks[`l|${CHART(1)}|20250505`] = '2026-11-06' // 예전 마지막 내원일의 표시는 이 줄 것이 아니다
    const { rows } = lapsedView(D, { bucket: '1-3', rx: ALL }, GROUPS, marks, TODAY)
    expect(rows.map((row) => [row.name, row.contacted])).toEqual([
      ['김가상', true],
      ['박나래', false],
      ['최라온', false],
    ])
  })

  it('AC-2802.7: 화면 줄의 차트번호는 열쇠 안에만 있다', () => {
    const { rows } = lapsedView(D, { bucket: '1-3', rx: ALL }, GROUPS, {}, TODAY)
    expect(rows).toHaveLength(3)
    for (const row of rows) {
      const { key, ...rest } = row
      expect(key).toMatch(/^l\|5550000\d\|/)
      expect(JSON.stringify(rest)).not.toMatch(/5550000\d/)
      expect(rest).not.toHaveProperty('chart')
    }
  })
})
