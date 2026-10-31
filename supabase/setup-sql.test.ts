import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite, type Results } from '@electric-sql/pglite'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

// 운영자가 SQL 편집기에 붙일 두 파일(e2e-accounts.sql·first-admin.sql)을 진짜 Postgres(PGlite, WASM)에서 그대로 돌린다.
// 마이그레이션도 실제 파일을 먼저 돌린다. Supabase가 미리 갖춘 것은 rls.test.ts처럼 흉내 내되, auth.users에는
// 이 SQL이 보는 칸(raw_app_meta_data·email_confirmed_at)을 더한다
const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf-8')
const MIGRATION = read('./migrations/20261028000000_auth.sql')
const E2E_ACCOUNTS = './e2e-accounts.sql'
const FIRST_ADMIN = './first-admin.sql'

const SUPABASE_MOCK = `
  create role anon nologin;
  create role authenticated nologin;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;

  create schema auth;
  grant usage on schema auth to anon, authenticated;
  create table auth.users (
    id uuid primary key,
    email text,
    raw_app_meta_data jsonb not null default '{}',
    email_confirmed_at timestamptz
  );
  create function auth.jwt() returns jsonb language sql stable
    as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
`

// 대시보드 Add user(이메일)로 만든 시험 계정 4개와 구글로 들어온 운영자. 주소는 가짜다
const ADMIN = '00000000-0000-4000-8000-0000000000a1'
const APPROVED = '00000000-0000-4000-8000-0000000000a2'
const PENDING = '00000000-0000-4000-8000-0000000000a3'
const NEW = '00000000-0000-4000-8000-0000000000a4'
const OPERATOR = '00000000-0000-4000-8000-0000000000b1'
const OTHER = '00000000-0000-4000-8000-0000000000b2'

type Provider = 'email' | 'google'

const SLOW = { timeout: 30_000 }
let db: PGlite

beforeAll(async () => {
  db = await PGlite.create()
  await db.exec(SUPABASE_MOCK)
  await db.exec(MIGRATION)
}, 30_000)

beforeEach(async () => {
  await db.exec('truncate auth.users cascade')
  await addUser(ADMIN, 'tester+e2e-admin@fake.test', 'email')
  await addUser(APPROVED, 'tester+e2e-approved@fake.test', 'email')
  await addUser(PENDING, 'tester+e2e-pending@fake.test', 'email')
  await addUser(NEW, 'tester+e2e-new-long-address-check@fake.test', 'email')
  await addUser(OPERATOR, 'tester@fake.test', 'google')
})

async function addUser(id: string, email: string, provider: Provider, confirmed = true) {
  await db.query(
    `insert into auth.users (id, email, raw_app_meta_data, email_confirmed_at)
     values ($1, $2, $3, case when $4 then now() end)`,
    [id, email, JSON.stringify({ provider, providers: [provider] }), confirmed],
  )
}

async function rows(sql: string, params: unknown[] = []) {
  return (await db.query<Record<string, unknown>>(sql, params)).rows
}

// 운영자가 SQL 편집기에서 파일 전체를 붙여 Run 한 것과 같다. 마지막 결과 표를 돌려준다
async function run(file: string): Promise<Results<Record<string, unknown>>> {
  const results = await db.exec(read(file))
  return results[results.length - 1] as Results<Record<string, unknown>>
}

async function addHospital(owner: string, name: string, status: 'pending' | 'approved' | 'rejected') {
  await db.query(
    `insert into public.hospitals (owner_id, name, applicant_name, phone, email, status, reviewed_at)
     select $1, $2, '홍길동', '01012345678', u.email, $3, case when $3 = 'pending' then null else now() end
       from auth.users u where u.id = $1`,
    [owner, name, status],
  )
}

async function addAdmin(user: string) {
  await db.query('insert into public.admins (user_id) values ($1)', [user])
}

// 바뀐 것이 하나도 없는지 볼 때 쓴다: 두 표의 모든 칸(날짜 포함)
async function snapshot() {
  return {
    hospitals: await rows('select * from public.hospitals order by owner_id'),
    admins: await rows('select * from public.admins order by user_id'),
  }
}

// 계정마다 병원 줄과 관리자 여부(날짜는 있음/없음만)
async function accountState(user: string) {
  const [hospital] = await rows(
    `select name, applicant_name, phone, email, status, reviewed_at is not null as reviewed
       from public.hospitals where owner_id = $1`,
    [user],
  )
  const [admin] = await rows('select 1 from public.admins where user_id = $1', [user])
  return { hospital: hospital ?? null, admin: admin !== undefined }
}

async function e2eState() {
  return {
    admin: await accountState(ADMIN),
    approved: await accountState(APPROVED),
    pending: await accountState(PENDING),
    new: await accountState(NEW),
  }
}

const EXPECTED_E2E = {
  admin: {
    hospital: {
      name: 'E2E 관리자 의원',
      applicant_name: 'E2E 시험',
      phone: null,
      email: 'tester+e2e-admin@fake.test',
      status: 'approved',
      reviewed: true,
    },
    admin: true,
  },
  approved: {
    hospital: {
      name: 'E2E 승인 의원',
      applicant_name: 'E2E 시험',
      phone: null,
      email: 'tester+e2e-approved@fake.test',
      status: 'approved',
      reviewed: true,
    },
    admin: false,
  },
  pending: {
    hospital: {
      name: 'E2E 대기 의원',
      applicant_name: 'E2E 시험',
      phone: null,
      email: 'tester+e2e-pending@fake.test',
      status: 'pending',
      reviewed: false,
    },
    admin: false,
  },
  new: { hospital: null, admin: false },
}

// 오류로 멈출 때: 문구에 이메일이 없고, 두 표가 실행 전과 같아야 한다
async function expectRejectedWithoutChange(file: string, message: RegExp[]) {
  const before = await snapshot()
  const error = await run(file).then(
    () => null,
    (e: unknown) => e as Error,
  )
  expect(error, '오류로 멈춰야 한다').toBeInstanceOf(Error)
  for (const m of message) expect(error!.message).toMatch(m)
  expect(error!.message).not.toContain('@')
  expect(await snapshot()).toEqual(before)
}

describe('AC-004.1 e2e-accounts.sql은 이메일 앞부분 표시로 시험 계정 4개를 찾아 병원·관리자 줄을 맞춘다', SLOW, () => {
  it('관리자·승인됨은 approved, 승인 대기는 pending(reviewed_at 없음), 신청 전은 병원 줄 없음, admins에는 관리자만', async () => {
    await run(E2E_ACCOUNTS)
    expect(await e2eState()).toEqual(EXPECTED_E2E)
  })

  it('구글로 들어온 계정은 이메일 앞부분에 표시가 있어도 시험 계정으로 세지 않는다', async () => {
    await addUser(OTHER, 'tester+e2e-admin-google@fake.test', 'google')
    await run(E2E_ACCOUNTS)
    expect(await e2eState()).toEqual(EXPECTED_E2E)
    expect(await accountState(OTHER)).toEqual({ hospital: null, admin: false })
  })
})

describe('AC-004.2 e2e-accounts.sql을 다시 실행하면 처음과 같고, E2E 아닌 줄은 건드리지 않는다', SLOW, () => {
  it('두 번 실행해도 결과가 같다', async () => {
    await run(E2E_ACCOUNTS)
    await run(E2E_ACCOUNTS)
    expect(await e2eState()).toEqual(EXPECTED_E2E)
    expect(await rows('select count(*)::int as n from public.hospitals')).toEqual([{ n: 3 }])
  })

  it('어지럽힌 상태(거절됨·이름 바뀜·신청 전 줄 생김·관리자 줄 더함·관리자 줄 빠짐)를 처음 상태로 되돌린다', async () => {
    await run(E2E_ACCOUNTS)
    await db.exec(`
      update public.hospitals set status = 'rejected', reviewed_at = now() where owner_id = '${PENDING}';
      update public.hospitals set status = 'rejected', name = '바뀐 이름', phone = '01099998888' where owner_id = '${APPROVED}';
      delete from public.admins where user_id = '${ADMIN}';
      insert into public.admins (user_id) values ('${APPROVED}'), ('${PENDING}'), ('${NEW}');
    `)
    await addHospital(NEW, '신청 전이 넣은 병원', 'pending')
    await run(E2E_ACCOUNTS)
    expect(await e2eState()).toEqual(EXPECTED_E2E)
  })

  it('E2E 계정이 아닌 사용자의 병원·관리자 줄은 바뀌지 않는다', async () => {
    await addUser(OTHER, 'someone@fake.test', 'email')
    await addHospital(OPERATOR, '진짜 의원', 'approved')
    await addHospital(OTHER, '다른 의원', 'rejected')
    await addAdmin(OPERATOR)
    const others = async () => ({
      hospitals: await rows(`select * from public.hospitals where owner_id in ($1, $2) order by owner_id`, [OPERATOR, OTHER]),
      admins: await rows(`select * from public.admins where user_id in ($1, $2) order by user_id`, [OPERATOR, OTHER]),
    })
    const before = await others()
    await run(E2E_ACCOUNTS)
    await run(E2E_ACCOUNTS)
    expect(await others()).toEqual(before)
    expect(before.hospitals).toHaveLength(2)
    expect(before.admins).toHaveLength(1)
  })
})

describe('AC-004.3 계정이 없음·둘·이메일 확인 안 됨이면 역할 이름과 고치는 법을 담은 오류로 멈추고 아무 줄도 바꾸지 않는다', SLOW, () => {
  // 앞 역할(관리자·승인됨)의 줄을 이미 바꿀 차례가 지난 뒤에 멈춰도 되돌아가는지 보려고 어지럽힌 상태에서 시작한다
  async function messUp() {
    await addHospital(APPROVED, '바뀐 이름', 'rejected')
    await addHospital(NEW, '신청 전이 넣은 병원', 'pending')
    await addAdmin(APPROVED)
  }

  it('승인 대기 계정이 없으면 멈춘다', async () => {
    await db.query('delete from auth.users where id = $1', [PENDING])
    await messUp()
    await expectRejectedWithoutChange(E2E_ACCOUNTS, [/승인 대기/, /e2e-pending/, /Authentication → Users/, /Auto Confirm/])
  })

  it('관리자 표시에 이메일 계정이 2개면 멈춘다', async () => {
    await addUser(OTHER, 'tester+e2e-admin2@fake.test', 'email')
    await messUp()
    await expectRejectedWithoutChange(E2E_ACCOUNTS, [/관리자/, /e2e-admin/, /2개 이상/, /Authentication → Users/])
  })

  it('신청 전 계정의 이메일 확인이 안 됐으면(Auto Confirm 안 함) 멈춘다', async () => {
    await db.query('update auth.users set email_confirmed_at = null where id = $1', [NEW])
    await messUp()
    await expectRejectedWithoutChange(E2E_ACCOUNTS, [/신청 전/, /e2e-new/, /Authentication → Users/, /Auto Confirm/])
  })
})

describe('AC-004.4 first-admin.sql은 구글로 들어온 E2E 아닌 계정이 정확히 하나이고 병원 줄이 있을 때만 관리자 + 승인한다', SLOW, () => {
  it('운영자 구글 계정을 admins에 넣고 그 병원을 approved(reviewed_at 기록)로 바꾼다', async () => {
    await addHospital(OPERATOR, '진짜 의원', 'pending')
    await run(FIRST_ADMIN)
    expect(await accountState(OPERATOR)).toEqual({
      hospital: {
        name: '진짜 의원',
        applicant_name: '홍길동',
        phone: '01012345678',
        email: 'tester@fake.test',
        status: 'approved',
        reviewed: true,
      },
      admin: true,
    })
  })

  it('거절된 병원도 approved로 바꾼다', async () => {
    await addHospital(OPERATOR, '진짜 의원', 'rejected')
    await run(FIRST_ADMIN)
    expect(await accountState(OPERATOR)).toMatchObject({ hospital: { status: 'approved', reviewed: true }, admin: true })
  })

  it('두 번 실행해도 결과가 같다(이미 승인이면 reviewed_at 그대로)', async () => {
    await addHospital(OPERATOR, '진짜 의원', 'pending')
    await run(FIRST_ADMIN)
    const first = await snapshot()
    await run(FIRST_ADMIN)
    expect(await snapshot()).toEqual(first)
  })

  it('E2E 시험 계정 줄은 건드리지 않고, 그 뒤 e2e-accounts.sql을 다시 돌려도 운영자는 관리자로 남는다', async () => {
    await run(E2E_ACCOUNTS)
    await addHospital(OPERATOR, '진짜 의원', 'pending')
    const e2eBefore = await rows(
      `select * from public.hospitals where owner_id <> $1 order by owner_id`,
      [OPERATOR],
    )
    await run(FIRST_ADMIN)
    expect(await rows(`select * from public.hospitals where owner_id <> $1 order by owner_id`, [OPERATOR])).toEqual(
      e2eBefore,
    )
    expect(await e2eState()).toEqual(EXPECTED_E2E)
    await run(E2E_ACCOUNTS)
    expect(await accountState(OPERATOR)).toMatchObject({ hospital: { status: 'approved' }, admin: true })
  })

  it('이메일 앞부분에 e2e- 표시가 있는 구글 계정은 운영자로 세지 않고 건드리지 않는다', async () => {
    await addUser(OTHER, 'tester+e2e-approved-google@fake.test', 'google')
    await addHospital(OTHER, 'E2E 다른 의원', 'pending')
    await addHospital(OPERATOR, '진짜 의원', 'pending')
    const result = await run(FIRST_ADMIN)
    expect(result.rows).toHaveLength(1)
    expect(await accountState(OPERATOR)).toMatchObject({ hospital: { status: 'approved', reviewed: true }, admin: true })
    expect(await accountState(OTHER)).toEqual({
      hospital: {
        name: 'E2E 다른 의원',
        applicant_name: '홍길동',
        phone: '01012345678',
        email: 'tester+e2e-approved-google@fake.test',
        status: 'pending',
        reviewed: false,
      },
      admin: false,
    })
  })

  it('구글 계정이 둘이면 멈추고 아무것도 바꾸지 않는다', async () => {
    await addUser(OTHER, 'someone@fake.test', 'google')
    await addHospital(OPERATOR, '진짜 의원', 'pending')
    await expectRejectedWithoutChange(FIRST_ADMIN, [/2개/, /Claude에게 알려 주세요/])
  })

  it('구글 계정이 없으면 멈추고 아무것도 바꾸지 않는다', async () => {
    await db.query('delete from auth.users where id = $1', [OPERATOR])
    await run(E2E_ACCOUNTS)
    await expectRejectedWithoutChange(FIRST_ADMIN, [/0개/, /Claude에게 알려 주세요/])
  })

  it('운영자 병원 줄이 없으면 멈추고 아무것도 바꾸지 않는다', async () => {
    await run(E2E_ACCOUNTS)
    await expectRejectedWithoutChange(FIRST_ADMIN, [/가입 신청/])
  })
})

describe('AC-004.5 마지막 결과 표에는 역할·병원 상태·관리자 여부만 있고, 파일에 이메일 주소·비밀번호·열쇠가 없다', SLOW, () => {
  it('e2e-accounts.sql 결과 표: 역할·병원 상태·관리자 칸, 4줄, 이메일 없음', async () => {
    const result = await run(E2E_ACCOUNTS)
    expect(result.fields.map((f) => f.name)).toEqual(['역할', '병원 상태', '관리자'])
    expect(result.rows).toEqual([
      { 역할: '관리자', '병원 상태': 'approved', 관리자: '예' },
      { 역할: '승인됨', '병원 상태': 'approved', 관리자: '아니요' },
      { 역할: '승인 대기', '병원 상태': 'pending', 관리자: '아니요' },
      { 역할: '신청 전', '병원 상태': '없음', 관리자: '아니요' },
    ])
    expect(JSON.stringify(result.rows)).not.toContain('@')
  })

  it('first-admin.sql 결과 표: 역할·병원 상태·관리자 칸, 1줄(운영자·approved·예), 이메일 없음', async () => {
    await addHospital(OPERATOR, '진짜 의원', 'pending')
    const result = await run(FIRST_ADMIN)
    expect(result.fields.map((f) => f.name)).toEqual(['역할', '병원 상태', '관리자'])
    expect(result.rows).toEqual([{ 역할: '운영자', '병원 상태': 'approved', 관리자: '예' }])
    expect(JSON.stringify(result.rows)).not.toContain('@')
  })

  it.each([E2E_ACCOUNTS, FIRST_ADMIN])('%s 안에 이메일 주소 모양·비밀번호·열쇠가 없다', (file) => {
    const text = read(file)
    expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.-]+/)
    expect(text).not.toMatch(/password|비밀번호/i)
    expect(text).not.toMatch(/sb_(publishable|secret)_|eyJ[\w-]{10,}|service_role/)
  })
})
