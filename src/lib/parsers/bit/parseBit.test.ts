import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { ConsumptionRow, ParsedFile, ParseResult } from '@/types/consumption'
import type { Cell, Grid } from '@/types/parse'
import { BIT_HEADER, FAKE_BAD_ROWS, buildFakeBitTable } from '../../../../fixtures/make-fake-fixtures'
import { toRegion } from '../region'
import * as bit from './index'
import { createPatientIds } from './patientIds'
import { looksLikeJoinedNationalId, looksLikeNationalId, parseBitFile, parseBitGrid } from './parseBit'

const FAKE_DIR = fileURLToPath(new URL('../../../../fixtures/fake-bit/', import.meta.url))
const fakeBytes = (name: string) => new Uint8Array(readFileSync(join(FAKE_DIR, name)))
const col = (name: string) => BIT_HEADER.indexOf(name)
const SLOW = { timeout: 30_000 }
// 주민번호 모양은 파일에 적지 않고 실행 중에 이어 붙인다
const idLike = (front = '900101', back = '1234567') => [front, back].join('-')

function parsedOf(result: ParseResult): ParsedFile {
  if (!result.ok) throw new Error(`실패: ${result.code}`)
  return result.value
}
const parseFake = (name: string, ids = createPatientIds()) => parsedOf(parseBitFile(fakeBytes(name), ids))

// ── 메모리 표 만들기 ─────────────────────────────────────

const MINI_HEADER = ['처방코드', '처방명칭', '유형', '처방일자', '차트번호', '초재진구분', '외래/입원', '주소']
const MINI_DEFAULT: Record<string, Cell> = {
  처방코드: 'D1001',
  처방명칭: '가짜정 10mg',
  유형: '약품',
  처방일자: '2026-10-01',
  차트번호: '9000001',
  초재진구분: '재진',
  '외래/입원': '외래',
  주소: '서울특별시 강남구 역삼동 123-4',
}

function line(over: Record<string, Cell>): Cell[] {
  return MINI_HEADER.map((name) => (name in over ? over[name] : MINI_DEFAULT[name]))
}

function grid(...lines: Cell[][]): Grid {
  return [['환자별 소모 통계'], MINI_HEADER, ...lines]
}

let baseCache: ParsedFile | undefined
const base = () => (baseCache ??= parseFake('fake-utf8-bom.csv'))

// 생성기 표에서 바로 만든 기대값. 본문 = 머리줄 아래에서 처방코드가 있고 반복 머리줄이 아닌 줄
function expectedFromGenerator() {
  const table = buildFakeBitTable()
  const headerAt = table.findIndex((row) => row[col('처방코드')] === '처방코드')
  const body = table
    .slice(headerAt + 1)
    .filter((row) => row[col('처방코드')] !== '' && row[col('처방코드')] !== '처방코드')
  const charts = new Map<string, number>()
  const rows: ConsumptionRow[] = body.map((r) => {
    const chart = r[col('차트번호')]
    if (!charts.has(chart)) charts.set(chart, charts.size + 1)
    const visit = r[col('초재진구분')]
    const inOut = r[col('외래/입원')]
    return {
      rxCode: r[col('처방코드')],
      rxName: r[col('처방명칭')],
      rxType: r[col('유형')],
      date: r[col('처방일자')],
      firstVisit: visit === '신환' ? true : visit === '재진' ? false : null,
      outpatient: inOut === '외래' ? true : inOut === '입원' ? false : null,
      patient: charts.get(chart) ?? 0,
      region: toRegion(r[col('주소')]),
    }
  })
  const dates = rows.map((r) => r.date).sort()
  return {
    rows,
    dataRange: { from: dates[0], to: dates[dates.length - 1] },
    unknownVisitRows: rows.filter((r) => r.firstVisit === null).length,
    inpatientRows: rows.filter((r) => r.outpatient === false).length,
  }
}

const withoutPatient = (row: ConsumptionRow) => ({ ...row, patient: 0 })

// part가 full에서 몇 줄만 뺀 것(순서 그대로)인가
function isSubsequence<T>(part: T[], full: T[], same: (a: T, b: T) => boolean): boolean {
  let i = 0
  for (const item of full) if (i < part.length && same(part[i], item)) i++
  return i === part.length
}

describe('AC-004.1·AC-004.2·AC-004.3 parseBitFile — 가짜 비트 파일', () => {
  it('fake-utf8-bom.csv → 생성기와 같은 줄·건너뛴 줄·기간', () => {
    const expected = expectedFromGenerator()
    expect(expected.unknownVisitRows).toBeGreaterThan(0)
    expect(expected.inpatientRows).toBeGreaterThan(0)
    const parsed = base()
    expect(parsed.rows).toEqual(expected.rows)
    expect(parsed).toMatchObject({
      period: { from: '2026-09-01', to: '2026-10-24' },
      dataRange: expected.dataRange,
      rowCount: 3000,
      skippedSummaryRows: 3, // 반복 머리줄 1 + 소계 1 + 합계 1
      invalidRows: 0,
      unknownVisitRows: expected.unknownVisitRows,
      inpatientRows: expected.inpatientRows,
    })
  })

  it('결과 어디에도 차트번호·읽지 않는 칸의 값이 없다', () => {
    const json = JSON.stringify(base())
    expect(json).not.toMatch(/(?<!\d)9000\d{3}(?!\d)/) // 차트번호
    for (const text of ['가짜환자', '000-0000-', '000-1111-', 'example.invalid', 'XXXXXX', '가짜의사', '급여', '원외']) {
      expect(json).not.toContain(text)
    }
    for (const row of base().rows) {
      expect(Object.keys(row).sort()).toEqual(
        ['date', 'firstVisit', 'outpatient', 'patient', 'region', 'rxCode', 'rxName', 'rxType'],
      )
    }
  })

  it.each(['fake-utf8.csv', 'fake-cp949.csv', 'fake.xlsx', 'fake-biff.xls', 'fake-html.xls'])(
    '%s → 기본 파일과 같은 결과',
    SLOW,
    (name) => {
      expect(parseFake(name)).toEqual(base())
    },
  )

  it.each(['fake-dates-mixed.csv', 'fake-dates-serial.xlsx'])(
    '%s → 모든 날짜가 YYYY-MM-DD, 기본 파일과 같은 결과',
    SLOW,
    (name) => {
      const parsed = parseFake(name)
      for (const row of parsed.rows) expect(row.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(parsed).toEqual(base())
    },
  )

  it('fake-reordered.csv(칸 순서·이름 변형) → 기본 파일과 같은 결과', () => {
    expect(parseFake('fake-reordered.csv')).toEqual(base())
  })

  it('fake-no-period.csv → 기간만 null', () => {
    expect(parseFake('fake-no-period.csv')).toEqual({ ...base(), period: null })
  })

  it.each([
    ['fake-missing-visit.csv', ['초재진구분']],
    ['fake-missing-address.csv', ['주소']],
  ])('%s → E-PARSE-COLUMN + 없는 칸 %j', (name, missing) => {
    expect(parseBitFile(fakeBytes(name), createPatientIds())).toEqual({
      ok: false,
      code: 'E-PARSE-COLUMN',
      missingColumns: missing,
    })
  })

  it('fake-bad-rows.csv → 넣은 오류 줄만 빼고 나머지는 정상', () => {
    const bad = FAKE_BAD_ROWS.emptyDate + FAKE_BAD_ROWS.invalidDate + FAKE_BAD_ROWS.emptyChart
    const parsed = parseFake('fake-bad-rows.csv')
    expect(parsed.invalidRows).toBe(bad)
    expect(parsed.rowCount).toBe(3000 - bad)
    expect(parsed.rows).toHaveLength(3000 - bad)
    expect(parsed.skippedSummaryRows).toBe(3)
    const same = (a: ConsumptionRow, b: ConsumptionRow) =>
      JSON.stringify(withoutPatient(a)) === JSON.stringify(withoutPatient(b))
    expect(isSubsequence(parsed.rows, base().rows, same)).toBe(true)
  })

  it('fake-empty.csv(머리줄까지만) → E-PARSE-EMPTY', () => {
    expect(parseBitFile(fakeBytes('fake-empty.csv'), createPatientIds())).toEqual({ ok: false, code: 'E-PARSE-EMPTY' })
  })

  it('readGrid 실패 번호는 그대로', () => {
    expect(parseBitFile(new Uint8Array(0), createPatientIds())).toEqual({ ok: false, code: 'E-PARSE-EMPTY' })
    const brokenZip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3])
    expect(parseBitFile(brokenZip, createPatientIds())).toEqual({ ok: false, code: 'E-PARSE-UNREADABLE' })
  })

  it('<script> 처방명은 글자 그대로 남는다', () => {
    const rows = parseFake('fake-script-name.csv').rows.filter((row) => row.rxCode === 'M3002')
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) expect(row.rxName).toBe('<script>alert(1)</script>')
  })

  it('두 파일을 같은 ids로 읽으면 같은 차트번호는 같은 번호', () => {
    const ids = createPatientIds()
    const a = parseFake('fake-utf8.csv', ids)
    const b = parseFake('fake-reordered.csv', ids)
    const patientsOf = (parsed: ParsedFile) => parsed.rows.map((row) => row.patient)
    expect(patientsOf(b)).toEqual(patientsOf(a))
    const people = new Set(patientsOf(a)).size
    expect(Math.max(...patientsOf(b))).toBe(people) // 두 번 세지 않았다
    // 새 사람은 이어서 번호를 받는다
    const other = parsedOf(parseBitGrid([MINI_HEADER, line({ 차트번호: '8000001' })], ids))
    expect(other.rows[0].patient).toBe(people + 1)
  })
})

describe('AC-004.1·AC-004.2 parseBitGrid — 메모리 표', () => {
  it('생성기 표(빈 칸이 \'\')도 파일과 같은 결과', () => {
    expect(parsedOf(parseBitGrid(buildFakeBitTable(), createPatientIds()))).toEqual(base())
  })

  it('머리줄이 없으면 E-PARSE-UNREADABLE', () => {
    const grid: Grid = [['환자별 소모 통계'], ['아무', '표'], ['1', '2']]
    expect(parseBitGrid(grid, createPatientIds())).toEqual({ ok: false, code: 'E-PARSE-UNREADABLE' })
  })

  it('없어도 되는 칸: 유형 없음 → 빈 글자, 외래/입원 없음 → 모두 외래', () => {
    const header = ['처방코드', '처방명칭', '처방일자', '차트번호', '초재진구분', '주소']
    const parsed = parsedOf(
      parseBitGrid([header, ['D1001', '가짜정 10mg', '2026-10-01', '9000001', '신환', '']], createPatientIds()),
    )
    expect(parsed.rows).toEqual([
      {
        rxCode: 'D1001', rxName: '가짜정 10mg', rxType: '', date: '2026-10-01',
        firstVisit: true, outpatient: true, patient: 1, region: null,
      },
    ])
  })

  it('처방명칭·유형은 앞뒤 공백만 뺀다, 숫자 칸은 글자로', () => {
    const parsed = parsedOf(
      parseBitGrid(
        grid(line({ 처방코드: 1001, 처방명칭: '  가짜정  10mg ', 유형: ' 약품\t', 차트번호: 9000001 }), line({})),
        createPatientIds(),
      ),
    )
    expect(parsed.rows[0]).toMatchObject({ rxCode: '1001', rxName: '가짜정  10mg', rxType: '약품', patient: 1 })
    expect(parsed.rows[1].patient).toBe(1) // 숫자 9000001 = 글자 '9000001'
  })

  it('엑셀 숫자 날짜·여러 모양 날짜 → YYYY-MM-DD, 날짜 범위는 최소~최대', () => {
    const parsed = parsedOf(
      parseBitGrid(
        grid(line({ 처방일자: '2026.10.05' }), line({ 처방일자: 46296 }), line({ 처방일자: '2026/10/03 09:30' })),
        createPatientIds(),
      ),
    )
    expect(parsed.rows.map((row) => row.date)).toEqual(['2026-10-05', '2026-10-01', '2026-10-03'])
    expect(parsed.dataRange).toEqual({ from: '2026-10-01', to: '2026-10-05' })
    expect(parsed.period).toBeNull()
  })

  it('날짜를 못 읽은 줄은 빼고 추측하지 않는다', () => {
    const parsed = parsedOf(
      parseBitGrid(
        grid(line({ 처방일자: '2026-10-01' }), line({ 처방일자: '2026-13-45' }), line({ 처방일자: null }), line({ 처방일자: '2026-10-03' })),
        createPatientIds(),
      ),
    )
    expect(parsed.invalidRows).toBe(2)
    expect(parsed.rows.map((row) => row.date)).toEqual(['2026-10-01', '2026-10-03'])
  })

  it('차트번호·처방코드가 빈 줄(공백만 포함)은 오류 줄', () => {
    const parsed = parsedOf(
      parseBitGrid(grid(line({}), line({ 차트번호: '  ' }), line({ 처방코드: null, 처방명칭: '가짜정 10mg' })), createPatientIds()),
    )
    expect(parsed).toMatchObject({ rowCount: 1, invalidRows: 2, skippedSummaryRows: 0 })
  })

  it('합계·소계·총계 줄과 반복 머리줄은 건너뛰고 센다', () => {
    const summary = (label: string) => line({ 처방코드: null, 처방일자: null, 차트번호: null, 처방명칭: label, 주소: null })
    const parsed = parsedOf(
      parseBitGrid(
        grid(line({}), [...MINI_HEADER], summary('소계'), summary(' 총계 '), summary('합 계'), line({})),
        createPatientIds(),
      ),
    )
    expect(parsed).toMatchObject({ rowCount: 2, skippedSummaryRows: 4, invalidRows: 0 })
  })

  it('처방코드 칸(첫 칸)에 합계 글자가 있고 처방일자가 비어도 합계 줄', () => {
    const total = line({ 처방코드: '합계', 처방명칭: null, 처방일자: null, 차트번호: null })
    const parsed = parsedOf(parseBitGrid(grid(line({}), total), createPatientIds()))
    expect(parsed).toMatchObject({ rowCount: 1, skippedSummaryRows: 1, invalidRows: 0 })
  })

  it('처방코드만 비고 날짜가 있으면 합계 글자가 있어도 오류 줄', () => {
    const parsed = parsedOf(
      parseBitGrid(grid(line({}), line({ 처방코드: null, 처방명칭: '소계' })), createPatientIds()),
    )
    expect(parsed).toMatchObject({ skippedSummaryRows: 0, invalidRows: 1 })
  })

  it('처방코드·처방일자가 비어도 합계 글자가 없으면 오류 줄', () => {
    const parsed = parsedOf(
      parseBitGrid(grid(line({}), line({ 처방코드: null, 처방일자: null })), createPatientIds()),
    )
    expect(parsed).toMatchObject({ skippedSummaryRows: 0, invalidRows: 1 })
  })

  it('완전히 빈 줄·허용 칸이 모두 빈 줄은 세지 않고 건너뛴다', () => {
    const header = [...MINI_HEADER, '주치의']
    const blankAllowed: Cell[] = [...MINI_HEADER.map(() => null), '가짜의사1']
    const parsed = parsedOf(
      parseBitGrid([header, line({}), [], [null, '', null], blankAllowed, line({})], createPatientIds()),
    )
    expect(parsed).toMatchObject({ rowCount: 2, skippedSummaryRows: 0, invalidRows: 0 })
  })

  it('신환·재진 값 표에 없는 값 → firstVisit null + unknownVisitRows', () => {
    const parsed = parsedOf(
      parseBitGrid(
        grid(line({ 초재진구분: ' 신환 ' }), line({ 초재진구분: '재진' }), line({ 초재진구분: '초진외' }), line({ 초재진구분: null })),
        createPatientIds(),
      ),
    )
    expect(parsed.rows.map((row) => row.firstVisit)).toEqual([true, false, null, null])
    expect(parsed.unknownVisitRows).toBe(2)
  })

  it('AC-813.2: 30 초진 줄은 firstVisit false(미확인 아님), 진찰료산정안함 줄은 null이고 unknownVisitRows에 든다', () => {
    const parsed = parsedOf(
      parseBitGrid(
        grid(line({ 초재진구분: '30 초진' }), line({ 초재진구분: '진찰료산정안함' }), line({ 초재진구분: '신환' })),
        createPatientIds(),
      ),
    )
    expect(parsed.rows.map((row) => row.firstVisit)).toEqual([false, null, true])
    expect(parsed.unknownVisitRows).toBe(1)
    expect(parsed).toMatchObject({ invalidRows: 0 })
  })

  it('입원 줄은 받아들이되 inpatientRows로 센다(오류 아님), 모르는 값은 null', () => {
    const parsed = parsedOf(
      parseBitGrid(
        grid(line({}), line({ '외래/입원': '입원' }), line({ '외래/입원': '기타' })),
        createPatientIds(),
      ),
    )
    expect(parsed.rows.map((row) => row.outpatient)).toEqual([true, false, null])
    expect(parsed).toMatchObject({ rowCount: 3, inpatientRows: 1, invalidRows: 0 })
  })

  it('외래 줄이 0개(모두 입원)면 E-PARSE-EMPTY', () => {
    const inpatient = line({ '외래/입원': '입원' })
    expect(parseBitGrid(grid(inpatient, inpatient), createPatientIds())).toEqual({ ok: false, code: 'E-PARSE-EMPTY' })
  })

  it('받아들인 줄이 0개(모두 오류·합계)면 E-PARSE-EMPTY', () => {
    expect(parseBitGrid(grid(line({ 처방일자: '날짜 아님' })), createPatientIds())).toEqual({
      ok: false,
      code: 'E-PARSE-EMPTY',
    })
  })

  it('주소 → 시·구·동까지', () => {
    const parsed = parsedOf(
      parseBitGrid(grid(line({ 주소: '경기도 성남시 분당구 정자동 12' }), line({ 주소: '  ' })), createPatientIds()),
    )
    expect(parsed.rows.map((row) => row.region)).toEqual(['경기도 성남시 분당구 정자동', null])
  })

  it('10만 줄을 1.5초 안에', SLOW, () => {
    const table = buildFakeBitTable({ rows: 100_000 })
    const start = performance.now()
    const parsed = parsedOf(parseBitGrid(table, createPatientIds()))
    expect(performance.now() - start).toBeLessThan(1500)
    expect(parsed.rowCount).toBe(100_000)
  })
})

describe('AC-004.4 주민번호 모양 — 허용 칸에 있으면 파일 전체를 받지 않는다', () => {
  // 생성기 표 본문 한 줄의 한 칸을 바꾼다
  function tableWith(column: string, value: string, which: 'body' | 'summary' = 'body'): Grid {
    const table = buildFakeBitTable()
    const at = which === 'body' ? table.findIndex((row) => row[col('처방코드')] === 'AA154') + 10 : table.length - 1
    table[at][col(column)] = value
    return table
  }

  it('주소 칸 하나 → E-PARSE-RRN(값은 결과에 넣지 않는다)', () => {
    expect(parseBitGrid(tableWith('주소', idLike()), createPatientIds())).toEqual({ ok: false, code: 'E-PARSE-RRN' })
  })

  it.each(['처방코드', '처방명칭', '유형', '처방일자', '차트번호', '초재진구분', '외래/입원', '주소'])(
    '허용 칸 %s의 글 안에 섞여 있어도 거부',
    (column) => {
      expect(parseBitGrid(tableWith(column, `가 ${idLike()} 나`), createPatientIds())).toEqual({
        ok: false,
        code: 'E-PARSE-RRN',
      })
    },
  )

  it('합계 줄의 허용 칸에 있어도 거부', () => {
    expect(parseBitGrid(tableWith('주소', idLike(), 'summary'), createPatientIds())).toEqual({
      ok: false,
      code: 'E-PARSE-RRN',
    })
  })

  it.each(['성명', '주민번호', '주상병', '주치의'])('읽지 않는 칸 %s에만 있으면 보지도 않는다', (column) => {
    expect(parsedOf(parseBitGrid(tableWith(column, idLike()), createPatientIds()))).toEqual(base())
  })

  it('월·일 모양이 아니면 주민번호로 보지 않는다', () => {
    expect(parseBitGrid(tableWith('주소', idLike('901301')), createPatientIds()).ok).toBe(true)
  })
})

describe('AC-004.4 looksLikeNationalId — 숫자6-숫자7, 앞 6자리가 월·일 모양', () => {
  it.each([
    [idLike(), true],
    [idLike('001231'), true],
    [idLike('991001', '0000000'), true],
    [`서울 ${idLike()}번지`, true],
    [idLike('901301'), false], // 13월
    [idLike('900001'), false], // 0월
    [idLike('900132'), false], // 32일
    [idLike('900100'), false], // 0일
    [idLike('90010'), false], // 앞 5자리
    [idLike('1900101'), false], // 앞 7자리
    [idLike('900101', '123456'), false], // 뒤 6자리
    [idLike('900101', '12345678'), false], // 뒤 8자리
    [['900101', '1234567'].join(''), false], // 붙임표 없음
    ['XXXXXX-XXXXXXX', false],
    ['000-0000-0001', false],
    ['2026-10-01', false],
    ['', false],
  ])('%j → %s', (value, expected) => {
    expect(looksLikeNationalId(value)).toBe(expected)
  })
})

describe('AC-004.3 index — 계산·Worker가 쓰는 것만 내보낸다', () => {
  it('parseBitFile·createPatientIds', () => {
    expect(Object.keys(bit).sort()).toEqual(['createPatientIds', 'parseBitFile'])
  })
})

// 붙여 쓴 모양도 소스에 통째로 쓰지 않는다 — 조각을 이어 만든다
const joinedIdLike = (front = '900101', back = '1234567') => [front, back].join('')

describe('AC-004.5 붙여 쓴 주민번호 모양 — 처방코드 칸 밖 허용 칸에 있으면 파일 전체를 받지 않는다', () => {
  // 생성기 표 본문 한 줄의 한 칸을 바꾼다(위 주민번호 시험과 같은 자리)
  function tableWith(column: string, value: string): Grid {
    const table = buildFakeBitTable()
    table[table.findIndex((row) => row[col('처방코드')] === 'AA154') + 10][col(column)] = value
    return table
  }

  it.each(['처방명칭', '유형', '처방일자', '차트번호', '초재진구분', '외래/입원', '주소'])(
    '허용 칸 %s의 글 안에 섞여 있어도 거부',
    (column) => {
      expect(parseBitGrid(tableWith(column, `가 ${joinedIdLike()} 나`), createPatientIds())).toEqual({
        ok: false,
        code: 'E-PARSE-RRN',
      })
    },
  )

  it('차트번호가 엑셀 숫자 칸이어도 거부', () => {
    expect(parseBitGrid(grid(line({ 차트번호: Number(joinedIdLike()) })), createPatientIds())).toEqual({
      ok: false,
      code: 'E-PARSE-RRN',
    })
  })

  it.each(['성명', '주민번호', '전화번호', '주상병'])('읽지 않는 칸 %s에만 있으면 보지도 않는다', (column) => {
    expect(parsedOf(parseBitGrid(tableWith(column, joinedIdLike()), createPatientIds()))).toEqual(base())
  })
})

describe('AC-004.6 주민번호로 보지 않는 13자리 숫자', () => {
  // 88년 6월 12일·성별 1과 같은 모양의 13자리 의약품 표준코드
  const standardCode = joinedIdLike('880612', '1012345')

  it('처방코드 칸의 의약품 표준코드(880…)는 받는다', () => {
    const parsed = parsedOf(parseBitGrid(grid(line({ 처방코드: standardCode })), createPatientIds()))
    expect(parsed.rows.map((row) => row.rxCode)).toEqual([standardCode])
  })

  it('처방코드 칸이 엑셀 숫자 칸이어도 받는다', () => {
    const parsed = parsedOf(parseBitGrid(grid(line({ 처방코드: Number(standardCode) })), createPatientIds()))
    expect(parsed.rows.map((row) => row.rxCode)).toEqual([standardCode])
  })

  it.each([
    ['월·일 자리가 맞지 않음', joinedIdLike('901301')],
    ['성별 자리가 0', joinedIdLike('900101', '0234567')],
    ['14자리 숫자 속의 13자리', `1${joinedIdLike()}`],
  ])('주소 칸에 %s → 받는다', (_, value) => {
    expect(parseBitGrid(grid(line({ 주소: `서울특별시 강남구 역삼동 ${value}` })), createPatientIds()).ok).toBe(true)
  })
})

describe('AC-004.5·AC-004.6 looksLikeJoinedNationalId — 붙여 쓴 13자리, 앞 6자리가 월·일 모양, 7번째 자리가 1~8', () => {
  it.each([
    [joinedIdLike(), true],
    [joinedIdLike('001231', '4000000'), true],
    [joinedIdLike('991001', '8999999'), true], // 외국인 등록번호의 성별 자리
    [`서울 ${joinedIdLike()}번지`, true],
    [joinedIdLike('880612', '1012345'), true], // 의약품 표준코드와 같은 모양 — 숫자로는 가르지 못해 칸으로 가른다
    [joinedIdLike('901301'), false], // 13월
    [joinedIdLike('900001'), false], // 0월
    [joinedIdLike('900132'), false], // 32일
    [joinedIdLike('900100'), false], // 0일
    [joinedIdLike('900101', '0234567'), false], // 성별 0
    [joinedIdLike('900101', '9234567'), false], // 성별 9
    [joinedIdLike('900101', '123456'), false], // 12자리
    [`1${joinedIdLike()}`, false], // 앞에 숫자
    [`${joinedIdLike()}1`, false], // 뒤에 숫자
    [idLike(), false], // 붙임표 모양은 looksLikeNationalId가 본다
    ['8806521012345', false], // 52일
    ['XXXXXXXXXXXXX', false],
    ['', false],
  ])('%j → %s', (value, expected) => {
    expect(looksLikeJoinedNationalId(value)).toBe(expected)
  })
})

describe('AC-004.5·AC-004.6 엑셀 숫자 칸 · 처방코드가 첫 칸이 아닌 표', () => {
  // 처방코드가 8번째 칸이고 그 앞에 읽지 않는 칸(성명)이 있다(실제 비트 23칸 표처럼). 그래서 허용 칸 안 자리와
  // 칸 번호가 다르다 — 처방코드·차트번호 칸을 칸 번호로 가르는지 본다
  const REORDERED = ['주소', '처방일자', '성명', '차트번호', '초재진구분', '처방명칭', '유형', '처방코드', '외래/입원']
  const REORDERED_DEFAULT: Record<string, Cell> = { ...MINI_DEFAULT, 성명: '가짜환자' }
  const reordered = (over: Record<string, Cell>): Grid => [
    ['환자별 소모 통계'],
    REORDERED,
    REORDERED.map((name) => (name in over ? over[name] : REORDERED_DEFAULT[name])),
  ]
  const TABLES: Array<[string, (over: Record<string, Cell>) => Grid]> = [
    ['기본 머리줄', (over) => grid(line(over))],
    ['칸 순서가 바뀐 머리줄', reordered],
  ]
  const RRN_FOUND = { ok: false, code: 'E-PARSE-RRN' }

  // 엑셀 숫자 칸에서는 앞 0이 사라진다: 2001~2009년생은 12자리, 2000년생은 10·11자리 숫자가 된다
  const lostZero = [
    ['2005년생', joinedIdLike('050101', '3234567')],
    ['2000년 1월생', joinedIdLike('000101', '4234567')],
    ['2000년 11월생', joinedIdLike('001101', '7234567')],
  ]

  it.each(lostZero)('처방명칭·유형·주소 엑셀 숫자 칸의 %s → 거부(서버로 가는 칸)', (_, id) => {
    for (const [, tableOf] of TABLES) {
      for (const column of ['처방명칭', '유형', '주소']) {
        expect(parseBitGrid(tableOf({ [column]: Number(id) }), createPatientIds())).toEqual(RRN_FOUND)
      }
    }
  })

  // 차트번호는 메모리 안 번호로만 바뀌고 밖으로 나가지 않는다. 10~12자리 숫자 차트번호를 쓰는 병원의 파일을 잘못 거르지 않게 채우지 않는다
  it.each(lostZero)('차트번호 엑셀 숫자 칸은 13자리로 채우지 않는다(%s 모양도 받는다)', (_, id) => {
    for (const [, tableOf] of TABLES) {
      expect(parseBitGrid(tableOf({ 차트번호: Number(id) }), createPatientIds()).ok).toBe(true)
    }
  })

  it.each(TABLES)('%s: 처방코드 칸의 의약품 표준코드는 받는다', (_, tableOf) => {
    const standardCode = joinedIdLike('880612', '1012345')
    const parsed = parsedOf(parseBitGrid(tableOf({ 처방코드: standardCode }), createPatientIds()))
    expect(parsed.rows.map((row) => row.rxCode)).toEqual([standardCode])
  })

  it.each(REORDERED.filter((name) => name !== '처방코드' && name !== '성명'))(
    '칸 순서가 바뀐 머리줄: %s 칸의 붙여 쓴 주민번호 모양은 거부',
    (column) => {
      expect(parseBitGrid(reordered({ [column]: `가 ${joinedIdLike()} 나` }), createPatientIds())).toEqual(RRN_FOUND)
    },
  )

  it('처방명칭 엑셀 숫자 칸이라도 13자리로 채워 2000년대생 주민번호 모양이 아니면 받는다', () => {
    // 13자리로 채우면 차례로 0월 · 성별 0 · 성별 9 · 성별 6이 된다(마지막은 1900년대생 모양 —
    // 채운 값은 앞 두 자리가 00~09라 2000년대생 성별 3·4·7·8만 본다)
    for (const name of [9000001, 1300000000, 501319234567, 2026100109]) {
      for (const [, tableOf] of TABLES) expect(parseBitGrid(tableOf({ 처방명칭: name }), createPatientIds()).ok).toBe(true)
    }
  })
})

// 과목 구분 줄: 환자 기록이 아니다. 진료실 이름은 지어낸 값
const ROOM = '가짜1진료실'
const DIVIDER = '◀ 과 목 ▶'
// 처방코드·처방명칭만 있는 구분 줄. over로 칸을 더 채운다
function divider(code: string = DIVIDER, over: Record<string, Cell> = {}): Cell[] {
  return line({
    처방코드: code, 처방명칭: ROOM, 유형: null, 처방일자: null, 차트번호: null, 초재진구분: null, '외래/입원': null, 주소: null,
    ...over,
  })
}

describe('AC-901.1 과목 구분 줄은 건너뛰고 skippedSummaryRows로 센다', () => {
  it.each([
    DIVIDER, '◀과목▶', '◀ 과목 ▶', '◀과 목▶', '  ◀  과  목  ▶  ', '◀　과　목　▶', '◀\n과 목\n▶', ' ◀과목▶ ', '과목', '과 목', '◀과목', '과목▶',
  ])('처방코드 %j', (code) => {
    const parsed = parsedOf(parseBitGrid(grid(divider(code), line({})), createPatientIds()))
    expect(parsed).toMatchObject({ rowCount: 1, skippedSummaryRows: 1, invalidRows: 0 })
    expect(parsed.rows.map((row) => row.rxCode)).toEqual(['D1001'])
  })

  it('줄 끝 빈 칸을 떼어 낸 짧은 줄도 건너뛴다', () => {
    const parsed = parsedOf(parseBitGrid(grid([DIVIDER, ROOM], line({})), createPatientIds()))
    expect(parsed).toMatchObject({ rowCount: 1, skippedSummaryRows: 1, invalidRows: 0 })
  })

  it('처방일자·차트번호에 공백만 있어도 빈 칸으로 본다', () => {
    const parsed = parsedOf(parseBitGrid(grid(divider(DIVIDER, { 처방일자: '  ', 차트번호: '\t' }), line({})), createPatientIds()))
    expect(parsed).toMatchObject({ rowCount: 1, skippedSummaryRows: 1, invalidRows: 0 })
  })

  it.each([[null], ['가짜9진료실'], ['']])('처방명칭 칸 값은 조건이 아니다: %j', (room) => {
    const parsed = parsedOf(parseBitGrid(grid(divider(DIVIDER, { 처방명칭: room }), line({})), createPatientIds()))
    expect(parsed).toMatchObject({ rowCount: 1, skippedSummaryRows: 1, invalidRows: 0 })
  })

  it('처방일자·차트번호 말고 다른 칸에 값이 있어도 조건은 그 세 칸뿐이다', () => {
    const row = line({ 처방코드: DIVIDER, 처방일자: null, 차트번호: null })
    const parsed = parsedOf(parseBitGrid(grid(row, line({})), createPatientIds()))
    expect(parsed).toMatchObject({ rowCount: 1, skippedSummaryRows: 1, invalidRows: 0 })
  })

  it('칸 순서가 달라도 처방코드·처방일자·차트번호 칸으로 본다', () => {
    const header = ['차트번호', '처방일자', '처방명칭', '처방코드', '초재진구분', '주소']
    const parsed = parsedOf(
      parseBitGrid(
        [header, [null, null, ROOM, DIVIDER], ['9000001', '2026-10-01', '가짜정 10mg', 'D1001', '재진', '']],
        createPatientIds(),
      ),
    )
    expect(parsed).toMatchObject({ rowCount: 1, skippedSummaryRows: 1, invalidRows: 0 })
  })

  it('합계·반복 머리줄과 함께 세고, 구분 줄의 글자는 결과에 없다', () => {
    const summary = line({ 처방코드: null, 처방일자: null, 차트번호: null, 처방명칭: '소계', 주소: null })
    const parsed = parsedOf(
      parseBitGrid(grid(divider(), line({}), divider('◀과목▶'), [...MINI_HEADER], line({}), summary), createPatientIds()),
    )
    expect(parsed).toMatchObject({ rowCount: 2, skippedSummaryRows: 4, invalidRows: 0 })
    expect(parsed.rows.map((row) => row.patient)).toEqual([1, 1])
    for (const text of [ROOM, '진료실', '과목', '◀', '▶']) expect(JSON.stringify(parsed)).not.toContain(text)
  })
})

describe('AC-901.3 구분 줄 모양이라도 처방일자나 차트번호가 있으면 건너뛰지 않는다', () => {
  it.each<[string, Record<string, Cell>]>([
    ['차트번호만', { 차트번호: '9000001' }],
    ['차트번호만(엑셀 숫자 칸)', { 차트번호: 9000001 }],
    ['처방일자만', { 처방일자: '2026-10-01' }],
    ['처방일자만(엑셀 숫자 칸)', { 처방일자: 46296 }],
    ['못 읽는 처방일자만', { 처방일자: '2026-13-45' }],
    ['못 읽는 처방일자 + 차트번호', { 처방일자: '2026-13-45', 차트번호: '9000001' }],
  ])('%s → 오류 줄', (_, over) => {
    const parsed = parsedOf(parseBitGrid(grid(divider(DIVIDER, over), line({})), createPatientIds()))
    expect(parsed).toMatchObject({ rowCount: 1, skippedSummaryRows: 0, invalidRows: 1 })
  })

  it('처방일자·차트번호가 모두 읽히면 지금처럼 환자 줄이다', () => {
    const parsed = parsedOf(
      parseBitGrid(grid(divider(DIVIDER, { 처방일자: '2026-10-01', 차트번호: '9000001' }), line({})), createPatientIds()),
    )
    expect(parsed).toMatchObject({ rowCount: 2, skippedSummaryRows: 0, invalidRows: 0 })
    expect(parsed.rows[0].rxCode).toBe(DIVIDER)
  })
})

describe('AC-901.4 처방코드가 구분 표시가 아니면 건너뛰지 않는다', () => {
  it.each(['과목코드', '가짜과목', `${DIVIDER} 가짜진료실`, '◀ 과 목 ▶ ◀ 과 목 ▶', '◀▶', '◁ 과 목 ▷', '◀ 과 ▶', '[과목]'])(
    '처방코드 %j, 처방일자·차트번호 빈 줄 → 오류 줄',
    (code) => {
      const parsed = parsedOf(parseBitGrid(grid(divider(code), line({})), createPatientIds()))
      expect(parsed).toMatchObject({ rowCount: 1, skippedSummaryRows: 0, invalidRows: 1 })
    },
  )

  it.each(['처방명칭', '유형', '초재진구분', '외래/입원', '주소'])(
    '처방코드가 비고 %s 칸에만 구분 글자가 있는 줄 → 오류 줄',
    (column) => {
      const row = line({
        처방코드: null, 처방명칭: null, 유형: null, 처방일자: null, 차트번호: null, 초재진구분: null, '외래/입원': null, 주소: null,
        [column]: DIVIDER,
      })
      const parsed = parsedOf(parseBitGrid(grid(row, line({})), createPatientIds()))
      expect(parsed).toMatchObject({ rowCount: 1, skippedSummaryRows: 0, invalidRows: 1 })
    },
  )

  it('처방명칭에 과목이 있는 정상 줄은 그대로 환자 줄이다', () => {
    const parsed = parsedOf(parseBitGrid(grid(line({ 처방명칭: '◀ 과 목 ▶ 가짜정' })), createPatientIds()))
    expect(parsed).toMatchObject({ rowCount: 1, skippedSummaryRows: 0, invalidRows: 0 })
  })
})

describe('AC-901.5 구분 줄이 있어도 진짜 오류 줄은 그대로 센다', () => {
  it('구분 줄은 빼고 진짜 오류 줄만 invalidRows로 센다', () => {
    const parsed = parsedOf(
      parseBitGrid(
        grid(divider(), line({ 차트번호: null }), divider('◀과목▶'), line({ 처방일자: '2026-13-45' }), line({ 처방일자: null }), divider('과 목'), line({})),
        createPatientIds(),
      ),
    )
    expect(parsed).toMatchObject({ rowCount: 1, skippedSummaryRows: 3, invalidRows: 3 })
  })
})

describe('AC-901.6 구분 줄의 주민번호 모양은 건너뛰기 전에 잡는다', () => {
  const RRN_FOUND = { ok: false, code: 'E-PARSE-RRN' }

  it.each<[string, Record<string, Cell>]>([
    ['처방명칭', { 처방명칭: idLike() }],
    ['주소', { 주소: `가짜시 ${idLike()}` }],
    ['유형', { 유형: joinedIdLike() }],
  ])('%s 칸 → 파일 전체를 받지 않는다', (_, over) => {
    expect(parseBitGrid(grid(divider(DIVIDER, over), line({})), createPatientIds())).toEqual(RRN_FOUND)
  })
})

describe('AC-901.7 구분 줄만 있고 환자 줄이 없으면', () => {
  it('지금처럼 E-PARSE-EMPTY', () => {
    expect(parseBitGrid(grid(divider(), divider('◀과목▶'), divider('과 목')), createPatientIds())).toEqual({
      ok: false,
      code: 'E-PARSE-EMPTY',
    })
  })
})

// 꾸민 합계 표시 줄: 처방코드 말고 모든 허용 칸이 비었다. over로 칸을 더 채운다. 값은 모두 지어낸 것
function footer(code: string, over: Record<string, Cell> = {}): Cell[] {
  return line({
    처방코드: code, 처방명칭: null, 유형: null, 처방일자: null, 차트번호: null, 초재진구분: null, '외래/입원': null, 주소: null,
    ...over,
  })
}
const SPACED_LABELS = ['[ 소 계 ]', '< 합 계 >', '소 계', '◀ 총 계 ▶']
const OTHER_CELLS: Record<string, Cell> = {
  처방명칭: '가짜정 10mg', 유형: '약품', 초재진구분: '재진', '외래/입원': '외래', 주소: '서울특별시 강남구 역삼동 123-4',
}

describe('AC-902.1 꾸민 합계 표시 줄은 건너뛰고 skippedSummaryRows로 센다', () => {
  it.each([...SPACED_LABELS, 'A1 소 계', '1소2계3', '( 합 계 )', '소　계', '합\n계', ' 총 계 '])('처방코드 %j', (code) => {
    const parsed = parsedOf(parseBitGrid(grid(footer(code), line({})), createPatientIds()))
    expect(parsed).toMatchObject({ rowCount: 1, skippedSummaryRows: 1, invalidRows: 0 })
    expect(parsed.rows.map((row) => row.rxCode)).toEqual(['D1001'])
  })

  it('줄 끝 빈 칸을 떼어 낸 짧은 줄도 건너뛴다', () => {
    const parsed = parsedOf(parseBitGrid(grid(['[ 소 계 ]'], line({})), createPatientIds()))
    expect(parsed).toMatchObject({ rowCount: 1, skippedSummaryRows: 1, invalidRows: 0 })
  })

  it('처방일자·차트번호에 공백만 있어도 빈 칸으로 본다', () => {
    const parsed = parsedOf(parseBitGrid(grid(footer('[ 소 계 ]', { 처방일자: '  ', 차트번호: '\t' }), line({})), createPatientIds()))
    expect(parsed).toMatchObject({ rowCount: 1, skippedSummaryRows: 1, invalidRows: 0 })
  })

  it('표시 글자는 결과에 없다', () => {
    const parsed = parsedOf(parseBitGrid(grid(line({}), ...SPACED_LABELS.map((code) => footer(code))), createPatientIds()))
    expect(parsed).toMatchObject({ rowCount: 1, skippedSummaryRows: 4, invalidRows: 0 })
    for (const text of ['소 계', '합 계', '총 계', '◀', '▶']) expect(JSON.stringify(parsed)).not.toContain(text)
  })
})

describe('AC-902.2 꾸민 합계 표시 줄의 다른 칸은 조건이 아니다', () => {
  it.each(SPACED_LABELS)('%j: 처방명칭·유형·주소 같은 허용 칸이 차 있어도 건너뛴다', (code) => {
    const parsed = parsedOf(parseBitGrid(grid(footer(code, OTHER_CELLS), line({})), createPatientIds()))
    expect(parsed).toMatchObject({ rowCount: 1, skippedSummaryRows: 1, invalidRows: 0 })
  })

  it('읽지 않는 숫자 칸이 차 있어도 건너뛴다', () => {
    const header = [...MINI_HEADER, '단가', '금액']
    const parsed = parsedOf(
      parseBitGrid([header, [...footer('[ 소 계 ]', { 유형: '약품' }), 120, 34500], [...line({}), 120, 120]], createPatientIds()),
    )
    expect(parsed).toMatchObject({ rowCount: 1, skippedSummaryRows: 1, invalidRows: 0 })
  })

  it('칸 순서가 달라 처방코드 앞 칸에 값이 있어도 건너뛴다', () => {
    const header = ['처방명칭', '유형', '처방코드', '처방일자', '차트번호', '초재진구분', '주소']
    const parsed = parsedOf(
      parseBitGrid(
        [header, ['가짜정 10mg', '약품', '[ 소 계 ]'], ['가짜정 10mg', '약품', 'D1001', '2026-10-01', '9000001', '재진', '']],
        createPatientIds(),
      ),
    )
    expect(parsed).toMatchObject({ rowCount: 1, skippedSummaryRows: 1, invalidRows: 0 })
  })
})

describe('AC-902.3 꾸민 합계 표시라도 처방일자나 차트번호가 있으면 건너뛰지 않는다', () => {
  const OVERS: Array<[string, Record<string, Cell>]> = [
    ['차트번호만', { 차트번호: '9000001' }],
    ['차트번호만(엑셀 숫자 칸)', { 차트번호: 9000001 }],
    ['처방일자만', { 처방일자: '2026-10-01' }],
    ['처방일자만(엑셀 숫자 칸)', { 처방일자: 46296 }],
    ['못 읽는 처방일자만', { 처방일자: '2026-13-45' }],
    ['못 읽는 처방일자 + 차트번호', { 처방일자: '2026-13-45', 차트번호: '9000001' }],
  ]

  describe.each(SPACED_LABELS)('%j', (code) => {
    it.each(OVERS)('%s → 오류 줄', (_, over) => {
      const parsed = parsedOf(parseBitGrid(grid(footer(code, over), line({})), createPatientIds()))
      expect(parsed).toMatchObject({ rowCount: 1, skippedSummaryRows: 0, invalidRows: 1 })
    })

    it('처방일자·차트번호가 모두 읽히면 지금처럼 환자 줄이다', () => {
      const parsed = parsedOf(
        parseBitGrid(grid(footer(code, { 처방일자: '2026-10-01', 차트번호: '9000001' }), line({})), createPatientIds()),
      )
      expect(parsed).toMatchObject({ rowCount: 2, skippedSummaryRows: 0, invalidRows: 0 })
      expect(parsed.rows[0].rxCode).toBe(code)
    })
  })
})

describe('AC-902.4 한글만 남긴 처방코드가 소계·합계·총계가 아니면 건너뛰지 않는다', () => {
  const NOT_LABELS = ['복합 계열', '합 계 정산', '소 개', '[ 합 격 ]', '소 계 합 계', '소ㄱ계', '가 짜 소 계', '[ ]']

  it.each(NOT_LABELS)('%j, 처방일자·차트번호 빈 줄 → 오류 줄', (code) => {
    const parsed = parsedOf(parseBitGrid(grid(footer(code), line({})), createPatientIds()))
    expect(parsed).toMatchObject({ rowCount: 1, skippedSummaryRows: 0, invalidRows: 1 })
  })

  it.each(NOT_LABELS)('%j, 다른 칸이 차 있어도 오류 줄', (code) => {
    const parsed = parsedOf(parseBitGrid(grid(footer(code, OTHER_CELLS), line({})), createPatientIds()))
    expect(parsed).toMatchObject({ rowCount: 1, skippedSummaryRows: 0, invalidRows: 1 })
  })

  it.each(['복합 계열', '합 계 정산'])('%j, 처방일자만 비고 차트번호가 찬 환자 기록 → 오류 줄', (code) => {
    const parsed = parsedOf(parseBitGrid(grid(line({ 처방코드: code, 처방일자: null }), line({})), createPatientIds()))
    expect(parsed).toMatchObject({ rowCount: 1, skippedSummaryRows: 0, invalidRows: 1 })
  })

  it.each(['복합 계열', '합 계 정산'])('%j, 처방일자·차트번호가 있으면 지금처럼 환자 줄이다', (code) => {
    const parsed = parsedOf(parseBitGrid(grid(line({ 처방코드: code }), line({})), createPatientIds()))
    expect(parsed).toMatchObject({ rowCount: 2, skippedSummaryRows: 0, invalidRows: 0 })
  })

  it.each(['처방명칭', '유형', '주소'])('처방코드는 다른 값이고 %s 칸에만 표시가 있는 줄 → 오류 줄', (column) => {
    const parsed = parsedOf(parseBitGrid(grid(footer('D1001', { [column]: '소 계' }), line({})), createPatientIds()))
    expect(parsed).toMatchObject({ rowCount: 1, skippedSummaryRows: 0, invalidRows: 1 })
  })
})

describe('AC-902.7 꾸민 합계 표시 줄의 주민번호 모양은 건너뛰기 전에 잡는다', () => {
  const RRN_FOUND = { ok: false, code: 'E-PARSE-RRN' }

  it.each<[string, Cell[]]>([
    ['처방코드', footer(`[ 소 계 ] ${idLike()}`)],
    ['처방명칭', footer('[ 소 계 ]', { 처방명칭: idLike() })],
    ['유형', footer('[ 소 계 ]', { 유형: joinedIdLike() })],
    ['주소', footer('[ 소 계 ]', { 주소: `가짜시 ${idLike()}` })],
  ])('%s 칸 → 파일 전체를 받지 않는다', (_, row) => {
    expect(parseBitGrid(grid(row, line({})), createPatientIds())).toEqual(RRN_FOUND)
  })
})

describe('AC-902.8 붙여 쓴 합계 글자는 기존 합계 줄 조건 그대로다', () => {
  it.each(['소계', '[소계]', '복합계열', '합계 정산'])('처방코드 %j, 처방일자가 비면 건너뛴다', (code) => {
    const parsed = parsedOf(parseBitGrid(grid(footer(code), line({})), createPatientIds()))
    expect(parsed).toMatchObject({ rowCount: 1, skippedSummaryRows: 1, invalidRows: 0 })
  })

  it.each(['소계', '[소계]', '복합계열', '합계 정산'])('처방코드 %j, 차트번호가 찬 줄도 건너뛴다', (code) => {
    const parsed = parsedOf(parseBitGrid(grid(footer(code, { 차트번호: '9000001' }), line({})), createPatientIds()))
    expect(parsed).toMatchObject({ rowCount: 1, skippedSummaryRows: 1, invalidRows: 0 })
  })

  it('처방코드가 비고 처방명칭의 공백을 빼면 합계 글자가 나오는 줄도 차트번호와 상관없이 건너뛴다', () => {
    const row = footer('', { 처방코드: null, 처방명칭: '복합 계열', 차트번호: '9000001' })
    const parsed = parsedOf(parseBitGrid(grid(row, line({})), createPatientIds()))
    expect(parsed).toMatchObject({ rowCount: 1, skippedSummaryRows: 1, invalidRows: 0 })
  })
})
