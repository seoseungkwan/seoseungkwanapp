import { describe, expect, it } from 'vitest'
import { toUisDayPayload } from '@/lib/payload/uisarang'
import { validateDayPayload } from '@/lib/payload/validate'
import type { UisFileResult, UisVisitDay } from '@/types/uisarang'
import { readUisFile } from './readFile'
import { bookBytes, gridRowOf, VISIT_LINES, visitsRows, TODAY, type VisitLine, type VisitsOptions } from './testBooks'

// 내원일별 위쪽 표 → 날마다 내원 수(design.md §4-3)

const WEEK = { from: '2026-11-02', to: '2026-11-08' }
// testBooks VISIT_LINES: 월~토 여섯 날(일요일 11-08은 줄 없음 = 휴진)
const DAYS: UisVisitDay[] = [
  { day: '2026-11-02', patients: 40, newPatients: 5 },
  { day: '2026-11-03', patients: 52, newPatients: 7 },
  { day: '2026-11-04', patients: 38, newPatients: 3 },
  { day: '2026-11-05', patients: 45, newPatients: 4 },
  { day: '2026-11-06', patients: 50, newPatients: 6 },
  { day: '2026-11-07', patients: 20, newPatients: 1 },
]

function daysOf(result: UisFileResult): UisVisitDay[] {
  if (result.status !== 'read' || result.read.kind !== 'visits') throw new Error(`받지 못함: ${JSON.stringify(result)}`)
  return result.read.days
}
const read = (options: VisitsOptions = {}) => readUisFile(bookBytes(visitsRows(options)), TODAY)
const visits = (options: VisitsOptions = {}) => daysOf(read(options))

function refusedRow(options: VisitsOptions, find: (line: VisitLine) => boolean) {
  const rows = visitsRows(options)
  const line = (options.lines ?? VISIT_LINES).find(find)
  const at = rows.findIndex((row) => line !== undefined && row[0] === line[0] && row[3] === line[1])
  return { rows, row: gridRowOf(rows, at) }
}

describe('AC-8805.1 내원일이 날짜인 줄 → {day, patients, newPatients}', () => {
  it('AC-8805.1: 한 주 파일 · 줄 없는 날(일요일)은 줄을 만들지 않는다(휴진)', () => {
    expect(read()).toStrictEqual({ status: 'read', read: { kind: 'visits', span: { ...WEEK, unit: 'week' }, days: DAYS } })
  })

  it('AC-8805.1: 엑셀 날짜 숫자·점 구분 날짜 · 날 차례로 · 되풀이 머리 줄 건너뜀', () => {
    const lines: VisitLine[] = [
      ['2026.11.03', 52, 7],
      [46328, 40, 5], // 2026-11-02
    ]
    expect(visits({ lines, repeatEvery: 1 })).toStrictEqual(DAYS.slice(0, 2))
  })

  it('AC-8805.1: 내원일이 날짜도 합계도 아닌 줄은 날 줄이 아니다', () => {
    const lines: VisitLine[] = [...VISIT_LINES, ['쪽 1/2', null, null], ['(일)', 3, 0]]
    expect(visits({ lines, total: [245, 26] })).toStrictEqual(DAYS)
  })

  it('AC-8805.1: 저장 모양(toUisDayPayload)이 날 줄 검사를 지난다', () => {
    for (const day of visits()) expect(validateDayPayload(toUisDayPayload(day))).not.toBeNull()
  })

  it.each([
    ['조회일 밖의 날', ['2026-11-09', 3, 0], (l: VisitLine) => l[0] === '2026-11-09'],
    ['같은 날 두 줄', ['2026-11-03', 1, 0], (l: VisitLine) => l[0] === '2026-11-03' && l[1] === 1],
    ['신규환자 > 인원수', ['2026-11-08', 2, 3], (l: VisitLine) => l[0] === '2026-11-08'],
    ['음수', ['2026-11-08', -1, 0], (l: VisitLine) => l[0] === '2026-11-08'],
    ['소수', ['2026-11-08', 3.5, 0], (l: VisitLine) => l[0] === '2026-11-08'],
    ['인원수 빈칸', ['2026-11-08', null, 0], (l: VisitLine) => l[0] === '2026-11-08'],
    ['신규환자 빈칸', ['2026-11-08', 3, null], (l: VisitLine) => l[0] === '2026-11-08'],
    ['숫자 아닌 글자', ['2026-11-08', '세 명', 0], (l: VisitLine) => l[0] === '2026-11-08'],
  ] as Array<[string, VisitLine, (l: VisitLine) => boolean]>)('AC-8805.1: %s → E-UIS-ROW(그 줄 차례)', (_, bad, find) => {
    const options: VisitsOptions = { lines: [...VISIT_LINES, bad], total: [245, 26] }
    const { rows, row } = refusedRow(options, find)
    expect(readUisFile(bookBytes(rows), TODAY)).toStrictEqual({ status: 'refused', code: 'E-UIS-ROW', kind: 'visits', span: WEEK, row })
  })
})

describe('AC-8805.2 합계 줄 = 날 줄 합', () => {
  it('AC-8805.2: 인원수 합이 다르면 E-UIS-TOTAL', () => {
    expect(read({ total: [246, 26] })).toStrictEqual({ status: 'refused', code: 'E-UIS-TOTAL', kind: 'visits', span: WEEK })
  })

  it('AC-8805.2: 신규환자 합이 다르면 E-UIS-TOTAL', () => {
    expect(read({ total: [245, 25] })).toMatchObject({ code: 'E-UIS-TOTAL' })
  })

  it('AC-8805.2: 합계 줄 칸이 비면 맞지 않음', () => {
    expect(read({ total: [245, null] })).toMatchObject({ code: 'E-UIS-TOTAL' })
  })

  it('AC-8805.2: 합계 줄이 없으면 E-UIS-TOTAL', () => {
    expect(read({ total: 'none' })).toMatchObject({ status: 'refused', code: 'E-UIS-TOTAL' })
  })

  it('AC-8805.2: 합계 0 · 날 줄 없음(그 기간 모두 휴진)은 받는다', () => {
    expect(visits({ span: '2026-11-08', lines: [], total: [0, 0] })).toStrictEqual([])
  })
})

describe('AC-8805.4 하루·한 주·한 달 모두 받는다', () => {
  it('AC-8805.4: 하루', () => {
    expect(read({ span: '2026-11-03', lines: [['2026-11-03', 52, 7]] })).toMatchObject({
      status: 'read',
      read: { span: { from: '2026-11-03', to: '2026-11-03', unit: 'day' }, days: [DAYS[1]] },
    })
  })

  it('AC-8805.4: 한 달', () => {
    const result = read({ span: '2026-10-01 ~ 2026-10-31', lines: [['2026-10-01', 10, 1], ['2026-10-31', 12, 0]] })
    expect(result).toMatchObject({ status: 'read', read: { span: { from: '2026-10-01', to: '2026-10-31', unit: 'month' } } })
    expect(daysOf(result).map((d) => d.day)).toEqual(['2026-10-01', '2026-10-31'])
  })
})

describe('AC-8802.9 줄 번호 = 빈 줄을 뺀 위에서의 차례(1부터)', () => {
  it('AC-8802.9: 빈 줄이 끼어 있는 표의 잘못된 줄', () => {
    const bad: VisitLine = ['2026-11-08', 5, 9]
    const options: VisitsOptions = { lines: [...VISIT_LINES, bad], total: [250, 35], blankEvery: 2 }
    const { rows, row } = refusedRow(options, (l) => l === bad)
    expect(row).toBe(rows.slice(0, rows.findIndex((r) => r[0] === '2026-11-08') + 1).filter((r) => r.some((c) => c !== null && c !== '')).length)
    expect(readUisFile(bookBytes(rows), TODAY)).toMatchObject({ code: 'E-UIS-ROW', row })
  })
})
