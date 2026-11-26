// 수납일지 구글 시트 모양 (spec google-link design.md 7-3·10-2, TASK-4).
// 구글 코드 주소·함께 쓸 직원 메일은 넣는 PC 도우미(sheet.dat)에만 있다 — 서버 설정(GsheetSettings)·브라우저 저장소에는 두지 않는다(ADR-052)

/** 비트가 채우는 칸 글자(A~Z) — 열쇠·이름·기호·금액·진료실·초진·90일·처방 둘·비고(비우면 비고 안 넣음) */
export type GsheetCols = {
  key: string
  name: string
  sign: string
  amount: string
  room: string
  first: string
  day90: string
  block: string
  therapy: string
  note: string
}

/** 수납 기호 번호 — 현금·카드·미수 현금·미수 카드·계좌·미수 계좌·FREE */
export type GsheetSigns = { cash: number; card: number; recvCash: number; recvCard: number; transfer: number; recvTransfer: number; free: number }

export const GSHEET_FREE_RULES = ['discount', 'paid-zero', 'nhis-zero', 'own-zero', 'total-zero', 'none'] as const
export type GsheetFree = (typeof GSHEET_FREE_RULES)[number]

/** 병원 하나의 수납 시트 설정(gsheet_settings.conf). 코드 주소·함께 쓸 메일은 없다(도우미에만, GsheetPinned) */
export type GsheetSettings = {
  templateUrl: string
  namePattern: string
  hospitalLabel: string
  folderUrl: string
  firstRow: number
  lastRow: number
  cols: GsheetCols
  markValue: string
  signs: GsheetSigns
  shiftCols: string
  staffCols: string[]
  bitHospital: string
  deptRooms: Record<string, number>
  deptRoomsHospital: string
  firstKinds: string[]
  day90Kinds: string[]
  blockCodes: string[]
  therapyCodes: string[]
  free: GsheetFree
  freeInsurance: number[]
  carInsurance: number[]
  aidInsurance: number[]
  noteCar: boolean
  noteAid: boolean
  autoOn: boolean
  everyMin: number
  from: string
  to: string
  eveningOn: boolean
  evening: string
}

/** 서버 설정에 두지 않는 열쇠 — 들어 있으면 저장하지 않는다(DB 확인 제약과 같다, AC-8505.2) */
export const GSHEET_PINNED_KEYS = ['scriptUrl', 'url', 'shareWith'] as const

/** 도우미에만 있는 값. sheet.status 답에서만 온다. 서버·브라우저 저장소에 두지 않는다 */
export type GsheetPinned = { url: string | null; shareWith: string[] }

/** 저장한 설정 + 넣는 PC 비밀 글자 지문(SHA-256 16진수 앞 16자, 없으면 null) */
export type GsheetSaved = { settings: GsheetSettings; secretTag: string | null }

/** 그달 '일일 수납일지' 파일 id와 날짜 시트('1'~'31') gid */
export type GsheetMonth = { ym: string; fileId: string; gids: Record<string, number> }

export const GSHEET_VIAS = ['auto', 'hand', 'evening', 'past'] as const
export const GSHEET_MODES = ['fillEmpty', 'overwrite'] as const
export const GSHEET_OUTCOMES = ['ok', 'warn', 'same', 'fail'] as const

/** 넣은 기록 한 줄(gsheet_runs) — 숫자·오류 번호·칸 주소만. at은 DB가 정하고 DB 글자 그대로 돌려준다 */
export type GsheetRun = {
  at: string
  day: string
  via: (typeof GSHEET_VIAS)[number]
  mode: (typeof GSHEET_MODES)[number]
  outcome: (typeof GSHEET_OUTCOMES)[number]
  code: string | null
  rows: number
  counts: Record<string, number | boolean>
  cells: string[]
}
export type GsheetRunInput = Omit<GsheetRun, 'at'>

/** 비트시트 7판 기본값에서 코드 주소·함께 쓸 메일을 뺀 것(design.md 10-2). 비고 두 가지(자동차보험·건강생활잔액)는 웹에서 켬 */
export const DEFAULT_GSHEET_SETTINGS: Readonly<GsheetSettings> = deepFreeze({
  templateUrl: '',
  namePattern: '{병원} 일일수납일지 {yyyy}년 {m}월',
  hospitalLabel: '',
  folderUrl: '',
  firstRow: 17,
  lastRow: 302,
  cols: { key: 'B', name: 'C', sign: 'D', amount: 'F', room: 'I', first: 'J', day90: 'K', block: 'L', therapy: 'M', note: 'G' },
  markValue: '0',
  signs: { cash: 1, card: 2, recvCash: 3, recvCard: 4, transfer: 5, recvTransfer: 5, free: 6 },
  shiftCols: 'A:P',
  staffCols: ['G', 'O'],
  bitHospital: '',
  deptRooms: {},
  deptRoomsHospital: '',
  firstKinds: ['1'],
  day90Kinds: ['3'],
  blockCodes: [],
  therapyCodes: [],
  free: 'discount',
  freeInsurance: [31],
  carInsurance: [21, 22],
  aidInsurance: [51, 52],
  noteCar: true,
  noteAid: true,
  autoOn: true,
  everyMin: 5,
  from: '08:00',
  to: '20:00',
  eveningOn: true,
  evening: '19:30',
})

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const inner of Object.values(value)) deepFreeze(inner)
    Object.freeze(value)
  }
  return value
}
