import { addMonths } from '@/lib/analytics/dates'
import { VISIT_HOURS, hourName } from '@/lib/analytics/visitHours'
import type { ReportInput, ReportMetric } from '@/types/aiReport'
import type { MonthPayload, MonthSections, RevisitPayload } from '@/types/payload'

// AI에게 보낼 숫자 묶음(spec ai-report design.md '지표 목록'). 순수 함수만 — 네트워크·DB·SDK·node 모듈 없음.
// 순서가 곧 지문이다: 지표 차례와 객체 열쇠 차례를 늘 같게 만들고, 정렬은 글자 코드 비교(a < b)로 한다(localeCompare는 실행 환경마다 다를 수 있다).
// null과 0을 가른다: 달 자체가 없으면 null, 자료가 있는 달에 그 처방·동네가 없으면 0.
// 묶음은 지금 묶음(groupNames)만 쓰고, 그 달 줄에 그 열쇠가 없으면 null이다 — 달 줄만으로는 '0명'과 '그 묶음으로 세지 않음'을 가를 수 없다(spec ai-report-stats REQ-2003)
// 세 칸(연령대·보험·동네·요일·시간·원장님, spec stats-bit-ai REQ-2904)은 고른 달에 sections가 있을 때만 지금 지표 뒤에 더한다 — 없으면 입력·지문이 이 기능 전과 같다

export const TOP_RX = 30
export const TOP_REGIONS = 20
export const TOP_INSURANCE = 10

export type ValidReportMonths = {
  selected: MonthPayload // validateMonthPayload를 통과한 것
  prev: MonthPayload | null // 없거나 검사를 못 넘으면 null
  lastYear: MonthPayload | null
  groupNames: Record<string, string>
  // 달마다 세 칸 합계. validateMonthSections를 통과하고 그 달 줄과 같은 달인 것만, 아니면 null. 칸이 없으면 세 달 모두 없음
  sections?: { selected: MonthSections | null; prev: MonthSections | null; lastYear: MonthSections | null }
}

type Month = MonthPayload | null
type Sections = MonthSections | null

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

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'] as const // weekday:1 = 월 … weekday:7 = 일

// 원장님 실환자·신환은 사람 수, 매출은 원(수납일 기준 총진료비 합, 통계 화면 원장님별과 같다)
const DOCTOR_FIELDS = [
  ['patients', '실환자', 'count'],
  ['newPatients', '신환', 'count'],
  ['amount', '매출', 'won'],
] as const

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const sumOf = (values: readonly number[]) => values.reduce((total, value) => total + value, 0)

// 환자 수 큰 순, 같으면 열쇠 글자 순
function topBy<T extends { patients: number }>(items: readonly T[], keyOf: (item: T) => string, limit: number): T[] {
  return [...items].sort((a, b) => b.patients - a.patients || byText(keyOf(a), keyOf(b))).slice(0, limit)
}

// 세 칸 묶음 줄: 명 큰 순, 같으면 이름 글자 순
function byPeople<T extends { name: string; people: number }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => b.people - a.people || byText(a.name, b.name))
}

// 그 달 값: 달이 없으면 null, 있으면 pick(없는 항목은 pick이 처방·동네는 0, 묶음은 null을 준다)
function metric<M>(id: string, label: string, kind: ReportMetric['kind'], months: readonly (M | null)[], pick: (m: M) => number | null): ReportMetric {
  const [selected, prev, lastYear] = months.map((m) => (m === null ? null : pick(m)))
  return { id, label, kind, values: { selected, prev, lastYear } }
}

function revisitRate(revisit: RevisitPayload, within: 'within7' | 'within14'): number | null {
  const count = revisit[within]
  return count === null || revisit.cohort === 0 ? null : count / revisit.cohort
}

// 하루 평균 접수: 합 ÷ 문 연 날 수를 소수 둘째 자리에서 반올림해 첫째 자리까지 남긴다(AC-2904.4). 나누는 수가 0이면 null.
// 통계 화면 averageText와 같은 규칙(같은 EPSILON)이라 근거 줄 글자가 진짜 평균을 한 번만 반올림한 값과 늘 같다. 금액이 아니라 반올림 금지 규칙과 부딪히지 않는다
const EPSILON = 1e-9 // 1.45 × 10 = 14.4999… 같은 부동소수 오차가 반올림을 바꾸지 않게
function dailyAverage(sum: number, days: number): number | null {
  return days > 0 ? Math.round((sum / days) * 10 + EPSILON) / 10 : null
}

// 지금 묶음의 이름. 자기 열쇠(Object.hasOwn)로 있고 빈 글자가 아닐 때만, 아니면 null(그 열쇠는 지표가 아니다)
function currentGroupName(groupNames: Record<string, string>, id: string): string | null {
  const name = Object.hasOwn(groupNames, id) ? groupNames[id] : undefined
  return typeof name === 'string' && name !== '' ? name : null
}

// 달마다 열쇠 → 항목 찾기표. 고른 달·비교 달 어디서든 (달, 열쇠)로 찾는다
function lookup<M extends object, T>(months: readonly (M | null)[], listOf: (m: M) => readonly T[], keyOf: (item: T) => string) {
  const tables = new Map(months.map((m) => [m, new Map(m === null ? [] : listOf(m).map((item) => [keyOf(item), item]))]))
  return (m: M, key: string): T | undefined => tables.get(m)?.get(key)
}

// 세 칸 지표(AC-2904.2). 목록과 이름은 고른 달 것, 세 달 값은 그 달 sections에서 찾는다(AC-2904.3)
function sectionMetrics(selected: MonthSections, all: readonly Sections[]): ReportMetric[] {
  const metrics: ReportMetric[] = []

  // 연령대 열 줄(0명 줄도 있다): 늘 그 달 값
  const findAge = lookup(all, (s) => s.mix.age, (row) => row.name)
  for (const row of selected.mix.age) {
    metrics.push(metric(`age:${row.name}`, `연령대 '${row.name}' 환자`, 'count', all, (s) => findAge(s, row.name)?.people ?? null))
  }

  // 보험 상위 TOP_INSURANCE줄·동네 모두. 5명 미만 줄은 저장하지 않아 그 달에 줄이 없으면 0이 아니라 null(5명 미만이거나 없음)
  const findInsurance = lookup(all, (s) => s.mix.insurance, (row) => row.name)
  for (const row of byPeople(selected.mix.insurance).slice(0, TOP_INSURANCE)) {
    metrics.push(metric(`insurance:${row.name}`, `보험 '${row.name}' 환자`, 'count', all, (s) => findInsurance(s, row.name)?.people ?? null))
  }
  const findTown = lookup(all, (s) => s.mix.town, (row) => row.name)
  for (const row of byPeople(selected.mix.town)) {
    metrics.push(metric(`town:${row.name}`, `동네 '${row.name}' 환자`, 'count', all, (s) => findTown(s, row.name)?.people ?? null))
  }

  // 요일 = 그 요일 접수 합 ÷ 그 요일 문 연 날 수, 시간 = 그 시 접수 합 ÷ 일곱 요일 문 연 날 수의 합
  for (const [i, name] of WEEKDAYS.entries()) {
    metrics.push(metric(`weekday:${i + 1}`, `요일 '${name}' 하루 평균 접수`, 'average', all, (s) => dailyAverage(s.hours.weekdays[i], s.hours.openDays[i])))
  }
  for (const [i, hour] of VISIT_HOURS.entries()) {
    metrics.push(metric(`hour:${hour}`, `'${hourName(hour)}' 하루 평균 접수`, 'average', all, (s) => dailyAverage(s.hours.hours[i], sumOf(s.hours.openDays))))
  }

  // 원장님: 고른 달 차례. 그 달에 그 원장님 줄이 없으면 그 달 환자가 없다는 뜻이라 0.
  // 그 달 원장님 줄이 하나도 없으면(한 분만 진료해 화면이 표를 그리지 않음) 그 한 분이 누군지 몰라 0이 아니라 null
  const findDoctor = lookup(all, (s) => s.doctors, (row) => row.name)
  for (const doctor of selected.doctors) {
    for (const [field, label, kind] of DOCTOR_FIELDS) {
      metrics.push(
        metric(`doctor:${doctor.name}.${field}`, `원장님 '${doctor.name}' ${label}`, kind, all, (s) =>
          s.doctors.length === 0 ? null : (findDoctor(s, doctor.name)?.[field] ?? 0),
        ),
      )
    }
  }
  return metrics
}

export function buildReportInput(months: ValidReportMonths): ReportInput {
  const { selected, prev, lastYear, groupNames, sections } = months
  const all: Month[] = [selected, prev, lastYear]
  const present = all.filter((m): m is MonthPayload => m !== null)
  const metrics: ReportMetric[] = []

  // 재진은 지금 뜻(= 접수 건수 − 신환 − 알 수 없음, 90일초진 포함)으로 넣는다. 새 도우미 달(first90 있음)과 옛 달을 견줘도 같은 뜻(spec first90 AC-4402.6)
  for (const [field, label, kind] of TOTALS) {
    const pick = field === 'returning' ? (m: MonthPayload) => m.totals.returning + (m.totals.first90 ?? 0) : (m: MonthPayload) => m.totals[field]
    metrics.push(metric(`total.${field}`, label, kind, all, pick))
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

  // 세 칸: 고른 달에 sections가 있을 때만(AC-2904.1)
  if (sections !== undefined && sections.selected !== null) {
    metrics.push(...sectionMetrics(sections.selected, [sections.selected, sections.prev, sections.lastYear]))
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
