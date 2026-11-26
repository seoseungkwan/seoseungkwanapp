import { addDays, compareYmd, diffDays, isYmd } from '@/lib/analytics/dates'
import { parseOffTitle } from './goff'
import { colorFromId } from './gshapes'
import type {
  FixChoice,
  FixGuess,
  FixNeed,
  FixReason,
  GColor,
  GEvent,
  GHow,
  GKind,
  GLook,
  GParsed,
  GParsedFix,
  GStaff,
  OffPerson,
  ParseCtx,
  TitleAppt,
} from './gshapes'
import { josa } from './josa'

// 구글 제목 알아보기 · 웹앱 → 구글 제목 꼴 · 고쳐야 할 까닭 글과 고르기(spec google-link design.md 13절·21-1·21-6, REQ-8520·REQ-8521·REQ-8543·REQ-8548).
// 순수 함수다. 시각은 구글 코드가 준 한국 시각 글자('YYYY-MM-DDTHH:mm', 하루 종일은 'YYYY-MM-DD')만 읽는다.
// 알아보는 차례: ① 맨 앞 숫자 = 차트번호 ② 끝 괄호 한 글자 = 시행자 표시(②-1 그 뒤 글 = 메모) ③ 그 밖 괄호 안 글 = 메모(아는 표시 한 글자 괄호는 뺌)
// ④ 숫자+분 버림 ⑤ 종류 글(긴 것부터, 한 글자 글은 숫자 바로 뒤만, 괄호 안도 봄, 바탕 낱말 포함 — 같은 글의 종류가 여럿이면 이름·표시·길이·타수로 고름)
// ⑤-1 종류 글 없이 타수만 → 충격파 종류 ⑥ 첫 한글 낱말 = 이름 ⑦ 괄호 밖 모르는 글 → bad-kind
// ⑧ 시행자 글 없음 → 색 짐작 ⑨ 종류 글 없음 → 색·설정 ⑩ 다 없음 → not-appt ⑪ 취소 색·변경 색은 표시이고 색 짐작 안 함

const DAY_MIN = 1440
const MAX_LEN = 240
const NAME_MAX = 20
const CHART_MAX = 10
const MEMO_MAX = 100
const ALLDAY_MEMO_MAX = 20

// ── 도착 글 ─────────────────────────────────────────────

const ARRIVAL = { came: '왔음 ', noshow: '안 옴 ' } as const

/** 제목 앞의 '왔음 '·'안 옴 '을 뗀다 */
export function stripArrival(title: string): string {
  for (const p of Object.values(ARRIVAL)) if (title.startsWith(p)) return title.slice(p.length)
  return title
}

/** 제목 앞 도착 글만 바꾼다(null이면 뗌) */
export function withArrival(title: string, arrival: 'came' | 'noshow' | null): string {
  const base = stripArrival(title)
  return arrival ? `${ARRIVAL[arrival]}${base}` : base
}

// ── 웹앱 → 구글 제목 꼴 ─────────────────────────────────

/**
 * `{차트번호} {이름} {종류} {길이}분 ({표시}) {메모}`. 길이·메모는 설정대로, 차트번호 없으면 이름부터, 시행자 없으면 괄호 없음.
 * 종류 이름·시행자 표시는 지금 목록 값(없으면 예약에 남은 값). arrival을 주면 앞에 '왔음 '·'안 옴 '.
 * 겹쳐 적지 않기(design.md 21-6): 시행자가 있으면 종류 이름 끝 `({시행자 목록의 표시})`를 떼고, 이름에 그 길이 `{N}분`이 있으면 길이를 다시 붙이지 않는다
 */
export function formatGoogleTitle(
  appt: TitleAppt,
  look: Pick<GLook, 'titleLen' | 'titleMemo'>,
  kinds: readonly Pick<GKind, 'id' | 'name'>[],
  staff: readonly Pick<GStaff, 'id' | 'mark'>[],
  arrival: 'came' | 'noshow' | null = null,
): string {
  let kind = kinds.find((k) => k.id === appt.kindId)?.name ?? appt.kindName
  const mark = appt.staffId === null ? null : (staff.find((s) => s.id === appt.staffId)?.mark ?? appt.staffMark)
  if (mark) {
    const end = /\s*\(([^\s()])\)$/.exec(kind)
    if (end && staff.some((s) => s.mark === end[1])) kind = kind.slice(0, end.index)
  }
  const len = look.titleLen && !hasMinutes(kind, appt.len) ? `${appt.len}분` : null
  let title = [appt.chart, appt.name, kind, len].filter(Boolean).join(' ')
  if (mark) title += ` (${mark})`
  const memo = appt.memo.replace(/\s+/g, ' ').trim()
  if (look.titleMemo && memo) title += ` ${memo}`
  return withArrival(title, arrival)
}

// ── 제목 읽기 ───────────────────────────────────────────

type KindWord = { word: string; kinds: GKind[] }
type KindHit = { kinds: GKind[]; index: number; length: number; digits: boolean }

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const chars = (s: string) => [...s].length
const clip = (s: string, n: number) => [...s].slice(0, n).join('').trim()
const noSpace = (s: string) => s.replace(/\s/g, '')

/** 글에 `{N}분`이 있음(앞에 숫자가 붙지 않은 N) */
function hasMinutes(text: string, n: number): boolean {
  return new RegExp(`(?<!\\d)${n}\\s*분`).test(text)
}

/** 바탕 낱말: 길이·타수 숫자·괄호 한 글자 표시·빈칸을 뗀 글(두 글자 이상일 때만). `도수 30분(호)` → `도수` */
function baseWord(word: string): string | null {
  const b = noSpace(word.replace(/\d+\s*[분타천]?/g, '').replace(/\([^\s()]\)/g, ''))
  return chars(b) >= 2 ? b : null
}

const SHOCK_TAIL = '충격파'

/** 알아볼 글(종류 words + 종류 이름 + 그 바탕 낱말) 긴 것부터. 같은 길이는 종류 차례. 같은 글을 가진 종류는 한 덩이(종류 차례) */
function kindWords(kinds: readonly GKind[]): KindWord[] {
  const byWord = new Map<string, KindWord & { i: number }>()
  for (const kind of kinds) {
    const own = unique([...kind.words, kind.name])
    const bases = own.map(baseWord).filter((b): b is string => b !== null)
    // design.md 21-12: '체외충격파'처럼 '충격파'로 끝나는 더 긴 바탕 낱말이면 '충격파'도 그 종류 글
    const shockTail = bases.some((b) => b.endsWith(SHOCK_TAIL) && chars(b) > chars(SHOCK_TAIL)) ? [SHOCK_TAIL] : []
    for (const w of unique([...own, ...bases, ...shockTail])) {
      const hit = byWord.get(w)
      if (!hit) byWord.set(w, { word: w, kinds: [kind], i: byWord.size })
      else if (!hit.kinds.includes(kind)) hit.kinds.push(kind)
    }
  }
  return [...byWord.values()].sort((a, b) => chars(b.word) - chars(a.word) || a.i - b.i)
}

function unique(words: readonly string[]): string[] {
  return [...new Set(words.map((w) => w.trim()).filter(Boolean))]
}

/** 한 글자 글('타')은 숫자 바로 뒤만(그 숫자까지 한 덩이). 처음 맞은 글을 가진 종류가 모두 후보 */
function findKind(text: string, words: readonly KindWord[]): KindHit | null {
  for (const { kinds, word } of words) {
    if (chars(word) === 1) {
      const m = new RegExp(`\\d+${escapeRe(word)}`).exec(text)
      if (m) return { kinds, index: m.index, length: m[0].length, digits: true }
    } else {
      const i = text.indexOf(word)
      if (i >= 0) return { kinds, index: i, length: word.length, digits: false }
    }
  }
  return null
}

/** 충격파 종류: 이름이나 알아볼 글에 '충격파', 또는 알아볼 글에 '타'가 든 종류 */
const isShock = (k: GKind) => k.name.includes('충격파') || k.words.some((w) => w.includes('충격파') || w.includes('타'))

/** 타수 S와 메모에서 그 조각을 찾는 꼴 */
type Strokes = { n: number; piece: RegExp }

/** 타수(design.md 21-1): `{N}타` → `{N}천`(뒤에 글자·숫자가 붙지 않음) ×1000 → 충격파 종류 이름에 든 수와 같은 맨 숫자, 이 차례로 처음 맞는 것 */
function readStrokes(text: string, kinds: readonly GKind[]): Strokes | null {
  const ta = /(?<!\d)(\d+)타/.exec(text)
  if (ta) return { n: Number(ta[1]), piece: new RegExp(`(?<!\\d)${ta[1]}타`) }
  const cheon = /(?<!\d)(\d+)천(?![\p{L}\p{N}])/u.exec(text)
  if (cheon) return { n: Number(cheon[1]) * 1000, piece: new RegExp(`(?<!\\d)${cheon[1]}천(?![\\p{L}\\p{N}])`, 'u') }
  const nums = new Set(kinds.filter(isShock).flatMap((k) => (k.name.match(/\d+/g) ?? []).map(Number)))
  for (const m of text.matchAll(/(?<![\p{L}\p{N}])(\d+)(?![\p{L}\p{N}])/gu)) {
    if (nums.has(Number(m[1]))) return { n: Number(m[1]), piece: new RegExp(`(?<![\\p{L}\\p{N}])${m[1]}(?![\\p{L}\\p{N}])`, 'u') }
  }
  return null
}

/** 메모의 타수 조각 → `{S}타`. 고른 종류 이름에 S가 있으면 뺀다(조각 밖 글은 그대로) */
function strokeMemo(memo: string, st: Strokes | null, kind: GKind | null): string {
  if (!st || !st.piece.test(memo)) return memo
  const inName = kind !== null && new RegExp(`(?<!\\d)${st.n}(?!\\d)`).test(kind.name)
  return memo
    .replace(st.piece, inName ? '' : `${st.n}타`)
    .replace(/\s+/g, ' ')
    .trim()
}

/** 후보 고르는 데 쓰는 제목 글: flat = 차트번호 뗀 제목(빈칸 없음), mark = 제목 표시(없으면 색 짐작 표시), len = 첫 `{N}분`(없으면 구글 일정 길이), strokes = 타수 */
type PickHints = { flat: string; mark: string | null; len: number; strokes: number | null }

/** 같은 낱말의 종류가 여럿이면: ⓪ 제목에 이름이 그대로(긴 이름) → 아니면 표시·길이·타수가 이름과 가장 많이 맞는 것. 같으면 종류 차례가 앞 */
function pickKind(cands: readonly GKind[], h: PickHints): GKind {
  if (cands.length === 1) return cands[0]
  let named: GKind | null = null
  for (const k of cands) {
    const n = noSpace(k.name)
    if (n && h.flat.includes(n) && (!named || chars(n) > chars(noSpace(named.name)))) named = k
  }
  if (named) return named
  const strokesRe = h.strokes === null ? null : new RegExp(`(?<!\\d)${h.strokes}(?!\\d)`)
  const score = (k: GKind) =>
    Number(h.mark !== null && k.name.includes(`(${h.mark})`)) + Number(hasMinutes(k.name, h.len)) + Number(strokesRe?.test(k.name) ?? false)
  let best = cands[0]
  let top = score(best)
  for (const k of cands.slice(1)) {
    const sc = score(k)
    if (sc > top) {
      best = k
      top = sc
    }
  }
  return best
}

type TitleRead = {
  chart: string | null
  chartTooLong: boolean
  mark: GStaff | null
  unknownMark: string | null
  kind: GKind | null
  name: string | null
  leftover: string
  /** 메모 조각: 괄호 밖 남은 글(종류를 찾았을 때)·숫자+한 글자 종류 글·괄호 안 글 */
  memoHead: string[]
  /** 시행자 표시 뒤 글 */
  after: string
  /** 타수(메모의 그 조각은 `{S}타`로 바꿈) */
  strokes: Strokes | null
}

/** hint: len = 구글 일정 길이, colorMark = 색으로 짐작한 시행자 표시(종류 고르기 점수에만) */
function readTitle(summary: string, ctx: Pick<ParseCtx, 'staff' | 'kinds' | 'arrival'>, hint: { len: number; colorMark: string | null }): TitleRead {
  let s = summary.replace(/\s+/g, ' ').trim()
  if (ctx.arrival === 'title') s = stripArrival(s).trim()

  // ① 맨 앞 숫자 = 차트번호(이름과 붙어도)
  const cm = /^\d+/.exec(s)
  const chart = cm ? cm[0] : null
  if (chart) s = s.slice(chart.length)
  const orig = s

  // ② 끝 괄호 한 글자 = 시행자 표시. 아는 표시가 있으면 그 마지막, 없으면 맨 끝 한 글자 괄호를 모르는 표시로
  const marks = new Map(ctx.staff.map((st) => [st.mark, st]))
  const groups = [...s.matchAll(/\(([^\s()])\)/g)]
  const known = groups.filter((g) => marks.has(g[1]))
  let mark: GStaff | null = null
  let unknownMark: string | null = null
  let after = ''
  const hit = known.at(-1)
  if (hit && hit.index !== undefined) {
    mark = marks.get(hit[1]) ?? null
    after = s.slice(hit.index + hit[0].length).trim()
    s = s.slice(0, hit.index)
  } else {
    const last = groups.at(-1)
    if (last && last.index !== undefined && s.slice(last.index + last[0].length).trim() === '') {
      unknownMark = last[1]
      s = s.slice(0, last.index)
    }
  }

  // ③ 그 밖 괄호 안 글(닫는 괄호 없어도) = 메모. 아는 시행자 표시 한 글자뿐인 괄호(끝 표시 앞의 `(호)`)는 메모가 아니다
  const parens: string[] = []
  s = s.replace(/\(([^()]*)(?:\)|$)/g, (_m, inner: string) => {
    const t = inner.trim()
    if (t && !(chars(t) === 1 && marks.has(t))) parens.push(t)
    return ' '
  })

  // ④ 숫자+분 = 길이 글이라 버림(첫 길이 글은 종류 고르기에 씀)
  const firstLen = /(\d+)\s*분/.exec(orig)
  s = s.replace(/\d+\s*분/g, ' ')

  // ⑤ 종류 글: 괄호 밖 먼저, 없으면 괄호 안. ⑤-1 종류 글이 없고 타수가 있으면 충격파 종류에서
  const words = kindWords(ctx.kinds)
  const strokes = readStrokes(orig, ctx.kinds)
  const hints: PickHints = {
    flat: noSpace(orig),
    mark: mark?.mark ?? unknownMark ?? hint.colorMark,
    len: firstLen ? Number(firstLen[1]) : hint.len,
    strokes: strokes?.n ?? null,
  }
  const head: string[] = []
  let kind: GKind | null = null
  const main = findKind(s, words)
  if (main) {
    kind = pickKind(main.kinds, hints)
    if (main.digits) head.push(s.slice(main.index, main.index + main.length))
    s = `${s.slice(0, main.index)} ${s.slice(main.index + main.length)}`
  } else {
    const inParens = findKind(parens.join(' '), words)
    const shock = strokes ? ctx.kinds.filter(isShock) : []
    if (inParens) kind = pickKind(inParens.kinds, hints)
    else if (shock.length) kind = pickKind(shock, hints)
  }

  // ⑥ 첫 한글 낱말 = 이름(한글이 없으면 첫 글자 낱말)
  const nm = /[가-힣]+/.exec(s) ?? /\p{L}+/u.exec(s)
  const name = nm ? nm[0] : null
  if (nm) s = `${s.slice(0, nm.index)} ${s.slice(nm.index + nm[0].length)}`

  // ⑦ 괄호 밖에 남은 글(글자·숫자가 있는 덩이만)
  const leftover = s
    .split(' ')
    .filter((t) => /[\p{L}\p{N}]/u.test(t))
    .join(' ')
  if (kind && leftover) head.unshift(leftover)

  return {
    chart: chart && chart.length <= CHART_MAX ? chart : null,
    chartTooLong: !!chart && chart.length > CHART_MAX,
    mark,
    unknownMark,
    kind,
    name,
    leftover: kind ? '' : leftover,
    memoHead: [...head, ...parens],
    after,
    strokes,
  }
}

// ── 시각 ────────────────────────────────────────────────

const CLOCK = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/
const round5 = (n: number) => Math.round(n / 5) * 5

function clockOf(s: string): { day: string; min: number; hm: string } | null {
  const m = CLOCK.exec(s)
  if (!m || !isYmd(m[1])) return null
  return { day: m[1], min: Number(m[2]) * 60 + Number(m[3]), hm: `${m[2]}:${m[3]}` }
}

export type EventTimes = { day: string; start: number; len: number; minutes: number; gStart: string; gEnd: string }

/** 시간 일정의 웹앱 시각. 시작은 가까운 5분, 길이는 끝 − 시작을 가까운 5분(5분 아래면 5분), minutes = 구글 실제 길이. 시각이 없으면 null */
export function eventTimes(ev: Pick<GEvent, 'start' | 'end'>): EventTimes | null {
  const from = clockOf(ev.start)
  const to = clockOf(ev.end)
  if (!from || !to) return null
  const minutes = diffDays(from.day, to.day) * DAY_MIN + to.min - from.min
  return {
    day: from.day,
    start: Math.min(DAY_MIN - 5, round5(from.min)),
    len: Math.max(5, round5(minutes)),
    minutes,
    gStart: from.hm,
    gEnd: to.hm,
  }
}

// ── 알아보기 ────────────────────────────────────────────

const emptyGuess = (o: Partial<FixGuess>): FixGuess => ({
  chart: null,
  name: null,
  kindId: null,
  kindName: null,
  kindBy: null,
  staffId: null,
  staffName: null,
  staffMark: null,
  staffBy: null,
  memo: '',
  bad: null,
  needs: [],
  cancel: false,
  moved: false,
  gStart: '',
  gEnd: '',
  minutes: 0,
  people: [],
  ...o,
})

/** 구글 일정 하나를 웹앱 칸으로. 시간 일정은 예약 또는 고쳐야 할 것, 하루 종일은 off 줄·종일 메모 또는 고쳐야 할 것 */
export function parseGoogleEvent(ev: GEvent, ctx: ParseCtx): GParsed {
  return ev.allDay ? parseAllDay(ev, ctx) : parseTimed(ev, ctx)
}

function parseAllDay(ev: GEvent, ctx: ParseCtx): GParsed {
  const day = ev.start.slice(0, 10)
  const endDay = ev.end.slice(0, 10)
  const n = isYmd(day) && isYmd(endDay) ? diffDays(day, endDay) : 1
  const days = Array.from({ length: Math.max(1, n) }, (_, i) => addDays(day, i))
  const past = compareYmd(day, ctx.linkedOn) < 0
  const title = ev.summary.replace(/\s+/g, ' ').trim()
  const gColor = colorFromId(ev.colorId)
  const fix = (reason: FixReason, guess: FixGuess): GParsed => ({
    type: 'fix',
    past,
    fix: { reason, day, days, start: 0, len: DAY_MIN, allDay: true, gColor, guess },
  })

  const off = parseOffTitle(title, ctx.look.offWord, ctx.people)
  if (off) {
    if (off.unknown.length) return fix('off-name', emptyGuess({ people: off.people, bad: off.unknown.join(', '), needs: ['person'] }))
    return { type: 'off', past, days, people: off.people }
  }
  if (!title) return fix('not-appt', emptyGuess({ needs: ['what'] }))
  return { type: 'memo', past, days, memo: clip(title, ALLDAY_MEMO_MAX) }
}

function parseTimed(ev: GEvent, ctx: ParseCtx): GParsed {
  const { look } = ctx
  const { day, start, len, minutes, gStart, gEnd } = eventTimes(ev) ?? { day: ev.start.slice(0, 10), start: 0, len: 5, minutes: 0, gStart: '', gEnd: '' }
  const past = compareYmd(day, ctx.linkedOn) < 0
  const gColor = colorFromId(ev.colorId)

  // ⑪ 취소 색·변경 색은 표시이고, 그때는 색으로 짐작하지 않는다
  const cancel = gColor !== null && gColor === look.cancel
  const moved = !cancel && gColor !== null && gColor === look.change
  const canGuess = !cancel && !moved
  const colorKey: GColor | 'default' = gColor ?? 'default'
  // 일정 색을 쓰는 시행자(색 짐작은 그 사람이 꼭 한 명일 때만)
  const sameColor = canGuess && look.staffByColor && gColor !== null ? ctx.staff.filter((s) => s.color === gColor) : []

  const r = readTitle(ev.summary, ctx, { len, colorMark: sameColor.length === 1 ? sameColor[0].mark : null })

  // ⑤·⑦·⑨ 종류
  let kind = r.kind
  let kindBy: FixGuess['kindBy'] = kind ? 'title' : null
  let badKindText = false
  let badKindNone = false
  let colorHelped = false
  if (!kind && r.leftover) badKindText = true
  else if (!kind) {
    const byColor = canGuess ? ctx.kinds.filter((k) => k.color !== null && k.color === colorKey) : []
    if (byColor.length === 1) {
      kind = byColor[0]
      kindBy = 'color'
      colorHelped = true
    } else {
      const fallback = look.noKind === 'fix' ? undefined : ctx.kinds.find((k) => k.id === look.noKind)
      if (fallback) {
        kind = fallback
        kindBy = 'setting'
      } else badKindNone = true
    }
  }

  // ② 모르는 표시·⑧ 시행자
  let staff = r.mark
  let staffBy: GHow['staff'] | null = staff ? 'title' : null
  let staffProblem: FixReason | null = null
  const memoTail: string[] = []
  if (!staff && r.unknownMark) {
    if (past) {
      staffBy = 'none'
      memoTail.push(`(${r.unknownMark})`)
    } else staffProblem = 'bad-mark'
  } else if (!staff) {
    const noGuessKind = kind !== null && look.noStaffKinds.includes(kind.id)
    const byColor = noGuessKind ? [] : sameColor
    if (byColor.length === 1) {
      staff = byColor[0]
      staffBy = 'color'
      colorHelped = true
    } else if (past) staffBy = 'none'
    else staffProblem = noGuessKind ? 'no-staff' : 'no-staff-color'
  }

  const memo = clip(strokeMemo([...r.memoHead, ...memoTail, r.after].filter(Boolean).join(' '), r.strokes, kind), MEMO_MAX)

  // ⑩ 예약 같지 않음
  const nothing = !r.chart && !r.mark && !r.unknownMark && !r.kind && !colorHelped
  const badName = !r.name || chars(r.name) > NAME_MAX
  const asFix = (reason: FixReason, guess: FixGuess): GParsed => ({
    type: 'fix',
    past,
    fix: { reason, day, days: [day], start, len: Math.min(DAY_MIN, len), allDay: false, gColor, guess } satisfies GParsedFix,
  })
  if (nothing || r.chartTooLong || badName) {
    return asFix('not-appt', emptyGuess({ needs: ['what'], cancel, moved, gStart, gEnd, minutes }))
  }

  const problems: [FixReason, FixNeed][] = []
  if (len > MAX_LEN) problems.push(['too-long', 'len'])
  if (badKindText) problems.push(['bad-kind', 'kind'])
  if (staffProblem) problems.push([staffProblem, 'staff'])
  if (badKindNone) problems.push(['bad-kind', 'kind'])

  if (problems.length) {
    return asFix(
      problems[0][0],
      emptyGuess({
        chart: r.chart,
        name: r.name,
        kindId: kind?.id ?? null,
        kindName: kind?.name ?? null,
        kindBy,
        staffId: staff?.id ?? null,
        staffName: staff?.name ?? null,
        staffMark: staff?.mark ?? null,
        staffBy: staffBy === 'title' || staffBy === 'color' ? staffBy : null,
        memo,
        bad: badKindText ? r.leftover : staffProblem === 'bad-mark' ? r.unknownMark : null,
        needs: unique(problems.map((p) => p[1])) as FixNeed[],
        cancel,
        moved,
        gStart,
        gEnd,
        minutes,
      }),
    )
  }

  // 여기까지 오면 종류·이름이 있고, 시행자는 있거나 지난 예약이라 없다
  const k = kind as GKind
  return {
    type: 'appt',
    past,
    appt: {
      day,
      start,
      len,
      chart: r.chart,
      name: r.name as string,
      kindId: k.id,
      kindName: k.name,
      staffId: staff?.id ?? null,
      staffName: staff?.name ?? null,
      staffMark: staff?.mark ?? null,
      memo,
      status: cancel ? 'cancel' : 'auto',
      gMoved: moved,
      gColor: canGuess ? gColor : null,
      gHow: { staff: staffBy ?? 'none', kind: kindBy ?? 'setting', memo: memo !== '', gStart, gEnd },
    },
  }
}

// ── 고쳐야 할 까닭 글 · 고르기 ──────────────────────────

function hoursText(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h}시간 ${m}분` : `${h}시간`
}

/** notes-calendar '고쳐야 할 까닭' 글. { } 낱말 뒤 조사는 낱말 끝에 맞춘다(design.md 2절 표 7) */
export function fixReasonText(fix: Pick<GParsedFix, 'reason' | 'guess' | 'gColor'>): string {
  const g = fix.guess
  const b = g.bad ?? ''
  switch (fix.reason) {
    case 'no-staff': {
      const k = g.kindName ?? ''
      return `시행자 글이 없어요. ${k}${josa(k, '은/는')} 그때그때 하는 사람이 달라 색으로는 몰라요`
    }
    case 'no-staff-color':
      return fix.gColor === null ? '시행자 글이 없고, 색도 캘린더 기본 색이에요' : '시행자 글이 없고, 이 색으로는 시행자 한 사람을 고를 수 없어요'
    case 'bad-mark':
      return `'${b}'${josa(b, '은/는')} 시행자 표시에 없어요`
    case 'bad-kind':
      // 설정 '종류 글이 없는 예약'이 '고쳐야 함으로 두기'라 모르는 글 없이 고쳐야 할 때
      if (!b) return '종류 글이 없어요'
      return `'${b}'${josa(b, '을/를')} 종류로 알아보지 못했어요 (고르면 '${b}'${josa(b, '은/는')} 메모로 남아요)`
    case 'not-appt':
      return '차트번호·시행자·종류 글이 없어 예약 같지 않아요'
    case 'too-long':
      return `구글 시간이 ${g.gStart}–${g.gEnd} (${hoursText(g.minutes)})이에요. 예약 칸은 4시간까지예요`
    case 'off-name':
      return `'${b}'${josa(b, '을/를')} 원장님·직원 목록에서 찾지 못했어요`
  }
}

const SKIP: FixChoice = { key: 'skip', label: '가져오지 않기 (구글에만 둠)' }

/** 고르기(첫째 고를 거리). 모든 고르기 끝에 '가져오지 않기 (구글에만 둠)'. title = 구글 제목 원문(off 줄 '종일 메모로' 글) */
export function fixChoices(
  fix: Pick<GParsedFix, 'guess'>,
  ctx: { staff: readonly Pick<GStaff, 'id' | 'name' | 'mark'>[]; kinds: readonly Pick<GKind, 'id' | 'name'>[]; people: readonly OffPerson[] },
  title: string,
): FixChoice[] {
  const staffLabel = (s: Pick<GStaff, 'name' | 'mark'>) => `(${s.mark}) ${s.name}`
  let list: FixChoice[] = []
  switch (fix.guess.needs[0]) {
    case 'staff':
      list = ctx.staff.map((s) => ({ key: `staff:${s.id}`, label: staffLabel(s) }))
      break
    case 'kind':
      list = ctx.kinds.map((k) => ({ key: `kind:${k.id}`, label: k.name }))
      break
    case 'len':
      list = [
        { key: 'len:30', label: '30분으로' },
        { key: 'len:50', label: '50분으로' },
      ]
      break
    case 'what':
      list = [{ key: 'memo', label: '종일 메모로 넣기' }]
      break
    case 'person':
      list = [
        ...ctx.people.map((p) => {
          const s = ctx.staff.find((x) => x.id === p.id)
          return { key: `person:${p.id}`, label: s ? staffLabel(s) : `${p.name} (직원)` }
        }),
        { key: 'memo', label: `종일 메모로 ('${title}')` },
      ]
      break
  }
  return [...list, SKIP]
}
