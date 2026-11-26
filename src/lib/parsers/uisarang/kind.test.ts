import { describe, expect, it } from 'vitest'
import { MAX_BYTES } from '@/lib/parsers/common'
import type { Grid } from '@/types/parse'
import { columnIndex, findHeader, HEADER_SCAN_ROWS, READ_COLUMNS } from './kind'
import { readUisFile } from './readFile'
import {
  bookBytes,
  INCOME_HEADER,
  incomeRows,
  PATIENTS_HEADER,
  patientRows,
  RSV_HEADER,
  RSV_PATIENTS_HEADER,
  rsvPatientRows,
  rsvRows,
  RX_HEADER,
  rxRows,
  TODAY,
  VISITS_HEADER,
  visitsRows,
  type BookFormat,
  type Row,
} from './testBooks'

// 종류 알아보기(design.md §3-1) · 칸 · 예약 건너뜀 · readGrid 실패 번호 바꾸기 · 파일 모양 넷

const squashed = (header: readonly (string | null)[]) => header.map((name) => (name ?? '').replace(/\s+/g, ''))
const gridWith = (rows: Row[]): Grid => rows.map((row) => [...row])
const utf8 = (text: string) => new TextEncoder().encode(text)

describe('AC-8802.1 머리 줄 칸 이름으로 종류를 정한다(파일 이름을 보지 않는다)', () => {
  it.each([
    ['income', INCOME_HEADER],
    ['rx', RX_HEADER],
    ['visits', VISITS_HEADER],
    ['visitPatients', PATIENTS_HEADER],
    ['rsv', RSV_HEADER],
    ['rsvPatients', RSV_PATIENTS_HEADER],
  ] as const)('AC-8802.1: %s 머리 줄 → 그 종류 · 그 줄 차례 · 빈칸 뺀 칸 이름', (kind, header) => {
    const grid = gridWith([['의사랑 통계'], ['[조 회 일] 2026-11-02'], [...header], ['가', 1]])
    expect(findHeader(grid)).toStrictEqual({ kind, at: 2, header: squashed(header) })
  })

  it('AC-8802.1: 칸 글자의 빈칸은 모두 빼고 견준다', () => {
    const grid: Grid = [[' 보 험 구 분 ', '진료 수납액', '총진료비']]
    expect(findHeader(grid)).toStrictEqual({ kind: 'income', at: 0, header: ['보험구분', '진료수납액', '총진료비'] })
  })

  it('AC-8802.1: 머리 줄이 되풀이되면 첫 줄', () => {
    const grid = gridWith([['제목'], [...RX_HEADER], ['carm', null, '카름정', null, null, 1, 100], [...RX_HEADER]])
    expect(findHeader(grid)?.at).toBe(1)
  })

  it('AC-8802.1: 없어야 하는 칸이 있으면 그 종류가 아니다', () => {
    expect(findHeader([['예약일', '예약건수', '차트번호']])).toBeNull()
    expect(findHeader([['내원일', '인원수', '신규환자', '차트번호']])?.kind).toBe('visitPatients') // 위쪽 표는 차트번호가 없어야 한다
    expect(findHeader([['차트번호', '신규환자', '예약일']])).toBeNull() // 아래쪽 표는 예약일이 없어야 한다
  })

  it('AC-8802.1: 한 줄이 두 종류에 맞으면 모름', () => {
    expect(findHeader([['보험구분', '진료수납액', '코드', '처방명칭', '총액']])).toBeNull()
  })

  it('AC-8802.1: 서로 다른 줄에서 두 종류가 맞으면 모름', () => {
    expect(findHeader(gridWith([[...INCOME_HEADER], ['합계', 1], [...RX_HEADER]]))).toBeNull()
  })

  it(`AC-8802.1: 머리 줄은 위 ${HEADER_SCAN_ROWS}줄 안에서만 찾는다`, () => {
    const filler = (n: number): Grid => Array.from({ length: n }, (_, i) => [`메모 ${i}`])
    expect(HEADER_SCAN_ROWS).toBe(30)
    expect(findHeader([...filler(29), [...VISITS_HEADER]])?.at).toBe(29)
    expect(findHeader([...filler(30), [...VISITS_HEADER]])).toBeNull()
  })

  it('AC-8802.1: 맞는 종류가 없으면 null · 파일은 E-UIS-KIND(종류·기간 모름)', () => {
    expect(findHeader([['이름', '금액'], ['가', 1]])).toBeNull()
    expect(readUisFile(bookBytes([['[조 회 일] 2026-11-02'], ['이름', '금액'], ['가', 1]]), TODAY)).toStrictEqual({
      status: 'refused',
      code: 'E-UIS-KIND',
      kind: null,
      span: null,
    })
  })
})

describe('AC-8802.5 종류마다 읽는 칸이 없거나 둘이면 E-UIS-COLUMN + 칸 이름', () => {
  it('AC-8802.5: 읽는 칸 목록', () => {
    expect(READ_COLUMNS).toStrictEqual({
      income: ['보험구분', '총진료비', '급여총액', '청구액', '진료수납액', '본인부담금', '비급여', '인원계', '현금수납액', '카드수납액'],
      rx: ['코드', '처방명칭', '총투여량', '총액'],
      visits: ['내원일', '인원수', '신규환자'],
      visitPatients: ['차트번호', '주민등록번호', '신규환자'],
    })
  })

  it('AC-8802.5: 다 있으면 칸 자리, 빠지거나 겹친 칸은 읽는 칸 차례로', () => {
    expect(columnIndex(['코드', '', '처방명칭', '총투여량', '총액'], READ_COLUMNS.rx)).toStrictEqual({
      ok: true,
      index: { 코드: 0, 처방명칭: 2, 총투여량: 3, 총액: 4 },
    })
    expect(columnIndex(['총액', '코드', '처방명칭', '코드'], READ_COLUMNS.rx)).toStrictEqual({ ok: false, columns: ['코드', '총투여량'] })
  })

  it('AC-8802.5: 파일 — 빠진 칸 이름만 싣고(환자 글자 없음) 조회일을 읽었으면 기간도', () => {
    const rows = incomeRows().map((row) => (row[0] === '보험구분' ? row.map((cell) => (cell === '카드수납액' ? '카드' : cell)) : row))
    expect(readUisFile(bookBytes(rows), TODAY)).toStrictEqual({
      status: 'refused',
      code: 'E-UIS-COLUMN',
      kind: 'income',
      span: { from: '2026-11-02', to: '2026-11-02' },
      columns: ['카드수납액'],
    })
  })

  it('AC-8802.5: 같은 이름 칸이 둘이면 겹친 칸 이름', () => {
    const rows = visitsRows().map((row) => (row[0] === '내원일' ? [...row, '인원수'] : row))
    const result = readUisFile(bookBytes(rows), TODAY)
    expect(result).toMatchObject({ status: 'refused', code: 'E-UIS-COLUMN', kind: 'visits', columns: ['인원수'] })
  })
})

describe('AC-8802.7 예약환자통계는 줄을 읽지 않고 건너뜀(예약)', () => {
  it.each([
    ['rsv', rsvRows()],
    ['rsvPatients', rsvPatientRows()],
  ] as const)('AC-8802.7: %s → skipped rsv · 기간 없음(조회일·조건·줄을 보지 않는다)', (kind, rows) => {
    const result = readUisFile(bookBytes(rows), TODAY)
    expect(result).toStrictEqual({ status: 'skipped', why: 'rsv', kind, span: null })
    expect(JSON.stringify(result)).not.toContain('가짜')
  })
})

describe('AC-8802.8 readGrid 실패 번호 바꾸기 · 파일 모양 넷을 같게 읽는다', () => {
  it('AC-8802.8: 50MB를 넘으면 E-UIS-TOO-BIG', () => {
    expect(readUisFile(new Uint8Array(MAX_BYTES + 1), TODAY)).toStrictEqual({ status: 'refused', code: 'E-UIS-TOO-BIG', kind: null, span: null })
  })

  it('AC-8802.8: 깨진 파일은 E-UIS-UNREADABLE', () => {
    const broken = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(readUisFile(broken, TODAY)).toStrictEqual({ status: 'refused', code: 'E-UIS-UNREADABLE', kind: null, span: null })
  })

  it('AC-8802.8: 읽은 줄이 없으면 E-UIS-KIND', () => {
    for (const bytes of [new Uint8Array(0), utf8(',,\r\n,,,\r\n')]) {
      expect(readUisFile(bytes, TODAY)).toStrictEqual({ status: 'refused', code: 'E-UIS-KIND', kind: null, span: null })
    }
  })

  const FORMATS: BookFormat[] = ['xlsx', 'html', 'csv']
  it.each([
    ['일일수입통계', incomeRows()],
    ['기간별처방통계', rxRows()],
    ['내원일별 위쪽 표', visitsRows()],
    ['내원일별 아래쪽 표', patientRows()],
  ])('AC-8802.8: %s — xls(BIFF8)·xlsx·html·csv가 같은 결과', (_, rows) => {
    const biff = readUisFile(bookBytes(rows, 'biff8'), TODAY)
    expect(biff.status).toBe('read')
    for (const format of FORMATS) expect(readUisFile(bookBytes(rows, format), TODAY)).toStrictEqual(biff)
  })
})
