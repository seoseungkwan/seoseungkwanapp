import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import {
  checkTemplate,
  PatientsStorageError,
  readTemplates,
  saveTemplates,
  type MessageTemplate,
  type TemplateDraft,
} from './messageTemplates'

// 실제 Supabase에 붙지 않는다. 어떤 표·칸·몸통으로 어떤 차례로 불렀는지만 기록한다
type Call = { table: string; op: string; columns?: string; body?: unknown; orders?: string[]; filter?: unknown[] }
type Reply = { data?: unknown; error?: unknown }
type Answer = (call: Call) => Reply | Error

function fakeSb(answer: Answer = () => ({ data: [], error: null })) {
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
        order(column: string) {
          call.orders = [...(call.orders ?? []), column]
          return builder
        },
        insert(body: unknown) {
          call.op = 'insert'
          call.body = body
          return builder
        },
        update(body: unknown) {
          call.op = 'update'
          call.body = body
          return builder
        },
        delete() {
          call.op = 'delete'
          return builder
        },
        eq(column: string, value: unknown) {
          call.filter = ['eq', column, value]
          return builder
        },
        in(column: string, values: unknown[]) {
          call.filter = ['in', column, values]
          return builder
        },
        then(resolve: (value: Reply) => unknown, reject: (reason: unknown) => unknown) {
          calls.push(call)
          const reply = answer(call)
          return (reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply)).then(resolve, reject)
        },
      }
      return builder
    },
  }
  return { sb: sb as unknown as SupabaseClient, calls }
}

const RAW = 'new row violates check constraint (secret detail)'

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

const writes = (calls: Call[]) => calls.filter((call) => call.op !== 'select')

const A: MessageTemplate = { id: 'a', kind: 'injection', name: '주사 안내', body: '주사 글', sort_order: 0 }
const B: MessageTemplate = { id: 'b', kind: 'followup', name: '진료 안내', body: '진료 글', sort_order: 1 }
const draftOf = ({ id, kind, name, body }: MessageTemplate): TemplateDraft => ({ id, kind, name, body })

describe('AC-609.1 readTemplates', () => {
  it('AC-609.1: message_templates를 sort_order, kind 순서로 읽어 그대로 돌려준다', async () => {
    const { sb, calls } = fakeSb(() => ({ data: [A, B], error: null }))
    await expect(readTemplates(sb)).resolves.toEqual([A, B])
    expect(calls).toEqual([
      {
        table: 'message_templates',
        op: 'select',
        columns: 'id, kind, name, body, sort_order',
        orders: ['sort_order', 'kind'],
      },
    ])
  })

  it('AC-609.1: 줄이 없으면 []', async () => {
    const { sb } = fakeSb(() => ({ data: [], error: null }))
    await expect(readTemplates(sb)).resolves.toEqual([])
  })

  it('AC-609.1: 읽기 오류 답이면 []가 아니라 E-PATIENTS-TEMPLATES-READ', async () => {
    const { sb } = fakeSb(() => ({ data: null, error: { message: RAW } }))
    await expectCode(readTemplates(sb), 'E-PATIENTS-TEMPLATES-READ')
  })

  it('AC-609.1: 네트워크로 터져도 []가 아니라 E-PATIENTS-TEMPLATES-READ', async () => {
    const { sb } = fakeSb(() => new Error(RAW))
    await expectCode(readTemplates(sb), 'E-PATIENTS-TEMPLATES-READ')
  })

  it('AC-609.1: 오류도 줄도 없는 답도 []로 바꾸지 않고 E-PATIENTS-TEMPLATES-READ', async () => {
    const { sb } = fakeSb(() => ({ data: null, error: null }))
    await expectCode(readTemplates(sb), 'E-PATIENTS-TEMPLATES-READ')
  })
})

describe('AC-609.2 saveTemplates 요청', () => {
  it('AC-609.2: 더한 줄은 insert 한 번에 네 칸만 보낸다(id·hospital_id·updated_at 없음)', async () => {
    const { sb, calls } = fakeSb()
    const added: TemplateDraft = { kind: 'followup', name: '새 문구', body: '새 글' }
    await saveTemplates(sb, [A], [draftOf(A), added])
    expect(writes(calls)).toEqual([
      {
        table: 'message_templates',
        op: 'insert',
        body: [{ kind: 'followup', name: '새 문구', body: '새 글', sort_order: 1 }],
      },
    ])
  })

  it('AC-609.2: 더한 줄이 여럿이어도 insert 요청은 하나다(한꺼번에 들어가거나 안 들어간다)', async () => {
    const { sb, calls } = fakeSb()
    await saveTemplates(
      sb,
      [],
      [
        { kind: 'injection', name: '하나', body: '글 하나' },
        { kind: 'followup', name: '둘', body: '글 둘' },
      ],
    )
    expect(writes(calls)).toEqual([
      {
        table: 'message_templates',
        op: 'insert',
        body: [
          { kind: 'injection', name: '하나', body: '글 하나', sort_order: 0 },
          { kind: 'followup', name: '둘', body: '글 둘', sort_order: 1 },
        ],
      },
    ])
  })

  it('AC-609.2: before에 없는 id를 단 줄은 새 줄로 넣고 id를 보내지 않는다', async () => {
    const { sb, calls } = fakeSb()
    await saveTemplates(sb, [], [{ id: 'stale', kind: 'injection', name: '이름', body: '글' }])
    expect(writes(calls)).toEqual([
      {
        table: 'message_templates',
        op: 'insert',
        body: [{ kind: 'injection', name: '이름', body: '글', sort_order: 0 }],
      },
    ])
  })

  it.each([
    ['이름이', { name: '고친 이름' }],
    ['내용이', { body: '고친 글' }],
    ['종류가', { kind: 'followup' as const }],
  ])('AC-609.2: %s 바뀐 줄만 update하고 몸통에 id·hospital_id·updated_at이 없다', async (_label, change) => {
    const { sb, calls } = fakeSb()
    await saveTemplates(sb, [A, B], [{ ...draftOf(A), ...change }, draftOf(B)])
    expect(writes(calls)).toEqual([
      {
        table: 'message_templates',
        op: 'update',
        body: { kind: A.kind, name: A.name, body: A.body, sort_order: 0, ...change },
        filter: ['eq', 'id', 'a'],
      },
    ])
  })

  it('AC-609.2: 빠진 줄은 delete 한 번으로 지운다', async () => {
    const { sb, calls } = fakeSb()
    const C: MessageTemplate = { ...B, id: 'c', sort_order: 2 }
    await saveTemplates(sb, [A, B, C], [draftOf(A)])
    expect(writes(calls)).toEqual([{ table: 'message_templates', op: 'delete', filter: ['in', 'id', ['b', 'c']] }])
  })

  it('AC-609.2: 순서를 바꾸면 차례가 곧 sort_order인 update를 보낸다', async () => {
    const { sb, calls } = fakeSb()
    await saveTemplates(sb, [A, B], [draftOf(B), draftOf(A)])
    expect(writes(calls)).toEqual([
      {
        table: 'message_templates',
        op: 'update',
        body: { kind: B.kind, name: B.name, body: B.body, sort_order: 0 },
        filter: ['eq', 'id', 'b'],
      },
      {
        table: 'message_templates',
        op: 'update',
        body: { kind: A.kind, name: A.name, body: A.body, sort_order: 1 },
        filter: ['eq', 'id', 'a'],
      },
    ])
  })

  it('AC-609.2: 앞 줄을 지우면 뒤 줄 sort_order가 당겨진다', async () => {
    const { sb, calls } = fakeSb()
    await saveTemplates(sb, [A, B], [draftOf(B)])
    expect(writes(calls)).toEqual([
      {
        table: 'message_templates',
        op: 'update',
        body: { kind: B.kind, name: B.name, body: B.body, sort_order: 0 },
        filter: ['eq', 'id', 'b'],
      },
      { table: 'message_templates', op: 'delete', filter: ['in', 'id', ['a']] },
    ])
  })

  it('AC-609.2: 바뀐 것이 없으면 쓰지 않고 다시 읽기만 한다', async () => {
    const { sb, calls } = fakeSb(() => ({ data: [A, B], error: null }))
    await expect(saveTemplates(sb, [A, B], [draftOf(A), draftOf(B)])).resolves.toEqual([A, B])
    expect(calls.map((call) => call.op)).toEqual(['select'])
  })

  it('AC-609.2: 섞여 온 다른 칸은 보내지 않는다', async () => {
    const { sb, calls } = fakeSb()
    const tampered = {
      kind: 'injection',
      name: '이름',
      body: '글',
      hospital_id: 'other',
      updated_at: '2026-01-01',
      sort_order: 50,
    } as TemplateDraft
    await saveTemplates(sb, [], [tampered])
    expect(writes(calls)[0].body).toEqual([{ kind: 'injection', name: '이름', body: '글', sort_order: 0 }])
  })

  it('AC-609.2: 쓰기를 마친 뒤 다시 읽은 목록을 돌려준다', async () => {
    const saved: MessageTemplate = { id: 'new', kind: 'injection', name: '이름', body: '글', sort_order: 0 }
    const { sb, calls } = fakeSb((call) => (call.op === 'select' ? { data: [saved], error: null } : { error: null }))
    await expect(saveTemplates(sb, [], [{ kind: 'injection', name: '이름', body: '글' }])).resolves.toEqual([saved])
    expect(calls.map((call) => call.op)).toEqual(['insert', 'select'])
  })

  it('AC-609.2: 100개는 저장하고 마지막 sort_order는 99다', async () => {
    const { sb, calls } = fakeSb()
    const hundred = Array.from({ length: 100 }, (_, i): TemplateDraft => ({ kind: 'injection', name: `n${i}`, body: 'b' }))
    await saveTemplates(sb, [], hundred)
    const body = writes(calls)[0].body as { sort_order: number }[]
    expect(body).toHaveLength(100)
    expect(body[99].sort_order).toBe(99)
  })
})

describe('AC-609.2 saveTemplates 실패', () => {
  const failOn =
    (op: string, reply: Reply | Error): Answer =>
    (call) =>
      call.op === op ? reply : { data: [], error: null }
  const CHANGED = { ...draftOf(A), name: '고친 이름' }
  const ADDED: TemplateDraft = { kind: 'followup', name: '새 문구', body: '새 글' }

  it.each([
    ['insert', [], [ADDED]],
    ['update', [A], [CHANGED]],
    ['delete', [A], []],
  ] as const)('AC-609.2: %s 오류 답이면 E-PATIENTS-TEMPLATES-SAVE이고 DB 글을 싣지 않는다', async (op, before, after) => {
    const { sb } = fakeSb(failOn(op, { error: { message: RAW } }))
    await expectCode(saveTemplates(sb, [...before], [...after]), 'E-PATIENTS-TEMPLATES-SAVE')
  })

  it.each([
    ['insert', [], [ADDED]],
    ['update', [A], [CHANGED]],
    ['delete', [A], []],
  ] as const)('AC-609.2: %s가 네트워크로 터져도 E-PATIENTS-TEMPLATES-SAVE', async (op, before, after) => {
    const { sb } = fakeSb(failOn(op, new Error(RAW)))
    await expectCode(saveTemplates(sb, [...before], [...after]), 'E-PATIENTS-TEMPLATES-SAVE')
  })

  it('AC-609.2: 고치기·지우기가 실패하면 새 줄을 넣지 않아 같은 값으로 [다시 저장]해도 줄이 겹치지 않는다', async () => {
    for (const op of ['update', 'delete']) {
      const { sb, calls } = fakeSb(failOn(op, { error: { message: RAW } }))
      await expectCode(saveTemplates(sb, [A, B], [CHANGED, ADDED]), 'E-PATIENTS-TEMPLATES-SAVE')
      expect(calls.map((call) => call.op)).not.toContain('insert')
    }
  })

  it('AC-609.2: 첫 update가 실패하면 뒤 줄을 더 보내지 않는다', async () => {
    const { sb, calls } = fakeSb(failOn('update', { error: { message: RAW } }))
    await expectCode(saveTemplates(sb, [A, B], [draftOf(B), draftOf(A)]), 'E-PATIENTS-TEMPLATES-SAVE')
    expect(writes(calls)).toHaveLength(1)
  })

  it('AC-609.2: 100개를 넘으면 아무것도 보내지 않고 E-PATIENTS-TEMPLATES-SAVE', async () => {
    const { sb, calls } = fakeSb()
    const tooMany = Array.from({ length: 101 }, (_, i): TemplateDraft => ({ kind: 'injection', name: `n${i}`, body: 'b' }))
    await expectCode(saveTemplates(sb, [], tooMany), 'E-PATIENTS-TEMPLATES-SAVE')
    expect(calls).toEqual([])
  })

  it('AC-609.2: 검사를 못 넘는 줄이 하나라도 있으면 아무것도 보내지 않고 E-PATIENTS-TEMPLATES-SAVE', async () => {
    const { sb, calls } = fakeSb()
    await expectCode(saveTemplates(sb, [A], [{ ...draftOf(A), name: '' }, ADDED]), 'E-PATIENTS-TEMPLATES-SAVE')
    expect(calls).toEqual([])
  })

  it('AC-609.2: 쓰기는 됐는데 다시 읽기만 실패하면 E-PATIENTS-TEMPLATES-READ(저장 실패로 알려 [다시 저장]이 줄을 겹치게 하지 않는다)', async () => {
    const { sb } = fakeSb(failOn('select', { data: null, error: { message: RAW } }))
    await expectCode(saveTemplates(sb, [], [ADDED]), 'E-PATIENTS-TEMPLATES-READ')
  })
})

describe('AC-609.2 checkTemplate', () => {
  const draft = (name: string, body: string, kind = 'injection') => ({ name, body, kind }) as TemplateDraft
  const OK = '글'

  it.each([
    ['0자', '', 'name'],
    ['공백뿐', ' \n\t ', 'name'],
    ['1자', '가', null],
    ['30자', '가'.repeat(30), null],
    ['31자', '가'.repeat(31), 'name'],
    ['앞뒤 공백까지 31자(DB가 세는 대로)', ` ${'가'.repeat(30)}`, 'name'],
    ['그림 문자 30자(DB는 코드포인트로 센다)', '😀'.repeat(30), null],
    ['그림 문자 31자', '😀'.repeat(31), 'name'],
  ])('AC-609.2: 이름 %s', (_label, name, expected) => {
    expect(checkTemplate(draft(name, OK))).toBe(expected)
  })

  it.each([
    ['0자', '', 'body'],
    ['공백뿐', '   ', 'body'],
    ['1자', '가', null],
    ['2000자', '가'.repeat(2000), null],
    ['2001자', '가'.repeat(2001), 'body'],
  ])('AC-609.2: 내용 %s', (_label, body, expected) => {
    expect(checkTemplate(draft('이름', body))).toBe(expected)
  })

  it.each([
    ['injection', null],
    ['followup', null],
    ['other', 'kind'],
    ['', 'kind'],
  ])('AC-609.2: 종류 "%s"', (kind, expected) => {
    expect(checkTemplate(draft('이름', OK, kind))).toBe(expected)
  })
})
