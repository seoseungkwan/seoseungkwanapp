import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'
import type { PatientDay, RxGroupDef } from '@/types/analysis'
import type { ConsumptionRow } from '@/types/consumption'
import { aggregate } from './aggregate'
import { groupMatches } from './groupMatch'
import type { VisitLine } from './patientMix'
import { sunapDoctors, sunapRates, type SunapDoctorsInput, type SunapRatesInput } from './sunapRates'

// 지어낸 환자·날 줄(통계 Worker의 접수 줄 PatientDay)과 처방 줄(ConsumptionRow). 2026-11-02 월 ~ 11-04 수
const FROM = '2026-11-02'
const TO = '2026-11-04'
const BLOCK: RxGroupDef = { id: 'g-block', codes: ['MM110'] }
const PT: RxGroupDef = { id: 'g-pt', codes: ['MM010', 'MM015', 'MM080'], out: ['ESWT7'], cond: [{ code: 'MM080', unless: ['MM020'] }] }

const day = (patient: number, date: string, firstVisit = false, first90?: number, receptions = 1): PatientDay =>
  first90 === undefined ? { patient, date, receptions, firstVisit } : { patient, date, receptions, firstVisit, first90 }
const rx = (patient: number, date: string, rxCode: string, outpatient: boolean | null = true): ConsumptionRow => ({
  rxCode,
  rxName: rxCode,
  rxType: '',
  date,
  firstVisit: false,
  outpatient,
  patient,
  region: null,
})
const input = (days: PatientDay[], rows: ConsumptionRow[], over: Partial<SunapRatesInput> = {}): SunapRatesInput => ({
  from: FROM,
  to: TO,
  days,
  rows,
  block: BLOCK,
  pt: PT,
  ...over,
})

// 사흘 동안 열 명(도우미 v4 접수 줄: first90 칸이 모든 줄에 있다)
const DAYS: PatientDay[] = [
  day(1, '2026-11-02', true, 0), // 신환
  day(2, '2026-11-02', false, 1), // 90일초진
  day(3, '2026-11-02', false, 0), // 재진
  day(4, '2026-11-02', true, 1), // 신환이 90일초진보다 앞선다
  day(1, '2026-11-03', false, 0),
  day(5, '2026-11-03', false, 1),
  day(6, '2026-11-03', false, 0),
  day(7, '2026-11-04', true, 0),
  day(8, '2026-11-04', false, 0),
  day(9, '2026-11-04', false, 0), // 처방 줄 없음
]
const ROWS: ConsumptionRow[] = [
  rx(1, '2026-11-02', 'MM110'),
  rx(1, '2026-11-02', 'MM010'),
  rx(2, '2026-11-02', 'mm110'),
  rx(3, '2026-11-02', 'MM110'),
  rx(3, '2026-11-02', 'MM080'),
  rx(3, '2026-11-02', 'MM020'), // 조건에 걸려 물리치료 아님
  rx(4, '2026-11-02', 'MM015'),
  rx(1, '2026-11-03', 'MM010'),
  rx(1, '2026-11-03', 'ESWT7'), // 빼는 처방 — 물리치료 아님
  rx(5, '2026-11-03', 'MM110'),
  rx(5, '2026-11-03', 'MM010'),
  rx(6, '2026-11-03', 'MM110'),
  rx(7, '2026-11-04', 'MM010'),
  rx(8, '2026-11-04', 'MM110'),
  rx(8, '2026-11-04', 'MM015'),
]

describe('AC-4906.4 sunapRates — 통계 환자·날 줄로 센 구분·Block·물리치료', () => {
  it('AC-4906.4: 사흘 열 명 — 구분별 수와 Block·물리치료·구분+Block 수', () => {
    expect(sunapRates(input(DAYS, ROWS))).toEqual({
      visits: 10,
      first_n: 3, // 1(11-02)·4·7
      d90_n: 2, // 2·5
      ret_n: 5, // 3·1(11-03)·6·8·9
      block_n: 6, // 1(11-02)·2·3·5·6·8
      pt_n: 5, // 1(11-02)·4·5·7·8
      first_block: 1, // 1(11-02)
      d90_block: 2, // 2·5
      ret_block: 3, // 3·6·8
    })
  })

  it('AC-4906.4: 구분은 통계 환자 구성(aggregate 접수 줄 셈)과 같다 — 신환이 90일초진보다 앞선다', () => {
    const counts = sunapRates(input(DAYS, ROWS))
    const days = aggregate(ROWS, [], DAYS).day.filter((bucket) => bucket.key >= FROM && bucket.key <= TO)
    const total = (pick: (t: (typeof days)[number]['totals']) => number) => days.reduce((sum, bucket) => sum + pick(bucket.totals), 0)
    expect(counts.visits).toBe(total((t) => t.patients))
    expect(counts.first_n).toBe(total((t) => t.newPatients))
    expect(counts.d90_n).toBe(total((t) => t.first90 ?? 0))
    expect(counts.ret_n).toBe(total((t) => t.returning))
    expect(sunapRates(input([day(4, '2026-11-02', true, 1)], [])).first_n).toBe(1)
    expect(sunapRates(input([day(4, '2026-11-02', true, 1)], [])).d90_n).toBe(0)
  })

  it('AC-4906.4: 묶음 판단은 환자·날마다 groupMatches와 같고, aggregate 일 칸 묶음 수의 합과도 같다', () => {
    const counts = sunapRates(input(DAYS, ROWS))
    const codesOf = (patient: number, date: string) => ROWS.filter((r) => r.patient === patient && r.date === date).map((r) => r.rxCode)
    expect(counts.block_n).toBe(DAYS.filter((d) => groupMatches(BLOCK, codesOf(d.patient, d.date))).length)
    expect(counts.pt_n).toBe(DAYS.filter((d) => groupMatches(PT, codesOf(d.patient, d.date))).length)
    const agg = aggregate(ROWS, [BLOCK, PT], DAYS)
    const groupTotal = (id: string) => agg.day.reduce((sum, bucket) => sum + (bucket.groups.find((g) => g.id === id)?.patients ?? 0), 0)
    expect(counts.block_n).toBe(groupTotal('g-block'))
    expect(counts.pt_n).toBe(groupTotal('g-pt'))
  })

  it('AC-4906.4: 한 환자·한 날에 접수가 여럿이어도 한 줄로 센다(장부와 같이 환자·날마다)', () => {
    expect(sunapRates(input([day(1, '2026-11-02', false, 1, 3)], [rx(1, '2026-11-02', 'MM110')]))).toMatchObject({
      visits: 1,
      d90_n: 1,
      ret_n: 0,
      d90_block: 1,
    })
  })

  it('AC-4906.4: 90일초진 칸이 없는 접수 줄(도우미 v2·v3)은 신환이 아니면 재진이다', () => {
    const counts = sunapRates(input([day(1, '2026-11-02', true), day(2, '2026-11-02'), day(3, '2026-11-03')], []))
    expect(counts).toMatchObject({ visits: 3, first_n: 1, d90_n: 0, ret_n: 2 })
  })

  it('AC-4906.4: 기간 밖 접수 줄·처방 줄은 세지 않는다(양 끝 포함)', () => {
    const days = [day(1, '2026-11-01'), day(2, '2026-11-02'), day(3, '2026-11-04'), day(4, '2026-11-05')]
    const rows = [rx(1, '2026-11-01', 'MM110'), rx(2, '2026-11-02', 'MM110'), rx(3, '2026-11-04', 'MM110'), rx(4, '2026-11-05', 'MM110')]
    expect(sunapRates(input(days, rows))).toMatchObject({ visits: 2, ret_n: 2, block_n: 2, ret_block: 2 })
  })

  it('AC-4906.4: 같은 날 다른 환자, 같은 환자 다른 날의 처방은 섞지 않는다', () => {
    const days = [day(1, '2026-11-02'), day(2, '2026-11-02'), day(1, '2026-11-03')]
    const rows = [rx(2, '2026-11-02', 'MM110'), rx(1, '2026-11-03', 'MM010'), rx(1, '2026-11-03', 'ESWT7')]
    expect(sunapRates(input(days, rows))).toMatchObject({ visits: 3, block_n: 1, pt_n: 0 })
  })

  it('AC-4906.4: 입원 줄(outpatient false)은 묶음 판단에 쓰지 않는다(aggregate와 같음, null은 외래)', () => {
    const days = [day(1, '2026-11-02'), day(2, '2026-11-02')]
    const rows = [rx(1, '2026-11-02', 'MM110', false), rx(2, '2026-11-02', 'MM010'), rx(2, '2026-11-02', 'ESWT7', false), rx(2, '2026-11-02', 'MM110', null)]
    expect(sunapRates(input(days, rows))).toMatchObject({ block_n: 1, pt_n: 1 })
  })

  it('AC-4906.4: 접수 줄이 없는 환자·날의 처방 줄은 세지 않는다', () => {
    expect(sunapRates(input([day(1, '2026-11-02')], [rx(2, '2026-11-02', 'MM110')]))).toMatchObject({ visits: 1, block_n: 0 })
  })

  it('AC-4906.4: 묶음 정의가 없으면(null) Block·물리치료와 구분+Block은 0이다', () => {
    expect(sunapRates(input(DAYS, ROWS, { block: null, pt: null }))).toEqual({
      visits: 10,
      first_n: 3,
      d90_n: 2,
      ret_n: 5,
      block_n: 0,
      pt_n: 0,
      first_block: 0,
      d90_block: 0,
      ret_block: 0,
    })
  })

  it('AC-4906.4: 줄이 없으면 모두 0이다', () => {
    const counts = sunapRates(input([], []))
    expect(Object.values(counts).every((n) => n === 0)).toBe(true)
  })
})

// ── 원장님별 (spec sunap-doctors AC-5001.4): 위 사흘 열 명에 접수 줄(VisitLine, 진료의 doc)을 붙인다 ─────────
// 원장님 이름은 지어낸 값이다. D01 이○○ · D02 김○○ — 내원이 같아 이름 글자 차례(김 → 이)로 선다
const visit = (p: number, d: string, doc: string | null): VisitLine => ({ p, d, h: 9, ins: null, doc })
const VISITS: VisitLine[] = [
  visit(1, '2026-11-02', 'D02'),
  visit(1, '2026-11-02', 'D01'), // 그날 두 접수 → 가장 작은 코드 D01
  visit(2, '2026-11-02', 'D02'),
  visit(3, '2026-11-02', null),
  visit(3, '2026-11-02', 'D02'), // null은 빼고 D02
  visit(4, '2026-11-02', null), // 코드가 없다 → 미지정
  visit(1, '2026-11-03', 'D01'),
  visit(5, '2026-11-03', 'D02'),
  visit(6, '2026-11-03', 'D01'),
  visit(7, '2026-11-04', 'D01'),
  visit(8, '2026-11-04', 'D02'),
  // 9번(11-04)은 접수 줄이 없다 → 미지정
  visit(2, '2026-11-03', 'D01'), // 그 환자·날 접수 줄(PatientDay)이 없다 → 세지 않는다
  visit(9, '2026-11-05', 'D01'), // 기간 밖
  visit(-1, '2026-11-02', 'D01'), // 차트번호 모름
]
const NAMES = new Map<string, string | null>([
  ['D01', '이○○'],
  ['D02', '김○○'],
])
const doctorInput = (visits: VisitLine[], doctors: ReadonlyMap<string, string | null> = NAMES, over: Partial<SunapRatesInput> = {}): SunapDoctorsInput => ({
  ...input(DAYS, ROWS, over),
  visits,
  doctors,
})
const summary = (got: ReturnType<typeof sunapDoctors>) => got?.rows.map((row) => [row.code, row.label, row.rates.visits]) ?? null

describe('AC-5001.4 sunapDoctors — 환자·날마다 그날 접수 진료의 중 가장 작은 코드, 셈은 sunapRates와 같다', () => {
  it('AC-5001.4: 사흘 열 명 — 원장님마다 아홉 칸', () => {
    expect(sunapDoctors(doctorInput(VISITS))).toEqual({
      rows: [
        {
          code: 'D02',
          label: '김○○',
          rates: { visits: 4, first_n: 0, d90_n: 2, ret_n: 2, block_n: 4, pt_n: 2, first_block: 0, d90_block: 2, ret_block: 2 }, // 2·3·5·8
        },
        {
          code: 'D01',
          label: '이○○',
          rates: { visits: 4, first_n: 2, d90_n: 0, ret_n: 2, block_n: 2, pt_n: 2, first_block: 1, d90_block: 0, ret_block: 1 }, // 1(11-02)·1(11-03)·6·7
        },
        {
          code: null,
          label: '진료의 미지정',
          rates: { visits: 2, first_n: 1, d90_n: 0, ret_n: 1, block_n: 0, pt_n: 1, first_block: 0, d90_block: 0, ret_block: 0 }, // 4·9
        },
      ],
      total: { visits: 10, first_n: 3, d90_n: 2, ret_n: 5, block_n: 6, pt_n: 5, first_block: 1, d90_block: 2, ret_block: 3 },
    })
  })

  it('AC-5001.4: total은 같은 입력의 sunapRates와 같다(묶음이 없어도, 기간을 줄여도)', () => {
    for (const over of [{}, { block: null, pt: null }, { to: '2026-11-03' }, { from: '2026-11-03' }] satisfies Partial<SunapRatesInput>[]) {
      const got = sunapDoctors(doctorInput(VISITS, NAMES, over))
      expect(got?.total).toEqual(sunapRates(input(DAYS, ROWS, over)))
    }
  })

  it('AC-5001.4: 한 환자·한 날의 접수 줄 코드 중 가장 작은 것 한 분에만 센다(null은 빼고)', () => {
    const days = [day(1, '2026-11-02'), day(2, '2026-11-02')]
    const visits = [visit(1, '2026-11-02', 'D10'), visit(1, '2026-11-02', null), visit(1, '2026-11-02', 'D09'), visit(2, '2026-11-02', 'D20')]
    const got = sunapDoctors({ ...input(days, []), visits, doctors: new Map() })
    expect(summary(got)).toEqual([
      ['D09', 'D09', 1],
      ['D20', 'D20', 1],
    ])
  })

  it('AC-5001.4: 같은 날 다른 환자, 같은 환자 다른 날의 접수 줄은 섞지 않는다', () => {
    const days = [day(1, '2026-11-02'), day(2, '2026-11-02'), day(1, '2026-11-03')]
    const visits = [visit(1, '2026-11-02', 'D02'), visit(2, '2026-11-02', 'D01'), visit(1, '2026-11-03', 'D03')]
    expect(summary(sunapDoctors({ ...input(days, []), visits, doctors: new Map() }))).toEqual([
      ['D01', 'D01', 1],
      ['D02', 'D02', 1],
      ['D03', 'D03', 1],
    ])
  })

  it('AC-5001.4: 원장님(미지정 빼고)이 한 분 이하면 null이다', () => {
    expect(sunapDoctors(doctorInput(VISITS.map((line) => ({ ...line, doc: line.doc === null ? null : 'D01' }))))).toBeNull()
    expect(sunapDoctors(doctorInput(VISITS.map((line) => ({ ...line, doc: null }))))).toBeNull()
    expect(sunapDoctors(doctorInput([]))).toBeNull()
    expect(sunapDoctors({ ...input([], []), visits: VISITS, doctors: NAMES })).toBeNull()
  })

  it('AC-5001.4: 기간 밖 날의 원장님은 세지 않는다(그 원장님이 기간 안에 없으면 줄도 없다)', () => {
    const visits = [...VISITS, visit(1, '2026-11-01', 'D07')]
    const days = [...DAYS, day(1, '2026-11-01')]
    expect(summary(sunapDoctors({ ...doctorInput(visits), days }))).toEqual([
      ['D02', '김○○', 4],
      ['D01', '이○○', 4],
      [null, '진료의 미지정', 2],
    ])
  })

  it('AC-5001.4: 이름은 이름 → 코드 → 진료의 미지정(doctorStats와 같은 규칙)', () => {
    const got = sunapDoctors(doctorInput(VISITS, new Map([['D01', null]])))
    expect(summary(got)).toEqual([
      ['D01', 'D01', 4],
      ['D02', 'D02', 4],
      [null, '진료의 미지정', 2],
    ])
  })
})

// ── 환자 자료 구역 울타리 (spec sunap-doctors AC-5001.6) ─────────────────
const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const FENCED = ['src/lib/sunap/**/*.ts', 'src/lib/analytics/sunapRates.ts']

describe('AC-5001.6 lib/sunap·sunapRates — 환자 자료 구역 울타리를 그대로 지난다', () => {
  it(
    'AC-5001.6: 소스는 울타리(eslint)에 걸리는 것이 없고, 같은 자리의 네트워크·console·저장소는 막힌다',
    async () => {
      const eslint = new ESLint({ cwd: ROOT })
      const results = await eslint.lintFiles(FENCED)
      const files = results.map((r) => r.filePath.replaceAll('\\', '/').replace(/^.*\/src\//, 'src/'))
      expect(files).toEqual(expect.arrayContaining(['src/lib/sunap/ledger.ts', 'src/lib/sunap/memo.ts', 'src/lib/analytics/sunapRates.ts']))
      expect(results.flatMap((r) => r.messages.map((m) => `${r.filePath}:${m.line} ${m.ruleId}`))).toEqual([])
      for (const filePath of ['src/lib/sunap/ledger.ts', 'src/lib/analytics/sunapRates.ts']) {
        const [result] = await eslint.lintText("fetch('x')\nconsole.log(1)\nlocalStorage.getItem('k')\n", { filePath })
        const rules = result.messages.filter((m) => m.severity === 2).map((m) => m.ruleId)
        expect(rules).toEqual(expect.arrayContaining(['no-restricted-globals', 'no-console']))
      }
    },
    120_000,
  )
})
