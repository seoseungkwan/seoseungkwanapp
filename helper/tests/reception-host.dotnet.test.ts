// 늘 켜 두는 프로그램 PrecheckReception.exe(TASK-26, REQ-1411·REQ-1412·REQ-1413)를 감싼다.
// - C# 시험(helper/tests/Precheck.Core.Tests/Reception/ReceptionStart.test.cs, Host 이름 공간): 켜는 차례(ReceptionStart)·진짜 서버·글자 살피기.
//   AC마다 그 AC ID가 붙은 C# 시험이 실제로 돌았고 하나도 실패하지 않았는지 본다
// - AC-1412.5: buildDotnet으로 Precheck.Reception·Precheck.Helper가 net48·x86으로 컴파일되고, PrecheckReception.exe가 창 없는 프로그램(WinExe)이며
//   .exe.config에 옛 런타임 정책이 있는지 본다. 실제 로그인 시작·방화벽·껐다 켜기는 의원 PC에서만 증명된다
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildDotnet, runDotnet } from './runDotnet'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
// 이 TASK의 시험은 Host 이름 공간에만 있다
const FILTER = 'Precheck.Core.Tests.Reception.Host.'
const RECEPTION_CSPROJ = path.join('helper', 'src', 'Precheck.Reception', 'Precheck.Reception.csproj')
const HELPER_CSPROJ = path.join('helper', 'src', 'Precheck.Helper', 'Precheck.Helper.csproj')
const RECEPTION_OUT = path.join(ROOT, 'helper', 'src', 'Precheck.Reception', 'bin', 'Release', 'net48')
const HELPER_OUT = path.join(ROOT, 'helper', 'src', 'Precheck.Helper', 'bin', 'Release', 'net48')

let run: { code: number; output: string } = { code: -1, output: '' }

// 잠금 폴더는 이 서버의 모든 작업 폴더가 같이 쓴다. 다른 쪽 dotnet을 기다리는 시간까지 넉넉히 준다
beforeAll(() => {
  run = runDotnet(FILTER, { timeoutMs: 560_000 })
}, 580_000)

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

// ── PE 머리 읽기 ─────────────────────────────────────────

interface PeInfo {
  /** 선택 머리의 Subsystem(2 = 창 프로그램 GUI, 3 = 콘솔) */
  subsystem: number
  /** CLR 머리(데이터 디렉터리 14번)의 Flags. 없으면 null */
  clrFlags: number | null
}

function readPe(pe: Buffer): PeInfo | null {
  if (pe.length < 0x40 || pe.toString('latin1', 0, 2) !== 'MZ') return null
  const peOffset = pe.readUInt32LE(0x3c)
  if (pe.toString('latin1', peOffset, peOffset + 4) !== 'PE\0\0') return null
  const coff = peOffset + 4
  const sectionCount = pe.readUInt16LE(coff + 2)
  const optionalSize = pe.readUInt16LE(coff + 16)
  const optional = coff + 20
  const magic = pe.readUInt16LE(optional)
  // Subsystem은 PE32·PE32+ 모두 선택 머리 68바이트 자리
  const subsystem = pe.readUInt16LE(optional + 68)
  const dataDirs = optional + (magic === 0x20b ? 112 : 96)
  const clrRva = pe.readUInt32LE(dataDirs + 14 * 8)
  const clrSize = pe.readUInt32LE(dataDirs + 14 * 8 + 4)
  if (clrRva === 0 || clrSize < 20) return { subsystem, clrFlags: null }
  const sections = optional + optionalSize
  for (let i = 0; i < sectionCount; i++) {
    const s = sections + i * 40
    const virtualSize = pe.readUInt32LE(s + 8)
    const virtualAddress = pe.readUInt32LE(s + 12)
    const rawPointer = pe.readUInt32LE(s + 20)
    if (clrRva >= virtualAddress && clrRva < virtualAddress + virtualSize) {
      // IMAGE_COR20_HEADER: cb(4) · 판(2+2) · MetaData(8) · Flags(4)
      return { subsystem, clrFlags: pe.readUInt32LE(rawPointer + (clrRva - virtualAddress) + 16) }
    }
  }
  return { subsystem, clrFlags: null }
}

const COMIMAGE_FLAGS_32BITREQUIRED = 0x2
const IMAGE_SUBSYSTEM_WINDOWS_GUI = 2
const IMAGE_SUBSYSTEM_WINDOWS_CUI = 3

describe('REQ-1411 늘 켜 두기와 처음 열기 (C# Precheck.Core.Tests.Reception.Host)', () => {
  it('AC-1411.1 이 PC 사용자당 하나만 돈다: 뮤텍스 Local\\Seoseungkwan.PrecheckReception을 처음 잡은 쪽만 서버를 켜고, 이미 돌고 있으면 바로 끝난다', () => {
    expectAc('AC-1411.1')
  })

  it('AC-1411.2 인자 없이(시작 항목) 켜면 47200에서 기다리고, 비트 DB가 답하지 않아도 켜져 볼 수 없음이다가 DB가 답하면 저절로 나온다(로그인 확인 없음, 도우미와 같은 부품·data 폴더)', () => {
    expectAc('AC-1411.2')
  })

  it('AC-1411.3 --link: 돌고 있지 않으면 켜고, 이 PC 브라우저로 http://127.0.0.1:47200/link를 연다. 이미 돌고 있으면 열기만 한다', () => {
    expectAc('AC-1411.3')
  })

  it('AC-1411.5 문 47200을 다른 프로그램이 쓰면 E-RECEPTION-PORT-BUSY를 한 번 기록하고 끝난다(다른 문으로 바꾸지 않는다)', () => {
    expectAc('AC-1411.5')
  })

  it('AC-1411.7 [의원 PC] 껐다 켜고 로그인하면 따로 누르지 않아도 된다: 실제 확인은 의원 PC, 여기서는 인자 없이 켜면 창·브라우저 없이 서버를 켜 기다림을 본다', () => {
    expectAc('AC-1411.7')
  })
})

describe('REQ-5707 혼자 등록 --register (C# Precheck.Core.Tests.Reception.Host)', () => {
  it('AC-5707.1 PrecheckReception.exe --register(인자가 정확히 이 하나): 서버·뮤텍스 없이 RegisterFlow(RegisterEntry)를 돌아 저장 0 · 취소 3 · 실패 1, 기록에는 오류 번호만(진짜 비트 로그인·확인 창은 의원 PC AC-5707.6)', () => {
    expectAc('AC-5707.1')
  })
})

describe('REQ-1413 환자 자료는 의원 안에서만 (C# Precheck.Core.Tests.Reception.Host)', () => {
  it('AC-1413.1 Precheck.Reception/**·ReceptionStart에 바깥으로 나가는 연결 API가 없고, 브라우저로 여는 주소는 127.0.0.1의 /link 하나뿐이다', () => {
    expectAc('AC-1413.1')
  })
})

describe('AC-1412.5 PrecheckReception·PrecheckHelper net48·x86 빌드 (buildDotnet)', () => {
  it('AC-1412.5 csproj 모양·옛 런타임 정책 글자·솔루션 등록(C#)', () => {
    expectAc('AC-1412.5')
  })

  it('AC-1412.5 Precheck.Reception.csproj가 Release로 컴파일되어 bin/Release/net48의 PrecheckReception.exe가 x86(32BITREQUIRED)·창 없는 프로그램(GUI 서브시스템)이고 .exe.config에 옛 런타임 정책이 있다(실행은 의원 PC)', () => {
    const built = buildDotnet(RECEPTION_CSPROJ, { timeoutMs: 560_000 })
    expect(built.code, tail(built.output)).toBe(0)
    for (const file of ['PrecheckReception.exe', 'PrecheckReception.exe.config', 'Precheck.Core.dll', 'Precheck.Windows.dll']) {
      expect(existsSync(path.join(RECEPTION_OUT, file)), `${file}이 ${RECEPTION_OUT}에 없다`).toBe(true)
    }
    const pe = readPe(readFileSync(path.join(RECEPTION_OUT, 'PrecheckReception.exe')))
    expect(pe, 'PE 머리를 읽지 못했다').not.toBeNull()
    expect(pe?.subsystem).toBe(IMAGE_SUBSYSTEM_WINDOWS_GUI)
    expect(pe?.clrFlags, 'CLR 머리를 찾지 못했다').not.toBeNull()
    expect((pe?.clrFlags ?? 0) & COMIMAGE_FLAGS_32BITREQUIRED).toBe(COMIMAGE_FLAGS_32BITREQUIRED)

    const config = readFileSync(path.join(RECEPTION_OUT, 'PrecheckReception.exe.config'), 'utf8')
    expect(config.match(/<startup\b/g) ?? []).toHaveLength(1)
    expect(config).toMatch(/<startup\s+useLegacyV2RuntimeActivationPolicy="true"\s*>/)
    const startup = /<startup\b[^>]*>([\s\S]*?)<\/startup>/.exec(config)?.[1] ?? ''
    expect(startup.match(/<supportedRuntime\b/g) ?? []).toHaveLength(1)
    expect(startup).toMatch(/<supportedRuntime\s+version="v4\.0"\s+sku="\.NETFramework,Version=v4\.8"\s*\/>/)
    // 빌드가 만드는 바인딩 리디렉트(Core의 System.Text.Json 등)를 덮어 지우지 않는다
    expect(config).toMatch(/<assemblyIdentity\s+name="System\.Text\.Json"[^>]*\/>\s*<bindingRedirect\b/)
  }, 580_000)

  it('AC-1412.5 Precheck.Helper.csproj도 그대로 Release로 컴파일되어 PrecheckHelper.exe가 x86(32BITREQUIRED)·콘솔 프로그램이다(크롬 통로는 표준 입출력)', () => {
    const built = buildDotnet(HELPER_CSPROJ, { timeoutMs: 560_000 })
    expect(built.code, tail(built.output)).toBe(0)
    const pe = readPe(readFileSync(path.join(HELPER_OUT, 'PrecheckHelper.exe')))
    expect(pe, 'PE 머리를 읽지 못했다').not.toBeNull()
    expect(pe?.subsystem).toBe(IMAGE_SUBSYSTEM_WINDOWS_CUI)
    expect((pe?.clrFlags ?? 0) & COMIMAGE_FLAGS_32BITREQUIRED).toBe(COMIMAGE_FLAGS_32BITREQUIRED)
  }, 580_000)
})
