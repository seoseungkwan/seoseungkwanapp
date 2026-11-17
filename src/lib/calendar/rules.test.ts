import { describe, expect, it } from 'vitest'
import { ageOn, arrivalOf, nextWeek, parseStart, shownStatus, slotLabel, visibleGhosts, warnings } from './rules'
import type { CalAllDay, CalAppt } from './shapes'

// 지어낸 예약(이름 ○○, 차트번호 다섯 자리). 시각은 분(0시부터)
const at = (hh: number, mm = 0) => hh * 60 + mm
const appt = (over: Partial<CalAppt> = {}): CalAppt => ({
  id: 'a1',
  day: '2026-11-18',
  start: at(14),
  len: 30,
  name: '김○○',
  chart: '10231',
  staffId: 'ga',
  staffName: '한○○',
  staffMark: '가',
  kindId: 'dosu',
  kindName: '도수',
  memo: '허리 · 3회차',
  status: 'auto',
  auto: null,
  origDay: null,
  origStart: null,
  ...over,
})
const off = (day: string, staffId: string, id = `off-${day}-${staffId}`): CalAllDay => ({
  id,
  day,
  type: 'off',
  memo: null,
  staffId,
  staffName: '윤○○',
})
const memo = (day: string, text: string): CalAllDay => ({ id: `memo-${day}`, day, type: 'memo', memo: text, staffId: null, staffName: null })

describe('AC-5902.2 warnings: 같은 시행자 겹침·그날 휴무', () => {
  // (가)에게 14:00–14:30 예약이 있는 11/18(시안 ?s=overlap-warn)
  const booked = [
    appt({ id: 'b1', start: at(14), len: 30 }),
    appt({ id: 'b2', start: at(14, 30), len: 30 }),
    appt({ id: 'b3', start: at(14, 20), len: 30, staffId: 'na' }),
    appt({ id: 'b4', start: at(14, 10), len: 20, status: 'cancel' }),
    appt({ id: 'b5', day: '2026-11-19', start: at(14), len: 30 }),
  ]

  it('AC-5902.2: 같은 날 같은 시행자의 [시작, 끝)이 겹치면 overlap에 그 예약 id(시작 이른 차례) — 다른 시행자·취소·다른 날은 빼고', () => {
    const draft = { day: '2026-11-18', start: at(14, 20), len: 30, staffId: 'ga' }
    expect(warnings(draft, [...booked].reverse(), [])).toEqual({ overlap: ['b1', 'b2'], off: false })
  })

  it('AC-5902.2: 끝이 다음 시작과 같으면 겹침이 아니다(앞뒤 모두)', () => {
    expect(warnings({ day: '2026-11-18', start: at(13, 30), len: 30, staffId: 'ga' }, booked, [])).toEqual({ overlap: [], off: false })
    expect(warnings({ day: '2026-11-18', start: at(15), len: 10, staffId: 'ga' }, booked, [])).toEqual({ overlap: [], off: false })
  })

  it('AC-5902.2: 고치는 예약 자신과는 견주지 않는다', () => {
    const editing = { id: 'b1', day: '2026-11-18', start: at(14), len: 20, staffId: 'ga' }
    expect(warnings(editing, booked, [])).toEqual({ overlap: [], off: false })
    expect(warnings({ ...editing, len: 40 }, booked, []).overlap).toEqual(['b2'])
  })

  it('AC-5902.2: 그날 그 시행자 휴무 줄이 있으면 off — 다른 날·다른 시행자 휴무·메모 줄은 아니다', () => {
    const allday = [off('2026-11-18', 'na'), off('2026-11-19', 'ga'), memo('2026-11-18', '원장님 학회 (오후)')]
    const draft = { day: '2026-11-18', start: at(11), len: 30, staffId: 'na' }
    expect(warnings(draft, booked, allday)).toEqual({ overlap: [], off: true })
    expect(warnings({ ...draft, staffId: 'ga' }, booked, allday)).toEqual({ overlap: [], off: false })
  })

  it('AC-5902.2: 겹침과 휴무가 함께면 둘 다', () => {
    const draft = { day: '2026-11-18', start: at(14, 25), len: 10, staffId: 'na' }
    expect(warnings(draft, booked, [off('2026-11-18', 'na')])).toEqual({ overlap: ['b3'], off: true })
  })

  it('AC-5902.2: 시행자를 아직 고르지 않았으면 경고 없음', () => {
    const draft = { day: '2026-11-18', start: at(14), len: 30, staffId: '' }
    expect(warnings(draft, booked, [off('2026-11-18', 'na')])).toEqual({ overlap: [], off: false })
  })
})

describe('AC-5902.3 arrivalOf: 비트 접수로 도착 셈(한국 시각)', () => {
  // design.md '예': 지금 2026-11-17 (화) 10:40
  const NOW = new Date('2026-11-17T10:40:00+09:00')
  const today = (over: Partial<CalAppt>) => appt({ day: '2026-11-17', ...over })
  const came = new Set(['10231'])

  it('AC-5902.3: 09:30+30분 차트 10231, 그날 접수 있음 → came', () => {
    expect(arrivalOf(today({ start: at(9, 30), len: 30 }), came, NOW)).toBe('came')
  })

  it('AC-5902.3: 09:30+30분 접수 없음 → noshow(끝 10:00이 지금 10:40보다 앞)', () => {
    expect(arrivalOf(today({ start: at(9, 30), len: 30, chart: '20785' }), came, NOW)).toBe('noshow')
  })

  it('AC-5902.3: 10:30+30분 접수 없음 → null(아직 끝나지 않음)', () => {
    expect(arrivalOf(today({ start: at(10, 30), len: 30, chart: '20785' }), came, NOW)).toBeNull()
  })

  it('AC-5902.3: 끝 시각과 지금이 같으면 아직 null, 끝 뒤에야 noshow', () => {
    const ends = today({ start: at(10, 10), len: 30, chart: '20785' })
    expect(arrivalOf(ends, came, new Date('2026-11-17T10:40:00+09:00'))).toBeNull()
    expect(arrivalOf(ends, came, new Date('2026-11-17T10:40:01+09:00'))).toBe('noshow')
  })

  it('AC-5902.3: 접수가 늦게 와도(끝 지난 뒤) 차트가 있으면 came', () => {
    expect(arrivalOf(today({ start: at(8), len: 30 }), came, NOW)).toBe('came')
  })

  it('AC-5902.3: 차트번호가 빈 예약(신환)은 늘 null', () => {
    expect(arrivalOf(today({ start: at(9, 30), chart: null }), came, NOW)).toBeNull()
    expect(arrivalOf(today({ start: at(9, 30), chart: '' }), new Set(['']), NOW)).toBeNull()
  })

  it('AC-5902.3: 상태가 auto가 아니면 null(손으로 고른 값·취소가 이긴다)', () => {
    for (const status of ['came', 'noshow', 'cancel'] as const) {
      expect(arrivalOf(today({ start: at(9, 30), status }), came, NOW)).toBeNull()
      expect(arrivalOf(today({ start: at(9, 30), chart: '20785', status }), came, NOW)).toBeNull()
    }
  })

  it('AC-5902.3: 지난 날은 시각과 상관없이 끝났고, 다음 날은 아직이다', () => {
    expect(arrivalOf(appt({ day: '2026-11-16', start: at(19), len: 30, chart: '20785' }), came, NOW)).toBe('noshow')
    expect(arrivalOf(appt({ day: '2026-11-18', start: at(0), len: 10, chart: '20785' }), came, NOW)).toBeNull()
  })

  it('AC-5902.3: now는 PC 시간대가 아니라 한국 시각으로 본다(UTC 01:40 = 한국 10:40)', () => {
    const utc = new Date('2026-11-17T01:40:00Z')
    expect(arrivalOf(today({ start: at(9, 30), len: 30, chart: '20785' }), came, utc)).toBe('noshow')
    expect(arrivalOf(today({ start: at(10, 30), len: 30, chart: '20785' }), came, utc)).toBeNull()
    // 한국 11/17 00:20 = UTC 11/16 15:20 — 11/16 23:00 예약은 끝났다
    const midnight = new Date('2026-11-16T15:20:00Z')
    expect(arrivalOf(appt({ day: '2026-11-16', start: at(23), len: 30, chart: '20785' }), came, midnight)).toBe('noshow')
  })
})

describe('AC-5902.4 shownStatus: 보이는 도착 표시', () => {
  it('AC-5902.4: 상태가 cancel·came·noshow면 그 값(도착 칸보다 먼저)', () => {
    expect(shownStatus({ status: 'cancel', auto: 'came' })).toBe('cancel')
    expect(shownStatus({ status: 'came', auto: 'noshow' })).toBe('came')
    expect(shownStatus({ status: 'noshow', auto: 'came' })).toBe('noshow')
  })

  it('AC-5902.4: auto면 도착 칸 값, null이면 none', () => {
    expect(shownStatus({ status: 'auto', auto: 'came' })).toBe('came')
    expect(shownStatus({ status: 'auto', auto: 'noshow' })).toBe('noshow')
    expect(shownStatus({ status: 'auto', auto: null })).toBe('none')
  })
})

describe('AC-5902.6 nextWeek: 7일 뒤 같은 시간에 복사', () => {
  it('AC-5902.6: 날짜만 7일 뒤이고 나머지 칸은 같고, 상태 auto, 도착·처음 자리·id 칸은 없다', () => {
    const source = appt({ id: 'fix-detail', day: '2026-11-17', start: at(9, 30), status: 'came', auto: 'came', origDay: '2026-11-18', origStart: at(15) })
    const copy = nextWeek(source)
    expect(copy).toEqual({
      day: '2026-11-24',
      start: at(9, 30),
      len: 30,
      name: '김○○',
      chart: '10231',
      staffId: 'ga',
      staffName: '한○○',
      staffMark: '가',
      kindId: 'dosu',
      kindName: '도수',
      memo: '허리 · 3회차',
      status: 'auto',
    })
    for (const key of ['id', 'auto', 'origDay', 'origStart']) expect(copy).not.toHaveProperty(key)
  })

  it('AC-5902.6: 달·해를 넘기고, 차트번호 없는 예약은 없는 그대로', () => {
    expect(nextWeek(appt({ day: '2026-12-28', chart: null })).day).toBe('2027-01-04')
    expect(nextWeek(appt({ day: '2026-12-28', chart: null })).chart).toBeNull()
    expect(nextWeek(appt({ day: '2026-11-26', status: 'cancel' }))).toMatchObject({ day: '2026-12-03', status: 'auto' })
  })
})

describe('AC-5902.7 visibleGhosts·ageOn', () => {
  const ghost = (key: string, day: string, chart: string | null, name: string | null = '오○○') => ({ key, day, start: at(11), chart, name })

  it('AC-5902.7: 같은 날 같은 차트번호의 취소 아닌 예약이 있으면 그 비트 예약은 빠진다', () => {
    const ghosts = [ghost('g1', '2026-11-17', '25190'), ghost('g2', '2026-11-17', '11872'), ghost('g3', '2026-11-18', '25190')]
    const appts = [appt({ day: '2026-11-17', chart: '25190' }), appt({ day: '2026-11-17', chart: '11872', status: 'cancel' })]
    expect(visibleGhosts(ghosts, appts).map((g) => g.key)).toEqual(['g2', 'g3'])
  })

  it('AC-5902.7: 차트번호 없는 비트 예약은 남는다(차트 없는 예약과도 짝짓지 않는다)', () => {
    const ghosts = [ghost('g1', '2026-11-17', null, '이○○'), ghost('g2', '2026-11-17', '10231', null)]
    const appts = [appt({ day: '2026-11-17', chart: null, name: '이○○' })]
    expect(visibleGhosts(ghosts, appts)).toEqual(ghosts)
  })

  it('AC-5902.7: ageOn은 만 나이 — 생일 전이면 한 살 적게, 생일 당일은 한 살 더', () => {
    expect(ageOn('19650312', '2026-11-17')).toBe(61)
    expect(ageOn('19651118', '2026-11-17')).toBe(60)
    expect(ageOn('19651117', '2026-11-17')).toBe(61)
    expect(ageOn('20261117', '2026-11-17')).toBe(0)
    expect(ageOn('20000229', '2026-02-28')).toBe(25)
    expect(ageOn('20000229', '2026-03-01')).toBe(26)
  })

  it('AC-5902.7: ageOn은 날짜가 아니면 null(모양·없는 날·오늘 뒤 생일·오늘이 날짜 아님)', () => {
    for (const birth of ['', '1965031', '1965-03-12', '19651332', '19650230', 'abcdefgh', '20261118']) {
      expect(ageOn(birth, '2026-11-17')).toBeNull()
    }
    expect(ageOn('19650312', '2026-13-01')).toBeNull()
    expect(ageOn('19650312', '20261117')).toBeNull()
  })
})

describe('AC-5906.2 (셈 도우미) slotLabel: 처음 자리 글', () => {
  it("AC-5906.2: slotLabel('2026-11-18', 900) → '11/18 (수) 15:00', 앞 0 없는 달·날, 두 자리 시각", () => {
    expect(slotLabel('2026-11-18', at(15))).toBe('11/18 (수) 15:00')
    expect(slotLabel('2027-01-03', at(9, 5))).toBe('1/3 (일) 09:05')
    expect(slotLabel('2026-11-16', 0)).toBe('11/16 (월) 00:00')
  })
})

describe("AC-6002.1 parseStart: 쳐서 넣은 시작 시간 읽기 (spec calendar-colors design.md '시간 읽기' 표)", () => {
  // 보이는 시간 9~19시
  const read = (text: string) => parseStart(text, 9, 19)

  it('AC-6002.1: 1430 · 14:30 · 14시30분 · 14 30 → 870', () => {
    for (const text of ['1430', '14:30', '14시30분', '14 30']) expect(read(text)).toBe(870)
  })

  it('AC-6002.1: 930 · 9:30 → 570', () => {
    expect(read('930')).toBe(570)
    expect(read('9:30')).toBe(570)
  })

  it('AC-6002.1: 14 · 14시 → 840', () => {
    expect(read('14')).toBe(840)
    expect(read('14시')).toBe(840)
  })

  it('AC-6002.1: 230 → 870 (진료 전 새벽은 오후로 본다)', () => {
    expect(read('230')).toBe(870)
  })

  it('AC-6002.1: 830 → 510 (오후로 보면 20:30이 보이는 시간 밖이라 그대로)', () => {
    expect(read('830')).toBe(510)
  })

  it("AC-6002.1: 1435 → 'step' (10분 단위가 아님)", () => {
    expect(read('1435')).toBe('step')
    expect(read('9:05')).toBe('step')
  })

  it("AC-6002.1: 25시 · 1460 · abc · 빈 글 → 'format'", () => {
    for (const text of ['25시', '1460', 'abc', '', '   ']) expect(read(text)).toBe('format')
  })

  it("AC-6002.1: 앞뒤 빈칸은 빼고, 가름 '.'도 읽고, 앞 0이 있어도 된다", () => {
    expect(read(' 1430 ')).toBe(870)
    expect(read('14.30')).toBe(870)
    expect(read('0930')).toBe(570)
    expect(read('09:30')).toBe(570)
  })

  it("AC-6002.1: 시 0~23·분 0~59가 아니거나 모양이 다르면 'format'", () => {
    for (const text of ['24', '24:00', '9:60', '12345', '14:300', '14-30', '오후 2시', '1430분']) expect(read(text)).toBe('format')
  })

  it('AC-6002.1: 오후로 보기는 시가 12 미만이고 보이는 시작보다 앞이며 +12시간이 보이는 끝보다 앞일 때만', () => {
    expect(read('900')).toBe(540) // 보이는 시작과 같으면 그대로
    expect(read('1130')).toBe(690) // 보이는 시간 안
    expect(read('1210')).toBe(730) // 12시는 오후 그대로
    expect(read('2330')).toBe(1410) // 보이는 끝 뒤도 시가 12 이상이면 그대로
    expect(parseStart('130', 9, 14)).toBe(810) // 13:30 < 14:00
    expect(parseStart('200', 9, 14)).toBe(120) // 14:00은 보이는 끝과 같아 그대로
    expect(parseStart('230', 8, 20)).toBe(870)
    expect(parseStart('730', 8, 20)).toBe(1170) // 19:30 < 20:00
  })

  it('AC-6002.1: 돌려주는 분은 0~1430, 10분 단위', () => {
    expect(read('23:50')).toBe(1430)
    expect(read('11:50')).toBe(710)
    expect(parseStart('0', 0, 24)).toBe(0)
  })
})
