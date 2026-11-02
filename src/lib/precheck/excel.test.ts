import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
import type { CheckGroup, Finding } from '@/types/precheck'
import { buildClaimExcel, claimExcelName, claimExcelRows, type ExcelView } from './excel'

// [엑셀 내려받기] 파일 (AC-013.4). 원본 mx999_v22 exportXlsx의 두 시트와 같다: 규칙별 · 내원별. 이름·차트번호는 모두 지어낸 것이다

const finding = (over: Partial<Finding>): Finding => ({ visitKey: 'v1', ruleId: 'IJ-05', grade: '확인필요', message: '주사 내용', detail: 'KK090 + A15', basis: [], ...over })
const group = (over: Partial<CheckGroup>): CheckGroup => ({ ruleId: 'IJ-05', title: '주사 규칙', domain: '주사', grade: '확인필요', visitKeys: ['v1'], basis: [], ...over })

const VIEW: ExcelView = {
  visits: [
    { key: 'v1', date: '2026-10-28', chart: '000123', name: '가상환자01', findings: [finding({}), finding({ ruleId: 'PT-01', grade: '알림', message: '물리 내용', detail: '' })] },
    { key: 'v2', date: '2026-10-29', chart: '000456', name: '=SUM(1)', findings: [finding({ visitKey: 'v2', ruleId: 'PT-01', grade: '알림', message: '물리 내용', detail: '세부2' })] },
    { key: 'v3', date: '2026-10-30', chart: '000789', name: '가상환자03', findings: [] },
  ],
  groups: [
    group({
      basis: [
        { doc: '고시 문서', number: '고시 제2026-1호', effective: '2026-08-31' },
        { doc: '둘째 문서', number: '심사 기준' },
        { doc: '셋째 문서', number: '셋째는 넣지 않는다', effective: '2020-01-01' },
      ],
    }),
    group({ ruleId: 'PT-01', title: '물리 규칙', domain: '물리', grade: '알림', visitKeys: ['v1', 'v2'], basis: [] }),
  ],
}

function readBack(bytes: ArrayBuffer) {
  const book = XLSX.read(bytes, { type: 'array' })
  const rows = (name: string) => XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[name], { header: 1, raw: true, defval: '' })
  return { book, rows }
}

describe('AC-013.4 엑셀: 원본과 같은 두 시트', () => {
  it('AC-013.4: 규칙별 시트 칸과 건수·근거(근거는 앞 둘, 번호 (시행일))', () => {
    expect(claimExcelRows(VIEW).rules).toEqual([
      ['규칙', '제목', '분야', '등급', '건수', '근거'],
      ['IJ-05', '주사 규칙', '주사', '확인필요', 1, '고시 제2026-1호 (2026-08-31) · 심사 기준'],
      ['PT-01', '물리 규칙', '물리', '알림', 2, ''],
    ])
  })

  it('AC-013.4: 내원별 시트 칸. 진료 차례, 경고 없는 진료는 줄이 없다', () => {
    expect(claimExcelRows(VIEW).visits).toEqual([
      ['진료일', '차트번호', '이름', '등급', '규칙', '제목', '내용', '세부'],
      ['2026-10-28', '000123', '가상환자01', '확인필요', 'IJ-05', '주사 규칙', '주사 내용', 'KK090 + A15'],
      ['2026-10-28', '000123', '가상환자01', '알림', 'PT-01', '물리 규칙', '물리 내용', ''],
      ['2026-10-29', '000456', '=SUM(1)', '알림', 'PT-01', '물리 규칙', '물리 내용', '세부2'],
    ])
  })

  it('AC-013.4: xlsx를 다시 읽으면 시트 차례와 칸이 같다', () => {
    const { book, rows } = readBack(buildClaimExcel(VIEW))
    expect(book.SheetNames).toEqual(['규칙별', '내원별'])
    expect(rows('규칙별')).toEqual(claimExcelRows(VIEW).rules)
    expect(rows('내원별')).toEqual(claimExcelRows(VIEW).visits)
  })

  it('AC-013.4: 차트번호 앞 0이 남고, 이름의 =는 글자로 남아 수식이 되지 않는다', () => {
    const { book } = readBack(buildClaimExcel(VIEW))
    const sheet = book.Sheets['내원별']
    expect(sheet.B2.v).toBe('000123')
    expect(sheet.C4.v).toBe('=SUM(1)')
    expect(sheet.C4.f).toBeUndefined()
  })

  it('AC-013.4: 칸 폭이 원본과 같다(긴 칸 60, 나머지 12)', () => {
    const book = XLSX.read(buildClaimExcel(VIEW), { type: 'array', cellStyles: true })
    const widths = (name: string) => (book.Sheets[name]['!cols'] ?? []).map((col) => col.wch ?? col.width)
    expect(widths('규칙별')).toEqual([12, 60, 60, 60, 60, 60])
    expect(widths('내원별')).toEqual([12, 12, 12, 12, 12, 60, 60, 60])
  })

  it('AC-013.4: 파일 이름은 날짜만 있다(환자 값 없음)', () => {
    expect(claimExcelName({ from: '2026-10-28', to: '2026-11-03' })).toBe('사전점검_2026-10-28_2026-11-03.xlsx')
  })
})
