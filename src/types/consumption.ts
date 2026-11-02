import type { DateRange } from './dates'
import type { ErrorCode } from './errors'
import type { Outcome } from './parse'

// EMR 공통 모양. 구역 ①(브라우저) 안에서만 쓴다. 계산·화면은 이 모양만 안다(EMR 칸 이름은 모른다)
export type ConsumptionRow = {
  rxCode: string
  rxName: string
  rxType: string
  date: string // 'YYYY-MM-DD'
  firstVisit: boolean | null // null = 알 수 없는 값
  outpatient: boolean | null
  patient: number // 한 번에 넣은 파일 전체에서 매긴 번호
  region: string | null // 시·구·동까지
}

// 같은 사람 묶기에만. 원래 번호를 꺼내는 길은 없다
export type PatientIds = { idOf(chartNo: string): number }

export type ParsedFile = {
  rows: ConsumptionRow[]
  period: DateRange | null // 머리 '기간' 줄
  dataRange: DateRange // 받아들인 줄 날짜 최소~최대
  rowCount: number // 받아들인 줄 수
  skippedSummaryRows: number // 합계·소계·반복 머리줄·과목 구분 줄
  invalidRows: number // 집계 필수값 오류로 뺀 줄 (→ 묶음 품질 incomplete)
  unknownVisitRows: number // 신환·재진 값이 표에 없는 줄
  inpatientRows: number // 입원 줄(의도한 제외, 오류 아님)
}

export type ParseFailure = { code: ErrorCode; missingColumns?: string[] }

// E-PARSE-COLUMN만 없는 칸 이름 목록이 붙는다
export type ParseResult = Outcome<ParsedFile> | { ok: false; code: 'E-PARSE-COLUMN'; missingColumns: string[] }
