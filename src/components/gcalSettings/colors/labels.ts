import { josa } from '@/lib/calendar/josa'
import { countText } from '../frame/time'

// 설정 › 구글 캘린더 › 시행자·종류 화면 글 (spec google-link design.md 4절: notes-calendar `colors` '화면 글' 그대로, 바뀌는 낱말 뒤 조사는 josa — 2절 표 7).
// 색 이름(라벤더 … 토마토·캘린더 기본 색·시행자 색 따름)은 components/calendar/colors.ts, 같은 색 경고 다섯 글은 lib/calendar/gpaint colorWarnings가 만든다.
// 맨 아래 SAVE_TEXT 넷은 notes에 없는 글이라 옛 예약 설정 서랍(clinic-calendar CalendarScreen·CalendarSettings)의 글을 그대로 빌린다.
// 2차 고침(REQ-8552, design.md 21-9): KIND.lead2 · KIND_EX · REREAD는 notes-calendar '화면 글 › 2차 고침 › colors-reread' 그대로. 다시 알아보기 실패 글은 notes에 없어 SAVE_TEXT.failed·offline을 빌린다(같은 까닭)

export const BAND = {
  /** `{캘린더}{을/를} 골랐어요 · 아직 가져오지 않았어요` 의 낱말 뒤 글 */
  picked: (calendar: string) => `${josa(calendar, '을/를')} 골랐어요 · 아직 가져오지 않았어요`,
  back: '잇기로 돌아가기',
}

export const STAFF = {
  title: '시행자',
  hint: '구글 제목 끝 괄호 한 글자와 일정 색으로 알아봐요',
  lead: "병원 정보의 원장님·직원 가운데 '예약에 보이기'를 켠 사람이에요. 이름·표시를 여기서 고치면 병원 정보에도 같이 바뀌어요.",
  head: ['이름', '표시', '구글 색', '구글에서는'] as const,
  tail: (mark: string, color: string) => `제목 끝 (${mark}) · 색 ${color}`,
}

export const KIND = {
  title: '종류',
  hint: '위에 있을수록 예약 더하기에서 앞에 보여요',
  // '4000타'만 굵게 — 앞뒤 두 조각
  lead: ["구글 제목에서 이 글을 찾으면 그 종류로 봐요. 쉼표로 나눠 여러 개 적어요. 긴 글부터 맞춰 봐요(자보도수 → 도수). '타'는 ", '4000타', "처럼 숫자 뒤에 붙은 글만 봐요. 색이 '시행자 색 따름'이면 그 시행자 색으로 칠해요."] as const,
  /** 설명 둘째 줄(2차 고침, 처음 잇기·이은 뒤 모두) */
  lead2: '종류 이름에 길이(30분)·시행자 표시((원))·타수(3000)가 들어 있으면 제목과 가장 많이 맞는 종류를 골라요. 3천은 3000타로 봐요.',
  head: ['차례', '이름', '제목에서 알아볼 글', '기본 길이', '구글 색'] as const,
  remove: '지우기',
  add: '종류 더하기',
  gone: '지운 종류의 지난 예약은 그 이름 그대로 남아요',
  wordsHint: '예: 도수',
}

/** 종류 칸 보기 상자(2차 고침). 보기 줄 = `{제목}[ · 구글 일정 {n}분] → {종류}[ {noLen}]` */
export const KIND_EX = {
  label: '알아보기 보기',
  eventLen: (n: number) => `구글 일정 ${n}분`,
  noLen: '제목에 길이가 없으면 구글 일정 길이로 봐요',
}

export const MARKS = {
  title: '취소·변경 색',
  hint: "웹앱과 구글이 '취소'·'변경'을 서로 알아보는 색이에요",
  cancel: '취소한 예약',
  cancelSmall: '구글 일정을 지우지 않고 색만 바꿔요',
  cancelHelp:
    "웹앱에서 [예약 취소]하면 구글 일정 색을 이 색으로 바꾸고, [취소 되돌리기]하면 원래 색으로 돌려요. 구글에서 일정 색을 이 색으로 바꾸면 웹앱에서도 취소예요. 처음 가져올 때도 이 색 일정은 '취소'로 가져와요.",
  change: '변경한 예약',
  changeSmall: '날짜·시작 시간을 옮긴 예약',
  changeHelp:
    "지금 구글에서 흑연(짙은 회색)으로 쓰는 '예약 변경' 표시예요. 웹앱에서 날짜·시작을 옮겨 '변경'이 되면 구글 일정 색을 이 색으로 바꿔요. 구글에서 일정 색을 이 색으로 바꾸면 웹앱에 '변경' 표시가 붙어요. 처음 가져올 때도 이 색 일정은 '변경' 표시를 붙여 가져와요.",
  color: '색',
}

export const NO_TEXT = {
  title: '구글 제목에 글이 없을 때',
  noKind: '종류 글이 없는 예약',
  noKindEx: '예: 6230 정샘플',
  /** `{종류}{으로/로} 봐요` */
  noKindOption: (kind: string) => `${kind}${josa(kind, '로/으로')} 봐요`,
  noKindFix: '고쳐야 함으로 두기',
  noKindHelp: '먼저 일정 색이 한 종류의 고정 색이면 그 종류로 보고(예: 초록 → 충격파), 아니면 여기서 고른 종류로 봐요.',
  noStaff: '시행자 글이 없는 예약',
  noStaffEx: '예: 8456 윤모의 도수 30분',
  byColor: '일정 색이 한 사람의 시행자 색이면 그 사람으로 봐요',
  noStaffHelp: "색으로도 모르면 지난 1년 예약은 시행자 없이 가져오고, 앞으로의 예약은 '고쳐야 할 구글 예약'으로 남아요. 예: 분홍(플라밍고) 6230 정샘플 → (현) 이수현.",
  noStaffKinds: '시행자 글이 없는 종류',
  noStaffKindsEx: '예: 5521 최시안 (4000타)',
  noStaffKindsHelp:
    '구글 제목에 시행자 글을 안 적는 게 보통인 종류예요. 일정 색으로 시행자를 짐작하지 않아요(색이 종류 색이라서). 지난 1년 예약은 시행자 없이 가져오고, 앞으로의 예약(처음 가져오기·새로 들어온 것)은 하나씩 시행자를 골라요.',
  off: '하루 종일 휴무 줄',
  offSmall: "지금 구글 보라 'off' 줄",
  offWord: '끝 글',
  offColor: '색',
  offWordLabel: '휴무 줄 끝 글',
  offHelpSample: '김예시, 박지원 off',
  offHelp: ' → 그날 김예시·박지원 하루 종일 휴무. 이름은 원장님·직원 목록과 맞춰 봐요. 반차는 off 줄에 넣지 않아요.',
  other: '그 밖의 하루 종일 일정',
  otherText: '종일 메모로 가져와요(예: 원장님 학회). 웹앱에서 넣은 종일 메모는 캘린더 기본 색으로 적어요.',
}

export const TITLE = {
  title: '웹앱 → 구글 제목 꼴',
  hint: '웹앱에서 넣거나 고친 예약을 구글에 이렇게 적어요',
  tokens: ['차트번호', '이름', '종류', '길이 30분', '(시행자)', '메모'] as const,
  tokensLabel: '제목 차례',
  len: '길이를 넣어요 (30분)',
  memo: '메모를 제목 끝에 붙여요',
  memoHint: "끄면 구글 '설명' 칸에만 적어요",
  help: "차트번호가 없으면(신환) 이름부터 적어요. 메모는 늘 구글 '설명' 칸에도 적어요. 가져온 예약의 구글 제목은 웹앱에서 그 예약을 고칠 때만 이 꼴로 다시 적어요.",
  previewLabel: '구글 캘린더에서 보이는 모습',
  previewHead: '구글 캘린더에서는 이렇게 보여요 (미리 보기)',
  allDay: '종일',
  cancelNote: (color: string) => `↑ 취소한 예약 (${color})`,
  changeNote: (color: string) => `↑ 날짜·시간을 옮긴 예약 (${color})`,
}

export const FOOT = {
  text: '저장하면 웹앱 예약 칸 색이 바로 바뀌어요. 구글에서 따로 색을 고른 일정은 웹앱에서도 그 색 그대로예요. 나중에 색을 바꾸면 그 색이던 앞으로의 예약은 구글에서도 같이 바꿔요.',
  back: '← 잇기',
  next: '저장하고 가져오기 미리 보기 →',
  save: '저장',
}

/** 색 단추·색판 이름(화면에 보이지 않는 이름표) */
export const ARIA = {
  palette: '구글 색 고르기',
  staffColor: (label: string) => `${label} 구글 색`,
  kindColor: (name: string) => `${name.trim() || '종류'} 구글 색`,
  cancelColor: '취소 색',
  changeColor: '변경 색',
  offColor: '휴무 줄 색',
  staffName: '시행자 이름',
  staffMark: '표시 한 글자',
  kindName: '종류 이름',
  kindWords: '제목에서 알아볼 글',
  kindLen: '기본 길이',
  up: (n: number) => `${n}번째 종류 위로`,
  down: (n: number) => `${n}번째 종류 아래로`,
}

/** 맨 아래 '이미 들어온 예약' 칸(2차 고침, 이은 뒤 원장만) */
export const REREAD = {
  title: '이미 들어온 예약',
  owner: '원장 계정만 할 수 있어요',
  lead: '구글 제목을 지금 설정으로 다시 읽어 종류·시행자를 맞춰요. 구글 일정은 바꾸지 않아요.',
  hint: '저장한 설정으로 읽어요. 가져올 때 고르거나 [고치기]로 바꾼 종류·시행자는 그대로 둬요.',
  button: '이미 들어온 예약 다시 알아보기',
  busy: '다시 알아보는 중…',
  /** 수는 세 자리마다 쉼표 */
  done: (read: number, kinds: number, unread: number) =>
    `예약 ${countText(read)}개를 다시 알아봤어요 · 종류가 바뀐 것 ${countText(kinds)}개 · 못 알아본 것 ${countText(unread)}개`,
  at: (hm: string) => `(${hm})`,
  kept: '못 알아본 예약은 전 종류·시행자 그대로 두었어요.',
}

// notes에 없는 글 — 옛 예약 설정 서랍·예약 화면 글 그대로(명세에 적을 것)
export const SAVE_TEXT = {
  saved: '설정을 저장했어요. 다른 PC에도 몇 초 안에 보여요.',
  invalid: '설정을 저장하지 못했어요. 칸을 다시 확인해 주세요.',
  offline: '인터넷 연결이 끊겨 저장하지 못했어요. 연결을 확인하고 다시 눌러 주세요.',
  failed: '저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.',
}

/** 종류 칸 까닭(옛 예약 설정 서랍 CalendarSettings 글 그대로) */
export const KIND_PROBLEM = {
  'kinds-empty': '종류를 하나 이상 두어 주세요',
  'kind-id': '종류를 지우고 다시 더해 주세요',
  'kind-name': '종류 이름을 적어 주세요',
  'kind-dup': '같은 종류 이름이 있어요',
  'kind-len': '기본 길이를 골라 주세요',
  'kind-color': '종류 색을 골라 주세요',
} as const
