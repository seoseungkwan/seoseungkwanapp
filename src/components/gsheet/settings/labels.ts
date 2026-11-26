// 수납일지 시트 설정 화면 글 한 곳(spec google-link REQ-8516·8517, design.md 4절). 원본은 승인 시안 notes-sunap '### `settings` 설정'과
// design.md 2절 표 17이다. notes에 없는 고르기 창 글·처방 목록 자리 글·창 단추는 비트시트 그대로(Catalog.cs CodeListState.Message·OrderKind.RuleText,
// HospitalPick.Label, HospitalPickForm, CodePickerForm, SettingsForm). 시험은 이 상수가 아니라 notes 글자를 적어 견준다.
// 오류 카드의 '무엇이 · 어떻게 고치나'는 lib/errors.ts 것을 그린다(여기에 두지 않는다)

export const HEAD = {
  back: '‹ 시트로 돌아가기',
  title: '수납일지 시트 설정',
  hint: '이 병원 하나의 설정이에요 · 비트 목록은 이 PC(비트 PC)에서 읽어요',
  navName: '설정 목차',
  navNote: '바꾼 것은 아래 [저장]을 눌러야 들어가요. 저장한 뒤 다음 넣기부터 새 설정으로 넣어요.',
  cancel: '취소',
  save: '저장',
} as const

export const BANNER = {
  title: '이 PC에 비트시트 프로그램 설정이 있어요.',
  text: '원본 시트 주소·구글 주소·비밀 글자·진료실·처방 고르기를 그대로 가져올 수 있어요. 가져온 뒤에는 비트시트 프로그램을 꺼 주세요(둘이 같이 넣으면 같은 일을 두 번 해요).',
  take: '그대로 가져오기',
  skip: '안 가져와요',
} as const

/** 네 칸 제목 · 작은 글 · 목차 고리 id */
export const SECTIONS = [
  { key: 'google', title: '구글 연결', small: '병원마다 한 번' },
  { key: 'sheet', title: '시트', small: '어느 파일, 어느 칸' },
  { key: 'bit', title: '비트 맞춤', small: '병원마다 다르게 · 목록은 이 PC 비트에서 읽어요' },
  { key: 'auto', title: '저절로 넣기', small: '거의 실시간' },
] as const
export type SectionKey = (typeof SECTIONS)[number]['key']

export const GOOGLE = {
  codeLabel: '1. 구글에 붙일 코드',
  codeText: '병원 구글 계정으로 로그인한 뒤, 이 코드를 구글 자동 실행 도구(script.google.com)에 붙여 넣고 배포해요. 순서는 안내문에 있어요.',
  copy: '구글에 붙일 코드 복사',
  guide: '안내문 열기',
  codeHint: '코드 안에 이 PC만 아는 비밀 글자가 들어 있어요. 다른 사람에게 보내지 마세요.',
  copied: '복사했어요. 구글 자동 실행 도구의 코드 칸에 붙여 넣으세요. 순서는 [안내문 열기]에 있어요.',
  ask: '이 PC에서 비밀 글자를 읽지 못했어요(다른 PC에서 옮겨 온 설정일 수 있어요). 새 비밀 글자를 만들어 코드에 넣을까요? 새로 만들면 구글에 코드를 다시 붙이고 새 버전으로 배포해야 해요.',
  askYes: '새로 만들기',
  askNo: '취소',
  urlLabel: '2. 구글에서 받은 주소',
  urlPlaceholder: 'https://script.google.com/macros/s/…/exec',
  test: '연결 시험',
  notTested: '아직 시험하지 않았어요.',
  testing: '시험하는 중…',
  ok: '연결됨',
  bad: '안 됨',
  okText: (title: string) => `원본 시트 '${title}'을 읽을 수 있어요.`,
  oldCode: ' 다만 구글 코드가 옛 판이에요 — [구글에 붙일 코드 복사]로 새로 붙이고 새 버전으로 배포해 주세요.',
  /** design.md 2절 표 17 — sheet.link 확인 창을 기다리는 동안 칸 아래 */
  waitConfirm: '이 PC 화면에 뜬 확인 창에서 [바꾸기]를 눌러 주세요.',
  pcLabel: '넣는 PC',
  pcChip: '이 PC',
  pcText: '비트 도우미 연결됨 · 비밀 글자가 이 PC에 있어요',
  pcHint: '넣기는 비밀 글자가 있는 이 PC에서만 해요. 다른 PC에서 [구글에 붙일 코드 복사]를 하면 그 PC가 넣는 PC가 되고, 이 PC는 더 넣지 못해요.',
} as const

/** design.md 9-3 '비트·통로 번호' 까닭 글 · '그 밖' */
export const REASON = {
  bit: '비트 도우미 연결을 확인해 주세요.',
  other: (code: string) => `뜻밖의 오류가 났어요(${code}).`,
} as const

export const SHEET = {
  templateLabel: '원본 시트 주소',
  templatePlaceholder: 'https://docs.google.com/spreadsheets/d/…/edit',
  patternLabel: '새 달 파일 이름',
  patternExample: (name: string) => `예: ${name} — 달이 바뀌면 원본을 복사해 저절로 만들어요. 그 달 파일이 이미 있으면 그것을 써요.`,
  labelLabel: '병원 이름',
  /** 비트 병원 이름을 아직 못 읽었으면 괄호 없이 */
  labelPlaceholder: (name: string) => (name.length > 0 ? `비우면 비트의 병원 이름(${name})` : '비우면 비트의 병원 이름'),
  labelHint: '파일 이름의 {병원} 자리에 들어가요.',
  folderLabel: '넣을 폴더',
  folderPlaceholder: '비우면 원본과 같은 폴더',
  mailLabel: '함께 쓸 직원 메일',
  mailHint: '쉼표로 나눠 적어요. 새 달 파일을 만들 때 이 메일에 편집 권한을 줘요.',
  rowsLabel: '환자 줄',
  rowsFrom: '줄부터',
  rowsTo: '줄까지',
  rowsFromName: '환자 줄 몇 줄부터',
  rowsToName: '환자 줄 몇 줄까지',
  colsLabel: '칸 글자',
  colsHead: '칸 이름',
  colsRow: '시트 칸 글자',
  colsHint: '비고 칸은 비우면 비고 글을 넣지 않아요. 같은 칸 글자를 두 번 쓸 수 없어요.',
  markLabel: '표시 값',
  markHint: '초진·90일초진·Block(주사)·물리치료면 넣는 값(시트 식은 0을 셈)',
  signsLabel: '기호 번호',
  signsHint: '현금과 카드를 나눠 냈으면 두 줄로 넣어요. 둘째 줄에는 이름·기호·금액만 들어가요(차트번호는 첫 줄만).',
  shiftLabel: '밀어 내릴 칸',
  shiftChip: '고급',
  shiftHint: '늦게 낸 돈을 환자 바로 아래에 끼울 때 이 칸들만 아래로 밀어요(지출 칸은 그대로). 비우면 끼우지 않아요.',
} as const

/** 칸 글자 표 차례(시안 colHeads) — 비트가 채우는 아홉 + 비고 */
export const COLUMNS = [
  { key: 'key', name: '차트번호' },
  { key: 'name', name: '이름' },
  { key: 'sign', name: '기호' },
  { key: 'amount', name: '금액' },
  { key: 'room', name: '진료실' },
  { key: 'first', name: '초진' },
  { key: 'day90', name: '90일초진' },
  { key: 'block', name: 'Block(주사)' },
  { key: 'therapy', name: '물리치료' },
  { key: 'note', name: '비고' },
] as const

/** 기호 번호 표 차례(시안 signs). 미수 계좌(recvTransfer)는 화면에 없고 저장한 값 그대로 둔다 */
export const SIGNS = [
  { key: 'cash', name: '현금' },
  { key: 'card', name: '카드' },
  { key: 'recvCash', name: '미수현금' },
  { key: 'recvCard', name: '미수카드' },
  { key: 'transfer', name: '계좌이체' },
  { key: 'free', name: 'FREE' },
] as const

export const BIT = {
  hospitalLabel: '비트 병원',
  pick: '고르기…',
  hospitalAuto: '저절로 정함 (병원이 여럿이면 최근 환자가 있는 병원)',
  hospitalPicked: (name: string, code: string) => `${name.length > 0 ? `${name} (코드 ${code})` : `코드 ${code}`} — 비트에 병원이 여럿일 때만 필요해요`,
  hospitalHint: '비트에 병원이 여럿일 때만 필요해요.',
  roomsTitle: '진료실 (1~10)',
  roomsDept: '비트 진료과',
  roomsRoom: '시트 진료실',
  roomName: (code: string) => `${code} 시트 진료실`,
  roomEmpty: '빈칸',
  deptVisits: (n: string) => `최근 90일 환자 ${n}`,
  deptUnused: '쓰지 않음',
  roomsHint: (n: number) =>
    `진료과 ${n}개 · 번호는 시트 진료실(1~10). 처음에는 최근 90일 환자가 있는 과부터 1, 2, …를 저절로 붙여요. 맞춤이 없는 과는 빈칸으로 넣어요.`,
  deptLoading: '비트에서 진료과를 불러오는 중…',
  deptFailed: '진료과를 불러오지 못했어요.',
  deptNone: '이 병원 진료과가 비트에 없어요.',
  deptAuto: '진료과에 번호를 저절로 붙였어요(최근 90일 환자가 있는 과부터). 맞는지 보고 [저장]을 눌러 주세요.',
  kindsTitle: '초진 · 90일초진',
  kindsHint: '비트 진찰구분 기준',
  firstTitle: '초진 칸',
  day90Title: '90일초진 칸',
  blockLabel: 'Block(주사)로 셀 처방',
  therapyLabel: '물리치료로 셀 처방',
  sameDialog: '위와 같은 고르기 창',
  freeLabel: 'FREE(기호 6)로 볼 때',
  notesLabel: '비고에 저절로 넣는 글',
  notesHint: "비고 칸이 비어 있을 때만 넣어요. 직원이 적은 글은 안 바꿔요. 비고 칸 글자는 위 '시트 › 칸 글자'에서 정해요(비우면 둘 다 꺼요).",
} as const

/** 비트 진찰구분 고르기(시안 그대로) */
export const KINDS = {
  first: [
    { code: '1', name: '1 신환' },
    { code: '2', name: '2 과초진' },
  ],
  day90: [{ code: '3', name: '3 90일초진' }],
} as const

/** FREE로 볼 때 여섯(design.md 10-2 free 값 차례) */
export const FREE_RULES = [
  {
    value: 'discount',
    name: "비트 할인 기록이 '사용자할인(FREE)'일 때",
    detail:
      "기본. 수납할 때 할인 종류를 '사용자할인(FREE)'로 고른 환자는 받은 돈과 상관없이 FREE 한 줄(기호 6, 0원)로 넣어요. 그날 낸 미수 돈은 따로 넣어요. 할인 기록이 늦게 붙으면 먼저 넣은 현금·카드 줄을 FREE로 바꿔요.",
  },
  { value: 'paid-zero', name: '받은 돈 0원이고 미수도 없을 때', detail: '본인부담이 있는데 수납에서 0원을 받고, 미수 발생·건강생활유지비도 없는 환자.' },
  { value: 'nhis-zero', name: '건강보험 환자인데 본인부담이 0원일 때', detail: '보험 코드 31(국민건강보험) 환자의 본인부담이 0원이고 총진료비는 있을 때.' },
  { value: 'own-zero', name: '본인부담이 0원일 때 (자보·의료급여 포함)', detail: '' },
  { value: 'total-zero', name: '총진료비가 0원일 때', detail: '' },
  { value: 'none', name: 'FREE 안 씀', detail: '' },
] as const

export const NOTES = [
  { key: 'noteCar', name: '자동차보험', detail: '그날 보험이 21 자보-청구분 · 22 자보-100%일 때' },
  { key: 'noteAid', name: '건강생활잔액', detail: '의료급여(51 보호1종 · 52 보호2종) 환자가 그날 건강생활유지비를 썼을 때' },
] as const

/** 처방 목록(비트시트 OrderKind·CodeListState 글, Block 풀이만 시안 글) */
export const RX = {
  search: '찾기: 코드나 이름',
  searchHint: '최근 90일에 쓴 처방만 보여요 · 그 분류 처방이 위에 있어요',
  heads: ['코드', '이름', '분류', '90일 건수'],
  ruleNone: { block: '고른 처방 없음 → 주사 처방 전부 셈', therapy: '고른 처방 없음 → 물리치료 처방 전부 셈' },
  ruleSome: (n: number) => `고른 처방 ${n}개만 셈`,
  detail: {
    block: "고른 처방이 없으면 비트 처방 분류가 '주사료'·'마취료'인 처방(붕대 같은 재료는 빼고)이 있는 환자를 세요.",
    therapy: "고른 처방이 없으면 비트 처방 분류가 '이학요법료'인 처방(물리치료·도수·체외충격파 등)이 있는 환자를 셉니다.",
  },
  /** 도우미 sheet.catalog의 분류(OrderKind) — 그 분류 처방이 목록 위 */
  cls: { block: '주사', therapy: '물리치료' },
  unused: '(최근 90일에 안 씀)',
  loading: '비트에서 최근 90일 처방 목록을 불러오는 중이에요…',
  failed: '처방 목록을 불러오지 못했어요. 비트를 읽지 못했어요. [다시 불러오기]를 눌러 주세요.',
  retry: '다시 불러오기',
  none: '최근 90일에 쓴 처방이 비트에 없어요. 고른 처방이 없으면 비트 분류로 셉니다.',
  dialogTitle: '물리치료로 셀 처방 — 최근 90일에 쓴 처방',
  cancel: '취소',
  done: '확인',
} as const

export const HOSPITAL_PICK = {
  title: '우리 병원 고르기',
  text: '이 PC의 비트에 병원이 여럿 있어요. 우리 병원을 골라 주세요.',
  hint: '보통 최근 환자가 있는 병원이 우리 병원이에요. 한 번 고르면 다시 묻지 않아요(설정 › 비트 맞춤에서 바꿀 수 있어요).',
  label: (name: string, recent: string, code: string) => `${name.length > 0 ? name : '이름 없는 병원'} · 최근 30일 환자 ${recent}명 (코드 ${code})`,
  cancel: '취소',
  pick: '고르기',
} as const

export const AUTO = {
  onLabel: '저절로 넣기',
  on: '켜기',
  onDetail: '웹앱이 열려 있는 동안(어느 탭이든) 이 PC에서 넣어요. 창을 줄여 두는 것은 괜찮지만, 창을 닫으면 멈춰요.',
  everyLabel: '몇 분마다',
  everyUnit: '분마다 ·',
  fromName: '넣기 시작 시각',
  toName: '넣기 끝 시각',
  everyHint: '바뀐 게 있을 때만 구글에 보내요',
  eveningLabel: '저녁 마지막 넣기',
  eveningName: '저녁 마지막 넣기 시각',
  eveningHint: '빠진 것이 없게 한 번 더 넣어요(그때 웹앱이 열려 있어야 해요)',
  pastLabel: '지난 날 다시 넣기',
  pastText: '저녁 마지막 넣기를 못 한 날은 다음에 웹앱을 열 때 그날을 한 번 더 넣어요(7일 안, 빈 칸만 채우기).',
  modeLabel: '넣는 방식',
  mode: '빈 칸만 채우기',
  modeHint: '(저절로 넣을 때는 늘 이 방식 — 직원이 적은 값은 안 지워요)',
  recentLabel: '최근 기록',
  recentNone: '오늘은 아직 없어요',
  recentSame: '바뀐 것 없음',
  recentAdded: (n: number) => ` 새 줄 ${n}`,
  recentFilled: (n: number) => ` 채운 줄 ${n}`,
  recentAgain: '다시 넣음',
  failNet: '구글 연결 안 됨',
  failBit: '비트 못 읽음',
  failOther: '넣지 못함',
} as const

/** notes-sunap '설정 저장 실패'(웹앱 오류 카드 E-SETTINGS-FAILED 위 한 줄) */
export const SAVE_FAILED = '설정을 저장하지 못했어요.'
