// 수납 넣기 순수 셈(lib/gsheet)이 쓰는 모양 — spec google-link design.md 10-2·9-2.
// 같은 Phase의 types/gsheet.ts(TASK-4)를 import하지 않고 같은 열쇠를 여기에 스스로 둔다(둘이 같은지는 TASK-23 시험).
// 환자 값은 없다: 설정·시각·숫자·칸 주소(23!J9 꼴)뿐이다.

/** 넣은 길: 저절로(간격 확인) · 손 · 저녁 마지막 넣기 · 지난 날 다시 넣기 */
export type FillVia = 'auto' | 'hand' | 'evening' | 'past'
/** 빈 칸만 채우기 · 덮어쓰기(손으로만) */
export type FillMode = 'fillEmpty' | 'overwrite'
/** 넣은 결과: 됨 · 됐지만 확인 필요 · 바뀐 것 없음(지문 같음) · 실패 */
export type RunOutcome = 'ok' | 'warn' | 'same' | 'fail'

/** 수납 시트 설정 한 벌(서버 gsheet_settings.conf). 코드 주소·함께 쓸 메일은 없다 — 넣는 PC 도우미에만(GsheetPinned) */
export type GsheetSettings = {
  templateUrl: string
  namePattern: string
  hospitalLabel: string
  folderUrl: string
  firstRow: number
  lastRow: number
  cols: {
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
  markValue: string
  signs: { cash: number; card: number; recvCash: number; recvCard: number; transfer: number; recvTransfer: number; free: number }
  shiftCols: string
  staffCols: string[]
  bitHospital: string
  deptRooms: Record<string, number>
  deptRoomsHospital: string
  firstKinds: string[]
  day90Kinds: string[]
  blockCodes: string[]
  therapyCodes: string[]
  free: 'discount' | 'paid-zero' | 'nhis-zero' | 'own-zero' | 'total-zero' | 'none'
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

/** 이 PC 도우미에 둔 코드 주소·함께 쓸 메일(sheet.status 답에서만 온다 — 설정 칸 보이기·막는 글 보기용) */
export type GsheetPinned = { url: string | null; shareWith: string[] }

/** 넣은 기록 한 줄(서버 gsheet_runs, 숫자만). at은 서버 시각 글자(ISO) */
export type GsheetRun = {
  at: string
  day: string
  via: FillVia
  mode: FillMode
  outcome: RunOutcome
  code: string | null
  rows: number
  counts: Record<string, number | boolean>
  cells: string[]
}

/** 넣을 일 하나 = sheet.fill {day, mode, auto}. auto = 지문이 지난번과 같으면 구글에 보내지 않음(간격 확인만 참) */
export type FillJob = { day: string; mode: FillMode; via: FillVia; auto: boolean }

/** sheet.fill 답(design.md 9-2) — 숫자·참거짓·파일 id·칸 주소만. 모양 검사는 reply.ts(TASK-13) */
export type FillReply = {
  /** 오늘 시트에 비트가 넣은 줄 수(띠 '(n줄)') */
  rows: number
  /** 그날 환자 수(결과 줄 '오늘 환자 n명') */
  patients: number
  added: number
  filled: number
  overwritten: number
  skipped: number
  /** 빈 줄이 모자라 다 넣지 못함 */
  full: boolean
  cancelCleared: number
  cancelKept: number
  freeFixed: number
  inserted: number
  /** 새 달 파일 날짜 시트에서 지운 칸 수 */
  cleaned: number
  shareFailed: number
  /** 새 달 파일을 만들었나 */
  created: boolean
  ratioFixed: number
  /** 식 모양이 달라 그대로 둔 비율 식 칸 주소(20개까지) */
  ratioSkipped: string[]
  /** 그대로 둔 비율 식 칸 수(주소가 20개에서 잘려도 전체 수) */
  ratioSkippedCount: number
  ratioFailed: boolean
  /** 나눠 낸 환자 수 */
  split: number
  free: number
  /** 내원 없이 미수만 낸 환자 수(이름 줄) */
  paidOnly: number
  /** 비고를 넣은 칸 수 */
  notes: number
  notPut: { noName: number; unlinked: number; negative: number; noChart: number }
  fileId: string | null
  sheetGid: number | null
  version: string
  /** 옛 7판 구글 코드로 넣음 */
  oldCode: boolean
}

/** sheet.fill 답 — 저절로(auto)이고 지문이 같아 보내지 않았을 때 */
export type FillUnchanged = { unchanged: true; rows: number }
