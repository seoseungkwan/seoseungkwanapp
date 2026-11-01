import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isYmd } from '@/lib/analytics/dates'
import { DATE_LINE, dateLine, defaultSendDate, fillTemplate } from './fill'

// 골든 시험: 같은 문구·날짜를 원본(seoseungkwan/shared@2a1069b)에 넣은 결과(fixtures/patients/golden/messages-fill.json)와
// 우리 함수의 결과를 순서까지 깊게 견준다. 원본 결과는 scripts/patients/golden/messages.mjs가 만든다(원본은 저장소 밖).
// 일부러 다르게 한 것은 골든 파일의 knownDiffs에 이유와 함께 적은 사례뿐이다. 적지 않은 차이는 실패다.

type KnownDiff = { entry: string; field: string; reason: string; cases?: Record<string, unknown> }
type FillGolden = {
  source: string
  file: string
  entry: string[]
  knownDiffs: KnownDiff[]
  dateLinePattern: { source: string; flags: string }
  bodies: { id: string; body: string }[]
  dates: string[]
  dateLines: { date: string; line: string }[]
  fills: { bodyId: string; date: string; result: string }[]
  invalidDates: { date: string; original: string }[]
  defaultSendDates: { now: string; today: string; result: string }[]
}

const ROOT = new URL('../../../', import.meta.url)
const golden = JSON.parse(readFileSync(new URL('fixtures/patients/golden/messages-fill.json', ROOT), 'utf8')) as FillGolden

describe('골든 머리', () => {
  it('AC-608.1 원본 파일과 커밋을 적어 둔다', () => {
    expect(golden.source).toBe('seoseungkwan/shared@2a1069b')
    expect(golden.file).toBe('YangjiBareun_사전점검/assets/message_templates.html')
    expect(golden.entry).toEqual(['DATE_LINE', 'dateLine', 'withDate', 'parse', 'init'])
  })

  it('AC-608.1 빠지면 안 되는 날짜와 문구가 골든에 있다', () => {
    expect(golden.dates).toEqual(
      expect.arrayContaining([
        '2026-01-31', // 월말
        '2026-02-28',
        '2024-02-29', // 윤년
        '2026-12-31', // 연말
        '2026-03-01', // 한 자리 달·날
        '2026-09-09',
      ]),
    )
    const weekdays = new Set(golden.dateLines.map(({ line }) => /([월화수목금토일])요일/.exec(line)?.[1]))
    expect(weekdays.size).toBe(7) // 평일·토·일 모두
    expect(golden.bodies.map(({ id }) => id)).toEqual(
      expect.arrayContaining(['jusa', 'jinryo', 'date-mid-line', 'refill', 'placeholders-only', 'blank-lines']),
    )
  })
})

describe('AC-608.1 fillTemplate: 원본 withDate와 같다 (골든)', () => {
  it('AC-608.1 DATE_LINE은 원본 정규식 그대로다', () => {
    expect({ source: DATE_LINE.source, flags: DATE_LINE.flags }).toEqual(golden.dateLinePattern)
  })

  it('AC-608.1 dateLine: 날짜마다 원본과 같은 "* M월 D일 X요일 *"', () => {
    expect(golden.dates.map((date) => ({ date, line: dateLine(date) }))).toEqual(golden.dateLines)
  })

  it('AC-608.1 fillTemplate: 문구 × 날짜 결과가 순서까지 원본과 같다', () => {
    const ours = golden.bodies.flatMap(({ id, body }) =>
      golden.dates.map((date) => ({ bodyId: id, date, result: fillTemplate(body, date) })),
    )
    expect(ours).toEqual(golden.fills)
  })
})

describe('AC-608.1 fillTemplate: 사례', () => {
  it('AC-608.1 날짜 글자: 평일·토·일과 한 자리 달·날', () => {
    expect(dateLine('2026-11-02')).toBe('* 11월 2일 월요일 *')
    expect(dateLine('2026-11-07')).toBe('* 11월 7일 토요일 *')
    expect(dateLine('2026-11-08')).toBe('* 11월 8일 일요일 *')
    expect(dateLine('2026-03-01')).toBe('* 3월 1일 일요일 *')
    expect(dateLine('2026-09-09')).toBe('* 9월 9일 수요일 *')
  })

  it('AC-608.1 날짜 글자: 월말·윤년·연말', () => {
    expect(dateLine('2026-01-31')).toBe('* 1월 31일 토요일 *')
    expect(dateLine('2026-02-28')).toBe('* 2월 28일 토요일 *')
    expect(dateLine('2024-02-29')).toBe('* 2월 29일 목요일 *')
    expect(dateLine('2026-12-31')).toBe('* 12월 31일 목요일 *')
  })

  it('AC-608.1 <<DATE>> 줄만 바뀌고 [*1*]·[*2*]와 다른 줄은 그대로다', () => {
    expect(fillTemplate('[*1*]님\n<<DATE>>\n[*2*] 안내\n\n문의', '2026-11-02')).toBe(
      '[*1*]님\n* 11월 2일 월요일 *\n[*2*] 안내\n\n문의',
    )
  })

  it('AC-608.1 <<DATE>>가 줄 가운데 있으면 그 줄 전체가 날짜 줄이 된다', () => {
    expect(fillTemplate('앞 글 <<DATE>> 뒤 글\n다음 줄', '2026-11-02')).toBe('* 11월 2일 월요일 *\n다음 줄')
  })

  it('AC-608.1 이미 날짜 줄이면 요일이 틀렸어도 새 날짜로 다시 채운다', () => {
    expect(fillTemplate('[*1*]님\n* 3월 1일 월요일 *', '2026-12-31')).toBe('[*1*]님\n* 12월 31일 목요일 *')
  })

  it('AC-608.1 날짜를 바꿔 다시 채워도 처음부터 채운 것과 같다', () => {
    const body = '[*1*]님\n앞 <<DATE>> 뒤\n<<DATE>>\n[*2*]'
    expect(fillTemplate(fillTemplate(body, '2026-11-02'), '2026-12-31')).toBe(fillTemplate(body, '2026-12-31'))
  })

  it('AC-608.1 날짜 줄처럼 보여도 아니면 그대로 둔다', () => {
    const body = '* 3월 1일 *\n3월 1일 일요일\n* 3월 1일 일요일 * 안내\n<<date>>'
    expect(fillTemplate(body, '2026-11-02')).toBe(body)
  })

  it('AC-608.1 빈 문구와 빈 줄은 그대로다', () => {
    expect(fillTemplate('', '2026-11-02')).toBe('')
    expect(fillTemplate('\n\n', '2026-11-02')).toBe('\n\n')
  })

  it('AC-608.1 여러 번 불러도 결과가 같다(정규식에 상태가 없다)', () => {
    const body = '* 3월 1일 일요일 *\n* 3월 2일 월요일 *'
    expect(fillTemplate(body, '2026-11-02')).toBe('* 11월 2일 월요일 *\n* 11월 2일 월요일 *')
    expect(fillTemplate(body, '2026-11-02')).toBe('* 11월 2일 월요일 *\n* 11월 2일 월요일 *')
  })
})

describe('AC-608.1 knownDiffs: isYmd가 거짓인 날짜', () => {
  const diff = golden.knownDiffs.find(({ entry, field }) => entry === 'parse' && field === 'date')

  it('AC-608.1 일부러 다르게 한 것은 이 하나뿐이고 사례가 정확히 적혀 있다', () => {
    expect(golden.knownDiffs.map(({ entry, field }) => `${entry}:${field}`)).toEqual(['parse:date'])
    expect(diff?.reason).toBeTruthy()
    expect(Object.keys(diff?.cases ?? {})).toEqual(golden.invalidDates.map(({ date }) => date))
    expect(golden.invalidDates.length).toBeGreaterThan(0)
  })

  it('AC-608.1 원본이 사례마다 찍는 줄(골든): 넘긴 날·1902년·NaN·그 시각의 오늘, 2026-1-5만 맞는 날', () => {
    expect(Object.fromEntries(golden.invalidDates.map(({ date, original }) => [date, original]))).toEqual({
      '2026-02-30': '* 3월 2일 월요일 *',
      '2026-02-29': '* 3월 1일 일요일 *',
      '2026-13-01': '* 1월 1일 금요일 *',
      '0002-11-02': '* 11월 2일 일요일 *', // 1902-11-02
      '2026-1-5': '* 1월 5일 월요일 *',
      '2026-11-xx': '* NaN월 NaN일 undefined요일 *',
      '': '* 11월 1일 일요일 *', // 골든을 만들 때 고정한 시각의 오늘
      어제: '* 11월 1일 일요일 *',
    })
  })

  it('AC-608.1 우리는 어느 사례든 RangeError로 멈춘다', () => {
    for (const { date } of golden.invalidDates) {
      expect(diff?.cases?.[date]).toBe('RangeError')
      expect(() => dateLine(date)).toThrow(RangeError)
      expect(() => fillTemplate('<<DATE>>', date)).toThrow(RangeError)
      expect(() => fillTemplate('날짜 자리 없는 문구', date)).toThrow(RangeError) // 문구와 상관없이 같은 결과
    }
  })

  it('AC-608.1 화면이 부르기 전에 쓸 검사는 isYmd다: 거짓이면 멈추고 참이면 멈추지 않는다', () => {
    for (const { date } of golden.invalidDates) {
      expect(isYmd(date)).toBe(false)
    }
    for (const date of golden.dates) {
      expect(isYmd(date)).toBe(true)
      expect(() => fillTemplate('<<DATE>>', date)).not.toThrow()
    }
  })
})

describe('AC-608.3 defaultSendDate: 내일 (골든)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('AC-608.3 원본이 창을 열 때 고르는 날짜와 같다(하루의 처음·낮·끝, 월말·윤년·연말)', () => {
    expect(golden.defaultSendDates.length).toBeGreaterThan(0)
    expect(golden.defaultSendDates.map(({ now, today }) => ({ now, today, result: defaultSendDate(today) }))).toEqual(
      golden.defaultSendDates,
    )
  })

  it('AC-608.3 사례: 평범한 날·월말·윤년·연말', () => {
    expect(defaultSendDate('2026-11-01')).toBe('2026-11-02')
    expect(defaultSendDate('2026-01-31')).toBe('2026-02-01')
    expect(defaultSendDate('2026-02-28')).toBe('2026-03-01')
    expect(defaultSendDate('2024-02-28')).toBe('2024-02-29')
    expect(defaultSendDate('2026-12-31')).toBe('2027-01-01')
  })

  it('AC-608.3 시계가 아니라 인자로 받은 오늘만 본다', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2030-06-15T00:00:00+09:00'))
    expect(defaultSendDate('2026-11-01')).toBe('2026-11-02')
  })

  it('AC-608.3 없는 날짜는 RangeError', () => {
    expect(() => defaultSendDate('2026-02-30')).toThrow(RangeError)
  })
})
