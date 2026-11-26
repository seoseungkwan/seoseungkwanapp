import type { GEvent, GKind, GLook, GStaff } from '@/lib/calendar/gshapes'
import { parseGoogleEvent } from '@/lib/calendar/gtitle'
import { localStamp } from '@/lib/gcal/deps'

// 시행자·종류 화면 종류 칸의 보기 상자(spec google-link REQ-8552 AC-8552.2, design.md 21-9 · 시안 calendar.html ?s=colors-reread). 순수 함수.
// 그 병원 종류 이름으로 보기 제목을 만들고, 결과는 실제 알아보기(parseGoogleEvent — 오늘 10:00, 색 없음, 이은 날 = 오늘이라 '앞으로')가 고른 종류 이름이다.
// 첫째 종류는 차례만으로 골라져 보기가 되지 않으므로 같은 꼴의 '둘째'(하나뿐이면 그것)를 쓴다:
//   1. 이름에 `{N}분`과 끝 `({표시})`(시행자 목록 표시)가 함께 있는 종류 → `1234 홍길동 {N}분 {바탕 낱말} ({표시})`, 일정 길이 N분
//   2. 같은 꼴이고 N이 1과 다른 첫 종류 → `1234 홍길동 {바탕 낱말} ({표시})`, 일정 길이 N2분(제목에 길이가 없어 화면에 '구글 일정 N2분')
//   3. 충격파 종류 가운데 이름에 1000의 배수가 든 것 → `1234 홍길동({S/1000}천`
// 종류를 못 고르면 그 줄을 뺀다. 이름에 길이·표시·타수가 하나도 없는 병원(지금 기본 종류)은 빈 목록 = 상자 없음.
// 차트번호·이름은 시안의 지어낸 값이다

export type KindExample = {
  /** 보기 구글 제목 */
  title: string
  /** 제목에 길이가 없을 때만: 보기 구글 일정 길이(분) */
  eventLen: number | null
  /** 알아보기가 고른 종류 이름 */
  kind: string
}

const CHART_NAME = '1234 홍길동'
const START = 600 // 10:00

/** 바탕 낱말(design.md 21-1과 같은 셈): 길이·타수 숫자·괄호 한 글자 표시·빈칸을 뗀 글, 두 글자 이상일 때만. `도수 30분(호)` → `도수` */
function baseWord(name: string): string | null {
  const b = name
    .replace(/\d+\s*[분타천]?/g, '')
    .replace(/\([^\s()]\)/g, '')
    .replace(/\s/g, '')
  return [...b].length >= 2 ? b : null
}

/** 충격파 종류: 이름이나 알아볼 글에 '충격파', 또는 알아볼 글에 '타'가 든 종류(design.md 21-1) */
const isShock = (k: GKind) => k.name.includes('충격파') || k.words.some((w) => w.includes('충격파') || w.includes('타'))

/** 같은 꼴 가운데 둘째(하나뿐이면 그것) */
const second = <T>(list: readonly T[]): T | undefined => list[1] ?? list[0]

type Timed = { minutes: number; mark: string; base: string }

/** 이름에 `{N}분`과 끝 `({시행자 목록 표시})`가 함께 있는 종류 */
function timedOf(kind: GKind, marks: ReadonlySet<string>): Timed | null {
  const name = kind.name.trim()
  const end = /\(([^\s()])\)$/.exec(name)
  const len = /(?<!\d)(\d+)\s*분/.exec(name)
  const base = baseWord(name)
  if (!end || !marks.has(end[1]!) || !len || base === null) return null
  return { minutes: Number(len[1]), mark: end[1]!, base }
}

/** 충격파 종류 이름에 든 1000의 배수 */
function strokesOf(kind: GKind): number | null {
  if (!isShock(kind)) return null
  for (const m of kind.name.matchAll(/(?<!\d)(\d+)(?!\d)/g)) {
    const n = Number(m[1])
    if (n > 0 && n % 1000 === 0) return n
  }
  return null
}

export function kindExamples(kinds: readonly GKind[], staff: readonly GStaff[], look: GLook, today: string): KindExample[] {
  const marks = new Set(staff.map((s) => s.mark))
  const pick = (title: string, minutes: number): string | null => {
    const ev: GEvent = {
      id: 'sskexample0000000000000000000000',
      status: 'confirmed',
      summary: title,
      description: '',
      allDay: false,
      start: localStamp(today, START),
      end: localStamp(today, START + minutes),
      colorId: null,
      updated: '',
      recurring: false,
    }
    const p = parseGoogleEvent(ev, { staff, kinds, look, people: staff.map(({ id, name }) => ({ id, name })), arrival: 'off', linkedOn: today })
    if (p.type === 'appt') return p.appt.kindName
    if (p.type === 'fix') return p.fix.guess.kindName
    return null
  }
  const out: KindExample[] = []
  const add = (title: string, minutes: number, eventLen: number | null) => {
    const kind = pick(title, minutes)
    if (kind) out.push({ title, eventLen, kind })
  }

  const timed = kinds.map((k) => timedOf(k, marks)).filter((t): t is Timed => t !== null)
  const k1 = second(timed)
  if (k1) {
    add(`${CHART_NAME} ${k1.minutes}분 ${k1.base} (${k1.mark})`, k1.minutes, null)
    const k2 = timed.find((t) => t.minutes !== k1.minutes)
    if (k2) add(`${CHART_NAME} ${k2.base} (${k2.mark})`, k2.minutes, k2.minutes)
  }
  const strokes = kinds.map(strokesOf).filter((n): n is number => n !== null)
  const k3 = second(strokes)
  if (k3 !== undefined) add(`${CHART_NAME}(${k3 / 1000}천`, 15, null)
  return out
}
