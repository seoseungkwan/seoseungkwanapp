// spec erp-uisarang TASK-1 AC-4203.4(design.md 12-1·12-2): 가짜 의사랑 엑셀 생성기.
// 다시 만들면 커밋된 파일과 바이트가 같고, .gitignore에 파일마다 되살리는 줄이 있으며,
// 환자별 엑셀의 글자 칸은 표시 글자(가짜환자NN·앞 7자리만 숫자인 주민번호·010-0000-00xx·가짜시 가짜구 1·9000001~)뿐이다.
// 숫자는 시안 예시 관계(지은 값)다. 실제 의원 파일·숫자는 없다
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { UIS_DAY, UIS_FIXTURE_NAMES, uisFixtureFiles, writeUisFixtures } from './make-fake-uisarang'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const COMMITTED_DIR = fileURLToPath(new URL('./fake-uisarang/', import.meta.url))
/** design.md 12-1 만드는 파일(그 차례) */
const NAMES = [
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
]
/** SheetJS biff8로 만든 표(깨짐·xlsx·HTML 셋 빼고) */
const BIFF8 = NAMES.filter((name) => !['broken.xls', 'real-xlsx.xls', 'html.xls'].includes(name))
const PATIENT_FILES = ['visit-patients.xls', 'visit-patients-no-date.xls', 'rsv-patients.xls', 'rsv-patients-other-day.xls']
const OLE2 = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]
const SLOW = { timeout: 30_000 }

type Cell = string | number | boolean
type Table = Cell[][]

let files: Map<string, Uint8Array>
let outDir = ''

beforeAll(() => {
  files = new Map(uisFixtureFiles())
  outDir = mkdtempSync(join(tmpdir(), 'fake-uisarang-'))
}, 30_000)

afterAll(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

function bytesOf(name: string): Uint8Array {
  const bytes = files.get(name)
  if (!bytes) throw new Error(`${name}을 만들지 않았다`)
  return bytes
}

/** 첫 시트 줄(빈 칸은 '') */
function table(name: string): Table {
  const book = XLSX.read(bytesOf(name), { type: 'array', raw: true })
  return XLSX.utils.sheet_to_json<Cell[]>(book.Sheets[book.SheetNames[0]], { header: 1, raw: true, blankrows: true, defval: '' })
}

const squash = (text: Cell) => String(text).replace(/\s/g, '')

/** 머리글 줄(위에서 30줄 안에서 이 칸들을 모두 품은 첫 줄) 번호와 칸 번호 */
function header(rows: Table, names: string[]): { at: number; col: (name: string) => number } {
  const at = rows.slice(0, 30).findIndex((row) => names.every((name) => row.map(squash).includes(name)))
  expect(at, `${names.join('·')} 머리글 줄`).toBeGreaterThanOrEqual(0)
  const heads = rows[at].map(squash)
  return { at, col: (name) => heads.indexOf(name) }
}

const isChart = (value: Cell) => /^[0-9]{1,12}$/.test(String(value))

describe('AC-4203.4 만드는 파일', () => {
  it('AC-4203.4: design.md 12-1의 16개를 그 이름·차례로 만들고 마감 일자는 2026-11-23이다', () => {
    expect([...UIS_FIXTURE_NAMES]).toEqual(NAMES)
    expect([...files.keys()]).toEqual(NAMES)
    expect(UIS_DAY).toBe('2026-11-23')
  })

  it('AC-4203.4: 다시 만든 바이트가 커밋된 fixtures/fake-uisarang/ 파일과 같고, 그 폴더에는 이 16개뿐이다', SLOW, () => {
    const written = writeUisFixtures(outDir)
    expect(written.map((file) => basename(file))).toEqual(NAMES)
    expect(readdirSync(COMMITTED_DIR).sort()).toEqual([...NAMES].sort())
    for (const name of NAMES) {
      const committed = new Uint8Array(readFileSync(join(COMMITTED_DIR, name)))
      const remade = new Uint8Array(readFileSync(join(outDir, name)))
      expect(Buffer.compare(Buffer.from(remade), Buffer.from(committed)), name).toBe(0)
    }
  })

  it('AC-4203.4: 두 번 만들어도 바이트가 같다(파일 시각·작성자 칸 고정)', SLOW, async () => {
    await new Promise((resolve) => setTimeout(resolve, 1_100))
    for (const [name, bytes] of uisFixtureFiles()) {
      expect(Buffer.compare(Buffer.from(bytes), Buffer.from(bytesOf(name))), name).toBe(0)
    }
  })

  it('AC-4203.4: 표 13개는 BIFF8(OLE2 머리), real-xlsx.xls는 zip, html.xls는 HTML 글자, broken.xls는 income.xls 앞 절반', () => {
    for (const name of BIFF8) expect([...bytesOf(name).subarray(0, 8)], name).toEqual(OLE2)
    expect(Buffer.from(bytesOf('real-xlsx.xls').subarray(0, 2)).toString('latin1')).toBe('PK')
    expect(new TextDecoder().decode(bytesOf('html.xls')).trimStart().toLowerCase()).toMatch(/^<html/)
    const income = bytesOf('income.xls')
    const broken = bytesOf('broken.xls')
    expect(broken.length).toBe(Math.floor(income.length / 2))
    expect(Buffer.compare(Buffer.from(broken), Buffer.from(income.subarray(0, broken.length)))).toBe(0)
  })

  it("AC-4203.4: package.json에 'npm run fixtures:uis'(tsx로 이 생성기)가 있다", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> }
    expect(pkg.scripts['fixtures:uis']).toBe('tsx fixtures/make-fake-uisarang.ts')
  })
})

describe('AC-4203.4 .gitignore 되살리는 줄', () => {
  const lines = () => readFileSync(join(ROOT, '.gitignore'), 'utf8').split(/\r?\n/).map((line) => line.trim())

  it('AC-4203.4: 만드는 파일마다 !fixtures/fake-uisarang/<이름> 줄이 있고 그 밖의 되살리는 줄은 없다(폴더째 되살리지 않음)', () => {
    const revived = lines().filter((line) => line.startsWith('!fixtures/fake-uisarang'))
    expect(revived.sort()).toEqual(NAMES.map((name) => `!fixtures/fake-uisarang/${name}`).sort())
    expect(lines()).toContain('*.[xX][lL][sS]')
  })

  it('AC-4203.4: git은 가짜 파일 16개를 무시하지 않고 같은 폴더의 다른 .xls(실제 파일)는 무시한다', () => {
    const ignored = (file: string) => spawnSync('git', ['check-ignore', '-q', file], { cwd: ROOT }).status === 0
    for (const name of NAMES) expect(ignored(`fixtures/fake-uisarang/${name}`), name).toBe(false)
    expect(ignored('fixtures/fake-uisarang/real-patients.xls')).toBe(true)
    expect(ignored('fixtures/fake-uisarang/통계-내원일별환자현황.XLS')).toBe(true)
  })
})

describe('AC-4203.4 가짜 표 모양(design.md 5-1·5-3·12-1 시안 예시 숫자)', () => {
  it('AC-4203.4: 일일수입통계는 보험구분 줄 넷 + 합계 줄, 합계 줄 총진료비는 비고 바로 아래 줄이 5,182,300, 예시 관계가 맞는다', () => {
    const rows = table('income.xls')
    const { at, col } = header(rows, ['보험구분', '총진료비', '급여총액', '청구액', '진료수납액', '비급여', '초진수', '재진수', '인원계', '현금수납액', '카드수납액'])
    const body = rows.slice(at + 1)
    expect(body.slice(0, 5).map((row) => row[col('보험구분')])).toEqual(['건강보험', '의료급여', '자동차보험', '일반', '합계'])
    const sum = body[4]
    expect(sum[col('총진료비')]).toBe('')
    expect(body[5][col('총진료비')]).toBe(5182300)
    expect(sum[col('급여총액')]).toBe(3976300)
    expect(sum[col('비급여')]).toBe(1206000)
    expect(sum[col('진료수납액')]).toBe('1,741,100')
    expect(sum[col('현금수납액')]).toBe(352500)
    expect(sum[col('카드수납액')]).toBe(1388600)
    expect([sum[col('초진수')], sum[col('재진수')], sum[col('인원계')]]).toEqual([9, 88, 97])
    // 보험구분 줄을 더하면 합계 줄(총진료비는 아래 줄)과 같다
    for (const name of ['총진료비', '급여총액', '청구액', '비급여', '초진수', '재진수', '인원계', '현금수납액', '카드수납액']) {
      const total = body.slice(0, 4).reduce((acc, row) => acc + Number(row[col(name)]), 0)
      expect(total, name).toBe(name === '총진료비' ? 5182300 : Number(sum[col(name)]))
    }
  })

  it("AC-4203.4: 일일수입통계 변형 셋 — 합계 줄 없음 · [외/입 구분] '외래' · 조회일 2026-11-22", () => {
    expect(table('income-no-sum.xls').some((row) => row[0] === '합계')).toBe(false)
    const labels = (name: string) => table(name).slice(0, 3).flat().map(String)
    expect(labels('income.xls')).toEqual(expect.arrayContaining(['[조 회 일]', '2026-11-23 ~ 2026-11-23', '[외/입 구분]', '전체']))
    expect(labels('income-outpatient.xls')).toEqual(expect.arrayContaining(['[외/입 구분]', '외래']))
    expect(labels('income-other-date.xls')).toContain('2026-11-22 ~ 2026-11-22')
  })

  it('AC-4203.4: 기간별처방통계는 쪽마다 머리글 되풀이·소수 총투여량 코드 하나·합계 줄이 있고, AA222 총투여량이 31이다', () => {
    const rows = table('rx.xls')
    const { at, col } = header(rows, ['코드', '처방명칭', '총투여량', '총액'])
    const body = rows.slice(at + 1)
    expect(body.filter((row) => squash(row[col('코드')]) === '코드').length).toBeGreaterThanOrEqual(1)
    const codeRows = body.filter((row) => row[col('코드')] !== '' && squash(row[col('코드')]) !== '코드' && row[col('코드')] !== '합계')
    expect(codeRows.filter((row) => !Number.isInteger(row[col('총투여량')]))).toHaveLength(1)
    expect(codeRows.find((row) => row[col('코드')] === 'AA222')?.[col('총투여량')]).toBe(31)
    const sum = body.filter((row) => row[col('코드')] === '합계')
    expect(sum).toHaveLength(1)
    const truncated = codeRows.reduce((acc, row) => acc + Math.trunc(Number(row[col('총액')])), 0)
    expect(sum[0][col('총액')]).toBe(truncated)
    expect(String(table('rx-3months.xls').slice(0, 3).flat().join(' '))).toContain('2026-08-24 ~ 2026-11-23')
  })

  it('AC-4203.4: 내원일별환자현황 위쪽 표는 인원수 97·신규환자 7(합계 줄)이고 차트번호 칸이 없다, 예약 위쪽 표는 예약일·예약건수·이행건수', () => {
    const visits = table('visits.xls')
    const v = header(visits, ['내원일', '인원수', '신규환자'])
    expect(visits[v.at].map(squash)).not.toContain('차트번호')
    const vSum = visits.find((row) => row[v.col('내원일')] === '합계')
    expect([vSum?.[v.col('인원수')], vSum?.[v.col('신규환자')]]).toEqual([97, 7])
    const rsv = table('rsv.xls')
    const r = header(rsv, ['예약일', '예약건수', '이행건수'])
    expect(rsv[r.at].map(squash)).not.toContain('차트번호')
  })

  it('AC-4203.4: 내원 아래쪽 표는 머리글이 20줄마다 되풀이되고 환자 줄 97(신규 7)·차트번호 꼴 아닌 끝 줄·1800·1900·2000년대·틀린 주민번호가 있다', () => {
    const rows = table('visit-patients.xls')
    const { at, col } = header(rows, ['차트번호', '신규환자', '주민등록번호'])
    expect(rows[at].map(squash)).not.toContain('예약일')
    const body = rows.slice(at + 1)
    const patients = body.filter((row) => isChart(row[col('차트번호')]))
    expect(patients).toHaveLength(97)
    expect(patients.filter((row) => row[col('신규환자')] === '신규')).toHaveLength(7)
    expect(body.filter((row) => squash(row[col('차트번호')]) === '차트번호')).toHaveLength(4)
    const last = body.filter((row) => row.some((cell) => cell !== '')).at(-1)
    expect(isChart(last?.[col('차트번호')] ?? '')).toBe(false)
    const seventh = patients.map((row) => String(row[col('주민등록번호')]).replace(/[\s-]/g, '')[6])
    for (const digit of ['1', '2', '3', '4', '9']) expect(seventh, digit).toContain(digit)
    const rrns = patients.map((row) => String(row[col('주민등록번호')]))
    expect(rrns).toContain('800230-1******')
    expect(rrns).toContain('')
    expect(rows.slice(0, at).flat().map(String)).toContain('[조 회 일] 2026-11-23 ~ 2026-11-23')
    expect(table('visit-patients-no-date.xls').flat().map(String).some((cell) => cell.includes('조 회 일'))).toBe(false)
  })

  it('AC-4203.4: 예약 아래쪽 표는 같은 차트번호 두 줄·방문/미방문이 있고, 다른 날 표에는 2026-11-24 예약일이 있다', () => {
    const rows = table('rsv-patients.xls')
    const { at, col } = header(rows, ['예약일', '차트번호', '방문여부'])
    const patients = rows.slice(at + 1).filter((row) => isChart(row[col('차트번호')]))
    const charts = patients.map((row) => row[col('차트번호')])
    expect(new Set(charts).size).toBe(charts.length - 1)
    expect(patients.filter((row) => row[col('방문여부')] === '방문').length).toBeGreaterThan(0)
    expect(patients.filter((row) => row[col('방문여부')] === '미방문').length).toBeGreaterThan(0)
    expect(patients.every((row) => String(row[col('예약일')]).replace(/[./]/g, '-').startsWith(UIS_DAY))).toBe(true)
    const other = table('rsv-patients-other-day.xls')
    const o = header(other, ['예약일', '차트번호', '방문여부'])
    expect(other.slice(o.at + 1).some((row) => String(row[o.col('예약일')]).startsWith('2026-11-24'))).toBe(true)
  })

  it('AC-4203.4: other-report.xls는 여섯 종류 어느 머리글도 아니다', () => {
    const cells = table('other-report.xls').flat().map(squash)
    for (const name of ['보험구분', '처방명칭', '차트번호', '예약일', '내원일', '진료수납액']) expect(cells, name).not.toContain(name)
  })
})

describe('AC-4203.4 환자 정보 표시 글자만(design.md 12-2)', () => {
  /** 모든 가짜 표 글자 칸 */
  function allTexts(): { name: string; text: string }[] {
    const out: { name: string; text: string }[] = []
    for (const name of NAMES) {
      if (name === 'broken.xls') continue
      const book =
        name === 'html.xls'
          ? XLSX.read(new TextDecoder().decode(bytesOf(name)), { type: 'string', raw: true })
          : XLSX.read(bytesOf(name), { type: 'array', raw: true })
      for (const sheet of book.SheetNames) {
        for (const row of XLSX.utils.sheet_to_json<Cell[]>(book.Sheets[sheet], { header: 1, raw: true, defval: '' })) {
          for (const cell of row) if (cell !== '') out.push({ name, text: String(cell) })
        }
      }
    }
    return out
  }

  it('AC-4203.4: 환자별 표의 이름·주민번호·전화·주소·차트번호 칸은 표시 글자 꼴뿐이다', () => {
    for (const name of PATIENT_FILES) {
      const rows = table(name)
      const { at, col } = header(rows, ['차트번호'])
      for (const row of rows.slice(at + 1).filter((r) => isChart(r[col('차트번호')]))) {
        expect(String(row[col('차트번호')]), name).toMatch(/^9000\d{3}$/)
        expect(String(row[col('수진자명')]), name).toMatch(/^가짜환자\d{2}$/)
        const rrn = col('주민등록번호')
        if (rrn >= 0) expect(String(row[rrn]), name).toMatch(/^(?:\d{6}[- ]?\d\*{6})?$/)
        for (const phone of ['전화번호', '휴대전화']) {
          if (col(phone) >= 0) expect(String(row[col(phone)]), `${name} ${phone}`).toMatch(/^010-0000-00\d{2}$/)
        }
        if (col('주소') >= 0) expect(row[col('주소')], name).toBe('가짜시 가짜구 1')
      }
    }
  })

  it('AC-4203.4: 어느 가짜 파일에도 뒷자리까지 든 주민번호·표시 꼴 밖 전화번호가 없다', () => {
    for (const { name, text } of allTexts()) {
      expect(text, name).not.toMatch(/\d{6}\s*-?\s*[0-9]\d{6}/)
      for (const phone of text.match(/01[016789]-?\d{3,4}-?\d{4}/g) ?? []) expect(phone, name).toMatch(/^010-0000-00\d{2}$/)
    }
  })

  it('AC-4203.4: AC-4209.1 시험이 찾을 표시 글자(가짜환자·800101·010-0000·가짜시·9000001)가 내원 아래쪽 표에 모두 있다', () => {
    const texts = table('visit-patients.xls').flat().map(String).join('\n')
    for (const mark of ['가짜환자', '800101', '010-0000', '가짜시', '9000001']) expect(texts, mark).toContain(mark)
  })
})
