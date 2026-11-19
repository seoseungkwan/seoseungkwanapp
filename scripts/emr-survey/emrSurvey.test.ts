// 의사랑·이지스 폴더 조사 도구(emr-survey.ps1) 시험 — REQ-7105·REQ-7106
// 임시 폴더에 가짜 파일만 만들어 윈도우 PowerShell 5.1로 돌린다(윈도우가 아니면 건너뜀).
// 이름·차트번호·주민번호·전화는 모두 지어낸 값이다(CLAUDE.md: 시험은 가짜 자료만).
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import iconv from 'iconv-lite'
import * as XLSX from 'xlsx'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const SCRIPT = join(HERE, 'emr-survey.ps1')
const REPO = join(HERE, '..', '..')
const OLD = new Date('2026-01-02T03:00:00Z')
const NEWEST = new Date('2026-03-04T03:00:00Z')
const LIMIT = { timeout: 60_000 }

// 보고서에 나오면 안 되는 것: 가짜 환자 값, 실제 파일 이름, 확장자 자리 이름, CREATE TABLE 글 (대소문자 무시)
const MUST_NOT_APPEAR = [
  '홍길동',
  '이수정',
  '신재진',
  'gildong',
  'kim',
  'minsu',
  'A00123',
  'B00456',
  '900101-1234567',
  '010-1234-5678',
  '010-9876-5432',
  '예약 변경',
  'AA157',
  '진찰료',
  '접수목록',
  '환자목록',
  '검사결과',
  'qqq',
  'xray',
  'secret',
  'patient.',
  'AB12345',
  'CREATE TABLE',
  'NOT NULL',
]

type Run = { code: number | null; out: string }

function runPs(args: string[], opts: { cwd?: string; temp?: string } = {}): Run {
  const env: NodeJS.ProcessEnv = { ...process.env }
  if (opts.temp) {
    for (const key of Object.keys(env)) if (/^te?mp$/i.test(key)) delete env[key]
    env.TEMP = opts.temp
    env.TMP = opts.temp
  }
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', ...args], {
    cwd: opts.cwd,
    env,
    timeout: 55_000,
    windowsHide: true,
  })
  return { code: r.status, out: `${r.stdout?.toString('utf8') ?? ''}${r.stderr?.toString('utf8') ?? ''}` }
}

const survey = (args: string[], opts: { cwd?: string; temp?: string } = {}) => runPs(['-File', SCRIPT, ...args], opts)

/** 폴더 안 모든 것의 이름·크기·고친 시각(폴더도). 돌린 앞뒤로 같아야 읽기만 한 것이다. */
function snapshot(dir: string): string[] {
  const out: string[] = [`. ${statSync(dir).mtimeMs}`]
  const walk = (d: string, rel: string) => {
    for (const name of readdirSync(d).sort()) {
      const full = join(d, name)
      const st = statSync(full)
      const r = rel ? `${rel}/${name}` : name
      if (st.isDirectory()) {
        out.push(`${r}/ ${st.mtimeMs}`)
        walk(full, r)
      } else out.push(`${r} ${st.size} ${st.mtimeMs}`)
    }
  }
  walk(dir, '')
  return out
}

function put(root: string, rel: string, bytes: Buffer | string, when: Date = OLD) {
  const full = join(root, rel)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, bytes)
  utimesSync(full, when, when)
}

function fakeDbf(): Buffer {
  const fields: Array<[string, string, number]> = [
    ['CHARTNO', 'C', 10],
    ['PATNAME', 'C', 20],
    ['VISITDT', 'D', 8],
    ['AB12345', 'N', 5],
  ]
  const record = ['A00123', 'KIM MINSU', '20260304', '1']
  const headerLen = 32 + 32 * fields.length + 1
  const recordLen = 1 + fields.reduce((sum, f) => sum + f[2], 0)
  const buf = Buffer.alloc(headerLen + recordLen + 1, 0)
  buf[0] = 0x03
  buf[1] = 126
  buf[2] = 3
  buf[3] = 4
  buf.writeUInt32LE(1, 4)
  buf.writeUInt16LE(headerLen, 8)
  buf.writeUInt16LE(recordLen, 10)
  fields.forEach(([name, type, len], i) => {
    const at = 32 + 32 * i
    buf.write(name, at, 'latin1')
    buf.write(type, at + 11, 'latin1')
    buf[at + 16] = len
  })
  buf[headerLen - 1] = 0x0d
  let at = headerLen
  buf[at++] = 0x20
  fields.forEach(([, , len], i) => {
    buf.write(record[i].padEnd(len, ' '), at, 'latin1')
    at += len
  })
  buf[at] = 0x1a
  return buf
}

function fakeSqlite(): Buffer {
  const page = 4096
  const buf = Buffer.alloc(page * 4, 0)
  buf.write('SQLite format 3\0', 0, 'latin1')
  buf.writeUInt16BE(page, 16)
  buf.write(
    'CREATE TABLE "visit_log" (chart_no TEXT NOT NULL, pat_name TEXT, visit_dt TEXT, memo TEXT, PRIMARY KEY (chart_no, visit_dt))',
    200,
    'utf8',
  )
  buf.write('CREATE TABLE 환자 (차트번호 TEXT, 성명 TEXT)', 700, 'utf8')
  // 둘째 쪽 끝에서 시작해 셋째 쪽으로 넘어가는(그 쪽 안에서 괄호가 닫히지 않는) CREATE TABLE
  const cut = 'CREATE TABLE kim_secret (hong_gildong TEXT, '
  buf.write(cut, page * 2 - Buffer.byteLength(cut), 'utf8')
  buf.write('kim_minsu TEXT)', page * 2, 'utf8')
  buf.write('홍길동 A00123 010-1234-5678 KIM_MINSU 900101-1234567', page * 3 + 100, 'utf8')
  return buf
}

function emptySqlite(): Buffer {
  const buf = Buffer.alloc(2048, 0)
  buf.write('SQLite format 3\0', 0, 'latin1')
  buf.writeUInt16BE(1024, 16)
  return buf
}

function fakeJet(): Buffer {
  const buf = Buffer.alloc(4096, 0)
  buf.write('\x00\x01\x00\x00Standard Jet DB\x00', 0, 'latin1')
  return buf
}

function xlsx(sheets: Array<[string, unknown[][]]>, sst: boolean): Buffer {
  const wb = XLSX.utils.book_new()
  for (const [name, rows] of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name)
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', bookSST: sst }) as Buffer
}

const jpg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.from('JFIF\0'), Buffer.alloc(200, 0)])

/** 조사할 폴더에 가짜 파일 28개, 하위 폴더 4개 */
function buildData(data: string) {
  put(
    data,
    'export/접수목록.csv',
    '\uFEFF차트번호,성명,접수일자,처방코드,PAT_NAME,OdrCod,Patient Name,메모\r\n' +
      'A00123,홍길동,2026-03-04,AA157,KIM_MINSU,AA157,KIM MINSU,예약 변경 010-1234-5678\r\n',
  )
  put(
    data,
    'export/20261119_list.csv',
    '홍길동,A00123,900101-1234567,010-1234-5678,예약 변경 010-1234-5678,HONG_GILDONG\n' +
      '이수정,B00456,900101-1234567,010-9876-5432,메모,KIM_MINSU\n',
  )
  put(data, 'export/names.csv', '이수정,신재진,KIM_MINSU\n홍길동,이수정,신재진\n')
  put(data, 'export/환자목록.txt', iconv.encode('환자명\t내원일\t처방코드\t성별\r\n홍길동\t2026-03-04\tAA157\t남\r\n', 'cp949'))
  put(data, 'db/PATIENT.DBF', fakeDbf())
  put(
    data,
    'db/visits.xlsx',
    xlsx(
      [
        [
          'Visits',
          [
            ['차트번호', '성명', 'OdrCod', '진료금액'],
            ['A00123', '홍길동', 'KIM01', 'AA157'],
          ],
        ],
        [
          'Codes',
          [
            ['코드', '명칭'],
            ['AA157', '진찰료'],
          ],
        ],
      ],
      true,
    ),
  )
  put(
    data,
    'db/list.xlsx',
    xlsx(
      [
        [
          '홍길동',
          [
            ['홍길동', 'A00123', '010-1234-5678', 'HONG_GILDONG'],
            ['이수정', 'B00456', '010-9876-5432', 'KIM_MINSU'],
          ],
        ],
      ],
      false,
    ),
  )
  put(data, 'db/emr.db', fakeSqlite())
  put(data, 'db/empty.sqlite', emptySqlite())
  put(data, 'db/old.mdb', fakeJet())
  put(data, 'db/old.xls', Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(504, 0)]))
  put(data, 'db/fake.mdf', Buffer.alloc(8192, 0))
  put(data, 'images/홍길동_20261119.jpg', jpg())
  put(data, 'images/KIM_MINSU_xray.jpg', jpg())
  put(data, '검사결과.홍길동', 'fake note', NEWEST)
  put(data, 'Dr.Kim', 'fake')
  put(data, 'a1.qqq', 'fake')
  put(data, 'b2.qqq', 'fake')
  for (let i = 1; i <= 10; i++) put(data, `pages/p${String(i).padStart(2, '0')}.htm`, '<html></html>')
}

/** 보고서의 [n] 절 */
function section(text: string, n: number): string {
  const start = text.indexOf(`[${n}] `)
  if (start < 0) return ''
  const next = text.indexOf(`\n[${n + 1}] `, start)
  return text.slice(start, next < 0 ? undefined : next)
}

/** [5] 절 안의 '■ 종류' 묶음 */
function part(text: string, head: string): string {
  const start = text.indexOf(`■ ${head}`)
  if (start < 0) return ''
  const next = text.indexOf('■ ', start + 2)
  return text.slice(start, next < 0 ? undefined : next)
}

describe.skipIf(process.platform !== 'win32')('REQ-7105 폴더 조사 도구 (윈도우 PowerShell 5.1)', LIMIT, () => {
  let root = ''
  let data = ''
  let temp = ''
  let outFile = ''
  let before: string[] = []
  let main: Run = { code: null, out: '' }
  let report = ''

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'emr-survey-test-'))
    data = join(root, 'data')
    temp = join(root, 'tmp')
    mkdirSync(temp)
    buildData(data)
    before = snapshot(data)
    // 보고서 자리는 이름 앞부분이 조사 폴더와 같은 옆 파일(끝 \ 맞춤 확인)
    outFile = join(root, 'data-report.txt')
    main = survey(['-Path', data, '-Out', outFile], { temp })
    report = existsSync(outFile) ? readFileSync(outFile, 'utf8').replace(/\r\n/g, '\n') : ''
  }, 60_000)

  afterAll(() => {
    if (root) rmSync(root, { recursive: true, force: true })
  })

  it('AC-7105.1: 폴더를 읽기만 한다 — 앞뒤로 목록·크기·고친 시각이 같고, 보고서는 -Out에 UTF-8(BOM)로 쓰이고 화면에도 보인다', () => {
    expect(main.code, main.out).toBe(0)
    expect(snapshot(data)).toEqual(before)
    const bytes = readFileSync(outFile)
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    expect(report).toContain('EMR 폴더 조사 보고서')
    expect(main.out).toContain('EMR 폴더 조사 보고서')
    expect(main.out).toContain('[1] 폴더 전체')
    // Access 임시 복사본은 늘 지운다
    expect(readdirSync(temp).filter((n) => n.startsWith('emr-survey-'))).toEqual([])
  })

  it('AC-7105.1: 없는 폴더면 "폴더를 찾지 못했어요"로 끝나고(종료 코드 1) 보고서를 쓰지 않는다', () => {
    const out = join(root, 'missing-report.txt')
    const r = survey(['-Path', join(root, 'nope'), '-Out', out])
    expect(r.code).toBe(1)
    expect(r.out).toContain('폴더를 찾지 못했어요')
    expect(existsSync(out)).toBe(false)
  })

  it('AC-7105.1: 보고서 자리가 조사 폴더 안이면(절대·대소문자 다름·끝 \\·상대 경로) 거절하고 아무것도 쓰지 않는다', () => {
    const tries: Array<{ args: string[]; cwd?: string; file: string }> = [
      { args: ['-Path', data, '-Out', join(data, 'export', 'r.txt')], file: join(data, 'export', 'r.txt') },
      { args: ['-Path', `${data.toUpperCase()}\\`, '-Out', join(data, 'r.txt')], file: join(data, 'r.txt') },
      { args: ['-Path', data, '-Out', 'r2.txt'], cwd: data, file: join(data, 'r2.txt') },
    ]
    for (const t of tries) {
      const r = survey(t.args, { cwd: t.cwd })
      expect(r.code, r.out).toBe(1)
      expect(r.out).toContain('보고서를 조사하는 폴더 안에 쓸 수 없어요. -Out으로 다른 곳을 주세요')
      expect(existsSync(t.file)).toBe(false)
    }
    expect(snapshot(data)).toEqual(before)
  })

  it('AC-7105.2: 폴더 전체 — 파일 수·크기 합·하위 폴더 수·가장 최근 고친 시각', () => {
    const s = section(report, 1)
    const files = before.filter((l) => !l.startsWith('.') && !/\/ /.test(l))
    const total = files.reduce((sum, l) => sum + Number(l.split(' ').at(-2)), 0)
    expect(files).toHaveLength(28)
    expect(s).toContain('파일 수: 28개')
    expect(s).toContain(`(${total.toLocaleString('en-US')}바이트)`)
    expect(s).toContain('하위 폴더 수: 4개')
    expect(s).toMatch(/가장 최근 고친 시각: 2026-03-0\d \d\d:\d\d/)
  })

  it('AC-7105.2: 확장자별 묶음은 많은 차례, 목록 밖 확장자는 10개 이상일 때만 그대로이고 나머지는 (그 밖 확장자)', () => {
    const s = section(report, 2)
    expect(s).toMatch(/^\s*htm · 10개 · /m)
    expect(s).toMatch(/^\s*\(그 밖 확장자\) · 4개 · .* · 2026-03-0\d \d\d:\d\d$/m)
    expect(s).toMatch(/^\s*csv · 3개 · .* · 2026-01-0\d \d\d:\d\d$/m)
    expect(s).toMatch(/^\s*xlsx · 2개 · /m)
    expect(s).toMatch(/^\s*jpg · 2개 · /m)
    expect(s).toMatch(/^\s*dbf · 1개 · /m)
    expect(s).toMatch(/^\s*txt · 1개 · /m)
    expect(s.indexOf('htm · ')).toBeLessThan(s.indexOf('(그 밖 확장자) · '))
    expect(s.indexOf('(그 밖 확장자) · ')).toBeLessThan(s.indexOf('csv · '))
    expect(s.indexOf('csv · ')).toBeLessThan(s.indexOf('xlsx · '))
  })

  it('AC-7105.2: 파일 앞 바이트로 알아본 종류별 개수', () => {
    const s = section(report, 3)
    expect(s).toContain('SQLite: 2개')
    expect(s).toContain('Access/Jet: 1개')
    expect(s).toContain('DBF: 1개')
    expect(s).toContain('ZIP(xlsx 등): 2개')
    expect(s).toContain('OLE2(xls 등): 1개')
    expect(s).toContain('SQL Server 데이터 파일: 1개')
    expect(s).toContain('글자 파일: 18개')
    expect(s).toContain('모름: 2개')
  })

  it('AC-7105.2: 이름 모양은 많은 차례 — 확장자만 그대로, 확장자 자리에 이름이 든 파일은 이름 전체를 모양으로', () => {
    const s = section(report, 4)
    expect(s).toMatch(/^\s*a99\.htm · 10개$/m)
    expect(s).toMatch(/^\s*a9\.aaa · 2개$/m)
    expect(s).toContain('가가가_99999999.jpg · 1개')
    expect(s).toContain('aaa_aaaaa_aaaa.jpg · 1개')
    expect(s).toContain('가가가가.가가가 · 1개')
    expect(s).toContain('aa.aaa · 1개')
    expect(s).toContain('가가가가.csv · 1개')
    expect(s).toContain('가가가가.txt · 1개')
    expect(s).toContain('aaaaaaa.dbf · 1개')
    expect(s.indexOf('a99.htm')).toBeLessThan(s.indexOf('a9.aaa'))
  })

  it('AC-7105.3: 표 모양 파일은 칸 이름만 — DBF 머리 칸, CSV·TXT 첫 줄(UTF-8 BOM·CP949), XLSX 시트와 첫 줄, SQLite 표·칸', () => {
    const s = section(report, 5)
    expect(part(s, 'DBF')).toContain('CHARTNO(C,10), PATNAME(C,20), VISITDT(D,8), aa99999(N,5)')
    const csv = part(s, 'CSV·TXT')
    expect(csv).toContain('구분자 쉼표 · 칸 8개: 차트번호, 성명, 접수일자, 처방코드, PAT_NAME, OdrCod, aaaaaaa aaaa, 메모')
    expect(csv).toContain('구분자 탭 · 칸 4개: 환자명, 내원일, 처방코드, 성별')
    const xl = part(s, 'XLSX')
    expect(xl).toContain('시트 2개: Visits, Codes')
    expect(xl).toContain('첫 시트 첫 줄 · 칸 4개: 차트번호, 성명, OdrCod, 진료금액')
    expect(xl).toContain('시트 1개: 가가가')
    const lite = part(s, 'SQLite')
    expect(lite).toContain('visit_log: chart_no, pat_name, visit_dt, memo')
    expect(lite).toContain('환자: 차트번호, 성명')
    expect(lite).toContain('못 읽음')
    expect(part(s, 'Access')).toMatch(/드라이버 없음|열 수 없음/)
  })

  it('AC-7105.3: Access는 임시 폴더가 조사 폴더 안이면 복사하지 않고 그 까닭만 적는다', () => {
    const data2 = join(root, 'data2')
    put(data2, 'old.mdb', fakeJet())
    mkdirSync(join(data2, 'tmp'))
    const mdbBefore = statSync(join(data2, 'old.mdb'))
    const out = join(root, 'data2-report.txt')
    const r = survey(['-Path', data2, '-Out', out], { temp: join(data2, 'tmp') })
    expect(r.code, r.out).toBe(0)
    const text = readFileSync(out, 'utf8')
    expect(part(section(text, 5), 'Access')).toContain('임시 폴더가 조사 폴더 안 — 건너뜀')
    expect(readdirSync(join(data2, 'tmp')).filter((n) => n.startsWith('emr-survey-'))).toEqual([])
    const mdbAfter = statSync(join(data2, 'old.mdb'))
    expect([mdbAfter.size, mdbAfter.mtimeMs]).toEqual([mdbBefore.size, mdbBefore.mtimeMs])
  })

  it('AC-7105.4: 첫 줄이 값이면(숫자 3자 이상·칸 이름 낱말이 아닌 한글) 칸 수와 모양만 적는다', () => {
    const s = section(report, 5)
    const csv = part(s, 'CSV·TXT')
    expect(csv).toContain(
      '첫 줄이 값처럼 보여요 · 칸 6개 · 모양: 가가가, a99999, 999999-9999999, 999-9999-9999, 가가 가가 999-9999-9999, aaaa_aaaaaaa',
    )
    expect(csv).toContain('첫 줄이 값처럼 보여요 · 칸 3개 · 모양: 가가가, 가가가, aaa_aaaaa')
    expect(part(s, 'XLSX')).toContain('첫 줄이 값처럼 보여요 · 칸 4개 · 모양: 가가가, a99999, 999-9999-9999, aaaa_aaaaaaa')
  })

  it('AC-7105.4: 가짜 환자 값·실제 파일 이름·확장자 자리 이름·CREATE TABLE 글은 (대소문자 무시) 보고서에 없다', () => {
    expect(report.length).toBeGreaterThan(0)
    // '조사한 폴더' 줄의 경로(시험 PC의 임시 폴더)는 빼고 본다
    const text = report.toLowerCase().split(data.toLowerCase()).join('')
    for (const value of MUST_NOT_APPEAR) expect(text, value).not.toContain(value.toLowerCase())
  })

  it('AC-7105.5: 설치된 SQL Server 서비스 이름과 상태가 있다(연결하지 않음, 없으면 없음)', () => {
    const r = runPs([
      '-Command',
      "Get-Service -Name 'MSSQL*','SQLAgent*' -ErrorAction SilentlyContinue | ForEach-Object { $_.Name }",
    ])
    const names = r.out
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
    const s = section(report, 6)
    expect(s).toContain('SQL Server 서비스')
    expect(s).toContain('연결하지 않음')
    if (names.length === 0) expect(s).toMatch(/^\s*없음$/m)
    for (const name of names) expect(s).toMatch(new RegExp(`^\\s*${name.replace(/[$]/g, '\\$')} · \\S`, 'm'))
  })
})

const PATIENT_LIKE = [/\d{6}-\d{7}/, /01\d-\d{3,4}-\d{4}/, /홍길동|이수정|신재진/]

describe('REQ-7105·REQ-7106 문서', () => {
  it('AC-7105.6: scripts/emr-survey/README.md — 쓰는 법, 읽는 것·읽지 않는 것, 보내기 전 훑어보기, 다음에 할 일', () => {
    const readme = readFileSync(join(HERE, 'README.md'), 'utf8')
    expect(readme).toContain('powershell -ExecutionPolicy Bypass -File emr-survey.ps1 -Path "')
    expect(readme).toContain('읽는 것')
    expect(readme).toContain('읽지 않는 것')
    expect(readme).toContain('훑어')
    expect(readme).toMatch(/영문[^\n]*이름[^\n]*지우고/)
    expect(readme).toContain('docs/emr/README.md')
    expect(readme).toContain('체크리스트')
    expect(readme).toContain('만들 때 순서')
    for (const re of PATIENT_LIKE) expect(readme).not.toMatch(re)
  })

  it('AC-7106.1: docs/emr/README.md — 탭별 자료 표, 공통 모양, 폴더에서 읽는 두 길, 체크리스트, 만들 때 순서, 폴더 조사 도구를 가리킴, 환자 값 없음', () => {
    const doc = readFileSync(join(REPO, 'docs', 'emr', 'README.md'), 'utf8')
    expect(doc).toContain('## 2. 탭별로 EMR에서 받는 자료')
    expect(doc).toContain('## 3. 공통 모양')
    expect(doc).toContain('## 4. 폴더에서 읽는 길')
    expect(doc).toContain('(가) 브라우저가 폴더를 읽음')
    expect(doc).toContain('(나) 도우미가 정해 둔 폴더를 읽음')
    expect(doc).toContain('## 5. 의사랑·이지스 PC에서 확인할 체크리스트')
    expect(doc).toContain('## 6. 만들 때 순서')
    expect(doc).toContain('scripts/emr-survey/')
    for (const re of PATIENT_LIKE) expect(doc).not.toMatch(re)
  })
})
