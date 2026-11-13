// ERP 도우미 틀(spec erp-closing-fill TASK-11, REQ-3601·3606·3611): C# 시험(helper-erp/tests/Erp.Core.Tests의 Erp* 시험)을 감싸고,
// 프로젝트 파일·명령 표·기존 도우미가 운영(1a721ef) 그대로인지를 파일 글자로 본다.
// - C#: ERP 명령 표 읽기(AC-3601.4), 기존 OriginGuard·Dispatcher·MessageLoop에 ERP 표(AC-3601.3), ErpReadGuard(AC-3606.1),
//   ERP 기록 줄(AC-3606.3: 기존 LogLine은 웹 표로 이름을 보므로 closing.*를 unknown으로 쓴다)
// - 글자: 명령 표 모양이 design.md 2절 그대로(AC-3601.4), Erp.Core 틀(AC-3611.1)·판(AC-3610.1), Closing 읽기는 ErpReadGuard로만(AC-3606.1),
//   기존 도우미·웹에 ERP 흔적 없음(AC-3601.6. git diff 자체는 끝 검토가 본다)
// - spec erp-closing-range TASK-10(REQ-3708·3709): 새 명령 closing.findCodes(AC-3708.1)·묶음 exclude(AC-3709.2)의 명령 표·문장 글자,
//   C# 시험(Erp* 시험 + Closing 시험. Closing 시험 감싸개 erp-closing.dotnet.test.ts는 TASK-10 범위 밖이라 여기서 Closing 시험을 한 번 더 돌린다)
// - TASK-14(AC-3709.2): 묶음 exclude가 코드 배열에서 규칙 { code, with 1~5개, all? } 0~20개로 바뀜(design.md 11절)
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
const CLOSING_FILTER = 'Erp.Core.Tests.Closing'
const NEW_ID = 'lkancaiekmoieooheifdimahhkejfmjc'
const ROOT_KEYS = ['protocol', 'hostName', 'origin', 'extensionId', 'extensionKey', 'commands']
type Run = { code: number; output: string }
let run: Run = { code: -1, output: '' }

beforeAll(() => {
  run = runDotnet(FILTER, { timeoutMs: 280_000 })
}, 300_000)

function lines(prefix: 'Passed' | 'Failed', ac: string, from: Run = run): number {
  const escaped = ac.replace(/\./g, '\\.')
  return (from.output.match(new RegExp(`^\\s*${prefix} ${escaped}\\b`, 'gm')) ?? []).length
}

function tail(text: string): string {
  return text.split('\n').slice(-40).join('\n')
}

function expectAc(ac: string, from: Run = run) {
  expect(from.code, tail(from.output)).toBe(0)
  expect(lines('Failed', ac, from), tail(from.output)).toBe(0)
  expect(lines('Passed', ac, from), `${ac} 시험이 돌지 않았다\n${tail(from.output)}`).toBeGreaterThan(0)
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

  it("AC-3603.5 ERP 명령 표 codes·amountCodes pattern은 가운데 빈칸 하나 코드('PROLO C')를 받고 빈칸 두 칸·탭·앞뒤 공백은 막는다", () => {
    expectAc('AC-3603.5')
  })

  it('AC-3604.6 ERP 명령 표의 매출 규칙 두 칸(amountPrefixes 0~5개·1~10자, amountCodes 0~20개, 둘 다 선택)', () => {
    expectAc('AC-3604.6')
  })

  it('AC-3708.1 ERP 명령 표 closing.findCodes { text }(patient false, 앞뒤 공백 없는 2~20자, 글자만)·ErpReadGuard가 FindCodesSql을 @day·@starts·@contains와 함께만 받음', () => {
    expectAc('AC-3708.1')
  })

  it('AC-3709.2 ERP 명령 표 closing.day 묶음 exclude(선택, 규칙 0~20개 { code, with 1~5개, all? }): 21개·with 0개·6개·코드 꼴 아님·all 참/거짓 아님·모르는 칸은 E-HELPER-BAD-MESSAGE', () => {
    expectAc('AC-3709.2')
  })
})

describe('AC-3603.5·AC-3604.6 helper-erp/commands.json 코드 꼴·매출 규칙 칸', () => {
  type Spec = { type: string; optional?: boolean; min?: number; max?: number; pattern?: string; items?: Spec; fields?: Record<string, Spec> }
  const groupFields = () => {
    const table = readJson(path.join(ERP, 'commands.json')) as { commands: Record<string, { args: Record<string, Spec> }> }
    return table.commands['closing.day'].args.groups.items?.fields as Record<string, Spec>
  }

  it('AC-3603.5 AC-3709.2: codes·amountCodes·exclude 규칙 code·with 항목은 ^\\S(?: ?\\S)*$ 1~20자, amountPrefixes 항목은 ^\\S{1,10}$ 1~10자다', () => {
    const fields = groupFields()
    expect(Object.keys(fields)).toEqual(['key', 'codes', 'amountPrefixes', 'amountCodes', 'exclude'])
    const rule = fields.exclude.items?.fields as Record<string, Spec>
    expect(rule.code, 'exclude code').toEqual(fields.codes.items)
    expect(rule.with.items, 'exclude with').toEqual(fields.codes.items)
    for (const name of ['codes', 'amountCodes']) {
      expect(fields[name].items, name).toEqual({ type: 'string', min: 1, max: 20, pattern: '^\\S(?: ?\\S)*$' })
    }
    expect(fields.amountPrefixes.items).toEqual({ type: 'string', min: 1, max: 10, pattern: '^\\S{1,10}$' })
    const code = new RegExp(fields.codes.items?.pattern as string)
    for (const ok of ['PROLO C', 'HYALU MINI', 'CARM1', '도수']) expect(code.test(ok), ok).toBe(true)
    for (const bad of ['PROLO  C', 'PROLO\tC', ' PROLO C', 'PROLO C ', 'PROLO　C']) expect(code.test(bad), JSON.stringify(bad)).toBe(false)
  })

  it('AC-3604.6: amountPrefixes(0~5개)·amountCodes(0~20개)는 선택 칸이고 codes(1~20개)는 꼭 있다', () => {
    const fields = groupFields()
    expect({ ...fields.amountPrefixes, items: undefined }).toEqual({ type: 'array', optional: true, min: 0, max: 5, items: undefined })
    expect({ ...fields.amountCodes, items: undefined }).toEqual({ type: 'array', optional: true, min: 0, max: 20, items: undefined })
    expect(fields.codes.optional).toBeUndefined()
    expect([fields.codes.min, fields.codes.max]).toEqual([1, 20])
  })
})

/** erp-closing-range design.md 10절·11절이 더한 것: closing.findCodes { text } 명령 · closing.day 묶음 exclude 칸 */
const FIND_CODES = {
  patient: false,
  args: { text: { type: 'string', min: 2, max: 20, pattern: '^\\S(?:.*\\S)?$' } },
}
/** codes 항목과 같은 코드 꼴 */
const CODE = { type: 'string', min: 1, max: 20, pattern: '^\\S(?: ?\\S)*$' }
/** 11절(TASK-14): 규칙 0~20개, 규칙마다 code 하나 · with 코드 1~5개 · 선택 all 참/거짓(표가 아는 object·array·bool 꼴) */
const EXCLUDE = {
  type: 'array',
  optional: true,
  min: 0,
  max: 20,
  items: {
    type: 'object',
    fields: {
      code: CODE,
      with: { type: 'array', min: 1, max: 5, items: CODE },
      all: { type: 'bool', optional: true },
    },
  },
}

/** erp-closing-fill design.md 2절 표 + erp-closing-range 10절·11절 */
function expectedTable(): Record<string, unknown> {
  type Fields = Record<string, unknown>
  const table = designTable() as { commands: Record<string, { args: { groups?: { items: { fields: Fields } } } }> }
  table.commands['closing.day'].args.groups!.items.fields.exclude = EXCLUDE
  ;(table.commands as Record<string, unknown>)['closing.findCodes'] = FIND_CODES
  return table as unknown as Record<string, unknown>
}

describe('AC-3601.4 helper-erp/commands.json', () => {
  it('AC-3601.4 AC-3708.1: 맨 위 열쇠는 기존 표와 같은 여섯 개, 명령은 closing.codes·closing.day·closing.findCodes 셋뿐이고 patient: false다', () => {
    const table = readJson(path.join(ERP, 'commands.json'))
    expect(Object.keys(table)).toEqual(ROOT_KEYS)
    expect(table.protocol).toBe(1)
    expect(table.hostName).toBe('com.seoseungkwan.erp_helper')
    expect(table.origin).toBe('https://erp.minesolution.com')
    expect(table.extensionId).toBe(NEW_ID)
    const commands = table.commands as Record<string, { patient: unknown }>
    expect(Object.keys(commands)).toEqual(['closing.codes', 'closing.day', 'closing.findCodes'])
    for (const spec of Object.values(commands)) expect(spec.patient).toBe(false)
  })

  it('AC-3601.4 AC-3708.1 AC-3709.2: 표 전체가 erp-closing-fill design.md 2절 + erp-closing-range design.md 10절(closing.findCodes)·11절(exclude) 그대로다(extensionKey = extension-erp/manifest.json key)', () => {
    const table = readJson(path.join(ERP, 'commands.json'))
    const key = readJson(path.join(ROOT, 'extension-erp', 'manifest.json')).key
    expect(table).toEqual({ ...expectedTable(), extensionKey: key })
  })
})

describe('TASK-10 closing.findCodes·묶음 exclude (erp-closing-range design.md 10절·11절)', () => {
  let closingRun: Run = { code: -1, output: '' }

  beforeAll(() => {
    closingRun = runDotnet(CLOSING_FILTER, { timeoutMs: 280_000 })
  }, 300_000)

  /** design.md 10절 `ClosingSql.FindCodesSql` = `…` 글 */
  function designFindSql(): string {
    const design = read(path.join(ROOT, 'specs', 'erp-closing-range', 'design.md')).replace(/\r\n/g, '\n')
    const section = design.slice(design.indexOf('## 10. '), design.indexOf('## 11. '))
    const sql = /`ClosingSql\.FindCodesSql` = `([^`]+)`/.exec(section)?.[1]
    expect(sql, 'design.md 10절 FindCodesSql 글을 찾지 못했다').toBeDefined()
    return sql as string
  }

  it('AC-3708.1 (C# Closing 시험) closing.findCodes: 코드 앞부분·이름 가운데, 오늘 쓸 수 있는 줄만, 코드마다 한 줄·대문자·코드 차례 30개, %·_·[ 바꿈, 1자·21자·빈 글자 거절, 등록 확인 관문, 답 { codes: [{ code, name }] }', () => {
    expectAc('AC-3708.1', closingRun)
  })

  it('AC-3709.2 (C# Closing 시험) 진료마다 맞는 규칙(all이면 with 모두, 아니면 하나라도)의 code를 그 묶음에서 없는 것으로 봄: 사람 수·total·규칙 금액·overlap, with는 원래 처방으로, 다른 묶음·injection·ptVisit은 그대로, 빈 exclude는 지금 답과 같음, 꼴 거절', () => {
    expectAc('AC-3709.2', closingRun)
  })

  it('AC-3708.1: commands.json closing.findCodes = { patient: false, args: { text: 글자 2~20자, 앞뒤 공백 없음 } }(표가 아는 string 꼴)', () => {
    const table = readJson(path.join(ERP, 'commands.json')) as { commands: Record<string, unknown> }
    expect(table.commands['closing.findCodes']).toEqual(FIND_CODES)
    const text = new RegExp(FIND_CODES.args.text.pattern)
    for (const ok of ['CA', '도수', '도수 치료', 'LA_1', '50%', 'A[1]', 'x  y']) expect(text.test(ok), ok).toBe(true)
    for (const bad of [' CA', 'CA ', '\tCA', 'CA\n', '  ']) expect(text.test(bad), JSON.stringify(bad)).toBe(false)
  })

  it('AC-3709.2: commands.json closing.day 묶음 exclude = 선택 칸, 규칙 0~20개 { code: 코드 꼴, with: 코드 꼴 1~5개, all?: bool }', () => {
    const table = readJson(path.join(ERP, 'commands.json')) as {
      commands: Record<string, { args: Record<string, { items?: { fields?: Record<string, unknown> } }> }>
    }
    expect(table.commands['closing.day'].args.groups.items?.fields?.exclude).toEqual(EXCLUDE)
  })

  it('AC-3708.1: ClosingSql.FindCodesSql 글은 design.md 10절 그대로이고 시간 제한은 15초, 매개변수 표는 @day Char 8·@starts·@contains VarChar', () => {
    const sql = read(path.join(CLOSING, 'ClosingSql.cs')).replace(/\r\n/g, '\n')
    const constant = /public const string FindCodesSql = @?"([^"]*)";/.exec(sql)?.[1]
    expect(constant, 'ClosingSql.FindCodesSql을 찾지 못했다').toBeDefined()
    expect(constant).toBe(designFindSql())
    expect(code(sql)).toMatch(/public static readonly TimeSpan FindTimeout = TimeSpan\.FromSeconds\(15\);/)
    expect(code(sql)).toMatch(/\[FindCodesSql\] = new\[\] \{ Day, Starts, Contains \}/)
  })

  it('AC-3708.1: FindCodesSql은 비트 코드표(dbo.SeeMst)만 읽고 환자 표·차트번호를 읽지 않는다', () => {
    const sql = designFindSql()
    expect([...sql.matchAll(/\bdbo\.(\w+)/g)].map((m) => m[1])).toEqual(['SeeMst'])
    for (const table of ['Pbs', 'OcmInf', 'OdrInf', 'OrpInf', 'OrcInf', 'RsvInf', 'RsvLog', 'DepMst', 'ChtNum', 'BirDte']) expect(sql, table).not.toContain(table)
  })

  it('AC-3708.1: ErpReadGuard는 ClosingSql.FindParameters도 보고(문장 표), closing.findCodes 처리기는 HospitalGate를 지나 ClosingCodes.Find를 부른다', () => {
    const guard = code(read(path.join(CORE, 'ErpReadGuard.cs')))
    expect(guard).toContain('ClosingSql.FindParameters')
    const commands = code(read(path.join(CLOSING, 'ClosingCommands.cs')))
    expect(commands).toMatch(/public const string FindCodesName = "closing\.findCodes";/)
    const handler = commands.slice(commands.indexOf('dispatcher.Register(FindCodesName'))
    expect(handler.indexOf('HospitalGate.Open(')).toBeGreaterThan(-1)
    expect(handler.indexOf('HospitalGate.Open(')).toBeLessThan(handler.indexOf('ClosingCodes.Find('))
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
  it('AC-3610.1: helper-erp/Directory.Build.props 한 곳에서 판을 정하고(TASK-16에서 0.2.0), Product는 ERP 도우미, 나머지 설정은 기존 도우미와 같다', () => {
    const erp = read(path.join(ERP, 'Directory.Build.props'))
    const helper = read(path.join(HELPER, 'Directory.Build.props'))
    expect(property(erp, 'Version')).toBe('0.2.0')
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

  it('AC-3610.4: 이 묶음(TASK-15~19)의 ERP 도우미 판은 0.2.0이고, 기존 도우미 판 0.5.1·웹 LATEST_HELPER 0.5.1·MIN_HELPER 0.3.0은 그대로다', () => {
    expect(property(read(path.join(ERP, 'Directory.Build.props')), 'Version')).toBe('0.2.0')
    expect(property(read(path.join(HELPER, 'Directory.Build.props')), 'Version')).toBe('0.5.1')
    const versions = read(path.join(ROOT, 'src', 'lib', 'bridge', 'versions.ts'))
    expect(versions).toMatch(/export const LATEST_HELPER = '0\.5\.1'/)
    expect(versions).toMatch(/export const MIN_HELPER = '0\.3\.0'/)
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
