// 휴진 안내 '내 배경' 읽기·저장·지우기 (specs/forms-themes TASK-9, REQ-4609 · AC-4609.1~4609.4, design.md 8-3절). 실제 Supabase에 붙지 않는다.
// 가짜 클라이언트가 표(form_backgrounds)와 그림 저장소(form-backgrounds)에 무엇이 어떤 차례로 나갔는지 적어 둔다.
// 표 권한·RLS·Storage 정책은 supabase/formBackgrounds.rls.test.ts가 증명한다. id·병원 id·적은 말·그림 바이트는 모두 지어낸 값이다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BG_IMAGE_MAX_BYTES, BG_THUMB_MAX, MAX_BACKGROUNDS, type SavedBackground } from '@/types/formBackground'
import { deleteBackground, listBackgrounds, readBackgroundImage, saveBackground } from './formBackgrounds'

const { supabaseBrowser } = vi.hoisted(() => ({ supabaseBrowser: vi.fn() }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser }))

const TABLE = 'form_backgrounds'
const BUCKET = 'form-backgrounds'
const COLUMNS = ['id', 'words', 'accent', 'thumb', 'path', 'created_at']
const SAVED_KEYS = ['accent', 'createdAt', 'id', 'path', 'thumb', 'words']
const SECRET = 'secret detail' // 서버 답에 섞여 온 글자. 밖으로 나가면 안 된다
const RAW_ERROR = { code: '42501', message: `new row violates row-level security policy (${SECRET})`, details: SECRET, hint: SECRET }
const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug'] as const

const HOSPITAL = 'abcdef12-2222-4333-8444-5555555555cd'
const ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const ID2 = 'ffffffff-0000-4111-8222-333333333333'
const pathOf = (id: string, hospital = HOSPITAL) => `${hospital}/${id}.jpg`
const PATH = pathOf(ID)
const CREATED = '2026-11-15T05:00:00.123456+00:00'
const CREATED2 = '2026-11-14T05:00:00.123456+00:00'
const WORDS = '봄 벚꽃'
const ACCENT = '#c2185b'
const THUMB = `/9j/${'A'.repeat(96)}`
// JPEG 머리(FF D8 FF)로 시작하는 가짜 그림 바이트
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01])
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const ITEM: SavedBackground = { id: ID, words: WORDS, accent: ACCENT, thumb: THUMB, path: PATH, createdAt: CREATED }
const INPUT = { words: WORDS, accent: ACCENT, thumb: THUMB, image: JPEG }

type TableCall = {
  kind: 'table'
  table: string
  op?: 'select' | 'insert' | 'delete' | 'update' | 'upsert'
  body?: unknown
  columns?: string[] // 읽는 칸, 또는 넣기 뒤 돌려받는 칸
  orders: [string, { ascending?: boolean } | undefined][]
  limit?: number
  filters: [string, unknown][] // eq
  single: boolean
}
type StorageCall = {
  kind: 'storage'
  bucket: string
  op: 'upload' | 'download' | 'remove' | 'update'
  path?: string
  paths?: unknown
  body?: unknown
  options?: unknown
}
type Call = TableCall | StorageCall
type Reply = { data?: unknown; error?: unknown }

/** 표에서 읽은 줄 그대로(select한 여섯 칸) */
const dbRow = (id: string, created: string, over: Record<string, unknown> = {}) => ({
  id,
  words: WORDS,
  accent: ACCENT,
  thumb: THUMB,
  path: pathOf(id),
  created_at: created,
  ...over,
})
const savedOf = (id: string, created: string): SavedBackground => ({ ...ITEM, id, path: pathOf(id), createdAt: created })
/** created_at 칸만 뺀 줄 */
const withoutCreated = (row: Record<string, unknown>) => {
  const copy = { ...row }
  delete copy.created_at
  return copy
}

/** 별일 없을 때의 답: 넣기는 보낸 몸통에 DB가 정하는 id·path·created_at을 붙여 돌려주고, 올리기·지우기는 오류 없음, 내려받기는 JPEG */
function okReply(call: Call): Reply {
  if (call.kind === 'table') {
    if (call.op === 'insert') return { data: { id: ID, ...(call.body as object), path: PATH, created_at: CREATED } }
    if (call.op === 'delete') return { data: null }
    return { data: [] }
  }
  if (call.op === 'upload') return { data: { id: 'fake-object', path: call.path, fullPath: `${BUCKET}/${call.path}` } }
  if (call.op === 'download') return { data: new Blob([JPEG.slice()], { type: 'image/jpeg' }) }
  return { data: [] }
}

/** 표·그림 저장소 부름을 한 줄로 적는 가짜 클라이언트를 브라우저 클라이언트 자리에 둔다. reply가 던지면 네트워크 예외와 같다 */
function fakeClient(reply: (call: Call) => Reply = okReply) {
  const calls: Call[] = []
  const answer = (call: Call) =>
    Promise.resolve()
      .then(() => reply(call))
      .then((r) => ({ data: r.data === undefined ? null : r.data, error: r.error ?? null }))
  const client = {
    from(table: string) {
      const call: TableCall = { kind: 'table', table, orders: [], filters: [], single: false }
      calls.push(call)
      const builder = {
        select(columns: string) {
          call.op ??= 'select'
          call.columns = columns.split(',').map((column) => column.trim())
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
        upsert(body: unknown) {
          call.op = 'upsert'
          call.body = body
          return builder
        },
        delete() {
          call.op = 'delete'
          return builder
        },
        order(column: string, options?: { ascending?: boolean }) {
          call.orders.push([column, options])
          return builder
        },
        limit(count: number) {
          call.limit = count
          return builder
        },
        eq(column: string, value: unknown) {
          call.filters.push([column, value])
          return builder
        },
        single() {
          call.single = true
          return builder
        },
        // 진짜 빌더처럼 await할 때 답한다
        then(ok: (value: unknown) => unknown, bad: (reason: unknown) => unknown) {
          return answer(call).then(ok, bad)
        },
      }
      return builder
    },
    storage: {
      from(bucket: string) {
        const send = (call: StorageCall) => {
          calls.push(call)
          return answer(call)
        }
        return {
          upload: (path: string, body: unknown, options?: unknown) => send({ kind: 'storage', bucket, op: 'upload', path, body, options }),
          update: (path: string, body: unknown, options?: unknown) => send({ kind: 'storage', bucket, op: 'update', path, body, options }),
          download: (path: string) => send({ kind: 'storage', bucket, op: 'download', path }),
          remove: (paths: unknown) => send({ kind: 'storage', bucket, op: 'remove', paths }),
        }
      },
    },
  }
  supabaseBrowser.mockReturnValue(client)
  return calls
}

/** 부른 것의 차례를 짧게: 'table:insert'·'storage:upload' */
const steps = (calls: Call[]) => calls.map((call) => `${call.kind}:${call.op}`)
const tableCalls = (calls: Call[]) => calls.filter((call): call is TableCall => call.kind === 'table')
const storageCalls = (calls: Call[]) => calls.filter((call): call is StorageCall => call.kind === 'storage')

/** 한 가지 부름만 다르게 답한다 */
const when = (match: (call: Call) => boolean, reply: (call: Call) => Reply) => (call: Call) => (match(call) ? reply(call) : okReply(call))
const isOp = (kind: Call['kind'], op: string) => (call: Call) => call.kind === kind && call.op === op
const throwing = (): Reply => {
  throw new Error(SECRET)
}

// 오류 답·예외·클라이언트 만들기 실패(모든 부름이 같다)
const FAILURES: [string, () => void][] = [
  ['오류 답', () => fakeClient(() => ({ error: RAW_ERROR }))],
  ['오류가 값과 함께 옴', () => fakeClient((call) => ({ ...okReply(call), error: RAW_ERROR }))],
  ['보내다 예외(네트워크)', () => fakeClient(throwing)],
  [
    '클라이언트 만들기 실패',
    () =>
      supabaseBrowser.mockImplementation(() => {
        throw new Error(SECRET)
      }),
  ],
  [
    '빌더 만들기 실패(from이 곧바로 던짐)',
    () =>
      supabaseBrowser.mockReturnValue({
        from: () => {
          throw new Error(SECRET)
        },
        storage: {
          from: () => {
            throw new Error(SECRET)
          },
        },
      }),
  ],
]

beforeEach(() => {
  supabaseBrowser.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// 하나라도 걸리면 그 줄은 목록에서 빠진다(checkBackgroundRow, 고쳐 쓰지 않는다)
const BAD_ROWS: [string, unknown][] = [
  ['다른 칸(hospital_id)이 묻어 옴', dbRow('bad-0', CREATED, { id: ID2, path: pathOf(ID2), hospital_id: HOSPITAL })],
  ['created_at 칸이 없음', withoutCreated(dbRow(ID2, CREATED))],
  ['id가 대문자 uuid', dbRow(ID2.toUpperCase(), CREATED, { path: pathOf(ID2.toUpperCase()) })],
  ['path의 id가 줄 id와 다름', dbRow(ID2, CREATED, { path: pathOf(ID) })],
  ['path가 .png', dbRow(ID2, CREATED, { path: `${HOSPITAL}/${ID2}.png` })],
  ['강조색이 대문자', dbRow(ID2, CREATED, { accent: '#C2185B' })],
  ['강조색이 3자리', dbRow(ID2, CREATED, { accent: '#c21' })],
  ['작은 그림이 /9j/로 시작하지 않음', dbRow(ID2, CREATED, { thumb: `iVBO${'A'.repeat(96)}` })],
  ['작은 그림이 16,000자 넘음', dbRow(ID2, CREATED, { thumb: `/9j/${'A'.repeat(BG_THUMB_MAX)}` })],
  ['적은 말에 줄바꿈', dbRow(ID2, CREATED, { words: '봄\n벚꽃' })],
  ['적은 말이 전화번호 모양', dbRow(ID2, CREATED, { words: '010-1234-5678' })],
  ['적은 말이 31자', dbRow(ID2, CREATED, { words: '가'.repeat(31) })],
  ['created_at이 null', dbRow(ID2, CREATED, { created_at: null })],
  ['줄이 null', null],
  ['줄이 배열', []],
]

describe('AC-4609.1 listBackgrounds 읽기', () => {
  it('AC-4609.1: form_backgrounds에서 여섯 칸만 created_at 내림차순(만든 차례 거꾸로)으로 30개까지 한 번 읽는다(병원으로 거르지 않는다, RLS 몫)', async () => {
    const calls = fakeClient()
    await listBackgrounds()
    expect(supabaseBrowser).toHaveBeenCalledTimes(1)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ kind: 'table', table: TABLE, op: 'select', limit: 30, filters: [], single: false })
    expect(MAX_BACKGROUNDS).toBe(30)
    const [call] = tableCalls(calls)
    expect(call.columns).toEqual(COLUMNS)
    expect(call.orders.map(([column]) => column)).toEqual(['created_at'])
    expect(call.orders[0][1]?.ascending).toBe(false)
  })

  it('AC-4609.1: 받은 줄을 서버 차례 그대로 { id, words, accent, thumb, path, createdAt }로 바꾸고, 그림 저장소는 부르지 않는다', async () => {
    const calls = fakeClient(when(isOp('table', 'select'), () => ({ data: [dbRow(ID, CREATED), dbRow(ID2, CREATED2)] })))
    const list = await listBackgrounds()
    expect(list).toEqual([savedOf(ID, CREATED), savedOf(ID2, CREATED2)])
    for (const saved of list as SavedBackground[]) expect(Object.keys(saved).sort()).toEqual(SAVED_KEYS)
    expect(storageCalls(calls)).toEqual([])
  })

  it('AC-4609.1: 줄이 없으면 빈 목록이다(실패가 아니다)', async () => {
    fakeClient()
    await expect(listBackgrounds()).resolves.toEqual([])
  })

  it.each(BAD_ROWS)('AC-4609.1: %s → checkBackgroundRow를 못 넘어 그 줄은 뺀다', async (_, bad) => {
    fakeClient(when(isOp('table', 'select'), () => ({ data: [bad] })))
    await expect(listBackgrounds()).resolves.toEqual([])
  })

  it('AC-4609.1: 못 넘는 줄만 빼고 나머지는 차례 그대로 둔다(목록 전체를 실패로 만들지 않는다)', async () => {
    fakeClient(when(isOp('table', 'select'), () => ({ data: [dbRow(ID, CREATED), ...BAD_ROWS.map(([, bad]) => bad), dbRow(ID2, CREATED2)] })))
    await expect(listBackgrounds()).resolves.toEqual([savedOf(ID, CREATED), savedOf(ID2, CREATED2)])
  })

  it.each([
    ...FAILURES,
    ['오류 없이 줄 목록이 안 옴(null)', () => fakeClient(when(isOp('table', 'select'), () => ({ data: null })))],
    ['오류 없이 배열이 아닌 답', () => fakeClient(when(isOp('table', 'select'), () => ({ data: { rows: [] } })))],
  ] as [string, () => void][])("AC-4609.1: %s → 빈 목록이 아니라 'failed'", async (_, arrange) => {
    arrange()
    await expect(listBackgrounds()).resolves.toBe('failed')
  })
})

describe('AC-4609.2 saveBackground 저장(줄 넣기 → 받은 path로 그림 올리기)', () => {
  it('AC-4609.2: 먼저 form_backgrounds에 { words, accent, thumb } 셋만 넣고 여섯 칸을 한 줄(single)로 돌려받은 뒤, 그 path로 그림을 올린다', async () => {
    const calls = fakeClient()
    await expect(saveBackground(INPUT)).resolves.toEqual(ITEM)
    expect(steps(calls)).toEqual(['table:insert', 'storage:upload'])

    const [insert] = tableCalls(calls)
    expect(insert).toMatchObject({ table: TABLE, filters: [], single: true })
    expect(insert.columns).toEqual(COLUMNS)
    expect(insert.body).toEqual({ words: WORDS, accent: ACCENT, thumb: THUMB })
    expect(Object.keys(insert.body as object).sort()).toEqual(['accent', 'thumb', 'words'])

    const [upload] = storageCalls(calls)
    expect(upload).toMatchObject({ bucket: BUCKET, op: 'upload', path: PATH })
    expect(upload.options).toEqual({ contentType: 'image/jpeg', upsert: false })
    expect(upload.body).toBeInstanceOf(Blob)
    const blob = upload.body as Blob
    expect(blob.type).toBe('image/jpeg')
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(JPEG)
  })

  it('AC-4609.2: 올리는 곳은 내가 만든 이름이 아니라 DB가 돌려준 path다(병원 폴더는 DB가 정한다)', async () => {
    const otherHospital = '0badc0de-1111-4222-8333-444444444444'
    const calls = fakeClient(
      when(isOp('table', 'insert'), (call) => ({ data: { id: ID2, ...((call as TableCall).body as object), path: pathOf(ID2, otherHospital), created_at: CREATED } })),
    )
    const saved = await saveBackground(INPUT)
    expect(saved).toEqual({ ...ITEM, id: ID2, path: pathOf(ID2, otherHospital) })
    expect(storageCalls(calls).map((call) => call.path)).toEqual([pathOf(ID2, otherHospital)])
  })

  it('AC-4609.2: 적은 말은 앞뒤 공백을 떼어 보내고, 받은 값에 묻은 다른 칸(그림·병원·id·path·프롬프트)은 몸통에 없다. 받은 값은 고치지 않는다', async () => {
    const calls = fakeClient()
    const input = { ...INPUT, words: `  ${WORDS} `, id: 'other-id', hospital_id: 'other-hospital', path: 'other/path.jpg', prompt: 'leak prompt', bytes: JPEG }
    const before = { ...input }
    await expect(saveBackground(input)).resolves.toEqual(ITEM)
    const body = tableCalls(calls)[0].body as Record<string, unknown>
    expect(body).toEqual({ words: WORDS, accent: ACCENT, thumb: THUMB })
    expect(body).not.toBe(input)
    const sent = JSON.stringify(body)
    for (const leak of ['other-id', 'other-hospital', 'other/path.jpg', 'leak prompt', 'image', 'bytes']) expect(sent).not.toContain(leak)
    expect(input).toEqual(before)
  })

  const tooBig = new Uint8Array(BG_IMAGE_MAX_BYTES + 1)
  tooBig.set([0xff, 0xd8, 0xff])
  it.each([
    ['적은 말이 빈 글', { words: '' }],
    ['적은 말이 공백뿐', { words: '   ' }],
    ['적은 말이 31자', { words: '가'.repeat(31) }],
    ['적은 말에 줄바꿈', { words: '봄\n벚꽃' }],
    ['적은 말에 탭', { words: '봄\t벚꽃' }],
    ['적은 말이 전화번호 모양', { words: '010-1234-5678' }],
    ['적은 말이 메일 주소 모양', { words: 'a@b.kr 벚꽃' }],
    ['적은 말이 글이 아님', { words: 7 }],
    ['강조색이 대문자', { accent: '#C2185B' }],
    ['강조색이 3자리', { accent: '#c21' }],
    ['강조색에 # 없음', { accent: 'c2185b' }],
    ['작은 그림이 /9j/로 시작하지 않음', { thumb: `iVBO${'A'.repeat(96)}` }],
    ['작은 그림 길이가 4의 배수가 아님', { thumb: `/9j/${'A'.repeat(95)}` }],
    ['작은 그림이 16,000자 넘음', { thumb: `/9j/${'A'.repeat(BG_THUMB_MAX)}` }],
    ['그림이 JPEG(FF D8 FF)가 아님', { image: PNG }],
    ['그림이 빈 바이트', { image: new Uint8Array(0) }],
    ['그림이 FF D8 둘뿐', { image: new Uint8Array([0xff, 0xd8]) }],
    ['그림이 3,000,000바이트 넘음', { image: tooBig }],
    ['그림이 바이트가 아님', { image: 'ffd8ff' }],
  ] as [string, Record<string, unknown>][])("AC-4609.2: %s → 아무것도 보내지 않고 'failed'", async (_, change) => {
    const calls = fakeClient()
    await expect(saveBackground({ ...INPUT, ...change } as typeof INPUT)).resolves.toBe('failed')
    expect(calls).toEqual([])
  })

  it.each([
    ['돌려받은 줄이 없음(null)', () => ({ data: null })],
    ['돌려받은 줄의 path가 다른 id', () => ({ data: dbRow(ID, CREATED, { path: pathOf(ID2) }) })],
    ['돌려받은 줄에 created_at이 없음', () => ({ data: withoutCreated(dbRow(ID, CREATED)) })],
    ['넣기 오류 답', () => ({ error: RAW_ERROR })],
    ['넣기 예외(네트워크)', throwing],
  ] as [string, (call: Call) => Reply][])("AC-4609.2: %s → 그림을 올리지 않고 'failed'", async (_, reply) => {
    const calls = fakeClient(when(isOp('table', 'insert'), reply))
    await expect(saveBackground(INPUT)).resolves.toBe('failed')
    expect(steps(calls)).toEqual(['table:insert'])
  })

  it.each([
    ['올리기 오류 답(정책 거부·크기 넘음)', () => ({ error: RAW_ERROR })],
    ['올리기 예외(네트워크)', throwing],
  ] as [string, (call: Call) => Reply][])("AC-4609.2: %s → 넣은 그 id 줄을 지우고 'failed'", async (_, reply) => {
    const calls = fakeClient(when(isOp('storage', 'upload'), reply))
    await expect(saveBackground(INPUT)).resolves.toBe('failed')
    expect(steps(calls)).toEqual(['table:insert', 'storage:upload', 'table:delete'])
    const remove = tableCalls(calls)[1]
    expect(remove).toMatchObject({ table: TABLE, op: 'delete', single: false })
    expect(remove.filters).toEqual([['id', ID]])
    expect(remove.body).toBeUndefined()
  })

  it("AC-4609.2: 올리기도 실패하고 줄 지우기도 실패해도 던지지 않고 'failed'다", async () => {
    for (const reply of [() => ({ error: RAW_ERROR }), throwing]) {
      supabaseBrowser.mockReset()
      const calls = fakeClient((call) => (call.kind === 'storage' || call.op === 'delete' ? reply() : okReply(call)))
      await expect(saveBackground(INPUT)).resolves.toBe('failed')
      expect(steps(calls)).toEqual(['table:insert', 'storage:upload', 'table:delete'])
    }
  })

  it.each(FAILURES)("AC-4609.2: %s → 'failed'", async (_, arrange) => {
    arrange()
    await expect(saveBackground(INPUT)).resolves.toBe('failed')
  })
})

describe('AC-4609.3 readBackgroundImage 내려받기', () => {
  it('AC-4609.3: 그림 저장소 form-backgrounds에서 그 path 하나를 내려받아 JPEG면 바이트를 돌려준다(표는 부르지 않는다)', async () => {
    const calls = fakeClient()
    await expect(readBackgroundImage(ITEM)).resolves.toEqual(JPEG)
    expect(steps(calls)).toEqual(['storage:download'])
    expect(storageCalls(calls)[0]).toMatchObject({ bucket: BUCKET, path: PATH })
  })

  it.each([
    ['PNG 바이트', PNG],
    ['빈 바이트', new Uint8Array(0)],
    ['FF D8 둘뿐', new Uint8Array([0xff, 0xd8])],
    ['FF D8 00', new Uint8Array([0xff, 0xd8, 0x00, 0xe0])],
  ] as [string, Uint8Array][])('AC-4609.3: 받은 것이 JPEG가 아니면(%s) null', async (_, bytes) => {
    fakeClient(when(isOp('storage', 'download'), () => ({ data: new Blob([bytes.slice()]) })))
    await expect(readBackgroundImage(ITEM)).resolves.toBeNull()
  })

  it.each([
    ...FAILURES,
    ['오류 없이 그림이 안 옴(null)', () => fakeClient(when(isOp('storage', 'download'), () => ({ data: null })))],
    ['그림이 Blob이 아님', () => fakeClient(when(isOp('storage', 'download'), () => ({ data: 'ffd8ff' })))],
  ] as [string, () => void][])('AC-4609.3: %s → null', async (_, arrange) => {
    arrange()
    await expect(readBackgroundImage(ITEM)).resolves.toBeNull()
  })
})

describe('AC-4609.4 deleteBackground 지우기(그림 → 줄)', () => {
  it('AC-4609.4: 그림 저장소에서 그 path 그림을 먼저 지우고, 그다음 그 id 줄 하나를 지운다. 둘 다 오류가 없으면 true', async () => {
    const calls = fakeClient()
    await expect(deleteBackground(ITEM)).resolves.toBe(true)
    expect(steps(calls)).toEqual(['storage:remove', 'table:delete'])
    expect(storageCalls(calls)[0]).toMatchObject({ bucket: BUCKET, paths: [PATH] })
    const [remove] = tableCalls(calls)
    expect(remove).toMatchObject({ table: TABLE, single: false })
    expect(remove.filters).toEqual([['id', ID]])
    expect(remove.body).toBeUndefined()
    expect(remove.columns).toBeUndefined()
  })

  it('AC-4609.4: 지울 그림이 이미 없어도(빈 답, 오류 없음) 줄을 지운다(다시 눌러 마저 지울 수 있다)', async () => {
    const calls = fakeClient(when(isOp('storage', 'remove'), () => ({ data: [] })))
    await expect(deleteBackground(ITEM)).resolves.toBe(true)
    expect(steps(calls)).toEqual(['storage:remove', 'table:delete'])
  })

  it.each([
    ['그림 지우기 오류 답', () => ({ error: RAW_ERROR })],
    ['그림 지우기 예외', throwing],
  ] as [string, (call: Call) => Reply][])('AC-4609.4: %s → 줄은 지우지 않고 false', async (_, reply) => {
    const calls = fakeClient(when(isOp('storage', 'remove'), reply))
    await expect(deleteBackground(ITEM)).resolves.toBe(false)
    expect(steps(calls)).toEqual(['storage:remove'])
  })

  it.each([
    ['줄 지우기 오류 답', () => ({ error: RAW_ERROR })],
    ['줄 지우기 예외', throwing],
  ] as [string, (call: Call) => Reply][])('AC-4609.4: 그림은 지웠지만 %s → false', async (_, reply) => {
    const calls = fakeClient(when(isOp('table', 'delete'), reply))
    await expect(deleteBackground(ITEM)).resolves.toBe(false)
    expect(steps(calls)).toEqual(['storage:remove', 'table:delete'])
  })

  it.each(FAILURES)('AC-4609.4: %s → false', async (_, arrange) => {
    arrange()
    await expect(deleteBackground(ITEM)).resolves.toBe(false)
  })
})

describe('AC-4609.1~4609.4 오류 내용을 밖에 내지 않는다', () => {
  const RUNS: [string, () => Promise<unknown>][] = [
    ['listBackgrounds', () => listBackgrounds()],
    ['saveBackground', () => saveBackground(INPUT)],
    ['readBackgroundImage', () => readBackgroundImage(ITEM)],
    ['deleteBackground', () => deleteBackground(ITEM)],
  ]

  it.each(RUNS)('AC-4609.4: %s — 실패해도 던지지 않고, 답에도 console에도 서버 오류 글이 없다', async (_, run) => {
    const spies = CONSOLE_METHODS.map((method) => vi.spyOn(console, method).mockImplementation(() => {}))
    for (const [, arrange] of FAILURES) {
      supabaseBrowser.mockReset()
      arrange()
      const result = await run()
      expect(['failed', false, null]).toContain(result)
      expect(JSON.stringify(result) ?? '').not.toContain(SECRET)
    }
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })
})
