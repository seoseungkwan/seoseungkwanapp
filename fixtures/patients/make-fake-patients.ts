import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

// 환자 탭(F/U 명단) 계산·골든 시험용 **가짜** 자료 생성기. 실제 환자 자료는 한 글자도 쓰지 않는다.
// 이름 '가상환자NN', 차트번호 9로 시작하는 6자리, 전화 010-0000-NNNN, 내원번호 V+숫자.
// `npx tsx fixtures/patients/make-fake-patients.ts` → fixtures/patients/fake/*.json. 씨앗이 고정이라 늘 같은 파일이 나온다.
// 원본 결과(골든, fixtures/patients/golden)는 scripts/patients/golden/revisit.mjs가 이 파일들을 원본에 넣어 만든다.
// 이 파일을 바꾸면 골든도 다시 만든다(골든 머리의 sha256이 달라져 골든 시험이 알린다).

export type ParseCase = { id: string; visitDate: string; lines: string[] }
export type WrittenCase = { id: string; visitDate: string; month: number; day: number; before: string }
export type RowsCase = { id: string; rows: unknown[][]; allowMissing?: boolean }
export type FollowupCasesFile = { note: string; parse: ParseCase[]; written: WrittenCase[] }
export type ChartRowsFile = { note: string; dateCells: unknown[]; cases: RowsCase[] }
export type RxRowsFile = { note: string; tokens: string[]; columns: string[]; cases: RowsCase[] }
export type FakePatients = {
  'followup-cases.json': FollowupCasesFile
  'chart-rows.json': ChartRowsFile
  'rx-rows.json': RxRowsFile
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
