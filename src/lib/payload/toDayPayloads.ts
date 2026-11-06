import { bucketState } from '@/lib/analytics/coverage'
import { addDays } from '@/lib/analytics/dates'
import type { BucketRef, BucketStats, Summary } from '@/types/analysis'
import type { AnalysisResult } from '@/types/analyze'
import { AGAIN_WINDOWS, type AgainCounts, type DayAgainPayload, type DayPayload } from '@/types/payload'
import { compareText, revisitPayload } from './toMonthPayload'

// 분석 결과 → 병원 계정에 저장할 일 숫자(폰에서 '어제'를 보려고). 줄이 있는 날마다 하나, 날짜 오름차순.
// 정해진 열쇠만 골라 새로 만든다. 동네(하루 칸은 작다)와 F/U(하루는 늘 1회)는 싣지 않는다.
// 같은 처방 재방문(again)은 처방별 몇 명·몇 번뿐이다(환자 번호·날짜 목록 없음, fu-rate)

// 집계 오류가 섞인 묶음(quality !== 'valid')이면 null — 멀쩡한 날만 골라 저장하지도 않는다
export function toDayPayloads(result: AnalysisResult): DayPayload[] | null {
  if (result.quality !== 'valid') return null
  const refOf = new Map(result.summary.series.day.map((ref) => [ref.key, ref]))
  return [...result.aggregates.day]
    .sort((a, b) => compareText(a.key, b.key))
    .map((bucket) => toPayload(bucket, refOf.get(bucket.key), result.summary))
}

// 같은 처방 재방문의 창 N이 숫자가 되나: 신환 재방문 within7/14/30(요약의 revisitView)과 같은 규칙으로
// 그날 ~ 그날 + N일이 다 덮이고 끝났을 때만. 일부인 날(partial)은 모두 false(검사가 그렇게 받는다)
function againReady(day: string, partial: boolean, summary: Summary): DayAgainPayload['ready'] {
  const ready = (n: number) => !partial && bucketState({ from: day, to: addDays(day, n) }, summary.covered, summary.today) === 'complete'
  const [n7, n14, n30] = AGAIN_WINDOWS
  const ready7 = ready(n7)
  const ready14 = ready7 && ready(n14) // 앞에서 뒤로 번진다
  return [ready7, ready14, ready14 && ready(n30)]
}

// 센 그대로의 숫자 중 아직 다 지나지 않은 창은 null. 배열은 새로 만든다(넣은 결과와 나눠 쓰지 않는다)
const againCounts = (counts: readonly number[], ready: DayAgainPayload['ready']): AgainCounts => [
  ready[0] ? counts[0] : null,
  ready[1] ? counts[1] : null,
  ready[2] ? counts[2] : null,
]

// 칸의 again(그날 시작이 있는 처방만)에서 정해진 네 열쇠만 골라 코드 순으로
function againPayload(bucket: BucketStats, partial: boolean, summary: Summary): DayAgainPayload {
  const ready = againReady(bucket.key, partial, summary)
  return {
    ready,
    rx: (bucket.again ?? [])
      .map((x) => ({ code: x.code, starts: x.starts, back: againCounts(x.back, ready), more: againCounts(x.more, ready) }))
      .sort((a, b) => compareText(a.code, b.code)),
  }
}

function toPayload(bucket: BucketStats, ref: BucketRef | undefined, summary: Summary): DayPayload {
  const { patients, newPatients, returning, unknown } = bucket.totals
  const partial = ref?.state !== 'complete' // 오늘(집계 중)·덜 덮인 날
  return {
    schemaVersion: 2,
    quality: 'valid',
    day: bucket.key,
    partial,
    totals: { patients, newPatients, returning, unknown },
    rx: bucket.rx
      .map((x) => ({ code: x.code, name: x.name, type: x.type, patients: x.patients, newPatients: x.newPatients, returning: x.returning }))
      .sort((a, b) => compareText(a.code, b.code)),
    groups: bucket.groups
      .map((g) => ({ id: g.id, patients: g.patients, newPatients: g.newPatients, returning: g.returning }))
      .sort((a, b) => compareText(a.id, b.id)),
    revisit: revisitPayload(bucket, ref),
    again: againPayload(bucket, partial, summary),
  }
}
