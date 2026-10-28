import { aggregate } from '@/lib/analytics/aggregate'
import { buildSummary } from '@/lib/analytics/compare'
import { diffDays } from '@/lib/analytics/dates'
import { createPatientIds, parseBitFile } from '@/lib/parsers/bit'
import type { RxGroupDef } from '@/types/analysis'
import type { AnalyzeOutput, FileReport, ReadFailure } from '@/types/analyze'
import type { ParsedFile, ParseResult } from '@/types/consumption'

// 한 번에 넣은 파일 묶음 → 파일마다 보고 + 묶음 전체의 숫자·요약. Web Worker 안에서 돈다(시험은 이 함수를 바로 부른다).
// 파일 이름은 받지 않는다 — 넣은 순서(index)로만 구분한다. 화면이 바이트를 꺼내지 못한 자리에는 오류 번호가 온다

// 파일 마지막 날이 오늘보다 이만큼 넘게 이전이면 '옛 파일'(주말·연휴를 생각해 3일)
const STALE_AFTER_DAYS = 3

// 같은 id의 그룹 정의가 둘이면 앞의 것만(id는 rx_groups의 열쇠라 하나여야 한다)
function uniqueGroups(groups: readonly RxGroupDef[]): RxGroupDef[] {
  const seen = new Set<string>()
  const unique: RxGroupDef[] = []
  for (const group of groups) {
    if (seen.has(group.id)) continue
    seen.add(group.id)
    unique.push(group)
  }
  return unique
}

export function analyzeFiles(
  files: Array<Uint8Array | ReadFailure>,
  today: string,
  groups: readonly RxGroupDef[] = [],
  onProgress?: (done: number, total: number) => void,
): AnalyzeOutput {
  // 번호는 묶음 전체에서 한 번 매긴다. 파일마다 새로 매기면 같은 환자를 두 번 센다
  const ids = createPatientIds()
  const reports: FileReport[] = []
  const parsed: ParsedFile[] = []

  files.forEach((bytes, index) => {
    const result: ParseResult = typeof bytes === 'string' ? { ok: false, code: bytes } : parseBitFile(bytes, ids)
    if (result.ok) {
      const file = result.value
      const late = diffDays(file.dataRange.to, today)
      parsed.push(file)
      reports.push({
        index,
        ok: true,
        period: file.period,
        range: file.dataRange,
        rowCount: file.rowCount,
        skippedSummaryRows: file.skippedSummaryRows,
        invalidRows: file.invalidRows,
        unknownVisitRows: file.unknownVisitRows,
        staleDays: late > STALE_AFTER_DAYS ? late : null,
      })
    } else if ('missingColumns' in result) {
      reports.push({ index, ok: false, code: result.code, missingColumns: result.missingColumns }) // E-PARSE-COLUMN만
    } else {
      reports.push({ index, ok: false, code: result.code })
    }
    onProgress?.(index + 1, files.length)
  })

  if (parsed.length === 0) return { files: reports, result: null }

  const skippedInvalidRows = parsed.reduce((sum, file) => sum + file.invalidRows, 0)
  // 집계 품질은 기간과 별개: 실패한 파일이나 뺀 줄이 있으면 묶음 전체가 incomplete(증감·저장을 막는다)
  const quality = parsed.length < files.length || skippedInvalidRows > 0 ? 'incomplete' : 'valid'
  const aggregates = aggregate(parsed.flatMap((file) => file.rows), uniqueGroups(groups))
  return {
    files: reports,
    result: {
      quality,
      skippedInvalidRows,
      unknownVisitRows: parsed.reduce((sum, file) => sum + file.unknownVisitRows, 0),
      aggregates,
      summary: buildSummary({ aggregates, covered: parsed.map((file) => file.period ?? file.dataRange), quality, today }),
    },
  }
}
