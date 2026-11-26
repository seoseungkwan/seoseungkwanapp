import type { ReactNode } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { Icon } from '@/components/common/Icon'
import type { StatsInput } from '@/components/stats/view'

// 통계 탭 의사랑 칸이 같이 쓰는 표 모양·줄(시안 docs/mockups/uisarang-upload .tb·.tbw·.covl·.tfoot·.agebar). PC 화면만이라 폰 폭 클래스가 없다

// 표: 13px · 머리 36px(muted 500 · 아래 선) · 몸 40px(ink · 아래 선) · 첫 칸 왼쪽 0 · 숫자 칸 오른쪽 맞춤. 넓으면 감싸개 안에서만 옆으로 밀린다
export const TABLE_WRAP = 'mt-3 min-w-0 overflow-x-auto'
export const TABLE = 'w-full border-collapse text-small'
export const TH = 'h-9 whitespace-nowrap border-b border-st-line px-3 text-left font-medium text-st-muted first:pl-0'
export const TH_NUM = `${TH} text-right`
// 칸 조각: 모양(CELL) · 아래 선(LINE) · 숫자(NUM). 색·굵기가 다른 줄(그 밖 처방·합계·–)은 조각을 이어 쓴다(같은 속성 클래스를 겹치지 않게)
export const CELL = 'h-10 whitespace-nowrap px-3 first:pl-0'
export const LINE = 'border-b border-st-line'
export const NUM = 'text-right tabular-nums'
export const TD = `${CELL} ${LINE} text-st-ink`
export const TD_NUM = `${TD} ${NUM}`
// 줄 아래 작은 글(.tfoot) · 표 위 덮음 줄(.covl)
export const FOOT = 'mt-2 text-small text-st-muted'
export const COVER = 'mt-2 text-small text-st-ink-2'

/** 진료한 날(그날 날 숫자의 환자 1명 이상). 처방 줄 덮기·나이대 빠진 날 셈이 쓴다 */
export function workedSet(input: StatsInput): ReadonlySet<string> {
  return new Set(input.days.filter((day) => day.totals.patients > 0).map((day) => day.day))
}

/** 읽는 동안 한 줄(통계 칸 '불러오는 중'과 같은 모양) */
export function ReadingLine({ children = '불러오는 중' }: { children?: ReactNode }) {
  return (
    <p role="status" className="mt-3 flex items-center gap-1.5 text-body text-muted">
      <Icon name="clock" size={14} className="shrink-0" />
      {children}
    </p>
  )
}

/** 저장된 의사랑 숫자를 읽지 못함(그 자리 오류 카드) */
export function ReadFailed() {
  return (
    <div className="mt-4">
      <ErrorCard code="E-UIS-READ-FAILED" />
    </div>
  )
}
