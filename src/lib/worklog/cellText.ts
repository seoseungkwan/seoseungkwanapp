import {
  WORKLOG_COUNT_KEYS,
  WORKLOG_DEFAULT_NAMES,
  WORKLOG_NOTE_KEYS,
  WORKLOG_SUM_KEYS,
  WORKLOG_WON_KEYS,
  type WorklogCellKey,
  type WorklogDay,
  type WorklogNumberKey,
  type WorklogNumbers,
} from '@/types/worklog'
import { countText, wonInputText } from './calc'
import { privacyProblem } from './notes'

// 칸 글자 읽기(design.md 7절). 칸을 읽는 규칙은 이 파일 한 곳이다.
// 원칙은 짐작하지 않는다(사용자): 어떻게 읽을지 애매하면 더하지 않고 합계 제외로 둔다. 앞자리만 잘라 읽거나 단위를 곱하지 않는다

export type CellKind = 'count' | 'won'
export type CellRead = { kind: 'number'; value: number } | { kind: 'none' } | { kind: 'excluded' }

const FULL_WIDTH_DIGIT = /[０-９]/ // \d가 못 잡으니 덩이를 찾기 전에 본다
const NUMBER_CHUNK = /\d[\d,]*/g // 쉼표는 한 숫자에 속한다
const THREE_DIGIT_GROUPS = /^\d{1,3}(,\d{3})+$/ // 쉼표가 있는 덩이는 이 모양일 때만 한 숫자로 읽는다
const BEFORE_CHUNK = /(?:\.|[\-−–—―‐‑ㅡ－△▲▼(（]\s*[₩￦\\]?)\s*$/ // 소수점·빼기 표시(사이의 원 표시 하나는 건너 본다)
const AFTER_CHUNK = /^\s*[십백천만억조]/
const NUMBER_ONLY = /^\d[\d,]*\s*원?$/
const MAX_DIGITS: Readonly<Record<CellKind, number>> = { count: 5, won: 12 }

const NUMBER_KEYS: readonly WorklogNumberKey[] = [...WORKLOG_COUNT_KEYS, ...WORKLOG_WON_KEYS]
const COUNT_KEYS: readonly WorklogNumberKey[] = WORKLOG_COUNT_KEYS
const AS_TYPED_KEYS: readonly WorklogCellKey[] = [...WORKLOG_NOTE_KEYS, 'memo']
const DEFAULT_NAMES: Readonly<Partial<Record<WorklogCellKey, string>>> = WORKLOG_DEFAULT_NAMES

export function cellKindOf(key: WorklogNumberKey): CellKind {
  return COUNT_KEYS.includes(key) ? 'count' : 'won'
}

export function readCell(kind: CellKind, text: string): CellRead {
  const trimmed = text.trim()
  if (!trimmed) return { kind: 'none' }
  if (privacyProblem(trimmed)) return { kind: 'excluded' } // 저장되지 않을 값이 합계에 들어가지 않게
  if (FULL_WIDTH_DIGIT.test(trimmed)) return { kind: 'excluded' }

  const chunks = [...trimmed.matchAll(NUMBER_CHUNK)]
  if (chunks.length === 0) return { kind: 'none' }
  if (chunks.length > 1) return { kind: 'excluded' }

  const [chunk] = chunks
  const end = chunk.index + chunk[0].length
  if (chunk[0].includes(',') && !THREE_DIGIT_GROUPS.test(chunk[0])) return { kind: 'excluded' }
  if (BEFORE_CHUNK.test(trimmed.slice(0, chunk.index))) return { kind: 'excluded' }
  if (AFTER_CHUNK.test(trimmed.slice(end))) return { kind: 'excluded' }

  const digits = chunk[0].replace(/,/g, '').replace(/^0+/, '')
  if (digits.length > MAX_DIGITS[kind]) return { kind: 'excluded' }
  return { kind: 'number', value: Number(digits) }
}

function readKey(day: WorklogDay, key: WorklogNumberKey): CellRead {
  return readCell(cellKindOf(key), day[key])
}

// worklogTotals(readDayNumbers(day))가 합계다. 업무사항·비고·항목 이름은 읽지 않는다
export function readDayNumbers(day: WorklogDay): WorklogNumbers {
  return Object.fromEntries(
    NUMBER_KEYS.map((key) => {
      const read = readKey(day, key)
      return [key, read.kind === 'number' ? read.value : null]
    }),
  ) as WorklogNumbers
}

// "합계에서 빠졌어요"를 보일 칸. 총진료비·조합청구액·미수발생·미수입금은 어차피 더하지 않으므로 들지 않는다
export function excludedSumKeys(day: WorklogDay): WorklogNumberKey[] {
  return WORKLOG_SUM_KEYS.filter((key) => readKey(day, key).kind === 'excluded')
}

// 숫자만(쉼표·"원" 허용)이고 숫자로 읽힐 때만 엑셀 모양이다. 막는 모양인 숫자가 쉼표 금액으로 보이지 않는다
export function cellShownText(kind: CellKind, text: string, focused: boolean): string {
  const trimmed = text.trim()
  const read = readCell(kind, trimmed)
  if (read.kind !== 'number' || !NUMBER_ONLY.test(trimmed)) return trimmed
  return kind === 'won' ? wonInputText(read.value, focused) : countText(read.value)
}

// 칠 때 끝 공백을 없애면 '12,000 별도'를 칠 수 없으므로 화면 값에는 그대로 두고 저장·비교 때만 지운다.
// 항목 이름이 기본 이름과 같으면 빈 글자(= 기본 이름)이고, 비고·업무사항은 친 그대로다
export function cellSaveText(key: WorklogCellKey, text: string): string {
  if (AS_TYPED_KEYS.includes(key)) return text
  const trimmed = text.trim()
  return trimmed === DEFAULT_NAMES[key] ? '' : trimmed
}
