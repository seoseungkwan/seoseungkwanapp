import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_GSHEET_SETTINGS, GSHEET_PINNED_KEYS, type GsheetRun, type GsheetSettings } from '@/types/gsheet'
import {
  addGsheetRun,
  GsheetStorageError,
  lastGsheetRun,
  listGsheetMonths,
  listGsheetRuns,
  loadGsheetSettings,
  saveGsheetSettings,
  setSecretTag,
  upsertGsheetMonths,
} from './gsheet'

// 수납일지 구글 시트 저장 함수 (spec google-link REQ-8505 AC-8505.2, design.md 7-3·10-2·10-3). 실제 Supabase에 붙지 않는다.
// 주소·메일·파일 id·지문은 모두 지어낸 것이다

const SECRET = 'secret detail'
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbFAKEfakeFAKE1234567890/exec'
const MAIL = 'desk@fake.test'
const TAG = '0123456789abcdef'
const FILE = 'FAKEfileFAKEfileFAKEfile_0123456789'
const DAY = '2026-11-26'
const AT = '2026-11-26T05:35:00.000Z'
const DB_AT = '2026-11-26 14:35:00.123456+09'
const ASC = { ascending: true }
const ON_HOSPITAL = { onConflict: 'hospital_id' }

// 읽는 칸(design.md 7-3 표 그대로). hospital_id·id·updated_at은 읽지 않는다
const SETTINGS_COLUMNS = 'conf,secret_tag'
const MONTH_COLUMNS = 'ym,file_id,gids'
const RUN_COLUMNS = 'at,day,via,mode,outcome,code,rows,counts,cells'

// 비트시트 7판 기본값에서 코드 주소·함께 쓸 메일을 뺀 것(design.md 10-2 '기본값' 글을 그대로 옮겨 적음)
const BITSHEET_DEFAULTS: GsheetSettings = {
  templateUrl: '',
  namePattern: '{병원} 일일수납일지 {yyyy}년 {m}월',
  hospitalLabel: '',
  folderUrl: '',
  firstRow: 17,
  lastRow: 302,
  cols: { key: 'B', name: 'C', sign: 'D', amount: 'F', room: 'I', first: 'J', day90: 'K', block: 'L', therapy: 'M', note: 'G' },
  markValue: '0',
  signs: { cash: 1, card: 2, recvCash: 3, recvCard: 4, transfer: 5, recvTransfer: 5, free: 6 },
  shiftCols: 'A:P',
  staffCols: ['G', 'O'],
  bitHospital: '',
  deptRooms: {},
  deptRoomsHospital: '',
  firstKinds: ['1'],
  day90Kinds: ['3'],
  blockCodes: [],
  therapyCodes: [],
  free: 'discount',
  freeInsurance: [31],
  carInsurance: [21, 22],
  aidInsurance: [51, 52],
  noteCar: true,
  noteAid: true,
  autoOn: true,
  everyMin: 5,
  from: '08:00',
  to: '20:00',
  eveningOn: true,
  evening: '19:30',
}
const SETTINGS_KEYS = Object.keys(BITSHEET_DEFAULTS).sort()

const MINE: GsheetSettings = {
  ...BITSHEET_DEFAULTS,
  templateUrl: 'https://docs.google.com/spreadsheets/d/FAKEtemplateFAKEtemplate01/edit',
  hospitalLabel: '양지바른정형외과',
  folderUrl: 'https://drive.google.com/drive/folders/FAKEfolderFAKEfolder01',
  bitHospital: '00000001',
  deptRooms: { '01': 1, '02': 2 },
  deptRoomsHospital: '00000001',
  blockCodes: ['MM100'],
  therapyCodes: ['MM301', 'MM302'],
  free: 'nhis-zero',
  autoOn: false,
  everyMin: 10,
}

const COUNTS = { rows: 12, patients: 10, added: 2, filled: 1, overwritten: 0, full: false, oldCode: false }
const RUN_INPUT: Omit<GsheetRun, 'at'> = {
  day: DAY,
  via: 'auto',
  mode: 'fillEmpty',
  outcome: 'ok',
  code: null,
  rows: 12,
  counts: COUNTS,
  cells: ['26!C17', '26!F18'],
}
const RUN_ROW = { at: DB_AT, ...RUN_INPUT }
const RUN: GsheetRun = { at: DB_AT, ...RUN_INPUT }

type Reply = { data: unknown; error: unknown; status: number }
const OK: Reply = { data: null, error: null, status: 200 }
const okWith = (data: unknown): Reply => ({ ...OK, data })
const failure = (status: number): Reply => ({ data: null, error: { message: SECRET, details: SECRET, hint: SECRET, code: SECRET }, status })

type Call = [string, ...unknown[]]
const METHODS = ['select', 'eq', 'is', 'gte', 'lte', 'in', 'order', 'range', 'limit', 'insert', 'update', 'upsert', 'delete', 'maybeSingle', 'single']

function fakeClient(...replies: Reply[]) {
  const calls: Call[] = []
  const queue = replies.length > 0 ? [...replies] : [OK]
  const builder: Record<string, unknown> = {}
  for (const name of METHODS) {
    builder[name] = (...args: unknown[]) => {
      calls.push([name, ...args])
      return builder
    }
  }
  builder.then = (resolve: (value: Reply) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve((queue.length > 1 ? queue.shift() : queue[0]) as Reply).then(resolve, reject)
  const client = {
    from(table: string) {
      calls.push(['from', table])
      return builder
    },
  } as unknown as Pick<SupabaseClient, 'from'>
  return { client, calls }
}

const throwingClient = {
  from() {
    throw new Error(SECRET)
  },
} as unknown as Pick<SupabaseClient, 'from'>

async function caught(run: () => Promise<unknown>): Promise<GsheetStorageError> {
  const thrown: unknown = await run().then(
    () => {
      throw new Error('오류가 나야 한다')
    },
    (error: unknown) => error,
  )
  expect(thrown).toBeInstanceOf(GsheetStorageError)
  const error = thrown as GsheetStorageError
  for (const text of [error.message, String(error), error.stack ?? '', JSON.stringify(error)]) expect(text).not.toContain(SECRET)
  expect(error.cause).toBeUndefined()
  return error
}

const named = (calls: Call[], name: string) => calls.filter((call) => call[0] === name)
const bodyOf = (calls: Call[], name: 'insert' | 'upsert', index = 0) => named(calls, name)[index]?.[1]
const sentNothing = (calls: Call[]) => expect(calls).toEqual([])
const many = <T>(n: number, make: (i: number) => T) => Array.from({ length: n }, (_, i) => make(i))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

// ── 설정 (gsheet_settings) ──────────────────────────────────

describe('AC-8505.2 수납 시트 설정 읽기 loadGsheetSettings', () => {
  it('AC-8505.2: 설정이 없는 병원은 비트시트 7판 기본값(코드 주소·함께 쓸 메일 없음)과 지문 없음이다', async () => {
    const { client, calls } = fakeClient(okWith(null))
    await expect(loadGsheetSettings(client)).resolves.toEqual({ settings: BITSHEET_DEFAULTS, secretTag: null })
    expect(calls).toEqual([['from', 'gsheet_settings'], ['select', SETTINGS_COLUMNS], ['maybeSingle']])
    expect(DEFAULT_GSHEET_SETTINGS).toEqual(BITSHEET_DEFAULTS)
    for (const key of GSHEET_PINNED_KEYS) expect(Object.keys(DEFAULT_GSHEET_SETTINGS)).not.toContain(key)
    expect([...GSHEET_PINNED_KEYS].sort()).toEqual(['scriptUrl', 'shareWith', 'url'])
  })

  it('AC-8505.2: 저장한 설정과 지문을 그대로 돌려준다', async () => {
    const { client } = fakeClient(okWith({ conf: MINE, secret_tag: TAG }))
    await expect(loadGsheetSettings(client)).resolves.toEqual({ settings: MINE, secretTag: TAG })
  })

  it('AC-8505.2: 틀린 칸만 기본값이고, 코드 주소·메일·모르는 열쇠는 돌려주지 않는다', async () => {
    const conf = {
      ...MINE,
      firstRow: 0,
      cols: { ...MINE.cols, amount: 7, extra: 'Z' },
      signs: { ...MINE.signs, free: 'six' },
      staffCols: 'G',
      free: 'free-all',
      everyMin: 0,
      evening: '25:00',
      deptRooms: { '01': 1, '02': 'two' },
      url: SCRIPT_URL,
      scriptUrl: SCRIPT_URL,
      shareWith: [MAIL],
      extra: SECRET,
    }
    const { client } = fakeClient(okWith({ conf, secret_tag: 'NOT-A-TAG' }))
    const { settings, secretTag } = await loadGsheetSettings(client)
    expect(settings).toEqual({
      ...MINE,
      firstRow: 17,
      cols: { ...MINE.cols, amount: 'F' },
      signs: { ...MINE.signs, free: 6 },
      staffCols: ['G', 'O'],
      free: 'discount',
      everyMin: 5,
      evening: '19:30',
      deptRooms: { '01': 1 },
    })
    expect(secretTag).toBeNull()
    expect(Object.keys(settings).sort()).toEqual(SETTINGS_KEYS)
    const text = JSON.stringify(settings)
    for (const piece of [SCRIPT_URL, MAIL, SECRET]) expect(text).not.toContain(piece)
  })

  it('AC-8505.2: 처음 줄이 끝 줄보다 뒤면 두 칸 모두 기본값이다', async () => {
    const { client } = fakeClient(okWith({ conf: { ...MINE, firstRow: 400, lastRow: 300 }, secret_tag: null }))
    expect((await loadGsheetSettings(client)).settings).toMatchObject({ firstRow: 17, lastRow: 302 })
  })

  it('AC-8505.2: 기본값은 받을 때마다 새 값이다(고쳐도 다음 답·상수가 바뀌지 않는다)', async () => {
    const { client } = fakeClient(okWith(null))
    const first = await loadGsheetSettings(client)
    first.settings.staffCols.push('Z')
    first.settings.cols.key = 'Z'
    const second = await loadGsheetSettings(client)
    expect(second.settings).toEqual(BITSHEET_DEFAULTS)
    expect(DEFAULT_GSHEET_SETTINGS).toEqual(BITSHEET_DEFAULTS)
  })
})

describe('AC-8505.2 수납 시트 설정 저장 saveGsheetSettings·setSecretTag', () => {
  it('AC-8505.2: 정해 둔 열쇠로 설정 한 칸(conf)만 새로 만들어 내 병원 줄에 덮어쓴다', async () => {
    const { client, calls } = fakeClient()
    await expect(saveGsheetSettings(client, { ...MINE, extra: SECRET } as GsheetSettings)).resolves.toBeUndefined()
    expect(calls).toEqual([
      ['from', 'gsheet_settings'],
      ['upsert', { conf: MINE }, ON_HOSPITAL],
    ])
    const conf = (bodyOf(calls, 'upsert') as { conf: GsheetSettings }).conf
    expect(Object.keys(conf).sort()).toEqual(SETTINGS_KEYS)
    expect(conf.deptRooms).not.toBe(MINE.deptRooms)
  })

  it.each(GSHEET_PINNED_KEYS)('AC-8505.2: %s 열쇠가 든 설정은 보내지 않고 invalid다(코드 주소·메일은 도우미에만)', async (key) => {
    const { client, calls } = fakeClient()
    const value = key === 'shareWith' ? [MAIL] : SCRIPT_URL
    await expect(saveGsheetSettings(client, { ...MINE, [key]: value } as GsheetSettings)).resolves.toBe('invalid')
    await expect(saveGsheetSettings(client, { ...MINE, cols: { ...MINE.cols, [key]: value } } as unknown as GsheetSettings)).resolves.toBe('invalid')
    await expect(saveGsheetSettings(client, { ...MINE, [key]: undefined } as GsheetSettings)).resolves.toBe('invalid')
    sentNothing(calls)
  })

  it.each([
    ['이름 꼴 비어 있음', { namePattern: '' }],
    ['처음 줄 0', { firstRow: 0 }],
    ['처음 줄이 끝 줄보다 뒤', { firstRow: 303 }],
    ['칸 글자 아님', { cols: { ...MINE.cols, name: 3 } }],
    ['칸 빠짐', { cols: { key: 'B' } }],
    ['기호 글자', { signs: { ...MINE.signs, cash: '1' } }],
    ['직원 칸 목록 아님', { staffCols: 'G' }],
    ['진료실 번호 글자', { deptRooms: { '01': 'one' } }],
    ['처방 코드 목록에 숫자', { blockCodes: [100] }],
    ['FREE 규칙 모름', { free: 'all' }],
    ['보험 코드 글자', { carInsurance: ['21'] }],
    ['켬 참거짓 아님', { autoOn: 'yes' }],
    ['간격 0분', { everyMin: 0 }],
    ['시각 모양 틀림', { from: '8:00' }],
    ['저녁 시각 25시', { evening: '25:00' }],
    ['칸 하나 없음', { markValue: undefined }],
    ['너무 큼(16,000바이트 넘음)', { therapyCodes: many(1000, (i) => `MM${String(i).padStart(14, '0')}`) }],
  ])('AC-8505.2: %s이면 보내지 않고 invalid다', async (_name, patch) => {
    const { client, calls } = fakeClient()
    await expect(saveGsheetSettings(client, { ...MINE, ...patch } as GsheetSettings)).resolves.toBe('invalid')
    sentNothing(calls)
  })

  it('AC-8505.2: setSecretTag는 지문 한 칸만 보내고, 모양이 틀리면 보내지 않는다', async () => {
    const { client, calls } = fakeClient()
    await setSecretTag(client, TAG)
    await setSecretTag(client, null)
    expect(calls).toEqual([
      ['from', 'gsheet_settings'],
      ['upsert', { secret_tag: TAG }, ON_HOSPITAL],
      ['from', 'gsheet_settings'],
      ['upsert', { secret_tag: null }, ON_HOSPITAL],
    ])
    const { client: other, calls: none } = fakeClient()
    for (const bad of ['0123456789ABCDEF', '0123', `${TAG}0`, 'FAKEkeyFAKEkeyFAKEkeyFAKEkey_-0123456789']) {
      expect((await caught(() => setSecretTag(other, bad))).kind).toBe('failed')
    }
    sentNothing(none)
  })
})

// ── 달 파일 (gsheet_months) ─────────────────────────────────

describe('AC-8505.2 달 파일 gsheet_months', () => {
  it('AC-8505.2: listGsheetMonths는 정해 둔 칸만 달 차례로 읽고 틀린 줄·틀린 gid는 뺀다', async () => {
    const rows = [
      { ym: '2026-10', file_id: FILE, gids: { '1': 0, '31': 1234567890 } },
      { ym: '2026-11', file_id: FILE, gids: { '1': 5, '32': 7, x: 1, '2': -1, '3': 1.5, '4': '9' } },
      { ym: '2026-13', file_id: FILE, gids: {} },
      { ym: '2026-12', file_id: 'short', gids: {} },
      { ym: '2027-01', file_id: FILE, gids: 'none' },
    ]
    const { client, calls } = fakeClient(okWith(rows))
    await expect(listGsheetMonths(client)).resolves.toEqual([
      { ym: '2026-10', fileId: FILE, gids: { '1': 0, '31': 1234567890 } },
      { ym: '2026-11', fileId: FILE, gids: { '1': 5 } },
      { ym: '2027-01', fileId: FILE, gids: {} },
    ])
    expect(calls).toEqual([['from', 'gsheet_months'], ['select', MONTH_COLUMNS], ['order', 'ym', ASC], ['range', 0, 999]])
  })

  it('AC-8505.2: upsertGsheetMonths는 달·파일 id·gid·본 때 네 칸만 (병원, 달) 겹침으로 넣는다', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(AT))
    const { client, calls } = fakeClient()
    await upsertGsheetMonths(client, [{ ym: '2026-11', fileId: FILE, gids: { '1': 0, '26': 99 }, extra: SECRET } as never])
    expect(calls).toEqual([
      ['from', 'gsheet_months'],
      ['upsert', [{ ym: '2026-11', file_id: FILE, gids: { '1': 0, '26': 99 }, seen_at: AT }], { onConflict: 'hospital_id,ym' }],
    ])
    const { client: other, calls: none } = fakeClient()
    await upsertGsheetMonths(other, [])
    sentNothing(none)
  })

  it.each([
    ['달 모양 틀림', { ym: '2026-1', fileId: FILE, gids: {} }],
    ['파일 id 틀림', { ym: '2026-11', fileId: 'a/b', gids: {} }],
    ['날짜 시트 이름 틀림', { ym: '2026-11', fileId: FILE, gids: { '0': 1 } }],
    ['gid 음수', { ym: '2026-11', fileId: FILE, gids: { '1': -1 } }],
    ['gid 목록', { ym: '2026-11', fileId: FILE, gids: [1] }],
  ])('AC-8505.2: upsertGsheetMonths — %s이면 하나도 보내지 않고 failed다', async (_name, month) => {
    const { client, calls } = fakeClient()
    expect((await caught(() => upsertGsheetMonths(client, [month as never]))).kind).toBe('failed')
    sentNothing(calls)
  })
})

// ── 넣은 기록 (gsheet_runs) ─────────────────────────────────

describe('AC-8505.2 넣은 기록 gsheet_runs', () => {
  it('AC-8505.2: addGsheetRun은 숫자·오류 번호·칸 주소 여덟 칸만 넣는다(시각·id·병원은 DB가 정한다)', async () => {
    const { client, calls } = fakeClient()
    await expect(addGsheetRun(client, RUN_INPUT)).resolves.toBeUndefined()
    await expect(addGsheetRun(client, { ...RUN_INPUT, outcome: 'fail', code: 'E-GSHEET-NET', rows: 0, counts: {}, cells: [] })).resolves.toBeUndefined()
    expect(calls).toEqual([
      ['from', 'gsheet_runs'],
      ['insert', RUN_INPUT],
      ['from', 'gsheet_runs'],
      ['insert', { ...RUN_INPUT, outcome: 'fail', code: 'E-GSHEET-NET', rows: 0, counts: {}, cells: [] }],
    ])
    expect(Object.keys(bodyOf(calls, 'insert') as object).sort()).toEqual(['cells', 'code', 'counts', 'day', 'mode', 'outcome', 'rows', 'via'])
  })

  it.each([
    ['다른 열쇠(이름 목록)', { ...RUN_INPUT, names: ['홍길동'] }],
    ['다른 열쇠(시각)', { ...RUN_INPUT, at: AT }],
    ['숫자 칸에 이름 목록', { ...RUN_INPUT, counts: { ...COUNTS, ratioSkipped: ['홍길동'] } }],
    ['숫자 칸에 글', { ...RUN_INPUT, counts: { ...COUNTS, note: '1234 홍길동' } }],
    ['숫자 칸에 묶음', { ...RUN_INPUT, counts: { ...COUNTS, notPut: { noName: 1 } } }],
    ['숫자 칸 열쇠에 글', { ...RUN_INPUT, counts: { '홍길동': 1 } }],
    ['숫자 칸이 무한', { ...RUN_INPUT, counts: { rows: Number.POSITIVE_INFINITY } }],
    ['칸 주소 모양 틀림', { ...RUN_INPUT, cells: ['26:C17'] }],
    ['칸 주소에 글', { ...RUN_INPUT, cells: ['26!홍길동'] }],
    ['칸 주소 21개', { ...RUN_INPUT, cells: many(21, (i) => `26!C${i + 17}`) }],
    ['오류 번호 모양 틀림', { ...RUN_INPUT, code: 'net error' }],
    ['날 틀림', { ...RUN_INPUT, day: '2026-11-31' }],
    ['넣은 길 모름', { ...RUN_INPUT, via: 'cron' }],
    ['넣는 방법 모름', { ...RUN_INPUT, mode: 'append' }],
    ['결과 모름', { ...RUN_INPUT, outcome: 'maybe' }],
    ['줄 수 음수', { ...RUN_INPUT, rows: -1 }],
    ['줄 수 소수', { ...RUN_INPUT, rows: 1.5 }],
    ['칸 하나 없음', { ...RUN_INPUT, cells: undefined }],
  ])('AC-8505.2: %s이면 보내지 않고 invalid다', async (_name, run) => {
    const { client, calls } = fakeClient()
    await expect(addGsheetRun(client, run as never)).resolves.toBe('invalid')
    sentNothing(calls)
  })

  it('AC-8505.2: listGsheetRuns는 정해 둔 칸만 그 시각부터 넣은 차례로 읽고 DB 시각 글자를 그대로 돌려준다', async () => {
    const { client, calls } = fakeClient(okWith([RUN_ROW, { ...RUN_ROW, counts: { rows: 'x' } }, { ...RUN_ROW, via: 'cron' }]))
    await expect(listGsheetRuns(client, AT)).resolves.toEqual([RUN])
    expect(calls).toEqual([
      ['from', 'gsheet_runs'],
      ['select', RUN_COLUMNS],
      ['gte', 'at', AT],
      ['order', 'at', ASC],
      ['order', 'id', ASC],
      ['range', 0, 999],
    ])
    const { client: other, calls: none } = fakeClient()
    expect((await caught(() => listGsheetRuns(other, 'today'))).kind).toBe('failed')
    sentNothing(none)
  })

  it('AC-8505.2: lastGsheetRun은 마지막 한 줄만 묻고, 없으면 null이다', async () => {
    const { client, calls } = fakeClient(okWith(RUN_ROW), okWith(null))
    await expect(lastGsheetRun(client)).resolves.toEqual(RUN)
    await expect(lastGsheetRun(client)).resolves.toBeNull()
    expect(calls.slice(0, 5)).toEqual([
      ['from', 'gsheet_runs'],
      ['select', RUN_COLUMNS],
      ['order', 'at', { ascending: false }],
      ['limit', 1],
      ['maybeSingle'],
    ])
  })
})

// ── 실패 ───────────────────────────────────────────────────

type Run = (client: Pick<SupabaseClient, 'from'>) => Promise<unknown>
const ALL: [string, Run][] = [
  ['loadGsheetSettings', (c) => loadGsheetSettings(c)],
  ['saveGsheetSettings', (c) => saveGsheetSettings(c, MINE)],
  ['setSecretTag', (c) => setSecretTag(c, TAG)],
  ['listGsheetMonths', (c) => listGsheetMonths(c)],
  ['upsertGsheetMonths', (c) => upsertGsheetMonths(c, [{ ym: '2026-11', fileId: FILE, gids: {} }])],
  ['addGsheetRun', (c) => addGsheetRun(c, RUN_INPUT)],
  ['listGsheetRuns', (c) => listGsheetRuns(c, AT)],
  ['lastGsheetRun', (c) => lastGsheetRun(c)],
]

describe.each(ALL)('%s 실패', (_name, run) => {
  it('AC-8505.2: 브라우저가 오프라인이면 부르지 않고 offline이다', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const { client, calls } = fakeClient()
    expect((await caught(() => run(client))).kind).toBe('offline')
    sentNothing(calls)
  })

  it('AC-8505.2: 응답 status가 0이면 offline이다(Supabase 글 없음)', async () => {
    expect((await caught(() => run(fakeClient(failure(0)).client))).kind).toBe('offline')
  })

  it.each([400, 401, 403, 409, 500])('AC-8505.2: 응답 status가 %i이면 failed이고 오류에는 종류만 있다', async (status) => {
    const error = await caught(() => run(fakeClient(failure(status)).client))
    expect(error.kind).toBe('failed')
    expect(error.name).toBe('GsheetStorageError')
  })

  it('AC-8505.2: 클라이언트가 던져도 failed이고 원문이 없다', async () => {
    expect((await caught(() => run(throwingClient))).kind).toBe('failed')
  })
})
