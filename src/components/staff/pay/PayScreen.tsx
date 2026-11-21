'use client'

import { useStaffBase } from '@/components/staff/useStaffBase'
import { createRevenueStore } from '@/lib/storage/revenue'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { DateRange } from '@/types/dates'
import { PayView } from './PayView'

// /staff/pay 화면 틀 (staff REQ-7615): 직원 탭 공용 읽기(useStaffBase)와 매출 날 줄 읽기(lib/storage/revenue, RLS 내 병원)를 PayView에 넘긴다.
// 매출은 인건비 칸의 '매출 대비 %'에만 쓴다(못 읽으면 '매출 자료 없음')

const loadRevenue = (range: DateRange) => createRevenueStore(supabaseBrowser()).loadDays(range)

export function PayScreen({ today, initialPart }: { today: string; initialPart: string | null }) {
  const base = useStaffBase()
  return <PayView base={base} today={today} initialPart={initialPart} loadRevenue={loadRevenue} />
}
