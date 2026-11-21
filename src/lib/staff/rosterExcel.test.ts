// 엑셀 올리기 읽기(staff TASK-7·TASK-20, REQ-7608 · AC-7608.1~AC-7608.7). 사람·연락처·계좌는 모두 지어낸 것이다.
// 시험 통은 SheetJS로 그 자리에서 만든다(양식 파일 public/staff/staff-template.xlsx는 머리 줄·보기 줄만 본다)
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
import { ROSTER_HEADERS, RosterExcelError, readRoster, type RosterContext, type RosterExisting, type RosterPlan } from './rosterExcel'

type Header = (typeof ROSTER_HEADERS)[number]
type Cells = Partial<Record<Header, string | number>>

const TODAY = '2026-11-21'
const TEMPLATE = join(process.cwd(), 'public', 'staff', 'staff-template.xlsx')

// 병원 정보 진료시간(월~일): 평일 점심 13:00~14:00, 토 점심 없음, 일 휴진
const WEEKDAY_HOURS = { open: 540, close: 1080, lunchFrom: 780, lunchTo: 840 }
const HOURS = [WEEKDAY_HOURS, WEEKDAY_HOURS, WEEKDAY_HOURS, WEEKDAY_HOURS, WEEKDAY_HOURS, { open: 540, close: 780, lunchFrom: null, lunchTo: null }, null]

// 오늘이 든 연차 기간 시작일을 부르는 쪽이 준다(화면은 lib/staff/leave.ts leaveStatus). 시험은 입사일 기준 올해 기념일로 둔다
const CTX: RosterContext = { today: TODAY, hours: HOURS, plans: [], periodStart: (person) => `2026-${person.hiredOn.slice(5)}` }

const HANEUL: RosterExisting = {
  id: 'm-haneul',
  name: '김하늘',
  job: '간호조무사',
  jobOther: null,
  employment: 'regular',
  weeklyHours: 40,
  hiredOn: '2021-03-02',
  leftOn: null,
  phone: '01011112222',
  birthday: '1996-04-08',
  address: '가짜시 가짜로 1',
  bank: '가짜은행',
  accountNo: '000-00-000001',
  memo: null,
  carryStart: 0,
}

const WORK = { start: 540, end: 1080, lunchFrom: 780, lunchTo: 840 }
const SAT_MORNING = { start: 540, end: 780, lunchFrom: null, lunchTo: null }
const HANEUL_WEEK = [WORK, WORK, WORK, WORK, WORK, SAT_MORNING, null]
const HANEUL_PLAN: RosterPlan = { staffId: 'm-haneul', from: '2021-03-02', week: HANEUL_WEEK, sat: '1-3' }

/** 엑셀 날짜 값(1899-12-30 = 0) */
function serial(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000
}

/** 안내·직원 두 시트 통. null 줄은 다 빈 줄 */
function book(rows: readonly (Cells | null)[], opts: { headers?: readonly string[]; sheet?: string } = {}): ArrayBuffer {
  const headers = opts.headers ?? ROSTER_HEADERS
  const aoa = [[...headers], ...rows.map((row) => (row === null ? [] : ROSTER_HEADERS.map((h) => row[h] ?? null)))]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['직원 명단 채우는 법']]), '안내')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), opts.sheet ?? '직원')
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

const person = (name: string, hiredOn: string | number, more: Cells = {}): Cells => ({ '이름*': name, '입사일*': hiredOn, ...more })
const read = (rows: readonly (Cells | null)[], existing: readonly RosterExisting[] = [], ctx: RosterContext = CTX) => readRoster(book(rows), existing, ctx)
const one = (cells: Cells, existing: readonly RosterExisting[] = [], ctx: RosterContext = CTX) => {
  const result = read([cells], existing, ctx)
  expect(result.problem).toBeNull()
  expect(result.rows).toHaveLength(1)
  return result.rows[0]
}

const FORM_PROBLEM = '양식이 달라요. [엑셀 양식 받기]로 받은 파일에 적어 주세요.'

describe('AC-7608.1 양식 — 시트 직원 첫 줄 22칸(옛 양식 21칸도)', () => {
  it('AC-7608.1: ROSTER_HEADERS는 22칸(맨 끝 넘어온 연차(일))이고 양식 파일 직원 시트 첫 줄과 같다(주민번호 칸 없음)', () => {
    expect(ROSTER_HEADERS).toEqual([
      '이름*', '직종', '근무 형태', '주 근무시간', '입사일*', '퇴사일', '연락처', '생일', '주소', '은행', '계좌번호',
      '올해 이미 쓴 연차(일)', '월', '화', '수', '목', '금', '토', '일', '토요일 격주', '메모', '넘어온 연차(일)',
    ])
    const wb = XLSX.read(readFileSync(TEMPLATE), { type: 'buffer' })
    expect(wb.SheetNames).toEqual(['안내', '직원'])
    const sheet = wb.Sheets['직원']
    const first = Array.from({ length: 30 }, (_, c) => sheet[XLSX.utils.encode_cell({ r: 0, c })]?.v ?? null)
    expect(first.slice(0, 22)).toEqual([...ROSTER_HEADERS])
    expect(first.slice(22).every((v) => v === null)).toBe(true)
    expect(ROSTER_HEADERS.some((h) => h.includes('주민'))).toBe(false)
  })

  it("AC-7608.7: 양식 파일 — 보기 줄의 '넘어온 연차(일)'은 빈칸, '안내' 시트에 '올해 이미 쓴 연차' 줄 다음 넘어온 연차 한 줄('화면 글 기본값' 그대로)", () => {
    const wb = XLSX.read(readFileSync(TEMPLATE), { type: 'buffer' })
    const sheet = wb.Sheets['직원']
    expect(sheet[XLSX.utils.encode_cell({ r: 1, c: 21 })]?.v ?? null).toBeNull()
    expect(sheet[XLSX.utils.encode_cell({ r: 1, c: 20 })]?.v).toBe('보기 줄 — 지우고 쓰세요')
    const guide = XLSX.utils.sheet_to_json<(string | number | null)[]>(wb.Sheets['안내'], { header: 1, defval: null }).map((row) => row[1] ?? null)
    const used = guide.findIndex((line) => typeof line === 'string' && line.includes("'올해 이미 쓴 연차(일)'"))
    expect(used).toBeGreaterThan(0)
    expect(guide[used + 1]).toBe(
      "'넘어온 연차(일)'(맨 끝 칸)는 못 쓴 연차를 다음 해로 넘기는 병원만 적어요. 웹앱을 쓰기 전에 이미 넘어와 있던 일수예요. 없으면 비워 두세요. 반차는 0.5, 미리 당겨 써서 모자라면 -1처럼 적어요.",
    )
  })

  it('AC-7608.1: 받은 양식을 그대로 올리면 보기 줄만 있어 넣을 줄이 없다', () => {
    expect(readRoster(readFileSync(TEMPLATE), [], CTX)).toEqual({ problem: null, rows: [] })
  })

  it('AC-7608.1: 첫 줄이 다르면(칸 빠짐·더함·이름 바뀜·순서 바뀜·시트 이름 다름) 줄을 읽지 않고 양식 안내', () => {
    const rows = [person('최민준', '2019-11-25')]
    const swapped = [...ROSTER_HEADERS]
    ;[swapped[0], swapped[1]] = [swapped[1], swapped[0]]
    const old = ROSTER_HEADERS.slice(0, 21)
    const cases: ArrayBuffer[] = [
      book(rows, { headers: ROSTER_HEADERS.slice(0, 20) }),
      book(rows, { headers: [...ROSTER_HEADERS, '주민번호'] }),
      book(rows, { headers: ROSTER_HEADERS.map((h) => (h === '이름*' ? '이름' : h)) }),
      book(rows, { headers: swapped }),
      book(rows, { sheet: 'Sheet1' }),
      // 22번째 칸 이름이 다름 · 옛 21칸의 칸 이름이 바뀜 · 옛 21칸 뒤에 다른 칸
      book(rows, { headers: [...old, '넘어온 연차'] }),
      book(rows, { headers: old.map((h) => (h === '메모' ? '비고' : h)) }),
      book(rows, { headers: [...old, '주민번호'] }),
    ]
    for (const buffer of cases) expect(readRoster(buffer, [], CTX)).toEqual({ problem: FORM_PROBLEM, rows: [] })
  })

  it('AC-7608.1: 300명까지는 읽고, 301명이면 줄을 읽지 않고 300명 안내(빈 줄·보기 줄은 세지 않는다)', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => person(`가짜${i + 1}`, '2026-01-05'))
    const example = person('김하늘', '2021-03-02', { 메모: '보기 줄 — 지우고 쓰세요' })
    const ok = read([example, null, ...many(300)])
    expect(ok.problem).toBeNull()
    expect(ok.rows).toHaveLength(300)
    expect(read(many(301))).toEqual({ problem: '한 번에 300명까지 올릴 수 있어요.', rows: [] })
  })

  it('AC-7608.1: 엑셀로 열 수 없는 파일(깨짐·암호)이면 E-STAFF-EXCEL-FAILED 오류를 던진다', () => {
    const broken = new Uint8Array(book([person('최민준', '2019-11-25')])).slice(0, 2000)
    expect(() => readRoster(broken, [], CTX)).toThrow(RosterExcelError)
    try {
      readRoster(broken, [], CTX)
    } catch (error) {
      expect((error as RosterExcelError).code).toBe('E-STAFF-EXCEL-FAILED')
    }
  })
})

describe('AC-7608.2 건너뛰는 줄 · 꼭 적을 칸', () => {
  it('AC-7608.2: 다 빈 줄과 메모가 보기 줄로 시작하는 줄은 건너뛰고, line은 엑셀 줄 번호다', () => {
    const { problem, rows } = read([
      person('김하늘', serial('2021-03-02'), { 메모: '보기 줄 — 지우고 쓰세요' }),
      null,
      person('최민준', '2019-11-25'),
      person('이도윤', '2023-07-17', { 메모: '  보기 줄' }),
      person('정유나', '2024-09-02', { 메모: '나중에 보기 줄 고치기' }),
    ])
    expect(problem).toBeNull()
    expect(rows.map((row) => [row.line, row.member.name])).toEqual([
      [4, '최민준'],
      [6, '정유나'],
    ])
    expect(rows[1].member.memo).toBe('나중에 보기 줄 고치기')
  })

  it('AC-7608.2: 이름이 비면 이름을, 입사일이 비면 입사일을 적어 달라는 문제 줄이다', () => {
    const { rows } = read([{ 직종: '간호사', '입사일*': '2026-03-02' }, { '이름*': '강다은', 직종: '간호사' }, { 연락처: '010-0000-1234' }])
    expect(rows.map((row) => [row.line, row.action, row.reason])).toEqual([
      [2, 'problem', '이름을 적어 주세요.'],
      [3, 'problem', '입사일을 적어 주세요.'],
      [4, 'problem', '이름을 적어 주세요. 입사일을 적어 주세요.'],
    ])
  })
})

describe('AC-7608.3 칸 값 읽기', () => {
  it('AC-7608.3: 날짜는 엑셀 날짜 값·2026-03-02·2026.03.02 셋 다 받는다(퇴사일·생일도, 1930년대 생일도)', () => {
    const { rows } = read([
      person('최민준', serial('2019-11-25'), { 생일: serial('1952-04-08') }),
      person('이도윤', '2023-07-17', { 생일: '1990.12.31', 퇴사일: '2026.03.02' }),
      person('정유나', '2024.09.02', { 퇴사일: serial('2026-10-31'), 생일: '1999-01-05' }),
    ])
    expect(rows.map((row) => [row.action, row.member.hiredOn, row.member.leftOn, row.member.birthday])).toEqual([
      ['new', '2019-11-25', null, '1952-04-08'],
      ['new', '2023-07-17', '2026-03-02', '1990-12-31'],
      ['new', '2024-09-02', '2026-10-31', '1999-01-05'],
    ])
  })

  it('AC-7608.3: 날짜 모양이 틀리면 그 칸 이름이 든 까닭으로 문제 줄이다', () => {
    const { rows } = read([
      person('강다은', '26년 3월'),
      person('한지우', '2026-02-02', { 퇴사일: '2026-02-30' }),
      person('박서연', '2025-01-06', { 생일: '4월 8일' }),
    ])
    expect(rows.map((row) => [row.line, row.action, row.reason])).toEqual([
      [2, 'problem', '입사일 모양이 틀렸어요. 2026-03-02처럼 적어 주세요.'],
      [3, 'problem', '퇴사일 모양이 틀렸어요. 2026-03-02처럼 적어 주세요.'],
      [4, 'problem', '생일 모양이 틀렸어요. 2026-03-02처럼 적어 주세요.'],
    ])
    expect(rows[0].raw['입사일*']).toBe('26년 3월')
    expect(rows[0].raw['이름*']).toBe('강다은')
  })

  it('AC-7608.3: 직종은 목록 안이면 그대로, 목록 밖 글자면 기타 + 그 글자, 새 사람이 비우면 기타', () => {
    const { rows } = read([
      person('최민준', '2019-11-25', { 직종: '방사선사' }),
      person('윤가람', '2026-11-02', { 직종: ' 운동처방사 ' }),
      person('한지우', '2026-02-02'),
      person('문가짜', '2026-02-03', { 직종: '기타' }),
    ])
    expect(rows.map((row) => [row.action, row.member.job, row.member.jobOther])).toEqual([
      ['new', '방사선사', null],
      ['new', '기타', '운동처방사'],
      ['new', '기타', null],
      ['new', '기타', null],
    ])
  })

  it('AC-7608.3: 근무 형태는 셋 중 하나(새 사람이 비우면 정규직), 주 근무시간 0~80 0.5 단위(새 사람이 비우면 40)', () => {
    const { rows } = read([
      person('최민준', '2019-11-25'),
      person('정유나', '2024-09-02', { '근무 형태': '파트타임', '주 근무시간': 24 }),
      person('한지우', '2026-02-02', { '근무 형태': '계약직', '주 근무시간': '37.5' }),
      person('박서연', '2025-01-06', { '근무 형태': '정규직', '주 근무시간': 0 }),
    ])
    expect(rows.map((row) => [row.action, row.member.employment, row.member.weeklyHours])).toEqual([
      ['new', 'regular', 40],
      ['new', 'part', 24],
      ['new', 'contract', 37.5],
      ['new', 'regular', 0],
    ])
    const bad = read([
      person('가짜1', '2026-01-05', { '근무 형태': '알바' }),
      person('가짜2', '2026-01-05', { '주 근무시간': 81 }),
      person('가짜3', '2026-01-05', { '주 근무시간': 37.3 }),
      person('가짜4', '2026-01-05', { '주 근무시간': '40시간' }),
    ]).rows
    expect(bad.map((row) => row.action)).toEqual(['problem', 'problem', 'problem', 'problem'])
    expect(bad[0].reason).toContain('근무 형태')
    for (const row of bad.slice(1)) expect(row.reason).toContain('주 근무시간')
  })

  it('AC-7608.3: 연락처는 숫자만 뽑아 9~11자, 계좌번호는 숫자·- 만', () => {
    const { rows } = read([
      person('최민준', '2019-11-25', { 연락처: '010-1234-5678', 계좌번호: '123-45-678901' }),
      person('이도윤', '2023-07-17', { 연락처: '02 123 4567', 계좌번호: 110123456789 }),
      person('정유나', '2024-09-02', { 연락처: '010-12' }),
      person('박서연', '2025-01-06', { 연락처: '010-1234-56789' }),
      person('한지우', '2026-02-02', { 계좌번호: '123 456 789' }),
      person('강다은', '2026-03-02', { 계좌번호: '12345' }),
    ])
    expect(rows.slice(0, 2).map((row) => [row.member.phone, row.member.accountNo])).toEqual([
      ['01012345678', '123-45-678901'],
      ['021234567', '110123456789'],
    ])
    expect(rows.slice(2).map((row) => row.action)).toEqual(['problem', 'problem', 'problem', 'problem'])
    expect(rows[2].reason).toContain('연락처')
    expect(rows[3].reason).toContain('연락처')
    expect(rows[4].reason).toContain('계좌번호')
    expect(rows[5].reason).toContain('계좌번호')
  })

  it('AC-7608.3: 올해 이미 쓴 연차는 0~50 · 0.5 단위', () => {
    const { rows } = read([
      person('최민준', '2019-11-25', { '올해 이미 쓴 연차(일)': 9.5 }),
      person('이도윤', '2023-07-17', { '올해 이미 쓴 연차(일)': '6' }),
      person('정유나', '2024-09-02', { '올해 이미 쓴 연차(일)': 0.3 }),
      person('박서연', '2025-01-06', { '올해 이미 쓴 연차(일)': 51 }),
      person('한지우', '2026-02-02', { '올해 이미 쓴 연차(일)': -1 }),
    ])
    expect(rows.slice(0, 2).map((row) => row.member.usedBefore)).toEqual([9.5, 6])
    for (const row of rows.slice(2)) {
      expect(row.action).toBe('problem')
      expect(row.reason).toContain('올해 이미 쓴 연차(일)')
    }
  })

  it('AC-7608.3: 요일 칸은 9:00-18:00·09:00-18:00 둘 다, 빈 칸은 쉼, 점심은 병원 정보 그 요일 점심(근무 안일 때)', () => {
    const row = one(
      person('최민준', '2019-11-25', { 월: '9:00-18:00', 화: '09:00-18:00', 수: '14:00-18:00', 목: '09:00 - 12:00', 금: '08:30-17:30', 토: '09:00-13:00' }),
    )
    expect(row.plan).toEqual({
      week: [
        WORK,
        WORK,
        { start: 840, end: 1080, lunchFrom: null, lunchTo: null },
        { start: 540, end: 720, lunchFrom: null, lunchTo: null },
        { start: 510, end: 1050, lunchFrom: 780, lunchTo: 840 },
        SAT_MORNING,
        null,
      ],
      sat: 'every',
    })
  })

  it('AC-7608.3: 요일 칸이 10분 단위가 아니거나 시작 ≥ 끝이거나 모양이 틀리면 그 요일 이름이 든 문제 줄', () => {
    const { rows } = read([
      person('가짜1', '2026-01-05', { 월: '09:05-18:00' }),
      person('가짜2', '2026-01-05', { 화: '18:00-09:00' }),
      person('가짜3', '2026-01-05', { 수: '9시-6시' }),
      person('가짜4', '2026-01-05', { 일: '25:00-26:00' }),
    ])
    expect(rows.map((row) => row.action)).toEqual(['problem', 'problem', 'problem', 'problem'])
    expect(rows[0].reason).toContain('월')
    expect(rows[1].reason).toContain('화')
    expect(rows[2].reason).toContain('수')
    expect(rows[3].reason).toContain('일 칸')
  })

  it('AC-7608.3: 토요일 격주는 매주·1·3주·2·4주(비면 매주), 다른 글자는 문제 줄', () => {
    const week = { 월: '09:00-18:00', 토: '09:00-13:00' }
    const { rows } = read([
      person('가짜1', '2026-01-05', week),
      person('가짜2', '2026-01-06', { ...week, '토요일 격주': '매주' }),
      person('가짜3', '2026-01-07', { ...week, '토요일 격주': '1·3주' }),
      person('가짜4', '2026-01-08', { ...week, '토요일 격주': '2·4주' }),
      person('가짜5', '2026-01-09', { ...week, '토요일 격주': '격주' }),
    ])
    expect(rows.slice(0, 4).map((row) => row.plan?.sat)).toEqual(['every', 'every', '1-3', '2-4'])
    expect(rows[4].action).toBe('problem')
    expect(rows[4].reason).toContain('토요일 격주')
  })

  it('AC-7608.3: DB 한도(이름 20자·직종 20자·주소 100자·은행 20자·메모 500자·퇴사일 ≥ 입사일)를 넘으면 그 칸 이름이 든 문제 줄', () => {
    const { rows } = read([
      person('가'.repeat(21), '2026-01-05'),
      person('가짜2', '2026-01-05', { 직종: '나'.repeat(21) }),
      person('가짜3', '2026-01-05', { 주소: '다'.repeat(101) }),
      person('가짜4', '2026-01-05', { 은행: '라'.repeat(21) }),
      person('가짜5', '2026-01-05', { 메모: '마'.repeat(501) }),
      person('가짜6', '2026-01-05', { 퇴사일: '2025-12-31' }),
    ])
    expect(rows.map((row) => row.action)).toEqual(Array(6).fill('problem'))
    ;['이름', '직종', '주소', '은행', '메모', '퇴사일'].forEach((label, i) => expect(rows[i].reason).toContain(label))
    const fine = one(person('가'.repeat(20), '2026-01-05', { 주소: '다'.repeat(100), 메모: '마'.repeat(500), 퇴사일: '2026-01-05' }))
    expect(fine.action).toBe('new')
  })

  it("AC-7608.3: DB 한도 까닭은 '화면 글 기본값' 글 그대로다", () => {
    const { rows } = read([
      person('가'.repeat(21), '2026-01-05'),
      person('가짜2', '2026-01-05', { 직종: '나'.repeat(21) }),
      person('가짜3', '2026-01-05', { 주소: '다'.repeat(101) }),
      person('가짜4', '2026-01-05', { 은행: '라'.repeat(21) }),
      person('가짜5', '2026-01-05', { 메모: '마'.repeat(501) }),
    ])
    expect(rows.map((row) => row.reason)).toEqual([
      '이름은 20자까지 적어 주세요.',
      '직종은 20자까지 적어 주세요.',
      '주소는 100자까지 적어 주세요.',
      '은행은 20자까지 적어 주세요.',
      '메모는 500자까지 적어 주세요.',
    ])
  })

  it('AC-7608.3: 한 줄에 문제가 여럿이면 까닭을 모두 잇는다', () => {
    const row = one(person('가짜', '2026-01-05', { 연락처: '12', 월: '9-6' }))
    expect(row.action).toBe('problem')
    expect(row.reason).toContain('연락처')
    expect(row.reason).toContain('월')
  })
})

describe('AC-7608.6 주소·메모 칸의 주민번호 모양', () => {
  const ADDRESS_REASON = '주소에 주민번호 모양 글이 있어요. 주민번호는 저장하지 않아요.'
  const MEMO_REASON = '메모에 주민번호 모양 글이 있어요. 주민번호는 저장하지 않아요.'

  it('AC-7608.6: 새 직원 줄의 주소·메모에 주민번호 모양이 있으면 그 칸 이름이 든 문제 줄이고 그 글은 넣을 칸에 없다', () => {
    const { rows } = read([
      person('가짜1', '2026-01-05', { 주소: '가짜시 가짜로 1 900101-1234567' }),
      person('가짜2', '2026-01-05', { 메모: '주민 850315 - 2345678 확인' }),
      person('가짜3', '2026-01-05', { 메모: '9001011234567' }),
      person('가짜4', '2026-01-05', { 메모: 9001011234567 }),
      person('가짜5', '2026-01-05', { 주소: '９００１０１－１２３４５６７', 메모: '900101.1234567' }),
    ])
    expect(rows.map((row) => row.action)).toEqual(Array(5).fill('problem'))
    expect(rows.map((row) => row.reason)).toEqual([ADDRESS_REASON, MEMO_REASON, MEMO_REASON, MEMO_REASON, `${ADDRESS_REASON} ${MEMO_REASON}`])
    for (const row of rows) {
      expect(row.member.address).toBeUndefined()
      expect(row.member.memo).toBeUndefined()
    }
  })

  it('AC-7608.6: 고침 줄(같은 이름 + 입사일)도 주민번호 모양이 있으면 문제 줄이다', () => {
    const address = one(person('김하늘', '2021-03-02', { 주소: '가짜시 900101 1234567' }), [HANEUL])
    expect(address).toMatchObject({ action: 'problem', reason: ADDRESS_REASON, changed: [] })
    const memo = one(person('김하늘', '2021-03-02', { 메모: '900101-1234567' }), [HANEUL])
    expect(memo).toMatchObject({ action: 'problem', reason: MEMO_REASON, changed: [] })
  })

  it('AC-7608.6: 반례 — 전화·계좌·날짜·금액 모양이 든 주소·메모는 그대로 들어간다(계좌번호 칸은 검사하지 않는다)', () => {
    const fresh = one(
      person('가짜', '2026-01-05', {
        주소: '가짜시 가짜로 1 (02-123-4567)',
        메모: '보호자 010-1234-5678 · 계좌 110-123-456789 · 1990-01-01 · 3,200,000원',
        계좌번호: '900101-1234567',
      }),
    )
    expect(fresh.action).toBe('new')
    expect(fresh.member).toMatchObject({
      address: '가짜시 가짜로 1 (02-123-4567)',
      memo: '보호자 010-1234-5678 · 계좌 110-123-456789 · 1990-01-01 · 3,200,000원',
      accountNo: '900101-1234567',
    })
    const update = one(person('김하늘', '2021-03-02', { 메모: '새 연락처 01012345678' }), [HANEUL])
    expect(update).toMatchObject({ action: 'update', changed: ['메모'] })
    expect(update.member.memo).toBe('새 연락처 01012345678')
  })
})

describe('AC-7608.4 고침 · 같은 사람 두 줄', () => {
  it('AC-7608.4: 같은 이름 + 입사일이면 고침이고 적힌 칸만 넘긴다(비운 칸은 그대로, 올해 쓴 연차는 넘기지 않음)', () => {
    const row = one(
      person(' 김하늘 ', serial('2021-03-02'), { 연락처: '010-9999-8888', 주소: '가짜시 새주소 2', 은행: '가짜은행', '올해 이미 쓴 연차(일)': 5 }),
      [HANEUL],
    )
    expect(row).toMatchObject({ line: 2, action: 'update', reason: null, changed: ['연락처', '주소'], plan: null })
    expect(row.member).toEqual({ id: 'm-haneul', name: '김하늘', hiredOn: '2021-03-02', phone: '01099998888', address: '가짜시 새주소 2', bank: '가짜은행' })
  })

  it('AC-7608.4: 고침 줄의 바뀐 칸 이름은 양식 칸 차례로 보인다', () => {
    const row = one(
      person('김하늘', '2021-03-02', {
        메모: '새 메모',
        직종: '간호사',
        '근무 형태': '계약직',
        '주 근무시간': 35,
        퇴사일: '2026-12-31',
        생일: '1996-04-09',
        계좌번호: '000-00-000002',
      }),
      [HANEUL],
    )
    expect(row.action).toBe('update')
    expect(row.changed).toEqual(['직종', '근무 형태', '주 근무시간', '퇴사일', '생일', '계좌번호', '메모'])
    expect(row.member).toMatchObject({ job: '간호사', jobOther: null, employment: 'contract', weeklyHours: 35, leftOn: '2026-12-31', memo: '새 메모' })
  })

  it('AC-7608.4: 요일 칸이 다 비면 기본 근무 그대로, 하나라도 적혔으면 새 기본 근무(빈 요일 = 쉼) — 지금과 같으면 바뀌지 않는다', () => {
    const ctx = { ...CTX, plans: [HANEUL_PLAN, { staffId: 'other', from: '2026-01-01', week: Array(7).fill(null), sat: 'every' as const }] }
    const same = one(
      person('김하늘', '2021-03-02', { 월: '09:00-18:00', 화: '09:00-18:00', 수: '09:00-18:00', 목: '09:00-18:00', 금: '09:00-18:00', 토: '9:00-13:00', '토요일 격주': '1·3주' }),
      [HANEUL],
      ctx,
    )
    expect(same).toMatchObject({ action: 'update', changed: [], plan: null })
    const changed = one(person('김하늘', '2021-03-02', { 월: '09:00-18:00', 화: '09:00-18:00' }), [HANEUL], ctx)
    expect(changed.changed).toEqual(['기본 근무'])
    expect(changed.plan).toEqual({ week: [WORK, WORK, null, null, null, null, null], sat: 'every' })
    const kept = one(person('김하늘', '2021-03-02', { '토요일 격주': '2·4주' }), [HANEUL], ctx)
    expect(kept).toMatchObject({ action: 'update', changed: [], plan: null })
  })

  it('AC-7608.4: 새 사람은 요일 칸이 있으면 기본 근무를, 없으면 null을 넘긴다', () => {
    const { rows } = read([person('최민준', '2019-11-25', { 월: '09:00-18:00', '토요일 격주': '2·4주' }), person('한지우', '2026-02-02')])
    expect(rows[0].plan).toEqual({ week: [WORK, null, null, null, null, null, null], sat: '2-4' })
    expect(rows[1].plan).toBeNull()
  })

  it('AC-7608.4: 입사일이 다르면 새 사람, 파일 안 같은 이름 + 입사일 두 줄은 뒤 줄이 문제 줄', () => {
    const { rows } = read(
      [person('김하늘', '2021-03-03'), person('최민준', '2019-11-25'), person('최민준', serial('2019-11-25'), { 연락처: '010-0000-1111' })],
      [HANEUL],
    )
    expect(rows.map((row) => [row.line, row.action, row.reason])).toEqual([
      [2, 'new', null],
      [3, 'new', null],
      [4, 'problem', '같은 사람이 위 줄에도 있어요.'],
    ])
  })
})

describe('AC-7608.5 넣기에 넘길 줄', () => {
  it('AC-7608.5: 새 줄은 이름·직종·입사일·근무 형태·주 근무시간이 늘 있고, 올해 이미 쓴 연차는 오늘이 든 연차 기간 시작일과 함께 넘긴다', () => {
    const seen: unknown[] = []
    const ctx: RosterContext = {
      ...CTX,
      periodStart: (p) => {
        seen.push(p)
        return '2026-07-17'
      },
    }
    const { rows } = read(
      [person('이도윤', '2023-07-17', { 직종: '물리치료사', '올해 이미 쓴 연차(일)': 6 }), person('한지우', '2026-02-02'), person('정유나', '2024-09-02', { '올해 이미 쓴 연차(일)': 0 })],
      [],
      ctx,
    )
    expect(rows[0].member).toEqual({
      name: '이도윤',
      job: '물리치료사',
      jobOther: null,
      employment: 'regular',
      weeklyHours: 40,
      hiredOn: '2023-07-17',
      leftOn: null,
      phone: null,
      birthday: null,
      address: null,
      bank: null,
      accountNo: null,
      memo: null,
      usedBefore: 6,
      usedBeforeFrom: '2026-07-17',
      carryStart: 0,
    })
    expect(seen).toEqual([{ employment: 'regular', weeklyHours: 40, hiredOn: '2023-07-17', leftOn: null }])
    expect(rows[1].member).toMatchObject({ job: '기타', jobOther: null, usedBefore: 0, usedBeforeFrom: null })
    expect(rows[2].member).toMatchObject({ usedBefore: 0, usedBeforeFrom: null })
  })

  it('AC-7608.5: 시안 ④처럼 일곱 줄이면 새 직원 5 · 고침 1 · 문제 1이고, 문제 줄은 action으로 빠진다', () => {
    const { problem, rows } = read(
      [
        person('최민준', '2019-11-25', { 직종: '방사선사', '올해 이미 쓴 연차(일)': 14 }),
        person('김하늘', '2021-03-02', { 직종: '간호조무사', 연락처: '010-1111-3333', 주소: '가짜시 새주소 2' }),
        person('이도윤', '2023-07-17', { 직종: '물리치료사', '올해 이미 쓴 연차(일)': 6 }),
        person('정유나', '2024-09-02', { 직종: '원무', '근무 형태': '파트타임', '주 근무시간': 24, '올해 이미 쓴 연차(일)': 2 }),
        person('박서연', '2025-01-06', { 직종: '물리치료사', '올해 이미 쓴 연차(일)': 3 }),
        person('한지우', '2026-02-02', { 직종: '원무', '근무 형태': '계약직', '올해 이미 쓴 연차(일)': 4 }),
        person('강다은', '26년 3월', { 직종: '간호사', '올해 이미 쓴 연차(일)': 1 }),
      ],
      [HANEUL],
    )
    expect(problem).toBeNull()
    expect(rows.map((row) => row.action)).toEqual(['new', 'update', 'new', 'new', 'new', 'new', 'problem'])
    expect(rows[1].changed).toEqual(['연락처', '주소'])
    expect(rows[6].reason).toBe('입사일 모양이 틀렸어요. 2026-03-02처럼 적어 주세요.')
    for (const row of rows.filter((r) => r.action === 'new')) {
      expect(row.member.name).toBeTruthy()
      expect(row.member.hiredOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(['간호사', '간호조무사', '물리치료사', '방사선사', '원무', '기타']).toContain(row.member.job)
    }
    expect(rows[0].member).toMatchObject({ usedBefore: 14, usedBeforeFrom: '2026-11-25' })
  })
})

describe('AC-7608.7 넘어온 연차(일) 칸', () => {
  const CARRY = '넘어온 연차(일)'
  const REASON = '넘어온 연차(일)는 -30~100 사이 숫자로 적어 주세요. 반차는 0.5예요.'

  it('AC-7608.7: −30~100·0.5 단위 숫자(엑셀 숫자 값 또는 2·2.5·-1 같은 글자)를 받는다', () => {
    const cases: [string | number, number][] = [
      [2.5, 2.5],
      ['2', 2],
      ['2.5', 2.5],
      ['-1', -1],
      [-30, -30],
      [100, 100],
      [-0.5, -0.5],
      [0, 0],
    ]
    const { problem, rows } = read(cases.map(([value], i) => person(`가짜${i + 1}`, '2026-01-05', { [CARRY]: value })))
    expect(problem).toBeNull()
    expect(rows.map((row) => [row.action, row.member.carryStart])).toEqual(cases.map(([, want]) => ['new', want]))
  })

  it("AC-7608.7: 어기면(−30.5·100.5·0.3·글자·'1/2'·'+2') '넘어온 연차(일)는 -30~100 사이 숫자로 적어 주세요. 반차는 0.5예요.' 문제 줄이다", () => {
    const bad: (string | number)[] = [-30.5, 100.5, 0.3, '두 일', '1/2', '+2']
    const { rows } = read(bad.map((value, i) => person(`가짜${i + 1}`, '2026-01-05', { [CARRY]: value })))
    expect(rows).toHaveLength(bad.length)
    for (const row of rows) {
      expect(row.action).toBe('problem')
      expect(row.reason).toBe(REASON)
      expect(row.member.carryStart).toBeUndefined()
    }
    expect(rows.map((row) => row.raw[CARRY])).toEqual(['-30.5', '100.5', '0.3', '두 일', '1/2', '+2'])
  })

  it('AC-7608.7: 문제 까닭은 양식 칸 차례(메모 뒤)로 잇는다', () => {
    const row = read([person('최민준', '2019-11-25', { 연락처: '010', [CARRY]: 200 })]).rows[0]
    expect(row.reason).toBe(`연락처는 숫자 9~11자리로 적어 주세요. 예: 010-0000-0000 ${REASON}`)
  })

  it('AC-7608.7: 새 직원은 비면 0이다', () => {
    const row = one(person('한지우', '2026-02-02'))
    expect(row).toMatchObject({ action: 'new', member: { carryStart: 0 } })
  })

  it("AC-7608.7: 고침 줄은 적혔을 때만 그 값으로 넘기고, 지금 값과 다르면 '{칸들}' 맨 끝에 '넘어온 연차'다(비면 지금 값 그대로 — 넘기지 않음)", () => {
    const now: RosterExisting = { ...HANEUL, carryStart: 1.5 }
    const changed = one(person('김하늘', '2021-03-02', { 메모: '새 메모', 연락처: '010-9999-8888', [CARRY]: '-2' }), [now])
    expect(changed).toMatchObject({ action: 'update', changed: ['연락처', '메모', '넘어온 연차'] })
    expect(changed.member.carryStart).toBe(-2)
    const same = one(person('김하늘', '2021-03-02', { [CARRY]: 1.5 }), [now])
    expect(same).toMatchObject({ action: 'update', changed: [] })
    expect(same.member.carryStart).toBe(1.5)
    const blank = one(person('김하늘', '2021-03-02', { 연락처: '010-9999-8888' }), [now])
    expect(blank.changed).toEqual(['연락처'])
    expect('carryStart' in blank.member).toBe(false)
    const plan = one(person('김하늘', '2021-03-02', { 월: '09:00-18:00', [CARRY]: 0 }), [now], { ...CTX, plans: [HANEUL_PLAN] })
    expect(plan.changed).toEqual(['기본 근무', '넘어온 연차'])
  })

  describe('AC-7608.7 옛 양식(21칸)', () => {
    const OLD = ROSTER_HEADERS.slice(0, 21)
    const oldBook = (rows: readonly (Cells | null)[]) => book(rows, { headers: OLD })

    it('AC-7608.7: 맨 끝 칸이 없는 옛 양식도 읽는다 — 새 직원은 넘어온 연차 0, 나머지 칸은 지금처럼', () => {
      const { problem, rows } = readRoster(oldBook([person('최민준', '2019-11-25', { 직종: '방사선사', '올해 이미 쓴 연차(일)': 14, 메모: '옛 양식' })]), [], CTX)
      expect(problem).toBeNull()
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ line: 2, action: 'new', reason: null })
      expect(rows[0].member).toMatchObject({ name: '최민준', job: '방사선사', usedBefore: 14, usedBeforeFrom: '2026-11-25', memo: '옛 양식', carryStart: 0 })
      expect(rows[0].raw[CARRY]).toBe('')
    })

    it('AC-7608.7: 옛 양식 고침 줄은 넘어온 연차를 그대로 둔다(넘기지 않음)', () => {
      const row = readRoster(oldBook([person('김하늘', '2021-03-02', { 연락처: '010-9999-8888' })]), [{ ...HANEUL, carryStart: 4 }], CTX).rows[0]
      expect(row).toMatchObject({ action: 'update', changed: ['연락처'] })
      expect('carryStart' in row.member).toBe(false)
    })

    it('AC-7608.7: 옛 머리 줄 뒤 22번째 칸의 값은 읽지 않는다(그 칸만 적힌 줄은 빈 줄로 건너뛴다)', () => {
      const { problem, rows } = readRoster(
        oldBook([person('최민준', '2019-11-25', { [CARRY]: 7 }), { [CARRY]: 3 }, person('김하늘', '2021-03-02', { [CARRY]: 'abc' })]),
        [{ ...HANEUL, carryStart: 4 }],
        CTX,
      )
      expect(problem).toBeNull()
      expect(rows.map((row) => [row.line, row.action, row.reason])).toEqual([
        [2, 'new', null],
        [4, 'update', null],
      ])
      expect(rows[0].member.carryStart).toBe(0)
      expect(rows[0].raw[CARRY]).toBe('')
      expect('carryStart' in rows[1].member).toBe(false)
      expect(rows[1].changed).toEqual([])
    })
  })
})
