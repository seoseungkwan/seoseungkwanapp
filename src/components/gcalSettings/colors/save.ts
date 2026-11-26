import type { SupabaseClient } from '@supabase/supabase-js'
import { addMonthsToDay, compareYmd } from '@/lib/analytics/dates'
import type { PaintCtx } from '@/lib/calendar/gshapes'
import { colorChangeTargets } from '@/lib/calendar/gsync'
import { CalendarStorageError, listAppts, saveCalendarSettings, updateAppt } from '@/lib/storage/calendar'
import { saveClinicProfile } from '@/lib/storage/clinicProfile'
import { GcalStorageError, saveGcalLook } from '@/lib/storage/gcal'
import type { CalAppt, CalKind } from '@/types/calendar'
import type { ClinicProfile } from '@/types/clinicProfile'
import type { GcalLook } from '@/types/gcal'

// 시행자·종류 화면 [저장] (spec google-link AC-8529.2 · AC-8526.6 · AC-8521.3, design.md 12-2 '색 바꿈 저장').
// 차례: 시행자(병원 정보) → 종류(예약 설정) → 취소·변경 색·글 없을 때·제목 꼴(구글 연결 look). 고친 쪽만 보낸다.
// 이은 병원이고 칸 색 차례에 드는 값(취소·변경·휴무 줄 색, 종류·시행자 색)이 바뀌었으면 오늘(이은 날이 더 늦으면 그날)부터 2년 예약을 읽어
// colorChangeTargets가 고른 것에 g_wait='color'를 적고 pushWaiting(TASK-12)을 부른다. 보낼 것이 이미 있는 예약(g_wait 있음)은 그 보내기가 새 색으로 가므로,
// 구글 짝이 없는 예약·구글에서 지운 예약(g_gone — color 보내기가 되살린다)과 함께 건드리지 않는다.
// pushWaiting은 기다리지 않고 실패도 삼킨다(못 보낸 것은 g_wait로 남아 맞춤이 1분마다 다시 보낸다).
// 부르기는 deps로만 한다 — 화면 시험이 가짜를 넣고, 앱은 colorsDeps(client, pushWaiting)로 실제 저장 함수를 묶는다

export type StaffKindsDeps = {
  saveProfile(profile: ClinicProfile): Promise<ClinicProfile | 'invalid' | 'failed'>
  saveKinds(kinds: CalKind[]): Promise<void | 'invalid'>
  saveLook(look: GcalLook): Promise<void | 'invalid'>
  listAppts(from: string, to: string): Promise<CalAppt[]>
  /** 그 예약에 g_wait = 'color' */
  markColor(id: string): Promise<unknown>
  /** lib/gcal push.ts pushWaiting (TASK-12) */
  pushWaiting(): Promise<unknown>
}

/** 실제 저장 함수 묶음. pushWaiting은 TASK-12 lib/gcal pushWaiting(deps)을 부르는 함수를 넘긴다 */
export function colorsDeps(client: Pick<SupabaseClient, 'from' | 'rpc'>, pushWaiting: () => Promise<unknown>): StaffKindsDeps {
  return {
    saveProfile: (profile) => saveClinicProfile(client, profile),
    saveKinds: (kinds) => saveCalendarSettings(client, { kinds }),
    saveLook: (look) => saveGcalLook(client, look),
    listAppts: (from, to) => listAppts(client, from, to),
    markColor: (id) => updateAppt(client, id, { gWait: 'color' }),
    pushWaiting,
  }
}

export type ColorsSave = {
  /** 고친 것만(고치지 않았으면 null) */
  profile: ClinicProfile | null
  kinds: CalKind[] | null
  look: GcalLook | null
  /** 칸 색 차례: 저장 전·뒤 */
  before: PaintCtx
  after: PaintCtx
  linkedOn: string | null
  today: string
}

export type SaveOutcome = { ok: true; profile: ClinicProfile | null } | { ok: false; why: 'invalid' | 'offline' | 'failed' }

const AHEAD_MONTHS = 24 // 처음 가져오기의 앞으로 끝(오늘 + 2년)과 같다
const MARK_CHUNK = 10

const paintKey = (ctx: PaintCtx) =>
  JSON.stringify([
    [ctx.look.cancel, ctx.look.change, ctx.look.offColor],
    ctx.kinds.map((k) => [k.id, k.color]),
    ctx.staff.map((s) => [s.id, s.color]),
  ])

const isOffline = (error: unknown) => (error instanceof CalendarStorageError || error instanceof GcalStorageError) && error.kind === 'offline'

async function markTargets(deps: StaffKindsDeps, input: ColorsSave): Promise<void> {
  const { linkedOn, today, before, after } = input
  if (linkedOn === null || paintKey(before) === paintKey(after)) return
  const from = compareYmd(today, linkedOn) > 0 ? today : linkedOn
  const appts = await deps.listAppts(from, addMonthsToDay(from, AHEAD_MONTHS))
  const idle = appts.filter((a) => a.gWait === null && a.gEventId !== null && !a.gGone)
  const ids = colorChangeTargets(idle, before, after, { today, linkedOn })
  for (let at = 0; at < ids.length; at += MARK_CHUNK) {
    await Promise.all(ids.slice(at, at + MARK_CHUNK).map((id) => deps.markColor(id)))
  }
  if (ids.length > 0) void deps.pushWaiting().catch(() => {})
}

export async function saveColors(deps: StaffKindsDeps, input: ColorsSave): Promise<SaveOutcome> {
  try {
    let profile: ClinicProfile | null = null
    if (input.profile !== null) {
      const saved = await deps.saveProfile(input.profile)
      if (saved === 'invalid' || saved === 'failed') return { ok: false, why: saved }
      profile = saved
    }
    if (input.kinds !== null && (await deps.saveKinds(input.kinds)) === 'invalid') return { ok: false, why: 'invalid' }
    if (input.look !== null && (await deps.saveLook(input.look)) === 'invalid') return { ok: false, why: 'invalid' }
    await markTargets(deps, input)
    return { ok: true, profile }
  } catch (error) {
    return { ok: false, why: isOffline(error) ? 'offline' : 'failed' }
  }
}
