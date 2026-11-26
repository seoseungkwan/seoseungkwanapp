import type { ApptAuto, BitGhost, CalAppt } from '@/lib/calendar/shapes'

// 예약 Worker 메시지 약속 (spec clinic-calendar design.md 'Worker 메시지', REQ-5904) [환자 자료 구역].
// 화면 훅(useCalendarWorker)은 이 타입으로 주고받는다. 통로 포트는 기존 connectScreenBridge가 {type: 'bridge-port'}로 넘긴다.
//
// 차례(화면): bridge.stream('contact.targets', {kind: 'calfind', from: 오늘, to: 오늘, q}) 또는
// bridge.stream('contact.targets', {kind: 'calday', from, to})를 열고, 끝나면(또는 거절되면) 그 결과를 find·days에 실어 보낸다.
// 조각은 통로 포트로 Worker에 바로 가고, 화면이 쥐는 것은 {id}·오류 번호뿐이다.
// 비트 접수 차트번호 목록(came)·생일은 Worker 밖으로 나가지 않는다(AC-5904.3)

/** 화면이 연 스트림 하나의 결과: 끝났으면 {id}(StreamResult.id), 거절됐으면 {code}(BridgeError.code) */
export type CalendarStreamRef = { id: string } | { code: string }

/** days에 싣는 예약 한 줄(도착 셈·비트 예약 칸 가리기에 쓰는 칸만). auto = 지금 서버 값 */
export type CalendarDayAppt = Pick<CalAppt, 'id' | 'day' | 'start' | 'len' | 'chart' | 'status' | 'auto'>

/**
 * 화면 → Worker. 같은 일(op)의 새 메시지가 오면 앞 메시지의 늦은 답은 버린다(find·days·past는 서로 버리지 않는다).
 * past = 지난 예약 도착 채우기(spec google-link AC-8536.1): days와 같은 calday 답·같은 도착 규칙, 비트 예약 칸은 없다
 */
export type CalendarScreenMessage =
  | { type: 'find'; targets: CalendarStreamRef } // contact.targets {kind: 'calfind', q}
  | { type: 'days'; targets: CalendarStreamRef; now: number; appts: CalendarDayAppt[] } // contact.targets {kind: 'calday', from, to}, now = Date.now()
  | { type: 'past'; targets: CalendarStreamRef; now: number; appts: CalendarDayAppt[] } // contact.targets {kind: 'calday', 지난 한 주}

export type CalendarOp = 'find' | 'days' | 'past'

/** 비트 찾기 한 명. 나이는 답의 오늘 기준 만 나이(생일 글자는 싣지 않는다), last = 마지막 내원 YYYY-MM-DD */
export type BitPerson = { chart: string; name: string; sex: '남' | '여' | ''; age: number | null; last: string | null }

/**
 * Worker → 화면.
 * found = 찾은 사람(20명까지, more = 더 있음).
 * days = 답의 기간(from~to)과, 상태 auto·오늘 이하·그 기간 안 예약 중 도착 자동 값이 서버 값과 다른 것만 [id, 새 값],
 * 그리고 같은 날 같은 차트번호의 취소 아닌 예약이 없는 비트 예약 칸(visibleGhosts).
 * past = 답의 기간과 도착 자동 값이 서버 값과 다른 것만 [id, 새 값](days와 같은 규칙, 비트 예약 칸 없음).
 * error는 오류 번호만 싣는다(반쪽 결과 없음)
 */
export type CalendarWorkerMessage =
  | { type: 'found'; rows: BitPerson[]; more: boolean }
  | { type: 'days'; from: string; to: string; auto: [string, ApptAuto][]; ghosts: BitGhost[] }
  | { type: 'past'; from: string; to: string; auto: [string, ApptAuto][] }
  | { type: 'error'; op: CalendarOp; code: string }
