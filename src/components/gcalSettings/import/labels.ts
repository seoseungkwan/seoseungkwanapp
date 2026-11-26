// 설정 › 구글 캘린더 › 처음 가져오기 미리 보기 화면 글 (spec google-link REQ-8530, design.md 4절: notes-calendar `import` '화면 글' 그대로).
// { } 자리(숫자·캘린더·시각·종류·색 이름·지난 1년 첫날)만 함수 인자로 받는다. 숫자는 부르는 쪽이 '4,188' 꼴로 준다.
// '… 아래로 {n}개 더 있어요'는 시안 전용 글이라 두지 않는다(design.md 2절 표 14). 고쳐야 할 까닭 글·고르기 글은 lib/calendar/gtitle(fixReasonText·fixChoices).
// notes에 없는 글 넷은 따로 적었다: 읽는 동안 '불러오는 중'(앱의 다른 표와 같은 글)·읽지 못했을 때 [다시 시도](notes `err`의 단추 글)·
// 고르기 칸의 빈 값 '고르기'와 고쳐야 할 것이 없을 때의 아래 띠 '고쳐야 할 것이 없어요.'(둘 다 승인 시안 calendar.html의 글)

/** 굵게(b) 조각이 섞인 한 줄 */
export type Piece = string | { b: string }

export const HEAD = {
  title: '처음 가져오기 미리 보기',
  /** `{캘린더} · {11/23 (월) 08:52}에 읽음` */
  readAt: (calendar: string, at: string) => `${calendar ? `${calendar} · ` : ''}${at}에 읽음`,
  /** `지난 1년(2025-11-23부터 어제까지)` — 지난 1년 첫날만 바뀐다 */
  lead: (from: string): Piece[] => [
    '고른 캘린더에 있는 ',
    { b: '지난 1년' },
    `(${from}부터 어제까지)과 `,
    { b: '앞으로' },
    '(오늘 0시부터)의 구글 일정을 웹앱 칸으로 알아봤어요. 웹앱은 1년 지난 예약을 저절로 지우니 그보다 오래된 일정은 가져오지 않아요. ',
    { b: '[가져오기]를 누르기 전에는 웹앱도 구글도 바뀌지 않아요.' },
    ' 가져와도 구글 일정의 제목·색은 그대로 둬요.',
  ],
  loading: '불러오는 중',
  retry: '다시 시도',
}

export const CARDS = {
  past: { k: '지난 1년', s2: '한 번만 옮겨 와요 · 도착은 비트 PC가 채움' },
  future: { k: '앞으로', s2: '가져온 뒤 양쪽으로 맞춰요' },
  /** `{n}개` */
  n: (n: string) => `${n}개`,
  /** `예약 {4,050} · 하루 종일 {138}` */
  split: (appts: string, allDay: string) => `예약 ${appts} · 하루 종일 ${allDay}`,
  known: { k: '알아봄', s1: '그대로 가져와요', s2: (n: string) => `구글 색·설정으로 알아본 ${n}개 포함` },
  fix: { k: '고쳐야 함', s1: '노란 칸에서 골라요', s2: '안 골라도 가져오기는 돼요' },
  skip: { k: '가져오지 않음', s1: '구글에만 남아요' },
}

export const BAND = {
  /**
   * `시행자 글이 없는 예약 · 지난 1년 {114}개(충격파 {108}개 등)는 시행자 없이 가져와요 — 고쳐야 할 것에 넣지 않아요. 앞으로의 예약 {5}개(충격파)는 …`.
   * 괄호 안 종류가 없으면(그런 예약이 없음) 괄호를 그리지 않는다
   */
  line: (past: string, top: { name: string; n: string } | null, future: string, futureKinds: string): Piece[] => [
    { b: '시행자 글이 없는 예약' },
    ' · 지난 1년 ',
    { b: `${past}개` },
    `${top ? `(${top.name} ${top.n}개 등)` : ''}는 `,
    { b: '시행자 없이' },
    ' 가져와요 — 고쳐야 할 것에 넣지 않아요. 앞으로의 예약 ',
    { b: `${future}개` },
    `${futureKinds ? `(${futureKinds})` : ''}는 아래 표에서 하나씩 시행자를 골라요.`,
  ],
  /** `'시행자 글이 없는 종류'는 ② 시행자·종류에서 정해요(지금: {충격파}).` */
  kinds: (names: string) => `'시행자 글이 없는 종류'는 ② 시행자·종류에서 정해요(지금: ${names}).`,
  /** 정한 종류가 없을 때(시안 calendar.html grpBox) */
  none: '없음',
  onlyFix: '고쳐야 할 것만 보기',
}

export type ImportFilter = 'future' | 'past' | 'fix' | 'allDay'
export const FILTERS: readonly ImportFilter[] = ['future', 'past', 'fix', 'allDay']

export const FILTER = {
  label: '거르기',
  /** `앞으로 {195}` … */
  name: { future: '앞으로', past: '지난 1년', fix: '고쳐야 할 것', allDay: '하루 종일' } satisfies Record<ImportFilter, string>,
  legend: '어디서 알아봤나',
  byTitle: '표시 없음 = 제목 글',
  byColor: ' 일정 색',
  bySetting: ' 종류 글이 없는 예약',
  byPick: ' 여기서 고름',
}

export const PAST_NOTE = (n: string): Piece[] => [
  { b: '지난 예약은 처음 한 번만 옮겨 와요.' },
  ' 그 뒤로는 구글과 맞추지 않아요(웹앱에서 고쳐도 구글로 보내지 않고, 구글에서 고쳐도 받아 오지 않아요). ',
  { b: '도착(왔음·안 옴)은 가져온 뒤 비트 PC가 그날 비트 접수를 보고 저절로 채워요' },
  ' — 최근 날부터 조금씩 채우고, 다 채우면 예약 탭에 알려요. 차트번호가 없는 예약(신환)은 비트 접수와 맞출 수 없어 도착을 비워 둬요. ',
  { b: `시행자 글이 없는 지난 예약 ${n}개는 시행자 없이 가져와요` },
  '(고쳐야 할 것에 넣지 않아요).',
]

/** 표 줄(rows/)이 쓰는 글 */
export const TABLE = {
  label: '처음 가져오기 미리 보기 표',
  head: ['상태', '구글 일정 (색 · 제목 원문)', '', '날짜', '시작', '길이', '차트번호', '이름', '종류', '시행자', '메모'] as const,
  /** `{11월 23일 (월)} · 오늘 (잇는 날)` */
  today: ' · 오늘 (잇는 날)',
  pastDay: '지난 예약 · 한 번만 옮겨 와요',
  state: { known: '✓ 알아봄', fix: '! 고쳐야 함', picked: '✓ 고름', skip: '가져오지 않음' },
  /** `{토마토} = 취소` · `{흑연} = 변경` */
  cancelTag: (color: string) => `${color} = 취소`,
  changeTag: (color: string) => `${color} = 변경`,
  noStaffTag: '지난 예약 · 시행자 없이',
  none: '없음',
  tagColor: '구글 색',
  tagSetting: '설정',
  tagPick: '고름',
  allDay: '하루 종일',
  off: '휴무',
  memo: '종일 메모',
  staffOnly: '(직원)',
  manyDays: '· 날마다 따로 넣어요',
  skipNote: '구글에만 두고 웹앱은 건드리지 않아요',
  choose: '고르기',
  /** 길이 칸: 분 */
  min: (n: number) => `${n}분`,
}

/** `길이는 … 취소 색({토마토}) 일정은 '취소'로, 변경 색({흑연}) 일정은 '변경' 표시를 붙여 가져와요.` */
export const TABLE_HINT = (cancel: string, change: string) =>
  `길이는 구글 일정의 시작·끝 시각으로 정해요(제목의 '50분' 같은 글은 보지 않아요). 시작은 5분 단위로 받아요(09:15처럼). 여러 날 하루 종일 일정은 날마다 따로 넣어요. 괄호 안 글은 메모로 넣어요. 취소 색(${cancel}) 일정은 '취소'로, 변경 색(${change}) 일정은 '변경' 표시를 붙여 가져와요.`

export const BAR = {
  /** 아래 띠. fix = '0'이면 시안 글 '고쳐야 할 것이 없어요.' */
  text: (known: string, fix: string | null, skip: string | null): Piece[] => [
    { b: '가져오면' },
    ` 알아본 ${known}개(지난 1년 + 앞으로)를 웹앱에 넣어요. 지난 1년은 한 번만 옮기고, 앞으로의 예약은 그때부터 2분마다 양쪽으로 맞춰요. 지난 예약의 도착은 비트 PC가 그날 비트 접수를 보고 최근 날부터 채워요. `,
    ...(fix === null ? ['고쳐야 할 것이 없어요.'] : ['고쳐야 할 ', { b: `${fix}개` }, "는 가져오지 않고 예약 탭 '고쳐야 할 구글 예약'에 남겨요(나중에 골라도 돼요)."]),
    ...(skip === null ? [] : [` 가져오지 않기로 한 ${skip}개는 구글에만 둬요.`]),
  ],
  back: '← 시행자·종류 고치기',
  run: '가져오기',
}

/** 가져온 뒤 알림. 고쳐야 할 것이 없으면 ' · 고쳐야 할 …' 조각을 붙이지 않는다(시안 calendar.html doimport) */
export const DONE = (known: string, fix: string | null) =>
  `가져왔어요. ${known}개를 넣었어요${fix === null ? '' : ` · 고쳐야 할 ${fix}개는 예약 탭에 남겼어요`}. 이제 2분마다 맞추고, 지난 예약 도착은 비트 PC가 채워요.`
