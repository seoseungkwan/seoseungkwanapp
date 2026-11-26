import { isYmd } from '@/lib/analytics/dates'
import type { OffLine, OffPerson } from './gshapes'

// 하루 종일 휴무 줄 '{이름}, {이름} {끝 글}' 읽기·만들기(spec google-link REQ-8522, design.md 12-2). 순수 함수다.
// 사람 목록(people)은 calendar_off_names()의 원장님·직원 — 웹앱이 맡는 사람만 더하거나 빼고, 목록 밖 이름(구글에서 직접 적은 이름)은 남긴다

const NAME_SPLIT = /[,，、·\s]+/

const unique = (names: readonly string[]) => [...new Set(names.map((n) => n.trim()).filter(Boolean))]

/** 제목이 off 줄이면 이름들(제목 차례), 아니면 null. 끝 글만 있는 제목은 빈 목록 */
function offNames(title: string, word: string): string[] | null {
  const t = title.replace(/\s+/g, ' ').trim()
  const w = word.trim()
  if (!w) return null
  if (t === w) return []
  if (!t.endsWith(` ${w}`)) return null
  return unique(t.slice(0, -(w.length + 1)).split(NAME_SPLIT))
}

/** 하루 종일 일정 제목 읽기. 끝 글이 word가 아니면 null(종일 메모). 목록 이름과 맞춘 사람 + 못 찾은 이름 */
export function parseOffTitle(title: string, word: string, people: readonly OffPerson[]): { people: OffPerson[]; unknown: string[] } | null {
  const names = offNames(title, word)
  if (names === null) return null
  const found: OffPerson[] = []
  const unknown: string[] = []
  for (const name of names) {
    const p = people.find((x) => x.name === name)
    if (!p) unknown.push(name)
    else if (!found.some((x) => x.id === p.id)) found.push({ id: p.id, name: p.name })
  }
  return { people: found, unknown }
}

/**
 * 그날 새 off 줄 제목. names = 그날 하루 종일 쉬는 사람(웹앱 차례), current = 지금 구글 off 줄 제목(없으면 null).
 * 새로 든 이름을 앞에(names 차례), 남은 이름은 지금 제목 차례대로. people 밖 이름은 지우지 않고 지금 자리에 남긴다.
 * 아무도 없으면 '' (그 줄을 지움)
 */
export function composeOffTitle(names: readonly string[], current: string | null, word: string, people: readonly OffPerson[]): string {
  const known = new Set(people.map((p) => p.name))
  const want = unique(names)
  const now = (current === null ? null : offNames(current, word)) ?? []
  const kept = now.filter((n) => want.includes(n) || !known.has(n))
  const fresh = want.filter((n) => !now.includes(n))
  const all = [...fresh, ...kept]
  return all.length ? `${all.join(', ')} ${word.trim()}` : ''
}

/** 웹앱이 off 줄에서 맡는 사람. '예약 시행자가 아닌 직원도'가 꺼지면 예약에 보이는 시행자만('m-' 직원·안 보이는 사람 뺌) */
export function offScope(people: readonly OffPerson[], offAllStaff: boolean, visibleStaffIds: readonly string[]): OffPerson[] {
  return offAllStaff ? [...people] : people.filter((p) => visibleStaffIds.includes(p.id))
}

/** 그날 하루 종일 'off' 줄(반차 빼고)의 맡는 사람 이름. 이름은 목록 이름, 같은 사람은 한 번 */
export function offDayNames(lines: readonly OffLine[], day: string, scope: readonly OffPerson[]): string[] {
  const names: string[] = []
  for (const l of lines) {
    if (l.day !== day || l.type !== 'off' || l.part || l.staffId === null) continue
    const p = scope.find((x) => x.id === l.staffId)
    if (p) names.push(p.name)
  }
  return unique(names)
}

/** 그날 off 줄 일정 id = 'sskoff' + 병원 id 32자(빼기 없음) + YYYYMMDD. 구글 일정 id 글자(base32hex 0-9 a-v)만 */
export function offEventId(hospitalId: string, day: string): string {
  const hex = hospitalId.toLowerCase().replace(/-/g, '')
  if (!/^[0-9a-f]{32}$/.test(hex)) throw new RangeError('병원 id는 uuid로 주세요')
  if (!isYmd(day)) throw new RangeError(`날짜는 'YYYY-MM-DD'로 주세요: ${day}`)
  return `sskoff${hex}${day.replace(/-/g, '')}`
}
