import { describe, expect, it } from 'vitest'
import type { RxGroupDef } from '@/types/analysis'
import { codesByDay, dropoff, dropoffLines, type DropoffRow } from './dropoff'

// 몇 번까지 받나 (stats-insights REQ-6103 AC-6103.1). 환자 번호·날·처방 코드는 모두 지어낸 값이다.
// 메모리 기간 1/1~6/30, 자료 끝 날 6/30 → '끝난 환자' = 그 묶음을 마지막으로 받은 날이 5/31(6/30 − 30일)보다 앞이거나 같은 환자
const RANGE = { from: '2026-01-01', to: '2026-06-30' }

const rx = (patient: number, date: string, rxCode: string): DropoffRow => ({ patient, date, rxCode })
// 같은 환자가 여러 날 같은 처방을 받은 줄
const days = (patient: number, code: string, dates: readonly string[]) => dates.map((date) => rx(patient, date, code))

const MANUAL: RxGroupDef = { id: 't00000000000000a1', codes: ['MAN1', 'man2'] }
const SHOCK: RxGroupDef = { id: 't00000000000000a2', codes: ['ESW'], out: ['XOUT'] }
const NOBODY: RxGroupDef = { id: 't00000000000000a3', codes: ['NONE'] }

const TEN_DAYS = ['2026-01-10', '2026-01-17', '2026-01-24', '2026-01-31', '2026-02-07', '2026-02-14', '2026-02-21', '2026-02-28', '2026-03-07', '2026-03-14']

// 1번: 3회(1/12는 MAN1·MAN2 같은 날 → 1회) · 6/20에 다른 처방만 받음(묶음 마지막 날은 1/19)
// 2번: 1회 · 충격파는 2/1(빼는 처방 같은 날 → 안 셈)·2/8 → 1회
// 3번: 2회 · 충격파는 빼는 처방과 같은 날뿐 → 충격파 대상 아님
// 4번: 첫 내원일이 기간 앞 → 뺌 · 5번: 첫 내원일 없음 → 뺌
// 6번: 3/1·5/31(자료 끝 날 − 30일과 같은 날) → 2회, 대상 · 7번: 3/2·6/1 → 아직 다니는 중, 뺌
// 8번: 10회
const ROWS: DropoffRow[] = [
  ...days(1, 'MAN1', ['2026-01-05', '2026-01-12', '2026-01-19']),
  rx(1, '2026-01-12', 'MAN2'),
  rx(1, '2026-06-20', 'OTHER'),
  rx(2, '2026-02-01', 'MAN1'),
  rx(2, '2026-02-01', 'ESW'),
  rx(2, '2026-02-01', 'XOUT'),
  rx(2, '2026-02-08', 'ESW'),
  ...days(3, 'MAN2', ['2026-02-10', '2026-02-17']),
  rx(3, '2026-02-10', 'ESW'),
  rx(3, '2026-02-10', 'xout'),
  ...days(4, 'MAN1', ['2026-01-02', '2026-01-09']),
  ...days(5, 'MAN1', ['2026-01-03']),
  ...days(6, 'MAN1', ['2026-03-01', '2026-05-31']),
  ...days(7, 'MAN1', ['2026-03-02', '2026-06-01']),
  ...days(8, 'MAN1', TEN_DAYS),
]
const FIRST = new Map<number, string>([
  [1, '2026-01-05'],
  [2, '2026-02-01'],
  [3, '2026-02-10'],
  [4, '2025-12-20'],
  [6, '2026-03-01'],
  [7, '2026-03-02'],
  [8, '2026-01-10'],
])

const run = (rows: readonly DropoffRow[] = ROWS, groups: readonly RxGroupDef[] = [MANUAL, SHOCK, NOBODY], first: ReadonlyMap<number, string> = FIRST) =>
  dropoff({ rows, first, groups, range: RANGE })

// 환자 번호 → 받은 횟수(서로 다른 날 수). 날은 1/1부터 하루씩, 모두 끝난 환자다
function cohort(counts: readonly number[]) {
  const rows: DropoffRow[] = []
  const first = new Map<number, string>()
  counts.forEach((count, i) => {
    const patient = 100 + i
    first.set(patient, '2026-01-01')
    for (let d = 1; d <= count; d++) rows.push(rx(patient, `2026-01-${String(d).padStart(2, '0')}`, 'MAN1'))
  })
  return { rows, first }
}

describe('AC-6103.1 dropoff: 묶음마다 처음 받은 신환이 몇 번까지 받았나', () => {
  it('AC-6103.1: 묶음마다 대상 수·1~6회 이상·10회 이상·1회만·평균·가장 많이 빠지는 곳이고 n이 0인 묶음은 뺀다(묶음 차례 그대로)', () => {
    expect(run()).toEqual([
      // 대상 1·2·3·6·8번 = 3·1·2·2·10회
      { group: MANUAL.id, n: 5, atLeast: [5, 4, 2, 1, 1, 1], ten: 1, once: 1, average: 3.6, drop: 2 },
      // 대상 2번 = 1회(빼는 처방을 받은 날은 세지 않는다)
      { group: SHOCK.id, n: 1, atLeast: [1, 0, 0, 0, 0, 0], ten: 0, once: 1, average: 1, drop: 1 },
    ])
  })

  it('AC-6103.1: 대상 = 첫 내원일이 메모리 기간 안(첫날·끝날 포함)이고 마지막으로 받은 날이 자료 끝 날 − 30일보다 앞이거나 같은 환자', () => {
    const edge = [...days(10, 'MAN1', ['2026-01-01']), ...days(11, 'MAN1', ['2026-06-30']), ...days(12, 'MAN1', ['2026-05-31']), ...days(13, 'MAN1', ['2026-06-01'])]
    const first = new Map([
      [10, '2026-01-01'], // 기간 첫날 · 1/1에 끝남 → 대상
      [11, '2026-06-30'], // 기간 끝날 · 아직 다니는 중 → 뺌
      [12, '2026-05-31'], // 마지막 = 5/31 → 대상
      [13, '2026-07-01'], // 기간 뒤 → 뺌
    ])
    expect(run(edge, [MANUAL], first)).toEqual([{ group: MANUAL.id, n: 2, atLeast: [2, 0, 0, 0, 0, 0], ten: 0, once: 2, average: 1, drop: 1 }])
  })

  it('AC-6103.1: 마지막으로 받은 날은 그 묶음을 받은 날이다(다른 처방으로 더 왔어도 그 묶음은 끝났다)', () => {
    const rows = [...days(1, 'MAN1', ['2026-01-05']), ...days(1, 'OTHER', ['2026-06-29'])]
    expect(run(rows, [MANUAL], new Map([[1, '2026-01-05']]))).toEqual([{ group: MANUAL.id, n: 1, atLeast: [1, 0, 0, 0, 0, 0], ten: 0, once: 1, average: 1, drop: 1 }])
  })

  it('AC-6103.1: 횟수는 그 묶음을 받은 서로 다른 날 수다(같은 날 여러 줄·같은 묶음 다른 코드·대소문자는 한 번)', () => {
    const rows = [rx(1, '2026-01-05', 'MAN1'), rx(1, '2026-01-05', 'MAN1'), rx(1, '2026-01-05', 'MAN2'), rx(1, '2026-01-06', 'man1')]
    expect(run(rows, [MANUAL], new Map([[1, '2026-01-05']]))[0]).toMatchObject({ n: 1, atLeast: [1, 1, 0, 0, 0, 0], once: 0, average: 2 })
  })

  it('AC-6103.1: 빼는 처방·조건은 처방 칸 묶음과 같은 규칙이다(그날 빼는 처방을 받았거나 조건 처방을 같이 받은 날은 세지 않는다)', () => {
    const withCond: RxGroupDef = { id: 't00000000000000a4', codes: ['CA'], cond: [{ code: 'CA', unless: ['CB'] }] }
    const rows = [rx(1, '2026-01-05', 'CA'), rx(1, '2026-01-05', 'CB'), rx(1, '2026-01-06', 'CA'), rx(2, '2026-01-07', 'CA'), rx(2, '2026-01-07', 'CB')]
    const first = new Map([
      [1, '2026-01-05'],
      [2, '2026-01-07'],
    ])
    // 1번은 1/6 하루만 센다. 2번은 센 날이 없어 그 묶음을 받지 않은 환자다
    expect(run(rows, [withCond], first)).toEqual([{ group: withCond.id, n: 1, atLeast: [1, 0, 0, 0, 0, 0], ten: 0, once: 1, average: 1, drop: 1 }])
  })

  it('AC-6103.1: 평균 횟수는 소수 1자리 반올림이다(1.75 → 1.8, 5/3 → 1.7)', () => {
    const a = cohort([1, 1, 2, 3])
    expect(run(a.rows, [MANUAL], a.first)[0]!.average).toBe(1.8)
    const b = cohort([1, 2, 2])
    expect(run(b.rows, [MANUAL], b.first)[0]!.average).toBe(1.7)
  })

  it('AC-6103.1: 가장 많이 빠지는 곳 = 1~5 가운데 k회 이상 − (k+1)회 이상이 가장 큰 k, 같으면 작은 k', () => {
    const tie = cohort([1, 2]) // 1→2: 1명 · 2→3: 1명 → 작은 k
    expect(run(tie.rows, [MANUAL], tie.first)[0]!.drop).toBe(1)
    const late = cohort([5, 5, 5, 6, 7]) // 5→6: 3명이 가장 크다
    expect(run(late.rows, [MANUAL], late.first)[0]).toMatchObject({ atLeast: [5, 5, 5, 5, 5, 2], drop: 5 })
    const many = cohort([12, 10, 9, 3]) // 10회 이상 2명, 3→4: 1명 · 9→10: 6회 이상 안이라 k 밖
    expect(run(many.rows, [MANUAL], many.first)[0]).toMatchObject({ n: 4, atLeast: [4, 4, 4, 3, 3, 3], ten: 2, once: 0, drop: 3 })
  })

  it('AC-6103.1: 대상이 없으면 빈 목록이고, 결과에는 묶음 열쇠와 숫자뿐 환자 번호가 없다', () => {
    expect(run([], [MANUAL, SHOCK])).toEqual([])
    expect(run(ROWS, [])).toEqual([])
    for (const line of run()) {
      expect(Object.keys(line).sort()).toEqual(['atLeast', 'average', 'drop', 'group', 'n', 'once', 'ten'])
      expect(Object.values(line).flat().every((value) => typeof value === 'number' || value === line.group)).toBe(true)
    }
  })
})

// 통계 합계 저장(admin-view REQ-8018 AC-8018.2): 달 줄 dropoff는 대상 환자를 첫 진료 달로 나눠 센다. 나눌 수 있게 두 조각을 내보낸다
describe('AC-8018.2 dropoff를 나눠 셀 수 있다: codesByDay(대상 환자마다 날 → 처방) · dropoffLines(그 환자들을 묶음마다 센다)', () => {
  const GROUPS = [MANUAL, SHOCK, NOBODY]
  const input = { rows: ROWS, first: FIRST, groups: GROUPS, range: RANGE }

  it('AC-8018.2: 두 조각을 이으면 dropoff()와 같다(대상은 첫 내원일이 기간 안인 환자뿐, 자료 끝 날 = 기간 끝)', () => {
    const patients = codesByDay(input)
    expect([...patients.keys()].sort((a, b) => a - b)).toEqual([1, 2, 3, 6, 7, 8]) // 4번(기간 앞)·5번(첫 내원일 없음)은 없다
    expect(patients.get(1)?.get('2026-01-12')).toEqual(['MAN1', 'MAN2'])
    expect(dropoffLines([...patients.values()], GROUPS, RANGE.to)).toEqual(dropoff(input))
  })

  it('AC-8018.2: 환자를 둘로 나눠 센 줄의 대상·k회 이상·10회 이상·1회만을 묶음마다 더하면 전체와 같다(평균은 반올림한 값이라 더하지 않는다)', () => {
    const patients = codesByDay(input)
    const early = [...patients].filter(([patient]) => FIRST.get(patient)! < '2026-02-01').map(([, days]) => days)
    const late = [...patients].filter(([patient]) => FIRST.get(patient)! >= '2026-02-01').map(([, days]) => days)
    const parts = [...dropoffLines(early, GROUPS, RANGE.to), ...dropoffLines(late, GROUPS, RANGE.to)]
    for (const whole of dropoff(input)) {
      const mine = parts.filter((line) => line.group === whole.group)
      expect(mine.reduce((sum, line) => sum + line.n, 0)).toBe(whole.n)
      expect(mine.reduce((sum, line) => sum + line.ten, 0)).toBe(whole.ten)
      expect(mine.reduce((sum, line) => sum + line.once, 0)).toBe(whole.once)
      expect(whole.atLeast.map((_, k) => mine.reduce((sum, line) => sum + line.atLeast[k]!, 0))).toEqual(whole.atLeast)
    }
  })

  it('AC-8018.2: 자료 끝 날(asOf)이 앞이면 끝난 환자도 그 날 기준이다 — 고른 환자가 없으면 빈 목록', () => {
    const patients = [...codesByDay(input).values()]
    expect(dropoffLines([], GROUPS, RANGE.to)).toEqual([])
    // 3/31 − 30일 = 3/1: 6번(마지막 5/31)·8번(마지막 3/14)은 그 뒤라 아직 다니는 중으로 본다 → 1·2·3번만
    expect(dropoffLines(patients, [MANUAL], '2026-03-31')).toEqual([{ group: MANUAL.id, n: 3, atLeast: [3, 2, 1, 0, 0, 0], ten: 0, once: 1, average: 2, drop: 1 }])
  })
})
