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

// 구글 제목 알아보기 · 웹앱 → 구글 제목 꼴 · 고쳐야 할 까닭 글과 고르기(spec google-link design.md 13절·REQ-8520·REQ-8521).
// 순수 함수다. 시각은 구글 코드가 준 한국 시각 글자('YYYY-MM-DDTHH:mm', 하루 종일은 'YYYY-MM-DD')만 읽는다.
// 알아보는 차례: ① 맨 앞 숫자 = 차트번호 ② 끝 괄호 한 글자 = 시행자 표시(②-1 그 뒤 글 = 메모) ③ 그 밖 괄호 안 글 = 메모
// ④ 숫자+분 버림 ⑤ 종류 글(긴 것부터, 한 글자 글은 숫자 바로 뒤만, 괄호 안도 봄) ⑥ 첫 한글 낱말 = 이름 ⑦ 괄호 밖 모르는 글 → bad-kind
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
 * 종류 이름·시행자 표시는 지금 목록 값(없으면 예약에 남은 값). arrival을 주면 앞에 '왔음 '·'안 옴 '
 */
export function formatGoogleTitle(
  appt: TitleAppt,
  look: Pick<GLook, 'titleLen' | 'titleMemo'>,
  kinds: readonly Pick<GKind, 'id' | 'name'>[],
  staff: readonly Pick<GStaff, 'id' | 'mark'>[],
  arrival: 'came' | 'noshow' | null = null,
): string {
  const kind = kinds.find((k) => k.id === appt.kindId)?.name ?? appt.kindName
  const mark = appt.staffId === null ? null : (staff.find((s) => s.id === appt.staffId)?.mark ?? appt.staffMark)
  let title = [appt.chart, appt.name, kind, look.titleLen ? `${appt.len}분` : null].filter(Boolean).join(' ')
  if (mark) title += ` (${mark})`
  const memo = appt.memo.replace(/\s+/g, ' ').trim()
  if (look.titleMemo && memo) title += ` ${memo}`
  return withArrival(title, arrival)
}

// ── 제목 읽기 ───────────────────────────────────────────

type KindHit = { kind: GKind; index: number; length: number; digits: boolean }

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const chars = (s: string) => [...s].length
const clip = (s: string, n: number) => [...s].slice(0, n).join('').trim()

/** 알아볼 글(종류 words + 종류 이름) 긴 것부터. 같은 길이는 종류 차례 */
function kindWords(kinds: readonly GKind[]): { kind: GKind; word: string }[] {
  const list: { kind: GKind; word: string }[] = []
  for (const kind of kinds) {
    for (const w of unique([...kind.words, kind.name])) list.push({ kind, word: w })
  }
  return list.map((x, i) => ({ ...x, i })).sort((a, b) => chars(b.word) - chars(a.word) || a.i - b.i)
}

function unique(words: readonly string[]): string[] {
  return [...new Set(words.map((w) => w.trim()).filter(Boolean))]
}

/** 한 글자 글('타')은 숫자 바로 뒤만(그 숫자까지 한 덩이) */
function findKind(text: string, words: { kind: GKind; word: string }[]): KindHit | null {
  for (const { kind, word } of words) {
    if (chars(word) === 1) {
      const m = new RegExp(`\\d+${escapeRe(word)}`).exec(text)
      if (m) return { kind, index: m.index, length: m[0].length, digits: true }
    } else {
      const i = text.indexOf(word)
      if (i >= 0) return { kind, index: i, length: word.length, digits: false }
    }
  }
  return null
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
}

function readTitle(summary: string, ctx: Pick<ParseCtx, 'staff' | 'kinds' | 'arrival'>): TitleRead {
  let s = summary.replace(/\s+/g, ' ').trim()
  if (ctx.arrival === 'title') s = stripArrival(s).trim()

  // ① 맨 앞 숫자 = 차트번호(이름과 붙어도)
  const cm = /^\d+/.exec(s)
  const chart = cm ? cm[0] : null
  if (chart) s = s.slice(chart.length)

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

  // ③ 그 밖 괄호 안 글(닫는 괄호 없어도) = 메모
  const parens: string[] = []
  s = s.replace(/\(([^()]*)(?:\)|$)/g, (_m, inner: string) => {
    const t = inner.trim()
    if (t) parens.push(t)
    return ' '
  })

  // ④ 숫자+분 = 길이 글이라 버림
  s = s.replace(/\d+\s*분/g, ' ')

  // ⑤ 종류 글: 괄호 밖 먼저, 없으면 괄호 안
  const words = kindWords(ctx.kinds)
  const head: string[] = []
  let kind: GKind | null = null
  const main = findKind(s, words)
  if (main) {
    kind = main.kind
    if (main.digits) head.push(s.slice(main.index, main.index + main.length))
    s = `${s.slice(0, main.index)} ${s.slice(main.index + main.length)}`
  } else {
    kind = findKind(parens.join(' '), words)?.kind ?? null
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

  const r = readTitle(ev.summary, ctx)

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
    const byColor = canGuess && !noGuessKind && look.staffByColor && gColor !== null ? ctx.staff.filter((s) => s.color === gColor) : []
    if (byColor.length === 1) {
      staff = byColor[0]
      staffBy = 'color'
      colorHelped = true
    } else if (past) staffBy = 'none'
    else staffProblem = noGuessKind ? 'no-staff' : 'no-staff-color'
  }

  const memo = clip([...r.memoHead, ...memoTail, r.after].filter(Boolean).join(' '), MEMO_MAX)

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
export function fixReasonText(fix: Pick<GParsedFix, 'reason' | 'guess'>): string {
  const g = fix.guess
  const b = g.bad ?? ''
  switch (fix.reason) {
    case 'no-staff': {
      const k = g.kindName ?? ''
      return `시행자 글이 없어요. ${k}${josa(k, '은/는')} 그때그때 하는 사람이 달라 색으로는 몰라요`
    }
    case 'no-staff-color':
      return '시행자 글이 없고, 색도 캘린더 기본 색이에요'
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
