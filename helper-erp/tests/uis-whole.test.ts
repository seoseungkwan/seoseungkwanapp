// 의사랑판 전체 확인(spec erp-uisarang TASK-16, REQ-4215·REQ-4216, design.md 12-4·13절).
// - AC-4215.1: 비트판 파일은 이 기능 전(efe60061)과 한 글자도 같다(git diff가 빔, 새로 둔 파일도 없음)
// - AC-4215.2: 이 기능 전에 있던 시험(helper-erp·extension-erp·fixtures의 *.test.ts·*.test.cs)은 design.md 12-4 표에 적은 시험만
//   기대값이 바뀐다. git diff -U0 efe60061 의 바뀐 줄을 그 전 파일의 시험 하나하나(it·[Fact]·[Theory])에 대어 보고,
//   바뀐 시험이 12-4 표와 같은 목록(ALLOWED)에 있는지 본다. 시험 밖(도움 함수·import)은 expect 줄이 바뀌지 않았는지만 본다.
//   새 시험을 더하는 것과 주석만 바꾸는 것은 기대값 바뀜이 아니다
// - AC-4216.1·AC-4216.2: 판 0.4.0·짝 문장, 안내서 두 곳 '의사랑 의원' 절(그 절 밖은 판 번호 줄만 다름)
// - 셸·파일만 쓴다(도우미·확장 코드를 부르지 않음). 화면 글은 그 글이 든 소스·명세 글자와 견준다
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
/** 이 기능 전(erp-bit-anywhere 끝) */
const BEFORE = 'efe60061'
const DESIGN = 'specs/erp-uisarang/design.md'
const REQUIREMENTS = 'specs/erp-uisarang/requirements.md'
const EXT_README = 'extension-erp/README.md'
const HELPER_README = 'helper-erp/install/README.md'

function read(rel: string): string {
  const file = path.join(ROOT, rel)
  if (!existsSync(file)) throw new Error(`${rel} 파일이 없다`)
  return readFileSync(file, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n')
}

function git(args: string[]): { status: number | null; out: string; err: string } {
  const run = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  return { status: run.status, out: run.stdout ?? '', err: `${run.stderr ?? ''}${run.error?.message ?? ''}` }
}

/** 그 전 커밋의 파일 글자(줄 끝 LF) */
function before(rel: string): string {
  const run = git(['show', `${BEFORE}:${rel}`])
  expect(run.status, `${BEFORE}:${rel} ${run.err}`).toBe(0)
  return run.out.replace(/^﻿/, '').replace(/\r\n/g, '\n')
}

// ---------------------------------------------------------------------------------------------
// AC-4215.1 비트판 파일 그대로
// ---------------------------------------------------------------------------------------------

/** requirements.md AC-4215.1의 git diff 경로(글자 그대로) */
const BIT_PATHS = [
  'helper',
  'src',
  'extension',
  'helper-erp/src/Erp.Core/Closing',
  'extension-erp/src/cells.ts',
  'extension-erp/src/fill.ts',
  'extension-erp/src/settings.ts',
  'extension-erp/src/range.ts',
  'extension-erp/src/rangeView.ts',
  'extension-erp/src/rangeTypes.ts',
  'extension-erp/src/erpday.ts',
  'extension-erp/src/__tests__',
]

describe('AC-4215.1 비트판 파일은 이 기능 전(efe60061) 그대로', () => {
  it('AC-4215.1: 견주는 경로는 requirements.md AC-4215.1의 git diff 명령 그대로이고 모두 있다', () => {
    expect(read(REQUIREMENTS)).toContain(`\`git diff ${BEFORE} -- ${BIT_PATHS.join(' ')}\``)
    for (const rel of BIT_PATHS) expect(existsSync(path.join(ROOT, rel)), rel).toBe(true)
  })

  it('AC-4215.1: git diff efe60061 -- (비트판 경로)가 비어 있다', () => {
    const run = git(['diff', '--no-ext-diff', '--stat', BEFORE, '--', ...BIT_PATHS])
    expect(run.status, run.err).toBe(0)
    expect(run.out.trim(), run.out).toBe('')
    const quiet = git(['diff', '--quiet', BEFORE, '--', ...BIT_PATHS])
    expect(quiet.status, quiet.err).toBe(0)
  })

  it('AC-4215.1: 그 경로에 커밋하지 않은 새 파일도 없다(git diff가 못 보는 것)', () => {
    const run = git(['ls-files', '--others', '--exclude-standard', '--', ...BIT_PATHS])
    expect(run.status, run.err).toBe(0)
    expect(run.out.trim()).toBe('')
  })
})

// ---------------------------------------------------------------------------------------------
// AC-4215.2 지금 시험의 기대값은 design.md 12-4 표에 적은 것만 바뀐다
// ---------------------------------------------------------------------------------------------

/**
 * design.md 12-4 표와 같은 목록. 줄마다 그 파일에서 기대값을 고쳐도 되는 시험을 고른다:
 * ac(시험·그 시험을 감싼 describe 머리의 AC 번호 가운데 하나) 그리고 has(그 전 시험 글자에 모두 듦).
 * 12-4가 AC 번호 없이 '판 0.3.0'으로 적은 줄은 그 전 시험 글자에 0.3.0이 든 시험이다
 */
type Allow = { file: string; ac?: readonly string[]; has?: readonly string[]; row: string }
const ALLOWED: readonly Allow[] = [
  { file: 'helper-erp/tests/erp-core.dotnet.test.ts', ac: ['AC-3611.1'], has: ['NuGet'], row: 'AC-3611.1 NuGet 판 (TASK-1)' },
  { file: 'helper-erp/tests/erp-core.dotnet.test.ts', ac: ['AC-3611.1'], has: ['filesUnder(CORE)'], row: 'AC-3611.1 Erp.Core 파일 목록 (TASK-1)' },
  { file: 'helper-erp/tests/erp-core.dotnet.test.ts', ac: ['AC-3601.4'], row: 'AC-3601.4 명령 표 (TASK-1)' },
  { file: 'helper-erp/tests/Erp.Core.Tests/ErpCommandTable.test.cs', ac: ['AC-3601.4'], row: 'AC-3601.4 명령 다섯 (TASK-1)' },
  { file: 'extension-erp/src/background.test.ts', has: ['erpTable()', 'COMMANDS'], row: '표와 COMMANDS가 같은지 보는 시험 (TASK-1)' },
  { file: 'extension-erp/src/main.test.ts', ac: ['AC-3609.1'], has: ["'types.js'"], row: 'AC-3609.1 모듈 목록 (TASK-14)' },
  {
    file: 'extension-erp/src/manifest.test.ts',
    ac: ['AC-3601.1', 'AC-3706.1'],
    has: ['web_accessible_resources'],
    row: 'AC-3601.1·AC-3706.1 web_accessible_resources (TASK-14)',
  },
  { file: 'extension-erp/src/manifest.test.ts', has: ['0.3.0'], row: '판 0.3.0 → 0.4.0 (TASK-16)' },
  { file: 'extension-erp/src/readme.test.ts', has: ['0.3.0'], row: '판 0.3.0 → 0.4.0, 짝 문장 (TASK-16)' },
  // 12-4 'AC-3610.1 판' 줄: 그 파일에서 판 0.3.0을 보는 시험 셋(AC-3610.1 · AC-3610.4 · AC-3708.4 안내서 짝 문장, AC-4216.1)
  { file: 'helper-erp/tests/erp-core.dotnet.test.ts', ac: ['AC-3610.1', 'AC-3610.4', 'AC-3708.4'], has: ['0.3.0'], row: 'AC-3610.1 판 (TASK-16)' },
  { file: 'helper-erp/tests/erp-helper.test.ts', ac: ['AC-3802.3'], has: ['README.md'], row: "AC-3802.3 README.md '의사랑 의원' 절 (TASK-15·16)" },
  { file: 'helper-erp/tests/erp-helper.test.ts', ac: ['AC-3801.4'], has: ['commands.json'], row: 'AC-3801.4 명령 표·확장 (TASK-15)' },
  { file: 'helper-erp/tests/erp-helper.test.ts', ac: ['AC-3801.4'], has: ['0.3.0'], row: 'AC-3801.4 ERP 도우미 판 (TASK-16)' },
  { file: 'helper-erp/tests/erp-helper.test.ts', ac: ['AC-3611.2'], has: ['filesUnder(ERP_HELPER)'], row: 'AC-3611.2 도우미 파일 목록 (TASK-15)' },
  { file: 'helper-erp/tests/erp-helper.test.ts', ac: ['AC-3806.1'], has: ['ErpStage'], row: 'AC-3806.1 단계 목록 (TASK-15)' },
  { file: 'helper-erp/tests/erp-helper.test.ts', ac: ['AC-3806.2'], has: ['OpenStandardOutput'], row: 'AC-3806.2 표준 출력 여는 곳 수 (TASK-15)' },
  { file: 'fixtures/make-fake-fixtures.test.ts', ac: ['AC-005.2'], has: ['.gitignore'], row: 'AC-005.2 .gitignore 되살림 (TASK-17)' },
]

/** 그 전 파일의 시험 하나(줄 번호는 1부터, end 포함) */
type Block = { start: number; end: number; head: string; text: string; acs: string[] }

const AC_ID = /AC-\d+\.\d+/g
const indentOf = (line: string) => line.length - line.trimStart().length

function isComment(line: string): boolean {
  const t = line.trim()
  return t === '' || t.startsWith('//') || t.startsWith('/*') || t.startsWith('*')
}

/**
 * TS 시험·describe 블록(prettier 꼴): 시작 줄과 같은 들여쓰기 이하에서 '}' · ')'로 시작하는 첫 줄이 끝.
 * ']'(it.each 표 끝)는 이어지는 것으로 보고, 다른 글자로 시작하면 한 줄짜리라 앞 줄에서 끝난다
 */
function tsBlocks(lines: string[], start: RegExp): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = []
  for (let i = 0; i < lines.length; i++) {
    if (!start.test(lines[i])) continue
    const indent = indentOf(lines[i])
    let end = i
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].trim() === '') continue
      if (indentOf(lines[j]) > indent) {
        end = j
        continue
      }
      const first = lines[j].trimStart()[0]
      if (first === '}' || first === ')') end = j
      else if (first === ']') {
        end = j
        continue
      }
      break
    }
    out.push({ start: i + 1, end: end + 1 })
  }
  return out
}

/** 블록 머리: 시작 줄부터 '=>'가 처음 나오는 줄까지(it.each 표 포함) */
function headOf(lines: string[], start: number, end: number): string {
  const head: string[] = []
  for (let i = start - 1; i < end; i++) {
    head.push(lines[i])
    if (lines[i].includes('=>')) break
  }
  return head.join('\n')
}

function tsTests(text: string): Block[] {
  const lines = text.split('\n')
  const describes = tsBlocks(lines, /^\s*describe(?:\.\w+)?\(/).map((b) => ({ ...b, head: headOf(lines, b.start, b.end) }))
  return tsBlocks(lines, /^\s*(?:it|test)[.(]/).map((b) => {
    const head = headOf(lines, b.start, b.end)
    const around = describes.filter((d) => d.start <= b.start && b.end <= d.end).map((d) => d.head)
    return {
      ...b,
      head,
      text: lines.slice(b.start - 1, b.end).join('\n'),
      acs: [...new Set([head, ...around].join('\n').match(AC_ID) ?? [])],
    }
  })
}

/** C# 시험: [Fact(…)]·[Theory(…)] 줄부터 메서드 끝까지('=>' 몸통이면 ';' 줄, 아니면 같은 들여쓰기의 '}') */
function csTests(text: string): Block[] {
  const lines = text.split('\n')
  const out: Block[] = []
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*\[(?:Fact|Theory)\b/.test(lines[i])) continue
    const indent = indentOf(lines[i])
    let sig = i + 1
    while (sig < lines.length && lines[sig].trimStart().startsWith('[')) sig++
    let end = sig
    if (lines[sig]?.includes('=>')) {
      while (end < lines.length && !lines[end].trimEnd().endsWith(';')) end++
    } else {
      end = sig + 1
      while (end < lines.length && !(indentOf(lines[end]) === indent && lines[end].trimStart().startsWith('}'))) end++
    }
    const head = lines[i]
    out.push({ start: i + 1, end: end + 1, head, text: lines.slice(i, end + 1).join('\n'), acs: [...new Set(head.match(AC_ID) ?? [])] })
  }
  return out
}

type Hunk = { oldStart: number; oldCount: number; removed: string[]; added: string[] }

/** git diff -U0 efe60061 -- file 의 덩이들(지금 작업 폴더 글자와 견줌) */
function hunksOf(rel: string): Hunk[] {
  const run = git(['diff', '-U0', '--no-color', '--no-ext-diff', BEFORE, '--', rel])
  expect(run.status, run.err).toBe(0)
  const hunks: Hunk[] = []
  for (const line of run.out.replace(/\r\n/g, '\n').split('\n')) {
    const head = /^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@/.exec(line)
    if (head) {
      hunks.push({ oldStart: Number(head[1]), oldCount: head[2] === undefined ? 1 : Number(head[2]), removed: [], added: [] })
      continue
    }
    const last = hunks.at(-1)
    if (!last || line.startsWith('---') || line.startsWith('+++')) continue
    if (line.startsWith('-')) last.removed.push(line.slice(1))
    else if (line.startsWith('+')) last.added.push(line.slice(1))
  }
  return hunks
}

/** 그 전 커밋에 있던 시험 파일(helper-erp·extension-erp·fixtures) */
function testFilesBefore(): string[] {
  const run = git(['ls-tree', '-r', '--name-only', BEFORE, '--', 'helper-erp', 'extension-erp', 'fixtures'])
  expect(run.status, run.err).toBe(0)
  return run.out.split('\n').filter((f) => /\.test\.(ts|cs)$/.test(f))
}

function allowed(file: string, test: Block): boolean {
  return ALLOWED.some(
    (a) =>
      a.file === file &&
      (a.ac === undefined || a.ac.some((ac) => test.acs.includes(ac))) &&
      (a.has === undefined || a.has.every((word) => test.text.includes(word))),
  )
}

/** 12-4 표 줄마다 [시험 파일들, 첫 칸의 AC 번호들]. '같은 파일'은 앞 줄 파일, 폴더 없는 이름은 같은 칸 앞 파일의 폴더 */
function designRows(): { files: string[]; acs: string[] }[] {
  const design = read(DESIGN)
  const start = design.indexOf('#### 12-4.')
  const end = design.indexOf('### 13.')
  expect(start, 'design.md 12-4 절').toBeGreaterThan(0)
  const rows: { files: string[]; acs: string[] }[] = []
  let last: string[] = []
  for (const line of design.slice(start, end).split('\n')) {
    const cells = line.split('|').map((c) => c.trim())
    if (cells.length < 5 || cells[1] === '시험' || cells[1].startsWith('---')) continue
    const first = cells[1]
    const named = [...first.matchAll(/`([^`]+\.test\.(?:ts|cs))`/g)].map((m) => m[1])
    const files: string[] = []
    for (const name of named) files.push(name.includes('/') ? name : `${path.posix.dirname(files.at(-1) ?? last[0])}/${name}`)
    const resolved = files.length > 0 ? files : first.startsWith('같은 파일') ? last : []
    if (resolved.length === 0) continue
    last = resolved
    rows.push({ files: resolved, acs: first.match(AC_ID) ?? [] })
  }
  return rows
}

describe('AC-4215.2 지금 시험의 기대값은 design.md 12-4 표에 적은 것만 바뀐다', () => {
  it('AC-4215.2: ALLOWED 목록은 12-4 표와 같다(파일이 같고, 표에 적은 AC 번호가 그 파일 줄에 있다)', () => {
    const rows = designRows()
    expect(rows.length).toBeGreaterThanOrEqual(16)
    const tableFiles = new Set(rows.flatMap((r) => r.files))
    expect([...new Set(ALLOWED.map((a) => a.file))].sort()).toEqual([...tableFiles].sort())
    for (const row of rows) {
      for (const file of row.files) {
        for (const ac of row.acs) {
          expect(
            ALLOWED.some((a) => a.file === file && a.ac?.includes(ac)),
            `${file} ${ac}`,
          ).toBe(true)
        }
      }
    }
  })

  it('AC-4215.2: 시험·describe 머리 나누기가 맞다(비트 시험 파일 하나로 확인)', () => {
    const tests = tsTests(before('extension-erp/src/background.test.ts'))
    const commands = tests.find((t) => t.head.includes('받는 명령은'))
    expect(commands?.acs).toEqual(expect.arrayContaining(['AC-3609.6', 'AC-3708.2']))
    expect(commands?.text).toContain('erpTable()')
    expect(commands && commands.end - commands.start).toBeLessThan(10)
    const cs = csTests(before('helper-erp/tests/Erp.Core.Tests/ErpCommandTable.test.cs'))
    expect(cs.length).toBeGreaterThan(5)
    expect(cs.find((t) => t.text.includes('OnlyClosingCommands'))?.acs).toContain('AC-3601.4')
  })

  it('AC-4215.2: 이 기능 전 시험 파일은 지우지 않았고, 바뀐 시험은 모두 12-4 표 줄의 시험이며 시험 밖 expect 줄은 그대로다', () => {
    const files = testFilesBefore()
    expect(files.length).toBeGreaterThan(20)
    const problems: string[] = []
    let changedTests = 0
    for (const file of files) {
      if (!existsSync(path.join(ROOT, file))) {
        problems.push(`${file}: 지웠다`)
        continue
      }
      const hunks = hunksOf(file).filter((h) => [...h.removed, ...h.added].some((line) => !isComment(line)))
      if (hunks.length === 0) continue
      const tests = file.endsWith('.cs') ? csTests(before(file)) : tsTests(before(file))
      for (const hunk of hunks) {
        const touched =
          hunk.oldCount > 0
            ? tests.filter((t) => t.start <= hunk.oldStart + hunk.oldCount - 1 && hunk.oldStart <= t.end)
            : tests.filter((t) => t.start <= hunk.oldStart && hunk.oldStart < t.end)
        if (touched.length === 0) {
          const expects = hunk.removed.filter((line) => !isComment(line) && /\bexpect\b|\bAssert\./.test(line))
          if (expects.length > 0) problems.push(`${file}:${hunk.oldStart} 시험 밖 expect 줄이 바뀜: ${expects[0].trim()}`)
          continue
        }
        for (const test of touched) {
          changedTests++
          if (!allowed(file, test)) problems.push(`${file}:${test.start} ${test.head.replace(/\s+/g, ' ').trim().slice(0, 160)}`)
        }
      }
    }
    expect(problems, problems.join('\n')).toEqual([])
    // TASK-1·14·15가 고친 시험이 실제로 잡힌다(나누기가 아무것도 안 보는 것이 아님)
    expect(changedTests).toBeGreaterThan(8)
  })
})

// ---------------------------------------------------------------------------------------------
// AC-4216.1 판 0.4.0 · 짝 문장
// ---------------------------------------------------------------------------------------------

const VERSION = '0.4.0'
const PAIR = `(지금 확장 ${VERSION} ↔ ERP 도우미 ${VERSION})`

describe('AC-4216.1 판 0.4.0 · 안내서 두 곳 짝 문장', () => {
  it('AC-4216.1: ERP 도우미(helper-erp/Directory.Build.props)·확장(extension-erp/manifest.json) 판이 둘 다 0.4.0이다', () => {
    expect(/<Version>([^<]*)<\/Version>/.exec(read('helper-erp/Directory.Build.props'))?.[1]).toBe(VERSION)
    expect((JSON.parse(read('extension-erp/manifest.json')) as { version: string }).version).toBe(VERSION)
  })

  it.each([EXT_README, HELPER_README])("AC-4216.1: %s 짝 문장은 '확장 0.4.0 ↔ ERP 도우미 0.4.0'이고 옛 짝 글은 없다", (rel) => {
    const text = read(rel)
    expect(text).toContain(PAIR)
    for (const old of ['확장 0.3.0 ↔', '↔ ERP 도우미 0.3.0', '(지금 0.3.0)', '지금 0.3.0)']) expect(text, old).not.toContain(old)
  })

  it("AC-4216.1: 도우미 설치 안내의 zip 예시·판 번호 줄도 0.4.0이고, '새 판으로 바꾸기'에 0.3.0 → 0.4.0 글이 있다", () => {
    const guide = read(HELPER_README)
    expect(guide).toContain(`\`seoseungkwan-erp-helper-${VERSION}.zip\``)
    expect(guide).toContain(`(0.1.0부터 시작해 지금 ${VERSION})`)
    expect(guide).toContain(`(확장 ${VERSION} ↔ ERP 도우미 ${VERSION})`)
    const update = guide.slice(guide.indexOf('## 새 판으로 바꾸기'), guide.indexOf('## 지우기'))
    expect(update).toContain(`**ERP 도우미를 0.3.0에서 ${VERSION}으로 바꿀 때**`)
    expect(update.indexOf(`0.3.0에서 ${VERSION}으로`)).toBeLessThan(update.indexOf('0.2.0에서 0.3.0으로'))
  })
})

// ---------------------------------------------------------------------------------------------
// AC-4216.2 안내서 두 곳 '의사랑 의원' 절
// ---------------------------------------------------------------------------------------------

/** '## 의사랑 의원…' 절(제목 줄 포함, 다음 '## ' 앞까지)과 그 절을 뺀 글 */
function uisSection(text: string): { section: string; rest: string } {
  const lines = text.split('\n')
  const heads = lines.flatMap((line, i) => (line.startsWith('## 의사랑 의원') ? [i] : []))
  expect(heads, "'## 의사랑 의원' 절은 하나다").toHaveLength(1)
  const start = heads[0]
  const after = lines.slice(start + 1).findIndex((line) => line.startsWith('## '))
  const end = after === -1 ? lines.length : start + 1 + after
  return { section: lines.slice(start, end).join('\n'), rest: [...lines.slice(0, start), ...lines.slice(end)].join('\n') }
}

/** 판 번호(0.3.0·0.4.0)가 든 줄을 뺀 글(AC-4216.1 판 글 줄 밖은 그대로인지 견줄 때) */
function withoutVersionLines(text: string): string[] {
  return text.split('\n').filter((line) => !/0\.[34]\.0/.test(line))
}

// 화면 글(그 글이 든 소스·명세 글자와 견줌)
const UIS_TEXT_SRC = 'extension-erp/src/uisText.ts'
const BUTTON = '의사랑 값 채우기'
const EXPORT = '엑셀로 받기'
const RANGE_LEAD = '의사랑 자료로는 하루씩만 채울 수 있어요.'
const REPORTS = ['일일수입통계', '기간별처방통계', '내원일별환자현황 위쪽 표', '내원일별환자현황 아래쪽 표', '예약환자통계 위쪽 표', '예약환자통계 아래쪽 표']
const DESKTOP = '바탕화면 › ERP마감 폴더'
const PROFILE = '사용자 폴더 › ERP마감 폴더'
/** design.md 10-6 ★ 저장법 셋째 줄(실제 지우기 규칙, 5-5) */
const DELETE_RULE =
  '이 폴더에는 마감 엑셀만 두세요. 읽은 엑셀은 지워요. 환자 정보가 든 4 · 6번은 날짜가 달라도 늘 바로 지우고, 의사랑 통계 엑셀이 아닌 엑셀도 지워요. 날짜가 다르거나 같은 보고서가 여럿인 합계 엑셀은 그대로 둬요.'
/** 10-2 7 의사랑에 없어 비워 두는 칸(업무일지 1 · 2) */
const NONE_ROWS = [
  '환자현황 90일초진 · 외래 수입 미수입금(+) · 미수발생(-) · 감액 · 장애인기금(-) · 계좌이체액(-) · 현불/환불(-) · 입원수입',
  '예약 나머지 칸 · 치료별 건수 · 연령별 90일초진 · 주사1회환자 · 신환주사환자 · 신환주사건수',
]
/** install.ps1 의사랑 등록 끝 글(design.md 10-5) */
const REGISTERED_DESKTOP = '의사랑 PC로 등록했어요. 의사랑 통계 엑셀은 바탕화면 › ERP마감 폴더에 저장해 주세요.'

describe("AC-4216.2 안내서 두 곳 '의사랑 의원' 절", () => {
  it('AC-4216.2: 견주는 화면 글은 지금 화면 글·명세 글 그대로다', () => {
    const src = read(UIS_TEXT_SRC)
    for (const line of [BUTTON, EXPORT, RANGE_LEAD, DESKTOP, PROFILE, ...NONE_ROWS]) expect(src, line).toContain(`'${line}'`)
    for (const name of REPORTS) expect(src, name).toContain(`'${name}'`)
    const design = read(DESIGN)
    expect(design).toContain(`'${DELETE_RULE}'`)
    expect(design).toContain(`'${REGISTERED_DESKTOP}'`)
    expect(read('helper-erp/install/install.ps1')).toContain(`'${REGISTERED_DESKTOP}'`)
  })

  it.each([EXT_README, HELPER_README])(
    "AC-4216.2: %s — 설치(비트 로그인 창 없음 · 폴더 자리 두 갈래)",
    (rel) => {
      const { section } = uisSection(read(rel))
      expect(section).toContain('비트 로그인 창이 뜨지 않')
      expect(section).toContain(`'${REGISTERED_DESKTOP}'`)
      expect(section).toContain(DESKTOP)
      expect(section).toContain(PROFILE)
      expect(section).toContain('OneDrive')
    },
  )

  it.each([EXT_README, HELPER_README])(
    "AC-4216.2: %s — 매일 저장할 엑셀(보고서 여섯 · 꼭 4개 · 있으면 좋은 2개 · '-환자별' · 한셀 창 닫기 · 의사랑 엑셀 전용 폴더)",
    (rel) => {
      const { section } = uisSection(read(rel))
      for (const name of REPORTS) expect(section, name).toContain(name)
      expect(section).toContain('꼭 4개')
      expect(section).toContain('있으면 좋은 2개')
      expect(section).toContain("'-환자별'")
      expect(section).toContain('한셀 창을 닫')
      expect(section).toContain('의사랑 엑셀 전용')
    },
  )

  it.each([EXT_README, HELPER_README])(
    'AC-4216.2: %s — [의사랑 값 채우기] · [엑셀로 받기] · 하루씩만 · 지우는 규칙 · 직접 넣는 칸',
    (rel) => {
      const { section } = uisSection(read(rel))
      expect(section).toContain(`**[${BUTTON}]**`)
      expect(section).toContain(`**[${EXPORT}]**`)
      expect(section).toContain(`'${RANGE_LEAD}'`)
      expect(section).toContain(`'${DELETE_RULE}'`)
      for (const row of NONE_ROWS) expect(section, row).toContain(row)
      expect(section).toContain('직접 넣')
    },
  )

  it.each([
    [EXT_README, BEFORE],
    [HELPER_README, '6754571c'],
  ])('AC-4216.2: %s 의 그 절 밖 글자는 %s 그대로다(판 번호 0.3.0·0.4.0이 든 줄만 다름, AC-4216.1)', (rel, base) => {
    const run = git(['show', `${base}:${rel}`])
    expect(run.status, run.err).toBe(0)
    const old = run.out.replace(/^﻿/, '').replace(/\r\n/g, '\n')
    expect(old).not.toContain('## 의사랑 의원')
    const { rest } = uisSection(read(rel))
    expect(withoutVersionLines(rest)).toEqual(withoutVersionLines(old))
  })

  it("AC-4216.2: 확장 안내서는 '의사랑 의원' 절을 맨 앞 소개 바로 뒤('1. 먼저 ERP 도우미 설치' 앞)에 둔다", () => {
    const text = read(EXT_README)
    expect(text.indexOf('## 의사랑 의원')).toBeGreaterThan(0)
    expect(text.indexOf('## 의사랑 의원')).toBeLessThan(text.indexOf('## 1. 먼저 ERP 도우미 설치'))
    const guide = read(HELPER_README)
    expect(guide.indexOf('## 의사랑 의원')).toBeLessThan(guide.indexOf('## 설치하기'))
  })
})
