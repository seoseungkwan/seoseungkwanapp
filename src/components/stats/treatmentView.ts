import { addDays, compareYmd } from '@/lib/analytics/dates'
import type { RxGroupDef } from '@/types/analysis'
import type { DateRange } from '@/types/dates'
import type { DayPayload } from '@/types/payload'
import type { RxGroup } from '@/types/rxGroups'
import { codeKey, rxDetail, rxPickRows, type RxDetailPoint, type RxPickRow, type StatsInput } from './view'

// 처방별 추세의 숫자 (treatment-trend REQ-1205~1209, design.md '다시 불러오기 판단'·'화면 숫자'). view.ts와 같은 규칙의 순수 함수다.
// 묶음 열쇠 = 처방 코드 모음의 지문(groupKey). 불러올 때 묶음마다 이 열쇠로 세어 일 줄 groups에 넣고, 화면은 지금 묶음의 열쇠 줄 숫자만 쓴다.
// 숫자는 묶음 줄을 "열쇠가 코드인 처방 줄"로 바꾼 가상 입력(groupInput)을 rxPickRows·rxDetail에 넘겨 낸다. 그래서 증감·짝 빼기·일부 기간이 처방 추세와 같다.
// 이름·sortOrder·제안 여부는 숫자에 쓰지 않는다. 숫자는 열쇠만 본다

export const GROUP_KEY = /^t[0-9a-f]{16}$/

export type TreatmentRow =
  | { kind: 'empty'; group: RxGroup } // 처방이 없는 묶음. 다시 불러오기 판단에 들지 않는다
  | { kind: 'stale'; group: RxGroup; key: string } // 고른 기간에 이 열쇠로 세지 않은 날이 있다: 다시 불러오면 보여요
  // compared 거짓 = 비교 기간에 세지 않은 날이 있어 견주지 않음. lastYearCompared는 작년 비교가 있는 고른 기간에만 있고, 거짓 = 작년 기간에 세지 않은 날이 있어 작년만 견주지 않음
  | { kind: 'ready'; group: RxGroup; key: string; compared: boolean; lastYearCompared?: boolean; row: RxPickRow }

// FNV-1a 64비트. 목표가 ES2017이라 BigInt 글자(…n) 대신 BigInt()로 만든다
const FNV_OFFSET = BigInt('0xcbf29ce484222325')
const FNV_PRIME = BigInt('0x100000001b3')
const KEY_DIGITS = 16

const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const bySortOrder = (groups: readonly RxGroup[]) => [...groups].sort((a, b) => a.sortOrder - b.sortOrder)

// 코드를 codeKey(대문자)로 바꾸고 겹침을 빼 글자 차례로 '\n'으로 이은 UTF-8 바이트의 FNV-1a 64비트. 't' + 소문자 16진수 16자리(validate.ts GROUP_ID를 지남)
export function groupKey(codes: readonly string[]): string {
  const text = [...new Set(codes.map(codeKey))].sort(compareText).join('\n')
  let hash = FNV_OFFSET
  for (const byte of new TextEncoder().encode(text)) hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * FNV_PRIME)
  return `t${hash.toString(16).padStart(KEY_DIGITS, '0')}`
}

// 불러오기에 넘길 묶음 정의. 처방 든 묶음만, sortOrder 차례, 같은 열쇠는 한 번만
export function groupDefs(groups: readonly RxGroup[]): RxGroupDef[] {
  const seen = new Set<string>()
  return bySortOrder(groups).flatMap((group) => {
    if (group.codes.length === 0) return []
    const id = groupKey(group.codes)
    if (seen.has(id)) return []
    seen.add(id)
    return [{ id, codes: [...group.codes] }]
  })
}

// 기간 안 일 줄(같은 날은 뒤의 것, view.ts와 같다)
function rowsIn(days: readonly DayPayload[], range: DateRange): DayPayload[] {
  const byDay = new Map<string, DayPayload>()
  for (const row of days) if (compareYmd(row.day, range.from) >= 0 && compareYmd(row.day, range.to) <= 0) byDay.set(row.day, row)
  return [...byDay.values()]
}

// 기간 안 저장된 일 줄이 모두 그 열쇠 줄을 가짐(0건 줄도 센 날이다). 기간 안에 줄이 없으면 참
export function keyedIn(days: readonly DayPayload[], range: DateRange, key: string): boolean {
  return rowsIn(days, range).every((row) => row.groups.some((line) => line.id === key))
}

// 덮은 기간에서 한 기간을 뺀다(앞뒤에 남은 조각만)
function withoutRange(covered: readonly DateRange[], cut: DateRange): DateRange[] {
  return covered.flatMap((part) => {
    const pieces: DateRange[] = []
    if (compareYmd(part.from, cut.from) < 0) pieces.push({ from: part.from, to: compareYmd(part.to, cut.from) < 0 ? part.to : addDays(cut.from, -1) })
    if (compareYmd(part.to, cut.to) > 0) pieces.push({ from: compareYmd(part.from, cut.to) > 0 ? part.from : addDays(cut.to, 1), to: part.to })
    return pieces
  })
}

// 덮은 기간에서 세지 않은 비교 기간을 뺀다. keep(그 묶음으로 센 다른 비교 기간)과 겹친 날은 남긴다: 직접 날짜 183–365일은
// 바로 전과 작년이 겹치는데, 겹친 날까지 빼면 센 비교도 '–'가 된다(stats-period AC-1705.2). 세지 않은 날은 늘 keep 밖에 있어 뺀 비교는 그대로 '–'다
function withoutUncounted(covered: readonly DateRange[], cut: DateRange, keep: DateRange | null): DateRange[] {
  const pieces = keep === null ? [cut] : withoutRange([cut], keep)
  return pieces.reduce<DateRange[]>((rest, piece) => withoutRange(rest, piece), [...covered])
}

// 날마다 rx를 그 열쇠 줄 하나(없으면 빈 목록)로 바꾼 가상 일 줄
function keyedDays(days: readonly DayPayload[], key: string, name: string): DayPayload[] {
  return days.map((row) => {
    const line = row.groups.find((item) => item.id === key)
    const rx = line === undefined ? [] : [{ code: key, name, type: '', patients: line.patients, newPatients: line.newPatients, returning: line.returning }]
    return { ...row, rx }
  })
}

// 그 열쇠 줄만 남긴 가상 입력. compared가 거짓이면 비교 기간을 덮은 기간에서 빼서
// 비교 칸이 모두 덜 끝난 칸이 된다(comparable null → 비교할 수 없음, 그래프 비교 칸 covered 거짓). lastYearCompared가 거짓이면 작년 기간도 뺀다(작년만 '–').
// 고른 기간에서 두 비교가 겹치면 센 쪽의 날은 남긴다(withoutUncounted). 빠른 단추(작년 없음)는 바로 전 기간 전체를 뺀다(지금 규칙)
export function groupInput(input: StatsInput, key: string, name: string, compared: boolean, lastYearCompared = true): StatsInput {
  const { previous, lastYear } = input.range
  const yearCounted = lastYear === null || lastYearCompared
  const withoutPrevious = compared ? input.covered : withoutUncounted(input.covered, previous, yearCounted ? lastYear : null)
  const covered = yearCounted ? withoutPrevious : withoutUncounted(withoutPrevious, lastYear, compared ? previous : null)
  return { days: keyedDays(input.days, key, name), covered, range: input.range }
}

// 묶음마다 한 줄, sortOrder 차례(건수로 다시 줄 세우지 않는다). 어느 묶음에도 없는 처방은 줄이 아니다
export function treatmentRows(input: StatsInput, groups: readonly RxGroup[]): TreatmentRow[] {
  return bySortOrder(groups).map((group): TreatmentRow => {
    if (group.codes.length === 0) return { kind: 'empty', group }
    const key = groupKey(group.codes)
    if (!keyedIn(input.days, input.range.current, key)) return { kind: 'stale', group, key }
    const compared = keyedIn(input.days, input.range.previous, key)
    const { lastYear } = input.range
    const lastYearCompared = lastYear === null || keyedIn(input.days, lastYear, key)
    const [row] = rxPickRows(groupInput(input, key, group.name, compared, lastYearCompared), [{ code: key, name: group.name }])
    return { kind: 'ready', group, key, compared, ...(lastYear === null ? {} : { lastYearCompared }), row }
  })
}

// 줄을 눌러 여는 그래프의 칸(처방 추세 rxDetail과 같은 칸: 7·30일 일, 90일 주, 12개월 달).
// 그래프는 바로 전만 그린다: 바로 전을 세지 않았으면 그 기간을 모두 빼서(작년과 겹친 날도) 회색 막대가 하나도 없다(지금 규칙)
export function treatmentDetail(input: StatsInput, item: Extract<TreatmentRow, { kind: 'ready' }>): { current: RxDetailPoint[]; previous: RxDetailPoint[] } {
  const covered = item.compared ? input.covered : withoutRange(input.covered, input.range.previous)
  return rxDetail({ days: keyedDays(input.days, item.key, item.group.name), covered, range: input.range }, item.key)
}

// 처방 든 묶음 가운데 숨긴 것(줄 차례). all = 처방 든 묶음이 모두 숨김(처음 쓸 때 포함)
export function staleNames(rows: readonly TreatmentRow[]): { all: boolean; names: string[] } {
  const filled = rows.filter((row) => row.kind !== 'empty')
  const names = filled.flatMap((row) => (row.kind === 'stale' ? [row.group.name] : []))
  return { all: names.length > 0 && names.length === filled.length, names }
}

// 준비됐지만 비교 기간을 이 열쇠로 세지 않아 견주지 않는 묶음(줄 차례)
export function uncomparedNames(rows: readonly TreatmentRow[]): string[] {
  return rows.flatMap((row) => (row.kind === 'ready' && !row.compared ? [row.group.name] : []))
}

// 열린 줄 열쇠: 저장된 id, 없으면(제안) 'new:' + 이름
export const rowKey = (group: RxGroup): string => group.id ?? `new:${group.name}`
