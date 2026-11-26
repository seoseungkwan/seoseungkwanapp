import { parseClock } from '@/lib/gsheet/plan'
import type { GsheetCols, GsheetFree, GsheetPinned, GsheetSettings, GsheetSigns } from '@/types/gsheet'

// 설정 화면 칸 값 ↔ 서버 설정(spec google-link AC-8516.3·8516.4, design.md 10-2).
// 화면은 숫자 칸도 글자로 들고 있다가 [저장]·[연결 시험] 때 GsheetSettings로 바꾼다(못 읽은 숫자는 NaN → lib/gsheet/check가 막는 글을 낸다).
// 화면에 없는 칸(미수 계좌 기호·직원 칸·보험 코드)은 저장한 값 그대로 둔다. 만든 설정은 정해 둔 서른 칸을 골라 새로 만든다 —
// 코드 주소·함께 쓸 메일은 여기 없다(따로 든 칸 값, pinnedOf). 서버로는 가지 않고 sheet.link로만 도우미에 간다(ADR-052)

export type ShownSign = Exclude<keyof GsheetSigns, 'recvTransfer'>

export type SheetForm = {
  templateUrl: string
  namePattern: string
  hospitalLabel: string
  folderUrl: string
  firstRow: string
  lastRow: string
  cols: Record<keyof GsheetCols, string>
  markValue: string
  signs: Record<ShownSign, string>
  shiftCols: string
  bitHospital: string
  deptRooms: Record<string, number>
  firstKinds: string[]
  day90Kinds: string[]
  blockCodes: string[]
  therapyCodes: string[]
  free: GsheetFree
  noteCar: boolean
  noteAid: boolean
  autoOn: boolean
  everyMin: string
  from: string
  to: string
  eveningOn: boolean
  evening: string
}

const text = (n: number) => (Number.isFinite(n) ? String(n) : '')

export function toForm(s: GsheetSettings): SheetForm {
  return {
    templateUrl: s.templateUrl,
    namePattern: s.namePattern,
    hospitalLabel: s.hospitalLabel,
    folderUrl: s.folderUrl,
    firstRow: text(s.firstRow),
    lastRow: text(s.lastRow),
    cols: { ...s.cols },
    markValue: s.markValue,
    signs: { cash: text(s.signs.cash), card: text(s.signs.card), recvCash: text(s.signs.recvCash), recvCard: text(s.signs.recvCard), transfer: text(s.signs.transfer), free: text(s.signs.free) },
    shiftCols: s.shiftCols,
    bitHospital: s.bitHospital,
    deptRooms: { ...s.deptRooms },
    firstKinds: [...s.firstKinds],
    day90Kinds: [...s.day90Kinds],
    blockCodes: [...s.blockCodes],
    therapyCodes: [...s.therapyCodes],
    free: s.free,
    noteCar: s.noteCar,
    noteAid: s.noteAid,
    autoOn: s.autoOn,
    everyMin: text(s.everyMin),
    from: s.from,
    to: s.to,
    eveningOn: s.eveningOn,
    evening: s.evening,
  }
}

/** 0 이상 정수 글자만 숫자로(빈칸·소수·글자는 NaN) */
const whole = (t: string) => (/^\s*\d{1,9}\s*$/.test(t) ? Number(t.trim()) : Number.NaN)
/** 칸 글자: 앞뒤 빈칸 빼고 대문자(비트시트 Norm) */
const letters = (t: string) => t.trim().toUpperCase()
const pad = (n: number) => String(n).padStart(2, '0')
/** 시각: 읽을 수 있으면 HH:mm으로(9:00 → 09:00), 못 읽으면 그대로(check가 막는다) */
function clock(t: string): string {
  const minute = parseClock(t)
  return minute === null ? t.trim() : `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`
}

/**
 * 화면 값 → 서버 설정. base = 지금 저장된 설정(화면에 없는 칸을 가져온다).
 * roomsHospital = 진료실 표를 채운 비트 병원 코드(있으면 그 병원 맞춤을 확인한 것으로 deptRoomsHospital에, ''이면 저장한 값 그대로)
 */
export function fromForm(f: SheetForm, base: GsheetSettings, roomsHospital: string): GsheetSettings {
  const cols = Object.fromEntries(Object.entries(f.cols).map(([k, v]) => [k, letters(v)])) as GsheetCols
  return {
    templateUrl: f.templateUrl.trim(),
    namePattern: f.namePattern,
    hospitalLabel: f.hospitalLabel.trim(),
    folderUrl: f.folderUrl.trim(),
    firstRow: whole(f.firstRow),
    lastRow: whole(f.lastRow),
    cols,
    markValue: f.markValue,
    signs: {
      cash: whole(f.signs.cash),
      card: whole(f.signs.card),
      recvCash: whole(f.signs.recvCash),
      recvCard: whole(f.signs.recvCard),
      transfer: whole(f.signs.transfer),
      recvTransfer: base.signs.recvTransfer,
      free: whole(f.signs.free),
    },
    shiftCols: letters(f.shiftCols.replace(/ /g, '')),
    staffCols: [...base.staffCols],
    bitHospital: f.bitHospital,
    deptRooms: { ...f.deptRooms },
    deptRoomsHospital: roomsHospital.length > 0 ? roomsHospital : base.deptRoomsHospital,
    firstKinds: [...f.firstKinds],
    day90Kinds: [...f.day90Kinds],
    blockCodes: [...f.blockCodes],
    therapyCodes: [...f.therapyCodes],
    free: f.free,
    freeInsurance: [...base.freeInsurance],
    carInsurance: [...base.carInsurance],
    aidInsurance: [...base.aidInsurance],
    noteCar: f.noteCar,
    noteAid: f.noteAid,
    autoOn: f.autoOn,
    everyMin: whole(f.everyMin),
    from: clock(f.from),
    to: clock(f.to),
    eveningOn: f.eveningOn,
    evening: clock(f.evening),
  }
}

/** 메일 칸 글 → 목록(쉼표로 나눔, 빈 것 뺌) */
export const mailsOf = (t: string): string[] =>
  t
    .split(',')
    .map((m) => m.trim())
    .filter((m) => m.length > 0)
export const mailText = (list: readonly string[]) => list.join(', ')

/** 두 칸 글 → 도우미에 둘 값 */
export const pinnedOf = (url: string, mails: string): GsheetPinned => ({ url: url.trim().length > 0 ? url.trim() : null, shareWith: mailsOf(mails) })

export const samePinned = (a: GsheetPinned, b: GsheetPinned) =>
  (a.url ?? '') === (b.url ?? '') && a.shareWith.length === b.shareWith.length && a.shareWith.every((m, i) => m === b.shareWith[i])

/** 파일 이름 틀 채우기(비트시트 SheetPayload.FileName) */
export function fileName(pattern: string, hospital: string, year: number, month: number): string {
  const p = pattern.trim().length > 0 ? pattern : '{병원} 일일수납일지 {yyyy}년 {m}월'
  return p
    .replaceAll('{병원}', hospital.trim())
    .replaceAll('{yyyy}', String(year).padStart(4, '0'))
    .replaceAll('{yy}', pad(year % 100))
    .replaceAll('{mm}', pad(month))
    .replaceAll('{m}', String(month))
    .trim()
}
