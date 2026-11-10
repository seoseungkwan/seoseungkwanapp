// ERP 도우미 틀(spec erp-closing-fill TASK-11, REQ-3601·3606·3611): C# 시험(helper-erp/tests/Erp.Core.Tests의 Erp* 시험)을 감싸고,
// 프로젝트 파일·명령 표·기존 도우미가 운영(1a721ef) 그대로인지를 파일 글자로 본다.
// - C#: ERP 명령 표 읽기(AC-3601.4), 기존 OriginGuard·Dispatcher·MessageLoop에 ERP 표(AC-3601.3), ErpReadGuard(AC-3606.1),
//   ERP 기록 줄(AC-3606.3: 기존 LogLine은 웹 표로 이름을 보므로 closing.*를 unknown으로 쓴다)
// - 글자: 명령 표 모양이 design.md 2절 그대로(AC-3601.4), Erp.Core 틀(AC-3611.1)·판(AC-3610.1), Closing 읽기는 ErpReadGuard로만(AC-3606.1),
//   기존 도우미·웹에 ERP 흔적 없음(AC-3601.6. git diff 자체는 끝 검토가 본다)
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const ERP = path.join(ROOT, 'helper-erp')
const CORE = path.join(ERP, 'src', 'Erp.Core')
const CLOSING = path.join(CORE, 'Closing')
const HELPER = path.join(ROOT, 'helper')
const FILTER = 'Erp.Core.Tests.Erp'
const NEW_ID = 'lkancaiekmoieooheifdimahhkejfmjc'
const ROOT_KEYS = ['protocol', 'hostName', 'origin', 'extensionId', 'extensionKey', 'commands']
let run: { code: number; output: string } = { code: -1, output: '' }

beforeAll(() => {
  run = runDotnet(FILTER, { timeoutMs: 280_000 })
}, 300_000)

function lines(prefix: 'Passed' | 'Failed', ac: string): number {
  const escaped = ac.replace(/\./g, '\\.')
  return (run.output.match(new RegExp(`^\\s*${prefix} ${escaped}\\b`, 'gm')) ?? []).length
}

function tail(text: string): string {
  return text.split('\n').slice(-40).join('\n')
}

function expectAc(ac: string) {
  expect(run.code, tail(run.output)).toBe(0)
  expect(lines('Failed', ac), tail(run.output)).toBe(0)
  expect(lines('Passed', ac), `${ac} 시험이 돌지 않았다\n${tail(run.output)}`).toBeGreaterThan(0)
}

function read(file: string): string {
  if (!existsSync(file)) throw new Error(`${path.relative(ROOT, file)} 파일이 없다`)
  return readFileSync(file, 'utf8')
}

function readJson(file: string): Record<string, unknown> {
  return JSON.parse(read(file)) as Record<string, unknown>
}

/** 폴더 아래 파일 전부(경로는 ROOT 기준 / 로). bin·obj는 빼고 */
function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .map((f) => f.split(path.sep).join('/'))
    .filter((f) => !f.split('/').some((part) => part === 'bin' || part === 'obj'))
    .filter((f) => statSync(path.join(dir, f)).isFile())
}

/** csproj 안 <Tag Include="…" …/> 들의 Include 값 */
function includes(xml: string, tag: string): string[] {
  return [...xml.matchAll(new RegExp(`<${tag}\\s+Include="([^"]+)"`, 'g'))].map((m) => m[1])
}

function property(xml: string, name: string): string | undefined {
  return new RegExp(`<${name}>([^<]*)</${name}>`).exec(xml)?.[1]
}

/** PackageReference 이름 → 판 */
function packages(xml: string): Record<string, string> {
  return Object.fromEntries(
    [...xml.matchAll(/<PackageReference\s+Include="([^"]+)"\s+Version="([^"]+)"/g)].map((m) => [m[1], m[2]]),
  )
}

/** C# 글에서 // 주석과 /// 문서 주석을 지운다(코드 줄만 본다) */
function code(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
}

/** design.md 2절 ```json 블록(ERP 명령 표 모양) */
function designTable(): Record<string, unknown> {
  const design = read(path.join(ROOT, 'specs', 'erp-closing-fill', 'design.md'))
  const section = design.slice(design.indexOf('## 2. 명령 모양'), design.indexOf('## 3. '))
  const block = /```json\n([\s\S]*?)\n```/.exec(section)?.[1]
  expect(block, 'design.md 2절 json 블록을 찾지 못했다').toBeDefined()
  return JSON.parse(block as string) as Record<string, unknown>
}

describe('C# Erp.Core.Tests (ErpCommandTable·ErpProtocol·ErpReadGuard·ErpLogLine)', () => {
  it('AC-3601.4 실린 ERP 명령 표는 helper-erp/commands.json 그대로, 기존 CommandTable.Parse로 읽힘, 명령 둘·patient false·args 모양·ID·hostName', () => {
    expectAc('AC-3601.4')
  })

  it('AC-3601.3 기존 OriginGuard·Dispatcher·MessageLoop에 ERP 표: 새 확장만·closing.*만, hello·claim.month는 E-HELPER-UNKNOWN-COMMAND, 기존 확장 origin은 바로 끝남', () => {
    expectAc('AC-3601.3')
  })

  it('AC-3606.1 ErpReadGuard: 마감일지 문장·기존 허용 문장만 통과, 표 밖·틀린 매개변수는 DB 전에 E-BIT-READ-FAILED, Closing 읽기는 모두 관문을 지남', () => {
    expectAc('AC-3606.1')
  })

  it('AC-3606.3 ERP 기록 줄은 기존 LogLine과 같은 시각·명령 이름·오류 번호 모양이고 이름은 ERP 표의 closing.*만', () => {
    expectAc('AC-3606.3')
  })
})

describe('AC-3601.4 helper-erp/commands.json', () => {
  it('AC-3601.4: 맨 위 열쇠는 기존 표와 같은 여섯 개, 명령은 closing.codes·closing.day 둘뿐이고 patient: false다', () => {
    const table = readJson(path.join(ERP, 'commands.json'))
    expect(Object.keys(table)).toEqual(ROOT_KEYS)
    expect(table.protocol).toBe(1)
    expect(table.hostName).toBe('com.seoseungkwan.erp_helper')
    expect(table.origin).toBe('https://erp.minesolution.com')
    expect(table.extensionId).toBe(NEW_ID)
    const commands = table.commands as Record<string, { patient: unknown }>
    expect(Object.keys(commands)).toEqual(['closing.codes', 'closing.day'])
    for (const spec of Object.values(commands)) expect(spec.patient).toBe(false)
  })

  it('AC-3601.4: 표 전체가 design.md 2절 그대로다(extensionKey = extension-erp/manifest.json key)', () => {
    const table = readJson(path.join(ERP, 'commands.json'))
    const key = readJson(path.join(ROOT, 'extension-erp', 'manifest.json')).key
    expect(table).toEqual({ ...designTable(), extensionKey: key })
  })
})

describe('AC-3611.1 Erp.Core 틀', () => {
  it('AC-3611.1: Erp.Core는 netstandard2.0이고 기존 Precheck.Core를 프로젝트 참조로만 쓴다(소스 복사·DLL 참조 없음)', () => {
    const csproj = read(path.join(CORE, 'Erp.Core.csproj'))
    expect(property(csproj, 'TargetFramework')).toBe('netstandard2.0')
    expect(csproj).not.toContain('<TargetFrameworks>')
    expect(includes(csproj, 'ProjectReference')).toEqual(['../../../helper/src/Precheck.Core/Precheck.Core.csproj'])
    expect(includes(csproj, 'Compile')).toEqual([])
    expect(includes(csproj, 'Reference')).toEqual([])
    expect(csproj).not.toMatch(/Precheck\.Windows/)
  })

  it('AC-3611.1: ERP 명령 표는 ../../commands.json을 erp-commands.json 이름으로 싣고, ErpCommandTable.Load는 기존 CommandTable.Parse를 부른다', () => {
    const csproj = read(path.join(CORE, 'Erp.Core.csproj'))
    expect(csproj).toMatch(/<EmbeddedResource\s+Include="\.\.\/\.\.\/commands\.json"\s+LogicalName="erp-commands\.json"\s*\/>/)
    const table = code(read(path.join(CORE, 'ErpCommandTable.cs')))
    expect(table).toContain('"erp-commands.json"')
    expect(table).toMatch(/CommandTable\.Parse\(EmbeddedBytes\(\)\)/)
  })

  it('AC-3611.1: 마감일지 문장·계산(Closing/*)은 Erp.Core에 있고 namespace는 Erp.Core.Closing, helper-erp 안에 Precheck 코드 사본이 없다', () => {
    expect(filesUnder(CLOSING).sort()).toEqual(['ClosingCodes.cs', 'ClosingCommands.cs', 'ClosingDay.cs', 'ClosingSql.cs'])
    for (const file of filesUnder(CLOSING)) {
      expect(read(path.join(CLOSING, file)), file).toMatch(/^namespace Erp\.Core\.Closing;$/m)
    }
    const sources = filesUnder(ERP).filter((f) => f.endsWith('.cs'))
    expect(sources.length).toBeGreaterThan(0)
    for (const file of sources) {
      expect(read(path.join(ERP, file)), file).not.toMatch(/^namespace Precheck\.(?!Core\.Tests)/m)
    }
    expect(filesUnder(CORE).filter((f) => f.endsWith('.cs')).sort()).toEqual([
      'Closing/ClosingCodes.cs',
      'Closing/ClosingCommands.cs',
      'Closing/ClosingDay.cs',
      'Closing/ClosingSql.cs',
      'ErpCommandTable.cs',
      'ErpLogLine.cs',
      'ErpReadGuard.cs',
    ])
  })

  it('AC-3611.1: Erp.Core.Tests는 net10.0;net48이고 기존 시험의 가짜 부품은 고치지 않고 링크로만 쓴다', () => {
    const csproj = read(path.join(ERP, 'tests', 'Erp.Core.Tests', 'Erp.Core.Tests.csproj'))
    expect(property(csproj, 'TargetFrameworks')).toBe('net10.0;net48')
    expect(includes(csproj, 'ProjectReference')).toEqual([
      '../../src/Erp.Core/Erp.Core.csproj',
      '../../../helper/src/Precheck.Core/Precheck.Core.csproj',
    ])
    for (const linked of includes(csproj, 'Compile')) {
      expect(linked).toMatch(/^\.\.\/\.\.\/\.\.\/helper\/tests\/Precheck\.Core\.Tests\/[A-Za-z]+\/[A-Za-z]+\.test\.cs$/)
      // 링크한 파일은 시험이 아니라 가짜 부품뿐이다(기존 시험이 ERP 시험에서 두 번 돌지 않게)
      expect(read(path.join(ERP, 'tests', 'Erp.Core.Tests', linked)), linked).not.toMatch(/\[(Fact|Theory)\b/)
    }
  })

  it('AC-3611.1: NuGet 판은 정확한 판이고 기존 도우미 csproj의 같은 패키지 판과 같다', () => {
    const helperVersions: Record<string, string> = {}
    for (const file of filesUnder(HELPER).filter((f) => f.endsWith('.csproj'))) {
      Object.assign(helperVersions, packages(read(path.join(HELPER, file))))
    }
    const erpProjects = filesUnder(ERP).filter((f) => f.endsWith('.csproj'))
    expect(erpProjects.length).toBeGreaterThanOrEqual(2)
    for (const file of erpProjects) {
      const xml = read(path.join(ERP, file))
      expect(xml, file).not.toMatch(/<PackageReference\s+Include="[^"]+"\s*\/>/)
      for (const [name, version] of Object.entries(packages(xml))) {
        expect(version, `${file} ${name}`).toMatch(/^[0-9]+(\.[0-9]+)+$/)
        expect(version, `${file} ${name}`).toBe(helperVersions[name])
      }
    }
  })

  it('AC-3611.1: ErpHelper.sln에 Erp.Core·Erp.Core.Tests·참조하는 기존 Precheck.Core가 있다', () => {
    const sln = read(path.join(ERP, 'ErpHelper.sln'))
    for (const project of [
      'src\\Erp.Core\\Erp.Core.csproj',
      'tests\\Erp.Core.Tests\\Erp.Core.Tests.csproj',
      '..\\helper\\src\\Precheck.Core\\Precheck.Core.csproj',
    ]) {
      expect(sln, project).toContain(`"${project}"`)
    }
  })
})

describe('AC-3610.1 ERP 도우미 판', () => {
  it('AC-3610.1: helper-erp/Directory.Build.props 한 곳에서 0.1.0, Product는 ERP 도우미, 나머지 설정은 기존 도우미와 같다', () => {
    const erp = read(path.join(ERP, 'Directory.Build.props'))
    const helper = read(path.join(HELPER, 'Directory.Build.props'))
    expect(property(erp, 'Version')).toBe('0.1.0')
    expect(property(erp, 'Product')).toBe('Seoseungkwan ERP Helper')
    for (const name of ['Company', 'LangVersion', 'Nullable', 'Deterministic', 'TreatWarningsAsErrors', 'IncludeSourceRevisionInInformationalVersion']) {
      expect(property(erp, name), name).toBe(property(helper, name))
      expect(property(erp, name), name).toBeDefined()
    }
    for (const file of filesUnder(ERP).filter((f) => f.endsWith('.csproj'))) {
      expect(read(path.join(ERP, file)), file).not.toMatch(/<(Version|AssemblyVersion|FileVersion)>/)
    }
    // 기존 도우미 판은 그대로다
    expect(property(helper, 'Version')).toBe('0.5.1')
  })
})

describe('AC-3606.1 Closing 읽기는 ErpReadGuard로만', () => {
  it('AC-3606.1: Closing/*.cs는 기존 관문(ReadOnlyGuard·Sql.IsAllowed·Sql.ParametersOf)을 부르지 않고 DB 읽기는 ErpReadGuard.Query로만 한다', () => {
    for (const file of filesUnder(CLOSING)) {
      const text = code(read(path.join(CLOSING, file)))
      expect(text, file).not.toMatch(/\bReadOnlyGuard\b/)
      expect(text, file).not.toMatch(/\bSql\.(IsAllowed|ParametersOf)\b/)
      // .Query( 를 부르는 곳은 ErpReadGuard와 그것만 부르는 ClosingRead 둘뿐(db.Query 직접 부르기 없음)
      for (const match of text.matchAll(/(\w+)\s*\.\s*Query\s*\(/g)) {
        expect(['ErpReadGuard', 'ClosingRead'], `${file}: ${match[0]}`).toContain(match[1])
      }
    }
    const day = code(read(path.join(CLOSING, 'ClosingDay.cs')))
    const closingRead = day.slice(day.indexOf('internal static class ClosingRead'))
    expect(closingRead.match(/ErpReadGuard\.Query\(/g)).toHaveLength(1)
    expect(closingRead.match(/ErpReadGuard\.ParametersOf\(/g)).toHaveLength(1)
  })

  it('AC-3606.1: ErpReadGuard는 ClosingSql.Parameters와 기존 Sql.IsAllowed만 보고, db.Query 전에 Require를 부른다', () => {
    const guard = code(read(path.join(CORE, 'ErpReadGuard.cs')))
    expect(guard).toContain('ClosingSql.Parameters')
    expect(guard).toContain('Sql.IsAllowed(')
    expect(guard).toContain('Sql.ParametersOf(')
    const query = guard.slice(guard.indexOf('Query('))
    expect(query.indexOf('Require(')).toBeGreaterThan(-1)
    expect(query.indexOf('Require(')).toBeLessThan(query.indexOf('db.Query('))
  })
})

describe('AC-3601.6 기존 도우미·웹에 ERP 흔적이 없다(운영 1a721ef 그대로)', () => {
  it('AC-3601.6: helper/에 Closing 코드·시험·감싸개가 없다', () => {
    expect(existsSync(path.join(HELPER, 'src', 'Precheck.Core', 'Closing'))).toBe(false)
    expect(existsSync(path.join(HELPER, 'tests', 'Precheck.Core.Tests', 'Closing'))).toBe(false)
    expect(existsSync(path.join(HELPER, 'tests', 'erp-closing.dotnet.test.ts'))).toBe(false)
  })

  it('AC-3601.6: src/lib/bridge/commands.json은 맨 위 여섯 열쇠뿐(erp 구역 없음)이고 closing.* 명령이 없다', () => {
    const table = readJson(path.join(ROOT, 'src', 'lib', 'bridge', 'commands.json'))
    expect(Object.keys(table)).toEqual(ROOT_KEYS)
    expect(table).not.toHaveProperty('erp')
    expect(Object.keys(table.commands as object).filter((name) => name.startsWith('closing.'))).toEqual([])
    expect(table.extensionId).not.toBe(NEW_ID)
  })

  it('AC-3601.6: helper/install/host-manifest.json은 기존 확장 하나만 받는다', () => {
    const web = readJson(path.join(ROOT, 'src', 'lib', 'bridge', 'commands.json'))
    const manifest = readJson(path.join(HELPER, 'install', 'host-manifest.json'))
    expect(manifest.name).toBe(web.hostName)
    expect(manifest.allowed_origins).toEqual([`chrome-extension://${String(web.extensionId)}/`])
  })

  it('AC-3601.6: helper/src·helper/tests 코드에 closing.·Closing·ERP 확장 ID가 없다(Bit/Sql.cs 포함)', () => {
    const files = [...filesUnder(path.join(HELPER, 'src')).map((f) => path.join(HELPER, 'src', f)),
      ...filesUnder(path.join(HELPER, 'tests')).map((f) => path.join(HELPER, 'tests', f))]
      .filter((f) => /\.(cs|csproj|ts)$/.test(f))
    expect(files).toContain(path.join(HELPER, 'src', 'Precheck.Core', 'Bit', 'Sql.cs'))
    for (const file of files) {
      const text = read(file)
      const rel = path.relative(ROOT, file)
      expect(text, rel).not.toMatch(/closing\./)
      // 낱말 앞머리 Closing(ClosingSql·Precheck.Core.Closing 등)만 본다. 창 닫기 이벤트 OnFormClosing은 원래 있다
      expect(text, rel).not.toMatch(/\bClosing/)
      expect(text, rel).not.toContain(NEW_ID)
    }
  })
})
