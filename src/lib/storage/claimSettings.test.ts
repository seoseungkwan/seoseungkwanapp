import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import type { SavedRuleSettings } from '@/types/precheck'
import { todayInKorea } from '@/lib/analytics/dates'
import { neutralPhrases, ourClinicPhrases, validatePhrases } from '@/lib/precheck/memo'
import type { LearnRule, Phrases } from '@/lib/precheck/memo/types'
import {
  SettingsError,
  addLearnKinds,
  revertLearned,
  saveLearned,
  tickLearned,
  changedRuleIds,
  diffRuleSettings,
  withRulesFrom,
  readHospitalSettings,
  readRuleRows,
  readInputMode,
  readRuleSettings,
  saveInputMode,
  startHospitalSettings,
  toRuleChoices,
  toRuleSettings,
  writeHospitalSettings,
  writeRuleSettings,
} from './claimSettings'

// 설정 읽기·쓰기 (precheck REQ-012 AC-012.5, 시험은 실제 Supabase에 붙지 않는다). 권한·RLS는 supabase/precheck.rls.test.ts가 진짜 Postgres로 본다.
// 가짜 클라이언트는 받은 호출을 적어 두고 정해 둔 답을 준다. 'throw' = 네트워크 실패처럼 약속이 거절된다

type Answer = { data?: unknown; error?: unknown } | 'throw'
type Call = { table: string; op: string; args: unknown[] }

const SECRET_MESSAGE = 'relation "public.claim_rule_settings" does not exist'

function fakeSb(answers: { select?: Answer; upsert?: Answer; delete?: Answer } = {}) {
  const calls: Call[] = []
  const reply = (answer: Answer | undefined, fallback: unknown) => {
    if (answer === 'throw') return Promise.reject(new Error(SECRET_MESSAGE))
    return Promise.resolve({ data: answer?.data ?? fallback, error: answer?.error ?? null })
  }
  const sb = {
    from: (table: string) => ({
      select: (...args: unknown[]) => {
        calls.push({ table, op: 'select', args })
        const answer = () => reply(answers.select, [])
        return {
          // 줄들로 받을 때(await)와 한 줄로 받을 때(maybeSingle)
          then: (ok: (value: unknown) => unknown, no: (reason: unknown) => unknown) => answer().then(ok, no),
          maybeSingle: () => reply(answers.select, null),
        }
      },
      upsert: (...args: unknown[]) => {
        calls.push({ table, op: 'upsert', args })
        return reply(answers.upsert, null)
      },
      delete: () => ({
        in: (...args: unknown[]) => {
          calls.push({ table, op: 'delete', args })
          return reply(answers.delete, null)
        },
      }),
    }),
  }
  return { sb: sb as unknown as SupabaseClient, calls }
}

const settings = (over: Partial<SavedRuleSettings> = {}): SavedRuleSettings => ({ schema: 1, off: [], on: [], grade: [], ...over })

async function failure(work: Promise<unknown>) {
  try {
    await work
  } catch (error) {
    return error
  }
  throw new Error('던지지 않았다')
}

function expectSettingsFailed(error: unknown) {
  expect(error).toBeInstanceOf(SettingsError)
  expect((error as SettingsError).code).toBe('E-SETTINGS-FAILED')
  // 원래 오류 글을 밖으로 내지 않는다
  expect((error as SettingsError).message).toBe('E-SETTINGS-FAILED')
  expect(JSON.stringify(error, Object.getOwnPropertyNames(error))).not.toContain('does not exist')
}

describe('AC-012.5 규칙 설정 읽기: 줄 → 원본 저장 모양', () => {
  it('AC-012.5: 줄들을 {schema: 1, off, on, grade}로 바꾼다. enabled false = off, true = on, grade가 있으면 [ID, 등급]. 원본 snapshot처럼 정렬한다', async () => {
    const { sb, calls } = fakeSb({
      select: {
        data: [
          { rule_id: 'PT-02', enabled: true, grade: '참고', updated_at: '2026-10-30T00:00:00Z' },
          { rule_id: 'LA-01', enabled: false, grade: null, updated_at: '2026-10-30T00:00:00Z' },
          { rule_id: 'DX-03', enabled: false, grade: '알림', updated_at: '2026-10-30T00:00:00Z' },
          { rule_id: 'MM-01', enabled: true, grade: null, updated_at: '2026-10-30T00:00:00Z' },
        ],
      },
    })
    expect(await readRuleSettings(sb)).toEqual({
      schema: 1,
      off: ['DX-03', 'LA-01'],
      on: ['MM-01', 'PT-02'],
      grade: [
        ['DX-03', '알림'],
        ['PT-02', '참고'],
      ],
    })
    expect(calls.map(({ table, op }) => ({ table, op }))).toEqual([{ table: 'claim_rule_settings', op: 'select' }])
  })

  it('AC-012.5: 줄이 없으면 빈 설정이다(모두 규칙표 기본값)', async () => {
    expect(await readRuleSettings(fakeSb({ select: { data: [] } }).sb)).toEqual(settings())
  })

  it('AC-012.5·AC-012.6: readRuleRows는 줄을 그대로(바꾼 날 포함) 준다', async () => {
    const row = { rule_id: 'LA-01', enabled: false, grade: null, updated_at: '2026-10-30T00:00:00Z' }
    expect(await readRuleRows(fakeSb({ select: { data: [row] } }).sb)).toEqual([row])
  })

  it.each([
    ['DB가 오류로 답함', { error: { message: SECRET_MESSAGE } }],
    ['네트워크 실패', 'throw'],
  ] as const)('AC-012.5: 읽기 실패(%s)는 E-SETTINGS-FAILED 하나로 던지고 원래 오류 글을 싣지 않는다', async (_name, answer) => {
    expectSettingsFailed(await failure(readRuleSettings(fakeSb({ select: answer }).sb)))
  })
})

describe('AC-012.5 줄 ↔ 원본 모양 바꾸기', () => {
  it('AC-012.5: toRuleChoices·toRuleSettings는 서로 되돌린다', () => {
    const value = settings({ off: ['LA-01'], on: ['PT-02'], grade: [['PT-02', '참고']] })
    expect(toRuleSettings(toRuleChoices(value))).toEqual(value)
    expect(toRuleChoices(value)).toEqual(
      expect.arrayContaining([
        { rule_id: 'LA-01', enabled: false, grade: null },
        { rule_id: 'PT-02', enabled: true, grade: '참고' },
      ]),
    )
  })

  it('AC-012.5: off와 on에 함께 있으면 원본처럼 off가 이긴다', () => {
    expect(toRuleChoices(settings({ off: ['LA-01'], on: ['LA-01'] }))).toEqual([{ rule_id: 'LA-01', enabled: false, grade: null }])
  })

  it('AC-012.5: 바뀐 줄·지울 줄을 가른다', () => {
    const before = settings({ off: ['LA-01', 'LA-02'], on: ['PT-02'], grade: [['PT-02', '참고']] })
    const after = settings({ off: ['LA-02', 'PT-02'], on: ['MM-01'], grade: [['PT-02', '참고']] })
    expect(diffRuleSettings(before, after)).toEqual({
      upserts: expect.arrayContaining([
        { rule_id: 'PT-02', enabled: false, grade: '참고' },
        { rule_id: 'MM-01', enabled: true, grade: null },
      ]),
      deletes: ['LA-01'],
    })
    expect(diffRuleSettings(before, after).upserts).toHaveLength(2)
  })

  it('AC-012.6: changedRuleIds는 값이 다른 규칙 ID를 준다(새 줄·고친 줄·사라진 줄)', () => {
    const before = settings({ off: ['LA-01', 'LA-02'], on: ['PT-02'] })
    const after = settings({ off: ['LA-02', 'PT-02'], on: ['MM-01'] })
    expect([...changedRuleIds(before, after)].sort()).toEqual(['LA-01', 'MM-01', 'PT-02'])
    expect(changedRuleIds(before, before).size).toBe(0)
  })

  it('AC-012.6: withRulesFrom은 고른 규칙만 from 값으로 바꾼다. from에 줄이 없으면 그 줄을 빼고, 나머지는 base 그대로다', () => {
    const base = settings({ off: ['LA-01', 'LA-02'], on: ['PT-02'], grade: [['PT-02', '참고']] })
    const from = settings({ off: ['MM-01'], on: ['LA-02'], grade: [['LA-02', '알림']] })
    expect(withRulesFrom(base, from, new Set(['LA-01', 'LA-02', 'MM-01']))).toEqual(
      settings({ off: ['MM-01'], on: ['LA-02', 'PT-02'], grade: [['LA-02', '알림'], ['PT-02', '참고']] }),
    )
    expect(withRulesFrom(base, from, new Set())).toEqual(base)
  })
})

describe('AC-012.5 규칙 설정 쓰기: 바뀐 줄만', () => {
  it('AC-012.5: 바뀐 줄만 upsert한다. 안 바뀐 줄은 보내지 않고 hospital_id·updated_at을 보내지 않는다', async () => {
    const { sb, calls } = fakeSb()
    const before = settings({ off: ['LA-01'], on: ['PT-02'], grade: [['PT-02', '참고']] })
    const after = settings({ off: ['LA-01', 'MM-01'], on: ['PT-02'], grade: [['PT-02', '알림']] })
    await writeRuleSettings(sb, before, after)
    expect(calls).toHaveLength(1)
    const [call] = calls
    expect(call.table).toBe('claim_rule_settings')
    expect(call.op).toBe('upsert')
    const [rows, options] = call.args as [Record<string, unknown>[], unknown]
    expect(rows).toHaveLength(2)
    expect(rows).toEqual(
      expect.arrayContaining([
        { rule_id: 'MM-01', enabled: false, grade: null },
        { rule_id: 'PT-02', enabled: true, grade: '알림' },
      ]),
    )
    for (const row of rows) expect(Object.keys(row).sort()).toEqual(['enabled', 'grade', 'rule_id'])
    expect(options).toEqual({ onConflict: 'hospital_id,rule_id' })
  })

  it('AC-012.5·AC-012.6: 설정에서 사라진 규칙([기본값으로])은 그 규칙 줄만 지운다', async () => {
    const { sb, calls } = fakeSb()
    await writeRuleSettings(sb, settings({ off: ['LA-01', 'LA-02'] }), settings({ off: ['LA-02'] }))
    expect(calls).toEqual([{ table: 'claim_rule_settings', op: 'delete', args: ['rule_id', ['LA-01']] }])
  })

  it('AC-012.5: 바뀐 것이 없으면 아무것도 보내지 않는다(순서만 달라도)', async () => {
    const { sb, calls } = fakeSb()
    await writeRuleSettings(sb, settings({ off: ['A', 'B'] }), settings({ off: ['B', 'A'] }))
    expect(calls).toEqual([])
  })

  it('AC-012.5: 고친 줄과 지운 줄이 함께 있으면 둘 다 보낸다', async () => {
    const { sb, calls } = fakeSb()
    await writeRuleSettings(sb, settings({ off: ['LA-01'] }), settings({ off: ['LA-02'] }))
    expect(calls.map((c) => c.op)).toEqual(['upsert', 'delete'])
  })

  it.each([
    ['upsert가 오류로 답함', { upsert: { error: { message: SECRET_MESSAGE } } }],
    ['upsert 네트워크 실패', { upsert: 'throw' }],
    ['delete가 오류로 답함', { delete: { error: { message: SECRET_MESSAGE } } }],
    ['delete 네트워크 실패', { delete: 'throw' }],
  ] as const)('AC-012.5: 쓰기 실패(%s)는 E-SETTINGS-FAILED이고 받은 값을 고치지 않는다', async (_name, answers) => {
    const before = settings({ off: ['LA-01'] })
    const after = settings({ off: ['LA-02'] })
    const copy = structuredClone({ before, after })
    expectSettingsFailed(await failure(writeRuleSettings(fakeSb(answers).sb, before, after)))
    expect({ before, after }).toEqual(copy)
  })

  it('AC-012.5: upsert가 실패하면 delete를 부르지 않는다', async () => {
    const { sb, calls } = fakeSb({ upsert: 'throw' })
    await failure(writeRuleSettings(sb, settings({ off: ['LA-01'] }), settings({ off: ['LA-02'] })))
    expect(calls.map((c) => c.op)).toEqual(['upsert'])
  })

  it('AC-012.5: 등급만 있고 켜기·끄기가 없는 규칙은 줄의 enabled를 정할 수 없어 보내지 않고 E-SETTINGS-FAILED', async () => {
    const { sb, calls } = fakeSb()
    expectSettingsFailed(await failure(writeRuleSettings(sb, settings(), settings({ grade: [['LA-01', '알림']] }))))
    expect(calls).toEqual([])
  })
})

describe('AC-012.5 병원 문구·상병 연결표', () => {
  const PHRASES = { TPL: { main: '{부위} 통증' }, CODEMAP: {}, CODEMAP_DEL: [] }

  it('AC-012.5: 한 줄을 {phrases, dxLinks}로 읽고, 줄이 없으면 null', async () => {
    // 상병 연결표 순서는 받은 그대로다(가나다로 맞추지 않는다, AC-012.7)
    const dxLinks = [
      ['MM410', 'M751', '회전근개', 0, 's'],
      ['HA280', 'M170', '무릎관절증', 1, 't'],
    ]
    const found = fakeSb({ select: { data: { phrases: PHRASES, dx_links: dxLinks } } })
    expect(await readHospitalSettings(found.sb)).toEqual({ phrases: PHRASES, dxLinks })
    expect(found.calls.map(({ table, op }) => ({ table, op }))).toEqual([{ table: 'claim_hospital_settings', op: 'select' }])
    expect(await readHospitalSettings(fakeSb({ select: { data: null } }).sb)).toBeNull()
  })

  it('AC-012.5: 쓰기는 phrases·dx_links만 보낸다(hospital_id는 DB 기본값)', async () => {
    const { sb, calls } = fakeSb()
    await writeHospitalSettings(sb, { phrases: PHRASES, dxLinks: [['MM410', 'M751', '회전근개', 0, 's']] })
    expect(calls).toEqual([
      {
        table: 'claim_hospital_settings',
        op: 'upsert',
        args: [{ phrases: PHRASES, dx_links: [['MM410', 'M751', '회전근개', 0, 's']] }, { onConflict: 'hospital_id' }],
      },
    ])
  })

  it.each([
    ['DB가 오류로 답함', { error: { message: SECRET_MESSAGE } }],
    ['네트워크 실패', 'throw'],
  ] as const)('AC-012.5: 읽기·쓰기 실패(%s)는 E-SETTINGS-FAILED', async (_name, answer) => {
    expectSettingsFailed(await failure(readHospitalSettings(fakeSb({ select: answer }).sb)))
    expectSettingsFailed(await failure(writeHospitalSettings(fakeSb({ upsert: answer }).sb, { phrases: PHRASES, dxLinks: [] })))
  })
})

// ── 병원 문구 시작·입력 방식 (spec clinic-profile design.md 9절·12절, TASK-2) ──────────────
// 부름마다 차례로 정해 둔 답을 주는 가짜 클라이언트. 'throw' = 네트워크 실패처럼 약속이 거절된다
type Step = { data?: unknown; error?: { code?: string; message?: string } | null } | 'throw'
type Sent = { table: string; op: string; columns?: string; body?: unknown; filters: [string, unknown][] }

function scriptedSb(steps: Step[]) {
  const sent: Sent[] = []
  const next = () => {
    const step = steps.shift() ?? { data: null }
    if (step === 'throw') return Promise.reject(new Error(SECRET_MESSAGE))
    return Promise.resolve({ data: step.data ?? null, error: step.error ?? null })
  }
  const sb = {
    from: (table: string) => {
      const call: Sent = { table, op: '', filters: [] }
      const builder = {
        select(columns: string) {
          call.op = 'select'
          call.columns = columns
          sent.push(call)
          return builder
        },
        insert(body: unknown) {
          call.op = 'insert'
          call.body = body
          sent.push(call)
          return builder
        },
        update(body: unknown) {
          call.op = 'update'
          call.body = body
          sent.push(call)
          return builder
        },
        eq(column: string, value: unknown) {
          call.filters.push([column, value])
          return builder
        },
        maybeSingle: () => next(),
        then: (ok: (value: unknown) => unknown, no: (reason: unknown) => unknown) => next().then(ok, no),
      }
      return builder
    },
  }
  return { sb: sb as unknown as SupabaseClient, sent }
}

const HOSPITAL_ID = '11111111-2222-4333-8444-555555555555'
const NEUTRAL = { TPL: { main: '{부위} 중립' }, CODEMAP: {}, CODEMAP_DEL: [] }

describe('AC-6607.2 [기본 문구로 바로 시작] startHospitalSettings', () => {
  it('AC-6607.2: 줄이 없으면 문구만 넣는다(상병 연결표는 DB 기본값, hospital_id는 보내지 않는다)', async () => {
    const { sb, sent } = scriptedSb([{ data: null }, { data: null }])
    expect(await startHospitalSettings(sb, NEUTRAL)).toBe('ok')
    expect(sent).toEqual([
      { table: 'claim_hospital_settings', op: 'select', columns: 'hospital_id', filters: [] },
      { table: 'claim_hospital_settings', op: 'insert', body: { phrases: NEUTRAL }, filters: [] },
    ])
  })

  it('AC-6607.2: 줄이 있으면 문구만 바꾼다(상병 연결표 그대로)', async () => {
    const { sb, sent } = scriptedSb([{ data: { hospital_id: HOSPITAL_ID } }, { data: null }])
    expect(await startHospitalSettings(sb, NEUTRAL)).toBe('ok')
    expect(sent[1]).toEqual({ table: 'claim_hospital_settings', op: 'update', body: { phrases: NEUTRAL }, filters: [['hospital_id', HOSPITAL_ID]] })
    expect(sent).toHaveLength(2)
  })

  it('AC-6607.2: 다른 창이 먼저 줄을 만들었으면(23505) 덮어쓰지 않고 다시 읽어 그 줄을 쓴다', async () => {
    const { sb, sent } = scriptedSb([{ data: null }, { error: { code: '23505', message: SECRET_MESSAGE } }, { data: { hospital_id: HOSPITAL_ID } }])
    expect(await startHospitalSettings(sb, NEUTRAL)).toBe('ok')
    expect(sent.map((s) => s.op)).toEqual(['select', 'insert', 'select'])
  })

  it.each([
    ['처음 읽기 오류', [{ error: { message: SECRET_MESSAGE } }]],
    ['처음 읽기 네트워크 실패', ['throw']],
    ['넣기 오류(23505 아님)', [{ data: null }, { error: { code: '42501', message: SECRET_MESSAGE } }]],
    ['넣기 네트워크 실패', [{ data: null }, 'throw']],
    ['23505 뒤 다시 읽기 실패', [{ data: null }, { error: { code: '23505' } }, { error: { message: SECRET_MESSAGE } }]],
    ['23505 뒤에도 줄 없음', [{ data: null }, { error: { code: '23505' } }, { data: null }]],
    ['바꾸기 오류', [{ data: { hospital_id: HOSPITAL_ID } }, { error: { message: SECRET_MESSAGE } }]],
    ['읽은 줄 모양이 틀림', [{ data: { hospital_id: 7 } }]],
  ] as [string, Step[]][])('AC-6607.2: %s면 failed이고 던지지 않는다', async (_name, steps) => {
    expect(await startHospitalSettings(scriptedSb(steps).sb, NEUTRAL)).toBe('failed')
  })
})

describe('AC-6610.1 입력 방식 읽기 readInputMode', () => {
  it.each([
    ['code', 'code'],
    ['date', 'date'],
    [null, null],
    ['week', null],
  ] as const)('AC-6610.1: 저장된 값 %s → 방식 %s(모르는 값은 null = 날짜별)', async (saved, mode) => {
    const { sb, sent } = scriptedSb([{ data: { hospital_id: HOSPITAL_ID, input_mode: saved } }])
    expect(await readInputMode(sb)).toEqual({ hospitalId: HOSPITAL_ID, mode })
    expect(sent).toEqual([{ table: 'claim_hospital_settings', op: 'select', columns: 'hospital_id, input_mode', filters: [] }])
  })

  it.each([
    ['줄 없음', { data: null }],
    ['오류', { error: { message: SECRET_MESSAGE } }],
    ['네트워크 실패', 'throw'],
    ['병원 id 모양이 틀림', { data: { hospital_id: '', input_mode: 'code' } }],
  ] as [string, Step][])('AC-6610.1: %s면 null(지금처럼 날짜별)이고 던지지 않는다', async (_name, step) => {
    expect(await readInputMode(scriptedSb([step]).sb)).toBeNull()
  })
})

describe('AC-6610.2 입력 방식 저장 saveInputMode', () => {
  it('AC-6610.2: input_mode 한 칸만 내 병원 줄에 고친다(병원 문구는 보내지 않는다)', async () => {
    const { sb, sent } = scriptedSb([{ data: null }])
    await saveInputMode(sb, HOSPITAL_ID, 'code')
    expect(sent).toEqual([{ table: 'claim_hospital_settings', op: 'update', body: { input_mode: 'code' }, filters: [['hospital_id', HOSPITAL_ID]] }])
  })

  it.each([
    ['오류', { error: { message: SECRET_MESSAGE } }],
    ['네트워크 실패', 'throw'],
  ] as [string, Step][])('AC-6610.2: 저장이 실패(%s)해도 던지지 않는다(따로 알리지 않는다)', async (_name, step) => {
    await expect(saveInputMode(scriptedSb([step]).sb, HOSPITAL_ID, 'date')).resolves.toBeUndefined()
  })

  it('AC-6610.2: 병원 id가 비었거나 방식이 둘 밖이면 보내지 않는다', async () => {
    const { sb, sent } = scriptedSb([])
    await saveInputMode(sb, '', 'code')
    await saveInputMode(sb, HOSPITAL_ID, 'week' as never)
    expect(sent).toEqual([])
  })
})

// ── 청구 메모 학습 저장(specs/claim-learn design.md 2절·5-1절·6절·7절, TASK-5). 서버 값을 다시 읽어 학습 칸만 바꿔 쓴다 ──────────
// 학습 문장·코드는 지어낸 값이다. 서버로 가는 몸통은 phrases 한 칸이고, 학습 칸은 design.md '학습 모양'뿐이다

const LEARN_KEYS = ['after', 'from', 'id', 'kind', 'left', 'made', 'name', 'on', 'to', 'when']
const WHEN = { codes: ['LA358'], regions: ['lumbar'], chartWords: [], withCodes: [], doctors: [] }
const learnRule = (patch: Partial<LearnRule> = {}): LearnRule => ({
  id: 'l0000000a',
  name: 'LA358 · 허리',
  kind: 'replace',
  from: 'MBB {레벨} {좌우}',
  to: 'MBB {레벨} {좌우} 시행함',
  after: '',
  when: { ...WHEN },
  on: true,
  left: 3,
  made: '2026-11-01',
  ...patch,
})
const draft = (patch: Partial<LearnRule> = {}): Omit<LearnRule, 'id' | 'made'> => {
  const rest: Partial<LearnRule> = { ...learnRule(patch) }
  delete rest.id
  delete rest.made
  return rest as Omit<LearnRule, 'id' | 'made'>
}
const serverPhrases = (learned: LearnRule[] = [], learnKinds?: string[]): Phrases => ({ ...ourClinicPhrases(), learned, ...(learnKinds ? { learnKinds } : {}) })
const rowOf = (phrases: unknown) => ({ data: { hospital_id: HOSPITAL_ID, phrases } })
/** update 몸통의 phrases(없으면 insert 몸통) */
const written = (sent: Sent[]) => {
  const call = sent.find((s) => s.op === 'update' || s.op === 'insert')
  return (call?.body as { phrases: Phrases } | undefined)?.phrases
}
const PHONE = ['010', '1234', '5678'].join('-')

describe('AC-9301.5 saveLearned: 서버 값을 다시 읽어 학습 칸만 바꿔 쓴다', () => {
  it('AC-9301.5: 내 줄의 phrases를 다시 읽고, 학습을 더해 phrases 한 칸만 내 줄에 고친다(다른 칸·다른 학습은 그대로)', async () => {
    const old = learnRule({ id: 'l000000aa', kind: 'remove', from: 'SNB', to: '' })
    const server = serverPhrases([old])
    const { sb, sent } = scriptedSb([rowOf(server), { data: null }])
    const result = await saveLearned(sb, { add: [draft()] })
    expect(sent.map(({ op, columns, filters }) => ({ op, columns, filters }))).toEqual([
      { op: 'select', columns: 'hospital_id, phrases', filters: [] },
      { op: 'update', columns: undefined, filters: [['hospital_id', HOSPITAL_ID]] },
    ])
    expect(Object.keys(sent[1].body as object)).toEqual(['phrases'])
    const next = written(sent)!
    const rest: Partial<Phrases> = { ...next }
    delete rest.learned
    const restBefore: Partial<Phrases> = { ...server }
    delete restBefore.learned
    expect(rest).toEqual(restBefore)
    const learned = next.learned!
    expect(learned).toHaveLength(2)
    expect(learned[0]).toEqual(old)
    expect(learned[1]).toEqual({ ...draft(), id: expect.stringMatching(/^l[0-9a-f]{8}$/), made: todayInKorea() })
    expect(Object.keys(learned[1]).sort()).toEqual(LEARN_KEYS)
    expect(result).toEqual({ ok: true, phrases: next, added: [learned[1].id], before: [] })
  })

  it('AC-9301.5: 화면이 붙인 번호·만든 날은 그대로 쓰고, 이미 있는 번호면 새 번호를 붙인다', async () => {
    const old = learnRule({ id: 'l000000aa', from: 'SNB' })
    const { sb, sent } = scriptedSb([rowOf(serverPhrases([old])), { data: null }])
    const result = await saveLearned(sb, { add: [{ ...draft({ from: 'MBB {레벨}' }), id: 'l12345678', made: '2026-11-20' }, { ...draft({ from: 'IA' }), id: 'l000000aa' }] })
    const learned = written(sent)!.learned!
    expect(learned[1]).toMatchObject({ id: 'l12345678', made: '2026-11-20' })
    expect(learned[2].id).not.toBe('l000000aa')
    expect(new Set(learned.map((r) => r.id)).size).toBe(3)
    expect(result.ok && result.added).toEqual(['l12345678', learned[2].id])
  })

  it('AC-9301.1: 바꾸기는 그 학습만 고치고 남은 확인을 3으로 돌리며(주면 그 값), 바꾸기 전 학습을 돌려준다. 지우기는 그 번호를 뺀다', async () => {
    const a = learnRule({ id: 'l000000aa', left: 1 })
    const b = learnRule({ id: 'l000000bb', from: 'SNB', left: 0 })
    const c = learnRule({ id: 'l000000cc', from: 'IA' })
    const { sb, sent } = scriptedSb([rowOf(serverPhrases([a, b, c])), { data: null }])
    const result = await saveLearned(sb, { update: [{ id: a.id, to: 'MBB {레벨} {좌우} 시행' }, { id: b.id, on: false, left: 0 }, { id: 'l99999999', to: '없는 학습' }], remove: [c.id] })
    expect(written(sent)!.learned).toEqual([{ ...a, to: 'MBB {레벨} {좌우} 시행', left: 3 }, { ...b, on: false, left: 0 }])
    expect(result).toMatchObject({ ok: true, added: [], before: [a, b] })
  })

  it('AC-9301.1: 이미 있는 학습과 할 일·줄 틀·앞 줄 틀·조건이 같은 더하기는 새로 더하지 않고 그 학습의 문장을 바꾼다(남은 확인 3)', async () => {
    const a = learnRule({ id: 'l000000aa', left: 0 })
    const { sb, sent } = scriptedSb([rowOf(serverPhrases([a])), { data: null }])
    const result = await saveLearned(sb, { add: [draft({ to: 'MBB {레벨} {좌우} 시행함 (C-arm)' })] })
    expect(written(sent)!.learned).toEqual([{ ...a, to: 'MBB {레벨} {좌우} 시행함 (C-arm)', left: 3 }])
    expect(result).toMatchObject({ ok: true, added: [], before: [a] })
  })

  it('AC-9310.3: 병원 문구 줄이 없으면 기본 문구(neutralPhrases) + 그 학습으로 처음 만든다', async () => {
    const { sb, sent } = scriptedSb([{ data: null }, { data: null }, { data: null }])
    const result = await saveLearned(sb, { add: [draft()] })
    expect(sent.map((s) => s.op)).toEqual(['select', 'select', 'insert'])
    const made = written(sent)!
    const rest: Partial<Phrases> = { ...made }
    delete rest.learned
    expect(rest).toEqual(neutralPhrases())
    expect(made.learned).toEqual([expect.objectContaining({ ...draft(), made: todayInKorea() })])
    expect(validatePhrases(made).ok).toBe(true)
    expect(result.ok).toBe(true)
  })

  it.each([
    ['다시 읽기 오류', [{ error: { message: SECRET_MESSAGE } }]],
    ['다시 읽기 네트워크 실패', ['throw']],
    ['쓰기 오류', [rowOf(serverPhrases()), { error: { message: SECRET_MESSAGE } }]],
    ['쓰기 네트워크 실패', [rowOf(serverPhrases()), 'throw']],
    ['읽은 문구가 객체가 아님', [rowOf('글자')]],
    ['처음 만들기 실패', [{ data: null }, { error: { message: SECRET_MESSAGE } }]],
  ] as [string, Step[]][])('AC-9301.6: %s면 E-LEARN-SAVE이고 던지지 않는다', async (_name, steps) => {
    const result = await saveLearned(scriptedSb(steps).sb, { add: [draft()] })
    expect(result).toEqual({ ok: false, code: 'E-LEARN-SAVE', limit: false })
    expect(JSON.stringify(result)).not.toContain('does not exist')
  })

  it('AC-9301.6·AC-9304.3: 학습이 300개를 넘으면 쓰지 않고 E-LEARN-SAVE(한도)다', async () => {
    const full = Array.from({ length: 300 }, (_, i) => learnRule({ id: `l${i.toString(16).padStart(8, '0')}`, from: `MBB ${i}` }))
    const { sb, sent } = scriptedSb([rowOf(serverPhrases(full))])
    expect(await saveLearned(sb, { add: [draft()] })).toEqual({ ok: false, code: 'E-LEARN-SAVE', limit: true })
    expect(sent.map((s) => s.op)).toEqual(['select'])
  })

  it('AC-9301.6: 바꾼 문구가 병원 문구 검사를 지나지 못하면(틀린 학습 모양) 쓰지 않는다: 병원 전체 메모가 잠기지 않게', async () => {
    const { sb, sent } = scriptedSb([rowOf(serverPhrases())])
    expect(await saveLearned(sb, { add: [draft({ from: '' })] })).toEqual({ ok: false, code: 'E-LEARN-SAVE', limit: false })
    expect(sent.map((s) => s.op)).toEqual(['select'])
  })

  it('AC-9301.5·AC-9316.2: 학습 문장·이름·차트 말에 전화·주민번호·메일 모양이 있으면 읽지도 쓰지도 않고 E-LEARN-PERSONAL이다', async () => {
    const patches: Partial<LearnRule>[] = [{ to: `MBB ${PHONE}` }, { from: 'MBB 900101-1234567' }, { name: 'a@b.co' }, { when: { ...WHEN, chartWords: [PHONE] } }]
    for (const patch of patches) {
      const { sb, sent } = scriptedSb([rowOf(serverPhrases())])
      expect(await saveLearned(sb, { add: [draft(patch)] })).toEqual({ ok: false, code: 'E-LEARN-PERSONAL', limit: false })
      expect(sent).toEqual([])
    }
    const { sb, sent } = scriptedSb([rowOf(serverPhrases([learnRule()]))])
    expect(await saveLearned(sb, { update: [{ id: 'l0000000a', to: `연락 ${PHONE}` }] })).toMatchObject({ ok: false, code: 'E-LEARN-PERSONAL' })
    expect(sent).toEqual([])
  })
})

describe('AC-9301.2 revertLearned: [이번만 고친 거예요]', () => {
  it('AC-9301.2: 방금 더한 학습은 지우고, 바꾼 학습은 바꾸기 전 문장·남은 확인으로 되돌린다(다른 학습은 그대로)', async () => {
    const before = learnRule({ id: 'l000000aa', to: '옛 문장', left: 1 })
    const other = learnRule({ id: 'l000000cc', from: 'IA' })
    const now = [{ ...before, to: '새 문장', left: 3 }, learnRule({ id: 'l000000bb', from: 'SNB' }), other]
    const { sb, sent } = scriptedSb([rowOf(serverPhrases(now)), { data: null }])
    const result = await revertLearned(sb, { added: ['l000000bb'], before: [before] })
    expect(written(sent)!.learned).toEqual([before, other])
    expect(result.ok).toBe(true)
  })

  it('AC-9301.2: 되돌리다 실패하면 E-LEARN-SAVE다', async () => {
    expect(await revertLearned(scriptedSb(['throw']).sb, { added: ['l000000bb'], before: [] })).toEqual({ ok: false, code: 'E-LEARN-SAVE', limit: false })
  })
})

describe('AC-9302.7 tickLearned: 남은 확인 바꾸기', () => {
  it('AC-9302.7: done이면 그 학습의 남은 확인이 쓰인 수만큼 하나씩 줄고 0 아래로 가지 않는다', async () => {
    const a = learnRule({ id: 'l000000aa', left: 3 })
    const b = learnRule({ id: 'l000000bb', from: 'SNB', left: 1 })
    const c = learnRule({ id: 'l000000cc', from: 'IA', left: 2 })
    const { sb, sent } = scriptedSb([rowOf(serverPhrases([a, b, c])), { data: null }])
    expect(await tickLearned(sb, [a.id, a.id, b.id, b.id, 'l99999999'], 'done')).toBe('ok')
    expect(written(sent)!.learned).toEqual([{ ...a, left: 1 }, { ...b, left: 0 }, c])
  })

  it('AC-9302.7: edited면 남은 확인이 3으로 돌아간다', async () => {
    const a = learnRule({ id: 'l000000aa', left: 0 })
    const { sb, sent } = scriptedSb([rowOf(serverPhrases([a])), { data: null }])
    expect(await tickLearned(sb, [a.id], 'edited')).toBe('ok')
    expect(written(sent)!.learned).toEqual([{ ...a, left: 3 }])
  })

  it('AC-9302.7: 바뀌는 것이 없거나(이미 0·번호 없음·줄 없음) 번호가 비면 쓰지 않는다', async () => {
    const cases: [Step[], string[]][] = [
      [[rowOf(serverPhrases([learnRule({ left: 0 })]))], ['l0000000a']],
      [[rowOf(serverPhrases([learnRule()]))], ['l99999999']],
      [[{ data: null }], ['l0000000a']],
      [[], []],
    ]
    for (const [steps, ids] of cases) {
      const { sb, sent } = scriptedSb(steps)
      expect(await tickLearned(sb, ids, 'done')).toBe('ok')
      expect(sent.filter((s) => s.op !== 'select')).toEqual([])
    }
  })

  it('AC-9302.7: 실패하면 failed이고 던지지 않는다(메모 일은 막지 않는다)', async () => {
    expect(await tickLearned(scriptedSb(['throw']).sb, ['l0000000a'], 'done')).toBe('failed')
    expect(await tickLearned(scriptedSb([rowOf(serverPhrases([learnRule({ left: 1 })])), { error: { message: SECRET_MESSAGE } }]).sb, ['l0000000a'], 'edited')).toBe('failed')
  })
})

describe('AC-9305.3 addLearnKinds: 처음 학습 확인한 종류', () => {
  it('AC-9305.3: 종류 열쇠를 더한다(겹침·빈 열쇠는 빼고 열쇠마다 120자까지)', async () => {
    const { sb, sent } = scriptedSb([rowOf(serverPhrases([], ['LA358|lumbar'])), { data: null }])
    expect(await addLearnKinds(sb, ['LA358|lumbar', 'KK090|knee', '', 'K'.repeat(130)])).toBe('ok')
    expect(written(sent)!.learnKinds).toEqual(['LA358|lumbar', 'KK090|knee', 'K'.repeat(120)])
    expect(written(sent)!.learned).toEqual([])
  })

  it('AC-9305.3·AC-9310.3: 병원 문구 줄이 없으면 기본 문구 + 그 종류로 처음 만든다', async () => {
    const { sb, sent } = scriptedSb([{ data: null }, { data: null }, { data: null }])
    expect(await addLearnKinds(sb, ['LA358|lumbar'])).toBe('ok')
    expect(written(sent)).toEqual({ ...neutralPhrases(), learnKinds: ['LA358|lumbar'] })
  })

  it('AC-9305.3: 더할 것이 없으면 쓰지 않고, 2000개를 넘거나 실패하면 failed다', async () => {
    const same = scriptedSb([rowOf(serverPhrases([], ['LA358|lumbar']))])
    expect(await addLearnKinds(same.sb, ['LA358|lumbar'])).toBe('ok')
    expect(same.sent.map((s) => s.op)).toEqual(['select'])
    const full = scriptedSb([rowOf(serverPhrases([], Array.from({ length: 2000 }, (_, i) => `K${i}|knee`)))])
    expect(await addLearnKinds(full.sb, ['LA358|lumbar'])).toBe('failed')
    expect(full.sent.map((s) => s.op)).toEqual(['select'])
    expect(await addLearnKinds(scriptedSb(['throw']).sb, ['LA358|lumbar'])).toBe('failed')
  })
})

describe('AC-9301.1 학습 저장은 한 번에 하나씩', () => {
  it('AC-9301.1·AC-9302.7: 저절로 학습 저장과 남은 확인 바꿈을 함께 불러도 앞 것이 쓴 뒤에 다음 것이 다시 읽는다(서로 덮지 않는다)', async () => {
    const a = learnRule({ id: 'l000000aa', left: 3 })
    const b = learnRule({ id: 'l000000bb', from: 'SNB' })
    const { sb, sent } = scriptedSb([rowOf(serverPhrases([a])), { data: null }, rowOf(serverPhrases([a, b])), { data: null }])
    const [saved, ticked] = await Promise.all([saveLearned(sb, { add: [{ ...draft({ from: 'SNB' }), id: 'l000000bb', made: b.made }] }), tickLearned(sb, [a.id], 'done')])
    expect(saved.ok).toBe(true)
    expect(ticked).toBe('ok')
    expect(sent.map((s) => s.op)).toEqual(['select', 'update', 'select', 'update'])
    expect((sent[3].body as { phrases: Phrases }).phrases.learned).toEqual([{ ...a, left: 2 }, b])
  })
})
