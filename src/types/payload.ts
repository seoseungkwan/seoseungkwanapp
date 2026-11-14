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
  totals: Totals // first90은 그 달 모든 날에 있을 때만 그 합(선택 칸, 버전을 올리지 않음)
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
  // 처방코드 순. once = 그날 신환 중 그 처방을 받은 날이 그날뿐인 환자(선택 칸, spec first90 AC-4409.2). 없으면 이 기능 전에 저장한 날이다
  rx: Array<{ code: string; name: string; type: string; patients: number; newPatients: number; returning: number; once?: number }>
  groups: Array<{ id: string; patients: number; newPatients: number; returning: number }> // id 순
  revisit: RevisitPayload
  again?: DayAgainPayload // 선택 칸. 없으면 이 기능 전에 저장한 날(0이 아니라 '셀 수 없음'). 버전을 올리지 않는다
}

// 통계 탭 비트 전용 세 칸(환자 구성 · 시간대별 접수 · 원장님별)의 달 합계. stats_months 줄의 sections 칸에 둔다(spec stats-bit-ai REQ-2901·REQ-2902).
// 묶음 이름과 수, 원장님 이름·매출뿐이다. 차트번호·생년월일·주소 앞부분·접수 줄·진료의 코드는 없다. lib/payload/validate.ts(validateMonthSections)가 기준이다.
// 비트(v3 도우미)로 불러온 달만 있다. 파일로 불러온 달·옛 도우미(v2) 달·이 기능 전에 저장한 달은 칸이 비었다(null)
export type MonthSections = {
  v: 1
  month: string // 'YYYY-MM' (그 달 줄과 같다)
  partial: boolean // 그 달 줄과 같다
  mix: {
    people: number // 그 달 실환자(차트번호 있는 서로 다른 환자) = 연령대 명의 합
    age: Array<{ name: string; people: number }> // 연령대 열 줄, 화면 차례(10세 미만 … 80세 이상, 생년월일 없음), 0명 줄 포함
    insurance: Array<{ name: string; people: number }> // 보통 줄 · 5명 이상, 명이 큰 차례
    town: Array<{ name: string; people: number }> // [동] 보통 줄 · 5명 이상, 명이 큰 차례(많아야 10)
  }
  hours: {
    openDays: number[] // 7칸 월~일, 그 요일의 문 연 날 수
    weekdays: number[] // 7칸 월~일, 그 요일 접수 합
    hours: number[] // 13칸 8~20시, 그 시 접수 합(8시 전은 8시·21시 뒤는 20시 칸)
    unknown: number // 접수 시각을 모르는 건수
  }
  // 화면 차례. 원장님이 한 분이라 화면이 표를 그리지 않으면(single) []. amount = 수납일 기준 총진료비 합(원, 환불이면 음수도)
  doctors: Array<{ name: string; patients: number; newPatients: number; amount: number }>
}
