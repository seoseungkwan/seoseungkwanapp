import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { addDays, compareYmd } from '../../src/lib/analytics/dates'
import type { ClaimMonthJson, GridRow, HistoryRow, HospitalCatalog } from '../../src/types/precheck'

// 청구 사전점검 **가짜** 한 달 자료 생성기(REQ-009). 도우미 claim.month JSON(helper Claim/ClaimMonthPayload)과 같은 모양을 만든다.
// 실제 환자 자료는 한 글자도 쓰지 않는다: 이름 '가상환자NN', 차트번호 9로 시작하는 6자리. 원본 tests/test_claim_precheck.py의
// 가짜 사례 v1~v18(내원번호 그대로)을 옮기고, 달을 넘기는 기간(10/30~11/2) 사례를 더했다.
// 뒤 TASK(10·11·14·16·24)는 FAKE_CLAIM_CASES에 이름 붙인 사례를 더한다. 다시 만들기: npx tsx fixtures/precheck/make-fake-claims.ts

export const FAKE_SEED = 20261030
/** 가짜 '오늘'(상병 추세 기간의 끝). 현재 시각을 쓰지 않는다 */
const TODAY = '2026-11-03'

type Role = true | false | 'x'
/** [처방코드, 처방명칭, 수량(표에 적힌 글자 그대로), 급여구분(기본 급여)] */
type FakeRx = [code: string, name: string, qty: string, pay?: string]
type FakeVisit = {
  id: string // 내원번호
  chart: number // 차트번호 9xxxxx의 뒤 번호(가상환자NN의 NN)
  date: string // YYYY-MM-DD
  lines: string[] // 증상 줄. 비면 증상 칸이 빈 줄 하나(원본 build처럼 진료가 되지 않는다)
  joined?: boolean // 증상을 한 칸에 줄바꿈으로 붙여 넣는다(아니면 줄마다 한 줄)
  rx: FakeRx[]
  dx: [code: string, role: Role][]
  memo?: string // 비트에 이미 있는 청구메모(이력의 m)
}
/** 기간 전의 이력(같은 날 두 내원처럼 일부러 넣는 것) */
type FakePast = { id: string; chart: number; date: string; codes: string[]; memo: string }
type FakeMonth = { from: string; to: string; visits: FakeVisit[]; past: FakePast[] }

export type FakeClaimCase = { name: string; file: string; note: string; month: FakeMonth }

// ── 사례 ────────────────────────────────────────────────

const MBB: FakeRx[] = [['LA358', '후지내측지', '1.5'], ['A21', '트리암주', '1']]
const KNEE_IA: FakeRx[] = [['KK090', '관절강내주사', '1'], ['A21', '트리암주', '1']]
const MANUAL: FakeRx[] = [['KR006', '도수치료', '1']]

/** 원본 test_claim_precheck.py add(id, chart, date, lines, rx, dx) 그대로(차트번호 n → 9000nn, 날짜 → YYYY-MM-DD) */
const ORIGINAL_V1_V18: FakeVisit[] = [
  { id: 'v1', chart: 1, date: '2026-10-05', lines: ['MBB L4,5 both', 'LBP'], rx: [['LA358', '후지내측지', '2.5'], ['LA357', '척추부신경', '1.0'], ['A21', '트리암주', '1']], dx: [['M5456', true]] },
  { id: 'v2', chart: 2, date: '2026-10-05', lines: ['Rt knee IA'], rx: [['KK090', '관절강내주사', '1'], ['A15', '리도카인주', '1']], dx: [['M1706', true]] },
  { id: 'v3', chart: 3, date: '2026-10-05', lines: ['Rt elbow'], rx: [['KK061', '신경간내주사', '1'], ['A15', '리도카인주', '1']], dx: [['M7710', true]] },
  { id: 'v4', chart: 4, date: '2026-10-05', lines: ['Rt knee IA', 'S) knee pain'], joined: true, rx: [['MM010', '표층열', '1'], ['KK090', '관절강내주사', '1'], ['A21', '트리암주', '1']], dx: [['M1706', true]] },
  { id: 'v5', chart: 5, date: '2026-10-05', lines: ['S) LBP'], rx: [['MM010', '표층열', '1'], ['MM020', '심층열', '1']], dx: [['M5456', true]] },
  { id: 'v6', chart: 6, date: '2026-10-05', lines: ['Rt knee 아라간 1차'], rx: [['KK090', '관절강내주사', '1'], ['A49', '아라간플러스주', '1']], dx: [['M545', true]] },
  { id: 'v7', chart: 7, date: '2026-10-05', lines: ['both hands pain'], rx: [['G6502', '수지 2매', '1']], dx: [['M7964', true]] },
  { id: 'v7b', chart: 7, date: '2026-10-06', lines: ['both hands 각각 촬영'], rx: [['G6502', '수지 2매', '1']], dx: [['M7964', true]] },
  { id: 'v8', chart: 8, date: '2026-10-05', lines: ['물리치료만'], rx: [['AA254', '재진', '1'], ['MM010', '표층열', '1']], dx: [['M5456', true]], memo: '물리치료 메모(가상)' },
  { id: 'v9', chart: 9, date: '2026-10-01', lines: ['MBB L4,5 Rt'], rx: MBB, dx: [['M5456', true]] },
  { id: 'v10', chart: 9, date: '2026-10-05', lines: ['MBB L4,5 Rt'], rx: MBB, dx: [['M5456', true]] },
  { id: 'v11', chart: 10, date: '2026-10-05', lines: ['도수'], rx: MANUAL, dx: [['M5456', true]] },
  { id: 'v12', chart: 10, date: '2026-10-06', lines: ['도수'], rx: MANUAL, dx: [['M5456', true]] },
  { id: 'v13', chart: 10, date: '2026-10-07', lines: ['도수'], rx: MANUAL, dx: [['M5456', true]] },
  { id: 'v14', chart: 11, date: '2026-10-05', lines: ['Rt shoulder', 'S) pain'], rx: [['MM410', '수압팽창술', '1'], ['A21', '트리암주', '1']], dx: [['M750', true]] },
  { id: 'v15', chart: 12, date: '2026-10-05', lines: ['S) knee pain'], rx: [['X1', '가상진통정', '1'], ['Y2', '가상소염캡슐', '1']], dx: [['M1706', true]] },
  { id: 'v16', chart: 13, date: '2026-10-05', lines: ['S) knee pain'], rx: KNEE_IA, dx: [['M5456', true], ['M1706', 'x']] },
  { id: 'v16b', chart: 16, date: '2026-10-05', lines: ['S) knee pain'], rx: KNEE_IA, dx: [['M1706', false]] },
  { id: 'v17', chart: 14, date: '2026-10-05', lines: [], rx: [['MM010', '표층열', '1']], dx: [] },
  { id: 'v18', chart: 15, date: '2026-10-05', lines: ['S) LBP L4,5 Rt'], rx: MBB, dx: [['M5456', true]] },
]

export const FAKE_CLAIM_CASES: readonly FakeClaimCase[] = [
  {
    name: 'rules-v1-v18',
    file: 'claim-month-rules-v1-v18.json',
    note: '원본 test_claim_precheck.py의 가짜 사례 v1~v18(v7b·v16b 포함). 같은 날 두 내원 이력(900010 9/15)과 지난 MBB 이력(900009 7/10)',
    month: {
      from: '2026-10-01',
      to: '2026-10-07',
      visits: ORIGINAL_V1_V18,
      past: [
        { id: 'h900010-a', chart: 10, date: '2026-09-15', codes: ['KR006'], memo: '도수 1회' },
        { id: 'h900010-b', chart: 10, date: '2026-09-15', codes: ['kr006', 'MM010'], memo: '도수 1회' },
        { id: 'h900009-p', chart: 9, date: '2026-07-10', codes: ['LA358', 'A21'], memo: 'MBB L4,5 Rt(가상 메모)' },
      ],
    },
  },
  {
    name: 'cross-month',
    file: 'claim-month-cross-month.json',
    note: '달을 넘기는 기간 10/30~11/2(AC-009.5). 같은 환자(900021)가 10월·11월에 오고, 비급여 도수 한 줄',
    month: {
      from: '2026-10-30',
      to: '2026-11-02',
      visits: [
        { id: 'c1', chart: 21, date: '2026-10-30', lines: ['S) knee pain'], rx: KNEE_IA, dx: [['M1706', true]] },
        { id: 'c2', chart: 22, date: '2026-10-31', lines: ['MBB L4,5 Rt'], rx: MBB, dx: [['M5456', true]] },
        { id: 'c3', chart: 21, date: '2026-11-02', lines: ['Rt knee IA'], rx: [['KK090', '관절강내주사', '1'], ['A15', '리도카인주', '1']], dx: [['M1706', true]] },
        { id: 'c4', chart: 23, date: '2026-11-02', lines: ['S) LBP', '도수'], rx: [['MM010', '표층열', '1'], ['MM020', '심층열', '1'], ['KR006', '도수치료', '1', '비급여']], dx: [['M5456', true], ['M5457', false]] },
      ],
      past: [],
    },
  },
]

// ── 함께 오는 고정 자료(추세·처방 목록). 코드 이름은 가상 ─────────────────

const DX_TREND: ClaimMonthJson['dxTrend'] = {
  visits: 120,
  invalidRows: 0,
  truncated: 0,
  codes: [
    {
      c: 'KK090',
      n: 40,
      d: [
        { c: 'M1706', nm: '상병 M1706', m: 30, s: 6, x: 0, l: 420 },
        { c: 'M5456', nm: '상병 M5456', m: 2, s: 8, x: 0, l: 90 },
      ],
    },
    { c: 'LA358', n: 25, d: [{ c: 'M5456', nm: '상병 M5456', m: 20, s: 3, x: 0, l: 380 }] },
  ],
  suggestions: [{ c: 'KK090', n: 40, k: 900, miss: 4, g: [{ c: 'M17', nm: '상병 M1706', k: 900, x: 0 }] }],
}

const CATALOG_CODES: [code: string, name: string, kind: HospitalCatalog['codes'][number]['kind']][] = [
  ['A15', '리도카인주', 'drug'],
  ['A21', '트리암주', 'drug'],
  ['A49', '아라간플러스주', 'drug'],
  ['AA254', '재진', 'other'],
  ['G6502', '수지 2매', 'other'],
  ['KK061', '신경간내주사', 'procedure'],
  ['KK090', '관절강내주사', 'procedure'],
  ['KR006', '도수치료', 'procedure'],
  ['LA357', '척추부신경', 'procedure'],
  ['LA358', '후지내측지', 'procedure'],
  ['MM010', '표층열', 'procedure'],
  ['MM020', '심층열', 'procedure'],
  ['MM410', '수압팽창술', 'procedure'],
  ['X1', '가상진통정', 'drug'],
  ['Y2', '가상소염캡슐', 'drug'],
]

const CATALOG: HospitalCatalog = {
  codes: CATALOG_CODES.map(([code, name, kind]) => ({ code, name, kind, active: true, standardCode: code })),
  la: [
    { code: 'LA357', name: '척추부신경 차단술(가상 이름)', active: true },
    { code: 'LA358', name: '후지내측지 신경 차단술(가상 이름)', active: true },
  ],
}

// ── 씨앗 난수(mulberry32). Math.random을 쓰지 않는다 ──────────

type Rand = () => number

function mulberry32(seed: number): Rand {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pick = <T>(rand: Rand, items: readonly T[]): T => items[Math.floor(rand() * items.length)]

const FILLER_CODES = ['MM010', 'MM020', 'KK090', 'A21', 'A15', 'LA358', 'KR006', 'AA254']
const FILLER_MEMOS = ['지난번 메모(가상)', '주사 1회(가상 메모)']

// ── 표 줄 만들기 ─────────────────────────────────────────

const chartOf = (n: number) => `9${String(n).padStart(5, '0')}`
const nameOf = (n: number) => `가상환자${String(n).padStart(2, '0')}`
const compactDay = (ymd: string) => ymd.replace(/-/g, '')
const ROLE: Record<string, string> = { true: '주상병', false: '부상병', x: '배재상병' } // 비트 표기(배재)

function rows83(visits: readonly FakeVisit[]): GridRow[] {
  const rows: GridRow[] = []
  for (const v of visits) {
    const base = { 내원번호: v.id, 차트번호: chartOf(v.chart), 환자명: nameOf(v.chart) }
    const cells = v.lines.length === 0 ? [''] : v.joined ? [v.lines.join('\n')] : v.lines
    for (const cell of cells) rows.push({ ...base, 증상: cell, 기록날짜: compactDay(v.date) })
  }
  // 비트 83 표 끝의 건수 줄(원본 isChartSummaryRow). 증상이 비어 진료가 되지 않는다
  rows.push({ 내원번호: '【총계】', 차트번호: `${visits.length}건`, 환자명: '', 증상: '', 기록날짜: '' })
  return rows
}

function rows83d(visits: readonly FakeVisit[]): GridRow[] {
  return visits.flatMap((v) =>
    v.dx.map(([code, role]) => ({
      내원번호: v.id,
      차트번호: chartOf(v.chart),
      상병청구코드: code,
      상병명칭: `상병 ${code}`,
      주상병여부: ROLE[String(role)],
      산정특례기호: '',
      과목코드: 'OS',
      진단일자: compactDay(v.date),
    })),
  )
}

function rows47(visits: readonly FakeVisit[]): GridRow[] {
  const rows: GridRow[] = visits.flatMap((v) =>
    v.rx.map(([code, name, qty, pay]) => ({
      처방코드: code,
      처방명칭: name,
      차트번호: chartOf(v.chart),
      처방일자: compactDay(v.date),
      급여구분: pay ?? '급여',
      수량: qty,
    })),
  )
  // 비트 47 표의 합계 줄(차트번호가 비어 건너뛴다)
  rows.push({ 처방코드: '▶ 합계', 처방명칭: '', 차트번호: '', 처방일자: '', 급여구분: '', 수량: '' })
  return rows
}

/** 12개월 이력: 그 기간의 진료(증상 없는 v17도 비트에는 내원이 있다) + 일부러 넣은 지난 내원 + 씨앗으로 채운 지난 내원 */
function historyRows(month: FakeMonth, rand: Rand): HistoryRow[] {
  const used = new Set<string>()
  const rows: HistoryRow[] = []
  for (const v of month.visits) {
    used.add(`${v.chart}|${v.date}`)
    rows.push({ v: v.id, p: chartOf(v.chart), d: v.date, c: [...new Set(v.rx.map(([code]) => code.toUpperCase()))], m: v.memo ?? '' })
  }
  for (const p of month.past) {
    used.add(`${p.chart}|${p.date}`)
    rows.push({ v: p.id, p: chartOf(p.chart), d: p.date, c: p.codes, m: p.memo })
  }
  const charts = [...new Set(month.visits.map((v) => v.chart))].sort((a, b) => a - b)
  for (const chart of charts) {
    const visits = Math.floor(rand() * 4) // 0~3번 더 왔다
    for (let i = 0; i < visits; i++) {
      const date = addDays(month.from, -(1 + Math.floor(rand() * 364))) // 기간 시작 365일 전 ~ 하루 전
      const codes = [...new Set(Array.from({ length: 1 + Math.floor(rand() * 3) }, () => pick(rand, FILLER_CODES)))]
      const memo = rand() < 0.25 ? pick(rand, FILLER_MEMOS) : ''
      if (used.has(`${chart}|${date}`)) continue
      used.add(`${chart}|${date}`)
      rows.push({ v: `h${chartOf(chart)}-${i}`, p: chartOf(chart), d: date, c: codes, m: memo })
    }
  }
  // 도우미 SQL처럼 환자 → 날짜 → 내원번호 차례
  return rows.sort((a, b) => a.p.localeCompare(b.p) || compareYmd(a.d, b.d) || a.v.localeCompare(b.v))
}

function buildMonth(month: FakeMonth, rand: Rand): ClaimMonthJson {
  const s83 = rows83(month.visits)
  const s83d = rows83d(month.visits)
  const s47 = rows47(month.visits)
  const history = historyRows(month, rand)
  return {
    version: 1,
    period: { from: month.from, to: month.to },
    historyRange: { from: addDays(month.from, -365), to: month.to },
    trendRange: { from: addDays(TODAY, -364), to: TODAY },
    counts: { s83: s83.length, s83d: s83d.length, s47: s47.length, history: history.length },
    s83,
    s83d,
    s47,
    history,
    historyStats: { invalidRows: 0, invalidCodes: 0, truncated: 0 },
    dxTrend: DX_TREND,
    catalog: CATALOG,
  }
}

/** 사례마다 도우미 claim.month JSON. 같은 씨앗이면 같은 결과다(사례마다 씨앗 + 차례 번호) */
export function buildFakeClaims(seed: number = FAKE_SEED): { name: string; file: string; json: ClaimMonthJson }[] {
  return FAKE_CLAIM_CASES.map((c, index) => ({
    name: c.name,
    file: c.file,
    json: structuredClone(buildMonth(c.month, mulberry32(seed + index * 7919))),
  }))
}

/** 파일에 쓰는 글자(사람이 읽기 쉽게 들여 쓴 JSON. 도우미는 들여 쓰지 않지만 풀면 같은 값이다) */
export function fakeClaimText(json: ClaimMonthJson): string {
  return `${JSON.stringify(json, null, 2)}\n`
}

export function writeFakeClaims(dir: string): string[] {
  mkdirSync(dir, { recursive: true })
  return buildFakeClaims().map(({ file, json }) => {
    const path = join(dir, file)
    writeFileSync(path, fakeClaimText(json))
    return path
  })
}

// 직접 돌릴 때만(시험이 import하면 돌지 않는다). import.meta를 쓰지 않는다(make-fake-fixtures.ts와 같은 까닭)
const script = process.argv[1] === undefined ? '' : resolve(process.argv[1])
if (/[\\/]fixtures[\\/]precheck[\\/]make-fake-claims\.ts$/.test(script)) {
  const root = resolve(dirname(script), '..', '..')
  for (const path of writeFakeClaims(join(dirname(script), 'fake'))) console.log(relative(root, path))
}
