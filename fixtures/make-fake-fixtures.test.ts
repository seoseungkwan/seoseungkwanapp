import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  BIT_HEADER,
  FAKE_BAD_ROWS,
  buildFakeBitTable,
  toCsv,
  toCsvBytes,
  writeAllFixtures,
} from './make-fake-fixtures'

// 사용자가 준 실제 첫 줄(docs/DATA_RULES.md 1절)
const EXPECTED_HEADER = [
  '처방코드', '처방명칭', '유형', '차트번호', '성명', '투여량', '투여일수', '총투여량', '단가', '금액', '급/비',
  '처방일자', '주민번호', '전화번호', '휴대폰', '외래/입원', '원내/원외', '이메일', '우편번호', '주소', '주치의',
  '초재진구분', '주상병',
]
const FILES = [
  'fake-utf8-bom.csv',
  'fake-utf8.csv',
  'fake-cp949.csv',
  'fake.xlsx',
  'fake-biff.xls',
  'fake-html.xls',
  'fake-dates-mixed.csv',
  'fake-dates-serial.xlsx',
  'fake-no-period.csv',
  'fake-reordered.csv',
  'fake-missing-visit.csv',
  'fake-missing-address.csv',
  'fake-bad-rows.csv',
  'fake-script-name.csv',
  'fake-empty.csv',
  'fake-2026-08.csv',
  'fake-2025-09.csv',
]
// 달이 다 지난 한 달 파일(저장된 달 비교 E2E: 9월 vs 8월, 9월 vs 작년 9월)
const MONTH_FILES = [
  ['fake-2026-08.csv', '2026-08-01', '2026-08-31'],
  ['fake-2025-09.csv', '2025-09-01', '2025-09-30'],
] as const
// SheetJS가 만든 시각이 들어가 바이트로는 비교하지 않는 파일
const BOOK_FILES = ['fake.xlsx', 'fake-biff.xls', 'fake-dates-serial.xlsx']
const COMMITTED_DIR = fileURLToPath(new URL('./fake-bit/', import.meta.url))
const COMMITTED_SAMPLE = fileURLToPath(new URL('../public/fake-sample/bit-sample.csv', import.meta.url))
const RRN_SHAPE = /\d{6}-\d{7}/
const SLOW = { timeout: 30_000 }

type Table = string[][]

function sheetRows(wb: XLSX.WorkBook, raw = false): Table {
  const sheet = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw, blankrows: true, defval: '' })
}
// TextDecoder는 BOM을 떼고 푼다
function readCsv(bytes: Uint8Array, encoding = 'utf-8'): Table {
  return sheetRows(XLSX.read(new TextDecoder(encoding).decode(bytes), { type: 'string', raw: true }))
}
function readBook(bytes: Uint8Array): Table {
  return sheetRows(XLSX.read(bytes, { type: 'array', raw: true }))
}
// 줄 끝 빈 칸은 형식마다 다르게 채워지므로 떼고 비교한다
function trimTable(table: Table): Table {
  return table.map((row) => {
    let end = row.length
    while (end > 0 && String(row[end - 1]) === '') end--
    return row.slice(0, end).map(String)
  })
}
const squash = (name: string) => name.replace(/\(.*?\)/g, '').replace(/\s/g, '')

// step 5의 합계 줄 규칙: 처방코드·처방일자가 비고 앞쪽 칸에 '합계'·'소계'·'총계'
function isSummaryRow(row: string[], col: (name: string) => number): boolean {
  return (
    row[col('처방코드')] === '' &&
    row[col('처방일자')] === '' &&
    row.slice(0, 3).some((c) => ['합계', '소계', '총계'].includes(c))
  )
}

// 위 20줄 안의 머리줄과 본문(반복 머리줄·소계·합계 뺀 줄)
function split(table: Table) {
  const headerAt = table
    .slice(0, 20)
    .findIndex((row) => row.some((c) => c.includes('차트')) && row.some((c) => squash(c) === '처방코드'))
  const header = table[headerAt] ?? []
  const col = (name: string) => header.findIndex((c) => squash(c) === name)
  const body = table
    .slice(headerAt + 1)
    .filter((row) => row.join('|') !== header.join('|') && !isSummaryRow(row, col))
  return { headerAt, header, body, col }
}
const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay()

describe('AC-005.1 BIT_HEADER', () => {
  it('23칸이고 비트 첫 줄 순서와 같다', () => {
    expect(BIT_HEADER).toHaveLength(23)
    expect([...BIT_HEADER]).toEqual(EXPECTED_HEADER)
  })
})

describe('AC-005.1 buildFakeBitTable', () => {
  const table = buildFakeBitTable()
  const { headerAt, header, body, col } = split(table)
  const at = (row: string[], name: string) => row[col(name)]

  it('제목 줄·기간 줄·빈 줄 다음에 머리줄이 온다', () => {
    expect(table[0]).toEqual(['환자별 소모 통계'])
    expect(table[1]).toEqual(['기간: 2026-09-01 ~ 2026-10-24'])
    expect(table[2]).toEqual([])
    expect(headerAt).toBe(3)
    expect(header).toEqual(EXPECTED_HEADER)
  })

  it('본문은 기본 3,000줄이고 중간에 반복 머리줄 한 번, 끝에 소계·합계 줄', () => {
    expect(body).toHaveLength(3000)
    const repeats = table.map((row, i) => (row.join('|') === header.join('|') ? i : -1)).filter((i) => i > headerAt)
    expect(repeats).toHaveLength(1)
    expect(repeats[0]).toBeGreaterThan(headerAt + 1)
    expect(repeats[0]).toBeLessThan(table.length - 3)
    // 처방코드·처방일자·차트번호 칸은 비고, 그 칸들을 뺀 첫 칸(기본 순서면 처방명칭)에 글자
    const [subtotal, total] = table.slice(-2)
    for (const [row, label] of [[subtotal, '소계'], [total, '합계']] as const) {
      expect(at(row, '처방코드')).toBe('')
      expect(at(row, '처방일자')).toBe('')
      expect(at(row, '차트번호')).toBe('')
      expect(at(row, '처방명칭')).toBe(label)
      expect(isSummaryRow(row, col)).toBe(true)
    }
  })

  it('같은 seed → 같은 표, 다른 seed → 다른 표', () => {
    expect(buildFakeBitTable({ seed: 7 })).toEqual(buildFakeBitTable({ seed: 7 }))
    expect(buildFakeBitTable({ seed: 7 })).not.toEqual(buildFakeBitTable({ seed: 8 }))
    expect(buildFakeBitTable()).toEqual(table)
  })

  it('개인정보 칸은 누가 봐도 가짜다', () => {
    for (const row of body) {
      expect(at(row, '성명')).toMatch(/^가짜환자\d{4,}$/)
      expect(at(row, '주민번호')).toBe('XXXXXX-XXXXXXX')
      expect(at(row, '전화번호')).toMatch(/^000-0000-\d{4,}$/)
      expect(at(row, '휴대폰')).toMatch(/^000-1111-\d{4,}$/)
      expect(at(row, '이메일')).toMatch(/^fake\d{4,}@example\.invalid$/)
      expect(at(row, '우편번호')).toBe('00000')
      expect(at(row, '차트번호')).toMatch(/^9\d{6}$/)
    }
  })

  it('차트번호는 9000001부터 차례로 매긴다(기본 파일은 모두 9000으로 시작 → step 5 유출 검사가 빈 시험이 되지 않게)', () => {
    const charts = new Set(body.map((row) => at(row, '차트번호')))
    for (const chart of charts) expect(chart).toMatch(/^9000\d{3}$/)
    expect(charts.has('9000001')).toBe(true)
    for (const row of body) expect(at(row, '차트번호')).toBe(`9${at(row, '성명').replace('가짜환자', '').padStart(6, '0')}`)
  })

  it('차트번호·성명·주소는 환자마다 고정이다', () => {
    const byChart = new Map<string, string>()
    const nameToChart = new Map<string, string>()
    for (const row of body) {
      const chart = at(row, '차트번호')
      const fixed = `${at(row, '성명')}|${at(row, '주소')}`
      expect(byChart.get(chart) ?? fixed).toBe(fixed)
      byChart.set(chart, fixed)
      expect(nameToChart.get(at(row, '성명')) ?? chart).toBe(chart)
      nameToChart.set(at(row, '성명'), chart)
    }
  })

  it('처방일자는 기간 안, 일요일 없음, 토요일은 평일보다 적다', () => {
    const perWeekday = [0, 0, 0, 0, 0, 0, 0]
    const daysPerWeekday = [new Set<string>(), new Set<string>(), new Set<string>(), new Set<string>(), new Set<string>(), new Set<string>(), new Set<string>()]
    for (const row of body) {
      const date = at(row, '처방일자')
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(date >= '2026-09-01' && date <= '2026-10-24').toBe(true)
      perWeekday[weekday(date)]++
      daysPerWeekday[weekday(date)].add(date)
    }
    expect(perWeekday[0]).toBe(0)
    const perDay = (d: number) => perWeekday[d] / daysPerWeekday[d].size
    for (const d of [1, 2, 3, 4, 5]) expect(perDay(6)).toBeLessThan(perDay(d))
  })

  it('첫 방문 날은 신환, 그 뒤는 재진, 약 1%는 알 수 없는 값', () => {
    const firstDate = new Map<string, string>()
    for (const row of body) {
      const chart = at(row, '차트번호')
      const date = at(row, '처방일자')
      if (!firstDate.has(chart) || date < firstDate.get(chart)!) firstDate.set(chart, date)
    }
    let unknown = 0
    for (const row of body) {
      const value = at(row, '초재진구분')
      const first = firstDate.get(at(row, '차트번호')) === at(row, '처방일자')
      if (value === '신환') expect(first).toBe(true)
      else if (value === '재진') expect(first).toBe(false)
      else unknown++
    }
    expect(unknown / body.length).toBeGreaterThan(0.002)
    expect(unknown / body.length).toBeLessThan(0.03)
  })

  it('외래가 대부분이고 약 2%는 입원', () => {
    const values = new Set(body.map((row) => at(row, '외래/입원')))
    expect([...values].sort()).toEqual(['외래', '입원'])
    const inpatient = body.filter((row) => at(row, '외래/입원') === '입원').length / body.length
    expect(inpatient).toBeGreaterThan(0.005)
    expect(inpatient).toBeLessThan(0.06)
  })

  it('유형 6가지가 모두 나오고 처방코드마다 유형·명칭이 하나다', () => {
    const types = new Set(body.map((row) => at(row, '유형')))
    expect([...types].sort()).toEqual(['검사', '물리치료', '약품', '주사', '진찰료', '처치'].sort())
    const byCode = new Map<string, string>()
    for (const row of body) {
      const kind = `${at(row, '유형')}|${at(row, '처방명칭')}`
      expect(byCode.get(at(row, '처방코드')) ?? kind).toBe(kind)
      byCode.set(at(row, '처방코드'), kind)
    }
    expect(byCode.size).toBeGreaterThanOrEqual(6)
  })

  it('한 환자·한 날에 처방 여러 줄, 같은 환자·같은 날·같은 처방이 두 번 나오는 줄도 조금', () => {
    const perVisit = new Map<string, number>()
    const perLine = new Map<string, number>()
    for (const row of body) {
      const visit = `${at(row, '차트번호')}|${at(row, '처방일자')}`
      perVisit.set(visit, (perVisit.get(visit) ?? 0) + 1)
      const line = `${visit}|${at(row, '처방코드')}`
      perLine.set(line, (perLine.get(line) ?? 0) + 1)
    }
    expect([...perVisit.values()].some((n) => n >= 3)).toBe(true)
    const duplicated = [...perLine.values()].filter((n) => n > 1).length
    expect(duplicated).toBeGreaterThan(0)
    expect(duplicated / perLine.size).toBeLessThan(0.05)
  })

  it('주소는 지번·도로명·시+구·읍·리·빈 값이 섞여 있다', () => {
    const addresses = new Set(body.map((row) => at(row, '주소')))
    const has = (pattern: RegExp) => [...addresses].some((a) => pattern.test(a))
    expect(addresses.has('')).toBe(true)
    expect(has(/^서울특별시 \S+구 \S+동 \d+-\d+$/)).toBe(true) // 지번
    expect(has(/^서울특별시 \S+구 \S+(로|길) \d+$/)).toBe(true) // 도로명
    expect(has(/^경기도 \S+시 \S+구 \S+동 \d+$/)).toBe(true) // 시+구
    expect(has(/^경기도 \S+[시군] \S+읍 \S+리 \d+$/)).toBe(true) // 읍·리
  })

  it('옵션: 기간·환자 수·줄 수·기간 줄 빼기', () => {
    const small = buildFakeBitTable({ from: '2026-10-05', to: '2026-10-11', patients: 20, rows: 200, withPeriodLine: false })
    expect(small.some((row) => row[0]?.startsWith('기간'))).toBe(false)
    const { body: rows, col: c } = split(small)
    expect(rows).toHaveLength(200)
    expect(new Set(rows.map((row) => row[c('차트번호')])).size).toBeLessThanOrEqual(20)
    for (const row of rows) {
      expect(row[c('처방일자')] >= '2026-10-05' && row[c('처방일자')] <= '2026-10-11').toBe(true)
    }
    expect(buildFakeBitTable({ from: '2026-10-05', to: '2026-10-11' })[1]).toEqual(['기간: 2026-10-05 ~ 2026-10-11'])
  })

  it('잘못된 옵션은 바로 알린다', () => {
    expect(() => buildFakeBitTable({ from: '2026-10-11', to: '2026-10-05' })).toThrow()
    expect(() => buildFakeBitTable({ from: '2026-13-45' })).toThrow()
    expect(() => buildFakeBitTable({ patients: 0 })).toThrow()
  })

  it('rows: 100000 → 10만 줄 표를 2초 안에 만든다', () => {
    const started = performance.now()
    const big = buildFakeBitTable({ rows: 100_000 })
    const elapsed = performance.now() - started
    expect(split(big).body).toHaveLength(100_000)
    expect(elapsed).toBeLessThan(2000)
  })
})

describe('AC-005.2 toCsv · toCsvBytes', () => {
  it('쉼표로 잇고, 쉼표·따옴표·줄바꿈이 든 칸만 따옴표, 줄 끝은 CRLF', () => {
    expect(toCsv([['a', 'b,c', 'say "hi"'], [], ['x\ny', '']])).toBe('a,"b,c","say ""hi"""\r\n\r\n"x\ny",\r\n')
  })

  it('utf8-bom은 BOM을 붙이고 utf8은 붙이지 않는다', () => {
    const table = buildFakeBitTable({ rows: 50 })
    const plain = toCsvBytes(table, 'utf8')
    const bom = toCsvBytes(table, 'utf8-bom')
    expect([...bom.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    expect([...bom.slice(3)]).toEqual([...plain])
    expect(new TextDecoder('utf-8', { ignoreBOM: true }).decode(plain)).toBe(toCsv(table))
  })

  it("CP949 바이트를 TextDecoder('euc-kr')로 풀면 UTF-8 판과 같은 글이다", () => {
    const table = buildFakeBitTable()
    const cp949 = toCsvBytes(table, 'cp949')
    expect(new TextDecoder('euc-kr').decode(cp949)).toBe(new TextDecoder().decode(toCsvBytes(table, 'utf8')))
    expect(cp949.length).toBeLessThan(toCsvBytes(table, 'utf8').length) // 한글 2바이트
  })
})

describe('AC-005.2 writeAllFixtures', SLOW, () => {
  let dir: string
  let paths: string[]
  const file = (name: string) => new Uint8Array(readFileSync(join(dir, name)))
  const base = trimTable(buildFakeBitTable())

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'fake-fixtures-'))
    paths = writeAllFixtures(dir)
  })
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('표의 파일을 모두 만들고 경로를 돌려준다', () => {
    expect(paths.map((p) => basename(p)).sort()).toEqual([...FILES].sort())
    for (const p of paths) expect(existsSync(p)).toBe(true)
  })

  it('기본 6개(UTF-8 BOM·UTF-8·CP949·xlsx·biff8·HTML 표)는 같은 표다', () => {
    expect(trimTable(readCsv(file('fake-utf8-bom.csv')))).toEqual(base)
    expect(trimTable(readCsv(file('fake-utf8.csv')))).toEqual(base)
    expect(trimTable(readCsv(file('fake-cp949.csv'), 'euc-kr'))).toEqual(base)
    expect(trimTable(readBook(file('fake.xlsx')))).toEqual(base)
    expect(trimTable(readBook(file('fake-biff.xls')))).toEqual(base)
    expect(trimTable(readBook(file('fake-html.xls')))).toEqual(base)
  })

  it('BOM은 fake-utf8-bom.csv에만, fake-html.xls 속은 HTML 표, biff는 옛 엑셀 머리', () => {
    expect([...file('fake-utf8-bom.csv').slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    expect(file('fake-utf8.csv')[0]).not.toBe(0xef)
    expect(new TextDecoder().decode(file('fake-html.xls'))).toMatch(/^<html[\s\S]*<table[\s\S]*<\/table>/)
    expect([...file('fake-biff.xls').slice(0, 4)]).toEqual([0xd0, 0xcf, 0x11, 0xe0]) // OLE2(CFB)
    expect([...file('fake.xlsx').slice(0, 2)]).toEqual([0x50, 0x4b]) // zip
  })

  it('fake-dates-mixed.csv: 처방일자 모양 다섯 가지가 섞여 있다', () => {
    const { body, col } = split(readCsv(file('fake-dates-mixed.csv')))
    expect(body).toHaveLength(3000)
    const dates = body.map((row) => row[col('처방일자')])
    for (const shape of [/^\d{4}-\d{2}-\d{2}$/, /^\d{4}\.\d{2}\.\d{2}$/, /^\d{4}\/\d{2}\/\d{2}$/, /^\d{8}$/, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/]) {
      expect(dates.some((d) => shape.test(d))).toBe(true)
    }
  })

  it('fake-dates-serial.xlsx: 처방일자가 엑셀 숫자 날짜다(2026-10-01 = 46296)', () => {
    const rows = sheetRows(XLSX.read(file('fake-dates-serial.xlsx'), { type: 'array' }), true) as unknown as unknown[][]
    const { headerAt, col } = split(rows.map((row) => row.map(String)))
    // 반복 머리줄('처방일자')과 소계·합계 줄('')을 빼면 모두 숫자
    const serials = rows
      .slice(headerAt + 1)
      .map((row) => row[col('처방일자')])
      .filter((value) => value !== '' && value !== '처방일자')
    expect(serials).toHaveLength(3000)
    for (const serial of serials) {
      expect(typeof serial).toBe('number')
      expect(serial).toBeGreaterThanOrEqual(46266) // 2026-09-01
      expect(serial).toBeLessThanOrEqual(46319) // 2026-10-24
    }
    const baseDates = split(base).body.map((row) => row[EXPECTED_HEADER.indexOf('처방일자')])
    expect(baseDates.filter((d) => d === '2026-10-01').length).toBe(serials.filter((s) => s === 46296).length)
    expect(serials).toContain(46296)
  })

  it("fake-no-period.csv: '기간' 줄만 없다", () => {
    const table = readCsv(file('fake-no-period.csv'))
    expect(table.some((row) => row[0].startsWith('기간'))).toBe(false)
    expect(split(table).header).toEqual(EXPECTED_HEADER)
    expect(split(table).body).toHaveLength(3000)
  })

  it('fake-reordered.csv: 칸 순서가 섞이고 이름에 공백·괄호 변형', () => {
    const { header, body } = split(readCsv(file('fake-reordered.csv')))
    expect(header).toContain('처방 코드')
    expect(header).toContain('처방일자(조제일)')
    expect(header.map(squash)).not.toEqual(EXPECTED_HEADER)
    expect([...header.map(squash)].sort()).toEqual([...EXPECTED_HEADER].sort())
    expect(header[0]).not.toBe('처방 코드')
    expect(body).toHaveLength(3000)
  })

  it('fake-missing-visit.csv·fake-missing-address.csv: 그 칸만 없다', () => {
    const visit = split(readCsv(file('fake-missing-visit.csv')))
    expect(visit.header).toEqual(EXPECTED_HEADER.filter((name) => name !== '초재진구분'))
    expect(visit.body).toHaveLength(3000)
    const address = split(readCsv(file('fake-missing-address.csv')))
    expect(address.header).toEqual(EXPECTED_HEADER.filter((name) => name !== '주소'))
    expect(address.body).toHaveLength(3000)
  })

  it('fake-bad-rows.csv: 처방일자 빈 줄·2026-13-45 줄·차트번호 빈 줄', () => {
    const { body, col } = split(readCsv(file('fake-bad-rows.csv')))
    expect(body).toHaveLength(3000)
    const count = (test: (row: string[]) => boolean) => body.filter(test).length
    expect(count((row) => row[col('처방일자')] === '')).toBe(FAKE_BAD_ROWS.emptyDate)
    expect(count((row) => row[col('처방일자')] === '2026-13-45')).toBe(FAKE_BAD_ROWS.invalidDate)
    expect(count((row) => row[col('차트번호')] === '')).toBe(FAKE_BAD_ROWS.emptyChart)
    expect(FAKE_BAD_ROWS.emptyDate + FAKE_BAD_ROWS.invalidDate + FAKE_BAD_ROWS.emptyChart).toBeGreaterThanOrEqual(3)
  })

  it('fake-script-name.csv: 처방명칭 하나가 <script> 글자다', () => {
    const { body, col } = split(readCsv(file('fake-script-name.csv')))
    const names = new Set(body.map((row) => row[col('처방명칭')]))
    expect(names.has('<script>alert(1)</script>')).toBe(true)
    const codes = new Set(body.filter((row) => row[col('처방명칭')] === '<script>alert(1)</script>').map((row) => row[col('처방코드')]))
    expect(codes.size).toBe(1)
  })

  it('fake-2026-08.csv·fake-2025-09.csv: 그 달 1일~말일 한 달 파일(UTF-8 BOM), 생성기에 기간만 준 표와 같다', () => {
    for (const [name, from, to] of MONTH_FILES) {
      const bytes = file(name)
      expect([...bytes.slice(0, 3)], name).toEqual([0xef, 0xbb, 0xbf])
      const table = readCsv(bytes)
      expect(trimTable(table)[1], name).toEqual([`기간: ${from} ~ ${to}`])
      // E2E가 같은 옵션으로 생성기를 불러 차트번호를 꺼낸다 → 파일이 정말 그 옵션의 표여야 한다
      expect(trimTable(table), name).toEqual(trimTable(buildFakeBitTable({ from, to })))
      const { header, body, col } = split(table)
      expect(header, name).toEqual(EXPECTED_HEADER)
      expect(body, name).toHaveLength(3000)
      const dates = new Set(body.map((row) => row[col('처방일자')]))
      for (const date of dates) expect(date >= from && date <= to, `${name} ${date}`).toBe(true)
      expect(dates.has(to), `${name}: 말일(진료일)에도 줄이 있다`).toBe(true)
    }
  })

  it('fake-empty.csv: 머리줄만 있고 본문 없음', () => {
    const { header, body } = split(readCsv(file('fake-empty.csv')))
    expect(header).toEqual(EXPECTED_HEADER)
    expect(body).toHaveLength(0)
  })

  it('본문이 있는 CSV는 모두 끝에 소계·합계 줄이 있고 step 5 합계 줄 규칙(처방코드·처방일자 빈 칸)에 맞는다', () => {
    for (const name of FILES.filter((n) => n.endsWith('.csv') && n !== 'fake-empty.csv')) {
      const table = readCsv(file(name), name === 'fake-cp949.csv' ? 'euc-kr' : 'utf-8')
      const { col } = split(table)
      const tail = table.slice(-2)
      expect(tail.map((row) => isSummaryRow(row, col)), name).toEqual([true, true])
      expect(tail.map((row) => row.find((c) => c !== '' && !/^\d+$/.test(c))), name).toEqual(['소계', '합계'])
    }
  })

  it('만든 모든 파일에 주민번호 모양(숫자6-숫자7)이 없다', () => {
    for (const name of FILES) {
      const text = BOOK_FILES.includes(name)
        ? readBook(file(name)).flat().join('\n')
        : new TextDecoder(name === 'fake-cp949.csv' ? 'euc-kr' : 'utf-8').decode(file(name))
      expect(RRN_SHAPE.test(text), name).toBe(false)
    }
    for (const seed of [1, 2, 3]) {
      expect(RRN_SHAPE.test(buildFakeBitTable({ seed, rows: 5000 }).flat().join('\n'))).toBe(false)
    }
  })

  it('커밋한 fixtures/fake-bit/·public/fake-sample/이 지금 생성기 결과와 같다(npm run fixtures를 다시 돌렸나)', () => {
    for (const name of FILES) {
      const committed = new Uint8Array(readFileSync(join(COMMITTED_DIR, name)))
      if (BOOK_FILES.includes(name)) {
        expect(readBook(committed), name).toEqual(readBook(file(name)))
      } else {
        expect(Buffer.from(committed).equals(Buffer.from(file(name))), name).toBe(true)
      }
    }
    const sample = new Uint8Array(readFileSync(COMMITTED_SAMPLE))
    expect(Buffer.from(sample).equals(Buffer.from(file('fake-utf8-bom.csv')))).toBe(true)
  })
})

// 가짜 파일 폴더는 .gitignore가 생성기 파일 이름 하나하나만 되살린다(실제 비트 파일이 커밋되지 않게)
describe('AC-005.2 저장소의 가짜 파일 폴더 · .gitignore 되살리기 목록', () => {
  const root = fileURLToPath(new URL('..', import.meta.url))

  it('fixtures/fake-bit·public/fake-sample에는 생성기가 만드는 파일만 있다(실제 파일이 섞이면 멈춘다)', () => {
    expect(readdirSync(join(root, 'fixtures', 'fake-bit')).sort()).toEqual([...FILES].sort())
    expect(readdirSync(join(root, 'public', 'fake-sample'))).toEqual(['bit-sample.csv'])
  })

  // 가짜 파일 밖 예외는 직원 탭 엑셀 양식 하나(지어낸 보기 줄만, 운영 사이트에서 내려받음 — spec staff AC-7612.4)
  it('AC-005.2·AC-7612.4: .gitignore가 되살리는 것은 생성기 파일 이름 그대로와 직원 엑셀 양식 파일 하나뿐이고(글롭 없음) 엑셀 막는 줄보다 뒤에 있다', () => {
    const lines = readFileSync(join(root, '.gitignore'), 'utf8').split(/\r?\n/) // Windows에서 받은 저장소는 줄 끝이 CRLF다
    const allowed = lines.filter((line) => line.startsWith('!') && line !== '!.env.example')
    expect([...allowed].sort()).toEqual(
      [
        ...FILES.map((name) => `!fixtures/fake-bit/${name}`),
        '!public/fake-sample/bit-sample.csv',
        '!public/staff/staff-template.xlsx',
      ].sort(),
    )
    // 환자 엑셀 막기(확장자 대소문자 무시)는 그대로이고, 되살리는 줄은 모두 그 뒤에 있어야 git이 되살린다
    const blocks = ['*.[cC][sS][vV]', '*.[xX][lL][sS]', '*.[xX][lL][sS][xX]'].map((pattern) => lines.indexOf(pattern))
    for (const at of blocks) expect(at).toBeGreaterThanOrEqual(0)
    for (const line of allowed) expect(lines.indexOf(line), line).toBeGreaterThan(Math.max(...blocks))
  })
})
