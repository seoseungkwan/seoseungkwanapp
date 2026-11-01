import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

// 환자 탭(F/U 명단) 계산·골든 시험용 **가짜** 자료 생성기. 실제 환자 자료는 한 글자도 쓰지 않는다.
// 이름 '가상환자NN', 차트번호 9로 시작하는 6자리, 전화 010-0000-NNNN, 내원번호 V+숫자.
// `npx tsx fixtures/patients/make-fake-patients.ts` → fixtures/patients/fake/*.json. 씨앗이 고정이라 늘 같은 파일이 나온다.
// 원본 결과(골든, fixtures/patients/golden)는 scripts/patients/golden/revisit.mjs·recall.mjs가 이 파일들을 원본에 넣어 만든다.
// 이 파일을 바꾸면 골든도 다시 만든다(골든 머리의 sha256이 달라져 골든 시험이 알린다).

export type ParseCase = { id: string; visitDate: string; lines: string[] }
export type WrittenCase = { id: string; visitDate: string; month: number; day: number; before: string }
export type RowsCase = { id: string; rows: unknown[][]; allowMissing?: boolean }
export type FollowupCasesFile = { note: string; parse: ParseCase[]; written: WrittenCase[] }
export type ChartRowsFile = { note: string; dateCells: unknown[]; cases: RowsCase[] }
export type RxRowsFile = { note: string; tokens: string[]; columns: string[]; cases: RowsCase[] }
export type RecallRecordCase = { chart: string; name: string; date: string; codes: string[]; text: string; phone: string }
export type RecallRuleCase = { id: string; enabled: boolean; label: string; codes: string[]; round: string; months: number }
export type RecallHistoryCase = { from: string | null; readThrough: string | null; records: RecallRecordCase[] }
export type RecallIngestCase = {
  id: string
  today: string
  codes: string[]
  from: string
  to: string
  history: RecallHistoryCase
  chart: unknown[][] | null // null이면 내원 없음
  rx: unknown[][] | null // null이면 처방·전화 없음
}
// 50,000건 넘는 사례는 파일이 커지지 않게 만드는 법만 적는다(recallBulkRecords). 건수는 원본 한도 그대로다
export type RecallBulkCase = {
  start: string
  span: number
  firstChart: number
  counts: { atLimit: number; overLimit: number }
  today: string
  codes: string[]
  from: string
  to: string
  chart: unknown[][]
  rx: unknown[][]
}
export type RecallCasesFile = {
  note: string
  round: { round: string; text: string }[]
  addMonths: { date: string; months: number }[]
  rx: RowsCase[]
  validate: { id: string; value: unknown }[]
  ingest: RecallIngestCase[]
  bulk: RecallBulkCase
  compute: { id: string; rules: RecallRuleCase[] | null; records: RecallRecordCase[] }[] // rules가 null이면 원본 DEFAULTS
  select: { from: string | null; to: string | null; overdue: boolean; today: string }[] // compute의 main으로 고른다
  status: string[] // compute의 main을 이 오늘들로 본다
  coverage: { id: string; today: string; rules: RecallRuleCase[] | null; history: { from: string | null; records: RecallRecordCase[] } }[]
  copy: { id: string; records: RecallRecordCase[]; rx: unknown[][] | null }[]
}
// 도우미 contact.targets 답(design.md)과 store.load 답
export type TargetsReply = { v: 1; kind: 'followup' | 'injection'; from: string; to: string; chart: string[][]; rx: string[][] }
export type TargetsFile = { note: string; today: string; pieces: TargetsReply[] }
export type StoreFile = { note: string; contact: unknown }
export type FakePatients = {
  'followup-cases.json': FollowupCasesFile
  'chart-rows.json': ChartRowsFile
  'rx-rows.json': RxRowsFile
  'recall-cases.json': RecallCasesFile
  'targets-followup.json': TargetsFile
  'targets-injection.json': TargetsFile
  'store-first.json': StoreFile
  'store-marked.json': StoreFile
}

export const FAKE_PATIENTS_SEED = 20261101
const NOTE = '가짜 자료(fixtures/patients/make-fake-patients.ts가 만듦). 실제 환자 자료가 아니다.'

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

const int = (rand: Rand, min: number, max: number) => min + Math.floor(rand() * (max - min + 1))
const pick = <T>(rand: Rand, items: readonly T[]): T => items[Math.floor(rand() * items.length)]

function shuffle<T>(rand: Rand, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[items[i], items[j]] = [items[j], items[i]]
  }
  return items
}

// ── 날짜(UTC 계산만. 지역 시간 Date 메서드는 쓰지 않는다) ──────────

const DAY_MS = 86_400_000
const EXCEL_EPOCH = 25_569 // 1899-12-30 → 1970-01-01
const pad = (n: number, width = 2) => String(n).padStart(width, '0')
const dayOf = (ymd: string) => Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10)) / DAY_MS
const ymdOf = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10)
const plus = (ymd: string, n: number) => ymdOf(dayOf(ymd) + n)
const serialOf = (ymd: string) => dayOf(ymd) + EXCEL_EPOCH
const compact = (ymd: string) => ymd.replace(/-/g, '')
const month = (ymd: string) => +ymd.slice(5, 7)
const date = (ymd: string) => +ymd.slice(8, 10)

// 비트 화면·엑셀이 주는 기록날짜 모양 여럿(같은 날)
const DATE_FORMATS = ['iso', 'compact', 'compactNumber', 'compact12', 'compact12Number', 'compact14', 'serial', 'serialTime', 'isoTime', 'slash'] as const

function dateCell(rand: Rand, ymd: string): unknown {
  const h = int(rand, 8, 18)
  const m = int(rand, 0, 59)
  const s = int(rand, 0, 59)
  switch (pick(rand, DATE_FORMATS)) {
    case 'iso':
      return ymd
    case 'compact':
      return compact(ymd)
    case 'compactNumber':
      return Number(compact(ymd))
    case 'compact12':
      return `${compact(ymd)}${pad(h)}${pad(m)}`
    case 'compact12Number':
      return Number(`${compact(ymd)}${pad(h)}${pad(m)}`)
    case 'compact14':
      return `${compact(ymd)}${pad(h)}${pad(m)}${pad(s)}`
    case 'serial':
      return serialOf(ymd)
    case 'serialTime':
      return serialOf(ymd) + (h * 3600 + m * 60 + s) / 86400
    case 'isoTime':
      return `${ymd} ${pad(h)}:${pad(m)}:${pad(s)}`
    case 'slash':
      return `${ymd.slice(0, 4)}/${month(ymd)}/${date(ymd)}`
  }
}

// ── 가짜 사람 ──────────────────────────────────────────

const fakeName = (i: number) => `가상환자${pad(i)}`
const fakeChart = (i: number) => `9000${pad(i)}`
const fakePhone = (n: number) => `010-0000-${pad(n, 4)}`

// ── parseFU 사례 ───────────────────────────────────────

const V = '2026-10-15' // 목요일

const PARSE_FIXED: readonly (readonly [string, string, readonly string[]])[] = [
  // N주 뒤 · 일주일 뒤 · 내일 · 모레 · N일 뒤
  ['week-1', V, ['1주 뒤 f/u']],
  ['week-1-nospace', V, ['1주뒤 f/u']],
  ['week-2', V, ['2주뒤 f/u']],
  ['week-2-xr', V, ['2주 뒤 xr f/u']],
  ['week-10', V, ['10주 뒤 재내원']],
  ['week-12-il', V, ['12주일 뒤 재내원']],
  ['ilju-il-dwi', V, ['일주일 뒤 재내원']],
  ['ilju-dwi', V, ['일주 뒤 오세요']],
  ['tomorrow', V, ['내일 드레싱']],
  ['day-after', V, ['모레 dressing']],
  ['tomorrow-or-after', V, ['내일 모레 오세요']],
  ['days-3', V, ['3일 뒤 재내원']],
  ['days-10', V, ['10일뒤 f/u']],
  // 다음 주 · 요일
  ['next-week-tue', V, ['다음주 화요일 재내원']],
  ['next-week-sun-on-sun', '2026-10-18', ['다음주 일요일 f/u']],
  ['next-week-mon-on-mon', '2026-10-12', ['다음주 월 f/u']],
  ['damju-fri', V, ['담주 금 f/u']],
  ['next-week-space', V, ['다음 주 월요일 2차 주사']],
  ['next-week-only', V, ['다음주 f/u']],
  ['weekday-same', V, ['목요일 무릎주사 합니다']],
  ['weekday-sat', V, ['토요일 재내원']],
  ['weekday-sun-on-sat', '2026-10-17', ['일요일 오세요']],
  ['weekday-before-next-week', V, ['월요일 or 다음주 수 f/u']],
  ['weekday-after-next-week', V, ['다음주 수 또는 금요일 f/u']],
  // N월 초/중/말 (날짜 미정)
  ['month-early', V, ['11월 초 재내원']],
  ['month-mid', V, ['11월 중 f/u']],
  ['month-late', V, ['12월말 오세요']],
  ['month-past', V, ['9월 초 재내원']],
  // 적어 둔 날짜
  ['written-dot', V, ['10.17 f/u']],
  ['written-slash', V, ['10/19 재내원']],
  ['written-korean', V, ['10월 17일 재내원']],
  ['written-korean-space', V, ['10 월 20 일 오세요']],
  ['written-next-year', '2026-12-20', ['1/5 f/u']],
  ['written-day-120', V, ['2/12 f/u']],
  ['written-day-121', V, ['2/13 f/u']],
  ['written-same-day', V, ['10.15 f/u']],
  ['written-past', V, ['10.10 f/u']],
  ['written-invalid', V, ['2/30 f/u']],
  ['written-far', V, ['3/1 f/u']],
  ['written-two', V, ['10/20 또는 10/22 f/u']],
  ['written-after-weekday', V, ['금요일 아니면 10/19 f/u']],
  ['written-with-year', V, ['2026.10.20 재내원']],
  ['written-leap-skip', '2027-12-01', ['2/29 f/u']],
  // 날짜가 아닌 숫자
  ['vas', V, ['VAS 7/10 재내원']],
  ['nrs-with-week', V, ['NRS 5/10 1주뒤 f/u']],
  ['pain-score', V, ['pain 6/10 f/u']],
  ['score-colon', V, ['점수: 3/10 재내원']],
  ['pain-korean', V, ['통증 10/17 재내원']],
  ['l45', V, ['L4.5 MBB f/u']],
  ['l45-then-date', V, ['L4.5 MBB 10/22 f/u']],
  ['c56-next-week', V, ['C5.6 root block 다음주 화 f/u']],
  // 조건부 · 미정
  ['cond-only', V, ['아프면 오세요']],
  ['cond-week', V, ['아프면 1주뒤 재내원']],
  ['cond-written', V, ['아프면 10.20 재내원']],
  ['cond-no-better', V, ['호전 없으면 2주뒤 재내원']],
  ['cond-uncomfortable', V, ['불편하면 내일 오세요']],
  ['cond-symptom', V, ['증상 있으면 재내원']],
  ['as-needed', V, ['필요시 재내원']],
  ['later', V, ['추후 재내원']],
  // 아라간(연골주사) 회차
  ['aragan-1', V, ['아라간 1차']],
  ['aragan-2', V, ['무릎', '아라간 2차']],
  ['aragan-3', V, ['아라간 3차']],
  ['aragan-13', V, ['아라간 13차']],
  ['argan-space', V, ['아르간 1 차']],
  ['artrogen', V, ['Artrogen 2차 Rt knee']],
  ['aragan-then-date', V, ['아라간 1차', '2주뒤 f/u']],
  ['aragan-max-round', V, ['아라간 1차', '아라간 2차']],
  ['aragan-no-round', V, ['아라간']],
  // 주사 / F/U 구분 문구
  ['inject-week-round', V, ['1주뒤 2차주사']],
  ['inject-eswt-fu', V, ['다음주 화요일 ESWT후 f/u']],
  ['inject-rounds-only', V, ['다음주 월요일 2차/목요일 3차.']],
  ['inject-manual-round', V, ['1주뒤 도수치료 2차']],
  ['inject-no-injection', V, ['2주뒤 주사는 안하고 f/u']],
  ['inject-mbb', V, ['1주뒤 MBB block 재내원']],
  ['inject-dressing-round', V, ['1주 뒤 드레싱 3차']],
  ['inject-hoe-round', V, ['1주뒤 3회차 f/u']],
  // 지시 말 여러 모양
  ['fu-spaced', V, ['f / u 2주 뒤']],
  ['fu-korean-typo', V, ['ㄹ/u 1주뒤']],
  ['fu-so', V, ['s/o 내일']],
  ['fu-dressing-cap', V, ['Dressing 모레']],
  ['fu-xr', V, ['xr f 2주뒤']],
  ['fu-upper', V, ['KNEE pain 1주뒤 F/U']],
  ['multi-line-skip', V, ['', '  ', '무릎 통증', 'f/u', '2주뒤 xr f/u']],
  ['no-instruction', V, ['무릎 통증', 'x-ray 촬영']],
  ['empty', V, []],
  ['blank-lines', V, ['', '   ']],
  ['evidence-trim', V, ['   1주뒤 f/u  ']],
  // 치료(extractTx) · 부위(extractSite)
  ['tx-lines', V, ['C-MBB 시행', '주사 고려', 'IA 시행', '1주뒤 f/u', 'ESWT 3회', 'TPI']],
  ['tx-excluded', V, ['주사합니다', 'f/u 주사', '맞아왔던 주사', 'prolo 시행', '시노비안 IA', '부목 고정', 'cast']],
  ['site-many', V, ['shoulder', 'C-MBB', 'wrist', 'ankle']],
  ['site-spine', V, ['L-spine', 'T-MBB', 'SIJ block', '꼬리뼈']],
  ['site-limbs', V, ['Lt elbow 외상과염', 'CTS', 'trigger finger', 'hip pain']],
  ['site-legs', V, ['ACL', 'ATFL', 'plantar', 'heel', 'achilles', 'calf', 'hamstring', 'shin']],
  ['site-other', V, ['TMJ', 'rib fx']],
  ['site-l1', V, ['L1 compression fx']],
  ['site-c7', V, ['C7 radiculopathy']],
  ['site-aragan', V, ['아라간 2차']],
  // 터무니없이 먼 날. 여기까지는 네 자리 해라 원본과 같다
  ['far-week-416000', V, ['416000주 뒤 f/u']],
  ['far-tomorrow-last-day', '9999-12-30', ['내일 f/u']],
  ['far-written-last-day', '9999-10-01', ['12/31 f/u']],
  // 해가 네 자리를 넘거나 NaN: 원본은 그 날짜를 찍고, 우리는 날짜 없음(골든 knownDiffs)
  ['far-week-417000', V, ['417000주 뒤 f/u']],
  ['far-week-500000', V, ['500000주 뒤 f/u']],
  ['far-week-nan', V, ['99999999999주 뒤 f/u']],
  ['far-week-infinity', V, [`${'9'.repeat(400)}주 뒤 f/u`]],
  ['far-days-date-like', V, ['20261015일 뒤 f/u']],
  ['far-days-2930000', V, ['2930000일 뒤 재내원']],
  ['far-tomorrow', '9999-12-31', ['내일 f/u']],
  ['far-day-after', '9999-12-31', ['모레 f/u']],
  ['far-one-week', '9999-12-31', ['일주일 뒤 f/u']],
  ['far-next-week', '9999-12-30', ['다음주 월요일 f/u']],
  ['far-next-week-short', '9999-12-30', ['담주 금 f/u']],
  ['far-weekday', '9999-12-31', ['금요일 f/u']],
  ['far-written', '9999-10-01', ['1/5 f/u']],
  ['far-aragan', '9999-12-31', ['아라간 1차']],
  ['far-round-kind', V, ['500000주 뒤 2차 주사']],
  ['far-cond-no-return', V, ['불편하면 500000주 뒤 f/u']],
  // 날짜를 못 준 말은 안 맞은 것처럼 다음으로 넘어간다
  ['far-then-tomorrow', V, ['500000주 뒤 내일 f/u']],
  ['far-then-days', V, ['500000주 뒤 3일 뒤 f/u']],
  ['far-then-weekday', '9999-12-30', ['다음주 월 금요일 f/u']],
  ['far-then-written', V, ['500000주 뒤 10/19 f/u']],
  ['far-then-month', V, ['500000주 뒤 11월 초 재내원']],
  ['far-then-later', V, ['2930000일 뒤 추후 재내원']],
  ['far-then-next-line', V, ['500000주 뒤 f/u', '2주뒤 f/u']],
  ['far-then-aragan', V, ['500000주 뒤 f/u', '아라간 1차']],
  ['far-then-cond', V, ['아프면 500000주 뒤 재내원']],
  // 한 줄에 날짜 말이 여럿이면 원본이 먼저 보는 순서
  ['order-weeks-before-tomorrow', V, ['내일 또는 1주뒤 f/u']],
  ['order-written-before-days', V, ['3일 뒤 또는 10/19 f/u']],
  ['order-weekday-before-days', V, ['3일 뒤 금요일 f/u']],
  ['order-days-before-month', V, ['3일 뒤 11월 초 f/u']],
  ['order-month-before-later', V, ['11월 초 추후 재내원']],
]

const SYMPTOMS = [
  '무릎 통증',
  'Rt knee pain',
  'LBP',
  '허리 통증 / 방사통',
  'C-MBB 시행',
  'L-spine MBB',
  'shoulder pain',
  '어깨 회전근개',
  'IA 시행',
  'ESWT 3회',
  'TPI',
  '손목 통증 CTS',
  'ankle sprain ATFL',
  'plantar fasciitis',
  'x-ray 촬영',
  '물리치료',
  '주사 고려',
  '시노비안 IA',
  'prolo 시행',
  'trigger finger',
  'hip pain',
  'heel pain',
] as const

const INSTRUCTIONS = [
  '1주뒤 f/u',
  '2주뒤 f/u',
  '2주 뒤 xr f/u',
  '3주뒤 재내원',
  '4주 뒤 f/u',
  '내일 드레싱',
  '모레 dressing',
  '3일 뒤 재내원',
  '다음주 화요일 재내원',
  '담주 금 f/u',
  '다음 주 월요일 2차 주사',
  '목요일 무릎주사 합니다',
  '1주뒤 2차주사',
  '1주뒤 MBB block 재내원',
  '다음주 화요일 ESWT후 f/u',
  '1주뒤 도수치료 2차',
  '아프면 오세요',
  '아프면 1주뒤 재내원',
  '호전 없으면 2주뒤 재내원',
  '필요시 재내원',
  '추후 재내원',
  '11월 초 재내원',
  '11월 말 f/u',
  '9월 초 재내원',
  '아라간 1차',
  '아라간 2차',
  '아라간 3차',
  'VAS 7/10 재내원',
  'f/u',
] as const

// 진료일 뒤 n일을 적어 둔 지시(10.17 · 10/19 · 10월 17일)
function writtenInstruction(rand: Rand, visit: string): string {
  const target = plus(visit, int(rand, 0, 130))
  const m = month(target)
  const d = date(target)
  return pick(rand, [`${m}.${d} f/u`, `${m}/${d} 재내원`, `${m}월 ${d}일 재내원`, `아프면 ${m}/${d} 오세요`])
}

function symptomLines(rand: Rand, visit: string): string[] {
  const lines: string[] = []
  for (let n = int(rand, 0, 2); n > 0; n--) lines.push(pick(rand, SYMPTOMS))
  const roll = rand()
  if (roll < 0.55) lines.push(pick(rand, INSTRUCTIONS))
  else if (roll < 0.8) lines.push(writtenInstruction(rand, visit))
  return lines
}

// 명단 시험용 내원: 지시가 더 자주 있다(같은 날 여러 명이 모이게)
function visitLines(rand: Rand, visit: string): string[] {
  const lines: string[] = []
  for (let n = int(rand, 0, 2); n > 0; n--) lines.push(pick(rand, SYMPTOMS))
  const roll = rand()
  if (roll < 0.75) lines.push(pick(rand, INSTRUCTIONS))
  else if (roll < 0.9) lines.push(writtenInstruction(rand, visit))
  return lines
}

function parseCases(rand: Rand): ParseCase[] {
  const fixed = PARSE_FIXED.map(([id, visitDate, lines]) => ({ id, visitDate, lines: [...lines] }))
  const random: ParseCase[] = []
  for (let i = 1; i <= 40; i++) {
    const visitDate = plus('2026-01-01', int(rand, 0, 364))
    random.push({ id: `random-${pad(i)}`, visitDate, lines: symptomLines(rand, visitDate) })
  }
  return [...fixed, ...random]
}

const WRITTEN: readonly (readonly [string, string, number, number, string])[] = [
  ['in-range', V, 10, 17, ''],
  ['same-day', V, 10, 15, ''],
  ['day-before', V, 10, 14, ''],
  ['year-end', V, 12, 31, ''],
  ['day-120', V, 2, 12, ''],
  ['day-121', V, 2, 13, ''],
  ['next-year', '2026-12-20', 1, 5, ''],
  ['feb-29-first-year-missing', '2027-12-01', 2, 29, ''],
  ['feb-29-leap', '2027-12-30', 2, 29, ''],
  ['apr-31', V, 4, 31, ''],
  ['month-0', V, 0, 10, ''],
  ['month-13', V, 13, 1, ''],
  ['day-0', V, 11, 0, ''],
  ['day-32', V, 11, 32, ''],
  ['after-vas', V, 10, 17, 'VAS '],
  ['after-vas-colon', V, 10, 17, 'VAS: '],
  ['after-nrs-equals', V, 10, 17, 'nrs='],
  ['after-pain', V, 10, 17, 'Pain '],
  ['after-pain-korean', V, 10, 17, '통증'],
  ['after-score', V, 10, 17, '점수 : '],
  ['after-vas-number', V, 10, 17, 'VAS 7 '],
  ['after-text', V, 10, 17, '무릎 '],
  ['far-same-year', '9999-10-01', 12, 31, ''],
  ['far-next-year', '9999-10-01', 1, 5, ''], // 다음 해가 다섯 자리: 원본은 그 날짜, 우리는 없음(골든 knownDiffs)
]

// ── 83 표(chart) ─────────────────────────────────────────

const CHART_HEADER = ['내원번호', '차트번호', '환자명', '증상', '기록날짜']
const MAIN_PATIENTS = 40
const NATIVE_HEADER = ['No', '내원번호', '차트번호', '환자명', '보험유형', '증상', '기록날짜']

// 앞자리 0·숫자·.0·빈칸이 붙은 차트번호(원본 normChart 맞추기)
function chartCell(i: number): unknown {
  if (i === 25) return '0900025'
  if (i === 26) return 900026
  if (i === 27) return '900027.0'
  if (i === 28) return ' 900028 '
  return fakeChart(i)
}

function mainChartRows(rand: Rand): unknown[][] {
  type Visit = { i: number; day: string; order: number }
  const visits: Visit[] = []
  for (let i = 1; i <= MAIN_PATIENTS; i++) {
    for (let n = int(rand, 1, 3); n > 0; n--) visits.push({ i, day: plus('2026-10-01', int(rand, 0, 29)), order: rand() })
  }
  visits.sort((a, b) => a.day.localeCompare(b.day) || a.order - b.order)
  const rows: unknown[][] = []
  visits.forEach((v, index) => {
    const visitNo = `V${990 + index}` // V999 → V1000을 넘는다(원본은 숫자 순서로 센다)
    const lines = rand() < 0.06 ? [] : visitLines(rand, v.day)
    const cells = lines.length ? lines : ['']
    for (const line of cells) rows.push([visitNo, chartCell(v.i), fakeName(v.i), line, dateCell(rand, v.day)])
  })
  rows.push(['', '', '', '', ''], ['', '', '', '', ''], ['', '', '', '', '20261001'])
  return [CHART_HEADER, ...shuffle(rand, rows)]
}

function chartCases(rand: Rand): RowsCase[] {
  const row = (visitNo: string, i: number, symptom: string, day: unknown) => [visitNo, fakeChart(i), fakeName(i), symptom, day]
  const footer = (count: string) => ['【 총 계 】', '', count, '', '', '', '']
  const native = [
    NATIVE_HEADER,
    ['1', 'V101', fakeChart(21), fakeName(21), '건보', '1주뒤 f/u', '202610070915'],
    ['2', 'V102', fakeChart(22), fakeName(22), '건보', '2주뒤 f/u', '202610071015'],
    ['3', 'V103', fakeChart(21), fakeName(21), '건보', '', '202610081100'],
  ]
  const lookalike = (extra: unknown[]) => ({ rows: [...native, extra] })
  const filler = (n: number) => Array.from({ length: n }, () => [''])
  const cases: (Omit<RowsCase, 'rows'> & { rows: unknown[][] })[] = [
    { id: 'main', rows: mainChartRows(rand) },
    { id: 'ok-native-footer', rows: [...native, footer('3건')] },
    { id: 'ok-native-footer-comma', rows: [...native, ['【총계】', '', '1,295건', '', '', '', '']] },
    {
      id: 'ok-title-rows',
      rows: [['전산자료증상'], ['조회기간', '2026-10-01 ~ 2026-10-07'], CHART_HEADER, row('V1', 1, '1주뒤 f/u', '2026-10-07')],
    },
    {
      id: 'ok-no-visit-column',
      rows: [
        ['차트번호', '환자명', '증상', '기록날짜'],
        [fakeChart(1), fakeName(1), '무릎 통증', '20261007'],
        [fakeChart(1), fakeName(1), '1주뒤 f/u', '202610070930'],
        [fakeChart(2), fakeName(2), '아라간 1차', '20261008'],
      ],
    },
    {
      id: 'ok-spaced-header',
      rows: [['내원 번호', '환자 차트번호', '환자명', '증 상', '기록 날짜'], row('V1', 1, '2주뒤 f/u', '2026-10-07')],
    },
    {
      id: 'ok-visit-order',
      rows: [
        CHART_HEADER,
        row('V1000', 1, 'f/u', '20261007'),
        row('V998', 2, 'f/u', '20261007'),
        row('V1001', 3, 'f/u', '20261007'),
        row('V999', 4, 'f/u', '20261007'),
        row('V10', 5, 'f/u', '20261006'),
        row('V9', 6, 'f/u', '20261006'),
      ],
    },
    { id: 'ok-visit-decimal', rows: [CHART_HEADER, row('V1001.0', 1, '무릎 통증', '20261007'), row('V1001', 1, '1주뒤 f/u', '20261007')] },
    {
      id: 'ok-newer-blank',
      rows: [CHART_HEADER, row('V1', 1, '1주뒤 f/u', 20261007), row('V2', 1, '2주뒤 f/u', 20261008), row('V4', 1, '', 20261009)],
    },
    {
      id: 'ok-blank-rows',
      rows: [CHART_HEADER, ['', '', '', '', ''], row('V1', 1, '1주뒤 f/u', '20261007'), ['', '', '', '', '20261007'], ['', '', '', '']],
    },
    {
      id: 'ok-chart-variants',
      rows: [
        CHART_HEADER,
        ['V1', '0900025', fakeName(25), '1주뒤 f/u', '20261007'],
        ['V2', 900026, fakeName(26), '2주뒤 f/u', '20261007'],
        ['V3', '900027.0', fakeName(27), '내일 드레싱', '20261007'],
        ['V4', ' 900028 ', ` ${fakeName(28)} `, ' 모레 f/u ', '20261007'],
      ],
    },
    { id: 'ok-same-day-two-visits', rows: [CHART_HEADER, row('V2', 1, '2주뒤 f/u', '20261007'), row('V1', 1, '1주뒤 f/u', '20261007')] },
    {
      id: 'ok-recorded-max',
      rows: [
        CHART_HEADER,
        row('V1', 1, '무릎 통증', '202610070915'),
        row('V1', 1, 'IA 시행', '202610071730'),
        row('V1', 1, '1주뒤 f/u', '2026-10-07 12:00'),
        row('V2', 2, '1주뒤 f/u', serialOf('2026-10-07') + 0.5),
      ],
    },
    { id: 'ok-header-row-20', rows: [...filler(19), CHART_HEADER, row('V1', 1, '1주뒤 f/u', '20261007')] },
    {
      // 터무니없이 먼 날이 적힌 줄이 섞여도 모든 내원이 나온다(날짜 없음은 골든 knownDiffs)
      id: 'ok-far-dates',
      rows: [
        CHART_HEADER,
        row('V1', 1, '1주뒤 f/u', '20261007'),
        row('V2', 2, '500000주 뒤 f/u', '20261007'),
        row('V3', 3, '20261015일 뒤 f/u', '20261007'),
        row('V4', 4, '2930000일 뒤 재내원', '20261008'),
        row('V5', 5, '99999999999주 뒤 f/u', '20261008'),
        row('V6', 6, '내일 f/u', '99991231'),
        row('V7', 7, '1/5 f/u', '99991001'),
        row('V8', 8, '아라간 1차', '99991231'),
        row('V9', 9, '아프면 500000주 뒤 재내원', '20261008'),
        row('V10', 10, '500000주 뒤 f/u', '20261008'),
        row('V10', 10, '2주뒤 f/u', '20261008'),
      ],
    },
    {
      // 기준 날짜(마지막 진료일 10-08)와 같은 예정은 남고, 하루 앞선 예정은 빠진다
      id: 'ok-base-boundary',
      rows: [
        CHART_HEADER,
        row('V1', 1, '1주뒤 f/u', '20261001'),
        row('V2', 2, '6일 뒤 f/u', '20261001'),
        row('V3', 3, '8일 뒤 f/u', '20261001'),
        row('V4', 4, '무릎 통증', '20261008'),
      ],
    },
    {
      // 같은 날 예정이면 차트번호 숫자 순서(글자 순서면 0900200이 먼저다)
      id: 'ok-chart-tie-break',
      rows: [
        CHART_HEADER,
        ['V1', '0900200', fakeName(1), '1주뒤 f/u', '20261007'],
        ['V2', '900100', fakeName(2), '1주뒤 f/u', '20261007'],
        ['V3', '900099', fakeName(3), '1주뒤 f/u', '20261007'],
      ],
    },
    {
      id: 'ok-chart-dot-zeros',
      rows: [CHART_HEADER, ['V1', '900031.00', fakeName(31), '1주뒤 f/u', '20261007'], ['V2', '900032.000', fakeName(32), '2주뒤 f/u', '20261007']],
    },
    {
      // 해가 00xx이면 원본 new Date(y, …)처럼 19xx년이 된다(서머타임·시간대가 바뀌던 해 포함)
      id: 'ok-visit-year-00xx',
      rows: [
        CHART_HEADER,
        row('V1', 1, '1주뒤 f/u', '00261007'),
        row('V2', 2, '내일 f/u', '00000229'),
        row('V3', 3, '금요일 f/u', '00991231'),
        row('V4', 4, '1/5 f/u', '00501220'),
        row('V5', 5, '아라간 1차', '00870510'),
        row('V6', 6, '내일 f/u', '00480531'),
        row('V7', 7, '1주뒤 f/u', '002610070915'),
      ],
    },
    { id: 'err-header-row-21', rows: [...filler(20), CHART_HEADER, row('V1', 1, '1주뒤 f/u', '20261007')] },
    { id: 'err-symptom-only', rows: [CHART_HEADER, row('V1', 1, '무릎 통증', '20261007'), ['', '', '', '1주뒤 f/u', '20261007']] },
    {
      // 차트번호가 첫 칸인 표: 건수만 있는 줄은 총계로 보지 않고 멈춘다
      id: 'err-count-row-chart-first',
      rows: [['차트번호', '환자명', '증상', '기록날짜'], [fakeChart(1), fakeName(1), '1주뒤 f/u', '20261007'], ['3건', '', '', '']],
    },
    { id: 'err-name-empty', rows: [CHART_HEADER, ['V1', fakeChart(1), '', '1주뒤 f/u', '20261007']] },
    { id: 'err-chart-empty', rows: [CHART_HEADER, ['V1', '', fakeName(1), '1주뒤 f/u', '20261007']] },
    { id: 'err-date-empty', rows: [CHART_HEADER, row('V1', 1, '1주뒤 f/u', '')] },
    { id: 'err-date-bad', rows: [CHART_HEADER, row('V1', 1, '1주뒤 f/u', '2026-02-30')] },
    { id: 'err-date-time-bad', rows: [CHART_HEADER, row('V1', 1, '1주뒤 f/u', '202610072400')] },
    { id: 'err-visit-empty', rows: [CHART_HEADER, row('', 1, '1주뒤 f/u', '20261007')] },
    { id: 'err-visit-two-patients', rows: [CHART_HEADER, row('V1', 1, '무릎', '20261007'), row('V1', 2, '1주뒤 f/u', '20261007')] },
    { id: 'err-visit-two-dates', rows: [CHART_HEADER, row('V1', 1, '무릎', '20261007'), row('V1', 1, '1주뒤 f/u', '20261008')] },
    {
      id: 'err-visit-two-names',
      rows: [CHART_HEADER, row('V1', 1, '무릎', '20261007'), ['V1', fakeChart(1), fakeName(2), '1주뒤 f/u', '20261007']],
    },
    { id: 'err-missing-symptom-column', rows: [['내원번호', '차트번호', '환자명', '기록날짜'], ['V1', fakeChart(1), fakeName(1), '20261007']] },
    { id: 'err-missing-name-column', rows: [['내원번호', '차트번호', '증상', '기록날짜'], ['V1', fakeChart(1), 'f/u', '20261007']] },
    { id: 'err-duplicate-chart-column', rows: [['내원번호', '차트번호', '환자차트번호', '환자명', '증상', '기록날짜']] },
    { id: 'err-duplicate-date-column', rows: [['내원번호', '차트번호', '환자명', '증상', '기록날짜', '최종기록날짜']] },
    { id: 'err-no-rows', rows: [CHART_HEADER] },
    { id: 'err-only-blank-rows', rows: [CHART_HEADER, ['', '', '', '', ''], ['', '', '', '', '20261007']] },
    { id: 'err-footer-lookalike-name', ...lookalike(['【 총 계 】', '', '3건', fakeName(1), '', '', '']) },
    { id: 'err-footer-lookalike-symptom', ...lookalike(['【 총 계 】', '', '3건', '', '', '1주뒤 f/u', '']) },
    { id: 'err-footer-lookalike-visit', ...lookalike(['【 총 계 】', 'V9999', '3건', '', '', '', '202610081100']) },
    { id: 'err-footer-lookalike-count', ...lookalike(['【 총 계 】', '', '3명', '', '', '', '']) },
    { id: 'err-footer-lookalike-label', ...lookalike(['총계', '', '3건', '', '', '', '']) },
    { id: 'err-no-header', rows: [['가', '나', '다'], ['V1', fakeChart(1), fakeName(1)]] },
  ]
  return cases
}

// dateKey·recordedStamp에 넣어 볼 칸 값(원본 시험의 사례 + 엑셀 일련번호·여러 구분 글자)
function dateCells(): unknown[] {
  const s = serialOf('2026-10-07')
  return [
    '20261007',
    '202610070000',
    '202610072359',
    '20261007091530',
    '20261007235959',
    '202610070915.0',
    202610070915,
    20261007,
    '202402291230',
    '202602300915',
    '202602291230',
    '202613010915',
    '202610072400',
    '202610071260',
    '20261007091560',
    '2026100709',
    '2026100709153',
    '202610070915.1',
    '2026-10-07',
    '2026-1-7',
    '2026/10/7',
    '2026.10.07',
    '2026-10/07',
    '2026-10-07T09:15:00',
    '2026-10-07T09:15:00.123',
    '2026-10-07 9:05',
    '2026-10-07 09:15:30',
    '2026-10-07 24:00',
    '2026-10-07 23:60',
    '2026-10-07 오전 9:15',
    '2026-10-07T09:15:00Z',
    '00000101',
    '00000229',
    '19000101',
    s,
    s + 0.375,
    s + 0.5,
    s + 0.41,
    s + 0.9999999,
    s + 0.99999999999,
    1,
    59,
    60,
    61,
    0.5,
    0.99999999,
    99999,
    100000,
    0,
    -1,
    '46302',
    '',
    '   ',
    null,
    true,
    '가상',
  ]
}

// ── 47 표(rx, 전화) ─────────────────────────────────────

const RX_HEADER = ['차트번호', '휴대폰', '보호자연락처', '팩스', '전화번호 확인일']

function mainRxRows(rand: Rand): unknown[][] {
  const phoneCells = (i: number): [string, string] => {
    switch (i) {
      case 5:
        return [fakePhone(5), fakePhone(105)] // 번호 둘 → map에 넣지 않음
      case 6:
        return [fakePhone(6), fakePhone(6)] // 같은 번호 → 하나
      case 7:
        return ['', ''] // 번호 없음
      case 8:
        return [`${fakePhone(8)} / ${fakePhone(108)}`, '']
      case 9:
        return ['01000000009', '']
      case 10:
        return ['010 0000 0010', '']
      case 11:
        return [`${fakePhone(11)}(보호자 2)`, '']
      case 12:
        return ['모름', fakePhone(112)]
      default:
        return [fakePhone(i), '']
    }
  }
  const chart = (i: number): unknown => (i === 26 ? 900026 : i === 25 ? '900025' : i === 27 ? '900027' : fakeChart(i))
  const rows: unknown[][] = []
  for (let i = 1; i <= MAIN_PATIENTS; i++) {
    if (i >= 21 && i <= 24) continue // 47 표에 없는 사람
    const [mine, guardian] = phoneCells(i)
    for (let n = int(rand, 1, 3); n > 0; n--) {
      const blank = n > 1 && rand() < 0.3 // 같은 사람의 다른 처방 줄은 번호 칸이 빌 수 있다
      rows.push([chart(i), blank ? '' : mine, blank ? '' : guardian, rand() < 0.3 ? fakePhone(9000 + i) : '', pick(rand, ['', 'Y', 'N'])])
    }
  }
  rows.push(['0', fakePhone(9999), '', '', ''], ['', fakePhone(9998), '', '', ''])
  return [RX_HEADER, ...shuffle(rand, rows)]
}

function rxCases(rand: Rand): RowsCase[] {
  const phoneHeader = ['차트번호', '휴대폰']
  return [
    { id: 'main', rows: mainRxRows(rand) },
    {
      id: 'ok-formats',
      rows: [
        phoneHeader,
        [fakeChart(41), `${fakePhone(41)} / ${fakePhone(42)}`],
        [fakeChart(43), '01000000043'],
        [fakeChart(44), '010 0000 0044'],
        [fakeChart(45), `${fakePhone(45)}(보호자 2)`],
        [fakeChart(46), '+82-10-0000-0046'],
        [fakeChart(47), '모름'],
        [fakeChart(48), `${fakePhone(48)}, ${fakePhone(48)}`],
        [fakeChart(49), `*${fakePhone(49)}`],
      ],
    },
    { id: 'ok-zero-same', rows: [phoneHeader, ['0900032', fakePhone(32)], [fakeChart(32), fakePhone(32)]] },
    { id: 'ok-header-later', rows: [['환자별 소모 통계'], ['기간', '2026-10-01 ~ 2026-10-31'], phoneHeader, [fakeChart(1), fakePhone(1)]] },
    { id: 'ok-numeric-chart', rows: [phoneHeader, [900051, fakePhone(51)], ['900052.0', fakePhone(52)]] },
    { id: 'ok-skip-rows', rows: [phoneHeader, ['', fakePhone(1)], ['0', fakePhone(2)], [fakeChart(3), ''], [fakeChart(4), fakePhone(4)]] },
    {
      id: 'ok-many-columns',
      rows: [
        ['차트번호', '휴대폰번호', '보호자 휴대폰', '연락처2', '팩스번호', 'FAX', '전화번호 확인일'],
        [fakeChart(61), fakePhone(61), '', '', fakePhone(9061), fakePhone(9161), 'Y'],
        [fakeChart(62), '', fakePhone(62), '', '', '', ''],
        [fakeChart(63), '', '', fakePhone(63), '', '', ''],
        [fakeChart(64), fakePhone(64), fakePhone(164), fakePhone(264), '', '', ''],
      ],
    },
    { id: 'ok-two-rows-one-empty', rows: [phoneHeader, [fakeChart(71), ''], [fakeChart(71), fakePhone(71)], [fakeChart(71), '']] },
    {
      // 같은 번호 둘의 칸만 줄마다 바뀐 것은 충돌이 아니다
      id: 'ok-swapped-numbers',
      rows: [
        ['차트번호', '휴대폰', '보호자연락처'],
        [fakeChart(91), fakePhone(91), fakePhone(191)],
        [fakeChart(91), fakePhone(191), fakePhone(91)],
      ],
    },
    { id: 'ok-chart-dot-zeros', rows: [phoneHeader, ['900092.00', fakePhone(92)], ['900093.000', fakePhone(93)]] },
    { id: 'ok-missing-allowed', allowMissing: true, rows: [['차트번호', '처방코드'], [fakeChart(1), 'A49']] },
    { id: 'err-missing', rows: [['차트번호', '처방코드'], [fakeChart(1), 'A49']] },
    { id: 'err-conflict', rows: [phoneHeader, [fakeChart(81), fakePhone(81)], [fakeChart(81), fakePhone(181)]] },
    { id: 'err-conflict-zero', rows: [phoneHeader, ['0900082', fakePhone(82)], [fakeChart(82), fakePhone(182)]] },
    { id: 'err-conflict-set', rows: [phoneHeader, [fakeChart(83), `${fakePhone(83)} / ${fakePhone(183)}`], [fakeChart(83), fakePhone(83)]] },
    { id: 'err-duplicate-phone-column', rows: [['차트번호', '휴대폰', '휴 대폰'], [fakeChart(1), fakePhone(1), '']] },
    { id: 'err-no-chart-column', rows: [['환자번호', '휴대폰'], [fakeChart(1), fakePhone(1)]] },
    { id: 'err-duplicate-chart-column', rows: [['차트번호', '환자차트번호', '휴대폰']] },
  ]
}

// phoneTokens에 넣어 볼 칸 값(나누기·주석·국가번호·가림 글자)
const TOKENS = [
  fakePhone(1),
  '01000000002',
  '010 0000 0003',
  `${fakePhone(4)} / ${fakePhone(5)}`,
  `${fakePhone(6)}, ${fakePhone(7)}`,
  `${fakePhone(8)};${fakePhone(9)}`,
  `${fakePhone(10)}·${fakePhone(11)}`,
  `${fakePhone(12)}|${fakePhone(13)}`,
  `${fakePhone(14)}\n${fakePhone(15)}`,
  `${fakePhone(16)}  ${fakePhone(17)}`,
  `${fakePhone(18)} ${fakePhone(19)}`,
  `${fakePhone(20)}(보호자 2)`,
  `${fakePhone(21)} (모)`,
  `(${fakePhone(22)})`,
  '+82-10-0000-0023',
  '+82 10 0000 0024',
  '+821000000025',
  `*${fakePhone(26)}`,
  `${fakePhone(27)}*`,
  `${fakePhone(28)}x`,
  `${fakePhone(29)}-1`,
  `${fakePhone(30)}1`,
  `${fakePhone(31)} 내선`,
  `${fakePhone(32)} ●`,
  '0100000-0033',
  '모름',
  '',
  '   ',
]

// phoneColumn에 넣어 볼 칸 이름(도우미 IsPhoneColumn도 같은 목록으로 견준다)
const COLUMNS = [
  '휴대폰',
  '휴대폰번호',
  '휴대 폰',
  '휴대전화',
  '휴대전화번호',
  '휴대 전화',
  '핸드폰',
  '핸드폰번호',
  '이동전화',
  '이동전화번호',
  '연락처',
  '전화번호',
  '보호자휴대폰',
  '보호자 연락처',
  '보호자전화번호',
  '보호자 핸드폰 2',
  '연락처1',
  '연락처2',
  '연락처(1)',
  '휴대폰(2)',
  '연락처 (2)',
  '휴대폰번호1',
  '연락처3',
  '연락처(3)',
  '팩스',
  '팩스번호',
  'FAX',
  'fax번호',
  '휴대폰 팩스',
  '전화번호 확인일',
  '전화번호확인',
  '보호자',
  '전화',
  '자택전화',
  'Tel',
  '차트번호',
  '환자명',
  '',
]

// ── 정기 주사 사례(recall-cases.json). 난수를 쓰지 않아 앞 파일들의 결과를 바꾸지 않는다 ──────────

const H83 = ['내원번호', '차트번호', '환자명', '증상', '기록날짜']
const H47 = ['처방코드', '처방명칭', '차트번호', '급여구분', '처방일자', '휴대폰']
const visit = (no: number, i: number, ymd: string, symptom: string): unknown[] => [`V${no}`, fakeChart(i), fakeName(i), symptom, compact(ymd)]
const given = (code: string, i: number, ymd: string, phone = ''): unknown[] => [code, '가짜 약', fakeChart(i), '급여', compact(ymd), phone]
const rec = (i: number, date: string, codes: string[], text: string, phone = ''): RecallRecordCase => ({
  chart: fakeChart(i),
  name: fakeName(i),
  date,
  codes,
  text,
  phone,
})
const CARTILAGE = 'A49'
const VITAMIN_D = 'A32'
const OTHER = 'A15'
const ALL_CODES = [CARTILAGE, VITAMIN_D]
const cart = (i: number, date: string, text: string, phone = '') => rec(i, date, [CARTILAGE], text, phone)
const vitd = (i: number, date: string, phone = '') => rec(i, date, [VITAMIN_D], '비타민D', phone)
const RULE_CARTILAGE: RecallRuleCase = { id: 'cartilage', enabled: true, label: '연골주사', codes: [CARTILAGE], round: '3차', months: 6 }
const RULE_VITAMIN_D: RecallRuleCase = { id: 'vitamin-d', enabled: true, label: '비타민D', codes: [VITAMIN_D], round: '', months: 3 }

const ROUND_CASES: readonly (readonly [string, string])[] = [
  ['3차', '아라간 3차'],
  ['3차', '아라간 3 차'],
  ['3차', '아라간 3  차'],
  ['3차', '아라간3차'],
  ['3차', '3차'],
  ['3차', '아라간 13차'],
  ['3차', '아라간 23차'],
  ['3차', '아라간 33차'],
  ['3차', '아라간 03차'],
  ['3차', '아라간 1차'],
  ['3차', '아라간 13차 / 3차'],
  ['3차', ''],
  ['3 차', '아라간 3차'],
  ['12차', '아라간 12차'],
  ['12차', '아라간 112차'],
  ['12차', '아라간 2차'],
  ['123차', '아라간 123차'],
  ['123차', '아라간 3차'],
  ['', '아무 글'],
  ['', ''],
  ['무릎', '오른쪽 무릎 주사'],
  ['무릎', '어깨 주사'],
  ['ARAGAN', 'aragan 주사'],
  ['aragan', 'ARAGAN 주사'],
  ['(', '주사 (왼쪽)'],
  ['3차 ', '아라간 3차'],
]

const ADD_MONTHS_CASES: readonly (readonly [string, number])[] = [
  ['2026-01-31', 1],
  ['2028-01-31', 1],
  ['2100-01-31', 1],
  ['2000-01-31', 1],
  ['2026-03-31', -1],
  ['2026-12-15', 1],
  ['2026-11-30', 3],
  ['2026-01-15', -1],
  ['2026-01-31', -2],
  ['2026-08-31', 6],
  ['2026-08-29', 6],
  ['2026-08-28', 6],
  ['2026-07-31', 3],
  ['2026-04-15', 6],
  ['2024-02-29', 12],
  ['2024-02-29', -12],
  ['2024-02-29', 48],
  ['2026-11-01', -36],
  ['2026-05-31', -36],
  ['2024-02-29', -36],
  ['2026-10-31', 0],
  ['2026-10-16', -6],
  ['2026-08-31', -6],
  ['2026-08-31', -3],
  ['9999-11-30', 1],
  ['9999-12-31', 0],
  ['1000-02-28', -1],
]

const RX_DATE_ROWS: unknown[][] = [
  ['A49', '가짜 약', '900001', '급여', '20261007', ''],
  ['A32', '가짜 약', '900002', '급여', 20261008, ''],
  ['A49', '가짜 약', '900003', '급여', '2026-10-09', ''],
  ['A49', '가짜 약', '900004', '급여', '2026.10.9', ''],
  ['A49', '가짜 약', '900005', '급여', '2026/10/9 09:30', ''],
  ['A49', '가짜 약', '900006', '급여', '202610091230', ''],
  ['A49', '가짜 약', '900007', '급여', serialOf('2026-10-10'), ''],
  ['A49', '가짜 약', '900008', '급여', serialOf('2026-10-10') + 0.5, ''],
  ['A49', '가짜 약', '900009', '급여', '20261345', ''],
  ['A49', '가짜 약', '900010', '급여', '202610092500', ''],
  ['A49', '가짜 약', '900011', '급여', '어제', ''],
  ['A49', '가짜 약', '900012', '급여', '', ''],
  ['A49', '가짜 약', '900013', '급여', null, ''],
  ['A49', '가짜 약', '900014', '급여', '00991231', ''],
  ['A49', '가짜 약', '900015', '급여', '99991231', ''],
]

const RX_CASES: readonly RowsCase[] = [
  {
    id: 'main',
    rows: [
      H47,
      given('a49', 1, '2026-10-07', fakePhone(1)),
      given('A15', 1, '2026-10-07'),
      given('A49', 1, '2026-10-07'),
      given(' A32 ', 2, '2026-10-08'),
      given('A32', 1, '2026-10-08'),
    ],
  },
  { id: 'header-late', rows: [['조회 조건'], [], ['가짜 표'], H47, given('A49', 1, '2026-10-07')] },
  { id: 'date-forms', rows: [H47, ...RX_DATE_ROWS] },
  {
    id: 'chart-forms',
    rows: [
      H47,
      ['A49', '가짜 약', 900001, '급여', '20261007', ''],
      ['A49', '가짜 약', '900002.0', '급여', '20261007', ''],
      ['A49', '가짜 약', '900003.00', '급여', '20261007', ''],
      ['A49', '가짜 약', '0900004', '급여', '20261007', ''],
      ['A32', '가짜 약', ' 900004 ', '급여', '20261007', ''],
      ['A49', '가짜 약', '000', '급여', '20261007', ''],
      ['A49', '가짜 약', '0', '급여', '20261007', ''],
      ['A49', '가짜 약', '', '급여', '20261007', ''],
      ['A49', '가짜 약', null, '급여', '20261007', ''],
    ],
  },
  {
    id: 'blank-code',
    rows: [H47, ['', '가짜 약', '900001', '급여', '20261007', ''], [null, '가짜 약', '900002', '급여', '20261007', ''], ['   ', '가짜 약', '900003', '급여', '20261007', ''], [4900, '가짜 약', '900004', '급여', '20261007', '']],
  },
  { id: 'header-spaces', rows: [['처 방 코 드', '처방명칭', '차 트 번 호', '급여구분', '처방 일자'], ['A49', '가짜 약', '900001', '급여', '20261007']] },
  { id: 'only-header', rows: [H47] },
  { id: 'err-empty', rows: [] },
  { id: 'err-no-code-column', rows: [['처방명칭', '차트번호', '처방일자'], ['가짜 약', '900001', '20261007']] },
  { id: 'err-no-date-column', rows: [['처방코드', '차트번호'], ['A49', '900001']] },
  { id: 'err-duplicate-chart-column', rows: [['처방코드', '차트번호', '차트번호(옛)', '처방일자'], ['A49', '900001', '900001', '20261007']] },
  { id: 'err-header-after-20-lines', rows: [...Array.from({ length: 20 }, () => ['가짜 머리 줄']), H47, given('A49', 1, '2026-10-07')] },
]

const okRecord = (over: Partial<Record<keyof RecallRecordCase, unknown>> = {}) => ({ ...cart(1, '2026-04-15', '아라간 3차', fakePhone(1)), ...over })
const history = (records: unknown[], from: unknown = '2026-01-01', extra: Record<string, unknown> = {}) => ({ from, records, ...extra })

const VALIDATE_CASES: readonly { id: string; value: unknown }[] = [
  { id: 'ok-empty', value: { from: null, records: [] } },
  { id: 'ok-from', value: history([okRecord()]) },
  { id: 'ok-read-through', value: history([okRecord()], '2026-01-01', { readThrough: '2026-10-31' }) },
  { id: 'ok-read-through-null', value: history([], '2026-01-01', { readThrough: null }) },
  { id: 'ok-read-through-broken', value: history([], '2026-01-01', { readThrough: '2026-02-30' }) },
  { id: 'ok-read-through-not-text', value: history([], '2026-01-01', { readThrough: 20261031 }) },
  { id: 'ok-read-through-year-0999', value: history([], '2026-01-01', { readThrough: '0999-12-31' }) },
  { id: 'ok-from-year-1000', value: history([], '1000-01-01') },
  { id: 'ok-extra-fields-dropped', value: history([{ ...okRecord(), extra: 'x', visitNo: 'V1' }], '2026-01-01', { extra: 'y' }) },
  { id: 'ok-field-limits', value: history([okRecord({ name: '가'.repeat(100), text: '가'.repeat(1000), phone: '-'.repeat(60), chart: '9'.repeat(30) })]) },
  { id: 'ok-code-limits', value: history([okRecord({ codes: Array.from({ length: 20 }, (_, i) => `A${i}`) }), okRecord({ codes: ['A'.repeat(20)] }), okRecord({ codes: ['A_1-B'] })]) },
  { id: 'ok-empty-text-phone', value: history([okRecord({ text: '', phone: '' })]) },
  { id: 'ok-chart-constructor', value: history([okRecord({ chart: 'constructor' })]) },
  { id: 'ok-date-year-1000', value: history([okRecord({ date: '1000-01-01' })]) },
  { id: 'ok-date-year-9999', value: history([okRecord({ date: '9999-12-31' })]) },
  {
    id: 'ok-bad-records-dropped',
    value: history([
      okRecord(),
      null,
      'x',
      7,
      [],
      {},
      okRecord({ chart: '../x' }),
      okRecord({ chart: '' }),
      okRecord({ chart: 'a'.repeat(31) }),
      okRecord({ chart: 900001 }),
      okRecord({ chart: '__proto__' }),
      okRecord({ name: '' }),
      okRecord({ name: '가'.repeat(101) }),
      okRecord({ name: 1 }),
      okRecord({ date: '2026-02-30' }),
      okRecord({ date: '2026-4-15' }),
      okRecord({ date: '10000-01-01' }),
      okRecord({ date: '0999-12-31' }),
      okRecord({ date: '0099-12-31' }),
      okRecord({ date: ['2026-04-15'] }),
      okRecord({ date: 20260415 }),
      okRecord({ date: null }),
      okRecord({ codes: [] }),
      okRecord({ codes: 'A49' }),
      okRecord({ codes: Array.from({ length: 21 }, (_, i) => `A${i}`) }),
      okRecord({ codes: ['a49'] }),
      okRecord({ codes: ['A 49'] }),
      okRecord({ codes: [49] }),
      okRecord({ codes: ['A'.repeat(21)] }),
      okRecord({ text: '가'.repeat(1001) }),
      okRecord({ text: null }),
      okRecord({ phone: '-'.repeat(61) }),
      okRecord({ phone: null }),
    ]),
  },
  { id: 'err-null', value: null },
  { id: 'err-text', value: '기록' },
  { id: 'err-number', value: 7 },
  { id: 'err-array', value: [] },
  { id: 'err-no-records', value: { from: null } },
  { id: 'err-records-not-list', value: { from: null, records: {} } },
  { id: 'err-from-missing', value: { records: [] } },
  { id: 'err-from-empty', value: { from: '', records: [] } },
  { id: 'err-from-broken', value: { from: '2026-02-30', records: [] } },
  { id: 'err-from-not-text', value: { from: 20260101, records: [] } },
  { id: 'err-from-short', value: { from: '2026-1-1', records: [] } },
  { id: 'err-from-year-0999', value: { from: '0999-12-31', records: [] } },
  { id: 'err-from-year-10000', value: { from: '10000-01-01', records: [] } },
]

const EMPTY_HISTORY: RecallHistoryCase = { from: null, readThrough: null, records: [] }
const ingestOf = (id: string, today: string, from: string, to: string, hist: RecallHistoryCase, chart: unknown[][] | null, rx: unknown[][] | null, codes = ALL_CODES): RecallIngestCase => ({
  id,
  today,
  codes,
  from,
  to,
  history: hist,
  chart,
  rx,
})

const INGEST_CASES: readonly RecallIngestCase[] = [
  // 코드가 처방된 내원만, 그날 증상·전화와 함께. 코드는 대문자로, 여러 줄은 ' / '로
  ingestOf(
    'first-read',
    '2026-10-16',
    '2026-04-01',
    '2026-04-30',
    EMPTY_HISTORY,
    [
      H83,
      visit(1, 1, '2026-04-15', '무릎'),
      visit(1, 1, '2026-04-15', '아라간 3차'),
      visit(2, 2, '2026-04-16', 'MBB'),
      visit(3, 3, '2026-04-20', '비타민D'),
      visit(4, 4, '2026-04-20', '아라간 1차 · 비타민D'),
      visit(5, 5, '2026-04-21', '아라간 2차'),
      visit(6, 6, '2026-04-22', '처방 없는 내원'),
      [`V7`, fakeChart(7), fakeName(7), '', compact('2026-04-23')],
    ],
    [
      H47,
      given(CARTILAGE, 1, '2026-04-15', fakePhone(1)),
      given(OTHER, 1, '2026-04-15', fakePhone(1)),
      given(OTHER, 2, '2026-04-16'),
      given(VITAMIN_D, 3, '2026-04-20'),
      given(CARTILAGE, 4, '2026-04-20', fakePhone(4)),
      given(VITAMIN_D, 4, '2026-04-20', fakePhone(4)),
      given('a49', 5, '2026-04-21'),
      given(VITAMIN_D, 7, '2026-04-23'),
    ],
  ),
  // 같은 차트의 다른 날에 처방된 코드는 이 내원의 코드가 아니다
  ingestOf(
    'code-on-other-day',
    '2026-10-16',
    '2026-04-01',
    '2026-04-30',
    EMPTY_HISTORY,
    [H83, visit(1, 1, '2026-04-15', '아라간 3차')],
    [H47, given(CARTILAGE, 1, '2026-04-14')],
  ),
  // 차트번호 표기: 앞자리 0·.0이 달라도 같은 사람
  ingestOf(
    'chart-forms',
    '2026-10-16',
    '2026-04-01',
    '2026-04-30',
    EMPTY_HISTORY,
    [
      H83,
      ['V1', `0${fakeChart(1)}`, fakeName(1), '아라간 3차', '20260415'],
      ['V2', fakeChart(2), fakeName(2), '아라간 3차', '20260415'],
      ['V3', `${fakeChart(3)}.0`, fakeName(3), '아라간 3차', '20260415'],
      ['V4', Number(fakeChart(4)), fakeName(4), '아라간 3차', '20260415'],
    ],
    [
      H47,
      [CARTILAGE, '가짜 약', fakeChart(1), '급여', '20260415', fakePhone(1)],
      [CARTILAGE, '가짜 약', `0${fakeChart(2)}`, '급여', '20260415', fakePhone(2)],
      [CARTILAGE, '가짜 약', fakeChart(3), '급여', '20260415', fakePhone(3)],
      [CARTILAGE, '가짜 약', `${fakeChart(4)}.0`, '급여', '20260415', fakePhone(4)],
    ],
  ),
  // 같은 기간을 다시 읽으면 양 끝을 포함해 그 기간의 예전 기록이 새것으로 바뀐다(사라진 줄은 지워진다). 하루 밖은 그대로
  ingestOf(
    'reread-period',
    '2026-10-16',
    '2026-04-01',
    '2026-04-30',
    {
      from: '2026-01-01',
      readThrough: '2026-05-31',
      records: [cart(1, '2026-03-31', '하루 앞'), cart(2, '2026-04-01', '옛 첫날'), cart(3, '2026-04-15', '옛 글'), vitd(4, '2026-04-30'), vitd(5, '2026-05-01')],
    },
    [H83, visit(3, 3, '2026-04-15', '아라간 3차 고침'), visit(6, 6, '2026-04-20', '비타민D')],
    [H47, given(CARTILAGE, 3, '2026-04-15'), given(VITAMIN_D, 6, '2026-04-20')],
  ),
  ingestOf(
    'reread-no-visits',
    '2026-10-16',
    '2026-04-01',
    '2026-04-30',
    { from: '2026-01-01', readThrough: '2026-04-30', records: [cart(1, '2026-03-31', '하루 앞'), cart(2, '2026-04-15', '지워질 글'), vitd(5, '2026-05-01')] },
    null,
    null,
  ),
  // 전화가 바뀌면 새 내원만 새 번호. 쌓인 기록은 그때 번호 그대로
  ingestOf(
    'phone-changed',
    '2026-10-16',
    '2026-04-01',
    '2026-04-30',
    { from: '2026-03-01', readThrough: '2026-03-31', records: [vitd(1, '2026-03-10', fakePhone(100))] },
    [H83, visit(1, 1, '2026-04-10', '비타민D')],
    [H47, given(VITAMIN_D, 1, '2026-04-10', fakePhone(101))],
  ),
  // 36개월: 그 날은 남고 하루 앞은 지운다. from도 그 날로 당긴다
  ingestOf(
    'keep-limit',
    '2026-10-17',
    '2026-10-17',
    '2026-10-17',
    { from: '2023-01-01', readThrough: '2026-10-16', records: [cart(1, '2023-10-16', '하루 앞'), cart(2, '2023-10-17', '그 날'), cart(3, '2023-10-18', '하루 뒤')] },
    null,
    null,
  ),
  ingestOf(
    'keep-limit-month-end',
    '2026-05-31',
    '2026-05-01',
    '2026-05-31',
    { from: '2023-05-31', readThrough: null, records: [cart(1, '2023-05-30', '하루 앞'), cart(2, '2023-05-31', '그 날')] },
    null,
    null,
  ),
  ingestOf(
    'keep-limit-leap-day',
    '2024-02-29',
    '2024-02-01',
    '2024-02-29',
    { from: '2021-03-01', readThrough: null, records: [cart(1, '2021-02-27', '하루 앞'), cart(2, '2021-02-28', '그 날')] },
    null,
    null,
  ),
  // from: 더 이른 쪽, 없으면 읽은 시작, 36개월 앞이면 그 날
  ingestOf('from-keeps-earlier', '2026-10-16', '2026-03-01', '2026-03-31', { from: '2026-01-01', readThrough: '2026-02-28', records: [] }, null, null),
  ingestOf('from-moves-earlier', '2026-10-16', '2026-01-01', '2026-01-31', { from: '2026-03-01', readThrough: '2026-03-31', records: [] }, null, null),
  ingestOf('from-same', '2026-10-16', '2026-03-01', '2026-03-31', { from: '2026-03-01', readThrough: '2026-03-31', records: [] }, null, null),
  ingestOf(
    'from-before-limit',
    '2026-10-16',
    '2020-01-01',
    '2020-01-31',
    EMPTY_HISTORY,
    [H83, visit(1, 1, '2020-01-15', '비타민D'), visit(2, 2, '2023-10-16', '비타민D')],
    [H47, given(VITAMIN_D, 1, '2020-01-15'), given(VITAMIN_D, 2, '2023-10-16')],
  ),
  ingestOf('from-at-limit', '2026-10-16', '2023-10-16', '2023-10-31', EMPTY_HISTORY, null, null),
  // 같은 날: 차트번호 숫자 순서, 같은 사람이면 쌓인 것 먼저
  ingestOf(
    'equal-date-order',
    '2026-10-16',
    '2026-04-01',
    '2026-04-30',
    { from: '2026-04-01', readThrough: '2026-05-31', records: [vitd(7, '2026-05-01'), vitd(20, '2026-05-01')] },
    [
      H83,
      visit(1, 7, '2026-05-01', '새 글'),
      visit(2, 8, '2026-05-01', '새 글'),
      ['V3', `0${fakeChart(30)}`, fakeName(30), '새 글', '20260501'],
      visit(4, 8, '2026-05-01', '같은 날 둘째 내원'),
    ],
    [H47, given(VITAMIN_D, 7, '2026-05-01'), given(VITAMIN_D, 8, '2026-05-01'), given(VITAMIN_D, 30, '2026-05-01')],
  ),
  // 읽은 기간 밖의 내원도 처방이 있으면 쌓는다(원본 그대로)
  ingestOf(
    'visit-outside-period',
    '2026-10-16',
    '2026-04-01',
    '2026-04-30',
    EMPTY_HISTORY,
    [H83, visit(1, 1, '2026-06-01', '비타민D')],
    [H47, given(VITAMIN_D, 1, '2026-06-01')],
  ),
  // 차트번호 모양이 안 맞으면 쌓지 않는다. constructor는 전화 표에 번호가 없으면 빈칸이다
  ingestOf(
    'odd-chart',
    '2026-10-16',
    '2026-04-01',
    '2026-04-30',
    EMPTY_HISTORY,
    [
      H83,
      ['V1', 'constructor', fakeName(1), '비타민D', '20260415'],
      ['V2', 'toString', fakeName(2), '비타민D', '20260415'],
      ['V3', '9000 03', fakeName(3), '비타민D', '20260415'],
      ['V4', '9000.04', fakeName(4), '비타민D', '20260415'],
      ['V5', '900-005', fakeName(5), '비타민D', '20260415'],
    ],
    [
      H47,
      [VITAMIN_D, '가짜 약', 'constructor', '급여', '20260415', ''],
      [VITAMIN_D, '가짜 약', 'toString', '급여', '20260415', fakePhone(2)],
      [VITAMIN_D, '가짜 약', '9000 03', '급여', '20260415', ''],
      [VITAMIN_D, '가짜 약', '9000.04', '급여', '20260415', ''],
      [VITAMIN_D, '가짜 약', '900-005', '급여', '20260415', ''],
    ],
  ),
  // 이름 100자·증상 1,000자에서 자른다. 증상 앞뒤 빈칸은 뗀다
  ingestOf(
    'long-fields',
    '2026-10-16',
    '2026-04-01',
    '2026-04-30',
    EMPTY_HISTORY,
    [H83, ['V1', fakeChart(1), `${fakeName(1)}${'가'.repeat(100)}`, `  ${'증'.repeat(600)}  `, '20260415'], ['V1', fakeChart(1), `${fakeName(1)}${'가'.repeat(100)}`, '상'.repeat(600), '20260415']],
    [H47, given(VITAMIN_D, 1, '2026-04-15')],
  ),
  // 0099년 칸은 1999년 내원이다(내원 쪽과 처방 쪽 열쇠가 달라진다). 0100년은 36개월 앞이라 지운다. 9999년은 먼 뒤라 남는다
  ingestOf(
    'odd-years',
    '2001-01-01',
    '1999-01-01',
    '2000-12-31',
    EMPTY_HISTORY,
    [
      H83,
      visit(1, 1, '1999-12-31', '처방 칸이 00991231'),
      ['V2', fakeChart(2), fakeName(2), '내원 칸이 00991231', '00991231'],
      ['V3', fakeChart(3), fakeName(3), '내원 칸이 01000101', '01000101'],
      ['V4', fakeChart(4), fakeName(4), '내원 칸이 99991231', '99991231'],
    ],
    [
      H47,
      [VITAMIN_D, '가짜 약', fakeChart(1), '급여', '00991231', ''],
      [VITAMIN_D, '가짜 약', fakeChart(2), '급여', '19991231', ''],
      [VITAMIN_D, '가짜 약', fakeChart(3), '급여', '01000101', ''],
      [VITAMIN_D, '가짜 약', fakeChart(4), '급여', '99991231', ''],
    ],
  ),
  // 넘겨받은 코드만. 꺼 둔 규칙 코드도 같이 오면 쌓는다
  ingestOf(
    'codes-arg',
    '2026-10-16',
    '2026-04-01',
    '2026-04-30',
    EMPTY_HISTORY,
    [H83, visit(1, 1, '2026-04-15', '주사'), visit(2, 2, '2026-04-15', '주사'), visit(3, 3, '2026-04-15', '주사')],
    [H47, given(CARTILAGE, 1, '2026-04-15'), given('B7', 2, '2026-04-15'), given(VITAMIN_D, 3, '2026-04-15')],
    ['a49', ' B7'],
  ),
  ingestOf('no-codes', '2026-10-16', '2026-04-01', '2026-04-30', EMPTY_HISTORY, [H83, visit(1, 1, '2026-04-15', '주사')], [H47, given(CARTILAGE, 1, '2026-04-15')], []),
  // 전화 칸이 없는 47 표(전화 없이 처방만)
  ingestOf(
    'no-phone-column',
    '2026-10-16',
    '2026-04-01',
    '2026-04-30',
    EMPTY_HISTORY,
    [H83, visit(1, 1, '2026-04-15', '비타민D')],
    [['처방코드', '차트번호', '처방일자'], [VITAMIN_D, fakeChart(1), '20260415']],
  ),
]

const RECALL_BULK: RecallBulkCase = {
  start: '2025-01-01',
  span: 365,
  firstChart: 900000,
  counts: { atLimit: 50_000, overLimit: 50_001 },
  today: '2026-11-01',
  codes: ALL_CODES,
  from: '2026-10-01',
  to: '2026-10-31',
  chart: [H83, visit(1, 1, '2026-10-05', '비타민D')],
  rx: [H47, given(VITAMIN_D, 1, '2026-10-05')],
}

// 50,000건 넘는 기록을 그때그때 만든다(파일에 다 적지 않는다). scripts/patients/golden/recall.mjs에도 같은 계산이 있다(sha256으로 같은지 본다)
export function recallBulkRecords(recipe: Pick<RecallBulkCase, 'start' | 'span' | 'firstChart'>, count: number): RecallRecordCase[] {
  const records: RecallRecordCase[] = []
  for (let i = 0; i < count; i++) {
    records.push({
      chart: String(recipe.firstChart + i),
      name: fakeName(i % 100),
      date: plus(recipe.start, i % recipe.span),
      codes: [VITAMIN_D],
      text: '비타민D',
      phone: fakePhone(i % 10_000),
    })
  }
  return records
}

// 경계와 같은 값을 짚는 명단. 예정일이 같으면 종류(비타민D 먼저) → 차트번호 숫자 순서
const MAIN_RECORDS: readonly RecallRecordCase[] = [
  // 1·2·3차 → 3차 뒤 6개월. 근거는 3차가 든 줄
  cart(1, '2026-04-01', '아라간 1차'),
  cart(1, '2026-04-08', '아라간 2차'),
  cart(1, '2026-04-15', '무릎 / 아라간 3차', fakePhone(1)),
  // 3차 뒤 새로 1차를 시작하면 빠진다
  cart(2, '2026-03-01', '아라간 3차'),
  cart(2, '2026-09-01', '아라간 1차'),
  // 13차·23차는 3차가 아니다
  cart(3, '2026-05-01', '아라간 13차'),
  cart(4, '2026-05-02', '아라간 23차'),
  // 비타민D 여러 번: 마지막만
  vitd(5, '2026-01-10'),
  vitd(5, '2026-04-10'),
  vitd(5, '2026-07-10', fakePhone(5)),
  // 두 코드 같은 날: 규칙마다 한 줄
  rec(6, '2026-08-31', [VITAMIN_D, CARTILAGE], '아라간 3차 · 비타민D'),
  // 1/31 +6개월, 8/29·30 +6개월(2월 말일에 맞춤)
  cart(7, '2026-01-31', '아라간 3차'),
  cart(8, '2026-08-30', '아라간 3차'),
  cart(9, '2026-08-29', '아라간 3차'),
  // 11/30 +3개월 = 2/28: 종류가 앞선다
  vitd(10, '2026-11-30'),
  // 예정일 같음(10/15): 종류 순서
  vitd(11, '2026-07-15'),
  // 3 차·붙여 쓰기·맨 앞, 3차가 든 줄이 둘이면 첫 줄
  cart(12, '2026-06-01', '아라간 3 차'),
  cart(13, '2026-06-02', '아라간3차'),
  cart(14, '2026-06-03', '3차 / 아라간 3차 끝'),
  // 앞자리 0만 다른 차트는 한 사람: 마지막 기록의 차트번호로
  { ...cart(15, '2026-02-01', '아라간 3차'), chart: `0${fakeChart(15)}` },
  cart(15, '2026-03-01', '아라간 1차'),
  cart(16, '2026-02-01', '아라간 1차'),
  { ...cart(16, '2026-03-01', '아라간 3차'), chart: `0${fakeChart(16)}` },
  // 같은 날 두 기록: 뒤에 온 것이 마지막
  cart(17, '2026-06-05', '아라간 3차'),
  cart(17, '2026-06-05', '아라간 1차'),
  cart(18, '2026-06-06', '아라간 1차'),
  cart(18, '2026-06-06', '아라간 3차'),
  // 넣은 순서가 날짜 순서가 아니어도 날짜로 본다
  cart(19, '2026-06-20', '아라간 3차'),
  cart(19, '2026-06-07', '아라간 1차'),
  // 다른 코드 기록은 보지 않는다
  rec(20, '2026-06-08', [OTHER], '아라간 3차'),
  cart(21, '2026-06-09', '아라간 3차'),
  rec(21, '2026-07-01', [OTHER], '아라간 1차'),
  // 예정일 같음: 차트번호 숫자 순서(글자 순서면 09…가 앞선다)
  vitd(4, '2026-09-20'),
  { ...vitd(30, '2026-09-20'), chart: `0${fakeChart(30)}` },
  vitd(31, '2026-09-20'),
  // 오늘(2026-10-15) 앞뒤 하루
  vitd(32, '2026-07-14'),
  vitd(33, '2026-07-16'),
  // 고르는 기간 경계
  vitd(34, '2026-07-31'),
  vitd(35, '2026-08-01'),
  vitd(36, '2026-08-30'),
  vitd(37, '2026-08-31'),
]

const FAR_RECORDS: readonly RecallRecordCase[] = [
  cart(41, '9999-12-31', '아라간 3차'),
  cart(42, '9999-07-01', '아라간 3차'),
  cart(43, '9999-06-30', '아라간 3차'),
  vitd(44, '9999-10-01'),
  vitd(45, '9999-09-30'),
  // 먼 날 앞의 3차로 돌아가지 않는다(마지막만 본다)
  cart(46, '2026-04-15', '아라간 3차'),
  cart(46, '9999-12-31', '아라간 3차'),
  // 먼 날이 1차면 원본도 빠진다
  cart(47, '2026-04-15', '아라간 3차'),
  cart(47, '9999-12-31', '아라간 1차'),
  cart(48, '2026-04-15', '아라간 3차'),
]

const BAD_DATE_RECORDS: readonly RecallRecordCase[] = [
  cart(51, '2026-04-15', '아라간 3차'),
  cart(52, '글자', '아라간 3차'),
  cart(53, '2026-02-30', '아라간 3차'),
  cart(54, '0999-12-31', '아라간 3차'),
  cart(55, '10000-01-01', '아라간 3차'),
  cart(56, '', '아라간 3차'),
  vitd(57, '2026-07-10'),
]

const SELECT_CASES: RecallCasesFile['select'] = [
  { from: '2026-10-15', to: '2026-10-31', overdue: false, today: '2026-10-15' },
  { from: '2026-10-15', to: '2026-10-31', overdue: true, today: '2026-10-15' },
  { from: null, to: null, overdue: false, today: '2026-10-15' },
  { from: null, to: null, overdue: true, today: '2026-10-15' },
  // 시작이 오늘 뒤면 오늘~시작 사이는 빠지고 오늘 앞만 지난 예정이다(오늘은 지난 예정이 아니다)
  { from: '2026-11-01', to: '2026-11-30', overdue: true, today: '2026-10-15' },
  { from: '2026-11-01', to: '2026-11-30', overdue: false, today: '2026-10-15' },
  // 끝은 지난 예정에도 걸린다
  { from: '2026-10-15', to: '2026-10-10', overdue: true, today: '2026-10-15' },
  { from: null, to: '2026-10-15', overdue: false, today: '2026-10-15' },
  { from: '2026-10-15', to: null, overdue: false, today: '2026-10-15' },
  { from: '2026-10-15', to: null, overdue: true, today: '2026-10-15' },
  // 시작 = 끝
  { from: '2026-10-15', to: '2026-10-15', overdue: false, today: '2026-10-16' },
  // 오늘이 달라지면 지난 예정이 달라진다
  { from: '2026-12-01', to: null, overdue: true, today: '2026-10-16' },
]

const STATUS_DAYS = ['2026-10-14', '2026-10-15', '2026-10-16', '2027-03-01', '2024-02-29']

const COVERAGE_CASES: RecallCasesFile['coverage'] = [
  { id: 'empty', today: '2026-10-16', rules: null, history: { from: null, records: [] } },
  { id: 'at-six-months', today: '2026-10-16', rules: null, history: { from: '2026-04-16', records: [] } },
  { id: 'after-six-months', today: '2026-10-16', rules: null, history: { from: '2026-04-17', records: [cart(1, '2026-04-17', '아라간 3차')] } },
  { id: 'at-three-months', today: '2026-10-16', rules: null, history: { from: '2026-07-16', records: [] } },
  { id: 'after-three-months', today: '2026-10-16', rules: null, history: { from: '2026-07-17', records: [vitd(1, '2026-08-01'), vitd(2, '2026-08-02')] } },
  { id: 'old-enough', today: '2026-10-16', rules: null, history: { from: '2023-10-16', records: [] } },
  { id: 'month-end-at-six', today: '2026-08-31', rules: null, history: { from: '2026-02-28', records: [] } },
  { id: 'month-end-after-six', today: '2026-08-31', rules: null, history: { from: '2026-03-01', records: [] } },
  { id: 'month-end-at-three', today: '2026-08-31', rules: null, history: { from: '2026-05-31', records: [] } },
  { id: 'month-end-after-three', today: '2026-08-31', rules: null, history: { from: '2026-06-01', records: [] } },
  { id: 'rule-off', today: '2026-10-16', rules: [{ ...RULE_CARTILAGE, enabled: false }, RULE_VITAMIN_D], history: { from: null, records: [] } },
  { id: 'all-off', today: '2026-10-16', rules: [{ ...RULE_CARTILAGE, enabled: false }, { ...RULE_VITAMIN_D, enabled: false }], history: { from: null, records: [] } },
  { id: 'rule-order', today: '2026-10-16', rules: [RULE_VITAMIN_D, RULE_CARTILAGE], history: { from: '2026-10-16', records: [] } },
  { id: 'from-broken', today: '2026-10-16', rules: null, history: { from: '2026-02-30', records: [] } },
]

const COPY_PHONES: unknown[][] = [
  H47,
  given(VITAMIN_D, 1, '2026-07-10', fakePhone(901)), // 쌓인 번호보다 지금 번호
  [VITAMIN_D, '가짜 약', fakeChart(3), '급여', '20260710', ''],
  [VITAMIN_D, '가짜 약', fakeChart(20), '급여', '20260710', fakePhone(920)], // 앞자리 0 뗀 값으로 찾는다
]

const COPY_RECORDS: readonly RecallRecordCase[] = [
  vitd(1, '2026-07-10', fakePhone(1)),
  vitd(2, '2026-07-11', fakePhone(2)),
  vitd(3, '2026-07-12'),
  vitd(4, '2026-07-13', `${fakePhone(4)} / ${fakePhone(40)}`),
  vitd(5, '2026-07-14', fakePhone(2)),
  vitd(6, '2026-07-15', '01000000002'),
  vitd(7, '2026-07-16', '+82-10-0000-0007'),
  vitd(8, '2026-07-17', `${fakePhone(8)},${fakePhone(80)}`),
  vitd(9, '2026-07-18', `${fakePhone(9)};${fakePhone(90)}`),
  vitd(10, '2026-07-19', `${fakePhone(10)} · ${fakePhone(100)}`),
  vitd(11, '2026-07-20', `${fakePhone(11)}  ${fakePhone(110)}`),
  vitd(12, '2026-07-21', ' / '),
  vitd(13, '2026-07-22', '번호 없음'),
  vitd(14, '2026-07-22', '010 0000 0014'), // 빈칸 하나는 번호 안이다(둘부터 구분)
  { ...vitd(20, '2026-07-23'), chart: `0${fakeChart(20)}` },
  // 두 규칙에 든 사람: 줄은 둘, 번호는 하나. 번호 없는 사람은 줄마다 센다
  rec(21, '2026-07-24', [VITAMIN_D, CARTILAGE], '아라간 3차 · 비타민D', fakePhone(21)),
  rec(22, '2026-07-25', [VITAMIN_D, CARTILAGE], '아라간 3차 · 비타민D'),
]

const COPY_CASES: RecallCasesFile['copy'] = [
  { id: 'phones-loaded', records: [...COPY_RECORDS], rx: COPY_PHONES },
  { id: 'phones-not-loaded', records: [...COPY_RECORDS], rx: null },
  { id: 'phone-column-missing', records: [...COPY_RECORDS], rx: [['처방코드', '차트번호', '처방일자'], [VITAMIN_D, fakeChart(1), '20260710']] },
  { id: 'chart-constructor', records: [{ ...vitd(1, '2026-07-10'), chart: 'constructor' }, { ...vitd(2, '2026-07-11', fakePhone(2)), chart: 'toString' }], rx: COPY_PHONES },
  { id: 'all-missing', records: [vitd(1, '2026-07-10'), vitd(2, '2026-07-11', '번호 없음')], rx: null },
  { id: 'empty', records: [], rx: null },
]

function recallCases(): RecallCasesFile {
  return {
    note: NOTE,
    round: ROUND_CASES.map(([round, text]) => ({ round, text })),
    addMonths: ADD_MONTHS_CASES.map(([date, months]) => ({ date, months })),
    rx: [...RX_CASES],
    validate: [...VALIDATE_CASES],
    ingest: [...INGEST_CASES],
    bulk: RECALL_BULK,
    compute: [
      { id: 'main', rules: null, records: [...MAIN_RECORDS] },
      { id: 'cartilage-off', rules: [{ ...RULE_CARTILAGE, enabled: false }, RULE_VITAMIN_D], records: [...MAIN_RECORDS] },
      { id: 'vitamin-d-off', rules: [RULE_CARTILAGE, { ...RULE_VITAMIN_D, enabled: false }], records: [...MAIN_RECORDS] },
      { id: 'all-off', rules: [{ ...RULE_CARTILAGE, enabled: false }, { ...RULE_VITAMIN_D, enabled: false }], records: [...MAIN_RECORDS] },
      { id: 'no-rules', rules: [], records: [...MAIN_RECORDS] },
      { id: 'no-records', rules: null, records: [] },
      // 글자 조건: 포함으로 보고, 줄에 없으면 전체 글이 근거다
      {
        id: 'text-round',
        rules: [{ id: 'knee', enabled: true, label: '무릎', codes: [CARTILAGE, VITAMIN_D], round: '무릎 / 아라간', months: 1 }],
        records: [cart(1, '2026-01-31', '왼쪽 무릎 / 아라간 3차'), vitd(2, '2026-02-01'), cart(3, '2026-03-01', '아라간 / 무릎')],
      },
      { id: 'far-dates', rules: null, records: [...FAR_RECORDS] },
      { id: 'bad-dates', rules: null, records: [...BAD_DATE_RECORDS] },
      // 이상한 날짜 기록이 마지막이어도 조건에 안 맞으면 원본도 멈추지 않는다
      { id: 'bad-date-not-matching', rules: null, records: [cart(61, '2026-04-15', '아라간 3차'), cart(61, '글자', '아라간 1차'), cart(62, '2026-04-16', '아라간 3차')] },
    ],
    select: SELECT_CASES,
    status: STATUS_DAYS,
    coverage: COVERAGE_CASES,
    copy: COPY_CASES,
  }
}

// ── Worker 조각·저장 사례(targets-*.json, store-*.json, AC-604) ─────────────────

// 오늘(2026-11-02, 월요일) 기준. F/U 120일 조각 넷과 처음 읽는 정기 주사 달 조각 여덟
const PIECE_TODAY = '2026-11-02'
const PIECE_H83 = ['내원번호', '차트번호', '환자명', '증상', '기록날짜']
const PIECE_FU_RX = ['차트번호', '휴대폰']
const PIECE_INJ_RX = ['처방코드', '차트번호', '처방일자', '휴대폰']

// 번호 NN → 차트번호 9001NN·전화 010-0000-01NN·이름 가상환자NN
const fuChart = (n: number) => String(900100 + n)
const fuPhone = (n: number) => fakePhone(100 + n)
const fuVisit = (visitNo: string, n: number, date: string, text: string) => [visitNo, fuChart(n), fakeName(n), text, date]
const fuGiven = (n: number) => [fuChart(n), fuPhone(n)]

function followupPieces(): TargetsReply[] {
  const piece = (from: string, to: string, chart: string[][], rx: string[][]): TargetsReply => ({
    v: 1,
    kind: 'followup',
    from,
    to,
    chart: [PIECE_H83, ...chart],
    rx: [PIECE_FU_RX, ...rx],
  })
  return [
    // 01은 뒤 조각에 새 내원이 있다(마지막 내원만 본다). 06은 지난 예정
    piece(
      '2026-07-06',
      '2026-08-05',
      [fuVisit('V0101', 1, '2026-07-10', '무릎 통증'), fuVisit('V0102', 6, '2026-07-10', '1주 뒤 f/u')],
      [fuGiven(1), fuGiven(6)],
    ),
    // 날짜 미정
    piece('2026-08-06', '2026-09-05', [fuVisit('V0201', 7, '2026-08-20', '추후 재내원')], [fuGiven(7)]),
    // 그 기간에 자료가 없는 조각
    piece('2026-09-06', '2026-10-06', [], []),
    // 내일(01·02), 내일이지만 조건부(03), 오늘(04), 모레(08), 주사이고 전화 없음(05)
    piece(
      '2026-10-07',
      PIECE_TODAY,
      [
        fuVisit('V0401', 1, '2026-10-27', '무릎 통증'),
        fuVisit('V0401', 1, '2026-10-27', '1주 뒤 f/u'),
        fuVisit('V0402', 2, PIECE_TODAY, '내일 재내원'),
        fuVisit('V0403', 3, '2026-10-27', '아프면 1주 뒤 재내원'),
        fuVisit('V0404', 4, '2026-10-26', '1주 뒤 f/u'),
        fuVisit('V0405', 5, '2026-10-30', '어깨 통증'),
        fuVisit('V0405', 5, '2026-10-30', '1주 뒤 주사'),
        fuVisit('V0406', 8, '2026-10-28', '1주 뒤 f/u'),
      ],
      [fuGiven(1), fuGiven(2), fuGiven(3), fuGiven(4), fuGiven(8)],
    ),
  ]
}

// 정기 주사 줄 하나: 83 표 줄과 47 표 줄
type Shot = { visitNo: string; chart: string; name: string; date: string; text: string; code: string; phone: string }
const shot = (visitNo: string, chart: string, name: string, date: string, text: string, code: string, phone = ''): Shot => ({ visitNo, chart, name, date, text, code, phone })

function injectionPieces(): TargetsReply[] {
  const months: [string, string, Shot[]][] = [
    [
      '2026-04-01',
      '2026-04-30',
      [
        shot('V1401', '900201', fakeName(21), '2026-04-18', '아라간 1차', CARTILAGE, fakePhone(201)),
        shot('V1402', '900201', fakeName(21), '2026-04-25', '아라간 2차', CARTILAGE, fakePhone(201)),
      ],
    ],
    // 3차 뒤 6개월 = 오늘
    ['2026-05-01', '2026-05-31', [shot('V1501', '900201', fakeName(21), '2026-05-02', '아라간 3차', CARTILAGE, fakePhone(201))]],
    // 3개월 지남. F/U 47 표에도 있는 사람(전화는 F/U 표가 먼저)
    ['2026-06-01', '2026-06-30', [shot('V1601', '900101', fakeName(1), '2026-06-10', '비타민D', VITAMIN_D, fakePhone(9101))]],
    // 지남, 전화 없음
    ['2026-07-01', '2026-07-31', [shot('V1701', '900202', fakeName(22), '2026-07-01', '비타민D', VITAMIN_D)]],
    // 예정일이 내일
    ['2026-08-01', '2026-08-31', [shot('V1801', '900203', fakeName(23), '2026-08-03', '비타민D', VITAMIN_D, fakePhone(203))]],
    ['2026-09-01', '2026-09-30', []],
    // 예정일이 먼 줄, 다시 주사해 열쇠가 바뀌는 줄(store-marked.json의 900302)
    [
      '2026-10-01',
      '2026-10-31',
      [
        shot('V2001', '900204', fakeName(24), '2026-10-05', '비타민D', VITAMIN_D, fakePhone(204)),
        shot('V2002', '900302', fakeName(32), '2026-10-05', '비타민D', VITAMIN_D, fakePhone(302)),
      ],
    ],
    ['2026-11-01', PIECE_TODAY, []],
  ]
  return months.map(([from, to, shots]) => ({
    v: 1,
    kind: 'injection',
    from,
    to,
    chart: [PIECE_H83, ...shots.map((s) => [s.visitNo, s.chart, s.name, s.text, s.date])],
    rx: [PIECE_INJ_RX, ...shots.map((s) => [s.code, s.chart, s.date, s.phone])],
  }))
}

// 표시와 쌓인 기록이 든 저장: F/U 내일 줄 연락함·열쇠가 바뀐 F/U·1년 넘게 지난 정기 주사 연락함·다시 주사해 바뀔 정기 주사
function markedStore() {
  const vitamin = (chart: string, name: string, date: string, phone = ''): RecallRecordCase => ({ chart, name, date, codes: [VITAMIN_D], text: '비타민D', phone })
  return {
    v: 1,
    marks: {
      'f|V0401|900101|2026-11-03': '2026-11-01',
      'f|V0000|900101|2026-10-01': '2026-09-30',
      'r|vitamin-d|900301|2025-04-10': '2025-04-11',
      'r|vitamin-d|900302|2026-01-01': '2025-12-31',
    },
    recall: {
      from: '2025-01-01',
      readThrough: '2026-10-15',
      records: [
        vitamin('900301', fakeName(31), '2025-01-10', fakePhone(301)),
        vitamin('900302', fakeName(32), '2025-10-01', fakePhone(302)),
        { chart: '900201', name: fakeName(21), date: '2026-05-02', codes: [CARTILAGE], text: '아라간 3차', phone: fakePhone(201) },
        vitamin('900202', fakeName(22), '2026-07-01'),
      ],
    },
  }
}

// ── 모으기·쓰기 ────────────────────────────────────────

export function buildFakePatients(seed = FAKE_PATIENTS_SEED): FakePatients {
  const rand = mulberry32(seed)
  return {
    'followup-cases.json': {
      note: NOTE,
      parse: parseCases(rand),
      written: WRITTEN.map(([id, visitDate, m, d, before]) => ({ id, visitDate, month: m, day: d, before })),
    },
    'chart-rows.json': { note: NOTE, dateCells: dateCells(), cases: chartCases(rand) },
    'rx-rows.json': { note: NOTE, tokens: [...TOKENS], columns: [...COLUMNS], cases: rxCases(rand) },
    'recall-cases.json': recallCases(),
    'targets-followup.json': { note: NOTE, today: PIECE_TODAY, pieces: followupPieces() },
    'targets-injection.json': { note: NOTE, today: PIECE_TODAY, pieces: injectionPieces() },
    'store-first.json': { note: NOTE, contact: {} },
    'store-marked.json': { note: NOTE, contact: markedStore() },
  }
}

// 파일 이름 → 쓸 글자(2칸 들여쓰기 JSON + 줄바꿈)
export function fakePatientsJson(seed = FAKE_PATIENTS_SEED): Record<string, string> {
  return Object.fromEntries(Object.entries(buildFakePatients(seed)).map(([name, value]) => [name, `${JSON.stringify(value, null, 2)}\n`]))
}

export function writeFakePatients(outDir: string): string[] {
  mkdirSync(outDir, { recursive: true })
  return Object.entries(fakePatientsJson()).map(([name, text]) => {
    const path = join(outDir, name)
    writeFileSync(path, text)
    return path
  })
}

function main(scriptPath: string) {
  const root = resolve(dirname(scriptPath), '..', '..')
  for (const path of writeFakePatients(join(root, 'fixtures', 'patients', 'fake'))) console.log(relative(root, path))
}

// 직접 돌릴 때만(시험이 import하면 돌지 않는다). import.meta를 쓰지 않는다(fixtures/make-fake-fixtures.ts와 같은 까닭)
const script = process.argv[1] === undefined ? '' : resolve(process.argv[1])
if (/[\\/]fixtures[\\/]patients[\\/]make-fake-patients\.ts$/.test(script)) {
  main(script)
}
