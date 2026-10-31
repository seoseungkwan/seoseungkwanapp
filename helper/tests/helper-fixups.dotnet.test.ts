// 도우미 마무리(TASK-33, REQ-005 후속)를 감싼다.
// - AC-005.8: Precheck.Helper.csproj가 Precheck.Windows를 참조하고 x86으로 빌드된다(비트 DLL이 32비트)
// - AC-005.9·AC-005.12: C# 시험(Precheck.Core.Tests.Registration·Bit)에서 그 AC ID 시험이 돌았고 실패가 없다
// - AC-005.11: SqlBitDb.cs 글자에 Commit이 없고, SqlCommand는 세션 트랜잭션으로만 만든다(윈도우 없이 글자로 증명)
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildDotnet, runDotnet } from './runDotnet'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const HELPER_CSPROJ = path.join('helper', 'src', 'Precheck.Helper', 'Precheck.Helper.csproj')
const OUT_DIR = path.join(ROOT, 'helper', 'src', 'Precheck.Helper', 'bin', 'Release', 'net48')
const SQL_BIT_DB = path.join(ROOT, 'helper', 'src', 'Precheck.Windows', 'SqlBitDb.cs')

function tail(text: string): string {
  return text.split('\n').slice(-40).join('\n')
}

// ── AC-005.8 x86 빌드 ───────────────────────────────────

/** PE 파일에서 CLR 머리(데이터 디렉터리 14번)의 Flags를 읽는다. 없으면 null */
function clrFlags(pe: Buffer): number | null {
  if (pe.length < 0x40 || pe.toString('latin1', 0, 2) !== 'MZ') return null
  const peOffset = pe.readUInt32LE(0x3c)
  if (pe.toString('latin1', peOffset, peOffset + 4) !== 'PE\0\0') return null
  const coff = peOffset + 4
  const sectionCount = pe.readUInt16LE(coff + 2)
  const optionalSize = pe.readUInt16LE(coff + 16)
  const optional = coff + 20
  const magic = pe.readUInt16LE(optional)
  const dataDirs = optional + (magic === 0x20b ? 112 : 96)
  const clrRva = pe.readUInt32LE(dataDirs + 14 * 8)
  const clrSize = pe.readUInt32LE(dataDirs + 14 * 8 + 4)
  if (clrRva === 0 || clrSize < 20) return null
  const sections = optional + optionalSize
  for (let i = 0; i < sectionCount; i++) {
    const s = sections + i * 40
    const virtualSize = pe.readUInt32LE(s + 8)
    const virtualAddress = pe.readUInt32LE(s + 12)
    const rawPointer = pe.readUInt32LE(s + 20)
    if (clrRva >= virtualAddress && clrRva < virtualAddress + virtualSize) {
      const clr = rawPointer + (clrRva - virtualAddress)
      // IMAGE_COR20_HEADER: cb(4) · 판(2+2) · MetaData(8) · Flags(4)
      return pe.readUInt32LE(clr + 16)
    }
  }
  return null
}

const COMIMAGE_FLAGS_32BITREQUIRED = 0x2

describe('AC-005.8 Precheck.Helper.csproj: Precheck.Windows 참조 · x86 빌드', () => {
  const csproj = readFileSync(path.join(ROOT, HELPER_CSPROJ), 'utf8')

  it('AC-005.8 csproj에 Precheck.Windows 참조와 <PlatformTarget>x86</PlatformTarget>이 있고 <Platform>·<Platforms>·<OutputPath>는 없다', () => {
    expect(csproj).toContain('<ProjectReference Include="../Precheck.Windows/Precheck.Windows.csproj" />')
    expect(csproj).toMatch(/<PlatformTarget>x86<\/PlatformTarget>/)
    expect(csproj).not.toMatch(/<Platforms?>/)
    expect(csproj).not.toMatch(/<OutputPath>/)
  })

  it('AC-005.8 dotnet build -c Release가 통과해 bin/Release/net48에 exe·Precheck.Windows.dll·Precheck.Core.dll이 생기고 exe CLR 머리에 32BITREQUIRED가 켜져 있다', () => {
    const run = buildDotnet(HELPER_CSPROJ, { timeoutMs: 280_000 })
    expect(run.code, tail(run.output)).toBe(0)
    for (const file of ['PrecheckHelper.exe', 'Precheck.Windows.dll', 'Precheck.Core.dll']) {
      expect(existsSync(path.join(OUT_DIR, file)), `${file}이 ${OUT_DIR}에 없다`).toBe(true)
    }
    const flags = clrFlags(readFileSync(path.join(OUT_DIR, 'PrecheckHelper.exe')))
    expect(flags, 'CLR 머리를 찾지 못했다').not.toBeNull()
    expect((flags ?? 0) & COMIMAGE_FLAGS_32BITREQUIRED).toBe(COMIMAGE_FLAGS_32BITREQUIRED)
  }, 300_000)
})

// ── AC-005.9 · AC-005.12 C# 시험 ─────────────────────────

const FILTERS = ['Precheck.Core.Tests.Registration', 'Precheck.Core.Tests.Bit'] as const

describe('AC-005.9 · AC-005.12 병원 이름 없음 · 깨진 등록 파일 (C# Precheck.Core.Tests.Registration · Bit)', () => {
  let runs: { filter: string; code: number; output: string }[] = []

  beforeAll(() => {
    runs = FILTERS.map((filter) => ({ filter, ...runDotnet(filter, { timeoutMs: 280_000 }) }))
  }, 600_000)

  function count(prefix: 'Passed' | 'Failed', ac: string): number {
    const pattern = new RegExp(`^\\s*${prefix} ${ac.replace(/\./g, '\\.')}\\b`, 'gm')
    return runs.reduce((sum, run) => sum + (run.output.match(pattern) ?? []).length, 0)
  }

  function expectAc(ac: string) {
    for (const run of runs) expect(run.code, `${run.filter}\n${tail(run.output)}`).toBe(0)
    const all = runs.map((run) => tail(run.output)).join('\n')
    expect(count('Failed', ac), all).toBe(0)
    expect(count('Passed', ac), `${ac} 시험이 돌지 않았다\n${all}`).toBeGreaterThan(0)
  }

  it('AC-005.9 registration.dat JSON·bit.check 답·확인 창 글 어디에도 병원 이름이 없고 범위 값을 이름 자리에 넣지 않는다', () => {
    expectAc('AC-005.9')
  })

  it('AC-005.12 깨진 registration.dat: 맞는 .bak이면 되살리고 깨진 파일은 이름만 바꿔 둠, 아니면 E-STORE-BROKEN·처음 등록처럼 새로 등록', () => {
    expectAc('AC-005.12')
  })
})

// ── AC-005.11 SqlBitDb.cs 읽기 전용 글자 시험 ─────────────

/** 주석(//·///·블록 주석)을 뺀 C# 글자. 문자열 안의 //는 SqlBitDb.cs에 없어 따로 다루지 않는다 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

/** `new SqlCommand(` 뒤 괄호 안 인자를 맨 위 쉼표로 나눈다 */
function sqlCommandCalls(code: string): { at: number; args: string[] }[] {
  const calls: { at: number; args: string[] }[] = []
  const marker = /new\s+SqlCommand\s*\(/g
  for (let m = marker.exec(code); m; m = marker.exec(code)) {
    const args: string[] = []
    let depth = 0
    let current = ''
    let i = m.index + m[0].length
    for (; i < code.length; i++) {
      const ch = code[i]
      if (ch === '(' || ch === '[' || ch === '{') depth++
      if (ch === ')' || ch === ']' || ch === '}') {
        if (depth === 0) break
        depth--
      }
      if (ch === ',' && depth === 0) {
        args.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
    if (current.trim()) args.push(current.trim())
    calls.push({ at: m.index, args })
  }
  return calls
}

describe('AC-005.11 SqlBitDb.cs: Commit 없음 · SqlCommand는 세션 트랜잭션으로만', () => {
  const code = stripComments(readFileSync(SQL_BIT_DB, 'utf8'))

  it('AC-005.11 주석을 뺀 글자에 Commit 부름이 없다', () => {
    expect(code).not.toMatch(/Commit\s*\(/)
    expect(code).not.toMatch(/\.Commit\b/)
  })

  it('AC-005.11 new SqlCommand(는 모두 세 번째 인자가 transaction이고, 예외는 ReadOnlyGuard.Require를 먼저 지난 Sql.SnapshotStateSql 한 곳뿐', () => {
    const calls = sqlCommandCalls(code)
    expect(calls.length).toBeGreaterThan(0)
    const outside = calls.filter((call) => call.args[2] !== 'transaction')
    expect(outside.map((call) => call.args[0])).toEqual(['Sql.SnapshotStateSql'])
    for (const call of calls.filter((c) => c.args[2] === 'transaction')) expect(call.args).toHaveLength(3)
    const snapshot = outside[0]
    expect(snapshot.args).toHaveLength(2)
    const before = code.slice(0, snapshot.at)
    const guard = before.lastIndexOf('ReadOnlyGuard.Require(Sql.SnapshotStateSql')
    expect(guard, 'Sql.SnapshotStateSql 앞에 ReadOnlyGuard.Require가 없다').toBeGreaterThanOrEqual(0)
    // 가드와 SqlCommand 사이에 메서드 경계가 없다(같은 메서드 안에서 먼저 지난다)
    expect(before.slice(guard)).not.toMatch(/\b(private|public|internal|protected)\b/)
  })

  it('AC-005.11 명령을 만드는 다른 길(CreateCommand·new(…)·new SqlCommand { }·SqlDataAdapter)이 없다: SqlCommand 글자 수 = new SqlCommand( 수', () => {
    expect(code).not.toMatch(/CreateCommand\s*\(/)
    expect(code).not.toMatch(/\bSqlDataAdapter\b/)
    const named = code.match(/\bSqlCommand\b/g) ?? []
    const created = code.match(/new\s+SqlCommand\s*\(/g) ?? []
    expect(created.length).toBeGreaterThan(0)
    expect(named.length).toBe(created.length)
    expect(created.length).toBe(sqlCommandCalls(code).length)
  })

  it('AC-005.11 SqlBitDb.Query도 SqlCommand를 만들기 전에 ReadOnlyGuard.Require를 지난다', () => {
    const query = code.slice(code.indexOf('public IReadOnlyList<IReadOnlyList<object?>> Query('))
    const guard = query.indexOf('ReadOnlyGuard.Require(sql, args)')
    const command = query.indexOf('new SqlCommand(sql, connection, transaction)')
    expect(guard).toBeGreaterThan(0)
    expect(command).toBeGreaterThan(guard)
  })
})
