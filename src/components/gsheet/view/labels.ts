// 수납일지 탭 [구글 시트] 보기 화면 글 한 곳(spec google-link TASK-15, design.md 4절).
// 글은 승인 시안 docs/mockups/google-link/notes-sunap.md '화면 글'(공통·none·filling·done·done-warn·newmonth·pastmonth·nobit·err-google·err-frame·overwrite) 그대로다.
// 시안과 다른 곳은 design.md 2절 표 2(옛 도우미·옛 확장 두 줄 + [비트 PC 연결])·표 8(20초 load 없으면 err-frame)뿐이다.
// 결과 줄 글은 lib/gsheet/result(resultLines), 수납 오류 까닭 글은 lib/errors(E-GSHEET-*)가 준다.
// 시안의 [새 창으로 열기 ↗]·[11월 파일 열기 ↗]의 ↗는 그림(icons.tsx)이라 글에 넣지 않는다

const monthText = (ym: string) => `${Number(ym.slice(0, 4))}년 ${Number(ym.slice(5, 7))}월`

export const VIEW = {
  // ── 틀 ──
  frameTitle: '구글 시트',
  under: '시트가 비어 보이거나 구글 로그인 화면이 나오면 [새 창으로 열기]로 열어 주세요. 여기서 고친 칸은 구글 시트에 바로 저장돼요.',
  /** 이번 달(보는 달) 파일 id를 아직 모를 때 틀 자리(시안에 없는 경우 — 달 고르기의 '파일 없음' 낱말) */
  noFile: (ym: string) => `${monthText(ym)} 파일 없음`,

  // ── 띠: 파일 이름·달 고르기 ──
  month: monthText,
  pickerLabel: (ym: string) => `달 고르기 — 지금 ${monthText(ym)}`,
  pickerTitle: '다른 달 파일 열기',
  thisMonth: (ym: string) => `${monthText(ym)} · 이번 달`,
  fileMissing: '파일 없음',
  daySheet: (day: number) => `· ${day}일 시트`,

  // ── 띠: 넣는 PC 상태 ──
  autoOn: '저절로 넣기 켜짐',
  autoOnCheck: '저절로 넣기 켜짐 · 확인 필요',
  autoOff: '저절로 넣기 꺼짐',
  autoOffHint: '설정 › 저절로 넣기에서 켤 수 있어요',
  autoEvery: (min: number) => `웹앱이 열려 있는 동안 ${min}분마다`,
  autoLast: (hm: string, rows: number) => ` · 마지막 ${hm} (${rows}줄)`,
  autoNotYet: ' · 오늘 아직 넣지 않음',
  filling: '넣는 중…',
  fillingWhat: (day: number, mode: string) => `${day}일 시트 · ${mode} · 비트에서 읽어 구글 시트에 넣고 있어요`,
  modeFillEmpty: '빈 칸만 채우기',
  modeOverwrite: '덮어쓰기',
  busy: '다른 넣기가 아직 돌고 있어요. 조금 뒤 다시 해 보세요.',

  // ── 띠: 단추 ──
  fillNow: '지금 넣기',
  overwriteOpen: '덮어쓰기…',
  openNew: '새 창으로 열기',
  settings: '설정',
  retry: '다시 해 보기',

  // ── nobit ──
  viewOnly: '보기만',
  viewOnlyHead: '이 PC에서는 넣기를 못 해요.',
  viewOnlyText: ' 비트 PC에서 웹앱이 열려 있으면 저절로 넣어요.',
  viewOnlyLast: (hm: string, rows: number) => ` · 비트 PC 마지막 넣기 ${hm} (${rows}줄)`,
  // design.md 2절 표 2 — 확장 줄은 E-GSHEET-EXT 까닭 글(lib/errors)
  oldHelper: '이 PC의 도우미가 옛 판이라 넣지 못해요. 비트 PC 연결 화면에서 새 도우미를 받아 설치해 주세요.',
  setupLink: '비트 PC 연결',
  setupHref: '/claim/setup',

  // ── err-google ──
  stopped: '넣기 멈춤',
  stoppedGoogle: '구글 코드에 닿지 못했어요',
  stoppedBit: '비트를 읽지 못했어요',
  stoppedAt: (hm: string) => ` · ${hm}`,
  stoppedRetry: (min: number) => ` · ${min}분 뒤 다시 해요`,
  stopKept: (hm: string) => ` ${hm}까지 넣은 줄은 시트에 그대로 있어요.`,
  stopTip: ' 인터넷이 되는데도 계속 이러면 [설정] › 구글 연결에서 [연결 시험]을 눌러 보세요.',
  // design.md 9-3 '비트·통로 번호'·'그 밖'
  bitFix: '비트 도우미 연결을 확인해 주세요.',
  unknownFix: (code: string) => `뜻밖의 오류가 났어요(${code}).`,

  // ── 결과 줄 ──
  resultClose: '결과 닫기',

  // ── pastmonth ──
  pastHead: '지난 달 파일을 보고 있어요',
  pastText: (m: number) => ` · 저절로 넣기는 이번 달 파일에만 해요. 여기서 고친 칸은 ${m}월 파일에 바로 저장돼요.`,
  backToThisMonth: '이번 달로',

  // ── newmonth ──
  newHead: (m: number) => `${m}월 파일을 새로 만들었어요.`,
  newMade: (name: string, josa: string, folder: boolean) => `원본 시트를 복사해 '${name}'${josa} ${folder ? '정한 폴더에' : '원본과 같은 폴더에'} 만들었어요.`,
  newCleaned: (n: number) => `새 파일 날짜 시트에 남아 있던 글자 ${n}칸을 지웠어요(원본은 그대로)`,
  newRatio: (n: number) => `비율 식(초진·90일초진·Block·물리치료 %) ${n}칸을 차트번호로 세게 고쳤어요`,
  newShared: (n: number) => `함께 쓸 직원 메일 ${n}개에 편집 권한을 줬어요`,
  newShareFailed: (n: number) => `함께 쓸 직원 메일 ${n}개에는 권한을 주지 못했어요 — 설정 › 시트에서 메일을 확인해 주세요`,
  newKept: (m: number) => `${m}월 파일은 그대로 있어요.`,
  newOpenPrev: (m: number) => `${m}월 파일 열기`,
  newOk: '확인',

  // ── err-frame ──
  frameFailHead: '시트를 이 화면 안에서 열지 못했어요',
  frameFailWhy: '이 인터넷 창이 병원 구글 계정에 로그인되어 있지 않거나, 로그인한 계정에 이 시트를 볼 권한이 없을 때 그래요.',
  frameFailKeep: '비트에서 넣기는 그대로 돌아요.',
  frameFailSteps: ['[새 창으로 열기]를 눌러 병원 구글 계정으로 로그인해요.', '시트가 열리면 이 화면으로 돌아와 [다시 열기]를 눌러요.'],
  frameRetry: '다시 열기',
  frameFailTip: '그래도 안 열리면 새 창에서 그대로 쓰셔도 돼요. 이 탭(또는 웹앱 아무 탭)이 열려 있으면 넣기는 계속돼요.',

  // ── none ──
  noneHead: '수납일지 시트를 아직 연결하지 않았어요',
  noneText: "병원 구글 계정의 '일일 수납일지' 시트를 이 탭 안에 띄우고, 비트에서 그날 수납을 5분마다 저절로 넣어요. 처음 한 번만 하면 돼요(20분쯤).",
  noneSteps: [
    {
      title: '병원 구글 계정에 원본 시트 두기',
      text: "원장님 개인 계정이 아니라 병원 구글 계정의 드라이브에 '일일 수납일지' 원본 시트가 있어야 해요. 달마다 이 원본을 복사해 새 달 파일을 만들어요.",
    },
    {
      title: '구글에 코드 붙이기',
      text: '비트 PC에서 [설정] › 구글 연결 › [구글에 붙일 코드 복사]를 누르고, 병원 구글 계정의 구글 자동 실행 도구(script.google.com)에 붙여 넣은 뒤 배포해요. 순서는 안내문에 그림과 함께 있어요.',
    },
    { title: '주소 두 개 넣기', text: '구글이 준 주소와 원본 시트 주소를 설정에 넣고 [연결 시험]을 눌러요.' },
    { title: '끝', text: '이 탭에 시트가 바로 떠요. 비트 PC에서 웹앱이 열려 있는 동안 5분마다 저절로 넣어요. 다른 PC에서는 시트를 보고 고치기만 해요.' },
  ],
  noneOpenSettings: '설정 열기',
  noneOpenGuide: '안내문 보기',
  noneTip: '비트시트 프로그램을 쓰고 있었다면 설정 화면 맨 위 [그대로 가져오기]로 그 설정을 옮길 수 있어요. 설정은 비트 PC에서 해요(비트 진료과·처방 목록을 그 PC에서 읽어요).',

  // ── overwrite ──
  owTitle: '덮어쓰기',
  owPrev: '전날',
  owNext: '다음 날',
  owToday: '오늘',
  owText: '덮어쓰기는 비트가 채우는 칸(차트번호·이름·기호·금액·진료실·초진·90일초진·Block·물리치료)을 비트 값으로 다시 써요.',
  owKeep: '직원이 적은 비고·예약관리·지출은 안 건드려요.',
  owTip: '지난 날 빈 칸만 다시 채우려면 날짜를 고르고 [빈 칸만 채우기]를 누르세요. 직원이 고친 금액·이름도 비트 값으로 바뀌니, 고친 칸이 있으면 [빈 칸만 채우기]를 쓰세요.',
  owCancel: '취소',
  owFillEmpty: '빈 칸만 채우기',
  owOverwrite: '덮어쓰기',
} as const

/** 덮어쓰기 창 날짜 '2026년 11월 26일 (목)' — 요일은 lib/analytics/dates weekdayOf(월 1 … 일 7) */
export const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'] as const
