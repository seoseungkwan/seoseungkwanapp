import { describe, expect, it } from 'vitest'
import { aggregate } from '@/lib/analytics/aggregate'
import { buildSummary } from '@/lib/analytics/compare'
import { eachDay } from '@/lib/analytics/dates'
import type { ConsumptionRow } from '@/types/consumption'
import { AGAIN_WINDOWS, type AgainWindow, type DayAgainPayload, type DayPayload, type MonthPayload, type MonthSections, type RevisitPayload } from '@/types/payload'
import { toDayPayloads } from './toDayPayloads'
import { toMonthPayload } from './toMonthPayload'
import { validateDayPayload, validateMonthPayload, validateMonthSections, validateRxPick } from './validate'

// 주민번호 모양은 소스에 통째로 쓰지 않는다(검문소가 막는다) — 조각을 이어 만든다
const idLike = () => ['900101', '1234567'].join('-')
const joinedIdLike = () => ['900101', '1234567'].join('')
const long = (n: number) => '가'.repeat(n)

// 정상 달 숫자. 시험마다 새로 만든다(고친 값이 다른 시험에 새지 않게)
function good(): MonthPayload {
  return {
    schemaVersion: 2,
    quality: 'valid',
    month: '2026-09',
    partial: false,
    totals: { patients: 12, newPatients: 3, returning: 8, unknown: 1 },
    rx: [
      { code: '643503420', name: '가짜정 10mg', type: '약품', patients: 10, newPatients: 3, returning: 6, followup: [4, 3, 2, 1] },
      { code: 'AA154', name: '0.9% 가짜식염수 1000mL', type: '행위', patients: 2, newPatients: 0, returning: 2, followup: [2, 0, 0, 0] },
    ],
    groups: [{ id: 'g-manual', patients: 4, newPatients: 1, returning: 3, followup: [2, 1, 1, 0] }],
    revisit: { cohort: 3, within7: 1, within14: 2, within30: 2, after30: 1 },
    regions: [
      { name: '서울특별시 강남구 역삼1동', patients: 5 },
      { name: '주소 없음', patients: 7 },
    ],
  }
}

const REMOVE = Symbol('remove')

// good()의 path 자리를 value로 바꾼(REMOVE면 지운) 값. 검사는 unknown을 받으니 모양을 일부러 깨뜨린다
function edited(path: (string | number)[], value: unknown): unknown {
  const payload: unknown = good()
  let at = payload as Record<string | number, unknown>
  for (const key of path.slice(0, -1)) at = at[key] as Record<string | number, unknown>
  const last = path[path.length - 1]
  if (value === REMOVE) delete at[last]
  else at[last] = value
  return payload
}

const rxList = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ code: `X${i}`, name: '가짜', type: '', patients: 1, newPatients: 0, returning: 1, followup: [1, 0, 0, 0] }))
const regionList = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `가짜동${i}`, patients: 5 }))

describe('AC-008.4 맞는 값은 새 객체로 그대로 돌려준다', () => {
  it('같은 내용', () => {
    expect(validateMonthPayload(good())).toEqual(good())
  })

  it('새 객체 — 돌려받은 것을 고쳐도 넣은 값은 그대로', () => {
    const input = good()
    const output = validateMonthPayload(input)!
    expect(output).not.toBe(input)
    output.totals.patients = 99
    output.rx[0].followup[0] = 99
    output.regions.pop()
    expect(input).toEqual(good())
  })

  it.each<[string, (string | number)[], unknown]>([
    ['일부 달', ['partial'], true],
    ['12월', ['month'], '2026-12'],
    ['처방명 100자', ['rx', 0, 'name'], long(100)],
    ['동네 이름 100자', ['regions', 1, 'name'], long(100)],
    // 비트 파일에 유형 칸이 없거나 처방명칭이 빈 칸이면 빈 글자다(집계 필수값이 아니라 오류가 아님)
    ['빈 유형', ['rx', 0, 'type'], ''],
    ['빈 처방명', ['rx', 0, 'name'], ''],
    ['처방·동네가 없는 달', ['rx'], []],
    ['동네가 없는 달', ['regions'], []],
    ['처방 5,000개', ['rx'], rxList(5_000)],
    ['동네 2,000개', ['regions'], regionList(2_000)],
  ])('경계: %s → 통과', (_, path, value) => {
    const payload = edited(path, value)
    expect(validateMonthPayload(payload)).toEqual(payload)
  })

  it('숫자가 모두 0인 달', () => {
    const payload = {
      ...good(),
      totals: { patients: 0, newPatients: 0, returning: 0, unknown: 0 },
      rx: [],
      groups: [],
      revisit: { cohort: 0, within7: 0, within14: 0, within30: 0, after30: 0 },
      regions: [],
    }
    expect(validateMonthPayload(payload)).toEqual(payload)
  })
})

describe('AC-008.4·AC-008.5 하나라도 어긋나면 null', () => {
  it.each([null, undefined, 'x', 42, true, [], [good()]])('객체가 아님: %j', (value) => {
    expect(validateMonthPayload(value)).toBeNull()
  })

  it.each<[string, (string | number)[], unknown]>([
    // 겉
    ['schemaVersion 1(파일럿 모양은 읽지 않는다)', ['schemaVersion'], 1],
    ["schemaVersion '2'", ['schemaVersion'], '2'],
    ['schemaVersion 없음', ['schemaVersion'], REMOVE],
    ['quality incomplete', ['quality'], 'incomplete'],
    ['quality 없음', ['quality'], REMOVE],
    ['13월', ['month'], '2026-13'],
    ['0월', ['month'], '2026-00'],
    ['한 자리 달', ['month'], '2026-9'],
    ['날짜', ['month'], '2026-09-01'],
    ['숫자 달', ['month'], 202609],
    ['달 없음', ['month'], REMOVE],
    ["partial 'false'", ['partial'], 'false'],
    ['partial 0', ['partial'], 0],
    ['partial 없음', ['partial'], REMOVE],
    ['정해진 열쇠 밖: 파일 이름', ['fileName'], '가짜환자.xls'],
    ['정해진 열쇠 밖: 저장 시각', ['savedAt'], '2026-10-27'],
    // 합계
    ['totals null', ['totals'], null],
    ['totals 배열', ['totals'], [12, 3, 8, 1]],
    ['totals 없음', ['totals'], REMOVE],
    ['환자 수 음수', ['totals', 'patients'], -1],
    ['환자 수 소수', ['totals', 'patients'], 12.5],
    ['환자 수 NaN', ['totals', 'patients'], NaN],
    ['환자 수 Infinity', ['totals', 'patients'], Infinity],
    ['환자 수 글자', ['totals', 'patients'], '12'],
    ['patients ≠ 신환+재진+알 수 없음', ['totals', 'patients'], 13],
    ['unknown 없음', ['totals', 'unknown'], REMOVE],
    ['totals에 열쇠 밖 칸', ['totals', 'patientIds'], [1, 2]],
    // 처방
    ['rx 객체', ['rx'], {}],
    ['rx null', ['rx'], null],
    ['rx 줄이 null', ['rx', 0], null],
    ['rx 줄이 글자', ['rx', 0], 'x'],
    ['빈 처방코드', ['rx', 0, 'code'], ''],
    ['처방코드 101자', ['rx', 0, 'code'], long(101)],
    ['처방코드 숫자', ['rx', 0, 'code'], 643503420],
    ['처방명 101자', ['rx', 0, 'name'], long(101)],
    ['처방명 null', ['rx', 0, 'name'], null],
    ['유형 101자', ['rx', 0, 'type'], long(101)],
    ['유형 undefined', ['rx', 0, 'type'], undefined],
    ['처방 환자 수 음수', ['rx', 0, 'patients'], -1],
    ['처방 환자 수 소수', ['rx', 0, 'patients'], 2.5],
    ['처방 신환 > 환자', ['rx', 0, 'newPatients'], 11],
    ['F/U 3칸', ['rx', 0, 'followup'], [4, 3, 3]],
    ['F/U 5칸', ['rx', 0, 'followup'], [4, 3, 2, 1, 0]],
    ['F/U 합 ≠ 환자 수', ['rx', 0, 'followup'], [4, 3, 2, 2]],
    ['F/U 음수(합은 맞음)', ['rx', 0, 'followup'], [5, 3, 3, -1]],
    ['F/U 글자', ['rx', 0, 'followup'], '4,3,2,1'],
    ['F/U 없음', ['rx', 0, 'followup'], REMOVE],
    ['처방별 동네(정해진 열쇠 밖)', ['rx', 0, 'regions'], []],
    ['처방에 환자 번호', ['rx', 0, 'patient'], 7],
    // 동네
    ['regions 객체', ['regions'], {}],
    ['동네 4명', ['regions', 0, 'patients'], 4],
    ['동네 0명', ['regions', 1, 'patients'], 0],
    ['빈 동네 이름', ['regions', 0, 'name'], ''],
    ['동네 이름 101자', ['regions', 0, 'name'], long(101)],
    ['동네에 환자 번호', ['regions', 0, 'patientIds'], [1, 2, 3, 4, 5]],
    // 개인정보 모양 글자
    ['처방명에 휴대폰(붙임표)', ['rx', 0, 'name'], '가짜정 010-1234-5678'],
    ['처방명에 휴대폰(붙여 씀)', ['rx', 0, 'name'], '01012345678'],
    ['처방명에 지역 번호 전화', ['rx', 0, 'name'], '02-123-4567'],
    ['유형에 점으로 나눈 전화', ['rx', 0, 'type'], '031.123.4567'],
    ['동네 이름에 빈칸으로 나눈 휴대폰', ['regions', 0, 'name'], '010 1234 5678'],
    ['처방명에 이메일', ['rx', 0, 'name'], 'fake@example.com'],
    ['처방코드에 주민번호', ['rx', 0, 'code'], idLike()],
    ['동네 이름에 주민번호', ['regions', 0, 'name'], `서울 ${idLike()}`],
    // 개수
    ['처방 5,001개', ['rx'], rxList(5_001)],
    ['동네 2,001개', ['regions'], regionList(2_001)],
  ])('%s', (_, path, value) => {
    expect(validateMonthPayload(edited(path, value))).toBeNull()
  })
})

describe('AC-008.4 toMonthPayload가 만든 달 숫자는 모두 통과한다', () => {
  // 9/1~10/24 매일 환자 셋: 신환·재진·알 수 없음, 처방 둘(하나는 유형·이름이 빈 칸), 동네 둘
  const range = { from: '2026-09-01', to: '2026-10-24' }
  const rows: ConsumptionRow[] = eachDay(range).flatMap((date, d) =>
    [true, false, null].map((firstVisit, i) => ({
      rxCode: i === 0 ? 'D1001' : 'AA154',
      rxName: i === 0 ? '가짜정 10mg' : '',
      rxType: i === 0 ? '약품' : '',
      date,
      firstVisit,
      outpatient: true,
      patient: (d % 9) * 3 + i + 1, // 같은 환자가 여러 날 와서 F/U가 2회 이상으로도 나뉜다
      region: i === 2 ? null : '서울특별시 강남구 역삼동',
    })),
  )
  const aggregates = aggregate(rows)
  const payloads = toMonthPayload({
    quality: 'valid',
    skippedInvalidRows: 0,
    unknownVisitRows: 0,
    aggregates,
    summary: buildSummary({ aggregates, covered: [range], quality: 'valid', today: '2026-10-25' }),
  })!

  it('두 달 모두 그대로 통과', () => {
    expect(payloads).toHaveLength(2)
    expect(payloads.some((p) => p.rx.some((x) => x.followup[1] + x.followup[2] + x.followup[3] > 0))).toBe(true)
    for (const payload of payloads) expect(validateMonthPayload(payload)).toEqual(payload)
  })

  it('JSON으로 저장했다 읽어도 통과한다(읽은 뒤 검사)', () => {
    for (const payload of payloads) {
      expect(validateMonthPayload(JSON.parse(JSON.stringify(payload)))).toEqual(payload)
    }
  })
})

const groupList = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `g-${i}`, patients: 1, newPatients: 0, returning: 1, followup: [1, 0, 0, 0] }))

describe('AC-008.4 v2 달 숫자: 처방 재진 · 그룹 · 재방문', () => {
  it.each<[string, (string | number)[], unknown]>([
    ['그룹이 없는 달', ['groups'], []],
    ['그룹 1,000개', ['groups'], groupList(1_000)],
    ['그룹 id uuid', ['groups', 0, 'id'], '0b9f4d6e-3c2a-4e8b-9a1f-2d7c5e6b8a90'],
    ['그룹 id 64자', ['groups', 0, 'id'], 'g'.repeat(64)],
    ['처방 신환 + 재진 = 환자', ['rx', 0, 'returning'], 7],
    ['재방문 모두 집계 중', ['revisit'], { cohort: 3, within7: null, within14: null, within30: null, after30: null }],
    ['재방문 7일만 숫자', ['revisit'], { cohort: 3, within7: 1, within14: null, within30: null, after30: null }],
    ['집단 = 그 달 신환, 모두 재방문', ['revisit'], { cohort: 3, within7: 3, within14: 3, within30: 3, after30: 0 }],
  ])('경계: %s → 통과', (_, path, value) => {
    const payload = edited(path, value)
    expect(validateMonthPayload(payload)).toEqual(payload)
  })

  it.each<[string, (string | number)[], unknown]>([
    ['처방 재진 없음', ['rx', 0, 'returning'], REMOVE],
    ['처방 재진 음수', ['rx', 0, 'returning'], -1],
    ['처방 신환 + 재진 > 환자', ['rx', 0, 'returning'], 8],
    ['groups 없음', ['groups'], REMOVE],
    ['groups 객체', ['groups'], {}],
    ['그룹 줄 null', ['groups', 0], null],
    ['그룹 신환 + 재진 > 환자', ['groups', 0, 'returning'], 4],
    ['그룹 F/U 합 ≠ 환자', ['groups', 0, 'followup'], [2, 1, 1, 1]],
    ['그룹 재진 없음', ['groups', 0, 'returning'], REMOVE],
    ['그룹에 이름(정해진 열쇠 밖)', ['groups', 0, 'name'], '도수치료'],
    ['그룹에 코드 목록(정해진 열쇠 밖)', ['groups', 0, 'codes'], ['MM101']],
    ['빈 그룹 id', ['groups', 0, 'id'], ''],
    ['그룹 id 65자', ['groups', 0, 'id'], 'g'.repeat(65)],
    ['그룹 id 한글', ['groups', 0, 'id'], '도수치료'],
    ['그룹 id에 빈칸', ['groups', 0, 'id'], 'g manual'],
    ['그룹 id에 밑줄', ['groups', 0, 'id'], 'g_manual'],
    ['그룹 id 숫자', ['groups', 0, 'id'], 7],
    ['그룹 1,001개', ['groups'], groupList(1_001)],
    ['revisit 없음', ['revisit'], REMOVE],
    ['revisit null', ['revisit'], null],
    ['revisit 배열', ['revisit'], [3, 1, 2]],
    ['7일 > 14일', ['revisit', 'within7'], 3],
    ['14일 > 집단', ['revisit', 'within14'], 4],
    ['집단 > 그 달 신환', ['revisit', 'cohort'], 4],
    ['7일만 집계 중(14일은 숫자)', ['revisit', 'within7'], null],
    ['14일 집계 중, 7일 > 집단', ['revisit'], { cohort: 3, within7: 4, within14: null }],
    ['집단 음수', ['revisit', 'cohort'], -1],
    ['14일 소수', ['revisit', 'within14'], 1.5],
    ['7일 글자', ['revisit', 'within7'], '1'],
    ['집단 null', ['revisit', 'cohort'], null],
    ['revisit에 열쇠 밖 칸(비율)', ['revisit', 'rate7'], 0.3],
  ])('%s → null', (_, path, value) => {
    expect(validateMonthPayload(edited(path, value))).toBeNull()
  })
})

describe('AC-008.5 붙여 쓴 주민번호 모양 · 처방코드의 의약품 표준코드', () => {
  it.each<[string, (string | number)[], unknown]>([
    ['처방명에 붙여 쓴 주민번호', ['rx', 0, 'name'], `가짜정 ${joinedIdLike()}`],
    ['유형에 붙여 쓴 주민번호', ['rx', 0, 'type'], joinedIdLike()],
    ['동네 이름에 붙여 쓴 주민번호', ['regions', 0, 'name'], `서울 ${joinedIdLike()}`],
    ['처방코드에 휴대폰', ['rx', 0, 'code'], '01012345678'],
    ['처방코드에 이메일', ['rx', 0, 'code'], 'fake@example.com'],
  ])('%s → null', (_, path, value) => {
    expect(validateMonthPayload(edited(path, value))).toBeNull()
  })

  it('처방코드의 13자리 의약품 표준코드(880…)는 통과한다', () => {
    const payload = edited(['rx', 0, 'code'], ['880612', '1012345'].join(''))
    expect(validateMonthPayload(payload)).toEqual(payload)
  })

  it('월·일·성별 자리가 맞지 않는 13자리 숫자는 처방명에 있어도 통과한다', () => {
    const payload = edited(['rx', 0, 'name'], `가짜정 ${['901301', '1234567'].join('')}`)
    expect(validateMonthPayload(payload)).toEqual(payload)
  })
})

// ── 일 숫자 ───────────────────────────────────────────────

function goodDay(): DayPayload {
  return {
    schemaVersion: 2,
    quality: 'valid',
    day: '2026-09-02',
    partial: false,
    totals: { patients: 12, newPatients: 3, returning: 8, unknown: 1 },
    rx: [
      { code: '643503420', name: '가짜정 10mg', type: '약품', patients: 10, newPatients: 3, returning: 6 },
      { code: 'AA154', name: '', type: '', patients: 2, newPatients: 0, returning: 2 },
    ],
    groups: [{ id: 'g-manual', patients: 4, newPatients: 1, returning: 3 }],
    revisit: { cohort: 3, within7: 2, within14: null, within30: null, after30: null },
  }
}

function editedDay(path: (string | number)[], value: unknown): unknown {
  const payload: unknown = goodDay()
  let at = payload as Record<string | number, unknown>
  for (const key of path.slice(0, -1)) at = at[key] as Record<string | number, unknown>
  const last = path[path.length - 1]
  if (value === REMOVE) delete at[last]
  else at[last] = value
  return payload
}

describe('AC-008.4 일 숫자 검사', () => {
  it('맞는 값은 새 객체로 그대로 돌려준다', () => {
    const input = goodDay()
    const output = validateDayPayload(input)!
    expect(output).toEqual(goodDay())
    expect(output).not.toBe(input)
    output.rx[0].patients = 99
    output.groups.pop()
    expect(input).toEqual(goodDay())
  })

  it.each<[string, (string | number)[], unknown]>([
    ['일부인 날', ['partial'], true],
    ['처방·그룹이 없는 날', ['rx'], []],
    ['재방문 모두 집계 중', ['revisit'], { cohort: 3, within7: null, within14: null, within30: null, after30: null }],
  ])('경계: %s → 통과', (_, path, value) => {
    const payload = editedDay(path, value)
    expect(validateDayPayload(payload)).toEqual(payload)
  })

  it.each([null, 'x', [], [goodDay()]])('객체가 아님: %j', (value) => {
    expect(validateDayPayload(value)).toBeNull()
  })

  it.each<[string, (string | number)[], unknown]>([
    ['schemaVersion 1', ['schemaVersion'], 1],
    ['quality incomplete', ['quality'], 'incomplete'],
    ['날 없음', ['day'], REMOVE],
    ['없는 날', ['day'], '2026-09-31'],
    ['달 모양', ['day'], '2026-09'],
    ['날짜 숫자', ['day'], 20260902],
    ['partial 없음', ['partial'], REMOVE],
    ['달 칸(정해진 열쇠 밖)', ['month'], '2026-09'],
    ['동네(정해진 열쇠 밖)', ['regions'], []],
    ['patients ≠ 신환+재진+알 수 없음', ['totals', 'patients'], 13],
    ['처방에 F/U(정해진 열쇠 밖)', ['rx', 0, 'followup'], [10, 0, 0, 0]],
    ['처방에 동네(정해진 열쇠 밖)', ['rx', 0, 'regions'], []],
    ['처방 신환 + 재진 > 환자', ['rx', 0, 'returning'], 8],
    ['처방 재진 없음', ['rx', 0, 'returning'], REMOVE],
    ['그룹에 F/U(정해진 열쇠 밖)', ['groups', 0, 'followup'], [4, 0, 0, 0]],
    ['그룹 신환 + 재진 > 환자', ['groups', 0, 'returning'], 4],
    ['그룹 id 한글', ['groups', 0, 'id'], '도수치료'],
    ['집단 > 그 날 신환', ['revisit', 'cohort'], 4],
    ['7일만 집계 중(14일은 숫자)', ['revisit'], { cohort: 3, within7: null, within14: 2 }],
    ['14일 집계 중, 7일 > 집단', ['revisit'], { cohort: 3, within7: 4, within14: null }],
    ['처방명에 붙여 쓴 주민번호', ['rx', 0, 'name'], joinedIdLike()],
    ['처방명에 붙임표 주민번호', ['rx', 0, 'name'], idLike()],
    ['처방코드에 붙임표 주민번호', ['rx', 0, 'code'], idLike()],
    ['유형에 전화', ['rx', 0, 'type'], '010-1234-5678'],
    ['처방 5,001개', ['rx'], Array.from({ length: 5_001 }, (_, i) => ({ code: `X${i}`, name: '', type: '', patients: 1, newPatients: 0, returning: 1 }))],
  ])('%s → null', (_, path, value) => {
    expect(validateDayPayload(editedDay(path, value))).toBeNull()
  })
})

// 달·일 검사는 재방문 규칙이 같다. good()·goodDay() 모두 그 칸 신환이 3명이다
const revisitChecks: [string, (revisit: unknown) => unknown][] = [
  ['달', (revisit) => validateMonthPayload({ ...good(), revisit })?.revisit ?? null],
  ['일', (revisit) => validateDayPayload({ ...goodDay(), revisit })?.revisit ?? null],
]

describe.each(revisitChecks)('AC-502.2 재방문 검사(%s)', (_, revisitAfterCheck) => {
  it.each<[string, object, object]>([
    ['두 칸 없음 → null로 읽힘', { cohort: 3, within7: 1, within14: 2 }, { within30: null, after30: null }],
    ['두 칸 없고 14일 집계 중', { cohort: 3, within7: 1, within14: null }, { within30: null, after30: null }],
    ['두 칸 없고 모두 집계 중', { cohort: 3, within7: null, within14: null }, { within30: null, after30: null }],
    ['두 칸이 undefined면 없는 것과 같다(JSON에 남지 않는 값)', { cohort: 3, within7: 1, within14: 2, within30: undefined, after30: undefined }, { within30: null, after30: null }],
    ['after30만 없음 → null로 읽힘', { cohort: 3, within7: 1, within14: 2, within30: 2 }, { within30: 2, after30: null }],
    ['within30만 없고 after30은 null', { cohort: 3, within7: 1, within14: 2, after30: null }, { within30: null, after30: null }],
    ['30일 집계 중', { cohort: 3, within7: 1, within14: 2, within30: null, after30: null }, { within30: null, after30: null }],
    ['30일 숫자, after30 null(뒤만 null)', { cohort: 3, within7: 1, within14: 2, within30: 2, after30: null }, { within30: 2, after30: null }],
    ['30일 + after30 = 집단', { cohort: 3, within7: 1, within14: 2, within30: 2, after30: 1 }, { within30: 2, after30: 1 }],
    ['7일 = 14일 = 30일 = 집단', { cohort: 3, within7: 3, within14: 3, within30: 3, after30: 0 }, { within30: 3, after30: 0 }],
    ['창 안에 아무도 안 오고 모두 after30', { cohort: 3, within7: 0, within14: 0, within30: 0, after30: 3 }, { within30: 0, after30: 3 }],
  ])('경계: %s → 통과', (_, input, readAs) => {
    const { cohort, within7, within14 } = input as { cohort: number; within7: number | null; within14: number | null }
    expect(revisitAfterCheck(input)).toStrictEqual({ cohort, within7, within14, ...readAs })
  })

  it.each<[string, object]>([
    // 여분 열쇠
    ['열쇠 밖 칸(30일 비율)', { cohort: 3, within7: 1, within14: 2, within30: 2, after30: 1, rate30: 0.6 }],
    ['열쇠 밖 칸(60일)', { cohort: 3, within7: 1, within14: 2, within60: 2 }],
    ['열쇠 밖 칸(차트번호)', { cohort: 3, within7: 1, within14: 2, chartNo: 'C-0001' }],
    // 꼭 있어야 하는 열쇠
    ['집단 없음', { within7: 1, within14: 2, within30: 2, after30: 1 }],
    ['7일 없음', { cohort: 3, within14: 2, within30: 2, after30: 1 }],
    ['14일 없음', { cohort: 3, within7: 1, within30: 2, after30: 1 }],
    // 순서
    ['14일 > 30일', { cohort: 3, within7: 1, within14: 2, within30: 1, after30: 0 }],
    ['7일 > 30일', { cohort: 3, within7: 2, within14: 2, within30: 1, after30: 0 }],
    ['30일 > 집단', { cohort: 3, within7: 1, within14: 2, within30: 4, after30: null }],
    ['14일 > 집단(30일 집계 중)', { cohort: 3, within7: 1, within14: 4, within30: null, after30: null }],
    ['14일 > 집단(두 칸 없음)', { cohort: 3, within7: 1, within14: 4 }],
    ['집단 > 그 칸 신환(두 칸 있어도)', { cohort: 4, within7: 1, within14: 2, within30: 2, after30: 1 }],
    // 합
    ['30일 + after30 > 집단', { cohort: 3, within7: 1, within14: 2, within30: 2, after30: 2 }],
    ['after30 혼자 집단을 넘음', { cohort: 3, within7: 0, within14: 0, within30: 0, after30: 4 }],
    // null 번짐
    ['7일 null인데 14일 숫자', { cohort: 3, within7: null, within14: 2, within30: null, after30: null }],
    ['7일 null인데 30일 숫자', { cohort: 3, within7: null, within14: null, within30: 2, after30: null }],
    ['7일 null인데 after30 숫자', { cohort: 3, within7: null, within14: null, within30: null, after30: 1 }],
    ['14일 null인데 30일 숫자', { cohort: 3, within7: 1, within14: null, within30: 2, after30: null }],
    ['14일 null인데 after30 숫자', { cohort: 3, within7: 1, within14: null, within30: null, after30: 1 }],
    ['30일 null인데 after30 숫자', { cohort: 3, within7: 1, within14: 2, within30: null, after30: 1 }],
    ['30일 없는데 after30 숫자', { cohort: 3, within7: 1, within14: 2, after30: 1 }],
    // 값 모양
    ['30일 글자', { cohort: 3, within7: 1, within14: 2, within30: '2', after30: 0 }],
    ['30일 소수', { cohort: 3, within7: 1, within14: 2, within30: 2.5, after30: 0 }],
    ['30일 음수', { cohort: 3, within7: 0, within14: 0, within30: -1, after30: 0 }],
    ['30일 불리언', { cohort: 3, within7: 1, within14: 2, within30: true, after30: 0 }],
    ['after30 글자', { cohort: 3, within7: 1, within14: 2, within30: 2, after30: '1' }],
    ['after30 소수', { cohort: 3, within7: 1, within14: 2, within30: 2, after30: 0.5 }],
    ['after30 음수', { cohort: 3, within7: 1, within14: 2, within30: 2, after30: -1 }],
    ['after30 객체', { cohort: 3, within7: 1, within14: 2, within30: 2, after30: {} }],
  ])('%s → null', (_, input) => {
    expect(revisitAfterCheck(input)).toBeNull()
  })
})

describe('AC-502.2 돌려주는 것은 새 객체다', () => {
  it('두 칸 없는 값을 넣어도 넣은 값은 그대로이고, 돌려받은 것에는 두 칸이 있다', () => {
    const input = { ...good(), revisit: { cohort: 3, within7: 1, within14: 2 } }
    const output = validateMonthPayload(input)!
    expect(output.revisit).not.toBe(input.revisit)
    expect(Object.keys(output.revisit).sort()).toEqual(['after30', 'cohort', 'within14', 'within30', 'within7'])
    expect(Object.keys(input.revisit).sort()).toEqual(['cohort', 'within14', 'within7'])
  })
})

describe('AC-502.3 두 칸이 없는 지금 가짜 자료는 타입도 검사도 고치지 않고 통과한다', () => {
  // 타입을 일부러 적었다: tsc가 두 칸이 '선택'임을 함께 증명한다(payload 밖 시험·feat-ai-report의 가짜 자료와 같은 모양)
  const oldRevisit: RevisitPayload = { cohort: 3, within7: 1, within14: 2 }
  const readAs = { cohort: 3, within7: 1, within14: 2, within30: null, after30: null }

  it('달 숫자', () => {
    const old: MonthPayload = { ...good(), revisit: oldRevisit }
    expect(validateMonthPayload(old)).toStrictEqual({ ...old, revisit: readAs })
  })

  it('일 숫자', () => {
    const old: DayPayload = { ...goodDay(), revisit: oldRevisit }
    expect(validateDayPayload(old)).toStrictEqual({ ...old, revisit: readAs })
  })
})

describe('AC-502.1·AC-502.2 toMonthPayload·toDayPayloads가 만든 30일 숫자는 저장했다 읽어도 그대로다', () => {
  // 9/3 신환이 9/25(22일째)에, 9/4 신환이 10/20(46일째)에 다시 왔다. 9/5 신환은 오지 않았다. 9월 칸의 30일 창은 9/1~10/30
  const line = (patient: number, date: string, firstVisit: boolean): ConsumptionRow => ({
    rxCode: 'D1001',
    rxName: '가짜정 10mg',
    rxType: '약품',
    date,
    firstVisit,
    outpatient: true,
    patient,
    region: null,
  })
  const lines = [
    line(1, '2026-09-03', true),
    line(1, '2026-09-25', false),
    line(2, '2026-09-04', true),
    line(2, '2026-10-20', false),
    line(3, '2026-09-05', true),
  ]
  const aggregates = aggregate(lines)
  const result = {
    quality: 'valid' as const,
    skippedInvalidRows: 0,
    unknownVisitRows: 0,
    aggregates,
    summary: buildSummary({ aggregates, covered: [{ from: '2026-09-01', to: '2026-11-15' }], quality: 'valid', today: '2026-11-16' }),
  }

  it('달 숫자', () => {
    const payload = toMonthPayload(result)!.find((p) => p.month === '2026-09')!
    expect(payload.revisit).toEqual({ cohort: 3, within7: 0, within14: 0, within30: 1, after30: 1 })
    expect(validateMonthPayload(JSON.parse(JSON.stringify(payload)))).toStrictEqual(payload)
  })

  it('일 숫자', () => {
    const payload = toDayPayloads(result)!.find((p) => p.day === '2026-09-04')!
    expect(payload.revisit).toEqual({ cohort: 1, within7: 0, within14: 0, within30: 0, after30: 1 })
    expect(validateDayPayload(JSON.parse(JSON.stringify(payload)))).toStrictEqual(payload)
  })
})

describe('AC-008.4 toMonthPayload·toDayPayloads가 그룹과 함께 만든 숫자는 모두 통과한다', () => {
  // 9/1~10/24 매일 환자 셋(신환·재진·알 수 없음), 같은 환자가 여러 날 와서 재방문·F/U가 생긴다
  const range = { from: '2026-09-01', to: '2026-10-24' }
  const rows: ConsumptionRow[] = eachDay(range).flatMap((date, d) =>
    [true, false, null].map((firstVisit, i) => ({
      rxCode: ['MM101', 'MM102', 'D1001'][i],
      rxName: i === 2 ? '' : '가짜 도수',
      rxType: i === 2 ? '' : '행위',
      date,
      firstVisit,
      outpatient: true,
      patient: (d % 9) * 3 + i + 1,
      region: i === 2 ? null : '서울특별시 강남구 역삼동',
    })),
  )
  const groups = [
    { id: 'g-manual', codes: ['MM101', 'MM102'] },
    { id: '0b9f4d6e-3c2a-4e8b-9a1f-2d7c5e6b8a90', codes: ['D1001'] },
  ]
  const aggregates = aggregate(rows, groups)
  const result = {
    quality: 'valid' as const,
    skippedInvalidRows: 0,
    unknownVisitRows: 0,
    aggregates,
    summary: buildSummary({ aggregates, covered: [range], quality: 'valid', today: '2026-10-25' }),
  }

  it('달 숫자: 그룹·재방문이 있고 모두 통과(JSON으로 저장했다 읽어도)', () => {
    const months = toMonthPayload(result)!
    // 신환은 9일마다 다시 온다 → 14일 재방문만 생긴다
    expect(months.some((p) => p.groups.length === 2 && p.revisit.within14 !== null && p.revisit.within14 > 0)).toBe(true)
    for (const payload of months) {
      expect(validateMonthPayload(payload)).toEqual(payload)
      expect(validateMonthPayload(JSON.parse(JSON.stringify(payload)))).toEqual(payload)
    }
  })

  it('일 숫자: 54일 모두 통과(JSON으로 저장했다 읽어도)', () => {
    const days = toDayPayloads(result)!
    expect(days).toHaveLength(54)
    expect(days.some((p) => p.revisit.within14 !== null && p.revisit.within14 > 0)).toBe(true)
    for (const payload of days) {
      expect(validateDayPayload(payload)).toEqual(payload)
      expect(validateDayPayload(JSON.parse(JSON.stringify(payload)))).toEqual(payload)
    }
  })
})

describe('AC-811.1 validateRxPick', () => {
  const pick = () => ({ code: 'AA154', name: '가짜 주사 1mL' })

  it('AC-811.1: 코드·이름 두 열쇠면 같은 값의 새 객체를 돌려준다', () => {
    const value = pick()
    const checked = validateRxPick(value)
    expect(checked).toEqual(value)
    expect(checked).not.toBe(value)
  })

  it.each([
    ['9자리', '643503420'],
    ['13자리', ['880612', '1012345'].join('')],
  ])('AC-811.1: %s 처방코드는 통과한다', (_, code) => {
    expect(validateRxPick({ code, name: '가짜정' })).toEqual({ code, name: '가짜정' })
  })

  it('AC-811.1: 빈 이름은 통과하고 빈 코드는 거부한다', () => {
    expect(validateRxPick({ code: 'AA154', name: '' })).toEqual({ code: 'AA154', name: '' })
    expect(validateRxPick({ code: '', name: '가짜정' })).toBeNull()
  })

  it.each([
    ['전화(붙임표)', '010-1234-5678'],
    ['전화(붙여 씀)', '01012345678'],
    ['주민번호', idLike()],
    ['메일', 'fake@example.com'],
  ])('AC-811.1: 코드나 이름이 %s 모양이면 거부한다', (_, text) => {
    expect(validateRxPick({ code: text, name: '가짜정' })).toBeNull()
    expect(validateRxPick({ code: 'AA154', name: text })).toBeNull()
  })

  it('AC-811.1: 이름은 붙여 쓴 주민번호 모양도 거부한다', () => {
    expect(validateRxPick({ code: 'AA154', name: joinedIdLike() })).toBeNull()
  })

  it('AC-811.1: 코드·이름은 100자까지 통과하고 101자는 거부한다', () => {
    expect(validateRxPick({ code: long(100), name: long(100) })).toEqual({ code: long(100), name: long(100) })
    expect(validateRxPick({ code: long(101), name: '가짜정' })).toBeNull()
    expect(validateRxPick({ code: 'AA154', name: long(101) })).toBeNull()
  })

  // 표 칸 제약(`[[:cntrl:]]`)보다 일부러 좁게 받는다. 줄·문단 나눔 글자는 글자 분류 설정에 따라 표가 받기도 하지만 여기서는 거른다
  it.each([
    ['줄바꿈', '\n'],
    ['탭', '\t'],
    ['캐리지 리턴', '\r'],
    ['NUL', '\u0000'],
    ['단위 구분', '\u001f'],
    ['DEL', '\u007f'],
    ['C1 제어', '\u0085'],
    ['줄 나눔', ' '],
    ['문단 나눔', ' '],
  ])('AC-811.1: 코드나 이름에 제어 문자(%s)가 있으면 거부한다', (_, char) => {
    expect(validateRxPick({ code: `AA${char}154`, name: '가짜정' })).toBeNull()
    expect(validateRxPick({ code: 'AA154', name: `가짜${char}정` })).toBeNull()
  })

  it('AC-811.1: 다른 열쇠가 더 있거나 열쇠가 모자라면 거부한다', () => {
    expect(validateRxPick({ ...pick(), hospital_id: 'fake-hospital' })).toBeNull()
    expect(validateRxPick({ ...pick(), pick_order: 1 })).toBeNull()
    expect(validateRxPick({ code: 'AA154' })).toBeNull()
    expect(validateRxPick({ name: '가짜정' })).toBeNull()
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['글자', 'AA154'],
    ['숫자', 154],
    ['배열', [{ code: 'AA154', name: '가짜정' }]],
    ['숫자 코드', { code: 154, name: '가짜정' }],
    ['null 이름', { code: 'AA154', name: null }],
  ])('AC-811.1: %s은(는) 거부한다', (_, value) => {
    expect(validateRxPick(value)).toBeNull()
  })
})

// ── 같은 처방 재방문(again) ────────────────────────────────
// goodDay()의 처방: 643503420(환자 10명) · AA154(환자 2명). 숫자는 모두 지어낸 값이다

function goodAgain(): DayAgainPayload {
  return {
    ready: [true, true, false],
    rx: [
      { code: '643503420', starts: 3, back: [1, 2, null], more: [2, 5, null] },
      { code: 'AA154', starts: 1, back: [0, 0, null], more: [0, 0, null] },
    ],
  }
}

function goodAgainDay(): DayPayload {
  return { ...goodDay(), again: goodAgain() }
}

function editedAgainDay(path: (string | number)[], value: unknown): unknown {
  const payload: unknown = goodAgainDay()
  let at = payload as Record<string | number, unknown>
  for (const key of path.slice(0, -1)) at = at[key] as Record<string | number, unknown>
  const last = path[path.length - 1]
  if (value === REMOVE) delete at[last]
  else at[last] = value
  return payload
}

type AgainRowInput = { starts: unknown; back: unknown; more: unknown }

// 처방 643503420(환자 10명) 한 줄만 있는 again. ready는 기본으로 세 창 모두 셀 수 있음
function dayWithAgainRow(row: AgainRowInput, ready: unknown = [true, true, true]): unknown {
  return { ...goodDay(), again: { ready, rx: [{ code: '643503420', ...row }] } }
}

// 처방 n개인 날과 그날 처방마다 시작 1명씩인 again
function manyRxDay(rxCount: number, againCount: number): unknown {
  const rx = Array.from({ length: rxCount }, (_, i) => ({ code: `X${i}`, name: '', type: '', patients: 1, newPatients: 0, returning: 1 }))
  const againRx = Array.from({ length: againCount }, (_, i) => ({ code: `X${i}`, starts: 1, back: [0, 0, 0], more: [0, 0, 0] }))
  return { ...goodDay(), rx, again: { ready: [true, true, true], rx: againRx } }
}

describe('AC-1303.1 again이 없으면 지금과 같고, 있으면 검사한 새 객체로 담는다', () => {
  it('AC-1303.1: again이 없는 옛 줄은 지금처럼 통과하고 돌려준 객체에 again 열쇠가 없다', () => {
    const output = validateDayPayload(goodDay())
    expect(output).toStrictEqual(goodDay())
    expect(Object.keys(output!)).not.toContain('again')
  })

  it('AC-1303.1: again이 undefined면 없는 것과 같다(JSON에 남지 않는 값)', () => {
    const output = validateDayPayload({ ...goodDay(), again: undefined })
    expect(output).toStrictEqual(goodDay())
    expect(Object.keys(output!)).not.toContain('again')
  })

  it('AC-1303.1: again이 있으면 같은 내용으로 담는다', () => {
    expect(validateDayPayload(goodAgainDay())).toStrictEqual(goodAgainDay())
  })

  it('AC-1303.1: 새 객체 — 돌려준 again.rx[0].back을 고쳐도 넣은 값이 그대로다', () => {
    const input = goodAgainDay()
    const output = validateDayPayload(input)!
    expect(output.again).not.toBe(input.again)
    expect(output.again!.ready).not.toBe(input.again!.ready)
    expect(output.again!.rx).not.toBe(input.again!.rx)
    expect(output.again!.rx[0]).not.toBe(input.again!.rx[0])
    output.again!.rx[0].back[0] = 99
    output.again!.rx[0].more[0] = 99
    output.again!.ready[2] = true
    output.again!.rx.pop()
    expect(input).toStrictEqual(goodAgainDay())
  })

  it('AC-1303.1: 저장했다 읽어도(JSON) 그대로다', () => {
    expect(validateDayPayload(JSON.parse(JSON.stringify(goodAgainDay())))).toStrictEqual(goodAgainDay())
  })

  it.each<[string, (string | number)[], unknown]>([
    ['세 창 모두 셀 수 없음', ['again'], { ready: [false, false, false], rx: [{ code: 'AA154', starts: 2, back: [null, null, null], more: [null, null, null] }] }],
    ['세 창 모두 셀 수 있음', ['again'], { ready: [true, true, true], rx: [{ code: 'AA154', starts: 2, back: [1, 1, 2], more: [1, 3, 6] }] }],
    ['시작이 하나도 없는 날', ['again', 'rx'], []],
    ['시작 = 그날 처방 환자 수', ['again', 'rx', 1, 'starts'], 2],
  ])('AC-1303.1: 경계 %s → 통과', (_, path, value) => {
    const payload = editedAgainDay(path, value)
    expect(validateDayPayload(payload)).toStrictEqual(payload)
  })

  it('AC-1303.2: 일부인 날(partial)에 ready가 모두 false면 통과', () => {
    const payload = {
      ...goodDay(),
      partial: true,
      again: { ready: [false, false, false], rx: [{ code: '643503420', starts: 1, back: [null, null, null], more: [null, null, null] }] },
    }
    expect(validateDayPayload(payload)).toStrictEqual(payload)
  })
})

describe('AC-1303.2 again 모양이 틀리면 날 줄 전체가 null', () => {
  it.each<[string, unknown]>([
    ['null', null],
    ['글자', 'x'],
    ['숫자', 42],
    ['배열', [goodAgain()]],
    ['빈 객체', {}],
  ])('AC-1303.2: again이 %s → null', (_, again) => {
    expect(validateDayPayload({ ...goodDay(), again })).toBeNull()
  })

  it.each<[string, (string | number)[], unknown]>([
    // 열쇠
    ['열쇠 밖 칸(날 수)', ['again', 'days'], 7],
    ['열쇠 밖 칸(차트번호)', ['again', 'chartNo'], 'C-0001'],
    ['ready 없음', ['again', 'ready'], REMOVE],
    ['rx 없음', ['again', 'rx'], REMOVE],
    // ready: 참·거짓 셋
    ['ready 둘', ['again', 'ready'], [true, true]],
    ['ready 넷', ['again', 'ready'], [true, true, false, false]],
    ['ready 숫자', ['again', 'ready'], [1, 1, 0]],
    ['ready에 null', ['again', 'ready'], [true, true, null]],
    ['ready 글자', ['again', 'ready'], 'true'],
    ['ready 객체', ['again', 'ready'], { 0: true, 1: true, 2: false }],
    // rx 모양
    ['rx 객체', ['again', 'rx'], {}],
    ['rx null', ['again', 'rx'], null],
  ])('AC-1303.2: %s → null', (_, path, value) => {
    expect(validateDayPayload(editedAgainDay(path, value))).toBeNull()
  })

  // 뒤가 true면 앞도 true. 줄 숫자는 ready에 맞춰(숫자·null) 이 규칙 하나만 어긋나게 한다
  it.each<[string, [boolean, boolean, boolean]]>([
    ['[false, true, false]', [false, true, false]],
    ['[true, false, true]', [true, false, true]],
    ['[false, false, true]', [false, false, true]],
    ['[false, true, true]', [false, true, true]],
  ])('AC-1303.2: ready %s(뒤가 true인데 앞이 false) → null', (_, ready) => {
    const count = (k: number) => (ready[k] ? 0 : null)
    const row = { code: '643503420', starts: 1, back: [count(0), count(1), count(2)], more: [count(0), count(1), count(2)] }
    expect(validateDayPayload({ ...goodDay(), again: { ready, rx: [row] } })).toBeNull()
    expect(validateDayPayload({ ...goodDay(), again: { ready, rx: [] } })).toBeNull()
  })

  it.each<[string, unknown]>([
    ['7일만', [true, false, false]],
    ['7·14일', [true, true, false]],
    ['세 창 모두', [true, true, true]],
  ])('AC-1303.2: 일부인 날(partial)에 ready가 true(%s) → null', (_, ready) => {
    const flags = ready as boolean[]
    const count = (k: number) => (flags[k] ? 0 : null)
    const payload = {
      ...goodDay(),
      partial: true,
      again: { ready, rx: [{ code: '643503420', starts: 1, back: [count(0), count(1), count(2)], more: [count(0), count(1), count(2)] }] },
    }
    expect(validateDayPayload(payload)).toBeNull()
  })
})

describe('AC-1303.3 again.rx 줄 검사', () => {
  it.each<[string, (string | number)[], unknown]>([
    // 네 열쇠만
    ['열쇠 밖 칸(처방명)', ['again', 'rx', 0, 'name'], '가짜정 10mg'],
    ['열쇠 밖 칸(환자 수)', ['again', 'rx', 0, 'patients'], 10],
    ['열쇠 밖 칸(차트번호)', ['again', 'rx', 0, 'chartNo'], 'C-0001'],
    ['열쇠 밖 칸(날짜 목록)', ['again', 'rx', 0, 'dates'], ['2026-09-03']],
    ['code 없음', ['again', 'rx', 0, 'code'], REMOVE],
    ['starts 없음', ['again', 'rx', 0, 'starts'], REMOVE],
    ['back 없음', ['again', 'rx', 0, 'back'], REMOVE],
    ['more 없음', ['again', 'rx', 0, 'more'], REMOVE],
    ['줄이 null', ['again', 'rx', 0], null],
    ['줄이 글자', ['again', 'rx', 0], '643503420'],
    ['줄이 배열', ['again', 'rx', 0], ['643503420', 3]],
    // 코드: 처방 코드 검사(isCode)
    ['코드 빈 글자', ['again', 'rx', 0, 'code'], ''],
    ['코드 101자', ['again', 'rx', 0, 'code'], long(101)],
    ['코드 전화', ['again', 'rx', 0, 'code'], '010-1234-5678'],
    ['코드 붙임표 주민번호', ['again', 'rx', 0, 'code'], idLike()],
    ['코드 메일', ['again', 'rx', 0, 'code'], 'fake@example.com'],
    ['코드 숫자', ['again', 'rx', 0, 'code'], 643503420],
    // starts: 1 이상 정수
    ['starts 0(back·more도 0)', ['again', 'rx', 1, 'starts'], 0],
    ['starts 음수', ['again', 'rx', 0, 'starts'], -1],
    ['starts 소수', ['again', 'rx', 0, 'starts'], 1.5],
    ['starts 글자', ['again', 'rx', 0, 'starts'], '3'],
    ['starts null', ['again', 'rx', 0, 'starts'], null],
    // back·more: 길이 3 배열
    ['back 둘', ['again', 'rx', 0, 'back'], [1, 2]],
    ['back 넷', ['again', 'rx', 0, 'back'], [1, 2, null, null]],
    ['back 글자', ['again', 'rx', 0, 'back'], '1,2'],
    ['back null', ['again', 'rx', 0, 'back'], null],
    ['more 둘', ['again', 'rx', 0, 'more'], [2, 5]],
    ['more 객체', ['again', 'rx', 0, 'more'], { 0: 2, 1: 5, 2: null }],
    // ready[k] true → 0 이상 정수 (goodAgain()의 ready = [true, true, false])
    ['ready true인데 back null', ['again', 'rx', 0, 'back'], [null, 2, null]],
    ['ready true인데 more null', ['again', 'rx', 0, 'more'], [2, null, null]],
    ['back 음수', ['again', 'rx', 0, 'back'], [-1, 2, null]],
    ['back 소수', ['again', 'rx', 0, 'back'], [1.5, 2, null]],
    ['back에 글자', ['again', 'rx', 0, 'back'], ['1', 2, null]],
    ['more 음수', ['again', 'rx', 0, 'more'], [2, -5, null]],
    ['more 불리언', ['again', 'rx', 0, 'more'], [true, 5, null]],
    // ready[k] false → null
    ['ready false인데 back 숫자', ['again', 'rx', 0, 'back'], [1, 2, 2]],
    ['ready false인데 more 숫자', ['again', 'rx', 0, 'more'], [2, 5, 5]],
    ['ready false인데 back 0', ['again', 'rx', 1, 'back'], [0, 0, 0]],
  ])('AC-1303.3: %s → null', (_, path, value) => {
    expect(validateDayPayload(editedAgainDay(path, value))).toBeNull()
  })

  it('AC-1303.3: 줄 5,000개까지 통과한다', () => {
    const payload = manyRxDay(5_000, 5_000)
    expect(validateDayPayload(payload)).toStrictEqual(payload)
  })

  it('AC-1303.3: 줄이 5,000개를 넘으면 거부한다', () => {
    expect(validateDayPayload(manyRxDay(5_000, 5_001))).toBeNull()
  })
})

describe('AC-1303.4 숫자 관계', () => {
  it.each<[string, AgainRowInput, unknown?]>([
    ['back = starts(모든 창)', { starts: 3, back: [3, 3, 3], more: [3, 3, 3] }],
    ['more = N × starts', { starts: 2, back: [2, 2, 2], more: [14, 28, 60] }],
    ['아무도 다시 오지 않음', { starts: 1, back: [0, 0, 0], more: [0, 0, 0] }],
    ['7 = 14 = 30', { starts: 3, back: [1, 1, 1], more: [2, 2, 2] }],
    ['7일만 숫자, 7일 more = 7 × starts', { starts: 1, back: [1, null, null], more: [7, null, null] }, [true, false, false]],
    ['7·14일만 숫자(30일과 견주지 않음)', { starts: 2, back: [2, 2, null], more: [3, 28, null] }, [true, true, false]],
  ])('AC-1303.4: 경계 %s → 통과', (_, row, ready) => {
    const payload = dayWithAgainRow(row, ready)
    expect(validateDayPayload(payload)).toStrictEqual(payload)
  })

  it.each<[string, AgainRowInput, unknown?]>([
    // back ≤ starts
    ['7일 back > starts', { starts: 2, back: [3, 3, 3], more: [3, 3, 3] }],
    ['14일 back > starts', { starts: 2, back: [2, 3, 3], more: [2, 3, 3] }],
    ['30일 back > starts', { starts: 2, back: [2, 2, 3], more: [2, 2, 3] }],
    ['7일만 숫자, back > starts', { starts: 1, back: [2, null, null], more: [2, null, null] }, [true, false, false]],
    // back ≤ more
    ['7일 more < back', { starts: 3, back: [2, 2, 2], more: [1, 2, 2] }],
    ['14일 more < back', { starts: 3, back: [1, 2, 2], more: [1, 1, 2] }],
    ['30일 more < back', { starts: 3, back: [1, 1, 3], more: [1, 1, 2] }],
    // more ≤ N × starts
    ['7일 more > 7 × starts', { starts: 1, back: [1, 1, 1], more: [8, 8, 8] }],
    ['14일 more > 14 × starts', { starts: 1, back: [1, 1, 1], more: [7, 15, 15] }],
    ['30일 more > 30 × starts', { starts: 1, back: [1, 1, 1], more: [7, 14, 31] }],
    ['7일만 숫자, more > 7 × starts', { starts: 2, back: [1, null, null], more: [15, null, null] }, [true, false, false]],
    // 7 ≤ 14 ≤ 30
    ['back 7일 > 14일', { starts: 3, back: [2, 1, 2], more: [2, 2, 2] }],
    ['back 14일 > 30일', { starts: 3, back: [1, 2, 1], more: [2, 2, 2] }],
    ['back 7일 > 30일', { starts: 3, back: [2, 2, 1], more: [2, 2, 2] }],
    ['more 7일 > 14일', { starts: 3, back: [1, 1, 1], more: [3, 2, 3] }],
    ['more 14일 > 30일', { starts: 3, back: [1, 1, 1], more: [2, 3, 2] }],
    ['7·14일만 숫자, back 7일 > 14일', { starts: 3, back: [2, 1, null], more: [3, 3, null] }, [true, true, false]],
    ['7·14일만 숫자, more 7일 > 14일', { starts: 3, back: [1, 1, null], more: [3, 2, null] }, [true, true, false]],
  ])('AC-1303.4: %s → null', (_, row, ready) => {
    expect(validateDayPayload(dayWithAgainRow(row, ready))).toBeNull()
  })
})

describe('AC-1303.5 그날 rx와 견준다', () => {
  it.each<[string, (string | number)[], unknown]>([
    ['그날 rx에 없는 코드', ['again', 'rx', 1, 'code'], 'ZZ999'],
    ['대소문자만 다른 코드(같은 코드가 아니다)', ['again', 'rx', 1, 'code'], 'aa154'],
    ['starts > 그 처방 환자 수', ['again', 'rx', 1, 'starts'], 3],
    ['같은 코드 두 번', ['again', 'rx', 1, 'code'], '643503420'],
  ])('AC-1303.5: %s → null', (_, path, value) => {
    expect(validateDayPayload(editedAgainDay(path, value))).toBeNull()
  })

  it('AC-1303.5: 같은 코드 두 번(숫자까지 같아도) → null', () => {
    const again = goodAgain()
    expect(validateDayPayload({ ...goodDay(), again: { ...again, rx: [again.rx[0], again.rx[0]] } })).toBeNull()
  })

  it('AC-1303.5: 처방이 없는 날에 again 줄이 있으면 → null, 둘 다 없으면 통과', () => {
    expect(validateDayPayload({ ...goodAgainDay(), rx: [] })).toBeNull()
    const empty = { ...goodDay(), rx: [], again: { ready: [true, true, true], rx: [] } }
    expect(validateDayPayload(empty)).toStrictEqual(empty)
  })
})

describe('AC-1303.6 타입: AGAIN_WINDOWS · AgainWindow · DayAgainPayload, 달 숫자는 그대로', () => {
  it('AC-1303.6: AGAIN_WINDOWS는 7·14·30이다', () => {
    expect(AGAIN_WINDOWS).toStrictEqual([7, 14, 30])
    const windows: readonly AgainWindow[] = AGAIN_WINDOWS
    expect(windows).toHaveLength(3)
  })

  it('AC-1303.6: 타입 — AgainWindow는 세 값뿐, AGAIN_WINDOWS는 읽기 전용, DayPayload.again은 있어도 없어도 된다', () => {
    // 아래 @ts-expect-error는 tsc가 증명한다(줄이 틀리지 않으면 tsc가 실패한다)
    const win: AgainWindow = 14
    // @ts-expect-error 7·14·30 밖의 날 수는 AgainWindow가 아니다
    const outside: AgainWindow = 60
    const neverCalled = () => {
      // @ts-expect-error 읽기 전용이다
      AGAIN_WINDOWS.push(60)
    }
    const old: DayPayload = goodDay() // again 없이
    const withAgain: DayPayload = { ...goodDay(), again: goodAgain() }
    const pending: DayAgainPayload = { ready: [false, false, false], rx: [{ code: 'AA154', starts: 1, back: [null, null, null], more: [null, null, null] }] }
    expect([win, outside, typeof neverCalled, 'again' in old, withAgain.again, pending.ready]).toStrictEqual([14, 60, 'function', false, goodAgain(), [false, false, false]])
  })

  it('AC-1303.6: 달 숫자에는 again이 없다(정해진 열쇠 밖 → null), 지금 달 숫자는 그대로 통과', () => {
    expect(validateMonthPayload({ ...good(), again: goodAgain() })).toBeNull()
    expect(validateMonthPayload(good())).toStrictEqual(good())
  })
})

// ── 세 칸 합계(sections) 검사 (spec stats-bit-ai AC-2902.2·AC-2903.2) ──
// 이름은 모두 지어낸 것이다. 시험마다 새로 만든다
function goodSections(): MonthSections {
  return {
    v: 1,
    month: '2026-10',
    partial: false,
    mix: {
      people: 40,
      age: [
        { name: '10세 미만', people: 1 },
        { name: '10대', people: 2 },
        { name: '20대', people: 3 },
        { name: '30대', people: 4 },
        { name: '40대', people: 10 },
        { name: '50대', people: 8 },
        { name: '60대', people: 6 },
        { name: '70대', people: 4 },
        { name: '80세 이상', people: 0 },
        { name: '생년월일 없음', people: 2 },
      ],
      insurance: [
        { name: '건강보험', people: 30 },
        { name: '의료급여', people: 5 },
      ],
      town: [
        { name: '가상동', people: 12 },
        { name: '나무동 (가상시 다구)', people: 5 },
      ],
    },
    hours: {
      openDays: [4, 4, 5, 5, 4, 4, 0],
      weekdays: [30, 20, 25, 22, 18, 10, 0],
      hours: [5, 15, 20, 18, 2, 10, 12, 11, 9, 8, 6, 4, 5],
      unknown: 3,
    },
    doctors: [
      { name: '김가상', patients: 25, newPatients: 4, amount: 1_234_560 },
      { name: '이가상', patients: 20, newPatients: 0, amount: -3_000 },
    ],
  }
}

const SECTIONS_REMOVE = Symbol('remove')

// goodSections()의 path 자리를 value로 바꾼(SECTIONS_REMOVE면 지운) 값
function editedSections(path: (string | number)[], value: unknown): unknown {
  const copy = goodSections() as unknown as Record<string | number, unknown>
  let at = copy
  for (const key of path.slice(0, -1)) at = at[key] as Record<string | number, unknown>
  const last = path[path.length - 1]
  if (value === SECTIONS_REMOVE) {
    if (Array.isArray(at)) at.splice(last as number, 1)
    else delete at[last]
  } else at[last] = value
  return copy
}

describe('AC-2902.2·AC-2903.2 validateMonthSections: 맞는 값은 새 객체로 돌려준다', () => {
  it('AC-2902.2 맞는 세 칸 합계는 같은 값의 새 객체다(안쪽 줄도 새 객체)', () => {
    const value = goodSections()
    const checked = validateMonthSections(value)
    expect(checked).toStrictEqual(goodSections())
    expect(checked).not.toBe(value)
    expect(checked?.mix).not.toBe(value.mix)
    expect(checked?.mix.age[0]).not.toBe(value.mix.age[0])
    expect(checked?.hours.hours).not.toBe(value.hours.hours)
    expect(checked?.doctors[0]).not.toBe(value.doctors[0])
  })

  it('AC-2903.2 덜 덮인 달·빈 보험·빈 동네·원장님 없음(한 분)·접수 0건 달도 받는다', () => {
    const empty: MonthSections = {
      v: 1,
      month: '2026-11',
      partial: true,
      mix: { people: 0, age: goodSections().mix.age.map(({ name }) => ({ name, people: 0 })), insurance: [], town: [] },
      hours: { openDays: [0, 0, 0, 0, 0, 0, 0], weekdays: [0, 0, 0, 0, 0, 0, 0], hours: Array(13).fill(0), unknown: 0 },
      doctors: [],
    }
    expect(validateMonthSections(empty)).toStrictEqual(empty)
  })

  it('AC-2903.2 금액은 원 단위 안전 정수다(환불로 0·음수도 된다)', () => {
    for (const amount of [0, -1, Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER]) {
      expect(validateMonthSections(editedSections(['doctors', 0, 'amount'], amount)), String(amount)).not.toBeNull()
    }
  })

  it('AC-2903.2 줄 수 한도까지는 받는다: 보험 100줄 · 동네 10줄 · 원장님 100줄', () => {
    const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `가상${i}`, people: 5 }))
    expect(validateMonthSections(editedSections(['mix', 'insurance'], rows(100)))).not.toBeNull()
    expect(validateMonthSections(editedSections(['mix', 'town'], rows(10)))).not.toBeNull()
    const doctors = Array.from({ length: 100 }, (_, i) => ({ name: `가상${i}`, patients: 1, newPatients: 0, amount: 0 }))
    expect(validateMonthSections(editedSections(['doctors'], doctors))).not.toBeNull()
  })
})

describe('AC-2902.2·AC-2903.2 validateMonthSections: 하나라도 어긋나면 null', () => {
  const cases: Array<[string, unknown]> = [
    ['객체가 아님(배열)', []],
    ['객체가 아님(null)', null],
    ['객체가 아님(글자)', '{}'],
    ['모르는 열쇠', { ...goodSections(), extra: 1 }],
    ['열쇠 빠짐(doctors)', editedSections(['doctors'], SECTIONS_REMOVE)],
    ['v가 2', editedSections(['v'], 2)],
    ['v가 글자', editedSections(['v'], '1')],
    ['달 글자 틀림(13월)', editedSections(['month'], '2026-13')],
    ['달 글자 틀림(날짜)', editedSections(['month'], '2026-10-01')],
    ['partial이 글자', editedSections(['partial'], 'false')],
    ['mix 모르는 열쇠', editedSections(['mix', 'city'], [])],
    ['mix 열쇠 빠짐', editedSections(['mix', 'town'], SECTIONS_REMOVE)],
    ['연령대 아홉 줄', editedSections(['mix', 'age', 9], SECTIONS_REMOVE)],
    ['연령대 열한 줄', editedSections(['mix', 'age', 10], { name: '90대', people: 0 })],
    ['연령대 합이 실환자와 다름', editedSections(['mix', 'age', 0, 'people'], 2)],
    ['연령대 줄 모르는 열쇠', editedSections(['mix', 'age', 0, 'visits'], 1)],
    ['연령대 이름이 같은 줄', editedSections(['mix', 'age', 1, 'name'], '10세 미만')],
    ['보험 4명 줄', editedSections(['mix', 'insurance', 1, 'people'], 4)],
    ['보험이 실환자보다 많음', editedSections(['mix', 'insurance', 0, 'people'], 41)],
    ['보험 이름이 같은 줄', editedSections(['mix', 'insurance', 1, 'name'], '건강보험')],
    ['보험 101줄', editedSections(['mix', 'insurance'], Array.from({ length: 101 }, (_, i) => ({ name: `가상${i}`, people: 5 })))],
    ['동네 4명 줄', editedSections(['mix', 'town', 1, 'people'], 4)],
    ['동네 11줄', editedSections(['mix', 'town'], Array.from({ length: 11 }, (_, i) => ({ name: `가상${i}동`, people: 5 })))],
    ['동네 이름이 같은 줄', editedSections(['mix', 'town', 1, 'name'], '가상동')],
    ['문 연 날 여섯 칸', editedSections(['hours', 'openDays', 6], SECTIONS_REMOVE)],
    ['문 연 날 여덟 칸', editedSections(['hours', 'openDays', 7], 0)],
    ['요일 합 여섯 칸', editedSections(['hours', 'weekdays', 6], SECTIONS_REMOVE)],
    ['시간 열두 칸', editedSections(['hours', 'hours', 12], SECTIONS_REMOVE)],
    ['시간 열네 칸', editedSections(['hours', 'hours', 13], 0)],
    ['한 요일 문 연 날이 6일(한 달에 많아야 5번)', editedSections(['hours', 'openDays', 0], 6)],
    ['요일 합과 시간 합이 다름', editedSections(['hours', 'hours', 0], 6)],
    ['접수가 있는데 문 연 날 0', editedSections(['hours', 'openDays', 0], 0)],
    ['문 열었는데 접수 0', editedSections(['hours', 'openDays', 6], 1)],
    ['hours 모르는 열쇠', editedSections(['hours', 'cells'], [])],
    ['원장님 101줄', editedSections(['doctors'], Array.from({ length: 101 }, (_, i) => ({ name: `가상${i}`, patients: 1, newPatients: 0, amount: 0 })))],
    ['원장님 신환이 실환자보다 많음', editedSections(['doctors', 1, 'newPatients'], 21)],
    ['원장님 이름이 같은 줄', editedSections(['doctors', 1, 'name'], '김가상')],
    ['원장님 줄 모르는 열쇠', editedSections(['doctors', 0, 'visits'], 3)],
    ['원장님 줄 열쇠 빠짐', editedSections(['doctors', 0, 'amount'], SECTIONS_REMOVE)],
  ]
  it.each(cases)('AC-2902.2 %s', (_, value) => {
    expect(validateMonthSections(value)).toBeNull()
  })

  // 수: 0 이상 안전 정수(금액만 음수 가능)
  const counts: Array<(string | number)[]> = [
    ['mix', 'people'],
    ['mix', 'age', 4, 'people'],
    ['mix', 'insurance', 0, 'people'],
    ['mix', 'town', 0, 'people'],
    ['hours', 'openDays', 0],
    ['hours', 'weekdays', 0],
    ['hours', 'hours', 0],
    ['hours', 'unknown'],
    ['doctors', 0, 'patients'],
    ['doctors', 0, 'newPatients'],
  ]
  for (const path of counts) {
    it(`AC-2902.2 ${path.join('.')}이 음수·소수·안전 정수 밖·글자·NaN이면 null`, () => {
      for (const bad of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, '3', Number.NaN, null]) {
        expect(validateMonthSections(editedSections(path, bad)), String(bad)).toBeNull()
      }
    })
  }

  it('AC-2902.2 금액이 소수·안전 정수 밖·글자면 null', () => {
    for (const bad of [0.5, Number.MAX_SAFE_INTEGER + 1, -Number.MAX_SAFE_INTEGER - 1, '1000', Number.NaN, null]) {
      expect(validateMonthSections(editedSections(['doctors', 0, 'amount'], bad)), String(bad)).toBeNull()
    }
  })

  // 묶음 이름: isText(…, true)를 넘어야 한다(연락처·식별 번호 모양·메일·100자 넘음·빈 글자·글자 아님)
  const names: Array<(string | number)[]> = [
    ['mix', 'age', 0, 'name'],
    ['mix', 'insurance', 0, 'name'],
    ['mix', 'town', 0, 'name'],
    ['doctors', 0, 'name'],
  ]
  for (const path of names) {
    it(`AC-2903.2 ${path.join('.')}이 isText를 못 넘거나 빈 이름이면 null`, () => {
      for (const bad of ['', '010-1234-5678', idLike(), joinedIdLike(), 'a@b.co', long(101), 3, null]) {
        expect(validateMonthSections(editedSections(path, bad)), String(bad)).toBeNull()
      }
      expect(validateMonthSections(editedSections(path, long(100)))).not.toBeNull()
    })
  }
})
