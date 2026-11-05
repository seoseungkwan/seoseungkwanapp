import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { checkContactCount, readContactCount, upsertContactCount } from './contactCounts'
import { PatientsStorageError } from './messageTemplates'

// 실제 Supabase에 붙지 않는다. 어떤 표·칸·몸통으로 불렀는지만 기록한다
type Call = { table: string; op: string; columns?: string; body?: unknown; options?: unknown; single?: boolean }
type Reply = { data?: unknown; error?: unknown }

function fakeSb(reply: Reply | Error = { data: null, error: null }) {
  const calls: Call[] = []
  const sb = {
    from(table: string) {
      const call: Call = { table, op: '' }
      const builder = {
        select(columns: string) {
          call.op = 'select'
          call.columns = columns
          return builder
        },
        upsert(body: unknown, options: unknown) {
          call.op = 'upsert'
          call.body = body
          call.options = options
          return builder
        },
        maybeSingle() {
          call.single = true
          return builder
        },
        then(resolve: (value: Reply) => unknown, reject: (reason: unknown) => unknown) {
          calls.push(call)
          return (reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply)).then(resolve, reject)
        },
      }
      return builder
    },
  }
  return { sb: sb as unknown as SupabaseClient, calls }
}

const RAW = 'relation "public.contact_counts" does not exist (secret detail)'

// 실패하면 정해 둔 오류 번호이고, DB가 준 원래 글은 메시지에 없다
async function expectCode(run: Promise<unknown>, code: string) {
  const caught = await run.then(
    () => undefined,
    (reason: unknown) => reason,
  )
  expect(caught).toBeInstanceOf(PatientsStorageError)
  expect((caught as PatientsStorageError).code).toBe(code)
  expect((caught as PatientsStorageError).message).not.toContain('secret detail')
}

describe('AC-609.3 checkContactCount', () => {
  it.each([
    ['0과 0', { followup_left: 0, injection_left: 0 }],
    ['상한 100000', { followup_left: 100000, injection_left: 100000 }],
    ['보통 값', { followup_left: 3, injection_left: 12 }],
  ])('AC-609.3: %s는 통과한다', (_name, row) => {
    expect(checkContactCount(row)).toEqual(row)
  })

  it('AC-609.3: 돌려주는 값은 넘어온 객체가 아니라 두 칸만 담은 새 객체다', () => {
    const row = { followup_left: 1, injection_left: 2 }
    const checked = checkContactCount(row)
    expect(checked).not.toBe(row)
    expect(Object.keys(checked).sort()).toEqual(['followup_left', 'injection_left'])
  })

  it.each([
    ['칸이 더 있음(이름)', { followup_left: 1, injection_left: 2, name: '홍길동' }],
    ['칸이 더 있음(날짜)', { followup_left: 1, injection_left: 2, date: '2026-11-01' }],
    ['칸이 더 있음(hospital_id)', { followup_left: 1, injection_left: 2, hospital_id: 'x' }],
    ['글자', { followup_left: '1', injection_left: 2 }],
    ['-1', { followup_left: -1, injection_left: 2 }],
    ['100001', { followup_left: 1, injection_left: 100001 }],
    ['1.5', { followup_left: 1.5, injection_left: 2 }],
    ['NaN', { followup_left: 1, injection_left: Number.NaN }],
    ['무한대', { followup_left: Number.POSITIVE_INFINITY, injection_left: 2 }],
    ['null 값', { followup_left: null, injection_left: 2 }],
    ['칸이 모자람', { followup_left: 1 }],
    ['다른 칸 둘', { followup_left: 1, other: 2 }],
    ['빈 객체', {}],
    ['배열', [1, 2]],
    ['null', null],
    ['undefined', undefined],
    ['글자 하나', '1,2'],
  ])('AC-609.3: %s는 E-PATIENTS-COUNTS-SAVE로 거절한다', (_name, row) => {
    let caught: unknown
    try {
      checkContactCount(row)
    } catch (reason) {
      caught = reason
    }
    expect(caught).toBeInstanceOf(PatientsStorageError)
    expect((caught as PatientsStorageError).code).toBe('E-PATIENTS-COUNTS-SAVE')
  })
})

describe('AC-609.3 upsertContactCount', () => {
  it('AC-609.3: contact_counts에 두 칸만 hospital_id 충돌 기준으로 한 번 보낸다', async () => {
    const { sb, calls } = fakeSb()
    await expect(upsertContactCount(sb, { followup_left: 4, injection_left: 7 })).resolves.toBeUndefined()
    expect(calls).toEqual([
      {
        table: 'contact_counts',
        op: 'upsert',
        body: { followup_left: 4, injection_left: 7 },
        options: { onConflict: 'hospital_id' },
      },
    ])
  })

  it('AC-609.3: 다른 칸이 섞인 값은 아무것도 보내지 않고 E-PATIENTS-COUNTS-SAVE', async () => {
    const { sb, calls } = fakeSb()
    const tampered = { followup_left: 4, injection_left: 7, name: '홍길동' }
    await expectCode(upsertContactCount(sb, tampered), 'E-PATIENTS-COUNTS-SAVE')
    expect(calls).toEqual([])
  })

  it('AC-609.3: 범위를 벗어난 값은 아무것도 보내지 않고 E-PATIENTS-COUNTS-SAVE', async () => {
    const { sb, calls } = fakeSb()
    await expectCode(upsertContactCount(sb, { followup_left: -1, injection_left: 7 }), 'E-PATIENTS-COUNTS-SAVE')
    expect(calls).toEqual([])
  })

  it('AC-609.3: 올리기 오류 답이면 E-PATIENTS-COUNTS-SAVE이고 DB 글을 싣지 않는다', async () => {
    const { sb } = fakeSb({ data: null, error: { message: RAW } })
    await expectCode(upsertContactCount(sb, { followup_left: 4, injection_left: 7 }), 'E-PATIENTS-COUNTS-SAVE')
  })

  it('AC-609.3: 네트워크로 터져도 E-PATIENTS-COUNTS-SAVE이고 DB 글을 싣지 않는다', async () => {
    const { sb } = fakeSb(new Error(RAW))
    await expectCode(upsertContactCount(sb, { followup_left: 4, injection_left: 7 }), 'E-PATIENTS-COUNTS-SAVE')
  })
})

describe('AC-609.4 readContactCount', () => {
  it('AC-609.4: contact_counts에서 세 칸을 한 줄로 읽어 그대로 돌려준다', async () => {
    const row = { followup_left: 4, injection_left: 7, updated_at: '2026-11-01T01:02:03+00:00' }
    const { sb, calls } = fakeSb({ data: row, error: null })
    await expect(readContactCount(sb)).resolves.toEqual(row)
    expect(calls).toEqual([
      { table: 'contact_counts', op: 'select', columns: 'followup_left, injection_left, updated_at', single: true },
    ])
  })

  it('AC-609.4: 줄이 없으면 null', async () => {
    const { sb } = fakeSb({ data: null, error: null })
    await expect(readContactCount(sb)).resolves.toBeNull()
  })

  it('AC-609.4: 읽기 오류 답이면 null이 아니라 E-PATIENTS-COUNTS-READ', async () => {
    const { sb } = fakeSb({ data: null, error: { message: RAW } })
    await expectCode(readContactCount(sb), 'E-PATIENTS-COUNTS-READ')
  })

  it('AC-609.4: 네트워크로 터져도 null이 아니라 E-PATIENTS-COUNTS-READ', async () => {
    const { sb } = fakeSb(new Error(RAW))
    await expectCode(readContactCount(sb), 'E-PATIENTS-COUNTS-READ')
  })
})
