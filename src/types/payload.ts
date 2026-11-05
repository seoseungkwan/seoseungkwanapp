import type { FollowUp, Totals } from './analysis'

// 병원 계정(서버)에 저장하는 모양 — 달마다·날마다 합계만. lib/payload/validate.ts가 기준이다(정해진 열쇠 밖은 거부).
// 환자 번호·차트번호·파일 이름은 없다. 비율은 저장하지 않는다(읽을 때 나눈다 — 합과 어긋나지 않게)

// 재방문 원래 숫자. withinN·after30 null = '집계 중'(요약의 RevisitView와 같은 판정)
// within30·after30은 stats 명세가 더함(선택 칸, 저장한 줄이 아직 없어 버전을 올리지 않음). 없으면 null로 읽는다
export type RevisitPayload = {
  cohort: number
  within7: number | null
  within14: number | null
  within30?: number | null
  after30?: number | null
}

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

// 같은 처방 재방문(fu-rate)의 창: 시작한 다음 날부터 7·14·30일째까지
export const AGAIN_WINDOWS = [7, 14, 30] as const
export type AgainWindow = (typeof AGAIN_WINDOWS)[number]
export type AgainCounts = [number | null, number | null, number | null] // 7·14·30일. null = 그 창이 아직 다 지나지 않음

// 그날 그 처방을 새로 시작한 환자 수(starts)와, 그중 창 안에 같은 처방을 또 받은 수(back)·더 받은 날 수의 합(more).
// 처방별 숫자뿐이다 — 환자 번호·날짜 목록은 없다
export type DayAgainPayload = {
  ready: [boolean, boolean, boolean] // 그날 ~ 그날 + N일이 다 덮이고 끝났나. 뒤가 true면 앞도 true
  rx: Array<{ code: string; starts: number; back: AgainCounts; more: AgainCounts }> // 그날 시작이 있는 처방만, 코드 순
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
  again?: DayAgainPayload // 선택 칸. 없으면 이 기능 전에 저장한 날(0이 아니라 '셀 수 없음'). 버전을 올리지 않는다
}
