import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import type { SavedRuleSettings } from '@/types/precheck'
import {
  SettingsError,
  changedRuleIds,
  diffRuleSettings,
  withRulesFrom,
  readHospitalSettings,
  readRuleRows,
  readRuleSettings,
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
