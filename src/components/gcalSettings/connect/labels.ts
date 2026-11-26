// 설정 › 구글 캘린더 › 잇기의 화면 글 (spec google-link AC-8528.2~AC-8528.5, notes-calendar `connect` 글자 그대로 + design.md 2절 표 1 서비스 켜기 줄).
// 바뀌는 값({ })은 함수로 받는다. 조사는 lib/calendar/josa(2절 표 7). 시험은 이 상수가 아니라 notes 글자를 따로 적어 견준다(design.md 4절)

/** 따라 하기 한 줄 조각: 글 · 굵게(b) · 고정폭(code) · 글쇠 모양(kbd, notes의 [ ]) */
export type HowtoPiece = string | { b: string } | { code: string } | { kbd: string }

export const CONNECT_TEXT = {
  title: '구글 캘린더 잇기',
  notYet: '아직 이어지지 않았어요',
  // 시안처럼 '2분마다'·'지난 1년과 앞으로'를 굵게
  lead: [
    '병원 구글 계정의 캘린더와 예약 탭을 양쪽으로 이어요. 웹앱에서 넣거나 고친 예약은 바로 구글에 적히고, 구글에서 넣거나 고친 예약은 웹앱이 열려 있는 동안 ',
    { b: '2분마다' },
    ' 받아 와요. 처음 이을 때 ',
    { b: '지난 1년과 앞으로' },
    '의 예약을 가져와요.',
  ] as const,
  privacy: '환자 이름과 차트번호가 병원 구글 캘린더 제목에도 그대로 적혀요. 병원 구글 계정의 비밀번호를 아는 사람만 볼 수 있으니 계정을 잘 지켜 주세요.',
  step1: '1. 병원 구글 계정에 구글 코드 붙이기',
  howto: [
    [{ b: '병원 구글 계정' }, '으로 로그인한 크롬에서 구글 코드 편집기(', { code: 'script.google.com' }, ')를 열어요.'],
    [{ kbd: '새 프로젝트' }, '를 누르고, 안에 있는 글을 모두 지운 뒤 아래 [구글 코드 복사]로 복사한 코드를 붙여 넣고 저장해요.'],
    // design.md 2절 표 1: 예약 구글 코드가 캘린더 고급 서비스를 쓴다(ADR-054)
    ['왼쪽 ', { kbd: '서비스' }, ' 옆 ', { kbd: '+' }, "를 눌러 'Google Calendar API'를 고르고 ", { kbd: '추가' }, '를 눌러요.'],
    [
      '오른쪽 위 ',
      { kbd: '배포' },
      ' → ',
      { kbd: '새 배포' },
      ' → 유형 ',
      { kbd: '웹 앱' },
      ', 실행 ',
      { kbd: '나' },
      ', 액세스 권한 ',
      { kbd: '모든 사용자' },
      '를 고르고 ',
      { kbd: '배포' },
      '를 눌러요. 구글이 권한을 물으면 병원 계정을 고르고 ',
      { kbd: '허용' },
      '을 눌러요.',
    ],
    ["나온 '웹 앱 주소'를 복사해 아래 2번 칸에 붙여 넣어요."],
  ] as readonly (readonly HowtoPiece[])[],
  copy: '구글 코드 복사',
  copiedAt: (at: string) => `${at}에 복사했어요`,
  copiedSub: '· 비밀 글자를 새로 만들어 코드 맨 위에 넣었어요',
  copiedNotice: '구글 코드를 복사했어요. 비밀 글자를 새로 만들어 코드 맨 위에 넣었어요.',
  step2: '2. 주소와 비밀 글자 넣기',
  urlLabel: '코드 주소',
  urlHint: "구글이 준 '웹 앱 주소'",
  secretLabel: '비밀 글자',
  secretHint: '코드 맨 위 줄',
  show: '보기',
  hide: '숨기기',
  test: '연결 시험',
  secretHelp: '비밀 글자는 이 의원 계정에만 저장되고, 저장한 뒤에는 화면에 다시 보이지 않아요. 바꾸려면 코드를 다시 복사해 붙여요.',
  testedMain: (count: string) => `연결됐어요 · 병원 구글 계정에서 캘린더 ${count}개를 찾았어요`,
  testedAt: (hm: string) => `(${hm})`,
  step3: '3. 이을 캘린더 고르기',
  pickLabel: '이을 캘린더',
  calendarSub: (past: string, future: string) => `지난 1년 ${past}개 · 앞으로 ${future}개 · 고칠 수 있음`,
  readOnlyCalendar: '보기만 할 수 있어 고를 수 없어요',
  pickHelp: '웹앱은 고른 캘린더 하나에만 적고 그 캘린더만 받아 와요. 처음 가져오기도 이 캘린더에서만 해요.',
  bottom: '아직 아무것도 가져오거나 바꾸지 않았어요. 다음 화면에서 시행자·종류 색을 맞춘 뒤, 가져오기 전에 한 번 더 보여 드려요.',
} as const
