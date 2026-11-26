import { createHash } from 'node:crypto'
import { setTimeout as sleep } from 'node:timers/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ApptAuto, ApptStatus } from '@/lib/calendar/shapes'
import { createHandler } from './handler'
import type { CalendarDayAppt, CalendarWorkerMessage } from './messages'

// 예약 Worker 흐름(spec clinic-calendar REQ-5904). 가짜 포트(통로)·가짜 post(화면)로 handler를 바로 부른다.
// 도우미 답 모양은 helper/src/Precheck.Core/Calendar/CalendarTargets.cs 그대로. 시험 자료는 지어낸 가짜 환자다(이름 '가상환자NN')

const TODAY = '2026-11-17'
const kst = (text: string) => new Date(`${text}+09:00`).getTime()
const NOW = kst('2026-11-17T10:40:00')

// calfind 답: 줄 = [차트번호, 이름, 성별 'M'|'F'|null, 생일 yyyyMMdd|null, 마지막 내원 yyyyMMdd|null]
const FIND = {
  v: 1,
  kind: 'calfind',
  today: TODAY,
  more: false,
  rows: [
    ['10231', '가상환자01', 'F', '19650312', '20261110'],
    ['10232', '가상환자02', 'M', '20001118', null],
    ['10233', '가상환자03', null, null, '20250102'],
  ],
}

// calday 답: came 줄 = [날 yyyyMMdd, 차트번호], rsv 줄 = [차트번호|null, 이름|null, 접수 시각 yyyyMMddHHmm]
const DAY = {
  v: 1,
  kind: 'calday',
  from: '2026-11-16',
  to: '2026-11-21',
  today: TODAY,
  came: [
    ['20261116', '10231'],
    ['20261117', '10232'],
    ['20261117', '10299'], // 예약 없는 환자의 접수: 화면으로 가지 않는다
  ],
  rsv: [
    ['10231', '가상환자01', '202611181030'],
    [null, '가상환자09', '202611191400'],
    ['10240', null, '202611201100'],
  ],
}

const appt = (
  id: string,
  day: string,
  start: number,
  chart: string | null,
  status: ApptStatus = 'auto',
  auto: ApptAuto = null,
  len = 30,
): CalendarDayAppt => ({ id, day, start, len, chart, status, auto })

const APPTS: CalendarDayAppt[] = [
  appt('a1', '2026-11-16', 570, '10231'), // 접수 있음 → came(서버 null과 다름)
  appt('a2', '2026-11-16', 600, '10233', 'auto', 'noshow'), // 접수 없음·지남 → noshow, 서버와 같음 → 빠짐
  appt('a3', '2026-11-17', 570, '10232'), // came
  appt('a4', '2026-11-17', 570, '10234'), // 10:00에 끝·접수 없음 → noshow
  appt('a5', '2026-11-17', 630, '10235', 'auto', 'came'), // 11:00에 끝(아직) → null, 서버 came과 다름
  appt('a6', '2026-11-17', 540, null), // 차트번호 없음(신환) → null, 서버와 같음 → 빠짐
  appt('a7', '2026-11-17', 540, '10236', 'noshow', 'came'), // 손으로 고른 상태 → 빠짐
  appt('a8', '2026-11-18', 630, '10231', 'auto', 'noshow'), // 오늘 뒤 → 빠짐. 11/18 비트 예약 10231 칸을 가린다
  appt('a9', '2026-11-15', 570, '10237'), // 답 기간 앞 → 빠짐(서버 값 그대로)
  appt('a10', '2026-11-20', 660, '10240', 'cancel'), // 취소 예약은 비트 예약 칸을 가리지 않는다
]

const BAD = 'E-BRIDGE-BAD-REPLY'
const REJECTED = 'E-BRIDGE-REJECTED'

const tick = () => new Promise<void>((resolve) => setImmediate(resolve))
// SHA-256은 스레드에서 돌아 틱만으로 재지 못하므로, 틱으로 안 오면 쉬며 기다린다
async function until(ready: () => boolean, label: string) {
  for (let i = 0; i < 2000; i++) {
    if (ready()) return
    await tick()
  }
  for (let i = 0; i < 200; i++) {
    if (ready()) return
    await sleep(25)
  }
  throw new Error(`기다린 일이 오지 않음: ${label}`)
}
const settle = async () => {
  for (let i = 0; i < 30; i++) await tick()
}

function harness() {
  const posted: CalendarWorkerMessage[] = []
  const handler = createHandler({ post: (message) => posted.push(message as CalendarWorkerMessage) })
  let nextId = 0
  const newId = () => `req-${++nextId}`

  const all = <T extends CalendarWorkerMessage['type']>(type: T) =>
    posted.filter((message): message is Extract<CalendarWorkerMessage, { type: T }> => message.type === type)

  // 통로 포트로 답 하나(chunk … end)
  function deliver(id: string, value: unknown, chunks = 3, options: { sha?: string; skipSeq?: boolean } = {}) {
    const text = JSON.stringify(value)
    const step = Math.max(1, Math.ceil(text.length / chunks))
    let seq = 0
    for (let at = 0; at < text.length; at += step) {
      if (options.skipSeq && seq === 1) seq++
      handler.onPort({ type: 'chunk', id, seq: seq++, data: text.slice(at, at + step) })
    }
    handler.onPort({
      type: 'end',
      id,
      count: seq,
      bytes: Buffer.byteLength(text, 'utf8'),
      sha256: options.sha ?? createHash('sha256').update(text, 'utf8').digest('hex'),
    })
  }

  // 화면 흐름: 스트림이 끝난 뒤 그 id를 실어 보낸다. 답 하나를 기다린다
  async function ask(message: Record<string, unknown>) {
    const before = posted.length
    handler.onScreen(message)
    await until(() => posted.length > before, `${String(message.type)} 답`)
    return posted[posted.length - 1]
  }
  async function find(reply: unknown = FIND) {
    const id = newId()
    deliver(id, reply)
    return ask({ type: 'find', targets: { id } })
  }
  async function days(reply: unknown = DAY, extra: Record<string, unknown> = {}) {
    const id = newId()
    deliver(id, reply)
    return ask({ type: 'days', targets: { id }, now: NOW, appts: APPTS, ...extra })
  }

  return { handler, posted, all, newId, deliver, ask, find, days }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('AC-8536.1 past: 지난 예약 도착 채우기(calday 조각 + 지난 예약 → 도착 auto만)', () => {
  it('AC-8536.1 past는 days와 같은 규칙의 도착 auto만 싣고 비트 예약 칸은 없다', async () => {
    const h = harness()
    const id = h.newId()
    h.deliver(id, DAY)
    const out = await h.ask({ type: 'past', targets: { id }, now: NOW, appts: APPTS })
    expect(out).toEqual({
      type: 'past',
      from: '2026-11-16',
      to: '2026-11-21',
      auto: [
        ['a1', 'came'],
        ['a3', 'came'],
        ['a4', 'noshow'],
        ['a5', null],
      ],
    })
  })

  it('AC-8536.1 past와 days는 서로의 늦은 답을 버리지 않고, 도우미 오류는 op past 번호만', async () => {
    const h = harness()
    const pastId = h.newId()
    const daysId = h.newId()
    h.handler.onScreen({ type: 'past', targets: { id: pastId }, now: NOW, appts: APPTS })
    h.handler.onScreen({ type: 'days', targets: { id: daysId }, now: NOW, appts: APPTS })
    h.deliver(daysId, DAY)
    h.deliver(pastId, DAY)
    await until(() => h.all('past').length === 1 && h.all('days').length === 1, 'past·days 답')
    const out = await h.ask({ type: 'past', targets: { code: 'E-BIT-IN-USE' }, now: NOW, appts: [] })
    expect(out).toEqual({ type: 'error', op: 'past', code: 'E-BIT-IN-USE' })
  })
})

// ── AC-5904.1 find ─────────────────────────────────────────────

describe('AC-5904.1 find: calfind 조각 → found', () => {
  it('AC-5904.1 calfind 답을 found {rows: [{chart, name, sex, age, last}], more}로 바꾼다(나이는 답의 오늘 기준 ageOn)', async () => {
    const h = harness()
    const out = await h.find()
    expect(out).toEqual({
      type: 'found',
      rows: [
        { chart: '10231', name: '가상환자01', sex: '여', age: 61, last: '2026-11-10' },
        { chart: '10232', name: '가상환자02', sex: '남', age: 25, last: null }, // 생일이 내일 → 한 살 적게
        { chart: '10233', name: '가상환자03', sex: '', age: null, last: '2025-01-02' },
      ],
      more: false,
    })
  })

  it('AC-5904.1 more는 답 그대로이고 나이는 답의 today로 센다', async () => {
    const h = harness()
    const out = await h.find({ ...FIND, today: '2026-03-12', more: true, rows: [FIND.rows[0]] })
    expect(out).toEqual({
      type: 'found',
      rows: [{ chart: '10231', name: '가상환자01', sex: '여', age: 61, last: '2026-11-10' }],
      more: true,
    })
  })

  it('AC-5904.1 찾은 환자가 없으면 빈 rows', async () => {
    const h = harness()
    expect(await h.find({ ...FIND, rows: [] })).toEqual({ type: 'found', rows: [], more: false })
  })

  it('AC-5904.1 생일 글자는 화면으로 가지 않는다', async () => {
    const h = harness()
    await h.find()
    const text = JSON.stringify(h.posted)
    expect(text).not.toMatch(/19650312|20001118|1965|0312/)
    expect(h.posted.every((message) => message.type === 'found' && message.rows.every((row) => !('birth' in row)))).toBe(true)
  })

  it('AC-5904.1 find가 조각보다 먼저 와도 조각을 기다려 답한다', async () => {
    const h = harness()
    const id = h.newId()
    h.handler.onScreen({ type: 'find', targets: { id } })
    await settle()
    expect(h.posted).toEqual([])
    h.deliver(id, FIND, 5)
    await until(() => h.posted.length > 0, 'found')
    expect(h.all('found')).toHaveLength(1)
  })

  it('AC-5904.1 새 find가 오면 앞 find의 늦은 답은 버린다', async () => {
    const h = harness()
    const first = h.newId()
    const second = h.newId()
    h.handler.onScreen({ type: 'find', targets: { id: first } })
    h.handler.onScreen({ type: 'find', targets: { id: second } })
    h.deliver(second, { ...FIND, rows: [FIND.rows[1]] })
    await until(() => h.posted.length > 0, 'found')
    h.deliver(first, FIND)
    await settle()
    await sleep(50)
    expect(h.posted).toEqual([{ type: 'found', rows: [{ chart: '10232', name: '가상환자02', sex: '남', age: 25, last: null }], more: false }])
  })
})

// ── AC-5904.2 days ─────────────────────────────────────────────

describe('AC-5904.2 days: calday 조각 + 화면 예약 → 도착 auto·비트 예약 칸', () => {
  it('AC-5904.2 auto는 상태 auto·오늘 이하·답 기간 안의 예약 중 arrivalOf 값이 서버 값과 다른 것만, ghosts는 visibleGhosts 결과', async () => {
    const h = harness()
    const out = await h.days()
    expect(out).toEqual({
      type: 'days',
      from: '2026-11-16',
      to: '2026-11-21',
      auto: [
        ['a1', 'came'],
        ['a3', 'came'],
        ['a4', 'noshow'],
        ['a5', null],
      ],
      ghosts: [
        { key: expect.any(String), day: '2026-11-19', start: 840, chart: null, name: '가상환자09' },
        { key: expect.any(String), day: '2026-11-20', start: 660, chart: '10240', name: null },
      ],
    })
  })

  it('AC-5904.2 같은 예약을 다시 적지 않게: 서버 값이 이미 맞으면 auto가 비어 있다', async () => {
    const h = harness()
    const same = [
      appt('a1', '2026-11-16', 570, '10231', 'auto', 'came'),
      appt('a3', '2026-11-17', 570, '10232', 'auto', 'came'),
      appt('a4', '2026-11-17', 570, '10234', 'auto', 'noshow'),
      appt('a5', '2026-11-17', 630, '10235', 'auto', null),
    ]
    const out = await h.days(DAY, { appts: same })
    expect(out).toMatchObject({ type: 'days', auto: [] })
  })

  it('AC-5904.2 화면이 준 시각(now)으로 센다: 11:01이면 10:30+30분 예약도 noshow', async () => {
    const h = harness()
    const out = await h.days(DAY, { now: kst('2026-11-17T11:01:00'), appts: [appt('a5', '2026-11-17', 630, '10235')] })
    expect(out).toMatchObject({ type: 'days', auto: [['a5', 'noshow']] })
  })

  it('AC-5904.2 비트 예약 칸 key는 같은 시각 둘도 서로 다르다', async () => {
    const h = harness()
    const rsv = [
      [null, '가상환자11', '202611191400'],
      [null, '가상환자12', '202611191400'],
      ['10241', '가상환자13', '202611191400'],
    ]
    const out = await h.days({ ...DAY, rsv }, { appts: [] })
    if (out.type !== 'days') throw new Error(out.type)
    expect(out.ghosts.map((ghost) => [ghost.day, ghost.start, ghost.chart, ghost.name])).toEqual([
      ['2026-11-19', 840, null, '가상환자11'],
      ['2026-11-19', 840, null, '가상환자12'],
      ['2026-11-19', 840, '10241', '가상환자13'],
    ])
    expect(new Set(out.ghosts.map((ghost) => ghost.key)).size).toBe(3)
  })

  it('AC-5904.2 접수·비트 예약·예약이 없으면 빈 auto·ghosts', async () => {
    const h = harness()
    expect(await h.days({ ...DAY, came: [], rsv: [] }, { appts: [] })).toEqual({
      type: 'days',
      from: '2026-11-16',
      to: '2026-11-21',
      auto: [],
      ghosts: [],
    })
  })

  it('AC-5904.2 새 days가 오면 앞 days의 늦은 답은 버리고, find와 days는 서로 버리지 않는다', async () => {
    const h = harness()
    const oldDays = h.newId()
    const newDays = h.newId()
    const lookup = h.newId()
    h.handler.onScreen({ type: 'find', targets: { id: lookup } })
    h.handler.onScreen({ type: 'days', targets: { id: oldDays }, now: NOW, appts: APPTS })
    h.handler.onScreen({ type: 'days', targets: { id: newDays }, now: NOW, appts: [] })
    h.deliver(newDays, { ...DAY, from: '2026-11-17', came: [], rsv: [] })
    h.deliver(lookup, FIND)
    await until(() => h.posted.length >= 2, 'days·found')
    h.deliver(oldDays, DAY)
    await settle()
    await sleep(50)
    expect(h.all('days')).toEqual([{ type: 'days', from: '2026-11-17', to: '2026-11-21', auto: [], ghosts: [] }])
    expect(h.all('found')).toHaveLength(1)
  })
})

// ── AC-5904.3 틀린 답·오류 ─────────────────────────────────────

describe('AC-5904.3 모양이 틀린 답·도우미 오류는 오류 번호만', () => {
  const findRow = (patch: Record<number, unknown>) => {
    const line: unknown[] = [...FIND.rows[0]]
    for (const [at, value] of Object.entries(patch)) line[Number(at)] = value
    return line
  }
  it.each([
    ['배열', []],
    ['v가 2', { ...FIND, v: 2 }],
    ['kind가 calday', { ...FIND, kind: 'calday' }],
    ['today 모양', { ...FIND, today: '20261117' }],
    ['more 없음', { v: 1, kind: 'calfind', today: TODAY, rows: FIND.rows }],
    ['rows가 배열 아님', { ...FIND, rows: {} }],
    ['줄 칸 4개', { ...FIND, rows: [FIND.rows[0].slice(0, 4)] }],
    ['차트번호 빈 글', { ...FIND, rows: [findRow({ 0: '' })] }],
    ['차트번호 글자', { ...FIND, rows: [findRow({ 0: 'A1023' })] }],
    ['차트번호 11자리', { ...FIND, rows: [findRow({ 0: '12345678901' })] }],
    ['차트번호 숫자 값', { ...FIND, rows: [findRow({ 0: 10231 })] }],
    ['이름 빈 글', { ...FIND, rows: [findRow({ 1: '' })] }],
    ['이름 41자', { ...FIND, rows: [findRow({ 1: '가'.repeat(41) })] }],
    ['이름 null', { ...FIND, rows: [findRow({ 1: null })] }],
    ['성별 X', { ...FIND, rows: [findRow({ 2: 'X' })] }],
    ['성별 소문자', { ...FIND, rows: [findRow({ 2: 'm' })] }],
    ['생일 붙임표', { ...FIND, rows: [findRow({ 3: '1965-03-12' })] }],
    ['생일 없는 날', { ...FIND, rows: [findRow({ 3: '19651340' })] }],
    ['마지막 내원 7자리', { ...FIND, rows: [findRow({ 4: '2026111' })] }],
    ['같은 차트 두 줄', { ...FIND, rows: [FIND.rows[0], FIND.rows[0]] }],
    ['21명', { ...FIND, rows: Array.from({ length: 21 }, (_, i) => findRow({ 0: String(10300 + i) })) }],
  ])('AC-5904.3 calfind 답이 틀리면(%s) found 없이 E-BRIDGE-BAD-REPLY', async (_label, reply) => {
    const h = harness()
    expect(await h.find(reply)).toEqual({ type: 'error', op: 'find', code: BAD })
    expect(h.all('found')).toEqual([])
  })

  it.each([
    ['배열', []],
    ['v가 2', { ...DAY, v: 2 }],
    ['kind가 calfind', { ...DAY, kind: 'calfind' }],
    ['from 모양', { ...DAY, from: '2026-11-31' }],
    ['to 없음', { ...DAY, to: undefined }],
    ['from이 to 뒤', { ...DAY, from: '2026-11-22' }],
    ['today 모양', { ...DAY, today: null }],
    ['came 배열 아님', { ...DAY, came: {} }],
    ['came 칸 하나', { ...DAY, came: [['20261116']] }],
    ['came 날 모양', { ...DAY, came: [['2026-11-16', '10231']] }],
    ['came 기간 밖', { ...DAY, came: [['20261115', '10231']] }],
    ['came 차트번호 글자', { ...DAY, came: [['20261116', 'A10231']] }],
    ['came 차트번호 null', { ...DAY, came: [['20261116', null]] }],
    ['rsv 배열 아님', { ...DAY, rsv: null }],
    ['rsv 칸 둘', { ...DAY, rsv: [['10231', '202611181030']] }],
    ['rsv 시각 10자리', { ...DAY, rsv: [['10231', '가상환자01', '2026111810']] }],
    ['rsv 시 24', { ...DAY, rsv: [['10231', '가상환자01', '202611182400']] }],
    ['rsv 분 60', { ...DAY, rsv: [['10231', '가상환자01', '202611181060']] }],
    ['rsv 기간 밖', { ...DAY, rsv: [['10231', '가상환자01', '202611221030']] }],
    ['rsv 차트번호 빈 글', { ...DAY, rsv: [['', '가상환자01', '202611181030']] }],
    ['rsv 이름 41자', { ...DAY, rsv: [['10231', '가'.repeat(41), '202611181030']] }],
    ['rsv 이름 빈 글', { ...DAY, rsv: [['10231', '', '202611181030']] }],
  ])('AC-5904.3 calday 답이 틀리면(%s) days 없이 E-BRIDGE-BAD-REPLY(반쪽 결과 없음)', async (_label, reply) => {
    const h = harness()
    expect(await h.days(reply)).toEqual({ type: 'error', op: 'days', code: BAD })
    expect(h.all('days')).toEqual([])
  })

  it('AC-5904.3 맞는 줄 사이에 틀린 줄 하나만 있어도 결과를 보내지 않는다', async () => {
    const h = harness()
    expect(await h.find({ ...FIND, rows: [FIND.rows[0], findRow({ 2: 'X' }), FIND.rows[2]] })).toEqual({ type: 'error', op: 'find', code: BAD })
    const rsv = [...DAY.rsv, ['10231', '가상환자01', '20261118103']]
    expect(await h.days({ ...DAY, rsv })).toEqual({ type: 'error', op: 'days', code: BAD })
    expect(h.posted.map((message) => message.type)).toEqual(['error', 'error'])
  })

  it('AC-5904.3 화면이 거절된 스트림({code})을 넘기면 그 번호를 보낸다', async () => {
    const h = harness()
    expect(await h.ask({ type: 'find', targets: { code: 'E-BIT-IN-USE' } })).toEqual({ type: 'error', op: 'find', code: 'E-BIT-IN-USE' })
    expect(await h.ask({ type: 'days', targets: { code: 'E-HELPER-BAD-MESSAGE' }, now: NOW, appts: [] })).toEqual({
      type: 'error',
      op: 'days',
      code: 'E-HELPER-BAD-MESSAGE',
    })
  })

  it('AC-5904.3 도우미 abort는 그 번호, 번호 모양이 아닌 글(환자 값이 섞일 수 있음)은 E-BRIDGE-BAD-REPLY', async () => {
    const h = harness()
    const first = h.newId()
    h.handler.onPort({ type: 'abort', id: first, code: 'E-HELPER-BAD-MESSAGE' })
    expect(await h.ask({ type: 'find', targets: { id: first } })).toEqual({ type: 'error', op: 'find', code: 'E-HELPER-BAD-MESSAGE' })
    const second = h.newId()
    h.handler.onPort({ type: 'abort', id: second, code: '가상환자01 10231 읽기 실패' })
    expect(await h.ask({ type: 'days', targets: { id: second }, now: NOW, appts: APPTS })).toEqual({ type: 'error', op: 'days', code: BAD })
    expect(JSON.stringify(h.posted)).not.toMatch(/가상환자|10231/)
  })

  it('AC-5904.3 조각 번호가 건너뛰거나 sha256이 다르면 E-BRIDGE-BAD-REPLY', async () => {
    for (const options of [{ skipSeq: true }, { sha: '0'.repeat(64) }]) {
      const h = harness()
      const id = h.newId()
      h.deliver(id, FIND, 3, options)
      expect(await h.ask({ type: 'find', targets: { id } })).toEqual({ type: 'error', op: 'find', code: BAD })
    }
  })

  it('AC-5904.3 조각이 60초 안에 끝나지 않으면 E-BRIDGE-BAD-REPLY', async () => {
    vi.useFakeTimers()
    const h = harness()
    h.handler.onScreen({ type: 'days', targets: { id: 'req-slow' }, now: NOW, appts: APPTS })
    await vi.advanceTimersByTimeAsync(59_000)
    expect(h.posted).toEqual([])
    await vi.advanceTimersByTimeAsync(1_000)
    expect(h.posted).toEqual([{ type: 'error', op: 'days', code: BAD }])
  })

  it.each([
    ['find targets 없음', { type: 'find' }],
    ['find targets id 빈 글', { type: 'find', targets: { id: '' } }],
    ['find targets 번호 모양 아님', { type: 'find', targets: { code: '읽기 실패' } }],
    ['days now 글자', { type: 'days', targets: { id: 'req-x' }, now: '2026-11-17', appts: [] }],
    ['days now NaN', { type: 'days', targets: { id: 'req-x' }, now: Number.NaN, appts: [] }],
    ['days appts 없음', { type: 'days', targets: { id: 'req-x' }, now: NOW }],
    ['예약 id 빈 글', { type: 'days', targets: { id: 'req-x' }, now: NOW, appts: [appt('', '2026-11-17', 570, '10231')] }],
    ['예약 날 모양', { type: 'days', targets: { id: 'req-x' }, now: NOW, appts: [appt('a1', '2026-11-31', 570, '10231')] }],
    ['예약 시작 소수', { type: 'days', targets: { id: 'req-x' }, now: NOW, appts: [appt('a1', '2026-11-17', 570.5, '10231')] }],
    ['예약 길이 0', { type: 'days', targets: { id: 'req-x' }, now: NOW, appts: [appt('a1', '2026-11-17', 570, '10231', 'auto', null, 0)] }],
    ['예약 차트번호 숫자 값', { type: 'days', targets: { id: 'req-x' }, now: NOW, appts: [{ ...APPTS[0], chart: 10231 }] }],
    ['예약 상태 x', { type: 'days', targets: { id: 'req-x' }, now: NOW, appts: [{ ...APPTS[0], status: 'x' }] }],
    ['예약 auto x', { type: 'days', targets: { id: 'req-x' }, now: NOW, appts: [{ ...APPTS[0], auto: 'cancel' }] }],
  ])('AC-5904.3 화면 메시지가 틀리면(%s) E-BRIDGE-REJECTED', async (_label, message) => {
    const h = harness()
    const op = message.type
    expect(await h.ask(message)).toEqual({ type: 'error', op, code: REJECTED })
  })

  it('AC-5904.3 모르는 메시지는 답하지 않고 Worker가 멈추지 않는다', async () => {
    const h = harness()
    for (const message of [null, 'find', 7, { type: 'nope' }, { type: 'bridge-port' }]) h.handler.onScreen(message)
    for (const message of [null, { type: 'chunk' }, { type: 'end', id: 'req-z' }, { type: 'sent', ticket: 1, ok: true }]) h.handler.onPort(message)
    await settle()
    expect(h.posted).toEqual([])
    expect((await h.find()).type).toBe('found')
  })

  it('AC-5904.3 화면으로는 found·days·error만 가고, 비트 접수 차트번호 목록·생일은 Worker 밖으로 나가지 않는다', async () => {
    const h = harness()
    await h.find()
    await h.days()
    await h.find({ ...FIND, v: 9 })
    await h.ask({ type: 'days', targets: { code: 'E-BIT-IN-USE' }, now: NOW, appts: [] })
    expect(new Set(h.posted.map((message) => message.type))).toEqual(new Set(['found', 'days', 'error']))
    const text = JSON.stringify(h.posted)
    expect(text).not.toMatch(/10299|19650312|20001118/)
    for (const message of h.all('error')) expect(Object.keys(message).sort()).toEqual(['code', 'op', 'type'])
  })
})
