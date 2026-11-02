import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it } from 'vitest'
import { ourClinicPhrases } from '@/lib/precheck/memo'

// 우리 병원 설정을 넣는 SQL(AC-014.7, design.md 19-3·8-4). 운영자가 SQL 편집기에 붙여 넣는 글을 진짜 Postgres(PGlite)에서 돌려 같은 값을 읽는다

const SCRIPT = fileURLToPath(new URL('../../scripts/precheck/our-clinic-settings.mjs', import.meta.url))
const HOSPITAL = '00000000-0000-4000-8000-0000000000a1'
const OTHER = '00000000-0000-4000-8000-0000000000a2'
const AUTH = readFileSync(fileURLToPath(new URL('../../supabase/migrations/20261028000000_auth.sql', import.meta.url)), 'utf-8')
const SETTINGS = readFileSync(fileURLToPath(new URL('../../supabase/migrations/20261030000000_precheck_settings.sql', import.meta.url)), 'utf-8')
const MOCK = `
  create role anon nologin;
  create role authenticated nologin;
  grant usage on schema public to anon, authenticated;
  create schema auth;
  grant usage on schema auth to anon, authenticated;
  create table auth.users (id uuid primary key, email text);
  create function auth.jwt() returns jsonb language sql stable as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
`

const run = (id: string) => execFileSync(process.execPath, [SCRIPT, id], { encoding: 'utf-8' })

async function database() {
  const db = await PGlite.create()
  await db.exec(MOCK)
  await db.exec(AUTH)
  await db.exec(SETTINGS)
  await db.exec(`insert into auth.users (id, email) values ('${HOSPITAL}', 'a@fake.test'), ('${OTHER}', 'b@fake.test');`)
  await db.exec(`insert into public.hospitals (id, owner_id, name, applicant_name, email, status) values ('${HOSPITAL}', '${HOSPITAL}', '가상의원', '가상이름', 'a@fake.test', 'approved'), ('${OTHER}', '${OTHER}', '가상의원둘', '가상이름', 'b@fake.test', 'approved');`)
  return db
}

type Row = { hospital_id: string; phrases: unknown; dx_links: unknown }
const rowsOf = async (db: PGlite) => (await db.query<Row>('select hospital_id, phrases, dx_links from public.claim_hospital_settings order by hospital_id')).rows

describe('AC-014.7 scripts/precheck/our-clinic-settings.mjs', { timeout: 60_000 }, () => {
  it('AC-014.7: 출력한 SQL을 돌리면 ourClinicPhrases와 같은 값을 읽는다', async () => {
    const db = await database()
    await db.exec(run(HOSPITAL))
    expect(await rowsOf(db)).toEqual([{ hospital_id: HOSPITAL, phrases: ourClinicPhrases(), dx_links: [] }])
  })

  it('AC-014.7: 다시 돌려도 문구 칸만 바꾸고 상병 연결표와 다른 병원 줄은 그대로 둔다', async () => {
    const db = await database()
    await db.exec(`insert into public.claim_hospital_settings (hospital_id, phrases, dx_links) values ('${HOSPITAL}', '{}'::jsonb, '[["A","B","",0,"s"]]'::jsonb), ('${OTHER}', '{"x":1}'::jsonb, '[]'::jsonb);`)
    await db.exec(run(HOSPITAL))
    await db.exec(run(HOSPITAL))
    expect(await rowsOf(db)).toEqual([
      { hospital_id: HOSPITAL, phrases: ourClinicPhrases(), dx_links: [['A', 'B', '', 0, 's']] },
      { hospital_id: OTHER, phrases: { x: 1 }, dx_links: [] },
    ])
  })

  it('AC-014.7: 값 감싸기가 design.md 8-4와 같다', () => {
    const sql = run(HOSPITAL)
    expect(sql.split('\n')[0]).toBe('set standard_conforming_strings = on;')
    expect(sql).toMatch(/^begin;$/m)
    expect(sql).toMatch(/^commit;$/m)
    expect(sql).toContain(`'${HOSPITAL}'::uuid`)
    expect(sql).toMatch(/'::jsonb/)
    expect(sql).not.toMatch(/E'|\$\$/)
  })

  it.each(['', 'not-a-uuid', `${HOSPITAL}'; select 1; --`])('AC-014.7: 병원 ID가 틀리면(%s) SQL을 내지 않고 멈춘다', (id) => {
    const result = spawnSync(process.execPath, [SCRIPT, id], { encoding: 'utf-8' })
    expect(result.status).not.toBe(0)
    expect(result.stdout).toBe('')
  })

  it('AC-014.7: 인자가 없으면 멈춘다', () => {
    const result = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf-8' })
    expect(result.status).not.toBe(0)
    expect(result.stdout).toBe('')
  })

  it('AC-014.7: 출력에 환자 정보가 없다(가상환자·차트번호 모양 없음)', () => {
    const sql = run(HOSPITAL)
    expect(sql).not.toMatch(/가상환자/)
    expect(sql).not.toMatch(/\b9\d{5}\b/)
  })
})
