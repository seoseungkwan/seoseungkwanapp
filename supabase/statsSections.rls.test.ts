import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { MonthPayload } from '@/types/payload'

// 진짜 Postgres(PGlite, WASM)에서 인증 → 통계 → 세 칸(sections) 마이그레이션 파일을 차례로 그대로 돌리고
// 새 칸·제약·권한·RLS·완전한 줄 지키기 트리거를 확인한다(spec stats-bit-ai REQ-2902). 지금 통계 표 시험(stats-rls.test.ts)은 그대로 둔다.
// Supabase가 미리 갖춘 것(역할·auth 스키마·기본 권한)만 rls.test.ts처럼 흉내 낸다. 실제 Supabase에는 붙지 않는다
const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf-8')
const AUTH_MIGRATION = './migrations/20261028000000_auth.sql'
const STATS_MIGRATION = './migrations/20261101000200_stats.sql'
const SECTIONS_MIGRATION = './migrations/20261109000000_stats_month_sections.sql'

const SUPABASE_MOCK = `
  create role anon nologin;
  create role authenticated nologin;
  grant usage on schema public to anon, authenticated;
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

const A = '00000000-0000-4000-8000-00000000000a' // 승인된 병원 A
const B = '00000000-0000-4000-8000-00000000000b' // 승인된 다른 병원 B
const PENDING = '00000000-0000-4000-8000-00000000000c' // 승인 대기
const STATUS: Record<string, string> = { [A]: 'approved', [B]: 'approved', [PENDING]: 'pending' }

const SLOW = { timeout: 30_000 }
const DENIED = /permission denied/
const CHECK = /check constraint/
const MONTH = '2026-10'
const OTHER_MONTH = '2026-09'
const MAX_BYTES = 65_536

function payload(month: string, partial: boolean): MonthPayload {
  return {
    schemaVersion: 2,
    quality: 'valid',
    month,
    partial,
    totals: { patients: 1, newPatients: 0, returning: 1, unknown: 0 },
    rx: [],
    groups: [],
    revisit: { cohort: 0, within7: null, within14: null },
    regions: [],
  }
}

// 저장 모양 MonthSections(design.md)와 같은 꼴의 가짜 값. 이름은 모두 지어낸 것이다
function sections(month: string, partial: boolean, people = 12): Record<string, unknown> {
  return {
    v: 1,
    month,
    partial,
    mix: {
      people,
      age: [{ name: '40대', people }],
      insurance: [{ name: '건강보험', people }],
      town: [{ name: '가상동', people }],
    },
    hours: { openDays: [4, 4, 4, 4, 4, 4, 0], weekdays: [9, 8, 7, 6, 5, 4, 0], hours: Array(13).fill(3), unknown: 0 },
    doctors: [{ name: '김가상', patients: people, newPatients: 2, amount: 1_234_500 }],
  }
}

function without(value: Record<string, unknown>, key: string) {
  return Object.fromEntries(Object.entries(value).filter(([name]) => name !== key))
}

let db: PGlite
let hospital: Record<string, string>

beforeAll(async () => {
  db = await PGlite.create()
  await db.exec(SUPABASE_MOCK)
  await db.exec(read(AUTH_MIGRATION))
  await db.exec(read(STATS_MIGRATION))
  await db.exec(read(SECTIONS_MIGRATION))
}, 30_000)

// 시험마다 빈 표에서 시작한다. auth.users를 비우면 병원·통계 줄도 같이 비워진다
beforeEach(async () => {
  await operator()
  await db.exec('truncate auth.users cascade')
  hospital = {}
  for (const [user, status] of Object.entries(STATUS)) {
    await db.query('insert into auth.users (id, email) values ($1, $2)', [user, `${user}@fake.test`])
    const [row] = await rows(
      `insert into public.hospitals (owner_id, name, applicant_name, email, status)
       values ($1, '가짜병원', '가짜신청자', $2, $3) returning id`,
      [user, `${user}@fake.test`, status],
    )
    hospital[user] = row.id as string
  }
})

async function operator() {
  await db.exec('reset role; reset request.jwt.claims')
}

async function become(user: string) {
  await operator()
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: user })])
  await db.exec('set role authenticated')
}

async function becomeAnon() {
  await operator()
  await db.exec('set role anon')
}

async function rows(sql: string, params: unknown[] = []) {
  return (await db.query<Record<string, unknown>>(sql, params)).rows
}

// JSON 값은 글자로 펴서 보낸다. SQL NULL(칸이 비었음)은 null 그대로다 — JSON null('null')과 다르다
const json = (value: unknown) => JSON.stringify(value)

// 운영자(RLS를 건너뜀)가 줄을 심는다
async function seed(owner: string, month: string, partial: boolean, value: string | null) {
  await operator()
  await db.query(
    `insert into public.stats_months (hospital_id, month, partial, source, payload, sections)
     values ($1, $2, $3, 'bit', $4::jsonb, $5::jsonb)`,
    [hospital[owner], month, partial, json(payload(month, partial)), value],
  )
}

async function storedSections(owner: string, month: string) {
  await operator()
  const [row] = await rows(`select partial, sections from public.stats_months where hospital_id = $1 and month = $2`, [
    hospital[owner],
    month,
  ])
  return row
}

// PostgREST upsert가 만드는 문장 꼴: 보낸 칸 모두(열쇠 칸도)를 DO UPDATE SET에 넣는다. 칸은 lib/storage가 보낼 그대로다
function upsert(month: string, partial: boolean, value: string | null) {
  return db.query(
    `insert into public.stats_months (month, partial, source, payload, sections) values ($1, $2, 'bit', $3::jsonb, $4::jsonb)
     on conflict (hospital_id, month) do update set month = excluded.month, partial = excluded.partial,
       source = excluded.source, payload = excluded.payload, sections = excluded.sections`,
    [month, partial, json(payload(month, partial)), value],
  )
}

// 표가 재는 글자(jsonb::text)로 꼭 bytes바이트가 되는 sections
async function sectionsOfBytes(bytes: number) {
  const base = sections(MONTH, false)
  const [{ size }] = await rows(`select octet_length($1::jsonb::text)::int as size`, [json({ ...base, pad: '' })])
  const fit = { ...base, pad: 'x'.repeat(bytes - (size as number)) }
  const [{ exact }] = await rows(`select octet_length($1::jsonb::text)::int as exact`, [json(fit)])
  expect(exact).toBe(bytes)
  return fit
}

describe('AC-2902.1 stats_months의 새 칸 sections·제약·권한', SLOW, () => {
  it('AC-2902.1 stats_months 맨 뒤에 빈 값을 받는 jsonb 칸 sections가 더해진다', async () => {
    const cols = await rows(
      `select column_name, data_type, is_nullable from information_schema.columns
       where table_schema = 'public' and table_name = 'stats_months' order by ordinal_position`,
    )
    expect(cols.map((col) => col.column_name)).toEqual(['hospital_id', 'month', 'partial', 'source', 'payload', 'updated_at', 'sections'])
    expect(cols).toContainEqual({ column_name: 'sections', data_type: 'jsonb', is_nullable: 'YES' })
  })

  it('AC-2902.1 로그인 사용자의 넣기·고치기 권한에 sections가 더해지고 표 권한·anon 권한은 그대로다', async () => {
    const written = await rows(
      `select privilege_type, column_name from information_schema.column_privileges
       where grantee = 'authenticated' and table_schema = 'public' and table_name = 'stats_months'
         and privilege_type in ('INSERT', 'UPDATE')
       order by privilege_type, column_name`,
    )
    const line = (privilege_type: string) =>
      ['month', 'partial', 'payload', 'sections', 'source'].map((column_name) => ({ privilege_type, column_name }))
    expect(written).toEqual([...line('INSERT'), ...line('UPDATE')])
    const tableGrants = await rows(
      `select privilege_type from information_schema.role_table_grants
       where grantee = 'authenticated' and table_schema = 'public' and table_name = 'stats_months'`,
    )
    expect(tableGrants).toEqual([{ privilege_type: 'SELECT' }])
    const anon = await rows(
      `select column_name from information_schema.column_privileges where grantee = 'anon' and table_schema = 'public'
       union all select table_name from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public'`,
    )
    expect(anon).toEqual([])
  })

  it('AC-2902.1 RLS·정책 셋·완전한 줄 지키기 트리거는 그대로다', async () => {
    const [table] = await rows(`select relrowsecurity from pg_class where oid = 'public.stats_months'::regclass`)
    expect(table).toEqual({ relrowsecurity: true })
    const policies = await rows(`select policyname from pg_policies where schemaname = 'public' and tablename = 'stats_months' order by policyname`)
    expect(policies.map((p) => p.policyname)).toEqual(['내 병원 달 숫자 고치기', '내 병원 달 숫자 넣기', '내 병원 달 숫자 읽기'])
    const triggers = await rows(
      `select tgname from pg_trigger where tgrelid = 'public.stats_months'::regclass and not tgisinternal order by tgname`,
    )
    expect(triggers).toEqual([{ tgname: 'stats_months_keep_complete' }])
  })

  it('AC-2902.1 sections를 보내지 않거나 빈 값으로 보내면 지금처럼 들어가고 칸은 빈 값이다', async () => {
    await become(A)
    await db.query(`insert into public.stats_months (month, partial, source, payload) values ($1, false, 'bit', $2::jsonb)`, [
      MONTH,
      json(payload(MONTH, false)),
    ])
    await upsert(OTHER_MONTH, true, null)
    expect(await storedSections(A, MONTH)).toEqual({ partial: false, sections: null })
    expect(await storedSections(A, OTHER_MONTH)).toEqual({ partial: true, sections: null })
  })

  it('AC-2902.1 내 병원 줄에 맞는 sections를 넣고(PostgREST upsert 꼴) 다시 보내면 고쳐진다', async () => {
    await become(A)
    await upsert(MONTH, true, json(sections(MONTH, true, 12)))
    expect(await storedSections(A, MONTH)).toEqual({ partial: true, sections: sections(MONTH, true, 12) })
    await become(A)
    await upsert(MONTH, false, json(sections(MONTH, false, 30)))
    expect(await storedSections(A, MONTH)).toEqual({ partial: false, sections: sections(MONTH, false, 30) })
  })

  it('AC-2902.1 다 불러온 줄을 sections 없이(빈 값) 다시 보내면 옛 sections가 남지 않는다', async () => {
    await seed(A, MONTH, false, json(sections(MONTH, false)))
    await become(A)
    await upsert(MONTH, false, null)
    expect(await storedSections(A, MONTH)).toEqual({ partial: false, sections: null })
  })

  it('AC-2902.1 sections는 65,536바이트까지 되고 1바이트라도 넘으면 거부한다(글자 수가 아니라 바이트)', async () => {
    const fit = await sectionsOfBytes(MAX_BYTES)
    const over = await sectionsOfBytes(MAX_BYTES + 1)
    await become(A)
    await expect(upsert(MONTH, false, json(over))).rejects.toThrow(CHECK)
    await upsert(MONTH, false, json(fit))
    expect((await storedSections(A, MONTH)).sections).toEqual(fit)
    // 한글은 한 글자가 3바이트다: 글자 수로는 한도 안이어도 바이트로 넘으면 거부한다
    const base = await sectionsOfBytes(MAX_BYTES - 30_000)
    const korean = { ...base, pad: `${base.pad as string}${'가'.repeat(10_001)}` }
    await become(A)
    await expect(upsert(OTHER_MONTH, false, json({ ...korean, month: OTHER_MONTH }))).rejects.toThrow(CHECK)
  })

  it('AC-2902.1 마이그레이션을 두 번 붙여 넣어도 오류 없이 그대로다', async () => {
    await seed(A, MONTH, false, json(sections(MONTH, false)))
    await operator()
    await expect(db.exec(read(SECTIONS_MIGRATION))).resolves.toBeDefined()
    const checks = await rows(
      `select conname from pg_constraint where conrelid = 'public.stats_months'::regclass and contype = 'c'
         and pg_get_constraintdef(oid) like '%sections%'`,
    )
    expect(checks).toHaveLength(1)
    expect(await storedSections(A, MONTH)).toEqual({ partial: false, sections: sections(MONTH, false) })
  })

  it('AC-2902.1 마이그레이션 머리말이 사용자가 허락한 뒤 SQL 편집기에서 붙이고 통계 마이그레이션 다음이라고 적는다', () => {
    const head = read(SECTIONS_MIGRATION).split('\n').slice(0, 12).join('\n')
    expect(head).toContain('SQL Editor')
    expect(head).toContain('20261101000200_stats.sql')
    expect(head).toContain('사용자 OK')
  })
})

describe('AC-2902.4 완전한 줄 위에 덜 덮인 줄이면 sections도 옛 값', SLOW, () => {
  it('AC-2902.4 다 불러온 달 줄 위에 덜 덮인 같은 달을 저장하면 줄과 sections 모두 옛 값이 남는다', async () => {
    await seed(A, MONTH, false, json(sections(MONTH, false, 30)))
    await become(A)
    await upsert(MONTH, true, json(sections(MONTH, true, 5)))
    expect(await storedSections(A, MONTH)).toEqual({ partial: false, sections: sections(MONTH, false, 30) })
    // 덜 덮인 줄을 sections 없이 보내도 옛 sections가 지워지지 않는다
    await become(A)
    await upsert(MONTH, true, null)
    expect(await storedSections(A, MONTH)).toEqual({ partial: false, sections: sections(MONTH, false, 30) })
  })

  it('AC-2902.4 덜 덮인 줄 위에는 덜 덮인 줄도 다 불러온 줄도 sections와 함께 바뀐다', async () => {
    await seed(A, MONTH, true, json(sections(MONTH, true, 5)))
    await become(A)
    await upsert(MONTH, true, json(sections(MONTH, true, 7)))
    expect(await storedSections(A, MONTH)).toEqual({ partial: true, sections: sections(MONTH, true, 7) })
    await become(A)
    await upsert(MONTH, false, json(sections(MONTH, false, 9)))
    expect(await storedSections(A, MONTH)).toEqual({ partial: false, sections: sections(MONTH, false, 9) })
  })
})

describe('AC-2902.5 다른 병원·로그인 안 한 사용자·제약에 어긋난 sections', SLOW, () => {
  it('AC-2902.5 다른 병원·승인 대기 사용자는 A 줄의 sections를 읽지도 고치지도 못한다', async () => {
    await seed(A, MONTH, false, json(sections(MONTH, false)))
    for (const user of [B, PENDING]) {
      await become(user)
      expect(await rows(`select sections from public.stats_months`), user).toEqual([])
      await db.query(`update public.stats_months set sections = null where month = $1`, [MONTH])
    }
    expect(await storedSections(A, MONTH)).toEqual({ partial: false, sections: sections(MONTH, false) })
  })

  it('AC-2902.5 B가 같은 달로 sections를 넣으면 B 병원 줄이 되고 A 줄은 그대로다', async () => {
    await seed(A, MONTH, false, json(sections(MONTH, false, 30)))
    await become(B)
    await upsert(MONTH, false, json(sections(MONTH, false, 3)))
    expect(await storedSections(A, MONTH)).toEqual({ partial: false, sections: sections(MONTH, false, 30) })
    expect(await storedSections(B, MONTH)).toEqual({ partial: false, sections: sections(MONTH, false, 3) })
  })

  it('AC-2902.5 로그인 안 한 사용자(anon)는 sections를 읽지도 넣지도 고치지도 못한다', async () => {
    await seed(A, MONTH, false, json(sections(MONTH, false)))
    await becomeAnon()
    await expect(db.query(`select sections from public.stats_months`)).rejects.toThrow(DENIED)
    await expect(upsert(OTHER_MONTH, false, json(sections(OTHER_MONTH, false)))).rejects.toThrow(DENIED)
    await expect(db.query(`update public.stats_months set sections = null`)).rejects.toThrow(DENIED)
    expect(await storedSections(A, MONTH)).toEqual({ partial: false, sections: sections(MONTH, false) })
  })

  // 그 달 줄(month, partial false)과 견주어 틀린 sections. 이름표 차례는 달이 바뀌어도 같다
  function bad(month: string, other: string): Array<[string, unknown]> {
    const good = sections(month, false)
    return [
      ['배열', []],
      ['글자', 'x'],
      ['숫자', 1],
      ['JSON null', null],
      ['{}', {}],
      ['v가 2', { ...good, v: 2 }],
      ['v가 글자 1', { ...good, v: '1' }],
      ['v가 없음', without(good, 'v')],
      ['month가 줄과 다름', { ...good, month: other }],
      ['month가 없음', without(good, 'month')],
      ['partial이 줄과 다름', { ...good, partial: true }],
      ['partial이 글자', { ...good, partial: 'false' }],
      ['partial이 없음', without(good, 'partial')],
    ]
  }

  bad(MONTH, OTHER_MONTH).forEach(([label, value], index) => {
    it(`AC-2902.5 ${label}인 sections는 넣지도 고치지도 못하고 줄은 그대로다`, async () => {
      await become(A)
      await expect(upsert(MONTH, false, json(value))).rejects.toThrow(CHECK)
      await seed(A, OTHER_MONTH, false, json(sections(OTHER_MONTH, false)))
      await become(A)
      const [, changed] = bad(OTHER_MONTH, MONTH)[index]
      await expect(
        db.query(`update public.stats_months set sections = $1::jsonb where month = $2`, [json(changed), OTHER_MONTH]),
      ).rejects.toThrow(CHECK)
      expect(await storedSections(A, MONTH)).toBeUndefined()
      expect(await storedSections(A, OTHER_MONTH)).toEqual({ partial: false, sections: sections(OTHER_MONTH, false) })
    })
  })
})
