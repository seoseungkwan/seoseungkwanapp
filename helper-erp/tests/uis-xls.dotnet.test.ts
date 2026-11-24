// spec erp-uisarang TASK-1(REQ-4203): 의사랑 .xls 읽기 부품 XlsRows와 공용 모양 UisTypes의 C# 시험
// (helper-erp/tests/Erp.Core.Tests/Uisarang/Xls/*.test.cs, 이름 공간 Erp.Core.Tests.Uisarang.Xls — design.md 12-3)을 감싸고,
// 패키지 두 개(ADR-050)·가짜 엑셀 복사·BIFF8 전용 입구를 파일 글자로 본다.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const ERP = path.join(ROOT, 'helper-erp')
const HELPER = path.join(ROOT, 'helper')
const CORE_CSPROJ = path.join(ERP, 'src', 'Erp.Core', 'Erp.Core.csproj')
const TESTS_CSPROJ = path.join(ERP, 'tests', 'Erp.Core.Tests', 'Erp.Core.Tests.csproj')
const UISARANG = path.join(ERP, 'src', 'Erp.Core', 'Uisarang')
const SETUP = path.join(ERP, 'tests', 'Erp.Core.Tests', 'Uisarang', 'CodePagesSetup.cs')
const FILTER = 'Erp.Core.Tests.Uisarang.Xls'
/** ADR-050: 기존 도우미에 없는 새 패키지와 그 판(이것뿐) */
const ADR_050 = { ExcelDataReader: '3.9.0', 'System.Text.Encoding.CodePages': '10.0.14' }
type Run = { code: number; output: string }
let run: Run = { code: -1, output: '' }

beforeAll(() => {
  run = runDotnet(FILTER, { timeoutMs: 280_000 })
}, 300_000)

function lines(prefix: 'Passed' | 'Failed', name: string): number {
  const escaped = name.replace(/[.()]/g, (c) => `\\${c}`)
  return (run.output.match(new RegExp(`^\\s*${prefix} ${escaped}`, 'gm')) ?? []).length
}

function tail(text: string): string {
  return text.split('\n').slice(-40).join('\n')
}

function expectAc(ac: string) {
  expect(run.code, tail(run.output)).toBe(0)
  expect(lines('Failed', `${ac} `), tail(run.output)).toBe(0)
  expect(lines('Passed', `${ac} `), `${ac} 시험이 돌지 않았다\n${tail(run.output)}`).toBeGreaterThan(0)
}

function read(file: string): string {
  if (!existsSync(file)) throw new Error(`${path.relative(ROOT, file)} 파일이 없다`)
  return readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
}

/** C# 글에서 // 주석을 지운다(코드 줄만 본다) */
function code(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
}

/** PackageReference 이름 → 판 */
function packages(xml: string): Record<string, string> {
  return Object.fromEntries(
    [...xml.matchAll(/<PackageReference\s+Include="([^"]+)"\s+Version="([^"]+)"/g)].map((m) => [m[1], m[2]]),
  )
}

/** 폴더 아래 csproj(bin·obj 빼고) */
function csprojUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .map((f) => f.split(path.sep).join('/'))
    .filter((f) => f.endsWith('.csproj') && !f.split('/').some((part) => part === 'bin' || part === 'obj'))
    .filter((f) => statSync(path.join(dir, f)).isFile())
}

describe('REQ-4203 XlsRows (C# Erp.Core.Tests.Uisarang.Xls)', () => {
  it('AC-4203.1 가짜 BIFF8 .xls 첫 시트의 줄·칸을 시트 차례대로: 한글 글자 칸·숫자 칸(소수)·빈 칸, 쉼표 숫자 글자는 글자 칸, 날짜 서식은 yyyy-MM-dd 글자', () => {
    expectAc('AC-4203.1')
  })

  it('AC-4203.2 깨진 바이트·.xlsx·HTML·빈 파일·20,000줄/64칸 넘는 시트는 UisFileException 하나이고 그 글에 칸 글자가 없다', () => {
    expectAc('AC-4203.2')
  })

  it('design.md 4-1·3-2·3-3 공용 모양 UisTypes(종류·상태 JSON 이름, closing.day 답이 비트 답과 같은 칸 이름·차례 + source·uis, uisCodes 답, Facts에 글자 칸 없음) C# 시험이 모두 돌고 통과한다', () => {
    expect(run.code, tail(run.output)).toBe(0)
    expect(lines('Failed', 'UisTypes('), tail(run.output)).toBe(0)
    expect(lines('Passed', 'UisTypes('), tail(run.output)).toBeGreaterThanOrEqual(8)
  })
})

describe('AC-4203.3 패키지(ADR-050)와 가짜 엑셀 복사', () => {
  it('AC-4203.3: Erp.Core.csproj는 기존 System.Text.Json 10.0.14에 ExcelDataReader 3.9.0만 더한다(정확한 판)', () => {
    expect(packages(read(CORE_CSPROJ))).toEqual({ 'System.Text.Json': '10.0.14', ExcelDataReader: '3.9.0' })
  })

  it('AC-4203.3: Erp.Core.Tests.csproj는 기존 네 패키지 그대로이고 System.Text.Encoding.CodePages 10.0.14를 net10.0 조건 ItemGroup 안에서만 참조한다', () => {
    const xml = read(TESTS_CSPROJ)
    expect(packages(xml)).toEqual({
      'Microsoft.NET.Test.Sdk': '17.14.1',
      xunit: '2.9.3',
      'xunit.runner.visualstudio': '3.1.5',
      'Microsoft.NETFramework.ReferenceAssemblies': '1.0.3',
      'System.Text.Encoding.CodePages': '10.0.14',
    })
    const groups = [...xml.matchAll(/<ItemGroup([^>]*)>([\s\S]*?)<\/ItemGroup>/g)]
    const withCodePages = groups.filter((g) => g[2].includes('System.Text.Encoding.CodePages'))
    expect(withCodePages).toHaveLength(1)
    expect(withCodePages[0][1]).toMatch(/^\s+Condition="'\$\(TargetFramework\)' == 'net10\.0'"\s*$/)
    expect(packages(withCodePages[0][2])).toEqual({ 'System.Text.Encoding.CodePages': '10.0.14' })
    expect(xml).not.toContain('ExcelDataReader')
  })

  it('AC-4203.3: helper-erp 안 새 패키지는 ADR-050 두 개뿐이고 그 판이다(기존 도우미에 있는 패키지는 기존 판)', () => {
    const helper: Record<string, string> = {}
    for (const file of csprojUnder(HELPER)) Object.assign(helper, packages(read(path.join(HELPER, file))))
    for (const name of Object.keys(ADR_050)) expect(helper, name).not.toHaveProperty(name)
    for (const file of csprojUnder(ERP)) {
      for (const [name, version] of Object.entries(packages(read(path.join(ERP, file))))) {
        expect(version, `${file} ${name}`).toBe(helper[name] ?? ADR_050[name as keyof typeof ADR_050])
      }
    }
    // 도우미 입구(Erp.Helper)는 Erp.Core를 거쳐서만 받는다(따로 참조하지 않는다)
    expect(read(path.join(ERP, 'src', 'Erp.Helper', 'Erp.Helper.csproj'))).not.toMatch(/ExcelDataReader|CodePages/)
  })

  it('AC-4203.3 AC-4203.4: 시험 csproj는 가짜 엑셀을 uisarang/ 아래로 복사한다(design.md 12-1 줄 그대로)', () => {
    expect(read(TESTS_CSPROJ)).toContain(
      '<None Include="../../../fixtures/fake-uisarang/*.xls" Link="uisarang/%(Filename)%(Extension)" CopyToOutputDirectory="PreserveNewest" />',
    )
  })
})

describe('design.md 5-6 .xls 읽기 입구', () => {
  it('5-6: XlsRows는 BIFF8 전용 ExcelReaderFactory.CreateBinaryReader만 쓰고, 저절로 고르는 CreateReader·xlsx·CSV 입구는 쓰지 않는다', () => {
    const text = code(read(path.join(UISARANG, 'XlsRows.cs')))
    expect(text).toMatch(/^namespace Erp\.Core\.Uisarang;$/m)
    expect(text).toContain('ExcelReaderFactory.CreateBinaryReader(')
    for (const other of ['CreateReader(', 'CreateOpenXmlReader(', 'CreateCsvReader(']) expect(text, other).not.toContain(other)
    expect(text).toMatch(/public const int MaxRows = 20_?000;/)
    expect(text).toMatch(/public const int MaxColumns = 64;/)
    expect(text).toMatch(/Read\(byte\[\] bytes\)\s*=>\s*Read\(bytes, MaxRows, MaxColumns\);/)
  })

  it('5-6: 코드 페이지 등록은 시험(net10.0)만 한다 — Erp.Core 의사랑 코드에는 Encoding.RegisterProvider가 없다', () => {
    for (const file of readdirSync(UISARANG).filter((f) => f.endsWith('.cs'))) {
      expect(code(read(path.join(UISARANG, file))), file).not.toContain('RegisterProvider')
    }
    const setup = code(read(SETUP))
    expect(setup).toMatch(/#if NET\n[\s\S]*\[ModuleInitializer\][\s\S]*Encoding\.RegisterProvider\(CodePagesEncodingProvider\.Instance\)[\s\S]*#endif/)
  })
})
