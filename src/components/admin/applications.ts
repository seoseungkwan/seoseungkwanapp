import { todayInKorea } from '@/lib/analytics/dates'
import type { Application } from '@/lib/auth/admin'

// 관리자 화면의 순수 계산(탭·칸 글자·완료 문구). 탭·순서는 승인된 목업 docs/mockups/auth/Admin.dc.html,
// 말끝은 ui-90 시안 말투 "~요"(ui-90 AC-417.1)
export type Tab = 'pending' | 'approved' | 'rejected'

// 화면 안 탭 순서. 처음 탭은 맨 앞(대기)
export const TABS: readonly { key: Tab; label: string }[] = [
  { key: 'pending', label: '대기' },
  { key: 'approved', label: '승인' },
  { key: 'rejected', label: '거절' },
]

// 빈 탭: 표 안 한 줄에 제목 + 안내
export const EMPTY: Record<Tab, { title: string; body: string }> = {
  pending: { title: '대기 중인 신청이 없어요', body: '새 가입 신청이 오면 여기에 보여요.' },
  approved: { title: '승인한 신청이 없어요', body: '승인한 계정이 여기에 모여요.' },
  rejected: { title: '거절한 신청이 없어요', body: '거절한 신청은 여기에서 되돌릴 수 있어요.' },
}

export function countByTab(rows: Application[]): Record<Tab, number> {
  const counts: Record<Tab, number> = { pending: 0, approved: 0, rejected: 0 }
  for (const r of rows) counts[r.status] += 1
  return counts
}

/** 그 탭 상태의 줄만. 순서는 받은 그대로(DB가 신청일 내림차순으로 준다) */
export function rowsOf(rows: Application[], tab: Tab): Application[] {
  return rows.filter((r) => r.status === tab)
}

/** 그 줄만 새 상태로 바꾼 새 목록. 받은 목록과 다른 줄은 건드리지 않는다 */
export function withStatus(rows: Application[], id: string, status: Tab): Application[] {
  return rows.map((r) => (r.id === id ? { ...r, status } : r))
}

const DONE: Record<Tab, string> = {
  approved: '신청을 승인했어요.',
  rejected: '신청을 거절했어요.',
  pending: '신청을 대기로 되돌렸어요.',
}

export function doneMessage(name: string, status: Tab): string {
  return `${name} ${DONE[status]}`
}

/** 신청일: DB 시각(UTC) → 한국 날짜 'YYYY-MM-DD' (dates.ts 한 곳) */
export function appliedOn(createdAt: string): string {
  return todayInKorea(new Date(createdAt))
}

/** 연락처: DB에는 숫자 9~11자리만 있다 → 목업처럼 끊어 보인다(02는 서울 번호). 비었으면 '—' */
export function phoneText(phone: string | null): string {
  if (!phone) return '—'
  if (!/^[0-9]{9,11}$/.test(phone)) return phone
  const head = phone.startsWith('02') ? 2 : 3
  return `${phone.slice(0, head)}-${phone.slice(head, -4)}-${phone.slice(-4)}`
}
