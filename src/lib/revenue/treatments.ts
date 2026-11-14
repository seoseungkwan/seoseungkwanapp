// 치료 묶음 계산·제안·고치기(spec revenue design.md 7절, REQ-006). 순수 함수: 네트워크·저장소·React 없음. 묶음은 코드 목록이고 처방 이름으로 묶지 않는다
import { REVENUE_REST_CODE, type RevenueCodeRow } from '@/types/revenue'
import { RX_GROUP_CODES_MAX, RX_GROUP_NAME_MAX, RX_GROUPS_MAX, type RxGroup } from '@/types/rxGroups'

const REST_NAME = '그 밖 처방'

const upperCode = (code: string) => code.trim().toUpperCase()
// 묶음 견주기 열쇠: 통계 묶음(components/stats/view.ts codeKey)처럼 대소문자를 가리지 않는다(stats-revenue AC-4105.5)
const groupKey = (code: string) => code.toUpperCase()

/** 원본 일일 보고(OperationalReportSql.Treatments)의 다섯 규칙. 제안에만 쓰고, 이 표 밖에 따로 적지 않는다 */
export const SUGGESTED_GROUPS: readonly { name: string; match: (code: string) => boolean }[] = [
  { name: '도수치료', match: (code) => code.trim() === '도수' },
  { name: '체외충격파', match: (code) => upperCode(code).includes('ESWT') },
  { name: 'C-arm 주사', match: (code) => upperCode(code) === 'CARM1' },
  { name: '초음파', match: (code) => upperCode(code) === 'SONO1' },
  { name: '냉동치료', match: (code) => upperCode(code) === 'CRYO' },
]

/** 저장된 묶음이 하나도 없을 때만 쓴다. 저절로 저장되지 않는다. 맞는 코드가 없어도 다섯 개가 그대로 나온다 */
export function suggestGroups(knownCodes: string[]): (RxGroup & { suggested: true })[] {
  const groups = SUGGESTED_GROUPS.map((s, sortOrder) => ({
    id: null,
    name: s.name,
    codes: [] as string[],
    sortOrder,
    suggested: true as const,
  }))
  for (const code of new Set(knownCodes)) {
    const at = SUGGESTED_GROUPS.findIndex((s) => s.match(code))
    if (at >= 0) groups[at].codes.push(code)
  }
  return groups
}

type TreatmentTotal = { name: string; amount: number; count: number; missing: boolean; rest: boolean }

const hasNumbers = (t: TreatmentTotal) => t.amount !== 0 || t.count !== 0

/**
 * 묶음마다 금액·건수 합. 금액 큰 순(같으면 sortOrder 순), '그 밖 처방'은 맨 뒤.
 * 통계용으로 한 코드가 여러 묶음에 있어도 되므로(plan.md §7), 매출을 두 번 세지 않게 sortOrder 순 첫 묶음에서만 센다.
 * 코드는 대소문자를 가리지 않는다('mm101' 묶음에 'MM101' 줄이 든다). _REST는 글자 그대로 견준다
 */
export function groupTreatments(codes: readonly RevenueCodeRow[], groups: readonly RxGroup[]): TreatmentTotal[] {
  const ordered = [...groups].sort((a, b) => a.sortOrder - b.sortOrder)
  const totals = ordered.map((g): TreatmentTotal => ({ name: g.name, amount: 0, count: 0, missing: false, rest: false }))
  const restTotal: TreatmentTotal = { name: REST_NAME, amount: 0, count: 0, missing: false, rest: true }

  const firstGroup = new Map<string, TreatmentTotal>()
  ordered.forEach((g, i) => {
    for (const code of g.codes) {
      if (!firstGroup.has(groupKey(code))) firstGroup.set(groupKey(code), totals[i])
    }
  })

  for (const row of codes) {
    const total = row.code === REVENUE_REST_CODE ? restTotal : (firstGroup.get(groupKey(row.code)) ?? restTotal)
    total.count += row.count
    if (row.amount === null) total.missing = true
    else total.amount += row.amount
  }

  // sort는 안정 정렬이라 금액이 같으면 sortOrder 순이 유지된다
  const sorted = totals.filter(hasNumbers).sort((a, b) => b.amount - a.amount)
  return hasNumbers(restTotal) ? [...sorted, restTotal] : sorted
}

export type GroupEditError = 'empty' | 'tooLong' | 'duplicate' | 'badChars' | 'digits' | 'tooMany'

// DB CHECK(rx_groups.name)와 같은 규칙. 글자 수는 DB의 char_length처럼 코드 포인트로 센다.
// 제어 문자는 DB의 [[:cntrl:]]처럼 U+0080~U+009F까지 막는다(보이지 않는 글자라 저장 실패 안내로는 고칠 수 없다)
function nameError(trimmed: string, others: RxGroup[]): GroupEditError | null {
  if (trimmed === '') return 'empty'
  if ([...trimmed].length > RX_GROUP_NAME_MAX) return 'tooLong'
  if (others.some((g) => g.name === trimmed)) return 'duplicate'
  if (/[\u0000-\u001f\u007f-\u009f]/.test(trimmed)) return 'badChars'
  if (/[0-9]{6,}/.test(trimmed)) return 'digits'
  return null
}

const renumber = (groups: RxGroup[]): RxGroup[] => groups.map((g, sortOrder) => ({ ...g, sortOrder }))

// 고치기 함수는 받은 목록을 바꾸지 않고 새 목록을 돌려준다. 없는 자리를 받으면 아무것도 하지 않고 목록 그대로 돌려준다

export function addGroup(groups: RxGroup[], name: string): RxGroup[] | GroupEditError {
  if (groups.length >= RX_GROUPS_MAX) return 'tooMany'
  const trimmed = name.trim()
  const error = nameError(trimmed, groups)
  if (error) return error
  return renumber([...groups, { id: null, name: trimmed, codes: [], sortOrder: groups.length }])
}

export function renameGroup(groups: RxGroup[], index: number, name: string): RxGroup[] | GroupEditError {
  if (!groups[index]) return groups
  const trimmed = name.trim()
  const error = nameError(
    trimmed,
    groups.filter((_, i) => i !== index),
  )
  if (error) return error
  return renumber(groups.map((g, i) => (i === index ? { ...g, name: trimmed } : g)))
}

/** 지운 묶음의 코드는 어느 묶음에도 없게 된다('그 밖 처방') */
export function deleteGroup(groups: RxGroup[], index: number): RxGroup[] {
  if (!groups[index]) return groups
  return renumber(groups.filter((_, i) => i !== index))
}

/** 코드를 다른 모든 묶음에서 빼고 toIndex 자리의 묶음에 넣는다(null이면 그 밖). 고른 묶음이 꽉 찼으면 옮기지 않는다 */
export function moveCode(groups: RxGroup[], code: string, toIndex: number | null): RxGroup[] {
  if (toIndex !== null) {
    const target = groups[toIndex]
    if (!target) return groups
    if (!target.codes.includes(code) && target.codes.length >= RX_GROUP_CODES_MAX) return groups
  }
  return renumber(
    groups.map((g, i) => {
      if (i !== toIndex) return { ...g, codes: g.codes.filter((c) => c !== code) }
      return g.codes.includes(code) ? g : { ...g, codes: [...g.codes, code] }
    }),
  )
}
