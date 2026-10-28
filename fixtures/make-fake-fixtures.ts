import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import iconv from 'iconv-lite'
import * as XLSX from 'xlsx'

// 비트U차트 '환자별 소모 통계'를 흉내 낸 **가짜** 파일 생성기. 실제 환자 자료는 한 글자도 쓰지 않는다.
// 파서·계산·E2E 시험이 이 파일들을 쓴다. `npm run fixtures`로 fixtures/fake-bit/·public/fake-sample/을 다시 만든다.
// scripts/가 아니라 여기 둔다: scripts/는 Vercel에 안 올라가 시험이 import하면 빌드 타입 검사가 깨진다.

// 사용자가 준 실제 첫 줄 순서 그대로
export const BIT_HEADER: readonly string[] = Object.freeze([
  '처방코드', '처방명칭', '유형', '차트번호', '성명', '투여량', '투여일수', '총투여량', '단가', '금액', '급/비',
  '처방일자', '주민번호', '전화번호', '휴대폰', '외래/입원', '원내/원외', '이메일', '우편번호', '주소', '주치의',
  '초재진구분', '주상병',
])

export type FakeOptions = {
  seed?: number
  from?: string // 'YYYY-MM-DD'
  to?: string
  patients?: number // 기본: rows / 6
  rows?: number // 본문 줄 수(머리줄·반복 머리줄·소계·합계 빼고), 기본 3,000
  withPeriodLine?: boolean // 기본 true
}

// fake-bad-rows.csv에 넣은 잘못된 줄 수(E-PARSE-ROW 시험용)
export const FAKE_BAD_ROWS = { emptyDate: 3, invalidDate: 2, emptyChart: 2 } as const

const DEFAULTS = { seed: 20261024, from: '2026-09-01', to: '2026-10-24', rows: 3000 }
const TITLE = '환자별 소모 통계'
const SCRIPT_NAME = '<script>alert(1)</script>'
const SCRIPT_CODE = 'M3002'

const col = (name: string) => BIT_HEADER.indexOf(name)
const CODE = col('처방코드')
const NAME = col('처방명칭')
const CHART = col('차트번호')
const AMOUNT = col('금액')
const DATE = col('처방일자')
const VISIT_TYPE = col('외래/입원')

// ── 가짜 값 ─────────────────────────────────────────────

type Rx = { code: string; name: string; type: string; price: number; covered: boolean; weight: number }

const FIRST_EXAM: Rx = { code: 'AA154', name: '초진 진찰료', type: '진찰료', price: 18000, covered: true, weight: 0 }
const RETURN_EXAM: Rx = { code: 'AA254', name: '재진 진찰료', type: '진찰료', price: 12900, covered: true, weight: 0 }
// 실제 코드일 필요 없다. 이름 하나에는 쉼표를 넣어 CSV 따옴표를 시험한다
const TREATMENTS: readonly Rx[] = [
  { code: 'D1001', name: '가짜정 10mg', type: '약품', price: 120, covered: true, weight: 10 },
  { code: 'D1002', name: '가짜캡슐 250mg', type: '약품', price: 85, covered: true, weight: 8 },
  { code: 'D1003', name: '가짜연고 5g, 외용', type: '약품', price: 2300, covered: true, weight: 3 },
  { code: 'J2001', name: '가짜주사액 1mL', type: '주사', price: 1500, covered: true, weight: 6 },
  { code: 'J2002', name: '가짜수액 500mL', type: '주사', price: 4200, covered: true, weight: 1 },
  { code: 'M3001', name: '드레싱(소)', type: '처치', price: 3100, covered: true, weight: 4 },
  { code: SCRIPT_CODE, name: '단순처치', type: '처치', price: 2500, covered: true, weight: 2 },
  { code: 'B4001', name: '일반혈액검사', type: '검사', price: 2800, covered: true, weight: 4 },
  { code: 'B4002', name: '소변검사', type: '검사', price: 1200, covered: true, weight: 2 },
  { code: 'MM042', name: '표층열치료', type: '물리치료', price: 1000, covered: true, weight: 9 },
  { code: 'MM301', name: '간섭파전류치료', type: '물리치료', price: 2000, covered: true, weight: 7 },
  { code: 'MM302', name: '도수치료', type: '물리치료', price: 50000, covered: false, weight: 2 },
]
// 지번 · 도로명 · 시+구 · 읍·리 · 빈 값. 번지는 예시 숫자만. 양평은 일부러 드물게(5명 미만 동네)
const ADDRESSES: ReadonlyArray<readonly [string, number]> = [
  ['서울특별시 강남구 역삼동 123-4', 24],
  ['서울특별시 강남구 삼성동 123-4', 12],
  ['서울특별시 서초구 서초동 123-4', 10],
  ['서울특별시 송파구 잠실동 123-4', 6],
  ['서울특별시 강남구 테헤란로 123', 10],
  ['서울특별시 서초구 강남대로 123', 5],
  ['경기도 성남시 분당구 정자동 12', 8],
  ['경기도 성남시 분당구 서현동 12', 5],
  ['경기도 수원시 영통구 매탄동 12', 3],
  ['경기도 화성시 봉담읍 와우리 45', 4],
  ['경기도 양평군 양평읍 양근리 45', 1],
  ['', 6],
]
const DOCTORS = ['가짜의사1', '가짜의사2', '가짜의사3']
const DISEASES = ['J00', 'J20.9', 'M54.5', 'K29.7', 'I10', 'E11.9']
const UNKNOWN_VISIT = ['초진외', '기타'] // 값 표에 없는 초재진구분

type Patient = { chart: string; no: string; address: string; doctor: string; disease: string; plan: Rx[] }

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

function pick<T>(rand: Rand, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)]
}

function pickWeighted<T>(rand: Rand, items: ReadonlyArray<readonly [T, number]>): T {
  let left = rand() * items.reduce((sum, [, w]) => sum + w, 0)
  for (const [item, weight] of items) {
    left -= weight
    if (left < 0) return item
  }
  return items[items.length - 1][0]
}

const TREATMENT_WEIGHTS = TREATMENTS.map((rx) => [rx, rx.weight] as const)

// ── 날짜: UTC 하루 번호로만 센다(시간대에 따라 하루 밀리지 않게) ──────

const DAY_MS = 86_400_000
const EXCEL_EPOCH = 25569 // 1899-12-30 → 1970-01-01 날 수
const pad = (n: number, width = 2) => String(n).padStart(width, '0')

function dayText(day: number): string {
  const d = new Date(day * DAY_MS)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

function dayNumber(date: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const day = m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY_MS : NaN
  if (!Number.isInteger(day) || dayText(day) !== date) throw new Error(`날짜는 'YYYY-MM-DD'로 주세요: ${date}`)
  return day
}

const weekdayOf = (day: number) => new Date(day * DAY_MS).getUTCDay() // 0 = 일요일

// total을 무게대로 나눈다(합이 정확히 total)
function spread(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0)
  const exact = weights.map((w) => (total * w) / sum)
  const out = exact.map(Math.floor)
  const left = total - out.reduce((a, b) => a + b, 0)
  const order = exact.map((x, i) => [x - out[i], i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1])
  for (let k = 0; k < left; k++) out[order[k][1]]++
  return out
}

// ── 본문 만들기 ─────────────────────────────────────────

type FakeData = { from: string; to: string; records: string[][] } // records: BIT_HEADER 순서의 본문 줄

function generate(opts: FakeOptions): FakeData {
  const seed = opts.seed ?? DEFAULTS.seed
  const from = opts.from ?? DEFAULTS.from
  const to = opts.to ?? DEFAULTS.to
  const rows = opts.rows ?? DEFAULTS.rows
  const patientCount = opts.patients ?? Math.max(1, Math.round(rows / 6))
  const first = dayNumber(from)
  const last = dayNumber(to)
  if (first > last) throw new Error(`from(${from})이 to(${to})보다 늦어요`)
  if (!Number.isInteger(rows) || rows < 0) throw new Error(`rows는 0 이상 정수: ${rows}`)
  if (!Number.isInteger(patientCount) || patientCount < 1 || patientCount > 999_999) {
    throw new Error(`patients는 1~999999 정수: ${patientCount}`)
  }

  // 일요일은 진료 없음, 토요일은 적게
  const days: Array<{ date: string; weight: number }> = []
  for (let day = first; day <= last; day++) {
    const wd = weekdayOf(day)
    if (wd !== 0) days.push({ date: dayText(day), weight: wd === 6 ? 0.4 : 1 })
  }
  if (days.length === 0 && rows > 0) throw new Error(`기간에 진료일(월~토)이 없어요: ${from} ~ ${to}`)

  const rand = mulberry32(seed)
  const patients: Patient[] = []
  const propensity: number[] = [] // 자주 오는 환자일수록 재진 뽑기 통에 여러 번 들어간다
  for (let i = 0; i < patientCount; i++) {
    const no = pad(i + 1, 4)
    const plan = [pickWeighted(rand, TREATMENT_WEIGHTS)]
    const second = pickWeighted(rand, TREATMENT_WEIGHTS)
    if (rand() < 0.5 && second !== plan[0]) plan.push(second)
    patients.push({
      // 9000001부터 차례로(9로 시작하는 7자리), 환자마다 고정. 성명 번호와 같은 번호
      chart: `9${pad(i + 1, 6)}`,
      no,
      address: pickWeighted(rand, ADDRESSES),
      doctor: pick(rand, DOCTORS),
      disease: pick(rand, DISEASES),
      plan,
    })
    const r = rand()
    propensity.push(r < 0.5 ? 1 : r < 0.8 ? 2 : r < 0.95 ? 4 : 8)
  }

  const weights = days.map((d) => d.weight)
  const rowQuota = days.length > 0 ? spread(rows, weights) : []
  const newQuota = days.length > 0 ? spread(patientCount, weights) : []
  const records: string[][] = []
  const pool: number[] = [] // 어제까지 온 환자(재진 후보)
  const firstDay: number[] = []
  let nextPatient = 0
  let newBy = 0

  for (let d = 0; d < days.length; d++) {
    const { date } = days[d]
    newBy += newQuota[d]
    const today = new Set<number>()
    const fresh: number[] = []
    let left = rowQuota[d]
    while (left > 0) {
      let p: number
      if (nextPatient < patientCount && (nextPatient < newBy || pool.length === 0)) {
        p = nextPatient++
        firstDay[p] = d
        fresh.push(p)
      } else if (pool.length > 0) {
        p = pick(rand, pool)
        for (let retry = 0; retry < 4 && today.has(p); retry++) p = pick(rand, pool)
      } else {
        p = pick(rand, fresh) // 환자가 모자라면 오늘 온 환자가 처방을 더 받는다
      }
      today.add(p)
      const isNew = firstDay[p] === d
      const inpatient = rand() < 0.02
      const lines = visitLines(rand, patients[p].plan, isNew)
      for (const rx of lines.slice(0, left)) {
        const visit = rand() < 0.01 ? pick(rand, UNKNOWN_VISIT) : isNew ? '신환' : '재진'
        records.push(makeRecord(rand, patients[p], rx, date, visit, inpatient))
      }
      left -= Math.min(lines.length, left)
    }
    for (const p of fresh) for (let k = 0; k < propensity[p]; k++) pool.push(p)
  }
  return { from, to, records }
}

// 한 번 온 날의 처방 줄들. 가끔 같은 처방이 두 번(같은 환자·같은 날·같은 처방 = 1건 시험용)
function visitLines(rand: Rand, plan: Rx[], isNew: boolean): Rx[] {
  const exam = isNew ? FIRST_EXAM : RETURN_EXAM
  const lines: Rx[] = []
  if (rand() < 0.9) lines.push(exam)
  for (const rx of plan) if (rand() < 0.7) lines.push(rx)
  if (rand() < 0.15) {
    const extra = pickWeighted(rand, TREATMENT_WEIGHTS)
    if (!lines.includes(extra)) lines.push(extra)
  }
  if (lines.length === 0) lines.push(exam)
  if (rand() < 0.02) lines.push(pick(rand, lines))
  return lines
}

function makeRecord(rand: Rand, p: Patient, rx: Rx, date: string, visit: string, inpatient: boolean): string[] {
  const drug = rx.type === '약품'
  const dose = drug ? pick(rand, [1, 2, 3]) : 1
  const days = drug ? pick(rand, [3, 5, 7]) : 1
  const values: Record<string, string> = {
    처방코드: rx.code,
    처방명칭: rx.name,
    유형: rx.type,
    차트번호: p.chart,
    성명: `가짜환자${p.no}`,
    투여량: String(dose),
    투여일수: String(days),
    총투여량: String(dose * days),
    단가: String(rx.price),
    금액: String(rx.price * dose * days),
    '급/비': rx.covered ? '급여' : '비급여',
    처방일자: date,
    주민번호: 'XXXXXX-XXXXXXX', // 자리표시만(주민번호 모양 숫자 금지)
    전화번호: `000-0000-${p.no}`,
    휴대폰: `000-1111-${p.no}`,
    '외래/입원': inpatient ? '입원' : '외래',
    '원내/원외': drug ? '원외' : '원내',
    이메일: `fake${p.no}@example.invalid`,
    우편번호: '00000',
    주소: p.address,
    주치의: p.doctor,
    초재진구분: visit,
    주상병: p.disease,
  }
  return BIT_HEADER.map((name) => values[name])
}

// ── 표 모양: 제목 줄·기간 줄·빈 줄·머리줄·본문(가운데 반복 머리줄)·소계·합계 ──

type Layout = { withPeriodLine?: boolean; columns?: readonly string[]; rename?: Readonly<Record<string, string>> }

const SUMMARY_EMPTY: readonly string[] = ['처방코드', '처방일자', '차트번호'] // 소계·합계 줄에서 비는 칸

function layout(data: FakeData, opts: Layout = {}): string[][] {
  const columns = opts.columns ?? BIT_HEADER
  const index = columns.map(col)
  const header = columns.map((name) => opts.rename?.[name] ?? name)
  const table: string[][] = [[TITLE]]
  if (opts.withPeriodLine ?? true) table.push([`기간: ${data.from} ~ ${data.to}`])
  table.push([], header)
  if (data.records.length === 0) return table

  const body = data.records.map((record) => index.map((i) => record[i]))
  const half = Math.floor(body.length / 2)
  table.push(...body.slice(0, half), [...header], ...body.slice(half))
  // 처방코드·처방일자·차트번호 칸은 비고, 그 칸들을 뺀 첫 칸(기본 순서면 처방명칭)에 글자.
  // step 5 합계 줄 규칙(처방코드·처방일자가 비고 앞쪽 칸에 '합계'·'소계')에 맞춘다. 소계 = 외래 금액, 합계 = 전체 금액
  const labelAt = columns.findIndex((name) => !SUMMARY_EMPTY.includes(name))
  const amount = (records: string[][]) => records.reduce((sum, r) => sum + Number(r[AMOUNT]), 0)
  const summary = (label: string, total: number) =>
    columns.map((name, i) => (i === labelAt ? label : name === '금액' ? String(total) : ''))
  table.push(
    summary('소계', amount(data.records.filter((r) => r[VISIT_TYPE] === '외래'))),
    summary('합계', amount(data.records)),
  )
  return table
}

export function buildFakeBitTable(opts: FakeOptions = {}): string[][] {
  return layout(generate(opts), { withPeriodLine: opts.withPeriodLine })
}

// ── 파일 모양으로 바꾸기 ─────────────────────────────────

const csvCell = (cell: string) => (/[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)

export function toCsv(table: string[][]): string {
  return table.map((row) => `${row.map(csvCell).join(',')}\r\n`).join('')
}

export function toCsvBytes(table: string[][], encoding: 'utf8' | 'utf8-bom' | 'cp949'): Uint8Array {
  const text = toCsv(table)
  if (encoding === 'cp949') return new Uint8Array(iconv.encode(text, 'cp949'))
  const bytes = new TextEncoder().encode(text)
  if (encoding === 'utf8') return bytes
  const withBom = new Uint8Array(bytes.length + 3)
  withBom.set([0xef, 0xbb, 0xbf])
  withBom.set(bytes, 3)
  return withBom
}

function toBookBytes(rows: Array<Array<string | number>>, bookType: 'xlsx' | 'biff8'): Uint8Array {
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), 'Sheet1')
  // SheetJS 기본은 zip 압축·공유 문자열표 없이 써서 3,000줄이 3MB가 된다(biff8은 둘 다 상관없음)
  return new Uint8Array(XLSX.write(book, { type: 'array', bookType, compression: true, bookSST: true }))
}

const htmlCell = (cell: string) =>
  cell.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// 비트는 HTML <table>을 확장자만 .xls로 내보내기도 한다
function toHtmlBytes(table: string[][]): Uint8Array {
  const rows = table.map((row) => `<tr>${(row.length > 0 ? row : ['']).map((c) => `<td>${htmlCell(c)}</td>`).join('')}</tr>`)
  const html = [
    '<html>',
    '<head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"></head>',
    '<body>',
    '<table border="1">',
    ...rows,
    '</table>',
    '</body>',
    '</html>',
    '',
  ].join('\r\n')
  return new TextEncoder().encode(html)
}

// ── 파일 묶음 ───────────────────────────────────────────

const withColumn = (record: string[], at: number, value: string) => record.map((v, i) => (i === at ? value : v))

// 2026-10-01 · 2026.10.01 · 2026/10/01 · 20261001 · 2026-10-01 09:30
function mixedDate(date: string, i: number): string {
  const [y, m, d] = date.split('-')
  switch (i % 5) {
    case 1:
      return `${y}.${m}.${d}`
    case 2:
      return `${y}/${m}/${d}`
    case 3:
      return `${y}${m}${d}`
    case 4:
      return `${date} ${pad(9 + (i % 9))}:${pad((i * 7) % 60)}`
    default:
      return date
  }
}

// 머리줄 아래 처방일자 칸의 'YYYY-MM-DD'를 엑셀 숫자 날짜로(2026-10-01 → 46296)
function withSerialDates(table: string[][]): Array<Array<string | number>> {
  const headerAt = table.findIndex((row) => row.join('|') === BIT_HEADER.join('|'))
  return table.map((row, r) =>
    r > headerAt && /^\d{4}-\d{2}-\d{2}$/.test(row[DATE] ?? '')
      ? row.map((cell, c) => (c === DATE ? dayNumber(cell) + EXCEL_EPOCH : cell))
      : row,
  )
}

// 처방일자 빈 줄 · 2026-13-45 줄 · 차트번호 빈 줄을 고르게 흩어 넣는다
function withBadRows(records: string[][]): string[][] {
  const bad: Array<[number, string]> = [
    ...Array<[number, string]>(FAKE_BAD_ROWS.emptyDate).fill([DATE, '']),
    ...Array<[number, string]>(FAKE_BAD_ROWS.invalidDate).fill([DATE, '2026-13-45']),
    ...Array<[number, string]>(FAKE_BAD_ROWS.emptyChart).fill([CHART, '']),
  ]
  const out = [...records]
  bad.forEach(([at, value], k) => {
    const i = Math.floor(((k + 0.5) * records.length) / bad.length)
    out[i] = withColumn(out[i], at, value)
  })
  return out
}

// 칸 순서를 섞고(처방코드가 첫 칸이 아니게) 이름에 공백·괄호 변형
const REORDERED = [
  '주소', '처방일자', '성명', '차트번호', '초재진구분', '처방명칭', '유형', '처방코드', '외래/입원', '금액', '주민번호',
  '투여량', '투여일수', '총투여량', '단가', '급/비', '전화번호', '휴대폰', '원내/원외', '이메일', '우편번호', '주치의',
  '주상병',
]
const RENAMED = { 처방코드: '처방 코드', 처방일자: '처방일자(조제일)', 초재진구분: '초재진 구분', 차트번호: '차트 번호' }

function fixtureFiles(): Array<[string, Uint8Array]> {
  const data = generate({})
  const table = layout(data)
  const csv = (t: string[][]) => toCsvBytes(t, 'utf8-bom')
  const remake = (records: string[][], opts?: Layout) => csv(layout({ ...data, records }, opts))
  const without = (name: string) => BIT_HEADER.filter((n) => n !== name)
  return [
    ['fake-utf8-bom.csv', toCsvBytes(table, 'utf8-bom')],
    ['fake-utf8.csv', toCsvBytes(table, 'utf8')],
    ['fake-cp949.csv', toCsvBytes(table, 'cp949')],
    ['fake.xlsx', toBookBytes(table, 'xlsx')],
    ['fake-biff.xls', toBookBytes(table, 'biff8')],
    ['fake-html.xls', toHtmlBytes(table)],
    ['fake-dates-mixed.csv', remake(data.records.map((r, i) => withColumn(r, DATE, mixedDate(r[DATE], i))))],
    ['fake-dates-serial.xlsx', toBookBytes(withSerialDates(table), 'xlsx')],
    ['fake-no-period.csv', csv(layout(data, { withPeriodLine: false }))],
    ['fake-reordered.csv', csv(layout(data, { columns: REORDERED, rename: RENAMED }))],
    ['fake-missing-visit.csv', csv(layout(data, { columns: without('초재진구분') }))],
    ['fake-missing-address.csv', csv(layout(data, { columns: without('주소') }))],
    ['fake-bad-rows.csv', remake(withBadRows(data.records))],
    ['fake-script-name.csv', remake(data.records.map((r) => (r[CODE] === SCRIPT_CODE ? withColumn(r, NAME, SCRIPT_NAME) : r)))],
    ['fake-empty.csv', remake([])],
    // 달이 다 지난 한 달 파일: 저장된 달 비교(9월 vs 8월, 9월 vs 작년 9월). 기간만 다르고 나머지 옵션은 기본값
    ['fake-2026-08.csv', csv(buildFakeBitTable({ from: '2026-08-01', to: '2026-08-31' }))],
    ['fake-2025-09.csv', csv(buildFakeBitTable({ from: '2025-09-01', to: '2025-09-30' }))],
  ]
}

export function writeAllFixtures(outDir: string): string[] {
  mkdirSync(outDir, { recursive: true })
  return fixtureFiles().map(([name, bytes]) => {
    const path = join(outDir, name)
    writeFileSync(path, bytes)
    return path
  })
}

// `npm run fixtures`: 가짜 파일 묶음 + 대시보드 [예시 파일로 둘러보기]용 예시 파일
function main(script: string) {
  const root = resolve(dirname(script), '..')
  const written = writeAllFixtures(join(root, 'fixtures', 'fake-bit'))
  const sample = join(root, 'public', 'fake-sample', 'bit-sample.csv')
  mkdirSync(dirname(sample), { recursive: true })
  writeFileSync(sample, toCsvBytes(buildFakeBitTable(), 'utf8-bom'))
  for (const path of [...written, sample]) console.log(relative(root, path))
}

// 직접 돌릴 때만(시험이 import하면 돌지 않는다). import.meta를 쓰지 않는다 —
// Playwright(E2E)는 이 파일을 CommonJS로 읽어 import.meta가 문법 오류가 된다
const script = process.argv[1] === undefined ? '' : resolve(process.argv[1])
if (/[\\/]fixtures[\\/]make-fake-fixtures\.ts$/.test(script)) {
  main(script)
}
