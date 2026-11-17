import { todayInKorea, weekdayOf } from '@/lib/analytics/dates'
import { savedTimeText } from '@/lib/worklog/days'
import type { RsvKind, RsvKindDef, SunapEdit, VisitKind } from '@/types/sunap'

// 수납일지 화면 글자·숫자 모양 한 곳(spec sunap-ilji, 시안 docs/mockups/sunap-ilji). 환자 값을 받지 않는 순수 함수만 둔다 → 장부 줄 화면(rows)도 쓴다

/** 장부 칸 하나 고치기 또는 되돌리기([비트 값으로 되돌리기]·예약 '비트 따라가기'). Worker 메시지 SunapPatch와 같은 모양 */
export type LedgerPatch = Partial<SunapEdit> | { revert: keyof SunapEdit }

export const VISIT_LABEL: Record<VisitKind, string> = { new: '신환', d90: '90일초진', re: '재진' }
/** 늘 있는 두 줄의 글(설정 판의 '늘 있는 줄'과 같다) */
export const RSV_NONE = '예약 안 하고 가심'
export const RSV_UNKNOWN = '종류 모름'

/** 다음 예약 종류 글(spec sunap-kinds design.md rsvLabel): none·unknown은 늘 있는 줄 글, 나머지는 설정 목록 이름(목록에 없으면 종류 모름) */
export function rsvLabel(kind: RsvKind, kinds: readonly RsvKindDef[]): string {
  if (kind === 'none') return RSV_NONE
  return kinds.find((item) => item.id === kind)?.label ?? RSV_UNKNOWN
}

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일']
const WON = new Intl.NumberFormat('ko-KR')

/** 1,234,500 */
export const won = (n: number) => WON.format(n)
/** 장부 금액 칸: 0원은 빈 칸(시안) */
export const cellWon = (n: number) => (n === 0 ? '' : won(n))
/** 비율 한 자리(분모 0이면 –) */
export const pct = (a: number, b: number) => (b ? `${(Math.round((a / b) * 1000) / 10).toFixed(1)}%` : '–')

const parts = (ymd: string) => ({ y: Number(ymd.slice(0, 4)), m: Number(ymd.slice(5, 7)), d: Number(ymd.slice(8, 10)) })

/** 날짜 줄: ['2026년', '11월 16일 (월)'] — 휴대폰은 해를 숨긴다 */
export function dayTitle(ymd: string): [string, string] {
  const { y, m, d } = parts(ymd)
  return [`${y}년`, `${m}월 ${d}일 (${WEEKDAYS[weekdayOf(ymd) - 1]})`]
}

/** 11월 16일 */
export function monthDay(ymd: string): string {
  const { m, d } = parts(ymd)
  return `${m}월 ${d}일`
}

/** 비트 예약 시각(yyyyMMddHHmm) → 11/19 (목). 모양이 틀리면 빈 글 */
export function rsvDay(at: string | null): string {
  if (at === null || !/^\d{12}$/.test(at)) return ''
  const ymd = `${at.slice(0, 4)}-${at.slice(4, 6)}-${at.slice(6, 8)}`
  try {
    return `${Number(at.slice(4, 6))}/${Number(at.slice(6, 8))} (${WEEKDAYS[weekdayOf(ymd) - 1]})`
  } catch {
    return ''
  }
}

/** 상태 칩 글: 마감 전 · 마감됨 · 18:52 · 늦은 마감 · 11월 16일 18:55(마감한 한국 날짜·시각) */
export function stateText(closedAt: string | null, late: boolean): string {
  if (closedAt === null) return '마감 전'
  const at = new Date(closedAt)
  if (Number.isNaN(at.getTime())) return '마감됨'
  return late ? `늦은 마감 · ${monthDay(todayInKorea(at))} ${savedTimeText(at)}` : `마감됨 · ${savedTimeText(at)}`
}

/** 금액 칸 고치기·지출 금액이 틀렸을 때 */
export const WON_PROBLEM = '금액은 0원부터 99,999,999원까지 숫자로 적어 주세요'

// 칩: ds.chip 모양(20px·caption 500·4px)에 시안 색. 90일초진·진료(경과)는 시안 teal(cat-2), 재진은 선만
const CHIP = 'inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-control border px-1.5 text-caption font-medium'
export const chipTeal = `${CHIP} border-transparent bg-canvas text-cat-2`
export const chipLine = `${CHIP} border-line-strong bg-surface text-muted`
