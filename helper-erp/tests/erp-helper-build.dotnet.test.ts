// ERP 도우미 실행 프로그램 만들기(spec erp-closing-fill TASK-12, AC-3611.1·AC-3611.4·AC-3611.6, design.md 3-1·3-4·3-5).
// - Erp.Helper(net48, SeoseungkwanErpHelper.exe)를 dotnet build -c Release로 만든다. 기존 도우미 감싸개와 같은 잠금(precheck-dotnet.lock) 안에서 돈다
// - 프로젝트 설정은 기존 Precheck.Helper.csproj와 같은 것(32비트·옛 런타임 허용 설정)을 글자로 견준다. 기존 csproj는 고치지 않는다
// - 윈도우에서 실제로 비트에 붙는지는 이 PC 확인(TASK-10)에서 본다
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildDotnet } from './runDotnet'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const CSPROJ = 'helper-erp/src/Erp.Helper/Erp.Helper.csproj'
const LIVE_CSPROJ = 'helper/src/Precheck.Helper/Precheck.Helper.csproj'
const SLN = 'helper-erp/ErpHelper.sln'
const OUT_DIR = path.join(ROOT, 'helper-erp', 'src', 'Erp.Helper', 'bin', 'Release', 'net48')
const EXE = 'SeoseungkwanErpHelper'
const COMIMAGE_FLAGS_32BITREQUIRED = 0x2

function read(rel: string): string {
  const file = path.join(ROOT, rel)
  if (!existsSync(file)) throw new Error(`${rel} 파일이 없다`)
  return readFileSync(file, 'utf8').replace(/^﻿/, '')
}

function tail(text: string): string {
  return text.split('\n').slice(-40).join('\n')
}

function property(xml: string, name: string): string | undefined {
  return new RegExp(`<${name}>([^<]*)</${name}>`).exec(xml)?.[1]
}

function includes(xml: string, tag: string): string[] {
  return [...xml.matchAll(new RegExp(`<${tag}\\s+Include="([^"]+)"`, 'g'))].map((m) => m[1])
}

/** csproj의 옛 런타임 허용 설정(StartupAppConfigXml CDATA)과 그것을 obj/에 쓰는 Target */
function startupConfig(xml: string): { cdata: string | undefined; target: string | undefined } {
  return {
    cdata: /<StartupAppConfigXml><!\[CDATA\[([\s\S]*?)\]\]><\/StartupAppConfigXml>/.exec(xml)?.[1],
    target: /<Target Name="WriteStartupAppConfig"[\s\S]*?<\/Target>/.exec(xml)?.[0],
  }
}

/** PE 파일 CLR 머리의 Flags(IMAGE_COR20_HEADER). 못 찾으면 null */
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
      return pe.readUInt32LE(rawPointer + (clrRva - virtualAddress) + 16)
    }
  }
  return null
}

describe('AC-3611.1 Erp.Helper 프로젝트(net48 Exe, SeoseungkwanErpHelper)', () => {
  it('AC-3611.1: Exe·net48·AssemblyName SeoseungkwanErpHelper·RootNamespace Erp.Helper·32비트이고, 출력 자리를 옮기는 설정이 없다', () => {
    const xml = read(CSPROJ)
    expect(property(xml, 'OutputType')).toBe('Exe')
    expect(property(xml, 'TargetFramework')).toBe('net48')
    expect(xml).not.toContain('<TargetFrameworks>')
    expect(property(xml, 'AssemblyName')).toBe(EXE)
    expect(property(xml, 'RootNamespace')).toBe('Erp.Helper')
    // 비트 DLL이 32비트라 기존 도우미처럼 exe도 32비트로 돈다. bin/Release/net48(workflow zip 자리)에서 벗어나지 않게 Platform·OutputPath는 쓰지 않는다
    expect(property(xml, 'PlatformTarget')).toBe('x86')
    expect(xml).not.toMatch(/<Platforms?>|<OutputPath>|<BaseOutputPath>/)
  })

  it('AC-3611.1: Erp.Core·기존 Precheck.Core·Precheck.Windows는 프로젝트 참조로만 쓰고(소스 복사·DLL 참조·Precheck.Helper 참조 없음), 패키지는 기존 도우미와 같은 판', () => {
    const xml = read(CSPROJ)
    expect(includes(xml, 'ProjectReference')).toEqual([
      '../Erp.Core/Erp.Core.csproj',
      '../../../helper/src/Precheck.Core/Precheck.Core.csproj',
      '../../../helper/src/Precheck.Windows/Precheck.Windows.csproj',
    ])
    expect(includes(xml, 'Compile')).toEqual([])
    // 윈도우 기본 탑재 .NET Framework 어셈블리(SqlClient)만 이름으로 참조한다
    expect(includes(xml, 'Reference')).toEqual(['System.Data'])
    expect(xml).not.toMatch(/HintPath|Precheck\.Helper/)
    expect(xml).toMatch(/<PackageReference Include="Microsoft\.NETFramework\.ReferenceAssemblies" Version="1\.0\.3" PrivateAssets="all" \/>/)
  })

  it('AC-3611.1: 옛 런타임 허용 설정(startup useLegacyV2RuntimeActivationPolicy)과 그것을 쓰는 Target이 기존 Precheck.Helper.csproj와 글자 그대로 같다', () => {
    const erp = startupConfig(read(CSPROJ))
    const live = startupConfig(read(LIVE_CSPROJ))
    expect(live.cdata).toBeDefined()
    expect(live.target).toBeDefined()
    expect(erp.cdata).toBe(live.cdata)
    expect(erp.target).toBe(live.target)
  })

  it('AC-3611.1: ErpHelper.sln에 Erp.Helper와 참조하는 기존 Precheck.Windows가 있다', () => {
    const sln = read(SLN)
    for (const project of ['src\\Erp.Helper\\Erp.Helper.csproj', '..\\helper\\src\\Precheck.Windows\\Precheck.Windows.csproj']) {
      expect(sln, project).toContain(`"${project}"`)
    }
  })
})

describe('AC-3611.6 Erp.Helper Release 만들기(workflow zip의 app\\ 자리)', () => {
  // 시험 셋이 같은 빌드 결과를 본다(한 번만 빌드)
  let built: { code: number; output: string } | undefined
  const build = () => (built ??= buildDotnet(CSPROJ, { timeoutMs: 560_000 }))

  it('AC-3611.6: dotnet build -c Release가 경고 없이 통과한다', () => {
    const run = build()
    expect(run.code, tail(run.output)).toBe(0)
    const warnings = run.output.split(/\r?\n/).filter((line) => /:\s*warning\s+[A-Z]+\d+\s*:/i.test(line))
    expect(warnings, warnings.join('\n')).toEqual([])
    for (const m of run.output.matchAll(/(\d+)\s+Warning\(s\)/g)) expect(m[0]).toBe('0 Warning(s)')
  }, 580_000)

  it('AC-3611.6: bin/Release/net48에 SeoseungkwanErpHelper.exe·설정·Erp.Core·Precheck.Core·Precheck.Windows DLL이 생기고 기존 도우미 exe는 없다. exe는 32비트(32BITREQUIRED)', () => {
    const run = build()
    expect(run.code, tail(run.output)).toBe(0)
    for (const file of [`${EXE}.exe`, `${EXE}.exe.config`, 'Erp.Core.dll', 'Precheck.Core.dll', 'Precheck.Windows.dll']) {
      expect(existsSync(path.join(OUT_DIR, file)), `${file}이 ${OUT_DIR}에 없다`).toBe(true)
    }
    expect(existsSync(path.join(OUT_DIR, 'PrecheckHelper.exe'))).toBe(false)
    const flags = clrFlags(readFileSync(path.join(OUT_DIR, `${EXE}.exe`)))
    expect(flags, 'CLR 머리를 찾지 못했다').not.toBeNull()
    expect((flags ?? 0) & COMIMAGE_FLAGS_32BITREQUIRED).toBe(COMIMAGE_FLAGS_32BITREQUIRED)
  }, 580_000)

  it('AC-3611.4: exe.config는 기존 도우미처럼 옛 런타임 허용(startup)이고 System.Text.Json 바인딩 리디렉트도 있다(비트 DLL·Core가 4.8에서 돈다)', () => {
    const run = build()
    expect(run.code, tail(run.output)).toBe(0)
    const file = path.join(OUT_DIR, `${EXE}.exe.config`)
    expect(existsSync(file), `${EXE}.exe.config가 ${OUT_DIR}에 없다`).toBe(true)
    const config = readFileSync(file, 'utf8')
    expect(config.match(/<startup\b/g) ?? []).toHaveLength(1)
    expect(config).toMatch(/<startup\s+useLegacyV2RuntimeActivationPolicy="true"\s*>/)
    const startup = /<startup\b[^>]*>([\s\S]*?)<\/startup>/.exec(config)?.[1] ?? ''
    expect(startup).toMatch(/<supportedRuntime\s+version="v4\.0"\s+sku="\.NETFramework,Version=v4\.8"\s*\/>/)
    expect(config).toMatch(/<assemblyIdentity\s+name="System\.Text\.Json"[^>]*\/>\s*<bindingRedirect\b/)
  }, 580_000)

  // spec erp-uisarang AC-4216.3(TASK-16): 의사랑 엑셀 읽기 패키지(ExcelDataReader 3.9.0, ADR-050)와 그 판이 net48에서 요구하는 dll이
  // exe 옆에 있어야 설치 묶음(workflow가 bin/Release/net48의 *.dll을 모두 싣고 install.ps1이 app 파일을 모두 옮김)에 들어간다.
  // 요구 dll = obj/project.assets.json의 net48 목록에서 ExcelDataReader와 그 의존 패키지의 runtime 파일('_._'는 .NET Framework에 들어 있음)
  it('AC-4216.3: bin/Release/net48에 ExcelDataReader.dll과 그 판이 요구하는 dll이 exe 옆에 있고, CodePages dll은 없다', () => {
    const run = build()
    expect(run.code, tail(run.output)).toBe(0)
    expect(existsSync(path.join(OUT_DIR, 'ExcelDataReader.dll')), `ExcelDataReader.dll이 ${OUT_DIR}에 없다`).toBe(true)
    type Lib = { dependencies?: Record<string, string>; runtime?: Record<string, unknown> }
    const assets = JSON.parse(read('helper-erp/src/Erp.Helper/obj/project.assets.json')) as { targets: Record<string, Record<string, Lib>> }
    const net48 = assets.targets['.NETFramework,Version=v4.8'] ?? assets.targets.net48
    expect(net48, 'project.assets.json에 net48 목록이 없다').toBeDefined()
    const key = (name: string) => Object.keys(net48).find((k) => k.toLowerCase().startsWith(`${name.toLowerCase()}/`))
    expect(key('ExcelDataReader')).toBe('ExcelDataReader/3.9.0')
    const needed = new Set<string>()
    const seen = new Set<string>()
    const walk = (name: string) => {
      const k = key(name)
      if (!k || seen.has(k)) return
      seen.add(k)
      for (const file of Object.keys(net48[k].runtime ?? {})) if (!file.endsWith('/_._')) needed.add(path.posix.basename(file))
      for (const dep of Object.keys(net48[k].dependencies ?? {})) walk(dep)
    }
    walk('ExcelDataReader')
    expect([...needed]).toContain('ExcelDataReader.dll')
    for (const dll of needed) expect(existsSync(path.join(OUT_DIR, dll)), `${dll}이 ${OUT_DIR}에 없다`).toBe(true)
    // .NET Framework 4.8은 코드 페이지가 기본으로 있어 CodePages 패키지는 시험(net10.0)에만 쓴다(ADR-050)
    expect(existsSync(path.join(OUT_DIR, 'System.Text.Encoding.CodePages.dll'))).toBe(false)
    // 설치 묶음: workflow가 그 자리의 *.dll을 모두 싣고, install.ps1은 app 폴더 파일을 모두 옮긴다(지금 그대로)
    expect(read('.github/workflows/helper-erp.yml')).toContain(`Copy-Item -Path "$bin/*.exe", "$bin/*.exe.config", "$bin/*.dll" -Destination $app`)
    expect(read('helper-erp/install/install.ps1')).toContain('Get-ChildItem -LiteralPath $appSource -File | Copy-Item -Destination $installDir -Force')
  }, 580_000)
})
