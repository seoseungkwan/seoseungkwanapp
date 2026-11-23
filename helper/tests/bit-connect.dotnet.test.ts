// 비트 찾기·읽기 전용 접속·기관기호(TASK-5, REQ-005)의 C# 시험을 감싼다.
// - Precheck.Core.Tests.Bit(비트 찾기·서버 이름·SQL 허용 목록·범위·기관기호·bit.check)
// - Precheck.Core.Tests.Registration(등록 파일·확인 창 글·bit.register·등록 확인 관문)
// dotnet test를 이름공간마다 한 번 돌리고, AC마다 그 AC ID가 붙은 C# 시험이 실제로 돌았고 하나도 실패하지 않았는지 본다.
// 윈도우 전용 시험(Precheck.Windows.Tests/Connect: DPAPI 왕복·가짜 폴더로 설치 찾기·가짜 비트 DLL로 접속 정보 읽기)은 Actions 윈도우에서 돈다.
// 이 서버에서는 그 시험이 빌드되는지와 ReadOnlyConnection.cs 글자만 본다(AC-005.2 비트 접속 정보 읽기).
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildDotnet, runDotnet } from './runDotnet'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const WINDOWS_TESTS_CSPROJ = path.join('helper', 'tests', 'Precheck.Windows.Tests', 'Precheck.Windows.Tests.csproj')
const READ_ONLY_CONNECTION = path.join(ROOT, 'helper', 'src', 'Precheck.Windows', 'ReadOnlyConnection.cs')
const VENDOR_PROVIDER_TEST = path.join(ROOT, 'helper', 'tests', 'Precheck.Windows.Tests', 'Connect', 'VendorProvider.test.cs')

const FILTERS = ['Precheck.Core.Tests.Bit', 'Precheck.Core.Tests.Registration'] as const
let runs: { filter: string; code: number; output: string }[] = []

beforeAll(() => {
  runs = FILTERS.map((filter) => ({ filter, ...runDotnet(filter, { timeoutMs: 280_000 }) }))
}, 600_000)

function count(prefix: 'Passed' | 'Failed', ac: string): number {
  const escaped = ac.replace(/\./g, '\\.')
  const pattern = new RegExp(`^\\s*${prefix} ${escaped}\\b`, 'gm')
  return runs.reduce((sum, run) => sum + (run.output.match(pattern) ?? []).length, 0)
}

function tail(text: string): string {
  return text.split('\n').slice(-40).join('\n')
}

function expectAc(ac: string) {
  for (const run of runs) expect(run.code, `${run.filter}\n${tail(run.output)}`).toBe(0)
  const all = runs.map((run) => tail(run.output)).join('\n')
  expect(count('Failed', ac), all).toBe(0)
  expect(count('Passed', ac), `${ac} 시험이 돌지 않았다\n${all}`).toBeGreaterThan(0)
}

describe('REQ-005 비트 연결·기관기호 (C# Precheck.Core.Tests.Bit · Registration)', () => {
  it('AC-005.1 가짜 설치 후보·파일 모양으로 원본 InstallationLocator·NativeEnvironmentGuard 규칙대로 고르고, 못 찾으면 E-BIT-NOT-FOUND', () => {
    expectAc('AC-005.1')
  })

  it('AC-005.2 DB 서버는 .·(local)·localhost·이 PC 이름·사설 IPv4(tcp: 허용)만, 그 밖은 E-BIT-DB-FAILED, ConnectTimeout=10', () => {
    expectAc('AC-005.2')
  })

  it('AC-005.3 ReadOnlyGuard: Sql.cs 상수(원본 사본과 공백만 다름)만 정해 둔 매개변수로, 그 밖의 SQL은 돌리지 않음', () => {
    expectAc('AC-005.3')
  })

  it('AC-005.4 범위가 정확히 하나, 기관기호가 모두 8자리 숫자이고 등록한 것과 같을 때만 통과(원본 시험 사례)', () => {
    expectAc('AC-005.4')
  })

  it('AC-005.5 bit.register: 비트 로그인 → PC 확인 창 [확인]일 때만 registration.dat 저장(병원 이름은 저장하지 않음)·{registered: true}, 다시 등록은 전·새 값을 함께 보이고 같은 기관기호면 프로필 ID 유지', () => {
    expectAc('AC-005.5')
  })

  it('AC-005.6 읽기·입력 명령 전 오늘 날짜로 다시 확인: 등록 없음 E-BIT-NOT-REGISTERED, 다르면 E-BIT-HOSPITAL-MISMATCH', () => {
    expectAc('AC-005.6')
  })

  it('AC-005.7 bit.check: steps find·db·registration을 {name, ok, code?}로, 실패한 단계 뒤는 ok:false·그 번호, 등록됐으면 기관기호만(병원 이름은 주지 않음)', () => {
    expectAc('AC-005.7')
  })

  it('AC-005.13 처음 등록은 계정과 상관없이 DB 안 의원 하나로(빈 값 뺌), 막는 것은 E-BIT-REG-NONE·MANY·CODE·PLACE뿐, 매번 확인·통계 확인도 같은 기준', () => {
    expectAc('AC-005.13')
  })
})

/** 주석(//·///·블록 주석)을 뺀 C# 글자. ReadOnlyConnection.cs의 문자열 안에는 //가 없다 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

// 원본 ReadOnlyConnection: `private sealed class Provider : BITDataBaseCommon { public Provider() : base(null) {} }` → protected bitGetConnection().
// 도우미 0.1.0은 BITDataBaseCommon의 생성자를 리플렉션으로 바로 불러, 그 형이 추상이면 늘 E-BIT-DB-FAILED였다(design.md 16절 위험)
describe('AC-005.2 비트 접속 정보: 원본 Provider처럼 BITDataBaseCommon을 물려받은 형으로 읽는다', () => {
  it('AC-005.2 가짜 추상 BITDataBaseCommon DLL로 읽는 윈도우 시험(VendorProvider.test.cs)이 이 서버에서도 빌드된다(실행은 Actions 윈도우)', () => {
    const run = buildDotnet(WINDOWS_TESTS_CSPROJ, { timeoutMs: 280_000 })
    expect(run.code, tail(run.output)).toBe(0)
    const test = readFileSync(VENDOR_PROVIDER_TEST, 'utf8')
    expect(test).toMatch(/public abstract class BITDataBaseCommon\b/)
    expect(test).toMatch(/protected BITDataBaseCommon\(object owner\)/)
    expect(test).toMatch(/protected SqlConnection bitGetConnection\(\)/)
    expect(test).toContain('DisplayName = "AC-005.2 추상 BITDataBaseCommon')
  }, 300_000)

  it('AC-005.2 ReadOnlyConnection.cs는 비트 형의 생성자를 바로 부르지 않고, 실행 때 물려받은 형(AssemblyBuilderAccess.Run · 생성자 base(null))을 만든다', () => {
    const code = stripComments(readFileSync(READ_ONLY_CONNECTION, 'utf8'))
    expect(code).toContain('AssemblyBuilderAccess.Run')
    expect(code).toMatch(/\.DefineType\(/)
    expect(code).toMatch(/OpCodes\.Ldarg_0[\s\S]*OpCodes\.Ldnull[\s\S]*OpCodes\.Call[\s\S]*OpCodes\.Ret/)
    // 0.1.0의 길: 비트 형의 생성자를 null 하나로 바로 불렀다
    expect(code).not.toMatch(/\.Invoke\(\s*new object\?\[\]\s*\{\s*null\s*\}\s*\)/)
  })
})
