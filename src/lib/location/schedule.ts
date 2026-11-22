import { addDays, compareYmd, diffDays, isYmd } from '@/lib/analytics/dates'

// 개원 일정표(design.md 11절 · AC-7913.2). 할 일 글·날수는 승인된 시안 TASKS 그대로, D = 목표 개원일.
// 차례는 조문에서 끌어낸 어림(업계 3~6개월)이다. `law`는 LAW_BASIS(sources.ts)의 id 글자.
// 다 함 표시는 `location_candidates.tasks_done`에 할 일 id 배열로 저장한다(id는 바꾸지 않는다).
// 오늘은 부르는 쪽이 한국 날짜(todayInKorea)로 넘긴다 — 시계를 읽지 않는다

export type OpenTask = {
  id: string
  /** 개원일 며칠 전(0 = 당일) */
  daysBefore: number
  text: string
  /** 메모 칸 글(없으면 빈 글자) */
  note: string
  law: string | null
}

export const OPEN_TASKS = [
  { id: 'contract', daysBefore: 150, text: '자리 정하고 계약하기', note: '특약: 의원 개설 신고가 안 되면 계약을 없던 일로', law: null },
  { id: 'loan', daysBefore: 140, text: '대출 상담·받기', note: '', law: null },
  { id: 'design', daysBefore: 130, text: '인테리어 설계 맡기기', note: '엑스레이실·물리치료실 자리부터', law: null },
  { id: 'equipment', daysBefore: 120, text: '장비 고르고 주문하기', note: '엑스레이는 들어오는 데 오래 걸려요', law: null },
  { id: 'construction', daysBefore: 90, text: '인테리어 공사 시작', note: '보통 8~10주', law: null },
  { id: 'power', daysBefore: 60, text: '전기 용량 늘리기 신청', note: '한국전력 · 건물 관리사무소', law: null },
  { id: 'hiring', daysBefore: 60, text: '직원 뽑기 공고', note: '물리치료사·간호조무사·접수', law: null },
  { id: 'promo', daysBefore: 30, text: '간판·홍보물·홈페이지', note: '홍보할 아파트 차례(후보 자세히)', law: null },
  { id: 'xray-prep', daysBefore: 30, text: '방사선 장비 설치 신고 준비', note: '', law: null },
  { id: 'open-report', daysBefore: 10, text: '의원 개설 신고(보건소)', note: '', law: 'open' }, // 의료법 33조
  { id: 'nhis-report', daysBefore: 7, text: '요양기관 신고(심평원)', note: '개설 신고 뒤', law: 'nhis' }, // 국민건강보험법 43조
  { id: 'xray-report', daysBefore: 5, text: '방사선 장비 검사 받고 신고', note: '', law: 'xray' }, // 쓰기 3일 전까지(방사선 안전관리 규칙 3·4조)
  { id: 'training', daysBefore: 3, text: '직원 교육·모의 진료', note: '', law: null },
  { id: 'open', daysBefore: 0, text: '개원', note: '', law: null },
] as const satisfies readonly OpenTask[]

export type OpenTaskId = (typeof OPEN_TASKS)[number]['id']

export type ScheduleRow = OpenTask & {
  id: OpenTaskId
  /** 할 일 날짜 = 개원일 − daysBefore */
  on: string
  /** 오늘보다 앞선 날(오늘은 지나지 않음) — 화면은 회색, 안 했으면 `날짜가 지났어요` */
  past: boolean
  done: boolean
}

const ORDER: readonly OpenTaskId[] = OPEN_TASKS.map((t) => t.id)
const KNOWN: ReadonlySet<string> = new Set(ORDER)

/** 개원일에서 거꾸로 센 할 일 열넷. 개원일이 날짜 모양이 아니면 빈 목록, 오늘이 날짜 모양이 아니면 지난 것 없음 */
export function buildSchedule(openOn: string, today: string, done: readonly string[]): ScheduleRow[] {
  if (!isYmd(openOn)) return []
  const todayOk = isYmd(today)
  const doneSet = new Set(done)
  return OPEN_TASKS.map((task) => {
    const on = addDays(openOn, -task.daysBefore)
    return { ...task, on, past: todayOk && compareYmd(on, today) < 0, done: doneSet.has(task.id) }
  })
}

/** 개원까지 남은 날(개원일 − 오늘). 날짜 모양이 아니면 null */
export function daysUntilOpen(openOn: string, today: string): number | null {
  return isYmd(openOn) && isYmd(today) ? diffDays(today, openOn) : null
}

/** 저장된 `tasks_done` → 아는 id만 할 일 차례로 한 번씩 */
export function checkTasksDone(raw: unknown): OpenTaskId[] {
  if (!Array.isArray(raw)) return []
  return ORDER.filter((id) => raw.includes(id))
}

/** 할 일 하나의 다 함 표시를 켜고 끈 새 배열(모르는 id는 그대로 두고, 받은 배열은 고치지 않는다) */
export function toggleTaskDone(done: readonly string[], id: string): OpenTaskId[] {
  const next = new Set(done)
  if (KNOWN.has(id)) {
    if (next.has(id)) next.delete(id)
    else next.add(id)
  }
  return ORDER.filter((x) => next.has(x))
}
