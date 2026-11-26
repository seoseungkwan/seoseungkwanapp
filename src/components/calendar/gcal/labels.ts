import { josa } from '@/lib/calendar/josa'

// 예약 탭 구글 캘린더 글(spec google-link REQ-8532·8533·8534·8535·8536, notes-calendar `week`·`detail`·`fix`·`err` 글자 그대로).
// 시험은 이 상수를 쓰지 않고 notes 글자를 따로 적어 견준다(design.md 4절). {…}는 함수 인자

// ── 띠 (week·err) ──
export const BAND_OPEN = '구글 캘린더 열기'
export const BAND_SYNC = '지금 맞추기'
/** `구글 캘린더 {이름}와 이어짐`: 앞 · 이름 · 뒤(조사는 이름 끝 받침에 맞춘다) */
export const BAND_LINKED_HEAD = '구글 캘린더'
export const bandLinkedTail = (name: string) => `${josa(name, '와/과')} 이어짐`
export const BAND_LAST = '마지막 맞춤'
export const bandEvery = (min: number) => `· ${min}분마다 맞춰요`
export const FIX_BUTTON = (n: number) => `고쳐야 할 구글 예약 ${n}개`

export const ERR_HEAD = '구글 캘린더에 닿지 못했어요'
export const errSince = (hm: string) => `${hm}부터`
export const ERR_SAVED = '웹앱에는 저장돼요'
export const errWaiting = (n: number) => `구글로 보낼 것 ${n}개`
export const errNext = (hm: string) => `1분 뒤(${hm}) 다시 해 볼게요`
export const ERR_NEXT_SOON = '1분 뒤 다시 해 볼게요'
export const ERR_FOLD = '접기'
export const ERR_MORE = '자세히'
export const ERR_RETRY = '다시 시도'
export const pendingHead = (n: number) => `구글로 아직 못 보낸 것 ${n}개`
export const PENDING_WAIT = '기다림'
export const pendingMoved = (hm: string, color: string) => `· 원래 ${hm} · 구글에서 ${color} 색으로`
export const pendingCancel = (color: string) => `· 구글에서 ${color} 색으로 바꿀 것`
export const PENDING_HINT =
  '다시 닿으면 넣은 차례대로 보내요. 그동안 구글에서 바뀐 것은 받아 오지 못해요 — 다시 닿으면 한꺼번에 받아 와요. 30분 넘게 이어지면 원장님께 알려 주세요.'
export const ERR_CODE = (code: string) => `번호 ${code}`
/** 못 보낸 일 글. new·move·cancel은 notes 글, edit·uncancel·color는 notes에 없어 이 TASK가 정함(보고) */
export const WAIT_WORD = { new: '새로 넣음', move: '시간 바꿈', cancel: '취소', edit: '고침', uncancel: '취소 되돌림', color: '색 바꿈' } as const

// ── 알림 ──
export const SAVED_OFFLINE = '웹앱에 저장했어요. 구글에는 다시 닿으면 보내요.'
export const PUT_DONE_TOAST = '예약표에 넣었어요. 구글 제목은 그대로 둬요.'
export const SKIP_DONE_TOAST = '가져오지 않아요. 구글에만 남아요.'
export const PAST_DONE_TOAST = '지난 예약 도착을 다 채웠어요.'
export const PUT_FAILED = '넣지 못했어요. 잠시 뒤 다시 눌러 주세요.'

// ── 안내 줄 ──
export const LEGEND_COLOR = '색 (구글과 같음)'
export const legendOff = (word: string) => `휴무 (${word})`
export const LEGEND_HALF = '반차 (웹앱에만)'
export const LEGEND_CANCEL = '취소'
export const LEGEND_CHANGE = '변경'
export const LEGEND_DEFAULT = '캘린더 기본 색'
export const legendFollow = (names: string) => `${names}${josa(names, '은/는')} 시행자 색 · 구글에서 온 예약은 그 일정 색 그대로`
export const LEGEND_GOOGLE = '구글'
export const LEGEND_WAIT = '아직 못 보냄'
export const LEGEND_FIX = '고쳐야 할 구글 예약'

// ── 자세히 (detail) ──
export const DETAIL_HEAD = '구글 캘린더'
export const FROM_GOOGLE = '구글에서 옴'
export const FROM_WEB = '웹앱에서 만듦 · 구글에 있음'
export const DT_TITLE_RAW = '구글 제목 원문'
export const DT_TITLE = '구글 제목'
export const DT_COLOR = '색'
export const DT_GOT = '알아본 것'
export const DT_IN = '들어온 때'
export const DT_SYNC = '맞춤'
export const COLOR_WHY = { google: '구글 일정 색 그대로', setting: '설정의 시행자·종류 색', cancel: '취소 색', change: '변경 색' } as const
export const MOVED_BY_GOOGLE = '구글에서 변경 색으로 바뀜'
export const MOVED_UNKNOWN = '처음 시간은 몰라요'
export const STAFF_HOW = { title: '제목 끝 괄호', picked: '가져올 때 고름' } as const
export const staffByColor = (color: string) => `구글 색 ${color}`
export const KIND_HOW = { setting: "설정 '종류 글이 없는 예약'", color: '구글 색', title: '제목 글', picked: '가져올 때 고름' } as const
export const gotStaff = (label: string) => `시행자 ${label}`
export const GOT_NO_STAFF = '시행자 없음'
export const gotKind = (name: string) => `종류 ${name}`
export const gotMemo = (memo: string) => `메모 '${memo}'`
export const GOT_MEMO_HOW = '괄호 안 글'
export const gotLen = (len: number) => `길이 ${len}분`
export const gotTime = (from: string, to: string) => `구글 시간 ${from}–${to}`
export const IN_HOW = { import: '처음 가져오기', pull: '구글에서 들어옴', web: '웹앱에서 넣음' } as const
export const syncSame = (hm: string | null) => (hm ? `마지막 맞춤 ${hm} · 구글과 같아요` : '구글과 같아요')
export const SYNC_WAIT = '구글에 아직 못 보냈어요 · 다시 닿으면 보내요'
export const editNote = (title: string) =>
  `[고치기]로 바꾸면 구글 제목이 ${title}${josa(title, '로/으로')} 다시 적혀요. 시행자·종류를 바꾸면 색도 설정 색으로 바꿔요. 그 전에는 원문·색 그대로 둬요.`
export const colorNote = (cancel: string, change: string) =>
  `[예약 취소]하면 구글 일정 색이 취소 색(${cancel})으로 바뀌고, 웹앱에는 흐린 칸으로 남아요. [취소 되돌리기]하면 원래 색으로 돌려요. 날짜·시작을 옮기면 구글 일정 색이 변경 색(${change})으로 바뀌어요. [지우기]는 둘 다에서 지워요.`
export const OPEN_EVENT = '구글 캘린더에서 이 일정 열기'
export const ARRIVAL_NOT_SENT = '도착은 구글에 보내지 않아요(설정 › 맞춤 방법).'

// ── 고쳐야 할 판 (fix) ──
export const fixTitle = (n: number) => `고쳐야 할 구글 예약 ${n}개`
export const FIX_LEAD = '구글 캘린더에 새로 들어온 일정 가운데 웹앱이 알아보지 못한 거예요. 고르고 [예약표에 넣기]를 누르면 웹앱 예약이 돼요. 구글 일정은 그대로 둬요.'
export const fixWhen = (day: string, from: string, to: string, min: number) => `${day} ${from}–${to} · ${min}분`
/** 하루 종일 일정의 때(notes에 없어 이 TASK가 정함, 보고) */
export const fixWhenAllDay = (day: string) => `${day} 하루 종일`
export const gotLead = (parts: string) => `알아본 것: ${parts}`
export const GOT_PART = {
  chart: (v: string) => `차트번호 ${v}`,
  name: (v: string) => `이름 ${v}`,
  kind: (v: string) => `종류 ${v}`,
  staff: (v: string) => `시행자 ${v}`,
  memo: (v: string) => `메모 ${v}`,
  byColor: (color: string) => `(${color} 색)`,
} as const
export const fixCameIn = (at: string) => `구글에서 ${at}에 들어옴`
export const FIX_NEED_LABEL = { staff: '시행자', kind: '종류', len: '길이', what: '넣을 곳', person: '사람' } as const
export const FIX_SKIP = '가져오지 않기'
export const FIX_PUT = '예약표에 넣기'
export const FIX_PUT_DONE = '✓ 넣었어요'
export const fixPutDone = (when: string) => `${when} 예약표에 넣었어요. 구글 제목은 그대로 둬요.`
export const FIX_SKIP_DONE = '가져오지 않음'
export const FIX_SKIP_DONE_TEXT = '구글에만 두고 웹앱은 건드리지 않아요.'
export const FIX_INFO_LEAVE = '고르지 않고 둬도 돼요. 예약표에 노란 빗금 칸으로 남고, 누가 구글에서 제목을 고치면 다시 알아봐요.'
export const FIX_INFO_WORDS = "같은 꼴이 자주 나오면 설정 › 구글 캘린더 › 시행자·종류에서 '제목에서 알아볼 글'을 더해 주세요(예: 충격파에 '체외충격')."
export const FIX_CLOSE = '닫기'
export const FIX_CANT = '이대로는 예약표에 넣을 수 없어요. 구글에서 제목을 고쳐 주세요.'

// ── 톱니 ──
/** 예약 탭 톱니·[설정] → 설정 › 구글 캘린더 › 시행자·종류(AC-8529.3) */
export const GCAL_COLORS_HREF = '/settings/google-calendar?tab=colors'
