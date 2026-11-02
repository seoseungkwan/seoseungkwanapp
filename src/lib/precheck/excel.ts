import * as XLSX from 'xlsx'
import type { Basis, CheckGroup, ClaimVisitView } from '@/types/precheck'
import type { DateRange } from '@/types/dates'

// [엑셀 내려받기] 파일(AC-013.4) [환자 자료 구역]. Worker 안에서 만들어 바이트만 화면에 넘기고, 화면이 그 PC에 내려받는다. 서버로 보내지 않는다.
// 원본 mx999_v22 exportXlsx의 두 시트(규칙별·내원별)와 칸·근거 글·칸 폭이 같다. 글자는 수식이 되지 않는다(aoa_to_sheet는 글자 칸으로 넣는다)

export type ExcelView = {
  visits: Pick<ClaimVisitView, 'key' | 'date' | 'chart' | 'name' | 'findings'>[]
  groups: CheckGroup[]
}

const RULE_HEAD = ['규칙', '제목', '분야', '등급', '건수', '근거']
const VISIT_HEAD = ['진료일', '차트번호', '이름', '등급', '규칙', '제목', '내용', '세부']

/** 원본 basisText: 앞 둘의 '번호 (시행일)' */
const basisText = (basis: readonly Basis[]) =>
  basis
    .slice(0, 2)
    .map((b) => [b.number, b.effective ? `(${b.effective})` : ''].filter(Boolean).join(' '))
    .join(' · ')

export function claimExcelRows(view: ExcelView): { rules: (string | number)[][]; visits: string[][] } {
  const titles = new Map(view.groups.map((group) => [group.ruleId, group.title]))
  return {
    rules: [RULE_HEAD, ...view.groups.map((group) => [group.ruleId, group.title, group.domain, group.grade, group.visitKeys.length, basisText(group.basis)])],
    visits: [
      VISIT_HEAD,
      ...view.visits.flatMap((visit) =>
        visit.findings.map((hit) => [visit.date, visit.chart, visit.name, hit.grade, hit.ruleId, titles.get(hit.ruleId) ?? '', hit.message, hit.detail ?? '']),
      ),
    ],
  }
}

/** 원본 add(name, rows, wide): wide 칸부터 60, 앞은 12 */
function addSheet(book: XLSX.WorkBook, name: string, rows: (string | number)[][], wide: number) {
  const sheet = XLSX.utils.aoa_to_sheet(rows)
  sheet['!cols'] = rows[0].map((_, i) => ({ wch: i >= wide ? 60 : 12 }))
  XLSX.utils.book_append_sheet(book, sheet, name)
}

export function buildClaimExcel(view: ExcelView): ArrayBuffer {
  const { rules, visits } = claimExcelRows(view)
  const book = XLSX.utils.book_new()
  addSheet(book, '규칙별', rules, 1)
  addSheet(book, '내원별', visits, 5)
  return XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

/** 파일 이름에는 날짜만 넣는다(환자 값 없음, design.md 5절) */
export const claimExcelName = (period: DateRange) => `사전점검_${period.from}_${period.to}.xlsx`
