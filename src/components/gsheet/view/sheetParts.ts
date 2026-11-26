import { todayInKorea } from '@/lib/analytics/dates'
import { errorInfo, isErrorCode } from '@/lib/errors'
import { koreaClock } from '@/lib/gsheet/plan'
import type { GsheetMonth } from '@/types/gsheet'
import { VIEW } from './labels'

// 시트 보기 셈 조각(spec google-link TASK-15): 시트 주소·파일 이름·시각 글·멈춤 까닭. 화면 글은 labels.ts, 오류 까닭 글은 lib/errors.

// design.md 6절: 파일 id는 이 모양, gid는 0 이상 정수일 때만 주소에 넣는다
const FILE_ID = /^[A-Za-z0-9_-]{20,100}$/
const SHEETS = 'https://docs.google.com/spreadsheets/d/'
// design.md 9-3 '비트·통로 번호' — 굵은 글 '비트를 읽지 못했어요' + '비트 도우미 연결을 확인해 주세요.'
// E-EXT-*(크롬 확장 없음·옛 판)도 같은 통로 문제라 같이 본다
const BIT_CODE = /^E-(?:BIT|BRIDGE|HELPER|EXT)-/

export const isFileId = (value: unknown): value is string => typeof value === 'string' && FILE_ID.test(value)
const isGid = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0

export type SheetLinks = { frame: string; open: string }

/** 그 달 파일의 그날 시트: 틀 주소(메뉴 줄인 모양 rm=minimal)와 새 창 주소. 파일 id 모양이 틀리면 null, gid를 모르면 파일 첫 시트 */
export function sheetLinks(month: GsheetMonth | undefined, day: number): SheetLinks | null {
  if (!month || !isFileId(month.fileId)) return null
  const gid = month.gids?.[String(day)]
  const tail = isGid(gid) ? `#gid=${gid}` : ''
  const base = `${SHEETS}${month.fileId}/edit`
  return { frame: `${base}?rm=minimal${tail}`, open: `${base}${tail}` }
}

/** 파일 하나를 새 창에서 여는 주소(첫 시트). 모양이 틀리면 null */
export function fileLink(month: GsheetMonth | undefined): string | null {
  return month && isFileId(month.fileId) ? `${SHEETS}${month.fileId}/edit` : null
}

/** 새 달 파일 이름 — 도우미 SheetPayload.FileName과 같은 자리 글자({병원} {yyyy} {yy} {mm} {m}) */
export function fileName(pattern: string, hospital: string, ym: string): string {
  const year = ym.slice(0, 4)
  const month = Number(ym.slice(5, 7))
  return (pattern.trim() === '' ? '{병원} 일일수납일지 {yyyy}년 {m}월' : pattern)
    .replaceAll('{병원}', hospital.trim())
    .replaceAll('{yyyy}', year)
    .replaceAll('{yy}', year.slice(2))
    .replaceAll('{mm}', String(month).padStart(2, '0'))
    .replaceAll('{m}', String(month))
    .trim()
}

/** 띠에 보이는 파일 이름 앞부분 — 이름 끝이 달('2026년 11월')이면 그 자리는 달 고르기 단추가 맡고, 아니면 이름 전부 뒤에 단추 */
export function bandTitle(name: string, ym: string): string {
  const month = VIEW.month(ym)
  return name.endsWith(month) ? name.slice(0, -month.length).trimEnd() : name
}

/** 한국 시각 'HH:mm' */
export function clockOf(iso: string): string {
  const minute = Math.floor(koreaClock(new Date(iso)).minute)
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
}

/** 그 시각의 한국 날짜 */
export const dayOfIso = (iso: string) => todayInKorea(new Date(iso))

export const isBitCode = (code: string | null) => code !== null && BIT_CODE.test(code)

/** 멈춘 넣기의 까닭: 띠 굵은 글(band)과 알림 굵은 까닭 글(fix) — design.md 9-3 */
export function stopReason(code: string | null): { band: string; fix: string } {
  const known = code ?? 'E-GSHEET-FAILED'
  if (isBitCode(known)) return { band: VIEW.stoppedBit, fix: VIEW.bitFix }
  if (known.startsWith('E-GSHEET-') && isErrorCode(known)) return { band: VIEW.stoppedGoogle, fix: errorInfo(known).fix }
  return { band: VIEW.stoppedGoogle, fix: VIEW.unknownFix(known) }
}
