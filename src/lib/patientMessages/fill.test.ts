import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isYmd } from '@/lib/analytics/dates'
import { DEFAULT_HOURS } from '@/types/clinicProfile'
import { DEFAULT_TEMPLATES } from './defaults'
import { clinicInfoOf, DATE_LINE, dateLine, defaultSendDate, fillClinic, fillTemplate, NO_CLINIC_INFO, type ClinicInfo } from './fill'

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

// ── 병원 정보 채우기(spec clinic-profile REQ-6605, design.md 7절) ─────────────────
// 병원 이름·번호는 지어낸 것이다
const INFO: ClinicInfo = {
  name: '튼튼정형외과',
  phone: '02-123-4567',
  hoursText: '평일 09:00~18:00(점심 13:00~14:00), 토 09:00~13:00, 일·공휴일 휴진',
}
const SLOTS = '[병원명 설정 필요]\n병원명 설정 필요입니다.\n문의: 전화번호 설정 필요\n진료시간: 병원 진료시간 설정 필요'

describe('AC-6605.1 fillClinic: 병원 정보를 넣는다', () => {
  it('AC-6605.1 네 자리를 병원 이름·전화·진료시간으로 바꾼다([병원명 설정 필요]는 괄호까지)', () => {
    expect(fillClinic(SLOTS, INFO)).toBe(
      '튼튼정형외과\n튼튼정형외과입니다.\n문의: 02-123-4567\n진료시간: 평일 09:00~18:00(점심 13:00~14:00), 토 09:00~13:00, 일·공휴일 휴진',
    )
  })

  it('AC-6605.1 휴대폰 모양 전화도 그대로 넣는다', () => {
    expect(fillClinic('문의: 전화번호 설정 필요', { ...INFO, phone: '010-1234-5678' })).toBe('문의: 010-1234-5678')
  })

  it('AC-6605.1 같은 자리가 여러 번 있으면 모두 바꾼다', () => {
    expect(fillClinic('병원명 설정 필요 · 병원명 설정 필요\n전화번호 설정 필요 / 전화번호 설정 필요', INFO)).toBe('튼튼정형외과 · 튼튼정형외과\n02-123-4567 / 02-123-4567')
  })

  it.each([
    ['이름', { ...INFO, name: '' }, '[병원명 설정 필요]\n병원명 설정 필요입니다.\n문의: 02-123-4567\n진료시간: 평일 09:00~18:00(점심 13:00~14:00), 토 09:00~13:00, 일·공휴일 휴진'],
    ['전화', { ...INFO, phone: '' }, '튼튼정형외과\n튼튼정형외과입니다.\n문의: 전화번호 설정 필요\n진료시간: 평일 09:00~18:00(점심 13:00~14:00), 토 09:00~13:00, 일·공휴일 휴진'],
    ['진료시간', { ...INFO, hoursText: '' }, '튼튼정형외과\n튼튼정형외과입니다.\n문의: 02-123-4567\n진료시간: 병원 진료시간 설정 필요'],
  ])('AC-6605.1 %s 값이 비었으면 그 자리는 그대로 둔다', (_name, info, expected) => {
    expect(fillClinic(SLOTS, info)).toBe(expected)
  })

  it('AC-6605.1 빈 정보면 글이 그대로다', () => {
    expect(NO_CLINIC_INFO).toEqual({ name: '', phone: '', hoursText: '' })
    expect(fillClinic(SLOTS, NO_CLINIC_INFO)).toBe(SLOTS)
  })

  it('AC-6605.1 값 안의 $ 글자는 바꾸기 규칙으로 읽지 않고 그대로 넣는다', () => {
    expect(fillClinic('[병원명 설정 필요] · 병원명 설정 필요', { ...INFO, name: "$& $' $1 $$" })).toBe("$& $' $1 $$ · $& $' $1 $$")
  })

  it('AC-6605.1 다른 글·[*1*]·[*2*]·날짜 줄은 건드리지 않고, 다시 채워도 같다', () => {
    const body = fillTemplate('[*1*]님\n<<DATE>>\n[*2*] 안내\n' + SLOTS, '2026-11-02')
    const once = fillClinic(body, INFO)
    expect(once.startsWith('[*1*]님\n* 11월 2일 월요일 *\n[*2*] 안내\n튼튼정형외과\n')).toBe(true)
    expect(fillClinic(once, INFO)).toBe(once)
  })

  it('AC-6605.1 기본 문구 셋에 설정 필요 글자가 남지 않고, 기본 문구(DEFAULT_TEMPLATES)는 그대로다', () => {
    const before = JSON.stringify(DEFAULT_TEMPLATES)
    for (const { body } of DEFAULT_TEMPLATES) {
      expect(body).toContain('설정 필요')
      const filled = fillClinic(fillTemplate(body, '2026-11-02'), INFO)
      expect(filled).not.toContain('설정 필요')
      expect(filled.startsWith('튼튼정형외과\n')).toBe(true)
      expect(filled).toContain('문의: 02-123-4567')
    }
    expect(JSON.stringify(DEFAULT_TEMPLATES)).toBe(before)
  })
})

describe('AC-6605.1 clinicInfoOf: 화면이 읽은 병원 정보 → 넣을 값', () => {
  const view = (over: Partial<Parameters<typeof clinicInfoOf>[0]> = {}): Parameters<typeof clinicInfoOf>[0] => ({
    state: 'ready',
    saved: true,
    name: '튼튼정형외과',
    profile: { phone: '021234567', hours: [...DEFAULT_HOURS] },
    ...over,
  })

  it('AC-6605.1 읽었으면 이름, 전화(02-123-4567·010-1234-5678 모양), 진료시간 글이다', () => {
    expect(clinicInfoOf(view())).toEqual(INFO)
    expect(clinicInfoOf(view({ profile: { phone: '01012345678', hours: [...DEFAULT_HOURS] } })).phone).toBe('010-1234-5678')
  })

  it.each(['loading', 'failed'] as const)('AC-6605.1 %s이면 빈 정보다(글을 그대로 둔다)', (state) => {
    expect(clinicInfoOf(view({ state }))).toEqual(NO_CLINIC_INFO)
  })

  it('AC-6605.1 저장한 적 없는 병원은 이름(가입 이름)만 넣는다. 전화·진료시간(기본값)은 넣지 않는다', () => {
    expect(clinicInfoOf(view({ saved: false, name: '가입정형외과', profile: { phone: null, hours: [...DEFAULT_HOURS] } }))).toEqual({ name: '가입정형외과', phone: '', hoursText: '' })
  })

  it('AC-6605.1 전화가 없거나 문 여는 날이 없으면 그 값은 빈 글이다', () => {
    expect(clinicInfoOf(view({ profile: { phone: null, hours: [null, null, null, null, null, null, null] } }))).toEqual({ name: '튼튼정형외과', phone: '', hoursText: '' })
  })
})
