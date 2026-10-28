import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

// 진짜 Postgres(PGlite, WASM)에서 운영자가 SQL 편집기에 붙일 migration 파일을 그대로 실행하고 RLS를 확인한다.
// Supabase가 미리 갖춘 것(역할·auth 스키마·auth.uid()·auth.jwt()·새 표와 함수의 기본 권한)만 아래에서 흉내 낸다
const MIGRATION = readFileSync(
  fileURLToPath(new URL('./migrations/20261028000000_auth.sql', import.meta.url)),
  'utf-8',
)

const SUPABASE_MOCK = `
  create role anon nologin;
  create role authenticated nologin;
  grant usage on schema public to anon, authenticated;
  -- Supabase는 public에 새로 만든 표·함수에 anon·authenticated 모든 권한을 준다(migration이 거둬야 한다)
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;

  create schema auth;
  grant usage on schema auth to anon, authenticated;
  create table auth.users (id uuid primary key, email text);
  create function auth.jwt() returns jsonb language sql stable
    as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
`

const A = '00000000-0000-4000-8000-00000000000a'
const B = '00000000-0000-4000-8000-00000000000b'
const C = '00000000-0000-4000-8000-00000000000c'
const EMAIL: Record<string, string> = { [A]: 'a@fake.test', [B]: 'b@fake.test', [C]: 'c@fake.test' }
const MISSING = '00000000-0000-4000-8000-0000000000ff'

type Status = 'pending' | 'approved' | 'rejected'

// PGlite 첫 실행(WASM 불러오기)이 느린 PC·CI에서도 흔들리지 않게
const SLOW = { timeout: 30_000 }
let db: PGlite

beforeAll(async () => {
  db = await PGlite.create()
  await db.exec(SUPABASE_MOCK)
  await db.exec(MIGRATION)
}, 30_000)

// 시험마다 빈 표에서 시작한다. 운영자(superuser)는 RLS를 건너뛴다
beforeEach(async () => {
  await operator()
  await db.exec('truncate auth.users cascade')
  await db.query(`insert into auth.users (id, email) values ($1, $2), ($3, $4), ($5, $6)`, [
    A,
    EMAIL[A],
    B,
    EMAIL[B],
    C,
    EMAIL[C],
  ])
})

async function operator() {
  await db.exec('reset role; reset request.jwt.claims')
}

// 로그인 토큰: sub = uid, email = 구글 계정 이메일
async function become(user: string) {
  await operator()
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: user, email: EMAIL[user] })])
  await db.exec('set role authenticated')
}

async function becomeAnon() {
  await operator()
  await db.exec('set role anon')
}

async function rows(sql: string, params: unknown[] = []) {
  return (await db.query<Record<string, unknown>>(sql, params)).rows
}

// 운영자가 SQL 편집기에서 병원 줄을 만든 것과 같다. 병원 id를 돌려준다
async function addHospital(owner: string, status: Status) {
  await operator()
  const [row] = await rows(
    `insert into public.hospitals (owner_id, name, applicant_name, email, status)
     values ($1, '가짜병원', '홍길동', $2, $3) returning id`,
    [owner, EMAIL[owner], status],
  )
  return row.id as string
}

// 처음 관리자는 운영자가 SQL 편집기로 넣는다
async function addAdmin(user: string) {
  await operator()
  await db.query('insert into public.admins (user_id) values ($1)', [user])
}

async function hospitalState(id: string) {
  await operator()
  const [row] = await rows('select status, reviewed_at from public.hospitals where id = $1', [id])
  return row as { status: Status; reviewed_at: Date | null }
}

const SIGNUP = `insert into public.hospitals (name, applicant_name, phone) values ('가짜병원', '홍길동', '01012345678')`
const SET_STATUS = 'select public.set_hospital_status($1, $2)'
const DENIED = /permission denied/
const CHECK = /check constraint/

describe('AC-006.1 로그인 안 한 사용자(anon)는 hospitals·admins를 읽지도 쓰지도 못한다', SLOW, () => {
  it('anon에게 준 표 권한이 하나도 없다', async () => {
    const grants = await rows(
      `select table_name, privilege_type from information_schema.role_table_grants
       where grantee = 'anon' and table_schema = 'public'`,
    )
    expect(grants).toEqual([])
    const columns = await rows(
      `select table_name, column_name from information_schema.column_privileges
       where grantee = 'anon' and table_schema = 'public'`,
    )
    expect(columns).toEqual([])
  })

  it('두 표 모두 읽기·넣기·고치기·지우기가 거부되고 줄은 그대로다', async () => {
    const id = await addHospital(A, 'pending')
    await addAdmin(B)
    await becomeAnon()
    for (const table of ['public.hospitals', 'public.admins']) {
      await expect(db.query(`select * from ${table}`)).rejects.toThrow(DENIED)
      await expect(db.query(`delete from ${table}`)).rejects.toThrow(DENIED)
    }
    await expect(db.query(SIGNUP)).rejects.toThrow(DENIED)
    await expect(db.query(`update public.hospitals set status = 'approved'`)).rejects.toThrow(DENIED)
    await expect(db.query('insert into public.admins (user_id) values ($1)', [C])).rejects.toThrow(DENIED)
    await expect(db.query('update public.admins set user_id = $1', [C])).rejects.toThrow(DENIED)
    expect(await hospitalState(id)).toMatchObject({ status: 'pending' })
    expect(await rows('select user_id from public.admins')).toEqual([{ user_id: B }])
  })
})

describe('AC-006.2 로그인한 사용자는 자기 병원 줄만 보고, 가입 신청은 정해 둔 칸만 넣는다', SLOW, () => {
  it('A는 자기 병원 줄만 보고 B의 줄은 안 보인다', async () => {
    await addHospital(A, 'pending')
    await addHospital(B, 'approved')
    await become(A)
    expect(await rows('select owner_id from public.hospitals')).toEqual([{ owner_id: A }])
    expect(await rows('select id from public.hospitals where owner_id = $1', [B])).toEqual([])
  })

  it('이름·신청자·연락처만 넣으면 owner_id는 내 uid, email은 토큰 이메일, status는 pending으로 들어간다', async () => {
    await become(A)
    const inserted = await rows(
      `${SIGNUP} returning owner_id, name, applicant_name, phone, email, status, reviewed_at`,
    )
    expect(inserted).toEqual([
      {
        owner_id: A,
        name: '가짜병원',
        applicant_name: '홍길동',
        phone: '01012345678',
        email: EMAIL[A],
        status: 'pending',
        reviewed_at: null,
      },
    ])
  })

  it('연락처는 비워 둘 수 있다', async () => {
    await become(A)
    const inserted = await rows(
      `insert into public.hospitals (name, applicant_name) values ('가짜병원', '홍길동') returning phone`,
    )
    expect(inserted).toEqual([{ phone: null }])
  })

  it('넣을 수 있는 칸은 name·applicant_name·phone뿐이다', async () => {
    const insertable = await rows(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'hospitals'
         and has_column_privilege('authenticated', 'public.hospitals', column_name, 'INSERT')
       order by column_name`,
    )
    expect(insertable).toEqual([{ column_name: 'applicant_name' }, { column_name: 'name' }, { column_name: 'phone' }])
  })

  // 남의 계정·승인 상태·이메일·신청 날짜를 꾸미지 못하게. 기본값으로만 들어간다
  it.each([
    ['owner_id', `'${B}'`],
    ['status', `'approved'`],
    ['email', `'b@fake.test'`],
    ['id', `'${MISSING}'`],
    ['agreed_at', `'2020-01-01'`],
    ['reviewed_at', `'2020-01-01'`],
    ['created_at', `'2020-01-01'`],
  ])('%s를 직접 넣으면 거부되고 줄이 생기지 않는다', async (column, value) => {
    await become(A)
    await expect(
      db.query(`insert into public.hospitals (name, applicant_name, ${column}) values ('가짜병원', '홍길동', ${value})`),
    ).rejects.toThrow(DENIED)
    await operator()
    expect(await rows('select id from public.hospitals')).toEqual([])
  })

  it.each(['', ' ', ' 가짜병원', '가짜병원 ', '가'.repeat(51)])("병원 이름 '%s'는 거부된다", async (name) => {
    await become(A)
    await expect(
      db.query(`insert into public.hospitals (name, applicant_name) values ($1, '홍길동')`, [name]),
    ).rejects.toThrow(CHECK)
  })

  it.each(['', ' ', ' 홍길동', '홍길동 ', '가'.repeat(31)])("신청자 이름 '%s'는 거부된다", async (applicant) => {
    await become(A)
    await expect(
      db.query(`insert into public.hospitals (name, applicant_name) values ('가짜병원', $1)`, [applicant]),
    ).rejects.toThrow(CHECK)
  })

  it('병원 이름 50자·신청자 이름 30자(바이트 아님)까지 된다', async () => {
    await become(A)
    const inserted = await rows(
      `insert into public.hospitals (name, applicant_name) values ($1, $2) returning name, applicant_name`,
      ['가'.repeat(50), '가'.repeat(30)],
    )
    expect(inserted).toEqual([{ name: '가'.repeat(50), applicant_name: '가'.repeat(30) }])
  })

  it.each(['', '01012345', '010123456789', '010-1234-5678', '0101234567a', '０１０１２３４５６７８'])(
    "연락처 '%s'는 거부된다",
    async (phone) => {
      await become(A)
      await expect(
        db.query(`insert into public.hospitals (name, applicant_name, phone) values ('가짜병원', '홍길동', $1)`, [phone]),
      ).rejects.toThrow(CHECK)
    },
  )

  it.each(['021234567', '01012345678'])("연락처 '%s'(숫자 9~11자리)는 된다", async (phone) => {
    await become(A)
    const inserted = await rows(
      `insert into public.hospitals (name, applicant_name, phone) values ('가짜병원', '홍길동', $1) returning phone`,
      [phone],
    )
    expect(inserted).toEqual([{ phone }])
  })

  it('status는 pending·approved·rejected만 된다(운영자도)', async () => {
    await operator()
    await expect(
      db.query(
        `insert into public.hospitals (owner_id, name, applicant_name, email, status)
         values ($1, '가짜병원', '홍길동', $2, 'banned')`,
        [A, EMAIL[A]],
      ),
    ).rejects.toThrow(CHECK)
  })
})

describe('AC-006.3 사용자는 자기 병원 줄을 고치거나 지우지 못하고, 줄은 하나만 만든다', SLOW, () => {
  it('update·delete·upsert가 거부되고 status는 그대로다', async () => {
    const id = await addHospital(A, 'pending')
    await become(A)
    await expect(db.query(`update public.hospitals set status = 'approved' where id = $1`, [id])).rejects.toThrow(DENIED)
    await expect(db.query(`update public.hospitals set name = '다른병원' where id = $1`, [id])).rejects.toThrow(DENIED)
    await expect(db.query('delete from public.hospitals where id = $1', [id])).rejects.toThrow(DENIED)
    await expect(db.query(`${SIGNUP} on conflict (owner_id) do update set status = 'approved'`)).rejects.toThrow(DENIED)
    expect(await hospitalState(id)).toEqual({ status: 'pending', reviewed_at: null })
  })

  it('거절된 사용자도 스스로 대기로 되돌리지 못한다', async () => {
    const id = await addHospital(A, 'rejected')
    await become(A)
    await expect(db.query(`update public.hospitals set status = 'pending' where id = $1`, [id])).rejects.toThrow(DENIED)
    expect(await hospitalState(id)).toMatchObject({ status: 'rejected' })
  })

  it('두 번째 줄은 거부된다(계정당 병원 하나)', async () => {
    await become(A)
    await db.query(SIGNUP)
    await expect(db.query(SIGNUP)).rejects.toThrow(/duplicate key|unique/)
    await operator()
    expect(await rows('select owner_id from public.hospitals')).toEqual([{ owner_id: A }])
  })

  it('authenticated 표 권한은 hospitals 읽기, admins 읽기뿐이다(hospitals 넣기는 칸 단위)', async () => {
    const grants = await rows(
      `select table_name, privilege_type from information_schema.role_table_grants
       where grantee = 'authenticated' and table_schema = 'public' order by table_name, privilege_type`,
    )
    expect(grants).toEqual([
      { table_name: 'admins', privilege_type: 'SELECT' },
      { table_name: 'hospitals', privilege_type: 'SELECT' },
    ])
  })
})

describe('AC-006.4 관리자는 모든 병원 줄을 보고, admins 표는 자기 줄만 읽으며 아무도 쓰지 못한다', SLOW, () => {
  it('관리자는 모든 병원 줄이 보인다', async () => {
    await addHospital(A, 'approved')
    await addHospital(B, 'pending')
    await addHospital(C, 'rejected')
    await addAdmin(A)
    await become(A)
    expect(await rows('select owner_id from public.hospitals order by owner_id')).toEqual([
      { owner_id: A },
      { owner_id: B },
      { owner_id: C },
    ])
  })

  it('관리자가 아닌 사용자는 admins 표에서 아무 줄도 안 보인다', async () => {
    await addAdmin(A)
    await become(B)
    expect(await rows('select user_id from public.admins')).toEqual([])
  })

  it('관리자는 admins 표에서 자기 줄만 본다', async () => {
    await addAdmin(A)
    await addAdmin(B)
    await become(A)
    expect(await rows('select user_id from public.admins')).toEqual([{ user_id: A }])
  })

  it('관리자도 일반 사용자도 admins 표에 넣기·고치기·지우기를 못 한다', async () => {
    await addAdmin(A)
    for (const user of [A, B]) {
      await become(user)
      await expect(db.query('insert into public.admins (user_id) values ($1)', [C])).rejects.toThrow(DENIED)
      await expect(db.query('update public.admins set user_id = $1', [C])).rejects.toThrow(DENIED)
      await expect(db.query('delete from public.admins')).rejects.toThrow(DENIED)
    }
    await operator()
    expect(await rows('select user_id from public.admins')).toEqual([{ user_id: A }])
  })

  it('관리자도 병원 줄을 직접 고치거나 지우지 못한다(승인 함수로만)', async () => {
    const id = await addHospital(B, 'pending')
    await addAdmin(A)
    await become(A)
    await expect(db.query(`update public.hospitals set status = 'approved' where id = $1`, [id])).rejects.toThrow(DENIED)
    await expect(db.query('delete from public.hospitals where id = $1', [id])).rejects.toThrow(DENIED)
    expect(await hospitalState(id)).toEqual({ status: 'pending', reviewed_at: null })
  })
})

describe('AC-006.5 관리자가 아니면 set_hospital_status가 오류를 내고 아무 줄도 바뀌지 않는다', SLOW, () => {
  it('남의 병원을 승인하려 하면 42501 오류', async () => {
    const id = await addHospital(B, 'pending')
    await become(A)
    await expect(db.query(SET_STATUS, [id, 'approved'])).rejects.toMatchObject({ code: '42501' })
    expect(await hospitalState(id)).toEqual({ status: 'pending', reviewed_at: null })
  })

  it('자기 병원을 승인하거나 되돌리려 해도 42501 오류', async () => {
    const pending = await addHospital(A, 'pending')
    const rejected = await addHospital(B, 'rejected')
    await become(A)
    await expect(db.query(SET_STATUS, [pending, 'approved'])).rejects.toMatchObject({ code: '42501' })
    await become(B)
    await expect(db.query(SET_STATUS, [rejected, 'pending'])).rejects.toMatchObject({ code: '42501' })
    expect(await hospitalState(pending)).toEqual({ status: 'pending', reviewed_at: null })
    expect(await hospitalState(rejected)).toEqual({ status: 'rejected', reviewed_at: null })
  })
})

describe('AC-006.6 관리자는 set_hospital_status로 정해 둔 바꿈만 하고 reviewed_at이 기록된다', SLOW, () => {
  it.each([
    ['pending', 'approved'],
    ['pending', 'rejected'],
    ['rejected', 'pending'],
  ] as const)('%s → %s는 되고 reviewed_at이 기록된다', async (from, to) => {
    const id = await addHospital(B, from)
    await addAdmin(A)
    await become(A)
    await db.query(SET_STATUS, [id, to])
    const state = await hospitalState(id)
    expect(state.status).toBe(to)
    expect(state.reviewed_at).toBeInstanceOf(Date)
  })

  it.each([
    ['approved', 'rejected'],
    ['approved', 'pending'],
    ['approved', 'approved'],
    ['pending', 'pending'],
    ['rejected', 'approved'],
    ['rejected', 'rejected'],
    ['pending', 'banned'],
  ] as const)('%s → %s는 오류가 나고 줄은 그대로다', async (from, to) => {
    const id = await addHospital(B, from)
    await addAdmin(A)
    await become(A)
    await expect(db.query(SET_STATUS, [id, to])).rejects.toThrow()
    expect(await hospitalState(id)).toEqual({ status: from, reviewed_at: null })
  })

  it('없는 병원이면 오류가 난다', async () => {
    await addAdmin(A)
    await become(A)
    await expect(db.query(SET_STATUS, [MISSING, 'approved'])).rejects.toThrow()
  })

  it('한 병원만 바뀌고 다른 병원 줄은 그대로다', async () => {
    const target = await addHospital(B, 'pending')
    const other = await addHospital(C, 'pending')
    await addAdmin(A)
    await become(A)
    await db.query(SET_STATUS, [target, 'approved'])
    expect(await hospitalState(target)).toMatchObject({ status: 'approved' })
    expect(await hospitalState(other)).toEqual({ status: 'pending', reviewed_at: null })
  })
})

describe('AC-006.7 모든 표에 RLS가 켜져 있고, 함수는 security definer·빈 search_path·authenticated 전용이다', SLOW, () => {
  it('public의 모든 표에 RLS가 켜져 있다', async () => {
    const tables = await rows(
      `select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' order by relname`,
    )
    expect(tables).toEqual([
      { relname: 'admins', relrowsecurity: true },
      { relname: 'hospitals', relrowsecurity: true },
    ])
  })

  it('set_hospital_status는 security definer이고 search_path가 비어 있다', async () => {
    const fns = await rows(
      `select prosecdef, proconfig from pg_proc where pronamespace = 'public'::regnamespace and proname = 'set_hospital_status'`,
    )
    expect(fns).toEqual([{ prosecdef: true, proconfig: ['search_path=""'] }])
  })

  it('실행 권한은 authenticated에만 있고 anon·PUBLIC에는 없다', async () => {
    const fn = 'public.set_hospital_status(uuid, text)'
    const [privileges] = await rows(
      `select has_function_privilege('authenticated', $1, 'execute') as authenticated,
              has_function_privilege('anon', $1, 'execute') as anon`,
      [fn],
    )
    expect(privileges).toEqual({ authenticated: true, anon: false })
    const grantees = await rows(
      `select coalesce(nullif(a.grantee, 0)::regrole::text, 'PUBLIC') as grantee
       from pg_proc p, aclexplode(p.proacl) a
       where p.oid = $1::regprocedure and a.grantee <> p.proowner and a.privilege_type = 'EXECUTE'
       order by 1`,
      [fn],
    )
    expect(grantees).toEqual([{ grantee: 'authenticated' }])
  })

  it('anon이 부르면 거부되고 줄은 그대로다', async () => {
    const id = await addHospital(A, 'pending')
    await becomeAnon()
    await expect(db.query(SET_STATUS, [id, 'approved'])).rejects.toThrow(DENIED)
    expect(await hospitalState(id)).toEqual({ status: 'pending', reviewed_at: null })
  })
})
