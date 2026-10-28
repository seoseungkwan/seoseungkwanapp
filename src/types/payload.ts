import type { FollowUp, Totals } from './analysis'

// 병원 계정(서버)에 저장하는 모양 — 달마다·날마다 합계만. lib/payload/validate.ts가 기준이다(정해진 열쇠 밖은 거부).
// 환자 번호·차트번호·파일 이름은 없다. 비율은 저장하지 않는다(읽을 때 나눈다 — 합과 어긋나지 않게)

// 재방문 원래 숫자. withinN null = '집계 중'(요약의 RevisitView와 같은 판정)
export type RevisitPayload = { cohort: number; within7: number | null; within14: number | null }

export type MonthPayload = {
  schemaVersion: 2
  quality: 'valid' // 불완전한 결과는 변환 거부
  month: string // 'YYYY-MM'
  partial: boolean // 그 달이 완전(complete)하지 않음 — 덜 덮였거나 아직 끝나지 않음
  totals: Totals
  rx: Array<{ code: string; name: string; type: string; patients: number; newPatients: number; returning: number; followup: FollowUp }> // 처방코드 순
  groups: Array<{ id: string; patients: number; newPatients: number; returning: number; followup: FollowUp }> // id 순
  revisit: RevisitPayload
  regions: Array<{ name: string; patients: number }> // 5명 이상만, 이름 순
}

// 폰에서 '어제'를 보려고 날마다 저장한다. 하루 동네 칸은 작아(개인 식별 위험) 넣지 않고, 하루 F/U는 늘 1회라 뺀다
export type DayPayload = {
  schemaVersion: 2
  quality: 'valid'
  day: string // 'YYYY-MM-DD'
  partial: boolean // 그 날이 완전하지 않음 — 덮이지 않았거나 오늘
  totals: Totals
  rx: Array<{ code: string; name: string; type: string; patients: number; newPatients: number; returning: number }> // 처방코드 순
  groups: Array<{ id: string; patients: number; newPatients: number; returning: number }> // id 순
  revisit: RevisitPayload
}
