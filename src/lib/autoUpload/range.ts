import { roParticle } from '@/lib/admin/region'
import { addDays, addMonths, compareYmd, isYmd, monthOf, monthRange, todayInKorea, weekdayOf } from '@/lib/analytics/dates'
import { errorInfo, isErrorCode } from '@/lib/errors'
import type { DateRange } from '@/types/dates'

// 저절로 올리기 — 채울 기간 셈·상태 글(spec admin-view REQ-8020 AC-8020.1·8020.2, design.md '저절로 올리기 — 셈 · 글 · 브라우저 함수').
// 순수 함수만(네트워크·저장소 없음, 환자 자료 구역 밖). 날짜는 dates.ts, 시각은 Asia/Seoul로 읽어 PC 시간대와 상관없다.
// 글은 승인된 2차 시안(docs/mockups/admin-view index.html의 T 글, design.md '화면 글자' 2차) 그대로다

/** 관리자가 고르는 채울 기간(시안 차례). months = DB auto_upload_plans.months 아홉 값 */
export const FILL_CHOICES = [
  { months: 1, name: '1달' },
  { months: 2, name: '2달' },
  { months: 3, name: '3달' },
  { months: 6, name: '6달' },
  { months: 12, name: '1년' },
  { months: 24, name: '2년' },
  { months: 36, name: '3년' },
  { months: 60, name: '5년' },
  { months: 120, name: '10년' },
] as const

export type FillMonths = (typeof FILL_CHOICES)[number]['months']
/** 계획 줄이 없는 의원의 채울 기간(DB 기본값과 같다) */
export const DEFAULT_FILL_MONTHS: FillMonths = 2

export const isFillMonths = (value: unknown): value is FillMonths => FILL_CHOICES.some((choice) => choice.months === value)

/** 관리자 상태 목록 한 줄(admin_auto_upload_list). 날은 'YYYY-MM-DD', 시각은 DB가 준 ISO 글자, 오류는 번호만 */
export type UploadRow = {
  months: number
  throughDay: string | null
  filledFrom: string | null
  lastOkAt: string | null
  errorCode: string | null
  errorAt: string | null
}

/** 저절로 올림 칸 글: kind = 다 올라옴·채우는 중·실패·한 번도 없음, first·second = 두 줄, title = 마우스 글 */
export type UploadStatus = { kind: 'done' | 'filling' | 'failed' | 'none'; first: string; second: string | null; title: string }

/** 'N달' = 한국 오늘의 달에서 N달 앞 달의 1일부터 어제까지(11월 24일·2 → 9월 1일 ~ 11월 23일) */
export function fillRange(today: string, months: number): DateRange {
  return { from: monthRange(addMonths(monthOf(today), -months)).from, to: addDays(today, -1) }
}

const fillName = (months: number) => FILL_CHOICES.find((choice) => choice.months === months)?.name ?? `${months}달`

/** 채울 기간을 바꾼 뒤 완료 줄(늘리면 더 채운다, 줄이면 지우지 않는다). 받침은 지역 완료 줄과 같은 규칙 */
export function fillChangedText(name: string, before: number, after: number): string {
  const label = fillName(after)
  const head = `${name} 채울 기간을 ${label}${roParticle(label)} 바꿨어요.`
  return after > before ? `${head} 그 의원 PC에서 다음에 앱을 열 때부터 더 채워요.` : `${head} 이미 올라온 숫자는 지우지 않아요.`
}

const NONE_TITLE = '이 의원 비트 PC에서 아직 올라온 날이 없어요.'
const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'] // weekdayOf: 1=월 … 7=일

// h23: 자정을 '24:00'이 아니라 '00:00'으로
const KOREA_TIME = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

/** '11월 23일' */
const dayText = (ymd: string) => `${Number(ymd.slice(5, 7))}월 ${Number(ymd.slice(8, 10))}일`
/** '2024년 3월' */
const monthText = (ymd: string) => `${ymd.slice(0, 4)}년 ${Number(ymd.slice(5, 7))}월`

/** '11월 24일 (화) 08:05'(한국 시각). 읽지 못하면 null */
function atText(iso: string): string | null {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return null
  const ymd = todayInKorea(at)
  const parts = Object.fromEntries(KOREA_TIME.formatToParts(at).map((p) => [p.type, p.value]))
  return `${dayText(ymd)} (${WEEKDAYS[weekdayOf(ymd) - 1]}) ${parts.hour}:${parts.minute}`
}

const lastOkLine = (lastOkAt: string | null) => {
  const at = lastOkAt === null ? null : atText(lastOkAt)
  return at === null ? null : `마지막으로 올린 때 ${at}`
}

/**
 * 저절로 올림 칸 두 줄·마우스 글. months = 손에 든 채울 기간(바꾸면 다시 읽지 않고 이 값으로 다시 센다), today = 한국 오늘.
 * 실패(오류 번호 있음) > 한 번도 없음(다 올라온 날 없음) > 채우는 중(채운 달이 없거나 채울 기간 첫날보다 뒤) > 다 올라옴
 */
export function uploadStatus({ row, months, today }: { row: UploadRow | null | undefined; months: number; today: string }): UploadStatus {
  const throughDay = row?.throughDay && isYmd(row.throughDay) ? row.throughDay : null
  const filledFrom = row?.filledFrom && isYmd(row.filledFrom) ? row.filledFrom : null
  const errorCode = row?.errorCode ?? null
  const atLine = lastOkLine(row?.lastOkAt ?? null)

  if (errorCode !== null) {
    const what = errorInfo(isErrorCode(errorCode) ? errorCode : 'E-AUTO-UPLOAD').what
    return { kind: 'failed', first: what, second: throughDay === null ? errorCode : `${errorCode} · ${dayText(throughDay)}까지`, title: atLine ?? '' }
  }
  if (throughDay === null) return { kind: 'none', first: '아직 없음', second: null, title: NONE_TITLE }

  const first = `${dayText(throughDay)}까지`
  const filling = filledFrom === null || compareYmd(filledFrom, fillRange(today, months).from) > 0
  if (!filling) return { kind: 'done', first, second: null, title: atLine ?? '' }
  if (filledFrom === null) return { kind: 'filling', first, second: null, title: atLine ?? '' }
  const reach = monthText(filledFrom)
  const more = `채울 기간 ${fillName(months)} 가운데 ${reach}까지 채웠어요. 앱을 열 때마다 5분쯤씩 더 채워요.`
  return { kind: 'filling', first, second: `${reach}까지 채움`, title: atLine === null ? more : `${atLine} · ${more}` }
}
