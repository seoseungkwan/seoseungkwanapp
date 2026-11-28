import type { SupabaseClient } from '@supabase/supabase-js'
import { todayInKorea } from '@/lib/analytics/dates'
import { LEARN_KIND_KEY_MAX, neutralPhrases, validatePhrases } from '@/lib/precheck/memo'
import { overLearnLimit, personalHit, sameWhen, type StyleChange } from '@/lib/precheck/memo/learn'
import type { LearnRule, Phrases } from '@/lib/precheck/memo/types'
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

// ── 청구 메모 학습 저장(spec claim-learn design.md 2절·5-1절·6절·7절) ─────────────────────
// 병원 문구(phrases)의 learned·learnKinds 칸만 바꾼다. 늘 서버 값을 다시 읽어 그 위에 고쳐 쓴다(다른 창·다른 칸을 덮지 않게).
// 학습 모양은 design.md '학습 모양'뿐이다: 환자 이름·차트번호·진료 날짜·차트 원문은 여기 오지 않는다(guardrails.test.ts AC-9316.2가 증명).
// 모두 던지지 않고 값으로 답한다. 한 번에 하나씩 차례로 한다(앞 것이 쓴 뒤 다음 것이 다시 읽는다). 모양 고침 [모든 메모에](applyStyleChange)도 같은 줄에 선다

const LEARN_SAVE = 'E-LEARN-SAVE' as const
const LEARN_PERSONAL = 'E-LEARN-PERSONAL' as const
const LEARN_ID = /^l[0-9a-f]{8}$/
const MADE_DAY = /^\d{4}-\d{2}-\d{2}$/
const FRESH_LEFT = 3

/** 저장할 학습: 번호·만든 날은 비면 여기서 붙인다 */
export type LearnedDraft = Omit<LearnRule, 'id' | 'made'> & { id?: string; made?: string }
/** 학습 하나 바꾸기. 남은 확인(left)을 주지 않으면 3으로 돌린다 */
export type LearnedPatch = { id: string } & Partial<Omit<LearnRule, 'id'>>
export type LearnedChange = { add?: readonly LearnedDraft[]; update?: readonly LearnedPatch[]; remove?: readonly string[] }
/** 저장 결과. added = 새로 더한 학습 번호, before = 바꾸기 전 학습(되돌리기 재료). limit = 한도(학습 300·종류 2000·글자 200만)를 넘어 쓰지 않았다 */
export type LearnedResult = { ok: true; phrases: Phrases; added: string[]; before: LearnRule[] } | { ok: false; code: 'E-LEARN-SAVE' | 'E-LEARN-PERSONAL'; limit: boolean }

let learnQueue: Promise<unknown> = Promise.resolve()
/** 학습 저장은 한 번에 하나씩(AC-9301.1) */
function oneAtATime<T>(job: () => Promise<T>): Promise<T> {
  const run = learnQueue.then(job, job)
  learnQueue = run.catch(() => undefined)
  return run
}

type Changed = { kind: 'write'; next: Phrases } | { kind: 'same' }
type ChangeResult = { kind: 'ok'; next: Phrases } | { kind: 'same'; next: Phrases } | { kind: 'failed'; limit: boolean }

/**
 * 내 줄의 phrases를 다시 읽어 change로 고쳐 phrases 한 칸만 쓴다. 줄이 없으면 기본 문구(neutralPhrases)에서 시작해 처음 만든다(AC-9310.3).
 * 고친 문구가 한도를 넘거나 병원 문구 검사를 지나지 못하면 쓰지 않는다(병원 전체 메모가 잠기지 않게)
 */
async function changePhrases(sb: SupabaseClient, change: (phrases: Phrases) => Changed): Promise<ChangeResult> {
  try {
    const found = await sb.from(HOSPITAL_TABLE).select('hospital_id, phrases').maybeSingle()
    if (found.error) return { kind: 'failed', limit: false }
    const id = hospitalIdOf(found.data)
    const raw = found.data === null ? null : (found.data as Record<string, unknown>).phrases
    if (found.data !== null && id === null) return { kind: 'failed', limit: false }
    if (raw !== null && (typeof raw !== 'object' || Array.isArray(raw))) return { kind: 'failed', limit: false }
    const base: Phrases = raw === null ? neutralPhrases() : (structuredClone(raw) as Phrases)
    const changed = change(base)
    if (changed.kind === 'same') return { kind: 'same', next: base }
    if (overLearnLimit(changed.next)) return { kind: 'failed', limit: true }
    if (!validatePhrases(changed.next).ok) return { kind: 'failed', limit: false }
    if (id !== null && raw !== null) {
      const written = await sb.from(HOSPITAL_TABLE).update({ phrases: changed.next }).eq('hospital_id', id)
      return written.error ? { kind: 'failed', limit: false } : { kind: 'ok', next: changed.next }
    }
    return (await startHospitalSettings(sb, changed.next)) === 'ok' ? { kind: 'ok', next: changed.next } : { kind: 'failed', limit: false }
  } catch {
    return { kind: 'failed', limit: false }
  }
}

/** 학습의 글 칸에 전화·주민번호·메일 모양이 있나(AC-9301.5). 서버에 가기 전에 본다 */
function learnedPersonal(rule: Partial<LearnRule>): boolean {
  const texts = [rule.name, rule.from, rule.to, rule.after, ...(rule.when?.chartWords ?? [])]
  return texts.some((text) => typeof text === 'string' && personalHit(text, []))
}

function newLearnId(taken: ReadonlySet<string>): string {
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(4))
    const id = `l${[...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`
    if (!taken.has(id)) return id
  }
}

/** 학습 모양 칸만 골라 담는다(design.md '학습 모양') */
const ruleOf = (rule: LearnRule): LearnRule => ({
  id: rule.id,
  name: rule.name,
  kind: rule.kind,
  from: rule.from,
  to: rule.to,
  after: rule.after,
  when: { codes: [...rule.when.codes], regions: [...rule.when.regions], chartWords: [...rule.when.chartWords], withCodes: [...rule.when.withCodes], doctors: [...rule.when.doctors] },
  on: rule.on,
  left: rule.left,
  made: rule.made,
})

/**
 * 학습 저장(AC-9301.1·AC-9301.5·AC-9301.6·AC-9304.2): 서버 값을 다시 읽어 학습만 더하고·바꾸고·지운다.
 * 할 일·줄 틀·앞 줄 틀·조건이 같은 학습이 이미 있으면 더하지 않고 그 학습의 문장을 바꾼다. 바꾼 학습은 남은 확인을 3으로 돌린다(주면 그 값).
 * 개인정보 모양이 있으면 읽지도 쓰지도 않고 E-LEARN-PERSONAL, 한도·검사·네트워크 실패는 E-LEARN-SAVE
 */
export async function saveLearned(sb: SupabaseClient, change: LearnedChange): Promise<LearnedResult> {
  const add = change.add ?? []
  const update = change.update ?? []
  const remove = new Set(change.remove ?? [])
  if (add.some(learnedPersonal) || update.some(learnedPersonal)) return { ok: false, code: LEARN_PERSONAL, limit: false }
  return oneAtATime(async () => {
    let added: string[] = []
    let before: LearnRule[] = []
    const result = await changePhrases(sb, (phrases) => {
      added = []
      before = []
      const learned = (Array.isArray(phrases.learned) ? phrases.learned : []).map((rule) => ({ ...rule }))
      const touch = (rule: LearnRule) => {
        if (!added.includes(rule.id) && !before.some((seen) => seen.id === rule.id)) before.push(ruleOf(rule))
      }
      for (const patch of update) {
        const rule = learned.find((item) => item.id === patch.id)
        if (!rule) continue
        touch(rule)
        for (const key of ['name', 'kind', 'from', 'to', 'after', 'on'] as const) if (patch[key] !== undefined) Object.assign(rule, { [key]: patch[key] })
        if (patch.when !== undefined) rule.when = patch.when
        rule.left = typeof patch.left === 'number' ? patch.left : FRESH_LEFT
      }
      const kept = learned.filter((rule) => !remove.has(rule.id))
      const taken = new Set(kept.map((rule) => rule.id))
      for (const item of add) {
        const same = kept.find((rule) => rule.kind === item.kind && rule.from === item.from && rule.after === item.after && sameWhen(rule.when, item.when))
        if (same) {
          touch(same)
          same.to = item.to
          same.left = FRESH_LEFT
          continue
        }
        const id = item.id && LEARN_ID.test(item.id) && !taken.has(item.id) ? item.id : newLearnId(taken)
        taken.add(id)
        kept.push(ruleOf({ ...item, id, made: item.made && MADE_DAY.test(item.made) ? item.made : todayInKorea() }))
        added.push(id)
      }
      return { kind: 'write', next: { ...phrases, learned: kept.map(ruleOf) } }
    })
    if (result.kind === 'failed') return { ok: false, code: LEARN_SAVE, limit: result.limit }
    return { ok: true, phrases: result.next, added, before }
  })
}

/** [이번만 고친 거예요](AC-9301.2): 방금 더한 학습은 지우고, 바꾼 학습은 바꾸기 전으로 되돌린다. 다른 학습은 그대로다 */
export async function revertLearned(sb: SupabaseClient, saved: { added: readonly string[]; before: readonly LearnRule[] }): Promise<LearnedResult> {
  const drop = new Set(saved.added)
  return oneAtATime(async () => {
    const result = await changePhrases(sb, (phrases) => {
      const learned = Array.isArray(phrases.learned) ? phrases.learned : []
      if (!learned.some((rule) => drop.has(rule.id) || saved.before.some((old) => old.id === rule.id))) return { kind: 'same' }
      const next = learned.filter((rule) => !drop.has(rule.id)).map((rule) => ruleOf(saved.before.find((old) => old.id === rule.id) ?? rule))
      return { kind: 'write', next: { ...phrases, learned: next } }
    })
    if (result.kind === 'failed') return { ok: false, code: LEARN_SAVE, limit: result.limit }
    return { ok: true, phrases: result.next, added: [], before: [] }
  })
}

/**
 * 남은 확인 바꾸기(AC-9302.7): done = 학습이 쓰인 메모를 고치지 않고 끝냄 → 쓰인 수만큼 하나씩 줄임(0 아래로 가지 않음), edited = 고침 → 3.
 * 바뀌는 것이 없으면 쓰지 않는다. 실패는 'failed'(메모 일은 막지 않는다)
 */
export async function tickLearned(sb: SupabaseClient, ids: readonly string[], how: 'done' | 'edited'): Promise<'ok' | 'failed'> {
  if (!ids.length || (how !== 'done' && how !== 'edited')) return 'ok'
  return oneAtATime(async () => {
    const result = await changePhrases(sb, (phrases) => {
      const learned = Array.isArray(phrases.learned) ? phrases.learned : []
      let moved = false
      const next = learned.map((rule) => {
        const times = ids.filter((id) => id === rule.id).length
        if (!times) return rule
        const left = how === 'edited' ? FRESH_LEFT : Math.max(0, rule.left - times)
        if (left === rule.left) return rule
        moved = true
        return { ...rule, left }
      })
      return moved ? { kind: 'write', next: { ...phrases, learned: next } } : { kind: 'same' }
    })
    return result.kind === 'failed' ? 'failed' : 'ok'
  })
}

/** 처음 학습에서 확인한 종류(AC-9305.3): 종류 열쇠를 더한다(겹침·빈 열쇠는 빼고 열쇠마다 120자까지). 더할 것이 없으면 쓰지 않는다 */
export async function addLearnKinds(sb: SupabaseClient, keys: readonly string[]): Promise<'ok' | 'failed'> {
  const fresh = [...new Set(keys.filter((key): key is string => typeof key === 'string').map((key) => key.trim().slice(0, LEARN_KIND_KEY_MAX)).filter(Boolean))]
  if (!fresh.length) return 'ok'
  return oneAtATime(async () => {
    const result = await changePhrases(sb, (phrases) => {
      const known = Array.isArray(phrases.learnKinds) ? phrases.learnKinds : []
      const more = fresh.filter((key) => !known.includes(key))
      return more.length ? { kind: 'write', next: { ...phrases, learnKinds: [...known, ...more] } } : { kind: 'same' }
    })
    return result.kind === 'failed' ? 'failed' : 'ok'
  })
}

/** 모양 고침이 바꿀 수 있는 설정 칸(design.md 5절 '알아보는 모양 고침' 넷) */
const STYLE_FIELDS: ReadonlySet<string> = new Set<StyleChange['field']>(['sideStyle', 'siteNames', 'fixedPhrases', 'levelSep'])

/**
 * 모양 고침 [모든 메모에](AC-9303.2): 서버 병원 문구를 다시 읽어 그 TPL 칸 하나만 바꿔 쓴다. 학습 저장과 같은 줄에 서서 그 사이 바뀐 학습·다른 칸을 덮지 않는다.
 * patch의 다른 칸(고친 그때의 TPL)은 쓰지 않는다. 상병 연결표는 보내지 않는다. 줄이 없으면 기본 문구에 그 칸을 얹어 처음 만든다(AC-9310.3).
 * 이미 그 값이면 쓰지 않는다. 바꿀 값이 없거나 넷 밖의 칸이거나 병원 문구 검사를 못 지나거나 실패하면 'failed'(던지지 않는다)
 */
export async function applyStyleChange(sb: SupabaseClient, change: StyleChange): Promise<'ok' | 'failed'> {
  const field = change?.field
  const tpl = change?.patch?.TPL as Record<string, unknown> | undefined
  const value = typeof field === 'string' && STYLE_FIELDS.has(field) ? tpl?.[field] : undefined
  if (value === undefined) return 'failed'
  return oneAtATime(async () => {
    const result = await changePhrases(sb, (phrases) => {
      const now = (phrases.TPL ?? {}) as Record<string, unknown>
      if (JSON.stringify(now[field]) === JSON.stringify(value)) return { kind: 'same' }
      return { kind: 'write', next: { ...phrases, TPL: { ...phrases.TPL, [field]: structuredClone(value) } } }
    })
    return result.kind === 'failed' ? 'failed' : 'ok'
  })
}
