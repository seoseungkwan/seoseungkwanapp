// 설정 › 구글 캘린더 안 메뉴 틀의 화면 글 (spec google-link AC-8528.1, notes-calendar '화면 글 › 공통' 글자 그대로).
// 시험은 이 상수가 아니라 notes 글자를 따로 적어 견준다(design.md 4절)

export const FRAME_TEXT = {
  title: '설정',
  settingsNav: '설정 안 메뉴',
  settings: '설정',
  bitPc: '비트 PC 연결',
  gcal: '구글 캘린더',
  newBadge: '새',
  subNav: '구글 캘린더 안 메뉴',
  sub: { connect: '잇기', colors: '시행자·종류', rules: '맞춤 방법' },
  hint: '원장 계정만 바꿀 수 있어요 · 데스크 계정은 보기만 해요',
  flowLabel: '처음 잇기 차례',
  flow: { connect: '① 잇기', colors: '② 시행자·종류 확인', import: '③ 가져오기 미리 보기' },
  flowNote: '처음 한 번만 이 차례로 해요',
} as const

export const SETTINGS_HREF = '/settings'
export const BIT_PC_HREF = '/claim/setup'
export const GCAL_HREF = '/settings/google-calendar'
