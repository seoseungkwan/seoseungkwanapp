import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import * as XLSX from 'xlsx'
import { aggregate } from '@/lib/analytics/aggregate'
import { buildSummary } from '@/lib/analytics/compare'
import { addDays } from '@/lib/analytics/dates'
import { createPatientIds, parseBitFile } from '@/lib/parsers/bit'
import type { RxGroupDef } from '@/types/analysis'
import type { AnalysisResult, AnalyzeOutput, FileReport } from '@/types/analyze'
import type { ParsedFile } from '@/types/consumption'
import { FAKE_BAD_ROWS, buildFakeBitTable, toCsvBytes } from '../../fixtures/make-fake-fixtures'
import { analyzeFiles } from './analyzeFiles'

const FAKE_DIR = fileURLToPath(new URL('../../fixtures/fake-bit/', import.meta.url))
const fake = (name: string) => new Uint8Array(readFileSync(join(FAKE_DIR, name)))
const SLOW = { timeout: 30_000 }
const TODAY = '2026-10-26' // 가짜 파일 기간은 2026-09-01 ~ 2026-10-24
// 가짜 차트번호(9로 시작하는 7자리). 증감률 같은 소수(0.9234567…)의 자리는 빼고 찾는다
const CHART_LIKE = /(?<![\d.])9\d{6}(?!\d)/

function resultOf(output: AnalyzeOutput): AnalysisResult {
  if (output.result === null) throw new Error('결과 없음')
  return output.result
}

function okReport(report: FileReport | undefined): Extract<FileReport, { ok: true }> {
  if (report?.ok !== true) throw new Error(`실패한 파일: ${JSON.stringify(report)}`)
  return report
}

// 시험 쪽 기준: 파일 하나를 직접 읽고 세고 요약
function parsedOf(bytes: Uint8Array): ParsedFile {
  const result = parseBitFile(bytes, createPatientIds())
  if (!result.ok) throw new Error(`실패: ${result.code}`)
  return result.value
}

let singleCache: AnalyzeOutput | undefined
const single = () => (singleCache ??= analyzeFiles([fake('fake-utf8-bom.csv')], TODAY))

// 같은 자료를 머리줄 아래만 거꾸로. 환자가 처음 나오는 순서가 달라진다
function reversedBody(): Uint8Array {
  const table = buildFakeBitTable()
  const headerAt = table.findIndex((row) => row[0] === '처방코드')
  return toCsvBytes([...table.slice(0, headerAt + 1), ...table.slice(headerAt + 1).reverse()], 'utf8-bom')
}

describe('AC-010.2 analyzeFiles — 파일 하나', () => {
  it('가짜 파일 하나 → valid, 요약이 있다', () => {
    const output = single()
    const result = resultOf(output)
    expect(result.quality).toBe('valid')
    expect(result.skippedInvalidRows).toBe(0)
    expect(result.summary.quality).toBe('valid')
    expect(result.summary.today).toBe(TODAY)
    expect(result.summary.day.day).not.toBeNull()
  })

  it('파일 보고와 결과가 파서·aggregate·buildSummary를 직접 부른 것과 같다(덮은 기간 = 머리 기간 줄)', () => {
    const parsed = parsedOf(fake('fake-utf8-bom.csv'))
    expect(parsed.period).not.toBeNull()
    const aggregates = aggregate(parsed.rows)
    const output = single()
    expect(output.files).toStrictEqual([
      {
        index: 0,
        ok: true,
        period: parsed.period,
        range: parsed.dataRange,
        rowCount: parsed.rowCount,
        skippedSummaryRows: parsed.skippedSummaryRows,
        invalidRows: 0,
        unknownVisitRows: parsed.unknownVisitRows,
        staleDays: null,
      },
    ])
    expect(parsed.unknownVisitRows).toBeGreaterThan(0)
    expect(output.result).toStrictEqual({
      quality: 'valid',
      skippedInvalidRows: 0,
      unknownVisitRows: parsed.unknownVisitRows,
      aggregates,
      summary: buildSummary({ aggregates, covered: [parsed.period ?? parsed.dataRange], quality: 'valid', today: TODAY }),
    })
  })

  it('기간 줄이 있으면 덮은 기간 = 기간 줄(마지막 날이 휴진한 일요일이라 줄이 없어도)', () => {
    const output = analyzeFiles([toCsvBytes(buildFakeBitTable({ to: '2026-10-25' }), 'utf8-bom')], TODAY)
    const report = okReport(output.files[0])
    expect(report.period).toEqual({ from: '2026-09-01', to: '2026-10-25' })
    expect(report.range.to).toBe('2026-10-24') // 가짜 자료는 일요일 진료가 없다
    const { summary } = resultOf(output)
    expect(summary.covered).toEqual([report.period])
    expect(summary.week.lastComplete?.key).toBe('2026-10-19') // 10/19~10/25 주가 다 덮였다
  })

  it('기간 줄이 없으면 덮은 기간 = 줄 날짜 최소~최대', () => {
    const output = analyzeFiles([fake('fake-no-period.csv')], TODAY)
    const report = okReport(output.files[0])
    expect(report.period).toBeNull()
    expect(resultOf(output).summary.covered).toEqual([report.range])
  })

  it('파일 0개 → 결과 없음', () => {
    expect(analyzeFiles([], TODAY)).toStrictEqual({ files: [], result: null })
  })
})

describe('AC-010.2 analyzeFiles — 여러 파일', () => {
  it('같은 내용 두 파일(utf8·cp949)을 같이 넣어도 환자 수는 하나 넣었을 때와 같다', () => {
    const output = analyzeFiles([fake('fake-utf8.csv'), fake('fake-cp949.csv')], TODAY)
    const one = resultOf(single())
    const both = resultOf(output)
    expect(output.files.map((f) => [f.index, f.ok])).toEqual([
      [0, true],
      [1, true],
    ])
    expect(both.quality).toBe('valid')
    expect(both.aggregates).toEqual(one.aggregates)
    expect(both.summary).toEqual(one.summary)
    expect(both.unknownVisitRows).toBe(one.unknownVisitRows * 2) // 줄 수는 두 파일 합
  })

  it('환자 번호는 넣은 파일 전체에서 한 번 매긴다(환자가 나오는 순서가 다른 두 파일도 같은 사람은 한 명)', () => {
    // 파일마다 번호를 새로 매기면 같은 번호가 다른 사람이 되어 날·주 칸의 환자 수가 늘어난다
    const output = analyzeFiles([fake('fake-utf8-bom.csv'), reversedBody()], TODAY)
    expect(resultOf(output).aggregates).toEqual(resultOf(single()).aggregates)
  })

  it('정상 + 초재진구분 칸 없는 파일 → 정상 파일 결과는 나오고 묶음은 incomplete', () => {
    const output = analyzeFiles([fake('fake-utf8-bom.csv'), fake('fake-missing-visit.csv')], TODAY)
    expect(output.files[1]).toStrictEqual({ index: 1, ok: false, code: 'E-PARSE-COLUMN', missingColumns: ['초재진구분'] })
    const result = resultOf(output)
    expect(result.quality).toBe('incomplete')
    expect(result.summary.quality).toBe('incomplete')
    expect(result.aggregates).toEqual(resultOf(single()).aggregates)
    expect(result.summary.day.vsPrevClinicDay.patients).toEqual({ kind: 'unavailable' })
  })

  it('실패 앞에 있어도 뒤 파일은 읽는다, 번호 말고 다른 칸은 붙지 않는다', () => {
    const output = analyzeFiles([fake('fake-empty.csv'), fake('fake-utf8-bom.csv')], TODAY)
    expect(output.files[0]).toStrictEqual({ index: 0, ok: false, code: 'E-PARSE-EMPTY' })
    expect(okReport(output.files[1]).index).toBe(1)
    expect(resultOf(output).quality).toBe('incomplete')
  })

  it('잘못된 줄이 있는 파일 → incomplete, skippedInvalidRows = 뺀 줄 수', () => {
    const output = analyzeFiles([fake('fake-bad-rows.csv')], TODAY)
    const bad = FAKE_BAD_ROWS.emptyDate + FAKE_BAD_ROWS.invalidDate + FAKE_BAD_ROWS.emptyChart
    expect(okReport(output.files[0]).invalidRows).toBe(bad)
    const result = resultOf(output)
    expect(result.quality).toBe('incomplete')
    expect(result.skippedInvalidRows).toBe(bad)
    expect(result.summary.quality).toBe('incomplete')
  })

  it('두 파일의 잘못된 줄 수를 더한다', () => {
    const output = analyzeFiles([fake('fake-bad-rows.csv'), fake('fake-bad-rows.csv')], TODAY)
    const bad = FAKE_BAD_ROWS.emptyDate + FAKE_BAD_ROWS.invalidDate + FAKE_BAD_ROWS.emptyChart
    expect(resultOf(output).skippedInvalidRows).toBe(bad * 2)
  })

  it('모두 실패 → result null, 파일마다 번호', () => {
    const garbage = new Uint8Array([0x00, 0xff, 0x10, 0x80, 0x00, 0x01])
    const output = analyzeFiles([fake('fake-missing-visit.csv'), fake('fake-empty.csv'), garbage], TODAY)
    expect(output).toStrictEqual({
      files: [
        { index: 0, ok: false, code: 'E-PARSE-COLUMN', missingColumns: ['초재진구분'] },
        { index: 1, ok: false, code: 'E-PARSE-EMPTY' },
        { index: 2, ok: false, code: 'E-PARSE-UNREADABLE' },
      ],
      result: null,
    })
  })

  it('진행률 콜백이 파일마다(실패한 파일도) 한 번씩 불린다', () => {
    const onProgress = vi.fn()
    analyzeFiles([fake('fake-utf8-bom.csv'), fake('fake-empty.csv'), fake('fake-no-period.csv')], TODAY, [], onProgress)
    expect(onProgress.mock.calls).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ])
  })
})

describe('AC-010.1·AC-010.2 analyzeFiles — 화면에서 바이트를 꺼내지 못한 자리(오류 번호)', () => {
  it('정상 + 못 꺼낸 자리 → 정상 파일 결과는 나오고 그 자리 보고에 번호, 묶음은 incomplete', () => {
    const onProgress = vi.fn()
    const output = analyzeFiles([fake('fake-utf8-bom.csv'), 'E-PARSE-UNREADABLE', 'E-PARSE-TOO-BIG'], TODAY, [], onProgress)
    expect(okReport(output.files[0]).index).toBe(0)
    expect(output.files.slice(1)).toStrictEqual([
      { index: 1, ok: false, code: 'E-PARSE-UNREADABLE' },
      { index: 2, ok: false, code: 'E-PARSE-TOO-BIG' },
    ])
    const result = resultOf(output)
    expect(result.quality).toBe('incomplete')
    expect(result.summary.quality).toBe('incomplete')
    expect(result.summary.day.vsPrevClinicDay.patients).toEqual({ kind: 'unavailable' })
    expect(result.aggregates).toEqual(resultOf(single()).aggregates)
    expect(onProgress.mock.calls).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ])
  })

  it('못 꺼낸 자리가 앞에 있어도 뒤 파일의 index는 넣은 자리 그대로', () => {
    const output = analyzeFiles(['E-PARSE-UNREADABLE', fake('fake-utf8-bom.csv')], TODAY)
    expect(output.files[0]).toStrictEqual({ index: 0, ok: false, code: 'E-PARSE-UNREADABLE' })
    expect(okReport(output.files[1]).index).toBe(1)
  })

  it('모두 못 꺼냄 → result null', () => {
    expect(analyzeFiles(['E-PARSE-UNREADABLE', 'E-PARSE-UNREADABLE'], TODAY)).toStrictEqual({
      files: [
        { index: 0, ok: false, code: 'E-PARSE-UNREADABLE' },
        { index: 1, ok: false, code: 'E-PARSE-UNREADABLE' },
      ],
      result: null,
    })
  })
})

describe("AC-010.2 analyzeFiles — '옛 파일'(staleDays)", () => {
  const lastDay = () => okReport(single().files[0]).range.to
  const staleOn = (today: string) => okReport(analyzeFiles([fake('fake-utf8-bom.csv')], today).files[0]).staleDays

  it('today가 파일 마지막 날보다 10일 뒤 → 10', () => {
    expect(staleOn(addDays(lastDay(), 10))).toBe(10)
  })

  it('2일 뒤 → null', () => {
    expect(staleOn(addDays(lastDay(), 2))).toBeNull()
  })

  it('3일까지는 null(주말·연휴), 4일부터 날 수', () => {
    expect(staleOn(addDays(lastDay(), 3))).toBeNull()
    expect(staleOn(addDays(lastDay(), 4))).toBe(4)
    expect(staleOn(lastDay())).toBeNull()
  })
})

describe('AC-010.2 analyzeFiles — 결과에 환자를 알아볼 값이 없다', () => {
  it('차트번호·가짜 이름·전화 모양·파일 이름이 결과 JSON 어디에도 없다', () => {
    const raw = new TextDecoder().decode(fake('fake-utf8-bom.csv'))
    // 찾는 방법이 맞는지: 원본 파일에는 다 있다
    expect(raw).toMatch(CHART_LIKE)
    expect(raw).toContain('가짜환자')
    expect(raw).toContain('000-0000-')

    const output = analyzeFiles(
      [fake('fake-utf8-bom.csv'), fake('fake-missing-visit.csv'), fake('fake-bad-rows.csv'), fake('fake-reordered.csv')],
      TODAY,
    )
    expect(output.result).not.toBeNull()
    const json = JSON.stringify(output)
    expect(json).not.toMatch(CHART_LIKE)
    for (const text of ['가짜환자', '000-0000-', '000-1111-', 'example.invalid', 'XXXXXX', 'fake-', '.csv']) {
      expect(json).not.toContain(text)
    }
  })
})

describe('AC-010.2 analyzeFiles — 성능(PRD 실패 기준 3)', () => {
  it('10만 줄 파일을 3초 안에 읽고 세고 요약한다', SLOW, () => {
    const bytes = toCsvBytes(buildFakeBitTable({ rows: 100_000 }), 'utf8-bom')
    const start = performance.now()
    const output = analyzeFiles([bytes], TODAY)
    const elapsed = performance.now() - start
    expect(okReport(output.files[0]).rowCount).toBe(100_000)
    expect(resultOf(output).quality).toBe('valid')
    expect(elapsed).toBeLessThan(3000)
  })
})

describe('AC-010.3 그룹 정의 — 결과의 그룹 숫자는 그 정의로 센 것', () => {
  const rows = () => parsedOf(fake('fake-utf8-bom.csv')).rows
  const codes = () => [...new Set(rows().map((row) => row.rxCode))].sort()

  it('같은 정의를 aggregate에 넣은 것과 같고, 요약에도 그룹 비교가 있다', () => {
    const groups: RxGroupDef[] = [
      { id: 'g-b', codes: codes().slice(2, 5) },
      { id: 'g-a', codes: codes().slice(0, 3) },
    ]
    const result = resultOf(analyzeFiles([fake('fake-utf8-bom.csv')], TODAY, groups))
    expect(result.aggregates).toEqual(aggregate(rows(), groups))
    expect(result.summary.week.groups.map((g) => g.id)).toEqual(['g-a', 'g-b'])
  })

  it('그룹 정의가 없으면 모든 칸의 그룹은 빈 목록', () => {
    const { aggregates } = resultOf(single())
    for (const bucket of [...aggregates.day, ...aggregates.week, ...aggregates.month]) expect(bucket.groups).toEqual([])
  })

  it('같은 id의 정의가 둘이면 앞의 것만 쓴다', () => {
    const [first, second] = codes()
    const result = resultOf(
      analyzeFiles([fake('fake-utf8-bom.csv')], TODAY, [
        { id: 'g-a', codes: [first] },
        { id: 'g-a', codes: [second] },
      ]),
    )
    expect(result.aggregates).toEqual(aggregate(rows(), [{ id: 'g-a', codes: [first] }]))
  })
})

// 과목 구분 줄을 끼운 가짜 표. 값은 모두 지어낸 것이다
const ROOMS = ['가짜1진료실', '가짜2진료실', '가짜3진료실']

function headerOf(table: string[][]) {
  const at = table.findIndex((row) => row[0] === '처방코드')
  return { at, header: table[at], col: (name: string) => table[at].indexOf(name) }
}

// 머리줄 바로 아래 하나, 본문 사이에 둘. 줄 끝 칸까지 비운 실제 파일 모양
function withDividers(table: string[][]): string[][] {
  const { at, header, col } = headerOf(table)
  const divider = (room: string) =>
    header.map((_, i) => (i === col('처방코드') ? '◀ 과 목 ▶' : i === col('처방명칭') ? room : ''))
  const out = table.map((row) => [...row])
  const [first, second, third] = ROOMS
  out.splice(at + 21, 0, divider(third))
  out.splice(at + 11, 0, divider(second))
  out.splice(at + 1, 0, divider(first))
  return out
}

const smallTable = () => buildFakeBitTable({ rows: 200 })

function toBookBytes(table: string[][], bookType: 'xlsx' | 'biff8'): Uint8Array {
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(table.map((row) => row.map((c) => (c === '' ? null : c)))), 'Sheet1')
  return new Uint8Array(XLSX.write(book, { type: 'array', bookType }))
}

// 비트는 HTML <table>을 확장자만 .xls로 내보내기도 한다
function toHtmlXlsBytes(table: string[][]): Uint8Array {
  const escaped = (c: string) => c.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const rows = table.map((row) => `<tr>${row.map((c) => `<td>${escaped(c)}</td>`).join('')}</tr>`).join('')
  return new TextEncoder().encode(
    `<html><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"></head><body><table>${rows}</table></body></html>`,
  )
}

const FORMATS: Array<[string, (table: string[][]) => Uint8Array]> = [
  ['CSV(UTF-8)', (table) => toCsvBytes(table, 'utf8-bom')],
  ['CSV(CP949)', (table) => toCsvBytes(table, 'cp949')],
  ['xlsx', (table) => toBookBytes(table, 'xlsx')],
  ['옛 엑셀 .xls', (table) => toBookBytes(table, 'biff8')],
  ['속이 HTML인 .xls', toHtmlXlsBytes],
]

describe('AC-901.2 analyzeFiles — 과목 구분 줄 3개와 정상 줄만 있는 파일', () => {
  it.each(FORMATS)('%s → valid, 오류 줄 0, 결과는 구분 줄이 없는 같은 파일과 같다', SLOW, (_, toBytes) => {
    const table = smallTable()
    const plain = analyzeFiles([toBytes(table)], TODAY)
    const output = analyzeFiles([toBytes(withDividers(table))], TODAY)
    const result = resultOf(output)
    expect(result.quality).toBe('valid')
    expect(result.skippedInvalidRows).toBe(0)
    expect(result.summary.quality).toBe('valid')
    expect(result).toStrictEqual(resultOf(plain))
    const report = okReport(output.files[0])
    const plainReport = okReport(plain.files[0])
    expect(report.invalidRows).toBe(0)
    expect(report.rowCount).toBe(plainReport.rowCount)
    expect(report.skippedSummaryRows).toBe(plainReport.skippedSummaryRows + 3)
  })

  it('진료실 이름과 구분 글자는 결과에 없다', SLOW, () => {
    const output = analyzeFiles([toCsvBytes(withDividers(smallTable()), 'utf8-bom')], TODAY)
    expect(resultOf(output).quality).toBe('valid')
    const text = JSON.stringify(output)
    for (const value of [...ROOMS, '진료실', '과목', '◀', '▶']) expect(text).not.toContain(value)
  })
})

describe('AC-901.5 analyzeFiles — 구분 줄과 진짜 오류 줄이 함께 있는 파일', () => {
  it.each(FORMATS)('%s → incomplete, skippedInvalidRows = 진짜 오류 줄 수', SLOW, (_, toBytes) => {
    const table = withDividers(smallTable())
    const { at, col } = headerOf(table)
    table[at + 2][col('차트번호')] = '' // 구분 줄 바로 아래 줄
    table[at + 3][col('처방일자')] = '2026-13-45'
    const output = analyzeFiles([toBytes(table)], TODAY)
    expect(okReport(output.files[0]).invalidRows).toBe(2)
    const result = resultOf(output)
    expect(result.quality).toBe('incomplete')
    expect(result.skippedInvalidRows).toBe(2)
    expect(result.summary.quality).toBe('incomplete')
  })
})

// 머리줄 바로 아래 구분 줄 하나, 파일 끝의 꾸민 합계 표시 줄 둘. 끝 줄은 유형·숫자 칸이 차 있고 한 줄은 처방명칭도 찼다.
// 생성기의 소계·합계 줄 자리에 넣는다. 값은 모두 지어낸 것이다
function withFooterRows(table: string[][]): string[][] {
  const { at, header } = headerOf(table)
  const rowOf = (cells: Record<string, string>) => header.map((name) => cells[name] ?? '')
  const out = table.slice(0, -2).map((row) => [...row])
  out.push(
    rowOf({ 처방코드: '[ 소 계 ]', 처방명칭: '가짜 표시', 유형: '약품', 단가: '120', 금액: '34500' }),
    rowOf({ 처방코드: '◀ 총 계 ▶', 유형: '약품', 투여량: '7', 금액: '67800' }),
  )
  out.splice(at + 1, 0, rowOf({ 처방코드: '◀ 과 목 ▶', 처방명칭: ROOMS[0] }))
  return out
}

describe('AC-902.5 analyzeFiles — 구분 줄 하나와 끝의 꾸민 합계 표시 줄 둘, 정상 줄이 있는 파일', () => {
  it.each(FORMATS)('%s → valid, 오류 줄 0, 결과는 환자 줄이 같은 파일과 같다', SLOW, (_, toBytes) => {
    const table = smallTable()
    const plain = analyzeFiles([toBytes(table)], TODAY)
    const output = analyzeFiles([toBytes(withFooterRows(table))], TODAY)
    const result = resultOf(output)
    expect(result.quality).toBe('valid')
    expect(result.skippedInvalidRows).toBe(0)
    expect(result.summary.quality).toBe('valid')
    expect(result).toStrictEqual(resultOf(plain))
    const report = okReport(output.files[0])
    const plainReport = okReport(plain.files[0])
    expect(report.invalidRows).toBe(0)
    expect(report.rowCount).toBe(plainReport.rowCount)
    expect(report.skippedSummaryRows).toBe(plainReport.skippedSummaryRows + 1) // 소계·합계 자리는 그대로, 구분 줄 하나만 더
  })
})

describe('AC-902.6 analyzeFiles — 꾸민 합계 표시 줄과 진짜 오류 줄이 함께 있는 파일', () => {
  it.each(FORMATS)('%s → incomplete, skippedInvalidRows = 진짜 오류 줄 수', SLOW, (_, toBytes) => {
    const table = withFooterRows(smallTable())
    const { at, col } = headerOf(table)
    table[at + 2][col('차트번호')] = ''
    table[at + 3][col('처방일자')] = '2026-13-45'
    table[at + 4][col('처방코드')] = '복합 계열' // 날짜만 빠진 환자 기록
    table[at + 4][col('처방일자')] = ''
    const output = analyzeFiles([toBytes(table)], TODAY)
    expect(okReport(output.files[0]).invalidRows).toBe(3)
    const result = resultOf(output)
    expect(result.quality).toBe('incomplete')
    expect(result.skippedInvalidRows).toBe(3)
    expect(result.summary.quality).toBe('incomplete')
  })
})
