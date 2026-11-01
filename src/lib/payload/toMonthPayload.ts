import type { BucketRef, BucketStats } from '@/types/analysis'
import type { AnalysisResult } from '@/types/analyze'
import type { MonthPayload, RevisitPayload } from '@/types/payload'
import { MIN_REGION_PATIENTS } from './validate'

// 분석 결과 → 병원 계정에 저장할 달 숫자. 줄이 있는 달마다 하나, 달 오름차순.
// 정해진 열쇠만 골라 새로 만든다 — 처방별 동네·칸이 덮는 날 범위처럼 결과에 더 있는 칸은 따라가지 않는다.
// 같은 결과 → 같은 JSON: 처방은 코드 순, 그룹은 id 순, 동네는 이름 순으로 다시 정렬한다

// 글자 순서. localeCompare는 브라우저마다 달라 쓰지 않는다
export const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

// 요약이 '집계 중'으로 정한 재방문은 null. 요약에 없는 칸(있을 수 없지만)도 집계 중으로 둔다
export function revisitPayload(bucket: BucketStats, ref: BucketRef | undefined): RevisitPayload {
  return {
    cohort: bucket.revisit.cohort,
    within7: ref?.revisit.within7 ?? null,
    within14: ref?.revisit.within14 ?? null,
    within30: ref?.revisit.within30 ?? null,
    after30: ref?.revisit.after30 ?? null,
  }
}

// 집계 오류가 섞인 묶음(quality !== 'valid')이면 null — 멀쩡한 달만 골라 저장하지도 않는다
export function toMonthPayload(result: AnalysisResult): MonthPayload[] | null {
  if (result.quality !== 'valid') return null
  // '집계 중'(in-progress)·'부분'(partial) 모두 일부. 요약에 없는 달도 완전하다고 하지 않는다
  const refOf = new Map(result.summary.series.month.map((ref) => [ref.key, ref]))
  return [...result.aggregates.month]
    .sort((a, b) => compareText(a.key, b.key))
    .map((bucket) => toPayload(bucket, refOf.get(bucket.key)))
}

function toPayload(bucket: BucketStats, ref: BucketRef | undefined): MonthPayload {
  const { patients, newPatients, returning, unknown } = bucket.totals
  return {
    schemaVersion: 2,
    quality: 'valid',
    month: bucket.key,
    partial: ref?.state !== 'complete',
    totals: { patients, newPatients, returning, unknown },
    rx: bucket.rx
      .map((x) => ({
        code: x.code,
        name: x.name,
        type: x.type,
        patients: x.patients,
        newPatients: x.newPatients,
        returning: x.returning,
        followup: [x.followup[0], x.followup[1], x.followup[2], x.followup[3]] as MonthPayload['rx'][number]['followup'],
      }))
      .sort((a, b) => compareText(a.code, b.code)),
    groups: bucket.groups
      .map((g) => ({
        id: g.id,
        patients: g.patients,
        newPatients: g.newPatients,
        returning: g.returning,
        followup: [g.followup[0], g.followup[1], g.followup[2], g.followup[3]] as MonthPayload['groups'][number]['followup'],
      }))
      .sort((a, b) => compareText(a.id, b.id)),
    revisit: revisitPayload(bucket, ref),
    regions: bucket.regions
      .filter((region) => region.patients >= MIN_REGION_PATIENTS)
      .map((region) => ({ name: region.name, patients: region.patients }))
      .sort((a, b) => compareText(a.name, b.name)),
  }
}
