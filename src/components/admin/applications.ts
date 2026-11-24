import { REGION_UNKNOWN, regionOf, roParticle, SIDO_LIST, type Sido } from '@/lib/admin/region'
import { todayInKorea, weekdayOf } from '@/lib/analytics/dates'
import type { AdminMark, Application } from '@/lib/auth/admin'
import type { ViewHospital, ViewLogRow } from '@/lib/auth/adminView'

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

// ── 다른 의원 보기·지역 칸·본 기록 (spec admin-view REQ-8012, design.md '관리자 화면', 시안 docs/mockups/admin-view ?s=admin-list)

/** 승인 줄 의원 이름 단추의 마우스 글 */
export function viewTitle(name: string): string {
  return `${name} 화면 보기 (읽기만)`
}

/** 내 줄: 보기 목록(admin_view_hospitals is_me)이나 관리자 표시(admin_hospitals is_me) 어느 한쪽이 내 줄이라 하면. 둘 다 없으면 아님 */
export function isMine(views: readonly ViewHospital[], marks: readonly AdminMark[], hospitalId: string): boolean {
  return views.some((v) => v.hospitalId === hospitalId && v.mine) || marks.some((m) => m.hospitalId === hospitalId && m.mine)
}

/** 지역 고르기: 17개(시안 차례) + 맨 끝 '지역 모름'(값 null) */
export const REGION_CHOICES: readonly { value: Sido | null; label: string }[] = [
  ...SIDO_LIST.map((sido) => ({ value: sido, label: sido })),
  { value: null, label: REGION_UNKNOWN },
]

/** 그 줄의 지역: 관리자가 정한 값 → 주소에서 읽은 시·도 → null(지역 모름). 목록에 없는 줄도 null */
export function regionOfRow(views: readonly ViewHospital[], hospitalId: string): Sido | null {
  const v = views.find((x) => x.hospitalId === hospitalId)
  if (v === undefined) return null
  return regionOf(v.address, v.regionSet ? v.region : undefined)
}

/** 지역을 고친 뒤 손에 든 목록: 그 줄만 정한 값으로 바꾼 새 목록(다른 줄은 그대로). 목록에 없던 줄(막 승인한 줄)은 끝에 더한다 */
export function withRegion(views: readonly ViewHospital[], hospitalId: string, sido: Sido | null): ViewHospital[] {
  if (!views.some((v) => v.hospitalId === hospitalId)) {
    return [...views, { hospitalId, name: '', address: null, regionSet: true, region: sido, mine: false }]
  }
  return views.map((v) => (v.hospitalId === hospitalId ? { ...v, regionSet: true, region: sido } : v))
}

/** 완료 줄: '{의원 이름} 지역을 {지역}로/으로 바꿨어요.'(받침 규칙은 roParticle) */
export function regionDoneMessage(name: string, sido: Sido | null): string {
  return `${name} 지역을 ${sido ?? REGION_UNKNOWN}${roParticle(sido)} 바꿨어요.`
}

const WEEKDAY = ['월', '화', '수', '목', '금', '토', '일'] // weekdayOf: 1=월 … 7=일
const KOREA_TIME = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

/** 본 때: DB 시각(UTC) → 한국 시각 'M월 D일 (요일) HH:mm'. 읽을 수 없으면 '—' (날짜는 dates.ts 한 곳) */
export function viewedAt(iso: string): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return '—'
  const ymd = todayInKorea(at)
  const [, month, day] = ymd.split('-').map(Number)
  const parts = Object.fromEntries(KOREA_TIME.formatToParts(at).map((p) => [p.type, p.value]))
  return `${month}월 ${day}일 (${WEEKDAY[weekdayOf(ymd) - 1]}) ${parts.hour}:${parts.minute}`
}

/** 본 기록: 새 것이 위. 같은 때는 받은 차례, 받은 목록은 그대로 */
export function newestFirst(rows: readonly ViewLogRow[]): ViewLogRow[] {
  const time = (r: ViewLogRow) => {
    const t = new Date(r.startedAt).getTime()
    return Number.isNaN(t) ? -Infinity : t
  }
  return [...rows].sort((a, b) => time(b) - time(a))
}
