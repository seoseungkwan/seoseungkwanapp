import type { Aggregates, RxGroupDef, Summary } from './analysis'
import type { DateRange } from './dates'
import type { ErrorCode } from './errors'

// 화면 ↔ Web Worker가 주고받는 모양. 파일 이름은 어디에도 없다 — 화면(메인 스레드)만 index로 짝지어 보여 준다

// 넣은 순서대로 파일마다 하나
export type FileReport =
  | {
      index: number
      ok: true
      period: DateRange | null // 머리 '기간' 줄
      range: DateRange // 받아들인 줄 날짜 최소~최대(= ParsedFile.dataRange)
      rowCount: number
      skippedSummaryRows: number
      invalidRows: number
      unknownVisitRows: number
      staleDays: number | null // 파일 마지막 날이 today보다 3일 넘게 이전이면 그 날 수, 아니면 null('옛 파일' 경고)
    }
  | { index: number; ok: false; code: ErrorCode; missingColumns?: string[] }

export type AnalysisResult = {
  quality: 'valid' | 'incomplete' // 실패한 파일이 있거나 invalidRows > 0 이면 incomplete
  skippedInvalidRows: number
  unknownVisitRows: number
  aggregates: Aggregates
  summary: Summary
}

// 성공한 파일이 없으면 result null
export type AnalyzeOutput = { files: FileReport[]; result: AnalysisResult | null }

// 화면(메인 스레드)이 바이트를 꺼내지 않은 파일: 보안 프로그램 잠금·넣은 뒤 지워짐 / 크기 상한을 넘어 통째로 읽지 않음
export type ReadFailure = Extract<ErrorCode, 'E-PARSE-UNREADABLE' | 'E-PARSE-TOO-BIG'>

// 바이트만 간다(transfer로 넘겨 복사하지 않는다). 꺼내지 못한 파일은 그 자리에 번호를 둔다
// → index 짝이 그대로이고, Worker가 그 파일을 실패 보고로 남겨 묶음 품질(incomplete)에 넣는다.
// groups는 처방코드 그룹 정의(id·코드 목록)뿐이다 — 환자 자료가 아니다
export type WorkerRequest = { files: Array<ArrayBuffer | ReadFailure>; today: string; groups: RxGroupDef[] }

export type WorkerMessage =
  | { type: 'progress'; done: number; total: number }
  | { type: 'done'; output: AnalyzeOutput }
  | { type: 'failed'; code: ErrorCode } // 예외 내용은 싣지 않는다
