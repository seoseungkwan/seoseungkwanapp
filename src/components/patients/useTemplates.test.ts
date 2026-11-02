// @vitest-environment jsdom
import type { SupabaseClient } from '@supabase/supabase-js'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_TEMPLATES } from '@/lib/patientMessages/defaults'
import type { MessageTemplate } from '@/lib/storage/messageTemplates'
import { useTemplates } from './useTemplates'

// 문구 상태(AC-613.1·613.2·613.4·613.6). 진짜 readTemplates·saveTemplates에 메모리 속 가짜 서버를 물린다: 일부만 저장된 뒤의 값까지 서버 쪽에서 본다

const A: MessageTemplate = { id: 'a', kind: 'injection', name: '주사 안내', body: '주사 글', sort_order: 0 }
const B: MessageTemplate = { id: 'b', kind: 'followup', name: '진료 안내', body: '진료 글', sort_order: 1 }
const FAILURE = { message: 'down' }

function fakeServer(initial: readonly MessageTemplate[] = []) {
  let added = 0
  const server = {
    rows: initial.map((row) => ({ ...row })),
    reads: 0,
    updates: [] as { id: string; row: Partial<MessageTemplate> }[],
    deletes: [] as string[][],
    inserts: [] as Omit<MessageTemplate, 'id'>[][],
    /** 다음 n번 읽기를 실패시킨다 */
    failReads: 0,
    failUpdateOf: null as string | null,
    failInsert: false,
    /** 줄은 들어갔는데 답만 잃는다 */
    loseInsertAnswer: false,
    /** 쓰기를 여기서 붙잡는다 */
    gate: null as Promise<void> | null,
    sb: null as unknown as SupabaseClient,
    writes() {
      return server.updates.length + server.deletes.length + server.inserts.length
    },
  }
  server.sb = {
    from: () => ({
      select: () => ({
        order: () => ({
          order: async () => {
            server.reads += 1
            if (server.failReads > 0) {
              server.failReads -= 1
              return { data: null, error: FAILURE }
            }
            return { data: [...server.rows].sort((x, y) => x.sort_order - y.sort_order || x.kind.localeCompare(y.kind)).map((row) => ({ ...row })), error: null }
          },
        }),
      }),
      update: (row: Partial<MessageTemplate>) => ({
        eq: async (_column: string, id: string) => {
          if (server.gate) await server.gate
          server.updates.push({ id, row })
          if (server.failUpdateOf === id) return { error: FAILURE }
          server.rows = server.rows.map((old) => (old.id === id ? { ...old, ...row } : old))
          return { error: null }
        },
      }),
      delete: () => ({
        in: async (_column: string, ids: string[]) => {
          server.deletes.push(ids)
          server.rows = server.rows.filter((old) => !ids.includes(old.id))
          return { error: null }
        },
      }),
      insert: async (rows: Omit<MessageTemplate, 'id'>[]) => {
        if (server.gate) await server.gate
        server.inserts.push(rows)
        if (server.failInsert) return { error: FAILURE }
        for (const row of rows) server.rows.push({ ...row, id: `server-${(added += 1)}` })
        return { error: server.loseInsertAnswer ? FAILURE : null }
      },
    }),
  } as unknown as SupabaseClient
  return server
}

const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

async function open(server: ReturnType<typeof fakeServer>) {
  const view = renderHook(() => useTemplates(server.sb))
  await flush()
  return view
}

const texts = (rows: readonly { kind: string; name: string; body: string }[]) => rows.map(({ kind, name, body }) => ({ kind, name, body }))
const hold = (server: ReturnType<typeof fakeServer>) => {
  let release = () => {}
  server.gate = new Promise((resolve) => {
    release = resolve
  })
  return () => {
    server.gate = null
    release()
  }
}

afterEach(cleanup)

describe('useTemplates: 읽기 (AC-613.1·613.6)', () => {
  it('AC-613.1: 읽기가 됐고 줄이 없을 때만 기본 문구를 쓴다. 기본 문구는 저장 전이라 saved는 비어 있고 id가 없다', async () => {
    const { result } = await open(fakeServer())
    expect(result.current.state).toBe('ready')
    expect(result.current.saved).toEqual([])
    expect(texts(result.current.draft)).toEqual(texts([...DEFAULT_TEMPLATES]))
    expect(result.current.draft.every((row) => row.id === undefined)).toBe(true)
    expect(result.current.usingDefaults).toBe(true)
    expect(result.current.changed).toBe(true)
  })

  it('AC-613.1: 저장한 줄이 있으면 그 줄을 그대로 쓴다. 기본 문구가 섞이지 않고 바뀐 것도 없다', async () => {
    const { result } = await open(fakeServer([A, B]))
    expect(result.current.saved).toEqual([A, B])
    expect(result.current.draft.map(({ id }) => id)).toEqual(['a', 'b'])
    expect(texts(result.current.draft)).toEqual(texts([A, B]))
    expect(result.current.usingDefaults).toBe(false)
    expect(result.current.changed).toBe(false)
  })

  it('AC-613.1: 읽는 동안은 loading이고 고쳐도 아무 일이 없다', async () => {
    const server = fakeServer([A])
    const { result } = renderHook(() => useTemplates(server.sb))
    expect(result.current.state).toBe('loading')
    act(() => {
      result.current.edit(0, { name: '끼어들기' })
      result.current.add('injection')
    })
    await flush()
    expect(texts(result.current.draft)).toEqual(texts([A]))
  })

  it('AC-613.6: 읽기 실패면 load-failed, 초안이 없고(기본 문구로 대신하지 않는다) save는 아무것도 보내지 않는다', async () => {
    const server = fakeServer([A])
    server.failReads = 1
    const { result } = await open(server)
    expect(result.current.state).toBe('load-failed')
    expect(result.current.loadError).toBe('E-PATIENTS-TEMPLATES-READ')
    expect(result.current.draft).toEqual([])
    expect(result.current.usingDefaults).toBe(false)
    await act(() => result.current.save())
    expect(server.writes()).toBe(0)
    expect(result.current.saveError).toBeNull()
  })

  it('AC-613.6: 클라이언트를 못 만들어도 같은 읽기 실패다(던지지 않는다)', async () => {
    const { result } = renderHook(() =>
      useTemplates(() => {
        throw new Error('env')
      }),
    )
    await flush()
    expect(result.current.state).toBe('load-failed')
    expect(result.current.loadError).toBe('E-PATIENTS-TEMPLATES-READ')
  })

  it('AC-613.6: 저절로 다시 읽지 않고 reload를 불렀을 때만 읽는다. 읽히면 ready로 돌아온다', async () => {
    const server = fakeServer([A])
    server.failReads = 1
    const { result } = await open(server)
    await flush()
    await flush()
    expect(server.reads).toBe(1)
    act(() => {
      result.current.reload()
      result.current.reload()
    })
    expect(result.current.state).toBe('loading')
    expect(result.current.loadError).toBeNull()
    await flush()
    expect(server.reads).toBe(2)
    expect(result.current.state).toBe('ready')
    expect(texts(result.current.draft)).toEqual(texts([A]))
  })

  it('AC-613.6: 읽어 둔 상태에서 reload는 아무것도 하지 않는다(고치던 글을 덮지 않는다)', async () => {
    const server = fakeServer([A])
    const { result } = await open(server)
    act(() => result.current.edit(0, { name: '고치는 중' }))
    act(() => result.current.reload())
    await flush()
    expect(server.reads).toBe(1)
    expect(result.current.draft[0]?.name).toBe('고치는 중')
  })
})

describe('useTemplates: 고치기·검사 (AC-613.2)', () => {
  it('AC-613.2: 고치기·더하기·지우기·위아래가 초안을 바꾸고, 서버는 저장 전까지 그대로다', async () => {
    const server = fakeServer([A, B])
    const { result } = await open(server)
    act(() => result.current.edit(0, { name: '새 이름' }))
    expect(result.current.draft[0]?.name).toBe('새 이름')
    expect(result.current.changed).toBe(true)

    act(() => void result.current.add('followup'))
    expect(result.current.draft[2]).toMatchObject({ kind: 'followup', name: '새 진료 안내', body: '' })
    expect(result.current.draft[2]?.id).toBeUndefined()

    act(() => result.current.move(2, -1))
    expect(result.current.draft.map(({ id }) => id)).toEqual(['a', undefined, 'b'])
    act(() => result.current.move(0, 1))
    expect(result.current.draft.map(({ id }) => id)).toEqual([undefined, 'a', 'b'])
    act(() => result.current.remove(1))
    expect(result.current.draft.map(({ id }) => id)).toEqual([undefined, 'b'])
    expect(server.writes()).toBe(0)
  })

  it('AC-613.2: 맨 위 줄을 위로·맨 아래 줄을 아래로는 그대로다. 줄마다 다른 key가 순서를 따라간다', async () => {
    const { result } = await open(fakeServer([A, B]))
    const keys = result.current.draft.map(({ key }) => key)
    expect(new Set(keys).size).toBe(2)
    act(() => result.current.move(0, -1))
    act(() => result.current.move(1, 1))
    expect(result.current.draft.map(({ key }) => key)).toEqual(keys)
    act(() => result.current.move(0, 1))
    expect(result.current.draft.map(({ key }) => key)).toEqual([keys[1], keys[0]])
  })

  it('AC-613.2: 이름 1~30자·내용 1~2000자를 검사해 줄·칸을 알려 준다', async () => {
    const { result } = await open(fakeServer([A, B]))
    expect(result.current.invalid).toEqual([])
    act(() => result.current.edit(0, { name: 'ㄱ'.repeat(30), body: 'ㄴ'.repeat(2000) }))
    expect(result.current.invalid).toEqual([])
    act(() => result.current.edit(0, { name: 'ㄱ'.repeat(31) }))
    expect(result.current.invalid).toEqual([{ index: 0, field: 'name' }])
    act(() => result.current.edit(1, { name: '  ', body: 'ㄴ'.repeat(2001) }))
    expect(result.current.invalid).toEqual([
      { index: 0, field: 'name' },
      { index: 1, field: 'name' },
      { index: 1, field: 'body' },
    ])
  })

  it('AC-613.2: 검사에 걸리면 save가 아무것도 보내지 않고 tried를 켠다', async () => {
    const server = fakeServer([A])
    const { result } = await open(server)
    act(() => result.current.edit(0, { body: '' }))
    await act(() => result.current.save())
    expect(server.writes()).toBe(0)
    expect(server.reads).toBe(1)
    expect(result.current.tried).toBe(true)
    expect(result.current.saving).toBe(false)
    expect(result.current.saveError).toBeNull()
  })

  it('AC-613.2: 저장하면 줄 차례가 sort_order로 가고, saved·draft가 서버 값(새 id)이 되고, 줄 key는 그대로다', async () => {
    const server = fakeServer([A, B])
    const { result } = await open(server)
    act(() => void result.current.add('injection'))
    const added = result.current.draft[2]!.key
    act(() => result.current.edit(2, { body: '새 글' }))
    act(() => result.current.move(0, 1))
    await act(() => result.current.save())

    expect(server.updates.map(({ id, row }) => [id, row.sort_order])).toEqual([
      ['b', 0],
      ['a', 1],
    ])
    expect(server.inserts).toEqual([[{ kind: 'injection', name: '새 주사 안내', body: '새 글', sort_order: 2 }]])
    expect(result.current.saved.map(({ id }) => id)).toEqual(['b', 'a', 'server-1'])
    expect(result.current.draft.map(({ id }) => id)).toEqual(['b', 'a', 'server-1'])
    expect(result.current.draft[2]?.key).toBe(added)
    expect(result.current.changed).toBe(false)
    expect(result.current.justSaved).toBe(true)
    expect(result.current.saving).toBe(false)
    // 다음 고치기에서 '저장했어요'를 내린다
    act(() => result.current.edit(0, { name: '또 고침' }))
    expect(result.current.justSaved).toBe(false)
  })

  it('AC-613.2: 기본 문구를 저장하면 더는 기본 문구가 아니다. 모두 지우고 저장해도 그 자리에 기본 문구가 되살아나지 않는다', async () => {
    const server = fakeServer()
    const { result } = await open(server)
    await act(() => result.current.save())
    expect(server.rows.map(({ name }) => name)).toEqual(DEFAULT_TEMPLATES.map(({ name }) => name))
    expect(result.current.usingDefaults).toBe(false)
    act(() => {
      result.current.remove(0)
      result.current.remove(0)
    })
    await act(() => result.current.save())
    expect(server.rows).toEqual([])
    expect(result.current.draft).toEqual([])
    expect(result.current.usingDefaults).toBe(false)
    expect(result.current.changed).toBe(false)
  })

  it('AC-613.2: 바뀐 것이 없으면 save가 아무것도 보내지 않는다', async () => {
    const server = fakeServer([A])
    const { result } = await open(server)
    await act(() => result.current.save())
    expect(server.writes()).toBe(0)
    expect(server.reads).toBe(1)
  })
})

describe('useTemplates: 저장 중에는 또 보내지 않는다 (AC-613.2)', () => {
  it('AC-613.2: 같은 순간 두 번 불러도 더하기는 한 번이다(같은 before로 두 번 넣으면 줄이 겹친다)', async () => {
    const server = fakeServer([A])
    const { result } = await open(server)
    act(() => void result.current.add('followup'))
    act(() => result.current.edit(1, { body: '새 글' }))
    await act(async () => {
      await Promise.all([result.current.save(), result.current.save()])
    })
    expect(server.inserts).toHaveLength(1)
    expect(server.rows).toHaveLength(2)
  })

  it('AC-613.2: 답을 기다리는 동안 다시 불러도 보내지 않고, 고치기도 먹지 않으며(답이 고친 글을 덮지 않게), saving이 켜져 있다', async () => {
    const server = fakeServer([A])
    const { result } = await open(server)
    act(() => void result.current.add('followup'))
    act(() => result.current.edit(1, { body: '새 글' }))
    const release = hold(server)
    let first = Promise.resolve()
    act(() => {
      first = result.current.save()
    })
    expect(result.current.saving).toBe(true)
    await act(() => result.current.save())
    expect(result.current.add('injection')).toBeNull()
    act(() => {
      result.current.edit(0, { name: '끼어들기' })
      result.current.remove(0)
      result.current.move(0, 1)
    })
    expect(texts(result.current.draft)[0]?.name).toBe(A.name)
    expect(result.current.draft).toHaveLength(2)

    await act(async () => {
      release()
      await first
    })
    expect(server.inserts).toHaveLength(1)
    expect(result.current.saving).toBe(false)
    expect(server.rows.map(({ name }) => name)).toEqual([A.name, '새 진료 안내'])
  })
})

describe('useTemplates: 저장 실패 (AC-613.4)', () => {
  it('AC-613.4: 쓰기가 실패하면 고친 값을 그대로 두고 saveError를 알린다. 서버 값(before)은 한 번만 다시 읽는다', async () => {
    const server = fakeServer([A, B])
    const { result } = await open(server)
    server.failUpdateOf = 'b'
    act(() => {
      result.current.edit(0, { name: '고친 A' })
      result.current.edit(1, { name: '고친 B' })
    })
    await act(() => result.current.save())

    expect(result.current.state).toBe('ready')
    expect(result.current.saveError).toBe('E-PATIENTS-TEMPLATES-SAVE')
    expect(result.current.loadError).toBeNull()
    expect(result.current.saving).toBe(false)
    expect(result.current.draft.map(({ name }) => name)).toEqual(['고친 A', '고친 B'])
    // A는 서버에 들어갔다: saved는 서버가 지금 가진 것이다
    expect(result.current.saved.map(({ name }) => name)).toEqual(['고친 A', B.name])
    expect(server.reads).toBe(2)
    await flush()
    await flush()
    expect(server.reads).toBe(2)
  })

  it('AC-613.4: 일부만 저장된 뒤 값을 되돌리고 다시 저장하면 서버의 지금 값과 비교해 고친다(옛 before면 update가 안 나가 중간 값이 남는다)', async () => {
    const server = fakeServer([A, B])
    const { result } = await open(server)
    server.failUpdateOf = 'b'
    act(() => {
      result.current.edit(0, { name: '중간 값' })
      result.current.edit(1, { name: '고친 B' })
    })
    await act(() => result.current.save())
    expect(server.rows[0]?.name).toBe('중간 값')

    server.failUpdateOf = null
    act(() => result.current.edit(0, { name: A.name }))
    await act(() => result.current.save())
    expect(server.rows.map(({ name }) => name)).toEqual([A.name, '고친 B'])
    expect(result.current.saveError).toBeNull()
    expect(result.current.justSaved).toBe(true)
  })

  it('AC-613.4: 다시 읽기까지 실패해도 고친 값은 그대로이고, 다시 저장은 서버 값을 읽기 전에는 아무것도 쓰지 않는다', async () => {
    const server = fakeServer([A, B])
    const { result } = await open(server)
    server.failUpdateOf = 'b'
    server.failReads = 1
    act(() => {
      result.current.edit(0, { name: '중간 값' })
      result.current.edit(1, { name: '고친 B' })
    })
    await act(() => result.current.save())
    expect(result.current.state).toBe('ready')
    expect(result.current.saveError).toBe('E-PATIENTS-TEMPLATES-SAVE')
    expect(result.current.draft.map(({ name }) => name)).toEqual(['중간 값', '고친 B'])
    const reads = server.reads
    await flush()
    expect(server.reads).toBe(reads)

    // 다시 저장: 또 못 읽으면 쓰지 않는다
    server.failUpdateOf = null
    act(() => result.current.edit(0, { name: A.name }))
    const writes = server.writes()
    server.failReads = 1
    await act(() => result.current.save())
    expect(server.writes()).toBe(writes)
    expect(server.reads).toBe(reads + 1)
    expect(result.current.state).toBe('ready')
    expect(result.current.saveError).toBe('E-PATIENTS-TEMPLATES-SAVE')
    expect(result.current.saving).toBe(false)
    expect(result.current.draft.map(({ name }) => name)).toEqual([A.name, '고친 B'])

    // 읽히면 그 값과 비교해 쓴다. 옛 before(A.name)와 비교했다면 A는 '중간 값'으로 남는다
    await act(() => result.current.save())
    expect(server.rows.map(({ name }) => name)).toEqual([A.name, '고친 B'])
    expect(result.current.saveError).toBeNull()
  })

  it('AC-613.4: 다시 읽기가 실패한 뒤 더한 줄은 서버 값을 읽고 나서 한 번만 들어간다', async () => {
    const server = fakeServer([A])
    const { result } = await open(server)
    act(() => void result.current.add('followup'))
    act(() => result.current.edit(1, { body: '새 글' }))
    server.failInsert = true
    server.failReads = 1
    await act(() => result.current.save())
    expect(server.rows).toHaveLength(1)
    server.failInsert = false
    await act(() => result.current.save())
    expect(server.rows.map(({ body }) => body)).toEqual([A.body, '새 글'])
  })

  it('AC-613.4: 순서 바꾸기가 반만 되면 글 차례가 같아 보여도 저장 실패다. 다시 저장이 남은 줄의 순서를 고친다', async () => {
    const server = fakeServer([A, B])
    const { result } = await open(server)
    act(() => result.current.move(1, -1))
    server.failUpdateOf = 'a'
    await act(() => result.current.save())

    // b→0은 됐고 a→1이 실패했다. 서버는 둘 다 0번이고, 같은 번호면 kind 차례로 읽혀 보낸 차례(b, a)와 같아 보인다
    expect(server.rows.map(({ id, sort_order }) => [id, sort_order])).toEqual([
      ['a', 0],
      ['b', 0],
    ])
    expect(result.current.saved.map(({ id }) => id)).toEqual(['b', 'a'])
    expect(result.current.saveError).toBe('E-PATIENTS-TEMPLATES-SAVE')
    expect(result.current.justSaved).toBe(false)
    expect(result.current.draft.map(({ id }) => id)).toEqual(['b', 'a'])

    server.failUpdateOf = null
    const sent = server.updates.length
    await act(() => result.current.save())
    expect(server.updates.slice(sent).map(({ id, row }) => [id, row.sort_order])).toEqual([['a', 1]])
    expect(server.rows.map(({ id, sort_order }) => [id, sort_order])).toEqual([
      ['a', 1],
      ['b', 0],
    ])
    expect(result.current.saveError).toBeNull()
    expect(result.current.justSaved).toBe(true)
    expect(server.inserts).toEqual([])
    expect(server.deletes).toEqual([])
  })

  it('AC-613.4: 같은 종류 두 줄의 순서 바꾸기가 반만 돼도 저장 실패다(같은 번호·같은 종류면 읽는 차례를 DB가 정하지 않는다)', async () => {
    const C: MessageTemplate = { id: 'c', kind: 'injection', name: '주사 안내 둘', body: '둘째 글', sort_order: 1 }
    // 가짜 서버는 같으면 넣어 둔 차례로 답한다. 보낸 차례(c, a)로 읽히는 쪽을 만든다
    const server = fakeServer([C, A])
    const { result } = await open(server)
    expect(result.current.draft.map(({ id }) => id)).toEqual(['a', 'c'])
    act(() => result.current.move(1, -1))
    server.failUpdateOf = 'a'
    await act(() => result.current.save())
    expect(result.current.saved.map(({ id }) => id)).toEqual(['c', 'a'])
    expect(result.current.saveError).toBe('E-PATIENTS-TEMPLATES-SAVE')
    expect(result.current.justSaved).toBe(false)
  })

  it('AC-613.4: 다시 읽기까지 실패한 뒤 다시 저장도, 순서가 반만 된 서버 값을 저장된 것으로 보지 않고 고친다', async () => {
    const server = fakeServer([A, B])
    const { result } = await open(server)
    act(() => result.current.move(1, -1))
    server.failUpdateOf = 'a'
    server.failReads = 1
    await act(() => result.current.save())
    expect(result.current.saveError).toBe('E-PATIENTS-TEMPLATES-SAVE')

    server.failUpdateOf = null
    const sent = server.updates.length
    await act(() => result.current.save())
    expect(server.updates.slice(sent).map(({ id, row }) => [id, row.sort_order])).toEqual([['a', 1]])
    expect(server.rows.map(({ id, sort_order }) => [id, sort_order])).toEqual([
      ['a', 1],
      ['b', 0],
    ])
    expect(result.current.saveError).toBeNull()
  })

  it('AC-613.4: 저장 답만 잃어 서버가 이미 고친 값과 같으면 저장된 것이다. 다시 넣지 않고 서버 줄을 받는다', async () => {
    const server = fakeServer([A])
    const { result } = await open(server)
    act(() => void result.current.add('followup'))
    act(() => result.current.edit(1, { body: '새 글' }))
    server.loseInsertAnswer = true
    await act(() => result.current.save())
    expect(result.current.saveError).toBeNull()
    expect(result.current.justSaved).toBe(true)
    expect(result.current.draft.map(({ id }) => id)).toEqual(['a', 'server-1'])
    await act(() => result.current.save())
    expect(server.inserts).toHaveLength(1)
    expect(server.rows).toHaveLength(2)
  })

  it('AC-613.4: 저장 답을 잃고 다시 읽기도 실패했으면, 다시 저장이 서버 값을 읽어 보고 또 넣지 않는다', async () => {
    const server = fakeServer([A])
    const { result } = await open(server)
    act(() => void result.current.add('followup'))
    act(() => result.current.edit(1, { body: '새 글' }))
    server.loseInsertAnswer = true
    server.failReads = 1
    await act(() => result.current.save())
    expect(result.current.saveError).toBe('E-PATIENTS-TEMPLATES-SAVE')
    await act(() => result.current.save())
    expect(server.inserts).toHaveLength(1)
    expect(server.rows).toHaveLength(2)
    expect(result.current.saveError).toBeNull()
  })

  it('AC-613.4: 기본 문구 저장이 실패해도 고친 값과 기본 문구 안내가 그대로다', async () => {
    const server = fakeServer()
    const { result } = await open(server)
    server.failInsert = true
    act(() => result.current.edit(0, { name: '우리 의원 문구' }))
    await act(() => result.current.save())
    expect(result.current.saveError).toBe('E-PATIENTS-TEMPLATES-SAVE')
    expect(result.current.draft[0]?.name).toBe('우리 의원 문구')
    expect(result.current.draft).toHaveLength(DEFAULT_TEMPLATES.length)
    expect(result.current.usingDefaults).toBe(true)
  })
})

describe('useTemplates: 실패 뒤 다시 읽기에 다른 기기 줄이 옴 (AC-613.4)', () => {
  // 사용자가 화면에서 본 적 없는 줄이다. 실패 없는 저장처럼 서버에 그대로 두고, 저장이 된 뒤 다시 읽기로 화면에 나온다
  const X: MessageTemplate = { id: 'x', kind: 'followup', name: '다른 기기 줄', body: '다른 기기 글', sort_order: 5 }
  const ids = (rows: readonly { id?: string }[]) => rows.map(({ id }) => id)
  const named = (server: ReturnType<typeof fakeServer>, name: string) => server.rows.filter((row) => row.name === name)

  it('AC-613.4: 다시 저장이 그 줄을 지우지 않고 고친 줄만 쓴다. 마지막 다시 읽기로 그 줄이 saved·draft에 나온다', async () => {
    const server = fakeServer([A])
    const { result } = await open(server)
    act(() => result.current.edit(0, { name: '고친 A' }))
    server.failUpdateOf = 'a'
    server.rows.push({ ...X })
    await act(() => result.current.save())

    expect(result.current.saveError).toBe('E-PATIENTS-TEMPLATES-SAVE')
    expect(ids(result.current.saved)).toEqual(['a'])
    expect(ids(result.current.draft)).toEqual(['a'])
    expect(result.current.draft[0]?.name).toBe('고친 A')
    expect(result.current.changed).toBe(true)

    server.failUpdateOf = null
    await act(() => result.current.save())
    expect(server.deletes).toEqual([])
    expect(server.rows.map(({ name }) => name)).toEqual(['고친 A', X.name])
    expect(ids(result.current.saved)).toEqual(['a', 'x'])
    expect(ids(result.current.draft)).toEqual(['a', 'x'])
    expect(result.current.saveError).toBeNull()
    expect(result.current.justSaved).toBe(true)
    expect(result.current.changed).toBe(false)
  })

  it('AC-613.4: 초안이 기본 문구 그대로여도 그 줄은 남고 기본 문구가 들어간다. 그때까지 기본 문구 안내도 그대로다', async () => {
    const server = fakeServer()
    const { result } = await open(server)
    server.failInsert = true
    server.rows.push({ ...X })
    await act(() => result.current.save())
    expect(result.current.saveError).toBe('E-PATIENTS-TEMPLATES-SAVE')
    expect(result.current.saved).toEqual([])
    expect(result.current.usingDefaults).toBe(true)
    expect(texts(result.current.draft)).toEqual(texts([...DEFAULT_TEMPLATES]))

    server.failInsert = false
    await act(() => result.current.save())
    expect(server.deletes).toEqual([])
    expect(server.rows.map(({ name }) => name)).toEqual([X.name, ...DEFAULT_TEMPLATES.map(({ name }) => name)])
    expect(ids(result.current.draft)).toContain('x')
    expect(result.current.draft).toHaveLength(DEFAULT_TEMPLATES.length + 1)
    expect(result.current.usingDefaults).toBe(false)
    expect(result.current.saveError).toBeNull()
  })

  it('AC-613.4: 두 번 잇따라 실패해도 다시 저장이 그 줄을 지우지 않는다', async () => {
    const server = fakeServer([A])
    const { result } = await open(server)
    act(() => result.current.edit(0, { name: '고친 A' }))
    server.failUpdateOf = 'a'
    server.rows.push({ ...X })
    await act(() => result.current.save())
    await act(() => result.current.save())
    expect(server.updates).toHaveLength(2)
    expect(result.current.saveError).toBe('E-PATIENTS-TEMPLATES-SAVE')
    expect(ids(result.current.saved)).toEqual(['a'])
    expect(server.deletes).toEqual([])

    server.failUpdateOf = null
    await act(() => result.current.save())
    expect(server.deletes).toEqual([])
    expect(server.rows.map(({ name }) => name)).toEqual(['고친 A', X.name])
    expect(ids(result.current.draft)).toEqual(['a', 'x'])
  })

  it('AC-613.4: 더하기 답을 잃었고 그 줄도 왔으면 우리 줄은 겹치지 않고 그 줄은 남아 화면에 나온다', async () => {
    const server = fakeServer([A])
    const { result } = await open(server)
    act(() => void result.current.add('injection'))
    act(() => result.current.edit(1, { body: '새 글' }))
    server.loseInsertAnswer = true
    server.rows.push({ ...X })
    await act(() => result.current.save())
    // 서버에 그 줄이 더 있어 저장된 것이 아니다. 우리 줄은 saved에 남는다
    expect(result.current.saveError).toBe('E-PATIENTS-TEMPLATES-SAVE')
    expect(ids(result.current.saved)).toEqual(['a', 'server-1'])
    expect(named(server, '새 주사 안내')).toHaveLength(1)

    server.loseInsertAnswer = false
    await act(() => result.current.save())
    expect(named(server, '새 주사 안내')).toHaveLength(1)
    expect(named(server, X.name)).toHaveLength(1)
    expect(server.deletes.flat()).not.toContain('x')
    expect(result.current.draft.map(({ name }) => name)).toEqual([A.name, '새 주사 안내', X.name])
    expect(result.current.saveError).toBeNull()
  })

  it('AC-613.4: 기본 문구 더하기 답을 잃었고 그 줄도 왔으면 기본 문구가 겹치지 않고, 서버에 들어간 뒤라 기본 문구 안내를 내린다', async () => {
    const server = fakeServer()
    const { result } = await open(server)
    server.loseInsertAnswer = true
    server.rows.push({ ...X })
    await act(() => result.current.save())
    expect(result.current.saved).toHaveLength(DEFAULT_TEMPLATES.length)
    expect(result.current.usingDefaults).toBe(false)

    server.loseInsertAnswer = false
    await act(() => result.current.save())
    expect(server.rows.map(({ name }) => name).sort()).toEqual([X.name, ...DEFAULT_TEMPLATES.map(({ name }) => name)].sort())
    expect(ids(result.current.draft)).toContain('x')
  })

  it('AC-613.4: 다시 읽기가 실패한 뒤 다시 저장이 먼저 읽어 온 그 줄도 지우지 않는다. 그 저장이 또 실패해도 그렇다', async () => {
    const server = fakeServer([A])
    const { result } = await open(server)
    act(() => result.current.edit(0, { name: '고친 A' }))
    server.failUpdateOf = 'a'
    server.failReads = 1
    server.rows.push({ ...X })
    await act(() => result.current.save())
    expect(ids(result.current.saved)).toEqual(['a'])

    await act(() => result.current.save())
    expect(result.current.saveError).toBe('E-PATIENTS-TEMPLATES-SAVE')
    expect(ids(result.current.saved)).toEqual(['a'])
    expect(server.deletes).toEqual([])

    server.failUpdateOf = null
    server.failReads = 1
    await act(() => result.current.save())
    // 쓰기는 끝났고 다시 읽기만 실패했다
    expect(result.current.state).toBe('load-failed')
    expect(server.deletes).toEqual([])
    expect(server.rows.map(({ name }) => name)).toEqual(['고친 A', X.name])
  })

  it('AC-613.4: 서버 값을 읽기 전 실패(stale) 뒤 바로 된 다시 저장도 그 줄을 남기고 화면에 보인다', async () => {
    const server = fakeServer([A])
    const { result } = await open(server)
    act(() => result.current.edit(0, { name: '고친 A' }))
    server.failUpdateOf = 'a'
    server.failReads = 1
    await act(() => result.current.save())

    server.failUpdateOf = null
    server.rows.push({ ...X })
    await act(() => result.current.save())
    expect(server.deletes).toEqual([])
    expect(ids(result.current.draft)).toEqual(['a', 'x'])
    expect(result.current.saveError).toBeNull()
  })

  it('AC-613.4: 고친 값을 되돌려 쓸 것이 없어도 다시 저장이 서버를 읽어 그 줄을 보인다', async () => {
    const server = fakeServer([A])
    const { result } = await open(server)
    act(() => result.current.edit(0, { name: '고친 A' }))
    server.failUpdateOf = 'a'
    server.rows.push({ ...X })
    await act(() => result.current.save())
    act(() => result.current.edit(0, { name: A.name }))
    expect(result.current.changed).toBe(false)

    const writes = server.writes()
    await act(() => result.current.save())
    expect(server.writes()).toBe(writes)
    expect(ids(result.current.draft)).toEqual(['a', 'x'])
    expect(result.current.saveError).toBeNull()
  })

  it('AC-613.4: 사용자가 지운 줄은 알던 줄이라 다시 저장이 그대로 지운다', async () => {
    const server = fakeServer([A, B])
    const { result } = await open(server)
    act(() => result.current.edit(0, { name: '고친 A' }))
    act(() => result.current.remove(1))
    server.failUpdateOf = 'a'
    server.rows.push({ ...X })
    await act(() => result.current.save())
    expect(ids(result.current.saved)).toEqual(['a', 'b'])

    server.failUpdateOf = null
    await act(() => result.current.save())
    expect(server.deletes).toEqual([['b']])
    expect(server.rows.map(({ id }) => id)).toEqual(['a', 'x'])
  })
})

describe('useTemplates: 쓰기는 됐고 다시 읽기만 실패 (AC-613.6)', () => {
  it('AC-613.6: E-PATIENTS-TEMPLATES-READ면 저장 실패로 알리지 않고 load-failed로 간다. 다시 보내지 않아 줄이 겹치지 않는다', async () => {
    const server = fakeServer([A])
    const { result } = await open(server)
    act(() => void result.current.add('followup'))
    act(() => result.current.edit(1, { body: '새 글' }))
    server.failReads = 1
    await act(() => result.current.save())

    expect(server.inserts).toHaveLength(1)
    expect(result.current.state).toBe('load-failed')
    expect(result.current.loadError).toBe('E-PATIENTS-TEMPLATES-READ')
    expect(result.current.saveError).toBeNull()
    expect(result.current.saving).toBe(false)
    expect(result.current.draft).toEqual([])

    // 다시 저장해 봐도 나가지 않는다
    await act(() => result.current.save())
    expect(server.inserts).toHaveLength(1)
    const reads = server.reads
    await flush()
    expect(server.reads).toBe(reads)

    // [다시 불러오기] → 서버 줄 그대로, 겹침 없음
    act(() => result.current.reload())
    await flush()
    expect(result.current.state).toBe('ready')
    expect(result.current.draft.map(({ id }) => id)).toEqual(['a', 'server-1'])
    expect(result.current.changed).toBe(false)
    expect(server.rows).toHaveLength(2)
  })
})
