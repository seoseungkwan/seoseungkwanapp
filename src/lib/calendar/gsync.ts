import { compareYmd } from '@/lib/analytics/dates'
import { apptPaint, settingColor } from './gpaint'
import { colorFromId } from './gshapes'
import type { GAppt, GApptPatch, GDecision, GEvent, GHow, PaintCtx, SyncCtx, TargetAppt } from './gshapes'
import { eventTimes, parseGoogleEvent } from './gtitle'

// 구글 → 웹앱 받기 판단(spec google-link design.md 12-1·REQ-8523)과 색 바꿈 대상(AC-8521.3). 순수 함수다.
// '나중 고친 쪽'은 예약 g_wait_at(DB가 사용자 고침 때만 정함)과 구글 updated로 견준다 — updated_at은 도착·맞춤 표시 적기에도 바뀐다.
// 시각 글자는 견줄 때만 밀리초로 읽는다(DB 마이크로초·구글 밀리초를 같게). 덮인 줄의 {HH:mm}은 한국 시각

const MAX_LEN = 240
const NOTE_MAX = 100
const KOREA_OFFSET_MS = 9 * 60 * 60 * 1000 // 한국은 일광 절약 시간이 없다
const UNREAD_NOTE = '구글 제목을 알아보지 못해 이름·종류·시행자는 그대로 뒀어요'
const ISO = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::(\d{2}))?(?:\.(\d+))?(Z|[+-]\d{2}(?::?\d{2})?)?$/

/** 시각 글자 → 밀리초. 소수 초는 밀리초까지만 본다. 시간대가 없으면 UTC */
function toMs(iso: string | null | undefined): number | null {
  if (!iso) return null
  const m = ISO.exec(iso.trim())
  if (!m) return null
  const frac = (m[4] ?? '').padEnd(3, '0').slice(0, 3)
  let zone = m[5] ?? 'Z'
  if (/^[+-]\d{2}$/.test(zone)) zone += ':00'
  else if (/^[+-]\d{4}$/.test(zone)) zone = `${zone.slice(0, 3)}:${zone.slice(3)}`
  const t = Date.parse(`${m[1]}T${m[2]}:${m[3] ?? '00'}.${frac}${zone}`)
  return Number.isNaN(t) ? null : t
}

const pad = (n: number) => String(n).padStart(2, '0')
function koreaHm(ms: number): string {
  const d = new Date(ms + KOREA_OFFSET_MS)
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

const none = (why: Extract<GDecision, { do: 'none' }>['why']): GDecision => ({ do: 'none', why })
const clip = (s: string, n: number) => [...s].slice(0, n).join('')
const sameHow = (a: GHow | null, b: GHow | null) =>
  !!a && !!b && a.staff === b.staff && a.kind === b.kind && a.memo === b.memo && a.gStart === b.gStart && a.gEnd === b.gEnd

/**
 * 구글 일정 하나를 받았을 때 할 일. mapped = 같은 g_event_id 예약(없으면 null).
 * 이은 날 전 → 없음 · 짝 있음: 늦지 않으면 건너뜀 → 지움(규칙대로 취소·지우기) → 웹앱이 나중이면 덮인 줄만 → 구글을 따름
 * · 짝 없음: 알아보면 넣기, 못 알아보면 고쳐야 할 것('가져오지 않기'는 제목이 바뀔 때만 다시) · 하루 종일은 이은 날부터의 날마다
 */
export function decideEvent(ev: GEvent, mapped: GAppt | null, ctx: SyncCtx): GDecision {
  if (ev.allDay) return decideAllDay(ev, ctx)
  const day = /^\d{4}-\d{2}-\d{2}/.test(ev.start) ? ev.start.slice(0, 10) : (mapped?.day ?? null)
  if (day !== null && compareYmd(day, ctx.linkedOn) < 0) return none('before-link')
  return mapped ? decideMapped(ev, mapped, ctx) : decideNew(ev, ctx)
}

function decideAllDay(ev: GEvent, ctx: SyncCtx): GDecision {
  const seen = toMs(ctx.allDaySeen)
  const upd = toMs(ev.updated)
  if (seen !== null && upd !== null && upd <= seen) return none('not-newer')
  if (ev.status === 'cancelled') return { do: 'allday-gone' }
  const parsed = parseGoogleEvent(ev, ctx)
  const all = parsed.type === 'fix' ? parsed.fix.days : parsed.type === 'appt' ? [] : parsed.days
  const days = all.filter((d) => compareYmd(d, ctx.linkedOn) >= 0)
  if (!days.length) return none('before-link')
  if (parsed.type === 'fix' && ctx.fix?.state === 'skip' && ctx.fix.gTitle === ev.summary) return none('skip-kept')
  return { do: 'allday', days, parsed }
}

function decideNew(ev: GEvent, ctx: SyncCtx): GDecision {
  if (ev.status === 'cancelled') return ctx.fix ? { do: 'drop-fix' } : none('not-ours')
  if (ctx.fix?.state === 'skip' && ctx.fix.gTitle === ev.summary) return none('skip-kept')
  const parsed = parseGoogleEvent(ev, ctx)
  if (parsed.type === 'fix') return { do: 'fix', fix: parsed.fix }
  if (parsed.type !== 'appt') return none('not-ours')
  return {
    do: 'insert',
    dropFix: !!ctx.fix,
    row: { ...parsed.appt, gEventId: ev.id, gTitle: ev.summary, gUpdated: ev.updated, colorFrom: 'google', gKeepTitle: true, gFrom: 'pull' },
  }
}

function decideMapped(ev: GEvent, mapped: GAppt, ctx: SyncCtx): GDecision {
  const upd = toMs(ev.updated)
  const seen = toMs(mapped.gUpdated)
  if (seen !== null && upd !== null && upd <= seen) return none('not-newer')

  const waitAt = toMs(mapped.gWaitAt)
  const webNote = mapped.gWait !== null && waitAt !== null ? `웹앱에서 ${koreaHm(waitAt)}에 고친 내용을 구글 내용으로 덮었어요` : null

  // 지움: 규칙 'cancel'이면 취소 + g_gone, 'delete'면 지우기
  if (ev.status === 'cancelled') {
    if (ctx.onGoogleDelete === 'delete') return { do: 'delete' }
    const patch: GApptPatch = {}
    if (mapped.status !== 'cancel') patch.status = 'cancel'
    if (!mapped.gGone) patch.gGone = true
    if (mapped.gWait !== null) patch.gWait = null
    if (webNote) patch.gNote = webNote
    patch.gUpdated = ev.updated
    return { do: 'update', wins: 'google', patch }
  }

  // 양쪽 고침: 웹앱이 나중이면 덮인 줄만 남기고 보내기는 그대로
  if (mapped.gWait !== null && waitAt !== null && upd !== null && waitAt > upd) {
    return { do: 'update', wins: 'web', patch: { gNote: `구글에서 ${koreaHm(upd)}에 고친 내용을 웹앱 내용으로 덮었어요`, gUpdated: ev.updated } }
  }

  // 구글 이김
  const patch: GApptPatch = {}
  const set = <K extends keyof GApptPatch>(key: K, value: GApptPatch[K]) => {
    if ((mapped as GApptPatch)[key] !== value) patch[key] = value
  }
  const notes: string[] = []
  if (mapped.gWait !== null) {
    patch.gWait = null
    if (webNote) notes.push(webNote)
  }

  // 제목: 그대로면 시간·색만, 바뀌면 다시 알아봄(못 알아보면 칸 그대로 + 덮인 줄)
  let how: GHow | null = mapped.gHow
  if (ev.summary !== mapped.gTitle) {
    const parsed = parseGoogleEvent(ev, ctx)
    if (parsed.type === 'appt') {
      const a = parsed.appt
      set('name', a.name)
      set('chart', a.chart)
      set('kindId', a.kindId)
      set('kindName', a.kindName)
      set('staffId', a.staffId)
      set('staffName', a.staffName)
      set('staffMark', a.staffMark)
      if (ctx.look.titleMemo || a.memo !== '') set('memo', a.memo) // 메모를 제목에 안 붙이는 설정이면 빈 메모로 지우지 않는다
      set('gKeepTitle', true)
      how = a.gHow
    } else notes.push(UNREAD_NOTE)
    patch.gTitle = ev.summary
  }

  // 시간: 날짜·시작이 바뀌면 웹앱에서 옮긴 것처럼(처음 자리는 DB 트리거), 길이는 4시간까지만
  const t = eventTimes(ev)
  let movedTime = false
  let backToOrig = false // 받은 날·시작이 그 줄의 처음 자리(orig_day·orig_start)와 같음 = 원래 자리로 되돌림
  if (t) {
    movedTime = t.day !== mapped.day || t.start !== mapped.start
    backToOrig = t.day === mapped.origDay && t.start === mapped.origStart
    set('day', t.day)
    set('start', t.start)
    if (t.len <= MAX_LEN) set('len', t.len)
    if (how) how = { ...how, gStart: t.gStart, gEnd: t.gEnd }
  }
  if (how && !sameHow(how, mapped.gHow)) patch.gHow = how

  // 색: 취소 색 → 취소, 취소였는데 다른 색 → 'auto', 변경 색 → g_moved, 그 밖 → g_color(설정 색과 다르면 구글 색으로 칠함).
  // g_moved(이은 병원의 '변경', google-link AC-8545.2) = 변경 색이거나 날짜·시작을 옮김(원래 자리로 되돌림은 아님)
  const color = colorFromId(ev.colorId)
  const isCancel = color !== null && color === ctx.look.cancel
  const isChange = !isCancel && color !== null && color === ctx.look.change
  set('status', isCancel ? 'cancel' : mapped.status === 'cancel' ? 'auto' : mapped.status)
  if (mapped.gGone) patch.gGone = false
  if (!isCancel) set('gMoved', isChange || (movedTime && !backToOrig))
  if (!isCancel && !isChange) {
    set('gColor', color)
    const kindId = patch.kindId ?? mapped.kindId
    const staffId = 'staffId' in patch ? (patch.staffId ?? null) : mapped.staffId
    if ((color ?? 'default') !== settingColor({ kindId, staffId }, ctx)) set('colorFrom', 'google')
  }
  // 구글에서 옮긴 일정은 구글 색도 변경 색으로 다시 칠한다(원래 자리로 되돌렸으면 g_moved가 거짓이라 원래 색으로 칠함)
  if (movedTime && !isCancel && !isChange) patch.gWait = 'color'

  if (notes.length) patch.gNote = clip(notes.join(' · '), NOTE_MAX)
  patch.gUpdated = ev.updated
  return { do: 'update', wins: 'google', patch }
}

/**
 * 설정에서 시행자·종류·취소·변경 색을 바꾼 뒤 구글 색도 바꿀 예약 id. 이은 날 뒤 앞으로(오늘 포함)의 예약 가운데
 * 옛 설정과 새 설정의 칸 색이 다른 것만 — 구글에서 따로 고른 색(color_from 'google')은 취소·변경이 아니면 그대로라 빠진다
 */
export function colorChangeTargets(
  appts: readonly TargetAppt[],
  before: PaintCtx,
  after: PaintCtx,
  opts: { today: string; linkedOn: string | null },
): string[] {
  const { linkedOn, today } = opts
  if (!linkedOn) return []
  const from = compareYmd(today, linkedOn) > 0 ? today : linkedOn
  return appts.filter((a) => compareYmd(a.day, from) >= 0 && apptPaint(a, before).key !== apptPaint(a, after).key).map((a) => a.id)
}
