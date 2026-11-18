import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CAL_COLORS } from '@/types/calendar'
import { DEFAULT_HOURS, LOGO_MAX_BYTES, type ClinicProfile, type ClinicStaff, type DayHours } from '@/types/clinicProfile'
import {
  checkProfile,
  dayProblem,
  defaultProfile,
  downloadLogo,
  loadClinicProfile,
  loadSignup,
  normalizeLogo,
  removeLogo,
  saveClinicProfile,
  uploadLogo,
} from './clinicProfile'

// 병원 정보 읽기·저장·로고 (spec clinic-profile design.md 2절, TASK-2). 실제 Supabase에 붙지 않는다.
// 가짜 클라이언트가 표(clinic_profiles·hospitals)·함수(my_desk)·그림 저장소(clinic-logos)에 무엇이 어떤 차례로 나갔는지 적어 둔다.
// 표 권한·RLS·바구니 정책은 supabase/clinicProfile.rls.test.ts(TASK-1)가 진짜 Postgres로 본다. 이름·전화·id·그림 바이트는 모두 지어낸 값이다

const TABLE = 'clinic_profiles'
const BUCKET = 'clinic-logos'
const COLUMNS = ['display_name', 'phone', 'address', 'honorific', 'hours', 'closed_dates', 'staff', 'logo_path']
const BODY_KEYS = ['address', 'closed_dates', 'display_name', 'honorific', 'hours', 'phone', 'staff']
const SECRET = 'secret detail' // 서버 답에 섞여 온 글자. 밖으로 나가면 안 된다
const RAW_ERROR = { code: '42501', message: `permission denied (${SECRET})`, details: SECRET, hint: SECRET }

const HOSPITAL = '11111111-2222-4333-8444-555555555555'
const USER = '99999999-8888-4777-8666-555555555555'
const NEW_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const OLD_PATH = `${HOSPITAL}/ffffffff-0000-4111-8222-333333333333.png`
const NEW_PATH = `${HOSPITAL}/${NEW_ID}.png`
const TODAY = '2026-11-18'

// PNG 머리(89 50 4E 47 0D 0A 1A 0A)로 시작하는 가짜 그림 바이트
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52])
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46])
const pngBlob = (bytes: Uint8Array = PNG) => new Blob([bytes.slice()], { type: 'image/png' })

type TableCall = {
  kind: 'table'
  table: string
  op?: 'select' | 'insert' | 'update' | 'upsert' | 'delete'
  body?: unknown
  columns?: string[]
  options?: unknown
  filters: [string, unknown][]
  single: boolean
}
type StorageCall = { kind: 'storage'; bucket: string; op: 'upload' | 'download' | 'remove' | 'update'; path?: string; paths?: unknown; body?: unknown; options?: unknown }
type OtherCall = { kind: 'session' } | { kind: 'rpc'; fn: string; args?: unknown }
type Call = TableCall | StorageCall | OtherCall
type Reply = { data?: unknown; error?: unknown; status?: number } | 'throw'

const PROFILE_ROW = {
  display_name: '가짜정형외과의원',
  phone: '0212345678',
  address: '서울 가짜구 가짜로 1',
  honorific: '대표원장님',
  hours: DEFAULT_HOURS,
  closed_dates: ['2026-12-24', '2026-12-31'],
  staff: [
    { id: 'kim', name: '김가짜', role: 'doctor', mark: '김', color: 'blue', calendar: true },
    { id: 'lee', name: '이가짜', role: 'staff', mark: '이', color: 'teal', calendar: false },
  ],
  logo_path: OLD_PATH,
}

/** 별일 없을 때의 답 */
function okReply(call: Call): Reply {
  if (call.kind === 'session') return { data: { session: { user: { id: USER } } } }
  if (call.kind === 'rpc') return { data: [] }
  if (call.kind === 'table') {
    if (call.op === 'select' && call.table === TABLE) return { data: { hospital_id: HOSPITAL, logo_path: OLD_PATH } }
    if (call.op === 'select') return { data: null }
    return { data: null }
  }
  if (call.op === 'upload') return { data: { path: call.path } }
  if (call.op === 'download') return { data: pngBlob() }
  return { data: [] }
}

/** 표·함수·저장소 부름을 한 줄씩 적는 가짜 클라이언트. 답이 'throw'면 네트워크 예외처럼 거절된다 */
function fakeClient(reply: (call: Call) => Reply = okReply) {
  const calls: Call[] = []
  const answer = (call: Call) =>
    Promise.resolve().then(() => {
      const r = reply(call)
      if (r === 'throw') throw new Error(SECRET)
      return { data: r.data === undefined ? null : r.data, error: r.error ?? null, status: r.status ?? (r.error ? 400 : 200) }
    })
  const client = {
    from(table: string) {
      const call: TableCall = { kind: 'table', table, filters: [], single: false }
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
        upsert(body: unknown, options?: unknown) {
          call.op = 'upsert'
          call.body = body
          call.options = options
          return builder
        },
        delete() {
          call.op = 'delete'
          return builder
        },
        eq(column: string, value: unknown) {
          call.filters.push([column, value])
          return builder
        },
        maybeSingle() {
          call.single = true
          return answer(call)
        },
        single() {
          call.single = true
          return answer(call)
        },
        then(ok: (value: unknown) => unknown, no?: (reason: unknown) => unknown) {
          return answer(call).then(ok, no)
        },
      }
      return builder
    },
    rpc(fn: string, args?: unknown) {
      const call: OtherCall = { kind: 'rpc', fn, args }
      calls.push(call)
      return answer(call)
    },
    auth: {
      getSession() {
        const call: OtherCall = { kind: 'session' }
        calls.push(call)
        return answer(call)
      },
    },
    storage: {
      from(bucket: string) {
        return {
          upload(path: string, body: unknown, options?: unknown) {
            const call: StorageCall = { kind: 'storage', bucket, op: 'upload', path, body, options }
            calls.push(call)
            return answer(call)
          },
          update(path: string, body: unknown, options?: unknown) {
            const call: StorageCall = { kind: 'storage', bucket, op: 'update', path, body, options }
            calls.push(call)
            return answer(call)
          },
          download(path: string) {
            const call: StorageCall = { kind: 'storage', bucket, op: 'download', path }
            calls.push(call)
            return answer(call)
          },
          remove(paths: unknown) {
            const call: StorageCall = { kind: 'storage', bucket, op: 'remove', paths }
            calls.push(call)
            return answer(call)
          },
        }
      },
    },
  }
  return { client: client as unknown as SupabaseClient, calls }
}

const tableCalls = (calls: Call[]) => calls.filter((c): c is TableCall => c.kind === 'table')
const storageCalls = (calls: Call[]) => calls.filter((c): c is StorageCall => c.kind === 'storage')
const opsOf = (calls: Call[]) =>
  calls.map((c) => (c.kind === 'table' ? `${c.table}.${c.op}` : c.kind === 'storage' ? `${c.bucket}.${c.op}` : c.kind === 'rpc' ? `rpc.${c.fn}` : 'session'))

const day = (open: number, close: number, lunchFrom: number | null = null, lunchTo: number | null = null): DayHours => ({ open, close, lunchFrom, lunchTo })
const person = (over: Partial<ClinicStaff> = {}): ClinicStaff => ({ id: 'kim', name: '김가짜', role: 'doctor', mark: '김', color: 'blue', calendar: true, ...over })
const profile = (over: Partial<ClinicProfile> = {}): ClinicProfile => ({ ...defaultProfile(), ...over })
const hoursWith = (index: number, value: DayHours): DayHours[] => DEFAULT_HOURS.map((d, i) => (i === index ? value : d))

describe('AC-6602.2 저장한 적 없을 때의 기본값', () => {
  it('AC-6602.2: 이름·전화·주소 없음, 호칭 원장님, 월~금 09:00~18:00 점심 13:00~14:00 · 토 09:00~13:00 · 일 휴진, 휴진일·직원·로고 없음', () => {
    expect(defaultProfile()).toEqual({
      displayName: null,
      phone: null,
      address: null,
      honorific: '원장님',
      hours: [day(540, 1080, 780, 840), day(540, 1080, 780, 840), day(540, 1080, 780, 840), day(540, 1080, 780, 840), day(540, 1080, 780, 840), day(540, 780), null],
      closedDates: [],
      staff: [],
      logoPath: null,
    })
    expect(checkProfile(defaultProfile())).toEqual([])
  })

  it('AC-6602.2: 부를 때마다 새 값이라 고쳐도 기본값이 바뀌지 않는다', () => {
    const first = defaultProfile()
    first.hours[0] = null
    first.staff.push(person())
    expect(defaultProfile().hours[0]).toEqual(day(540, 1080, 780, 840))
    expect(defaultProfile().staff).toEqual([])
    expect(DEFAULT_HOURS[0]).toEqual(day(540, 1080, 780, 840))
  })
})

describe('AC-6601.3·AC-6602.3·AC-6602.5 병원 정보 검사(checkProfile)', () => {
  it('AC-6601.3: 이름은 앞뒤 빈칸을 뺀 1~50자(비우면 가입 이름을 쓰는 없음), 전화는 숫자 9~11자(- 와 빈칸은 뺀다), 주소 100자, 호칭은 셋 중 하나', () => {
    expect(checkProfile(profile({ displayName: '가'.repeat(50), phone: '02-123-4567', address: '가'.repeat(100) }))).toEqual([])
    expect(checkProfile(profile({ displayName: '   ', phone: ' ', address: '' }))).toEqual([])
    expect(checkProfile(profile({ displayName: '가'.repeat(51) })).join()).toContain('이름')
    expect(checkProfile(profile({ phone: '02-12' })).join()).toContain('전화')
    expect(checkProfile(profile({ phone: '02-1234-5678-90' })).join()).toContain('전화')
    expect(checkProfile(profile({ address: '가'.repeat(101) })).join()).toContain('주소')
    expect(checkProfile(profile({ honorific: '사장님' as never })).join()).toContain('호칭')
  })

  it('AC-6602.3: 요일마다 시작 < 끝, 10분 단위, 점심은 둘 다 고르거나 비우고 시작~끝 안이어야 한다. 휴진(null)은 통과', () => {
    expect(dayProblem(null)).toBeNull()
    expect(dayProblem(day(540, 1080, 780, 840))).toBeNull()
    expect(dayProblem(day(0, 1440))).toBeNull()
    expect(dayProblem(day(540, 1080, 540, 1080))).toBeNull()
    for (const wrong of [day(600, 600), day(700, 600), day(545, 1080), day(540, 1450), day(-10, 600), day(540, 1080, 780, null), day(540, 1080, null, 840), day(540, 1080, 840, 780), day(540, 1080, 500, 600), day(540, 1080, 1000, 1100)]) {
      expect(dayProblem(wrong), JSON.stringify(wrong)).not.toBeNull()
    }
  })

  it('AC-6602.3: 틀린 요일은 요일 이름과 함께 까닭이 나오고, 진료시간은 일곱 칸이어야 한다', () => {
    const problems = checkProfile(profile({ hours: hoursWith(1, day(700, 600)) }))
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('화요일')
    expect(problems[0]).toContain(dayProblem(day(700, 600)) as string)
    expect(checkProfile(profile({ hours: DEFAULT_HOURS.slice(0, 6) })).join()).toContain('진료시간')
  })

  it('AC-6602.4: 휴진일은 날짜 모양이고 같은 날은 한 번만, 200개까지다', () => {
    const many = Array.from({ length: 200 }, (_, i) => `2027-${String(Math.floor(i / 28) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`)
    expect(checkProfile(profile({ closedDates: many }))).toEqual([])
    expect(checkProfile(profile({ closedDates: [...many, '2027-12-01'] })).join()).toContain('200')
    expect(checkProfile(profile({ closedDates: ['2026-12-24', '2026-12-24'] })).join()).toContain('휴진일')
    expect(checkProfile(profile({ closedDates: ['2026-02-30'] })).join()).toContain('휴진일')
  })

  it('AC-6602.5: 사람은 30명까지, id 1~40자 겹침 없음, 이름 1~10자, 원장님/직원, 예약 표시 한 글자 겹침 없음, 예약 20색, 예약에 보이기는 참거짓', () => {
    const thirty = Array.from({ length: 30 }, (_, i) => person({ id: `p${i}`, name: `가짜${i}`, mark: String.fromCodePoint(0xac00 + i), color: CAL_COLORS[i % 20] }))
    expect(checkProfile(profile({ staff: thirty }))).toEqual([])
    expect(checkProfile(profile({ staff: [...thirty, person({ id: 'x', mark: '끝' })] })).join()).toContain('30')
    const wrongs: Partial<ClinicStaff>[] = [
      { id: '' },
      { id: 'a'.repeat(41) },
      { name: '' },
      { name: '가'.repeat(11) },
      { role: 'boss' as never },
      { mark: '' },
      { mark: '김가' },
      { color: 'gold' as never },
      { calendar: 'yes' as never },
    ]
    for (const over of wrongs) expect(checkProfile(profile({ staff: [person(over)] })), JSON.stringify(over)).not.toEqual([])
    expect(checkProfile(profile({ staff: [person(), person({ mark: '이' })] })), 'id 겹침').not.toEqual([])
    expect(checkProfile(profile({ staff: [person(), person({ id: 'lee', name: '김둘' })] })).join(), '표시 겹침').toContain('겹쳐')
    expect(checkProfile(profile({ staff: [person({ name: ' 김가짜 ', mark: ' 김 ' })] })), '앞뒤 빈칸은 뺀 값으로 본다').toEqual([])
  })
})

describe('AC-6602.7 병원 정보 읽기(loadClinicProfile)', () => {
  it('AC-6602.7: 내 병원 줄 하나를 정해 둔 여덟 칸으로 읽어 앱 모양으로 바꾼다', async () => {
    const { client, calls } = fakeClient((call) => (call.kind === 'table' ? { data: PROFILE_ROW } : okReply(call)))
    expect(await loadClinicProfile(client)).toEqual({
      displayName: '가짜정형외과의원',
      phone: '0212345678',
      address: '서울 가짜구 가짜로 1',
      honorific: '대표원장님',
      hours: [...DEFAULT_HOURS],
      closedDates: ['2026-12-24', '2026-12-31'],
      staff: PROFILE_ROW.staff,
      logoPath: OLD_PATH,
    })
    const [call] = tableCalls(calls)
    expect(calls).toHaveLength(1)
    expect(call).toMatchObject({ table: TABLE, op: 'select', single: true, filters: [] })
    expect(call.columns).toEqual(COLUMNS)
  })

  it('AC-6602.2: 줄이 없으면 null이다(부르는 쪽이 기본값과 가입 이름을 쓴다)', async () => {
    expect(await loadClinicProfile(fakeClient((call) => (call.kind === 'table' ? { data: null } : okReply(call))).client)).toBeNull()
  })

  it('AC-6602.7: 칸 모양이 틀리면 그 칸만 기본값이다(진료시간은 일곱 칸 함께, 휴진일은 차례로 맞춘다)', async () => {
    const row = {
      display_name: '  ',
      phone: '02-123-4567',
      address: 7,
      honorific: '사장님',
      hours: hoursWith(2, day(700, 600)),
      closed_dates: ['2026-12-31', '2026-12-24'],
      staff: [{ ...PROFILE_ROW.staff[0], color: 'gold' }],
      logo_path: '../other/logo.png',
    }
    expect(await loadClinicProfile(fakeClient((call) => (call.kind === 'table' ? { data: row } : okReply(call))).client)).toEqual({
      ...defaultProfile(),
      closedDates: ['2026-12-24', '2026-12-31'],
    })
    const extra = { ...PROFILE_ROW, staff: [{ ...PROFILE_ROW.staff[0], phone: '01012345678' }], closed_dates: ['2026-12-24', 'x'] }
    const read = await loadClinicProfile(fakeClient((call) => (call.kind === 'table' ? { data: extra } : okReply(call))).client)
    expect(read !== null && read !== 'failed' && read.staff).toEqual([PROFILE_ROW.staff[0]]) // 정해 둔 여섯 열쇠만
    expect(read !== null && read !== 'failed' && read.closedDates).toEqual([])
  })

  it.each([
    ['DB가 오류로 답함', { error: RAW_ERROR }],
    ['연결 끊김(status 0)', { error: RAW_ERROR, status: 0 }],
    ['네트워크 예외', 'throw'],
  ] as const)('AC-6602.7: 읽기 실패(%s)는 failed 하나이고 서버 글을 담지 않는다', async (_name, answer) => {
    const result = await loadClinicProfile(fakeClient((call) => (call.kind === 'table' ? answer : okReply(call))).client)
    expect(result).toBe('failed')
  })
})

describe('AC-6602.4·AC-6602.7 병원 정보 저장(saveClinicProfile)', () => {
  const full = profile({
    displayName: '  가짜정형외과의원 ',
    phone: '02-1234-5678',
    address: ' 서울 가짜구 ',
    honorific: '선생님',
    closedDates: ['2026-12-31', '2025-11-17', '2025-11-18', '2026-01-01'],
    staff: [person({ name: ' 김가짜 ', mark: ' 김 ' }), person({ id: 'lee', name: '이가짜', role: 'staff', mark: '이', color: 'teal', calendar: false })],
    logoPath: OLD_PATH,
  })

  it('AC-6602.4: 오늘보다 1년 넘게 지난 휴진일을 빼고 앞날부터 차례로 저장한다(딱 1년 전 날은 남긴다)', async () => {
    const { client, calls } = fakeClient()
    const saved = await saveClinicProfile(client, full, TODAY)
    const [call] = tableCalls(calls)
    expect((call.body as Record<string, unknown>).closed_dates).toEqual(['2025-11-18', '2026-01-01', '2026-12-31'])
    expect(saved !== 'invalid' && saved !== 'failed' && saved.closedDates).toEqual(['2025-11-18', '2026-01-01', '2026-12-31'])
  })

  it('AC-6602.7: 정해 둔 일곱 칸만 upsert한다 — hospital_id·logo_path·updated_at은 보내지 않는다(로고는 uploadLogo가)', async () => {
    const { client, calls } = fakeClient()
    await saveClinicProfile(client, full, TODAY)
    expect(calls).toHaveLength(1)
    const [call] = tableCalls(calls)
    expect(call).toMatchObject({ table: TABLE, op: 'upsert', options: { onConflict: 'hospital_id' } })
    expect(Object.keys(call.body as object).sort()).toEqual(BODY_KEYS)
    expect(call.body).toEqual({
      display_name: '가짜정형외과의원',
      phone: '0212345678',
      address: '서울 가짜구',
      honorific: '선생님',
      hours: [...DEFAULT_HOURS],
      closed_dates: ['2025-11-18', '2026-01-01', '2026-12-31'],
      staff: [
        { id: 'kim', name: '김가짜', role: 'doctor', mark: '김', color: 'blue', calendar: true },
        { id: 'lee', name: '이가짜', role: 'staff', mark: '이', color: 'teal', calendar: false },
      ],
    })
    expect(JSON.stringify(call.body)).not.toContain(HOSPITAL)
  })

  it('AC-6602.2: 빈 이름·전화·주소는 null로 보낸다(이름 없음 = 가입 이름)', async () => {
    const { client, calls } = fakeClient()
    await saveClinicProfile(client, profile({ displayName: ' ', phone: '', address: '  ' }), TODAY)
    expect(tableCalls(calls)[0].body).toMatchObject({ display_name: null, phone: null, address: null })
  })

  it('AC-6602.5: 받은 사람 줄에 다른 열쇠가 섞여 와도 여섯 칸만 보낸다', async () => {
    const { client, calls } = fakeClient()
    const sneaky = { ...person(), phone: '01012345678' } as ClinicStaff
    const sneakyDay = { ...day(540, 1080, 780, 840), note: '가짜' } as DayHours
    await saveClinicProfile(client, profile({ staff: [sneaky], hours: [sneakyDay, ...DEFAULT_HOURS.slice(1)] }), TODAY)
    const body = tableCalls(calls)[0].body as { staff: object[]; hours: (object | null)[] }
    expect(Object.keys(body.staff[0]).sort()).toEqual(['calendar', 'color', 'id', 'mark', 'name', 'role'])
    for (const d of body.hours) if (d !== null) expect(Object.keys(d).sort()).toEqual(['close', 'lunchFrom', 'lunchTo', 'open'])
  })

  it('AC-6602.3: 검사를 못 넘으면 보내지 않고 invalid다', async () => {
    const { client, calls } = fakeClient()
    expect(await saveClinicProfile(client, profile({ hours: hoursWith(0, day(700, 600)) }), TODAY)).toBe('invalid')
    expect(calls).toEqual([])
  })

  it.each([
    ['DB가 오류로 답함', { error: RAW_ERROR }],
    ['네트워크 예외', 'throw'],
  ] as const)('AC-6602.7: 저장 실패(%s)는 failed이고 받은 값을 고치지 않는다(적은 값이 화면에 그대로 남는다)', async (_name, answer) => {
    const copy = structuredClone(full)
    expect(await saveClinicProfile(fakeClient(() => answer).client, full, TODAY)).toBe('failed')
    expect(full).toEqual(copy)
  })

  it('AC-6602.7: 성공하면 보낸 값(앞뒤 빈칸·전화 기호를 뺌)을 돌려주고 받은 로고 이름은 그대로 둔다', async () => {
    const saved = await saveClinicProfile(fakeClient().client, full, TODAY)
    expect(saved).toMatchObject({ displayName: '가짜정형외과의원', phone: '0212345678', address: '서울 가짜구', logoPath: OLD_PATH })
  })
})

describe('AC-6602.6·AC-6602.7 로고 올리기(uploadLogo)', () => {
  beforeEach(() => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(NEW_ID)
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('AC-6602.6: 내 줄을 읽고 → 새 이름 {병원 id}/{uuid}.png를 logo_path에 먼저 적고 → 올리고 → 옛 파일을 지운다', async () => {
    const { client, calls } = fakeClient()
    const png = pngBlob()
    expect(await uploadLogo(client, png)).toBe(NEW_PATH)
    expect(opsOf(calls)).toEqual([`${TABLE}.select`, `${TABLE}.update`, `${BUCKET}.upload`, `${BUCKET}.remove`])
    const [read, write] = tableCalls(calls)
    expect(read.columns).toEqual(['hospital_id', 'logo_path'])
    expect(read.single).toBe(true)
    expect(write.body).toEqual({ logo_path: NEW_PATH })
    expect(write.filters).toEqual([['hospital_id', HOSPITAL]])
    const [upload, remove] = storageCalls(calls)
    expect(upload).toMatchObject({ path: NEW_PATH, body: png, options: { contentType: 'image/png', upsert: false } })
    expect(remove.paths).toEqual([OLD_PATH])
  })

  it('AC-6602.6: 옛 로고가 없으면 지우지 않는다. 옛 파일 지우기가 실패해도 새 이름을 돌려준다', async () => {
    const none = fakeClient((call) => (call.kind === 'table' && call.op === 'select' ? { data: { hospital_id: HOSPITAL, logo_path: null } } : okReply(call)))
    expect(await uploadLogo(none.client, pngBlob())).toBe(NEW_PATH)
    expect(opsOf(none.calls)).toEqual([`${TABLE}.select`, `${TABLE}.update`, `${BUCKET}.upload`])
    const removeFails = fakeClient((call) => (call.kind === 'storage' && call.op === 'remove' ? { error: RAW_ERROR } : okReply(call)))
    expect(await uploadLogo(removeFails.client, pngBlob())).toBe(NEW_PATH)
    const removeThrows = fakeClient((call) => (call.kind === 'storage' && call.op === 'remove' ? 'throw' : okReply(call)))
    expect(await uploadLogo(removeThrows.client, pngBlob())).toBe(NEW_PATH)
  })

  it.each([
    ['오류로 답함', { error: RAW_ERROR }],
    ['네트워크 예외', 'throw'],
  ] as const)('AC-6602.7: 올리기가 실패(%s)하면 logo_path를 옛 값으로 되돌리고 failed다. 옛 파일은 지우지 않는다', async (_name, answer) => {
    const { client, calls } = fakeClient((call) => (call.kind === 'storage' && call.op === 'upload' ? answer : okReply(call)))
    expect(await uploadLogo(client, pngBlob())).toBe('failed')
    expect(opsOf(calls)).toEqual([`${TABLE}.select`, `${TABLE}.update`, `${BUCKET}.upload`, `${TABLE}.update`])
    const back = tableCalls(calls)[2]
    expect(back.body).toEqual({ logo_path: OLD_PATH })
    expect(back.filters).toEqual([['hospital_id', HOSPITAL]])
  })

  it('AC-6602.7: logo_path 적기가 실패하면 올리지 않고 failed다. 내 줄이 없거나 읽기가 실패해도 failed(줄을 먼저 저장해야 한다)', async () => {
    const writeFails = fakeClient((call) => (call.kind === 'table' && call.op === 'update' ? { error: RAW_ERROR } : okReply(call)))
    expect(await uploadLogo(writeFails.client, pngBlob())).toBe('failed')
    expect(opsOf(writeFails.calls)).toEqual([`${TABLE}.select`, `${TABLE}.update`])
    const noRow = fakeClient((call) => (call.kind === 'table' ? { data: null } : okReply(call)))
    expect(await uploadLogo(noRow.client, pngBlob())).toBe('failed')
    expect(opsOf(noRow.calls)).toEqual([`${TABLE}.select`])
    const readFails = fakeClient(() => 'throw')
    expect(await uploadLogo(readFails.client, pngBlob())).toBe('failed')
  })

  it('AC-6602.6: PNG가 아니거나 1,000,000바이트를 넘으면 아무것도 보내지 않고 failed다', async () => {
    const { client, calls } = fakeClient()
    expect(await uploadLogo(client, new Blob([JPEG], { type: 'image/jpeg' }))).toBe('failed')
    expect(await uploadLogo(client, new Blob([JPEG], { type: 'image/png' }))).toBe('failed')
    const big = new Uint8Array(LOGO_MAX_BYTES + 1)
    big.set(PNG)
    expect(await uploadLogo(client, pngBlob(big))).toBe('failed')
    expect(calls).toEqual([])
  })
})

describe('AC-6602.6 로고 빼기(removeLogo)', () => {
  it('AC-6602.6: logo_path를 비우고 옛 파일을 지운다(지우기 실패는 무시)', async () => {
    const { client, calls } = fakeClient()
    expect(await removeLogo(client)).toBe('ok')
    expect(opsOf(calls)).toEqual([`${TABLE}.select`, `${TABLE}.update`, `${BUCKET}.remove`])
    expect(tableCalls(calls)[1]).toMatchObject({ body: { logo_path: null }, filters: [['hospital_id', HOSPITAL]] })
    expect(storageCalls(calls)[0].paths).toEqual([OLD_PATH])
    const removeFails = fakeClient((call) => (call.kind === 'storage' ? { error: RAW_ERROR } : okReply(call)))
    expect(await removeLogo(removeFails.client)).toBe('ok')
  })

  it('AC-6602.6: 로고가 없거나 줄이 없으면 쓰지 않고 ok, 비우기가 실패하면 failed다', async () => {
    const none = fakeClient((call) => (call.kind === 'table' ? { data: { hospital_id: HOSPITAL, logo_path: null } } : okReply(call)))
    expect(await removeLogo(none.client)).toBe('ok')
    expect(opsOf(none.calls)).toEqual([`${TABLE}.select`])
    const noRow = fakeClient((call) => (call.kind === 'table' ? { data: null } : okReply(call)))
    expect(await removeLogo(noRow.client)).toBe('ok')
    const fails = fakeClient((call) => (call.kind === 'table' && call.op === 'update' ? { error: RAW_ERROR } : okReply(call)))
    expect(await removeLogo(fails.client)).toBe('failed')
    expect(opsOf(fails.calls)).toEqual([`${TABLE}.select`, `${TABLE}.update`])
  })
})

describe('AC-6604.3 로고 받기(downloadLogo)', () => {
  it('AC-6604.3: 비공개 바구니에서 받아 PNG 머리를 확인하고 data:image/png;base64 글로 준다(밖 주소를 쓰지 않는다)', async () => {
    const { client, calls } = fakeClient()
    const url = await downloadLogo(client, OLD_PATH)
    expect(url).toBe(`data:image/png;base64,${Buffer.from(PNG).toString('base64')}`)
    expect(storageCalls(calls)).toEqual([{ kind: 'storage', bucket: BUCKET, op: 'download', path: OLD_PATH }])
  })

  it('AC-6604.2: PNG가 아니거나 받기가 실패하면 null이다(이름 글자로 그린다)', async () => {
    const jpeg = fakeClient((call) => (call.kind === 'storage' ? { data: new Blob([JPEG], { type: 'image/png' }) } : okReply(call)))
    expect(await downloadLogo(jpeg.client, OLD_PATH)).toBeNull()
    expect(await downloadLogo(fakeClient(() => ({ error: RAW_ERROR })).client, OLD_PATH)).toBeNull()
    expect(await downloadLogo(fakeClient(() => 'throw').client, OLD_PATH)).toBeNull()
    expect(await downloadLogo(fakeClient(() => ({ data: 'not a blob' })).client, OLD_PATH)).toBeNull()
  })

  it('AC-6604.3: 이름이 {병원 id}/{uuid}.png 모양이 아니면 받지 않는다', async () => {
    const { client, calls } = fakeClient()
    for (const path of ['', '../x.png', `${HOSPITAL}/a.png`, `${HOSPITAL}/${NEW_ID}.jpg`, `x/${HOSPITAL}/${NEW_ID}.png`]) expect(await downloadLogo(client, path), path).toBeNull()
    expect(calls).toEqual([])
  })
})

describe('AC-6602.6 로고 줄이기(normalizeLogo)', () => {
  type FakeCanvas = { width: number; height: number; drawn: unknown[][]; type?: string; getContext(kind: string): unknown; toBlob(done: (blob: Blob | null) => void, type?: string): void }
  let canvas: FakeCanvas
  let outSize: number
  let bitmap: { width: number; height: number; close: ReturnType<typeof vi.fn> }
  const decode = vi.fn()

  beforeEach(() => {
    outSize = 1000
    bitmap = { width: 2400, height: 600, close: vi.fn() }
    decode.mockReset()
    decode.mockImplementation(async () => bitmap)
    canvas = {
      width: 0,
      height: 0,
      drawn: [],
      getContext(kind: string) {
        return kind === '2d' ? { drawImage: (...args: unknown[]) => canvas.drawn.push(args) } : null
      },
      toBlob(done, type) {
        canvas.type = type
        done(new Blob([new Uint8Array(outSize)], { type: 'image/png' }))
      },
    }
    vi.stubGlobal('createImageBitmap', decode)
    vi.stubGlobal('document', { createElement: (tag: string) => (tag === 'canvas' ? canvas : null) })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('AC-6602.6: 긴 변을 1,200px 안으로 줄여 PNG로 다시 만든다', async () => {
    const file = new Blob([JPEG], { type: 'image/jpeg' })
    const out = await normalizeLogo(file)
    expect(out).toBeInstanceOf(Blob)
    expect(decode).toHaveBeenCalledWith(file)
    expect([canvas.width, canvas.height]).toEqual([1200, 300])
    expect(canvas.drawn).toEqual([[bitmap, 0, 0, 1200, 300]])
    expect(canvas.type).toBe('image/png')
    expect(bitmap.close).toHaveBeenCalled()
  })

  it('AC-6602.6: 작은 그림은 키우지 않는다. PNG·JPEG·WEBP를 받는다', async () => {
    bitmap = { width: 300, height: 200, close: vi.fn() }
    for (const type of ['image/png', 'image/jpeg', 'image/webp']) expect(await normalizeLogo(new Blob([PNG], { type })), type).toBeInstanceOf(Blob)
    expect([canvas.width, canvas.height]).toEqual([300, 200])
  })

  it('AC-6602.6: 다시 만든 PNG가 1,000,000바이트를 넘으면 too-big', async () => {
    outSize = LOGO_MAX_BYTES + 1
    expect(await normalizeLogo(new Blob([PNG], { type: 'image/png' }))).toBe('too-big')
    outSize = LOGO_MAX_BYTES
    expect(await normalizeLogo(new Blob([PNG], { type: 'image/png' }))).toBeInstanceOf(Blob)
  })

  it('AC-6602.6: 읽지 못하면 unreadable — 다른 형식(GIF·SVG)은 열어 보지도 않는다', async () => {
    expect(await normalizeLogo(new Blob([PNG], { type: 'image/gif' }))).toBe('unreadable')
    expect(await normalizeLogo(new Blob(['<svg/>'], { type: 'image/svg+xml' }))).toBe('unreadable')
    expect(decode).not.toHaveBeenCalled()
    decode.mockRejectedValueOnce(new Error('broken'))
    expect(await normalizeLogo(new Blob([PNG], { type: 'image/png' }))).toBe('unreadable')
    canvas.toBlob = (done) => done(null)
    expect(await normalizeLogo(new Blob([PNG], { type: 'image/png' }))).toBe('unreadable')
  })
})

describe('AC-6602.2 가입 이름·전화(loadSignup)', () => {
  it('AC-6602.2: 원장은 내 세션의 사용자 id로 내 병원 가입 줄의 이름·전화만 읽는다', async () => {
    const { client, calls } = fakeClient((call) =>
      call.kind === 'table' ? { data: { name: '가짜의원(가입)', phone: '01012345678' } } : okReply(call),
    )
    expect(await loadSignup(client)).toEqual({ name: '가짜의원(가입)', phone: '01012345678' })
    expect(opsOf(calls)).toEqual(['session', 'hospitals.select'])
    const [call] = tableCalls(calls)
    expect(call).toMatchObject({ columns: ['name', 'phone'], filters: [['owner_id', USER]], single: true })
  })

  it('AC-6602.2: 내 병원 줄이 없으면(데스크) my_desk()의 이름이고 전화는 없다', async () => {
    const { client, calls } = fakeClient((call) =>
      call.kind === 'rpc' ? { data: [{ hospital_id: HOSPITAL, hospital_name: '가짜의원' }] } : okReply(call),
    )
    expect(await loadSignup(client)).toEqual({ name: '가짜의원', phone: null })
    expect(opsOf(calls)).toEqual(['session', 'hospitals.select', 'rpc.my_desk'])
  })

  it('AC-6602.2: 전화가 숫자 9~11자 모양이 아니면 전화만 없다. 읽기가 실패하거나 아무 줄도 없으면 null', async () => {
    const odd = fakeClient((call) => (call.kind === 'table' ? { data: { name: '가짜의원', phone: '02-12' } } : okReply(call)))
    expect(await loadSignup(odd.client)).toEqual({ name: '가짜의원', phone: null })
    expect(await loadSignup(fakeClient().client)).toBeNull()
    expect(await loadSignup(fakeClient((call) => (call.kind === 'table' ? { error: RAW_ERROR } : okReply(call))).client)).toBeNull()
    expect(await loadSignup(fakeClient(() => 'throw').client)).toBeNull()
    expect(await loadSignup(fakeClient((call) => (call.kind === 'rpc' ? { error: RAW_ERROR } : okReply(call))).client)).toBeNull()
  })
})
