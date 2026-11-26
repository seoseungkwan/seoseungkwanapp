import type { GEvent, GStaff, OffPerson, ParseCtx } from '@/lib/calendar/gshapes'
import { DEFAULT_CAL_SETTINGS } from '@/types/calendar'
import { DEFAULT_GCAL_LOOK } from '@/types/gcal'

// 처음 가져오기 미리 보기 시험 자료(spec google-link REQ-8530, 시안 calendar.html ?s=import 설정). 시험만 부르고 화면은 부르지 않는다.
// 환자 이름·차트번호는 모두 지어낸 값이다. 잇는 날 2026-11-23 (월) 08:52.
// 시행자 (호) 정호연 라벤더 · (원) 박지원 바나나 · (현) 이수현 플라밍고 · (장) 원장님 블루베리, 충격파 세이지 고정·시행자 글이 없는 종류 = 충격파,
// 데스크 김예시·정예시는 예약에 안 보이는 직원('m-' id)

export const TODAY = '2026-11-23'
/** 구글 지금 시각(읽은 때) = 한국 11/23 (월) 08:52 */
export const NOW_ISO = '2026-11-22T23:52:00.000Z'
export const CAL_NAME = '2026 양지바른정형외과'

export const M_KIM = 'm-0000000000000000000000000000000a'
export const M_JUNG = 'm-0000000000000000000000000000000b'

export const STAFF: GStaff[] = [
  { id: 'ho', name: '정호연', mark: '호', color: 'lavender' },
  { id: 'won', name: '박지원', mark: '원', color: 'banana' },
  { id: 'hyun', name: '이수현', mark: '현', color: 'flamingo' },
  { id: 'jang', name: '원장님', mark: '장', color: 'blueberry' },
]
export const KINDS = DEFAULT_CAL_SETTINGS.kinds.map((k) => ({ ...k, words: [...k.words] }))
export const PEOPLE: OffPerson[] = [
  { id: 'jang', name: '원장님' },
  { id: 'ho', name: '정호연' },
  { id: 'won', name: '박지원' },
  { id: 'hyun', name: '이수현' },
  { id: M_KIM, name: '김예시' },
  { id: M_JUNG, name: '정예시' },
]
export const LOOK = { ...DEFAULT_GCAL_LOOK, noStaffKinds: ['shock'] }
export const CTX: ParseCtx = { staff: STAFF, kinds: KINDS, look: LOOK, people: PEOPLE, arrival: 'off', linkedOn: TODAY }

const UPDATED = '2026-11-20T01:00:00.000Z'

/** 시간 일정 하나(한국 시각 'YYYY-MM-DDTHH:mm') */
export function timed(id: string, start: string, end: string, summary: string, colorId: string | null = null): GEvent {
  return { id, status: 'confirmed', summary, description: '', allDay: false, start, end, colorId, updated: UPDATED, recurring: false }
}

/** 하루 종일 일정 하나(end = 끝 다음 날) */
export function allDay(id: string, start: string, end: string, summary: string, colorId: string | null = null): GEvent {
  return { id, status: 'confirmed', summary, description: '', allDay: true, start, end, colorId, updated: UPDATED, recurring: false }
}

// 색 id: 1 라벤더 · 2 세이지 · 3 포도 · 4 플라밍고 · 8 흑연 · 11 토마토
export const EVENTS: GEvent[] = [
  // 앞으로 13개(예약 9 · 하루 종일 4)
  timed('evfut01', '2026-11-23T09:00', '2026-11-23T09:30', '1234 홍길동 도수 30분 (호)', '1'),
  timed('evfut02', '2026-11-23T09:15', '2026-11-23T09:30', '5521 최시안 (4000타)', '2'), // 시행자 글 없는 충격파
  timed('evfut03', '2026-11-23T09:30', '2026-11-23T10:00', '6230 정샘플', '4'), // 종류 = 설정 · 시행자 = 구글 색
  timed('evfut04', '2026-11-23T11:00', '2026-11-23T11:30', '8456 윤모의 도수 30분'), // 시행자 글 없고 기본 색
  timed('evfut05', '2026-11-23T13:00', '2026-11-23T14:00', '직원 회의'), // 예약 같지 않음
  timed('evfut06', '2026-11-23T14:30', '2026-11-23T15:00', '2214 서보기 도수 30분 (민)', '1'), // 모르는 표시
  timed('evfut07', '2026-11-23T15:30', '2026-11-23T16:00', '4471 배가상 체외 30분 (현)', '4'), // 모르는 종류 글
  timed('evfut08', '2026-11-24T09:00', '2026-11-24T21:00', '8820 안모의 도수 (호)', '1'), // 4시간 넘음
  allDay('evfut09', '2026-11-24', '2026-11-25', '김예시, 박지원 off', '3'),
  allDay('evfut10', '2026-11-25', '2026-11-26', '원장님 학회'),
  allDay('evfut11', '2026-11-25', '2026-11-26', '최호 off', '3'), // 목록에 없는 이름
  allDay('evfut12', '2026-11-30', '2026-12-03', '정호연 off', '3'), // 여러 날
  timed('evfut13', '2026-11-27T09:00', '2026-11-27T21:00', '6402 윤모의 충격파', '2'), // 4시간 넘음 + 시행자 글 없음(고를 거리 둘)
  // 지난 1년 6개(예약 6)
  timed('evpast01', '2026-11-20T09:30', '2026-11-20T10:00', '6639 최가짜 도수 30분 (호)', '8'), // 변경 색
  timed('evpast02', '2026-11-21T09:00', '2026-11-21T09:30', '9962 서모의 도수30분(호)', '11'), // 취소 색
  timed('evpast03', '2026-11-21T10:00', '2026-11-21T10:15', '2184 배샘플 (4000타)', '2'), // 시행자 없이
  timed('evpast04', '2026-11-20T10:30', '2026-11-20T11:00', '7740 한시안 도수 30분 (윤)'), // 모르는 표시 → 메모
  timed('evpast05', '2025-12-01T10:00', '2025-12-01T10:30', '0871 김가상 도수 30분 (호)', '1'), // 지난해
  timed('evpast06', '2026-01-02T10:15', '2026-01-02T10:30', '1532 이샘플 (3000타)', '2'), // 시행자 없이
]
