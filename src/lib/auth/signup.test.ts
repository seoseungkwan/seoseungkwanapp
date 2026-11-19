import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { EMR_KINDS, type EmrKind } from '@/types/clinicProfile'
import { validateSignup, type SignupInput, type SignupValue } from './signup'

const MESSAGES = {
  // ui-90 AC-419.3: 칸 이름표는 "의원 이름"(옛 "병원 이름")
  nameEmpty: '의원 이름을 적어 주세요.',
  nameLong: '의원 이름은 50자까지 적을 수 있어요.',
  applicantEmpty: '신청자 이름을 적어 주세요.',
  applicantLong: '신청자 이름은 30자까지 적을 수 있어요.',
  phone: '연락처는 숫자 9~11자리로 적어 주세요.',
  agreed: '가입 신청을 보내려면 동의에 체크해 주세요.',
  emr: '쓰는 EMR을 골라 주세요.', // emr-signup AC-7302.1
}

const VALID: SignupInput = { name: '가나 정형외과의원', applicantName: '홍길동', phone: '010-1234-5678', agreed: true, emr: 'bit' }
const input = (patch: Partial<SignupInput>): SignupInput => ({ ...VALID, ...patch })

function okValue(i: SignupInput): SignupValue {
  const result = validateSignup(i)
  if (!result.ok) throw new Error(`통과해야 하는데 막힘: ${JSON.stringify(result.errors)}`)
  return result.value
}
function errorsOf(i: SignupInput) {
  const result = validateSignup(i)
  if (result.ok) throw new Error(`막혀야 하는데 통과: ${JSON.stringify(result.value)}`)
  return result.errors
}

// 한 글자가 UTF-16 두 칸(서로게이트 쌍)인 글자: 한자 확장 B, 그림 문자
const EXT_B = '𠀀'
const EMOJI = '👍'

describe('validateSignup(): 가입 신청 값 검사', () => {
  it('AC-004.1: 맞는 값이면 ok + DB에 넣을 값(의원 이름·신청자 이름·숫자만 남긴 연락처)', () => {
    expect(validateSignup(VALID)).toEqual({
      ok: true,
      value: { name: '가나 정형외과의원', applicant_name: '홍길동', phone: '01012345678', emr: 'bit' },
    })
  })

  it('AC-004.1: 의원 이름은 앞뒤 공백을 뺀다(가운데 띄어쓰기는 둔다)', () => {
    expect(okValue(input({ name: '  가나 정형외과의원  ' })).name).toBe('가나 정형외과의원')
    expect(okValue(input({ name: '\t가나　정형외과\n' })).name).toBe('가나　정형외과')
    expect(okValue(input({ name: '　가나의원 ' })).name).toBe('가나의원')
  })

  it('AC-004.1·AC-419.3: 의원 이름이 비었거나 공백뿐이면 "의원 이름을 적어 주세요."', () => {
    for (const name of ['', ' ', '   \t\n', '　']) {
      expect(errorsOf(input({ name })), JSON.stringify(name)).toEqual({ name: MESSAGES.nameEmpty })
    }
  })

  it('AC-004.1·AC-419.3: 의원 이름은 공백을 뺀 뒤 1~50자(50자 통과, 51자 막힘 → "의원 이름은 50자까지 적을 수 있어요.")', () => {
    expect(okValue(input({ name: '가' })).name).toBe('가')
    expect(okValue(input({ name: '가'.repeat(50) })).name).toBe('가'.repeat(50))
    expect(okValue(input({ name: `  ${'가'.repeat(50)}  ` })).name).toBe('가'.repeat(50))
    expect(errorsOf(input({ name: '가'.repeat(51) }))).toEqual({ name: MESSAGES.nameLong })
  })

  it('AC-004.1·AC-419.3: 의원 이름 글자 수는 코드포인트로 센다(두 칸 글자 50개 통과, 51개 막힘)', () => {
    expect(okValue(input({ name: EXT_B.repeat(50) })).name).toBe(EXT_B.repeat(50))
    expect(errorsOf(input({ name: EXT_B.repeat(51) }))).toEqual({ name: MESSAGES.nameLong })
  })

  it('AC-004.1: 신청자 이름은 1~30자이고 코드포인트로 센다', () => {
    expect(okValue(input({ applicantName: '김' })).applicant_name).toBe('김')
    expect(okValue(input({ applicantName: '김'.repeat(30) })).applicant_name).toBe('김'.repeat(30))
    expect(errorsOf(input({ applicantName: '김'.repeat(31) }))).toEqual({ applicantName: MESSAGES.applicantLong })
    // UTF-16으로는 60칸이지만 30자다
    expect(okValue(input({ applicantName: EMOJI.repeat(30) })).applicant_name).toBe(EMOJI.repeat(30))
    expect(errorsOf(input({ applicantName: EXT_B.repeat(31) }))).toEqual({ applicantName: MESSAGES.applicantLong })
  })

  it('AC-004.1: 신청자 이름도 앞뒤 공백을 빼고 센다(DB가 앞뒤 공백을 받지 않는다)', () => {
    expect(okValue(input({ applicantName: '  홍길동 ' })).applicant_name).toBe('홍길동')
    expect(okValue(input({ applicantName: ` ${'김'.repeat(30)} ` })).applicant_name).toBe('김'.repeat(30))
    for (const applicantName of ['', '  ', '　']) {
      expect(errorsOf(input({ applicantName })), JSON.stringify(applicantName)).toEqual({
        applicantName: MESSAGES.applicantEmpty,
      })
    }
  })

  it('AC-004.1: 연락처는 비워도 된다(빈칸·공백뿐이면 null)', () => {
    expect(okValue(input({ phone: '' })).phone).toBeNull()
    expect(okValue(input({ phone: '   ' })).phone).toBeNull()
  })

  it('AC-004.1: 연락처는 공백·"-"를 뺀 숫자 9~11자리만 남긴다', () => {
    expect(okValue(input({ phone: '010-1234-5678' })).phone).toBe('01012345678')
    expect(okValue(input({ phone: '010 1234 5678' })).phone).toBe('01012345678')
    expect(okValue(input({ phone: ' 02-123-4567 ' })).phone).toBe('021234567')
    expect(okValue(input({ phone: '031-1234-5678' })).phone).toBe('03112345678')
    expect(okValue(input({ phone: '123456789' })).phone).toBe('123456789')
    expect(okValue(input({ phone: '12345678901' })).phone).toBe('12345678901')
  })

  it('AC-004.1: 연락처가 8자리 이하·12자리 이상이거나 숫자·공백·"-" 밖의 글자가 있으면 막는다', () => {
    for (const phone of [
      '12345678',
      '123456789012',
      '010-1234-567a',
      '(02)123-4567',
      '+82-10-1234-5678',
      '010.1234.5678',
      '---',
      '０１０１２３４５６７８', // 전각 숫자
      '٠١٠١٢٣٤٥٦٧٨', // 아랍 숫자
    ]) {
      expect(errorsOf(input({ phone })), phone).toEqual({ phone: MESSAGES.phone })
    }
  })

  it('AC-004.1: 동의는 꼭 체크해야 한다', () => {
    expect(errorsOf(input({ agreed: false }))).toEqual({ agreed: MESSAGES.agreed })
  })

  it('AC-004.1·AC-419.3: 틀린 칸마다 그 칸의 문구를 돌려준다(맞는 칸은 없다)', () => {
    expect(errorsOf({ name: ' ', applicantName: '', phone: '123', agreed: false, emr: 'bit' })).toEqual({
      name: MESSAGES.nameEmpty,
      applicantName: MESSAGES.applicantEmpty,
      phone: MESSAGES.phone,
      agreed: MESSAGES.agreed,
    })
    expect(errorsOf(input({ name: '가'.repeat(51), phone: '1' }))).toEqual({
      name: MESSAGES.nameLong,
      phone: MESSAGES.phone,
    })
  })

  it('AC-004.1: 받은 값을 바꾸지 않는다', () => {
    const i = input({ name: '  가나  ', phone: '010-1234-5678' })
    const copy = { ...i }
    validateSignup(i)
    expect(i).toEqual(copy)
  })

  it('AC-419.3·AC-419.6: 칸 오류 글의 이름표는 "의원 이름"이고 어떤 문구에도 "병원 이름"·"니다."가 없다(신청자·연락처·동의 문구는 그대로)', () => {
    const all = Object.values({
      ...errorsOf({ name: '', applicantName: '', phone: '1', agreed: false, emr: 'bit' }),
      ...errorsOf(input({ name: '가'.repeat(51), applicantName: '가'.repeat(31) })),
    })
    expect(all).toEqual([MESSAGES.nameLong, MESSAGES.applicantLong, MESSAGES.phone, MESSAGES.agreed])
    expect(errorsOf(input({ name: '' })).name).toBe('의원 이름을 적어 주세요.')
    for (const message of [...all, MESSAGES.nameEmpty, MESSAGES.applicantEmpty]) {
      expect(message).not.toContain('병원 이름')
      expect(message).not.toContain('니다.')
    }
  })
})

describe('validateSignup(): 쓰는 EMR (emr-signup REQ-7302)', () => {
  it('AC-7302.1: emr이 null이면 errors.emr = "쓰는 EMR을 골라 주세요."이고 ok가 아니다(다른 칸이 맞아도)', () => {
    expect(validateSignup(input({ emr: null }))).toEqual({ ok: false, errors: { emr: MESSAGES.emr } })
  })

  it.each(EMR_KINDS)('AC-7302.1: emr이 %s(넷 중 하나)이면 통과한 값에 emr이 그대로 실린다', (emr) => {
    expect(validateSignup(input({ emr }))).toEqual({
      ok: true,
      value: { name: '가나 정형외과의원', applicant_name: '홍길동', phone: '01012345678', emr },
    })
  })

  it('AC-7302.1: 넷 밖 값이 섞여 와도 통과시키지 않는다(고르지 않은 것과 같은 문구)', () => {
    for (const emr of ['', 'BIT', 'ubcare', undefined] as unknown as EmrKind[]) {
      expect(errorsOf(input({ emr })), String(emr)).toEqual({ emr: MESSAGES.emr })
    }
  })

  it('AC-7302.1: 여러 칸이 틀리면 emr 오류도 함께 돌려주고 다른 칸 검사·문구는 그대로다', () => {
    expect(errorsOf({ name: '', applicantName: '', phone: '1', agreed: false, emr: null })).toEqual({
      name: MESSAGES.nameEmpty,
      applicantName: MESSAGES.applicantEmpty,
      phone: MESSAGES.phone,
      agreed: MESSAGES.agreed,
      emr: MESSAGES.emr,
    })
    expect(errorsOf(input({ name: '가'.repeat(51), emr: null }))).toEqual({ name: MESSAGES.nameLong, emr: MESSAGES.emr })
  })

  it('AC-7302.1: emr 문구에도 "니다."가 없다', () => {
    expect(MESSAGES.emr).not.toContain('니다.')
  })
})

// 실제 Postgres(PGlite)에서 migration의 검사 제약(check)과 맞는지 본다. 운영자(superuser)로 넣어 RLS·열 권한은 건너뛴다(권한은 supabase/rls.test.ts)
const MIGRATION = readFileSync(
  fileURLToPath(new URL('../../../supabase/migrations/20261028000000_auth.sql', import.meta.url)),
  'utf-8',
)
// migration이 기대하는 Supabase 기본 구성(역할·auth 스키마)만 흉내 낸다
const SUPABASE_MOCK = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.jwt() returns jsonb language sql stable
    as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
`
const OWNER = '00000000-0000-4000-8000-00000000000a'
let db: PGlite

beforeAll(async () => {
  db = await PGlite.create()
  await db.exec(SUPABASE_MOCK)
  await db.exec(MIGRATION)
  await db.query('insert into auth.users (id, email) values ($1, $2)', [OWNER, 'a@fake.test'])
}, 30_000)

afterAll(async () => {
  await db?.close()
})

// 검사 제약(23514)에 걸리면 false. 그 밖의 오류는 시험이 잘못된 것이라 던진다
async function dbAccepts(v: SignupValue): Promise<boolean> {
  try {
    await db.query(
      'insert into public.hospitals (owner_id, email, name, applicant_name, phone) values ($1, $2, $3, $4, $5)',
      [OWNER, 'a@fake.test', v.name, v.applicant_name, v.phone],
    )
  } catch (error) {
    if ((error as { code?: string }).code === '23514') return false
    throw error
  }
  await db.exec('delete from public.hospitals')
  return true
}

describe('validateSignup(): DB 검사 제약과 같은 결과', () => {
  it('AC-004.1: 통과시킨 값은 실제 DB 검사 제약도 통과한다', { timeout: 30_000 }, async () => {
    const inputs: SignupInput[] = [
      VALID,
      input({ phone: '' }),
      input({ name: `\t ${'가'.repeat(50)}　`, applicantName: ` ${EMOJI.repeat(30)}\n`, phone: ' 02 123-4567 ' }),
      input({ name: ` ${EXT_B.repeat(50)} `, applicantName: '　김　', phone: '12345678901' }),
      input({ name: 'é 의원', applicantName: '한　글', phone: '   ' }),
    ]
    for (const i of inputs) {
      expect(await dbAccepts(okValue(i)), JSON.stringify(i)).toBe(true)
    }
  })

  it('AC-004.1: 이미 다듬어진 값은 DB가 받을 때만 통과시킨다(경계에서 DB와 어긋나지 않는다)', { timeout: 30_000 }, async () => {
    const names = ['가', '가'.repeat(50), '가'.repeat(51), EXT_B.repeat(50), EXT_B.repeat(51), 'é'.repeat(25), 'é'.repeat(26)]
    const applicants = ['김', '김'.repeat(30), '김'.repeat(31), EMOJI.repeat(30), EMOJI.repeat(31)]
    const phones = ['123456789', '12345678', '12345678901', '123456789012', '０１２３４５６７８９', '٠١٢٣٤٥٦٧٨٩']
    const cases: SignupValue[] = [
      ...names.map((name) => ({ name, applicant_name: '김', phone: null, emr: 'bit' as const })),
      ...applicants.map((applicant_name) => ({ name: '가', applicant_name, phone: null, emr: 'bit' as const })),
      ...phones.map((phone) => ({ name: '가', applicant_name: '김', phone, emr: 'bit' as const })),
    ]
    for (const v of cases) {
      const result = validateSignup({ name: v.name, applicantName: v.applicant_name, phone: v.phone ?? '', agreed: true, emr: v.emr })
      expect(result.ok, JSON.stringify(v)).toBe(await dbAccepts(v))
      if (result.ok) expect(result.value).toEqual(v)
    }
  })
})
