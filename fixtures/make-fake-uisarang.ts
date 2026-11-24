import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import * as XLSX from 'xlsx'

// 가짜 의사랑 통계 엑셀(spec erp-uisarang design.md 12-1, TASK-1). `npm run fixtures:uis`로 fixtures/fake-uisarang/에 다시 만든다.
// - 저장소의 SheetJS xlsx 0.20.3으로 BIFF8(.xls)을 쓴다. 파일 시각·작성자 칸은 고정이라 다시 만들어도 바이트가 같다
// - 표 모양은 design.md 5-1·5-3 머리글(조사 노트의 파일 모양)만 따르고, 숫자는 시안 예시 관계(지은 값)다. 실제 의원 파일·숫자는 없다
// - 환자별 표(내원·예약 아래쪽 표)의 글자 칸은 표시 글자(12-2)뿐이다: 가짜환자NN · 앞 7자리만 숫자인 주민번호 · 010-0000-00xx ·
//   가짜시 가짜구 1 · 차트번호 9000001~
// C# 시험(helper-erp/tests/Erp.Core.Tests, Erp.Core.Tests.csproj가 uisarang/로 복사)과 make-fake-uisarang.test.ts가 읽는다

/** 가짜 엑셀의 마감 일자(시안 예시) */
export const UIS_DAY = '2026-11-23'

/** 만드는 파일(design.md 12-1 차례) */
export const UIS_FIXTURE_NAMES = [
  'income.xls',
  'income-no-sum.xls',
  'income-outpatient.xls',
  'income-other-date.xls',
  'rx.xls',
  'rx-3months.xls',
  'visits.xls',
  'visit-patients.xls',
  'visit-patients-no-date.xls',
  'rsv.xls',
  'rsv-patients.xls',
  'rsv-patients-other-day.xls',
  'other-report.xls',
  'broken.xls',
  'real-xlsx.xls',
  'html.xls',
] as const

type Cell = string | number | null | XLSX.CellObject
type Rows = Cell[][]

/** 엑셀 날짜 일련번호(1899-12-30부터 날 수). 시간대와 상관없게 UTC로 센다 */
function serial(day: string): number {
  const [y, m, d] = day.split('-').map(Number)
  return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000
}

/** 날짜 서식(기본 서식 14번 'm/d/yy') 숫자 칸. ExcelDataReader는 날짜로 읽는다 */
const dateCell = (day: string): XLSX.CellObject => ({ t: 'n', v: serial(day), z: 'm/d/yy' })

/** 파일 시각·작성자 칸(고정) */
function props(): XLSX.FullProperties {
  const when = new Date(Date.UTC(2026, 10, 23))
  return { Title: 'fake-uisarang', Author: 'fake-uisarang', LastAuthor: 'fake-uisarang', CreatedDate: when, ModifiedDate: when }
}

function workbook(rows: Rows, second?: Rows): XLSX.WorkBook {
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), 'Sheet1')
  if (second) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(second), 'Sheet2')
  book.Props = props()
  return book
}

function biff8(rows: Rows, second?: Rows): Uint8Array {
  return new Uint8Array(XLSX.write(workbook(rows, second), { type: 'array', bookType: 'biff8' }))
}

function xlsx(rows: Rows): Uint8Array {
  return new Uint8Array(XLSX.write(workbook(rows), { type: 'array', bookType: 'xlsx', compression: true }))
}

const range = (day: string) => `${day} ~ ${day}`
const pad2 = (n: number) => String(n).padStart(2, '0')

// --- 일일수입통계(수입통계): 보험구분 줄 넷 + '합계' 줄, 합계 줄 총진료비는 병합 칸 모양(비고 바로 아래 줄에 값) ---

const INCOME_HEADER = ['보험구분', '총진료비', '급여총액', '청구액', '본인부담금', '진료수납액', '비급여', '초진수', '재진수', '인원계', '현금수납액', '카드수납액']
// 총진료비 5,182,300 = 급여총액 3,976,300 + 비급여 1,206,000 · 진료수납액 1,741,100 = 현금 352,500 + 카드 1,388,600 · 초진 9 + 재진 88 = 인원계 97
const INCOME_LINES: Rows = [
  ['건강보험', 4250000, 3200000, 2687900, 512100, 1562100, 1050000, 6, 70, 76, 270500, 1291600],
  ['의료급여', 550000, 520000, 497000, 23000, 53000, 30000, 1, 12, 13, 53000, 0],
  ['자동차보험', 256300, 256300, 256300, 0, 0, 0, 1, 4, 5, 0, 0],
  ['일반', 126000, 0, 0, 0, 126000, 126000, 1, 2, 3, 29000, 97000],
]
// 진료수납액은 쉼표가 든 글자 칸('1,741,100'), 총진료비는 비고 바로 아래 줄에 값
const INCOME_SUM: Cell[] = ['합계', null, 3976300, 3441200, 535100, '1,741,100', 1206000, 9, 88, 97, 352500, 1388600]
const INCOME_MERGED: Cell[] = [null, 5182300]

function income(opts: { day?: string; inout?: string; sum?: boolean } = {}): Rows {
  const day = opts.day ?? UIS_DAY
  const rows: Rows = [
    ['일일수입통계'],
    ['[조 회 일]', range(day), null, '[외/입 구분]', opts.inout ?? '전체'],
    [],
    [...INCOME_HEADER],
    ...INCOME_LINES.map((line) => [...line]),
  ]
  if (opts.sum !== false) rows.push([...INCOME_SUM], [...INCOME_MERGED])
  return rows
}

// --- 기간별처방통계 위쪽 표(진료통계): 쪽마다 머리글 되풀이, 소수 총투여량 코드 하나, 합계 줄 ---

const RX_HEADER = ['코드', '처방명칭', '횟수', '총투여량', '단가', '총액']
// 코드·이름은 지은 것. ' mm300 '(앞뒤 빈칸·소문자)은 MM300과 같은 코드, 'PROLO  C'는 가운데 빈칸 두 칸, 총액 소수는 원 미만 버림 대상
const RX_DAY: Rows[] = [
  [
    ['AA222', '물리치료 내원 (가짜)', 31, 31, 1200, 37200],
    ['CA100', '씨암 유도 (가짜)', 4, 4, 55000, 220000],
    ['SO100', '초음파 유도 (가짜)', 6, 6, 40000, 240000],
    ['MM300', '도수치료 (가짜)', 8, 8, 60000, 480000],
    ['ES100', '체외충격파 (가짜)', 5, 5, 50000, 250000],
    ['PT100', '온열치료 (가짜)', 40, 40, 1580, 63200],
  ],
  [
    [' mm300 ', '도수치료 (가짜)', 2, 2, 60000, 120000],
    ['PROLO  C', '프롤로 주사 (가짜)', 3, 3, 33333.3, 99999.9],
    ['LA357', '주사 (가짜)', 1, 0.5, 9800, 4900],
    ['KK090', '물리치료 (가짜)', 12, 12, 1028.8, 12345.6],
    ['ES200', '체외충격파 방사형 (가짜)', 2, 2, 40000, 80000],
  ],
]
const RX_3MONTHS: Rows[] = [
  [
    ['AA222', '물리치료 내원 (가짜)', 1820, 1820, 1200, 2184000],
    ['CA100', '씨암 유도 (가짜)', 240, 240, 55000, 13200000],
    ['SO100', '초음파 유도 (가짜)', 355, 355, 40000, 14200000],
    ['MM300', '도수치료 (가짜)', 470, 470, 60000, 28200000],
    ['ES100', '체외충격파 (가짜)', 310, 310, 50000, 15500000],
    ['ES200', '체외충격파 방사형 (가짜)', 120, 120, 40000, 4800000],
    ['PT100', '온열치료 (가짜)', 2400, 2400, 1580, 3792000],
    ['KK090', '물리치료 (가짜)', 700, 700, 1028.8, 720160],
    ['LA357', '주사 (가짜)', 61, 30.5, 9800, 298900],
    ['PROLO  C', '프롤로 주사 (가짜)', 150, 150, 33333.3, 4999995],
    ['ZZ001', null, 3, 3, 1000, 3000],
  ],
  [
    [' mm300 ', '도수치료 (가짜)', 30, 30, 60000, 1800000],
    ['MC100', '도수 상담 (가짜)', 80, 80, 0, 0],
  ],
]

function rx(from: string, to: string, pages: Rows[]): Rows {
  const lines = pages.flat()
  const qty = lines.reduce((acc, line) => acc + Number(line[3]), 0)
  // 합계 줄 총액 = 코드 줄 총액을 줄마다 원 미만 버린 합(맞춰 보기 rxTotal이 맞는 날)
  const amount = lines.reduce((acc, line) => acc + Math.trunc(Number(line[5])), 0)
  const rows: Rows = [['기간별처방통계'], [`[조 회 일] ${from} ~ ${to}`, null, '[구 분] 전체'], [...RX_HEADER]]
  pages.forEach((page, i) => {
    if (i > 0) rows.push([], [...RX_HEADER])
    rows.push(...page.map((line) => [...line]))
  })
  rows.push(['합계', null, null, qty, null, amount])
  return rows
}

// --- 내원일별환자현황(인원통계) 위쪽 표: 인원수 97 · 신규환자 7, 내원일은 날짜 서식 칸 ---

function visits(): Rows {
  return [
    ['내원일별환자현황'],
    ['[조 회 일]', range(UIS_DAY)],
    ['내원일', '인원수', '신규환자', '초진', '재진'],
    [dateCell(UIS_DAY), 97, 7, 9, 88],
    ['합계', 97, 7, 9, 88],
  ]
}

// --- 환자별 표의 가짜 사람(표시 글자만) ---

/** 신규 환자 차례 번호(7명) */
const NEW_PATIENTS = new Set([3, 15, 27, 41, 55, 68, 90])
/** 만 나이(마감 일자 기준, 생일은 늘 1~10월이라 그해 생일이 지났다) */
const AGES = [3, 8, 12, 17, 24, 29, 35, 38, 44, 47, 52, 56, 61, 65, 69, 73, 77, 81, 86, 92]
/** 일부러 넣은 주민번호 꼴: 생년월일 800101 표시 · 빈칸 구분 · 1800년대(9·0) · 달력에 없는 날 · 마감 일자 뒤 · 빈 칸 */
const SPECIAL_RRN: Record<number, string> = {
  1: '800101-1******',
  5: '850505 1******',
  33: '991231-9******',
  34: '010101-0******',
  50: '800230-1******',
  60: '261231-4******',
  70: '',
}

function rrn(n: number): string {
  if (n in SPECIAL_RRN) return SPECIAL_RRN[n]
  const year = 2026 - AGES[n % AGES.length]
  const month = (n % 10) + 1
  const day = (n % 28) + 1
  const male = n % 2 === 1
  const seventh = year >= 2000 ? (male ? 3 : 4) : male ? 1 : 2
  return `${pad2(year % 100)}${pad2(month)}${pad2(day)}-${seventh}******`
}

const chart = (n: number) => String(9000000 + n)
const name = (n: number) => `가짜환자${pad2(n)}`
const phone = (n: number) => `010-0000-00${pad2(n)}`
const ADDRESS = '가짜시 가짜구 1'

// --- 내원일별환자현황 아래쪽 표(환자별): 머리글 20줄마다 되풀이, 끝에 차트번호 꼴 아닌 줄 ---

const VISIT_PATIENT_HEADER = ['차트번호', '수진자명', '주민등록번호', '신규환자', '보험구분', '진료실', '전화번호', '주소']

function visitPatient(n: number): Cell[] {
  return [chart(n), name(n), rrn(n), NEW_PATIENTS.has(n) ? '신규' : null, n % 9 === 0 ? '의료급여' : '건강보험', '1진료실', phone(n), ADDRESS]
}

function visitPatients(opts: { count: number; withDate: boolean }): Rows {
  const rows: Rows = [['내원일별환자현황 (환자별)']]
  if (opts.withDate) rows.push([`[조 회 일] ${range(UIS_DAY)}`])
  rows.push([...VISIT_PATIENT_HEADER])
  for (let n = 1; n <= opts.count; n++) {
    rows.push(visitPatient(n))
    if (n % 20 === 0 && n < opts.count) rows.push([], [...VISIT_PATIENT_HEADER])
  }
  rows.push(['합계', `${opts.count}명`])
  return rows
}

// --- 예약환자통계(인원통계) 위쪽 표·아래쪽 표 ---

function rsv(): Rows {
  return [
    ['예약환자통계'],
    ['[조 회 일]', range(UIS_DAY)],
    ['예약일', '예약건수', '이행건수', '취소건수'],
    [UIS_DAY, 32, 25, 3],
    ['합계', 32, 25, 3],
  ]
}

const RSV_PATIENT_HEADER = ['예약일', '예약시간', '차트번호', '수진자명', '주민등록번호', '휴대전화', '방문여부', '진료실']

/** 예약 줄 j(1부터): 32번째 줄은 7번째와 같은 사람(같은 차트번호 두 줄), 1~25번째는 방문 */
function rsvPatient(j: number, day: string): Cell[] {
  const n = j === 32 ? 7 : j
  const time = `${pad2(9 + (j % 9))}:${j % 2 === 1 ? '00' : '30'}`
  return [day, time, chart(n), name(n), rrn(n), phone(n), j <= 25 ? '방문' : '미방문', '1진료실']
}

/** 예약일 칸 꼴: 날짜만 · 시각 붙음 · 점 · 빗금(모두 마감 일자) */
function rsvDay(j: number): string {
  if (j <= 26) return UIS_DAY
  if (j <= 28) return `${UIS_DAY} 14:30`
  if (j <= 30) return UIS_DAY.replace(/-/g, '.')
  return UIS_DAY.replace(/-/g, '/')
}

function rsvPatients(days: string[]): Rows {
  const rows: Rows = [['예약환자통계 (환자별)'], [`[조 회 일] ${range(UIS_DAY)}`], [...RSV_PATIENT_HEADER]]
  days.forEach((day, i) => rows.push(rsvPatient(i + 1, day)))
  rows.push(['합계', null, `${days.length}건`])
  return rows
}

// --- 종류 모름·깨짐·xlsx·HTML ---

function otherReport(): { first: Rows; second: Rows } {
  return {
    first: [['월별매출'], ['월', '매출', '비고'], ['2026-10', 1000000, null]],
    second: [['둘째 시트']],
  }
}

const HTML_TABLE =
  '<html><head><meta charset="utf-8"></head><body><table>' +
  '<tr><td>보험구분</td><td>진료수납액</td></tr><tr><td>합계</td><td>1741100</td></tr>' +
  '</table></body></html>\n'

export function uisFixtureFiles(): Array<[string, Uint8Array]> {
  const incomeBytes = biff8(income())
  const other = otherReport()
  const files: Record<(typeof UIS_FIXTURE_NAMES)[number], Uint8Array> = {
    'income.xls': incomeBytes,
    'income-no-sum.xls': biff8(income({ sum: false })),
    'income-outpatient.xls': biff8(income({ inout: '외래' })),
    'income-other-date.xls': biff8(income({ day: '2026-11-22' })),
    'rx.xls': biff8(rx(UIS_DAY, UIS_DAY, RX_DAY)),
    'rx-3months.xls': biff8(rx('2026-08-24', UIS_DAY, RX_3MONTHS)),
    'visits.xls': biff8(visits()),
    'visit-patients.xls': biff8(visitPatients({ count: 97, withDate: true })),
    'visit-patients-no-date.xls': biff8(visitPatients({ count: 5, withDate: false })),
    'rsv.xls': biff8(rsv()),
    'rsv-patients.xls': biff8(rsvPatients(Array.from({ length: 32 }, (_, i) => rsvDay(i + 1)))),
    'rsv-patients-other-day.xls': biff8(rsvPatients(Array.from({ length: 10 }, (_, i) => (i < 8 ? UIS_DAY : '2026-11-24')))),
    'other-report.xls': biff8(other.first, other.second),
    // 바이트를 반으로 자른 .xls(OLE2 머리는 있고 뒤가 없음)
    'broken.xls': incomeBytes.slice(0, Math.floor(incomeBytes.length / 2)),
    'real-xlsx.xls': xlsx(income()),
    'html.xls': new TextEncoder().encode(HTML_TABLE),
  }
  return UIS_FIXTURE_NAMES.map((file) => [file, files[file]])
}

export function writeUisFixtures(outDir: string): string[] {
  mkdirSync(outDir, { recursive: true })
  return uisFixtureFiles().map(([file, bytes]) => {
    const path = join(outDir, file)
    writeFileSync(path, bytes)
    return path
  })
}

// `npm run fixtures:uis`
function main(script: string) {
  const root = resolve(dirname(script), '..')
  for (const path of writeUisFixtures(join(root, 'fixtures', 'fake-uisarang'))) console.log(relative(root, path))
}

// 직접 돌릴 때만(시험이 import하면 돌지 않는다). make-fake-fixtures.ts와 같이 import.meta를 쓰지 않는다
const script = process.argv[1] === undefined ? '' : resolve(process.argv[1])
if (/[\\/]fixtures[\\/]make-fake-uisarang\.ts$/.test(script)) {
  main(script)
}
