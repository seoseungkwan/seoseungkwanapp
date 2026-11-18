import type { SupabaseClient } from '@supabase/supabase-js'
import type { ClaimHospitalSettingsRow, ClaimRuleSettingRow } from '@/types/db'
import type { ErrorCode } from '@/types/errors'
import type { DxLink, SavedRuleSettings } from '@/types/precheck'

// 청구 설정 읽기·쓰기(precheck REQ-012, design.md 8절). 브라우저 → Supabase, 서버 코드가 아니다(ADR-004·021). 환자 자료는 여기 오지 않는다.
// 권한은 RLS가 막는다. hospital_id·updated_at은 DB가 정해 보내지 않는다(supabase/precheck.rls.test.ts가 증명).
// 실패는 SettingsError 하나로 던진다. 오류 번호만 싣고 원래 오류 글은 옮기지 않는다 → 화면은 정해 둔 오류 카드만 보인다.
// 문자 문구(message_templates)는 TASK-25가 이 파일에 더한다

const FAILED: ErrorCode = 'E-SETTINGS-FAILED'

export class SettingsError extends Error {
  readonly code = FAILED
  constructor() {
    super(FAILED)
    this.name = 'SettingsError'
  }
}

/** 규칙 하나의 고른 값(표 한 줄에서 보내는 칸). 줄이 없는 규칙은 규칙표 기본값이다 */
export type RuleChoice = Pick<ClaimRuleSettingRow, 'rule_id' | 'enabled' | 'grade'>
export type RuleDiff = { upserts: RuleChoice[]; deletes: string[] }

type RuleRowPick = RuleChoice & Pick<ClaimRuleSettingRow, 'updated_at'>
const RULE_TABLE = 'claim_rule_settings'
const HOSPITAL_TABLE = 'claim_hospital_settings'

/** 줄들 → 원본 저장 모양. enabled false = off, true = on. 정렬은 원본 snapshot과 같다 */
export function toRuleSettings(rows: readonly RuleChoice[]): SavedRuleSettings {
  return {
    schema: 1,
    off: rows.filter((r) => !r.enabled).map((r) => r.rule_id).sort(),
    on: rows.filter((r) => r.enabled).map((r) => r.rule_id).sort(),
    grade: rows
      .flatMap((r): SavedRuleSettings['grade'] =>(r.grade === null ? [] : [[r.rule_id, r.grade]]))
      .sort((a, b) => a[0].localeCompare(b[0])),
  }
}

/**
 * 원본 저장 모양 → 줄들. 둘 다에 있으면 원본처럼 off가 이긴다.
 * 등급만 있고 켜기·끄기가 없는 규칙은 던진다: 표의 enabled는 비울 수 없는데 규칙표 기본값을 여기서는 몰라,
 * 켠 것으로 적으면 기본으로 꺼진 규칙이 몰래 켜진다(설정 화면은 등급을 고르면 늘 off·on에 함께 둔다)
 */
export function toRuleChoices(settings: SavedRuleSettings): RuleChoice[] {
  const enabled = new Map<string, boolean>()
  for (const id of settings.on) enabled.set(id, true)
  for (const id of settings.off) enabled.set(id, false)
  const grades = new Map(settings.grade)
  for (const id of grades.keys()) if (!enabled.has(id)) throw new SettingsError()
  return [...enabled].map(([rule_id, on]) => ({ rule_id, enabled: on, grade: grades.get(rule_id) ?? null }))
}

/** 두 설정의 다른 점: 새로 넣거나 고칠 줄, 지울 줄(after에 없는 규칙) */
export function diffRuleSettings(before: SavedRuleSettings, after: SavedRuleSettings): RuleDiff {
  const was = new Map(toRuleChoices(before).map((r) => [r.rule_id, r]))
  const now = toRuleChoices(after)
  const kept = new Set(now.map((r) => r.rule_id))
  return {
    upserts: now.filter((r) => {
      const old = was.get(r.rule_id)
      return old === undefined || old.enabled !== r.enabled || old.grade !== r.grade
    }),
    deletes: [...was.keys()].filter((id) => !kept.has(id)),
  }
}

/** 두 설정에서 값이 다른 규칙 ID */
export function changedRuleIds(before: SavedRuleSettings, after: SavedRuleSettings): Set<string> {
  const { upserts, deletes } = diffRuleSettings(before, after)
  return new Set([...upserts.map((r) => r.rule_id), ...deletes])
}

/** base에서 ids의 규칙만 from 값으로 바꾼 설정. from에 줄이 없으면 그 줄을 뺀다 */
export function withRulesFrom(base: SavedRuleSettings, from: SavedRuleSettings, ids: ReadonlySet<string>): SavedRuleSettings {
  return toRuleSettings([
    ...toRuleChoices(base).filter((r) => !ids.has(r.rule_id)),
    ...toRuleChoices(from).filter((r) => ids.has(r.rule_id)),
  ])
}

// DB 부름 하나: 약속이 거절되거나(네트워크) 오류로 답하면 SettingsError. 원래 오류는 버린다
async function run<T>(call: () => PromiseLike<{ data: T | null; error: unknown }>): Promise<T | null> {
  let result: { data: T | null; error: unknown }
  try {
    result = await call()
  } catch {
    throw new SettingsError()
  }
  if (result.error) throw new SettingsError()
  return result.data
}

/** 내 병원 규칙 줄들(바꾼 날 포함). 표 타입을 만들어 두지 않은 클라이언트라 줄 모양은 손으로 맞춘다(types/db.ts) */
export async function readRuleRows(sb: SupabaseClient): Promise<RuleRowPick[]> {
  const rows = await run<RuleRowPick[]>(() => sb.from(RULE_TABLE).select('rule_id, enabled, grade, updated_at'))
  return rows ?? []
}

export async function readRuleSettings(sb: SupabaseClient): Promise<SavedRuleSettings> {
  return toRuleSettings(await readRuleRows(sb))
}

/**
 * 바뀐 줄만 보낸다. 고친 줄은 upsert, 사라진 줄([기본값으로])은 delete. 바뀐 것이 없으면 아무것도 보내지 않는다.
 * 두 번 부르는 일이라 뒤쪽만 실패할 수 있고, 들어갔는데 답만 못 받을 수도 있다. 그러면 던지지만 서버가 before 그대로라는 보장은 없다.
 * 그래서 실패 뒤에 다시 쓸 때는 부르는 쪽이 readRuleSettings로 서버 값을 먼저 읽어 before로 주고, after는 그 값에 사용자가 건드린 규칙만 바꿔 준다(RuleSettings.tsx의 save).
 * 화면 값을 통째로 after로 주면 그동안 다른 탭이 고친 규칙까지 덮어쓴다
 */
export async function writeRuleSettings(sb: SupabaseClient, before: SavedRuleSettings, after: SavedRuleSettings): Promise<void> {
  const { upserts, deletes } = diffRuleSettings(before, after)
  if (upserts.length > 0) await run(() => sb.from(RULE_TABLE).upsert(upserts, { onConflict: 'hospital_id,rule_id' }))
  if (deletes.length > 0) await run(() => sb.from(RULE_TABLE).delete().in('rule_id', deletes))
}

export type HospitalSettings = { phrases: object; dxLinks: DxLink[] }

/** 병원 문구·상병 연결표. 아직 줄이 없으면 null */
export async function readHospitalSettings(sb: SupabaseClient): Promise<HospitalSettings | null> {
  const row = await run<Pick<ClaimHospitalSettingsRow, 'phrases' | 'dx_links'>>(() =>
    sb.from(HOSPITAL_TABLE).select('phrases, dx_links').maybeSingle(),
  )
  return row === null ? null : { phrases: row.phrases, dxLinks: row.dx_links }
}

export async function writeHospitalSettings(sb: SupabaseClient, value: HospitalSettings): Promise<void> {
  await run(() => sb.from(HOSPITAL_TABLE).upsert({ phrases: value.phrases, dx_links: value.dxLinks }, { onConflict: 'hospital_id' }))
}

// ── 병원 문구 시작·입력 방식 (spec clinic-profile design.md 9절·12절) ─────────────────────
// 아래 셋은 던지지 않고 값으로 답한다(부르는 화면이 오류 칸·조용한 무시를 고른다). hospital_id는 몸통에 넣지 않는다 — 읽은 내 줄을 고를 때만 쓴다

const DUPLICATE_ROW = '23505' // hospital_id 기본 키: 다른 창이 먼저 줄을 만들었다

const hospitalIdOf = (data: unknown): string | null => {
  if (typeof data !== 'object' || data === null) return null
  const id = (data as Record<string, unknown>).hospital_id
  return typeof id === 'string' && id !== '' ? id : null
}

/**
 * [기본 문구로 바로 시작](AC-6607.2): 병원 문구 줄이 없으면 문구만 넣고(상병 연결표는 DB 기본값 []), 있으면 문구만 바꾼다(상병 연결표 그대로).
 * 다른 창이 먼저 줄을 만들었으면(23505) 덮어쓰지 않고 다시 읽어 그 줄이 있으면 'ok' — 부르는 쪽이 다시 읽어 그 줄을 쓴다
 */
export async function startHospitalSettings(sb: SupabaseClient, phrases: object): Promise<'ok' | 'failed'> {
  try {
    const found = await sb.from(HOSPITAL_TABLE).select('hospital_id').maybeSingle()
    if (found.error) return 'failed'
    const id = hospitalIdOf(found.data)
    if (id !== null) {
      const changed = await sb.from(HOSPITAL_TABLE).update({ phrases }).eq('hospital_id', id)
      return changed.error ? 'failed' : 'ok'
    }
    if (found.data !== null) return 'failed' // 줄은 있는데 모양이 틀림
    const made = await sb.from(HOSPITAL_TABLE).insert({ phrases })
    if (!made.error) return 'ok'
    if (made.error.code !== DUPLICATE_ROW) return 'failed'
    const again = await sb.from(HOSPITAL_TABLE).select('hospital_id').maybeSingle()
    return !again.error && hospitalIdOf(again.data) !== null ? 'ok' : 'failed'
  } catch {
    return 'failed'
  }
}

/** 비트 입력 방식(AC-6610.1): 'code' = 처방코드별, 'date' = 날짜별 */
export type SavedInputMode = 'code' | 'date'

/** 저장된 입력 방식과 내 줄의 병원 id. 모르는 값은 mode null(지금처럼 날짜별). 줄이 없거나 읽지 못하면 null. readHospitalSettings와 따로 읽는다(설정 바뀜 띠와 상관없게) */
export async function readInputMode(sb: SupabaseClient): Promise<{ hospitalId: string; mode: SavedInputMode | null } | null> {
  try {
    const { data, error } = await sb.from(HOSPITAL_TABLE).select('hospital_id, input_mode').maybeSingle()
    if (error) return null
    const hospitalId = hospitalIdOf(data)
    if (hospitalId === null) return null
    const mode = (data as Record<string, unknown>).input_mode
    return { hospitalId, mode: mode === 'code' || mode === 'date' ? mode : null }
  } catch {
    return null
  }
}

/** 고른 입력 방식만 내 병원 줄에 적는다(AC-6610.2, 병원 문구는 보내지 않는다). 실패해도 던지지 않고 알리지 않는다(고른 방식은 화면에서 그대로 쓴다) */
export async function saveInputMode(sb: SupabaseClient, hospitalId: string, mode: SavedInputMode): Promise<void> {
  if (typeof hospitalId !== 'string' || hospitalId === '' || (mode !== 'code' && mode !== 'date')) return
  try {
    await sb.from(HOSPITAL_TABLE).update({ input_mode: mode }).eq('hospital_id', hospitalId)
  } catch {
    // 알리지 않는다
  }
}
