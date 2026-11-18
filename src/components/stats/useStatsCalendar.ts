'use client'

import { useCallback, useEffect, useState } from 'react'
import { addMonths, monthOf } from '@/lib/analytics/dates'
import { mergeClinic } from '@/lib/calendar/clinic'
import { occupancySpan } from '@/lib/calendar/occupancy'
import { listAllDay, listCalendarCounts, listCalendarSlots, loadCalendarSettings } from '@/lib/storage/calendar'
import { loadClinicProfile } from '@/lib/storage/clinicProfile'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { CalAllDay, CalCountRow, CalSettings, CalSlotRow } from '@/types/calendar'
import type { CalendarRows, CalendarSlots, StatsCalendarShown } from './sections/CalendarSection'

// 통계 '예약' 칸의 서버 숫자 (spec clinic-calendar REQ-5907 AC-5907.3, design.md '화면' 통계 칸, tasks.md TASK-9).
// 이번 달 1일 −11달 ~ 오늘(통계 기간 단추와 상관없음)의 예약을 listCalendarCounts(이름·차트번호·메모 칸 없음)로 읽는다.
// 셈(monthTrend·rateSummary)은 CalendarSection이 한다. 설정(loadCalendarSettings)은 나눠 보기 차례·표시 이름에만 쓴다:
// 설정을 읽지 못해도 칸은 그리고(설정 없이), 예약 줄을 읽지 못했을 때만 failed다.
// 설정은 예약 화면과 같이 병원 정보와 합친다(spec clinic-profile AC-6603.5, mergeClinic): 시행자 목록·차례가 예약 화면과 같다.
// 병원 정보가 없거나 읽지 못하면 예약 설정 시행자 그대로다.
// 다시 예약·예약 빈자리(stats-insights AC-6104.1·AC-6105.1): 같은 12달을 listCalendarSlots(이름·메모 없음)로, 빈자리 기간(오늘 앞 56일)의 휴무를 listAllDay로
// 함께 읽어 slots로 준다. 이 둘을 읽지 못하면 slots만 failed이고 위 줄·설정은 그대로다.
// 오늘이 바뀔 때·[다시 읽기]에 다시 읽고 늦게 온 앞 답은 버린다(useStatsSunap과 같은 방식). 줄·설정은 React 상태에만 둔다. 저장하지 않는다

type Slots = { rows: CalSlotRow[]; offs: CalAllDay[] }
type Read = { rows: CalCountRow[]; settings: CalSettings | null; slots: Slots | null } // settings·slots null = 그 읽기 실패
type Held = { key: string; value: Read | null } // value null = 예약 줄 읽기 실패
type Client = ReturnType<typeof supabaseBrowser>

/** 읽는 기간: 이번 달을 넣은 최근 12달의 첫날 ~ 오늘 */
function calendarSpan(today: string): { from: string; to: string } {
  return { from: `${addMonths(monthOf(today), -11)}-01`, to: today }
}

// 다시 예약·빈자리 줄. 던져도(없는 읽기 포함) 실패(null)로 받는다
const readSlots = (client: Client, from: string, today: string): Promise<Slots | null> =>
  Promise.resolve()
    .then(async () => {
      const span = occupancySpan(today)
      const [rows, offs] = await Promise.all([listCalendarSlots(client, from, today), listAllDay(client, span.from, span.to)])
      return { rows, offs }
    })
    .catch(() => null)

// 서버 클라이언트를 만들다 던져도(설정 없는 환경) 거절로 받는다
const read = (from: string, to: string): Promise<Read> =>
  Promise.resolve().then(async () => {
    const client = supabaseBrowser()
    const [rows, cal, profile, slots] = await Promise.all([
      listCalendarCounts(client, from, to),
      loadCalendarSettings(client).catch(() => null),
      loadClinicProfile(client).catch(() => 'failed' as const),
      readSlots(client, from, to),
    ])
    const settings = cal === null ? null : mergeClinic(cal, profile === 'failed' ? null : profile)
    return { rows, settings, slots }
  })

export function useStatsCalendar(today: string): StatsCalendarShown {
  const { from, to } = calendarSpan(today)
  const [attempt, setAttempt] = useState(0)
  const key = `${from}|${to}|${attempt}`
  const [held, setHeld] = useState<Held | null>(null)

  useEffect(() => {
    let current = true
    read(from, to).then(
      (value) => {
        if (current) setHeld({ key, value })
      },
      () => {
        if (current) setHeld({ key, value: null })
      },
    )
    return () => {
      current = false
    }
  }, [key, from, to])

  const onReread = useCallback(() => setAttempt((n) => n + 1), [])
  const shown = held === null || held.key !== key ? null : held
  const rows: CalendarRows = shown === null ? 'reading' : (shown.value?.rows ?? 'failed')
  const slots: CalendarSlots = shown === null ? 'reading' : (shown.value?.slots ?? 'failed')
  const settings = shown?.value?.settings ?? null
  return settings === null ? { rows, today, onReread, slots } : { rows, today, onReread, slots, settings }
}
