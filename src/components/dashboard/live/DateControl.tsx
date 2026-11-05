'use client'

import { Icon } from '@/components/common/Icon'
import { dateLine } from '@/components/dashboard/briefing/dateLine'
import { ds } from '@/components/ui/classes'
import { addDays, compareYmd, isYmd } from '@/lib/analytics/dates'
import { LOOKBACK_DAYS } from './readBitDays'

// 날짜 고르기 (bit-dashboard REQ-605, design.md '### 날짜 고르기', 시안 docs/mockups/bit-dashboard/gen.py date_ctl·pick, css_extra.css .dp-*).
// [이전 날] · 날짜 글자 위에 투명하게 겹친 입력 · [다음 날] · 오늘이 아닐 때 [오늘로]. 고른 날은 부르는 쪽이 쥔다.
// 날짜 계산은 lib/analytics/dates.ts만 쓰고, 범위는 비트에서 읽는 기간과 같다(오늘 ~ 100일 전)

const STEP = `grid size-8 cursor-pointer place-items-center rounded-control text-ink-2 ${ds.focusRing} not-disabled:hover:bg-canvas disabled:cursor-default disabled:text-line-strong max-md:size-11`
const DATE =
  'relative inline-flex h-8 cursor-pointer items-center gap-1 rounded-control border border-line-strong px-2 text-body font-semibold text-ink transition hover:bg-canvas focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent max-md:h-11'
// 달력 표시를 칸 전체로 넓혀 어디를 눌러도 달력이 열린다
const INPUT =
  'absolute inset-0 size-full cursor-pointer opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:m-0 [&::-webkit-calendar-picker-indicator]:size-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:p-0'

/** 고를 수 있는 날인가(오늘 ~ 100일 전, AC-605.5). 지운 칸·없는 날은 아니다 */
export function inDateRange(day: string, today: string): boolean {
  return isYmd(day) && compareYmd(day, addDays(today, -LOOKBACK_DAYS)) >= 0 && compareYmd(day, today) <= 0
}

export function DateControl({ today, selected, onChange }: { today: string; selected: string; onChange(day: string): void }) {
  const earliest = addDays(today, -LOOKBACK_DAYS)
  const { date, note } = dateLine(selected)

  // 손으로 넣은 범위 밖 날짜·지운 칸은 고른 날을 바꾸지 않는다(AC-605.5)
  const pick = (day: string) => {
    if (inDateRange(day, today)) onChange(day)
  }

  return (
    <div role="group" aria-label="날짜 고르기" className="-ml-1.5 flex flex-wrap items-center gap-1 max-md:-ml-3">
      <button type="button" aria-label="이전 날" className={STEP} disabled={compareYmd(selected, earliest) <= 0} onClick={() => pick(addDays(selected, -1))}>
        <Icon name="chev" size={16} className="rotate-90" />
      </button>
      <label className={DATE}>
        <span>{date}</span>
        <Icon name="chev" size={14} className="text-muted" />
        <input type="date" aria-label="날짜 고르기" className={INPUT} min={earliest} max={today} value={selected} onChange={(e) => pick(e.target.value)} />
      </label>
      <button type="button" aria-label="다음 날" className={STEP} disabled={compareYmd(selected, today) >= 0} onClick={() => pick(addDays(selected, 1))}>
        <Icon name="chev" size={16} className="-rotate-90" />
      </button>
      {selected !== today && (
        <button type="button" className={`${ds.button.secondarySmall} ml-1`} onClick={() => onChange(today)}>
          오늘로
        </button>
      )}
      {/* 월말 덧말(AC-605.8, 시안 .dp-n): 오늘을 볼 때만이다. 한 덩어리라 줄이 넘치면 "·"와 함께 내려가고, 빈칸은 화면 읽기가 붙여 읽지 않게 둔다 */}
      {selected === today && note && (
        <span className="inline-flex gap-2 pl-2 text-small text-muted max-md:pl-3">
          <span>·</span> {note}
        </span>
      )}
    </div>
  )
}
