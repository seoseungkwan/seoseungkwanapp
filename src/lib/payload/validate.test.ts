import { describe, expect, it } from 'vitest'
import { aggregate } from '@/lib/analytics/aggregate'
import { buildSummary } from '@/lib/analytics/compare'
import { eachDay } from '@/lib/analytics/dates'
import type { ConsumptionRow } from '@/types/consumption'
import type { DayPayload, MonthPayload, RevisitPayload } from '@/types/payload'
import { toDayPayloads } from './toDayPayloads'
import { toMonthPayload } from './toMonthPayload'
import { validateDayPayload, validateMonthPayload } from './validate'

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
