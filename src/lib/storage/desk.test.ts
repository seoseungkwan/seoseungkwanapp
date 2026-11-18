// 데스크 계정 저장 함수 (specs/desk-feedback REQ-6304 AC-6304.1, design.md '③ 설정 데스크 계정 칸'). 실제 Supabase에 붙지 않는다.
// 가짜 클라이언트는 rpc만 있고 부른 함수 이름·인자를 적어 둔다. 함수 자체(권한·5개·메일 겹침)는 supabase/desk.rls.test.ts가 증명한다.
// 메일은 모두 지어낸 example.com 주소다
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DeskStorageError, addDeskMember, deskEmail, listDeskMembers, removeDeskMember } from './desk'

type Client = Parameters<typeof listDeskMembers>[0]
type Call = { fn: string; args: unknown }
type Reply = { data?: unknown; error?: unknown; status?: number }

const RAW = 'permission denied for function add_desk_member (secret detail)' // 서버 답에 섞여 온 글자. 옮겨지면 안 된다

/** 부른 함수·인자를 적는 가짜 클라이언트. reply가 던지면 네트워크 예외와 같다. 진짜 빌더처럼 await할 때 답한다 */
function fakeClient(reply: (call: Call) => Reply = () => ({ data: [] })) {
  const calls: Call[] = []
  const client = {
    rpc: (fn: string, args?: unknown) => {
      const call = { fn, args }
      calls.push(call)
      return {
        then: (ok: (value: unknown) => unknown, bad: (reason: unknown) => unknown) =>
          Promise.resolve()
            .then(() => reply(call))
            .then((r) => ({ data: r.data === undefined ? null : r.data, error: r.error ?? null, status: r.status ?? (r.error ? 400 : 200) }))
            .then(ok, bad),
      }
    },
  }
  return { client: client as unknown as Client, calls }
}

const row = (id: string, email: string, createdAt: string, signedInAt: string | null) => ({
  id,
  email,
  created_at: createdAt,
  signed_in_at: signedInAt,
})

async function caught(run: () => Promise<unknown>): Promise<DeskStorageError> {
  try {
    await run()
  } catch (error) {
    expect(error).toBeInstanceOf(DeskStorageError)
    return error as DeskStorageError
  }
  throw new Error('던지지 않았다')
}

/** 오류에 Supabase 문구·메일이 들어가지 않았다 */
function expectClean(error: DeskStorageError, ...secrets: string[]) {
  const shown = [error.message, String(error), JSON.stringify(error), String(error.stack ?? ''), String((error as Error).cause ?? '')].join(' ')
  for (const secret of [RAW, 'secret detail', ...secrets]) expect(shown).not.toContain(secret)
  expect((error as Error).cause).toBeUndefined()
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AC-6304.1 deskEmail — 메일 모양 검사', () => {
  it.each([
    ['desk1@example.com', 'desk1@example.com'],
    ['  Desk1@Example.COM  ', 'desk1@example.com'],
    ['\tfront.desk+2@sub.example.com\n', 'front.desk+2@sub.example.com'],
  ])('AC-6304.1: "%s"는 앞뒤 빈칸을 빼고 소문자로 "%s"다', (text, email) => {
    expect(deskEmail(text)).toBe(email)
  })

  it.each(['', '   ', 'desk1', 'desk1@', '@example.com', 'desk1@example', 'desk 1@example.com', 'desk1@exa mple.com', 'a@b@example.com'])(
    'AC-6304.1: 메일 모양이 아닌 "%s"는 null이다',
    (text) => {
      expect(deskEmail(text)).toBeNull()
    },
  )

  it('AC-6304.1: 254자까지는 되고 255자는 null이다(앞뒤 빈칸은 세지 않는다)', () => {
    const at254 = `${'a'.repeat(242)}@example.com`
    expect(at254).toHaveLength(254)
    expect(deskEmail(`  ${at254}  `)).toBe(at254)
    expect(deskEmail(`a${at254}`)).toBeNull()
  })
})

describe('AC-6304.1 listDeskMembers — desk_members만 부르고 줄 모양을 확인한다', () => {
  it('AC-6304.1: desk_members를 인자 없이 한 번만 부르고 줄을 {id, email, addedAt, signedInAt}로 받은 차례대로 바꾼다', async () => {
    const { client, calls } = fakeClient(() => ({
      data: [
        row('m-1', 'desk1@example.com', '2026-11-18T01:00:00+00:00', '2026-11-18T02:30:00+00:00'),
        row('m-2', 'desk2@example.com', '2026-11-18T03:00:00+00:00', null),
      ],
    }))
    await expect(listDeskMembers(client)).resolves.toEqual([
      { id: 'm-1', email: 'desk1@example.com', addedAt: '2026-11-18T01:00:00+00:00', signedInAt: '2026-11-18T02:30:00+00:00' },
      { id: 'm-2', email: 'desk2@example.com', addedAt: '2026-11-18T03:00:00+00:00', signedInAt: null },
    ])
    expect(calls).toEqual([{ fn: 'desk_members', args: undefined }])
  })

  it('AC-6304.1: 받은 줄의 다른 칸은 옮기지 않는다(정해 둔 네 칸만)', async () => {
    const { client } = fakeClient(() => ({ data: [{ ...row('m-1', 'desk1@example.com', '2026-11-18T01:00:00Z', null), hospital_id: 'h-1', role: 'desk' }] }))
    const [member] = await listDeskMembers(client)
    expect(Object.keys(member).sort()).toEqual(['addedAt', 'email', 'id', 'signedInAt'])
  })

  it('AC-6304.1: 모양이 틀린 줄은 빼고 맞는 줄만 남긴다', async () => {
    const good = row('m-9', 'desk9@example.com', '2026-11-18T01:00:00Z', null)
    const { client } = fakeClient(() => ({
      data: [
        null,
        'm-1',
        ['m-1', 'desk1@example.com'],
        row('', 'desk1@example.com', '2026-11-18T01:00:00Z', null),
        { ...row('m-2', 'desk2@example.com', '2026-11-18T01:00:00Z', null), id: 2 },
        row('m-3', '', '2026-11-18T01:00:00Z', null),
        { ...row('m-4', 'desk4@example.com', '2026-11-18T01:00:00Z', null), email: null },
        row('m-5', 'desk5@example.com', '', null),
        row('m-6', 'desk6@example.com', 'not a date', null),
        row('m-7', 'desk7@example.com', '2026-11-18T01:00:00Z', 'not a date'),
        { ...row('m-8', 'desk8@example.com', '2026-11-18T01:00:00Z', null), signed_in_at: 1763431200000 },
        { id: 'm-10', email: 'desk10@example.com' },
        good,
      ],
    }))
    await expect(listDeskMembers(client)).resolves.toEqual([
      { id: 'm-9', email: 'desk9@example.com', addedAt: '2026-11-18T01:00:00Z', signedInAt: null },
    ])
  })

  it.each([null, {}, 'rows', 3])('AC-6304.1: 답이 목록이 아니면(%j) 빈 목록으로 보이지 않고 failed다', async (data) => {
    const { client } = fakeClient(() => ({ data }))
    expect((await caught(() => listDeskMembers(client))).kind).toBe('failed')
  })
})

describe('AC-6304.1 addDeskMember — add_desk_member만 부르고 다섯 답 가운데 하나를 돌려준다', () => {
  it.each(['added', 'bad', 'taken', 'used', 'limit'] as const)('AC-6304.1: 함수 답 "%s"를 그대로 돌려준다', async (answer) => {
    const { client, calls } = fakeClient(() => ({ data: answer }))
    await expect(addDeskMember(client, 'desk1@example.com')).resolves.toBe(answer)
    expect(calls).toEqual([{ fn: 'add_desk_member', args: { p_email: 'desk1@example.com' } }])
  })

  it('AC-6304.1: 앞뒤 빈칸을 빼고 소문자로 바꾼 메일만 보낸다', async () => {
    const { client, calls } = fakeClient(() => ({ data: 'added' }))
    await addDeskMember(client, '  Desk1@Example.COM ')
    expect(calls).toEqual([{ fn: 'add_desk_member', args: { p_email: 'desk1@example.com' } }])
  })

  it.each(['', '   ', 'desk1', 'desk1@example', 'desk 1@example.com', `a${'a'.repeat(242)}@example.com`])(
    'AC-6304.1: 메일 모양이 아니거나 254자를 넘는 "%s"는 보내지 않고 bad다',
    async (text) => {
      const { client, calls } = fakeClient(() => ({ data: 'added' }))
      await expect(addDeskMember(client, text)).resolves.toBe('bad')
      expect(calls).toEqual([])
    },
  )

  it.each([null, 'ok', 'ADDED', 'added ', 1, true, ['added'], { result: 'added' }])(
    'AC-6304.1: 답이 다섯 글자 가운데 하나가 아니면(%j) failed다',
    async (data) => {
      const { client } = fakeClient(() => ({ data }))
      expectClean(await caught(() => addDeskMember(client, 'desk1@example.com')), 'desk1@example.com')
    },
  )
})

describe('AC-6304.1 removeDeskMember — remove_desk_member만 부른다', () => {
  it('AC-6304.1: 그 줄 id 하나를 p_id로 보낸다', async () => {
    const { client, calls } = fakeClient(() => ({ data: null }))
    await expect(removeDeskMember(client, 'm-1')).resolves.toBeUndefined()
    expect(calls).toEqual([{ fn: 'remove_desk_member', args: { p_id: 'm-1' } }])
  })

  it.each(['', 3, null])('AC-6304.1: id가 빈 글자·글자가 아님(%j)이면 보내지 않고 failed다', async (id) => {
    const { client, calls } = fakeClient(() => ({ data: null }))
    expect((await caught(() => removeDeskMember(client, id as string))).kind).toBe('failed')
    expect(calls).toEqual([])
  })
})

describe('AC-6304.1 실패는 DeskStorageError(offline·failed)이고 Supabase 문구·메일을 담지 않는다', () => {
  const runs = [
    ['listDeskMembers', (client: Client) => listDeskMembers(client)],
    ['addDeskMember', (client: Client) => addDeskMember(client, 'desk1@example.com')],
    ['removeDeskMember', (client: Client) => removeDeskMember(client, 'm-1')],
  ] as const

  it.each(runs)('AC-6304.1: %s — 브라우저가 오프라인이면 보내지 않고 offline이다', async (_, run) => {
    vi.stubGlobal('navigator', { onLine: false })
    const { client, calls } = fakeClient()
    const error = await caught(() => run(client))
    expect(error.kind).toBe('offline')
    expect(calls).toEqual([])
  })

  it.each(runs)('AC-6304.1: %s — 응답이 없으면(status 0) offline이다', async (_, run) => {
    const { client } = fakeClient(() => ({ error: { message: RAW }, status: 0 }))
    const error = await caught(() => run(client))
    expect(error.kind).toBe('offline')
    expectClean(error, 'desk1@example.com')
  })

  it.each(runs)('AC-6304.1: %s — Supabase 오류 답은 failed이고 문구·메일이 오류에 없다', async (_, run) => {
    const { client } = fakeClient(() => ({ error: { message: RAW, code: '42501', details: 'desk1@example.com' }, status: 403 }))
    const error = await caught(() => run(client))
    expect(error.kind).toBe('failed')
    expect(error.name).toBe('DeskStorageError')
    expectClean(error, 'desk1@example.com', '42501')
  })

  it.each(runs)('AC-6304.1: %s — 보내다 던지면 failed이고 던진 글자가 오류에 없다', async (_, run) => {
    const { client } = fakeClient(() => {
      throw new Error(`${RAW} desk1@example.com`)
    })
    const error = await caught(() => run(client))
    expect(error.kind).toBe('failed')
    expectClean(error, 'desk1@example.com')
  })
})
