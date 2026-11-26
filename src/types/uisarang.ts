import type { DateRange } from '@/types/dates'
import type { DayPayload } from '@/types/payload'
import type { RevenueDayRow } from '@/types/revenue'

// 의사랑 엑셀 올리기(specs/uisarang-upload design.md §5·§6·§8). Worker 결과 · 저장 계획 · 저장·읽기 줄의 모양.
// 환자 자료 구역(lib/parsers·lib/payload·lib/analytics·workers)이 lib/storage를 부르지 않게 함께 쓰는 타입은 모두 여기에 둔다(eslint 구역 규칙).
// 숫자·종류·기간·처방 코드·처방명칭·칸 이름만 있다 — 이름·차트번호·주민번호·전화·주소·파일 이름 칸은 없다

/** 엑셀 종류(머리 줄로 정함, design.md §3-1): 일일수입통계 · 기간별처방통계 · 내원일별 위쪽 표 · 아래쪽 표 · 예약환자통계 위·아래 */
export type UisKind = 'income' | 'rx' | 'visits' | 'visitPatients' | 'rsv' | 'rsvPatients'
/** 조회일 모양: 하루 · 한 주(월~일) · 한 달(1일~말일) */
export type UisUnit = 'day' | 'week' | 'month'
export type UisSpan = { from: string; to: string; unit: UisUnit }
/** 처방 코드 한 줄: 처방량(총투여량의 합, 환자 수 아님) · 총액(원) */
export type UisRxRow = { code: string; name: string; qty: number; amount: number }
/** 처방 저장 모양(uis_periods kind 'rx'): 코드 차례 · total = 엑셀 합계 줄 총액(비면 null) */
export type UisRxPayload = { v: 1; rows: UisRxRow[]; total: number | null }
/** 나이대 저장 모양(uis_periods kind 'age', 하루): bands·newBands는 AGE_BANDS 아홉 + 생년월일 없음 = 열 칸 */
export type UisAgePayload = { v: 1; patients: number; newPatients: number; bands: number[]; newBands: number[] }
/** 위쪽 표 날 한 줄 */
export type UisVisitDay = { day: string; patients: number; newPatients: number }

export type UisRead =
  | { kind: 'income'; span: UisSpan; row: RevenueDayRow }
  | { kind: 'rx'; span: UisSpan; payload: UisRxPayload }
  | { kind: 'visits'; span: UisSpan; days: UisVisitDay[] }
  | { kind: 'visitPatients'; span: UisSpan; payload: UisAgePayload }

/** 파일 하나를 받지 않은 번호. ErrorCode의 부분 집합이다(lib/errors.test.ts가 satisfies로 본다) */
export type UisRefuseCode =
  | 'E-UIS-KIND'
  | 'E-UIS-PERIOD'
  | 'E-UIS-ONE-DAY'
  | 'E-UIS-DATE'
  | 'E-UIS-FUTURE'
  | 'E-UIS-FILTER'
  | 'E-UIS-COLUMN'
  | 'E-UIS-ROW'
  | 'E-UIS-TOTAL'
  | 'E-UIS-TWICE'
  | 'E-UIS-TOO-BIG'
  | 'E-UIS-UNREADABLE'

/** 파일마다의 결과(Worker 답, 파일 차례 그대로). columns = 빠진·겹친 머리 칸 이름, row = 빈 줄을 뺀 위에서의 차례(1부터) */
export type UisFileResult =
  | { status: 'read'; read: UisRead }
  | { status: 'skipped'; why: 'rsv' | 'same'; kind: UisKind; span: UisSpan | null }
  | { status: 'refused'; code: UisRefuseCode; kind: UisKind | null; span: { from: string; to: string } | null; columns?: string[]; row?: number }

/** uis_periods 줄 종류 → 저장 모양 */
export type UisPeriodKind = 'rx' | 'age'
export type UisPeriodPayload<K extends UisPeriodKind> = K extends 'rx' ? UisRxPayload : UisAgePayload

/** 읽은 uis_periods 줄(검사를 지난 것, lib/storage/uisarang readUisPeriods). updatedAt = updated_at 글 그대로 */
export type UisPeriodRow<P = UisRxPayload | UisAgePayload> = { kind: UisPeriodKind; from: string; to: string; payload: P; updatedAt: string }

/**
 * 이번에 넣은 날 범위에 이미 있는 것(lib/storage/uisarang readUisHave).
 * covered = 덮은 기간(합침) · worked = 환자 1명 이상인 날 · income = 매출 줄 있는 날 · rx = 처방 줄 기간 · age = 나이대 줄 있는 날
 */
export type UisHave = { covered: DateRange[]; worked: string[]; income: string[]; rx: DateRange[]; age: string[] }

/** 처방 묶음 정의(통계 탭은 StatsRxGroup에서, AI 서버는 groupDefsOf에서 만든다). 의사랑 셈은 codes(넣는 처방)만 더한다 */
export type UisGroupDef = { id: string; codes: readonly string[]; out: readonly string[]; cond: readonly unknown[] }

/**
 * 저장 계획(lib/payload/uisarang planUisSave). files = 그 줄을 낸 파일 차례 번호(같은 엑셀로 건너뛴 파일 번호도 함께).
 * refused = 검사를 못 지나 계획에 넣지 않은 파일 차례 번호(화면은 그 파일을 E-UIS-ROW 받지 않음으로 보인다 — 일어나면 안 되는 길)
 */
export type UisPlan = {
  stats: Array<{ files: number[]; covered: DateRange; days: DayPayload[] }>
  revenue: Array<{ files: number[]; row: RevenueDayRow }>
  periods: Array<{ files: number[]; kind: UisPeriodKind; from: string; to: string; payload: UisRxPayload | UisAgePayload }>
  refused: number[]
}
