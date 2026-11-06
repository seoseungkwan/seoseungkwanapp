import { addMonths } from '@/lib/analytics/dates'
import type { ReportInput, ReportMetric } from '@/types/aiReport'
import type { MonthPayload, RevisitPayload } from '@/types/payload'

// AI에게 보낼 숫자 묶음(spec ai-report design.md '지표 목록'). 순수 함수만 — 네트워크·DB·SDK·node 모듈 없음.
// 순서가 곧 지문이다: 지표 차례와 객체 열쇠 차례를 늘 같게 만들고, 정렬은 글자 코드 비교(a < b)로 한다(localeCompare는 실행 환경마다 다를 수 있다).
// null과 0을 가른다: 달 자체가 없으면 null, 자료가 있는 달에 그 처방·동네가 없으면 0.
// 묶음은 지금 묶음(groupNames)만 쓰고, 그 달 줄에 그 열쇠가 없으면 null이다 — 달 줄만으로는 '0명'과 '그 묶음으로 세지 않음'을 가를 수 없다(spec ai-report-stats REQ-2003)

export const TOP_RX = 30
export const TOP_REGIONS = 20

export type ValidReportMonths = {
  selected: MonthPayload // validateMonthPayload를 통과한 것
  prev: MonthPayload | null // 없거나 검사를 못 넘으면 null
  lastYear: MonthPayload | null
  groupNames: Record<string, string>
}

type Month = MonthPayload | null

// 접수 건수(같은 분이 한 달에 여러 번 오면 여러 건)와 재진(= 접수 건수 − 신환)은 visits, 신환은 사람 수(spec ai-report-stats REQ-2004)
const TOTALS = [
  ['patients', '접수 건수', 'visits'],
  ['newPatients', '신환', 'count'],
  ['returning', '재진', 'visits'],
] as const

const GROUP_FIELDS = [
  ['patients', '환자'],
  ['newPatients', '신환'],
  ['returning', '재진'],
] as const

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

// 환자 수 큰 순, 같으면 열쇠 글자 순
function topBy<T extends { patients: number }>(items: readonly T[], keyOf: (item: T) => string, limit: number): T[] {
  return [...items].sort((a, b) => b.patients - a.patients || byText(keyOf(a), keyOf(b))).slice(0, limit)
}

// 그 달 값: 달이 없으면 null, 있으면 pick(없는 항목은 pick이 처방·동네는 0, 묶음은 null을 준다)
function metric(id: string, label: string, kind: ReportMetric['kind'], months: readonly Month[], pick: (m: MonthPayload) => number | null): ReportMetric {
  const [selected, prev, lastYear] = months.map((m) => (m === null ? null : pick(m)))
  return { id, label, kind, values: { selected, prev, lastYear } }
}

function revisitRate(revisit: RevisitPayload, within: 'within7' | 'within14'): number | null {
  const count = revisit[within]
  return count === null || revisit.cohort === 0 ? null : count / revisit.cohort
}

// 지금 묶음의 이름. 자기 열쇠(Object.hasOwn)로 있고 빈 글자가 아닐 때만, 아니면 null(그 열쇠는 지표가 아니다)
function currentGroupName(groupNames: Record<string, string>, id: string): string | null {
  const name = Object.hasOwn(groupNames, id) ? groupNames[id] : undefined
  return typeof name === 'string' && name !== '' ? name : null
}

// 달마다 열쇠 → 항목 찾기표. 고른 달·비교 달 어디서든 (달, 열쇠)로 찾는다
function lookup<T>(months: readonly Month[], listOf: (m: MonthPayload) => readonly T[], keyOf: (item: T) => string) {
  const tables = new Map(months.map((m) => [m, new Map(m === null ? [] : listOf(m).map((item) => [keyOf(item), item]))]))
  return (m: MonthPayload, key: string): T | undefined => tables.get(m)?.get(key)
}

export function buildReportInput(months: ValidReportMonths): ReportInput {
  const { selected, prev, lastYear, groupNames } = months
  const all: Month[] = [selected, prev, lastYear]
  const present = all.filter((m): m is MonthPayload => m !== null)
  const metrics: ReportMetric[] = []

  for (const [field, label, kind] of TOTALS) {
    metrics.push(metric(`total.${field}`, label, kind, all, (m) => m.totals[field]))
  }
  for (const [within, days] of [['within7', 7], ['within14', 14]] as const) {
    metrics.push(metric(`revisit.${within}`, `신환 ${days}일 재방문율`, 'rate', all, (m) => revisitRate(m.revisit, within)))
  }

  // 처방 그룹: 세 달에 나온 id의 합집합 가운데 지금 묶음 이름이 있는 것만, id 순. 그 달 줄에 그 열쇠가 없으면 null
  const findGroup = lookup(all, (m) => m.groups, (g) => g.id)
  const groupIds = [...new Set(present.flatMap((m) => m.groups.map((g) => g.id)))].sort(byText)
  for (const id of groupIds) {
    const name = currentGroupName(groupNames, id)
    if (name === null) continue
    for (const [field, label] of GROUP_FIELDS) {
      metrics.push(metric(`group:${id}.${field}`, `처방 그룹 '${name}' ${label}`, 'count', all, (m) => findGroup(m, id)?.[field] ?? null))
    }
  }

  // 처방: 고른 달 상위 TOP_RX개, 이름은 고른 달 것. 그 이름이 빈 글자이거나 빈칸뿐이면 코드를 쓴다(이름이 있으면 자르지 않고 그대로)
  const findRx = lookup(all, (m) => m.rx, (r) => r.code)
  for (const r of topBy(selected.rx, (item) => item.code, TOP_RX)) {
    const name = r.name.trim() === '' ? r.code : r.name
    metrics.push(metric(`rx:${r.code}`, `처방 '${name}' 환자`, 'count', all, (m) => findRx(m, r.code)?.patients ?? 0))
  }

  // 동네: 고른 달 상위 TOP_REGIONS개
  const findRegion = lookup(all, (m) => m.regions, (r) => r.name)
  for (const r of topBy(selected.regions, (item) => item.name, TOP_REGIONS)) {
    metrics.push(metric(`region:${r.name}`, `동네 '${r.name}' 환자`, 'count', all, (m) => findRegion(m, r.name)?.patients ?? 0))
  }

  const month = selected.month
  return {
    month,
    partial: selected.partial,
    prevMonth: addMonths(month, -1),
    lastYearMonth: addMonths(month, -12),
    hasPrev: prev !== null,
    hasLastYear: lastYear !== null,
    metrics,
  }
}

// JSON.stringify(input)의 UTF-8 SHA-256, 소문자 16진수 64자. 브라우저·Node 둘 다 globalThis.crypto.subtle이 있다
export async function reportFingerprint(input: ReportInput): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(input)))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
