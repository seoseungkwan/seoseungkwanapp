import type { Rival } from '@/types/location'

// 진료 시간 빈틈 표(design.md 11절, AC-7909.3): 요일 7 × 칸 7, 칸마다 그 칸 전체에 문을 연 경쟁 의원 수(0이면 빈틈).
// 칸 이름은 승인된 시안(docs/mockups/location/ 후보 자세히 › 진료 시간 빈틈) 그대로.

/** 경쟁 의원 한 곳에서 이 표가 읽는 칸(types/location.ts Rival의 일부 — 그날 값 rivals를 그대로 넣는다). week = 월~일 + 공휴일 8칸, 분. null 칸 = 그날 닫음 */
export type GapRival = Pick<Rival, 'kind' | 'week'>

export type GapSlot = { id: string; from: number; to: number; label: string; lunchUnknown: boolean }

export const GAP_SLOTS: readonly GapSlot[] = [
  { id: 'early', from: 480, to: 540, label: '아침 8~9시', lunchUnknown: false },
  { id: 'morning', from: 540, to: 780, label: '오전 9~13시', lunchUnknown: false },
  { id: 'lunch', from: 780, to: 840, label: '점심 13~14시', lunchUnknown: true },
  { id: 'afternoon', from: 840, to: 1080, label: '오후 14~18시', lunchUnknown: false },
  { id: 'evening', from: 1080, to: 1140, label: '저녁 18~19시', lunchUnknown: false },
  { id: 'late', from: 1140, to: 1200, label: '저녁 19~20시', lunchUnknown: false },
  { id: 'night', from: 1200, to: 1260, label: '밤 20~21시', lunchUnknown: false },
]

export const GAP_DAYS = ['월', '화', '수', '목', '금', '토', '일'] as const

export const LUNCH_NOTE = '점심 쉬는 시간은 자료에 없어 문을 연 것으로 세요.' // requirements '화면 글 기본값'
export const HOLIDAY_NOTE = '공휴일 진료는 의원마다 그때그때 달라 세지 않아요.'

/** counts[칸][요일] · counted = 센 의원 수 · noHours = 진료 시간 자료가 없어 못 센 의원 수. 한의원은 세지 않는다 */
export type GapTable = { counts: number[][]; counted: number; noHours: number }

export function gapTable(rivals: readonly GapRival[]): GapTable {
  const counts = GAP_SLOTS.map(() => GAP_DAYS.map(() => 0))
  let counted = 0
  let noHours = 0
  for (const { kind, week } of rivals) {
    if (kind === 'korean') continue
    if (!week) {
      noHours += 1
      continue
    }
    counted += 1
    // 요일 일곱 칸만 본다 — 공휴일(8번째 칸)은 세지 않는다
    for (let d = 0; d < GAP_DAYS.length; d += 1) {
      const open = week[d]
      if (!open) continue
      GAP_SLOTS.forEach((s, si) => {
        if (open[0] <= s.from && open[1] >= s.to) counts[si][d] += 1
      })
    }
  }
  return { counts, counted, noHours }
}
