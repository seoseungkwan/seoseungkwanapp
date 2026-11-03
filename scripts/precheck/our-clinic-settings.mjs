#!/usr/bin/env node
// 우리 병원 설정을 서버 줄로 넣는 SQL을 출력한다(TASK-14, design.md 19-3). 운영자가 SQL 편집기에 붙여 넣는다. 운영 DB에 직접 넣지 않는다. 환자 정보가 없다.
//   node scripts/precheck/our-clinic-settings.mjs <병원 ID(uuid)>
// 값은 src/lib/precheck/memo/의 JSON 두 벌이고 ourClinicPhrases()와 같다(시험이 PGlite에서 돌려 본다). 값 감싸기는 design.md 8-4: 작은따옴표만 두 번 쓰고 뒤에 칸 종류를 붙인다.
// 상병 연결표(dx_links)는 건드리지 않는다
import { readFileSync } from 'node:fs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const readJson = (name) => JSON.parse(readFileSync(new URL(`../../src/lib/precheck/memo/${name}`, import.meta.url), 'utf-8'))

const id = process.argv[2] ?? ''
if (!UUID.test(id)) {
  console.error('쓰는 법: node scripts/precheck/our-clinic-settings.mjs <병원 ID(uuid)>')
  process.exit(1)
}

const defaults = readJson('defaults.json')
const { procedureDrugs } = readJson('ourClinic.json')
const phrases = JSON.stringify({ ...defaults, procedureDrugs })
if (phrases.includes('\\u0000')) throw new Error('설정 값에 NUL이 있으면 Postgres가 받지 못한다')
const quote = (value) => `'${value.replaceAll("'", "''")}'`

console.log(`set standard_conforming_strings = on;
begin;
insert into public.claim_hospital_settings (hospital_id, phrases)
values (${quote(id)}::uuid, ${quote(phrases)}::jsonb)
on conflict (hospital_id) do update set phrases = excluded.phrases, updated_at = now();
commit;`)
