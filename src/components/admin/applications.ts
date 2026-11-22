import { todayInKorea } from '@/lib/analytics/dates'
import type { AdminMark, Application } from '@/lib/auth/admin'

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

// ── 관리자 표시 (spec multi-admin REQ-7703·REQ-7704). '내 줄'·'주 관리자 줄'은 화면이 따로 알지 않고 admin_hospitals()의
// is_me·is_owner(DB)로만 안다 — set_admin이 거부하는 기준과 같다(design.md 기본값 4)
export type AdminRole = 'mine' | 'owner' | 'admin' | 'none'

/** 그 병원 줄의 동작 칸 표시: 내 병원 'mine'(주 관리자 자신 포함), 그 밖의 주 관리자 병원 'owner', 다른 관리자 'admin', 아니면 'none' */
export function adminRoleOf(marks: readonly AdminMark[], hospitalId: string): AdminRole {
  const mark = marks.find((m) => m.hospitalId === hospitalId)
  if (mark === undefined) return 'none'
  if (mark.mine) return 'mine'
  return mark.owner ? 'owner' : 'admin'
}

/** 의원 이름 뒤 표 글자: 주 관리자 병원 '주 관리자', 다른 관리자 병원 '관리자'(내 줄 포함), 아니면 null */
export function adminBadgeOf(marks: readonly AdminMark[], hospitalId: string): '주 관리자' | '관리자' | null {
  const mark = marks.find((m) => m.hospitalId === hospitalId)
  if (mark === undefined) return null
  return mark.owner ? '주 관리자' : '관리자'
}

/** 정함: 없으면 { hospitalId, mine: false, owner: false }를 끝에 더함 / 뺌: 그 id를 뺌. 받은 목록은 그대로 두고 늘 새 목록 */
export function withAdmin(marks: readonly AdminMark[], hospitalId: string, admin: boolean): AdminMark[] {
  if (!admin) return marks.filter((m) => m.hospitalId !== hospitalId)
  if (marks.some((m) => m.hospitalId === hospitalId)) return [...marks]
  return [...marks, { hospitalId, mine: false, owner: false }]
}

/** 끝 알림: '{의원 이름} 계정을 관리자로 정했어요.' / '{의원 이름} 계정을 관리자에서 뺐어요.' */
export function adminDoneMessage(name: string, admin: boolean): string {
  return admin ? `${name} 계정을 관리자로 정했어요.` : `${name} 계정을 관리자에서 뺐어요.`
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
