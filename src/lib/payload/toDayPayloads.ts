import type { BucketRef, BucketStats } from '@/types/analysis'
import type { AnalysisResult } from '@/types/analyze'
import type { DayPayload } from '@/types/payload'
import { compareText, revisitPayload } from './toMonthPayload'

// 분석 결과 → 병원 계정에 저장할 일 숫자(폰에서 '어제'를 보려고). 줄이 있는 날마다 하나, 날짜 오름차순.
// 정해진 열쇠만 골라 새로 만든다. 동네(하루 칸은 작다)와 F/U(하루는 늘 1회)는 싣지 않는다

// 집계 오류가 섞인 묶음(quality !== 'valid')이면 null — 멀쩡한 날만 골라 저장하지도 않는다
export function toDayPayloads(result: AnalysisResult): DayPayload[] | null {
  if (result.quality !== 'valid') return null
  const refOf = new Map(result.summary.series.day.map((ref) => [ref.key, ref]))
  return [...result.aggregates.day]
    .sort((a, b) => compareText(a.key, b.key))
    .map((bucket) => toPayload(bucket, refOf.get(bucket.key)))
}

function toPayload(bucket: BucketStats, ref: BucketRef | undefined): DayPayload {
  const { patients, newPatients, returning, unknown } = bucket.totals
  return {
    schemaVersion: 2,
    quality: 'valid',
    day: bucket.key,
    partial: ref?.state !== 'complete', // 오늘(집계 중)·덜 덮인 날
    totals: { patients, newPatients, returning, unknown },
    rx: bucket.rx
      .map((x) => ({ code: x.code, name: x.name, type: x.type, patients: x.patients, newPatients: x.newPatients, returning: x.returning }))
      .sort((a, b) => compareText(a.code, b.code)),
    groups: bucket.groups
      .map((g) => ({ id: g.id, patients: g.patients, newPatients: g.newPatients, returning: g.returning }))
      .sort((a, b) => compareText(a.id, b.id)),
    revisit: revisitPayload(bucket, ref),
  }
}
