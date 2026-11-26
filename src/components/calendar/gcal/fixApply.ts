import { addDays } from '@/lib/analytics/dates'
import { clip, localStamp, maskText } from '@/lib/gcal/deps'
import { resolveRow, type ImportRow } from '@/lib/gcal/importRead'
import { newApptRow } from '@/lib/gcal/pull'
import { G_COLOR_ID, type FixChoice, type FixNeed, type GEvent, type GParsed, type GParsedFix, type ParseCtx } from '@/lib/calendar/gshapes'
import { fixChoices, parseGoogleEvent } from '@/lib/calendar/gtitle'
import { addAllDay, insertGoogleAppts } from '@/lib/storage/calendar'
import { deleteGcalFix, saveOffDay, setFixState } from '@/lib/storage/gcal'
import type { GcalFix } from '@/types/gcal'

// 고쳐야 할 구글 예약 한 줄을 다시 읽고(구글 제목 원문 → parseGoogleEvent) 고른 값으로 넣는다(spec google-link AC-8534.3, design.md 12-2·13절).
// 저장 모양(gcal_fixes.guess)에는 고를 거리(needs)가 없어, 판은 줄의 제목·색·시각으로 구글 일정을 다시 만들어 읽는다.
// 넣은 예약은 받기(pull)가 넣는 줄과 같다: 구글 제목·색 그대로(g_keep_title, color_from google), g_from 'pull'. 구글 일정은 바꾸지 않는다

const TITLE_MAX = 200
const ALLDAY_MEMO_MAX = 20
const STAFF_NAME_MAX = 10

/** 줄 → 구글 일정(시각은 그 줄의 날·시작·길이, 하루 종일은 그날 하루) */
export function fixEvent(fix: GcalFix): GEvent {
  return {
    id: fix.gEventId,
    status: 'confirmed',
    summary: fix.gTitle,
    description: '',
    allDay: fix.allDay,
    start: fix.allDay ? fix.day : localStamp(fix.day, fix.start),
    end: fix.allDay ? addDays(fix.day, 1) : localStamp(fix.day, fix.start + fix.len),
    colorId: fix.gColor ? G_COLOR_ID[fix.gColor] : null,
    updated: fix.gUpdated,
    recurring: false,
  }
}

/** 다시 읽은 고쳐야 할 것(제목을 구글에서 고쳐 이제 알아보면 fix가 아니다 — 그때는 null) */
export function fixParsed(fix: GcalFix, ctx: ParseCtx): GParsedFix | null {
  const parsed = parseGoogleEvent(fixEvent(fix), ctx)
  return parsed.type === 'fix' ? parsed.fix : null
}

/** 고를 거리 하나의 고르기('가져오지 않기'는 판 아래 단추라 뺀다) */
export function needChoices(parsed: GParsedFix, need: FixNeed, ctx: ParseCtx, title: string): FixChoice[] {
  return fixChoices({ guess: { ...parsed.guess, needs: [need] } }, ctx, title).filter((c) => c.key !== 'skip')
}

const rowOf = (fix: GcalFix, ctx: ParseCtx): ImportRow => {
  const event = fixEvent(fix)
  return {
    key: fix.id,
    eventId: fix.gEventId,
    title: fix.gTitle,
    gColor: fix.gColor,
    allDay: fix.allDay,
    day: fix.day,
    past: false,
    parsed: parseGoogleEvent(event, ctx),
    known: false,
    event,
  }
}

/** 고른 값으로 웹앱 칸을 정한다(lib/gcal resolveRow). 아직 모자라면 fix 그대로 */
export function resolveFix(fix: GcalFix, keys: readonly string[], ctx: ParseCtx): GParsed {
  return resolveRow(rowOf(fix, ctx), keys, ctx)
}

/** 넣기가 쓰는 저장 함수(화면이 브라우저 Supabase로 묶는다) */
export type FixStore = {
  insertAppts: (rows: Parameters<typeof insertGoogleAppts>[1]) => ReturnType<typeof insertGoogleAppts>
  addAllDay: (item: Parameters<typeof addAllDay>[1]) => ReturnType<typeof addAllDay>
  saveOffDay: (off: Parameters<typeof saveOffDay>[1]) => ReturnType<typeof saveOffDay>
  deleteFix: (id: Parameters<typeof deleteGcalFix>[1]) => ReturnType<typeof deleteGcalFix>
  setFixState: (id: string, state: Parameters<typeof setFixState>[2]) => ReturnType<typeof setFixState>
}

/** 브라우저 Supabase로 묶은 저장 함수 */
export function fixStore(client: Parameters<typeof insertGoogleAppts>[0] & Parameters<typeof deleteGcalFix>[0]): FixStore {
  return {
    insertAppts: (rows) => insertGoogleAppts(client, rows),
    addAllDay: (item) => addAllDay(client, item),
    saveOffDay: (off) => saveOffDay(client, off),
    deleteFix: (id) => deleteGcalFix(client, id),
    setFixState: (id, state) => setFixState(client, id, state),
  }
}

export type PutResult = 'appt' | 'memo' | 'off' | 'none'

/**
 * [예약표에 넣기]: 예약이면 받기와 같은 줄로 넣고 고쳐야 할 줄을 지운다. 하루 종일 일정의 off 줄·종일 메모는 그 일정과 잇고 지운다.
 * 시간 일정을 '종일 메모로 넣기'면 메모는 웹앱에만 두고(구글 일정과 잇지 않음) 그 줄은 '가져오지 않음'으로 둔다(다음 받기가 다시 고쳐야 함으로 만들지 않게).
 * 아직 모자라면 아무것도 적지 않고 'none'
 */
export async function putFix(store: FixStore, fix: GcalFix, keys: readonly string[], ctx: ParseCtx): Promise<PutResult> {
  const parsed = resolveFix(fix, keys, ctx)
  if (parsed.type === 'appt') {
    const row = newApptRow({ ...parsed.appt, gEventId: fix.gEventId, gTitle: fix.gTitle, gUpdated: fix.gUpdated, colorFrom: 'google', gKeepTitle: true, gFrom: 'pull' })
    const { sent } = await store.insertAppts([row])
    if (sent === 0) return 'none' // 이름·메모에 개인정보 모양(저장하지 않음) — 줄은 그대로 둔다
    await store.deleteFix(fix.id)
    return 'appt'
  }
  if (parsed.type === 'memo') {
    const memo = maskText(parsed.memo, ALLDAY_MEMO_MAX).trim()
    if (!memo) return 'none'
    const own = fix.allDay
    const saved = await store.addAllDay({
      day: fix.day,
      type: 'memo',
      memo,
      staffId: null,
      staffName: null,
      gEventId: own ? fix.gEventId : null,
      gUpdated: own ? fix.gUpdated : null,
      gWait: false,
    })
    if (saved === 'blocked') return 'none'
    if (own) await store.deleteFix(fix.id)
    else await store.setFixState(fix.id, 'skip')
    return 'memo'
  }
  if (parsed.type === 'off') {
    for (const p of parsed.people) {
      await store.addAllDay({ day: fix.day, type: 'off', memo: null, staffId: p.id, staffName: clip(p.name, STAFF_NAME_MAX) })
    }
    await store.saveOffDay({ day: fix.day, gEventId: fix.gEventId, gTitle: maskText(fix.gTitle, TITLE_MAX), gUpdated: fix.gUpdated, wait: false })
    await store.deleteFix(fix.id)
    return 'off'
  }
  return 'none'
}
