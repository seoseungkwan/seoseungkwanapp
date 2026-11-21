import { describe, expect, it } from 'vitest'
import { DEFAULT_PAY_ITEMS, type DayShift, type Leave, type PayLine, type StaffErrorCode, type StaffMember, type WeekPlan } from '@/types/staff'
import { createStaffStore, defaultStaffSettings, StaffStoreError, type LeaveDraft, type RosterImportRow, type StaffClient } from './staff'

// 직원 저장 층(spec staff REQ-7610 AC-7610.1·AC-7610.2·AC-7610.4·AC-7610.5, design.md 5절). 실제 Supabase에 붙지 않는다.
// 사람·전화·계좌·id는 모두 지어낸 것이다

const H = '11111111-1111-4111-8111-111111111111'
const M1 = '00000000-0000-4000-8000-0000000000a1'
const M2 = '00000000-0000-4000-8000-0000000000a2'
const N1 = '00000000-0000-4000-8000-0000000000b1'
const N2 = '00000000-0000-4000-8000-0000000000b2'
const R1 = '00000000-0000-4000-8000-0000000000c1'
const R2 = '00000000-0000-4000-8000-0000000000c2'
const R3 = '00000000-0000-4000-8000-0000000000c3'
const L1 = '00000000-0000-4000-8000-0000000000d1'
const L2 = '00000000-0000-4000-8000-0000000000d2'
const L0 = '00000000-0000-4000-8000-0000000000d0'
const G1 = '00000000-0000-4000-8000-0000000000e1'
const TODAY = '2026-11-21'
const SECRET = 'secret detail'
const RRN = '900101-1234567'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const ASC = { ascending: true }

// 읽는 칸·보내는 칸(design.md 1절 권한 표 그대로). hospital_id·주민번호 칸은 어디에도 없다
const MEMBER_COLUMNS =
  'id,name,job,job_other,employment,weekly_hours,hired_on,left_on,phone,birthday,address,bank,account_no,calendar_staff_id,memo,used_before,used_before_from'
const MEMBER_KEYS = [
  'name',
  'job',
  'job_other',
  'employment',
  'weekly_hours',
  'hired_on',
  'left_on',
  'phone',
  'birthday',
  'address',
  'bank',
  'account_no',
  'calendar_staff_id',
  'memo',
  'used_before',
  'used_before_from',
]
const PLAN_COLUMNS = 'id,staff_id,from_day,week,sat_rotation'
const CHANGE_COLUMNS = 'staff_id,day,start_min,end_min,lunch_from,lunch_to,memo'
const OVERTIME_COLUMNS = 'staff_id,day,kind,minutes'
const LEAVE_COLUMNS = 'id,group_id,staff_id,day,kind,part,paid,memo'
const SETTINGS_COLUMNS = 'leave_basis,leftover,pay_items'
const RULE_COLUMNS = 'id,staff_id,name,method,unit_amount,percent,sort'
const LINE_COLUMNS = 'id,month,staff_id,amounts,incentives,adjust,adjust_reason,adjust_memo'
const MONTH_COLUMNS = 'month,employer_cost,cost_saved_on,copied_on'
const NEVER = ['hospital_id', 'rrn', 'resident_no', 'jumin', 'id', 'created_at', 'updated_at']

const MEMBER: StaffMember = {
  id: M1,
  name: '김하늘',
  job: '간호사',
  jobOther: null,
  employment: 'regular',
  weeklyHours: 40,
  hiredOn: '2021-03-02',
  leftOn: null,
  phone: '01012345678',
  birthday: '1995-04-10',
  address: '서울시 가짜구 가짜로 1',
  bank: '가짜은행',
  accountNo: '123-456-7890',
  calendarStaffId: 'st-ga',
  memo: null,
  usedBefore: 0,
  usedBeforeFrom: null,
}
const MEMBER_ROW = {
  id: M1,
  name: '김하늘',
  job: '간호사',
  job_other: null,
  employment: 'regular',
  weekly_hours: 40,
  hired_on: '2021-03-02',
  left_on: null,
  phone: '01012345678',
  birthday: '1995-04-10',
  address: '서울시 가짜구 가짜로 1',
  bank: '가짜은행',
  account_no: '123-456-7890',
  calendar_staff_id: 'st-ga',
  memo: null,
  used_before: 0,
  used_before_from: null,
}
const MEMBER_BODY = Object.fromEntries(Object.entries(MEMBER_ROW).filter(([key]) => key !== 'id'))

const DAY: DayShift = { start: 540, end: 1080, lunchFrom: 780, lunchTo: 840 }
const SAT: DayShift = { start: 540, end: 780, lunchFrom: null, lunchTo: null }
const WEEK: DayShift[] = [DAY, DAY, DAY, DAY, DAY, SAT, null]
const PLAN_ROW = { id: N1, staff_id: M1, from_day: '2021-03-02', week: WEEK, sat_rotation: '1-3' }
const PLAN: WeekPlan = { id: N1, staffId: M1, from: '2021-03-02', week: WEEK, sat: '1-3' }

const LEAVE_ROW = { id: L1, group_id: G1, staff_id: M1, day: '2026-11-13', kind: 'half', part: 'pm', paid: true, memo: null }
const LEAVE: Leave = { id: L1, groupId: G1, staffId: M1, day: '2026-11-13', kind: 'half', part: 'pm', paid: true, memo: null }

type Reply = { data: unknown; error: unknown; status: number }
const OK: Reply = { data: null, error: null, status: 200 }
const okWith = (data: unknown): Reply => ({ ...OK, data })
const failure = (status = 400, code = SECRET): Reply => ({ data: null, error: { message: SECRET, details: SECRET, hint: SECRET, code }, status })

type Call = [string, ...unknown[]]
const CHAIN = ['select', 'eq', 'neq', 'gte', 'lte', 'in', 'order', 'range', 'limit', 'insert', 'update', 'upsert', 'delete', 'maybeSingle', 'single']

// 받은 부름을 차례로 적는 가짜 클라이언트. 기다릴 때마다(바구니는 부를 때마다) 정해 둔 답을 차례로 하나씩 준다(마지막 답은 되풀이).
// 동시에 기다리는 수(pending)의 가장 큰 값도 센다
function fakeClient(...replies: Reply[]) {
  const calls: Call[] = []
  const queue = replies.length > 0 ? [...replies] : [OK]
  const next = () => (queue.length > 1 ? queue.shift() : queue[0]) as Reply
  let pending = 0
  let most = 0
  const builder = () => {
    const query: Record<string, unknown> = {}
    for (const name of CHAIN) {
      query[name] = (...args: unknown[]) => {
        calls.push([name, ...args])
        return query
      }
    }
    query.then = (resolve: (value: Reply) => unknown, reject: (reason: unknown) => unknown) => {
      const reply = next()
      pending += 1
      most = Math.max(most, pending)
      return Promise.resolve()
        .then(() => {
          pending -= 1
          return reply
        })
        .then(resolve, reject)
    }
    return query
  }
  const bucket = {
    remove: (...args: unknown[]) => {
      calls.push(['remove', ...args])
      return Promise.resolve(next())
    },
  }
  const client = {
    from(table: string) {
      calls.push(['from', table])
      return builder()
    },
    storage: {
      from(name: string) {
        calls.push(['bucket', name])
        return bucket
      },
    },
  } as unknown as StaffClient
  return { client, calls, most: () => most }
}

const throwingClient = {
  from() {
    throw new Error(SECRET)
  },
  storage: {
    from() {
      throw new Error(SECRET)
    },
  },
} as unknown as StaffClient

async function caught(run: () => Promise<unknown>, code: StaffErrorCode): Promise<void> {
  const thrown: unknown = await run().then(
    () => {
      throw new Error('오류가 나야 한다')
    },
    (error: unknown) => error,
  )
  expect(thrown).toBeInstanceOf(StaffStoreError)
  const error = thrown as StaffStoreError
  expect(error.code).toBe(code)
  expect(error.message).toBe(code)
  expect(String(error)).not.toContain(SECRET)
  expect(error.stack ?? '').not.toContain(SECRET)
  expect(JSON.stringify(error)).not.toContain(SECRET)
  expect(error.cause).toBeUndefined()
}

const many = <T>(n: number, make: (i: number) => T) => Array.from({ length: n }, (_, i) => make(i))
const named = (calls: Call[], name: string) => calls.filter((call) => call[0] === name)
const bodyOf = (calls: Call[], name: 'insert' | 'update' | 'upsert', index = 0) => named(calls, name)[index]?.[1]

// ── 직원 ────────────────────────────────────────────────────

describe('AC-7610.1 직원 명단 읽기 listMembers', () => {
  it('AC-7610.1: 정해 둔 칸만 입사일·이름 차례로 1,000줄씩 읽어 StaffMember로 바꾼다(hospital_id·주민번호 칸을 읽지 않는다)', async () => {
    const { client, calls } = fakeClient(okWith([MEMBER_ROW]))
    await expect(createStaffStore(client).listMembers()).resolves.toEqual([MEMBER])
    expect(calls).toEqual([
      ['from', 'staff_members'],
      ['select', MEMBER_COLUMNS],
      ['order', 'hired_on', ASC],
      ['order', 'name', ASC],
      ['order', 'id', ASC],
      ['range', 0, 999],
    ])
    for (const columns of [MEMBER_COLUMNS, PLAN_COLUMNS, CHANGE_COLUMNS, OVERTIME_COLUMNS, LEAVE_COLUMNS, SETTINGS_COLUMNS, RULE_COLUMNS, LINE_COLUMNS, MONTH_COLUMNS]) {
      for (const key of ['hospital_id', 'rrn', 'resident_no', 'jumin']) expect(columns.split(',')).not.toContain(key)
    }
  })

  it('AC-7610.1: 1,000줄이 꽉 차면 다음 쪽을 더 읽어 모두 돌려준다', async () => {
    const first = many(1000, (i) => ({ ...MEMBER_ROW, id: `id-${i}`, name: `가짜${i}` }))
    const second = many(2, (i) => ({ ...MEMBER_ROW, id: `id-x${i}`, name: `나중${i}` }))
    const { client, calls } = fakeClient(okWith(first), okWith(second))
    const found = await createStaffStore(client).listMembers()
    expect(found).toHaveLength(1002)
    expect(found.at(-1)?.id).toBe('id-x1')
    expect(named(calls, 'range')).toEqual([
      ['range', 0, 999],
      ['range', 1000, 1999],
    ])
  })

  it('AC-7610.1: 모양이 틀린 줄은 버리고 맞는 줄만 준다', async () => {
    const bad = [
      null,
      'text',
      { ...MEMBER_ROW, id: '' },
      { ...MEMBER_ROW, name: '' },
      { ...MEMBER_ROW, name: '가'.repeat(21) },
      { ...MEMBER_ROW, job: '의사' },
      { ...MEMBER_ROW, job: '기타', job_other: '가'.repeat(21) },
      { ...MEMBER_ROW, job: '기타', job_other: '' },
      { ...MEMBER_ROW, job: '간호사', job_other: '코디' },
      { ...MEMBER_ROW, employment: 'intern' },
      { ...MEMBER_ROW, weekly_hours: 37.3 },
      { ...MEMBER_ROW, weekly_hours: 81 },
      { ...MEMBER_ROW, hired_on: '2021-02-30' },
      { ...MEMBER_ROW, left_on: '2021-03-01' },
      { ...MEMBER_ROW, phone: '010-1234-5678' },
      { ...MEMBER_ROW, account_no: '123 456' },
      { ...MEMBER_ROW, used_before: 50.5 },
      { ...MEMBER_ROW, memo: '가'.repeat(501) },
    ]
    const other = { ...MEMBER_ROW, id: M2, name: '박서연', job: '기타', job_other: '코디네이터', weekly_hours: 37.5, left_on: '2024-05-31', used_before: 1.5 }
    const { client } = fakeClient(okWith([...bad, MEMBER_ROW, other]))
    const found = await createStaffStore(client).listMembers()
    expect(found.map((m) => m.id)).toEqual([M1, M2])
    expect(found[1]).toMatchObject({ job: '기타', jobOther: '코디네이터', weeklyHours: 37.5, leftOn: '2024-05-31', usedBefore: 1.5 })
  })

  it("AC-7601.4: 직종 '기타'는 직접 적은 직종이 비어도(null) 맞는 줄로 읽는다", async () => {
    const plain = { ...MEMBER_ROW, id: M2, name: '박서연', job: '기타', job_other: null }
    const found = await createStaffStore(fakeClient(okWith([MEMBER_ROW, plain])).client).listMembers()
    expect(found.map((m) => m.id)).toEqual([M1, M2])
    expect(found[1]).toMatchObject({ job: '기타', jobOther: null })
  })

  it('AC-7610.1: 오류 답·던짐·둘째 쪽 실패는 반쪽 목록 대신 E-STAFF-READ-FAILED 번호만 던진다(Supabase 글은 버린다)', async () => {
    await caught(() => createStaffStore(fakeClient(failure()).client).listMembers(), 'E-STAFF-READ-FAILED')
    await caught(() => createStaffStore(throwingClient).listMembers(), 'E-STAFF-READ-FAILED')
    await caught(() => createStaffStore(fakeClient(okWith('not a list')).client).listMembers(), 'E-STAFF-READ-FAILED')
    const full = many(1000, (i) => ({ ...MEMBER_ROW, id: `id-${i}` }))
    await caught(() => createStaffStore(fakeClient(okWith(full), failure(500)).client).listMembers(), 'E-STAFF-READ-FAILED')
  })
})

describe('AC-7610.1 직원 저장 saveMember', () => {
  it('AC-7610.1: 새 직원은 정해 둔 16칸만 새 객체로 넣는다 — hospital_id·id·주민번호를 함께 받아도 보내지 않는다', async () => {
    const { client, calls } = fakeClient(okWith(MEMBER_ROW))
    const input = { ...MEMBER, hospital_id: H, rrn: RRN, residentNo: RRN } as StaffMember
    await expect(createStaffStore(client).saveMember(input)).resolves.toEqual(MEMBER)
    expect(calls).toEqual([['from', 'staff_members'], ['insert', MEMBER_BODY], ['select', MEMBER_COLUMNS], ['single']])
    const body = bodyOf(calls, 'insert') as Record<string, unknown>
    expect(Object.keys(body)).toEqual(MEMBER_KEYS)
    for (const key of NEVER) expect(Object.keys(body)).not.toContain(key)
    expect(JSON.stringify(calls)).not.toContain('900101')
  })

  it('AC-7610.1: 고치기는 그 id 줄에 같은 16칸을 보낸다. 이름 앞뒤 빈칸은 빼고, 전화는 숫자만, 빈 글은 null로 보낸다', async () => {
    const { client, calls } = fakeClient(okWith({ ...MEMBER_ROW, memo: null }))
    await createStaffStore(client).saveMember({ ...MEMBER, name: '  김하늘 ', phone: '010-1234-5678', memo: '   ', address: '' }, M1)
    expect(calls).toEqual([
      ['from', 'staff_members'],
      ['update', { ...MEMBER_BODY, memo: null, address: null }],
      ['eq', 'id', M1],
      ['select', MEMBER_COLUMNS],
      ['single'],
    ])
  })

  it.each([
    [null, null],
    ['   ', null],
    [' 코디네이터 ', '코디네이터'],
    ['가'.repeat(20), '가'.repeat(20)],
  ])("AC-7601.4: 직종 '기타'는 직접 적은 직종(%j)이 비어도 저장한다 — 빈 글은 null, 적었으면 1~20자", async (jobOther, sent) => {
    const { client, calls } = fakeClient(okWith({ ...MEMBER_ROW, job: '기타', job_other: sent }))
    await expect(createStaffStore(client).saveMember({ ...MEMBER, job: '기타', jobOther })).resolves.toMatchObject({ job: '기타', jobOther: sent })
    expect(bodyOf(calls, 'insert')).toEqual({ ...MEMBER_BODY, job: '기타', job_other: sent })
  })

  it.each([
    ['이름 없음', { name: ' ' }],
    ['이름 21자', { name: '가'.repeat(21) }],
    ['기타 직종 글 21자', { job: '기타', jobOther: '가'.repeat(21) }],
    ['기타가 아닌데 직종 글', { jobOther: '코디' }],
    ['주 근무시간 0.5 단위 아님', { weeklyHours: 37.3 }],
    ['입사일 모양', { hiredOn: '2021-3-2' }],
    ['퇴사일이 입사일 앞', { leftOn: '2020-12-31' }],
    ['연락처 8자리', { phone: '0101234' }],
    ['계좌에 글자', { accountNo: '123-abc-456' }],
    ['올해 이미 쓴 연차 51', { usedBefore: 51 }],
    ['메모 501자', { memo: '가'.repeat(501) }],
  ])('AC-7610.1: 칸 규칙(AC-7601.4)을 어기면(%s) 보내지 않고 E-STAFF-SAVE-FAILED', async (_why, patch) => {
    const { client, calls } = fakeClient()
    await caught(() => createStaffStore(client).saveMember({ ...MEMBER, ...patch } as StaffMember), 'E-STAFF-SAVE-FAILED')
    expect(calls).toEqual([])
  })

  it('AC-7610.1: 저장 실패·던짐은 E-STAFF-SAVE-FAILED 번호만 던진다', async () => {
    await caught(() => createStaffStore(fakeClient(failure(409, '23505')).client).saveMember(MEMBER), 'E-STAFF-SAVE-FAILED')
    await caught(() => createStaffStore(throwingClient).saveMember(MEMBER, M1), 'E-STAFF-SAVE-FAILED')
  })
})

describe('AC-7610.4 퇴사자 지우기 purgeMember', () => {
  const GONE = { ...MEMBER, leftOn: '2023-11-20' } // 퇴사 + 3년 = 2026-11-20 < 오늘
  const P1 = `${H}/doc/${M1}/00000000-0000-4000-8000-000000000f01.pdf`
  const P2 = `${H}/doc/${M1}/00000000-0000-4000-8000-000000000f02.png`

  it('AC-7610.4: 그 직원 서류 파일을 바구니에서 먼저 다 지우고 직원 줄을 지운다', async () => {
    const { client, calls } = fakeClient(okWith([{ path: P1 }, { path: P2 }]), okWith([{ name: P1 }, { name: P2 }]), okWith([{ id: M1 }]))
    await createStaffStore(client).purgeMember(GONE, TODAY)
    expect(calls).toEqual([
      ['from', 'staff_files'],
      ['select', 'path'],
      ['eq', 'kind', 'doc'],
      ['eq', 'staff_id', M1],
      ['order', 'id', ASC],
      ['range', 0, 999],
      ['bucket', 'staff-files'],
      ['remove', [P1, P2]],
      ['from', 'staff_members'],
      ['delete'],
      ['eq', 'id', M1],
      ['select', 'id'],
    ])
  })

  it('AC-7610.4: 바구니 지우기가 실패하면 직원 줄은 지우지 않고 E-STAFF-FILE-FAILED', async () => {
    const { client, calls } = fakeClient(okWith([{ path: P1 }]), failure())
    await caught(() => createStaffStore(client).purgeMember(GONE, TODAY), 'E-STAFF-FILE-FAILED')
    expect(named(calls, 'delete')).toEqual([])
  })

  it('AC-7610.4: 서류가 없으면 바구니는 부르지 않고 직원 줄만 지운다', async () => {
    const { client, calls } = fakeClient(okWith([]), okWith([{ id: M1 }]))
    await createStaffStore(client).purgeMember(GONE, TODAY)
    expect(named(calls, 'bucket')).toEqual([])
    expect(named(calls, 'delete')).toHaveLength(1)
  })

  it('AC-7610.4: 퇴사 3년이 아직 안 지났으면(같은 날 포함)·재직자면 아무것도 보내지 않고 E-STAFF-SAVE-FAILED', async () => {
    for (const member of [{ ...MEMBER, leftOn: '2023-11-21' }, MEMBER]) {
      const { client, calls } = fakeClient()
      await caught(() => createStaffStore(client).purgeMember(member, TODAY), 'E-STAFF-SAVE-FAILED')
      expect(calls).toEqual([])
    }
  })

  it('AC-7610.4: DB가 0줄을 지우면(정책이 막음) E-STAFF-SAVE-FAILED', async () => {
    const { client } = fakeClient(okWith([]), okWith([]))
    await caught(() => createStaffStore(client).purgeMember(GONE, TODAY), 'E-STAFF-SAVE-FAILED')
  })
})

describe('AC-7610.1 엑셀 넣기 importRoster', () => {
  const NEW_YUNA: RosterImportRow = {
    action: 'new',
    member: { name: ' 정유나 ', job: '물리치료사', employment: 'part', weeklyHours: 24, hiredOn: '2024-09-02', phone: '010-2222-3333', usedBefore: 2, usedBeforeFrom: '2026-09-02' },
    plan: { week: WEEK, sat: '1-3' },
  }
  const NEW_JIWOO: RosterImportRow = { action: 'new', member: { name: '한지우', job: '원무', hiredOn: '2026-02-02' }, plan: null }
  const PROBLEM: RosterImportRow = { action: 'problem', member: { name: '' }, plan: null }
  const CHANGE_HANEUL: RosterImportRow = {
    action: 'update',
    member: { name: '김하늘', hiredOn: '2021-03-02', phone: '01099998888', bank: '가짜은행', usedBefore: 5 },
    plan: { week: WEEK, sat: 'every' },
  }
  const YUNA_BODY = {
    ...Object.fromEntries(MEMBER_KEYS.map((key) => [key, null])),
    name: '정유나',
    job: '물리치료사',
    employment: 'part',
    weekly_hours: 24,
    hired_on: '2024-09-02',
    phone: '01022223333',
    used_before: 2,
    used_before_from: '2026-09-02',
  }
  const JIWOO_BODY = {
    ...Object.fromEntries(MEMBER_KEYS.map((key) => [key, null])),
    name: '한지우',
    job: '원무',
    employment: 'regular',
    weekly_hours: 40,
    hired_on: '2026-02-02',
    used_before: 0,
  }

  it('AC-7610.1: 문제 줄은 빼고, 새 줄은 한 번에 넣고(+ 입사일부터 기본 근무), 고침 줄은 바뀐 칸만 고치고 오늘부터 기본 근무를 둔다', async () => {
    const { client, calls } = fakeClient(
      okWith([MEMBER_ROW]),
      okWith([
        { id: N2, name: '한지우', hired_on: '2026-02-02' },
        { id: N1, name: '정유나', hired_on: '2024-09-02' },
      ]),
      OK,
      OK,
      okWith([{ ...PLAN_ROW, from_day: TODAY, sat_rotation: 'every' }]),
    )
    await expect(createStaffStore(client).importRoster([NEW_YUNA, PROBLEM, NEW_JIWOO, CHANGE_HANEUL], TODAY)).resolves.toEqual({ added: 2, updated: 1 })
    expect(calls).toEqual([
      ['from', 'staff_members'],
      ['select', MEMBER_COLUMNS],
      ['order', 'hired_on', ASC],
      ['order', 'name', ASC],
      ['order', 'id', ASC],
      ['range', 0, 999],
      ['from', 'staff_members'],
      ['insert', [YUNA_BODY, JIWOO_BODY]],
      ['select', 'id,name,hired_on'],
      ['from', 'staff_week_plans'],
      ['insert', [{ staff_id: N1, from_day: '2024-09-02', week: WEEK, sat_rotation: '1-3' }]],
      // '올해 이미 쓴 연차'는 새 줄에만, 같은 값(이름·입사일·은행)은 보내지 않는다
      ['from', 'staff_members'],
      ['update', { phone: '01099998888' }],
      ['eq', 'id', M1],
      ['from', 'staff_week_plans'],
      ['update', { week: WEEK, sat_rotation: 'every' }],
      ['eq', 'staff_id', M1],
      ['eq', 'from_day', TODAY],
      ['select', PLAN_COLUMNS],
    ])
    for (const key of NEVER) expect(Object.keys(YUNA_BODY)).not.toContain(key)
  })

  it('AC-7610.1: 고침 줄은 10개씩 보낸다', async () => {
    const rows = many(23, (i) => ({ ...MEMBER_ROW, id: `id-${i}`, name: `가짜${i}` }))
    const changes: RosterImportRow[] = rows.map((row) => ({ action: 'update', member: { name: row.name, hiredOn: row.hired_on, memo: '바뀐 메모' }, plan: null }))
    const { client, calls, most } = fakeClient(okWith(rows), OK)
    await expect(createStaffStore(client).importRoster(changes, TODAY)).resolves.toEqual({ added: 0, updated: 23 })
    expect(named(calls, 'update')).toHaveLength(23)
    expect(named(calls, 'update')[0]).toEqual(['update', { memo: '바뀐 메모' }])
    expect(most()).toBeLessThanOrEqual(10)
  })

  it('AC-7610.1: 새 줄만이면 명단을 읽지 않는다', async () => {
    const { client, calls } = fakeClient(okWith([{ id: N2, name: '한지우', hired_on: '2026-02-02' }]))
    await createStaffStore(client).importRoster([NEW_JIWOO], TODAY)
    expect(calls).toEqual([['from', 'staff_members'], ['insert', [JIWOO_BODY]], ['select', 'id,name,hired_on']])
  })

  it('AC-7610.1: 한 줄이라도 칸 규칙을 어기거나 고칠 사람이 명단에 없으면 아무것도 넣지 않고 E-STAFF-SAVE-FAILED', async () => {
    const broken: RosterImportRow = { ...NEW_JIWOO, member: { ...NEW_JIWOO.member, weeklyHours: 90 } }
    const first = fakeClient(okWith([MEMBER_ROW]))
    await caught(() => createStaffStore(first.client).importRoster([NEW_YUNA, broken], TODAY), 'E-STAFF-SAVE-FAILED')
    expect(first.calls).toEqual([])
    const stranger: RosterImportRow = { action: 'update', member: { name: '없는사람', hiredOn: '2020-01-01', memo: '가' }, plan: null }
    const second = fakeClient(okWith([MEMBER_ROW]))
    await caught(() => createStaffStore(second.client).importRoster([NEW_JIWOO, stranger], TODAY), 'E-STAFF-SAVE-FAILED')
    expect(named(second.calls, 'insert')).toEqual([])
    const badWeek: RosterImportRow = { ...NEW_JIWOO, plan: { week: WEEK.slice(0, 6), sat: 'every' } }
    const third = fakeClient()
    await caught(() => createStaffStore(third.client).importRoster([badWeek], TODAY), 'E-STAFF-SAVE-FAILED')
    expect(third.calls).toEqual([])
  })

  it('AC-7610.1: 중간에 실패하면 E-STAFF-SAVE-FAILED(된 것은 남는다)', async () => {
    const { client, calls } = fakeClient(okWith([{ id: N2, name: '한지우', hired_on: '2026-02-02' }]), failure())
    await caught(() => createStaffStore(client).importRoster([{ ...NEW_JIWOO, plan: { week: WEEK, sat: 'every' } }], TODAY), 'E-STAFF-SAVE-FAILED')
    expect(named(calls, 'insert')).toHaveLength(2)
  })
})

// ── 근무표 ──────────────────────────────────────────────────

describe('AC-7610.1 기본 근무 listPlans·savePlan', () => {
  it('AC-7610.1: 모든 기본 근무를 직원·시작일 차례로 읽고 틀린 줄은 버린다', async () => {
    const bad = [
      { ...PLAN_ROW, id: 'b1', week: WEEK.slice(0, 6) },
      { ...PLAN_ROW, id: 'b2', week: [{ ...DAY, start: 545 }, ...WEEK.slice(1)] },
      { ...PLAN_ROW, id: 'b3', week: [{ ...DAY, lunchFrom: 500 }, ...WEEK.slice(1)] },
      { ...PLAN_ROW, id: 'b4', week: [{ ...DAY, lunchTo: null }, ...WEEK.slice(1)] },
      { ...PLAN_ROW, id: 'b5', week: [{ ...DAY, end: 540 }, ...WEEK.slice(1)] },
      { ...PLAN_ROW, id: 'b6', sat_rotation: '1-2' },
      { ...PLAN_ROW, id: 'b7', from_day: '2021-13-01' },
    ]
    const { client, calls } = fakeClient(okWith([...bad, PLAN_ROW]))
    await expect(createStaffStore(client).listPlans()).resolves.toEqual([PLAN])
    expect(calls).toEqual([
      ['from', 'staff_week_plans'],
      ['select', PLAN_COLUMNS],
      ['order', 'staff_id', ASC],
      ['order', 'from_day', ASC],
      ['range', 0, 999],
    ])
  })

  it('AC-7610.1: 저장은 그 직원·시작일 줄을 고치고(week·sat_rotation만), 없으면 넣는다. 요일 칸은 네 칸만 새 객체로', async () => {
    const { client, calls } = fakeClient(okWith([]), okWith(PLAN_ROW))
    const messy = WEEK.map((shift) => (shift === null ? null : { ...shift, note: SECRET }))
    await expect(createStaffStore(client).savePlan(M1, '2021-03-02', messy, '1-3')).resolves.toEqual(PLAN)
    expect(calls).toEqual([
      ['from', 'staff_week_plans'],
      ['update', { week: WEEK, sat_rotation: '1-3' }],
      ['eq', 'staff_id', M1],
      ['eq', 'from_day', '2021-03-02'],
      ['select', PLAN_COLUMNS],
      ['from', 'staff_week_plans'],
      ['insert', { staff_id: M1, from_day: '2021-03-02', week: WEEK, sat_rotation: '1-3' }],
      ['select', PLAN_COLUMNS],
      ['single'],
    ])
    expect(JSON.stringify(calls)).not.toContain(SECRET)
  })

  it('AC-7610.1: 이미 줄이 있으면 고치기 한 번이고, 넣다가 겹치면(다른 창이 먼저 넣음) 한 번 더 고친다', async () => {
    const once = fakeClient(okWith([PLAN_ROW]))
    await createStaffStore(once.client).savePlan(M1, '2021-03-02', WEEK, '1-3')
    expect(named(once.calls, 'insert')).toEqual([])
    const race = fakeClient(okWith([]), failure(409, '23505'), okWith([PLAN_ROW]))
    await expect(createStaffStore(race.client).savePlan(M1, '2021-03-02', WEEK, '1-3')).resolves.toEqual(PLAN)
    expect(named(race.calls, 'update')).toHaveLength(2)
  })

  it('AC-7610.1: 요일 칸이 틀리면 보내지 않고 E-STAFF-SAVE-FAILED', async () => {
    const { client, calls } = fakeClient()
    await caught(() => createStaffStore(client).savePlan(M1, '2021-03-02', WEEK.slice(0, 6), 'every'), 'E-STAFF-SAVE-FAILED')
    await caught(() => createStaffStore(client).savePlan(M1, '2021-03-02', WEEK, 'odd' as never), 'E-STAFF-SAVE-FAILED')
    expect(calls).toEqual([])
  })
})

describe('AC-7610.1 바뀐 날·더 일한 시간', () => {
  const CHANGE_ROW = { staff_id: M1, day: '2026-11-10', start_min: 600, end_min: 1140, lunch_from: 780, lunch_to: 840, memo: '늦게 출근' }
  const REST_ROW = { staff_id: M2, day: '2026-11-11', start_min: null, end_min: null, lunch_from: null, lunch_to: null, memo: null }

  it('AC-7610.1: 바뀐 날은 그 기간만 날 차례로 읽고, 근무가 비면 쉼(null)이다', async () => {
    const bad = [{ ...CHANGE_ROW, start_min: 600, end_min: null }, { ...CHANGE_ROW, memo: '가'.repeat(51) }]
    const { client, calls } = fakeClient(okWith([CHANGE_ROW, REST_ROW, ...bad]))
    await expect(createStaffStore(client).listChanges({ from: '2026-11-01', to: '2026-11-30' })).resolves.toEqual([
      { staffId: M1, day: '2026-11-10', shift: { start: 600, end: 1140, lunchFrom: 780, lunchTo: 840 }, memo: '늦게 출근' },
      { staffId: M2, day: '2026-11-11', shift: null, memo: null },
    ])
    expect(calls).toEqual([
      ['from', 'staff_day_changes'],
      ['select', CHANGE_COLUMNS],
      ['gte', 'day', '2026-11-01'],
      ['lte', 'day', '2026-11-30'],
      ['order', 'day', ASC],
      ['order', 'staff_id', ASC],
      ['range', 0, 999],
    ])
  })

  it('AC-7610.1: 기간이 틀리면 보내지 않고 E-STAFF-READ-FAILED', async () => {
    const { client, calls } = fakeClient()
    await caught(() => createStaffStore(client).listChanges({ from: '2026-11-30', to: '2026-11-01' }), 'E-STAFF-READ-FAILED')
    await caught(() => createStaffStore(client).listOvertime({ from: 'bad', to: '2026-11-01' }), 'E-STAFF-READ-FAILED')
    await caught(() => createStaffStore(client).listLeaves({ from: '2026-11-01', to: '' }), 'E-STAFF-READ-FAILED')
    expect(calls).toEqual([])
  })

  it('AC-7610.1: 바뀐 날 저장은 근무 네 칸 + 메모만 고치고(없으면 직원·날과 함께 넣음), 쉼은 네 칸 모두 null이다', async () => {
    const { client, calls } = fakeClient(okWith([]), okWith(REST_ROW))
    await expect(createStaffStore(client).saveChange({ staffId: M2, day: '2026-11-11', shift: null, memo: '  ' })).resolves.toEqual({
      staffId: M2,
      day: '2026-11-11',
      shift: null,
      memo: null,
    })
    const values = { start_min: null, end_min: null, lunch_from: null, lunch_to: null, memo: null }
    expect(calls).toEqual([
      ['from', 'staff_day_changes'],
      ['update', values],
      ['eq', 'staff_id', M2],
      ['eq', 'day', '2026-11-11'],
      ['select', CHANGE_COLUMNS],
      ['from', 'staff_day_changes'],
      ['insert', { staff_id: M2, day: '2026-11-11', ...values }],
      ['select', CHANGE_COLUMNS],
      ['single'],
    ])
  })

  it('AC-7610.1: 바뀐 날 근무 칸이 틀리면(점심이 근무 밖) 보내지 않는다', async () => {
    const { client, calls } = fakeClient()
    await caught(
      () => createStaffStore(client).saveChange({ staffId: M1, day: '2026-11-10', shift: { start: 600, end: 1140, lunchFrom: 500, lunchTo: 560 }, memo: null }),
      'E-STAFF-SAVE-FAILED',
    )
    expect(calls).toEqual([])
  })

  it('AC-7610.1: 그날 되돌리기(resetDay)는 바뀐 날과 더 일한 시간을 지운다', async () => {
    const { client, calls } = fakeClient()
    await createStaffStore(client).resetDay(M1, '2026-11-10')
    expect(calls).toEqual([
      ['from', 'staff_day_changes'],
      ['delete'],
      ['eq', 'staff_id', M1],
      ['eq', 'day', '2026-11-10'],
      ['from', 'staff_overtime'],
      ['delete'],
      ['eq', 'staff_id', M1],
      ['eq', 'day', '2026-11-10'],
    ])
  })

  it('AC-7610.1: 더 일한 시간 읽기는 그 기간만, 저장은 분만 고치고(없으면 넣음) 0이면 그 줄을 지운다', async () => {
    const row = { staff_id: M1, day: '2026-11-10', kind: 'night', minutes: 60 }
    const read = fakeClient(okWith([row, { ...row, kind: 'late' }, { ...row, minutes: 45 }]))
    await expect(createStaffStore(read.client).listOvertime({ from: '2026-11-01', to: '2026-11-30' })).resolves.toEqual([
      { staffId: M1, day: '2026-11-10', kind: 'night', minutes: 60 },
    ])
    expect(read.calls.slice(0, 2)).toEqual([
      ['from', 'staff_overtime'],
      ['select', OVERTIME_COLUMNS],
    ])
    const save = fakeClient(okWith([]), OK)
    await createStaffStore(save.client).saveOvertime({ staffId: M1, day: '2026-11-10', kind: 'night', minutes: 90 })
    expect(save.calls).toEqual([
      ['from', 'staff_overtime'],
      ['update', { minutes: 90 }],
      ['eq', 'staff_id', M1],
      ['eq', 'day', '2026-11-10'],
      ['eq', 'kind', 'night'],
      ['select', OVERTIME_COLUMNS],
      ['from', 'staff_overtime'],
      ['insert', { staff_id: M1, day: '2026-11-10', kind: 'night', minutes: 90 }],
      ['select', OVERTIME_COLUMNS],
      ['single'],
    ])
    const zero = fakeClient()
    await createStaffStore(zero.client).saveOvertime({ staffId: M1, day: '2026-11-10', kind: 'night', minutes: 0 })
    expect(zero.calls).toEqual([['from', 'staff_overtime'], ['delete'], ['eq', 'staff_id', M1], ['eq', 'day', '2026-11-10'], ['eq', 'kind', 'night']])
    const bad = fakeClient()
    await caught(() => createStaffStore(bad.client).saveOvertime({ staffId: M1, day: '2026-11-10', kind: 'night', minutes: 45 }), 'E-STAFF-SAVE-FAILED')
    expect(bad.calls).toEqual([])
  })
})

// ── 휴가 ────────────────────────────────────────────────────

describe('AC-7610.2 휴가 묶음', () => {
  const DRAFTS: LeaveDraft[] = [
    { staffId: M1, day: '2026-12-21', kind: 'annual', part: null, paid: true, memo: '가족 여행' },
    { staffId: M1, day: '2026-12-22', kind: 'annual', part: null, paid: true, memo: '가족 여행' },
    { staffId: M1, day: '2026-12-23', kind: 'annual', part: null, paid: true, memo: '가족 여행' },
  ]

  it('AC-7610.2: 펼친 날마다 한 줄이 새 묶음 id 하나로 한 번에 들어간다(정해 둔 일곱 칸만)', async () => {
    const saved = DRAFTS.map((draft, i) => ({ id: `l-${i}`, group_id: G1, staff_id: M1, day: draft.day, kind: 'annual', part: null, paid: true, memo: '가족 여행' }))
    const { client, calls } = fakeClient(okWith(saved))
    const found = await createStaffStore(client).addLeaveGroup(DRAFTS.map((draft) => ({ ...draft, hospital_id: H }) as LeaveDraft))
    expect(found.map((leave) => leave.day)).toEqual(['2026-12-21', '2026-12-22', '2026-12-23'])
    const [, rows] = named(calls, 'insert')[0] as [string, Record<string, unknown>[]]
    expect(rows).toHaveLength(3)
    const group = rows[0].group_id
    expect(group).toMatch(UUID)
    for (const row of rows) {
      expect(Object.keys(row)).toEqual(['group_id', 'staff_id', 'day', 'kind', 'part', 'paid', 'memo'])
      expect(row.group_id).toBe(group)
    }
    expect(calls).toEqual([['from', 'staff_leaves'], ['insert', rows], ['select', LEAVE_COLUMNS]])
  })

  it('AC-7610.2: 묶음 고치기는 그 묶음을 지우고 같은 묶음 id로 다시 넣는다', async () => {
    const { client, calls } = fakeClient(OK, okWith([LEAVE_ROW]))
    await expect(
      createStaffStore(client).replaceLeaveGroup(G1, [{ staffId: M1, day: '2026-11-13', kind: 'half', part: 'pm', paid: true, memo: null }]),
    ).resolves.toEqual([LEAVE])
    expect(calls).toEqual([
      ['from', 'staff_leaves'],
      ['delete'],
      ['eq', 'group_id', G1],
      ['from', 'staff_leaves'],
      ['insert', [{ group_id: G1, staff_id: M1, day: '2026-11-13', kind: 'half', part: 'pm', paid: true, memo: null }]],
      ['select', LEAVE_COLUMNS],
    ])
  })

  it('AC-7610.2: 묶음 지우기는 한 번에 지운다', async () => {
    const { client, calls } = fakeClient()
    await createStaffStore(client).deleteLeaveGroup(G1)
    expect(calls).toEqual([['from', 'staff_leaves'], ['delete'], ['eq', 'group_id', G1]])
  })

  it.each([
    ['반차인데 오전·오후 없음', { kind: 'half', part: null }],
    ['연차인데 오전', { kind: 'annual', part: 'am' }],
    ['무급(결근)인데 유급', { kind: 'unpaid', paid: true }],
    ['연차인데 무급', { kind: 'annual', paid: false }],
    ['메모 51자', { memo: '가'.repeat(51) }],
    ['날짜 모양', { day: '2026-12-32' }],
  ])('AC-7610.2: 휴가 칸 규칙(AC-7601.5)을 어기면(%s) 아무 줄도 보내지 않는다', async (_why, patch) => {
    const { client, calls } = fakeClient()
    await caught(() => createStaffStore(client).addLeaveGroup([DRAFTS[0], { ...DRAFTS[1], ...patch } as LeaveDraft]), 'E-STAFF-SAVE-FAILED')
    await caught(() => createStaffStore(client).replaceLeaveGroup(G1, [{ ...DRAFTS[1], ...patch } as LeaveDraft]), 'E-STAFF-SAVE-FAILED')
    expect(calls).toEqual([])
  })

  it('AC-7610.2: 빈 묶음·빈 묶음 id는 보내지 않는다. 병가만 유급·무급을 고른다', async () => {
    const { client, calls } = fakeClient(okWith([{ ...LEAVE_ROW, kind: 'sick', part: null, paid: false }]))
    await caught(() => createStaffStore(client).addLeaveGroup([]), 'E-STAFF-SAVE-FAILED')
    await caught(() => createStaffStore(client).deleteLeaveGroup(''), 'E-STAFF-SAVE-FAILED')
    expect(calls).toEqual([])
    await createStaffStore(client).addLeaveGroup([{ ...DRAFTS[0], kind: 'sick', paid: false }])
    expect(named(calls, 'insert')).toHaveLength(1)
  })

  it('AC-7610.2: 휴가 읽기는 그 기간만 날 차례로, 틀린 줄은 버린다', async () => {
    const bad = [{ ...LEAVE_ROW, id: 'x1', part: null }, { ...LEAVE_ROW, id: 'x2', kind: 'vacation' }, { ...LEAVE_ROW, id: 'x3', group_id: null }]
    const { client, calls } = fakeClient(okWith([LEAVE_ROW, ...bad]))
    await expect(createStaffStore(client).listLeaves({ from: '2026-01-01', to: '2026-12-31' })).resolves.toEqual([LEAVE])
    expect(calls).toEqual([
      ['from', 'staff_leaves'],
      ['select', LEAVE_COLUMNS],
      ['gte', 'day', '2026-01-01'],
      ['lte', 'day', '2026-12-31'],
      ['order', 'day', ASC],
      ['order', 'staff_id', ASC],
      ['range', 0, 999],
    ])
  })
})

describe('AC-7610.5 휴가 날 예약 수 countAppts', () => {
  it('AC-7610.5: 예약 표에서 날짜 칸(day)만 읽어 그 시행자의 취소 아닌 예약 수를 날마다 센다(이름·차트번호는 읽지 않는다)', async () => {
    const rows = [{ day: '2026-12-21' }, { day: '2026-12-21' }, { day: '2026-12-22' }, { day: '2026-12-23' }, { day: 'bad' }]
    const { client, calls } = fakeClient(okWith(rows))
    await expect(createStaffStore(client).countAppts('st-ga', ['2026-12-23', '2026-12-21', '2026-12-21'])).resolves.toEqual([
      { day: '2026-12-21', count: 2 },
      { day: '2026-12-23', count: 1 },
    ])
    expect(calls).toEqual([
      ['from', 'calendar_appts'],
      ['select', 'day'],
      ['eq', 'staff_id', 'st-ga'],
      ['gte', 'day', '2026-12-21'],
      ['lte', 'day', '2026-12-23'],
      ['neq', 'status', 'cancel'],
      ['order', 'day', ASC],
      ['order', 'id', ASC],
      ['range', 0, 999],
    ])
  })

  it('AC-7610.5: 날이 없거나 이어진 시행자가 없으면 보내지 않고 빈 목록, 읽기 실패는 E-STAFF-READ-FAILED', async () => {
    const { client, calls } = fakeClient()
    await expect(createStaffStore(client).countAppts('st-ga', [])).resolves.toEqual([])
    await expect(createStaffStore(client).countAppts('', ['2026-12-21'])).resolves.toEqual([])
    expect(calls).toEqual([])
    await caught(() => createStaffStore(fakeClient(failure()).client).countAppts('st-ga', ['2026-12-21']), 'E-STAFF-READ-FAILED')
  })
})

// ── 설정 ────────────────────────────────────────────────────

describe('AC-7610.1 설정 loadSettings·saveSettings', () => {
  it('AC-7610.1: 줄이 없으면 기본값(입사일 기준·수당 정산·기본 급여 항목 다섯)이고 부를 때마다 새 값이다', async () => {
    const { client, calls } = fakeClient(okWith(null))
    const settings = await createStaffStore(client).loadSettings()
    expect(settings).toEqual({ leaveBasis: 'hire', leftover: 'pay', payItems: DEFAULT_PAY_ITEMS })
    expect(settings.payItems.map((item) => item.name)).toEqual(['기본급', '연장수당', '식대', '인센티브', '상여'])
    expect(settings.payItems.find((item) => item.id === 'incentive')?.kind).toBe('incentive')
    expect(calls).toEqual([['from', 'staff_settings'], ['select', SETTINGS_COLUMNS], ['maybeSingle']])
    expect(defaultStaffSettings()).toEqual(settings)
    expect(defaultStaffSettings().payItems).not.toBe(defaultStaffSettings().payItems)
  })

  it('AC-7610.1: 틀린 칸만 기본값이다', async () => {
    const items = [{ id: 'base', name: '기본급', kind: 'amount', base: true, removedFrom: null }, { id: 'duty', name: '직책수당', kind: 'amount', base: false, removedFrom: '2026-12' }]
    const { client } = fakeClient(okWith({ leave_basis: 'jan1', leftover: 'cash', pay_items: items }))
    await expect(createStaffStore(client).loadSettings()).resolves.toEqual({ leaveBasis: 'jan1', leftover: 'pay', payItems: items })
    const dup = fakeClient(okWith({ leave_basis: 'x', leftover: 'carry', pay_items: [items[0], items[0]] }))
    await expect(createStaffStore(dup.client).loadSettings()).resolves.toEqual({ leaveBasis: 'hire', leftover: 'carry', payItems: DEFAULT_PAY_ITEMS })
    await caught(() => createStaffStore(fakeClient(failure()).client).loadSettings(), 'E-STAFF-READ-FAILED')
  })

  it('AC-7610.1: 저장은 세 칸만 내 병원 줄 하나에 덮어쓴다(onConflict hospital_id). 항목은 다섯 칸만 새 객체로', async () => {
    const { client, calls } = fakeClient()
    const items = [...DEFAULT_PAY_ITEMS, { id: 'duty', name: ' 직책수당 ', kind: 'amount' as const, base: false, removedFrom: null, note: SECRET }]
    const saved = await createStaffStore(client).saveSettings({ leaveBasis: 'jan1', leftover: 'carry', payItems: items })
    const clean = [...DEFAULT_PAY_ITEMS, { id: 'duty', name: '직책수당', kind: 'amount', base: false, removedFrom: null }]
    expect(saved).toEqual({ leaveBasis: 'jan1', leftover: 'carry', payItems: clean })
    expect(calls).toEqual([
      ['from', 'staff_settings'],
      ['upsert', { leave_basis: 'jan1', leftover: 'carry', pay_items: clean }, { onConflict: 'hospital_id' }],
    ])
  })

  it('AC-7610.1: 설정이 틀리면(항목 id 겹침·이름 없음·31개·빠진 달 모양) 보내지 않는다', async () => {
    const { client, calls } = fakeClient()
    const base = DEFAULT_PAY_ITEMS[0]
    for (const payItems of [
      [base, base],
      [{ ...base, name: ' ' }],
      many(31, (i) => ({ ...base, id: `i${i}` })),
      [{ ...base, removedFrom: '2026-13' }],
    ]) {
      await caught(() => createStaffStore(client).saveSettings({ leaveBasis: 'hire', leftover: 'pay', payItems }), 'E-STAFF-SAVE-FAILED')
    }
    await caught(() => createStaffStore(client).saveSettings({ leaveBasis: 'x' as never, leftover: 'pay', payItems: [base] }), 'E-STAFF-SAVE-FAILED')
    expect(calls).toEqual([])
  })
})

// ── 급여 ────────────────────────────────────────────────────

const RULE_ROW = { id: R1, staff_id: M1, name: '도수 건당', method: 'per_case', unit_amount: 5000, percent: null, sort: 0 }
const LINE_ROW = {
  id: L1,
  month: '2026-11',
  staff_id: M1,
  amounts: { base: 3000000, meal: 200000 },
  incentives: [
    { ruleId: R1, name: '도수 건당', method: 'per_case', unitAmount: 5000, percent: null, count: 32, sales: null },
    { ruleId: R2, name: '매출', method: 'percent', unitAmount: null, percent: 10, count: null, sales: 4200000 },
  ],
  adjust: 0,
  adjust_reason: null,
  adjust_memo: null,
}
const LINE: PayLine = {
  id: L1,
  month: '2026-11',
  staffId: M1,
  amounts: { base: 3000000, meal: 200000 },
  incentives: LINE_ROW.incentives as PayLine['incentives'],
  adjust: 0,
  adjustReason: null,
  adjustMemo: null,
}

describe('AC-7610.1 인센티브 규칙 listRules·saveRules', () => {
  it('AC-7610.1: 규칙을 직원·차례로 읽고, 방식과 맞지 않는 줄은 버린다', async () => {
    const bad = [
      { ...RULE_ROW, id: 'x1', method: 'percent' },
      { ...RULE_ROW, id: 'x2', percent: 10 },
      { ...RULE_ROW, id: 'x3', method: 'bonus' },
      { ...RULE_ROW, id: 'x4', name: '' },
      { ...RULE_ROW, id: 'x5', method: 'percent', unit_amount: null, percent: 100.5 },
    ]
    const pct = { ...RULE_ROW, id: R2, name: '매출', method: 'percent', unit_amount: null, percent: 12.25, sort: 1 }
    const { client, calls } = fakeClient(okWith([RULE_ROW, pct, ...bad]))
    await expect(createStaffStore(client).listRules()).resolves.toEqual([
      { id: R1, staffId: M1, name: '도수 건당', method: 'per_case', unitAmount: 5000, percent: null, sort: 0 },
      { id: R2, staffId: M1, name: '매출', method: 'percent', unitAmount: null, percent: 12.25, sort: 1 },
    ])
    expect(calls).toEqual([
      ['from', 'staff_incentive_rules'],
      ['select', RULE_COLUMNS],
      ['order', 'staff_id', ASC],
      ['order', 'sort', ASC],
      ['order', 'id', ASC],
      ['range', 0, 999],
    ])
  })

  it('AC-7610.1·AC-7606.4: 규칙을 저장(뺀 것 지움·있던 것 고침·새것 넣음)한 뒤 보는 달부터의 급여 줄만 새 규칙으로 고친다(적은 건수·매출은 규칙 id로 그대로)', async () => {
    const r3Row = { id: R3, staff_id: M1, name: '고정 수당', method: 'fixed', unit_amount: 100000, percent: null, sort: 1 }
    const decLine = { ...LINE_ROW, id: L2, month: '2026-12', incentives: [] }
    const octLine = { ...LINE_ROW, id: L0, month: '2026-10' } // DB가 잘못 주더라도 보는 달 앞 줄은 건드리지 않는다
    const { client, calls } = fakeClient(
      okWith([{ id: R1 }, { id: R2 }]),
      OK,
      OK,
      OK,
      okWith([{ ...RULE_ROW, name: '도수 건당(새)', unit_amount: 6000 }, r3Row]),
      okWith([octLine, LINE_ROW, decLine]),
      OK,
    )
    const saved = await createStaffStore(client).saveRules(
      M1,
      [
        { id: R1, name: ' 도수 건당(새) ', method: 'per_case', unitAmount: 6000, percent: null, sort: 7 },
        { id: 'new-1', name: '고정 수당', method: 'fixed', unitAmount: 100000, percent: null, sort: 9 },
      ],
      '2026-11',
    )
    expect(saved.map((rule) => rule.id)).toEqual([R1, R3])
    const r1Entry = { ruleId: R1, name: '도수 건당(새)', method: 'per_case', unitAmount: 6000, percent: null }
    const r3Entry = { ruleId: R3, name: '고정 수당', method: 'fixed', unitAmount: 100000, percent: null, count: null, sales: null }
    expect(calls).toEqual([
      ['from', 'staff_incentive_rules'],
      ['select', 'id'],
      ['eq', 'staff_id', M1],
      ['from', 'staff_incentive_rules'],
      ['delete'],
      ['eq', 'staff_id', M1],
      ['in', 'id', [R2]],
      ['from', 'staff_incentive_rules'],
      ['update', { name: '도수 건당(새)', method: 'per_case', unit_amount: 6000, percent: null, sort: 0 }],
      ['eq', 'id', R1],
      ['from', 'staff_incentive_rules'],
      ['insert', [{ staff_id: M1, name: '고정 수당', method: 'fixed', unit_amount: 100000, percent: null, sort: 1 }]],
      ['from', 'staff_incentive_rules'],
      ['select', RULE_COLUMNS],
      ['eq', 'staff_id', M1],
      ['order', 'sort', ASC],
      ['order', 'id', ASC],
      ['range', 0, 999],
      ['from', 'staff_pay_lines'],
      ['select', LINE_COLUMNS],
      ['eq', 'staff_id', M1],
      ['gte', 'month', '2026-11'],
      ['order', 'month', ASC],
      ['order', 'id', ASC],
      ['range', 0, 999],
      ['from', 'staff_pay_lines'],
      ['update', { incentives: [{ ...r1Entry, count: 32, sales: null }, r3Entry] }],
      ['eq', 'id', L1],
      ['from', 'staff_pay_lines'],
      ['update', { incentives: [{ ...r1Entry, count: null, sales: null }, r3Entry] }],
      ['eq', 'id', L2],
    ])
  })

  it('AC-7610.1: 규칙이 틀리면(방식과 값이 맞지 않음·% 소수 셋째 자리·이름 없음) 보내지 않는다', async () => {
    const { client, calls } = fakeClient()
    for (const rule of [
      { id: null, name: '매출', method: 'percent' as const, unitAmount: 1000, percent: 10, sort: 0 },
      { id: null, name: '매출', method: 'percent' as const, unitAmount: null, percent: 10.125, sort: 0 },
      { id: null, name: ' ', method: 'fixed' as const, unitAmount: 1000, percent: null, sort: 0 },
      { id: null, name: '건당', method: 'per_case' as const, unitAmount: -1, percent: null, sort: 0 },
    ]) {
      await caught(() => createStaffStore(client).saveRules(M1, [rule], '2026-11'), 'E-STAFF-SAVE-FAILED')
    }
    await caught(() => createStaffStore(client).saveRules(M1, [], '2026-1'), 'E-STAFF-SAVE-FAILED')
    expect(calls).toEqual([])
  })
})

describe('AC-7610.1 급여 줄 listPayLines·savePayLine', () => {
  it('AC-7610.1: 그 달들의 줄을 달 차례로 읽고(지워진 직원 줄은 staffId null), 틀린 줄은 버린다', async () => {
    const orphan = { ...LINE_ROW, id: L2, staff_id: null, incentives: [] }
    const bad = [
      { ...LINE_ROW, id: 'x1', month: '2026-13' },
      { ...LINE_ROW, id: 'x2', amounts: { base: 1.5 } },
      { ...LINE_ROW, id: 'x3', adjust: 100000001 },
      { ...LINE_ROW, id: 'x4', adjust_reason: 'gift' },
      { ...LINE_ROW, id: 'x5', incentives: [{ name: '가' }] },
      { ...LINE_ROW, id: 'x6', adjust_memo: '가'.repeat(31) },
    ]
    const { client, calls } = fakeClient(okWith([LINE_ROW, orphan, ...bad]))
    await expect(createStaffStore(client).listPayLines('2026-06', '2026-11')).resolves.toEqual([LINE, { ...LINE, id: L2, staffId: null, incentives: [] }])
    expect(calls).toEqual([
      ['from', 'staff_pay_lines'],
      ['select', LINE_COLUMNS],
      ['gte', 'month', '2026-06'],
      ['lte', 'month', '2026-11'],
      ['order', 'month', ASC],
      ['order', 'id', ASC],
      ['range', 0, 999],
    ])
  })

  it('AC-7610.1: id가 있는 줄은 금액·인센티브·조정 다섯 칸만 그 id 줄에 고친다', async () => {
    const { client, calls } = fakeClient(okWith(LINE_ROW))
    await expect(createStaffStore(client).savePayLine({ ...LINE, hospital_id: H } as PayLine)).resolves.toEqual(LINE)
    expect(calls).toEqual([
      ['from', 'staff_pay_lines'],
      ['update', { amounts: LINE.amounts, incentives: LINE.incentives, adjust: 0, adjust_reason: null, adjust_memo: null }],
      ['eq', 'id', L1],
      ['select', LINE_COLUMNS],
      ['single'],
    ])
  })

  it('AC-7610.1: 새 줄은 그 달·직원 줄을 고치고, 없으면 달·직원과 함께 넣어 새 id를 받는다', async () => {
    const { client, calls } = fakeClient(okWith([]), okWith(LINE_ROW))
    const fresh = { ...LINE, id: null, adjust: -50000, adjustReason: 'deduct' as const, adjustMemo: ' 지각 ' }
    await createStaffStore(client).savePayLine(fresh)
    const values = { amounts: LINE.amounts, incentives: LINE.incentives, adjust: -50000, adjust_reason: 'deduct', adjust_memo: '지각' }
    expect(calls).toEqual([
      ['from', 'staff_pay_lines'],
      ['update', values],
      ['eq', 'month', '2026-11'],
      ['eq', 'staff_id', M1],
      ['select', LINE_COLUMNS],
      ['from', 'staff_pay_lines'],
      ['insert', { month: '2026-11', staff_id: M1, ...values }],
      ['select', LINE_COLUMNS],
      ['single'],
    ])
  })

  it('AC-7610.1: 줄이 틀리면(금액이 정수 아님·음수·조정 한도 밖·id도 직원도 없음) 보내지 않는다', async () => {
    const { client, calls } = fakeClient()
    for (const line of [
      { ...LINE, amounts: { base: 1000.5 } },
      { ...LINE, amounts: { base: -1 } },
      { ...LINE, adjust: -100000001 },
      { ...LINE, id: null, staffId: null },
      { ...LINE, month: '2026-1' },
    ]) {
      await caught(() => createStaffStore(client).savePayLine(line), 'E-STAFF-SAVE-FAILED')
    }
    expect(calls).toEqual([])
  })
})

describe('AC-7610.1 급여 달 줄 listPayMonths·savePayMonth', () => {
  const MONTH_ROW = { month: '2026-11', employer_cost: 2150000, cost_saved_on: '2026-11-20', copied_on: '2026-11-02' }
  const PAY_MONTH = { month: '2026-11', employerCost: 2150000, costSavedOn: '2026-11-20', copiedOn: '2026-11-02' }

  it('AC-7610.1: 그 달들을 읽고 틀린 줄(병원 부담분 음수)은 버린다', async () => {
    const { client, calls } = fakeClient(okWith([MONTH_ROW, { ...MONTH_ROW, month: '2026-10', employer_cost: -1 }]))
    await expect(createStaffStore(client).listPayMonths('2026-06', '2026-11')).resolves.toEqual([PAY_MONTH])
    expect(calls).toEqual([
      ['from', 'staff_pay_months'],
      ['select', MONTH_COLUMNS],
      ['gte', 'month', '2026-06'],
      ['lte', 'month', '2026-11'],
      ['order', 'month', ASC],
      ['range', 0, 999],
    ])
  })

  it('AC-7610.1: 저장은 그 달 줄의 세 칸을 고치고, 없으면 달과 함께 넣는다. 음수는 보내지 않는다', async () => {
    const { client, calls } = fakeClient(okWith([]), okWith(MONTH_ROW))
    await expect(createStaffStore(client).savePayMonth(PAY_MONTH)).resolves.toEqual(PAY_MONTH)
    const values = { employer_cost: 2150000, cost_saved_on: '2026-11-20', copied_on: '2026-11-02' }
    expect(calls).toEqual([
      ['from', 'staff_pay_months'],
      ['update', values],
      ['eq', 'month', '2026-11'],
      ['select', MONTH_COLUMNS],
      ['from', 'staff_pay_months'],
      ['insert', { month: '2026-11', ...values }],
      ['select', MONTH_COLUMNS],
      ['single'],
    ])
    const bad = fakeClient()
    await caught(() => createStaffStore(bad.client).savePayMonth({ ...PAY_MONTH, employerCost: -1 }), 'E-STAFF-SAVE-FAILED')
    expect(bad.calls).toEqual([])
    await caught(() => createStaffStore(fakeClient(okWith([]), failure()).client).savePayMonth(PAY_MONTH), 'E-STAFF-SAVE-FAILED')
  })
})
