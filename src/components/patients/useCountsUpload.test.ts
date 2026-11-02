// @vitest-environment jsdom
import type { SupabaseClient } from '@supabase/supabase-js'
import { act, cleanup, renderHook } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ContactCount } from '@/types/patients'
import { useCountsUpload } from './useCountsUpload'

// 남은 건수 올리기(REQ-614). 실제 Supabase에 붙지 않는다. 요청 몸통을 기록하고, 답은 시험이 정한 때에 준다(늦은 답·순서를 시험한다)
afterEach(cleanup)

const A: ContactCount = { followup_left: 1, injection_left: 2 }
const B: ContactCount = { followup_left: 0, injection_left: 2 }
const C: ContactCount = { followup_left: 0, injection_left: 1 }
const SAVE = 'E-PATIENTS-COUNTS-SAVE'
const RAW = 'permission denied for table contact_counts (secret detail)'

type Sent = { table: string; body: unknown; options: unknown; ok(): void; fail(): void; drop(): void }

const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

function setup(first: ContactCount | null, options: { strict?: boolean } = {}) {
  const sent: Sent[] = []
  const client = {
    from: (table: string) => ({
      upsert: (body: unknown, upsertOptions: unknown) =>
        new Promise((resolve, reject) => {
          sent.push({
            table,
            body,
            options: upsertOptions,
            ok: () => resolve({ data: null, error: null }),
            fail: () => resolve({ data: null, error: { message: RAW } }),
            drop: () => reject(new Error(RAW)),
          })
        }),
    }),
  } as unknown as SupabaseClient
  const hook = renderHook(({ counts }: { counts: ContactCount | null }) => useCountsUpload(client, counts), {
    initialProps: { counts: first },
    wrapper: options.strict ? StrictMode : undefined,
  })
  const set = async (counts: ContactCount | null) => {
    hook.rerender({ counts })
    await flush()
  }
  const answer = async (index: number, how: 'ok' | 'fail' | 'drop' = 'ok') => {
    sent[index]![how]()
    await flush()
  }
  const retry = async () => {
    act(() => hook.result.current.retry())
    await flush()
  }
  return { ...hook, sent, set, answer, retry, bodies: () => sent.map((s) => s.body), error: () => hook.result.current.error }
}

describe('useCountsUpload: 올릴 때 (AC-614.1)', () => {
  it('AC-614.1: 값이 null이면 아무것도 보내지 않고 오류도 없다', async () => {
    const t = setup(null)
    await flush()
    await t.retry()
    expect(t.sent).toEqual([])
    expect(t.error()).toBeNull()
  })

  it('AC-614.1: null에서 값이 되면 contact_counts에 병원 한 줄로 한 번 보낸다', async () => {
    const t = setup(null)
    await t.set(A)
    expect(t.sent.map(({ table, options }) => ({ table, options }))).toEqual([{ table: 'contact_counts', options: { onConflict: 'hospital_id' } }])
    expect(t.bodies()).toEqual([A])
  })

  it('AC-614.1: 올린 뒤 null이 되어도 보내지 않고, 같은 값이 돌아와도 다시 보내지 않는다', async () => {
    const t = setup(A)
    await t.answer(0)
    await t.set(null)
    expect(t.sent).toHaveLength(1)
    await t.set({ ...A })
    expect(t.sent).toHaveLength(1)
    expect(t.error()).toBeNull()
  })

  it('AC-614.1: 나가 있는 동안 null이 되어도 더 보내지 않고, 답이 온 뒤 같은 값이 돌아와도 보내지 않는다', async () => {
    const t = setup(A)
    await t.set(null)
    await t.answer(0)
    expect(t.sent).toHaveLength(1)
    await t.set({ ...A })
    expect(t.sent).toHaveLength(1)
    expect(t.error()).toBeNull()
  })

  it('AC-614.1: 나가 있는 사이 바뀐 값이 있어도 null인 동안에는 보내지 않는다. 다음 값이 오면 그 값만 보낸다', async () => {
    const t = setup(A)
    await t.set(B)
    await t.set(null)
    await t.answer(0)
    expect(t.sent).toHaveLength(1)
    await t.set(C)
    expect(t.bodies()).toEqual([A, C])
  })

  it('AC-614.1: 나가 있는 사이 바뀐 값이 null 뒤에 그대로 돌아오면 그때 보낸다(서버는 아직 옛 값이다)', async () => {
    const t = setup(A)
    await t.set(B)
    await t.set(null)
    await t.answer(0)
    await t.set({ ...B })
    expect(t.bodies()).toEqual([A, B])
  })

  it('AC-614.1: null인 동안에는 [다시 올리기]를 불러도 보내지 않는다', async () => {
    const t = setup(A)
    await t.answer(0, 'fail')
    await t.set(null)
    await t.retry()
    expect(t.sent).toHaveLength(1)
    await t.set({ ...A })
    expect(t.sent).toHaveLength(1)
    await t.retry()
    expect(t.bodies()).toEqual([A, A])
  })

  it('AC-614.1: StrictMode에서 effect가 두 번 돌아도 한 번만 보낸다', async () => {
    const t = setup(A, { strict: true })
    await flush()
    expect(t.sent).toHaveLength(1)
  })
})

describe('useCountsUpload: 값이 바뀔 때 (AC-614.2)', () => {
  it('AC-614.2: 같은 값이 새 객체로 다시 와도 보내지 않는다', async () => {
    const t = setup(A)
    await t.answer(0)
    await t.set({ ...A })
    await t.set({ ...A })
    expect(t.sent).toHaveLength(1)
  })

  it('AC-614.2: 바뀌면 다시 보내고, 먼저 값으로 돌아와도 보낸다(서버는 그 사이 값이다)', async () => {
    const t = setup(A)
    await t.answer(0)
    await t.set(B)
    await t.answer(1)
    await t.set(A)
    expect(t.bodies()).toEqual([A, B, A])
  })

  it('AC-614.2: 한 번에 하나만 내보낸다. 나가 있는 사이 여러 번 바뀌면 답이 온 뒤 마지막 값만 보낸다', async () => {
    const t = setup(A)
    await t.set(B)
    await t.set(C)
    expect(t.sent).toHaveLength(1)
    await t.answer(0)
    expect(t.bodies()).toEqual([A, C])
    await t.answer(1)
    expect(t.bodies()).toEqual([A, C])
    expect(t.error()).toBeNull()
  })

  it('AC-614.2: 나가 있는 사이 바뀌었다가 그 값으로 돌아오면 답 뒤에 더 보내지 않는다', async () => {
    const t = setup(A)
    await t.set(B)
    await t.set({ ...A })
    await t.answer(0)
    expect(t.sent).toHaveLength(1)
    expect(t.error()).toBeNull()
  })

  it('AC-614.2: B가 나가 있는 사이 A로 돌아오면 B 답 뒤에 A를 보낸다(서버가 B에 남지 않는다)', async () => {
    const t = setup(A)
    await t.answer(0)
    await t.set(B)
    await t.set({ ...A })
    expect(t.sent).toHaveLength(2)
    await t.answer(1)
    expect(t.bodies()).toEqual([A, B, A])
    await t.answer(2)
    expect(t.sent).toHaveLength(3)
  })

  it('AC-614.2: 옛 값의 실패는 오류로 올리지 않고 지금 값을 보낸다', async () => {
    const t = setup(A)
    await t.set(B)
    await t.answer(0, 'fail')
    expect(t.error()).toBeNull()
    expect(t.bodies()).toEqual([A, B])
    await t.answer(1)
    expect(t.error()).toBeNull()
    expect(t.sent).toHaveLength(2)
  })

  it('AC-614.2: 옛 값의 실패 뒤 지금 값도 실패하면 그때 오류다', async () => {
    const t = setup(A)
    await t.set(B)
    await t.answer(0, 'fail')
    await t.answer(1, 'fail')
    expect(t.error()).toBe(SAVE)
    expect(t.sent).toHaveLength(2)
  })

  it('AC-614.2: 실패한 요청이 서버에 닿았을 수 있어, 그 전에 올린 값으로 돌아오면 다시 보낸다', async () => {
    const t = setup(A)
    await t.answer(0)
    await t.set(B)
    await t.answer(1, 'fail')
    expect(t.error()).toBe(SAVE)
    await t.set({ ...A })
    expect(t.bodies()).toEqual([A, B, A])
    await t.answer(2)
    expect(t.error()).toBeNull()
  })

  it('AC-614.2: 화면을 떠나도 나가 있는 답 뒤에 마지막 값을 보낸다(서버가 옛 값에 남지 않는다). 그 뒤로는 보내지 않는다', async () => {
    const t = setup(A)
    await t.set(B)
    t.unmount()
    await t.answer(0)
    expect(t.bodies()).toEqual([A, B])
    await t.answer(1, 'fail')
    expect(t.sent).toHaveLength(2)
  })
})

describe('useCountsUpload: 몸통 (AC-614.3)', () => {
  it('AC-614.3: 몸통은 정수 두 칸뿐인 새 객체다', async () => {
    const t = setup(A)
    const body = t.sent[0]!.body
    expect(body).not.toBe(A)
    expect(JSON.stringify(body)).toBe('{"followup_left":1,"injection_left":2}')
  })

  it('AC-614.3: Worker 값에 다른 칸이 있으면 보내지 않고 번호만 보인다. 받은 값은 어디에도 없다', async () => {
    const t = setup({ ...A, name: '가짜환자', phone: '010-9999-8888' } as ContactCount)
    await flush()
    expect(t.sent).toEqual([])
    expect(t.error()).toBe(SAVE)
    expect(JSON.stringify(t.result.current)).not.toMatch(/가짜환자|010-9999-8888/)
    await t.retry()
    expect(t.sent).toEqual([])
    expect(t.error()).toBe(SAVE)
  })

  it.each([
    ['NaN', { followup_left: Number.NaN, injection_left: 0 }],
    ['음수', { followup_left: -1, injection_left: 0 }],
    ['소수', { followup_left: 1.5, injection_left: 0 }],
    ['글자', { followup_left: '1', injection_left: 0 } as unknown as ContactCount],
  ])('AC-614.3: 정수가 아닌 값(%s)은 보내지 않고 오류 한 번으로 멈춘다(되풀이하지 않는다)', async (_name, counts) => {
    const t = setup(counts)
    await flush()
    await flush()
    expect(t.sent).toEqual([])
    expect(t.error()).toBe(SAVE)
  })
})

describe('useCountsUpload: 실패 (AC-614.4)', () => {
  it('AC-614.4: 실패하면 번호만 알리고 저절로 다시 보내지 않는다. 다시 그려도, 같은 값이 새 객체로 와도 그대로다', async () => {
    const t = setup(A)
    expect(t.error()).toBeNull()
    await t.answer(0, 'fail')
    expect(t.error()).toBe(SAVE)
    expect(JSON.stringify(t.result.current)).not.toContain('secret detail')
    t.rerender({ counts: A })
    await t.set({ ...A })
    await flush()
    expect(t.sent).toHaveLength(1)
    expect(t.error()).toBe(SAVE)
  })

  it('AC-614.4: 요청이 던져도(네트워크) 같은 번호이고 원래 글은 없다', async () => {
    const t = setup(A)
    await t.answer(0, 'drop')
    expect(t.error()).toBe(SAVE)
    expect(t.sent).toHaveLength(1)
  })

  it('AC-614.4: [다시 올리기]는 같은 값을 다시 보내고, 답이 오기 전에는 오류를 그대로 두며, 저장되면 지운다', async () => {
    const t = setup(A)
    await t.answer(0, 'fail')
    await t.retry()
    expect(t.bodies()).toEqual([A, A])
    expect(t.error()).toBe(SAVE)
    await t.answer(1)
    expect(t.error()).toBeNull()
    expect(t.sent).toHaveLength(2)
  })

  it('AC-614.4: [다시 올리기]를 두 번 눌러도 한 번 보낸다', async () => {
    const t = setup(A)
    await t.answer(0, 'fail')
    act(() => {
      t.result.current.retry()
      t.result.current.retry()
    })
    await flush()
    await t.retry()
    expect(t.sent).toHaveLength(2)
  })

  it('AC-614.4: 다시 보낸 것도 실패하면 오류가 남고 저절로 보내지 않는다. 또 누르면 또 보낸다', async () => {
    const t = setup(A)
    await t.answer(0, 'fail')
    await t.retry()
    await t.answer(1, 'fail')
    await flush()
    expect(t.error()).toBe(SAVE)
    expect(t.sent).toHaveLength(2)
    await t.retry()
    expect(t.sent).toHaveLength(3)
  })

  it('AC-614.4: 실패가 없으면 [다시 올리기]는 아무것도 보내지 않는다(올린 뒤·나가 있는 동안)', async () => {
    const t = setup(A)
    await t.retry()
    expect(t.sent).toHaveLength(1)
    await t.answer(0)
    await t.retry()
    expect(t.sent).toHaveLength(1)
  })

  it('AC-614.4: 실패 뒤 바뀐 값은 바로 보내고, 그 값이 저장되어야 오류가 지워진다', async () => {
    const t = setup(A)
    await t.answer(0, 'fail')
    await t.set(B)
    expect(t.bodies()).toEqual([A, B])
    expect(t.error()).toBe(SAVE)
    await t.answer(1)
    expect(t.error()).toBeNull()
    expect(t.sent).toHaveLength(2)
  })

  it('AC-614.4: 바뀐 값이 나가 있는 동안 [다시 올리기]는 더 보내지 않는다', async () => {
    const t = setup(A)
    await t.answer(0, 'fail')
    await t.set(B)
    await t.retry()
    expect(t.bodies()).toEqual([A, B])
  })

  it('AC-614.4: 바뀐 값도 실패하면 오류가 남고, [다시 올리기]는 지금 값을 보낸다(옛 값이 아니다)', async () => {
    const t = setup(A)
    await t.answer(0, 'fail')
    await t.set(B)
    await t.answer(1, 'fail')
    expect(t.error()).toBe(SAVE)
    await t.retry()
    expect(t.bodies()).toEqual([A, B, B])
  })

  it('AC-614.4: 실패한 뒤 C가 나간 사이 실패했던 값으로 돌아오면 C 답 뒤에 그 값을 보낸다. 오류는 저장되어야 지워진다', async () => {
    const t = setup(A)
    await t.answer(0, 'fail')
    await t.set(C)
    await t.set({ ...A })
    expect(t.sent).toHaveLength(2)
    await t.answer(1)
    expect(t.bodies()).toEqual([A, C, A])
    expect(t.error()).toBe(SAVE)
    await t.answer(2)
    expect(t.error()).toBeNull()
  })

  it('AC-614.4: null인 동안은 누를 수 없으니 오류를 내리고, 같은 값이 돌아오면 보내지 않은 채 오류를 다시 보인다', async () => {
    const t = setup(A)
    await t.answer(0, 'fail')
    await t.set(null)
    expect(t.error()).toBeNull()
    await t.set({ ...A })
    expect(t.error()).toBe(SAVE)
    expect(t.sent).toHaveLength(1)
  })

  it('AC-614.4: 나가 있는 동안 null이 되고 실패하면 같은 값이 돌아올 때 오류를 보이고 저절로 보내지 않는다', async () => {
    const t = setup(A)
    await t.set(null)
    await t.answer(0, 'fail')
    expect(t.error()).toBeNull()
    await t.set({ ...A })
    expect(t.error()).toBe(SAVE)
    expect(t.sent).toHaveLength(1)
    await t.retry()
    expect(t.sent).toHaveLength(2)
  })

  it('AC-614.4: 나가 있는 동안 null이 되고 실패한 뒤 다른 값이 오면 옛 값의 오류를 보이지 않는다', async () => {
    const t = setup(A)
    await t.set(null)
    await t.answer(0, 'fail')
    await t.set(B)
    expect(t.bodies()).toEqual([A, B])
    expect(t.error()).toBeNull()
    await t.answer(1)
    expect(t.error()).toBeNull()
  })

  it('AC-614.4: 다시 보낸 것이 나가 있는 동안 null이 되고 저장되면, 같은 값이 돌아와도 오류가 없고 보내지 않는다', async () => {
    const t = setup(A)
    await t.answer(0, 'fail')
    await t.retry()
    await t.set(null)
    await t.answer(1)
    await t.set({ ...A })
    expect(t.error()).toBeNull()
    expect(t.sent).toHaveLength(2)
  })
})
